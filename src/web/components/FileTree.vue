<script setup lang="ts">
import { nextTick, onMounted, ref, shallowRef, watch } from 'vue';

import type { SessionFile } from '../../contracts/api.js';
import type { FileTreeLeaf } from '../../domain/file-tree.js';
import {
  createFileTreeModel,
  type FileTreeNavigationKey,
  type FileTreeModel,
} from '../model/file-tree.js';
import DirectoryRow from './DirectoryRow.vue';
import FileRow from './FileRow.vue';

const props = defineProps<{
  files: readonly SessionFile[];
  initialSelectedFileId?: string;
  recentlyChangedPaths?: ReadonlySet<string>;
}>();

function isRecentlyChanged(leaf: FileTreeLeaf): boolean {
  const path = leaf.file.newPath?.display ?? leaf.file.oldPath?.display;
  return path !== undefined && (props.recentlyChangedPaths?.has(path) ?? false);
}

const emit = defineEmits<{
  activate: [fileId: string];
  select: [fileId: string];
}>();

const filterInput = ref<HTMLInputElement>();
const treeElement = ref<HTMLElement>();
const query = ref('');
const model = shallowRef<FileTreeModel>(createFileTreeModel(props.files));

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
      treeElement.value?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
    ).find((candidate) => candidate.dataset.fileId === selectedFileId);
    row?.scrollIntoView({ block: 'nearest' });
  });
}

function clearQuery(): void {
  updateQuery('');
  revealSelectedFile();
  void nextTick(() => filterInput.value?.focus());
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
  <nav class="file-tree-pane" aria-label="Changed files">
    <div class="file-tree-pane__top">
      <h2 id="changed-files-heading" tabindex="-1">
        <span aria-hidden="true">Files</span>
        <span class="visually-hidden">Changed files ({{ files.length }})</span>
        <span class="file-tree-pane__count" aria-hidden="true">{{ files.length }}</span>
        <span class="file-tree-pane__eyebrow" aria-hidden="true">Changed</span>
      </h2>
      <div class="file-tree-pane__filter">
        <span class="file-tree-pane__filter-glyph" aria-hidden="true">⌕</span>
        <label class="visually-hidden" for="file-tree-filter">Filter files</label>
        <input
          id="file-tree-filter"
          ref="filterInput"
          type="search"
          autocomplete="off"
          placeholder="Find file…"
          :value="query"
          @input="updateQuery(($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="query !== ''"
          type="button"
          class="file-tree-pane__clear ui-button"
          aria-label="Clear file filter"
          @click="clearQuery"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
    <div class="file-tree-pane__scroller">
      <ul
        ref="treeElement"
        class="file-tree"
        role="tree"
        aria-label="Changed files"
        aria-labelledby="changed-files-heading"
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
            :directory-descendant-counts="model.directoryDescendantCounts"
            :tabbable-row-id="model.tabbableRowId"
            :selected-file-id="model.selectedFileId"
            :recently-changed-paths="recentlyChangedPaths"
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
            @activate="activateFile"
            @focus-row="focusRow"
          />
        </template>
      </ul>
      <section v-if="model.visibleRows.length === 0" class="tree-empty" aria-labelledby="tree-empty-heading">
        <h3 id="tree-empty-heading">No matching files</h3>
        <p>Clear the filter to show all changed files.</p>
        <button type="button" class="ui-button" @click="clearQuery">Clear filter</button>
      </section>
      <p class="tree-hint">↑↓ move · → open · ← close · Home/End jump · Enter/Space select</p>
    </div>
  </nav>
</template>
