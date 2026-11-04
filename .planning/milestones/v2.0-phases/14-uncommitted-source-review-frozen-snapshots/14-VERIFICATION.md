---
phase: 14-uncommitted-source-review-frozen-snapshots
verified: 2026-10-31T01:05:00Z
status: human_needed
score: 11/12 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/12
  gaps_closed:
    - "After Refresh, user sees every existing comment reclassified current/stale/orphaned, client-side (SNAP-05, Roadmap SC5)"
    - "A file in the most recent Refresh's added/removed/modified sets shows a 'Changed' tree-row marker until opened (D-15)"
    - "A different-digest relaunch offers draft recovery through the actual browser flow, not just a CLI console line (D-19)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Pressing 'r' in a running CLI terminal triggers the same server-side refresh the browser's Refresh button triggers (D-13)"
    test: "Launch an uncommitted session attached to a real TTY (not piped stdin), edit a tracked staged file externally, press 'r' in the terminal, confirm the terminal prints 'Refreshed uncommitted session snapshot.' and the open browser tab's RefreshSummaryPanel/worktree-status reflects the new snapshot."
    expected: "Terminal 'r' keypress produces the same observable refresh effect as clicking the browser's Refresh button or pressing Alt+Shift+R."
    why_human: "Gated behind `stdin.isTTY === true` (src/cli/run.ts:556); no automated harness in this repository (Playwright's spawned child, Vitest) can supply a real TTY to the spawned CLI process, so this specific trigger path has never been exercised by any test, automated or otherwise."
human_verification:
  - test: "Attach `cumpa --staged` to a real interactive terminal (not piped), externally edit a staged file, press 'r', confirm the terminal prints 'Refreshed uncommitted session snapshot.' and the open browser tab's RefreshSummaryPanel/worktree-status reflects the new snapshot."
    expected: "Terminal 'r' keypress produces the same observable refresh effect as clicking the browser's Refresh button or pressing Alt+Shift+R."
    why_human: "Blocked behind `stdin.isTTY === true`; no automated harness in the repository can supply a real TTY to a spawned child process."
---

# Phase 14: Uncommitted Source Review & Frozen Snapshots Verification Report

**Phase Goal:** Developers can review Staged, Unstaged, or Working-tree changes against HEAD or any chosen base from a frozen snapshot, trust that drafts' comments stay correctly scoped to the exact reviewed content, and explicitly refresh to a new snapshot with every comment reclassified.
**Verified:** 2026-10-31T01:05:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 14-14, 14-15, 14-16)

## Goal Achievement

This is a **re-verification** following a gap-closure cycle. The previous report (2026-10-30, `status: gaps_found`, 8/12) found 3 gaps: (1) `performRefresh()` never resyncing client-side comment status, (2) D-19 relaunch-recovery never wired into the browser, (3) D-15's tree-row "Changed" marker never wired. Plans 14-14, 14-15, 14-16 (`gap_closure: true`) claim to close all three. Each claim was checked directly against current source (not SUMMARY.md narrative), plus a fresh run of the phase's e2e suite, unit/API/CLI test suites, and both typechecks.

### Gap-by-gap re-verification

**Gap 1 — SNAP-05 client-side resync.** `src/web/App.vue:1077-1100`'s `performRefresh()` now calls `sessionClient.getDraft()` after a successful `refreshWorktreeSnapshot()` and feeds the result into `workspace.replaceComments(reconciledWorkspaceComments(loadedDraft.draft))`, exactly mirroring the established `reloadLatestReview()` pattern. The executor also found and fixed a latent bug in `reconciledWorkspaceComments()` (line 393-395) itself: it previously merged `{...previousClientComment, state, body}`, which silently discarded freshly-reconciled `status`/`exactFile`/`fileId`/`recordedAnchor` in favor of stale client values whenever a comment with the same id already existed. The function now simply delegates to `reconcileDraftComments(draft.comments, session.value?.files ?? [])` — no stale-value merge remains. **Behaviorally confirmed**: the e2e test at `tests/e2e/uncommitted-review.spec.ts:205` edits a staged file externally, triggers Refresh, and asserts both the server-truth panel text (`'1 comment now orphaned'`) *and* the client-side `StaleAnchorNotice` heading (`'Some saved comment anchors cannot be verified'`) become visible without a page reload — this is the exact invariant the previous gap described as broken. Test passes.

**Gap 2 — D-19 relaunch-recovery.** `src/cli/run.ts:691-708` now threads the discovered `recoveryCandidate` into `createApp(scope, { ..., uncommittedRecoveryCandidate: { path } })` instead of only printing a console line (the old misleading notice is gone). `src/server/capabilities.ts` exposes `CapabilityRegistryOptions.uncommittedRecoveryCandidate` and `CapabilityRegistry.recoverUncommittedDraft?()` (lines 1062-1086), which copies the prior draft's comments one at a time via `draftStore.mutate({type:'addComment', ...})` (re-applying `resolveComment` for comments that were resolved), skipping duplicate-anchor results and never opening the candidate file for writing. `src/server/routes.ts:271-284` registers `POST /api/uncommitted/recover-draft`, capability-gated. `src/contracts/api.ts` adds `recoveryAvailable?: true` to the session response and the `UncommittedDraftRecoveryResultSchema`. On the client, `src/web/api/client.ts` adds `recoverUncommittedDraft()` (zero-body POST, Zod-validated), and `src/web/App.vue` adds a `recoveryAvailable` computed, a dismissible "Resume previous uncommitted review?" `InlineNotice` in `.shell-warning-stack` (lines 1226, 1245), and `acceptUncommittedRecovery()` (lines 1102-1119) which calls the recover endpoint then re-syncs the workspace via the same `getDraft()` + `workspace.replaceComments(reconciledWorkspaceComments(...))` path used by the Gap-1 fix. **Behaviorally confirmed**: `tests/e2e/uncommitted-review.spec.ts:410` launches a first `--staged` session, adds a comment, closes it, launches a second `--staged` session against different staged content (different digest, same source+base), asserts the "Resume previous uncommitted review?" offer appears, accepts it, and asserts the first session's comment appears in the new draft. Test passes. Server-side unit coverage: `tests/api/uncommitted-session.test.ts` (11/11 passing, includes 2 new recovery-specific integration tests exercising the real HTTP route).

**Gap 3 — D-15 tree-row marker.** `src/web/App.vue:121` adds `recentlyChangedPaths = ref<Set<string>>(...)`, populated in `performRefresh()` (line 1090) from the refresh delta's `added`/`removed`/`modified` path arrays, and cleared per-path in `selectFile()` (line 803) the moment a file is opened. The ref is threaded as a prop through `ChangedFilesDialog.vue` → `FileTree.vue` → `DirectoryRow.vue` (recursively for nested directories), each level owning its own `isRecentlyChanged()` path-matching helper and passing `:recently-changed="isRecentlyChanged(node/child)"` down to every `FileRow` instance at any tree depth. `FileRow.vue:68` already had the `recentlyChanged` prop and `tree-row__refresh-marker` span (built in 14-11 but previously never fed `true`) — now genuinely wired end to end. **Behaviorally confirmed**: the same e2e test at line 267-269 asserts the tree row's "Changed" text becomes visible after Refresh, then clears after the row is clicked/opened. Test passes.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WTREE-01/WTREE-02 — User picks Staged/Unstaged/Working tree as Head source; Working-tree untracked files appear as added, honoring `.gitignore`/`.git/info/exclude`/global excludes (Roadmap SC1) | ✓ VERIFIED (regression check) | Unchanged since initial verification; `tests/e2e/uncommitted-review.spec.ts:278` (untracked-as-added, no Base on `--unstaged`) still passes. |
| 2 | WTREE-04 — `.cumpa/` content, symlink targets, submodule internals, binary/oversized files never shown as reviewable (Roadmap SC1) | ✓ VERIFIED (regression check) | Unchanged; `worktree-inventory.ts` logic untouched by gap-closure plans; fixture tests still pass (124/124 phase-14 unit/API/CLI suite). |
| 3 | WTREE-03 — Staged/Working tree compare vs HEAD by default or any chosen local branch/worktree Base, computing merge-base; Unstaged is always index→worktree, Base prompt skipped, `--base` rejected (Roadmap SC2, D-05) | ✓ VERIFIED (regression check) | Unchanged; `tests/unit/uncommitted-contracts.test.ts` and `tests/cli/*` still pass. |
| 4 | WTREE-05 — Two different working-tree states against the same base never share/overwrite a draft (Roadmap SC5) | ✓ VERIFIED (regression check) | `uncommittedReviewKey` unchanged; D-19's recovery feature (truth #12) explicitly reuses this key to detect "different digest, same source+base" without ever mutating the prior draft — reinforces rather than weakens this guarantee. |
| 5 | SNAP-01 — Review stays frozen at launch-time bytes; later edits don't change the display (Roadmap SC3) | ✓ VERIFIED (regression check) | Unchanged; e2e test at line 205 still demonstrates frozen content survives an external edit until Refresh. |
| 6 | SNAP-02 — User is told explicitly when a file changed during capture, never shown a mixed/partial version (Roadmap SC3, D-09/D-12) | ✓ VERIFIED (regression check) | Unchanged; `captureFileWithRetry`/`FileRow.vue`'s "Changed during capture" marker untouched by gap-closure plans. |
| 7 | SNAP-03 — User can trigger Refresh to capture a new snapshot of the same source/scope (Roadmap SC4) | ✓ VERIFIED (regression check) | Unchanged; `WorktreeSnapshot.refresh()`, Refresh button, `Alt+Shift+R` all still e2e-proven (test at line 341). |
| 8 | SNAP-04 — After Refresh, user sees a summary of files added/removed/modified since the previous snapshot, **and** a per-tree-row "Changed" marker until the file is opened (Roadmap SC4, D-15) | ✓ VERIFIED | `RefreshSummaryPanel.vue` unchanged (still verified); tree-row marker gap (previously FAILED) now closed — see Gap 3 above. Both halves of D-15 now e2e-proven in a single test (`uncommitted-review.spec.ts:255-269`). |
| 9 | SNAP-05 — After Refresh, every existing comment (client- and server-side) is reclassified current/stale/orphaned with evidence intact, never moved to a different line (Roadmap SC5) | ✓ VERIFIED | Server-side half unchanged (was already verified). Client-side half (previously FAILED) now closed — see Gap 1 above. `StaleAnchorNotice` now observably updates without a page reload, e2e-proven. |
| 10 | D-13 — Refresh has three entry points: toolbar button, keyboard shortcut, and `r` in the running CLI terminal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (terminal path only) | Unchanged from previous verification. Toolbar button and `Alt+Shift+R` both e2e-proven. Terminal `'r'`-keypress handler (`registerUncommittedRefreshKeypress`, `src/cli/run.ts:549-594`) still gated behind `stdin.isTTY !== true`; code path is logically identical to the already-proven `Alt+Shift+R` handler once invoked, but still not exercised by any automated test (no spawned-child harness in the repo supplies a real TTY). Correctly left as human-verification; this is inherent to the feature's TTY dependency, not a defect introduced or left by the gap-closure plans. |
| 11 | D-15 — Post-Refresh summary panel **plus** "Changed" text markers on changed tree rows until the file is opened | ✓ VERIFIED | See Gap 3 above — both the panel (already verified) and the marker (previously FAILED, now closed) are e2e-proven together. |
| 12 | D-19 — A different-digest relaunch offers draft recovery through the actual browser flow; accepting creates a new draft with comments copied and reclassified, never mutating the prior draft | ✓ VERIFIED | See Gap 2 above — full round trip is e2e-proven (`uncommitted-review.spec.ts:410-477`), plus 2 new server-side integration tests. |

**Score:** 11/12 truths verified (1 present, behavior-unverified — unchanged from previous verification, inherent to TTY-gating)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/web/App.vue` | `performRefresh()` resyncs `workspaceComments`; `recentlyChangedPaths` populated on refresh, cleared on open; `acceptUncommittedRecovery()` wired to recovery offer | ✓ VERIFIED | All three behaviors present, wired, and e2e-proven (lines 121, 393-395, 803, 1077-1119, 1226, 1245, 1350). |
| `src/web/components/ChangedFilesDialog.vue` | `recentlyChangedPaths` prop threaded to `FileTree` | ✓ VERIFIED | Prop declared (line 13) and passed through (line 42). |
| `src/web/components/FileTree.vue` | `recentlyChangedPaths` prop threaded to top-level `FileRow`/`DirectoryRow` | ✓ VERIFIED | `isRecentlyChanged()` helper (line 20-22) feeds `:recently-changed="isRecentlyChanged(node)"` (line 218). |
| `src/web/components/DirectoryRow.vue` | `recentlyChangedPaths` prop threaded recursively to nested `FileRow`/`DirectoryRow` | ✓ VERIFIED | Own `isRecentlyChanged()` helper (line 19-21) feeds `:recently-changed="isRecentlyChanged(child)"` (line 90); recursion into nested `DirectoryRow` re-passes the prop (line 78). |
| `src/web/api/client.ts` | `recoverUncommittedDraft()` session-client method, Zod-validated | ✓ VERIFIED | Interface (line 106) and implementation (lines 210-211) both present, mirroring `refreshWorktreeSnapshot()`'s shape. |
| `src/contracts/api.ts` | `recoveryAvailable` flag; `UncommittedDraftRecoveryResultSchema` | ✓ VERIFIED | Both present, imported and used by server and client. |
| `src/server/draft-store.ts` | `loadUncommittedDraftCandidateComments(path)`, read-only | ✓ VERIFIED | Present; used only by `recoverUncommittedDraft()`, never writes. |
| `src/server/capabilities.ts` | `uncommittedRecoveryCandidate` option, `recoverUncommittedDraft` capability | ✓ VERIFIED | Lines 119, 143, 916, 1062-1086; copies comments via `draftStore.mutate`, never mutates the candidate file. |
| `src/server/routes.ts` | `POST /api/uncommitted/recover-draft`, capability-gated | ✓ VERIFIED | Lines 271-284. |
| `src/cli/run.ts` | Threads recovery candidate into `createApp`'s options instead of only printing a console line | ✓ VERIFIED | Lines 691-708; old misleading console notice removed. |
| `tests/e2e/uncommitted-review.spec.ts` | End-to-end browser proof of all 3 previously-failed behaviors | ✓ VERIFIED | 5/5 tests pass (re-run during this verification); grew from 4 to 5 tests (new D-19 recovery test); first test's assertions rewritten from "pinned-broken" placeholders to genuine fixed-behavior assertions. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/web/App.vue` | `src/web/api/client.ts` | `performRefresh()` → `refreshWorktreeSnapshot()` → `getDraft()` → `workspace.replaceComments(...)` | WIRED | Confirmed via source read; e2e-proven. |
| `src/web/App.vue` | `src/web/api/client.ts` | `acceptUncommittedRecovery()` → `recoverUncommittedDraft()` → `getDraft()` → `workspace.replaceComments(...)` | WIRED | Confirmed via source read; e2e-proven. |
| `src/web/App.vue` | `src/web/components/ChangedFilesDialog.vue` | `recentlyChangedPaths` prop | WIRED | Confirmed via source read. |
| `src/web/components/ChangedFilesDialog.vue` | `src/web/components/FileTree.vue` | `recentlyChangedPaths` prop | WIRED | Confirmed via source read. |
| `src/web/components/FileTree.vue` / `DirectoryRow.vue` | `src/web/components/FileRow.vue` | `:recently-changed="isRecentlyChanged(...)"` at every depth | WIRED | Confirmed via source read; e2e-proven at both top level and (implicitly) recursion. |
| `src/cli/run.ts` | `src/server/app.ts` / `createUncommittedSessionApp` | `uncommittedRecoveryCandidate` option | WIRED | Confirmed via source read. |
| `src/server/capabilities.ts` | `src/server/routes.ts` | `capabilities.recoverUncommittedDraft` → `POST /api/uncommitted/recover-draft` registration guard | WIRED | Confirmed via source read; integration-tested. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 14 e2e suite (all 5 tests, including both gap-closure scenarios) | `npm run build:web && npx playwright test tests/e2e/uncommitted-review.spec.ts` | 5 passed (14.4s) | ✓ PASS |
| Phase 14 unit/API/CLI regression suite | `npx vitest run tests/unit/uncommitted-contracts.test.ts tests/unit/comparison-key.test.ts tests/git/worktree-inventory.test.ts tests/git/worktree-content.test.ts tests/api/worktree-snapshot.test.ts tests/api/uncommitted-session.test.ts tests/unit/draft-load.test.ts tests/cli/selection.test.ts tests/cli/errors.test.ts` | 124/124 passed (9 files) | ✓ PASS |
| Server/shared typecheck | `npx tsc --noEmit --project tsconfig.json` | exit 0 | ✓ PASS |
| Web typecheck | `npm run typecheck:web` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| WTREE-01 | 14-06, 14-09 | Staged/Unstaged/Working tree selectable at launch | ✓ Complete | Unchanged; regression-checked. |
| WTREE-02 | 14-04 | Untracked files added, honoring ignore rules | ✓ Complete | Unchanged; regression-checked. |
| WTREE-03 | 14-02, 14-06, 14-09 | Base selection rules incl. D-05 Unstaged exception | ✓ Complete | Unchanged; regression-checked. |
| WTREE-04 | 14-04 | `.cumpa/`, symlink, submodule exclusion | ✓ Complete | Unchanged; regression-checked. |
| WTREE-05 | 14-03, 14-15, 14-16 | Draft identity never shared/overwritten; D-19 recovery reuses it correctly | ✓ Complete | `uncommittedReviewKey` unchanged; recovery feature reinforces guarantee — e2e-proven. |
| SNAP-01 | 14-07 | Frozen snapshot, immune to later edits | ✓ Complete | Unchanged; e2e-proven. |
| SNAP-02 | 14-07, 14-11, 14-12 | Explicit changed-during-capture notice | ✓ Complete | Unchanged; marker + banner wired. |
| SNAP-03 | 14-07, 14-08, 14-10, 14-12 | User-triggered Refresh | ✓ Complete | Unchanged; button + shortcut e2e-proven. |
| SNAP-04 | 14-08, 14-11, 14-12, 14-14 | Post-Refresh summary + tree-row marker | ✓ Complete | Panel + marker both e2e-proven (gap closed by 14-14). |
| SNAP-05 | 14-08, 14-12, 14-14 | Post-Refresh comment reclassification, server + client | ✓ Complete | Server half unchanged; client half fixed and e2e-proven (gap closed by 14-14). |

No orphaned requirements found — all 10 requirement IDs declared across the 16 plans map to REQUIREMENTS.md entries, and REQUIREMENTS.md marks all 10 `[x]` Complete.

### Anti-Patterns Found

None. Scanned all files modified by the gap-closure plans (`src/web/App.vue`, `src/web/components/ChangedFilesDialog.vue`, `src/web/components/FileTree.vue`, `src/web/components/DirectoryRow.vue`, `src/web/api/client.ts`, `src/contracts/api.ts`, `src/server/draft-store.ts`, `src/server/capabilities.ts`, `src/server/routes.ts`, `src/cli/run.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" — no matches (one false-positive hit on an unrelated pre-existing error-message string containing "not available", not a stub marker).

### Human Verification Required

### 1. D-13 terminal 'r'-keypress refresh

**Test:** Attach `cumpa --staged` to a real interactive terminal (not piped stdin), externally edit a staged file, press 'r', confirm the terminal prints "Refreshed uncommitted session snapshot." and the open browser tab's RefreshSummaryPanel/worktree-status reflects the new snapshot.
**Expected:** Terminal 'r' keypress produces the same observable refresh effect as clicking the browser's Refresh button or pressing Alt+Shift+R.
**Why human:** Blocked behind `stdin.isTTY === true`; no automated harness in the repository (Playwright's spawned child, Vitest) can supply a real TTY to a spawned child process. This item is carried forward unchanged from the previous verification — it is inherently untestable by automation, not a code defect, and none of the three gap-closure plans touched this code path.

### Known Pre-Existing Issue (Not a Phase 14 Blocker)

`tests/e2e/complete-review-draft.spec.ts` (8/8) fails against the packaged build — the default-selected file on load now renders via Phase 13's single-pane editor rather than the `.monaco-diff-editor` the test's fixture/selectors assume. This was confirmed by the orchestrator via a clean git-worktree checkout at the pre-Phase-14 commit `f548116` to be a pre-existing Phase 13 regression, unrelated to and unaffected by any of Phase 14's work (including the gap-closure plans — 14-14's executor independently re-discovered and documented the same failure while sanity-checking a shared helper function, with no code path overlap). It is noted here for completeness and does not affect Phase 14's status.

### Gaps Summary

All 3 gaps from the previous verification are closed, with source-level and behavioral (e2e) evidence for each:

1. **SNAP-05's client-side half** — `performRefresh()` now resyncs `workspaceComments` via the established `getDraft()` + `workspace.replaceComments(reconciledWorkspaceComments(...))` pattern; a latent clobbering bug in `reconciledWorkspaceComments()` itself was found and fixed as part of the same change. e2e-proven.
2. **D-19's relaunch-recovery offer** — fully built end to end: server capability + route + CLI threading + browser dismissible offer + accept-and-resync flow. e2e-proven (new 5th test) plus 2 new server integration tests.
3. **D-15's tree-row "Changed" marker** — `recentlyChangedPaths` now threaded through the full component tree at every depth, populated on Refresh, cleared on file-open. e2e-proven in the same test as gap 1.

No regressions found: all previously-passing truths, artifacts, and key links remain intact (124/124 unit/API/CLI tests, 5/5 e2e tests, both typechecks clean).

Only one item remains outstanding, carried forward unchanged and correctly so: **D-13's terminal `'r'`-keypress refresh path** is present, logically sound (identical code path to the already-proven `Alt+Shift+R` handler once invoked), and TTY-gated such that no automated harness in this repository can exercise it. This is inherent to the feature, not a code defect, and is routed to human verification rather than treated as a gap — consistent with the previous verification's treatment and the explicit guidance for this re-verification.

**Overall status: `human_needed`** — not `passed`, solely because of the single outstanding D-13 human-verification item (status decision tree Step 9, rule 2: any non-empty human-verification section routes to `human_needed` even when every other truth is VERIFIED).

---

_Verified: 2026-10-31T01:05:00Z_
_Verifier: the agent (gsd-verifier) — re-verification after gap closure_
