---
phase: 23-inline-comment-threads
plan: 04
subsystem: ui
tags: [vue, css-tokens, vitest, icon-system]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-01)
    provides: overlay-widget architecture decision (informational only — this plan touches no widget-mounting code, pure presentational components only)
provides:
  - "CommentThread.vue — presentational thread card (header/body/footer), typed props/emits, threadChip() chip-priority helper, no mutateReview()/App.vue import — ready for Plan 23-07's DiffWorkspace.vue mounting loop"
  - "UndoToast.vue — presentational delete-undo toast (message + Undo button, role=status), no internal timer — ready for Plan 23-08's App.vue 5s-window/flush-on-leave wiring"
  - "ReviewStateBadge.vue size=\"compact\" prop — uppercase-pill chip variant for CommentThread's header, existing default call sites (BottomPanel.vue, DiffWorkspace.vue) unchanged"
  - "UiIcon.vue — 7 new glyphs: edit, delete, reopen, previous-thread, next-thread, collapse-threads, expand-threads"
affects: [23-05-monaco-adapter, 23-07-diff-workspace, 23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure chip-priority helper (threadChip) exported from a plain <script lang=\"ts\"> block alongside the component's <script setup> block — same split as IdentityPill.vue/StatusBar.vue, lets tests import the function directly from the .vue file without @vue/test-utils/DOM mounting (project has neither)"
    - "Reused-CSS-not-new-CSS discipline: edit textarea nests inside a div carrying the existing .inline-comment-composer class so the pre-existing '.inline-comment-composer textarea' sizing selector applies with zero new rules"

key-files:
  created: [src/web/components/CommentThread.vue, src/web/components/UndoToast.vue, tests/unit/comment-thread.test.ts]
  modified: [src/web/components/ui/UiIcon.vue, src/web/components/ui/ReviewStateBadge.vue, src/web/styles.css, scripts/verify-semantic-css.mjs]

key-decisions:
  - "Followed UI-SPEC.md's locked-verbatim copy/placement over PLAN.md's paraphrased task prose where the two disagreed (edit-save helper text wording, anchor-moved notice placement) — see Deviations."
  - "reopen glyph: mirrors refresh's circular-arrow shape but flipped (arrow/opening on the opposite side), per task text's 'distinct glyph, not just distinct aria-label' instruction."

requirements-completed: [THREAD-01, THREAD-02, THREAD-03, THREAD-04, THREAD-05]

# Metrics
duration: 55min
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 04: CommentThread.vue, UndoToast.vue, Icons Summary

**New presentational `CommentThread.vue` (header twistie/location/compact state-chip/collapsed-snippet/resolve-reopen-edit-delete actions, body read-or-edit, footer) and `UndoToast.vue`, backed by 7 new `UiIcon.vue` glyphs and a `size="compact"` `ReviewStateBadge.vue` variant — zero App.vue/adapter wiring, zero new CSS tokens.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-11-05T19:40:00Z
- **Completed:** 2026-11-05T20:35:00Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `CommentThread.vue`: pure props-in/emits-out thread card generalizing `DiffWorkspace.vue`'s current single inline `h()` literal into real header/body/footer markup, per UI-SPEC's Frame/Header/State-Chips/Collapse/Edit-in-Place sections.
- `threadChip()` pure chip-priority helper (resolved > stale > open), unit-tested via TDD RED→GREEN, including the "no fourth chip kind for orphaned" guarantee.
- `UndoToast.vue`: message + visible-label Undo button, `role="status"`, no internal timer/`pagehide` logic (owned by Plan 23-08's App.vue).
- 7 new `UiIconName` glyphs (`edit`, `delete`, `reopen`, `previous-thread`, `next-thread`, `collapse-threads`, `expand-threads`), each a distinct hand-drawn path at the existing 16×16/1.5px-stroke/`currentColor` convention.
- `ReviewStateBadge.vue` `size="compact"` prop mapping to the governed `--font-size-label` (11px) uppercase-pill treatment — every existing (non-compact) call site unaffected.
- New CSS (`.comment-thread`/`--resolved`/`--stale`, `.thread-header` family, `.review-state-badge--compact`, `.undo-toast`) uses only pre-existing tokens; `verify:semantic-css` passes.

## Task Commits

1. **Task 1: Add the seven new icon glyphs and the compact state-chip variant** - `99b94d9` (feat)
2. **Task 2: Build CommentThread.vue** - RED `43f6672` (test), GREEN `c9621ab` (feat)
3. **Task 3: Build UndoToast.vue** - `fcc1b19` (feat)
4. **Deviation fix: allowlist `.undo-toast`'s reused overlay box-shadow** - `d1c548e` (fix)

**Plan metadata:** (docs commit hash recorded below after this SUMMARY is committed)

_Note: Task 2 is `tdd="true"` — RED commit (`43f6672`) added the failing test importing `threadChip` from a not-yet-existing `CommentThread.vue`; GREEN commit (`c9621ab`) added the component and made it pass. No REFACTOR commit needed — clean on first write._

## Files Created/Modified
- `src/web/components/CommentThread.vue` - New SFC: `threadChip()` pure helper + the presentational thread card (header/body/footer), 8 named emits, no `mutateReview()`/App.vue import anywhere in the file.
- `src/web/components/UndoToast.vue` - New SFC: `message` prop, `undo` emit, no timer.
- `tests/unit/comment-thread.test.ts` - 4 tests covering all 4 `threadChip()` cases from the plan's `<behavior>` block.
- `src/web/components/ui/UiIcon.vue` - 7 new `UiIconName` union members + matching `<template v-else-if>` glyph branches.
- `src/web/components/ui/ReviewStateBadge.vue` - `size?: 'default' | 'compact'` prop (default `'default'`), bound as an additional class alongside the existing `review-state-badge--${kind}` class.
- `src/web/styles.css` - `.comment-thread`/`--resolved`/`--stale`, `.thread-header`/`__location`/`__snippet`/`__actions` (+ hover/focus-within opacity rule), `.review-state-badge--compact`, `.undo-toast` — all built from existing design tokens (`--border-default`, `--interactive-accent`, `--status-resolved-foreground`, `--status-warning-foreground`, `--radius-overlay`, `--radius-pill`, `--font-size-label`, `--letter-spacing-label`, `--border-overlay`, `--surface-raised`, `--shadow-overlay`, `--font-size-chrome`, `--space-*`).
- `scripts/verify-semantic-css.mjs` - Added `.undo-toast` to the existing `overlayAllowlist` (see Deviations).

## Decisions Made
- Twistie markup reuses `DirectoryRow.vue`'s exact `▾`/`▸` + `.directory-row__disclosure` class convention verbatim (zero new CSS), per the plan's explicit instruction to reuse that convention.
- The edit-mode `<div class="conversation-card__body">` gets an additional `inline-comment-composer` class only while `editing` is true, so the pre-existing `.inline-comment-composer textarea` sizing selector (`min-height: 76px; max-height: 240px`) applies to the new textarea with zero new CSS, matching the task's "no new CSS" instruction literally.
- Footer kept minimal (`"Saved locally"` badge in `.conversation-card__footer`), mirroring `DiffWorkspace.vue`'s current `h()` literal verbatim — UI-SPEC itself has no dedicated Footer section for `CommentThread.vue`, but the plan frontmatter's artifact description explicitly lists "footer" as part of the structure, so the most conservative choice was to carry the existing footer forward unchanged rather than invent new footer content.
- `path` prop (required by the plan's prop contract but not rendered visually anywhere in UI-SPEC's Header Anatomy) is consumed for an accessible root `aria-label` (`"Comment thread, {path}, {sideLabel} line {n}"`) — gives the prop a real purpose without contradicting any spec section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/inconsistency] Followed UI-SPEC's locked-verbatim copy over PLAN.md's paraphrase for the edit-save helper text**
- **Found during:** Task 2 (CommentThread.vue body markup)
- **Issue:** PLAN.md's task-2 action text quotes the edit helper line as `"⌘Enter save · Esc cancel"`. UI-SPEC.md's Edit-in-Place section and its Copywriting Contract table both independently state, and explicitly mark, the locked-verbatim copy as `"⌘Enter to save · Esc to cancel"` (with "to"). The two source documents disagree; UI-SPEC is the authoritative, reviewed design contract and states this copy is "locked verbatim" in two places.
- **Fix:** Rendered the UI-SPEC's verbatim copy (`"⌘Enter to save · Esc to cancel"`) rather than PLAN.md's shorter paraphrase.
- **Files modified:** src/web/components/CommentThread.vue
- **Verification:** Visual inspection of the rendered template string; no test asserts this exact copy string (not in scope of Task 2's `<behavior>` block).
- **Committed in:** c9621ab (Task 2 GREEN commit)

**2. [Rule 1 - Bug/inconsistency] Followed UI-SPEC's locked-verbatim copy and placement for the anchor-moved (stale) warning over PLAN.md's paraphrase**
- **Found during:** Task 2 (CommentThread.vue body markup)
- **Issue:** PLAN.md's task-2 action text says to render "the locked verbatim anchor-moved body copy" as `"Line changed comment. Export marks stale; re-anchor or keep as is."`, placed *below* the comment text. UI-SPEC.md's "Orphaned Comments & Anchor-Moved Copy" section (explicitly titled "locked verbatim where the design source specifies it") and its Copywriting Contract table both instead give the fuller, differently-worded copy `"Line changed after this comment. Export marks it **stale**; re-anchor or keep as is."`, placed *above* the comment text, "together with the recorded selected text quoted." PLAN.md's own restatement omits words present in the design source and reverses the placement.
- **Fix:** Rendered UI-SPEC's verbatim copy (bold on "stale") inside `<InlineNotice tone="warning">` *above* the static comment paragraph, followed by the quoted `comment.recordedAnchor.selectedText`.
- **Files modified:** src/web/components/CommentThread.vue
- **Verification:** Visual inspection of the template; `npx vue-tsc --noEmit` confirms `recordedAnchor.selectedText` is a valid, typed property path on `WorkspaceComment`.
- **Committed in:** c9621ab (Task 2 GREEN commit)

**3. [Rule 3 - Blocking] Allowlisted `.undo-toast`'s reused overlay box-shadow in the semantic-CSS guard script**
- **Found during:** Task 3 verification (`npm run verify:semantic-css`)
- **Issue:** `.undo-toast` reuses the project's existing overlay chrome recipe (`box-shadow: var(--shadow-overlay)` — the exact same token value `.modal-dialog`/`.identity-popover` already use, per the task's explicit "no new hex, no new surface token" instruction), but `scripts/verify-semantic-css.mjs`'s `assertAuthorStyle()` requires every selector using that shadow value to be explicitly registered in a hardcoded `overlayAllowlist` Set. `.undo-toast` was a genuinely new selector not yet in that list, so `verify:semantic-css` failed with `overlay shadow is not allowlisted for .undo-toast` even though the CSS itself introduces zero new tokens/values.
- **Fix:** Added `'.undo-toast'` to the existing `overlayAllowlist` Set in `scripts/verify-semantic-css.mjs`, alongside `.modal-dialog`/`.identity-popover`/etc.
- **Files modified:** scripts/verify-semantic-css.mjs
- **Verification:** `npm run verify:semantic-css` passes ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass").
- **Committed in:** d1c548e (fix)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 — followed UI-SPEC's locked-verbatim copy/placement over PLAN.md's paraphrase where the two sources disagreed; 1 Rule 3 — blocking guard-script allowlist gap for a reused, zero-new-token CSS value).
**Impact on plan:** All three were necessary to match the authoritative, explicitly-"locked verbatim" design-contract copy and to pass the existing gate script without weakening it. No scope creep — no new behavior, no new tokens, no new components.

**Binding decision override (widget architecture):** N/A — this plan builds pure presentational components only; no `IContentWidget`/`IOverlayWidget`/`addContentWidget`/`addOverlayWidget` reference anywhere in scope (mounting is Plan 23-07/23-08's job).

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npx vue-tsc --noEmit --project tsconfig.web.json` (plan-level `<verification>` command) — **0 errors**.
- `npx vitest run --no-file-parallelism tests/unit/comment-thread.test.ts` (plan-level `<verification>` command) — **4 tests passed, 1 test file passed**.
- `npm run typecheck:web` — **0 errors** (`vue-tsc --noEmit` clean).
- `npm run verify:semantic-css` — **pass** after the Rule 3 allowlist fix ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass"); new `.comment-thread`/`.thread-header*`/`.review-state-badge--compact`/`.undo-toast` rules use only pre-existing tokens.
- `npx vitest run --no-file-parallelism tests/unit` (full unit suite) — **452 tests passed, 45 test files passed, 0 failed** (no regressions; includes this plan's 4 new tests).
- Playwright: ran the 3 existing specs that exercise surfaces this plan touched (`ReviewStateBadge`/`.review-state-badge*` rendering), identified by grepping `tests/e2e/` and `tests/integration/` for `ReviewStateBadge|review-state-badge|UiIcon|icon-btn|CommentThread|UndoToast`: `tests/integration/anchored-workspace.spec.ts`, `tests/integration/draft-recovery-ui.spec.ts`, `tests/integration/export-receipt-ui.spec.ts` (all three run against a live Vite dev server of current source, not a stale build) — **22/22 passed**. Neither new component (`CommentThread.vue`, `UndoToast.vue`) is mounted by any existing route yet, so there is no packaged-binary Chromium check exercising their actual rendered output in this plan; the plan's own `<verification>` section explicitly defers that to Plan 23-07 (mounts `CommentThread.vue`) and Plan 23-08 (mounts `UndoToast.vue`) — noted here as required.
- `tests/e2e/agent-ready-export.spec.ts` and its fixtures: untouched (plan has no reason to touch default agent-ready-export behavior).
- Golden-hash anchor tests: no golden-hash fixtures exist near this plan's scope (pure UI component work); none touched.

## Self-Check: PASSED

- `src/web/components/CommentThread.vue`, `src/web/components/UndoToast.vue`, `tests/unit/comment-thread.test.ts` all exist on disk (`[ -f ... ]` confirmed for all 7 created/modified files).
- Commits `99b94d9`, `43f6672`, `c9621ab`, `fcc1b19`, `d1c548e` all present in `git log --oneline`.
- `threadChip()` exported exactly as the plan's signature requires; all 4 `<behavior>` cases pass.
- `UiIconName` has all 7 new members, each with a rendered `<template v-else-if>` glyph branch.
- `ReviewStateBadge.vue` accepts `size="compact"` with a default that leaves every existing untyped call site (`BottomPanel.vue`, `DiffWorkspace.vue`) unchanged.
- All plan-level `<verification>` commands and the shared-context gate commands ran and passed; no scope was narrowed.

## Next Phase Readiness
- `CommentThread.vue` and `UndoToast.vue` are both typed, tested, and ready for direct mounting: Plan 23-07 (DiffWorkspace.vue zone-mounting loop, replacing the current `h()` literal) and Plan 23-08 (App.vue, owns the delete-undo 5s timer/flush and dispatches all of `CommentThread.vue`'s emits to `mutateReview()`).
- `ReviewStateBadge.vue`'s `size="compact"` and the 7 new `UiIcon.vue` glyphs are available for any other phase-23 plan that needs them (e.g. Plan 23-06's editor-title navigation icons for `previous-thread`/`next-thread`/`collapse-threads`/`expand-threads`).
- No blockers for downstream plans.

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
