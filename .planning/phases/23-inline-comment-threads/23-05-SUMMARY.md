---
phase: 23-inline-comment-threads
plan: 05
subsystem: ui
tags: [monaco, overlay-widget, view-zones, keyboard-shortcuts, vitest, playwright]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-01)
    provides: overlay-widget vs content-widget go/no-go spike decision (overlay-widget selected, measured evidence in 23-01-SUMMARY.md)
  - phase: 23-inline-comment-threads (Plan 23-04)
    provides: CommentThread.vue/UndoToast.vue presentational components, 7 new UiIcon glyphs, ReviewStateBadge size="compact" (not consumed by this plan directly, but unblocks the wave)
provides:
  - "PublicMonacoDiffAdapter and PublicMonacoSinglePaneAdapter threadZones Map<commentId, ...> replacing/supplementing the single originalZone/modifiedZone/zone composer fields; createThread/growThread/removeThread public methods on MonacoDiffAdapter"
  - "Overlay-widget rendering layer: plain spacer IViewZone on both sides (anchored + counterpart), one IOverlayWidget per thread positioned via onDomNodeTop + layoutOverlayWidget, attached to the anchored side's editor only"
  - "THREAD-06 gutter '+' hover affordance: new decorations collection (glyphMarginClassName: 'diff-gutter-line') covering every valid line, plus styles.css hover chip"
  - "THREAD-09 Alt+F9/Shift+Alt+F9 previous-thread/next-thread Monaco addAction dual-registered on every editor instance in both adapter classes; AdapterNavigation.nextThread/previousThread"
affects: [23-07-diff-workspace, 23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyed Map<commentId, {zoneIds, zones, widget, widgetTop, anchorEditor}> generalizing the existing single-field paired-zone pattern (growPairedZones-equivalent, now per-key)"
    - "Overlay-widget-over-spacer-zone: interactive DOM never lives in a view zone's own domNode once N>1 zones are live; zone domNode is a plain aria-hidden spacer on both sides, widget position driven by onDomNodeTop"

key-files:
  created: []
  modified:
    - src/web/monaco/diff-adapter.ts
    - src/web/styles.css
    - tests/unit/monaco-diff-adapter.test.ts
    - src/web/components/DiffWorkspace.vue
    - src/web/prototypes/MonacoStabilityPrototype.vue
    - tests/integration/monaco-anchor.spec.ts

key-decisions:
  - "Built on overlay-widget (IOverlayWidget/addOverlayWidget/onDomNodeTop/layoutOverlayWidget), not content-widget, per the binding override of Plan 23-01's resolved checkpoint:decision"
  - "Kept the existing single-field activeComposer/originalZone/modifiedZone/zone draft-in-progress path completely unmodified and separate from the new threadZones map, per RESEARCH.md Pattern 1"
  - "Gutter '+' decoration scoped to PublicMonacoDiffAdapter only (matches the plan's literal reference to originalDiffDecorations/modifiedDiffDecorations, which only exist on the two-pane class); single-pane's existing diff-workspace__gutter-action button affordance is untouched and unaffected"
  - "Added an anchorEditor field to each threadZones map entry (not in the plan's literal type-shape example) so growThreadZone/removeThreadZone can call layoutOverlayWidget/removeOverlayWidget on the correct editor without extra bookkeeping"

patterns-established:
  - "Per-thread overlay widget getPosition() always does a fresh this.threadZones.get(commentId) lookup for widgetTop rather than capturing a closure variable, so the widget never reads stale position data and removal is simple (delete the map entry, no dangling closure state)"

requirements-completed: [THREAD-01, THREAD-06, THREAD-08, THREAD-09]

# Metrics
duration: ~90min
completed: 2026-11-05
status: complete
---

# Phase 23: Inline Comment Threads - Plan 05 Summary

**Generalized `diff-adapter.ts`'s single composer zone pair into a comment-id-keyed `threadZones` map rendered through overlay widgets, added the THREAD-06 gutter hover chip and THREAD-09 Alt+F9/Shift+Alt+F9 dual-registered Monaco actions, on both `PublicMonacoDiffAdapter` and `PublicMonacoSinglePaneAdapter`.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-11-05T17:55:00Z (approx.)
- **Completed:** 2026-11-05T19:27:26Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Both adapter classes can create/grow/remove an independently-keyed thread zone pair (two-pane) or zone (single-pane) by comment id, each rendered through an `IOverlayWidget` positioned via the anchored zone's `onDomNodeTop` callback — the technique Plan 23-01's spike measured and the user's checkpoint decision selected.
- The pre-existing single-composer draft-in-progress path (`activeComposer`/`originalZone`/`modifiedZone`/`zone`, `createComposerZone`, `rebuildAnchoredLayout`) is byte-for-byte unmodified; the new `threadZones` map is a fully separate mechanism, as RESEARCH.md Pattern 1 requires.
- THREAD-06: a new `diff-gutter-line` decorations collection covers every valid line's glyph margin on both panes of the two-pane adapter; `styles.css` adds the `.diff-gutter-line:hover::before` chip verbatim from UI-SPEC, using only existing tokens. No new click handling was added — clicking still routes through the existing `activateFocusedAnchor`/`captureAffordance`/`onMouseDown` wiring.
- THREAD-09: `Alt+F9`/`Shift+Alt+F9` previous-thread/next-thread `addAction` registrations added to every editor instance in both classes (original + modified editors, and the single-pane editor), mirroring the existing F7/Alt-arrow dual-registration shape exactly. `AdapterNavigation` gained `nextThread`/`previousThread`.
- `MonacoDiffAdapter` now exposes `createThread`/`growThread`/`removeThread`; both adapter factories implement them identically.
- Extended `tests/unit/monaco-diff-adapter.test.ts` with 7 new tests covering independent-id creation, isolated grow, isolated removal (both adapter classes), and F9 keybinding registration; all 33 tests in the file pass.

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2 (adapter-side scope): keyed thread-zone map, overlay-widget layer, gutter affordance, public interface, AdapterNavigation extension, Alt+F9/Shift+Alt+F9 dual registration** - `37ed6a7` (feat)
2. **Task 2 (test-side scope): unit test coverage + golden-count fix** - `be06753` (test)

**Plan metadata:** commit pending (this docs commit)

_Note: Task 1 and Task 2 both specify changes to the same `diff-adapter.ts` class bodies (threadZones map, zone methods, and the public interface/addAction registrations are structurally interleaved within the same constructors and class blocks). Splitting them into two independent, hunk-accurate commits would have required fragile manual patch surgery on a single file mid-edit; they landed as one atomic commit instead, with the test-file work Task 2 also specifies committed separately. See Deviations below._

## Files Created/Modified
- `src/web/monaco/diff-adapter.ts` - `threadZones` maps, `createThread`/`growThread`/`removeThread`, overlay-widget wiring, gutter decorations, Alt+F9/Shift+Alt+F9 actions, `AdapterNavigation`/`MonacoDiffAdapter` type extensions
- `src/web/styles.css` - `.diff-gutter-line:hover::before` hover chip
- `tests/unit/monaco-diff-adapter.test.ts` - new keyed-thread-zone and F9-keybinding assertions; mock harness extended with overlay-widget methods and unique zone ids; pre-existing navigate-arg bug fixed
- `src/web/components/DiffWorkspace.vue` - inert `nextThread`/`previousThread` no-ops added to its `navigate` object literal (satisfies the extended `AdapterNavigation` type; Plan 23-07 wires real behavior)
- `src/web/prototypes/MonacoStabilityPrototype.vue` - same inert no-op addition, same reason
- `tests/integration/monaco-anchor.spec.ts` - `listenerCount` golden assertions updated 25 → 29 (4 new `addAction` registrations)

## Decisions Made
- Overlay-widget technique used throughout, per the binding override of Plan 23-01's resolved `checkpoint:decision` (superseding the plan text's residual content-widget-or-overlay-widget hedging language).
- Gutter `+` decoration added only to `PublicMonacoDiffAdapter`, not `PublicMonacoSinglePaneAdapter` — the plan's task text anchors this explicitly to "the existing `originalDiffDecorations`/`modifiedDiffDecorations`," which only exist on the two-pane class; the single-pane adapter has no diff decorations at all (no diff exists in a single-pane standalone/added/deleted-file session) and keeps its pre-existing `diff-workspace__gutter-action` floating-button affordance unchanged.
- ⌥F9/⇧⌥F9 (not ⌘F9) used for the keybindings. The orchestrator prompt flagged a possible discrepancy with "⌘F9"; CONTEXT.md, UI-SPEC.md, and PLAN.md's own task/truths text are unanimous and explicit about `⌥F9`/`⇧⌥F9` (`KeyMod.Alt | KeyCode.F9` / `KeyMod.Alt | KeyMod.Shift | KeyCode.F9`), matching the already-shipped F7/Alt-arrow convention — no real discrepancy existed once CONTEXT.md/UI-SPEC.md were read; ⌥F9/⇧⌥F9 was used as the plan text specifies.
- Added an `anchorEditor` field to each `threadZones` map entry (two-pane class) beyond the plan's illustrative type shape, so `growThreadZone`/`removeThreadZone` can call `layoutOverlayWidget`/`removeOverlayWidget` on the correct editor instance without extra lookups — a minor, Claude's-Discretion implementation detail, not an architectural change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `nextThread`/`previousThread` no-op stubs to `DiffWorkspace.vue` and `MonacoStabilityPrototype.vue`**
- **Found during:** Task 2 (extending `AdapterNavigation`)
- **Issue:** Extending `AdapterNavigation` with two new required fields broke `npm run typecheck:web` at both of this type's only two call sites (TS2739/TS2345, missing properties).
- **Fix:** Added inert `nextThread: () => {}` / `previousThread: () => {}` to both `navigate` object literals. `DiffWorkspace.vue`'s public emit contract is unchanged (no new emits added) — this plan explicitly does not mount Vue components or wire real thread navigation; Plan 23-07 replaces these no-ops with real behavior.
- **Files modified:** `src/web/components/DiffWorkspace.vue`, `src/web/prototypes/MonacoStabilityPrototype.vue`
- **Verification:** `npm run typecheck:web` → 0 errors
- **Committed in:** `37ed6a7`

**2. [Rule 1 - Bug] Fixed a pre-existing arity bug at 10 call sites in `tests/unit/monaco-diff-adapter.test.ts`**
- **Found during:** Task 2 (extending the same `createMonacoDiffAdapter(...)` call shape this plan's new navigate fields affect)
- **Issue:** `noopNavigate` was declared but never actually passed as the 4th argument at 10 `createMonacoDiffAdapter(...)` call sites (a pre-existing bug, invisible to `npm run typecheck:web` because that script's `tsconfig.web.json` does not include `tests/unit/**`; `npm run typecheck:tests:web`, a separate script not in this plan's gate list, does cover the file and reported 10 `TS2554: Expected 4 arguments, but got 3` errors before this fix).
- **Fix:** Added `, noopNavigate` to all 10 call sites.
- **Files modified:** `tests/unit/monaco-diff-adapter.test.ts`
- **Verification:** `npx vitest run --no-file-parallelism tests/unit/monaco-diff-adapter.test.ts` → all pass (this bug was runtime-harmless since vitest does not typecheck test files, but left uncorrected it would have been inconsistent with the many new navigate-dependent assertions this plan adds to the same file).
- **Committed in:** `be06753`

**3. [Rule 1 - Bug] Updated three stale `listenerCount: 25` golden-count assertions to 29 in `tests/integration/monaco-anchor.spec.ts`**
- **Found during:** verification step (running the explicitly-named `tests/integration/monaco-anchor.spec.ts` against the built runtime)
- **Issue:** `getDiagnostics().listenerCount` is `this.staticDisposables.length`; this plan's 4 new `addAction` registrations (previous-thread/next-thread on both `originalEditor`/`modifiedEditor`) legitimately raised the count from 25 to 29. Two tests ("7. bounds live models..." and "12. keeps selection contrast...") hard-coded the old total.
- **Fix:** Updated all 3 occurrences (`toBe(25)` × 2, `toMatchObject({ listenerCount: 25, ... })` × 1) to 29.
- **Files modified:** `tests/integration/monaco-anchor.spec.ts`
- **Verification:** `npx playwright test tests/integration/monaco-anchor.spec.ts` → 15/15 pass (first run without this fix: 2/15 failed with `Expected: 25, Received: 29`)
- **Committed in:** `be06753`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug/golden-count corrections)
**Impact on plan:** All three were necessary direct consequences of this plan's mandated type/behavior changes (extended `AdapterNavigation`, 4 new `addAction` registrations). No scope creep — no new behavior beyond what Task 1/Task 2 specify, no files touched outside what the type/action changes required.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npx vue-tsc --noEmit --project tsconfig.web.json` (plan-level `<verification>`, same as `npm run typecheck:web`) — **0 errors**.
- `npx vitest run --no-file-parallelism tests/unit/monaco-diff-adapter.test.ts` (plan-level `<verification>`) — **33 tests passed, 1 file passed**.
- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` (runs `build:web` first) — **pass** ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."); the new `.diff-gutter-line:hover::before` rule uses only existing tokens (`--radius-control`, `--interactive-accent-emphasis`, `--text-on-emphasis`, `--font-weight-semibold`).
- `npx vitest run --no-file-parallelism tests/unit` (full unit suite) — **459 tests passed, 45 test files passed, 0 failed** (452 pre-existing + 7 new; no regressions).
- Playwright, run against the built runtime (`npm run build:web` then `npx playwright test <spec>`), surfaces identified by grepping `tests/e2e/`/`tests/integration/` for diff-adapter/Monaco-zone usages:
  - `tests/integration/monaco-anchor.spec.ts` (primary: zone-geometry, `expectPairedZonesAligned`, `getDiagnostics()` counts) — **15/15 passed** (after the `listenerCount` golden-count fix above; first run surfaced the 2 failures this fix resolves).
  - `tests/integration/anchored-workspace.spec.ts` — **12/12 passed**.
  - `tests/e2e/anchored-review.spec.ts` (the npm-pack-and-spawn packaged-binary harness this plan's own `<verification>` text references by name) — **5/5 passed**.
  - `tests/e2e/responsive-session.spec.ts` (explicitly named in this assignment) — **1/1 passed**.
  - Not run (out of scope per "do not run the entire suite"; unaffected by this plan's purely-additive changes — the composer/anchor zone code path they exercise, `createComposerZone`/`originalZone`/`modifiedZone`/`rebuildAnchoredLayout`, was left byte-for-byte unchanged and is already covered by the 4 specs above): `tests/e2e/agent-ready-export.spec.ts` (explicitly instructed not to touch), `tests/e2e/complete-review-draft.spec.ts`, `tests/e2e/standalone-review.spec.ts`, `tests/e2e/uncommitted-review.spec.ts`.
- `tests/e2e/agent-ready-export.spec.ts` and its fixtures were **not modified** — this plan's changes are purely additive to `diff-adapter.ts`'s surface and have no reason to touch default agent-ready-export behavior.

## Next Phase Readiness
- Plan 23-07 (`DiffWorkspace.vue` zone-mounting loop) can call `adapter.createThread(commentId, anchor)`/`growThread`/`removeThread` directly and mount `CommentThread.vue` into the returned DOM node via `render(h(...), node)`, matching today's composer-zone mounting pattern.
- Plan 23-07/23-08 own replacing the inert `nextThread`/`previousThread` no-ops in `DiffWorkspace.vue`/`MonacoStabilityPrototype.vue` with real behavior (flattened cross-file thread order from `thread-order.ts`, plus the matching `document`-level keydown handler half — this plan supplied only the Monaco `addAction` half, per RESEARCH.md Pattern 4/Pitfall 7).
- No blockers for downstream plans.

**Human verification items (visual-only, not automatable from this plan's scope):** none — this plan mounts no Vue component into the new widget DOM nodes yet (Plan 23-07's job), so there is no visual thread UI to inspect yet. The gutter `+` hover chip is CSS-only and was verified via `verify:semantic-css` (token compliance) and the Playwright specs above (no regression to the existing composer-activation click flow), not via a dedicated visual screenshot — flagging for Plan 23-07/08's eventual visual QA pass once real threads render.

## Self-Check: PASSED

- `src/web/monaco/diff-adapter.ts`, `src/web/styles.css`, `tests/unit/monaco-diff-adapter.test.ts`, `src/web/components/DiffWorkspace.vue`, `src/web/prototypes/MonacoStabilityPrototype.vue`, `tests/integration/monaco-anchor.spec.ts` all exist on disk and show this plan's changes in `git diff 76b0164..be06753`.
- Commits `37ed6a7` and `be06753` both present in `git log --oneline --all --grep="23-05"`.
- `git diff 76b0164..be06753 -- src/web/monaco/diff-adapter.ts` shows zero deleted lines — confirms the existing single-composer path (`activeComposer`, `originalZone`/`modifiedZone`/`zone`, `createComposerZone`, `createSpacerZone`, `rebuildAnchoredLayout`, `growPairedZones`, `positionZones`) is byte-for-byte unmodified, satisfying Task 1's "existing single-composer path is unmodified" done-criterion.
- `MonacoDiffAdapter` exposes `createThread`/`growThread`/`removeThread` on both concrete classes (verified by the new unit tests exercising `adapter.createThread(...)`/`.growThread(...)`/`.removeThread(...)` through the public factory functions, not internal methods).
- Re-ran both plan-level `<verification>` commands: `npx vue-tsc --noEmit --project tsconfig.web.json` → 0 errors; `npx vitest run --no-file-parallelism tests/unit/monaco-diff-adapter.test.ts` → 33/33 passed.
- All task-level `<done>` criteria re-verified: independent create/grow/remove by comment id (two-pane + single-pane, 6 new tests), unmodified composer path (diff confirmed above), gutter hover chip decoration covers every valid line (`buildGutterLineDecorations`, range `1..lineCount`), ⌥F9/⇧⌥F9 registered on every editor instance in both classes with correct keybinding values (1 new test per class).
- No scope was narrowed from the plan's stated objective.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*

