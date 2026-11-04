---
phase: 17-agent-protocol-extension-marketplace-skill
plan: 01
subsystem: api
tags: [zod, request-validation, agent-protocol, cli]
requires:
provides:
  - "AgentReviewRequestSchema uncommitted/files discriminated-union branches"
  - "AgentRequestErrorKind extended taxonomy (unknown-mode, base-with-unstaged, path-outside-repository, pathspec-no-match, pathspec-ignored)"
  - "exported GitArgumentSchema"
affects:
  - "17-04 (cli/run.ts Git-dependent dispatch for uncommitted/files modes)"
tech-stack:
  added: []
  patterns:
    - "Zod .superRefine() for cross-field validation (base-with-unstaged) inside a strictObject().readonly() scope schema"
    - "Priority-ordered ternary chain of pre-check helpers (isUnsupportedVersion/isUnknownMode/isBaseWithUnstaged) for picking the most specific AgentRequestErrorKind before falling back to invalid-request"
key-files:
  created:
    - tests/unit/agent-request.test.ts
  modified:
    - src/contracts/request.ts
    - src/cli/request.ts
    - src/cli/run.ts
key-decisions:
  - "Promoted GitArgumentSchema from module-private to exported (Pitfall 5 in plan) - no other call-site risk, grep confirmed no prior importers"
  - "src/cli/run.ts's revisions dispatch (outside this plan's files_modified) accessed request.revisions without narrowing to mode==='revisions'; widening the discriminated union to 4 modes broke typecheck. Added a minimal explicit `request.mode !== 'revisions'` guard that throws for the not-yet-dispatched uncommitted/files modes, since Plan 17-04 replaces this whole dispatch block with real Git-dependent handling"
patterns-established:
  - "Field names in new request scope schemas (source, base, pathspecs, paths) mirror Phase 14/15 CLI flag vocabulary exactly for consistency"
requirements-completed: [AGENT-06, AGENT-07, AGENT-09]
duration: 10min
completed: 2026-10-31
status: complete
---

# Phase 17 Plan 01: Agent Request Contract - Uncommitted/Files Modes Summary

**Extended `AgentReviewRequestSchema`'s discriminated union with `uncommitted` (source + optional base + optional pathspecs) and `files` (paths) modes, plus five new `AgentRequestErrorKind` values (`unknown-mode`, `base-with-unstaged`, `path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) in the stdin request-validation error channel.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-31T16:43:22+01:00 (RED commit)
- **Completed:** 2026-10-31T16:46:02+01:00 (GREEN commit)
- **Tasks:** 2
- **Files modified:** 3 (2 implementation + 1 new test file), plus 1 out-of-scope deviation fix (`src/cli/run.ts`)

## Accomplishments

- `AgentReviewRequestSchema` now accepts four `mode` discriminants (`revisions`, `patch`, `uncommitted`, `files`); `revisions`/`patch` parsing is byte-for-byte unchanged, verified by re-asserting the pre-existing fixture shapes in the new test file.
- `uncommitted` mode's `UncommittedRequestScopeSchema` enforces `source: 'unstaged'` cannot combine with `base` via `.superRefine()`, rejecting at the Zod level before any Git call.
- `files` mode's `FilesRequestScopeSchema` requires at least one path (`.min(1)`).
- `readAgentReviewRequest` now distinguishes `unknown-mode` and `base-with-unstaged` from the generic `invalid-request` fallback via a priority-ordered pre-check chain, and `path-outside-repository`/`pathspec-no-match`/`pathspec-ignored` exist with messages ready for Plan 17-04's Git-dependent dispatch to throw.
- `GitArgumentSchema` is exported for reuse by this plan's tests and future plans.
- 14 new unit tests cover schema acceptance/rejection, frozen round-tripping through `readAgentReviewRequest`, and the new error-kind priority chain.

## Task Commits

Each task committed atomically:

1. **Task 1 (RED): failing tests for uncommitted/files request modes** - `5b75e71` (test)
2. **Task 2 (GREEN): uncommitted/files request schemas + extended error taxonomy** - `0a92585` (feat) — includes the Rule 3 deviation fix to `src/cli/run.ts`

_TDD plan: RED commit precedes GREEN commit; no REFACTOR commit was needed._

## Files Created/Modified

- `tests/unit/agent-request.test.ts` - 14 new Vitest cases covering both new schema branches, the `base-with-unstaged` superRefine rejection, unchanged `revisions`/`patch` parsing, and frozen round-trips through `readAgentReviewRequest`
- `src/contracts/request.ts` - exported `GitArgumentSchema`; added `UncommittedSourceSchema`, `UncommittedRequestScopeSchema`, `UncommittedRequestSchema`, `FilesRequestScopeSchema`, `FilesRequestSchema`; extended `AgentReviewRequestSchema`'s `discriminatedUnion` to 4 members
- `src/cli/request.ts` - extended `AgentRequestErrorKind` to 11 members total; added `isUnknownMode`/`isBaseWithUnstaged` pre-check helpers; extended the `safeParse`-failure ternary into a 4-way priority chain; extended `freezeRequest`'s `if/else` into an `if/else if/else if/else` chain covering all 4 modes
- `src/cli/run.ts` (deviation, outside plan's `files_modified`) - added an explicit `request.mode !== 'revisions'` guard before destructuring `request.revisions`, since the widened union broke TypeScript's narrowing in `runOrdinaryAction`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/cli/run.ts` typecheck broke after widening `AgentReviewRequestSchema`'s union**
- **Found during:** Task 2 (GREEN), running `npm run typecheck:tests:node` per the plan's `<verification>` block
- **Issue:** `runOrdinaryAction` in `src/cli/run.ts` (not in this plan's `files_modified`) handled `mode === 'patch'` explicitly, then unconditionally destructured `request.revisions.{base,head,pathspecs}` assuming the only remaining case was `revisions`. Widening the union to include `uncommitted`/`files` made that destructure a type error (`Property 'revisions' does not exist on type ...`), since TypeScript could no longer narrow to `revisions` alone.
- **Fix:** Added `if (request.mode !== 'revisions') { throw new Error(...) }` immediately after the `patch` branch, before the `revisions`-only destructure. This preserves existing runtime behavior for `patch`/`revisions` exactly and fails loudly (rather than reading `undefined` properties) for the not-yet-dispatched `uncommitted`/`files` modes. Plan 17-04 replaces this entire dispatch block with real Git-dependent handling for all four modes.
- **Files modified:** `src/cli/run.ts`
- **Verification:** `npm run typecheck:tests:node` passes with zero errors; `tests/cli/request.test.ts` and `tests/cli/selection.test.ts` (56 tests, both exercise `runOrdinaryAction`) still pass with no regressions.
- **Committed in:** `0a92585` (Task 2 GREEN commit)

## Issues Encountered

None beyond the deviation above - plan's own files (`src/contracts/request.ts`, `src/cli/request.ts`, `tests/unit/agent-request.test.ts`) implemented exactly as specified.

## Known Stubs

None - this plan is pure schema/error-taxonomy, no UI or data-wiring surface.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-17-01 through T-17-04), all of which are implemented exactly as specified: `GitArgumentSchema` bounds every `pathspecs`/`paths` element, `MAX_PATHSPEC_COUNT`/`.min(1)` bound array length, new error messages name only structural defects, and `freezeRequest`'s new branches match the existing freeze discipline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`AgentReviewRequestSchema` and `AgentRequestErrorKind` are ready for Plan 17-04's `cli/run.ts` dispatch to consume: the three Git-dependent error kinds (`path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) have messages but are not yet thrown anywhere — 17-04 throws them after Git resolution per RESEARCH.md Pattern 4, and must also replace the `src/cli/run.ts` placeholder guard added in this plan's deviation fix with real `uncommitted`/`files` dispatch logic.

---

*Phase: 17-agent-protocol-extension-marketplace-skill*
*Completed: 2026-10-31*

## Self-Check: PASSED
