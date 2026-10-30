---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 13
subsystem: testing
tags: [playwright, e2e, uncommitted-review, frozen-snapshot, refresh, packaged-cli]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "CLI --staged/--unstaged/--worktree flags and launchUncommittedSession (14-09); App.vue/IdentityHeader/RefreshSummaryPanel Refresh wiring, 30s worktree-status poll, Alt+Shift+R, export gating (14-12)"
provides:
  - "tests/e2e/uncommitted-review.spec.ts: 4 Playwright tests covering the packaged-CLI --staged/--unstaged/--worktree launch path, frozen-snapshot display surviving a real external edit, Refresh button + Alt+Shift+R triggering a real server-side refresh verified independently via /api/worktree-status, RefreshSummaryPanel's D-15 summary and comment-reclassification count, and Export-section absence for uncommitted sessions"
  - "Empirically confirmed, documented gaps in prior-wave wiring (registerUncommittedRefreshKeypress's TTY requirement; performRefresh() not resyncing client-side comment status) that block two specific must_haves bullets from this plan's own frontmatter"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "startGeneratedUncommittedCli mirrors anchored-review.spec.ts's startGeneratedCli but spawns [executablePath, ...flags] (e.g. ['--staged']) and never sets CUMPA_LAUNCH_OPTIONS, since the non-interactive argv flags are this session kind's own D-02 launch mechanism"
    - "Direct authenticated fetch() to a session's own loopback API (Bearer token parsed from the #token= URL fragment, Host/Origin headers matching the CLI-published authority) independently verifies server-side state changes without trusting browser-rendered UI alone"

key-files:
  created: [tests/e2e/uncommitted-review.spec.ts]
  modified: []

key-decisions:
  - "RefreshSummaryPanel's heading omits zero-count categories (14-11's intentional 'truthful/omit-when-zero' design) rather than the literal 'N added, N removed, N modified' template text in 14-UI-SPEC.md's prose; the test asserts the real heading ('Since previous snapshot: 1 modified'), not the plan's literal string."
  - "Content-changing edits to an uncommitted snapshot's file reclassify affected comments to 'orphaned', not 'stale': capabilities.ts's uncommitted verifyAnchor looks up the anchor's file by exact (path, blobOid) match, and any byte change produces a new blobOid, so the lookup itself fails before verifyDurableAnchor's own stale/verified comparison ever runs. The test asserts 'orphaned' (the real, confirmed outcome) instead of the plan's assumed 'stale'."
  - "The terminal 'r'-keypress refresh trigger (D-13) could not be proven end-to-end: registerUncommittedRefreshKeypress (src/cli/run.ts) only registers its stdin handler when process.stdin.isTTY === true, which a child_process spawned with piped stdio never satisfies (confirmed empirically against the real packaged CLI). Per this plan's explicit scope boundary (files_modified: tests/e2e/uncommitted-review.spec.ts only), src/cli/run.ts was not modified. The test documents and pins this confirmed real behavior instead of asserting an unreachable one; Alt+Shift+R (the browser-side D-13 trigger) is fully proven in its place, independently verified via a direct /api/worktree-status request."
  - "StaleAnchorNotice does not become visible after a Refresh: performRefresh() (src/web/App.vue) calls sessionClient.refreshWorktreeSnapshot() and sets refreshSummary.value, but never calls workspace.replaceComments(...) or re-fetches /api/draft, so individual WorkspaceComment.status values (and hasUnverifiedAnchors) never update client-side even though the server-side reclassification is correct and its counts are delivered directly in the POST /api/refresh response body (confirmed: RefreshSummaryPanel shows '1 comment now orphaned' correctly). src/web/App.vue is outside this plan's files_modified scope, so this was documented rather than fixed."

patterns-established: []

requirements-completed: [WTREE-01, WTREE-02, SNAP-01, SNAP-03, SNAP-04]

# Metrics
duration: 70min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 13: Uncommitted Review End-to-End Proof Summary

**Four Playwright tests drive the packaged `cumpa` binary with real `--staged`/`--unstaged`/`--worktree` flags and a real Chromium session, proving the frozen-snapshot/Refresh/reclassification/export-gating chain end to end — while also empirically confirming and documenting two real gaps in prior-wave wiring (the terminal `r`-keypress's TTY requirement, and `performRefresh()`'s missing client-side comment-status resync) that this plan's scope does not permit fixing.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 2
- **Files modified:** 1 (new)

## Accomplishments

- `tests/e2e/uncommitted-review.spec.ts` created with the same packaging setup (`scripts/pack-runtime.mjs` → `scripts/verify-production-artifacts.mjs` → extract → symlink `node_modules` → fake `open` binary) as `anchored-review.spec.ts`, plus a new `startGeneratedUncommittedCli` helper that spawns `[executablePath, ...flags]` and never sets `CUMPA_LAUNCH_OPTIONS`.
- Test 1 proves: `cumpa --staged` launches a frozen snapshot of a newly staged file; a real external edit (re-staged, since `--staged` reviews `HEAD→index` via `git diff --cached`) does not change what the already-open editor shows; clicking `Refresh snapshot` triggers a real server-side refresh producing the D-15 summary (`Since previous snapshot: 1 modified`, `Modified` section listing `src/added.ts`) and the panel's own `1 comment now orphaned` count.
- Test 2 proves: `cumpa --unstaged` shows the fixed `Index` Base label with no OID; `cumpa --worktree` surfaces a brand-new untracked file as a single-pane `Added · Head only` file (D-05/D-07).
- Test 3 proves: the Export/Finish-review control is entirely absent (count `0` for both `Export review` and `Export review again` button roles) inside the Review notes dialog for an uncommitted session.
- Test 4 proves: `Alt+Shift+R` triggers the same real server-side refresh as the Refresh button, independently verified via a direct authenticated `fetch` to the session's own `/api/worktree-status` (Bearer token from the URL fragment); also documents, with a passing assertion pinning today's confirmed behavior, that the terminal `r` keypress has no effect through a piped (non-TTY) child stdin.

## Task Commits

1. **Task 1: Packaging setup, CLI-flag launch, frozen display surviving an external edit, Refresh, RefreshSummaryPanel, comment reclassification** - `60ad782` (test)
2. **Task 2: Unstaged no-Base, Worktree untracked-as-added, Export-section gating, Alt+Shift+R, and terminal 'r'-keypress refresh** - `8b765dc` (test)

## Files Created/Modified

- `tests/e2e/uncommitted-review.spec.ts` - 4 Playwright tests (405 lines) covering the full Phase 14 browser-observable contract through the packaged CLI.

## Decisions Made

See `key-decisions` in frontmatter: (1) corrected the Refresh-summary heading assertion to match 14-11's real, intentionally-truthful zero-omitting template rather than the plan's literal prose string; (2) corrected the comment-reclassification outcome to `orphaned` (the real, confirmed state for any content-changing edit, given the exact-`(path, blobOid)` anchor lookup) rather than the plan's assumed `stale`; (3) re-staged every external edit in `--staged` scenarios, since `--staged` reads `git diff --cached` and a worktree-only write never changes the index; (4) documented rather than worked around the two confirmed prior-wave gaps below.

## Deviations from Plan

### Auto-fixed Issues (in-scope, within this plan's own file)

**1. [Rule 1 - Assertion accuracy] Corrected RefreshSummaryPanel heading text**
- **Found during:** Task 1, first full test run
- **Issue:** The plan's action text (and 14-UI-SPEC.md's literal D-15 template prose) expected `'Since previous snapshot: 0 added, 0 removed, 1 modified'`. The real, shipped `RefreshSummaryPanel.vue` (`headingText` computed, built and explicitly documented in 14-11-SUMMARY.md as "mirroring the project's existing truthful/omit-when-zero copy voice") filters zero-count categories out entirely, producing `'Since previous snapshot: 1 modified'`.
- **Fix:** Asserted the real heading text; this is not a product defect, 14-11 intentionally chose this wording.
- **Files modified:** `tests/e2e/uncommitted-review.spec.ts` only.
- **Verification:** `npx playwright test tests/e2e/uncommitted-review.spec.ts -g "launches a frozen snapshot"` passes.
- **Committed in:** `60ad782`.

**2. [Rule 1 - Test-design correctness] Re-staged external edits for `--staged` scenarios**
- **Found during:** Task 1, first full test run (Refresh produced an empty delta, no summary panel opened)
- **Issue:** `--staged` reviews `HEAD→index` via `git diff --cached` (confirmed in `src/git/worktree-content.ts:111`). The plan's literal action text calls only `fixture.write(...)` for the "external edit," which modifies the working tree, not the index — so a Staged-scope Refresh correctly sees zero change, since nothing was re-staged.
- **Fix:** Added `fixture.git(['add', 'src/added.ts'])` after each external `fixture.write(...)` in every `--staged` test scenario (Task 1's test and Task 2's Alt+Shift+R test).
- **Files modified:** `tests/e2e/uncommitted-review.spec.ts` only.
- **Verification:** Refresh now produces a real, non-empty delta; `npx playwright test tests/e2e/uncommitted-review.spec.ts` passes in full.
- **Committed in:** `60ad782`, `8b765dc`.

### Documented Gaps (out of this plan's `files_modified` scope — reported for phase verification, not fixed)

**3. [Confirmed real gap] Terminal `r`-keypress refresh is untestable via piped child_process stdio**
- **Found during:** Task 2, writing the terminal-keypress test
- **Issue:** `registerUncommittedRefreshKeypress` (`src/cli/run.ts:549-594`, built in 14-09) returns a no-op immediately whenever `process.stdin.isTTY !== true`. A Node `child_process.spawn` with `stdio: [..., 'pipe', ...]` — the only stdin-writing mechanism available to a Playwright/Node e2e harness without adding a pty dependency — never produces a TTY stdin for the child. This was verified empirically against the real packaged CLI (built via `npm run build:runtime`, spawned directly with piped stdio): writing `'r'` to the child's stdin after an external edit left `/api/worktree-status`'s `changed` flag at `true` indefinitely; the keypress handler never ran.
- **Why not fixed here:** This plan's `files_modified` frontmatter lists only `tests/e2e/uncommitted-review.spec.ts`. Decoupling the keypress handler from `process.stdin.isTTY` (or adding a sanctioned pty-emulation test harness, which would also require a package-legitimacy checkpoint per the executor's Rule 3 exclusion for new installs) requires touching `src/cli/run.ts`, which is outside this plan's scope. The delegating instructions for this plan explicitly direct documenting such discovered gaps rather than silently expanding scope.
- **What the test does instead:** `tests/e2e/uncommitted-review.spec.ts`'s fourth test fully proves the `Alt+Shift+R` browser-side D-13 trigger (real server-side refresh, independently verified via a direct authenticated `/api/worktree-status` fetch), and separately spawns with `stdin: 'pipe'`, writes `'r'` to `running.child.stdin`, and asserts the real, confirmed outcome (`worktree-status` stays `changed: true`) rather than an assertion this harness cannot actually satisfy.
- **Must-have affected:** This plan's own frontmatter bullet "An automated test proves pressing 'r' in the running CLI terminal triggers the same server-side refresh the browser's Refresh button triggers..." is **not satisfied** as literally worded. The browser-side half (`Alt+Shift+R`) is fully proven; the terminal-keypress half is not achievable without a change outside this plan's scope.
- **Remediation options for phase verification:** (a) change `registerUncommittedRefreshKeypress` to accept an injectable TTY-check (or honor a test-only env var) so it can be exercised over a pipe; or (b) add a vetted pty-wrapping test dependency and a real pty-backed spawn helper.

**4. [Confirmed real gap] `StaleAnchorNotice` never becomes visible after Refresh (client-side comment status does not resync)**
- **Found during:** Task 1, first full test run (RefreshSummaryPanel correctly showed `1 comment now orphaned`, but the `StaleAnchorNotice` heading never appeared)
- **Issue:** `performRefresh()` (`src/web/App.vue:1075-1091`, built in 14-12) calls `sessionClient.refreshWorktreeSnapshot()` and sets `refreshSummary.value` from the response, but never calls `workspace.replaceComments(...)` or re-fetches `/api/draft`. The server-side reclassification is genuinely correct (`capabilities.ts`'s uncommitted `refresh()` computes `staleCount`/`orphanedCount` via the unmodified `verifyDurableAnchor()` machinery and returns them in the `POST /api/refresh` response, which the `RefreshSummaryPanel` renders correctly), but the individual `WorkspaceComment.status` values held in client-side reactive state are set once (at comment-creation time) and never updated afterward except by the unrelated `reloadLatestReview()` (conflict-resolution) path. `hasUnverifiedAnchors` (and therefore `StaleAnchorNotice`'s visibility) reads exactly those stale client-side `status` values, so it never turns `true` purely from a Refresh.
- **Why not fixed here:** Fixing this requires `performRefresh()` to also call `workspace.replaceComments(...)` (or equivalent) with freshly reconciled comment data — a change to `src/web/App.vue`, which is outside this plan's `files_modified: [tests/e2e/uncommitted-review.spec.ts]` scope. This mirrors the exact class of gap 14-12's own executor flagged and deferred (the `recentlyChanged` tree-row marker wiring), for the same reason: the fix belongs to a file this plan is not authorized to touch.
- **What the test does instead:** Asserts the panel's own count (`'1 comment now orphaned'`, visible and correct) and explicitly asserts `StaleAnchorNotice`'s heading has count `0` after Refresh, with an inline comment documenting why, rather than asserting an outcome the current implementation cannot produce.
- **Must-have affected:** This plan's own frontmatter bullet requiring the "pre-existing StaleAnchorNotice banner becoming visible" alongside the panel's own stale/orphaned count is **not satisfied**. Only the panel-count half is achieved.
- **Remediation options for phase verification:** Have `performRefresh()` call `workspace.replaceComments(reconciledWorkspaceComments(...))` (or re-fetch `/api/draft`) immediately after a successful `refreshWorktreeSnapshot()`, mirroring the pattern already used in `reloadLatestReview()`.

**5. [Documentation/prose accuracy, not a functional defect] Reclassification outcome is `orphaned`, not `stale`, for any content-changing edit**
- **Found during:** Task 1
- **Issue:** `capabilities.ts`'s uncommitted `verifyAnchor` looks up the anchor's current file by an exact `(path, blobOid)` match before ever calling `verifyDurableAnchor()`. Any byte change to a file produces a new `blobOid`, so that lookup fails and the comment is classified `orphaned` (`reason: 'anchor-unavailable'`) — `verifyDurableAnchor()`'s own `'stale'` branch is never reached for this scenario, since it requires the *same* `blobOid` on both sides. 14-CONTEXT.md's D-16 and this plan's own prose assume a straightforward content edit produces `'stale'`; the real state machine produces `'orphaned'` instead. Both are legitimate, pre-existing states (D-16 explicitly names "stale/orphaned" together, "no new comment states"), so this is not a bug — it is a mismatch between planning-time prose and the actual, correct implementation.
- **Fix:** None needed in product code; the test was written to match the real, confirmed behavior.

---

**Total deviations:** 2 auto-fixed (test-file-only), 3 documented out-of-scope findings (2 confirmed real gaps in prior-wave wiring affecting 2 specific must_haves bullets, 1 prose-accuracy note).
**Impact on plan:** All 4 tests specified by this plan's two tasks pass, proving every achievable part of Phase 14's browser-observable contract (WTREE-01, WTREE-02, SNAP-01, SNAP-03, SNAP-04 fully; SNAP-05's server-side machinery is proven via the panel's own orphaned-count, but its client-side UI surfacing is not, per gap #4 above). No scope was silently narrowed: every divergence from the plan's literal text is called out above with its exact cause and the file that would need to change to close it.

## Issues Encountered

- See "Documented Gaps" above (items 3 and 4) — both are genuine, empirically confirmed implementation gaps in plans 14-09 and 14-12 respectively, discovered while writing this plan's e2e coverage, and left unfixed per this plan's explicit scope boundary (`files_modified: [tests/e2e/uncommitted-review.spec.ts]`) and the delegating instructions for this run.
- No authentication gates encountered.
- No flaky behavior observed across 3 repeated full-suite runs during development.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14's entire browser-observable contract is now proven end to end through the packaged CLI for everything the current implementation actually supports: non-interactive `--staged`/`--unstaged`/`--worktree` launch, frozen-snapshot display surviving a real external edit, the Refresh button and `Alt+Shift+R` both driving a real server-side refresh (independently verified via direct API calls), the `RefreshSummaryPanel`'s D-15 summary and reclassification count, Unstaged's no-Base-OID identity header, Worktree's untracked-as-added rule, and Export-section absence.
- Two confirmed, documented gaps remain for whoever closes out phase verification: (1) `registerUncommittedRefreshKeypress`'s TTY requirement makes the terminal `r`-keypress refresh unverifiable by any piped-stdio e2e harness — needs a `src/cli/run.ts` change or a new pty test dependency; (2) `performRefresh()` never resyncs client-side comment status after a Refresh, so `StaleAnchorNotice` never reflects real reclassification — needs a `src/web/App.vue` change analogous to the existing `reloadLatestReview()` pattern. Both are outside every prior plan's and this plan's `files_modified` scope, and both were flagged (not silently worked around) in the relevant executors' summaries (14-12's own summary flagged an adjacent gap in the same area, the `recentlyChanged` tree-row marker).
- This is the final plan in Phase 14 (Wave 6); the phase is otherwise functionally complete.

## Self-Check: PASSED

- `tests/e2e/uncommitted-review.spec.ts` — FOUND, contains `function startGeneratedUncommittedCli` and `RefreshSummaryPanel`-relevant assertions (`Since previous snapshot`).
- Commit `60ad782` — FOUND in `git log --oneline`.
- Commit `8b765dc` — FOUND in `git log --oneline`.
- `npm run build:web && npx playwright test tests/e2e/uncommitted-review.spec.ts` — 4 passed, 0 failed (ran 3 times during development, stable).
- `grep -c '\.fixme(' tests/e2e/uncommitted-review.spec.ts` → `0`; `grep -c '\.skip(' tests/e2e/uncommitted-review.spec.ts` → `0`.
- `grep -c "CUMPA_LAUNCH_OPTIONS" tests/e2e/uncommitted-review.spec.ts` → `0`.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*
