---
phase: 23-inline-comment-threads
plan: 06
subsystem: ui
tags: [vue, icon-system, toolbar]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-01)
    provides: overlay-widget architecture decision (informational only — plan touches no widget-mounting code)
provides:
  - "EditorTitle.vue — previousThread/nextThread/toggleThreadsCollapsed emits and hasThreadsAnywhere/anyThreadExpanded/hasCommentsInCurrentFile props, typed and rendered, ready for Plan 23-08's App.vue wiring"
  - "New editor-title__group (role=group, aria-label=\"Comment threads\") with previous-thread/next-thread/collapse-or-expand-threads icon buttons, each paired aria-label + tooltip"
affects: [23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thread-nav icon group follows the exact icon-button-with-tooltip + role=group convention already shipped for Diff layout/Markdown view groups in EditorTitle.vue — zero new CSS, reuses .editor-title__group/.editor-title__separator"
    - "Collapse/expand is a single action button whose icon+aria-label+tooltip swap on state (never two separately-labelled controls for one state), per 20-UI-REVIEW.md Top-3-Fix #2 lesson"

key-files:
  created: []
  modified:
    - src/web/components/workbench/EditorTitle.vue
    - src/web/App.vue
    - tests/e2e/responsive-session.spec.ts

key-decisions:
  - "Group is unconditional (not wrapped in v-if=\"!singlePane\"), per plan's explicit instruction — previous/next-thread stay visible across every session kind including single-pane."
  - "Hardcoded Mac glyph tooltip text (\"Option+F9\"/\"Shift+Option+F9\") with no Windows/Linux variant, matching the only two precedents found in the codebase (DiffWorkspace.vue's \"Option+Enter\", EditorTitle.vue's own \"Alt+↑\") — no platform-detection helper exists anywhere in src/web to drive a conditional label."

patterns-established:
  - "Interface-first prop addition on an already-consumed component: when new required props break an existing caller's typecheck, pass conservative placeholder values (false) at the call site rather than making props optional, preserving the established required-boolean-prop convention for sibling props in the same component."

requirements-completed: [THREAD-05, THREAD-09]

# Metrics
duration: ~20min
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 06: EditorTitle.vue thread-navigation icon group Summary

**Added previous-thread/next-thread/collapse-expand-threads icon group to EditorTitle.vue with typed props/emits, matching the existing Diff-layout/Markdown-view icon-button-with-tooltip pattern, and no App.vue behavioral wiring (deferred to Plan 23-08).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-11-05
- **Tasks:** 1
- **Files modified:** 3 (1 plan file + 2 deviation fixes)

## Accomplishments
- `EditorTitle.vue` gains 3 new props (`hasThreadsAnywhere`, `anyThreadExpanded`, `hasCommentsInCurrentFile`) and 3 new emits (`previousThread`, `nextThread`, `toggleThreadsCollapsed`), fully typed.
- New `.editor-title__group[aria-label="Comment threads"]` renders `previous-thread`/`next-thread` icon buttons (disabled together on `!hasThreadsAnywhere`) plus a single collapse/expand button whose icon+label swap on `anyThreadExpanded`, hidden entirely (`v-if`) when the current file has zero comments.
- The new group is never gated by `singlePane`, unlike the existing previous-change/next-change pair — stays visible in every session kind.
- Zero new CSS: reuses the file's existing `.editor-title__group`/`.editor-title__separator` rules verbatim; `UiIcon.vue` already carried the `previous-thread`/`next-thread`/`collapse-threads`/`expand-threads` glyphs shipped by Plan 23-04.

## Task Commits

1. **Task 1: Add the previous/next-thread and collapse/expand-threads icon group** - `8153638` (feat)

**Deviation fixes:**
- `4983f22` (fix) — placeholder thread props at App.vue's EditorTitle call site
- `b76ec86` (test) — updated Phase-08 toolbar-group-count expectation

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `src/web/components/workbench/EditorTitle.vue` - new props/emits + Comment-threads icon group
- `src/web/App.vue` - placeholder values for the 3 new required props (deviation, see below)
- `tests/e2e/responsive-session.spec.ts` - toolbar-group-count assertion updated from 1→2 (deviation, see below)

## Decisions Made
- Group placed exactly where the plan specified: after the Markdown-mode `</template>` (old line 214), before the `filesDrawer` button — file had not drifted from the plan's line references since Phase 21/22.
- No platform-detection helper exists anywhere in `src/web` (confirmed via grep for `navigator.platform`/`isMac`/etc.); followed the plan's own fallback instruction to hardcode the Mac glyph form, matching the file's own "Alt+↑" and `DiffWorkspace.vue`'s "Option+Enter" precedents (neither of which branches on platform either).
- **Binding decision override (widget architecture):** N/A — this plan touches no `IContentWidget`/`IOverlayWidget`/`addContentWidget`/`addOverlayWidget` code; it is a pure presentational toolbar-icon addition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Passed placeholder thread props at App.vue's EditorTitle call site**
- **Found during:** Task 1 verification (`npx vue-tsc --noEmit --project tsconfig.web.json`)
- **Issue:** The plan's `files_modified` lists only `EditorTitle.vue`, and explicitly defers all App.vue wiring to Plan 23-08. But `EditorTitle.vue` is already consumed by `App.vue`, and the 3 new props are required (no defaults), matching the established required-boolean-prop convention for every sibling prop in this component (`atFirstFile`, `hasActiveFile`, etc. are also required, not optional). Leaving them unsatisfied broke `npm run typecheck:web` (0-errors gate) at App.vue's call site.
- **Fix:** Added `:has-threads-anywhere="false"`, `:any-thread-expanded="false"`, `:has-comments-in-current-file="false"` to the `<EditorTitle>` call in `App.vue` — conservative, non-behavioral placeholders (nav disabled, collapse button hidden) that satisfy the type contract without implementing the real thread-state computation that depends on the (not-yet-built) thread data model. This is NOT the "real behavior" wiring (click handlers → `thread-order.ts`) that the plan's `key_links` assigns to Plan 23-08 — it only satisfies the compiler.
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` → 0 errors (was 1 error before the fix).
- **Committed in:** `4983f22`

**2. [Rule 1 - Bug/stale assumption] Updated Phase-08 reflow matrix's toolbar-group-count expectation**
- **Found during:** Targeted Playwright run of `tests/e2e/responsive-session.spec.ts` (surface this plan changed — `.editor-title [role="group"]`)
- **Issue:** `expectPhase08ReflowAtCurrentWidth` asserted `reflow.toolbarGroups` (`.editor-title [role="group"]`) has length 1 at every width in the 8-width boundary matrix. That assumption was only ever true because every existing `role="group"` div in `EditorTitle.vue` (Markdown view, previous/next-change — the latter isn't actually a `role="group"`) was conditionally hidden for the test's fixture file (`alpha.ts`, non-markdown, two-pane), leaving only the "Diff layout" group. The plan's Task 1 explicitly instructs the new "Comment threads" group to NEVER be hidden by `singlePane` (unlike the previous/next-change pair) — so it now always renders as a second sibling `role="group"`, which is the correct, intended new structure, not a bug in the implementation.
- **Fix:** Updated the assertion from `toHaveLength(1)` to `toHaveLength(2)` with an explanatory comment, keeping the existing per-group nonzero-width/height checks (which now also validate the new group's own rendered geometry at all 8 matrix widths).
- **Files modified:** `tests/e2e/responsive-session.spec.ts`
- **Verification:** `npx playwright test tests/e2e/responsive-session.spec.ts tests/integration/anchored-workspace.spec.ts` → 13/13 passed (was 1 failed before the fix).
- **Committed in:** `b76ec86`

---

**Total deviations:** 2 auto-fixed (1 blocking/Rule 3, 1 stale-test-assumption/Rule 1)
**Impact on plan:** Both fixes were strictly necessary to keep the shared-context gates green given the plan's own explicit "always visible, never gated by singlePane" requirement; neither adds real behavior ahead of Plan 23-08 scope. No scope creep.

## Issues Encountered
None beyond deviations documented above.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npx vue-tsc --noEmit --project tsconfig.web.json` (plan-level `<verification>` command) — **0 errors**.
- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **pass** (`Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.`); no new CSS rules — reuses `.editor-title__group`/`.editor-title__separator` verbatim.
- `npx vitest run --no-file-parallelism tests/unit` (full unit suite) — **452 tests passed, 45 test files passed, 0 failed** (no regressions).
- Playwright: identified by grepping `tests/e2e/` and `tests/integration/` for `EditorTitle|editor-title|previous-thread|next-thread|collapse-threads|expand-threads` → `tests/e2e/responsive-session.spec.ts` (directly measures `.editor-title [role="group"]` toolbar geometry across an 8-width boundary matrix) and `tests/integration/anchored-workspace.spec.ts` (exercises `.editor-title` rendering broadly). Ran against the built runtime (`npm run build:web` then `npx playwright test tests/e2e/responsive-session.spec.ts tests/integration/anchored-workspace.spec.ts`) — **13/13 passed** after the toolbar-group-count deviation fix above.

**Human verification deferred (per plan's own `<verification>` text):** These emits are not wired to any handler yet (App.vue passes `false` placeholders for all 3 new props), so no automated check can observe real navigation/collapse behavior from this plan alone. The plan itself defers "a running session" visual confirmation of disabled-state/icon-label-swap rendering to a manual packaged-binary check, noting the full behavioral packaged-binary check belongs to Plan 23-08 (which wires the emits to real handlers and real thread state). Structural evidence that the group renders correctly comes from the Playwright reflow matrix above, which asserts nonzero width/height for the new group's bounding rect at all 8 tested viewport widths.

## Self-Check: PASSED

- `.planning/phases/23-inline-comment-threads/23-06-SUMMARY.md` confirmed on disk.
- Commits `8153638`, `4983f22`, `b76ec86` all confirmed present in `git log --oneline --all`.
- Task 1's `<verify>`/`<done>` criteria re-checked: new icon group renders in both two-pane and single-pane modes (unconditional, not wrapped in `v-if="!singlePane"`), previous/next-thread disable together on `!hasThreadsAnywhere`, collapse/expand button swaps icon+label on `anyThreadExpanded` and is hidden via `v-if="hasCommentsInCurrentFile"` — all confirmed by direct code reading of the committed `EditorTitle.vue`.
- Plan-level `<verification>`/`<success_criteria>` re-run: `npx vue-tsc --noEmit` 0 errors; shared-context gates (typecheck:web, verify:semantic-css, full unit suite) all green; targeted Playwright specs 13/13 passed.
- No scope was narrowed; no stub/placeholder patterns flow to UI rendering beyond the plan's own explicitly-acknowledged App.vue placeholder (documented as a deviation above, not hidden).

## Next Phase Readiness
- `EditorTitle.vue`'s `previousThread`/`nextThread`/`toggleThreadsCollapsed` emits and `hasThreadsAnywhere`/`anyThreadExpanded`/`hasCommentsInCurrentFile` props are typed and ready for Plan 23-08 to wire to the ⌥F9/⇧⌥F9 handlers and `thread-order.ts`, replacing the `false` placeholders in `App.vue` with real computed values.
- No blockers downstream.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
