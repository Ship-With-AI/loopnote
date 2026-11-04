---
phase: 20-shell-frame
plan: 02
subsystem: ui
tags: [vue, monaco-editor, typescript, keyboard-shortcuts]

# Dependency graph
requires:
  - phase: 20-shell-frame
    provides: "Plan 20-01's panel-state model (unrelated file, no direct dependency, but shares wave 1)"
provides:
  - "AdapterNavigation callback contract injected into both Monaco diff adapter classes"
  - "Eight (paired) / four (single-pane) monaco.editor.addAction registrations for F7/Shift+F7/Alt+Up/Alt+Down that override Monaco's built-in Diff Review Pane and move-line bindings"
  - "PublicMonacoDiffAdapter.setRenderSideBySide(value) — live diffEditor.updateOptions() layout toggle, no editor recreation"
  - "DiffWorkspace.vue next-change/previous-change/next-file/previous-file emits and a renderSideBySide prop, both wired through to the adapter"
affects: [20-04, 20-07, 20-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Monaco addAction keybinding override: register the same action id (suffixed per editor instance) with an explicit keybindings array so it takes precedence over Monaco's own internal default binding for that key, exactly as the existing Alt+Enter add-comment actions already do"
    - "Injected navigation callback object (AdapterNavigation) passed through adapter constructors/factories rather than adapters reaching back into app-level state directly"

key-files:
  created: []
  modified:
    - src/web/monaco/diff-adapter.ts
    - src/web/components/DiffWorkspace.vue
    - src/web/prototypes/MonacoStabilityPrototype.vue

key-decisions:
  - "Suffixed every new addAction id with -base/-head (paired adapter) or -${side} (single-pane adapter) to guarantee per-editor-instance uniqueness, per the plan's own T-20-03 threat-register mitigation"
  - "Gave PublicMonacoSinglePaneAdapter a no-op setRenderSideBySide so DiffWorkspace.vue can call it unconditionally on either adapter without an instanceof/type-narrowing check"
  - "Left NAV-01/NAV-03 as Pending in REQUIREMENTS.md — this plan only completes the Monaco-adapter half; 20-04 (icon UI), 20-07 and 20-09 (App.vue wiring) also list these IDs and are the plans that make the behavior user-observable"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 02: Monaco Keyboard Navigation Overrides Summary

**Eight new `monaco.editor.addAction` registrations (F7/⇧F7/⌥↓/⌥↑) across both diff-adapter classes, overriding Monaco's own Diff Review Pane and move-line bindings, plus a live `setRenderSideBySide` layout toggle and matching `DiffWorkspace.vue` emits/prop.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-11-04T19:40:00Z (approx.)
- **Completed:** 2026-11-04T20:05:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 3 (2 planned + 1 deviation fix)

## Accomplishments
- `AdapterNavigation` callback contract (`nextChange`/`previousChange`/`nextFile`/`previousFile`) now threads from `DiffWorkspace.vue` into both Monaco adapter classes via their constructors and factory functions.
- `PublicMonacoDiffAdapter` registers F7, ⇧F7, ⌥↓, ⌥↑ as Monaco `addAction`s on **both** `originalEditor` and `modifiedEditor` (8 registrations total), each suffixed `-base`/`-head` for unique action ids, so the shortcuts fire with focus in either pane and override Monaco's internal Diff Review Pane (F7) and move-line (Alt+Up/Down) defaults.
- `PublicMonacoSinglePaneAdapter` registers the same 4 actions on its single editor, suffixed `-${side}`.
- `PublicMonacoDiffAdapter.setRenderSideBySide(value)` live-toggles `renderSideBySide` via `this.diffEditor.updateOptions({ renderSideBySide })` — confirmed no editor recreation, resolving RESEARCH.md's Open Question 2 (Monaco's `IDiffEditor.updateOptions` does support the live toggle). `PublicMonacoSinglePaneAdapter.setRenderSideBySide()` is a no-op (single-pane has no such concept) kept on the interface so callers don't need to type-narrow.
- `DiffWorkspace.vue` gained `next-change`/`previous-change`/`next-file`/`previous-file` emits (backed by a local `navigate` object passed to both adapter factory call sites) and a `renderSideBySide` prop (default `true`) with a `syncRenderSideBySide()` function + watcher that live-updates the active adapter.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register F7/⇧F7/⌥↑/⌥↓ addAction overrides + setRenderSideBySide on both adapter classes** - `0c76bfa` (feat)
2. **Task 2: Wire DiffWorkspace.vue's navigation emits and renderSideBySide prop** - `6bd9bb0` (feat)

## Files Created/Modified
- `src/web/monaco/diff-adapter.ts` - New `AdapterNavigation` type, `setRenderSideBySide` on the `MonacoDiffAdapter` interface, 8 new `addAction` registrations on `PublicMonacoDiffAdapter`, 4 on `PublicMonacoSinglePaneAdapter`, both constructors and both factory functions now require a `navigate` argument
- `src/web/components/DiffWorkspace.vue` - New emits, `renderSideBySide` prop, `navigate` object, `syncRenderSideBySide()`, both adapter call sites updated
- `src/web/prototypes/MonacoStabilityPrototype.vue` - Updated its `createMonacoDiffAdapter` call site with a `navigate` argument (deviation, see below)

## Decisions Made
- Suffixed every new action id per editor instance (`-base`/`-head`/`-${side}`) to satisfy the plan's T-20-03 threat-register mitigation (Monaco silently drops duplicate-id registrations).
- Gave the single-pane adapter a no-op `setRenderSideBySide` so `DiffWorkspace.vue` never needs an `instanceof`/type-narrowing branch.
- Left `NAV-01`/`NAV-03` as `Pending` in `REQUIREMENTS.md` (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed `MonacoStabilityPrototype.vue` call site broken by the new `navigate` constructor parameter**
- **Found during:** Task 1 (`npm run typecheck:web` after the `diff-adapter.ts` edit)
- **Issue:** `src/web/prototypes/MonacoStabilityPrototype.vue:323` calls `createMonacoDiffAdapter(host.value, languageForPath, onChange)` with 3 arguments. Task 1's new required `navigate: AdapterNavigation` parameter broke this call site (`TS2554: Expected 4 arguments, but got 3`), even though this file is not in the plan's `files_modified` list.
- **Fix:** Passed a minimal `navigate` object (`nextChange`/`previousChange` delegate to the prototype's existing `navigateChange('next'|'previous')` helper; `nextFile`/`previousFile` are no-ops, since this standalone prototype harness has no file list to navigate).
- **Files modified:** `src/web/prototypes/MonacoStabilityPrototype.vue`
- **Verification:** `npm run typecheck:web` — zero errors after the fix.
- **Committed in:** `0c76bfa` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the build green; no scope creep — the prototype harness's own navigation behavior is unchanged in substance (it never had file-navigation to begin with).

## Issues Encountered

**Requirement traceability nuance (not a bug, documented for the record):** The plan's frontmatter declares `requirements: [NAV-01, NAV-03]`, and `execute-plan.md`'s standard `update_requirements` step would mechanically flip both to "Complete" in `REQUIREMENTS.md`. Checked against the other 9 plans in this phase: `NAV-01` is also listed in 20-04's and 20-07's/20-09's frontmatter, and `NAV-03` is also listed in 20-07's/20-09's frontmatter. This plan's own `<success_criteria>` text states the Monaco-adapter half is "ready for `App.vue` (20-07) to listen for" these emits and bind a `renderSideBySide` ref — i.e. the requirement is not yet user-observable. Marking `REQUIREMENTS.md`'s single traceability row "Complete" now would be factually wrong until the icon UI (20-04) and `App.vue` wiring (20-07/20-09) land. Skipped the `requirements.mark-complete` step for `NAV-01`/`NAV-03` this plan; left both `Pending`. The next plan that actually completes the user-observable behavior should run it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `diff-adapter.ts` and `DiffWorkspace.vue` are ready for `App.vue` (20-07) to listen for `@next-change`/`@previous-change`/`@next-file`/`@previous-file` and bind them to the existing `nextChange()`/`previousChange()`/`nextFile()`/`previousFile()` module functions, and to bind a session-scoped `renderSideBySide` ref to the new prop.
- No further Monaco-internals work required for NAV-01/NAV-03; remaining work is purely `App.vue`/`EditorTitle.vue` wiring in later plans.
- `npm run typecheck:web` passes with zero errors repo-wide.

## Self-Check: PASSED

- `src/web/monaco/diff-adapter.ts` — FOUND, contains `AdapterNavigation`, `setRenderSideBySide`, 8+4 new `addAction` registrations.
- `src/web/components/DiffWorkspace.vue` — FOUND, contains the 4 new emits, `renderSideBySide` prop, `syncRenderSideBySide`.
- Commit `0c76bfa` — FOUND in `git log`.
- Commit `6bd9bb0` — FOUND in `git log`.
- `npm run typecheck:web` — 0 errors.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
