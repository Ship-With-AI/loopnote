---
phase: 17-agent-protocol-extension-marketplace-skill
plan: 03
subsystem: api
tags: [capability-registry, attached-completion, review-export, working-tree-drift, typescript]

# Dependency graph
requires:
  - phase: 17-agent-protocol-extension-marketplace-skill (17-02)
    provides: buildReviewExportV5/V6 export builders, ReviewExportV5/V6 Zod schemas, WorkingTreeDriftFlag/UncommittedExportScope/StandaloneExportScope types in src/contracts/draft.ts and src/export/review-export.ts
provides:
  - "collectWorkingTreeDrift() helper on createUncommittedCapabilityRegistry and createStandaloneCapabilityRegistry that walks every changed file (never short-circuits) and returns a full WorkingTreeDriftFlag"
  - "attachedCompletion capability on createUncommittedCapabilityRegistry (delivers ReviewExportV5) and createStandaloneCapabilityRegistry (delivers ReviewExportV6) via the existing AttachedCompletionCoordinator one-shot Finish transaction"
  - "CapabilityRegistryOptions.requestPathspecs optional field for agent-driven uncommitted sessions (Plan 17-04 will populate it from request.uncommitted.pathspecs)"
affects: [17-04-agent-protocol-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Finish-time drift accumulation loops every changed file into a paths array instead of early-returning on the first match (RESEARCH.md Pitfall 3)", "Narrowed discriminant properties captured into a local const before being read inside a nested closure passed to draftStore.settle(), since TS control-flow narrowing on object properties does not survive into nested function literals"]

key-files:
  created: []
  modified:
    - src/server/capabilities.ts

key-decisions:
  - "Drift is always included in the delivered V5/V6 document, never used to reject Finish, per D-03"
  - "Stale/orphaned comment anchor handling in attachedCompletion.finish stays byte-identical to the pinned/exact-patch registries' verification/staleAnchors short-circuit, per D-02 (RESEARCH.md Amendment: Phase 16 owns that classification, Phase 17 does not change it)"
  - "collectWorkingTreeDrift is duplicated (not extracted to a shared helper) between the two registries, matching the file's existing precedent of duplicating worktreeChangeIndicator/captureChangeBaseline/diskPathFor rather than de-duplicating across registries"
  - "createUncommittedCapabilityRegistry's createStandaloneCapabilityRegistry does not gain a manual exportReview/UI-export method in this plan; only the agent attachedCompletion path was in scope (AGENT-06/AGENT-07), per RESEARCH.md's Open Question"

patterns-established:
  - "Capture a discriminant property narrowed by an early-throw guard clause into a local const immediately after the guard, for later use inside nested async closures (draftStore.settle's prepare/finalize) where TypeScript's control-flow narrowing does not propagate"

requirements-completed: [AGENT-06, AGENT-07, AGENT-08]

# Metrics
duration: 10min
completed: 2026-10-31
status: complete
---

# Phase 17 Plan 03: attachedCompletion wiring for uncommitted/standalone registries Summary

**Added a drift-accumulating `collectWorkingTreeDrift()` helper and wired `attachedCompletion` (ReviewExportV5/V6 delivery via the existing `AttachedCompletionCoordinator`) into `createUncommittedCapabilityRegistry` and `createStandaloneCapabilityRegistry`, closing the gap where agent-attached uncommitted/standalone sessions had no way to ever receive a Finish result.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-31T17:03:12+01:00 (immediately after 17-02's metadata commit)
- **Completed:** 2026-10-31T17:10:27+01:00
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `createUncommittedCapabilityRegistry` and `createStandaloneCapabilityRegistry` both now expose `attachedCompletion` (`status`, `markResponseSettled`, `finish`), matching the shape every other registry already exposes on `CapabilityRegistry`.
- Finish-time working-tree drift detection now reports every changed path (not just the first found), via a new `collectWorkingTreeDrift(): Promise<WorkingTreeDriftFlag>` helper added to both registries.
- `attachedCompletion.finish` on the uncommitted registry builds and delivers a canonical `ReviewExportV5` document (`uncommitted` provenance incl. `sourceKind`, `baseCommitOid`, `pathspecs`, `reviewKey`, `snapshotChain`, plus the full drift flag).
- `attachedCompletion.finish` on the standalone registry builds and delivers a canonical `ReviewExportV6` document, reusing `exportReview`'s existing `standaloneScope` construction (`originalArguments`, `resolvedPaths`, `fileDigests`, `snapshotChain`, `reviewKey`) verbatim rather than duplicating a second slightly different version.

## Task Commits

1. **Task 1: Add the drift-accumulation helper to both registries** - `d84c681` (feat)
2. **Task 2: Wire attachedCompletion into createUncommittedCapabilityRegistry and createStandaloneCapabilityRegistry** - `772a5d7` (feat)

_Note: Task 1's commit also included the `buildReviewExportV5`/`buildReviewExportV6` import additions and the new `CapabilityRegistryOptions.requestPathspecs` field — groundwork the plan assigned to Task 2's action block but which was added alongside the import edit for Task 1 to avoid a half-wired intermediate state. No functional code depends on this ordering difference; both tasks' `<verify>` commands pass independently against the final state._

## Files Created/Modified
- `src/server/capabilities.ts` - Added `WorkingTreeDriftFlag` type import, `buildReviewExportV5`/`buildReviewExportV6` imports, `CapabilityRegistryOptions.requestPathspecs?: readonly string[]`, `collectWorkingTreeDrift()` + `attachedCompletion` on `createUncommittedCapabilityRegistry`, `collectWorkingTreeDrift()` + `attachedCompletion` on `createStandaloneCapabilityRegistry`, and a `const sourceKind = scope.sourceKind;` capture in `createUncommittedCapabilityRegistry` to preserve the `'standalone'`-excluded narrowing inside the nested `draftStore.settle()` closure.

## Decisions Made
- Followed the exact-patch registry's `attachedCompletion` template verbatim for both registries, substituting only: the scope-validity check (replaced by always-computed `collectWorkingTreeDrift()`, never rejects per D-03), the export builder (`buildReviewExportV5`/`V6` instead of `V3`), the provenance scope object, and the `finalize` schema-version check (`5`/`6` instead of `3`).
- Left the `verification`/`affectedCommentIds`/`staleAnchors` short-circuit in both `prepare` and `finalize` byte-identical to the already-shipped registries (D-02 — unaffected by this plan).
- Did not add the scope-invalid check the exact-patch template had in `finalize` (`snapshot.exportScope()`), because `WorktreeSnapshot` (used by both the uncommitted and standalone registries) has no `exportScope()` method — that check was specific to `PatchSnapshot`'s immutable-patch model and has no equivalent for live-worktree sessions, consistent with D-03 only ever reporting drift, never rejecting on it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2322 narrowing loss across a nested closure boundary**
- **Found during:** Task 2 (wiring `attachedCompletion` into `createUncommittedCapabilityRegistry`)
- **Issue:** `scope.sourceKind` is narrowed to exclude `'standalone'` by an early `if (scope.sourceKind === 'standalone') throw` guard at the top of the function, but TypeScript's control-flow narrowing on an object property does not survive into the nested arrow function passed to `draftStore.settle()`'s `prepare` callback. `tsc --noEmit` reported: `Type '"staged" | "standalone" | "unstaged" | "worktree"' is not assignable to type '"staged" | "unstaged" | "worktree"'` when passing `scope.sourceKind` into `buildReviewExportV5`'s `UncommittedExportScope.sourceKind` field.
- **Fix:** Added `const sourceKind = scope.sourceKind;` immediately after the guard clause (where the narrowed type is still in effect) and used that local `const` — which TypeScript's closures do retain the narrowed type for — inside the `attachedCompletion` build call instead of re-reading `scope.sourceKind`.
- **Files modified:** `src/server/capabilities.ts`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` and `npm run typecheck:tests:node` both pass with zero errors.
- **Committed in:** `772a5d7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/bug)
**Impact on plan:** Necessary for `src/server/capabilities.ts` to typecheck as the plan's Task 2 `<done>` criteria requires. No scope creep — no other files touched, no behavior change beyond making the compiler accept the already-correct runtime narrowing.

## Issues Encountered
None beyond the TS2322 deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both uncommitted and standalone capability registries now return a fully wired `attachedCompletion`, so Plan 17-04 (agent protocol dispatch) can route `mode:'uncommitted'`/`mode:'files'` agent requests to `launchAttachedSession` and expect a `ReviewExportV5`/`ReviewExportV6` document to reach the agent's stdout when the developer clicks Finish.
- `CapabilityRegistryOptions.requestPathspecs` is in place for Plan 17-04 to populate from `request.uncommitted.pathspecs`; `createUncommittedCapabilityRegistry` already reads `options.requestPathspecs ?? []`.
- No blockers identified.

---
*Phase: 17-agent-protocol-extension-marketplace-skill*
*Completed: 2026-10-31*

## Self-Check: PASSED
