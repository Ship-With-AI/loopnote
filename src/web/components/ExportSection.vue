<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { RENAME_MAP } from '../../domain/product-identity.js';

import type { AppendLoopnoteIgnoreResult, ExportDirectoryRevealResult, FinishReviewResult } from '../../contracts/api.js';
import type { AttachedLifecycle, ReviewExportState, ReviewPendingOperation } from '../model/review-draft-state.js';
import type { WorkspaceComment } from '../model/workspace-state.js';
import ExportReadinessSummary from './ExportReadinessSummary.vue';
import DriftExportAcknowledgement from './DriftExportAcknowledgement.vue';
import ExportProgress from './ExportProgress.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import UiIcon from './ui/UiIcon.vue';
import PathText from './ui/PathText.vue';
import GitignoreStatus from './GitignoreStatus.vue';
import ExportReceipt from './ExportReceipt.vue';

const props = defineProps<{
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
const conflictHeading = ref<HTMLElement>();
const failureHeading = ref<HTMLElement>();

const open = ref(true);
const heading = ref<HTMLElement>();
const hasUnsavedText = computed(() => props.summary !== props.summaryBuffer || props.comments.some((comment) => props.commentBuffers.get(comment.id) !== undefined && props.commentBuffers.get(comment.id) !== comment.body));
const stateLabel = computed(() => {
  switch (props.exportState.phase) {
    case 'drift': return 'Needs acknowledgement';
    case 'pending': return 'Exporting';
    case 'conflict': return 'Review changed';
    case 'exported': return 'Exported';
    case 'failed': return 'Failed';
    case 'unavailable': return 'Unavailable';
    default: return 'Ready';
  }
});
const stateKind = computed(() => {
  switch (props.exportState.phase) {
    case 'drift': return 'warning';
    case 'pending': return 'pending';
    case 'exported': return 'success';
    case 'conflict':
    case 'failed': return 'error';
    case 'unavailable': return 'disabled';
    default: return 'information';
  }
});

const attached = computed(() => props.attachedLifecycle !== undefined);
const attachedBlockedByUnsavedText = computed(
  () => hasUnsavedText.value || props.unsavedInlineComposerFile !== undefined,
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

watch(() => props.exportState.phase, (phase) => {
  if (phase === 'drift' || phase === 'conflict' || phase === 'failed' || phase === 'exported') {
    open.value = true;
    void nextTick(() => {
      if (phase === 'conflict') conflictHeading.value?.focus();
      else if (phase === 'failed') failureHeading.value?.focus();
      else if (phase !== 'drift' && phase !== 'exported') heading.value?.focus();
    });
  }
});
</script>

<template>
  <section class="export-section" aria-labelledby="export-heading">
    <header class="export-section__heading">
      <h3 id="export-heading" ref="heading" tabindex="-1">Export <ReviewStateBadge :kind="stateKind" :label="stateLabel" /></h3>
      <button type="button" class="ui-button" :aria-expanded="open" aria-controls="export-section-content" @click="open = !open">{{ open ? 'Collapse export' : 'Expand export' }}</button>
    </header>

    <div v-if="open" id="export-section-content" class="export-section__content">
      <section v-if="attached && attachedLifecycle !== undefined && attachedLifecycle !== 'waiting'" class="attached-completion" aria-labelledby="finish-attached-review-heading">
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
      </section>

      <section v-else-if="locked" class="inline-notice" role="status">
        <div class="inline-notice__content">
          <p>Review lifecycle is settled. Export controls are unavailable.</p>
        </div>
      </section>
      <section v-else-if="exportState.phase === 'conflict' && exportState.conflict !== null" class="inline-notice inline-notice--error" role="alert" aria-labelledby="export-conflict-heading" @keydown.escape.stop>
        <UiIcon name="error" class="inline-notice__icon" />
        <div class="inline-notice__content">
          <h4 id="export-conflict-heading" ref="conflictHeading" tabindex="-1">Review changed before export</h4>
          <p>Accepted revision {{ exportState.conflict.expectedRevision }} is no longer current. Nothing from this export attempt was published.</p>
          <p>Latest revision {{ exportState.conflict.actualRevision }}</p>
          <button type="button" class="ui-button" @click="emit('reloadLatest')">Reload latest</button>
          <p>Reloading adopts the latest accepted review. It does not export automatically.</p>
        </div>
      </section>
      <DriftExportAcknowledgement
        v-else-if="exportState.phase === 'drift' && exportState.driftObservation !== null && pinnedEndpoints !== undefined"
        :observation="exportState.driftObservation"
        :stale="exportState.driftStale"
        :pinned-endpoints="pinnedEndpoints"
        :pending="exportState.pending"
        @cancel="emit('cancel')"
        @confirm="emit('export')"
      />

      <section v-else-if="exportState.phase === 'failed'" class="inline-notice inline-notice--error" role="alert" aria-labelledby="export-failure-heading" @keydown.escape.stop>
        <UiIcon name="error" class="inline-notice__icon" />
        <div class="inline-notice__content">
          <h4 id="export-failure-heading" ref="failureHeading" tabindex="-1">{{ exportState.failure === 'recoveryRequired' ? 'Export needs recovery' : 'Export was not published' }}</h4>
          <p>{{ exportState.failure === 'recoveryRequired' ? `${RENAME_MAP.displayName} could not confirm a complete new export pair. No success receipt is available. Check terminal details, then try again after recovery.` : exportState.failure === 'reExportUnsupported' ? 'This export cannot replace a previous pair safely on this runtime.' : 'The export pair could not be validated.' }}</p>
          <ExportReceipt
            v-if="exportState.previousConfirmedReceipt !== null"
            :receipt="exportState.previousConfirmedReceipt"
            :reveal-export-directory="revealExportDirectory"
            previous
          />
          <div class="export-actions">
            <button type="button" class="ui-button" @click="emit('export')">Try export again</button>
            <button type="button" class="ui-button" @click="emit('reviewUnsavedText')">Return to review</button>
          </div>
          <p>Retry starts a new complete export attempt from the current accepted revision.</p>
        </div>
      </section>

      <ExportProgress v-else-if="exportState.phase === 'pending'" :revision="revision" :stage="exportState.progress ?? 'preparing'" />

      <template v-else-if="exportState.phase === 'unavailable'">
        <section class="inline-notice inline-notice--error" role="alert" aria-labelledby="export-unavailable-heading" @keydown.escape.stop>
          <UiIcon name="error" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 id="export-unavailable-heading">Export is unavailable</h4>
            <p>Export is unavailable on this runtime.</p>
          </div>
        </section>
      </template>

      <template v-else-if="exportState.phase === 'exported' && exportState.receipt !== null">
        <ExportReceipt :receipt="exportState.receipt" :reveal-export-directory="revealExportDirectory" />
        <template v-if="!attached || attachedLifecycle !== 'waiting'">
          <button type="button" class="ui-button ui-button--primary" :disabled="exportState.pending" @click="emit('export')">Export review again</button>
          <p class="export-section__support">Creates <code>review.json</code> and <code>review.md</code> together from accepted revision {{ revision }}. This does not apply, stage, commit, or push changes.</p>
        </template>
        <template v-else>
          <section class="attached-completion" aria-labelledby="finish-attached-review-heading">
            <header class="attached-completion__heading">
              <h3 id="finish-attached-review-heading">Finish attached review</h3>
              <ReviewStateBadge kind="open" label="Waiting" />
            </header>
            <p class="attached-completion__waiting">The requesting agent is waiting. Only Finish review returns the accepted summary and comments. Exporting, closing, reloading, or disconnecting leaves this review unfinished.</p>
            <div v-if="attachedNoFeedback" class="inline-notice">
              <div class="inline-notice__content">
                <h4>No feedback added</h4>
                <p>This review has no accepted summary or comments. You can still finish and return an empty review result, or add feedback first.</p>
              </div>
            </div>
            <div v-if="hasUnsavedText" class="inline-notice inline-notice--warning">
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
          </section>
        </template>
      </template>

      <template v-else>
        <ExportReadinessSummary
          :revision="revision"
          :summary="summary"
          :comments="comments"
          :ignore-status="exportState.ignoreStatus"
        />
        <section v-if="hasUnsavedText" class="inline-notice inline-notice--warning" aria-labelledby="export-unsaved-heading">
          <UiIcon name="warning" class="inline-notice__icon" />
          <div class="inline-notice__content">
            <h4 id="export-unsaved-heading">Unsaved text is excluded</h4>
            <p>Unsaved text in this tab is not included. Export uses accepted revision {{ revision }}.</p>
            <button type="button" class="ui-button" @click="emit('reviewUnsavedText')">Review unsaved text</button>
          </div>
        </section>
        <template v-if="!attached || attachedLifecycle !== 'waiting'">
          <button type="button" class="ui-button ui-button--primary" :disabled="exportState.pending" @click="emit('export')">{{ exportState.phase === 'exported' ? 'Export review again' : 'Export review' }}</button>
          <p class="export-section__support">Creates <code>review.json</code> and <code>review.md</code> together from accepted revision {{ revision }}. This does not apply, stage, commit, or push changes.</p>
        </template>
        <template v-else>
          <section class="attached-completion" aria-labelledby="finish-attached-review-heading">
            <header class="attached-completion__heading">
              <h3 id="finish-attached-review-heading">Finish attached review</h3>
              <ReviewStateBadge kind="open" label="Waiting" />
            </header>
            <p class="attached-completion__waiting">The requesting agent is waiting. Only Finish review returns the accepted summary and comments. Exporting, closing, reloading, or disconnecting leaves this review unfinished.</p>
            <div v-if="attachedNoFeedback" class="inline-notice">
              <div class="inline-notice__content">
                <h4>No feedback added</h4>
                <p>This review has no accepted summary or comments. You can still finish and return an empty review result, or add feedback first.</p>
              </div>
            </div>
            <div v-if="hasUnsavedText" class="inline-notice inline-notice--warning">
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
          </section>
        </template>
      </template>

      <GitignoreStatus
        v-if="!locked"
        :status="exportState.ignoreStatus"
        :append-ignore-rule="appendIgnoreRule"
        :refresh-ignore-status="refreshIgnoreStatus"
      />
    </div>
  </section>
</template>
