---
phase: 16-rendered-markdown-preview
plan: 05
subsystem: ui
tags: [vue, scroll-sync, markdown, feedback-loop-guard]

# Dependency graph
requires:
  - phase: 16-04
    provides: "DiffWorkspace.vue: mode prop, host-swap branch mounting RenderedMarkdownView in both single-pane and side-by-side layouts"
provides:
  - "findTopmostVisibleBlock/findNearestBlock/shouldEmitScrollSync pure helpers in src/web/model/rendered-markdown-blocks.ts, unit-tested directly"
  - "RenderedMarkdownView.vue: native scroll listener emitting scrolledToBlock (topmost visible block's range), guarded by shouldEmitScrollSync against programmatic-scroll feedback"
  - "RenderedMarkdownView.vue: defineExpose scrollToRange(startLine, endLine) using findNearestBlock + a requestAnimationFrame-cleared programmatic-scroll-in-flight flag"
  - "DiffWorkspace.vue: basePaneRef/headPaneRef cross-wiring each side-by-side Rendered pane's scrolled-to-block emission to the counterpart's exposed scrollToRange"
affects: [16-06, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scroll-sync feedback-loop guard (RESEARCH.md Pitfall 4) extracted as a named pure function (shouldEmitScrollSync) over a boolean flag, rather than an inline if in the scroll handler, so its exact polarity is pinned by a unit test"
    - "Block 'top' computed once per scroll event via getBoundingClientRect() relative to the container's own rect, then handed to a DOM-free pure function (findTopmostVisibleBlock) — keeps all branching logic directly vitest-testable against plain-data fixtures"
    - "programmaticScrollInFlight is a Vue ref set synchronously before scrollIntoView() and cleared on the next requestAnimationFrame, so the native scroll event the programmatic scroll itself triggers is still suppressed by the in-flight check"

key-files:
  created: []
  modified:
    - src/web/model/rendered-markdown-blocks.ts
    - tests/unit/rendered-markdown-blocks.test.ts
    - src/web/components/RenderedMarkdownView.vue
    - src/web/components/DiffWorkspace.vue
    - src/web/styles.css

key-decisions:
  - "containerTop is passed as 0 from the real scroll handler (block tops are already computed relative to the container's own rect), but findTopmostVisibleBlock keeps containerTop as an explicit parameter rather than hardcoding 0 internally, so the function stays generically testable against arbitrary offsets"
  - "programmaticScrollInFlight implemented as a Vue ref (not a plain variable) per the plan's explicit .value-based wording, even though it is never read reactively in a template"
  - "Added overflow-y: auto to .rendered-markdown in styles.css (not listed in the plan frontmatter's files_modified, but explicitly mandated by Task 1's action text) — its parent .diff-workspace__viewport has overflow-y: hidden, so without this the rendered pane would never scroll independently and the entire scroll-sync feature would be inert; tracked below as a deviation"

patterns-established: []

requirements-completed: [MDV-01]

# Metrics
duration: ~15min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 05: Block-Aligned Scroll Sync Summary

**Scrolling either side-by-side `RenderedMarkdownView` pane now finds its topmost visible `.rendered-block`, locates the nearest-range block in the counterpart pane via a pure, unit-tested matching algorithm, and scrolls it into view — guarded by a `requestAnimationFrame`-cleared in-flight flag against the `scrollIntoView`-fires-`scroll`-fires-`scrollIntoView` jitter loop RESEARCH.md's Pitfall 4 documents.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-31
- **Tasks:** 2
- **Files modified:** 5 (4 listed in plan frontmatter + `src/web/styles.css`, required by Task 1's own action text)

## Accomplishments

- `findTopmostVisibleBlock`, `findNearestBlock`, and `shouldEmitScrollSync` added to `src/web/model/rendered-markdown-blocks.ts` as DOM-free pure functions, directly `vitest`-testable against plain-data fixtures (no Vue/DOM import added to the module).
- `RenderedMarkdownView.vue` now attaches a native `scroll` listener to its scrollable root (`container`), computing each materialized `.rendered-block`'s live `top` via `getBoundingClientRect()` relative to the container's own rect, feeding that into `findTopmostVisibleBlock`, and emitting `scrolledToBlock({ start, end })` for the match — skipped entirely while `shouldEmitScrollSync` reports a programmatic scroll is still in flight.
- `defineExpose({ scrollToRange })` resolves the nearest block via `findNearestBlock`, sets `programmaticScrollInFlight.value = true`, calls `scrollIntoView({ block: 'nearest' })`, and clears the flag on the next animation frame — so the native `scroll` event that call itself triggers is suppressed by the same guard, closing the feedback loop.
- `DiffWorkspace.vue`'s two side-by-side `RenderedMarkdownView` mounts gained `basePaneRef`/`headPaneRef` template refs (typed `InstanceType<typeof RenderedMarkdownView>`) and `@scrolled-to-block` handlers that call the counterpart's exposed `scrollToRange`. The single-pane Rendered mount has no counterpart and simply has no listener for the event — no conditional needed.
- 10 new unit tests added (4 `findTopmostVisibleBlock`, 3 `findNearestBlock`, 2 `shouldEmitScrollSync`, for 19 total in the file, up from 9), covering exact-match, nearest-match, and empty-list cases per the plan's `acceptance_criteria`.
- `npm run typecheck:web` passes clean; `node scripts/run-focused-vitest.mjs tests/unit/rendered-markdown-blocks.test.ts` — 19/19 passing.

## Task Commits

Each task committed atomically:

1. **Task 1: Expose scroll position and a scrollToRange method from RenderedMarkdownView** — `27a5788`
   - Added `findTopmostVisibleBlock`/`findNearestBlock`/`shouldEmitScrollSync` to `rendered-markdown-blocks.ts`
   - Wired the native scroll listener, `scrolledToBlock` emission, and `defineExpose({ scrollToRange })` in `RenderedMarkdownView.vue`
   - Extended `tests/unit/rendered-markdown-blocks.test.ts` with coverage for all three new functions
   - Added `overflow-y: auto` to `.rendered-markdown` in `src/web/styles.css` (see Deviations)
2. **Task 2: Cross-wire the two side-by-side panes in DiffWorkspace.vue** — `2ee8301`
   - Added `basePaneRef`/`headPaneRef` template refs
   - Wired `@scrolled-to-block` on each pane to the counterpart's `scrollToRange`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Added `overflow-y: auto` to `.rendered-markdown` in `src/web/styles.css`, a file absent from the plan's frontmatter `files_modified` list**
- **Found during:** Task 1
- **Issue:** Task 1's own `<action>` text explicitly instructs: "give it `overflow-y: auto` too if not already present, since this is the element that actually scrolls." Without it, `.rendered-markdown`'s parent `.diff-workspace__viewport` has `overflow-y: hidden` in the existing CSS, so the rendered pane would never scroll independently inside its own box — the scroll listener this plan adds would never fire from a real user scroll, and `scrollIntoView({ block: 'nearest' })` would have no independent container to scroll within. This is a blocking correctness gap for the plan's own stated objective, not a style preference.
- **Fix:** Added `overflow-y: auto;` alongside the existing `overflow-x: auto;` on the `.rendered-markdown` rule in `src/web/styles.css`.
- **Files modified:** `src/web/styles.css`
- **Verification:** `npm run typecheck:web` (CSS has no type surface, verified no regression visually via the rule's existing `overflow-x: auto` precedent and the parent chain `.diff-workspace__viewport { overflow-y: hidden }` read directly from the file).
- **Commit:** `27a5788` (Task 1 commit)

**Total deviations:** 1 auto-fixed (Rule 3, scoped entirely to fulfilling Task 1's own explicit action text — no scope creep beyond what the plan itself specified).

## Issues Encountered

None beyond the one auto-fixed item above, resolved within Task 1 before committing.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. Every function is fully wired: `scrolledToBlock` is emitted from a real scroll listener and consumed by a real cross-wired handler in `DiffWorkspace.vue`; `scrollToRange` is a real `defineExpose`d method, not a placeholder.

## Threat Flags

None. Per the plan's own `<threat_model>`, this is pure client-side scroll-position UI mechanics with no new data flow, network surface, or npm dependency.

## Next Phase Readiness

- `scrolledToBlock`/`scrollToRange` are fully wired between both side-by-side Rendered panes; D-03's Open Question resolution from `16-UI-SPEC.md` is implemented end to end.
- Per the plan's own `<verification>` section, jitter-free behavior across two live, scrolling DOM panes remains a manual-verification item — this project has no `@vue/test-utils` dependency and no existing Vue-component-mounting test harness to drive real scroll events against two live component instances. Plan 16-06's e2e suite does not assert on scroll position (confirmed against its own `must_haves`); automated coverage here is limited to the pure-function layer (`findTopmostVisibleBlock`/`findNearestBlock`/`shouldEmitScrollSync`), as the plan itself specifies.
- No blockers for 16-06/16-08.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/web/model/rendered-markdown-blocks.ts
- FOUND: tests/unit/rendered-markdown-blocks.test.ts
- FOUND: src/web/components/RenderedMarkdownView.vue
- FOUND: src/web/components/DiffWorkspace.vue
- FOUND: src/web/styles.css
- FOUND: .planning/phases/16-rendered-markdown-preview/16-05-SUMMARY.md
- FOUND commits: 27a5788 (feat, Task 1), 2ee8301 (feat, Task 2) — verified via `git log --oneline -5`
