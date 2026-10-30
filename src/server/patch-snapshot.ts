import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readlink,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import {
  ChangedFileSchema,
  ExactPatchValidationTargetSchema,
  type ChangedFile,
  type ExactPatchValidationTarget,
  type GroundedExactPatch,
} from '../contracts/comparison.js';
import type { ExactPatchExportScope } from '../contracts/draft.js';
import { createGitRunner } from '../git/runner.js';
import { createObjectReader } from '../git/objects.js';
import { boundedFileBytes, digest, frame, isMissing, MAX_SIDE_BYTES, syncDirectory, writeOwned } from './snapshot-fs.js';


const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_FILES = 10_000;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_TARGET_TREE_BYTES = 64 * 1024 * 1024;
const PATCH_KEY_DOMAIN = Buffer.from('cumpa-exact-patch-review-key-v1', 'utf8');
const fileIdPattern = /^file_[A-Za-z0-9_-]{43}$/u;
const strictText = new TextDecoder('utf-8', { fatal: true });

const SnapshotSideSchema = z.discriminatedUnion('exists', [
  z.strictObject({
    exists: z.literal(false),
    mode: z.string().regex(/^[0-7]{6}$/u),
    blobOid: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
    byteLength: z.literal(0),
  }).readonly(),
  z.strictObject({
    exists: z.literal(true),
    path: z.strictObject({
      bytesBase64url: z.string().regex(/^[A-Za-z0-9_-]+$/u),
      display: z.string(),
      utf8: z.string().optional(),
    }).readonly(),
    mode: z.string().regex(/^[0-7]{6}$/u),
    blobOid: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u),
    language: z.string().min(1),
    byteLength: z.number().int().nonnegative().max(MAX_SIDE_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).readonly(),
]).readonly();

const SnapshotEntrySchema = z.strictObject({
  file: ChangedFileSchema,
  preimage: SnapshotSideSchema,
  postimage: SnapshotSideSchema,
}).superRefine((entry, context) => {
  for (const [name, side, path, mode, blobOid] of [
    ['preimage', entry.preimage, entry.file.oldPath, entry.file.oldMode, entry.file.oldBlobOid],
    ['postimage', entry.postimage, entry.file.newPath, entry.file.newMode, entry.file.newBlobOid],
  ] as const) {
    if (
      side.exists !== (mode !== '000000')
      || side.mode !== mode
      || side.blobOid !== blobOid
      || (side.exists && (
        path === undefined
        || side.path.bytesBase64url !== path.bytesBase64url
        || side.path.display !== path.display
        || side.path.utf8 !== path.utf8
      ))
    ) {
      context.addIssue({ code: 'custom', message: `${name} does not match its frozen file metadata.` });
    }
  }
}).readonly();

const SnapshotManifestSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  digest: z.string().regex(/^[0-9a-f]{64}$/u),
  validationTarget: ExactPatchValidationTargetSchema,
  reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  submittedByteLength: z.number().int().positive().max(1_048_576),
  repositoryIdentity: z.string().min(1),
  objectFormat: z.enum(['sha1', 'sha256']),
  entries: z.array(SnapshotEntrySchema).max(MAX_SNAPSHOT_FILES).readonly(),
  provenanceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
}).superRefine((manifest, context) => {
  const ids = new Set<string>();
  let total = 0;
  for (const entry of manifest.entries) {
    if (ids.has(entry.file.id)) {
      context.addIssue({ code: 'custom', message: 'Snapshot file identifiers must be unique.' });
    }
    ids.add(entry.file.id);
    total += entry.preimage.byteLength + entry.postimage.byteLength;
  }
  if (total > MAX_SNAPSHOT_BYTES) {
    context.addIssue({ code: 'custom', message: 'Snapshot content exceeds its accepted byte ceiling.' });
  }
}).readonly();

type SnapshotSide = z.infer<typeof SnapshotSideSchema>;
type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>;
type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;

export class PatchSnapshotError extends Error {
  public constructor(
    readonly code: 'retryable-read' | 'snapshot-unavailable',
    readonly retryable: boolean,
  ) {
    super(code === 'retryable-read' ? 'Frozen patch file is temporarily unavailable.' : 'Frozen patch snapshot is unavailable.');
  }
}

function reviewKey(grounded: GroundedExactPatch): string {
  const hash = createHash('sha256');
  hash.update(PATCH_KEY_DOMAIN);
  hash.update(frame(grounded.scope.digest));
  hash.update(frame(grounded.scope.validationTarget.kind));
  hash.update(frame(grounded.repositoryRoot));
  return hash.digest('hex');
}

function languageForPath(path: ChangedFile['oldPath']): string {
  const extension = path?.utf8?.split('.').at(-1);
  return extension === undefined ? 'plaintext' : extension === 'ts' ? 'typescript' : extension === 'js' ? 'javascript' : extension === 'json' ? 'json' : extension === 'md' ? 'markdown' : 'plaintext';
}

function side(
  bytes: Buffer | undefined,
  path: ChangedFile['oldPath'],
  mode: string,
  blobOid: string,
): SnapshotSide {
  return bytes === undefined
    ? SnapshotSideSchema.parse({ exists: false, mode, blobOid, byteLength: 0 })
    : SnapshotSideSchema.parse({
        exists: true,
        path,
        mode,
        blobOid,
        language: languageForPath(path),
        byteLength: bytes.byteLength,
        sha256: digest(bytes),
      });
}

function manifestDigest(manifest: Omit<SnapshotManifest, 'provenanceDigest'>): string {
  return digest(Buffer.from(JSON.stringify(manifest), 'utf8'));
}

function contentName(fileId: string, sideName: 'preimage' | 'postimage'): string {
  return `${fileId}.${sideName}`;
}

function targetLabel(target: ExactPatchValidationTarget): string {
  return target.kind === 'repository' ? 'Repository content' : 'Worktree';
}

type TargetEntry = Readonly<{ readonly mode: string; readonly bytes: Buffer }>;
type RepositoryTreeEntry = Readonly<{ readonly mode: string; readonly type: string; readonly oid: string }>;

function targetPath(root: string, encoded: string): Buffer | undefined {
  const bytes = Buffer.from(encoded, 'base64url');
  if (
    bytes.length === 0
    || bytes.toString('base64url') !== encoded
    || bytes[0] === 0x2f
    || bytes.at(-1) === 0x2f
    || bytes.includes(0)
  ) {
    return undefined;
  }
  const parts = bytes.toString('latin1').split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return undefined;
  return Buffer.concat([Buffer.from(root, 'utf8'), ...parts.flatMap((part) => [Buffer.from('/'), Buffer.from(part, 'latin1')])]);
}

async function worktreeEntry(
  root: string,
  encodedPath: string,
  expectedBytes: number,
): Promise<TargetEntry | undefined> {
  const completePath = targetPath(root, encodedPath);
  if (completePath === undefined) throw new Error('Frozen target path is invalid.');
  const rootBytes = Buffer.from(root, 'utf8');
  const relative = completePath.subarray(rootBytes.byteLength + 1).toString('latin1').split('/');
  let current = rootBytes;
  try {
    for (const [index, part] of relative.entries()) {
      current = Buffer.concat([current, Buffer.from('/'), Buffer.from(part, 'latin1')]);
      const info = await lstat(current);
      if (index < relative.length - 1) {
        if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Target path traversal changed.');
        continue;
      }
      if (info.isSymbolicLink()) {
        return Object.freeze({ mode: '120000', bytes: await readlink(current, { encoding: 'buffer' }) });
      }
      if (!info.isFile()) throw new Error('Target path is not a supported file.');
      return Object.freeze({
        mode: (info.mode & 0o111) === 0 ? '100644' : '100755',
        bytes: await boundedFileBytes(current, expectedBytes),
      });
    }
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  return undefined;
}

async function repositoryTree(root: string): Promise<ReadonlyMap<string, RepositoryTreeEntry>> {
  const runner = createGitRunner();
  const result = await runner.run(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], {
    cwd: root,
    maxStdoutBytes: MAX_TARGET_TREE_BYTES,
  });
  const tree = new Map<string, RepositoryTreeEntry>();
  for (const record of result.stdout.toString('latin1').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    const fields = record.slice(0, tab).split(' ');
    if (
      tab < 0
      || fields.length !== 3
      || !/^[0-7]{6}$/u.test(fields[0]!)
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(fields[2]!)
    ) {
      throw new Error('Git returned malformed target tree metadata.');
    }
    tree.set(Buffer.from(record.slice(tab + 1), 'latin1').toString('base64url'), {
      mode: fields[0]!,
      type: fields[1]!,
      oid: fields[2]!,
    });
  }
  return tree;
}

export interface MaterializePatchSnapshotOptions {
  readonly parent?: string;
  readonly observeTarget?: () => Promise<boolean>;
}

export class PatchSnapshot {
  readonly digest: string;
  readonly validationTarget: ExactPatchValidationTarget;
  readonly reviewKey: string;
  readonly root: string;
  readonly validationTargetLabel: string;

  private unavailable = false;
  private drifted = false;
  private disposed = false;

  constructor(
    private readonly manifest: SnapshotManifest,
    root: string,
    private readonly observeTarget?: () => Promise<boolean>,
  ) {
    this.digest = manifest.digest;
    this.validationTarget = manifest.validationTarget;
    this.reviewKey = manifest.reviewKey;
    this.root = root;
    this.validationTargetLabel = targetLabel(manifest.validationTarget);
  }

  private fail(): never {
    this.unavailable = true;
    throw new PatchSnapshotError('snapshot-unavailable', false);
  }

  private async verifyRoot(): Promise<void> {
    try {
      const info = await stat(this.root);
      if (!info.isDirectory() || info.isSymbolicLink() || this.disposed || (typeof process.getuid === 'function' && info.uid !== process.getuid()) || (info.mode & 0o022) !== 0) {
        this.fail();
      }
    } catch {
      this.fail();
    }
  }

  private async verifiedManifest(): Promise<SnapshotManifest> {
    if (this.unavailable) this.fail();
    await this.verifyRoot();
    try {
      const manifestPath = join(this.root, 'manifest.json');
      const info = await lstat(manifestPath);
      if (
        !info.isFile()
        || info.isSymbolicLink()
        || info.size <= 0
        || info.size > MAX_MANIFEST_BYTES
        || (info.mode & 0o022) !== 0
      ) {
        this.fail();
      }
      const parsed = SnapshotManifestSchema.parse(
        JSON.parse(strictText.decode(await boundedFileBytes(Buffer.from(manifestPath), info.size))),
      );
      const { provenanceDigest, ...withoutDigest } = parsed;
      if (
        provenanceDigest !== manifestDigest(withoutDigest)
        || provenanceDigest !== this.manifest.provenanceDigest
      ) {
        this.fail();
      }
      return this.manifest;
    } catch (error) {
      if (error instanceof PatchSnapshotError) throw error;
      this.fail();
    }
  }

  private entry(fileId: string, manifest: SnapshotManifest): SnapshotEntry | undefined {
    if (!fileIdPattern.test(fileId)) return undefined;
    return manifest.entries.find((entry) => entry.file.id === fileId);
  }

  private async readSide(fileId: string, sideName: 'preimage' | 'postimage', side: SnapshotSide): Promise<Buffer | undefined> {
    if (!side.exists) return undefined;
    try {
      const contentPath = join(this.root, contentName(fileId, sideName));
      const info = await lstat(contentPath);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o022) !== 0) this.fail();
      const bytes = await boundedFileBytes(Buffer.from(contentPath), side.byteLength);
      if (digest(bytes) !== side.sha256) this.fail();
      return bytes;
    } catch (error) {
      if (error instanceof PatchSnapshotError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'EACCES')) this.fail();
      throw new PatchSnapshotError('retryable-read', true);
    }
  }

  private async targetDrift(manifest: SnapshotManifest): Promise<boolean> {
    const expected = await Promise.all(manifest.entries.map(async (entry) => ({
      entry,
      postimage: await this.readSide(entry.file.id, 'postimage', entry.postimage),
    })));
    try {
      const tree = manifest.validationTarget.kind === 'repository'
        ? await repositoryTree(manifest.repositoryIdentity)
        : undefined;
      const reader = tree === undefined ? undefined : createObjectReader(manifest.repositoryIdentity);
      for (const { entry, postimage } of expected) {
        const target = entry.file.newPath ?? entry.file.oldPath;
        if (target === undefined) return true;
        let actual: TargetEntry | undefined;
        if (tree === undefined) {
          actual = await worktreeEntry(manifest.repositoryIdentity, target.bytesBase64url, postimage?.byteLength ?? 0);
        } else {
          const metadata = tree.get(target.bytesBase64url);
          if (metadata !== undefined) {
            if (postimage === undefined || metadata.type !== 'blob' || reader === undefined) return true;
            const content = await reader.read(metadata.oid, { maxBytes: postimage.byteLength });
            if (content.kind !== 'available') return true;
            actual = Object.freeze({ mode: metadata.mode, bytes: Buffer.from(content.bytes) });
          }
        }
        if (
          postimage === undefined
            ? actual !== undefined
            : actual === undefined
              || actual.mode !== entry.file.newMode
              || !actual.bytes.equals(postimage)
        ) {
          return true;
        }

        const oldPath = entry.file.oldPath;
        const renamed = entry.file.status.kind === 'renamed'
          && oldPath !== undefined
          && oldPath.bytesBase64url !== target.bytesBase64url;
        if (renamed) {
          if (tree?.has(oldPath.bytesBase64url)) return true;
          if (tree === undefined && await worktreeEntry(manifest.repositoryIdentity, oldPath.bytesBase64url, 0) !== undefined) return true;
        }
      }
      return false;
    } catch {
      return true;
    }
  }

  async session(): Promise<Readonly<{ readonly patch: Readonly<{ readonly kind: 'exact-patch'; readonly digest: string; readonly reviewKey: string; readonly validationTarget: ExactPatchValidationTarget; readonly changedFileCount: number }>; readonly files: readonly unknown[] }>> {
    const manifest = await this.verifiedManifest();
    return Object.freeze({
      patch: Object.freeze({
        kind: 'exact-patch' as const,
        digest: manifest.digest,
        reviewKey: manifest.reviewKey,
        validationTarget: manifest.validationTarget,
        changedFileCount: manifest.entries.length,
      }),
      files: Object.freeze(manifest.entries.map(({ file }) => ({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      }))),
    });
  }

  async lookup(fileId: string): Promise<ChangedFile | undefined> {
    return this.entry(fileId, await this.verifiedManifest())?.file;
  }


  async readContent(fileId: string): Promise<Readonly<{ readonly file: ChangedFile; readonly preimage: Buffer | undefined; readonly postimage: Buffer | undefined }> | undefined> {
    if (this.unavailable) this.fail();
    const entry = this.entry(fileId, await this.verifiedManifest());
    if (entry === undefined || entry.file.availability.kind !== 'text') return undefined;
    return Object.freeze({
      file: entry.file,
      preimage: await this.readSide(fileId, 'preimage', entry.preimage),
      postimage: await this.readSide(fileId, 'postimage', entry.postimage),
    });
  }

  async files(): Promise<readonly ChangedFile[]> {
    return (await this.verifiedManifest()).entries.map((entry) => entry.file);
  }

  async observe(): Promise<'unchanged' | 'drifted' | 'snapshotUnavailable'> {
    if (this.unavailable) return 'snapshotUnavailable';
    try {
      const manifest = await this.verifiedManifest();
      if (!this.drifted) {
        try {
          this.drifted = this.observeTarget === undefined
            ? await this.targetDrift(manifest)
            : await this.observeTarget();
        } catch {
          this.drifted = true;
        }
      }
      return this.drifted ? 'drifted' : 'unchanged';
    } catch {
      this.unavailable = true;
      return 'snapshotUnavailable';
    }
  }

  async exportScope(): Promise<ExactPatchExportScope> {
    const status = await this.observe();
    if (status === 'snapshotUnavailable') this.fail();
    const manifest = await this.verifiedManifest();
    return Object.freeze({
      digest: manifest.digest,
      validationTarget: manifest.validationTarget,
      reviewKey: manifest.reviewKey,
      snapshot: Object.freeze({
        status,
        files: Object.freeze(manifest.entries.map((entry) => entry.file)),
      }),
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await rm(this.root, { recursive: true, force: true });
  }
}

export async function materializePatchSnapshot(
  grounded: GroundedExactPatch,
  options: MaterializePatchSnapshotOptions = {},
): Promise<PatchSnapshot> {
  if (grounded.changedFiles.length > MAX_SNAPSHOT_FILES) {
    throw new PatchSnapshotError('snapshot-unavailable', false);
  }
  const parent = options.parent ?? tmpdir();
  const staging = await mkdir(parent, { recursive: true, mode: 0o700 }).then(() => join(parent, `.cumpa-patch-stage-${randomUUID()}`));
  const accepted = join(parent, `cumpa-patch-${randomUUID()}`);
  let total = 0;
  try {
    await mkdir(staging, { mode: 0o700 });
    const entries: SnapshotEntry[] = [];
    for (const file of grounded.changedFiles) {
      if (!fileIdPattern.test(file.id)) throw new PatchSnapshotError('snapshot-unavailable', false);
      const content = grounded.contents.get(file.id);
      if (content === undefined) throw new PatchSnapshotError('snapshot-unavailable', false);
      const preimage = Buffer.from(content.preimage ?? []);
      const postimage = Buffer.from(content.postimage ?? []);
      total += preimage.byteLength + postimage.byteLength;
      if (preimage.byteLength > MAX_SIDE_BYTES || postimage.byteLength > MAX_SIDE_BYTES || total > MAX_SNAPSHOT_BYTES) throw new PatchSnapshotError('snapshot-unavailable', false);
      const frozenFile = ChangedFileSchema.parse(structuredClone(file));
      const entry = SnapshotEntrySchema.parse({
        file: frozenFile,
        preimage: side(content.preimage, frozenFile.oldPath, frozenFile.oldMode, frozenFile.oldBlobOid),
        postimage: side(content.postimage, frozenFile.newPath, frozenFile.newMode, frozenFile.newBlobOid),
      });
      entries.push(entry);
      if (content.preimage !== undefined) await writeOwned(join(staging, contentName(file.id, 'preimage')), preimage);
      if (content.postimage !== undefined) await writeOwned(join(staging, contentName(file.id, 'postimage')), postimage);
    }
    const base = {
      version: SNAPSHOT_VERSION,
      digest: grounded.scope.digest,
      validationTarget: Object.freeze({ ...grounded.scope.validationTarget }),
      reviewKey: reviewKey(grounded),
      submittedByteLength: grounded.scope.submittedByteLength,
      repositoryIdentity: grounded.repositoryRoot,
      objectFormat: grounded.objectFormat,
      entries: Object.freeze(entries),
    } as const;
    const manifest = SnapshotManifestSchema.parse({ ...base, provenanceDigest: manifestDigest(base) });
    await writeOwned(join(staging, 'manifest.json'), Buffer.from(JSON.stringify(manifest), 'utf8'));
    await syncDirectory(staging);
    await rename(staging, accepted);
    await chmod(accepted, 0o700);
    await syncDirectory(parent);
    return new PatchSnapshot(manifest, accepted, options.observeTarget);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    await rm(accepted, { recursive: true, force: true });
    if (error instanceof PatchSnapshotError) throw error;
    throw new PatchSnapshotError('snapshot-unavailable', false);
  }
}
