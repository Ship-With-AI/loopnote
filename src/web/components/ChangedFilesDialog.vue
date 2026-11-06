<script setup lang="ts">
import type { SessionFile } from '../../contracts/api.js';
import FileTree from './FileTree.vue';
import ModalDialog from './ui/ModalDialog.vue';

const props = withDefaults(
  defineProps<{
    readonly emptyHeading: string;
    readonly emptyMessage: string;
    readonly files: readonly SessionFile[];
    readonly initialSelectedFileId?: string;
    readonly narrow: boolean;
    readonly open: boolean;
    readonly recentlyChangedPaths?: ReadonlySet<string>;
    readonly restoreFocus?: boolean;
    readonly openCommentCounts?: ReadonlyMap<string, number>;
    readonly lineCounts?: 'always' | 'hover' | 'never';
    readonly commentBadgesEnabled?: boolean;
    readonly viewMode?: 'tree' | 'list';
  }>(),
  {
    lineCounts: 'hover',
    commentBadgesEnabled: true,
    viewMode: 'tree',
  },
);

const emit = defineEmits<{
  activate: [fileId: string];
  close: [];
  select: [fileId: string];
  'update:view-mode': [mode: 'tree' | 'list'];
  'update:line-counts': [mode: 'always' | 'hover' | 'never'];
  'update:comment-badges': [enabled: boolean];
  'filter-result': [matched: number, total: number, query: string];
}>();
</script>

<template>
  <ModalDialog
    :open="open"
    :keep-mounted="true"
    :restore-focus="restoreFocus"
    initial-focus-selector='[role="treeitem"][tabindex="0"], [role="option"][tabindex="0"]'
    title="Files"
    close-label="Close"
    close-aria-label="Close files"
    @close="emit('close')"
  >
    <div id="changed-files-dialog-tree" class="changed-files-dialog__results"></div>
  </ModalDialog>
  <Teleport v-if="narrow || files.length > 0" defer :to="narrow ? '#changed-files-dialog-tree' : '#changed-files'">
    <FileTree
      v-if="files.length > 0"
      :files="files"
      :initial-selected-file-id="initialSelectedFileId"
      :recently-changed-paths="recentlyChangedPaths"
      :open-comment-counts="openCommentCounts"
      :line-counts="lineCounts"
      :comment-badges-enabled="commentBadgesEnabled"
      :view-mode="viewMode"
      @select="emit('select', $event)"
      @activate="emit('activate', $event)"
      @update:view-mode="emit('update:view-mode', $event)"
      @update:line-counts="emit('update:line-counts', $event)"
      @update:comment-badges="emit('update:comment-badges', $event)"
      @filter-result="(matched, total, query) => emit('filter-result', matched, total, query)"
    />
    <section v-else class="empty-files-pane">
      <h2>{{ emptyHeading }}</h2>
      <p>{{ emptyMessage }}</p>
    </section>
  </Teleport>
</template>

<style scoped>
.changed-files-dialog__results {
  min-height: 160px;
  max-height: 50dvh;
  overflow: auto;
}
</style>
