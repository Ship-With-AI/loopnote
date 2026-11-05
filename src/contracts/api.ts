import { z } from 'zod';

import { RENAME_MAP } from '../domain/product-identity.js';

import {
  AvailabilitySchema,
  ChangedFileStatusKindSchema,
  ExactPatchValidationTargetSchema,
  ExactPathSchema,
  GitModeSchema,
  GitObjectIdSchema,
  RangeReviewScopeSchema,
} from './comparison.js';

import {
  AnchorVerificationSchema,
  CommentBodySchema,
  CommentIdSchema,
  DraftComparisonSchema,
  DurableAnchorV1Schema,
  RevisionSchema,
  ReviewDraftV1Schema,
  SummaryMarkdownSchema,
} from './draft.js';

export const OpaqueFileIdSchema = z.string().regex(/^file_[A-Za-z0-9_-]{43}$/);

const AnchorSideSchema = z.enum(['base', 'head']);

export const AddCommentRequestSchema = z
  .strictObject({
    type: z.literal('addComment'),
    expectedRevision: RevisionSchema,
    fileId: OpaqueFileIdSchema,
    side: AnchorSideSchema,
    line: z.number().int().positive(),
    endLine: z.number().int().positive().optional(),
    body: CommentBodySchema,
  })
  .superRefine((value, context) => {
    if (value.endLine !== undefined && value.endLine < value.line) {
      context.addIssue({ code: 'custom', message: 'endLine must be >= line.', path: ['endLine'] });
    }
  })
  .readonly();

export const DraftMutationRequestSchema = z
  .discriminatedUnion('type', [
    AddCommentRequestSchema,
    z.strictObject({
      type: z.literal('editComment'),
      expectedRevision: RevisionSchema,
      commentId: CommentIdSchema,
      body: CommentBodySchema,
    }),
    z.strictObject({
      type: z.literal('deleteComment'),
      expectedRevision: RevisionSchema,
      commentId: CommentIdSchema,
    }),
    z.strictObject({
      type: z.literal('resolveComment'),
      expectedRevision: RevisionSchema,
      commentId: CommentIdSchema,
    }),
    z.strictObject({
      type: z.literal('reopenComment'),
      expectedRevision: RevisionSchema,
      commentId: CommentIdSchema,
    }),
    z.strictObject({
      type: z.literal('setSummary'),
      expectedRevision: RevisionSchema,
      markdown: SummaryMarkdownSchema,
    }),
  ])
  .readonly();

const DraftCommentViewSchema = z
  .discriminatedUnion('state', [
    z.strictObject({
      id: CommentIdSchema,
      state: z.literal('open'),
      body: CommentBodySchema,
      anchor: DurableAnchorV1Schema,
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      verification: AnchorVerificationSchema,
    }),
    z.strictObject({
      id: CommentIdSchema,
      state: z.literal('resolved'),
      body: CommentBodySchema,
      anchor: DurableAnchorV1Schema,
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      resolvedAt: z.string().datetime(),
      verification: AnchorVerificationSchema,
    }),
  ])
  .readonly();

export const DraftViewSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    comparison: DraftComparisonSchema,
    revision: RevisionSchema,
    summary: SummaryMarkdownSchema,
    comments: z.array(DraftCommentViewSchema).max(10_000).readonly(),
  })
  .readonly();

const SAFE_DRAFT_PATH_PATTERN = new RegExp(`^\\${RENAME_MAP.repoStateDir}drafts/[A-Za-z0-9._-]+$`, 'u');

export const SafeDraftPathSchema = z.string().regex(SAFE_DRAFT_PATH_PATTERN);

const DraftMalformedLoadSchema = z
  .strictObject({
    kind: z.literal('malformed'),
    path: SafeDraftPathSchema,
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    detail: z.strictObject({ message: z.string().min(1).max(160) }).readonly(),
  })
  .readonly();

const DraftSchemaInvalidLoadSchema = z
  .strictObject({
    kind: z.literal('schemaInvalid'),
    path: SafeDraftPathSchema,
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    details: z
      .array(z.strictObject({ path: z.string().max(160), message: z.string().min(1).max(160) }).readonly())
      .min(1)
      .max(8)
      .readonly(),
  })
  .readonly();

const DraftNewerUnsupportedLoadSchema = z
  .strictObject({
    kind: z.literal('newerUnsupported'),
    path: SafeDraftPathSchema,
    foundVersion: z.number().int().positive(),
    supportedVersion: z.literal(1),
  })
  .readonly();

export const DraftLoadResponseSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('missing'), path: SafeDraftPathSchema }).readonly(),
    z.strictObject({ kind: z.literal('current'), path: SafeDraftPathSchema, draft: DraftViewSchema }).readonly(),
    DraftMalformedLoadSchema,
    DraftSchemaInvalidLoadSchema,
    DraftNewerUnsupportedLoadSchema,
  ])
  .readonly();

const DraftReadOnlyLoadSchema = z.union([
  DraftMalformedLoadSchema,
  DraftSchemaInvalidLoadSchema,
  DraftNewerUnsupportedLoadSchema,
]);

export const DraftMutationAcceptedSchema = z
  .strictObject({
    kind: z.literal('accepted'),
    draft: ReviewDraftV1Schema,
  })
  .readonly();

export const DraftMutationConflictSchema = z
  .strictObject({
    kind: z.literal('revisionConflict'),
    expectedRevision: RevisionSchema,
    actualRevision: RevisionSchema,
    latest: ReviewDraftV1Schema,
  })
  .readonly();

export const DraftMutationFailureSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('invalidTarget') }),
    z.strictObject({ kind: z.literal('illegalTransition') }),
    z.strictObject({ kind: z.literal('persistenceFailure') }),
    z.strictObject({ kind: z.literal('readOnly'), load: DraftReadOnlyLoadSchema }),
  ])
  .readonly();

export const DraftMutationResultSchema = z
  .union([DraftMutationAcceptedSchema, DraftMutationConflictSchema, DraftMutationFailureSchema])
  .readonly();

export const DraftRecoveryRequestSchema = z
  .strictObject({ expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/u) })
  .readonly();

export const DraftRecoveryResultSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('recovered'),
      backupPath: SafeDraftPathSchema,
      draft: ReviewDraftV1Schema,
    }).readonly(),
    z.strictObject({ kind: z.literal('fingerprintChanged') }).readonly(),
    z.strictObject({ kind: z.literal('recoveryUnavailable'), load: DraftLoadResponseSchema }).readonly(),
    z.strictObject({ kind: z.literal('persistenceFailure') }).readonly(),
  ])
  .readonly();

export const DraftRevealResultSchema = z
  .union([
    z.strictObject({ kind: z.literal('revealed') }).readonly(),
    z.strictObject({ kind: z.literal('revealFailed') }).readonly(),
  ])
  .readonly();

export const UncommittedDraftRecoveryResultSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('recovered') }).readonly(),
    z.strictObject({ kind: z.literal('unavailable') }).readonly(),
  ])
  .readonly();

export const ExportReviewRequestSchema = z
  .strictObject({
    expectedRevision: RevisionSchema,
    driftAcknowledgementToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u).optional(),
  })
  .readonly();

export const ExportDirectoryRevealResultSchema = z
  .union([
    z.strictObject({ kind: z.literal('revealed') }).readonly(),
    z.strictObject({ kind: z.literal('revealFailed') }).readonly(),
  ])
  .readonly();

export const LoopnoteIgnoreStatusSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('ignored') }).readonly(),
    z.strictObject({ kind: z.literal('notIgnored') }).readonly(),
    z.strictObject({ kind: z.literal('unavailable') }).readonly(),
  ])
  .readonly();

export const AppendLoopnoteIgnoreResultSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('appended') }).readonly(),
    z.strictObject({ kind: z.literal('alreadyIgnored') }).readonly(),
    z.strictObject({ kind: z.literal('unconfirmed') }).readonly(),
    z.strictObject({ kind: z.literal('unchanged') }).readonly(),
    z.strictObject({ kind: z.literal('appendUnconfirmed') }).readonly(),
    z.strictObject({ kind: z.literal('ambiguous') }).readonly(),
  ])
  .readonly();
export type LoopnoteIgnoreStatus = z.infer<typeof LoopnoteIgnoreStatusSchema>;
export type AppendLoopnoteIgnoreResult = z.infer<
  typeof AppendLoopnoteIgnoreResultSchema
>;

export type ExportReviewRequest = z.infer<typeof ExportReviewRequestSchema>;
export type ExportDirectoryRevealResult = z.infer<typeof ExportDirectoryRevealResultSchema>;


const ExistingFileContentSideSchema = z
  .strictObject({
    exists: z.literal(true),
    path: ExactPathSchema,
    language: z.string().min(1),
    blobOid: GitObjectIdSchema,
    text: z.string(),
  })
  .readonly();

const MissingFileContentSideSchema = z
  .strictObject({
    exists: z.literal(false),
  })
  .readonly();

export const FileContentResponseSchema = z
  .strictObject({
    fileId: OpaqueFileIdSchema,
    base: z.union([ExistingFileContentSideSchema, MissingFileContentSideSchema]),
    head: z.union([ExistingFileContentSideSchema, MissingFileContentSideSchema]),
  })
  .readonly();

const ApiWorktreeIdentitySchema = z
  .strictObject({
    path: z.string().min(1),
    dirty: z.boolean(),
  })
  .readonly();

const ApiPinnedEndpointSchema = z
  .strictObject({
    label: z.string().min(1),
    oid: GitObjectIdSchema,
    worktree: ApiWorktreeIdentitySchema.optional(),
  })
  .readonly();

const SessionRangeSchema = z
  .strictObject({
    kind: z.literal('revisions'),
    baseOid: GitObjectIdSchema,
    headOid: GitObjectIdSchema,
    pathspecs: z.array(z.string()).readonly(),
  })
  .readonly();

const ApiFileStatusSchema = z
  .strictObject({
    kind: ChangedFileStatusKindSchema,
    code: z.string().regex(/^[A-Z]$/).optional(),
    similarity: z.number().int().min(0).max(100).optional(),
  })
  .readonly();

export const SessionFileSchema = z
  .strictObject({
    fileId: OpaqueFileIdSchema,
    status: ApiFileStatusSchema,
    oldMode: GitModeSchema,
    oldPath: ExactPathSchema.optional(),
    newPath: ExactPathSchema.optional(),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
    availability: AvailabilitySchema,
    standaloneGitState: z
      .enum(['modified-uncommitted', 'untracked', 'unchanged'])
      .optional(),
  })
  .readonly();

export const AttachedCompletionStatusSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('waiting') }).readonly(),
    z.strictObject({ kind: z.literal('finishing'), expectedRevision: RevisionSchema }).readonly(),
    z.strictObject({ kind: z.literal('completed'), revision: RevisionSchema }).readonly(),
  ])
  .readonly();

export const FinishReviewRequestSchema = z
  .strictObject({ expectedRevision: RevisionSchema })
  .readonly();

export const FinishReviewResultSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('completed'), revision: RevisionSchema }).readonly(),
    z.strictObject({ kind: z.literal('alreadyCompleted'), revision: RevisionSchema }).readonly(),
    z.strictObject({
      kind: z.literal('revisionConflict'),
      expectedRevision: RevisionSchema,
      actualRevision: RevisionSchema,
    }).readonly(),
    z.strictObject({
      kind: z.literal('staleAnchors'),
      affectedCommentIds: z.array(CommentIdSchema).readonly(),
      affectedCount: z.number().int().nonnegative(),
    }).readonly(),
    z.strictObject({ kind: z.literal('scopeInvalid') }).readonly(),
    z.strictObject({ kind: z.literal('draftReadOnly') }).readonly(),
    z.strictObject({ kind: z.literal('persistenceFailure') }).readonly(),
    z.strictObject({ kind: z.literal('canonicalizationFailure') }).readonly(),
    z.strictObject({ kind: z.literal('deliveryFailed') }).readonly(),
  ])
  .readonly();

const AttachedSessionMarkerSchema = z
  .strictObject({ kind: z.literal('agent-review') })
  .readonly();

export type AttachedCompletionStatus = z.infer<typeof AttachedCompletionStatusSchema>;
export type FinishReviewRequest = z.infer<typeof FinishReviewRequestSchema>;
export type FinishReviewResult = z.infer<typeof FinishReviewResultSchema>;

export const SessionSupportCapabilitySchema = z
  .strictObject({ enabled: z.literal(true) })
  .readonly();


const PinnedSessionResponseSchema = z
  .strictObject({
    base: ApiPinnedEndpointSchema,
    head: ApiPinnedEndpointSchema,
    mergeBaseOid: GitObjectIdSchema,
    range: SessionRangeSchema.optional(),
    files: z.array(SessionFileSchema).readonly(),
    attached: AttachedSessionMarkerSchema.optional(),
    support: SessionSupportCapabilitySchema.optional(),
    repoName: z.string().optional(),

  })
  .superRefine((session, context) => {
    if (
      session.range !== undefined &&
      (session.range.baseOid !== session.base.oid ||
        session.range.headOid !== session.head.oid)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Range scope must match pinned session endpoints.',
      });
    }
  })
  .readonly();

const ExactPatchSessionResponseSchema = z
  .strictObject({
    patch: z
      .strictObject({
        kind: z.literal('exact-patch'),
        digest: z.string().regex(/^[0-9a-f]{64}$/u),
        reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
        validationTarget: ExactPatchValidationTargetSchema,
        changedFileCount: z.number().int().nonnegative(),
      })
      .readonly(),
    files: z.array(SessionFileSchema).readonly(),
    attached: AttachedSessionMarkerSchema.optional(),
    support: SessionSupportCapabilitySchema.optional(),
    repoName: z.string().optional(),
  })
  .readonly();

const UncommittedSessionResponseSchema = z
  .strictObject({
    uncommitted: z
      .strictObject({
        kind: z.literal('uncommitted'),
        sourceKind: z.enum(['staged', 'unstaged', 'worktree', 'standalone']),
        baseCommitOid: GitObjectIdSchema.optional(),
        reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
        changedFileCount: z.number().int().nonnegative(),
        recoveryAvailable: z.literal(true).optional(),
      })
      .readonly(),
    files: z.array(SessionFileSchema).readonly(),
    attached: AttachedSessionMarkerSchema.optional(),
    support: SessionSupportCapabilitySchema.optional(),
    repoName: z.string().optional(),
  })
  .readonly();

export const SessionResponseSchema = z
  .union([PinnedSessionResponseSchema, ExactPatchSessionResponseSchema, UncommittedSessionResponseSchema])
  .readonly();

export const SelectorDriftRoleSchema = z.enum(['base', 'head']);
export const SelectorTypeSchema = z.enum(['branch', 'worktree']);
export const SelectorUnavailableReasonSchema = z.literal('source-unavailable');

export const SelectorDriftStatusSchema = z
  .discriminatedUnion('kind', [
    z
      .strictObject({
        kind: z.literal('unchanged'),
        role: SelectorDriftRoleSchema,
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal('moved'),
        role: SelectorDriftRoleSchema,
        label: z.string().min(1),
        selectorType: SelectorTypeSchema,
        oldOid: GitObjectIdSchema,
        newOid: GitObjectIdSchema,
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal('unavailable'),
        role: SelectorDriftRoleSchema,
        label: z.string().min(1),
        selectorType: SelectorTypeSchema,
        oldOid: GitObjectIdSchema,
        reason: SelectorUnavailableReasonSchema,
      })
      .readonly(),
  ])
  .readonly();

export const SelectorDriftResponseSchema = z
  .strictObject({
    base: SelectorDriftStatusSchema,
    head: SelectorDriftStatusSchema,
  })
  .readonly();

export const PatchStatusResponseSchema = z
  .discriminatedUnion('kind', [
    z
      .strictObject({
        kind: z.literal('unchanged'),
        validationTargetLabel: z.string().min(1),
      })
      .readonly(),
    z
      .strictObject({
        kind: z.literal('drifted'),
        validationTargetLabel: z.string().min(1),
      })
      .readonly(),
    z.strictObject({ kind: z.literal('snapshotUnavailable') }).readonly(),
  ])
  .readonly();

const ExportReceiptDirectoryPattern = new RegExp(
  `^\\${RENAME_MAP.repoStateDir}exports/((?:(?:[0-9a-f]{40}|[0-9a-f]{64})\\.\\.(?:[0-9a-f]{40}|[0-9a-f]{64}))|(?:[0-9a-f]{64}|agent-[0-9a-f]{32}))/review\\.(?:json|md)$`,
  'u',
);

const ExportReceiptJsonFileSchema = z
  .strictObject({
    path: z
      .string()
      .regex(
        new RegExp(
          `^\\${RENAME_MAP.repoStateDir}exports/(?:(?:[0-9a-f]{40}|[0-9a-f]{64})\\.\\.(?:[0-9a-f]{40}|[0-9a-f]{64})|(?:[0-9a-f]{64}|agent-[0-9a-f]{32}))/review\\.json$`,
          'u',
        ),
      ),
    algorithm: z.literal('sha256'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    bytes: z.number().int().nonnegative(),
  })
  .readonly();

const ExportReceiptMarkdownFileSchema = z
  .strictObject({
    path: z
      .string()
      .regex(
        new RegExp(
          `^\\${RENAME_MAP.repoStateDir}exports/(?:(?:[0-9a-f]{40}|[0-9a-f]{64})\\.\\.(?:[0-9a-f]{40}|[0-9a-f]{64})|(?:[0-9a-f]{64}|agent-[0-9a-f]{32}))/review\\.md$`,
          'u',
        ),
      ),
    algorithm: z.literal('sha256'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    bytes: z.number().int().nonnegative(),
  })
  .readonly();

const ExportReceiptFilesSchema = z
  .tuple([ExportReceiptJsonFileSchema, ExportReceiptMarkdownFileSchema])
  .superRefine(([json, markdown], context) => {
    const jsonDirectory = ExportReceiptDirectoryPattern.exec(json.path)?.[1];
    const markdownDirectory = ExportReceiptDirectoryPattern.exec(markdown.path)?.[1];
    if (jsonDirectory !== markdownDirectory) {
      context.addIssue({
        code: 'custom',
        message: 'Export receipt files must share one comparison directory.',
        path: [1, 'path'],
      });
    }
  })
  .readonly();

const ExportReceiptPinnedIdentitySchema = z
  .strictObject({
    label: z.string().min(1),
    selectorType: SelectorTypeSchema,
    oid: GitObjectIdSchema,
  })
  .readonly();

const ExportReceiptCurrentIdentitySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('available'),
      label: z.string().min(1),
      selectorType: SelectorTypeSchema,
      oid: GitObjectIdSchema,
    }).readonly(),
    z.strictObject({
      kind: z.literal('unavailable'),
      label: z.string().min(1),
      selectorType: SelectorTypeSchema,
      reason: SelectorUnavailableReasonSchema,
    }).readonly(),
  ])
  .readonly();

const ExportReceiptDriftIdentitySchema = z
  .strictObject({
    role: SelectorDriftRoleSchema,
    pinned: ExportReceiptPinnedIdentitySchema,
    current: ExportReceiptCurrentIdentitySchema,
  })
  .readonly();

const ExportReceiptDriftSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('noneObserved') }).readonly(),
    z.strictObject({
      kind: z.literal('acknowledged'),
      identities: z.tuple([ExportReceiptDriftIdentitySchema, ExportReceiptDriftIdentitySchema]).readonly(),
    }).readonly(),
  ])
  .readonly();

const ExportReceiptComparisonEndpointSchema = z
  .strictObject({
    label: z.string().min(1),
    selectorType: SelectorTypeSchema.optional(),
    oid: GitObjectIdSchema,
  })
  .readonly();

const ExportReceiptComparisonSchema = z
  .strictObject({
    base: ExportReceiptComparisonEndpointSchema,
    head: ExportReceiptComparisonEndpointSchema,
  })
  .readonly();

const ComparisonExportReviewResultSchema = z.strictObject({
  kind: z.literal('exported'),
  draftRevision: RevisionSchema,
  exportedAt: z.string().datetime(),
  drift: ExportReceiptDriftSchema,
  comparison: ExportReceiptComparisonSchema,
  files: ExportReceiptFilesSchema,
}).superRefine((result, context) => {
  if (result.drift.kind !== 'acknowledged') return;
  for (const role of ['base', 'head'] as const) {
    const identities = result.drift.identities.filter((identity) => identity.role === role);
    if (identities.length !== 1) {
      context.addIssue({
        code: 'custom',
        message: `Acknowledged drift requires exactly one ${role} identity.`,
        path: ['drift', 'identities'],
      });
      continue;
    }
    const [identity] = identities;
    const endpoint = result.comparison[role];
    if (
      identity.pinned.label !== endpoint.label
      || identity.pinned.selectorType !== endpoint.selectorType
      || identity.pinned.oid !== endpoint.oid
    ) {
      context.addIssue({
        code: 'custom',
        message: `Acknowledged ${role} drift must match the pinned comparison endpoint.`,
        path: ['drift', 'identities', result.drift.identities.indexOf(identity), 'pinned'],
      });
    }
  }
  if (!result.drift.identities.some(
    (identity) => identity.current.kind === 'unavailable' || identity.current.oid !== identity.pinned.oid,
  )) {
    context.addIssue({
      code: 'custom',
      message: 'Acknowledged drift requires an unavailable or changed current endpoint.',
      path: ['drift', 'identities'],
    });
  }
}).readonly();

const ExactPatchExportReviewResultSchema = z.strictObject({
  kind: z.literal('exported'),
  draftRevision: RevisionSchema,
  exportedAt: z.string().datetime(),
  patch: z.strictObject({
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    validationTarget: ExactPatchValidationTargetSchema,
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshot: z.strictObject({ status: z.enum(['unchanged', 'drifted']) }).readonly(),
  }).readonly(),
  files: ExportReceiptFilesSchema,
}).readonly();

const StandaloneExportReviewResultSchema = z.strictObject({
  kind: z.literal('exported'),
  draftRevision: RevisionSchema,
  exportedAt: z.string().datetime(),
  standalone: z.strictObject({
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  }).readonly(),
  files: ExportReceiptFilesSchema,
}).readonly();

export const ExportReviewResultSchema = z.union([
  ComparisonExportReviewResultSchema,
  ExactPatchExportReviewResultSchema,
  StandaloneExportReviewResultSchema,
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('revisionConflict'),
      expectedRevision: RevisionSchema,
      actualRevision: RevisionSchema,
    }).readonly(),
    z.strictObject({
      kind: z.literal('driftAcknowledgementRequired'),
      acknowledgementToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u),
      observation: SelectorDriftResponseSchema,
    }).readonly(),
    z.strictObject({
      kind: z.literal('driftAcknowledgementStale'),
      acknowledgementToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u),
      observation: SelectorDriftResponseSchema,
    }).readonly(),
    z.strictObject({ kind: z.literal('draftReadOnly') }).readonly(),
    z.strictObject({ kind: z.literal('reExportUnsupported') }).readonly(),
    z.strictObject({ kind: z.literal('publicationFailed') }).readonly(),
    z.strictObject({ kind: z.literal('recoveryRequired') }).readonly(),
  ]),
]).readonly();

export type ExportReviewResult = z.infer<typeof ExportReviewResultSchema>;

export const FileMetadataResponseSchema = z
  .strictObject({
    fileId: OpaqueFileIdSchema,
    status: ApiFileStatusSchema,
    oldPath: ExactPathSchema.optional(),
    newPath: ExactPathSchema.optional(),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
    availability: AvailabilitySchema,
    oldMode: GitModeSchema,
    newMode: GitModeSchema,
  })
  .readonly();

export const SupportActionSchema = z.enum(['support', 'restore']);

export const SupportStartRequestSchema = z
  .strictObject({ action: SupportActionSchema })
  .readonly();

export const SupportStartResultSchema = z
  .discriminatedUnion('kind', [
    z
      .strictObject({
        kind: z.literal('ready'),
        flowUrl: z
          .string()
          .url()
          .refine((value) => new URL(value).protocol === 'https:'),
      })
      .readonly(),
    z.strictObject({ kind: z.literal('unavailable') }).readonly(),
  ])
  .readonly();

export const SupportStatusSchema = z
  .strictObject({ status: z.enum(['unverified', 'verified']) })
  .readonly();

export const ApiErrorSchema = z
  .strictObject({
    code: z.enum(['request-unavailable', 'session-unavailable']),
    message: z.string().min(1),
  })
  .readonly();

export type SessionFile = z.infer<typeof SessionFileSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type FileMetadataResponse = z.infer<
  typeof FileMetadataResponseSchema
>;
export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;
export type DraftMutationRequest = z.infer<typeof DraftMutationRequestSchema>;
export type DraftMutationResult = z.infer<typeof DraftMutationResultSchema>;
export type DraftLoadResponse = z.infer<typeof DraftLoadResponseSchema>;
export type DraftRecoveryRequest = z.infer<typeof DraftRecoveryRequestSchema>;
export type DraftRecoveryResult = z.infer<typeof DraftRecoveryResultSchema>;
export type DraftRevealResult = z.infer<typeof DraftRevealResultSchema>;
export type UncommittedDraftRecoveryResult = z.infer<typeof UncommittedDraftRecoveryResultSchema>;
export type FileContentResponse = z.infer<typeof FileContentResponseSchema>;
export type SelectorDriftStatus = z.infer<typeof SelectorDriftStatusSchema>;
export type SelectorDriftResponse = z.infer<typeof SelectorDriftResponseSchema>;
export type PatchStatusResponse = z.infer<typeof PatchStatusResponseSchema>;
export type SupportAction = z.infer<typeof SupportActionSchema>;
export type SupportStartRequest = z.infer<typeof SupportStartRequestSchema>;
export type SupportStartResult = z.infer<typeof SupportStartResultSchema>;
export type SupportStatus = z.infer<typeof SupportStatusSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
