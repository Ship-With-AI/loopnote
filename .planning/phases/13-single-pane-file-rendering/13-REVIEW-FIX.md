---
phase: 13-single-pane-file-rendering
fixed_at: 2026-10-30T15:06:24Z
review_path: .planning/phases/13-single-pane-file-rendering/13-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-10-30T15:06:24Z
**Source review:** .planning/phases/13-single-pane-file-rendering/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope = critical_warning → WR-01, WR-02)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `editorKind` watcher disposes live adapter without tearing down its comment-composer zone, can hang diff adapter's in-flight `setFile()` promise

**Files modified:** `src/web/components/DiffWorkspace.vue`, `src/web/monaco/diff-adapter.ts`
**Commit:** `1b8d174`
**Applied fix:**
- `DiffWorkspace.vue`: the `watch(editorKind, ...)` handler now calls `unmountZone()` before `adapter?.dispose()`, mirroring the sibling `watch(() => props.content, ...)` handler two blocks above, so a live comment composer/accepted-comment card rendered into the adapter's view zone is unmounted via `render(null, zoneRoot)` instead of having its DOM node torn out from under the live Vue render tree.
- `diff-adapter.ts` (`PublicMonacoDiffAdapter`): `setFile()` previously created its `ready` promise with a bare `onDidUpdateDiff` one-off listener that only resolved when the diff-update event fired; if `dispose()` ran first, the listener was dropped and `ready` (and anything `await`ing `setFile()`) hung forever. Added a `pendingSetFileReady` field that `dispose()` now invokes (disposing the listener and resolving `ready`) when a `setFile()` call is mid-flight at disposal time. `setFile()` also checks `this.disposed` immediately after `await ready` and returns early, so it no longer touches editor/model state after the diff editor has been disposed. Rewrote the promise construction with `Promise.withResolvers<void>()` to match the existing project convention (already used in `cli/run.ts`, `git/candidates.ts`, `server/attached-completion.ts`) instead of the `new Promise((resolve) => …)` executor form used in the original code.

### WR-02: Single-pane status-kind set duplicated/can drift between `single-pane-layout.ts` and `StatusBadge.vue`

**Files modified:** `src/web/model/single-pane-layout.ts`, `src/web/components/StatusBadge.vue`
**Commit:** `59f2381`
**Applied fix:** Exported a new `isSinglePaneStatusKind(kind)` predicate from `single-pane-layout.ts` that checks membership in the existing `singlePaneStatusSides` routing table (the same single source of truth `singlePaneSideFor` already uses). `StatusBadge.vue` now imports and calls this predicate instead of re-implementing the `kind === 'added' || kind === 'deleted' || kind === 'type-changed'` check inline, so the accessibility "single pane" label can no longer silently drift from the actual single-pane routing table if a future phase adds/removes a status kind.

## Skipped Issues

None in scope — both WR-01 and WR-02 were fixed.

**Out of scope (Info-tier, not attempted per `fix_scope: critical_warning`):**

- **IN-01** (`src/web/components/DiffWorkspace.vue:360`): `diff-workspace--single-pane` CSS class has no matching rule in `styles.css`. Info-tier — skipped, not touched.
- **IN-02** (`tests/unit/single-pane-layout.test.ts`, `tests/e2e/anchored-review.spec.ts`): no direct automated coverage for the empty-file notice / type-changed header copy. Info-tier — skipped, not touched.

## Verification

Both fixes verified with:
- **Tier 1:** re-read each modified file section after editing; fix text present, surrounding code intact.
- **Tier 2:** `npm run typecheck:web` (`tsc --noEmit --project tsconfig.web.json`) run after each fix — clean, no errors in either modified file.

Full test suite intentionally not run (out of scope per verification strategy — handled by the verifier phase later).

---

_Fixed: 2026-10-30T15:06:24Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
