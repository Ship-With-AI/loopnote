---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Artifact Review
current_phase: 17.1
current_phase_name: full-project-rename
status: executing
stopped_at: Completed 17.1-01-PLAN.md
last_updated: "2026-11-02T08:31:03.548Z"
last_activity: 2026-11-02
last_activity_desc: Phase 17.1 execution started
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 69
  completed_plans: 43
  percent: 62
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-09)

**Core value:** A developer can accurately review repository-grounded changes chosen by a developer or coding agent and return precise, drift-detectable feedback the agent can act on.
**Current focus:** Phase 17.1 — full-project-rename

## Current Position

Phase: 17.1 (full-project-rename) — EXECUTING
Plan: 2 of 22
Status: Ready to execute
Last activity: 2026-11-02 — Phase 17.1 execution started

## Performance Metrics

**Velocity:**

- Total plans completed: 125
- Average duration: 23 min
- Total execution time: 4.7 hours

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 MVP | 5 including Phase 04.1 | 40 | Complete |
| v1.1 GitHub Dark Diff | 4 | 16 | Complete |
| v1.2 Fast Source Discovery | 3 | 4 | Complete |
| v1.3 Agent Review Handoff | 4 | 14 | Complete |
| v1.4 Voluntary Support | 2 | 22 | Complete |
| v1.5 MIT Distribution | 5 | TBD | In progress |

*Updated after each plan completion.*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | not separately timed | 3 tasks | 4 files |
| Phase 03 P02 | 12min | 2 tasks | 4 files |
| Phase 6 P01 | 14min | 1 tasks | 2 files |
| Phase 07 P07-01 | 113m | 3 tasks | 4 files |
| Phase 07 P02 | 15m | 3 tasks | 2 files |
| Phase 13 P01 | 15min | 2 tasks | 2 files |
| Phase 13 P02 | 2min | 2 tasks | 6 files |
| Phase 13-single-pane-file-rendering P03 | 35min | 3 tasks | 4 files |
| Phase 13-single-pane-file-rendering P04 | 9min | 2 tasks | 3 files |
| Phase 13-single-pane-file-rendering P05 | 35min | 2 tasks | 1 files |
| Phase 14 P01 | 15min | 1 tasks | 2 files |
| Phase 14 P02 | 35min | 2 tasks | 6 files |
| Phase 14 P03 | 10min | 1 tasks | 2 files |
| Phase 14 P04 | 55min | 2 tasks | 3 files |
| Phase 14 P05 | 15min | 1 tasks | 3 files |
| Phase 14 P06 | 25min | 1 tasks | 2 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P07 | 70min | 2 tasks | 2 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P08 | 70min | 3 tasks | 8 files |
| Phase 14 P09 | 95min | 2 tasks | 3 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P10 | 25min | 2 tasks | 2 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P11 | 25min | 2 tasks | 3 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P12 | 70min | 2 tasks | 3 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P13 | 70min | 2 tasks | 1 files |
| Phase 14 P14 | 70min | 3 tasks | 5 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P15 | 45min | 4 tasks | 6 files |
| Phase 14-uncommitted-source-review-frozen-snapshots P16 | 25min | 3 tasks | 3 files |
| Phase 17 P01 | 10min | 2 tasks | 4 files |
| Phase 17 P02 | 35min | 2 tasks | 5 files |
| Phase 17 P03 | 10min | 2 tasks | 1 files |
| Phase 17-agent-protocol-extension-marketplace-skill P04 | 55min | 2 tasks | 3 files |
| Phase 17 P05 | 35min | 3 tasks | 2 files |
| Phase 17.1 P01 | 18min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions.

- [v1.5]: Standard MIT replaces the proprietary license direction and the abandoned permission-restriction interview. Commercial reuse, modification, redistribution and resale are permitted under MIT. Preserve third-party notices, runtime-only npm packaging, and maintainer rights/sensitive-history and dual-licensor exact-text publication gates; do not turn those gates into additional MIT recipient restrictions.
- [v1.5]: Use OIDC trusted publishing from the approved public repository without long-lived credentials; preserve eligible automatic provenance and make only verified release/attestation claims.
- [v1.5]: Verify one exact runtime-only tarball before registry mutation, then bootstrap with one usable non-`latest` release before stable OIDC publication.
- [v1.5]: Publish the public MIT skill only after its separately installed CLI prerequisite exists; the CLI retains all review authority.
- [v1.5]: Preserve existing review, export, and voluntary-support behavior across every released installation path.
- [Phase 07]: Pinned public distribution equality checks to immutable Phase 5 evidence. — Exact URL, SHA-1, and SHA-512 checks reject substituted or rebuilt archives.
- [Phase 07]: Operator selected shared-support-home. — One shared support HOME, installation identity, and voluntary-support status serve global, npx, and marketplace paths; exactly one real Restore sign-in will occur in Plan 07-04. Per-path npm cache, npm configuration, install prefix, browser profile state, checkout separation, and sanitized PATH remain isolated. Paths observing the shared verified identity record restoreCompleted: false and restoreObservedFromSharedIdentity: true; no second protected sign-in or copied row is allowed.
- [Phase 07]: Keep local-archive evidence structurally unchanged while public paths publish separate scenario records.
- [Phase 07]: Marketplace OMP auth narrowing. — The temporary OMP profile reused the operator-authorized provider credential copy; every other isolation dimension remains per-path. This is not independent authentication and must be carried into consolidated evidence.
- [Phase 07]: Use expectedVersion for source-independent CLI and manifest assertions.
- [Phase 07]: Preserve `partially-blocked` through consolidation. — Real global and npx pre-restore runs passed their review/export/Finish and asset contracts, but the verified ACC-04 row remains `live-entitlement-unavailable` with `substituted: false`.
- [Phase 07]: Hardened evidence regenerated and corrected. — `792806a`, `f3b9079`, and `6492551` repaired BL-01 through BL-03; `6492551` also carries a writer correction despite its marketplace-only subject. `a9722eb` made marketplace readiness harness-owned and `f4963a0` made checker/launch proof derive from the isolated session trace. `48d8570` separates passed ACC-01/02/03 installation-review evidence from partially-blocked ACC-04 support evidence and restores the bounded public-global linkage finding. All six fresh reports remain authoritative; verified rows remain blocked by live entitlement with `substituted: false`.
- [Phase 13]: 13-01: combined Task 1/Task 2 GREEN into a single commit because plan frontmatter type=tdd uses plan-level RED/GREEN/REFACTOR gates, and the MonacoDiffAdapter interface forces full implementation to type-check
- [Phase 13]: 13-01: PublicMonacoSinglePaneAdapter.setFile unconditionally clears-then-sets the editor model, mirroring PublicMonacoDiffAdapter.disposeModels()'s unconditional setModel(null) pattern
- [Phase 13]: 13-02: wasModeKind's git-mode-literal table independently duplicates the two literals already hardcoded in src/git/availability.ts rather than importing that module, per D-06's instruction to avoid new git plumbing and RESEARCH.md Pitfall 2
- [Phase 13]: 13-03: Reused App.vue's pre-existing pinnedSession computed instead of redeclaring it per plan text, avoiding a duplicate-identifier compile error.
- [Phase 13]: 13-03: isSinglePaneFileEmpty narrows content.base/.head via .exists before reading .text, since the plan's literal formula does not type-check against the ExistingFileContentSideSchema|MissingFileContentSideSchema union.
- [Phase 13]: 13-03: Single-pane gutter-action comment button omits the --base positioning modifier since it has no two-column canvas to position within.
- [Phase 13-single-pane-file-rendering]: 13-04: singlePaneSuffix branches on type-changed independently of the shared type-changed/unsupported presentation switch arm, so unsupported files never get the single-pane suffix
- [Phase 13-single-pane-file-rendering]: 13-04: ActiveFileToolbar.vue recomputes singlePaneSideFor from its own selectedFile prop rather than accepting a new prop from App.vue, keeping file ownership scoped to the plan's three listed files
- [Phase 13-single-pane-file-rendering]: Single-pane gutter aria-label uses uppercase BASE/HEAD word, discovered from DiffWorkspace.vue's real singlePaneSideWord computed rather than plan prose
- [Phase 13-single-pane-file-rendering]: Fixed pre-existing openGeneratedReview helper bug: asserted .diff-workspace__editor instead of .monaco-diff-editor so it tolerates the anchoredReview fixture's default-selected file rendering single-pane
- [Phase 14]: 14-01: snapshot-fs.ts preserves async on syncDirectory/writeOwned/boundedFileBytes (verbatim move) — Functions await internally so async must be kept; plan's literal grep for a non-async export pattern was a verification-tooling bug, not an implementation defect — verified with the async-matching pattern instead.
- [Phase 14]: 14-01: used npx tsc --noEmit --project tsconfig.json in place of a nonexistent npm run typecheck script — package.json defines no top-level typecheck script; this is the equivalent noEmit check for the src/server sources this plan modifies.
- [Phase 14]: 14-02: UncommittedScopeSchema placed after ChangedFileSchema, not after ExactPatchScopeSchema — Avoids a const-TDZ ReferenceError since UncommittedScopeSchema.changedFiles reuses ChangedFileSchema, declared later in comparison.ts
- [Phase 14]: 14-02: Widened DraftComparisonSchema union (3 members) required narrowing sameComparison() and buildReviewExportV3() in draft-loader.ts/review-export.ts — 'kind' in comparison no longer uniquely implies exact-patch shape; fixed minimally per RESEARCH.md guidance, deferring 14-08's full D-19 relaunch-recovery behavior
- [Phase 14]: 14-03: npm run typecheck substitution — npx tsc --noEmit --project tsconfig.json, same pre-existing gap recorded in 14-01/14-02
- [Phase 14]: 14-04: classifyWorktreeSideAvailability() is a new standalone function (not a modification of classifyAvailability()), since availability.ts was excluded from files_modified — Mirrors classifyAvailability's cascade for the worktree-resident side via bounded fs read + per-segment lstat defense (PatchSnapshot.worktreeEntry() discipline), duplicated because src/git/ never depends on src/server/
- [Phase 14]: 14-04: added hasNumstat flag to classifyWorktreeSideAvailability (default true) — Fixed a real bug where untracked files' additions===null/deletions===null (no numstat line exists for them) was misread as git's numstat binary flag, wrongly classifying all untracked text files as unsupported/binary; untracked call site passes hasNumstat=false to force the real embedded-NUL content check
- [Phase 14]: 14-05: blobOid gained only the export keyword, zero behavior/signature change — Keeps committed and uncommitted anchors sharing the exact same synthetic-digest algorithm with zero schema change (WTREE-04/D-21)
- [Phase 14]: 14-05: resolveWorktreeSideContent documents the already-changed-file precondition in its doc comment and throws rather than guarding defensively — Mirrors exact-patch.ts's applyText, which assumes a well-formed patch rather than handling malformed input
- [Phase 14]: Gated the Uncommitted picker group behind an opt-in includeUncommittedGroup flag rather than bare role==='base', so pickOrderedSources' own internal base re-prompt (e.g. after Back) never re-shows it — Keeps pickOrderedSources byte-for-byte behaviorally unchanged in every code path and avoids a reachable crash if an uncommitted sentinel id reached that nested loop
- [Phase 14]: 14-07: WorktreeSnapshotManifestSchema field order (entries before chain) must match zod's output-reordering; content capture gated on availability.kind==='text'; refresh() takes zero args with dependencies captured at construction — Required for manifest self-verification round-trip to succeed and to satisfy the plan's literal 'async refresh()' acceptance criterion while still supporting fault-injection test hooks
- [Phase ?]: 14-08: widened exportReview/revealExportDirectory to optional (Phase 17 scope); 404 guard added to the two unconditional export routes
- [Phase ?]: Resolved picker baseRef via selectionForCandidate().revision, not candidate.id — Internal candidate ids are not valid Git revisions; plan pseudocode would break every Base-selected picker launch
- [Phase 14]: 14-10: used reviewKey.slice(0,7) as displayed snapshot short-digest — 14-08's UncommittedSessionResponseSchema exposes no separate content-digest field, only reviewKey (the draft-identity hash) — confirmed by reading src/contracts/api.ts before deciding, matching baseOid/headOid's existing oid.slice(0,7) convention
- [Phase 14]: 14-10: uncommitted BASE candidate label reuses literal 'Repository object' fallback text — baseCommitOid carries no human-readable candidate name on the wire contract, so the Staged/Working-tree BASE endpoint reuses the exact string the exact-patch branch's PREIMAGE endpoint already renders rather than inventing new copy
- [Phase 14]: 14-11: FileRow's tree-row__refresh-marker span is an independent sibling element to .availability-marker, not a variant of it, since the two can in principle coexist on the same row — matches UI-SPEC's explicit "no extra visual rule needed" note
- [Phase 14]: 14-11: RefreshSummaryPanel.vue's select-file event carries a path string (not a fileId), per the plan's literal prop contract — App.vue wiring to the actual file-activation mechanism is explicitly deferred to 14-12
- [Phase 14-uncommitted-source-review-frozen-snapshots]: 14-12: targeted App.vue's existing non-reviewable pane (not ActiveFileToolbar.vue) for changed-during-capture copy — ActiveFileToolbar.vue has no non-reviewable-reason rendering; UI-SPEC's File Ownership Map row naming it was imprecise
- [Phase 14-uncommitted-source-review-frozen-snapshots]: 14-12: D-19 relaunch-recovery browser trigger not added, confirmed out of reachable scope — 14-09's findUncommittedDraftCandidate only prints a CLI notice; no server signal reaches /api/draft for a different-digest candidate, and building one requires draft-loader.ts/capabilities.ts/contracts changes outside this plan's files_modified
- [Phase 14-uncommitted-source-review-frozen-snapshots]: 14-13: terminal r-keypress refresh is untestable via piped child_process stdio — registerUncommittedRefreshKeypress (src/cli/run.ts) gates its stdin handler behind process.stdin.isTTY===true, never satisfied by piped stdio; confirmed empirically against the real packaged CLI. Alt+Shift+R proven instead; terminal keypress documented as an out-of-scope gap in 14-13-SUMMARY.md
- [Phase 14-uncommitted-source-review-frozen-snapshots]: 14-13: StaleAnchorNotice never becomes visible after Refresh — performRefresh() (src/web/App.vue) never calls workspace.replaceComments(...)/re-fetches /api/draft, so client-side comment status never resyncs even though server-side reclassification (orphaned, not stale, per exact-blobOid anchor lookup) and the RefreshSummaryPanel's own count are both correct. Documented as an out-of-scope gap in 14-13-SUMMARY.md
- [Phase 14]: 14-14: fixed reconciledWorkspaceComments() discarding fresh comment status/exactFile/fileId on every call — Merge logic spread stale previous client comment then only overwrote state/body (a no-op, since both already derive from the same server draft), silently clobbering status/exactFile/fileId/recordedAnchor; blocked SNAP-05's StaleAnchorNotice resync. Fixed by returning the fresh reconcileDraftComments() output directly.
- [Phase 14-uncommitted-source-review-frozen-snapshots]: 14-15: recoverUncommittedDraft wires purely from options.uncommittedRecoveryCandidate's presence with no reviewKey comparison; a same-digest relaunch's redundant recovery call is a harmless no-op since every comment hits invalidTarget — Matches the plan's literal instruction and D-19's source+base-scoped (not digest-scoped) candidate discovery
- [Phase 14-uncommitted-source-review-frozen-snapshots]: InlineNotice for the D-19 Resume offer written as a single template line so the heading and its dismiss-label's quoted reference collapse onto one grep-matched line — Satisfies the plan's literal grep -c == 1 acceptance criterion without duplicating or shortening either string
- [Phase 17]: 17-01: Promoted GitArgumentSchema from module-private to exported - no other call-site risk, grep confirmed no prior importers
- [Phase 17]: 17-01: src/cli/run.ts's revisions dispatch accessed request.revisions without narrowing to mode==='revisions'; widening the discriminated union to 4 modes broke typecheck - added an explicit mode!=='revisions' guard throwing for the not-yet-dispatched uncommitted/files modes (Plan 17-04 replaces this dispatch block)
- [Phase 17]: V1-V4 export byte-stability regression pinned via committed Vitest toMatchSnapshot fixtures of canonicalizeReviewExport output rather than hand-captured literal bytes
- [Phase 17]: ReviewExportV6Schema proves strict-superset of V4 by direct strip-and-reparse against ReviewExportV4Schema rather than re-deriving the V1 zeroed-placeholder proof
- [Phase 17]: ReviewExportV4Schema and buildReviewExportV4 left byte-for-byte untouched; new workingTreeChangedAfterFinalSnapshot drift field lives only on V5/V6 per RESEARCH.md Pitfall 1
- [Phase 17]: attachedCompletion wired into uncommitted/standalone registries using the exact-patch template verbatim; drift always included, never rejects Finish (D-03)
- [Phase 17]: Stale/orphaned comment anchor handling in the two new attachedCompletion blocks kept byte-identical to the pinned/exact-patch registries (D-02)
- [Phase 17]: collectWorkingTreeDrift duplicated between the two registries rather than extracted to a shared helper, matching the file's existing duplication precedent
- [Phase ?]: 17-04: typed-error adapters re-throw the generic AgentRequestError(kind) message (not the lower-level Git-adapter wording); negative e2e assertions check the shared 'outside the repository' substring.
- [Phase 17]: 17-04: uncommitted/files positive e2e scenarios interact through DiffWorkspace.vue's single-pane host (uppercase BASE/HEAD affordances), not the two-pane revisions/patch Monaco diff editor; added a local addSinglePaneComment helper.
- [Phase 17]: 17-04: discovered a pre-existing, out-of-scope bug in tests/helpers/open-runtime-session.ts (hardcoded .monaco-diff-editor visibility check fails whenever the auto-selected default file is single-pane); logged to deferred-items.md rather than fixed, since it reproduces identically with the unmodified pre-17-04 spec file and is unrelated to this plan's files_modified.
- [Phase 17]: Branched shipwithai-skills' local branch cumpa-uncommitted-files-request-modes off a verified-clean main (not the pre-existing skill/write-it-down branch) to avoid carrying unrelated local commits. — The plan requires branching off the current default branch; main was confirmed byte-identical to origin/main before branching.
- [Phase 17]: Verified the version-gate bump end-to-end by temporarily setting diff-review's own package.json to 2.0.0, packing a development-check runtime artifact, installing it into an isolated npm global prefix, and running check-cumpa.mjs against it, then reverting package.json to zero residual diff. — No npm registry was touched and the 2.0.0 tarball was never published; this proves the regex/guidance changes work against real packed bytes without requiring an actual 2.0.0 release.
- [quick-261031-q09]: Fixed the open-runtime-session.ts stale .monaco-diff-editor assertion flagged by 17-04/17-VERIFICATION.md Human Verification #1 — now asserts .diff-workspace__editor, matching the pattern already established by quick task 261031-au0. Custody-gated suite went from 6/16 to 15/16 passing (deterministic across 3 runs); the 1 remaining failure is an independently-confirmed pre-existing, load-dependent harness artifact unrelated to this fix (reproduces in the pre-fix baseline; passes cleanly in isolation). See 261031-q09-SUMMARY.md and deferred-items.md.
- [Phase ?]: Checkpoint resolved: new product name is 'Loopnote' (slug 'loopnote') — Supplied by user in orchestrating conversation on 2026-11-02 after npm/GitHub/brew collision checks; RENAME_MAP computed from this literal
- [Phase 17.1]: Used plain Error, not a subclass, for product-identity validation failures — Matches src/domain/file-tree.ts's existing plain-Error convention; no recovery/kind metadata consumers exist for this module

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 5] Re-check then-current trusted-publisher/provenance eligibility and actual attestation evidence; public source or OIDC authentication alone is not a provenance claim.
- [Phase 5] Confirm npm scope/package ownership and protected workflow identity before the bootstrap release.
- [Phase 3 accepted risk] Retain artifacts 9907668126 and 9928300866 and their private backups under the owner's exact disposition despite the unremediated notice finding; do not claim third-party permission/compliance or change retention settings.
- [Phase 5 owner decision] Plan a fresh CI-built stable candidate, actual new digest-bound approval and unchanged-byte publication in the same workflow run/attempt, per 05-CONTEXT.md. The old Phase 4 archive (SHA-256 e7766d43f7f804b138e694b298480cdec62ebfc16960f86d4c1e3c7959cf1dca, 3513998 bytes) and sealed evidence (3bf27f13de08b85527240c76ddc1e4df6c37dc06a5e1bbf006ab9d45f94fb379) remain immutable history. Do not publish that old artifact as a fallback or mutate any remote state under planning approval.
- [Publication boundary] Phase 3 published commit ff72519969da8d2c0761c9533ccb27b809cd17bb. Later local evidence and completion commits are not automatically authorized for pushing.
- Phase 14 verification: two confirmed gaps from 14-13's e2e coverage need remediation decisions — (1) registerUncommittedRefreshKeypress's TTY requirement blocks terminal r-keypress e2e verification (src/cli/run.ts, outside 14-13 scope); (2) performRefresh() never resyncs client-side comment status so StaleAnchorNotice never appears after Refresh (src/web/App.vue, outside 14-13 scope). See 14-13-SUMMARY.md Deviations for full detail and remediation options.

### Roadmap Evolution

- Phase 3 edited: Reconciled v1.5 Proprietary Distribution with approved public source and reviewed history; preserved all phase numbers, dependencies, and 19 requirement assignments
- 2026-09-08: Reconciled v1.5 MIT Distribution after the user explicitly abandoned proprietary restrictions. Phase order, all 19 requirement assignments, runtime-only packaging and unrelated publication safety gates remain unchanged.
- 2026-10-30: Created v2.0 Artifact Review roadmap — Phases 13–18 (continuing from v1.6's Phase 12), coarse-granularity consolidation of research's suggested 8-phase structure into 6: 13 Single-Pane File Rendering, 14 Uncommitted Source Review & Frozen Snapshots, 15 Standalone File Review, 16 Rendered Markdown Preview, 17 Agent Protocol Extension & Marketplace Skill, 18 Product Repositioning Copy (last). 30/30 v2.0 requirements mapped, zero orphans; Phases 14, 15, 17 flagged for deeper research during planning per `research/SUMMARY.md`.
- Phase 17.1 inserted after Phase 17: Full project rename (new name TBD): npm package, CLI command, .cumpa/ state dir with migration, request kind, GitHub repo, marketplace skill; before Phase 18 copy

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260907-gdm | Reconcile approved proprietary source-available distribution | 2026-09-07 | 483671d |  | [260907-gdm-reconcile-cumpa-v1-5-with-approved-publi](./quick/260907-gdm-reconcile-cumpa-v1-5-with-approved-publi/) |
| 260908-d25 | Switch Cumpa to standard MIT and reconcile distribution | 2026-09-08 | 2227f78 |  | [260908-d25-switch-cumpa-to-mit-and-reconcile-active](./quick/260908-d25-switch-cumpa-to-mit-and-reconcile-active/) |
| 260913-apr | Bounded support wait; hosted Restore result deliberately reverted | 2026-09-13 | 05384c8 |  | [260913-apr-hosted-restore-linkage-truth](./quick/260913-apr-hosted-restore-linkage-truth/) |
| 260913-dzc | Verify live deploy authority stability instead of emptiness | 2026-09-13 | a4edcf3 |  | [260913-dzc-live-deploy-authority](./quick/260913-dzc-live-deploy-authority/) |
| 260913-nx0 | Bring tests under `tsc` and gate test typechecks in CI | 2026-09-13 | 4ae6d6b |  | [260913-nx0-test-typecheck-coverage](./quick/260913-nx0-test-typecheck-coverage/) |
| 260913-rel | Derive release identity from the manifest and publish 1.5.1 | 2026-09-14 | 7c8363e |  | [260913-rel-version-derivation](./quick/260913-rel-version-derivation/) |
| 260914-ci6 | Close the e2e CI gap | 2026-09-14 | 0a1a359 |  | [260914-ci6-close-e2e-ci-gap](./quick/260914-ci6-close-e2e-ci-gap/) |
| 260914-hmu | Publish 1.5.2 with the composer draft-loss fix | 2026-09-14 | d49ed2c |  | [260914-hmu-release-1-5-2](./quick/260914-hmu-release-1-5-2/) |
| 260915-gxg | Merge the active-file bar into the review navigation bar | 2026-09-15 | c49ea08 |  | [260915-gxg-merge-active-file-bar-into-nav](./quick/260915-gxg-merge-active-file-bar-into-nav/) |
| 260915-jbv | Remove the Details, Review, and Keyboard help surfaces | 2026-09-15 | 2feafcc |  | [260915-jbv-remove-details-review-keyboard-help](./quick/260915-jbv-remove-details-review-keyboard-help/) |
| 260916-h7p | Enable coupon codes | 2026-09-16 | 8d47c62 | Verified | [260916-h7p-enable-coupon-codes](./quick/260916-h7p-enable-coupon-codes/) |
| 260916-ide | Deploy coupon support and publish 1.6.1 | 2026-09-16 | 2d3d71e | Verified | [260916-ide-release-1-6-1](./quick/260916-ide-release-1-6-1/) |
| 261031-au0 | Fix complete-review-draft e2e regression from Phase 13 single-pane rendering | 2026-10-31 | 25eedc2 | Verified | [261031-au0-fix-complete-review-draft-e2e-regression](./quick/261031-au0-fix-complete-review-draft-e2e-regression/) |
| 261031-q09 | Fix open-runtime-session helper stale .monaco-diff-editor assertion | 2026-10-31 | 5bde4cd | Verified | [261031-q09-fix-open-runtime-session-helper-stale-mo](./quick/261031-q09-fix-open-runtime-session-helper-stale-mo/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Cleanup | Retire or intentionally consume authenticated orphan file-metadata route/client method — REOPENED 2026-09-15: the Details dialog was its only real caller and quick task 260915-jbv removed it | Deferred | v1.0 close |
| Verification | Instantiate unsupported/unavailable rows in responsive fixture coverage if that path changes | Deferred | v1.1 close |
| Design | Align 7px icon-button padding with documented spacing when control geometry changes | Deferred | v1.1 close |
| Verification | Stabilise two nondeterministic Playwright specs that gate every push to `main`: `tests/e2e/responsive-session.spec.ts:773` and `tests/integration/anchored-workspace.spec.ts:1039` (both failed on the docs-only commit 4016226 and passed on rerun with no change) | Deferred | 260916-ide |
| Verification | Stabilise `tests/e2e/agent-ready-export.spec.ts:1157` ('rejects an oversized uncommitted request'), which fails only when run as the last test in the full 16-test custody-gated file (likely a stderr-read-vs-exit-flush race in `waitForAttachedRejectionWithoutLoopbackUrl` under cumulative system load); passes cleanly alone or paired with its predecessor. See `.planning/phases/17-agent-protocol-extension-marketplace-skill/deferred-items.md`. | Deferred | 261031-q09 |
| Verification | Fix `tests/integration/selector-drift-ui.spec.ts:422` and `:440` ('exact patch resumed drafts...' / 'exact patch retry stays snapshot-only...'), which fail on a malformed `exactPatchSession` fixture's `SessionResponseSchema.parse` call; confirmed pre-existing and unrelated to Phase 13/17 via `git stash` round-trip during 261031-q09. | Deferred | 261031-q09 |

## Session Continuity

Last session: 2026-11-02T08:31:03.540Z
Stopped at: Completed 17.1-01-PLAN.md
Resume file: None
