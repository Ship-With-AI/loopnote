---
phase: 18-product-repositioning-copy
plan: 05
subsystem: testing
tags: [playwright, vue, zod]

# Dependency graph
requires:
  - phase: 18-product-repositioning-copy (18-04)
    provides: "D-08 'Files' sidebar copy, D-10 locked empty-state copy, POS-02 dirty-badge screen-reader text applied to src/web/App.vue, FileTree.vue, ChangedFilesDialog.vue, ActiveFileToolbar.vue, IdentityHeader.vue"
provides:
  - "Every Playwright e2e/integration locator/assertion in the seven deferred spec files now matches Plan 18-04's applied copy, giving POS-02/POS-03 their only behavioral (live-DOM) verification"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DirectoryRow.vue's per-folder descendant-count label ('N changed file(s)') is a distinct concept from D-08's sidebar/dialog/toggle noun rename ('Changed files' → 'Files') and is out of 18-UI-SPEC.md's D-08 Apply-to list; its three regex locators in file-tree.spec.ts (collision/kept/collapsed descendant counts) are correctly left matching the unrenamed source string"

key-files:
  created: []
  modified:
    - tests/e2e/anchored-review.spec.ts
    - tests/e2e/file-tree.spec.ts
    - tests/e2e/pinned-session.spec.ts
    - tests/e2e/responsive-session.spec.ts
    - tests/integration/anchored-workspace.spec.ts
    - tests/integration/draft-recovery-ui.spec.ts
    - tests/integration/support-dialog.spec.ts

key-decisions:
  - "Verified every replacement string against the actual rendered source (FileTree.vue, ChangedFilesDialog.vue, ActiveFileToolbar.vue, App.vue's emptyFilesCopy, IdentityHeader.vue) rather than trusting the plan's literal prose, since the plan was written before 18-04 executed and its cited line numbers/strings were stale in several places."
  - "Left file-tree.spec.ts's three DirectoryRow.vue descendant-count regex locators ('.../collision\\/.*2 changed files/i' etc.) unchanged — 18-UI-SPEC.md's D-08 Apply-to list names only FileTree.vue's aria-labels/heading/filter-empty paragraph, ChangedFilesDialog.vue, ActiveFileToolbar.vue, and App.vue's skip-link; DirectoryRow.vue's unrelated per-folder count label was never touched by 18-04. Changing these three locators would have broken the suite against the actual unchanged source."
  - "Renamed two cosmetic non-assertion strings for consistency with the done-criterion grep (0 'changed files' hits): anchored-review.spec.ts's test name ('packaged files dialog returns to the diff heading') and pinned-session.spec.ts's negative regression guard ('0 files' in a toHaveCount(0) assertion, which never matched rendered DOM text either before or after the rename)."

patterns-established: []

requirements-completed: [POS-02, POS-03]

# Metrics
duration: 50min
completed: 2026-11-02
status: complete
---

# Phase 18 Plan 05: Playwright spec updates for D-08/D-10/POS-02 copy Summary

**Updated every Playwright locator/assertion across all seven e2e/integration specs deferred by Plan 18-04 (the "Changed files"→"Files" sidebar rename, the D-10 empty-state copy, and the POS-02 dirty-badge screen-reader text), closing the behavioral-verification gap for POS-02/POS-03 and leaving only the two pre-existing, out-of-scope `selector-drift-ui.spec.ts` failures.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2 (as planned)
- **Files modified:** 7

## Accomplishments
- Every `'Open/Close changed files'`, `{ name: 'Changed files' }`, `/^Changed files \(\d+\)$/`, `'Hide/Show changed files sidebar'`, and `'Clear the filter to show all changed files.'` locator across `anchored-review.spec.ts`, `file-tree.spec.ts`, `pinned-session.spec.ts`, `responsive-session.spec.ts`, and `anchored-workspace.spec.ts` now matches the applied `'Files'` noun (Task 1).
- `pinned-session.spec.ts`'s range empty-state heading/message, pinned-comparison empty-state heading/message, and dirty-badge screen-reader text now match Plan 18-04's locked D-10/POS-02 copy; `draft-recovery-ui.spec.ts` and `support-dialog.spec.ts`'s four `'No PR-style changes in this pinned comparison'` assertions now read `'No changes in this comparison.'`; `draft-recovery-ui.spec.ts:378`'s unrelated exact-patch empty-state assertion is untouched (Task 2).
- Full `npx playwright test` run: 111 passed, only the two pre-existing `selector-drift-ui.spec.ts:423/441` failures remain (confirmed pre-existing per the executor brief's baseline note on commit 3196e96 — not touched by this plan's files).
- `npm test`: 853/853 passing.

## Task Commits

1. **Task 1: Sweep every "Changed files" sidebar/dialog/toggle locator to "Files"** - `1de63e8` (test)
2. **Task 2: Update empty-state and dirty-badge assertions** - `e45352b` (test)

## Files Created/Modified
- `tests/e2e/anchored-review.spec.ts` - "Open/Close changed files" → "Open/Close files"; dialog name "Changed files" → "Files"; test name renamed for consistency
- `tests/e2e/file-tree.spec.ts` - navigation/tree aria-label, heading regex, and filter-empty message updated to "Files"; three unrelated DirectoryRow descendant-count regexes (`collision`, `control`, `src/deep/only` at :436, :571, :574, and the harness's `collapsed`/`kept` at :655-656) left untouched
- `tests/e2e/pinned-session.spec.ts` - tree/navigation/heading "Changed files" → "Files" locators (Task 1); range empty-state heading gains trailing period, no-pathspecs message → "Relaunch with a different range.", pinned-comparison empty-state heading/message → "No changes in this comparison." / "Relaunch with different Base/Head endpoints.", dirty-badge SR text → POS-02 wording, "0 changed files" negative guard → "0 files" (Task 2)
- `tests/e2e/responsive-session.spec.ts` - all 27 "Open/Close/Hide/Show changed files(...)" locators and one descriptive `test.step` label → "Files" form; internal `#changed-files`/`.changed-files-sidebar` id/class selectors and `aria-controls` value left untouched
- `tests/integration/anchored-workspace.spec.ts` - "Open/Close changed files" and "Hide changed files sidebar" → "Files" form
- `tests/integration/draft-recovery-ui.spec.ts` - pinned-comparison empty-state heading → "No changes in this comparison."; exact-patch empty-state assertion at :378 untouched
- `tests/integration/support-dialog.spec.ts` - all four pinned-comparison empty-state `getByText` assertions → "No changes in this comparison."

## Decisions Made
See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a second stale pinned-comparison empty-state message assertion the plan's read_first did not name**
- **Found during:** Full-suite `npx playwright test` verification run after Tasks 1-2
- **Issue:** `pinned-session.spec.ts:999` (within the same `identity session and empty states` test, two lines after the heading assertion Task 2 explicitly named) asserted the pre-18-04 message text `'The selected head has no changes from the displayed merge base.'`. Plan 18-05's read_first only named the heading at the old line :995; the adjacent message assertion was missed by the plan's literal line citations (stale from before 18-04 ran) and by the Task 2 action's explicit instruction list.
- **Fix:** Replaced with `'Relaunch with different Base/Head endpoints.'`, matching `App.vue`'s actual `emptyFilesCopy` pinned-comparison-branch message.
- **Files modified:** `tests/e2e/pinned-session.spec.ts`
- **Verification:** `npx playwright test` rerun — the `identity session and empty states` test passed; full suite dropped from 3 failures to the 2 expected pre-existing ones.
- **Committed in:** `e45352b` (Task 2 commit, same empty-state locator scope)

---

**Total deviations:** 1 auto-fixed (Rule 1, same file/task scope as the plan's named Task 2 edits).
**Impact on plan:** Necessary to make the plan's own named test pass; no scope creep — same test, same empty-state assertion block Task 2 was already editing.

## Issues Encountered
None beyond the auto-fixed assertion above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All seven Playwright specs deferred by 18-04 now pass against the applied D-08/D-10/POS-02 copy.
- `npx playwright test` (full suite): 111 passed, 2 failed — both `tests/integration/selector-drift-ui.spec.ts:423` and `:441`, confirmed pre-existing on commit 3196e96 (pre-rename baseline, documented in `.planning/STATE.md`'s deferred-verification log under quick task `261031-q09`) and unrelated to any file this plan touched. No worktree re-verification was required per the acceptance criteria's "if any other spec fails" clause, since no other spec failed after the fix above.
- `npm test`: 853/853 passing.
- Phase 18 (product-repositioning-copy) is now complete: plans 18-01 through 18-05 all done.

## Self-Check: PASSED
- `git log --oneline --all --grep="18-05"` returns 2 commits (`1de63e8`, `e45352b`).
- `npm run build` succeeded.
- `npx playwright test` (full suite): 111 passed; only the 2 pre-existing `selector-drift-ui.spec.ts:423`/`:441` failures remain.
- `npm test`: 853/853 passing.
- All 7 `files_modified` from the plan frontmatter were the only files touched (`git diff --stat` on both commits combined = exactly those 7 files).

---
*Phase: 18-product-repositioning-copy*
*Completed: 2026-11-02*
