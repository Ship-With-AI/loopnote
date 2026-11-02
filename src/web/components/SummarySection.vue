<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { renderMarkdownPreview } from '../model/markdown-preview.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import UiIcon from './ui/UiIcon.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';

const props = defineProps<{
  canonical: string;
  modelValue: string;
  pending: boolean;
  saving: boolean;
  conflict: boolean;
  failure: boolean;
  retained: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  cancel: [];
  save: [];
}>();

const open = ref(true);
const mode = ref<'edit' | 'preview'>('preview');
const confirmingDiscard = ref(false);
const disclosure = ref<HTMLButtonElement>();
const editTab = ref<HTMLButtonElement>();
const previewTab = ref<HTMLButtonElement>();
const textarea = ref<HTMLTextAreaElement>();
const keepEditing = ref<HTMLButtonElement>();
const failureAlert = ref<HTMLElement>();

const unsaved = computed(() => props.modelValue !== props.canonical);
const status = computed(() => {
  if (props.conflict) return 'Conflict — unsaved text retained';
  if (props.failure) return 'Save failed';
  if (props.saving) return 'Saving';
  if (props.retained && unsaved.value) return 'Retained after reload — not saved';
  return unsaved.value ? 'Unsaved' : 'Saved';
});
const preview = computed(() => renderMarkdownPreview(props.modelValue));
const summarySupportId = 'review-summary-support';
const summaryFeedbackId = 'review-summary-feedback';
const summaryDescribedBy = computed(() => [
  summarySupportId,
  props.failure || (props.retained && unsaved.value && !props.conflict) ? summaryFeedbackId : undefined,
].filter((value): value is string => value !== undefined).join(' '));
const statusBadgeKind = computed(() => {
  if (props.conflict || props.failure) return 'error' as const;
  if (props.saving) return 'pending' as const;
  return unsaved.value ? 'information' as const : 'success' as const;
});

function selectMode(nextMode: 'edit' | 'preview', focusPanel = false): void {
  mode.value = nextMode;
  if (nextMode === 'edit' && focusPanel) {
    void nextTick(() => textarea.value?.focus());
  }
}

function writeSummary(): void {
  selectMode('edit', true);
}

function moveTab(event: KeyboardEvent, nextMode: 'edit' | 'preview'): void {
  event.preventDefault();
  selectMode(nextMode);
  void nextTick(() => (nextMode === 'edit' ? editTab.value : previewTab.value)?.focus());
}

function requestCancel(): void {
  if (!unsaved.value) {
    selectMode('preview');
    void nextTick(() => disclosure.value?.focus());
    return;
  }

  confirmingDiscard.value = true;
  void nextTick(() => keepEditing.value?.focus());
}

function keepSummaryEdits(): void {
  confirmingDiscard.value = false;
  selectMode('edit', true);
}

function discardSummaryEdits(): void {
  confirmingDiscard.value = false;
  emit('cancel');
  selectMode('preview');
  void nextTick(() => disclosure.value?.focus());
}

function onTextareaKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && unsaved.value && !props.pending && !props.conflict) {
    event.preventDefault();
    event.stopPropagation();
    emit('save');
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    requestCancel();
  }
}

function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  selectMode('edit', true);
}

function onConfirmationEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  keepSummaryEdits();
}

watch(() => props.failure, (failed) => {
  if (failed) void nextTick(() => failureAlert.value?.focus());
});
</script>

<template>
  <section class="review-summary" role="region" :aria-label="`Summary ${status}`">
    <header class="review-summary__header">
      <h3>
        <button
          id="review-summary-heading"
          ref="disclosure"
          type="button"
          :aria-expanded="open"
          aria-controls="review-summary-content"
          class="review-summary__toggle ui-button"
          @click="open = !open"
        >
          Summary
        </button>
      </h3>
      <div class="review-summary__badges">
        <ReviewStateBadge :kind="statusBadgeKind" :label="status" />
      </div>
    </header>

    <div v-if="open" id="review-summary-content" class="review-summary__content">
      <div role="tablist" aria-label="Summary mode">
        <button
          id="summary-tab-edit"
          ref="editTab"
          type="button"
          role="tab"
          class="ui-button"
          :class="{ 'ui-button--selected': mode === 'edit' }"
          :aria-selected="mode === 'edit'"
          aria-controls="summary-panel-edit"
          :tabindex="mode === 'edit' ? 0 : -1"
          @click="selectMode('edit')"
          @keydown.left="moveTab($event, 'preview')"
          @keydown.right="moveTab($event, 'preview')"
        >Edit</button>
        <button
          id="summary-tab-preview"
          ref="previewTab"
          type="button"
          role="tab"
          class="ui-button"
          :class="{ 'ui-button--selected': mode === 'preview' }"
          :aria-selected="mode === 'preview'"
          aria-controls="summary-panel-preview"
          :tabindex="mode === 'preview' ? 0 : -1"
          @click="selectMode('preview')"
          @keydown.left="moveTab($event, 'edit')"
          @keydown.right="moveTab($event, 'edit')"
        >Preview</button>
      </div>

      <div
        v-if="mode === 'edit'"
        id="summary-panel-edit"
        role="tabpanel"
        aria-labelledby="summary-tab-edit"
      >
        <label>
          Review summary (Markdown)
          <textarea
            ref="textarea"
            :value="modelValue"
            :aria-describedby="summaryDescribedBy"
            :aria-invalid="failure ? 'true' : undefined"
            placeholder="Summarize the review outcome and the most important changes requested…"
            :disabled="pending || conflict"
            @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
            @keydown="onTextareaKeydown"
          />
        </label>
        <p :id="summarySupportId">Markdown is supported. Your summary changes only after you save.</p>
        <div class="review-summary__actions">
          <button
            type="button"
            class="ui-button ui-button--primary"
            :class="{ 'review-summary__save--busy': saving, 'ui-button--busy': saving }"
            :aria-busy="saving ? 'true' : undefined"
            :disabled="!unsaved || pending || conflict"
            @click="emit('save')"
          >
            <span v-if="saving" class="ui-spinner" aria-hidden="true" />
            {{ saving ? 'Saving summary…' : 'Save summary' }}
          </button>
          <button type="button" class="ui-button" :disabled="pending" @click="requestCancel">Cancel changes</button>
        </div>
      </div>

      <div
        v-else
        id="summary-panel-preview"
        role="tabpanel"
        aria-labelledby="summary-tab-preview"
        tabindex="0"
        @keydown="onPreviewKeydown"
      >
        <div class="review-summary__preview" v-html="preview" />
        <button v-if="modelValue === ''" type="button" class="ui-button" @click="writeSummary">Write summary</button>
        <button v-else-if="retained && unsaved" type="button" class="ui-button" @click="writeSummary">Continue editing retained text</button>
      </div>

      <p v-if="saving" role="status">Saving summary…</p>
      <section
        v-if="failure"
        ref="failureAlert"
        :id="summaryFeedbackId"
        class="inline-notice inline-notice--error review-summary__feedback"
        role="alert"
        tabindex="-1"
        aria-labelledby="summary-save-failed-heading"
      >
        <UiIcon name="error" class="inline-notice__icon" />
        <div class="inline-notice__content">
          <h4 id="summary-save-failed-heading">Summary wasn’t saved</h4>
          <p>Your text is still here in this tab. Try again after checking {{ RENAME_MAP.displayName }} is running.</p>
        </div>
      </section>
      <section
        v-else-if="retained && unsaved && !conflict"
        :id="summaryFeedbackId"
        class="inline-notice inline-notice--information review-summary__feedback"
        role="status"
        aria-labelledby="summary-retained-heading"
      >
        <UiIcon name="information" class="inline-notice__icon" />
        <div class="inline-notice__content">
          <h4 id="summary-retained-heading">Summary retained after reload</h4>
          <p>Latest draft loaded. Your unsaved text is still here.</p>
        </div>
      </section>

      <section
        v-if="confirmingDiscard"
        class="review-summary__confirm review-panel__confirm"
        role="region"
        aria-labelledby="summary-discard-heading"
        @keydown="onConfirmationEscape"
      >
        <h4 id="summary-discard-heading">Discard unsaved summary changes?</h4>
        <p>Your saved summary will stay unchanged.</p>
        <div class="review-summary__actions">
          <button ref="keepEditing" type="button" class="ui-button" @click="keepSummaryEdits">Keep editing</button>
          <button type="button" class="ui-button ui-button--destructive" @click="discardSummaryEdits">Discard changes</button>
        </div>
      </section>
    </div>
  </section>
</template>
