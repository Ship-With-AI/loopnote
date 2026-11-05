---
phase: 22-identity-status-bar
plan: 04
subsystem: testing
tags: [playwright, vue, css, identity-pill, locator-remediation]

# Dependency graph
requires:
  - phase: 22-identity-status-bar
    provides: "IdentityPill.vue/IdentityPopover.vue (plan 22-02), reworked StatusBar.vue (plan 22-03)"
provides:
  - "All seven e2e/integration spec files passing against the packaged build with every .session-header__comparison/.pin-cue/' · '-separator locator retargeted to .identity-pill/.identity-popover"
  - "A fixed .titlebar__center stacking-context bug that made the identity popover's interactive controls (Copy, Refresh, Launch new comparison) genuinely unclickable in real Chromium whenever the popover overlapped page content below the title bar"
affects: [22-identity-status-bar, any future phase touching TitleBar.vue/IdentityPopover.vue positioning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Center absolutely-positioned chrome elements via inset-inline:0 + margin-inline:auto + width:fit-content, not left:50%+transform:translateX(-50%) — transform always creates a stacking context, which can trap a descendant's z-index below later-painted sibling regions"

key-files:
  created: []
  modified:
    - tests/e2e/pinned-session.spec.ts
    - tests/e2e/workbench-shell-smoke.spec.ts
    - tests/integration/selector-drift-ui.spec.ts
    - tests/e2e/uncommitted-review.spec.ts
    - tests/e2e/standalone-review.spec.ts
    - tests/integration/anchored-workspace.spec.ts
    - tests/integration/draft-recovery-ui.spec.ts
    - src/web/components/workbench/TitleBar.vue

key-decisions:
  - "Fixed the .titlebar__center transform/stacking-context bug in source (Rule 1 deviation, explicitly authorized by the orchestrator mid-execution) rather than leaving the test unfixable or force-clicking past a genuine, newly-introduced production defect"
  - "Did not touch tests/e2e/responsive-session.spec.ts — it still references the dead .session-header__comparison class, but it is outside this plan's files_modified scope and was last touched in phase 21, not by any phase-22 plan; flagged to the orchestrator rather than silently expanding scope"

patterns-established:
  - "Pattern: when an absolutely-positioned popover must paint above sibling chrome regions, center its host via inset+margin-auto, not transform, to avoid trapping its z-index in a local stacking context"

requirements-completed: [IDENT-01, IDENT-02, IDENT-03, IDENT-04]

# Metrics
duration: ~70min
completed: 2026-11-05
status: complete
---

# Phase 22 Plan 04: Identity-pill locator remediation across 7 spec files, plus a Rule-1 CSS stacking-context fix for the popover's unclickable controls

**Retargeted every e2e/integration Playwright locator broken by plan 22-02's IdentityPill.vue/IdentityPopover.vue markup across 7 spec files, and fixed a newly-discovered production bug where the identity popover's Copy/Refresh/Launch-new-comparison controls were genuinely unclickable in real Chromium whenever the popover overlapped page content below the title bar.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2 (both completed) + 1 Rule-1 deviation
- **Files modified:** 8 (7 test specs + 1 source file)

## Accomplishments

- Fixed all locator breaks across the 7 files plan 22-02's/22-04's own scope named: `.session-header__comparison` → `.identity-pill`, dropped the removed `" · "` ref/SHA separator, deleted the dead `'Pinned comparison'`/`'Frozen snapshot'`/`'Frozen patch'` exact-text assertions with no replacement (text was deleted outright, not relocated), and rescoped unscoped exact-text `'BASE'`/`'HEAD'` locators to `.identity-pill__label` to resolve Playwright strict-mode violations (the staged/unstaged/working-tree pill's base-ref text is itself the literal word `HEAD`).
- Opened the identity popover before every assertion that now depends on content that only mounts inside `.identity-popover` (the dirty badge, `SelectorDriftNotice`, the exact-patch no-refresh guidance text) — these previously lived in an always-visible warning strip / title bar and are now popover-only.
- Added two small, explicitly-flagged coverage additions (not break-fixes) per the Phase 20 SHELL-05 precedent: an exact-patch no-refresh-guidance-text check and an agent-attached identity-pill/statusbar presence check.
- Discovered and fixed (Rule 1, orchestrator-authorized) a real production bug: `.titlebar__center`'s `transform: translateX(-50%)` centering trapped `.identity-popover`'s `z-index: 10` inside a local stacking context, so `.workbench-shell__editor`'s later-painted content silently covered the popover's interactive controls whenever the popover (routinely ~580px tall) extended past the title bar — the common case for any user with the page scrolled to top. Fixed by switching to `inset-inline: 0; margin-inline: auto; width: fit-content` centering, which is transform-free and creates no stacking context.
- Discovered and fixed (Rule 1) a second, independent break in `workbench-shell-smoke.spec.ts`'s exact-patch test: its `assertExportItem(page, true)` check expected literal `'Export'` text, but every non-interactive stdin `review-request` (this test's launch shape) always resolves server-side to an agent-review-attached session, and the reworked `StatusBar.vue` (plan 22-03) now unconditionally swaps the emphasized item's label to `'Finish review'` whenever `attachedLifecycle` is defined. Verified via a disposable `e7bb68c` worktree that this exact assertion passed before phase 22 (old `StatusBar` never varied the label by lifecycle), confirming the break is new, not pre-existing, so it was fixed rather than left or documented-as-pre-existing.

## Task Commits

1. **Task 1: Fix the three locator breaks already scoped to plan 22-02's own Task 3** (pinned-session.spec.ts, workbench-shell-smoke.spec.ts, selector-drift-ui.spec.ts) - `f8a8bb2` (fix)
2. **Task 2: Fix the four additional locator breaks beyond plan 22-02's original scope** (uncommitted-review.spec.ts, standalone-review.spec.ts, anchored-workspace.spec.ts, draft-recovery-ui.spec.ts, plus selector-drift-ui.spec.ts's second independent break committed in Task 1's commit since it's the same file) - `4b0f173` (fix)
3. **Rule 1 deviation: fix the `.titlebar__center` stacking-context bug** (TitleBar.vue) - `623ba10` (fix)

**Plan metadata:** this commit (docs: add plan summary)

## Files Created/Modified

- `tests/e2e/pinned-session.spec.ts` - Retargeted 7 `.session-header__comparison` assertions to `.identity-pill`, dropped `' · '` separators, deleted 2 `'Pinned comparison'` assertions, added 2 popover-open clicks before dirty-badge checks
- `tests/e2e/workbench-shell-smoke.spec.ts` - Rescoped BASE/HEAD locators to `.identity-pill__label` in 2 tests, replaced 3 dead pill-text assertions, deleted 2 `'Frozen snapshot'`/`'Frozen patch'` assertions, added popover no-refresh-guidance coverage, added agent-attached identity-pill/statusbar coverage, fixed the agent-attached Export/Finish-review label mismatch
- `tests/integration/selector-drift-ui.spec.ts` - Opened popover before `SelectorDriftNotice` assertions, replaced the always-visible-warning-strip check with a popover-scoped one, dropped `' · '` from the base-moved regex, re-opened the popover after the review-panel-close outside-click closed it, deleted the second independent `'Frozen patch'` assertion
- `tests/e2e/uncommitted-review.spec.ts` - Scoped the shared `openGeneratedUncommittedReview` helper's BASE/HEAD locators to `.identity-pill__label`
- `tests/e2e/standalone-review.spec.ts` - Replaced the deleted `'Standalone review · {N} files'` pill text with a `.identity-pill` `'{N} files'` check
- `tests/integration/anchored-workspace.spec.ts` - Dropped the removed `' · '` separator from the base-endpoint banner regex
- `tests/integration/draft-recovery-ui.spec.ts` - Deleted the dead `'Frozen patch'` exact-text assertion
- `src/web/components/workbench/TitleBar.vue` - Replaced `.titlebar__center`'s transform-based centering with inset+margin-auto centering to stop trapping the identity popover's z-index in a local stacking context

## Decisions Made

- Fixed the `.titlebar__center` CSS stacking-context bug in source despite the assignment's "do not touch any source file" scope restriction, after explicitly flagging the conflict to the orchestrator and receiving authorization (option a: fix in source as a Rule 1 deviation). The alternative (force-clicking past the interception) would have masked a genuine production usability defect rather than fixed it.
- Left `tests/e2e/responsive-session.spec.ts` untouched. It still asserts against `.session-header__comparison` and fails for that reason, but it is not in this plan's `files_modified` list, was last touched in phase 21 (not by any phase-22 plan), and is not mentioned anywhere in `22-UI-SPEC.md`'s Locator & Accessible-Name Changes table — it is a gap in phase 22's own locator audit, out of this plan's assigned scope, and unrelated to the CSS fix (confirmed the failure is identical with and without the CSS change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.titlebar__center`'s transform-based centering trapped the identity popover's z-index, making its controls unclickable**
- **Found during:** Task 2's final full-gate verification pass
- **Issue:** `page.getByRole('button', { name: 'Copy pinned Base commit ...' }).click()` in `selector-drift-ui.spec.ts` timed out; Playwright reported `.workbench-shell__editor`'s content intercepting pointer events at the button's coordinates. A screenshot confirmed the popover was rendered in the DOM (correct bounding box) but entirely invisible, painted behind the editor region. Root cause: `.titlebar__center { left: 50%; transform: translateX(-50%); }` establishes a new CSS stacking context (any non-`none` `transform` does), trapping `.identity-popover`'s `z-index: 10` inside it instead of letting it compete against `.workbench-shell__editor` (which has no stacking context of its own and simply paints later in DOM order within the shared ancestor context).
- **Fix:** Replaced the centering technique with `inset-inline: 0; margin-inline: auto; width: fit-content;`, which centers an intrinsically-sized absolutely-positioned box identically without creating a stacking context.
- **Files modified:** `src/web/components/workbench/TitleBar.vue`
- **Verification:** Visual screenshot before/after confirmed the popover now paints above editor content; `selector-drift-ui.spec.ts`'s Copy-pinned-commit click now succeeds without `force: true`; a temporary (reverted) manual check confirmed `.identity-popover__refresh` is also clickable while overlapping editor content; `typecheck:web` (0 errors), `verify:semantic-css` (pass), full unit suite (425/425 unchanged), full 7-file Playwright gate (53/53 passed) after the fix. Explicitly authorized by the orchestrator mid-execution (this fix falls outside this plan's stated "test files only" scope).
- **Committed in:** `623ba10`

**2. [Rule 1 - Bug] `workbench-shell-smoke.spec.ts`'s exact-patch test asserted the status bar's emphasized item was literally `'Export'`, but the session always resolves agent-attached**
- **Found during:** Task 2's final full-gate verification pass
- **Issue:** `assertExportItem(page, true)` checked `getByRole('button', { name: 'Export', exact: true })`, which timed out. The exact-patch test launches via a stdin JSON `review-request`, which (per the test file's own comment, confirmed against `src/cli/run.ts`) always resolves server-side to an agent-review-attached session. The reworked `StatusBar.vue` (plan 22-03) now unconditionally swaps the emphasized item's label to `'Finish review'` whenever `attachedLifecycle` is defined, regardless of session kind — so the real rendered button text is `'Finish review'`, not `'Export'`.
- **Fix:** Replaced the `assertExportItem(page, true)` call in this one test with a direct check for the `'Finish review'` button and its emphasis class.
- **Files modified:** `tests/e2e/workbench-shell-smoke.spec.ts`
- **Verification:** Checked out the pre-phase-22 commit `e7bb68c` in a disposable `git worktree` (`/tmp/diff-review-e7bb68c`, removed after use) and ran this exact test unmodified — it passed there, confirming the old `StatusBar` never varied the label by lifecycle and this break is newly introduced by phase 22 (plan 22-03), not pre-existing. Full 7-file Playwright gate (53/53 passed) after the fix.
- **Committed in:** `f8a8bb2`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug)
**Impact on plan:** Both fixes were necessary to reach a genuinely passing gate; neither introduced scope creep beyond what the gate itself surfaced. The CSS fix required explicit orchestrator authorization since it touched a source file outside this plan's stated scope.

## Issues Encountered

- The plan's own assumption that "the subsequent Copy/Launch-new-comparison button clicks need no locator change... as long as the popover opened above remains open" did not hold: clicking the "Toggle panel" button (outside `.identity-pill-host`) triggers `IdentityPopover.vue`'s outside-mousedown-close listener, closing the popover. Fixed by re-opening the popover (`page.locator('.identity-pill').click()`) immediately before the later Copy-pinned-commit click.
- `responsive-session.spec.ts` fails against the current build for an unrelated, out-of-scope reason (dead `.session-header__comparison` class, a phase-22 locator-audit gap not assigned to this plan). Flagged to the orchestrator, not fixed, per scope boundaries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All seven of this plan's scoped spec files pass against the packaged build; zero remaining assertions anywhere in them reference `.session-header__comparison`, `.pin-cue`, `'Pinned comparison'`, `'Frozen snapshot'`, `'Frozen patch'`, or a literal `" · "` separator between a ref and a SHA.
- The identity popover's interactive controls are now genuinely usable in real Chromium, not just DOM-present.
- `tests/e2e/responsive-session.spec.ts` still needs its own locator-remediation pass for the same `.session-header__comparison` break — out of this plan's scope, flagged as a known gap for a future plan.

---
*Phase: 22-identity-status-bar*
*Completed: 2026-11-05*
