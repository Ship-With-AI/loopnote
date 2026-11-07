---
phase: 25-accessibility-design-docs-regression-sweep
verified: 2026-11-06T06:52:55Z
status: passed
score: 17/17 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "17/17 truths verified at 2026-11-06T05:05:49Z; orchestrator re-baseline against v2.0 close commit 0481bcc (not the Phase-25 verifier's pre-Phase-25 commit 7f6d248 baseline) found 4 regressions this verifier's human_needed status did not surface as gaps"
  gaps_closed:
    - "`npm run typecheck:tests` regression (3 Phase-25-added `.vue`-importing unit tests — comment-thread.test.ts, identity-pill.test.ts, status-bar.test.ts — left on the plain-tsc tsconfig.test.json split instead of the vue-tsc tsconfig.web.test.json split, plus a missing `.js` extension on identity-pill.test.ts's contracts/api import) — closed by commit db6dde9"
    - "`npx vitest run --no-file-parallelism` v2.1 regressions (tests/api/session.test.ts fixtures omitted the `status.code` field ApiFileStatusSchema declares; scripts/verify-prerequisites.mjs's approvedDependencies allow-list was out of sync with package.json's Phase-19 dependency/devDependency pins) — closed by commit 03c170a"
    - "`npm run test:runtime-artifact` custody-gated regression (tests/e2e/agent-ready-export.spec.ts's openReviewNotes() helper never selected the Export/Summary BottomPanel tab that Phase 24 introduced, so 9/16 tab-gated assertions failed) — closed by commit 9975870"
    - "TREE-04 list-mode DOM order regression (PathText.vue rendered the dimmed directory segment before the file name, contradicting 21-UI-SPEC.md:197's name-first/directory-after requirement; file-tree.spec.ts had locked in the wrong order) — closed by commit e2a0534"
  gaps_remaining: []
  regressions: []
---

# Phase 25: Accessibility, Design Docs & Regression Sweep Verification Report

**Phase Goal:** Close the milestone: prove every toolbar group is reachable by role and name (closing DEBT-01), audit popovers/menus and live regions, run the full regression suites against the finished workbench, and rewrite `DESIGN.md` to describe the shipped workbench. Requirements: TOK-02, A11Y-01, A11Y-02, A11Y-03.

**Verified:** 2026-11-06T06:52:55Z
**Status:** passed (0 BLOCKERs, 0 WARNINGs — all 4 orchestrator re-baseline regressions independently reproduced as closed against live HEAD; all 6 phase-end gate commands personally re-run with exact-match or better counts; the sole carried-forward human-verification item, Phase 21's list-mode DOM order, is now a confirmed spec-compliant fix rather than an open UX question)
**Re-verification:** Yes — re-verifying the 4 gaps recorded in this file's "Gaps (orchestrator re-baseline)" section against v2.0 close commit `0481bcc`

## Method

Goal-backward, adversarial: every claim in all 5 SUMMARYs was re-derived from the live codebase and from personally re-run tests/commands, not trusted. All specs named in the assignment were executed directly in this session (not inferred from SUMMARY narrative). The 6-command phase-end regression gate was re-run in full, including producing a fresh `test:runtime-artifact` evidence artifact via `node scripts/pack-runtime.mjs --purpose development-check …` (the SUMMARY's claimed 16/7/9 split cannot be observed without this — a prior backgrounded attempt without the env vars produced a different, misleading 2-failed/14-did-not-run result, which this report discards in favor of the correctly-configured run).

## Goal Achievement

### Observable Truths (merged from all 5 plans' `must_haves.truths` + ROADMAP success criteria)

| # | Plan | Truth | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | 25-01 | AT users reach title bar's button cluster via `getByRole('toolbar', { name: 'Title bar actions' })` | ✓ VERIFIED | `TitleBar.vue:63` carries `role="toolbar" aria-label="Title bar actions"`; `npx playwright test tests/e2e/toolbar-roles.spec.ts` → 1/1 passed (personally re-run) |
| 2 | 25-01 | AT users reach status bar's button cluster via `getByRole('toolbar', { name: 'Status bar actions' })` | ✓ VERIFIED | `StatusBar.vue:64` carries `role="toolbar" aria-label="Status bar actions"`; same spec run, same pass |
| 3 | 25-01 | Side-bar, editor-title, bottom-panel control groups reachable by role+name (already shipped, proven in one spec) | ✓ VERIFIED | Same test asserts `getByRole('toolbar', {name:'Changed files actions'})`, `getByRole('toolbar',{name:'Diff navigation'})`, `getByRole('tablist',{name:'Review panel'})` — all visible in the one passing run |
| 4 | 25-01 | Title bar `<header>` / status bar `<footer>` keep implicit `banner`/`contentinfo` landmark roles | ✓ VERIFIED | `TitleBar.vue:47 <header>`, `StatusBar.vue:59 <footer>` unchanged; same spec asserts `getByRole('banner')`/`getByRole('contentinfo')` visible |
| 5 | 25-01 | DEBT-01 no longer appears in ROADMAP.md Backlog or PROJECT.md accepted-debt notes | ✓ VERIFIED | `grep -c "DEBT-01" .planning/ROADMAP.md .planning/PROJECT.md` → `0` and `0` (personally re-run) |
| 6 | 25-02 | Exactly one announcement for: panel-tab switch, single-thread collapse/expand, collapse-all/expand-all, file-tree view-mode toggle, filter-match-count (400ms debounce), Markdown source/rendered toggle | ✓ VERIFIED | `npx playwright test tests/e2e/live-region-announcements.spec.ts` → 7/7 of these tests pass with exact `data-announcement-version` +1 delta (personally re-run as part of the 14-test combined run below) |
| 7 | 25-02 | Undo-restore announcement states `{open} open, {resolved} resolved.` counts, matching resolve/reopen/delete siblings | ✓ VERIFIED | `App.vue:427`; same spec's "Undo restores a deleted comment…" test passes |
| 8 | 25-02 | IdentityPopover / ViewOptionsMenu / SupportDialog close on Escape and return focus to trigger | ✓ VERIFIED | `npx playwright test tests/e2e/popover-keyboard-contract.spec.ts` → 3/3 passed (personally re-run) |
| 9 | 25-03 | DESIGN.md's Components/Composition/Responsive sections describe the shipped side-bar/bottom-panel/status-bar architecture; zero "review rail"/"identity header band" mentions | ✓ VERIFIED | `grep -ic "review rail\|identity header band" DESIGN.md` → `0` (personally re-run); `git diff c3d6af2~1 626faf8 -- DESIGN.md` confirms only the 3 locked sections changed (plus orchestrator's `eda7697` one-line rephrase), Direction/Color/Type/Geometry/Motion byte-for-byte untouched |
| 10 | 25-03 | `token-contract.test.ts` Vite-dev-server-reload flake recorded in STATE.md citing two prior independent reproductions, not re-bisected | ✓ VERIFIED | `.planning/STATE.md:306` cites `20-VERIFICATION.md:239` and `24-01-SUMMARY.md:84` as the two prior reproductions, confirms absence under `--no-file-parallelism` via `23-VERIFICATION.md:85` |
| 11 | 25-03 | `pack-runtime.mjs` lock-contention flake either fixed with evidence or recorded in STATE.md with reproduction evidence | ✓ VERIFIED | `.planning/STATE.md:307` documents baseline (15/15, 25/25 under `--repeat-each=5`) and forced-contention reproduction (15 concurrent `pack-runtime.mjs` invocations), both passing — negative result, correctly not silently discarded |
| 12 | 25-03 | Every `test.skip`/`it.skip`/`.fixme(` in `tests/` confirmed legitimate runtime-conditional (not a deferred Phase 19–24 locator) | ✓ VERIFIED | `grep -rn "\.fixme(\|test\.skip(\|it\.skip(" tests/` → exactly 7 hits (personally re-run, matches claim); spot-checked 2 of 7 (`anchored-review.spec.ts:236` darwin-platform gate, `public-support-states.spec.ts:356` fixture-state-window gate) — both read exactly as classified |
| 13 | 25-05 | Exactly one announcement for thread resolve/reopen/delete, refresh, export (5 outcomes 25-02's spec doesn't cover) | ✓ VERIFIED | `npx playwright test tests/e2e/live-region-outcome-audit.spec.ts` → 3/3 passed (personally re-run) |
| 14 | 25-05 | Finish-review validating-start and completed transitions each announce exactly once from App.vue's single owner; `ExportSection.vue` no longer carries a competing live region | ✓ VERIFIED | `npx playwright test tests/e2e/finish-review-live-region.spec.ts` → 1/1 passed; `grep -n "attached-completion__progress\|inline-notice--success" src/web/components/ExportSection.vue` shows neither element carries `role`/`aria-live` (personally confirmed) |
| 15 | 25-05 | Anchor-drift reset-to-verified announcement fires exactly once once the only stale/orphaned comment is resolved | ✓ VERIFIED | `npx playwright test tests/integration/anchored-workspace.spec.ts -g "verified again"` → 1/1 passed (personally re-run); `App.vue:480` carries the `else if` branch |
| 16 | 25-04 | Packaged-binary Playwright + integration suites pass against the finished workbench after all plans land | ✓ VERIFIED | Full `npx playwright test` personally re-run → **155 passed, 0 failed** (exact match to SUMMARY's post-fix count) |
| 17 | 25-04 | Every CONTEXT.md-locked gate command is green, or its failure has a reproduced, evidence-backed STATE.md Deferred Items entry | ✓ VERIFIED | All 6 commands personally re-run; every non-green result's exact counts match the SUMMARY (see Behavioral Spot-Checks below) and each has a STATE.md row (`:306–313`) with either reproduction evidence or a pre-Phase-25 disposable-worktree reproduction on commit `7f6d248` — independently confirmed plausible: `git log 7f6d248..HEAD -- <each failing file>` returns **no commits**, proving none of the 3 vitest/typecheck failure clusters were touched by any 25-0x plan |

**Score:** 17/17 truths VERIFIED, 0 behavior-unverified, 0 FAILED.

### Phase 21 Deferred-Item Closure (orchestrator-added scope)

| # | Item (from `21-VERIFICATION.md` Human Verification Required) | Status | Evidence |
|---|---|---|---|
| 1 | Default hover/selection line-count visibility | ✓ VERIFIED (newly exercised) | `tests/e2e/file-tree.spec.ts:721` "packaged file tree keeps line counts hidden until a real hover or a keyboard selection in the default hover mode" — real test, not a stub (asserts `opacity:1`/`opacity:0` transitions via real `.hover()`/keyboard selection); passed in personally re-run `npx playwright test tests/e2e/file-tree.spec.ts -g "hover or a keyboard selection"` |
| 2 | Filter Enter/ArrowDown semantics | ✓ VERIFIED (newly exercised) | `tests/e2e/file-tree.spec.ts:789` "packaged file tree filter Enter opens the first match and ArrowDown moves focus into the tree without closing the filter" — passed in the same personally re-run batch |
| 3 | List-mode keyboard parity + dimmed directory rendering | ✓ VERIFIED (newly exercised); UX intent routed to human (see below) | `tests/e2e/file-tree.spec.ts:872` "packaged file tree list mode keeps tree keyboard semantics and dims the directory segment" — passed; however 25-04-SUMMARY documents a DOM-order deviation from `21-VERIFICATION.md`'s prior wording (directory segment now asserted to render *before* the filename, not after) — the test is real and passing, but which DOM order is the *intended* UX is a judgment call outside grep/test-pass verification |

All 3 ran together: `npx playwright test tests/e2e/file-tree.spec.ts -g "hover or a keyboard selection|filter Enter opens the first match|list mode keeps tree keyboard"` → **3/3 passed** (personally re-run).

### STATE.md Deferred Items Completeness

| Item | Present in STATE.md? | Citation quality |
|---|---|---|
| Phase 24 UI-review: 240px panel-height clip (Export tab primary action below fold) | ✓ Present (`:308`) | Concrete: `src/web/model/panel-state.ts:9 PANEL_HEIGHT_DEFAULT`, `BottomPanel.vue:227`, cites `24-UI-REVIEW.md` Pillar 5 / Priority Fix #1 |
| Phase 24 UI-review: unreachable `stale` ("Anchor moved") state | ✓ Present (`:309`) | Concrete: `src/server/capabilities.ts:457-480,773-796,1055-1080,1412-1437`, cites `24-UI-REVIEW.md` Pillar 6 / Priority Fix #2 |
| `tests/api/session.test.ts` status.code fixture mismatch | ✓ Present (`:310`) | Concrete: names both failing assertions, cites pre-Phase-25 reproduction on commit `7f6d248` |
| `tests/package/runtime-package-contract.test.ts` dependency drift | ✓ Present (`:311`) | Concrete: names exact package/version mismatch, cites `7f6d248` reproduction |
| `npm run typecheck:tests` 3-file `.vue`-import errors | ✓ Present (`:312`) | Concrete: names all 3 files, `TS2307`/`TS2835`, cites `7f6d248` reproduction |
| `npm run test:runtime-artifact` 9 browser-interaction failures | ✓ Present (`:313`) | Concrete: names every scenario, the exact failure modes, 2 full-gate reproductions + an isolated `--timeout=400000` rerun that ruled out a timeout-budget cause, plus byte-identical `7f6d248` reproduction |
| `token-contract.test.ts` flake | ✓ Present (`:306`) | Concrete, 2 prior independent citations |
| `pack-runtime.mjs` lock-contention hypothesis | ✓ Present (`:307`) | Concrete, baseline + forced-contention reproduction numbers |

All 8 rows present with concrete file:line or commit-hash citations — none vague.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `tests/e2e/toolbar-roles.spec.ts` | 5-region role+name proof | ✓ VERIFIED | Exists, substantive (one real packaged-binary test, not a stub), wired against real `TitleBar.vue`/`StatusBar.vue` changes, 1/1 passes |
| `src/web/components/workbench/TitleBar.vue` | `role="toolbar" aria-label="Title bar actions"` | ✓ VERIFIED | Line 63, exact string |
| `src/web/components/workbench/StatusBar.vue` | `role="toolbar" aria-label="Status bar actions"` | ✓ VERIFIED | Line 64, exact string |
| `tests/e2e/live-region-announcements.spec.ts` | 7-outcome announcement proof | ✓ VERIFIED | 7/7 pass |
| `tests/e2e/popover-keyboard-contract.spec.ts` | 3-surface Esc/focus-return proof | ✓ VERIFIED | 3/3 pass |
| `src/web/App.vue` | New/fixed `announce()` call sites | ✓ VERIFIED | `grep -n "announce("` shows all claimed call sites present at the claimed line numbers (collapse/expand :368, collapse-all :378, Undo count-fix :427, drift-into :478, drift-reset :480, panel tab :539, view-mode :555, filter :569, markdown :576, Finish-validating :741, Finish-completed :749) |
| `DESIGN.md` | Components/Composition/Responsive rewrite | ✓ VERIFIED | Diff confirmed scoped exactly to the 3 locked sections |
| `.planning/STATE.md` | Deferred Items rows for every flake/pre-existing failure | ✓ VERIFIED | 8 rows confirmed (see table above) |
| `tests/e2e/live-region-outcome-audit.spec.ts` | 5-outcome packaged proof | ✓ VERIFIED | 3/3 pass |
| `tests/e2e/finish-review-live-region.spec.ts` | Finish-result consolidation proof | ✓ VERIFIED | 1/1 pass |
| `src/web/components/ExportSection.vue` | Competing live-region attrs removed | ✓ VERIFIED | Confirmed neither named element carries `role`/`aria-live` |
| `tests/integration/anchored-workspace.spec.ts` | Drift reset-to-verified test | ✓ VERIFIED | New test at `:931` passes |
| `tests/e2e/file-tree.spec.ts` | 3 new Phase-21 deferred-item tests | ✓ VERIFIED | 3 real tests (not stubs — exercise real hover/keyboard/filter DOM state), 3/3 pass |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `FileTree.vue`'s debounced `filterResult` emit | `ChangedFilesDialog.vue` | forwarded as `filter-result` (`ChangedFilesDialog.vue:35,67`) | ✓ WIRED |
| `ChangedFilesDialog.vue`'s `filter-result` | `App.vue`'s `handleFilterResult` | `App.vue:1787 @filter-result="handleFilterResult"` | ✓ WIRED |
| `BottomPanel.vue`'s `update:active-tab` | `App.vue`'s `selectPanelTab` | `App.vue:1737` | ✓ WIRED |
| `finishAttachedReview()` | `App.vue`'s single `announce()` owner | lines 741, 749 | ✓ WIRED |
| `hasUnverifiedAnchors` watcher | `announce()` | lines 478 (into-unverified), 480 (reset, new `else if`) | ✓ WIRED |

### Behavioral Spot-Checks (personally re-run gate commands, exact counts)

| Command | Claimed (25-04-SUMMARY) | Personally observed | Match |
|---|---|---|---|
| `npx vitest run --no-file-parallelism` | Test Files: 2 failed, 89 passed (91); Tests: 5 failed, 974 passed (979) | **Test Files: 2 failed, 89 passed (91); Tests: 5 failed, 974 passed (979)** | ✓ Exact |
| `npm run typecheck:web` | 0 errors | **0 errors** | ✓ Exact |
| `npm run typecheck:tests` | 4 `tsc` errors across 3 files (comment-thread, identity-pill ×2, status-bar) | **Identical 4 errors, identical 3 files** | ✓ Exact |
| `npm run verify:semantic-css` | Passed | **Passed** ("Semantic CSS verified…") | ✓ Exact |
| `npx playwright test` (full) | 155 passed, 0 failed (after fix `55bd57f`) | **155 passed, 0 failed** | ✓ Exact |
| `npm run test:runtime-artifact` (default, non-custody) | 16 tests, 7 passed, 9 failed | **16 tests, 7 passed, 9 failed** (required producing a fresh `LOOPNOTE_RUNTIME_CUSTODY_DIR`/`_ARCHIVE_BASENAME`/`_ARCHIVE_SHA256`/`_EVIDENCE` artifact via `pack-runtime.mjs --purpose development-check`, per `docs/support-service-operations.md`; a naive run without these env vars misleadingly shows 2 failed/14-did-not-run and must be discarded) | ✓ Exact |

All 6 gate commands reproduce the SUMMARY's claimed counts exactly, with no drift.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| A11Y-01 | 25-01 | ✓ SATISFIED | `toolbar-roles.spec.ts` 1/1 passes; DEBT-01 zero-occurrence confirmed |
| A11Y-02 | 25-02, 25-05 | ✓ SATISFIED | All 7 + 5 + 2 outcome categories proven, 14+3+1 = 18 total new/fixed e2e/integration tests all pass |
| A11Y-03 | 25-01, 25-03, 25-04 | ✓ SATISFIED | Full regression gate re-run personally; every failure traced to a pre-Phase-25 cause with concrete STATE.md evidence; zero unexplained skips |
| TOK-02 | 25-03 | ✓ SATISFIED | DESIGN.md rewrite confirmed scoped and complete |

No orphaned requirements found against `.planning/REQUIREMENTS.md`'s Phase 25 row (A11Y-01/02/03, TOK-02 — all 4 claimed by the 5 plans collectively).

**Note (not a gap, informational):** `.planning/REQUIREMENTS.md` still marks A11Y-01/02/03 as `[ ]`/"Pending" and `.planning/ROADMAP.md`'s Phase 25 line is still unchecked `[ ]` — this is the orchestrator's end-of-phase bookkeeping commit (the same pattern as Phase 24's `a053d73`), not yet landed as of this verification. Not a BLOCKER; flagging so the orchestrator does not skip it.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX` markers, no placeholder returns, no stub handlers in any file touched by Phase 25's 5 plans.

### Human Verification Required

None remaining. The one item carried in this file's prior revision — Phase 21's list-mode directory-segment DOM order — is resolved, not merely deferred: `21-UI-SPEC.md:197` is unambiguous ("name first then dimmed directory"), and `PathText.vue`'s `nameFirst` prop (wired only at `FileRow.vue:110`'s `:name-first="mode === 'list'"` call site) now renders `.path-text__filename` before `.path-text__directory` in list mode, while tree mode and every other `PathText`/`PathDisplay` call site (`CommentComposer.vue:47`, `AttachedCompletionWaiting.vue:55,57`, `EditorTitle.vue:104`) are untouched and still directory-first/unaffected. `tests/e2e/file-tree.spec.ts:941` now asserts the spec-correct `['path-text__filename', 'path-text__directory']` order. This was a defect fix, not a UX judgment call, so no human sign-off is required.

## Gaps Summary

No gaps. All 17 merged must-have truths across the 5 plans resolve VERIFIED against live re-derivation (not SUMMARY narrative): toolbar roles wired and tested, DEBT-01 zero-occurrence, all 18 live-region/keyboard-contract outcomes proven with exact version-delta evidence, Finish-result and anchor-drift consolidation confirmed source-level (no competing live region) and behaviorally (passing tests), DESIGN.md rewrite scoped exactly as locked, all 6 phase-end gate commands reproduce the SUMMARY's claimed counts byte-for-byte, every remaining red command traces to a pre-Phase-25 cause with `git log 7f6d248..HEAD` independently confirming zero Phase-25 commits touched the failing files, and the orchestrator-added Phase 21 e2e coverage is real (not stubbed) and passing. The sole routed item is a UX-judgment question (not a defect) on the Phase 21 list-mode DOM-order deviation, which keeps status at `human_needed` rather than `passed` per the verifier protocol (any non-empty human-verification section forecloses `passed`), with zero BLOCKER or WARNING findings otherwise.

## Gaps (orchestrator re-baseline)

This verifier's `No gaps` conclusion above used `7f6d248` (a pre-Phase-25 commit) as the "pre-existing, not a regression" baseline. The orchestrator re-measured against `0481bcc`, the v2.0 milestone close commit, in a disposable worktree, and found 4 regressions introduced during v2.1 (Phases 19–24) that this report's baseline choice let through as "pre-existing":

1. **`npm run typecheck:tests`: 0 errors at `0481bcc`; 4 errors now.** `tests/unit/comment-thread.test.ts`, `tests/unit/identity-pill.test.ts` (also missing a `.js` extension on `../../src/contracts/api`), and `tests/unit/status-bar.test.ts` import `.vue` files under the plain-`tsc` `tsconfig.test.json` instead of the vue-tsc `tsconfig.web.test.json` split (the Phase 19 pattern every other `.vue`-importing unit test already follows). This script runs in `.github/workflows/deploy-supabase-production.yml`'s `repository-gates` job on every push to `main`, so CI was red.
2. **`npx vitest run --no-file-parallelism`: a different failing set than `0481bcc`'s environment-dependent one.** `0481bcc`'s failing set (help/agent-ready-export-safety/version) is dist-build-presence-dependent (those tests spawn the packaged `dist/bin/<cmd>.mjs` CLI) and does not fail in this session now that `dist/` has been built — it is genuinely environment-dependent, not fixed by any code change. The 5 failures actually present now are v2.1 regressions: `tests/api/session.test.ts` never updated 2 fixtures for the `status.code` field that `ApiFileStatusSchema` deliberately declares and production always emits; `tests/package/runtime-package-contract.test.ts`'s 3 dependency-contract assertions were never updated for Phase 19's pinned `@typescript/native`/`typescript`/`vue-tsc` devDependency aliases.
3. **`npm run test:runtime-artifact` (custody-gated, run by `publish-npm.yml` before release): Phase 23 reported 16/16; Phase 25's default/non-custody run reported 9 failed/16.** Reproducing Phase 23's exact custody setup (`node scripts/pack-runtime.mjs --purpose development-check --custody-dir <dir> --evidence <path>` with `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL` set to a canonical `https://<20-char-ref>.supabase.co` origin, then the 4 `LOOPNOTE_RUNTIME_*` env vars it prints into `npm run test:runtime-artifact`) found the real cause: Phase 24 moved Export/Finish into `BottomPanel.vue`'s tabs (`ExportTab`/`SummaryTab` are `v-if`-gated on `activeTab`), but `tests/e2e/agent-ready-export.spec.ts`'s shared `openReviewNotes()` helper never selects the Export/Summary tab before interacting with tab-gated content — sibling specs (`standalone-review.spec.ts`, `finish-review-live-region.spec.ts`) already click the tab. Export bytes and Finish's canonical result are unaffected; this was a test-only gap.
4. **TREE-04 list mode renders the dimmed directory before the file name; `21-UI-SPEC.md:197` requires name first, then dimmed directory.** `PathText.vue` rendered `.path-text__directory` before `.path-text__filename` unconditionally. 25-04 discovered this deviation but, instead of fixing it, added a test (`file-tree.spec.ts:872`) that locked in the wrong order and a comment asserting the shipped markup supersedes the spec — and left this report's own Human Verification §1 asking a human to bless the deviation rather than treating it as a defect.

All 4 are closed — see `25-06-PLAN.md` through `25-09-PLAN.md` and their SUMMARYs, and the re-verification section below.

## Re-Verification (gap closure)

**Method:** Each gap's closure was independently re-derived from the live repo at HEAD (`f412457`), not from the 25-06..25-09 SUMMARYs. All 6 phase-end gate commands were personally re-run in full from `/Users/alessandro/projects/diff-review` (no worktree/branch changes). The fix files for all 4 gaps — `tsconfig.test.json` / `tsconfig.web.test.json`, `tests/api/session.test.ts`, `scripts/verify-prerequisites.mjs`, `tests/e2e/agent-ready-export.spec.ts`'s `openReviewNotes()`, and `src/web/components/ui/PathText.vue` / `PathDisplay.vue` / `FileRow.vue` — were read directly and cross-checked against `package.json`'s real dependencies/devDependencies, `21-UI-SPEC.md:197`, and the other `PathText`/`PathDisplay` call sites (`CommentComposer.vue`, `AttachedCompletionWaiting.vue`, `EditorTitle.vue`).

| # | Command | Personally observed (HEAD `f412457`) | `0481bcc` baseline | Comparison |
|---|---|---|---|---|
| 1 | `npm run typecheck:web` | **0 errors** | 0 errors (never one of the 4 gaps) | ✓ Match — unaffected throughout |
| 2 | `npm run typecheck:tests` | **0 errors** (`typecheck:tests:node` + `typecheck:tests:web` both clean) | 0 errors | ✓ Gap 1 closed — matches `0481bcc`; `comment-thread.test.ts`/`identity-pill.test.ts`/`status-bar.test.ts` are now in `tsconfig.web.test.json`'s `include` and out of `tsconfig.test.json`'s `exclude`; `identity-pill.test.ts`'s `.js` extension fixed |
| 3 | `npx vitest run --no-file-parallelism` | **Test Files: 91 passed (91); Tests: 979 passed (979)** — 0 failed | Environment-dependent set only (help/agent-ready-export-safety/version; dist-build-presence-dependent) | ✓ Gap 2 closed and then some — `dist/` was built this session, so even the environment-dependent set passed; `session.test.ts` fixtures now carry `status: { code: 'R'/'D', … }`, and `verify-prerequisites.mjs`'s `approvedDependencies` (19 entries) now matches `package.json`'s 9 dependencies + 10 devDependencies exactly |
| 4 | `npm run verify:semantic-css` (runs `build:web`) | **Passed** — "Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass." | Passed (never one of the 4 gaps) | ✓ Match |
| 5 | `npm run build` then `npx playwright test` (full) | **155 passed, 0 failed** | 155 passed, 0 failed (25-04-SUMMARY.md pre-Phase-25-regression-era baseline; not one of the 4 numbered gaps but part of the same regression gate) | ✓ Exact match |
| 6 | `npm run test:runtime-artifact` (custody-gated, Phase 23 setup reproduced via `pack-runtime.mjs --purpose development-check --custody-dir … --evidence …`) | **16 passed, 0 failed** | 16/16 (Phase 23's original locally-packed-artifact result) | ✓ Gap 3 closed — matches Phase 23/`0481bcc`-era baseline exactly; `openReviewNotes(page, tab = 'export')` now selects the BottomPanel tab before interacting with tab-gated content |

**Gap 4 (TREE-04, not a shell-command gate):** `src/web/components/ui/PathText.vue` renders `nameFirst ? [filename, directory] : [directory, filename]`; `FileRow.vue:110` is the only call site passing `:name-first="mode === 'list'"`, so only list mode gets name-first ordering — tree mode (`basename="mode !== 'list'"` hides the directory anyway) and every other `PathDisplay`/`PathText` consumer are unchanged. `tests/e2e/file-tree.spec.ts:941` asserts `['path-text__filename', 'path-text__directory']`, matching `21-UI-SPEC.md:197` verbatim ("name first then dimmed directory"). Closed by commit `e2a0534`.

**Custody artifacts:** the `development-check` evidence JSON, packed `.tgz`, and custody directory produced to reproduce gate 6 were disposable local reproduction artifacts (`$TMPDIR/verify-custody-*`, `$TMPDIR/verify-evidence-*.json`) and were deleted after the run; nothing was committed.

**Conclusion:** all 4 orchestrator re-baseline gaps are closed and independently reproduced; all 6 gate commands are green against live HEAD; no BLOCKERs, no WARNINGs, no open human-verification items. Status: **passed**.


---

_Verified: 2026-11-06T06:52:55Z_
_Verifier: gsd-verifier (goal-backward, re-verification)_
