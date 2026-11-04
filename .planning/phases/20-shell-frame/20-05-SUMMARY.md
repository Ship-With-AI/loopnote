---
phase: 20-shell-frame
plan: 05
subsystem: ui
tags: [vue, composable, css-grid, drag-resize, pointer-events, css-tokens]

# Dependency graph
requires:
  - phase: 20-shell-frame
    provides: "clampSidebarWidth/clampPanelHeight bounds (170-520/264 default, 120-520/240 default) from 20-01's panel-state.ts, and the TitleBar.vue/StatusBar.vue standalone-unwired-component precedent from 20-03"
provides:
  - "src/web/composables/useSash.ts — reusable pointerdown/pointermove/pointerup (setPointerCapture) single-axis drag-resize composable with dblclick-style reset(), plus the exported pure clampAxisValue(value, min, max) function"
  - "src/web/components/workbench/WorkbenchShell.vue — CSS-grid layout host (titlebar/body/statusbar rows; sidebar+sash+main columns; editor+sash+panel stack) wiring two independent useSash() instances, each with its own clamp bounds"
  - "The relocated #changed-files Teleport host (v-show, never v-if) inside WorkbenchShell's sidebar region"
  - "--sidebar-width-{min,max,default} and --panel-height-{min,max,default} tokens registered in styles.css :root and css-token-contract.mjs CANONICAL_TOKENS, each with a real CSS consumer"
affects: [20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First true composable file in the codebase: plain exported function returning { handlers, isDragging, reset } with zero .vue import, matching ModalDialog.vue's ref/function-returning Composition API style"
    - "Prop-seeded local shallowRef + watch-synced controlled value: a prop like sidebarWidth gets a same-named local shallowRef seeded from the prop and kept in sync via watch; useSash writes live drag feedback directly into that ref, then commits the final value back up through an update: emit on pointerup/reset"
    - "position: absolute sash overlay for CSS-grid axes: the vertical (sidebar) sash is excluded from the grid via position:absolute instead of being a third grid-template-columns track, avoiding an implicit-row auto-placement mismatch whenever the sash's v-if toggles; the horizontal (panel) sash instead sits as a normal flex sibling since .workbench-shell__main uses flex, not grid"

key-files:
  created:
    - src/web/composables/useSash.ts
    - tests/unit/use-sash.test.ts
    - src/web/components/workbench/WorkbenchShell.vue
  modified:
    - src/web/styles.css
    - scripts/css-token-contract.mjs

key-decisions:
  - "clampAxisValue(value, min, max) extracted as the pure, DOM-free testable unit per the plan's TDD behavior block; useSash() wraps it with the pointer-event wiring (setPointerCapture/pointermove/pointerup) and a separate reset() that writes options.default and calls onCommit."
  - "useSash's value option is a prop-seeded local shallowRef (not toRef(props, ...) directly), since a prop cannot be mutated; WorkbenchShell.vue syncs it both ways: watch(() => props.sidebarWidth, ...) keeps it current when the parent changes the prop, and onCommit emits update:sidebarWidth back up."
  - ".workbench-shell__body's grid-template-columns is bound via a reactive :style (computed sidebarGridTemplateColumns), not the plan's literal static var(--sidebar-width-default) 1fr rule alone — see Deviations."
  - "The vertical sash is position:absolute (excluded from the grid) rather than a third grid-template-columns track, so the 2-column sidebar+main grid never needs to account for the sash's v-if-conditional presence."

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-11-04
status: complete
---

# Phase 20-05: useSash composable + WorkbenchShell.vue grid host Summary

**A reusable pointer-driven drag-resize composable (`useSash.ts`) and a self-contained, unwired CSS-grid workbench host (`WorkbenchShell.vue`) that relocates the `#changed-files` Teleport host verbatim while staying `v-show`.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-11-04T20:50:00Z
- **Completed:** 2026-11-04T21:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `useSash.ts`: single-axis pointerdown/pointermove/pointerup composable with `setPointerCapture`, a pure exported `clampAxisValue` clamp function, and a `reset()` for double-click, reusable identically for the vertical side-bar sash and the horizontal panel sash
- `WorkbenchShell.vue`: five-region CSS-grid host (titlebar/body/statusbar rows; sidebar/sash/main columns; editor/sash/panel stack) wiring two independent `useSash()` instances with their own clamp bounds (170-520/264 default for the sidebar, 120-520/240 default for the panel)
- Relocated the `#changed-files` Teleport host and its load-bearing `v-show, not v-if` comment verbatim into the component's sidebar region
- Registered the plan's remaining six workbench geometry tokens (`--sidebar-width-{min,max,default}`, `--panel-height-{min,max,default}`) with real CSS consumers, passing `verify-semantic-css.mjs`'s token-contract gate

## Task Commits

Each task was committed atomically:

1. **Task 1: useSash.ts composable** - `0e7a5b7` (feat)
2. **Task 2: WorkbenchShell.vue — grid host, both sashes, Teleport host relocation, remaining tokens** - `ae06d6a` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/web/composables/useSash.ts` - pointer drag-resize composable + `clampAxisValue`
- `tests/unit/use-sash.test.ts` - clamp-bound and reset unit tests
- `src/web/components/workbench/WorkbenchShell.vue` - CSS-grid shell host, both sashes, relocated Teleport host
- `src/web/styles.css` - registered 6 new sidebar/panel sash tokens
- `scripts/css-token-contract.mjs` - registered the same 6 tokens in `CANONICAL_TOKENS`

## Decisions Made

See `key-decisions` in frontmatter. The two most load-bearing: (1) the sidebar's live width must drive the grid *column* itself (not just the sidebar element's own inline width), implemented via a reactive `:style` binding on `.workbench-shell__body` rather than a static token-only rule; (2) the vertical sash is `position: absolute` so it never competes for a grid-template-columns track slot.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.workbench-shell__body`'s grid-template-columns driven reactively instead of statically**
- **Found during:** Task 2 (WorkbenchShell.vue)
- **Issue:** The plan's literal style text set `.workbench-shell__body { grid-template-columns: var(--sidebar-width-default) 1fr; }` (a static 2-column track) and relied on the sidebar item's own inline `width` style to visually resize. With CSS Grid's default `justify-self: stretch`, an item with a definite (non-auto) width degrades stretch to `start` alignment — so once the sidebar is dragged past its 264px default, its box overflows the fixed 264px track and visually overlaps/gets painted under the later-DOM `.workbench-shell__main` element. The plan itself anticipated this by qualifying its "either approach is acceptable" note with "...as long as sidebarWidth's live value visually drives the column width" — which the static-track approach alone does not satisfy for any width above the default.
- **Fix:** Kept the plan's static rule as the CSS fallback/default, and added a `computed(() => props.sidebarVisible ? \`${sidebarWidth.value}px 1fr\` : '1fr')` bound via `:style="{ gridTemplateColumns: ... }"` on `.workbench-shell__body`, so the real column track always matches the live dragged width (and collapses to one column when the sidebar is hidden, since a `v-show`-hidden item is excluded from the grid like `display:none` always is).
- **Files modified:** src/web/components/workbench/WorkbenchShell.vue
- **Verification:** `npm run build:web && node scripts/verify-semantic-css.mjs && npm run typecheck:web` all pass; manual trace of the CSS Grid alignment spec confirms no overflow at any point in the 170-520px range.
- **Committed in:** ae06d6a (Task 2 commit)

**2. [Rule 1 - Bug] Vertical sash made `position: absolute`, excluded from the grid**
- **Found during:** Task 2 (WorkbenchShell.vue)
- **Issue:** The plan's template renders the sidebar div, then a conditionally-`v-if`'d sash div, then the main div as three siblings inside a 2-column `.workbench-shell__body` grid. With CSS Grid's default `grid-auto-flow: row`, a 3rd item in a 2-column grid wraps to an implicit second row — placing `.workbench-shell__main` in the wrong cell (and only when the sash happens to be present), silently breaking the whole layout.
- **Fix:** Gave `.workbench-shell__sash--vertical` `position: absolute` (CSS Grid explicitly excludes absolutely-positioned children from grid-item placement), overlaying it on the sidebar/main boundary via `:style="{ left: sidebarWidth - 2 + 'px' }"` on a `position: relative` `.workbench-shell__body`. This keeps the grid at a stable 2 columns (sidebar, main) regardless of whether the sash is rendered.
- **Files modified:** src/web/components/workbench/WorkbenchShell.vue
- **Verification:** Same build/verify-semantic-css/typecheck gate as above; traced CSS Grid Level 1 spec's "out-of-flow" item exclusion rule.
- **Committed in:** ae06d6a (Task 2 commit)

**3. [Rule 3 - Blocking] Added a CSS consumer for `--sidebar-width-min`**
- **Found during:** Task 2 (WorkbenchShell.vue)
- **Issue:** The plan's action text gave explicit CSS consumers for 5 of its 6 new tokens (`--sidebar-width-default`, `--sidebar-width-max`, `--panel-height-default/-min/-max`) but never named one for `--sidebar-width-min`, which `verify-semantic-css.mjs`'s `assertDeclaredTokensConsumed` check would otherwise fail on (and the plan's own `<done>` criterion explicitly requires all six consumed).
- **Fix:** Added `min-width: var(--sidebar-width-min);` to `.workbench-shell__sidebar`, symmetric with the plan's own `max-width: min(var(--sidebar-width-max), calc(100vw - 480px))` ceiling — a genuine defensive floor consistent with T-20-06's clamp-everywhere mitigation.
- **Files modified:** src/web/styles.css (declaration site), src/web/components/workbench/WorkbenchShell.vue (consumer)
- **Verification:** `node scripts/verify-semantic-css.mjs` passes.
- **Committed in:** ae06d6a (Task 2 commit)

**4. [Rule 2 - Missing Critical] Added `tabindex="-1"` to both sash divs**
- **Found during:** Task 2 (WorkbenchShell.vue)
- **Issue:** 20-UI-SPEC.md's "Side-bar sash" / "Bottom panel sash" sections explicitly state the sash is "Not a tab stop (pointer/drag + double-click only — matches VS Code's own sash...)". The plan's literal template snippet for the sash `<div>`s omitted this attribute.
- **Fix:** Added `tabindex="-1"` to both `role="separator"` sash elements.
- **Files modified:** src/web/components/workbench/WorkbenchShell.vue
- **Verification:** Visual/attribute inspection against UI-SPEC's contract; no automated check exists for this specific attribute in this plan's verify block.
- **Committed in:** ae06d6a (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking token-consumer gap, 1 missing a11y attribute)
**Impact on plan:** All four were necessary for correctness (grid overlap/mismatch bugs would have broken the sidebar resize visually and structurally) or for passing this plan's own stated gates/contract; no scope creep beyond this plan's two files.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

`useSash.ts` and `WorkbenchShell.vue` exist, type-check, pass `verify-semantic-css.mjs`'s token gate, and import zero other `workbench/*.vue` component. Both remain unwired until 20-07, which is the plan responsible for:
- Passing `sidebarWidth`/`sidebarVisible`/`panelHeight`/`panelOpen` from `panel-state.ts` (20-01) as props
- Persisting `@update:sidebarWidth`/`@update:panelHeight` back through `panel-state.ts`
- Making SHELL-02/SHELL-03/SHELL-06 (and SHELL-01) actually user-observable, at which point REQUIREMENTS.md's SHELL-06 checkbox (left Pending here, following the 20-02/20-04 precedent) should flip to complete

Sibling plan 20-06 (`BottomPanel.vue`) runs next in the same Wave 3, with zero file overlap with this plan's `files_modified`.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
