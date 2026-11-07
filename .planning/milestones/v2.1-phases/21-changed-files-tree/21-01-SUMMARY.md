---
phase: 21-changed-files-tree
plan: 01
subsystem: ui
tags: [vue, vitest, typescript, file-tree, panel-state]

# Dependency graph
requires:
  - phase: 20-changed-files-shell (implied by existing file-tree.ts/panel-state.ts)
    provides: FileTreeModel and PanelState base implementations
provides:
  - "FileTreeModel.statusPriorityByDirectoryId: ReadonlyMap<string, ChangedFileStatusKind> — per-directory collapsed-bullet status-priority lookup"
  - "FileTreeModel.flatFileRows: readonly VisibleFileTreeLeaf[] — filter-aware, expansion-independent flat file list for list mode"
  - "PersistedPanelState/PanelState treeViewMode/treeLineCounts/treeCommentBadges fields with per-field validation and defaults"
  - "TreeViewMode ('tree'|'list') and TreeLineCountsMode ('always'|'hover'|'never') exported type aliases"
affects: [21-02-tree-view-restyle, 21-03-list-view, 21-04-tree-controls]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Directory status-priority winner computed via recursive fold mirroring countDirectoryDescendants (recurse into children first, Map.set before folding into running best)"
    - "flattenFileRows recurses unconditionally (no expanded-set gate) over the same filter-pruned projectedTree used by flattenVisibleRows, giving filtering for free"
    - "panel-state per-field enum/typeof validation arms extended 1:1 for each new field, one corrupt field never rejects siblings"

key-files:
  created: []
  modified:
    - src/web/model/file-tree.ts
    - src/web/model/panel-state.ts
    - tests/unit/file-tree.test.ts
    - tests/unit/panel-state.test.ts

key-decisions:
  - "Inlined the originally-planned statusPriorityRank helper directly as STATUS_PRIORITY_ORDER.indexOf(...) at its single call site per the repo's tiny-function style rule (helper had only one call site, not three+, and wasn't an exported domain concept)."
  - "Updated the six pre-existing parsePanelState/createPanelState toEqual assertions to include the three new default fields (treeViewMode/treeLineCounts/treeCommentBadges) rather than leaving them asserting the old 3-field shape — required because parsePanelState's return object now always carries six fields, so the old assertions would otherwise regress under strict toEqual."
  - "RED test 1 for Task 3 (parsePanelState(null) carrying the three new defaults) was satisfied by extending the existing 'returns all defaults when no stored key exists' test in place rather than adding a byte-identical duplicate test, since both assert the exact same call/expectation."

patterns-established: []

requirements-completed: [TREE-01, TREE-04, TREE-05]

# Metrics
duration: ~35min
completed: 2026-11-05
status: complete
---

# Phase 21 Plan 01: Changed-Files Tree Model Substrate Summary

**Added `statusPriorityByDirectoryId` and `flatFileRows` to `FileTreeModel`, plus `treeViewMode`/`treeLineCounts`/`treeCommentBadges` to `panel-state.ts`, each covered by new RED→GREEN unit tests; no UI consumer wired yet.**

## Performance

- **Tasks:** 3 (all TDD)
- **Files modified:** 4 (`src/web/model/file-tree.ts`, `src/web/model/panel-state.ts`, `tests/unit/file-tree.test.ts`, `tests/unit/panel-state.test.ts`)

## Accomplishments
- `FileTreeModel.statusPriorityByDirectoryId` resolves each directory's collapsed-bullet colour from its descendant files using the locked priority order (modified > deleted > added > renamed/copied > type-changed > unsupported), recomputed on every `createModel` call.
- `FileTreeModel.flatFileRows` gives list mode a filter-aware, expansion-independent flat file list (recurses into every directory unconditionally over the already filter-pruned `projectedTree`).
- `panel-state.ts` gained `treeViewMode`/`treeLineCounts`/`treeCommentBadges` on `PersistedPanelState`/`PanelState`, each independently validated with its own documented default, matching the existing `sidebarWidth`/`sidebarVisible`/`panelHeight` discipline.

## Task Commits

Each task committed atomically per the TDD RED→GREEN protocol:

1. **Task 1: statusPriorityByDirectoryId**
   - RED: `07d5a06` — `test(21-01): add RED tests for statusPriorityByDirectoryId`
   - GREEN: `4e151dd` — `feat(21-01): add statusPriorityByDirectoryId collapsed-bullet lookup`
2. **Task 2: flatFileRows**
   - RED: `ae5fabc` — `test(21-01): add RED tests for flatFileRows`
   - GREEN: `d54b1a9` — `feat(21-01): add flatFileRows expansion-independent file list`
3. **Task 3: panel-state.ts treeViewMode/treeLineCounts/treeCommentBadges**
   - RED: `870d912` — `test(21-01): add RED tests for treeViewMode/treeLineCounts/treeCommentBadges`
   - GREEN: `d75db03` — `feat(21-01): add treeViewMode/treeLineCounts/treeCommentBadges panel-state fields`

No separate REFACTOR commits were needed: the one planned helper (`statusPriorityRank`) was inlined into its GREEN commit before that commit landed (see Decisions), so each task is a clean two-commit RED→GREEN pair.

### RED test names per task

**Task 1 — `describe('statusPriorityByDirectoryId', ...)`** (`tests/unit/file-tree.test.ts`):
- `resolves the winner to deleted when a directory holds a deleted file and an added file`
- `resolves the winner to modified once a modified file joins the same directory`
- `propagates a nested directory winner up through a parent that also has a lower-priority direct file`
- `records renamed and copied as distinct per-directory winners within the same priority tier`
- `is populated immediately after construction with one entry per directory`

**Task 2 — `describe('flatFileRows', ...)`** (`tests/unit/file-tree.test.ts`):
- `includes files inside a collapsed directory even though they are absent from visibleRows`
- `matches the visibleRows file order when every directory is expanded`
- `contains only filter-surviving files after setQuery`
- `stays reference-stable in content when a directory is toggled`

**Task 3 — `describe('parsePanelState', ...)` / `describe('createPanelState', ...)`** (`tests/unit/panel-state.test.ts`):
- `returns all defaults when no stored key exists` (extended in place to also assert the three new defaults — satisfies plan RED test 1)
- `round-trips valid treeViewMode/treeLineCounts/treeCommentBadges values unchanged` (plan RED test 2)
- `falls back an invalid treeViewMode to its own default while valid sidebarWidth and treeLineCounts still parse through` (plan RED test 3)
- `falls back an invalid treeLineCounts and a non-boolean treeCommentBadges to their own defaults independently` (plan RED test 4)
- `exposes treeViewMode/treeLineCounts/treeCommentBadges as seeded refs and persists all six fields` (plan RED test 5)

## Files Created/Modified
- `src/web/model/file-tree.ts` — added `ChangedFileStatusKind` import, `STATUS_PRIORITY_ORDER`, `collectDirectoryStatusPriority`, `flattenFileRows`, and the two new `FileTreeModel` fields wired through `createModel`.
- `src/web/model/panel-state.ts` — added `TreeViewMode`/`TreeLineCountsMode` type aliases, three default constants, extended `PersistedPanelState`/`defaultPersistedPanelState`/`parsePanelState`/`PanelState`/`createPanelState`.
- `tests/unit/file-tree.test.ts` — new `statusPriorityByDirectoryId` and `flatFileRows` describe blocks (9 new tests).
- `tests/unit/panel-state.test.ts` — 3 new `parsePanelState` tests, 1 new `createPanelState` test, and 7 pre-existing `toEqual`/`toBe` assertions extended to the new six/field shape (see Decisions).

## Decisions Made
See `key-decisions` in frontmatter above (tiny-function inlining, pre-existing assertion extension, RED-test-1 consolidation).

## Deviations from Plan

None requiring Rule 1-4 escalation. One inline style adjustment applied automatically by the coding-agent's default tiny-function rule (not a GSD deviation rule): the plan's action text asked for a small `statusPriorityRank` rank-lookup helper; it was written, then inlined into its single call site (`STATUS_PRIORITY_ORDER.indexOf(...)`) because it had fewer than three call sites and wasn't an exported domain concept — behavior is identical, verified by the same Task 1 GREEN test run.

## Issues Encountered

None — all three tasks implemented exactly per plan `<action>` specs on the first attempt; no fix-attempt-limit situations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `statusPriorityByDirectoryId`, `flatFileRows`, and the three `panel-state.ts` fields are ready for plans 21-02..21-04 to wire into the actual tree/list UI components.
- Full unit suite gate (`npx vitest run --no-file-parallelism tests/unit`) passed with **386/386 tests, 38/38 files** — zero regressions anywhere else in the suite.
- `npm run typecheck:web` passed cleanly (no errors) — the two new `FileTreeModel` fields and two new `panel-state.ts` type aliases type-check with no consumers yet.
- Nothing is rendered yet; no e2e/Playwright surface exists for this plan, per its `<artifacts>` note.

## TDD Gate Compliance

Confirmed via `git log`: for all three tasks, each `test(21-01): ...` RED commit precedes its corresponding `feat(21-01): ...` GREEN commit:
- `07d5a06` (test) → `4e151dd` (feat) — Task 1
- `ae5fabc` (test) → `d54b1a9` (feat) — Task 2
- `870d912` (test) → `d75db03` (feat) — Task 3

## Self-Check: PASSED
All 6 task commit hashes (07d5a06, 4e151dd, ae5fabc, d54b1a9, 870d912, d75db03) confirmed present via `git log --oneline --all`; `.planning/phases/21-changed-files-tree/21-01-SUMMARY.md` confirmed present on disk.

---
*Phase: 21-changed-files-tree*
*Completed: 2026-11-05*
