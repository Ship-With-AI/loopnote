---
phase: 23-inline-comment-threads
plan: 03
subsystem: ui
tags: [typescript, vitest, monaco-editor-model-layer]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-01)
    provides: overlay-widget architecture decision (informational only — this plan touches no widget code)
provides:
  - "diffThreadIds() classifying toCreate/toRemove/toKeep comment ids between renders, for Plan 23-07's DiffWorkspace.vue mounting loop"
  - "projectOrphanedCommentGroup() grouping WorkspaceComment[] with status 'orphaned' by recorded path, for Plan 23-08's file-level 'Orphaned comments' group"
affects: [23-05-monaco-adapter, 23-07-diff-workspace, 23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Set-membership-driven classifier (build next-ids Set once, derive toCreate/toKeep by iterating the Set, toRemove by filtering previous) — dedupes repeated ids by construction, never array-length-based"
    - "Reused comment-groups.ts's orderPathIdentity/orderText byte-order tiebreakers (newly exported) instead of re-deriving them in orphaned-comments.ts"

key-files:
  created: [src/web/model/thread-zone-diff.ts, tests/unit/thread-zone-diff.test.ts, src/web/model/orphaned-comments.ts, tests/unit/orphaned-comments.test.ts]
  modified: [src/web/model/comment-groups.ts]

key-decisions:
  - "orphaned-comments.ts defines a local OrphanedCommentGroup type (same shape as comment-groups.ts's CommentGroup) rather than inlining the anonymous Readonly<{...}> type at every use site — matches the project's existing CommentGroup precedent, no behavior change from the plan's literal signature."

patterns-established:
  - "Pure keyed-diff model module with zero Monaco/Vue imports, consumed directly by later adapter/DiffWorkspace wiring plans"

requirements-completed: [THREAD-01, THREAD-08]

# Metrics
duration: 20min
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 03: Thread-Zone Diff, Orphaned Comments, Comment Groups Summary

**Two pure model functions — `diffThreadIds()` (keyed toCreate/toRemove/toKeep classifier) and `projectOrphanedCommentGroup()` (orphaned-comment grouping by recorded path) — fully unit-tested (14 tests), with `draft-reconciliation.ts` and `src/domain/anchor.ts` left untouched.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-11-05T19:35:00+01:00 (approx)
- **Completed:** 2026-11-05T19:45:00+01:00
- **Tasks:** 2 `<feature>` blocks (no numbered `<task>` elements — plan uses `<feature>` structure per its own frontmatter)
- **Files modified:** 5 (4 new, 1 modified)

## Accomplishments
- `diffThreadIds(previous: ReadonlySet<string>, next: readonly WorkspaceComment[])` builds `nextIds = new Set(next.map(c => c.id))` once, then classifies by set membership: ids in `nextIds` not in `previous` → `toCreate`, ids in `previous` not in `nextIds` → `toRemove`, ids in both → `toKeep`. No Monaco/Vue import.
- `projectOrphanedCommentGroup(comments: readonly WorkspaceComment[])` filters to `status === 'orphaned'`, groups by `recordedAnchor.path.bytesBase64url`, sorts groups by the newly-exported `orderPathIdentity`, and sorts within each group by (side: base-before-head, line, createdAt, id) — the same tiebreak shape as `comment-groups.ts`'s `orderComments`, reimplemented locally against `WorkspaceComment`'s field names.
- `comment-groups.ts`'s `orderPathIdentity` (line 32) and `orderText` (line 43) gained the `export` keyword — mechanical, zero behavior change — so `orphaned-comments.ts` reuses the same byte-order tiebreak instead of re-deriving it.
- All cases from both plan `<behavior>` lists written as RED tests first (confirmed failing via `Cannot find module` before implementation existed), then GREEN after implementation (14 tests total across both new test files).

## Task Commits

This plan has two `<feature>` blocks (no separate numbered `<task>` elements), executed as a single RED → GREEN TDD cycle covering both features together (both were small, interdependent only via the shared `comment-groups.ts` export change):

1. **RED: failing tests for diffThreadIds and projectOrphanedCommentGroup** - `eb21dca` (test)
2. **GREEN: implement diffThreadIds and projectOrphanedCommentGroup** - `4575741` (feat)

No REFACTOR commit needed — implementation was clean on first write, no style-rule violations flagged beyond informational reminders on the test fixtures (reviewed and confirmed as allowed exceptions: test-seam fixture builder, dynamic `Set` membership diffing — not a static lookup table).

**Plan metadata:** (docs commit hash recorded after this SUMMARY is committed)

## Files Created/Modified
- `src/web/model/thread-zone-diff.ts` - Pure module exporting `ThreadZoneDiff` type and `diffThreadIds()`. No `monaco-editor` or `vue` import (one type-only import of `WorkspaceComment`, erases at compile time).
- `tests/unit/thread-zone-diff.test.ts` - 6 tests covering every `<behavior>` case: empty-previous, empty-next, shared-plus-new, stale-plus-new, identical sets, and duplicate-id dedup.
- `src/web/model/orphaned-comments.ts` - Pure module exporting `OrphanedCommentGroup` type and `projectOrphanedCommentGroup()`. Imports `orderPathIdentity`/`orderText` from `comment-groups.ts`, type-only `RecordedAnchorDetails`/`WorkspaceComment` from `workspace-state.ts`.
- `tests/unit/orphaned-comments.test.ts` - 8 tests covering every `<behavior>` case: empty input, all-verified, two-groups-byte-ordered, base-before-head-same-group-same-line, and mixed statuses.
- `src/web/model/comment-groups.ts` - Added `export` keyword to `orderPathIdentity` and `orderText` only; no other change.

## Decisions Made
- See `key-decisions` in frontmatter: named `OrphanedCommentGroup` type instead of repeating the anonymous `Readonly<{...}>` shape at both the function signature and the Map's value type — structurally identical to the plan's literal signature, matches the project's existing `CommentGroup` naming precedent in the same directory.

## Deviations from Plan

**Binding decision override (widget architecture):** N/A — this plan does not touch widget code (no Monaco/Vue imports, no `IContentWidget`/`IOverlayWidget` reference anywhere in scope). Noted per assignment instructions.

Otherwise: None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npm run typecheck:web` — **0 errors** (vue-tsc --noEmit clean).
- `npm run verify:semantic-css` — **pass** (runs `build:web` first; this plan touches no CSS, confirmed no-op on semantic-CSS invariants — "Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass").
- `npx vitest run --no-file-parallelism tests/unit` — **448 tests passed, 44 test files passed, 0 failed** (full unit suite, no regressions; includes this plan's 14 new tests plus `comment-groups.test.ts`'s existing 2 tests passing unmodified after the two new `export` keywords).
- Playwright: **no Playwright specs applicable — plan is unit-only.** `thread-zone-diff.ts` and `orphaned-comments.ts` are pure model modules with no UI surface (no Monaco wiring, no Vue component); grepped `tests/e2e/` and `tests/integration/` for references to either module/export name — zero matches. The plan's own `<verification>` section explicitly defers the packaged-binary Chromium check to Plan 23-07 (first to render orphaned threads) and Plan 23-08 (App.vue, pins the group above the diff area).
- `tests/e2e/agent-ready-export.spec.ts` and its fixtures: untouched (plan has no reason to touch default agent-ready-export behavior).
- Golden-hash anchor tests: `src/domain/anchor.ts` has zero diff (`git diff` confirms 0 lines changed across both task commits); `draft-reconciliation.ts` likewise has zero diff. None regressed per the full unit-suite pass above.

## Self-Check: PASSED

- `diffThreadIds` and `projectOrphanedCommentGroup` both exist, exported exactly as the plan's `exports`/function-signature spec requires.
- Every `<behavior>` case in both plan features has a corresponding test, confirmed RED before implementation existed (`Cannot find module` on both new test files) and GREEN after (14/14 passing).
- `draft-reconciliation.ts` has zero diff (`git diff HEAD~2 -- src/web/model/draft-reconciliation.ts` → 0 lines).
- `src/domain/anchor.ts` has zero diff (`git diff HEAD~2 -- src/domain/anchor.ts` → 0 lines).
- `comment-groups.ts`'s only change is the two `export` keywords; `comment-groups.test.ts` passes unmodified.
- All three plan-level verification commands ran and passed; no scope was narrowed.

## Next Phase Readiness
- `thread-zone-diff.ts` is ready for direct import by Plan 23-07's DiffWorkspace.vue mounting loop (owns the actual zone/widget create-or-remove calls per id this plan's classifier identifies).
- `orphaned-comments.ts` is ready for direct import by Plan 23-08's App.vue wiring (pins the "Orphaned comments" group above the diff area).
- No blockers for downstream plans.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
