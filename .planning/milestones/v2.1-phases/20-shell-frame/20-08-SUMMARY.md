---
phase: 20-shell-frame
plan: 08
subsystem: testing
tags: [playwright, e2e, workbench-shell, session-kinds, packaged-binary]

requires:
  - phase: 20-shell-frame
    provides: "20-07's App.vue rewrite around WorkbenchShell/TitleBar/StatusBar/BottomPanel"
provides:
  - "tests/e2e/workbench-shell-smoke.spec.ts: one packaged-binary Playwright test case per session kind (committed branch/worktree, Staged/Unstaged/Working tree, standalone, exact patch, agent-attached)"
  - "SHELL-05 satisfied: every capability (title-bar identity variant, Refresh visibility, status-bar Export-item presence/emphasis) proven across all five session kinds against the real packaged dist/bin/loopnote.mjs binary"
affects: [20-09, shell-frame-verification]

tech-stack:
  added: []
  patterns:
    - "Single packagedRoot (npm run build + npm pack --ignore-scripts + tar -xzf dist/bin/loopnote.mjs), reused across all five test cases in one file rather than per-file packaging"
    - "One parameterized spawnCli() helper covering the three real CLI launch shapes (LAUNCH_OPTIONS env var for the interactive committed picker, positional CLI flags/paths for uncommitted/standalone, JSON review-request piped over stdin for exact-patch and agent-attached)"

key-files:
  created:
    - tests/e2e/workbench-shell-smoke.spec.ts
  modified: []

key-decisions:
  - "Exact-patch and agent-attached fixtures reuse the plain npm-pack/stdin-request mechanism already proven in pinned-session.spec.ts's 'generated range request' test, not agent-ready-export.spec.ts's heavier custody-gated/resolveAcceptanceRuntime harness — confirmed by reading src/cli/run.ts and src/server/capabilities.ts directly that every non-interactive stdin review-request always wires attachedCompletion server-side, making a plain `mode: 'revisions'` request the minimal fixture for the agent-attached kind."
  - "The agent-attached test case does NOT require registration into playwright.runtime-artifact.config.ts's custodyGatedSpecs list; it passes under the ordinary `npx playwright test` runner alongside the other four cases."
  - "Dropped the plan's suggested 'exact patches cannot refresh' panel-copy assertion: read TitleBar.vue's current markup directly and confirmed no such string exists (showRefresh=false simply omits the Refresh button entirely, no fallback text) — asserted the button's absence instead of inventing copy that isn't in the component."

requirements-completed: [SHELL-05]

duration: 25min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 08: Workbench Shell Smoke Spec Summary

**New `tests/e2e/workbench-shell-smoke.spec.ts` with 5 packaged-binary Playwright cases (committed, uncommitted, standalone, exact-patch, agent-attached), each proving the 20-07 shell rewrite kept its title-bar identity, Refresh-visibility, and status-bar Export-emphasis contract per session kind.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files modified:** 1 (new file)

## Accomplishments

- One shared packaged-binary fixture (`npm run build` + `npm pack --ignore-scripts` + `tar -xzf` extracting `dist/bin/loopnote.mjs`) reused across all five session-kind test cases.
- One parameterized `spawnCli()` helper covering the three real CLI launch shapes read directly from `src/cli/run.ts`'s `.action()` handler: the interactive `LAUNCH_OPTIONS` env var (committed branch/worktree), positional CLI flags/paths (`--staged`/`--unstaged`/`--worktree`/standalone paths), and a JSON `review-request` piped over stdin (exact patch, agent-attached).
- Five `test(...)` cases, each asserting the five-region `WorkbenchShell.vue` host is present (`.workbench-shell`, `.titlebar`, `.workbench-shell__sidebar`, `.workbench-shell__editor`, `.statusbar`) plus the three kind-specific contracts:
  - **Committed branch/worktree:** `Base fixture · <sha>` → `Head fixture · <sha>` identity, `Pinned comparison` pin-cue, Refresh absent, Export present+emphasized.
  - **Staged/Unstaged/Working tree:** `Repository object · <oid>` → `Working tree · snapshot <digest>` identity, `Frozen snapshot` pin-cue, Refresh present, Export present but not emphasized (and the panel's `ExportSection` is entirely absent when opened).
  - **Standalone:** `STANDALONE` / `Standalone review · 1 files · snapshot <digest>` identity, Refresh present (standalone still carries an `uncommitted` key), Export present+emphasized, panel's `Export review` button visible.
  - **Exact patch:** `PREIMAGE Repository object` → `POSTIMAGE Implemented content` identity (built from a real `git diff --no-ext-diff --no-textconv --binary --full-index` payload piped as a `mode: 'patch'` request), `Frozen patch` pin-cue, Refresh absent, Export present+emphasized.
  - **Agent-attached:** `TitleBar.vue`'s `.attached-fact` overlay text (`Agent attached · waiting for Finish review`) and the `BottomPanel.vue` attached-completion block's `Finish review` button, enabled once `attachedFinishReady` is true.

## Task Commits

1. **Task 1: workbench-shell-smoke.spec.ts — committed, uncommitted, standalone, exact-patch kinds** — `0b3f801` (test)
2. **Task 2: Agent-attached test case** — `a3e0523` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `tests/e2e/workbench-shell-smoke.spec.ts` — new file, 5 packaged-binary Playwright test cases, one per session kind.

## Decisions Made

- Reused the plain `npm pack`/stdin-JSON-request mechanism (already proven non-custody-gated in `pinned-session.spec.ts`) for both the exact-patch and agent-attached fixtures, instead of `agent-ready-export.spec.ts`'s heavier `resolveAcceptanceRuntime()`/evidence-publishing harness. Verified by reading `src/cli/run.ts:977-1294` (`runOrdinaryAction` → `launchAttachedSession`) and `src/server/capabilities.ts:426` that `attachedCompletion` — and therefore `session.attached = {kind:'agent-review'}` — is wired for *every* non-interactive stdin request regardless of mode (`revisions`/`uncommitted`/`files`/`patch`), not only inside the custody-gated harness. This makes a minimal `mode: 'revisions'` stdin request the correct, smallest fixture for the "agent-attached" kind, and the file needed no registration into `playwright.runtime-artifact.config.ts`'s `custodyGatedSpecs`.
- Asserted the status bar's Export item via its CSS class (`statusbar__item--emphasis`) rather than text, since `StatusBar.vue` always renders the same "Export" label regardless of `exportSupported` — only the emphasis class is gated by it.
- Did not assert any "exact patches cannot refresh" copy for the exact-patch case: read `TitleBar.vue`'s current template directly and confirmed `showRefresh=false` simply omits the Refresh button with no fallback text anywhere in the component (the plan's reference to `workbench-shell.md:32`'s copy does not match the as-shipped 20-03/20-07 markup). Asserted absence of the button instead of inventing copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `exact:true` text-locator mismatch for the uncommitted "Repository object" assertion**
- **Found during:** Task 1, first full test run
- **Issue:** `TitleBar.vue`'s uncommitted-kind BASE span renders `{{ baseCandidateLabel }} · {{ baseCandidateOid }}` as one combined text node (`"Repository object · 72d5be0"`), unlike the exact-patch kind's standalone `"Repository object"` span. `banner.getByText('Repository object', { exact: true })` therefore failed to match for the uncommitted (worktree) case, since the element's full text includes the trailing `· <oid>`.
- **Fix:** Changed the assertion to a regex match (`/Repository object · [0-9a-f]{7}/`), matching the same non-exact substring pattern already used for the committed case's `Base fixture · <sha>` assertion.
- **Files modified:** `tests/e2e/workbench-shell-smoke.spec.ts`
- **Verification:** Re-ran `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts`; all 5 cases pass.
- **Committed in:** `0b3f801` (Task 1 commit; fixed before the task's commit landed, so no separate fix commit was needed)

**2. [Style] Removed one-line wrapper functions flagged by the `ts-no-tiny-functions` rule**
- **Found during:** Initial `write` of the spec file
- **Issue:** `startCommittedCli`/`startUncommittedCli`/`startStandaloneCli`/`startRequestCli`/`statusBarExportItem`/`independentlyResolve` were pure single-expression renames around `spawnCli()`/locator construction/`git rev-parse`, each called only once or twice — not meeting the rule's 3+-call-site or domain-concept exceptions.
- **Fix:** Inlined all six directly into their call sites; kept `spawnCli()` itself (5 call sites, genuinely shared launch plumbing) and the multi-statement helper functions (`assertShellRegionsPresent`, `assertExportEmphasized`, `openPanel`, `waitForLoopbackUrl`, `stopGeneratedCli`, `runPrerequisite`) as-is.
- **Files modified:** `tests/e2e/workbench-shell-smoke.spec.ts`
- **Verification:** `npm run typecheck:web` clean; all 5 Playwright cases still pass.
- **Committed in:** `0b3f801`/`a3e0523` (both commits already reflect the inlined form)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 style). **Impact on plan:** Both fixes necessary for correctness/compliance; no scope creep — the spec file still covers exactly the five session kinds and three assertions the plan specifies.

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None.

## Verification

- `npm run typecheck:web` — zero errors (pre-existing, unrelated `tests/unit/monaco-diff-adapter.test.ts` errors surfaced only by the separate `typecheck:tests` script, out of this plan's scope).
- `npm run build` — succeeded, produced `dist/bin/loopnote.mjs`.
- `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` — **5/5 passed** (all five session-kind cases, including agent-attached, under the ordinary non-custody-gated runner).

## Self-Check: PASSED

- `FOUND: tests/e2e/workbench-shell-smoke.spec.ts`
- `FOUND: 0b3f801` (Task 1 commit)
- `FOUND: a3e0523` (Task 2 commit)

## Next Phase Readiness

SHELL-05 and ROADMAP Phase 20 Success Criterion 4 are satisfied. This plan ran zero-overlap with sibling plan 20-09 (which repairs the six specs broken by 20-07's App.vue rewrite: `pinned-session.spec.ts`, `responsive-session.spec.ts`, `support-dialog.spec.ts`, `agent-ready-export-safety.spec.ts`, `anchored-workspace.spec.ts`, `selector-drift-ui.spec.ts`) — this plan deliberately avoided reusing any of `pinned-session.spec.ts`'s now-broken UI-assertion patterns, grounding every locator directly in the current `TitleBar.vue`/`StatusBar.vue`/`BottomPanel.vue`/`WorkbenchShell.vue` source instead.

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
