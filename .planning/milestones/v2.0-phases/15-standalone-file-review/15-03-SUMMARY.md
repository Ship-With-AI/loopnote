---
phase: 15-standalone-file-review
plan: 03
subsystem: api
tags: [zod, vitest, worktree-snapshot, standalone-review, frozen-snapshot]

# Dependency graph
requires:
  - phase: 15-standalone-file-review (15-01)
    provides: resolveStandaloneArguments, classifyStandaloneGitState, createStandaloneChangedFileInventory (src/git/standalone-resolution.ts)
  - phase: 15-standalone-file-review (15-02)
    provides: UncommittedScope/WorktreeSnapshotManifest contracts widened to sourceKind 'standalone' with standaloneArguments
provides:
  - WorktreeSnapshotManifestSchema accepts sourceKind 'standalone' with an optional standaloneArguments field
  - captureWorktreeManifest/materializeWorktreeSnapshot capture standalone scopes via a shared inventoryForScope() helper
  - WorktreeSnapshot.refresh() re-resolves the original standaloneArguments on every Refresh cycle
affects: [15-04, 15-05, standalone-session-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inventoryForScope(): one small async helper branches on sourceKind === 'standalone' vs the other three sourceKinds, feeding both into the exact same expected/observed/entries capture pipeline (no parallel snapshot engine)"

key-files:
  created: []
  modified:
    - src/server/worktree-snapshot.ts
    - tests/api/worktree-snapshot.test.ts

key-decisions:
  - "Replaced the two separate createWorktreeChangedFileInventory call sites (expected + observed enumeration) with a single inventoryForScope() helper, matching the plan's 'one new capture-source function call, not a parallel snapshot engine' guidance."
  - "Removed the temporary RangeError('Unreachable: ...') guard that Plan 15-02's executor added to captureWorktreeManifest as a side effect of widening the UncommittedScope/WorktreeSnapshotManifest unions."
  - "Task 3's torn-capture and invalid-scope-rejection tests required zero production code changes — inventoryForScope's standalone branch already feeds into captureWorktreeManifest's generic intermediate/observed/entries pipeline, confirming no standalone-specific torn-capture logic is needed."

patterns-established:
  - "Standalone sourceKind reuses 100% of Phase 14's frozen-snapshot machinery (torn-capture retry, chain-digest append, path-keyed delta, manifest verification) — the only new code is the inventory enumeration call."

requirements-completed: [FILE-01, FILE-03]

# Metrics
duration: ~35min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 03: Standalone WorktreeSnapshot Capture and Refresh Summary

**Extended `WorktreeSnapshotManifestSchema`/`captureWorktreeManifest`/`WorktreeSnapshot.refresh()` with a `sourceKind: 'standalone'` branch that routes through a new `inventoryForScope()` helper into Plan 15-01's resolver, reusing Phase 14's frozen-snapshot engine unmodified.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (RED / GREEN / REFACTOR)
- **Files modified:** 2

## Accomplishments
- `WorktreeSnapshotManifestSchema` now accepts `sourceKind: 'standalone'` with an optional `standaloneArguments` field, validated with the same no-base-commit / standaloneArguments-presence `superRefine` pattern Plan 15-02 used for `UncommittedScopeSchema`.
- `captureWorktreeManifest`'s expected and observed enumeration passes, plus the final manifest-assembly object, all route through one `inventoryForScope()` helper — standalone scopes call `resolveStandaloneArguments`/`classifyStandaloneGitState`/`createStandaloneChangedFileInventory`; every other sourceKind is byte-for-byte unchanged.
- `WorktreeSnapshot.refresh()` carries `standaloneArguments` through its reconstructed scope, so repeated Refresh cycles re-resolve the original CLI pathspec arguments and report accurate added/removed/modified deltas.
- Confirmed via tests that the existing D-10 torn-capture ("changed-during-capture") logic and D-11 index-race guard require zero standalone-specific code — they already apply generically through the shared pipeline.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for standalone manifest capture and Refresh** - `8b124ea` (test)
2. **Task 2 (GREEN): Add 'standalone' manifest branch and wire captureWorktreeManifest/refresh()** - `064c35f` (feat)
3. **Task 3 (REFACTOR): Torn-capture and cap-exceeded coverage for standalone** - `524e1b8` (test)

_Note: Task 1's implementation file was deliberately held at its pre-change (RangeError-guard) state via `git diff`/`git checkout --`/`git apply` around the RED commit, since the shared checkout had concurrent sibling-agent edits in other files and `git stash` was unsafe to use — this reproduced a genuine RED failure before GREEN was committed._

## Files Created/Modified
- `src/server/worktree-snapshot.ts` - Widened `WorktreeSnapshotManifestSchema`; added `inventoryForScope()` helper; wired `captureWorktreeManifest`'s two enumeration passes and manifest assembly through it; `refresh()` now carries `standaloneArguments` forward; removed the Plan 15-02 `RangeError('Unreachable: ...')` guard.
- `tests/api/worktree-snapshot.test.ts` - Widened `scopeFor()` to accept `sourceKind: 'standalone'` and `standaloneArguments`; added coverage for standalone capture/readContent/refresh, a staged-sourceKind regression guard, standalone torn-capture (D-10), and invalid-scope rejection at `WorktreeSnapshotManifestSchema.parse`.

## Decisions Made
- Reused the plan's suggested `inventoryForScope(scope, repositoryRoot, runner, objectReader)` signature verbatim rather than inlining the branch twice — keeps the expected/observed enumeration passes byte-identical in behavior.
- Chose `['tracked.txt']` with a set `baseCommitOid` (an already-tracked, already-captured file) for the invalid-scope-rejection test, so the only failure the test can hit is the intended `WorktreeSnapshotManifestSchema.parse` superRefine rejection — not an incidental git/read error elsewhere in the capture pipeline.
- Chose a `sub/keep.txt` companion file alongside `sub/torn.txt` in the torn-capture and refresh-removed tests so the `'sub'` standalone argument continues to resolve to at least one file after the target disappears (`resolveStandaloneArguments` throws if a pathspec argument matches zero files — this is Plan 15-01 behavior, not something this plan changes).

## Deviations from Plan

None — plan executed exactly as written. Task 3's review of `inventoryForScope` for duplicated narrowing logic found none to remove (single `if`/`else`, already minimal).

## Issues Encountered
- The shared checkout had other agents (15-04/15-05) concurrently modifying unrelated files (`src/export/render-review-markdown.ts`, `src/export/review-export.ts`, `tests/unit/review-export.test.ts`, `tests/unit/review-markdown.test.ts`). Resolved by staging/committing only this plan's own two files at every step (never `git add -A`), and using a saved `git diff` patch + `git checkout --`/`git apply` scoped to `src/server/worktree-snapshot.ts` instead of `git stash` to sequence the RED/GREEN commits safely.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `WorktreeSnapshot`/`materializeWorktreeSnapshot`/`refresh()` now fully support standalone sessions end-to-end at the capture layer; the remaining `RangeError('Unreachable: ...')` guard in `src/server/capabilities.ts` (a separate Plan 15-02 side effect) is out of this plan's scope and is handled by 15-04/15-05.
- No blockers for 15-04/15-05 consuming this plan's `inventoryForScope`/manifest changes.

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*

## Self-Check: PASSED

- `.planning/phases/15-standalone-file-review/15-03-SUMMARY.md` found on disk.
- Commits found via `git log --oneline --all`: `8b124ea` (RED), `064c35f` (GREEN), `524e1b8` (Task 3 tests).
- `vitest run tests/api/worktree-snapshot.test.ts` — 19/19 passed.
- `npx tsc --noEmit --project tsconfig.json` — clean, no output.
