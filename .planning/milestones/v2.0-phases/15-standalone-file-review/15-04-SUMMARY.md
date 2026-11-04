---
phase: 15-standalone-file-review
plan: 04
subsystem: export
tags: [zod, export-schema, markdown-rendering, provenance]

requires:
  - phase: 15-standalone-file-review
    provides: ReviewExportV4Schema, StandaloneExportScope, standaloneReviewKey, and widened sourceKind 'standalone' on the uncommitted draft comparison (plan 15-02)
provides:
  - buildReviewExportV4(snapshot, standalone, exportedAt) producing a canonical, round-trippable schemaVersion 4 ReviewExport with a provenance guard
  - zodParseReviewExport / parseCanonicalReviewExport accepting schemaVersion 4
  - renderReviewMarkdown '## Standalone files' + '## Standalone file digests' sections for schemaVersion 4 documents
affects: [15-06]

tech-stack:
  added: []
  patterns:
    - "buildReviewExportV1 -> V2 -> V3 -> V4 superset-chain: each builder parses the accepted draft, enforces a provenance guard against its own scope, delegates to buildReviewExportV1 with synthetic zero-OID comparison/drift fields, then strips those fields and re-parses under the version-specific schema."

key-files:
  created: []
  modified:
    - src/export/review-export.ts
    - src/export/render-review-markdown.ts
    - tests/unit/review-export.test.ts
    - tests/unit/review-markdown.test.ts

key-decisions:
  - "Replaced 15-02's interim '## Standalone review' / '## Reviewed arguments' / '## Resolved paths' (per-path listing) markdown branch with the plan-specified '## Standalone files' (original arguments, resolved-path count, snapshot chain, anchor-side note) and '## Standalone file digests' (one appendFencedData per path+sha256) sections, since the interim branch did not satisfy this plan's required truths (resolved-path count, per-file digests, snapshot chain) and used different heading text."
  - "buildReviewExportV4's provenance guard checks only draft.comparison.kind/sourceKind/reviewKey against the standalone scope (matching the plan's literal action text), not snapshotChain, mirroring buildReviewExportV3's guard which also does not re-check every field of its own comparison object."

patterns-established:
  - "Standalone markdown digest lines render both the sha256 and the path in a single appendFencedData call via a composite label (`File digest (sha256 <hash>):`), since appendFencedData only takes one label/value pair per call."

requirements-completed: [FILE-05]

duration: ~35min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 04: buildReviewExportV4 and standalone Markdown rendering Summary

**Added `buildReviewExportV4` as the fourth member of the V1→V2→V3 superset-chain builder pattern and replaced the interim standalone Markdown branch with the plan-specified `## Standalone files` / `## Standalone file digests` sections.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-31T07:30:00Z (approx)
- **Completed:** 2026-10-31T08:04:35Z
- **Tasks:** 3 (RED, GREEN, REFACTOR)
- **Files modified:** 4

## Accomplishments
- `buildReviewExportV4(snapshot, standalone, exportedAt)` exported from `src/export/review-export.ts`, enforcing a `TypeError` provenance guard (`kind === 'uncommitted' && sourceKind === 'standalone' && reviewKey` match) before delegating to `buildReviewExportV1` with synthetic zero-OID comparison/drift and re-parsing as `ReviewExportV4Schema`.
- `zodParseReviewExport` (and therefore `parseCanonicalReviewExport`) now accepts `schemaVersion: 4` and rejects malformed V4 documents (e.g. missing `standalone.reviewKey`).
- `renderReviewMarkdown` renders a `## Standalone files` section (original arguments, resolved-path count, snapshot chain, `Anchor side: \`Head\` (current content).`) and a `## Standalone file digests` section (one fenced block per `fileDigests` entry showing path + sha256) for schemaVersion 4 documents; comment anchors render as `Side: \`head\`` (never `preimage`/`postimage`) because the existing `appendComment(lines, comment, exactPatch)` call already passes `exactPatch === false` for schemaVersion 4.
- V1/V2/V3 builders and their markdown branches are byte-for-byte unaffected — all 12 pre-existing tests across both files still pass unchanged.

## Task Commits

1. **Task 1 (RED): Failing tests for buildReviewExportV4 and the V4 markdown branch** - `d1e21f9` (test)
2. **Task 2 (GREEN): Implement buildReviewExportV4 and the V4 markdown branch** - `ec34752` (feat)
3. **Task 3 (REFACTOR): Confirm V1-V3 export paths are byte-for-byte unaffected** - no commit (no code change required; confirmed via the same full test run as Task 2 — all 17 tests pass, 12 of them pre-existing V1/V2/V3 cases)

_Note: both test and production files were authored together, then split into a `test(15-04)` commit (test files) followed by a `feat(15-04)` commit (production files), preserving the RED→GREEN commit-ordering convention while reflecting that both were verified together before either commit landed._

## Files Created/Modified
- `src/export/review-export.ts` - added `AcceptedStandaloneReviewSnapshot` interface, `buildReviewExportV4`, `ReviewExportV4`/`ReviewExportV4Schema`/`StandaloneExportScope` imports and re-export, and a `schemaVersion === 4` branch in `zodParseReviewExport`
- `src/export/render-review-markdown.ts` - rewrote the `else if (standalone)` branch to render `## Standalone files` (arguments, resolved-path count, snapshot chain, anchor-side note) and `## Standalone file digests` (per-path sha256 digests)
- `tests/unit/review-export.test.ts` - added `ReviewExportV4 standalone contract` describe block: provenance guard (reviewKey mismatch, non-standalone sourceKind), canonical round-trip, `toMatchObject`/`not.toHaveProperty` comparison/drift-stripping check, and a malformed-bytes (`missing standalone.reviewKey`) rejection test via hand-crafted canonical bytes
- `tests/unit/review-markdown.test.ts` - added `standalone Markdown` describe block asserting `## Standalone files`, every original argument, `Resolved paths: 1`, the joined snapshot chain, `## Standalone file digests`, and `Side: \`head\`` (never Preimage/Postimage)

## Decisions Made
- Followed the plan's literal action text for the provenance guard (checks `kind`, `sourceKind`, `reviewKey` only, not `snapshotChain`), matching the existing `buildReviewExportV3` guard's scope.
- Kept the existing `controlSafeDisplay` wrapping for `originalArguments` text (used elsewhere in the file for untrusted user-provided strings like `requestedBase`/`requestedHead`/pathspecs) even though the plan's literal action text didn't explicitly call it out, since CLI arguments are the same class of untrusted display data these other sections already treat this way.
- Kept the `length === 0` empty-list fallback text for `originalArguments` and added the same pattern for `fileDigests`, consistent with every other list-rendering branch in this file (`document.patch.snapshot.files`, `document.range.pathspecs`, etc.).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced 15-02's incomplete interim standalone markdown branch**
- **Found during:** Task 2 (GREEN) — per the assignment's explicit instruction to re-read `render-review-markdown.ts` fresh before assuming the plan's action needed to be duplicated
- **Issue:** Plan 15-02's deviation had already added a non-stub `else if (standalone)` branch (`## Standalone review` heading, `## Reviewed arguments` listing every argument, `## Resolved paths` listing every individual path). This satisfied the type system (schemaVersion 4 reachable) but did not satisfy this plan's `must_haves.truths` requirement that the section show resolved-path **count**, per-file **digests**, and the **snapshot chain** — none of which the interim branch rendered at all.
- **Fix:** Rewrote the branch per Task 2's literal action text: `## Standalone files` heading, `Resolved paths: N` (count, not a per-path list), `Snapshot chain: <joined>`, `Anchor side: \`Head\` (current content).`, and a new `## Standalone file digests` section looping `fileDigests`.
- **Files modified:** `src/export/render-review-markdown.ts`
- **Verification:** New `standalone Markdown` test in `tests/unit/review-markdown.test.ts` asserts all of: heading text, resolved-path count, snapshot chain, digests section, and head-side anchor rendering. `node scripts/run-focused-vitest.mjs tests/unit/review-export.test.ts tests/unit/review-markdown.test.ts` passes (17/17); `npx tsc --noEmit --project tsconfig.json` succeeds.
- **Committed in:** `ec34752` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — replacing output that satisfied the type system but not this plan's required truths).
**Impact on plan:** Necessary correctness fix flagged explicitly by the assignment context; no scope creep — scope stayed within `src/export/render-review-markdown.ts`'s existing standalone branch.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `buildReviewExportV4` and its markdown rendering are proven in isolation; Plan 15-06's capability registry can call `buildReviewExportV4` inside `exportReview` for the standalone `sourceKind` without further contract work.
- No blockers for Wave 2 siblings (15-03 touches `src/server/worktree-snapshot.ts`, untouched by this plan).

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*
