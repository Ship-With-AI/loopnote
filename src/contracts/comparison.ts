import { z } from 'zod';

export const GitObjectIdSchema = z
  .string()
  .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

export const BranchSourceIdentitySchema = z.strictObject({
  kind: z.literal('branch'),
  id: z.string().min(1),
  refName: z.string().min(1),
});

export const WorktreeSourceIdentitySchema = z.strictObject({
  kind: z.literal('worktree'),
  id: z.string().min(1),
  path: z.string().min(1),
  detached: z.boolean(),
  dirty: z.boolean(),
});

export const SelectedSourceIdentitySchema = z.discriminatedUnion('kind', [
  BranchSourceIdentitySchema,
  WorktreeSourceIdentitySchema,
]);

export const ComparisonSelectionSchema = z.strictObject({
  label: z.string().min(1),
  revision: z.string().min(1),
  source: SelectedSourceIdentitySchema.optional(),
});

export const PinnedEndpointSchema = z.strictObject({
  label: z.string().min(1),
  oid: GitObjectIdSchema,
  source: SelectedSourceIdentitySchema.optional(),
});

export const RangeReviewScopeSchema = z
  .strictObject({
    kind: z.literal('revisions'),
    requestedBase: z.string().min(1),
    requestedHead: z.string().min(1),
    baseOid: GitObjectIdSchema,
    headOid: GitObjectIdSchema,
    pathspecs: z.array(z.string()).readonly(),
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .readonly();

export const ExactPatchValidationTargetSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('repository') }),
    z.strictObject({ kind: z.literal('worktree') }),
  ])
  .readonly();

export const ExactPatchScopeSchema = z
  .strictObject({
    kind: z.literal('exact-patch'),
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    validationTarget: ExactPatchValidationTargetSchema,
    submittedByteLength: z.number().int().positive().max(1_048_576),
  })
  .readonly();

export const ExactPathSchema = z
  .strictObject({
    bytesBase64url: z.string().regex(/^[A-Za-z0-9_-]+$/),
    display: z.string(),
    utf8: z.string().optional(),
  })
  .readonly();

export const ChangedFileStatusKindSchema = z.enum([
  'added',
  'copied',
  'deleted',
  'modified',
  'renamed',
  'type-changed',
  'unsupported',
]);

export const ChangedFileStatusSchema = z
  .strictObject({
    code: z.string().regex(/^[A-Z]$/),
    kind: ChangedFileStatusKindSchema,
    similarity: z.number().int().min(0).max(100).nullable(),
  })
  .readonly();

export const GitModeSchema = z.string().regex(/^[0-7]{6}$/);
export const UnsupportedAvailabilityReasonSchema = z.enum([
  'binary',
  'non-utf8',
  'oversized',
  'submodule',
  'symlink',
  'mode-or-type',
  'changed-during-capture',
]);

export const AvailabilitySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('text') }),
    z.strictObject({
      kind: z.literal('unsupported'),
      reason: UnsupportedAvailabilityReasonSchema,
    }),
    z.strictObject({
      kind: z.literal('unavailable'),
      reason: z.literal('missing-object'),
    }),
  ])
  .readonly();


export const ChangedFileSchema = z
  .strictObject({
    id: z.string().regex(/^file_[A-Za-z0-9_-]{43}$/),
    status: ChangedFileStatusSchema,
    oldMode: GitModeSchema,
    newMode: GitModeSchema,
    oldBlobOid: GitObjectIdSchema,
    newBlobOid: GitObjectIdSchema,
    oldPath: ExactPathSchema.optional(),
    newPath: ExactPathSchema.optional(),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
    availability: AvailabilitySchema,
  })
  .readonly();

export const UncommittedScopeSchema = z
  .strictObject({
    kind: z.literal('uncommitted'),
    sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
    repositoryRoot: z.string().min(1),
    objectFormat: z.enum(['sha1', 'sha256']),
    baseCommitOid: GitObjectIdSchema.optional(),
    mergeBaseOid: GitObjectIdSchema.optional(),
    changedFiles: z.array(ChangedFileSchema).readonly(),
  })
  .superRefine((scope, context) => {
    const hasBase = scope.baseCommitOid !== undefined;
    const hasMergeBase = scope.mergeBaseOid !== undefined;
    if (scope.sourceKind === 'unstaged') {
      if (hasBase || hasMergeBase) {
        context.addIssue({
          code: 'custom',
          message: 'Unstaged comparisons must not have a base commit.',
          path: ['baseCommitOid'],
        });
      }
    } else if (!hasBase || !hasMergeBase) {
      context.addIssue({
        code: 'custom',
        message:
          'Staged and Working tree comparisons require a base commit.',
        path: ['baseCommitOid'],
      });
    }
  })
  .readonly();

export const PinnedComparisonSchema = z.strictObject({
  repositoryRoot: z.string().min(1),
  objectFormat: z.enum(['sha1', 'sha256']),
  base: PinnedEndpointSchema,
  head: PinnedEndpointSchema,
  mergeBaseOid: GitObjectIdSchema,
  changedFiles: z.array(ChangedFileSchema).readonly(),
  hasCommittedChanges: z.boolean(),
  range: RangeReviewScopeSchema.optional(),
});

export type ComparisonSelection = z.infer<typeof ComparisonSelectionSchema>;
export type PinnedComparison = z.infer<typeof PinnedComparisonSchema>;
export type RangeReviewScope = z.infer<typeof RangeReviewScopeSchema>;
export type ExactPatchValidationTarget = z.infer<typeof ExactPatchValidationTargetSchema>;
export type ExactPatchScope = z.infer<typeof ExactPatchScopeSchema>;
export type UncommittedScope = z.infer<typeof UncommittedScopeSchema>;
export interface GroundedExactPatch {
  readonly repositoryRoot: string;
  readonly objectFormat: 'sha1' | 'sha256';
  readonly scope: ExactPatchScope;
  readonly changedFiles: readonly ChangedFile[];
  readonly contents: ReadonlyMap<string, Readonly<{ readonly preimage: Buffer | undefined; readonly postimage: Buffer | undefined }>>;
}
export type ExactPathDto = z.infer<typeof ExactPathSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type UnsupportedAvailabilityReason = z.infer<
  typeof UnsupportedAvailabilityReasonSchema
>;
export type ChangedFileStatusKind = z.infer<
  typeof ChangedFileStatusKindSchema
>;
export type ChangedFileStatus = z.infer<typeof ChangedFileStatusSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
