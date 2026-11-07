# Phase 20: Shell Frame - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Recompose the review workspace into the VS Code-shaped shell — title bar, files-only side bar, editor area (icon-only editor-title actions + breadcrumbs), bottom panel, status bar — on a new workbench geometry token root, preserving every capability for all five session kinds. Requirements: TOK-01, SHELL-01..06, NAV-01..04.

Not in this phase: the identity pill/popover and final status-bar content (Phase 22), tree restyle (Phase 21), inline threads and their editor-title actions/⌥F9 (Phase 23), panel tabs Comments/Summary/Export (Phase 24), DESIGN.md prose rewrite (Phase 25). This phase uses interim placements for those surfaces (below) so nothing is lost between phases.

</domain>

<decisions>
## Implementation Decisions

### Design source
- Visual and structural spec: `.kimi-code/skills/sketch-findings-loopnote/` (`references/workbench-shell.md`, `references/tokens-and-density.md`) and sketch `001-shell-layout` variant **S2**. Loopnote colour roles unchanged; geometry per the tokens table. No activity bar.

### Interim placement until later phases
- Identity: render today's identity text compactly centred in the title bar (no pill/popover yet — Phase 22). Title-bar right holds Refresh (uncommitted/standalone only, as today), Review notes → now "toggle panel", side-bar toggle, panel toggle; Support moves to the status bar.
- Bottom panel: a single interim "Review" tab hosting today's `ReviewNotesDialog` body (summary, export readiness/receipt, attached Finish and its error/reload states). The modal dialog is removed; Phase 24 splits the panel into Comments / Summary / Export.
- Status bar: snapshot ID, open-comment count (opens panel), Export item (opens panel; the single emphasized item — becomes Finish in attached sessions in Phase 22), plain Support item, using existing data only.
- Warning stack (patch drifted, selector drift, stale anchors, captured-files-changed, resume-uncommitted offer, refresh summary): a strip at the top of the editor area below the editor title, content unchanged. Phase 22 moves drift into the pill.

### Layout & view
- Below 760px: keep the existing narrow drawer path (`ChangedFilesDialog` narrow mode) working unchanged — no new narrow work, no deletion. Desktop only is the target; regressions below 1050px are accepted debt.
- Persist side-bar width + shown/hidden and panel height in one versioned localStorage key (e.g. `loopnote.workbench.v1`), ignoring/overwriting corrupt or out-of-range values.
- Inline/side-by-side toggle (NAV-01): session-scoped, default side-by-side, disabled for single-pane files. This reverses v2.0's Out-of-Scope "User-configurable unified/split layout"; update PROJECT.md Out of Scope accordingly.
- Breadcrumbs are orientation only in this phase (no interaction).

### Keyboard & tests
- Register F7/⇧F7 (change) and ⌥↑/⌥↓ (file) as Monaco editor actions on both sub-editors (and the single-pane editor) so they work with focus in the diff and override Monaco's Diff Review Pane and move-line; keep the document-level handler for focus outside Monaco.
- Replace the old file-nav chords ⌥⇧[ / ⌥⇧] with ⌥↑/⌥↓ (no aliases).
- ⌘B / ⌘J (Ctrl+B / Ctrl+J on non-mac) always preventDefault, including inside the editor.
- Update every Playwright/integration locator this phase breaks within this phase (A11Y-03 rule), and add one packaged-binary shell smoke spec per session kind (committed branch/worktree, exact patch, Staged/Unstaged/Working tree, standalone, agent-attached) reusing existing fixtures/helpers (SHELL-05).

### Claude's Discretion
- Component decomposition (e.g. `components/workbench/WorkbenchShell.vue`, `TitleBar.vue`, `EditorTitle.vue`, `Breadcrumbs.vue`, `BottomPanel.vue`, `StatusBar.vue`, a `useSash` composable, `model/panel-state.ts`) and how App.vue state is passed down, provided App.vue stays the state owner and every session-kind branch is preserved (five-kind matrix checked per surface).
- Icon glyph additions to `UiIcon.vue`.
- Token names in `styles.css :root` and their `CANONICAL_TOKENS` registration, provided `verify:semantic-css` passes and every new token has a real consumer.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `App.vue` (~1470 lines) owns session/draft/workspace state, `handleKeydown` (F7, ⌥⇧[ ], ⌥⇧R refresh), viewport media query at 760px, shell dialogs (`shellDialog`), warning stack, `ReviewNotesDialog`, `SupportDialog`, `ChangedFilesDialog`.
- `ChangedFilesDialog.vue` Teleports the single `FileTree` into `#changed-files` (desktop) or `#changed-files-dialog-tree` (narrow); the host must stay `v-show` (v1.6 Teleport stranding bug, `80c3b92`).
- `ReviewToolbar.vue` (Diff/File/Change navigation groups — DEBT-01 containers), `ActiveFileToolbar.vue` (filename, status, counts, Files toggle, Markdown Source/Rendered), `IdentityHeader.vue`, `ShellFooter.vue` — replaced by the new shell parts.
- `monaco/diff-adapter.ts`: `addAction` with `KeyMod.Alt | KeyCode.Enter` already registered on both sub-editors and the single-pane editor — the pattern for new key overrides. `renderSideBySide: true` fixed today.
- `components/ui/UiIcon.vue` (hand-drawn 16px glyphs), `ModalDialog.vue`, `InlineNotice.vue`.
- `styles.css :root` canonical tokens + `theme/token-contract.ts` + `scripts/verify-semantic-css.mjs` `CANONICAL_TOKENS` gate.

### Established Patterns
- Single live-region owner per dynamic outcome; `v-show` for Teleport hosts; roving tabindex in the tree; real-Chromium packaged-binary Playwright evidence.
- Typecheck gate from Phase 19: `npm run typecheck:web` (vue-tsc) must stay at zero errors.

### Integration Points
- `App.vue` template (lines ~1258–1430), `styles.css`, `token-contract.ts`, `verify-semantic-css.mjs`, `diff-adapter.ts`, e2e/integration specs asserting header/toolbar/footer/dialog locators (`pinned-session.spec.ts`, `responsive-session.spec.ts`, `review-notes-dialog.spec.ts`, `complete-review-panel.spec.ts`, `support-dialog.spec.ts`, others — see `.planning/research/ARCHITECTURE.md`).

</code_context>

<specifics>
## Specific Ideas

- Reference renders: `.planning/sketches/001-shell-layout/index.html` tab "S2" and `.kimi-code/skills/sketch-findings-loopnote/sources/`.
- Sashes: 4px hit area, `--interactive-accent-emphasis` on hover/drag, double-click resets; side bar 170–520px; panel 120–520px.
- `role="separator"` with `aria-orientation` and `aria-valuenow` on sashes; toolbars `role="toolbar"` with names.

</specifics>

<deferred>
## Deferred Ideas

- Interactive breadcrumbs (reveal folder in tree) — consider in Phase 21.
- Persisting the inline/side-by-side choice across sessions.

</deferred>
