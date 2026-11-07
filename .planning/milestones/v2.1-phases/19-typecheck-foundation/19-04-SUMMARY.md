---
phase: 19-typecheck-foundation
plan: 04
subsystem: testing
tags: [ci, vue-tsc, typecheck, github-actions, playwright, deploy-guard]

requires:
  - phase: 19-typecheck-foundation (plans 01-03)
    provides: vue-tsc dual-alias toolchain, typecheck:web script, and the full 19-error fix-work backlog closed to zero across App.vue/DiffWorkspace.vue/DraftRecovery.vue/ReviewNotesDialog.vue
provides:
  - "npm run typecheck:web" wired into the repository-gates CI job, immediately after typecheck:tests
  - The repository-gates command-string contract kept in lockstep across all three pinned locations (workflow YAML, verify-supabase-support.mjs's required + gateCommands arrays, support-payment.spec.ts's mutation-coverage cases)
  - A permanent, committed, re-runnable proof (scripts/verify-typecheck-negative-gate.mjs, npm run verify:typecheck-negative-gate) that the typecheck gate actually fails on a real TS2322 error and cleanly reverts to zero
  - Confirmed npm run typecheck:web exits 0 with zero errors across the whole src/web tree, no baseline/allowlist
affects: [phase-20]

tech-stack:
  added: []
  patterns:
    - "CI Contract Wiring: a repository-gates command string added to the YAML must be mirrored verbatim in verify-supabase-support.mjs's required array AND its job-scoped gateCommands array, plus a new mutation-coverage row in support-payment.spec.ts's cases array, in the same commit."
    - "Negative-gate proof scripts (verify-typecheck-negative-gate.mjs) mutate a real source file in place, assert the expected compiler error code, then restore original bytes in a finally block so the repo is never left mutated even on assertion failure."

key-files:
  created:
    - scripts/verify-typecheck-negative-gate.mjs
  modified:
    - .github/workflows/deploy-supabase-production.yml
    - scripts/verify-supabase-support.mjs
    - tests/e2e/support-payment.spec.ts
    - package.json

key-decisions:
  - "Added npm run typecheck:web to verify-supabase-support.mjs's required array (whole-workflow) and gateCommands array (repository-gates-scoped) only — not the third, separate commands Set loop at line 1741 — because the plan's literal acceptance criterion (grep -c \"npm run typecheck:web\" == 2) and explicit read_first only names those two locations; the third loop is a redundant whole-workflow check already satisfied by the required array."

requirements-completed: [TYPE-01]

duration: 3min
completed: 2026-11-04
status: complete
---

# Phase 19 Plan 04: CI Gate Wiring + Negative-Gate Proof Summary

**Wired `npm run typecheck:web` into the `repository-gates` CI job across all three pinned-command locations, added a permanent `verify-typecheck-negative-gate.mjs` script proving the gate fails on a real `TS2322` and cleanly reverts, and confirmed `typecheck:web` is genuinely green (0 errors, no baseline) across the whole `src/web` tree.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-04T16:22:51Z
- **Completed:** 2026-11-04T16:26:02Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `.github/workflows/deploy-supabase-production.yml`'s `repository-gates` job now runs `npm run typecheck:web` immediately after `typecheck:tests`, so a `.vue`/`.ts` type error under `src/web` fails CI on `main`.
- `scripts/verify-supabase-support.mjs`'s `verifyWorkflow()` — both the whole-workflow `required` array and the `repository-gates`-scoped `gateCommands` array — now assert the new step is present, keeping the deploy-guard's own verifier consistent with the YAML.
- `tests/e2e/support-payment.spec.ts`'s mutation-coverage loop gained a `['web typecheck', ...]` row proving the verifier rejects a workflow where the pinned command is swapped for a plausible-looking wrong one.
- `scripts/verify-typecheck-negative-gate.mjs` is a new, permanent, committed script (`npm run verify:typecheck-negative-gate`) that injects a numeric literal into `PathDisplay.vue`'s `display` prop, proves `vue-tsc` reports `TS2322` on that exact file, then restores the original bytes in a `finally` block and proves the gate returns to zero `PathDisplay.vue` errors.
- Confirmed `npm run typecheck:web` exits `0` with empty compiler output across the whole `src/web` tree — the full 19-02/19-03 fix-work backlog is genuinely closed, no baseline/allowlist.

## Task Commits

1. **Task 1: Wire typecheck:web into the repository-gates CI contract (3-location lockstep) and confirm the zero-error baseline** - `cbf676b` (feat)
2. **Task 2: Add a permanent, repeatable negative-gate proof script** - `47bff66` (feat)

**Plan metadata:** (this commit, recorded below)

## Files Created/Modified
- `.github/workflows/deploy-supabase-production.yml` - added `- run: npm run typecheck:web` step inside `repository-gates`, immediately after `typecheck:tests`
- `scripts/verify-supabase-support.mjs` - added `'npm run typecheck:web'` to the `required` array and the `gateCommands` array inside `verifyWorkflow()`
- `tests/e2e/support-payment.spec.ts` - added `['web typecheck', 'npm run typecheck:web', 'npm run typecheck:tests:web', 'workflow is missing required']` to the mutation-coverage `cases` array
- `scripts/verify-typecheck-negative-gate.mjs` - new script: mutates `PathDisplay.vue`'s `display` prop binding to a numeric literal, runs `npx vue-tsc --noEmit --project tsconfig.web.json`, asserts a `PathDisplay.vue` `TS2322` error, restores original bytes in a `finally` block, re-runs the gate, asserts zero `PathDisplay.vue` error lines
- `package.json` - added `"verify:typecheck-negative-gate": "node scripts/verify-typecheck-negative-gate.mjs"` to the `verify:*` script family

## Decisions Made
- Updated only the two command arrays the plan's `read_first`/acceptance criteria named (`required` and `gateCommands`), leaving the third, separate `commands` Set loop (line ~1741, a whole-workflow duplicate check already covered by `required`) untouched — this keeps `grep -c "npm run typecheck:web" scripts/verify-supabase-support.mjs` at exactly `2` as the plan's acceptance criterion specifies.
- `verify-typecheck-negative-gate.mjs` invokes `npx vue-tsc --noEmit --project tsconfig.web.json` via `execFileSync`, catching the non-zero exit (vue-tsc exits non-zero on type errors) and reading the captured `stdout`/`stderr` from the thrown error object, matching the project's existing `execFileSync`-based script convention (`verify-production-artifacts.mjs`, `verify-prerequisites.mjs`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19's exit gate (`CONTEXT.md`: `typecheck:web` must exit 0 before Phase 20 starts, no baseline/allowlist) is met and independently verified by a committed, re-runnable negative-gate proof.
- CI now blocks `main` on both `typecheck:tests` and `typecheck:web` failures via `repository-gates`.
- No blockers for Phase 20.

---
*Phase: 19-typecheck-foundation*
*Completed: 2026-11-04*

## Self-Check: PASSED

- FOUND: scripts/verify-typecheck-negative-gate.mjs
- FOUND: .planning/phases/19-typecheck-foundation/19-04-SUMMARY.md
- FOUND: cbf676b (Task 1 commit)
- FOUND: 47bff66 (Task 2 commit)
