# Phase 23: Inline Comment Threads - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Render every comment on the current file as an inline Monaco thread under its anchored line (paired zones keep Base/Head aligned), with Open / Resolved / Anchor moved states, resolve / reopen / delete (with Undo) / edit, expanded-by-default threads with session-scoped collapse, editor-title previous/next-thread and collapse-all actions, ⌥F9 / ⇧⌥F9 cross-file navigation, gutter `+` composition, and stability through draft reconciliation and snapshot Refresh. Gated by a go/no-go spike. Requirements: THREAD-01..09.

Not in this phase: replies (dropped — one comment per anchor, draft contract unchanged), the Comments panel tab (Phase 24), viewed tracking (deferred). No draft/export schema changes.

</domain>

<decisions>
## Implementation Decisions

### Design source
- `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` § Inline thread widget and sketch `004-comment-threads` variant **A** (thread frame, 2px state-coloured top rule, header anatomy, state chips, collapsed snippet, gutter `+` chip). The reply textarea in the sketch is out of scope.

### Undo & anchor states
- Delete with Undo = delayed commit: hide the thread immediately and show a toast with Undo for 5s; send `deleteComment` only when the toast expires or the session is left (flush on `pagehide`/`visibilitychange`). Undo restores the same comment (same id). No schema change.
- Orphaned comments (anchor unavailable): shown as a file-level "Orphaned comments" group pinned at the top of the diff area (and later in the Phase 24 Comments tab), state chip "Anchor missing".
- Stale comments (anchor mismatch): rendered at the recorded line with the "Anchor moved" chip and the recorded selected text quoted in the body.
- Edit is available on open threads only; resolved threads must be reopened first.

### Thread interaction
- Keyboard entry: with editor cursor on a line that has a thread, ⌥Enter focuses the thread header (⌥Enter on an uncommented line keeps opening the composer as today); Tab cycles header actions; Esc returns focus to the editor at that line.
- Header actions (Resolve/Reopen, Edit, Delete) are visible on hover AND whenever focus is within the thread — never hover-only.
- Collapse state: in-memory per comment id for the session; editor-title "Collapse all threads" applies to the current file and toggles to "Expand all threads". Defaults: open threads expanded, resolved collapsed.
- ⌥F9 / ⇧⌥F9 order: tree path order (Phase 21 order), then Base before Head, then line; wraps around with a single live announcement "Wrapped to first thread" / "Wrapped to last thread".

### Spike & fallback
- Plan 01 is a go/no-go spike proving, in the real diff editor (side-by-side, inline mode, single-pane): pointer clicks, textarea typing, Tab/Shift+Tab and Esc inside a content widget layered over a view zone; paired zone heights stay in sync when a thread grows/shrinks; widgets survive scrolling and hidden-unchanged-region collapse/expand; 30 threads in one file without perceptible input lag (measure).
- If the spike fails: STOP and return to the user for a re-plan decision before any thread UI is built (do not silently fall back to panel-only threads).
- In-progress edit text is kept in memory keyed by comment id through draft reconciliation and Refresh; if the anchor becomes stale/orphaned mid-edit, keep the editor open with a warning.
- No per-file thread cap; zones/widgets are diffed by comment id (keyed map), never rebuilt wholesale.

### Claude's Discretion
- Adapter architecture (keyed multi-zone map extending `diff-adapter.ts`'s paired-zone helpers), component split (`CommentThread.vue` mounted via `render()` into widget DOM as today's cards are), focus management details, toast component reuse.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/contracts/api.ts` `DraftMutationRequestSchema`: `editComment`, `deleteComment`, `resolveComment`, `reopenComment` (server + `mutate-draft.ts` already implement them); `App.vue` `mutateReview()` dispatch; `review-draft-state.ts` pending-operation kinds include resolve/reopen/delete.
- `src/contracts/draft.ts`: comment `state: open|resolved`; anchor verification `verified|stale|orphaned` with reasons.
- `src/web/monaco/diff-adapter.ts`: paired composer zone (`createComposerZone`/`createSpacerZone`/`growPairedZones`), `PublicMonacoSinglePaneAdapter`, `addAction` pattern, Phase 20 navigation actions; `DiffWorkspace.vue` renders accepted comments read-only (`conversation-card inline-accepted-comment`) and the composer (`CommentComposer`).
- `src/web/model/draft-reconciliation.ts`, `comment-groups.ts`, `workspace-state.ts`.

### Established Patterns
- Durable anchors are immutable; golden-hash anchor tests must stay byte-identical; single live-region owner; same-phase locator updates; typecheck + semantic-css gates; real-Chromium packaged-binary evidence.

### Integration Points
- `tests/unit/monaco-diff-adapter.test.ts` (single-zone contract — will need structural updates), `tests/integration/monaco-anchor.spec.ts`, `tests/e2e/anchored-review.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, rendered-markdown specs (block-range comments).

</code_context>

<specifics>
## Specific Ideas

- Pitfalls to own (`.planning/research/PITFALLS.md`): view-zone height desync, pointer events inside zones, zone churn on reconciliation, golden-hash anchor drift.

</specifics>

<deferred>
## Deferred Ideas

- Replies (REQUIREMENTS Future REPLY-01).

</deferred>
