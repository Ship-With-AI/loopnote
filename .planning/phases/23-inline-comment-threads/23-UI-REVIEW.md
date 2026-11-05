---
phase: 23
slug: inline-comment-threads
reviewed_at: 2026-11-05
reviewer: PostExec23.BrightQuail (retroactive UI review, real-Chromium)
build: dist/web + dist/bin/loopnote.mjs @ b4aa70bf9f57fff689c6db4187239ff94f3f9651
---

# Phase 23 UI Review — Inline Comment Threads

## Methodology

Real Chromium (Playwright `chromium` project, headless), driving the **packaged, built**
`dist/bin/loopnote.mjs` CLI directly (no Vite dev server, no source-code grepping) at viewport
widths **1280 / 1600 / 1920** (height 1000). Disposable scratch spec
`tests/e2e/_ui-review-23-scratch.spec.ts` reused this repo's own proven launch mechanics
(`startGeneratedCli`/`waitForLoopbackUrl`/`activateMonacoLine`/`addComment`/`threadLocator`
patterns from `tests/e2e/inline-comment-threads.spec.ts`), was run via
`npx playwright test tests/e2e/_ui-review-23-scratch.spec.ts --reporter=line` (5/5 passed), and
was **deleted** after screenshots were copied out — it is not part of the repo.

Fixtures used:
- `createGitFixture({ anchoredReview: true })` — committed two-pane session (`src/changed.ts`,
  `src/added.ts`, `src/deleted.ts`, rename pair) for open/resolved/edit/delete/collapse-all/
  side-by-side/inline states.
- Standalone single-file session (`startGeneratedStandaloneCli`-equivalent direct `dist/bin`
  invocation with a file arg) for the single-pane layout.
- `createGitFixture({ markdownPreview: true })` for the Markdown block-range comment.
- Stale ("Anchor moved") and the file-level "Orphaned comments" group were produced by
  intercepting **only** the real running packaged CLI's `GET /api/draft` response
  (`page.route('**/api/draft', ...)`) with a synthesized `kind:'current'` draft that reuses the
  **real** fixture's actual `baseCommitOid`/`headCommitOid`/`mergeBaseOid` (read via
  `fixture.git(['rev-parse', ...])`/`['merge-base', ...]`) and comment objects shaped exactly like
  the ones already proven to round-trip `DraftLoadResponseSchema` in
  `tests/integration/anchored-workspace.spec.ts`. This was necessary because
  `src/server/capabilities.ts`'s real `verifyAnchor`/refresh code paths (lines ~1055–1080 and
  ~1412–1437) short-circuit **any** content edit straight to `{state:'orphaned'}` the instant
  `blobOid !== anchor.blobOid` — `'stale'`/`anchor-mismatch` is structurally unreachable via a real
  file edit + Refresh in this codebase's current snapshot-based verification, confirmed by reading
  the verification code directly (`src/domain/anchor.ts:185-211`, `verifyDurableAnchor`). This is
  the documented fallback the assignment explicitly permits; everything else is 100% real-build,
  real-data interaction (no mocked Vite middleware was used).
- Sketch ground truth: `.planning/sketches/004-comment-threads/index.html` opened directly via
  `file://`, variant **A** (`#variant-a`, already default-active), states `reading` and
  `collapsed` (clicking `.state-tab[data-s="reading"]` / `[data-s="collapsed"]`).

Screenshots: `.planning/ui-reviews/23-20261105-225926/` (39 PNGs, 13 named states × 3 widths).
`.planning/ui-reviews/.gitignore` already excludes `*.png` etc. — nothing here will be committed.

States captured: sketch reference (reading + collapsed), open thread, resolved thread
(collapsed-by-default), stale "Anchor moved" thread, file-level "Orphaned comments" group, edit
mode, delete + Undo toast, collapse-all, side-by-side layout, inline layout, single-pane layout,
Markdown rendered-accepted comment, Markdown block-range `.comment-thread` back in Source mode.

---

## Pillar scores (1–4 each; BLOCKER = pillar-breaking, WARNING = degrades-but-works)

| Pillar | Score | Notes |
|---|---|---|
| Copywriting | 3/4 | All locked-verbatim strings present and byte-exact: `"Base · L{n}"`/`"Head · L{n}"`, chip labels `Open`/`Resolved`/`Anchor moved`/`Anchor missing`, `"Saved locally"`, `"Comment deleted"` + `"Undo"`, `"⌘Enter to save · Esc to cancel"`, stale body copy `"Line changed after this comment. Export marks it **stale**; re-anchor or keep as is."` (confirmed byte-match against `CommentThread.vue:151`, screenshot `03-stale-anchor-moved-thread-*`). **WARNING** (see Experience Design): the header label never reflects a multi-line anchor's actual extent. |
| Visuals | 4/4 | Frame (1px border, bottom-only radius, `--surface-panel`), header anatomy (location label, state chip, collapsed snippet, 3 hover/focus-visible action icons), and the delete/Undo toast all render exactly per `23-UI-SPEC.md` and closely track the sketch's `.thread`/`.th-head`/`.th-body` structure (compare `01-open-thread-side-by-side-1600.png` / `02-resolved-thread-side-by-side-1600.png` against `00-sketch-004-variant-a-reading-1600.png`). Hover-opacity gating on header actions is correctly `opacity:0` by default (confirmed: `02-resolved-thread-*` shows no visible action icons on either thread; `01-open-thread-*` shows them because that screenshot was taken immediately after the composer handed off focus into the new thread, i.e. the `:focus-within` branch, not a bug). |
| Color | 4/4 | State-coded accents are visually distinct across Open (blue/accent outline), Resolved (purple outline), Anchor moved / Anchor missing (amber outline) in every screenshot, and every chip pairs the color with an icon + text label — never color-only. No new hex introduced (per spec, reuses existing status/accent tokens). |
| Typography | 4/4 | Uses the existing governed type scale only; no stray 10px literal (per spec's documented `size="compact"` deviation from the sketch's literal "10px uppercase pill"). Chrome-weight header text, muted metadata text, and body text are all visually consistent with Phase 20/21 precedent. |
| Spacing | 4/4 | **Code-column indent measured directly from pixels and confirmed correct**: in `01-open-thread-side-by-side-1600.png` the BASE pane's code text starts at x≈328 against a pane left-edge of x≈259 → **69px**, and the thread card's left edge lands at the *exact same* x≈328 — a perfect match to the accepted dynamically-measured `contentLeft` (not the spec's placeholder 56px). In `10-single-pane-layout-1600.png` the single-pane code text/card both start at x≈343 against a pane edge of x≈259 → **84px**, matching the accepted ~85px single-pane value. No clipping, overflow, or misalignment observed at 1280/1600/1920. |
| Experience Design | 3/4 | Collapse-by-default is correct (open expanded, resolved auto-collapsed to its one-line snippet — `02-resolved-thread-side-by-side-*`); collapse-all/expand-all correctly bulk-toggles and relabels (`07-collapse-all-*`); delete-then-5s-Undo-toast flow is real and correctly timed (`06-delete-undo-toast-*`); edit mode exposes Save/Cancel icons + the exact helper line (`05-edit-mode-*`); the file-level Orphaned group and inline stale chip both render with the correct warning styling and quoted recorded text (`03-*`, `04-*`). **WARNING** (see below, non-blocking): block-range (`endLine`-bearing) comments never surface their actual line range anywhere in the UI. |

**Total: 22/24**

### WARNING — thread/composer headers never display `endLine`, even for genuine multi-line anchors

- `src/web/components/CommentThread.vue:66` — `<span class="thread-header__location">{{ sideLabel }} · L{{ comment.line }}</span>` — only ever interpolates `comment.line`, never `comment.endLine`.
- `src/web/components/CommentComposer.vue:48` — `<span> · {{ sideLabel() }} line {{ line }}</span>` — same gap in the composer's header.
- Confirmed with real data, not just code-reading: `12-markdown-block-range-thread-source-1600.png` shows a comment anchored to the Markdown paragraph spanning HEAD source lines **7–8** (`"First paragraph line of the preview."` / `"Second paragraph line of the preview. (edited on head)"` — two adjacent non-blank lines CommonMark merges into one `<p>`, with `RenderedMarkdownView.vue`'s `emit('activate', props.side, entry.start + 1, entry.end)` genuinely passing `(line=7, endLine=8)`), yet the resulting `.comment-thread` header reads only **`"Head · L7"`** — no `L7–L8`, no range indicator of any kind.
- This is **spec-compliant**: `23-UI-SPEC.md:281` locks the label verbatim as `"Base · L{n}"` / `"Head · L{n}"` with no range variant defined, and `23-CONTEXT.md` doesn't mention header range display either — `endLine` is faithfully plumbed through the anchor/zone/reveal-scroll machinery (`workspace-state.ts`, `workspace-command.ts`) for sizing and scroll-centering, just never surfaced as header text. This is a **scope gap relative to this review's judging checklist**, not an implementation bug — it doesn't break anchoring, doesn't collide with the locked copy contract, and the full recorded context (including both source lines) is still visible once the thread is expanded. Classified **WARNING**, not BLOCKER, and does **not** affect the UAT item 1 verdict below (UAT item 1's own criteria don't mention range display — see next section).

No BLOCKER-severity findings.

---

## UAT item 1 (visual polish) — **PASS**

> Quoting `23-UAT.md` test #1 verbatim: *"Open a review session with at least one inline comment
> thread in side-by-side, inline, and single-pane modes. The rendered `.comment-thread` card
> (frame, top rule, header, state chip, collapsed snippet) visually matches 23-UI-SPEC.md's
> sketch-variant-A reference... confirm the code-column indent reads correctly aligned to the
> gutter [69px/85px, not the spec's 56/96px placeholder]... Also confirm the 7 new hand-drawn icon
> glyphs (UiIcon.vue) and the state-chip colour-to-icon mapping read correctly at a glance."*

**Verdict: PASS.**

Evidence, by sub-criterion:

1. **Frame/top-rule/header/state-chip/collapsed-snippet match the sketch, in all three modes.**
   - Side-by-side: `01-open-thread-side-by-side-{1280,1600,1920}.png`,
     `02-resolved-thread-side-by-side-{1280,1600,1920}.png` — 1px border, bottom-only radius,
     `--surface-panel` background, header with location label + state chip + (on
     hover/focus-within) action icons, collapsed single-line snippet for the resolved thread.
     Directly comparable against `00-sketch-004-variant-a-reading-1600.png` /
     `00-sketch-004-variant-a-collapsed-1600.png`, which show the same frame/header/collapsed-row
     shape (`.thread`/`.th-head`/`.th-state`/`.th-snippet` in the sketch's own markup).
   - Inline: `09-inline-layout-{1280,1600,1920}.png` — same unified-column diff rendering, thread
     widgets unaffected by the layout toggle.
   - Single-pane: `10-single-pane-layout-{1280,1600,1920}.png` — same card anatomy in a standalone,
     single-file session (status "added", forced single-pane).
2. **69px/85px indent looks visually correct, not just bounding-box-correct.** Pixel-measured
   directly from the screenshots (see Spacing row above): 69px side-by-side, 84–85px single-pane,
   in both cases the thread card's left edge lands flush with the code column, under the gutter —
   exactly as intended, confirming the empirical spike value reads correctly at the three required
   widths.
3. **7 hand-drawn icon glyphs + chip colour-to-icon mapping read correctly at a glance.** All
   seven new `UiIcon.vue` glyphs (`edit`, `delete`, `reopen`, `previous-thread`, `next-thread`,
   `collapse-threads`, `expand-threads`) render as distinct, legible small vector glyphs in the
   header action rows and editor-title row — not generic icon-font squares/ligature fallbacks.
   Chip colour-to-state mapping is unambiguous across every screenshot: Open = blue/accent circular
   icon, Resolved = purple check icon, Anchor moved / Anchor missing = amber warning-triangle icon
   — every chip also carries a text label, so the mapping is never colour-only.

The multi-line/`endLine` header gap documented above is **outside UAT item 1's stated scope**
(frame/chip/indent/icons only) and does not change this verdict.

---

## Screenshot inventory

`.planning/ui-reviews/23-20261105-225926/` (3 widths each: 1280/1600/1920, height 1000):

- `00-sketch-004-variant-a-reading-*` / `00-sketch-004-variant-a-collapsed-*` — ground truth
- `01-open-thread-side-by-side-*`
- `02-resolved-thread-side-by-side-*`
- `03-stale-anchor-moved-thread-*`
- `04-orphaned-comments-group-*`
- `05-edit-mode-*`
- `06-delete-undo-toast-*`
- `07-collapse-all-*`
- `08-side-by-side-layout-*`
- `09-inline-layout-*`
- `10-single-pane-layout-*`
- `11-markdown-rendered-accepted-comment-*`
- `12-markdown-block-range-thread-source-*`

No BLOCKER findings. One WARNING (thread/composer headers never display `endLine`, even though
the data model carries it end-to-end) — spec-compliant as implemented, recommend a follow-up plan
if cross-review of multi-line anchors at a glance becomes a real need, but not a Phase 23 fix.
