---
phase: 22-identity-status-bar
reviewed: 2026-11-05T16:33:49Z
depth: standard
iteration: 3
files_reviewed: 24
files_reviewed_list:
  - src/domain/truncate-middle.ts
  - src/web/App.vue
  - src/web/components/ui/UiIcon.vue
  - src/web/components/workbench/IdentityPill.vue
  - src/web/components/workbench/IdentityPopover.vue
  - src/web/components/workbench/StatusBar.vue
  - src/web/components/workbench/TitleBar.vue
  - src/web/components/workbench/WorkbenchShell.vue
  - src/web/styles.css
  - scripts/verify-semantic-css.mjs
  - vitest.config.ts
  - tests/unit/truncate-middle.test.ts
  - tests/unit/identity-pill.test.ts
  - tests/unit/status-bar.test.ts
  - tests/e2e/agent-ready-export.spec.ts
  - tests/e2e/pinned-session.spec.ts
  - tests/e2e/workbench-shell-smoke.spec.ts
  - tests/integration/selector-drift-ui.spec.ts
  - tests/e2e/uncommitted-review.spec.ts
  - tests/e2e/standalone-review.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/integration/draft-recovery-ui.spec.ts
  - tests/e2e/public-support-states.spec.ts
  - tests/e2e/marketplace-review.spec.ts
findings:
  critical: 1
  warning: 2
  info: 9
  total: 12
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-11-05T16:33:49Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Iteration-3 re-review of the identical 24-file scope after the three iteration-2 fix commits
(`0bbb6c7` CR-01, `0a91b19` WR-02, `29a3010` WR-01). Phase diff base is `b4c1702^`
(`b4c1702 test(22-01): add failing test for truncateMiddle` is the phase's first commit).

| Iteration-2 finding | Verdict | Iteration-3 successor |
| --- | --- | --- |
| CR-01 — open the review panel before the region-scoped Finish-review click | **Partially resolved.** Correct in `public-support-states.spec.ts`; the same two lines were inserted at the wrong point in `marketplace-review.spec.ts`, where they now run while the modal support prompt is still up. | CR-01 |
| WR-01 — make the combining-diacritic codepoint test able to fail | **Resolved.** | — |
| WR-02 — keep the popover's clipboard failure visible and announced | **Resolved** behaviourally; the markup the fix added carries a new layout defect. | WR-02 |
| IN-01 … IN-06 | Unfixed (outside the `critical_warning` fix scope); all six re-verified still present. | IN-01 … IN-06 |

**Resolution evidence.** `tests/unit/truncate-middle.test.ts:68-84` now asserts a *tail-boundary*
astral case: for `'a'.repeat(15) + '📁' + 'c'.repeat(8)` (24 codepoints, 25 UTF-16 units) and
`max = 20`, `truncate-middle.ts:11-13` yields `tailLen = 9`, so the emoji is the first codepoint of
the tail slice. The real `Array.from`-based slice keeps `📁` intact, while a UTF-16-naive
`text.slice(text.length - 9)` would start at index 16 — the low surrogate — and both
`expect(result).toContain('📁')` and the lone-surrogate regex would fail. The test is therefore
discriminating, which is exactly what iteration-2 WR-01 asked for; the commit's reasoning that no
fixture placement could make the *diacritic* assertion discriminating (base + combining mark are one
UTF-16 unit each, so naive and codepoint slicing are byte-identical) is correct, so replacing rather
than relocating it was the right call. `IdentityPopover.vue:197-220` now clears the pending timer and
resets `copyState` to `'idle'` at the top of `copyIdentity`, leaves the `'failed'` branch with no
reset timer, and `:313-315` renders a persistent `role="alert"` sibling — matching
`CopyButton.vue:36,52-57`, `SelectorDriftNotice.vue:69` and `ReceiptFileRow.vue:43`, which all keep
failure text until the next attempt. A re-failed retry re-announces, because the `v-if` node is
removed on the synchronous `'idle'` reset and re-inserted when the rejection lands.

## Critical Issues

### CR-01: Open the review panel after dismissing the support prompt, not before

**File:** `tests/e2e/marketplace-review.spec.ts:95-96`
**Issue:** The panel-open sequence was inserted immediately after
`openRuntimeSession(page, …, { dismissUnverified: false })` (`:94`), i.e. while the support
invitation is deliberately still open — `dismissUnverified: false` is the whole point of this call
site, and the spec asserts the prompt is up two lines later (`:99-101`, `modalPromptBlocksInteractiveActions: true`).
That prompt is `ModalDialog.vue`'s `.modal-dialog-backdrop`, `position: fixed; z-index: 20; inset: 0`
with a scrim background (`styles.css:733-741`), rendered over a shell that `App.vue:1335` marks
`:inert="shellModalOpen"` (`shellModalOpen` is true whenever `shellDialog !== null`, and
`supportDialogOpen` is `shellDialog === 'support'`, `App.vue:98,118`). A click on the title bar's
`Toggle panel (⌘J)` button therefore cannot pass Playwright's "receives pointer events" check: the
backdrop is the hit target, and the button is inside an inert subtree. The click retries until the
action timeout and the test fails.

This is deterministic in the `pre-restore` window, because `observedSupportMode` (`:65-77`) throws
unless the live observation is `enabled && observedStatus === 'unverified'` — the state in which the
invitation is always open — and it also breaks the `post-restore` path whenever the live status is
`unverified` (`:142-146` dismisses the same dialog only *after* line 95). Only the verified /
support-disabled post-restore shape survives. The release-gated marketplace acceptance driver thus
fails earlier than before the fix, not later: iteration-2's diagnosis (the panel must be open,
because `SummarySection`'s `Write summary` button at `SummarySection.vue:228` and the
`Finish attached review` region at `BottomPanel.vue:187` both live inside `BottomPanel.vue:103`'s
`v-if="open"`, and `panelOpen` starts `false` at `App.vue:94`) was right; the placement is not.
Both branches dismiss the prompt before calling `saveSummaryAndExport` (`:118-121`, `:144-148`), so
one toggle at the top of that shared helper satisfies the `Write summary` click and the later
region-scoped `Finish review` click (`:123`, `:150`) in both windows, with no interaction before the
dismissal.

**Fix:** Delete `:95-96` and open the panel inside the helper both branches already share:

```ts
async function saveSummaryAndExport(page: Page): Promise<void> {
  // `SummarySection` and the `Finish attached review` region both live inside BottomPanel's
  // `v-if="open"` (BottomPanel.vue:103) and `panelOpen` starts false (App.vue:94). Open the panel
  // here — after both branches dismissed the support prompt — because the prompt is a fixed,
  // full-viewport `.modal-dialog-backdrop` (styles.css:733-741) over an `inert` shell
  // (App.vue:1335), so no title-bar click can land while it is up.
  await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Write summary' }).click();
  await page.getByLabel('Review summary (Markdown)').fill(summary);
  const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
  await page.getByRole('button', { name: 'Save summary' }).click();
  expect((await accepted).status()).toBe(200);
  const exported = page.waitForResponse((response) => response.url().includes('/api/export'));
  await page.getByRole('button', { name: 'Export review', exact: true }).click();
  expect((await exported).status()).toBe(201);
}
```

Note while fixing: `public-support-states.spec.ts:276-277` needs no change. Its
`openRuntimeSession(page, …)` call uses the default `dismissUnverified: true`, which clicks
`Not now` before returning (`tests/helpers/open-runtime-session.ts:33-37`), so the shell is neither
inert nor covered when the toggle runs, and nothing else in that fixture opens the panel first.

## Warnings

### WR-01: Clamp the identity popover from its unshifted geometry

**File:** `src/web/components/workbench/IdentityPopover.vue:45-53`
**Issue:** `clampToViewport` assigns `edgeShiftPx` an absolute correction derived from a measurement
that already contains `edgeShiftPx`. The template applies the value as
`transform: translateX(calc(-50% + ${edgeShiftPx}px))` (`:267`), so after the first successful clamp
the measured `rect` satisfies both margins by construction and the next invocation computes
`overflowLeft <= 0` and `overflowRight <= 0`, writing `0` — which un-clamps the popover and puts it
back over the viewport edge. The only re-entry point is the `resize` listener (`:252`), so resizing
the window while the popover is open alternates between clamped and overflowing on successive resize
events, and the final state is parity-dependent; whenever the last event found the popover in-bounds
(i.e. clamped), it is left overflowing. `.identity-popover` is 440px wide
(`styles.css:2125-2138`) inside `.titlebar__center`, which is itself off-centre whenever the
title bar's right group is wider (the `.attached-fact` badge case the comment at `:34-41` documents),
so the overflow is real, not hypothetical — part of the comparison rows and the Copy/Refresh controls
land outside the viewport, and `body` has no horizontal scroll affordance for a left-edge overflow.
Mount-time clamping is unaffected (`edgeShiftPx` is still 0 then), which is why this reads as correct
until the first resize.

**Fix:** Subtract the live shift before measuring overflow:

```ts
function clampToViewport(): void {
  void nextTick(() => {
    const element = panel.value;
    if (element === undefined) return;
    const rect = element.getBoundingClientRect();
    // `rect` already includes the current translation, so the next correction has to be computed
    // against the unshifted box — otherwise a correct clamp measures as in-bounds and resets to 0.
    const shift = edgeShiftPx.value;
    const overflowLeft = VIEWPORT_EDGE_MARGIN_PX - (rect.left - shift);
    const overflowRight = rect.right - shift - (window.innerWidth - VIEWPORT_EDGE_MARGIN_PX);
    edgeShiftPx.value = overflowLeft > 0 ? overflowLeft : overflowRight > 0 ? -overflowRight : 0;
  });
}
```

### WR-02: Let the popover footer wrap so the copy-failure alert gets its own line

**File:** `src/web/styles.css:2214-2220` (consumed at `src/web/components/workbench/IdentityPopover.vue:309-315`)
**Issue:** `.identity-popover__copy-failure` declares `flex-basis: 100%`, the standard "break onto my
own line" trick — but its container `.identity-popover__footer` (`styles.css:2199-2206`) is
`display: flex` with no `flex-wrap`, i.e. `nowrap`. A 100%-basis item in a nowrap row does not wrap;
it competes for the row and is shrunk together with its siblings. With ~416px of footer content box,
the three items' preferred widths (Copy button ≈ 90px, alert 416px, Refresh button ≈ 90px, plus two
8px gaps) overflow by ~196px, distributed by scaled flex shrink: the alert keeps ~279px while the
`Copy failed` button and the `Refresh to capture current changes` button (or the `__guidance`
paragraph for non-refreshable kinds) each lose ~30px. Neither `.ui-button` nor the paragraph sets
`white-space: nowrap` or `flex: 0 0 auto` (`styles.css:433-455`, `2223-2232`), so both button labels
wrap inside squeezed boxes. The failure path the iteration-2 fix added therefore renders as a cramped
three-column row instead of the intended message-below-controls layout, every time a copy fails.

**Fix:** Allow the footer to wrap (one declaration; `flex-basis: 100%` then does what it says):

```css
.identity-popover__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
```

## Info

### IN-01: Remove the now-unused `SelectorDriftNotice` import from `App.vue`

**File:** `src/web/App.vue:31`
**Issue:** Still present. Plan 22-02 deleted `<SelectorDriftNotice :drift="selectorDriftStatus" />`
from the shell warning stack (it now lives only at `IdentityPopover.vue:301`), but the import
remains and is the only reference to the symbol left in `App.vue`. `vue-tsc` does not flag unused
`<script setup>` imports and the repo has no ESLint configuration, so no gate catches it; the sibling
symbols the same plan retired (`snapshotLabel`, the `.session-header__*` / `.pin-cue` CSS) were
deleted cleanly, making this the one gap in the phase's clean-cutover contract.
**Fix:** Delete line 31.

### IN-02: Derive `hasUnverifiedAnchors` from `staleCommentCount`

**File:** `src/web/App.vue:302-307`
**Issue:** Still present. `staleCommentCount` duplicates `hasUnverifiedAnchors`'s predicate verbatim
(`comment.status === 'stale' || comment.status === 'orphaned'`) over the same `workspaceComments`
source. Two independent copies of the same stale-comment definition can drift apart silently — one
feeds `StaleAnchorNotice`'s visibility, the other the status bar's warning-ink segment.
**Fix:**

```ts
const staleCommentCount = computed(() =>
  workspaceComments.value.filter((comment) => comment.status === 'stale' || comment.status === 'orphaned').length,
);
const hasUnverifiedAnchors = computed(() => staleCommentCount.value > 0);
```

### IN-03: Mark the refresh progress overlay `pointer-events: none`

**File:** `src/web/styles.css:261-268`
**Issue:** Still present. `.editor-refresh-progress` is `position: absolute; top: 0; left: 0;
right: 0; height: 2px` inside the newly-`position: relative` `.workbench-shell__editor`
(`WorkbenchShell.vue:225`) and is the first child of the editor slot (`App.vue:1357`). It paints in
the positioned-descendant layer above the editor's non-positioned content, so while `refreshBusy` is
true it also hit-tests over the top 2px of the editor region — where `EditorTitle` / review-toolbar
controls sit. Clicks landing in that 2px band are swallowed by a purely decorative element.
**Fix:** Add `pointer-events: none;` to the `.editor-refresh-progress` rule.

### IN-04: Move the shared identity view-model out of the SFC import cycle

**File:** `src/web/components/workbench/IdentityPopover.vue:10`, `src/web/components/workbench/IdentityPill.vue:113`
**Issue:** Still present. `IdentityPill.vue:113` imports `IdentityPopover.vue` for rendering while
`IdentityPopover.vue:10` imports `identityKind`/`identityDriftKind` back out of `IdentityPill.vue` —
a circular module dependency between two SFCs. It works today only because both helpers are hoisted
`function` declarations; converting either to a `const` arrow function, or adding a module-level call
in `IdentityPopover.vue`, would turn it into a TDZ `ReferenceError` at app boot with no type-checker
warning. The cycle is a deliberate 22-02 decision ("without separate composables/ files"), so this is
informational.
**Fix:** Extract the four pure exports into `src/web/components/workbench/identity-view-model.ts`
and have both SFCs plus `tests/unit/identity-pill.test.ts` import from there.

### IN-05: Give `.identity-pill` a touch target in the narrow arm

**File:** `src/web/styles.css:2678-2682`
**Issue:** Still present. `.identity-pill` pins `height: var(--control-height-icon)` (22px) and
`min-height: 0` (`:2038-2048`), and the `@media (max-width: 760px)` arm raises only
`.identity-disclosure` and `.copy-button` to 44px — so below the narrow breakpoint the primary
identity disclosure stays a 22px-tall target while its siblings in the same rows grow, even though
the arm also bumps `--titlebar-height` to 44px (`:2684-2686`) leaving the room for it.
**Fix:** Add `.identity-pill { min-height: 44px; height: auto; }` to that arm, alongside
`.identity-disclosure` / `.copy-button`.

### IN-06: Match the comment-count separator in the visible text and the accessible name

**File:** `src/web/components/workbench/StatusBar.vue:68-72`
**Issue:** Still present. When a stale segment exists the button's visible text is
`💬 2 open · 1 stale` while its accessible name is `Comments: 2 open, 1 stale`; the visible label is
therefore not contained in the accessible name, the condition WCAG 2.5.3 (Label in Name) checks and
speech-input users depend on. The zero and open-only cases are fine because `0` and `2 open` are both
substrings of their names. One character fixes it.
**Fix:**

```html
        :aria-label="staleSegment === undefined
          ? `Comments: ${openSegment}`
          : `Comments: ${openSegment} · ${staleSegment}`"
```

### IN-07: Reword the standalone worktree-drift sentence

**File:** `src/web/components/workbench/IdentityPopover.vue:157` (rendered at `:307`)
**Issue:** New. Iteration-1's WR-01 fix correctly stopped the empty-subject render by adding
`case 'standalone': return 'the reviewed files';`, but the surrounding sentence is
`Files in ${worktreeSourceLabel} changed after this snapshot was captured.`, so standalone sessions
now read "Files in the reviewed files changed after this snapshot was captured." The defect
(a doubled space and a missing subject) is gone; the redundancy is cosmetic and worth one more pass.
**Fix:** Branch the sentence subject instead of the label, e.g. render
`The reviewed files changed after this snapshot was captured.` when
`uncommitted?.sourceKind === 'standalone'` and keep the `Files in …` form for the three Git-backed
source kinds.

### IN-08: Drop the duplicated `identityDriftKind` test case

**File:** `tests/unit/identity-pill.test.ts:132-139`
**Issue:** New. `does not report selector drift when both sides are unchanged` (`:132-139`) and
`is undefined when nothing has drifted` (`:153-160`) pass byte-identical arguments
(`identityDriftKind(false, { base: unchanged, head: unchanged }, false)`) and assert the same
`toBeUndefined()`. One of them is dead weight; the rest of the file is sharply discriminating
(exact-string accessible-name assertions, an explicit `undefined`-status regression guard).
**Fix:** Delete one of the two cases, keeping the name that documents the intent best.

### IN-09: Refresh the stale `.support-dialog-backdrop` selector

**File:** `tests/e2e/marketplace-review.spec.ts:119,145`
**Issue:** Pre-existing (these lines are untouched by the phase diff), surfaced while proving CR-01:
the support prompt moved to the shared `ModalDialog.vue`, whose root class is
`.modal-dialog-backdrop` (`styles.css:733`); no `.support-dialog-backdrop` class exists in `src/`
anymore. `await expect(page.locator('.support-dialog-backdrop')).toBeHidden()` therefore passes
vacuously — a missing element counts as hidden — so neither call site actually waits for the scrim to
go away. The same stale selector sits in `tests/helpers/open-runtime-session.ts:36` (outside this
review's scope). It does not affect the CR-01 fix, because Playwright re-checks actionability on the
following action, but the assertion no longer proves anything.
**Fix:** Point both assertions at `.modal-dialog-backdrop`.

---

_Reviewed: 2026-11-05T16:33:49Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 3 (re-review of the scope recorded in iteration 1, after fix commits 6e3ee55, 403917a, f0403cf, a9d8689, 517aacc, 0bbb6c7, 0a91b19, 29a3010)_
