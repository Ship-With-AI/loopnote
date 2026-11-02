import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  CURRENT_DRAFT_SCHEMA_VERSION,
  DraftMutationSchema,
  ReviewDraftV1Schema,
  RevisionSchema,
  type DraftMutation,
  type ReviewDraftV1,
} from '../contracts/draft.js';
import type { DraftComparison as DraftComparisonContract } from '../contracts/draft.js';
import { applyDraftMutation } from '../draft/mutate-draft.js';
import { RENAME_MAP } from '../domain/product-identity.js';
import { createDraftLoader, type DraftLoadState } from './draft-loader.js';

export type DraftComparison = DraftComparisonContract;

export type DraftFileHandle = Readonly<{
  writeFile(bytes: Uint8Array): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}>;

export type DraftFileSystem = Readonly<{
  readFile(path: string): Promise<Buffer>;
  mkdir(path: string): Promise<void>;
  open(path: string, flags: 'wx', mode: number): Promise<DraftFileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  syncDirectory(path: string): Promise<void>;
}>;

export class DraftStoreError extends Error {}

const queues = new Map<string, Promise<unknown>>();

const nodeFileSystem: DraftFileSystem = {
  readFile: async (path) => fs.readFile(path),
  mkdir: async (path) => {
    await fs.mkdir(path, { recursive: true });
  },
  open: async (path, flags, mode) => {
    const handle = await fs.open(path, flags, mode);
    return {
      writeFile: async (bytes) => handle.writeFile(bytes),
      sync: async () => handle.sync(),
      close: async () => handle.close(),
    };
  },
  rename: async (from, to) => fs.rename(from, to),
  unlink: async (path) => fs.unlink(path),
  syncDirectory: async (path) => {
    const handle = await fs.open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  return hasCode(error, 'EINVAL') || hasCode(error, 'ENOTSUP') || hasCode(error, 'EISDIR');
}

function initialDraft(comparison: DraftComparison): ReviewDraftV1 {
  return ReviewDraftV1Schema.parse({
    schemaVersion: CURRENT_DRAFT_SCHEMA_VERSION,
    comparison,
    revision: 0,
    summary: '',
    comments: [],
  });
}

async function runSerialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = queues.get(key) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(operation);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    if (queues.get(key) === current) {
      queues.delete(key);
    }
  }
}

type AddDraftMutation = Omit<Extract<DraftMutation, { readonly type: 'addComment' }>, 'commentId'>;
export type DraftStoreMutation = AddDraftMutation | Exclude<DraftMutation, { readonly type: 'addComment' }>;

export type DraftMutationResult =
  | Readonly<{ readonly kind: 'accepted'; readonly draft: ReviewDraftV1 }>
  | Readonly<{
      readonly kind: 'revisionConflict';
      readonly expectedRevision: number;
      readonly actualRevision: number;
      readonly latest: ReviewDraftV1;
    }>
  | Readonly<{ readonly kind: 'invalidTarget' }>
  | Readonly<{ readonly kind: 'illegalTransition' }>
  | Readonly<{ readonly kind: 'persistenceFailure' }>
  | Readonly<{ readonly kind: 'readOnly'; readonly load: Exclude<DraftLoadState, { readonly kind: 'missing' | 'current' }> }>;

export type DraftRecoveryResult =
  | Readonly<{ readonly kind: 'recovered'; readonly backupPath: string; readonly draft: ReviewDraftV1 }>
  | Readonly<{ readonly kind: 'fingerprintChanged' }>
  | Readonly<{ readonly kind: 'recoveryUnavailable'; readonly load: DraftLoadState }>
  | Readonly<{ readonly kind: 'persistenceFailure' }>;

export type DraftSettleResult<T> =
  | Readonly<{ readonly kind: 'accepted'; readonly value: T }>
  | Readonly<{ readonly kind: 'revisionConflict'; readonly expectedRevision: number; readonly actualRevision: number }>
  | Readonly<{ readonly kind: 'draftChanged'; readonly actualRevision: number }>
  | Readonly<{ readonly kind: 'persistenceFailure' }>
  | Readonly<{ readonly kind: 'readOnly'; readonly load: Exclude<DraftLoadState, { readonly kind: 'missing' | 'current' }> }>;

export type DraftSettleOperation<TPrepared, TResult> = Readonly<{
  readonly prepare: (draft: ReviewDraftV1) => Promise<TPrepared>;
  readonly finalize: (input: Readonly<{ readonly draft: ReviewDraftV1; readonly prepared: TPrepared }>) => Promise<TResult>;
}>;


export type DraftStore = Readonly<{
  readonly canonicalPath: string;
  load(): Promise<ReviewDraftV1>;
  loadState(): Promise<DraftLoadState>;
  mutate(input: Readonly<{ readonly expectedRevision: number; readonly mutation: DraftStoreMutation }>): Promise<DraftMutationResult>;
  settle<TPrepared, TResult>(
    expectedRevision: number,
    operation: DraftSettleOperation<TPrepared, TResult>,
  ): Promise<DraftSettleResult<TResult>>;
  recover(input: Readonly<{ readonly expectedFingerprint: string }>): Promise<DraftRecoveryResult>;
}>;

export function createDraftStore(options: Readonly<{
  readonly repositoryRoot: string;
  readonly comparison: DraftComparison;
  readonly storageScope?: string;
  readonly fileSystem?: DraftFileSystem;
}>): DraftStore {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const loader = createDraftLoader({
    repositoryRoot: options.repositoryRoot,
    comparison: options.comparison,
    ...(options.storageScope === undefined ? {} : { storageScope: options.storageScope }),
    fileSystem,
  });
  const { canonicalPath, directory, key, relativePath } = loader.paths;
  const queueKey = `${options.repositoryRoot}\u0000${key}`;

  const commit = async (draft: ReviewDraftV1): Promise<void> => {
    const bytes = Buffer.from(`${JSON.stringify(ReviewDraftV1Schema.parse(draft))}\n`, 'utf8');
    const temporaryPath = join(directory, `.${key}.${randomUUID()}.tmp`);
    let handle: DraftFileHandle | undefined;
    let renamed = false;
    try {
      await fileSystem.mkdir(directory);
      handle = await fileSystem.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fileSystem.rename(temporaryPath, canonicalPath);
      renamed = true;
      try {
        await fileSystem.syncDirectory(dirname(canonicalPath));
      } catch (error) {
        if (!isUnsupportedDirectorySync(error)) {
          throw error;
        }
      }
    } catch {
      if (handle !== undefined) {
        try {
          await handle.close();
        } catch {
          // Canonical bytes are untouched until rename succeeds.
        }
      }
      if (!renamed) {
        try {
          await fileSystem.unlink(temporaryPath);
        } catch {
          // A cleanup failure cannot justify touching canonical bytes.
        }
      }
      throw new DraftStoreError('Draft persistence failed.');
    }
  };

  const backupRaw = async (raw: Buffer, expectedFingerprint: string): Promise<string> => {
    await fileSystem.mkdir(directory);
    for (let suffix = 0; ; suffix += 1) {
      const name = suffix === 0
        ? `${key}.corrupt.${expectedFingerprint}.bak`
        : `${key}.corrupt.${expectedFingerprint}.${suffix}.bak`;
      const absolutePath = join(directory, name);
      let handle: DraftFileHandle | undefined;
      let created = false;
      try {
        handle = await fileSystem.open(absolutePath, 'wx', 0o600);
        created = true;
        await handle.writeFile(raw);
        await handle.sync();
        await handle.close();
        handle = undefined;
        try {
          await fileSystem.syncDirectory(directory);
        } catch (error) {
          if (!isUnsupportedDirectorySync(error)) {
            throw error;
          }
        }
        const verified = await fileSystem.readFile(absolutePath);
        if (verified.length !== raw.length || !verified.equals(raw)) {
          throw new DraftStoreError('Draft backup verification failed.');
        }
        return `${relativePath.slice(0, -'.json'.length)}.corrupt.${expectedFingerprint}${suffix === 0 ? '' : `.${suffix}`}.bak`;
      } catch (error) {
        if (handle !== undefined) {
          try {
            await handle.close();
          } catch {
            // The exclusively-created candidate must not be treated as a backup after an incomplete close.
          }
        }
        if (hasCode(error, 'EEXIST')) {
          try {
            const existing = await fileSystem.readFile(absolutePath);
            if (existing.length === raw.length && existing.equals(raw)) {
              return `${relativePath.slice(0, -'.json'.length)}.corrupt.${expectedFingerprint}${suffix === 0 ? '' : `.${suffix}`}.bak`;
            }
          } catch {
            // Never overwrite an existing backup whose bytes cannot be proven identical.
          }
          continue;
        }
        if (created) {
          try {
            await fileSystem.unlink(absolutePath);
          } catch {
            // Failed candidate cleanup does not affect the canonical draft.
          }
        }
        throw error;
      }
    }
  };

  return Object.freeze({
    canonicalPath,
    async load() {
      const load = await loader.load();
      if (load.kind === 'missing') {
        return initialDraft(options.comparison);
      }
      if (load.kind === 'current') {
        return load.draft;
      }
      throw new DraftStoreError('Existing draft cannot be used for this comparison.');
    },
    loadState: async () => loader.load(),
    async settle<TPrepared, TResult>(expectedRevision: number, operation: DraftSettleOperation<TPrepared, TResult>) {
      return runSerialized(queueKey, async (): Promise<DraftSettleResult<TResult>> => {
        const expected = RevisionSchema.parse(expectedRevision);
        let initial: DraftLoadState;
        try {
          initial = await loader.load();
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        if (initial.kind === 'malformed' || initial.kind === 'schemaInvalid' || initial.kind === 'newerUnsupported') {
          return Object.freeze({ kind: 'readOnly' as const, load: initial });
        }
        const draft = initial.kind === 'missing' ? initialDraft(options.comparison) : initial.draft;
        if (draft.revision !== expected) {
          return Object.freeze({ kind: 'revisionConflict' as const, expectedRevision: expected, actualRevision: draft.revision });
        }
        let prepared: TPrepared;
        try {
          prepared = await operation.prepare(structuredClone(draft));
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        let final: DraftLoadState;
        try {
          final = await loader.load();
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        if (
          final.kind !== initial.kind
          || (final.kind === 'current' && initial.kind === 'current' && !final.raw.equals(initial.raw))
        ) {
          return Object.freeze({ kind: 'draftChanged' as const, actualRevision: final.kind === 'current' ? final.draft.revision : 0 });
        }
        if (final.kind !== 'missing' && final.kind !== 'current') {
          return Object.freeze({ kind: 'readOnly' as const, load: final });
        }
        try {
          return Object.freeze({
            kind: 'accepted' as const,
            value: await operation.finalize({ draft: structuredClone(draft), prepared }),
          });
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
      });
    },
    async mutate(input) {
      return runSerialized(queueKey, async () => {
        const expectedRevision = RevisionSchema.parse(input.expectedRevision);
        const load = await loader.load();
        if (load.kind === 'malformed' || load.kind === 'schemaInvalid' || load.kind === 'newerUnsupported') {
          return Object.freeze({ kind: 'readOnly' as const, load });
        }
        const current = load.kind === 'missing' ? initialDraft(options.comparison) : load.draft;
        if (expectedRevision !== current.revision) {
          return Object.freeze({
            kind: 'revisionConflict' as const,
            expectedRevision,
            actualRevision: current.revision,
            latest: current,
          });
        }
        const mutation = DraftMutationSchema.parse(
          input.mutation.type === 'addComment'
            ? { ...input.mutation, commentId: `comment_${randomUUID()}` }
            : input.mutation,
        );
        const applied = applyDraftMutation(current, mutation, new Date().toISOString());
        if (applied.kind !== 'applied') {
          return applied;
        }
        const next = ReviewDraftV1Schema.parse({ ...applied.draft, revision: current.revision + 1 });
        try {
          await commit(next);
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        return Object.freeze({ kind: 'accepted' as const, draft: next });
      });
    },
    async recover(input) {
      return runSerialized(queueKey, async () => {
        let load: DraftLoadState;
        try {
          load = await loader.load();
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        if (load.kind !== 'malformed' && load.kind !== 'schemaInvalid') {
          return Object.freeze({ kind: 'recoveryUnavailable' as const, load });
        }
        if (load.fingerprint !== input.expectedFingerprint) {
          return Object.freeze({ kind: 'fingerprintChanged' as const });
        }
        let backupPath: string;
        try {
          backupPath = await backupRaw(load.raw, load.fingerprint);
        } catch {
          return Object.freeze({ kind: 'persistenceFailure' as const });
        }
        const draft = initialDraft(options.comparison);
        try {
          await commit(draft);
        } catch {
          // A post-rename directory sync can report failure after the replacement is visible.
          // Do not claim a failed recovery while leaving callers to retry against new canonical bytes.
          let visible: DraftLoadState;
          try {
            visible = await loader.load();
          } catch {
            return Object.freeze({ kind: 'persistenceFailure' as const });
          }
          if (visible.kind !== 'current') {
            return Object.freeze({ kind: 'persistenceFailure' as const });
          }
        }
        return Object.freeze({ kind: 'recovered' as const, backupPath, draft });
      });
    },
  });
}

export async function findUncommittedDraftCandidate(
  repositoryRoot: string,
  sourceKind: 'staged' | 'unstaged' | 'worktree',
  baseCommitOid: string | undefined,
): Promise<Readonly<{ readonly reviewKey: string; readonly path: string }> | undefined> {
  const directory = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const candidatePath = join(directory, entry);
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || !('comparison' in parsed)) continue;
      const comparison = parsed.comparison;
      if (typeof comparison !== 'object' || comparison === null) continue;
      if (!('kind' in comparison) || comparison.kind !== 'uncommitted') continue;
      if (!('sourceKind' in comparison) || comparison.sourceKind !== sourceKind) continue;
      const storedBaseCommitOid = 'baseCommitOid' in comparison ? comparison.baseCommitOid : undefined;
      if (storedBaseCommitOid !== baseCommitOid) continue;
      if (!('reviewKey' in comparison) || typeof comparison.reviewKey !== 'string') continue;
      return Object.freeze({ reviewKey: comparison.reviewKey, path: candidatePath });
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function loadUncommittedDraftCandidateComments(
  path: string,
): Promise<readonly Pick<ReviewDraftV1['comments'][number], 'body' | 'state' | 'anchor'>[] | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = ReviewDraftV1Schema.safeParse(parsed);
  if (!result.success) return undefined;
  return result.data.comments.map((comment) => ({
    body: comment.body,
    state: comment.state,
    anchor: comment.anchor,
  }));
}
