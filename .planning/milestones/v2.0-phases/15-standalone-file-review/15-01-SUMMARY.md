---
phase: 15-standalone-file-review
plan: 01
subsystem: api
tags: [git, pathspec, cli, security, file-resolution]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "buildUntrackedChangedFile / lstatWorktreeLeaf per-segment lstat symlink discipline in src/git/worktree-inventory.ts; ChangedFile contract shape"
provides:
  - "resolveStandaloneArguments(): per-argument git ls-files resolution + dedupe + traversal/absolute-outside rejection + raw/resolved caps"
  - "classifyStandaloneGitState(): one git status --porcelain=v1 call classifying untracked/modified-uncommitted/unchanged"
  - "createStandaloneChangedFileInventory(): one ChangedFile (status.kind='added') per resolved path with standaloneGitState attached"
  - "buildUntrackedChangedFile exported from src/git/worktree-inventory.ts for reuse outside that module"
affects: [15-02, 15-03, cli-positional-args, standalone-session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-argument git ls-files call (not one combined call) for individually attributable FILE-02 errors"
    - "Git's own exit-128 fatal pathspec-outside-repository rejection is the FILE-04 traversal/absolute-outside defense; never pre-sanitize the argument string in JS"
    - "check-ignore zero-match probe distinguishes '.gitignore'd' vs 'no such file' errors, and also absorbs Git's own 'pathspec is beyond a symbolic link' exit-128 fatal (undocumented in RESEARCH.md, discovered empirically) by collapsing any non-zero check-ignore exit to 'not ignored'"

key-files:
  created:
    - src/git/standalone-resolution.ts
    - tests/git/standalone-resolution.test.ts
  modified:
    - src/git/worktree-inventory.ts

key-decisions:
  - "buildUntrackedChangedFile exported (no behavior change) rather than reimplemented, per plan's explicit single-authority directive for symlink/mode/availability classification"
  - "standaloneGitState attached as a plain extra property on the schema-validated ChangedFile object (StandaloneChangedFile = ChangedFile & { standaloneGitState }), not via ChangedFileSchema.parse, since the schema does not yet accept that field in this plan"
  - "MAX_RAW_STANDALONE_ARGUMENTS (256) and MAX_RESOLVED_STANDALONE_FILES (10,000) duplicated as local literals mirroring MAX_PATHSPEC_COUNT and MAX_SNAPSHOT_FILES respectively, per plan's explicit cross-module-dependency constraint"

patterns-established:
  - "Standalone Git-state computation is a sibling field to ChangedFile, never folded into ChangedFileStatusKind"

requirements-completed: [FILE-01, FILE-02, FILE-04]

# Metrics
duration: 35min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 01: Standalone Argument Resolution and Inventory Summary

**Per-argument `git ls-files`/`check-ignore`/`status` orchestration turning `cumpa <path|glob>...` CLI arguments into a deduplicated, capped, repository-relative file list with Git-state and `ChangedFile` classification — Git's own pathspec engine is the sole traversal/absolute-outside/symlink defense, never reimplemented in JS.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-10-31T08:40:00Z
- **Completed:** 2026-10-31T09:15:00Z
- **Tasks:** 3 (RED / GREEN / REFACTOR)
- **Files modified:** 3 (1 created, 1 created test, 1 modified)

## Accomplishments
- `resolveStandaloneArguments()` resolves literal/directory/glob arguments per real Git pathspec semantics (verified against real `git` subprocess fixtures, not mocks), dedupes overlapping matches, and enforces both the 256-raw-argument and 10,000-resolved-file caps before/after resolution.
- Traversal (`../`), absolute-path-outside, and embedded-escape (`sub/../../outside.txt`) arguments all fail via Git's own fatal exit-128 pathspec rejection, translated into a per-argument error naming the literal argument text — no JS-side path sanitization.
- Explicitly `.gitignore`'d literal arguments produce a distinct, `.gitignore`-mentioning error from genuinely nonexistent arguments.
- A symlink named directly resolves as its own entry (never followed); a symlinked directory is never traversed to discover files inside it, and Git's own "pathspec is beyond a symbolic link" exit-128 fatal (raised by `check-ignore`, not `ls-files`, on the zero-match probe) is handled gracefully rather than leaking a raw Git error.
- `classifyStandaloneGitState()` and `createStandaloneChangedFileInventory()` reuse the existing `buildUntrackedChangedFile`/`lstatWorktreeLeaf` per-segment-`lstat` symlink discipline (now exported, zero behavior change) rather than adding a third implementation.
- 17 real-Git-fixture + 2 injected-runner-double tests, all passing; `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for resolution, traversal/symlink/ignore rejection, and caps** - `a537a37` (test)
2. **Task 2 (GREEN): Implement resolveStandaloneArguments, classifyStandaloneGitState, createStandaloneChangedFileInventory** - `274a5e4` (feat)
3. **Task 3 (REFACTOR): Dedupe argument-resolution error paths and confirm cap/defense-in-depth coverage** - `52be782` (refactor)

_TDD tasks: test → feat → refactor, as expected._

## Files Created/Modified
- `src/git/standalone-resolution.ts` - New module: `resolveStandaloneArguments`, `classifyStandaloneGitState`, `createStandaloneChangedFileInventory`, `StandaloneGitState`/`StandaloneChangedFile` types
- `tests/git/standalone-resolution.test.ts` - Real-git-fixture coverage (17 tests) + 2 injected-`GitRunner`-double tests for `.git`/`.cumpa` defense-in-depth
- `src/git/worktree-inventory.ts` - Added `export` keyword to `buildUntrackedChangedFile` only (no logic change)

## Decisions Made
- See `key-decisions` in frontmatter. No `AskUserQuestion`-equivalent decision points were encountered during execution — the plan's own text fully specified behavior for every branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zero-match `check-ignore` probe did not account for Git's own exit-128 "pathspec is beyond a symbolic link" fatal**
- **Found during:** Task 2 (GREEN) — the `'escape-link/*'` symlinked-directory test failed with a raw, untranslated `GitRunnerError` message ("Git command exited with status 128") instead of the expected "did not match any file" error.
- **Issue:** `resolveOneArgument`'s zero-match branch only treated `check-ignore` exit code `1` as "not ignored"; any other exit code (including Git's own fatal rejection when a pathspec argument walks through a symlinked directory) was rethrown unhandled. `ls-files --others --exclude-standard` on a symlinked-directory glob correctly returns empty (confirmed empirically — the symlink is never traversed, per T-15-02), but the subsequent `check-ignore` zero-match probe on that same argument fatally exits 128 with `fatal: pathspec '...' is beyond a symbolic link` — a Git behavior not called out in RESEARCH.md's empirical notes, discovered during this task's own test run.
- **Fix:** Broadened the `check-ignore` catch to collapse *any* `GitRunnerError` with `kind === 'exit'` (not just `exitCode === 1`) to "not ignored" → the standard "did not match any file" error. Exit 0 (ignored) remains the only distinct outcome; non-`GitRunnerError` failures (spawn/timeout/abort) still propagate unchanged.
- **Files modified:** `src/git/standalone-resolution.ts`
- **Verification:** `node scripts/run-focused-vitest.mjs tests/git/standalone-resolution.test.ts` — the `'never traverses a symlinked directory...'` test passes with the expected `/did not match any file/` error; full suite green (15/15 at that point, 17/17 after Task 3).
- **Committed in:** `274a5e4` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Glob cross-directory test assertion did not account for the shared fixture's default committed files**
- **Found during:** Task 2 (GREEN) — the `'*.txt'` glob test failed because `createGitFixture()`'s default setup unconditionally seeds `tracked.txt` and `committed.txt` at the repository root, which the strict-equality assertion didn't anticipate.
- **Issue:** Test assertion was `toEqual(['a.txt', 'sub/b.txt'])`, but the resolver correctly also matched the fixture's pre-existing `tracked.txt`/`committed.txt`/`untracked.txt` (all legitimately `.txt` files at/under the root) — a test bug, not a resolver bug.
- **Fix:** Loosened the assertion to `toContain('a.txt')` + `toContain('sub/b.txt')`, matching the plan's own behavior wording ("assert it matches both a root-level and a nested file") rather than asserting exact fixture-dependent membership.
- **Files modified:** `tests/git/standalone-resolution.test.ts`
- **Verification:** Same test run as above; test passes.
- **Committed in:** `274a5e4` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs discovered and fixed during the task's own RED→GREEN cycle, before that task's commit). **Impact:** Both fixes are within Task 2's own scope (making the GREEN implementation/tests correct); no scope creep, no changes to Task 1's or Task 3's committed content.

## Issues Encountered
None beyond the two auto-fixed items above, which were resolved within the same task before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `resolveStandaloneArguments`, `classifyStandaloneGitState`, `createStandaloneChangedFileInventory` are exported and ready for Plan 15-02 (contract/schema widening for `standaloneGitState`) and Plan 15-03 (CLI wiring + snapshot capture integration) to build on.
- No blockers. Note for Plan 15-02: `StandaloneChangedFile = ChangedFile & { readonly standaloneGitState: StandaloneGitState }` is currently a local intersection type in `src/git/standalone-resolution.ts` because `ChangedFileSchema` does not yet accept the field — once Plan 15-02 widens the schema, this module's return type may be revisited (not required to change; the intersection type still typechecks against a widened `ChangedFile`).

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/git/standalone-resolution.ts
- FOUND: tests/git/standalone-resolution.test.ts
- FOUND: .planning/phases/15-standalone-file-review/15-01-SUMMARY.md
- FOUND commits: a537a37 (test), 274a5e4 (feat), 52be782 (refactor), baea595 (docs) — all present via `git log --oneline --all --grep="15-01"`
