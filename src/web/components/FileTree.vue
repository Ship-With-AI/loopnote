<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';

import type { SessionFile } from '../../contracts/api.js';
import type { FileTreeLeaf } from '../../domain/file-tree.js';
import {
  createFileTreeModel,
  type FileTreeNavigationKey,
  type FileTreeModel,
} from '../model/file-tree.js';
import DirectoryRow from './DirectoryRow.vue';
import FileRow from './FileRow.vue';
import UiIcon from './ui/UiIcon.vue';
import ViewOptionsMenu from './ViewOptionsMenu.vue';

const FILE_ROW_PREFIX = 'file:';

const props = withDefaults(
  defineProps<{
    files: readonly SessionFile[];
    initialSelectedFileId?: string;
    recentlyChangedPaths?: ReadonlySet<string>;
    openCommentCounts?: ReadonlyMap<string, number>;
    lineCounts?: 'always' | 'hover' | 'never';
    commentBadgesEnabled?: boolean;
    viewMode?: 'tree' | 'list';
  }>(),
  {
    lineCounts: 'hover',
    commentBadgesEnabled: true,
    viewMode: 'tree',
  },
);

function isRecentlyChanged(leaf: FileTreeLeaf): boolean {
  const path = leaf.file.newPath?.display ?? leaf.file.oldPath?.display;
  return path !== undefined && (props.recentlyChangedPaths?.has(path) ?? false);
}

const emit = defineEmits<{
  activate: [fileId: string];
  select: [fileId: string];
  'update:view-mode': [mode: 'tree' | 'list'];
  'update:line-counts': [mode: 'always' | 'hover' | 'never'];
  'update:comment-badges': [enabled: boolean];
  filterResult: [matched: number, total: number, query: string];
}>();

const filterInput = ref<HTMLInputElement>();
const treeElement = ref<HTMLElement>();
const filterOpen = ref(false);
const query = ref('');
const viewOptionsOpen = ref(false);
const viewOptionsButton = ref<HTMLButtonElement>();
const model = shallowRef<FileTreeModel>(createFileTreeModel(props.files));
let filterAnnounceTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  if (filterAnnounceTimer !== undefined) clearTimeout(filterAnnounceTimer);
  filterAnnounceTimer = setTimeout(() => emit('filterResult', model.value.flatFileRows.length, props.files.length, value), 400);
});

const totals = computed(() => {
  let additions = 0;
  let deletions = 0;
  for (const file of props.files) {
    additions += file.additions ?? 0;
    deletions += file.deletions ?? 0;
  }
  return { additions, deletions };
});

const footerText = computed(() => {
  if (query.value !== '') {
    return `${model.value.flatFileRows.length} of ${props.files.length} files`;
  }
  const count = props.files.length;
  return `${count} ${count === 1 ? 'file' : 'files'} · +${totals.value.additions} −${totals.value.deletions}`;
});

// List mode has no expansion state of its own: the "current" file is
// whichever one is selected (if it still survives the filter), falling
// back to the first filter-surviving entry — self-healing across filtering
// and mode switches without a separate ref to keep in sync.
const listTabbableFileId = computed(() => {
  const rows = model.value.flatFileRows;
  if (rows.length === 0) {
    return null;
  }
  const selected = model.value.selectedFileId;
  if (selected !== null && rows.some((row) => row.fileId === selected)) {
    return selected;
  }
  return rows[0]!.fileId;
});

function focusModelRow(): void {
  const focusedRowId = model.value.focusedRowId;
  if (focusedRowId === null) {
    return;
  }
  void nextTick(() => {
    const row = Array.from(
      treeElement.value?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((candidate) => candidate.dataset.rowId === focusedRowId);
    row?.focus();
  });
}

// Unlike `focusModelRow` (which trusts the model's raw, possibly-stale
// `focusedRowId`), this targets the clamped `tabbableRowId` — the row
// that's always guaranteed visible — for focus moves triggered from
// outside the row-navigation flow (the new filter/Esc interactions).
function focusTabbableTreeRow(): void {
  const rowId = model.value.tabbableRowId;
  if (rowId === null) {
    return;
  }
  void nextTick(() => {
    const row = Array.from(
      treeElement.value?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((candidate) => candidate.dataset.rowId === rowId);
    row?.focus();
  });
}

function focusListRow(fileId: string): void {
  void nextTick(() => {
    const row = Array.from(
      treeElement.value?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    ).find((candidate) => candidate.dataset.fileId === fileId);
    row?.focus();
  });
}

function applyModel(nextModel: FileTreeModel): void {
  const previousSelection = model.value.selectedFileId;
  model.value = nextModel;
  if (
    nextModel.selectedFileId !== null &&
    nextModel.selectedFileId !== previousSelection
  ) {
    emit('select', nextModel.selectedFileId);
  }
  focusModelRow();
}

function focusRow(rowId: string): void {
  applyModel(model.value.focusRow(rowId));
}

function activateFile(fileId: string): void {
  const row = model.value.visibleRows.find(
    (candidate) => candidate.kind === 'file' && candidate.fileId === fileId,
  );
  if (row !== undefined) {
    applyModel(model.value.focusRow(row.rowId));
    emit('activate', fileId);
  }
}

function toggleDirectory(directoryId: string): void {
  applyModel(model.value.toggleDirectory(directoryId));
}

function collapseAll(): void {
  const expandedSnapshot = [...model.value.effectiveExpandedDirectoryIds];
  let next = model.value;
  for (const directoryId of expandedSnapshot) {
    next = next.toggleDirectory(directoryId);
  }
  applyModel(next);
}

function selectListFile(fileId: string): void {
  if (model.value.selectedFileId === fileId) {
    return;
  }
  model.value = model.value.selectFile(fileId);
  emit('select', fileId);
}

function activateListFile(fileId: string): void {
  const exists = model.value.flatFileRows.some((row) => row.fileId === fileId);
  if (!exists) {
    return;
  }
  selectListFile(fileId);
  emit('activate', fileId);
  focusListRow(fileId);
}

function handleListFocusRow(rowId: string): void {
  selectListFile(rowId.slice(FILE_ROW_PREFIX.length));
}

function handleListKeydown(event: KeyboardEvent): void {
  const rows = model.value.flatFileRows;
  if (rows.length === 0) {
    return;
  }
  const currentId = listTabbableFileId.value;
  const currentIndex = currentId === null ? -1 : rows.findIndex((row) => row.fileId === currentId);

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    const nextIndex = Math.max(0, (currentIndex === -1 ? 0 : currentIndex) - 1);
    selectListFile(rows[nextIndex]!.fileId);
    focusListRow(rows[nextIndex]!.fileId);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const nextIndex = Math.min(rows.length - 1, currentIndex + 1);
    selectListFile(rows[nextIndex]!.fileId);
    focusListRow(rows[nextIndex]!.fileId);
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    selectListFile(rows[0]!.fileId);
    focusListRow(rows[0]!.fileId);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    const last = rows[rows.length - 1]!.fileId;
    selectListFile(last);
    focusListRow(last);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (currentId !== null) {
      activateListFile(currentId);
    }
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    // List mode has no folders to fold — explicit no-op per TREE-07.
    event.preventDefault();
  }
}

function updateQuery(nextQuery: string): void {
  query.value = nextQuery;
  model.value = model.value.setQuery(nextQuery);
}

function revealSelectedFile(): void {
  const selectedFileId = model.value.selectedFileId;
  if (selectedFileId === null) {
    return;
  }
  void nextTick(() => {
    const row = Array.from(
      treeElement.value?.querySelectorAll<HTMLElement>('[role="treeitem"], [role="option"]') ?? [],
    ).find((candidate) => candidate.dataset.fileId === selectedFileId);
    row?.scrollIntoView({ block: 'nearest' });
  });
}

function clearQuery(): void {
  updateQuery('');
  revealSelectedFile();
  void nextTick(() => filterInput.value?.focus());
}

function openFilter(): void {
  filterOpen.value = true;
  void nextTick(() => filterInput.value?.focus());
}

function closeFilterReturnFocusToTree(): void {
  updateQuery('');
  filterOpen.value = false;
  if (props.viewMode === 'list') {
    const fileId = listTabbableFileId.value;
    if (fileId !== null) {
      focusListRow(fileId);
    }
  } else {
    focusTabbableTreeRow();
  }
}

function toggleFilterOpen(): void {
  if (filterOpen.value) {
    closeFilterReturnFocusToTree();
    return;
  }
  openFilter();
}

function focusViewOptionsButton(): void {
  void nextTick(() => viewOptionsButton.value?.focus());
}

function closeViewOptions(): void {
  viewOptionsOpen.value = false;
  focusViewOptionsButton();
}

function toggleViewOptions(): void {
  viewOptionsOpen.value = !viewOptionsOpen.value;
}

function handleFilterKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeFilterReturnFocusToTree();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (props.viewMode === 'list') {
      const first = model.value.flatFileRows[0];
      if (first !== undefined) {
        activateListFile(first.fileId);
      }
      return;
    }
    const firstVisible = model.value.visibleRows.find((row) => row.kind === 'file');
    if (firstVisible !== undefined) {
      activateFile(firstVisible.fileId);
    }
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (props.viewMode === 'list') {
      const target = listTabbableFileId.value;
      if (target !== null) {
        focusListRow(target);
      }
    } else {
      focusTabbableTreeRow();
    }
  }
}

function handleTreeScopedKeydown(event: KeyboardEvent): void {
  const isFilterShortcut =
    event.altKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
  if (isFilterShortcut) {
    event.preventDefault();
    openFilter();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  const supportedKeys: readonly FileTreeNavigationKey[] = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'Enter',
    ' ',
  ];
  if (!supportedKeys.includes(event.key as FileTreeNavigationKey)) {
    return;
  }

  event.preventDefault();
  const activatedRow =
    event.key === 'Enter' || event.key === ' '
      ? model.value.visibleRows.find(
          (candidate) => candidate.rowId === model.value.focusedRowId,
        )
      : undefined;
  applyModel(model.value.handleKey(event.key as FileTreeNavigationKey));
  if (activatedRow?.kind === 'file') {
    emit('activate', activatedRow.fileId);
  }
}

onMounted(() => {
  if (props.initialSelectedFileId === undefined && model.value.selectedFileId !== null) {
    emit('select', model.value.selectedFileId);
  }
});

watch(
  () => props.initialSelectedFileId,
  (fileId) => {
    if (fileId !== undefined) {
      model.value = model.value.selectFile(fileId);
    }
  },
  { immediate: true },
);

watch(
  () => props.files,
  (files) => {
    applyModel(model.value.replaceFiles(files));
  },
);
</script>

<template>
  <nav class="file-tree-pane" aria-label="Changed files" @keydown="handleTreeScopedKeydown">
    <div class="file-tree-pane__top">
      <span class="file-tree-pane__label" aria-hidden="true">Changed files</span>
      <div class="file-tree-pane__toolbar" role="toolbar" aria-label="Changed files actions">
        <button
          type="button"
          class="icon-btn"
          aria-label="Filter changed files (⌥⌘F)"
          :aria-pressed="filterOpen"
          @click="toggleFilterOpen"
        >
          <UiIcon name="filter" />
        </button>
        <button
          type="button"
          class="icon-btn"
          :aria-label="viewMode === 'tree' ? 'View as list' : 'View as tree'"
          @click="emit('update:view-mode', viewMode === 'tree' ? 'list' : 'tree')"
        >
          <UiIcon :name="viewMode === 'tree' ? 'list' : 'tree'" />
        </button>
        <button type="button" class="icon-btn" aria-label="Collapse all" @click="collapseAll">
          <UiIcon name="collapse-all" />
        </button>
        <div class="file-tree-pane__view-options">
          <button
            ref="viewOptionsButton"
            type="button"
            class="icon-btn"
            aria-label="View options"
            aria-haspopup="menu"
            :aria-expanded="viewOptionsOpen"
            @click="toggleViewOptions"
          >
            <UiIcon name="more" />
          </button>
          <ViewOptionsMenu
            :open="viewOptionsOpen"
            :line-counts="lineCounts"
            :comment-badges-enabled="commentBadgesEnabled"
            @update:line-counts="emit('update:line-counts', $event)"
            @update:comment-badges="emit('update:comment-badges', $event)"
            @close="closeViewOptions"
          />
        </div>
      </div>
    </div>
    <div class="filter" v-show="filterOpen">
      <label class="visually-hidden" for="file-tree-filter">Filter changed files</label>
      <input
        id="file-tree-filter"
        ref="filterInput"
        type="search"
        autocomplete="off"
        placeholder="Filter by path"
        :value="query"
        @input="updateQuery(($event.target as HTMLInputElement).value)"
        @keydown="handleFilterKeydown"
      />
      <span class="n" v-if="query !== ''">{{ model.flatFileRows.length }} of {{ files.length }}</span>
      <button
        v-if="query !== ''"
        type="button"
        class="file-tree-pane__clear ui-button"
        aria-label="Clear filter"
        @click="clearQuery"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <div class="file-tree-pane__scroller">
      <ul
        v-if="viewMode === 'tree'"
        id="changed-files-heading"
        ref="treeElement"
        class="file-tree"
        role="tree"
        aria-label="Changed files"
        tabindex="-1"
        @keydown="handleKeydown"
      >
        <template
          v-for="node in model.projectedTree"
          :key="node.kind === 'file' ? node.fileId : node.directoryId"
        >
          <DirectoryRow
            v-if="node.kind === 'directory'"
            :directory="node"
            :level="1"
            :expanded-directory-ids="model.effectiveExpandedDirectoryIds"
            :status-priority-by-directory-id="model.statusPriorityByDirectoryId"
            :tabbable-row-id="model.tabbableRowId"
            :selected-file-id="model.selectedFileId"
            :recently-changed-paths="recentlyChangedPaths"
            :open-comment-counts="openCommentCounts"
            :line-counts="lineCounts"
            :comment-badges-enabled="commentBadgesEnabled"
            :query="filterOpen ? query : undefined"
            @activate-file="activateFile"
            @focus-row="focusRow"
            @toggle-directory="toggleDirectory"
          />
          <FileRow
            v-else
            :leaf="node"
            :level="1"
            :tabbable="model.tabbableRowId === `file:${node.fileId}`"
            :selected="model.selectedFileId === node.fileId"
            :recently-changed="isRecentlyChanged(node)"
            :open-comment-count="openCommentCounts?.get(node.fileId) ?? 0"
            :line-counts="lineCounts"
            :comment-badges-enabled="commentBadgesEnabled"
            :query="filterOpen ? query : undefined"
            @activate="activateFile"
            @focus-row="focusRow"
          />
        </template>
      </ul>
      <ul
        v-else
        id="changed-files-heading"
        ref="treeElement"
        class="file-tree"
        role="listbox"
        aria-label="Changed files"
        tabindex="-1"
        @keydown="handleListKeydown"
      >
        <FileRow
          v-for="row in model.flatFileRows"
          :key="row.fileId"
          mode="list"
          :leaf="row"
          :level="1"
          :tabbable="listTabbableFileId === row.fileId"
          :selected="model.selectedFileId === row.fileId"
          :recently-changed="isRecentlyChanged(row)"
          :open-comment-count="openCommentCounts?.get(row.fileId) ?? 0"
          :line-counts="lineCounts"
          :comment-badges-enabled="commentBadgesEnabled"
          :query="filterOpen ? query : undefined"
          @activate="activateListFile"
          @focus-row="handleListFocusRow"
        />
      </ul>
      <p v-if="model.flatFileRows.length === 0" class="tree-empty">No changed files match “{{ query }}”.</p>
    </div>
    <p class="tree-footer">{{ footerText }}</p>
  </nav>
</template>
