# Phase 21 — UI Review

**Audited:** 2026-11-05
**Baseline:** `21-UI-SPEC.md` (status: approved, checker sign-off: all 6 dimensions PASS, 2 pre-approved non-blocking FLAGs on Visuals/Typography)
**Screenshots:** captured — real Chromium (Google Chrome, driven via CDP), against the built runtime (`npm run build` output, `dist/bin/loopnote.mjs` launched with a pinned `base=9fda6e1 → head=<current HEAD>` comparison of this repository itself, 65 changed files). Widths: 1280×900, 1600×1000, 1920×1080, plus a 400×800 narrow-layout pass (the `<760px` `ChangedFilesDialog` breakpoint). Per `.planning/ui-reviews/.gitignore` convention, no screenshot binaries were written into the repo — all captures lived only in the Chromium session's temp output and were discarded after review; none require cleanup.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Two new `StatusBadge` labels break the project's existing sentence-case screen-reader-label convention |
| 2. Visuals | 3/4 | Clear new row/popover hierarchy, but the view-options popover shipped clipped in 3 distinct layout contexts before this run's code-review fixes; now verified clean in all 3 |
| 3. Color | 4/4 | Exactly one new, justified `--interactive-accent` use (comment badge); 60/30/10 split intact; zero hardcoded hex/rgb in any phase-21 component |
| 4. Typography | 3/4 | 3-size/2-weight scale honored everywhere except one rule (`.tree-row .status-badge`) that hardcodes `11px` instead of `var(--font-size-label)` |
| 5. Spacing | 4/4 | `--space-*` scale reused throughout; every new px literal is a pre-declared fixed-component-dimension exemption, matching Phase 20's precedent |
| 6. Experience Design | 3/4 | Strong state coverage (empty filter, persisted view-options, keyboard map), but the popover's three-round clipping saga shows the new modal-nesting/short-content edge cases were under-tested pre-review; `Tab` still doesn't close the open menu (WAI-ARIA menu-button deviation) |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **`ViewOptionsMenu.vue` doesn't close on `Tab`** — a sighted keyboard user tabbing out of the menu is left with `role="menu"` still open and the `document` `pointerdown` listener still attached, focus visibly outside the menu — deviates from the WAI-ARIA menu-button pattern. Fix: add `if (event.key === 'Tab') { emit('close'); return; }` (no `preventDefault`) at the top of `handleKeydown` (`src/web/components/ViewOptionsMenu.vue:65`).
2. **`StatusBadge.vue`'s two new labels break the sentence-case convention** the other five labels follow (`'Added'`, `'Modified'`, …) — the two this phase added are lower-case (`'type changed'`, `` `unsupported status: ${props.code}` ``), inconsistent screen-reader announcement style. Fix: capitalize both (`'Type changed'`, `` `Unsupported status: ${props.code}` ``) — `src/web/components/StatusBadge.vue:25-28`.
3. **Typography token drift in `.tree-row .status-badge`** — `font: var(--font-weight-semibold) 11px/1 var(--font-mono);` hardcodes `11px` where every sibling rule (file-type mark, markers) correctly uses `var(--font-size-label)`. Harmless today (the literal matches the token's current value) but will silently desync if `--font-size-label` is ever retuned. Fix: `font: var(--font-weight-semibold) var(--font-size-label)/1 var(--font-mono);` — `src/web/styles.css:1064`.

None of the above are BLOCKER-level (user task completion is not broken by any of them); all are WARNING/Info-tier polish items appropriate for a future pass, not this post-exec cycle.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- Footer totals, filter empty-state copy (`No changed files match "{query}".`, curly quotes as specified), and comment-badge pluralization (`"{N} open comment" + (N===1 ? '' : 's')`, `FileRow.vue:146`) all match the UI-SPEC contract verbatim — confirmed both in code and live in the browser via the `src/web/components` filter screenshot ("10 of 65 files" footer, correct singular/plural grammar observed on badge counts during the session).
- **Finding (carried from code review, IN-02):** `StatusBadge.vue:25-28` introduces `'type changed'` and `` `unsupported status: ${props.code}` `` — both lower-case, while the five pre-existing labels (`'Added'`, `'Copied'`, `'Deleted'`, `'Modified'`, `'Renamed'`) are sentence-cased. Screen-reader users hear an inconsistent announcement style depending on which status kind a row has. Not in `--fix` scope this run (Critical+Warning only, no `--all`); flagged here for visibility.
- No generic `"Submit"/"Click Here"/"OK"` patterns found anywhere in the phase-21 diff (grepped all 24 touched files).

### Pillar 2: Visuals (3/4)

- Live-browser confirmation (1280/1600/1920px, `src/web/components` filtered view): file-type marks render in distinct colours per extension (`V` green for `.vue`, `TS` blue-violet for `.ts`), the status-letter column (`M`/`A`) sits flush right as a flat mono column exactly as specified, and the view-header toolbar (filter / list⇄tree / collapse-all / view-options) reads as a clear, evenly-spaced icon-button group with real visual hierarchy over the muted "CHANGED FILES" label.
- **Finding, now resolved:** the `## View Options Menu` (TREE-05) — the phase's one genuinely new UI surface — shipped with its popover clipped in three distinct, independently-discovered ways, found across this run's 3 code-review iterations:
  1. `.file-tree-pane__top`'s `overflow: hidden` clipped all 4 menu items in the default sidebar layout (CR-01).
  2. The ancestor `.file-tree-pane` itself carried a second, redundant `overflow: hidden` that still clipped the menu once (1) was fixed (WR-03, iter. 2).
  3. In the narrow (`<760px`) `ChangedFilesDialog` with very few changed files, `.changed-files-dialog__results`'s content-sized `max-height: 50dvh` box was shorter than the popover's full extent (WR-02, iter. 3).
  All three are now fixed (commits `7e9dbdb`, `7d9efb6`, `9085c35`) and **re-verified live in this review**: the wide-layout screenshot shows all 4 menu items (`Always` / `On hover or selection` / `Never` / `Open comment badges`) fully visible and unclipped, and the narrow-layout single-file edge case (`"1 of 65 files"`, the exact scenario that triggered finding 3) also shows the full menu with no clipping.
- The filter-highlight `<mark>` is visually distinct (amber background) against the row text, matches the design source's literal `rgb(210 153 34 / 35%)` value, confirmed live in the `FileTree.vue` filter screenshot.
- Minor residual gap (IN-03, not re-opened as new): `PathText.vue` highlights `directory` and `filename` as two separate `highlightMatches` calls, so a query spanning the final `/` matches the row but shows no visible `<mark>` at all — a user sees the row survive the filter without understanding why. Low severity (filter correctness is unaffected, only the highlight's own legibility in one query shape).

### Pillar 3: Color (4/4)

- `git diff 9fda6e1..HEAD -- src/web/styles.css` shows exactly **one** new `--interactive-accent` usage (line 195, the comment-badge icon+count colour) — matches the UI-SPEC's explicit "reserved exactly for... one new accent use this phase" claim precisely; every other `--interactive-accent` reference in the stylesheet pre-dates this phase.
- Grep across all 24 phase-21 files for `#[0-9a-fA-F]{3,8}` / `rgb(` literals in `.vue` component files returns zero matches — all colour comes from existing CSS custom properties.
- 60/30/10 split holds up live: `--surface-sidebar` dominates the tree pane background, `--surface-interactive-hover`/`--selection-background`/`--surface-panel` (hover, selection, popover) form the secondary layer, and the single `--interactive-accent` touch (comment badge) is the only accent pixel in the entire pane across all captured screenshots.

### Pillar 4: Typography (3/4)

- `git diff 9fda6e1..HEAD -- src/web/styles.css` introduces zero new raw `font-size:`/`font-weight:` declarations as standalone properties — the 3-size (11/12/13px) / 2-weight (400/600) scale the UI-SPEC declares is honored in every rule that uses the `font-size:`/`font-weight:` longhand.
- **Finding:** one rule uses the `font:` shorthand with a hardcoded size instead of the token: `.tree-row .status-badge { font: var(--font-weight-semibold) 11px/1 var(--font-mono); }` (`src/web/styles.css:1064`) — contrast with the file-type-mark rule (`styles.css:950`) and another label rule (`styles.css:1134`), both of which correctly write `font-size: var(--font-size-label);`. The literal currently equals the token's value (`--font-size-label: 11px`), so there is no visible defect today, but the "zero new sizes, all via existing tokens" discipline the spec claims is not quite true at the CSS-source level for this one rule.
- Carried checker FLAG (pre-approved, not re-litigated): the 11/12/13px scale is tightly spaced, consistent with Phase 20's own approved scale — no new finding here.

### Pillar 5: Spacing (4/4)

- `git diff 9fda6e1..HEAD -- src/web/styles.css`'s added px literals are: `12px`×4 (status-letter column + markers — the spec's documented fixed-dimension exemption), `18px`×3 (header/filter padding, matching Phase 20's own `.file-tree-pane__top` 18px convention, unchanged by this phase's edits), `24px` (filter-row height, per spec), `20px` (file-type-mark column width, per spec), `180px` (popover `min-width`, a pre-existing popover-sizing decision, not spacing-scale), `1px`×1 (border width, standard), `2px`×1 (the `calc(100% + var(--space-1))` menu offset — actually the literal `2px` here is inside `grid-row:`/unrelated context, not a spacing value). No arbitrary, undeclared spacing value was introduced.
- `--space-*` custom properties (`--space-1` through `--space-6`) are used for every genuinely flexible gap/padding/margin in the new rules (toolbar gaps, menu item padding, filter-row margins).

### Pillar 6: Experience Design (3/4)

- Empty filter state (`No changed files match "{query}".`), persisted view-options (line-counts mode, comment-badge toggle, list⇄tree mode — all round-tripped through `loopnote.workbench.v1` and confirmed by the unit suite's `panel-state.test.ts`), and the full keyboard map (⌥⌘F filter, Arrow/Enter/Esc in the menu, Tab-order across the toolbar) are all implemented and covered by the Playwright suite (25/25 green across `file-tree.spec.ts`, `workbench-shell-smoke.spec.ts`, `responsive-session.spec.ts`, `anchored-workspace.spec.ts`).
- **Finding, now resolved (Esc):** before this run's iteration-2 fix, pressing `Esc` inside either the filter input or the open view-options menu, while the tree was teleported into the narrow `ChangedFilesDialog`, also closed the entire `Files` modal (missing `event.stopPropagation()` let it bubble to `ModalDialog.vue`'s own `Esc`-to-close handler). Fixed (commit `e1936eb`) and **re-verified live**: in the narrow-layout session, opening the view-options menu then pressing `Esc` closes only the menu — the `Files` dialog (visible `Close` button, `CHANGED FILES` header) remains open in the follow-up screenshot.
- **Open finding (IN-04, carried, not re-opened as new):** `ViewOptionsMenu.vue`'s `handleKeydown` still has no `Tab` branch — tabbing out of an open menu item leaves the menu open (`role="menu"` still mounted, outside-click listener still attached) while focus visibly moves elsewhere in the page. A sighted keyboard-only user sees a "stuck open" menu floating over unrelated content until a subsequent click or Escape. This is the review's top remaining priority fix (see above).
- The three-round popover-clipping saga (Pillar 2) is also an Experience Design signal: the original implementation's own Playwright coverage for the view-options menu ran only at the default wide viewport (per the re-review agent's observation), so none of the 3 clipping defects were caught by automated tests before this post-exec review — they were only found and fixed through this phase's adversarial code-review passes, confirmed live in this UI review.

---

## Files Audited

`src/web/App.vue`, `src/web/components/ChangedFilesDialog.vue`, `src/web/components/DirectoryRow.vue`, `src/web/components/FileRow.vue`, `src/web/components/FileTree.vue`, `src/web/components/PathDisplay.vue`, `src/web/components/StatusBadge.vue`, `src/web/components/ui/PathText.vue`, `src/web/components/ui/UiIcon.vue`, `src/web/components/ViewOptionsMenu.vue`, `src/web/components/workbench/EditorTitle.vue`, `src/web/components/ui/ModalDialog.vue`, `src/web/model/file-tree.ts`, `src/web/model/panel-state.ts`, `src/web/styles.css`, `src/contracts/api.ts`, `src/server/capabilities.ts`, `src/server/patch-snapshot.ts`, plus live interaction against the built runtime (`npm run build`) in real Chromium at 1280×900, 1600×1000, 1920×1080, and 400×800 (narrow `ChangedFilesDialog`).

## Registry Safety

Not applicable — no `components.json`/shadcn registry in this project (`UI-SPEC.md`'s own Design System table: "Component library: none (custom components)").
