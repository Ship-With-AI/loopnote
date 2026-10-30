---
phase: 13-single-pane-file-rendering
plan: 03
subsystem: ui
tags: [vue3, monaco, typescript, single-pane-rendering]

# Dependency graph
requires:
  - phase: 13-single-pane-file-rendering (13-01)
    provides: createMonacoSinglePaneAdapter(host, languageForPath, onChange, side) factory and PublicMonacoSinglePaneAdapter, structurally interchangeable with the diff adapter
  - phase: 13-single-pane-file-rendering (13-02)
    provides: singlePaneSideFor(kind, availability) pure routing predicate and SessionFileSchema.oldMode
provides:
  - "App.vue computes singlePaneSide from the selected file's status/availability and threads it, plus sanitized short base/head oids, into DiffWorkspace and ReviewToolbar"
  - "DiffWorkspace.vue renders a genuinely separate single-pane template branch (one editor host, one side label, no +/- cue, empty-file notice for 0-byte files) that constructs/tears down the correct Monaco adapter kind on layout/side transitions"
  - "ReviewToolbar.vue removes the Change navigation group from the DOM (v-if, not CSS) when the active file is single-pane"
affects: ["13-04"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dispose-and-recreate Monaco adapter on a derived editorKind computed (watch fires only on actual kind/side change), wrapped in nextTick so the template branch (editor host present/absent) commits before the adapter tries to mount"
    - "Single-pane side word/oid/label computeds reuse the existing visibleSides computed so naming automatically tracks range vs exact-patch sessions, with graceful degradation to the bare side word when no oid is available"

key-files:
  created: []
  modified:
    - src/web/App.vue
    - src/web/components/DiffWorkspace.vue
    - src/web/components/ReviewToolbar.vue
    - src/web/styles.css

key-decisions:
  - "Reused App.vue's pre-existing pinnedSession computed (lines 143-145, identical in shape to the plan's proposed one) instead of redeclaring it, avoiding a duplicate-identifier compile error the plan's read_first window didn't surface."
  - "isSinglePaneFileEmpty narrows props.content.base/.head via the .exists discriminant before reading .text, since MissingFileContentSideSchema has no .text field and the plan's literal formula does not type-check without this narrowing."
  - "Single-pane gutter-action comment button omits the diff-workspace__gutter-action--base positioning modifier (always default right-edge position), since that modifier exists only to place the button within the left half of a two-column side-by-side canvas, which does not exist in the single-pane full-width layout."

patterns-established: []

requirements-completed: [PANE-01, PANE-02, PANE-03]

# Metrics
duration: 35min
completed: 2026-10-30
status: complete
---

# Phase 13 Plan 03: Single-pane file rendering wiring Summary

**Wires the 13-01 single-pane Monaco adapter and 13-02 routing predicate through App.vue, DiffWorkspace.vue, and ReviewToolbar.vue so an added/deleted/type-changed text file renders as one full-width Monaco pane with a correct side label, an empty-file notice for 0-byte files, and no diff-only toolbar controls, while modified/renamed/copied files stay pixel-identical.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-10-30T14:55:00Z
- **Completed:** 2026-10-30T15:30:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `App.vue` computes `singlePaneSide` from `singlePaneSideFor(selectedFile.status.kind, selectedFile.availability)` and pre-slices/sanitizes `singlePaneBaseOid`/`singlePaneHeadOid`, threading all three into `<DiffWorkspace>` (`:single-pane-side`, `:base-oid`, `:head-oid`) and a boolean into `<ReviewToolbar>` (`:single-pane`).
- `DiffWorkspace.vue` gained a fully separate single-pane `<template>` branch (`v-if="singlePaneSide !== undefined"` / `v-else` on the existing side-by-side `<section>`), with its own side-label strip (one span, no `diff-workspace__side-cue` tint), an `InlineNotice` "Empty file (0 bytes)" branch for 0-byte files, and a reused gutter-action comment button wired to `createMonacoSinglePaneAdapter`.
- Adapter construction branches on `props.singlePaneSide` in `onMounted`, and a new `watch(editorKind, ...)` disposes and reconstructs the adapter (wrapped in `nextTick`) whenever the layout kind or single-pane side changes between files.
- `ReviewToolbar.vue`'s "Change navigation" group is now `v-if="!singlePane"` — removed from the accessibility tree entirely for single-pane files, not just visually hidden; "File navigation" is unconditional and untouched.
- `styles.css` gained `.diff-workspace__side-labels--single-pane { grid-template-columns: 1fr; }`, the only new CSS rule.

## Task Commits

1. **Task 1: Compute the single-pane routing decision in App.vue and thread it down** - `ca1d9bd` (feat)
2. **Task 2: Single-pane rendering branch in DiffWorkspace.vue** - `ed7b333` (feat)
3. **Task 3: Hide the diff-only "Change navigation" group in ReviewToolbar.vue** - `84abe5c` (feat)

**Plan metadata:** pending (this summary + STATE/ROADMAP/REQUIREMENTS commit, below)

## Files Created/Modified
- `src/web/App.vue` - `singlePaneSide`/`singlePaneBaseOid`/`singlePaneHeadOid` computeds; `:single-pane-side`/`:base-oid`/`:head-oid` on `<DiffWorkspace>`, `:single-pane` on `<ReviewToolbar>`
- `src/web/components/DiffWorkspace.vue` - `singlePaneSide`/`baseOid`/`headOid` props; `singlePaneSideWord`/`singlePaneOid`/`singlePaneSideLabel`/`isSinglePaneFileEmpty`/`editorKind` computeds; branched adapter construction + dispose/recreate watch; new single-pane `<template>` branch
- `src/web/components/ReviewToolbar.vue` - `singlePane` prop; `v-if="!singlePane"` on the "Change navigation" group
- `src/web/styles.css` - `.diff-workspace__side-labels--single-pane` grid override

## Decisions Made
See `key-decisions` in frontmatter: (1) reused App.vue's pre-existing `pinnedSession` computed rather than redeclaring it; (2) narrowed `content.base`/`.head` via `.exists` before reading `.text` in `isSinglePaneFileEmpty` for type-safety; (3) omitted the `--base` gutter-action positioning modifier in the single-pane branch since it has no two-column canvas to position within.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reused existing `pinnedSession` computed instead of redeclaring it**
- **Found during:** Task 1 (App.vue routing decision)
- **Issue:** The plan's `<action>` text instructs adding `pinnedSession = computed(() => session.value !== undefined && 'base' in session.value ? session.value : undefined)`, but App.vue already declares an identical `pinnedSession` computed at line 143 (outside the plan's `read_first` window of lines 11-14,76-79,1125-1189). Adding a second `const pinnedSession` would be a duplicate-identifier compile error.
- **Fix:** Added only `singlePaneSide`, `singlePaneBaseOid`, `singlePaneHeadOid`, reusing the existing `pinnedSession` computed unchanged.
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` exits 0.
- **Committed in:** `ca1d9bd` (Task 1 commit)

**2. [Rule 1 - Bug] Narrowed `.exists` before reading `.text` in `isSinglePaneFileEmpty`**
- **Found during:** Task 2 (DiffWorkspace.vue single-pane branch)
- **Issue:** The plan's literal formula `(props.singlePaneSide === 'base' ? props.content.base.text : props.content.head.text).length === 0` does not type-check: `FileContentResponse.base`/`.head` is `ExistingFileContentSideSchema | MissingFileContentSideSchema`, and only the `exists: true` variant has a `.text` field.
- **Fix:** `isSinglePaneFileEmpty` now reads the relevant side object once, then returns `side.exists && side.text.length === 0`, mirroring the existing `.exists`-discriminant narrowing pattern already used by `immutableFile()` in the same file.
- **Files modified:** `src/web/components/DiffWorkspace.vue`
- **Verification:** `npm run typecheck:web` exits 0.
- **Committed in:** `ed7b333` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs), both required to make the plan's own `<action>` text type-check as written. No scope creep.
**Impact on plan:** Both auto-fixes necessary for correctness; behavior matches the plan's intent exactly.

## Issues Encountered
None beyond the two auto-fixed type-checking issues above.

### Out-of-scope finding (logged, not fixed)
`npm run typecheck:tests:web` fails on pre-existing errors in files this plan does not touch (`tests/e2e/pinned-session.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/unit/draft-reconciliation.test.ts`, `tests/unit/file-tree.test.ts` missing `oldMode` on inline fixtures from 13-02; `tests/unit/monaco-diff-adapter.test.ts` mock-typing errors from 13-01). This plan's own `<verification>` block specifies `npm run typecheck:web` (passes), not `typecheck:tests:web`. Logged to `deferred-items.md` in this phase directory per the scope-boundary rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PANE-01/PANE-02/PANE-03 are now observable end-to-end: a reviewer opening an added, deleted, or type-changed text file sees one full-width Monaco pane, can comment on it anchored to the correct side, and sees no diff-only toolbar controls.
- `src/web/components/StatusBadge.vue` is explicitly out of scope here (D-13/D-14 per the plan's own `<verification>`) and belongs to 13-04.

---
*Phase: 13-single-pane-file-rendering*
*Completed: 2026-10-30*

## Self-Check: PASSED
