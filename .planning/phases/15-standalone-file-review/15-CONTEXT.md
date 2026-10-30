# Phase 15: Standalone File Review - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

`cumpa <path|glob>...` opens the named files directly, tracked or untracked, changed or unchanged, with no Base/Head selection. Each file is reviewed full width (Phase 13 single-pane surface) from a frozen snapshot (Phase 14 snapshot/Refresh mechanism). The user can comment on any line and export Markdown plus canonical JSON whose provenance proves exactly which paths and snapshot content were reviewed. Arguments resolve with Git pathspec semantics, respect ignore rules, and fail before launch when they match nothing or resolve outside the repository (`../`, absolute paths outside, symlink escapes).

Requirements: FILE-01..05 (`.planning/REQUIREMENTS.md`).

Out of scope: rendered Markdown (Phase 16), agent stdin protocol for standalone requests (Phase 17), diffing standalone files against anything (see D-01).

</domain>

<decisions>
## Implementation Decisions

### Changed files in standalone
- **D-01:** **Current content only:** a standalone file always renders as full-width current content, even if it has uncommitted changes. No diff toggle and no change gutter in standalone sessions. To see changes, the user runs `cumpa --worktree` (Phase 14). All comments anchor to the snapshot content (one anchor mode per session).
- **D-02:** **Git state text label per file:** the file header shows e.g. `Standalone · Modified (uncommitted)`, `Standalone · Untracked`, `Standalone · Unchanged`. The tree row gets a matching text marker (not color-only, per Phase 09/13 rules). Git state is computed at capture time and refreshed on Refresh.
- **D-03:** **Content source is working-tree bytes** (what is on disk, per FILE-03), even when a file has staged and unstaged changes. Captured with the Phase 14 snapshot capture, including torn-capture detection and `Changed during capture` marking.

### Claude's Discretion (user skipped these areas; conservative defaults)
- **Argument matching:** directory arguments recurse through Git pathspec semantics. Globs use Git pathspec glob rules, not shell expansion beyond what the shell already did. A file **explicitly named but ignored** fails before launch with a clear message (consistent with FILE-02 "respect ignore rules"); no `-f` override in this phase. Enforce a file-count cap reusing `MAX_PATHSPEC_COUNT` (256 arguments, `src/contracts/request.ts`) plus a resolved-file cap chosen by the planner, with a clear error. In-repo symlinks stay non-reviewable entries (WTREE-04 precedent): Cumpa never follows them.
- **Mode exclusivity:** positional paths **cannot** be combined with `--staged`/`--unstaged`/`--worktree`/`--base` (Phase 14 flags) or with the interactive picker; combining them is a clear pre-launch error. `cumpa` with no args keeps the existing picker flow.
- **Session identity:** the identity header shows `Standalone review · N files` (no Base/Head) plus the snapshot timestamp/short digest. Refresh (Phase 14 control, `r` in terminal) recaptures the same resolved argument list. The planner decides whether arguments are re-resolved on Refresh (new matching files appear) or the file set stays fixed. Default: **re-resolve the original arguments**, and report added/removed files through the Phase 14 Refresh summary.
- **Export provenance (FILE-05):** canonical JSON records the original argument list, the resolved path list, per-file sha256 of the snapshot bytes, and the snapshot digest chain. Markdown renders a human-readable version. Exact schema shape is left to research, but it must stay versioned (Zod) and drift-detectable, and must not break existing committed/exact-patch exports. Phase 17 owns the agent-facing request/result protocol.
- **Security (FILE-04):** follow the ROADMAP research flag: resolve with `realpath`/per-segment checks, reject `../` traversal, absolute paths outside the repo, and symlink escapes before launch. Verify against the `src/git/exact-patch.ts` precedent.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — FILE-01..05
- `.planning/ROADMAP.md` §"Phase 15" — success criteria; **Research flag**: path-traversal/symlink-escape hardening (`realpath`/per-segment resolution), verify against `exact-patch.ts` precedent, per `research/SUMMARY.md`
- `.planning/research/SUMMARY.md` — milestone research summary

### Prior phases
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md` — single-pane editor, header/tree marker conventions
- `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-CONTEXT.md` — snapshot capture, torn detection, Refresh, draft snapshot chain, `.cumpa/` content-addressed storage, CLI flag names

### Code
- `src/cli/run.ts` (~L754-769) — Commander setup; no positional arguments today
- `src/contracts/request.ts` — `GitArgumentSchema`, `MAX_PATHSPEC_COUNT`, `MAX_GIT_ARGUMENT_BYTES`, pathspec validation
- `src/git/exact-patch.ts` — path safety precedent
- `src/git/inventory.ts` (`isCumpaInternalPath`), `src/git/availability.ts`, `src/git/ignore-status.ts` — exclusions and non-reviewable classification
- `src/export/review-export.ts`, `src/export/render-review-markdown.ts` — export provenance

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 13 single-pane editor (all standalone files render single-pane).
- Phase 14 snapshot capture/store/Refresh/draft chain (standalone is another snapshot-backed session kind).
- Request contract validators for bounded Git arguments/pathspecs.
- Non-reviewable classification (binary/oversized/symlink/submodule/.cumpa).

### Established Patterns
- Native Git CLI as the source of truth (`git ls-files` with pathspecs for tracked/untracked/ignored resolution).
- Zod versioned contracts; explicit failure on invalid input.
- Anchors immutable, drift classified.

### Integration Points
- CLI: positional args → new request mode (`files`) → server standalone session factory.
- Server: resolve + validate paths → Phase 14 snapshot capture → file list with Git state.
- Web: identity header variant, per-file Git-state label.
- Export: provenance block for standalone sessions.

</code_context>

<specifics>
## Specific Ideas

- Header copy: `Standalone · Modified (uncommitted)`, `Standalone · Untracked`, `Standalone · Unchanged`; session header `Standalone review · N files`.

</specifics>

<deferred>
## Deferred Ideas

- Diff toggle / change gutter for standalone files with uncommitted changes (rejected for this phase; `--worktree` covers it).
- Reviewing index (staged) content of named files.
- `-f`/force flag to include explicitly named ignored files.

</deferred>

---

*Phase: 15-standalone-file-review*
*Context gathered: 2026-10-30*
