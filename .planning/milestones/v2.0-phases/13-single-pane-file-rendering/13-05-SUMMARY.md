---
phase: 13-single-pane-file-rendering
plan: 05
subsystem: testing
tags: [playwright, e2e, monaco, vue3, single-pane-rendering]

# Dependency graph
requires:
  - phase: 13-single-pane-file-rendering (13-01)
    provides: createMonacoSinglePaneAdapter / PublicMonacoSinglePaneAdapter, the plain-editor Monaco adapter this spec drives through real keyboard/mouse interaction
  - phase: 13-single-pane-file-rendering (13-02)
    provides: singlePaneSideFor routing predicate that determines added/deleted files render single-pane
  - phase: 13-single-pane-file-rendering (13-03)
    provides: DiffWorkspace.vue's single-pane template branch (.diff-workspace__editor host, singlePaneSideWord-driven gutter-action aria-label, side-label strip) and ReviewToolbar.vue's singlePane-gated Change navigation hide
  - phase: 13-single-pane-file-rendering (13-04)
    provides: StatusBadge.vue's reviewable-gated ", single pane" suffix and ActiveFileToolbar.vue's "Added · Head only" / "Deleted · Base only" layout-label copy
provides:
  - "End-to-end Playwright proof that an added file opens as one full-width Monaco pane and accepts a Head-anchored comment through the packaged CLI (PANE-01)"
  - "End-to-end Playwright proof that a deleted file opens as one full-width Monaco pane and accepts a Base-anchored comment through the packaged CLI (PANE-02)"
  - "End-to-end Playwright proof that single-pane files carry distinguishing tree/header markers a modified file does not, and that a modified file's side-by-side rendering is pixel/structurally unaffected by Phase 13 (PANE-03)"
  - "activateSinglePaneLine(page, side, text, lineNumber) test helper for driving the plain single-pane Monaco editor (Meta+g goto-line, hover+click the matching .view-line, click the Add-comment gutter affordance)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pane test helper mirrors activateMonacoLine's goto-line/hover/click sequence but targets the unqualified .diff-workspace__editor host (no .editor.original/.editor.modified split) since there is exactly one editor instance"

key-files:
  created: []
  modified:
    - tests/e2e/anchored-review.spec.ts

key-decisions:
  - "The single-pane gutter-action aria-label uses the uppercase side word ('Add comment to HEAD line N' / 'Add comment to BASE line N'), not the lowercase word the side-by-side branch uses ('Add comment to head line N'). This was discovered by reading DiffWorkspace.vue's actual singlePaneSideWord computed (`visibleSides.value.original`/`.modified`, which hold 'BASE'/'HEAD') rather than trusting the plan prose's literal `${side}` interpolation, which implied a shared lowercase convention across both branches. activateSinglePaneLine builds the button name from an explicit sideWord mapping to match the real shipped markup."
  - "Both new tests go beyond the plan's literal 'fill the composer and assert its header text' action step and also click 'Add comment', await the /api/draft/mutations 201 response, and assert the persisted draft file's comment/anchor — matching the plan's own must_haves truths ('successfully leave a comment anchored to Head/Base') and done criteria more rigorously than a header-text-only assertion would, and mirroring the existing gap-closure test's proven draft-persistence verification pattern."
  - "The deleted-file test also carries the D-11/D-05 side-by-side regression guard (selecting src/changed.ts and asserting no single-pane layout label text appears, plus exactly one .monaco-diff-editor) in the same test, inside the same fixture/CLI lifecycle, per the plan's explicit 'planner's choice, avoid a third CLI boot' instruction."

patterns-established: []

requirements-completed: [PANE-01, PANE-02, PANE-03]

# Metrics
duration: 35min
completed: 2026-10-30
status: complete
---

# Phase 13 Plan 05: Anchored-review single-pane end-to-end coverage Summary

**Two new Playwright tests drive the packaged CLI's real browser session through the added-file and deleted-file single-pane flows — confirming one full-width Monaco pane, correct tree/header markers, hidden diff-only navigation, and a successfully persisted Head/Base-anchored comment — plus a same-session regression guard proving `src/changed.ts` still renders side-by-side with no layout label.**

## Performance

- **Duration:** ~35 min (active task-commit span; research/context-reading preceded first commit)
- **Started:** 2026-10-30T13:50:00Z
- **Completed:** 2026-10-30T14:27:18Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `activateSinglePaneLine(page, side, text, lineNumber)` helper drives the plain single-pane Monaco editor (goto-line via `Meta+g`, hover+click the matching `.view-line`, click the `Add comment to {BASE|HEAD} line N` gutter affordance) — a parallel, not-copied adaptation of `activateMonacoLine` for the unpaired editor.
- `'packaged review renders an added file as one single-pane and accepts a comment'` proves PANE-01 end to end: tree row accessible name matches `/single pane/i`, header shows `Added · Head only`, exactly one `.diff-workspace__editor` and zero `.monaco-diff-editor`, no "Next change" button, and a Head-anchored comment is composed, submitted (`201` from `/api/draft/mutations`), and verified in the persisted draft JSON.
- `'packaged review renders a deleted file as one single-pane and accepts a comment'` proves PANE-02 the same way for `src/deleted.ts` (Base-anchored), and in the same CLI session also proves the PANE-03/D-11 regression guard: `src/changed.ts` shows no single-pane layout label and still renders with exactly one `.monaco-diff-editor`.
- Fixed `openGeneratedReview`'s initial-load assertion (shared by every test in the file) from `.monaco-diff-editor` to `.diff-workspace__editor`, a pre-existing bug this plan's first real run against the `anchoredReview` fixture surfaced (see Deviations).

## Task Commits

Both tasks' test content was added in one batch of file edits before the first verification pass; by the time Task 1's acceptance run passed and was committed, Task 2's test code was already present in the working tree (see Deviations — "Process note" below). Both tasks therefore share a single commit:

1. **Task 1: Added-file single-pane flow — render, comment, markers** - `baac2b5` (test)
2. **Task 2: Deleted-file single-pane flow and a side-by-side regression guard** - `baac2b5` (test, same commit as Task 1 — no further code changes were needed; Task 2's acceptance criteria were satisfied by content already present in `baac2b5`)

**Plan metadata:** pending (this summary + STATE/ROADMAP/REQUIREMENTS commit, see below)

## Files Created/Modified
- `tests/e2e/anchored-review.spec.ts` - adds `activateSinglePaneLine` helper, two new tests (added-file and deleted-file single-pane flows, the latter including the `changed.ts` side-by-side regression assertion), and a one-line fix to `openGeneratedReview`'s initial-render assertion

## Decisions Made
See `key-decisions` in frontmatter: (1) single-pane gutter-action aria-label uses uppercase `BASE`/`HEAD`, discovered by reading `DiffWorkspace.vue`'s real `singlePaneSideWord` computed rather than assuming the plan prose's literal interpolation; (2) both tests submit and verify the comment via the `/api/draft/mutations` response and persisted draft file, going beyond "fill the composer" to fully prove "successfully leave a comment" per the plan's own truths; (3) the regression guard lives inside the deleted-file test's existing fixture/CLI lifecycle rather than a third test, per the plan's explicit instruction to avoid a third CLI boot.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `openGeneratedReview`'s initial-load assertion hardcoded `.monaco-diff-editor`, which fails whenever the fixture's default-selected file renders single-pane**
- **Found during:** Task 1's first `playwright test -g "renders an added file as one single-pane"` run
- **Issue:** `openGeneratedReview` (shared by every test in this file) asserts `.monaco-diff-editor` is visible immediately after `page.goto`. App.vue auto-selects `reviewable[0]` — the first text-reviewable file in session order — on load. In the `anchoredReview: true` fixture, that first file is now `src/added.ts` (added before `src/changed.ts`/`src/deleted.ts`/`src/new-name.ts` in session file order), which 13-03 renders single-pane, not side-by-side. The helper's hardcoded diff-editor assumption is therefore false for this fixture's current default selection — a pre-existing gap in the existing suite, not something this plan's own additions caused. Confirmed pre-existing by running the unmodified `'packaged anchored gap closure recovers a non-line-1 exact anchor'` test before applying the fix: it failed identically at the same `openGeneratedReview` line.
- **Fix:** Changed the assertion target from `.monaco-diff-editor` to `.diff-workspace__editor` — the one host class both the single-pane and side-by-side `DiffWorkspace.vue` template branches render (`DiffWorkspace.vue:386,417`), so the helper now correctly asserts "a file's editor host is visible" regardless of which layout the default-selected file uses.
- **Files modified:** `tests/e2e/anchored-review.spec.ts` (test-only file, no product code touched)
- **Verification:** Re-ran the unmodified pre-existing `'packaged anchored gap closure recovers a non-line-1 exact anchor'` test — now passes. Re-ran this plan's own `'renders an added file as one single-pane'` test — passes. Full-file run (`npm run build:web && npx playwright test tests/e2e/anchored-review.spec.ts`) — all 5 tests pass, 0 failed.
- **Committed in:** `baac2b5` (Task 1 commit)

### Process note (not a code deviation)

Both tasks' test code was written in two batched `Write`/`Edit` operations before the first acceptance run (the helper, then both new tests together), rather than strictly one task's code at a time. By the time Task 1's acceptance criteria passed and were committed, Task 2's test was already present in the working tree with no further changes required, so both tasks share commit `baac2b5` instead of two separate commits. Each task's own acceptance criteria (grep counts, targeted `playwright test -g` runs) were independently verified and passed before and after this commit.

---

**Total deviations:** 1 auto-fixed (1 bug, pre-existing in the shared test helper), plus 1 process note (combined task commit, no functional impact).
**Impact on plan:** The helper fix was necessary to run any test in this file against the current `anchoredReview` fixture state; it is a test-only change confined to this plan's single owned file. No scope creep, no product code touched.

## Issues Encountered
None beyond the one auto-fixed helper bug documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PANE-01, PANE-02, and PANE-03 are now proven end to end through a real packaged-CLI Chromium session, closing out Phase 13's single-pane-file-rendering requirements.
- `activateSinglePaneLine` is available for any future test needing to drive the plain single-pane Monaco editor.
- No blockers.

---
*Phase: 13-single-pane-file-rendering*
*Completed: 2026-10-30*

## Self-Check: PASSED
