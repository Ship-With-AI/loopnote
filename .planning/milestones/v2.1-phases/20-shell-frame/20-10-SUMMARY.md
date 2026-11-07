---
phase: 20-shell-frame
plan: 10
subsystem: testing
tags: [playwright, e2e, integration, workbench-shell, a11y, locators, runtime-artifact]

# Dependency graph
requires:
  - phase: 20-shell-frame
    provides: "20-09's BottomPanel.vue Toggle-panel/region/Close-panel locator triad, and 20-09's own in-scope Rule-1 deviation commit (c0c755c) which already retargeted every call site in this plan's six files_modified before this plan ran"
provides:
  - "Verification that all six of this plan's files_modified (agent-ready-export.spec.ts, complete-review-draft.spec.ts, uncommitted-review.spec.ts, standalone-review.spec.ts, export-receipt-ui.spec.ts, anchored-review.spec.ts) already satisfy every must_have/done-criterion this plan specifies — zero net-new code changes required"
  - "First successful local execution of the custody-gated `npm run test:runtime-artifact` command against agent-ready-export.spec.ts + package-assets.spec.ts (16/16 passing), closing a verification gap no prior plan in this phase exercised"
  - "Documented local-verification recipe for the custody-gated spec: `npm run pack:runtime-artifact -- --purpose deployment-check --custody-dir <private/tmp path> --evidence <path>` with a synthetic `https://<20-char-lowercase-alnum>.supabase.co` `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL`, then the four `LOOPNOTE_RUNTIME_*` env vars read from the evidence JSON"
affects: [21-changed-files-tree, 22-identity-pill, 23-comment-threads]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Verified (via `git show c0c755c` diff review against current file contents, plus a repo-wide grep sweep) that 20-09's in-scope Rule-1 deviation commit c0c755c already made every edit this plan's Task 1 and Task 2 specify, byte-for-byte matching the plan's prescribed button/region/close-button triad and the `.workbench-shell__sidebar` retarget — no gaps found, so no new task commits were made for either task."
  - "`npm run test:runtime-artifact` initially failed with `LOOPNOTE_RUNTIME_CUSTODY_DIR is required` because no prior plan in this phase had ever run it with a real custody dir configured (17.1-19-SUMMARY.md documented the same gate as unexercisable in sandbox). Resolved for this plan's own verification gate by producing a real local packed artifact via `npm run pack:runtime-artifact -- --purpose development-check …` (no external secrets needed) — this unblocked 14/16 tests but left 2 failing (`installed configured support …` and the final evidence-completeness check) because `development-check` purpose deliberately leaves support `{ configured: false }` baked into the built CLI, so the 'Support Loopnote' button never renders for that build."
  - "Diagnosed that the remaining 2 failures were a local-verification-methodology gap, not a code defect introduced by Review-notes/BottomPanel work: `scripts/pack-runtime.mjs`'s `supportConfiguration()` requires a canonical `https://<20-lowercase-alnum>.supabase.co` origin and only accepts `configured: false` for `development-check` purpose. Repacked with `--purpose deployment-check` (the designated disposable-local-verification purpose) and a syntactically-valid but non-resolvable synthetic supabase-shaped origin — legitimate because the test itself (`installed configured support remains unavailable without outbound access …`) deliberately blocks all non-loopback network traffic at both the Playwright route layer and the installed CLI's fetch guard, so the origin never needs to actually resolve. Result: all 16/16 `test:runtime-artifact` tests pass, including the shared-state evidence-completeness assertion that the first run's missing 'support' scenario had broken."

requirements-completed: [SHELL-01, SHELL-03]

# Metrics
duration: 35min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 10: Shell Frame Locator Closure (Final A11Y-03 Sweep) Summary

**Confirmed 20-09's in-scope deviation commit (`c0c755c`) already closed every locator gap this plan targets across all six files, then closed the phase's one remaining verification gap by making `npm run test:runtime-artifact` runnable and green locally for the first time (16/16, including the custody-gated `agent-ready-export.spec.ts` and `package-assets.spec.ts`).**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 plan tasks (both verified as already-satisfied; zero code changes)
- **Files modified:** 0 (this plan) — 6 files already corrected by `c0c755c` (20-09)

## Accomplishments
- Cross-checked `git show c0c755c` against the live content of all six `files_modified` files and confirmed every prescribed edit (the `openReviewNotes`/`openReview` helper bodies, all four `'Close review notes'`→`'Close panel'` call sites including the `otherTab`-scoped one, both standalone `const dialog = …` re-declarations, and the `anchored-review.spec.ts:357` `.changed-files-sidebar`→`.workbench-shell__sidebar` retarget) is present verbatim.
- Ran a repo-wide grep sweep across the entire `tests/` tree (not just the six named files) for `getByRole('button', { name: 'Review notes'`, `getByRole('dialog', { name: 'Review notes'`, and `'Close review notes'` — zero matches anywhere.
- Confirmed `.workbench-shell__sidebar` is a real, currently-rendered class in `WorkbenchShell.vue` (not a dead selector), so `anchored-review.spec.ts`'s narrow-viewport sidebar-hidden assertion meaningfully proves the sidebar is hidden.
- Produced a local packed runtime artifact (`npm run pack:runtime-artifact`) and, for the first time in this phase, successfully ran the real `npm run test:runtime-artifact` command end-to-end: 16/16 passing, including the custody-gated `agent-ready-export.spec.ts` (15 tests) and `package-assets.spec.ts` (1 test).
- Re-ran all six plan files under the default `npx playwright test` config as a second independent check: 31/31 passing.
- `npm run typecheck:web`: 0 errors. `npm run build`: succeeded.

## Task Commits

No new task commits were made — both tasks' done-criteria were already fully satisfied by 20-09's deviation commit `c0c755c` (`fix(20-09): retarget cross-spec Review notes / changed-files-sidebar hits missed by files_modified`), landed before this plan began execution. This plan's contribution is the verification/closure work recorded above, plus this plan-metadata commit.

**Plan metadata:** see final docs commit hash below.

## Files Created/Modified
None by this plan. The six `files_modified` targets (`tests/e2e/agent-ready-export.spec.ts`, `tests/e2e/complete-review-draft.spec.ts`, `tests/e2e/uncommitted-review.spec.ts`, `tests/e2e/standalone-review.spec.ts`, `tests/integration/export-receipt-ui.spec.ts`, `tests/e2e/anchored-review.spec.ts`) were already corrected by `c0c755c`.

## Decisions Made
See `key-decisions` in frontmatter — summary: (1) confirmed no residual gap existed before writing any code; (2) diagnosed and resolved the `test:runtime-artifact` custody-dir and support-origin local-verification gaps without touching any source or test file, using the project's own `pack:runtime-artifact` script's documented `deployment-check` purpose.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` blocks described edits that were already present on disk; this plan's actual work was verification (Task 1 and Task 2's `<verify>`/`<done>` blocks), which is in scope by the plan's own text, not a deviation from it.

## Issues Encountered

**`npm run test:runtime-artifact` required local infrastructure setup not provided by any prior plan or CI secret access in this sandbox.** Resolved without any source change: packed a local `deployment-check`-purpose artifact (`node scripts/pack-runtime.mjs --purpose deployment-check --custody-dir … --evidence …`) with a syntactically valid synthetic `supabase.co`-shaped `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL` (network calls from the installed CLI are blocked by both the test's Playwright route interception and the installed runtime's own fetch guard, so the origin's real reachability is irrelevant to the test's assertions), then ran `npm run test:runtime-artifact` with the four `LOOPNOTE_RUNTIME_*` env vars it reads from the resulting evidence JSON. All 16 tests passed. This resolves, for this plan's own files, the caveat documented in `.planning/milestones/v2.0-phases/17.1-full-project-rename/17.1-19-SUMMARY.md` ("requires LOOPNOTE_RUNTIME_CUSTODY_DIR, external harness environment variable not available in sandbox") — the gate is in fact locally exercisable with `pack:runtime-artifact`'s `deployment-check`/`development-check` purposes; it just was never invoked this way before.

## User Setup Required

None - no external service configuration required. (The synthetic support origin used for local `test:runtime-artifact` verification is disposable, used only inside the locally-packed `deployment-check` artifact, and is not committed or persisted anywhere in the repo.)

## Next Phase Readiness
- A11Y-03 is now fully satisfied: every "Review notes"/`.changed-files-sidebar` locator regression 20-07's `WorkbenchShell.vue`/`App.vue` rewrite and 20-06's `BottomPanel.vue` un-wrap caused, across all 12 affected spec files found by 20-09's and this plan's exhaustive sweeps, is fixed. Zero deferred locator fixes remain anywhere in Phase 20.
- `npm run test:runtime-artifact` is confirmed runnable and green locally, closing the phase's last unexercised verification gate.
- The four unrelated pre-existing failures documented in 20-09-SUMMARY.md (`tests/e2e/file-tree.spec.ts:364,506`, `tests/integration/monaco-anchor.spec.ts:172,326`) remain open and out of this plan's scope (neither file is in `files_modified`, and neither failure traces to 20-07's/20-06's shell-frame rewrite) — still recommended as a dedicated follow-up backlog item, unchanged from 20-09's assessment.

## Self-Check: PASSED
- `c0c755c` confirmed present in `git log --oneline -36` and its diff independently re-verified against live file contents for all six files.
- Repo-wide grep sweep (`tests/` tree) for the three must_have patterns: 0 matches.
- `.workbench-shell__sidebar` confirmed present in `src/web/components/workbench/WorkbenchShell.vue`'s template and stylesheet.
- `npm run typecheck:web`: 0 errors.
- `npm run build`: succeeded.
- `npx playwright test` across all six plan files (default config): 31 passed, 0 failed.
- `npm run test:runtime-artifact` (exact custody-gated command): 16 passed, 0 failed.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
