---
phase: 15-standalone-file-review
reviewed: 2026-10-31T13:00:00Z
depth: standard
iteration: 3
files_reviewed: 27
files_reviewed_list:
  - src/cli/run.ts
  - src/contracts/api.ts
  - src/contracts/comparison.ts
  - src/contracts/draft.ts
  - src/domain/comparison-key.ts
  - src/export/render-review-markdown.ts
  - src/export/review-export.ts
  - src/git/standalone-resolution.ts
  - src/git/worktree-inventory.ts
  - src/server/app.ts
  - src/server/capabilities.ts
  - src/server/export-store.ts
  - src/server/worktree-snapshot.ts
  - src/web/App.vue
  - src/web/components/ActiveFileToolbar.vue
  - src/web/components/ExportReceipt.vue
  - src/web/components/FileRow.vue
  - src/web/components/IdentityHeader.vue
  - tests/api/standalone-session.test.ts
  - tests/api/worktree-snapshot.test.ts
  - tests/cli/errors.test.ts
  - tests/e2e/standalone-review.spec.ts
  - tests/git/standalone-resolution.test.ts
  - tests/unit/comparison-key.test.ts
  - tests/unit/review-export.test.ts
  - tests/unit/review-markdown.test.ts
  - tests/unit/uncommitted-contracts.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 15: Code Review Report (FINAL re-review, iteration 3 — auto-fix loop cap)

**Reviewed:** 2026-10-31T13:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** clean

## Summary

This is the final re-review of Phase 15 "Standalone File Review" (`code-review --fix --auto`, iteration 3 of a 3-iteration cap). All four findings from the first two iterations were re-verified by reading the current source directly — never by trusting commit messages — and all four are **genuinely resolved**. A fresh adversarial pass covered the remainder of the in-scope file list, including the full diffs of the two most recent fix commits (`9f9aab4`, `ad47887`) and the code paths they touch transitively. No new Critical/BLOCKER or Warning findings were identified.

### Prior findings — verification evidence

- **CR-01 (BLOCKER, fixed iteration 1, `479b438`) — genuinely resolved, and now subsumed by the WR-02 fix.** The original fix added an opt-in `toleratesNoMatch` flag threaded only through `WorktreeSnapshot.refresh()`. Reading the current `src/server/worktree-snapshot.ts:261-289` (`inventoryForScope`) confirms the WR-02 fix replaced that opt-in plumbing: the standalone branch now unconditionally calls `resolveStandaloneArguments(..., { toleratesNoMatch: true })` (line 272) regardless of caller, so the original CR-01 scenario (a vanished single-file argument crashing `refresh()`) remains fixed — verified directly in `WorktreeSnapshot.refresh()` (`src/server/worktree-snapshot.ts:667-711`), which calls `captureWithIndexRaceGuard(scope, repositoryRoot, runner, this.dependencies)` with no special-casing needed anymore.
- **WR-01 (WARNING, fixed iteration 1, `795220d`) — genuinely resolved.** `createStandaloneCapabilityRegistry` (`src/server/capabilities.ts:1150-1159`) still has the defense-in-depth guard — `throw new RangeError(...)` when `scope.sourceKind !== 'standalone'` — mirroring `createUncommittedCapabilityRegistry`'s own guard (`src/server/capabilities.ts:902-906`, throws when `scope.sourceKind === 'standalone'`). Read the full body of `createStandaloneCapabilityRegistry` (lines 1150-1452): it contains no reference to `options.uncommittedRecoveryCandidate` or a `recoveryAvailable` field anywhere in `sessionResponse` (lines 1166-1190) — the dead recovery-availability branch from the original finding has not resurfaced. `uncommittedRecoveryCandidate` remains wired only through `createUncommittedCapabilityRegistry` (`src/server/capabilities.ts:922`, `:1070-1075`), which still has a real `recoverUncommittedDraft` implementation; `launchStandaloneSession` (`src/cli/run.ts:799-944`) has no equivalent recovery-candidate lookup and never supplies it.
- **WR-02 (WARNING, fixed iteration 2, `9f9aab4`) — genuinely resolved.** Read the commit diff and the resulting code directly. `CaptureWorktreeManifestDependencies` (`src/server/worktree-snapshot.ts:219-225`) no longer has a `toleratesNoMatch` field at all — it was fully removed, not just defaulted. `captureWorktreeManifest`'s two `inventoryForScope` calls (`src/server/worktree-snapshot.ts:307` "expected" pre-capture pass, `:376` "observed" post-capture pass) both route through the same `inventoryForScope` function, which hardcodes `{ toleratesNoMatch: true }` for `sourceKind === 'standalone'` (line 272) independent of which caller invoked it. This means both `materializeWorktreeSnapshot` (the *initial* capture, `src/server/worktree-snapshot.ts:714-738`, called once by `createStandaloneSessionApp` at `src/server/app.ts:229-231`) and `WorktreeSnapshot.refresh()` now tolerate a vanished single-file standalone argument identically. The strict "reject typos/missing files up front" behavior is confirmed still intact at the one call site that deliberately omits the option: `launchStandaloneSession`'s own pre-scope `resolveStandaloneArguments(repository.root, paths, { runner })` call (`src/cli/run.ts:850-854`, no 4th `options` argument) never routes through `captureWorktreeManifest`, so CLI-launch-time typos/missing files still throw as before. The regression test `"surfaces a vanished single-file standalone argument as \"changed-during-capture\" during the INITIAL capture, not just refresh()"` (`tests/api/worktree-snapshot.test.ts:585-612`) correctly exercises `materializeWorktreeSnapshot` directly (not `refresh()`), deletes the file via `onBeforeObservedEnumeration` between the two internal enumeration passes, and asserts the call resolves with `captureStatus: 'changed-during-capture'` instead of throwing.
- **WR-03 (WARNING, fixed iteration 2, `ad47887`) — genuinely resolved.** `renderReviewMarkdown` (`src/export/render-review-markdown.ts:195-204`) now has a three-way ternary on the "Applying-agent instructions" footer: `exactPatch` → preimage/postimage wording, `standalone` → "verify the standalone review key, snapshot chain, relevant blob, repository-relative path, head side, exact selected text, and context hash.", else → the original "pinned comparison commit"/"base/head side" wording. This references real fields on `StandaloneExportScopeSchema` (`src/contracts/draft.ts:473-490`: `reviewKey`, `snapshotChain`) and correctly reflects that every standalone anchor's `side` is always `'head'` (confirmed by `appendAnchor`'s own `exactPatch ? ... : anchor.side` rendering at line 22, and the `## Standalone files` section's `'Anchor side: \`Head\` (current content).'` line at `:103`). The regression test (`tests/unit/review-markdown.test.ts:182-228`) asserts the new sentence verbatim, asserts the markdown does **not** contain `'pinned comparison commit'` or `'base/head side'`, and a sibling assertion on the `exactPatch` test (`tests/unit/review-markdown.test.ts:174-178`) confirms the ternary restructuring left the `exactPatch` branch's own wording unchanged.

### Fresh adversarial pass (this iteration)

Beyond re-verifying the four prior findings, this iteration re-read the full bodies of `src/git/standalone-resolution.ts`, `src/git/worktree-inventory.ts`, `src/contracts/draft.ts` (`StandaloneExportScopeSchema`, `UncommittedDraftComparisonSchema`, `ReviewExportV4Schema`), `src/contracts/comparison.ts` (`UncommittedScopeSchema`'s `superRefine`), `src/export/review-export.ts` (`buildReviewExportV4`), `src/server/export-store.ts` (`stableNameFor`/`matchesPublicationIdentity`/`publishReviewExport`'s standalone branches), the remainder of `src/server/capabilities.ts`'s standalone registry (`verifyAnchor`, `refresh`, `worktreeChangeIndicator`, `exportReview`), and the Vue components' standalone-aware branches (`ActiveFileToolbar.vue`, `FileRow.vue`, `IdentityHeader.vue`, `ExportReceipt.vue`, `App.vue`). No new defects were found:

- `buildUntrackedChangedFile` (`src/git/worktree-inventory.ts:362-402`) synthesizes every standalone file as a pure addition (`oldMode: '000000'`, zero `oldBlobOid`) regardless of the file's actual `standaloneGitState` (`modified-uncommitted`/`untracked`/`unchanged`). This is a deliberate, consistently-applied design choice — standalone review is a current-content-only, single-pane view with no diff against Git history — and is correctly surfaced to the UI: `ActiveFileToolbar.vue` and `FileRow.vue` both derive a dedicated `standaloneStateLabel` from the real `standaloneGitState` field rather than relying on the synthetic `status.kind`, so the actual Git state is never hidden from the reviewer even though the status badge icon is always "A". Confirmed intentional via the "Anchor side: `Head` (current content)" wording in the export Markdown and the test suite's explicit assertions that standalone exports never mention preimage/base.
- `inventoryForScope`'s unconditional `toleratesNoMatch: true` for `sourceKind === 'standalone'` (introduced by the WR-02 fix) is correctly scoped: it only affects the two enumeration passes inside `captureWorktreeManifest`, never `launchStandaloneSession`'s own pre-scope `resolveStandaloneArguments` call, which remains the sole strict rejection point for a session's own startup arguments. No other caller of `resolveStandaloneArguments` was found that would unexpectedly inherit the lenient behavior.
- `createStandaloneCapabilityRegistry`'s `exportReview` (`src/server/capabilities.ts:1378-1444`) correctly non-null-asserts `file.newPath!` and `scope.standaloneArguments!` — both are guaranteed by the scope-kind guard at function entry plus `UncommittedScopeSchema`'s `superRefine` (standalone scopes always carry `standaloneArguments`, and every standalone-synthesized `ChangedFile` always has `newPath` set since none are ever deletions).
- Test coverage across `tests/api/standalone-session.test.ts`, `tests/api/worktree-snapshot.test.ts`, `tests/git/standalone-resolution.test.ts`, `tests/unit/review-export.test.ts`, and `tests/unit/review-markdown.test.ts` exercises session creation, refresh, anchor verification, export publication, and Markdown rendering for the standalone path with no skipped/focused tests (`.skip`/`.only`/`.todo` grep returned zero matches across the full test scope).

All reviewed files meet quality standards. No issues found.

---

_Reviewed: 2026-10-31T13:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 3 (FINAL — auto-fix loop cap reached)_
