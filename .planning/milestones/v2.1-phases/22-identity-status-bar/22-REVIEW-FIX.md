---
phase: 22-identity-status-bar
fixed_at: 2026-11-05T17:40:00Z
review_path: .planning/phases/22-identity-status-bar/22-REVIEW.md
iteration: 3
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-11-05T17:40:00Z
**Source review:** .planning/phases/22-identity-status-bar/22-REVIEW.md
**Iteration:** 3 (final — `--auto` cap)

**Summary (across all 3 fix passes):**
- Findings in scope: 11 total (critical_warning scope only; `--all` not passed, so the accumulated Info findings — IN-01..IN-09 as of iteration 3 — are out of scope and left unfixed)
  - Iteration 1: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
  - Iteration 2 (re-review found 3 of iteration 1's fixes incomplete/partial, refiled under new IDs): 3 (CR-01, WR-01, WR-02)
  - Iteration 3 (re-review found iteration 2's CR-01 placement wrong, WR-02 incomplete, plus one newly-discovered WR-01 regression in the UI-review agent's own 517aacc fix): 3 (CR-01, WR-01, WR-02)
- Fixed: 11
- Skipped: 0

## Fixed Issues

### Iteration 1

**CR-01** (`tests/e2e/public-support-states.spec.ts`, `tests/e2e/marketplace-review.spec.ts`) — commit `6e3ee55`. Scoped the two remaining bare `getByRole('button', { name: 'Finish review' })` locators under `getByRole('region', { name: 'Finish attached review' })`.

**WR-01 + WR-04** (`src/web/components/workbench/IdentityPopover.vue`) — commit `403917a`. Added `standalone` arm to `worktreeSourceLabel`; replaced silent clipboard-failure swallow with a `copyState` three-state ref.

**WR-02** (`src/web/components/workbench/StatusBar.vue`, `tests/e2e/workbench-shell-smoke.spec.ts`) — commit `f0403cf`. Restored `aria-hidden` on the `💬` glyph and a meaningful `aria-label`; updated 4 locked assertions.

**WR-03** (`tests/unit/truncate-middle.test.ts`) — commit `a9d8689`. Replaced the non-discriminating astral-plane fixture with one that lands the emoji exactly at the head-slice boundary.

### Iteration 2 (re-review found these incomplete)

**CR-01 refiled** (`tests/e2e/public-support-states.spec.ts`, `tests/e2e/marketplace-review.spec.ts`) — commit `0bbb6c7`. Iteration 1's region scoping was correct but the region never existed in the DOM: neither spec opened the review panel (`BottomPanel.vue`'s `v-if="open"`) before clicking. Added a panel-open step.

**WR-01 refiled** (`tests/unit/truncate-middle.test.ts`) — commit `29a3010`. The companion combining-diacritic test was still non-discriminating (fixture placed the pair outside the output window, *and* independently, a base+combining-mark pair can never distinguish naive-vs-safe slicing since neither is a surrogate pair). Replaced with a genuinely discriminating tail-boundary astral-plane test instead of attempting to "fix" an unfalsifiable assertion.

**WR-02 refiled (WR-04 original)** (`src/web/components/workbench/IdentityPopover.vue`) — commit `0a91b19`. Iteration 1's failure state auto-cleared on the same 1200ms timer as success and was never announced. Made it persist (cleared only on retry) and added a `role="alert"` message.

### Iteration 3 (re-review found placement/layout issues in iteration 2's fixes, plus a resize bug in a parallel-peer UI-review fix)

**CR-01 refiled again** (`tests/e2e/marketplace-review.spec.ts`) — commit `9a670dd`. Iteration 2's panel-open call was placed immediately after `openRuntimeSession(..., { dismissUnverified: false })`, i.e. while the support modal's full-viewport backdrop was still deliberately up (blocking the toggle click). Moved the toggle into the shared `saveSummaryAndExport` helper, which both branches only call after dismissing the prompt.

**WR-01 (new)** (`src/web/components/workbench/IdentityPopover.vue`) — commit `d857b0a`. Not a code-review-fix regression — a bug in the UI-review agent's own viewport-clamp fix (`517aacc`, landed between iteration 1 and iteration 2 of this loop): `clampToViewport` measured the already-shifted rect on each resize, so a correctly-clamped popover read as in-bounds and had its shift reset to 0 on the next resize event. Fixed by subtracting the live shift before measuring overflow.

**WR-02 (new)** (`src/web/styles.css`) — commit `fca11fd`. Iteration 2's clipboard-failure alert added a third child to `.identity-popover__footer`'s `space-between` row with no `flex-wrap`, causing the Copy/Refresh button labels to wrap into a cramped row whenever a copy fails. Added `flex-wrap: wrap`.

## Skipped Issues

None — every in-scope (Critical/Warning) finding across all 3 iterations was fixed.

## Remaining Info findings (out of scope, not fixed — `--all` not passed)

IN-01 (unused `SelectorDriftNotice` import), IN-02 (duplicated stale-comment predicate), IN-03 (missing `pointer-events: none` on refresh progress bar), IN-04 (IdentityPill/IdentityPopover import cycle), IN-05 (no 44px touch target for `.identity-pill` at narrow widths), IN-06 (comment-count separator mismatch between visible text and accessible name), IN-07 (standalone worktree-drift sentence reads "Files in the reviewed files changed…" — grammatically correct per iteration-1's fix but mildly redundant), IN-08 (one duplicated `identityDriftKind` unit-test case), IN-09 (stale `.support-dialog-backdrop` selector class name, pre-existing).

## Verification performed per iteration

All 3 iterations verified clean via: `npx tsc --noEmit --project tsconfig.json` (0 errors, full project incl. tests), `npm run typecheck:web` (0 errors), `npx vitest run --no-file-parallelism tests/unit` (425/425 passed throughout), `npm run build` (success), `npm run verify:semantic-css` (pass), and `npx playwright test` (full default suite, 121-122/122 passed per run — the 1 occasional failure was a different, unrelated test in the `rendered-markdown-*` subsystem each time, confirmed flaky by isolated re-run passing 100%, never the same test twice, and in files untouched by any commit in this loop).

---

_Fixed: 2026-11-05T17:40:00Z_
_Fixer: PostExec22 orchestrator (acting as gsd-code-fixer across 3 fix passes interleaved with 3 `gsd-code-reviewer` re-review subagent calls; no concurrent agents touching this repo's working tree at fix time, so the worktree-isolation dance was unnecessary and fixes were applied directly on `main` with one commit per finding)_
_Iteration: 3 (loop stopped at the `--auto` cap; iteration 3's re-review has not itself been re-reviewed)_
