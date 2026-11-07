---
phase: 23-inline-comment-threads
plan: 08
subsystem: ui
tags: [vue, monaco, overlay-widget, playwright, vitest]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-02)
    provides: flattenThreadOrder/nextThread/previousThread pure cross-file navigation functions
  - phase: 23-inline-comment-threads (Plan 23-03)
    provides: projectOrphanedCommentGroup() file-level orphaned-comment grouping
  - phase: 23-inline-comment-threads (Plan 23-04)
    provides: CommentThread.vue / UndoToast.vue presentational components with typed props/emits
  - phase: 23-inline-comment-threads (Plan 23-06)
    provides: EditorTitle.vue previousThread/nextThread/toggleThreadsCollapsed emits and thread-state props
  - phase: 23-inline-comment-threads (Plan 23-07)
    provides: DiffWorkspace.vue keyed per-comment CommentThread mount loop and its eight mutation-dispatch emits
provides:
  - "App.vue: collapsedByCommentId/toggleCommentCollapse/toggleThreadsCollapsed session-scoped collapse state, dispatched into DiffWorkspace/EditorTitle"
  - "App.vue: mutation dispatch wiring resolve/reopen/edit/collapse through the existing mutateReview()/commentBuffers mechanism, zero new reducer branch"
  - "App.vue: pinned 'Orphaned comments' group (projectOrphanedCommentGroup) rendered above the diff area in every session kind"
  - "App.vue: delete-with-5s-Undo (locallyHiddenCommentIds/pendingDeletes/activeUndo, beginPendingDelete/commitPendingDelete/undoPendingDelete), single pagehide+visibilitychange flush-on-leave pair, UndoToast reusing the single aria-live region"
  - "App.vue: jumpThread(direction) built on thread-order.ts, bound at the DiffWorkspace emits, the EditorTitle icon-button emits, and the document-level handleKeydown Option+F9/Shift+Option+F9 branch"
  - "workspace-state.ts: canonicalComment() matches 'verified' OR 'stale' (never 'orphaned'), so activating a stale-anchored line focuses the existing thread instead of opening a duplicate composer"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All new Phase 23 state lives as ref/computed in App.vue (no new Pinia store, no component-local source of truth), matching the existing activeComposer/reviewDraft/workspaceState convention"
    - "Delete-with-Undo uses a plain non-reactive Map for timer bookkeeping (pendingDeletes) separate from the reactive Set that drives rendering (locallyHiddenCommentIds), and a watch(reviewFailure) effect to reverse the optimistic hide on a failed deleteComment mutation without adding a new mutateReview callback shape"

key-files:
  created:
    - tests/e2e/inline-comment-threads.spec.ts
  modified:
    - src/web/App.vue
    - src/web/model/workspace-state.ts
    - tests/unit/workspace-state.test.ts
    - src/web/components/DiffWorkspace.vue
    - src/web/styles.css

key-decisions:
  - "Tasks 1 and 3 landed in one commit: EditorTitle's required hasThreadsAnywhere/anyThreadExpanded/hasCommentsInCurrentFile props must be supplied together, and hasThreadsAnywhere depends on Task 3's thread-order computed — same same-script-block interleaving precedent as Plan 23-07's Task 1+3 commit."
  - "Task 2's locally-hidden-id filtering was folded into the same commit as Tasks 1/3 (not a separate commit) since it touches the exact same DiffWorkspace/orphanedGroups template bindings Task 1 introduced."
  - "On a failed deleteComment mutation, locallyHiddenCommentIds is cleared via a `watch(reviewFailure, ...)` effect (matching on operation:'delete') rather than a new mutateReview callback parameter — mutateReview's signature and its existing success/failure branches stay completely unchanged."

patterns-established: []

requirements-completed: [THREAD-01, THREAD-03, THREAD-04, THREAD-05, THREAD-07, THREAD-09]

# Metrics
duration: ~2h
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 08: Final App.vue Integration Wiring Summary

**Wires every remaining Phase 23 module into `App.vue` — collapse state, resolve/reopen/edit/delete mutation dispatch, the pinned Orphaned-comments group, delete-with-5s-Undo, and Option+F9/Shift+Option+F9 cross-file thread navigation — with zero new Pinia store and zero component-local state; also fixes two real re-render/stacking bugs this integration surfaced in `DiffWorkspace.vue` and `styles.css`.**

## Performance

- **Duration:** ~2h
- **Tasks:** 4
- **Files modified:** 5 (3 listed in the plan's frontmatter + 2 cross-cutting bugfixes surfaced during packaged-binary verification)

## Accomplishments
- `collapsedByCommentId`/`toggleCommentCollapse`/`toggleThreadsCollapsed` session-scoped collapse state, plus `anyThreadExpanded`/`hasCommentsInCurrentFile`/`hasThreadsAnywhere` computeds, wired to `EditorTitle`'s thread-nav icon group.
- Resolve/reopen/edit/delete/collapse all dispatch through the existing `mutateReview()`/`commentBuffers` mechanism via `DiffWorkspace`'s eight mutation emits — no new reducer branch.
- Pinned "Orphaned comments" group (`projectOrphanedCommentGroup`) rendered above the diff area (right after `Breadcrumbs`, before the loading/error/diff state chain) in every session kind, reusing `.conversation-card`/`ReviewStateBadge kind="unavailable"` chrome verbatim.
- Delete-with-5s-Undo: `locallyHiddenCommentIds`/`pendingDeletes`/`activeUndo`, `beginPendingDelete`/`commitPendingDelete`/`undoPendingDelete`, exactly one `pagehide` (window) + one `visibilitychange` (document) flush-on-leave listener pair, `UndoToast` mounted once next to the single existing `aria-live` region.
- `jumpThread('next' | 'previous')` built on `thread-order.ts`'s `flattenThreadOrder`/`nextThread`/`previousThread`, bound at all three mandatory entry points: `<DiffWorkspace>`'s `@next-thread`/`@previous-thread` emits (Monaco `addAction`, Plan 23-05), `<EditorTitle>`'s icon-button emits (Plan 23-06), and the document-level `handleKeydown` Option+F9 (previous) / Shift+Option+F9 (next) branch.
- `canonicalComment()` in `workspace-state.ts` now matches `'verified'` or `'stale'` (never `'orphaned'`), fixing the one-comment-per-anchor invariant for stale-anchored comments; new regression test added.
- Two bugs this plan's own packaged-binary verification surfaced and fixed (see Deviations): `DiffWorkspace.vue`'s missing re-render trigger for collapse/edit/buffer prop changes, and `.undo-toast`'s missing `z-index`.

## Task Commits

1. **Task 1 + Task 3 (interleaved) + Task 2's live-comment filtering: collapse state, mutation dispatch, Orphaned-comments group, delete-with-Undo, cross-file navigation** - `6137d49` (feat)
2. **Task 4: fix canonicalComment() to focus stale threads + regression test** - `cb91b3a` (fix)
3. **Deviation fix: re-render comment threads on collapse/editing/draft-buffer prop changes** - `f15fb06` (fix)
4. **Deviation fix: stack the delete-Undo toast above the diff editor** - `9bef87c` (fix)
5. **Packaged-binary Playwright coverage for this plan's own `<verification>`** - `9e355fe` (test)

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `src/web/App.vue` - collapse state, mutation dispatch, Orphaned-comments group, delete-with-Undo, cross-file thread navigation, all new refs/computeds/functions plus their template bindings
- `src/web/model/workspace-state.ts` - `canonicalComment()` one-line condition fix
- `tests/unit/workspace-state.test.ts` - regression test for stale-anchored `activate-line` focus
- `src/web/components/DiffWorkspace.vue` - widened the `renderThreads()` watcher to include `collapsedByCommentId`/`editingCommentId`/`commentBuffers` (deviation, see below)
- `src/web/styles.css` - `.undo-toast` gained `z-index: 20` (deviation, see below)
- `tests/e2e/inline-comment-threads.spec.ts` - new packaged-binary Playwright spec (this plan's share of the phase-wide gate)

## Decisions Made
- See `key-decisions` in frontmatter.
- The `added.ts`/`changed.ts` relative tree order in the new e2e spec is read from the rendered DOM (bounding-box comparison) rather than assumed, because `file-tree.ts` preserves `session.files`' server-determined order (no `.sort()` call) and git's rename detection does not fire for the fixture's tiny renamed file — it reports `old-name.ts`/`new-name.ts` as a plain delete+add, not a rename, so `new-name.ts` renders single-pane "Added", not two-pane.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DiffWorkspace.vue` never re-rendered threads when collapse/editing/buffer props changed**
- **Found during:** Packaged-binary Playwright verification (Task 1/2's edit-and-save and collapse-all steps)
- **Issue:** `DiffWorkspace.vue` only had `watch(() => props.comments, renderThreads)` — Plan 23-07 never added a watcher for the three new props (`collapsedByCommentId`, `editingCommentId`, `commentBuffers`) it itself defined. Clicking "Edit comment" or "Collapse all threads" in `App.vue` updated the right refs, but the mounted `CommentThread` instances never re-rendered with the new `editing`/`collapsed`/`editText` values — the edit textarea never appeared and collapse-all had no visible effect.
- **Fix:** Widened the watcher to `watch(() => [props.comments, props.collapsedByCommentId, props.editingCommentId, props.commentBuffers] as const, renderThreads)`.
- **Files modified:** `src/web/components/DiffWorkspace.vue`
- **Verification:** Packaged-binary Playwright test now resolves, edits-and-saves, and collapses/expands threads successfully end to end.
- **Committed in:** `f15fb06`

**2. [Rule 1 - Bug] `begin-edit-comment`/`cancel-comment-edit` handlers never called `refreshReviewSnapshot()`**
- **Found during:** Same Playwright verification pass as deviation 1
- **Issue:** Both handlers called `reviewState?.setCommentBuffer(...)` but, unlike the sibling `update-comment-edit-text` handler, never called `refreshReviewSnapshot()` afterward, leaving `reviewDraft.value.commentBuffers` (and therefore `DiffWorkspace`'s `commentBuffers` prop) one update behind the buffer App.vue had just written.
- **Fix:** Added the missing `refreshReviewSnapshot()` call to both handlers, matching the existing `update-comment-edit-text` pattern.
- **Files modified:** `src/web/App.vue`
- **Verification:** Edit-and-save Playwright step shows the correct initial/edited text.
- **Committed in:** `f15fb06`

**3. [Rule 1 - Bug] `.undo-toast` had no `z-index`, so Monaco's view-lines layer intercepted its Undo button**
- **Found during:** Packaged-binary Playwright verification (delete-with-Undo step)
- **Issue:** `.undo-toast` (added by Plan 23-04, first actually mounted into a live session by this plan) is `position: fixed` with no `z-index`. `.diff-workspace__editor` establishes a stacking context with `z-index: 1`, which won within the document's stacking order, so Monaco's `.view-lines` layer intercepted pointer events meant for the Undo button whenever the toast visually overlapped the editor.
- **Fix:** Added `z-index: 20` to `.undo-toast`, matching the project's existing top-level fixed-overlay precedent (`.modal-dialog-backdrop`).
- **Files modified:** `src/web/styles.css`
- **Verification:** `npm run verify:semantic-css` still passes (reused token, no new CSS vocabulary); Playwright's delete+Undo step now clicks the button successfully.
- **Committed in:** `9bef87c`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs this plan's own first real-browser exercise of Phase 23's mounted comment-thread UI surfaced).
**Impact on plan:** All three were strictly necessary for the plan's own `must_haves` ("a reviewer can resolve, reopen, edit... and collapse/expand threads by mouse or keyboard... and... click Undo") to actually work in a running session. No scope creep — no new behavior beyond what the plan already specified, just fixing why the specified behavior wasn't rendering/clickable.

## Issues Encountered
- The e2e spec's first draft assumed `new-name.ts` (the fixture's renamed file) would render two-pane; git's rename detection does not fire for that tiny file, so it renders single-pane "Added" instead. Reworked the cross-file navigation scenario to use `added.ts` and to determine the two files' relative tree order empirically (via DOM bounding boxes) rather than assuming it, so the test is correct regardless of `session.files`' server-determined ordering.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npx vue-tsc --noEmit --project tsconfig.web.json` (plan-level `<verification>`, same as `npm run typecheck:web`) — **0 errors**.
- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **pass** ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."); the only new CSS is `.undo-toast`'s `z-index: 20` (reused integer, no new token/hex).
- `npx vitest run --no-file-parallelism tests/unit` (full unit suite) — **460 tests passed, 45 test files passed, 0 failed** (includes this plan's new stale-anchor regression test; no regressions).
- `npx vitest run --no-file-parallelism tests/unit/workspace-state.test.ts` (task-level) — **16 tests passed, 1 test file passed**.
- Packaged-binary build (`npm run build`, invoked internally by `scripts/pack-runtime.mjs`) + Playwright `chromium.launch()` against the packaged `dist/bin/loopnote.mjs`, same pack-and-spawn pattern as `tests/e2e/anchored-review.spec.ts` — **2/2 passed** (`tests/e2e/inline-comment-threads.spec.ts`):
  - Committed two-pane session: resolve a thread (200 response, "Resolved" chip), edit-and-save a thread (200 response, new body text rendered), collapse-all/expand-all from the editor title (bodies hidden/shown), Option+F9 inside the diff editor (re-expands a previously-collapsed thread, switching files when needed), Option+F9/Shift+Option+F9 outside the editor with a cross-file jump and both locked-verbatim wraparound announcements ("Wrapped to last thread" / "Wrapped to first thread").
  - Standalone single-pane session: delete a thread and click Undo — thread reappears, **observed deleteComment-request count for that comment: 0** (confirmed via a `page.on('request')` listener over a 5.5s window); delete another thread and let the toast expire — **observed deleteComment-request count for that comment: exactly 1**, never zero, never two.
- `tests/e2e/agent-ready-export.spec.ts` (requested check, since `App.vue` was touched extensively): attempted via `npx playwright test --config=playwright.runtime-artifact.config.ts tests/e2e/agent-ready-export.spec.ts` — **blocked by the pre-existing `LOOPNOTE_RUNTIME_CUSTODY_DIR is required` environment gate** (this spec is one of four `custodyGatedSpecs` in `playwright.runtime-artifact.config.ts`, requiring a release-candidate custody directory this environment does not have). This exact gate is documented as an out-of-scope, pre-existing external-environment limitation across this project's own history (`.planning/milestones/v1.6-phases/10-diff-reading-surface/10-CONTEXT.md:42`, `11-08-SUMMARY.md`, `MILESTONES.md:114-118`, among others) — not something introduced by this plan. Verified instead by code-diff review: none of this plan's `App.vue` changes touch `mutateReview`'s `setSummary`/`addComment`/`exportReview`/`finishAttachedReview` function bodies or the agent-attached lifecycle — every change is additive (new refs/computeds/functions, new template props/emits, one new `handleKeydown` branch, two new `onMounted`/`onBeforeUnmount` listener registrations). The full unit suite (460 tests, 0 failed) and this plan's own 2 packaged-binary Playwright tests (which boot and drive the same `App.vue` end to end in two different session kinds) are the available substitute evidence that the app still functions correctly.
- Golden-hash anchor tests: not in scope near this plan's changes (no anchor/hash logic touched); unaffected per the full unit-suite pass above.

## Self-Check: PASSED

- `src/web/App.vue`, `src/web/model/workspace-state.ts`, `tests/unit/workspace-state.test.ts`, `src/web/components/DiffWorkspace.vue`, `src/web/styles.css`, `tests/e2e/inline-comment-threads.spec.ts` — all **FOUND** on disk with the expected changes.
- Commits `6137d49`, `cb91b3a`, `f15fb06`, `9bef87c`, `9e355fe` — all confirmed **FOUND** in `git log --oneline --all`.
- Every task's `<verify>`/`<done>` criteria re-checked: Task 1 (resolve/reopen/edit/collapse dispatch through existing mechanisms + pinned Orphaned group) — confirmed by direct code read and the packaged-binary Playwright run. Task 2 (delete hides immediately, one Undo toast, Undo restores with no server call, expiry sends exactly one `deleteComment`, `pagehide`/`visibilitychange` flush pair) — confirmed by direct code read and the Playwright run's exact request-count assertions. Task 3 (Option+F9/Shift+Option+F9 from all three entry points, wraparound, cross-file file-open) — confirmed by direct code read and the Playwright run. Task 4 (`canonicalComment()` matches `'verified'`/`'stale'`, new regression test) — confirmed by direct code read and the targeted + full unit-suite runs.
- Plan-level `<verification>`/`<success_criteria>` re-run: all shared-context gates green; packaged-binary Playwright run 2/2 passed with the exact request-count evidence required.
- No stub/placeholder patterns flow to UI rendering; no scope was narrowed.

## Next Phase Readiness
- Every THREAD-01..09 requirement is now user-observable end to end in a running session: resolve/reopen/edit/delete-with-Undo/collapse-expand by mouse or keyboard, cross-file Option+F9/Shift+Option+F9 navigation, the pinned Orphaned-comments group, and the one-comment-per-anchor invariant for stale anchors.
- This is the final plan in Phase 23 — phase-wide verification (all 8 plans) is the orchestrator's next step.
- No blockers for downstream work.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
