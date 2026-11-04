---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 03
subsystem: domain
tags: [crypto, sha256, draft-identity, uncommitted-review]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "14-02's UncommittedScopeSchema/UncommittedDraftComparisonSchema (no direct code dependency; same phase, wave 1 sibling establishing the contract this key feeds)"
provides:
  - "uncommittedReviewKey(sourceKind, baseCommitOid, firstSnapshotDigest): string in src/domain/comparison-key.ts"
  - "UNCOMMITTED_DOMAIN module-internal constant, disjoint hash space from DOMAIN/RANGE_DOMAIN"
affects: [14-08, worktree-snapshot, createUncommittedCapabilityRegistry, createUncommittedSessionApp]

# Tech tracking
tech-stack:
  added: []
  patterns: ["uncommittedReviewKey reuses comparison-key.ts's existing frame()/domain-buffer-then-per-field-hash.update() idiom verbatim, structurally identical to rangeReviewKey — no new framing logic introduced"]

key-files:
  created: []
  modified: [src/domain/comparison-key.ts, tests/unit/comparison-key.test.ts]

key-decisions:
  - "npm run typecheck substitution: package.json has no top-level typecheck script. Used npx tsc --noEmit --project tsconfig.json, identical deviation already recorded in 14-01 and 14-02."

patterns-established:
  - "Third review-key function (uncommittedReviewKey) alongside comparisonKey/rangeReviewKey, each with its own domain buffer hashed first — guarantees structurally disjoint output spaces across all three key kinds with zero runtime collision-checking logic required."

requirements-completed: [WTREE-05]

# Metrics
duration: 10min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 03: uncommittedReviewKey framed-field hash Summary

**Added `uncommittedReviewKey(sourceKind, baseCommitOid, firstSnapshotDigest)` to `src/domain/comparison-key.ts`, a third sha256 framed-field hash function (alongside `comparisonKey`/`rangeReviewKey`) that derives uncommitted draft/anchor identity from frozen snapshot content rather than a sentinel "head" value.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-30T19:15:00Z
- **Completed:** 2026-10-30T19:16:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `uncommittedReviewKey('staged' | 'unstaged' | 'worktree', baseCommitOid, firstSnapshotDigest)` exported, deterministic, returns a 64-hex-character sha256 digest.
- New `UNCOMMITTED_DOMAIN` buffer (`'cumpa-uncommitted-review-key-v1'`) hashed first, keeping uncommitted keys structurally disjoint from `comparisonKey`/`rangeReviewKey`'s output spaces — no cross-kind collision is representable.
- `frame()`'s existing length-prefix-then-bytes framing reused unchanged; `sourceKind` plus the length-prefix together make `undefined` base and `''` base non-colliding across different `sourceKind` values.
- Five new test cases in `tests/unit/comparison-key.test.ts` covering determinism, WTREE-05's digest-differentiation case, sourceKind differentiation, the undefined-vs-empty-string non-collision case, and cross-function disjointness.

## Task Commits

TDD RED → GREEN discipline, one commit pair:

1. **Task 1: uncommittedReviewKey framed-field hash**
   - `b9f83b1` — `test(14-03): add failing test for uncommittedReviewKey` (RED — verified 5/5 new tests failed with `TypeError: uncommittedReviewKey is not a function` against unmodified `comparison-key.ts`)
   - `ae482fd` — `feat(14-03): implement uncommittedReviewKey framed-field hash` (GREEN — 10/10 tests pass, `npx tsc --noEmit --project tsconfig.json` exits 0)

No REFACTOR commit — implementation is a minimal, direct application of the file's existing idiom; no cleanup was needed.

## Files Created/Modified
- `src/domain/comparison-key.ts` — added `UNCOMMITTED_DOMAIN` constant and `export function uncommittedReviewKey(...)`, placed after `rangeReviewKey`.
- `tests/unit/comparison-key.test.ts` — added `describe('uncommittedReviewKey', ...)` block (5 tests) and `uncommittedReviewKey` import.

## Decisions Made
- **`npm run typecheck` substitution**: no top-level `typecheck` script exists in `package.json` (only `typecheck:web`/`typecheck:tests:*`). Used `npx tsc --noEmit --project tsconfig.json` instead, matching the identical deviation already recorded in 14-01's and 14-02's summaries — not a new finding, same pre-existing gap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run typecheck` script does not exist**
- **Found during:** Task 1 acceptance-criteria verification
- **Issue:** Plan's acceptance criteria and verification both specify `npm run typecheck`, but `package.json` defines no such script (confirmed: `npm error Missing script: "typecheck"`).
- **Fix:** Ran `npx tsc --noEmit --project tsconfig.json` instead — the same substitution already documented in 14-01 and 14-02, using the project's existing `tsconfig.json`.
- **Files modified:** None (verification-only substitution, no source change).
- **Verification:** `npx tsc --noEmit --project tsconfig.json` exits `0`.
- **Committed in:** n/a (verification step, not a code change).

---

**Total deviations:** 1 auto-fixed (1 blocking — pre-existing missing script, third occurrence of the same recorded gap).
**Impact on plan:** No scope creep. Deviation is a verification-command substitution only; all of the plan's actual acceptance criteria (test pass, typecheck clean, grep counts) are satisfied.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `uncommittedReviewKey(sourceKind, baseCommitOid, firstSnapshotDigest)` is exported and available for 14-08's `createUncommittedCapabilityRegistry` to compute `reviewKey = uncommittedReviewKey(scope.sourceKind, scope.baseCommitOid, snapshot.chain[0])` once at session start.
- No blockers.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

All claims verified: `src/domain/comparison-key.ts` and `tests/unit/comparison-key.test.ts` found on disk with the new function/tests present; commit hashes `b9f83b1` and `ae482fd` found in `git log --oneline --all`.
