---
phase: 24
plan: 08
type: auto
status: complete
---

# 24-08 Summary: Convert BottomPanel.vue to three-tab ARIA shell

## Commits

| Commit | Description |
|---|---|
| `a47d89d` | `feat(24-08): convert BottomPanel.vue to three-tab ARIA tablist shell` — Tasks 1+2 (combined, see Deviations) |
| `5f405f6` | `test(24-08): pin agent-ready-export-safety harness to export tab` |
| (this file) | `docs(24-08): add plan summary` |

## What shipped

`src/web/components/workbench/BottomPanel.vue` is now a self-contained three-tab `role="tablist"` shell:

- `TABS = [comments, summary, export]`, roving `tabindex` (0 on the active tab, -1 on the rest), `aria-selected`, circular `moveTab(delta)` on Left/Right (`(index + delta + TABS.length) % TABS.length`, automatic-activation — moving also selects and moves focus). `focusActiveTab()` exposed via `defineExpose`.
- `activeTab` is a pure prop (`PanelTab`, imported from `../../model/panel-state.js`) — the component owns no tab-selection state; `selectTab()`/`moveTab()` only `emit('update:activeTab', tab)`.
- Three `role="tabpanel"` hosts (`#panel-panel-comments/summary/export`), each `v-if`-gated on `activeTab` so the inactive two unmount entirely, mounting `CommentsTab`/`SummaryTab`/`ExportTab` with every prop/emit wired exactly per the plan's snippets (byte-for-byte, confirmed against the already-shipped child components' actual prop/emit surfaces before writing).
- The 135-line attached-completion block and its six supporting refs/computeds/the focus-move `watch` are deleted in full (content already lives in `ExportSection.vue`, Plan 24-04); the `review-notes-dialog__counts` badge section and its `openCount`/`resolvedCount` computeds are deleted (superseded by `CommentsTab`'s own grouped list). One minimal `attached = computed(() => props.attachedLifecycle !== undefined)` survives, used only to gate the Export tabpanel's content on `activeTab === 'export' && (exportSupported || attached)` — the stated union-gating resolution that preserves combined visibility for agent-attached-but-not-export-supported sessions.
- Conflict/failure inline notices are untouched, still between the header and the tabpanel block.
- Every pre-existing emit (`close`/`update:summaryBuffer`/`saveSummary`/`cancelSummary`/`cancelExport`/`export`/`reloadLatest`/`reviewUnsavedText`/`reviewInlineComposer`/`finishReview`/`reloadAttached`) is re-emitted unchanged from the appropriate child tab's own emit, plus the two new ones (`update:activeTab`, `reveal`).
- CSS: `.bottom-panel__label` removed; `.bottom-panel__tabs`/`.bottom-panel__tab`/`.bottom-panel__tab--selected` added, reusing `--font-size-label`/`--letter-spacing-label`/uppercase and the one `--interactive-accent` active-tab underline.

## Deviations from Plan

**[Rule 3 - Blocking issue] `activeTab`/`flatFileRows` made optional with defaults, not required**

- **Found during:** Task 1/2 verify (`npm run typecheck:web`)
- **Issue:** The plan's snippets declare `activeTab: PanelTab` and `flatFileRows: readonly VisibleFileTreeLeaf[]` as required props. `App.vue`'s existing `<BottomPanel>` call site (unmodified — wiring it is Plan 24-09's job per `files_modified`/the dependency chain) does not pass either, so `vue-tsc` failed with "missing properties: flatFileRows, activeTab" against `App.vue`, a file outside this plan's scope.
- **Fix:** Declared both props optional (`activeTab?: PanelTab`, `flatFileRows?: readonly VisibleFileTreeLeaf[]`) with `withDefaults` defaults `activeTab: 'comments'` (matching `panel-state.ts`'s own `ACTIVE_TAB_DEFAULT`) and `flatFileRows: () => []`. This is scoped entirely to `BottomPanel.vue`, touches no other file, and doesn't change the component's eventual contract once Plan 24-09 wires real values through — it only keeps the untouched `App.vue` call site typechecking in the interim.
- **Files modified:** `src/web/components/workbench/BottomPanel.vue`
- **Verification:** `npm run typecheck:web` — 0 errors (re-ran, confirmed clean)
- **Commit:** `a47d89d`

**[Rule 3 - Blocking issue] Fixed `tests/e2e/agent-ready-export-safety.spec.ts`'s direct-mount harness**

- **Found during:** Playwright spot-check of specs grep-identified as touching `BottomPanel.vue` (per the GATES instruction: run and fix any such spec other than the two pre-identified deferred ones)
- **Issue:** This spec `h(BottomPanel, {...})`-mounts the component directly with full control over its props (not a real-`App.vue` integration test) and asserts on the attached-completion content (`role="region", name: "Finish attached review"`) without ever specifying a tab. That content now lives inside the Export tabpanel, gated on `activeTab === 'export'`; with the new `activeTab` default of `'comments'` the region never rendered, and `attached lifecycle renders waiting, progress, completion, and safe recovery actions` failed at its first assertion.
- **Fix:** Added `activeTab: 'export'` to the harness's `h(BottomPanel, {...})` call (one line) so the pre-existing Finish-review assertions keep exercising the same UI they always did.
- **Files modified:** `tests/e2e/agent-ready-export-safety.spec.ts`
- **Verification:** `npx playwright test tests/e2e/agent-ready-export-safety.spec.ts` — 2/2 passed (both before-fix repro at 1/2 failed with the exact predicted locator-not-found error, and after-fix 2/2 pass, confirmed by direct runs)
- **Commit:** `5f405f6`

**Total deviations:** 2 auto-fixed (1 prop-default relaxation in `BottomPanel.vue`, 1 test-harness prop fix). **Impact:** Both are narrow, scoped exactly to keep this plan's own gates (`typecheck:web`, the one fixable spec) green without touching any file outside `files_modified` + harness test files, and without altering `BottomPanel.vue`'s eventual real contract.

## Combined-commit note

Tasks 1 and 2 were applied as a single `write` of the full file (the task boundary is a mid-file split — tablist header vs. tabpanel body/CSS — that doesn't correspond to independently-committable hunks once written together), so they land in one `feat(24-08)` commit rather than two. Both tasks' own `<verify>` commands were run and passed before commit (see Verification below).

## Verification

- `npm run typecheck:web` — **0 errors** (`vue-tsc --noEmit --project tsconfig.web.json`).
- `npm run verify:semantic-css` — **passed**: `Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.`
- `npx vitest run --no-file-parallelism tests/unit` — **478/478 tests passed** (46/46 files).
- Re-verified every `must_haves.truths` claim directly against the committed file (grep + direct read): exactly one `role="tablist"`/three `role="tab"` (one template source occurrence inside `v-for`, renders 3)/three `role="tabpanel"`; `activeTab` prop drives `aria-selected`/roving `tabindex`/`:hidden`; Left/Right circular `moveTab`; `update:activeTab` emitted on click/arrow move; `focusActiveTab()` exposed; attached-completion block and `review-notes-dialog__counts` section fully absent (grep for `attached-completion`, `openCount`, `resolvedCount`, `completionAction/Success/Failure`, `finishAttachedReview`, `attachedHasUnsavedText`, `attachedBlockedBy*`, `attachedNoFeedback`, `SummarySection`, `ExportSection`, `ReviewStateBadge`, `PathText` — zero matches); all 11 pre-existing emits present verbatim plus the 2 new ones; `.bottom-panel__label` absent, `.bottom-panel__tabs`/`.bottom-panel__tab`/`.bottom-panel__tab--selected` present with the exact specified tokens.

### Playwright: expected-breaking specs (per this plan's own `<verification>` text — App.vue's `activeTab`/`flatFileRows` wiring is Plan 24-09's job, so BottomPanel cannot yet be exercised end to end through the real app)

Both pre-identified files, run and confirmed breaking exactly as predicted, **not fixed here, deferred to Plan 24-10**:
- `tests/e2e/review-notes-dialog.spec.ts` — 1/1 failed (harness asserts on Summary/tablist content assuming the old always-visible layout).
- `tests/integration/export-receipt-ui.spec.ts` — 6/6 failed (shared `openReview()` helper asserts `getByRole('region', 'Review').getByRole('button', 'Export review')` visible immediately after opening the panel — now hidden behind the Export tab).

**Additional real-`App.vue` e2e/integration breakage discovered during gate verification** (same root cause — `App.vue`'s `<BottomPanel>` call site doesn't pass `activeTab` yet, so the panel always opens on the default `'comments'` tab, hiding Summary/Export tabpanel content these specs assert on without first clicking the new tab; **not fixable without editing `App.vue`, which is out of this plan's `files_modified` scope and is explicitly Plan 24-09's job** — flagged to the coordinator via `agent://ExecPhase24`, not fixed here, same deferred disposition as the two pre-identified files):
- `tests/e2e/workbench-shell-smoke.spec.ts` — 2/8 failed (`standalone: ... Export emphasized` expects the Export tab's `Export review` button visible; `agent-attached: ...` expects the `Finish attached review` heading visible). 6/8 passed.
- `tests/integration/selector-drift-ui.spec.ts` — 1/4 failed (`selector drift uses the fixed endpoint...` expects the Summary tab's disclosure/Edit sub-tab immediately). 3/4 passed (the other two don't touch Summary/Export content).
- `tests/e2e/standalone-review.spec.ts` — 1/7 failed (packaged export flow expects `Export review` visible immediately). 6/7 passed.
- `tests/e2e/complete-review-draft.spec.ts` — confirmed failing with the identical `Write summary` button not-found signature on its first test; the remaining 7 tests were not run to completion (each drives a freshly packaged/spawned real app instance, ~90s+ per test) once the pattern was confirmed identical to the other files above — all 8 call `openReviewNotes()` then interact with Summary-tab content per direct source read, so the same disposition applies to the file as a whole.

**Confirmed still passing** (don't touch Summary/Export tabpanel content, or only make negative/count-0 assertions unaffected by which tab is active):
- `tests/e2e/agent-ready-export-safety.spec.ts` — 2/2 passed (fixed, see Deviations).
- `tests/integration/anchored-workspace.spec.ts` — 12/12 passed.
- `tests/e2e/uncommitted-review.spec.ts` — 5/5 passed.

**Not executed** — custody-gated tier (`playwright.runtime-artifact.config.ts`, requires a full packaged-binary + custody-chain build; a separate, heavier CI tier out of scope for this plan's gate, consistent with the instruction not to run the full Playwright suite). Confirmed via direct source reading to follow the identical `openReviewNotes()` → immediate Summary/Export/Finish-review interaction pattern, so expected to break the same way once `App.vue` is wired without `activeTab`:
- `tests/e2e/marketplace-review.spec.ts`
- `tests/e2e/public-support-states.spec.ts`
- `tests/e2e/agent-ready-export.spec.ts`
- `tests/e2e/package-assets.spec.ts` — not grep-matched for any review-panel/BottomPanel content; likely unaffected, not confirmed by execution.

None of this additional breakage stems from a defect in `BottomPanel.vue` itself — every must_have truth re-verifies cleanly in isolation (see above), and the harness-style tests I do control (`agent-ready-export-safety.spec.ts`) pass once given the new required tab context. The breakage is strictly the documented, plan-anticipated consequence of `App.vue` not yet wiring `activeTab`/`flatFileRows`/`update:activeTab`/`reveal` — Plan 24-09's scope.

## Self-Check: PASSED
