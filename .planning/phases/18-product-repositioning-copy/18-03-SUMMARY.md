---
phase: 18-product-repositioning-copy
plan: 03
subsystem: cli
tags: [commander, cli-copy, positioning-copy, vitest]

# Dependency graph
requires:
  - phase: 18-product-repositioning-copy
    provides: "18-01's approved `18-COPY-DRAFT.md` (## Approval record) and 18-UI-SPEC.md's locked Dirty-source copy table — the sole sources of exact copy text this plan applies verbatim"
provides:
  - "`src/cli/run.ts`'s Commander `.description()` now reads the approved agent-produced-artifact framing instead of the old pinned-Git-comparisons-only wording"
  - "`src/domain/source.ts`'s `DIRTY_EXPLANATION` rewritten per 18-UI-SPEC.md's locked Dirty-source copy table — drops the 'staged, unstaged, and untracked bytes are ignored' enumeration, points at --worktree/--staged/--unstaged"
  - "Confirmed `src/cli/picker.ts`'s `BASE_PROMPT` needs no change — already reads 'compared' (Phase 17.1 fixed the old 'cumpad' verb form); Approval record locks this as 'unchanged — already compliant'"
  - "`tests/cli/selection.test.ts`/`tests/cli/help.test.ts` updated to pin the new strings"
affects: [18-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "help.test.ts normalizes stdout whitespace (`.replace(/\\s+/g, ' ')`) before asserting on long Commander description strings, since Commander's default help-text word-wrap (process.stdout.columns || 80) inserts line breaks inside strings longer than ~80 chars that a plain `toContain` would otherwise miss"

key-files:
  modified:
    - src/cli/run.ts
    - src/domain/source.ts
    - tests/cli/selection.test.ts
    - tests/cli/help.test.ts

key-decisions:
  - "DIRTY_EXPLANATION's exact final wording was taken from 18-UI-SPEC.md's locked Dirty-source copy table, not 18-COPY-DRAFT.md's '## CLI copy'/'## Dirty-source copy (reference only)' sections, which both drop the words 'its' and 'the' from the UI-SPEC version ('reviews committed HEAD only' / 'review uncommitted changes directly' vs UI-SPEC's 'reviews its committed HEAD only' / 'review the uncommitted changes directly'). This plan's own Task 1 read_first explicitly designates UI-SPEC as the authoritative source for this one string ('DIRTY_EXPLANATION's exact new value is already locked here, not in the draft'), so the UI-SPEC wording was applied verbatim."
  - "picker.ts's BASE_PROMPT was left untouched. The plan's action text (written before Phase 17.1 executed) assumed BASE_PROMPT still read '...changes will be cumpad from its merge base with head'. Phase 17.1 already fixed that to '...changes will be compared from its merge base with head', and 18-COPY-DRAFT.md's Approval record explicitly confirms this rewording as 'unchanged — already compliant, no cumpad verb form exists in current code.' No edit was made; Task 2's corresponding selection.test.ts BASE_PROMPT assertions (lines 254/256/364/366/368, already asserting 'compared') needed no change either."
  - "tests/cli/help.test.ts's description assertion normalizes stdout whitespace before `toContain`. The approved description string (97 chars) exceeds Commander's default ~80-column help-text wrap width, so the built CLI's --help output breaks it across two lines ('...uncommitted work, or\\nstandalone files'); a literal single-line `toContain` would fail even though the rendered text is correct. This is a plan-reality gap the 18-03-PLAN.md couldn't have anticipated since the old 46-char description never wrapped."

patterns-established: []

requirements-completed: [POS-02]

# Metrics
duration: 25min
completed: 2026-11-02
status: complete
---

# Phase 18 Plan 03: Product Repositioning Copy — CLI (run.ts/picker.ts/source.ts) Summary

**Applied the approved `--help` description and UI-SPEC-locked dirty-source explanation to the CLI, confirmed the picker's BASE_PROMPT already needed no change, and updated the two tests pinning these exact strings.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-11-02T15:47:00Z
- **Completed:** 2026-11-02T16:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `node dist/bin/loopnote.mjs --help` now prints "Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files" (approved Variant A) instead of the old pinned-Git-comparisons-only description.
- Dirty-worktree users now see `DIRTY_EXPLANATION`'s UI-SPEC-locked text pointing at `--worktree`/`--staged`/`--unstaged` instead of the old "Staged, unstaged, and untracked bytes are ignored" enumeration.
- Confirmed no CLI picker prompt verbs the product name — `BASE_PROMPT` already read "compared" (fixed in Phase 17.1), matching the Approval record's own "unchanged — already compliant" disposition.
- `tests/cli/selection.test.ts` and `tests/cli/help.test.ts` updated and green; full `tests/cli` directory (112 tests) and full `npm test` (853 tests, 81 files) both green.

## Task Commits

1. **Task 1: Apply run.ts/picker.ts/source.ts copy** - `39f0595` (feat)
2. **Task 2: Update the two unit tests pinning these strings** - `78ed5ba` (test)

**Plan metadata:** (this commit) `docs: complete 18-03`

## Files Created/Modified
- `src/cli/run.ts` - Commander `.description()` now the approved Variant A string
- `src/domain/source.ts` - `DIRTY_EXPLANATION` rewritten per UI-SPEC's locked table
- `tests/cli/selection.test.ts` - `confirmPinnedComparison` expected-output assertion updated for the new `DIRTY_EXPLANATION`
- `tests/cli/help.test.ts` - `--help` description assertion updated for the new string, whitespace-normalized to tolerate Commander's help-text line wrap

## Decisions Made
See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Normalized stdout whitespace in help.test.ts's description assertion**
- **Found during:** Task 2 verification (`node scripts/run-focused-vitest.mjs tests/cli/selection.test.ts tests/cli/help.test.ts`)
- **Issue:** The approved description string is 97 characters; Commander's default help formatter wraps help text at the terminal width (`process.stdout.columns || 80` under spawnSync's non-TTY pipe), so the built CLI's actual `--help` stdout contains a line break inside the string ("...uncommitted work, or\nstandalone files"). A literal single-line `toContain('...or standalone files')` assertion failed against this real, correct output.
- **Fix:** Changed the assertion to `expect(result.stdout.replace(/\s+/g, ' ')).toContain(...)`, collapsing any run of whitespace (including the wrap-induced newline) to a single space before matching, while keeping the exact approved word sequence pinned.
- **Files modified:** tests/cli/help.test.ts
- **Verification:** `node dist/bin/loopnote.mjs --help` manually confirmed to render the approved text (wrapped); `node scripts/run-focused-vitest.mjs tests/cli/selection.test.ts tests/cli/help.test.ts` passes (19/19).
- **Committed in:** 78ed5ba (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for the test to correctly verify the approved copy landed; no scope creep — no wording was changed, only how the test reads wrapped terminal output.

## Issues Encountered
- `18-COPY-DRAFT.md`'s own in-body "## CLI copy" and reference-only Dirty-source table disagree with `18-UI-SPEC.md`'s locked table by two words ("its", "the") in `DIRTY_EXPLANATION`. Resolved per the plan's own read_first instruction designating UI-SPEC as authoritative for this string; documented in key-decisions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `src/cli/run.ts`, `src/cli/picker.ts`, `src/domain/source.ts` CLI copy is now fully POS-02-compliant and test-pinned.
- 18-05 (e2e sweep / full-phase verification) can proceed; no outstanding CLI-copy work remains in this plan's file set.

## Self-Check: PASSED

- `src/cli/run.ts`, `src/domain/source.ts`, `tests/cli/selection.test.ts`, `tests/cli/help.test.ts` all modified and committed (`39f0595`, `78ed5ba`).
- `grep -c 'cumpad' src/cli/picker.ts` → 0; `grep -c 'Staged, unstaged, and untracked bytes are ignored' src/domain/source.ts` → 0.
- `grep -rn 'Local-first review of pinned Git comparisons\|Staged, unstaged, and untracked bytes are ignored\|cumpad' src tests` → no matches.
- All three `<task>`-level `<verify>`/`<done>` criteria re-run and pass (see Verification below).
- Plan-level `<verification>` command re-run and passes (see Verification below).

## Verification

- `grep -c 'cumpad' src/cli/picker.ts; grep -c 'Staged, unstaged, and untracked bytes are ignored' src/domain/source.ts` — both `0`.
- `node scripts/run-focused-vitest.mjs tests/cli/selection.test.ts tests/cli/help.test.ts` — 2/2 files, 19/19 tests passed.
- `node scripts/run-focused-vitest.mjs tests/cli` (plan-level `<verification>`) — 5/5 files, 112/112 tests passed.
- `npm run build:runtime && node dist/bin/loopnote.mjs --help` — shows the approved description and unchanged option/argument descriptions.
- Full suite: `npm test` — 81 test files, 853 tests, all passed.

---
*Phase: 18-product-repositioning-copy*
*Completed: 2026-11-02*
