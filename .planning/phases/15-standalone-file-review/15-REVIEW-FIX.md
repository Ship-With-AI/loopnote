---
phase: 15-standalone-file-review
fixed_at: 2026-10-31T11:15:00Z
review_path: .planning/phases/15-standalone-file-review/15-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-10-31T11:15:00Z (iteration 2; see iteration 1 below for the prior run)
**Source review:** .planning/phases/15-standalone-file-review/15-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-02: Initial standalone snapshot capture still crashes on the same vanished-single-file race CR-01 fixed for `refresh()`

**Files modified:** `src/server/worktree-snapshot.ts`, `tests/api/worktree-snapshot.test.ts`
**Commit:** `9f9aab4`
**Status:** fixed

**Investigation:** The review's own analysis was correct and reachable as a distinct bug, confirmed by reading both call sites it cited. `captureWorktreeManifest` (`src/server/worktree-snapshot.ts`) enumerates the standalone argument set twice per capture call — once before reading file bytes (`expected`) and once after (`observed`) — to implement D-10 (classify files that disappear mid-capture as `'changed-during-capture'` instead of silently dropping them). Both enumeration calls shared a single `toleratesNoMatch` value sourced from `dependencies.toleratesNoMatch ?? false`. CR-01 (iteration 1) only had `WorktreeSnapshot.refresh()` opt in to `toleratesNoMatch: true`; `materializeWorktreeSnapshot()` (the *initial* capture, called once by `createStandaloneSessionApp` at session startup, `src/server/app.ts:229`) never passed the option, so it defaulted to strict. A single-file standalone argument whose only match vanished between the `expected` and `observed` enumeration passes of that very first capture would still throw "did not match any file" uncaught, crashing session creation — the same defect class as CR-01, just triggered within one capture's internal race window instead of the longer window between two `refresh()` calls.

**Applied fix:** Per the review's own semantic analysis (confirmed correct): the "reject typos/missing files up front" behavior that CR-01 deliberately preserved does not live in `captureWorktreeManifest` at all — it lives one layer up, in `launchStandaloneSession`'s own pre-scope `resolveStandaloneArguments` call (`src/cli/run.ts:850`, which never routes through `captureWorktreeManifest` and still defaults to strict). This means `captureWorktreeManifest`'s own double-enumeration never needed a `refresh`-vs-`initial-launch` distinction at all — both of its `inventoryForScope` calls now unconditionally pass `{ toleratesNoMatch: true }` to `resolveStandaloneArguments`. Removed the now-dead `toleratesNoMatch` field from `CaptureWorktreeManifestDependencies` (and the now-redundant `{ ...this.dependencies, toleratesNoMatch: true }` spread in `refresh()`, simplified back to `this.dependencies`) since there is no longer a caller-opt-in to thread — the initial capture and `refresh()` now behave identically at this layer, which is semantically correct because the file-set race being guarded against (disappearance *during* one capture's two internal passes) is identical in both cases; only the *pre-scope* argument validation differs, and that already lives in `src/cli/run.ts`, untouched by this fix.

**Regression test added:** Yes. Added `"surfaces a vanished single-file standalone argument as \"changed-during-capture\" during the INITIAL capture, not just refresh() (WR-02 regression)"` to `tests/api/worktree-snapshot.test.ts`'s `describe('standalone sourceKind: torn-capture and invalid-scope rejection (Plan 15-03 Task 3)')` block. It calls `materializeWorktreeSnapshot` (the initial-capture path, not `refresh()`) for a single-file argument (`'solo.txt'`), deletes the file via `onBeforeObservedEnumeration` (so it vanishes between the capture's own `expected` and `observed` passes), and asserts the call resolves without throwing, with the file reported as `captureStatus: 'changed-during-capture'` rather than crashing session creation.

### WR-03: Exported standalone review markdown tells the applying agent to verify a "pinned comparison commit" that does not exist

**Files modified:** `src/export/render-review-markdown.ts`, `tests/unit/review-markdown.test.ts`
**Commit:** `ad47887`
**Status:** fixed

**Applied fix:** Added a `standalone` branch to the ternary that builds the "Applying-agent instructions" footer's lead sentence in `renderReviewMarkdown`, alongside the existing `exactPatch` branch. The `standalone` boolean (`document.schemaVersion === 4`) was already computed earlier in the function for the "## Standalone files" section, so no new detection logic was needed. The new branch text — "Before editing, verify the standalone review key, snapshot chain, relevant blob, repository-relative path, head side, exact selected text, and context hash." — references the real fields on `StandaloneExportScopeSchema` (`src/contracts/draft.ts`): `reviewKey`, `snapshotChain`, and the fact that every standalone anchor's `side` is always `'head'` (never `'base'`/preimage), matching exactly what the existing standalone render branch (`document.standalone.resolvedPaths`, `.fileDigests`, `.snapshotChain`) already surfaces elsewhere in the same function. The fallback generic "pinned comparison commit"/"base/head side" wording is now reached only by the true base/head-diff export kind (schemaVersion 1/2), for which it remains accurate.

**Regression test added:** Yes. Extended `tests/unit/review-markdown.test.ts`'s existing `describe('standalone Markdown')` test to assert the rendered markdown contains the new standalone-specific footer sentence verbatim, and does **not** contain `'pinned comparison commit'` or `'base/head side'`. Also added a symmetric assertion to the `describe('exact patch Markdown')` test confirming the `exactPatch` branch's own wording is unchanged by the ternary restructuring.

## Skipped Issues

None — both in-scope findings were fixed.

---

_Fixed: 2026-10-31T11:15:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_

---

## Iteration 1 (prior run, 2026-10-31T10:30:00Z)

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
