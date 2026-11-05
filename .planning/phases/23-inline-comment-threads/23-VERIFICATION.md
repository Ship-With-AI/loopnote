---
phase: 23-inline-comment-threads
verified: 2026-11-05T22:40:00Z
status: human_needed
score: 5/5 roadmap success criteria verified (9/9 THREAD requirements present, substantive, and wired)
behavior_unverified: 0
re_verification:
  previous_status: gaps_found
  previous_score: "4/5 roadmap success criteria verified (9/9 THREAD requirements present and wired; 1 of 9 — THREAD-04 — failed its explicit keyboard clause)"
  gaps_closed:
    - "Reviewer can edit a comment's text inline, saving with ⌘Enter/Ctrl+Enter and cancelling with Esc, by mouse OR keyboard (ROADMAP Success Criterion 3 / THREAD-04) — closed by commit 0220f9c."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Visually inspect the rendered `.comment-thread` card (frame/top-rule/header/state-chip/collapsed-snippet) against 23-UI-SPEC.md's sketch-variant-A reference, in side-by-side, inline, and single-pane modes, at the project's default zoom/font settings."
    expected: "Thread card matches the locked design source; the dynamically-measured `contentLeft`-based left offset (implementation uses `editor.getLayoutInfo().contentLeft` at runtime — 69px side-by-side / 85px single-pane per 23-01-SUMMARY.md's measurement — superseding the UI-SPEC's placeholder 56px/96px literal values) visually lines up with the code column, not just passes the automated bounding-box alignment assertions."
    why_human: "Pixel-level visual polish and glyph correctness (7 new hand-drawn SVG icon paths, state-chip colour-to-icon mapping) cannot be judged from source review or DOM geometry assertions alone."
  - test: "Tab into a thread header (not into the edit-mode textarea), press Esc, and confirm where focus lands."
    expected: "23-CONTEXT.md's locked keyboard-entry decision states Esc should return focus to the Monaco editor line."
    why_human: "Re-confirmed unaffected by the THREAD-04 fix (commit 0220f9c): App.vue's `handleKeydown` still only defines two Escape branches, both gated on `event.target instanceof HTMLTextAreaElement` — the new `.comment-thread`+`editingCommentId` branch (for the edit textarea) and the pre-existing `.inline-comment-composer` branch (for the new-comment composer). Neither fires when focus is on a `.thread-header` button rather than a textarea, and grepping both App.vue and CommentThread.vue for `Escape`/`keydown` turns up no third handler. Focus very likely stays on the thread header/action button instead of returning to the editor. This is a CONTEXT.md decision, not literal ROADMAP wording, and no PLAN's `must_haves.truths` names it explicitly, so it remains a non-blocking human-verification item rather than a gap — confirm actual browser behavior before deciding whether a follow-up fix is warranted."
---

# Phase 23: Inline Comment Threads Verification Report

**Phase Goal:** Comments render as expanded-by-default Monaco view-zone threads directly under their anchored line, reachable by pointer, keyboard, and dedicated editor-title navigation icons/shortcuts, surviving draft reconciliation and Refresh without losing scroll position or in-progress edits — gated by an explicit go/no-go spike before the full multi-zone rework is built.
**Verified:** 2026-11-05
**Status:** human_needed
**Re-verification:** Yes — after gap closure (commit `0220f9c`, following commit `c09351d`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A go/no-go spike proves the chosen widget technique reliably receives pointer clicks and keyboard input before any thread UI is built; if the spike fails, the interaction model is re-planned first. | ✓ VERIFIED (regression check) | Unchanged since initial verification — `23-01-SUMMARY.md` documents the real-browser spike selecting `overlay-widget` over the rejected `content-widget` path (user-resolved `checkpoint:decision`); production code (`diff-adapter.ts`) implements the overlay-widget technique end to end. Not re-derived in full this pass per re-verification-mode optimization; spot-checked that `diff-adapter.ts` still uses `addOverlayWidget`/`onDomNodeTop`/`layoutOverlayWidget` and the spike artifacts are still absent from the repo. |
| 2 | Every comment on the current file renders as an inline thread directly under its anchored line, opposite side padded so Base/Head stay aligned, header shows side/line/non-colour-only Open/Resolved/Anchor-moved state. | ✓ VERIFIED (regression check) | Unchanged since initial verification — `threadZones` paired-zone growth, `CommentThread.vue`'s `ReviewStateBadge` icon+label pairing via `threadChip()`. The one file touched by the THREAD-04 fix (`App.vue`) has no bearing on this truth's zone-growth or header-rendering code paths; `git show --stat 0220f9c` confirms only `src/web/App.vue` and the test file changed. |
| 3 | Reviewer can resolve, reopen, delete (with a few seconds' Undo) a thread, and edit a comment's text inline (⌘Enter/Ctrl+Enter save, Esc cancel), by mouse or keyboard. | ✓ VERIFIED | **Gap closed.** Resolve/Reopen/Delete-with-5s-Undo: unchanged, still VERIFIED (native buttons, `mutateReview()`/Undo-timer wiring). **Edit's keyboard clause, previously FAILED, is now VERIFIED by direct code read and a passing behavioral test.** `App.vue`'s `handleKeydown` (read fresh this pass, lines 1102–1131) now has a new branch, checked *before* the generic `.inline-comment-composer` branch: `const editingThreadArticle = target instanceof HTMLTextAreaElement ? target.closest('.comment-thread') : null; if (editingThreadArticle !== null && editingCommentId.value !== undefined) { ... }`. Inside it, ⌘Enter/Ctrl+Enter calls the newly-extracted `saveCommentEdit(editingCommentId.value)` and Esc calls the newly-extracted `cancelCommentEdit(editingCommentId.value)` (both at lines 344–358, previously inline template arrow functions on `<DiffWorkspace @save-comment-edit>`/`@cancel-comment-edit>`), then `return`s — never falling through to the composer branch. The distinguishing signal is sound: `CommentThread.vue`'s edit-mode wrapper (`article.comment-thread > .conversation-card__body.inline-comment-composer`, line 117) is nested inside `article.comment-thread`, while the unrelated new-comment composer lives in a separate `CommentComposer.vue` component (`<section class="conversation-card inline-comment-composer">`) that is never inside a `.comment-thread` ancestor — so `target.closest('.comment-thread')` correctly tells the two apart. Behavioral evidence (not just presence): `npx playwright test tests/e2e/inline-comment-threads.spec.ts` → **3/3 passed**, including the two new regressions added in commit `0220f9c` — "resolve, edit, collapse-all, and Option+F9/Shift+Option+F9 cross-file navigation" now also presses `Control+Enter` in an existing thread's edit textarea and asserts a 200 mutation response plus the saved text appearing (lines 290–301), and a new standalone test "Escape cancels an existing thread's inline edit without sending a mutation" asserts Esc reverts the draft, closes the textarea, and fires **zero** `/api/draft/mutations` requests (lines 371–414). Both are genuine end-to-end assertions against a packaged binary, not placeholders. |
| 4 | Open threads expanded, resolved threads collapsed to a one-line snippet by default; reviewer can collapse/expand one thread or all threads in the current file; choice kept for the session. | ✓ VERIFIED (regression check) | Unchanged since initial verification — `collapsed` prop, session-scoped `collapsedByCommentId` ref, single `EditorTitle.vue` collapse-all icon. Untouched by the THREAD-04 fix. |
| 5 | Previous/next-thread and collapse-all-threads icons in the editor title; ⌥F9/⇧⌥F9 work inside and outside the diff editor, tree order, wrap with locked announcement; gutter `+` adds comments; threads keep position/expanded-state/in-progress-edit-text through Refresh; durable anchors (incl. Markdown block ranges) stay byte-identical. | ✓ VERIFIED (regression check) | Unchanged since initial verification — `thread-order.ts` navigation, gutter `+` CSS/decorations, `renderThreads()` DOM-node-identity reconciliation, untouched `src/domain/anchor.ts`. Untouched by the THREAD-04 fix; confirmed the full `npx playwright test` run (below) still passes the dedicated navigation assertions inside the same spec file that now also covers keyboard edit. |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/web/App.vue` | `handleKeydown` routes ⌘Enter/Ctrl+Enter/Esc inside an existing thread's edit textarea to `saveCommentEdit`/`cancelCommentEdit`, distinct from the new-comment composer's `add-comment`/`escape` dispatch. | ✓ VERIFIED | New branch at lines 1112–1122 (checked before the `.inline-comment-composer` branch at 1123–1131); `saveCommentEdit`/`cancelCommentEdit` extracted as named functions at lines 344–358, called both from `handleKeydown` directly and via `<DiffWorkspace @save-comment-edit="saveCommentEdit" @cancel-comment-edit="cancelCommentEdit">` (lines 1647–1648) for the mouse-button path. |
| `src/web/components/CommentThread.vue` | Edit-mode textarea's enclosing markup gives `handleKeydown` a distinguishing signal from the new-comment composer. | ✓ VERIFIED | Edit-mode wrapper `div.inline-comment-composer` (line 117) is nested inside `article.comment-thread` (line 59) — the ancestor `handleKeydown` now checks for. No change needed in this file; the fix lives entirely in `App.vue`'s routing logic. |
| `tests/e2e/inline-comment-threads.spec.ts` | Regression coverage for both the keyboard-save and keyboard-cancel paths on an *existing* thread's edit. | ✓ VERIFIED | Keyboard-save: `Control+Enter` assertion added inside the existing "resolve, edit, collapse-all…" test (lines 290–301), asserting a 200 mutation response and the saved text rendering. Keyboard-cancel: new standalone test "Escape cancels an existing thread's inline edit without sending a mutation" (lines 371–414), asserting the draft reverts, the textarea closes, and zero mutation requests fire. Both ran and passed. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `App.vue handleKeydown` (edit-textarea branch) | `App.vue saveCommentEdit`/`cancelCommentEdit` | Direct function call, gated on `target.closest('.comment-thread') !== null && editingCommentId.value !== undefined` | ✓ WIRED | Confirmed by source read; `return` after handling prevents fallthrough to the composer branch. |
| `CommentThread.vue` "Save edit"/"Cancel edit" buttons | `App.vue saveCommentEdit`/`cancelCommentEdit` | `emit('saveEdit')`/`emit('cancelEdit')` → `DiffWorkspace.vue`'s `onSaveEdit: () => emit('saveCommentEdit', comment.id)` / `onCancelEdit: () => emit('cancelCommentEdit', comment.id)` (lines 235–236) → `App.vue` template `@save-comment-edit="saveCommentEdit"` / `@cancel-comment-edit="cancelCommentEdit"` | ✓ WIRED | Mouse path unchanged and still independently exercised by the original (pre-fix) "Save edit" button assertion at line 286. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Keyboard-save on an existing thread's edit text | `npx playwright test tests/e2e/inline-comment-threads.spec.ts` | 3/3 passed, incl. `Control+Enter` → 200 response + saved text visible | ✓ PASS |
| Keyboard-cancel (Esc) on an existing thread's edit text, zero mutation | same run | 3/3 passed, incl. Esc → draft reverted, textarea closed, 0 `/api/draft/mutations` requests | ✓ PASS |
| No regression across the rest of the suite | `npx playwright test` (full suite, run once) | 126 passed, 1 failed on first pass (`rendered-markdown-security.spec.ts:177` — unrelated file, not touched by commit `0220f9c`); re-ran that single spec in isolation → 3/3 passed, confirming parallel-run flake, not a real regression | ✓ PASS (flake confirmed, not a regression) |

### Plan-Level Must-Haves Trace (THREAD-01..09)

| Requirement | Source Plan(s) | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| THREAD-01 | 23-01, 23-04, 23-05, 23-07, 23-08 | Inline thread under anchored line, reachable by mouse/keyboard, delete offers Undo | ✓ VERIFIED (regression check) | See Truth 2, 3 |
| THREAD-02 | 23-04, 23-07 | Header shows side/line/non-colour-only Open/Resolved/Anchor-moved state | ✓ VERIFIED (regression check) | See Truth 2 |
| THREAD-03 | 23-04, 23-08 | Resolve/reopen/delete via header, by mouse or keyboard, delete offers Undo | ✓ VERIFIED (regression check) | See Truth 3 |
| THREAD-04 | 23-04, 23-08 | Edit comment text inline, ⌘Enter save / Esc cancel | ✓ VERIFIED | **Gap closed** — keyboard save/cancel now wired for existing-thread edits (see Truth 3) |
| THREAD-05 | 23-04, 23-06, 23-08 | Open expanded / resolved collapsed by default; per-thread + collapse-all toggle, session-scoped | ✓ VERIFIED (regression check) | See Truth 4 |
| THREAD-06 | 23-01, 23-05, 23-07 | Gutter `+` to add comment; durable anchors (incl. Markdown block ranges) byte-identical | ✓ VERIFIED (regression check) | See Truth 5 |
| THREAD-07 | 23-02, 23-07, 23-08 | Jump prev/next thread across files, tree order | ✓ VERIFIED (regression check) | See Truth 5 |
| THREAD-08 | — | Threads keep position/expanded-state/in-progress-edit-text through Refresh | ✓ VERIFIED (regression check) | See Truth 5 |
| THREAD-09 | — | Prev/next-thread + collapse-all icons in editor title, ⌥F9/⇧⌥F9 inside and outside editor | ✓ VERIFIED (regression check) | See Truth 5 |

### Automated Checks

| Command | Result | Status |
| --- | --- | --- |
| `npm run typecheck:web` | `vue-tsc --noEmit --project tsconfig.web.json` — 0 errors, 2.74s | ✓ PASS (re-run fresh this session) |
| `npx vitest run --no-file-parallelism tests/unit` | 45 files passed, 460 tests passed, 0 failed, 6.41s | ✓ PASS (re-run fresh this session; no `token-contract.test.ts` flake observed) |
| `npx playwright test tests/e2e/inline-comment-threads.spec.ts` | 3 passed (25.8s) — this is the direct evidence for the THREAD-04 fix | ✓ PASS (re-run fresh this session) |
| `npx playwright test` (full default suite) | 127 total: 126 passed, 1 failed on first pass (`rendered-markdown-security.spec.ts:177:1`, unrelated file); isolated re-run of that spec alone → 3/3 passed, confirming flake | ✓ PASS (flake, not a regression — re-run fresh this session) |
| `npm run verify:semantic-css` | Not independently re-run this session (unchanged from prior verification; `App.vue`, the only file the fix touches, declares no new CSS selectors) | Not re-run — carried forward, scope-exclusion confirmed |
| `npm run test:runtime-artifact` (custody-gated) | Not independently re-run this session (unchanged from prior verification; commit `0220f9c` touches only `src/web/App.vue` and `tests/e2e/inline-comment-threads.spec.ts`, neither in this gate's scope) | Not re-run — carried forward, scope-exclusion confirmed |

### Anti-Patterns Found

None in the diff introduced by commit `0220f9c` (`src/web/App.vue`, `tests/e2e/inline-comment-threads.spec.ts`). No `TODO`/`FIXME`/`HACK`/`XXX`/`TBD` markers, no empty handlers, no hardcoded-empty stub returns in either changed file's diff.

### Human Verification Required

#### 1. Thread card pixel-level visual polish

**Test:** Visually inspect the rendered `.comment-thread` card (frame/top-rule/header/state-chip/collapsed-snippet) against 23-UI-SPEC.md's sketch-variant-A reference, in side-by-side, inline, and single-pane modes, at the project's default zoom/font settings.
**Expected:** Thread card matches the locked design source; the dynamically-measured `contentLeft`-based left offset visually lines up with the code column, not just passes automated bounding-box alignment assertions.
**Why human:** Pixel-level visual polish and glyph correctness cannot be judged from source review or DOM geometry assertions alone. (Carried forward unchanged — unrelated to the THREAD-04 fix.)

#### 2. Esc on a focused, non-editing thread header

**Test:** Tab into a thread header (not into the edit-mode textarea), press Esc, and confirm where focus lands.
**Expected:** 23-CONTEXT.md's locked keyboard-entry decision states Esc should return focus to the Monaco editor line.
**Why human:** Re-confirmed this pass against the current `handleKeydown`: both Escape branches (the new edit-textarea branch and the pre-existing composer branch) are gated on `event.target instanceof HTMLTextAreaElement`, so neither fires when focus is on a `.thread-header` button. No third Escape handler exists anywhere in `App.vue` or `CommentThread.vue`. This item is unaffected by the THREAD-04 fix and remains a non-blocking human-verification item (a CONTEXT.md decision, not literal ROADMAP wording, not named by any PLAN's `must_haves.truths`), not a gap.

### Gaps Summary

**No gaps remain.** The previously blocking gap — THREAD-04 / ROADMAP Success Criterion 3's "(⌘Enter/Ctrl+Enter save, Esc cancel), by mouse or keyboard" clause — is closed by commit `0220f9c`. `App.vue`'s `handleKeydown` now checks for a `.comment-thread` ancestor with an active `editingCommentId` before falling through to the generic `.inline-comment-composer` branch, routing ⌘Enter/Ctrl+Enter to the newly-extracted `saveCommentEdit(commentId)` and Esc to the newly-extracted `cancelCommentEdit(commentId)`, without disturbing the new-comment composer's own, already-correct ⌘Enter/Esc handling (it has no `.comment-thread` ancestor). Two new Playwright regressions in `tests/e2e/inline-comment-threads.spec.ts` exercise both directions against a packaged binary — keyboard-save (`Control+Enter` → 200 response, saved text visible) and keyboard-cancel (`Escape` → draft reverted, textarea closed, zero mutation requests) — both passed (3/3 for the file; 126/126 effective for the full suite once the single unrelated flake in `rendered-markdown-security.spec.ts` is excluded).

Two items remain open as **human verification**, both carried forward unchanged from the prior report and reconfirmed unaffected by this fix: (1) pixel-level visual polish of the thread card against the UI-SPEC reference, and (2) where focus lands after pressing Esc on a focused-but-not-editing thread header (code trace confirms no handler covers this path; it is a CONTEXT.md-level decision, not a named PLAN must-have, so it stays non-blocking rather than a gap).

All 9 THREAD requirements (THREAD-01 through THREAD-09) and all 5 ROADMAP success criteria for Phase 23 are now verified against live source and passing behavioral tests, not just SUMMARY narrative.

---

_Verified: 2026-11-05_
_Verifier: agent (gsd-verifier), re-verification mode_
