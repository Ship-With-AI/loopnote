---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 05
subsystem: git
tags: [git-diff, crlf-normalization, hunk-reconstruction, blob-oid, worktree]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "14-04's createWorktreeChangedFileInventory (Staged/Unstaged/Working-tree file listing via git diff --raw/--numstat) identifies which paths this module may be called for"
provides:
  - "resolveWorktreeSideContent(options, dependencies): Promise<{ bytes, blobOid }> — reconstructs full pre/post text for any diff side crossing the worktree boundary by walking git diff -U1000000's own full-context hunk output"
  - "Exported blobOid(bytes, format) from src/git/exact-patch.ts (visibility widening only, zero behavior change)"
affects: ["14-07 captureWorktreeManifest (snapshot freezing)", "anchor identity for Unstaged/Working-tree tracked-file sides"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content resolution for a diff side splits by whether it is object-backed (read via ObjectReader) or crosses the worktree boundary (read via git diff's own full-context hunk output) — never an independent fs.readFile compared against a differently-normalized object-backed side."
    - "Single full-context hunk walk (-U1000000 collapses every edited region into one hunk) classifies ' '/'+'/'-' prefixed lines to rebuild postimage text, modeled on (not calling) exact-patch.ts's applyText hunk-replay idiom."

key-files:
  created: [src/git/worktree-content.ts, tests/git/worktree-content.test.ts]
  modified: [src/git/exact-patch.ts]

key-decisions:
  - "blobOid gained only the `export` keyword — no signature or behavior change — so committed and uncommitted anchors share the exact same synthetic-digest algorithm with zero schema change (WTREE-04/D-21)."
  - "resolveWorktreeSideContent documents its already-changed-file precondition in its own doc comment and throws on a no-hunk diff rather than defensively guarding it, mirroring exact-patch.ts's applyText which assumes a well-formed patch."

requirements-completed: [WTREE-04]

# Metrics
duration: ~15min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 05: Worktree-Side Content Reconstruction Summary

**`resolveWorktreeSideContent()` rebuilds full pre/post text for Unstaged/Working-tree's worktree side by walking `git diff -U1000000`'s own full-context hunk output instead of independently reading and comparing raw worktree bytes, fixing the CRLF/clean-filter normalization pitfall (Required Focus 2); it reuses `exact-patch.ts`'s now-exported `blobOid()` for the synthetic digest.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-30
- **Tasks:** 1 (TDD: RED + GREEN, no REFACTOR needed)
- **Files modified:** 3 (1 created implementation file, 1 created test file, 1 modified for visibility widening)

## Accomplishments
- New `src/git/worktree-content.ts` exports `resolveWorktreeSideContent(options, dependencies): Promise<{ bytes, blobOid }>`, which runs `git diff [--cached] -U1000000 --no-color --no-ext-diff --no-textconv [<endpoint>] -- <path>` and walks the single resulting full-context hunk to rebuild the postimage text from its context (' ') and added ('+') lines.
- `src/git/exact-patch.ts`'s `blobOid(bytes, format)` is now exported (pure visibility widening, identical algorithm), giving committed and non-object-backed uncommitted sides the exact same synthetic Git-compatible digest computation.
- Fixture-verified against the exact pitfall scenario: a tracked file with `.gitattributes` `* text=auto eol=lf`, CRLF line endings on disk but LF-normalized index content, shows **zero** changed lines when there is no real edit, and **exactly one** changed line when one genuine edit is added — proving reconstruction tracks `git diff`'s own normalized notion of "changed" rather than a naive byte comparison.
- A merge-base-endpoint, two-region edit fixture confirms `-U1000000` always collapses every edited region of a file into exactly one hunk, and that the reconstructed postimage is byte-identical to the expected edited content.

## Task Commits

TDD plan — RED/GREEN cycle (no REFACTOR; implementation required no follow-up cleanup):

1. **RED: failing test for resolveWorktreeSideContent** - `28b75b8` (test)
2. **GREEN: implement resolveWorktreeSideContent + export blobOid** - `afede8b` (feat)

_Single-task TDD plan per plan frontmatter (`type: tdd`); both commits cover Task 1._

## Files Created/Modified
- `src/git/worktree-content.ts` - New module: `ResolveWorktreeSideContentOptions`, `ResolveWorktreeSideContentDependencies`, `ResolvedWorktreeSideContent`, and `resolveWorktreeSideContent()` with its single-hunk-walk `reconstructPostimage()` helper.
- `tests/git/worktree-content.test.ts` - New test file: CRLF-no-real-edit (zero changed lines), CRLF-plus-one-real-edit (exactly one changed line), merge-base-endpoint multi-region edit (one-hunk collapse proof), blobOid algorithm parity, and the already-changed-file precondition (descriptive error on a no-hunk diff).
- `src/git/exact-patch.ts` - `function blobOid` → `export function blobOid` (line 427 only; zero other changes).

## Decisions Made
- Kept `blobOid`'s signature and implementation byte-for-byte unchanged — only widened visibility — so the plan's zero-schema-change guarantee (anchor `blobOid` field keeps its current committed-or-synthetic hex-digest type) holds by construction, not by a follow-up check.
- `reconstructPostimage()` throws a descriptive `Error` (not a new exported error class) when no `@@` header is found, since the function's own doc comment states the already-changed-file precondition as a contract the caller must uphold — consistent with how `exact-patch.ts`'s `applyText` assumes a well-formed patch rather than defensively handling malformed input.
- Test for the "CRLF line endings alone, no real edit" scenario asserts directly against `git diff --stat` reporting zero changes for that path (confirming the precondition git itself establishes) rather than calling `resolveWorktreeSideContent` on an unchanged file, which would violate the function's own documented precondition and throw.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `resolveWorktreeSideContent` is ready for 14-07's `captureWorktreeManifest` to call for every non-object-backed changed file before freezing its bytes into the snapshot store.
- Untracked files remain explicitly out of this module's scope (read via plain bounded `fs.readFile`, already covered by 14-04's Task 2) since they have no base/index side to normalize against.
- No blockers for downstream Phase 14 plans.

## Self-Check: PASSED

- `src/git/worktree-content.ts` — FOUND
- `tests/git/worktree-content.test.ts` — FOUND
- `grep -c "^export function blobOid" src/git/exact-patch.ts` → `1` (PASSED)
- `grep -c "^function blobOid" src/git/exact-patch.ts` → `0` (PASSED)
- `grep -c "export async function resolveWorktreeSideContent" src/git/worktree-content.ts` → `1` (PASSED)
- Commit `28b75b8` — FOUND in `git log --oneline --all`
- Commit `afede8b` — FOUND in `git log --oneline --all`
- `npx vitest run tests/git/worktree-content.test.ts tests/git/exact-patch.test.ts` — 2 files, 12 tests passed
- `npx tsc --noEmit --project tsconfig.json` — exits `0`

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*
