---
phase: 13-single-pane-file-rendering
verified: 2026-10-30T16:00:00Z
status: gaps_found
score: 16/17 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Phase 13's changes leave the project's CI-gated test typecheck command (`npm run typecheck:tests:web`, invoked by `.github/workflows/deploy-supabase-production.yml` before `vitest run` and `playwright test`) passing."
    status: failed
    reason: "13-02 made `SessionFileSchema.oldMode` a required field on the wire contract. Six pre-existing test fixture files across the e2e/integration/unit suites were never updated to include it, so `tsc --noEmit --project tsconfig.web.test.json` fails with 'Property oldMode is missing' at ~14 call sites. Separately, 13-01's own `tests/unit/monaco-diff-adapter.test.ts` (a file this phase's own files_modified list owns) has TS2352/TS2493 tuple-typing errors at lines 273, 300, 303 from its `addAction` mock. This was documented three times in the phase's own `deferred-items.md` (after 13-03, again implicitly in 13-04's 'Issues Encountered') but never fixed, and never formally accepted as debt in ROADMAP.md's backlog the way v1.6's DEBT-01 was."
    artifacts:
      - path: "tests/e2e/pinned-session.spec.ts"
        issue: "9 inline SessionFile-shaped fixture literals missing required `oldMode` field"
      - path: "tests/e2e/responsive-session.spec.ts"
        issue: "3 inline fixture literals missing `oldMode`"
      - path: "tests/integration/anchored-workspace.spec.ts"
        issue: "2 inline fixture literals missing `oldMode`"
      - path: "tests/unit/draft-reconciliation.test.ts"
        issue: "1 inline fixture literal missing `oldMode`"
      - path: "tests/unit/file-tree.test.ts"
        issue: "1 inline fixture literal missing `oldMode`"
      - path: "tests/unit/monaco-diff-adapter.test.ts"
        issue: "TS2352/TS2493 tuple-typing errors on the addAction mock (lines 273, 300, 303), introduced by 13-01 and never fixed within the phase that created it"
    missing:
      - "Add `oldMode: '100644'` (or the appropriate mode literal) to the ~14 fixture literal call sites in the five listed e2e/integration/unit files, OR introduce a shared SessionFile test-fixture factory that defaults it."
      - "Fix the `addAction` mock's return-type assertion in tests/unit/monaco-diff-adapter.test.ts so `tsc --noEmit --project tsconfig.web.test.json` stops erroring at lines 273/300/303."
      - "If a fix is deliberately deferred, add an explicit backlog entry to ROADMAP.md (mirroring the DEBT-01 format) recording the decision to accept this as debt, rather than leaving it undocumented outside the phase's own working file."
---

# Phase 13: Single-Pane File Rendering Verification Report

**Phase Goal:** Reviewers see files that are entirely added or entirely deleted as one full-width pane instead of a diff with an empty side, and can tell single-pane files apart from side-by-side ones without relying on color.
**Verified:** 2026-10-30T16:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                     | Status     | Evidence                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | (Roadmap SC1 / PANE-01) Reviewer opens an added file, sees entire content in one full-width pane, no empty Base side, can comment any line anchored to Head | ✓ VERIFIED | `DiffWorkspace.vue`'s `v-if="singlePaneSide !== undefined"` branch renders one `.diff-workspace__editor` via `createMonacoSinglePaneAdapter`; Playwright test `'packaged review renders an added file as one single-pane and accepts a comment'` passes against the real packaged CLI (ran live: 5/5 tests pass). |
| 2   | (Roadmap SC2 / PANE-02) Reviewer opens a deleted file, sees entire removed content in one full-width pane, no empty Head side, can comment any line anchored to Base | ✓ VERIFIED | Same mechanism, `side: 'base'`; Playwright test `'packaged review renders a deleted file as one single-pane and accepts a comment'` passes live.                                                                           |
| 3   | (Roadmap SC3 / PANE-03) Reviewer can tell, from file header and file tree, without color, single-pane vs side-by-side; modified/renamed/copied keep side-by-side | ✓ VERIFIED | `StatusBadge.vue`'s `singlePaneSuffix` computed + `ActiveFileToolbar.vue`'s `layoutLabel` computed; e2e asserts tree row accessible name matches `/single pane/i`, header shows `Added · Head only`/`Deleted · Base only`, and a regression assertion on `src/changed.ts` confirms no layout label and `.monaco-diff-editor` count stays 1. |
| 4   | A plain Monaco editor is constructed/loaded/disposed without ever referencing a second editor, model, or diff computation (13-01)                        | ✓ VERIFIED | `PublicMonacoSinglePaneAdapter` (diff-adapter.ts:610+) contains zero occurrences of `renderSideBySide`/`hideUnchangedRegions`/`diffAlgorithm`/`originalEditable`/`renderMarginRevertIcon` (grep confirms all matches are above line 610, inside `PublicMonacoDiffAdapter`); 20 unit tests in `monaco-diff-adapter.test.ts` pass (ran live).                                                                                 |
| 5   | Opening a comment composer creates exactly one view zone; no spacer zone on a nonexistent counterpart editor (13-01)                                      | ✓ VERIFIED | Grep confirms `counterpartBoundary`/`counterpartEditor`/`counterpartModel`/`createSpacerZone`/`growPairedZones` all occur only above line 610 (inside `PublicMonacoDiffAdapter`); unit tests assert exactly one `addZone` call.                                                                                      |
| 6   | The single-pane editor never requests diff-only Monaco APIs (13-01)                                                                                        | ✓ VERIFIED | Same grep scope check as #4/#5 — zero diff-only API references inside the single-pane class body.                                                                                                                         |
| 7   | `singlePaneSideFor`/`wasModeKind` pure functions route single-pane status exactly per D-05/D-06/D-08 (13-02)                                               | ✓ VERIFIED | Read `src/web/model/single-pane-layout.ts` directly: `singlePaneSideFor` returns `undefined` unless `availability.kind === 'text'`, and only maps `added→head`, `deleted→base`, `type-changed→head`; 12 unit tests pass live.                                                                                       |
| 8   | `SessionFileSchema.oldMode` is carried on the client-facing `/api/session` response for both pinned-range and exact-patch sessions (13-02)                | ✓ VERIFIED | Grep confirms `oldMode` present in `src/contracts/api.ts` (2 schema sites), `src/server/capabilities.ts` (both session-building paths), `src/server/patch-snapshot.ts` (exact-patch path).                                                                                                                           |
| 9   | Modified/renamed/copied files render exactly as before this phase — unaffected (D-05, 13-03)                                                               | ✓ VERIFIED | e2e regression assertion on `src/changed.ts`: no single-pane layout-label text present, `.monaco-diff-editor` count is 1 — passes live.                                                                                                                                                                              |
| 10  | A 0-byte added/deleted file shows an "Empty file (0 bytes)" notice instead of a blank editor, with no comment target lines (D-07, 13-03)                  | ✓ VERIFIED | Code read of `DiffWorkspace.vue`: `isSinglePaneFileEmpty` computed (`side.exists && side.text.length === 0`) gates a mutually exclusive `v-if`/`v-else` between the `InlineNotice` and the editor host + gutter-action button — correct wiring confirmed by direct inspection. **No automated test (unit or e2e) exercises this branch** — see Anti-Patterns.                                                              |
| 11  | Single-pane files show no whole-file tint/+/- gutter signs (D-02); diff-only nav controls are removed from the DOM, not just hidden (D-04, 13-03)         | ✓ VERIFIED | Grep: `diff-workspace__side-cue` appears exactly 2×, both inside the unchanged side-by-side `v-else` branch (lines 397/401), none in the single-pane branch. `ReviewToolbar.vue`'s "Change navigation" group uses `v-if="!singlePane"` (actual conditional render, confirmed by direct read), "File navigation" stays unconditional.                                                                                          |
| 12  | Export output (`render-review-markdown.ts`, `draft.ts`) is unchanged by this phase (D-14, 13-03)                                                            | ✓ VERIFIED | `git show --stat` on every phase-13 commit (801aa30, 8ffd2e3, 02bd887, 107945b, e84284a, e77ee29, ca1d9bd, ed7b333, bad5a89, 83aaded, baac2b5) touching those two files returns none.                                                                                                                                |
| 13  | File tree row's accessible label distinguishes single-pane from side-by-side without color (D-09, 13-04)                                                  | ✓ VERIFIED | `StatusBadge.vue`'s `singlePaneSuffix` appends `, single pane` when `reviewable` and kind ∈ {added, deleted, type-changed}; `FileRow.vue` passes `:reviewable="leaf.file.availability.kind === 'text'"`; e2e asserts tree row accessible name matches `/single pane/i`.                                            |
| 14  | File header text label matches D-10/D-11 exact copy; side-by-side files get no extra label (13-04)                                                        | ✓ VERIFIED | `ActiveFileToolbar.vue`'s `layoutLabel` computed returns the exact D-10 strings only when `singlePaneSideFor` resolves a side; falls back to the unchanged plain `status.kind` span otherwise. e2e confirms `Added · Head only`/`Deleted · Base only` visible and absent on the modified-file regression check.        |
| 15  | Binary/oversized/unsupported files get no single-pane marker in either tree or header (D-08, 13-04)                                                        | ✓ VERIFIED | Both `FileRow.vue`'s `:reviewable` gate and `singlePaneSideFor`'s `availability.kind !== 'text' → undefined` short-circuit independently enforce this; no reviewable file's layout label or suffix can appear for a non-text-availability file by construction.                                                     |
| 16  | Automated browser tests prove PANE-01/02/03 end to end through the packaged CLI (13-05)                                                                    | ✓ VERIFIED | Ran `npx playwright test tests/e2e/anchored-review.spec.ts` live: **5 passed, 0 failed**, including the two new single-pane tests and all 3 pre-existing tests in the file (no regression).                                                                                                                         |
| 17  | Phase 13's own changes leave the project's CI-gated test typecheck (`npm run typecheck:tests:web`) passing                                                | ✗ FAILED   | Ran `npm run typecheck:tests:web` live: fails with ~14 "Property 'oldMode' is missing" errors across 5 pre-existing test files, plus TS2352/TS2493 errors in 13-01's own `monaco-diff-adapter.test.ts`. See Gaps Summary below.                                                                                      |

**Score:** 16/17 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact                                              | Expected                                                                 | Status     | Details                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `src/web/monaco/diff-adapter.ts`                        | `PublicMonacoSinglePaneAdapter` + `createMonacoSinglePaneAdapter`          | ✓ VERIFIED | Both present, exactly 1 match each; no diff-only API/field leakage into the new class.             |
| `src/web/model/single-pane-layout.ts`                   | `singlePaneSideFor`, `wasModeKind` pure functions                         | ✓ VERIFIED | File exists, exports match, logic matches D-05/D-06/D-08 exactly on direct read.                   |
| `src/contracts/api.ts`                                  | `SessionFileSchema.oldMode: GitModeSchema`                                | ✓ VERIFIED | Present at both schema definition sites.                                                           |
| `src/server/capabilities.ts`, `src/server/patch-snapshot.ts` | `oldMode` populated on wire response                                 | ✓ VERIFIED | Present on both the range-session and exact-patch-session construction paths.                      |
| `src/web/App.vue`                                       | `singlePaneSide`/`singlePaneBaseOid`/`singlePaneHeadOid` computeds, threaded as props | ✓ VERIFIED | Confirmed via direct grep/read.                                                                     |
| `src/web/components/DiffWorkspace.vue`                  | Single-pane template branch, empty-file notice, adapter construction branch | ✓ VERIFIED | Confirmed via direct read of lines 78-95, 355-420.                                                  |
| `src/web/components/ReviewToolbar.vue`                  | `v-if="!singlePane"` on "Change navigation" group                         | ✓ VERIFIED | Confirmed via direct read; "File navigation" unconditional.                                        |
| `src/web/components/StatusBadge.vue`                    | `reviewable` prop, `singlePaneSuffix` computed                            | ✓ VERIFIED | Confirmed via full file read.                                                                       |
| `src/web/components/FileRow.vue`                        | `:reviewable` prop threaded from `availability.kind`                      | ✓ VERIFIED | Confirmed via grep.                                                                                 |
| `src/web/components/ActiveFileToolbar.vue`               | `<StatusBadge>` + `layoutLabel` replacing raw `status.kind` for single-pane | ✓ VERIFIED | Confirmed via full read of lines 1-50, 70-90.                                                       |
| `tests/e2e/anchored-review.spec.ts`                      | `activateSinglePaneLine` helper, two new tests, regression guard          | ✓ VERIFIED | Confirmed via grep + live Playwright run (5/5 pass).                                                |

### Key Link Verification

| From                                   | To                                     | Via                                                              | Status  | Details                                                                 |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------- |
| `src/web/App.vue`                        | `src/web/model/single-pane-layout.ts`   | `singlePaneSideFor(selectedFile.status.kind, selectedFile.availability)` | ✓ WIRED | Confirmed at `App.vue:150-153`.                                        |
| `src/web/components/DiffWorkspace.vue`   | `src/web/monaco/diff-adapter.ts`        | `createMonacoSinglePaneAdapter` constructed when `props.singlePaneSide` defined | ✓ WIRED | Confirmed at lines 316-329 (initial mount + watch-driven reconstruction). |
| `src/web/App.vue`                        | `src/web/components/ReviewToolbar.vue`  | `:single-pane="singlePaneSide !== undefined"` prop                | ✓ WIRED | Confirmed at `App.vue:1144`; `ReviewToolbar.vue:9` declares the prop, `:48` gates on it. |
| `src/web/components/FileRow.vue`         | `src/web/components/StatusBadge.vue`    | `:reviewable="leaf.file.availability.kind === 'text'"`             | ✓ WIRED | Confirmed by grep.                                                       |
| `src/web/components/ActiveFileToolbar.vue` | `src/web/model/single-pane-layout.ts` | `singlePaneSideFor`/`wasModeKind` imports and calls                | ✓ WIRED | Confirmed by read.                                                       |
| `tests/e2e/anchored-review.spec.ts`      | packaged CLI runtime                   | `createGitFixture({ anchoredReview: true })` → `startGeneratedCli` → real Chromium session | ✓ WIRED | Live run: 5/5 tests pass, including assertions against actual DOM structure and a persisted `/api/draft/mutations` comment. |

### Behavioral Spot-Checks

| Behavior                                                        | Command                                                                                     | Result                              | Status |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| Single-pane adapter unit tests (construction, anchor/view-zone)   | `npx vitest run tests/unit/monaco-diff-adapter.test.ts tests/unit/single-pane-layout.test.ts` | 2 files, 32 tests passed               | ✓ PASS |
| `npm run typecheck:web` (web application source)                 | `npm run typecheck:web`                                                                        | exits 0                                | ✓ PASS |
| `npm run typecheck:tests:web` (test-suite typecheck, CI-gated)    | `npm run typecheck:tests:web`                                                                   | **exits non-zero**, ~17 TS errors      | ✗ FAIL |
| Broader unit/api/integration suite regression check               | `npx vitest run tests/unit tests/api tests/integration`                                        | 361/362 passed; 1 unrelated pre-existing flaky timeout in `token-contract.test.ts` (Vite dev-server reload test, not touched by Phase 13) | ✓ PASS (no Phase 13 regression) |
| Full e2e spec for this phase, real packaged CLI + Chromium          | `npm run build:web && npx playwright test tests/e2e/anchored-review.spec.ts`                   | 5/5 passed                             | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                 | Status   | Evidence                                                                   |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| PANE-01     | 13-01, 13-02, 13-03, 13-05 | Added file renders as one full-width pane, no empty Base side, commentable, anchored to Head           | Complete | REQUIREMENTS.md traceability row marks Complete; independently confirmed by code read + live e2e run. |
| PANE-02     | 13-01, 13-02, 13-03, 13-05 | Deleted file renders as one full-width pane, no empty Head side, commentable, anchored to Base          | Complete | Same.                                                                        |
| PANE-03     | 13-02, 13-03, 13-04, 13-05 | Reviewer tells single-pane apart from side-by-side via header/tree without color                        | Complete | Same.                                                                        |

### Anti-Patterns Found

| File                                          | Line         | Pattern                                                                 | Severity | Impact                                                                                                                                                       |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/pinned-session.spec.ts` and 4 other test files | multiple   | Pre-existing `SessionFile` fixture literals not updated after 13-02 made `oldMode` required | WARNING  | Breaks `npm run typecheck:tests:web`, which `.github/workflows/deploy-supabase-production.yml` runs before `vitest run`/`playwright test` in CI. Runtime tests still pass (vitest doesn't typecheck), so this is a silent CI-pipeline breakage, not a functional regression. |
| `tests/unit/monaco-diff-adapter.test.ts`         | 273, 300, 303 | TS2352/TS2493 tuple-typing errors in the `addAction` mock, introduced by 13-01 itself | WARNING  | Same CI-typecheck breakage, in a file this phase's own `files_modified` list owns — not a pre-existing-elsewhere issue, it's the phase's own test file.     |
| `DiffWorkspace.vue` `isSinglePaneFileEmpty` branch (D-07) | 371        | No automated test (unit or Playwright) exercises the 0-byte empty-file notice | WARNING (minor) | Code is simple and correctly wired on direct inspection (verified above as truth #10), but the behavior has zero test coverage anywhere in the suite — a future refactor could silently break it undetected. |

### Human Verification Required

None — every item above was resolvable by direct code inspection, grep, or a live run of the automated test suite (vitest + Playwright + tsc). No visual-only, real-time, or external-service behavior remains unverified.

### Gaps Summary

Phase 13's actual product goal — PANE-01, PANE-02, PANE-03 — **is achieved**. All three ROADMAP.md success criteria, and every plan-level must-have truth tied to them, are independently verified by direct code inspection plus live runs of the unit test suite (32/32 relevant tests pass) and the full Playwright e2e spec (5/5 pass, including the two new single-pane flows and a regression guard proving modified files are untouched).

The one gap is **not** a failure of any declared must-have truth — it's a regression the phase's own work introduced and never resolved: `npm run typecheck:tests:web` (the test-suite typecheck step that `.github/workflows/deploy-supabase-production.yml` runs before `vitest run` and `playwright test` in the deploy pipeline) currently fails. 13-02's `SessionFileSchema.oldMode` field going from absent to required broke five pre-existing test fixture files that were never updated, and 13-01's own new test file (`tests/unit/monaco-diff-adapter.test.ts`) ships with its own tuple-typing errors. This was flagged in the phase's internal `deferred-items.md` after 13-03 (and referenced again in 13-04's "Issues Encountered") but each time dismissed as "out of scope for this plan's `files_modified`" — true at the single-plan level, but nothing in the phase's five plans ever closed the loop, and it was never promoted to an explicit accepted-debt entry in ROADMAP.md's backlog the way v1.6's DEBT-01 was. Runtime correctness is unaffected (vitest does not typecheck test files, so all 361 other unit/api/integration tests and all 5 e2e tests pass); this is a build-pipeline hygiene gap, not a user-facing defect.

Recommended closure: a short follow-up (likely a `quick` task, not a full phase) adding `oldMode` to the ~14 affected fixture literals and fixing the `addAction` mock's type assertion — or, if deliberately deferred, an explicit ROADMAP.md backlog entry recording that decision.

---

_Verified: 2026-10-30T16:00:00Z_
_Verifier: gsd-verifier_
