# Phase 21: Changed-Files Tree - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 9 (6 modified, 1 new component, 2 modified models — `App.vue` counted once)
**Analogs found:** 8 / 9 (ViewOptionsMenu.vue has only partial analogs; documented as a gap below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/model/file-tree.ts` (add `statusPriorityByDirectoryId`, flat-file-row projection) | model (pure functions over in-memory tree) | transform | itself — `countDirectoryDescendants` / `flattenVisibleRows` in the same file | exact (sibling function, same file, same recursive shape) |
| `src/web/model/panel-state.ts` (add `treeViewMode`/`treeLineCounts`/`treeCommentBadges`) | model (localStorage persistence) | CRUD (read/validate/write one key) | itself — `parsePanelState`/`PersistedPanelState`/`createPanelState` (existing 3-field version) | exact (literal 3-more-fields extension of the same file) |
| `src/web/components/FileTree.vue` | component (container, keyboard dispatch, filter/toolbar host) | event-driven (keydown/click → model calls → re-render) | itself (restyle in place) | exact |
| `src/web/components/DirectoryRow.vue` | component (tree row, recursive) | event-driven (emit `toggleDirectory`/`focusRow`) | itself (restyle: remove descendant badge, add bullet) | exact |
| `src/web/components/FileRow.vue` | component (leaf row) | event-driven (emit `activate`/`focusRow`) | itself (restyle: reorder markers, add comment badge) | exact |
| `src/web/components/StatusBadge.vue` | component (presentational, pure prop→label) | transform | itself (extend `presentation` switch) | exact |
| `src/web/App.vue` (new `openCommentCounts` computed + view-option refs wired to `panelState`) | component (top-level state owner) | event-driven / derived-computed | itself — existing `recentlyChangedPaths` prop wiring (`App.vue:128`, `:recently-changed-paths="recentlyChangedPaths"` at `App.vue:1500`) and `panelState.sidebarWidth`/`commitPanelHeight` persist wiring (`App.vue:93,365-391`) | exact |
| `src/web/components/ui/UiIcon.vue` (add `filter`/`list`/`tree`/`collapse-all`/`more`/`comment` glyphs) | utility (icon atlas) | transform (name → SVG) | itself (extend `UiIconName` union + `v-else-if` chain) | exact |
| `src/web/components/ViewOptionsMenu.vue` (**new**) | component (anchored popover, `role="menu"`) | event-driven (click-to-open, arrow-key nav, outside-click/Esc dismiss) | **no exact analog** — closest partial matches: `src/web/components/ui/ModalDialog.vue` (focus containment + Esc-to-close only, wrong dismiss model) and `src/web/components/workbench/TitleBar.vue` (icon-button-with-`aria-pressed` trigger pattern, no popover body) | **no analog — hand-build** (see `## Gap: ViewOptionsMenu.vue`) |

## Pattern Assignments

### `src/web/model/file-tree.ts` (model, transform)

**Analog:** itself — `countDirectoryDescendants` (status-priority sibling) and `flattenVisibleRows` (flat-list sibling)

**Imports pattern** (lines 1-7):
```typescript
import type { SessionFile } from '../../contracts/api.js';
import {
  buildFileTree,
  FileTreeDirectory,
  FileTreeLeaf,
  FileTreeNode,
} from '../../domain/file-tree.js';
```

**Core pattern — recursive directory-count collector to copy for `statusPriorityByDirectoryId`** (lines 99-114, verbatim):
```typescript
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
```
The new `collectDirectoryStatusPriority(nodes, priorities: Map<string, ChangedFileStatusKind>)` follows this exact recursive shape: walk `nodes`, for a `file` fold its `status.kind` into a running "best priority seen" value using the fixed table (`modified > deleted > added > renamed/copied > type-changed > unsupported`, from `21-UI-SPEC.md` `## Compact Folders & Collapsed Bullet`), for a `directory` recurse first then fold the child's already-resolved winner, and `priorities.set(node.directoryId, winner)` before returning the directory's own winner to its parent (so a nested folder's priority propagates up, mirroring how `descendantCount` accumulates). It is called once per `createModel` pass alongside the existing `countDirectoryDescendants(projectedTree, directoryDescendantCounts)` call (`file-tree.ts:215`) so it stays in sync with filter pruning for free.

**Core pattern — flatten sibling to copy for filter-aware, expansion-independent flat list** (lines 116-144, verbatim, **note the `expanded.has(...)` gate at line 131 that the new sibling must NOT have**):
```typescript
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
```
The new flat-file-row function (name per Claude's Discretion, e.g. `flattenFileRows`) takes the same `nodes: readonly FileTreeNode[]` (pass `projectedTree` — already filter-pruned) and `output` accumulator, drops the `expanded`/`depth` parameters entirely, skips directory nodes outright (no `output.push` for `kind === 'directory'`, no `expanded.has` check gating recursion — directories are *always* recursed into), and pushes only `VisibleFileTreeLeaf`-shaped rows. Depth-first order falls out naturally from iterating `nodes` in the existing array order (already directory-then-alphabetical per `buildFileTree`), so no separate sort step is needed — this is exactly CONTEXT.md's "same order tree already produces" guarantee.

**Model interface extension point** (lines 33-51, verbatim) — new computed fields (`statusPriorityByDirectoryId`, flat row list) belong alongside existing derived fields like `directoryDescendantCounts`:
```typescript
export interface FileTreeModel {
  readonly tree: readonly FileTreeNode[];
  readonly visibleRows: readonly VisibleFileTreeRow[];
  readonly expandedDirectoryIds: readonly string[];
  readonly effectiveExpandedDirectoryIds: ReadonlySet<string>;
  readonly directoryDescendantCounts: ReadonlyMap<string, number>;
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
```

**Construction site where both new collectors must be wired** (`createModel`, lines 206-235) — `projectedTree` is the already-pruned tree; both `directoryDescendantCounts` and the new `statusPriorityByDirectoryId` are recomputed from it on every `setQuery`/`toggleDirectory`/`replaceFiles` call, and `visibleRows`/the new flat list are built from the same `projectedTree` + `effectiveExpanded`:
```typescript
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
// ... effectiveExpanded computed ...
const visibleRows: VisibleFileTreeRow[] = [];
flattenVisibleRows(projectedTree, effectiveExpanded, 0, visibleRows);
```

**Anti-pattern (explicit, from RESEARCH.md):** do not rebuild/reconstruct `FileTreeDirectory` nodes on filter keystroke — `pruneTree` (lines 146-168) already exists and is reused unchanged by `setQuery`; new functions must consume its output (`projectedTree`), never re-derive the tree.

---

### `src/web/model/panel-state.ts` (model, CRUD)

**Analog:** itself — exact field-by-field extension of the existing 3-field pattern

**Full existing pattern to replicate three more times** (lines 43-93, verbatim):
```typescript
export interface PersistedPanelState {
  readonly sidebarWidth: number;
  readonly sidebarVisible: boolean;
  readonly panelHeight: number;
}

function defaultPersistedPanelState(): PersistedPanelState {
  return {
    sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
    sidebarVisible: SIDEBAR_VISIBLE_DEFAULT,
    panelHeight: PANEL_HEIGHT_DEFAULT,
  };
}

export function parsePanelState(raw: string | null): PersistedPanelState {
  if (raw === null) {
    return defaultPersistedPanelState();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultPersistedPanelState();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaultPersistedPanelState();
  }

  const candidate = parsed as Record<string, unknown>;
  return {
    sidebarWidth: typeof candidate.sidebarWidth === 'number'
      ? clampSidebarWidth(candidate.sidebarWidth)
      : SIDEBAR_WIDTH_DEFAULT,
    sidebarVisible: typeof candidate.sidebarVisible === 'boolean'
      ? candidate.sidebarVisible
      : SIDEBAR_VISIBLE_DEFAULT,
    panelHeight: typeof candidate.panelHeight === 'number'
      ? clampPanelHeight(candidate.panelHeight)
      : PANEL_HEIGHT_DEFAULT,
  };
}
```
The three new fields each get one more arm in this same `typeof`-guard-else-default shape, independently validated (one corrupt field never invalidates the others — this is the exact guarantee CONTEXT.md/RESEARCH.md call out):
- `treeViewMode`: `typeof candidate.treeViewMode === 'string' && (candidate.treeViewMode === 'tree' || candidate.treeViewMode === 'list') ? candidate.treeViewMode : 'tree'`
- `treeLineCounts`: `typeof candidate.treeLineCounts === 'string' && ['always','hover','never'].includes(candidate.treeLineCounts) ? candidate.treeLineCounts : 'hover'`
- `treeCommentBadges`: `typeof candidate.treeCommentBadges === 'boolean' ? candidate.treeCommentBadges : true`

**Reactive-slice + persist() pattern to extend** (lines 99-135, verbatim):
```typescript
export interface PanelState {
  readonly sidebarWidth: ShallowRef<number>;
  readonly sidebarVisible: ShallowRef<boolean>;
  readonly panelHeight: ShallowRef<number>;
  persist(): void;
}

export function createPanelState(options: PanelStateOptions = {}): PanelState {
  const storage = options.storage ?? window.localStorage;
  const initial = parsePanelState(storage.getItem(PANEL_STATE_STORAGE_KEY));

  const sidebarWidth = shallowRef(initial.sidebarWidth);
  const sidebarVisible = shallowRef(initial.sidebarVisible);
  const panelHeight = shallowRef(initial.panelHeight);

  return Object.freeze({
    sidebarWidth,
    sidebarVisible,
    panelHeight,
    persist() {
      const persisted: PersistedPanelState = {
        sidebarWidth: sidebarWidth.value,
        sidebarVisible: sidebarVisible.value,
        panelHeight: panelHeight.value,
      };
      storage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(persisted));
    },
  });
}
```
Add `treeViewMode`/`treeLineCounts`/`treeCommentBadges` as three more `shallowRef`s in both the `PanelState` interface and `createPanelState`'s return object and `persist()`'s serialized object, in the same position/order as `PersistedPanelState`.

**Call-site persist discipline to copy** (`App.vue:93,365-391`, verbatim) — mutate the ref, then call `persist()` immediately (debounced only for the drag-continuous sidebar-width case, not needed here since menu/radio toggles are discrete clicks):
```typescript
const panelState = createPanelState();
// ...
function toggleSidebar(): void {
  panelState.sidebarVisible.value = !panelState.sidebarVisible.value;
  panelState.persist();
  // ...
}
```
`App.vue` wires the three new view-option refs the same way: a handler on `ViewOptionsMenu`'s `update:line-counts`/`update:comment-badges` emits (or a `v-model`-style pair) sets `panelState.treeLineCounts.value = ...; panelState.persist();`.

---

### `src/web/components/FileTree.vue` (component, event-driven)

**Analog:** itself (in-place restyle/extension)

**Imports + model wiring to keep unchanged** (lines 1-33, verbatim):
```typescript
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

const filterInput = ref<HTMLInputElement>();
const treeElement = ref<HTMLElement>();
const query = ref('');
const model = shallowRef<FileTreeModel>(createFileTreeModel(props.files));
```

**Keyboard dispatch pattern to extend for ⌥⌘F / view-options menu keys** (lines 102-128, verbatim) — this `@keydown` handler is scoped to the `<ul role="tree">` element itself (`tree.getByRole('tree')... @keydown="handleKeydown"`, line 192), **not** `document`-level, which is exactly the "tree-focus-scoped" behavior TREE-07's new ⌥⌘F binding must copy (contrast with `App.vue:941-944`'s `document`-level, always-`preventDefault` ⌘B/⌘J handler — ⌥⌘F must NOT use that pattern, per UI-SPEC's explicit "does nothing if focus elsewhere" note):
```typescript
function handleKeydown(event: KeyboardEvent): void {
  const supportedKeys: readonly FileTreeNavigationKey[] = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ',
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
```
Add an `event.metaKey/altKey` + `event.key === 'f'` branch before the `supportedKeys` early-return (opens filter, moves focus to `filterInput`) — same `@keydown` listener, same scoping, additive branch, not a new document-level listener.

**Filter-row markup to restyle into a header-opened, `v-show`-gated row** (current always-visible version, lines 162-183, verbatim) — existing `v-model="query"` → `updateQuery()` wiring and `clearQuery()` stay; wrap in `v-show="filterOpen"`, move below a new `role="toolbar"` view-header per UI-SPEC's `## Filter (TREE-03)` markup block:
```html
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
  <button v-if="query !== ''" type="button" class="file-tree-pane__clear ui-button" aria-label="Clear file filter" @click="clearQuery">
    <span aria-hidden="true">×</span>
  </button>
</div>
```

**Row-list rendering loop to extend with `role` switch (tree/listbox) and new flat-list branch** (lines 185-222, verbatim):
```html
<ul ref="treeElement" class="file-tree" role="tree" aria-label="Files" aria-labelledby="changed-files-heading" @keydown="handleKeydown">
  <template v-for="node in model.projectedTree" :key="node.kind === 'file' ? node.fileId : node.directoryId">
    <DirectoryRow v-if="node.kind === 'directory'" :directory="node" :level="1" .../>
    <FileRow v-else :leaf="node" :level="1" .../>
  </template>
</ul>
```
List mode swaps `role="tree"` → `role="listbox"`, iterates the new flat-file-row list instead of `model.projectedTree`, and renders only `FileRow`/`TreeRow` with `role="option"` (no `DirectoryRow`).

---

### `src/web/components/DirectoryRow.vue` (component, event-driven)

**Analog:** itself (restyle: remove descendant-count badge, add collapsed bullet)

**Full current component** (161 lines) — props, computed, and the piece to remove/replace:
```typescript
const props = defineProps<{
  directory: FileTreeDirectory;
  level: number;
  expandedDirectoryIds: ReadonlySet<string>;
  directoryDescendantCounts: ReadonlyMap<string, number>;
  tabbableRowId: string | null;
  selectedFileId: string | null;
  recentlyChangedPaths?: ReadonlySet<string>;
}>();

const expanded = computed(() => props.expandedDirectoryIds.has(props.directory.directoryId));
const displayPath = computed(() => props.directory.segments.map((segment) => segment.display).join('/'));
const descendantCount = computed(() => props.directoryDescendantCounts.get(props.directory.directoryId) ?? 0);
const descendantCountLabel = computed(() => `${descendantCount.value} ${descendantCount.value === 1 ? 'changed file' : 'changed files'}`);
```
`descendantCount`/`descendantCountLabel` (the removed accessible-name badge) are replaced by a new `statusPriority` prop-derived computed (`props.statusPriorityByDirectoryId.get(props.directory.directoryId)`) feeding the new `v-if="!expanded"` decorative `●` bullet — same prop-drilling shape as `directoryDescendantCounts` (a `ReadonlyMap<string, ...>` passed down from `FileTree.vue`'s `model`), just a new map and a template-only (non-accessible-name) consumer.

---

### `src/web/components/FileRow.vue` (component, event-driven)

**Analog:** itself (restyle: DOM reorder, add comment badge)

**Full current computed-label pattern to extend for new `comment badge` + reordered markers** (lines 1-46, verbatim):
```typescript
import { computed } from 'vue';

import type { FileTreeLeaf } from '../../domain/file-tree.js';
import PathDisplay from './PathDisplay.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  leaf: FileTreeLeaf;
  level: number;
  tabbable: boolean;
  selected: boolean;
  recentlyChanged?: boolean;
}>();

const countLabel = computed(() => {
  const { additions, deletions } = props.leaf.file;
  if (additions === null || deletions === null) {
    return 'Line counts unavailable';
  }
  return `${additions} ${additions === 1 ? 'addition' : 'additions'}, ${deletions} ${deletions === 1 ? 'deletion' : 'deletions'}`;
});
const availabilityLabel = computed(() => { /* switch on availability.kind */ });
const standaloneStateLabel = computed(() => { /* switch on standaloneGitState */ });
```
New `openCommentCount?: number` prop (passed down from `FileTree.vue` ← `App.vue`'s `openCommentCounts` map, same shape as the existing `recentlyChanged?: boolean` prop) drives a new computed `commentBadgeLabel` (`"{N} open comment"` / `"{N} open comments"`, singular only at exactly 1) rendered as a `<span class="cbadge" aria-label="...">` per the accent-colour `--interactive-accent` contract in `## Color`. DOM reorder (comment badge → markers → counts → status letter, per `21-UI-SPEC.md` `## Row Anatomy`) is a template-only change; `countLabel`/`availabilityLabel`/`standaloneStateLabel` computeds are reused unchanged, only their rendered position moves.

---

### `src/web/components/StatusBadge.vue` (component, transform)

**Analog:** itself (extend `presentation` switch)

**Full current component** (42 lines, verbatim):
```typescript
const presentation = computed(() => {
  switch (props.kind) {
    case 'added': return { label: 'Added', text: 'A', tone: 'added' };
    case 'copied': return { label: 'Copied', text: 'C', tone: 'moved' };
    case 'deleted': return { label: 'Deleted', text: 'D', tone: 'deleted' };
    case 'modified': return { label: 'Modified', text: 'M', tone: 'modified' };
    case 'renamed': return { label: 'Renamed', text: 'R', tone: 'moved' };
    case 'type-changed':
    case 'unsupported':
      return { label: 'Mode changed', text: 'Mode', tone: 'modified' };
  }
});
```
```html
<span class="status-badge" :class="`status-badge--${presentation.tone}`">
  <span aria-hidden="true">{{ presentation.text }}</span>
  <span class="visually-hidden">{{ presentation.label }}{{ singlePaneSuffix }}</span>
</span>
```
Split the merged `type-changed`/`unsupported` case into two arms: `type-changed` → `{ label: 'type changed', text: 'T', tone: 'modified' }`; `unsupported` needs the **raw status code** (not available on `props.kind` alone — the component needs a new `code?: string` prop threaded from `FileTreeLeaf.status.code`, same prop-threading shape as the existing `kind`/`reviewable` props) → `{ label: `unsupported status: ${props.code}`, text: props.code, tone: 'unsupported' }`. The outer `<span>`'s pill chrome (`border`/`background` in `.status-badge--*` CSS) is dropped only in `.tree-row` context — add a `plain?: boolean` prop (or a CSS-only `:class` toggle driven by a `tree` prop) rather than two component variants, since the same component is reused unchanged outside the tree per UI-SPEC.

---

### `src/web/App.vue` (component, event-driven / derived-computed)

**Analog:** itself — `recentlyChangedPaths` prop-derivation pattern (for `openCommentCounts`) and `panelState` persist-on-toggle pattern (for the three new view-option refs)

**Existing comment-data access to reduce into `openCommentCounts`** (lines 297-298, verbatim):
```typescript
const workspaceComments = computed(() => workspaceState.value?.comments ?? []);
const openCommentCount = computed(() => workspaceComments.value.filter((comment) => comment.state === 'open').length);
```
`projectCommentGroups` (`src/web/model/comment-groups.ts:93-101`) already exists and returns `{ open: readonly CommentGroup[]; resolved: readonly CommentGroup[] }` where each `CommentGroup` is `{ path: ReviewPathIdentity; comments: readonly ReviewCommentProjection[] }` (`comment-groups.ts:21-24`). New `openCommentCounts` computed: `projectCommentGroups(workspaceComments.value, inventory).open.reduce((map, group) => map.set(group.path.display, group.comments.length), new Map<string, number>())`, frozen as `ReadonlyMap<string, number>` — same derived-from-existing-computed shape as `openCommentCount` above, just keyed by path instead of summed to one number.

**Existing prop-threading site to extend** (`App.vue:1499-1503`, verbatim — add `:open-comment-counts` and the three view-option props alongside the existing `recently-changed-paths`):
```html
<FileTree
  ...
  :files="session.files"
  :recently-changed-paths="recentlyChangedPaths"
  :initial-selected-file-id="selectedFile?.fileId"
  ...
/>
```
(`ChangedFilesDialog.vue:38-45` has the identical Teleport-hosted sibling instance — both call sites need the new props per Pitfall 1/narrow-viewport integration in RESEARCH.md.)

**Existing persist-on-toggle pattern to copy for the three new view-option refs** (`App.vue:93,365-369`, verbatim):
```typescript
const panelState = createPanelState();
// ...
function toggleSidebar(): void {
  panelState.sidebarVisible.value = !panelState.sidebarVisible.value;
  panelState.persist();
  dispatchWorkspace({ type: 'resize' });
  diffWorkspace.value?.layout();
}
```
New handlers (`setTreeViewMode`, `setTreeLineCounts`, `toggleTreeCommentBadges`) follow the same two-line shape: mutate the matching `panelState.tree*` ref, call `panelState.persist()`. `App.vue` is the state owner per RESEARCH.md's architecture diagram (`# treeLineCounts, treeCommentBadges + persist() wiring` lives at the `App.vue` level, not inside `FileTree.vue`), exactly mirroring how `sidebarVisible`/`sidebarWidth`/`panelHeight` are owned by `App.vue` and passed down as props, never owned by `WorkbenchShell.vue` or any child.

---

### `src/web/components/ui/UiIcon.vue` (utility, transform)

**Analog:** itself (extend `UiIconName` union + `v-else-if` chain)

**Full current pattern to extend** (lines 1-26 + per-icon template arm, verbatim):
```typescript
export type UiIconName =
  | 'previous-file' | 'next-file' | 'previous-change' | 'next-change'
  | 'open' | 'check' | 'warning' | 'error' | 'information' | 'selected'
  | 'lock' | 'refresh' | 'sidebar' | 'panel' | 'close'
  | 'diff-split' | 'diff-inline' | 'markdown-source' | 'markdown-preview' | 'disabled';

defineProps<{ name: UiIconName; }>();
```
```html
<svg class="ui-icon" aria-hidden="true" focusable="false" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 16 16" width="16">
  <template v-if="name === 'previous-file'">
    <path d="M10.5 2.5H5.25A1.75 1.75 0 0 0 3.5 4.25v7.5c0 .97.78 1.75 1.75 1.75h5.25c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75Z" />
    <path d="m7.5 5.5-2.5 2.5 2.5 2.5M5.25 8H11" />
  </template>
  <template v-else-if="name === 'next-file'"> ... </template>
</svg>
```
Add `'filter' | 'list' | 'tree' | 'collapse-all' | 'more' | 'comment'` to the union and six more `v-else-if` arms with hand-drawn 16×16 `stroke-width:1.5` paths (existing `close` icon is reused unchanged for "Clear filter" per UI-SPEC's Icon Inventory — no new glyph needed there).

---

## Gap: `ViewOptionsMenu.vue`

**No existing anchored-popover-with-outside-click component or composable exists anywhere in `src/web`.** Confirmed independently (this agent's own search, not just RESEARCH.md's claim):

```
grep "addEventListener\('(click|mousedown|pointerdown|keydown)'" src/web
→ App.vue:1215           document.addEventListener('keydown', handleKeydown)   (global shortcut dispatch, not dismiss)
→ RenderedMarkdownView.vue:84  button.addEventListener('click', ...)           (unrelated: wires a '+' comment-affordance button)
→ Phase6DiffSemanticsPrototype.vue:189  document.addEventListener('keydown', ...) (prototype, not production)
```
No `pointerdown`/`mousedown` outside-click-dismiss listener exists anywhere in the codebase. `grep "role=\"menu\"|menuitemradio|menuitemcheckbox"` across `src/web` also returns **zero matches** — `role="menu"` has never been built in this project.

**Note on `21-UI-SPEC.md` wording:** the UI-SPEC's `## View Options Menu` section says to "reuse the existing outside-click-dismiss pattern already used by popovers in the codebase." This search confirms that pattern does **not** exist in the codebase today (RESEARCH.md's Pitfall 4 and `## Don't Hand-Roll` table independently reach the same conclusion). Treat the UI-SPEC sentence as aspirational/forward-looking, not a pointer to real code — the planner must hand-roll the dismiss logic as new code in this phase, not search further for a copy source.

### Closest partial analogs (two, neither sufficient alone)

**1. Focus containment + Esc-to-close — `src/web/components/ui/ModalDialog.vue` (lines 1-60+):**
```typescript
const focusableSelector = [
  'button:not(:disabled)', 'input:not(:disabled)', 'textarea:not(:disabled)',
  'select:not(:disabled)', 'a[href]', '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(', ');

function focusInitial(): void {
  void nextTick(() => {
    const initial = props.initialFocusSelector === undefined
      ? undefined
      : panel.value?.querySelector<HTMLElement>(props.initialFocusSelector);
    (initial ?? closeButton.value)?.focus();
  });
}

function containFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== 'Tab') return;
  // ... wraps Tab/Shift+Tab between first/last focusable in panel.value ...
}
```
Usable directly for: the Escape-closes-and-returns-focus-to-opener behavior (`ModalDialog.vue` already tracks `opener` and calls `opener.focus()` on dismiss — same shape `ViewOptionsMenu.vue` needs for "Esc returns focus to the ⋯ button"). **Not usable for:** the dismiss trigger — `ModalDialog.vue`'s only dismiss-by-pointer mechanism is `<div class="modal-dialog-backdrop" @click.self="dismiss">`, a full-viewport backdrop `<div>` that *blocks all other interaction* while open. A `role="menu"` anchored under a 22×22px `⋯` button must **not** render a backdrop (per UI-SPEC: "should not dim/block rest UI") and must dismiss on a click/pointerdown *anywhere outside the menu's bounding box*, including on a sibling toolbar button — fundamentally different geometry from a self-click backdrop.

**2. Icon-button-with-state trigger — `src/web/components/workbench/TitleBar.vue` (lines 179-199, verbatim):**
```html
<button
  ref="sidebarToggle"
  type="button"
  class="icon-btn"
  title="Toggle side bar (⌘B)"
  aria-label="Toggle side bar (⌘B)"
  :aria-pressed="sidebarVisible"
  @click="emit('toggleSidebar')"
>
  <UiIcon name="sidebar" />
</button>
```
Directly reusable for the `⋯` trigger button's shell (`class="icon-btn"`, `UiIcon` child, `aria-label`) — swap `:aria-pressed` for `:aria-haspopup="'menu'" :aria-expanded="menuOpen"` and `@click="toggleMenu"`. `BottomPanel.vue:106-108` has the identical minimal `icon-btn` shape for the "Collapse all"/"View options" other two new toolbar buttons that don't need open/close state.

### Required hand-built pieces (no analog; new code, per RESEARCH.md's explicit recommendation)

1. **Outside-click dismiss** — a `document`-level `pointerdown` listener registered in `onMounted` (while `open === true`) / removed in `onUnmounted` or via a `watch(() => props.open, ...)`, checking `!menuRoot.value?.contains(event.target as Node) && !triggerButton.value?.contains(event.target as Node)` before closing. Write inline in `ViewOptionsMenu.vue` — RESEARCH.md's `## Don't Hand-Roll` table explicitly rejects inventing a generic `useClickOutside` composable ("no existing composable... extract shared helper... do not invent generic composable abstraction speculatively for future reuse").
2. **Roving-tabindex / arrow-key navigation among 4 menu items** (3 `menuitemradio` + 1 `menuitemcheckbox`) wrapping on Home/End-less Up/Down — no existing analog; closest conceptual cousin is `file-tree.ts`'s `handleKey` roving-tabindex model but that is tree-shaped (parent/child, not a flat wrapping list) and lives in a `.ts` model file, not a component — do not try to reuse `file-tree.ts`'s functions directly; re-derive a small local `tabindex`/`focus()` loop scoped to the menu's 4 items, matching only the *convention* (one `tabindex="0"` at a time, rest `-1`) not the code.
3. **Anchored positioning below the `⋯` button** — no existing popover-positioning code in the codebase (`ModalDialog.vue` is viewport-centered via CSS, not anchored to a trigger element). UI-SPEC specifies "anchored below the button" with existing overlay tokens (`--surface-panel`, `--border-overlay`, `--radius-overlay`, `--shadow-overlay`) — this is pure CSS (`position: absolute` relative to a `position: relative` wrapper around the button+menu), no JS positioning library needed per RESEARCH.md's "no new dependencies" constraint.

## Shared Patterns

### Clamp/parse-reject-to-default (localStorage validation)
**Source:** `src/web/model/panel-state.ts:65-93` (`parsePanelState`)
**Apply to:** `treeViewMode`/`treeLineCounts`/`treeCommentBadges` additions to the same file — each field validated independently with its own `typeof`/enum guard and its own default fallback; a corrupt value for one field must never invalidate sibling fields or throw.

### Prop-drilling a `ReadonlyMap`/`ReadonlySet` derived in `App.vue` down through `FileTree.vue` → `DirectoryRow.vue`/`FileRow.vue`
**Source:** `recentlyChangedPaths` (`App.vue:128,1500` → `FileTree.vue:17,206` → `DirectoryRow.vue:16`/`FileRow.vue:13`)
**Apply to:** `openCommentCounts` (new) and `statusPriorityByDirectoryId` (new, though this one is derived inside `file-tree.ts`'s `model` rather than in `App.vue`, so it drills from `FileTree.vue`'s `model.statusPriorityByDirectoryId` the same way `model.directoryDescendantCounts` already drills to `DirectoryRow.vue`).

### Tree-focus-scoped (not document-level) keydown handler
**Source:** `src/web/components/FileTree.vue:102-128` (`@keydown="handleKeydown"` on the `<ul role="tree">`, not on `document`)
**Apply to:** the new ⌥⌘F branch inside the same `handleKeydown` function — contrast with `App.vue:941-944`'s `document`-level ⌘B/⌘J handler, which is the wrong pattern for ⌥⌘F per UI-SPEC's explicit "while focus is in the tree... does nothing if focus elsewhere" requirement.

### Debounced/on-toggle `persist()` call immediately after mutating a `panelState` ref
**Source:** `src/web/App.vue:365-369` (`toggleSidebar`), `:384-391` (`commitPanelWidth`/`commitPanelHeight`)
**Apply to:** all three new view-option mutation handlers in `App.vue` — mutate ref, call `panelState.persist()`, same two-statement shape.

### Accessible-name composition order (file-type mark → name → comment badge → markers → counts → status letter)
**Source:** `21-UI-SPEC.md` `## Row Anatomy` (verbatim DOM-order contract, reproduced in RESEARCH.md `## Code Examples`)
**Apply to:** `FileRow.vue`'s template restructure — this is a spec-given contract, not derived from existing code, but it must be followed exactly since `tests/e2e/file-tree.spec.ts` locator assertions (per the Locator & Accessible-Name Migration table) depend on the resulting `aria-label`/text-content order.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/web/components/ViewOptionsMenu.vue` | component | event-driven | No anchored (non-modal) popover, no `role="menu"` markup, no outside-click-dismiss listener, and no roving-tabindex-menu pattern exists anywhere in `src/web` today (confirmed by this agent's own `grep`, see `## Gap` above). Closest partial analogs (`ModalDialog.vue` for focus/Esc, `TitleBar.vue` for the trigger button shell) are documented above with their specific reusable pieces and specific gaps. Planner must treat the outside-click listener, the 4-item roving-tabindex loop, and the anchored-CSS positioning as new, hand-built code — not a copy-from-analog task. |

## Metadata

**Analog search scope:** `src/web/model/*.ts`, `src/web/components/*.vue`, `src/web/components/ui/*.vue`, `src/web/components/workbench/*.vue`, `src/web/App.vue`
**Files scanned:** `file-tree.ts` (491 lines, full read), `panel-state.ts` (135 lines, full read), `FileTree.vue` (231 lines, full read), `DirectoryRow.vue`, `FileRow.vue`, `StatusBadge.vue`, `PathDisplay.vue`, `ui/PathText.vue`, `comment-groups.ts` (101 lines, full read), `ui/ModalDialog.vue`, `ui/UiIcon.vue`, `workbench/TitleBar.vue`, `ChangedFilesDialog.vue`, `App.vue` (targeted grep + ranged reads around panel-state wiring, keydown handler, comment computeds, `FileTree`/`ChangedFilesDialog` call sites)
**Pattern extraction date:** 2026-11-05
