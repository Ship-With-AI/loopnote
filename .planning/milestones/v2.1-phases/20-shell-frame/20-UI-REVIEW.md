# Phase 20 — UI Review

**Audited:** 2026-11-05
**Baseline:** `.planning/phases/20-shell-frame/20-UI-SPEC.md` (approved 2026-11-04)
**Screenshots:** captured — real-browser (managed Google Chrome via CDP), packaged runtime (`dist/bin/loopnote.mjs`), widths 1280/1600/1920 × 900. Directory: `.planning/ui-reviews/20-20261105-003249/`

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Status-bar comment count hardcodes plural ("N open comments"), breaking the spec's `{N} open comment{s}` contract and the project's own established pluralization convention. |
| 2. Visuals | 1/4 | Title-bar identity/agent-status text overflows the fixed 32px title bar and visually collides with the editor-title row below, at all three required widths; compounded by a duplicate sidebar-toggle control (two different controls, two different accessible names, one state). |
| 3. Color | 4/4 | No hardcoded colors in new chrome; accent reserved exactly to the two declared uses (sash hover/drag, Export emphasis); toggled icon buttons correctly use the neutral active surface, not accent. |
| 4. Typography | 4/4 | New chrome uses exactly the three declared tokens (`--font-size-chrome/-label/-metadata`) and one weight (`--font-weight-semibold` for filename/status); matches spec's type scale precisely. |
| 5. Spacing | 4/4 | Only `--space-1/2/3` and documented geometry tokens used; grid rows/columns built from `--titlebar-height`/`--statusbar-height`/`--sidebar-width-default` tokens, no magic numbers outside the spec's own literal "4px hit area" sash dimension. |
| 6. Experience Design | 2/4 | Duplicate, differently-labeled side-bar toggle controls violate SHELL-01's explicit "ActiveFileToolbar's Hide/Show files button → title-bar toggle" consolidation; otherwise strong state coverage (panel closed-by-default, clamped persistence, sash a11y, keyboard shortcuts). |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Title-bar identity text collides with the editor-title row at every required width (1280/1600/1920)** — users see overlapping/illegible chrome text and, at narrower widths, the overlap reaches toward the editor-title toolbar's top-right controls — **concrete fix:** give `.attached-fact` (and `.header-facts`) the same `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` treatment already used on `.session-header__selector` (`src/web/styles.css:310-313`), or raise `.titlebar__center`'s available width/remove `overflow-wrap: anywhere` (`src/web/styles.css:1877-1879`) so the fixed 32px title bar never grows taller than its token height.
2. **Two controls toggle the same side-bar state with two different accessible names** — `TitleBar.vue`'s icon button ("Toggle side bar (⌘B)", `src/web/components/workbench/TitleBar.vue:171-180`) and `EditorTitle.vue`'s text button ("Hide files"/"Show files sidebar", `src/web/components/workbench/EditorTitle.vue:83-87,221-229`) both bind to `panelState.sidebarVisible` (`src/web/App.vue:1298,1314,1333`) — a screen-reader or keyboard user encounters two redundant, inconsistently-named affordances for one action, directly contradicting UI-SPEC's "Removed phase" instruction that ActiveFileToolbar's Hide/Show-files button folds into the title-bar toggle — **concrete fix:** delete the `filesToggle` button from `EditorTitle.vue` for the desktop (non-`filesDrawer`) case, keeping only the narrow-mode ("Open files") variant the spec explicitly retains.
3. **Status-bar comment count never pluralizes correctly** — `StatusBar.vue:44` renders `{{ openCommentCount }} open comments` unconditionally, so a single open comment reads "1 open comments," contradicting both the Copywriting Contract's `{N} open comment{s}` requirement and the project's own established pattern (`App.vue:1369`, `RefreshSummaryPanel.vue:67,70` both use `{{ n === 1 ? '' : 's' }}`) — **concrete fix:** `{{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **Confirmed compliant:** Every CTA-equivalent label matches the Copywriting Contract exactly as captured live in the browser: "Toggle panel (⌘J)," "Toggle side bar (⌘B)," "Close panel," "Export," region `aria-label="Review"`. No generic "Submit/OK/Click Here" patterns found anywhere in the new workbench components (`grep` for those strings across `src/web/components/workbench/*.vue` returns nothing).
- **Violation — `src/web/components/workbench/StatusBar.vue:44`:** `{{ openCommentCount }} open comments` is a static string with no pluralization branch, so it reads "0 open comments" (fine) but also "1 open comments" (wrong) for any count of exactly one. `openCommentCount` itself is a plain `computed<number>` passed straight through from `App.vue:297`/`1480` with no formatting layer. The spec's Copywriting Contract table states explicitly: `Status-bar comment count | "{N} open comment{s}"`. The project already has an established convention for this exact pattern at `src/web/App.vue:1369` (`{{ capturedFilesChanged }} file{{ capturedFilesChanged === 1 ? '' : 's' }} changed…`) and `src/web/components/RefreshSummaryPanel.vue:67,70` (`{{ staleCount }} comment{{ staleCount === 1 ? '' : 's' }} now stale`) — `StatusBar.vue` does not reuse it.
- Empty/error/unavailable-file copy (NAV-04) is untouched/reused per spec; not independently re-verified beyond confirming the relevant components (`ErrorState.vue`, `DraftRecovery.vue`, `InlineNotice.vue`) are still wired in `App.vue` and render inside the new editor column.

### Pillar 2: Visuals (1/4)

- **BLOCKER — title-bar text overflow collides with content below, reproduced at all three required widths.** `TitleBar.vue`'s `.titlebar__center` (`src/web/components/workbench/TitleBar.vue:208-217`) is `position: absolute; left: 50%; max-width: 56%` inside a `.titlebar` fixed at `height: var(--titlebar-height)` (32px, `TitleBar.vue:196-206`). The `.header-facts` row it contains (`pin-cue` "Pinned comparison" + `.attached-fact` "Agent attached · waiting for Finish review" when an agent session is attached) has no `white-space: nowrap`/`text-overflow: ellipsis` guard; `.attached-fact` instead carries `overflow-wrap: anywhere` (`src/web/styles.css:1877-1879`) with no sibling max-width/truncation rule, unlike `.session-header__selector` which correctly truncates (`src/web/styles.css:310-313`). Because the container is absolutely positioned and out of normal flow, the wrapped multi-line text is *not* clipped to the 32px bar — it paints over the editor-title row immediately below. Confirmed visually in all three captured screenshots (`shell-1280x900.png`, `shell-1600x900.png`, `shell-1920x900.png`): the wrapped "waiting for Finish review" text sits directly on top of / immediately adjacent to the editor-title toolbar's "Hide files" control, worst at 1280px where it wraps to three lines.
- **BLOCKER — duplicate side-bar toggle controls** (see Top 3 Fix #2 for file:line evidence) — two visually distinct buttons (title-bar icon vs. editor-title text button) are simultaneously visible on every desktop screenshot, which also reads as unintentional visual redundancy/clutter, not just an a11y concern.
- **Confirmed compliant:** every icon-only button observed (`Previous change`, `Next change`, `Previous file`, `Next file`, `Side-by-side diff`, `Inline diff`, `Toggle side bar`, `Toggle panel`) carries a paired `aria-label`/`title` tooltip (verified via `tab.ariaSnapshot()` against the live packaged app — all icon buttons report accessible names). Visual hierarchy (filename `h1` largest/boldest element in the editor column, muted breadcrumbs beneath, flat 1px borders, no card chrome) matches the sketch direction.

### Pillar 3: Color (4/4)

- Zero hardcoded hex/`rgb()` values found in any new workbench component (`grep -nE "#[0-9a-fA-F]{3,8}|rgba?\("` across `src/web/components/workbench/*.vue` returns no matches).
- `--interactive-accent-emphasis` appears in exactly two places in the new components: `StatusBar.vue:103` (`.statusbar__item--emphasis`, gated by `exportSupported`) and `WorkbenchShell.vue:138` (`.workbench-shell__sash:hover,:active`) — matching the spec's "reserved exactly: (1) sash hover/drag fill, (2) status-bar Export item" rule word-for-word.
- Toggled-on icon buttons (`.icon-btn[aria-pressed="true"]`, `TitleBar.vue:245-248`) use `--surface-interactive-active` (neutral), not accent — matching the spec's explicit instruction that pressed state must not compete visually with the one emphasized status-bar item.

### Pillar 4: Typography (4/4)

- Only three font-size tokens appear across the new workbench components: `--font-size-chrome`, `--font-size-label`, `--font-size-metadata` (`grep -ohE "font-size:\s*var\(--[a-z-]+\)" src/web/components/workbench/*.vue | sort -u`) — exactly the three the spec's Typography table declares for this phase's chrome.
- Only one font-weight token appears: `--font-weight-semibold` (`Breadcrumbs.vue:49`, filename segment), matching the spec's "filename + M/A/D use semibold (600)" rule; everything else inherits the regular (400) default.
- All new tokens (`--titlebar-height`, `--view-header-height`, `--editor-title-height`, `--breadcrumb-height`, `--statusbar-height`, `--font-size-chrome`, `--line-height-chrome`, `--font-size-label`, `--letter-spacing-label`) are present in both `src/web/styles.css :root` and `scripts/css-token-contract.mjs`'s `CANONICAL_TOKENS` array — the governance gate the spec requires is real, not just documented.

### Pillar 5: Spacing (4/4)

- Spacing tokens used in the new components are limited to `--space-1`/`--space-2`/`--space-3` plus the documented geometry tokens (`--control-height-icon`, `--radius-control`, `--sidebar-width-min/-max`, `--panel-height-min/-max`) — no arbitrary px values found in `margin`/`padding`/`gap` declarations.
- `WorkbenchShell.vue:107,116` builds the shell's CSS Grid entirely from tokens: `grid-template-rows: var(--titlebar-height) 1fr var(--statusbar-height)`, `grid-template-columns: var(--sidebar-width-default) 1fr`. The one literal pixel value present (`height: 4px` on the sash) matches the spec's own literal "4px hit area" sash dimension, not a content-spacing value, and the spec explicitly carves out geometry tokens from the `--space-*` grid-alignment rule.
- `tree-row` correctly consumes `min-height: var(--file-row-min-height)` (`styles.css:927`) per the documented token swap.

### Pillar 6: Experience Design (2/4)

- **Notable gap:** the duplicate side-bar toggle (detailed under Visuals/Top-3-Fix-#2) is also an Experience Design defect, not just a visual one — it presents two differently-labeled affordances ("Toggle side bar (⌘B)" vs. "Hide files sidebar"/"Show files sidebar") for one piece of state, which is confusing for assistive-technology users navigating by accessible name and directly contradicts the approved spec's explicit consolidation instruction.
- **Confirmed compliant — strong state coverage otherwise:**
  - Panel starts closed every session, never persisted (`App.vue:94`, `const panelOpen = ref(false)`), matching SHELL-03.
  - `localStorage` persistence (`loopnote.workbench.v1`) clamps/replaces corrupt or out-of-range values with documented defaults (`panel-state.ts:51-53,83-90`), matching SHELL-04.
  - Both sashes carry `role="separator"`, `aria-orientation`, `aria-valuenow`, `aria-label` (`WorkbenchShell.vue:10-13,26-29`) and support double-click reset (`@dblclick="sidebarSash.reset"` / `panelSash.reset"`, `WorkbenchShell.vue:20,35`).
  - Keyboard shortcuts (F7/⇧F7, ⌥↑/⌥↓, ⌘B, ⌘J) are registered live and confirmed functional against the packaged runtime; toggled icon buttons correctly report `aria-pressed`.
  - `Breadcrumbs.vue` is correctly non-interactive (no `tabindex`, no click handlers) per the "orientation only this phase" decision.

---

## Screenshots

Real-browser captures (managed Google Chrome via CDP, not headless CLI), against the packaged runtime `dist/bin/loopnote.mjs` launched via the agent-request protocol (pinned base/head OIDs) against a real two-commit git fixture (6 changed files: added, modified, deleted, renamed), with `src/domain/account.ts` selected in the file tree (side-by-side diff visible):

- `.planning/ui-reviews/20-20261105-003249/shell-1280x900.png` (1280×900)
- `.planning/ui-reviews/20-20261105-003249/shell-1600x900.png` (1600×900)
- `.planning/ui-reviews/20-20261105-003249/shell-1920x900.png` (1920×900)

All three show the title-bar text-collision defect described above (Top 3 Fix #1) and the duplicate side-bar toggle (Top 3 Fix #2).

---

## Files Audited

- `src/web/components/workbench/TitleBar.vue`
- `src/web/components/workbench/StatusBar.vue`
- `src/web/components/workbench/EditorTitle.vue`
- `src/web/components/workbench/Breadcrumbs.vue`
- `src/web/components/workbench/WorkbenchShell.vue`
- `src/web/components/workbench/BottomPanel.vue`
- `src/web/App.vue` (wiring/state ownership only)
- `src/web/model/panel-state.ts`
- `src/web/theme/token-contract.ts`
- `scripts/css-token-contract.mjs` (`CANONICAL_TOKENS`)
- `src/web/styles.css` (new-token `:root` definitions, `.titlebar*`/`.header-facts`/`.attached-fact`/`.session-header__selector`/`.tree-row` rules)
- `.planning/phases/20-shell-frame/20-UI-SPEC.md`, `20-CONTEXT.md`, `20-01` through `20-10-SUMMARY.md`
- `.kimi-code/skills/sketch-findings-loopnote/SKILL.md`, `.kimi-code/skills/loopnote/SKILL.md`
- Live packaged app (`dist/bin/loopnote.mjs`) at `http://127.0.0.1:<port>/#token=…`, inspected via `tab.ariaSnapshot()` and three real-browser screenshots (1280/1600/1920 × 900)
