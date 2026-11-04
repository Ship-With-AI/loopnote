<script setup lang="ts">
import type { AppendLoopnoteIgnoreResult, ExportDirectoryRevealResult, FinishReviewResult } from '../../../contracts/api.js';
import { RENAME_MAP } from '../../../domain/product-identity.js';
import { computed, nextTick, ref, watch } from 'vue';

import type { AttachedLifecycle, ReviewExportState, ReviewPendingOperation } from '../../model/review-draft-state.js';
import type { WorkspaceComment } from '../../model/workspace-state.js';
import ExportSection from '../ExportSection.vue';
import SummarySection from '../SummarySection.vue';
import ReviewStateBadge from '../ui/ReviewStateBadge.vue';
import UiIcon from '../ui/UiIcon.vue';
import PathText from '../ui/PathText.vue';

type ReviewFailure = Readonly<{
  operation: ReviewPendingOperation;
  commentId?: string;
}>;

const props = withDefaults(
  defineProps<{
    readonly open: boolean;
    readonly comments: readonly WorkspaceComment[];
    readonly summary: string;
    readonly revision: number;
    readonly pinnedEndpoints?: Readonly<{
      base: Readonly<{ label: string; oid: string }>;
      head: Readonly<{ label: string; oid: string }>;
    }>;
    readonly summaryBuffer: string;
    readonly commentBuffers: ReadonlyMap<string, string>;
    readonly pending: ReviewPendingOperation | null;
    readonly conflict: Readonly<{ expectedRevision: number; actualRevision: number }> | null;
    readonly failure: ReviewFailure | null;
    readonly retainedSummary: boolean;
    readonly exportState: ReviewExportState;
    readonly appendIgnoreRule: () => Promise<AppendLoopnoteIgnoreResult>;
    readonly refreshIgnoreStatus: () => Promise<void>;
    readonly revealExportDirectory: () => Promise<ExportDirectoryRevealResult>;
    readonly attachedLifecycle?: AttachedLifecycle;
    readonly attachedReady?: boolean;
    readonly attachedFailure?: FinishReviewResult;
    readonly unsavedInlineComposerFile?: Readonly<{ fileId: string; display: string }>;
    readonly mutationLocked?: boolean;
    readonly isExactPatch?: boolean;
    readonly exportSupported?: boolean;
  }>(),
  { exportSupported: true },
);

const emit = defineEmits<{
  close: [];
  'update:summaryBuffer': [body: string];
  saveSummary: [];
  cancelSummary: [];
  cancelExport: [];
  export: [];
  reloadLatest: [];
  reviewUnsavedText: [];
  reviewInlineComposer: [fileId: string];
  finishReview: [];
  reloadAttached: [];
}>();

const reviewFailure = computed(() => props.failure !== null && props.failure.operation !== 'summary');
const failureAlert = ref<HTMLElement>();

const openCount = computed(() => props.comments.filter((comment) => comment.state === 'open').length);
const resolvedCount = computed(() => props.comments.filter((comment) => comment.state === 'resolved').length);
const summaryFailure = computed(() => props.failure?.operation === 'summary');
const attached = computed(() => props.attachedLifecycle !== undefined);
const attachedHasUnsavedText = computed(() => (
  props.summaryBuffer !== props.summary
  || props.comments.some((comment) => props.commentBuffers.get(comment.id) !== undefined && props.commentBuffers.get(comment.id) !== comment.body)
));
const attachedBlockedByUnsavedText = computed(
  () => attachedHasUnsavedText.value || props.unsavedInlineComposerFile !== undefined,
);
const attachedBlockedByPending = computed(() => props.pending !== null);
const attachedBlockedByConflict = computed(() => props.conflict !== null);
const attachedNoFeedback = computed(() => props.summary === '' && props.comments.length === 0);
const completionAction = ref<HTMLButtonElement>();
const completionSuccess = ref<HTMLElement>();
const completionFailure = ref<HTMLElement>();

function finishAttachedReview(): void {
  if (props.attachedReady) emit('finishReview');
}

watch(() => [props.attachedLifecycle, props.attachedFailure] as const, ([lifecycle, failure]) => {
  if (lifecycle === 'finishing') void nextTick(() => completionAction.value?.focus());
  if (lifecycle === 'completed') void nextTick(() => completionSuccess.value?.focus());
  if (lifecycle === 'waitingDisconnected' || lifecycle === 'terminalFailure' || failure !== undefined) {
    void nextTick(() => completionFailure.value?.focus());
  }
}, { deep: true });

watch(reviewFailure, (failed) => {
  if (failed) void nextTick(() => failureAlert.value?.focus());
});
</script>

<template>
  <section v-if="open" role="region" aria-label="Review" class="bottom-panel">
    <header class="bottom-panel__header">
      <span class="bottom-panel__label">REVIEW</span>
      <button type="button" class="icon-btn" aria-label="Close panel" @click="emit('close')">
        <UiIcon name="close" />
      </button>
    </header>

    <section
      v-if="conflict !== null"

      class="inline-notice inline-notice--warning review-panel__conflict"
      role="alert"
      tabindex="-1"
      aria-labelledby="review-conflict-heading"
    >
      <UiIcon name="warning" class="inline-notice__icon" />
      <div class="inline-notice__content">
        <h3 id="review-conflict-heading">Review changed in another tab</h3>
        <dl>
          <div><dt>Your revision</dt><dd>{{ conflict.expectedRevision }}</dd></div>
          <div><dt>Latest revision</dt><dd>{{ conflict.actualRevision }}</dd></div>
        </dl>
        <p>Nothing from your attempt was written.</p>
        <p>Unsaved text retained in this tab.</p>
        <button type="button" class="ui-button" @click="emit('reloadLatest')">Reload latest</button>
      </div>
    </section>

    <section
      v-if="reviewFailure"
      ref="failureAlert"
      class="inline-notice inline-notice--error review-panel__failure"
      role="alert"
      tabindex="-1"
      aria-labelledby="review-operation-failed-heading"
    >
      <UiIcon name="error" class="inline-notice__icon" />
      <div class="inline-notice__content">
        <h3 id="review-operation-failed-heading">Review change failed</h3>
        <p v-if="failure?.operation === 'comment'">Comment wasn’t saved. Your text is still in this tab.</p>
        <p v-else>{{ `The review change wasn’t saved. The accepted local draft is unchanged. Try again after checking ${RENAME_MAP.displayName} is running.` }}</p>
      </div>
    </section>
    <SummarySection
      :canonical="summary"
      :model-value="summaryBuffer"
      :pending="pending !== null || mutationLocked === true"
      :saving="pending === 'summary'"
      :conflict="conflict !== null"
      :failure="summaryFailure"
      :retained="retainedSummary"

      @cancel="emit('cancelSummary')"
      @save="emit('saveSummary')"
      @update:model-value="emit('update:summaryBuffer', $event)"
    />

    <section class="review-notes-dialog__counts" aria-label="Review comment counts">
      <ReviewStateBadge kind="open" :label="`Open ${openCount}`" />
      <ReviewStateBadge kind="resolved" :label="`Resolved ${resolvedCount}`" />
    </section>

    <template v-if="exportSupported">
    <ExportSection
      :revision="revision"
      :pinned-endpoints="pinnedEndpoints"
      :summary="summary"
      :summary-buffer="summaryBuffer"
      :comments="comments"
      :comment-buffers="commentBuffers"
      :export-state="exportState"
      :append-ignore-rule="appendIgnoreRule"
      :refresh-ignore-status="refreshIgnoreStatus"
      :reveal-export-directory="revealExportDirectory"
      :attached="attached"
      :locked="mutationLocked"
      @cancel="emit('cancelExport')"
      @export="emit('export')"
      @reload-latest="emit('reloadLatest')"
      @review-unsaved-text="emit('reviewUnsavedText')"
    />
    </template>

    <section v-if="attached" class="attached-completion" aria-labelledby="finish-attached-review-heading">
      <header class="attached-completion__heading">
        <h3 id="finish-attached-review-heading">Finish attached review</h3>
        <ReviewStateBadge
          :kind="attachedLifecycle === 'completed' ? 'resolved' : 'open'"
          :label="attachedLifecycle === 'completed' ? 'Completed' : attachedLifecycle === 'finishing' ? 'Finishing' : 'Waiting'"
        />
      </header>

      <template v-if="attachedLifecycle === 'completed'">
        <div class="inline-notice inline-notice--success" role="status">
          <UiIcon name="check" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionSuccess" tabindex="-1">Review finished</h4>
            <p>The accepted review was returned to the requesting agent from revision {{ revision }}. You can close this tab.</p>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'finishing'">
        <button ref="completionAction" type="button" class="ui-button ui-button--primary attached-completion__action" disabled aria-busy="true">
          <span class="ui-spinner" aria-hidden="true" />Finishing review…
        </button>
        <p class="attached-completion__progress" role="status" aria-live="polite">Validating accepted revision {{ revision }} and its recorded anchors…</p>
      </template>

      <template v-else-if="attachedLifecycle === 'waitingDisconnected'">
        <div class="inline-notice inline-notice--error" role="alert">
          <UiIcon name="error" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Attached review disconnected</h4>
            <p>{{ `The browser lost its connection to ${RENAME_MAP.displayName}. This review is still unfinished. Reload this page while ${RENAME_MAP.displayName} is running, then choose Finish review.` }}</p>
            <button type="button" class="ui-button" @click="emit('reloadAttached')">Reload page</button>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'terminalFailure'">
        <div class="inline-notice inline-notice--error" role="alert">
          <UiIcon name="error" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Completion status unavailable</h4>
            <p>{{ `${RENAME_MAP.displayName} disconnected before this tab received confirmation. This tab does not claim the review was finished. Check the invoking terminal. If ${RENAME_MAP.displayName} is still running, reload to reconnect.` }}</p>
            <button type="button" class="ui-button" @click="emit('reloadAttached')">Reload page</button>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'retryableFailure' && attachedFailure?.kind === 'revisionConflict'">
        <div class="inline-notice inline-notice--warning" role="alert">
          <UiIcon name="warning" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Review changed before finish</h4>
            <p>Accepted revision {{ attachedFailure.expectedRevision }} is no longer current. Latest revision is {{ attachedFailure.actualRevision }}. No feedback was returned. Reload the latest review, check the comments and summary, then choose Finish review again.</p>
            <button type="button" class="ui-button" @click="emit('reloadLatest')">Reload latest</button>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'retryableFailure' && attachedFailure?.kind === 'staleAnchors'">
        <div class="inline-notice inline-notice--warning" role="alert">
          <UiIcon name="warning" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Review can’t be finished</h4>
            <p>{{ `${RENAME_MAP.displayName} found stale or unavailable feedback anchors in the accepted review. Affected comments: ${attachedFailure.affectedCount}. No feedback returned. Their recorded anchors remain unchanged and may not be actionable in exported feedback.` }}</p>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'retryableFailure' && attachedFailure?.kind === 'scopeInvalid'">
        <div class="inline-notice inline-notice--warning" role="alert">
          <UiIcon name="warning" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Reviewed content changed</h4>
            <p>{{ isExactPatch ? 'The submitted patch content no longer passes completion validation. No feedback returned. Relaunch agent request against valid content.' : 'The submitted review scope no longer passes completion validation. No feedback returned. Relaunch agent request against valid content.' }}</p>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'retryableFailure' && attachedFailure?.kind === 'draftReadOnly'">
        <div class="inline-notice inline-notice--warning" role="alert">
          <UiIcon name="warning" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Review draft can’t be validated</h4>
            <p>{{ `The accepted local draft is corrupt, incomplete, or read-only. No feedback was returned. Reload the review; if it remains unavailable, relaunch ${RENAME_MAP.displayName}.` }}</p>
            <button type="button" class="ui-button" @click="emit('reloadAttached')">Reload review</button>
          </div>
        </div>
      </template>

      <template v-else-if="attachedLifecycle === 'retryableFailure'">
        <div class="inline-notice inline-notice--error" role="alert">
          <UiIcon name="error" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 ref="completionFailure" tabindex="-1">Review was not finished</h4>
            <p>{{ `No feedback was returned. Check that ${RENAME_MAP.displayName} is still running, then try Finish review again.` }}</p>
            <button type="button" class="ui-button ui-button--primary" @click="finishAttachedReview">Try Finish review again</button>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="attached-completion__waiting">The requesting agent is waiting. Only Finish review returns the accepted summary and comments. Exporting, closing, reloading, or disconnecting leaves this review unfinished.</p>
        <div v-if="attachedNoFeedback" class="inline-notice">
          <div class="inline-notice__content">
            <h4>No feedback added</h4>
            <p>This review has no accepted summary or comments. You can still finish and return an empty review result, or add feedback first.</p>
          </div>
        </div>
        <div v-if="attachedHasUnsavedText" class="inline-notice inline-notice--warning">
          <div class="inline-notice__content">
            <h4>Unsaved text must be reviewed</h4>
            <p>Save or discard unsaved summary or comment text before finishing. The requesting agent only receives the accepted review.</p>
            <button type="button" class="ui-button" @click="emit('reviewUnsavedText')">Review unsaved text</button>
          </div>
        </div>
        <div v-if="unsavedInlineComposerFile !== undefined" class="inline-notice inline-notice--warning" role="region" aria-labelledby="inline-composer-finish-block-heading">
          <div class="inline-notice__content">
            <h4 id="inline-composer-finish-block-heading">Inline comment draft must be reviewed</h4>
            <p><PathText :display="unsavedInlineComposerFile.display" /> has unsaved text. Save or discard it before finishing.</p>
            <button type="button" class="ui-button" @click="emit('reviewInlineComposer', unsavedInlineComposerFile.fileId)">
              Review draft in <PathText :display="unsavedInlineComposerFile.display" />
            </button>
          </div>
        </div>
        <p v-if="!attachedBlockedByUnsavedText && attachedBlockedByPending" class="attached-completion__pending" role="status">Saving review changes…</p>
        <div v-else-if="!attachedBlockedByUnsavedText && attachedBlockedByConflict" class="inline-notice inline-notice--warning">
          <div class="inline-notice__content">
            <h4>Review changed before finish</h4>
            <p>Accepted revision {{ conflict?.expectedRevision }} is no longer current. Latest revision is {{ conflict?.actualRevision }}. No feedback was returned. Reload the latest review, check the comments and summary, then choose Finish review again.</p>
            <button type="button" class="ui-button" @click="emit('reloadLatest')">Reload latest</button>
          </div>
        </div>
        <button ref="completionAction" type="button" class="ui-button ui-button--primary attached-completion__action" :disabled="attachedReady !== true" @click="finishAttachedReview">Finish review</button>
      </template>
    </section>
  </section>
</template>

<style scoped>
.bottom-panel__label {
  font-size: var(--font-size-label);
  letter-spacing: var(--letter-spacing-label);
  text-transform: uppercase;
}
</style>
