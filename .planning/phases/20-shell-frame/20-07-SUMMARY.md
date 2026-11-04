---
phase: 20-shell-frame
plan: 07
subsystem: ui
tags: [vue, workbench-shell, keyboard-navigation, monaco, css-cleanup]

requires:
  - phase: 20-shell-frame
    provides: "panel-state.ts (20-01), Monaco nav actions (20-02), TitleBar/StatusBar (20-03), EditorTitle/Breadcrumbs (20-04), useSash/WorkbenchShell (20-05), BottomPanel (20-06)"
provides:
  - "App.vue rewired around WorkbenchShell as the sole render root for the five-region shell"
  - "createPanelState() persistence wired to WorkbenchShell's resize emits"
  - "Rewritten handleKeydown: NAV-03 chord remap, always-preventDefault ⌘B/⌘J"
  - "renderSideBySide session-scoped inline/side-by-side diff toggle (NAV-01)"
affects: ["20-09 (locator-fix sweep for the six broken Playwright specs)"]

tech-stack:
  added: []
  patterns:
    - "App.vue stays the sole state owner; all new reactive state (panelState, panelOpen, renderSideBySide) lives in App.vue and flows down via WorkbenchShell slot props"
    - "Non-modal panel state (panelOpen) is intentionally excluded from shellModalOpen/inert — only changed-files/support dialogs block shell interaction"

key-files:
  created:
    - .planning/phases/20-shell-frame/20-07-SUMMARY.md
  modified:
    - src/web/App.vue
    - src/web/styles.css
    - scripts/css-token-contract.mjs
    - .planning/PROJECT.md
  deleted:
    - src/web/components/IdentityHeader.vue
    - src/web/components/ReviewToolbar.vue
    - src/web/components/ActiveFileToolbar.vue
    - src/web/components/ShellFooter.vue
    - src/web/components/ReviewNotesDialog.vue

key-decisions:
  - "toggleSidebar() keeps the pre-existing narrow-viewport branch (opens ChangedFilesDialog instead of flipping sidebarVisible) to preserve the <760px drawer path CONTEXT.md requires unchanged"
  - "#editor slot gates EditorTitle/warning-stack/Breadcrumbs/DiffWorkspace behind the same recoveryLoad v-if/v-else DraftRecovery previously used, since the plan's literal skeleton omitted it but CONTEXT/UI-SPEC list DraftRecovery as reused-unchanged"
  - "⌘B/⌘J branches sit at the very top of handleKeydown, before the .inline-comment-composer guard too, so they truly fire 'from anywhere' per must_haves"
  - "styles.css Task 1 cleanup pruned only genuinely dead selectors, keeping classnames EditorTitle/TitleBar/StatusBar still reuse (confirmed via grep against the six workbench components before each deletion)"

patterns-established:
  - "Pattern: CSS selector deletion during component supersession must grep every surviving component's template for class reuse before deleting, not just grep the plan's selector-prefix list literally"

requirements-completed: [TOK-01, SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-06, NAV-01, NAV-02, NAV-03, NAV-04]

duration: 45min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 07: Shell Frame Integration Summary

**Rewired App.vue to mount WorkbenchShell with TitleBar/EditorTitle/Breadcrumbs/BottomPanel/StatusBar, wiring createPanelState() persistence, the 20-02 Monaco navigation emits, and a rewritten handleKeydown that remaps ⌥⇧[/⌥⇧] to ⌥↑/⌥↓ and adds always-preventDefault ⌘B/⌘J.**

## Performance

- **Duration:** 45 min
- **Tasks:** 2
- **Files modified:** 4 (App.vue, styles.css, css-token-contract.mjs, PROJECT.md)
- **Files deleted:** 5 (IdentityHeader.vue, ReviewToolbar.vue, ActiveFileToolbar.vue, ShellFooter.vue, ReviewNotesDialog.vue)

## Accomplishments

- The five-region shell (title bar, side bar, editor area, bottom panel, status bar) now renders end-to-end from a single `WorkbenchShell`-rooted template; no activity bar, identity header band, review rail, or footer copy remains in App.vue's DOM.
- `createPanelState()` is live: sidebar width, sidebar visibility, and panel height persist to `loopnote.workbench.v1` across reloads; panel open/closed state is a separate, non-persisted ref that always starts closed.
- `⌥⇧[`/`⌥⇧]` no longer navigate files; only `⌥↑`/`⌥↓` do (no aliases). `⌘B`/`⌘J` (`Ctrl` on non-mac) always call `preventDefault()` and toggle the sidebar/panel from anywhere, including inside the Monaco editor and the inline-comment composer.
- The inline/side-by-side diff layout toggle (NAV-01) is wired session-scoped via `renderSideBySide`, defaulting to side-by-side and disabled for single-pane files, reversing v2.0's Out-of-Scope entry (recorded in PROJECT.md).
- `ReviewNotesDialog.vue` is deleted; its body now lives in `BottomPanel.vue`'s `#panel` slot, non-modal.

## Task Commits

1. **Task 1: Delete superseded components; remove their CSS and the orphaned `--control-height-compact` token** - `6baa6d8` (refactor)
2. **Task 2: Rewrite App.vue — WorkbenchShell integration, Teleport/warning-stack relocation, handleKeydown, panel-state + useSash + Monaco-nav wiring** - `6eb41c3` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/web/App.vue` - Rewritten around `WorkbenchShell`; new `panelState`/`panelOpen`/`renderSideBySide` state, `toggleSidebar`/`togglePanel`/`openPanel`/`closePanel`/`commitSidebarWidth`/`commitPanelHeight` handlers, rewritten `handleKeydown`, new `snapshotLabel`/`openCommentCount` computeds for `StatusBar`
- `src/web/styles.css` - Deleted dead `.session-header`/`.review-toolbar`/`.shell-footer` rule blocks and the orphaned `--control-height-compact` token; pruned shared comma-selector lists to drop only the dead branches, keeping every classname `EditorTitle.vue`/`TitleBar.vue`/`StatusBar.vue` still render
- `scripts/css-token-contract.mjs` - Removed `--control-height-compact` from `CANONICAL_TOKENS`
- `.planning/PROJECT.md` - Added an Out of Scope reversal line recording the inline/side-by-side diff toggle is now in scope (Phase 20, NAV-01)
- `src/web/components/IdentityHeader.vue` - deleted (folded into `TitleBar.vue`, 20-03)
- `src/web/components/ReviewToolbar.vue` - deleted (folded into `EditorTitle.vue`, 20-04)
- `src/web/components/ActiveFileToolbar.vue` - deleted (folded into `EditorTitle.vue`, 20-04)
- `src/web/components/ShellFooter.vue` - deleted (replaced by `StatusBar.vue`, 20-03)
- `src/web/components/ReviewNotesDialog.vue` - deleted (superseded by `BottomPanel.vue`, 20-06)

## Decisions Made

See `key-decisions` frontmatter above; all four are deviations from the plan's literal text, driven by other authoritative phase documents (CONTEXT.md, UI-SPEC.md, must_haves truths) or by concrete grep evidence against the six already-landed workbench components.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Preserved narrow-viewport file-drawer behavior in `toggleSidebar()`**
- **Found during:** Task 2
- **Issue:** The plan's literal `toggleSidebar()` body only ever flips `panelState.sidebarVisible`, with no narrow-viewport branch. Below 760px, the inline sidebar column is irrelevant (`FileTree` teleports into the `ChangedFilesDialog`'s narrow-mode target instead of `#changed-files`), so flipping `sidebarVisible` would silently do nothing user-visible, breaking the narrow-mode "Open files" affordance that CONTEXT.md explicitly requires to "keep working unchanged."
- **Fix:** Re-added the old `toggleFiles()`'s `if (isNarrow.value) { openShellDialog('changed-files'); return; }` branch at the top of `toggleSidebar()`, exactly mirroring prior behavior.
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` (0 errors); behavior traced by hand against `ChangedFilesDialog.vue`'s Teleport-target switch and `WorkbenchShell.vue`'s unconditional `#changed-files` host.
- **Committed in:** `6eb41c3` (Task 2 commit)

**2. [Rule 2 - Missing critical functionality] Retained `DraftRecovery` in the `#editor` slot**
- **Found during:** Task 2
- **Issue:** The plan's literal template skeleton (lines 117–206) never mentions `DraftRecovery`, but CONTEXT.md's code-context section and UI-SPEC.md's "Reused unchanged phase" list both explicitly name `DraftRecovery.vue` as still in use. Dropping it would silently remove the malformed/corrupt-draft recovery UI.
- **Fix:** Re-created the original `v-if`/`v-else` pairing (`DraftRecovery` when `recoveryLoad !== undefined && primarySurface !== 'workspace'`, else the normal editor content) inside the `#editor` slot, gating exactly the same scope the old `review-shell` div gated (toolbar + diff content), while leaving `TitleBar`/sidebar/`StatusBar` persistently mounted (a minor, non-regressive improvement consistent with the new chrome's always-present-shell design intent).
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` (0 errors); `npm run build:web` succeeds.
- **Committed in:** `6eb41c3` (Task 2 commit)

**3. [Rule 1 - Bug] Placed ⌘B/⌘J branches before the composer-specific guard too, not just before the generic input guard**
- **Found during:** Task 2
- **Issue:** The plan named "before the early-return guard at line 926" (the generic `HTMLInputElement`/`HTMLTextAreaElement`/`HTMLSelectElement` check) as the insertion point. But an earlier guard (`.inline-comment-composer` textarea check, lines 916–925) returns unconditionally for any key that isn't Cmd+Enter or Escape. Placing the new branches only between the two guards would silently swallow ⌘B/⌘J whenever focus was inside an open inline-comment composer — violating the must_haves truth that these shortcuts fire "from anywhere... including with focus inside the Monaco editor."
- **Fix:** Moved both new branches to the very top of `handleKeydown`, before any target-based branching at all.
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` (0 errors); logic traced by hand against both guards' early-return structure.
- **Committed in:** `6eb41c3` (Task 2 commit)

**4. [Rule 1 - Bug] CSS deletion scoped to genuinely dead selectors only, not the plan's literal selector-prefix list**
- **Found during:** Task 1
- **Issue:** Task 1's action text named `.review-toolbar*`, `.session-header*`, `.identity-disclosure*`, `.header-facts*`, `.pin-cue`, `.dirty-badge*`, `.change-indicator` as deletion candidates. Grepping the six already-landed workbench components (20-03/20-04) showed `EditorTitle.vue` still renders `.review-toolbar__active-file`/`__status`/`__counts`, `TitleBar.vue` still renders `.session-header__brand`/`__comparison`/`__endpoint`/`__endpoint-label`/`__selector`, `.header-facts`, `.pin-cue`, `.dirty-badge`, `.identity-disclosure`, `.change-indicator`, and `StatusBar.vue` also renders `.identity-disclosure`. Deleting those rule blocks verbatim would have shipped a visually broken shell (unstyled filename/status/counts text, unstyled refresh/support buttons) that neither `typecheck:web` nor `verify-semantic-css.mjs` would catch.
- **Fix:** Deleted only the confirmed-dead blocks (`.session-header` root, `.session-header__identity`, `.review-toolbar` root, `.review-toolbar .ui-button`, `.review-toolbar__group`, `.review-toolbar__label`, `.review-toolbar > * + *`, all `.shell-footer*`, plus the `.session-header`/`.session-header__identity`/`.review-toolbar__label`/`.review-toolbar` branches inside the three `@media` blocks), pruning dead branches out of shared comma-selector rules (e.g. `.session-header__identity,` removed from a rule shared with `.session-header__brand,`) while leaving every selector the surviving components still render untouched.
- **Files modified:** `src/web/styles.css`
- **Verification:** `node scripts/verify-semantic-css.mjs` passes; `npm run build:web` succeeds; manual grep of all six workbench component templates against every candidate classname before each deletion.
- **Committed in:** `6baa6d8` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 2 missing-critical-functionality, 2 Rule 1 bug-prevention)
**Impact on plan:** All four were necessary to avoid real regressions (narrow-mode file browsing, malformed-draft recovery, the "from anywhere" keyboard-shortcut guarantee, and shipping unstyled live UI). No scope creep — each stays within Task 1/Task 2's own `files_modified` list.

## Issues Encountered

None - all gates passed on the first attempt: `npm run typecheck:web` (0 errors), `npm run build:web` (succeeds), `node scripts/verify-semantic-css.mjs` (passes), and every grep in the plan's own `<done>` blocks returned 0 matches for the superseded component names, the old `⌥⇧[`/`⌥⇧]` chord pattern, and the removed `review-notes` dialog.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The five-region shell is fully wired and functionally complete for all five session kinds (committed range, exact patch, Staged/Unstaged/Working-tree uncommitted, standalone). TOK-01, SHELL-01 through SHELL-04, SHELL-06, and NAV-01 through NAV-04 are all now observable in the running app and are marked complete in REQUIREMENTS.md.

**Known, expected, and accepted red state:** this plan's markup/CSS changes break locators in six Playwright/integration specs — `pinned-session.spec.ts`, `responsive-session.spec.ts`, `support-dialog.spec.ts`, `agent-ready-export-safety.spec.ts`, `anchored-workspace.spec.ts`, `selector-drift-ui.spec.ts`. Per this plan's own `<verification>` section, fixing those locators is explicitly 20-09's job (same phase, `depends_on` this plan, runs next) — this plan's own verification scope was limited to `typecheck:web`, `build:web`, `verify-semantic-css.mjs`, and the grep checks in each task's `<done>` block, all of which pass. These six specs were not run or touched in this plan and should be treated as RED pending 20-09.

## Self-Check: PASSED

- `src/web/components/IdentityHeader.vue`: MISSING (confirmed deleted)
- `src/web/components/ReviewToolbar.vue`: MISSING (confirmed deleted)
- `src/web/components/ActiveFileToolbar.vue`: MISSING (confirmed deleted)
- `src/web/components/ShellFooter.vue`: MISSING (confirmed deleted)
- `src/web/components/ReviewNotesDialog.vue`: MISSING (confirmed deleted)
- Commit `6baa6d8`: FOUND in `git log`
- Commit `6eb41c3`: FOUND in `git log`
- `npm run typecheck:web`: 0 errors
- `npm run build:web && node scripts/verify-semantic-css.mjs`: both pass
- `grep -rc 'IdentityHeader\|ReviewToolbar\|ActiveFileToolbar\|ShellFooter\|ReviewNotesDialog' src/web/App.vue`: 0
- `grep -n "altKey && event.shiftKey && event.key === '\["` `src/web/App.vue`: 0 matches

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
