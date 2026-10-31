---
phase: 14
slug: uncommitted-source-review-frozen-snapshots
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-31
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Retroactive audit covering all 16 plans (14-01 through 14-16, including the
14-14/14-15/14-16 gap-closure plans and the CR-01/WR-01/WR-02 code-review
fixes recorded in `14-REVIEW-FIX.md`). Every plan shipped a plan-time STRIDE
threat register (`register_authored_at_plan_time: true`), so this audit
verifies each declared mitigation against the implemented code rather than
building a register from scratch.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Current worktree filesystem → `ChangedFile[]` / snapshot content | `src/git/worktree-inventory.ts`, `src/git/worktree-content.ts`, `src/server/worktree-snapshot.ts` read live, externally-mutable worktree bytes and freeze them into `.cumpa/` snapshots. | Local file bytes, modes, sizes |
| `.cumpa/` internal storage → review surface | `.cumpa/` holds Cumpa's own drafts/snapshots; must never become reviewable content itself. | Path strings |
| HTTP request → `POST /api/refresh`, `GET /api/worktree-status`, `POST /api/uncommitted/recover-draft` | Browser/terminal-originated requests over the loopback-bound, bearer-token-authenticated Fastify server (`src/server/security.ts`'s `onRequest` hook, unchanged by this phase). | Zero body/query on all three routes |
| `.cumpa/drafts/*.json` directory contents → relaunch-recovery candidate | `findUncommittedDraftCandidate`/`loadUncommittedDraftCandidateComments` (`src/server/draft-store.ts`) read files this tool previously wrote under the repository's own `.cumpa/` directory. | Draft JSON (comments, anchors) |
| CLI argv (`--staged`/`--unstaged`/`--worktree`/`--base <ref>`) → Git ref resolution / session scope | `src/cli/run.ts`'s flag parsing and `resolveUncommittedBaseCommitOid`/`resolveUncommittedMergeBaseOid`. | Ref name strings |
| Local terminal keypress (`r`) → `POST /api/refresh` | `registerUncommittedRefreshKeypress` (`src/cli/run.ts`), scoped to the uncommitted session launch path only. | None (trigger only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-14-01-01 | Tampering | `boundedFileBytes` relocation (14-01) | accept | Byte-for-byte move with an added `export`; exact-patch test suite is the regression gate. | closed |
| T-14-01-SC | Tampering | Supply chain | accept | No new dependency — `node:crypto`/`node:fs/promises` only. | closed |
| T-14-02-01 | Tampering | `UncommittedScopeSchema` / `UncommittedDraftComparisonSchema` | mitigate | Verified `z.strictObject` + `GitObjectIdSchema`/regex-bound fields in `src/contracts/comparison.ts:134-165` and `src/contracts/draft.ts:92-118`. | closed |
| T-14-02-02 | Information disclosure | `UncommittedScopeSchema.repositoryRoot` | accept | Same shape as the pre-existing `PinnedComparisonSchema.repositoryRoot` — local CLI `cwd`, not attacker input. | closed |
| T-14-02-SC | Tampering | Supply chain | accept | No new dependency — `zod` already pinned. | closed |
| T-14-03-01 | Tampering | `uncommittedReviewKey` output used as filename | mitigate | Verified `createHash('sha256').digest('hex')` in `src/domain/comparison-key.ts:42-53` — 64 lowercase hex chars only, no separator/`..`/NUL representable. | closed |
| T-14-03-02 | Spoofing | Collision between review-key kinds | mitigate | Verified distinct `UNCOMMITTED_DOMAIN` buffer (`comparison-key.ts:5,48`) hashed first, structurally separate from `DOMAIN`/`RANGE_DOMAIN`. | closed |
| T-14-03-SC | Tampering | Supply chain | accept | No new dependency — `node:crypto` already imported. | closed |
| T-14-04-01 | Information disclosure | `classifyWorktreeSideAvailability`'s bounded `fs.readFile` | mitigate | Verified `lstatWorktreeLeaf` (per-segment `lstat`, rejects symlink leaves and non-directory intermediates) + `readWorktreeLeafBytes` (open→stat→exact-size bounded read) in `src/git/worktree-inventory.ts:137-229`. | closed |
| T-14-04-02 | Information disclosure | Untracked-file `.cumpa/` leakage | mitigate | Verified `filterCumpaInternal` applied to tracked diff output and `.filter((path) => !isCumpaInternalPath(path))` applied to the untracked `ls-files` union in `src/git/worktree-inventory.ts:81-88,562-564`. | closed |
| T-14-04-03 | Tampering | Path traversal via pathspecs | accept | Verified identical unvalidated pathspec-passthrough pattern already exists in `src/git/inventory.ts:144-146`'s `createChangedFileInventory`; Git itself is the trust boundary. | closed |
| T-14-04-SC | Tampering | Supply chain | accept | No new dependency — native `git` CLI + Node built-ins. | closed |
| T-14-05-01 | Tampering | Hunk reconstruction correctness | mitigate | Verified `reconstructPostimage` walks git's own `-U1000000` hunk output line-by-line without independent re-normalization, `src/git/worktree-content.ts:30-83`. | closed |
| T-14-05-02 | Spoofing | Synthetic blobOid divergence | mitigate | Verified `resolveWorktreeSideContent` imports and calls the single exported `blobOid()` from `exact-patch.ts` (`src/git/worktree-content.ts:1,103-125`) rather than a second implementation. | closed |
| T-14-05-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-06-01 | Spoofing | `cumpa:uncommitted:*` sentinel id collision | accept | Verified `SourceCandidate.id` values originate from `discoverSourceCandidates` (Git-derived identities), never user-typed text — same trust assumption as the existing `BACK_TO_BASE` sentinel. | closed |
| T-14-06-SC | Tampering | Supply chain | accept | No new dependency — `@inquirer/search` already pinned. | closed |
| T-14-07-01 | Tampering | Torn-read bytes silently persisted as consistent | mitigate | Verified `captureFileWithRetry`'s stat-before/read/stat-after bracket and `'changed-during-capture'` classification, `src/server/worktree-snapshot.ts:167-333`; WR-01 fix (`14-REVIEW-FIX.md`) narrowed the retry's `catch` to `ENOENT` only so genuine errors no longer get silently folded into the torn-read path. | closed |
| T-14-07-02 | Tampering | Concurrent index mutation producing an inconsistent manifest | mitigate | Verified `captureWithIndexRaceGuard`'s before/after `indexIdentity` bracket with one whole-capture retry and `indexRaceNotice` signal, `src/server/worktree-snapshot.ts:376-420`. | closed |
| T-14-07-03 | Denial of service | Unbounded snapshot size/file count | mitigate | Verified `MAX_SNAPSHOT_FILES`/`MAX_SNAPSHOT_BYTES` enforcement (`worktree-snapshot.ts:25-26,242,304`) and reused `boundedFileBytes`/`MAX_SIDE_BYTES` cap (`worktree-snapshot.ts:22`). | closed |
| T-14-07-04 | Information disclosure | Snapshot content written outside `.cumpa/` or into `.git/objects` | mitigate | Verified all writes go through `writeOwned`/`syncDirectory` against the caller-supplied snapshot root (`worktree-snapshot.ts:426,452,457-459`); grepped the file for `hash-object`/`update-index` — no matches, confirming no Git object-store write path exists. | closed |
| T-14-07-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-08-01 | Tampering | `POST /api/refresh` body/header smuggling | mitigate | Verified `bodyLimit: 1` plus explicit body/content-length/content-type rejection, `src/server/routes.ts:237-250`, matching the pre-existing `/api/support/refresh` discipline. | closed |
| T-14-08-02 | Tampering | Comment anchor relocation during refresh | mitigate | Verified `capabilities.ts`'s `refresh()` (`src/server/capabilities.ts:1015-1039`) only calls the read-only `verifyAnchor`/`verifyDurableAnchor` path and never writes `anchor.line`/`anchor.path` on any draft comment. | closed |
| T-14-08-03 | Information disclosure | `findUncommittedDraftCandidate` parsing arbitrary files under `.cumpa/drafts/` | mitigate | Verified the scan is hard-scoped to `join(repositoryRoot, '.cumpa', 'drafts')` and every parse/shape failure `continue`s past the candidate rather than throwing or surfacing it, `src/server/draft-store.ts:392-423`. | closed |
| T-14-08-04 | Elevation of privilege | `exportReview` silently becoming a no-op instead of absent | mitigate | Verified `/api/export` returns `404` via `unavailable(reply, 404)` when `capabilities.exportReview === undefined` (`routes.ts:421-424`) rather than claiming a false capability. | closed |
| T-14-08-SC | Tampering | Supply chain | accept | No new dependency — Fastify/Zod/Node built-ins already pinned. | closed |
| T-14-09-01 | Tampering | `--base <ref>` argument injection into a Git invocation | accept | Verified `resolveUncommittedBaseCommitOid` resolves via `runner.run(['rev-parse', ...])` spawn-array form (`src/cli/run.ts:482-503`), never shell string interpolation. | closed |
| T-14-09-02 | Elevation of privilege | `r`-keypress refresh triggered for the wrong session kind | mitigate | Verified `registerUncommittedRefreshKeypress` has exactly one call site, inside `launchUncommittedSession` only (`src/cli/run.ts:549-594,747-752`); the committed/exact-patch launch path never calls it. | closed |
| T-14-09-SC | Tampering | Supply chain | accept | No new dependency — `commander` already pinned. | closed |
| T-14-10-01 | Spoofing | Passive change indicator mistaken for a live toggle | mitigate | Verified the indicator renders as a plain `<span>` with no `@click` handler, `src/web/components/IdentityHeader.vue`. | closed |
| T-14-10-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-11-01 | Information disclosure | `InlineNotice`'s `dismissLabel` prop echoed into `aria-label` | accept | Caller-supplied static strings only (no raw file content or user-entered text). | closed |
| T-14-11-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-12-01 | Tampering | Unsaved comment lost on Refresh | mitigate | Verified `performRefresh()` runs the auto-save path before `sessionClient.refreshWorktreeSnapshot()`, `src/web/App.vue:1084-1089`; WR-02 fix (`14-REVIEW-FIX.md`) additionally made this `await`ed, establishing a persistence barrier (add-comment POST settles before the refresh POST is sent). | closed |
| T-14-12-02 | Denial of service | Unbounded or overlapping Refresh/poll calls | mitigate | Verified `refreshBusy` guard at entry/set/reset of `performRefresh()`, `App.vue:1081,1087,1101`. | closed |
| T-14-12-03 | Elevation of privilege | Export UI shown but non-functional for uncommitted sessions | mitigate | Verified `exportSupported` prop (default `true`) gates `<ExportSection>` behind `v-if`, `src/web/components/ReviewNotesDialog.vue:52-55,172-173`, wired as `:export-supported="!isUncommittedSession"` in `App.vue:1395`. | closed |
| T-14-12-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-13-01 | Tampering | `tests/e2e/uncommitted-review.spec.ts` weakened/skipped assertion | mitigate | Verified structural-absence assertions (`toHaveCount(0)` for Export review/Export review again buttons and OID text on Unstaged, `tests/e2e/uncommitted-review.spec.ts:269,290,331-332`) and an independent direct `/api/worktree-status` fetch using the session's own published bearer token (`:356-360`). | closed |
| T-14-13-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-14-01 | Tampering | Stale client-side comment status misleading a reviewer | mitigate | Verified `performRefresh()` calls `sessionClient.getDraft()` and `workspace.replaceComments(reconciledWorkspaceComments(...))` on every refresh, `App.vue:1094-1099`, reusing the same reconciliation path `reloadLatestReview()` already used. | closed |
| T-14-14-02 | Information disclosure | `recentlyChangedPaths` holding file display paths | accept | Same display paths already present in `session.files`/`SessionResponse`, sent on every session load. | closed |
| T-14-14-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-15-01 | Tampering | Copying another draft's comments from a forged/crafted candidate file | mitigate | Verified `loadUncommittedDraftCandidateComments` validates the candidate through `ReviewDraftV1Schema.safeParse` (`src/server/draft-store.ts:425-447`) and `recoverUncommittedDraft()` re-submits each comment through `draftStore.mutate({ mutation: { type: 'addComment', ... } })` which runs the full `DraftMutationSchema.parse` path (`draft-store.ts:332-336`; `capabilities.ts:1065-1088`) — no raw candidate bytes are trusted directly. | closed |
| T-14-15-02 | Tampering | Accidentally mutating/deleting the prior draft file during recovery | mitigate | Verified `loadUncommittedDraftCandidateComments` only calls `fs.readFile` (`draft-store.ts:429-430`) and `recoverUncommittedDraft()` writes exclusively through `draftStore.mutate()` targeting the current session's own draft (`capabilities.ts:1065-1088`) — the candidate path is never opened for writing. | closed |
| T-14-15-03 | Information disclosure | `recoveryAvailable`/recover endpoint exposing the prior draft's path, reviewKey, or content before acceptance | accept | Verified `recoveryAvailable: z.literal(true).optional()` (`src/contracts/api.ts:423`) — boolean-only; the recover endpoint takes no client-supplied candidate-identifying parameters. | closed |
| T-14-15-SC | Tampering | Supply chain | accept | No new dependency. | closed |
| T-14-16-01 | Denial of service | Re-entrant/double-click Resume calls | mitigate | Verified `recoveryBusy` guard at entry/set/reset of `acceptUncommittedRecovery()`, `App.vue:1106,1109,1120`. | closed |
| T-14-16-02 | Repudiation | A failed recover/refetch silently reported as success | mitigate | Verified `recoveryOfferDismissed.value = true` is set only after both `recoverUncommittedDraft()` and `getDraft()` resolve without throwing, inside the `try` block, with `recoveryBusy` reset via `finally` regardless of outcome, `App.vue:1105-1122`. | closed |
| T-14-16-SC | Tampering | Supply chain | accept | No new dependency. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-14-01 | T-14-01-01 | Pure relocation of already-reviewed code; exact-patch suite is the regression gate. | Phase 14 plan authors | 2026-10-31 |
| AR-14-02 | T-14-02-02, T-14-14-02, T-14-15-03 | `repositoryRoot`/display-path/recovery-flag fields expose only local, already-trusted, or already-displayed data — no new attacker-reachable disclosure. | Phase 14 plan authors | 2026-10-31 |
| AR-14-03 | T-14-04-03, T-14-09-01 | Pathspec/ref values are passed through `spawn`-array Git invocations identical to pre-existing code paths; Git's own resolution is the trust boundary, not new code. | Phase 14 plan authors | 2026-10-31 |
| AR-14-04 | T-14-06-01 | Sentinel ids are server/Git-derived, never user-typed, matching the pre-existing `BACK_TO_BASE` sentinel's trust assumption. | Phase 14 plan authors | 2026-10-31 |
| AR-14-05 | T-14-11-01 | `aria-label` values are caller-supplied static strings only. | Phase 14 plan authors | 2026-10-31 |
| AR-14-SC | All `T-14-*-SC` entries (16 total) | Zero package-manager installs across all 16 plans — no new third-party dependency surface introduced by this phase. | Phase 14 plan authors | 2026-10-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Notes (non-blocking, informational)

- **IN-03** (`14-REVIEW.md`): `diskPathFor`'s `lstat` in `captureChangeBaseline()`/`worktreeChangeIndicator()` (`src/server/capabilities.ts`) does not reuse `lstatWorktreeLeaf`'s per-segment symlink-walk discipline. This was triaged by the phase's own code review as Info-level and explicitly left out of fix scope (`14-REVIEW-FIX.md`): the call is read-only, compares only `size`/`mtimeMs` for a boolean "has anything changed" signal, and never reads or returns file bytes, so it does not map to any STRIDE threat in the register above (`lstat` on the final path component does not dereference a symlink to disclose out-of-repo content). Flagged here for visibility only — not an open threat, not blocking.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-31 | 50 | 50 | 0 | gsd-security-auditor (retroactive, post-implementation) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-31
