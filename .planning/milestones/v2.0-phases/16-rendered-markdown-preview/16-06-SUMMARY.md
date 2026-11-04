---
phase: 16-rendered-markdown-preview
plan: 06
subsystem: testing
tags: [playwright, e2e, vitest, markdown, security, csp, monaco]

# Dependency graph
requires:
  - phase: 16-01
    provides: "Hardened markdown-it renderer (renderMarkdownPreview) with escaped raw HTML, scheme-validated links, remote-image placeholder"
  - phase: 16-02
    provides: "Same-origin GET /api/files/:fileId/image content route"
  - phase: 16-03
    provides: "RenderedMarkdownView.vue block rendering, D-04 comment-trigger button, D-07 inline comment cards"
  - phase: 16-04
    provides: "DiffWorkspace.vue Source/Rendered mode toggle, ActiveFileToolbar.vue toggle buttons"
  - phase: 16-05
    provides: "Cross-wired side-by-side Rendered pane scroll sync"
  - phase: 16-07
    provides: "DurableAnchorV1Schema/AddCommentRequestSchema optional endLine field"
  - phase: 16-08
    provides: "endLine threaded through activate/persist-comment/reveal-line pipeline and MonacoDiffAdapter anchorDecoration"
provides:
  - "tests/helpers/git-fixture.ts: markdownPreview fixture option producing docs/preview.md (every MDV-04 hostile/benign construct), docs/assets/logo.svg, and a head-only docs/added-note.md for single-pane coverage"
  - "tests/unit/git-fixture-markdown-preview.test.ts: automated proof of the fixture's exact base/head divergence"
  - "tests/e2e/rendered-markdown-preview.spec.ts: packaged-app toggle round-trip (single-pane + side-by-side) and full comment-flow (A-01 full-range Monaco decoration) coverage"
  - "tests/e2e/rendered-markdown-security.spec.ts: packaged-app negative security coverage under the real, unmodified CSP"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "markdownPreview git-fixture option mirrors the existing anchoredReview precedent: write-before-base-commit / switch -c feature / write-before-head-commit, with an additional head-only file for single-pane coverage that a purely-modified file can never exercise"
    - "Self-contained per-spec-file e2e helpers (startGeneratedCli/waitForLoopbackUrl/openGeneratedReview/stopGeneratedCli), copied verbatim from anchored-review.spec.ts rather than extracted to a shared module, per this project's established convention"
    - "Monaco layout() now takes an optional forceDimensions override; every pre-existing call site keeps its original parameterless auto-detect behavior, and only the new Source<->Rendered mode-toggle watcher passes explicit container dimensions"

key-files:
  created:
    - tests/unit/git-fixture-markdown-preview.test.ts
    - tests/e2e/rendered-markdown-preview.spec.ts
    - tests/e2e/rendered-markdown-security.spec.ts
  modified:
    - tests/helpers/git-fixture.ts
    - src/web/components/DiffWorkspace.vue
    - src/web/components/RenderedMarkdownView.vue
    - src/web/monaco/diff-adapter.ts

key-decisions:
  - "Added a head-only docs/added-note.md markdown file to the markdownPreview fixture (not specified by the plan's literal Task 1 action text), since the plan's own must_haves truth requires proving the toggle round-trip 'in both layouts', and single-pane layout is driven purely by file status (added/deleted/type-changed per src/web/model/single-pane-layout.ts) — a modified-on-both-sides file (docs/preview.md) can never render single-pane, so no markdown file in the originally-specified fixture could exercise that truth"
  - "The A-01 full-range Monaco decoration assertion is verified immediately after switching back to Source (no extra Monaco-line-click interaction), since DiffWorkspace.vue's composer/comment watch already keeps the Monaco pane's anchor zone synchronized in the background regardless of which mode (Source/Rendered) is currently visible"

patterns-established:
  - "layout(forceDimensions?) as the pattern for any future Monaco adapter caller that needs to force a specific, known-correct container size rather than relying on Monaco's own (sometimes stale, see Deviations) auto-detection"

requirements-completed: [MDV-01, MDV-02, MDV-03, MDV-04]

# Metrics
duration: ~3h
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 06: Real-Browser e2e Closure — Toggle Round-Trip, Full Comment Flow (A-01), and Negative Security Coverage Summary

**Five real-Chromium Playwright tests against the packaged `cumpa` binary under its real, unmodified production CSP close out Phase 16's acceptance-criteria mandate: Source<->Rendered round-trips correctly in both single-pane and side-by-side layouts (MDV-01), a rendered-block comment survives the full click-+/compose/submit/reopen-in-Source cycle with its stored range fully highlighted (MDV-02/MDV-03/A-01), and script/dangerous-link/dangerous-image/path-traversal content is proven inert (MDV-04) — while fixing three real product bugs the tests themselves exposed along the way.**

## Performance

- **Duration:** ~3h
- **Completed:** 2026-10-31
- **Tasks:** 3 (all plan tasks), plus 3 Rule-1 production bug fixes discovered and fixed while making Task 2's own acceptance criteria pass
- **Files modified:** 7 (4 listed in plan frontmatter + `src/web/components/DiffWorkspace.vue`, `src/web/components/RenderedMarkdownView.vue`, `src/web/monaco/diff-adapter.ts`, all required to make the A-01 comment-flow assertion true, not just testable)

## Accomplishments

- `createGitFixture({ markdownPreview: true })` now produces a committed `docs/preview.md` containing every Markdown construct this phase's specs assert against — YAML front matter, heading, a genuinely two-line paragraph (for A-01 range testing), task list, GFM table, blockquote, fenced code, relative and remote image references, a raw `<script>`, `javascript:`/`data:` links, a raw `<img onerror>`, and a good `https://` link — plus a sibling `docs/assets/logo.svg` and a head-only `docs/added-note.md` for single-pane coverage. `tests/unit/git-fixture-markdown-preview.test.ts` (3 tests) proves the base/head divergence is confined to the paragraph text and one list item, never the hostile/benign lines.
- `tests/e2e/rendered-markdown-preview.spec.ts` (2 tests): the toggle test proves Source<->Rendered round-trips with correct `aria-pressed` state and `.diff-workspace__editor` visibility in both side-by-side (`docs/preview.md`) and single-pane (`docs/added-note.md`) layouts. The comment-flow test adds a comment from the head pane's two-line paragraph block, confirms it renders inline in Rendered view, switches back to Source, and confirms the *same* comment's `conversation-card` reopens with the correct `docs/preview.md · Head · line 7` header *and* that the Monaco `.monaco-anchor-line` decoration covers both source lines of the range (A-01), not just the first.
- `tests/e2e/rendered-markdown-security.spec.ts` (3 tests), run against the real packaged CLI's real `applySecurityHeaders`/CSP (no test-only relaxation anywhere): a raw `<script>` and a raw `<img onerror>` both render as escaped literal text and never set `window.__xssMarker`; `javascript:`/`data:` links never become live `<a>` elements and render as inert plain text even when force-clicked; the remote-image placeholder matches the UI-SPEC's exact copy and no off-origin `<img>` is ever inserted; the relative image loads only through `/api/files/:fileId/image` and a path-traversal-crafted request to that same (authenticated) route returns a non-200 status.
- `npm run build:web && npx playwright test tests/e2e/rendered-markdown-preview.spec.ts tests/e2e/rendered-markdown-security.spec.ts` — 5/5 passing, matching the plan's `<verification>` command exactly.

## Task Commits

1. **Task 1: markdownPreview git fixture + unit coverage** — `9bc120c` (test)
2. **(Rule 1 fix, required for Task 2) Thread endLine through DiffWorkspace setActiveAnchor call sites** — `0ee3eec` (fix)
3. **Task 2: Toggle round-trip and full comment-flow e2e spec (A-01)** — `fb3b0d8` (test, bundled with the RenderedMarkdownView.vue/diff-adapter.ts/DiffWorkspace.vue fixes Task 2's own assertions required)
4. **Task 3: Negative security e2e spec under the real production CSP** — `c2ead1a` (test)
5. **(Rule 1 fix, regression found during final verification) Scope explicit Monaco layout() dimensions to the mode-toggle path only** — `5753fb6` (fix)

## Files Created/Modified

- `tests/helpers/git-fixture.ts` — `markdownPreview?: boolean` option added to `GitFixtureOptions`
- `tests/unit/git-fixture-markdown-preview.test.ts` — new, 3 tests
- `tests/e2e/rendered-markdown-preview.spec.ts` — new, 2 tests
- `tests/e2e/rendered-markdown-security.spec.ts` — new, 3 tests
- `src/web/components/RenderedMarkdownView.vue` — composer-render guard now checks `composer.side === props.side` (see Deviations #1)
- `src/web/monaco/diff-adapter.ts` — `endLine` threaded through `DiffWorkspace.vue`'s `setActiveAnchor` call sites (see Deviations #2); `layout()` gained an optional `forceDimensions` override on both adapter classes (see Deviations #3)
- `src/web/components/DiffWorkspace.vue` — `endLine` added to both `setActiveAnchor` calls; new `watch(() => props.mode, …)` relayouts and rebuilds the active anchor zone on Source<->Rendered toggle (see Deviations #3)

## Decisions Made

See `key-decisions` in frontmatter. No `AskUserQuestion`-equivalent decision points were encountered — the plan's own text, this project's established e2e/fixture precedents, and the already-shipped Phase 13/16-08 behavior fully specified every branch this plan's tasks touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A rendered-block composer leaked into both the base and head panes whenever both sides had an overlapping block at the composer's line**
- **Found during:** Task 2, while writing the comment-flow test — two `<textarea aria-label="Comment">` elements resolved for a single click, both carrying `aria-describedby="comment-support-head-7"`.
- **Issue:** `RenderedMarkdownView.vue`'s `renderAnnotations()` filtered *existing* verified comments by `comment.side === props.side`, but its composer-rendering branch had no equivalent check — any active composer rendered into *every* pane whose blocks happened to overlap its line, regardless of which side it actually belonged to. Real UX bug: editing a Head comment would visibly (if you looked) also render a duplicate, editable composer in the Base pane.
- **Fix:** Added `composer.side !== props.side` to the early-return guard, mirroring the existing comments filter.
- **Files modified:** `src/web/components/RenderedMarkdownView.vue`
- **Verification:** `tests/e2e/rendered-markdown-preview.spec.ts`'s comment-flow test, plus `npx tsc --noEmit` clean.
- **Committed in:** `fb3b0d8`

**2. [Rule 1 - Bug] `endLine` was dropped when `DiffWorkspace.vue` forwarded the active anchor to `MonacoDiffAdapter.setActiveAnchor`**
- **Found during:** Task 2, writing the A-01 full-range decoration assertion.
- **Issue:** Plan 16-08 fully threaded `endLine` through `Anchor`/`setActiveAnchor`/`anchorDecoration`, but `DiffWorkspace.vue`'s two call sites (`loadContent()` and the composer watcher) constructed the `Anchor` object by hand and omitted `endLine`, even though `props.composer.endLine` was available. Result: the Source-view `.monaco-anchor-line` decoration for a freshly-anchored comment only ever covered its first line — A-01's "full stored range" promise silently never held for the live (not restored/reopened) path.
- **Fix:** Added `endLine: composer.endLine` to both `setActiveAnchor` calls.
- **Files modified:** `src/web/components/DiffWorkspace.vue`
- **Verification:** `tests/e2e/rendered-markdown-preview.spec.ts`'s `.monaco-anchor-line` count-of-2 assertion; `npx tsc --noEmit` clean.
- **Committed in:** `0ee3eec`

**3. [Rule 1 - Bug] An anchor zone created while the Source Monaco pane was `display:none` stayed pinned at a stale ~5px height after toggling back to Source, and the comment card inside it did not re-render after the zone was rebuilt**
- **Found during:** Task 2, writing the "switch back to Source" half of the comment-flow test.
- **Issue:** Three compounding gaps: (a) nothing called `adapter.layout()` when `props.mode` toggled, so the Monaco pane never re-measured after being hidden; (b) Monaco's `DiffEditorWidget.layout()` called with no arguments does not reliably re-measure sub-editor height once `automaticLayout` is off and a zone was created while the container was `0×0` (confirmed empirically — even a later explicit no-arg `layout()` call left the modified pane's `getLayoutInfo().height` at `5`, while an explicit `{width, height}` call fixed it instantly); (c) once the zone/decoration were forcibly rebuilt, the conversation-card content was not automatically re-rendered into the new zone DOM node, since `renderAnnotation()` is only triggered by the composer/comments watch, not by a bare `setActiveAnchor` reapplication.
- **Fix:** Added a `watch(() => props.mode, …)` in `DiffWorkspace.vue` that, on toggle, calls `adapter?.layout(forceDimensions)` with the host's measured `clientWidth`/`clientHeight` (only when both are `>0`), reapplies `setActiveAnchor` with the current anchor to force `rebuildAnchoredLayout()`, and then calls `renderAnnotation()`. `MonacoDiffAdapter.layout()`/`MonacoSinglePaneAdapter.layout()` gained an optional `forceDimensions` parameter — defaulting to the original parameterless `this.diffEditor.layout()`/`this.editor.layout()` call every pre-existing call site (ResizeObserver, window resize, next/previous file) keeps using unchanged — so only this new mode-toggle path opts into explicit dimensions.
- **Correction mid-fix:** An initial version of this fix passed explicit dimensions from *every* `layout()` call site unconditionally. That regressed `tests/e2e/complete-review-draft.spec.ts`'s `'selector drift reports complete OIDs…'` test (confirmed by reverting the three files to their pre-fix commit and re-running the failing test in isolation, which passed). The fix was narrowed to the `forceDimensions`-parameter design above, which left every pre-existing call site's behavior byte-for-byte unchanged.
- **Files modified:** `src/web/components/DiffWorkspace.vue`, `src/web/monaco/diff-adapter.ts`
- **Verification:** `tests/e2e/rendered-markdown-preview.spec.ts` (2/2), `tests/e2e/rendered-markdown-security.spec.ts` (3/3), `tests/e2e/anchored-review.spec.ts` (5/5), `tests/e2e/complete-review-draft.spec.ts` (8/8) all pass after the correction; `node scripts/run-focused-vitest.mjs tests/unit/monaco-diff-adapter.test.ts tests/unit/workspace-state.test.ts` (44/44) clean; `npx tsc --noEmit` clean.
- **Committed in:** `fb3b0d8` (initial), `5753fb6` (correction)

**Total deviations:** 3 auto-fixed, all Rule 1 (bugs the plan's own acceptance criteria could not be made true without fixing). All three are scoped to making this plan's `must_haves` genuinely hold, not speculative "while you're at it" changes — the fixes are visible, testable product-correctness gaps the e2e-writing process itself surfaced, exactly what a closing-plan's real-browser coverage is for.

## Issues Encountered

None beyond the three auto-fixed items above, all resolved within Task 2 before its commit (plus one follow-up correction commit for the regression the first version of fix #3 introduced, caught by this plan's own full-suite regression sweep before finishing).

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. Every assertion in both new spec files exercises real, live product behavior against the real packaged binary; nothing is mocked, skipped, or deferred.

## Threat Flags

None. This plan adds verification only; the one new client-side behavior change (`RenderedMarkdownView.vue`'s composer side-gate) narrows existing surface rather than widening it, and the `layout(forceDimensions)` widening is a pure rendering-correctness parameter with no new data flow.

## Next Phase Readiness

- Phase 16's acceptance-criteria mandate is fully closed: real-browser, real-CSP Playwright coverage exists and passes for the Source/Rendered toggle round trip (MDV-01), the full comment-to-source-range flow including A-01's full-range highlight (MDV-02/MDV-03), and script/dangerous-link/dangerous-image/path-traversal inertness (MDV-04).
- This was the final plan in Phase 16 (wave 6, depends on all 7 prior plans). No blockers for any subsequent phase.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: tests/helpers/git-fixture.ts
- FOUND: tests/unit/git-fixture-markdown-preview.test.ts
- FOUND: tests/e2e/rendered-markdown-preview.spec.ts
- FOUND: tests/e2e/rendered-markdown-security.spec.ts
- FOUND: src/web/components/DiffWorkspace.vue
- FOUND: src/web/components/RenderedMarkdownView.vue
- FOUND: src/web/monaco/diff-adapter.ts
- FOUND: .planning/phases/16-rendered-markdown-preview/16-06-SUMMARY.md
- FOUND commits via `git log --oneline -6`: 5753fb6 (fix), c2ead1a (test), fb3b0d8 (test), 0ee3eec (fix), 9bc120c (test)
- `npm run build:web && npx playwright test tests/e2e/rendered-markdown-preview.spec.ts tests/e2e/rendered-markdown-security.spec.ts` — 5/5 passed (matches plan `<verification>` exactly)
- `node scripts/run-focused-vitest.mjs tests/unit/git-fixture-markdown-preview.test.ts` — 3/3 passed
- `npx tsc --noEmit --project tsconfig.json` — clean
