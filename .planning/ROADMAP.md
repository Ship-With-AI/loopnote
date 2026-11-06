# Roadmap: Loopnote

## Milestones

- **[v1.0 MVP](./milestones/v1.0-ROADMAP.md)** — Phases 01–04.1, 40 plans, shipped 2026-07-24.
- **[v1.1 GitHub Dark Diff](./milestones/v1.1-ROADMAP.md)** — Phases 05–08, 16 plans, 18/18 requirements, shipped 2026-07-29.
- **[v1.2 Fast Source Discovery](./milestones/v1.2-ROADMAP.md)** — Phases 09–11, 4 plans, 5/5 requirements, shipped 2026-07-30.
- **[v1.3 Agent Review Handoff](./milestones/v1.3-ROADMAP.md)** — Phases 12–15, 14 plans, 42 tasks, 17/17 requirements, shipped 2026-08-06.
- **[v1.4 Voluntary Support](./milestones/v1.4-ROADMAP.md)** — Phases 01–02, 22 plans, 30 tasks, 12/12 requirements, shipped 2026-09-04.
- **[v1.5 MIT Distribution](./milestones/v1.5-ROADMAP.md)** — Phases 03–07, 23 plans, 69 tasks, 18/19 requirements (ACC-04 blocked), shipped 2026-09-15.
- **[v1.6 Workspace Restyle](./milestones/v1.6-ROADMAP.md)** — Phases 08–12, 31 plans, 24/24 requirements, shipped 2026-09-14 (`tech_debt`: DEBT-01 accepted).
- **[v2.0 Artifact Review](./milestones/v2.0-ROADMAP.md)** — Phases 13–18 (incl. 17.1), 70 plans, 196 tasks, 35/35 requirements, shipped 2026-11-04 (no milestone audit; 4 verification items deferred — see `STATE.md`).
- 🚧 **v2.1 Workbench Redesign** — Phases 19–25, 45 requirements mapped (in progress, revised 2026-11-04).

## Overview

**Active milestone: v2.1 Workbench Redesign.** Loopnote `2.0.0` is `latest` on npm as
`@shipwithai/loopnote`. v2.1 rebuilds the browser review workspace as a VS Code-inspired
workbench — a title bar with a Base→Head identity pill, a resizable files-only side bar, an
Explorer-density changed-files tree, icon-only editor-title actions with breadcrumbs, inline
Monaco view-zone comment threads, and a ⌘J bottom panel (Comments / Summary / Export) — over the
unchanged Loopnote colour palette, keeping every existing review, export, and support behaviour.
Design source: sketches 001–004, skill `sketch-findings-loopnote`
(`.kimi-code/skills/sketch-findings-loopnote/`).

Integer phases continue from v2.0 (ended at Phase 18); v2.1 runs Phases 19–25 (Typecheck
Foundation → Shell Frame → Changed-Files Tree → Identity & Status Bar → Inline Comment Threads →
Bottom Panel & Export → Accessibility, Design Docs & Regression Sweep). Phase 19 is ready to plan
— see `STATE.md` Current Position. **Cross-cutting constraint:** any Playwright/integration
locator a phase's renames break must be updated within that same phase (tracked by A11Y-03,
closed in Phase 25); DEBT-01 in the Backlog below is scheduled as A11Y-01 in Phase 25. Thread
navigation (previous/next thread, collapse-all, ⌥F9/⇧⌥F9) ships with the thread phase (23), not
the shell.

## Phases

### 🚧 v2.1 Workbench Redesign

**Phase Numbering:** Integer phases continue from v2.0 (ended at Phase 18); v2.1 starts at Phase 19.

- [x] **Phase 19: Typecheck Foundation** - One `typecheck:web` gate (vue-tsc 3.3.14 + TS 6/7 dual alias) covers every `.vue` component and web `.ts` module before any App.vue decomposition begins. (completed 2026-11-04)
- [x] **Phase 20: Shell Frame** - Workbench geometry tokens land together with the existing toolbar/tree/diff/dialog components as they're re-plumbed into `WorkbenchShell.vue`'s five regions (title bar, side bar, editor with icon-only title/breadcrumbs, bottom panel, status bar) across all five session kinds. (completed 2026-11-04)
- [x] **Phase 21: Changed-Files Tree** - The changed-files tree is restyled to VS Code Explorer density with hover counts, a path filter, a view-options menu, and full keyboard reachability. (completed 2026-11-05)
- [x] **Phase 22: Identity & Status Bar** - Comparison identity and drift relocate into a title-bar pill/popover; the status bar carries snapshot/comment counts, one emphasized Export/Finish item, and the support entry. (completed 2026-11-05)
- [x] **Phase 23: Inline Comment Threads** - A multi-zone Monaco adapter rework renders every comment as an expanded-by-default view-zone thread with its own editor-title navigation icons and ⌥F9/⇧⌥F9 shortcuts, gated by an explicit pointer/keyboard go/no-go spike. (completed 2026-11-05)
- [x] **Phase 24: Bottom Panel & Export** - Comments/Summary/Export live in the ⌘J bottom panel, including the agent-attached Finish action behind the export readiness gate. (completed 2026-11-06)
- [ ] **Phase 25: Accessibility, Design Docs & Regression Sweep** - A toolbar role/name audit closes DEBT-01, every popover/menu/live-region is keyboard-accessible, the full suite passes with same-phase locator updates, and `DESIGN.md` describes the shipped workbench.

<details>
<summary>✅ v2.0 Artifact Review (Phases 13–18) — SHIPPED 2026-11-04</summary>

- [x] Phase 13: Single-Pane File Rendering (5/5 plans) — completed 2026-10-30
- [x] Phase 14: Uncommitted Source Review & Frozen Snapshots (16/16 plans) — completed 2026-10-31 (human_needed: terminal `r` refresh TTY check deferred)
- [x] Phase 15: Standalone File Review (8/8 plans) — completed 2026-10-31
- [x] Phase 16: Rendered Markdown Preview (8/8 plans) — completed 2026-10-31
- [x] Phase 17: Agent Protocol Extension & Marketplace Skill (5/5 plans) — completed 2026-10-31 (human_needed: multi-file drift-paths test deferred)
- [x] Phase 17.1: Full Project Rename (INSERTED) (23/23 plans) — completed 2026-11-02
- [x] Phase 18: Product Repositioning Copy (5/5 plans) — completed 2026-11-02

Full details: [`milestones/v2.0-ROADMAP.md`](./milestones/v2.0-ROADMAP.md).

</details>

## Phase Details

### Phase 19: Typecheck Foundation

**Goal**: Developer gets one working whole-codebase type-check gate before any `.vue` restructuring begins, so decomposition in later phases is caught by tooling instead of shipping untyped.
**Depends on**: Nothing new (first phase of v2.1; extends the shipped v2.0 build)
**Requirements**: TYPE-01, TYPE-02
**Success Criteria** (what must be TRUE):

  1. Developer runs `npm run typecheck:web` (vue-tsc 3.3.14 with the TS 6/7 dual alias) and it typechecks every `.vue` component and web `.ts` module, not just the prior seven-file allowlist.
  2. CI fails the build when `typecheck:web` reports a type error, proven by deliberately introducing a bad prop type and confirming the gate fails rather than passing trivially.
  3. The Node/CLI side still builds through the fast native `tsc` with unchanged output.

**Plans**: 4/4 plans complete
**Wave 1**

- [x] 19-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-02-PLAN.md
- [x] 19-03-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-04-PLAN.md

### Phase 20: Shell Frame

**Goal**: Reviewers see the whole workspace recomposed into a VS Code-shaped shell — title bar, files-only side bar, editor (icon-only title actions and breadcrumbs), bottom panel, status bar — built directly on the new workbench geometry token root, with every existing capability preserved across all five session kinds, before thread, identity, or tree internals are restyled.
**Depends on**: Phase 19
**Requirements**: TOK-01, SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, SHELL-06, NAV-01, NAV-02, NAV-03, NAV-04
**Success Criteria** (what must be TRUE):

  1. Reviewer sees the workspace rendered with workbench geometry tokens (22px rows, 264px side bar, 32/35/24/22px title/editor-title/breadcrumb/status heights, 4px control and 6px overlay radius, 20px code line height) over unchanged colour roles, and `npm run verify:semantic-css` passes.
  2. Reviewer sees a title bar, a files-only side bar, an editor area (file name/M/A/D/`+/−` counts plus icon-only actions — prev/next change, prev/next file, inline/side-by-side, and for Markdown a Source/Rendered toggle, each with a tooltip and accessible name naming its shortcut — and breadcrumbs above the diff), a bottom panel, and a status bar, with the old identity header band, review rail, footer copy, and activity bar gone.
  3. Reviewer can hide/show and resize the side bar (⌘B / Ctrl+B, drag sash 170–520px, double-click reset) and open/close/resize the bottom panel (⌘J / Ctrl+J, closed when a session starts); both the side-bar width and panel height persist across sessions on the same machine.
  4. A packaged-binary e2e check passes for each of the five session kinds — committed branch/worktree, exact patch, Staged/Unstaged/Working tree, standalone, and agent-attached — proving the new shell kept every current capability per kind.
  5. No viewport width from 1050 to 1920px produces page-level horizontal scroll (only the diff canvas scrolls horizontally), and Loopnote's own F7/⇧F7 (change) and ⌥↓/⌥↑ (file) shortcuts fire both inside and outside the diff editor while Monaco's native Diff Review Pane and Move-Line bindings stay suppressed inside it; reviewer still sees the explanation for unsupported/unavailable/changed-during-capture files beneath the editor title.

**Plans:** 10/10 plans complete

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — `model/panel-state.ts`: clamped localStorage persistence for side-bar width/visibility and panel height (TDD)
- [x] 20-02-PLAN.md — Monaco `addAction` overrides for F7/⇧F7/⌥↑/⌥↓ on all three editor instances, plus a runtime `setRenderSideBySide` adapter method
- [x] 20-03-PLAN.md — Token root migration + `TitleBar.vue` + `StatusBar.vue`

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 20-04-PLAN.md — `EditorTitle.vue` (folds ReviewToolbar/ActiveFileToolbar) + `Breadcrumbs.vue`

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 20-05-PLAN.md — `useSash.ts` composable + `WorkbenchShell.vue` grid host (both sashes, Teleport host relocation)
- [x] 20-06-PLAN.md — `BottomPanel.vue` (un-wraps ReviewNotesDialog) + review-notes-dialog.spec.ts rewrite

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 20-07-PLAN.md — `App.vue` integration: wires every new component, deletes superseded ones, rewrites handleKeydown

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 20-08-PLAN.md — packaged-binary shell smoke spec, one case per session kind (SHELL-05)
- [x] 20-09-PLAN.md — fixes every broken Playwright/integration locator across the six affected spec files 20-07's draft enumerated (A11Y-03)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 20-10-PLAN.md — fixes the remaining Review-notes/BottomPanel and .changed-files-sidebar locator breakage an exhaustive repo-wide grep sweep found across six more spec files, including the custody-gated agent-ready-export.spec.ts (A11Y-03)

**UI hint**: yes

### Phase 21: Changed-Files Tree

**Goal**: The changed-files tree reaches VS Code Explorer density while staying fully keyboard-reachable.
**Depends on**: Phase 20
**Requirements**: TREE-01, TREE-02, TREE-03, TREE-04, TREE-05, TREE-06, TREE-07
**Success Criteria** (what must be TRUE):

  1. Reviewer sees 22px rows with single-child folder chains compacted onto one row, a file-type mark, a status-coloured name, a right-aligned non-colour-only M/A/D letter (line-through for deleted), and an open-comment badge.
  2. Reviewer sees `+N −N` counts on hover or selection by default and can change that behaviour — always / hover-or-selection / never, plus a comment-badge toggle — from a keyboard-reachable view-options menu.
  3. Reviewer can open a path filter that highlights the matched substring, shows "N of M", supports Enter/↓/Esc, and shows an empty state, and can switch between the folder tree and a flat list with dimmed directories.
  4. Reviewer sees file count and `+X −Y` totals under the tree.
  5. Reviewer operates the entire tree by keyboard — ↑↓ preview, ←→ fold, Home/End, Enter/Space open — through a single tab stop, proven with real-browser Tab/Arrow-key evidence across compact-folder-chain rows.

**Plans**: 0/4 plans executed
**Wave 1**

- [x] 21-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-02-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 21-03-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 21-04-PLAN.md

**UI hint**: yes

### Phase 22: Identity & Status Bar

**Goal**: Already-shipped comparison-identity and drift-detection logic relocates into a title-bar pill/popover, and the status bar carries snapshot/comment-count/Export/support entry points, including the agent-attached Finish action in its one emphasized slot.
**Depends on**: Phase 20
**Requirements**: IDENT-01, IDENT-02, IDENT-03, IDENT-04, STAT-01, STAT-02, STAT-03
**Success Criteria** (what must be TRUE):

  1. Reviewer sees a centred title-bar pill reading Base→Head with ref names and short SHAs for committed sessions, "Staged" for staged sessions, "Exact patch" for exact-patch sessions, and "Standalone · N files" for standalone sessions, and can click it to open a details popover (Base, Head, merge base when present, snapshot with capture time, worktree, Copy; Esc closes and returns focus to the pill).
  2. Reviewer sees a warning pill state when the reviewed Head or source moved since capture, with the popover explaining what moved and making Refresh its primary action, and no banner taking height from the diff.
  3. Reviewer can refresh uncommitted and standalone snapshots from the title bar and the popover with visible progress; exact-patch sessions correctly state they cannot refresh.
  4. Reviewer sees the snapshot ID and open-comment count (stale count in warning ink) in the status bar, where clicking the counts opens the Comments tab, and sees exactly one emphasized status-bar item — Export, or Finish review in agent-attached sessions — that opens the Export tab.
  5. Reviewer can open the voluntary-support dialog from a plain, non-emphasized status-bar item, and support never gates any review action.

**Plans**: 4/4 plans complete
**Wave 1**

- [x] 22-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-02-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 22-03-PLAN.md
- [x] 22-04-PLAN.md

**UI hint**: yes

### Phase 23: Inline Comment Threads

**Goal**: Comments render as expanded-by-default Monaco view-zone threads directly under their anchored line, reachable by pointer, keyboard, and dedicated editor-title navigation icons/shortcuts, surviving draft reconciliation and Refresh without losing scroll position or in-progress edits — gated by an explicit go/no-go spike before the full multi-zone rework is built.
**Depends on**: Phase 20
**Requirements**: THREAD-01, THREAD-02, THREAD-03, THREAD-04, THREAD-05, THREAD-06, THREAD-07, THREAD-08, THREAD-09
**Success Criteria** (what must be TRUE):

  1. A go/no-go spike proves Monaco content widgets layered over view zones reliably receive both pointer clicks and keyboard input before any thread UI is built on top of the approach; if the spike fails, the interaction model is re-planned before further work proceeds.
  2. Reviewer sees every comment on the current file as an inline thread directly under its anchored line, with the opposite side padded so Base and Head stay aligned, and a header showing side, line, and a non-colour-only Open/Resolved/Anchor-moved state.
  3. Reviewer can resolve, reopen, and delete (with a few seconds of Undo) a thread, and edit a comment's text inline (⌘Enter/Ctrl+Enter save, Esc cancel), by mouse or keyboard.
  4. Reviewer sees open threads expanded and resolved threads collapsed to a one-line snippet by default, and can collapse or expand one thread or every thread in the current file, with the choice kept for the session.
  5. Reviewer sees previous/next-thread and collapse-all-threads icon actions in the editor title and can use ⌥F9/⇧⌥F9 both inside and outside the diff editor to jump across files in tree order; comments can be added from the gutter `+`, and threads keep their position, expanded state, and any in-progress edit text through draft reconciliation and snapshot Refresh, with durable anchors (including Markdown block ranges) staying byte-identical to the current model.

**Plans**: 8/8 plans complete
**Wave 1**

- [x] 23-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md
- [x] 23-03-PLAN.md
- [x] 23-04-PLAN.md
- [x] 23-06-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 23-05-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 23-07-PLAN.md

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 23-08-PLAN.md

**UI hint**: yes

### Phase 24: Bottom Panel & Export

**Goal**: Comments, the overall summary, and export live in a ⌘J bottom panel that stays closed while reading, relocating already-shipped summary/export components and giving agent-attached sessions their Finish action behind the unchanged export-readiness gate.
**Depends on**: Phase 20, Phase 22, Phase 23
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05
**Success Criteria** (what must be TRUE):

  1. Reviewer sees the Comments tab list every thread grouped by file with its state icon, first line, and side/line; clicking a row opens the file, expands the thread, and scrolls it into view.
  2. Reviewer can edit the overall Markdown summary in the Summary tab with a Saving…/Saved indicator.
  3. Reviewer sees an Export tab readiness checklist (open and resolved counts, summary state) that stays disabled until any comment with a moved anchor is acknowledged, and sees the post-export receipt (`review.md`/`review.json` paths, copy actions, "Copy agent prompt").
  4. Reviewer in an agent-attached session can Finish review from the Export tab behind the same readiness/acknowledgement gate, and the agent still receives an unchanged canonical result.

**Plans**: 11/11 plans complete
**Wave 1**

- [x] 24-01-PLAN.md
- [x] 24-02-PLAN.md
- [x] 24-03-PLAN.md
- [x] 24-04-PLAN.md
- [x] 24-05-PLAN.md
- [x] 24-06-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 24-07-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 24-08-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 24-09-PLAN.md

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 24-10-PLAN.md
- [x] 24-11-PLAN.md

**UI hint**: yes

### Phase 25: Accessibility, Design Docs & Regression Sweep

**Goal**: Every toolbar control group becomes reachable by role and name, every popover/menu/live-region is keyboard-accessible, the full packaged-binary suite passes with each phase's own locator updates already in place, and `DESIGN.md` is rewritten to describe the shipped workbench.
**Depends on**: Phase 21, Phase 22, Phase 23, Phase 24
**Requirements**: TOK-02, A11Y-01, A11Y-02, A11Y-03
**Success Criteria** (what must be TRUE):

  1. Assistive-technology users reach every toolbar control group — title bar, side bar, editor title, bottom panel, status bar — by `getByRole('toolbar' | 'group', { name })`, closing DEBT-01.
  2. Keyboard users can operate every popover and menu, close it with Esc, and get focus returned; each dynamic change (panel tab, thread action, refresh result, export result) is announced by exactly one live region.
  3. The full packaged-binary Playwright and integration suites pass against the finished workbench, with every locator any Phase 19–24 rename broke already updated within that same phase rather than deferred here.
  4. Contributors read a `DESIGN.md` whose Composition, Geometry, and Components sections describe the shipped workbench, with no mention of the review rail or identity header band.

**Plans**: 0/5 plans executed
**Wave 1**

- [ ] 25-01-PLAN.md
- [ ] 25-02-PLAN.md
- [ ] 25-03-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 25-05-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 25-04-PLAN.md

**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. Single-Pane File Rendering | v2.0 | 5/5 | Complete | 2026-10-30 |
| 14. Uncommitted Source Review & Frozen Snapshots | v2.0 | 16/16 | Complete | 2026-10-31 |
| 15. Standalone File Review | v2.0 | 8/8 | Complete | 2026-10-31 |
| 16. Rendered Markdown Preview | v2.0 | 8/8 | Complete | 2026-10-31 |
| 17. Agent Protocol Extension & Marketplace Skill | v2.0 | 5/5 | Complete | 2026-10-31 |
| 17.1. Full Project Rename | v2.0 | 23/23 | Complete | 2026-11-02 |
| 18. Product Repositioning Copy | v2.0 | 5/5 | Complete | 2026-11-02 |
| 19. Typecheck Foundation | v2.1 | 4/4 | Complete    | 2026-11-04 |
| 20. Shell Frame | v2.1 | 10/10 | Complete    | 2026-11-04 |
| 21. Changed-Files Tree | v2.1 | 4/4 | Complete    | 2026-11-05 |
| 22. Identity & Status Bar | v2.1 | 4/4 | Complete    | 2026-11-05 |
| 23. Inline Comment Threads | v2.1 | 8/8 | Complete    | 2026-11-05 |
| 24. Bottom Panel & Export | v2.1 | 11/11 | Complete    | 2026-11-06 |
| 25. Accessibility, Design Docs & Regression Sweep | v2.1 | 0/5 | Planned    |  |

## Backlog

Items accepted as debt at a milestone close, or deferred from a milestone's scope. Each is
scheduled by the next milestone that touches the same surface, not automatically.

### Carried forward from v1.5

Recorded in `./milestones/v1.5-ROADMAP.md` and `./milestones/v1.5-REQUIREMENTS.md`. The next
milestone can decide explicitly whether to adopt them:

- **ACC-04** — verified-support acceptance unreachable until Restore stops completing on a
  false RPC result (`supabase/functions/support-flow/index.ts`) and a permitted genuine
  live entitlement exists. Fix the defect first, then rerun only the verified-state portions
  on global, npx, marketplace paths.

- `SKILL.md` still installs `@1.5.0` and claims only 1.5.0 was independently release
  verified; correcting it needs a separate marketplace publication.

- **`.vue` files remain outside every typechecker.** `tsconfig.web.json` uses a `files` array
  of seven `.ts` entries, so `npm run typecheck:web` covers zero components and exits in under a
  second. **Corrected 2026-09-15:** `vue-tsc` cannot close this gap as installed —
  `vue-tsc@3.3.7` resolves `typescript/lib/tsc` at startup but `typescript@7.0.2` no longer
  exposes that subpath, so it dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` before reading any
  config. Closing this gap needs a TypeScript/vue-tsc pairing decision, not just an npm script.

### Accepted debt from v1.6

- **DEBT-01** (v1.6 milestone audit D-01, owner: the surface that next touches the review
  toolbar) — Reviewers using assistive technology cannot reach the diff-navigation and review-toolbar
  control groups by role and name. Three layout containers in
  `src/web/components/ReviewToolbar.vue` carry `aria-label` without a queryable `role`, so
  `getByRole('group', { name: 'Diff navigation' })` resolves to `generic` and cannot reach them:
  `:20` (`Diff navigation`), `:22` (`File navigation`), `:47` (`Change navigation`).
  `getByRole('group'` appears zero times in `tests/`. Pre-existing, not a v1.6 regression —
  `12-UI-SPEC.md:182` deliberately scoped this fix out of Phase 12. Accepted at v1.6 close.
  **Re-scoped 2026-09-15:** was four containers; quick task `260915-jbv` deleted the fourth
  (`review-toolbar__group--actions`) along with the Review and Keyboard help buttons.
  **Scheduled in v2.1 as A11Y-01** (Phase 25: Accessibility, Design Docs & Regression Sweep).

### Deferred from v1.6 scope

Mockup affordances deliberately excluded from v1.6; full rationale in
`./milestones/v1.6-REQUIREMENTS.md`.

- **DEFER-01** — Per-file viewed tracking with viewed marks, an Unviewed filter, and
  "N of M viewed" progress. Requires a new persisted draft field.

- **DEFER-02** — Change-to-change (hunk) jump navigation with a position indicator.
- **DEFER-03** — A wrap-lines toggle for the diff surface.
- **DEFER-04** — Composited WCAG contrast re-verification of the re-derived palette, plus the
  rest of the v1.1 accessibility gate battery (forced colors, 320px, true 400% zoom).

### Reopened

- **File-metadata orphan** — `GET /api/files/:fileId` and `SessionClient.getFileMetadata()` have
  no caller again. Originally a v1.0 debt item; v1.6 recorded it resolved because the Details
  dialog became its first real consumer. Quick task `260915-jbv` removed that dialog, so the
  route and client method are dead code once more. Either retire both or give them an
  intentional consumer.
