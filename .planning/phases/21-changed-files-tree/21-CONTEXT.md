# Phase 21: Changed-Files Tree - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Restyle and extend the changed-files tree inside the Phase 20 side bar to VS Code Explorer density: 22px rows, compact folder chains, file-type mark, status-coloured name with right-aligned status letter, comment badges, hover/selected line counts, a header-opened path filter with highlighting, tree ⇄ flat list, a view-options menu, footer totals, and full keyboard operation through one tab stop. Requirements: TREE-01..07.

Not in this phase: comment threads (Phase 23 — the comment badge reads existing draft comment data only), viewed tracking (deferred, DEFER-01), virtualization (deferred), highlight-vs-filter modes (deferred), interactive breadcrumbs (optional, see Deferred).

</domain>

<decisions>
## Implementation Decisions

### Design source
- `.kimi-code/skills/sketch-findings-loopnote/references/changed-files-tree.md` and sketch `003-explorer-tree` variant **A**; geometry tokens from Phase 20 (`--file-row-min-height` 22px, `--tree-indent` 12px, flat rows).

### Rows & markers
- Status letters: keep R (renamed), C (copied), T (type changed) alongside M/A/D in the same right-aligned 12px mono column; renamed rows expose `old → new` in title and accessible name. Deleted names get line-through; status is never colour-only.
- Remove directory descendant counts (v1.6) — VS Code Explorer style; a collapsed folder shows a dimmed `●` in its contents' status colour.
- Keep the "Changed since last snapshot" refresh marker and the availability markers (unsupported / unavailable / changed-during-capture / standalone git state) as compact muted text badges placed before the counts; their accessible text is unchanged.
- File-type mark: small mono label from a fixed extension map (TS, JS, V, #, M↓, {}, IMG, · fallback), `aria-hidden` (decorative).

### Filter
- Opened by a funnel icon in the "Changed files" view header and by ⌥⌘F / Ctrl+Alt+F while focus is in the tree; input renders below the header. The always-visible search box is removed.
- Matching stays case-insensitive substring on the full path; the existing pruning (never rebuilding) model is kept so expansion identity and selection survive clearing; matched substrings are highlighted (`<mark>`).
- Esc clears and closes the filter and returns focus to the tree; filter text is session-only. Enter opens the first match, ↓ moves focus into the tree; empty state "No changed files match “…”."
- "N of M" shows inside the filter input; the footer switches to "N of M files" while filtering.

### View options, list mode & footer
- Persist tree/list mode, line-count visibility (always / hover-or-selected (default) / never), and comment-badge toggle in the existing `loopnote.workbench.v1` localStorage key, versioned with the same clamp/parse discipline as Phase 20's `panel-state.ts`.
- Flat list is ordered by full path (same order as the tree) so ⌥↑/⌥↓ file navigation order is identical in both modes.
- View options menu: `role="menu"` with `menuitemradio` for line counts and `menuitemcheckbox` for badges; arrow-key navigation, Esc returns focus to the ⋯ button.
- Footer: "9 files · +64 −17" (and "N of M files" while filtering), not a live region.

### Claude's Discretion
- Whether compact-folder flattening lives in `model/file-tree.ts` or a derived view model, provided roving tabindex (`tabbableRowId`), expansion identity, and filter-pruning guarantees from v1.6 hold, and keyboard navigation treats a compacted chain as one row.
- Component split (`FileRow`/`DirectoryRow` restyle vs. new `TreeRow`), icon additions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/web/model/file-tree.ts` (491 lines): `createFileTreeModel`, `VisibleFileTreeRow`, navigation keys, roving tabindex, filter pruning.
- `src/web/components/FileTree.vue` (filter input, `query`, tree role), `FileRow.vue` (`StatusBadge`, line counts with accessible label, refresh marker, availability marker), `DirectoryRow.vue` (descendant counts to remove), `StatusBadge.vue`, `PathDisplay.vue`/`PathText.vue`.
- Phase 20 side bar + view header + `model/panel-state.ts` persistence.
- Comment counts: `src/web/model/comment-groups.ts` / workspace comments in `App.vue`.

### Established Patterns
- Teleport host stays `v-show`; single tab stop roving tabindex; real-Chromium keyboard evidence; same-phase locator updates.

### Integration Points
- `tests/e2e/file-tree.spec.ts`, `tests/unit/file-tree.test.ts`, and any spec asserting "Find file…", directory counts (`collision/.*2 changed files` etc.), or row structure.

</code_context>

<specifics>
## Specific Ideas

- Reference: `.planning/sketches/003-explorer-tree/index.html` tab A (state tabs: filter, no match, 412 files).

</specifics>

<deferred>
## Deferred Ideas

- Interactive breadcrumbs (reveal folder in tree) — not required by TREE-01..07; leave orientation-only unless trivially supported.
- Tree virtualization, highlight-vs-filter modes, viewed check marks.

</deferred>
