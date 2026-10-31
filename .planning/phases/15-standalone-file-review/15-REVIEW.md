---
phase: 15-standalone-file-review
reviewed: 2026-10-31T09:22:51Z
depth: standard
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
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-31T09:22:51Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Reviewed the full Phase 15 "Standalone File Review" diff: the new `src/git/standalone-resolution.ts` module, the `standalone` `sourceKind`/`WorktreeSnapshot` plumbing in `src/server/worktree-snapshot.ts`, the new `createStandaloneCapabilityRegistry`/`createStandaloneSessionApp` server surface, the CLI's new positional-paths action in `src/cli/run.ts`, the `ReviewExportV4`/schema additions in `src/contracts/`, the Markdown/export renderers, and the Vue UI surfacing (`App.vue`, `ActiveFileToolbar.vue`, `ExportReceipt.vue`, `FileRow.vue`, `IdentityHeader.vue`). Cross-referenced imports/exports between `standalone-resolution.ts` → `worktree-snapshot.ts` → `capabilities.ts` → `app.ts` → `run.ts`, and the Zod contracts shared between client and server (`comparison.ts`, `draft.ts`, `api.ts`). Confirmed the `@close="closeReviewNotes"` handler is present at `src/web/App.vue:1397` as expected (already fixed upstream, not re-flagged).

One BLOCKER: the standalone session's live `/api/refresh` path reuses `resolveStandaloneArguments`'s hard-fail-on-no-match design (correct for the initial CLI launch) inside the recurring snapshot-refresh loop, where it is not tolerant of drift the way every other `sourceKind` is — a single originally-opened file disappearing (not a directory/glob argument, which the shipped tests cover) crashes the refresh request instead of reporting the file as removed. One WARNING: the new `createStandaloneCapabilityRegistry` omits the scope-kind defense-in-depth guard its sibling `createUncommittedCapabilityRegistry` added in the same diff, and carries over dead `uncommittedRecoveryCandidate`/`recoverUncommittedDraft` branches that can never activate for standalone sessions (no caller ever supplies that option for `sourceKind: 'standalone'`), which is confusing for future maintainers.

Everything else checked out: the `StandaloneGitState`/`ReviewExportV4`/`StandaloneExportScopeSchema` contracts are internally consistent across `contracts/comparison.ts`, `contracts/draft.ts`, and `contracts/api.ts`; `standaloneReviewKey` is always called with pre-sorted arguments per its documented contract (verified against `tests/unit/comparison-key.test.ts`); the Vue components' `isStandalone`/`isUncommitted` computed properties are correctly mutually exclusive; `export-store.ts`'s `stableNameFor`/`matchesPublicationIdentity` correctly branch on the new `'standalone'` identity kind; and a suspected rename-record parsing bug in `classifyStandaloneGitState`'s `parsePorcelainRecords` (the second NUL-delimited segment of a porcelain rename record would be mis-sliced) was verified empirically to be unreachable from this call site — `git status` only emits the two-segment rename record when both old and new paths are included in the pathspec, and a standalone argument's old (pre-rename) path can never successfully resolve via `resolveStandaloneArguments` once renamed away, so it is never present in the pathspec passed to `classifyStandaloneGitState`.

## Critical Issues

### CR-01: Standalone session `refresh()` crashes instead of reporting file removal when a single-file argument's only match disappears

**File:** `src/git/standalone-resolution.ts:79-125` (`resolveOneArgument`), consumed by `src/server/worktree-snapshot.ts:248-269` (`inventoryForScope`) and `src/server/worktree-snapshot.ts:647-676` (`WorktreeSnapshot.refresh`)

**Issue:** For every other `sourceKind` (`staged`/`unstaged`/`worktree`), file enumeration is diff-based: `createWorktreeChangedFileInventory` simply omits a file that no longer differs/exists — it never throws when a previously-changed file disappears, so `WorktreeSnapshot.refresh()` can always compute a clean `added`/`removed`/`modified` delta.

For `standalone`, `inventoryForScope` instead re-resolves the user's *original CLI arguments* on every refresh via `resolveStandaloneArguments` → `resolveOneArgument`. `resolveOneArgument` throws a plain `Error` ("did not match any file.") whenever an argument stops matching *any* file at all (`src/git/standalone-resolution.ts:118-124`). This throw propagates uncaught through `inventoryForScope` → `captureWorktreeManifest` → `captureWithIndexRaceGuard` → `WorktreeSnapshot.refresh()` (`src/server/worktree-snapshot.ts:442-458`, `647-676`) — none of these catch it — and then through `createStandaloneCapabilityRegistry`'s `refresh()` capability (`src/server/capabilities.ts:1028`) into the unguarded `/api/refresh` Fastify route handler (`capabilities.refresh!()` with no try/catch), which Fastify turns into a generic 500 response instead of the graceful `{ added, removed, modified, staleCount, orphanedCount }` delta every other source kind returns.

This is reachable in an ordinary flow: a user runs `cumpa some-scratch-file.ts` (an untracked file, or any single-file argument that is not a directory/glob), reviews it, then deletes or moves the file while the session is open (e.g. cleans up the scratch file, or an editor atomically replaces it) and clicks "Refresh" (or the `r` keypress / `/api/refresh` poll). `resolveStandaloneArguments(['some-scratch-file.ts'])` finds zero matches via `ls-files`, the file is not gitignored, so it throws — the refresh fails hard instead of reporting the file removed.

The shipped tests only exercise the case where the *argument* keeps resolving to at least one file after a deletion (`tests/api/worktree-snapshot.test.ts:507-512` explicitly notes: *"'sub' still matches sub/c.txt, so the argument itself keeps resolving to at least one file"*) — the single-file-argument-fully-disappears case this finding describes is untested and unhandled.

**Fix:** Make refresh-time resolution tolerant of an argument that stops matching anything, consistent with how every other `sourceKind` tolerates disappearance. For example, give `resolveStandaloneArguments` (or a refresh-specific variant) a mode that treats a no-match argument as "resolves to zero files" instead of throwing, used only from `inventoryForScope`'s refresh path (the initial CLI-launch call in `src/cli/run.ts:799-944` should keep failing hard, since that path legitimately wants to reject typos/missing files at startup):

```ts
// standalone-resolution.ts
export async function resolveStandaloneArguments(
  repositoryRoot: string,
  rawArguments: readonly string[],
  dependencies: ResolveStandaloneArgumentsDependencies = {},
  options: { readonly toleratesNoMatch?: boolean } = {},
): Promise<readonly ExactPath[]> {
  // ...
  for (const argument of rawArguments) {
    try {
      const matches = await resolveOneArgument(repositoryRoot, argument, runner);
      for (const match of matches) { /* ... */ }
    } catch (error) {
      if (options.toleratesNoMatch === true && error instanceof Error && /did not match any file/.test(error.message)) {
        continue; // argument now resolves to nothing; let diffManifestEntries report the removal
      }
      throw error;
    }
  }
  // ...
}
```

and pass `{ toleratesNoMatch: true }` from `inventoryForScope` (worktree-snapshot.ts) while leaving `launchStandaloneSession`'s initial call (run.ts) strict.

## Warnings

### WR-01: `createStandaloneCapabilityRegistry` lacks the sibling registry's scope-kind guard and ships dead recovery-availability branches

**File:** `src/server/capabilities.ts:1150-1170`

**Issue:** In the same diff, `createUncommittedCapabilityRegistry` was given an explicit defense-in-depth guard:

```ts
if (scope.sourceKind === 'standalone') {
  throw new RangeError(
    'Unreachable: createUncommittedCapabilityRegistry does not support standalone scopes; standalone sessions use a dedicated capability registry.',
  );
}
```

(`src/server/capabilities.ts:902-906`). `createStandaloneCapabilityRegistry` (the function right below it) has no equivalent guard rejecting non-`'standalone'` scopes — it silently accepts `staged`/`unstaged`/`worktree` scopes and would build a `SessionResponseSchema` with the wrong `sourceKind` label leaking through. The two registries should be symmetric.

Separately, `createStandaloneCapabilityRegistry` copies the `options.uncommittedRecoveryCandidate` → `recoveryAvailable: true` session field (`src/server/capabilities.ts:1170`) verbatim from `createUncommittedCapabilityRegistry`, but — unlike the sibling function (`src/server/capabilities.ts:1070-1097`) — never implements the corresponding `recoverUncommittedDraft` capability. `launchStandaloneSession` in `src/cli/run.ts:799-944` never passes `uncommittedRecoveryCandidate` to `createStandaloneSessionApp` (there is no `findStandaloneDraftCandidate` equivalent of `findUncommittedDraftCandidate`), so today this is unreachable dead code rather than a live bug — but it leaves a confusing, partially-wired "recovery" code path in a public capability type (`CapabilityRegistryOptions.uncommittedRecoveryCandidate` is accepted by `CreateStandaloneSessionAppOptions` via `CreateSessionAppOptions`) that a future caller could trip on: passing `uncommittedRecoveryCandidate` to `createStandaloneSessionApp` would advertise `recoveryAvailable: true` in the session response with no matching `recoverUncommittedDraft` method, which the client would then be unable to act on.

**Fix:** Add the mirrored guard to `createStandaloneCapabilityRegistry`:

```ts
export async function createStandaloneCapabilityRegistry(
  scope: UncommittedScope,
  snapshot: WorktreeSnapshot,
  options: CapabilityRegistryOptions = {},
): Promise<CapabilityRegistry> {
  if (scope.sourceKind !== 'standalone') {
    throw new RangeError(
      'Unreachable: createStandaloneCapabilityRegistry only supports standalone scopes.',
    );
  }
  // ...
```

and either drop the `uncommittedRecoveryCandidate`/`recoveryAvailable` plumbing from the standalone registry entirely (since nothing wires it), or implement the equivalent `recoverUncommittedDraft` capability so the advertised flag is backed by a real implementation.

---

_Reviewed: 2026-10-31T09:22:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
