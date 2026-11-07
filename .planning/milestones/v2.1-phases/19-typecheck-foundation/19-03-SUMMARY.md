---
phase: 19-typecheck-foundation
plan: 03
subsystem: ui
tags: [vue, typescript, vue-tsc, type-narrowing]

# Dependency graph
requires:
  - phase: 19-typecheck-foundation (19-01)
    provides: dual-alias TypeScript toolchain and widened tsconfig.web.json
provides:
  - "Single exported AttachedLifecycle type in src/web/model/review-draft-state.ts, consumed by App.vue and ReviewNotesDialog.vue"
  - "App.vue and ReviewNotesDialog.vue typechecking clean under vue-tsc --noEmit"
affects: [19-typecheck-foundation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared template-scoped TS unions live in review-draft-state.ts as a single `export type`, imported by every Vue SFC consumer instead of being redeclared locally (prevents nominal-type drift between structurally-similar local aliases)."
    - "A plain `v-else` branch that assumes a ref is defined is rewritten as `v-else-if=\"ref !== undefined\"` so vue-tsc's template control-flow analysis narrows that ref (and its properties) through the whole subtree, matching the precedent set in 19-02's DraftRecovery.vue fix."

key-files:
  created: []
  modified:
    - src/web/model/review-draft-state.ts
    - src/web/App.vue
    - src/web/components/ReviewNotesDialog.vue

key-decisions:
  - "Used App.vue's broader 7-member AttachedLifecycle union (including 'ordinary') as the single exported source of truth, since ReviewNotesDialog.vue's narrower 6-member consumer type is a strict subset and 'ordinary' is provably unreachable at that call site."
  - "Fixed App.vue's 4 remaining session.value errors (TS2322 x2, TS18048 x2) with a single structural narrowing change — changed the session-shell `v-else` to `v-else-if=\"session !== undefined\"` — rather than four separate per-site patches, since all four errors live in the same subtree and vue-tsc propagates the discriminant check through it."

patterns-established:
  - "Consolidate near-duplicate locally-scoped type aliases into one exported type in the shared model file rather than keeping structurally-overlapping-but-nominally-distinct per-component declarations."

requirements-completed: [TYPE-01]

# Metrics
duration: 25min
completed: 2026-11-04
status: complete
---

# Phase 19 Plan 03: AttachedLifecycle Consolidation & Remaining App.vue/ReviewNotesDialog.vue Type Fixes Summary

**Consolidated the two independently-declared `AttachedLifecycle` type aliases into one exported union in `review-draft-state.ts`, narrowed App.vue's session-shell template branch so vue-tsc resolves all four remaining `session.value` possibly-undefined errors, and fixed a copy-pasted `name="success"` icon typo — bringing both files to zero `vue-tsc` errors.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-11-04T16:14:42Z
- **Completed:** 2026-11-04T16:20:10Z (local)
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Single exported `AttachedLifecycle` type now lives in `src/web/model/review-draft-state.ts`; both App.vue and ReviewNotesDialog.vue import it instead of redeclaring structurally-overlapping-but-nominally-distinct local aliases — the `TS2719` duplicate-type-identity error is gone codebase-wide.
- App.vue's remaining 4 type errors (`TS2322`×2, `TS18048`×2), all `session.value` possibly-undefined reads inside the session-shell template subtree, resolved by changing that branch's `v-else` to `v-else-if="session !== undefined"`.
- Fixed ReviewNotesDialog.vue's copy-pasted `UiIcon name="success"` (not a member of `UiIconName`) to `name="check"`, matching the tone→icon convention used by `InlineNotice.vue` and `ReviewStateBadge.vue`.
- `App.vue` and `ReviewNotesDialog.vue` now report zero `vue-tsc --noEmit` errors (the remaining 6 of the phase's original 19-error backlog).

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate the duplicate AttachedLifecycle type into one exported source of truth** - `e4128c0` (refactor)
2. **Task 2: Narrow App.vue's remaining possibly-undefined session.value prop bindings** - `d133750` (fix)
3. **Task 3: Fix ReviewNotesDialog.vue's copy-pasted icon-name typo** - `0d77129` (fix)

**Plan metadata:** (final docs commit recorded below in completion output)

## Files Created/Modified
- `src/web/model/review-draft-state.ts` - Added `export type AttachedLifecycle` (7-member union) near `ReadOnlyDraftLoad`.
- `src/web/App.vue` - Removed local `AttachedLifecycle` type, imported the shared type; changed session-shell `v-else` to `v-else-if="session !== undefined"`.
- `src/web/components/ReviewNotesDialog.vue` - Removed local (narrower) `AttachedLifecycle` type, imported the shared type; fixed `UiIcon name="success"` → `name="check"`.

## Decisions Made
- The `AttachedLifecycle` superset union (App.vue's 7-member version, including `'ordinary'`) was chosen as the single source of truth over ReviewNotesDialog.vue's narrower 6-member version, since `'ordinary'` is structurally unreachable at ReviewNotesDialog's call site (App.vue only passes the `attached-lifecycle` prop when `isAttachedSession` is true).
- Task 2's four `session.value` errors were fixed with one structural template-narrowing change (`v-else-if="session !== undefined"`) rather than four separate inline patches, because all four error sites live inside the same `v-else` subtree and vue-tsc's control-flow analysis propagates a sibling discriminant check through the whole branch — this directly mirrors the precedent set by 19-02's `DraftRecovery.vue` fix (`v-else` → `v-else-if="load.kind === 'newerUnsupported'"`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Verification-script flaw] Acceptance-criteria grep for Task 2 substring-matches pre-existing strict-equality code**
- **Found during:** Task 2 (narrowing App.vue's session.value prop bindings)
- **Issue:** Task 2's `<acceptance_criteria>` includes `grep -c '== null\|!= null' src/web/App.vue` is `0`. The basic-regex alternation pattern `== null` is a substring of the already-present, intentional strict comparison `=== null` (e.g. `shellModalOpen`, `current.pending === null`, `current.conflict === null` — 8 pre-existing occurrences, none introduced by this plan). The grep therefore reports `8`, not `0`, independent of any change made in this task.
- **Fix:** No code change made — the pre-existing `=== null`/`!== null` comparisons are correct, strict-equality idiom (exactly what the plan elsewhere mandates) and are out of this task's scope (Task 2 touched only the session-shell `v-else` line). Verified my own change (`session !== undefined`) introduces zero loose-equality null/undefined comparisons.
- **Files modified:** None beyond the already-committed `src/web/App.vue` line 1258 change.
- **Verification:** The task's actual `<verify><automated>` gate — `vue-tsc --noEmit ... | grep -c 'App.vue(' | grep -qx 0 && playwright test tests/e2e/complete-review-draft.spec.ts` — passes cleanly (0 App.vue errors, 8/8 Playwright tests green).
- **Committed in:** `d133750` (Task 2 commit; no additional commit needed — this is a documentation-only deviation, not a code fix)

---

**Total deviations:** 1 auto-fixed/documented (1 verification-script false-positive, no code change)
**Impact on plan:** Zero impact on delivered code; the flawed acceptance-criteria grep is noted here so future plans don't mistake 19-03's unmodified pre-existing `=== null` comparisons for a regression.

## Issues Encountered
None beyond the documented verification-script false positive above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `App.vue` and `ReviewNotesDialog.vue` — the remaining 6 of the original 19-error phase 19 backlog — now typecheck clean, and `AttachedLifecycle` exists exactly once codebase-wide.
- Plan-level `<verification>` block confirmed: `vue-tsc --noEmit --project tsconfig.web.json 2>&1 | grep -c 'App.vue(\|ReviewNotesDialog.vue('` is `0`; all three named Playwright suites (`agent-ready-export-safety.spec.ts`, `complete-review-draft.spec.ts`, `review-notes-dialog.spec.ts`, 11 tests total) pass.
- No further work identified for this plan; phase 19's remaining backlog status should be reassessed against the phase-level requirement TYPE-01 by the orchestrator.

---
*Phase: 19-typecheck-foundation*
*Completed: 2026-11-04*

## Self-Check: PASSED

- FOUND: .planning/phases/19-typecheck-foundation/19-03-SUMMARY.md
- FOUND: e4128c0 (Task 1 commit)
- FOUND: d133750 (Task 2 commit)
- FOUND: 0d77129 (Task 3 commit)
