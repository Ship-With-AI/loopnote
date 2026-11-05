<script setup lang="ts">
import type { AppendLoopnoteIgnoreResult, ExportDirectoryRevealResult, FinishReviewResult } from '../../../contracts/api.js';
import { RENAME_MAP } from '../../../domain/product-identity.js';
import { computed, nextTick, ref, watch } from 'vue';

import type { VisibleFileTreeLeaf } from '../../model/file-tree.js';
import type { PanelTab } from '../../model/panel-state.js';
import type { AttachedLifecycle, ReviewExportState, ReviewPendingOperation } from '../../model/review-draft-state.js';
import type { WorkspaceComment } from '../../model/workspace-state.js';
import CommentsTab from './CommentsTab.vue';
import ExportTab from './ExportTab.vue';
import SummaryTab from './SummaryTab.vue';
import UiIcon from '../ui/UiIcon.vue';

type ReviewFailure = Readonly<{
  operation: ReviewPendingOperation;
  commentId?: string;
}>;

const props = withDefaults(
  defineProps<{
    readonly open: boolean;
    readonly comments: readonly WorkspaceComment[];
    readonly flatFileRows?: readonly VisibleFileTreeLeaf[];
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
    readonly activeTab?: PanelTab;
  }>(),
  { exportSupported: true, activeTab: 'comments', flatFileRows: () => [] },
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
  'update:activeTab': [tab: PanelTab];
  reveal: [commentId: string, fileId: string, side: WorkspaceComment['side'], line: number];
}>();

const reviewFailure = computed(() => props.failure !== null && props.failure.operation !== 'summary');
const failureAlert = ref<HTMLElement>();

const summaryFailure = computed(() => props.failure?.operation === 'summary');
const attached = computed(() => props.attachedLifecycle !== undefined);

watch(reviewFailure, (failed) => {
  if (failed) void nextTick(() => failureAlert.value?.focus());
});

const TABS = [
  { id: 'comments', label: 'Comments' },
  { id: 'summary', label: 'Summary' },
  { id: 'export', label: 'Export' },
] as const satisfies readonly { id: PanelTab; label: string }[];

const tabButtons = new Map<PanelTab, HTMLButtonElement>();
function setTabRef(id: PanelTab, el: Element | null): void {
  if (el instanceof HTMLButtonElement) tabButtons.set(id, el);
  else tabButtons.delete(id);
}

function selectTab(tab: PanelTab): void {
  emit('update:activeTab', tab);
}

function moveTab(delta: 1 | -1): void {
  const index = TABS.findIndex((tab) => tab.id === props.activeTab);
  const next = TABS[(index + delta + TABS.length) % TABS.length]!;
  selectTab(next.id);
  void nextTick(() => tabButtons.get(next.id)?.focus());
}

function focusActiveTab(): void {
  tabButtons.get(props.activeTab)?.focus();
}

defineExpose({ focusActiveTab });
</script>

<template>
  <section v-if="open" role="region" aria-label="Review" class="bottom-panel">
    <header class="bottom-panel__header">
      <div role="tablist" aria-label="Review panel" class="bottom-panel__tabs">
        <button
          v-for="tab in TABS" :key="tab.id" :ref="(el) => setTabRef(tab.id, el as Element | null)"
          :id="`panel-tab-${tab.id}`" role="tab" type="button"
          class="bottom-panel__tab" :class="{ 'bottom-panel__tab--selected': activeTab === tab.id }"
          :aria-selected="activeTab === tab.id" :aria-controls="`panel-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
          @keydown.left.prevent="moveTab(-1)" @keydown.right.prevent="moveTab(1)"
        >{{ tab.label }}</button>
      </div>
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

    <div id="panel-panel-comments" role="tabpanel" aria-labelledby="panel-tab-comments" :hidden="activeTab !== 'comments'">
      <CommentsTab
        v-if="activeTab === 'comments'"
        :comments="comments"
        :flat-file-rows="flatFileRows"
        @reveal="(commentId, fileId, side, line) => emit('reveal', commentId, fileId, side, line)"
      />
    </div>
    <div id="panel-panel-summary" role="tabpanel" aria-labelledby="panel-tab-summary" :hidden="activeTab !== 'summary'">
      <SummaryTab
        v-if="activeTab === 'summary'"
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
    </div>
    <div id="panel-panel-export" role="tabpanel" aria-labelledby="panel-tab-export" :hidden="activeTab !== 'export'">
      <ExportTab
        v-if="activeTab === 'export' && (exportSupported || attached)"
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
        :locked="mutationLocked"
        :attached-lifecycle="attachedLifecycle"
        :attached-ready="attachedReady"
        :attached-failure="attachedFailure"
        :unsaved-inline-composer-file="unsavedInlineComposerFile"
        :is-exact-patch="isExactPatch"
        :pending="pending"
        :conflict="conflict"
        @cancel="emit('cancelExport')"
        @export="emit('export')"
        @reload-latest="emit('reloadLatest')"
        @review-unsaved-text="emit('reviewUnsavedText')"
        @review-inline-composer="(fileId) => emit('reviewInlineComposer', fileId)"
        @finish-review="emit('finishReview')"
        @reload-attached="emit('reloadAttached')"
      />
    </div>
  </section>
</template>

<style scoped>
.bottom-panel {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  overflow-y: auto;
}

.bottom-panel__header {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
}

.bottom-panel__tabs {
  display: flex;
  gap: var(--space-1);
}

.bottom-panel__tab {
  font-size: var(--font-size-label);
  letter-spacing: var(--letter-spacing-label);
  text-transform: uppercase;
  padding-block: var(--space-1);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.bottom-panel__tab--selected {
  border-bottom-color: var(--interactive-accent);
}
</style>
