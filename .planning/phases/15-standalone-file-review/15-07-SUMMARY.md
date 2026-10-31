---
phase: 15-standalone-file-review
plan: 07
subsystem: cli
tags: [commander, cli, standalone, git]

# Dependency graph
requires:
  - phase: 15-standalone-file-review (15-01)
    provides: resolveStandaloneArguments, classifyStandaloneGitState, createStandaloneChangedFileInventory in src/git/standalone-resolution.ts
  - phase: 15-standalone-file-review (15-02)
    provides: UncommittedScopeSchema widened with sourceKind 'standalone' and standaloneArguments field
  - phase: 15-standalone-file-review (15-06)
    provides: createStandaloneSessionApp in src/server/app.ts
provides:
  - validateStandaloneExclusivity(paths, cliOptions) in src/cli/run.ts — rejects positional paths combined with --staged/--unstaged/--worktree/--base
  - launchStandaloneSession(paths, dependencies, options) in src/cli/run.ts — resolves args, classifies Git state, builds inventory, launches createStandaloneSessionApp, prints loopback URL, opens browser
  - `.argument('[paths...]', ...)` on the root Commander command, dispatched before --staged/--unstaged/--worktree/--base/picker flow
affects: [15-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "launchStandaloneSession mirrors launchUncommittedSession's output/support/openBrowser/revealDraftFile/activeGit/shutdown scaffolding exactly, substituting the standalone resolution pipeline (resolveStandaloneArguments → classifyStandaloneGitState → createStandaloneChangedFileInventory) for the worktree-diff pipeline, and omitting the base/merge-base resolution block and the D-19 recovery-candidate lookup (both standalone-inapplicable, per 15-06 precedent)"

key-files:
  created: []
  modified:
    - src/cli/run.ts
    - tests/cli/errors.test.ts

key-decisions:
  - "validateStandaloneExclusivity throws a single combined error message naming all four conflicting flags at once (not per-flag), matching the plan's exact precedent string from validateUncommittedFlags — avoids multiple error messages when several flags conflict simultaneously"
  - "Dispatch order in the Commander .action() callback: paths.length > 0 check (and its validateStandaloneExclusivity + launchStandaloneSession call) runs first and returns before the existing try { validateUncommittedFlags(cliOptions) } block is ever reached, so `cumpa` with zero positional args is provably unaffected by construction, not just by convention"
  - "registerUncommittedRefreshKeypress reused unchanged for standalone sessions (no standalone-specific refresh keypress handler) — it only depends on authority/token/output/shutdown, none of which differ for a standalone session, matching the plan's explicit instruction"

patterns-established: []

requirements-completed: [FILE-01, FILE-02, FILE-04]

# Metrics
duration: ~25min
completed: 2026-10-31
status: complete
---

# Phase 15: Standalone File Review Summary (Plan 07)

**`cumpa <path|glob>...` is now a real CLI entry point: a new Commander `[paths...]` positional argument on the root command dispatches to `launchStandaloneSession`, which resolves arguments, classifies Git state, builds the standalone changed-file inventory, and launches `createStandaloneSessionApp` — wiring together every piece built in Plans 15-01 through 15-06.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `validateStandaloneExclusivity` in `src/cli/run.ts`: rejects positional paths combined with `--staged`/`--unstaged`/`--worktree`/`--base` with one clear error, exact-precedent shape to `validateUncommittedFlags`
- `launchStandaloneSession` in `src/cli/run.ts`: full standalone session launch — `resolveStandaloneArguments` → `classifyStandaloneGitState` → `createStandaloneChangedFileInventory` → `UncommittedScopeSchema.parse({sourceKind:'standalone', standaloneArguments, ...})` → `createStandaloneSessionApp` → bind security → print loopback URL → open browser → register refresh keypress, with any thrown resolution error short-circuiting into the existing `catch` block before any app/listener/browser work happens
- Root `Command` gains `.argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')`; the `.action()` callback dispatches to standalone handling before the existing `--staged`/`--unstaged`/`--worktree`/picker flow, leaving that flow completely unreached when paths are given and completely unaffected when they are not

## Task Commits

1. **Task 1: validateStandaloneExclusivity** - `3957d0e` (test, TDD RED) + `a74c2de` (feat, TDD GREEN)
2. **Task 2: launchStandaloneSession and Commander positional-argument wiring** - `b9e6b06` (feat)

**Plan metadata:** (this summary's own commit)

## Files Created/Modified
- `src/cli/run.ts` - `validateStandaloneExclusivity`, `launchStandaloneSession`, `OrdinaryActionDependencies.createStandaloneSessionApp` field, `../git/standalone-resolution.js` import, `createStandaloneSessionApp`/`CreateStandaloneSessionAppOptions` added to the `../server/app.js` import, `.argument('[paths...]', ...)` and dispatch wiring on the root `Command`
- `tests/cli/errors.test.ts` - `validateStandaloneExclusivity` unit coverage (empty paths, no-conflict paths, each of the four conflicting flags individually, and a combined-flags single-throw case)

## Decisions Made
- See `key-decisions` in frontmatter above.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

During the Commander-wiring edit, an intermediate hashline edit misapplied a no-op anchor and briefly corrupted the `launchUncommittedSession(...)` call's closing parenthesis inside the `.action()` callback (introduced a stray `try {` where `);` belonged). Caught immediately via the edit tool's own syntax-error warning, re-read the region, and corrected it in a follow-up edit before running any verification — `npx tsc --noEmit` and the full `errors.test.ts` suite both confirm the final state is correct. No commit was made in the broken intermediate state.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `cumpa <path|glob>...` is now a fully wired, launchable CLI entry point end-to-end (resolution → Git-state classification → inventory → session app → browser).
- Plan 15-08 (next in sequence) can build e2e coverage against this real CLI surface.
- No blockers.

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*
