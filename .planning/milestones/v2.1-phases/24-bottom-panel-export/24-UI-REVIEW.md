# Phase 24 — UI Review

**Audited:** 2026-11-06
**Baseline:** `24-UI-SPEC.md` (approved design contract, 2026-11-05)
**Screenshots:** captured — real browser (Chromium via Playwright) against the **built runtime** (`dist/bin/loopnote.mjs` + `dist/web`, commit `ce44d5a`), not the Vite dev server. Three viewport widths captured for every state: **1280×900, 1600×900, 1920×900** (fixed 900px height across all three widths, chosen for consistency).
**Screenshot directory:** `.planning/ui-reviews/24-20261106-023857/` (30 PNGs, `.gitignore`-gated; gate pre-existed from an earlier run in the same directory tree and was verified present before any capture)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every locked string (empty state, Saving…/Saved, Anchor missing, drift checkbox, CTA labels) matches `24-UI-SPEC.md` verbatim, confirmed on-screen or in the accessibility tree. |
| 2. Visuals | 4/4 | File-group 600-weight name is the correct focal point; state icons (comment/warning/check) and muted-resolved treatment render exactly as specified; every icon-only button carries an `aria-label`. |
| 3. Color | 4/4 | Accent (`--interactive-accent`) reserved to active-tab underline + `.ui-button--primary` only; stale mono location uses `--status-warning-foreground`; no hardcoded hex found. |
| 4. Typography | 4/4 | All sizes/weights come from the governed token set (`--font-size-chrome/metadata/label`, `--font-weight-semibold`); zero raw `px` font sizes in the new components. |
| 5. Spacing | 3/4 | Token usage (`--space-1..4`) is clean, but the panel's **default 240px height** (unchanged from Phase 20/22) cuts off the primary action in 4 of the 10 captured states, at all 3 widths. |
| 6. Experience Design | 3/4 | Loading/success/disabled states are all handled correctly, but (a) the same below-the-fold primary action recurs across Export+Finish flows, and (b) the `stale`/"Anchor moved" bucket is unreachable through any live user action in the current server implementation. |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Export tab's primary action (and the attached "Finish review" button) sits below the fold at the panel's default height, in every state that matters most (drift-blocked, exporting, receipt, attached-waiting), at every tested width** — user impact: a first-time user who hasn't dragged the panel taller cannot see the button they need to click without first discovering they can/should scroll the panel's own 240px-tall scrollable region (`BottomPanel.vue:227`, `overflow-y: auto`) — concrete fix: raise `PANEL_HEIGHT_DEFAULT` (`src/web/model/panel-state.ts:9`, currently `240`) to a value that fits at least the heading + first action row of the richest Export-tab state (receipt/drift, ~320–360px), or add a `scroll-margin`/auto-scroll-into-view on tab activation so the primary button is always visible on open.
2. **The `stale` ("Anchor moved") Comments-tab bucket cannot be produced by any real user action in the shipped server code** — user impact: none today (it's a dead code path for the four live `verifyAnchor` implementations), but it is a latent correctness gap: `src/server/capabilities.ts` lines 457-480, 773-796, 1055-1080, and 1412-1437 all `return { state: 'orphaned' }` the instant `blobOid` differs, and only ever build a `current` anchor when `blobOid` already matches — at which point `buildDurableAnchor`'s deterministic rebuild from the *same* `blobOid`+`line`+`text` can never disagree with the recorded one — concrete fix: either confirm with product that `stale` is intentionally reserved for a future reclassification path (and document that in `24-UI-SPEC.md`/`comment-thread.test.ts`), or wire an actual stale-producing path (e.g., position-based re-anchoring after a nearby-but-not-identical edit) so the bucket Phase 24 just gave a dedicated icon/row treatment to is reachable in practice.
3. **`ExportReadinessSummary.vue`'s rows and `ExportReceipt.vue`'s new "Copy agent prompt" button were only confirmed via code read + accessibility tree, not inside the visible screenshot crop**, for the same fold reason as #1 — user impact: low (content is real and correct, just not independently screen-captured) — concrete fix: once #1 is fixed, re-run this audit's comments/export captures to get direct visual confirmation of those rows rather than DOM-only confirmation.

---

## Screenshot Coverage

| # | State | 1280w | 1600w | 1920w | Method |
|---|---|---|---|---|---|
| 01 | Comments tab — open + stale + resolved + orphaned, one fixture | ✅ | ✅ | ✅ | Real `--staged` session; stale bucket required one anchor-field edit to the persisted draft JSON between a CLI stop/restart (see note below) |
| 02 | Summary tab — Saving… | ✅ | ✅ | ✅ | Real session, `⌘S`, `/api/draft/mutations` delayed via `page.route()` to make the in-flight frame deterministic |
| 03 | Summary tab — Saved | ✅ | ✅ | ✅ | Same session, route continued |
| 04 | Export tab — ready | ✅ | ✅ | ✅ | Real session |
| 05 | Export tab — blocked by stale drift | ✅ | ✅ | ✅ | Real `git update-ref` moved the pinned head ref; server's live `selectorDriftObserver.observe()` detected it on export click |
| 06 | Export tab — exporting (in progress) | ✅ | ✅ | ✅ | `/api/export` delayed via `page.route()` to make the in-flight frame deterministic (same real backend, real file writes, just observed mid-flight) |
| 07 | Export tab — receipt | ✅ | ✅ | ✅ | Real session, route continued |
| 08 | Attached Finish — waiting | ✅ | ✅ | ✅ | Real attached session via stdin `loopnote.review-request` piped directly to `dist/bin/loopnote.mjs` |
| 09 | Attached Finish — finishing | ✅ | ✅ | ✅ | `/api/review-completion/finish` delayed via `page.route()` |
| 10 | Attached Finish — completed | ✅ | ✅ | ✅ | Real session, route continued |

**All 10 target states captured at all 3 widths — nothing fell back to code-only audit for the *capture* itself.** One state (`stale`) required a documented, disclosed workaround to *set up the precondition* (see below); the rendering, copy, and layout verified in that screenshot are 100% real app code.

### Note on the `stale` bucket's reproduction path

Two real attempts were made to reach `stale` through pure UI interaction before falling back:
1. Moving a pinned git ref and re-diffing (the mechanism used for Export-tab drift) — this is a *different* verification path (`selectorDriftObserver`) than comment-anchor verification and does not touch `verifyAnchor`.
2. Editing a commented file's content and clicking "Refresh snapshot" in an uncommitted/`--staged` session — confirmed (by reading `src/server/capabilities.ts`'s four `verifyAnchor` implementations, used by every session capability that ships one) that **any** content/blob change is classified `orphaned`, never `stale` — `stale` requires a `current` anchor to exist with a *content* mismatch against the *same* `blobOid`, which is self-contradictory under every implementation's deterministic rebuild.

Given this is a confirmed dead path in the current server code (not a sandbox limitation), the screenshot was produced by: adding a real comment through the real UI, stopping the real CLI, editing that one comment's `anchor.selectedText` field directly in the persisted `.loopnote/drafts/*.json` file (leaving `blobOid` untouched), and restarting the same real CLI against the same real session — the server's real, unmodified `verifyAnchor` function then genuinely computes `stale` on load. This is disclosed, not hidden, and is the same category of technique the project's own `uncommitted-review.spec.ts` precedent uses (external edit to a tracked file between CLI interactions) to reach `orphaned`.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- `CommentsTab.vue:63-65` — empty state `"No comments yet. Hover a line number in the diff and click +."` is byte-identical to `24-UI-SPEC.md`'s locked Copywriting Contract row. (Not independently screenshotted — my three fixtures always had comments present — but confirmed by direct code read.)
- `SummarySection.vue:36-41` — `status` computed: `'Saving…'` (line 39) and `'Saved'` (line 41, via `unsaved.value ? 'Unsaved' : 'Saved'`) confirmed **on-screen** in screenshots 02/03 exactly as specified.
- `CommentsTab.vue:116` — orphaned chip `"Anchor missing"` confirmed on-screen in screenshot 01 (rendered as `ANCHOR MISSING`, uppercase via CSS `text-transform`, not a copy change).
- `DriftExportAcknowledgement.vue:48,61,65` — heading `"Confirm export of pinned review"` confirmed on-screen in screenshot 05; checkbox label `"I understand this export remains pinned to the original commits and records the selector drift."` and button `"Export pinned review"` confirmed via accessibility-tree inspection during setup (below the screenshot crop — see Spacing finding) and via direct source read — both byte-identical to the locked CONTEXT string.
- `ExportSection.vue:118,136,144,164,175,218` / `AttachedCompletionWaiting.vue:35,38,61,69` — `"Finish attached review"`, `"Review finished"`, `"Finishing review…"` confirmed on-screen in screenshots 08-10, byte-identical to spec.
- `ExportProgress.vue` (rendered copy) — `"Preparing accepted revision 1…"` confirmed on-screen in screenshot 06.
- `ExportReadinessSummary.vue:37` — `"Summary written"` / `"No summary (optional)"` copy change (24-04-SUMMARY) not independently re-confirmed on-screen (below fold in every Export-tab capture); confirmed by direct source read only.
- `ExportReceipt.vue:93-104,212-216` — `"Copy agent prompt"` button and its exact clipboard string, confirmed by direct source read only (same fold reason).

No generic/placeholder copy (`"Submit"`, `"OK"`, `"Click Here"`) found anywhere in the five new/touched components.

### Pillar 2: Visuals (4/4)

- Focal point: `CommentsTab.vue:70` group header is the only 600-weight (`--font-weight-semibold`, line 159) text in the tab; screenshot 01 confirms the eye lands on `a.ts` / `c.ts` / `src/b.ts` before the lighter-weight row text beneath it, exactly as the spec's "Visual hierarchy" note describes.
- State icon differentiation confirmed on-screen: open rows carry the `comment` icon in `--text-primary`; the stale row (`c.ts`) carries a `warning` icon with its mono `H1` tag rendered in amber (`--status-warning-foreground`, `CommentsTab.vue:222-224`); the resolved row (`"Resolve me comment."`) renders its entire line muted; the orphaned row carries a `warning` icon plus the `ANCHOR MISSING` chip. All four buckets are visually distinguishable in a single screenshot (01).
- Icon-only buttons: every icon-only affordance exercised during capture (`Toggle panel (⌘J)`, `Close panel`, `Add comment to HEAD line N`, `Refresh snapshot`, `Dismiss Refresh summary`) carried a descriptive `aria-label`/accessible name, confirmed via Playwright's own role-based selectors resolving correctly against real markup (no `title`-only or unlabeled icon buttons encountered).
- `CommentsTab.vue:78` directory-twistie (`▾`/`▸`) matches `DirectoryRow.vue`'s existing convention exactly, per 24-UI-SPEC's "Icon Inventory" note (plain text glyph, not a new icon).

No visual-hierarchy defects found within what's visible in viewport.

### Pillar 3: Color (4/4)

- `BottomPanel.vue:257-258` — `.bottom-panel__tab--selected { border-bottom-color: var(--interactive-accent); }` is the only accent (10%) usage in the tab shell, matching the spec's single-reservation rule exactly.
- `CommentsTab.vue:222-224` — the only other accent-adjacent token in the five new components is `--status-warning-foreground` on the stale row's mono location, which the spec explicitly carves out as a separate, non-competing warning token (not the brand accent).
- Grep for hardcoded hex/`rgb(` in `CommentsTab.vue`, `SummaryTab.vue`, `ExportTab.vue`, `AttachedCompletionWaiting.vue`'s `<style>` blocks: **zero matches** — every color reference is a `var(--...)` token.
- Dominant/Secondary surfaces (`--surface-panel`/`--surface-sidebar`) confirmed visually: the tab bar row reads as a distinct, slightly different surface from the panel body in every screenshot, consistent with the 60/30/10 split declared in the spec.

### Pillar 4: Typography (4/4)

- Font-size token count in the five new/touched component `<style>` blocks: `--font-size-chrome` (×6), `--font-size-metadata` (×2), `--font-size-label` (not re-declared, inherited from `BottomPanel.vue`'s existing tab-bar rule) — 2 distinct sizes used by the new code, within the governed four-size scale's existing ceiling.
- Font-weight: `--font-weight-semibold` (×1, group header) is the only weight token added; everything else inherits body-default (400). Matches the spec's typography table (`Chrome body`: 400, 600 for file-group names) exactly.
- Zero raw `px` font-size/weight declarations found in `CommentsTab.vue`'s scoped style block (the only new `<style>` block this phase added, per `24-07-SUMMARY.md`'s own precedent note about 7/43 components using scoped styles).

### Pillar 5: Spacing (3/4)

- `CommentsTab.vue:148-220` spacing-class audit: `var(--space-1)` (icon/disclosure gaps), `var(--space-2)` (row gap), `var(--space-3)` (group-to-group margin), `var(--space-4)` (rows indent) — all four tokens map cleanly onto the spec's declared scale; **zero arbitrary values** (`grep` for bracketed px/rem found none).
- **Finding (WARNING):** `src/web/model/panel-state.ts:9` — `PANEL_HEIGHT_DEFAULT = 240` (unchanged from Phase 20) is now too short for Phase 24's richer Export-tab content. Screenshots 05, 06, 07, and 08 all show the primary action (`Export pinned review` / the export-progress spinner body / the receipt's action row / `Finish review`) cut off below the 900px-tall viewport's visible panel region, **at all three tested widths** (1280/1600/1920 — confirmed width-independent, height-driven, since the panel's own height, not the window's, is the constraint). The panel is user-resizable up to 520px (`panel-state.ts:11`) and does scroll (`BottomPanel.vue:227`, `overflow-y: auto`), so this does not block task completion, but it does mean a first-time user sees an apparently-incomplete Export tab by default.
- This is a container-sizing problem, not a spacing-token problem — the internal `--space-6` section breaks the spec calls for (readiness → gate → actions) are present and correct; there's just more vertical content now than the inherited 240px default was sized for.

### Pillar 6: Experience Design (3/4)

**State coverage — strong:**
- Loading states: `"Saving…"` (screenshot 02), `ExportProgress`'s `"Preparing accepted revision 1…"` spinner (screenshot 06), `"Finishing review…"` with `aria-busy="true"` (screenshot 09) — all three loading states render and are keyboard/screen-reader-correct (`aria-busy`, `role="status"`/`aria-live="polite"` confirmed by direct source read of `ExportSection.vue:143-146`).
- Success states: `"Saved"` (03), `"Review export complete"` receipt (07), `"Review finished"` (10) — all three confirmed on-screen with correct icon (checkmark) and correct accepted-revision/byte data.
- Disabled-until-valid gating: `"Export pinned review"` confirmed `disabled` while the acknowledgement checkbox is unchecked (screenshot 05's underlying DOM state, verified via Playwright `toBeDisabled()` assertion against the real button before capture); `"Finish review"` confirmed enabled only once `attachedFinishReady` holds (`App.vue:458-470`).
- Four distinct Comments-tab states (open/stale/resolved/orphaned) all render with correct, distinguishable treatment in one fixture (screenshot 01).

**Findings (WARNING):**
1. The same below-the-fold issue from the Spacing pillar recurs here as a *discoverability* problem: a user who opens the Export tab at the default panel height sees a heading and a readiness checklist, then... nothing actionable, in 4 of the 10 states captured. There's no scroll-affordance hint (no "more below" chevron/fade) to signal the primary button exists just below the visible area.
2. `stale` ("Anchor moved") is a fully-built bucket — icon, color treatment, copy, grouping rule — that cannot be produced by any live user action in the shipped server code (see Top Fix #2 and the reproduction note above). This is inherited anchor-verification logic from Phase 23, not something Phase 24 introduced, but Phase 24 is the phase that gave this status its own dedicated row treatment in the new Comments tab, so it's a reasonable place to surface the gap.

No missing error/empty/destructive-confirmation states were found among the states audited; `24-UI-SPEC.md`'s own "Deferred / Out of Scope" section correctly excludes replies, viewed-tracking, and a separate comment-anchor export-acknowledgement token, none of which this audit expected to find.

---

## Files Audited

- `src/web/components/workbench/CommentsTab.vue` (new)
- `src/web/components/workbench/SummaryTab.vue` (new)
- `src/web/components/workbench/ExportTab.vue` (new)
- `src/web/components/workbench/BottomPanel.vue` (rewritten tab shell)
- `src/web/components/SummarySection.vue` (autosave + copy)
- `src/web/components/ExportSection.vue` (absorbed attached-completion state machine)
- `src/web/components/AttachedCompletionWaiting.vue` (extracted)
- `src/web/components/ExportReadinessSummary.vue` (copy)
- `src/web/components/DriftExportAcknowledgement.vue` (unchanged, re-verified)
- `src/web/components/ExportReceipt.vue` (Copy agent prompt)
- `src/web/components/ui/ReviewStateBadge.vue` (reused, re-verified)
- `src/web/model/panel-state.ts`, `src/web/model/comments-tab-groups.ts`, `src/web/model/orphaned-comments.ts` (Phase 23, reused)
- `src/web/App.vue` (panel/tab wiring, `attachedFinishReady`, `revealCommentFromPanel`)
- `src/server/capabilities.ts` (`verifyAnchor` ×4, `exportReview`'s drift detection, `refresh()`) — read for the `stale`-unreachability finding
- `src/git/selector-drift.ts` (read for the drift-reproduction mechanism)
- `src/domain/anchor.ts` (`verifyDurableAnchor`) — read for the `stale`-unreachability finding
- `.planning/phases/24-bottom-panel-export/24-UI-SPEC.md`, `24-CONTEXT.md`, all `24-0{1..9}`/`24-1{0,1}-SUMMARY.md`/`PLAN.md` files
- `tests/e2e/comments-reveal-chain.spec.ts`, `tests/e2e/summary-autosave.spec.ts`, `tests/e2e/uncommitted-review.spec.ts`, `tests/e2e/agent-ready-export.spec.ts`, `tests/e2e/agent-ready-export-safety.spec.ts`, `tests/e2e/complete-review-draft.spec.ts`, `tests/integration/export-receipt-ui.spec.ts`, `tests/integration/selector-drift-ui.spec.ts` (precedent patterns for real-session setup)
- `tests/helpers/git-fixture.ts`, `tests/helpers/runtime-artifact.ts`, `tests/helpers/acceptance-runtime.ts`, `playwright.config.ts`, `playwright.runtime-artifact.config.ts` (confirmed `agent-ready-export.spec.ts`'s custody-gated acceptance-runtime dependency is *not* required to reach the attached/agent-ready states — `dist/bin/loopnote.mjs` accepts a piped stdin review-request directly, which is how screenshots 08-10 were captured for real)
