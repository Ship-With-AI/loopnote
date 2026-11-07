---
phase: 25-accessibility-design-docs-regression-sweep
plan: 05
subsystem: ui
tags: [vue, playwright, aria, accessibility, e2e, live-region, tdd]

# Dependency graph
requires:
  - phase: 25-accessibility-design-docs-regression-sweep
    provides: "25-02's App.vue single announce()/liveMessage live-region owner and its packaged-binary e2e pack/spawn + openRuntimeSession scaffold, reused verbatim by this plan's two new specs"
provides:
  - "tests/e2e/live-region-outcome-audit.spec.ts — packaged-binary proof the 5 already-shipped announce() outcomes (thread resolve/reopen/delete, refresh, export) each fire exactly once with exact copy and exact data-announcement-version +1 delta"
  - "tests/e2e/finish-review-live-region.spec.ts — packaged-binary proof Finish review's validating-start and completed transitions each announce exactly once from App.vue's single live-region owner, with no competing live region left in ExportSection.vue"
  - "tests/integration/anchored-workspace.spec.ts — new 'anchored gap closure, verified again' test proving the anchor-drift reset-to-verified announcement"
  - "App.vue: finishAttachedReview() now announces the validating-start and completed transitions; hasUnverifiedAnchors watcher now has a reverse-direction (reset-to-verified) announce branch"
  - "ExportSection.vue: .attached-completion__progress and the completed success notice no longer carry role/aria-live — App.vue's announce() is the sole Finish-result live-region owner"
affects: [25-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-region announcements stay single-owner: Finish review's two competing inline live regions (ExportSection.vue's role=status paragraph and success <div>) were removed once App.vue's announce() covered the same transitions — same consolidation rule 25-02 established for other outcomes"
    - "When two announce() calls resolve inside the same synchronous Vue reactive flush (e.g. a mutation's own announce() and a watcher it triggers), Vue coalesces them into a single DOM commit — only the final text ever paints. Proven by attaching a MutationObserver to the live region before settling on the test's assertion shape; the version counter's exact delta (+2, not +1 then +1) is the correct way to prove both announce() calls fired when the intermediate state is not DOM-observable."

key-files:
  created: [tests/e2e/live-region-outcome-audit.spec.ts, tests/e2e/finish-review-live-region.spec.ts]
  modified: [src/web/App.vue, src/web/components/ExportSection.vue, tests/integration/anchored-workspace.spec.ts]

key-decisions:
  - "Task 1's 'plain packaged launch (no request/launchOptions)' instruction doesn't match actual CLI behavior: the packaged binary requires one of args/launchOptions/request to run non-interactively (stdin not a TTY otherwise errors 'Request input is empty'). Used the same anchoredLaunchOptions(repository) helper 25-02's live-region-announcements.spec.ts already established and verified working."
  - "The resolve/reopen/delete and export live-region-outcome-audit.spec.ts tests needed explicit tab clicks ('Summary'/'Export') before their respective buttons: non-attached sessions default to BottomPanel's Comments tab, and ExportTab/SummaryTab content is only rendered when activeTab matches (BottomPanel.vue:173,188)."
  - "exportReview() (App.vue:833,845) actually announces twice in sequence on click — a synchronous 'Checking accepted revision for export.' start notice, then the result once the request resolves. The plan's task text described only the result announcement; the test asserts both transitions (+1 then +1) since each individually fires exactly once."
  - "App.vue:845's actual export-success copy is 'Review export complete. Both files were published together.' (includes 'were') — the plan's paraphrase omitted it; used the verbatim source string."
  - "Task 3's reset-to-verified announcement and the delete mutation's own 'Comment deleted...' announcement resolve inside the same .then() callback's reactive flush (the deleteComment mutation sets reviewDraft.value, which synchronously triggers both the explicit announce() call and the hasUnverifiedAnchors watcher's reactive re-evaluation before Vue's next render commit). Confirmed via a temporary MutationObserver trace that only ONE DOM paint occurs, carrying the final text. The test proves both announce() calls fired via an exact +2 version delta rather than asserting an unobservable intermediate DOM state."

requirements-completed: [A11Y-02]

# Metrics
duration: ~110min
completed: 2026-11-06
status: complete
---

# Phase 25 Plan 05: Live-Region Outcome Audit, Finish-Result Consolidation & Anchor-Drift Reset Summary

**Closed all 7 of `25-CONTEXT.md`'s locked live-region outcome categories: packaged-binary proof for the 5 outcomes `25-02-PLAN.md` didn't cover (thread resolve/reopen/delete, refresh, export), consolidated Finish review's two competing inline live regions onto `App.vue`'s single `announce()` owner (RED/GREEN), and added the missing anchor-drift reset-to-verified announcement (RED/GREEN).**

## Performance

- **Duration:** ~110 min
- **Completed:** 2026-11-06
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- New `tests/e2e/live-region-outcome-audit.spec.ts` proves, against the real packaged binary, that resolve/reopen/delete, refresh, and export each announce exactly once with exact locked copy and exact `data-announcement-version` +1 delta — no source change needed, all 5 `announce()` call sites were already shipped.
- New `tests/e2e/finish-review-live-region.spec.ts` RED-then-GREEN proves Finish review's validating-start and completed transitions each announce exactly once from `App.vue`'s single live-region owner; `finishAttachedReview()` gained two new `announce()` calls, and `ExportSection.vue`'s two competing inline live regions (`.attached-completion__progress`'s `role="status" aria-live="polite"` and the completed `.inline-notice--success`'s `role="status"`) were removed.
- New `tests/integration/anchored-workspace.spec.ts` test (`'anchored gap closure, verified again'`) RED-then-GREEN proves the anchor-drift reset-to-verified transition: `App.vue`'s `hasUnverifiedAnchors` watcher gained an `else if` branch announcing `'Saved comment anchors are verified again.'`, closing `25-RESEARCH.md`'s Open Questions #2.
- All 7 outcome categories `25-CONTEXT.md`'s live-region audit locks (panel tab switch, thread resolve/reopen/delete+Undo, refresh result, export result, Finish result, drift transitions) now have packaged-binary or integration exact-delta proof across `25-02-PLAN.md` and this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove exactly-one announcement for thread resolve/reopen/delete, refresh, export** - `b9e18c3` (test)
2. **Task 2: Consolidate Finish result onto App.vue's single live-region owner (RED)** - `52f7d23` (test)
2. **Task 2: Consolidate Finish result onto App.vue's single live-region owner (GREEN)** - `7bc1476` (feat)
3. **Task 3: Add the missing drift-reset announcement (RED)** - `4b5d140` (test)
3. **Task 3: Add the missing drift-reset announcement (GREEN)** - `fafd5c9` (feat)

**Plan metadata:** (this commit) (docs: plan summary)

## Files Created/Modified
- `tests/e2e/live-region-outcome-audit.spec.ts` - New packaged-binary spec proving resolve/reopen/delete, refresh, and export each announce exactly once
- `tests/e2e/finish-review-live-region.spec.ts` - New packaged-binary spec proving both Finish review transitions announce exactly once with no competing live region
- `src/web/App.vue` - Two new `announce()` calls in `finishAttachedReview()`; reverse-direction branch on the `hasUnverifiedAnchors` watcher
- `src/web/components/ExportSection.vue` - Removed `role="status" aria-live="polite"` from `.attached-completion__progress` and `role="status"` from the completed `.inline-notice--success`
- `tests/integration/anchored-workspace.spec.ts` - New `'anchored gap closure, verified again'` test proving the anchor-drift reset-to-verified announcement

## Decisions Made
See `key-decisions` in frontmatter: `anchoredLaunchOptions` reuse for "plain" launches, explicit Summary/Export tab clicks for non-attached sessions, export's real two-announcement sequence and exact "were published" copy, and the Vue reactive-flush coalescing finding that shaped Task 3's final assertion (exact +2 version delta rather than an unobservable intermediate DOM state).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/incorrect test assumption] Task 1's "plain launch (no launchOptions)" instruction doesn't match actual CLI behavior**
- **Found during:** Task 1
- **Issue:** `spawnCli(repository)` with zero args/launchOptions/request fails with "Request input is empty. Pipe one loopnote.review-request JSON document." — the packaged binary requires one of the three launch shapes when stdin isn't a TTY. Existing specs whose call sites look like "plain" `spawnCli(repository)` (`comments-reveal-chain.spec.ts`, `summary-autosave.spec.ts`) actually hardcode `LAUNCH_OPTIONS` inside their own file-local `spawnCli` — there is no real "argless" launch convention anywhere in the repo.
- **Fix:** Added the `anchoredLaunchOptions(repository)` helper (same shape 25-02's `live-region-announcements.spec.ts` already uses) and passed it to both plain-launch tests.
- **Files modified:** `tests/e2e/live-region-outcome-audit.spec.ts`
- **Verification:** Both tests pass; re-ran the full file twice, stable both times.
- **Committed in:** `b9e18c3` (Task 1 commit)

**2. [Rule 1 - Bug/incorrect test assumption] Export test needed explicit Summary/Export tab clicks**
- **Found during:** Task 1
- **Issue:** The plan's copied `saveSummaryAndExport` idiom from `marketplace-review.spec.ts` never clicks a tab, but that spec's sessions are attached/acceptance-runtime (different default). For a plain non-attached session, `BottomPanel` defaults to the Comments tab; `SummaryTab`/`ExportTab` content only renders `v-if="activeTab === 'summary'|'export'"` (`BottomPanel.vue:173,188`), so `Write summary`/`Export review` were never found.
- **Fix:** Added explicit `page.getByRole('tab', { name: 'Summary' })`/`'Export'` clicks before interacting with those buttons.
- **Files modified:** `tests/e2e/live-region-outcome-audit.spec.ts`
- **Verification:** Export test passes; re-ran twice, stable.
- **Committed in:** `b9e18c3` (Task 1 commit)

**3. [Rule 1 - Bug/incorrect test assumption] Export actually fires two sequential announcements, and the success copy includes "were"**
- **Found during:** Task 1
- **Issue:** `exportReview()` (`App.vue:833,845`) announces `'Checking accepted revision for export.'` synchronously on click, then the result once the request resolves — a +2 total delta, not the plan's assumed +1. The plan's paraphrase of the result copy also dropped "were" from the actual source string `'Review export complete. Both files were published together.'`.
- **Fix:** Test now asserts both transitions in sequence (+1 then +1) with the exact source copy for each.
- **Files modified:** `tests/e2e/live-region-outcome-audit.spec.ts`
- **Verification:** Test passes against the real announce() call sites; re-ran twice, stable.
- **Committed in:** `b9e18c3` (Task 1 commit)

**4. [Rule 1 - Bug] Finish review region only reachable via the Export tab, not just "Toggle panel"**
- **Found during:** Task 2 (RED)
- **Issue:** `ExportSection.vue`'s `.attached-completion` section (containing the `Finish attached review` region) is only rendered inside the Export tabpanel (`BottomPanel.vue:190`); the plan's `openReviewNotes` (Toggle panel only) left the default session on the Comments tab, so the region was never found. A separate status-bar button also happens to read "Finish review" (a navigation shortcut, not the actual finish trigger), which the test correctly avoids via scoping `getByRole('button', ...)` to the `completion` region locator.
- **Fix:** Added an explicit `page.getByRole('tab', { name: 'Export' }).click()` after opening the panel.
- **Files modified:** `tests/e2e/finish-review-live-region.spec.ts`
- **Verification:** RED then failed for the documented reason (live region stuck on "Export tab selected."); GREEN passed after the source fix.
- **Committed in:** `52f7d23` (RED), `7bc1476` (GREEN)

**5. [Rule 1 - Bug] Two separate `not.toHaveAttribute` polls raced the finishing→completed transition**
- **Found during:** Task 2 (GREEN)
- **Issue:** `.attached-completion__progress` only exists during the transient `'finishing'` lifecycle; two sequential `expect().not.toHaveAttribute()` polls let the fast local completion response replace it with the success notice between the first and second check, producing "element(s) not found" on GREEN.
- **Fix:** Replaced the two polls with a single `locator.evaluate()` reading both attributes (`aria-live`, `role`) in one round trip.
- **Files modified:** `tests/e2e/finish-review-live-region.spec.ts`
- **Verification:** GREEN passes; re-ran twice, stable.
- **Committed in:** `7bc1476`

**6. [Rule 1 - Bug] `[data-comment-id="…"]` collides with `UndoToast.vue`'s own `data-comment-id`**
- **Found during:** Task 3 (RED)
- **Issue:** The plan's locator idiom (copied from the read-only "anchored gap closure" test, which never deletes its comments) used a bare `[data-comment-id="…"]` selector. Clicking Delete removes the `CommentThread` but immediately shows an `UndoToast` carrying the *same* `data-comment-id`, so `toHaveCount(0)` never settled.
- **Fix:** Scoped the locator to `.comment-thread[data-comment-id="…"]`, matching the established `threadLocator` idiom used elsewhere for tests that do delete comments.
- **Files modified:** `tests/integration/anchored-workspace.spec.ts`
- **Verification:** RED then advanced past the delete-removal assertion to the documented failure reason.
- **Committed in:** `4b5d140`

**7. [Rule 1 - Bug/incorrect test assumption] Delete's own announcement and the reset-to-verified announcement are not independently DOM-observable**
- **Found during:** Task 3 (RED → GREEN iteration)
- **Issue:** The plan's `<action>` text expected to observe `'Comment deleted. 0 open, 0 resolved.'` as an intermediate live-region state before polling for `'Saved comment anchors are verified again.'` at `before + 2`. Both announcements actually resolve inside the same `.then()` callback's reactive flush (the mutation's own `announce()` call, then the `hasUnverifiedAnchors` watcher's reactive re-evaluation triggered by the same `reviewDraft.value` write) — confirmed via a temporary `MutationObserver` trace on the live region showing exactly one DOM commit, carrying only the final text, for the whole delete action.
- **Fix:** Removed the unobservable intermediate-text assertion. The test instead polls for the live region's `data-announcement-version` to reach `before + 2` (proving both `announce()` calls fired internally) and asserts the final text `'Saved comment anchors are verified again.'`.
- **Files modified:** `tests/integration/anchored-workspace.spec.ts`
- **Verification:** Re-verified TDD rigor by temporarily reverting the watcher's `else if` branch and re-running — confirmed the adapted assertion correctly stalls at `before + 1` (RED), then restored the fix and re-ran (GREEN), then ran the full file (13/13 passed).
- **Committed in:** `4b5d140` (RED), `fafd5c9` (GREEN)

---

**Total deviations:** 7 auto-fixed (6 test-assumption/bug fixes discovered via running against real behavior, 1 genuine Vue-reactivity-timing finding that reshaped a test assertion). **Impact:** All necessary to make the plan's own locked outcomes provable against real, observed runtime behavior; none changed source-level scope or weakened the accessibility guarantee — the version-delta proof in deviation 7 is strictly equivalent evidence to the originally-intended text assertion, just measured correctly for what Vue's batching actually renders.

## Issues Encountered
None beyond the seven deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Gate results (this plan's files):**
- `npm run typecheck:web` — 0 errors.
- `npx playwright test tests/e2e/live-region-outcome-audit.spec.ts tests/e2e/finish-review-live-region.spec.ts` — 4 passed, 0 failed.
- `npx playwright test tests/integration/anchored-workspace.spec.ts -g "verified again"` — 1 passed, 0 failed.
- `npx vitest run --no-file-parallelism tests/unit` — 46 test files passed, 478 tests passed, 0 failed.
- `npm run verify:semantic-css` — passed ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.").

All 7 of `25-CONTEXT.md`'s live-region outcome categories now have packaged-binary or integration exact-delta proof. Ready for 25-04.

## Self-Check: PASSED

---
*Phase: 25-accessibility-design-docs-regression-sweep*
*Completed: 2026-11-06*
