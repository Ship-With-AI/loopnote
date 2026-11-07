---
phase: 21-changed-files-tree
plan: 03
subsystem: ui
tags: [vue, playwright, vitest, file-tree, accessibility, xss-safety]

# Dependency graph
requires:
  - phase: 21-changed-files-tree (plan 01)
    provides: "FileTreeModel.statusPriorityByDirectoryId/.flatFileRows, panel-state.ts treeViewMode/treeLineCounts/treeCommentBadges"
  - phase: 21-changed-files-tree (plan 02)
    provides: "FileRow.vue/DirectoryRow.vue VS Code Explorer row anatomy restyle, StatusBadge.vue independent tones, App.vue openCommentCounts"
provides:
  - "highlightMatches(display, query) — pure, XSS-safe <mark> segmentation function in src/web/model/file-tree.ts"
  - "FileTree.vue role=toolbar view-header (filter/list⇄tree/collapse-all), collapsible filter row with N-of-M count, footer totals, role=tree/listbox switch, list-mode rendering with its own flat keyboard navigation"
  - "PathText.vue/PathDisplay.vue/FileRow.vue/DirectoryRow.vue query prop threading for highlight rendering"
  - "ChangedFilesDialog.vue viewMode prop/update:view-mode emit; initial-focus-selector targets the tabbable tree/list row instead of the now-collapsible filter input"
  - "App.vue toggleTreeViewMode() handler persisting panelState.treeViewMode"
  - "Full Playwright locator migration (header name, searchbox name, empty-state copy, clear-filter rename, removed search glyph) across file-tree.spec.ts/responsive-session.spec.ts/anchored-workspace.spec.ts/workbench-shell-smoke.spec.ts"
affects: [21-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "highlightMatches returns a frozen {text,matched}[] segment array rendered via plain v-for/text interpolation — never v-html — eliminating the XSS vector a git path containing </>/& would otherwise create"
    - "List mode has no expansion state of its own: listTabbableFileId is a computed (not a ref) derived from model.selectedFileId with a flatFileRows[0] fallback, self-healing across filtering and mode switches without manual sync"
    - "focusTabbableTreeRow() (new) vs focusModelRow() (existing): the new filter/Esc interactions use the clamped tabbableRowId, never the model's raw (possibly filter-stale) focusedRowId"
    - "handleTreeScopedKeydown on the <nav> root catches ⌥⌘F/Ctrl+Alt+F via event bubbling from any descendant (filter input, toolbar buttons, tree/list rows) without a document-level listener"

key-files:
  created: []
  modified:
    - src/web/model/file-tree.ts
    - src/web/components/FileTree.vue
    - src/web/components/ui/PathText.vue
    - src/web/components/PathDisplay.vue
    - src/web/components/FileRow.vue
    - src/web/components/DirectoryRow.vue
    - src/web/components/ui/UiIcon.vue
    - src/web/components/ChangedFilesDialog.vue
    - src/web/App.vue
    - src/web/styles.css
    - tests/unit/file-tree.test.ts
    - tests/e2e/file-tree.spec.ts
    - tests/e2e/responsive-session.spec.ts
    - tests/integration/anchored-workspace.spec.ts
    - tests/e2e/workbench-shell-smoke.spec.ts

key-decisions:
  - "highlightMatches lower-cases both display and query for matching only; every matched segment's text slices the ORIGINAL display string, so casing renders correctly while matching case-insensitively"
  - "Moved the `#changed-files-heading` id (and a new tabindex=\"-1\") from the removed <h2> onto whichever root <ul role=\"tree\"|\"listbox\"> is rendered, so App.vue's existing 'Skip to files' skip-link href needed zero changes while still targeting a real, focusable element"
  - "List-mode row focus/selection is tracked via a computed (listTabbableFileId) derived from model.selectedFileId rather than a second ref, keeping tree mode and list mode sharing one selection source of truth exactly as CONTEXT.md requires"
  - "DirectoryRow.vue highlights its own compacted path text directly (no PathDisplay child exists there) while FileRow.vue forwards query through PathDisplay → PathText, covering both folder-name and file-name matches"

patterns-established:
  - "Pattern 5 (21-RESEARCH.md): <mark> highlighting via pure segment-array + v-for, never v-html — now the only highlighting path in the tree"

requirements-completed: [TREE-03, TREE-04, TREE-06, TREE-07]

# Metrics
duration: 22min
completed: 2026-11-05
status: complete
---

# Phase 21 Plan 03: Changed-Files Tree toolbar/filter/footer/list-mode Summary

**FileTree.vue rebuilt with a `role="toolbar"` view-header (filter/list⇄tree/collapse-all), a collapsible filter row driven by a new XSS-safe `highlightMatches` segmentation function, footer totals, and a `role="tree"`/`role="listbox"` mode switch with its own flat list-mode keyboard navigation.**

## Performance

- **Duration:** 22 min (first commit `fddc4a0` 10:29:32 → last commit `25b21f1` 10:51:11, 2026-11-05)
- **Started:** 2026-11-05T10:29:32+01:00
- **Completed:** 2026-11-05T10:51:11+01:00
- **Tasks:** 3 (Task 1 RED/GREEN + Task 2 + Task 3)
- **Files modified:** 15

## Accomplishments
- `highlightMatches(display, query)` — pure, XSS-safe `<mark>` segmentation, TDD'd with RED commit before GREEN implementation.
- `FileTree.vue`'s header is now a `role="toolbar" aria-label="Changed files actions"` with always-visible filter/list⇄tree/collapse-all icon buttons; the path filter is a collapsible row (closed by default) with live `<mark>` highlighting and an "N of M" count.
- Footer totals row (`"{N} files · +{A} −{D}"`, switching to `"{N} of {M} files"` while filtering) replaces the old heading-based count.
- Root list switches between `role="tree"` (folder tree) and `role="listbox"` (flat list, filename-first/directory-dimmed via `PathText`'s existing `basename` toggle) over 21-01's `flatFileRows`, with its own ↑↓/Home/End/Enter/Space keyboard handler and ←/→ no-ops.
- `ChangedFilesDialog.vue`'s narrow-viewport initial-focus regression (filter input now frequently hidden) fixed by retargeting `initial-focus-selector` at the tabbable tree/list row.
- Full accessible-name/copy locator migration across 4 Playwright spec files, plus one new packaged-binary test exercising filter/shortcut/highlight/list-mode/footer end-to-end.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: highlightMatches failing tests** - `fddc4a0` (test)
   **Task 1 GREEN: highlightMatches implementation** - `f18609d` (feat)
2. **Task 2: FileTree.vue header toolbar, collapsible filter, footer totals, role=tree/listbox + list-mode rendering** - `c5b2307` (feat)
3. **Task 3: ChangedFilesDialog.vue viewMode wiring, initial-focus-selector fix, App.vue toggleTreeViewMode, remaining locator migrations** - `25b21f1` (feat)

_Note: Task 1 followed the plan's RED→GREEN TDD gate; `git log` confirms `test(21-03)` precedes `feat(21-03)` for the same feature._

## Files Created/Modified
- `src/web/model/file-tree.ts` - new exported `highlightMatches`/`HighlightSegment`
- `src/web/components/FileTree.vue` - toolbar, collapsible filter, footer, tree/listbox switch, list-mode keyboard nav
- `src/web/components/ui/PathText.vue` - new `query` prop, renders both directory and filename segments through `highlightMatches`
- `src/web/components/PathDisplay.vue` - new `query` prop forwarded to all three `PathText` call sites (plain + renamed/copied old/new)
- `src/web/components/FileRow.vue` - new `query` prop forwarded to `PathDisplay`; `basename` now `mode !== 'list'`
- `src/web/components/DirectoryRow.vue` - new `query` prop; highlights its own compacted path directly; forwards `query` to recursive children
- `src/web/components/ui/UiIcon.vue` - new `filter`/`list`/`tree`/`collapse-all` glyphs
- `src/web/components/ChangedFilesDialog.vue` - new `viewMode` prop/`update:view-mode` emit; `initial-focus-selector` fix
- `src/web/App.vue` - new `toggleTreeViewMode()`; `:view-mode`/`@update:view-mode` wiring on `ChangedFilesDialog`
- `src/web/styles.css` - `.file-tree-pane__top`/`__label`/`__toolbar`, `.filter`, `mark`, `.tree-footer`; removed dead `.file-tree-pane h2`/`__filter-glyph`/`.tree-hint`/`.tree-empty h3`/`p` rules
- `tests/unit/file-tree.test.ts` - `highlightMatches` describe block (4 cases)
- `tests/e2e/file-tree.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts` - locator migrations + new packaged-binary test

## highlightMatches segmentation examples exercised

All four exercised directly in `tests/unit/file-tree.test.ts`'s `describe('highlightMatches', ...)`:

1. `highlightMatches('tracked.txt', '')` → `[{ text: 'tracked.txt', matched: false }]` (empty query is a no-op).
2. `highlightMatches('tracked.txt', 'track')` → `[{ text: 'track', matched: true }, { text: 'ed.txt', matched: false }]` (case-insensitive match at the start).
3. `highlightMatches('abcABCabc', 'abc')` → `[{ text: 'abc', matched: true }, { text: 'ABC', matched: true }, { text: 'abc', matched: true }]` (three consecutive matches, each echoing its own original casing, no gaps between them).
4. `highlightMatches('no-match-here.ts', 'zzz')` → `[{ text: 'no-match-here.ts', matched: false }]` (query present, no match, whole string returned unmatched).

The packaged-binary test (`workbench-shell-smoke.spec.ts`) additionally confirms a real `<mark>` element renders with text `"alpha"` inside the `alpha.ts` row's accessible name when filtering for `"alpha"`, and that this goes through `v-for`/text interpolation only (no `v-html` anywhere in the render chain).

## ChangedFilesDialog.vue initial-focus-selector fix

**Problem:** `initial-focus-selector="#file-tree-filter"` pointed at the filter `<input>`, which this plan makes `v-show="filterOpen"` and closed by default — `ModalDialog.vue`'s `focusInitial()` calling `.focus()` on a `display:none` element silently no-ops, leaving focus nowhere on dialog open (most visible on the narrow-viewport Files dialog, the exact regression named in the plan's `must_haves`).

**Fix:** `initial-focus-selector='[role="treeitem"][tabindex="0"], [role="option"][tabindex="0"]'` — targets whichever row currently carries the tree's (or list's) roving-tabindex, which is always present and focusable in both view modes, with no change to `ModalDialog.vue` itself.

**Test files this required updating** (every assertion that previously expected the filter input to be focused immediately on dialog open, now asserting the tabbable row instead):
- `tests/e2e/responsive-session.spec.ts` — 5 call sites: the keyboard-only 320px journey, the Phase 08 boundary-matrix narrow reopen, the achromatopsia step, and the forced-colors step.
- `tests/integration/anchored-workspace.spec.ts` — 1 call site (the `filesToggle`/`changedFiles` narrow-viewport focus check).
- `tests/e2e/file-tree.spec.ts` and `tests/e2e/workbench-shell-smoke.spec.ts` did not assert this specific focus target (they open the filter explicitly via the funnel button/shortcut rather than relying on dialog-open auto-focus), so no change was needed there for this specific fix — though both files still received the broader header/searchbox/empty-state copy migration (see Deviations/Decisions).

## Decisions Made
- `highlightMatches` placed as a module-level exported function in `file-tree.ts` (sibling to `flattenFileRows`), not a method on `FileTreeModel` — it's a pure string function with no tree/model state dependency, consumed directly by `PathText.vue`/`DirectoryRow.vue`.
- List-mode row focus/selection source of truth is `model.selectedFileId` (via a `listTabbableFileId` computed with a `flatFileRows[0]` fallback), not a separate ref — this keeps tree mode and list mode permanently in sync with zero extra state to reconcile on mode switch, filtering, or `replaceFiles`.
- The `#changed-files-heading` id moved onto the root `<ul>` (both tree and list branches) rather than updating `App.vue`'s skip-link `href` — zero-risk, zero-ripple fix per the plan's own stated option.
- Directory-name highlighting renders directly in `DirectoryRow.vue` (its own `pathSegments` computed over `highlightMatches`) rather than through `PathDisplay`, since `DirectoryRow.vue` never had a `PathDisplay` child in the first place — only `FileRow.vue`'s filename route goes through `PathDisplay`/`PathText`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tests/e2e/responsive-session.spec.ts`'s `expectTreeInteriorAtWidth` asserted a `.directory-row__count` locator that 21-02 had already deleted**
- **Found during:** Task 3 verification (`npx playwright test tests/e2e/responsive-session.spec.ts`)
- **Issue:** 21-02 removed `DirectoryRow.vue`'s descendant-count badge/span entirely (replacing it with the collapsed-status bullet), but `responsive-session.spec.ts` was outside 21-02's `files_modified` list and still asserted `filesPane.locator('.directory-row__count')` was visible with non-empty text — a dangling reference to a deleted element, failing every run since 21-02 landed.
- **Fix:** Removed the `directoryCount` locator and its two assertions. Per `21-UI-SPEC.md`'s own locator-migration table, a removed descendant-count accessible name has no required replacement in a general-purpose responsive-geometry test (the collapsed bullet is only present when a directory happens to be collapsed, which this test doesn't control).
- **Files modified:** `tests/e2e/responsive-session.spec.ts`
- **Verification:** `npx playwright test tests/e2e/responsive-session.spec.ts` passes.
- **Committed in:** `25b21f1` (Task 3 commit)

**2. [Rule 1 - Bug] `tests/e2e/responsive-session.spec.ts`'s `expectTreeInteriorAtWidth` asserted the pre-21-02 row height (28px), now 26px**
- **Found during:** Same verification pass as #1
- **Issue:** 21-02's `grid-auto-flow: column` fix on `.tree-row` (documented in `21-02-SUMMARY.md`'s own Deviations) changed the real rendered row height from 28px to 26px; `tests/e2e/file-tree.spec.ts`'s identical assertion was updated by 21-02, but this file's copy (same `.tree-row--selected` markup, different test file, outside 21-02's scope) was not.
- **Fix:** Updated `expect(selectedBox!.height).toBe(28)` → `toBe(26)`, with a comment cross-referencing the 21-02 restyle and the already-updated `file-tree.spec.ts` assertion.
- **Files modified:** `tests/e2e/responsive-session.spec.ts`
- **Verification:** `npx playwright test tests/e2e/responsive-session.spec.ts` passes.
- **Committed in:** `25b21f1` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs/stale assertions inherited from 21-02's out-of-scope files, blocking this plan's own verification gate on files this plan is responsible for).
**Impact on plan:** Both fixes were required for `responsive-session.spec.ts` (an explicit `files_modified` target of this plan) to pass at all; no scope creep beyond that file.

## Issues Encountered
- The new packaged-binary test's first fixture (`createGitFixture()` with default options) silently added an extra `committed.txt` file via the fixture helper's default `committedHeadChange` branch, making the footer read "3 files · +3 −2" instead of the expected "2 files · +2 −2". Resolved by passing `{ committedHeadChange: false }` to the fixture call, which was always the correct option for a test that constructs its own file set from scratch (not a defect in the fixture helper itself — just the right option for this test's needs).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `FileTree.vue`'s header toolbar leaves a gap exactly where 21-04's `view-options` (⋯) button belongs — no "more"/view-options icon or menu exists yet, matching `21-UI-SPEC.md`'s explicit scope split ("leaving only the ⋯ View options menu itself for 21-04").
- `panelState.treeLineCounts`/`treeCommentBadges` (from 21-01) are read by `FileRow.vue`/`DirectoryRow.vue` already (via 21-02) but have no UI control to change them yet — ready for 21-04's `ViewOptionsMenu.vue`.
- No blockers for 21-04.

---
*Phase: 21-changed-files-tree*
*Completed: 2026-11-05*
