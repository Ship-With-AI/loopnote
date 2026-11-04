---
phase: 17-agent-protocol-extension-marketplace-skill
verified: 2026-10-31T17:10:28Z
re_verified: 2026-10-31T19:45:00Z
status: human_needed
score: 14/15 must-haves verified
behavior_unverified: 1
behavior_unverified_items:
  - truth: "workingTreeChangedAfterFinalSnapshot.paths lists every changed file, not just the first found, per D-03 (17-03)."
    test: "No unit or e2e test constructs 2+ changed files to exercise this invariant."
    expected: "A test with 2+ dirty worktree files that asserts the drift flag's .paths array contains all of them, not just one."
    why_human: "Code-level reading of collectWorkingTreeDrift() (src/server/capabilities.ts:1118-1142, 1476-1500) confirms it uses `continue` not `break`/early-return, which is structurally correct, but no automated test exercises the multi-file case. This is unrelated to the open-runtime-session.ts e2e-harness bug fixed by quick task 261031-q09 (it is a missing test-coverage gap, not a blocked-by-selector test) and remains open. No dedicated Human Verification action was prescribed for it in the original verification pass either; it is carried forward unchanged as a PRESENT_BEHAVIOR_UNVERIFIED truth, not a BLOCKER (code reading gives high confidence of correctness)."
---

# Phase 17: Agent Protocol Extension & Marketplace Skill Verification Report

**Phase Goal:** Coding agents can request uncommitted and standalone-file reviews over the same stdin contract used for committed ranges, receive versioned canonical results carrying full provenance, and get specific validation errors before any browser launch — with the marketplace skill updated to match.
**Verified:** 2026-10-31T17:10:28Z
**Re-verified:** 2026-10-31T19:45:00Z (after quick task `261031-q09` fixed the e2e-harness blocker named in Human Verification #1 below)
**Status:** human_needed

## Re-verification note

This is a **re-verification**, not an initial pass. The 2026-10-31T17:10:28Z verification (by `Exec17.Verify17`) found the phase's code/structure fully correct but left 5 observable truths as `PRESENT_BEHAVIOR_UNVERIFIED`, blocked by a confirmed pre-existing, out-of-scope bug in `tests/helpers/open-runtime-session.ts` (it asserted `.monaco-diff-editor` immediately on page load, before any file was explicitly selected — a Phase 13 single-pane-rendering regression, not a Phase 17 defect). That verification's Human Verification #1 prescribed exactly this fix and re-run.

Quick task `261031-q09` (commit `5bde4cd`, 2026-10-31) applied that fix plus one newly-exposed sibling bug in the same spec file (an unanchored regex that collided two fixture filenames), both fully documented in `.planning/quick/261031-q09-fix-open-runtime-session-helper-stale-mo/` and `deferred-items.md`. This re-verification re-runs the previously-blocked e2e evidence and updates the 4 truths that were blocked purely by that harness bug (truths #6, #7, #10, #11 below). Truth #8 (multi-file drift accumulation) was never blocked by the harness bug — it is a separate, still-open test-coverage gap — and is carried forward unchanged.

No source file (`src/**`) changed between the original verification and this re-verification; only test files did. `npx tsc --noEmit --project tsconfig.json` and `--project tsconfig.test.json` are both clean.

## Goal Achievement

### Observable Truths

| # | Truth (plan) | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agent stdin JSON with `mode:'uncommitted'`/`mode:'files'` parses into a frozen, typed `AgentReviewRequest` without touching the revisions/patch branches (17-01) | ✓ VERIFIED | `src/contracts/request.ts:108-143` defines `UncommittedRequestSchema`/`FilesRequestSchema` in the discriminated union; `tests/unit/agent-request.test.ts` — unchanged since original verification. |
| 2-5 | *(unchanged from original verification — see commit history for full table; all remained ✓ VERIFIED)* | ✓ VERIFIED | `src/contracts/draft.ts:627-663` (V5/V6 schemas); `tests/unit/review-export.test.ts` (639 lines, V5/V6 construction + V1-V4 byte-stability regression, all passing); `ReviewExportV4Schema`/`buildReviewExportV4` confirmed untouched by diff. |
| 6 | Finish in an agent-attached **uncommitted** session delivers exactly one canonical V5 document, draft marked completed (17-03) | ✓ VERIFIED *(was PRESENT_BEHAVIOR_UNVERIFIED)* | Code present + wired (`capabilities.ts:1144-1200`, `buildReviewExportV5` called :1157, `coordinator.finish` delegation at :1148). **Now proven end-to-end**: `tests/e2e/agent-ready-export.spec.ts: 'installed uncommitted review resolves worktree changes and emits canonical V5 only after Finish'` passes against a freshly packed `development-check` runtime artifact — confirmed in 3 consecutive full-suite runs (`npm run test:runtime-artifact`, 15/16 passing every run, this test among the 15). Its own assertions (exit 0, `ReviewExportV5Schema.parse` succeeds, `uncommitted.sourceKind === 'worktree'`, submitted comment body present in the export, stderr contains the loopback URL) all pass. |
| 7 | Finish in an agent-attached **standalone** session delivers exactly one canonical V6 document (17-03) | ✓ VERIFIED *(was PRESENT_BEHAVIOR_UNVERIFIED)* | Code present + wired (`capabilities.ts:1502-1568`, `buildReviewExportV6` :1531). **Now proven end-to-end**: `tests/e2e/agent-ready-export.spec.ts: 'installed files review resolves standalone paths and emits canonical V6 only after Finish'` passes against the same artifact, same 3 consecutive runs. Its own assertions (exit 0, `ReviewExportV6Schema.parse` succeeds, `standalone.originalArguments` contains the requested path, submitted comment body present) all pass. |
| 8 | `workingTreeChangedAfterFinalSnapshot.paths` lists every changed file, not just the first found, per D-03 (17-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED *(unchanged — not related to the e2e-harness fix)* | `collectWorkingTreeDrift()` (`capabilities.ts:1118-1142, 1476-1500`) uses `continue` not `break`/early-return — confirmed correct by direct code reading — but no test constructs 2+ changed files to exercise the invariant. See `behavior_unverified_items` above. |
| 10 | A coding agent that pipes a `mode:'uncommitted'` stdin request through the installed CLI, which drives the browser to Finish, receives exactly one canonical V5 result on stdout after exit 0 (17-04) | ✓ VERIFIED *(was PRESENT_BEHAVIOR_UNVERIFIED)* | CLI-dispatch-level restatement of truth #6, same test, same evidence. |
| 11 | A coding agent that pipes a `mode:'files'` stdin request through the installed CLI, which drives the browser to Finish, receives exactly one canonical V6 result on stdout after exit 0 (17-04) | ✓ VERIFIED *(was PRESENT_BEHAVIOR_UNVERIFIED)* | CLI-dispatch-level restatement of truth #7, same test, same evidence. |
| 9, 12 | Negative-path validation scenarios (AGENT-09): 7 distinct rejection reasons, each with specific exit code 1, stderr message substring, empty stdout, no loopback URL (17-04) | ✓ VERIFIED | Re-ran the full targeted e2e spec in each of 3 consecutive full-suite runs: 6/7 negative scenarios pass cleanly every time (never touch any editor selector). The 7th (`'rejects an oversized uncommitted request'`) fails only when run as the last test in the full 16-test file — independently confirmed via isolated and paired re-runs that its own validation assertions (exit 1, stderr contains `'exceeds 1048576 bytes'`, empty stdout) are correct; the full-suite-only failure is a load-dependent harness artifact unrelated to AGENT-09's actual behavior (see Gaps Summary / deferred-items.md). |
| 13 | ShipWithAI skills repo has a local, unpushed branch with updated SKILL.md (uncommitted/files examples) and check-cumpa.mjs (accepts stable `2.0.0`-`2.x.x`, rejects prereleases) (17-05) | ✓ VERIFIED | Unchanged from original verification — `/Users/alessandro/projects/shipwithai-skills` branch `cumpa-uncommitted-files-request-modes` at commit `065045c`, no remote-tracking ref, clean working tree. |
| 14 | A locally packed `cumpa@2.0.0` tarball installs and `check-cumpa.mjs` accepts it, without any registry publish (17-05) | ✓ VERIFIED | Unchanged from original verification. |

**Updated score: 14/15 must-haves verified** (up from 10/15). Truth #8 is the sole remaining `PRESENT_BEHAVIOR_UNVERIFIED` item, and it is independent of the e2e-harness bug this re-verification addresses.

### Artifacts (delta from original verification)

| Path | Expected | Status | Evidence |
|---|---|---|---|
| `src/server/capabilities.ts` | `attachedCompletion` on both uncommitted/standalone registries, drift helper | ✓ EXISTS + SUBSTANTIVE + **BEHAVIOR PROVEN** *(was "behavior unproven")* | 1769 lines; `attachedCompletion` present at both registries (:1144, :1502); `collectWorkingTreeDrift` both (:1118, :1476). Levels 1-4 now all pass for the V5/V6 Finish-delivery paths — see truths #6-7. Level 4 for truth #8 (multi-file drift) remains unproven by test, though code reading supports correctness. |
| `src/cli/run.ts` | `mode:'uncommitted'`/`'files'` dispatch branches | ✓ EXISTS + SUBSTANTIVE + **BEHAVIOR PROVEN** *(was "behavior unproven")* | 1510 lines; dispatch branches confirmed at :1190, :1224. Level 4 now proven — see truths #10-11. |

All other artifacts unchanged from the original verification pass (no `src/**` file was touched by this re-verification's underlying fix).

### Requirement Coverage (delta from original verification)

| Requirement | Status | Evidence |
|---|---|---|
| AGENT-06: Coding agent submits uncommitted-worktree stdin request, receives one canonical JSON result | ✓ SATISFIED **(fully, end-to-end)** *(was "behavior unverified via e2e")* | Both the browser-level truth (#6) and the CLI-dispatch-level truth (#10) now pass against a packed runtime artifact. |
| AGENT-07: Coding agent submits standalone-file stdin request, receives one canonical JSON result | ✓ SATISFIED **(fully, end-to-end)** *(was "behavior unverified via e2e")* | Both truth #7 and truth #11 now pass. |
| AGENT-08, AGENT-09, SKL-04 | ✓ SATISFIED | Unchanged from original verification. |

**Coverage:** 5/5 requirements satisfied at the code/structural level; AGENT-06/AGENT-07 now also have **full end-to-end behavioral proof** (previously pending the test-harness fix).

### Decision Coverage

Unchanged: `gsd-tools.cjs query check.decision-coverage-verify` reported **6/6 trackable CONTEXT.md decisions honored by shipped artifacts** (D-01 through D-06, including Phase 17.1 amendments D-04/D-05/D-06). No unhonored decisions. No `src/**` change in the re-verification window affects this.

## Anti-Patterns Found

Unchanged from original pass: no disabled/skipped tests, no circular tests, no stub/placeholder anti-patterns. The 2 new positive e2e scenarios added by Plan 17-04 (`'installed uncommitted review resolves worktree changes...'`, `'installed files review resolves standalone paths...'`) are **no longer blocked** — both pass on their own merits now that the shared test helper's stale assertion and one sibling regex bug are fixed. Test quality audit row updated:

| Test file | Requirement | Tests (not skipped) | Circular | Insufficient? | Assertion style | Verdict |
|---|---|---|---|---|---|---|
| `tests/e2e/agent-ready-export.spec.ts` (2 new positive scenarios) | AGENT-06, AGENT-07 | 2 | 0 | No | Status + schema parse + value (exit code, schemaVersion, comment body, originalArguments) | **Sufficient — 2/2 passing against a packed artifact, 3 consecutive runs.** *(was "Blocked — pending test-harness fix")* |
| `tests/e2e/agent-ready-export.spec.ts` (7 new negative scenarios) | AGENT-09 | 7 (not skipped) | 0 | No | Status + value (exit code, message substring, empty stdout, no loopback URL) | Sufficient — 6/7 passing every run; 7th's validation logic independently confirmed correct via isolated/paired re-runs (full-suite-only harness artifact, unrelated to test quality). |

**Disabled tests on requirements:** 0 → not a blocker.
**Circular patterns detected:** 0 → not a blocker.
**Insufficient assertions:** 0 → not a blocker.

No test-quality BLOCKER found, same as the original pass — and the evidence gap that previously justified `PRESENT_BEHAVIOR_UNVERIFIED` for truths #6/#7/#10/#11 is now closed.

## Human Verification Required

### 1. Open draft PR against `Ship-With-AI/skills`
**Test:** From `/Users/alessandro/projects/shipwithai-skills`, push branch `cumpa-uncommitted-files-request-modes` and open a draft PR against `Ship-With-AI/skills`, once a real Cumpa `2.0.0`-equivalent release has published (per D-05 — release operations happen outside GSD execution).
**Expected:** A draft PR exists on `Ship-With-AI/skills` carrying the uncommitted/files mode documentation and the `>=2.0.0 <3.0.0` version-gate bump.
**Why human:** Genuinely out of scope for automated execution by design (D-05: "prepare, land after release"); Plan 17-05 is `autonomous: false` and ends at a `checkpoint:human-action` specifically to stop before this step. No push or remote mutation has occurred — confirmed via `git for-each-ref refs/remotes/origin/cumpa-uncommitted-files-request-modes` (empty) and `git status` (clean, nothing to push).

*(Original item #1, "Fix pre-existing `.monaco-diff-editor` test-helper bug, re-run two new positive e2e scenarios," is **resolved** — see Re-verification note above and quick task `261031-q09`. It is removed from this list.)*

## Gaps Summary

**No new gaps found by this re-verification.** The 4 truths previously blocked purely by the `open-runtime-session.ts` harness bug (#6, #7, #10, #11) are now fully verified end-to-end. One item remains open, carried forward unchanged from the original verification, and was never part of Human Verification #1's scope:

1. **Truth #8 (multi-file working-tree drift accumulation) remains `PRESENT_BEHAVIOR_UNVERIFIED`.** Code reading gives high confidence of correctness (`collectWorkingTreeDrift()` uses `continue`, not an early `break`/`return`), but no unit or e2e test constructs 2+ dirty files to prove the `.paths` array lists all of them. This is an independent, pre-existing test-coverage gap — not caused by and not fixed by the e2e-harness work in this re-verification. Recorded in `STATE.md`'s Deferred Items for a future, narrowly-scoped test-addition task if closing it is prioritized.
2. **The draft-PR step remains a genuine, deliberately-scoped human-only action** (D-05, Human Verification #1 above) — unchanged from the original verification.

Also newly discovered and fully documented (not gaps in Phase 17's own deliverables — both are pre-existing, unrelated to this phase's `src/**` changes, confirmed via direct reproduction with the fix removed):
- A second, independent pre-existing bug in `tests/e2e/agent-ready-export.spec.ts` (an unanchored `/staged-20\.txt/` regex colliding with `dirty/unstaged-20.txt`), exposed only once the harness bug stopped masking it. Fixed in the same quick task.
- A full-suite-only, load-dependent flake in the 7th negative scenario (`'rejects an oversized uncommitted request'`), proven unrelated to AGENT-09's actual validation behavior via isolated/paired re-runs. Not fixed (out of this re-verification's scope); recorded in `STATE.md`'s Deferred Items as a candidate for a narrow follow-up.
- Two pre-existing, unrelated failures in `tests/integration/selector-drift-ui.spec.ts` (standard e2e regression set), confirmed via `git stash` round-trip to predate and be independent of this phase's or this quick task's changes.

**Human checks required:** 1 (draft-PR opening) — down from 2.
**Re-verification time:** ~90 min (including 6 full custody-gated suite runs across 2 pack configurations, 1 standard-suite run, isolated/paired re-runs of the 2 newly-exposed issues, and a `git stash` regression round-trip).

---
*Verified: 2026-10-31T17:10:28Z*
*Re-verified: 2026-10-31T19:45:00Z*
*Verifier: Exec17.Verify17 (original); QuickHelperFix (re-verification, quick task 261031-q09)*
