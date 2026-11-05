# Phase 21: Changed-Files Tree - Research

**Researched:** 2026-11-05
**Domain:** Vue 3 SFC restyle/extension of an existing client-side tree component (no backend, no new libraries)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary:** Restyle and extend the changed-files tree inside the Phase 20 side bar to VS Code Explorer density: 22px rows, compact folder chains, file-type mark, status-coloured name with right-aligned status letter, comment badges, hover/selected line counts, a header-opened path filter with highlighting, tree ⇄ flat list, a view-options menu, footer totals, and full keyboard operation through one tab stop. Requirements: TREE-01..07.

Not in this phase: comment threads (Phase 23 — the comment badge reads existing draft comment data only), viewed tracking (deferred, DEFER-01), virtualization (deferred), highlight-vs-filter modes (deferred), interactive breadcrumbs (optional, see Deferred).

**Design source:**
- `.kimi-code/skills/sketch-findings-loopnote/references/changed-files-tree.md` and sketch `003-explorer-tree` variant **A**; geometry tokens from Phase 20 (`--file-row-min-height` 22px, `--tree-indent` 12px, flat rows).

**Rows & markers:**
- Status letters: keep R (renamed), C (copied), T (type changed) alongside M/A/D in the same right-aligned 12px mono column; renamed rows expose `old → new` in title and accessible name. Deleted names get line-through; status is never colour-only.
- Remove directory descendant counts (v1.6) — VS Code Explorer style; a collapsed folder shows a dimmed `●` in its contents' status colour.
- Keep the "Changed since last snapshot" refresh marker and the availability markers (unsupported / unavailable / changed-during-capture / standalone git state) as compact muted text badges placed before the counts; their accessible text is unchanged.
- File-type mark: small mono label from a fixed extension map (TS, JS, V, #, M↓, {}, IMG, · fallback), `aria-hidden` (decorative).

**Filter:**
- Opened by a funnel icon in the "Changed files" view header and by ⌥⌘F / Ctrl+Alt+F while focus is in the tree; input renders below the header. The always-visible search box is removed.
- Matching stays case-insensitive substring on the full path; the existing pruning (never rebuilding) model is kept so expansion identity and selection survive clearing; matched substrings are highlighted (`<mark>`).
- Esc clears and closes the filter and returns focus to the tree; filter text is session-only. Enter opens the first match, ↓ moves focus into the tree; empty state "No changed files match "…"."
- "N of M" shows inside the filter input; the footer switches to "N of M files" while filtering.

**View options, list mode & footer:**
- Persist tree/list mode, line-count visibility (always / hover-or-selected (default) / never), and comment-badge toggle in the existing `loopnote.workbench.v1` localStorage key, versioned with the same clamp/parse discipline as Phase 20's `panel-state.ts`.
- Flat list is ordered by full path (same order as the tree) so ⌥↑/⌥↓ file navigation order is identical in both modes.
- View options menu: `role="menu"` with `menuitemradio` for line counts and `menuitemcheckbox` for badges; arrow-key navigation, Esc returns focus to the ⋯ button.
- Footer: "9 files · +64 −17" (and "N of M files" while filtering), not a live region.

### Claude's Discretion
- Whether compact-folder flattening lives in `model/file-tree.ts` or a derived view model, provided roving tabindex (`tabbableRowId`), expansion identity, and filter-pruning guarantees from v1.6 hold, and keyboard navigation treats a compacted chain as one row.
- Component split (`FileRow`/`DirectoryRow` restyle vs. new `TreeRow`), icon additions.

### Deferred Ideas (OUT OF SCOPE)
- Interactive breadcrumbs (reveal folder in tree) — not required by TREE-01..07; leave orientation-only unless trivially supported.
- Tree virtualization, highlight-vs-filter modes, viewed check marks.

### Existing Code Insights (from CONTEXT.md)
- `src/web/model/file-tree.ts` (491 lines): `createFileTreeModel`, `VisibleFileTreeRow`, navigation keys, roving tabindex, filter pruning.
- `src/web/components/FileTree.vue` (filter input, `query`, tree role), `FileRow.vue` (`StatusBadge`, line counts with accessible label, refresh marker, availability marker), `DirectoryRow.vue` (descendant counts to remove), `StatusBadge.vue`, `PathDisplay.vue`/`PathText.vue`.
- Phase 20 side bar + view header + `model/panel-state.ts` persistence.
- Comment counts: `src/web/model/comment-groups.ts` / workspace comments in `App.vue`.
- Established patterns: Teleport host stays `v-show`; single tab stop roving tabindex; real-Chromium keyboard evidence; same-phase locator updates.
- Integration points: `tests/e2e/file-tree.spec.ts`, `tests/unit/file-tree.test.ts`, and any spec asserting "Find file…", directory counts (`collision/.*2 changed files` etc.), or row structure.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TREE-01 | Reviewer sees changed files as a tree with 22px rows, single-child folder chains compacted onto one row, a file-type mark, a status-coloured name, a right-aligned M/A/D letter with line-through for deleted files (status never colour-only), and an open-comment badge. | `## Row Anatomy` + `## Compact Folders & Collapsed Bullet` in `21-UI-SPEC.md` (fully quoted below under Architecture Patterns); `buildFileTree` already compacts chains — no new domain logic needed; `StatusBadge.vue`/`PathDisplay.vue`/`FileRow.vue` restyle patterns documented |
| TREE-02 | Reviewer sees each file's `+N −N` line counts on hover or selection by default. | Existing `.line-counts` CSS pattern (`opacity:0` → `1` on hover/selected/`show-counts`) in `changed-files-tree.md`; governed by new `treeLineCounts` persisted mode |
| TREE-03 | Reviewer can open a path filter from the view header that highlights the matched substring, shows "N of M", supports Enter / ↓ / Esc, and shows an empty state when nothing matches. | Existing `setQuery`/pruning model in `file-tree.ts` is reused unchanged; `<mark>` highlighting pattern and XSS-safe implementation approach documented under Common Pitfalls/Security Domain |
| TREE-04 | Reviewer can switch the changed files between the folder tree and a flat list showing the file name with its dimmed directory. | `PathText.vue`'s existing `basename` prop toggle already renders `path-text__filename`/`path-text__directory` split; new filter-aware expansion-independent flat list function documented as a sibling to existing `flattenVisibleRows` |
| TREE-05 | Reviewer can choose from a view-options menu whether line counts show always, on hover or selection, or never, and whether comment badges show. | `role="menu"`/`menuitemradio`/`menuitemcheckbox` markup from UI-SPEC; persistence via `panel-state.ts` clamp/parse pattern (exact code shown below); no existing anchored-popover component to copy — flagged as a gap under Common Pitfalls |
| TREE-06 | Reviewer sees totals under the tree (file count and `+X −Y`). | `.tree-footer` HTML structure and copy contract documented; computed from `files` prop (existing `additions`/`deletions`, null-as-0 convention already used elsewhere) |
| TREE-07 | Reviewer can operate the tree by keyboard — ↑↓ preview, ←→ fold, Home/End, Enter/Space open — with a single tab stop. | Existing `handleKey`/`tabbableRowId` roving-tabindex model in `file-tree.ts` is unchanged; full Keyboard Map table reproduced below for the new filter/menu/list-mode keys |
</phase_requirements>

## Summary

Phase 21 is a pure client-side Vue 3 restyle/extension of the changed-files tree Phase 20 already re-hosted inside `WorkbenchShell.vue`'s side bar. There are **no new runtime dependencies, no backend changes, and no new domain logic for folder compaction** — `buildFileTree()` (`src/domain/file-tree.ts`) already compacts single-child, no-file folder chains into one `FileTreeDirectory` with multi-segment `segments`; this phase only restyles how that structure renders. The `21-UI-SPEC.md` is exceptionally detailed (approved, checker-signed-off) and specifies exact DOM order, colour-priority tables, ARIA roles, copy strings, and CSS class names — the planner's job is almost entirely translation of that spec into Vue SFC edits, not design derivation.

The real engineering surface is: (1) three small, pure, TDD-eligible model functions added to `src/web/model/file-tree.ts` (status-priority lookup for the collapsed-folder bullet, a filter-aware expansion-independent flat-file list for list mode, and reuse of the existing clamp/parse-reject-to-default pattern for three new `panel-state.ts` fields); (2) a from-scratch `role="menu"` popover component (`ViewOptionsMenu.vue`) for which **no existing anchored-popover-with-outside-click component exists in the codebase to copy** (only `ModalDialog.vue`'s full-viewport backdrop `@click.self` pattern, which doesn't fit a small anchored menu) — this must be hand-rolled with a `document` pointerdown/click listener, scoped correctly to avoid firing on the opening button's own click; and (3) a large, explicit, already-written test-locator migration (the UI-SPEC includes a complete before/after table) that must land in the **same** plan(s) that change the underlying accessible names/roles/markup — this is also an A11Y-03 project rule, not just good practice.

**Primary recommendation:** Treat `21-UI-SPEC.md` as the literal implementation contract (copy its HTML/CSS/ARIA fragments near-verbatim into the Vue SFCs); split work into (a) pure-function TDD plans for the three model additions, (b) a standard-UI plan for the row/header/footer restyle, (c) a standard-UI plan for the new `ViewOptionsMenu.vue` + filter-toggle interaction, and (d) fold the required test-locator rewrites into whichever plan changes each specific accessible name/role — never defer them. Every plan touching `src/web/model` or `src/web/components` must end with the full `npx vitest run --no-file-parallelism tests/unit` gate, not a scoped test file (see Pitfall 1 — this is exactly the regression class that slipped through Phase 20).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tree/list row rendering & restyle (file-type mark, status colour, markers, counts, status letter) | Browser / Client | — | Pure Vue SFC template/CSS over existing `SessionFile`/`FileTreeLeaf` data already in the browser; no new data fetch |
| Compact-folder collapsed-status-priority bullet | Browser / Client | — | New pure function over the already-built `FileTreeDirectory` tree (`src/web/model/file-tree.ts`); no domain/server change |
| Filter (substring match, `<mark>` highlight, pruning) | Browser / Client | — | Reuses existing `setQuery`/pruning model in `file-tree.ts`; highlighting is a pure render-time string-segmentation, not persisted or server-driven |
| Tree ⇄ flat-list toggle & flat-list ordering | Browser / Client | — | New pure projection function over the same in-memory tree; `local storage` only persists the *mode*, not derived data |
| View-options menu (line counts / comment badges) | Browser / Client | — | New `role="menu"` component; state owned by `App.vue` per project's state-owner rule, persisted via `panel-state.ts` |
| View-option & tree/list-mode persistence | Browser / Client (localStorage) | — | Extends `loopnote.workbench.v1`, the existing client-only `localStorage` key; no server-side persistence exists or is needed |
| Comment-badge counts | Browser / Client | — | Derived client-side from `projectCommentGroups(workspaceComments, inventory).open` (`src/web/model/comment-groups.ts`), already computed from data already in `App.vue`; no new API call |
| Keyboard navigation (roving tabindex, arrow keys, menu arrow-keys) | Browser / Client | — | Existing `handleKey`/`tabbableRowId` model unchanged; new keys (⌥⌘F, menu arrows) are additive `keydown` handlers in Vue components |

No capability in this phase touches `Frontend Server (SSR)`, `API / Backend`, `CDN / Static`, or `Database / Storage` — confirmed by reading `src/web/App.vue`'s existing `FileTree`/`ChangedFilesDialog` wiring (no new props sourced from `sessionClient`/`fetch`) and `.claude/CLAUDE.md`'s stack table (Fastify/Zod/Monaco are all untouched by this phase's component list).

## Standard Stack

### Core
No new libraries. This phase reuses the existing project stack exactly as-is:

| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| Vue 3 (Composition API, `<script setup>`) | 3.5.39 (pinned, `package.json`) | All row/header/menu components | Already the project's only UI framework; every sibling component (`FileRow.vue`, `DirectoryRow.vue`, `StatusBadge.vue`) uses this exact pattern |
| `vue-tsc` | 3.3.14 (per `.claude/CLAUDE.md` Decisions, TS 6/7 dual-alias) | `typecheck:web` gate | Project-wide gate (`TYPE-01`), unchanged by this phase |
| Hand-authored CSS tokens (`src/web/styles.css :root`) | n/a | All new colours/spacing | Project convention (`verify:semantic-css` gate forbids new hex values); every colour this phase needs already exists as a token (confirmed against `21-UI-SPEC.md`'s `## Color` section — "No new hex values are introduced") |
| Inline hand-drawn SVG icons (`src/web/components/ui/UiIcon.vue`) | n/a | New `filter`/`list`/`tree`/`collapse-all`/`more`/`comment` glyphs | Existing pattern: `UiIconName` union + `v-else-if` chain of inline `<path>`/`<rect>`/`<circle>` elements at 16×16, `stroke-width:1.5`; no icon library is used anywhere in the project |

### Supporting
None — no new runtime or dev dependency is required by this phase.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `role="menu"` popover | A headless UI library (e.g. Radix Vue, Headless UI Vue) for the dropdown/menu primitive | Rejected: `21-UI-SPEC.md`'s Design System table states "Component library: none (custom components)" and "Tool: none — hand-authored Vue 3 SFCs" explicitly; CONTEXT.md records no library decision; adding one now would contradict the phase's own approved design contract and the project's zero-component-library convention evidenced by every existing overlay (`ModalDialog.vue`) being hand-rolled |
| Manual `<mark>` substring segmentation | A fuzzy-match/highlight library (e.g. `match-sorter`, `highlight-words-core`) | Rejected: the spec requires only case-insensitive substring matching (not fuzzy), the existing filter model already does substring pruning by hand in `file-tree.ts`, and a plain-text segment array avoids any `v-html`/XSS surface entirely (see Security Domain) |

**Installation:** none — no `npm install` step is required for this phase.

**Version verification:** Not applicable — no packages are being added or upgraded.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new npm packages. Confirmed by: `21-UI-SPEC.md`'s Design System table ("Component library: none", "Icon library: ... hand-drawn inline ... SVGs"), `21-CONTEXT.md`'s Decisions (no library choice recorded), and direct inspection of every file this phase touches (`FileTree.vue`, `FileRow.vue`, `DirectoryRow.vue`, `StatusBadge.vue`, `file-tree.ts`, `panel-state.ts`, `App.vue`, `UiIcon.vue`) — none currently import, nor would need to import, a third-party UI/icon/fuzzy-match package to satisfy TREE-01..07.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
User keyboard/mouse
      │
      ▼
┌──────────────────────────── FileTree.vue (restyled) ─────────────────────────────┐
│  view-header toolbar (filter / list⇄tree / collapse-all / view-options buttons)   │
│       │ click/keydown (⌥⌘F scoped to tree focus)                                  │
│       ▼                                                                           │
│  filter row (v-show="filterOpen", local `query` ref — session-only, NOT persisted)│
│       │ setQuery()                                                                │
│       ▼                                                                           │
│  model/file-tree.ts :: FileTreeModel (existing createFileTreeModel/setQuery/      │
│    handleKey/toggleDirectory — UNCHANGED) + NEW: statusPriorityByDirectoryId,     │
│    flatFileRows (filter-aware, expansion-independent)                             │
│       │ visibleRows / projectedTree / flatFileRows                                │
│       ▼                                                                           │
│  root list: role="tree" (tree mode) ──renders──> DirectoryRow.vue / TreeRow.vue   │
│  root list: role="listbox" (list mode) ──renders──> TreeRow.vue (role="option")   │
│       │ uses                                                                      │
│       ▼                                                                           │
│  StatusBadge.vue (restyled: T tone, unsupported raw-code tone, no pill chrome     │
│    inside .tree-row) · PathDisplay.vue/PathText.vue (UNCHANGED markup, basename   │
│    prop drives list-mode dimmed-directory split)                                  │
│       │ comment count prop                                                        │
│       ▲                                                                           │
└───────┼─────────────────────────────────────────────────────────────────────────┘
        │ openCommentCounts: ReadonlyMap<string, number>  (NEW prop, one-way down)
        │
┌───────┴──────────────────────────── App.vue (state owner) ───────────────────────┐
│  openCommentCounts = computed from projectCommentGroups(workspaceComments,        │
│    inventory).open   (comment-groups.ts — EXISTING function, new call site)       │
│                                                                                    │
│  treeViewMode / treeLineCounts / treeCommentBadges  — new refs backed by          │
│  panel-state.ts's createPanelState(), same debounced persist() pattern as         │
│  sidebarWidth/panelHeight (toggleSidebar()/commitSidebarWidth() precedent)        │
└────────────────────────────────────────────────────────────────────────────────────┘
        ▲
        │ role="menu" open/select/close events
        │
┌───────┴──── ViewOptionsMenu.vue (NEW) ─────┐
│  role="menu", menuitemradio × 3 (line       │
│  counts), menuitemcheckbox × 1 (badges)     │
│  — hand-rolled outside-click dismiss        │
│  (document pointerdown listener; NO         │
│  existing anchored-popover component to     │
│  copy — see Pitfall 4)                      │
└──────────────────────────────────────────────┘

No network/API request is triggered anywhere in this diagram. All data (SessionFile[], comment
state) is already resident in App.vue's existing reactive state before this phase begins.
```

### Recommended Project Structure
No new directories. Files touched/added:
```
src/web/
├── App.vue                          # state owner: openCommentCounts, treeViewMode,
│                                     #   treeLineCounts, treeCommentBadges + their persist() wiring
├── model/
│   ├── file-tree.ts                 # + statusPriorityByDirectoryId (or equivalent),
│   │                                 #   + flat-file-row projection (filter-aware, expansion-independent)
│   └── panel-state.ts               # PersistedPanelState + treeViewMode/treeLineCounts/
│                                     #   treeCommentBadges, clamp/parse-reject-to-default
├── components/
│   ├── FileTree.vue                 # view-header toolbar, collapsible filter row, footer totals,
│   │                                 #   role=tree/listbox switch, ⌥⌘F scoped handler
│   ├── DirectoryRow.vue             # remove descendant-count badge; add collapsed `●` bullet
│   ├── FileRow.vue                  # OR new TreeRow.vue (Claude's Discretion) — row anatomy reorder,
│   │                                 #   comment badge, marker restyle, role="option" list-mode variant
│   ├── StatusBadge.vue              # T tone, unsupported raw-status-code tone, drop pill chrome
│   │                                 #   inside .tree-row context only
│   ├── ViewOptionsMenu.vue (NEW)    # role="menu" popover, hand-rolled outside-click dismiss
│   └── ui/UiIcon.vue                # + filter/list/tree/collapse-all/more/comment glyphs
└── styles.css                       # new/adjusted .tree-row, .ft, .cbadge, .deco, .filter,
                                      #   .tree-footer, mark{} classes per changed-files-tree.md CSS
```
`ChangedFilesDialog.vue` and `PathDisplay.vue`/`PathText.vue` are **not** modified — they reuse `FileTree.vue` unchanged (see Pitfall 3 for a narrow-viewport integration detail that still needs attention).

### Pattern 1: Pure status-priority lookup, sibling to the existing descendant-count collector
**What:** A new function in `src/web/model/file-tree.ts`, structurally parallel to the existing `countDirectoryDescendants`, that walks the tree once and records each directory's highest-priority descendant status (for the collapsed `●` bullet colour) instead of a count.
**When to use:** Computed once per `createFileTreeModel()` call (or per `files` prop change), exposed on `FileTreeModel` alongside `directoryDescendantCounts` — this is **additive**, not a replacement (the UI-SPEC and CONTEXT.md both state `directoryDescendantCounts` stays for internal plumbing; only its UI-facing badge is removed).
**Priority order (exact, from `21-UI-SPEC.md` `## Compact Folders & Collapsed Bullet`, highest wins):**
`modified` → `deleted` → `added` → `renamed`/`copied` → `type-changed` → `unsupported`.
**Example — existing pattern to mirror** (`src/web/model/file-tree.ts:99-114`, verbatim, current source):
```typescript
// Source: src/web/model/file-tree.ts (existing, verbatim) — structural template
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
A `collectDirectoryStatusPriority(nodes, priorities: Map<string, ChangedFileStatusKind>)` function follows the identical recursive shape, but instead of summing counts it reduces each directory's own files' `status.kind` plus every child directory's already-resolved priority status through the fixed priority order above, and records the winner per `directoryId`. This is a pure function over already-in-memory data — fully unit-testable without any DOM, matching the "model logic" TDD-eligible category named in the phase's additional context.

### Pattern 2: Filter-aware, expansion-independent flat-file list (list mode)
**What:** A second new function/computed in `file-tree.ts` that returns every filter-surviving `FileTreeLeaf` in depth-first, directory-alphabetical-then-file-alphabetical order — **the same order the tree already produces** — but walks the (already filter-pruned) `projectedTree` *without* consulting `expandedDirectoryIds` at all (folders don't exist in list mode, so a collapsed folder in tree mode must not hide its files here).
**When to use:** List mode (`treeViewMode === 'list'`) rendering and its Home/End/↑↓ navigation; per CONTEXT.md this must share exact file order with tree mode so ⌥↑/⌥↓ file navigation is identical in both modes.
**Example — derive from the existing `flattenVisibleRows`, but drop the `expanded` gate** (`src/web/model/file-tree.ts:116-144`, verbatim, current source, annotated):
```typescript
// Source: src/web/model/file-tree.ts (existing, verbatim) — note the `expanded.has(...)` gate
// at line 129 that a flat-list sibling function must NOT have.
function flattenVisibleRows(
  nodes: readonly FileTreeNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  output: VisibleFileTreeRow[],
): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      output.push(Object.freeze({ ...node, rowId: directoryRowId(node.directoryId), depth }));
      if (expanded.has(node.directoryId)) {          // <-- this gate is what list mode must skip
        flattenVisibleRows(node.children, expanded, depth + 1, output);
      }
    } else {
      output.push(Object.freeze({ ...node, rowId: fileRowId(node.fileId), depth }));
    }
  }
}
```
The flat-list function operates on `projectedTree` (the filter-pruned tree, via the existing `pruneTree`, `src/web/model/file-tree.ts:146-168` — already unchanged/reused per CONTEXT.md's "existing pruning (never rebuilding) model is kept"), recurses into every directory unconditionally, and only pushes `FileTreeLeaf` nodes to the output — directories are never emitted. This guarantees depth-first/alphabetical order identical to tree mode's visible-row order while being completely independent of `expandedDirectoryIds`.

### Pattern 3: `localStorage` field addition with clamp/parse-reject-to-default discipline
**What:** `PersistedPanelState` gains three fields; each is validated and defaulted **independently** so one corrupt field never rejects the whole parsed object — exactly `panel-state.ts`'s existing per-field discipline.
**Example — existing pattern to mirror** (`src/web/model/panel-state.ts:65-93`, verbatim, current source):
```typescript
// Source: src/web/model/panel-state.ts (existing, verbatim) — exact per-field
// typeof-guard-else-default pattern the three new fields must replicate.
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
For the three new fields (per `21-UI-SPEC.md` `## Persistence`): `treeViewMode` — `typeof === 'string' && (value === 'tree' || value === 'list')`, else default `'tree'`; `treeLineCounts` — `typeof === 'string' && ['always','hover','never'].includes(value)`, else default `'hover'`; `treeCommentBadges` — `typeof === 'boolean'`, else default `true`. `createPanelState()` (`panel-state.ts:114-135`) gains three more `shallowRef`s and three more fields in `persist()`'s `JSON.stringify(persisted)` object, mirroring `sidebarWidth`/`sidebarVisible`/`panelHeight` exactly.

### Pattern 4: `App.vue` as state owner — wiring new view-option state through props/events (project architecture rule, confirmed)
**What:** `App.vue` is confirmed (via `toggleSidebar()`, `commitSidebarWidth()`, `commitPanelHeight()` at `src/web/App.vue:364-391`) as the sole owner of `panelState` (created once via `createPanelState()`), passing `.value` reads down as props (`:sidebar-visible="panelState.sidebarVisible.value"`) and receiving `@update:sidebar-width`/toggle events back up, always calling `panelState.persist()` immediately after mutating a ref. The three new fields follow this identical shape: `App.vue` holds `panelState.treeViewMode`/`treeLineCounts`/`treeCommentBadges` refs, passes them as props into `FileTree.vue` (e.g. `:view-mode="panelState.treeViewMode.value"`), and `FileTree.vue` emits change events (e.g. `@update:view-mode`) that `App.vue` handlers write back through `panelState.<field>.value = ...; panelState.persist();` — never let `FileTree.vue` or `ViewOptionsMenu.vue` own persisted state directly.
**Comment counts follow the same one-way-down shape:** `App.vue:298` already computes `openCommentCount` (a single number, for the status bar) from `workspaceComments`; the new `openCommentCounts` (a `ReadonlyMap<string, number>` keyed by file path, for per-row badges) is a new `computed` calling the existing `projectCommentGroups(comments, inventory).open` (`src/web/model/comment-groups.ts:93-101`) and reducing its `CommentGroup[]` into a per-path open-count map, passed to `FileTree.vue` exactly like the existing `recentlyChangedPaths` prop (`App.vue:1500`, `:recently-changed-paths="recentlyChangedPaths"`).

### Pattern 5: `<mark>` highlighting without `v-html` (XSS-safe by construction)
**What:** TREE-03 requires highlighting the matched substring inside a file/folder name with a real `<mark>` element. The safe implementation is **not** `v-html` string concatenation (`name.replace(query, '<mark>$&</mark>')` then `v-html`) — that is an XSS vector if a git path ever contains `<`/`>`/`&` characters (plausible: standalone sessions review arbitrary local repositories, including ones the reviewer doesn't control, e.g. a cloned third-party repo with an adversarial filename). The project's existing `v-html` usages (`RenderedMarkdownView.vue`, `SummarySection.vue`) both go through `markdown-it` with `html:false` or its own escaping — there is **no** precedent for raw string-to-`v-html` splicing anywhere in `src/web`.
**Recommended pattern:** compute a `computed` array of `{ text: string; matched: boolean }` segments by splitting the display name on the case-insensitive query match positions, then render with a plain `v-for`:
```html
<!-- Illustrative — not copied from an existing file; matches Vue's standard safe-interpolation idiom -->
<span class="name">
  <template v-for="(segment, i) in nameSegments" :key="i">
    <mark v-if="segment.matched">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</span>
```
Because `{{ }}` interpolation is always HTML-escaped by Vue, this renders the literal filename text safely regardless of its contents, with zero `v-html` surface. This computed segmentation (string → segment array) is itself a small pure function and a reasonable TDD-eligible candidate (empty query → single unmatched segment; case-insensitive match; multiple non-overlapping matches).

### Anti-Patterns to Avoid
- **Rebuilding the tree on every filter keystroke:** CONTEXT.md explicitly preserves "the existing pruning (never rebuilding) model" — `pruneTree` (`file-tree.ts:146-168`) already does this correctly; do not introduce a new filter implementation that reconstructs `FileTreeDirectory` nodes from scratch, which would break expansion-identity and selection survival across filter changes.
- **New hex colours or new font sizes:** `21-UI-SPEC.md`'s `## Color` and `## Typography` sections explicitly state zero new hex values and zero new sizes/weights beyond the existing 13/12/11px, 400/600 scale — any plan introducing a new CSS custom property value (vs. reusing an existing token) fails `verify:semantic-css`.
- **A second control for tree/list mode:** the Phase 20 UI-REVIEW lesson (explicitly carried into this UI-SPEC) is "never ship two differently-labelled controls for one piece of state" — exactly the bug that produced Phase 20's duplicate side-bar toggle. The list⇄tree icon button in the view-header must be the **only** control for `treeViewMode`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Substring highlighting with raw HTML | `name.replace(q, '<mark>$&</mark>')` + `v-html` | Computed `{text, matched}` segment array rendered via `v-for` + `{{ }}` (Pattern 5 above) | Avoids XSS entirely; Vue's own escaping already does the safe-rendering work; the project has zero precedent for raw-string-to-`v-html` splicing |
| Folder-chain compaction | A new tree-walking "collapse single-child folders" algorithm | `buildFileTree()` (`src/domain/file-tree.ts`), already does this via `FileTreeDirectory.segments` — confirmed existing, unchanged, by direct read of the function and by `21-UI-SPEC.md`'s explicit note: "TREE-01's 'compact folder chains' requirement needs no new domain logic, only the restyle" | Domain logic is already correct and tested (per `tests/unit/file-tree.test.ts`'s compaction test, unaffected by this phase) |
| Keyboard roving-tabindex / arrow-key tree navigation | A new keyboard-handling library or a rewritten `handleKey` | Existing `handleKey`/`tabbableRowId`/`focusRow` model in `file-tree.ts` (`FileTreeModel` interface, `file-tree.ts:33-51`) — unchanged for tree-mode keys; only list-mode's ←/→ no-op and the menu's own arrow-key handling are additive | TREE-07's existing keyboard contract is explicitly "unchanged" per the UI-SPEC's locator-migration table; re-deriving it risks regressing a working, already-tested system |
| Outside-click dismiss for the new popover | A generic "useClickOutside" composable invented from scratch without checking precedent first | A small, explicit `document.addEventListener('pointerdown', handler, true)` listener added/removed in `onMounted`/`onUnmounted` (or a `watch` on the menu's `open` prop), checking `!menuEl.value?.contains(event.target)` | No existing composable or anchored-popover component exists to extract a shared helper from (see Pitfall 4) — writing one from scratch inline in `ViewOptionsMenu.vue` is correct scope for this phase; do not invent a generic composable abstraction speculatively for future reuse |

**Key insight:** Every "hard" piece of this phase (compaction, keyboard nav, filter pruning) is **already built and working** from Phase 20/pre-20 work. The actual new work is small, pure, and local: three model functions, one new component, and a restyle. Resist the temptation to re-architect `file-tree.ts` — the UI-SPEC and CONTEXT.md both explicitly preserve the existing model's guarantees.

## Common Pitfalls

### Pitfall 1: Unit-test regressions from scoped-file verification (Phase 20's actual, named failure)
**What goes wrong:** A plan edits `src/web/model/*.ts` or `src/web/components/*.vue`, runs only the test file it believes is affected (e.g. `npx vitest run tests/unit/file-tree.test.ts`), sees it pass, and ships — while a *different*, seemingly-unrelated unit test file silently breaks because it held a stale call-shape/assertion against the changed production code.
**Why it happens (concrete precedent, this exact project, this exact milestone):** In Phase 20, `tests/unit/monaco-diff-adapter.test.ts`'s `PublicMonacoSinglePaneAdapter` describe blocks called `createMonacoSinglePaneAdapter(host, languageForPath, onChange, side)` with 4 arguments; Phase 20-02 added a required 5th (`navigate`) parameter and updated every real call site in `DiffWorkspace.vue` correctly — but the 18 test call sites were never updated, because the plan/verification that landed that change ran a scoped test file, not the full suite. 7/26 tests in that file silently broke and were only caught in a later post-review audit (`20-VERIFICATION.md` "Post-review fixes" §1). The production code was correct; only the test was stale — but it still shipped broken for a full review cycle.
**How to avoid:** Every plan in this phase that touches `src/web/model/file-tree.ts`, `src/web/model/panel-state.ts`, `src/web/model/comment-groups.ts`, `src/web/components/FileTree.vue`, `src/web/components/FileRow.vue`, `src/web/components/DirectoryRow.vue`, `src/web/components/StatusBadge.vue`, `src/web/components/PathDisplay.vue`, or `src/web/components/ui/PathText.vue` MUST end with an explicit, full-suite gate — `npx vitest run --no-file-parallelism tests/unit` (not a single test file, not `tests/unit/file-tree.test.ts` alone) — as the final verification step, in addition to any scoped test the plan was specifically targeting. This phase is especially exposed: `StatusBadge.vue`'s tone/label changes and `PathDisplay.vue`'s reuse touch shared leaf components consumed by both `FileTree.vue` and `ChangedFilesDialog.vue`'s Teleport-hosted instance, so a break could surface in a completely different spec file than the one being edited.
**Warning signs:** A plan's verification section lists only one `.test.ts` file; a plan changes a function's parameter list, return shape, or a component's prop/emit contract without grepping for every call site first.

### Pitfall 2: Required test-locator migration must land in the SAME plan as the markup/ARIA change (A11Y-03)
**What goes wrong:** Accessible-name/role changes ship in one plan; the Playwright/unit locators that key off the old strings are "fixed later," leaving the test suite red (or worse, silently matching nothing and passing vacuously) between plans.
**Why it happens:** This phase changes an unusually large number of accessible names and roles at once: `aria-label="Files"` → `"Changed files"` (nav, tree/listbox); the `<h2 id="changed-files-heading">` heading element is **removed entirely**; the directory-row accessible name loses its `"{N} changed files"` suffix (TREE-01's own "remove directory descendant counts" decision, which directly breaks the existing `collision/.*2 changed files` and `kept/.*2 changed files` locator patterns confirmed live in `tests/e2e/file-tree.spec.ts:436,539,656` and `tests/unit/file-tree.test.ts:719`); row accessible-name *word order* changes (status label moves from first to last: `"Modified ... tracked.txt"` → `"tracked.txt ... modified"`); the searchbox's accessible name and default visibility both change (`"Filter files"` → `"Filter changed files"`, and it is no longer always-rendered); the empty-state structure collapses from a heading+body+button to one line of text.
**How to avoid:** `21-UI-SPEC.md`'s `## Locator & Accessible-Name Migration` section (lines ~318-350, reproduced in full below in Code Examples) is an already-complete before/after table — the planner should assign each row to the exact plan that makes that specific markup/ARIA change, and that plan's task list must include the locator edit as a listed action, not a follow-up. `model.directoryDescendantCounts` itself (the data structure) is **not** removed — only the UI-facing badge/label — so `tests/unit/file-tree.test.ts`'s `directoryDescendantCounts.get(...) === 1` assertions (line 719) stay correct unmodified; only the *e2e* accessible-name assertions referencing `"{N} changed files"` need the locator rewrite.
**Warning signs:** A plan's `files_modified` includes a `.vue` template change to a role/aria-label/heading but excludes any file under `tests/`.

### Pitfall 3: `ChangedFilesDialog.vue`'s narrow-viewport initial-focus-selector targets a DOM id that no longer exists by default
**What goes wrong:** `ChangedFilesDialog.vue` (the narrow-viewport `<760px` drawer that Teleport-hosts the same `FileTree.vue`) passes `initial-focus-selector="#file-tree-filter"` to `ModalDialog.vue`, so opening the drawer on a narrow viewport currently auto-focuses the always-visible search input. This phase removes the always-visible filter box (`id="file-tree-filter"` only exists in the DOM while `filterOpen` is true, opened via the funnel button or ⌥⌘F) — so `document.querySelector('#file-tree-filter')` will return `null` on narrow-viewport dialog open in the common case.
**Why it happens:** `ModalDialog.vue`'s `focusInitial()` (`ui/ModalDialog.vue:35-42`) already gracefully falls back to its own close button when the selector matches nothing (`(initial ?? closeButton.value)?.focus()`), so this is **not a crash** — but it is a silent behavior change (narrow-drawer open now focuses "Close files" instead of the filter input) that no existing test currently asserts on (confirmed: grep for `file-tree-filter`/`initial-focus-selector`/`initialFocusSelector` across `tests/` returns zero matches), so it will ship unnoticed unless a plan explicitly decides and documents the new intended initial-focus target for the narrow drawer.
**How to avoid:** The plan touching `FileTree.vue`'s filter toggle should also decide (and, if changed, update) `ChangedFilesDialog.vue`'s `initial-focus-selector` — e.g. point it at the tree's own roving-tabindex row, or leave it as a deliberate fallback-to-close-button and note that decision in the plan's summary, rather than leaving it as inert dead configuration that silently stopped doing what its name implies.

### Pitfall 4: No existing anchored-popover-with-outside-click component to reuse for `ViewOptionsMenu.vue`
**What goes wrong:** `21-UI-SPEC.md`'s `## View Options Menu` section instructs: "Clicking outside the menu closes it (reuse the existing outside-click-dismiss pattern already used by popovers in the codebase)" — but a direct search of `src/web` for `addEventListener('click'|'mousedown'|'pointerdown', ...)` outside-dismiss patterns and for `role="menu"` found **no existing anchored (non-modal) popover component**. The only overlay-dismiss pattern in the codebase is `ModalDialog.vue`'s full-viewport backdrop (`<div class="modal-dialog-backdrop" @click.self="dismiss">`), which works because a modal renders a backdrop covering the whole viewport — unsuitable for a small menu anchored under a 22×22px `⋯` button, which should not dim/block the rest of the UI.
**Why it happens:** `IDENT-02`'s details popover (Phase 22, not yet built) was presumably the intended precedent, but it doesn't exist yet at Phase 21's point in the roadmap (Phase 22 depends on Phase 20, runs after/alongside Phase 21, not before).
**How to avoid:** The plan building `ViewOptionsMenu.vue` must hand-roll the outside-click dismiss directly (a `document`-level `pointerdown` listener registered while the menu is open, checking `event.target` against the menu root and the opening `⋯` button via `.contains()`, removed on close/unmount) — this is correct, scoped, non-speculative new code for this phase, not a missing library gap. Do not block on finding a reusable pattern that doesn't exist; do not introduce a generic composable for "future" popovers (Phase 22's identity pill popover) since that popover isn't specified yet and YAGNI applies.

### Pitfall 5: Five-session-kind matrix — rows must render correctly for every kind, not just the common case
**What goes wrong:** A restyle plan is implemented and tested only against the common "committed session, text file, modified status" row, missing that the tree must also render correctly for: exact-patch sessions (cannot refresh — the refresh marker and its "Changed since last snapshot" label logic must not assume refresh is always possible), standalone sessions (extra `standalone-state-marker` git-state badges — `"Standalone · Modified (uncommitted)"` / `"Untracked"` / `"Unchanged"` — which stack with the refresh/availability markers in the same "markers" slot and must still render in the correct left-to-right order per `## Row Anatomy`'s `[markers]*` position), and unsupported/unavailable files (binary/non-utf8/oversized — availability-driven muted name colour per the `## Row Anatomy` colour-priority table's rule 1, which takes priority over the file's own git status colour).
**Why it happens:** `FileRow.vue`'s existing `standaloneStateLabel`/`availabilityLabel` computeds (lines 29-48, current source) already branch on all these cases correctly today — the risk is the *restyle* (new DOM order, new CSS classes) accidentally drops or mis-orders one marker type while a developer is focused on the modified/added/deleted common-case visual, since those are the markers most visible in a quick manual check.
**How to avoid:** Any plan restyling `FileRow.vue`/`TreeRow.vue` must explicitly verify (via existing e2e fixtures — `tests/e2e/file-tree.spec.ts` already has standalone/unsupported/unavailable scenario coverage per the locator-migration table's `unsupportedRow` references) that the refresh marker, standalone marker, and availability marker all still render in the markers-before-counts position for every session kind, not just the default committed/text case, and that the row's name colour correctly follows the stated priority order (availability beats status).

## Code Examples

### Row Anatomy DOM order (verbatim contract, `21-UI-SPEC.md`)
```
[file-type mark, aria-hidden] [name] [comment badge]? [markers]* [line counts] [status letter]
```
This order is also the accessible-name composition order (file-type mark contributes nothing, being `aria-hidden`).

### File-type mark extension map (verbatim table, `21-UI-SPEC.md`)
```
.ts, .tsx                          -> "TS"  (--syntax-type-foreground)
.js, .jsx, .mjs, .cjs              -> "JS"  (--syntax-type-foreground)
.vue                               -> "V"   (--status-added-foreground)
.css, .scss, .less                 -> "#"   (--status-resolved-foreground)
.md, .markdown                     -> "M↓"  (--text-muted)
.json, .jsonc, .json5              -> "{}"  (--text-muted)
.png/.jpg/.jpeg/.gif/.svg/.webp/.ico/.bmp -> "IMG" (--status-warning-foreground)
anything else (incl. no extension) -> "·"   (--text-muted)
```

### Name colour priority (verbatim, highest wins, `21-UI-SPEC.md`)
```
1. availability.kind !== 'text'          -> --text-muted
2. else status.kind === 'deleted'        -> --status-deleted-foreground + line-through
3. else status.kind === 'modified'       -> --status-modified-foreground
4. else status.kind === 'added'          -> --status-added-foreground
5. else status.kind === 'unsupported'    -> --text-muted
6. else (renamed/copied/type-changed)    -> --text-primary (status letter alone carries distinction)
```

### Status letter table (verbatim, `21-UI-SPEC.md`)
```
modified      -> M  (--status-modified-foreground)   label "modified"
added         -> A  (--status-added-foreground)       label "added"
deleted       -> D  (--status-deleted-foreground)     label "deleted"
renamed       -> R  (--status-resolved-foreground)    label "renamed"
copied        -> C  (--status-resolved-foreground)    label "copied"
type-changed  -> T  (--status-modified-foreground)    label "type changed"
unsupported   -> raw status.code (--status-warning-foreground)  label "unsupported status: {code}"
```

### Collapsed-folder bullet status priority (verbatim, `21-UI-SPEC.md`)
```
Priority (highest wins): modified -> deleted -> added -> renamed/copied -> type-changed -> unsupported
```

### CSS patterns (verbatim, `.kimi-code/skills/sketch-findings-loopnote/references/changed-files-tree.md`)
```css
.row{height:22px;display:flex;align-items:center;gap:5px;padding-right:10px;cursor:pointer;white-space:nowrap;
  color:var(--text-primary);position:relative;border:1px solid transparent;user-select:none;min-width:0}
.row:hover{background:var(--surface-hover)}
.row.selected{background:var(--selection-background)}
.list:focus-within .row.selected{border-color:var(--focus-ring)}
/* indentation: padding-left = 8px + depth * var(--tree-indent) (+16px for files, aligning with folder names) */

.twistie{width:16px;display:grid;place-items:center;color:var(--text-muted);flex:none}
.ft{font:700 8.5px/1 var(--font-mono);width:20px;text-align:center;flex:none}
.name{overflow:hidden;text-overflow:ellipsis;min-width:0}
.row.f-M .name{color:var(--status-modified-foreground)}
.row.f-A .name{color:var(--status-added-foreground)}
.row.f-D .name{color:var(--status-deleted-foreground);text-decoration:line-through}

.cbadge{display:inline-flex;align-items:center;gap:2px;color:var(--interactive-accent);font-size:11px;flex:none;margin-left:auto}
.counts{font:11px var(--font-mono);flex:none;margin-left:auto;display:flex;gap:6px;opacity:0;transition:opacity .12s}
.row:hover .counts,.row.selected .counts,.list.show-counts .row .counts{opacity:1}
.cbadge+.counts,.cbadge+.deco{margin-left:8px}
.counts+.deco{margin-left:6px}
.deco{margin-left:auto;font:600 11px/1 var(--font-mono);flex:none;width:12px;text-align:center}

.filter{display:flex;align-items:center;gap:4px;margin:0 8px 6px 12px;height:24px;padding:0 4px 0 6px;
  border:1px solid var(--border-control);border-radius:var(--radius-control);background:var(--surface-canvas)}
.filter:focus-within{border-color:var(--focus-ring)}
mark{background:rgb(210 153 34 / 35%);color:inherit;border-radius:2px}
```
**Note:** `21-UI-SPEC.md`'s `## Typography` section overrides the sketch's literal `8.5px` for `.ft` (file-type mark) to the existing `--font-size-label` (11px) token — use 11px, not 8.5px, per the approved UI-SPEC, not the raw sketch CSS.

### HTML structures (verbatim, `.kimi-code/skills/sketch-findings-loopnote/references/changed-files-tree.md`)
```html
<div class="view-header"><span>Changed files</span>
  <span class="actions" role="toolbar" aria-label="Changed files actions">
    <button class="icon-btn" aria-label="Filter changed files">…</button>
    <button class="icon-btn" aria-label="View as list">…</button>
    <button class="icon-btn" aria-label="Collapse all">…</button>
    <button class="icon-btn" aria-label="View options" aria-haspopup="menu">…</button>
  </span></div>
<div class="filter" hidden><svg class="i">…search…</svg><input aria-label="Filter changed files" placeholder="Filter by path"><span class="n">5 of 9</span><button class="icon-btn" aria-label="Clear filter">…</button></div>
<div class="list" role="tree" aria-label="Changed files" tabindex="0">
  <div class="row folder" role="treeitem" aria-expanded="true" aria-level="1" style="padding-left:8px">
    <span class="twistie">…</span><span class="name">src/server</span></div>
  <div class="row file f-M selected" role="treeitem" aria-level="2" aria-selected="true" title="src/server/support-client.ts" style="padding-left:36px">
    <span class="ft ts">TS</span><span class="name">support-client.ts</span>
    <span class="cbadge" title="1 open comment">…1</span>
    <span class="counts"><span class="lc-plus">+13</span><span class="lc-minus">−8</span></span>
    <span class="deco M" aria-label="modified">M</span></div>
</div>
<div class="tree-footer">9 files · +64 −17 · 1 viewed</div>
```
**Note:** the `… 1 viewed` footer segment and the `role="tree"`-only (no `listbox` mode) are from the raw sketch; this phase's approved `21-UI-SPEC.md` drops "viewed" (deferred, DEFER-01) and adds the `role="listbox"`/list-mode variant — treat the UI-SPEC as the override where it differs from this raw sketch HTML.

### View-options menu markup (verbatim, `21-UI-SPEC.md`)
```html
<div role="menu" aria-label="View options">
  <div role="group" aria-label="Line counts">
    <div role="menuitemradio" aria-checked="false" tabindex="-1">Always</div>
    <div role="menuitemradio" aria-checked="true"  tabindex="0">On hover or selection</div>
    <div role="menuitemradio" aria-checked="false" tabindex="-1">Never</div>
  </div>
  <div role="menuitemcheckbox" aria-checked="true" tabindex="-1">Open comment badges</div>
</div>
```

### Filter row markup (verbatim, `21-UI-SPEC.md`)
```html
<div class="filter" v-show="filterOpen">
  <input
    type="search"
    aria-label="Filter changed files"
    placeholder="Filter by path"
    v-model="query"
  />
  <span class="n" v-if="query">{{ matchCount }} of {{ totalCount }}</span>
  <button type="button" aria-label="Clear filter" @click="clear">…</button>
</div>
```

### Keyboard Map (verbatim, `21-UI-SPEC.md` `## Keyboard Map (TREE-07)`)
| Key | Action | Status |
|---|---|---|
| ↑ / ↓ | Move focus one row, preview (select) the landed file | unchanged (existing `handleKey`) |
| ← | Collapse focused folder, or move focus to its parent if already collapsed | unchanged |
| → | Expand focused folder, or move focus to its first child if already expanded | unchanged |
| Home / End | Focus first / last visible row | unchanged |
| Enter / Space | Open focused file, or toggle focused folder | unchanged |
| ⌥⌘F / Ctrl+Alt+F | Open the path filter (focus moves to the filter input) | new, tree-focus-scoped |
| Esc (filter focused) | Clear filter, close filter row, focus returns to the tree | changed (previously refocused the filter input) |
| Enter (filter focused) | Open the first visible match | new |
| ↓ (filter focused) | Move focus into the tree (first visible row), filter stays open | new |
| ↑ / ↓ (view-options menu open) | Move focus among menu items, wrapping | new |
| Enter / Space (view-options menu open) | Activate the focused radio/checkbox item | new |
| Esc (view-options menu open) | Close the menu, focus returns to the ⋯ button | new |
| ← / → (list mode) | No-op (no folders) | new |

Platform: Windows/Linux use Ctrl in place of ⌘ throughout (unchanged project convention).

### Required test-locator migration table (verbatim, `21-UI-SPEC.md` `## Locator & Accessible-Name Migration`)
| Today (v1.6) | Becomes (Phase 21) | Reason |
|---|---|---|
| `page.getByRole('navigation', { name: 'Files' })` | `page.getByRole('navigation', { name: 'Changed files' })` | view-header label text change |
| `navigation.getByRole('tree', { name: 'Files' })` | `navigation.getByRole('tree', { name: 'Changed files' })` (tree mode) / `navigation.getByRole('listbox', { name: 'Changed files' })` (list mode) | `aria-label` change; dual role by mode |
| `navigation.getByRole('heading', { name: /^Files \(\d+\)$/ })` | **removed** — no heading element. Assert the footer text instead, e.g. `navigation.getByText(/^\d+ files? · \+\d+ −\d+$/)` | heading replaced by non-heading view-header label + footer totals |
| `tree.getByRole('treeitem', { name: /Modified.*tracked\.txt.*\d+ additions?.*1 deletion.*Text/i })` | `tree.getByRole('treeitem', { name: /tracked\.txt.*Text.*\d+ additions?.*1 deletion.*modified/i })` | status label moves from first to last; label text is lower-case |
| `tree.getByRole('treeitem', { name: /Added.*binary\.dat.*Line counts unavailable.*Unsupported/i })` | `tree.getByRole('treeitem', { name: /binary\.dat.*Unsupported.*Line counts unavailable.*added/i })` | marker now precedes counts; status label moves to the end |
| `unsupportedRow.getByText('Unsupported', { exact: true })` | unchanged — marker text/exact string unchanged, only position/chrome move | marker text contract preserved |
| `tree.getByRole('treeitem', { name: /Renamed.*renamed from .* to .*Text/i })` / `/Copied.*copied from .* to .*Text/i` | `/renamed from .* to .*Text.*renamed/i` / `/copied from .* to .*Text.*copied/i` | status label moves to the end |
| `tree.getByRole('treeitem', { name: /collision\/.*2 changed files/i })` (and every `{dir}/.*{N} changed files?` assertion) | **removed** — assert `tree.getByRole('treeitem', { name: /^collision\/?$/ })`; assert the collapsed bullet via CSS/data locator (it is `aria-hidden`) | TREE-01 removes the descendant-count badge |
| `navigation.getByRole('searchbox', { name: 'Filter files' })` | `navigation.getByRole('searchbox', { name: 'Filter changed files' })`, only interactable after opening the filter | `aria-label` change; filter no longer always-visible |
| `navigation.getByRole('heading', { name: 'No matching files' })` + body text + Clear-filter button | `navigation.getByText('No changed files match "{query}".')` — single line, no separate heading/body/button | empty state copy + structure change |
| `navigation.getByRole('button', { name: 'Clear file filter' })` | `navigation.getByRole('button', { name: 'Clear filter' })` | aria-label rename |
| `navigation.locator('.file-tree-pane__filter-glyph')` | **removed** — no persistent search glyph | always-visible search box removed |
| `.locator('[role="treeitem"] .path-display .path-text__filename')` | unchanged — `PathDisplay`/`PathText` reused as-is | no change to this component |
| any `#file-tree-select-count` / `data-row-id` / `data-file-id` / keyboard-navigation assertions | unchanged — underlying navigation model is reused as-is in tree mode | TREE-07's tree-mode keyboard contract is unchanged; only new filter/menu keys are additive |
| *(new)* | Filter open: `navigation.getByRole('button', { name: /Filter changed files/ })` | new control |
| *(new)* | List⇄tree toggle: `navigation.getByRole('button', { name: /View as (list\|tree)/ })` | new control |
| *(new)* | Collapse all: `navigation.getByRole('button', { name: 'Collapse all' })` | new control |
| *(new)* | View options: `navigation.getByRole('button', { name: 'View options' })`, menu: `page.getByRole('menu', { name: 'View options' })`, items via `menuitemradio`/`menuitemcheckbox` | new control |
| *(new)* | Comment badge: `row.getByLabel(/\d+ open comments?/)` | new control |

`tests/unit/file-tree.test.ts`'s `directoryDescendantCounts` assertions (e.g. line 719, `model.directoryDescendantCounts.get(...) === 1`) are **not** affected — that internal model field persists; only the UI-facing accessible-name badge is removed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in this phase — client-side UI only, bound to `127.0.0.1` per project constraints (unchanged) |
| V3 Session Management | no | No session handling touched |
| V4 Access Control | no | No access-control logic in a tree restyle |
| V5 Input Validation | yes | `treeViewMode`/`treeLineCounts`/`treeCommentBadges` parsed from `localStorage` via the existing `parsePanelState`-style clamp/parse-reject-to-default pattern (Pattern 3 above) — every field independently typeof/enum-validated with a safe default, never trusting the stored JSON shape. The filter `query` string is user input rendered into the DOM; it must never reach `v-html` (Pattern 5) |
| V6 Cryptography | no | No cryptographic operation in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reflected DOM-based XSS via file path/folder name rendered with a highlighted substring | Tampering (of rendered DOM) | Render `<mark>`-wrapped segments via Vue's auto-escaping `v-for`/`{{ }}` text interpolation (Pattern 5), never `v-html` string concatenation with user/git-controlled path text. Git paths are not fully trusted input — a standalone session can review an arbitrary local repository (including a cloned third-party one) whose filenames are not under the reviewer's control |
| `localStorage` tampering/corruption (a user or another script on the same origin writes an invalid `loopnote.workbench.v1` value) | Tampering | Already-established per-field clamp/parse-reject-to-default discipline (Pattern 3); extend it field-by-field for the three new keys rather than trusting the parsed JSON shape wholesale. No new attack surface beyond what Phase 20 already accepted and mitigated for `sidebarWidth`/`sidebarVisible`/`panelHeight` |
| Clickjacking / focus-stealing via the new `role="menu"` popover | Spoofing | Out of scope at ASVS L1 for a same-origin, no-auth, localhost-only desktop review tool (per `.claude/CLAUDE.md`'s "Fastify bound only to 127.0.0.1 ... no LAN service is exposed" constraint); no additional control needed beyond standard focus-trap/Esc-to-close already specified in the UI-SPEC |

No `V5 Input Validation`-relevant server-side change exists in this phase (confirmed: no new Fastify route, no new Zod schema, no new API payload) — the only "input validation" surface is the two purely client-side localStorage/filter-string cases above.

## Sources

### Primary (HIGH confidence — read directly from the repository this session)
- `.planning/phases/21-changed-files-tree/21-CONTEXT.md` — locked decisions, discretion areas, deferred scope
- `.planning/phases/21-changed-files-tree/21-UI-SPEC.md` — approved, checker-signed-off UI design contract (391 lines, read in full)
- `.planning/REQUIREMENTS.md` — TREE-01..07 canonical requirement text
- `.planning/ROADMAP.md` — Phase 21 goal/success criteria/dependency on Phase 20
- `.planning/STATE.md` — project decision log, current phase position
- `.planning/config.json` — `nyquist_validation: false`, `security_enforcement: true`/`security_asvs_level: 1`/`security_block_on: "high"`, `tdd_mode: true`
- `.claude/CLAUDE.md` — project stack/constraints, no changes relevant to this phase
- `.kimi-code/skills/sketch-findings-loopnote/SKILL.md` and `references/changed-files-tree.md`, `references/tokens-and-density.md` — design source of truth, CSS/HTML patterns
- `.planning/phases/20-shell-frame/20-VERIFICATION.md` — Phase 20 post-review fixes, including the named unit-test regression (§1, `PublicMonacoSinglePaneAdapter`)
- `src/web/model/file-tree.ts`, `src/domain/file-tree.ts`, `src/web/components/FileTree.vue`, `FileRow.vue`, `DirectoryRow.vue`, `StatusBadge.vue`, `PathDisplay.vue`, `ui/PathText.vue`, `ui/UiIcon.vue`, `ui/ModalDialog.vue`, `ChangedFilesDialog.vue`, `src/web/model/panel-state.ts`, `src/web/model/comment-groups.ts`, `src/web/App.vue`, `src/contracts/comparison.ts` — all read directly, current source
- `tests/e2e/file-tree.spec.ts` (691 lines), `tests/unit/file-tree.test.ts` (723 lines) — grepped for exact locator strings confirming the UI-SPEC's migration table matches live test code

### Secondary (MEDIUM confidence)
None — no external/web sources were needed; this phase is entirely internal-repository research (no new library, no external API).

### Tertiary (LOW confidence)
None.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Component split is `FileRow.vue`/`DirectoryRow.vue` restyle-in-place rather than a new unified `TreeRow.vue` | Architecture Patterns, Recommended Project Structure | Low — explicitly marked "Claude's Discretion" in CONTEXT.md; either choice satisfies TREE-01..07 as long as roving-tabindex/expansion/filter-pruning guarantees hold. Planner should pick based on how much duplication a role="option" list-mode variant would add to two separate files vs. one |
| A2 | `ViewOptionsMenu.vue`'s outside-click dismiss should be a local hand-rolled `pointerdown` listener, not a new shared composable | Pitfall 4, Don't Hand-Roll | Low — if Phase 22's identity-pill popover (not yet built) later needs the same pattern, a shared composable can be extracted then; speculative extraction now is explicitly discouraged (YAGNI) and not contradicted by any locked decision |

**If this table is empty:** not applicable — two low-risk, CONTEXT.md-sanctioned discretion items are logged above; neither needs user confirmation before planning proceeds, since CONTEXT.md already delegates both to "Claude's Discretion."

## Open Questions (RESOLVED)

1. **Exact DOM structure of the collapsed-folder `●` bullet relative to the (removed) descendant-count badge's old slot (RESOLVED: align to the status-letter column)**
   - What we know: the UI-SPEC says the bullet appears `v-if="!expanded"`, decorative, `aria-hidden="true"`, opacity 0.7, positioned where the removed count badge used to render (right-aligned, per the sketch's `.row.folder` layout).
   - What's unclear: whether it should use `margin-left: auto` (like `.deco`/`.counts` in the sketch CSS) or a fixed right-aligned column matching the file rows' status-letter column width, for visual alignment across folder/file rows at the same depth.
   - Recommendation: planner/implementer should visually align the bullet with file rows' status-letter column (both are rightmost, fixed-width, decorative) for row rhythm consistency; this is a minor CSS detail not gated by any locked decision or test assertion.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; confirmed no package needed by direct inspection of every touched file plus the UI-SPEC's own "Component library: none" / "Icon library: ... hand-drawn" statements
- Architecture: HIGH — every pattern documented is either (a) quoted verbatim from the approved, checker-signed-off `21-UI-SPEC.md`, or (b) derived directly from current, verbatim-read source code in this repository (not training-data assumption)
- Pitfalls: HIGH — Pitfall 1 is a named, dated, already-occurred regression in this exact project (Phase 20, `20-VERIFICATION.md`); Pitfalls 2/5 are directly sourced from the UI-SPEC's own migration table and session-kind markers; Pitfalls 3/4 were discovered this session via direct grep/read (not assumed) — confirmed zero matches for `file-tree-filter`-selector tests and zero matches for an existing anchored-popover pattern

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (30 days — stable internal-only research, no external library version drift risk since no new dependencies were introduced)
</content>
