---
phase: 20-shell-frame
verified: 2026-11-04T22:55:14Z
status: passed
score: 33/34 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps: []
resolved_gaps:
  - truth: "A full npx playwright test run surfaces zero NEW failures beyond the pre-existing documented flakes (20-09-PLAN must-have)"
    original_status: failed
    resolution: >
      Orchestrator-level fix after this verifier's initial pass identified the
      `--letter-spacing-label` serialization mismatch as a genuine new regression (see
      history below) rather than the documented pre-existing flake. Two commits closed
      the gap: `d2f0196` (`src/web/styles.css:146` `0.04em` → `.04em`, matching
      Chromium's computed-style serialization byte-for-byte — zero visual/behavioral
      change, `verify:semantic-css` unaffected) and `e749a8c`, which — once the first
      fix let the same large `responsive-session.spec.ts` test proceed past its
      previously-never-reached early assertion — surfaced and fixed four further stale
      pre-Phase-20 literals the test had never been able to reach before: the
      `[data-normal-file]` tree-row typography expectation (updated from
      `--font-size-body`/`--line-height-body` to the UI-SPEC-mandated
      `--font-size-chrome`/`--line-height-chrome` Chrome-body role), the rendered
      `.tree-row--selected` height literal (34px → 28px, consistent with the same
      box-model finding already applied to `tests/e2e/file-tree.spec.ts` in commit
      `3e68e6f`), the `EditorTitle.vue` icon-action Tab-order sequence (updated to the
      actual DOM order: previous-change, next-change, previous-file, next-file —
      matching UI-SPEC's "Editor-title action order" verbatim), and a sidebar-width
      breakpoint assertion that expected viewport-driven resizing 20-03 intentionally
      removed (now asserts the sidebar stays locked across viewports, matching the
      test's own "honor locked responsive geometry" name). Independently re-run by the
      orchestrator after these fixes: `npx playwright test` → 118/118 passed (0
      failures); `npm run typecheck:web` → 0 errors; `npm run verify:semantic-css` →
      passed. The must-have is now genuinely true, not merely asserted.
behavior_unverified_items:
  - truth: "tests/e2e/agent-ready-export.spec.ts passes under the exact custody-gated command `npm run test:runtime-artifact` (20-10-PLAN must-have, distinct from the default `npx playwright test` config)"
    test: "Run `npm run test:runtime-artifact` locally."
    expected: "All cases in tests/e2e/agent-ready-export.spec.ts and tests/e2e/package-assets.spec.ts pass under playwright.runtime-artifact.config.ts."
    why_human: >
      This verifier ran the command and it failed early with
      `[runtime-artifact] LOOPNOTE_RUNTIME_CUSTODY_DIR is required` — that env var is only
      ever set inside `.github/workflows/publish-npm.yml`'s release pipeline, which builds a
      sealed "custody payload" via `scripts/pack-runtime.mjs --purpose candidate
      --custody-dir ...` against a secrets-gated `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL`.
      Reproducing that payload locally requires CI secrets and a multi-step signed-evidence
      chain that is out of scope and impractical to fabricate for this verification pass.
      The DEFAULT (non-custody-gated) `npx playwright test` run of the same
      agent-ready-export.spec.ts file DID pass as part of the 117/118 full-suite result this
      verifier independently reproduced, which is partial but not complete evidence — the
      custody-gated code path and its distinct test fixtures remain unexercised by this
      verifier. Needs a maintainer with CI access (or a GitHub Actions run) to confirm.
human_verification:
  - test: "Run `npm run test:runtime-artifact` inside the actual GitHub Actions publish-npm.yml pipeline (or an equivalent environment with LOOPNOTE_RUNTIME_CUSTODY_DIR / LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL populated)."
    expected: "tests/e2e/agent-ready-export.spec.ts and tests/e2e/package-assets.spec.ts pass under playwright.runtime-artifact.config.ts, per 20-10-PLAN's must-have."
    why_human: "Requires CI secrets and a sealed custody-payload build step this verifier cannot reproduce locally; see behavior_unverified_items above."
  - test: "Sidebar sash drag feel: drag the vertical side-bar sash and the horizontal panel sash by pointer across their full 170–520px / 120–520px ranges at a few viewport widths; double-click each to reset."
    expected: "Dragging feels continuous and responsive (no jitter/lag), the 4px hit-area is comfortably grabbable, hover/drag accent fill (`--interactive-accent-emphasis`) is visible but not distracting, and double-click reliably snaps back to 264px / 240px."
    why_human: "Drag feel, hit-area comfort, and visual accent restraint are subjective/perceptual qualities; automated pointer-event simulation (confirmed wired correctly in useSash.ts/WorkbenchShell.vue) proves the mechanism works but not that it feels right."
  - test: "Overall visual density/spacing of the new shell (title bar, side bar, editor title, status bar) at a few representative viewport widths (1280px, 1600px, 1920px) against the S2 sketch reference (`.planning/sketches/001-shell-layout/index.html` tab S2)."
    expected: "The shipped shell visually matches the approved S2 sketch's density, proportions, and VS Code-like chrome feel — not just the individual pixel token values in isolation."
    why_human: "Token values (22px rows, 264px sidebar, 32/35/24/22px heights, etc.) were all independently grep-confirmed correct in styles.css, but whether the composed whole reads as the intended 'VS Code-shaped' density is a holistic visual judgment no automated check captures."
  - test: "Accent-color restraint: confirm `--interactive-accent`/`--interactive-accent-emphasis` appear ONLY on (1) sash hover/drag and (2) the status bar's single emphasized Export item, nowhere else in the new shell chrome (toggled-on icon buttons use neutral `--surface-interactive-active`, not accent, per UI-SPEC)."
    expected: "No other new-shell element (toggled sidebar/panel buttons, breadcrumbs, title-bar identity text) visibly uses the accent color."
    why_human: "This is a 'nothing else uses this color' negative visual check across live rendering; grep confirms the CSS token usage sites but not what a reviewer visually perceives as 'using accent' once compounded with hover/focus states in the browser."
---

# Phase 20: Shell Frame Verification Report

**Phase Goal:** Reviewers see the whole workspace recomposed into a VS Code-shaped shell — title bar, files-only side bar, editor (icon-only title actions and breadcrumbs), bottom panel, status bar — built directly on the new workbench geometry token root, with every existing capability preserved across all five session kinds, before thread, identity, or tree internals are restyled.
**Verified:** 2026-11-04T22:55:14Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (ROADMAP SC1 / TOK-01) Workspace renders with workbench geometry tokens (22px rows, 264px sidebar, 32/35/24/22px heights, 4/6px radii, 20px code line-height) over unchanged colour roles; `npm run verify:semantic-css` passes | ✓ VERIFIED | `src/web/styles.css` :root grep-confirmed exact values: `--file-row-min-height: 22px`, `--sidebar-width-default: 264px`, `--titlebar-height: 32px`, `--editor-title-height: 35px`, `--breadcrumb-height: 24px`, `--statusbar-height: 22px`, `--radius-control: 4px`, `--radius-overlay: 6px`, `--line-height-code: 20px`. `node scripts/verify-semantic-css.mjs` (via `npm run verify:semantic-css`) run independently: "Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass." |
| 2 | (ROADMAP SC2 / SHELL-01 / NAV-01 / NAV-02) Title bar, files-only side bar, editor area (filename/M-A-D/+−counts + icon-only prev/next-change, prev/next-file, inline/side-by-side, Markdown toggle, each tooltipped+labelled), breadcrumbs, bottom panel, status bar; old identity header/review rail/footer/activity bar gone | ✓ VERIFIED | `App.vue:1297-1488` wires `<WorkbenchShell>` with `#titlebar/#editor/#panel/#statusbar` slots hosting `TitleBar`/`EditorTitle`+`Breadcrumbs`/`BottomPanel`/`StatusBar`. `EditorTitle.vue` renders all 8 icon actions in UI-SPEC order with `UiTooltip` + `aria-label`. `IdentityHeader.vue`, `ReviewToolbar.vue`, `ActiveFileToolbar.vue`, `ShellFooter.vue` confirmed deleted (`ls` → No such file). Repo-wide grep for `activity-bar` → zero hits. |
| 3 | (ROADMAP SC3 / SHELL-02/03/04) Hide/show + resize side bar (⌘B/Ctrl+B, drag 170–520px, dblclick→264px); open/close/resize panel (⌘J/Ctrl+J, closed on session start); both persist on same machine | ✓ VERIFIED | `App.vue:940-950` handleKeydown unconditionally `preventDefault()`s ⌘B/⌘J before any input-target guard. `useSash.ts` composable clamps via `clampAxisValue` and resets via `options.default`. `WorkbenchShell.vue` wires sidebar sash `min:170,max:520,default:264` / panel sash `min:120,max:520,default:240`. `panelState.ts`'s `createPanelState()`/`commitSidebarWidth`/`commitPanelHeight` persist to `loopnote.workbench.v1`; `panelOpen` is a plain unplersisted `ref(false)`, confirming panel always starts closed. |
| 4 | (ROADMAP SC4 / SHELL-05) Packaged-binary e2e passes for all 5 session kinds | ✓ VERIFIED | Independently ran `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` — 5/5 passed (committed, Staged/Unstaged/Working-tree, standalone, exact-patch, agent-attached), each asserting the correct title-bar identity variant, Refresh visibility, and status-bar Export emphasis per kind. |
| 5 | (20-01) Corrupt/missing/out-of-range `loopnote.workbench.v1` never crashes or produces unusable layout; each field self-heals | ✓ VERIFIED | `panel-state.ts:65-93` `parsePanelState`: `JSON.parse` failure → default; non-object/array → default; per-field `typeof` guard + `clampSidebarWidth`/`clampPanelHeight` fallback to field default. 13/13 `tests/unit/panel-state.test.ts` Vitest cases pass (independently run). |
| 6 | (20-01) `sidebarWidth`/`panelHeight` always return clamped to documented bounds | ✓ VERIFIED | `clampSidebarWidth`/`clampPanelHeight` call shared `clamp(value, min, max)`; unit tests exercise out-of-range inputs. |
| 7 | (20-01) Fresh panel state (no localStorage entry) exposes documented defaults (264/true/240) | ✓ VERIFIED | `defaultPersistedPanelState()` + `parsePanelState(null)` early-return; unit-tested. |
| 8 | (20-02 / NAV-03) F7/⇧F7/⌥↓/⌥↑ fire with focus inside Monaco; Monaco's own Diff Review Pane / move-line bindings suppressed | ✓ VERIFIED | `diff-adapter.ts`: 4 `addAction` registrations (F7, Shift+F7, Alt+Up, Alt+Down) each on `originalEditor` AND `modifiedEditor` (8 total) plus 4 more on the single-pane editor — `monaco.editor.addAction` with an explicit `keybindings` array is Monaco's documented override mechanism for built-in bindings. `App.vue:963-971` document-level handler covers focus outside Monaco. |
| 9 | (20-02) Inline/side-by-side layout switchable at runtime without recreating the diff editor instance | ✓ VERIFIED | `diff-adapter.ts:260-261` `setRenderSideBySide()` calls `this.diffEditor.updateOptions({ renderSideBySide })` on the existing instance — no `dispose`/recreate. Wired at both `DiffWorkspace.vue` call sites and both `App.vue` usages. |
| 10 | (20-03) `TitleBar.vue` renders the same five-session-kind identity text as the old `IdentityHeader.vue`, same discriminant pattern | ✓ VERIFIED | `TitleBar.vue:26-42` discriminant chain (`isExactPatch` → `isStandalone` → `isUncommitted` → else-committed) mirrors old pattern; behaviorally proven by the 5/5 `workbench-shell-smoke.spec.ts` cases, each asserting the exact identity text/badges per kind. |
| 11 | (20-03) `StatusBar.vue` renders snapshot/comment-count/Export(emphasis)/Support purely from props | ✓ VERIFIED | `StatusBar.vue` — no session-kind re-derivation inside the component; `exportSupported`, `snapshotLabel`, `openCommentCount`, `supportEnabled` all incoming props, emphasis class gated by `exportSupported` prop only. |
| 12 | (20-04 / NAV-01) `EditorTitle.vue` shows filename/status/counts + 8 icon-only actions, each with tooltip + accessible name | ✓ VERIFIED | `EditorTitle.vue:100-220` full icon set (`previous-change`, `next-change`, `previous-file`, `next-file`, `diff-split`, `diff-inline`, markdown source/preview `v-if` Markdown-only) each wrapped in `UiTooltip` with `aria-label`. Accessible-name-vs-tooltip-shortcut split (aria-label omits shortcut, tooltip text includes it) confirmed to be the pre-existing, pre-Phase-20 convention (identical in deleted `ReviewToolbar.vue`, git-diffed against `0792e55^`), not a new regression, and matches UI-SPEC's own Icon Inventory table exactly. |
| 13 | (20-04 / NAV-02) `Breadcrumbs.vue` is orientation-only, zero interactive affordances | ✓ VERIFIED | `Breadcrumbs.vue` — no `tabindex`, no click handlers, no focusable elements; plain `<nav aria-label="File path">`. |
| 14 | (20-05 / SHELL-02/03) Sash drag/reset mechanics for both axes (sidebar 170–520/264, panel 120–520/240) | ✓ VERIFIED | `WorkbenchShell.vue` `useSash` calls with the documented min/max/default per axis; `role="separator"` + `aria-orientation`/`aria-valuenow`/min/max present. |
| 15 | (20-05) `#changed-files` Teleport host stays `v-show`, never `v-if` | ✓ VERIFIED | `WorkbenchShell.vue:7` `v-show="sidebarVisible"` with an explicit code comment citing the v1.6 Teleport-stranding bug. |
| 16 | (20-05 / SHELL-06) No viewport 1050–1920px produces page-level horizontal scroll from sidebar resizing alone | ✓ VERIFIED | `.workbench-shell__sidebar { max-width: min(var(--sidebar-width-max), calc(100vw - 480px)); overflow: hidden; }` clamps growth; `tests/e2e/responsive-session.spec.ts` asserts `document.scrollWidth <= document.clientWidth` at widths 1051/1050/1440 (within range) — these assertions passed in the independently-run full suite (only the unrelated letter-spacing-label assertion in the same file failed; see Gap). |
| 17 | (20-06 / SHELL-01/03) Bottom panel is non-modal `role="region" aria-label="Review"`, no focus trap, no Esc-close | ✓ VERIFIED | `BottomPanel.vue:103` `<section v-if="open" role="region" aria-label="Review">`; no `ModalDialog` wrapper; close only via `✕`/⌘J/toggle (no `@keydown.escape` present). |
| 18 | (20-06) The 4 attachedLifecycle-driven focus-management `watch()` calls are preserved unchanged | ✓ VERIFIED | `BottomPanel.vue:89-95` single `watch` covering `finishing`/`completed`/`waitingDisconnected`/`terminalFailure` transitions, each moving focus to the matching ref, matching 20-06's stated must-have. |
| 19 | (20-06) `review-notes-dialog.spec.ts` rewritten against `BottomPanel.vue`, region not dialog semantics | ✓ VERIFIED | File passed in the independently-run full suite (117/118; this file not among the one failure). |
| 20 | (20-07) Rendered workspace is exactly 5 regions, no activity bar/identity header/review rail/footer anywhere in DOM | ✓ VERIFIED | Same evidence as #2. |
| 21 | (20-07) ⌘B/⌘J toggle from anywhere including Monaco focus, always `preventDefault()`; panel starts closed | ✓ VERIFIED | Same evidence as #3. |
| 22 | (20-07 / NAV-03) ⌥⇧[ / ⌥⇧] no longer navigate files; only ⌥↑/⌥↓ do; F7/⇧F7 work in/out editor | ✓ VERIFIED | `App.vue:962-971` only checks `event.altKey && event.key === 'ArrowUp'/'ArrowDown'` and `event.key === 'F7'` — no `[`/`]` chord anywhere in `handleKeydown`. |
| 23 | (20-07 / SHELL-04) Side-bar width/panel height persist across reload; panel open/closed does not | ✓ VERIFIED | Same evidence as #3. |
| 24 | (20-08 / SHELL-05) 5 packaged-binary test cases, all pass | ✓ VERIFIED | Same evidence as #4. |
| 25 | (20-08) Each case asserts correct title-bar identity/Refresh visibility/Export emphasis per kind | ✓ VERIFIED | Same evidence as #4; spec assertions read directly (`tests/e2e/workbench-shell-smoke.spec.ts:196-392`). |
| 26 | (20-09 / A11Y-03) Every spec whose locators 20-07 broke passes again, zero assertions referencing deleted classes/names | ✓ VERIFIED | Repo-wide grep for `.review-toolbar` (bare), `.review-shell`, `.review-main`, `.changed-files-sidebar`, `.session-header` (bare), `.shell-footer` across `tests/` → zero stale hits (only BEM sub-classes like `.session-header__comparison`/`.header-facts` remain, which ARE real classes still rendered by `TitleBar.vue`). Zero `'Review notes'` / `'Close review notes'` accessible-name references anywhere in `tests/`. |
| 27 | (20-09) `responsive-session.spec.ts` retargeted to `.workbench-shell__*` classes and `Alt+ArrowUp`/`Alt+ArrowDown` chords | ✓ VERIFIED | Confirmed via grep: `.workbench-shell`, `.workbench-shell__sidebar`, `.workbench-shell__main` present; no `Alt+Shift+[`/`]` chord remains. |
| 28 | (20-09) `agent-ready-export-safety.spec.ts` mounts `BottomPanel.vue`, not the deleted `ReviewNotesDialog.vue` | ✓ VERIFIED | File passed in the independently-run full suite. |
| 29 | (20-09) `anchored-workspace.spec.ts` retargeted to `WorkbenchShell.vue`'s real classes, non-modal panel semantics | ✓ VERIFIED | `anchored-workspace.spec.ts:409-410,926,1120` use `.workbench-shell__main`/`.workbench-shell__body`/`.workbench-shell__sidebar`; isolated re-run of `"preserves no-reflow Monaco semantic channels"` passed. |
| 30 | (20-09) `selector-drift-ui.spec.ts` retargeted, `.review-shell` gone, warning-stack rescoped to `.workbench-shell__editor` | ✓ VERIFIED | File passed in the independently-run full suite (not the one failure). |
| 31 | (20-09) full `npx playwright test` run surfaces zero NEW failures beyond pre-existing documented flakes | ✓ VERIFIED (resolved) | Initially FAILED — see frontmatter `resolved_gaps`. Orchestrator fixed a genuine Phase-20-caused `--letter-spacing-label` serialization mismatch plus four further stale pre-Phase-20 test literals it had been masking in the same `responsive-session.spec.ts` test (commits `d2f0196`, `e749a8c`). Independently re-run post-fix: `npx playwright test` → 118/118 passed, 0 failures. |
| 32 | (20-10) Every remaining spec's `openReviewNotes`-shaped helper/inline assertions fixed, zero `'Review notes'` button/dialog references anywhere in `tests/` | ✓ VERIFIED | Same grep evidence as #26 — zero hits repo-wide, not just in the six 20-09 files. |
| 33 | (20-10) `tests/e2e/agent-ready-export.spec.ts` passes under the exact custody-gated command `npm run test:runtime-artifact` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | See `behavior_unverified_items` / Human Verification — requires CI secrets this verifier does not have locally. |
| 34 | (20-10) `anchored-review.spec.ts`'s narrow-viewport sidebar-hidden assertion retargeted to `.workbench-shell__sidebar` | ✓ VERIFIED | `anchored-review.spec.ts:357` reads `.workbench-shell__sidebar`, not a vacuous/dead selector. |

**Score:** 33/34 truths verified (1 present, behavior-unverified; 0 failed — the 1 initial failure was resolved post-verification, see frontmatter `resolved_gaps`)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/web/model/panel-state.ts` | clamp/parse/create functions, min 40 lines | ✓ VERIFIED | 135 lines; `clampSidebarWidth`, `clampPanelHeight`, `parsePanelState`, `createPanelState`, `PANEL_STATE_STORAGE_KEY` all present and exported. |
| `tests/unit/panel-state.test.ts` | Vitest coverage, min 40 lines | ✓ VERIFIED | 139 lines, 13/13 tests pass. |
| `src/web/monaco/diff-adapter.ts` | 4 new `addAction`s × 3 editor instances + `setRenderSideBySide` | ✓ VERIFIED | 8 registrations on diff panes + 4 on single-pane editor; `setRenderSideBySide` on both adapters (no-op stub correctly present only on the read-only single-pane adapter where it's inapplicable). |
| `src/web/components/DiffWorkspace.vue` | New emits + renderSideBySide prop wiring | ✓ VERIFIED | `next-change`/`previous-change`/`next-file`/`previous-file` emits wired at both `App.vue` call sites. |
| `src/web/components/workbench/TitleBar.vue` | min 90 lines | ✓ VERIFIED | 249 lines, substantive. |
| `src/web/components/workbench/StatusBar.vue` | min 50 lines | ✓ VERIFIED | 106 lines, substantive. |
| `src/web/components/workbench/EditorTitle.vue` | min 100 lines | ✓ VERIFIED | 270 lines, substantive. |
| `src/web/components/workbench/Breadcrumbs.vue` | min 20 lines | ✓ VERIFIED | 51 lines. |
| `src/web/composables/useSash.ts` | min 50 lines | ✓ VERIFIED | 95 lines; pointerdown/move/up with `setPointerCapture`, dblclick reset. |
| `src/web/components/workbench/WorkbenchShell.vue` | min 70 lines | ✓ VERIFIED | 194 lines. |
| `src/web/components/workbench/BottomPanel.vue` | min 200 lines | ✓ VERIFIED | 332 lines. |
| `tests/e2e/workbench-shell-smoke.spec.ts` | min 150 lines | ✓ VERIFIED | 392 lines; 5/5 cases independently run and pass. |
| `tests/e2e/agent-ready-export-safety.spec.ts` | Mounts `BottomPanel.vue`, zero `ReviewNotesDialog` refs | ✓ VERIFIED | Passed in full-suite run. |
| `tests/integration/anchored-workspace.spec.ts` | Retargeted to `WorkbenchShell.vue` markup | ✓ VERIFIED | Confirmed via grep + isolated re-run. |

No STUB or MISSING artifacts found. No debt markers (`TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`) found in any Phase 20 source file.

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `panel-state.ts` | `localStorage` | `createPanelState(options)` reads/writes `options.storage` under `loopnote.workbench.v1` | ✓ WIRED | Injectable, default `window.localStorage`; `App.vue:93` calls bare `createPanelState()`. |
| `diff-adapter.ts` | `App.vue`/`DiffWorkspace.vue` navigate callbacks | `AdapterNavigation` object passed into both factory call sites | ✓ WIRED | `DiffWorkspace.vue:57-60` maps adapter callbacks to emits; `App.vue:1345-1432` wires both `DiffWorkspace` instances to `previousFile`/`nextFile`/`previousChange`/`nextChange`. |
| `EditorTitle.vue` | `ActiveFileToolbar.vue` (now deleted, logic ported) | `effectivePath`/`layoutLabel`/`standaloneStateLabel`/`counts` computeds | ✓ WIRED | Computeds present verbatim in `EditorTitle.vue`. |
| `EditorTitle.vue`, `Breadcrumbs.vue`, `FileTree.vue` | `scripts/css-token-contract.mjs` `CANONICAL_TOKENS` | New tokens land with real `var()` consumers | ✓ WIRED | All 10 new tokens (`--titlebar-height`, `--editor-title-height`, `--breadcrumb-height`, `--statusbar-height`, `--view-header-height`, `--font-size-chrome`, `--line-height-chrome`, `--control-height-icon`, `--font-size-label`, `--letter-spacing-label`) registered + consumed; `verify:semantic-css` independently confirmed passing. |
| `WorkbenchShell.vue` | `useSash.ts` | Two independent `useSash()` instances (vertical/horizontal) | ✓ WIRED | Confirmed in component body. |
| `BottomPanel.vue` | `ReviewNotesDialog.vue` (ported) | Identical props/emits, inner markup lines 110-323 ported verbatim, `ModalDialog` wrapper removed | ✓ WIRED | `role="region"` present; `ExportSection`/`SummarySection`/`ReviewStateBadge` imports carried over. |
| `App.vue` | `WorkbenchShell.vue`/`TitleBar.vue`/`EditorTitle.vue`/`Breadcrumbs.vue`/`BottomPanel.vue`/`StatusBar.vue` | Direct imports + template slot usage | ✓ WIRED | All 6 imported and used in the `<WorkbenchShell>` template block (`App.vue:1297-1488`). |
| `tests/e2e/workbench-shell-smoke.spec.ts` | `pinned-session.spec.ts`/`uncommitted-review.spec.ts`/`standalone-review.spec.ts`/`agent-ready-export.spec.ts` | Reused `mkdtempSync`/pack/spawn fixture pattern | ✓ WIRED | Confirmed via `mkdtempSync` usage and shared helper structure. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| panel-state clamp/parse self-healing | `npx vitest run tests/unit/panel-state.test.ts` | 13/13 passed | ✓ PASS |
| 5-session-kind shell smoke | `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` | 5/5 passed | ✓ PASS |
| typecheck:web gate | `npm run typecheck:web` | 0 errors | ✓ PASS |
| verify:semantic-css gate | `npm run verify:semantic-css` | "Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass." | ✓ PASS |
| Full repo Playwright suite (run once, per Step 7b constraint) | `npx playwright test` | 117/118 passed; 1 failed: `responsive-session.spec.ts:777` | ✗ FAIL (new regression — see Gaps) |
| anchored-workspace.spec.ts's isolated-flake re-run (sanity check on the OTHER documented flake) | `npx playwright test tests/integration/anchored-workspace.spec.ts -g "preserves no-reflow Monaco semantic channels"` | 1/1 passed when isolated | ✓ PASS (consistent with genuine intermittent flake, unlike the deterministic responsive-session.spec.ts failure) |
| custody-gated runtime-artifact suite | `npm run test:runtime-artifact` | Failed: `LOOPNOTE_RUNTIME_CUSTODY_DIR is required` (CI-only env) | ? SKIP — routed to human verification |
| Baseline regression-root-cause check | `git worktree add` at pre-Phase-20 commit `35193d7`; re-ran the same named test | Fails there too, but for an unrelated, already-superseded reason (`.review-toolbar` height 77px vs <=41px expected) | Confirms current failure is a NEW regression, not a continuation of a documented flake |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| TOK-01 | 20-02, 20-03, 20-04, 20-05, 20-07, 20-09 | Workbench geometry tokens + `verify:semantic-css` passes | ✓ SATISFIED | All geometry pixel values confirmed; static gate passes. Note: a related browser-level exact-literal e2e check fails due to one non-geometry token's decimal-serialization mismatch (see Gaps) — does not affect the literal TOK-01 wording, but is tracked as a real suite-health gap under the 20-09 "zero new failures" must-have. |
| SHELL-01 | 20-03, 20-06, 20-07, 20-09 | 5 regions, no activity bar/identity header/review rail/footer | ✓ SATISFIED | Truths #2, #20. |
| SHELL-02 | 20-03, 20-05, 20-07, 20-09 | Side bar hide/show + resize, 170–520px, dblclick reset | ✓ SATISFIED | Truths #3, #14, #21. |
| SHELL-03 | 20-03, 20-05, 20-06, 20-07, 20-09, 20-10 | Panel open/close + resize, closed on session start | ✓ SATISFIED | Truths #3, #14, #17, #21. |
| SHELL-04 | 20-01, 20-05, 20-07, 20-09 | Side-bar width + panel height persist; panel open state doesn't | ✓ SATISFIED | Truths #3, #5-7, #23. |
| SHELL-05 | 20-08, 20-09 | One packaged-binary e2e per session kind | ✓ SATISFIED | Truths #4, #24-25. |
| SHELL-06 | 20-05, 20-09 | No page-level horizontal scroll 1050–1920px | ✓ SATISFIED | Truth #16. |
| NAV-01 | 20-02, 20-04, 20-09 | Editor title filename/M-A-D/counts + 8 icon-only tooltipped actions | ✓ SATISFIED | Truths #2, #12. |
| NAV-02 | 20-04, 20-09 | Breadcrumbs above diff | ✓ SATISFIED | Truth #13. |
| NAV-03 | 20-02, 20-07, 20-09 | F7/⇧F7/⌥↓/⌥↑ in/out editor; Monaco's own bindings suppressed | ✓ SATISFIED | Truths #8, #22. |
| NAV-04 | 20-07 | Unsupported/unavailable/changed-during-capture explanation beneath editor title | ✓ SATISFIED | `App.vue:1380-1405` — empty-state/diff-unavailable/loading/error sections all present beneath `EditorTitle`/warning-stack/`Breadcrumbs`, copy unchanged from CONTEXT's documented table. |

No orphaned requirements found: every requirement REQUIREMENTS.md maps to Phase 20 (TOK-01, SHELL-01..06, NAV-01..04) is claimed by at least one of the 10 plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned every Phase-20-modified file in `src/web/` (App.vue, all `components/workbench/*.vue`, `composables/useSash.ts`, `model/panel-state.ts`, `monaco/diff-adapter.ts`, `components/DiffWorkspace.vue`, `components/FileTree.vue`) for `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/`TODO`/stub-return patterns — zero hits.

### Human Verification Required

See frontmatter `human_verification` (4 items): the custody-gated CI-only test run, sash drag feel, overall visual density vs the S2 sketch, and accent-color restraint. None of these are grep/presence-checkable; none are evidence the phase goal was missed — they are the expected end-of-phase human-eyes checkpoint per this project's workflow convention.

### Gaps Summary

One genuine gap, one unverifiable-locally item:

1. **FAILED — 20-09's "zero NEW failures" must-have is false as asserted.** `tests/e2e/responsive-session.spec.ts:777`'s "exact semantic palette, typography, control, and motion contract" sub-step deterministically fails because the new `--letter-spacing-label: 0.04em;` token (introduced by 20-03, the ONLY leading-zero-decimal custom property in `:root`) does not survive a Chromium `getComputedStyle` round-trip (`.04em` comes back, not `0.04em`). This was documented in 20-09-SUMMARY.md and relayed to this verifier as "a pre-existing flake... unrelated to Phase 20's own changes" — this verifier disproved that by running the identical named test against the pre-Phase-20 baseline in an isolated git worktree: it already failed there too, but for a completely different, since-superseded reason (the now-deleted `.review-toolbar`'s height). The current failure is new, caused by Phase 20, and 100% reproducible — not flaky. It is also not a production defect (the rendered letter-spacing is visually/functionally identical either way); it is a one-line test-literal/token-literal mismatch. A trivial fix (write `--letter-spacing-label: .04em;` in `src/web/styles.css`, or normalize the comparison) resolves it.

2. **PRESENT_BEHAVIOR_UNVERIFIED — custody-gated `npm run test:runtime-artifact`.** Could not be exercised locally (requires CI secrets/`LOOPNOTE_RUNTIME_CUSTODY_DIR` from the publish pipeline). The non-custody-gated run of the same spec file passed, which is partial but not complete evidence for 20-10's specific must-have.

Every other must-have across all 10 plans — all four ROADMAP Success Criteria, every PLAN-frontmatter truth, every artifact at all three levels, every key link, and the independently re-run full Playwright/Vitest evidence (117/118, 13/13, 5/5) — is genuinely VERIFIED against the live codebase, not merely claimed by a SUMMARY. The cross-plan regression fix at commit `3e68e6f` (the `.workbench-shell__sidebar > .file-tree-pane { width: 100%; ... }` CSS rule plus the two stale-assertion test updates) was independently diffed and judged sound: the root cause (a dead `.changed-files-sidebar` selector left the real `.file-tree-pane` at its 320px base width inside the new 264px sidebar, causing genuine horizontal overflow/clipping) and fix (retargeting the width override onto the real wrapper class) are a correct production fix, not a test-only cover-up — it fixes an actual rendering bug the old tests happened to catch via an unrelated row-height assertion.

## Post-review fixes (2026-11-05)

Four defects left open by the `20-UI-REVIEW.md` (2026-11-05 audit, `.planning/ui-reviews/20-20261105-003249/`) and an independently discovered unit-test regression were closed, each as its own atomic `fix(20): ...` commit, verified individually and together below.

### 1. Unit regression — `PublicMonacoSinglePaneAdapter` (7/26 failing in `tests/unit/monaco-diff-adapter.test.ts`)

**Root cause:** Phase 20-02 (commit `0c76bfa`) added a required `navigate: AdapterNavigation` parameter to `createMonacoSinglePaneAdapter(host, languageForPath, onChange, navigate, side)` so F7/Shift+F7/Alt+Up/Alt+Down could be registered as Monaco `addAction` overrides on the single-pane editor too (`20-UI-SPEC.md` Keyboard Map: dual registration on both sub-editors *and* the single-pane editor). `src/web/components/DiffWorkspace.vue`'s real call sites were updated correctly (5 positional args), but the 18 call sites in `tests/unit/monaco-diff-adapter.test.ts`'s `PublicMonacoSinglePaneAdapter` describe blocks were not — they still passed only 4 args (`host, languageForPath, onChange, side`), so the literal `'base'`/`'head'` string silently landed in the `navigate` parameter slot and the constructor's own `side` parameter was `undefined`. That broke `side === 'base' ? ... : ...` aria-label derivation, every internal `side`-matching check gating the anchor/view-zone wiring (`addZone`/`removeZone`/`getActiveAnchor`), and the keybinding-count assertion, which additionally still expected exactly one `addAction` call when the component now legitimately registers five (add-comment plus the four new NAV-03 navigation actions).

**Verdict:** production code (`src/web/monaco/diff-adapter.ts`, `src/web/components/DiffWorkspace.vue`) is correct and matches the approved UI spec; the test pinned an outdated 4-argument call shape and an outdated action count. Fixed the test only: added a shared `noopNavigate: AdapterNavigation` stub, passed it as the 4th argument at all 18 `createMonacoSinglePaneAdapter` call sites, and rewrote the keybinding-count assertion to expect 5 total `addAction` calls with the add-comment action present exactly once at index 0 (not weakened — the exact-once claim is still asserted, just against the real action set). Commit `a49789e`.

**Evidence:** `npx vitest run tests/unit/monaco-diff-adapter.test.ts` — 26/26 passed (was 19/26).

### 2. UI-REVIEW blocker — title-bar text overflow (Pillar 2: Visuals, 1/4, BLOCKER)

`.attached-fact` (the title-bar "Agent attached · ..." pill) carried `overflow-wrap: anywhere` with no `white-space`/`text-overflow` guard, shared with unrelated `.attached-completion__*` multi-line body copy; `.header-facts` had no `min-width: 0` to let it shrink inside `.titlebar__center`'s flex row. Long text wrapped onto a second line inside the fixed 32px title bar, colliding with the editor-title row below at all three required widths (1280/1600/1920).

**Fix:** split `.attached-fact` out of the shared wrap-anywhere selector (its only consumer is `TitleBar.vue`), gave it `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0`, matching the existing `.session-header__selector` pattern; added `min-width: 0` to `.header-facts`; added `:title="attachedFact"` so the full string is still available on hover (the DOM text content already carries the full string for the accessible name regardless of the visual ellipsis). Commit `a556fdd`.

**Evidence:** real-Chromium screenshot at 1280×900 against the built runtime (`dist/bin/loopnote.mjs`, agent-attached session — the longest `attachedFact` string, "Agent attached · waiting for Finish review") via Playwright `chromium.launch()`: `.titlebar` bounding box `{x:0,y:0,w:1280,h:32}` (height stayed exactly the `--titlebar-height` token, no growth); `.editor-title` bounding box `{x:264,y:32,...}`; `.titlebar` bottom edge (32) does not exceed `.editor-title` top edge (32) — no overlap. `.attached-fact`'s `textContent` was still the full un-truncated string (ellipsis is visual-only). Screenshot showed a single clean title-bar row with the pill visually ellipsized ("Agent attached · waiting …"), no second line, no collision with the file-name/status row beneath. Screenshot and script deleted after inspection. Also covered by `tests/e2e/workbench-shell-smoke.spec.ts`'s `agent-attached` case (asserts `.attached-fact` `toHaveText` the full string) — passed.

### 3. UI-REVIEW blocker — duplicate side-bar toggle (Pillars 2 and 6, BLOCKER)

`TitleBar.vue`'s icon button ("Toggle side bar (⌘B)") and `EditorTitle.vue`'s text button ("Hide files sidebar"/"Show files sidebar") both bound `panelState.sidebarVisible`, simultaneously visible on every desktop screenshot — two differently-named affordances for one action, contradicting `20-UI-SPEC.md`'s "Removed phase" instruction that `ActiveFileToolbar`'s Hide/Show-files button folds into the title-bar toggle.

**Fix:** gated `EditorTitle.vue`'s button behind `v-if="filesDrawer"` so it only renders at narrow (<760px) viewports, where the spec explicitly keeps an "Open files" drawer trigger ("since the title-bar sidebar toggle doesn't apply at narrow widths"). `toggleSidebar()` in `App.vue` already branched on `isNarrow` to open the drawer vs. toggle the persistent sidebar, so no behavior change was needed there. Removed the now-dead `filesCollapsed` prop and the `filesHostVisible`/`filesToggleCopy`/`filesToggleLabel` ternary branches that only existed to drive the removed desktop copy. The removed button was also the `ModalDialog` focus-restore opener for the narrow drawer (the same DOM node persisted across the narrow/wide breakpoint, just relabeled); since that node now unmounts outside narrow mode, added `TitleBar.vue#focusSidebarToggle()` and call it from `App.vue#handleViewportChange` when a narrow→wide resize auto-closes the drawer, so keyboard/screen-reader users don't lose focus. Updated `tests/integration/anchored-workspace.spec.ts`'s desktop-resize locator from the removed `'Hide files sidebar'` name to `'Toggle side bar (⌘B)'`; no other spec referenced the removed control (`responsive-session.spec.ts`'s `>760px` locator already expected `'Toggle side bar (⌘B)'`). Commit `fb3bc04`.

**Evidence:** the same real-Chromium screenshot script queried every `button` with an accessible name matching `/side ?bar|hide files|show files/i` at 1280px desktop width — exactly one match, `'Toggle side bar (⌘B)'`. `npx playwright test tests/integration/anchored-workspace.spec.ts` (includes the updated focus-after-resize assertion) and `tests/e2e/responsive-session.spec.ts`, `tests/e2e/anchored-review.spec.ts` (narrow-mode "Open files" drawer still works) — all passed.

### 4. Plural — `StatusBar.vue` "1 open comments"

`StatusBar.vue:44` rendered `{{ openCommentCount }} open comments` unconditionally. Fixed with the project's established `n === 1 ? '' : 's'` idiom: `{{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}`. Commit `5e75358`.

**Sibling-count check:** reviewed every count display in the Phase-20-introduced workbench components — `BottomPanel.vue`'s `ReviewStateBadge` labels ("Open N" / "Resolved N") have no trailing plural noun, so no grammar issue; `EditorTitle.vue`'s `+N −N` counts are symbol-prefixed, not words. Found no other Phase-20-introduced instance of this bug. Two pre-existing instances exist elsewhere (`TitleBar.vue`'s standalone-session `` `${count} files` `` label and `ExportReadinessSummary.vue`'s `` `${attentionCount} comments need reviewer attention` `` heading) but both predate Phase 20 (verified via `git log`: last touched in commits `901ae97`/`86effbf`, both before the `0fe0abd` pre-Phase-20 baseline) and are out of this phase's scope — left untouched.

### Combined verification after all four fixes

- `npm run typecheck:web` — 0 errors.
- `npm run verify:semantic-css` (rebuilds `dist/web` then runs the token-contract gate) — passed: "canonical root, retired vocabulary, and author-style invariants pass."
- `npx vitest run tests/unit` — 373/373 passed under `--no-file-parallelism`. Under default file-parallelism, `tests/unit/token-contract.test.ts`'s Vite-dev-server-reload test occasionally times out at the global 10s `testTimeout` from resource contention with other concurrently-spawned test files; it passes reliably both in isolation and under `--no-file-parallelism`, and touches none of the four fixed files — a pre-existing environmental flake, not a regression from this work.
- `npm run build:web` then `npx playwright test tests/e2e/responsive-session.spec.ts tests/e2e/anchored-review.spec.ts tests/e2e/pinned-session.spec.ts tests/e2e/workbench-shell-smoke.spec.ts tests/integration/anchored-workspace.spec.ts` (every spec that exercises the title bar, the side-bar toggle, the narrow "Open files" drawer, or the status bar) — 35/35 passed.

---

_Verified: 2026-11-04T22:55:14Z_
_Verifier: the agent (gsd-verifier)_
