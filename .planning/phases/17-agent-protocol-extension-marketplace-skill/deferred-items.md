# Deferred items — Phase 17

## 17-04: pre-existing `.monaco-diff-editor` auto-selection race in `tests/helpers/open-runtime-session.ts` — RESOLVED by quick task 261031-q09

**Found during:** Plan 17-04, Task 2 GREEN verification (`npm run test:runtime-artifact -- tests/e2e/agent-ready-export.spec.ts`).

**Symptom:** `openRuntimeSession()` (`tests/helpers/open-runtime-session.ts:26`) asserted
`page.locator('.monaco-diff-editor')` visible immediately after `page.goto()`. When the
browser session's first auto-selected file in the changed-files tree is a single-pane
file (added/deleted-only, or in `DiffWorkspace.vue` terms any file with `singlePaneSide`
set), the page renders through `createMonacoSinglePaneAdapter` instead of
`createMonacoDiffAdapter`, so no `.monaco-diff-editor` element ever appears and the
assertion times out and fails (even though the page loaded correctly — Playwright's
accessibility snapshot captured on failure shows the file tree, selected file, and a
working `textbox` region, i.e. the app functioning as designed).

**Scope reproduction:** Confirmed via `git show 0a92585:tests/e2e/agent-ready-export.spec.ts`
(the file's exact content immediately before Plan 17-04 touched it) swapped back into
`tests/e2e/agent-ready-export.spec.ts`, built against the packed current (17-04) source
tree, and run against the `'attached review blocks Finish while inline composer has
unsaved text'` and `'attached range review stays silent until Finish...'` scenarios in
isolation — both pre-existing, both failed identically. Plan 17-04 did not modify
`tests/helpers/open-runtime-session.ts`, `src/web/**`, or any file-ordering/selection
logic, so this was not caused by 17-04's dispatch changes.

**Resolution (quick task `261031-q09`, 2026-10-31):** Applied the proposed fix below,
plus one newly-exposed sibling bug in the same target file. `tests/helpers/open-runtime-session.ts:26`
and the inline duplicate at `tests/e2e/package-assets.spec.ts:203` now assert
`.diff-workspace__editor` instead of `.monaco-diff-editor`. Full custody-gated suite
(`npm run test:runtime-artifact`) went from 6/16 to 15/16 passing, deterministically
across 3 runs. See `.planning/quick/261031-q09-fix-open-runtime-session-helper-stale-mo/`
for the full root-cause audit, fix, and verification evidence.

**Proposed fix (as originally written, now applied):** `openRuntimeSession` should wait on
`.diff-workspace__editor` (the generic host Vue always renders, per `DiffWorkspace.vue`)
rather than the Monaco-internal `.monaco-diff-editor` class.

## New findings from quick task 261031-q09 (not fixed, follow-up candidates)

### 1. `/staged-20\.txt/` regex collision in `tests/e2e/agent-ready-export.spec.ts` — FIXED

Once the assertion above no longer masked every positive scenario, the `'installed
uncommitted review resolves worktree changes...'` test (line 898) reached far enough to
expose a second, independent bug written in the same Plan 17-04: its
`addSinglePaneComment(page, /staged-20\.txt/, ...)` call (line 916) strict-mode-matched
**two** tree rows (`dirty/staged-20.txt` and `dirty/unstaged-20.txt`, since the latter
contains the former as a substring). Fixed in the same quick task by anchoring on the
path separator: `/\/staged-20\.txt/`.

### 2. Full-suite-only flake in `'installed agent request rejects an oversized uncommitted request'` — NOT FIXED, candidate for a narrow follow-up

`tests/e2e/agent-ready-export.spec.ts:1157` is a pure CLI stdin/stdout negative test (no
browser page interaction at all). It reproduces identically in the pre-fix baseline, so
it predates and is unrelated to the `.monaco-diff-editor` bug. It passes cleanly and
deterministically every time it is run alone or paired with just its immediate
predecessor, but fails (`write EPIPE` plus an empty-string read where
`'exceeds 1048576 bytes'` is expected) when run as the last test in the full 16-test
sequential file (`workers: 1`, `fullyParallel: false`). Likely cause:
`waitForAttachedRejectionWithoutLoopbackUrl` (`agent-ready-export.spec.ts:218`) reads the
CLI's stderr file the instant it observes `child.exitCode !== null`, which can race the
OS flush of the child's final write under the cumulative system load of 14 preceding
Chromium-driven scenarios. `17-04-SUMMARY.md` already independently characterized this
exact test's full-suite failures as a "cosmetic afterAll-hook attribution artifact" before
this quick task began; this task's isolated/paired runs are consistent with and extend
that finding. A defensive fix (e.g. one more delayed re-read of the stderr file after
exit is first observed) is plausible but was not applied here, since it is unrelated to
quick task 261031-q09's named scope.

