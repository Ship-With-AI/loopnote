---
phase: 16-rendered-markdown-preview
plan: 08
subsystem: ui
tags: [vue, monaco, workspace-state, durable-anchor, range-anchor, a-01]

# Dependency graph
requires:
  - phase: 16-04
    provides: "DiffWorkspace.vue mode prop/host-swap, RenderedMarkdownView mounts in both single-pane and side-by-side layouts, App.vue's activate-line dispatch wiring"
  - phase: 16-05
    provides: "RenderedMarkdownView's activate event already emitting a real block end line (plan 16-03), unaffected by this plan"
  - phase: 16-07
    provides: "DurableAnchorV1Schema/AddCommentRequestSchema's additive optional endLine field, and RecordedAnchorDetails (= DurableAnchorV1Dto) carrying it on every WorkspaceComment with zero client-side type change"
provides:
  - "WorkspaceComposer/pendingMove, the activate-focused-line/activate-line WorkspaceEvent variants, and the persist-comment/reveal-line WorkspaceCommand variants all carry an optional endLine end to end through workspace-state.ts/workspace-command.ts"
  - "DiffWorkspace.vue's activate emit and revealComment() thread endLine from each RenderedMarkdownView mount through to App.vue, while the Monaco code-view gutter's addComment flow keeps emitting a 2-argument (no endLine) activate"
  - "App.vue wires endLine into the addComment mutation payload and into diffWorkspace.value?.revealComment(...), closing the loop from creation to Source-view reveal"
  - "MonacoDiffAdapter's Anchor/ActiveComposer/activateAnchor/setActiveAnchor/revealAnchor/anchorDecoration (both side-by-side and single-pane classes) thread an optional endLine so Source view's isWholeLine decoration spans [line, endLine] instead of just line"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "endLine threaded as optional everywhere (composer/event/command/Anchor types): absence reproduces today's single-line behavior byte-for-byte, matching the additive-field-as-version-signal pattern 16-07 established server-side"
    - "Monaco mock Range class upgraded to capture constructor args (startLineNumber/startColumn/endLineNumber/endColumn) as own properties so tests can assert the exact decoration range produced, not just that a Range was constructed"

key-files:
  created: []
  modified:
    - src/web/model/workspace-command.ts
    - src/web/model/workspace-state.ts
    - src/web/components/DiffWorkspace.vue
    - src/web/App.vue
    - src/web/monaco/diff-adapter.ts
    - tests/unit/workspace-state.test.ts
    - tests/unit/monaco-diff-adapter.test.ts

key-decisions:
  - "DiffWorkspace.vue's two setActiveAnchor({ fileId, side: composer.side, line: composer.line }) call sites (loadContent and the composer-watcher) were left untouched, exactly as the plan's action text specified — only revealComment's adapter.revealAnchor(...) call was widened with endLine; the in-progress composer's own active-anchor highlight was out of this plan's stated scope"
  - "Split App.vue's combined 'reveal-comment-context'/'reveal-line' switch case into two separate case labels so command.endLine (only present on the reveal-line command type) narrows correctly under TypeScript's discriminated-union fallthrough rules"
  - "Extended workspace-state.test.ts's workspaceComment() test helper with an optional endLine parameter (threaded onto recordedAnchor.endLine) rather than hand-building WorkspaceComment literals, keeping every existing call site unchanged"

patterns-established:
  - "Same-anchor text-preservation checks in activateAnchor/setActiveAnchor now also compare endLine, so an in-progress composer edit on a range anchor is not dropped when the component re-activates the same range"

requirements-completed: [MDV-01]

# Metrics
duration: 45min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 08: Thread endLine Through Client Pipeline and Monaco Range Decoration (A-01) Summary

**An optional `endLine` threaded additively through `DiffWorkspace.vue`/`App.vue`/`workspace-state.ts`/`workspace-command.ts`'s activate/persist-comment/reveal-line pipeline and into both `MonacoDiffAdapter` implementations' `activateAnchor`/`setActiveAnchor`/`revealAnchor`/`anchorDecoration`, so a rendered-block comment's full stored range reaches the `addComment` mutation and highlights every line of that range when reopened in Source view — every existing single-line call site (Monaco gutter, keyboard shortcut, `focus-gutter`/`focus-editor-line`) keeps compiling and behaving byte-for-byte unchanged.**

## Performance

- **Duration:** 45 min
- **Tasks:** 2 (each `type="auto"`)
- **Files modified:** 5 source files, 2 test files

## Accomplishments

- `workspace-command.ts`'s `persist-comment` and `reveal-line` command variants, and `workspace-state.ts`'s `WorkspaceComposer`/`pendingMove` shape and `activate-focused-line`/`activate-line` event variants, all gained an optional `endLine`; `activateLine()` now accepts and threads it through both the `confirm-move` branch's `pendingMove` and the `ready` composer it builds.
- `applyEvent`'s `add-comment` case now puts `endLine: composer.endLine` on the `persist-comment` command it dispatches; `showComment()` and the `diff-ready` pending-comment branch both put `endLine: comment.recordedAnchor.endLine` / `pendingComment.recordedAnchor.endLine` on their `reveal-line` commands — reusing `RecordedAnchorDetails` (= `DurableAnchorV1Dto`, plan 16-07) with zero new type plumbing.
- `DiffWorkspace.vue`'s `activate` emit widened to `[side, line, endLine?]`; all three `RenderedMarkdownView` mounts (single-pane, base, head) forward their always-provided block range unchanged; the Monaco-gutter `addComment()` keeps its 2-argument `emit('activate', target.side, target.line)` call, so code-view comments stay single-line. `revealComment(side, line, endLine?)` passes `endLine` into `adapter?.revealAnchor(...)`.
- `App.vue` puts `endLine: command.endLine` on the `sessionClient?.mutate({ type: 'addComment', ... })` payload (reaching `AddCommentRequestSchema`'s optional field from plan 16-07), splits the combined `reveal-comment-context`/`reveal-line` case so `command.endLine` type-narrows correctly, and widens its `@activate` dispatch handler to forward `endLine` into `{ type: 'activate-line', side, line, endLine }`.
- Both `MonacoDiffAdapter` implementations (side-by-side and single-pane) thread `endLine` through `Anchor`/`ActiveComposer`/`activateAnchor`/`getActiveAnchor`/`setActiveAnchor`/`revealAnchor`; their same-anchor text-preservation checks now also compare `endLine`. `anchorDecoration(line, endLine?)` builds `new monaco.Range(line, 1, endLine ?? line, 1)` with `isWholeLine: true`, so Source view highlights the full `[line, endLine]` range when present and exactly `line` when omitted.
- `npm run typecheck:web` clean; `node scripts/run-focused-vitest.mjs tests/unit/monaco-diff-adapter.test.ts tests/unit/workspace-state.test.ts` — 41/41 passing (4 new Monaco-adapter cases: endLine round-trip + decoration range per adapter class, legacy single-line decoration unchanged per adapter class; 1 new workspace-state case covering activate-line → confirm-move → persist-comment → reveal-line endLine threading end to end).

## Task Commits

Each task committed atomically:

1. **Task 1: Thread endLine through the activate event and the comment persist/reveal command pipeline (A-01)** - `de32b86` (feat)
2. **Task 2: Monaco source-view range decoration for range anchors (A-01)** - `f08be56` (feat)

## Files Created/Modified
- `src/web/model/workspace-command.ts` - `endLine?: number` added to `persist-comment`/`reveal-line` command variants
- `src/web/model/workspace-state.ts` - `endLine?: number` threaded through `WorkspaceComposer`/`pendingMove`, `activate-focused-line`/`activate-line` events, `activateLine()`, and the `add-comment`/`confirm-move`/`show-comment`/`diff-ready` command-building branches
- `src/web/components/DiffWorkspace.vue` - `activate` emit widened to 3 args; all `RenderedMarkdownView` `@activate` handlers and `revealComment()` forward `endLine`; Monaco-gutter `addComment()` unchanged
- `src/web/App.vue` - `addComment` mutation payload, `@activate` dispatch, and the split `reveal-line` case all forward `endLine`
- `src/web/monaco/diff-adapter.ts` - `Anchor` type, `MonacoDiffAdapter.activateAnchor` type, and both adapter classes' `activateAnchor`/`getActiveAnchor`/`setActiveAnchor`/`revealAnchor`/`anchorDecoration` thread `endLine`
- `tests/unit/workspace-state.test.ts` - `workspaceComment()` helper gained an optional `endLine` param; new test covers `activate-line`→`confirm-move`→`persist-comment`→`reveal-line` endLine threading
- `tests/unit/monaco-diff-adapter.test.ts` - mock `Range` class upgraded to capture constructor args; 4 new cases (2 per adapter class) covering endLine round-trip through `getActiveAnchor()`/decoration range and unchanged single-line legacy decoration

## Decisions Made
See `key-decisions` in frontmatter. No `AskUserQuestion`-equivalent decision points were encountered — the plan's own text and the RESEARCH.md addendum fully specified behavior for every branch touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Combined `reveal-comment-context`/`reveal-line` switch case in App.vue could not access `command.endLine`**
- **Found during:** Task 1, wiring `endLine` into the `reveal-line` case.
- **Issue:** The two command types shared one `case 'reveal-comment-context': case 'reveal-line':` fallthrough block; TypeScript narrows `command` to the union of both variant types in that block, and `reveal-comment-context` has no `endLine` field at all (not even optional), so `command.endLine` failed to compile.
- **Fix:** Split the fallthrough into two separate `case` blocks, each calling `diffWorkspace.value?.revealComment(...)` — `reveal-comment-context` without `endLine` (unchanged), `reveal-line` with `command.endLine`.
- **Files modified:** `src/web/App.vue`
- **Verification:** `npm run typecheck:web` passes.
- **Committed in:** `de32b86` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3, a compile-blocking type-narrowing issue discovered and fixed within Task 1's own scope, before that task's commit). No scope creep.

## Issues Encountered
None beyond the one auto-fixed item above, resolved within the same task before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- A-01 is now fully closed end to end: `RenderedMarkdownView`'s block range (plan 16-03) → `DiffWorkspace`/`App.vue`'s `activate`/`activate-line` plumbing (plan 16-04, this plan) → `addComment` mutation's optional `endLine` (plan 16-07) → stored `DurableAnchorV1`/`recordedAnchor.endLine` → `reveal-line`/`revealComment`/`revealAnchor` → Monaco's `isWholeLine` range decoration (this plan).
- No blockers for remaining phase-16 plans.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/web/model/workspace-command.ts
- FOUND: src/web/model/workspace-state.ts
- FOUND: src/web/components/DiffWorkspace.vue
- FOUND: src/web/App.vue
- FOUND: src/web/monaco/diff-adapter.ts
- FOUND: tests/unit/workspace-state.test.ts
- FOUND: tests/unit/monaco-diff-adapter.test.ts
- FOUND: .planning/phases/16-rendered-markdown-preview/16-08-SUMMARY.md
- FOUND commits: de32b86 (feat), f08be56 (feat) — both present via `git log --oneline --all --grep="16-08"`
