---
phase: quick
plan: 261103-gl9
status: complete
subsystem: integration-tests
tags: [playwright, zod, exact-patch, fixture-drift]

# Dependency graph
requires: []
provides:
  - "tests/integration/selector-drift-ui.spec.ts's exactPatchSession(true) fixture builds a schema-valid SessionFileSchema entry, fixing the 2/5 ZodError failures that blocked the Deploy Supabase production workflow's repository-gates job"
affects: [selector-drift-ui-spec, deploy-supabase-production-repository-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hand-built SessionResponseSchema/SessionFileSchema test fixtures must include oldMode (GitModeSchema, required, not optional) on every file entry — use '100644' for a plain-text regular-file modification, matching the convention already established across tests/api/*.test.ts, tests/integration/anchored-workspace.spec.ts, and every real producer in src/ (worktree-inventory.ts, patch-snapshot.ts, comparison.ts)"

key-files:
  created: []
  modified:
    - tests/integration/selector-drift-ui.spec.ts

key-decisions:
  - "D-1: root cause is a stale test fixture, not a product regression — SessionFileSchema (src/contracts/api.ts:320-334) has required oldMode: GitModeSchema; every real session-file producer in src/ always sets it from the actual git diff, and the sibling fixture in tests/integration/anchored-workspace.spec.ts already uses the correct oldMode: '100644' pattern. exactPatchSession(true)'s hand-built file object (introduced before oldMode became required, predating commit 3196e96) simply never got updated."
  - "D-2: fixed with the minimal, established pattern — added a single oldMode: '100644' field to the one file entry inside exactPatchSession's withTextFile branch, no other fixture or production change needed."
  - "D-3: the third exact-patch test in the file (:389, exactPatchSession() with no args) was never affected — withTextFile defaults to false, giving files: [], which never touches the missing field."
---

# Quick Task 261103-gl9: Fix selector-drift-ui exact-patch fixture ZodError (spec :423/:441)

## Root Cause

`tests/integration/selector-drift-ui.spec.ts:423` ("exact patch resumed drafts
announce frozen provenance without pinned wording") and `:441` ("exact patch
retry stays snapshot-only and terminal loss focuses one source-correct
heading") both failed before the page under test ever loaded: each calls
`exactPatchSession(true)` (`selector-drift-ui.spec.ts:54`), whose
`withTextFile` branch builds a single file object with `fileId`, `status`,
`newPath`, `additions`, `deletions`, `availability` and passes it through
`SessionResponseSchema.parse` (via the union member
`ExactPatchSessionResponseSchema` → `SessionFileSchema`,
`src/contracts/api.ts:320-334`). `SessionFileSchema` requires a non-optional
`oldMode: GitModeSchema` field; the fixture never set it, so Zod threw
"expected object, received undefined" (plus `unrecognized_keys`/other-union-
branch noise from the broader `z.union`) at
`selector-drift-ui.spec.ts:55:32`, before `openReview(page)` ran.

This is a stale test fixture, not a product bug: every real producer of
`SessionFileSchema`-shaped data in `src/` (`git/worktree-inventory.ts:113`,
`server/patch-snapshot.ts:408`, `contracts/comparison.ts:122`, and all
`server/capabilities.ts` session-building call sites) always sets `oldMode`
from the actual git diff mode. The sibling integration fixture
`tests/integration/anchored-workspace.spec.ts:74-87` already carries the
correct, established pattern (`status: { kind: 'modified' }`, `oldMode:
'100644'`, `newPath`, `additions`, `deletions`) for a hand-built text-file
session entry — the same pattern used in every `tests/api/*.test.ts` fixture.
`exactPatchSession`'s `withTextFile` file object simply predates `oldMode`
becoming a required schema field and was never updated. The third exact-patch
test in the file, `:389` ("exact patch drift is announced while Review notes
makes the shell inert"), calls `exactPatchSession()` with no argument —
`withTextFile` defaults to `false`, giving `files: []` — so it never exercised
the missing-field branch and passed throughout, confirming the defect was
isolated to the `withTextFile` path.

Reproduced before the fix: `npx playwright test
tests/integration/selector-drift-ui.spec.ts -g "exact patch resumed drafts"`
failed with the Zod union error above, pointing directly at
`exactPatchSession` line 55 / call site line 430 (now 431).

## Fix

In `exactPatchSession` (`tests/integration/selector-drift-ui.spec.ts`), added
`oldMode: '100644'` to the `withTextFile` branch's file entry:

```ts
files: withTextFile
  ? [{
      fileId: patchFileId,
      status: { kind: 'modified' },
      oldMode: '100644',
      newPath: patchPath,
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }]
  : [],
```

No production code changed. No other fixture function in the file needed
changes — `pinnedSession`, `unchanged`, `movedBase`, `unavailableHead`,
`exactPatchContent`, and `resumedDraft` were already schema-valid.

## Test Results

| Command | Result |
|---|---|
| `npx playwright test tests/integration/selector-drift-ui.spec.ts` (before fix) | 3 passed, 2 failed (ZodError at `exactPatchSession` line 55) |
| `npx playwright test tests/integration/selector-drift-ui.spec.ts` (after fix) | **5 passed (5.1s)** |
| `npx playwright test` (full suite) | **113 passed (3.4m)** |
| `npm test` (Vitest) | 854 tests: 1 failed on first run — `tests/git/candidates.test.ts` "rejects malformed complete branch and abbreviation protocols before publishing candidates" hit the documented 10s-timeout flake under machine load (unrelated file, untouched by this change) |
| `npx vitest run tests/git/candidates.test.ts -t "rejects malformed..."` (rerun alone) | **1 passed (4.52s)**, confirming the flake, not a regression |
| `npm run typecheck:tests` | clean, no output |

## Files Created/Modified

- `tests/integration/selector-drift-ui.spec.ts` — `exactPatchSession`'s
  `withTextFile` branch file entry now includes `oldMode: '100644'`.

## Decisions Made

See `key-decisions` in frontmatter (D-1..D-3).

## Deviations from Plan

None.

---
*Phase: quick*
*Completed: 2026-11-03*
