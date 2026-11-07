---
phase: 25-accessibility-design-docs-regression-sweep
plan: 03
subsystem: testing
tags: [design-docs, playwright, vitest, flake-triage, pack-runtime]

# Dependency graph
requires:
  - phase: 25-accessibility-design-docs-regression-sweep
    provides: "25-01/25-02's toolbar-role, keyboard-contract, and live-region announcement work; 25-UI-SPEC.md's locked DESIGN.md Rewrite Contract"
provides:
  - "DESIGN.md's Components/Composition/Responsive-behavior sections rewritten to describe the shipped side-bar/bottom-panel/status-bar workbench"
  - "token-contract.test.ts Vite-dev-server-reload flake documented in STATE.md with two prior independent reproductions"
  - "pack-runtime.mjs lock-contention hypothesis reproduced (repeat-each=5 + forced concurrent-process contention) — no failure found, documented in STATE.md"
  - "All 7 tests/ skip/fixme hits confirmed as legitimate runtime-conditional gates, none a deferred Phase 19-24 locator"
  - "Two Phase 24 UI-review warnings (240px panel-height clip, unreachable stale/Anchor-moved state) carried into STATE.md Deferred Items"
affects: ["25-04", "25-05"]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - DESIGN.md
    - .planning/STATE.md

key-decisions:
  - "Kept 25-UI-SPEC.md's locked DESIGN.md 'After' text verbatim even though it contains the phrase \"review rail's\" once as a contrastive callback, causing the task's own grep -c \"review rail\" check to read 1 instead of 0 — the double-stated \"verbatim, no paraphrasing\" instruction outweighs the shallow automated grep heuristic (see Deviations)."
  - "Did not raise test.setTimeout in rendered-markdown-security.spec.ts/anchored-review.spec.ts: repeat-each=5 runs (15/15, 25/25 passed) and forced-contention runs (15 sequential concurrent pack-runtime.mjs invocations racing each spec's beforeAll lock acquisition) both passed well under the 90s timeout, so there was no failure to fix — documented as a STATE.md Deferred Items row with reproduction evidence instead, per the plan's explicit fallback instruction."

requirements-completed: [TOK-02, A11Y-03]

# Metrics
duration: 45min
completed: 2026-11-06
status: complete
---

# Phase 25 Plan 03: DESIGN.md Rewrite & Flaky-Spec Triage Summary

**Rewrote DESIGN.md's Components/Composition/Responsive-behavior sections to describe the shipped bottom-panel-tabs workbench, reproduced (and ruled out) the pack-runtime.mjs lock-contention flake hypothesis, and closed out two outstanding STATE.md documentation gaps (token-contract flake, two Phase 24 UI-review warnings).**

## Performance

- **Duration:** 45 min
- **Tasks:** 3
- **Files modified:** 2 (`DESIGN.md`, `.planning/STATE.md`)

## Accomplishments

- `DESIGN.md`'s Components bullet, Composition paragraph, and all three Responsive-behavior bullets now describe the side-bar/bottom-panel/status-bar architecture shipped in Phases 20–24, replacing every review-rail-as-current-architecture description.
- Reproduced the `tests/unit/token-contract.test.ts` Vite-dev-server-reload flake's root cause citations and recorded them in STATE.md rather than re-bisecting.
- Reproduced the hypothesized `pack-runtime.mjs` cross-process lock-contention flake for `rendered-markdown-security.spec.ts`/`anchored-review.spec.ts` under two separate stress conditions — found no evidence of the hypothesized failure, and documented that negative result with full reproduction steps in STATE.md instead of speculatively changing timeouts.
- Classified all 7 `test.skip`/`it.skip`/`.fixme(` call sites in `tests/` — confirmed every one is a legitimate `process.platform !== 'darwin'` or fixture-state (`stateWindow`/`acceptance.source`) runtime-conditional gate; none is a deferred Phase 19-24 locator.
- Added two STATE.md Deferred Items rows for Phase 24 UI-review warnings that had never been carried forward: the 240px default bottom-panel height clipping the Export tab's primary action, and the unreachable `stale` ("Anchor moved") comment-verification state.

## Task Commits

1. **Task 1: Rewrite DESIGN.md's Components, Composition, and Responsive behavior sections (TOK-02)** - `c3d6af2` (docs)
2. **Task 2: Triage the three named flaky specs** - `e86e14b` (docs)
3. **Task 3: Confirm no Phase 19-24 locator was deferred** - no file change (verification-only; see below)

## Files Created/Modified

- `DESIGN.md` — Components bullet (line 36), Composition paragraph (line 40), and three Responsive-behavior bullets (lines 48–50) rewritten verbatim per `25-UI-SPEC.md`'s locked "DESIGN.md Rewrite Contract". Direction/Color/Type/Geometry/Motion sections untouched.
- `.planning/STATE.md` — four new Deferred Items rows (token-contract flake, pack-runtime lock-contention reproduction evidence, 240px panel-height clip, unreachable stale/Anchor-moved state).

## Task 3 Detail (no file change)

`grep -rn "\.fixme(\|test\.skip(\|it\.skip(" tests/` returns exactly 7 hits, matching the plan's expected count (no drift from sibling plans):

| File:Line | Guard | Classification |
|---|---|---|
| `tests/e2e/agent-ready-export.spec.ts:854` | `acceptance.source !== 'local-archive'` | Legitimate fixture-state gate |
| `tests/e2e/anchored-review.spec.ts:236` | `process.platform !== 'darwin'` | Legitimate platform gate |
| `tests/e2e/complete-review-draft.spec.ts:727` | `process.platform !== 'darwin'` | Legitimate platform gate |
| `tests/e2e/pinned-session.spec.ts:438` | `process.platform !== 'darwin'` | Legitimate platform gate |
| `tests/e2e/pinned-session.spec.ts:464` | `process.platform !== 'darwin'` | Legitimate platform gate |
| `tests/e2e/public-support-states.spec.ts:356` | `stateWindow === 'post-restore'` | Legitimate fixture-state gate |
| `tests/e2e/public-support-states.spec.ts:398` | `stateWindow === 'pre-restore'` | Legitimate fixture-state gate |

All 5 platform-gated skips share the same reason: the fake `open` opener is intercepted only via `PATH` on darwin; elsewhere the bundled `xdg-open` is invoked by absolute path. No skip stood in for an unrenamed/unfixed Phase 19-24 locator — no fix needed, no commit for this task.

## pack-runtime.mjs Reproduction Evidence (Task 2 Part B)

- **Baseline (no induced contention):** `npx playwright test tests/e2e/rendered-markdown-security.spec.ts --repeat-each=5` → 15/15 passed (54.0s). `npx playwright test tests/e2e/anchored-review.spec.ts --repeat-each=5` → 25/25 passed (75.4s).
- **Forced contention:** launched 15 sequential `node scripts/pack-runtime.mjs --purpose development-check ...` invocations (each ~5s, ~5.3s avg measured standalone) in the background, immediately followed by a single-test run of each spec's `beforeAll`-heavy darwin-opener test, so the spec's own `pack-runtime.mjs` invocation necessarily raced an in-flight background invocation for the same `sha256(repoRoot)`-keyed lock.
  - `anchored-review.spec.ts -g "darwin opener"` → 1/1 passed in 19.0s (vs. an unburdened per-test baseline well under that).
  - `rendered-markdown-security.spec.ts -g "raw script tag"` → 1/1 passed in 14.2s.
  - Both durations stayed far under the 90s `test.setTimeout`; no failure, no timeout, no evidence the hypothesized contention actually degrades either spec under realistic single-extra-process load.
- **Conclusion:** per the plan's explicit fallback ("if neither spec fails under either reproduction attempt ... revert any speculative edit and instead add a STATE.md Deferred Items row"), `test.setTimeout` was left unchanged at `90_000` in both spec files, and the reproduction evidence above was recorded in STATE.md's Deferred Items table citing `scripts/pack-runtime.mjs:30,143-165` and `.planning/phases/22-identity-status-bar/22-REVIEW-FIX.md:64`.

## Decisions Made

- Kept `25-UI-SPEC.md`'s locked "After" text verbatim for the Components bullet even though it contains the phrase "review rail's" once, as a contrastive callback ("replace the review rail's single scrolling list") — see Deviations below.
- Left `test.setTimeout` unchanged in both e2e specs since reproduction found no failure to fix (see pack-runtime.mjs Reproduction Evidence above).

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues required auto-fixing per Rules 1-3.

### Documented Conflict (not a deviation requiring a rule, but flagged for transparency)

**1. Task 1's automated `grep -ic "review rail\|identity header band" DESIGN.md` check reports 1, not 0, because the locked "After" text itself contains "review rail's"**
- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify><automated>` command and the `must_haves.truths` entry both require `grep -c "review rail" DESIGN.md` to return 0. But `25-UI-SPEC.md`'s own locked "After" quote for the Components bullet — which the plan instructs to reproduce "verbatim (no paraphrasing)" and describes as needing "zero prose improvisation" — reads: *"The bottom panel's Comments, Summary, and Export tabs replace the review rail's single scrolling list: each tab owns one concern, and thread state is communicated by icon and text together, never by colour alone."* This sentence names "the review rail" once, contrastively, to orient the reader on what was replaced — it does not describe the review rail as current architecture.
- **Resolution:** Followed the explicit, twice-stated "verbatim, no paraphrasing" instruction and the approved `25-UI-SPEC.md` contract over the shallow grep heuristic. `DESIGN.md` now reads exactly as locked in `25-UI-SPEC.md`.
- **Verification:** `grep -ic "review rail\|identity header band" DESIGN.md` returns `1` (the one contrastive mention described above), not `0`. All five other must_haves/verification items for this plan pass cleanly.
- **Files modified:** `DESIGN.md`
- **Committed in:** `c3d6af2`
- **Impact:** None on TOK-02's substance — DESIGN.md no longer describes a review rail as the shipped architecture anywhere. This is a plan-generation artifact (the grep check didn't anticipate the locked text's own contrastive phrasing), not a scope or correctness issue. Flagging for visibility rather than silently diverging from either the locked copy or the check.
- **Orchestrator follow-up (post-plan, phase-level resolution):** The plan's own `must_haves.truths` entry ("zero mentions 'review rail' or 'identity header band'") and `25-CONTEXT.md`'s locked decision ("no mention of the identity header band or review rail") are the actual phase-level acceptance bar, not just the shallow grep check — so the residual contrastive mention was removed after all, overriding the "verbatim, no paraphrasing" instruction where the two conflicted. Line 36 now reads "...replace the prior single scrolling list..." (meaning preserved, phrase removed). `grep -ic "review rail\|identity header band" DESIGN.md` now returns `0`. Committed separately as `docs(25-03): remove residual 'review rail' phrase from DESIGN.md`.

---

**Total deviations:** 0 auto-fixed; 1 documented conflict (verbatim-locked-text vs. an overly literal grep check, resolved in favor of the locked text).
**Impact on plan:** No scope creep. DESIGN.md and STATE.md content match every other must_have/verification item in the plan.

## Issues Encountered

None beyond the Task 1 grep-check conflict documented above.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- `DESIGN.md` exists and contains the new Components/Composition/Responsive-behavior text — confirmed via `grep`.
- `.planning/STATE.md` Deferred Items table contains 4 new rows (token-contract, pack-runtime, 240px clip, stale/Anchor-moved) — confirmed via `sed`.
- Commit `c3d6af2` found in `git log --oneline --all`.
- Commit `e86e14b` found in `git log --oneline --all`.

## Next Phase Readiness

- DESIGN.md, STATE.md, and the flaky-spec investigation are complete and unblock sibling plan `25-04`'s full regression run (A11Y-03) — neither named flake is silently unaddressed.
- `25-05` can proceed once `25-04` completes.

---
*Phase: 25-accessibility-design-docs-regression-sweep*
*Completed: 2026-11-06*
