---
phase: 13-single-pane-file-rendering
reviewed: 2026-10-30T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/contracts/api.ts
  - src/server/capabilities.ts
  - src/server/patch-snapshot.ts
  - src/web/App.vue
  - src/web/components/ActiveFileToolbar.vue
  - src/web/components/DiffWorkspace.vue
  - src/web/components/FileRow.vue
  - src/web/components/ReviewToolbar.vue
  - src/web/components/StatusBadge.vue
  - src/web/model/single-pane-layout.ts
  - src/web/monaco/diff-adapter.ts
  - src/web/styles.css
  - tests/api/session.test.ts
  - tests/e2e/anchored-review.spec.ts
  - tests/e2e/pinned-session.spec.ts
  - tests/e2e/responsive-session.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/unit/draft-reconciliation.test.ts
  - tests/unit/file-tree.test.ts
  - tests/unit/monaco-diff-adapter.test.ts
  - tests/unit/single-pane-layout.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the single-pane rendering surface (plain-`ICodeEditor` adapter, `DiffWorkspace.vue` layout branch, `StatusBadge`/`ActiveFileToolbar` markers, `oldMode` threading through `api.ts`/`capabilities.ts`/`patch-snapshot.ts`) end to end, including the newly added unit and e2e coverage. The D-01..D-14 decisions are implemented correctly for the paths the current `App.vue` wiring actually exercises: `singlePaneSideFor`/`wasModeKind` are pure and well-tested, the plain-editor adapter correctly omits all diff-only Monaco options and diff decorations (D-02/D-04), `oldMode` is threaded consistently through both session-building code paths and validated with the same `FileMetadataResponseSchema`, and the e2e specs genuinely exercise added/deleted single-pane commenting through the packaged CLI.

No crash, data-loss, or security-class defects were found. Two warnings are worth fixing: a latent resource-leak path in `DiffWorkspace.vue`'s new `editorKind` watcher (currently unreachable through `App.vue`'s wiring, but this surface is explicitly meant to be reused by Phases 14–16, so the latent bug will become reachable), and duplicated single-pane status-kind logic between `single-pane-layout.ts` and `StatusBadge.vue` that risks silently drifting the accessibility label away from actual behavior. Two informational items round out the review.

## Warnings

### WR-01: `editorKind` watcher disposes the live adapter without tearing down its comment-composer zone, and can hang the diff adapter's in-flight `setFile()` promise

**File:** `src/web/components/DiffWorkspace.vue:311-323`
**Issue:** When `editorKind` (derived from `singlePaneSide`) changes while the component stays mounted, this watcher calls `adapter?.dispose()` synchronously and recreates a new adapter of the other kind in `nextTick`. Two problems:

1. Unlike the sibling `watch(() => props.content, ...)` handler two blocks above (line 302-309), this watcher never calls `unmountZone()` first. If a comment composer (or accepted-comment card) is currently rendered into the adapter's `.monaco-anchor-zone--composer` view zone, `adapter.dispose()` tears down the Monaco view zone's DOM node out from under the live Vue render tree mounted into `zoneRoot` via `render(h(CommentComposer, …), zone)` — the `CommentComposer` instance (and its watchers/effects) is never explicitly unmounted via `render(null, zoneRoot)`, leaking the component instance.
2. If the adapter being disposed is a `PublicMonacoDiffAdapter` with a `setFile()` call still in flight (its `await ready` is tied to a one-off `onDidUpdateDiff` listener created inside `setFile`, `diff-adapter.ts:221-226`), disposing the diff editor before that event fires means the listener never disposes and the `ready` promise never resolves — the stale `loadContent()` call (and anything chained after its `await adapter.setFile(...)`) hangs forever, and the one-off listener closure leaks.

Today this is latent rather than live: `App.vue` always resets `selectedContent.value = undefined` before loading a new file's content (`App.vue:304`, `App.vue:780`), and `DiffWorkspace`'s `v-else-if="selectedContent !== undefined"` gate (`App.vue:1187`) means the component fully unmounts/remounts on every file switch — so `editorKind` never actually changes on a *live* instance through the current app flow, and there is no component-level test for `DiffWorkspace.vue` that exercises this watcher directly. However, `13-CONTEXT.md` explicitly says this single-pane surface "is reused by Phases 14–16, so it should be a reusable path, not a special case" — the first future caller that updates `content`/`singlePaneSide` without going through a full remount will hit this.

**Fix:** Mirror the content watcher: call `unmountZone()` before disposing, and make the diff adapter's `setFile()` resilient to disposal mid-flight (e.g. guard the `ready` executor with a `disposed` check, or register the one-off listener in `staticDisposables` so `dispose()` cleans it up even if it never fired):

```ts
watch(editorKind, () => {
  unmountZone();
  adapter?.dispose();
  adapter = undefined;
  void nextTick(() => {
    if (host.value === undefined) return;
    adapter = props.singlePaneSide !== undefined
      ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, props.singlePaneSide)
      : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState);
    syncCodeDensity();
    syncSideNames();
    void loadContent();
  });
});
```

### WR-02: Single-pane status-kind set is duplicated and can drift between `single-pane-layout.ts` and `StatusBadge.vue`

**File:** `src/web/components/StatusBadge.vue:29-36` (vs. `src/web/model/single-pane-layout.ts:7-13`)
**Issue:** `singlePaneSideFor`'s routing table (`added`/`deleted`/`type-changed`) is the single source of truth for which statuses render single-pane (D-05). `StatusBadge.vue`'s `singlePaneSuffix` computed re-implements the same status-kind check independently (`kind === 'added' || kind === 'deleted' || kind === 'type-changed'`) instead of importing it. D-09 requires the tree's hidden label to say "single pane" exactly for files that actually render single-pane; if a future phase changes `singlePaneStatusSides` (e.g. adds/removes a status kind) without remembering to touch this second copy, the accessibility label will silently lie about the file's actual rendering, which is exactly the color-independent-identification guarantee D-09/PANE-03 exist to protect.
**Fix:** Export a shared predicate from `single-pane-layout.ts` and reuse it:

```ts
// single-pane-layout.ts
export function isSinglePaneStatusKind(kind: ChangedFileStatusKind): boolean {
  return kind in singlePaneStatusSides;
}
```

```ts
// StatusBadge.vue
import { isSinglePaneStatusKind } from '../model/single-pane-layout.js';
const singlePaneSuffix = computed(() =>
  props.reviewable && isSinglePaneStatusKind(props.kind) ? ', single pane' : '',
);
```

## Info

### IN-01: `diff-workspace--single-pane` CSS class has no matching rule

**File:** `src/web/components/DiffWorkspace.vue:360`
**Issue:** The single-pane `<section>` root carries both `diff-workspace` and `diff-workspace--single-pane` classes, but `src/web/styles.css` defines no `.diff-workspace--single-pane` rule (only `.diff-workspace__side-labels--single-pane` at `styles.css:1576`). It currently has no visual effect; either it's an intentional styling hook for later phases or dead weight.
**Fix:** If it's forward-looking (likely, given Phase 15/16 reuse), a short code comment next to the class in the template would save the next implementer a grep. If unintended, drop the modifier class.

### IN-02: No direct automated coverage for the empty-file notice or the type-changed header copy

**File:** `tests/unit/single-pane-layout.test.ts`, `tests/e2e/anchored-review.spec.ts`
**Issue:** `tests/unit/single-pane-layout.test.ts` covers `singlePaneSideFor`/`wasModeKind` as pure functions, and `anchored-review.spec.ts` covers the added/deleted single-pane commenting flow end to end, but nothing exercises `DiffWorkspace.vue`'s `isSinglePaneFileEmpty` → `InlineNotice` "Empty file (0 bytes)" branch (D-07), and nothing exercises the `Type changed · Head only (was symlink)` header copy (D-06, `ActiveFileToolbar.vue:46`) through a mounted component or browser. `13-VERIFICATION.md` already notes the empty-file gap as a known, accepted non-blocking item, so this is a reminder rather than a new finding.
**Fix:** A small Playwright fixture with a 0-byte added file, and one with a type-changed (symlink→file) fixture reaching the header, would close both gaps with the same harness already used by `anchored-review.spec.ts`/`pinned-session.spec.ts`.

---

_Reviewed: 2026-10-30T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
