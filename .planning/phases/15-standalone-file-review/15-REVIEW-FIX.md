---
phase: 15-standalone-file-review
fixed_at: 2026-10-31T10:30:00Z
review_path: .planning/phases/15-standalone-file-review/15-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-10-31T10:30:00Z
**Source review:** .planning/phases/15-standalone-file-review/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: Standalone session `refresh()` crashes instead of reporting file removal when a single-file argument's only match disappears

**Files modified:** `src/git/standalone-resolution.ts`, `src/server/worktree-snapshot.ts`, `tests/api/worktree-snapshot.test.ts`
**Commit:** `479b438`
**Status:** fixed

**Applied fix:** Added an opt-in `options: { readonly toleratesNoMatch?: boolean }` parameter to `resolveStandaloneArguments`. When set, an argument whose `resolveOneArgument` call throws the specific "did not match any file" error is treated as resolving to zero matches (skipped) instead of propagating the throw; all other error cases (repository-boundary escape, `.gitignore`-only match) still throw unconditionally regardless of the flag.

Threaded the flag down from `WorktreeSnapshot.refresh()` to `inventoryForScope`'s standalone branch via a new `toleratesNoMatch` field on `CaptureWorktreeManifestDependencies` (inherited by `CaptureWithIndexRaceGuardDependencies`/`WorktreeSnapshotRefreshDependencies`), read inside `captureWorktreeManifest` and passed explicitly to both of its `inventoryForScope` calls (the pre-capture "expected" enumeration and the post-capture "observed" enumeration). `WorktreeSnapshot.refresh()` now calls `captureWithIndexRaceGuard` with `{ ...this.dependencies, toleratesNoMatch: true }`, so a vanished single-file argument surfaces as a clean `removed` delta — matching the diff-based enumeration behavior of every other `sourceKind`.

The initial CLI launch path (`src/cli/run.ts:850`, `launchStandaloneSession`'s direct `resolveStandaloneArguments` call) was left untouched — it never passes the new `options` argument, so it defaults to strict (throwing) behavior and continues rejecting typos/missing files at startup, exactly as the review's suggested approach specified.

**Regression test added:** Yes. Added `"refresh() reports a clean \"removed\" delta instead of throwing when a single-file argument's only match disappears (CR-01 regression)"` to `tests/api/worktree-snapshot.test.ts`'s `describe('standalone sourceKind capture and refresh (Plan 15-03)')` block. It materializes a standalone snapshot for a single untracked file (`solo.txt`), deletes the file on disk (so the argument itself now resolves to zero matches — the specific case the review noted was untested, distinct from the existing test's `'sub'` argument which still matches `sub/c.txt` after `sub/b.txt` is deleted), calls `refresh()`, and asserts it resolves (does not throw) with `removed` containing `'solo.txt'`, `added` empty, and the post-refresh file list empty.

## Fixed Issues (continued)

### WR-01: `createStandaloneCapabilityRegistry` lacks sibling registry's scope-kind guard, ships dead recovery-availability branches

**Files modified:** `src/server/capabilities.ts`
**Commit:** `795220d`
**Status:** fixed

**Applied fix:** Added a defense-in-depth guard at the top of `createStandaloneCapabilityRegistry`, mirroring `createUncommittedCapabilityRegistry`'s existing guard: throws `RangeError('Unreachable: createStandaloneCapabilityRegistry only supports standalone scopes; non-standalone scopes use createUncommittedCapabilityRegistry.')` when `scope.sourceKind !== 'standalone'`, before any session/draft-store setup runs.

Dropped the dead `uncommittedRecoveryCandidate` → `recoveryAvailable: true` spread from `createStandaloneCapabilityRegistry`'s `sessionResponse` (it was the only place in that function reading `options.uncommittedRecoveryCandidate`; the function never had a corresponding `recoverUncommittedDraft` capability, and no caller — `launchStandaloneSession` in `src/cli/run.ts` has no `findStandaloneDraftCandidate` equivalent — ever supplies `uncommittedRecoveryCandidate` for a standalone session). `CapabilityRegistryOptions.uncommittedRecoveryCandidate` itself was left in place since `createUncommittedCapabilityRegistry` still uses it with a real `recoverUncommittedDraft` implementation.

## Skipped Issues

None — both in-scope findings were fixed.

---

_Fixed: 2026-10-31T10:30:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
