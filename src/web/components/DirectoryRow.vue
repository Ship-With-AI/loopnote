<script setup lang="ts">
import { computed } from 'vue';

import type { ChangedFileStatusKind } from '../../contracts/comparison.js';
import type { FileTreeDirectory, FileTreeLeaf } from '../../domain/file-tree.js';
import FileRow from './FileRow.vue';

defineOptions({ name: 'DirectoryRow' });

const props = withDefaults(
  defineProps<{
    directory: FileTreeDirectory;
    level: number;
    expandedDirectoryIds: ReadonlySet<string>;
    statusPriorityByDirectoryId: ReadonlyMap<string, ChangedFileStatusKind>;
    tabbableRowId: string | null;
    selectedFileId: string | null;
    recentlyChangedPaths?: ReadonlySet<string>;
    openCommentCounts?: ReadonlyMap<string, number>;
    lineCounts?: 'always' | 'hover' | 'never';
    commentBadgesEnabled?: boolean;
  }>(),
  {
    lineCounts: 'hover',
    commentBadgesEnabled: true,
  },
);

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

// `21-UI-SPEC.md` `## Compact Folders & Collapsed Bullet` — same tone
// vocabulary `StatusBadge.vue` uses (renamed/copied share the "moved" tone;
// type-changed shares the "modified" tone; unsupported maps to "warning").
const BULLET_TONE_BY_STATUS_KIND: Readonly<Record<ChangedFileStatusKind, string>> = Object.freeze({
  modified: 'modified',
  deleted: 'deleted',
  added: 'added',
  renamed: 'moved',
  copied: 'moved',
  'type-changed': 'modified',
  unsupported: 'warning',
});

const collapsedBulletTone = computed(() => {
  const status = props.statusPriorityByDirectoryId.get(props.directory.directoryId);
  return status === undefined ? undefined : BULLET_TONE_BY_STATUS_KIND[status];
});
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
      <span
        v-if="!expanded && collapsedBulletTone !== undefined"
        class="directory-row__bullet"
        :class="`directory-row__bullet--${collapsedBulletTone}`"
        aria-hidden="true"
      >●</span>
    </div>

    <ul v-if="expanded" class="tree-group" role="group">
      <template v-for="child in directory.children" :key="child.kind === 'file' ? child.fileId : child.directoryId">
        <DirectoryRow
          v-if="child.kind === 'directory'"
          :directory="child"
          :level="level + 1"
          :expanded-directory-ids="expandedDirectoryIds"
          :status-priority-by-directory-id="statusPriorityByDirectoryId"
          :tabbable-row-id="tabbableRowId"
          :selected-file-id="selectedFileId"
          :recently-changed-paths="recentlyChangedPaths"
          :open-comment-counts="openCommentCounts"
          :line-counts="lineCounts"
          :comment-badges-enabled="commentBadgesEnabled"
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
          :open-comment-count="openCommentCounts?.get(child.fileId) ?? 0"
          :line-counts="lineCounts"
          :comment-badges-enabled="commentBadgesEnabled"
          @activate="emit('activateFile', $event)"
          @focus-row="emit('focusRow', $event)"
        />
      </template>
    </ul>
  </li>
</template>
