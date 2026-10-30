---
phase: 13-single-pane-file-rendering
plan: 01
subsystem: ui
tags: [monaco, vue3, typescript, vitest, editor-adapter]

# Dependency graph
requires: []
provides:
  - "`PublicMonacoSinglePaneAdapter` class in `src/web/monaco/diff-adapter.ts` — a plain `monaco.editor.create()` pane for one fixed `DiffSide`, with no diff-only construction options and no counterpart editor/model/spacer zone anywhere in its implementation"
  - "`createMonacoSinglePaneAdapter(host, languageForPath, onChange, side): MonacoDiffAdapter` exported factory, structurally interchangeable with `createMonacoDiffAdapter`"
  - "Unpaired comment-anchor and view-zone lifecycle: one `IViewZone` per activation, selection decorations, cursor/mouse affordance capture, and `cumpa.add-${side}-comment` Alt+Enter keybinding, collapsed to a single fixed side"
affects: ["13-02", "13-03"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pane Monaco adapter mirrors the diff adapter's constructor/setFile/dispose shape one editor at a time (no `editorFor`/`modelFor` side-dispatch — direct `this.editor`/`this.model` field reads)"
    - "Per-test-instance Monaco mock factory (`mocks.createEditor`) replacing the module's two fixed singleton mocks, so multiple independently-constructed adapter instances can be asserted on in the same test file"

key-files:
  created: []
  modified:
    - src/web/monaco/diff-adapter.ts
    - tests/unit/monaco-diff-adapter.test.ts

key-decisions:
  - "Implemented the full `MonacoDiffAdapter` interface surface (including `goToChange` as an intentional no-op and `getDiagnostics` with `contextMode: 'all-revealed'`) in a single GREEN pass rather than splitting Task 1/Task 2 GREEN commits, because the plan's frontmatter declares `type: tdd` (plan-level RED/GREEN/REFACTOR per gsd-executor's 'Plan-Level TDD Gate Enforcement'), and because TypeScript's structural check on the factory's `MonacoDiffAdapter` return type makes a partially-implemented class impossible to type-check without introducing forbidden placeholder stubs."
  - "`setFile` unconditionally clears the editor's model via `disposeModel()` before setting the new one, mirroring `PublicMonacoDiffAdapter.disposeModels()`'s unconditional `setModel(null)` — intentional even on first load, for consistency with the established pattern this class is modeled on."

patterns-established:
  - "Pattern: fixed-side adapters pass `side` once at construction (not per-call) and treat any call whose supplied `side`/`anchor.side` argument disagrees with the instance's fixed side as a no-op, mirroring how `isValidLine` already guards invalid line numbers rather than throwing."

requirements-completed: [PANE-01, PANE-02]

# Metrics
duration: 15min
completed: 2026-10-30
status: complete
---

# Phase 13 Plan 01: Single-Pane Monaco Adapter Summary

**`PublicMonacoSinglePaneAdapter` — a plain `monaco.editor.create()` pane adapter with unpaired comment-anchor view-zone wiring, giving added/deleted/type-changed files a full-width commentable Monaco surface with zero diff-only Monaco API usage.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-30T13:49:00Z
- **Completed:** 2026-10-30T13:53:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- New `PublicMonacoSinglePaneAdapter` class in `src/web/monaco/diff-adapter.ts`, constructed via `monaco.editor.create()` with no diff-only options (`renderSideBySide`, `hideUnchangedRegions`, `diffAlgorithm`, etc. never appear in its options object or body)
- `createMonacoSinglePaneAdapter(host, languageForPath, onChange, side)` exported factory, returning the same `MonacoDiffAdapter` interface shape as `createMonacoDiffAdapter`
- Unpaired comment view-zone lifecycle: `activateAnchor`/`clearAnchor`/`setActiveAnchor` open and remove exactly one `IViewZone` on the single editor, never a spacer zone on a nonexistent counterpart
- 20 unit tests (13 new) covering construction options, aria-label per side, synchronous `setFile` with no `onDidUpdateDiff` wait, density/dispose semantics, and the unpaired anchor/view-zone behaviors

## Task Commits

Both tasks share one RED → GREEN cycle because the plan's frontmatter sets `type: tdd` (plan-level TDD gate, not per-task):

1. **Tasks 1+2 RED: failing tests for single-pane construction + unpaired anchor/view-zone wiring** - `801aa30` (test)
2. **Tasks 1+2 GREEN: `PublicMonacoSinglePaneAdapter` + `createMonacoSinglePaneAdapter`** - `8ffd2e3` (feat)

No REFACTOR commit — the implementation already mirrors `PublicMonacoDiffAdapter`'s established shape with no duplication worth extracting beyond what the twin class already exhibits by convention.

**Plan metadata:** pending (this summary + STATE/ROADMAP/REQUIREMENTS commit, see below)

## Files Created/Modified
- `src/web/monaco/diff-adapter.ts` - adds `PublicMonacoSinglePaneAdapter` class (after `PublicMonacoDiffAdapter`) and the `createMonacoSinglePaneAdapter` factory export
- `tests/unit/monaco-diff-adapter.test.ts` - promotes the Monaco mock's `codeEditor()` factory to a per-instance `editor.create` mock (`mocks.createEditor`), adds `dispose`/`setModel`/`layout`/`restoreViewState`/`saveViewState` to the mock editor shape, and adds two new `describe` blocks covering construction and unpaired anchor/view-zone behavior

## Decisions Made
See `key-decisions` in frontmatter: (1) combined Task 1/Task 2 GREEN into one commit per the plan's `type: tdd` plan-level gate; (2) `setFile` unconditionally clears-then-sets the model, mirroring the diff adapter's existing pattern exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock `addAction` returned `undefined` instead of a disposable**
- **Found during:** Task 1/2 GREEN (first `dispose()` test run)
- **Issue:** `tests/unit/monaco-diff-adapter.test.ts`'s `codeEditor()` mock had `addAction: vi.fn()` with no return value, but both `PublicMonacoDiffAdapter.dispose()` and the new `PublicMonacoSinglePaneAdapter.dispose()` push the return value of `editor.addAction(...)` into `staticDisposables` and later call `.dispose()` on every entry — matching real Monaco's `addAction` returning an `IDisposable`. No existing test exercised `PublicMonacoDiffAdapter.dispose()`, so this mock gap was previously latent.
- **Fix:** Changed the mock to `addAction: vi.fn(() => disposable())`.
- **Files modified:** `tests/unit/monaco-diff-adapter.test.ts`
- **Verification:** `npx vitest run tests/unit/monaco-diff-adapter.test.ts` — dispose tests pass; all 20 tests pass.
- **Committed in:** `8ffd2e3` (part of the GREEN commit)

### Plan-text note (not a code deviation)

The Task 2 acceptance criterion `grep -c "cumpa.add-base-comment\|cumpa.add-head-comment" src/web/monaco/diff-adapter.ts` is `4` does not hold literally: the count is `2` (both from `PublicMonacoDiffAdapter`'s existing literal ids). `PublicMonacoSinglePaneAdapter` constructs its id dynamically as `` `cumpa.add-${side}-comment` `` per the plan's own `<action>` text ("the id is built from the side field"), so the literal strings never appear a third/fourth time for a static grep to find. The same acceptance-criteria bullet anticipates this and explicitly directs "confirm via a targeted test, not a static string match" — satisfied by the new test `registers the cumpa.add-{side}-comment keybinding exactly once per instance`, which asserts the constructed id equals `cumpa.add-base-comment` for a `'base'` instance and `cumpa.add-head-comment` for a `'head'` instance. No code change was made in response to this — the grep count itself is simply unsatisfiable given the plan's own dynamic-id requirement.

---

**Total deviations:** 1 auto-fixed (1 bug), plus 1 informational plan-text note (no code change).
**Impact on plan:** The mock fix was necessary for `dispose()` correctness coverage; it also surfaces a latent gap in `PublicMonacoDiffAdapter`'s own test coverage (pre-existing, out of this plan's file ownership, not fixed here). No scope creep.

## Issues Encountered
None beyond the two items documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `createMonacoSinglePaneAdapter` is ready for `DiffWorkspace.vue` to call in place of `createMonacoDiffAdapter` when a file is single-pane (13-03's integration point, per this plan's `key_links`).
- No blockers for 13-02 or 13-03.

---
*Phase: 13-single-pane-file-rendering*
*Completed: 2026-10-30*

## Self-Check: PASSED

- FOUND: src/web/monaco/diff-adapter.ts
- FOUND: tests/unit/monaco-diff-adapter.test.ts
- FOUND: .planning/phases/13-single-pane-file-rendering/13-01-SUMMARY.md
- FOUND commit: 801aa30
- FOUND commit: 8ffd2e3
