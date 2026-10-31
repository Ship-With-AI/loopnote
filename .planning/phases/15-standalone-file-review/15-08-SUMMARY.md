---
phase: 15-standalone-file-review
plan: 08
subsystem: testing
tags: [playwright, e2e, cli, standalone, provenance, sha256]

# Dependency graph
requires:
  - phase: 15-standalone-file-review (15-01 through 15-06)
    provides: resolveStandaloneArguments/classifyStandaloneGitState/createStandaloneChangedFileInventory, widened UncommittedScope contracts, WorktreeSnapshot standalone capture/refresh, buildReviewExportV4/ReviewExportV4Schema, createStandaloneCapabilityRegistry/createStandaloneSessionApp
  - phase: 15-standalone-file-review (15-07)
    provides: launchStandaloneSession and `cumpa <path|glob>...` Commander positional-argument CLI wiring
provides:
  - "tests/e2e/standalone-review.spec.ts — full launch→comment→export happy path plus all six FILE-02/FILE-04 negative-path Playwright cases, run against the real packaged `dist/bin/cumpa.mjs` binary"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "startGeneratedStandaloneCli generalizes startGeneratedUncommittedCli's packed-CLI spawn harness: the flags array becomes a raw argv array so the same function spawns pure-positional-path invocations and flag+path mode-exclusivity invocations alike"
    - "waitForRejectionWithoutLoopbackUrl inverts waitForLoopbackUrl's polling loop for pre-launch rejection assertions: polls until the child process exits while asserting the loopback-URL regex never matches at any point, rather than racing a bare timeout"

key-files:
  created:
    - tests/e2e/standalone-review.spec.ts
  modified: []

key-decisions:
  - "Symlink-escape test places the symlink at fixture.root, not fixture.nestedCwd as the plan's <action> text literally suggested — resolveOneArgument (src/git/standalone-resolution.ts) always runs git with { cwd: repositoryRoot }, never the CLI process's own working directory, so a symlink under nestedCwd would sit two directories away from any pathspec git actually evaluates and the test would pass for the wrong reason (a trivial nonexistent-path outcome, never touching the real symlink-beyond-defense code path). Verified against tests/git/standalone-resolution.test.ts's own makeStandaloneFixture, which places its escape-link fixture at fixture.root for the same reason."
  - "Traversal test ('../outside.txt') creates the outside file one directory above fixture.root (dirname(fixture.root)), not above fixture.nestedCwd, for the identical cwd-is-always-repositoryRoot reason — confirmed empirically with a standalone `git ls-files -- ../outside.txt` probe before writing the assertion."
  - "Export provenance is read from disk (review.json under .cumpa/exports/<reviewKey>/, resolved via the /api/export response's files[0].path) rather than asserted against the HTTP response body, because StandaloneExportReviewResultSchema's response shape only carries { reviewKey } — the full schemaVersion-4 document with originalArguments/resolvedPaths/fileDigests only exists in the written file, matching 15-08's mandate to verify the actual exported document."

patterns-established: []

requirements-completed: [FILE-01, FILE-02, FILE-03, FILE-04, FILE-05]

# Metrics
duration: ~50min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 08: Standalone File Review E2E Capstone Summary

**New `tests/e2e/standalone-review.spec.ts` proves the entire Phase 15 pipeline end-to-end against the real packaged `cumpa` CLI binary: launch → single-pane comment → schemaVersion-4 export with byte-exact sha256 provenance, plus all six FILE-02/FILE-04 pre-launch rejection classes — 7/7 tests passing.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3 completed
- **Files modified:** 1 (new file)

## Accomplishments
- Happy-path test: `cumpa tracked.txt src/added.ts` launches the packaged CLI, the browser shows `STANDALONE` in the identity banner with no `BASE`/`HEAD` endpoints, both files render single-pane full width, a comment is added via the real `/api/draft/mutations` endpoint, and `Export review` produces a `schemaVersion: 4` `review.json` on disk whose `standalone.originalArguments`/`resolvedPaths`/`fileDigests` are verified — the `sha256` digests independently recomputed from the actual on-disk file bytes at launch time, not trusted from the export's own claim (T-15-21 mitigation).
- Three FILE-02 negative tests: a nonexistent-path argument, a `.gitignore`'d argument, and `--worktree` combined with a positional path each exit the real packaged CLI process with code 1, print the expected error substring, and never print a loopback URL.
- Three FILE-04 negative tests: `../outside.txt` traversal, an absolute path under `os.tmpdir()`, and a symlinked-directory escape (`escape-link/secret.txt`) each exit nonzero with no loopback URL — the symlink case specifically exercises Git's own exit-128 "pathspec is beyond a symbolic link" defense via `check-ignore`, collapsing to the "did not match any file" outcome (T-15-22 mitigation).
- All 7 tests pass together in one `playwright test tests/e2e/standalone-review.spec.ts` run (11.6s), against the real `tar`-packed, extracted, spawned-as-a-child-process `dist/bin/cumpa.mjs` — not source, not mocks.

## Task Commits

1. **Task 1: Happy-path spec (launch, comment, export, provenance)** + **Task 2: FILE-02 negatives** + **Task 3: FILE-04 negatives** — all three tasks landed in a single commit `9b45fa6` (test-only file, written and verified as one coherent spec rather than three incremental partial-file states, since Playwright spec files are not independently runnable until the shared harness functions at the top of the file exist)

**Plan metadata:** (this summary's own commit)

## Files Created/Modified
- `tests/e2e/standalone-review.spec.ts` - New Playwright e2e spec: packed-CLI harness (`startGeneratedStandaloneCli`, `waitForLoopbackUrl`, `waitForRejectionWithoutLoopbackUrl`, `stopGeneratedCli`), UI helpers (`openGeneratedStandaloneReview`, `activateSinglePaneLine`, `openReviewNotes`), 1 happy-path test, 6 negative-path tests

## Decisions Made
See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Symlink-escape and traversal fixture placement corrected from the plan's literal `nestedCwd` suggestion**
- **Found during:** Task 3 (writing the FILE-04 negative tests), confirmed via empirical `git ls-files`/`check-ignore` probes before writing assertions
- **Issue:** The plan's `<action>` text for the symlink-escape test says to create the symlink via `symlinkSync(targetDir, join(fixture.nestedCwd, 'escape-link'))`. `resolveOneArgument` (`src/git/standalone-resolution.ts`) always invokes `git` with `{ cwd: repositoryRoot }`, never the CLI process's actual working directory (`fixture.nestedCwd`, which is spawned as the CLI's cwd but is irrelevant to argument resolution). A symlink placed under `nestedCwd` would sit outside the pathspec Git actually evaluates, so the test would still produce a "did not match any file" output — but for the trivial reason that the top-level path segment doesn't exist, never actually walking Git's pathspec engine through the symlinked directory. That would make the test pass without proving the T-15-22 mitigation it exists to prove.
- **Fix:** Placed the symlink at `fixture.root` (matching `tests/git/standalone-resolution.test.ts`'s own `makeStandaloneFixture` escape-link fixture, which uses the same placement for the same reason) and the outside-traversal file at `dirname(fixture.root)` for the identical reason. Verified both empirically with standalone `git ls-files -- ../outside.txt` / `git ls-files -- <absolute-outside-path>` / `git ls-files` + `git check-ignore` on a real symlinked-directory fixture, confirming exit-128 "outside repository" and the symlink-beyond "pathspec ... is beyond a symbolic link" (collapsing to "did not match any file") exactly as `src/git/standalone-resolution.ts` expects.
- **Files modified:** `tests/e2e/standalone-review.spec.ts`
- **Verification:** All three FILE-04 tests pass in 400-450ms each (fast — consistent with a real pre-launch rejection, not a hang); the symlink test specifically fails fast with the expected "did not match any file" substring.
- **Committed in:** `9b45fa6`

**2. [Rule 1 - Bug] Fixed `stopGeneratedCli`'s exit-event race for already-exited processes**
- **Found during:** Task 2, first full run — all three negative tests hung to the 90s per-test timeout instead of completing in under a second
- **Issue:** `stopGeneratedCli` (copied verbatim from `tests/e2e/uncommitted-review.spec.ts`, where it is only ever called on a still-running process) unconditionally attaches `events.once('exit', resolve)` and awaits it. In every negative-path test the generated CLI process self-exits (by design, before any server/browser work) well before `stopGeneratedCli` runs in the `finally` block — so the child's `'exit'` event has already fired by the time the listener attaches, and it never fires again. The `await promise` then hung until Playwright's `test.setTimeout(90_000)` killed the test.
- **Fix:** Guarded the `kill()` + `'exit'`-wait sequence behind the same `exitCode === null && signalCode === null` check already used to decide whether to call `kill()` at all — if the process already exited, `stopGeneratedCli` now skips straight to closing the output file descriptor instead of waiting for an event that already happened.
- **Files modified:** `tests/e2e/standalone-review.spec.ts`
- **Verification:** All 6 negative-path tests now complete in 270-450ms each instead of hanging to 90s; full 7-test suite runs in 11.6s.
- **Committed in:** `9b45fa6`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug fixes, both confined to the new test file this plan creates; neither touches production code).
**Impact on plan:** Both fixes were required for the spec to actually prove what the plan's `<behavior>`/`<threat_model>` sections require (a real symlink-defense exercise, and a test suite that completes rather than timing out). No scope creep beyond the single file `files_modified` declares.

## Issues Encountered
None beyond the two deviations above, both caught and fixed before the final full-suite run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 (Standalone File Review) is now proven end-to-end against the real packaged CLI: resolver, snapshot, capability registry, CLI wiring, and web UI all verified together by one spec, with all FILE-01 through FILE-05 requirements covered.
- `npm run build && playwright test tests/e2e/standalone-review.spec.ts` passes 7/7 (happy path + 6 negative-path cases) — the plan's exact `<verification>` command.
- No blockers. This is the phase's final plan (wave 5, capstone).

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*

## Self-Check: PASSED
- FOUND: tests/e2e/standalone-review.spec.ts
- FOUND: .planning/phases/15-standalone-file-review/15-08-SUMMARY.md
- FOUND commit 9b45fa6 via `git log --oneline --all --grep="15-08"`
- `npm run build && playwright test tests/e2e/standalone-review.spec.ts` — 7/7 passed (11.6s)
