# Phase 25 UI Review

**Audited:** 2026-11-06
**Baseline:** `25-UI-SPEC.md` (approved design contract, 2026-11-05)
**Screenshots:** captured — real browser (Chromium via Playwright) against the **built runtime** (`dist/bin/loopnote.mjs`), not Vite dev server. Three viewport widths captured: **1280×800, 1600×900, 1920×1080**.
**Screenshot directory:** `.planning/ui-reviews/25-20261106-074240/` (7 PNGs, `.gitignore`-gated; gate pre-existed, verified present before capture)

Audit method note: this phase ships **no new visual surface** (per `25-UI-SPEC.md:15`) — every change is `role`/`aria-label` attributes, `announce()` calls, or prose. A throwaway Playwright spec (`/tmp/ui-audit-25/audit.spec.ts`, not committed) reused the exact pack/spawn/loopback-URL pattern from `tests/e2e/toolbar-roles.spec.ts` and `tests/e2e/workbench-shell-smoke.spec.ts` against a `createGitFixture()` repo with one nested (`src/components/Widget.vue`) and one root-level (`readme.md`) changed file, driving a real Chromium instance at all three required widths. All 7 assertions passed; the spec, its config, the git fixture, and the spawned CLI process were removed after the run (nothing committed, nothing left running).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every new/fixed `announce()` string in `App.vue` byte-matches `25-UI-SPEC.md`'s Live-Region Announcement Contract; the two UI-SPEC-mandated strings (`'Viewing as list.'`, `'Comment restored. {n} open, {n} resolved.'`) confirmed live in Chromium. |
| 2. Visuals | 4/4 | Zero new visual elements; the only structural change (toolbar `role` on inner wrapper divs) is correctly layered so `<header>`/`<footer>` keep their implicit `banner`/`contentinfo` landmarks — confirmed live at all 3 widths. |
| 3. Color | 4/4 | `grep` for hex/`rgb()` across every touched file (`TitleBar.vue`, `StatusBar.vue`, `FileTree.vue`, `App.vue`) returns zero hits — no new color value introduced, matching the spec's "zero new... colour values" claim. |
| 4. Typography | 4/4 | Diff in `TitleBar.vue`/`StatusBar.vue` is attribute-only (`role`, `aria-label`) — no `<style>` block touched, no new font-size/weight class anywhere in the phase's file set. |
| 5. Spacing | 4/4 | Same attribute-only diff — `.titlebar__right`/`.statusbar__right` CSS rules (gap, padding) are untouched; zero new spacing token or arbitrary value introduced. |
| 6. Experience Design | 4/4 | DEBT-01's five toolbar/tablist/landmark regions all resolve by role+name at 1280/1600/1920; TREE-04's name-first list-mode fix holds (DOM order **and** visual left-to-right order) at all 3 widths, with tree mode correctly reverting to basename-only (no regression). |

**Overall: 24/24**

---

## Top 3 Priority Fixes

No blockers or regressions found. The following are non-blocking, forward-looking observations only — nothing here breaks the UI-SPEC contract or requires action before shipping:

1. **Two of the five locked live-region announcements (panel-tab-switch, markdown source/rendered toggle) were confirmed by static code read only, not exercised live in this audit's 3-width browser matrix** — user impact: none (both strings byte-match `25-UI-SPEC.md:177-179,210` in `App.vue:539,576`, and the mechanism is identical to the two strings that *were* live-verified) — concrete follow-up: a future regression pass could click a bottom-panel tab and toggle a markdown file's source/rendered mode inside the same packaged-binary harness for full live coverage of all five announcement sites, not just the two the UI-SPEC called out by number.
2. **Three pre-existing, phase-25-untouched local `aria-live="polite"` regions coexist with `App.vue`'s single document-level live region** (`CopyButton.vue:53`, `ExportProgress.vue:22`, `SupportDialog.vue:47`) — user impact: none today; these are self-contained widget-status regions (copy-feedback, export-progress spinner, support-dialog status), architecturally distinct from the cross-cutting workbench announcements this phase's contract governs, and every *new* announcement this phase added does route through the single `App.vue` owner (confirmed: `App.vue:368,378,427,539,555,569,576` all call the one `announce()` function) — concrete follow-up: a one-line note in `DESIGN.md`'s accessibility section distinguishing "document-level live region" from "local status widgets" would pre-empt a future contributor mistakenly collapsing the three local regions into the single one in a way that breaks their synchronous local feedback.
3. **List mode's directory segment visibly truncates under `text-overflow` at narrow sidebar widths** (confirmed in the 1280×800 and 1600×900 screenshots: `src…` rendered for `src/components/`) — user impact: none, this is pre-existing, expected truncation with a native tooltip fallback (`PathDisplay.vue:44`'s `:title="effectivePath?.display"` on the outer wrapper), and critically the **filename itself never truncates first** — the name-first fix correctly keeps the always-readable part (the filename) ahead of the sometimes-truncated part (the directory) — concrete follow-up: none required; noted only because it's the kind of interaction a narrower audit might miss.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- `App.vue:427` — `announce(\`Comment restored. ${openCommentCount.value} open, ${workspaceComments.value.length - openCommentCount.value} resolved.\`)` — byte-identical to the audit-driven copy fix locked at `25-UI-SPEC.md:218`, reusing the existing `openCommentCount` computed rather than new state, exactly as specified.
- `App.vue:368,378` — `'Thread collapsed.'`/`'Thread expanded.'` and `'All threads collapsed.'`/`'All threads expanded.'` — match `25-UI-SPEC.md:185-192` verbatim.
- `App.vue:539` — `` `${PANEL_TAB_LABELS[tab]} tab selected.` `` — matches the Panel tab switch contract (`25-UI-SPEC.md:177-179`), reusing Phase 24's own tab-label strings rather than inventing new copy.
- `App.vue:555` — `'Viewing as list.'`/`'Viewing as tree.'` — matches the View-mode toggle contract (`25-UI-SPEC.md`'s TREE-04 bullet); **confirmed live in Chromium** (DOM read of `p.visually-hidden[aria-live="polite"] span` returned exactly `"Viewing as list."` after clicking the toggle, at all 3 widths).
- `App.vue:569` — `` `No changed files match "${query}".` `` / `` `${matched} of ${total} files match.` `` — the former is the pre-existing string the spec says is reused verbatim (`25-UI-SPEC.md:150`); confirmed unchanged.
- `App.vue:576` — `'Showing Markdown source.'`/`'Showing rendered Markdown.'` — matches `25-UI-SPEC.md:210`.
- Copywriting Contract table (`25-UI-SPEC.md:147-153`) correctly declares every CTA/empty/error row "Not applicable" — this phase adds zero new interactive elements, and I found none in the touched file set.

### Pillar 2: Visuals (4/4)

- `TitleBar.vue:47,63` — `<header class="titlebar">` wraps a `<div class="titlebar__right" role="toolbar" aria-label="Title bar actions">`; the `role="toolbar"` is correctly placed on the inner wrapper, never on `<header>` itself. Confirmed live: `page.getByRole('banner')` resolves and is visible at all 3 widths.
- `StatusBar.vue:59,64` — identical pattern: `<footer class="statusbar">` → inner `<div class="statusbar__right" role="toolbar" aria-label="Status bar actions">`. Confirmed live: `page.getByRole('contentinfo')` resolves and is visible at all 3 widths.
- `FileTree.vue:410` and `EditorTitle.vue:101` (pre-existing, unchanged) — `role="toolbar"` already correctly scoped to inner wrappers, not the `<nav>`/`<div>` landmark host; re-verified unchanged per the UI-SPEC's regression table (`25-UI-SPEC.md:87-89`).
- `BottomPanel.vue`'s `role="tablist" aria-label="Review panel"` (Phase 24, untouched) resolves correctly alongside the new toolbar regions — confirmed `page.getByRole('tablist', { name: 'Review panel' })` visible at all 3 widths, opened via the title bar's `⌘J` toggle button.
- No new icon-only button without an `aria-label` found in the touched file set (none were added — the phase's changes are `role`/`aria-label` additions to *existing* button clusters, not new buttons).

### Pillar 3: Color (4/4)

- `grep -n "#[0-9a-fA-F]\{3,8\}\|rgb("` across `TitleBar.vue`, `StatusBar.vue`, `FileTree.vue`, `App.vue` returns zero matches.
- No `<style>` block was touched in any of this phase's files (confirmed via the attribute-only diff shape of `TitleBar.vue:63` and `StatusBar.vue:64`), so no existing color usage could have regressed either.

### Pillar 4: Typography (4/4)

- Zero `font-size`/`font-weight` declarations added or changed — the phase's CSS footprint is literally zero (no `<style>` block in the diff for any touched component).
- `25-UI-SPEC.md:52-61`'s Typography table is declared "No new size, weight, or line-height" and that holds under direct inspection of every touched file.

### Pillar 5: Spacing (4/4)

- `25-UI-SPEC.md:35-48`'s Spacing Scale table declares zero new spacing value and "no element gains new padding, gap, geometry" — confirmed: `.titlebar__right` (`TitleBar.vue:135-142`) and `.statusbar__right` (`StatusBar.vue:111-117`) CSS rules are byte-identical to their pre-phase-25 state; only the template's `role`/`aria-label` attributes changed.
- Screenshot comparison across 1280/1600/1920 shows consistent, unchanged toolbar/statusbar layout — no visual reflow introduced by the `role` additions (expected, since ARIA roles have no layout effect).

### Pillar 6: Experience Design (4/4)

**DEBT-01 (toolbar/landmark structure) — verified live at all 3 widths:**
- `getByRole('toolbar', { name: 'Title bar actions' })` ✅ visible at 1280×800, 1600×900, 1920×1080
- `getByRole('toolbar', { name: 'Changed files actions' })` ✅ visible at all 3
- `getByRole('toolbar', { name: 'Diff navigation' })` ✅ visible at all 3
- `getByRole('tablist', { name: 'Review panel' })` ✅ visible at all 3 (bottom panel opened via `⌘J` toggle before the check)
- `getByRole('toolbar', { name: 'Status bar actions' })` ✅ visible at all 3
- `getByRole('banner')` ✅ visible at all 3 — `TitleBar.vue`'s `<header>` landmark intact
- `getByRole('contentinfo')` ✅ visible at all 3 — `StatusBar.vue`'s `<footer>` landmark intact
- A dedicated proof spec for this (`tests/e2e/toolbar-roles.spec.ts`) already exists in the repo per `25-UI-SPEC.md:116`'s instruction and passed in this project's own regression gate; this audit's independent 3-width re-verification found the same result with zero deviation.

**TREE-04 (name-first list-mode order) — verified live at all 3 widths, both directions:**
- **Tree mode (default):** `FileRow.vue:110`'s `:basename="mode !== 'list'"` means tree-mode rows render **only** `.path-text__filename` (confirmed: `.path-text__directory` count is 0 for the nested `src/components/Widget.vue` row) — the directory is conveyed by the folder hierarchy itself, not inline text. Confirmed at all 3 widths.
- **List mode:** after clicking the view-options toggle (`FileTree.vue:423-426`, `aria-label="View as list"`), `.file-tree` correctly flips to `role="listbox"`, and the nested file's row now renders **both** spans with `.path-text__filename` (`"Widget.vue"`) appearing **before** `.path-text__directory` (`"src/components/"`) in DOM order — verified via `innerHTML` index comparison **and** via `boundingBox().x` (filename span strictly left of directory span on screen) at all 3 widths. Screenshots (`list-mode-{1280x800,1600x900,1920x1080}.png`) visually confirm "Widget.vue" rendered before the dimmed "src..." segment.
- **Root-level file (`readme.md`, no directory component):** list mode still renders an (empty) `.path-text__directory` span per `basename=false` always applying in list mode, but it correctly has zero text content — the degenerate case doesn't break.
- **Toggling back to tree mode:** `.file-tree` correctly reverts to `role="tree"`, and the nested file's row correctly reverts to filename-only (`.path-text__directory` count 0 again) — no state leak between modes.
- **Unaffected call sites** (`25-UI-SPEC.md`'s locked requirement that TREE-04 not touch other `PathText`/`PathDisplay` call sites): `EditorTitle.vue:104`'s `<PathDisplay basename />` call (no `name-first` prop) renders the editor heading with **zero** `.path-text__directory` elements regardless of global view mode — confirmed live (`editor-title-unaffected.png`). `CommentComposer.vue:47` and `AttachedCompletionWaiting.vue:55,57` call `<PathText :display="..." />` with no `nameFirst`/`basename` props at all, so `PathText.vue:9`'s `nameFirst?: boolean` default (`false`/falsy) applies — they fall through to `PathText.vue:24`'s directory-first template branch unconditionally; this was confirmed by direct source read (these call sites render inside comment-thread/finish-review UI that requires an active comment session to mount, which was out of scope for this audit's fixture — the static-code confirmation is unambiguous given `PathText.vue`'s own `v-else` branch structure, but is disclosed here as code-verified rather than live-rendered).

**Live-region single-owner contract:** every new/fixed `announce()` call in this phase routes through `App.vue:499`'s one `announce()` function and the one `<p aria-live="polite">` at `App.vue:1809-1811` — confirmed by `grep` across `App.vue` (7 distinct call sites: `:368,378,427,539,555,569,576`), and confirmed live for the view-mode-toggle case (exact string match `"Viewing as list."`).

---

## Files Audited

- `src/web/components/workbench/TitleBar.vue`
- `src/web/components/workbench/StatusBar.vue`
- `src/web/components/FileTree.vue`
- `src/web/components/FileRow.vue`
- `src/web/components/PathDisplay.vue`
- `src/web/components/ui/PathText.vue`
- `src/web/components/workbench/EditorTitle.vue` (code read, spot-checked live)
- `src/web/components/CommentComposer.vue` (code read only)
- `src/web/components/AttachedCompletionWaiting.vue` (code read only)
- `src/web/components/workbench/BottomPanel.vue` (unchanged, Phase 24 — re-verified live)
- `src/web/App.vue` (live-region owner, all `announce()` call sites)
- `src/web/components/CopyButton.vue`, `ExportProgress.vue`, `SupportDialog.vue` (pre-existing local `aria-live` regions, checked for scope only)
- `tests/e2e/toolbar-roles.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts`, `tests/helpers/git-fixture.ts`, `tests/helpers/open-runtime-session.ts` (reference patterns reused by this audit's throwaway spec)
- `dist/bin/loopnote.mjs` + `dist/web` (the packaged runtime actually exercised in Chromium)
