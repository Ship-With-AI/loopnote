# Phase 14: Uncommitted Source Review & Frozen Snapshots - Research

**Researched:** 2026-10-30
**Domain:** Local Git worktree/index inspection, content-addressed snapshot freezing, drift-detectable anchor identity (Node 24 + TypeScript + Fastify + Vue 3 + Monaco, native Git CLI)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Picking the source**
- **D-01:** Uncommitted first in the picker: the first (Base) prompt gets a top group `Uncommitted` with rows `Staged`, `Unstaged`, `Working tree`. Choosing one switches the flow: the next prompt asks for Base with **HEAD preselected** (Enter accepts). The committed Base→Head flow is unchanged. Update prompt copy accordingly (today `BASE_PROMPT`/`HEAD_PROMPT` in `src/cli/picker.ts` say "committed state will be reviewed").
- **D-02:** Non-interactive CLI flags: `--staged`, `--unstaged`, `--worktree`, with optional `--base <ref|worktree>` (default HEAD). They skip the picker. Flags are mutually exclusive. `--base` with `--unstaged` is rejected with a clear message. The agent stdin protocol stays Phase 17; Phase 17 aligns with these names.
- **D-03:** No changes = empty session, not an error. Picking a source with no changes opens the workspace showing an explicit `No changes` state, and Refresh can pick up later edits. Picker rows are not disabled for emptiness.
- **D-04:** Current worktree only. Staged/Unstaged/Working tree always mean the worktree Cumpa was launched in. Other registered worktrees remain committed-HEAD sources as today.

**Source semantics**
- **D-05:** Unstaged is always index→working tree, with no Base choice: the Base prompt is skipped and `--base` is rejected. WTREE-03's "any local branch or registered worktree as Base" applies to Staged and Working tree only.
- **D-06:** For Staged/Working tree with Base = X, the left side is merge-base(X, HEAD), consistent with the shipped committed flow.
- **D-07:** Untracked files appear only in Working tree (as added, honoring `.gitignore`, `.git/info/exclude` and the global excludes file per WTREE-02). Unstaged matches `git diff`: tracked files only.
- **D-08:** Follow git exactly for edge cases (intent-to-add `git add -N`, staged deletions, mode changes): the file set and statuses match `git diff`, `git diff --cached` and `git diff HEAD` (or `<merge-base>`) for Unstaged, Staged and Working tree respectively. Verify with fixtures; no special-casing.

**Torn capture & change notice**
- **D-09:** Retry, then mark the file: if a file's bytes change during capture (stat/hash before vs after read), retry that file a bounded number of times. If it is still unstable, list it as `Changed during capture`: non-reviewable with that reason, never shown as a mixed/partial version. The rest of the session opens normally, and Refresh recaptures.
- **D-10:** Detection scope: per-file byte consistency plus file-set changes between listing and reading (a file appearing or disappearing mid-capture). No whole-tree atomicity claim.
- **D-11:** Index race: compare the index file's identity (mtime/size/checksum) before and after capture. If it changed (concurrent `git add`), retry the whole capture once. If it changes again, open with a session-level notice.
- **D-12:** Where the notice appears: a text marker on the file row (not color-only), the reason in the file header, and a dismissible session banner: `N files changed during capture — Refresh to recapture`.

**Refresh & reclassification UX**
- **D-13:** Refresh entry points: a `Refresh snapshot` toolbar control, shown only for snapshot-backed sessions (uncommitted now, standalone in Phase 15), with a keyboard shortcut, plus pressing `r` in the running CLI terminal.
- **D-14:** Passive change indicator: a cheap periodic check (index identity + stat of snapshot files, modeled on the existing `SelectorDriftObserver`) shows `Working tree changed since snapshot` next to Refresh. Never auto-refresh.
- **D-15:** Post-Refresh summary: a dismissible panel, `Since previous snapshot: A added, R removed, M modified`, with clickable file lists, plus text markers on changed tree rows until each file is opened.
- **D-16:** Comment reclassification reuses the existing stale/orphaned treatment (`verifyDurableAnchor()` states verified/stale/orphaned in `src/domain/anchor.ts`). Counts appear in the Refresh summary. No new comment states, no relocation.
- **D-17:** Open composer on Refresh: auto-save the unsaved comment against the old snapshot first, then refresh and reclassify it like the others.

**Draft & snapshot lifecycle**
- **D-18:** One session draft with a snapshot chain: the draft key derives from (source kind + base identity + first snapshot's content digest). The draft records the ordered chain of snapshot digests. An in-session Refresh appends a snapshot to the chain and reclassifies comments in place.
- **D-19:** WTREE-05 interpretation (confirmed with user): a new launch on different content never reuses or overwrites an existing draft. On relaunch, the same digest resumes the same draft. A different digest offers recovery through the existing draft-recovery flow ("Resume previous uncommitted review?"). Accepting creates a new draft keyed to the new digest, with comments copied and reclassified; the old draft is left untouched. Only an in-session Refresh extends a draft's chain.
- **D-20:** Retention: keep while referenced. Snapshot content is content-addressed (sha256, deduplicated) and kept as long as any draft or export references it. No automatic deletion of referenced data.
- **D-21:** Storage: files under `.cumpa/` (content-addressed by sha256). Never write to the user's `.git` object database. Anchors for snapshot content therefore carry a content digest where committed anchors carry a blob OID; the researcher defines how `AnchorSide`/anchor evidence represents this without breaking committed-session drafts/anchors.

### Claude's Discretion
- Retry count/back-off for D-09 and polling interval for D-14 (keep within the startup and idle CPU budgets from spike 001).
- The exact shortcut key for Refresh in the browser.
- Whether the snapshot store reuses or generalizes `src/server/patch-snapshot.ts` (`SnapshotManifest` v1) or adds a sibling manifest version.

### Deferred Ideas (OUT OF SCOPE)
- Uncommitted sources for other registered worktrees (not just the current one): possible future phase.
- Not discussed, left to research/planning within scope: CRLF/clean-filter normalization between index and worktree bytes (resolved below), export shape for snapshot proof (Phase 17's `ReviewExportV4Schema` field enumeration — this research establishes the manifest/key shape it must carry), identity header copy for uncommitted sessions (resolved by `14-UI-SPEC.md`, not re-litigated here).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WTREE-01 | Choose Staged/Unstaged/Working tree as Head in the launch picker | Architectural Responsibility Map; `worktree-inventory.ts` design in Architecture Patterns; picker wiring already fully specified in `14-UI-SPEC.md` (not re-derived here) |
| WTREE-02 | Untracked files as added, honoring `.gitignore`/`.git/info/exclude`/global excludes | Architecture Patterns → Pattern 2 (`git ls-files --others --exclude-standard`); Don't Hand-Roll row 1 |
| WTREE-03 | Staged/Working tree compare against HEAD or chosen Base via merge-base; Unstaged has no Base | Architecture Patterns → Pattern 1 (source-kind-parallel diff invocation); confirms D-05/D-06 wording already reconciled in `REQUIREMENTS.md` |
| WTREE-04 | Never show `.cumpa/`, symlink targets, or submodule internals; such files stay non-reviewable | Don't Hand-Roll row 1 (reuse `isCumpaInternalPath`); Common Pitfalls (torn-capture classification reuses `UnsupportedAvailabilityReasonSchema`) |
| WTREE-05 | Drafts/comments keyed to exact reviewed content; two different working-tree states never share a draft | **Required focus 1** (content-digest key derivation) |
| SNAP-01 | Review frozen bytes captured at session start; later edits don't change display until Refresh | **Required focus 2** (CRLF-safe content capture) + **Required focus 3** (torn-snapshot detection) |
| SNAP-02 | Told explicitly when a file changed during capture, not shown mixed/partial | **Required focus 3** (torn-snapshot/race detection design) |
| SNAP-03 | Trigger Refresh to capture a new snapshot of the same source/scope | Architecture Patterns → Pattern 3 (freeze-then-observe, mutating `refresh()`); D-14 polling recommendation below |
| SNAP-04 | After Refresh, see a summary of added/removed/modified files since previous snapshot | Architecture Patterns → Pattern 3 (manifest diff between chain entries) |
| SNAP-05 | After Refresh, every comment reclassified current/stale/orphaned, evidence intact, never relocated | **Required focus 1** (anchor identity unchanged) confirms D-16 reuses `verifyDurableAnchor()` unmodified |
</phase_requirements>

## Summary

Phase 14 adds a third provenance kind ("uncommitted") beside the existing `range` and `exact-patch` session kinds, and it does so by extending two patterns the codebase already ships rather than inventing new machinery: `PatchSnapshot`'s freeze-then-observe content-addressed snapshot model (`src/server/patch-snapshot.ts`), and the content-digest draft/review-key scheme it already uses (`PATCH_KEY_DOMAIN`, `reviewKey()`). No new npm dependency is needed — every capability (native Git diff/status plumbing, synthetic blob-OID hashing, sha256 manifests, Zod discriminated unions) is already in the dependency tree and already proven in production for the exact-patch feature.

The three research-flagged questions converge on one underlying principle: **Git is always the authority for "what changed," and content-addressing is always the authority for draft/anchor identity — Cumpa must never hand-roll either.** (1) The uncommitted draft/review key is `sha256(domain‖sourceKind‖baseCommitOid‖firstSnapshotDigest)`, directly mirroring `rangeReviewKey()`'s framed-field hashing and `PatchSnapshot.reviewKey()`'s content-digest-not-commit-OID design — this makes WTREE-05 true by construction (different frozen content ⇒ different key) without any new anchor-schema field. (2) CRLF/filter divergence is avoided by keeping `git diff`/`git diff --cached` as the sole source for both file membership *and* line-level content on any side that is not already object-backed, using the same hunk-reconstruction technique `src/git/exact-patch.ts` already implements for patch application — never comparing raw `fs.readFile` bytes against Git-object bytes directly. (3) Torn-snapshot/index-race detection extends `PatchSnapshot`'s existing single-file `boundedFileBytes` + per-file sha256 verification to the N-file case, adding a bracket-and-retry discipline around the whole capture (index lstat before/after, per-file lstat before/after) that doesn't exist yet in the codebase and must be built new in a sibling `worktree-snapshot.ts` module.

**Primary recommendation:** Build `src/git/worktree-inventory.ts` + `src/server/worktree-snapshot.ts` as new siblings to `exact-patch.ts`/`patch-snapshot.ts`, extracting the shared file-IO primitives (`boundedFileBytes`, `writeOwned`, `syncDirectory`, `digest`, `frame`) into a new shared internal module so neither file duplicates nor reaches into the other's private functions; add exactly one new `DraftComparisonSchema` union member, one new `UnsupportedAvailabilityReasonSchema` enum value, and zero changes to `DurableAnchorV1Schema`/`verifyDurableAnchor()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Picker group / CLI flags (Staged/Unstaged/Working tree selection) | CLI (Commander + `@inquirer/search`) | — | Pure input-collection; no Git/filesystem work happens here (already fully specified by `14-UI-SPEC.md`) |
| Uncommitted file-set discovery (`git diff --cached`/`git diff`/`git ls-files --others`) | Git Adapter (native CLI via `spawn`) | — | Git is the sole authority for "what changed" per D-08; a new `src/git/worktree-inventory.ts` module, parallel to `src/git/inventory.ts` |
| Frozen snapshot capture, torn/race detection, Refresh mutation | API/Backend (Fastify server process) | Git Adapter (invokes `git diff`/`git cat-file`/`lstat` through the adapter) | Mirrors `PatchSnapshot`'s placement in `src/server/*`; must run server-side because it owns the on-disk `.cumpa/` snapshot store and the draft store it feeds |
| Draft/anchor identity (review key, `DurableAnchorV1`) | API/Backend | — | `src/domain/*` is pure-function domain logic invoked from the server; anchors and keys are never computed in the browser |
| Draft persistence (`.cumpa/drafts/<key>.json`) | Database/Storage (local filesystem, content-addressed) | API/Backend | Atomic-replace JSON files under `.cumpa/`, exactly as today — no new storage technology |
| Refresh button, passive change indicator, session banner, summary panel | Browser/Client (Vue 3) | API/Backend (new `/api/refresh` + polling endpoint) | Fully specified by `14-UI-SPEC.md`; this research only grounds the backend contract those components call |
| Export provenance (uncommitted scope in `ReviewExportV4Schema`) | API/Backend | — | Deferred to Phase 17 per CONTEXT's Deferred Ideas, but the manifest/key shape this phase produces is what that schema will embed |

## Standard Stack

**No new runtime npm dependency is needed for this phase** (confirmed against `.planning/research/STACK.md`'s milestone-wide conclusion and against this phase's own scope: it uses only native Git CLI plumbing, `zod@4.4.3`, and Node built-ins `node:crypto`/`node:fs`/`node:path`, all already in `package.json`). The **Package Legitimacy Audit section is skipped** per the role's instructions for phases that install nothing.

### Core (reused, extended — all already in the dependency tree)
| Library/Tool | Version in repo | Purpose in Phase 14 | Why Standard |
|---------|---------|---------|--------------|
| `git` (native CLI via `createGitRunner`) | 2.54.0 (local; flags used are documented, stable plumbing since Git 1.x) | `git diff --cached`/`git diff`/`git diff <merge-base>`, `git ls-files --others --exclude-standard`, `git rev-parse --git-path index`, `git ls-tree` | Same `spawn`-array invocation pattern as every other Git interaction in the repo (`src/git/runner.ts`); zero new process-invocation surface |
| `zod` | 4.4.3 | New `UncommittedScopeSchema`/`UncommittedDraftComparisonSchema`/`WorktreeSnapshotManifestSchema` discriminated-union members | Same contract-sharing pattern already used for `range`/`exact-patch` |
| `node:crypto` (`createHash`) | built-in (Node 24.15.0 local) | sha256 content digests, synthetic Git-compatible blob OIDs | Identical to `digest()`/`blobOid()` already shipped in `patch-snapshot.ts`/`exact-patch.ts` |
| `node:fs/promises` (`lstat`, `open`, `readlink`, `rename`, `rm`) | built-in | Snapshot capture, torn-file/index-race detection, atomic manifest write | Identical to `patch-snapshot.ts`'s existing file-IO discipline |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `git diff`/`git ls-files` for file-set + content normalization | A JS diff/glob library (`diff`, `fast-glob`) | Rejected — would compute different results than Git in edge cases (CRLF, renames, `.gitignore` semantics) and is explicitly listed in STACK.md's "What NOT to Use" |
| `fs.watch`/chokidar for the passive change indicator (D-14) | A file-watcher library | Rejected — ARCHITECTURE.md Anti-Pattern 2 explicitly forbids auto-refresh/watchers; D-14 requires a cheap *polled* check, not a live watch, and "Never auto-refresh" rules out any watcher-driven UI update regardless of library |

**Installation:** none required.

## Architecture Patterns

### System Architecture Diagram

```
CLI picker / --staged|--unstaged|--worktree flags (src/cli/picker.ts, src/cli/run.ts)
        │
        ▼
src/git/worktree-inventory.ts  (NEW)
   ├─ Staged:       git diff --cached --raw -z --numstat -z <mergeBase>
   ├─ Unstaged:     git diff --raw -z --numstat -z            (no endpoints: index→worktree)
   ├─ Working tree: git diff --raw -z --numstat -z <mergeBase> + git ls-files --others --exclude-standard -z
   └─ produces ChangedFile[]  (opaque file_ ids, synthetic blobOid for non-object-backed sides)
        │
        ▼
src/server/worktree-snapshot.ts  (NEW — sibling to patch-snapshot.ts)
   ├─ capture(): enumerate (git) → per-file read-with-retry (lstat before/after) → index lstat bracket
   │             → classify torn files as 'changed-during-capture' → write content-addressed files under .cumpa/
   ├─ refresh(): re-capture() → diff old chain-tip manifest vs new manifest → {added, removed, modified}
   └─ WorktreeSnapshotManifest  { sourceKind, baseCommitOid?, chain: digest[], entries[] }
        │
        ▼
uncommittedReviewKey(sourceKind, baseCommitOid, chain[0])  (src/domain/comparison-key.ts, NEW fn)
        │
        ▼
createUncommittedSessionApp(scope, snapshot)  (src/server/app.ts, NEW)
   └─ createUncommittedCapabilityRegistry()  (src/server/capabilities.ts, NEW)
        │                                            │
        ▼                                            ▼
draftPaths()/draftStore (.cumpa/drafts/<key>.json)   POST /api/refresh
        │                                            │
        ▼                                            ▼
Browser: GET /api/session → workspace-state.ts → Monaco (single-pane for added/deleted/untracked,
         side-by-side for modified) → verifyDurableAnchor() reclassifies on every Refresh
```

### Recommended Project Structure
```
src/git/
├── worktree-inventory.ts     # NEW — Staged/Unstaged/Working-tree ChangedFile[] builder (Pattern 1)
├── worktree-content.ts       # NEW — per-file content resolution; houses the CRLF-safe logic (Pattern 2)
src/server/
├── snapshot-fs.ts            # NEW — shared primitives extracted from patch-snapshot.ts (boundedFileBytes,
│                              #       writeOwned, syncDirectory, digest, frame, isMissing)
├── worktree-snapshot.ts      # NEW — WorktreeSnapshotManifestSchema + WorktreeSnapshot class (Pattern 3/4)
├── patch-snapshot.ts         # MODIFIED — re-exports/imports shared primitives from snapshot-fs.ts instead
│                              #            of defining them locally; no behavioral change
src/domain/
├── comparison-key.ts         # MODIFIED — add uncommittedReviewKey()
src/contracts/
├── comparison.ts             # MODIFIED — add UncommittedScopeSchema; add 'changed-during-capture' to
│                              #            UnsupportedAvailabilityReasonSchema
├── draft.ts                  # MODIFIED — add UncommittedDraftComparisonSchema union member
```

### Pattern 1: Source-kind-parallel diff invocation, not a shared "dirty diff" function
**What:** Each of Staged/Unstaged/Working-tree gets its own explicit `git diff` invocation with the exact endpoint arguments that reproduce what `git diff --cached`/`git diff`/`git diff <merge-base>` would show — never a single parameterized function that tries to special-case "which side is live."
**When to use:** `worktree-inventory.ts`'s three source-kind branches.
**Example (reusing the exact flag set `createChangedFileInventory` already proves, varying only the endpoints):**
```typescript
// Source: src/git/inventory.ts:62-69 (existing sharedDiffOptions), extended per source kind
const sharedDiffOptions = ['-z', '--find-renames=50%', '--find-copies=50%', '--find-copies-harder', '--no-ext-diff', '--no-textconv'] as const;

// Staged: base(mergeBase)→index
runner.run(['diff', '--cached', '--raw', '-z', '--no-abbrev', ...sharedDiffOptions.slice(1), mergeBaseOid, ...pathspecTail], { cwd: repositoryRoot });

// Unstaged: index→worktree, no endpoints (D-05: no Base concept at all)
runner.run(['diff', '--raw', '-z', '--no-abbrev', ...sharedDiffOptions.slice(1), ...pathspecTail], { cwd: repositoryRoot });

// Working tree: base(mergeBase)→worktree (tracked) + untracked union
runner.run(['diff', '--raw', '-z', '--no-abbrev', ...sharedDiffOptions.slice(1), mergeBaseOid, ...pathspecTail], { cwd: repositoryRoot });
runner.run(['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs], { cwd: repositoryRoot });
```
**Trade-offs:** Three call sites instead of one generic one, but each is independently testable against its own `git diff` fixture (D-08's "verify with fixtures, no special-casing" is satisfied directly by this structure, not undermined by it).

### Pattern 2: Content resolution — object-backed sides via `ObjectReader`, non-object-backed sides via Git's own patch output, never raw `fs.readFile` compared against Git bytes
**What:** For every side of every comparison, ask "is this content already a Git object?" If yes (base commit blob, staged/index blob — `git add` already wrote it), read it exactly as committed comparisons do today, via `createObjectReader`/`git cat-file --batch`. If no (Unstaged's worktree side, Working-tree's worktree side for *tracked* files), reconstruct the full pre/post text from `git diff`'s own unified patch output using a large context window, rather than independently reading the file via `fs.readFile` and letting Monaco's client-side diff compare two differently-normalized texts.
**When to use:** Any time Phase 14 needs the actual bytes to hand to Monaco or to hash into the snapshot manifest, for a side that sits across a worktree boundary from an object-backed side.
**Why (grounds Required Focus 2 below):** `git diff` already applies the repository's `core.autocrlf`/`.gitattributes` text-normalization consistently when it decides what to show as "changed" (PITFALLS.md verification criterion: "unstaged diff via the new feature matches `git diff`'s own output line-for-line"). A raw `fs.readFile` of the worktree file bypasses that normalization entirely.
**Example (reconstructing full text from a one-hunk, full-context patch, directly reusing the hunk-line-classification idiom already proven in `exact-patch.ts`):**
```typescript
// New: src/git/worktree-content.ts, modeled on the hunk-walk in src/git/exact-patch.ts:380-426
// (that function replays a submitted patch's hunks against a known preimage; this one reads
//  context/removed/added lines directly off git's own hunk, since git already normalized them)
const result = await runner.run(
  ['diff', scope === 'cached' ? '--cached' : undefined, '-U1000000', '--no-color',
   '--no-ext-diff', '--no-textconv', ...(endpoint ? [endpoint] : []), '--', path].filter(Boolean),
  { cwd: repositoryRoot },
);
// Walk the single full-context hunk: '-'/' ' lines => preimage, '+'/' ' lines => postimage.
// Untracked files (no base side at all) skip this entirely and are read via a bounded fs.readFile,
// since there is no cross-side normalization comparison to protect (single-pane, added-only).
```
**Trade-offs:** One extra `git diff` subprocess per non-object-backed file (bounded by the already-enforced `MAX_INLINE_TEXT_BYTES`/`MAX_SIDE_BYTES` content-size ceilings, so no new scaling risk per spike 001/002's "no serial per-item subprocess that scales with repo size" lesson — this scales with *changed file count*, not repo size, exactly like the existing `--raw`/`--numstat` pair already does).

### Pattern 3: Freeze-then-observe-then-mutate — `refresh()` as the one new capability `PatchSnapshot` doesn't have
**What:** `PatchSnapshot` only ever *observes* drift (`observe()` never mutates `this.manifest`). The new `WorktreeSnapshot` needs an explicit, user-triggered `refresh()` that re-captures and *replaces* the live file list while leaving every previously-recorded anchor byte-for-byte untouched.
**When to use:** `POST /api/refresh` handler, Refresh CLI keypress (`r`).
**Example:**
```typescript
// New capability PatchSnapshot never needed (server/patch-snapshot.ts:493-511 shows observe() for contrast)
async refresh(): Promise<Readonly<{ added: readonly string[]; removed: readonly string[]; modified: readonly string[] }>> {
  const previous = this.manifest; // chain-tip manifest before this call
  const next = await captureWorktreeManifest(this.scope, this.repositoryRoot); // Pattern 1 + Pattern 4 (retry)
  const delta = diffManifestEntries(previous.entries, next.entries); // path-keyed set comparison
  this.manifest = { ...next, chain: [...previous.chain, next.digest] }; // D-18: append, don't replace
  return delta;
}
```
**Trade-offs:** None — this is additive to the freeze-then-observe model, not a replacement of it; `observe()`/`verifiedManifest()`'s self-consistency checks stay valid at every point in the chain.

### Pattern 4: Bracket-and-retry capture (extends `boundedFileBytes`'s single-file discipline to N files + the index)
**What:** `PatchSnapshot.readSide()` already verifies a single file's bytes against its recorded `sha256`/`byteLength` on every *read*. The new torn-snapshot design adds a *capture-time* bracket: stat before, read, stat after, retry on mismatch, bounded — applied per file, plus one whole-index-identity bracket around the entire capture.
**See:** Common Pitfalls → Required Focus 3 for the full algorithm.

### Anti-Patterns to Avoid
- **Widening `comparisonKey(baseOid, headOid)` with a sentinel head** (e.g. `headOid = 'WORKTREE'`): collapses every working-tree state against the same base onto one draft/anchor identity — exactly Pitfall 1, exactly what WTREE-05 forbids. Use `uncommittedReviewKey()` instead (Required Focus 1).
- **Auto-refreshing on a timer or `fs.watch`**: D-14 explicitly says "Never auto-refresh." The passive indicator may *poll and display*, but only an explicit user action (button click or `r` keypress) may call `refresh()`.
- **Re-pointing/relocating an anchor on Refresh when content "looks similar"**: Pitfall 4. `verifyDurableAnchor(recorded, current)` must always compare the *recorded* anchor against whatever the new snapshot now presents for that exact path/side/line; a mismatch is `stale`, never a silent reattachment.
- **Reaching into `patch-snapshot.ts`'s private helpers directly**: `boundedFileBytes`, `writeOwned`, `digest`, `frame`, `syncDirectory`, `isMissing` are module-private (no `export` keyword) today. Either import-cycle hacks or copy-paste duplication are both wrong; extract them into `src/server/snapshot-fs.ts` first (a small, mechanical, low-risk refactor task that should be planned explicitly, not discovered mid-implementation).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "Which files changed" for Staged/Unstaged/Working tree | A custom recursive directory walk + byte comparison against index/HEAD | `git diff --raw -z`/`--numstat -z` (Staged: `--cached`; Unstaged: no endpoints; Working tree: `<merge-base>`) | Git already resolves renames, mode changes, intent-to-add status codes, and respects the repository's own normalization rules; a hand-rolled walk would silently diverge from `git diff` on every edge case D-08 requires fixture-tested parity for |
| `.gitignore`/global-excludes matching for untracked files | A JS gitignore-pattern matcher | `git ls-files --others --exclude-standard -z` | Gitignore precedence (negation, nested files, directory-only patterns) is notoriously easy to get subtly wrong; Git already implements it correctly and this call is already the pattern `inspectCumpaIgnore` uses for a narrower purpose |
| CRLF/filter-aware content comparison | A custom EOL-normalization pass driven by reading `core.autocrlf`/`.gitattributes` and replicating Git's smudge/clean logic in Node | `git diff`'s own patch output (Pattern 2) | Git's filter/attribute system supports arbitrary custom smudge/clean commands, not just built-in EOL conversion; reimplementing even the common case risks silent divergence from what `git diff` itself would show, which is the exact failure mode the CRLF pitfall warns about |
| Torn-read / race detection | A generic file-watcher or debounce library | Bracket-and-retry around `lstat`+bounded-read, exactly `PatchSnapshot.boundedFileBytes` extended to N files (Required Focus 3) | The existing single-file pattern is already proven in production for exact-patch; the only new work is applying it in a loop plus an index-identity bracket, not inventing a new concurrency primitive |
| Synthetic blob OID for non-object-backed bytes | A new hashing scheme | `blobOid()` from `src/git/exact-patch.ts:427-429` (`blob <len>\0<bytes>` hashed with the repo's object format) | Already Git-compatible, already proven, and reusing it is what makes committed and uncommitted anchors share the exact same `blobOid` field type with zero schema change |

**Key insight:** Every "Don't Hand-Roll" row above has a reason that is specific to *this* domain's drift-detectability guarantee: a hand-rolled equivalent might pass casual testing but silently diverge from Git's own notion of "changed" on exactly the edge cases (renames, intent-to-add, CRLF, gitignore negation) that D-08 and the CRLF pitfall call out as must-match-exactly.

## Common Pitfalls

### Required Focus 1: Content-digest key derivation for uncommitted drafts/anchors (CONTEXT D-18/D-19/D-20/D-21, PITFALLS.md Pitfall 1)

**What goes wrong if hand-rolled naively:** Reusing `comparisonKey(baseCommitOid, headCommitOid)` with a constant sentinel for the uncommitted "head" (e.g. `'WORKTREE'`) collapses every distinct working-tree state compared against the same base onto one draft file and one anchor identity — a developer's comments from yesterday's working tree silently reattach to today's completely different content. This is Pitfall 1 verbatim.

**Prescriptive recommendation:**

1. **Review key** — add `uncommittedReviewKey()` to `src/domain/comparison-key.ts`, structurally identical to `rangeReviewKey()`'s framed-field hashing and to `PatchSnapshot.reviewKey()`'s content-digest-not-OID design:
   ```typescript
   const UNCOMMITTED_DOMAIN = Buffer.from('cumpa-uncommitted-review-key-v1', 'utf8');

   export function uncommittedReviewKey(
     sourceKind: 'staged' | 'unstaged' | 'worktree',
     baseCommitOid: string | undefined, // undefined only for 'unstaged' (D-05: no Base concept)
     firstSnapshotDigest: string,        // the chain's [0] entry — never updates after first capture
   ): string {
     const hash = createHash('sha256');
     hash.update(UNCOMMITTED_DOMAIN);
     hash.update(frame(sourceKind));
     hash.update(frame(baseCommitOid ?? ''));
     hash.update(frame(firstSnapshotDigest));
     return hash.digest('hex');
   }
   ```
   `frame()` always emits a length-prefix before the bytes (including for the empty-string Unstaged case), so there is no ambiguity between "Unstaged with no base" and "Staged with an empty-string base" — the two are structurally distinguishable by `sourceKind` alone, and the length-prefix makes the hash collision-safe regardless. This directly satisfies WTREE-05: two different working-tree states against the same base produce two different `firstSnapshotDigest` values ⇒ two different keys ⇒ never share or overwrite a draft (D-19's "different digest never reuses or overwrites" is true by construction, not by an extra guard).

2. **Key stability across Refresh** — the key is computed **once**, from the chain's first entry, at session start. An in-session Refresh (D-18: "appends a snapshot to the chain") must never recompute the key — the draft file path stays fixed for the life of the session. This mirrors `PatchSnapshot`'s `reviewKey` being computed once in `materializePatchSnapshot()` and never touched by `observe()`.

3. **Draft comparison schema** — add one new union member to `DraftComparisonSchema` in `src/contracts/draft.ts`, parallel to the existing `ExactPatchDraftComparisonSchema`:
   ```typescript
   const UncommittedDraftComparisonSchema = z.strictObject({
     kind: z.literal('uncommitted'),
     sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
     baseCommitOid: GitObjectIdSchema.optional(),
     reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
     snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(), // D-18's ordered chain
   }).superRefine((comparison, context) => {
     const hasBase = comparison.baseCommitOid !== undefined;
     if (comparison.sourceKind === 'unstaged' && hasBase) {
       context.addIssue({ code: 'custom', message: 'Unstaged comparisons have no base.', path: ['baseCommitOid'] });
     }
     if (comparison.sourceKind !== 'unstaged' && !hasBase) {
       context.addIssue({ code: 'custom', message: 'Staged and Working tree comparisons require a base commit.', path: ['baseCommitOid'] });
     }
   }).readonly();
   ```
   `draftPaths()` in `src/server/draft-loader.ts` needs **no change** — its existing `'kind' in comparison ? comparison.reviewKey : ...` branch (line ~101) already generalizes to any `kind`-tagged comparison carrying a `reviewKey`, including this new `'uncommitted'` kind. `sameComparison()` (same file, ~line 55) **does** need a new branch, since its current two branches (`'kind' in` → exact-patch-shaped fields; else → pinned-range-shaped fields) don't recognize `kind === 'uncommitted'`'s different field set — add a third branch comparing `reviewKey` equality for `kind === 'uncommitted'` comparisons specifically, before falling through to the exact-patch branch.

4. **Anchor identity — zero schema change.** `DurableAnchorV1Schema.blobOid: GitObjectIdSchema` keeps its exact current type and regex (`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`). `AnchorSide` stays `'base' | 'head'`. Resolve D-21's "content digest where committed anchors carry a blob OID" as follows: the field is **always** a Git-format hex digest; what differs is only how the *producer* obtains it:
   - Staged content: a **real** object-database blob OID — `git add` already wrote the object, so `git diff --cached --raw`'s reported OID is read via the existing `ObjectReader`/`git cat-file --batch`, identical to how committed comparisons work today.
   - Unstaged/Working-tree worktree-side content, and untracked files: a **synthetic** Git-compatible blob OID computed via the existing `blobOid()` function (`blob <len>\0<bytes>` hashed with the repo's object format, `src/git/exact-patch.ts:427-429`), **without** writing to `.git/objects` — satisfying D-21's "never write to the user's `.git` object database" exactly as `exact-patch.ts` already does for its own worktree-target case.
   This means `buildDurableAnchor()`/`verifyDurableAnchor()` in `src/domain/anchor.ts` are **untouched**. The only new code is at the call site that currently obtains `blobOid` from `ObjectReader` for committed sessions; for uncommitted sessions it instead reads the per-file digest the new `worktree-snapshot.ts` module already computed during capture. "Without breaking committed-session drafts/anchors" is satisfied trivially — there is nothing to break, since nothing in `anchor.ts` changes.

5. **D-19 relaunch recovery is a *different* UX from the existing `draftStore.recover()`.** `draftStore.recover()` (`src/server/draft-store.ts:350+`) recovers a **malformed/schema-invalid file at the same canonical path** via a fingerprint match — it is keyed to one fixed path. D-19's "different digest offers recovery" is keyed to a **different path entirely** (different `reviewKey` ⇒ different `.cumpa/drafts/<key>.json`), so there is no file-identity collision for the existing mechanism to resolve. Read D-19's phrase "through the existing draft-recovery flow" as **reusing the UX shape** (`DraftRecovery.vue`'s confirm-dialog pattern: "Resume previous review?" / "Start new" choice) for a **new trigger condition**: on relaunch, look up whether a draft exists for the same `(sourceKind, baseCommitOid)` pair but a different `firstSnapshotDigest` (a directory scan of `.cumpa/drafts/` filtered by the `uncommitted` comparison's `sourceKind`/`baseCommitOid` fields, since the key itself doesn't expose those plainly — this requires either storing a lightweight index alongside the drafts or reading each candidate draft's `comparison` block). Flag this for the planner explicitly: it is new code, not a call to `draftStore.recover()`.

### Required Focus 2: CRLF/clean-filter normalization between index and worktree reads (PITFALLS.md CRLF pitfall)

**What goes wrong:** Committed-to-committed and Staged comparisons never hit this, because every side is a Git object (already clean-filtered/normalized at commit or stage time) read via `ObjectReader`. Unstaged (index↔worktree) and Working tree (HEAD/base↔worktree, for *tracked* files) are new: one side is object-backed, the other is raw on-disk bytes. If `core.autocrlf`/`.gitattributes` normalizes line endings on checkout, a raw `fs.readFile` of the worktree file and an `ObjectReader` read of the index/base blob will differ on *every line* even when `git diff` itself reports the file as unchanged or reports only a small real edit — because `git diff` re-applies the clean filter to the worktree side internally before comparing, and a naive two-full-text Monaco diff does not.

**Why it happens:** `git cat-file`/diff plumbing already applies normalization consistently on both sides for committed comparisons. The new feature introduces, for the first time in this codebase, a comparison where one side crosses the worktree boundary and the other doesn't.

**Prescriptive recommendation (D-08-compliant, PITFALLS.md verification criterion: "unstaged diff ... matches `git diff`'s own output line-for-line"):**

- **File membership and status** (which files changed, `ChangedFileStatusKind`, additions/deletions) always comes from `git diff --raw -z`/`--numstat -z` (Pattern 1 above) — never from a byte comparison Cumpa performs itself.
- **Content for display/anchoring on any side that is already a Git object** (base commit blob, Staged's index blob) is read via the existing `ObjectReader`/`git cat-file --batch` — unchanged from today, zero CRLF risk, because staged content is a real written object.
- **Content for the worktree side of Unstaged and Working-tree (tracked files)** must **not** come from an independent `fs.readFile`. Instead, derive the full pre/post text directly from `git diff`'s own patch output for that file, using a context window large enough to capture the whole file in one hunk (`-U1000000`, bounded in practice by the same `MAX_INLINE_TEXT_BYTES`/`MAX_SIDE_BYTES` ceilings that already gate what counts as reviewable text): walk the hunk's context/`-`/`+` lines to recover the preimage (context + `-` lines) and postimage (context + `+` lines), exactly the line-classification technique already proven in `src/git/exact-patch.ts`'s hunk-replay logic (`completeHunk()`/`append()`, lines ~380-426) — only simpler here, since both sides are directly present in the hunk rather than needing to be replayed against an externally-submitted patch. This guarantees the bytes handed to Monaco are byte-identical to what `git diff` itself considers the before/after state, because Git performed the normalization, not Cumpa.
- **Untracked files** (Working tree only, D-07) have no base/index side to normalize against at all — they render single-pane, added-only (Phase 13's single-pane mode). Reading these via a bounded `fs.readFile` (matching `PatchSnapshot.worktreeEntry()`'s existing discipline: `lstat` → reject symlinks/non-files → bounded read) is correct and safe, and is exactly what the pitfall's prevention text means by "direct filesystem reads for snapshot *freezing*/display of raw content, not diff computation" — there is no cross-side diff computation to protect in this one case.
- **Mode changes** (executable bit) must be carried from `git diff --raw`'s reported `oldMode`/`newMode` (which Git reports independent of content), not inferred from a content comparison — a chmod-only change must still surface even when the hunk-reconstructed content is byte-identical.

**Warning signs to test for explicitly (fixture-based, per D-08):** a repository with `.gitattributes` `* text=auto` or `core.autocrlf=true`, a tracked file with CRLF line endings on disk whose index content is LF-normalized, (a) with no real edit — Unstaged review must show **no** changed file, matching `git diff` reporting nothing; (b) with a genuine one-line edit — Unstaged review must show **exactly** the one real line changed, not every line in the file.

### Required Focus 3: Torn-snapshot/race detection design (CONTEXT D-09/D-10/D-11, PITFALLS.md torn-snapshot pitfall)

**What goes wrong:** `git diff`/`git ls-files` enumeration and the subsequent per-file byte read are two independent syscalls with a window between them. An agent writing iteratively (the primary actor this product targets) can write, truncate, delete, or rename a file in that window, producing a snapshot that silently mixes two points in time, or an unhandled `ENOENT`/short-read crash.

**Prescriptive algorithm, extending `PatchSnapshot.boundedFileBytes`'s existing single-file verification to the N-file + whole-index case:**

**(a) Per-file byte consistency (D-09):**
1. `lstat` the file → before-stamp `{ size, mtimeMs }`.
2. Read via a `boundedFileBytes`-shaped read: allocate `expectedBytes + 1`, loop-read, and treat `offset !== expectedBytes` (short or long read) as a torn signal — identical discipline to `patch-snapshot.ts:222-241`'s existing single-file verification.
3. `lstat` again → after-stamp.
4. If before-stamp ≠ after-stamp, **or** the bounded read itself threw: retry from step 1, up to **2 retries beyond the first attempt (3 attempts total)**, with a short fixed delay between attempts (recommended **10 ms**, not exponential backoff — see Discretion Resolutions below).
5. If still inconsistent after all attempts: record this file's `captureStatus` as `'changed-during-capture'` and its `availability` as `{ kind: 'unsupported', reason: 'changed-during-capture' }` (new enum value — see below). **Do not** include a mixed/partial byte buffer in the manifest for this file. The rest of the capture proceeds normally (D-09).
6. On success: compute `sha256` of the verified bytes and store it alongside `byteLength`, mirroring `SnapshotSideSchema`'s existing `{ exists: true, byteLength, sha256, ... }` shape.

**(b) File-set changes mid-capture (D-10):** capture the file-set **twice** — once from the initial `git diff`/`git ls-files` enumeration (the "expected set," which defines the snapshot's reviewable scope per SNAP-01's "frozen at session start"), and once more from a second enumeration call issued **after** every per-file read completes (the "observed set"):
   - Expected-but-now-missing (an independent read attempt also hit `ENOENT`, matching `worktreeEntry()`'s existing `isMissing(error)` check): classify as `'changed-during-capture'`, same as (a) — do not silently drop the file from the manifest (the existing `worktreeEntry()` silently returns `undefined` on `ENOENT`; that behavior is correct for exact-patch's single-known-target lookup but **must not** be reused as-is here, since silently omitting a file from the uncommitted manifest would violate D-09's "never shown as a mixed/partial version as if it were consistent" — the file must be *visibly* flagged, not invisibly absent).
   - Observed-but-not-expected (appeared mid-capture): **excluded** from this snapshot's manifest entirely — the frozen scope is fixed to the first enumeration per SNAP-01; the new file surfaces on the *next* Refresh's "added" delta instead. This must be covered by an explicit fault-injection test (write a new file into the worktree between enumeration and read-completion, assert it is absent from the manifest but present after a subsequent Refresh).

**(c) Index-identity race (D-11):**
1. Resolve the actual index file path via `git rev-parse --git-path index` (not a hardcoded `.git/index` — a linked worktree's index lives under `.git/worktrees/<name>/index`).
2. `lstat` it → before-stamp `{ size, mtimeMs }`, captured **before** step (a)/(b) begin.
3. After (a) and (b) both complete, `lstat` the index path again → after-stamp.
4. If before ≠ after: a concurrent `git add`/`git commit`/`git reset` touched the index mid-capture. **Retry the whole capture once** (D-11, exact wording) — redo the enumeration, every per-file read, and this index bracket from scratch.
5. If the retried capture's own before/after index-stamps **also** differ: give up and open the session with a **session-level** notice (distinct from D-12's per-file `N files changed during capture` banner — D-11's index-race notice is a *different* trigger and must get its own copy/surface; do not conflate the two in the plan). The session opens with whatever the second attempt captured (best effort).

**(d) Manifest shape:** a new `WorktreeSnapshotManifestSchema` (see Discretion Resolutions below for why this is a sibling, not a widened `SnapshotManifestSchema`) carries, per file entry, the existing `SnapshotSideSchema`-equivalent fields **plus** a new `captureStatus: 'captured' | 'changed-during-capture'` discriminant that `SnapshotEntrySchema` has no field for today (exact-patch content is submitted atomically by the agent in one shot — it never races a live filesystem, so it never needed this).

**Fault-injection test precedent:** `tests/api/draft-recovery-faults.test.ts` already establishes this repo's style for simulating mid-operation filesystem faults; PITFALLS.md explicitly names this as the pattern to follow for the new worktree-snapshot fault-injection suite.

### Pitfall: Intent-to-add (`git add -N`) files classified incorrectly
**What goes wrong:** Files added via `git add -N` have a zero-byte index entry but are no longer "untracked" from Git's perspective. A naive Unstaged implementation might silently omit them from both the untracked walk (correctly excluded, they're tracked) and a naive "staged content" check (incorrectly excluded, since the index entry is empty).
**How to avoid:** Parse `git status --porcelain=v2`'s distinct status code for intent-to-add (or rely on `git diff --raw`'s own `A` status against an empty blob), and add an explicit fixture test for this case per D-08's "verify with fixtures."

### Pitfall: Mode-only changes silently dropped
**What goes wrong:** A chmod-only change (`100644`→`100755`) has no byte content difference; if Phase 14 code derives "changed" purely from content-digest comparison, it will miss it.
**How to avoid:** Always carry `oldMode`/`newMode` from `git diff --raw`'s own report (which surfaces mode deltas independent of content), exactly as committed comparisons already do — never infer mode from content equality.

## Code Examples

### Extending `boundedFileBytes`'s discipline to a bracket-and-retry capture loop
```typescript
// New: src/server/worktree-snapshot.ts, built on the extracted src/server/snapshot-fs.ts primitives
// (boundedFileBytes signature/behavior from src/server/patch-snapshot.ts:222-241)
async function captureFileWithRetry(
  path: Buffer,
  expectedBytes: number,
  maxAttempts = 3,       // D-09 discretion: 1 initial + 2 retries
  retryDelayMs = 10,     // short fixed delay, not exponential — see rationale below
): Promise<{ bytes: Buffer; sha256: string } | { torn: true }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const before = await lstat(path);
    try {
      const bytes = await boundedFileBytes(path, expectedBytes); // existing primitive, reused verbatim
      const after = await lstat(path);
      if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
        return { bytes, sha256: digest(bytes) };
      }
    } catch {
      // fall through to retry
    }
    if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return { torn: true };
}
```

### Index-identity bracket (D-11)
```typescript
// New: src/server/worktree-snapshot.ts
async function indexIdentity(repositoryRoot: string, runner: GitRunner): Promise<{ size: number; mtimeMs: number }> {
  const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: repositoryRoot });
  const indexPath = result.stdout.toString('utf8').trim();
  const info = await lstat(join(repositoryRoot, indexPath));
  return { size: info.size, mtimeMs: info.mtimeMs };
}

async function captureWithIndexRace(scope: UncommittedScope, repositoryRoot: string, runner: GitRunner) {
  for (let attempt = 0; attempt < 2; attempt += 1) {          // D-11: "retry the whole capture once"
    const before = await indexIdentity(repositoryRoot, runner);
    const manifest = await captureManifest(scope, repositoryRoot, runner); // Patterns 1+2+4(a)(b) above
    const after = await indexIdentity(repositoryRoot, runner);
    if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
      return { manifest, indexRaceNotice: false };
    }
    if (attempt === 1) return { manifest, indexRaceNotice: true }; // session-level notice, D-11
  }
  throw new Error('unreachable');
}
```

### Passive change indicator polling (D-14), reusing the exact existing `App.vue` precedent
```typescript
// Existing precedent: src/web/components/App.vue (patch-status polling, already shipped)
document.addEventListener('visibilitychange', refreshPatchStatusWhenVisible);
patchStatusInterval = window.setInterval(refreshPatchStatusWhenVisible, 30_000);

// Recommended: identical shape for the new uncommitted change indicator —
// document.addEventListener('visibilitychange', refreshWorktreeIndicatorWhenVisible);
// worktreeIndicatorInterval = window.setInterval(refreshWorktreeIndicatorWhenVisible, 30_000);
// The server-side handler this calls does ONLY an index lstat + a stat of each snapshot file path
// (no git diff/git status re-walk) — O(1) Git subprocess calls regardless of file count, per D-14's
// own "cheap periodic check (index identity + stat of snapshot files)" wording.
```

## Discretion Resolutions

CONTEXT.md left four items to the agent's discretion; each is resolved here as a locked recommendation (there is no user to ask):

1. **D-09 retry count/back-off:** **3 total attempts (1 initial + 2 retries), 10 ms fixed delay between attempts.** Rationale: retries only fire for files actually detected as torn (the common case — zero torn files — pays zero added latency), so this doesn't threaten spike 001's ~400 ms fixed-startup budget in the typical path; a short fixed delay (not exponential backoff) is appropriate because the goal is only to let an in-flight local write complete, not to wait out a slow external process, and spike 001/002's core lesson (avoid serial per-item cost that scales with repo size) is respected since retries scale with *torn-file count*, not repo size.

2. **D-14 polling interval:** **30 seconds**, via the exact `document.visibilitychange` + `window.setInterval` idiom already shipped twice in `App.vue` (`refreshPatchStatusWhenVisible`/`refreshSupportWhenVisible`, both at `30_000`). Reusing the identical interval and pause-when-hidden behavior keeps this consistent with the two existing background-poll consumers rather than introducing a third, different cadence; the endpoint it calls must be O(1) in Git subprocess count (index `lstat` + manifest-file `stat`s only, no `git diff`/`git status` re-walk) to stay within the idle-CPU budget spike 001/002 established as the project's standing constraint on per-poll Git cost.

3. **Refresh keyboard shortcut:** Already resolved, not actually open — `14-UI-SPEC.md` locks `Alt+Shift+R` for the browser (chosen to extend the existing `Alt+Shift+[`/`Alt+Shift+]` file-navigation prefix convention without colliding with the browser's own reload shortcut), plus `r` in the running CLI terminal per D-13. Cite both; nothing left to decide.

4. **Snapshot manifest versioning — sibling schema, not a widened `SnapshotManifestSchema` v1.** Recommend a new `WorktreeSnapshotManifestSchema` (version `1` in its own, independent version-number space — a sibling type, not "v2" of the exact-patch manifest) living in the new `src/server/worktree-snapshot.ts`. Concrete reasons this must be a sibling, not a widening:
   - `SnapshotEntrySchema` assumes one immutable preimage/postimage pair per file forever; the uncommitted case needs a per-file `captureStatus` field and the manifest needs a `chain: digest[]` field, neither of which exact-patch has any use for.
   - `SnapshotManifestSchema.validationTarget` is a closed `discriminatedUnion('kind', ['repository', 'worktree'])` with no `'staged'`/`'unstaged'` member; adding members here is exactly ARCHITECTURE.md's Anti-Pattern 1 (widening a contract whose existing consumers assume a fixed invariant) and the identical anti-widening principle PITFALLS.md's Pitfall 7 states for export schemas, one layer down.
   - `reviewKey()`'s current implementation is specific to `GroundedExactPatch`'s shape (`grounded.scope.digest`); the uncommitted key needs a structurally different input tuple (`sourceKind`, `baseCommitOid`, `firstSnapshotDigest` — Required Focus 1).
   The shared, source-agnostic primitives (`boundedFileBytes`, `writeOwned`, `syncDirectory`, `digest`, `frame`, `isMissing` — currently module-private in `patch-snapshot.ts`) should be extracted into a new `src/server/snapshot-fs.ts` and imported by both `patch-snapshot.ts` and `worktree-snapshot.ts`, so neither duplicates file-IO logic nor reaches into the other module's private functions. This extraction is a small, mechanical, planner-visible task — flag it explicitly rather than letting an implementer discover the need for it mid-task.

## Security Domain

### Applicable ASVS Categories (Level 1, per `.planning/config.json`'s `security_asvs_level: 1`)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Session already bearer-token-gated (`src/server/security.ts`); unchanged by this phase |
| V3 Session Management | No | No new session concept; reuses existing `SessionApp`/`AttachedCompletionCoordinator` wiring |
| V4 Access Control | No | Single-developer local tool; no multi-principal access boundary introduced |
| V5 Input Validation | Yes | New Zod schemas (`UncommittedScopeSchema`, `UncommittedDraftComparisonSchema`, `WorktreeSnapshotManifestSchema`) — `strictObject`/`discriminatedUnion` throughout, matching every existing contract; CLI `--base`/`--staged`/`--unstaged`/`--worktree` flag validation rejects conflicting combinations before any Git call (D-02) |
| V6 Cryptography | Yes | sha256 content digests and synthetic blob OIDs via `node:crypto` (`createHash`) — never hand-rolled, identical to the already-shipped `digest()`/`blobOid()` functions |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| `.cumpa/`-internal content leaking into the untracked-file walk | Information Disclosure | Reuse `isCumpaInternalPath()` (`src/git/inventory.ts`) to filter any path under `.cumpa/` out of the untracked listing, in addition to `.gitignore`'s own `/.cumpa/` rule (defense in depth — the filter must not rely solely on the repo's own gitignore configuration being correct) |
| Symlink inside the worktree pointing outside the repository, surfaced via the untracked walk or a tracked-file worktree read | Information Disclosure / Path Traversal | `lstat` (never `stat`) every path before reading; reject any path whose target is a symlink, exactly `PatchSnapshot.worktreeEntry()`'s existing per-segment `lstat` discipline (`src/server/patch-snapshot.ts:243-275`) — a symlinked file already surfaces as `{ kind: 'unsupported', reason: 'symlink' }`, unchanged by this phase |
| Torn-snapshot bytes silently mixing two points in time and being persisted/exported as if consistent | Tampering (data integrity) | Required Focus 3's bracket-and-retry + explicit `'changed-during-capture'` classification — never silently include a partially-read buffer in the manifest |
| Concurrent `git add`/`git reset` racing the snapshot capture and corrupting draft/anchor identity | Tampering (data integrity) | Required Focus 3(c)'s index-identity bracket + single retry + session-level notice on persistent mismatch |
| Snapshot content written under `.cumpa/` with permissive mode allowing another local user to read review content | Information Disclosure | Reuse `writeOwned()`'s existing `0o600`/`chmod(0o400)` + `0o700` directory mode discipline from `patch-snapshot.ts` unchanged |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `git` CLI | All Git plumbing this phase adds | ✓ | 2.54.0 (local) | None needed — `package.json` already assumes a Git CLI is present for every existing feature |
| Node.js | Runtime | ✓ | v24.15.0 (`engines.node: >=24`) | None needed |

**Missing dependencies with no fallback:** none — this phase has no new external dependency.
**Missing dependencies with fallback:** none applicable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `git rev-parse --git-path index` correctly resolves the live index path in both plain and linked-worktree repository layouts | Required Focus 3(c) | If wrong for some layout, the index-identity bracket would stat the wrong file and silently never detect a real race; mitigate with an explicit linked-worktree fixture test during planning/implementation |
| A2 | A single `git diff -U1000000` call per changed file (Pattern 2) stays within acceptable latency for typical uncommitted-review file counts (tens, not thousands, of files) | Required Focus 2 | If a session has an unusually large number of non-object-backed changed files, this could add noticeable launch latency; mitigate by measuring during implementation against a fixture with e.g. 50-100 dirty files and batching/parallelizing the per-file `git diff` calls if needed (the existing `createChangedFileInventory` already parallelizes its own per-file `classifyAvailability` calls via `Promise.all`, so the same pattern applies directly) |

**If this table is small:** both remaining claims are mechanically verifiable during planning/implementation via fixture tests already called for elsewhere in this document (D-08's fixture-testing requirement, Required Focus 3's fault-injection suite) — neither requires a new user decision.

## Open Questions

1. **Exact field enumeration of `ReviewExportV4Schema`'s uncommitted provenance block**
   - What we know: it must carry `sourceKind`, `baseCommitOid?`, and the snapshot chain/status, following `ExactPatchExportScopeSchema`'s existing shape (`digest`, `validationTarget`, `reviewKey`, `snapshot: { status, files }`).
   - What's unclear: the exact field names/nesting, since export schema work is explicitly Phase 17 scope per CONTEXT's Deferred Ideas.
   - Recommendation: Phase 17's research should treat this phase's `WorktreeSnapshotManifestSchema` (sourceKind, baseCommitOid?, chain, entries) as the given input shape to wrap in a V4-superset, exactly how `ReviewExportV3Schema` wraps `ExactPatchExportScopeSchema` today.

2. **Draft-index lookup for D-19's relaunch recovery (same `sourceKind`/`baseCommitOid`, different digest)**
   - What we know: the review key does not expose `sourceKind`/`baseCommitOid` in plaintext (it's a hash), so finding "a previous draft for the same source+base but different content" requires either an index file or scanning `.cumpa/drafts/*.json` and reading each candidate's `comparison` block.
   - What's unclear: whether a lightweight secondary index (e.g. `.cumpa/drafts/uncommitted-index.json` mapping `(sourceKind, baseCommitOid) → [reviewKey, ...]`) is worth the added write-path complexity versus a bounded directory scan (draft counts per repository are small — this is a local single-developer tool, not a server with many concurrent drafts).
   - Recommendation: start with a bounded directory scan (read every `.cumpa/drafts/*.json`, parse just the `comparison` block, filter by `sourceKind`+`baseCommitOid`) during planning; only add an index file if the scan proves measurably slow in practice, consistent with this project's general "no premature optimization" posture evidenced by the exact-patch/range code paths never needing one.

## Sources

### Primary (HIGH confidence — direct repository inspection, file:line grounded)
- `src/server/patch-snapshot.ts` — freeze-then-observe pattern, `boundedFileBytes`, `writeOwned`, `reviewKey()`, `worktreeEntry()`, `PatchSnapshot` class
- `src/domain/anchor.ts`, `src/domain/comparison-key.ts` — anchor/key construction, `framedSha256`/`frame` framing idiom
- `src/contracts/draft.ts`, `src/contracts/comparison.ts` — `DraftComparisonSchema` union shape, `ChangedFileSchema`, `UnsupportedAvailabilityReasonSchema`, `ExactPatchExportScopeSchema`
- `src/server/draft-loader.ts`, `src/server/draft-store.ts`, `src/server/draft-recovery.ts` — `draftPaths()`, `sameComparison()`, `classifyDraft()`, `recover()`
- `src/git/exact-patch.ts` — `blobOid()` synthetic hash, hunk-replay logic, `worktreeEntry()`/`lstat`-per-segment symlink defense
- `src/git/inventory.ts` — `sharedDiffOptions`, `isCumpaInternalPath()`, `createChangedFileInventory()`'s diff-invocation pattern
- `src/git/selector-drift.ts` + `src/web/components/App.vue` (`refreshPatchStatusWhenVisible`/`setInterval(…, 30_000)`) — polling precedent for D-14
- `src/git/availability.ts`, `src/git/ignore-status.ts` — availability classification, `.cumpa/` ignore probe
- `src/server/security.ts` — CSP/session-security baseline (unchanged by this phase)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (§Phase 14), `.planning/STATE.md`, `.planning/config.json`
- `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-CONTEXT.md`, `14-UI-SPEC.md`
- `git --version` (2.54.0), `node --version` (v24.15.0), `package.json` (`engines.node >=24`, `zod@4.4.3`) — verified locally via shell

### Secondary (MEDIUM confidence — milestone-level research, cross-checked against repo evidence above)
- `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/FEATURES.md` — milestone-wide v2.0 research (HIGH confidence per their own self-assessment; treated as MEDIUM here only in the sense that this phase-level document re-derives and extends their conclusions rather than re-verifying their own file:line citations independently)
- `.kimi-code/skills/spike-findings-cumpa/SKILL.md`, `.planning/spikes/001-large-repo-startup-baseline/README.md`, `.planning/spikes/002-staged-source-discovery/README.md` — startup/idle-CPU budget grounding for Discretion Resolutions 1 and 2

### Tertiary (LOW confidence)
- None — every claim above is either directly repo-grounded or cited to the milestone-level research substrate this assignment named as authoritative.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every primitive already shipped and exercised in production (`patch-snapshot.ts`, `exact-patch.ts`, `comparison-key.ts`)
- Architecture: HIGH — every new module/schema is a direct structural sibling of an existing, working counterpart, with file:line evidence for each
- Pitfalls: HIGH for Required Focus 1 and 3 (direct extension of proven existing mechanisms); MEDIUM for Required Focus 2's exact `git diff -U<N>` hunk-reconstruction mechanics specifically (the *principle* — Git must be the sole normalization authority — is HIGH confidence and directly sourced from PITFALLS.md's own prevention text, but the precise large-context-window technique is this researcher's synthesis, not independently verified against a live CRLF fixture in this session; flagged as Assumption A2's sibling concern and should get an explicit fixture test early in implementation)

**Research date:** 2026-10-30
**Valid until:** 2026-11-29 (30 days — stable domain, no external API/library surface that moves faster than that; re-verify sooner only if the repository's Git CLI minimum version requirement changes)
