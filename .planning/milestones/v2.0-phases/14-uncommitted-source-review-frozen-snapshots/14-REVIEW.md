---
phase: 14-uncommitted-source-review-frozen-snapshots
reviewed: 2026-10-31T00:09:29Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - src/cli/picker.ts
  - src/cli/run.ts
  - src/contracts/api.ts
  - src/contracts/comparison.ts
  - src/contracts/draft.ts
  - src/domain/comparison-key.ts
  - src/export/review-export.ts
  - src/git/availability.ts
  - src/git/exact-patch.ts
  - src/git/inventory.ts
  - src/git/worktree-content.ts
  - src/git/worktree-inventory.ts
  - src/server/app.ts
  - src/server/capabilities.ts
  - src/server/draft-loader.ts
  - src/server/draft-store.ts
  - src/server/patch-snapshot.ts
  - src/server/routes.ts
  - src/server/snapshot-fs.ts
  - src/server/worktree-snapshot.ts
  - src/web/api/client.ts
  - src/web/App.vue
  - src/web/components/ChangedFilesDialog.vue
  - src/web/components/DirectoryRow.vue
  - src/web/components/FileRow.vue
  - src/web/components/FileTree.vue
  - src/web/components/IdentityHeader.vue
  - src/web/components/InlineNotice.vue
  - src/web/components/RefreshSummaryPanel.vue
  - src/web/components/ReviewNotesDialog.vue
  - src/web/components/ui/UiIcon.vue
  - tests/api/uncommitted-session.test.ts
  - tests/api/worktree-snapshot.test.ts
  - tests/cli/errors.test.ts
  - tests/cli/selection.test.ts
  - tests/e2e/uncommitted-review.spec.ts
  - tests/git/worktree-content.test.ts
  - tests/git/worktree-inventory.test.ts
  - tests/unit/comparison-key.test.ts
  - tests/unit/draft-load.test.ts
  - tests/unit/uncommitted-contracts.test.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-31T00:09:29Z
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

Reviewed the full union of files touched across all 16 phase-14 plans (14-01 through
14-16), confirmed by diffing against the pre-phase-14 commit `f548116` (41 files, +5410/-159).
The changeset adds three new Git-comparison source kinds (Staged, Unstaged, Working tree),
a parallel frozen "worktree snapshot" mechanism with explicit Refresh/reclassification, a new
Fastify session-app/capability-registry branch, CLI flags and picker groundwork, browser-side
Refresh/recovery UI, and Playwright e2e coverage. The engineering is careful and heavily
self-documenting (extensive `key-decisions` trails per plan), and most of the surface —
schema unions, draft-identity hashing, torn-read/index-race handling, file-tree prop
threading, route guards for the three new capability-gated endpoints — is correct and
consistent with established codebase conventions.

One **Critical** defect was found: the carefully-computed synthetic, content-addressed
`blobOid` for worktree-resident sides (the entire point of 14-05's `blobOid` export and
14-07's per-entry `preimage`/`postimage` hashing) is computed and stored in the snapshot
manifest but is **never actually read** by the capability layer that builds and verifies
comment anchors. `capabilities.ts` uses the raw `ChangedFile.oldBlobOid`/`newBlobOid` instead,
which Git's own diff machinery reports as the literal all-zero OID for any content that
hasn't been staged (i.e. for both the `unstaged` and `worktree` source kinds — two of the
three new review modes). This silently degrades anchor identity and stale/orphaned
reclassification to text-only comparison for the majority of uncommitted-review usage, in
direct contradiction of the explicit D-21/WTREE-04 decision that "committed and uncommitted
anchors share the exact same synthetic-digest algorithm."

Two Warning-level robustness gaps and three Info-level code-quality items are also recorded
below.

## Critical Issues

### CR-01: Uncommitted-session comment anchors never use the synthetic content-addressed blobOid for Unstaged/Working-tree sides, degrading anchor identity to a constant zero value

**File:** `src/server/capabilities.ts:945-967` (`verifyAnchor`) and `src/server/capabilities.ts:1104-1127` (`readContent`), inside `createUncommittedCapabilityRegistry` (starts line 896)

**Issue:**
`captureWorktreeManifest` (`src/server/worktree-snapshot.ts:259-354`) correctly computes a
synthetic, content-addressed `blobOid` for worktree-resident sides via
`blobOid(bytes, scope.objectFormat)` (exported from `exact-patch.ts` specifically for this
purpose — see 14-05's decision log) and stores it on
`WorktreeSnapshotEntry.preimage.blobOid` / `.postimage.blobOid` (`worktree-snapshot.ts:347-348`).
This is the mechanism D-21/WTREE-04 describe as making "committed and uncommitted anchors
share the exact same synthetic-digest algorithm."

However, `WorktreeSnapshot.readContent()` (`worktree-snapshot.ts:564-575`) discards this
per-entry `blobOid` when it returns to callers — it returns only
`{ file: entry.file, preimage: Buffer, postimage: Buffer }`, where `entry.file` is the raw
`ChangedFile` whose `oldBlobOid`/`newBlobOid` are **left untouched as the raw git-diff value**
(an explicit, documented 14-07 decision, scoped to the manifest layer only).

`capabilities.ts`'s `createUncommittedCapabilityRegistry` then builds and verifies every
comment anchor using `file.oldBlobOid`/`file.newBlobOid` (lines 948, 1124-1125) — never the
synthetic per-entry value. For `sourceKind: 'staged'` this happens to still work, because
`git diff --cached --raw` reports a real object hash for staged content. But for
`sourceKind: 'unstaged'` and `'worktree'` — the two most common "review my edits" flows —
`git diff --raw` (no `--cached`) reports the literal all-zero OID
(`0000000000000000000000000000000000000000`) for any side that crosses the worktree boundary,
confirmed empirically:

```
$ git diff --raw -z --no-abbrev -- a.txt
:100644 100644 3b18e512... 0000000000000000000000000000000000000000 M  a.txt
```

Consequences for Unstaged/Working-tree sessions:
- `FileContentResponse.head.blobOid` (and `.base.blobOid` for the worktree side of a
  `worktree` comparison) returned to the browser is always the same zero value, regardless of
  actual file content or how many times the file has been edited.
- Every comment anchor's `blobOid` field (`routes.ts:391`, sourced from
  `capabilities.readContent(...)`) is the same constant zero for every file's changed side —
  defeating the content-addressing contribution to `contextHash`/`uniqueKey`
  (`domain/anchor.ts`), which is otherwise supposed to make the hash change whenever content
  changes.
- `verifyAnchor`'s lookup-by-`(path, blobOid)` (`capabilities.ts:946-950`) can never fail on
  blobOid grounds for these two source kinds — it always finds the file and falls through to
  `verifyDurableAnchor`'s full-anchor equality check. That check *does* still catch content
  drift via `selectedText`/`context` text equality, so the system does not silently show stale
  content as verified — but the classification degrades from "orphaned" (fast content-hash
  mismatch, the behavior explicitly proven and relied on by the `--staged` e2e test in
  `tests/e2e/uncommitted-review.spec.ts:252`) to "stale" (slower full-text comparison) for
  Unstaged/Working-tree sessions, contradicting the documented cross-session-kind parity that
  WTREE-04/D-21 call out as the whole point of exporting `blobOid()` from `exact-patch.ts`.

This is a correctness regression against an explicitly stated design invariant for the
majority of this phase's new review modes, not merely a style issue.

**Fix:** Thread the synthetic per-entry `blobOid` through `WorktreeSnapshot.readContent()`
instead of dropping it, and have `capabilities.ts` use it instead of `ChangedFile.oldBlobOid`/
`newBlobOid`:

```ts
// src/server/worktree-snapshot.ts
async readContent(fileId: string): Promise<
  Readonly<{
    readonly file: ChangedFile;
    readonly preimage: Buffer | undefined;
    readonly preimageBlobOid: string;
    readonly postimage: Buffer | undefined;
    readonly postimageBlobOid: string;
  }> | undefined
> {
  const manifest = await this.verifiedManifest();
  const entry = manifest.entries.find((candidate) => candidate.file.id === fileId);
  if (entry === undefined) return undefined;
  return Object.freeze({
    file: entry.file,
    preimage: await this.readSide(entry.preimage),
    preimageBlobOid: entry.preimage.blobOid,
    postimage: await this.readSide(entry.postimage),
    postimageBlobOid: entry.postimage.blobOid,
  });
}
```

```ts
// src/server/capabilities.ts — verifyAnchor (~line 945) and readContent (~line 1104)
const verifyAnchor = async (anchor: DurableAnchorV1): Promise<AnchorVerification> => {
  const content = await snapshot.readContent(/* resolve fileId from anchor path+side first */);
  // ...match on content.preimageBlobOid / content.postimageBlobOid instead of
  // candidate.oldBlobOid / candidate.newBlobOid
};
// readContent:
base: makeSide(preimage, file.oldPath, file.oldMode, content.preimageBlobOid),
head: makeSide(postimage, file.newPath, file.newMode, content.postimageBlobOid),
```
(`verifyAnchor`'s current file-lookup-by-blobOid also needs restructuring since it currently
finds the file *before* reading content; the simplest correct fix is to look the file up by
path only, then compare the recorded `anchor.blobOid` against the snapshot's own synthetic
`preimageBlobOid`/`postimageBlobOid` for that file.)

## Warnings

### WR-01: `captureFileWithRetry` swallows every exception as a benign torn-read, masking genuine I/O failures as "changed-during-capture"

**File:** `src/server/worktree-snapshot.ts:167-193`, specifically the bare `catch { // fall through to retry }` at line 183-185

**Issue:** The retry loop's `catch` block has no discrimination between the intended
transient-race signal (file size/mtime changed between the before/after `lstat`) and any other
failure mode — permission errors, disk I/O errors, a bug surfacing inside
`resolveWorktreeSideContent`, or an unexpected exception from `readBytes`. All of these are
silently retried up to 3 times and then reported to the user as the file having
"changed during capture" (`captureStatus: 'changed-during-capture'`, surfaced in the UI as
"file changed during capture — Refresh to recapture"), which is misleading when the real
cause is e.g. a permissions problem that will never resolve on Refresh, and makes such
failures very hard to diagnose since no error detail is logged or surfaced anywhere.

**Fix:** Narrow the catch to the specific torn-read signal (size/mtime mismatch already
detected via the `before`/`after` comparison) and let genuinely unexpected errors propagate
(or at minimum log them) instead of being silently folded into the retry path:

```ts
try {
  const before = await lstat(statPath);
  await dependencies.onAttempt?.(attempt);
  const bytes = await readBytes(before);
  const after = await lstat(statPath);
  if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
    return { bytes, sha256: digest(bytes) };
  }
  // size/mtime changed: legitimate race, fall through to retry
} catch (error) {
  if (!isExpectedRaceError(error)) throw error; // or: log before retrying
}
```

### WR-02: `performRefresh()`'s "auto-save before refresh" has no persistence barrier — a comment typed just before Refresh can be anchored against post-refresh content instead of what the user saw

**File:** `src/web/App.vue:1077-1100`, specifically lines 1081-1086

**Issue:** When an inline composer has unsaved text, `performRefresh()` calls
`dispatchWorkspace({ type: 'add-comment' })` (line 1082) and then immediately `await`s
`sessionClient.refreshWorktreeSnapshot()` (line 1086) with no wait for the add-comment
mutation's own network request to actually reach and be processed by the server. The codebase
has no awaitable persistence primitive for this dispatch path (acknowledged in 14-12's own
decision log as a known gap), so `dispatchWorkspace` only guarantees the mutation is
*queued*, not *persisted*, before the refresh request is sent. Since `routes.ts`'s
`/api/draft/mutations` addComment handler builds the comment's durable anchor from whatever
`capabilities.readContent(fileId)` returns *at the moment the HTTP request is handled*
(`routes.ts:371-394`), if the refresh POST reaches and completes on the Fastify server before
the add-comment POST is processed, the newly-typed comment's anchor would be built against the
**post-refresh** content/blobOid rather than the content the user was actually looking at when
they typed it — silently mis-anchoring the comment. It would also be excluded from that
specific refresh's `staleCount`/`orphanedCount` delta, since
`capabilities.ts`'s `refresh()` reads `commentsBefore` from `draftStore.loadState()` before the
add-comment mutation has necessarily landed.

**Fix:** Await the add-comment mutation's actual network completion (not just its dispatch)
before issuing the refresh request, e.g. by having `dispatchWorkspace` return (or exposing a
sibling API that returns) a promise resolved once the corresponding `/api/draft/mutations`
call settles, and `await`ing it in `performRefresh()` before calling
`sessionClient.refreshWorktreeSnapshot()`.

## Info

### IN-01: `launchUncommittedSession` computes a full changed-file inventory that is immediately discarded

**File:** `src/cli/run.ts:670-680` (the `createWorktreeChangedFileInventory` call used to
populate `UncommittedScopeSchema.parse({ ..., changedFiles })`)

**Issue:** `launchUncommittedSession` runs a full `createWorktreeChangedFileInventory` (two
`git diff`/`git ls-files` subprocess invocations plus per-file availability classification)
purely to satisfy `UncommittedScopeSchema`'s required `changedFiles` field. This value is never
read again: `createUncommittedSessionApp` → `materializeWorktreeSnapshot` →
`captureWorktreeManifest` independently re-invokes `createWorktreeChangedFileInventory` from
scratch (`worktree-snapshot.ts:232-240`) and is the sole source of truth for the actual
snapshot. The first inventory's result is pure dead computation on every CLI launch.

**Fix:** Either make `UncommittedScope.changedFiles` optional and omit it from the scope built
in `run.ts` (since the capability layer never reads it from `scope` either — confirm no other
consumer relies on it), or have `materializeWorktreeSnapshot` accept and reuse the
caller-supplied inventory instead of recomputing it.

### IN-02: Redundant/misleading `preimageBlobOid` branch implies preimage can be worktree-resident, but it never is

**File:** `src/server/worktree-snapshot.ts:334-338`

**Issue:** `preimageBlobOid` is computed with the same `scope.sourceKind === 'staged' ? raw : synthetic` branch used for `postimageBlobOid` (lines 339-343). For postimage this branch is
necessary — the new side crosses the worktree boundary for `unstaged`/`worktree` but not for
`staged` (lines 259-300). For **preimage**, however, the old side is *always* read via
`readObjectBackedSide` (lines 259-261) regardless of `sourceKind` — there is no code path
where the preimage is worktree-resident. The `scope.sourceKind === 'staged'` branch for
`preimageBlobOid` is therefore dead in the sense that both arms always evaluate to the same
value (the real git-computed oid), but the duplicated branch structure wrongly implies to a
future reader that preimage can be worktree-resident like postimage, inviting a future bug if
someone extends worktree-resident preimage support without noticing this asymmetry needs real
logic at that point.

**Fix:** Simplify to `frozenFile.oldMode === '000000' || preimageBytes === undefined ? frozenFile.oldBlobOid : frozenFile.oldBlobOid` → i.e. just `frozenFile.oldBlobOid` unconditionally (preimage is never worktree-resident), with a comment noting why it differs from the postimage computation.

### IN-03: `diskPathFor` builds worktree-relative paths without the symlink-escape discipline used elsewhere in the same phase

**File:** `src/server/capabilities.ts:969-973` (used by `captureChangeBaseline`/
`worktreeChangeIndicator`)

**Issue:** `diskPathFor` joins `scope.repositoryRoot` with the decoded path bytes directly and
calls `lstat` on the result. Elsewhere in this same phase (`lstatWorktreeLeaf` in
`src/git/worktree-inventory.ts:571-612`, mirrored from `PatchSnapshot.worktreeEntry()`), the
established discipline is a per-segment `lstat` walk that rejects any intermediate
symlink/non-directory component before touching the leaf. `diskPathFor` skips that walk. The
practical risk is low here — the result is only used to compare `size`/`mtimeMs` for a passive
"has anything changed" indicator, never to read or return file bytes — but it is an
inconsistent application of a security discipline this phase otherwise takes seriously, and
worth aligning for defense-in-depth consistency.

**Fix:** Reuse (or export and share) the same per-segment `lstat` walk used by
`lstatWorktreeLeaf` for `diskPathFor`'s resolution, or explicitly document why the passive
read-only stat comparison doesn't need it.

---

_Reviewed: 2026-10-31T00:09:29Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
