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
  readonly flatFileRows: readonly VisibleFileTreeLeaf[];
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

function flattenFileRows(
  nodes: readonly FileTreeNode[],
  output: VisibleFileTreeLeaf[],
): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      flattenFileRows(node.children, output);
    } else {
      output.push(
        Object.freeze({
          ...node,
          rowId: fileRowId(node.fileId),
          depth: 0,
        }),
      );
    }
  }
}

export interface HighlightSegment {
  readonly text: string;
  readonly matched: boolean;
}

/**
 * TREE-03: segments `display` into matched/unmatched runs for XSS-safe
 * `<mark>` rendering — callers render this via plain `v-for`/text
 * interpolation (never `v-html`), so a git path containing `<`/`>`/`&`
 * can never be interpreted as markup. Matching is case-insensitive
 * (mirroring `createModel`'s `needle` convention); each matched segment's
 * `text` preserves `display`'s original casing, never the lower-cased query.
 */
export function highlightMatches(
  display: string,
  query: string,
): readonly HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return Object.freeze([Object.freeze({ text: display, matched: false })]);
  }
  const haystack = display.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (;;) {
    const matchIndex = haystack.indexOf(needle, cursor);
    if (matchIndex === -1) {
      break;
    }
    if (matchIndex > cursor) {
      segments.push(Object.freeze({ text: display.slice(cursor, matchIndex), matched: false }));
    }
    const matchEnd = matchIndex + needle.length;
    segments.push(Object.freeze({ text: display.slice(matchIndex, matchEnd), matched: true }));
    cursor = matchEnd;
  }
  if (cursor < display.length) {
    segments.push(Object.freeze({ text: display.slice(cursor), matched: false }));
  }
  if (segments.length === 0) {
    segments.push(Object.freeze({ text: display, matched: false }));
  }
  return Object.freeze(segments);
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
  const flatFileRows: VisibleFileTreeLeaf[] = [];
  flattenFileRows(projectedTree, flatFileRows);
  const frozenFlatFileRows = Object.freeze(flatFileRows);
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
    flatFileRows: frozenFlatFileRows,
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

// 21-UI-SPEC.md `## Row Anatomy` → `### 1. File-type mark`: fixed extension
// lookup table, `tone` is the literal CSS custom-property name to colour the
// mark with (reused existing tokens only). Shared by `FileRow.vue`.
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

/**
 * PANEL-02: resolves a display path to its file-type mark, extracted from
 * `FileRow.vue`'s previously-private lookup so Phase 24's `CommentsTab.vue`
 * can reuse the identical mark/tone for its grouped-by-file comment rows.
 */
export function fileTypeMarkFor(displayPath: string | undefined): Readonly<{ text: string; tone: string }> {
  const extension = displayPath?.match(/\.([^./]+)$/)?.[1]?.toLowerCase();
  return extension !== undefined && Object.hasOwn(FILE_TYPE_MARKS, extension)
    ? FILE_TYPE_MARKS[extension]
    : FALLBACK_FILE_TYPE_MARK;
}
