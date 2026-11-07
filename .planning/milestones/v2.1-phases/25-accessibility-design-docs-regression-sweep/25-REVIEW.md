---
phase: 25-accessibility-design-docs-regression-sweep
reviewed: 2026-11-06T07:09:11Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - DESIGN.md
  - scripts/verify-prerequisites.mjs
  - src/web/App.vue
  - src/web/components/AttachedCompletionWaiting.vue
  - src/web/components/ChangedFilesDialog.vue
  - src/web/components/ExportSection.vue
  - src/web/components/FileRow.vue
  - src/web/components/FileTree.vue
  - src/web/components/PathDisplay.vue
  - src/web/components/ui/PathText.vue
  - src/web/components/workbench/CommentsTab.vue
  - src/web/components/workbench/StatusBar.vue
  - src/web/components/workbench/TitleBar.vue
  - tests/api/session.test.ts
  - tests/e2e/agent-ready-export-safety.spec.ts
  - tests/e2e/agent-ready-export.spec.ts
  - tests/e2e/file-tree.spec.ts
  - tests/e2e/finish-review-live-region.spec.ts
  - tests/e2e/live-region-announcements.spec.ts
  - tests/e2e/live-region-outcome-audit.spec.ts
  - tests/e2e/popover-keyboard-contract.spec.ts
  - tests/e2e/toolbar-roles.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/package/runtime-package-contract.test.ts
  - tests/unit/identity-pill.test.ts
  - tests/unit/monaco-diff-adapter.test.ts
  - tsconfig.test.json
  - tsconfig.web.test.json
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-11-06T07:09:11Z
**Depth:** standard
**Files Reviewed:** 27 (listed above; `tsconfig.test.json`/`tsconfig.web.test.json` counted once each though both are config, not source)
**Status:** issues_found

## Summary

Reviewed every file touched across Phase 25's nine plans plus its gap-closure cycle (base `7f6d248` → `e67bb3d`): new live-region `announce()` wiring in `App.vue` (tab selection, thread collapse/expand, restore counts, filter match count, finish-review validating/completed transitions, anchor-verification re-confirmation), the `AttachedCompletionWaiting.vue` extraction from `ExportSection.vue`, the `role="toolbar"` additions to `StatusBar.vue`/`TitleBar.vue`, `Space`-key activation on `CommentsTab.vue`'s `role="button"` rows, the `name-first` reorder in `PathText.vue`/`PathDisplay.vue`/`FileRow.vue` for list mode, the debounced filter-result emit in `FileTree.vue`, the `typescript`/`vue-tsc` dependency-alias bump in `scripts/verify-prerequisites.mjs` (matches `package.json`), the `CSS.escape()` hardening of the comment-anchor focus selector, and the `tsconfig.*.json` web/node test-split corrections.

Traced every new `announce()` call against its paired e2e assertion (`live-region-announcements.spec.ts`, `live-region-outcome-audit.spec.ts`, `finish-review-live-region.spec.ts`) and cross-checked removed `role="status"`/`aria-live` attributes in `ExportSection.vue` against the newly-added explicit `announce()` calls in `App.vue` — both are real, deliberate de-duplications of double-announcement (confirmed by `finish-review-live-region.spec.ts`'s assertion that `role`/`aria-live` are now `null` on the progress paragraph). Verified the `scripts/verify-prerequisites.mjs` npm-alias swap (`typescript` ↔ `@typescript/native`) against `package.json`/`package-lock.json` — consistent, not a typo. Verified the `tsconfig.*.json` file moves (`comment-thread.test.ts`, `identity-pill.test.ts`, `status-bar.test.ts`) against each file's actual `.vue` imports — correctly reclassified into the web/DOM tsconfig.

One real regression risk found: `FileTree.vue`'s new debounce timer for the filter-result announcement is never cleared on unmount, breaking an established project convention (`CopyButton.vue`, `SummarySection.vue`, `ViewOptionsMenu.vue`, `DiffWorkspace.vue`, `RenderedMarkdownView.vue` all clear their timers in `onBeforeUnmount`). The remaining findings are minor dead-code/consistency items, not functional bugs.

## Critical Issues

None found.

## Warnings

### WR-01: Filter-announce debounce timer not cleared on unmount

**File:** `src/web/components/FileTree.vue:56-59`
**Issue:** The new `watch(query, ...)` handler schedules `emit('filterResult', ...)` via `setTimeout(..., 400)` and stores the handle in `filterAnnounceTimer`, but the component has no `onBeforeUnmount`/`onUnmounted` hook to clear it. `FileTree.vue` is conditionally mounted (`v-if="files.length > 0"` in `ChangedFilesDialog.vue:53`), so if the component unmounts while a filter keystroke's 400ms timer is still pending, the callback still fires after unmount and calls `emit('filterResult', model.value.flatFileRows.length, props.files.length, value)`, which bubbles up to `App.vue`'s `handleFilterResult` and calls `announce()` for a dialog/tree that is no longer showing. Every other debounce/timer owner in this codebase (`CopyButton.vue:40`, `SummarySection.vue:135`, `ViewOptionsMenu.vue:122`, `DiffWorkspace.vue:475`, `RenderedMarkdownView.vue:284`) clears its timer `onBeforeUnmount`; this one does not, which is inconsistent with the established pattern and risks an announcement correlated with a closed/stale view.
**Fix:**
```ts
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
// ...
let filterAnnounceTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (value) => {
  if (filterAnnounceTimer !== undefined) clearTimeout(filterAnnounceTimer);
  filterAnnounceTimer = setTimeout(() => emit('filterResult', model.value.flatFileRows.length, props.files.length, value), 400);
});

onBeforeUnmount(() => {
  if (filterAnnounceTimer !== undefined) clearTimeout(filterAnnounceTimer);
});
```

**Resolution:** Fixed in commit `2c49a85` (`fix(25-review): clear filter-announce debounce timer on FileTree.vue unmount (WR-01)`) — added `onBeforeUnmount` import and cleanup hook in `FileTree.vue`; `npx vue-tsc --noEmit --project tsconfig.web.json` clean post-fix.

## Info

### IN-01: Unused template ref carried over from extraction

**File:** `src/web/components/AttachedCompletionWaiting.vue:24`
**Issue:** `const completionAction = ref<HTMLButtonElement>();` is declared and bound via `ref="completionAction"` on the "Finish review" button (line 65), but nothing in this component reads it — no `.focus()` call, no `defineExpose`. It's a leftover from the pre-extraction markup in `ExportSection.vue`, where the same ref name was shared across sibling `v-if`/`v-else` template branches, one of which (the "finishing" disabled button, still inline in `ExportSection.vue:143`) is read by a `watch` there. In the new standalone component the ref now does nothing.
**Fix:** Remove the unused `ref`/`ref="completionAction"` binding, or, if focus-on-show for the "Finish review" button was intended, add `defineExpose({ focus: () => completionAction.value?.focus() })` and wire a corresponding watcher in the parent.

### IN-02: Live-region and visible empty-state text use different quote glyphs

**File:** `src/web/App.vue:569`, `src/web/components/FileTree.vue:549`
**Issue:** The screen-reader announcement for a zero-match filter uses straight quotes — `` `No changed files match "${query}".` `` (`App.vue:569`) — while the visible empty-state paragraph for the same state uses typographic/curly quotes — `No changed files match "{{ query }}".` (`FileTree.vue:549`). Both are intentional and independently covered by tests (`live-region-announcements.spec.ts:377` expects the straight-quote form; `file-tree.spec.ts:599` expects the curly-quote form), so this is not a functional bug, but sighted and screen-reader users now hear/see slightly different wording for the identical state.
**Fix:** Use one quoting convention in both the announce string and the visible copy (prefer the curly-quote typography already used elsewhere in file-tree copy).

### IN-03: Stale "doesn't exist yet" comment left after the feature shipped

**File:** `tests/e2e/live-region-announcements.spec.ts:346-347`
**Issue:** The comment directly above the new filter-match-count test reads: "no `filterResult` emit exists on `FileTree.vue` today and no listener exists on `App.vue`'s file tree." That was true before this phase implemented `FileTree.vue`'s `filterResult` emit and `App.vue`'s `handleFilterResult` listener; it is now false and reads as a leftover planning note rather than a description of current behavior.
**Fix:** Update or delete the comment now that the gap it described is closed, e.g. replace with a short note on why the test uses the synchronous match-count badge instead of hardcoding the fixture's file count.

### IN-04: `AttachedCompletionWaiting` invocation duplicated across two sibling branches

**File:** `src/web/components/ExportSection.vue:283-298`, `src/web/components/ExportSection.vue:317-332`
**Issue:** The extraction removed the large duplicated inner markup (good), but the `<AttachedCompletionWaiting>` element itself — 8 bound props and 4 forwarded listeners — is still copy-pasted verbatim in both the `exportState.phase === 'exported'` branch and the default/else branch, identical except for the sibling content (`ExportReceipt` vs. `ExportReadinessSummary`).
**Fix:** Factor the two branches' shared `<template v-else>` tail into one `<AttachedCompletionWaiting v-else .../>` invocation placed after a single conditional for the receipt-vs-summary sibling, or hoist the common props into a computed object spread via `v-bind="attachedCompletionProps"` to avoid maintaining two copies of the same binding list.

---

_Reviewed: 2026-11-06T07:09:11Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
