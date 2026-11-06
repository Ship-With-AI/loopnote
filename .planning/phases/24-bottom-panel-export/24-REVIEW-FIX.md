---
phase: 24-bottom-panel-export
fixed_at: 2026-11-06T03:30:00Z
review_path: .planning/phases/24-bottom-panel-export/24-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-11-06T01:14:34Z
**Source review:** .planning/phases/24-bottom-panel-export/24-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: Cmd/Ctrl+S summary-save shortcut bypasses the "inert behind a modal" invariant

**Files modified:** `src/web/App.vue`
**Commit:** `6884160`
**Applied fix:** Added `!shellModalOpen.value` to the `s` chrome-shortcut condition in `handleKeydown` (line ~1131), matching the existing guard pattern used by the adjacent `b`/`j` shortcut block two lines above.

### WR-02: ~35-line "Finish attached review / Waiting" block duplicated verbatim

**Files modified:** `src/web/components/ExportSection.vue`, `src/web/components/AttachedCompletionWaiting.vue` (new)
**Commit:** `6884160`
**Applied fix:** Extracted the duplicated attached-completion "waiting" block (header, `No feedback added` notice, `Unsaved text must be reviewed` notice, inline-composer notice, pending/conflict notice, `Finish review` button) into a new `AttachedCompletionWaiting.vue` child component following the repo's `<script setup lang="ts">` + typed-props/typed-emits convention (same pattern as `DriftExportAcknowledgement.vue`/`ExportProgress.vue`). Both former `<template v-else>` copies in `ExportSection.vue` (inside the `exported`-with-receipt branch and the final catch-all branch) now render `<AttachedCompletionWaiting v-else .../>` directly as a single-root component instead of a wrapping `<template>`, eliminating the nested-template indirection as well as the duplication. All original computed/prop reads (`attachedNoFeedback`, `hasUnsavedText`, `unsavedInlineComposerFile`, `attachedBlockedByUnsavedText`, `attachedBlockedByPending`, `attachedBlockedByConflict`, `conflict`, `attachedReady`) are now passed as props; the original emits (`reviewUnsavedText`, `reviewInlineComposer`, `reloadLatest`, `finishReview`) are re-emitted from the child and forwarded to the parent's existing `emit(...)` calls. The `finishAttachedReview()` ready-check and the `ref="completionAction"` focus target moved into the child component unchanged.

### WR-03: `CommentsTab.vue` custom `role="button"` rows only handle Enter, not Space

**Files modified:** `src/web/components/workbench/CommentsTab.vue`
**Commit:** `6884160`
**Applied fix:** Added `@keydown.space.prevent` handlers mirroring the existing `@keydown.enter` handlers on both the file-group disclosure `<div role="button">` header (calls `toggleFileGroup(group.leaf.fileId)`) and the comment-row `<li role="button">` (calls `emit('reveal', ...)`), matching the repo's own `FileTreeNavigationKey` precedent of treating Space as an activation key.

### IN-01: Comment id interpolated unescaped into a CSS attribute selector

**Files modified:** `src/web/App.vue`
**Commit:** `6884160`
**Applied fix:** Wrapped `commentId` in `CSS.escape(...)` before interpolating into the `querySelector` attribute-selector string in `revealCommentFromPanel`, matching the existing identical pattern already used in `src/web/components/DiffWorkspace.vue:349`.

### IN-02: Triple-nested `nextTick` with no rationale comment

**Files modified:** `src/web/App.vue`
**Commit:** `6884160`
**Applied fix:** Added a two-line comment directly above the triple-nested `nextTick` chain in `revealCommentFromPanel` explaining the three stages each tick accounts for: file switch (if cross-file) -> diff remount -> thread expand, each needing its own tick before the comment header element exists in the DOM.

## Iteration 2 — IN-03 fixed

### IN-03: Unused `PathText` import left behind in `ExportSection.vue` after WR-02 extraction

**Files modified:** `src/web/components/ExportSection.vue`
**Commit:** `ce44d5a`
**Applied fix:** Removed the now-dead `import PathText from './ui/PathText.vue';` line left behind when the WR-02 extraction moved every `<PathText>` template usage into `AttachedCompletionWaiting.vue`. Verified via `grep -n "PathText" src/web/components/ExportSection.vue` (no matches) and `npx vue-tsc --noEmit --project tsconfig.web.json` (clean).

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-11-06T03:30:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
