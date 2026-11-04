---
phase: 14-uncommitted-source-review-frozen-snapshots
fixed: 2026-10-31T01:21:00Z
review_path: .planning/phases/14-uncommitted-source-review-frozen-snapshots/14-REVIEW.md
fix_scope: critical_warning
iterations: 1
---

# Phase 14 Review Fix Report

Fixes applied for `$gsd-code-review 14 --fix --auto` default scope (Critical + Warning).
The 3 Info-level findings (IN-01, IN-02, IN-03) are out of scope and were left untouched.

## Findings fixed

### CR-01 (Critical): Uncommitted-session anchors never used the synthetic content-addressed blobOid

**Status:** fixed
**Commit:** `ae23bd5` — `fix(14): CR-01 thread synthetic content-addressed blobOid through uncommitted anchors`

`captureWorktreeManifest` already computed a synthetic, content-addressed `blobOid` per
worktree-resident side via `blobOid(bytes, scope.objectFormat)`, but
`WorktreeSnapshot.readContent()` discarded it when returning to callers, and
`capabilities.ts`'s `createUncommittedCapabilityRegistry` used
`ChangedFile.oldBlobOid`/`newBlobOid` instead — the literal all-zero OID Git reports for any
side of an `unstaged`/`worktree` diff that crosses the worktree boundary. This degraded
stale/orphaned anchor reclassification to a full-text comparison for the two most common
uncommitted-review flows, contradicting D-21/WTREE-04.

**Changes:**
- `src/server/worktree-snapshot.ts`: `WorktreeSnapshot.readContent()` now also returns
  `preimageBlobOid`/`postimageBlobOid`, sourced from the manifest entry's synthetic `blobOid`
  (not dropped).
- `src/server/capabilities.ts` (`createUncommittedCapabilityRegistry` only — the sibling
  `createExactPatchCapabilityRegistry`/`createCapabilityRegistry` registries for committed
  comparisons were already correct and untouched):
  - `verifyAnchor` now finds the candidate file by path only, then compares the recorded
    `anchor.blobOid` against the snapshot's own synthetic `preimageBlobOid`/`postimageBlobOid`
    for that file/side, returning `orphaned` immediately on mismatch — restoring the fast
    content-hash path — before falling through to the full `verifyDurableAnchor` equality
    check.
  - `readContent` builds `FileContentResponse.base`/`head` using the synthetic
    `preimageBlobOid`/`postimageBlobOid` instead of the raw git-diff OID.
- `tests/api/uncommitted-session.test.ts`: updated one test's expectations. The test covers a
  `worktree`-session comment whose underlying file content changes before `Refresh`; it
  previously asserted the (buggy) `staleCount: 1 / orphanedCount: 0` / `state: 'stale'`
  outcome this finding describes. Post-fix this is correctly `staleCount: 0 / orphanedCount: 1`
  / `state: 'orphaned'`, matching the behavior the `--staged` e2e test
  (`tests/e2e/uncommitted-review.spec.ts:205`) already relies on.

**Re-verification:** `tsc --project tsconfig.json` clean; `tsc --noEmit --project
tsconfig.web.json` clean; `tests/api/worktree-snapshot.test.ts`,
`tests/git/worktree-inventory.test.ts`, `tests/git/worktree-content.test.ts`,
`tests/api/uncommitted-session.test.ts` — 42/42 pass; `tests/e2e/uncommitted-review.spec.ts` —
5/5 pass (including the `--staged` orphaned-reclassification scenario cited by the finding).

### WR-01 (Warning): `captureFileWithRetry` swallowed every exception as a benign torn-read

**Status:** fixed
**Commit:** `fb87d51` — `fix(14): WR-01 narrow captureFileWithRetry catch to the torn-read race signal`

The retry loop's bare `catch { // fall through to retry }` had no discrimination between the
intended transient-race signal and any other failure (permission errors, disk I/O errors, a
bug in `resolveWorktreeSideContent`, an unexpected `readBytes` failure). All of these were
silently retried up to 3 times and reported as `captureStatus: 'changed-during-capture'`,
hiding genuine, non-transient errors from diagnosis.

The legitimate torn-read signal (file size/mtime changed between the before/after `lstat`) was
already detected without throwing an exception (plain comparison, falls through to retry on
mismatch), so the `catch` block only ever intercepted real thrown exceptions in the first
place.

**Change:** `src/server/worktree-snapshot.ts`: narrowed the catch to `ENOENT` only (via the
existing `isMissing()` helper already used elsewhere in the same file for the same
file-disappeared-mid-capture race), and re-throw every other error so it propagates instead of
being silently folded into the retry path.

**Re-verification:** `tsc --project tsconfig.json` clean; `tests/api/worktree-snapshot.test.ts`
(including the three torn-file/D-09 retry scenarios, which mutate content via `writeFile` —
size/mtime change, no exception — and are unaffected by narrowing the exception path) —
15/15 pass.

### WR-02 (Warning): no persistence barrier between auto-save-before-refresh and the refresh request

**Status:** fixed
**Commit:** `0848101` — `fix(14): WR-02 await add-comment persistence before issuing Refresh`

`performRefresh()` dispatched a pending inline composer's `add-comment` event and then
immediately awaited `sessionClient.refreshWorktreeSnapshot()`, without waiting for the
add-comment mutation's own network request to be processed by the server. Since
`/api/draft/mutations`'s addComment handler builds the comment's durable anchor from whatever
`capabilities.readContent(fileId)` returns at the moment the HTTP request is handled, a refresh
that completed first on the server could cause the newly-typed comment to be anchored against
post-refresh content instead of what the user was looking at, and would also be excluded from
that refresh's `staleCount`/`orphanedCount` delta.

**Changes:** `src/web/App.vue`:
- `runCommands()` is now `async`; for the `persist-comment` command it collects the
  `sessionClient.mutate(...).then().catch()` chain's promise instead of firing it with `void`,
  and awaits all collected promises (`Promise.all`) before resolving.
- `dispatchWorkspace()` is now `async` and awaits `runCommands()`. All existing call sites
  (keyboard shortcuts, template event bindings, other `dispatchWorkspace(...)` calls) are
  unaffected — none of them relied on a `void`-typed return, and `dispatchWorkspace` is never
  passed by reference as a typed callback anywhere in the codebase.
- `performRefresh()` now `await`s `dispatchWorkspace({ type: 'add-comment' })` before calling
  `sessionClient.refreshWorktreeSnapshot()`, establishing the persistence barrier: the
  add-comment POST fully settles on the server before the refresh POST is sent.

**Re-verification:** `tsc --noEmit --project tsconfig.web.json` clean;
`tests/e2e/uncommitted-review.spec.ts` — 5/5 pass (no dedicated regression test existed for
this specific race; the fix is a synchronization-ordering change verified by type-checking and
the full e2e suite continuing to pass with no behavioral regression in refresh/comment flows).

## Findings left open

None. All 3 in-scope findings (CR-01, WR-01, WR-02) were fixed.

## Full re-verification summary

| Check | Result |
|---|---|
| `tsc --project tsconfig.json` (node/server) | clean |
| `tsc --noEmit --project tsconfig.web.json` (web) | clean |
| `tests/api/worktree-snapshot.test.ts` | 15/15 pass |
| `tests/git/worktree-inventory.test.ts` | included below |
| `tests/git/worktree-content.test.ts` | included below |
| `tests/api/uncommitted-session.test.ts` | 11/11 pass |
| `tests/api` + `tests/git/worktree-inventory.test.ts` + `tests/git/worktree-content.test.ts` (combined targeted run) | 42/42 pass |
| `tests/e2e/uncommitted-review.spec.ts` | 5/5 pass |
| Broader sweep: `tests/api` + `tests/git` + `tests/unit` | 496/496 pass |

## Commits

1. `ae23bd5` — `fix(14): CR-01 thread synthetic content-addressed blobOid through uncommitted anchors`
2. `fb87d51` — `fix(14): WR-01 narrow captureFileWithRetry catch to the torn-read race signal`
3. `0848101` — `fix(14): WR-02 await add-comment persistence before issuing Refresh`
