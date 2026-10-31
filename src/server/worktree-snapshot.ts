import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import {
  ChangedFileSchema,
  GitObjectIdSchema,
  type ChangedFile,
  type UncommittedScope,
} from '../contracts/comparison.js';
import { decodeBase64url } from '../domain/path-bytes.js';
import { blobOid } from '../git/exact-patch.js';
import { createObjectReader } from '../git/objects.js';
import type { ObjectReader } from '../git/objects.js';
import { createGitRunner } from '../git/runner.js';
import type { GitRunner } from '../git/runner.js';
import { createWorktreeChangedFileInventory } from '../git/worktree-inventory.js';
import { resolveWorktreeSideContent } from '../git/worktree-content.js';

import { boundedFileBytes, digest, isMissing, syncDirectory, writeOwned, MAX_SIDE_BYTES } from './snapshot-fs.js';

const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_FILES = 10_000;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const strictText = new TextDecoder('utf-8', { fatal: true });

const WorktreeExactPathSchema = z.strictObject({
  bytesBase64url: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  display: z.string(),
  utf8: z.string().optional(),
}).readonly();

export const WorktreeSnapshotSideSchema = z.discriminatedUnion('exists', [
  z.strictObject({
    exists: z.literal(false),
    mode: z.string().regex(/^[0-7]{6}$/u),
    blobOid: GitObjectIdSchema,
    byteLength: z.literal(0),
  }).readonly(),
  z.strictObject({
    exists: z.literal(true),
    path: WorktreeExactPathSchema,
    mode: z.string().regex(/^[0-7]{6}$/u),
    blobOid: GitObjectIdSchema,
    language: z.string().min(1),
    byteLength: z.number().int().nonnegative().max(MAX_SIDE_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).readonly(),
]).readonly();

export const WorktreeSnapshotEntrySchema = z.strictObject({
  file: ChangedFileSchema,
  preimage: WorktreeSnapshotSideSchema,
  postimage: WorktreeSnapshotSideSchema,
  captureStatus: z.enum(['captured', 'changed-during-capture']),
}).readonly();

export const WorktreeSnapshotManifestSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
  repositoryIdentity: z.string().min(1),
  baseCommitOid: GitObjectIdSchema.optional(),
  objectFormat: z.enum(['sha1', 'sha256']),
  entries: z.array(WorktreeSnapshotEntrySchema).max(MAX_SNAPSHOT_FILES).readonly(),
  chain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
  provenanceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
}).superRefine((manifest, context) => {
  const hasBase = manifest.baseCommitOid !== undefined;
  if (manifest.sourceKind === 'unstaged') {
    if (hasBase) {
      context.addIssue({
        code: 'custom',
        message: 'Unstaged snapshots must not carry a base commit.',
        path: ['baseCommitOid'],
      });
    }
  } else if (!hasBase) {
    context.addIssue({
      code: 'custom',
      message: 'Staged and Working tree snapshots require a base commit.',
      path: ['baseCommitOid'],
    });
  }
}).readonly();

export type WorktreeSnapshotSide = z.infer<typeof WorktreeSnapshotSideSchema>;
export type WorktreeSnapshotEntry = z.infer<typeof WorktreeSnapshotEntrySchema>;
export type WorktreeSnapshotManifest = z.infer<typeof WorktreeSnapshotManifestSchema>;

export class WorktreeSnapshotError extends Error {
  public constructor(
    readonly code: 'retryable-read' | 'snapshot-unavailable',
    readonly retryable: boolean,
  ) {
    super(
      code === 'retryable-read'
        ? 'Frozen worktree snapshot file temporarily unavailable.'
        : 'Frozen worktree snapshot is unavailable.',
    );
  }
}

function manifestDigest(manifest: Omit<WorktreeSnapshotManifest, 'provenanceDigest'>): string {
  return digest(Buffer.from(JSON.stringify(manifest), 'utf8'));
}

// The chain-entry digest covers one capture's own content only (never the
// `chain` array itself, which wraps a sequence of these digests) — computed
// identically at every capture site so the chain stays a meaningful,
// reproducible fingerprint sequence (D-18).
function captureDigest(manifest: Omit<WorktreeSnapshotManifest, 'chain' | 'provenanceDigest'>): string {
  return digest(Buffer.from(JSON.stringify(manifest), 'utf8'));
}

function languageForPath(path: ChangedFile['oldPath']): string {
  const extension = path?.utf8?.split('.').at(-1);
  return extension === undefined
    ? 'plaintext'
    : extension === 'ts'
      ? 'typescript'
      : extension === 'js'
        ? 'javascript'
        : extension === 'json'
          ? 'json'
          : extension === 'md'
            ? 'markdown'
            : 'plaintext';
}

function side(
  bytes: Buffer | undefined,
  path: ChangedFile['oldPath'],
  mode: string,
  entryBlobOid: string,
): WorktreeSnapshotSide {
  return bytes === undefined
    ? WorktreeSnapshotSideSchema.parse({ exists: false, mode, blobOid: entryBlobOid, byteLength: 0 })
    : WorktreeSnapshotSideSchema.parse({
        exists: true,
        path,
        mode,
        blobOid: entryBlobOid,
        language: languageForPath(path),
        byteLength: bytes.byteLength,
        sha256: digest(bytes),
      });
}

function pathKey(file: ChangedFile): string {
  return (file.newPath ?? file.oldPath)?.bytesBase64url ?? file.id;
}

export interface CaptureFileRetryDependencies {
  readonly onAttempt?: (attempt: number) => Promise<void> | void;
}

/**
 * Bracket-and-retry capture of one worktree-resident side's bytes (Required
 * Focus 3(a)): `lstat` before, produce bytes, `lstat` after, retry on
 * mismatch up to `maxAttempts` total attempts with `retryDelayMs` between
 * attempts. Returns `{ torn: true }` (never a partial/mixed buffer) if the
 * file is still unstable after every attempt.
 */
async function captureFileWithRetry(
  readBytes: (before: Readonly<{ readonly size: number; readonly mtimeMs: number }>) => Promise<Buffer>,
  statPath: Buffer,
  dependencies: CaptureFileRetryDependencies = {},
  maxAttempts = 3,       // 1 initial + 2 retries (D-09 discretion)
  retryDelayMs = 10,     // short fixed delay, not exponential
): Promise<{ bytes: Buffer; sha256: string } | { torn: true }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const before = await lstat(statPath);
      await dependencies.onAttempt?.(attempt);
      const bytes = await readBytes(before);
      const after = await lstat(statPath);
      if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
        return { bytes, sha256: digest(bytes) };
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      // ENOENT: file disappeared/replaced mid-capture — legitimate race, fall through to retry.
    }
    if (attempt < maxAttempts - 1) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, retryDelayMs);
      await promise;
    }
  }
  return { torn: true };
}

export interface CaptureWorktreeManifestDependencies {
  readonly runner?: GitRunner;
  readonly objectReader?: ObjectReader;
  readonly onCaptureStart?: () => Promise<void> | void;
  readonly onFileReadAttempt?: (fileId: string, attempt: number) => Promise<void> | void;
  readonly onBeforeObservedEnumeration?: () => Promise<void> | void;
}

interface WorktreeManifestCapture {
  readonly manifest: Omit<WorktreeSnapshotManifest, 'chain' | 'provenanceDigest'>;
  readonly contents: ReadonlyMap<string, Readonly<{ readonly preimage?: Buffer; readonly postimage?: Buffer }>>;
}

async function readObjectBackedSide(
  objectReader: ObjectReader,
  oid: string,
): Promise<Buffer | undefined> {
  const content = await objectReader.read(oid, { maxBytes: MAX_SIDE_BYTES });
  return content.kind === 'available' ? Buffer.from(content.bytes) : undefined;
}

/**
 * Implements Required Focus 3(b): enumerate the expected file set once,
 * capture every file's content (object-backed sides via `ObjectReader`,
 * worktree-resident sides via `resolveWorktreeSideContent`/bounded raw read
 * wrapped in `captureFileWithRetry`), then enumerate the observed file set a
 * second time and force any expected-but-now-missing file to
 * `'changed-during-capture'` rather than silently dropping it (D-10).
 */
async function captureWorktreeManifest(
  scope: UncommittedScope,
  repositoryRoot: string,
  dependencies: CaptureWorktreeManifestDependencies = {},
): Promise<WorktreeManifestCapture> {
  if (scope.sourceKind === 'standalone') {
    throw new RangeError(
      'Unreachable: captureWorktreeManifest does not support standalone scopes; standalone sessions use a dedicated capture path.',
    );
  }
  const runner = dependencies.runner ?? createGitRunner();
  const objectReader = dependencies.objectReader ?? createObjectReader(repositoryRoot, { runner });
  await dependencies.onCaptureStart?.();
  const expected = await createWorktreeChangedFileInventory(
    {
      sourceKind: scope.sourceKind,
      repositoryRoot,
      mergeBaseOid: scope.mergeBaseOid,
      objectFormat: scope.objectFormat,
    },
    { runner, objectReader },
  );
  if (expected.length > MAX_SNAPSHOT_FILES) throw new WorktreeSnapshotError('snapshot-unavailable', false);

  interface Intermediate {
    readonly file: ChangedFile;
    readonly torn: boolean;
    readonly preimageBytes?: Buffer;
    readonly postimageBytes?: Buffer;
  }

  const intermediate: Intermediate[] = [];
  let totalBytes = 0;

  for (const file of expected) {
    if (file.availability.kind !== 'text') {
      intermediate.push({ file, torn: false });
      continue;
    }

    const preimageBytes = file.oldMode === '000000'
      ? undefined
      : await readObjectBackedSide(objectReader, file.oldBlobOid);

    let postimageBytes: Buffer | undefined;
    let torn = false;

    if (file.newMode !== '000000') {
      if (scope.sourceKind === 'staged') {
        postimageBytes = await readObjectBackedSide(objectReader, file.newBlobOid);
      } else {
        const path = file.newPath ?? file.oldPath;
        if (path === undefined) throw new Error('Changed file is missing a path for its existing side.');
        const resolvedDiskPath = Buffer.concat([
          Buffer.from(repositoryRoot, 'utf8'),
          Buffer.from('/'),
          Buffer.from(decodeBase64url(path.bytesBase64url)),
        ]);
        const pathString = path.utf8 ?? path.display;
        const endpoint = scope.sourceKind === 'unstaged' ? undefined : scope.baseCommitOid;
        const captured = await captureFileWithRetry(
          async (before) => {
            try {
              const result = await resolveWorktreeSideContent(
                { repositoryRoot, path: pathString, scope: 'worktree', endpoint, objectFormat: scope.objectFormat },
                { runner },
              );
              return result.bytes;
            } catch {
              return boundedFileBytes(resolvedDiskPath, before.size);
            }
          },
          resolvedDiskPath,
          { onAttempt: (attempt) => dependencies.onFileReadAttempt?.(file.id, attempt) },
        );
        if ('torn' in captured) {
          torn = true;
        } else {
          postimageBytes = captured.bytes;
        }
      }
    }

    totalBytes += (preimageBytes?.byteLength ?? 0) + (postimageBytes?.byteLength ?? 0);
    if (totalBytes > MAX_SNAPSHOT_BYTES) throw new WorktreeSnapshotError('snapshot-unavailable', false);

    intermediate.push({ file, torn, preimageBytes, postimageBytes });
  }

  await dependencies.onBeforeObservedEnumeration?.();
  const observed = await createWorktreeChangedFileInventory(
    {
      sourceKind: scope.sourceKind,
      repositoryRoot,
      mergeBaseOid: scope.mergeBaseOid,
      objectFormat: scope.objectFormat,
    },
    { runner, objectReader },
  );
  const observedKeys = new Set(observed.map((file) => pathKey(file)));

  const entries: WorktreeSnapshotEntry[] = [];
  const contents = new Map<string, Readonly<{ preimage?: Buffer; postimage?: Buffer }>>();

  for (const record of intermediate) {
    const disappeared = !observedKeys.has(pathKey(record.file));
    const captureStatus: WorktreeSnapshotEntry['captureStatus'] =
      record.torn || disappeared ? 'changed-during-capture' : 'captured';
    const frozenFile = ChangedFileSchema.parse(
      captureStatus === 'changed-during-capture'
        ? { ...record.file, availability: { kind: 'unsupported', reason: 'changed-during-capture' } }
        : record.file,
    );
    const preimageBytes = captureStatus === 'captured' ? record.preimageBytes : undefined;
    const postimageBytes = captureStatus === 'captured' ? record.postimageBytes : undefined;
    const preimageBlobOid = frozenFile.oldMode === '000000' || preimageBytes === undefined
      ? frozenFile.oldBlobOid
      : scope.sourceKind === 'staged'
        ? frozenFile.oldBlobOid
        : blobOid(preimageBytes, scope.objectFormat);
    const postimageBlobOid = frozenFile.newMode === '000000' || postimageBytes === undefined
      ? frozenFile.newBlobOid
      : scope.sourceKind === 'staged'
        ? frozenFile.newBlobOid
        : blobOid(postimageBytes, scope.objectFormat);

    entries.push(WorktreeSnapshotEntrySchema.parse({
      file: frozenFile,
      preimage: side(preimageBytes, frozenFile.oldPath, frozenFile.oldMode, preimageBlobOid),
      postimage: side(postimageBytes, frozenFile.newPath, frozenFile.newMode, postimageBlobOid),
      captureStatus,
    }));

    if (preimageBytes !== undefined || postimageBytes !== undefined) {
      contents.set(frozenFile.id, Object.freeze({ preimage: preimageBytes, postimage: postimageBytes }));
    }
  }

  return {
    manifest: {
      version: SNAPSHOT_VERSION,
      sourceKind: scope.sourceKind,
      repositoryIdentity: repositoryRoot,
      ...(scope.baseCommitOid === undefined ? {} : { baseCommitOid: scope.baseCommitOid }),
      objectFormat: scope.objectFormat,
      entries: Object.freeze(entries),
    },
    contents,
  };
}

/**
 * Resolves the live index path via `git rev-parse --git-path index` (never
 * a hardcoded `.git/index`, for linked-worktree correctness — Required
 * Focus 3(c)) and returns its stat identity.
 */
async function indexIdentity(
  repositoryRoot: string,
  runner: GitRunner,
): Promise<Readonly<{ readonly size: number; readonly mtimeMs: number }>> {
  const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: repositoryRoot });
  const indexPath = result.stdout.toString('utf8').trim();
  const resolved = indexPath.startsWith('/') ? indexPath : join(repositoryRoot, indexPath);
  const info = await lstat(resolved);
  return { size: info.size, mtimeMs: info.mtimeMs };
}

interface CaptureWithIndexRaceGuardDependencies extends CaptureWorktreeManifestDependencies {
  readonly onBeforeIndexRecheck?: (attempt: number) => Promise<void> | void;
}

interface CaptureWithIndexRaceGuardResult extends WorktreeManifestCapture {
  readonly indexRaceNotice: boolean;
}

/**
 * Implements D-11: `lstat` the index before and after a whole capture; on
 * mismatch, retry the entire capture once; if the retry's own bracket also
 * disagrees, return the retry's best-effort result with a distinct
 * `indexRaceNotice` (never conflated with the per-file torn-file signal).
 */
async function captureWithIndexRaceGuard(
  scope: UncommittedScope,
  repositoryRoot: string,
  runner: GitRunner,
  dependencies: CaptureWithIndexRaceGuardDependencies = {},
): Promise<CaptureWithIndexRaceGuardResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {          // D-11: "retry the whole capture once"
    const before = await indexIdentity(repositoryRoot, runner);
    const captured = await captureWorktreeManifest(scope, repositoryRoot, dependencies);
    await dependencies.onBeforeIndexRecheck?.(attempt);
    const after = await indexIdentity(repositoryRoot, runner);
    const stable = before.size === after.size && before.mtimeMs === after.mtimeMs;
    if (stable) return { ...captured, indexRaceNotice: false };
    if (attempt === 1) return { ...captured, indexRaceNotice: true };
  }
  throw new Error('unreachable');
}

async function resolveMergeBaseOid(repositoryRoot: string, baseCommitOid: string, runner: GitRunner): Promise<string> {
  const result = await runner.run(['merge-base', baseCommitOid, 'HEAD'], { cwd: repositoryRoot });
  return result.stdout.toString('utf8').trim();
}

async function writeContentIfAbsent(path: string, bytes: Buffer): Promise<void> {
  try {
    await writeOwned(path, bytes);
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
  }
}

function contentPath(root: string, sha256: string): string {
  return join(root, 'content', `${sha256}.bin`);
}

async function writeManifestEntryContents(
  root: string,
  entries: readonly WorktreeSnapshotEntry[],
  contents: ReadonlyMap<string, Readonly<{ readonly preimage?: Buffer; readonly postimage?: Buffer }>>,
): Promise<void> {
  await mkdir(join(root, 'content'), { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    const record = contents.get(entry.file.id);
    if (record === undefined) continue;
    if (entry.preimage.exists && record.preimage !== undefined) {
      await writeContentIfAbsent(contentPath(root, entry.preimage.sha256), record.preimage);
    }
    if (entry.postimage.exists && record.postimage !== undefined) {
      await writeContentIfAbsent(contentPath(root, entry.postimage.sha256), record.postimage);
    }
  }
  await syncDirectory(join(root, 'content'));
}

async function writeManifest(root: string, manifest: WorktreeSnapshotManifest): Promise<void> {
  const temporaryPath = join(root, `manifest.json.tmp-${randomUUID()}`);
  await writeOwned(temporaryPath, Buffer.from(JSON.stringify(manifest), 'utf8'));
  await rename(temporaryPath, join(root, 'manifest.json'));
  await syncDirectory(root);
}

function entryKey(entry: WorktreeSnapshotEntry): string {
  return pathKey(entry.file);
}

function entryContentFingerprint(entry: WorktreeSnapshotEntry): string {
  return [
    entry.captureStatus,
    entry.preimage.exists ? entry.preimage.sha256 : '',
    entry.postimage.exists ? entry.postimage.sha256 : '',
  ].join(':');
}

function entryDisplay(entry: WorktreeSnapshotEntry): string {
  return entry.file.newPath?.display ?? entry.file.oldPath?.display ?? entryKey(entry);
}

function diffManifestEntries(
  previous: readonly WorktreeSnapshotEntry[],
  next: readonly WorktreeSnapshotEntry[],
): Readonly<{ readonly added: readonly string[]; readonly removed: readonly string[]; readonly modified: readonly string[] }> {
  const previousByKey = new Map(previous.map((entry) => [entryKey(entry), entry] as const));
  const nextByKey = new Map(next.map((entry) => [entryKey(entry), entry] as const));
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [key, entry] of nextByKey) {
    const prior = previousByKey.get(key);
    if (prior === undefined) {
      added.push(entryDisplay(entry));
      continue;
    }
    if (entryContentFingerprint(prior) !== entryContentFingerprint(entry)) modified.push(entryDisplay(entry));
  }
  for (const [key, entry] of previousByKey) {
    if (!nextByKey.has(key)) removed.push(entryDisplay(entry));
  }

  return Object.freeze({ added: Object.freeze(added), removed: Object.freeze(removed), modified: Object.freeze(modified) });
}

export interface MaterializeWorktreeSnapshotOptions {
  readonly root: string;
}

export interface WorktreeSnapshotRefreshDependencies extends CaptureWithIndexRaceGuardDependencies {
  readonly runner?: GitRunner;
}

export class WorktreeSnapshot {
  private manifest: WorktreeSnapshotManifest;
  private readonly root: string;
  private readonly dependencies: WorktreeSnapshotRefreshDependencies;
  public indexRaceNotice: boolean;

  public constructor(
    manifest: WorktreeSnapshotManifest,
    root: string,
    indexRaceNotice: boolean,
    dependencies: WorktreeSnapshotRefreshDependencies = {},
  ) {
    this.manifest = manifest;
    this.root = root;
    this.indexRaceNotice = indexRaceNotice;
    this.dependencies = dependencies;
  }

  private async verifiedManifest(): Promise<WorktreeSnapshotManifest> {
    const manifestPath = join(this.root, 'manifest.json');
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > MAX_MANIFEST_BYTES) {
      throw new WorktreeSnapshotError('snapshot-unavailable', false);
    }
    const parsed = WorktreeSnapshotManifestSchema.parse(
      JSON.parse(strictText.decode(await boundedFileBytes(Buffer.from(manifestPath), info.size))),
    );
    const { provenanceDigest, ...withoutDigest } = parsed;
    if (provenanceDigest !== manifestDigest(withoutDigest) || provenanceDigest !== this.manifest.provenanceDigest) {
      throw new WorktreeSnapshotError('snapshot-unavailable', false);
    }
    return this.manifest;
  }

  private async readSide(side_: WorktreeSnapshotSide): Promise<Buffer | undefined> {
    if (!side_.exists) return undefined;
    try {
      const path = contentPath(this.root, side_.sha256);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw new WorktreeSnapshotError('snapshot-unavailable', false);
      const bytes = await boundedFileBytes(Buffer.from(path), side_.byteLength);
      if (digest(bytes) !== side_.sha256) throw new WorktreeSnapshotError('snapshot-unavailable', false);
      return bytes;
    } catch (error) {
      if (error instanceof WorktreeSnapshotError) throw error;
      if (isMissing(error)) throw new WorktreeSnapshotError('snapshot-unavailable', false);
      throw new WorktreeSnapshotError('retryable-read', true);
    }
  }

  async files(): Promise<readonly ChangedFile[]> {
    return (await this.verifiedManifest()).entries.map((entry) => entry.file);
  }

  async readContent(fileId: string): Promise<
    Readonly<{
      readonly file: ChangedFile;
      readonly preimage: Buffer | undefined;
      readonly preimageBlobOid: string;
      readonly postimage: Buffer | undefined;
      readonly postimageBlobOid: string;
    }> | undefined
  > {
    const manifest = await this.verifiedManifest();
    const entry = manifest.entries.find((candidate) => candidate.file.id === fileId);
    if (entry === undefined) return undefined;
    return Object.freeze({
      file: entry.file,
      preimage: await this.readSide(entry.preimage),
      preimageBlobOid: entry.preimage.blobOid,
      postimage: await this.readSide(entry.postimage),
      postimageBlobOid: entry.postimage.blobOid,
    });
  }

  async session(): Promise<Readonly<{
    readonly sourceKind: WorktreeSnapshotManifest['sourceKind'];
    readonly chain: readonly string[];
    readonly changedFileCount: number;
    readonly indexRaceNotice: boolean;
  }>> {
    const manifest = await this.verifiedManifest();
    return Object.freeze({
      sourceKind: manifest.sourceKind,
      chain: manifest.chain,
      changedFileCount: manifest.entries.length,
      indexRaceNotice: this.indexRaceNotice,
    });
  }

  /**
   * Freeze-then-observe-then-mutate (RESEARCH.md Pattern 3): re-captures the
   * current file set and appends the new capture's digest to the existing
   * chain (D-18) — never replacing or discarding any prior chain entry's
   * content (D-20) — returning the path-keyed added/removed/modified delta
   * relative to the immediately preceding chain entry (SNAP-04).
   */
  async refresh(): Promise<Readonly<{
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly modified: readonly string[];
    readonly indexRaceNotice: boolean;
  }>> {
    const previous = await this.verifiedManifest(); // chain-tip manifest before this call
    const runner = this.dependencies.runner ?? createGitRunner();
    const repositoryRoot = previous.repositoryIdentity;
    const mergeBaseOid = previous.sourceKind === 'unstaged' || previous.baseCommitOid === undefined
      ? undefined
      : await resolveMergeBaseOid(repositoryRoot, previous.baseCommitOid, runner);
    const scope: UncommittedScope = {
      kind: 'uncommitted',
      sourceKind: previous.sourceKind,
      repositoryRoot,
      objectFormat: previous.objectFormat,
      baseCommitOid: previous.baseCommitOid,
      mergeBaseOid,
      changedFiles: [],
    };

    const { manifest: nextBase, contents, indexRaceNotice } = await captureWithIndexRaceGuard(
      scope,
      repositoryRoot,
      runner,
      this.dependencies,
    ); // Pattern 1 + Pattern 4 (retry)
    const nextDigest = captureDigest(nextBase);
    const nextManifestDraft = { ...nextBase, chain: Object.freeze([...previous.chain, nextDigest]) }; // D-18: append, don't replace
    const nextManifest = WorktreeSnapshotManifestSchema.parse({
      ...nextManifestDraft,
      provenanceDigest: manifestDigest(nextManifestDraft),
    });

    const delta = diffManifestEntries(previous.entries, nextManifest.entries); // path-keyed set comparison
    await writeManifestEntryContents(this.root, nextManifest.entries, contents); // D-20: never touches digestA's content
    await writeManifest(this.root, nextManifest);

    this.manifest = nextManifest;
    this.indexRaceNotice = indexRaceNotice;
    return Object.freeze({ ...delta, indexRaceNotice });
  }
}

export async function materializeWorktreeSnapshot(
  scope: UncommittedScope,
  options: MaterializeWorktreeSnapshotOptions,
  dependencies: WorktreeSnapshotRefreshDependencies = {},
): Promise<WorktreeSnapshot> {
  const runner = dependencies.runner ?? createGitRunner();
  const { manifest: base, contents, indexRaceNotice } = await captureWithIndexRaceGuard(
    scope,
    scope.repositoryRoot,
    runner,
    dependencies,
  );
  const chainDigest = captureDigest(base);
  const manifestDraft = { ...base, chain: Object.freeze([chainDigest]) }; // the first capture is always a singleton chain
  const manifest = WorktreeSnapshotManifestSchema.parse({
    ...manifestDraft,
    provenanceDigest: manifestDigest(manifestDraft),
  });

  await mkdir(options.root, { recursive: true, mode: 0o700 });
  await writeManifestEntryContents(options.root, manifest.entries, contents);
  await writeManifest(options.root, manifest);

  return new WorktreeSnapshot(manifest, options.root, indexRaceNotice, dependencies);
}
