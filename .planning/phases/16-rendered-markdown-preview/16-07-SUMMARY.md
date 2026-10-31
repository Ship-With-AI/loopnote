---
phase: 16-rendered-markdown-preview
plan: 07
subsystem: domain
tags: [anchor, schema, durable-anchor, range-anchor, back-compat, server]

# Dependency graph
requires:
  phase: 16-rendered-markdown-preview
  provides: "User decision A-01 (16-CONTEXT.md) and 16-RESEARCH.md's 'Addendum: A-01 Range-Aware Durable Anchor' design — additive optional endLine, no version bump"
provides:
  - "DurableAnchorV1/BuildDurableAnchorInput gain an additive optional endLine; absent = today's single-line anchor (byte-for-byte unchanged contextHash), present = inclusive [line, endLine] range"
  - "buildDurableAnchor: selectedText spans the full joined range, context.after is computed past endLine (not line), bounds/order validated (endLine >= line, endLine <= lines.length), endLine spread into the frozen object only when defined"
  - "contextHash folds endLine/selectedText into the digest only when endLine is defined, reproducing the pre-change byte sequence exactly when it is omitted (pinned by a golden hash test)"
  - "verifyDurableAnchor compares recorded.endLine === current.endLine, classifying drift anywhere in the whole stored range as stale, never relocating the anchor"
  - "DurableAnchorV1Schema/AddCommentRequestSchema accept optional endLine with an endLine >= line superRefine; every export schema (ReviewExportV1-V4) inherits it through DurableAnchorV1Schema with zero schema edits"
  - "routes.ts addComment handler and all four capabilities.ts verifyAnchor closures (committed/pinned, exact-patch, uncommitted, standalone) pass endLine through, so range anchors re-verify against their live full range"
affects: [16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive-field-as-version-signal: endLine presence/absence is the version signal instead of a new version literal or schema union member, keeping every call site and export schema (V1-V4) untouched"
    - "Golden byte-for-byte regression test: a literal pre-captured hex digest pins the legacy no-endLine contextHash byte sequence so any accidental change to it fails loudly"
    - "Test-stub same-oid-different-bytes drift simulation for committed/pinned sessions: two app instances backed by the same real temp repositoryRoot and the same objectReader oid, second instance returning different bytes for that oid, mirroring tests/api/draft.test.ts's established drift-test precedent"

patterns-established:
  - "superRefine chained before .readonly() on a strictObject to add a cross-field (endLine >= line) validation rule, matching PinnedDraftComparisonSchema's existing convention in src/contracts/draft.ts"

requirements-completed: [MDV-02]

# Metrics
duration: 55min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 07: Range-Aware Durable Anchor (A-01) Summary

**An additive, optional `endLine` on `DurableAnchorV1`/`buildDurableAnchor`/`verifyDurableAnchor` and their two call-in schemas — absent reproduces today's single-line anchor byte-for-byte (golden-hash pinned), present covers the whole `[line, endLine]` block in `selectedText`/`context`/`contextHash`/drift verification, with zero export-schema edits and all 5 call sites wired through.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-10-31T12:48:00Z
- **Completed:** 2026-10-31T13:43:00Z
- **Tasks:** 3 (each RED → GREEN)
- **Files modified:** 5 source files, 3 test files

## Accomplishments

- `buildDurableAnchor`/`verifyDurableAnchor` (`src/domain/anchor.ts`) are range-aware: `selectedText` spans the full joined `[line, endLine]` range, `context.after` is computed past `endLine` instead of `line`, bounds validation extends to `(endLine ?? line) > lines.length`, and `endLine < line` throws the same `RangeError` shape as the existing line-bounds check.
- `contextHash` folds `endLine`/`selectedText` into the digest only when `endLine` is defined — pinned by a golden regression test asserting the exact legacy hex digest (`23c54f8c…f71e6b`) for the no-`endLine` path, proving byte-for-byte identity with the pre-change implementation.
- `uniqueKey` stays computed from `(path, side, blobOid, line)` alone, unextended — a range anchor's `uniqueKey` is identical to a single-line anchor at the same `line`, preserving D-06 "one comment per block" dedupe semantics.
- `verifyDurableAnchor` adds `recorded.endLine === current.endLine` to its match conjunction; interior drift anywhere in `[line, endLine]` and a grown/shrunk range both flip to `stale`/`anchor-mismatch`.
- `DurableAnchorV1Schema` and `AddCommentRequestSchema` both accept `endLine: z.number().int().positive().optional()` with an `endLine >= line` `.superRefine` chained before `.readonly()`; a literal pre-phase-16 anchor fixture with no `endLine` key still parses through `ReviewDraftV1Schema` and all four `ReviewExportV{1,2,3,4}Schema` unchanged — zero export-schema edits needed.
- All 5 call sites wired: `routes.ts`'s `addComment` handler passes `endLine: requestMutation.data.endLine`; `capabilities.ts`'s four `verifyAnchor` closures (committed/pinned, exact-patch, uncommitted, standalone) all pass `endLine: anchor.endLine`.
- API-level round-trip proves `endLine` persists through `/api/draft/mutations` `addComment`, a malformed `endLine < line` request is rejected 400 before any anchor is built, and interior drift strictly inside a stored `[line, endLine]` range flips a subsequent `GET /api/draft` verification to `stale` for a committed/pinned session — proving whole-range drift coverage, not just first-line.
- 37 tests across the 4 verification files, all passing; `tsc --project tsconfig.json` clean; `grep -c "endLine"` is 14 in `src/domain/anchor.ts` and 3 in `src/contracts/draft.ts`, confirming the field landed in both.

## Task Commits

Each task committed atomically, RED step then GREEN step:

1. **Task 1 (RED): Failing range-aware anchor tests** - `12487c8` (test) — golden hash regression, range-anchor behavior, bounds validation, hash/uniqueKey relationship, whole-range verify/drift cases
2. **Task 1 (GREEN): Implement range-aware buildDurableAnchor/verifyDurableAnchor** - `69047db` (feat)
3. **Task 2 (RED): Failing DurableAnchorV1Schema/AddCommentRequestSchema endLine tests** - `5472070` (test) — accept/reject cases plus the pre-phase-16 back-compat fixture across `ReviewDraftV1Schema` and all four export schemas
4. **Task 2 (GREEN): Accept optional endLine on both schemas** - `b575ff6` (feat)
5. **Task 3 (RED): Failing API round-trip/drift/rejection tests** - `15f870a` (test)
6. **Task 3 (GREEN): Wire endLine through addComment route and all four verifyAnchor closures** - `34987fa` (feat)

_TDD tasks: test → feat per task; no separate refactor step needed for any task._

## Files Created/Modified

- `src/domain/anchor.ts` - `DurableAnchorV1`/`BuildDurableAnchorInput` gain optional `endLine`; `contextHash`, `buildDurableAnchor`, `verifyDurableAnchor` made range-aware
- `src/contracts/draft.ts` - `DurableAnchorV1Schema` gains optional `endLine` + `endLine >= line` superRefine
- `src/contracts/api.ts` - `AddCommentRequestSchema` gains the identical optional `endLine` + superRefine
- `src/server/routes.ts` - `addComment` handler passes `endLine` into `buildDurableAnchor`
- `src/server/capabilities.ts` - all four `verifyAnchor` closures pass `endLine: anchor.endLine` into `buildDurableAnchor`
- `tests/unit/anchor.test.ts` - new `describe('range-aware durable anchors (A-01)')` block: golden hash, range behavior, bounds, hash/uniqueKey relationship, whole-range verify/drift
- `tests/unit/draft-reconciliation.test.ts` - new `describe('range-aware durable anchor schemas (A-01 back-compat)')` block: schema accept/reject cases, pre-phase-16 fixture parses through `ReviewDraftV1Schema` and `ReviewExportV1-V4Schema`
- `tests/api/anchor.test.ts` - new `describe('range-aware durable anchor (A-01)')` and `describe('range-aware durable anchor drift (A-01)')` blocks: round-trip, omitted-endLine, malformed-rejection, and whole-range drift via a real temp repository root

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for all three tasks' `<action>` specifications.

### Scope Notes (not deviations, judgment calls within task scope)

1. **Task 2 test placement:** The plan's Task 2 `<files>` list named only `tests/unit/draft-reconciliation.test.ts` for new tests, while its `<read_first>`/`acceptance_criteria` referenced `tests/unit/review-export.test.ts` for fixture-building precedent and regression verification only. Reused `buildReviewExportV1`-`V4` from `src/export/review-export.ts` (source, not a test file) inside `draft-reconciliation.test.ts` to construct schema-valid V1-V4 documents around the legacy anchor fixture, mirroring `review-export.test.ts`'s established `comment()`/`snapshot()`/`rangeSnapshot()` pattern without modifying that file.
2. **Task 3 drift-test fixture:** `tests/api/anchor.test.ts`'s existing `comparisonFixture()`/`buildApp()` use a non-writable placeholder `repositoryRoot` ('/private/repository/must-not-leak') paired with `onAnchorAdd`, which bypasses draft persistence entirely — unsuitable for a drift test that needs a real persisted comment re-verified via `GET /api/draft`. Added a second, independent `describe('range-aware durable anchor drift (A-01)')` block with its own `mkdtemp`-backed repository root and local fixture helpers, mirroring `tests/api/draft.test.ts`'s established same-oid-different-bytes drift precedent, while leaving the existing top-level helpers fully untouched (extended, not replaced).

**Total deviations:** 0 (Rule 1-4 sense). Two scope notes above document reasonable interpretation of ambiguous file-scope instructions, consistent with the plan's own stated precedent files.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `endLine` is available end-to-end on the durable anchor domain model, both schemas, and all 5 server call sites. Client wiring (the `activate` event, add-comment request builder, Monaco range decoration) is explicitly left to 16-03/16-04 per the research addendum's "Client wiring" subsection — not prescribed or attempted here.
- `read_first` flagged that plan 16-02 (same wave) also touches `routes.ts`/`capabilities.ts` for the unrelated D-09 image route (new route + `readRelativeImage` helper) — confirmed distinct methods/branches from this plan's `addComment` branch and four pre-existing `verifyAnchor` closures; both plans' diffs coexist cleanly in the current working tree with no overlap.
- No blockers.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/domain/anchor.ts
- FOUND: src/contracts/draft.ts
- FOUND: src/contracts/api.ts
- FOUND: src/server/routes.ts
- FOUND: src/server/capabilities.ts
- FOUND: tests/unit/anchor.test.ts
- FOUND: tests/unit/draft-reconciliation.test.ts
- FOUND: tests/api/anchor.test.ts
- FOUND: .planning/phases/16-rendered-markdown-preview/16-07-SUMMARY.md
- FOUND commits: 12487c8 (test), 69047db (feat), 5472070 (test), b575ff6 (feat), 15f870a (test), 34987fa (feat) — all present via `git log --oneline -8`
