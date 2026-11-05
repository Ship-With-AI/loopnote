---
phase: 23-inline-comment-threads
verified: 2026-11-05T22:40:00Z
status: passed
score: 5/5 roadmap success criteria verified (9/9 THREAD requirements present, substantive, and wired)
behavior_unverified: 0
re_verification:
  previous_status: gaps_found
  previous_score: "4/5 roadmap success criteria verified (9/9 THREAD requirements present and wired; 1 of 9 — THREAD-04 — failed its explicit keyboard clause)"
  gaps_closed:
    - "Reviewer can edit a comment's text inline, saving with ⌘Enter/Ctrl+Enter and cancelling with Esc, by mouse OR keyboard (ROADMAP Success Criterion 3 / THREAD-04) — closed by commit 0220f9c."
  gaps_remaining: []
  regressions: []
post_verification_remediation:
  - "Human-verification item 2 (Esc on a focused-but-not-editing thread header) fixed in `b4aa70b`: added `MonacoDiffAdapter.focusAnchor(side, line)` to both adapter implementations, exposed as `DiffWorkspace.focusEditorAtAnchor`, and wired a new Escape branch in `App.vue`'s `handleKeydown` that resolves the focused thread's comment by `data-comment-id` and returns focus to the correct Monaco editor pane at the correct line. Verified side-correct in side-by-side, inline, and single-pane by two new real-Chromium Playwright regressions in `tests/e2e/inline-comment-threads.spec.ts`."
  - "Human-verification item 1 (thread-card pixel-level visual polish) closed via a real-Chromium UI review (`23-UI-REVIEW.md`, no interactive user session available) driving the packaged `dist/bin/loopnote.mjs` build at 1280/1600/1920px: PASS verdict — frame/top-rule/header/state-chip/collapsed-snippet match sketch 004 variant A in all three layout modes, 69px/85px contentLeft indent pixel-measured flush with the code column, all 7 hand-drawn icon glyphs and state-chip colour-to-icon mapping read correctly. Overall UI score 22/24, zero BLOCKER findings."
  - "Code review (`23-REVIEW.md`, standard depth, 45 files): 0 critical, 1 warning (WR-01), 1 info (IN-01, left open — magic-number duplication, non-blocking). WR-01 (a second pending comment-delete silently dropped the first's Undo option while its timer kept running) fixed in `c7793fa`: pending deletes now tracked as an ordered list with one stacked `.undo-toast` per delete, each independently undoable. Verified by a new Playwright regression in `tests/e2e/inline-comment-threads.spec.ts`."
  - "Security audit (`23-SECURITY.md`): SECURED, 17/17 plan-time threats closed, 0 open. The `b4aa70b` Esc fix was independently reviewed and found to introduce no new attack surface (data-comment-id used only as a trusted `.find()` lookup key, never a sink)."
human_verification: []
---

# Phase 23: Inline Comment Threads Verification Report

**Phase Goal:** Comments render as expanded-by-default Monaco view-zone threads directly under their anchored line, reachable by pointer, keyboard, and dedicated editor-title navigation icons/shortcuts, surviving draft reconciliation and Refresh without losing scroll position or in-progress edits — gated by an explicit go/no-go spike before the full multi-zone rework is built.
**Verified:** 2026-11-05
**Status:** passed
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

### Human Verification — Resolved Post-Exec

Both items below were open as human-verification at the end of the re-verification pass above.
Neither was a literal PLAN `must_haves.truths` gap, so the original pass correctly did not block
on them; both are now closed with concrete evidence (see `## Post-review fixes` below for the
commits/reports) rather than left open.

#### 1. Thread card pixel-level visual polish — **CLOSED, PASS**

**Test:** Visually inspect the rendered `.comment-thread` card (frame/top-rule/header/state-chip/collapsed-snippet) against 23-UI-SPEC.md's sketch-variant-A reference, in side-by-side, inline, and single-pane modes.
**Resolution:** `23-UI-REVIEW.md` — a real-Chromium UI review driving the packaged `dist/bin/loopnote.mjs` build at 1280/1600/1920px (no interactive user session available). PASS: frame/top-rule/header/state-chip/collapsed-snippet match sketch 004 variant A in all three layout modes; the 69px/85px dynamically-measured `contentLeft` indent is pixel-measured directly from screenshots as flush with the code column; all 7 hand-drawn icon glyphs and the state-chip colour-to-icon mapping read correctly. Overall UI score 22/24, zero BLOCKER findings.

#### 2. Esc on a focused, non-editing thread header — **CLOSED, fixed**

**Test:** Tab into a thread header (not into the edit-mode textarea), press Esc, and confirm where focus lands.
**Resolution:** Fixed in commit `b4aa70b` — see `## Post-review fixes` below.

### Gaps Summary

**No gaps remain.** The previously blocking gap — THREAD-04 / ROADMAP Success Criterion 3's "(⌘Enter/Ctrl+Enter save, Esc cancel), by mouse or keyboard" clause — is closed by commit `0220f9c` (see above). Both post-verification human-verification items are now also closed by post-exec fixes/audits (see `## Post-review fixes`).

All 9 THREAD requirements (THREAD-01 through THREAD-09) and all 5 ROADMAP success criteria for Phase 23 are now verified against live source and passing behavioral tests, not just SUMMARY narrative.

## Post-review fixes (2026-11-05)

Post-execution pipeline (code review, security audit, UI review) run after the gap-closure
re-verification above. One code-review warning and one locked-decision keyboard gap were fixed,
each as its own atomic `fix(23): ...` commit, verified individually and together below.

### 1. Human-verification gap — Esc on a focused, non-editing thread header never returned focus to the editor

**Root cause:** 23-CONTEXT.md's locked keyboard-entry decision requires Esc on a focused-but-not-editing thread header to return focus to the Monaco editor at that thread's anchored line. `App.vue`'s `handleKeydown` only defined Escape branches gated on `event.target instanceof HTMLTextAreaElement` (the edit-textarea case and the new-comment-composer case) — neither fired when focus was on the `.thread-header` element itself (focused via ⌥Enter per CONTEXT's decision) or its action buttons.

**Fix:** Added `MonacoDiffAdapter.focusAnchor(side, line)` to both adapter implementations (`PublicMonacoDiffAdapter` for side-by-side/inline, `PublicMonacoSinglePaneAdapter` for single-pane) — `setPosition` + `revealLineInCenter` + `focus()`, guarded by the same `isValidLine` check every other anchor method uses, without the composer/anchor-zone side effects of `activateAnchor` (which would have re-triggered `activateLine`'s existing-comment branch and just refocused the same header). Exposed as `DiffWorkspace.focusEditorAtAnchor`. Wired a new Escape branch in `App.vue`'s `handleKeydown`, checked after the edit-textarea and composer branches: resolves the focused `.comment-thread`'s `data-comment-id` to its `WorkspaceComment`, and — only when that thread is not mid-edit — calls `focusEditorAtAnchor(comment.side, comment.line)`. Commit `b4aa70b`.

**Evidence:** two new Playwright regressions in `tests/e2e/inline-comment-threads.spec.ts`: one covers side-by-side and inline layouts for both a base-anchored and a head-anchored thread (asserts the correct editor pane's Monaco input surface — `.native-edit-context`, this Monaco build's EditContext-based input element — receives focus, and `.line-numbers.active-line-number` shows the correct line); the other covers single-pane. Both pass; confirmed real browser behavior, not just code trace. `npm run typecheck:web` — 0 errors.

### 2. Code-review warning (WR-01, `23-REVIEW.md`) — a second pending comment-delete silently dropped the first's Undo option

**Root cause:** `App.vue`'s delete/undo flow used a single `activeUndo` ref. Deleting thread B while thread A's 5s Undo toast was still showing overwrote `activeUndo` to `{commentId: B}` — A's own `commitPendingDelete` timer kept running unseen in `pendingDeletes`, with no way for the reviewer to undo it once the toast silently switched to B.

**Fix:** Replaced `activeUndo` with `pendingUndos` (an ordered `{commentId}[]` list); `beginPendingDelete`/`commitPendingDelete`/`undoPendingDelete` now append/filter this list instead of overwriting a single ref. Template renders one stacked `.undo-toast` per pending delete inside a new `.undo-toast-stack` wrapper (split `.undo-toast`'s CSS into the stack's fixed positioning and the toast's own frame styling). `UndoToast.vue` now takes a `commentId` prop, rendered as `data-comment-id` so overlapping toasts stay independently addressable/testable. Commit `c7793fa`.

**Evidence:** new Playwright regression in `tests/e2e/inline-comment-threads.spec.ts`: delete A, delete B 1.5s later (inside A's window), assert both toasts coexist (`.undo-toast` count 2), Undo A leaves B's toast/timer untouched, B's own timer still fires exactly one `deleteComment` request (A's never fires). `npm run typecheck:web` — 0 errors; `npm run verify:semantic-css` — passed (new `.undo-toast-stack` selector declared, no violations).

### Security audit

`23-SECURITY.md` — **SECURED**, 17/17 plan-time threats closed, 0 open. The `b4aa70b` Esc fix was independently reviewed and found to introduce no new attack surface: `data-comment-id` is sourced from the already-trusted `comment.id`, used only as a `.find()` lookup key (never a selector/innerHTML/eval sink), and the resolved typed `side`/`line` feed Monaco's own `setPosition`/`revealLineInCenter`/`focus` APIs behind the existing `isValidLine` guard.

### Code review

`23-REVIEW.md` — standard depth, 45 files. **0 critical, 1 warning (WR-01, fixed above), 1 info (IN-01, left open).** IN-01 (anchor-zone/thread-zone minimum-height magic numbers duplicated across `diff-adapter.ts` and `DiffWorkspace.vue` with no shared constant) is a maintainability suggestion, not a defect — left as a documented follow-up opportunity, consistent with the default `--fix` scope (critical + warning only).

### Combined verification after all fixes

- `npm run typecheck:web` — 0 errors.
- `npm run verify:semantic-css` — passed: canonical root, retired vocabulary, and author-style invariants pass.
- `npx vitest run --no-file-parallelism tests/unit` — 45 files, 460 tests, 0 failed.
- `npm run build` — passed.
- `npx playwright test` (full default suite) — 130 total: 129 passed on a clean run; one isolated flake (`anchored-review.spec.ts` "records the darwin opener invocation" — `pack-runtime.mjs`'s "tracked source changed during pack" custody guard) observed on one of three full-suite runs taken during this session, not reproduced on the other two full runs, and passed cleanly (1/1) when re-run alone immediately after — confirmed flaky/environmental via isolated re-run, not a regression from either fix (neither fix touches `scripts/pack-runtime.mjs` or that spec file).


---

_Verified: 2026-11-05_
_Verifier: agent (gsd-verifier), re-verification mode_
