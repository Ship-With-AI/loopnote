---
status: testing
phase: 23-inline-comment-threads
source: [23-VERIFICATION.md]
started: 2026-11-05T22:40:00Z
updated: 2026-11-05T22:40:00Z
---

## Current Test

number: 1
name: Thread card pixel-level visual polish against 23-UI-SPEC.md's sketch-variant-A reference
expected: |
  Open a review session with at least one inline comment thread in side-by-side, inline, and
  single-pane modes. The rendered `.comment-thread` card (frame, top rule, header, state chip,
  collapsed snippet) visually matches 23-UI-SPEC.md's sketch-variant-A reference. In particular,
  confirm the code-column indent reads correctly aligned to the gutter: the implementation uses a
  dynamically-measured `editor.getLayoutInfo().contentLeft` at runtime (measured during Plan 23-01's
  spike as ~69px side-by-side / ~85px single-pane) rather than UI-SPEC's placeholder 56px/96px
  literal values — confirm this still looks visually correct, not just passes automated
  bounding-box alignment assertions. Also confirm the 7 new hand-drawn icon glyphs (UiIcon.vue) and
  the state-chip colour-to-icon mapping read correctly at a glance.
awaiting: user response

## Tests

### 1. Thread card pixel-level visual polish against 23-UI-SPEC.md's sketch-variant-A reference
expected: Thread card frame/header/chip/snippet visually match the locked design source in all three modes; dynamically-measured code-column indent lines up with the gutter; icon glyphs and chip colours read correctly.
result: [pending]

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
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
