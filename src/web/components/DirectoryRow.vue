<script setup lang="ts">
import { computed } from 'vue';

import type { FileTreeDirectory, FileTreeLeaf } from '../../domain/file-tree.js';
import FileRow from './FileRow.vue';

defineOptions({ name: 'DirectoryRow' });

const props = defineProps<{
  directory: FileTreeDirectory;
  level: number;
  expandedDirectoryIds: ReadonlySet<string>;
  directoryDescendantCounts: ReadonlyMap<string, number>;
  tabbableRowId: string | null;
  selectedFileId: string | null;
  recentlyChangedPaths?: ReadonlySet<string>;
}>();

function isRecentlyChanged(leaf: FileTreeLeaf): boolean {
  const path = leaf.file.newPath?.display ?? leaf.file.oldPath?.display;
  return path !== undefined && (props.recentlyChangedPaths?.has(path) ?? false);
}

const emit = defineEmits<{
  activateFile: [fileId: string];
  focusRow: [rowId: string];
  toggleDirectory: [directoryId: string];
}>();

const rowId = computed(() => `directory:${props.directory.directoryId}`);
const expanded = computed(() =>
  props.expandedDirectoryIds.has(props.directory.directoryId),
);
const displayPath = computed(() =>
  props.directory.segments.map((segment) => segment.display).join('/'),
);
const descendantCount = computed(
  () => props.directoryDescendantCounts.get(props.directory.directoryId) ?? 0,
);
const descendantCountLabel = computed(
  () => `${descendantCount.value} ${descendantCount.value === 1 ? 'changed file' : 'changed files'}`,
);

</script>

<template>
  <li role="none">
    <div
      :id="rowId"
      class="tree-row directory-row"
      role="treeitem"
      :aria-level="level"
      :aria-expanded="expanded"
      aria-selected="false"
      :tabindex="tabbableRowId === rowId ? 0 : -1"
      :data-row-id="rowId"
      :style="{ '--tree-indent': `${8 + (level - 1) * 16}px` }"
      @focus="emit('focusRow', rowId)"
      @click="emit('toggleDirectory', directory.directoryId)"
    >
      <span class="directory-row__disclosure" aria-hidden="true">
        {{ expanded ? '▾' : '▸' }}
      </span>
      <span class="directory-row__path">{{ displayPath }}/</span>
      <span class="directory-row__count" :aria-label="descendantCountLabel">{{ descendantCount }}</span>
    </div>

    <ul v-if="expanded" class="tree-group" role="group">
      <template v-for="child in directory.children" :key="child.kind === 'file' ? child.fileId : child.directoryId">
        <DirectoryRow
          v-if="child.kind === 'directory'"
          :directory="child"
          :level="level + 1"
          :expanded-directory-ids="expandedDirectoryIds"
          :directory-descendant-counts="directoryDescendantCounts"
          :tabbable-row-id="tabbableRowId"
          :selected-file-id="selectedFileId"
          :recently-changed-paths="recentlyChangedPaths"
          @activate-file="emit('activateFile', $event)"
          @focus-row="emit('focusRow', $event)"
          @toggle-directory="emit('toggleDirectory', $event)"
        />
        <FileRow
          v-else
          :key="child.fileId"
          :leaf="child"
          :level="level + 1"
          :tabbable="tabbableRowId === `file:${child.fileId}`"
          :selected="selectedFileId === child.fileId"
          :recently-changed="isRecentlyChanged(child)"
          @activate="emit('activateFile', $event)"
          @focus-row="emit('focusRow', $event)"
        />
      </template>
    </ul>
  </li>
</template>
