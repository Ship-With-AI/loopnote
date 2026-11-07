---
phase: 24
plan: 11
type: auto
wave: 5
status: complete
---

# 24-11 Summary: Retarget agent-ready-export-safety harness, prove byte-identity, and sweep the full test surface for remaining tab-default breakage

## Commits

| Commit | Type | Description |
|---|---|---|
| `ace8178` | fix | retarget `agent-ready-export-safety.spec.ts`'s inline `lifecycleHarness` from mounting `BottomPanel` to mounting `ExportTab`, remapping props to `ExportTab`'s surface (drop `open`/`inventory`/`failure`/`retainedSummary`; rename `mutationLocked`→`locked`; everything else, including the already-present `activeTab: 'export'`, left byte-identical) — **Task 1** |
| `624b861` | fix | **(scope expansion)** `complete-review-draft.spec.ts` — click the Summary tab inside the shared `openReviewNotes()` helper (all 4 call sites immediately assert Summary-tab-only content) |
| `37248d5` | fix | **(scope expansion)** `standalone-review.spec.ts` — click the Export tab inside `openReviewNotes()` (its one caller immediately asserts the Export-tab-only "Export review" button) |
| `d8005d9` | fix | **(scope expansion)** `workbench-shell-smoke.spec.ts` — click the Export tab at the two `openPanel()` call sites that assert Export-tab-only content ("Export review" button, "Finish attached review" heading); the third call site only asserts the Export button's *absence* and needed no change |
| `e53f9a5` | fix | **(scope expansion)** `selector-drift-ui.spec.ts` — replace the stale pre-tab-shell "Summary" disclosure-button (`aria-expanded`) assertion with a Summary-tab click + `aria-selected` check, preserving the test's original intent (activate the Summary section before its nested Edit/Preview sub-tabs) |

Every commit stages only the one spec file it touches (plus this SUMMARY, committed separately below). No production code was touched by this plan — `files_modified` deviation is the SUMMARY file itself and the four scope-expansion spec files, both pre-authorized.

## Task 1: Retarget agent-ready-export-safety.spec.ts's harness

Applied exactly as specified: `import BottomPanel from '/components/workbench/BottomPanel.vue'` → `import ExportTab from '/components/workbench/ExportTab.vue'`; the `h(BottomPanel, {...})` call remapped to `h(ExportTab, {...})`, dropping `open`, `inventory`, `failure`, `retainedSummary` (none are `ExportTab` props), renaming `mutationLocked` → `locked` (`ExportSection`'s actual prop name), and leaving every other value/expression — including `activeTab: 'export'`, which the plan's enumerated drop list never named — untouched, per the plan's own closing sentence ("every other value/expression is identical to today's harness").

`npm run build:web && npx playwright test tests/e2e/agent-ready-export-safety.spec.ts`: **2/2 passed** (both the forced-unavailable-capability test and the attached-lifecycle test, including the composer-lock assertions that never touched `BottomPanel`/`ExportTab` at all).

## Task 2: Phase-wide gate and byte-identity proof

All gate commands re-run clean on final `HEAD` (after every scope-expansion fix below):

- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **PASS** (`Semantic CSS verified: canonical root, retired vocabulary, author-style invariants pass.`).
- `npx vitest run --no-file-parallelism tests/unit` — **46 files / 478 tests passed, 0 failures.**
- `npm run build` — clean, produced `dist/bin/loopnote.mjs`.
- `npx playwright test tests/e2e/agent-ready-export-safety.spec.ts tests/e2e/agent-ready-export.spec.ts tests/integration/export-receipt-ui.spec.ts tests/e2e/complete-review-draft.spec.ts` (packaged binary) — **16/16 passed** (2 agent-ready-export-safety + 8 complete-review-draft + 6 export-receipt-ui; `agent-ready-export.spec.ts` contributes 0 tests here — see custody-gated note below).

**Session-kind coverage:** agent-attached kind proven live via `agent-ready-export-safety.spec.ts` (2/2); ordinary/standalone export kind proven live via `complete-review-draft.spec.ts` (8/8) and `export-receipt-ui.spec.ts` (6/6) — satisfies "at least two of the five session kinds" against the packaged binary.

### `agent-ready-export.spec.ts` — custody-gated, not executable in this sandbox

`playwright.config.ts` sets `testIgnore: custodyGatedSpecs` (`playwright.runtime-artifact.config.ts`), which excludes `agent-ready-export.spec.ts` (along with `package-assets.spec.ts`, `public-support-states.spec.ts`, `marketplace-review.spec.ts`) from the default `npx playwright test` run — this is why it silently contributed 0 tests above and why it is absent from the full-suite sweep below. Running it requires the alternate config (`npx playwright test --config playwright.runtime-artifact.config.ts tests/e2e/agent-ready-export.spec.ts`), which I did: 1/15 tests ran and failed, 14 "did not run" — all because `test.beforeAll` calls `resolveAcceptanceRuntime()`, which (for the default `local-archive` source) requires `LOOPNOTE_RUNTIME_CUSTODY_DIR`, `LOOPNOTE_RUNTIME_ARCHIVE_BASENAME`, `LOOPNOTE_RUNTIME_ARCHIVE_SHA256`, and `LOOPNOTE_RUNTIME_EVIDENCE` (a CI release-pipeline's packaged-npm-tarball + producer-evidence JSON with matching SHA-256/SHA-1/SHA-512 digests) — infrastructure this sandbox does not have and `npm run build` does not produce. This requirement is **not** a Phase 24 artifact: `tests/helpers/runtime-artifact.ts`, `tests/helpers/acceptance-runtime.ts`, and `playwright.runtime-artifact.config.ts` are **byte-identical to the pre-Phase-24 baseline** (`git diff 6f64e1d -- tests/helpers/runtime-artifact.ts tests/helpers/acceptance-runtime.ts playwright.runtime-artifact.config.ts` = 0 lines), and `agent-ready-export.spec.ts` itself is also **byte-identical to baseline** (0-line diff, confirmed below) — it is a pre-existing, unrelated, unchanged CI-only release-acceptance gate, not something introduced or broken by this phase.

### Byte-identity proof (the literal expected-value diff against pre-Phase-24 commit `6f64e1d`)

`git diff 6f64e1d -- <file>` for each of the four named spec files, confirming only harness-mount/locator/tab-click code changed and **zero** literal expected-value (hash/digest/byte-count/timestamp/`FinishReviewResult` field) was touched:

- **`tests/e2e/agent-ready-export.spec.ts`** — 0-line diff. Completely untouched by Phase 24.
- **`tests/e2e/agent-ready-export-safety.spec.ts`** — harness-mount-only diff (this plan's Task 1 commit `ace8178`, reproduced above). No assertion/expected-value line touched.
- **`tests/integration/export-receipt-ui.spec.ts`** — one added line in `openReview()` (Plan 24-10's `f37cc96`, not re-touched here): `await page.getByRole('region', ...).getByRole('tab', { name: 'Export', exact: true }).click();`. No expected-value line touched.
- **`tests/e2e/complete-review-draft.spec.ts`** — one added line in `openReviewNotes()` (this plan's `624b861`): a Summary-tab click. No expected-value line touched.

Every one of these files' SHA-256/digest literals, byte counts, `exportedAt` timestamps, `draftRevision` numbers, and `FinishReviewResult` field assertions are confirmed **unchanged, character-for-character**, from the pre-Phase-24 baseline — the export bytes and the delivered canonical Finish result are byte-identical to before this phase.

### Static locator confirmation

`grep -n "Finish review" tests/e2e/agent-ready-export.spec.ts`: 9 occurrences, all reading `page.getByRole('region', { name: 'Finish attached review' }).getByRole('button', { name: 'Finish review', exact: true })` (one split across two intermediate `completion`/`finish` locals at line 621-622, 8 fully inline at lines 666, 669, 725, 732, 788, 891, 932, 985) — zero stray un-rescoped locators, per `24-RESEARCH.md` Pitfall 3.

## Scope-expansion sweep: full `npx playwright test` suite

Per the authorized scope expansion, ran the **full** default-config suite (not just the plan's named files) against the packaged binary, twice (before and after fixes):

**First full run — 130 tests, 23 spec files, 4 failures:**

1. `tests/e2e/standalone-review.spec.ts:247` — timed out waiting for `dialog.getByRole('button', { name: 'Export review' })` inside `openReviewNotes()`'s `'Review'` region.
2. `tests/e2e/workbench-shell-smoke.spec.ts:282` ("standalone: ... Export emphasized") — `'.workbench-shell__panel'.getByRole('button', { name: 'Export review' })` not visible.
3. `tests/e2e/workbench-shell-smoke.spec.ts:640` ("agent-attached: ... Finish review entry point") — `'.workbench-shell__panel'.getByRole('heading', { name: 'Finish attached review' })` not visible.
4. `tests/integration/selector-drift-ui.spec.ts:314` — `getByRole('button', { name: /^Summary\b/ })` (old pre-tab-shell disclosure button) not found; expected `aria-expanded: "true"`.

**Root-cause confirmation, per file:**

- **1–3:** Identical root cause to Plan 24-10's two fixes — Comments is now the default landing tab (Plan 24-08/24-09), so each failing assertion targeted Export-tab-only content (`ExportSection`'s "Export review" button, "Finish attached review" heading) without first clicking the `role="tab"` "Export" button. Mechanical fix applied: click the Export tab before the assertion (inside the shared helper where every caller needed it; at the individual call site where only some did — `workbench-shell-smoke.spec.ts`'s third `openPanel()` call site only asserts the Export button's *absence*, which holds regardless of active tab, so it was correctly left untouched).
- **4:** Same underlying cause (tab-shell migration), different manifestation: the pre-Phase-24 `BottomPanel` exposed a collapsible "Summary" disclosure button (`aria-expanded`) that auto-expanded; Phase 24 replaced it with a `role="tab"` "Summary" entry, and Comments (not Summary) is now the default tab. The old assertion is structurally obsolete, not just missing a click — I confirmed the current `BottomPanel.vue` `TABS` array (`{ id: 'summary', label: 'Summary' }`) has no remaining disclosure-button equivalent, so the correct fix is a Summary-tab click + `aria-selected` check in place of the stale `aria-expanded` check, preserving the test's original intent (ensure the Summary section is active before interacting with its nested Edit/Preview sub-tabs). This is squarely the same category of fix (click the correct `role="tab"` button before the assertion), not a new behavioral change.

None of these four failures required pre-phase-baseline worktree reproduction — in all four cases the failing assertion's target markup (role, name) unambiguously traces to code `BottomPanel.vue`/`ExportSection.vue`/`ExportTab.vue` changed in this phase (confirmed by reading the current component source before writing each fix), and no fix touched an expected-value literal.

**Second full run (after all fixes) — 130 tests, 23 spec files: 130 passed, 0 failed.**

**Custody-gated files not in either sweep** (`package-assets.spec.ts`, `agent-ready-export.spec.ts`, `public-support-states.spec.ts`, `marketplace-review.spec.ts`): all four confirmed **byte-identical to the pre-Phase-24 baseline** (`git diff 6f64e1d -- <file>` = 0 lines for each), so none carry Phase-24-introduced risk; they are excluded from the default suite by design (`custodyGatedSpecs`) and require external CI release-artifact infrastructure unavailable in this sandbox (see the `agent-ready-export.spec.ts` note above, which applies identically to the other three).

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — fix blocking issues caused by this phase's own prior plans)

**1. `complete-review-draft.spec.ts` — missing Summary-tab click before Summary-only assertions**
- **Found during:** full-suite sweep (authorized scope expansion), both named tests in this file (`:307`, `:344`) timed out.
- **Issue:** `openReviewNotes()` opened the panel but never selected a tab; Comments (not Summary) is now the default, and every one of its 4 callers immediately asserts the "Write summary" button / summary editor, both Summary-tab-only.
- **Fix:** click the `role="tab"` "Summary" button inside the shared helper.
- **Files modified:** `tests/e2e/complete-review-draft.spec.ts`.
- **Verification:** `npx playwright test tests/e2e/complete-review-draft.spec.ts` — 8/8 passed.
- **Committed in:** `624b861`.

**2. `standalone-review.spec.ts` — missing Export-tab click before Export-only assertion**
- **Found during:** full-suite sweep.
- **Issue:** same root cause; `openReviewNotes()`'s one caller immediately asserts the "Export review" button, Export-tab-only.
- **Fix:** click the "Export" tab inside the helper.
- **Files modified:** `tests/e2e/standalone-review.spec.ts`.
- **Verification:** `npx playwright test tests/e2e/standalone-review.spec.ts` — 7/7 passed.
- **Committed in:** `37248d5`.

**3. `workbench-shell-smoke.spec.ts` — missing Export-tab click before two of three `openPanel()` call sites' assertions**
- **Found during:** full-suite sweep.
- **Issue:** same root cause, at two of three call sites (the third only asserts absence, correctly left alone).
- **Fix:** click the "Export" tab at each affected call site.
- **Files modified:** `tests/e2e/workbench-shell-smoke.spec.ts`.
- **Verification:** `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` — 8/8 passed.
- **Committed in:** `d8005d9`.

**4. `selector-drift-ui.spec.ts` — stale pre-tab-shell "Summary" disclosure assertion**
- **Found during:** full-suite sweep.
- **Issue:** asserted a collapsible "Summary" button's `aria-expanded` attribute, a structure Phase 24 removed in favor of the `role="tab"` shell.
- **Fix:** replaced with a Summary-tab click + `aria-selected` check (same intent: activate Summary before its nested Edit/Preview sub-tabs).
- **Files modified:** `tests/integration/selector-drift-ui.spec.ts`.
- **Verification:** `npx playwright test tests/integration/selector-drift-ui.spec.ts` — 5/5 passed.
- **Committed in:** `e53f9a5`.

---

**Total deviations:** 4 auto-fixed (all Rule 3 — blocking issues caused by this phase's own prior plans' default-tab change, explicitly pre-authorized by the SCOPE EXPANSION context).
**Impact on plan:** All four are mechanical locator/tab-click fixes required for the phase's own stated acceptance gate ("full `npx playwright test` suite passes"). No expected-value literal was touched in any of them (confirmed via diff). No scope creep beyond the pre-authorized set.

## Issues Encountered

`agent-ready-export.spec.ts` cannot be executed in this sandbox (requires a CI-only release-artifact custody directory + producer-evidence JSON unavailable here) — resolved by confirming via `git diff 6f64e1d` that the file, and every helper it depends on for that requirement, is byte-identical to the pre-Phase-24 baseline, so its byte-identity is proven by the strongest available means (zero change, not even to locators) rather than by live execution. This is not a Phase 24 regression and not fixable from within this plan's scope (it needs external build infrastructure, not a code or test change).

## Final automated gates (all against current `HEAD`, commit `e53f9a5`)

- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **PASS**.
- `npx vitest run --no-file-parallelism tests/unit` — **46 files / 478 tests passed.**
- `npm run build` — clean.
- `npx playwright test` (full default suite) — **130/130 passed, 0 failed, 23 spec files.**
- `npx playwright test tests/e2e/agent-ready-export-safety.spec.ts tests/e2e/agent-ready-export.spec.ts tests/integration/export-receipt-ui.spec.ts tests/e2e/complete-review-draft.spec.ts` — **16/16 passed** (packaged binary).

## Self-Check

PASSED
