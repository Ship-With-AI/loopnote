# Phase 24: Bottom Panel & Export - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Split Phase 20's interim single "Review" panel into Comments / Summary / Export tabs: a grouped, click-to-reveal comment list (builds on Phase 23 threads), an autosaving summary editor, and an Export tab with readiness checklist, stale/orphaned acknowledgement gate, progress, receipt with copy actions and "Copy agent prompt", plus agent-attached Finish review behind the same gate. Requirements: PANEL-01..05.

Not in this phase: viewed tracking (deferred), replies (dropped), any change to export bytes, draft schema, or the attached completion contract.

</domain>

<decisions>
## Implementation Decisions

### Design source
- `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` § Bottom panel and sketch `004-comment-threads` variant **A**.

### Tabs & Summary
- Summary autosaves the draft after 800ms of no typing with a "Saving… / Saved" indicator; ⌘S / Ctrl+S saves immediately. The existing summary mutation and its conflict/stale-draft handling stay authoritative (no client-synthesized state).
- Opening the panel shows the last-used tab this session; the status-bar comment count opens Comments; the status-bar Export/Finish item opens Export.
- Comments tab groups by file in tree order (Phase 21 order); inside a file: open, stale, then resolved; orphaned comments listed under their file with the "Anchor missing" chip. Row click / Enter opens the file, expands the thread, scrolls it into view, and moves focus to the thread header.
- `role="tablist"` / `tab` / `tabpanel`; arrow keys move and activate tabs; ⌘J / Ctrl+J toggles the panel; when opened from a status-bar item, focus moves into the target tab panel.

### Export & receipt
- "Copy agent prompt" copies: "Apply the review in `.loopnote/exports/<timestamp>/review.json` (human-readable: `review.md`). Address every open comment; leave resolved ones as context." — repo-relative paths, clipboard only, nothing sent.
- Export again is allowed; each export writes a new timestamped directory (current behaviour); the receipt shows the latest.
- In agent-attached sessions "Finish review" replaces "Export review" as the Export tab's primary action behind the same checklist and drift acknowledgement; existing finishing / completed / error / reload states move verbatim from the interim panel; delivered canonical result unchanged.
- Readiness checklist: open/resolved counts, summary written vs. "No summary (optional)", and the existing stale/orphaned acknowledgement gate that disables the primary action until checked. No viewed row.

### Claude's Discretion
- Component split (`CommentsTab.vue`, `SummaryTab.vue`, `ExportTab.vue` reusing `SummarySection`, `ExportSection`, `ExportReadinessSummary`, `DriftExportAcknowledgement`, `ExportProgress`, `ExportReceipt`), panel tab state location (`model/panel-state.ts`), toast/announcement reuse.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/web/components/workbench/BottomPanel.vue` (Phase 20 interim; props for session identity, pending operations; emits close/saveSummary/cancelSummary/cancelExport/export/reloadLatest/reviewUnsavedText/reviewInlineComposer/finishReview).
- `SummarySection.vue`, `ExportSection.vue`, `ExportReadinessSummary.vue`, `DriftExportAcknowledgement.vue`, `ExportProgress.vue`, `ExportReceipt.vue`, `CopyButton.vue`, `comment-groups.ts`.
- Phase 22 status bar emits open-panel intents; Phase 23 thread reveal API (open file + expand + scroll + focus).

### Established Patterns
- Server-authoritative draft mutations, single live-region owner, same-phase locator updates, full unit suite + typecheck + semantic-css gates.

### Integration Points
- `tests/e2e/review-notes-dialog.spec.ts`, `tests/integration/complete-review-panel.spec.ts`, `export-receipt-ui.spec.ts`, `agent-ready-export*.spec.ts` (custody-gated runtime spec — default run must pass), `complete-review-draft.spec.ts`.

</code_context>

<specifics>
## Specific Ideas

- None beyond the sketch reference.

</specifics>

<deferred>
## Deferred Ideas

- "Files visited this session" checklist row (needs viewed tracking, DEFER-01).

</deferred>
