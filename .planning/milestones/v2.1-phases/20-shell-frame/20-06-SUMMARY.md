---
phase: 20-shell-frame
plan: 06
subsystem: ui
tags: [vue, playwright, a11y, workbench, modal-to-region]

# Dependency graph
requires:
  - phase: 20-04
    provides: "--font-size-label / --letter-spacing-label geometry tokens (registered for EditorTitle/Breadcrumbs, reused here with zero new registration)"
provides:
  - "BottomPanel.vue: non-modal role=\"region\" aria-label=\"Review\" panel hosting ReviewNotesDialog.vue's exact body content (conflict/failure alerts, SummarySection, comment counts, ExportSection, attached-session Finish-review block), unwired until 20-07"
  - "Rewritten tests/e2e/review-notes-dialog.spec.ts exercising BottomPanel.vue via role=\"region\"/close-button instead of role=\"dialog\"/Escape (A11Y-03 same-plan locator fix)"
  - "New 'close' icon glyph registered in UiIcon.vue's UiIconName union"
affects: ["20-07 (WorkbenchShell wiring)", "Phase 23 (inline comment threads)", "Phase 24 (bottom-panel tabs)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-modal role=\"region\" panel pattern (no focus trap, no Esc-to-close) as the replacement shape for ModalDialog-wrapped content moving into the permanent shell"

key-files:
  created:
    - src/web/components/workbench/BottomPanel.vue
  modified:
    - tests/e2e/review-notes-dialog.spec.ts
    - src/web/components/ui/UiIcon.vue

key-decisions:
  - "Adjusted BottomPanel.vue's relative import paths (contracts/domain/model + sibling component imports) for the extra workbench/ directory depth versus ReviewNotesDialog.vue — the plan's 'nothing else in the script changes' instruction covers logic/computed/refs/watchers, not import paths that must resolve correctly for typecheck to pass from the new location."
  - "Added 'close' icon glyph (simple X path, no circle) to UiIcon.vue's UiIconName union, per the plan's own Task 1 instruction, following the 20-03 precedent of registering new glyphs alongside the workbench component that first needs them."
  - "Added exact: true to the rewritten spec's page.getByRole('region', { name: 'Review' }) locator — Playwright's default substring name matching otherwise also matches the nested 'Review comment counts' section (an implicit ARIA region via its own aria-label), producing a strict-mode ambiguous-locator failure."

requirements-completed: [SHELL-01, SHELL-03]

# Metrics
duration: 25min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 06: BottomPanel.vue Summary

**Un-wrapped `ReviewNotesDialog.vue`'s ModalDialog-hosted body verbatim into a non-modal `role="region" aria-label="Review"` `BottomPanel.vue`, and in the same plan rewrote its sole breaking Playwright spec off `role="dialog"`/Escape onto `role="region"`/close-button (A11Y-03).**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `BottomPanel.vue` renders the identical conflict/failure alerts, `SummarySection`, comment-count badges, `ExportSection`, and attached-session Finish-review block (all 7 `attachedLifecycle` branches) that `ReviewNotesDialog.vue` rendered inside `ModalDialog` — now as a non-modal `role="region"` panel with only a REVIEW label + close button for chrome.
- Both focus-management `watch()` calls (the combined `attachedLifecycle`/`attachedFailure` watcher covering finishing/completed/waitingDisconnected/terminalFailure, and the `reviewFailure` watcher) carried over byte-for-byte — screen-reader users tracking an attached review's lifecycle keep receiving the same focus moves; only `ModalDialog`'s own `containFocus`/focus-restore machinery is gone, automatically, by virtue of the wrapper's removal.
- Registered a new `'close'` icon glyph in `UiIcon.vue` for the panel's close button.
- Rewrote `tests/e2e/review-notes-dialog.spec.ts` to mount `BottomPanel.vue` directly, assert `role="region"` name `"Review"`, and exercise the `✕`-equivalent close button instead of Escape (SHELL-03's close affordances are the close button, ⌘J, and the title-bar toggle only — never Escape).

## Task Commits

Each task was committed atomically:

1. **Task 1: BottomPanel.vue** - `fe4fb1a` (feat)
2. **Task 2: Rewrite tests/e2e/review-notes-dialog.spec.ts for BottomPanel.vue (A11Y-03)** - `46e1262` (test)

## Files Created/Modified
- `src/web/components/workbench/BottomPanel.vue` - Non-modal `role="region" aria-label="Review"` panel; script setup copied verbatim from `ReviewNotesDialog.vue` (import paths adjusted for directory depth); template body copied verbatim (lines 110-321 of the source), wrapped in a new `<section>` + `REVIEW` header instead of `ModalDialog`
- `tests/e2e/review-notes-dialog.spec.ts` - Mounts `BottomPanel.vue`; locates it via `getByRole('region', { name: 'Review', exact: true })`; closes via the close button instead of Escape; renamed to describe what it now verifies
- `src/web/components/ui/UiIcon.vue` - Added `'close'` to `UiIconName` and its SVG arm (simple crossing-diagonals X, no circle)

## Decisions Made
See `key-decisions` in frontmatter: import-path adjustment for the new directory depth, `'close'` icon registration per the plan's explicit instruction, and `exact: true` added to the region locator to resolve a genuine Playwright strict-mode ambiguity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted relative import paths for BottomPanel.vue's new directory depth**
- **Found during:** Task 1
- **Issue:** The plan's script-copy instruction says "nothing else in the script changes," but `BottomPanel.vue` lives in `src/web/components/workbench/` — one directory deeper than `ReviewNotesDialog.vue` (`src/web/components/`). Copying the import specifiers byte-for-byte (`'../../contracts/api.js'`, `'./ExportSection.vue'`, `'./ui/UiIcon.vue'`, etc.) would not resolve from the new location.
- **Fix:** Added one extra `../` segment to each relative import (`../../../contracts/api.js`, `../../../domain/product-identity.js`, `../../model/review-draft-state.js`, `../../model/workspace-state.js`, `../ExportSection.vue`, `../SummarySection.vue`, `../ui/ReviewStateBadge.vue`, `../ui/UiIcon.vue`, `../ui/PathText.vue`) — matching the existing `../../../contracts/api` / `../ui/UiIcon.vue` pattern already used by sibling `workbench/TitleBar.vue`.
- **Files modified:** `src/web/components/workbench/BottomPanel.vue`
- **Verification:** `npm run typecheck:web` passes with zero errors.
- **Committed in:** `fe4fb1a` (Task 1 commit)

**2. [Rule 1 - Bug] Added `exact: true` to the rewritten spec's region locator**
- **Found during:** Task 2
- **Issue:** The plan's literal replacement text is `page.getByRole('region', { name: 'Review' })`. Playwright's default name matching is case-insensitive substring matching, and the panel body also contains `<section class="review-notes-dialog__counts" aria-label="Review comment counts">` — an implicit ARIA region whose accessible name ("Review comment counts") also contains "Review." Without `exact: true` the locator resolves to two elements, which fails Playwright's strict-mode single-element requirement the moment any action/assertion runs on it.
- **Fix:** Added `exact: true` to the `getByRole('region', { name: 'Review' })` call, making the locator unique to the outer panel.
- **Files modified:** `tests/e2e/review-notes-dialog.spec.ts`
- **Verification:** `npx playwright test tests/e2e/review-notes-dialog.spec.ts` — 1 passed.
- **Committed in:** `46e1262` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs that would otherwise fail the plan's own verification step).
**Impact on plan:** Both fixes were required for the plan's stated `<verification>` (`npm run typecheck:web` and the Playwright spec) to actually pass; no scope creep beyond making the plan's own instructions work.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `BottomPanel.vue` exists, type-checks, and is behaviorally identical to `ReviewNotesDialog.vue` minus modal chrome; it remains unwired into `App.vue`/`WorkbenchShell.vue` as planned, ready for 20-07 to wire it into the shell.
- `tests/e2e/review-notes-dialog.spec.ts` is green against the new component, closing out A11Y-03 for this un-wrap.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*

## Self-Check: PASSED
- FOUND: src/web/components/workbench/BottomPanel.vue
- FOUND: tests/e2e/review-notes-dialog.spec.ts (modified)
- FOUND: src/web/components/ui/UiIcon.vue (modified)
- FOUND commit fe4fb1a (git log --oneline --all | grep fe4fb1a)
- FOUND commit 46e1262 (git log --oneline --all | grep 46e1262)
