<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SessionFile } from '../../../contracts/api.js';
import { RENAME_MAP } from '../../../domain/product-identity.js';
import { singlePaneSideFor, wasModeKind } from '../../model/single-pane-layout.js';
import PathDisplay from '../PathDisplay.vue';
import StatusBadge from '../StatusBadge.vue';
import UiIcon from '../ui/UiIcon.vue';
import UiTooltip from '../ui/UiPrimitives.vue';

const props = defineProps<{
  readonly filesDrawer: boolean;
  readonly mode: 'source' | 'rendered';
  readonly selectedFile?: SessionFile;
  readonly selectedPath: string;
  atFirstFile: boolean;
  atLastFile: boolean;
  hasActiveFile: boolean;
  singlePane: boolean;
  renderSideBySide: boolean;
}>();

const emit = defineEmits<{
  toggleFiles: [];
  'toggle-mode': [mode: 'source' | 'rendered'];
  previousFile: [];
  nextFile: [];
  previousChange: [];
  nextChange: [];
  'toggle-layout': [renderSideBySide: boolean];
}>();

const filesToggle = ref<HTMLButtonElement>();
const effectivePath = computed(() => {
  const file = props.selectedFile;
  if (file === undefined) return props.selectedPath;
  return file.status.kind === 'deleted'
    ? file.oldPath?.display ?? props.selectedPath
    : file.newPath?.display ?? file.oldPath?.display ?? props.selectedPath;
});
const singlePaneSide = computed(() =>
  props.selectedFile === undefined
    ? undefined
    : singlePaneSideFor(
        props.selectedFile.status.kind,
        props.selectedFile.availability,
      ),
);
const layoutLabel = computed(() => {
  if (singlePaneSide.value === undefined || props.selectedFile === undefined) {
    return undefined;
  }
  switch (props.selectedFile.status.kind) {
    case 'added':
      return 'Added · Head only';
    case 'deleted':
      return 'Deleted · Base only';
    case 'type-changed':
      return `Type changed · Head only (was ${wasModeKind(props.selectedFile.oldMode)})`;
    default:
      return undefined;
  }
});
const standaloneStateLabel = computed(() => {
  switch (props.selectedFile?.standaloneGitState) {
    case 'modified-uncommitted': return 'Standalone · Modified (uncommitted)';
    case 'untracked': return 'Standalone · Untracked';
    case 'unchanged': return 'Standalone · Unchanged';
    default: return undefined;
  }
});
const counts = computed(() => props.selectedFile !== undefined
  && props.selectedFile.additions !== null
  && props.selectedFile.deletions !== null
  ? `+${props.selectedFile.additions} −${props.selectedFile.deletions}`
  : undefined);
const isMarkdownFile = computed(() => {
  const path = effectivePath.value.toLowerCase();
  return path.endsWith('.md') || path.endsWith('.markdown');
});

function focusFilesToggle(): void {
  filesToggle.value?.focus();
}

function focusHeading(): void {
  document.getElementById(`${RENAME_MAP.cssPrefix}heading`)?.focus();
}

defineExpose({ focusFilesToggle, focusHeading });
</script>

<template>
  <div class="editor-title" role="toolbar" aria-label="Diff navigation">
    <div class="review-toolbar__active-file">
      <h1 :id="`${RENAME_MAP.cssPrefix}heading`" tabindex="-1" :title="effectivePath">
        <PathDisplay v-if="selectedFile !== undefined" :file="selectedFile" basename />
        <template v-else>{{ selectedPath }}</template>
      </h1>
      <template v-if="selectedFile !== undefined">
        <template v-if="standaloneStateLabel !== undefined">
          <StatusBadge :kind="selectedFile.status.kind" :code="selectedFile.status.code ?? ''" reviewable />
          <span class="review-toolbar__status">{{ standaloneStateLabel }}</span>
        </template>
        <template v-else-if="layoutLabel !== undefined">
          <StatusBadge :kind="selectedFile.status.kind" :code="selectedFile.status.code ?? ''" reviewable />
          <span class="review-toolbar__status">{{ layoutLabel }}</span>
        </template>
        <span v-else class="review-toolbar__status">{{ selectedFile.status.kind }}</span>
      </template>
      <span v-if="counts !== undefined" class="review-toolbar__counts">{{ counts }}</span>
    </div>
    <template v-if="!singlePane">
      <UiTooltip text="Previous change · Shift+F7">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Previous change"
          :disabled="!hasActiveFile"
          @click="emit('previousChange')"
        >
          <UiIcon name="previous-change" />
        </button>
      </UiTooltip>
      <UiTooltip text="Next change · F7">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Next change"
          :disabled="!hasActiveFile"
          @click="emit('nextChange')"
        >
          <UiIcon name="next-change" />
        </button>
      </UiTooltip>
      <span class="editor-title__separator" aria-hidden="true" />
    </template>
    <UiTooltip :text="atFirstFile ? 'Previous file · Alt+↑ · First changed file.' : 'Previous file · Alt+↑'">
      <button
        type="button"
        class="ui-button ui-button--icon"
        aria-label="Previous file"
        :disabled="atFirstFile || !hasActiveFile"
        @click="emit('previousFile')"
      >
        <UiIcon name="previous-file" />
      </button>
    </UiTooltip>
    <UiTooltip :text="atLastFile ? 'Next file · Alt+↓ · Last changed file.' : 'Next file · Alt+↓'">
      <button
        type="button"
        class="ui-button ui-button--icon"
        aria-label="Next file"
        :disabled="atLastFile || !hasActiveFile"
        @click="emit('nextFile')"
      >
        <UiIcon name="next-file" />
      </button>
    </UiTooltip>
    <span class="editor-title__separator" aria-hidden="true" />
    <div class="editor-title__group" role="group" aria-label="Diff layout">
      <UiTooltip text="Side-by-side diff">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Side-by-side diff"
          :aria-pressed="renderSideBySide"
          :disabled="singlePaneSide !== undefined"
          @click="emit('toggle-layout', true)"
        >
          <UiIcon name="diff-split" />
        </button>
      </UiTooltip>
      <UiTooltip text="Inline diff">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Inline diff"
          :aria-pressed="!renderSideBySide"
          :disabled="singlePaneSide !== undefined"
          @click="emit('toggle-layout', false)"
        >
          <UiIcon name="diff-inline" />
        </button>
      </UiTooltip>
    </div>
    <template v-if="isMarkdownFile">
      <span class="editor-title__separator" aria-hidden="true" />
      <div class="editor-title__group" role="group" aria-label="Markdown view">
        <UiTooltip text="Markdown source">
          <button
            type="button"
            class="ui-button ui-button--icon"
            aria-label="Markdown source"
            :aria-pressed="mode === 'source'"
            @click="emit('toggle-mode', 'source')"
          >
            <UiIcon name="markdown-source" />
          </button>
        </UiTooltip>
        <UiTooltip text="Markdown rendered preview">
          <button
            type="button"
            class="ui-button ui-button--icon"
            aria-label="Markdown rendered preview"
            :aria-pressed="mode === 'rendered'"
            @click="emit('toggle-mode', 'rendered')"
          >
            <UiIcon name="markdown-preview" />
          </button>
        </UiTooltip>
      </div>
    </template>
    <button
      v-if="filesDrawer"
      ref="filesToggle"
      type="button"
      class="ui-button"
      aria-label="Open files"
      @click="emit('toggleFiles')"
    >Files</button>
  </div>
</template>

<style scoped>
.editor-title {
  display: flex;
  min-width: 0;
  height: var(--editor-title-height);
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-2);
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-panel);
}

@media (max-width: 760px) {
  .editor-title {
    height: auto;
    flex-wrap: wrap;
  }
}

.editor-title__group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
}

.editor-title__separator {
  flex: 0 0 auto;
  width: 1px;
  height: 16px;
  background: var(--border-default);
}

.editor-title .ui-button--icon[aria-pressed="true"] {
  background: var(--surface-interactive-active);
  color: var(--text-primary);
}
</style>
