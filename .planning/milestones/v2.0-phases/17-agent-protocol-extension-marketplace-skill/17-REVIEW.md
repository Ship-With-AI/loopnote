---
phase: 17-agent-protocol-extension-marketplace-skill
reviewed: 2026-10-31T18:30:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/cli/request.ts
  - src/cli/run.ts
  - src/contracts/draft.ts
  - src/contracts/request.ts
  - src/export/render-review-markdown.ts
  - src/export/review-export.ts
  - src/git/standalone-resolution.ts
  - src/server/capabilities.ts
  - tests/e2e/agent-ready-export.spec.ts
  - tests/unit/agent-request.test.ts
  - tests/unit/review-export.test.ts
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-31T18:30:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Re-review after two targeted fix commits: `5a88942` (CR-01) and `d2af3d6` (WR-01), applied against the prior review's 11-file scope (agent-protocol `uncommitted`/`files` request modes, export schema v5/v6 working-tree-drift flag, Markdown rendering, standalone path-resolution error taxonomy, and the capability-registry drift-collection/finish-flow glue). `git diff` confirms these two commits are the *only* changes to the reviewed scope since the prior review — the other 9 files are byte-identical, so their prior Info findings (IN-01–IN-04) are reconfirmed unchanged rather than re-derived from scratch.

**CR-01 verified fixed.** `collectWorkingTreeDrift()` in both `createUncommittedCapabilityRegistry` (`src/server/capabilities.ts:1118-1139`) and `createStandaloneCapabilityRegistry` (`:1474-1495`) now derives `changed` solely from `changedPaths.length > 0`; the repo-global `.git/index` stat comparison (`indexChanged`) was removed from the returned value in both registries, applied identically. The invariant `changed && paths.length === 0` enforced by `WorkingTreeDriftFlagSchema.superRefine` (`src/contracts/draft.ts:577-583`) is now structurally unreachable from this function, since `changed` is computed as a direct boolean predicate over the same array it returns. The repo-global `indexStatIdentity()`/`changeBaseline.index` machinery was *not* deleted — it remains correctly used by the separate, pre-existing `worktreeChangeIndicator()` method in both registries (`:1231-1236`, `:1597-1602`), which is unrelated to the export-schema drift flag and was never part of the defect. No dead code or orphaned references were introduced by the removal. `tsc --noEmit` and the relevant unit suites (`tests/unit/agent-request.test.ts`, `tests/unit/review-export.test.ts`, 29 tests) pass clean.

**WR-01 verified fixed.** Both "round-trips frozen" tests in `tests/unit/agent-request.test.ts` now assert `expect(request.mode).toBe('uncommitted')` (line 172) and `expect(request.mode).toBe('files')` (line 190) immediately after parsing and before the narrowing `if` block, exactly as the prior review's suggested fix specified. A future regression that parses a well-formed request under the wrong `mode` (or silently coerces it) will now fail this assertion directly instead of silently skipping the per-mode freeze checks.

No new Critical or Warning findings were introduced by either fix — both diffs are minimal and surgical (capabilities.ts: 2 insertions/6 deletions across two symmetric registries; agent-request.test.ts: 2 insertions). The four pre-existing Info findings from the prior review are reconfirmed below, unchanged and intentionally left unfixed (out of the default `--fix --auto` critical/warning scope); none have escalated.

## Info

### IN-01: Redundant re-derivation of the `standalone` condition

**File:** `src/export/render-review-markdown.ts:49, 85`

**Issue:** `standalone` is computed once (`const standalone = document.schemaVersion === 4 || document.schemaVersion === 6;`) but a later branch recomputes the identical condition inline instead of reusing the constant: `} else if (document.schemaVersion === 4 || document.schemaVersion === 6) {`. Maintainability nit — a future edit touching one site and not the other would silently diverge.

**Fix:** `} else if (standalone) {`

### IN-02: Working-tree-drift Markdown rendering duplicated between V5 and V6 branches

**File:** `src/export/render-review-markdown.ts:121-123` (V6/standalone) and `:143-145` (V5/uncommitted)

**Issue:** The identical 3-line loop (`for (const driftPath of document.workingTreeChangedAfterFinalSnapshot.paths) { appendFencedData(lines, 'Changed path:', ...); }`), preceded by the same two header lines, is duplicated verbatim across both branches.

**Fix:** Extract a small `appendWorkingTreeDrift(lines, document.workingTreeChangedAfterFinalSnapshot)` helper (mirroring `appendFencedData`/`appendAnchor`) and call it from both branches.

### IN-03: `collectWorkingTreeDrift` duplicated verbatim across both capability registries (and overlaps `worktreeChangeIndicator`)

**File:** `src/server/capabilities.ts:1118-1139` and `:1474-1495`

**Issue:** `collectWorkingTreeDrift` is identical in both `createUncommittedCapabilityRegistry` and `createStandaloneCapabilityRegistry`. It also re-walks the same `snapshot.files()`/`lstat` comparison already performed, with a different return shape, by the pre-existing `worktreeChangeIndicator()` method defined later in each of the same two functions (`:1231-1256` and the standalone equivalent at `:1597-`). `worktreeChangeIndicator` could be reimplemented as `(await collectWorkingTreeDrift()).changed` to remove one of the two near-identical file-stat walks per registry. The CR-01 fix did not address this duplication (it only removed the erroneous `indexChanged` OR-term from `collectWorkingTreeDrift`'s own logic), so the overlap remains exactly as before.

**Fix:** Factor the shared stat-walk into one helper (e.g. a module-level function taking `changeBaseline`, `snapshot`, `diskPathFor` as inputs) reused by both registries and by `worktreeChangeIndicator`.

### IN-04: Fixed 500ms "no further output" wait is a flaky-prone, duplicated timing assertion

**File:** `tests/e2e/agent-ready-export.spec.ts:926-930` and `:979-983`

**Issue:** Both e2e tests assert "nothing more was written to stdout after Finish" using an arbitrary fixed delay:
```ts
const settleWait = Promise.withResolvers<void>();
setTimeout(settleWait.resolve, 500);
await settleWait.promise;
expect(readFileSync(running.stdoutPath).length).toBe(sizeAfterFinish);
```
Duplicated verbatim between the two tests and inherently timing-based: a slower CI runner could still pass trivially (nothing written within 500ms proves nothing about ms 501+), and a sufficiently loaded runner could in principle introduce false negatives. Unchanged by the CR-01/WR-01 fixes.

**Fix:** Factor the duplicated block into a shared helper (e.g. `expectNoFurtherOutput(running, sizeAfterFinish)`); consider whether the stdout stream's `close`/`end` event (already awaited via `waitForAttachedExit`) makes the extra fixed-delay re-check unnecessary, since the process has already exited by this point in both tests.

---

_Reviewed: 2026-10-31T18:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
