import { z } from 'zod';

import {
  ChangedFileSchema,
  ExactPatchValidationTargetSchema,
  ExactPathSchema,
  GitObjectIdSchema,
  RangeReviewScopeSchema,
} from './comparison.js';
import { orderExactPaths, decodeBase64url } from '../domain/path-bytes.js';

export const RevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const CommentIdSchema = z.string().regex(/^comment_[0-9a-f-]{36}$/u);
export const CommentBodySchema = z
  .string()
  .max(100_000)
  .refine((value) => value.trim().length > 0, 'Comment body must not be blank.');
export const SummaryMarkdownSchema = z.string().max(100_000);

const AnchorSideSchema = z.enum(['base', 'head']);
const AnchorLineSchema = z
  .strictObject({
    line: z.number().int().positive(),
    text: z.string(),
  })
  .readonly();

export const DurableAnchorV1Schema = z
  .strictObject({
    version: z.literal('durable-anchor-v1'),
    path: ExactPathSchema,
    safeDisplayPath: z.string(),
    side: AnchorSideSchema,
    line: z.number().int().positive(),
    endLine: z.number().int().positive().optional(),
    blobOid: GitObjectIdSchema,
    selectedText: z.string(),
    context: z
      .strictObject({
        before: z.array(AnchorLineSchema).max(3).readonly(),
        target: AnchorLineSchema,
        after: z.array(AnchorLineSchema).max(3).readonly(),
      })
      .readonly(),
    contextHash: z
      .strictObject({
        algorithm: z.literal('sha256-v1'),
        value: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .readonly(),
    uniqueKey: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .superRefine((value, context) => {
    if (value.endLine !== undefined && value.endLine < value.line) {
      context.addIssue({ code: 'custom', message: 'endLine must be >= line.', path: ['endLine'] });
    }
  })
  .readonly();

export const AnchorVerificationSchema = z
  .strictObject({
    state: z.enum(['verified', 'stale', 'orphaned']),
    reason: z.enum(['exact-match', 'anchor-mismatch', 'anchor-unavailable']),
  })
  .readonly();

const PinnedDraftComparisonSchema = z
  .strictObject({
    baseCommitOid: GitObjectIdSchema,
    headCommitOid: GitObjectIdSchema,
    mergeBaseOid: GitObjectIdSchema,
    range: RangeReviewScopeSchema.optional(),
  })
  .superRefine((comparison, context) => {
    if (
      comparison.range !== undefined &&
      (comparison.range.baseOid !== comparison.baseCommitOid ||
        comparison.range.headOid !== comparison.headCommitOid)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Range provenance must match draft comparison endpoints.',
        path: ['range'],
      });
    }
  })
  .readonly();

const ExactPatchDraftComparisonSchema = z
  .strictObject({
    kind: z.literal('exact-patch'),
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    validationTarget: ExactPatchValidationTargetSchema,
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .readonly();

const UncommittedDraftComparisonSchema = z
  .strictObject({
    kind: z.literal('uncommitted'),
    sourceKind: z.enum(['staged', 'unstaged', 'worktree', 'standalone']),
    baseCommitOid: GitObjectIdSchema.optional(),
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
  })
  .superRefine((comparison, context) => {
    const hasBase = comparison.baseCommitOid !== undefined;
    const isNoBaseKind =
      comparison.sourceKind === 'unstaged' || comparison.sourceKind === 'standalone';
    if (isNoBaseKind && hasBase) {
      context.addIssue({
        code: 'custom',
        message: 'Unstaged and Standalone comparisons have no base.',
        path: ['baseCommitOid'],
      });
    }
    if (!isNoBaseKind && !hasBase) {
      context.addIssue({
        code: 'custom',
        message: 'Staged and Working tree comparisons require a base commit.',
        path: ['baseCommitOid'],
      });
    }
  })
  .readonly();

export const DraftComparisonSchema = z.union([PinnedDraftComparisonSchema, ExactPatchDraftComparisonSchema, UncommittedDraftComparisonSchema]).readonly();

const DraftCommentSchema = z
  .discriminatedUnion('state', [
    z.strictObject({
      id: CommentIdSchema,
      state: z.literal('open'),
      body: CommentBodySchema,
      anchor: DurableAnchorV1Schema,
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
    z.strictObject({
      id: CommentIdSchema,
      state: z.literal('resolved'),
      body: CommentBodySchema,
      anchor: DurableAnchorV1Schema,
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      resolvedAt: z.string().datetime(),
    }),
  ])
  .readonly();

export const CURRENT_DRAFT_SCHEMA_VERSION = 1;

export const DraftVersionEnvelopeSchema = z
  .object({ schemaVersion: z.number().int().positive() })
  .passthrough()
  .readonly();

export const ReviewDraftV1Schema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_DRAFT_SCHEMA_VERSION),
    comparison: DraftComparisonSchema,
    revision: RevisionSchema,
    summary: SummaryMarkdownSchema,
    comments: z.array(DraftCommentSchema).max(10_000).readonly(),
  })
  .superRefine((draft, context) => {
    const ids = new Set<string>();
    const anchors = new Set<string>();
    for (const [index, comment] of draft.comments.entries()) {
      if (ids.has(comment.id)) {
        context.addIssue({ code: 'custom', message: 'Comment IDs must be unique.', path: ['comments', index, 'id'] });
      }
      if (anchors.has(comment.anchor.uniqueKey)) {
        context.addIssue({ code: 'custom', message: 'Comments must have unique anchors.', path: ['comments', index, 'anchor', 'uniqueKey'] });
      }
      ids.add(comment.id);
      anchors.add(comment.anchor.uniqueKey);
    }
  })
  .readonly();

function containsLoneSurrogate(value: unknown): boolean {
  if (typeof value === 'string') {
    return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
  }
  if (Array.isArray(value)) return value.some(containsLoneSurrogate);
  if (value !== null && typeof value === 'object') return Object.values(value).some(containsLoneSurrogate);
  return false;
}

const ExportStringSchema = z.string().refine(
  (value) => !containsLoneSurrogate(value),
  'Strings must not contain lone UTF-16 surrogate code units.',
);

function hasRepositoryRelativePath(path: { readonly bytesBase64url: string; readonly display: string; readonly utf8?: string }): boolean {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64url(path.bytesBase64url);
  } catch {
    return false;
  }

  const values = [path.display, ...(path.utf8 === undefined ? [] : [path.utf8])];
  return (
    bytes.length > 0 &&
    bytes[0] !== 0x2f &&
    bytes[0] !== 0x5c &&
    values.every(
      (value) =>
        value.length > 0 &&
        !/^(?:[\\/]|[A-Za-z]:[\\/])/u.test(value) &&
        !value.split('/').some((segment) => segment === '.' || segment === '..'),
    )
  );
}

const ExportExactPathSchema = ExactPathSchema.superRefine((path, context) => {
  if (!hasRepositoryRelativePath(path)) {
    context.addIssue({ code: 'custom', message: 'Export paths must be repository-relative.' });
  }
});

const ExportCommentSchema = z
  .strictObject({
    id: CommentIdSchema,
    state: z.enum(['open', 'resolved']),
    body: CommentBodySchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
    verification: AnchorVerificationSchema,
    anchor: DurableAnchorV1Schema,
  })
  .superRefine((comment, context) => {
    const hasResolvedAt = comment.resolvedAt !== null;
    if ((comment.state === 'resolved') !== hasResolvedAt) {
      context.addIssue({
        code: 'custom',
        message: 'Resolved comments require resolvedAt; open comments must not have it.',
        path: ['resolvedAt'],
      });
    }
    if (!hasRepositoryRelativePath(comment.anchor.path)) {
      context.addIssue({ code: 'custom', message: 'Anchor paths must be repository-relative.', path: ['anchor', 'path'] });
    }
  })
  .readonly();

const ExportFileSchema = z
  .strictObject({
    path: ExportExactPathSchema,
    comments: z.array(ExportCommentSchema).readonly(),
  })
  .readonly();

export type ReviewExportCommentV1 = z.infer<typeof ExportCommentSchema>;

export function orderUtf16CodeUnits(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function orderReviewExportComments(left: ReviewExportCommentV1, right: ReviewExportCommentV1): number {
  const sideDifference = (left.anchor.side === 'base' ? 0 : 1) - (right.anchor.side === 'base' ? 0 : 1);
  if (sideDifference !== 0) return sideDifference;
  const lineDifference = left.anchor.line - right.anchor.line;
  if (lineDifference !== 0) return lineDifference;
  const blobDifference = orderUtf16CodeUnits(left.anchor.blobOid, right.anchor.blobOid);
  if (blobDifference !== 0) return blobDifference;
  const contextDifference = orderUtf16CodeUnits(left.anchor.contextHash.value, right.anchor.contextHash.value);
  if (contextDifference !== 0) return contextDifference;
  return orderUtf16CodeUnits(left.id, right.id);
}

const ExportCountsSchema = z
  .strictObject({
    all: z.number().int().nonnegative(),
    openActionable: z.number().int().nonnegative(),
    openNeedsAttention: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
  })
  .readonly();

const ExportEndpointSchema = z
  .strictObject({
    label: ExportStringSchema.min(1),
    launchOid: GitObjectIdSchema,
  })
  .readonly();

const ExportDriftEndpointSchema = z
  .strictObject({
    launchOid: GitObjectIdSchema,
    currentOid: GitObjectIdSchema.nullable(),
    status: z.enum(['unchanged', 'moved', 'unavailable']),
  })
  .superRefine((endpoint, context) => {
    if ((endpoint.status === 'unavailable') !== (endpoint.currentOid === null)) {
      context.addIssue({ code: 'custom', message: 'Unavailable drift endpoints have no current OID.', path: ['currentOid'] });
    }
    if (endpoint.status === 'unchanged' && endpoint.currentOid !== endpoint.launchOid) {
      context.addIssue({ code: 'custom', message: 'Unchanged drift endpoints retain their launch OID.', path: ['currentOid'] });
    }
  })
  .readonly();

export const ReviewExportV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    comparison: z
      .strictObject({
        selectedBase: ExportEndpointSchema,
        selectedHead: ExportEndpointSchema,
        mergeBaseOid: GitObjectIdSchema,
        comparisonKey: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .readonly(),
    drift: z
      .strictObject({
        observedAt: z.string().datetime(),
        acknowledged: z.boolean(),
        base: ExportDriftEndpointSchema,
        head: ExportDriftEndpointSchema,
      })
      .readonly(),
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    if (containsLoneSurrogate(document)) {
      context.addIssue({ code: 'custom', message: 'Export strings must not contain lone UTF-16 surrogate code units.' });
    }
    for (const [fileIndex, file] of document.files.entries()) {
      if (file.comments.length === 0) {
        context.addIssue({ code: 'custom', message: 'Export file groups must not be empty.', path: ['files', fileIndex, 'comments'] });
      }
      if (fileIndex > 0 && orderExactPaths(document.files[fileIndex - 1]!.path, file.path) >= 0) {
        context.addIssue({ code: 'custom', message: 'Export file groups must have unique exact paths in total order.', path: ['files', fileIndex, 'path'] });
      }
      for (const [commentIndex, comment] of file.comments.entries()) {
        if (orderExactPaths(file.path, comment.anchor.path) !== 0) {
          context.addIssue({ code: 'custom', message: 'Comment anchor path must match its export file group.', path: ['files', fileIndex, 'comments', commentIndex, 'anchor', 'path'] });
        }
        if (commentIndex > 0 && orderReviewExportComments(file.comments[commentIndex - 1]!, comment) >= 0) {
          context.addIssue({ code: 'custom', message: 'Export comments must have total anchor order.', path: ['files', fileIndex, 'comments', commentIndex] });
        }
      }
    }
    const comments = document.files.flatMap((file) => file.comments);
    const ids = new Set<string>();
    for (const [index, comment] of comments.entries()) {
      if (ids.has(comment.id)) {
        context.addIssue({ code: 'custom', message: 'Export comment IDs must be unique.', path: ['files', index] });
      }
      ids.add(comment.id);
    }

    const counts = {
      all: comments.length,
      openActionable: comments.filter((comment) => comment.state === 'open' && comment.verification.state === 'verified').length,
      openNeedsAttention: comments.filter((comment) => comment.state === 'open' && comment.verification.state !== 'verified').length,
      resolved: comments.filter((comment) => comment.state === 'resolved').length,
    };
    for (const key of Object.keys(counts) as Array<keyof typeof counts>) {
      if (document.counts[key] !== counts[key]) {
        context.addIssue({ code: 'custom', message: `Export count ${key} must match comment records.`, path: ['counts', key] });
      }
    }
  })
  .readonly();

export const ReviewExportV2Schema = z
  .strictObject({
    schemaVersion: z.literal(2),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    comparison: z
      .strictObject({
        selectedBase: ExportEndpointSchema,
        selectedHead: ExportEndpointSchema,
        mergeBaseOid: GitObjectIdSchema,
        comparisonKey: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .readonly(),
    drift: z
      .strictObject({
        observedAt: z.string().datetime(),
        acknowledged: z.boolean(),
        base: ExportDriftEndpointSchema,
        head: ExportDriftEndpointSchema,
      })
      .readonly(),
    summary: z.strictObject({ markdown: SummaryMarkdownSchema.nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
    range: RangeReviewScopeSchema,
  })
  .superRefine((document, context) => {
    const { range, ...versionOne } = document;
    if (!ReviewExportV1Schema.safeParse({ ...versionOne, schemaVersion: 1 }).success) {
      context.addIssue({ code: 'custom', message: 'Version 2 export must retain valid version 1 feedback.' });
    }
    if (
      range.requestedBase !== document.comparison.selectedBase.label
      || range.requestedHead !== document.comparison.selectedHead.label
      || range.baseOid !== document.comparison.selectedBase.launchOid
      || range.headOid !== document.comparison.selectedHead.launchOid
      || range.baseOid !== document.comparison.mergeBaseOid
      || range.reviewKey !== document.comparison.comparisonKey
    ) {
      context.addIssue({ code: 'custom', message: 'Range provenance must match the frozen export comparison.' });
    }
  })
  .readonly();

const ExactPatchExportScopeSchema = z
  .strictObject({
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    validationTarget: ExactPatchValidationTargetSchema,
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshot: z
      .strictObject({
        status: z.enum(['unchanged', 'drifted']),
        files: z.array(ChangedFileSchema).readonly(),
      })
      .readonly(),
  })
  .readonly();

export const ReviewExportV3Schema = z
  .strictObject({
    schemaVersion: z.literal(3),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    patch: ExactPatchExportScopeSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    const feedback = ReviewExportV1Schema.safeParse({
      schemaVersion: 1,
      kind: document.kind,
      exportedAt: document.exportedAt,
      acceptedDraftRevision: document.acceptedDraftRevision,
      comparison: {
        selectedBase: { label: 'preimage', launchOid: '0'.repeat(40) },
        selectedHead: { label: 'postimage', launchOid: '0'.repeat(40) },
        mergeBaseOid: '0'.repeat(40),
        comparisonKey: '0'.repeat(64),
      },
      drift: {
        observedAt: document.exportedAt,
        acknowledged: false,
        base: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
        head: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
      },
      summary: document.summary,
      files: document.files,
      counts: document.counts,
    });
    if (!feedback.success) {
      context.addIssue({ code: 'custom', message: 'Version 3 export must retain valid review feedback.' });
    }
  })
  .readonly();

const StandaloneExportScopeSchema = z
  .strictObject({
    originalArguments: z.array(z.string().min(1)).readonly(),
    resolvedPaths: z.array(ExactPathSchema).readonly(),
    fileDigests: z
      .array(
        z
          .strictObject({
            path: ExactPathSchema,
            sha256: z.string().regex(/^[0-9a-f]{64}$/u),
          })
          .readonly(),
      )
      .readonly(),
    snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .readonly();

export const ReviewExportV4Schema = z
  .strictObject({
    schemaVersion: z.literal(4),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    standalone: StandaloneExportScopeSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    const feedback = ReviewExportV1Schema.safeParse({
      schemaVersion: 1,
      kind: document.kind,
      exportedAt: document.exportedAt,
      acceptedDraftRevision: document.acceptedDraftRevision,
      comparison: {
        selectedBase: { label: 'preimage', launchOid: '0'.repeat(40) },
        selectedHead: { label: 'postimage', launchOid: '0'.repeat(40) },
        mergeBaseOid: '0'.repeat(40),
        comparisonKey: '0'.repeat(64),
      },
      drift: {
        observedAt: document.exportedAt,
        acknowledged: false,
        base: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
        head: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
      },
      summary: document.summary,
      files: document.files,
      counts: document.counts,
    });
    if (!feedback.success) {
      context.addIssue({ code: 'custom', message: 'Version 4 export must retain valid review feedback.' });
    }
  })
  .readonly();

export const DraftMutationSchema = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('addComment'), commentId: CommentIdSchema, body: CommentBodySchema, anchor: DurableAnchorV1Schema }),
    z.strictObject({ type: z.literal('editComment'), commentId: CommentIdSchema, body: CommentBodySchema }),
    z.strictObject({ type: z.literal('deleteComment'), commentId: CommentIdSchema }),
    z.strictObject({ type: z.literal('resolveComment'), commentId: CommentIdSchema }),
    z.strictObject({ type: z.literal('reopenComment'), commentId: CommentIdSchema }),
    z.strictObject({ type: z.literal('setSummary'), markdown: SummaryMarkdownSchema }),
  ])
  .readonly();

export type ReviewDraftV1 = z.infer<typeof ReviewDraftV1Schema>;
export type DraftComparison = z.infer<typeof DraftComparisonSchema>;
export type ReviewExportV1 = z.infer<typeof ReviewExportV1Schema>;
export type ReviewExportV2 = z.infer<typeof ReviewExportV2Schema>;
export type ReviewExportV3 = z.infer<typeof ReviewExportV3Schema>;
export type ReviewExportV4 = z.infer<typeof ReviewExportV4Schema>;
export type ReviewExport = ReviewExportV1 | ReviewExportV2 | ReviewExportV3 | ReviewExportV4;
export type ExactPatchExportScope = z.infer<typeof ExactPatchExportScopeSchema>;
export type StandaloneExportScope = z.infer<typeof StandaloneExportScopeSchema>;
export type ReviewDraftCommentV1 = z.infer<typeof DraftCommentSchema>;
export type DraftMutation = z.infer<typeof DraftMutationSchema>;

export type DurableAnchorV1Dto = z.infer<typeof DurableAnchorV1Schema>;
export type AnchorVerificationDto = z.infer<typeof AnchorVerificationSchema>;
