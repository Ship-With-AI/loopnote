import type { ChangedFileStatusKind } from '../../contracts/comparison.js';
import type { SessionFile } from '../../contracts/api.js';
import {
  buildFileTree,
  type FileTreeDirectory,
  type FileTreeLeaf,
  type FileTreeNode,
} from '../../domain/file-tree.js';

export type FileTreeNavigationKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'Enter'
  | ' ';

export interface VisibleFileTreeDirectory extends FileTreeDirectory {
  readonly rowId: string;
  readonly depth: number;
}

export interface VisibleFileTreeLeaf extends FileTreeLeaf {
  readonly rowId: string;
  readonly depth: number;
}

export type VisibleFileTreeRow =
  | VisibleFileTreeDirectory
  | VisibleFileTreeLeaf;

export interface FileTreeModel {
  readonly tree: readonly FileTreeNode[];
  readonly visibleRows: readonly VisibleFileTreeRow[];
  readonly expandedDirectoryIds: readonly string[];
  readonly effectiveExpandedDirectoryIds: ReadonlySet<string>;
  readonly directoryDescendantCounts: ReadonlyMap<string, number>;
  readonly statusPriorityByDirectoryId: ReadonlyMap<string, ChangedFileStatusKind>;
  readonly focusedRowId: string | null;
  readonly selectedFileId: string | null;
  readonly query: string;
  readonly projectedTree: readonly FileTreeNode[];
  readonly displayExpandedDirectoryIds: readonly string[];
  readonly tabbableRowId: string | null;
  readonly focusRow: (rowId: string) => FileTreeModel;
  readonly toggleDirectory: (directoryId: string) => FileTreeModel;
  readonly selectFile: (fileId: string) => FileTreeModel;
  readonly setQuery: (query: string) => FileTreeModel;
  readonly replaceFiles: (files: readonly SessionFile[]) => FileTreeModel;
  readonly handleKey: (key: FileTreeNavigationKey) => FileTreeModel;
}

function directoryRowId(directoryId: string): string {
  return `directory:${directoryId}`;
}

function fileRowId(fileId: string): string {
  return `file:${fileId}`;
}

function collectDirectoryIds(
  nodes: readonly FileTreeNode[],
  output: string[],
): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      output.push(node.directoryId);
      collectDirectoryIds(node.children, output);
    }
  }
}

function collectFileIds(
  nodes: readonly FileTreeNode[],
  output: Set<string>,
): void {
  for (const node of nodes) {
    if (node.kind === 'file') {
      output.add(node.fileId);
    } else {
      collectFileIds(node.children, output);
    }
  }
}

function firstFileId(nodes: readonly FileTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node.fileId;
    }
    const nested = firstFileId(node.children);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

function countDirectoryDescendants(
  nodes: readonly FileTreeNode[],
  counts: Map<string, number>,
): number {
  let total = 0;
  for (const node of nodes) {
    if (node.kind === 'file') {
      total += 1;
    } else {
      const descendantCount = countDirectoryDescendants(node.children, counts);
      counts.set(node.directoryId, descendantCount);
      total += descendantCount;
    }
  }
  return total;
}

const STATUS_PRIORITY_ORDER: readonly ChangedFileStatusKind[] = Object.freeze([
  'modified',
  'deleted',
  'added',
  'renamed',
  'copied',
  'type-changed',
  'unsupported',
]);

function collectDirectoryStatusPriority(
  nodes: readonly FileTreeNode[],
  priorities: Map<string, ChangedFileStatusKind>,
): ChangedFileStatusKind | undefined {
  let best: ChangedFileStatusKind | undefined;
  for (const node of nodes) {
    let candidate: ChangedFileStatusKind | undefined;
    if (node.kind === 'file') {
      candidate = node.file.status.kind;
    } else {
      candidate = collectDirectoryStatusPriority(node.children, priorities);
      if (candidate !== undefined) {
        priorities.set(node.directoryId, candidate);
      }
    }
    if (
      candidate !== undefined &&
      (best === undefined ||
        STATUS_PRIORITY_ORDER.indexOf(candidate) <
          STATUS_PRIORITY_ORDER.indexOf(best))
    ) {
      best = candidate;
    }
  }
  return best;
}

function flattenVisibleRows(
  nodes: readonly FileTreeNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  output: VisibleFileTreeRow[],
): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      output.push(
        Object.freeze({
          ...node,
          rowId: directoryRowId(node.directoryId),
          depth,
        }),
      );
      if (expanded.has(node.directoryId)) {
        flattenVisibleRows(node.children, expanded, depth + 1, output);
      }
    } else {
      output.push(
        Object.freeze({
          ...node,
          rowId: fileRowId(node.fileId),
          depth,
        }),
      );
    }
  }
}

function pruneTree(
  nodes: readonly FileTreeNode[],
  matches: (leaf: FileTreeLeaf) => boolean,
  survivingDirectoryIds: string[],
): readonly FileTreeNode[] {
  const pruned: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (matches(node)) {
        pruned.push(node);
      }
      continue;
    }

    const children = pruneTree(node.children, matches, survivingDirectoryIds);
    if (children.length === 0) {
      continue;
    }
    survivingDirectoryIds.push(node.directoryId);
    pruned.push(Object.freeze({ ...node, children }));
  }
  return Object.freeze(pruned);
}

function findParentDirectoryRowId(
  nodes: readonly FileTreeNode[],
  targetRowId: string,
  parentRowId: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (fileRowId(node.fileId) === targetRowId) {
        return parentRowId;
      }
      continue;
    }

    const rowId = directoryRowId(node.directoryId);
    if (rowId === targetRowId) {
      return parentRowId;
    }
    const nested = findParentDirectoryRowId(node.children, targetRowId, rowId);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function createModel(
  tree: readonly FileTreeNode[],
  allDirectoryIds: readonly string[],
  expandedDirectoryIds: readonly string[],
  focusedRowId: string | null,
  selectedFileId: string | null,
  query: string,
  queryCollapsedDirectoryIds: readonly string[],
): FileTreeModel {
  const needle = query.trim().toLowerCase();
  const survivingDirectoryIds: string[] = [];
  const projectedTree =
    needle === ''
      ? tree
      : pruneTree(
          tree,
          (leaf) => leaf.effectivePath.display.toLowerCase().includes(needle),
          survivingDirectoryIds,
        );
  const directoryDescendantCounts = new Map<string, number>();
  countDirectoryDescendants(projectedTree, directoryDescendantCounts);
  const statusPriorityByDirectoryId = new Map<string, ChangedFileStatusKind>();
  collectDirectoryStatusPriority(projectedTree, statusPriorityByDirectoryId);
  const effectiveExpanded = new Set(expandedDirectoryIds);
  if (needle !== '') {
    for (const directoryId of survivingDirectoryIds) {
      effectiveExpanded.add(directoryId);
    }
    for (const directoryId of queryCollapsedDirectoryIds) {
      effectiveExpanded.delete(directoryId);
    }
  }
  const displayExpandedDirectoryIds =
    needle === ''
      ? expandedDirectoryIds
      : Object.freeze(
          allDirectoryIds.filter((directoryId) =>
            effectiveExpanded.has(directoryId),
          ),
        );
  const visibleRows: VisibleFileTreeRow[] = [];
  flattenVisibleRows(projectedTree, effectiveExpanded, 0, visibleRows);
  const frozenVisibleRows = Object.freeze(visibleRows);
  const selectedRowId =
    selectedFileId === null ? null : fileRowId(selectedFileId);
  const selectedRowVisible =
    selectedRowId !== null &&
    frozenVisibleRows.some((candidate) => candidate.rowId === selectedRowId);
  const focusedRowVisible =
    focusedRowId !== null &&
    frozenVisibleRows.some((candidate) => candidate.rowId === focusedRowId);
  const tabbableRowId = selectedRowVisible
    ? selectedRowId
    : focusedRowVisible
      ? focusedRowId
      : frozenVisibleRows[0]?.rowId ?? null;

  let model: FileTreeModel;

  const focusRow = (rowId: string): FileTreeModel => {
    const target = frozenVisibleRows.find((candidate) => candidate.rowId === rowId);
    if (target === undefined) {
      return model;
    }
    const nextSelection =
      target.kind === 'file' ? target.fileId : selectedFileId;
    if (focusedRowId === rowId && selectedFileId === nextSelection) {
      return model;
    }
    return createModel(
      tree,
      allDirectoryIds,
      expandedDirectoryIds,
      rowId,
      nextSelection,
      query,
      queryCollapsedDirectoryIds,
    );
  };

  const toggleDirectory = (directoryId: string): FileTreeModel => {
    if (!allDirectoryIds.includes(directoryId)) {
      return model;
    }
    const nextExpanded = new Set(expandedDirectoryIds);
    const wasExpanded = effectiveExpanded.has(directoryId);
    if (wasExpanded) {
      nextExpanded.delete(directoryId);
    } else {
      nextExpanded.add(directoryId);
    }
    const nextQueryCollapsed = new Set(queryCollapsedDirectoryIds);
    if (needle !== '') {
      if (wasExpanded) {
        nextQueryCollapsed.add(directoryId);
      } else {
        nextQueryCollapsed.delete(directoryId);
      }
    }
    return createModel(
      tree,
      allDirectoryIds,
      Object.freeze(
        allDirectoryIds.filter((candidate) => nextExpanded.has(candidate)),
      ),
      directoryRowId(directoryId),
      selectedFileId,
      query,
      Object.freeze(
        allDirectoryIds.filter((candidate) => nextQueryCollapsed.has(candidate)),
      ),
    );
  };

  const selectFile = (fileId: string): FileTreeModel => {
    if (selectedFileId === fileId) {
      return model;
    }
    const rowId = fileRowId(fileId);
    return createModel(
      tree,
      allDirectoryIds,
      expandedDirectoryIds,
      frozenVisibleRows.some((candidate) => candidate.rowId === rowId)
        ? rowId
        : focusedRowId,
      fileId,
      query,
      queryCollapsedDirectoryIds,
    );
  };

  const setQuery = (nextQuery: string): FileTreeModel =>
    query === nextQuery
      ? model
      : createModel(
          tree,
          allDirectoryIds,
          expandedDirectoryIds,
          focusedRowId,
          selectedFileId,
          nextQuery,
          Object.freeze([]),
        );

  const replaceFiles = (files: readonly SessionFile[]): FileTreeModel => {
    const nextTree = buildFileTree(files);
    const nextDirectoryIds: string[] = [];
    collectDirectoryIds(nextTree, nextDirectoryIds);
    const nextFileIds = new Set<string>();
    collectFileIds(nextTree, nextFileIds);
    const previousDirectoryIds = new Set(allDirectoryIds);
    const currentExpandedDirectoryIds = new Set(expandedDirectoryIds);
    const currentQueryCollapsedDirectoryIds = new Set(queryCollapsedDirectoryIds);
    const nextExpandedDirectoryIds = Object.freeze(
      nextDirectoryIds.filter(
        (directoryId) =>
          !previousDirectoryIds.has(directoryId) ||
          currentExpandedDirectoryIds.has(directoryId),
      ),
    );
    const nextQueryCollapsedDirectoryIds = Object.freeze(
      nextDirectoryIds.filter((directoryId) =>
        currentQueryCollapsedDirectoryIds.has(directoryId),
      ),
    );
    const nextSelectedFileId =
      selectedFileId !== null && nextFileIds.has(selectedFileId)
        ? selectedFileId
        : firstFileId(nextTree);
    const replacement = createModel(
      nextTree,
      Object.freeze(nextDirectoryIds),
      nextExpandedDirectoryIds,
      focusedRowId,
      nextSelectedFileId,
      query,
      nextQueryCollapsedDirectoryIds,
    );
    const nextFocusedRowId =
      focusedRowId !== null &&
      replacement.visibleRows.some((row) => row.rowId === focusedRowId)
        ? focusedRowId
        : replacement.tabbableRowId;

    return nextFocusedRowId === focusedRowId
      ? replacement
      : createModel(
          nextTree,
          Object.freeze(nextDirectoryIds),
          nextExpandedDirectoryIds,
          nextFocusedRowId,
          nextSelectedFileId,
          query,
          nextQueryCollapsedDirectoryIds,
        );
  };

  const handleKey = (key: FileTreeNavigationKey): FileTreeModel => {
    if (focusedRowId === null || frozenVisibleRows.length === 0) {
      return model;
    }
    const focusedIndex = frozenVisibleRows.findIndex(
      (candidate) => candidate.rowId === focusedRowId,
    );
    if (focusedIndex < 0) {
      return model;
    }
    const focused = frozenVisibleRows[focusedIndex]!;

    if (key === 'ArrowUp') {
      return focusedIndex === 0
        ? model
        : focusRow(frozenVisibleRows[focusedIndex - 1]!.rowId);
    }
    if (key === 'ArrowDown') {
      return focusedIndex === frozenVisibleRows.length - 1
        ? model
        : focusRow(frozenVisibleRows[focusedIndex + 1]!.rowId);
    }
    if (key === 'Home') {
      return focusRow(frozenVisibleRows[0]!.rowId);
    }
    if (key === 'End') {
      return focusRow(frozenVisibleRows[frozenVisibleRows.length - 1]!.rowId);
    }
    if (key === 'ArrowRight') {
      if (focused.kind === 'file') {
        return model;
      }
      if (!effectiveExpanded.has(focused.directoryId)) {
        return toggleDirectory(focused.directoryId);
      }
      const firstChild = frozenVisibleRows[focusedIndex + 1];
      return firstChild !== undefined && firstChild.depth > focused.depth
        ? focusRow(firstChild.rowId)
        : model;
    }
    if (key === 'ArrowLeft') {
      if (
        focused.kind === 'directory' &&
        effectiveExpanded.has(focused.directoryId)
      ) {
        return toggleDirectory(focused.directoryId);
      }
      const parent = findParentDirectoryRowId(projectedTree, focused.rowId);
      return parent === undefined || parent === null ? model : focusRow(parent);
    }
    if (key === 'Enter' || key === ' ') {
      return focused.kind === 'directory'
        ? toggleDirectory(focused.directoryId)
        : focusRow(focused.rowId);
    }
    return model;
  };

  model = Object.freeze({
    tree,
    visibleRows: frozenVisibleRows,
    expandedDirectoryIds,
    effectiveExpandedDirectoryIds: effectiveExpanded,
    directoryDescendantCounts,
    statusPriorityByDirectoryId,
    focusedRowId,
    selectedFileId,
    query,
    projectedTree,
    displayExpandedDirectoryIds,
    tabbableRowId,
    focusRow,
    toggleDirectory,
    selectFile,
    setQuery,
    replaceFiles,
    handleKey,
  });
  return model;
}

export function createFileTreeModel(
  files: readonly SessionFile[],
): FileTreeModel {
  const tree = buildFileTree(files);
  const directoryIds: string[] = [];
  collectDirectoryIds(tree, directoryIds);
  const expandedDirectoryIds = Object.freeze(directoryIds);
  const initialRows: VisibleFileTreeRow[] = [];
  flattenVisibleRows(tree, new Set(directoryIds), 0, initialRows);
  const initialLeaf = initialRows.find((row) => row.kind === 'file');

  return createModel(
    tree,
    expandedDirectoryIds,
    expandedDirectoryIds,
    initialLeaf?.rowId ?? null,
    initialLeaf?.kind === 'file' ? initialLeaf.fileId : null,
    '',
    Object.freeze([]),
  );
}
