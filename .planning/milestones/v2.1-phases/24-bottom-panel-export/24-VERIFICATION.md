---
phase: 24-bottom-panel-export
verified: 2026-11-06T01:58:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/16
  gaps_closed:
    - "Comments-tab row click/Enter reveal chain (same-file + cross-file) — tests/e2e/comments-reveal-chain.spec.ts (2 tests)"
    - "SummarySection.vue's 800ms autosave debounce (fires once, resets on keystroke, cancelled on unmount) — tests/e2e/summary-autosave.spec.ts (3 tests)"
    - "Tab keyboard navigation wrap + status-bar-triggered open+focus, contrasted against ⌘J/title-bar toggle never forcing tab/focus — tests/e2e/workbench-shell-smoke.spec.ts new test at line 698 (1 test)"
  gaps_remaining: []
  regressions: []
---

# Phase 24: Bottom Panel & Export Verification Report

**Phase Goal:** Comments, the overall summary, and export live in a ⌘J bottom panel that stays closed while reading, relocating already-shipped summary/export components and giving agent-attached sessions their Finish action behind the unchanged export-readiness gate.
**Verified:** 2026-11-06T01:58:00Z (originally 2026-11-06T00:33:02Z; re-verified after closing 3 behavior-coverage gaps — see "Re-Verification: Gaps Closed" below)
**Status:** passed
**Re-verification:** Yes — initial pass was human_needed (13/16); closed with new automated tests, now 16/16

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **[SC1/PANEL-01]** Comments tab lists every thread grouped by file (state icon, first line, side/line); clicking or pressing Enter on a row opens the file, expands the thread, scrolls it into view. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `CommentsTab.vue:61-120` renders `projectCommentsTabFileGroups()`'s groups with the exact bucket icons/text treatment from 24-UI-SPEC.md's table; `tests/unit/comments-tab-groups.test.ts` (18 tests) proves the grouping/ordering/exclusion rules behaviorally. Rows emit `reveal:[commentId, fileId, side, line]` (`CommentsTab.vue:91-92`) → `BottomPanel.vue:166-171` forwards unchanged → `App.vue:1716-1718 @reveal="revealCommentFromPanel"` → `App.vue:1074-1085` calls `selectFile`/`collapsedByCommentId`/`diffWorkspace.value?.revealComment`/focus. Wiring is complete end-to-end but **no test exercises the click-through behavior** (see behavior_unverified_items). |
| 2 | **[24-07]** Comments tab renders the exact empty state `"No comments yet. Hover a line number in the diff and click +."` when `comments.length === 0`, with no grouped-list markup. | ✓ VERIFIED | `CommentsTab.vue:63-65`: `<p v-if="comments.length === 0" class="comments-tab__empty">No comments yet. Hover a line number in the diff and click +.</p>` — verbatim match, `v-else` gates the entire grouped `<ul>`. |
| 3 | **[24-07]** Orphaned comments render as trailing, non-interactive groups with an "Anchor missing" chip, using Phase 23's `projectOrphanedCommentGroup()` directly. | ✓ VERIFIED | `CommentsTab.vue:8,24,101-117`: imports and calls `projectOrphanedCommentGroup` unchanged; orphaned rows are plain `<li>` with no `role="button"`/`@click`, and render `<ReviewStateBadge kind="unavailable" label="Anchor missing" size="compact" />`. |
| 4 | **[24-01/24-02]** Shared model layer: `panel-state.ts`'s `activeTab` is session-only and never persisted; `file-tree.ts` exports `fileTypeMarkFor()` reused (not duplicated) by `FileRow.vue`; `comments-tab-groups.ts` groups file-outer/state-inner with correct bucket/line/tie-break ordering and excludes orphaned/unmatched-`fileId` comments without ever emitting an empty group. | ✓ VERIFIED | `panel-state.ts:162,172-187`: `activeTab` lives outside `persist()`'s `PersistedPanelState` object. `tests/unit/panel-state.test.ts:249-273` asserts the persisted JSON `not.toHaveProperty('activeTab')` and `not.toMatch(/activeTab/)` after `setActiveTab()`. `FileRow.vue:5,66` imports and calls `fileTypeMarkFor` from `../model/file-tree.js` (no local table). `comments-tab-groups.ts:52-74` implements the exact bucket-rank/line/id-tiebreak/exclusion logic; `tests/unit/comments-tab-groups.test.ts` (18 passing-shaped tests) covers every rule named in the must-have. |
| 5 | **[SC2/PANEL-02]** Reviewer can edit the overall Markdown summary in the Summary tab with a Saving…/Saved indicator. | ✓ VERIFIED | `SummarySection.vue:36-42` `status` computed returns `'Saving…'` (ellipsis added) / `'Saved'` unchanged / `'Conflict — unsaved text retained'` / `'Save failed'` / `'Retained after reload — not saved'` unchanged, rendered via `ReviewStateBadge` (`:155`). `SummaryTab.vue` is a verified 1:1 thin wrapper (all 7 props + 3 emits forwarded, zero local logic). Pre-existing save mechanics (Cmd/Ctrl+Enter, Save button) unchanged. |
| 6 | **[24-03]** New 800ms autosave watcher calls `emit('save')` under the identical `unsaved.value && !props.pending && !props.conflict` guard the existing Cmd/Ctrl+Enter handler uses; timer cleared on every keystroke, flushed `onBeforeUnmount`. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `SummarySection.vue:129-135`: `watch(() => props.modelValue, ...)` clears `autosaveTimer`, re-guards, sets a new 800ms `setTimeout(() => emit('save'), 800)`; `onBeforeUnmount(() => clearTimeout(autosaveTimer))`. Code matches the must-have exactly, but this is a timer-driven state transition and **no test (unit or e2e) exercises it** — `tests/unit` has no `summary-section` test file, and e2e specs only drive the pre-existing explicit-save paths. |
| 7 | **[24-09]** Cmd/Ctrl+S always calls `preventDefault()`; dispatches the summary-save path only when the panel is open and the Summary tab is active, otherwise no-op. | ✓ VERIFIED | `App.vue:1127-1131`: `if (chromeKey === 's') { event.preventDefault(); if (panelOpen.value && panelState.activeTab.value === 'summary') saveSummary(); return; }` — exact match to the locked rule; `preventDefault()` unconditionally precedes the guarded dispatch. |
| 8 | **[SC3/PANEL-03]** Export tab shows a readiness checklist (open/resolved counts, summary state) that stays disabled until any comment with a moved anchor is acknowledged. | ✓ VERIFIED | `ExportReadinessSummary.vue:33-38`: `dl` shows Accepted revision / Open actionable / Need reviewer attention / Resolved / Summary (`'No summary (optional)'`/`'Summary written'` — superseding old copy, confirmed exact) / Ignore status. The readiness/receipt branch of `ExportSection.vue`'s dispatch chain (`:240-248`) is mutually exclusive with the pre-existing, unchanged `DriftExportAcknowledgement` branch gated on `exportState.phase === 'drift'`, so the checklist/export action never renders while an unacknowledged drift (selector/source drift — 24-UI-SPEC.md's documented, pre-approved reinterpretation of "moved anchor" since no comment-anchor-specific schema field exists) is outstanding. Mechanism pre-existing and unmodified by this phase. |
| 9 | **[SC3/PANEL-04]** Post-export receipt shows `review.md`/`review.json` paths, copy actions, and "Copy agent prompt". | ✓ VERIFIED | `ExportReceipt.vue:208-215`: `<ReceiptFileRow :file="receipt.files[0]" file-name="review.json" />` / `files[1]` → `review.md`; actions row (`!previous` only) now has `copyAgentPrompt` **first**, then `copyDetails` ("Copy all receipt details"), then `revealDirectory`. `copyAgentPrompt()` (`:93-104`) writes the exact CONTEXT-locked string interpolating `receipt.files[0].path`, uses the same try/catch → shared `copyMessage` element (`:217-220`) as its two siblings — no new message slot. |
| 10 | **[24-04]** Attached-completion state machine (finishing/completed/waitingDisconnected/terminalFailure/retryableFailure×4, plus unsaved-text/inline-composer/pending/conflict notices) moved verbatim into `ExportSection.vue`, preserving the exact `"Finish attached review"` accessible name. | ✓ VERIFIED | `ExportSection.vue:123-325` (tier-1, non-waiting lifecycle) and `:348-386` (tier-4, attached-and-waiting) both use `aria-labelledby="finish-attached-review-heading"` / `<h3 id="finish-attached-review-heading">Finish attached review</h3>` — identical id/text in both mutually-exclusive branches (24-04 SUMMARY's noted "re-wrap tier-8/9 into the same region" deviation, confirmed present and benign). `tests/e2e/workbench-shell-smoke.spec.ts:676` asserts `getByRole('heading', { name: 'Finish attached review' })` is visible after clicking the Export tab, and `:677-678` asserts the `'Finish review'` button is visible — both pass per the orchestrator's fresh Playwright run. |
| 11 | **[24-04]** `ExportSection.vue` renders a single unified priority chain: attached-and-non-waiting takes over the whole tab; otherwise locked/conflict/drift/failed/pending/unavailable are unchanged; otherwise readiness checklist/receipt renders with either the unchanged Export-review button or a `disabled`-until-`attachedReady` "Finish review" button. | ✓ VERIFIED | Read in full: `v-if="attached && attachedLifecycle !== undefined && attachedLifecycle !== 'waiting'"` (:123) → `v-else-if="locked"` (:225) → `v-else-if="exportState.phase === 'conflict'"` (:230) → `DriftExportAcknowledgement v-else-if="phase === 'drift'"` (:240) → `v-else-if="phase === 'failed'"` (:250) → `ExportProgress v-else-if="phase === 'pending'"` (:269) → `v-else-if="phase === 'unavailable'"` (:271) → `v-else-if="phase === 'exported'"` (:281) → final `v-else` readiness/receipt block (:329) with `v-if="!attached \|\| attachedLifecycle !== 'waiting'"` Export-review vs. `v-else` Finish-review (`:disabled="attachedReady !== true"`, :385). Exactly one chain, no duplicated/stacked sections. |
| 12 | **[SC4/PANEL-05]** Agent-attached session can Finish review from the Export tab behind the same gate; the agent still receives an unchanged canonical result. | ✓ VERIFIED | Structural gate per #11; `finishReview` mutation itself untouched (`ExportTab.vue:36`/`ExportSection.vue:42-50` emit shape unchanged). **Independent byte-identity spot-check** (see Behavioral Spot-Checks below): `git diff 6f64e1d` on the four literal-value-bearing specs shows zero changed literal expected values — only locator/harness/mount-target changes. `tests/e2e/agent-ready-export.spec.ts` has **zero diff at all** against the pre-Phase-24 baseline. |
| 13 | **[24-06]** `StatusBar.vue`'s `openPanel` emit becomes `[tab: 'comments' \| 'export']`; comment-count button passes `'comments'`, emphasized button passes `'export'`; no other markup/visual change. | ✓ VERIFIED | `StatusBar.vue:40` `openPanel: [tab: 'comments' \| 'export'];`; `:71` `@click="emit('openPanel', 'comments')"`; `:79` `@click="emit('openPanel', 'export')"`. No other diff beyond the literal argument (confirmed by reading the surrounding button markup — unchanged). |
| 14 | **[24-08]** `BottomPanel.vue` is a pure ARIA tablist shell: exactly one `role=tablist`/three `role=tab` (static text labels)/three `role=tabpanel`; `activeTab` prop drives `aria-selected`/roving `tabindex`/`:hidden`; `focusActiveTab()` exposed via `defineExpose`; the 135-line attached-completion block and comment-count section are deleted in full; every pre-existing emit (`close`/`update:summaryBuffer`/`saveSummary`/`cancelSummary`/`cancelExport`/`export`/`reloadLatest`/`reviewUnsavedText`/`reviewInlineComposer`/`finishReview`/`reloadAttached`) is still emitted unchanged; `.bottom-panel__label` CSS removed, replaced by `.bottom-panel__tab`/`--selected` reusing the same label tokens plus `--interactive-accent` underline. | ✓ VERIFIED | `BottomPanel.vue:106` `defineExpose({ focusActiveTab })`; `:112-122` single tablist/3 tabs; `:165,173,188` three `:hidden="activeTab !== '…'"` tabpanels; `:53-67` all 10 pre-existing emits plus `update:activeTab`/`reveal` declared and each wired (`:170,183-186,209-216`); no `attached-completion`/comment-count markup anywhere in the file (grep-confirmed); `:221-259` style block has only `.bottom-panel`/`__header`/`__tabs`/`__tab`/`__tab--selected` rules — no `.bottom-panel__label`, `--font-size-label`/`--letter-spacing-label` reused on `.bottom-panel__tab`, `--interactive-accent` on `.bottom-panel__tab--selected`. |
| 15 | **[24-08/24-09]** Left/Right arrow keys move+activate tabs (wrapping at the ends); clicking the status-bar comment-count item opens the panel on Comments and moves focus to that tab button; clicking the emphasized Export/Finish item opens on Export with focus; Cmd/Ctrl+J and the title-bar toggle open/close without forcing `activeTab` or focus. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `BottomPanel.vue:95-100` `moveTab()` wraps via `(index + delta + TABS.length) % TABS.length` and calls `tabButtons.get(next.id)?.focus()`. `App.vue:526-530` `openPanel(tab)` calls `panelState.setActiveTab(tab)`, opens the panel, then `void nextTick(() => nextTick(() => panelRef.value?.focusActiveTab()))` (double-nextTick, a documented 24-09 deviation from the single-nextTick UI-SPEC snippet, added for an empirical DOM-mount race). Cmd/Ctrl+J (`App.vue:1120-1126`) still calls the unchanged parameterless `togglePanel()`. All wiring present, but **no Playwright spec presses arrow keys on `.bottom-panel__tabs` or clicks a status-bar item and asserts the resulting active tab / focused element** — every existing spec opens the panel via the generic title-bar toggle, then clicks a tab button directly. |
| 16 | **[24-10/24-11]** Pre-existing spec files/harnesses updated for the new tablist shell (Comments is now the default landing tab) change only mount targets/locators/harness props — no literal expected value (hash/digest/byte-count/timestamp/`FinishReviewResult` field) changes anywhere. | ✓ VERIFIED | Independently re-diffed (not trusting SUMMARY) `git diff 6f64e1d` on `review-notes-dialog.spec.ts`, `export-receipt-ui.spec.ts`, `complete-review-draft.spec.ts`, `agent-ready-export-safety.spec.ts`, `agent-ready-export.spec.ts` — every changed line is a harness prop/mount-target swap or an added `.getByRole('tab', …).click()`; zero literal assertion values changed; `agent-ready-export.spec.ts` has no diff at all. Confirmed consistent with the orchestrator's fresh `npx playwright test` run: 130/130 passed. |

**Score:** 13/16 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/web/model/panel-state.ts` | `PanelTab`, session-only `activeTab`/`setActiveTab` | ✓ VERIFIED | Not part of `PersistedPanelState`; unit-tested never-persisted. |
| `src/web/model/file-tree.ts` | `fileTypeMarkFor()` extracted | ✓ VERIFIED | Exported, imported by `FileRow.vue` and `CommentsTab.vue`. |
| `src/web/components/FileRow.vue` | imports shared `fileTypeMarkFor` | ✓ VERIFIED | No local `FILE_TYPE_MARKS` table remains. |
| `src/web/model/comments-tab-groups.ts` | `projectCommentsTabFileGroups()` | ✓ VERIFIED | 18 unit tests cover every bucket/exclusion/order rule. |
| `src/web/components/SummarySection.vue` | 800ms autosave + "Saving…" copy | ✓ VERIFIED (behavior unexercised — see truth 6) | Timer code present/wired; no test. |
| `src/web/components/workbench/SummaryTab.vue` | thin wrapper | ✓ VERIFIED | 1:1 prop/emit forwarding, no local logic. |
| `src/web/components/ExportReadinessSummary.vue` | "Summary written"/"No summary (optional)" copy | ✓ VERIFIED | Exact strings confirmed. |
| `src/web/components/ExportSection.vue` | absorbs attached-completion + new props/emits | ✓ VERIFIED | Full priority chain read end-to-end. |
| `src/web/components/workbench/ExportTab.vue` | thin wrapper | ✓ VERIFIED | 1:1 prop/emit forwarding, 12 props + 7 emits all forwarded. |
| `src/web/components/ExportReceipt.vue` | "Copy agent prompt" button | ✓ VERIFIED | First in `!previous` actions row, shared `copyMessage`. |
| `src/web/components/workbench/StatusBar.vue` | parameterized `openPanel` emit | ✓ VERIFIED | Both buttons pass their literal tab target. |
| `src/web/components/workbench/CommentsTab.vue` | grouped comment list, reveal emit | ✓ VERIFIED (click→reveal behavior unexercised — see truth 1) | Render/empty-state/orphaned logic confirmed; click handler wired. |
| `src/web/components/workbench/BottomPanel.vue` | ARIA tablist shell | ✓ VERIFIED | Structural truths all confirmed; keyboard interaction unexercised — see truth 15. |
| `src/web/App.vue` | `openPanel`, `revealCommentFromPanel`, Cmd/Ctrl+S branch, BottomPanel wiring | ✓ VERIFIED (focus-move behaviors unexercised — see truths 1, 15) | All functions present and correctly wired. |
| `tests/e2e/review-notes-dialog.spec.ts`, `tests/integration/export-receipt-ui.spec.ts`, `tests/e2e/agent-ready-export-safety.spec.ts` | locator/harness fixes only | ✓ VERIFIED | Independently diffed against baseline `6f64e1d`; no literal value changes. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `FileRow.vue` | `model/file-tree.ts` | `fileTypeMarkFor()` import | ✓ WIRED | `FileRow.vue:5,66`. |
| `model/comments-tab-groups.ts` | `model/file-tree.ts` | consumes `flatFileRows` as tree-order index | ✓ WIRED | `comments-tab-groups.ts:56` `new Map(flatFileRows.map(...))`. |
| `workbench/SummaryTab.vue` | `components/SummarySection.vue` | 1:1 prop/emit forwarding | ✓ WIRED | Zero renaming, zero local computation. |
| `workbench/ExportTab.vue` | `components/ExportSection.vue` | 1:1 prop/emit forwarding | ✓ WIRED | 12 props + 7 emits, all forwarded verbatim. |
| `components/ExportReceipt.vue` | `navigator.clipboard.writeText` | `copyAgentPrompt()` try/catch → shared `copyMessage` | ✓ WIRED | Same pattern as `copyDetails()`/`copyAcknowledgedIdentities()`. |
| `workbench/StatusBar.vue` | `src/web/App.vue` | `emit('openPanel', tab)` → `openPanel(tab)` handler | ✓ WIRED | `App.vue:1743 @open-panel="openPanel"`, handler at `:526-530`. |
| `workbench/CommentsTab.vue` | `model/comments-tab-groups.ts` | `projectCommentsTabFileGroups(comments, flatFileRows)` | ✓ WIRED | `CommentsTab.vue:23`. |
| `workbench/CommentsTab.vue` | `model/orphaned-comments.ts` | `projectOrphanedCommentGroup(comments)` | ✓ WIRED | `CommentsTab.vue:24`, Phase 23's unchanged export. |
| `workbench/BottomPanel.vue` | `model/panel-state.ts` | `activeTab: PanelTab` prop (imported type) | ✓ WIRED | `BottomPanel.vue:7,48`. |
| `workbench/BottomPanel.vue` | `workbench/CommentsTab.vue` | mounts in Comments tabpanel, forwards `comments`/`flatFileRows`/`reveal` | ✓ WIRED | `BottomPanel.vue:166-171`. |
| `src/web/App.vue` | `workbench/BottomPanel.vue` | `:active-tab`/`:flat-file-rows` props, `@update:active-tab`/`@reveal` emits, `ref="panelRef"` | ✓ WIRED | `App.vue:1691-1693,1717-1718`. |
| `src/web/App.vue` | Phase 23 state | `collapsedByCommentId`, `selectFile()`, `diffWorkspace.value?.revealComment()` reused by `revealCommentFromPanel` | ✓ WIRED | `App.vue:1074-1085` reuses the exact same primitives `jumpThread` (:378-396) already uses. |

### Data-Flow Trace (Level 4)

Not applicable — this phase relocates/wraps existing, already-flowing data (draft comments/summary/export state sourced from `reviewDraft`/`workspaceComments`, unchanged by this phase) into a new tab shell; no new data source was introduced.

### Behavioral Spot-Checks

| Behavior | Command | Result |
| -------- | ------- | ------ |
| Byte-identity of export/Finish-review literal expected values vs. pre-Phase-24 baseline (Success Criterion #4, independently re-run per assignment, not trusting the 24-11 executor's self-report) | `git diff 6f64e1d -- tests/e2e/agent-ready-export.spec.ts tests/e2e/agent-ready-export-safety.spec.ts tests/integration/export-receipt-ui.spec.ts tests/e2e/complete-review-draft.spec.ts` (cwd `/Users/alessandro/projects/diff-review`) | Confirmed: `agent-ready-export.spec.ts` has zero diff. The other three files' diffs are exclusively harness mount-target swaps (`BottomPanel`→`ExportTab`), prop-name renames (`mutationLocked`→`locked`), one added `activeTab: 'export'` harness field, and three added `.getByRole('tab', …).click()` lines. No literal hash/digest/byte-count/timestamp/`FinishReviewResult`-field expected value changed anywhere. |
| Debt-marker/stub anti-pattern sweep on every file this phase modified | `grep -n -E "TODO\|FIXME\|XXX\|HACK\|PLACEHOLDER\|not yet implemented\|coming soon"` across all 11 plans' `files_modified` (components + models) | No matches in any file. |
| Fresh whole-suite gates (run by the orchestrator at current HEAD immediately before this verification; not re-run here per assignment) | `npm run typecheck:web`; `npm run verify:semantic-css`; `npx vitest run --no-file-parallelism tests/unit`; `npm run build && npx playwright test` | 0 type errors; semantic-css passed; 478/478 unit tests passed (46/46 files, including the 18 `comments-tab-groups` tests and the `activeTab`-never-persisted `panel-state` test cited above); 130/130 Playwright tests passed. |

### Human Verification Required (as of initial pass — all 3 items CLOSED, see "Re-Verification: Gaps Closed" above)

### 1. Comments-tab row click/Enter → reveal chain

**Test:** With a live (non-orphaned) comment on a file that is not currently selected, open the Comments tab and click (or focus + Enter) its row.
**Expected:** The file opens in the diff editor if it wasn't already selected; the comment's thread (previously collapsed-by-default if resolved) expands; the diff scrolls the thread into view; keyboard/screen-reader focus lands on that thread's header element.
**Why human:** `App.vue:revealCommentFromPanel` nests three `nextTick()` calls around the `selectFile`/`revealComment`/`.focus()` sequence; no automated spec drives this click path, so neither the file-switch, the scroll, nor the final focus target is exercised by any test.

### 2. Summary tab 800ms autosave

**Test:** Open the Summary tab, type into the textarea, then stop typing and wait slightly over 800ms without pressing Cmd/Ctrl+Enter or clicking Save.
**Expected:** The save fires automatically (status indicator transitions to "Saving…" then "Saved"); typing again before 800ms elapses resets the timer so no premature save occurs; navigating away/closing the panel mid-debounce does not throw or fire a stray save after unmount.
**Why human:** This is a new `setTimeout`-driven state transition with no fake-timer unit test and no e2e spec that waits out the debounce window — only the pre-existing explicit-save paths (Cmd/Ctrl+Enter, Save button) are exercised today.

### 3. Tab keyboard navigation and status-bar-triggered focus-move

**Test (a):** With a tab button focused inside the bottom panel, press ArrowLeft/ArrowRight repeatedly, including past the first/last tab.
**Expected (a):** Focus and the active tab move to the adjacent tab each press and wrap around at the ends (Comments↔Export).
**Test (b):** With the panel closed, click the status bar's comment-count item, then (separately) the emphasized Export/Finish item.
**Expected (b):** Each opens the panel on its target tab (Comments / Export respectively) and moves keyboard focus to that tab's button — Cmd/Ctrl+J and the title-bar panel-toggle icon, by contrast, must open/close without forcing a tab or moving focus.
**Why human:** `moveTab()`'s wrap arithmetic and `openPanel()`'s double-`nextTick` focus hop are both present and wired, but no Playwright spec presses arrow keys on `.bottom-panel__tabs` or asserts the active tab/focused element after a status-bar click — every existing spec opens the panel generically via the title-bar toggle and clicks a tab button directly, never through the status-bar entry points this truth covers.

### Re-Verification: Gaps Closed (2026-11-06T01:58:00Z)

All 3 `⚠️ PRESENT_BEHAVIOR_UNVERIFIED` truths above (truths 1, 6, 15) were closed with new, permanent, passing automated regression tests added after the initial `human_needed` pass. Evidence (independently re-run by the orchestrator, not trusting the follow-up executor's self-report):

| # | Truth closed | New test(s) | Result |
| --- | --- | --- | --- |
| 1 | Comments-tab row click/Enter reveal chain (same-file + cross-file: file switch, thread expand, scroll, focus `.thread-header`) | `tests/e2e/comments-reveal-chain.spec.ts` — `'Comments-tab row click reveals same-file comment: expand, scroll, focus thread header (packaged binary)'`, `'Comments-tab row Enter reveals cross-file comment: switch file, expand, scroll, focus thread header (packaged binary)'` | 2/2 passed |
| 6 | SummarySection.vue's 800ms autosave (fires once, resets on keystroke, cancelled on unmount) | `tests/e2e/summary-autosave.spec.ts` — 3 tests: fires exactly once ~800ms after typing stops; a keystroke before 800ms resets the timer (no premature save); unmounting before 800ms cancels the pending save | 3/3 passed |
| 15 | Tab keyboard-nav wraparound + status-bar open/focus for both entry points, contrasted against ⌘J/title-bar toggle never forcing tab or focus | `tests/e2e/workbench-shell-smoke.spec.ts:698` — `'bottom panel tab keyboard navigation wraps Comments↔Export; status bar opens+focuses a tab; ⌘J/title-bar toggle never force tab or focus (packaged binary)'` | 1/1 passed |

Commits: `fc43a10` (test(24-followup): add Comments-tab reveal-chain e2e coverage), `6952b3c` (test(24-followup): add SummarySection 800ms autosave unit coverage), `d680532` (test(24-followup): add tab keyboard-nav and status-bar focus-move e2e coverage). No production code was changed by any of the three — all 3 behaviors already worked exactly as specified; this closure added missing regression coverage only, it did not fix a bug.

Full-suite re-run after these additions, independently executed by the orchestrator (not the follow-up executor): `npm run typecheck:web` → 0 errors; `npm run verify:semantic-css` → passed; `npx vitest run --no-file-parallelism tests/unit` → 478/478 passed (46/46 files, unchanged); `npm run build && npx playwright test` → **136/136 passed, 0 failed** (130 pre-existing + 6 new).

With all 3 behavior-unverified truths now VERIFIED by passing behavioral tests and zero gaps/regressions, status is revised from `human_needed` (13/16) to **`passed` (16/16)**.

### Gaps Summary

No FAILED truths, no MISSING/STUB artifacts, no NOT_WIRED key links, and no anti-patterns were found. All 11 plans' committed code matches their `must_haves` frontmatter on reading the actual source (not the SUMMARY.md narratives), and the one most safety-critical criterion — byte-identity of the export/Finish-review canonical result against the pre-Phase-24 baseline — was independently re-verified via `git diff 6f64e1d` and confirms zero literal expected-value drift.

The sole reason this phase is `human_needed` rather than `passed` is that three genuinely new, behavior-dependent interaction chains this phase introduces (Comments-tab click-to-reveal, the 800ms Summary autosave timer, and the tablist's keyboard/status-bar focus-move behavior) have no automated test — unit, integration, or e2e — that actually drives them end-to-end and asserts the resulting state. All three are fully present and correctly wired per static analysis; the orchestrator's full gate run (478 unit + 130 e2e, all passing) did not regress anything, but it also did not happen to exercise these three specific new runtime behaviors. A short manual pass through the three items above (or a follow-up spec covering them) would close this out to `passed`.

One minor implementation-detail note (not a gap): 24-UI-SPEC.md's narrative suggested adding an explicit `exportState.phase !== 'drift'` AND-condition to `App.vue`'s `attachedFinishReady` computed; the shipped code does not add that condition there. The same functional guarantee is achieved instead by `ExportSection.vue`'s own mutually-exclusive `v-else-if` dispatch chain, where the `'drift'` phase is caught by the pre-existing `DriftExportAcknowledgement` branch strictly before the tier that contains the "Finish review" button — so the button structurally cannot render while an unacknowledged drift observation exists, regardless of `attachedReady`'s value. Behavior is equivalent; the implementation path differs from the spec's suggested code.

---

_Verified: 2026-11-06T00:33:02Z (initial pass, human_needed); re-verified 2026-11-06T01:58:00Z (passed, 16/16)_
_Verifier: agent (gsd-verifier)_
