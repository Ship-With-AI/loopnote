import { randomBytes } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';

import { ChangedFileSchema } from '../contracts/comparison.js';
import type { ChangedFile, ChangedFileStatusKind } from '../contracts/comparison.js';
import type { ExactPath } from '../domain/path-bytes.js';
import { createExactPath, decodeBase64url } from '../domain/path-bytes.js';
import type { Availability, AvailabilityInput } from './availability.js';
import { MAX_INLINE_TEXT_BYTES, classifyAvailability } from './availability.js';
import {
  inventoryPaths,
  isCumpaInternalPath,
  opaqueFileId,
  validateObjectFormat,
} from './inventory.js';
import { createObjectReader } from './objects.js';
import type { ObjectReader } from './objects.js';
import { joinDiffStats, parseNumstat } from './numstat.js';
import type { JoinedDiffStat } from './numstat.js';
import { parseRawDiff } from './raw-diff.js';
import type { RawDiffRecord } from './raw-diff.js';
import { createGitRunner } from './runner.js';
import type { GitRunner } from './runner.js';

export interface CreateWorktreeChangedFileInventoryOptions {
  readonly sourceKind: 'staged' | 'unstaged' | 'worktree';
  readonly repositoryRoot: string;
  readonly mergeBaseOid?: string;
  readonly objectFormat: 'sha1' | 'sha256';
  readonly signal?: AbortSignal;
  readonly fileIdNamespace?: Uint8Array;
  readonly pathspecs?: readonly string[];
}

export interface WorktreeChangedFileInventoryDependencies {
  readonly runner?: GitRunner;
  readonly objectReader?: ObjectReader;
}

const emptyPathspecs: readonly string[] = Object.freeze([]);

const processFileIdNamespace = randomBytes(32);

const knownModes: Readonly<Record<string, true>> = Object.freeze({
  '000000': true,
  '040000': true,
  '100644': true,
  '100755': true,
  '120000': true,
  '160000': true,
});
const statusKindByCode: Readonly<
  Partial<Record<string, ChangedFileStatusKind>>
> = Object.freeze({
  A: 'added',
  C: 'copied',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  T: 'type-changed',
});
const regularFileModes: Readonly<Record<string, true>> = Object.freeze({
  '100644': true,
  '100755': true,
});

const sharedDiffOptions = [
  '-z',
  '--find-renames=50%',
  '--find-copies=50%',
  '--find-copies-harder',
  '--no-ext-diff',
  '--no-textconv',
] as const;

type AvailabilityClassificationInput = AvailabilityInput & {
  readonly oldPath?: ExactPath;
  readonly newPath?: ExactPath;
};

function filterCumpaInternal(
  joined: readonly JoinedDiffStat[],
): readonly JoinedDiffStat[] {
  return joined.filter(({ diff }) => {
    const { oldPath, newPath } = inventoryPaths(diff);
    return !isCumpaInternalPath(oldPath) && !isCumpaInternalPath(newPath);
  });
}

async function buildChangedFile(
  diff: RawDiffRecord,
  stats: { readonly additions: number | null; readonly deletions: number | null },
  objectFormat: 'sha1' | 'sha256',
  namespace: Uint8Array,
  classify: (file: AvailabilityClassificationInput) => Promise<Availability>,
): Promise<ChangedFile> {
  validateObjectFormat(diff, objectFormat);
  const knownStatus = statusKindByCode[diff.status];
  const hasUnsupportedMetadata =
    knownStatus === undefined ||
    knownModes[diff.oldMode] !== true ||
    knownModes[diff.newMode] !== true;
  const statusKind: ChangedFileStatusKind = hasUnsupportedMetadata
    ? 'unsupported'
    : knownStatus;
  const file = {
    id: opaqueFileId(namespace, diff),
    status: {
      code: diff.status,
      kind: statusKind,
      similarity: diff.similarity,
    },
    oldMode: diff.oldMode,
    newMode: diff.newMode,
    oldBlobOid: diff.oldBlobOid,
    newBlobOid: diff.newBlobOid,
    ...inventoryPaths(diff),
    additions: stats.additions,
    deletions: stats.deletions,
  };
  const availability = await classify(file);
  return ChangedFileSchema.parse({ ...file, availability });
}

type WorktreeLeaf =
  | { readonly kind: 'missing' }
  | { readonly kind: 'symlink' }
  | { readonly kind: 'file'; readonly size: number; readonly executable: boolean };

/**
 * Walks each path segment with `lstat`, rejecting any intermediate component
 * that is a symlink (or not a directory) before resolving the leaf — the same
 * per-segment traversal discipline as `PatchSnapshot.worktreeEntry()`
 * (`src/server/patch-snapshot.ts:186-216`), duplicated here (not imported)
 * because `src/git/` never depends on `src/server/`.
 */
async function lstatWorktreeLeaf(
  repositoryRoot: string,
  path: ExactPath,
): Promise<WorktreeLeaf> {
  const parts = Buffer.from(decodeBase64url(path.bytesBase64url))
    .toString('latin1')
    .split('/');
  let current = Buffer.from(repositoryRoot, 'utf8');
  try {
    for (const [index, part] of parts.entries()) {
      current = Buffer.concat([
        current,
        Buffer.from('/', 'ascii'),
        Buffer.from(part, 'latin1'),
      ]);
      const info = await lstat(current);
      if (index < parts.length - 1) {
        if (info.isSymbolicLink() || !info.isDirectory()) {
          return { kind: 'missing' };
        }
        continue;
      }
      if (info.isSymbolicLink()) {
        return { kind: 'symlink' };
      }
      if (!info.isFile()) {
        return { kind: 'missing' };
      }
      return {
        kind: 'file',
        size: info.size,
        executable: (info.mode & 0o111) !== 0,
      };
    }
    return { kind: 'missing' };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'missing' };
    }
    throw error;
  }
}

/**
 * Bounded read-then-verify: open the resolved leaf path, confirm it is still
 * a regular file of exactly `expectedSize` bytes, and read no more than that
 * (via the `expectedSize + 1` over-read trick to detect concurrent growth) —
 * identical discipline to `boundedFileBytes()` (`src/server/snapshot-fs.ts`),
 * duplicated here for the same layering reason as `lstatWorktreeLeaf`.
 */
async function readWorktreeLeafBytes(
  repositoryRoot: string,
  path: ExactPath,
  expectedSize: number,
): Promise<Buffer | undefined> {
  const absolutePath = Buffer.concat([
    Buffer.from(repositoryRoot, 'utf8'),
    Buffer.from('/', 'ascii'),
    Buffer.from(decodeBase64url(path.bytesBase64url)),
  ]);
  let handle;
  try {
    handle = await open(absolutePath, 'r');
  } catch {
    return undefined;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== expectedSize) {
      return undefined;
    }
    const bytes = Buffer.allocUnsafe(expectedSize + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    if (offset !== expectedSize) {
      return undefined;
    }
    return bytes.subarray(0, expectedSize);
  } finally {
    await handle.close();
  }
}

/**
 * Mirrors `classifyAvailability()`'s cascade (mode/status checks, size
 * ceiling, numstat binary flag, embedded-NUL check, strict UTF-8 decode) but
 * substitutes a bounded `fs` read for the one side that is worktree-resident
 * (not a Git object) instead of going through `ObjectReader`. The other side
 * (when present) still goes through `objectReader` unchanged. `hasNumstat`
 * is `false` for untracked files, which have no numstat line at all (their
 * `additions`/`deletions` are always `null` by construction, not a binary
 * signal) — those fall through to the real embedded-NUL content check instead.
 */
async function classifyWorktreeSideAvailability(
  file: AvailabilityClassificationInput,
  objectReader: ObjectReader,
  worktreeSide: 'old' | 'new',
  repositoryRoot: string,
  signal?: AbortSignal,
  hasNumstat = true,
): Promise<Availability> {
  if (file.oldMode === '160000' || file.newMode === '160000') {
    return { kind: 'unsupported', reason: 'submodule' };
  }
  if (file.oldMode === '120000' || file.newMode === '120000') {
    return { kind: 'unsupported', reason: 'symlink' };
  }
  if (file.status.kind === 'unsupported') {
    return { kind: 'unsupported', reason: 'mode-or-type' };
  }

  type Side = { readonly side: 'old' | 'new'; readonly mode: string; readonly oid: string };
  const sides: Side[] = [];
  if (file.oldMode !== '000000') {
    if (regularFileModes[file.oldMode] !== true) {
      return { kind: 'unsupported', reason: 'mode-or-type' };
    }
    sides.push({ side: 'old', mode: file.oldMode, oid: file.oldBlobOid });
  }
  if (file.newMode !== '000000') {
    if (regularFileModes[file.newMode] !== true) {
      return { kind: 'unsupported', reason: 'mode-or-type' };
    }
    sides.push({ side: 'new', mode: file.newMode, oid: file.newBlobOid });
  }
  if (sides.length === 0) {
    return { kind: 'unsupported', reason: 'mode-or-type' };
  }

  const sizes: number[] = [];
  for (const side of sides) {
    if (side.side === worktreeSide) {
      const path = worktreeSide === 'new' ? file.newPath : file.oldPath;
      if (path === undefined) {
        return { kind: 'unavailable', reason: 'missing-object' };
      }
      const leaf = await lstatWorktreeLeaf(repositoryRoot, path);
      if (leaf.kind !== 'file') {
        return { kind: 'unavailable', reason: 'missing-object' };
      }
      sizes.push(leaf.size);
    } else {
      const metadata = await objectReader.inspect(side.oid, signal);
      if (metadata.kind === 'missing' || metadata.objectType !== 'blob') {
        return { kind: 'unavailable', reason: 'missing-object' };
      }
      sizes.push(metadata.size);
    }
  }
  if (sizes.some((size) => size > MAX_INLINE_TEXT_BYTES)) {
    return { kind: 'unsupported', reason: 'oversized' };
  }
  if (hasNumstat && (file.additions === null || file.deletions === null)) {
    return { kind: 'unsupported', reason: 'binary' };
  }

  const contents: Buffer[] = [];
  for (let index = 0; index < sides.length; index += 1) {
    const side = sides[index]!;
    if (side.side === worktreeSide) {
      const path = worktreeSide === 'new' ? file.newPath : file.oldPath;
      const bytes =
        path === undefined
          ? undefined
          : await readWorktreeLeafBytes(repositoryRoot, path, sizes[index]!);
      if (bytes === undefined) {
        return { kind: 'unavailable', reason: 'missing-object' };
      }
      contents.push(bytes);
    } else {
      const content = await objectReader.read(side.oid, {
        maxBytes: MAX_INLINE_TEXT_BYTES,
        signal,
      });
      if (
        content.kind === 'missing' ||
        content.bytes.byteLength !== sizes[index]
      ) {
        return { kind: 'unavailable', reason: 'missing-object' };
      }
      contents.push(content.bytes);
    }
  }
  if (contents.some((content) => content.includes(0))) {
    return { kind: 'unsupported', reason: 'binary' };
  }

  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (const content of contents) {
      utf8Decoder.decode(content);
    }
  } catch {
    return { kind: 'unsupported', reason: 'non-utf8' };
  }
  return { kind: 'text' };
}

function parseNulDelimitedUntrackedPaths(output: Buffer): readonly ExactPath[] {
  const paths: ExactPath[] = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    if (end === -1) {
      break;
    }
    if (end > offset) {
      paths.push(createExactPath(output.subarray(offset, end)));
    }
    offset = end + 1;
  }
  return Object.freeze(paths);
}

export async function buildUntrackedChangedFile(
  path: ExactPath,
  objectFormat: 'sha1' | 'sha256',
  namespace: Uint8Array,
  objectReader: ObjectReader,
  repositoryRoot: string,
  signal: AbortSignal | undefined,
): Promise<ChangedFile> {
  const leaf = await lstatWorktreeLeaf(repositoryRoot, path);
  const newMode =
    leaf.kind === 'symlink'
      ? '120000'
      : leaf.kind === 'file' && leaf.executable
        ? '100755'
        : '100644';
  const zeroOid = '0'.repeat(objectFormat === 'sha1' ? 40 : 64);
  const diff: RawDiffRecord = Object.freeze({
    oldMode: '000000',
    newMode,
    oldBlobOid: zeroOid,
    newBlobOid: zeroOid,
    status: 'A',
    similarity: null,
    paths: Object.freeze([path]) as readonly [ExactPath],
  });
  return buildChangedFile(
    diff,
    { additions: null, deletions: null },
    objectFormat,
    namespace,
    (file) =>
      classifyWorktreeSideAvailability(
        file,
        objectReader,
        'new',
        repositoryRoot,
        signal,
        false,
      ),
  );
}

export async function createWorktreeChangedFileInventory(
  options: CreateWorktreeChangedFileInventoryOptions,
  dependencies: WorktreeChangedFileInventoryDependencies = {},
): Promise<readonly ChangedFile[]> {
  const pathspecTail = Object.freeze([
    '--',
    ...(options.pathspecs ?? emptyPathspecs),
  ]);
  const runner = dependencies.runner ?? createGitRunner();
  const objectReader =
    dependencies.objectReader ??
    createObjectReader(options.repositoryRoot, { runner });
  const namespace = options.fileIdNamespace ?? processFileIdNamespace;
  if (namespace.byteLength === 0) {
    throw new RangeError('File ID namespace must not be empty');
  }

  if (options.sourceKind === 'staged') {
    const mergeBaseOid = options.mergeBaseOid;
    if (mergeBaseOid === undefined) {
      throw new RangeError(
        'mergeBaseOid is required when sourceKind is "staged"',
      );
    }
    const [rawResult, numstatResult] = await Promise.all([
      runner.run(
        [
          'diff',
          '--cached',
          '--raw',
          sharedDiffOptions[0],
          '--no-abbrev',
          ...sharedDiffOptions.slice(1),
          mergeBaseOid,
          ...pathspecTail,
        ],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
      runner.run(
        [
          'diff',
          '--cached',
          '--numstat',
          ...sharedDiffOptions,
          mergeBaseOid,
          ...pathspecTail,
        ],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
    ]);
    const joined = joinDiffStats(
      parseRawDiff(rawResult.stdout),
      parseNumstat(numstatResult.stdout),
    );
    const reviewable = filterCumpaInternal(joined);
    const files = await Promise.all(
      reviewable.map(({ diff, stats }) =>
        buildChangedFile(diff, stats, options.objectFormat, namespace, (file) =>
          classifyAvailability(file, objectReader, options.signal),
        ),
      ),
    );
    return Object.freeze(files);
  }

  if (options.sourceKind === 'unstaged') {
    const [rawResult, numstatResult] = await Promise.all([
      runner.run(
        [
          'diff',
          '--raw',
          sharedDiffOptions[0],
          '--no-abbrev',
          ...sharedDiffOptions.slice(1),
          ...pathspecTail,
        ],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
      runner.run(
        ['diff', '--numstat', ...sharedDiffOptions, ...pathspecTail],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
    ]);
    const joined = joinDiffStats(
      parseRawDiff(rawResult.stdout),
      parseNumstat(numstatResult.stdout),
    );
    const reviewable = filterCumpaInternal(joined);
    const files = await Promise.all(
      reviewable.map(({ diff, stats }) =>
        buildChangedFile(diff, stats, options.objectFormat, namespace, (file) =>
          classifyWorktreeSideAvailability(
            file,
            objectReader,
            'new',
            options.repositoryRoot,
            options.signal,
          ),
        ),
      ),
    );
    return Object.freeze(files);
  }

  if (options.sourceKind === 'worktree') {
    const mergeBaseOid = options.mergeBaseOid;
    if (mergeBaseOid === undefined) {
      throw new RangeError(
        'mergeBaseOid is required when sourceKind is "worktree"',
      );
    }
    const [rawResult, numstatResult, untrackedResult] = await Promise.all([
      runner.run(
        [
          'diff',
          '--raw',
          sharedDiffOptions[0],
          '--no-abbrev',
          ...sharedDiffOptions.slice(1),
          mergeBaseOid,
          ...pathspecTail,
        ],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
      runner.run(
        [
          'diff',
          '--numstat',
          ...sharedDiffOptions,
          mergeBaseOid,
          ...pathspecTail,
        ],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
      runner.run(
        ['ls-files', '--others', '--exclude-standard', '-z', ...pathspecTail],
        { cwd: options.repositoryRoot, signal: options.signal },
      ),
    ]);
    const joined = joinDiffStats(
      parseRawDiff(rawResult.stdout),
      parseNumstat(numstatResult.stdout),
    );
    const reviewable = filterCumpaInternal(joined);
    const trackedFiles = await Promise.all(
      reviewable.map(({ diff, stats }) =>
        buildChangedFile(diff, stats, options.objectFormat, namespace, (file) =>
          classifyWorktreeSideAvailability(
            file,
            objectReader,
            'new',
            options.repositoryRoot,
            options.signal,
          ),
        ),
      ),
    );

    const untrackedPaths = parseNulDelimitedUntrackedPaths(
      untrackedResult.stdout,
    ).filter((path) => !isCumpaInternalPath(path));
    const untrackedFiles = await Promise.all(
      untrackedPaths.map((path) =>
        buildUntrackedChangedFile(
          path,
          options.objectFormat,
          namespace,
          objectReader,
          options.repositoryRoot,
          options.signal,
        ),
      ),
    );

    return Object.freeze([...trackedFiles, ...untrackedFiles]);
  }
  throw new RangeError('Unreachable: sourceKind must be staged, unstaged, or worktree');
}
