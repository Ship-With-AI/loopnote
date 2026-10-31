---
phase: 15-standalone-file-review
reviewed: 2026-10-31T09:40:00Z
depth: standard
iteration: 2
files_reviewed: 27
files_reviewed_list:
  - src/cli/run.ts
  - src/contracts/api.ts
  - src/contracts/comparison.ts
  - src/contracts/draft.ts
  - src/domain/comparison-key.ts
  - src/export/render-review-markdown.ts
  - src/export/review-export.ts
  - src/git/standalone-resolution.ts
  - src/git/worktree-inventory.ts
  - src/server/app.ts
  - src/server/capabilities.ts
  - src/server/export-store.ts
  - src/server/worktree-snapshot.ts
  - src/web/App.vue
  - src/web/components/ActiveFileToolbar.vue
  - src/web/components/ExportReceipt.vue
  - src/web/components/FileRow.vue
  - src/web/components/IdentityHeader.vue
  - tests/api/standalone-session.test.ts
  - tests/api/worktree-snapshot.test.ts
  - tests/cli/errors.test.ts
  - tests/e2e/standalone-review.spec.ts
  - tests/git/standalone-resolution.test.ts
  - tests/unit/comparison-key.test.ts
  - tests/unit/review-export.test.ts
  - tests/unit/review-markdown.test.ts
  - tests/unit/uncommitted-contracts.test.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 15: Code Review Report (Re-review, iteration 2)

**Reviewed:** 2026-10-31T09:40:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Re-reviewed the full Phase 15 "Standalone File Review" scope after the `--fix --auto` pass that claims to resolve CR-01 and WR-01 (commits `479b438`, `795220d`). Both prior findings are **genuinely resolved** — verified by reading the current code (not the commit messages) and by running the affected test suites.

- **CR-01 (was BLOCKER) — resolved.** `resolveStandaloneArguments` (`src/git/standalone-resolution.ts:140-188`) now takes an `options.toleratesNoMatch` flag that swallows only the specific "did not match any file" error (not the `.gitignore`-only-match or repository-escape errors), letting the argument resolve to zero matches. `inventoryForScope`/`captureWorktreeManifest` (`src/server/worktree-snapshot.ts:219-306`) thread a `toleratesNoMatch` dependency down to both of `inventoryForScope`'s calls, and `WorktreeSnapshot.refresh()` (`src/server/worktree-snapshot.ts:688-696`) explicitly passes `{ ...this.dependencies, toleratesNoMatch: true }`, so a vanished single-file standalone argument now surfaces as a clean `removed` delta instead of crashing `/api/refresh`. The initial CLI launch (`src/cli/run.ts:850-854`, `launchStandaloneSession`'s own `resolveStandaloneArguments` call) is untouched and stays strict, exactly as intended. The new regression test (`tests/api/worktree-snapshot.test.ts:515-538`) exercises the exact scenario from the original finding and passes (`npx vitest run tests/api/worktree-snapshot.test.ts` — 1 file, all tests green).
- **WR-01 (was WARNING) — resolved.** `createStandaloneCapabilityRegistry` (`src/server/capabilities.ts:1150-1159`) now has the mirrored defense-in-depth guard (`throw new RangeError(...)` when `scope.sourceKind !== 'standalone'`), symmetric with `createUncommittedCapabilityRegistry`'s guard at `src/server/capabilities.ts:902-906`. The dead `options.uncommittedRecoveryCandidate → recoveryAvailable` spread was dropped from `createStandaloneCapabilityRegistry`'s `sessionResponse` (`src/server/capabilities.ts:1166-1190`, no `recoveryAvailable` field present); `uncommittedRecoveryCandidate` remains wired only through `createUncommittedCapabilityRegistry`, which still has a real `recoverUncommittedDraft` implementation, and `launchStandaloneSession` (`src/cli/run.ts:799-944`) never supplies it. Confirmed `findUncommittedDraftCandidate`/`uncommittedRecoveryCandidate` only reach `createUncommittedSessionApp`'s call site (`src/cli/run.ts:723-740`, the staged/unstaged/worktree path), never the standalone path.

Fresh adversarial pass over the rest of the scope (newly-added `src/git/worktree-inventory.ts`, the `ReviewExportV4`/standalone export plumbing in `src/contracts/draft.ts`, `src/export/review-export.ts`, `src/server/export-store.ts`, and the standalone-aware Vue components) found two new **WARNING**-tier issues, both narrower in scope than the BLOCKER that was already fixed. No new Critical/BLOCKER findings.

## Warnings

### WR-02: Initial standalone snapshot capture still crashes on the same vanished-single-file race CR-01 fixed for `refresh()`

**File:** `src/server/worktree-snapshot.ts:714-725`, `src/server/app.ts:225-238`
**Issue:** CR-01's fix only sets `toleratesNoMatch: true` inside `WorktreeSnapshot.refresh()` (`src/server/worktree-snapshot.ts:688-696`). `materializeWorktreeSnapshot()` — called once by `createStandaloneSessionApp` to build the *initial* snapshot (`src/server/app.ts:229-231`, no third `dependencies` argument) — still calls `captureWithIndexRaceGuard(scope, scope.repositoryRoot, runner, dependencies)` with the caller-supplied `dependencies` as-is, so `captureWorktreeManifest`'s internal `toleratesNoMatch` defaults to `false` (`src/server/worktree-snapshot.ts:304`).

`captureWorktreeManifest` enumerates the standalone argument set *twice* per capture — once before reading file bytes (`expected`, line 305) and once after (`observed`, line 374) — specifically to detect files that disappear mid-capture and mark them `'changed-during-capture'` instead of silently dropping them (D-10, documented at lines 288-295). For every other `sourceKind` this diff-based enumeration never throws on disappearance. For `standalone`, both enumeration calls go through `resolveStandaloneArguments`, which (without `toleratesNoMatch`) still throws "did not match any file" the moment a single-file argument's only match vanishes between the two calls.

Net effect: if a user opens `cumpa scratch.ts` and the file is deleted/atomically replaced in the narrow window between the two enumeration passes of the *very first* capture (session startup), the uncaught throw propagates through `captureWithIndexRaceGuard` → `materializeWorktreeSnapshot` → `createStandaloneSessionApp`, crashing session creation instead of the file being reported as `'changed-during-capture'` the way D-10 promises for every other case. This is the identical defect class as CR-01 (an uncaught "did not match any file" `Error` crashing a capture instead of producing a tolerant result), just triggered by the race window inside a single capture's two internal enumerations rather than by the longer window between two `refresh()` calls. It is not covered by the new CR-01 regression test, which only exercises `refresh()` (`tests/api/worktree-snapshot.test.ts:515-538`), nor by the existing initial-capture torn-file test (`tests/api/worktree-snapshot.test.ts:560-583`), which uses a directory argument (`sub`) that still has a surviving match after one file disappears, so `resolveStandaloneArguments` never throws there.
**Fix:** Make the double-enumeration inside `captureWorktreeManifest` always tolerate no-match, independent of the `refresh`-vs-`initial-launch` distinction — the "reject typos/missing files up front" behavior CR-01 deliberately preserved already lives one layer up, in `launchStandaloneSession`'s own `resolveStandaloneArguments` call before the scope is ever built (`src/cli/run.ts:850-854`). E.g., hardcode `toleratesNoMatch: true` for both `inventoryForScope` calls inside `captureWorktreeManifest` (or default `captureWorktreeManifest`'s own `toleratesNoMatch` to `true` and let only `launchStandaloneSession`'s pre-scope validation stay strict), rather than relying on each caller of `materializeWorktreeSnapshot`/`captureWithIndexRaceGuard` to opt in.

### WR-03: Exported standalone review markdown tells the applying agent to verify a "pinned comparison commit" that does not exist

**File:** `src/export/render-review-markdown.ts:195-202`
**Issue:** `renderReviewMarkdown` only special-cases `exactPatch` (`document.schemaVersion === 3`) when emitting the closing "Applying-agent instructions" paragraph; everything else — including the new `standalone` (`schemaVersion === 4`) case introduced in this phase — falls through to the generic pinned-comparison wording:

```ts
exactPatch
  ? 'Before editing, verify the exact patch digest, frozen snapshot facts, relevant blob, repository-relative path, preimage/postimage side, exact selected text, and context hash.'
  : 'Before editing, verify the pinned comparison commit, relevant blob, repository-relative path, base/head side, exact selected text, and context hash.',
```

A standalone review's `ReviewExportV4` document has no "pinned comparison commit" at all — it has `standalone.originalArguments`, `standalone.resolvedPaths`, `standalone.fileDigests`, and `standalone.snapshotChain` instead (`src/contracts/draft.ts`'s `StandaloneExportScopeSchema`), and every anchor's `side` is always `head` (per the test at `tests/unit/review-markdown.test.ts:177-214`, which explicitly asserts `markdown).not.toContain('Preimage'/'Postimage')` but never asserts anything about the "Applying-agent instructions" wording). Every standalone export therefore instructs the agent/human applying the feedback to "verify the pinned comparison commit" and a "base/head side" that are both meaningless for that export kind — the instructions actively point at provenance fields the document doesn't have, rather than the snapshot-chain/file-digest provenance it actually carries. The earlier `exactPatch` precedent in the same file (adding a dedicated branch when `schemaVersion === 3` was introduced) was not followed when `schemaVersion === 4` was added.
**Fix:** Add a `standalone` branch alongside the existing `exactPatch` ternary, e.g.:

```ts
exactPatch
  ? 'Before editing, verify the exact patch digest, frozen snapshot facts, relevant blob, repository-relative path, preimage/postimage side, exact selected text, and context hash.'
  : standalone
    ? 'Before editing, verify the standalone review key, snapshot chain, relevant blob, repository-relative path, head side, exact selected text, and context hash.'
    : 'Before editing, verify the pinned comparison commit, relevant blob, repository-relative path, base/head side, exact selected text, and context hash.',
```

---

_Reviewed: 2026-10-31T09:40:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2 (re-review after --fix --auto)_
