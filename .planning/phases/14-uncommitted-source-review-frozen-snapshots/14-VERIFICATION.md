---
phase: 14-uncommitted-source-review-frozen-snapshots
verified: 2026-10-30T23:40:00Z
status: gaps_found
score: 8/12 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "After Refresh, the user sees every existing comment reclassified as current/stale/orphaned (SNAP-05, Roadmap SC5)"
    status: failed
    reason: "Server-side reclassification is correct (POST /api/refresh computes accurate staleCount/orphanedCount, visibly correct inside RefreshSummaryPanel — e2e-proven: '1 comment now orphaned'), but performRefresh() in src/web/App.vue never calls workspace.replaceComments(...) or re-fetches /api/draft after a successful refresh. workspaceComments (the single source driving hasUnverifiedAnchors, StaleAnchorNotice, and any per-comment status badge) is never updated, so the individual comment's visible status stays stale/wrong until an unrelated full page reload. tests/e2e/uncommitted-review.spec.ts's own first test asserts StaleAnchorNotice's heading count stays 0 after Refresh, with an inline comment documenting this is the current (broken) behavior, not the intended one."
    artifacts:
      - path: "src/web/App.vue"
        issue: "performRefresh() (lines 1075-1091) sets refreshSummary.value from the refresh response but never resynchronizes workspaceComments/workspace store state, so comment.status for every comment stays whatever it was before Refresh"
    missing:
      - "performRefresh() must call workspace.replaceComments(...) or re-fetch /api/draft immediately after a successful refreshWorktreeSnapshot(), mirroring the pattern already used by reloadLatestReview()"
  - truth: "A file in the most recent Refresh's added/removed/modified sets shows a 'Changed' tree-row marker until opened (D-15)"
    status: failed
    reason: "FileRow.vue's recentlyChanged prop and tree-row__refresh-marker span were built in 14-11, but no caller ever passes recentlyChanged=true. grep across src/web for 'recentlyChanged' finds only FileRow.vue's own prop declaration/template use — App.vue never threads the post-Refresh added/removed/modified path sets into the live file tree. 14-12's own summary documents this explicitly: 'FileRow.vue's recentlyChanged prop (14-11) not wired from App.vue's refresh delta.'"
    artifacts:
      - path: "src/web/App.vue"
        issue: "No code threads refreshSummary's added/removed/modified path sets into the file-tree's FileRow instances (the tree mounts through a Teleport target owned by a component outside 14-12's files_modified scope)"
    missing:
      - "Wire the most-recent-refresh path sets into the file tree's FileRow recentlyChanged prop, clearing a path from the set when that file becomes the active/selected file"
  - truth: "A different-digest relaunch offers draft recovery through the existing draft-recovery flow, and accepting creates a new draft with comments copied and reclassified (D-19, WTREE-05 interpretation)"
    status: failed
    reason: "launchUncommittedSession (src/cli/run.ts:691-700) calls findUncommittedDraftCandidate and, if a candidate exists, only prints a CLI console line: 'A previous uncommitted review draft exists for this source. Cumpa will offer to resume it if the reviewed content has changed.' The recoveryCandidate value is never passed to createApp, never surfaces in the browser, and no code path ever copies comments from the old draft into a new one. The printed message is itself misleading: it promises an offer that never happens. The core WTREE-05 guarantee ('never share or overwrite a draft') still holds structurally via uncommittedReviewKey's content-digest keying, but D-19's explicit 'offer recovery … accepting creates a new draft … with comments copied and reclassified' UX was never built for uncommitted sessions (DraftRecovery.vue is never invoked from this path)."
    artifacts:
      - path: "src/cli/run.ts"
        issue: "recoveryCandidate (lines 691-700) is used only to print a console notice; it is discarded after that and never reaches the browser session or a comment-copying flow"
    missing:
      - "Thread the recovery candidate into the browser session (new server-side signal/endpoint) and invoke the existing DraftRecovery.vue confirm-dialog UX, with an accept path that creates a new draft keyed to the new digest and copies/reclassifies the old draft's comments, per D-19's literal wording"
      - "Alternatively, correct the misleading CLI console message to state the real (non-existent) behavior, or remove it, until the feature is built"
behavior_unverified_items:
  - truth: "Pressing 'r' in the running CLI terminal triggers the same server-side refresh the browser's Refresh button triggers (D-13)"
    test: "Launch an uncommitted session attached to a real TTY (not piped stdin), edit a tracked staged file externally, press 'r' in that terminal, and confirm GET /api/worktree-status transitions to changed: false (i.e. the refresh actually ran)."
    expected: "The terminal keypress POSTs /api/refresh exactly as the browser's Refresh button does, and the snapshot chain advances."
    why_human: "registerUncommittedRefreshKeypress (src/cli/run.ts:549-594) gates its entire stdin handler behind `if (stdin.isTTY !== true) { return () => undefined; }` — confirmed directly in source. No Playwright/Node child_process harness can supply a real TTY to a piped child, so this cannot be proven by any automated e2e test (14-13's own e2e suite documents this exact limitation and tests the browser-side Alt+Shift+R trigger instead, independently verified via a direct /api/worktree-status fetch). The isTTY-gated code path itself (fetch to /api/refresh on 'r') is logically identical to the Alt+Shift+R path once invoked, so it is plausible this works correctly on a real terminal — but that has not been exercised by any test, automated or documented manual run."
human_verification:
  - test: "Attach cumpa --staged to a real interactive terminal (not piped), externally edit a staged file, press 'r', and confirm the terminal prints 'Refreshed the uncommitted session snapshot.' and the open browser tab's RefreshSummaryPanel/worktree-status reflects the new snapshot."
    expected: "Terminal 'r' keypress produces the same observable refresh effect as clicking the browser's Refresh button or pressing Alt+Shift+R."
    why_human: "Blocked behind `stdin.isTTY === true`; no automated harness in this repository can supply a real TTY to a spawned child process."
---

# Phase 14: Uncommitted Source Review & Frozen Snapshots Verification Report

**Phase Goal:** Developers can review Staged, Unstaged, or Working-tree changes against HEAD or any chosen base from a frozen snapshot, trust that drafts and comments stay correctly scoped to the exact reviewed content, and explicitly refresh to a new snapshot with every comment reclassified.
**Verified:** 2026-10-30T23:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WTREE-01/WTREE-02 — User picks Staged/Unstaged/Working tree as Head source; Working-tree untracked files appear as added, honoring `.gitignore`/`.git/info/exclude`/global excludes (Roadmap SC1) | ✓ VERIFIED | `src/cli/picker.ts`'s `Uncommitted` group + `pickSource()` (14-06, tests pass); `src/cli/run.ts`'s `--staged`/`--unstaged`/`--worktree` flags (14-09); `src/git/worktree-inventory.ts`'s `git ls-files --others --exclude-standard` union for Working-tree untracked files, reported `status.kind === 'added'` (14-04, fixture-verified); e2e test confirms untracked file renders as single-pane `Added · Head only`. |
| 2 | WTREE-04 — `.cumpa/` content, symlink targets, submodule internals, binary/oversized files never shown as reviewable (Roadmap SC1) | ✓ VERIFIED | `worktree-inventory.ts` calls `isCumpaInternalPath` on both tracked-diff paths and untracked `ls-files` output (confirmed via source grep); mode `160000`→`submodule`, mode `120000`→`symlink` unsupported reasons (`worktree-inventory.ts:249-254`); per-segment `lstat` symlink-escape defense (`classifyWorktreeSideAvailability`, mirroring `PatchSnapshot.worktreeEntry()`). |
| 3 | WTREE-03 — Staged/Working tree compare vs HEAD by default or any chosen local branch/worktree Base, computing merge-base; Unstaged is always index→worktree with Base prompt skipped and `--base` rejected (Roadmap SC2, D-05) | ✓ VERIFIED | `UncommittedScopeSchema`/`UncommittedDraftComparisonSchema` `superRefine` enforce D-05 structurally (14-02, 13 passing tests); picker's `pickSource()` skips the second prompt for Unstaged and preselects HEAD for Staged/Working tree (14-06); CLI's `validateUncommittedFlags` rejects `--base` + `--unstaged` with the exact UI-SPEC message (14-09); e2e test confirms `Index` (no OID) renders for Unstaged's BASE endpoint. |
| 4 | WTREE-05 — Two different working-tree states against the same base never share or overwrite a draft (Roadmap SC5) | ✓ VERIFIED | `uncommittedReviewKey(sourceKind, baseCommitOid, firstSnapshotDigest)` (14-03) hashes the first snapshot's content digest into the draft-identity key by construction — different content, structurally different key, not a runtime guard; 10 passing unit tests cover determinism and non-collision cases. |
| 5 | SNAP-01 — Review stays frozen at launch-time bytes; later edits don't change the display (Roadmap SC3) | ✓ VERIFIED | `materializeWorktreeSnapshot`/`WorktreeSnapshot` (14-07) captures content once at session start; e2e test ("launches a frozen snapshot that survives an external edit") edits a staged file externally after launch and confirms the editor still shows the pre-edit content until Refresh is triggered. |
| 6 | SNAP-02 — User is told explicitly when a file changed during capture, never shown a mixed/partial version (Roadmap SC3, D-09/D-12) | ✓ VERIFIED | `captureFileWithRetry` (14-07): bounded stat-identity retry, `captureStatus: 'changed-during-capture'` on exhaustion, never a partial buffer (confirmed: no code path returns torn bytes); `FileRow.vue`'s `Changed during capture` availability marker (14-11) and `App.vue`'s dismissible session banner + non-reviewable-pane copy fix (14-12) surface it in the UI. |
| 7 | SNAP-03 — User can trigger Refresh to capture a new snapshot of the same source/scope (Roadmap SC4) | ✓ VERIFIED | `WorktreeSnapshot.refresh()` (14-07, chain-append, no deletion — `grep -c "rm(\|unlink(\|rmdir("` is 0); `POST /api/refresh` (14-08); `IdentityHeader`'s Refresh button + `Alt+Shift+R` both call `performRefresh()` (14-10/14-12); e2e test proves both the button-equivalent flow and `Alt+Shift+R` trigger a real server-side refresh. |
| 8 | SNAP-04 — After Refresh, user sees a summary of files added/removed/modified since the previous snapshot (Roadmap SC4) | ✓ VERIFIED (core panel) — see gap below for an unwired sub-behavior | `RefreshSummaryPanel.vue` (14-11) renders the exact D-15 heading/grouped-lists template; `App.vue` opens it automatically when the delta is non-empty (14-12); e2e test confirms `Since previous snapshot: …` text appears with the edited file listed under Modified. **Gap:** the companion per-tree-row `Changed` marker (also specified by D-15) is never wired — see Gaps below. |
| 9 | SNAP-05 — After Refresh, every existing comment is reclassified as current/stale/orphaned with evidence intact, never moved to a different line (Roadmap SC5) | ✗ FAILED (client-side half) | Server-side reclassification is correct and evidence-preserving (`capabilities.ts`'s uncommitted `refresh()` re-verifies every comment before/after via unmodified `verifyAnchor`/`verifyDurableAnchor`, counts delivered correctly in the `POST /api/refresh` response — e2e-confirmed `'1 comment now orphaned'` in the panel). But `performRefresh()` in `App.vue` never calls `workspace.replaceComments(...)` or re-fetches `/api/draft`, so `workspaceComments` (driving `hasUnverifiedAnchors`/`StaleAnchorNotice` and any per-comment badge) never updates — the individual comment's visible status stays wrong until an unrelated full reload. See Gaps below. |
| 10 | D-13 — Refresh has three entry points: toolbar button, keyboard shortcut, and `r` in the running CLI terminal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (terminal path only) | Toolbar button and `Alt+Shift+R` are both e2e-proven. The terminal `'r'`-keypress handler (`registerUncommittedRefreshKeypress`, `src/cli/run.ts:549-594`) is gated behind `stdin.isTTY !== true` → no-op, confirmed directly in source; no automated harness in this repo can supply a real TTY to a spawned child, so this specific entry point is present and logically correct but behaviorally unexercised by any test. Routed to Human Verification below. |
| 11 | D-15 — Post-Refresh summary panel **plus** text markers on changed tree rows until each file is opened | ✗ FAILED (marker half) | Panel half verified under truth #8. `FileRow.vue`'s `recentlyChanged` prop/`tree-row__refresh-marker` span exist (14-11) but no caller ever sets `recentlyChanged=true` — confirmed by grep: the only occurrences of `recentlyChanged` in `src/web` are `FileRow.vue`'s own prop declaration and template use. 14-12's own summary documents this as an explicit, acknowledged scope gap. |
| 12 | D-19 — A different-digest relaunch offers draft recovery through the existing flow; accepting creates a new draft with comments copied and reclassified | ✗ FAILED | `findUncommittedDraftCandidate` (14-08) is correctly implemented and called at launch (`src/cli/run.ts:691`), but its result is used only to print a CLI console notice (`'… Cumpa will offer to resume it if the reviewed content has changed.'`). The candidate is never passed into the browser session, `DraftRecovery.vue` is never invoked from this path, and no code copies/reclassifies comments from an old draft into a new one. The printed message is itself misleading — it promises an offer that never materializes. |

**Score:** 8/12 truths verified (1 present, behavior-unverified; 3 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/snapshot-fs.ts` | Shared file-IO primitives | ✓ VERIFIED | Exports `digest`/`frame`/`isMissing`/`syncDirectory`/`writeOwned`/`boundedFileBytes`/`MAX_SIDE_BYTES`; `patch-snapshot.ts` imports from it; exact-patch tests pass unchanged. |
| `UncommittedScopeSchema`, `UncommittedDraftComparisonSchema` | Zod contracts for scope + draft identity | ✓ VERIFIED | `src/contracts/comparison.ts`/`draft.ts`; D-05 enforced via `superRefine`; 13 tests pass. |
| `uncommittedReviewKey` | Draft-identity hash | ✓ VERIFIED | `src/domain/comparison-key.ts`; deterministic, disjoint domain; 10 tests pass. |
| `src/git/worktree-inventory.ts` | Staged/Unstaged/Working-tree file-set discovery | ✓ VERIFIED | `createWorktreeChangedFileInventory`, fixture-verified against real `git diff`/`git diff --cached`/`git ls-files`. |
| `src/git/worktree-content.ts` | CRLF-safe worktree content reconstruction | ✓ VERIFIED | `resolveWorktreeSideContent`, fixture-verified CRLF-no-op and CRLF-plus-one-edit cases; shares `blobOid()` with `exact-patch.ts`. |
| `src/cli/picker.ts` | Uncommitted picker group + `pickSource()` | ✓ VERIFIED | 17/17 tests pass; committed flow unchanged. |
| `src/server/worktree-snapshot.ts` | Frozen snapshot capture + `refresh()` | ✓ VERIFIED | Torn-retry, index-race guard, chain-append `refresh()`; 15 tests pass. |
| `src/server/app.ts`/`capabilities.ts`/`routes.ts` | Uncommitted session wiring, `/api/refresh`, `/api/worktree-status` | ✓ VERIFIED | 9 new + 20 extended tests pass; `exportReview`/`revealExportDirectory` genuinely absent (404-guarded) for uncommitted sessions. |
| `src/cli/run.ts` | CLI flags, `launchUncommittedSession`, terminal refresh keypress | ⚠️ PARTIAL | Flags/validation/launch fully verified; terminal keypress present but TTY-gated (see truth #10); D-19 recovery wiring incomplete (see truth #12). |
| `IdentityHeader.vue`, `UiIcon.vue` | Comparison strip, Refresh button, change indicator | ✓ VERIFIED | `npm run typecheck:web` clean; e2e-confirmed. |
| `InlineNotice.vue`, `FileRow.vue`, `RefreshSummaryPanel.vue` | Dismissible notices, availability/refresh markers, summary panel | ⚠️ PARTIAL | Built and typechecked correctly; `FileRow`'s `recentlyChanged` marker never wired from `App.vue` (see truth #11). |
| `src/web/App.vue` | Shell wiring: empty state, banner, polling, shortcuts, export gating, `performRefresh()` | ⚠️ PARTIAL | Empty state, banner, 30s poll, `Alt+Shift+R`, export gating all verified. `performRefresh()` never resyncs client-side comment status (see truth #9). |
| `tests/e2e/uncommitted-review.spec.ts` | End-to-end browser proof | ✓ VERIFIED | 4/4 tests pass (re-run during this verification); explicitly documents the two self-reported gaps (TTY refresh, comment-status resync) rather than silently passing over them. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/cli/picker.ts` | `src/cli/run.ts` | `pickSource()` → `PickedSource.kind` branch → `launchUncommittedSession` | WIRED | Confirmed via 14-09 source and passing selection tests. |
| `src/cli/run.ts` | `src/server/app.ts` | `launchUncommittedSession` → `createUncommittedSessionApp(scope, options)` | WIRED | Confirmed via grep + passing tests. |
| `src/web/App.vue` | `src/web/api/client.ts` | `performRefresh()` → `refreshWorktreeSnapshot()`; 30s poll → `getWorktreeStatus()` | WIRED | Confirmed via source read. |
| `src/web/App.vue` | `src/web/components/RefreshSummaryPanel.vue` | Mounted in `.shell-warning-stack`, opened automatically on non-empty delta | WIRED | Confirmed via source + e2e. |
| `src/web/App.vue` | `src/web/components/FileRow.vue` | Post-Refresh path sets → `recentlyChanged` prop | **NOT WIRED** | Confirmed by grep: no call site outside `FileRow.vue` itself sets `recentlyChanged`. |
| `src/web/App.vue` | `src/domain workspace store` (`replaceComments`) | Post-Refresh comment-status resync | **NOT WIRED** | Confirmed by source read of `performRefresh()` — no such call exists. |
| `src/cli/run.ts` | `src/web/components/DraftRecovery.vue` | D-19 relaunch recovery offer | **NOT WIRED** | `recoveryCandidate` reaches only `console`/CLI `output()`, never the browser session. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 14 unit/API/CLI test suites | `npx vitest run tests/unit/uncommitted-contracts.test.ts tests/unit/comparison-key.test.ts tests/git/worktree-inventory.test.ts tests/git/worktree-content.test.ts tests/api/worktree-snapshot.test.ts tests/api/uncommitted-session.test.ts tests/unit/draft-load.test.ts tests/cli/selection.test.ts tests/cli/errors.test.ts` | 9 files, 122 tests passed | ✓ PASS |
| Server typecheck | `npx tsc --noEmit --project tsconfig.json` | exit 0 | ✓ PASS |
| Web typecheck | `npm run typecheck:web` | exit 0 | ✓ PASS |
| Phase 14 end-to-end browser suite | `npm run build:web && npx playwright test tests/e2e/uncommitted-review.spec.ts` | 4/4 passed (including the title-level confirmation "…Refresh reclassifies a comment to orphaned") | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| WTREE-01 | 14-06, 14-09 | Staged/Unstaged/Working tree selectable at launch | ✓ Complete | Picker group + CLI flags, tested |
| WTREE-02 | 14-04 | Untracked files as added, honoring ignore rules | ✓ Complete | Fixture-verified inventory |
| WTREE-03 | 14-02, 14-06, 14-09 | Base selection rules incl. D-05 Unstaged exception | ✓ Complete | Schema + picker + CLI validation |
| WTREE-04 | 14-04 | `.cumpa/`, symlink, submodule exclusion | ✓ Complete | `isCumpaInternalPath`/mode checks confirmed |
| WTREE-05 | 14-03 | Draft identity never shared/overwritten | ✓ Complete | `uncommittedReviewKey`, structurally guaranteed |
| SNAP-01 | 14-07 | Frozen snapshot, immune to later edits | ✓ Complete | e2e-proven |
| SNAP-02 | 14-07, 14-11, 14-12 | Explicit changed-during-capture notice | ✓ Complete | Marker + banner wired |
| SNAP-03 | 14-07, 14-08, 14-10, 14-12 | User-triggered Refresh | ✓ Complete | Button + shortcut e2e-proven |
| SNAP-04 | 14-08, 14-11, 14-12 | Post-Refresh summary of changes | ⚠️ Partial | Panel complete; tree-row marker unwired (D-15) |
| SNAP-05 | 14-08, 14-12 | Post-Refresh comment reclassification, evidence intact | ⚠️ Partial | Server-correct; client never resyncs |

### Anti-Patterns Found

None — no `TODO`/`FIXME`/`XXX`/"not yet implemented" markers found in the phase's touched source files (`worktree-snapshot.ts`, `worktree-inventory.ts`, `worktree-content.ts`, `capabilities.ts`, `run.ts`, `App.vue`, `RefreshSummaryPanel.vue`, `IdentityHeader.vue`, `FileRow.vue`).

### Human Verification Required

#### 1. Terminal `r`-keypress refresh on a real TTY

**Test:** Launch `cumpa --staged` attached to a real interactive terminal (not piped/CI), externally edit a staged file, press `r` in that terminal.
**Expected:** Terminal prints `Refreshed the uncommitted session snapshot.` and the already-open browser tab's snapshot/worktree-status reflects the new capture, identically to clicking the Refresh button.
**Why human:** `registerUncommittedRefreshKeypress` is gated behind `stdin.isTTY === true`; no automated harness in this repository (Playwright's spawned child, Vitest) can supply a real TTY, so this specific trigger path — though logically identical to the already-proven `Alt+Shift+R` path once invoked — has never been exercised by any test, automated or otherwise.

### Gaps Summary

Phase 14's core contract — launching a Staged/Unstaged/Working-tree review from a frozen snapshot, comparing against the correct base, excluding non-reviewable content, and triggering a Refresh that produces a correct summary and correct server-side comment reclassification — is solidly implemented and proven end-to-end by a real packaged-CLI Playwright suite (4/4 passing) plus 122 passing unit/API/CLI tests and clean server/web typechecks. WTREE-01 through WTREE-05 and SNAP-01 through SNAP-04's core panel behavior are genuinely done.

Three gaps keep the phase from a clean pass, none of them visual/cosmetic:

1. **SNAP-05's user-visible half is broken.** The server computes correct stale/orphaned counts, but `App.vue`'s `performRefresh()` never resynchronizes the client-side comment store, so `StaleAnchorNotice` and any per-comment status badge remain stale after a Refresh — the only place the user actually sees "this comment is now orphaned" is the transient `RefreshSummaryPanel`, which they may dismiss. This is self-reported and e2e-documented by the 14-13 executor, and confirmed directly against `App.vue`'s source during this verification.
2. **D-19's relaunch-recovery offer was never built for uncommitted sessions**, despite being a locked, user-confirmed CONTEXT.md decision. The CLI prints a message promising an offer that never happens in the browser, and no comment-copying path exists.
3. **D-15's tree-row "Changed" marker is built but never wired** — a smaller, UI-SPEC-mandated companion to the (working) `RefreshSummaryPanel`.

Additionally, D-13's terminal `r`-keypress refresh is present and logically sound but gated behind a real TTY check that makes it unverifiable by any automated test in this repository — routed to human verification rather than failed, per the executor's own honest self-report.

---

_Verified: 2026-10-30T23:40:00Z_
_Verifier: gsd-verifier_
