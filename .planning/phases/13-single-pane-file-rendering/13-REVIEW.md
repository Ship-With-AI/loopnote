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
  warning: 0
  info: 5
  total: 5
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Re-review of the single-pane file rendering surface after fix commits `1b8d174` (WR-01) and `59f2381` (WR-02). Both previously-filed warnings are confirmed **resolved**, not merely relocated:

- **WR-01** (`DiffWorkspace.vue` / `diff-adapter.ts`): the `editorKind` watcher now calls `unmountZone()` before `adapter?.dispose()` (`DiffWorkspace.vue:311-313`), matching the content watcher's ordering, so the `CommentComposer`/accepted-comment Vue tree is torn down with `render(null, zoneRoot)` while its host DOM node is still owned by the live adapter. Separately, `PublicMonacoDiffAdapter.dispose()` now sets `disposed = true` and invokes `this.pendingSetFileReady?.()` (`diff-adapter.ts:363-369`), which disposes the one-off `onDidUpdateDiff` listener and resolves the `ready` promise created in `setFile()`. `setFile()` itself now awaits that promise and immediately bails (`if (this.disposed) { return; }`, `diff-adapter.ts:233-236`) without touching the already-disposed `diffEditor`/models. Traced the full call path (`loadContent()` → `adapter.setFile()` → `await ready` → dispose-triggered resolve → early return → `loadVersion` guard discards the stale continuation) and found no remaining hang, no double-resolve risk (`resolveReady()` is idempotent and the listener is disposed before any second fire could occur), and no post-dispose interaction with torn-down Monaco state.
- **WR-02** (`StatusBadge.vue` / `single-pane-layout.ts`): `StatusBadge.vue` now imports and calls `isSinglePaneStatusKind()` (`StatusBadge.vue:5,31`) instead of re-implementing the `added`/`deleted`/`type-changed` check. The new export (`single-pane-layout.ts:36-38`) is a one-line `kind in singlePaneStatusSides` lookup against the same `singlePaneStatusSides` table `singlePaneSideFor` already uses, so the two can no longer drift.

A fresh adversarial pass across the full file list (including the untouched `api.ts`, `capabilities.ts`, `patch-snapshot.ts`, `App.vue`, `ActiveFileToolbar.vue`, `FileRow.vue`, `ReviewToolbar.vue`, and test files) found no new Critical or Warning issues. `App.vue` still fully unmounts/remounts `DiffWorkspace` on every file switch (`selectedContent.value = undefined` at `App.vue:304`/`App.vue:780` plus the `v-else-if="selectedContent !== undefined"` gate at `App.vue:1187`), so the `editorKind`-watcher race the WR-01 fix guards against remains latent in the current app, exactly as before — the fix is correctly defensive for the reusable-component path Phases 14-16 are expected to exercise. No hardcoded secrets, dangerous functions, debug artifacts, or empty catch blocks were found in any reviewed file. Five Info-level items remain or were newly observed; none block shipping.

## Info

### IN-01: `diff-workspace--single-pane` CSS class still has no matching rule

**File:** `src/web/components/DiffWorkspace.vue:361` (vs. `src/web/styles.css`)
**Issue:** Carried forward from the prior review — unchanged by the fix commits. The single-pane `<section>` root still carries both `diff-workspace` and `diff-workspace--single-pane` classes, but `styles.css` defines no `.diff-workspace--single-pane` rule (only `.diff-workspace__side-labels--single-pane` at `styles.css:1576`). Confirmed still true against current `styles.css`.
**Fix:** If forward-looking for Phase 15/16 reuse, add a short code comment next to the class; otherwise drop the unused modifier.

### IN-02: Empty-file notice and type-changed header copy still lack direct automated coverage

**File:** `tests/unit/single-pane-layout.test.ts`, `tests/e2e/anchored-review.spec.ts`
**Issue:** Carried forward from the prior review — unchanged by the fix commits. `single-pane-layout.test.ts` still only covers `singlePaneSideFor`/`wasModeKind`; `anchored-review.spec.ts:453` asserts the layout-label text is *absent* in one scenario but nothing exercises `DiffWorkspace.vue`'s `isSinglePaneFileEmpty` → `InlineNotice` "Empty file (0 bytes)" branch, or renders the `Type changed · Head only (was symlink)` copy (`ActiveFileToolbar.vue:46`). `13-VERIFICATION.md` already records this as an accepted, non-blocking gap.
**Fix:** Add a 0-byte added-file fixture and a type-changed (symlink→file) fixture to the existing Playwright harness.

### IN-03: WR-01's dispose/in-flight-`setFile` race has no regression test

**File:** `src/web/monaco/diff-adapter.ts:222-236,363-369`, `tests/unit/monaco-diff-adapter.test.ts`
**Issue:** The fix commit `1b8d174` changed only `DiffWorkspace.vue` and `diff-adapter.ts` — no test was added or updated. `monaco-diff-adapter.test.ts` has no case that calls `dispose()` while a `setFile()` promise is still pending on the mocked `onDidUpdateDiff` listener, so nothing guards against a future edit silently reintroducing the hang (e.g. someone later reordering the `pendingSetFileReady?.()` call after `this.diffEditor.dispose()`, or dropping the `this.disposed` bail-out check).
**Fix:** Add a unit test that calls `adapter.setFile(file)` without firing the mocked `onDidUpdateDiff` callback, then calls `adapter.dispose()`, and asserts the `setFile()` promise settles (doesn't hang) and no post-dispose Monaco API calls occur.

### IN-04: WR-02's shared predicate has no direct test, and `StatusBadge.vue` has zero test coverage anywhere

**File:** `src/web/model/single-pane-layout.ts:36-38`, `src/web/components/StatusBadge.vue`
**Issue:** `grep` across `tests/` for `StatusBadge` or `isSinglePaneStatusKind` returns no matches. The new exported predicate — whose entire purpose (per its own doc comment) is to prevent the accessibility label from drifting from the routing table — is untested, and so is the component that consumes it. The fix closes the *duplication* risk but not the *regression* risk: a future edit to `singlePaneStatusSides` could still silently change the "single pane" announcement without any test catching it.
**Fix:** Add a `single-pane-layout.test.ts` case for `isSinglePaneStatusKind` mirroring the existing `singlePaneSideFor` cases, and a minimal `StatusBadge.vue` component test (or Playwright assertion) that checks the visually-hidden label includes ", single pane" for `added`/`deleted`/`type-changed` and excludes it for `modified`/`renamed`/`copied`/`unsupported`.

### IN-05: `Promise.withResolvers()` is now used in browser-bundled code for the first time, with no explicit minimum-browser target

**File:** `src/web/monaco/diff-adapter.ts:222`
**Issue:** `Promise.withResolvers` (Baseline ~2024; Chrome 119+, Safari 17.4+, Firefox 121+) is already used elsewhere in the codebase (`src/server/attached-completion.ts`, `src/cli/run.ts`, `src/git/candidates.ts`), but those are Node-targeted (`engines.node >= 24` in `package.json` covers them). This is its first use inside `src/web/`, which ships to end-user browsers via Vite (`vite.config.ts` sets no explicit `build.target`, so Vite's default `"modules"` baseline applies — it transpiles syntax but does not polyfill missing runtime APIs). On a browser without native `Promise.withResolvers`, the `editorKind` watcher's `setFile()` call would throw a `TypeError` at `diff-adapter.ts:222` instead of degrading gracefully.
**Fix:** If the project's supported-browser baseline already excludes pre-2024 browsers (plausible for a local developer review tool), this is fine as-is — consider recording that baseline once (e.g. a `browserslist` field or a comment) so future contributors don't need to re-derive it. Otherwise, replace with the manual `new Promise<void>((resolve) => { ... })` + externally-captured `resolve` pattern the code used before `1b8d174`.

---

_Reviewed: 2026-10-30T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
