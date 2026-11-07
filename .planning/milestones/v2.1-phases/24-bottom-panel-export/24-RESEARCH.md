# Phase 24: Bottom Panel & Export - Research

**Researched:** 2026-11-05
**Domain:** Vue 3 SFC refactor — ARIA tablist UI shell, hand-rolled debounced autosave, clipboard write, cross-component focus move. No backend/schema change.
**Confidence:** HIGH

## Summary

Phase 24 converts the Phase-20 interim single-section bottom panel into a three-tab (`Comments`/`Summary`/`Export`) shell. Every mechanism the UI-SPEC prescribes — the `role="tablist"`/`tab`/`tabpanel` pattern, the `setTimeout`-based timer-with-cleanup idiom, and outbound-only `navigator.clipboard.writeText` — already has at least one working precedent in this exact codebase `[VERIFIED]`, so this phase is pure composition of established patterns, not new technique. No npm package is needed anywhere in this phase `[VERIFIED: package.json has zero debounce/clipboard/aria libraries and the project hand-rolls all three today]`.

The one real risk in this phase is not technical difficulty but **cross-phase sequencing**: Phase 24 depends on exact interfaces that Phase 22 and Phase 23 will produce, but neither has executed yet, and the two upstream plans already disagree with the Phase 24 UI-SPEC on one load-bearing detail — `StatusBar.vue`'s `openPanel` emit signature (see Pitfall 2). The planner must treat Phase 22's and Phase 23's plan documents as the current best-known target shape, not as already-shipped code, and must add an explicit reconciliation/verification task rather than assuming those phases will land exactly as their own plans describe.

**Primary recommendation:** Build the tab shell and three new tab components exactly per the UI-SPEC's pseudocode (it is implementation-ready), reuse every existing timer-cleanup/clipboard/tablist idiom verbatim rather than introducing a second convention, and make the StatusBar emit-signature reconciliation and the `openReview()`-style test-harness updates (which assume the old single-section panel) explicit, verified tasks rather than assumed side effects.

## User Constraints

> Copied verbatim from `24-CONTEXT.md`.

### Phase Boundary
Split Phase 20's interim single "Review" panel into Comments / Summary / Export tabs: a grouped, click-to-reveal comment list (builds on Phase 23 threads), an autosaving summary editor, and an Export tab with readiness checklist, stale/orphaned acknowledgement gate, progress, receipt with copy actions and "Copy agent prompt", plus agent-attached Finish review behind the same gate. Requirements: PANEL-01..05.

Not in this phase: viewed tracking (deferred), replies (dropped), any change to export bytes, draft schema, or the attached completion contract.

### Implementation Decisions (locked)

**Design source**
- `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` § Bottom panel and sketch `004-comment-threads` variant **A**.

**Tabs & Summary**
- Summary autosaves the draft after 800ms of no typing with a "Saving… / Saved" indicator; ⌘S / Ctrl+S saves immediately. The existing summary mutation and its conflict/stale-draft handling stay authoritative (no client-synthesized state).
- Opening the panel shows the last-used tab this session; the status-bar comment count opens Comments; the status-bar Export/Finish item opens Export.
- Comments tab groups by file in tree order (Phase 21 order); inside a file: open, stale, then resolved; orphaned comments listed under their file with the "Anchor missing" chip. Row click / Enter opens the file, expands the thread, scrolls it into view, and moves focus to the thread header.
- `role="tablist"` / `tab` / `tabpanel`; arrow keys move and activate tabs; ⌘J / Ctrl+J toggles the panel; when opened from a status-bar item, focus moves into the target tab panel.

**Export & receipt**
- "Copy agent prompt" copies: "Apply the review in `.loopnote/exports/<timestamp>/review.json` (human-readable: `review.md`). Address every open comment; leave resolved ones as context." — repo-relative paths, clipboard only, nothing sent.
- Export again is allowed; each export writes a new timestamped directory (current behaviour); the receipt shows the latest.
- In agent-attached sessions "Finish review" replaces "Export review" as the Export tab's primary action behind the same checklist and drift acknowledgement; existing finishing / completed / error / reload states move verbatim from the interim panel; delivered canonical result unchanged.
- Readiness checklist: open/resolved counts, summary written vs. "No summary (optional)", and the existing stale/orphaned acknowledgement gate that disables the primary action until checked. No viewed row.

**Claude's Discretion**
- Component split (`CommentsTab.vue`, `SummaryTab.vue`, `ExportTab.vue` reusing `SummarySection`, `ExportSection`, `ExportReadinessSummary`, `DriftExportAcknowledgement`, `ExportProgress`, `ExportReceipt`), panel tab state location (`model/panel-state.ts`), toast/announcement reuse.

### Deferred Ideas
- "Files visited this session" checklist row (needs viewed tracking, DEFER-01).

### Existing Code Insights (from CONTEXT.md)
- `src/web/components/workbench/BottomPanel.vue` (Phase 20 interim; props for session identity, pending operations; emits close/saveSummary/cancelSummary/cancelExport/export/reloadLatest/reviewUnsavedText/reviewInlineComposer/finishReview).
- `SummarySection.vue`, `ExportSection.vue`, `ExportReadinessSummary.vue`, `DriftExportAcknowledgement.vue`, `ExportProgress.vue`, `ExportReceipt.vue`, `CopyButton.vue`, `comment-groups.ts`.
- Phase 22 status bar emits open-panel intents; Phase 23 thread reveal API (open file + expand + scroll + focus).
- Established patterns: server-authoritative draft mutations, single live-region owner, same-phase locator updates, full unit suite + typecheck + semantic-css gates.
- Integration points: `tests/e2e/review-notes-dialog.spec.ts`, `tests/integration/complete-review-panel.spec.ts`, `export-receipt-ui.spec.ts`, `agent-ready-export*.spec.ts` (custody-gated runtime spec — default run must pass), `complete-review-draft.spec.ts`.

## Architectural Responsibility Map

Single-tier application — all capabilities reside in the browser client. This is a Vue 3 SPA served by a local-only Fastify static server `[VERIFIED: package.json dependencies — fastify, @fastify/static, no server-side review/UI logic in this phase's scope]`; every PANEL-01..05 behavior (tab state, grouping, autosave timer, clipboard write, focus move) executes in `src/web/` only. The only network calls this phase touches are the pre-existing, unchanged `export`/`finishReview`/draft-mutation requests to the local Loopnote server — none of their payloads or schemas change (CONTEXT.md: "no change to export bytes, draft schema, or the attached completion contract").

## Standard Stack

**No new npm packages are needed.** `[VERIFIED: package.json]` — full dependency list: `@fastify/static`, `@inquirer/search`, `commander`, `fastify`, `markdown-it`, `monaco-editor`, `open`, `vue`, `zod`; devDependencies: `@playwright/test`, `@types/markdown-it`, `@types/node`, TypeScript/`vue-tsc`, `vite`, `vitest`. No debounce library (e.g. `lodash.debounce`), no clipboard polyfill, and no ARIA/tablist component library exist or are implied anywhere in the tree.

All three capabilities this phase needs are already hand-rolled in-repo, confirmed by direct grep, not assumed from training knowledge:
- **Debounce-adjacent timer pattern**: no helper named `debounce` exists anywhere `[VERIFIED: grep for "debounce" across src returned zero matches]`. The project's actual convention is an inline module-scope `let timer: ReturnType<typeof setTimeout> | undefined` plus `clearTimeout`/`setTimeout` and an `onBeforeUnmount(() => clearTimeout(timer))` cleanup, demonstrated today in `CopyButton.vue` (`resetTimer`, lines 16–37) `[VERIFIED: src/web/components/CopyButton.vue]`. The UI-SPEC's autosave snippet uses exactly this idiom.
- **Clipboard write**: `navigator.clipboard.writeText` with a `try/catch` → success/failure message string, no library, used in five places today (`CopyButton.vue`, `DraftRecovery.vue`, `ExportReceipt.vue` ×2, `ReceiptFileRow.vue`, `SelectorDriftNotice.vue`) `[VERIFIED: grep "navigator.clipboard" across src/web/components]`.
- **ARIA tablist**: `role="tablist"`/`role="tab"`/`role="tabpanel"` with `aria-selected`/`aria-controls`/roving `tabindex` and `@keydown.left`/`@keydown.right` arrow-key activation already exists today in `SummarySection.vue`'s Edit/Preview mode switch (lines 152–225) `[VERIFIED: src/web/components/SummarySection.vue]`. This is the first `role="tab"` set introduced at the *panel* (Comments/Summary/Export) level, but it is the second tablist instance in the codebase, not the first-ever ARIA tabs pattern — the planner should point `BottomPanel.vue`'s new tablist implementation at `SummarySection.vue`'s existing one as the in-repo precedent, cited alongside the W3C APG tabs pattern (see Don't Hand-Roll).

No alternatives were considered because none were needed — no new install, no registry/legitimacy audit applicable.

## Package Legitimacy Audit

No new packages — audit not applicable.

## Architecture Patterns

**Status-bar → tab-target data flow:**
```
StatusBar.vue (click "N open comments" or "Export"/"Finish review")
  → emit('openPanel', 'comments' | 'export')          [NEW signature — see Pitfall 2]
  → App.vue openPanel(tab: PanelTab)
       panelState.setActiveTab(tab)                     [panel-state.ts, new field]
       panelOpen.value = true
       void nextTick(() => panelRef.value?.focusActiveTab())
  → BottomPanel.vue :activeTab="panelState.activeTab.value" (prop)
       renders role="tablist" with 3 role="tab" buttons, activeTab drives
       aria-selected/tabindex/hidden on the 3 role="tabpanel" hosts
  → CommentsTab.vue / SummaryTab.vue / ExportTab.vue (one mounted-and-visible
       at a time via v-if, the other two v-if-skipped entirely per the
       UI-SPEC's `<CommentsTab v-if="activeTab === 'comments'" .../>` pattern)
```
`⌘J`/title-bar toggle keeps calling today's parameterless toggle — it does **not** go through `openPanel(tab)` and does **not** call `focusActiveTab()` (UI-SPEC, locked: "only status-bar item" forces focus).

**Comments-tab reveal flow** (reuses Phase 23's `jumpThread` building blocks verbatim, confirmed against `23-08-PLAN.md` Task 3's `function jumpThread`):
```
CommentsTab.vue row click/Enter
  → emit('reveal', commentId, fileId, side, line)
  → BottomPanel.vue forwards (same-name emit, no transform)
  → App.vue revealCommentFromPanel(commentId, fileId, side, line)
       if (fileId !== selectedFile.value?.fileId) selectFile(fileId)   // existing helper, App.vue:907
       collapsedByCommentId.value = new Map([...collapsedByCommentId.value, [commentId, false]])  // expand
       nextTick(() => {
         diffWorkspace.value?.revealComment(side, line)                // existing adapter method
         nextTick(() => {
           document.querySelector(`[data-comment-id="${commentId}"] .thread-header`)?.focus()  // NEW — the one piece jumpThread doesn't do
         })
       })
```
`[VERIFIED: 23-08-PLAN.md Task 3 defines jumpThread using selectFile(), collapsedByCommentId as a reactive Map replaced wholesale, and diffWorkspace.value?.revealComment(side, line) — the exact three primitives revealCommentFromPanel reuses]`. `collapsedByCommentId` and `selectFile` are Phase 23/App.vue-owned state that does not yet exist in the shipped codebase — it is created by `23-08-PLAN.md` Task 1/3, not by this phase.

## Don't Hand-Roll

- **Clipboard-write error handling for "Copy agent prompt"**: reuse the exact `try { await navigator.clipboard.writeText(...); copyMessage.value = '<success text>'; } catch { copyMessage.value = 'Could not copy. Select the value and copy it manually.'; }` shape already used four times in this codebase (`ExportReceipt.vue` lines 93–101, `ReceiptFileRow.vue` lines 20–24, `CopyButton.vue`, `DraftRecovery.vue`). Do not introduce a `try/await/clipboard` helper function, a toast, or a different failure string — `ExportReceipt.vue` already has a `copyMessage` ref and an `.export-receipt__message` render block that the new `copyAgentPrompt()` function should populate exactly like `copyDetails()`/`copyAcknowledgedIdentities()` do today.
- **ARIA tablist semantics**: `role="tablist"`/`role="tab"`/`role="tabpanel"` + `aria-selected` + roving `tabindex` (`0` for selected, `-1` for others) + `aria-controls`/`aria-labelledby` pairing + Left/Right arrow-key activation is the W3C APG "Tabs" pattern `[CITED: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/]`. Do not invent a new keyboard-handling convention — `SummarySection.vue`'s existing Edit/Preview tablist (lines 152–225) already implements this exact shape in this codebase; the new panel-level tablist in `BottomPanel.vue` should mirror its `moveTab(event, nextMode)`-style arrow-key handler, not reinvent one.
- **Debounced autosave timer lifecycle**: do not add a generic `useDebounce()` composable or a library. The locked 800ms autosave in `SummarySection.vue` is a module-scope `let autosaveTimer` + `clearTimeout`/`setTimeout` + `onBeforeUnmount(() => clearTimeout(autosaveTimer))`, the same timer-with-cleanup shape `CopyButton.vue`'s `resetTimer` already uses in this codebase.
- **Focus-after-DOM-update sequencing**: do not add a MutationObserver or a polling wait for the thread DOM to mount. The project's established idiom for "act after Vue's reactive DOM update, then act again after a second reactive update caused by the first" is nested `void nextTick(() => { ...; void nextTick(() => { ... }); })`, already used in `BottomPanel.vue`'s own `watch(() => [props.attachedLifecycle, ...])` (lines 89–95) and prescribed verbatim by the UI-SPEC for `revealCommentFromPanel`.

## Runtime State Inventory

This phase restructures `BottomPanel.vue` (static-label chrome → tab shell) and deletes a 135-line block (`BottomPanel.vue:187–321`, the `attached-completion` section) in favor of relocating it verbatim into `ExportSection.vue`. Inventory of what must be removed/changed vs. what carries over unchanged:

1. **`.bottom-panel__label` "REVIEW" static-text class** `[VERIFIED: src/web/components/workbench/BottomPanel.vue:105, <span class="bottom-panel__label">REVIEW</span>]` — this element and its class are replaced outright by the three `role="tab"` buttons (UI-SPEC's typography table explicitly calls this out: "direct replacement of today's static `.bottom-panel__label` 'REVIEW' text; same visual role... so no new size introduced"). The planner must confirm the `.bottom-panel__label` CSS rule (wherever it's defined in scoped `<style>` or `styles.css`) is either repointed to `.bottom-panel__tab`/`.bottom-panel__tab--selected` or removed if superseded entirely — leaving a dead `.bottom-panel__label` CSS rule after the markup using it is deleted is exactly the kind of orphaned class `verify:semantic-css` is designed to catch `[VERIFIED: package.json script "verify:semantic-css": "npm run build:web && node scripts/verify-semantic-css.mjs"]`.
2. **The `attached-completion` block** (`BottomPanel.vue:187–321`): its markup, copy, and the two `watch()` blocks driving focus (`watch(() => [props.attachedLifecycle, props.attachedFailure], ...)` at lines 89–95, and the four template refs `completionAction`/`completionSuccess`/`completionFailure`/`failureAlert`) move into `ExportSection.vue` verbatim per the UI-SPEC. After the move, `BottomPanel.vue` no longer owns or needs: the `attached`, `attachedHasUnsavedText`, `attachedBlockedByUnsavedText`, `attachedBlockedByPending`, `attachedBlockedByConflict`, `attachedNoFeedback` computeds, the `finishAttachedReview()` function, or the `attachedLifecycle`/`attachedReady`/`attachedFailure`/`unsavedInlineComposerFile`/`isExactPatch` props — all of these relocate to `ExportSection.vue`'s new prop surface. Dead imports to drop from `BottomPanel.vue`: `FinishReviewResult` type import (no longer referenced there) and possibly `AttachedLifecycle` if nothing else in the shell needs it.
3. **`review-notes-dialog.spec.ts`'s mount harness** directly instantiates `BottomPanel` with today's flat prop set (no `activeTab`) and asserts `panel.getByRole('region', { name: 'Summary Saved' })` is immediately visible with no tab click `[VERIFIED: tests/e2e/review-notes-dialog.spec.ts lines 12–36, 65–66]` — after this phase, Summary content is inside a `hidden`-until-selected `role="tabpanel"`, so this harness and assertion are now stale and must be updated (add an `activeTab` prop/default, or click the "Summary" tab before asserting) as part of this phase's own work, not left for a later phase.
4. **`panel-state.ts`'s `PersistedPanelState`/`loopnote.workbench.v1`**: the new `activeTab` field is explicitly **not** added to this persisted shape (CONTEXT/UI-SPEC: "in-memory only... SHELL-04's persisted-fields list is unchanged"). No migration code, no new localStorage key, no `parsePanelState` branch — `activeTab` is a separate `shallowRef` alongside the existing persisted fields, defaulted to `'comments'` every page load, never read from storage.
5. **No stale build artifacts** beyond the above: `grep` for `inventory` prop usage inside `BottomPanel.vue`'s own `<script>`/`<template>` turned up nothing (the harness in `review-notes-dialog.spec.ts` passes an `inventory: []` prop that `BottomPanel.vue` has never declared — it is silently dropped as a non-prop attribute today and remains harmless after this phase; not a dead class/CSS concern, just a harness no-op worth leaving alone unless the planner is already touching that harness for reason #3 above).

## Common Pitfalls

1. **Focus-management race if the thread DOM isn't mounted when `revealCommentFromPanel` tries to focus it.** The UI-SPEC's own pseudocode nests two `nextTick`s specifically to avoid this: the outer `nextTick` lets `selectFile`'s file-switch render settle and lets `collapsedByCommentId`'s map-replacement re-render the now-expanded thread; only the inner `nextTick`, after `diffWorkspace.value?.revealComment(side, line)` has run, queries `[data-comment-id="${commentId}"] .thread-header` and calls `.focus()`. `jumpThread` (`23-08-PLAN.md` Task 3) does the equivalent file-switch + expand + reveal sequence but explicitly stops short of focusing the thread header — "one piece `jumpThread` **not** does is move focus onto thread's header" is the UI-SPEC's own framing, confirming this is new, not copy-pasted working code. The planner must keep both `nextTick` layers (not collapse to one) and should have the executor manually verify in a real session that `.thread-header` exists in the DOM by the time the inner callback runs when the target file differs from the currently-open one (the riskiest case — `selectFile` likely tears down and remounts `DiffWorkspace`'s Monaco instance).

2. **`StatusBar.vue`'s `openPanel` emit-signature change conflicts with what Phase 22's own plan currently says it will ship.** Phase 24's UI-SPEC locks: `StatusBar.vue`'s single `openPanel: []` emit "becomes `openPanel: [tab: 'comments' | 'export']`... Both existing buttons now pass own literal target." But Phase 22's `22-03-PLAN.md` (Wave 3, not yet executed) explicitly instructs: *"Keep the button's `@click="emit('openPanel')"` unchanged"* `[VERIFIED: .planning/phases/22-identity-status-bar/22-03-PLAN.md, grep "openPanel", line 75]` — i.e. Phase 22's own plan currently intends to ship the parameterless signature on **both** buttons, the opposite of what Phase 24's UI-SPEC assumes it will find. Since Phase 22 depends on nothing from Phase 24 and will very likely execute first (or independently) per the roadmap, Phase 24's plan must not assume `StatusBar.vue` already has a parameterized `openPanel` emit by the time Phase 24 executes — it must inspect whatever `StatusBar.vue` actually looks like on disk at execution time and change the emit signature itself (adding the `tab` parameter to both buttons' `@click` handlers) as an explicit task, with its own typecheck/e2e verification, rather than treating the parameterization as already done. This is a cross-phase integration risk the planner must surface as its own task, not fold silently into "wire StatusBar", because whichever phase's executor runs second will discover the other phase's plan document was already stale.

3. **The 8 rescoped `agent-ready-export.spec.ts` "Finish review" locators do *not* need to change in this phase, provided the `attached-completion` region is moved byte-for-byte.** Phase 22's `22-03-PLAN.md` (Task/verify section) already plans to rescope all 8 sites to `page.getByRole('region', { name: 'Finish attached review' }).getByRole('button', { name: 'Finish review', exact: true })` `[VERIFIED: 22-03-PLAN.md, grep "openPanel|attached-completion", line 91]`, matching the existing `<section v-if="attached" class="attached-completion" aria-labelledby="finish-attached-review-heading">` / `<h3 id="finish-attached-review-heading">Finish attached review</h3>` region in today's `BottomPanel.vue` (lines 187–194). The UI-SPEC's instruction to move this block "verbatim" into `ExportSection.vue` means the accessible name `"Finish attached review"` and its `role="region"` must be preserved exactly — if so, Playwright's `getByRole('region', { name: 'Finish attached review' })` resolves identically regardless of which `.vue` file now renders that markup, and **none of the 8 locators need touching in this phase**. The planner must make "preserve the region's `aria-labelledby`/heading text exactly, in whichever component now hosts it" an explicit must-have, because if the move is not byte-for-byte (e.g. the heading text or id is altered during the relocation), these 8 already-planned-rescoped locators from Phase 22 would silently break with no Phase-24-authored test change to catch it.

4. **Every existing Playwright helper that opens the bottom panel and immediately asserts Export/Summary content is visible without first selecting a tab will break**, because Export/Summary content is now hidden behind `role="tabpanel"` `:hidden` bindings on a Comments-default landing tab. Concretely verified: `tests/integration/export-receipt-ui.spec.ts`'s `openReview(page)` helper (lines 183–187) clicks "Toggle panel (⌘J)" and then asserts `page.getByRole('region', { name: 'Review', exact: true }).getByRole('button', { name: 'Export review' })` is visible with zero intervening tab click — after this phase the Export button lives inside the Export tabpanel, hidden by default `[VERIFIED: tests/integration/export-receipt-ui.spec.ts lines 183-187, 212-214]`. Likewise `tests/e2e/review-notes-dialog.spec.ts` asserts `panel.getByRole('region', { name: 'Summary Saved' })` is visible immediately after mount with no tab click `[VERIFIED: same file, lines 65-66]`. Both files are in this phase's explicitly-named integration/test surfaces and both require a tab-click (or an `activeTab` prop default override in the harness) inserted into their setup — this is necessarily part of this phase's own task list, not incidental breakage to note and defer.

5. **Debounce-timer cleanup on unmount/panel-close.** `SummarySection.vue`'s new autosave `setTimeout` must be cleared both in `onBeforeUnmount` (covers the Summary tabpanel's `v-if` toggling it out of the DOM when the reviewer switches tabs, and the whole panel closing) and on every re-trigger of the `watch(() => props.modelValue, ...)` callback (`clearTimeout(autosaveTimer)` at the top, per the UI-SPEC's own snippet) — a stray fired autosave after the component is gone would call `emit('save')` on an unmounted component, which no-ops safely in Vue 3 but is still worth the explicit `onBeforeUnmount` guard the UI-SPEC already specifies, matching `CopyButton.vue`'s existing `onBeforeUnmount(clearResetTimer)` convention.

6. **`projectCommentsTabFileGroups` must not reuse `comment-groups.ts`'s existing types.** `comment-groups.ts`'s `ReviewCommentProjection`/`CommentGroup`/`groupsForState` are state-outer (open-group, resolved-group), file-inner, and operate on a narrower `state: 'open' | 'resolved'` shape with no `status`/`stale`/`orphaned` discrimination `[VERIFIED: src/web/model/comment-groups.ts lines 1-24, 60-86]`. The new `comments-tab-groups.ts` is file-outer/state-inner and needs the fuller `WorkspaceComment` shape (which has `status: 'verified' | 'stale' | 'orphaned'` per `workspace-state.ts`), not `ReviewCommentProjection`. Do not attempt to adapt or extend `comment-groups.ts` in place — it is still consumed unchanged by `review-draft-state.ts`'s `.groups()`, and UI-SPEC explicitly calls out the shape mismatch as the reason for a parallel, non-shared module.

## Code Examples

**Existing timer-cleanup idiom** (`CopyButton.vue`, the pattern the new 800ms autosave timer and the `ExportReceipt.vue` copy-feedback timers already follow) `[VERIFIED: src/web/components/CopyButton.vue:15-40]`:
```ts
const feedback = ref<'idle' | 'success' | 'failure'>('idle');
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function clearResetTimer(): void {
  if (resetTimer !== undefined) {
    clearTimeout(resetTimer);
    resetTimer = undefined;
  }
}

async function copyValue(): Promise<void> {
  clearResetTimer();
  feedback.value = 'idle';
  try {
    await navigator.clipboard.writeText(props.value);
    feedback.value = 'success';
    resetTimer = setTimeout(() => {
      feedback.value = 'idle';
      resetTimer = undefined;
    }, 2_000);
  } catch {
    feedback.value = 'failure';
  }
}

onBeforeUnmount(clearResetTimer);
```

**Existing clipboard-write idiom** (`ExportReceipt.vue`, the direct precedent for the new `copyAgentPrompt()`) `[VERIFIED: src/web/components/ExportReceipt.vue:93-101]`:
```ts
async function copyDetails(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(receiptDetails.value);
    copyMessage.value = 'Copied export receipt details.';
  } catch {
    copyMessage.value = 'Could not copy. Select the value and copy it manually.';
  }
}
```

**Existing ARIA tablist idiom** (`SummarySection.vue`, the direct precedent for `BottomPanel.vue`'s new outer tablist) `[VERIFIED: src/web/components/SummarySection.vue:152-180]`:
```html
<div role="tablist" aria-label="Summary mode">
  <button
    id="summary-tab-edit" ref="editTab" type="button" role="tab" class="ui-button"
    :class="{ 'ui-button--selected': mode === 'edit' }"
    :aria-selected="mode === 'edit'" aria-controls="summary-panel-edit"
    :tabindex="mode === 'edit' ? 0 : -1"
    @click="selectMode('edit')"
    @keydown.left="moveTab($event, 'preview')" @keydown.right="moveTab($event, 'preview')"
  >Edit</button>
  <!-- second tab button mirrors this -->
</div>
```

**No existing precedent** for: a tri-state ARIA tablist driven by an external shallowRef (today's only tablist is 2-way and component-local `mode` state) — the UI-SPEC's own `TABS`-array + `moveTab(-1|1)` + `update:activeTab` emit pattern is the first of this exact shape in the codebase; follow it as written, it is implementation-ready pseudocode, not a sketch to reinterpret.

## Assumptions Log

- `[ASSUMED]` The `.bottom-panel__label` CSS rule referenced by `BottomPanel.vue:105` lives either in that file's own (unseen, not yet read in full) `<style>` block or in `src/web/styles.css`; this research did not locate and confirm the rule's exact selector/declaration — the planner/executor must grep for `.bottom-panel__label` in CSS sources before deleting or repointing it, per `verify:semantic-css`'s dead-class detection.
- `[ASSUMED]` `BottomPanel.vue`'s full `<style>` block (lines 301–350, not read in this session) contains layout rules for `.review-notes-dialog__counts`, `.attached-completion*`, etc. that will need the same "does this class survive the relocation" treatment as `.bottom-panel__label` — only the header label class was explicitly named by the UI-SPEC as a direct replacement, but the executor should treat the full moved block's CSS the same way.
- `[ASSUMED]` Phase 22 and Phase 23 will execute with their current plan documents' interfaces substantially intact (field names like `collapsedByCommentId`, `selectFile`, `flatFileRows`, `attachedLifecycle` 3-value prop, the rescoped 8 locators) — these are the best currently-available source since neither phase has executable code yet; if either phase's execution diverges from its own plan (as Phase 22's plan already diverges from Phase 24's UI-SPEC assumption, see Pitfall 2), Phase 24's plan must re-verify against whatever actually lands on disk, not against these plan documents, at execution time.
- `[ASSUMED]` `orphaned-comments.ts`'s `projectOrphanedCommentGroup()` and `thread-order.ts`'s exports described here come entirely from `23-03-PLAN.md`/`23-08-PLAN.md` prose, since neither file exists in the repository yet `[VERIFIED: read attempts for both paths returned "not found"]` — their final parameter/return shapes could change slightly when Phase 23 actually executes.

## Open Questions

None blocking. The UI-SPEC, CONTEXT.md, and this research together resolve every architectural, copy, and sequencing question needed to plan this phase; the one genuine cross-phase disagreement found (Pitfall 2) has a clear, actionable resolution (treat the signature change as this phase's own explicit task, verified against whatever `StatusBar.vue` looks like at execution time) rather than requiring a human decision.

## Security Domain

`workflow.security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"`. STRIDE-style pass over this phase's three new/changed surfaces:

| Surface | Threat category | Analysis | Disposition |
|---|---|---|---|
| "Copy agent prompt" clipboard write | Information Disclosure / Tampering | The copied string is a **fixed, locked template literal** — `` `Apply the review in \`${receipt.files[0].path}\` (human-readable: \`review.md\`). Address every open comment; leave resolved ones as context.` `` — interpolating only `receipt.files[0].path`, which is server-returned, already-published, repo-relative export metadata the user can already see and copy via the existing "Copy all receipt details" button on the same receipt `[VERIFIED: UI-SPEC lines 273-284; the path is not user-typed input anywhere in this flow]`. The write is outbound-only (clipboard ← app), uses the exact same `navigator.clipboard.writeText`/try-catch idiom as four existing buttons, and sends nothing over the network. No new trust boundary; no injection risk since no user-controlled string is concatenated into the copied text. **Accept, no material new trust boundary.** |
| New cross-component focus move (`revealCommentFromPanel` → `.thread-header.focus()`) | Spoofing (focus-jacking) / Denial of Service (focus trap) | Focus moves only in direct response to a user-initiated click/Enter on a comment row the user already has access to view (comments are session-scoped, same-origin, already rendered in the DOM the user is looking at) — this is a UX convenience (ARIA tabs "activate selected tab, let focus continue naturally" pattern `[CITED: W3C APG Tabs]`), not a new data-exposure path. The target element (`.thread-header`) is an existing, already-focusable element per Phase 23's own UI-SPEC ("already focusable by role/semantics"). No new way to move focus without a user gesture, no way to move focus outside the document. **Accept, no material new trust boundary.** |
| `StatusBar.vue`'s `openPanel` emit signature change (`[]` → `[tab: 'comments' \| 'export']`) | Tampering | Purely a same-process Vue emit-payload shape change between two components the project itself owns and controls; the literal argument is always one of two hardcoded strings passed by the template (`'comments'`/`'export'`), never derived from any external or user-controlled input. No new attack surface — this is an internal typed-prop contract, not a parsed/untrusted value. **Accept, no material new trust boundary.** |
| New `App.vue` `openPanel(tab)`/`revealCommentFromPanel(...)` functions and `panel-state.ts`'s new `activeTab` field | Tampering (client-state integrity) | `activeTab` is explicitly kept **out of** `PersistedPanelState`/`localStorage` (UI-SPEC, locked) — it cannot be used to smuggle a malicious value across a session boundary via `JSON.parse`'d storage the way the existing `parsePanelState` already defends against for its six persisted fields. It is a plain in-memory `shallowRef`, always reset to `'comments'` on load, written only by two call sites this phase controls. **Accept, no material new trust boundary.** |

No ASVS Level 1 control in scope here is weakened or newly implicated: no new input validation surface is introduced (the only "new" text surface, the Markdown summary textarea, already existed pre-phase and its content handling is explicitly unchanged — `renderMarkdownPreview` and the server-side `DraftMutationRequestSchema` validation are both untouched by this phase), no new authentication/session boundary is crossed, and no new data leaves the browser except the pre-existing export/finish-review network calls whose payload shape is explicitly frozen by CONTEXT.md ("delivered canonical result unchanged").

## Project Constraints (from AGENTS.md)

No `AGENTS.md` exists at the repository root or in `src/web/` `[VERIFIED: glob for AGENTS.md under /Users/alessandro/projects/diff-review returned no results]` — no additional project-specific directives beyond this phase's own CONTEXT.md/UI-SPEC and the project-wide conventions already documented above (server-authoritative mutations, single live-region, same-phase locator updates, full gate suite).

**Valid until:** 2026-12-05 (30 days — stable, locked UI-SPEC/CONTEXT, no external library versions in play).
