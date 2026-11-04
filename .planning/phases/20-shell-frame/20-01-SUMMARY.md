---
phase: 20-shell-frame
plan: 01
subsystem: ui
tags: [vitest, tdd, localstorage, vue-shallowref, panel-state]

# Dependency graph
requires:
  - phase: 19-typecheck-foundation
    provides: "npm run typecheck:web gate (vue-tsc 3.3.14) covering every web .ts module, including this plan's new src/web/model/panel-state.ts"
provides:
  - "PANEL_STATE_STORAGE_KEY constant for the loopnote.workbench.v1 localStorage key"
  - "clampSidebarWidth/clampPanelHeight pure bounds helpers (170-520 / 120-520)"
  - "parsePanelState(raw) self-healing per-field parser: never throws, each of sidebarWidth/sidebarVisible/panelHeight falls back to its own default independently on missing key, invalid JSON, wrong shape, or wrong type"
  - "createPanelState(options) factory returning ShallowRef<sidebarWidth/sidebarVisible/panelHeight> plus persist(), with injectable storage for testability"
affects: [20-05-shell-frame, 20-07-shell-frame]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable-dependency factory (options.storage defaulting to window.localStorage), mirroring createSelectorDriftState's options.document/.setInterval convention"
    - "Per-field self-healing validation (typeof check + fallback to that field's own default) rather than whole-object rejection on any single malformed field"

key-files:
  created: [src/web/model/panel-state.ts, tests/unit/panel-state.test.ts]
  modified: []

key-decisions:
  - "No REFACTOR commit — the GREEN implementation already factored the shared clamp(value, min, max) helper used by both clampSidebarWidth and clampPanelHeight, so there was no further duplication left to remove without changing behavior."

patterns-established:
  - "Pure clamp/parse functions + injectable-storage factory is the template for any future localStorage-backed Vue reactive state in src/web/model/"

requirements-completed: [SHELL-04]

# Metrics
duration: 7min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 01: TDD `panel-state.ts` — clamp, parse, and persist Summary

**Self-healing `loopnote.workbench.v1` localStorage parser and `createPanelState()` reactive factory, built test-first against all 13 documented corrupt/valid-input edge cases before any Vue component depends on it.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-04T19:31:00Z
- **Completed:** 2026-11-04T19:37:50Z
- **Tasks:** 1 (TDD task)
- **Files modified:** 2

## Accomplishments
- Pure `clampSidebarWidth`/`clampPanelHeight` bounds helpers (170-520 / 120-520), sharing one internal `clamp()` helper
- `parsePanelState(raw)` self-heals missing key, invalid JSON, wrong shape (array), and per-field type mismatches, each field falling back to its own documented default independently — including the explicit-`false` truthiness-coercion trap (Test 9)
- `createPanelState(options)` factory exposing `ShallowRef<number|boolean>` state seeded at construction time through `parsePanelState`, plus a `persist()` writer, with `options.storage` injectable exactly like `createSelectorDriftState`'s injectable `document`/`setInterval`
- 13/13 Vitest cases pass covering every edge case named in the plan's `<behavior>` block

## Task Commits

TDD RED-GREEN cycle (REFACTOR not needed — see Decisions):

1. **Task 1: TDD `panel-state.ts` — clamp, parse, and persist (RED)** - `dd01548` (test)
2. **Task 1: TDD `panel-state.ts` — clamp, parse, and persist (GREEN)** - `f824d8c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/web/model/panel-state.ts` - `PANEL_STATE_STORAGE_KEY`, `clampSidebarWidth`, `clampPanelHeight`, `PersistedPanelState`, `parsePanelState`, `PanelStateOptions`, `PanelState`, `createPanelState`
- `tests/unit/panel-state.test.ts` - 13 Vitest cases: 3 `clampSidebarWidth`, 1 `clampPanelHeight` (3 assertions), 6 `parsePanelState`, 3 `createPanelState`

## Decisions Made
- No REFACTOR commit: the GREEN implementation already extracted the shared `clamp(value, min, max)` helper behind `clampSidebarWidth`/`clampPanelHeight`, leaving no further duplication to remove without changing behavior or hurting readability (the three independent per-field `typeof` ternaries in `parsePanelState` are not duplicative enough to warrant a shared abstraction for three different field types).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`createPanelState()` is ready for Wave 2+ plans in this phase: `useSash.ts`/`WorkbenchShell.vue` (20-05) will drive the side-bar/panel sash drag geometry from its `ShallowRef`s and call `persist()` on drag-end; `App.vue`'s wiring (20-07) will construct the single shared instance and feed `sidebarVisible`/`sidebarWidth`/`panelHeight` into the shell layout. No blockers — the module has zero Vue-component or DOM-global dependency beyond the injectable `storage` option, and `npm run typecheck:web` reports zero errors.

Note: `SHELL-04`'s full reviewer-facing acceptance criterion (persistence actually observable across sessions in the running UI) is proven correct in isolation here; it becomes end-to-end testable once 20-05/20-07 wire `createPanelState()` into the live shell.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
