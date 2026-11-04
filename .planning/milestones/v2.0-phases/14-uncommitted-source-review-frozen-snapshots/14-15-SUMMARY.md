---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 15
subsystem: server
tags: [fastify, zod, draft-recovery, uncommitted-review, D-19]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "createUncommittedCapabilityRegistry/createUncommittedSessionApp (14-08), findUncommittedDraftCandidate (14-08), launchUncommittedSession's existing CLI discovery of a recovery candidate (14-09)"
provides:
  - "UncommittedSessionResponseSchema.uncommitted.recoveryAvailable?: true, present only when the session was launched with a recovery candidate"
  - "UncommittedDraftRecoveryResultSchema/UncommittedDraftRecoveryResult ('recovered' | 'unavailable')"
  - "loadUncommittedDraftCandidateComments(path): read-only loader validating a prior draft file through ReviewDraftV1Schema"
  - "CapabilityRegistryOptions.uncommittedRecoveryCandidate / CapabilityRegistry.recoverUncommittedDraft?()"
  - "POST /api/uncommitted/recover-draft, capability-gated"
  - "launchUncommittedSession threads the found candidate into createApp's options instead of only printing a console line"
affects: [14-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "recoverUncommittedDraft() copies a prior draft's comments one at a time through the existing draftStore.mutate() addComment/resolveComment path (never writing the candidate file directly), skipping an 'invalidTarget' result (duplicate anchor, already copied) and aborting the whole operation as 'unavailable' on any other non-accepted mutation result"
    - "Optional server-side capabilities/options follow the file's established `...(options.X === undefined ? {} : { ... })` conditional-spread style (matches attachedCompletion/support), rather than introducing a new pattern"

key-files:
  created: []
  modified:
    - src/contracts/api.ts
    - src/server/draft-store.ts
    - src/server/capabilities.ts
    - src/server/routes.ts
    - src/cli/run.ts
    - tests/api/uncommitted-session.test.ts

key-decisions:
  - "recoveryAvailable and recoverUncommittedDraft() are wired purely from options.uncommittedRecoveryCandidate's presence, with no comparison against the new session's own reviewKey; if a relaunch happens to produce the same content digest as the found candidate, the new session's draftStore already resumes that exact draft file by path, and a redundant recovery call becomes a harmless no-op (every comment hits 'invalidTarget' and is skipped) rather than a bug — matching the plan's literal instruction and D-19's framing of candidate discovery as source+base scoped, not digest-scoped."

requirements-completed: [WTREE-05]

# Metrics
duration: 45min
completed: 2026-10-31
status: complete
---

# Phase 14 Plan 15: Uncommitted Draft Recovery (Server/CLI) Summary

**Server and CLI half of D-19 relaunch-recovery: a `recoveryAvailable` session flag, a read-only prior-draft comment loader, a `recoverUncommittedDraft` capability that copies a prior draft's comments into the current draft via the existing mutation path, its gated `POST /api/uncommitted/recover-draft` route, and CLI wiring that threads the discovered candidate into the launched session instead of only printing a console line.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-31
- **Completed:** 2026-10-31
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- `UncommittedSessionResponseSchema`'s `uncommitted` object gains an optional `recoveryAvailable: true` flag, present only when the launched session carries a recovery candidate.
- New exported `UncommittedDraftRecoveryResultSchema`/`UncommittedDraftRecoveryResult` (`'recovered' | 'unavailable'`).
- `loadUncommittedDraftCandidateComments(path)` reads a prior draft file, validates it through `ReviewDraftV1Schema`, and returns `{body, state, anchor}` for each comment — `fs.readFile` only, never opens the path for writing.
- `CapabilityRegistryOptions.uncommittedRecoveryCandidate` / `CapabilityRegistry.recoverUncommittedDraft?()`: `createUncommittedCapabilityRegistry` wires both, copying each comment into the *current* draft through `draftStore.mutate({type:'addComment', ...})` (then `resolveComment` for comments that were `resolved`), skipping duplicate-anchor results and aborting as `'unavailable'` on any other failure — the prior draft file is never opened for writing.
- `POST /api/uncommitted/recover-draft` registered only when `capabilities.recoverUncommittedDraft` is present, mirroring `/api/refresh`'s exact zero-body guard (`request.body !== undefined || content-length not '0' || content-type present` → 400).
- `launchUncommittedSession` no longer prints `'A previous uncommitted review draft exists for this source. Cumpa will offer to resume it if the reviewed content has changed.'` (a notice that previously led nowhere); it instead threads `{ path: recoveryCandidate.path }` into `createApp(scope, {...})` as `uncommittedRecoveryCandidate`, reaching the capability registry.
- Two new integration tests in `tests/api/uncommitted-session.test.ts`: one builds a real prior-draft fixture (one `open` + one `resolved` comment, anchors built against the frozen snapshot's actual content), recovers it through the full HTTP stack, confirms both comments land in the new draft with originals bodies/anchors/resolved-state and `verified` anchor status, and proves the candidate file's on-disk bytes are byte-for-byte unchanged afterward; the other confirms `recoveryAvailable` is absent and the route 404s when no candidate was supplied.

## Task Commits

Each task was committed atomically:

1. **Task 1: Contracts for the recovery flag/result, and a read-only candidate-comments loader** - `ddf6e73` (feat)
2. **Task 2: recoverUncommittedDraft capability and its POST route** - `2ede755` (feat)
3. **Task 3: Thread the candidate into the launched session instead of only printing it** - `ec45c6d` (feat)
4. **Task 4: Integration test for the recovery capability and route** - `4e727cc` (test)

## Files Created/Modified
- `src/contracts/api.ts` - `recoveryAvailable` field on `UncommittedSessionResponseSchema`; new `UncommittedDraftRecoveryResultSchema`/`UncommittedDraftRecoveryResult`.
- `src/server/draft-store.ts` - `loadUncommittedDraftCandidateComments(path)`, placed directly after `findUncommittedDraftCandidate`.
- `src/server/capabilities.ts` - `CapabilityRegistryOptions.uncommittedRecoveryCandidate`, `CapabilityRegistry.recoverUncommittedDraft?`, both wired inside `createUncommittedCapabilityRegistry`.
- `src/server/routes.ts` - `POST /api/uncommitted/recover-draft`, capability-gated.
- `src/cli/run.ts` - removed the console-only recovery notice; threads `uncommittedRecoveryCandidate` into `createApp`'s options.
- `tests/api/uncommitted-session.test.ts` - two new integration tests covering the recovery capability and route end to end.

## Decisions Made
- `recoverUncommittedDraft()` is implemented as a named async method inside a single conditional spread (`...(options.uncommittedRecoveryCandidate === undefined ? {} : { async recoverUncommittedDraft() {...} })`), matching the plan's literal specified code exactly rather than refactoring into a separately-named local function — see "Known Minor Deviations" below for the one place this produced a literal-count mismatch against the plan's own acceptance criteria.
- No comparison between the new session's own `reviewKey` and the candidate's `reviewKey` was added before exposing `recoveryAvailable` — see `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written; no bugs, missing-critical-functionality, or blocking issues were discovered during implementation.

### Known Minor Deviations (documented, not auto-fixed)

**1. [Acceptance-criteria miscount, no code change] `grep -c "recoverUncommittedDraft" src/server/capabilities.ts` is `2`, not the plan's stated "at least 3"**
- **Found during:** Task 2 acceptance-criteria verification
- **Issue:** The plan's Task 2 action text specifies the exact code to write verbatim (`CapabilityRegistryOptions.uncommittedRecoveryCandidate`, `CapabilityRegistry.recoverUncommittedDraft?`, and the one method definition inside `createUncommittedCapabilityRegistry`'s conditional spread) — that literal code produces exactly 2 occurrences of the string `recoverUncommittedDraft` in the file, not the "at least 3" the plan's own acceptance criterion predicted.
- **Resolution:** Implemented the action text exactly as specified (verified correct by `npx tsc --noEmit` and the full `tests/api/uncommitted-session.test.ts` suite passing, including the two new recovery tests). Did not add a padding comment or restructure into a named local-function-then-spread purely to inflate the grep count, since the file has no existing inline-comment convention and the codebase strongly prefers boring, literal implementations over code shaped to satisfy a miscounted heuristic.
- **Files affected:** `src/server/capabilities.ts`.
- **Verification:** `npx tsc --noEmit --project tsconfig.json` exits 0; `npx vitest run tests/api/uncommitted-session.test.ts` passes (11/11, including both new tests exercising `recoverUncommittedDraft` through the real HTTP route).
- **Committed in:** `2ede755` (Task 2 commit).

---

**Total deviations:** 0 auto-fixed, 1 documented acceptance-criteria miscount (no functional impact).
**Impact on plan:** None on behavior or test coverage. The literal code the plan specified was implemented verbatim; only one of the plan's own grep-based acceptance thresholds for that code undercounted itself.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `recoveryAvailable` on `GET /api/session` and `POST /api/uncommitted/recover-draft` are ready for 14-16 to build the browser-side `DraftRecovery.vue` confirm-dialog UX ("Resume previous uncommitted review?") that calls this route on acceptance.
- `findUncommittedDraftCandidate`'s path discovery (14-08) and this plan's threading through `createApp` together mean a full CLI launch with a differing-content prior draft now surfaces `recoveryAvailable: true` to the browser session with no further server/CLI work required.
- No blockers for 14-16.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-31*

## Self-Check: PASSED
- `src/contracts/api.ts` FOUND, contains `recoveryAvailable` (1 occurrence) and `UncommittedDraftRecoveryResultSchema`.
- `src/server/draft-store.ts` FOUND, contains `loadUncommittedDraftCandidateComments`.
- `src/server/capabilities.ts` FOUND, contains `recoverUncommittedDraft` and `uncommittedRecoveryCandidate`.
- `src/server/routes.ts` FOUND, contains `/api/uncommitted/recover-draft`.
- `src/cli/run.ts` FOUND, no longer contains "A previous uncommitted review draft exists"; contains `uncommittedRecoveryCandidate`.
- `tests/api/uncommitted-session.test.ts` FOUND, 11 test cases (9 pre-existing + 2 new).
- Commit `ddf6e73` FOUND in `git log --oneline`.
- Commit `2ede755` FOUND in `git log --oneline`.
- Commit `ec45c6d` FOUND in `git log --oneline`.
- Commit `4e727cc` FOUND in `git log --oneline`.
- `npx tsc --noEmit --project tsconfig.json` — exits 0.
- `npx vitest run tests/api/uncommitted-session.test.ts tests/cli/selection.test.ts tests/cli/errors.test.ts` — 50/50 pass.
