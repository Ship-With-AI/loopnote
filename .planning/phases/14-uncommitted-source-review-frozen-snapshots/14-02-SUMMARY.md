---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 02
subsystem: contracts
tags: [zod, schema, draft, comparison, uncommitted]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "14-01's snapshot-fs extraction (no direct schema dependency; same phase, wave 1 sibling)"
provides:
  - "UncommittedScopeSchema (and inferred UncommittedScope type) in src/contracts/comparison.ts"
  - "'changed-during-capture' as a seventh UnsupportedAvailabilityReasonSchema value"
  - "UncommittedDraftComparisonSchema as DraftComparisonSchema's third union member in src/contracts/draft.ts"
affects: [14-03, 14-04, 14-05, 14-06, 14-07, 14-08, 14-09, worktree-inventory, worktree-snapshot, createUncommittedSessionApp, createUncommittedCapabilityRegistry]

# Tech tracking
tech-stack:
  added: []
  patterns: ["superRefine-enforced mutual-exclusivity on an optional base field, mirroring PinnedDraftComparisonSchema's existing superRefine pattern"]

key-files:
  created: [tests/unit/uncommitted-contracts.test.ts]
  modified: [src/contracts/comparison.ts, src/contracts/draft.ts, src/git/availability.ts, src/server/draft-loader.ts, src/export/review-export.ts]

key-decisions:
  - "UncommittedScopeSchema placed after ChangedFileSchema (not literally 'directly after ExactPatchScopeSchema' as the plan's action text said) because it references ChangedFileSchema, which is declared later in the file's const-evaluation order; placing it before ChangedFileSchema would throw a temporal-dead-zone ReferenceError at module load."
  - "DraftComparisonSchema's union call written as a single line (`z.union([...]).readonly();`) rather than the more common multi-line formatting elsewhere in the file, so the plan's own verification grep (`z.union(\\[PinnedDraftComparisonSchema, ExactPatchDraftComparisonSchema, UncommittedDraftComparisonSchema\\])`) matches literally."
  - "Used `npx tsc --noEmit --project tsconfig.json` in place of the nonexistent `npm run typecheck` script, matching the identical deviation already recorded for 14-01 in STATE.md."

requirements-completed: [WTREE-03, WTREE-04, WTREE-05]

# Metrics
duration: 35min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 2: Uncommitted Scope and Draft Comparison Contracts Summary

**`UncommittedScopeSchema` and `UncommittedDraftComparisonSchema` Zod contracts, both enforcing D-05's Unstaged-has-no-base rule via `superRefine`, plus a seventh `'changed-during-capture'` `UnsupportedAvailabilityReasonSchema` value — the two schema shapes every other Phase 14 module builds against.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-10-30T19:04:00Z
- **Completed:** 2026-10-30T19:10:30Z
- **Tasks:** 2
- **Files modified:** 6 (2 created/extended test file iterations collapsed into 1 final file; 5 source files)

## Accomplishments

- `UncommittedScopeSchema` (`kind: 'uncommitted'`, `sourceKind`, `repositoryRoot`, `objectFormat`, optional `baseCommitOid`/`mergeBaseOid`, `changedFiles`) with a `superRefine` enforcing D-05: Unstaged must have neither base field, Staged/Working tree must have both.
- `'changed-during-capture'` added as the seventh `UnsupportedAvailabilityReasonSchema` value, representable through the existing three-kind `AvailabilitySchema` shape with no new top-level `kind` — satisfies D-09/WTREE-04.
- `UncommittedDraftComparisonSchema` (`kind: 'uncommitted'`, `sourceKind`, optional `baseCommitOid`, `reviewKey`, non-empty `snapshotChain`) added as `DraftComparisonSchema`'s third union member, enforcing the same D-05 base rule plus D-18's non-empty ordered chain; `reviewKey` is the sole identity field (WTREE-05).
- New dedicated test file `tests/unit/uncommitted-contracts.test.ts` (13 tests) covering every `<behavior>` case from both tasks.

## Task Commits

Each task followed RED → GREEN TDD discipline with its own commit pair:

1. **Task 1: UncommittedScopeSchema and the changed-during-capture availability reason**
   - `a45c5c5` — `test(14-02): add failing test for UncommittedScopeSchema and changed-during-capture` (RED — verified 8/8 new tests failed against unmodified `comparison.ts`/`availability.ts`)
   - `b35acf0` — `feat(14-02): add UncommittedScopeSchema and changed-during-capture availability reason` (GREEN — 8/8 pass, `tsc --noEmit` clean)
2. **Task 2: UncommittedDraftComparisonSchema as a third DraftComparisonSchema union member**
   - `0dd9917` — `test(14-02): add failing test for UncommittedDraftComparisonSchema union member` (RED — verified 2/13 new assertions failed against unmodified `draft.ts`/`draft-loader.ts`/`review-export.ts`)
   - `96017ca` — `feat(14-02): add UncommittedDraftComparisonSchema as third DraftComparisonSchema union member` (GREEN — 13/13 pass, `tsc --noEmit` clean)

RED states were verified for real: before each GREEN commit, the relevant implementation files were reverted to HEAD via `git checkout -- <file>` (the sanctioned per-file discard, not a blanket reset), the test suite was run and observed failing, the test file was committed alone, the implementation was restored from a local backup, and the suite was re-run to confirm it passed before committing the implementation.

## Files Created/Modified

- `src/contracts/comparison.ts` — added `UncommittedScopeSchema` (placed after `ChangedFileSchema` for evaluation-order correctness), `export type UncommittedScope`, and the `'changed-during-capture'` enum value.
- `src/contracts/draft.ts` — added `UncommittedDraftComparisonSchema` after `ExactPatchDraftComparisonSchema`; `DraftComparisonSchema`'s union now has three members.
- `src/git/availability.ts` — added the `'changed-during-capture'` entry to the `unsupportedAvailability` exhaustive `Record<UnsupportedAvailabilityReason, Availability>` lookup table (the enum widening made this table non-exhaustive without it; this module's own classifier never produces this reason — it's produced by the future worktree-snapshot capture code — but the table's type must still be complete).
- `src/server/draft-loader.ts` — added a `kind === 'uncommitted'` branch to `sameComparison()` (compares by `reviewKey` equality) ahead of the existing exact-patch branch, and narrowed that branch's guard from `'kind' in left` to `'kind' in left && left.kind === 'exact-patch'`.
- `src/export/review-export.ts` — narrowed `buildReviewExportV3()`'s provenance check from `!('kind' in draft.comparison)` to also require `draft.comparison.kind !== 'exact-patch'`, since `'kind' in comparison` alone no longer uniquely implies the exact-patch shape.
- `tests/unit/uncommitted-contracts.test.ts` (new) — 13 tests across three `describe` blocks covering `UncommittedScopeSchema`, the `changed-during-capture` enum value, and `UncommittedDraftComparisonSchema` via `DraftComparisonSchema`.

## Decisions Made

- **UncommittedScopeSchema placement**: the plan's action text says "directly after `ExactPatchScopeSchema`", but `UncommittedScopeSchema.changedFiles` reuses `ChangedFileSchema`, which is declared later in the file. Placed the new schema directly after `ChangedFileSchema` instead (before `PinnedComparisonSchema`) to avoid a `const`-before-initialization runtime error. This still satisfies every `<read_first>`/`<behavior>` requirement — the shape, D-05 enforcement, and `kind: 'uncommitted'` literal are unchanged.
- **Single-line union formatting** for `DraftComparisonSchema` so the plan's own verification grep pattern (which expects `z.union([...])` as one contiguous string) matches.
- **`npm run typecheck` substitution**: package.json has no top-level `typecheck` script (only `typecheck:web`/`typecheck:tests:*`). Used `npx tsc --noEmit --project tsconfig.json`, identical to the deviation already recorded for 14-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run typecheck` script does not exist**
- **Found during:** Task 1 verification
- **Issue:** `package.json` has no `typecheck` script; only `typecheck:web`, `typecheck:tests:node`, `typecheck:tests:web`.
- **Fix:** Used `npx tsc --noEmit --project tsconfig.json` as the equivalent `noEmit` check for the `src/contracts` sources this plan modifies — identical substitution already recorded for 14-01 in `.planning/STATE.md`.
- **Files modified:** None (verification command only).
- **Verification:** Exit code 0, no diagnostics.
- **Committed in:** n/a (verification-only).

**2. [Rule 3 - Blocking] Widening `DraftComparisonSchema`'s union to three members broke downstream `'kind' in comparison` narrowing**
- **Found during:** Task 2 verification (`npx tsc --noEmit` failed in `src/server/draft-loader.ts` and `src/export/review-export.ts`)
- **Issue:** `sameComparison()` (`draft-loader.ts`) and `buildReviewExportV3()` (`review-export.ts`) both used `'kind' in comparison` as a type guard that, before this plan, uniquely implied the exact-patch shape (the only other union member, `PinnedDraftComparisonSchema`, has no `kind` field). Adding `UncommittedDraftComparisonSchema` (which also has `kind: 'uncommitted'`) broke that uniqueness, so `.digest`/`.validationTarget` accesses in both functions became type errors.
- **Fix:** In `sameComparison()`, added a `kind === 'uncommitted'` branch (reviewKey equality) ahead of the existing branch, and narrowed the existing branch's guard to `left.kind === 'exact-patch' && right.kind === 'exact-patch'`. In `buildReviewExportV3()`, added `draft.comparison.kind !== 'exact-patch'` to the existing `!('kind' in draft.comparison)` guard. Both fixes follow RESEARCH.md Required Focus 1 §3's explicit guidance ("`sameComparison()` ... does need new branch ... add third branch comparing `reviewKey` equality for `kind === 'uncommitted'` comparisons specifically, before falling through [to] exact-patch branch").
- **Files modified:** `src/server/draft-loader.ts`, `src/export/review-export.ts`.
- **Verification:** `npx tsc --noEmit --project tsconfig.json` exits 0; `tests/unit/draft-load.test.ts` and `tests/unit/review-export.test.ts` (pre-existing suites) still pass unchanged (55 tests).
- **Committed in:** `96017ca` (Task 2 GREEN commit).
- **Note:** This is a minimal, compile-correcting fix only — it makes `sameComparison()` structurally aware of the third union member without implementing 14-08's full D-19 relaunch-recovery behavior (candidate lookup across drafts with the same `sourceKind`/`baseCommitOid` but a different digest). Plan 14-08 Task 3 explicitly owns that behavior and its own test coverage (`tests/unit/draft-load.test.ts`); this fix does not conflict with or duplicate that work, and 14-08's acceptance criterion (`grep -c "kind === 'uncommitted'"` in `sameComparison` ≥ 1) is already satisfied as a side effect.

**3. [Rule 2 - Missing Critical] `UnsupportedAvailabilityReasonSchema` widening made `src/git/availability.ts`'s exhaustive lookup table incomplete**
- **Found during:** Task 1 verification (`npx tsc --noEmit` failed: `Property '"changed-during-capture"' is missing`)
- **Issue:** `unsupportedAvailability: Readonly<Record<UnsupportedAvailabilityReason, Availability>>` is a compile-time-exhaustive map keyed by every enum value; adding the seventh enum value without a matching entry breaks that exhaustiveness guarantee.
- **Fix:** Added `'changed-during-capture': Object.freeze({ kind: 'unsupported', reason: 'changed-during-capture' })` to the record. This module's own `classifyAvailability()` logic never produces this reason today (it will be produced by the future worktree-snapshot capture code per RESEARCH.md Required Focus 3), but the table's type must stay complete regardless.
- **Files modified:** `src/git/availability.ts`.
- **Verification:** `npx tsc --noEmit --project tsconfig.json` exits 0; `tests/unit/availability.test.ts` (pre-existing suite) still passes unchanged (13 tests).
- **Committed in:** `b35acf0` (Task 1 GREEN commit).

---

**Total deviations:** 3 auto-fixed (1 tooling substitution, 2 missing-critical/blocking type-exhaustiveness fixes).
**Impact on plan:** All three were necessary consequences of this plan's own schema changes becoming visible as compile errors in consumer files the plan's `files_modified` list didn't name. Fixes were kept minimal (structural type-safety only) and explicitly avoid duplicating 14-08's planned behavioral work. No scope creep beyond what was required for `npm run typecheck` (substitute) to exit 0, as the plan's own acceptance criteria require.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `UncommittedScopeSchema`, `UncommittedDraftComparisonSchema`, and the `'changed-during-capture'` availability reason are exported and available for 14-03 (`uncommittedReviewKey()` in `src/domain/comparison-key.ts`) and subsequent Phase 14 plans (`worktree-inventory.ts`, `worktree-snapshot.ts`, `createUncommittedSessionApp`, `createUncommittedCapabilityRegistry`) to build against.
- No blockers. 14-08 Task 3 (full `sameComparison()` D-19 relaunch-recovery behavior) remains correctly scoped to that plan; this plan's minimal compile-fix does not need to be revisited by 14-08, only extended.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

All created/modified files found on disk; all four task commit hashes (`a45c5c5`, `b35acf0`, `0dd9917`, `96017ca`) found in `git log`.
