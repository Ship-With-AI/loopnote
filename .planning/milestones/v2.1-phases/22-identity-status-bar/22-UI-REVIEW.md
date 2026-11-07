# Phase 22 — UI Review

**Audited:** 2026-11-05
**Baseline:** 22-UI-SPEC.md (approved design contract)
**Screenshots:** captured (real Chromium, via Playwright driving the actual built `dist/bin/loopnote.mjs` against real git fixtures — not a dev server, not mocked data)

This audit is a real-browser, adversarial re-verification of the three items `22-VERIFICATION.md` marked `human_needed`, plus a code-level 6-pillar audit of every file the phase's plans touched. All three sessions below are genuine: real git fixtures built with the `git` CLI, real branch advances to trigger drift, real `git worktree add` for the worktree-glyph case, and a real agent-attached stdin `review-request`.

Screenshots: `.planning/ui-reviews/22-20261105-164716/` (gitignored; 9 required screenshots for the 3 sessions at 1280/1600/1920px, plus drift/overlap/bug-repro/fix-confirmation evidence shots).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every locked phrase (drift explanations, guidance text, emphasis labels, `♡ Support` prefix) matches 22-UI-SPEC.md/22-CONTEXT.md verbatim; no generic placeholder copy found. |
| 2. Visuals | 3/4 | Distinct per-kind lead icon (lock/patch/compare) correctly swaps to a plain dot only in the warning state (not color-only); but a genuine popover-clipping defect was found live in Chromium and had to be fixed during this audit (see below). |
| 3. Color | 4/4 | Single accent reservation respected (emphasis item only); warning token is a separate semantic role, not accent reuse; zero hardcoded hex/rgb in component files; real contrast ratios measured at 6.03:1 (border/dot) and 7.50:1 (stale text) — both clear 3:1 with margin. |
| 4. Typography | 4/4 | Only 3 font-size tokens (`--font-size-chrome/label/metadata`) and 2 font-family tokens reused from the existing scale; no new sizes introduced. |
| 5. Spacing | 3/4 | Disciplined `--space-*` token reuse almost everywhere; one untokenized, uncommented magic number (`.identity-popover__row dt { min-width: 96px; }`) slipped through without the documentation comment the project's other px-literal exceptions carry. |
| 6. Experience Design | 3/4 | Robust focus trap/Escape/outside-click, aria-busy/disabled states, and live-region announcements — but the popover-clipping defect broke a specified acceptance criterion pre-fix, and the `.statusbar__stale` warning-ink treatment, while correctly implemented and styled, has no reachable trigger path through real git content (see Experience Design detail). |

**Overall: 21/24**

---

## Human-Verification Results (real-browser, measured)

These are the exact 3 items `22-VERIFICATION.md`'s `human_verification` frontmatter marked `human_needed`. All three were re-run against the real packaged build in real Chromium (Playwright driving `dist/bin/loopnote.mjs`), not against a dev server or mocked fetches.

### 1. Pill-vs-toggles overlap, 761–1050px, continuously sampled — **PASS**

Built a dedicated real git fixture (`fixtureD`) with maximal pill content simultaneously: two ~100-character branch names (`feature/an-extremely-long-base-branch-name-for-maximum-pill-width-stress-testing-purposes-only` / `claude/an-even-longer-head-branch-name-that-really-pushes-the-identity-pill-to-its-widest-possible-rendering-extent`), a real `git worktree add` for the head branch (worktree glyph), and a real selector-drift (advanced the worktree's branch tip after the session loaded, confirmed via the server's own `/api/selector-drift` response flipping `head.kind` from `unchanged` to `moved`, and the DOM class flipping to `identity-pill identity-pill--warning`).

Sampled viewport width every 5px from 761px to 1046px (58 samples) using real `getBoundingClientRect()` on `.identity-pill` vs every button inside `.titlebar__right`.

- **Overlaps found: 0 / 58 samples.**
- **Minimum gap: 107.42px**, at the narrowest sampled width (761px) — i.e. the worst case still has over 100px of clearance, not a near-miss.

### 2. Popover anchoring at window edges — **FAIL → FIXED (commit `517aacc`)**

Tested the committed `main↔agent-change` attached session at viewport widths 340–1050px. At **500px**, the popover rendered **42px off the left edge of the viewport** (`getBoundingClientRect()` → `left: -42, right: 398`): the "Comparison" heading was clipped to "omparison", every row `<dt>` label (Base/Head/Merge base) was entirely off-screen, and the Copy button was cut in half. Root cause: `.identity-popover` centers itself on `.identity-pill-host`'s own (possibly off-center) box via `left:50%; transform:translateX(-50%)`, not on the viewport; the agent-attached session's `.attached-fact` badge widens `.titlebar__center`'s right-hand content, pushing the pill itself left-of-center.

Fixed in `IdentityPopover.vue` by measuring the rendered panel on open/resize and nudging it back on-screen by the shortfall (see `## Post-review fixes` in `22-VERIFICATION.md` and the commit below). Re-verified post-fix at the same 500px width (`left: 8, right: 448` — fully on-screen with the same 8px margin the width rule already reserves) and swept 340/400/500/650/761/1050px plus an extreme 320px case — zero clipping in every sample.

### 3. Warning-ink contrast — **PASS** (with one Experience Design caveat, see below)

Measured real `getComputedStyle()` values on the live drifted session (genuine selector drift, not mocked), composited each foreground over its actual rendered ancestor background, and computed the WCAG relative-luminance contrast ratio directly:

| Element | Foreground (computed) | Background (computed) | Contrast ratio | Clears 3:1? |
|---|---|---|---|---|
| `.identity-pill--warning` border-color | `rgb(210, 153, 34)` (`#d29922`) | `rgb(33, 38, 45)` | **6.03 : 1** | ✅ |
| `.identity-pill__dot` background-color | `rgb(210, 153, 34)` | `rgb(33, 38, 45)` | **6.03 : 1** | ✅ |
| `.statusbar__stale` color | `rgb(210, 153, 34)` | `rgb(13, 17, 23)` | **7.50 : 1** | ✅ |

Not color-only: confirmed by DOM inspection that the non-warning pill renders a real `<svg class="identity-pill__icon">` (lock/patch/compare shape per kind), while the warning state swaps that entire icon out for a plain `<span class="identity-pill__dot">` — a shape change, not just a color change.

`.statusbar__stale` methodology note: a genuine "stale" comment could not be produced through the app's own comment UI against real git content (see Experience Design finding below for why), so its exact real CSS cascade was measured by injecting the literal production markup (`<span class="statusbar__stale">`, tagged with the component's real Vue `data-v-*` scope attribute) into the live, already-rendered status bar, inheriting the real ancestor stylesheet/background — this is a direct measurement of the shipped CSS rule's real computed rendering, not a fabricated value.

---

## Top 3 Priority Fixes

1. **Identity popover rendered off-screen at narrow widths in asymmetric title bars** — users on an agent-attached session at ~500px width could not read the Base/Head/Merge-base labels or reliably click Copy — **fixed during this audit** (commit `517aacc`, `IdentityPopover.vue`): measure the panel on open/resize and clamp it back inside the viewport with the same 8px margin the width rule already reserves.
2. **`.statusbar__stale`'s warning-ink treatment has no reachable trigger in real git usage** — every real `verifyAnchor` implementation (`src/server/capabilities.ts`) short-circuits a blobOid mismatch straight to `'orphaned'` before ever reaching the line-content comparison that could produce `'stale'`; since a blobOid is itself a content hash, a *matching* blobOid can never produce a *different* recomputed context. The styling is correct and well-contrasted, but ships for a state no real file edit can currently produce — worth either documenting as intentionally forward-looking (e.g. for a future rename-aware anchor match) or removing the dead branch. Not a phase-22 regression (the anchor-verification architecture predates this phase); phase 22 only newly *surfaces* it in status-bar chrome.
3. **`.identity-popover__row dt { min-width: 96px; }` is an untokenized magic number** — every other px-literal in this phase's CSS (`2px` refresh bar, `6px` dot) carries a comment justifying its exemption from the `--space-*` scale; this one doesn't. Low-impact (doesn't break layout), but worth either tokenizing or adding the same kind of justifying comment the other two exceptions have.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- `identityAccessibleName()` (`IdentityPill.vue:61-105`) reproduces every `aria-label` template from 22-UI-SPEC.md's Truncation Rule section verbatim, including the exact drift/`refreshBusy` suffix sentences (`' Source changed since this review was pinned.'`, `' Capturing current changes.'`).
- `guidanceText`/`selectorGuidance()` (`IdentityPopover.vue:142-171`) match CONTEXT.md's locked phrase "Relaunch to review the new commits" and the Drift States table's exact-patch/worktree-changed copy verbatim.
- `emphasisLabel()` (`StatusBar.vue:9-15`) matches the UI-SPEC's Export/Finish review/Finishing…/Finished table exactly, including the disabled/aria-busy-only state for `'finishing'`.
- The `♡ Support {{ displayName }}` decorative prefix (`StatusBar.vue:92`) is present with `aria-hidden="true"` on the glyph only, preserving the pre-existing accessible name — confirms the WARNING-1 post-verification fix (`d4c80a3`) is actually in the shipped markup, not just claimed in a changelog.
- No `grep` hits for generic placeholder copy (`Submit`, `Click Here`, `went wrong`, `try again`) in any of the four touched components.

### Pillar 2: Visuals (3/4)

- Every icon-only button carries a real accessible name: `TitleBar.vue`'s sidebar/panel toggles ("Toggle side bar (⌘B)", "Toggle panel (⌘J)"), the identity pill itself (`pillAccessibleName`), and `UiIcon` decorative glyphs are consistently `aria-hidden="true"` (arrow, chevron, mark, suffix spans — `IdentityPill.vue:184-269`).
- Visual hierarchy is real, not color-only: confirmed via live DOM on session B (non-warning, `range` kind) — a genuine `<svg class="ui-icon identity-pill__icon">` lock shape renders; on session A (warning, drifted) the same slot renders `<span class="identity-pill__dot">` instead. This is a shape swap, not a tint swap.
- The 6 new `UiIcon` branches (`compare`/`chevron`/`patch`/`commit`/`worktree`/`copy`) share the existing 16×16 `stroke-width:1.5` coordinate space and hand-drawn house style — no visual inconsistency with the pre-existing icon set.
- **Deduction:** a real, reproducible visual defect existed in the shipped build — the identity popover rendered 42px off-screen at 500px viewport width on the attached session (see Human-Verification item 2). This was caught only by this audit's real-Chromium testing, not by the existing Playwright suite (which exercises the popover at a single fixed 1440×900 viewport per the VERIFICATION report's own admission). Fixed during this audit; scored at 3 rather than 4 to reflect that the as-delivered phase shipped with this defect.

### Pillar 3: Color (4/4)

- `grep` for `interactive-accent-emphasis` in the four touched components: exactly one hit (`StatusBar.vue:147`, the single emphasized item), consistent with the Phase 20 "one accent reservation" contract — no accent overuse.
- `status-warning-foreground` is a distinct semantic warning role, reused consistently (pill border, dot fill, stale text) rather than repurposing the accent token for warnings.
- Zero hardcoded `#hex`/`rgb()` literals in `IdentityPill.vue`, `IdentityPopover.vue`, `StatusBar.vue`, or `TitleBar.vue` — every color is a `var(--token)`.
- Real measured contrast: pill border/dot 6.03:1, stale text 7.50:1 against their actual rendered backgrounds — both comfortably clear the 3:1 non-text-indicator minimum (dot/border) and the 4.5:1 normal-text minimum (stale text), with room to spare.

### Pillar 4: Typography (4/4)

- Only 3 font-size tokens appear across the identity-pill/popover/statusbar CSS: `--font-size-chrome` (pill/statusbar base), `--font-size-label` (BASE/HEAD labels), `--font-size-metadata` (SHA/digest text) — all pre-existing tokens from the established scale, no new sizes invented.
- 2 font-family tokens (`--font-ui` for labels, `--font-mono` for pill/SHA text), matching the project's existing UI/mono split.
- Well under the "flag if >4 sizes or >2 weights" threshold.

### Pillar 5: Spacing (3/4)

- `gap`/`padding`/`margin` throughout `TitleBar.vue`, `StatusBar.vue`, and the identity-pill/popover CSS block (`styles.css:2033-2230`) consistently use `var(--space-N)`.
- Two intentional px-literal exceptions carry an explicit justifying comment: the `2px` refresh-progress bar ("exempted `--space-*` grid per same Phase 20 precedent") and the `6px` warning dot (small decorative indicator, same category as the dot in other Phase 20 status treatments).
- **Deduction:** `.identity-popover__row dt { min-width: 96px; }` (`styles.css`) is a third px-literal with no comment and no obvious derivation from the `--space-*` scale (96 isn't a multiple of any single `--space-N` token in this file). Low real-world impact — it only sets a label-column minimum width inside the popover's definition list — but it's an inconsistency with the project's own established convention of documenting every scale exception.
- The `width: min(440px, calc(100vw - var(--space-4)))` popover width rule is not a deviation — `~440px` is the literal value 22-CONTEXT.md's own design decision specifies ("Popover: anchored below the pill, ~440px"), and the `calc(100vw - var(--space-4))` clamp correctly reuses the existing space scale for the narrow-viewport case.

### Pillar 6: Experience Design (3/4)

- Loading/busy: `refreshBusy` drives `:disabled`/`:aria-busy` on the popover's Refresh button and the `'Capturing…'` label swap; the `'finishing'` attachedLifecycle state similarly disables and `aria-busy`s the status-bar emphasis item.
- Error states: `InlineNotice tone="error"` for patch drift, `tone="warning"` for worktree-changed, both reusing exact pre-existing copy per the UI-SPEC's Drift States table.
- Empty/zero states: comment count correctly renders bare `"💬 0"` with no stale segment when both counts are zero (`openCommentSegment`/`staleCommentSegment` unit-tested per 22-03-SUMMARY).
- Focus management: real-browser-tested focus trap (Tab/Shift+Tab wrap), Escape-to-close-and-return-focus, and outside-pointerdown-to-close all behave correctly live (confirmed via the popover screenshots and the edge-clamp testing above, which repeatedly opened/closed the popover across dozens of viewport widths without any focus or close-handling anomaly).
- No dead-code remnants: `grep -rn "session-header__comparison|pin-cue|snapshotLabel" src/` returns zero matches — the Phase 20 interim identity markup was fully removed, not left as an unused shim.
- **Deduction 1 (same defect as Visuals):** the popover-clipping bug was a genuine, specified-acceptance-criterion failure that existed in the delivered code before this audit's fix.
- **Deduction 2:** `.statusbar__stale`'s entire warning-ink code path is, on inspection of every real `verifyAnchor` implementation in `src/server/capabilities.ts` (committed/exact-patch/staged/unstaged/working-tree — all four), unreachable through genuine git content changes: each implementation returns `{state: 'orphaned'}` the instant a file's current blobOid differs from the comment's recorded blobOid, and never reaches the line-content comparison (`verifyDurableAnchor`) that could classify something as `'stale'`/`'anchor-mismatch'` — and since a blobOid *is* a content hash, a *matching* blobOid can only ever produce byte-identical recomputed context, which always verifies clean. The only place `'stale'` is actually exercised in this repository is a fully-mocked integration test (`tests/integration/anchored-workspace.spec.ts:850`) that injects the verification result directly rather than deriving it from real git state. This doesn't block shipping (the UI treatment itself is correct, accessible, and well-contrasted), but it's a real state-coverage gap worth flagging: a feature's visual polish outran a code path that can actually produce it.

---

## Files Audited

- `src/web/components/workbench/IdentityPill.vue` (full read)
- `src/web/components/workbench/IdentityPopover.vue` (full read; edited to fix the viewport-clamp defect)
- `src/web/components/workbench/StatusBar.vue` (full read)
- `src/web/components/workbench/TitleBar.vue` (style block + live-DOM verification)
- `src/web/components/ui/UiIcon.vue` (new icon branches)
- `src/web/App.vue` (wiring: `statusbarIdentifier`, `staleCommentCount`, `attachedLifecycle`, selector-drift state)
- `src/web/styles.css` (`.identity-pill*`, `.identity-popover*`, `.attached-fact` blocks)
- `src/domain/truncate-middle.ts` (full read)
- `src/git/selector-drift.ts`, `src/git/comparison.ts`, `src/git/candidates.ts`, `src/git/repository.ts` (read to construct genuine real-git drift/worktree fixtures)
- `src/server/capabilities.ts`, `src/domain/anchor.ts` (read to trace the stale-comment code path finding)
- `src/contracts/comparison.ts`, `src/contracts/api.ts` (read to construct valid `LOOPNOTE_LAUNCH_OPTIONS` payloads)
- `src/cli/run.ts` (read to confirm pinned/attached/standalone launch wiring)
- `.planning/phases/22-identity-status-bar/22-01-SUMMARY.md` through `22-04-SUMMARY.md`, `22-01-PLAN.md` through `22-04-PLAN.md`, `22-UI-SPEC.md`, `22-CONTEXT.md`, `22-VERIFICATION.md` (all read in full per `<required_reading>`)
- Real-browser evidence: `tests/e2e/responsive-session.spec.ts`, `tests/e2e/agent-ready-export.spec.ts`, `tests/e2e/standalone-review.spec.ts` (read for launch-helper patterns, per assignment)
