<script setup lang="ts">
import type { SessionFile } from '../../contracts/api.js';
import FileTree from './FileTree.vue';
import ModalDialog from './ui/ModalDialog.vue';

const props = defineProps<{
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
}>();

const emit = defineEmits<{
  activate: [fileId: string];
  close: [];
  select: [fileId: string];
}>();
</script>

<template>
  <ModalDialog
    :open="open"
    :keep-mounted="true"
    :restore-focus="restoreFocus"
    initial-focus-selector="#file-tree-filter"
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
      @select="emit('select', $event)"
      @activate="emit('activate', $event)"
    />
    <section v-else class="empty-files-pane">
      <h2>{{ emptyHeading }}</h2>
      <p>{{ emptyMessage }}</p>
    </section>
  </Teleport>
</template>

<style scoped>
.changed-files-dialog__results {
  max-height: 50dvh;
  overflow: auto;
}
</style>
