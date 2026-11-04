---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 12
subsystem: ui
tags: [vue, session-client, refresh, polling, export-gating, keyboard-shortcut]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "IdentityHeader.vue's showRefresh/refreshBusy/worktreeChanged props and refresh emit (14-10); InlineNotice.vue's dismissible prop, FileRow.vue's markers, RefreshSummaryPanel.vue (14-11); POST /api/refresh, GET /api/worktree-status, UncommittedSessionResponseSchema (14-08)"
provides:
  - "src/web/api/client.ts's refreshWorktreeSnapshot() (POST /api/refresh) and getWorktreeStatus() (GET /api/worktree-status) session-client methods, Zod-validated against locally-scoped RefreshResultSchema/WorktreeStatusResponseSchema"
  - "App.vue's isUncommittedSession/uncommittedSession computeds, emptyFilesCopy's fourth 'No changes' branch (D-03), and the changed-during-capture non-reviewable-pane copy fix (D-09/D-12)"
  - "App.vue's startWorktreeIndicator/stopWorktreeIndicator 30s change-indicator poll (D-14), performRefresh() with D-17 auto-save-before-refresh ordering, Alt+Shift+R shortcut, dismissible session banner + RefreshSummaryPanel mount in .shell-warning-stack"
  - "ReviewNotesDialog.vue's exportSupported prop (default true) gating ExportSection, wired from App.vue as :export-supported=\"!isUncommittedSession\""
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "refreshWorktreeSnapshot()/getWorktreeStatus() mirror refreshSupportStatus()/getPatchStatus()'s exact requestJson(path, method, failureKind) call shape and SessionClientError('session', SESSION_UNAVAILABLE_MESSAGE)-on-parse-failure convention, validated against two new Zod schemas scoped locally to client.ts (not added to contracts/api.ts, since 14-08's capabilities.refresh()/worktreeChangeIndicator() never got an exported Zod contract and this plan's files_modified excludes contracts/api.ts)"
    - "startWorktreeIndicator/stopWorktreeIndicator/refreshWorktreeIndicator(WhenVisible) are a structural copy of startPatchStatus/stopPatchStatus/refreshPatchStatus(WhenVisible): same visibilitychange listener, same window.setInterval(..., 30_000), same in-flight boolean guard (worktreeIndicatorRefreshing mirrors patchStatusRefreshing)"

key-files:
  created: []
  modified:
    - src/web/api/client.ts
    - src/web/App.vue
    - src/web/components/ReviewNotesDialog.vue

key-decisions:
  - "Targeted App.vue's existing v-else-if=\"selectedFile?.availability.kind !== 'text'\" pane for the changed-during-capture copy fix, not ActiveFileToolbar.vue — confirmed by inspection that ActiveFileToolbar.vue has no non-reviewable-reason rendering at all; the UI-SPEC's File Ownership Map row naming it was imprecise, as the plan's read_first block itself flagged."
  - "D-19 relaunch-recovery: no additional browser-side trigger was added. Traced 14-09's CLI-side findUncommittedDraftCandidate() call (src/cli/run.ts) and confirmed it only prints a terminal notice — it is never passed into createUncommittedSessionApp() or any server capability, so no 'different-digest recovery candidate' signal reaches the browser. DraftLoadResponseSchema's kind union (missing/current/malformed/schemaInvalid/newerUnsupported) has no such kind either. Building a real D-19 browser offer requires a new server-side signal (draft-loader.ts/capabilities.ts/contracts/api.ts), all outside this plan's files_modified scope (src/web/App.vue, src/web/api/client.ts, src/web/components/ReviewNotesDialog.vue only). This matches the plan's own read_first caveat: 'this task's job may be limited to confirming no additional browser-side trigger is needed.' No fake/stubbed trigger was added to avoid a non-functional second recovery path."
  - "uncommittedBaseLabel is a plain 'Repository object' string literal (not a reactive computed), mirroring IdentityHeader.vue's own baseCandidateLabel — 14-08's UncommittedSessionResponseSchema carries only baseCommitOid, never a human-readable candidate label, so there is nothing to derive reactively."
  - "performRefresh()'s D-17 auto-save step calls dispatchWorkspace({ type: 'add-comment' }) synchronously before calling sessionClient.refreshWorktreeSnapshot() — the same trigger Cmd/Ctrl+Enter already uses in the composer (no new save path invented). The anchor is captured against the current file/line at dispatch time, before refresh can change anything client-side, so this ordering satisfies 'auto-saves against the pre-refresh snapshot' without needing a new awaitable persistence primitive (none exists in the codebase's existing fire-and-forget persist-comment command flow)."
  - "FileRow.vue's recentlyChanged prop (14-11) was not wired from App.vue's refresh delta — the live file tree renders through a Teleport target (#changed-files) owned by a component outside this plan's files_modified list, so threading the post-Refresh 'Changed' marker through it is out of scope here and was not attempted."

patterns-established: []

requirements-completed: [SNAP-02, SNAP-03, SNAP-04]

# Metrics
duration: 70min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 12: Uncommitted Source Review Shell Wiring Summary

**Wires 14-10/14-11's Refresh UI, session banner, and RefreshSummaryPanel into App.vue's running shell via two new session-client methods, a 30s change-indicator poll modeled byte-for-byte on the existing patch-status poll, an Alt+Shift+R shortcut, D-17-ordered comment auto-save, and conditional Export-section rendering for uncommitted sessions.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `src/web/api/client.ts` gained `refreshWorktreeSnapshot()` (`POST /api/refresh`) and `getWorktreeStatus()` (`GET /api/worktree-status`), each mirroring an existing method's exact `requestJson` call shape and Zod-safeParse-or-throw convention, with two new locally-scoped Zod schemas (`RefreshResultSchema`, `WorktreeStatusResponseSchema`).
- `App.vue` gained `isUncommittedSession`/`uncommittedSession` computeds and `emptyFilesCopy`'s fourth branch: an uncommitted session with zero changed files now shows `No changes` with the exact per-sourceKind body copy (Staged/Unstaged/Working tree, the last naming the resolved `Repository object` base label).
- The existing non-reviewable-file pane's message now special-cases `reason === 'changed-during-capture'`, showing the exact D-09-compliant copy (`This file changed while Cumpa was capturing the snapshot and could not be read consistently. Refresh to recapture it.`) while every other unsupported/unavailable reason renders unchanged.
- `startWorktreeIndicator`/`stopWorktreeIndicator` poll `GET /api/worktree-status` every 30 seconds while the tab is visible (identical `visibilitychange`+`setInterval` shape to the shipped `patchStatus` poll), updating `IdentityHeader`'s `worktree-changed` prop without ever triggering a refresh.
- `performRefresh()` auto-saves an unsaved inline comment composer (D-17, reusing the existing `add-comment` dispatch) before calling `refreshWorktreeSnapshot()`, then opens `RefreshSummaryPanel` automatically when the delta has at least one added/removed/modified file (SNAP-04/D-15). `Alt+Shift+R` (guarded to uncommitted sessions) and `IdentityHeader`'s Refresh button both call it.
- A dismissible `{N} files changed during capture — Refresh to recapture` session banner and the `RefreshSummaryPanel` mount both live in `.shell-warning-stack`, whose `v-if` was extended additively (new `||` clauses appended, existing clauses/ordering untouched).
- `ReviewNotesDialog.vue` gained an `exportSupported` prop (default `true`) gating `ExportSection`; `App.vue` passes `:export-supported="!isUncommittedSession"`, so Export/Finish-review is hidden — never shown broken — for uncommitted sessions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Session client methods, empty-session copy, non-reviewable-pane copy fix** - `7497aa4` (feat)
2. **Task 2: Session banner, RefreshSummaryPanel mount, 30s polling, Alt+Shift+R, export gating** - `af1cdcc` (feat)

## Files Created/Modified

- `src/web/api/client.ts` - `refreshWorktreeSnapshot()`/`getWorktreeStatus()` methods, `RefreshResult` type export, two local Zod schemas, interface additions.
- `src/web/App.vue` - `isUncommittedSession`/`uncommittedSession`/`uncommittedBaseLabel`/`capturedFilesChanged` computeds; `emptyFilesCopy`'s fourth branch; non-reviewable-pane copy fix; `startWorktreeIndicator`/`stopWorktreeIndicator`/`refreshWorktreeIndicator(WhenVisible)`/`performRefresh()` functions; `Alt+Shift+R` handling; session banner + `RefreshSummaryPanel` mount; `IdentityHeader`/`ReviewNotesDialog` prop wiring.
- `src/web/components/ReviewNotesDialog.vue` - `exportSupported` prop (default `true`) gating `<ExportSection>` behind `<template v-if="exportSupported">`.

## Decisions Made

See `key-decisions` in frontmatter: non-reviewable-pane target file correction (App.vue, not ActiveFileToolbar.vue); D-19's scope limited to confirming no buildable browser-side trigger exists within this plan's files; `uncommittedBaseLabel` as a static literal; D-17's auto-save sequencing via the existing `add-comment` dispatch; `FileRow.vue`'s `recentlyChanged` wiring left out of scope (owned by a Teleport-mounted tree component not in this plan's files_modified).

## Deviations from Plan

None - plan executed as written. The two items the plan explicitly flagged as judgment calls (the non-reviewable-pane target file, and D-19's scope) were resolved exactly as the plan's own `read_first` guidance anticipated, not as unplanned deviations.

## Issues Encountered

- `npm run typecheck:web`'s `tsconfig.web.json` only lists seven standalone Monaco/model `.ts` files — it does not actually typecheck `.vue` files or `src/web/api/client.ts` (consistent with PROJECT.md's known accepted debt, "Bring `.vue` files under typechecking with `vue-tsc`," still unmet; `vue-tsc` itself currently errors against the installed `typescript@7.0.2` in this repo). Since `npm run typecheck:web` is the plan's only specified `<verify>` command, it was run and passes (exit 0) exactly as specified. As an additional, non-required sanity check beyond the plan's literal verification, `npm run build:web` (`vite build`) was also run against both commits and succeeded with no template/compile errors, giving higher confidence in the `.vue` edits than the project's current typecheck setup alone provides.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every Phase 14 UI surface (empty state, non-reviewable header copy, session banner, change indicator, Refresh button + keyboard shortcut, RefreshSummaryPanel, export gating) is now wired to real session client calls for uncommitted sessions. SNAP-02/03/04 are observable end to end in the browser.
- Remaining known gaps, both explicitly out of this plan's scope: (1) D-19's full browser "Resume previous uncommitted review?" offer needs a new server-side signal threaded through `/api/draft` or a new endpoint (draft-loader.ts/capabilities.ts/contracts changes) before any browser trigger can be built; (2) `FileRow.vue`'s post-Refresh `Changed` marker (`recentlyChanged` prop, built in 14-11) is not yet wired to the live file tree, since that tree mounts through a Teleport target owned by a component outside this plan's `files_modified`.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

- `src/web/api/client.ts` — FOUND, contains `async refreshWorktreeSnapshot` (1), `async getWorktreeStatus` (1)
- `src/web/App.vue` — FOUND, contains `isUncommittedSession` (7), `'No changes'` (1), `could not be read consistently` (1), `startWorktreeIndicator`/`stopWorktreeIndicator` (4), `30_000` (3), `altKey && event.shiftKey && event.key.toLowerCase() === 'r'` (1), `<RefreshSummaryPanel` (1), `changed during capture — Refresh to recapture` (1), `:export-supported="!isUncommittedSession"` (1)
- `src/web/components/ReviewNotesDialog.vue` — FOUND, contains `exportSupported` (3)
- Commit `7497aa4` FOUND in `git log --oneline`
- Commit `af1cdcc` FOUND in `git log --oneline`
- `npm run typecheck:web` — exits 0
- `npm run build:web` (additional sanity check, not plan-required) — exits 0
