---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 01
subsystem: server
tags: [refactor, snapshot, file-io, typescript]

# Dependency graph
requires: []
provides:
  - "src/server/snapshot-fs.ts exporting digest, frame, isMissing, syncDirectory, writeOwned, boundedFileBytes, MAX_SIDE_BYTES"
  - "patch-snapshot.ts importing its file-IO primitives from snapshot-fs.ts instead of defining them locally"
affects: [14-07, worktree-snapshot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared server-side file-IO primitives module (snapshot-fs.ts) consumed by multiple snapshot-producing modules instead of module-private helpers"

key-files:
  created: [src/server/snapshot-fs.ts]
  modified: [src/server/patch-snapshot.ts]

key-decisions:
  - "boundedFileBytes, syncDirectory, and writeOwned retain their original `async function` declarations in snapshot-fs.ts (verbatim move); the plan's literal acceptance-criteria grep `^export function boundedFileBytes` cannot match a correctly-async export, so verification used the equivalent `^export async function boundedFileBytes` pattern instead."
  - "Verified via `npx tsc --noEmit --project tsconfig.json` since no `typecheck` npm script exists in package.json; this is the closest equivalent to the plan's specified `npm run typecheck`."

patterns-established:
  - "snapshot-fs.ts: shared file-IO primitives for frozen snapshot content, importable by any server module without reaching into patch-snapshot.ts's private scope"

requirements-completed: [SNAP-01]

# Metrics
duration: 15min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 01: Snapshot File-IO Primitive Extraction Summary

**Extracted `digest`, `frame`, `isMissing`, `syncDirectory`, `writeOwned`, `boundedFileBytes`, and `MAX_SIDE_BYTES` out of `patch-snapshot.ts` into a new shared `src/server/snapshot-fs.ts` module, verbatim, with zero behavioral change.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-30T17:55:00Z
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `src/server/snapshot-fs.ts` exporting the six file-IO primitives plus the `MAX_SIDE_BYTES` ceiling, moved verbatim (byte-for-byte logic) from `patch-snapshot.ts`.
- `patch-snapshot.ts` now imports all six from `./snapshot-fs.js`; every existing call site (`worktreeEntry`, `readSide`, `reviewKey`, etc.) keeps calling them by the same bare names with no argument changes.
- Removed the now-unused `open` import from `patch-snapshot.ts`'s `node:fs/promises` import (its only three usages were inside the three extracted async functions); `chmod` and `createHash` imports remain since they're still used elsewhere in the file (line 582's `chmod` call, `reviewKey`'s `createHash` call).
- Confirmed zero behavioral drift: both exact-patch test suites (`tests/api/exact-patch.test.ts`, `tests/git/exact-patch.test.ts`) pass unchanged — 17/17 tests, same pass count, no assertion changes.

## Task Commits

1. **Task 1: Extract snapshot-fs.ts primitives from patch-snapshot.ts** - `ee18a2f` (refactor)

_Single-task plan; no TDD cycle (plan `type: execute`, task has no `tdd="true"` attribute — pure mechanical extraction, not a behavior-adding change)._

## Files Created/Modified
- `src/server/snapshot-fs.ts` - New module exporting `MAX_SIDE_BYTES` and the `digest`, `frame`, `isMissing`, `syncDirectory`, `writeOwned`, `boundedFileBytes` functions, moved verbatim from `patch-snapshot.ts`.
- `src/server/patch-snapshot.ts` - Six function bodies and the standalone `MAX_SIDE_BYTES` constant removed; added `import { boundedFileBytes, digest, frame, isMissing, MAX_SIDE_BYTES, syncDirectory, writeOwned } from './snapshot-fs.js';`; removed now-unused `open` import. `SNAPSHOT_VERSION`, `MAX_SNAPSHOT_FILES`, `MAX_SNAPSHOT_BYTES`, `MAX_MANIFEST_BYTES`, `MAX_TARGET_TREE_BYTES`, and `PATCH_KEY_DOMAIN` untouched, as specified.

## Decisions Made
- Preserved the original `async function` declarations for `syncDirectory`, `writeOwned`, and `boundedFileBytes` in the new module (adding only `export`), since the plan's "no signature change" instruction and the functions' internal `await` usage require it. The plan's literal acceptance-criteria grep (`^export function boundedFileBytes`) would never match a correctly-typed async export — documented as a deviation below rather than silently dropping `async` (which would be a syntax error given the function body's `await` calls).
- Used `npx tsc --noEmit --project tsconfig.json` in place of the plan-specified `npm run typecheck`, since `package.json` has no `typecheck` script (closest equivalent available: `typecheck:web` which targets a different tsconfig, or `build:node` which emits output). This is the correct noEmit type-check for the `src/server/**/*.ts` sources this plan touches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run typecheck` script does not exist**
- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>` and acceptance criteria specify `npm run typecheck`, but `package.json` defines no `typecheck` script (only `typecheck:web`, `typecheck:tests:node`, `typecheck:tests:web`, and `build:node` which emits).
- **Fix:** Ran the equivalent `npx tsc --noEmit --project tsconfig.json` directly, which type-checks exactly the `src/server/**/*.ts` sources this plan modifies without emitting build output.
- **Files modified:** None (verification-only).
- **Verification:** Exit code `0`, no diagnostics.
- **Commit:** N/A (verification step, not a code change).

**2. [Rule 1 - Bug] Plan's literal acceptance-criteria grep cannot match correct async code**
- **Found during:** Task 1 acceptance criteria verification
- **Issue:** `grep -c "^export function boundedFileBytes" src/server/snapshot-fs.ts` is specified to equal `1`, but `boundedFileBytes` (like `syncDirectory` and `writeOwned`) is and must remain an `async function` (it `await`s inside). The literal pattern `"^export function boundedFileBytes"` never matches `"export async function boundedFileBytes"` — the grep as written cannot pass for any behavior-preserving extraction.
- **Fix:** Verified the equivalent intent with `grep -c "^export async function boundedFileBytes" src/server/snapshot-fs.ts` (result: `1`), confirming the function is exported and the `async` keyword — required by the function body and the plan's own "no signature change" instruction — was preserved rather than dropped.
- **Files modified:** None (verification-only; `src/server/snapshot-fs.ts` already correct as written).
- **Verification:** Corrected grep returns `1`; `npx tsc --noEmit` confirms no type errors; exact-patch test suites pass unchanged.
- **Commit:** N/A (verification step, not a code change).

---

**Total deviations:** 2 auto-fixed (1 blocking script substitution, 1 acceptance-criteria grep pattern correction). Neither required any code change beyond what the plan's `<action>` already specified.
**Impact on plan:** None on delivered code — `src/server/snapshot-fs.ts` and `src/server/patch-snapshot.ts` match the plan's `<action>` exactly. Both deviations are verification-tooling corrections, not implementation changes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `src/server/snapshot-fs.ts` is ready for `src/server/worktree-snapshot.ts` (planned in 14-07) to import the same `digest`/`frame`/`isMissing`/`syncDirectory`/`writeOwned`/`boundedFileBytes` primitives without reaching into `patch-snapshot.ts`'s module-private scope.
- No blockers for subsequent Phase 14 plans.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED
- FOUND: src/server/snapshot-fs.ts
- FOUND: .planning/phases/14-uncommitted-source-review-frozen-snapshots/14-01-SUMMARY.md
- FOUND commit: ee18a2f
