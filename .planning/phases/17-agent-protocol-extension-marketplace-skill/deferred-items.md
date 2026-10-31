# Deferred items — Phase 17

## 17-04: pre-existing `.monaco-diff-editor` auto-selection race in `tests/helpers/open-runtime-session.ts`

**Found during:** Plan 17-04, Task 2 GREEN verification (`npm run test:runtime-artifact -- tests/e2e/agent-ready-export.spec.ts`).

**Symptom:** `openRuntimeSession()` (`tests/helpers/open-runtime-session.ts:26`) asserts
`page.locator('.monaco-diff-editor')` is visible immediately after `page.goto()`. When the
browser session's first auto-selected file in the changed-files tree is a single-pane
file (added/deleted-only, or in `DiffWorkspace.vue` terms any file with `singlePaneSide`
set), the page renders through `createMonacoSinglePaneAdapter` instead of
`createMonacoDiffAdapter`, so no `.monaco-diff-editor` element ever appears and the
assertion times out and fails (even though the page loaded correctly — the Playwright
accessibility snapshot captured on failure shows the file tree, the selected file, and a
working `textbox` region, i.e. the app is functioning as designed).

**Scope and reproduction:** Confirmed via `git show 0a92585:tests/e2e/agent-ready-export.spec.ts`
(the file's exact content immediately before Plan 17-04 touched it) swapped back into
`tests/e2e/agent-ready-export.spec.ts`, built and packed from the current (17-04) source
tree, and run against the `'attached review blocks Finish while an inline composer has
unsaved text'` and `'attached range review stays silent until Finish...'` scenarios in
isolation — both pre-existing, both fail identically. Plan 17-04 does not modify
`tests/helpers/open-runtime-session.ts`, `src/web/**`, or any file-ordering/selection
logic, so this is not caused by 17-04's `src/cli/run.ts` / `src/git/standalone-resolution.ts`
changes. It affects every scenario in `tests/e2e/agent-ready-export.spec.ts` whose fixture's
alphabetically-first changed file is single-pane (e.g. `createDirtyGitFixture`'s fixtures,
where `src/added.ts` sorts before `src/changed.ts`), plus `tests/e2e/package-assets.spec.ts`'s
one browser scenario.

**Effect on 17-04 specifically:** `tests/e2e/agent-ready-export.spec.ts`'s two new positive
scenarios (`'installed uncommitted review resolves worktree changes and emits canonical V5
only after Finish'`, `'installed files review resolves standalone paths and emits canonical
V6 only after Finish'`) call the same shared `openAcceptanceRuntimeSession` → `openRuntimeSession`
helper other scenarios use, so they hit this pre-existing bug too and fail at the same
first-page-load assertion, before ever reaching the new dispatch code's own behavior.

**Independent correctness evidence:** The `src/cli/run.ts` / `src/git/standalone-resolution.ts`
dispatch implementation itself was verified correct end-to-end with a standalone Playwright
script that opens the session directly against `.diff-workspace__editor` (bypassing the
`.monaco-diff-editor` helper check) instead of through `openRuntimeSession`: both
`mode:'uncommitted'` (`source:'worktree'`) and `mode:'files'` sessions load, accept a comment
(`201`), Finish (`201`), and deliver exactly one well-formed `schemaVersion: 5` /
`schemaVersion: 6` canonical export on stdout containing the submitted comment body and
(`files` mode) the correct `standalone.originalArguments`. This confirms the new dispatch
branches work; the open item is purely in the shared test helper's pre-existing selection
assumption.

**Proposed fix (not applied — out of 17-04's scope):** `openRuntimeSession` should wait on
`.diff-workspace__editor` (the generic host Vue always renders, per `DiffWorkspace.vue`)
rather than the Monaco-internal `.monaco-diff-editor` class, or should wait for the file
tree's auto-selection to settle before asserting on either locator. This should be
scheduled as its own small fix-and-regression-check task; it must not be special-cased
around any Phase 17 scope.
