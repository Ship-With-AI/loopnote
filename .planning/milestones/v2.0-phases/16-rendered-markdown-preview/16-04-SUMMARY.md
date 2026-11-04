---
phase: 16-rendered-markdown-preview
plan: 04
subsystem: ui
tags: [vue, monaco, markdown, toggle, host-swap]

# Dependency graph
requires:
  - phase: 16-03
    provides: "RenderedMarkdownView.vue: block-wrapped rendered Markdown view with same props/emits shape as DiffWorkspace.vue's Monaco host"
provides:
  - "MonacoDiffAdapter.getLineChanges(): readonly monaco.editor.ILineChange[] — side-by-side returns the live diff editor's computed changes, single-pane returns [] by design (D-01 is side-by-side-only)"
  - "ActiveFileToolbar.vue: Source/Rendered segmented button pair (mode prop + toggle-mode emit), gated on .md/.markdown extension, aria-pressed state"
  - "DiffWorkspace.vue: mode prop, host-swap branch mounting RenderedMarkdownView alongside a still-mounted (v-show, never v-if) Monaco host in both single-pane and side-by-side layouts"
  - "App.vue: per-fileId in-memory (session-only, not persisted) mode state threaded to both ActiveFileToolbar and DiffWorkspace"
affects: [16-05, 16-06, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "v-show (never v-if) on the Monaco host div so the adapter instance stays alive and mounted while mode === 'rendered' — zero duplicate/headless Monaco instantiation, and getLineChanges()'s already-computed D-01 marker data stays available"
    - "lineChanges ref updated inside the existing syncAdapterState()/onChange callback chain (fired by the diff adapter's internal onDidUpdateDiff listener), not a new watcher — reuses the exact reactive-on-diff-update pattern DiffWorkspace.vue already has for anchorAffordance"
    - "Per-file mode state as a shallowRef<Map<string, 'source'|'rendered'>>, replaced (not mutated) on each toggle to trigger reactivity — mirrors the file's existing shallowRef usage for selectedFile/selectedContent/workspaceState"

key-files:
  created: []
  modified:
    - src/web/monaco/diff-adapter.ts
    - tests/unit/monaco-diff-adapter.test.ts
    - src/web/components/ActiveFileToolbar.vue
    - src/web/components/DiffWorkspace.vue
    - src/web/App.vue

key-decisions:
  - "getLineChanges() on PublicMonacoSinglePaneAdapter returns [] unconditionally (not a stub) — D-01's own wording scopes line-change markers to side-by-side layout only, so an empty array is the honest, correct answer for a class with no diff editor"
  - "DiffWorkspace's own @activate emit signature stays (side, line) unchanged in this plan even though RenderedMarkdownView's @activate already carries a third endLine argument — the DiffWorkspace→App.vue signature widening to also carry endLine is explicitly deferred to plan 16-08's Task 1 (A-01), per this plan's scope note"
  - "No new CSS added (styles.css is outside this plan's files_modified list); the two side-by-side RenderedMarkdownView instances mount as siblings of the hidden Monaco host inside the existing .diff-workspace__canvas grid with no new column layout — purely functional host-swap wiring, visual polish is out of this plan's scope"

requirements-completed: [MDV-01]

# Metrics
duration: ~15min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 04: Source/Rendered Toggle and DiffWorkspace Host-Swap Summary

**Wires the Source/Rendered toggle (D-02) into `ActiveFileToolbar.vue` and makes `DiffWorkspace.vue` swap its visible host between the existing (still-alive, `v-show`-hidden) Monaco editor and the new `RenderedMarkdownView.vue` based on a lifted `mode` prop, in both single-pane and side-by-side layouts — resolving `16-UI-SPEC.md`'s Open Question #3 via a new `getLineChanges()` method on `MonacoDiffAdapter`.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-31T12:15:00Z
- **Completed:** 2026-10-31T12:32:00Z
- **Tasks:** 3
- **Files modified:** 5 (0 created, 5 modified)

## Task Commits

1. **Task 1: Expose getLineChanges() on MonacoDiffAdapter** - `f072852` (feat)
2. **Task 2: Source/Rendered toggle in ActiveFileToolbar.vue** - `319b334` (feat)
3. **Task 3: DiffWorkspace.vue host-swap + App.vue mode-state wiring** - `d012045` (feat)

## Accomplishments
- `MonacoDiffAdapter` gains `getLineChanges(): readonly monaco.editor.ILineChange[]`. The side-by-side `PublicMonacoDiffAdapter` implementation returns `this.diffEditor.getLineChanges() ?? []` (the same already-computed data `refreshDiffDecorations()` uses internally); `PublicMonacoSinglePaneAdapter` returns `[]` unconditionally since it has no diff editor and D-01 markers are side-by-side-only. Both behaviors covered by two new focused vitest cases in `tests/unit/monaco-diff-adapter.test.ts` (22/22 passing).
- `ActiveFileToolbar.vue` gains a `mode: 'source' | 'rendered'` prop and `toggle-mode` emit, plus an `isMarkdownFile` computed (`.md`/`.markdown`, case-insensitive) gating a new Source/Rendered button pair — rendered only for Markdown files, state conveyed via visible text + `aria-pressed` (reuses the existing global `button[aria-pressed="true"]` rule, zero new CSS).
- `DiffWorkspace.vue` gains a `mode?: 'source' | 'rendered'` prop (default `'source'`). The Monaco host `<div ref="host">` in both the single-pane and side-by-side template branches switched from unconditional rendering to `v-show="mode === 'source'"` + `:aria-hidden="mode === 'rendered'"` — the adapter is never disposed on toggle, so Source/Rendered round-trips preserve Monaco's scroll/selection state and `getLineChanges()` stays live. A `lineChanges` ref, updated inside the existing `syncAdapterState()` callback (fired by the adapter's internal `onDidUpdateDiff` listener), feeds `:changes` into both side-by-side `RenderedMarkdownView` instances. `RenderedMarkdownView` mounts once in single-pane (content/side matching `singlePaneSide`) and twice in side-by-side (`side="base"` reading `content.base.text`, `side="head"` reading `content.head.text`), each wired to the identical `add`/`cancel`/`confirmDiscard`/`confirmMove`/`activate`/`keepWriting`/`ready`/`updateText` listener set the Monaco host's zone-rendered `CommentComposer` already uses.
- `App.vue` tracks each Markdown file's toggle state in a `shallowRef<Map<string, 'source'|'rendered'>>`, keyed by `selectedContent.fileId`, defaulting to `'source'` and never persisted across reloads (session-only, per `16-CONTEXT.md`'s discretion resolution). `:mode="activeFileMode"` is passed to both `ActiveFileToolbar` and `DiffWorkspace`; `@toggle-mode` on `ActiveFileToolbar` updates the map by replacing it (triggering `shallowRef` reactivity), matching the file's existing `shallowRef` convention for other per-session state.

## Deviations from Plan

None — plan executed exactly as written. Both gap in the plan's own stated gap/spacing prose (UI-SPEC's "gap: var(--space-1)" vs. the file's actual existing `gap: var(--space-2)` on `.review-toolbar__active-file`) resolved itself without any CSS change: the new Source/Rendered buttons are inserted via a `<template v-if>` wrapper (no extra DOM element), so they automatically inherit the row's real existing flex `gap` value between all visible siblings — matching the plan's stated intent ("matching the row's existing child spacing") regardless of the specific token value cited in the prose.

## Issues Encountered

None. `npm run typecheck:web` passes (note: this project's `typecheck:web` script only type-checks the files listed in `tsconfig.web.json`'s `files` array — `diff-adapter.ts` and other non-Vue model files — it does not type-check `.vue` SFC templates; no `vue-tsc` is configured in this project). As an additional sanity check beyond the plan's own `<verify>` commands, `npx vite build` was run manually and completed with no compile errors, confirming the three modified `.vue` files have no template/script syntax errors.

## Known Stubs

None.

## Threat Flags

None — `T-16-14` (hidden-but-mounted Monaco host reachable via Tab order) is mitigated exactly as the plan's threat model specifies: `v-show` (CSS `display:none`) removes the host from the default Tab order and accessibility tree, and `:aria-hidden="mode === 'rendered'"` is added explicitly alongside it. No new trust boundary or network surface introduced.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*
