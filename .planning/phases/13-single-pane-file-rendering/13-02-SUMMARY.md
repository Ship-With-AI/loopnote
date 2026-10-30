---
phase: 13-single-pane-file-rendering
plan: 02
subsystem: ui
tags: [vue, zod, contracts, git-mode, fastify]

# Dependency graph
requires:
  - phase: 13-single-pane-file-rendering (13-01)
    provides: monaco diff adapter and DiffSide-aware line mapping this plan's DiffSide re-export relies on
provides:
  - "singlePaneSideFor(kind, availability): pure D-05/D-08 routing decision for which status kinds render single-pane and which DiffSide anchors their comments"
  - "wasModeKind(oldMode): pure D-06 git-mode-to-label derivation (symlink/submodule/raw-mode fallback)"
  - "SessionFileSchema.oldMode on the client-facing /api/session response (both pinned-range and exact-patch sessions)"
affects: [13-03-app-vue-single-pane-wiring, 13-04-active-file-toolbar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "src/web/model/*.ts pure-function modules: small, independently vitest-testable business logic with zero server-only imports, consumed identically by multiple Vue components"

key-files:
  created:
    - src/web/model/single-pane-layout.ts
    - tests/unit/single-pane-layout.test.ts
  modified:
    - src/contracts/api.ts
    - src/server/capabilities.ts
    - src/server/patch-snapshot.ts
    - tests/api/session.test.ts

key-decisions:
  - "wasModeKind lookup table duplicates the two literal git modes ('120000', '160000') already hardcoded in src/git/availability.ts rather than importing that module, per D-06's explicit instruction to avoid adding git plumbing and RESEARCH.md Pitfall 2's independent-concerns guidance."
  - "Added only oldMode (not newMode) to SessionFileSchema since D-06's label derivation needs only the Base side's prior mode; newMode stays exclusive to FileMetadataResponseSchema to avoid unrequested scope."

patterns-established:
  - "D-05/D-08 single-pane routing and D-06 mode-to-label derivation live in one pure-function module so every Vue consumer (App.vue, ActiveFileToolbar.vue, StatusBadge.vue) reads the same decision instead of re-deriving it."

requirements-completed: [PANE-03]

# Metrics
duration: 2min
completed: 2026-10-30
status: complete
---

# Phase 13 Plan 02: Single-pane routing and type-changed label derivation Summary

**Pure `singlePaneSideFor`/`wasModeKind` functions centralizing D-05/D-06/D-08's routing and label logic, plus the missing `oldMode` field on the `/api/session` wire contract that `wasModeKind` depends on.**

## Performance

- **Duration:** ~2 min (active task-commit span; research/context-reading preceded first commit)
- **Started:** 2026-10-30T13:58:51Z
- **Completed:** 2026-10-30T14:00:49Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `src/web/model/single-pane-layout.ts` exports `singlePaneSideFor(kind, availability)` and `wasModeKind(oldMode)`, fully unit-tested against all 9 behavior cases from the plan, with zero dependency on `src/domain/` or `src/git/`.
- `SessionFileSchema` now carries `oldMode: GitModeSchema`, and both session-construction sites (`capabilities.ts`'s `/api/session` route, `patch-snapshot.ts`'s exact-patch `session()`) populate it from `file.oldMode`.
- `tests/api/session.test.ts`'s strict-DTO test proves the exact `oldMode` value round-trips over the wire with no other field added.

## Task Commits

Each task was committed atomically (RED → GREEN, no REFACTOR needed):

1. **Task 1: Pure single-pane routing and type-changed label derivation**
   - `02bd887` (test) — failing test for `singlePaneSideFor`/`wasModeKind` covering all 9 behavior cases
   - `107945b` (feat) — implementation; all tests pass, `npm run typecheck:web` exits 0
2. **Task 2: Add the missing oldMode field to the client-facing session contract**
   - `e84284a` (test) — failing test asserting `oldMode` in the `/api/session` strict-DTO response
   - `e77ee29` (feat) — `SessionFileSchema` + both server construction sites; session/exact-patch tests pass, both typecheck targets exit 0

**Plan metadata:** (this commit, created after summary)

## Files Created/Modified
- `src/web/model/single-pane-layout.ts` — `singlePaneSideFor`, `wasModeKind` pure functions
- `tests/unit/single-pane-layout.test.ts` — 12 unit tests, all 9 plan behavior cases plus 3 additional status-kind side-by-side cases (modified/renamed/copied enumerated individually, matching existing `describe`/`it` style rather than one combined assertion)
- `src/contracts/api.ts` — `SessionFileSchema.oldMode: GitModeSchema` added after `status`
- `src/server/capabilities.ts` — `sessionFile` object literal (the `/api/session` wire shape) now includes `oldMode: file.oldMode`
- `src/server/patch-snapshot.ts` — exact-patch `session()`'s file-list map object now includes `oldMode: file.oldMode`
- `tests/api/session.test.ts` — strict-DTO test's expected `files` array now asserts `oldMode: '100644'` on both fixture files

## Decisions Made
- See `key-decisions` in frontmatter: (1) `wasModeKind`'s mode-literal table independently duplicates `src/git/availability.ts`'s two literals rather than importing it, per D-06 and RESEARCH.md Pitfall 2; (2) only `oldMode` (not `newMode`) was added to `SessionFileSchema`, matching the plan's explicit scope limit.

## Deviations from Plan

None - plan executed exactly as written. One minor wording note on the plan itself (not a deviation in implementation): Task 2's acceptance criterion "`grep -n \"oldMode: GitModeSchema\" src/contracts/api.ts` shows exactly one match" literally returns two matches post-edit (`SessionFileSchema` at line 315, plus the pre-existing `FileMetadataResponseSchema` occurrence at line 673, which the plan's own `<read_first>` section correctly identifies as already present before this plan). The substantive intent — exactly one *new* `oldMode: GitModeSchema` occurrence, inside `SessionFileSchema` — was verified directly by reading both schema blocks and confirmed by the plan's own `<verification>` block (`newMode` count on `api.ts` unchanged, confirming no scope creep). No code change was needed; this is a documentation note only.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `singlePaneSideFor` and `wasModeKind` are ready for 13-03 (`App.vue` computing `singlePaneSide` and threading it into `DiffWorkspace.vue`) and 13-04 (`ActiveFileToolbar.vue` calling `wasModeKind(selectedFile.oldMode)` for the "was `<kind>`" label).
- `SessionFileSchema.oldMode` is live on both `/api/session` response paths, so 13-04's label derivation has the data it needs with no new network request.
- No blockers.

## Self-Check: PASSED
- `src/web/model/single-pane-layout.ts` — FOUND
- `tests/unit/single-pane-layout.test.ts` — FOUND
- Commits `02bd887`, `107945b`, `e84284a`, `e77ee29` — all FOUND in `git log --oneline --all`

---
*Phase: 13-single-pane-file-rendering*
*Completed: 2026-10-30*
