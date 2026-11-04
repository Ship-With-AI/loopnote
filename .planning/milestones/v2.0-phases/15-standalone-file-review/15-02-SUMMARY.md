---
phase: 15-standalone-file-review
plan: 02
subsystem: api
tags: [zod, contracts, standalone-review, review-export, comparison-key, draft-identity]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "UncommittedScopeSchema/UncommittedSessionResponseSchema/UncommittedDraftComparisonSchema and the uncommittedReviewKey domain hash for staged/unstaged/worktree sessions"
provides:
  - "UncommittedScopeSchema/UncommittedSessionResponseSchema/UncommittedDraftComparisonSchema widened to accept sourceKind: 'standalone' (no base/merge-base commit, like 'unstaged')"
  - "ChangedFileSchema/SessionFileSchema optional standaloneGitState sibling field ('modified-uncommitted' | 'untracked' | 'unchanged')"
  - "standaloneReviewKey(sortedOriginalArguments, firstSnapshotDigest) domain-separated draft-identity hash in src/domain/comparison-key.ts"
  - "ReviewExportV4Schema (schemaVersion 4) with StandaloneExportScopeSchema provenance block, backward-compat V1 re-derivation guard"
affects: [15-standalone-file-review-snapshot-capture, 15-standalone-file-review-cli, 15-standalone-file-review-web, 16-rendered-markdown-preview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sourceKind-discriminated superRefine: fold a new no-base-commit sourceKind into the existing 'unstaged' branch condition rather than adding a parallel branch"
    - "Symmetric presence-enforcement superRefine: a sibling field (standaloneArguments) is required iff the discriminant equals its owning kind, forbidden otherwise"
    - "Domain-separated SHA-256 review keys: a dedicated STANDALONE_DOMAIN buffer prevents cross-kind collisions with uncommittedReviewKey for identical byte inputs"
    - "Versioned export schema backward-compat guard: each ReviewExportVN superRefine re-derives and safeParses a synthetic V1-shaped sub-document"

key-files:
  created: []
  modified:
    - src/contracts/comparison.ts
    - src/contracts/api.ts
    - src/contracts/draft.ts
    - src/domain/comparison-key.ts
    - src/export/render-review-markdown.ts
    - src/server/capabilities.ts
    - src/server/worktree-snapshot.ts
    - tests/unit/uncommitted-contracts.test.ts
    - tests/unit/comparison-key.test.ts

key-decisions:
  - "standaloneReviewKey is a separate exported function (not a widening of uncommittedReviewKey's 3-way sourceKind parameter), keyed by the raw sorted argument list rather than resolved files, per Common Pitfall 4 (Refresh re-resolves arguments against a possibly-changed working tree)."
  - "uncommittedReviewKey's sourceKind parameter intentionally stays 3-way ('staged'|'unstaged'|'worktree'); captureWorktreeManifest and createUncommittedCapabilityRegistry now guard-throw RangeError on sourceKind: 'standalone' (matching the existing worktree-inventory.ts 'Unreachable' precedent) since those code paths are not used by standalone sessions."

requirements-completed: [FILE-01, FILE-03, FILE-05]

# Metrics
duration: 7min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 02: Widen uncommitted-kind contracts for standalone sourceKind Summary

**Widened `UncommittedScopeSchema`/`UncommittedSessionResponseSchema`/`UncommittedDraftComparisonSchema` to a fourth `sourceKind: 'standalone'` value, added a domain-separated `standaloneReviewKey` hash and a `ReviewExportV4Schema` export-provenance schema with a working-V1-backward-compat guard.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-31T08:47:03Z
- **Completed:** 2026-10-31T08:54:08+01:00
- **Tasks:** 3 (RED, GREEN, REFACTOR)
- **Files modified:** 9 (4 production files per plan + 3 deviation-fix production files + 2 test files)

## Accomplishments
- `UncommittedScopeSchema`/`UncommittedSessionResponseSchema`/`UncommittedDraftComparisonSchema` accept `sourceKind: 'standalone'` with no base/merge-base commit, symmetric to the existing `'unstaged'` rule, with a new symmetric `standaloneArguments` presence check (required iff standalone, forbidden otherwise).
- `ChangedFileSchema`/`SessionFileSchema` gained an optional `standaloneGitState` sibling field (`'modified-uncommitted' | 'untracked' | 'unchanged'`).
- `standaloneReviewKey` added to `src/domain/comparison-key.ts`, domain-separated from `uncommittedReviewKey` via a dedicated `STANDALONE_DOMAIN` constant, keyed by the raw (caller-sorted) argument list plus the first snapshot digest — never a resolved file list.
- `ReviewExportV4Schema` added to `src/contracts/draft.ts` with a new `StandaloneExportScopeSchema` (original arguments, resolved paths, per-file sha256 digests, snapshot chain, review key), mirroring V3's synthetic-V1-re-derivation backward-compatibility guard.
- 39 unit tests pass across `uncommitted-contracts.test.ts` and `comparison-key.test.ts` (6 new RED cases confirmed failing before implementation, all passing after); `npx tsc --noEmit` is clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for widened schemas and standaloneReviewKey** - `4ee4bf7` (test)
2. **Task 2 (GREEN): Widen schemas, add standaloneGitState/standaloneArguments fields, standaloneReviewKey, ReviewExportV4Schema** - `e0d871b` (feat)
3. **Task 3 (REFACTOR): ReviewExportV4Schema round-trip test and typecheck sweep** - `396bcb9` (refactor)

_No separate plan-metadata commit was made: `.planning/` SUMMARY/STATE/ROADMAP commits are produced by this same executor run as noted below._

## Files Created/Modified
- `src/contracts/comparison.ts` - `ChangedFileSchema` gains `standaloneGitState`; `UncommittedScopeSchema.sourceKind` widened to 4-way enum, `standaloneArguments` field added, `superRefine` extended with the no-base fold and symmetric `standaloneArguments` presence check
- `src/contracts/api.ts` - `SessionFileSchema` gains `standaloneGitState`; `UncommittedSessionResponseSchema.uncommitted.sourceKind` widened to 4-way enum
- `src/contracts/draft.ts` - `UncommittedDraftComparisonSchema.sourceKind` widened, `superRefine` folds `'standalone'` into the no-base branch; new `StandaloneExportScopeSchema` and `ReviewExportV4Schema` (+ `ReviewExportV4`/`StandaloneExportScope` types, `ReviewExport` union widened to include V4)
- `src/domain/comparison-key.ts` - new `STANDALONE_DOMAIN` constant and exported `standaloneReviewKey(sortedOriginalArguments, firstSnapshotDigest)`
- `src/export/render-review-markdown.ts` - **(deviation)** added a `schemaVersion === 4` branch rendering the standalone provenance block, resolving a compile break from the widened `ReviewExport` union
- `src/server/capabilities.ts` - **(deviation)** `createUncommittedCapabilityRegistry` now guard-throws on `sourceKind: 'standalone'` before calling `uncommittedReviewKey` (3-way signature, unchanged)
- `src/server/worktree-snapshot.ts` - **(deviation)** `captureWorktreeManifest` now guard-throws on `sourceKind: 'standalone'` before using it with `createWorktreeChangedFileInventory` (3-way, unchanged) and the pre-widening `WorktreeSnapshotManifestSchema` shape
- `tests/unit/uncommitted-contracts.test.ts` - new standalone acceptance/rejection cases for `UncommittedScopeSchema`/`DraftComparisonSchema`, plus `ReviewExportV4Schema` round-trip and negative tests
- `tests/unit/comparison-key.test.ts` - new `standaloneReviewKey` stability/domain-separation cases

## Decisions Made
- `standaloneReviewKey` is a standalone exported function rather than a widened `uncommittedReviewKey` — matches the plan's explicit instruction and keeps `uncommittedReviewKey`'s 3-way signature stable for its existing three call sites.
- The symmetric `standaloneArguments` presence check uses its own issue (`path: ['standaloneArguments']`), independent of the base-commit check, so a standalone scope with both a base commit and a missing `standaloneArguments` surfaces both issues.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `npx tsc --noEmit` broke in three files outside `files_modified` as a direct, unavoidable consequence of the instructed schema widening**
- **Found during:** Task 2 (GREEN), running the plan's own `<verification>` typecheck command
- **Issue:** Widening `UncommittedScope['sourceKind']` to 4-way and the `ReviewExport` union to include `ReviewExportV4` broke three downstream consumers that structurally depend on the narrower pre-widening shapes: (a) `src/server/capabilities.ts`'s `createUncommittedCapabilityRegistry` passed `scope.sourceKind` into `uncommittedReviewKey`'s intentionally-still-3-way parameter; (b) `src/server/worktree-snapshot.ts`'s `captureWorktreeManifest` passed `scope.sourceKind` into `createWorktreeChangedFileInventory`'s intentionally-still-3-way `sourceKind` option (confirmed by RESEARCH.md as staying 3-way) and into the pre-widening `WorktreeSnapshotManifestSchema` manifest shape (explicitly deferred to a later plan per this plan's own frontmatter `key_links`); (c) `src/export/render-review-markdown.ts`'s `renderReviewMarkdown` had an exhaustive `if (exactPatch) {…} else {…}` that assumed the `else` branch was always V1/V2-shaped (`.comparison`/`.drift`), which no longer held once the `else` branch's type also admitted `ReviewExportV4`.
- **Fix:** (a)/(b) Added an explicit `if (scope.sourceKind === 'standalone') throw new RangeError('Unreachable: …')` guard at the top of each function, narrowing `scope.sourceKind` to the pre-widening 3-way type for the rest of the function body — matching the existing `'Unreachable: sourceKind must be staged, unstaged, or worktree'` precedent in `src/git/worktree-inventory.ts`. Both functions are not yet reachable with a standalone scope at runtime (standalone snapshot capture is deferred to a later plan with its own dedicated capture path), so this changes no observable behavior for the three existing sourceKinds. (c) Added an `else if (standalone)` branch between the exact-patch and pinned-comparison branches that renders the real `document.standalone` provenance fields (original arguments, resolved paths, review key) — genuine data already present on the schema, not a stub.
- **Files modified:** `src/server/capabilities.ts`, `src/server/worktree-snapshot.ts`, `src/export/render-review-markdown.ts`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` clean; re-ran the pre-existing unit/api suites that exercise these three files (`tests/unit/review-export.test.ts`, `tests/unit/review-markdown.test.ts`, `tests/api/worktree-snapshot.test.ts`, `tests/api/uncommitted-session.test.ts`, `tests/api/support.test.ts`, `tests/git/anchored-content.test.ts`, `tests/api/export-publication.test.ts`) — all 59 tests pass, zero regressions.
- **Committed in:** `e0d871b` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — compile-breaking type error directly caused by this task's instructed widening, spanning 3 files)
**Impact on plan:** Necessary to satisfy the plan's own stated `<verification>` (`tsc --noEmit` must succeed); no behavior change for any existing (non-standalone) code path, confirmed by the full regression run above. No scope creep beyond resolving the compile break.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The four widened contract shapes and `standaloneReviewKey`/`ReviewExportV4Schema` are final and tested — ready for the snapshot-capture plan to build a dedicated standalone capture path (the `WorktreeSnapshotManifestSchema` widening and standalone-specific `captureWorktreeManifest` equivalent remain explicitly deferred, per this plan's frontmatter `key_links` and the guard clauses added above).
- No blockers for CLI/server/web plans that consume these schemas.

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*

## Self-Check: PASSED
