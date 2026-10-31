import { createHash, randomBytes } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extname as posixExtname } from 'node:path/posix';

import type { GroundedExactPatch, PinnedComparison, ChangedFile, UncommittedScope } from '../contracts/comparison.js';
import type { WorkingTreeDriftFlag } from '../contracts/draft.js';
import {
  ExportReviewResultSchema,
  AppendCumpaIgnoreResultSchema,
  CumpaIgnoreStatusSchema,
  FileContentResponseSchema,
  FileMetadataResponseSchema,
  PatchStatusResponseSchema,
  SessionResponseSchema,
  type ExportReviewRequest,
  type ExportReviewResult,
  type FileContentResponse,
  type FileMetadataResponse,
  type PatchStatusResponse,
  type SessionResponse,
  type AppendCumpaIgnoreResult,
  type CumpaIgnoreStatus,
  type SelectorDriftResponse,
} from '../contracts/api.js';
import type {
  AttachedCompletionStatus,
  FinishReviewResult,
  UncommittedDraftRecoveryResult,
} from '../contracts/api.js';
import { AttachedCompletionCoordinator } from './attached-completion.js';
import {
  buildDurableAnchor,
  verifyDurableAnchor,
  type AnchorSide,
  type AnchorVerification,
  type DurableAnchorV1,
} from '../domain/anchor.js';
import { comparisonKey, uncommittedReviewKey, standaloneReviewKey } from '../domain/comparison-key.js';
import { decodeBase64url } from '../domain/path-bytes.js';
import { MAX_INLINE_TEXT_BYTES } from '../git/availability.js';
import { createObjectReader } from '../git/objects.js';
import type { ObjectReader } from '../git/objects.js';
import { createGitRunner } from '../git/runner.js';
import {
  IMAGE_CONTENT_TYPE_BY_EXTENSION,
  MAX_IMAGE_BYTES,
  readCommittedImageBytes,
  readWorktreeImageBytes,
  resolveRelativeImagePath,
} from './image-content.js';
import {
  createSelectorDriftObserver,
  type SelectorDriftObserver,
} from '../git/selector-drift.js';
import { createDraftStore, loadUncommittedDraftCandidateComments, type DraftStore } from './draft-store.js';
import { assertAttachedStorageScope } from './draft-loader.js';
import {
  buildReviewExportV1,
  buildReviewExportV2,
  buildReviewExportV3,
  buildReviewExportV4,
  buildReviewExportV5,
  buildReviewExportV6,
  canonicalizeReviewExport,
} from '../export/review-export.js';
import { parseCanonicalReviewExport } from '../export/review-export.js';
import { renderReviewMarkdown } from '../export/render-review-markdown.js';
import { getObservedNativeExchangeCapability } from './native-exchange-capability.js';
import { assertManagedExportsRoot, ensureManagedExportsRoot, publishReviewExport } from './export-store.js';
import { inspectCumpaIgnore } from '../git/ignore-status.js';
import { appendCumpaIgnoreRule } from './gitignore-capability.js';
import { PatchSnapshot } from './patch-snapshot.js';
import { type WorktreeSnapshot } from './worktree-snapshot.js';

import type { HostedSupportClient } from './support-client.js';
import type { SupportStore } from './support-store.js';
import type { SupportAction } from '../contracts/api.js';

export type AnchorAddPort = (
  input: Readonly<{ readonly body: string; readonly anchor: DurableAnchorV1 }>,
) => Promise<unknown>;

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  c: 'c',
  css: 'css',
  go: 'go',
  h: 'cpp',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  py: 'python',
  rs: 'rust',
  sh: 'shell',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'html',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};
const LANGUAGE_BY_BASENAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

function imageContentTypeFor(relativePath: string): string | undefined {
  const extension = posixExtname(relativePath).slice(1).toLowerCase();
  return extension.length === 0 ? undefined : IMAGE_CONTENT_TYPE_BY_EXTENSION[extension];
}

async function resolveImageBytes(
  markdownPath: ChangedFile['oldPath'],
  relativeSrc: string,
  readBytes: (relativePath: string) => Promise<Buffer | undefined>,
): Promise<Readonly<{ readonly bytes: Buffer; readonly contentType: string }> | undefined> {
  if (markdownPath === undefined) {
    return undefined;
  }
  const resolvedPath = resolveRelativeImagePath(markdownPath.display, relativeSrc);
  if (resolvedPath === undefined) {
    return undefined;
  }
  const contentType = imageContentTypeFor(resolvedPath);
  if (contentType === undefined) {
    return undefined;
  }
  const bytes = await readBytes(resolvedPath);
  return bytes === undefined ? undefined : Object.freeze({ bytes, contentType });
}

/**
 * WR-01: the base-side (pre-change) text content for a markdown file is
 * always sourced from the git-tracked blob, never the live worktree — but
 * an image *embedded* in that markdown is only "unchanged sibling asset"
 * safe to read from disk when it is not itself one of the diff's own
 * changed files. This locates that changed-file entry (if any) so callers
 * can prefer its recorded base blob over a live disk read.
 */
function findChangedImageEntry(
  files: readonly ChangedFile[],
  resolvedPath: string,
): ChangedFile | undefined {
  return files.find((candidate) =>
    candidate.oldPath?.display === resolvedPath || candidate.newPath?.display === resolvedPath,
  );
}

async function readObjectBackedImage(objectReader: ObjectReader, blobOid: string): Promise<Buffer | undefined> {
  const content = await objectReader.read(blobOid, { maxBytes: MAX_IMAGE_BYTES });
  return content.kind === 'available' ? Buffer.from(content.bytes) : undefined;
}

export type DraftRevealPort = (canonicalPath: string) => Promise<void>;

export type SupportCapability = Readonly<{
  status(): Promise<{ readonly status: 'unverified' | 'verified' }>;
  start(action: SupportAction): Promise<{ readonly kind: 'ready'; readonly flowUrl: string } | { readonly kind: 'unavailable' }>;
  refresh(): Promise<{ readonly status: 'unverified' | 'verified' }>;
  close(): void;
}>;

export type CapabilityRegistryOptions = Readonly<{
  readonly onCapabilityLookup?: (fileId: string) => void;
  readonly objectReader?: ObjectReader;
  readonly onAnchorAdd?: AnchorAddPort;
  readonly draftStore?: DraftStore;
  readonly revealDraftFile?: DraftRevealPort;
  readonly selectorDriftObserver?: SelectorDriftObserver;
  readonly attachedCompletion?: AttachedCompletionOptions;
  readonly support?: SupportCapability;
  readonly uncommittedRecoveryCandidate?: Readonly<{ readonly path: string }>;
  readonly requestPathspecs?: readonly string[];
}>;

export type AttachedCompletionOptions = Readonly<{
  readonly coordinator: AttachedCompletionCoordinator;
  readonly storageScope: string;
  readonly deliver: (bytes: Uint8Array) => Promise<boolean>;
}>;


export type CapabilityRegistry = Readonly<{
  readonly session: () => Promise<SessionResponse>;
  readonly onAnchorAdd?: AnchorAddPort;
  readonly draftStore: DraftStore;
  readonly selectorDriftObserver?: SelectorDriftObserver;
  readonly patchStatus?: () => Promise<PatchStatusResponse>;
  readonly refresh?: () => Promise<Readonly<{
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly modified: readonly string[];
    readonly staleCount: number;
    readonly orphanedCount: number;
  }>>;
  readonly worktreeChangeIndicator?: () => Promise<Readonly<{ readonly changed: boolean }>>;
  readonly recoverUncommittedDraft?: () => Promise<UncommittedDraftRecoveryResult>;
  readonly isExactPatch?: true;
  readonly attachedCompletion?: Readonly<{
    readonly status: () => AttachedCompletionStatus;
    readonly finish: (expectedRevision: number) => Promise<FinishReviewResult>;
    readonly markResponseSettled: () => void;
  }>;
  readonly lookup: (fileId: string) => Promise<FileMetadataResponse | undefined>;
  readonly readContent: (fileId: string) => Promise<FileContentResponse | undefined>;
  readonly readRelativeImage: (
    fileId: string,
    side: AnchorSide,
    relativeSrc: string,
  ) => Promise<Readonly<{ readonly bytes: Buffer; readonly contentType: string }> | undefined>;
  readonly verifyAnchor: (anchor: DurableAnchorV1) => Promise<AnchorVerification>;
  readonly revealDraftFile: () => Promise<void>;
  readonly revealExportDirectory?: () => Promise<void>;
  readonly exportReview?: (input: ExportReviewRequest) => Promise<ExportReviewResult>;
  readonly inspectCumpaIgnore: () => Promise<CumpaIgnoreStatus>;
  readonly appendCumpaIgnoreRule: () => Promise<AppendCumpaIgnoreResult>;
  readonly support?: SupportCapability;
}>;

export function createSupportCapability(store: SupportStore, client: HostedSupportClient): SupportCapability {
  const status = async () => ({ status: (await store.state()).status });
  const promote = async (remote: 'unverified' | 'verified' | undefined) => {
    if (remote === 'verified') await store.markVerified(new Date().toISOString());
    return await status();
  };
  return Object.freeze({
    status,
    async start(action) {
      const result = await client.start(action, (await store.state()).installationId);
      return result === undefined ? { kind: 'unavailable' as const } : { kind: 'ready' as const, flowUrl: result.flowUrl };
    },
    async refresh() {
      return await promote(await client.status((await store.state()).installationId));
    },
    close() {
      client.close();
    },
  });
}

function toSessionEndpoint(endpoint: PinnedComparison['base']) {
  return {
    label: endpoint.label,
    oid: endpoint.oid,
    ...(endpoint.source?.kind === 'worktree'
      ? {
          worktree: {
            path: endpoint.source.path,
            dirty: endpoint.source.dirty,
          },
        }
      : {}),
  };
}

function receiptComparisonEndpoint(endpoint: PinnedComparison['base']) {
  return {
    label: endpoint.label,
    oid: endpoint.oid,
    ...(endpoint.source === undefined ? {} : { selectorType: endpoint.source.kind }),
  };
}

type ReceiptDrift = Extract<ExportReviewResult, { readonly kind: 'exported'; readonly drift: unknown }>['drift'];
type AcknowledgedReceiptDrift = Extract<ReceiptDrift, { readonly kind: 'acknowledged' }>;
type ReceiptDriftIdentity = AcknowledgedReceiptDrift['identities'][number];

function receiptDriftIdentity(
  endpoint: PinnedComparison['base'],
  status: SelectorDriftResponse['base'],
): ReceiptDriftIdentity {
  const selectorType = endpoint.source?.kind ?? 'branch';
  const pinned = { label: endpoint.label, selectorType, oid: endpoint.oid };
  if (status.kind === 'unavailable') {
    return {
      role: status.role,
      pinned,
      current: {
        kind: 'unavailable',
        label: status.label,
        selectorType: status.selectorType,
        reason: status.reason,
      },
    };
  }
  return {
    role: status.role,
    pinned,
    current: {
      kind: 'available',
      label: status.kind === 'moved' ? status.label : endpoint.label,
      selectorType: status.kind === 'moved' ? status.selectorType : selectorType,
      oid: status.kind === 'moved' ? status.newOid : endpoint.oid,
    },
  };
}

function receiptDrift(
  comparison: PinnedComparison,
  observation: SelectorDriftResponse,
): ReceiptDrift {
  const drifted = observation.base.kind !== 'unchanged' || observation.head.kind !== 'unchanged';
  return drifted
    ? {
        kind: 'acknowledged',
        identities: [
          receiptDriftIdentity(comparison.base, observation.base),
          receiptDriftIdentity(comparison.head, observation.head),
        ],
      }
    : { kind: 'noneObserved' };
}

function languageForPath(path: string | undefined): string {
  const filename = path?.split(/[\\/]/u).at(-1)?.toLowerCase() ?? '';
  if (filename.length === 0) {
    return 'plaintext';
  }
  const namedLanguage = LANGUAGE_BY_BASENAME[filename];
  if (namedLanguage !== undefined) {
    return namedLanguage;
  }
  const extension = filename.split('.').at(-1);
  return extension === undefined ? 'plaintext' : LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext';
}

async function readSide(
  reader: ObjectReader,
  path: ChangedFile['oldPath'],
  blobOid: string,
  mode: string,
): Promise<FileContentResponse['base'] | undefined> {
  if (mode === '000000' || path === undefined) {
    return { exists: false };
  }
  const content = await reader.read(blobOid, { maxBytes: MAX_INLINE_TEXT_BYTES });
  if (content.kind === 'missing') {
    return undefined;
  }
  try {
    return {
      exists: true,
      path,
      language: languageForPath(path.utf8),
      blobOid,
      text: strictTextDecoder.decode(content.bytes),
    };
  } catch {
    return undefined;
  }
}

async function isCompleteExportDirectory(path: string): Promise<boolean> {
  try {
    const directory = await lstat(path);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      return false;
    }
    const names = await readdir(path);
    if (names.length !== 2 || !names.includes('review.json') || !names.includes('review.md')) {
      return false;
    }
    const files = await Promise.all(names.map(async (name) => lstat(join(path, name))));
    return files.every((file) => file.isFile() && !file.isSymbolicLink());
  } catch {
    return false;
  }
}

export function createCapabilityRegistry(
  comparison: PinnedComparison,
  options: CapabilityRegistryOptions = {},
): CapabilityRegistry {
  const storageScope = options.attachedCompletion === undefined
    ? undefined
    : assertAttachedStorageScope(options.attachedCompletion.storageScope);
  const filesByCapability = new Map<string, FileMetadataResponse>();
  const frozenFilesByCapability = new Map<string, ChangedFile>();
  const reader = options.objectReader ?? createObjectReader(comparison.repositoryRoot);
  const draftStore =
    options.draftStore ??
    createDraftStore({
      repositoryRoot: comparison.repositoryRoot,
      comparison: comparison.range === undefined
        ? {
            baseCommitOid: comparison.base.oid,
            headCommitOid: comparison.head.oid,
            mergeBaseOid: comparison.mergeBaseOid,
          }
        : {
            baseCommitOid: comparison.base.oid,
            headCommitOid: comparison.head.oid,
            mergeBaseOid: comparison.mergeBaseOid,
            range: comparison.range,
          },
      ...(storageScope === undefined ? {} : { storageScope }),
    });
  const selectorDriftObserver =
    options.selectorDriftObserver ?? createSelectorDriftObserver(comparison);
  const acknowledgements = new Map<string, string>();



  const session = SessionResponseSchema.parse({
    base: toSessionEndpoint(comparison.base),
    head: toSessionEndpoint(comparison.head),
    mergeBaseOid: comparison.mergeBaseOid,
    ...(comparison.range === undefined
      ? {}
      : {
          range: {
            kind: comparison.range.kind,
            baseOid: comparison.range.baseOid,
            headOid: comparison.range.headOid,
            pathspecs: comparison.range.pathspecs,
          },
        }),
    ...(options.attachedCompletion === undefined ? {} : { attached: { kind: 'agent-review' as const } }),
    ...(options.support === undefined ? {} : { support: { enabled: true as const } }),

    files: comparison.changedFiles.map((file) => {
      const status =
        file.status.similarity === null
          ? { kind: file.status.kind }
          : { kind: file.status.kind, similarity: file.status.similarity };
      const sessionFile = {
        fileId: file.id,
        status,
        oldMode: file.oldMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      };
      const metadata = FileMetadataResponseSchema.parse({
        ...sessionFile,
        oldMode: file.oldMode,
        newMode: file.newMode,
      });

      filesByCapability.set(file.id, metadata);
      frozenFilesByCapability.set(file.id, file);
      return sessionFile;
    }),
  });

  const verifyAnchor = async (anchor: DurableAnchorV1): Promise<AnchorVerification> => {
    for (const file of frozenFilesByCapability.values()) {
      const path = anchor.side === 'base' ? file.oldPath : file.newPath;
      const blobOid = anchor.side === 'base' ? file.oldBlobOid : file.newBlobOid;
      const mode = anchor.side === 'base' ? file.oldMode : file.newMode;
      if (file.availability.kind !== 'text' || path === undefined || path.bytesBase64url !== anchor.path.bytesBase64url || blobOid !== anchor.blobOid) continue;
      const side = await readSide(reader, path, blobOid, mode);
      if (side === undefined || !side.exists) return { state: 'orphaned', reason: 'anchor-unavailable' };
      try {
        return verifyDurableAnchor(anchor, buildDurableAnchor({
          path: side.path,
          safeDisplayPath: side.path.display,
          side: anchor.side,
          blobOid: side.blobOid,
          line: anchor.line,
          endLine: anchor.endLine,
          text: side.text,
        }));
      } catch {
        return { state: 'orphaned', reason: 'anchor-unavailable' };
      }
    }
    return { state: 'orphaned', reason: 'anchor-unavailable' };
  };

  const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
    status: () => options.attachedCompletion!.coordinator.status(),
    markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
    finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
      return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
        const settled = await draftStore.settle(expectedRevision, {
          prepare: async (acceptedDraft) => {
            const observation = await selectorDriftObserver.observe();
            if (observation.base.kind !== 'unchanged' || observation.head.kind !== 'unchanged' || comparison.range === undefined) {
              return { kind: 'scopeInvalid' as const };
            }
            const verification = Object.fromEntries(await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)));
            const affectedCommentIds = acceptedDraft.comments.filter((comment) => verification[comment.id]?.state !== 'verified').map((comment) => comment.id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const range = comparison.range;
              const exportedAt = new Date().toISOString();
              const bytes = canonicalizeReviewExport(buildReviewExportV2({
                acceptedDraft,
                commentVerification: verification,
                comparison: {
                  selectedBase: { label: range.requestedBase, launchOid: range.baseOid },
                  selectedHead: { label: range.requestedHead, launchOid: range.headOid },
                  mergeBaseOid: range.baseOid,
                  comparisonKey: range.reviewKey,
                },
                drift: {
                  observedAt: exportedAt,
                  acknowledged: false,
                  base: { launchOid: comparison.base.oid, currentOid: comparison.base.oid, status: 'unchanged' as const },
                  head: { launchOid: comparison.head.oid, currentOid: comparison.head.oid, status: 'unchanged' as const },
                },
              }, range, exportedAt));
              return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
          },
          finalize: async ({ draft, prepared }) => {
            if (prepared.kind !== 'ready') return prepared;
            const observation = await selectorDriftObserver.observe();
            if (observation.base.kind !== 'unchanged' || observation.head.kind !== 'unchanged') return { kind: 'scopeInvalid' as const };
            const affectedCommentIds = (await Promise.all(draft.comments.map(async (comment) => ({ id: comment.id, verification: await verifyAnchor(comment.anchor) })))).filter(({ verification }) => verification.state !== 'verified').map(({ id }) => id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const document = parseCanonicalReviewExport(prepared.bytes);
              if (document.schemaVersion !== 2 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
            try {
              if (!await options.attachedCompletion!.deliver(prepared.bytes)) {
                return { kind: 'deliveryFailed' as const };
              }
              return { kind: 'completed' as const, revision: prepared.revision };
            } catch {
              return { kind: 'deliveryFailed' as const };
            }
          },
        });
        if (settled.kind === 'accepted') return settled.value;
        if (settled.kind === 'revisionConflict') return { kind: 'revisionConflict', expectedRevision: settled.expectedRevision, actualRevision: settled.actualRevision };
        if (settled.kind === 'draftChanged') return { kind: 'revisionConflict', expectedRevision, actualRevision: settled.actualRevision };
        return settled.kind === 'readOnly' ? { kind: 'draftReadOnly' } : { kind: 'persistenceFailure' };
      });
    },
  };

  return Object.freeze({
    session: async () => session,
    attachedCompletion,
    onAnchorAdd: options.onAnchorAdd,
    draftStore,
    selectorDriftObserver,
    support: options.support,
    async revealDraftFile() {
      if (options.revealDraftFile === undefined) {
        throw new Error('Draft reveal adapter is unavailable.');
      }
      await options.revealDraftFile(draftStore.canonicalPath);
    },
    async lookup(fileId: string) {
      options.onCapabilityLookup?.(fileId);
      return filesByCapability.get(fileId);
    },
    async revealExportDirectory() {
      const managedRoot = await ensureManagedExportsRoot(comparison.repositoryRoot, false);
      const exportName = storageScope
        ?? comparison.range?.reviewKey
        ?? `${comparison.base.oid}..${comparison.head.oid}`;
      const exportDirectory = managedRoot === undefined
        ? undefined
        : join(managedRoot.exportsRoot, exportName);
      if (
        options.revealDraftFile === undefined
        || managedRoot === undefined
        || exportDirectory === undefined
      ) {
        throw new Error('Export reveal adapter is unavailable.');
      }
      await assertManagedExportsRoot(managedRoot);
      if (!(await isCompleteExportDirectory(exportDirectory))) {
        throw new Error('Export reveal adapter is unavailable.');
      }
      await assertManagedExportsRoot(managedRoot);
      await options.revealDraftFile(exportDirectory);
    },
    async inspectCumpaIgnore() {
      const status = await inspectCumpaIgnore({
        repositoryRoot: comparison.repositoryRoot,
      });
      return CumpaIgnoreStatusSchema.parse({
        kind: status.kind === 'not-ignored' ? 'notIgnored' : status.kind,
      });
    },
    async appendCumpaIgnoreRule() {
      return AppendCumpaIgnoreResultSchema.parse(
        await appendCumpaIgnoreRule({
          repositoryRoot: comparison.repositoryRoot,
        }),
      );
    },
    async exportReview(input: ExportReviewRequest): Promise<ExportReviewResult> {
      const initial = await draftStore.loadState();
      if (initial.kind !== 'current') {
        return ExportReviewResultSchema.parse({ kind: 'draftReadOnly' });
      }
      if (initial.draft.revision !== input.expectedRevision) {
        return ExportReviewResultSchema.parse({
          kind: 'revisionConflict',
          expectedRevision: input.expectedRevision,
          actualRevision: initial.draft.revision,
        });
      }

      const observation = await selectorDriftObserver.observe();
      const observationFingerprint = createHash('sha256').update(JSON.stringify(observation)).digest('base64url');
      const drifted = observation.base.kind !== 'unchanged' || observation.head.kind !== 'unchanged';
      if (drifted && acknowledgements.get(input.driftAcknowledgementToken ?? '') !== observationFingerprint) {
        const acknowledgementToken = randomBytes(32).toString('base64url');
        acknowledgements.set(acknowledgementToken, observationFingerprint);
        return ExportReviewResultSchema.parse({
          kind: input.driftAcknowledgementToken === undefined ? 'driftAcknowledgementRequired' : 'driftAcknowledgementStale',
          acknowledgementToken,
          observation,
        });
      }

      const acceptedDraft = structuredClone(initial.draft);
      const draftFingerprint = createHash('sha256').update(initial.raw).digest('hex');
      const exportedAt = new Date().toISOString();
      const commentVerification = Object.fromEntries(
        await Promise.all(
          acceptedDraft.comments.map(async (comment) => [comment.id, await this.verifyAnchor(comment.anchor)] as const),
        ),
      );
    const range = comparison.range;
    if (range !== undefined && (range.baseOid !== comparison.base.oid || range.headOid !== comparison.head.oid)) {
      throw new Error('Frozen comparison does not match its range provenance.');
    }
    const exportSnapshot = {
      acceptedDraft,
      commentVerification,
      comparison: range === undefined
        ? {
          selectedBase: { label: comparison.base.label, launchOid: comparison.base.oid },
          selectedHead: { label: comparison.head.label, launchOid: comparison.head.oid },
          mergeBaseOid: comparison.mergeBaseOid,
          comparisonKey: comparisonKey(comparison.base.oid, comparison.head.oid),
        }
        : {
          selectedBase: { label: range.requestedBase, launchOid: range.baseOid },
          selectedHead: { label: range.requestedHead, launchOid: range.headOid },
          mergeBaseOid: range.baseOid,
          comparisonKey: range.reviewKey,
        },
      drift: {
        observedAt: exportedAt,
        acknowledged: drifted,
        base: {
          launchOid: comparison.base.oid,
          currentOid: observation.base.kind === 'moved' ? observation.base.newOid : observation.base.kind === 'unchanged' ? comparison.base.oid : null,
          status: observation.base.kind,
        },
        head: {
          launchOid: comparison.head.oid,
          currentOid: observation.head.kind === 'moved' ? observation.head.newOid : observation.head.kind === 'unchanged' ? comparison.head.oid : null,
          status: observation.head.kind,
        },
      },
    };
    const document = range === undefined
      ? buildReviewExportV1(exportSnapshot, exportedAt)
      : buildReviewExportV2(exportSnapshot, range, exportedAt);
      const json = canonicalizeReviewExport(document);
      const markdown = Buffer.from(renderReviewMarkdown(json), 'utf8');
      const published = await publishReviewExport({
        repositoryRoot: comparison.repositoryRoot,
        identity: range === undefined
          ? { kind: 'interactive', baseOid: comparison.base.oid, headOid: comparison.head.oid }
          : { kind: 'range', reviewKey: range.reviewKey },
        ...(storageScope === undefined ? {} : { storageScope }),
        json,
        markdown,
        reExportCapability: await getObservedNativeExchangeCapability(),
        revalidate: async () => {
          const current = await draftStore.loadState();
          if (
            current.kind !== 'current' ||
            current.draft.revision !== acceptedDraft.revision ||
            createHash('sha256').update(current.raw).digest('hex') !== draftFingerprint
          ) {
            return false;
          }
          return createHash('sha256').update(JSON.stringify(await selectorDriftObserver.observe())).digest('base64url') === observationFingerprint;
        },
      });
      if (published.kind !== 'exported') {
        return ExportReviewResultSchema.parse({ kind: published.kind });
      }
      return ExportReviewResultSchema.parse({
        kind: 'exported',
        draftRevision: acceptedDraft.revision,
        exportedAt,
        drift: receiptDrift(comparison, observation),
        comparison: {
          base: receiptComparisonEndpoint(comparison.base),
          head: receiptComparisonEndpoint(comparison.head),
        },
        files: published.receipt.files,
      });
    },
    async readContent(fileId: string) {
      const file = frozenFilesByCapability.get(fileId);
      if (file === undefined || file.availability.kind !== 'text') {
        return undefined;
      }
      const [base, head] = await Promise.all([
        readSide(reader, file.oldPath, file.oldBlobOid, file.oldMode),
        readSide(reader, file.newPath, file.newBlobOid, file.newMode),
      ]);
      if (base === undefined || head === undefined) {
        return undefined;
      }
      return FileContentResponseSchema.parse({ fileId, base, head });
    },
    async readRelativeImage(fileId, side, relativeSrc) {
      const file = frozenFilesByCapability.get(fileId);
      const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
      return resolveImageBytes(markdownPath, relativeSrc, (resolvedPath) =>
        readCommittedImageBytes(
          comparison.repositoryRoot,
          side === 'base' ? comparison.base.oid : comparison.head.oid,
          resolvedPath,
          createGitRunner(),
          reader,
        ),
      );
    },
    verifyAnchor,
  });
}

export async function createExactPatchCapabilityRegistry(
  grounded: GroundedExactPatch,
  snapshot: PatchSnapshot,
  options: CapabilityRegistryOptions = {},
): Promise<CapabilityRegistry> {
  const storageScope = options.attachedCompletion === undefined
    ? undefined
    : assertAttachedStorageScope(options.attachedCompletion.storageScope);
  const sessionResponse = async () => SessionResponseSchema.parse({
    ...(await snapshot.session()),
    ...(options.attachedCompletion === undefined ? {} : { attached: { kind: 'agent-review' as const } }),
    ...(options.support === undefined ? {} : { support: { enabled: true as const } }),
  });
  const session = await sessionResponse();
  if (!('patch' in session)) throw new Error('Exact patch snapshot did not provide patch provenance.');
  const patchSession = session.patch;
  const draftStore = options.draftStore ?? createDraftStore({
    repositoryRoot: grounded.repositoryRoot,
    comparison: {
      kind: 'exact-patch',
      digest: patchSession.digest,
      validationTarget: patchSession.validationTarget,
      reviewKey: patchSession.reviewKey,
    },
    ...(storageScope === undefined ? {} : { storageScope }),
  });

  const verifyAnchor = async (anchor: DurableAnchorV1): Promise<AnchorVerification> => {
    const file = (await snapshot.files()).find((candidate) => {
      const path = anchor.side === 'base' ? candidate.oldPath : candidate.newPath;
      const blobOid = anchor.side === 'base' ? candidate.oldBlobOid : candidate.newBlobOid;
      return path?.bytesBase64url === anchor.path.bytesBase64url && blobOid === anchor.blobOid;
    });
    if (file === undefined) return { state: 'orphaned', reason: 'anchor-unavailable' };
    const content = await snapshot.readContent(file.id);
    const bytes = anchor.side === 'base' ? content?.preimage : content?.postimage;
    const path = anchor.side === 'base' ? file.oldPath : file.newPath;
    if (bytes === undefined || path === undefined) return { state: 'orphaned', reason: 'anchor-unavailable' };
    return verifyDurableAnchor(
      anchor,
      buildDurableAnchor({
        path,
        safeDisplayPath: path.display,
        side: anchor.side,
        blobOid: anchor.blobOid,
        line: anchor.line,
        endLine: anchor.endLine,
        text: strictTextDecoder.decode(bytes),
      }),
    );
  };

  const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
    status: () => options.attachedCompletion!.coordinator.status(),
    markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
    finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
      return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
        const settled = await draftStore.settle(expectedRevision, {
          prepare: async (acceptedDraft) => {
            const patch = await snapshot.exportScope();
            if (patch.snapshot.status !== 'unchanged') return { kind: 'scopeInvalid' as const };
            const verification = Object.fromEntries(await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)));
            const affectedCommentIds = acceptedDraft.comments.filter((comment) => verification[comment.id]?.state !== 'verified').map((comment) => comment.id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const bytes = canonicalizeReviewExport(buildReviewExportV3({ acceptedDraft, commentVerification: verification }, patch, new Date().toISOString()));
              return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
          },
          finalize: async ({ draft, prepared }) => {
            if (prepared.kind !== 'ready') return prepared;
            if ((await snapshot.exportScope()).snapshot.status !== 'unchanged') return { kind: 'scopeInvalid' as const };
            const affectedCommentIds = (await Promise.all(draft.comments.map(async (comment) => ({ id: comment.id, verification: await verifyAnchor(comment.anchor) })))).filter(({ verification }) => verification.state !== 'verified').map(({ id }) => id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const document = parseCanonicalReviewExport(prepared.bytes);
              if (document.schemaVersion !== 3 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
            try {
              if (!await options.attachedCompletion!.deliver(prepared.bytes)) {
                return { kind: 'deliveryFailed' as const };
              }
              return { kind: 'completed' as const, revision: prepared.revision };
            } catch {
              return { kind: 'deliveryFailed' as const };
            }
          },
        });
        if (settled.kind === 'accepted') return settled.value;
        if (settled.kind === 'revisionConflict') return { kind: 'revisionConflict', expectedRevision: settled.expectedRevision, actualRevision: settled.actualRevision };
        if (settled.kind === 'draftChanged') return { kind: 'revisionConflict', expectedRevision, actualRevision: settled.actualRevision };
        return settled.kind === 'readOnly' ? { kind: 'draftReadOnly' } : { kind: 'persistenceFailure' };
      });
    },
  };

  return Object.freeze({
    isExactPatch: true as const,
    session: sessionResponse,
    attachedCompletion,
    onAnchorAdd: options.onAnchorAdd,
    draftStore,
    support: options.support,
    patchStatus: async () => {
      const status = await snapshot.observe();
      return PatchStatusResponseSchema.parse(
        status === 'snapshotUnavailable'
          ? { kind: 'snapshotUnavailable' }
          : { kind: status, validationTargetLabel: snapshot.validationTargetLabel },
      );
    },
    async lookup(fileId) {
      options.onCapabilityLookup?.(fileId);
      const file = await snapshot.lookup(fileId);
      if (file === undefined) return undefined;
      return FileMetadataResponseSchema.parse({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        newMode: file.newMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      });
    },
    async readContent(fileId) {
      const content = await snapshot.readContent(fileId);
      if (content === undefined) return undefined;
      const { file, preimage, postimage } = content;
      const makeSide = (
        bytes: Buffer | undefined,
        path: ChangedFile['oldPath'],
        mode: string,
        blobOid: string,
      ) => bytes === undefined || path === undefined || mode === '000000'
        ? { exists: false as const }
        : {
            exists: true as const,
            path,
            language: languageForPath(path.utf8),
            blobOid,
            text: strictTextDecoder.decode(bytes),
          };
      return FileContentResponseSchema.parse({
        fileId,
        base: makeSide(preimage, file.oldPath, file.oldMode, file.oldBlobOid),
        head: makeSide(postimage, file.newPath, file.newMode, file.newBlobOid),
      });
    },
    async readRelativeImage(fileId, side, relativeSrc) {
      const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
      const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
      return resolveImageBytes(markdownPath, relativeSrc, async (resolvedPath) => {
        if (side === 'base') {
          const changedEntry = findChangedImageEntry(await snapshot.files(), resolvedPath);
          if (changedEntry !== undefined) {
            // Image is itself part of the diff: serve the materialized, digest-verified
            // preimage (or nothing, if it did not exist at base) instead of live disk bytes.
            return changedEntry.oldMode === '000000' ? undefined : snapshot.readPreimageBytes(changedEntry.id);
          }
        }
        return readWorktreeImageBytes(grounded.repositoryRoot, resolvedPath); // unchanged sibling asset, or head side
      });
    },
    verifyAnchor,
    async revealDraftFile() {
      if (options.revealDraftFile === undefined) throw new Error('Draft reveal adapter is unavailable.');
      await options.revealDraftFile(draftStore.canonicalPath);
    },
    async revealExportDirectory() {
      if (options.revealDraftFile === undefined) throw new Error('Export reveal adapter is unavailable.');
      const managedRoot = await ensureManagedExportsRoot(grounded.repositoryRoot, false);
      if (managedRoot === undefined) throw new Error('Export reveal adapter is unavailable.');
      const exportDirectory = join(managedRoot.exportsRoot, storageScope ?? patchSession.reviewKey);
      await assertManagedExportsRoot(managedRoot);
      if (!(await isCompleteExportDirectory(exportDirectory))) throw new Error('Export reveal adapter is unavailable.');
      await assertManagedExportsRoot(managedRoot);
      await options.revealDraftFile(exportDirectory);
    },
    async exportReview(input) {
      const initial = await draftStore.loadState();
      if (initial.kind !== 'current') return ExportReviewResultSchema.parse({ kind: 'draftReadOnly' });
      if (initial.draft.revision !== input.expectedRevision) {
        return ExportReviewResultSchema.parse({
          kind: 'revisionConflict',
          expectedRevision: input.expectedRevision,
          actualRevision: initial.draft.revision,
        });
      }
      const acceptedDraft = structuredClone(initial.draft);
      const draftFingerprint = createHash('sha256').update(initial.raw).digest('hex');
      const patch = await snapshot.exportScope();
      const exportedAt = new Date().toISOString();
      const commentVerification = Object.fromEntries(
        await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)),
      );
      const json = canonicalizeReviewExport(buildReviewExportV3(
        { acceptedDraft, commentVerification },
        patch,
        exportedAt,
      ));
      const published = await publishReviewExport({
        repositoryRoot: grounded.repositoryRoot,
        identity: { kind: 'exact-patch', reviewKey: patch.reviewKey },
        ...(storageScope === undefined ? {} : { storageScope }),
        json,
        markdown: Buffer.from(renderReviewMarkdown(json), 'utf8'),
        reExportCapability: await getObservedNativeExchangeCapability(),
        revalidate: async () => {
          const current = await draftStore.loadState();
          if (
            current.kind !== 'current'
            || current.draft.revision !== acceptedDraft.revision
            || createHash('sha256').update(current.raw).digest('hex') !== draftFingerprint
          ) {
            return false;
          }
          return (await snapshot.exportScope()).snapshot.status === patch.snapshot.status;
        },
      });
      if (published.kind !== 'exported') return ExportReviewResultSchema.parse({ kind: published.kind });
      return ExportReviewResultSchema.parse({
        kind: 'exported',
        draftRevision: acceptedDraft.revision,
        exportedAt,
        patch: {
          digest: patch.digest,
          validationTarget: patch.validationTarget,
          reviewKey: patch.reviewKey,
          snapshot: { status: patch.snapshot.status },
        },
        files: published.receipt.files,
      });
    },
    async inspectCumpaIgnore() {
      return CumpaIgnoreStatusSchema.parse({ kind: 'unavailable' });
    },
    async appendCumpaIgnoreRule() {
      return AppendCumpaIgnoreResultSchema.parse({ kind: 'unconfirmed' });
    },
  });
}

export async function createUncommittedCapabilityRegistry(
  scope: UncommittedScope,
  snapshot: WorktreeSnapshot,
  options: CapabilityRegistryOptions = {},
): Promise<CapabilityRegistry> {
  if (scope.sourceKind === 'standalone') {
    throw new RangeError(
      'Unreachable: createUncommittedCapabilityRegistry does not support standalone scopes; standalone sessions use a dedicated capability registry.',
    );
  }
  const sourceKind = scope.sourceKind;
  const storageScope = options.attachedCompletion === undefined
    ? undefined
    : assertAttachedStorageScope(options.attachedCompletion.storageScope);
  const snapshotSession = await snapshot.session();
  const reviewKey = uncommittedReviewKey(scope.sourceKind, scope.baseCommitOid, snapshotSession.chain[0]!);
  // WR-01: WorktreeSnapshot never captures image bytes (it only captures
  // text-availability sides), so a dedicated ObjectReader is needed to
  // serve the base-side blob of an image that is itself part of the diff.
  const reader = options.objectReader ?? createObjectReader(scope.repositoryRoot);

  const sessionResponse = async () => {
    const files = await snapshot.files();
    return SessionResponseSchema.parse({
      uncommitted: {
        kind: 'uncommitted' as const,
        sourceKind: scope.sourceKind,
        ...(scope.baseCommitOid === undefined ? {} : { baseCommitOid: scope.baseCommitOid }),
        reviewKey,
        changedFileCount: files.length,
        ...(options.uncommittedRecoveryCandidate === undefined ? {} : { recoveryAvailable: true as const }),
      },
      files: files.map((file) => ({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      })),
      ...(options.attachedCompletion === undefined ? {} : { attached: { kind: 'agent-review' as const } }),
      ...(options.support === undefined ? {} : { support: { enabled: true as const } }),
    });
  };

  const draftStore = options.draftStore ?? createDraftStore({
    repositoryRoot: scope.repositoryRoot,
    comparison: {
      kind: 'uncommitted',
      sourceKind: scope.sourceKind,
      ...(scope.baseCommitOid === undefined ? {} : { baseCommitOid: scope.baseCommitOid }),
      reviewKey,
      snapshotChain: snapshotSession.chain,
    },
    ...(storageScope === undefined ? {} : { storageScope }),
  });

  const verifyAnchor = async (anchor: DurableAnchorV1): Promise<AnchorVerification> => {
    const file = (await snapshot.files()).find((candidate) => {
      const path = anchor.side === 'base' ? candidate.oldPath : candidate.newPath;
      return path?.bytesBase64url === anchor.path.bytesBase64url;
    });
    if (file === undefined) return { state: 'orphaned', reason: 'anchor-unavailable' };
    const content = await snapshot.readContent(file.id);
    const bytes = anchor.side === 'base' ? content?.preimage : content?.postimage;
    const blobOid = anchor.side === 'base' ? content?.preimageBlobOid : content?.postimageBlobOid;
    const path = anchor.side === 'base' ? file.oldPath : file.newPath;
    if (bytes === undefined || path === undefined || blobOid === undefined || blobOid !== anchor.blobOid) {
      return { state: 'orphaned', reason: 'anchor-unavailable' };
    }
    return verifyDurableAnchor(
      anchor,
      buildDurableAnchor({
        path,
        safeDisplayPath: path.display,
        side: anchor.side,
        blobOid: anchor.blobOid,
        line: anchor.line,
        endLine: anchor.endLine,
        text: strictTextDecoder.decode(bytes),
      }),
    );
  };

  const diskPathFor = (file: ChangedFile): string | undefined => {
    const path = file.newPath ?? file.oldPath;
    if (path === undefined) return undefined;
    return join(scope.repositoryRoot, Buffer.from(decodeBase64url(path.bytesBase64url)).toString('utf8'));
  };

  const indexStatIdentity = async (): Promise<Readonly<{ readonly size: number; readonly mtimeMs: number }>> => {
    const runner = createGitRunner();
    const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: scope.repositoryRoot });
    const indexPathRaw = result.stdout.toString('utf8').trim();
    const resolvedIndexPath = indexPathRaw.startsWith('/') ? indexPathRaw : join(scope.repositoryRoot, indexPathRaw);
    const info = await lstat(resolvedIndexPath);
    return { size: info.size, mtimeMs: info.mtimeMs };
  };

  type StatIdentity = Readonly<{ readonly size: number; readonly mtimeMs: number }>;

  const captureChangeBaseline = async (): Promise<Readonly<{
    readonly index: StatIdentity;
    readonly files: ReadonlyMap<string, StatIdentity | undefined>;
  }>> => {
    const index = await indexStatIdentity();
    const files = await snapshot.files();
    const fileStats = new Map<string, StatIdentity | undefined>();
    for (const file of files) {
      const diskPath = diskPathFor(file);
      if (diskPath === undefined) continue;
      try {
        const info = await lstat(diskPath);
        fileStats.set(file.id, { size: info.size, mtimeMs: info.mtimeMs });
      } catch {
        fileStats.set(file.id, undefined);
      }
    }
    return Object.freeze({ index, files: fileStats });
  };

  let changeBaseline = await captureChangeBaseline();

  const collectWorkingTreeDrift = async (): Promise<WorkingTreeDriftFlag> => {
    const index = await indexStatIdentity();
    const indexChanged = index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs;
    const changedPaths: NonNullable<ChangedFile['newPath']>[] = [];
    const files = await snapshot.files();
    for (const file of files) {
      const diskPath = diskPathFor(file);
      if (diskPath === undefined) continue;
      const expected = changeBaseline.files.get(file.id);
      let actual: StatIdentity | undefined;
      try {
        const info = await lstat(diskPath);
        actual = { size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        actual = undefined;
      }
      const changed = expected === undefined
        ? actual !== undefined
        : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
      if (!changed) continue;
      const path = file.newPath ?? file.oldPath;
      if (path !== undefined) changedPaths.push(path);
    }
    return { changed: indexChanged || changedPaths.length > 0, paths: changedPaths };
  };

  const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
    status: () => options.attachedCompletion!.coordinator.status(),
    markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
    finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
      return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
        const settled = await draftStore.settle(expectedRevision, {
          prepare: async (acceptedDraft) => {
            const drift = await collectWorkingTreeDrift();
            const verification = Object.fromEntries(await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)));
            const affectedCommentIds = acceptedDraft.comments.filter((comment) => verification[comment.id]?.state !== 'verified').map((comment) => comment.id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const exportedAt = new Date().toISOString();
              const bytes = canonicalizeReviewExport(buildReviewExportV5(
                { acceptedDraft, commentVerification: verification },
                {
                  sourceKind,
                  baseCommitOid: scope.baseCommitOid,
                  pathspecs: options.requestPathspecs ?? [],
                  reviewKey,
                  snapshotChain: snapshotSession.chain,
                },
                drift,
                exportedAt,
              ));
              return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
          },
          finalize: async ({ draft, prepared }) => {
            if (prepared.kind !== 'ready') return prepared;
            const affectedCommentIds = (await Promise.all(draft.comments.map(async (comment) => ({ id: comment.id, verification: await verifyAnchor(comment.anchor) })))).filter(({ verification }) => verification.state !== 'verified').map(({ id }) => id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const document = parseCanonicalReviewExport(prepared.bytes);
              if (document.schemaVersion !== 5 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
            try {
              if (!await options.attachedCompletion!.deliver(prepared.bytes)) {
                return { kind: 'deliveryFailed' as const };
              }
              return { kind: 'completed' as const, revision: prepared.revision };
            } catch {
              return { kind: 'deliveryFailed' as const };
            }
          },
        });
        if (settled.kind === 'accepted') return settled.value;
        if (settled.kind === 'revisionConflict') return { kind: 'revisionConflict', expectedRevision: settled.expectedRevision, actualRevision: settled.actualRevision };
        if (settled.kind === 'draftChanged') return { kind: 'revisionConflict', expectedRevision, actualRevision: settled.actualRevision };
        return settled.kind === 'readOnly' ? { kind: 'draftReadOnly' } : { kind: 'persistenceFailure' };
      });
    },
  };

  return Object.freeze({
    session: sessionResponse,
    attachedCompletion,
    onAnchorAdd: options.onAnchorAdd,
    draftStore,
    support: options.support,
    async refresh() {
      const stateBefore = await draftStore.loadState();
      const commentsBefore = stateBefore.kind === 'current' ? stateBefore.draft.comments : [];
      const verificationBefore = new Map<string, AnchorVerification>();
      for (const comment of commentsBefore) {
        verificationBefore.set(comment.id, await verifyAnchor(comment.anchor));
      }
      const delta = await snapshot.refresh();
      changeBaseline = await captureChangeBaseline();
      let staleCount = 0;
      let orphanedCount = 0;
      for (const comment of commentsBefore) {
        if (verificationBefore.get(comment.id)?.state !== 'verified') continue;
        const after = await verifyAnchor(comment.anchor);
        if (after.state === 'stale') staleCount += 1;
        else if (after.state === 'orphaned') orphanedCount += 1;
      }
      return {
        added: delta.added,
        removed: delta.removed,
        modified: delta.modified,
        staleCount,
        orphanedCount,
      };
    },
    async worktreeChangeIndicator() {
      const index = await indexStatIdentity();
      if (index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs) {
        return { changed: true };
      }
      const files = await snapshot.files();
      for (const file of files) {
        const diskPath = diskPathFor(file);
        if (diskPath === undefined) continue;
        const expected = changeBaseline.files.get(file.id);
        let actual: StatIdentity | undefined;
        try {
          const info = await lstat(diskPath);
          actual = { size: info.size, mtimeMs: info.mtimeMs };
        } catch {
          actual = undefined;
        }
        const changed = expected === undefined
          ? actual !== undefined
          : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
        if (changed) return { changed: true };
      }
      return { changed: false };
    },
    ...(options.uncommittedRecoveryCandidate === undefined ? {} : {
      async recoverUncommittedDraft() {
        const comments = await loadUncommittedDraftCandidateComments(options.uncommittedRecoveryCandidate!.path);
        if (comments === undefined) return { kind: 'unavailable' as const };
        const state = await draftStore.loadState();
        let revision = state.kind === 'current' ? state.draft.revision : 0;
        for (const comment of comments) {
          const added = await draftStore.mutate({
            expectedRevision: revision,
            mutation: { type: 'addComment', body: comment.body, anchor: comment.anchor },
          });
          if (added.kind === 'invalidTarget') continue;
          if (added.kind !== 'accepted') return { kind: 'unavailable' as const };
          revision = added.draft.revision;
          if (comment.state !== 'resolved') continue;
          const newId = added.draft.comments[added.draft.comments.length - 1]!.id;
          const resolved = await draftStore.mutate({
            expectedRevision: revision,
            mutation: { type: 'resolveComment', commentId: newId },
          });
          if (resolved.kind !== 'accepted') return { kind: 'unavailable' as const };
          revision = resolved.draft.revision;
        }
        return { kind: 'recovered' as const };
      },
    }),
    async lookup(fileId) {
      options.onCapabilityLookup?.(fileId);
      const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
      if (file === undefined) return undefined;
      return FileMetadataResponseSchema.parse({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        newMode: file.newMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      });
    },
    async readContent(fileId) {
      const content = await snapshot.readContent(fileId);
      if (content === undefined) return undefined;
      const { file, preimage, preimageBlobOid, postimage, postimageBlobOid } = content;
      const makeSide = (
        bytes: Buffer | undefined,
        path: ChangedFile['oldPath'],
        mode: string,
        blobOid: string,
      ) => bytes === undefined || path === undefined || mode === '000000'
        ? { exists: false as const }
        : {
            exists: true as const,
            path,
            language: languageForPath(path.utf8),
            blobOid,
            text: strictTextDecoder.decode(bytes),
          };
      return FileContentResponseSchema.parse({
        fileId,
        base: makeSide(preimage, file.oldPath, file.oldMode, preimageBlobOid),
        head: makeSide(postimage, file.newPath, file.newMode, postimageBlobOid),
      });
    },
    async readRelativeImage(fileId, side, relativeSrc) {
      const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
      const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
      return resolveImageBytes(markdownPath, relativeSrc, async (resolvedPath) => {
        if (side === 'base') {
          const changedEntry = findChangedImageEntry(await snapshot.files(), resolvedPath);
          if (changedEntry !== undefined) {
            // Image is itself part of the diff: serve its base blob via the
            // object store instead of the live disk (which is the head side).
            return changedEntry.oldMode === '000000' ? undefined : readObjectBackedImage(reader, changedEntry.oldBlobOid);
          }
        }
        return readWorktreeImageBytes(scope.repositoryRoot, resolvedPath); // unchanged sibling asset, or head side
      });
    },
    verifyAnchor,
    async revealDraftFile() {
      if (options.revealDraftFile === undefined) throw new Error('Draft reveal adapter is unavailable.');
      await options.revealDraftFile(draftStore.canonicalPath);
    },
    async inspectCumpaIgnore() {
      return CumpaIgnoreStatusSchema.parse({ kind: 'unavailable' });
    },
    async appendCumpaIgnoreRule() {
      return AppendCumpaIgnoreResultSchema.parse({ kind: 'unconfirmed' });
    },
  });
}

export async function createStandaloneCapabilityRegistry(
  scope: UncommittedScope,
  snapshot: WorktreeSnapshot,
  options: CapabilityRegistryOptions = {},
): Promise<CapabilityRegistry> {
  if (scope.sourceKind !== 'standalone') {
    throw new RangeError(
      'Unreachable: createStandaloneCapabilityRegistry only supports standalone scopes; non-standalone scopes use createUncommittedCapabilityRegistry.',
    );
  }
  const storageScope = options.attachedCompletion === undefined
    ? undefined
    : assertAttachedStorageScope(options.attachedCompletion.storageScope);
  const snapshotSession = await snapshot.session();
  const reviewKey = standaloneReviewKey([...scope.standaloneArguments!].sort(), snapshotSession.chain[0]!);
  // WR-01: WorktreeSnapshot never captures image bytes (it only captures
  // text-availability sides), so a dedicated ObjectReader is needed to
  // serve the base-side blob of an image that is itself part of the diff.
  const reader = options.objectReader ?? createObjectReader(scope.repositoryRoot);

  const sessionResponse = async () => {
    const files = await snapshot.files();
    return SessionResponseSchema.parse({
      uncommitted: {
        kind: 'uncommitted' as const,
        sourceKind: scope.sourceKind,
        ...(scope.baseCommitOid === undefined ? {} : { baseCommitOid: scope.baseCommitOid }),
        reviewKey,
        changedFileCount: files.length,
      },
      files: files.map((file) => ({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
        ...(file.standaloneGitState === undefined ? {} : { standaloneGitState: file.standaloneGitState }),
      })),
      ...(options.attachedCompletion === undefined ? {} : { attached: { kind: 'agent-review' as const } }),
      ...(options.support === undefined ? {} : { support: { enabled: true as const } }),
    });
  };

  const draftStore = options.draftStore ?? createDraftStore({
    repositoryRoot: scope.repositoryRoot,
    comparison: {
      kind: 'uncommitted',
      sourceKind: scope.sourceKind,
      ...(scope.baseCommitOid === undefined ? {} : { baseCommitOid: scope.baseCommitOid }),
      reviewKey,
      snapshotChain: snapshotSession.chain,
    },
    ...(storageScope === undefined ? {} : { storageScope }),
  });

  const verifyAnchor = async (anchor: DurableAnchorV1): Promise<AnchorVerification> => {
    const file = (await snapshot.files()).find((candidate) => {
      const path = anchor.side === 'base' ? candidate.oldPath : candidate.newPath;
      return path?.bytesBase64url === anchor.path.bytesBase64url;
    });
    if (file === undefined) return { state: 'orphaned', reason: 'anchor-unavailable' };
    const content = await snapshot.readContent(file.id);
    const bytes = anchor.side === 'base' ? content?.preimage : content?.postimage;
    const blobOid = anchor.side === 'base' ? content?.preimageBlobOid : content?.postimageBlobOid;
    const path = anchor.side === 'base' ? file.oldPath : file.newPath;
    if (bytes === undefined || path === undefined || blobOid === undefined || blobOid !== anchor.blobOid) {
      return { state: 'orphaned', reason: 'anchor-unavailable' };
    }
    return verifyDurableAnchor(
      anchor,
      buildDurableAnchor({
        path,
        safeDisplayPath: path.display,
        side: anchor.side,
        blobOid: anchor.blobOid,
        line: anchor.line,
        endLine: anchor.endLine,
        text: strictTextDecoder.decode(bytes),
      }),
    );
  };

  const diskPathFor = (file: ChangedFile): string | undefined => {
    const path = file.newPath ?? file.oldPath;
    if (path === undefined) return undefined;
    return join(scope.repositoryRoot, Buffer.from(decodeBase64url(path.bytesBase64url)).toString('utf8'));
  };

  const indexStatIdentity = async (): Promise<Readonly<{ readonly size: number; readonly mtimeMs: number }>> => {
    const runner = createGitRunner();
    const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: scope.repositoryRoot });
    const indexPathRaw = result.stdout.toString('utf8').trim();
    const resolvedIndexPath = indexPathRaw.startsWith('/') ? indexPathRaw : join(scope.repositoryRoot, indexPathRaw);
    const info = await lstat(resolvedIndexPath);
    return { size: info.size, mtimeMs: info.mtimeMs };
  };

  type StatIdentity = Readonly<{ readonly size: number; readonly mtimeMs: number }>;

  const captureChangeBaseline = async (): Promise<Readonly<{
    readonly index: StatIdentity;
    readonly files: ReadonlyMap<string, StatIdentity | undefined>;
  }>> => {
    const index = await indexStatIdentity();
    const files = await snapshot.files();
    const fileStats = new Map<string, StatIdentity | undefined>();
    for (const file of files) {
      const diskPath = diskPathFor(file);
      if (diskPath === undefined) continue;
      try {
        const info = await lstat(diskPath);
        fileStats.set(file.id, { size: info.size, mtimeMs: info.mtimeMs });
      } catch {
        fileStats.set(file.id, undefined);
      }
    }
    return Object.freeze({ index, files: fileStats });
  };

  let changeBaseline = await captureChangeBaseline();

  const collectWorkingTreeDrift = async (): Promise<WorkingTreeDriftFlag> => {
    const index = await indexStatIdentity();
    const indexChanged = index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs;
    const changedPaths: NonNullable<ChangedFile['newPath']>[] = [];
    const files = await snapshot.files();
    for (const file of files) {
      const diskPath = diskPathFor(file);
      if (diskPath === undefined) continue;
      const expected = changeBaseline.files.get(file.id);
      let actual: StatIdentity | undefined;
      try {
        const info = await lstat(diskPath);
        actual = { size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        actual = undefined;
      }
      const changed = expected === undefined
        ? actual !== undefined
        : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
      if (!changed) continue;
      const path = file.newPath ?? file.oldPath;
      if (path !== undefined) changedPaths.push(path);
    }
    return { changed: indexChanged || changedPaths.length > 0, paths: changedPaths };
  };

  const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
    status: () => options.attachedCompletion!.coordinator.status(),
    markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
    finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
      return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
        const settled = await draftStore.settle(expectedRevision, {
          prepare: async (acceptedDraft) => {
            const drift = await collectWorkingTreeDrift();
            const verification = Object.fromEntries(await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)));
            const affectedCommentIds = acceptedDraft.comments.filter((comment) => verification[comment.id]?.state !== 'verified').map((comment) => comment.id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            const exportedAt = new Date().toISOString();
            const files = await snapshot.files();
            const resolvedPaths = files.map((file) => file.newPath!);
            const fileDigests = (
              await Promise.all(files.map(async (file) => {
                const content = await snapshot.readContent(file.id);
                if (content?.postimage === undefined) return undefined;
                return { path: file.newPath!, sha256: createHash('sha256').update(content.postimage).digest('hex') };
              }))
            ).filter((entry): entry is { path: NonNullable<ChangedFile['newPath']>; sha256: string } => entry !== undefined);
            const standaloneScope = {
              originalArguments: [...scope.standaloneArguments!].sort(),
              resolvedPaths,
              fileDigests,
              snapshotChain: snapshotSession.chain,
              reviewKey,
            };
            try {
              const bytes = canonicalizeReviewExport(buildReviewExportV6(
                { acceptedDraft, commentVerification: verification },
                standaloneScope,
                drift,
                exportedAt,
              ));
              return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
          },
          finalize: async ({ draft, prepared }) => {
            if (prepared.kind !== 'ready') return prepared;
            const affectedCommentIds = (await Promise.all(draft.comments.map(async (comment) => ({ id: comment.id, verification: await verifyAnchor(comment.anchor) })))).filter(({ verification }) => verification.state !== 'verified').map(({ id }) => id);
            if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
            try {
              const document = parseCanonicalReviewExport(prepared.bytes);
              if (document.schemaVersion !== 6 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
            } catch {
              return { kind: 'canonicalizationFailure' as const };
            }
            try {
              if (!await options.attachedCompletion!.deliver(prepared.bytes)) {
                return { kind: 'deliveryFailed' as const };
              }
              return { kind: 'completed' as const, revision: prepared.revision };
            } catch {
              return { kind: 'deliveryFailed' as const };
            }
          },
        });
        if (settled.kind === 'accepted') return settled.value;
        if (settled.kind === 'revisionConflict') return { kind: 'revisionConflict', expectedRevision: settled.expectedRevision, actualRevision: settled.actualRevision };
        if (settled.kind === 'draftChanged') return { kind: 'revisionConflict', expectedRevision, actualRevision: settled.actualRevision };
        return settled.kind === 'readOnly' ? { kind: 'draftReadOnly' } : { kind: 'persistenceFailure' };
      });
    },
  };

  return Object.freeze({
    session: sessionResponse,
    attachedCompletion,
    onAnchorAdd: options.onAnchorAdd,
    draftStore,
    support: options.support,
    async refresh() {
      const stateBefore = await draftStore.loadState();
      const commentsBefore = stateBefore.kind === 'current' ? stateBefore.draft.comments : [];
      const verificationBefore = new Map<string, AnchorVerification>();
      for (const comment of commentsBefore) {
        verificationBefore.set(comment.id, await verifyAnchor(comment.anchor));
      }
      const delta = await snapshot.refresh();
      changeBaseline = await captureChangeBaseline();
      let staleCount = 0;
      let orphanedCount = 0;
      for (const comment of commentsBefore) {
        if (verificationBefore.get(comment.id)?.state !== 'verified') continue;
        const after = await verifyAnchor(comment.anchor);
        if (after.state === 'stale') staleCount += 1;
        else if (after.state === 'orphaned') orphanedCount += 1;
      }
      return {
        added: delta.added,
        removed: delta.removed,
        modified: delta.modified,
        staleCount,
        orphanedCount,
      };
    },
    async worktreeChangeIndicator() {
      const index = await indexStatIdentity();
      if (index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs) {
        return { changed: true };
      }
      const files = await snapshot.files();
      for (const file of files) {
        const diskPath = diskPathFor(file);
        if (diskPath === undefined) continue;
        const expected = changeBaseline.files.get(file.id);
        let actual: StatIdentity | undefined;
        try {
          const info = await lstat(diskPath);
          actual = { size: info.size, mtimeMs: info.mtimeMs };
        } catch {
          actual = undefined;
        }
        const changed = expected === undefined
          ? actual !== undefined
          : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
        if (changed) return { changed: true };
      }
      return { changed: false };
    },
    async lookup(fileId) {
      options.onCapabilityLookup?.(fileId);
      const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
      if (file === undefined) return undefined;
      return FileMetadataResponseSchema.parse({
        fileId: file.id,
        status: file.status.similarity === null ? { kind: file.status.kind } : { kind: file.status.kind, similarity: file.status.similarity },
        oldMode: file.oldMode,
        newMode: file.newMode,
        ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
        ...(file.newPath === undefined ? {} : { newPath: file.newPath }),
        additions: file.additions,
        deletions: file.deletions,
        availability: file.availability,
      });
    },
    async readContent(fileId) {
      const content = await snapshot.readContent(fileId);
      if (content === undefined) return undefined;
      const { file, preimage, preimageBlobOid, postimage, postimageBlobOid } = content;
      const makeSide = (
        bytes: Buffer | undefined,
        path: ChangedFile['oldPath'],
        mode: string,
        blobOid: string,
      ) => bytes === undefined || path === undefined || mode === '000000'
        ? { exists: false as const }
        : {
            exists: true as const,
            path,
            language: languageForPath(path.utf8),
            blobOid,
            text: strictTextDecoder.decode(bytes),
          };
      return FileContentResponseSchema.parse({
        fileId,
        base: makeSide(preimage, file.oldPath, file.oldMode, preimageBlobOid),
        head: makeSide(postimage, file.newPath, file.newMode, postimageBlobOid),
      });
    },
    async readRelativeImage(fileId, side, relativeSrc) {
      const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
      const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
      return resolveImageBytes(markdownPath, relativeSrc, async (resolvedPath) => {
        if (side === 'base') {
          const changedEntry = findChangedImageEntry(await snapshot.files(), resolvedPath);
          if (changedEntry !== undefined) {
            // Image is itself part of the diff: serve its base blob via the
            // object store instead of the live disk (which is the head side).
            return changedEntry.oldMode === '000000' ? undefined : readObjectBackedImage(reader, changedEntry.oldBlobOid);
          }
        }
        return readWorktreeImageBytes(scope.repositoryRoot, resolvedPath); // unchanged sibling asset, or head side
      });
    },
    verifyAnchor,
    async revealDraftFile() {
      if (options.revealDraftFile === undefined) throw new Error('Draft reveal adapter is unavailable.');
      await options.revealDraftFile(draftStore.canonicalPath);
    },
    async revealExportDirectory() {
      if (options.revealDraftFile === undefined) throw new Error('Export reveal adapter is unavailable.');
      const managedRoot = await ensureManagedExportsRoot(scope.repositoryRoot, false);
      if (managedRoot === undefined) throw new Error('Export reveal adapter is unavailable.');
      const exportDirectory = join(managedRoot.exportsRoot, storageScope ?? reviewKey);
      await assertManagedExportsRoot(managedRoot);
      if (!(await isCompleteExportDirectory(exportDirectory))) throw new Error('Export reveal adapter is unavailable.');
      await assertManagedExportsRoot(managedRoot);
      await options.revealDraftFile(exportDirectory);
    },
    async exportReview(input) {
      const initial = await draftStore.loadState();
      if (initial.kind !== 'current') return ExportReviewResultSchema.parse({ kind: 'draftReadOnly' });
      if (initial.draft.revision !== input.expectedRevision) {
        return ExportReviewResultSchema.parse({
          kind: 'revisionConflict',
          expectedRevision: input.expectedRevision,
          actualRevision: initial.draft.revision,
        });
      }
      const acceptedDraft = structuredClone(initial.draft);
      const draftFingerprint = createHash('sha256').update(initial.raw).digest('hex');
      const exportedAt = new Date().toISOString();
      const commentVerification = Object.fromEntries(
        await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)),
      );
      const files = await snapshot.files();
      const resolvedPaths = files.map((file) => file.newPath!);
      const fileDigests = (
        await Promise.all(files.map(async (file) => {
          const content = await snapshot.readContent(file.id);
          if (content?.postimage === undefined) return undefined;
          return { path: file.newPath!, sha256: createHash('sha256').update(content.postimage).digest('hex') };
        }))
      ).filter((entry): entry is { path: NonNullable<ChangedFile['newPath']>; sha256: string } => entry !== undefined);
      const standaloneScope = {
        originalArguments: [...scope.standaloneArguments!].sort(),
        resolvedPaths,
        fileDigests,
        snapshotChain: snapshotSession.chain,
        reviewKey,
      };
      const json = canonicalizeReviewExport(buildReviewExportV4(
        { acceptedDraft, commentVerification },
        standaloneScope,
        exportedAt,
      ));
      const published = await publishReviewExport({
        repositoryRoot: scope.repositoryRoot,
        identity: { kind: 'standalone', reviewKey },
        ...(storageScope === undefined ? {} : { storageScope }),
        json,
        markdown: Buffer.from(renderReviewMarkdown(json), 'utf8'),
        reExportCapability: await getObservedNativeExchangeCapability(),
        revalidate: async () => {
          const current = await draftStore.loadState();
          if (
            current.kind !== 'current'
            || current.draft.revision !== acceptedDraft.revision
            || createHash('sha256').update(current.raw).digest('hex') !== draftFingerprint
          ) {
            return false;
          }
          const currentSession = await snapshot.session();
          return currentSession.chain.length === snapshotSession.chain.length
            && currentSession.chain.every((digest, index) => digest === snapshotSession.chain[index]);
        },
      });
      if (published.kind !== 'exported') return ExportReviewResultSchema.parse({ kind: published.kind });
      return ExportReviewResultSchema.parse({
        kind: 'exported',
        draftRevision: acceptedDraft.revision,
        exportedAt,
        standalone: { reviewKey },
        files: published.receipt.files,
      });
    },
    async inspectCumpaIgnore() {
      return CumpaIgnoreStatusSchema.parse({ kind: 'unavailable' });
    },
    async appendCumpaIgnoreRule() {
      return AppendCumpaIgnoreResultSchema.parse({ kind: 'unconfirmed' });
    },
  });
}
