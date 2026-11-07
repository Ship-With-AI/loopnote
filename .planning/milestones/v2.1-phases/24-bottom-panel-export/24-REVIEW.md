---
phase: 24-bottom-panel-export
reviewed: 2026-11-06T03:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - src/web/App.vue
  - src/web/components/ExportReadinessSummary.vue
  - src/web/components/ExportReceipt.vue
  - src/web/components/ExportSection.vue
  - src/web/components/FileRow.vue
  - src/web/components/SummarySection.vue
  - src/web/components/workbench/BottomPanel.vue
  - src/web/components/workbench/CommentsTab.vue
  - src/web/components/workbench/ExportTab.vue
  - src/web/components/workbench/StatusBar.vue
  - src/web/components/workbench/SummaryTab.vue
  - src/web/model/comments-tab-groups.ts
  - src/web/model/file-tree.ts
  - src/web/model/panel-state.ts
  - tests/e2e/agent-ready-export-safety.spec.ts
  - tests/e2e/comments-reveal-chain.spec.ts
  - tests/e2e/complete-review-draft.spec.ts
  - tests/e2e/review-notes-dialog.spec.ts
  - tests/e2e/standalone-review.spec.ts
  - tests/e2e/summary-autosave.spec.ts
  - tests/e2e/workbench-shell-smoke.spec.ts
  - tests/integration/export-receipt-ui.spec.ts
  - tests/integration/selector-drift-ui.spec.ts
  - tests/unit/comments-tab-groups.test.ts
  - tests/unit/file-tree.test.ts
  - tests/unit/panel-state.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 24: Code Review Report

**Reviewed:** 2026-11-06T03:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** clean

## Summary

Re-review (iteration 2) after commit `6884160` applied fixes for all 5 findings from
iteration 1. This pass re-read the 4 files the fix commit touched
(`src/web/App.vue`, `src/web/components/ExportSection.vue`,
`src/web/components/workbench/CommentsTab.vue`, and the newly added
`src/web/components/AttachedCompletionWaiting.vue`) line-by-line, confirmed each of the 5
original findings against the current code, and adversarially checked the fix diffs
themselves for new defects. `npm run typecheck:web` (vue-tsc) was also run as a read-only
check and reports no errors.

**Original findings — all 5 confirmed resolved:**

- **WR-01** (`App.vue:1129-1132`): The `s` shortcut branch now reads
  `if (!shellModalOpen.value && panelOpen.value && panelState.activeTab.value === 'summary') saveSummary();`
  — the missing `shellModalOpen` guard flagged in iteration 1 is present and matches the
  established `b`/`j` guard pattern immediately above it. Confirmed resolved.
- **WR-02** (`ExportSection.vue`): The duplicated ~35-line "Finish attached review /
  Waiting" block has been extracted into `src/web/components/AttachedCompletionWaiting.vue`
  and is referenced from both former call sites (`ExportSection.vue:288-302` and
  `ExportSection.vue:324-338`) with identical prop/event wiring. Diffed the new component's
  template against the two deleted blocks (git history) — content is byte-for-byte
  equivalent, no notices, buttons, or conditions were dropped or altered in the move.
  Confirmed resolved.
- **WR-03** (`CommentsTab.vue:69-77, 85-95`): Both `role="button"` elements (file-group
  header and comment row) now wire `@keydown.space.prevent` alongside the existing
  `@keydown.enter`, matching the fix suggestion exactly and restoring parity with the
  `FileTreeNavigationKey` convention. Confirmed resolved.
- **IN-01** (`App.vue:1083`): `commentId` is now passed through `CSS.escape()` before
  interpolation into the `querySelector` attribute selector:
  `` document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"] .thread-header`) ``.
  Confirmed resolved.
- **IN-02** (`App.vue:1077-1078`): A one-line rationale comment now precedes the
  triple-nested `nextTick` call ("Three nested ticks: file switch … -> diff remount ->
  thread expand, each needs its own tick before the comment header element exists.").
  Confirmed resolved.

**New finding from the fix itself:** the WR-02 extraction removed every `<PathText>`
usage from `ExportSection.vue`'s own template (both copies of the moved block were the
only call sites) but left the now-unused `import PathText from './ui/PathText.vue';` in
place — see IN-03 below. This is a dead-import code-quality issue only; it does not affect
behavior and `vue-tsc --noEmit` does not flag it (the project's `tsconfig.web.json` does
not set `noUnusedLocals`).

No other regressions were found in the 4 touched files: prop/emit contracts between
`ExportSection.vue` and `AttachedCompletionWaiting.vue` type-check and match 1:1; the two
`<AttachedCompletionWaiting>` instances and their hardcoded internal element ids
(`finish-attached-review-heading`, `inline-composer-finish-block-heading`) remain
mutually exclusive via the surrounding `v-if`/`v-else-if`/`v-else` chain exactly as the
pre-fix duplicated blocks were, so there is no duplicate-DOM-id risk; the CSS classes used
by the extracted component (`.attached-completion`, `.inline-notice`, `.ui-button`, etc.)
are defined in the global `src/web/styles.css`, not in a component-`<style scoped>` block,
so the extraction does not break styling via Vue's scoped-CSS descendant-selector
boundary; and `ExportSection.vue`'s own `completionAction` ref/watch pairing (for the
`finishing` lifecycle's spinner button) is unaffected since that button was never part of
the duplicated/extracted block.

## Iteration 3 — IN-03 fixed

Commit `ce44d5a` removed the dead `import PathText from './ui/PathText.vue';` line
flagged below as IN-03. Re-confirmed via `grep -n "PathText" src/web/components/ExportSection.vue`
(no matches) and `npx vue-tsc --noEmit --project tsconfig.web.json` (clean). All findings
from iterations 1 and 2 are now resolved — 0 Critical, 0 Warning, 0 Info outstanding.

## Info

### IN-03: Unused `PathText` import left behind in `ExportSection.vue` after WR-02 extraction

**File:** `src/web/components/ExportSection.vue:15`
**Issue:** The WR-02 fix moved every template usage of `<PathText>` into the new
`AttachedCompletionWaiting.vue` component (confirmed via `grep -n "PathText"
src/web/components/ExportSection.vue`, which now only matches the import line). The
import `import PathText from './ui/PathText.vue';` is dead code in this file. It does not
break the build or typecheck (`noUnusedLocals` is not enabled in `tsconfig.web.json`), but
it is a leftover that will mislead future readers into thinking `ExportSection.vue` still
renders paths directly.
**Fix:** Remove the unused import:
```diff
-import PathText from './ui/PathText.vue';
 import GitignoreStatus from './GitignoreStatus.vue';
```

_Reviewed: 2026-11-06T03:00:00Z (iteration 3)_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
