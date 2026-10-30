---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 06
subsystem: cli
tags: [picker, inquirer, uncommitted-source, typescript]

# Dependency graph
requires: []
provides:
  - "Uncommitted group (Staged/Unstaged/Working tree) prepended to the interactive Base prompt in src/cli/picker.ts"
  - "pickSource(options, dependencies): Promise<PickedSource> — new top-level picker entry point"
  - "PickedSource, UncommittedSourceSelection, UncommittedRowKind exported types"
affects: [14-09-cli-run-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "includeUncommittedGroup opt-in flag on BuildSourceSearchOptions (default false) keeps pickOrderedSources' own internal base-prompt loop — including its post-Back re-prompt — from ever showing the Uncommitted group, so pickOrderedSources stays behaviorally unchanged in every code path, not just the ones a caller happens to exercise"
    - "pickSource runs its own first Base prompt, then delegates to the unchanged pickOrderedSources via options.initialBase for the committed Base→Head fallthrough, avoiding any duplication of the Head-prompt logic"

key-files:
  created: []
  modified:
    - src/cli/picker.ts
    - tests/cli/selection.test.ts

key-decisions:
  - "Gated the Uncommitted group behind a new includeUncommittedGroup flag (not bare options.role === 'base') so pickOrderedSources' internal base-reprompt (reachable via the committed flow's Back action) never re-shows Uncommitted rows — avoids a reachable 'Base selection did not identify an available source' crash if a user selected an uncommitted sentinel from that nested prompt, and keeps pickOrderedSources byte-for-byte unchanged across all its own code paths"
  - "pickSource falls back to pickOrderedSources whenever options.initialBase or options.initialHead is already supplied (recovery scenarios), preserving the existing 'Head retained'/'Base retained' prompt-copy fidelity instead of re-deriving it"
  - "Second (post-Uncommitted-selection) Base prompt reuses the same sourceForPrompt/buildSourceSearchItems machinery with includeUncommittedGroup left at its default false, so it shows the normal branch/worktree list only, per the UI-SPEC"

requirements-completed: [WTREE-01, WTREE-03]

duration: 25min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 06: Uncommitted Source Review & Frozen Snapshots — Picker Groundwork Summary

**Added a Staged/Unstaged/Working tree group to the CLI's interactive Base prompt and a new `pickSource()` entry point returning a `PickedSource` discriminated union, with Unstaged skipping the second prompt and Staged/Working tree advancing to a HEAD-preselected Base prompt.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-30T18:46:00Z
- **Completed:** 2026-10-30T19:11:01Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `buildSourceSearchItems` prepends an `Uncommitted` separator plus `Staged`/`Unstaged`/`Working tree` candidate rows ahead of `Local branches`, gated by a new opt-in `includeUncommittedGroup` flag on `BuildSourceSearchOptions`.
- New exported `pickSource(options, dependencies): Promise<PickedSource>` runs the Base prompt itself, branches on the three `cumpa:uncommitted:*` sentinel ids per D-01/D-05, and falls through unchanged into `pickOrderedSources` for any normal branch/worktree selection.
- New exported types `PickedSource`, `UncommittedSourceSelection`, `UncommittedRowKind`.
- `pickOrderedSources`'s exported signature and `OrderedSources` return shape are untouched — confirmed by `git diff` showing zero changed lines on its declaration.
- Extended `tests/cli/selection.test.ts` with a new `pickSource / Uncommitted sources` describe block (4 tests) covering: Uncommitted group ordering/content on the first Base prompt, Unstaged's immediate no-second-prompt return, Staged's HEAD-preselected second prompt, and the unchanged committed two-step flow for a normal branch.

## Task Commits

Each task was committed atomically:

1. **Task 1: Uncommitted group in buildSourceSearchItems and the PickedSource type** - `626b6c9` (feat)

_Note: this task has no `tdd="true"` attribute and no `<behavior>` block (confirmed via `gsd-tools query task.is-behavior-adding` → `false`), so it followed the standard single-commit-per-task flow, not RED/GREEN TDD discipline._

## Files Created/Modified
- `src/cli/picker.ts` - Added `UNCOMMITTED_ROW_IDS`/`UNCOMMITTED_ROW_KIND_BY_ID`/`UNCOMMITTED_BASE_PROMPT` constants, `includeUncommittedGroup` on `BuildSourceSearchOptions`, `preselectedBaseId` on `PickOrderedSourcesOptions`, `UncommittedRowKind`/`UncommittedSourceSelection`/`PickedSource` exported types, the conditional Uncommitted-group prepend in `buildSourceSearchItems`, and the new `pickSource()` function.
- `tests/cli/selection.test.ts` - Added `pickSource` to the picker import and a new `pickSource / Uncommitted sources` describe block with 4 tests.

## Decisions Made

See `key-decisions` in frontmatter. In short: the Uncommitted group's visibility is controlled by an explicit `includeUncommittedGroup` opt-in flag rather than bare `options.role === 'base'`, so that `pickOrderedSources`'s own internal base-prompt loop (reached directly, or via its Back action from the Head prompt) never shows the Uncommitted rows and therefore can never hit the "Base selection did not identify an available source" error for an uncommitted sentinel id reaching that nested loop. `pickOrderedSources` itself required zero code changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan's literal `npm run typecheck` verification command does not exist**
- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>`/acceptance criteria specify `npm run typecheck`, but `package.json` has no `typecheck` script (only `typecheck:web`, `typecheck:tests:node`, `typecheck:tests:web`, `typecheck:tests`). Running `npm run typecheck` fails with "Missing script".
- **Fix:** Used the project's actual equivalent, `npm run typecheck:tests:node` (`tsc --noEmit --project tsconfig.test.json`), which is the only script whose `include` covers both `src/cli/**/*.ts` and `tests/cli/**/*.ts` — i.e. both files this task modified. It passed with zero errors.
- **Files modified:** none (verification-only; no `package.json` script added, since inventing a `typecheck` alias was not requested and would be an unrelated architecture change).
- **Verification:** `npm run typecheck:tests:node` exits `0`.
- **Committed in:** n/a (verification-only deviation, no code change)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing npm script substituted with its real equivalent).
**Impact on plan:** No scope creep; the substituted command type-checks strictly more of the affected surface (both `src/cli/picker.ts` and `tests/cli/selection.test.ts`) than a literal `tsc --noEmit -p .` would have covered for the test file.

## Issues Encountered
- Mid-task, an exploratory `npx prettier --check` run revealed the repository has no Prettier config (`.prettierrc*`/`prettier.config.*`/`package.json#prettier` all absent) and no lint/format npm script, yet consistently uses single-quoted strings throughout. An unconfigured `npx prettier --write` run would have rewritten the whole file to double-quoted strings, diverging from the established convention — this was caught before committing, the change was reverted with `git checkout --`, and the task's edits were cleanly reapplied from scratch. Final commit contains only the intended single-quote-consistent diff; no prettier run was committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `pickSource()` and `PickedSource` are ready for 14-09 (`runCli` in `src/cli/run.ts`) to wire as the picker's new entry point, branching on `PickedSource.kind` ('committed' keeps today's `createComparisonLaunchDescriptor` flow; 'uncommitted' routes to the new uncommitted launch path).
- `preselectedBaseId` on `PickOrderedSourcesOptions` is ready for 14-09's caller to populate with the resolved current-HEAD/current-checkout candidate id before calling `pickSource()`.
- No blockers for Wave 1 completion; this was the final plan (14-01 through 14-06) in Wave 1.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

- FOUND: src/cli/picker.ts (modified, contains `export type PickedSource`, `export async function pickSource`)
- FOUND: tests/cli/selection.test.ts (modified, contains `pickSource / Uncommitted sources` describe block)
- FOUND: commit 626b6c9 in `git log --oneline --all`
- `npx vitest run tests/cli/selection.test.ts` — 17/17 passed
- `npm run typecheck:tests:node` — exit 0
