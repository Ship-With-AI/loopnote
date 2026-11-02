<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { RENAME_MAP } from '../../domain/product-identity.js';

import type { AppendLoopnoteIgnoreResult, ExportDirectoryRevealResult } from '../../contracts/api.js';
import type { ReviewExportState } from '../model/review-draft-state.js';
import type { WorkspaceComment } from '../model/workspace-state.js';
import ExportReadinessSummary from './ExportReadinessSummary.vue';
import DriftExportAcknowledgement from './DriftExportAcknowledgement.vue';
import ExportProgress from './ExportProgress.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import UiIcon from './ui/UiIcon.vue';
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
  attached?: boolean;
  locked?: boolean;
}>();

const emit = defineEmits<{
  export: [];
  cancel: [];
  reloadLatest: [];
  reviewUnsavedText: [];
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
      <section v-if="locked" class="inline-notice" role="status">
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
        <button type="button" class="ui-button ui-button--primary" :disabled="exportState.pending" @click="emit('export')">Export review again</button>
        <p class="export-section__support">Creates <code>review.json</code> and <code>review.md</code> together from accepted revision {{ revision }}. This does not apply, stage, commit, or push changes.</p>
        <p v-if="attached && !locked" class="export-section__support">Export complete. This attached review is still unfinished. Choose Finish review when you are ready.</p>
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
        <button type="button" class="ui-button ui-button--primary" :disabled="exportState.pending" @click="emit('export')">{{ exportState.phase === 'exported' ? 'Export review again' : 'Export review' }}</button>
        <p class="export-section__support">Creates <code>review.json</code> and <code>review.md</code> together from accepted revision {{ revision }}. This does not apply, stage, commit, or push changes.</p>
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
