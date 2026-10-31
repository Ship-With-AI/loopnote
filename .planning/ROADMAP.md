# Roadmap: Cumpa

## Milestones

- **[v1.0 MVP](./milestones/v1.0-ROADMAP.md)** — Phases 01–04.1, 40 plans, shipped 2026-07-24.
- **[v1.1 GitHub Dark Diff](./milestones/v1.1-ROADMAP.md)** — Phases 05–08, 16 plans, 18/18 requirements, shipped 2026-07-29.
- **[v1.2 Fast Source Discovery](./milestones/v1.2-ROADMAP.md)** — Phases 09–11, 4 plans, 5/5 requirements, shipped 2026-07-30.
- **[v1.3 Agent Review Handoff](./milestones/v1.3-ROADMAP.md)** — Phases 12–15, 14 plans, 42 tasks, 17/17 requirements, shipped 2026-08-06.
- **[v1.4 Voluntary Support](./milestones/v1.4-ROADMAP.md)** — Phases 01–02, 22 plans, 30 tasks, 12/12 requirements, shipped 2026-09-04.
- **[v1.5 MIT Distribution](./milestones/v1.5-ROADMAP.md)** — Phases 03–07, 23 plans, 69 tasks, 18/19 requirements (ACC-04 blocked), shipped 2026-09-15.
- **[v1.6 Workspace Restyle](./milestones/v1.6-ROADMAP.md)** — Phases 08–12, 31 plans, 24/24 requirements, shipped 2026-09-14 (`tech_debt`: DEBT-01 accepted).

## Overview

**Active milestone: v2.0 Artifact Review.** Cumpa is published on npm as `@shipwithai/cumpa` under standard MIT
terms, installable globally, through `npx`, or via the public marketplace skill, with SLSA
provenance on every release. The browser review workspace was restyled in v1.6 to the
approved mockup composition, then further reduced by two post-close quick tasks — see the v1.6
entry in `MILESTONES.md` for what the running app does that its archive does not describe.

v1.5 and v1.6 were developed and closed on separate branches and reconciled when `restyle`
merged into `main`; v1.5's archive and the 1.5.2 release are authoritative for distribution,
v1.6's for the workspace surface.

v2.0 brings working-tree review into scope — previously Out of Scope, now superseding the
"committed Git objects only" decision for worktree sources, with frozen session snapshots
keeping the drift-detectable guarantee. It delivers: single-pane rendering for entirely
added/deleted files; Staged/Unstaged/Working-tree review against any base from a frozen,
explicitly-refreshable snapshot; standalone file/glob review outside any diff; a rendered
Markdown preview toggle; an agent stdin protocol and marketplace skill extended to
uncommitted/standalone requests; and a product-copy repositioning from "code review" to
"agent artifact review," landed last so copy never overclaims ahead of what ships. Phases
13–18 below deliver it in that dependency order.

Start the next milestone with `/gsd:new-milestone` once v2.0 ships; it defines fresh
requirements and a new roadmap. The Backlog below remains its input, alongside anything
deferred from v2.0.

## Phases

**Phase Numbering:**

- Integer phases continue from the last shipped milestone (v1.6 ended at Phase 12); v2.0 starts at Phase 13.
- Decimal phases (13.1, 13.2, …) are urgent insertions, not planned here.

- [x] **Phase 13: Single-Pane File Rendering** - Added/deleted files render as one full-width commentable pane instead of a diff with an empty side. (completed 2026-10-30)
- [x] **Phase 14: Uncommitted Source Review & Frozen Snapshots** - Staged/Unstaged/Working-tree review against any base, frozen at session start with explicit, comment-safe Refresh. (completed 2026-10-30)
- [x] **Phase 15: Standalone File Review** - Named files/globs open and review full width without choosing Base/Head. (completed 2026-10-31)
- [ ] **Phase 16: Rendered Markdown Preview** - Any Markdown file toggles between source and rendered view with block-anchored commenting.
- [ ] **Phase 17: Agent Protocol Extension & Marketplace Skill** - Agents request uncommitted/standalone review over stdin and through the marketplace skill with versioned exports.
- [ ] **Phase 18: Product Repositioning Copy** - README, npm page, CLI copy, and workspace text describe artifact review, not only code diffs.

## Phase Details

### Phase 13: Single-Pane File Rendering

**Goal**: Reviewers see files that are entirely added or entirely deleted as one full-width pane instead of a diff with an empty side, and can tell single-pane files apart from side-by-side ones without relying on color.
**Depends on**: Nothing new (extends the shipped v1.6 Monaco diff adapter)
**Requirements**: PANE-01, PANE-02, PANE-03
**Success Criteria** (what must be TRUE):

  1. Reviewer opens an added file and sees its entire content in one full-width pane with no empty Base side, and can comment on any line (anchored to Head).
  2. Reviewer opens a deleted file and sees its entire removed content in one full-width pane with no empty Head side, and can comment on any line (anchored to Base).
  3. Reviewer can tell, from the file header and file tree without relying on color, which files are single-pane (entirely added/deleted) versus side-by-side (modified, renamed, copied).

**Plans**: 5/5 plans complete
Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Single-pane Monaco editor adapter (unpaired comment-anchor/view-zone wiring)
- [x] 13-02-PLAN.md — Single-pane layout/type-changed-label pure functions; SessionFileSchema oldMode field

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 13-03-PLAN.md — Wire single-pane layout through App.vue, DiffWorkspace.vue, ReviewToolbar.vue
- [x] 13-04-PLAN.md — StatusBadge/FileRow/ActiveFileToolbar header and tree single-pane markers

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 13-05-PLAN.md — Playwright e2e coverage for added/deleted single-pane flows

**UI hint**: yes

### Phase 14: Uncommitted Source Review & Frozen Snapshots

**Goal**: Developers can review Staged, Unstaged, or Working-tree changes against HEAD or any chosen base from a frozen snapshot, trust that drafts and comments stay correctly scoped to the exact reviewed content, and explicitly refresh to a new snapshot with every comment reclassified.
**Depends on**: Phase 13 (reuses single-pane rendering for uncommitted added/deleted files)
**Requirements**: WTREE-01, WTREE-02, WTREE-03, WTREE-04, WTREE-05, SNAP-01, SNAP-02, SNAP-03, SNAP-04, SNAP-05
**Success Criteria** (what must be TRUE):

  1. User picks Staged, Unstaged, or Working tree as the Head source at launch; Working-tree sessions show untracked files as added (excluding paths ignored by `.gitignore`, `.git/info/exclude`, and the global excludes file), while `.cumpa/` content, symlink targets, submodule internals, binary, and oversized files stay listed as non-reviewable.
  2. User reviewing an uncommitted source compares against HEAD by default, or against any chosen local branch or registered worktree as Base, and sees changes from their merge base.
  3. User's review stays frozen at the bytes captured when the session started — later file edits don't change what's displayed — and the user is told explicitly if a file changed mid-capture instead of being shown a mixed or partial version as if it were consistent.
  4. User triggers Refresh to capture a new snapshot of the same source and scope, and sees a summary of which files were added, removed, or modified since the previous snapshot.
  5. After Refresh, every existing comment is reclassified as current, stale, or orphaned with its recorded evidence intact and never moved to a different line; two different working-tree states against the same base never share or overwrite a draft.

**Plans**: 15/16 plans executed

- [x] 14-14-PLAN.md
- [x] 14-15-PLAN.md
- [x] 14-16-PLAN.md

- [x] 14-01-PLAN.md — Extract shared snapshot-fs.ts file-IO primitives from patch-snapshot.ts
- [x] 14-02-PLAN.md — UncommittedScopeSchema, changed-during-capture availability reason, UncommittedDraftComparisonSchema
- [x] 14-03-PLAN.md — uncommittedReviewKey() draft/anchor identity hash
- [x] 14-04-PLAN.md — worktree-inventory.ts: Staged/Unstaged/Working-tree file-set discovery
- [x] 14-05-PLAN.md — worktree-content.ts: CRLF-safe content resolution + synthetic blobOid
- [x] 14-06-PLAN.md — CLI picker: Uncommitted group, HEAD-preselected Base flow
- [x] 14-07-PLAN.md — worktree-snapshot.ts: torn-capture retry, index-race guard, refresh()
- [x] 14-08-PLAN.md — Server session wiring: capability registry, /api/refresh, relaunch recovery
- [x] 14-09-PLAN.md — CLI flags (--staged/--unstaged/--worktree/--base), launch wiring, 'r' refresh
- [x] 14-10-PLAN.md — IdentityHeader.vue: comparison strip, Refresh button, change indicator
- [x] 14-11-PLAN.md — InlineNotice dismissible prop, FileRow markers, RefreshSummaryPanel.vue
- [x] 14-12-PLAN.md — App.vue integration: empty state, banner, polling, shortcuts, export gating
- [x] 14-13-PLAN.md — Playwright e2e coverage: picker/Refresh/reclassify/summary-panel flows

**UI hint**: yes
**Research flag**: yes — content-digest key derivation for uncommitted drafts/anchors (Pitfall 1), CRLF/filter normalization between index and worktree reads, and torn-snapshot/race detection design need verification during planning, per `research/SUMMARY.md`.

### Phase 15: Standalone File Review

**Goal**: Users can open specific files or globs directly — tracked or untracked, changed or unchanged — without choosing Base/Head, review them full width, and finish with an export that proves exactly what was reviewed.
**Depends on**: Phase 13 (single-pane rendering), Phase 14 (frozen-snapshot/Refresh mechanism)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, FILE-05
**Success Criteria** (what must be TRUE):

  1. User runs `cumpa <path|glob>...` to open the named files directly, tracked or untracked, changed or unchanged, without any Base/Head selection step.
  2. User's path and glob arguments resolve with Git pathspec semantics and respect ignore rules; an argument matching no file fails before launch with a clear message.
  3. User gets a clear error before launch when any argument resolves outside the repository, including `../` traversal, absolute paths outside the repository, and symlink escapes.
  4. User sees each standalone file rendered full width with its current working-tree content and can comment on any line.
  5. User finishes a standalone-file review and exports Markdown plus canonical JSON whose provenance identifies exactly which paths and snapshot content were reviewed.

**Plans**: 0/8 plans executed
**Wave 1**

- [x] 15-01-PLAN.md
- [x] 15-02-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 15-03-PLAN.md
- [x] 15-04-PLAN.md
- [x] 15-05-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 15-06-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 15-07-PLAN.md

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 15-08-PLAN.md

**Research flag**: yes — path-traversal/symlink-escape hardening (`realpath`/per-segment resolution) is security-sensitive; verify against the existing `exact-patch.ts` precedent during planning, per `research/SUMMARY.md`.

### Phase 16: Rendered Markdown Preview

**Goal**: Users can toggle any Markdown file between source and rendered view in both single-pane and side-by-side layouts, comment directly from rendered blocks, and trust the renderer never introduces an XSS or link-following risk.
**Depends on**: Phase 13 (single-pane layouts)
**Requirements**: MDV-01, MDV-02, MDV-03, MDV-04
**Success Criteria** (what must be TRUE):

  1. User toggles any Markdown file between source view and rendered view, in both single-pane and side-by-side layouts.
  2. User adds a comment from a rendered block (heading, paragraph, list item, code block, table) and sees it stored anchored to that block's source line range, appearing at those lines in source view.
  3. User sees existing comments marked on the rendered blocks they anchor to.
  4. User confirms rendered Markdown never executes scripts, renders raw HTML, or follows non-http(s)/mailto links, under the existing production CSP.

**Plans**: 6 plans

Plans:
**Wave 1**

- [ ] 16-01-PLAN.md — Hardened renderer extensions: block source-map stamping, front matter, task lists, image inline-rule hardening (D-05/D-09/D-11, MDV-02/MDV-04)
- [ ] 16-02-PLAN.md — Same-origin repo-local image content route with path-safety + extension allow-list (D-09, MDV-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 16-03-PLAN.md — RenderedMarkdownView.vue: block rendering, D-01/D-02 markers, D-04 comment trigger, D-07 inline comments, D-09 images, D-11 styling (MDV-01/02/03/04)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 16-04-PLAN.md — Source/Rendered toggle + DiffWorkspace host-swap in both layouts (D-02/D-12, MDV-01)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 16-05-PLAN.md — D-03 block-aligned scroll sync between side-by-side rendered panes (MDV-01)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 16-06-PLAN.md — e2e toggle round-trip, full comment flow, and negative security coverage under production CSP (MDV-01/02/03/04)

**UI hint**: yes

### Phase 17: Agent Protocol Extension & Marketplace Skill

**Goal**: Coding agents can request uncommitted and standalone-file reviews over the same stdin contract used for committed ranges, receive versioned canonical results carrying full provenance, and get specific validation errors before any browser launch — with the marketplace skill updated to match.
**Depends on**: Phase 14 (uncommitted session factory), Phase 15 (standalone-file session factory)
**Requirements**: AGENT-06, AGENT-07, AGENT-08, AGENT-09, SKL-04
**Success Criteria** (what must be TRUE):

  1. Coding agent submits a stdin request for uncommitted review (source kind, optional base, optional pathspecs) and receives one canonical JSON result after the developer finishes.
  2. Coding agent submits a stdin request for standalone-file review (paths or pathspecs) and receives one canonical JSON result after the developer finishes.
  3. Coding agent receives uncommitted and standalone results in new versioned export formats carrying their provenance, while existing range and exact-patch requests and V1–V3 exports stay unchanged.
  4. Coding agent gets a specific validation error before any browser launch for a malformed, oversized, or out-of-repository uncommitted or standalone request.
  5. Coding-agent users of the ShipWithAI marketplace skill can request uncommitted and standalone-file reviews through it, with the CLI version prerequisite updated to the release that supports them.

**Plans**: TBD
**Research flag**: yes — exact `ReviewExportV4Schema`/`V5Schema` field shapes (uncommitted/standalone provenance metadata) aren't fully specified in any research file; finalize during planning against the established V1→V2→V3 superset pattern, per `research/SUMMARY.md`.

### Phase 17.1: Full Project Rename (INSERTED)

**Goal**: The product ships under a new name (to be chosen by the user) everywhere it lives: npm package, CLI command, display name, repo-local and per-user state directories, agent protocol kinds, code identifiers, env vars, scripts, docs, and the marketplace skill. The v2.0 milestone releases once as `<new-package>@2.0.0`, and the old package is deprecated.
**Depends on**: Phase 17 (protocol modes and skill draft PR exist to rename); blocks Phase 18 (copy is written under the new name)
**Requirements**: REN-01, REN-02, REN-03, REN-04, REN-05
**Success Criteria** (what must be TRUE):

  1. User installs and runs the product under the new package and command; `--help`, the browser workspace and exports show only the new name.
  2. Coding agent requests and receives results with the new protocol kinds; a request with the old `cumpa.*` kind fails before launch with a specific error naming the new kind.
  3. The product reads and writes only the new repo-local state directory; an existing supporter's `support.json` is copied once from the old per-user state directory.
  4. A `grep -i cumpa` audit of live code, config, tests, scripts and docs finds only the allowed exceptions (history, old-kind rejection, supporter-state migration source, old-dir exclusion).
  5. A manual release checklist covers the GitHub repo rename, npm publish of 2.0.0 and deprecation of `@shipwithai/cumpa`, Supabase/Stripe renames, and the updated marketplace skill draft PR (prerequisite `>=2.0.0 <3.0.0`).

**Plans**: TBD
**Blocked on**: the new name. Execution starts with a human checkpoint that supplies it.

### Phase 18: Product Repositioning Copy

**Goal**: Cumpa's README, npm page, CLI copy, and browser workspace text describe it as local review for any agent-produced artifact, not just code diffs, with no hosted or multi-reviewer overclaim.
**Depends on**: Phases 13–17 (copy must reflect every shipped v2.0 capability before it claims it)
**Requirements**: POS-01, POS-02, POS-03
**Success Criteria** (what must be TRUE):

  1. Visitors to the README and npm page read Cumpa described as local review for any agent-produced artifact (code, plans, decisions, docs), with no hosted or multi-reviewer claim.
  2. CLI users see `--help`, picker, and dirty-source copy that accurately describe uncommitted and standalone review; the old "staged, unstaged, and untracked bytes are ignored" wording is gone.
  3. Reviewers see browser workspace titles, labels, and empty states that fit artifact review rather than only code diffs.

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Single-Pane File Rendering | 5/5 | Complete    | 2026-10-30 |
| 14. Uncommitted Source Review & Frozen Snapshots | 15/16 | In Progress|  |
| 15. Standalone File Review | 8/8 | Complete    | 2026-10-31 |
| 16. Rendered Markdown Preview | 0/6 | Planned | - |
| 17. Agent Protocol Extension & Marketplace Skill | 0/TBD | Not started | - |
| 18. Product Repositioning Copy | 0/TBD | Not started | - |

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
