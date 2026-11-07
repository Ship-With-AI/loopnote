---
phase: 25-accessibility-design-docs-regression-sweep
plan: 04
subsystem: testing
tags: [playwright, vitest, regression-gate, accessibility, file-tree]

# Dependency graph
requires:
  - phase: 25-accessibility-design-docs-regression-sweep (25-01, 25-02, 25-03, 25-05)
    provides: TitleBar/StatusBar toolbar roles, live-region/popover accessibility wiring, DESIGN.md rewrite + flaky-spec triage, Finish-review live-region consolidation — all landed in the tree before this plan's gate ran
provides:
  - A single recorded pass/fail run of all six CONTEXT.md-locked phase-end gate commands against the finished Phase 25 workbench
  - 3 new packaged-binary e2e tests closing Phase 21's 3 deferred human-verification items (DEBT item, not originally in this plan's scope)
  - A same-phase fix for a Phase-25-introduced stale test assertion (25-05's live-region consolidation broke one agent-ready-export-safety.spec.ts locator)
  - 5 new STATE.md Deferred Items rows documenting pre-existing (not Phase-25-caused) gate failures, each with disposable-worktree reproduction evidence against pre-phase commit 7f6d248
affects: [milestone-v2.1-closeout, A11Y-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-existing-vs-regression triage via disposable git worktree at the pre-phase commit, reproducing the exact failure byte-for-byte before writing a Deferred Items row"
    - "Packaged-CLI e2e tests reusing an existing spec file's own fixture/harness helpers (createFileTreeFixture, startGeneratedCli, waitForLoopbackUrl) rather than inventing new fixtures"

key-files:
  created: []
  modified:
    - tests/e2e/file-tree.spec.ts
    - tests/e2e/agent-ready-export-safety.spec.ts
    - .planning/STATE.md

key-decisions:
  - "Part A (Phase 21 deferred-item e2e coverage) executed as an explicit orchestrator-added deviation from this plan's original single-task scope, not silently folded in"
  - "List-mode dimmed-directory test asserts PathText.vue's real DOM order (directory span before filename span), not 21-VERIFICATION.md's 'filename first' wording, which does not match the shipped markup"
  - "Fixed the one Phase-25-caused regression (stale role=status assertion in agent-ready-export-safety.spec.ts, broken by 25-05's live-region consolidation) rather than deferring it, since A11Y-03 requires no in-phase locator break go unfixed"
  - "9 npm run test:runtime-artifact browser-interaction failures and 2 vitest + 1 typecheck:tests pre-existing failure clusters left as STATE.md Deferred Items after confirming byte-identical reproduction on pre-phase commit 7f6d248 in disposable worktrees — none touch any file Phase 25 modified"

requirements-completed: [A11Y-03]

# Metrics
duration: 95min
completed: 2026-11-06
status: complete
---

# Phase 25 Plan 04: Full regression gate + Phase 21 deferred-item e2e coverage Summary

**Ran all 6 CONTEXT.md-locked phase-end gate commands against the finished Phase 25 workbench, added 3 packaged-binary e2e tests closing Phase 21's deferred human-verification items, fixed the one genuine Phase-25 regression found (a stale `role=status` assertion 25-05's live-region consolidation left behind), and recorded 5 new STATE.md Deferred Items rows for pre-existing failures confirmed via disposable-worktree reproduction against commit `7f6d248`.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 1 (plan's own Task 1) + Part A (orchestrator-added deviation, 3 new tests)
- **Files modified:** 3 (`tests/e2e/file-tree.spec.ts`, `tests/e2e/agent-ready-export-safety.spec.ts`, `.planning/STATE.md`)

## Accomplishments

- Full 6-command phase-end regression gate run to completion, every command's result recorded with exact counts (below)
- Added 3 new packaged-CLI Playwright tests in `tests/e2e/file-tree.spec.ts` covering Phase 21's 3 deferred human-verification items (default hover/selection line-count visibility, filter Enter/ArrowDown semantics, list-mode keyboard parity + dimmed directory)
- Fixed the one new-since-Phase-25 regression: a stale `role="status"` assertion in `agent-ready-export-safety.spec.ts` left over from 25-05's live-region consolidation
- Triaged every other failing command/test against the pre-existing-flake baseline using disposable `git worktree` reproduction at commit `7f6d248`, and recorded 5 new STATE.md Deferred Items rows with reproduction evidence for the genuinely pre-existing ones

## Part A — Orchestrator-added deviation: Phase 21 deferred-item e2e coverage

**This is additive scope beyond the plan's original single task**, explicitly assigned by the orchestrator before the final gate run. Documented here as a deviation, not silently folded into the plan's own Task 1.

Added 3 new tests to `tests/e2e/file-tree.spec.ts` (existing file, reusing its established `createFileTreeFixture`/`startGeneratedCli`/`waitForLoopbackUrl`/`stopGeneratedCli`/`captureFileRequest` conventions):

1. **`packaged file tree keeps line counts hidden until a real hover or a keyboard selection in the default hover mode`** — with `treeLineCounts` left at its default `'hover'`, confirms an unselected/unhovered row's `.line-counts` renders at `opacity: 0`; a real `locator.hover()` makes it `opacity: 1`; moving the mouse away restores `opacity: 0`; a different row made current via `locator.focus()` (a real DOM focus event with no mouse movement — in this app every row's `@focus` handler runs the same `model.focusRow()` path arrow-key navigation uses, selecting the file as well as focusing it) also reaches `opacity: 1`.
2. **`packaged file tree filter Enter opens the first match and ArrowDown moves focus into the tree without closing the filter`** — filters to `'collision'` (3 matching rows: 1 directory + 2 files), presses Enter and confirms the first non-directory match becomes selected and its content is fetched (`/api/files/<id>/content`); separately re-focuses the filter and presses ArrowDown, confirming it moves real keyboard focus onto a currently-filtered treeitem without closing the filter or clearing its value.
3. **`packaged file tree list mode keeps tree keyboard semantics and dims the directory segment`** — confirms tree-mode and list-mode render the same files in the same order; confirms `Home`/`End`/`ArrowUp`/`ArrowDown`/`Space`/`Enter` navigate/activate list rows identically to tree mode (with real content-fetch requests proving activation, using a row other than the already-selected default to guarantee a fresh fetch); confirms each list row's `.path-text__directory` segment is visible, contains the directory prefix, and renders in `--text-muted` (`rgb(167, 177, 189)`).

**Deviation note on DOM order:** 21-VERIFICATION.md's "Human Verification Required" §3 describes list rows as showing "filename first... directory segment shown after it." Reading the actual shipped markup (`src/web/components/ui/PathText.vue:22`, bound via `FileRow.vue:110`'s `:basename="mode !== 'list'"`), the `.path-text__directory` span is rendered **before** `.path-text__filename` in the DOM — the opposite of that wording. The new test asserts the real, shipped DOM order (directory then filename) rather than the verification doc's description, since the goal is accurate coverage of shipped behavior, not confirmation of a possibly-mistaken prior narrative. The *substance* of the requirement — a muted directory segment renders alongside the filename, and keyboard parity holds — is fully covered either way.

All 3 new tests pass individually and as part of the full `tests/e2e/file-tree.spec.ts` file (7/7 passed, including the 4 pre-existing tests in that file).

## Task Commits

1. **Part A: Phase 21 deferred-item e2e coverage** — `5618617` (test)
2. **Regression fix: stale role=status assertion** — `55bd57f` (fix)
3. **STATE.md: 3 pre-existing failures from vitest/typecheck gates** — `427639a` (docs)
4. **STATE.md: pre-existing test:runtime-artifact browser-interaction failures** — `d2726c3` (docs)

**Plan metadata:** this SUMMARY's own commit (below)

## Full Phase-End Gate Report

All 6 commands run to completion, in order, per `25-CONTEXT.md`'s lock:

| # | Command | Result | Exact counts |
|---|---------|--------|---------------|
| 1 | `npx vitest run --no-file-parallelism` | **Fail (pre-existing only)** | Test Files: 2 failed, 89 passed (91 total). Tests: 5 failed, 974 passed (979 total). |
| 2 | `npm run typecheck:web` | **Pass** | 0 errors |
| 3 | `npm run typecheck:tests` | **Fail (pre-existing only)** | 4 `tsc` errors across 3 files (`tests/unit/comment-thread.test.ts`, `tests/unit/identity-pill.test.ts` ×2, `tests/unit/status-bar.test.ts`) |
| 4 | `npm run verify:semantic-css` | **Pass** | "Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass." |
| 5 | `npx playwright test` (full suite) | **Pass (after 1 fix)** | First run: 155 tests, 1 failed, 154 passed. After the fix (commit `55bd57f`): 155 tests, **155 passed, 0 failed.** |
| 6 | `npm run test:runtime-artifact` | **Fail (pre-existing only)** | 16 tests, 7 passed, 9 failed |

### Command 1 — `npx vitest run --no-file-parallelism`: 5 pre-existing failures, 2 files

- `tests/api/session.test.ts` — 2 failures: fixtures expect `status` objects without a `code` field; live response includes `status.code` (`"R"`/`"D"`) added by an earlier phase without updating these fixtures.
- `tests/package/runtime-package-contract.test.ts` — 3 failures: fixtures pin a `@typescript/native`/`typescript`/`vue-tsc` dependency triplet that no longer matches the installed `package.json`/lockfile.
- **Triage:** neither file is touched by any `25-0x` commit (`git log 7f6d248..HEAD -- <files>` returns nothing). Reproduced byte-for-byte identically on pre-Phase-25 commit `7f6d248` in a disposable `git worktree` (`npm ci` + isolated `vitest run`). **Recorded as 2 new STATE.md Deferred Items rows** (commit `427639a`).

### Command 3 — `npm run typecheck:tests`: 4 pre-existing errors, 3 files

- `tests/unit/{comment-thread,identity-pill,status-bar}.test.ts` fail under plain `tsc` (not `vue-tsc`) because `tsc` cannot resolve `.vue` module imports; `identity-pill.test.ts` also has one `TS2835` explicit-extension error.
- **Triage:** reproduced identically on pre-Phase-25 commit `7f6d248` in the same disposable worktree. **Recorded as 1 new STATE.md Deferred Items row** (commit `427639a`).

### Command 5 — `npx playwright test`: 1 genuine Phase-25 regression, fixed in-phase

- `tests/e2e/agent-ready-export-safety.spec.ts:200` ("attached lifecycle renders waiting, progress, completion, and safe recovery actions") asserted `role="status"` directly on the `.attached-completion__progress` `<p>`. Commit `7bc1476` (`feat(25-05)`) intentionally removed that attribute from `ExportSection.vue` when consolidating the Finish-review announcement onto App.vue's single `announce()` owner (now independently covered by `finish-review-live-region.spec.ts:202`) — a correct architectural change the test assertion was never updated for. This isolated harness test never mounts `App.vue`, so the attribute can never reappear here.
- **Fix:** replaced the stale attribute assertion with a plain `toBeVisible()` check (commit `55bd57f`). Re-ran the whole spec file (2/2 passed) and the full suite (155/155 passed).

### Command 6 — `npm run test:runtime-artifact`: 9 pre-existing failures, 1 shared root cause

- Required env vars (`LOOPNOTE_RUNTIME_CUSTODY_DIR`, `LOOPNOTE_RUNTIME_ARCHIVE_BASENAME`, `LOOPNOTE_RUNTIME_ARCHIVE_SHA256`, `LOOPNOTE_RUNTIME_EVIDENCE`) were produced via `node scripts/pack-runtime.mjs --purpose development-check --custody-dir <dir> --evidence <path>`, per `docs/support-service-operations.md`'s documented pattern (not a workaround — this is the project's own documented setup for this "default non-custody" / local-archive run).
- All 9 failures in `tests/e2e/agent-ready-export.spec.ts` are every scenario requiring a real installed-CLI + real-browser round-trip (resume-after-relaunch, attached-review Finish flows ×5, support, and the final oversized-request test); each either times out on a click/`waitForResponse` inside the file's `test.setTimeout(120_000)`, or immediately can't find the "Finish attached review" region — and every later test's shared `sourceControlEvidence()` check then reports an empty `sourceControlAssertions` accumulator instead of the 10 expected scenario names, since no earlier browser-interaction scenario ever completed far enough to register itself. The other 7 tests (pure CLI-input-validation "rejects ... before any browser launch" tests, plus `package-assets.spec.ts`) need no browser interaction and pass cleanly.
- **Isolation:** re-ran the first failure alone (`-g "installed resume after relaunch"`) — reproduced identically. Retried with `--timeout=400000` to rule out a CLI-flag-overridable timeout budget; the in-file `test.setTimeout(120_000)` still fired at 120s, ruling that out.
- **Pre-existing confirmation:** reproduced byte-for-byte identically (same error text, same "Write summary" button never found) on pre-Phase-25 commit `7f6d248` in a disposable `git worktree` with its own freshly-produced `development-check` artifact.
- **Recorded as 1 new STATE.md Deferred Items row** (commit `d2726c3`).

## Flaky-spec re-confirmations (pre-existing baseline from 25-03)

| Spec | Re-run evidence this session |
|------|-------------------------------|
| `tests/unit/token-contract.test.ts` | Passed cleanly within gate command 1's `--no-file-parallelism` run (10/10). Isolated re-runs under both default parallelism and `--no-file-parallelism` also passed (10/10 each) — consistent with the existing STATE.md entry: the flake only manifests under default file-parallelism as part of the full multi-file suite, and the gate's own `--no-file-parallelism` flag already avoids it. |
| `tests/e2e/rendered-markdown-security.spec.ts` | Passed in the full `npx playwright test` run (both before and after the fix). Additionally re-run with `--repeat-each=3` alongside `anchored-review.spec.ts`: 12/12 passed. |
| `tests/e2e/anchored-review.spec.ts` | Passed in the full `npx playwright test` run (both before and after the fix). Re-run with `--repeat-each=3`: 12/12 passed. |

No new failure mode observed for any of the 3; existing STATE.md entries (lines documenting `token-contract.test.ts` and the `pack-runtime.mjs` lock-contention hypothesis) still accurately describe current behavior — no updates needed.

## New STATE.md Deferred Items rows (exact citations)

Added to `.planning/STATE.md`'s `## Deferred Items` table (commits `427639a`, `d2726c3`):

1. `tests/api/session.test.ts`'s `status.code` fixture mismatch (2 assertions) — reproduced pre-Phase-25 on `7f6d248`.
2. `tests/package/runtime-package-contract.test.ts`'s dependency-manifest drift (3 assertions) — reproduced pre-Phase-25 on `7f6d248`.
3. `npm run typecheck:tests`'s 3-file `.vue`-import `tsc` errors (4 errors) — reproduced pre-Phase-25 on `7f6d248`.
4. `npm run test:runtime-artifact`'s 9 browser-interaction failures in `tests/e2e/agent-ready-export.spec.ts`, consolidated into one row (shared root cause/symptom) — reproduced pre-Phase-25 on `7f6d248`.

## Files Created/Modified

- `tests/e2e/file-tree.spec.ts` — 3 new packaged-CLI e2e tests (Part A, Phase 21 deferred-item coverage)
- `tests/e2e/agent-ready-export-safety.spec.ts` — 1-line fix for 25-05's stale `role=status` assertion
- `.planning/STATE.md` — 5 new Deferred Items rows

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, Phase-25-caused] Fixed stale `role=status` assertion from 25-05's live-region consolidation**
- **Found during:** Task 1 (gate command 5, `npx playwright test`)
- **Issue:** `tests/e2e/agent-ready-export-safety.spec.ts:200` asserted `role="status"` on `ExportSection.vue`'s `.attached-completion__progress` paragraph, which 25-05 (`7bc1476`) correctly removed when consolidating the Finish-review live-region announcement onto `App.vue`'s single `announce()` owner.
- **Fix:** Replaced the attribute assertion with a plain visibility check, which is all this isolated (no-`App.vue`) harness test can meaningfully prove.
- **Files modified:** `tests/e2e/agent-ready-export-safety.spec.ts`
- **Verification:** Spec file re-run (2/2 passed); full `npx playwright test` re-run (155/155 passed).
- **Commit:** `55bd57f`

### Orchestrator-added scope (not a "found during execution" deviation, but explicit assigned scope beyond the plan's own Task 1)

**2. [Explicit orchestrator instruction] Added Phase 21's 3 deferred human-verification items as real e2e tests**
- See "Part A" section above for full detail. Tracked separately from Rule 1-3 auto-fixes because it was assigned directly by the orchestrator prompt, not discovered mid-execution.
- **Commit:** `5618617`

---

**Total deviations:** 1 auto-fixed (Rule 1 regression fix) + 1 explicit orchestrator-added scope item (Part A).
**Impact on plan:** The Rule 1 fix was necessary for A11Y-03's "no Phase 19–24 [or Phase 25] locator left broken in-phase" bar. Part A was pre-authorized additive scope, not scope creep.

## Known Stubs

None.

## Threat Flags

None — this plan only runs existing test/build commands, adds test coverage for already-shipped behavior, fixes one test assertion, and records STATE.md rows. No new network endpoints, auth paths, file-access patterns, or schema changes.

## Issues Encountered

None beyond the regression and pre-existing failures documented above, all resolved or recorded with evidence.

## User Setup Required

None.

## Next Phase Readiness

- Phase 25's full regression gate is green except for 3 independently-confirmed pre-existing failure clusters (all predate Phase 25, none touch any file this milestone modified) and the 2 already-known flaky specs (both passed cleanly on every re-run this session).
- A11Y-03 is satisfied: every Phase-25-caused locator break found during the gate was fixed in-phase; nothing was silently deferred.
- This is the last plan of Phase 25 and milestone v2.1 — ready for the orchestrator's final phase/milestone bookkeeping (ROADMAP.md, PROJECT.md, REQUIREMENTS.md).

---
*Phase: 25-accessibility-design-docs-regression-sweep*
*Completed: 2026-11-06*
