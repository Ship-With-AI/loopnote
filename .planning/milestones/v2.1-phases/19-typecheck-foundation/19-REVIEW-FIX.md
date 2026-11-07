---
phase: 19-typecheck-foundation
fixed_at: 2026-11-04T00:00:00Z
review_path: .planning/phases/19-typecheck-foundation/19-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-11-04T00:00:00Z
**Source review:** .planning/phases/19-typecheck-foundation/19-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Restore a total render chain in App.vue's root template

**Files modified:** `src/web/App.vue`
**Commit:** 21a9288
**Applied fix:** Folded the `session === undefined` discriminant into the preceding `unavailable-shell` branch's condition (`v-else-if="errorMessage !== '' || patchSnapshotUnavailable || session === undefined"`) and restored the terminal `session-shell` branch to a bare `v-else`, giving `vue-tsc` the same narrowing while keeping the root render chain exhaustive (no blank-page gap). Verified `npx vue-tsc --noEmit --project tsconfig.web.json` produces zero `App.vue(` diagnostics (same as before the fix) and zero diagnostics overall.

### WR-02: Assert the typecheck exit status in the negative-gate proof

**Files modified:** `scripts/verify-typecheck-negative-gate.mjs`
**Commit:** 19b2740
**Applied fix:** `runTypecheck()` now returns `{ status, output }`, capturing `error.status ?? 1` on throw instead of discarding it. The mutated-run assertion now fails loudly if `vue-tsc` exits `0` (`mutated.status === 0`) before the existing `TS2322` string check runs. The reverted-run assertion symmetrically fails if the clean run's exit status is not `0`, in addition to the existing `revertedPathDisplayLines.length > 0` check. Verified `node scripts/verify-typecheck-negative-gate.mjs` still passes end-to-end (exit 0, "Typecheck negative-gate verified" printed).

### WR-03: Restore PathDisplay.vue on interrupt, not only in `finally`

**Files modified:** `scripts/verify-typecheck-negative-gate.mjs`
**Commit:** b48e2d6
**Applied fix:** Added a synchronous `import { writeFileSync } from 'node:fs'` and a `restoreOnSignal(signal)` function registered via `process.once('SIGINT', restoreOnSignal)` / `process.once('SIGTERM', restoreOnSignal)` before the mutation window begins. On interrupt, the handler synchronously rewrites `PathDisplay.vue` to its original content before re-raising the signal, so the file is restored even when the `finally` block does not run. Verified with `node --check scripts/verify-typecheck-negative-gate.mjs` (syntax OK) and a full `node scripts/verify-typecheck-negative-gate.mjs` run, which still passes end-to-end with `PathDisplay.vue` left clean on disk.

---

_Fixed: 2026-11-04T00:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
