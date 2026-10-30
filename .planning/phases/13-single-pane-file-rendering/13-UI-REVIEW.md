# Phase 13 — UI Review

**Audited:** 2026-10-30
**Baseline:** `13-UI-SPEC.md` (approved design contract)
**Screenshots:** Captured live — `npm run build` produced `dist/bin/cumpa.mjs` + `dist/web`; a throwaway git fixture repo (`git init`, two branches `main`→`feature`) was driven via `CUMPA_LAUNCH_OPTIONS`/`CUMPA_BROWSER_OPEN_MARKER` env vars (pattern from `tests/e2e/anchored-review.spec.ts:93-138`) and automated with Playwright (chromium) at 1440×900 and 375×812. 14 PNGs saved to `.planning/ui-reviews/13-20261030-170737/` (gitignored). The fixture covered: added text file, deleted text file, 0-byte added file, modified text file (regression control), and a type-changed file (regular file → symlink via `ln -s` + commit — the only way git itself emits raw status `T`, confirmed live with `git diff --raw`: a pure `chmod +x` only ever produces `M`, never `T`).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | `wasModeKind` only implements 2 of the 4 `<kind>` rows the UI-SPEC's own derivation table requires; the gap is locked in by the unit test itself |
| 2. Visuals | 3/4 | Single-pane rendering is visually clean and neutral (D-02 honored); the `type-changed`+reviewable-text visual state the spec describes is unreachable in practice, so its empty/content states were never actually exercised |
| 3. Color | 4/4 | No tint anywhere in the single-pane editor; side-cue spans correctly omitted; 60/30/10 token usage unchanged from side-by-side |
| 4. Typography | 2/4 | Header layout label renders at Metadata scale (12px/18px), not the Body scale (14px/21px) the UI-SPEC's own Typography table assigns to it |
| 5. Spacing | 2/4 | Gap between `StatusBadge` and layout label text is 8px (`--space-2`), not the 4px (`--space-1`) the UI-SPEC's own Spacing Scale table declares |
| 6. Experience Design | 2/4 | The single-pane section's `aria-label` casing drifts from the spec's explicit example and from the sibling side-by-side `aria-label`'s own convention; the type-changed single-pane path is structurally unreachable via real git |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **`wasModeKind` doesn't implement the UI-SPEC's own `<kind>` table** — `src/web/model/single-pane-layout.ts:38-47`. The table requires `100644`→`file` and `100755`→`executable file`, but the lookup only has `120000`→`symlink` and `160000`→`submodule`; everything else (including the two file-mode rows) falls through to the raw mode string. `tests/unit/single-pane-layout.test.ts:61-63` locks this in by asserting `wasModeKind('100644')` returns `'100644'`. **Fix:** add the two missing entries to `wasModeLabels`, update the fallback test to assert the UI-SPEC's generic-fallback wording (`was mode <value>`, not the bare mode), and route the already-present `regularFileModes` check from `src/git/availability.ts:16-19` into the new entries instead of hardcoding separately.
2. **Single-pane `aria-label` casing contradicts the UI-SPEC's own example and the sibling branch's convention** — `src/web/components/DiffWorkspace.vue:362`. The outer `<section>` uses `singlePaneSideWord` (`'HEAD'`/`'BASE'`, uppercase), producing `"src/added.ts: HEAD only"`, while the UI-SPEC explicitly writes the pattern as `${path}: head only` (lowercase), and the side-by-side sibling at line 392 deliberately uses `visibleSides.originalName`/`.modifiedName` (lowercase `'base'`/`'head'`) for exactly this reason. **Fix:** use `visibleSides.value.originalName`/`.modifiedName` in the single-pane `aria-label` computed, matching the side-by-side branch's own established pattern.
3. **Header layout label ships at the wrong type scale and gap** — `src/web/components/ActiveFileToolbar.vue:81-82` renders the badge + `Added · Head only`/`Deleted · Base only`/`Type changed · Head only (was …)` label as direct children of `.review-toolbar__active-file`, which applies `gap: var(--space-2)` (8px) uniformly (`styles.css:1441`) and gives the label `.review-toolbar__status`'s `font-size: var(--font-size-metadata)` / `line-height: var(--line-height-metadata)` (12px/18px, `styles.css:1462-1466`). The UI-SPEC's own Typography table assigns this exact label the Body role (14px/21px) and its Spacing table assigns the badge-to-label gap `--space-1` (4px). **Fix:** either wire a dedicated `--space-1` gap + `--font-size-body`/`--line-height-body` class for the layout-label span, or treat the contract's table rows as wrong and reconcile the spec text — right now code and spec disagree and nobody has resolved which one wins.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **Confirmed correct (live + code):** all four of the exact copy strings that *are* implemented match the Copywriting Contract table verbatim:
  - `Added · Head only` — `ActiveFileToolbar.vue:42`, confirmed on screen (`desktop-added-header.png`).
  - `Deleted · Base only` — `ActiveFileToolbar.vue:44`, confirmed on screen (`desktop-deleted-header.png`).
  - `Added, single pane` / `Deleted, single pane` — `StatusBadge.vue:30-34` (`props.reviewable && isSinglePaneStatusKind(kind) ? ', single pane' : ''` appended to `Added`/`Deleted`/`Mode changed`), confirmed via Playwright's accessible-name resolution (`treeRow` accessible name included "Added, single pane…" in the capture run).
  - `Empty file (0 bytes)` — `DiffWorkspace.vue:372`, confirmed on screen (`desktop-empty-added.png`), rendered through the reused `InlineNotice` with no new copy drift.
- **BLOCKER-adjacent bug:** `Type changed · Head only (was <kind>)` is only correct for 2 of the UI-SPEC's 4 documented `oldMode` values. `wasModeKind` (`single-pane-layout.ts:38-47`) maps `120000`→`symlink`, `160000`→`submodule`, and falls back to the **raw mode string** for everything else — including the spec's own `100644`→`file` and `100755`→`executable file` rows, which should be the *common* case (a type change away from a plain file). A reviewer would see `"Type changed · Head only (was 100644)"` instead of `"...(was file)"`. The gap is proven, not inferred: `tests/unit/single-pane-layout.test.ts:61-63` explicitly asserts `wasModeKind('100644')` returns `'100644'`, i.e. the wrong behavior is test-locked.
- **Reachability caveat (why this wasn't caught live):** live git testing during this audit confirmed `classifyAvailability` (`src/git/availability.ts:55-58,66-79`) marks **any** file whose `oldMode` or `newMode` is outside `{100644, 100755}` (i.e. every real `type-changed`/`T`-status file, since `T` only ever arises from a symlink/submodule mode crossing) as `unsupported`. Since `singlePaneSideFor` requires `availability.kind === 'text'`, the entire type-changed single-pane branch — and therefore the `wasModeKind` bug — is gated behind a condition that appears to never hold for any file git itself would tag `type-changed`. This was verified by constructing a real `100644→120000` (symlink) type change in the fixture repo: it correctly fell back to the pre-existing "Diff unavailable for this file — unsupported: symlink" placeholder (`desktop-script.png`), never reaching the new single-pane code at all. The bug is real and the test proves the contract is unmet, but it may be practically unreachable — this needs product confirmation on whether a `100644⇄100755` or other same-type-class mode-only change can realistically still hit this path (e.g. via a future loosening of the symlink/submodule exclusion), or whether D-06's table rows for `file`/`executable file` are dead weight that should be removed from the contract.
- No generic placeholder text (`Submit`/`Click Here`/`went wrong`) introduced by this phase.

### Pillar 2: Visuals (3/4)

- Single-pane layout is clean: one editor pane, one side-label strip, no competing visual elements. Confirmed live on `added.ts`, `deleted.ts`, and the empty-file case — all render as a quiet, single-column surface matching D-02's "reads as a neutral file" goal.
- `StatusBadge` + layout-label pairing in the header gives a clear visual anchor distinguishing single-pane files from side-by-side ones (side-by-side files show plain `modified`/`type-changed` text with no badge, per D-11) — confirmed on screen comparing `desktop-added-header.png` against `desktop-modified-header.png`/`desktop-script-header.png`.
- Tree row markers (`A`/`D`/`Mode`) remain the Phase 09 dense single-letter badges; no new glyph or column was added, matching D-09.
- **Deduction:** the type-changed + reviewable-text visual state (full-width Head-only pane with a `Type changed · Head only (was …)` header) was never actually exercised on screen in this audit, because — per the Copywriting finding above — it appears unreachable through any real git-produced `type-changed` file. The component code exists and the Vue template branches are structurally sound by inspection, but there is no live visual proof this specific combination renders correctly (editor sizing, side-label strip, empty-state interplay) because it may never fire in production.

### Pillar 3: Color (4/4)

- Grepped `src/web/monaco/diff-adapter.ts:620-963` (`PublicMonacoSinglePaneAdapter`): zero occurrences of `insertedLineBackground`, `removedLineBackground`, or any add/remove decoration class. The only decorations collection (`this.selectionDecorations`) is used purely for text selection, not line tinting — D-02 honored structurally.
- Confirmed live: `desktop-added.png` and `desktop-deleted.png` show plain syntax-highlighted text with no green/red background anywhere in the pane, while the regression-control `desktop-modified.png`/`mobile-modified.png` still show the full red/green side-cue treatment (`− REMOVED` / `+ ADDED` labels, tinted backgrounds) — proving the single-pane path and the side-by-side path are genuinely different code branches, not a CSS override that could silently regress.
- Single-pane side-label strip (`.diff-workspace__side-labels--single-pane`, `styles.css:1576-1578`) correctly omits the `.diff-workspace__side-cue` span entirely (`DiffWorkspace.vue:366-370`) rather than hiding it with CSS — matches D-02's "no per-line +/- gutter signs" intent extended to the strip itself.
- No new hardcoded hex/rgb colors introduced by this phase; all single-pane styling reuses existing tokens (`--surface-canvas`, `--text-muted`, `--focus-ring`, etc.) per the UI-SPEC's Color table.

### Pillar 4: Typography (2/4)

- Code font size (13px, `--font-size-code`) and the Monaco editor's `CODE_FONT_SIZE`/`CODE_LINE_HEIGHT` are shared unchanged between the diff and single-pane adapters (`diff-adapter.ts:646-648` vs the diff editor's equivalent construction) — no new type scale introduced inside the editor itself.
- **Bug:** the UI-SPEC's Typography table explicitly assigns the header layout label (`Added · Head only`, etc.) the **Body** role — `14px / 400 / 21px / var(--font-ui)` — and calls out `.review-toolbar__status` by name as the class that should deliver it. In the actual CSS, `.review-toolbar__status` (`styles.css:1462-1466`) sets `font-size: var(--font-size-metadata)` (12px) and `line-height: var(--line-height-metadata)` (18px) — the **Metadata** role, not Body. This is the same class used for the plain `status.kind` text on side-by-side files (`ActiveFileToolbar.vue:84`), so the new layout label inherited an existing 12px treatment instead of getting the 14px treatment the spec assigns it. Not verifiable by eye in the screenshots at normal viewing scale, but directly confirmed by reading the token values (`--font-size-metadata: 12px` vs `--font-size-body: 14px`, `styles.css:100-105`).
- No new font-weight values introduced; the label uses the ambient weight of `.review-toolbar__status` with no bold/semibold override, consistent with Metadata-role precedent elsewhere in the header.

### Pillar 5: Spacing (2/4)

- The 0-byte empty-file notice correctly reuses `InlineNotice`'s existing padding/icon-gap tokens with no new spacing values (`InlineNotice.vue`, unchanged per the UI-SPEC's File Ownership table) — confirmed visually (`desktop-empty-added.png`) matches the spacing of other `InlineNotice` usages elsewhere in the app.
- `--space-1`/`--space-2` are the only two spacing tokens the UI-SPEC's Spacing Scale table calls out for this phase, both pre-existing (no new token introduced) — token reuse itself is compliant.
- **Bug:** the table specifically assigns `--space-1` (4px) to "Gap between `StatusBadge` and layout label text in header." In the implementation, both the badge and the label are siblings inside `.review-toolbar__active-file`, whose flex container applies a single uniform `gap: var(--space-2)` (8px, `styles.css:1441`) to every child — heading, badge, label, line counts, and the Hide/Show files button alike. There is no narrower 4px gap anywhere between the badge and the label specifically; it's the same 8px used between every other pair of elements in that row. Either the spec's 4px claim was aspirational and never wired up, or the implementation should introduce a nested flex wrapper around just the badge+label pair with its own `--space-1` gap.

### Pillar 6: Experience Design (2/4)

- `ReviewToolbar`'s "Change navigation" group is removed via `v-if="!singlePane"` (`ReviewToolbar.vue:48`), not a CSS `display:none` — confirmed both by reading the template and live: `page.getByRole('button', { name: 'Next change' })` resolved to 0 elements on the added-file single-pane view during the capture run, proving the control is actually absent from the DOM/accessibility tree, not merely hidden visually.
- Side-label strip (`.diff-workspace__side-labels--single-pane`) is correctly `aria-hidden="true"` (`DiffWorkspace.vue:366`), consistent with D-12's note that accessible side identity must come from the header text instead — and the header text (`ActiveFileToolbar.vue:82`) is not `aria-hidden`, so the identity is announced exactly once, correctly.
- 0-byte file handling correctly suppresses the comment-anchor affordance and editor entirely (`isSinglePaneFileEmpty` gates the whole `v-else` template branch at `DiffWorkspace.vue:374-388`) while still showing the side-label strip above the notice — matches D-07/D-12 exactly, confirmed on screen.
- Keyboard focus and text-selection treatments are declared unchanged/shared with the diff editor per the UI-SPEC's State Contract table; `PublicMonacoSinglePaneAdapter` does not override `--focus-ring`/`--selection-background` anywhere in its constructor options, consistent with reuse.
- **Bug:** the single-pane `<section>`'s `aria-label` (`DiffWorkspace.vue:362`, `` `${path}: ${singlePaneSideWord} only` ``) uses the uppercase word (`'HEAD'`/`'BASE'`), producing e.g. `"src/added.ts: HEAD only"`. The UI-SPEC's own Accessibility Contract gives the literal lowercase example `${path}: head only`. More tellingly, the sibling side-by-side branch two lines below (`DiffWorkspace.vue:392`) deliberately avoids this exact mistake by using `visibleSides.originalName`/`.modifiedName` (lowercase) instead of `visibleSides.original`/`.modified` (uppercase) for its own `aria-label`. The single-pane branch picked the wrong variable.
- **Unreachable feature (see Copywriting/Visuals):** the type-changed single-pane experience — the entire reason D-06 exists — could not be exercised through any real git repository state during this audit. This doesn't break anything live (the fallback "Diff unavailable… unsupported: symlink" placeholder renders correctly, confirmed on screen), but it means a meaningful slice of this phase's intended UX was never actually validated end-to-end against a real file, only against a synthetic `{ kind: 'text' }` availability object in a unit test.

---

## Files Audited

- `src/web/monaco/diff-adapter.ts` (`PublicMonacoSinglePaneAdapter`, lines 620-963)
- `src/web/components/StatusBadge.vue`
- `src/web/components/ActiveFileToolbar.vue`
- `src/web/components/DiffWorkspace.vue`
- `src/web/components/ReviewToolbar.vue`
- `src/web/components/InlineNotice.vue` (unchanged, consumer-only — confirmed no drift)
- `src/web/styles.css` (lines ~95-150, 1434-1477, 1567-1599)
- `src/web/model/single-pane-layout.ts`
- `src/git/availability.ts` (cross-referenced for reachability analysis)
- `src/git/inventory.ts` (cross-referenced for `T`-status derivation)
- `tests/unit/single-pane-layout.test.ts` (cross-referenced to confirm the `wasModeKind` gap is test-locked, not merely an oversight)
- `tests/e2e/anchored-review.spec.ts` (reused as the reference pattern for live CLI harness + screenshot driving)
- `13-UI-SPEC.md`, `13-CONTEXT.md`, `13-01..05-PLAN.md`/`-SUMMARY.md` (contract and execution-intent baseline)

**Live capture evidence:** `.planning/ui-reviews/13-20261030-170737/` — 14 screenshots (desktop 1440×900: initial load, 5 per-file full views + 5 header close-ups; mobile 375×812: added/deleted/modified), gitignored per the screenshot-safety gate.
