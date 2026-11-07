---
phase: 25-accessibility-design-docs-regression-sweep
plan: 01
subsystem: ui
tags: [vue, playwright, aria, accessibility, e2e, markdown-docs]

# Dependency graph
requires:
  - phase: 24-bottom-panel-export
    provides: "BottomPanel.vue's role=\"tablist\" aria-label=\"Review panel\" control, reused as-is by this plan's proof spec"
provides:
  - "tests/e2e/toolbar-roles.spec.ts — packaged-binary proof all five toolbar/group/tablist control regions resolve by role+name"
  - "role=\"toolbar\" aria-label=\"Title bar actions\" on TitleBar.vue's .titlebar__right"
  - "role=\"toolbar\" aria-label=\"Status bar actions\" on StatusBar.vue's .statusbar__right"
  - "DEBT-01 fully removed from ROADMAP.md and PROJECT.md"
affects: [25-02, 25-03, 25-05, 25-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "role=\"toolbar\" aria-label=\"...\" on the button-cluster wrapper <div>, landmark element (<header>/<footer>) left untouched — matches FileTree.vue:401 / EditorTitle.vue:101 exactly"

key-files:
  created: [tests/e2e/toolbar-roles.spec.ts]
  modified: [src/web/components/workbench/TitleBar.vue, src/web/components/workbench/StatusBar.vue, .planning/ROADMAP.md, .planning/PROJECT.md]

key-decisions:
  - "Rewrote every DEBT-01 cross-reference in ROADMAP.md (5 occurrences) and PROJECT.md (4 occurrences), not just the two the plan's action text named explicitly — the plan's own verify/done gate (`grep -c DEBT-01` returns 0 in both files) requires it, and each sentence was reworded to stay grammatical rather than leaving dangling fragments."
  - "Reused the workbench-shell-smoke.spec.ts packaged-binary pack/spawn scaffold verbatim (one npm pack + tar extract per spec file) and the default createGitFixture() + committed branch/worktree launchOptions shape from its first test case, since that's the smallest fixture that renders all five shell regions with a real diff."
  - "Opened the bottom panel via the same 'Toggle panel (⌘J)' button click used by workbench-shell-smoke.spec.ts's openPanel() helper before asserting the tablist, since BottomPanel.vue is only mounted (v-if=\"panelOpen\") once the panel is open."

requirements-completed: [A11Y-01, A11Y-03]

# Metrics
duration: ~20min
completed: 2026-11-06
status: complete
---

# Phase 25 Plan 01: Toolbar Roles & DEBT-01 Closure Summary

**Added `role="toolbar"` + `aria-label` to the title bar's and status bar's button clusters, proved all five control regions are reachable by role+name with a new packaged-binary Playwright spec, and removed every DEBT-01 reference from ROADMAP.md and PROJECT.md.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-11-06 (session start)
- **Completed:** 2026-11-06T03:13:28+01:00
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- New `tests/e2e/toolbar-roles.spec.ts` proves, against the real packaged binary, that all five named control regions (title bar, side bar, editor title, bottom panel, status bar) resolve via `getByRole('toolbar' | 'tablist', { name })`, plus a landmark-role regression guard (`banner`/`contentinfo`).
- `TitleBar.vue`'s `.titlebar__right` and `StatusBar.vue`'s `.statusbar__right` now carry `role="toolbar"` with their respective accessible names, closing the only two gaps among the five regions.
- DEBT-01 is fully closed: zero remaining occurrences of the string in `ROADMAP.md` or `PROJECT.md`, with every removed reference rewritten in place so no sentence was left ungrammatical or dangling.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write the DEBT-01 proof spec against the packaged binary** - `63f34ec` (test)
2. **Task 2 (GREEN): Add role="toolbar" + aria-label to TitleBar.vue and StatusBar.vue** - `4b538a2` (feat)
3. **Task 3: Close DEBT-01 in ROADMAP.md and PROJECT.md** - `cbba049` (docs)

## Files Created/Modified
- `tests/e2e/toolbar-roles.spec.ts` - New packaged-binary Playwright spec proving the five-region role+name contract
- `src/web/components/workbench/TitleBar.vue` - `role="toolbar" aria-label="Title bar actions"` on `.titlebar__right`
- `src/web/components/workbench/StatusBar.vue` - `role="toolbar" aria-label="Status bar actions"` on `.statusbar__right`
- `.planning/ROADMAP.md` - Removed the "Accepted debt from v1.6" DEBT-01 entry and reworded 4 other DEBT-01 mentions
- `.planning/PROJECT.md` - Reworded 4 DEBT-01 mentions (milestone summary, target-features bullet, active-criteria bullet, accepted-debt carryover sentence)

## Decisions Made
- See `key-decisions` in frontmatter: scope of DEBT-01 reference removal extended beyond the plan's two explicitly named edits to satisfy the plan's own zero-occurrence gate; packaged-binary scaffold and fixture shape reused verbatim from `workbench-shell-smoke.spec.ts` rather than inventing a new one; bottom panel opened via the existing toggle button before asserting its tablist.

## Deviations from Plan

None - plan executed exactly as written. (The broader-than-literally-named DEBT-01 cleanup in Task 3 is covered by the plan's own `<done>` and `<verify>` criteria — "No remaining DEBT-01 string in either file" / `grep -c "DEBT-01"` returns 0 — so it is in-scope execution of Task 3, not a deviation.)

## Issues Encountered
- The plan's suggested Task 1 verify command (`npx playwright test ... | grep -E "Title bar actions|Status bar actions" | grep -c "failed\|Error"`) reported `0` because Playwright's single-test sequential `expect().toBeVisible()` calls halt at the first failure (the title-bar assertion) — the status-bar assertion is never reached in RED, so neither line in the raw output contains both a region name and "failed"/"Error" together. The actual RED run (full output) confirmed the spec fails exactly and only on `getByRole('toolbar', { name: 'Title bar actions' })` before reaching any other assertion, matching the task's real done criterion ("fails only on the two regions this plan is about to fix"). No code change was needed — just relied on the full test output rather than the narrow grep.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Gate results (full repo, not scoped to this plan's files):**
- `npm run typecheck:web` — 0 errors.
- `npm run verify:semantic-css` — passed ("Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass.").
- `npx vitest run --no-file-parallelism tests/unit` — 46 test files passed, 478 tests passed, 0 failed.
- `npx playwright test tests/e2e/toolbar-roles.spec.ts tests/e2e/anchored-review.spec.ts tests/e2e/workbench-shell-smoke.spec.ts` — 15 passed, 0 failed (1 + 5 + 9 across the three spec files).

All gates this plan is responsible for are green. Ready for 25-02 through 25-05 to proceed.

## Self-Check: PASSED

---
*Phase: 25-accessibility-design-docs-regression-sweep*
*Completed: 2026-11-06*
