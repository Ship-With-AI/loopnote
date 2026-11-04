# Requirements: Loopnote

**Defined:** 2026-11-04
**Core Value:** A developer can accurately review repository-grounded changes chosen by a developer or coding agent and return precise, drift-detectable feedback the agent can act on.

## v2.1 Requirements

**Milestone:** v2.1 Workbench Redesign — rebuild the browser review workspace as a VS Code-inspired workbench that gives the diff nearly all the space, keeping Loopnote's palette and every existing review, export, and support behaviour.

**Design source:** sketches 001–004 (`.planning/sketches/`), skill `.kimi-code/skills/sketch-findings-loopnote/`.
**Research:** `.planning/research/SUMMARY.md` (STACK, FEATURES, ARCHITECTURE, PITFALLS).

**Decisions recorded at definition (2026-11-04):** desktop only (below 1050px may regress, recorded as debt); no comment replies (one comment per anchor, draft contract unchanged); per-file viewed tracking deferred; Finish attached review lives in the Export tab and the emphasized status-bar slot; Loopnote shortcuts override Monaco's F7 Diff Review Pane and Alt+Up/Down inside the editor; standalone pill shows "Standalone · N files"; Markdown Source/Rendered is an icon toggle; open threads expanded by default with session-scoped collapse; support entry is a plain status-bar item; typecheck uses `vue-tsc@3.3.14` with `typescript` → `npm:@typescript/typescript6@6.0.2` and `@typescript/native` → `npm:typescript@7.0.2`.

### Typecheck Foundation

- [x] **TYPE-01**: Developer runs one `typecheck:web` script that typechecks every `.vue` component and web `.ts` module (vue-tsc 3.3.14 with the TS 6/7 dual alias), and CI fails on a type error.
- [x] **TYPE-02**: Developer still builds the Node/CLI side with the fast native `tsc`, with unchanged output.

### Design Tokens & Contract

- [x] **TOK-01**: Reviewer sees the workspace rendered with workbench geometry tokens (22px rows, 264px side bar, 32/35/24/22px title, editor-title, breadcrumb, and status heights, 4px control and 6px overlay radius, 20px code line height) over unchanged colour roles, and `npm run verify:semantic-css` passes.
- [ ] **TOK-02**: Contributors read a `DESIGN.md` whose Composition, Geometry, and Components sections describe the shipped workbench, with no review rail or identity header band.

### Workbench Shell

- [x] **SHELL-01**: Reviewer sees a title bar, a files-only side bar, the editor area, a bottom panel, and a status bar, with no activity bar, identity header band, review rail, or footer copy.
- [x] **SHELL-02**: Reviewer can hide and show the side bar (⌘B / Ctrl+B or the title-bar toggle) and resize it by dragging its sash between 170 and 520px; double-clicking the sash resets the width.
- [x] **SHELL-03**: Reviewer can open and close the bottom panel (⌘J / Ctrl+J, the title-bar toggle, or ✕) and resize it by dragging; the panel is closed when a session starts.
- [x] **SHELL-04**: Reviewer's side-bar width and panel height persist across sessions on the same machine.
- [ ] **SHELL-05**: Reviewer keeps every current capability in the new shell for each session kind — committed branch/worktree, exact patch, Staged/Unstaged/Working tree, standalone, and agent-attached — proven by one packaged-binary e2e check per kind.
- [ ] **SHELL-06**: Reviewer never gets page-level horizontal scrolling at viewport widths from 1050 to 1920px; only the diff canvas scrolls horizontally.

### Comparison Identity

- [ ] **IDENT-01**: Reviewer sees the comparison as a pill centred in the title bar: Base → Head with ref names and short SHAs for committed sessions, "Staged" for staged sessions, "Exact patch" for exact-patch sessions, and "Standalone · N files" with the snapshot for standalone sessions.
- [ ] **IDENT-02**: Reviewer can click the pill to open a details popover showing Base, Head, merge base when present, snapshot with capture time, and worktree, with a Copy action; Esc closes it and returns focus to the pill.
- [ ] **IDENT-03**: Reviewer sees a warning state on the pill when the reviewed Head or source moved since capture; the popover explains what moved and makes Refresh its primary action, and no banner takes height from the diff.
- [ ] **IDENT-04**: Reviewer can refresh uncommitted and standalone snapshots from the title bar and the popover with visible progress; exact-patch sessions state that they cannot refresh.

### Changed-Files Tree

- [ ] **TREE-01**: Reviewer sees changed files as a tree with 22px rows, single-child folder chains compacted onto one row, a file-type mark, a status-coloured name, a right-aligned M/A/D letter with line-through for deleted files (status never colour-only), and an open-comment badge.
- [ ] **TREE-02**: Reviewer sees each file's `+N −N` line counts on hover or selection by default.
- [ ] **TREE-03**: Reviewer can open a path filter from the view header that highlights the matched substring, shows "N of M", supports Enter / ↓ / Esc, and shows an empty state when nothing matches.
- [ ] **TREE-04**: Reviewer can switch the changed files between the folder tree and a flat list showing the file name with its dimmed directory.
- [ ] **TREE-05**: Reviewer can choose from a view-options menu whether line counts show always, on hover or selection, or never, and whether comment badges show.
- [ ] **TREE-06**: Reviewer sees totals under the tree (file count and `+X −Y`).
- [ ] **TREE-07**: Reviewer can operate the tree by keyboard — ↑↓ preview, ←→ fold, Home/End, Enter/Space open — with a single tab stop.

### Editor Title & Navigation

- [ ] **NAV-01**: Reviewer sees the file name, M/A/D, and `+/−` counts in the editor title, followed by icon-only actions — previous/next change, previous/next file, inline/side-by-side, and for Markdown files a Source/Rendered toggle — each with a tooltip and accessible name that include its shortcut.
- [ ] **NAV-02**: Reviewer sees breadcrumbs for the current file path above the diff.
- [ ] **NAV-03**: Reviewer can use F7 / ⇧F7 (change) and ⌥↓ / ⌥↑ (file) both with focus in the diff editor and outside it; Monaco's own Diff Review Pane and move-line bindings do not fire for these keys.
- [ ] **NAV-04**: Reviewer still sees the explanation for unsupported, unavailable, and changed-during-capture files in the editor area beneath the normal editor title.

### Comment Threads

- [ ] **THREAD-01**: Reviewer sees every comment on the current file as an inline thread directly under its anchored line, with the opposite side padded so Base and Head stay aligned.
- [ ] **THREAD-02**: Reviewer sees on each thread header the side, line, and an Open, Resolved, or Anchor moved state that is never conveyed by colour alone.
- [ ] **THREAD-03**: Reviewer can resolve, reopen, and delete a thread from its header by mouse or keyboard; delete offers Undo for a few seconds.
- [ ] **THREAD-04**: Reviewer can edit a comment's text inline, saving with ⌘Enter / Ctrl+Enter and cancelling with Esc.
- [ ] **THREAD-05**: Reviewer sees open threads expanded and resolved threads collapsed to a one-line snippet by default, and can collapse or expand one thread or all threads in the current file, with the choice kept for the session.
- [ ] **THREAD-06**: Reviewer can add a comment by hovering a line number, clicking `+`, typing, and pressing ⌘Enter / Ctrl+Enter; durable anchors, including Markdown block ranges, stay byte-identical to the current model.
- [ ] **THREAD-07**: Reviewer can jump to the next or previous thread across files in tree order; the target file opens and the thread scrolls into view.
- [ ] **THREAD-08**: Reviewer's threads keep their position, expanded state, and any in-progress edit text through draft reconciliation and snapshot Refresh.
- [ ] **THREAD-09**: Reviewer sees previous/next-thread and collapse-all-threads icon actions in the editor title, and can use ⌥F9 / ⇧⌥F9 both inside and outside the diff editor.

### Review Panel & Export

- [ ] **PANEL-01**: Reviewer sees in the Comments tab every thread grouped by file with its state icon, first line, and side/line; clicking a row opens the file, expands the thread, and scrolls it into view.
- [ ] **PANEL-02**: Reviewer can edit the overall Markdown summary in the Summary tab with a Saving… / Saved indicator.
- [ ] **PANEL-03**: Reviewer sees in the Export tab a readiness checklist (open and resolved counts, summary state); when any comment's anchor moved, Export stays disabled until the reviewer acknowledges it.
- [ ] **PANEL-04**: Reviewer sees after export a receipt with the `review.md` and `review.json` paths, copy actions, and "Copy agent prompt".
- [ ] **PANEL-05**: Reviewer in an agent-attached session can Finish review from the Export tab behind the same readiness and acknowledgement gate, and the agent receives an unchanged canonical result.

### Status Bar

- [ ] **STAT-01**: Reviewer sees the snapshot ID and the open-comment count, with any stale count in warning ink, in the status bar; clicking the counts opens the Comments tab.
- [ ] **STAT-02**: Reviewer sees exactly one emphasized status-bar item — Export, or Finish review in agent-attached sessions — which opens the Export tab.
- [ ] **STAT-03**: Reviewer can open the voluntary-support dialog from a plain, non-emphasized status-bar item, and support never gates any review action.

### Accessibility & Regression

- [ ] **A11Y-01**: Assistive-technology users reach each toolbar control group by role and name (`getByRole('toolbar' | 'group', { name })`), closing DEBT-01.
- [ ] **A11Y-02**: Keyboard users can operate every popover and menu, close it with Esc, and get focus returned; each dynamic change (panel tab, thread action, refresh result, export result) is announced by exactly one live region.
- [ ] **A11Y-03**: Maintainers see the packaged-binary Playwright and integration suites pass against the workbench, with any locator a phase breaks updated within that same phase.

## Future Requirements

Deferred, tracked but not in the v2.1 roadmap.

- **DEFER-01** (carried from v1.6): Per-file viewed tracking — persisted draft field, status-bar viewed count, tree viewed marks.
- **REPLY-01**: Threaded replies with per-reply timestamps (requires relaxing the one-comment-per-anchor draft invariant and a new export schema version).
- **NARROW-01**: Workbench layout below 1050px, including phone widths (side bar and panel as overlays).
- **TREE-08**: Tree virtualization for very large change sets, if fixture testing shows it is needed.
- **TREE-09**: Highlight-versus-filter modes for the tree filter.
- **DEFER-02** (carried from v1.6): Change-position indicator ("3 of 12").
- **ACC-04** (carried from v1.5): Restore propagates a false RPC result as non-completion; close verified-support acceptance with a genuine live entitlement.
- Marketplace `SKILL.md` still installs `@1.5.0`; correcting it needs a separate marketplace publication.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Activity bar | One side-bar view; 48px of permanent chrome with no navigation value (sketch 001) |
| Review view in the side bar | Duplicates the Comments tab and is too narrow for summary and export (sketch 004 B) |
| Finish-review modal overlay | Reading and finishing must coexist (sketch 004 C) |
| VS Code Dark Modern palette or blue status bar | VS Code-inspired, not a clone; Loopnote colour roles are unchanged |
| New runtime dependencies | Icons, sashes, popovers, and tree are built on existing Vue/Monaco/CSS (STACK.md) |
| Draft or export schema changes | Replies and viewed tracking are deferred; V1–V6 exports stay byte-compatible |
| Agent stdin protocol changes | Surface redesign only; the agent contract is unchanged |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TYPE-01 | Phase 19 | Complete |
| TYPE-02 | Phase 19 | Complete |
| TOK-01 | Phase 20 | Complete |
| TOK-02 | Phase 25 | Pending |
| SHELL-01 | Phase 20 | Complete |
| SHELL-02 | Phase 20 | Complete |
| SHELL-03 | Phase 20 | Complete |
| SHELL-04 | Phase 20 | Complete |
| SHELL-05 | Phase 20 | Pending |
| SHELL-06 | Phase 20 | Pending |
| IDENT-01 | Phase 22 | Pending |
| IDENT-02 | Phase 22 | Pending |
| IDENT-03 | Phase 22 | Pending |
| IDENT-04 | Phase 22 | Pending |
| TREE-01 | Phase 21 | Pending |
| TREE-02 | Phase 21 | Pending |
| TREE-03 | Phase 21 | Pending |
| TREE-04 | Phase 21 | Pending |
| TREE-05 | Phase 21 | Pending |
| TREE-06 | Phase 21 | Pending |
| TREE-07 | Phase 21 | Pending |
| NAV-01 | Phase 20 | Pending |
| NAV-02 | Phase 20 | Pending |
| NAV-03 | Phase 20 | Pending |
| NAV-04 | Phase 20 | Pending |
| THREAD-01 | Phase 23 | Pending |
| THREAD-02 | Phase 23 | Pending |
| THREAD-03 | Phase 23 | Pending |
| THREAD-04 | Phase 23 | Pending |
| THREAD-05 | Phase 23 | Pending |
| THREAD-06 | Phase 23 | Pending |
| THREAD-07 | Phase 23 | Pending |
| THREAD-08 | Phase 23 | Pending |
| THREAD-09 | Phase 23 | Pending |
| PANEL-01 | Phase 24 | Pending |
| PANEL-02 | Phase 24 | Pending |
| PANEL-03 | Phase 24 | Pending |
| PANEL-04 | Phase 24 | Pending |
| PANEL-05 | Phase 24 | Pending |
| STAT-01 | Phase 22 | Pending |
| STAT-02 | Phase 22 | Pending |
| STAT-03 | Phase 22 | Pending |
| A11Y-01 | Phase 25 | Pending |
| A11Y-02 | Phase 25 | Pending |
| A11Y-03 | Phase 25 | Pending |

**Coverage:**

- v2.1 requirements: 45 total
- Mapped to phases: 45/45 (zero orphans, zero duplicates)

---
*Last updated: 2026-11-04 at v2.1 roadmap revision (Phases 19–25; THREAD-09 split from NAV-01/NAV-03, TOK-01 merged into Shell Frame)*
