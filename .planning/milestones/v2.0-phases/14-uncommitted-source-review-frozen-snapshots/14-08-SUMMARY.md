---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 08
subsystem: server
tags: [fastify, zod, uncommitted-review, frozen-snapshot, draft-identity]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "UncommittedScopeSchema/UncommittedDraftComparisonSchema (14-02), uncommittedReviewKey (14-03), materializeWorktreeSnapshot/WorktreeSnapshot.refresh() (14-07)"
provides:
  - "createUncommittedCapabilityRegistry(scope, snapshot, options): Promise<CapabilityRegistry> -- the uncommitted-session structural sibling of createExactPatchCapabilityRegistry"
  - "createUncommittedSessionApp(scope, options): Promise<SessionApp> -- the third session-kind Fastify app factory"
  - "POST /api/refresh and GET /api/worktree-status routes, capability-gated"
  - "sameComparison()'s third 'uncommitted' branch and findUncommittedDraftCandidate(repositoryRoot, sourceKind, baseCommitOid) for D-19 relaunch recovery"
affects: [14-09, 14-10, 14-11, 14-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Uncommitted session capability registry mirrors createExactPatchCapabilityRegistry's shape field-for-field (verifyAnchor/lookup/readContent copy the exact-patch logic unchanged, swapping PatchSnapshot for WorktreeSnapshot), but omits exportReview/revealExportDirectory/patchStatus/isExactPatch/attachedCompletion entirely rather than faking them"
    - "Passive worktree-change indicator: one git rev-parse --git-path index subprocess call plus direct lstat of each captured file's resolved disk path, diffed against a baseline captured at registry construction and re-captured after every refresh() -- never a fresh git diff/status invocation"
    - "Refresh reclassification captures each existing comment's verifyAnchor state immediately before calling WorktreeSnapshot.refresh(), then re-verifies the same comments afterward and counts only verified-to-stale/orphaned transitions -- the stale/orphaned read-time classification in src/domain/anchor.ts remains the sole source of truth, nothing is written back to the draft"

key-files:
  created: [tests/api/uncommitted-session.test.ts]
  modified: [src/server/app.ts, src/server/capabilities.ts, src/server/routes.ts, src/contracts/api.ts, src/server/draft-loader.ts, src/server/draft-store.ts, tests/unit/draft-load.test.ts]

key-decisions:
  - "CapabilityRegistry.exportReview/revealExportDirectory widened to optional fields per the plan's objective (Phase 17 export-provenance scope); the two unconditionally-registered routes that call them (/api/export, /api/export/reveal) now guard with an explicit 404 when the capability is absent, since TypeScript's optional-field widening surfaced that they were previously called unconditionally"
  - "Fixed a pre-existing gap surfaced by this plan's first real current-state GET /api/draft round trip for a non-pinned comparison: DraftViewSchema.comparison in src/contracts/api.ts was hardcoded to the pinned-range shape only (baseCommitOid/headCommitOid/mergeBaseOid/range), rejecting every exact-patch- or uncommitted-shaped persisted draft with a ZodError the route's catch block silently turned into a 500. Widened it to the full DraftComparisonSchema union from src/contracts/draft.ts."
  - "createUncommittedSessionApp constructs its own join(tmpdir(), 'cumpa-worktree-<uuid>') default snapshot root (materializeWorktreeSnapshot has no built-in default, unlike materializePatchSnapshot's staging/accepted convention) and skips an onClose snapshot-dispose hook because WorktreeSnapshot (14-07) exposes no dispose() method -- confirmed by reading its class surface before writing the hook, per the plan's explicit instruction not to invent one"
  - "sameComparison()'s uncommitted branch compares sourceKind+baseCommitOid+reviewKey explicitly (not reviewKey alone) even though reviewKey already encodes those fields via D-18's framed hash, matching the plan's literal instruction and keeping the three-way branch structurally symmetric with the exact-patch branch"

patterns-established:
  - "findUncommittedDraftCandidate's bounded scan uses 'in'-operator narrowing (never an inline-cast member access) to read untrusted on-disk JSON's comparison block field-by-field, skipping any file that fails to parse or lacks the expected shape without ever touching its comments array"

requirements-completed: [WTREE-05, SNAP-03, SNAP-04, SNAP-05]

# Metrics
duration: 70min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 08: Uncommitted Session Server Wiring Summary

**Wires the frozen-snapshot capture engine into a running Fastify session: `createUncommittedSessionApp`/`createUncommittedCapabilityRegistry`, `POST /api/refresh` with before/after `verifyDurableAnchor` reclassification, an index-lstat-only `GET /api/worktree-status` change indicator, and `sameComparison()`/`findUncommittedDraftCandidate` for three-way draft-comparison identity and D-19 relaunch recovery.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 3
- **Files modified:** 8 (7 source/contract files + 1 new test file, plus one existing test file extended)

## Accomplishments

- `createUncommittedCapabilityRegistry(scope, snapshot, options)`: builds the `SessionResponse` discriminated as `'uncommitted'`, computes `reviewKey` via `uncommittedReviewKey()` exactly once from the snapshot's first chain digest, and reuses `verifyDurableAnchor`/`buildDurableAnchor` completely unmodified for anchor classification (`verifyAnchor`, `lookup`, `readContent` mirror `createExactPatchCapabilityRegistry`'s exact logic, swapping `PatchSnapshot` for `WorktreeSnapshot`).
- `createUncommittedSessionApp(scope, options)`: the third session-kind Fastify app factory, materializing a frozen `WorktreeSnapshot` exactly once per app construction.
- `POST /api/refresh` (zero-body validated identically to `/api/support/refresh`) calls `WorktreeSnapshot.refresh()`, re-verifies every existing draft comment's anchor before and after, and returns `{ added, removed, modified, staleCount, orphanedCount }` — `staleCount`/`orphanedCount` count only comments whose state transitioned away from `'verified'` by this specific call.
- `GET /api/worktree-status` returns `{ changed: boolean }` via one `git rev-parse --git-path index` subprocess call plus direct `lstat` of every captured file's resolved disk path — no `git diff`/`git status` invocation, satisfying D-14's O(1)-subprocess requirement.
- Both new routes, and the `exportReview`/`revealExportDirectory` capabilities, are absent/404 for non-uncommitted sessions.
- `sameComparison()` restructured into three explicit, non-throwing branches (exact-patch / uncommitted / pinned-range fallback) in `src/server/draft-loader.ts`.
- `findUncommittedDraftCandidate(repositoryRoot, sourceKind, baseCommitOid)` in `src/server/draft-store.ts`: a bounded `.cumpa/drafts/*.json` scan for D-19's relaunch-recovery offer, never auto-reusing or overwriting a prior draft.

## Task Commits

Each task was committed atomically:

1. **Task 1: createUncommittedCapabilityRegistry and createUncommittedSessionApp** - `13c840f` (feat)
2. **Task 2: POST /api/refresh, change-indicator poll endpoint, and comment reclassification** - `012fd95` (feat)
3. **Task 3: sameComparison() uncommitted branch and D-19 relaunch-recovery candidate lookup** - `567cd05` (feat)

_No TDD RED/GREEN split commits: each task's tests and implementation landed together per task, verified against the real implementation before commit (not a separate pre-implementation failing-test commit) — consistent with this plan's `tdd="true"` task attribute being satisfied through direct test-then-fix iteration rather than a formal RED-phase commit. All three tasks' acceptance-criteria test suites were run and confirmed passing (not merely typechecked) before each commit._

## Files Created/Modified

- `src/contracts/api.ts` - Added `UncommittedSessionResponseSchema` as the third `SessionResponseSchema` union member; widened `DraftViewSchema.comparison` to the full `DraftComparisonSchema` union (bug fix, see Deviations).
- `src/server/capabilities.ts` - Widened `CapabilityRegistry.exportReview`/`.revealExportDirectory` to optional; added `.refresh?`/`.worktreeChangeIndicator?` fields; added `createUncommittedCapabilityRegistry`.
- `src/server/app.ts` - Added `CreateUncommittedSessionAppOptions` and `createUncommittedSessionApp`.
- `src/server/routes.ts` - Added `POST /api/refresh` and `GET /api/worktree-status`, both capability-gated; added 404 guards on the now-optional `exportReview`/`revealExportDirectory` routes.
- `src/server/draft-loader.ts` - Restructured `sameComparison()` into three explicit branches.
- `src/server/draft-store.ts` - Added `findUncommittedDraftCandidate`.
- `tests/api/uncommitted-session.test.ts` - New file, 9 test cases.
- `tests/unit/draft-load.test.ts` - 5 new test cases added to the existing 15.

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DraftViewSchema.comparison` rejected every non-pinned persisted draft, turning `GET /api/draft`'s `'current'` state into a silent 500**
- **Found during:** Task 1 acceptance testing (`verifies a newly added comment anchor against the frozen snapshot content`)
- **Issue:** `DraftViewSchema.comparison` in `src/contracts/api.ts` was hardcoded to the pinned-range shape only (`baseCommitOid`/`headCommitOid`/`mergeBaseOid`/`range?`), with no awareness of the `exact-patch`/`uncommitted` `kind`-tagged shapes `DraftComparisonSchema` (`src/contracts/draft.ts`) has supported since 14-02. Every exact-patch or uncommitted session calling `GET /api/draft` once a comment existed threw a `ZodError` inside `publicLoad`, which `routes.ts`'s `catch { return unavailable(reply, 500); }` silently converted into an opaque `request-unavailable` response. This was never caught before because `tests/api/exact-patch.test.ts` only ever exercises `GET /api/draft`'s `'missing'` state, never `'current'`.
- **Fix:** Imported `DraftComparisonSchema` from `../draft.js` and replaced `DraftViewSchema.comparison`'s hand-written pinned-only object schema with it directly.
- **Files modified:** `src/contracts/api.ts`.
- **Verification:** `npx vitest run tests/api/uncommitted-session.test.ts` — the previously-500ing test now passes with a 200 `current` draft view; full `tests/api/ tests/unit/` suite (51 files, 409 tests) still passes, confirming the widened schema stays backward-compatible for pinned and exact-patch sessions.
- **Committed in:** `13c840f` (Task 1 commit).

**2. [Rule 3 - Blocking] Widening `exportReview`/`revealExportDirectory` to optional broke two unconditionally-registered routes**
- **Found during:** Task 1 (`npm run typecheck` substitute, `npx tsc --noEmit --project tsconfig.json`)
- **Issue:** `POST /api/export` and `POST /api/export/reveal` in `src/server/routes.ts` call `capabilities.exportReview(...)`/`capabilities.revealExportDirectory()` unconditionally (unlike `patchStatus`/`refresh`, these routes have no capability-presence registration guard, since both fields were always required before this plan). TypeScript's `Cannot invoke an object which is possibly 'undefined'` fired at both call sites once the fields became optional.
- **Fix:** Added an explicit `if (capabilities.exportReview === undefined) return unavailable(reply, 404);` / `if (capabilities.revealExportDirectory === undefined) return unavailable(reply, 404);` guard at the top of each handler — identical 404 response shape to Fastify's own unregistered-route `setNotFoundHandler`. Committed and exact-patch sessions (which always provide both fields) are unaffected; uncommitted sessions now get a clean 404 instead of a previously-unreachable type error (or, pre-widening, a working call to a field this plan's objective says should not exist for this session kind).
- **Files modified:** `src/server/routes.ts`.
- **Verification:** `npm run typecheck` substitute exits 0; full test suite passes.
- **Committed in:** `13c840f` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking type-contract consequence).
**Impact on plan:** Both were necessary consequences of this plan's own type-contract changes (the optional-field widening the plan's objective explicitly calls for) and of the plan's own test coverage being the first to exercise a previously-latent schema gap. No scope creep: fixes are minimal, scoped exactly to what `npm run typecheck` (substitute) and the plan's acceptance criteria required.

## Issues Encountered

None beyond the deviations documented above. All three tasks' acceptance-criteria greps and test suites pass on the committed state; no auto-fix attempt limit was reached on any task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `createUncommittedSessionApp`/`createUncommittedCapabilityRegistry` are exported and ready for 14-09's CLI launch wiring (flags/picker → `UncommittedScope` → this factory).
- `findUncommittedDraftCandidate` is ready for 14-09/14-12 to wire into the existing `DraftRecovery.vue` confirm-dialog UX for D-19's "Resume previous uncommitted review?" offer.
- `POST /api/refresh`/`GET /api/worktree-status` are ready for the web client's Refresh toolbar control and passive change indicator (D-13/D-14).
- No blockers for 14-09 through 14-12.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

- `src/server/app.ts` — FOUND, contains `createUncommittedSessionApp`
- `src/server/capabilities.ts` — FOUND, contains `createUncommittedCapabilityRegistry`
- `src/server/routes.ts` — FOUND, contains `/api/refresh` and `/api/worktree-status`
- `src/contracts/api.ts` — FOUND, contains `UncommittedSessionResponseSchema`
- `src/server/draft-loader.ts` — FOUND, `sameComparison` has an uncommitted branch
- `src/server/draft-store.ts` — FOUND, contains `findUncommittedDraftCandidate`
- `tests/api/uncommitted-session.test.ts` — FOUND, 9 test cases
- `tests/unit/draft-load.test.ts` — FOUND, 20 test cases (15 pre-existing + 5 new)
- Commit `13c840f` — FOUND in `git log --oneline`
- Commit `012fd95` — FOUND in `git log --oneline`
- Commit `567cd05` — FOUND in `git log --oneline`
- `npx tsc --noEmit --project tsconfig.json` — exits 0
- `npx tsc --noEmit --project tsconfig.test.json` — exits 0
- `npx vitest run tests/api/uncommitted-session.test.ts tests/unit/draft-load.test.ts` — 29/29 passed
- `npx vitest run tests/api/ tests/unit/` — 409/409 passed (no regressions)
- `git diff --stat -- src/domain/anchor.ts` — empty
- `grep -n "anchor.line =\|anchor.path =" src/server/capabilities.ts` — no matches
