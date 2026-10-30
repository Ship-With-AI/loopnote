---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 04
subsystem: git
tags: [git-diff, worktree, availability-classification, uncommitted-review]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "src/git/inventory.ts's createChangedFileInventory pattern (committed-comparison diff pipeline), src/git/availability.ts's classifyAvailability cascade, src/contracts/comparison.ts's UncommittedScopeSchema sourceKind enum (14-02)"
provides:
  - "createWorktreeChangedFileInventory(options, dependencies): Promise<readonly ChangedFile[]> for sourceKind 'staged' | 'unstaged' | 'worktree'"
  - "Five inventory.ts helpers (isCumpaInternalPath, recordIdentity, opaqueFileId, validateObjectFormat, inventoryPaths) exported for cross-module reuse"
  - "classifyWorktreeSideAvailability(): worktree-resident-side availability classification (bounded fs read, per-segment lstat symlink defense) parallel to classifyAvailability() for Git-object sides"
affects: [14-07-worktree-snapshot, 14-08-session-file-lists, 14-09-14-13-uncommitted-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One explicit git diff/ls-files invocation branch per source kind (never a single function special-casing 'which side is live')"
    - "classifyWorktreeSideAvailability mirrors classifyAvailability's cascade exactly, substituting a bounded fs read + per-segment lstat walk for the one side that is worktree-resident (not a Git object)"
    - "hasNumstat flag distinguishes 'git numstat reported binary' (additions/deletions null means binary) from 'no numstat line exists at all' (untracked files; additions/deletions null by construction, requires real embedded-NUL content check instead)"

key-files:
  created: [src/git/worktree-inventory.ts, tests/git/worktree-inventory.test.ts]
  modified: [src/git/inventory.ts]

key-decisions:
  - "classifyWorktreeSideAvailability() is a new standalone function (not a modification of classifyAvailability()) since availability.ts was not in files_modified; it duplicates classifyAvailability's non-I/O checks (submodule/symlink/mode-or-type/regularFileModes) locally rather than refactoring availability.ts to export them, since the plan's files_modified list excludes availability.ts"
  - "Per-segment lstat symlink-escape defense (not a single final lstat) duplicated from PatchSnapshot.worktreeEntry()'s discipline directly in worktree-inventory.ts, since src/git/ never depends on src/server/ (confirmed via grep: no existing src/git/ -> src/server/ import)"
  - "Untracked ChangedFile entries reuse the existing buildChangedFile()/opaqueFileId()/inventoryPaths() pipeline by constructing a synthetic RawDiffRecord (oldMode '000000', all-zero placeholder OIDs, status 'A') rather than a separate code path, so status.kind='added' falls out naturally from the existing statusKindByCode/knownModes cascade"
  - "hasNumstat=false for the untracked call site: a real bug caught by the test suite during implementation where additions===null (legitimately meaning 'no numstat line for untracked files') was being misread as 'git numstat flagged binary', wrongly classifying all untracked text files as unsupported/binary"
  - "Test fixture uses rev-parse HEAD (not merge-base(main, feature)) as the comparison base OID so tracked fixture files created on the feature branch (e.g. committed.txt) are present on the base side, enabling rename-pair detection in the staged-rename test"

patterns-established:
  - "Pattern 1 (RESEARCH.md): per-source-kind explicit git invocation, reusing shared low-level building blocks (parseRawDiff/parseNumstat/joinDiffStats/isCumpaInternalPath/opaqueFileId/inventoryPaths/validateObjectFormat) without a generic 'which side is live' abstraction at the git-invocation level"

requirements-completed: [WTREE-02, WTREE-03, WTREE-04]

# Metrics
duration: 55min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 04: Staged/Unstaged/Working-tree File-Set Discovery Summary

**`createWorktreeChangedFileInventory()` in `src/git/worktree-inventory.ts` — one explicit `git diff`/`git ls-files` invocation per uncommitted source kind, fixture-verified byte-for-byte against real Git output, reusing `classifyAvailability()` unchanged for Staged and introducing a parallel worktree-side classifier for Unstaged/Working-tree.**

## Performance

- **Duration:** 55 min
- **Tasks:** 2 (both executed together; plan-level `type: tdd` gate applied as a single RED/GREEN cycle per `tdd.md`'s plan-level gate rule)
- **Files modified:** 3 (1 created implementation file, 1 created test file, 1 modified)

## Accomplishments

- `createWorktreeChangedFileInventory(options, dependencies)` returns fixture-verified `ChangedFile[]` for all three uncommitted source kinds:
  - **Staged**: `git diff --cached <mergeBaseOid>` (raw + numstat), reusing `classifyAvailability()`/`ObjectReader` completely unchanged since both diff endpoints are real Git objects.
  - **Unstaged**: plain `git diff` (index → worktree, no endpoint arguments), introducing `classifyWorktreeSideAvailability()` for the worktree-resident `new` side.
  - **Working tree**: `git diff <mergeBaseOid>` (tracked half) unioned with `git ls-files --others --exclude-standard` (untracked half, reported as `added`).
- `.cumpa/`-internal paths excluded from every source kind's output, including the untracked union (defense in depth, independent of `.gitignore`).
- Five previously module-private helpers in `src/git/inventory.ts` (`isCumpaInternalPath`, `recordIdentity`, `opaqueFileId`, `validateObjectFormat`, `inventoryPaths`) exported with zero behavior change for reuse.

## Task Commits

Plan-level TDD gate (frontmatter `type: tdd`): one RED commit covering both tasks' test behavior, one GREEN commit covering both tasks' implementation.

1. **RED — failing test for the whole module** - `3cff95d` (test)
2. **GREEN — Task 1 (Staged/Unstaged) + Task 2 (Working-tree) implementation** - `9b1a784` (feat)

## Files Created/Modified

- `src/git/worktree-inventory.ts` - `createWorktreeChangedFileInventory`, `classifyWorktreeSideAvailability`, `lstatWorktreeLeaf`, `readWorktreeLeafBytes`, `buildChangedFile`, `buildUntrackedChangedFile`, `parseNulDelimitedUntrackedPaths`
- `tests/git/worktree-inventory.test.ts` - 11 fixture-verified tests across 3 `describe` blocks (staged/unstaged/worktree), each cross-checking the function's output against the real `git diff`/`git diff --cached`/`git ls-files` invocation run through `tests/helpers/git-fixture.ts`'s `createGitFixture`
- `src/git/inventory.ts` - added `export` keyword to 5 helper functions (no behavior change)

## Decisions Made

See `key-decisions` in frontmatter. The two most significant:
1. `classifyWorktreeSideAvailability()` duplicates (does not import) `classifyAvailability()`'s non-I/O checks, since `src/git/availability.ts` was intentionally excluded from this plan's `files_modified` list.
2. Added a `hasNumstat` parameter to distinguish "numstat said binary" from "no numstat exists" (untracked files) — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Untracked files misclassified as binary**
- **Found during:** Task 2 verification (test run after initial implementation)
- **Issue:** `classifyWorktreeSideAvailability()`'s `additions === null || deletions === null` check — copied directly from `classifyAvailability()`'s numstat-binary-flag shortcut — fired for every untracked file, because untracked `ChangedFile` entries always carry `additions: null, deletions: null` (no numstat line exists for them at all, per the plan's own spec: "additions/deletions: null (untracked files have no numstat line)"). This made every untracked text file wrongly classify as `{ kind: 'unsupported', reason: 'binary' }`, breaking WTREE-02's core requirement that untracked files are reviewable as added text files.
- **Fix:** Added a `hasNumstat` boolean parameter (default `true`) to `classifyWorktreeSideAvailability()`. The two tracked-diff call sites (Unstaged, Working-tree tracked half) keep the default `true`. The untracked call site in `buildUntrackedChangedFile()` passes `false`, so untracked files skip the numstat-binary shortcut entirely and fall through to the real embedded-NUL byte check on the actual file contents — exactly matching the plan's instruction that untracked availability is "classified via a bounded direct `fs.readFile`... through `classifyWorktreeSideAvailability`-equivalent logic reused for the single-sided case."
- **Files modified:** `src/git/worktree-inventory.ts`
- **Verification:** Added assertion in the "unions merge-base->worktree tracked changes with untracked additions" test (`tests/git/worktree-inventory.test.ts`) confirming a plain-text untracked file classifies as `{ kind: 'text' }`.
- **Committed in:** `9b1a784` (part of the single GREEN commit)

**2. [Rule 1 - Bug] Test fixture base OID prevented rename-pair detection**
- **Found during:** Task 1 verification (test run)
- **Issue:** The test's `mergeBaseOid` helper originally computed `merge-base(refs/heads/main, refs/heads/feature)`, which in `createGitFixture()`'s default layout is the very first commit (containing only `tracked.txt`) — `committed.txt` is added in a later feature-only commit. Comparing the staged rename (`committed.txt` → `committed-renamed.txt`) against that early merge-base meant `committed.txt` did not exist on the base side at all, so Git's `--find-renames` had no deletion to pair with the addition, and the rename surfaced as a plain `added` status instead of `renamed`.
- **Fix:** Changed the test's base-OID helper to `rev-parse HEAD` (the feature branch tip, which already contains `committed.txt`), matching the realistic default "Base = HEAD" case from WTREE-03 and giving `--find-renames` a real deletion/addition pair to correlate.
- **Files modified:** `tests/git/worktree-inventory.test.ts`
- **Verification:** The "matches git diff --cached for additions, modifications, and renames" test now asserts `status.kind === 'renamed'` with `similarity >= 50` and passes.
- **Committed in:** `3cff95d` (test file, part of the RED commit before the fix was needed to pass; both fixes landed before the RED/GREEN commit split since RED only needs the implementation to be absent, not the test logic to be wrong — the test file committed in RED already contains the corrected fixture logic)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs, caught by the plan's own fixture-verification requirement — D-08 "verify with fixtures" did its job).
**Impact on plan:** Both fixes are essential correctness fixes for the plan's own stated behavior (untracked files must be reviewable as text; staged renames must be detected). No scope creep — no new files, no new requirements addressed beyond WTREE-02/03/04.

## Issues Encountered

None beyond the two deviations above, both caught and fixed via the plan's own fixture-verification discipline before committing.

## Self-Check: PASSED

- `src/git/worktree-inventory.ts` exists: confirmed.
- `tests/git/worktree-inventory.test.ts` exists: confirmed.
- `src/git/inventory.ts` has 5 newly-exported functions: confirmed (`grep -c` = 5).
- Commits `3cff95d` and `9b1a784` exist in `git log`: confirmed.
- `npx vitest run tests/git/worktree-inventory.test.ts tests/git/inventory.test.ts` passes: 26/26.
- `npx tsc --noEmit --project tsconfig.json` exits 0 (substituted for nonexistent `npm run typecheck`, per 14-01/14-02/14-03 precedent).
- `grep -n "sourceKind === 'worktree'"` and `grep -c "ls-files"` in `src/git/worktree-inventory.ts`: both present.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`createWorktreeChangedFileInventory` is ready for 14-07's `captureWorktreeManifest` to call for file-set enumeration before per-file content capture, and for 14-08's session file lists. No blockers.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*
