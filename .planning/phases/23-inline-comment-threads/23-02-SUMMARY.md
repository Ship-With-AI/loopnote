---
phase: 23-inline-comment-threads
plan: 02
subsystem: ui
tags: [typescript, vitest, monaco-editor-model-layer]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-01)
    provides: overlay-widget architecture decision (informational only — this plan touches no widget code)
provides:
  - "flattenThreadOrder/nextThread/previousThread pure navigation functions over WorkspaceComment[] + FileTreeModel.flatFileRows"
affects: [23-05-monaco-adapter, 23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Comparator composition (tree index, then side rank, then line) following comment-groups.ts's orderComments tiebreaker style"
    - "Map<fileId, index> built once from flatFileRows for O(1) tree-order lookup, never indexOf scans"

key-files:
  created: [src/web/model/thread-order.ts, tests/unit/thread-order.test.ts]
  modified: []

key-decisions:
  - "nextThread/previousThread use a symmetric sentinel design: undefined/not-found currentCommentId maps to index -1 for nextThread (so next lands on index 0, unwrapped) and to index order.length for previousThread (so previous lands on the last index, unwrapped) — this is the 'mirror' relationship the plan's prose specifies, and both of nextThread's two explicitly-tested fallback cases (undefined, not-found) share the same -1 sentinel code path."

patterns-established:
  - "Pure cross-file ordering module with zero Monaco/Vue imports, consumed directly (not re-derived) by later adapter/App.vue wiring plans"

requirements-completed: [THREAD-07, THREAD-09]

# Metrics
duration: 25min
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 02: Cross-File Thread Order with Wraparound Summary

**Pure `thread-order.ts` module (`flattenThreadOrder`/`nextThread`/`previousThread`) implementing the locked tree-path → Base-before-Head → line-number cross-file thread navigation order with single-step wraparound, fully unit-tested (12 tests), zero Monaco/Vue imports.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-11-05T19:30:00+01:00 (approx)
- **Completed:** 2026-11-05T19:34:45+01:00
- **Tasks:** 1 (single `<feature>` block per plan structure — no numbered `<task>` elements)
- **Files modified:** 2 (both new)

## Accomplishments
- `flattenThreadOrder()` builds a `Map<fileId, treeIndex>` from the already-produced `FileTreeModel.flatFileRows` (never re-derives tree order), filters out orphaned (`fileId: null`) and not-currently-visible comments, and sorts by `(treeIndex, side === 'base' ? 0 : 1, line)` ascending.
- `nextThread()`/`previousThread()` step through the flattened order with correct wraparound semantics and graceful fallback when the current comment id is `undefined` or no longer present (e.g. the thread was just deleted).
- All 10 `<behavior>` cases from the plan written as RED tests first (confirmed failing via `Cannot find module` when the implementation file was temporarily removed), then GREEN after implementation (12 tests total — some cases split into multiple `test()` blocks for clarity).

## Task Commits

This plan has a single `<feature>` block (no separate numbered `<task>` elements), executed as a RED → GREEN TDD cycle per `type: tdd`:

1. **RED: failing test for cross-file thread navigation order** - `190513c` (test)
2. **GREEN: implement cross-file thread navigation order** - `d3e351e` (feat)

No REFACTOR commit needed — one style-rule fix (inlining a trivial `sideRank` ternary helper, flagged by the `ts-no-tiny-functions` rule during initial write) was applied before the first commit, so both commits already reflect clean code.

**Plan metadata:** (docs commit hash recorded after this SUMMARY is committed)

## Files Created/Modified
- `src/web/model/thread-order.ts` - Pure module exporting `ThreadOrderEntry`, `ThreadNavigationResult`, `flattenThreadOrder`, `nextThread`, `previousThread`. No `monaco-editor` or `vue` import (one type-only import of `DiffSide` from `../monaco/line-mapping.js`, which erases at compile time, same pattern `workspace-state.ts` already uses).
- `tests/unit/thread-order.test.ts` - 12 tests covering every `<behavior>` case: empty order, same-file line ordering, Base-before-Head tiebreak, cross-file tree-order precedence over line number, orphaned-comment exclusion, not-in-tree exclusion, and `nextThread`/`previousThread` fallback + wraparound semantics.

## Decisions Made
- See `key-decisions` in frontmatter: the undefined/not-found sentinel design for `nextThread`/`previousThread` (`-1` for next, `order.length` for previous) satisfies the plan's "mirror of nextThread" requirement and both explicitly-specified `nextThread` fallback test cases without needing divergent branches.

## Deviations from Plan

**Binding decision override (widget architecture):** N/A — this plan does not touch widget code (no Monaco/Vue imports at all, per its own `<success_criteria>`). Noted per assignment instructions.

**Minor, self-corrected during initial write (not a plan deviation, a style-rule correction):** The `ts-no-tiny-functions` built-in style rule flagged an initial `sideRank(side: DiffSide): number` one-line ternary helper (2 call sites, no exported/public-API/type-guard justification). Inlined the ternary directly into the sort comparator before the first commit landed — purely a style fix, no behavior change, not worth a separate commit.

Otherwise: None - plan executed exactly as written.

## Issues Encountered
- Initial test fixture bug (not a plan deviation — a test-authoring bug caught during the RED→GREEN run): the `comment()` test fixture builder used `overrides.fileId ?? 'file-a'` for the `fileId` field, which coalesced an explicitly-passed `null` (the orphaned-comment test case) back to `'file-a'` because `??` treats `null` as nullish. Fixed by making `fileId` a required, non-defaulted parameter on the fixture builder. Caught by the "excludes orphaned comments" test itself failing on first run; the production `thread-order.ts` code was correct throughout — this was purely a test-fixture correctness issue, fixed before any commit landed.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npm run typecheck:web` — **0 errors** (vue-tsc --noEmit clean).
- `npm run verify:semantic-css` — **pass** (runs `build:web` first; this plan touches no CSS, confirmed no-op on semantic-CSS invariants).
- `npx vitest run --no-file-parallelism tests/unit` — **437 tests passed, 42 test files passed, 0 failed** (full unit suite, no regressions; includes this plan's 12 new tests in `thread-order.test.ts`).
- Playwright: **no Playwright specs applicable — plan is unit-only.** `thread-order.ts` is a pure model module with no UI surface (no Monaco wiring, no Vue component, no keyboard-shortcut registration in this plan); the plan's own `<verification>` section explicitly defers the packaged-binary Chromium check to Plan 23-08, the first plan that wires this module into a visible ⌥F9/⇧⌥F9 flow.
- `tests/e2e/agent-ready-export.spec.ts` and its fixtures: untouched (plan has no reason to touch default agent-ready-export behavior).
- Golden-hash anchor tests: not in scope near this plan's changes (pure navigation ordering, no anchor/hash logic touched); none regressed per the full unit-suite pass above.

## Self-Check: PASSED

- `thread-order.ts` exports exactly `flattenThreadOrder`, `nextThread`, `previousThread` (plus the `ThreadOrderEntry`/`ThreadNavigationResult` types), matching the plan's `artifacts`/`exports` frontmatter.
- `flattenThreadOrder` consumes `FileTreeModel.flatFileRows` (`VisibleFileTreeLeaf[]`) as the sole tree-order input, building a `Map` once — never re-derives tree order, matching the plan's `key_links`.
- No `monaco-editor` or `vue` import anywhere in `thread-order.ts` (verified by direct file read; the only import touching the Monaco-adjacent tree is a type-only `DiffSide` import from `line-mapping.js`, which erases at compile and introduces no runtime coupling).
- Every one of the plan's 10 `<behavior>` bullet cases has a corresponding test, confirmed RED before implementation existed (temporarily removed `thread-order.ts`, re-ran, got `Cannot find module`) and GREEN after (12/12 passing).
- All three plan-level verification commands run and passed; no scope was narrowed.

## Next Phase Readiness
- `thread-order.ts` is ready for direct import by Plan 23-05 (Monaco `addAction` registration for ⌥F9/⇧⌥F9, informing the `AdapterNavigation` callback shape) and Plan 23-08 (App.vue `handleKeydown` wiring + the first real UI/Playwright coverage of this ordering logic).
- No blockers for downstream plans.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
