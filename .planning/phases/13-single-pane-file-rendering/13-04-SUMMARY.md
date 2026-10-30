---
phase: 13-single-pane-file-rendering
plan: 04
subsystem: ui
tags: [vue, accessibility, status-badge, file-tree]

# Dependency graph
requires:
  - phase: 13-single-pane-file-rendering (13-02)
    provides: singlePaneSideFor(kind, availability) and wasModeKind(oldMode) pure routing/label-derivation functions, plus SessionFileSchema.oldMode on the wire contract
provides:
  - "StatusBadge.vue's reviewable-gated ', single pane' suffix on the visually-hidden label for added/deleted/type-changed files (D-09)"
  - "FileRow.vue threading the real availability.kind === 'text' reviewability signal into StatusBadge, satisfying the D-08 binary/oversized/unsupported exclusion"
  - "ActiveFileToolbar.vue rendering <StatusBadge> plus the exact D-10/D-11 layout-label copy ('Added · Head only', 'Deleted · Base only', 'Type changed · Head only (was <kind>)') for single-pane files, unchanged plain status.kind text for everyone else"
affects: [13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Both the file tree (FileRow.vue) and the file header (ActiveFileToolbar.vue) read the same single-pane routing decision from StatusBadge.vue's shared presentation + reviewable-gated suffix, rather than each component deriving its own color-independent marker text"

key-files:
  created: []
  modified:
    - src/web/components/StatusBadge.vue
    - src/web/components/FileRow.vue
    - src/web/components/ActiveFileToolbar.vue

key-decisions:
  - "singlePaneSuffix branches on props.kind === 'type-changed' as its own standalone condition, deliberately NOT inside the existing shared `case 'type-changed': case 'unsupported':` presentation switch arm, so a genuinely unsupported-status file never receives the suffix even though it shares tone/glyph presentation with type-changed."
  - "ActiveFileToolbar.vue recomputes singlePaneSideFor(selectedFile.status.kind, selectedFile.availability) independently from its own selectedFile prop rather than receiving App.vue's already-computed singlePaneSide as a new prop, keeping this plan's file ownership scoped to the three listed files and avoiding widening ActiveFileToolbar's prop surface."

patterns-established:
  - "Reviewability as an explicit prop (StatusBadge's `reviewable`) rather than inferred client-side from status kind alone, so every caller must positively supply the availability-derived D-08 gate instead of relying on a permissive default."

requirements-completed: [PANE-03]

# Metrics
duration: 9min
completed: 2026-10-30
status: complete
---

# Phase 13 Plan 04: Single-pane status markers in StatusBadge and ActiveFileToolbar Summary

**StatusBadge.vue's visually-hidden label now appends ", single pane" for reviewable added/deleted/type-changed files, FileRow.vue threads the real availability-based reviewability gate, and ActiveFileToolbar.vue replaces its raw `status.kind` text with `<StatusBadge>` plus the exact UI-SPEC layout-label copy for single-pane files.**

## Performance

- **Duration:** ~9 min (active task-commit span)
- **Started:** 2026-10-30T14:06:00Z
- **Completed:** 2026-10-30T14:16:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `StatusBadge.vue` gained an optional `reviewable` prop and a `singlePaneSuffix` computed that appends `, single pane` to the visually-hidden label for `added`/`deleted`/`type-changed` kinds only when `reviewable` is true — the existing `presentation` switch (including the shared `type-changed`/`unsupported` tone arm) is untouched.
- `FileRow.vue`'s one `<StatusBadge>` call site now supplies `:reviewable="leaf.file.availability.kind === 'text'"`, giving the tree row its real D-08 gate instead of the prop's permissive default.
- `ActiveFileToolbar.vue` now imports `StatusBadge`, `singlePaneSideFor`, and `wasModeKind` from 13-02's `single-pane-layout.ts`, computes `singlePaneSide`/`layoutLabel`, and renders `<StatusBadge>` + the exact copy (`Added · Head only`, `Deleted · Base only`, `Type changed · Head only (was <kind>)`) for single-pane files while leaving the plain `status.kind` span unchanged for side-by-side and non-reviewable files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reviewable-gated single-pane suffix on StatusBadge, threaded from FileRow** - `bad5a89` (feat)
2. **Task 2: Replace the raw status text in ActiveFileToolbar.vue with StatusBadge + layout label** - `83aaded` (feat)

**Plan metadata:** (this commit, created after summary)

## Files Created/Modified
- `src/web/components/StatusBadge.vue` — `reviewable?: boolean` prop, `singlePaneSuffix` computed, visually-hidden label now interpolates `{{ presentation.label }}{{ singlePaneSuffix }}`
- `src/web/components/FileRow.vue` — `<StatusBadge>` call now passes `:reviewable="leaf.file.availability.kind === 'text'"`
- `src/web/components/ActiveFileToolbar.vue` — `singlePaneSide`/`layoutLabel` computeds; template branches between `<StatusBadge>` + layout label (single-pane) and the unchanged plain `status.kind` span (everyone else)

## Decisions Made
See `key-decisions` in frontmatter: (1) the single-pane suffix condition stays independent of the shared `type-changed`/`unsupported` presentation switch arm so `unsupported` never gets the suffix; (2) `ActiveFileToolbar.vue` recomputes `singlePaneSideFor` from its own `selectedFile` prop rather than accepting a new prop from `App.vue`, keeping this plan's file ownership scoped as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`npm run typecheck:tests:web` fails with pre-existing `Property 'oldMode' is missing` errors in `tests/e2e/pinned-session.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/unit/draft-reconciliation.test.ts`, `tests/unit/file-tree.test.ts`, and unrelated `monaco-diff-adapter.test.ts` tuple-typing errors. These predate this plan (already logged in `deferred-items.md` under "Found during 13-03", stemming from 13-02's `oldMode` addition to `SessionFileSchema`). None of the affected files are in this plan's `files_modified`, and this plan's own `<verification>` block specifies `npm run typecheck:web` (passes), not `typecheck:tests:web`. Not fixed here — out of scope per the deviation rules' scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `StatusBadge.vue`'s `reviewable` prop and `singlePaneSuffix` are available for any future caller needing the same color-independent marker.
- `ActiveFileToolbar.vue`'s `layoutLabel` computed is self-contained and ready for 13-05.
- The pre-existing `typecheck:tests:web` fixture gap (documented above) remains outstanding for a future fixture-update plan.

## Self-Check: PASSED
- `src/web/components/StatusBadge.vue` — FOUND
- `src/web/components/FileRow.vue` — FOUND
- `src/web/components/ActiveFileToolbar.vue` — FOUND
- Commits `bad5a89`, `83aaded` — both FOUND in `git log --oneline --all`

---
*Phase: 13-single-pane-file-rendering*
*Completed: 2026-10-30*
