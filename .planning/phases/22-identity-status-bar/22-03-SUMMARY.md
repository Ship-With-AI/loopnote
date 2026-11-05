---
phase: 22-identity-status-bar
plan: 03
subsystem: ui

tags: [vue, playwright, vitest, status-bar, accessibility]

# Dependency graph
requires:
  - phase: 22-identity-status-bar/22-02
    provides: IdentityPill.vue/IdentityPopover.vue carrying the richer session description, wired into TitleBar.vue/App.vue
provides:
  - "StatusBar.vue left item now shows a bare 7-char identifier (digest or pinned Head SHA) instead of a richer label"
  - "StatusBar.vue comment-count item shows '💬 N open · M stale' with the stale segment in warning ink"
  - "StatusBar.vue's single emphasized item mirrors attachedLifecycle: Export / Finish review / Finishing… (disabled, aria-busy) / Finished"
  - "App.vue statusbarIdentifier and staleCommentCount computeds, threaded into <StatusBar> alongside the attached-lifecycle ternary already used by <TitleBar>"
  - "agent-ready-export.spec.ts's 8 'Finish review' locators disambiguated against the new status-bar item via BottomPanel's 'Finish attached review' region"
affects: [22-identity-status-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StatusBar.vue follows IdentityPill.vue's convention: a non-setup <script lang=\"ts\"> block exports pure, directly-unit-tested helper functions (openCommentSegment, staleCommentSegment, emphasisLabel) consumed by the <script setup> block"

key-files:
  created:
    - tests/unit/status-bar.test.ts
  modified:
    - src/web/components/workbench/StatusBar.vue
    - src/web/App.vue
    - tests/e2e/agent-ready-export.spec.ts

key-decisions:
  - "Extracted StatusBar's comment-count/emphasis-label logic into exported pure functions (openCommentSegment, staleCommentSegment, emphasisLabel) rather than mounting the component in tests, matching the existing identity-pill.test.ts precedent of unit-testing exported pure functions instead of DOM-mounting Vue SFCs."
  - "Kept disabled/aria-busy bindings as direct inline template expressions (attachedLifecycle === 'finishing'), matching the plan's literal spec, rather than introducing another named computed beyond emphasizedBusy."

patterns-established:
  - "Comment-count and stale-count segments are invariant adjectives ('open'/'stale'), never pluralized nouns — avoids the Phase 20 '{{n}} open comment{{s}}' pluralization defect class structurally."

requirements-completed: [STAT-01, STAT-02, STAT-03]

# Metrics
duration: 45min
completed: 2026-11-05
status: complete
---

# Phase 22 Plan 03: StatusBar identifier, stale comment count, and agent-attached Finish/Finishing/Finished label Summary

**StatusBar.vue's left item is now a bare 7-char digest/SHA, its comment-count item gains a warning-ink stale segment, and its single emphasized item mirrors `attachedLifecycle` (Export → Finish review → Finishing… → Finished) instead of always reading "Export."**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-11-05T13:15:00Z (approx.)
- **Completed:** 2026-11-05T14:00:28Z
- **Tasks:** 2
- **Files modified:** 3 (+1 new test file)

## Accomplishments
- `StatusBar.vue` reworked: `identifier` prop replaces `snapshotLabel`, new `staleCommentCount` prop renders a warning-ink stale segment, and a new `attachedLifecycle` prop drives the emphasized item's label/disabled/aria-busy state.
- `App.vue` now computes `statusbarIdentifier` (digest7/reviewKey7/headOid7 per session kind) and `staleCommentCount` (same stale/orphaned condition `hasUnverifiedAnchors` already uses, counted instead of tested), threading both plus the `isAttachedSession`-gated `attachedLifecycle` ternary (duplicated verbatim from `<TitleBar>`'s own binding) into `<StatusBar>`. The now-fully-unused `snapshotLabel` computed is deleted.
- All 8 previously page-scoped `page.getByRole('button', { name: 'Finish review', exact: true })` locators in `agent-ready-export.spec.ts` are rescoped to `page.getByRole('region', { name: 'Finish attached review' })`, matching the file's own pre-existing precedent, disambiguating them against the new status-bar item that now shares the same accessible name.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD, RED):** `8069cc9` (test) — failing `tests/unit/status-bar.test.ts` for `openCommentSegment`/`staleCommentSegment`/`emphasisLabel`.
2. **Task 1 (TDD, GREEN):** `588cb10` (feat) — `StatusBar.vue` rework: identifier prop, stale-comment-count prop + warning-ink span, attachedLifecycle-driven emphasized-item label/disabled/aria-busy.
3. **Task 2:** `27385d6` (feat) — `App.vue` computeds wired into `<StatusBar>`; 8 `agent-ready-export.spec.ts` locators region-scoped.

**Plan metadata:** (this commit) `docs(22-03): add plan summary`

## Files Created/Modified
- `tests/unit/status-bar.test.ts` - RED/GREEN unit coverage for the three new exported pure helpers
- `src/web/components/workbench/StatusBar.vue` - identifier/staleCommentCount/attachedLifecycle props, template, `.statusbar__stale` style rule
- `src/web/App.vue` - `statusbarIdentifier`/`staleCommentCount` computeds, `<StatusBar>` wiring, `snapshotLabel` deleted
- `tests/e2e/agent-ready-export.spec.ts` - 8 "Finish review" locators region-scoped to `Finish attached review`
- `.planning/phases/22-identity-status-bar/deferred-items.md` - logged one pre-existing, out-of-scope packaged-binary test failure (not caused by this plan)

## Decisions Made
- Followed `identity-pill.test.ts`'s established convention of testing exported pure functions directly rather than mounting the Vue SFC with `@vue/test-utils` (not used anywhere in this unit suite).
- Duplicated the `attached-lifecycle` ternary verbatim into `<StatusBar>`'s binding rather than extracting a shared computed, per the plan's explicit instruction and this phase's established per-component view-model duplication convention.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx playwright test tests/e2e/agent-ready-export.spec.ts tests/e2e/agent-ready-export-safety.spec.ts` alone collects 0 tests from `agent-ready-export.spec.ts`: the default `playwright.config.ts` has `testIgnore: custodyGatedSpecs`, which excludes that file (it requires the packaged-artifact custody flow). Resolved by running it separately against `playwright.runtime-artifact.config.ts` with a freshly packed `development-check` runtime artifact (`node scripts/pack-runtime.mjs --purpose development-check --custody-dir <dir> --evidence <path>`) and the four `LOOPNOTE_RUNTIME_*` env vars it requires, exactly as `npm run test:runtime-artifact` already does for this file. `agent-ready-export-safety.spec.ts` is not custody-gated and ran directly against the default config as the plan's command specified.
- Found 2 failing tests in `agent-ready-export.spec.ts` under the packaged-binary run: `installed configured support remains unavailable without outbound access and does not restrict Finish` (StatusBar's `Support Loopnote` button never becomes visible in this sandbox) and the suite's final aggregate scenario-coverage check (which only fails because the `support` scenario above never completes). Bisected by reverting `StatusBar.vue`/`App.vue`/`agent-ready-export.spec.ts` to their pre-22-03 state (commit `8a816e8`), repacking, and rerunning — the same 2 failures reproduce identically on unmodified code, confirming this is pre-existing and environment-specific (this sandbox's outbound-network/support-service configuration), not caused by this plan's changes. Logged to `deferred-items.md` per the scope-boundary rule; not fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `StatusBar.vue` and `App.vue` now fully reflect the 22-UI-SPEC.md Status Bar section; `TitleBar.vue`/`IdentityPill.vue`/`IdentityPopover.vue` from plans 22-01/22-02 were not touched.
- One pre-existing, environment-specific packaged-binary test failure remains open in `deferred-items.md` (support-button visibility under this sandbox's outbound-network configuration) — unrelated to Phase 22's StatusBar/App.vue/identity work and not blocking this phase's completion.

## Self-Check: PASSED

---
*Phase: 22-identity-status-bar*
*Completed: 2026-11-05*
