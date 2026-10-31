---
phase: 17-agent-protocol-extension-marketplace-skill
plan: 02
subsystem: api
tags: [zod, export-contracts, review-export, agent-protocol]

# Dependency graph
requires:
  - phase: 17-agent-protocol-extension-marketplace-skill
    provides: "Plan 17-01's uncommitted/files request modes and extended error taxonomy"
provides:
  - "ReviewExportV5Schema (agent-driven uncommitted staged/unstaged/worktree reviews) in src/contracts/draft.ts"
  - "ReviewExportV6Schema (agent-driven standalone-file reviews, strict superset of V4) in src/contracts/draft.ts"
  - "buildReviewExportV5/buildReviewExportV6 pure builders in src/export/review-export.ts"
  - "zodParseReviewExport dispatch extended for schemaVersion 5/6"
affects: [17-03-capabilities-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strip-and-reparse-against-V1/V4 superRefine technique reused for V5 (against V1) and V6 (against V4) to prove strict-superset relationships"

key-files:
  created: []
  modified:
    - src/contracts/draft.ts
    - src/export/review-export.ts
    - src/export/render-review-markdown.ts
    - tests/unit/review-export.test.ts

key-decisions:
  - "V1-V4 byte-stability regression pinned via committed Vitest inline snapshots of canonicalizeReviewExport output rather than hand-captured literal bytes, for a precise and low-maintenance regression guard"
  - "ReviewExportV4Schema and buildReviewExportV4 left byte-for-byte untouched; the new workingTreeChangedAfterFinalSnapshot drift field lives only on V5/V6 per RESEARCH.md Pitfall 1"

patterns-established:
  - "New ReviewExportVN schemas needing a drift flag get a shared WorkingTreeDriftFlagSchema (changed/paths pair with a superRefine consistency check) rather than inlining the shape per-version"

requirements-completed: [AGENT-08]

# Metrics
duration: 35min
completed: 2026-10-31
status: complete
---

# Phase 17 Plan 2: ReviewExportV5/V6 canonical export schemas and builders Summary

**Added `ReviewExportV5Schema`/`ReviewExportV6Schema` (agent-driven uncommitted and standalone reviews carrying a working-tree drift flag) plus their `buildReviewExportV5`/`buildReviewExportV6` builders, proven strict supersets of V1/V4 respectively, while V1–V4 stay byte-for-byte unchanged.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-10-31T16:56:00Z
- **Completed:** 2026-10-31T17:02:00Z
- **Tasks:** 2 (RED, GREEN)
- **Files modified:** 4 (draft.ts, review-export.ts, render-review-markdown.ts, review-export.test.ts) + 1 snapshot fixture created

## Accomplishments
- `ReviewExportV5Schema`: new `UncommittedExportScopeSchema` (staged/unstaged/worktree, base-commit-required-except-unstaged) + `WorkingTreeDriftFlagSchema` (changed/paths consistency), proven a strict superset of `ReviewExportV1Schema` via the established zeroed-placeholder strip-and-reparse technique.
- `ReviewExportV6Schema`: standalone shape (`StandaloneExportScopeSchema`, unchanged) plus the same drift flag, proven a strict superset of `ReviewExportV4Schema` directly (strip `workingTreeChangedAfterFinalSnapshot`, reparse at `schemaVersion: 4`) rather than re-deriving the V1 proof.
- `buildReviewExportV5`/`buildReviewExportV6` in `review-export.ts` mirror `buildReviewExportV3`/`V4`'s exact provenance-check-then-build-then-parse shape; `zodParseReviewExport` dispatch gained the two new arms.
- V1–V4 regression pinned: a new top-level test rebuilds every pre-existing fixture and asserts `canonicalizeReviewExport` output against committed Vitest snapshots, so any accidental shape drift in V1–V4 fails loudly.

## Task Commits

1. **Task 1 (RED): Write failing V5/V6 construction tests and pin the V1-V4 regression assertion** - `888d075` (test)
2. **Task 2 (GREEN): Implement ReviewExportV5Schema/V6Schema and buildReviewExportV5/V6** - `2194c4b` (feat)

**Plan metadata:** (this commit, below)

## Files Created/Modified
- `src/contracts/draft.ts` - Added `UncommittedExportScopeSchema`, `WorkingTreeDriftFlagSchema`, `ReviewExportV5Schema`, `ReviewExportV6Schema` and their type exports; extended the `ReviewExport` union. `ReviewExportV4Schema`'s body is byte-for-byte unchanged (verified via diff against the pre-implementation commit).
- `src/export/review-export.ts` - Added `AcceptedUncommittedReviewSnapshot` interface, `buildReviewExportV5`, `buildReviewExportV6`; extended imports/re-exports and `zodParseReviewExport`'s dispatch.
- `src/export/render-review-markdown.ts` - Extended the discriminated-union branching (`exactPatch` / standalone V4|V6 / uncommitted V5 / pinned V1|V2) to cover the two new schema versions, including a "Working tree drift" section; this was required to make `npm run typecheck:tests:node` pass against the extended `ReviewExport` union (see Deviations).
- `tests/unit/review-export.test.ts` - Added `uncommittedSnapshot`/`standaloneSnapshot` helpers, `ReviewExportV5`/`ReviewExportV6` canonical-contract describe blocks, and the V1-V4 regression test.
- `tests/unit/__snapshots__/review-export.test.ts.snap` - New committed snapshot fixture (v1-v4 canonical bytes) backing the regression test.

## Decisions Made
- Used Vitest's `toMatchSnapshot()` against `canonicalizeReviewExport(...)` output (decoded to text) for the V1-V4 regression guard rather than hand-transcribing byte literals — equally precise, lower maintenance, and the snapshot file is committed alongside the test so the guard is effective from the first GREEN run onward.
- `ReviewExportV6Schema`'s superRefine reparses directly against `ReviewExportV4Schema` (stripping only the new drift field) instead of re-deriving the V1 zeroed-placeholder proof, per the plan's interface spec — proves V6 ⊃ V4 more directly and keeps the V1 proof technique exclusive to V1/V3/V4/V5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug / Blocking] `renderReviewMarkdown`'s discriminated-union narrowing broke under the extended `ReviewExport` union**
- **Found during:** Task 2 (GREEN), running the plan's own `<verification>` command `npm run typecheck:tests:node`
- **Issue:** `render-review-markdown.ts` computed `exactPatch`/`standalone` boolean aliases for only schemaVersion 3/4, then fell through to a final `else` branch assuming only V1/V2 remained and accessed `.comparison`/`.drift` (fields absent from V5/V6). Extending the `ReviewExport` union — exactly what this plan's `<success_criteria>` and `<verification>` require — surfaced 14 `tsc` errors (`TS2339`) in that unrelated file.
- **Fix:** Replaced the boolean-alias branching with explicit inline `document.schemaVersion === N` checks per branch (`exactPatch` / `V4 || V6 standalone` / `V5 uncommitted` / final V1|V2 pinned), added a "Working tree drift" rendering section for V5/V6 using the new `workingTreeChangedAfterFinalSnapshot` field, and extended the "Applying-agent instructions" message ternary with an `uncommitted` arm.
- **Files modified:** `src/export/render-review-markdown.ts`
- **Verification:** `npm run typecheck:tests:node` passes with zero errors; `tests/unit/review-markdown.test.ts` (12 pre-existing V1-V4 tests, untouched behavior) and `tests/unit/review-export.test.ts` (15 tests) both pass.
- **Committed in:** `2194c4b` (part of Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1/3 — blocking typecheck failure directly caused by this plan's union extension).
**Impact on plan:** Necessary to satisfy the plan's own stated `<verification>` requirement (`npm run typecheck:tests:node passes with the extended ReviewExport union`). No scope creep beyond making the pre-existing discriminated-union consumer exhaustive again; no new markdown content shape was invented beyond mirroring the established V3/V4 sibling-block patterns with the fields that actually exist on V5/V6.

## Issues Encountered
- Vitest's `toMatchSnapshot()` would not auto-write a new snapshot on first run because the shell environment has `CI=true` set; worked around by running the snapshot-generating pass once with `CI=` unset, then committing the resulting `.snap` file so subsequent runs (CI or not) compare against it rather than attempt to write.
- Initial regression-test draft for the V2 fixture used `snapshot()` + a `RangeReviewScope` missing the `kind: 'revisions'` literal and passed the base (non-range) snapshot instead of `rangeSnapshot(range)`, causing `buildReviewExportV2` to throw ("Range export provenance does not match the frozen comparison."); fixed by adding `kind: 'revisions'` and switching to `rangeSnapshot(range)`, matching the file's own pre-existing V2 test pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `buildReviewExportV5`/`buildReviewExportV6` and their schemas are ready for Plan 17-03 to wire into `capabilities.ts` for agent-facing uncommitted/standalone export responses.
- `ReviewExportV4Schema`/`buildReviewExportV4` remain completely untouched (diff-verified byte-identical), so no downstream V1-V4 consumer is at risk.

---
*Phase: 17-agent-protocol-extension-marketplace-skill*
*Completed: 2026-10-31*

## Self-Check: PASSED
