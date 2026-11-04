---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 11
subsystem: ui
tags: [vue, inline-notice, file-tree, refresh-summary]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "createUncommittedSessionApp / POST /api/refresh / GET /api/worktree-status (14-08)"
provides:
  - "InlineNotice.vue optional dismissible/dismissLabel props + dismiss event, zero behavior change for existing non-dismissible consumers"
  - "FileRow.vue 'changed-during-capture' availability-marker case (SNAP-02)"
  - "FileRow.vue independent recentlyChanged prop + tree-row__refresh-marker span (accessible name 'Changed since last snapshot')"
  - "RefreshSummaryPanel.vue: D-15 post-Refresh summary panel built on InlineNotice's dismissible capability"
affects: [14-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "InlineNotice's new dismiss button sits last inside .inline-notice__content, after <slot />, so notice content always reads before the dismiss action"
    - "RefreshSummaryPanel's headingText computed builds a comma-joined, 'and'-terminated clause list from non-zero added/removed/modified counts only, mirroring the project's existing truthful/omit-when-zero copy voice"

key-files:
  created: [src/web/components/RefreshSummaryPanel.vue]
  modified: [src/web/components/InlineNotice.vue, src/web/components/FileRow.vue]

key-decisions:
  - "FileRow's new tree-row__refresh-marker span is a separate sibling element from .availability-marker, not a variant of it, since the two can in principle coexist on the same row (per UI-SPEC's 'impossible in practice but no extra visual rule needed' note)."
  - "RefreshSummaryPanel.vue receives added/removed/modified as path-array props and emits 'select-file' with a path string (not a fileId), matching the plan's literal prop contract; wiring this to App.vue's actual file-activation mechanism is explicitly 14-12's responsibility per this plan's key_links."
  - "No CSS added for .tree-row__refresh-marker — out of this plan's files_modified scope (InlineNotice.vue, FileRow.vue, RefreshSummaryPanel.vue only); styling is deferred to whichever later plan owns src/web/styles.css for this phase."

patterns-established:
  - "InlineNotice consumers that want a dismiss affordance pass dismissible + dismissLabel and listen for @dismiss; the prop defaults to false so pre-existing non-dismissible call sites (App.vue's patchDrifted notice, DiffWorkspace.vue's empty-file notice, DraftRecovery.vue's four notices) are byte-for-byte unaffected."

requirements-completed: [SNAP-02, SNAP-04]

# Metrics
duration: 25min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 11: InlineNotice Dismissible Prop, FileRow Markers, RefreshSummaryPanel.vue Summary

**Added an opt-in dismiss capability to the shared `InlineNotice` primitive, two independent text markers to `FileRow.vue` for torn-capture and post-Refresh states, and a new `RefreshSummaryPanel.vue` component implementing D-15's exact summary template on top of that dismissible primitive.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- `InlineNotice.vue` gained optional `dismissible`/`dismissLabel` props (`dismissible` defaults to `false` via `withDefaults`) and a `dismiss` event, rendering a trailing `Dismiss` text button (reusing the `ui-button` class, per `SupportDialog.vue`'s "Not now" precedent) only when `dismissible` is `true`. All five existing `<InlineNotice>` call sites (`App.vue`'s `patchDrifted` notice, `DiffWorkspace.vue`'s empty-file notice, `DraftRecovery.vue`'s four notices) pass no `dismissible` prop and render unchanged.
- `FileRow.vue`'s `availabilityLabel` computed now distinguishes the `'unsupported'` availability kind's `reason`: `'changed-during-capture'` renders `Changed during capture` through the existing `.availability-marker` mechanism (no new CSS pattern), any other unsupported reason still renders `Unsupported`.
- `FileRow.vue` gained an independent `recentlyChanged` prop rendering a separate `<span class="tree-row__refresh-marker" aria-label="Changed since last snapshot">Changed</span>`, positioned between the line-counts column and the availability-marker column — a sibling element, not a variant of `.availability-marker`, since the two markers can in principle coexist on the same row.
- `src/web/components/RefreshSummaryPanel.vue` created: builds the exact D-15 heading template (`Since previous snapshot: {clauses}`, correctly omitting zero-count categories and joining 2+ non-zero clauses with `, ` and a final `and `), renders one `<section>` per non-zero `Added`/`Removed`/`Modified` category with clickable `<button>` rows emitting `select-file`, and a trailing stale/orphaned comment-reclassification count paragraph (each count omitted when zero, the whole paragraph omitted when both are zero). Root element is `<InlineNotice tone="neutral" role="status" dismissible dismiss-label="Dismiss Refresh summary">`.

## Task Commits

Each task was committed atomically:

1. **Task 1: InlineNotice dismissible prop and FileRow's two new markers** - `83f8a35` (feat)
2. **Task 2: RefreshSummaryPanel.vue** - `3647a2c` (feat)

## Files Created/Modified
- `src/web/components/InlineNotice.vue` - Optional `dismissible`/`dismissLabel` props, `dismiss` event, trailing Dismiss button in template.
- `src/web/components/FileRow.vue` - `changed-during-capture` availability-marker case; new `recentlyChanged` prop and `tree-row__refresh-marker` span.
- `src/web/components/RefreshSummaryPanel.vue` - New component: D-15 summary heading, grouped file lists, reclassification counts, built on `InlineNotice`.

## Decisions Made
None beyond what's recorded under `key-decisions` above — plan executed as specified, with the two judgment calls documented there (marker independence from `.availability-marker`; path-based `select-file` event left for 14-12 to wire).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

During Task 1's `FileRow.vue` edit, an intermediate patch to insert the `recentlyChanged` marker span accidentally replaced the `.line-counts` wrapper's closing `</span>` tag instead of inserting after it. Caught immediately by re-reading the file before running acceptance checks; fixed in the same task (before any commit) by re-inserting the closing tag ahead of the new marker span. `npm run typecheck:web` passing afterward confirms the template is well-formed. No commit was made with the broken intermediate state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `InlineNotice`'s dismissible capability, `FileRow`'s two new markers, and `RefreshSummaryPanel.vue` are ready for 14-12 to wire into `App.vue`: threading the most-recent-refresh path sets and each file's `availability.reason` into `FileRow`'s `recentlyChanged`/availability props (clearing a path from the "Changed" set on file activate), mounting `RefreshSummaryPanel` in the existing `.shell-warning-stack` section driven by `POST /api/refresh`'s response, and wiring `RefreshSummaryPanel`'s `select-file` path event to the app's existing file-selection mechanism.
- No blockers for 14-12.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED
- `src/web/components/InlineNotice.vue` — FOUND, contains `dismissible` (3 occurrences)
- `src/web/components/FileRow.vue` — FOUND, contains `'changed-during-capture'` and `tree-row__refresh-marker`
- `src/web/components/RefreshSummaryPanel.vue` — FOUND, contains `Since previous snapshot` and `<InlineNotice` with `dismissible`/`dismiss-label="Dismiss Refresh summary"`
- `grep -n "dismissible" src/web/components/SelectorDriftNotice.vue src/web/components/StaleAnchorNotice.vue` — no matches (neither existing consumer touched)
- Commit `83f8a35` FOUND in `git log --oneline`
- Commit `3647a2c` FOUND in `git log --oneline`
- `npm run typecheck:web` — exits 0
