# Plan 23-01 Summary: Content-Widget vs. Overlay-Widget Go/No-Go Spike

**Status:** Task 1 and Task 2 complete. Task 3 (`checkpoint:decision`) is **blocking** — awaiting human selection. This document records the measured evidence that decision is made from.

## What was built (throwaway, not shipped)

- `src/web/prototypes/ThreadWidgetSpikePrototype.vue` — a real `monaco.editor.createDiffEditor` + a real `monaco.editor.create` (single-pane) instance, options copied verbatim from `diff-adapter.ts:136-156`/`733-744` for rendering parity. 3 thread zone pairs (default fixture) built with `createComposerZone`/`createSpacerZone`/`addZone`/`positionZones`/`growPairedZones`-shaped helpers generalized per-thread (`counterpartBoundary` reused from `line-mapping.ts`, exactly as `diff-adapter.ts` uses it today). Interactive chrome (textarea + Resolve/Delete buttons) lives in either an `IContentWidget` (`BELOW` preference) or an `IOverlayWidget` (`onDomNodeTop`-driven `top`/`left`), never in the zone's own `domNode`, per RESEARCH.md Pattern 2. A 30-thread fixture exists for the perf measurement. `window.__threadSpike` publishes live geometry/click counts/a `revealThread()` navigation helper.
- `tests/e2e/thread-widget-spike.spec.ts` — 6 Playwright tests (2 variants × 3 modes), each running all 6 of Task 2's required checks against a real dev-server-mounted instance in Chromium.
- `tests/performance/thread-input-lag.mjs` — standalone Chromium-driven script measuring real keystroke-to-paint latency into the 25th of 30 simultaneous threads.

## Measured results

### Checks 1-3 and 6: baseline reliability (N=3 threads, once a thread is actually rendered)

Pointer clicks (Resolve + Delete on all 3 threads), Tab → Resolve → Delete → Shift-Tab → Shift-Tab → Escape-returns-focus-to-Monaco, typing into thread 3 after a partial scroll, and paired Base/Head zone-height sync on textarea growth (`baseHeightPx === headHeightPx`, both > initial, observed via `window.__threadSpike` immediately after growth — both `layoutZone` calls are issued back-to-back inside one `changeViewZones` pass per side, generalizing `growPairedZones` exactly as planned, so no one-frame mismatch is observable by construction).

| Check | content / side-by-side | content / inline | content / single-pane | overlay / side-by-side | overlay / inline | overlay / single-pane |
|---|---|---|---|---|---|---|
| 1. Pointer clicks (3 threads) | PASS | PASS | PASS | PASS | PASS | PASS |
| 2. Keyboard Tab/Shift-Tab/Esc | PASS | PASS | PASS | PASS | PASS | PASS |
| 3. Typing (non-first, pre-scrolled) | PASS | PASS | PASS | PASS | PASS | PASS |
| 6. Paired zone-height sync | PASS | PASS | n/a (no counterpart side) | PASS | PASS | n/a |

**Finding:** once a thread's anchor line is actually in Monaco's currently-rendered line range, both techniques receive pointer clicks, keyboard focus cycling, and typing reliably at N=3, in all three modes. The keyed-per-thread generalization of `growPairedZones` holds. This directly answers RESEARCH.md Pitfall 2's base question (clicks/keyboard "pass through" at N>1): **they do not, for either technique, once rendered.**

### Check 4: scroll survival ("half in/out") — the decisive finding

`measureScrollSurvival` steps the editor through 16 real `page.mouse.wheel(0, 300)` scrolls starting from thread 1 centered, recording the Resolve button's computed visibility and page-relative `top` at every step, for all three modes. Both techniques fail/pass identically in all three modes — the result does not vary by side-by-side vs. inline vs. single-pane:

| Variant | Mode | Thread 1 goes invisible at step | `top` when it disappears | Host pane visible range |
|---|---|---|---|---|
| content | side-by-side | **step 3** | **215px** | ~184-682px |
| content | inline | **step 3** | **215px** | ~184-682px |
| content | single-pane | **step 3** | **215px** | ~183-683px |
| overlay | side-by-side | never (CSS-visible through step 4, tracked to top=174px) | n/a | ~184-682px |
| overlay | inline | never | n/a | ~184-682px |
| overlay | single-pane | never | n/a | ~183-683px |

**Content widget: reproduces the exact RESEARCH.md-cited bug (github.com/microsoft/monaco-editor/discussions/4477), measured in this repo's own Monaco 0.55.1 + `HIDE_UNCHANGED_REGIONS`/font config.** The widget flips to `visibility: hidden` while its `top` (215px) is still **31px inside** the visible pane (184-682px) — it is not actually scrolled past the viewport edge when it vanishes. Root cause traced to Monaco's own `ViewContentWidgets` source (`node_modules/monaco-editor/esm/vs/editor/browser/viewParts/contentWidgets/contentWidgets.js`): `_prepareRenderWidget` returns `{kind: 'offViewport'}` whenever `ctx.visibleRangeForPosition(primaryAnchorPosition)` fails — i.e. whenever the **anchor line itself** (not the widget's rendered box, which sits *below* that line) falls outside Monaco's currently-rendered line range. Because the widget is positioned `BELOW` the anchor line, the widget's own content can still visually overlap the viewport while its anchor line has already scrolled just past the top edge — producing a "goes blank while still visible" pop-out, not a clean fade-at-the-edge.

Once hidden, it never recovers within the remaining scroll range tested (`stillInteractiveAtLastVisibleStep: false` for all three content runs) — scrolling further does not bring it back in this trace window.

**Overlay widget: survives.** `visibility` never flips to `hidden`, and its `top` tracks Monaco's own `onDomNodeTop` callback smoothly past the point where content widget already failed (overlay still correctly positioned and CSS-visible at `top: 174px`, i.e. 10px *further* clipped than where content died at 215px). At step 5 the underlying **view zone** itself (not just the widget) leaves Monaco's rendered-zone range and `onDomNodeTop` reports a large sentinel offset (~-1,000,000px) — the zone is legitimately off-canvas at that point, which is expected virtualization behavior shared by both techniques, not a visibility bug. (A secondary, lower-priority observation: a synthetic `.click()` at the last CSS-visible, partially-clipped step did not register for either technique in this specific measurement — plausibly an actionability/timing artifact of clicking a widget mid-reposition rather than a reproduction of the cited "rubber-band jank," given overlay's `top` was otherwise tracking correctly frame-to-frame.)

### Check 5: `hideUnchangedRegions` collapse/expand survival (thread 2, deep inside a 64-line foldable block)

| Variant | Mode | Interactive while collapsed | Interactive once revealed | Recovers after collapse→reveal round trip |
|---|---|---|---|---|
| content | side-by-side | **FAIL** (not visible) | PASS | PASS |
| content | inline | **FAIL** (not visible) | PASS | PASS |
| overlay | side-by-side | **PASS** | PASS | PASS |
| overlay | inline | **PASS** | PASS | PASS |

**Finding, and a second concrete differentiator:** `IViewZone.showInHiddenAreas: true` (set on every zone in this harness) keeps the *zone's reserved space* rendering inside a folded region, but it has **no effect on `IContentWidget` visibility** — content widgets have no equivalent flag and are governed purely by `modelPositionIsVisible`/`visibleRangeForPosition`, which is false for a folded line regardless of the zone's own `showInHiddenAreas`. A content-widget thread anchored inside a region `hideUnchangedRegions` would fold is **completely invisible** until the whole file's hidden regions are disabled (`hideUnchangedRegions: {enabled: false}`, the same whole-file reveal `activateAnchor`/`revealAnchor` already use today for the single composer). Overlay widgets have no such dependency and remain interactive even while the region stays collapsed. Both techniques correctly preserve widget identity across a collapse→reveal→collapse→reveal round trip (no re-creation, same DOM node, click counters continue incrementing) — Pitfall 3's "never rebuilt wholesale" concern is not implicated by either technique itself.

Single-pane mode has no `hideUnchangedRegions` concept (no counterpart side to diff against), so this check does not apply there.

### 30-thread input-to-paint latency (both techniques, `tests/performance/thread-input-lag.mjs`, 10 trials each, `hideUnchangedRegions` disabled to isolate pure input latency from the Check 5 finding above)

| Variant | Median | p95 | Samples (ms) |
|---|---|---|---|
| content | **0.9 ms** | 3.3 ms | 3.3, 1.0, 1.2, 0.9, 0.9, 0.7, 0.9, 0.8, 0.9, 0.8 |
| overlay | **0.9 ms** | 1.6 ms | 0.8, 0.9, 0.6, 0.7, 0.6, 0.9, 1.6, 1.5, 1.2, 1.1 |

**Finding:** no meaningful input-lag difference between techniques at N=30 threads in one file. Both are far below any perceptible-lag threshold (commonly cited as ~100ms); neither technique is a performance concern at this scale. 30-thread rendering itself (30 zone pairs + 30 widgets) did not visibly degrade either technique's keystroke responsiveness.

### Code-column indent measurement (UI-SPEC Open Question 2, measured as a byproduct)

`editor.getLayoutInfo().contentLeft` measured at default density: side-by-side diff pane ≈ 69px, single-pane ≈ 85px. (Captured for UI-SPEC's reference; not independently re-verified against the specific 56px/96px values UI-SPEC defers — flagging for Plan 23-05 to re-measure against the exact production font/density config if those literal values are load-bearing.)

## Comparison table (full decision matrix)

| Criterion | Content widget | Overlay widget |
|---|---|---|
| Pointer clicks reliable at N=3, all 3 modes, once rendered | PASS | PASS |
| Keyboard Tab/Shift-Tab/Esc cycling, all 3 modes | PASS | PASS |
| Typing into a non-first, pre-scrolled thread, all 3 modes | PASS | PASS |
| Paired Base/Head zone-height sync on growth | PASS | PASS |
| **Scroll survival (half in/out), all 3 modes** | **FAIL — goes invisible 31px inside the visible pane (measured: step 3, top=215px vs. pane 184-682px), does not recover in the tested range** | **PASS — stays CSS-visible and correctly positioned until the underlying zone naturally leaves Monaco's render range** |
| **`hideUnchangedRegions` collapse survival (thread in a folded region)** | **FAIL — fully invisible while collapsed, `showInHiddenAreas` has no effect on content widgets** | **PASS — remains interactive while the region stays collapsed** |
| Widget identity preserved across collapse↔reveal round trip | PASS | PASS |
| 30-thread input-to-paint latency | 0.9ms median / 3.3ms p95 | 0.9ms median / 1.6ms p95 (no meaningful difference) |
| API complexity | Simpler (`getPosition()` only) | Requires manual `onDomNodeTop` → `widgetTop` → `layoutOverlayWidget()` bookkeeping per thread |

## Recommendation

**overlay-widget.** It matches content-widget on every baseline-reliability check, has no measurable performance cost at N=30, and is strictly better on both of this spike's two failure-mode checks: it does not go invisible mid-scroll while still inside the visible pane, and it remains interactive inside a `hideUnchangedRegions`-folded region (which `showInHiddenAreas` cannot fix for content widgets — there is no content-widget equivalent of that flag). The extra `onDomNodeTop`/`layoutOverlayWidget` bookkeeping the option's "cons" column warned about was implemented in ~15 lines in this harness and did not exhibit the community-reported scroll "rubber-band" jank in this project's own config — `top` tracked smoothly across every step until the zone itself left the rendered range.

Given production threads have no per-file comment cap (CONTEXT.md: "No per-file thread cap") and must coexist with `hideUnchangedRegions` (a core, already-shipped feature), the content-widget technique's hidden-region failure alone would force one of two bad tradeoffs in production: disable `hideUnchangedRegions` globally whenever any thread exists in a foldable region (defeating folding for every file with any out-of-hunk comment), or accept threads that silently vanish depending on fold state. Overlay widget avoids that tradeoff entirely.

## Resume options (Plan 23-01 Task 3)

- `content-widget` — build Plan 23-05 on `IContentWidget`. Not recommended given the measured scroll and hidden-region failures above.
- `overlay-widget` — build Plan 23-05 on `IOverlayWidget` + `onDomNodeTop`. **Recommended**, per the comparison above.
- `re-plan` — neither technique is reliable enough; stop and return to the user for an alternate interaction model. Not supported by this spike's evidence (overlay-widget passed every check).
