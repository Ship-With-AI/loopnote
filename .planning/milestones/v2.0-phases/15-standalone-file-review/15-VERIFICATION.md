---
phase: 15-standalone-file-review
verified: 2026-10-31T10:15:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 15: Standalone File Review Verification Report

**Phase Goal:** Users can open specific files or globs directly — tracked or untracked, changed or unchanged — without choosing Base/Head, review them full width, and finish with an export that proves exactly what was reviewed.
**Verified:** 2026-10-31T10:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User runs `cumpa <path\|glob>...` to open named files directly, tracked or untracked, changed or unchanged, with no Base/Head step | ✓ VERIFIED | `src/cli/run.ts:1326` registers `.argument('[paths...]', ...)` on the root command, dispatched before the `--staged/--unstaged/--worktree`/picker flow (`run.ts:1327-1343`). `launchStandaloneSession` (`run.ts:799-944`) resolves args → classifies git state → builds inventory → parses `UncommittedScopeSchema` with `sourceKind:'standalone'` → launches `createStandaloneSessionApp`. Proven live against the packaged binary in `tests/e2e/standalone-review.spec.ts:246-312` (happy path: 2 files, one tracked one untracked, rendered and exported) — e2e suite confirmed 50/50 passing by orchestrator; I independently re-ran `tests/git/standalone-resolution.test.ts`, `tests/api/standalone-session.test.ts`, `tests/unit/comparison-key.test.ts`, `tests/cli/errors.test.ts` (68/68 passed) as corroborating targeted evidence. |
| 2 | Path/glob arguments resolve with Git pathspec semantics, respect ignore rules; no-match argument fails before launch with a clear message | ✓ VERIFIED | `resolveStandaloneArguments`/`resolveOneArgument` (`src/git/standalone-resolution.ts:79-168`) issue per-argument `git ls-files --cached --others --exclude-standard` then, on zero matches, a `check-ignore` probe that distinguishes `"matched only a path excluded via .gitignore"` from `"did not match any file"`. Directory/glob recursion and overlap-dedup (keyed by `bytesBase64url`) confirmed by `tests/git/standalone-resolution.test.ts` (17 real-git-fixture cases, all passing). Pre-launch (no browser/URL) enforcement confirmed live by `tests/e2e/standalone-review.spec.ts:314-342` (nonexistent-path and ignored-path negative tests). |
| 3 | Clear pre-launch error for `../` traversal, absolute paths outside the repository, and symlink escapes | ✓ VERIFIED | `resolveOneArgument` catches Git's own exit-128 fatal pathspec rejection and translates it to `Argument "..." resolves outside the repository.` (`standalone-resolution.ts:90-95`); `check-ignore`'s own exit-128 "pathspec beyond symbolic link" fatal (undocumented in RESEARCH.md, found empirically per 15-01-SUMMARY.md) is collapsed into the standard "did not match any file" error so symlinked directories are never traversed. Unit-tested (`tests/git/standalone-resolution.test.ts`: traversal, absolute-outside, multi-segment-escape, direct-symlink, symlinked-directory cases). Live-proven end to end by `tests/e2e/standalone-review.spec.ts:357-423` (traversal, absolute-outside-tmp, symlink-escape — each asserts nonzero exit, no loopback URL printed). |
| 4 | Each standalone file renders full width with current working-tree content; user can comment on any line | ✓ VERIFIED | Standalone sessions reuse the Phase 13 single-pane surface (no diff toggle per D-01); `WorktreeSnapshot`/`captureWorktreeManifest`'s `inventoryForScope` helper (`src/server/worktree-snapshot.ts:248-260`) captures working-tree bytes via `createStandaloneChangedFileInventory` at capture time (byte-for-byte, independent of later on-disk edits, per D-03). `IdentityHeader.vue`/`ActiveFileToolbar.vue`/`FileRow.vue` render the D-02 text labels (`Standalone · Modified (uncommitted)` / `Untracked` / `Unchanged`) wired from `standaloneGitState` (confirmed both in computed definitions and template usage). Live-proven: `tests/e2e/standalone-review.spec.ts:261-275` opens a standalone session, asserts the `Standalone · Untracked` label, activates a single-pane line, fills a comment composer, and confirms a `201` from `/api/draft/mutations`. |
| 5 | User finishes a standalone-file review and exports Markdown plus canonical JSON whose provenance identifies exactly which paths and snapshot content were reviewed | ✓ VERIFIED | `buildReviewExportV4` (`src/export/review-export.ts:229`) produces a `schemaVersion: 4` document (`ReviewExportV4Schema`, `src/contracts/draft.ts:492`) carrying `originalArguments`, `resolvedPaths`, per-file `sha256` digests, and `snapshotChain`; `renderReviewMarkdown`'s `standalone` branch (`src/export/render-review-markdown.ts:84-113`) renders a `## Standalone files` + `## Standalone file digests` section with `Side: \`head\`` anchors only. `createStandaloneCapabilityRegistry.exportReview` (`src/server/capabilities.ts:1374`) wires this into `POST /api/export`; `export-store.ts` widened `ExportPublicationIdentity` with a `'standalone'` member. Live-proven: `tests/e2e/standalone-review.spec.ts:277-305` exports, reads the written `review.json` off disk, and independently recomputes `sha256` over the actual on-disk file bytes (not trusting the export's own claim) — both tracked and untracked file digests match exactly. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected (per plan) | Status | Details |
|----------|---------------------|--------|---------|
| `src/git/standalone-resolution.ts` | `resolveStandaloneArguments`, `classifyStandaloneGitState`, `createStandaloneChangedFileInventory`, `StandaloneGitState` (15-01) | ✓ VERIFIED | 234 lines; all four exports present and substantive (lines 28, 140, 170, 202); imports/reuses `buildUntrackedChangedFile` from `worktree-inventory.ts` as claimed. |
| `tests/git/standalone-resolution.test.ts` | Real-git-fixture coverage (15-01) | ✓ VERIFIED | 225 lines, 17 real-git-fixture tests + 2 injected-double tests, all passing (confirmed by targeted `vitest run`). |
| `src/contracts/comparison.ts` | `sourceKind` widened to `'standalone'`, `standaloneArguments`, `standaloneGitState` (15-02) | ✓ VERIFIED | Lines 131, 140, 145, 152, 171-184: widened enum, symmetric presence-enforcement `superRefine` for `standaloneArguments`, `isNoBaseKind` includes `'standalone'`. |
| `src/contracts/draft.ts` | `sourceKind` widened, `ReviewExportV4Schema` (15-02/15-04) | ✓ VERIFIED | Lines 95, 103, 473 (`StandaloneExportScopeSchema`), 492-498 (`ReviewExportV4Schema`, `schemaVersion: z.literal(4)`), 547-550 (`ReviewExportV4`/`StandaloneExportScope` types exported, `ReviewExport` union widened to 4 members). |
| `src/domain/comparison-key.ts` | `standaloneReviewKey(sortedOriginalArguments, firstSnapshotDigest)` (15-02) | ✓ VERIFIED | Line 56; domain-separated via dedicated `STANDALONE_DOMAIN` SHA-256 buffer (line 6), distinct from `uncommittedReviewKey`'s domain — tested in `tests/unit/comparison-key.test.ts` (6 passing cases incl. disjoint-hash-space from `uncommittedReviewKey`). |
| `src/server/worktree-snapshot.ts` | `sourceKind:'standalone'` manifest branch, `captureWorktreeManifest`/`refresh()` standalone path (15-03) | ✓ VERIFIED | Lines 21-24 (imports), 68/71 (schema widening), 78-109 (symmetric no-base-commit/standaloneArguments superRefine), 248-260 (`inventoryForScope` helper branches on `sourceKind === 'standalone'`), 289/358 (both expected/observed enumeration passes route through it), 404/668 (`standaloneArguments` carried through manifest assembly and `refresh()`). Named behavioral test `standalone sourceKind capture and refresh (Plan 15-03)` independently re-run and passing (2/2). |
| `src/export/review-export.ts` | `buildReviewExportV4(snapshot, standalone, exportedAt)` (15-04) | ✓ VERIFIED | Line 229; 299-line file, superset-chain pattern confirmed (mirrors V1→V2→V3). |
| `src/export/render-review-markdown.ts` | `schemaVersion === 4` rendering branch (15-04) | ✓ VERIFIED | Lines 48-113: `standalone` branch renders original arguments, resolved-path count, snapshot chain, per-file digests, `Anchor side: \`Head\``. |
| `src/server/capabilities.ts` | `createStandaloneCapabilityRegistry(scope, snapshot, options)` (15-06) | ✓ VERIFIED | Line 1150 (1448-line file); session/verifyAnchor/lookup/readContent/refresh/`exportReview`/`revealExportDirectory` all present (lines 1161-1448), `sourceKind` and `standaloneGitState` flow into `SessionResponseSchema.parse` (lines 1164-1181). |
| `src/server/app.ts` | `createStandaloneSessionApp(scope, options)` (15-06) | ✓ VERIFIED | Line 225. |
| `tests/cli/errors.test.ts` / `src/cli/run.ts` | `validateStandaloneExclusivity`, `launchStandaloneSession`, positional-arg registration (15-07) | ✓ VERIFIED | `run.ts:474` (`validateStandaloneExclusivity`), `run.ts:799` (`launchStandaloneSession`), `run.ts:1326` (`.argument('[paths...]', ...)`). Targeted `tests/cli/errors.test.ts` re-run, passing. |
| `tests/e2e/standalone-review.spec.ts` | Full launch→comment→export happy path + FILE-02/FILE-04 negative coverage against the real packaged CLI (15-08) | ✓ VERIFIED | 423 lines (exceeds 150-line minimum); 1 happy-path + 6 negative-path tests (nonexistent, ignored, `--worktree` exclusivity, `../` traversal, absolute-outside, symlink-escape) — all read `tests/e2e/standalone-review.spec.ts` in full; orchestrator-confirmed 50/50 e2e pass includes this file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `standalone-resolution.ts` | `src/git/runner.ts` | `GitRunnerError` exit-128 catch → FILE-04 error | ✓ WIRED | `standalone-resolution.ts:90-95`; confirmed both for `ls-files` (outside-repository) and `check-ignore` (symlink-beyond fatal, collapsed to "not ignored"). |
| `comparison.ts`/`draft.ts` | `src/server/draft-loader.ts` | `sameComparison()`'s generic `sourceKind`/`baseCommitOid`/`reviewKey` comparison, no code change needed | ✓ WIRED | Confirmed no `draft-loader.ts` changes were needed or made; `sourceKind === right.sourceKind` branch is generic over the 4-way enum. |
| `worktree-snapshot.ts` | `standalone-resolution.ts` | `inventoryForScope` calls `resolveStandaloneArguments`+`classifyStandaloneGitState`+`createStandaloneChangedFileInventory` when `sourceKind === 'standalone'` | ✓ WIRED | `worktree-snapshot.ts:254-260`, imports at lines 21-24. |
| `review-export.ts` | `draft.ts` | `buildReviewExportV4` parses `ReviewExportV4Schema`, delegates `buildReviewExportV1` with synthetic zero-OID comparison/drift | ✓ WIRED | Confirmed via superset-chain pattern (15-04-SUMMARY.md tech-stack note, cross-checked against file structure). |
| `App.vue` | `src/contracts/api.ts` | `isStandaloneSession` reads `uncommittedSession.sourceKind === 'standalone'` | ✓ WIRED | `App.vue:166`. |
| `app.ts` | `capabilities.ts` | `createStandaloneSessionApp` calls `createStandaloneCapabilityRegistry`, no `routes.ts` change (404-guards key off capability presence) | ✓ WIRED | Confirmed `createStandaloneSessionApp` exists (`app.ts:225`); `routes.ts` not in any plan's `files_modified`. |
| `cli/run.ts` | `standalone-resolution.ts` | `launchStandaloneSession` calls `resolveStandaloneArguments` before constructing the scope/app, so FILE-02/FILE-04 rejections throw before any browser/URL work | ✓ WIRED | `run.ts:850-875` (resolution) strictly precedes `run.ts:883` (`createApp`)/`914-916` (URL print); errors route to the single `catch` at line 932 which calls `shutdown.shutdown(1)` and never reaches the URL-print code path. |
| `cli/run.ts` | `server/app.ts` | `launchStandaloneSession` calls `createStandaloneSessionApp`, not `createUncommittedSessionApp` | ✓ WIRED | `run.ts:812-815`. |
| `tests/e2e/standalone-review.spec.ts` | `tests/e2e/uncommitted-review.spec.ts` | Reuses packed-CLI spawn/output-scraping harness, generalized for positional-argument invocation | ✓ WIRED | `startGeneratedStandaloneCli` (spec.ts:111-134) takes a `paths` array and spawns the packaged binary directly with those as argv, same `waitForLoopbackUrl`/`stopGeneratedCli` shape. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `tsc --noEmit` clean after all 8 plans' contract/server/CLI/web edits | `npx tsc --noEmit --project tsconfig.json` | Exit 0, no output | ✓ PASS |
| Standalone resolver resolves/rejects per Git pathspec semantics (FILE-01/02/04) | `npx vitest run tests/git/standalone-resolution.test.ts` | 19 tests passed | ✓ PASS |
| Standalone capability registry session/verifyAnchor/export behavior (FILE-03/05) | `npx vitest run tests/api/standalone-session.test.ts` | 7 tests passed | ✓ PASS |
| `standaloneReviewKey` domain-separation/stability | `npx vitest run tests/unit/comparison-key.test.ts` | 6 standalone-specific tests passed (of file total) | ✓ PASS |
| CLI mode-exclusivity validation | `npx vitest run tests/cli/errors.test.ts` | standalone-exclusivity cases passed (of file total) | ✓ PASS |
| Combined targeted run (all four files above, single invocation) | `npx vitest run tests/git/standalone-resolution.test.ts tests/api/standalone-session.test.ts tests/unit/comparison-key.test.ts tests/cli/errors.test.ts` | 4 files / 68 tests passed | ✓ PASS |
| Refresh() state-transition behavioral proof (named test, not full suite) | `npx vitest run tests/api/worktree-snapshot.test.ts -t "standalone sourceKind capture and refresh"` | 2 passed, 17 skipped (test-name filter) | ✓ PASS |
| Full e2e regression including `standalone-review.spec.ts` | Orchestrator-reported: `playwright test` full suite | 50/50 passing (orchestrator-confirmed; cited as corroborating evidence, not independently re-run per Step 7b "run full suite at most once" guidance — already run by orchestrator) | ✓ PASS (corroborating) |

Debt-marker scan (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/etc.) across all 18 phase-touched files: **zero matches**.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| FILE-01 | 15-01, 15-02, 15-07, 15-08 | `cumpa <path\|glob>...` opens named files without Base/Head | ✓ SATISFIED | Truth #1 above. |
| FILE-02 | 15-01, 15-07, 15-08 | Pathspec/ignore-rule resolution; clear no-match error pre-launch | ✓ SATISFIED | Truth #2 above. |
| FILE-03 | 15-02, 15-03, 15-05, 15-06, 15-08 | Full-width current working-tree content, commentable | ✓ SATISFIED | Truth #4 above. |
| FILE-04 | 15-01, 15-07, 15-08 | Pre-launch error for traversal/absolute-outside/symlink-escape | ✓ SATISFIED | Truth #3 above. |
| FILE-05 | 15-02, 15-04, 15-06, 15-08 | Export Markdown + canonical JSON with provenance | ✓ SATISFIED | Truth #5 above. |

No orphaned requirements: `.planning/REQUIREMENTS.md` maps only FILE-01..05 to Phase 15, and all five are claimed across the 8 plans' `requirements` frontmatter. (Note: REQUIREMENTS.md's checkbox/"Pending" column text is stale documentation-tracking state, not evidence of missing implementation — contradicted by direct code/test verification above; this is a docs-sync item for phase completion/ship tooling, not a code gap.)

### Anti-Patterns Found

None. Scanned all 18 phase-touched files (`src/git/standalone-resolution.ts`, `src/export/review-export.ts`, `src/export/render-review-markdown.ts`, `src/server/capabilities.ts`, `src/server/app.ts`, `src/server/export-store.ts`, `src/cli/run.ts`, `src/contracts/{comparison,draft,api}.ts`, `src/domain/comparison-key.ts`, `src/server/worktree-snapshot.ts`, `tests/e2e/standalone-review.spec.ts`, `src/web/components/{IdentityHeader,ActiveFileToolbar,FileRow}.vue`, `src/web/App.vue`) for debt markers, stub returns, empty handlers, hardcoded-empty props — zero matches.

The one scaffolding guard found (`src/server/capabilities.ts:902-906`, `RangeError('Unreachable: ... standalone sessions use a dedicated capability registry.')`) is a confirmed-correct permanent invariant, not leftover debt: `createStandaloneSessionApp` never calls `createUncommittedCapabilityRegistry`, so the guard's message is literally true and intentionally retained per 15-06-SUMMARY.md's key-decisions (verified by reading the surrounding code).

### Human Verification Required

None. All five observable truths resolved to ✓ VERIFIED with either a directly-read, substantively-wired code path, a passing targeted automated test, or (for the end-to-end happy-path/negative-path behaviors) a Playwright e2e spec that was read in full and whose assertions were confirmed to exercise the exact claimed behavior (browser-rendered labels, real `sha256` recomputation against on-disk bytes, real nonzero-exit/no-loopback-URL negative paths against the packaged CLI binary).

### Gaps Summary

None. All 5 roadmap success criteria and all `must_haves` truths/artifacts/key_links declared across the 8 plans' frontmatter (15-01 through 15-08) are directly verified against the current codebase — not just SUMMARY.md claims. `npx tsc --noEmit` is clean; targeted vitest runs (68 tests across the standalone-specific files, plus a named behavioral test for the Refresh state-transition invariant) all pass; the full e2e spec was read end-to-end and independently confirmed to assert the correct behaviors (orchestrator-reported 50/50 e2e pass cited as corroborating, not sole, evidence). No debt markers, no stub patterns, no orphaned requirements.

The post-hoc fix (`d1a46af`, restoring `@close="closeReviewNotes"` on the review-notes dialog, dropped by 15-05's `App.vue` edit) is confirmed present in the current `App.vue` (`:export-supported="!isUncommittedSession || isStandaloneSession"` / `@close="closeReviewNotes"` at lines 1396-1397) and is treated as already-applied ground truth per the assignment, not flagged.

---

_Verified: 2026-10-31T10:15:00Z_
_Verifier: the agent (gsd-verifier)_
