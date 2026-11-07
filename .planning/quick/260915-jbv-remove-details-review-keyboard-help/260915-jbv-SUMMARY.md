---
status: complete
reconciled: 2026-11-07
---

# Quick Task 260915-jbv Summary

Removed the Details dialog, Review rail, and in-app Keyboard help outright, including their component trees, styles, and retired-surface tests.

## Changes

- Removed `DetailsDialog`, `FileMetadataPane`, `IdentityPanel`, `KeyboardHelp`, and `ReviewPanel`.
- Removed their App bindings, toolbar controls, stale-feedback rail navigation, metadata loading, and related CSS.
- Kept Review notes, Support, Changed files, inline comment creation, export, summary, Finish attached review, draft persistence, and `focus-comment` routing.
- Kept exactly two `.comments-rail__heading` CSS selectors for live prototype consumers.
- Deleted `tests/e2e/review-panel-resolved.spec.ts`; retargeted remaining specs to surviving user-visible behavior.
- Added `anchored-workspace` runtime console/page-error collection so a leftover Vue template binding fails the test.

## Deletion totals

- Five retired Vue components deleted.
- 319 retired CSS lines deleted.
- One rail-only E2E spec and 1,452 retired test lines deleted or replaced.

## Verification

- `npm run typecheck:web` — passed.
- Removed-identifier `git grep` over `src/web/` — zero matches (exit 0).
- `npm run verify:semantic-css` — passed; semantic CSS invariants passed.
- `git grep -n 'comments-rail' -- src/web/styles.css` — exactly two matches, both `.comments-rail__heading`.
- `npx playwright test tests/integration/anchored-workspace.spec.ts` — 12 passed after retargeting.
- Console-gate falsifiability: temporarily restored `:review-expanded="commentsOpen"` on `ReviewToolbar`; the host test failed at `expect(entries).toEqual([])` with `[Vue warn]: Property "commentsOpen" was accessed during render but is not defined on instance.` Restored the source; the host `diff navigation` test then passed (1 passed).
- Runtime artifact configuration: corrected explicit development-check packing produced 5 passed and 1 external-prerequisite failure. The remaining configured-support test requires `CUMPA_RELEASE_SUPPORT_SERVICE_URL`; it was unset, so the packaged runtime correctly had `support.configured === false` and no Support button. The package script `pack:runtime-artifact` itself is argless although `pack-runtime.mjs` requires purpose, custody directory, and evidence arguments.
- Default named browser run also encountered external prerequisites: marketplace review requires `CUMPA_MARKETPLACE_URL_MARKER`. Earlier pre-fix runs exposed retired test references; those were corrected before the Task 3 commit.

## Accepted capability losses

Comment management through the rail; browsing stale/orphan anchor records; comparison identity; per-file metadata; and in-app keyboard help are intentionally removed.

## Commits

1. `dbd8a70` — source surface removal.
2. `3d3ff54` — retired CSS removal.
3. `9642c11` — test cleanup and runtime binding gate.

## Self-Check: PASSED

## Follow-up verification and dead-code note

- Aggregate default browser suite after retargeting: 89 passed; two runtime-support tests did not run because their required environment was absent; the only remaining five failures were two external prerequisites (`CUMPA_MARKETPLACE_URL_MARKER` and `CUMPA_RUNTIME_CUSTODY_DIR`) plus saturated-machine retries that passed cleanly for `responsive-session` and `anchored-workspace`.
- `selector-drift-ui` had one real regression: its fixture treated removed Details metadata calls as failures. The retry now models only the two `/content` requests (one failure, then recovery); `npx playwright test tests/integration/selector-drift-ui.spec.ts` passed 5/5.
- `GET /api/files/:fileId` and `SessionClient.getFileMetadata()` remain but are now dead code: the removed Details dialog was their only UI caller.
- `responsive-session.spec.ts` passed after blurring the retargeted Next change focus subject before the next 320px drawer interaction. The focus tooltip can overlay a sibling control at that width; that is existing `UiTooltip` overlay behavior exposed by the test sequence, not an app regression.

## Milestone-audit metadata reconciliation (2026-11-07)

The open-artifact scanner reported `unknown` because this historical summary lacked a `status` field, not because its implementation was missing. Commits `dbd8a70`, `3d3ff54`, and `9642c11` were independently confirmed in history. The completion record above and PROJECT.md's historical capability-loss note agree on the delivered scope. Added `status: complete`; no historical test was rerun or relabeled. External-prerequisite limitations and the orphan-metadata-route debt remain documented above and in STATE.md.
