---
status: complete
phase: 23-inline-comment-threads
source: [23-VERIFICATION.md]
started: 2026-11-05T22:40:00Z
updated: 2026-11-05T23:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Thread card pixel-level visual polish against 23-UI-SPEC.md's sketch-variant-A reference
expected: Thread card frame/header/chip/snippet visually match the locked design source in all three modes; dynamically-measured code-column indent lines up with the gutter; icon glyphs and chip colours read correctly.
result: pass
reported: "Resolved autonomously (no interactive user session available) via a real-Chromium UI review (`23-UI-REVIEW.md`) driving the packaged `dist/bin/loopnote.mjs` build at 1280/1600/1920px: frame/top-rule/header/state-chip/collapsed-snippet match sketch 004 variant A in side-by-side, inline, and single-pane modes; the dynamically-measured contentLeft indent (69px side-by-side / 84-85px single-pane) is pixel-measured directly from screenshots as flush with the code column; all 7 hand-drawn UiIcon.vue glyphs and the state-chip colour-to-icon mapping (Open=blue, Resolved=purple, Anchor moved/missing=amber, always icon+text) read correctly at a glance. Overall UI score 22/24, zero BLOCKER findings. Screenshot evidence: `.planning/ui-reviews/23-20261105-225926/` (gitignored, not committed)."

### 2. Esc on a focused-but-not-editing thread header
expected: |
  23-CONTEXT.md's locked keyboard-entry decision states Esc returns focus to the Monaco editor at
  that line. Tab into a thread's header (not into edit mode — no textarea focused) and press Esc.
  Code trace confirms no Esc handler exists for this case in `App.vue`/`CommentThread.vue` (both
  Escape branches in `handleKeydown` require `event.target instanceof HTMLTextAreaElement`), so
  focus most likely stays on the thread header/action button instead of returning to the editor.
  Confirm the actual browser behavior, then decide: accept as a minor non-blocking deviation
  (not named by any Phase 23 plan's `must_haves.truths`), or file a follow-up to wire this
  specific Esc case.
result: pass
reported: "Closed by fix commit `b4aa70b` (post-exec): added `MonacoDiffAdapter.focusAnchor(side, line)` to both adapter implementations, exposed as `DiffWorkspace.focusEditorAtAnchor`, and wired a new Escape branch in `App.vue`'s `handleKeydown` that resolves the focused thread's comment by its `data-comment-id` and returns focus to the correct editor pane at the correct line — confirmed side-correct in side-by-side, inline, and single-pane via two new real-Chromium Playwright regressions in `tests/e2e/inline-comment-threads.spec.ts` (6/6 passing in that file)."

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

No gaps — both items resolved with code fixes and automated/real-browser evidence (see above).
