---
phase: 17-agent-protocol-extension-marketplace-skill
verified: 2026-10-31T17:10:28Z
status: human_needed
score: 10/15 must-haves verified
behavior_unverified: 5
behavior_unverified_items:
  - truth: "When a developer clicks Finish in an agent-attached uncommitted session, Cumpa delivers exactly one canonical ReviewExportV5 document to the agent and the draft is marked completed, per D-01 (17-03)."
    test: "tests/e2e/agent-ready-export.spec.ts: 'installed uncommitted review resolves worktree changes and emits canonical V5 only after Finish'"
    expected: "Exactly one ReviewExportV5 document on stdout after exit 0, draft completed."
    why_human: "The test exists, is substantive, and is wired, but currently fails before reaching its own assertions — blocked by a confirmed pre-existing, unrelated bug in tests/helpers/open-runtime-session.ts (asserts `.monaco-diff-editor` visible on first load; uncommitted/files/standalone sessions render through the single-pane `.diff-workspace__editor` host instead). Independently reproduced: swapping in the pre-17-04 spec content (git show 0a92585) and running two untouched pre-existing scenarios ('attached review blocks Finish while an inline composer has unsaved text', 'attached range review stays silent until Finish...') fails identically at the same locator, proving the blocker predates and is unrelated to this phase's dispatch code. Code-level wiring (buildReviewExportV5 call, attachedCompletion.finish delegation) is confirmed present and correctly structured by static inspection, but no currently-passing test exercises the end-to-end delivery."
  - truth: "When a developer clicks Finish in an agent-attached standalone session, Cumpa delivers exactly one canonical ReviewExportV6 document to the agent (17-03)."
    test: "tests/e2e/agent-ready-export.spec.ts: 'installed files review resolves standalone paths and emits canonical V6 only after Finish'"
    expected: "Exactly one ReviewExportV6 document on stdout after exit 0."
    why_human: "Same pre-existing `.monaco-diff-editor` blocker as above; code-level wiring confirmed, e2e proof currently blocked."
  - truth: "The delivered document's workingTreeChangedAfterFinalSnapshot.paths lists every file that changed on disk since the final snapshot was captured, not just the first one found, per D-03 (17-03)."
    test: "No test exercises multi-file drift accumulation."
    expected: "collectWorkingTreeDrift() loop (capabilities.ts:1118-1142, 1476-1500) uses `continue` (never `break`/early-return) and pushes every changed path into `changedPaths`, confirmed correct by direct code reading, but no unit or e2e test creates 2+ changed files after the final snapshot and asserts the delivered `paths` array contains all of them."
    why_human: "Presence + wiring confirmed; the no-short-circuit invariant itself is untested."
  - truth: "A coding agent that pipes a mode:'uncommitted' stdin request to the installed CLI and drives the browser to Finish receives exactly one canonical ReviewExportV5 result on stdout after exit 0 (17-04)."
    test: "tests/e2e/agent-ready-export.spec.ts: 'installed uncommitted review resolves worktree changes and emits canonical V5 only after Finish'"
    expected: "Exactly one canonical V5 result on stdout after exit 0."
    why_human: "Same pre-existing helper bug as above; this is the CLI-dispatch-level restatement of the same blocked scenario."
  - truth: "A coding agent that pipes a mode:'files' stdin request to the installed CLI and drives the browser to Finish receives exactly one canonical ReviewExportV6 result on stdout after exit 0 (17-04)."
    test: "tests/e2e/agent-ready-export.spec.ts: 'installed files review resolves standalone paths and emits canonical V6 only after Finish'"
    expected: "Exactly one canonical V6 result on stdout after exit 0."
    why_human: "Same pre-existing helper bug as above."
---

# Phase 17: Agent Protocol Extension & Marketplace Skill Verification Report

**Phase Goal:** Coding agents can request uncommitted and standalone-file reviews over the same stdin contract used for committed ranges, receive versioned canonical results carrying full provenance, and get specific validation errors before any browser launch — with the marketplace skill updated to match.
**Verified:** 2026-10-31T17:10:28Z
**Status:** human_needed

## Goal Achievement

### Observable Truths

| # | Truth (plan) | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent stdin JSON `mode:'uncommitted'`/`mode:'files'` parses into a frozen, typed `AgentReviewRequest` without touching revisions/patch branches (17-01) | ✓ VERIFIED | `src/contracts/request.ts:108-143` defines `UncommittedRequestSchema`/`FilesRequestSchema` in the discriminated union; `tests/unit/agent-request.test.ts` (14 cases) passes, including frozen round-trip assertions. `npx vitest run` confirms 0 failures. |
| 2 | `base` combined with `source:'unstaged'`, unrecognized mode, or malformed/oversized/non-UTF-8 input receives a specific `AgentRequestErrorKind` before any Git/browser work (17-01) | ✓ VERIFIED | `src/cli/request.ts` extends `AgentRequestErrorKind` to 11 members with priority-ordered pre-checks (`isUnknownMode`/`isBaseWithUnstaged`); unit tests assert `.kind === 'unknown-mode'` / `'base-with-unstaged'` pre-Git. |
| 3 | A finished uncommitted review's export parses as `ReviewExportV5Schema` with ordered snapshot digest chain + classified drift flag (17-02) | ✓ VERIFIED | `src/contracts/draft.ts:587-625` defines `ReviewExportV5Schema`; `tests/unit/review-export.test.ts`'s V5 describe block passes. |
| 4 | A finished standalone review's export parses as `ReviewExportV6Schema`, strict superset of V4 plus drift flag (17-02) | ✓ VERIFIED | `src/contracts/draft.ts:627-663`; V6 describe block proves strip-and-reparse-as-V4 superset; test passes. |
| 5 | Every pre-existing V1-V4 export fixture still parses/round-trips/serializes byte-for-byte unchanged (17-02) | ✓ VERIFIED | Committed Vitest snapshot regression test (`tests/unit/__snapshots__/review-export.test.ts.snap`) passes; `ReviewExportV4Schema`/`buildReviewExportV4` confirmed untouched by diff. |
| 6 | Finish in an agent-attached **uncommitted** session delivers exactly one canonical V5 document, draft marked completed (17-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present + wired (`capabilities.ts:1144-1200`, `buildReviewExportV5` called at :1157, `coordinator.finish` delegation at :1148) and follows the already-shipped exact-patch template exactly, but the only e2e test exercising this currently fails before reaching its own assertions — see Human Verification #1. |
| 7 | Finish in an agent-attached **standalone** session delivers exactly one canonical V6 document (17-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Same pattern, `capabilities.ts:1502-1568`, `buildReviewExportV6` at :1531. Same e2e blocker. |
| 8 | `workingTreeChangedAfterFinalSnapshot.paths` lists every changed file, not just the first found, per D-03 (17-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `collectWorkingTreeDrift()` (capabilities.ts:1118-1142, 1476-1500) uses `continue` not `break`/early-return — confirmed correct by direct code reading — but no test constructs 2+ changed files to exercise the invariant. |
| 9 | Stale/orphaned comment anchors at Finish handled identically to pinned/exact-patch registries (D-02, unchanged by Phase 17) (17-03) | ✓ VERIFIED | `attachedCompletion.prepare`/`finalize`'s `verification`/`affectedCommentIds`/`staleAnchors` short-circuit is byte-identical to the already-shipped templates (confirmed by diff reading); this is explicitly *not* new behavior, and the pre-existing pinned/exact-patch registry tests (unaffected by this plan) continue to pass. |
| 10 | CLI dispatch of `mode:'uncommitted'` delivers exactly one canonical V5 result on stdout after exit 0 (17-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `src/cli/run.ts:1190-1222` dispatch branch confirmed wired to `launchUncommittedAgentSession` → `launchAttachedSession`; blocked by the same e2e helper bug as #6. |
| 11 | CLI dispatch of `mode:'files'` delivers exactly one canonical V6 result on stdout after exit 0 (17-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `src/cli/run.ts:1224-1251`; blocked by the same e2e helper bug as #7. |
| 12 | Unknown mode / base+unstaged / path outside repo / pathspec no-match / pathspec ignored / base-with-unstaged all get a specific error + exit 1, empty stdout, no loopback URL (17-04) | ✓ VERIFIED | Independently re-ran the full targeted e2e spec: all 6 negative validation scenarios that don't require browser interaction pass cleanly (never hit the `.monaco-diff-editor` locator). The 7th (oversized-request regression) shows a Playwright "failed" status only from the file-shared `afterAll` `sourceControlEvidence()` bookkeeping artifact (it never hits the `.monaco-diff-editor` locator either — its own error output is `write EPIPE` + the shared afterAll mismatch, not a validation failure), consistent with the SUMMARY's documented explanation. |
| 13 | ShipWithAI skills repo has a local, unpushed branch with updated SKILL.md (uncommitted/files examples) and check-cumpa.mjs (accepts stable 2.0.0-2.x.x, rejects prereleases) (17-05) | ✓ VERIFIED | `/Users/alessandro/projects/shipwithai-skills` branch `cumpa-uncommitted-files-request-modes` exists at commit `065045c`, no remote-tracking ref, clean working tree. `git diff main..branch` confirms the exact SKILL.md/check-cumpa.mjs changes the SUMMARY claims (version gate bumped to `>=2.0.0 <3.0.0`, new "Native uncommitted and files modes" section with correct field names). |
| 14 | Locally packed `cumpa@2.0.0` tarball installs and `check-cumpa.mjs` accepts it, without any registry publish (17-05) | ✓ VERIFIED | `check-cumpa.mjs`'s new regex `/^2\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:\+[0-9A-Za-z-]+...)?$/` structurally matches `"2.0.0"` and rejects `"2.0.0-dev"` (the `$` anchor fails against the unconsumed `-dev` suffix, since the regex's only optional trailing group is `+buildmetadata`, not a prerelease segment) — confirms the version-gate logic is correct. SUMMARY documents the local pack/install/revert cycle (`diff-review` package.json reverted to `1.6.1` with zero residual diff, confirmed via `git status`). |
| 15 | Human told via blocking checkpoint to open the draft PR against `Ship-With-AI/skills` manually; GSD stops there (17-05) | ✓ VERIFIED | Plan is `autonomous: false`, Task 3 is `checkpoint:human-action` with `gate="blocking"`. Branch has no remote-tracking ref (`git for-each-ref refs/remotes/origin/cumpa-uncommitted-files-request-modes` returns nothing); nothing was pushed. See Human Verification #2. |

**Score:** 10/15 truths verified (5 present + wired, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/contracts/request.ts` | `UncommittedRequestSchema`/`FilesRequestSchema`, exported `GitArgumentSchema` | ✓ EXISTS + SUBSTANTIVE | Confirmed via grep; discriminated union has 4 members. |
| `src/cli/request.ts` | Extended `AgentRequestErrorKind`, `freezeRequest` branches | ✓ EXISTS + SUBSTANTIVE | 11-member error taxonomy confirmed. |
| `tests/unit/agent-request.test.ts` | Unit coverage, ≥60 lines | ✓ EXISTS + SUBSTANTIVE | 194 lines, 14 passing cases. |
| `src/contracts/draft.ts` | `ReviewExportV5Schema`/`V6Schema`, `WorkingTreeDriftFlagSchema` | ✓ EXISTS + SUBSTANTIVE | Confirmed at lines 587-666; `ReviewExport` union extended to 6 members. |
| `src/export/review-export.ts` | `buildReviewExportV5`/`V6`, extended `zodParseReviewExport` dispatch | ✓ EXISTS + SUBSTANTIVE | Confirmed at lines 280-394; dispatch covers `schemaVersion` 1-6. |
| `tests/unit/review-export.test.ts` | V5/V6 construction + V1-V4 regression, ≥260 lines | ✓ EXISTS + SUBSTANTIVE | 639 lines; all tests pass. |
| `src/server/capabilities.ts` | `attachedCompletion` on both uncommitted/standalone registries, drift helper | ✓ EXISTS + SUBSTANTIVE (WIRED, behavior unproven) | 1769 lines; `attachedCompletion` present at both registries (:1144, :1502); `collectWorkingTreeDrift` at both (:1118, :1476). Level 1-3 pass; Level 4 (functional e2e proof) blocked — see truths #6-8. |
| `src/cli/run.ts` | `mode:'uncommitted'`/`'files'` dispatch branches | ✓ EXISTS + SUBSTANTIVE (WIRED, behavior unproven) | 1510 lines; dispatch branches confirmed at :1190, :1224. Level 4 blocked — see truths #10-11. |
| `src/git/standalone-resolution.ts` | Typed `StandaloneResolutionError` class | ✓ EXISTS + SUBSTANTIVE | 267 lines; class confirmed at lines 12-20, replacing all 3 plain-`Error` throw sites. |
| `tests/e2e/agent-ready-export.spec.ts` | Positive + negative stdin scenarios, ≥900 lines | ✓ EXISTS + SUBSTANTIVE | 1180 lines; negative scenarios (6/7) pass cleanly, positive scenarios blocked by pre-existing helper bug. |
| `shipwithai-skills/skills/cumpa/SKILL.md` | New mode section, bumped prerequisite | ✓ EXISTS + SUBSTANTIVE | Confirmed via `git diff main..cumpa-uncommitted-files-request-modes`. |
| `shipwithai-skills/skills/cumpa/scripts/check-cumpa.mjs` | Version-gate regex bumped, no minor floor | ✓ EXISTS + SUBSTANTIVE | Confirmed via same diff; regex proof above. |

**Artifacts:** 12/12 exist and are substantive (2 of the 12 — `capabilities.ts`, `cli/run.ts` — are wired correctly but their Finish-delivery behavior is not currently provable end-to-end; see Human Verification).

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/contracts/request.ts` | `src/cli/request.ts` | `readAgentReviewRequest` → `AgentReviewRequestSchema.safeParse` → `freezeRequest` | ✓ WIRED | Confirmed by automated `verify.key-links` tool and manual read. |
| `src/export/review-export.ts` | `src/contracts/draft.ts` | `buildReviewExportV5`/`V6` call `ReviewExportV5Schema.parse`/`ReviewExportV6Schema.parse` | ✓ WIRED | Automated tool reported a false negative (double-escaped regex `\\.` literal mismatch in its own pattern string); manually confirmed `ReviewExportV5Schema.parse({...})` at review-export.ts:316 and `ReviewExportV6Schema.parse(...)` in `buildReviewExportV6`. |
| `src/export/review-export.ts` | `src/contracts/draft.ts` | `zodParseReviewExport` dispatches `schemaVersion === 5`/`=== 6` | ✓ WIRED | Automated tool false negative (same regex-escaping issue); manually confirmed at review-export.ts:391-392. |
| `src/server/capabilities.ts` | `src/export/review-export.ts` | `attachedCompletion.prepare` calls `buildReviewExportV5`/`V6` | ✓ WIRED | Automated tool reported "Invalid regex pattern" (its own character-class escaping bug); manually confirmed call sites at capabilities.ts:1157 and :1531. |
| `src/server/capabilities.ts` | `src/server/attached-completion.ts` | `attachedCompletion.finish` → `coordinator.finish(expectedRevision, operation)` | ✓ WIRED | Automated tool false negative; manually confirmed at capabilities.ts:1148 and :1506 (both registries). |
| `src/cli/run.ts` | `src/server/app.ts` | New dispatch branches call `launchAttachedSession(...)` wrapping `createUncommittedSessionApp`/`createStandaloneSessionApp` | ✓ WIRED | Automated tool confirms pattern found. |
| `src/cli/run.ts` | `src/git/standalone-resolution.ts` | files-mode branch catches `StandaloneResolutionError.kind` via `mapStandaloneResolutionError` | ✓ WIRED | Automated tool confirms; manually confirmed at run.ts:1085-1090, 1232. |
| `tests/e2e/agent-ready-export.spec.ts` | `src/cli/request.ts` | Negative scenarios assert specific `AgentRequestErrorKind` message text + exit 1 before any loopback URL | ✓ WIRED | Automated tool confirms; independently re-run and 6/7 negative scenarios pass cleanly. |
| `skills/cumpa/scripts/check-cumpa.mjs` | local tarball `cumpa --version` | `spawnSync('cumpa', ['--version'], {shell:false})` probe | ✓ WIRED | Automated tool reported "source file not found" (path resolution limitation — the skills repo is outside the `diff-review` cwd the tool resolves relative paths against); manually confirmed the probe mechanics are unchanged from the pre-existing checker, only the acceptance regex/guidance text changed. |

**Wiring:** 9/9 links confirmed wired by manual code inspection (3 automated-tool "false negatives" were tool regex-escaping/path-resolution limitations, not real gaps — all independently cross-checked by direct `grep`/`read` against the source).

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|-----------------|
| AGENT-06: Coding agent submits uncommitted stdin request, receives one canonical JSON result | ✓ SATISFIED (behavior unverified via e2e) | Schema, dispatch, export builder, and wiring are all present, substantive, and structurally correct, matching the already-shipped exact-patch pattern exactly. End-to-end delivery proof is currently blocked by a pre-existing, unrelated test-harness bug (Human Verification #1), not a defect in this phase's code. |
| AGENT-07: Coding agent submits standalone-file stdin request, receives one canonical JSON result | ✓ SATISFIED (behavior unverified via e2e) | Same as AGENT-06, standalone path. |
| AGENT-08: New versioned export formats carry provenance; V1-V3 (and V4) exports unchanged | ✓ SATISFIED | Fully proven by passing unit tests (V5/V6 construction + V1-V4 byte-stability regression), independent of the e2e blocker. |
| AGENT-09: Specific validation error before any browser launch for malformed/oversized/out-of-repository requests | ✓ SATISFIED | Fully proven — 6/7 negative e2e scenarios pass cleanly; the 7th's validation logic itself is unaffected by the shared harness artifact (see truth #12). |
| SKL-04: Marketplace skill updated for the new modes, CLI version prerequisite bumped | ✓ SATISFIED | Skill update verified on the unpushed local branch; version-gate regex proof confirmed. PR opening is deliberately a human-only step per D-05 (Human Verification #2). |

**Coverage:** 5/5 requirements satisfied at the code/structural level; AGENT-06/AGENT-07's full end-to-end behavioral proof awaits the test-harness fix (Human Verification #1).

### Decision Coverage

`gsd-tools.cjs query check.decision-coverage-verify` reports: **6/6 trackable CONTEXT.md decisions honored by shipped artifacts** (D-01 through D-06, including the Phase 17.1 amendments to D-04/D-05/D-06). No unhonored decisions.

## Anti-Patterns Found

Scanned all files touched by Phase 17 (`src/contracts/request.ts`, `src/cli/request.ts`, `src/contracts/draft.ts`, `src/export/review-export.ts`, `src/server/capabilities.ts`, `src/cli/run.ts`, `src/git/standalone-resolution.ts`, `tests/e2e/agent-ready-export.spec.ts`, `tests/unit/agent-request.test.ts`, `tests/unit/review-export.test.ts`) for `TODO`/`FIXME`/`XXX`/`HACK`/`TBD`/placeholder patterns.

**No matches found.** No stub patterns, placeholder content, or disabled-code markers in any Phase 17 deliverable.

**Anti-patterns:** 0 found.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|------------------|---------|
| `tests/unit/agent-request.test.ts` | AGENT-06/07/09 | 14 | 0 | No | Value + frozen-state | Sufficient |
| `tests/unit/review-export.test.ts` | AGENT-08 | includes V5/V6 + V1-V4 regression | 0 | No | Value (strict-superset parse + snapshot) | Sufficient |
| `tests/e2e/agent-ready-export.spec.ts` (2 new positive scenarios) | AGENT-06/07/08 | 2 (not skipped) | 0 | No | Behavioral (would be, if it ran) | **Blocked — not disabled, not circular, but currently non-executing to completion** due to a confirmed pre-existing bug in a shared test helper (`tests/helpers/open-runtime-session.ts`), independently reproduced against the pre-17-04 spec content on two unrelated, untouched scenarios. This is distinct from a disabled/skipped test (`it.skip` etc. — none found) or a circular test (expected values are not derived from the system under test) — the test is well-formed and would prove the behavior once the helper is fixed. |
| `tests/e2e/agent-ready-export.spec.ts` (7 new negative scenarios) | AGENT-09 | 7 (not skipped) | 0 | No | Status + value (exit code, message substring, empty stdout, no loopback URL) | Sufficient — 6/7 independently confirmed passing; 7th's validation logic confirmed unaffected by the shared harness artifact. |

**Disabled tests on requirements:** 0 → not a blocker.
**Circular patterns detected:** 0 → not a blocker.
**Insufficient assertions:** 0 → not a blocker.

No test-quality BLOCKER found. The e2e harness blocker is a genuine evidence gap (hence the `PRESENT_BEHAVIOR_UNVERIFIED` truths above and `human_needed` status) but does not meet the `gaps_found` bar: it is not a disabled test, not a circular test, and independently confirmed to predate and be unrelated to this phase's own code changes.

## Human Verification Required

### 1. Fix the pre-existing `.monaco-diff-editor` test-helper bug, then re-run the two new positive e2e scenarios
**Test:** Apply the fix `deferred-items.md` proposes (`tests/helpers/open-runtime-session.ts` should wait on `.diff-workspace__editor` instead of the Monaco-internal `.monaco-diff-editor` class, or wait for file-tree auto-selection to settle), then run `npm run test:runtime-artifact -- tests/e2e/agent-ready-export.spec.ts` against a fresh `development-check` runtime artifact.
**Expected:** All scenarios pass, including `'installed uncommitted review resolves worktree changes and emits canonical V5 only after Finish'` and `'installed files review resolves standalone paths and emits canonical V6 only after Finish'`, confirming the delivered document contains exactly one well-formed V5/V6 export with the submitted comment.
**Why human:** This requires a source-code fix outside Phase 17's declared `files_modified` scope (the plan's own `deferred-items.md` explicitly scopes it out as "its own small fix-and-regression-check task"); it is not something this verification pass may silently patch per its read/verify/report-only scope boundary. Independently confirmed as pre-existing (not a 17-04 regression) by reproducing the identical failure against the pre-17-04 spec content on two scenarios 17-04 never touched (`'attached review blocks Finish while an inline composer has unsaved text'`, `'attached range review stays silent until Finish...'`).

### 2. Open the draft PR against `Ship-With-AI/skills`
**Test:** From `/Users/alessandro/projects/shipwithai-skills`, push branch `cumpa-uncommitted-files-request-modes` and open a draft PR against `Ship-With-AI/skills`, once the real Cumpa `2.0.0`-equivalent release has published (per D-05 — release operations happen outside GSD execution).
**Expected:** A draft PR exists on `Ship-With-AI/skills` carrying the uncommitted/files mode documentation and the `>=2.0.0 <3.0.0` version-gate bump.
**Why human:** Genuinely out of scope for automated execution by design (D-05: "prepare, land after release"); Plan 17-05 is `autonomous: false` and ends at a `checkpoint:human-action` specifically to stop before this step. No push or remote mutation occurred — confirmed via `git for-each-ref refs/remotes/origin/cumpa-uncommitted-files-request-modes` (empty) and `git status` (clean, nothing to push).

## Gaps Summary

**No gaps found.** Every artifact exists, is substantive, and is wired correctly; no disabled/circular tests; no stub/placeholder anti-patterns; all 6 CONTEXT.md decisions honored. The two outstanding items are both routed to Human Verification, not Gaps:

1. **End-to-end behavioral proof of V5/V6 Finish-delivery is currently blocked** by a confirmed pre-existing, unrelated test-harness bug (not a Phase 17 regression) — 5 truths marked `PRESENT_BEHAVIOR_UNVERIFIED` rather than failed.
2. **The draft-PR step is a genuine, deliberately-scoped human-only action** (D-05) that Plan 17-05's own design stops before performing.

Neither item reflects a defect in Phase 17's shipped code. No fix plan is generated because `determine_status`'s `gaps_found` criteria (missing/stub artifacts, not-wired links, test-quality blockers, failed truths) are not met.

## Verification Metadata

**Verification approach:** Goal-backward, must-haves from PLAN frontmatter (all 5 plans), aggregated.
**Must-haves source:** `17-01-PLAN.md` through `17-05-PLAN.md` frontmatter `must_haves` blocks.
**Automated checks:** `npx vitest run` (6 files, 108 tests) passed; `npx tsc --noEmit --project tsconfig.json` passed; `npm run typecheck:tests:node` passed; `gsd-tools.cjs query verify.artifacts`/`verify.key-links` run for all 5 plans (3 key-link "not found" results were tool-side regex-escaping/path-resolution false negatives, independently overridden by manual `grep`/`read` confirmation); `gsd-tools.cjs query check.decision-coverage-verify` reported 6/6 honored.
**Behavioral verification:** Packed a fresh `development-check` runtime artifact (`npm run pack:runtime-artifact -- --purpose development-check`) and ran `npx playwright test --config playwright.runtime-artifact.config.ts tests/e2e/agent-ready-export.spec.ts` in full (15 tests: 6 passed, 9 failed — directionally matching the SUMMARY's self-reported 6 passed/10 failed, off by one likely from scheduling/flakiness in the shared cascading `afterAll` hook, not a material discrepancy). Independently reproduced the claimed pre-existing bug: swapped in the exact pre-17-04 spec content (`git show 0a92585:tests/e2e/agent-ready-export.spec.ts`), ran two untouched pre-existing scenarios in isolation, and both failed identically at the same `tests/helpers/open-runtime-session.ts:26` `.monaco-diff-editor` locator — confirming the SUMMARY's claim that this is pre-existing and not a 17-04 regression. Restored the spec file to its current committed content afterward (confirmed zero residual diff).
**Independent finding on the `open-runtime-session.ts` bug claim:** **CONFIRMED PRE-EXISTING.** The blocker is caused by `openRuntimeSession()` asserting `.monaco-diff-editor` is visible on first page load, which never appears when the auto-selected file renders through `DiffWorkspace.vue`'s single-pane adapter (used by uncommitted/files/standalone scopes and by any `revisions`/`patch` session whose alphabetically-first changed file is added/deleted-only). `git diff --stat d184100~1 75ccbfd` confirms Plan 17-04 touched only `src/cli/run.ts`, `src/git/standalone-resolution.ts`, and `tests/e2e/agent-ready-export.spec.ts` — never `tests/helpers/open-runtime-session.ts` or any `src/web/**` file. Reproducing with the pre-17-04 spec content against the exact same (current) built dist, two pre-existing, untouched scenarios failed at the identical locator/line, proving the defect predates and is independent of this phase's changes.
**Human checks required:** 2 (test-harness fix + re-run; draft-PR opening).
**Total verification time:** ~45 min (including one ~2 min full e2e run and three smaller targeted e2e re-runs).

---
*Verified: 2026-10-31T17:10:28Z*
*Verifier: Exec17.Verify17 (subagent)*
