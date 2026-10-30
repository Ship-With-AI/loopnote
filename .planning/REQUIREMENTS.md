# Requirements: Cumpa

**Defined:** 2026-10-30
**Core Value:** A developer can accurately review repository-grounded changes chosen by a developer or coding agent and return precise, drift-detectable feedback the agent can act on.

## v2.0 Requirements

**Milestone:** v2.0 Artifact Review — make Cumpa a local review workspace for any artifact a coding agent produces (code, plans, decisions, docs), including uncommitted work, while keeping feedback precise and drift-detectable.

**Research:** `.planning/research/SUMMARY.md` (STACK, FEATURES, ARCHITECTURE, PITFALLS).

### Single-Pane Files

- [x] **PANE-01**: Reviewer sees an added file as one full-width pane containing the whole new content, with no empty Base side, and can comment on any of its lines (anchored to Head).
- [x] **PANE-02**: Reviewer sees a deleted file as one full-width pane containing the whole removed content, with no empty Head side, and can comment on any of its lines (anchored to Base).
- [x] **PANE-03**: Reviewer can tell from the file header and file tree, without relying on color, that a single-pane file is entirely added or entirely deleted; modified, renamed, and copied files keep the existing side-by-side diff.

### Uncommitted Sources

- [x] **WTREE-01**: User can choose Staged (HEAD→index), Unstaged (index→working tree), or Working tree (HEAD→working tree) as the Head source in the launch picker.
- [x] **WTREE-02**: User reviewing the Working tree source sees untracked files as added files, excluding paths ignored by `.gitignore`, `.git/info/exclude`, and the global excludes file.
- [x] **WTREE-03**: User reviewing Staged or Working tree source compares against HEAD by default, or picks any local branch or registered worktree as Base and sees changes from the merge base; Unstaged always compares index→working tree with no Base choice (the Base prompt is skipped and `--base` is rejected).
- [x] **WTREE-04**: User never sees `.cumpa/` content, content reached by following a symlink, or submodule internals in an uncommitted session; symlinks, submodules, binary, and oversized files remain listed as non-reviewable entries.
- [x] **WTREE-05**: User's drafts and comments for an uncommitted session are keyed to that exact reviewed content, so two different working-tree states against the same base never share or overwrite a draft.

### Snapshot and Refresh

- [x] **SNAP-01**: User reviews an uncommitted or standalone-file session against bytes frozen when the session starts; later edits to the files do not change what is displayed until the user refreshes.
- [ ] **SNAP-02**: User is told explicitly when a file changed while the snapshot was being captured, instead of being shown a mixed or partial version as if it were consistent.
- [ ] **SNAP-03**: User can trigger Refresh to capture a new snapshot of the same source and scope.
- [ ] **SNAP-04**: After Refresh, user sees a summary of which files were added, removed, or modified since the previous snapshot.
- [ ] **SNAP-05**: After Refresh, every existing comment is reclassified as current, stale, or orphaned with its recorded evidence intact; no comment is moved to a different line.

### Standalone Files

- [ ] **FILE-01**: User can run `cumpa <path|glob>...` to open the named files, tracked or untracked, changed or unchanged, without choosing Base and Head.
- [ ] **FILE-02**: User's path and glob arguments resolve with Git pathspec semantics and respect ignore rules; an argument matching no file fails before launch with a clear message.
- [ ] **FILE-03**: User sees each standalone file full width with its current working-tree content and can comment on any line.
- [ ] **FILE-04**: User gets a clear error before launch when any argument resolves outside the repository, including `../` traversal, absolute paths outside the repository, and symlink escapes.
- [ ] **FILE-05**: User can finish a standalone-file review and export Markdown plus canonical JSON whose provenance identifies the reviewed paths and their snapshot content.

### Markdown Preview

- [ ] **MDV-01**: User can toggle any Markdown file between source view and rendered view, in single-pane and side-by-side layouts.
- [ ] **MDV-02**: User can add a comment from a rendered block (heading, paragraph, list item, code block, table); it is stored anchored to that block's source line range and appears at those lines in source view.
- [ ] **MDV-03**: User sees existing comments marked on the rendered blocks they anchor to.
- [ ] **MDV-04**: Rendered Markdown never executes scripts, renders raw HTML, or follows non-http(s)/mailto links, under the existing production CSP.

### Agent Requests

- [ ] **AGENT-06**: Coding agent can submit a stdin request for uncommitted review (source kind, optional base, optional pathspecs) and receive one canonical JSON result after the developer finishes.
- [ ] **AGENT-07**: Coding agent can submit a stdin request for standalone-file review (paths or pathspecs) and receive one canonical JSON result after the developer finishes.
- [ ] **AGENT-08**: Coding agent receives uncommitted and standalone results in new versioned export formats carrying their provenance; existing range and exact-patch requests and V1–V3 exports are unchanged.
- [ ] **AGENT-09**: Coding agent gets a specific validation error before any browser launch for a malformed, oversized, or out-of-repository uncommitted or standalone request.

### Marketplace Skill

- [ ] **SKL-04**: Coding-agent users of the ShipWithAI marketplace skill can request uncommitted and standalone-file reviews through it, with the CLI version prerequisite updated to the release that supports them.

### Rename

- [ ] **REN-01**: User installs and runs the product under its new npm package and CLI command, and sees only the new name in `--help`, the browser workspace, and exports; the old package is deprecated with no alias command.
- [ ] **REN-02**: Coding agent uses the new protocol `kind` values for requests and results; a request with an old `cumpa.*` kind fails before launch with a specific error naming the new kind.
- [ ] **REN-03**: User's reviews read and write only the new repo-local state directory; the old `.cumpa/` is neither migrated nor listed as reviewable content.
- [ ] **REN-04**: An existing supporter keeps their support status: `support.json` is copied once from the old per-user state directory when the new one is missing.
- [ ] **REN-05**: Maintainers have a manual release checklist for the GitHub repo rename, `<new>@2.0.0` publish, `@shipwithai/cumpa` deprecation, Supabase/Stripe renames, and the marketplace skill PR (prerequisite `>=2.0.0 <3.0.0`).

### Positioning

- [ ] **POS-01**: Visitors to the README and npm page read Cumpa described as local review for any agent-produced artifact (code, plans, decisions, docs), with no hosted or multi-reviewer claim.
- [ ] **POS-02**: CLI users see `--help`, picker, and dirty-source copy that describe uncommitted and standalone review accurately; the "staged, unstaged, and untracked bytes are ignored" wording is gone.
- [ ] **POS-03**: Reviewers see browser workspace titles, labels, and empty states that fit artifact review rather than only code diffs.

## Future Requirements

Deferred, tracked but not in the v2.0 roadmap.

- **ACC-04** (carried from v1.5): Restore propagates a false RPC result as non-completion; close verified-support acceptance with a genuine live entitlement.
- **DEBT-01** (carried from v1.6): Review-toolbar layout containers expose a queryable `group` role.
- **TYPE-01**: `.vue` files are typechecked (needs a TypeScript/vue-tsc pairing decision).
- **DEFER-01** (carried from v1.6): Per-file viewed tracking and progress.
- Cumpa website (`Ship-With-AI/cumpa-website`) repositioning copy — separate repository.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Live-updating diff while files change | Breaks drift-detectable anchors; v2.0 uses frozen snapshot plus explicit Refresh |
| Staging, unstaging, or discarding hunks from Cumpa | Cumpa never mutates Git state |
| User-configurable unified/split layout | Layout follows file status (added/deleted single pane, others side by side) |
| Rendered-HTML Markdown diffing | Preview renders one side's content; line-level diff stays in source view |
| Raw HTML in rendered Markdown | XSS surface; renderer keeps `html: false` |
| Review of files outside the repository | Every Cumpa boundary is repository-relative; out-of-repo paths are rejected |
| Image, notebook, binary rendering | Text only; such files stay listed as non-reviewable |
| Separate "live" agent mode | Agent-launched sessions use the same freeze semantics as interactive ones |
| Hosted or multi-reviewer review | Single-developer local tool; repositioning changes artifact type, not audience |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PANE-01 | Phase 13 | Complete |
| PANE-02 | Phase 13 | Complete |
| PANE-03 | Phase 13 | Complete |
| WTREE-01 | Phase 14 | Complete |
| WTREE-02 | Phase 14 | Complete |
| WTREE-03 | Phase 14 | Complete |
| WTREE-04 | Phase 14 | Complete |
| WTREE-05 | Phase 14 | Complete |
| SNAP-01 | Phase 14 | Complete |
| SNAP-02 | Phase 14 | Pending |
| SNAP-03 | Phase 14 | Pending |
| SNAP-04 | Phase 14 | Pending |
| SNAP-05 | Phase 14 | Pending |
| FILE-01 | Phase 15 | Pending |
| FILE-02 | Phase 15 | Pending |
| FILE-03 | Phase 15 | Pending |
| FILE-04 | Phase 15 | Pending |
| FILE-05 | Phase 15 | Pending |
| MDV-01 | Phase 16 | Pending |
| MDV-02 | Phase 16 | Pending |
| MDV-03 | Phase 16 | Pending |
| MDV-04 | Phase 16 | Pending |
| AGENT-06 | Phase 17 | Pending |
| AGENT-07 | Phase 17 | Pending |
| AGENT-08 | Phase 17 | Pending |
| AGENT-09 | Phase 17 | Pending |
| SKL-04 | Phase 17 | Pending |
| REN-01 | Phase 17.1 | Pending |
| REN-02 | Phase 17.1 | Pending |
| REN-03 | Phase 17.1 | Pending |
| REN-04 | Phase 17.1 | Pending |
| REN-05 | Phase 17.1 | Pending |
| POS-01 | Phase 18 | Pending |
| POS-02 | Phase 18 | Pending |
| POS-03 | Phase 18 | Pending |

**Coverage:**

- v2.0 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-30*
*Last updated: 2026-10-30 after v2.0 roadmap creation — 30/30 requirements mapped to Phases 13–18, zero orphans (corrected a stale 31-total count in this file's own header to the actual 30 enumerated REQ-IDs).*
