---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 14
subsystem: ui
tags: [vue, playwright, refresh, anchor-verification, file-tree]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "14-08's server-side refresh/reclassification endpoint (POST /api/refresh, verifyAnchor-derived stale/orphaned classification); 14-11's FileRow.vue recentlyChanged prop and tree-row__refresh-marker span"
provides:
  - "performRefresh() resyncs workspaceComments from the live server draft after every successful Refresh, so StaleAnchorNotice and per-comment status badges reflect reclassification immediately without a page reload (SNAP-05 client-side half)"
  - "recentlyChangedPaths client state populated from each Refresh's added/removed/modified delta, threaded through ChangedFilesDialog.vue -> FileTree.vue -> DirectoryRow.vue to every FileRow at any tree depth, cleared per-path when the file is opened (SNAP-04/D-15 tree-row marker)"
  - "Fixed a latent reconciledWorkspaceComments() bug that discarded freshly reconciled comment status/exactFile/fileId/recordedAnchor in favor of stale client-cached values whenever a comment with the same id already existed locally"
affects: [15-standalone-file-review, 16-rendered-markdown-preview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-mutation client resync: call sessionClient.getDraft() then workspace.replaceComments(reconciledWorkspaceComments(...)) to pull live server-derived comment state into the reactive workspace, mirroring reloadLatestReview()'s established sequence"
    - "Prop threading through a 3-level Vue component tree (ChangedFilesDialog -> FileTree -> DirectoryRow, recursively) using a ReadonlySet<string> passed by reference, with each tree-level component owning its own small isRecentlyChanged() path-matching helper rather than sharing a cross-component util"

key-files:
  created: []
  modified:
    - src/web/App.vue
    - src/web/components/ChangedFilesDialog.vue
    - src/web/components/FileTree.vue
    - src/web/components/DirectoryRow.vue
    - tests/e2e/uncommitted-review.spec.ts

key-decisions:
  - "Fixed reconciledWorkspaceComments() to return the fresh reconcileDraftComments() output directly instead of merging through a previous-comment spread that silently clobbered status/exactFile/fileId/recordedAnchor with stale client values (Rule 1 bug, blocking SNAP-05's own truth; the merge was a no-op for state/body since both already derive from the same server draft, so dropping it only fixes correctness, discovered during Task 3's first full e2e run)"
  - "Task 1's commit also included selectFile()'s clear-on-open logic and the ChangedFilesDialog recently-changed-paths prop mount site wiring (App.vue side of Task 2), ahead of the plan's stated per-task file boundary, since both are tightly coupled to the recentlyChangedPaths ref declared in the same commit"

requirements-completed: [SNAP-04, SNAP-05]

# Metrics
duration: 70min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 14: Client-side Refresh comment resync and tree-row "Changed" marker wiring Summary

**`performRefresh()` now resyncs `workspaceComments` from a post-refresh `getDraft()` call and threads a `recentlyChangedPaths` ref through `ChangedFilesDialog.vue` → `FileTree.vue` → `DirectoryRow.vue` to every `FileRow`, closing both verification gaps from Phase 14's shipped client shell.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-10-30T22:10:00Z (approx.)
- **Completed:** 2026-10-30T23:20:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `performRefresh()` fetches the live draft via `getDraft()` after every successful `refreshWorktreeSnapshot()` and feeds it into `workspace.replaceComments(reconciledWorkspaceComments(...))`, so `StaleAnchorNotice` and per-comment status badges reflect the server's reclassification immediately — no page reload needed (SNAP-05).
- `recentlyChangedPaths` (a `ref<Set<string>>`) is replaced wholesale on every Refresh from the delta's `added`/`removed`/`modified` path arrays, threaded through `ChangedFilesDialog.vue` → `FileTree.vue` → `DirectoryRow.vue` (recursively) to every `FileRow`, showing the existing "Changed" tree-row marker at any tree depth until the file is opened (SNAP-04/D-15).
- `selectFile()` clears a file's entry from `recentlyChangedPaths` the moment it's opened.
- Found and fixed a pre-existing bug in `reconciledWorkspaceComments()` that was silently discarding the very status update this plan depends on — it merged `{...previousClientComment, state: comment.state, body: comment.body}`, which is a no-op for `state`/`body` (both already server-derived) while clobbering `status`/`exactFile`/`fileId`/`recordedAnchor` with stale client values on every call where a comment with the same id already existed locally. Fixed by returning the fresh `reconcileDraftComments()` output directly.
- Updated `tests/e2e/uncommitted-review.spec.ts`'s pinned "broken behavior" assertion (`StaleAnchorNotice` heading `toHaveCount(0)`) to assert the now-correct `toBeVisible()`, and added new coverage proving the tree-row marker appears after Refresh and clears when the file is reopened.

## Task Commits

Each task was committed atomically:

1. **Task 1: performRefresh() resyncs workspaceComments and captures the refresh delta** - `fa59e2e` (feat)
2. **Task 2: Thread recentlyChangedPaths to FileRow at every tree depth, clearing on file open** - `2b53f25` (feat)
3. **Task 3: Update the e2e suite to assert the fixed comment-resync and tree-row marker behavior** (includes the `reconciledWorkspaceComments` bug fix) - `bedaba6` (test)

## Files Created/Modified
- `src/web/App.vue` - `recentlyChangedPaths` ref; `performRefresh()` resync; `selectFile()` clear-on-open; `ChangedFilesDialog` mount prop; `reconciledWorkspaceComments()` bug fix
- `src/web/components/ChangedFilesDialog.vue` - `recentlyChangedPaths` prop, passed through to `FileTree`
- `src/web/components/FileTree.vue` - `recentlyChangedPaths` prop, `isRecentlyChanged()` helper, wired to top-level `FileRow`/`DirectoryRow`
- `src/web/components/DirectoryRow.vue` - `recentlyChangedPaths` prop, its own `isRecentlyChanged()` helper, wired recursively to nested `FileRow`/`DirectoryRow`
- `tests/e2e/uncommitted-review.spec.ts` - replaced the pinned-broken assertion; added tree-row marker visible/cleared coverage

## Decisions Made
- See `key-decisions` in frontmatter: the `reconciledWorkspaceComments()` fix and the Task 1/Task 2 commit-boundary note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `reconciledWorkspaceComments()` discarding fresh comment status on every call**
- **Found during:** Task 3, first full `npx playwright test tests/e2e/uncommitted-review.spec.ts` run after Tasks 1 and 2 landed. `RefreshSummaryPanel`'s server-truth "1 comment now orphaned" count rendered correctly, but the new `StaleAnchorNotice` `toBeVisible()` assertion (this task's own fixed-behavior assertion) timed out — the heading never appeared.
- **Issue:** `reconciledWorkspaceComments(draft)` looked up each freshly-reconciled comment's previous client-side counterpart by id and returned `{ ...previous, state: comment.state, body: comment.body }`. Since `comment.state`/`comment.body` are themselves already derived from the same server draft inside `reconcileDraftComments()`, that override was a no-op — the net effect was that `status`, `exactFile`, `fileId`, and `recordedAnchor` were silently pinned to whatever the client last saw, for any comment that already existed in the live workspace. `hasUnverifiedAnchors` (and therefore `StaleAnchorNotice`'s visibility) reads `comment.status`, so it never flipped to `orphaned` even though the server's `GET /api/draft` response (verified directly in the browser response body during debugging) correctly reported `verification.state: "orphaned"`.
- **Fix:** Removed the stale-merge logic; `reconciledWorkspaceComments()` now returns `reconcileDraftComments(draft.comments, session.value?.files ?? [])` directly, since that call already produces the fully-correct, fresh `WorkspaceComment[]` (state, body, status, exactFile, fileId, recordedAnchor all server-derived).
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` (0 errors); full `npx playwright test tests/e2e/uncommitted-review.spec.ts` run, 4/4 passed including the new `StaleAnchorNotice` and tree-row marker assertions. This function is also used by `reloadLatestReview()`'s export-conflict-reload path; confirmed the fix is behavior-neutral there since `state`/`body` are unaffected (same source either way) and the only change is that `status`/`exactFile`/`fileId`/`recordedAnchor` now correctly refresh instead of staying pinned — strictly a correctness improvement, not a behavior change any existing test depended on the old (stale) values for.
- **Committed in:** `bedaba6` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix).
**Impact on plan:** Necessary for Task 1's own stated truth ("StaleAnchorNotice... reflect the server's reclassification immediately") to actually hold. No scope creep — the fix is scoped to the one function Task 1's `<read_first>` explicitly pointed at for reuse.

## Issues Encountered

During a full-suite sanity check of `tests/e2e/complete-review-draft.spec.ts` (not in this plan's `files_modified`, run only to confirm the shared `reconciledWorkspaceComments()` fix didn't regress `reloadLatestReview()`'s conflict-reload path), 8/8 tests in that file failed with `.monaco-diff-editor` never becoming visible. Investigation via a temporary debug-only edit (reverted, not committed) showed the actual page DOM: the default-selected file on load is `src/added.ts`, now rendered via Phase 13's single-pane editor ("Added, single pane... Immutable head only") rather than the old side-by-side `.monaco-diff-editor`. This is a pre-existing regression from Phase 13 (Single-Pane File Rendering) against this older test file's selector assumptions — it reproduces before any of this plan's code runs (the failure is the very first interaction, `page.goto` + locator wait, with no console or page errors logged) and is unrelated to anything in this plan's `files_modified`. Not fixed here (out of scope); flagged for the user/next phase audit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both gap-closure truths for 14-14 hold: `StaleAnchorNotice`/per-comment badges resync after Refresh without a page reload, and the "Changed" tree-row marker appears at any depth and clears on open.
- `tests/e2e/uncommitted-review.spec.ts` (4/4) passes with the fixed-behavior assertions in place of the previously-pinned broken ones.
- **Blocker for a separate concern (not this plan):** `tests/e2e/complete-review-draft.spec.ts` (8/8) currently fails against the packaged build because the default-selected file on load for its fixture is single-pane-rendered since Phase 13, while the test still asserts `.monaco-diff-editor`. This predates 14-14 and should be triaged against Phase 13's rollout, not this gap-closure plan.

## Self-Check: PASSED

- `src/web/App.vue` — FOUND
- `src/web/components/ChangedFilesDialog.vue` — FOUND
- `src/web/components/FileTree.vue` — FOUND
- `src/web/components/DirectoryRow.vue` — FOUND
- `tests/e2e/uncommitted-review.spec.ts` — FOUND
- Commit `fa59e2e` — FOUND in `git log`
- Commit `2b53f25` — FOUND in `git log`
- Commit `bedaba6` — FOUND in `git log`

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*
