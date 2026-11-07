---
phase: 19-typecheck-foundation
plan: 02
subsystem: ui
tags: [vue, typescript, vue-tsc, type-narrowing, monaco, draft-recovery]

# Dependency graph
requires:
  - phase: 19-typecheck-foundation (plan 01)
    provides: dual-alias TypeScript toolchain and widened tsconfig.web.json full-tree vue-tsc gate
provides:
  - DiffWorkspace.vue typechecks clean under the full-tree vue-tsc gate (null-narrowed view-zone DOM ref)
  - DraftRecovery.vue typechecks clean under the full-tree vue-tsc gate (direct discriminant check on load.kind)
affects: [19-03, 19-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strict-equality null/undefined narrowing (`=== null`, `=== undefined`) for `querySelector`-returned DOM refs, never `==`/`!=` loose equality or `!` non-null assertion"
    - "Template-level discriminated-union narrowing via direct `v-else-if=\"x.kind === '<literal>'\"` checks instead of relying on a derived boolean ref's negation"

key-files:
  created: []
  modified:
    - src/web/components/DiffWorkspace.vue
    - src/web/components/DraftRecovery.vue

key-decisions:
  - "Also widened the onMounted ResizeObserver callback's zone guard (zone === null only) to zone === null || zone === undefined, since it queries the same host.value?.querySelector('.monaco-anchor-zone--composer') and vue-tsc flagged it once renderAnnotation()'s guard was fixed (same root-cause pattern named in 19-PATTERNS.md, not a new error class)"

patterns-established:
  - "Nullable DOM-ref guards in this file use strict `zone === null`/`zone === undefined` checks only"

requirements-completed: [TYPE-01]

# Metrics
duration: ~20min
completed: 2026-11-04
status: complete
---

# Phase 19 Plan 02: DiffWorkspace/DraftRecovery Type Fixes Summary

**Null-narrowed the `.monaco-anchor-zone--composer` DOM ref in DiffWorkspace.vue's `renderAnnotation()` and ResizeObserver callback, and replaced DraftRecovery.vue's untyped `v-else` with a direct `load.kind === 'newerUnsupported'` discriminant check — zero runtime change, 13 of the 19-error vue-tsc backlog eliminated.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-11-04
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `DiffWorkspace.vue` typechecks clean under `vue-tsc --noEmit --project tsconfig.web.json` (11 errors → 0)
- `DraftRecovery.vue` typechecks clean under the same gate (2 errors → 0)
- Both fixes reuse the component's own already-shipped idiom verbatim, per CONTEXT.md's runtime-unchanged requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: Null-narrow the view-zone DOM ref in DiffWorkspace.vue's renderAnnotation()** - `145d3cf` (fix)
2. **Task 2: Narrow DraftRecovery.vue's template branch on the discriminant directly** - `1ee5c40` (fix)

**Plan metadata:** pending (docs: complete plan — committed after this file)

## Files Created/Modified
- `src/web/components/DiffWorkspace.vue` - Widened the `renderAnnotation()` zone guard from `zone === undefined` to also exclude `zone === null`; widened the sibling `onMounted` ResizeObserver callback's guard from `zone === null` to also exclude `zone === undefined`, matching the same strict-equality idiom at both of the file's `.monaco-anchor-zone--composer` query sites
- `src/web/components/DraftRecovery.vue` - Changed the inner `<template v-else>` (reading `load.foundVersion`/`load.supportedVersion`) to `<template v-else-if="load.kind === 'newerUnsupported'">`, mirroring the script-side computeds' per-variant literal-check style

## Decisions Made
- Widened the `onMounted` ResizeObserver callback's own zone guard (previously only `zone === null`) in addition to `renderAnnotation()`'s guard, because it queries the identical nullable DOM ref and vue-tsc flagged it as part of the same 11-error `DiffWorkspace.vue` backlog once `renderAnnotation()` was fixed — in scope per the plan's instruction to "apply the identical strict-equality narrowing idiom at any further flagged call site in this file ... until the gate reports zero errors for this file."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Widened the onMounted ResizeObserver callback's zone guard to also exclude `undefined`**
- **Found during:** Task 1 (null-narrowing the `renderAnnotation()` zone ref)
- **Issue:** After fixing `renderAnnotation()`, `vue-tsc` still reported 4 errors in `DiffWorkspace.vue` at lines 378/380 inside the `onMounted` `ResizeObserver` callback — its own `.monaco-anchor-zone--composer` query guard only checked `zone === null`, leaving `HTMLElement | undefined` flowing into `resizeAnchorZoneToContent(zone: HTMLElement)` and direct property/method access.
- **Fix:** Widened the guard from `if (zone === null) return;` to `if (zone === null || zone === undefined) return;`, using the same strict-equality idiom the plan mandates — this was explicitly anticipated by the plan's Task 1 action text ("read the remaining `DiffWorkspace.vue` error lines ... apply the identical strict-equality narrowing idiom at any further flagged call site in this file").
- **Files modified:** `src/web/components/DiffWorkspace.vue`
- **Verification:** `vue-tsc --noEmit --project tsconfig.web.json` reports 0 errors for `DiffWorkspace.vue`; `anchored-workspace.spec.ts` and `anchored-review.spec.ts` Playwright suites pass (17/17).
- **Committed in:** `145d3cf` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, anticipated by the plan's own action text)
**Impact on plan:** No scope creep — this is the plan's named "any further flagged call site" case applied to the one remaining site, using the exact idiom the plan specifies.

### Note on acceptance-criteria regex false positive (non-blocking, no code change)

Task 1's acceptance-criteria bullet `grep -c '== null\|!= null' src/web/components/DiffWorkspace.vue` is `0` cannot be literally satisfied: the `grep` pattern `== null` is a substring of the plan's own mandated idiom `zone === null` (the `===` operator contains `==` followed by ` null`), so any file containing the required `zone === null` guard — including the file's pre-existing, correct `onMounted` guard, present before this plan started — will always report a non-zero count under this exact pattern. Confirmed via `grep -nP '(?<!=)== null|(?<!!)!= null' src/web/components/DiffWorkspace.vue` (lookbehind-excluded, true loose-equality check): zero matches, both before and after this plan's edits. No loose-equality (`==`/`!=`) null checks exist in the file. The authoritative `<verify><automated>` command for Task 1 (vue-tsc gate + Playwright suites) does not include this grep and passes cleanly; this is a spec-level regex artifact in the acceptance criteria text, not a code defect, and required no fix.

## Issues Encountered
None beyond the deviation and note documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `DiffWorkspace.vue` and `DraftRecovery.vue` are clean under the full-tree `vue-tsc` gate; 13 of the original 19-error/4-file backlog are resolved.
- Remaining backlog (confirmed via full-tree `vue-tsc --noEmit --project tsconfig.web.json` after this plan): `src/web/App.vue` (5 errors) and `src/web/components/ReviewNotesDialog.vue` (1 error) — out of scope for this plan, targeted by sibling plans 19-03/19-04.

---
*Phase: 19-typecheck-foundation*
*Completed: 2026-11-04*

## Self-Check: PASSED

- FOUND: `.planning/phases/19-typecheck-foundation/19-02-SUMMARY.md`
- FOUND: `145d3cf` (Task 1 commit)
- FOUND: `1ee5c40` (Task 2 commit)
