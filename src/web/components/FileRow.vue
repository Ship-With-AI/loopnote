<script setup lang="ts">
import { computed } from 'vue';

import type { FileTreeLeaf } from '../../domain/file-tree.js';
import PathDisplay from './PathDisplay.vue';
import StatusBadge from './StatusBadge.vue';
import UiIcon from './ui/UiIcon.vue';

const props = withDefaults(
  defineProps<{
    leaf: FileTreeLeaf;
    level: number;
    tabbable: boolean;
    selected: boolean;
    recentlyChanged?: boolean;
    mode?: 'tree' | 'list';
    openCommentCount?: number;
    commentBadgesEnabled?: boolean;
    lineCounts?: 'always' | 'hover' | 'never';
    query?: string;
  }>(),
  {
    mode: 'tree',
    openCommentCount: 0,
    commentBadgesEnabled: true,
    lineCounts: 'hover',
  },
);

const emit = defineEmits<{
  activate: [fileId: string];
  focusRow: [rowId: string];
}>();

const rowId = computed(() => `file:${props.leaf.fileId}`);
const countLabel = computed(() => {
  const { additions, deletions } = props.leaf.file;
  if (additions === null || deletions === null) {
    return 'Line counts unavailable';
  }
  return `${additions} ${additions === 1 ? 'addition' : 'additions'}, ${deletions} ${deletions === 1 ? 'deletion' : 'deletions'}`;
});
const availabilityLabel = computed(() => {
  switch (props.leaf.file.availability.kind) {
    case 'text':
      return 'Text';
    case 'unsupported':
      return props.leaf.file.availability.reason === 'changed-during-capture'
        ? 'Changed during capture'
        : 'Unsupported';
    case 'unavailable':
      return 'Unavailable';
  }
});
const standaloneStateLabel = computed(() => {
  switch (props.leaf.file.standaloneGitState) {
    case 'modified-uncommitted': return 'Standalone · Modified (uncommitted)';
    case 'untracked': return 'Standalone · Untracked';
    case 'unchanged': return 'Standalone · Unchanged';
    default: return undefined;
  }
});

// 21-UI-SPEC.md `## Row Anatomy` → `### 1. File-type mark`: fixed extension
// lookup table, `tone` is the literal CSS custom-property name to colour the
// mark with (reused existing tokens only).
const FILE_TYPE_MARKS: Readonly<Record<string, Readonly<{ text: string; tone: string }>>> = Object.freeze({
  ts: { text: 'TS', tone: '--syntax-type-foreground' },
  tsx: { text: 'TS', tone: '--syntax-type-foreground' },
  js: { text: 'JS', tone: '--syntax-type-foreground' },
  jsx: { text: 'JS', tone: '--syntax-type-foreground' },
  mjs: { text: 'JS', tone: '--syntax-type-foreground' },
  cjs: { text: 'JS', tone: '--syntax-type-foreground' },
  vue: { text: 'V', tone: '--status-added-foreground' },
  css: { text: '#', tone: '--status-resolved-foreground' },
  scss: { text: '#', tone: '--status-resolved-foreground' },
  less: { text: '#', tone: '--status-resolved-foreground' },
  md: { text: 'M↓', tone: '--text-muted' },
  markdown: { text: 'M↓', tone: '--text-muted' },
  json: { text: '{}', tone: '--text-muted' },
  jsonc: { text: '{}', tone: '--text-muted' },
  json5: { text: '{}', tone: '--text-muted' },
  png: { text: 'IMG', tone: '--status-warning-foreground' },
  jpg: { text: 'IMG', tone: '--status-warning-foreground' },
  jpeg: { text: 'IMG', tone: '--status-warning-foreground' },
  gif: { text: 'IMG', tone: '--status-warning-foreground' },
  svg: { text: 'IMG', tone: '--status-warning-foreground' },
  webp: { text: 'IMG', tone: '--status-warning-foreground' },
  ico: { text: 'IMG', tone: '--status-warning-foreground' },
  bmp: { text: 'IMG', tone: '--status-warning-foreground' },
});
const FALLBACK_FILE_TYPE_MARK = Object.freeze({ text: '·', tone: '--text-muted' });

const fileTypeMark = computed(() => {
  const path = props.leaf.file.newPath?.display ?? props.leaf.file.oldPath?.display;
  const extension = path?.match(/\.([^./]+)$/)?.[1]?.toLowerCase();
  return extension !== undefined && extension in FILE_TYPE_MARKS
    ? FILE_TYPE_MARKS[extension]
    : FALLBACK_FILE_TYPE_MARK;
});

// `### 2. Name` colour-priority table, highest wins.
const nameTone = computed((): 'muted' | 'deleted' | 'modified' | 'added' | 'primary' => {
  if (props.leaf.file.availability.kind !== 'text') return 'muted';
  switch (props.leaf.file.status.kind) {
    case 'deleted': return 'deleted';
    case 'modified': return 'modified';
    case 'added': return 'added';
    case 'unsupported': return 'muted';
    default: return 'primary';
  }
});

const showCommentBadge = computed(
  () => props.commentBadgesEnabled && props.openCommentCount > 0,
);
const commentBadgeLabel = computed(
  () => `${props.openCommentCount} open comment${props.openCommentCount === 1 ? '' : 's'}`,
);
</script>

<template>
  <li role="none">
    <div
      :id="rowId"
      class="tree-row file-row"
      :class="{
        'tree-row--selected': selected,
        'tree-row--counts-always': lineCounts === 'always',
        'tree-row--counts-never': lineCounts === 'never',
      }"
      :role="mode === 'list' ? 'option' : 'treeitem'"
      :aria-level="mode === 'tree' ? level : undefined"
      :aria-selected="selected"
      :tabindex="tabbable ? 0 : -1"
      :data-row-id="rowId"
      :data-file-id="leaf.fileId"
      :style="{ '--tree-indent': `${8 + (level - 1) * 16}px` }"
      @focus="emit('focusRow', rowId)"
      @click="emit('activate', leaf.fileId)"
    >
      <span class="ft" aria-hidden="true" :style="{ color: `var(${fileTypeMark.tone})` }">{{ fileTypeMark.text }}</span>
      <PathDisplay :file="leaf.file" :basename="mode !== 'list'" :query="query" :class="`name-tone--${nameTone}`" />
      <span v-if="showCommentBadge" class="cbadge" :aria-label="commentBadgeLabel">
        <UiIcon name="comment" />
        <span aria-hidden="true">{{ openCommentCount }}</span>
      </span>
      <span v-if="recentlyChanged" class="tree-row__refresh-marker" aria-label="Changed since last snapshot">Changed</span>
      <span v-if="standaloneStateLabel !== undefined" class="standalone-state-marker">{{ standaloneStateLabel }}</span>
      <span
        class="availability-marker"
        :class="[
          `availability-marker--${leaf.file.availability.kind}`,
          { 'visually-hidden': leaf.file.availability.kind === 'text' },
        ]"
      >
        {{ availabilityLabel }}
      </span>
      <span class="line-counts" :aria-label="countLabel">
        <template v-if="leaf.file.additions !== null && leaf.file.deletions !== null">
          <span class="line-counts__added" aria-hidden="true">+{{ leaf.file.additions }}</span>
          <span class="line-counts__deleted" aria-hidden="true">−{{ leaf.file.deletions }}</span>
        </template>
        <span v-else aria-hidden="true">—</span>
      </span>
      <StatusBadge :kind="leaf.file.status.kind" :code="leaf.file.status.code ?? ''" :reviewable="leaf.file.availability.kind === 'text'" />
    </div>
  </li>
</template>
