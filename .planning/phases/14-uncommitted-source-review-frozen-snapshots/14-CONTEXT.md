# Phase 14: Uncommitted Source Review & Frozen Snapshots - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can review uncommitted work in the worktree Cumpa runs in: **Staged** (HEAD→index), **Unstaged** (index→working tree) or **Working tree** (HEAD→working tree, untracked files included as added). Staged and Working tree compare against HEAD by default, or against the merge base with any local branch or registered worktree. Every uncommitted session reviews a **frozen snapshot** captured at launch. Cumpa states explicitly when a file changed during capture. The user can **Refresh** to capture a new snapshot of the same source scope, see what changed since the previous snapshot, and have every comment reclassified (current / stale / orphaned) with evidence intact and no comment moved to a different line.

Requirements: WTREE-01..05, SNAP-01..05 (`.planning/REQUIREMENTS.md`).

Out of scope: standalone file/glob review (Phase 15; it reuses this phase's snapshot/Refresh mechanism, so build that mechanism as a reusable session-source abstraction), rendered Markdown (Phase 16), agent stdin protocol for uncommitted work (Phase 17), README/positioning copy (Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Picking the source
- **D-01:** **Uncommitted first in the picker:** the first (Base) prompt gets a top group `Uncommitted` with rows `Staged`, `Unstaged`, `Working tree`. Choosing one switches the flow: the next prompt asks for Base with **HEAD preselected** (Enter accepts). The committed Base→Head flow is unchanged. Update prompt copy accordingly (today `BASE_PROMPT`/`HEAD_PROMPT` in `src/cli/picker.ts` say "committed state will be reviewed").
- **D-02:** **Non-interactive CLI flags:** `--staged`, `--unstaged`, `--worktree`, with optional `--base <ref|worktree>` (default HEAD). They skip the picker. Flags are mutually exclusive. `--base` with `--unstaged` is rejected with a clear message (see D-05). The agent stdin protocol stays Phase 17; Phase 17 aligns with these names.
- **D-03:** **No changes = empty session**, not an error. Picking a source with no changes opens the workspace showing an explicit `No changes` state, and Refresh can pick up later edits. Picker rows are not disabled for emptiness (no extra discovery cost).
- **D-04:** **Current worktree only.** Staged/Unstaged/Working tree always mean the worktree Cumpa was launched in. Other registered worktrees remain committed-HEAD sources as today.

### Source semantics
- **D-05:** **Unstaged is always index→working tree**, with no Base choice: the Base prompt is skipped and `--base` is rejected. WTREE-03's "any local branch or registered worktree as Base" applies to **Staged** and **Working tree** only. Researcher/planner: update REQUIREMENTS.md WTREE-03 wording to say this (clarification, not a scope cut; user decision 2026-10-30).
- **D-06:** For Staged/Working tree with Base = X, the left side is **merge-base(X, HEAD)**, consistent with the shipped committed flow.
- **D-07:** **Untracked files appear only in Working tree** (as added, honoring `.gitignore`, `.git/info/exclude` and the global excludes file per WTREE-02). Unstaged matches `git diff`: tracked files only.
- **D-08:** **Follow git exactly** for edge cases (intent-to-add `git add -N`, staged deletions, mode changes): the file set and statuses match `git diff`, `git diff --cached` and `git diff HEAD` (or `<merge-base>`) for Unstaged, Staged and Working tree respectively. Verify with fixtures; no special-casing.

### Torn capture & change notice
- **D-09:** **Retry, then mark the file:** if a file's bytes change during capture (stat/hash before vs after read), retry that file a bounded number of times. If it is still unstable, list it as **`Changed during capture`**: non-reviewable with that reason, never shown as a mixed/partial version. The rest of the session opens normally, and Refresh recaptures.
- **D-10:** **Detection scope:** per-file byte consistency **plus** file-set changes between listing and reading (a file appearing or disappearing mid-capture). No whole-tree atomicity claim.
- **D-11:** **Index race:** compare the index file's identity (mtime/size/checksum) before and after capture. If it changed (concurrent `git add`), retry the whole capture once. If it changes again, open with a session-level notice.
- **D-12:** **Where the notice appears:** a text marker on the file row (not color-only), the reason in the file header, and a dismissible session banner: `N files changed during capture — Refresh to recapture`.

### Refresh & reclassification UX
- **D-13:** **Refresh entry points:** a `Refresh snapshot` toolbar control, shown only for snapshot-backed sessions (uncommitted now, standalone in Phase 15), with a keyboard shortcut, **plus** pressing `r` in the running CLI terminal.
- **D-14:** **Passive change indicator:** a cheap periodic check (index identity + stat of snapshot files, modeled on the existing `SelectorDriftObserver`) shows `Working tree changed since snapshot` next to Refresh. **Never auto-refresh.**
- **D-15:** **Post-Refresh summary:** a dismissible panel, `Since previous snapshot: A added, R removed, M modified`, with clickable file lists, **plus** text markers on changed tree rows until each file is opened.
- **D-16:** **Comment reclassification reuses the existing stale/orphaned treatment** (`verifyDurableAnchor()` states verified/stale/orphaned in `src/domain/anchor.ts`). Counts appear in the Refresh summary. No new comment states, no relocation.
- **D-17:** **Open composer on Refresh:** auto-save the unsaved comment against the old snapshot first, then refresh and reclassify it like the others.

### Draft & snapshot lifecycle
- **D-18:** **One session draft with a snapshot chain:** the draft key derives from (source kind + base identity + **first snapshot's content digest**). The draft records the ordered chain of snapshot digests. An in-session Refresh appends a snapshot to the chain and reclassifies comments in place.
- **D-19:** **WTREE-05 interpretation (confirmed with user):** a *new launch* on different content never reuses or overwrites an existing draft. On relaunch, the same digest resumes the same draft. A different digest **offers recovery** through the existing draft-recovery flow ("Resume previous uncommitted review?"). Accepting creates a **new** draft keyed to the new digest, with comments copied and reclassified; the old draft is left untouched. Only an in-session Refresh extends a draft's chain.
- **D-20:** **Retention: keep while referenced.** Snapshot content is content-addressed (sha256, deduplicated) and kept as long as any draft or export references it. No automatic deletion of referenced data.
- **D-21:** **Storage: files under `.cumpa/`** (content-addressed by sha256). Never write to the user's `.git` object database. This is consistent with the "versioned JSON in `.cumpa/`" constraint. Anchors for snapshot content therefore carry a content digest where committed anchors carry a blob OID; the researcher defines how `AnchorSide`/anchor evidence represents this without breaking committed-session drafts.

### Claude's Discretion
- Retry count/back-off for D-09 and polling interval for D-14 (keep within the startup and idle CPU budgets from spike 001).
- The exact shortcut key for Refresh in the browser.
- Whether the snapshot store reuses or generalizes `src/server/patch-snapshot.ts` (`SnapshotManifest` v1) or adds a sibling manifest version.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — WTREE-01..05, SNAP-01..05 (WTREE-03 wording to be clarified per D-05)
- `.planning/ROADMAP.md` §"Phase 14" — success criteria, **Research flag**: content-digest key derivation for uncommitted drafts/anchors (Pitfall 1), CRLF/filter normalization between index and worktree reads, torn-snapshot/race detection design
- `.planning/PROJECT.md` — Key Decisions: committed-objects-only (v1.x) reversed for v2.0 by frozen snapshots + explicit Refresh; drift-detectable guarantee (immutable anchors, classify instead of relocate)
- `.planning/research/` — milestone research (check for v2.0 PITFALLS/ARCHITECTURE files referenced by ROADMAP "Pitfall 1")

### Prior phase
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md` — single-pane rendering reused for uncommitted added/deleted/untracked files

### Spikes
- `.planning/spikes/001-large-repo-startup-baseline/` — startup budget (~370ms fixed + per-branch cost)
- `.planning/spikes/002-staged-source-discovery/` — staged eager discovery pattern
- `.kimi-code/skills/spike-findings-cumpa/SKILL.md` — packaged spike findings

### Code
- `src/domain/source.ts` — `BranchCandidate`/`WorktreeCandidate`, `DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION` ("staged/unstaged ignored": must change)
- `src/cli/picker.ts`, `src/cli/run.ts`, `src/cli/request.ts` — picker prompts/flow, CLI options
- `src/contracts/comparison.ts`, `src/contracts/request.ts`, `src/contracts/draft.ts` — pinned endpoints (committed OIDs only today), draft schema
- `src/domain/comparison-key.ts`, `src/server/draft-store.ts`, `src/server/draft-loader.ts`, `src/server/draft-recovery.ts` — draft keying (sha256 of OID pair) and recovery flow
- `src/domain/anchor.ts` — `verifyDurableAnchor()` verified/stale/orphaned, context hash
- `src/git/selector-drift.ts` — `SelectorDriftObserver` polling pattern (model for D-14)
- `src/server/patch-snapshot.ts` — existing `SnapshotManifest` v1 for exact-patch sessions
- `src/git/availability.ts`, `src/git/ignore-status.ts`, `src/git/inventory.ts` (`isCumpaInternalPath`), `src/server/gitignore-capability.ts` — non-reviewable classification, `.cumpa/` exclusion, ignore handling
- `src/server/routes.ts` — file metadata/content routes (Refresh endpoint to add)
- `src/web/components/IdentityHeader.vue` — session identity header (Refresh control, change indicator)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verifyDurableAnchor()` + context hash: the reclassification engine for D-16.
- `SelectorDriftObserver`: the polling pattern for the passive change indicator (D-14).
- `SnapshotManifest` (exact-patch): precedent for freezing content plus sha256 at session start.
- Draft recovery flow (`draft-recovery.ts`): reuse for the relaunch recovery offer (D-19).
- Non-reviewable classification (binary/non-utf8/oversized/symlink/submodule/mode): extend with the `Changed during capture` reason (D-09).
- Phase 13 single-pane editor: renders uncommitted added/deleted/untracked files.

### Established Patterns
- Native Git CLI via `spawn` argument arrays is the source of truth. No JS git library.
- Zod contracts shared by API, drafts and export. Incompatible/corrupt data fails explicitly, so new snapshot/source schemas need versioning.
- Drafts are versioned JSON with atomic replace in `.cumpa/`.
- Anchors are immutable; mismatch is classified, never relocated.
- Status/meaning is never color-only.

### Integration Points
- CLI: new flags + picker group → request contract → server session factory (a new "uncommitted" session kind beside pinned-comparison and exact-patch).
- Server: snapshot capture service (read index blobs / worktree bytes, torn detection), snapshot store under `.cumpa/`, Refresh endpoint, change-indicator polling endpoint.
- Web: identity header (source label, Refresh, indicator), session banner, Refresh summary panel, tree row markers.
- Export: must prove which snapshot(s) were reviewed (digest chain); the exact shape is open for research and must stay drift-detectable.

</code_context>

<specifics>
## Specific Ideas

- Copy: `Changed during capture`, `N files changed during capture — Refresh to recapture`, `Working tree changed since snapshot`, `Since previous snapshot: A added, R removed, M modified`, `No changes`.
- CLI flags: `cumpa --staged`, `cumpa --unstaged`, `cumpa --worktree [--base <ref>]`; `r` in the terminal refreshes.
- Picker: `Uncommitted` group at the top of the first prompt.

</specifics>

<deferred>
## Deferred Ideas

- Uncommitted sources for other registered worktrees (not just the current one): possible future phase.
- Not discussed, left to research/planning within scope: CRLF/clean-filter normalization between index and worktree bytes (ROADMAP research flag), export shape for snapshot proof, identity header copy for uncommitted sessions.

</deferred>

---

*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Context gathered: 2026-10-30*
