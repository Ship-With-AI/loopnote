<script setup lang="ts">
import type { AppendLoopnoteIgnoreResult, ExportDirectoryRevealResult, FinishReviewResult } from '../../../contracts/api.js';
import type { AttachedLifecycle, ReviewExportState, ReviewPendingOperation } from '../../model/review-draft-state.js';
import type { WorkspaceComment } from '../../model/workspace-state.js';
import ExportSection from '../ExportSection.vue';

defineProps<{
  revision: number;
  summary: string;
  summaryBuffer: string;
  comments: readonly WorkspaceComment[];
  pinnedEndpoints?: Readonly<{
    base: Readonly<{ label: string; oid: string }>;
    head: Readonly<{ label: string; oid: string }>;
  }>;
  commentBuffers: ReadonlyMap<string, string>;
  exportState: ReviewExportState;
  appendIgnoreRule: () => Promise<AppendLoopnoteIgnoreResult>;
  refreshIgnoreStatus: () => Promise<void>;
  revealExportDirectory: () => Promise<ExportDirectoryRevealResult>;
  locked?: boolean;
  attachedLifecycle?: AttachedLifecycle;
  attachedReady?: boolean;
  attachedFailure?: FinishReviewResult;
  unsavedInlineComposerFile?: Readonly<{ fileId: string; display: string }>;
  isExactPatch?: boolean;
  pending?: ReviewPendingOperation | null;
  conflict?: Readonly<{ expectedRevision: number; actualRevision: number }> | null;
}>();

const emit = defineEmits<{
  export: [];
  cancel: [];
  reloadLatest: [];
  reviewUnsavedText: [];
  finishReview: [];
  reloadAttached: [];
  reviewInlineComposer: [fileId: string];
}>();
</script>

<template>
  <ExportSection
    :revision="revision"
    :summary="summary"
    :summary-buffer="summaryBuffer"
    :comments="comments"
    :pinned-endpoints="pinnedEndpoints"
    :comment-buffers="commentBuffers"
    :export-state="exportState"
    :append-ignore-rule="appendIgnoreRule"
    :refresh-ignore-status="refreshIgnoreStatus"
    :reveal-export-directory="revealExportDirectory"
    :locked="locked"
    :attached-lifecycle="attachedLifecycle"
    :attached-ready="attachedReady"
    :attached-failure="attachedFailure"
    :unsaved-inline-composer-file="unsavedInlineComposerFile"
    :is-exact-patch="isExactPatch"
    :pending="pending"
    :conflict="conflict"
    @export="emit('export')"
    @cancel="emit('cancel')"
    @reload-latest="emit('reloadLatest')"
    @review-unsaved-text="emit('reviewUnsavedText')"
    @finish-review="emit('finishReview')"
    @reload-attached="emit('reloadAttached')"
    @review-inline-composer="emit('reviewInlineComposer', $event)"
  />
</template>
