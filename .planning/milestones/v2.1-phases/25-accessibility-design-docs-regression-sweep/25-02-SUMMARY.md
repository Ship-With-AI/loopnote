---
phase: 25-accessibility-design-docs-regression-sweep
plan: 02
subsystem: ui
tags: [vue, playwright, aria, accessibility, e2e, live-region]

# Dependency graph
requires:
  - phase: 25-accessibility-design-docs-regression-sweep
    provides: "25-01's toolbar-roles.spec.ts packaged-binary pack/spawn scaffold and openRuntimeSession helper, reused verbatim by this plan's two new specs"
provides:
  - "tests/e2e/live-region-announcements.spec.ts — packaged-binary proof of exact announced text + exact data-announcement-version +1 delta for all 7 outcomes"
  - "tests/e2e/popover-keyboard-contract.spec.ts — packaged-binary proof IdentityPopover/ViewOptionsMenu/SupportDialog close on Escape and return focus to trigger"
  - "App.vue: selectPanelTab, announce() in toggleCommentCollapse/toggleThreadsCollapsed/toggleTreeViewMode/setFileMode, handleFilterResult, and the Undo count-context fix"
  - "FileTree.vue: debounced (400ms) filterResult emit carrying matched/total/query"
  - "ChangedFilesDialog.vue: forwards the new filterResult emit from its wrapped FileTree to App.vue"
affects: [25-03, 25-05, 25-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-region announcements stay single-owner: every new call site routes through App.vue's existing announce()/liveMessage, never a second aria-live region"
    - "data-announcement-version exact +1 delta assertion (stronger than the pre-existing .not.toBe(firstVersion) form in tests/integration/anchored-workspace.spec.ts)"

key-files:
  created: [tests/e2e/live-region-announcements.spec.ts, tests/e2e/popover-keyboard-contract.spec.ts]
  modified: [src/web/App.vue, src/web/components/FileTree.vue, src/web/components/ChangedFilesDialog.vue]

key-decisions:
  - "FileTree.vue is never used directly in App.vue's template — it is always wrapped by ChangedFilesDialog.vue, which teleports it to the sidebar (wide layout) or the narrow-layout dialog. The plan's text assumed a direct <FileTree> tag in App.vue; the new filterResult emit was instead added to FileTree.vue and forwarded one layer up through ChangedFilesDialog.vue's own defineEmits, then consumed by App.vue's @filter-result listener on <ChangedFilesDialog>."
  - "BottomPanel's tab-switch listener already existed as @update:active-tab=\"panelState.setActiveTab\" (direct, no announce) rather than being fully absent as the plan's RED behavior text assumed — it was repointed to the new selectPanelTab wrapper, which still calls panelState.setActiveTab then announces."
  - "The filter-match-count test reads FileTree.vue's own instant \"N of M\" badge from the DOM to build the expected announced sentence, rather than hardcoding the fixture's total file count — keeps the test robust to fixture content changes."
  - "The Markdown-toggle test waits for the file's initial async \"Loaded ...\" announcement to settle (via an explicit toHaveText check) before asserting the mode-toggle announcements. Runtime measurement (required by 25-CONTEXT.md/25-UI-SPEC.md's Out-of-scope-contract note) showed Monaco's diff-ready event can still be in flight once the heading first appears, which would otherwise land a stray \"Loaded docs/preview.md.\" inside the mode-toggle assertion's version-delta window. This is a test-timing fix, not a source-code defect — confirmed by tracing the live region with a MutationObserver before settling on the fix."

requirements-completed: [A11Y-02]

# Metrics
duration: ~90min
completed: 2026-11-06
status: complete
---

# Phase 25 Plan 02: Live-Region Announcements & Popover Keyboard Contract Summary

**Wired 7 new/fixed `announce()` call sites (panel tab switch, thread collapse/expand, collapse-all, file-tree view-mode toggle, debounced filter-match-count, Markdown source/rendered toggle, and the Undo count-context fix) plus a new debounced `filterResult` emit on `FileTree.vue`, and added packaged-binary e2e proof that IdentityPopover/ViewOptionsMenu/SupportDialog already meet the Esc-closes/focus-returns-to-trigger keyboard contract.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-11-06
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- New `tests/e2e/live-region-announcements.spec.ts` proves, against the real packaged binary, that all 7 announcement outcomes fire exactly once with the exact locked copy and an exact `data-announcement-version` +1 delta.
- `App.vue` now announces: panel tab switch (`selectPanelTab`), single-thread collapse/expand, collapse-all/expand-all, file-tree view-mode toggle, file-tree filter match count (new `handleFilterResult`), and Markdown source/rendered toggle — plus the Undo-restore announcement now carries `{open} open, {resolved} resolved.` count context matching its resolve/reopen/delete siblings.
- `FileTree.vue` gained a 400ms-debounced `filterResult` emit (matched/total/query) without touching its existing instant visual recompute (the "N of M" badge and empty-state paragraph); `ChangedFilesDialog.vue` forwards the emit up to `App.vue`.
- New `tests/e2e/popover-keyboard-contract.spec.ts` proves (without changing) that the identity popover, view-options menu, and support dialog all close on Escape and return focus to their trigger — closing the previously-untested `SupportDialog.vue` row in `25-UI-SPEC.md`'s keyboard contract table.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing live-region delta/text spec for all 7 announcement outcomes** - `82b4ff8` (test)
2. **Task 2 (GREEN): Wire the 7 announce() call sites and the new FileTree filterResult emit** - `e96e1f9` (feat)
3. **Task 3: Prove IdentityPopover, ViewOptionsMenu, and SupportDialog's existing Esc/focus-return contract** - `aa9052d` (test)

## Files Created/Modified
- `tests/e2e/live-region-announcements.spec.ts` - New packaged-binary spec proving all 7 announcement outcomes
- `tests/e2e/popover-keyboard-contract.spec.ts` - New packaged-binary spec proving the identity popover/view-options menu/support dialog keyboard contract
- `src/web/App.vue` - `selectPanelTab`, `handleFilterResult`, and 5 new/fixed `announce()` calls
- `src/web/components/FileTree.vue` - New debounced `filterResult` emit
- `src/web/components/ChangedFilesDialog.vue` - Forwards the new `filterResult` emit from its wrapped `FileTree` to `App.vue`

## Decisions Made
See `key-decisions` in frontmatter: the `<FileTree>`/`<ChangedFilesDialog>` wrapping layer required forwarding the new emit through an extra component; the pre-existing (unannounced) `@update:active-tab` listener was repointed rather than added from scratch; the filter-match-count test reads the live DOM badge instead of hardcoding file counts; the Markdown-toggle test needed a settle-wait for the file's initial load announcement, discovered only by runtime (Chromium) measurement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Blocking/component-layering] `filterResult` emit needed an extra forwarding layer through `ChangedFilesDialog.vue`**
- **Found during:** Task 2
- **Issue:** The plan's action text assumed App.vue's template has a direct `<FileTree>` tag to attach `@filter-result` to (`App.vue:1730-1741` per the plan's line references). The actual template only ever renders `<ChangedFilesDialog>`, which internally wraps and teleports `<FileTree>` — there is no direct `<FileTree>` usage in `App.vue` at all.
- **Fix:** Added `'filter-result': [matched: number, total: number, query: string]` to `ChangedFilesDialog.vue`'s `defineEmits` and a forwarding listener on its internal `<FileTree>` tag (`@filter-result="(matched, total, query) => emit('filter-result', matched, total, query)"`); `App.vue`'s `@filter-result="handleFilterResult"` listener attaches to `<ChangedFilesDialog>` instead.
- **Files modified:** `src/web/components/ChangedFilesDialog.vue`, `src/web/App.vue`
- **Verification:** `tests/e2e/live-region-announcements.spec.ts`'s filter-match-count test passes end to end.
- **Committed in:** `e96e1f9` (Task 2 commit)

**2. [Rule 1 - Test-timing bug, test-only] Markdown-toggle test raced the file's initial async load announcement**
- **Found during:** Task 2's GREEN verification run
- **Issue:** The RED/GREEN cycle's Markdown-toggle test selected `docs/preview.md`, confirmed the heading was visible, then immediately clicked the mode-toggle button. A MutationObserver trace of the live region showed Monaco's `diff-ready` event (and its pre-existing "Loaded docs/preview.md." announcement) can still be in flight at that point, landing inside the mode-toggle assertion's version-delta window and producing a `+2` delta instead of `+1`. This is a pre-existing app behavior (the diff-ready → "Loaded ..." announcement path was not touched by this plan) exposed only by runtime measurement, exactly the kind of finding `25-CONTEXT.md`'s Out-of-scope-contract section anticipated.
- **Fix:** The test now waits for `liveRegion(page)` to show `'Loaded docs/preview.md.'` before starting the mode-toggle assertions — a test-only fix, no source change.
- **Files modified:** `tests/e2e/live-region-announcements.spec.ts`
- **Verification:** Ran the full spec twice after the fix; all 7 tests pass both times (not flaky).
- **Committed in:** `e96e1f9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/component-layering, 1 test-timing bug found via runtime measurement).
**Impact on plan:** Both were necessary to make the plan's own locked outcomes achievable/provable; neither changed the plan's scope or the locked announcement copy.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Gate results (full repo, not scoped to this plan's files):**
- `npm run typecheck:web` — 0 errors.
- `npm run verify:semantic-css` — passed ("Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass.").
- `npx vitest run --no-file-parallelism tests/unit` — 46 test files passed, 478 tests passed, 0 failed.
- `npx playwright test tests/e2e/live-region-announcements.spec.ts tests/e2e/popover-keyboard-contract.spec.ts` — 10 passed (7 + 3), 0 failed. Re-ran each spec file an extra time individually to confirm no flakiness (all green both times).

All gates this plan is responsible for are green. Ready for 25-03, 25-05, and 25-04 to proceed.

## Self-Check: PASSED

- `tests/e2e/live-region-announcements.spec.ts` — FOUND
- `tests/e2e/popover-keyboard-contract.spec.ts` — FOUND
- Commit `82b4ff8` — FOUND
- Commit `e96e1f9` — FOUND
- Commit `aa9052d` — FOUND

---
*Phase: 25-accessibility-design-docs-regression-sweep*
*Completed: 2026-11-06*
