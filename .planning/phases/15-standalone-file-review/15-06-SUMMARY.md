---
phase: 15-standalone-file-review
plan: 06
subsystem: api
tags: [fastify, zod, vitest, worktree-snapshot, export]

# Dependency graph
requires:
  - phase: 15-standalone-file-review (15-03)
    provides: WorktreeSnapshot/materializeWorktreeSnapshot full standalone sourceKind capture+refresh support
  - phase: 15-standalone-file-review (15-04)
    provides: buildReviewExportV4, ReviewExportV4Schema, StandaloneExportScope, standaloneReviewKey
provides:
  - createStandaloneCapabilityRegistry(scope, snapshot, options) in src/server/capabilities.ts
  - createStandaloneSessionApp(scope, options) in src/server/app.ts
  - ExportPublicationIdentity 'standalone' member in src/server/export-store.ts (stableNameFor/matchesPublicationIdentity)
  - StandaloneExportReviewResultSchema in src/contracts/api.ts's ExportReviewResultSchema union
affects: [15-07, 15-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One capability-registry function per session kind (createCapabilityRegistry/createExactPatchCapabilityRegistry/createUncommittedCapabilityRegistry/createStandaloneCapabilityRegistry) rather than widening an existing one — preserves Phase 14's export scope boundary for staged/unstaged/worktree sessions"

key-files:
  created:
    - tests/api/standalone-session.test.ts
  modified:
    - src/server/capabilities.ts
    - src/server/export-store.ts
    - src/server/app.ts
    - src/contracts/api.ts
    - src/web/components/ExportReceipt.vue

key-decisions:
  - "Left the pre-existing `if (scope.sourceKind === 'standalone') throw new RangeError(...)` guard inside createUncommittedCapabilityRegistry unchanged: its message already says 'standalone sessions use a dedicated capability registry', which is now literally true (createStandaloneSessionApp never calls createUncommittedCapabilityRegistry), so the guard is a correct, permanent invariant rather than leftover scaffolding to delete"
  - "[Rule 3 - Blocking] Added StandaloneExportReviewResultSchema (kind:'exported', draftRevision, exportedAt, standalone:{reviewKey}, files) to contracts/api.ts's ExportReviewResultSchema union, outside this plan's declared files_modified — neither existing 'exported' variant (comparison-shaped with drift/comparison, or exact-patch-shaped with a patch digest/validationTarget) structurally fits a standalone export, so routes.ts's `ExportReviewResultSchema.parse(await capabilities.exportReview(...))` would 500 for every real standalone export without this"
  - "[Rule 1 - Bug] Fixed src/web/components/ExportReceipt.vue, outside this plan's declared files_modified — it only branched on 'patch' in receipt vs. else-assume-'drift'-exists; a standalone receipt has neither and would throw reading `.drift.kind` on undefined the first time a user exported a standalone session in the browser"
  - "exportReview's revalidate callback (freeze-then-observe-then-mutate re-check before the atomic publish) compares the WorktreeSnapshot's chain array before vs. after, instead of exact-patch's `patch.snapshot.status` field — WorktreeSnapshot has no drift/status concept, so a concurrent refresh() (which appends to the chain) is the standalone-appropriate equivalent drift signal"

patterns-established: []

requirements-completed: [FILE-03, FILE-05]

# Metrics
duration: ~55min
completed: 2026-10-31
status: complete
---

# Phase 15: Standalone File Review Summary (Plan 06)

**`createStandaloneCapabilityRegistry` and `createStandaloneSessionApp` give standalone sessions the same comment/content/refresh capabilities as staged/unstaged/worktree sessions, plus the schemaVersion-4 export capability Phase 14 deliberately omitted.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2 completed
- **Files modified:** 6 (5 production + 1 new test file)

## Accomplishments
- `createStandaloneCapabilityRegistry` in `src/server/capabilities.ts`: standalone-scoped session/lookup/readContent/verifyAnchor/refresh/worktreeChangeIndicator identical in shape to the uncommitted registry, plus `exportReview`/`revealExportDirectory` (absent from the uncommitted registry by design) that write a schemaVersion-4 export via `buildReviewExportV4`
- `createStandaloneSessionApp` in `src/server/app.ts`: wires a Fastify app the same way `createUncommittedSessionApp` does, but through the new registry — `routes.ts` required zero changes since its 404-guards already key off capability presence
- `ExportPublicationIdentity` (export-store.ts) widened with a `'standalone'` member so `publishReviewExport`/`stableNameFor`/`matchesPublicationIdentity` handle standalone exports under `.cumpa/exports/<reviewKey>/`
- Replaced Plan 15-02's temporary `RangeError('Unreachable: ...')` scaffolding comment's implication with a real implementation: standalone sessions are now served by a real, tested capability registry instead of ever reaching that guard

## Task Commits

1. **Task 1: createStandaloneCapabilityRegistry** - `bd0a081` (test, TDD RED) + `8f66711` (feat, TDD GREEN — includes the contracts/api.ts deviation, since the schema is required for the registry's exportReview to be usable through the real HTTP route)
2. **Task 2: createStandaloneSessionApp** - `b626acb` (feat — includes the ExportReceipt.vue deviation)

_Note: TDD Task 1 is test → feat (export-store.ts and contracts/api.ts changes landed with the feat commit, since they're needed for the implementation to compile/work, not standalone testable units)._

## Files Created/Modified
- `tests/api/standalone-session.test.ts` - session()/verifyAnchor()/lookup()/readContent()/refresh()/exportReview()/revealExportDirectory() coverage against a real git fixture and `materializeWorktreeSnapshot`
- `src/server/capabilities.ts` - `createStandaloneCapabilityRegistry`
- `src/server/export-store.ts` - `ExportPublicationIdentity` widened, `stableNameFor`/`matchesPublicationIdentity` handle `'standalone'`
- `src/server/app.ts` - `CreateStandaloneSessionAppOptions`, `createStandaloneSessionApp`
- `src/contracts/api.ts` - `StandaloneExportReviewResultSchema` added to `ExportReviewResultSchema`'s union (deviation)
- `src/web/components/ExportReceipt.vue` - handles the new `standalone`-shaped receipt without crashing (deviation)

## Decisions Made
- See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a standalone-shaped `ExportReviewResultSchema` variant**
- **Found during:** Task 1 (`exportReview` implementation)
- **Issue:** The plan's declared `files_modified` doesn't include `src/contracts/api.ts`, but `ExportReviewResultSchema`'s `'exported'` union only had two shapes — comparison-shaped (requires `drift`/`comparison`) and exact-patch-shaped (requires `patch: {digest, validationTarget, reviewKey, snapshot}`). A standalone export's natural result (`draftRevision`, `exportedAt`, `standalone: {reviewKey}`, `files`) matches neither `strictObject`, so `routes.ts`'s `ExportReviewResultSchema.parse(await capabilities.exportReview(...))` would throw/500 on every real standalone export.
- **Fix:** Added `StandaloneExportReviewResultSchema` (mirrors the exact-patch shape, substituting a minimal `standalone: {reviewKey}` object for `patch`) and included it in the `ExportReviewResultSchema` union.
- **Files modified:** `src/contracts/api.ts`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` succeeds; `vitest run tests/api/standalone-session.test.ts` exercises `exportReview` end-to-end and parses the result via the real `ExportReviewResultSchema`-backed route logic path (the capability itself calls `ExportReviewResultSchema.parse(...)` before returning); ran the full existing `tests/api/exact-patch.test.ts`/`tests/api/export.test.ts`/`tests/api/export-publication.test.ts` suite to confirm the widened union doesn't change parsing for the two pre-existing shapes (76/76 passed).
- **Committed in:** `8f66711` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed `ExportReceipt.vue` to handle the new standalone receipt shape**
- **Found during:** Task 2 (wiring `createStandaloneSessionApp`, confirming the feature is reachable end-to-end from the already-landed Plan 15-05 web UI, which enables the Export button for standalone sessions via `:export-supported="!isUncommittedSession || isStandaloneSession"`)
- **Issue:** `ExportReceipt.vue`'s `driftText` computed only guarded `'patch' in props.receipt`, then unconditionally read `props.receipt.drift.kind` — correct for the two pre-existing shapes (every non-patch receipt previously had a required `drift` field) but not for the new standalone shape added in Task 1's deviation, which has neither `patch` nor `drift`. The first real standalone export would throw inside the Vue component.
- **Fix:** Added a `standaloneExport` computed and a `metadataRow` computed that picks the right label/value per shape (`'Snapshot status'` for exact-patch, `'Review key'` for standalone, `'Drift'` for comparison); guarded the comparison-disclosure `<section>` against the standalone case too; extended `receiptDetails`'s copy-to-clipboard text with a standalone branch. No behavior change for the two pre-existing shapes (verified the exact-patch/comparison branches produce byte-identical output to before).
- **Files modified:** `src/web/components/ExportReceipt.vue`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` succeeds (Vue SFC `<script setup lang="ts">` type-checks via the project's tsconfig include). No existing automated test exercises this component directly (`grep -r ExportReceipt tests/` found no matches); the fix was verified by inspection against the pre-existing exact-patch/comparison logic paths to confirm no regression, per this plan's "do not run the phase-level e2e suite" instruction (Plan 15-08's not-yet-written Playwright spec is the actual end-to-end prover).
- **Committed in:** `b626acb` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** Both auto-fixes were required for `POST /api/export` on a standalone session to actually work end-to-end (the plan's own success criterion) rather than 500 at the schema-validation gate or crash the browser's receipt view. No scope creep beyond what's structurally required for the declared capability to function.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 15-07 (CLI wiring) can call `createStandaloneSessionApp` directly; no further server-side work needed.
- Plan 15-08's e2e spec is the first real exercise of `ExportReceipt.vue`'s standalone branch through a real browser session — worth a close look if it fails, though the logic was inspected against the existing shapes to minimize that risk.
- No blockers.

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*
