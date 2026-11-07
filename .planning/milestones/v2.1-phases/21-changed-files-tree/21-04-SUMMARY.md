---
phase: 21-changed-files-tree
plan: 04
subsystem: ui
tags: [vue, playwright, aria, keyboard-navigation, css-grid]

# Dependency graph
requires:
  - phase: 21-01, 21-02, 21-03
    provides: viewMode/lineCounts/commentBadgesEnabled props threaded through FileTree/FileRow/DirectoryRow, panelState.treeLineCounts/treeCommentBadges refs (defaulted, not yet written), the restyled row anatomy, and the view-header toolbar/filter row this plan appends a fourth button to.
provides:
  - ViewOptionsMenu.vue — hand-rolled role=menu popover with menuitemradio x3 + menuitemcheckbox x1, roving tabindex, arrow-key wrap, outside-click dismiss
  - Fourth "View options" toolbar button wired through FileTree.vue → ChangedFilesDialog.vue → App.vue, persisting panelState.treeLineCounts/treeCommentBadges
  - Packaged-binary Playwright proof that the whole changed-files tree (toolbar, filter, view-options menu, every row including a compacted folder chain) is a single Tab stop
affects: [22-identity-status-bar, 23-inline-comment-threads]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled anchored popover: document-level pointerdown listener added/removed via watch(open), guarded against the opener button via [aria-haspopup=\"menu\"] closest() check instead of a ref prop"
    - "Grid/flex item overflow containment: min-width:0 + overflow:hidden on a flex/grid row item whose non-shrinking sibling (toolbar, flex:0 0 auto) can exceed the container's definite width"

key-files:
  created:
    - src/web/components/ViewOptionsMenu.vue
  modified:
    - src/web/components/FileTree.vue
    - src/web/components/ChangedFilesDialog.vue
    - src/web/App.vue
    - src/web/components/ui/UiIcon.vue
    - src/web/styles.css
    - scripts/verify-semantic-css.mjs
    - tests/e2e/file-tree.spec.ts
    - tests/e2e/workbench-shell-smoke.spec.ts

key-decisions:
  - "ViewOptionsMenu's outside-click dismiss skips any pointerdown whose target is inside an [aria-haspopup=\"menu\"] ancestor, not just a literal ref to the opener button — avoids a props/ref coupling the plan's own prop list (lineCounts/commentBadgesEnabled/open) didn't include, and correctly prevents the close-then-reopen double-toggle bug on the button's own re-click."
  - "Popover reuses --surface-panel/--border-overlay/--radius-overlay/--shadow-overlay per the plan's own <artifacts> note; registered .view-options-menu in scripts/verify-semantic-css.mjs's overlayAllowlist (mirroring .modal-dialog/.ui-tooltip__content) since it is a new, legitimate consumer of the existing --shadow-overlay token, not a new token."
  - "Reload-based persistence proof is NOT automatable for this session kind: src/web/api/client.ts:126 strips the one-time #token= hash via history.replaceState once read at boot, so a literal page.reload() always re-sends the GET /api/session request with no token and fails 401 (confirmed by reproducing it, then tracing the exact client.ts line). file-tree.spec.ts's new test instead verifies the persisted write directly via localStorage.getItem(PANEL_STATE_STORAGE_KEY), matching the plan's own <verification> step 5, which lists the reload check as a manual cross-check, not an automated one."
  - "Comment badge seeded through the app's real Monaco gutter-action comment composer (not a raw POST /api/draft/mutations call) so the badge reflects normal client reactive state without needing a reload to resync."

requirements-completed: [TREE-05, TREE-07]

# Metrics
duration: ~90min
completed: 2026-11-05
status: complete
---

# Phase 21 Plan 04: View Options Menu & Single-Tab-Stop Keyboard Proof Summary

**New hand-rolled `role="menu"` popover (`ViewOptionsMenu.vue`) wired as the changed-files tree's fourth toolbar control, persisting line-count visibility and comment-badge display through `panelState`, plus a packaged-binary Playwright test proving the whole tree is one Tab stop — closing out TREE-05 and TREE-07, the last two Phase 21 requirements.**

## Performance

- **Tasks:** 3 planned, all committed; 1 additional deviation-fix commit for a regression the fourth button introduced
- **Files modified:** 8 (1 created)

## Accomplishments

- `ViewOptionsMenu.vue`: `role="menu"` popover, 3 `menuitemradio` (line counts: Always/On hover or selection/Never) + 1 `menuitemcheckbox` (Open comment badges), roving tabindex with wrapping arrow-key navigation, Enter/Space activation (radios keep the menu open per native menu-radio convention), Esc/outside-click dismiss.
- Fourth toolbar button (`aria-label="View options"`, `aria-haspopup="menu"`) added to `FileTree.vue`, relayed through `ChangedFilesDialog.vue`, landing in two new `App.vue` handlers that mutate `panelState.treeLineCounts`/`treeCommentBadges` and persist.
- New `more` glyph (three filled dots) added to `UiIcon.vue`.
- Packaged-binary Playwright test (`workbench-shell-smoke.spec.ts`) proves: the toolbar's four buttons + the tree are each exactly one Tab stop with the filter closed; the filter input becomes its own Tab stop once opened; a compacted multi-segment folder row (`docs/guide`) is traversed as exactly one Arrow stop; the view-options menu's four items wrap on Arrow keys and Esc returns focus to the ⋯ button; the list⇄tree toggle switches the root role.
- `file-tree.spec.ts` test proves selecting "Always" makes line counts visible at full opacity on an unselected row, toggling comment badges off hides the badge, and both selections round-trip into the `loopnote.workbench.v1` localStorage key.

## Task Commits

1. **Task 1: ViewOptionsMenu.vue — role=menu popover, hand-rolled outside-click dismiss** - `5550713` (feat)
2. **Task 2: Wire ViewOptionsMenu as fourth toolbar button through FileTree/ChangedFilesDialog/App.vue** - `91f7770` (feat)
3. **Task 3: Packaged-binary single-tab-stop keyboard proof (TREE-07 final evidence)** - `c322b5a` (feat)
4. **Deviation fix: grid-track overflow caused by Task 2's fourth button** - `51dba44` (fix)

## Files Created/Modified

- `src/web/components/ViewOptionsMenu.vue` — new component (role=menu popover)
- `src/web/components/FileTree.vue` — fourth toolbar button, `viewOptionsOpen`/`viewOptionsButton` refs, `focusViewOptionsButton()`/`closeViewOptions()`/`toggleViewOptions()`, new emits
- `src/web/components/ChangedFilesDialog.vue` — relay emits for `update:line-counts`/`update:comment-badges`
- `src/web/App.vue` — `toggleTreeLineCounts`/`toggleTreeCommentBadges` handlers, wired on `<ChangedFilesDialog>`
- `src/web/components/ui/UiIcon.vue` — `more` icon name + glyph
- `src/web/styles.css` — `.file-tree-pane__view-options`/`.view-options-menu*` popover styles; `min-width:0`/`overflow:hidden` fix on `.file-tree-pane__top` and `.file-tree-pane__label` (deviation fix)
- `scripts/verify-semantic-css.mjs` — `.view-options-menu` added to `overlayAllowlist`
- `tests/e2e/file-tree.spec.ts` — new persistence/badge-toggle test
- `tests/e2e/workbench-shell-smoke.spec.ts` — new single-tab-stop keyboard proof test

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 - inline fix] `verify:semantic-css` overlay-shadow allowlist needed a new entry**
- **Found during:** Task 1 (ViewOptionsMenu popover styling)
- **Issue:** `.view-options-menu`'s `box-shadow: var(--shadow-overlay)` tripped the gate's exact-selector `overlayAllowlist`, which is a closed `Set` of selectors permitted to use that pre-existing token.
- **Fix:** Added `.view-options-menu` to `overlayAllowlist` in `scripts/verify-semantic-css.mjs`, mirroring the existing `.modal-dialog`/`.ui-tooltip__content` entries — a legitimate new consumer of an existing token, not a new token or a weakened check.
- **Files modified:** `scripts/verify-semantic-css.mjs`
- **Verification:** `npm run verify:semantic-css` passes.
- **Committed in:** `5550713` (Task 1 commit)

**2. [Rule 2/3 - inline fix] Fourth toolbar button forced the view-header's grid track wider than the sidebar's**
- **Found during:** Full-suite verification after all 3 tasks, running `npx playwright test` whole-suite
- **Issue:** `tests/e2e/responsive-session.spec.ts`'s "tree interiors remain fluid at shipped hosts" step failed (`selectedBox.x + width` = 185.9 > `filesBox.x + width` = 170) at the sidebar's minimum resized width (170px, left from an earlier step in the same test). Root cause: `.file-tree-pane__toolbar` is `flex: 0 0 auto` (never shrinks); 3 buttons' min-content fit inside the available width, but the 4th button's min-content (~100px total) no longer did. `.file-tree-pane__top` is a grid-row item with the default implicit `min-width: auto`, so CSS Grid's automatic minimum size let its min-content requirement force the whole single-column grid track (shared by the scroller row below it) wider than the pane's intended 100% width — inflating every row's rendered width, including the selected row measured by the test.
- **Fix:** Added `min-width: 0; overflow: hidden;` to `.file-tree-pane__top` (removes the grid-item auto-minimum-size floor) and `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` to `.file-tree-pane__label` (lets the decorative, `aria-hidden` "Changed files" label truncate instead of forcing the row wider, keeping all four toolbar buttons fully visible/functional).
- **Proof it was a real regression (not pre-existing):** Reproduced cleanly passing on commit `e5a972f` (pre-21-04) via a disposable `git worktree`; bisected forward through `5550713` (still passing) and `91f7770` (first commit where it fails) to confirm Task 2's fourth button, not Task 1's new component, was the cause.
- **Files modified:** `src/web/styles.css`
- **Verification:** `npx playwright test tests/e2e/responsive-session.spec.ts` passes; full suite rerun clean; `npm run verify:semantic-css` still passes (no new tokens).
- **Committed in:** `51dba44` (separate fix commit, since it was discovered only after all 3 task commits had already landed)

---

**Total deviations:** 2 auto-fixed (1 Rule 1/2 allowlist registration, 1 Rule 2/3 regression fix).
**Impact on plan:** Both necessary for a correct, fully-green deliverable. No scope creep — neither touched anything outside this plan's own `files_modified` list except the narrowly-scoped allowlist entry the orchestrating session explicitly anticipated.

## Issues Encountered

- `page.reload()` cannot be used to prove the view-options selections survive a reload in an automated Playwright test against this packaged CLI's committed-session kind: the boot script (`src/web/api/client.ts:126`) strips the one-time `#token=` hash from the URL via `history.replaceState` once read, so any literal reload re-requests `/api/session` with no token and fails. Resolved by asserting the `localStorage` write directly instead — this matches the plan's own `<verification>` step 5, which already scopes the reload check as a manual cross-check, not an automated command.
- The initial `tests/e2e/file-tree.spec.ts` draft seeded the badge-test comment via a raw `fetch('/api/draft/mutations')` call; this mutated server-side draft state without updating the client's own reactive `workspaceComments`, so the badge never appeared without a reload (which hits the issue above). Resolved by seeding the comment through the real in-app Monaco gutter-action composer instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 7 Phase 21 requirement IDs (TREE-01..07) are now fully, observably delivered — no remaining stub/placeholder control anywhere in the changed-files tree.
- STATE.md/ROADMAP.md/REQUIREMENTS.md intentionally left untouched per this plan's `<output>` instruction — handled centrally after this plan by the orchestrating session.
- Phases 22 (identity/status bar) and 23 (inline comment threads) were untouched; their own in-flight files were not read or modified.

---
*Phase: 21-changed-files-tree*
*Completed: 2026-11-05*
