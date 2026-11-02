<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SessionFile } from '../../contracts/api.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import { singlePaneSideFor, wasModeKind } from '../model/single-pane-layout.js';
import PathDisplay from './PathDisplay.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  readonly filesCollapsed: boolean;
  readonly filesDrawer: boolean;
  readonly mode: 'source' | 'rendered';
  readonly selectedFile?: SessionFile;
  readonly selectedPath: string;
}>();

const emit = defineEmits<{
  toggleFiles: [];
  'toggle-mode': [mode: 'source' | 'rendered'];
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
const filesHostVisible = computed(() => !props.filesDrawer && !props.filesCollapsed);
const filesToggleCopy = computed(() => props.filesDrawer ? 'Files' : props.filesCollapsed ? 'Show files' : 'Hide files');
const filesToggleLabel = computed(() => props.filesDrawer
  ? 'Open files'
  : props.filesCollapsed ? 'Show files sidebar' : 'Hide files sidebar');

function focusFilesToggle(): void {
  filesToggle.value?.focus();
}

function focusHeading(): void {
  document.getElementById(`${RENAME_MAP.cssPrefix}heading`)?.focus();
}

defineExpose({ focusFilesToggle, focusHeading });
</script>

<template>
  <div class="review-toolbar__active-file">
    <h1 :id="`${RENAME_MAP.cssPrefix}heading`" tabindex="-1" :title="effectivePath">
      <PathDisplay v-if="selectedFile !== undefined" :file="selectedFile" basename />
      <template v-else>{{ selectedPath }}</template>
    </h1>
    <template v-if="selectedFile !== undefined">
      <template v-if="standaloneStateLabel !== undefined">
        <StatusBadge :kind="selectedFile.status.kind" reviewable />
        <span class="review-toolbar__status">{{ standaloneStateLabel }}</span>
      </template>
      <template v-else-if="layoutLabel !== undefined">
        <StatusBadge :kind="selectedFile.status.kind" reviewable />
        <span class="review-toolbar__status">{{ layoutLabel }}</span>
      </template>
      <span v-else class="review-toolbar__status">{{ selectedFile.status.kind }}</span>
    </template>
    <span v-if="counts !== undefined" class="review-toolbar__counts">{{ counts }}</span>
    <template v-if="isMarkdownFile">
      <button
        type="button"
        class="ui-button"
        :aria-pressed="mode === 'source'"
        @click="emit('toggle-mode', 'source')"
      >Source</button>
      <button
        type="button"
        class="ui-button"
        :aria-pressed="mode === 'rendered'"
        @click="emit('toggle-mode', 'rendered')"
      >Rendered</button>
    </template>
    <button
      ref="filesToggle"
      type="button"
      class="ui-button"
      :aria-label="filesToggleLabel"
      :aria-controls="filesHostVisible ? 'changed-files' : undefined"
      :aria-expanded="filesHostVisible ? true : undefined"
      @click="emit('toggleFiles')"
    >{{ filesToggleCopy }}</button>
  </div>
</template>
