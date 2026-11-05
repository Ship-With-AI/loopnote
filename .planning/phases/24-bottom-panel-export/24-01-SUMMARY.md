---
phase: 24-bottom-panel-export
plan: 01
subsystem: ui
tags: [vue3, typescript, vitest, panel-state, file-tree]

# Dependency graph
requires:
  - phase: 22-workbench-shell-status-bar
    provides: "panel-state.ts (PersistedPanelState/createPanelState) and status-bar open-panel intents this plan's activeTab will be driven by"
  - phase: 23-inline-comment-threads
    provides: "thread reveal API / comment-groups.ts precedent this plan mirrors for the file-tree.ts extraction pattern"
provides:
  - "PanelTab type ('comments' | 'summary' | 'export') and session-only PanelState.activeTab/setActiveTab, excluded from PersistedPanelState/localStorage"
  - "file-tree.ts exported fileTypeMarkFor(displayPath) — shared, verbatim-extracted file-type mark lookup previously private to FileRow.vue"
affects: [24-07-comments-tab, 24-08-summary-tab, 24-09-export-tab-tablist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-only reactive fields live alongside persisted ones in createPanelState()'s returned object but are never read from/written to the persisted JSON shape (mirrors parsePanelState's per-field defaulting discipline in reverse: a field simply never participates)."
    - "Pure per-row derived-value lookup tables move from component-local consts into the shared model module as a function taking the resolved primitive (displayPath) rather than a component-shaped type, keeping the model module free of component-prop dependencies (same shape as Phase 23's comment-groups.ts orderPathIdentity/orderText)."

key-files:
  created: []
  modified:
    - src/web/model/panel-state.ts
    - src/web/model/file-tree.ts
    - src/web/components/FileRow.vue
    - tests/unit/panel-state.test.ts
    - tests/unit/file-tree.test.ts

key-decisions:
  - "fileTypeMarkFor placed at the end of file-tree.ts (after createFileTreeModel) rather than interleaved with the tree-building helpers, since it has no dependency on FileTreeNode/FileTreeModel — kept it visually separate as a standalone pure utility, consistent with how highlightMatches already sits apart from the tree-flattening functions."

patterns-established:
  - "Pattern: session-only PanelState fields (activeTab) are shallowRefs constructed independently of parsePanelState's initial object and are deliberately omitted from persist()'s PersistedPanelState literal — future session-only panel fields should follow the same omission, not an allow-list toggle."

requirements-completed: [PANEL-01, PANEL-02, PANEL-03]

# Metrics
duration: ~25min
completed: 2026-11-05
status: complete
---

# Phase 24 Plan 01: Panel-state activeTab + file-tree fileTypeMark Summary

**Session-only `activeTab`/`setActiveTab` added to `panel-state.ts` (never persisted), and `FileRow.vue`'s private file-type-mark lookup extracted verbatim into `file-tree.ts`'s new `fileTypeMarkFor()` export for reuse by the upcoming Comments tab.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 5 (2 source modules, 1 component, 2 test files)

## Accomplishments
- `createPanelState()` now exposes `activeTab: ShallowRef<PanelTab>` (default `'comments'`) and `setActiveTab(tab)`, with a unit test proving `persist()`'s serialized JSON never contains an `activeTab` key even after `setActiveTab()` is called.
- `file-tree.ts` exports `fileTypeMarkFor(displayPath)` — the exact extension→`{text, tone}` table and fallback `FileRow.vue` used privately — and `FileRow.vue` now imports it instead of declaring its own copy; the rendered changed-files tree is byte-identical (template untouched).

## Task Commits

1. **Task 1: panel-state.ts session-only activeTab** - `fc09a09` (feat)
2. **Task 2: file-tree.ts fileTypeMarkFor extraction + FileRow.vue wiring** - `55fd67d` (refactor)

**Plan metadata:** this file's commit (docs)

## Files Created/Modified
- `src/web/model/panel-state.ts` - added `PanelTab` type, `ACTIVE_TAB_DEFAULT`, `PanelState.activeTab`/`setActiveTab`, wired into `createPanelState()`; `PersistedPanelState`/`parsePanelState()`/`persist()` untouched (no `activeTab` field)
- `src/web/model/file-tree.ts` - added `FILE_TYPE_MARKS`/`FALLBACK_FILE_TYPE_MARK` consts and exported `fileTypeMarkFor(displayPath)` at end of file
- `src/web/components/FileRow.vue` - removed local `FILE_TYPE_MARKS`/`FALLBACK_FILE_TYPE_MARK`/inline lookup logic; imports `fileTypeMarkFor` from `../model/file-tree.js` and calls it with the resolved display path
- `tests/unit/panel-state.test.ts` - added `createPanelState` test: `activeTab` defaults to `'comments'`, `setActiveTab` updates it, and `persist()`'s stored JSON has no `activeTab` key (both `toHaveProperty`-style and raw-string assertions)
- `tests/unit/file-tree.test.ts` - added `describe('fileTypeMarkFor', ...)` with known-extension, unknown-extension, no-extension, and `undefined` cases

## Decisions Made
- Placed `fileTypeMarkFor` and its backing tables at the end of `file-tree.ts` (after `createFileTreeModel`) since the function has no dependency on the tree-building types above it — kept as a standalone pure-utility section, same precedent as `highlightMatches` sitting apart from the flattening helpers.

## Deviations from Plan

None - plan executed exactly as written. (The plan's pseudocode for `fileTypeMarkFor` used `extension in FILE_TYPE_MARKS`; implemented as `Object.hasOwn(FILE_TYPE_MARKS, extension)` to match `FileRow.vue`'s pre-existing check exactly, since the plan's own `done` criterion requires "same lookup table, same fallback" byte-for-byte behavior — not a deviation, a literal-copy fidelity choice.)

## Issues Encountered
- Full unit suite (`npx vitest run --no-file-parallelism tests/unit`) showed one transient failure on first run: `tests/unit/token-contract.test.ts > token contract > reloads the virtual token module after styles.css changes in a Vite dev server` timed out at 10000ms. This test is unrelated to this plan's files (Vite dev-server CSS-token reload, not panel-state/file-tree/FileRow). Re-running the full suite immediately after passed 465/465 with no failures, and running the test in isolation also passed — confirmed as a pre-existing timing flake under load, not a regression introduced by this plan. Not owned/fixed here.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `PanelTab`/`PanelState.activeTab`/`setActiveTab` are ready for Plan 24-09 (Export tab / tablist wiring) and Plan 24-08 (Summary tab) to drive tab switching from the status bar and the panel's own `role="tablist"`.
- `fileTypeMarkFor` is ready for Plan 24-07's `CommentsTab.vue` to reuse the identical file-type mark/tone when grouping comments by file.
- Per this plan's `<verification>` section, the packaged-binary Chromium/full-UI check for these two additions is deferred to the plans that first make them user-observable (24-08/24-09 for `activeTab`, 24-07 for `fileTypeMarkFor`) — this plan's own output is not yet visible in any UI (FileRow.vue's render is byte-identical), so no new Chromium check was fabricated here. The one directly-relevant Playwright spec identified by grep (`tests/e2e/file-tree.spec.ts`, which imports `PANEL_STATE_STORAGE_KEY` from the modified `panel-state.ts` and exercises the `FileRow.vue`-rendered tree) was run and passed (4/4).

## Gate Results
- `npm run typecheck:web` — 0 errors.
- `npm run verify:semantic-css` — passed ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."), no-op as expected (no CSS touched).
- `npx vitest run --no-file-parallelism tests/unit` — 465/465 passed (45/45 files) on confirmed re-run; see Issues Encountered for the one transient unrelated flake on the first run.
- `npx playwright test tests/e2e/file-tree.spec.ts` (only spec grep-matched to the modified `panel-state.ts`/`FileRow.vue`) — 4/4 passed.

---
*Phase: 24-bottom-panel-export*
*Completed: 2026-11-05*

## Self-Check: PASSED

Re-verified for real, after all commits:
- `panel-state.ts`'s `createPanelState()` exposes `activeTab: ShallowRef<PanelTab>` defaulted `'comments'` and `setActiveTab(tab)`; `activeTab` is never written to or read from `PersistedPanelState`/`loopnote.workbench.v1` — confirmed by re-reading `PersistedPanelState` (lines 59-66, no `activeTab` field), `parsePanelState()` (no reference to `activeTab`), and `persist()`'s literal (lines 173-180, no `activeTab` key); the added test `exposes activeTab defaulted to comments, session-only and never persisted` asserts both `toHaveProperty`-negative and raw-string-negative on the persisted JSON, and passes (`npx vitest run --no-file-parallelism tests/unit/panel-state.test.ts` → 18/18 passed).
- `file-tree.ts` exports `fileTypeMarkFor(displayPath)` with the exact extension-to-`{text,tone}` lookup table `FileRow.vue` used privately (same keys, same tone tokens, same fallback); `FileRow.vue` no longer declares `FILE_TYPE_MARKS`/`FALLBACK_FILE_TYPE_MARK` and instead imports and calls `fileTypeMarkFor` — confirmed by re-reading both files in full; the rendered `<span class="ft">` template line is byte-identical to before. `npx vitest run --no-file-parallelism tests/unit/file-tree.test.ts` → 40/40 passed (including the 4 new `fileTypeMarkFor` cases).
- Gates: `npm run typecheck:web` 0 errors; `npm run verify:semantic-css` passed; `npx vitest run --no-file-parallelism tests/unit` 465/465 passed; `npx playwright test tests/e2e/file-tree.spec.ts` 4/4 passed.
