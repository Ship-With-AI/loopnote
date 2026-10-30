# Architecture Research

**Domain:** Local-first CLI+browser review tool (Node/TypeScript/Fastify/Vue/Monaco) — extending committed-only Git review to uncommitted sources and standalone files
**Researched:** 2026-10-30
**Confidence:** HIGH (all claims grounded in current repo source, file:line evidence below)

## Standard Architecture

### System Overview (current, v1.6)

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLI (Commander)                    src/cli/run.ts                   │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────────────────┐   │
│  │ picker.ts  │  │ request.ts     │  │ run.ts: runOrdinaryAction  │   │
│  │ (interactive│  │ (stdin V1 agent│  │ launchAttachedSession      │   │
│  │ base/head) │  │ request parse) │  │ launchExactPatchSession    │   │
│  └─────┬──────┘  └───────┬────────┘  └──────────────┬──────────────┘  │
├────────┴─────────────────┴───────────────────────────┴────────────────┤
│  Git adapter (native CLI via spawn)      src/git/*.ts                 │
│  runner.ts · repository.ts · candidates.ts · comparison.ts            │
│  inventory.ts · objects.ts · availability.ts · exact-patch.ts         │
│  selector-drift.ts · ignore-status.ts                                 │
├──────────────────────────────────────────────────────────────────────┤
│  Server (Fastify, 127.0.0.1)              src/server/*.ts             │
│  app.ts: createSessionApp | createExactPatchSessionApp                │
│  capabilities.ts (session/files/anchors/export/finish)                │
│  draft-store.ts · draft-loader.ts · patch-snapshot.ts                 │
│  attached-completion.ts · routes.ts                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Contracts (Zod, shared)                  src/contracts/*.ts          │
│  comparison.ts · draft.ts (V1/V2/V3 export) · request.ts · api.ts     │
├──────────────────────────────────────────────────────────────────────┤
│  Browser UI (Vue 3 + Vite + Monaco)        src/web/**                 │
│  model/workspace-state.ts · model/draft-reconciliation.ts             │
│  monaco/diff-adapter.ts (always side-by-side) · model/file-tree.ts    │
│  model/markdown-preview.ts (renderer exists, unwired to UI toggle)    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Current Implementation |
|-----------|----------------|------------------------|
| Source picker | Lets user choose ordered base/head from branches + worktrees | `src/domain/source.ts` (`SourceCandidate` = `BranchCandidate \| WorktreeCandidate`), `src/git/candidates.ts` (`discoverSourceCandidates`), `src/cli/picker.ts` (`pickOrderedSources`) |
| Comparison/session model | Resolves selections to a frozen, committed-objects-only comparison | `src/git/comparison.ts` `createPinnedComparison` — resolves `base`/`head` to commit OIDs (`resolveCommit`), computes the single merge base, freezes result (`PinnedComparisonSchema`) |
| Git adapter | Native Git CLI as source of truth for all repo facts | `src/git/runner.ts` (spawn wrapper), `src/git/repository.ts` (`discoverGitRepository`), `src/git/objects.ts` (`createObjectReader`, `git cat-file --batch`), `src/git/raw-diff.ts`/`numstat.ts` |
| File inventory / opaque IDs | Converts `git diff --raw`+`--numstat` into `ChangedFile[]` with stable-per-session capability IDs | `src/git/inventory.ts` `createChangedFileInventory` — `opaqueFileId()` hashes diff-record identity against a per-process random namespace (`processFileIdNamespace`), producing `file_<43 base64url chars>` |
| Exact-patch snapshot (v1.3) | Freezes agent-submitted patch preimage/postimage bytes outside live Git | `src/git/exact-patch.ts` `createGroundedExactPatch` (parses patch, computes synthetic blob OIDs via `blobOid()` without writing Git objects), `src/server/patch-snapshot.ts` `PatchSnapshot`/`materializePatchSnapshot` — on-disk manifest + per-file content files, each verified by sha256, with `observe()`/`targetDrift()` polling live Git/worktree for drift (fail-closed, no silent anchor movement) |
| DiffWorkspace/Monaco adapter | Owns the Monaco diff editor instance and all diff-derived cues | `src/web/monaco/diff-adapter.ts` `PublicMonacoDiffAdapter` — constructs one `monaco.editor.createDiffEditor` with `renderSideBySide: true` hardcoded (line ~136); `setFile()` swaps `original`/`modified` models |
| Anchors | Durable, immutable per-comment identity independent of line movement | `src/domain/anchor.ts` `buildDurableAnchor`/`verifyDurableAnchor` — hash of `(path bytes, side, blobOid, line, context lines)`; requires a real blob OID per side |
| Draft persistence | Repository-local versioned JSON, keyed by comparison identity | `src/server/draft-store.ts`, `src/server/draft-loader.ts` `draftPaths()` — file name is `exact-patch ? reviewKey : range?.reviewKey ?? comparisonKey(base,head)`, stored at `.cumpa/drafts/<key>.json` |
| Export | Canonical JSON (V1/V2/V3) + derived Markdown | `src/export/review-export.ts` `buildReviewExportV1/V2/V3`, schemas in `src/contracts/draft.ts:279-444` |
| stdin agent protocol | Strict versioned JSON request on stdin, two modes today | `src/contracts/request.ts` `AgentReviewRequestSchema` = discriminated union on `mode`: `'revisions' \| 'patch'`; `src/cli/request.ts` `readAgentReviewRequest` |
| Attached Finish | Server-authoritative, one-shot delivery of canonical result to the waiting agent | `src/server/attached-completion.ts` `AttachedCompletionCoordinator` (generic operation callback, comparison-agnostic); wired per-mode inside `src/server/capabilities.ts:398-463` |

## Recommended Integration Approach for v2.0

v2.0 does **not** replace any existing subsystem — it adds a **third and fourth provenance kind** alongside `range` (committed revisions) and `exact-patch` (v1.3), reusing every mechanism that is already provenance-agnostic (anchors, draft store, attached completion, Monaco adapter plumbing) and extending every mechanism that is currently hardwired to "committed Git objects only."

### Integration Points (existing code, with evidence)

| # | Feature | Touches | Evidence | Why it must change |
|---|---------|---------|----------|---------------------|
| 1 | Single-pane full-width | `src/web/monaco/diff-adapter.ts` | `renderSideBySide: true` hardcoded in `PublicMonacoDiffAdapter` constructor (`diff-adapter.ts:123-139`); `setFile()` at `:199-229` always calls `setModel({ original, modified })` | Added/deleted files today render through the same diff editor as modified files, producing an empty gray pane on one side. There is no per-file-status branch anywhere in the adapter. |
| 2 | Uncommitted sources as Head | `src/git/comparison.ts` `createPinnedComparison` (`:245-403`), `src/domain/source.ts`, `src/git/candidates.ts` `discoverSourceCandidates` | `comparison.ts:272-285` calls `resolveCommit()` for both base and head — there is no code path that compares against the index or worktree; `source.ts:8-38` has exactly two candidate kinds (`branch`, `worktree`), both resolve to a `commitOid` | PROJECT.md's own "Key Decisions" table: *"Resolve branches and worktrees to committed Git objects... exclude ambiguous dirty state"* — this is the decision v2.0 explicitly supersedes for worktree sources. The picker and comparison pipeline must gain a third selectable kind that does **not** resolve to a single commit OID. |
| 3 | Frozen snapshot + Refresh | `src/server/patch-snapshot.ts` (pattern to reuse), `src/git/ignore-status.ts` (`check-ignore` CLI pattern), `src/web/model/draft-reconciliation.ts` | `patch-snapshot.ts:309-533` `PatchSnapshot` class already implements "materialize once, observe drift later, never silently relocate" for exact patches; `draft-reconciliation.ts:37-57` already implements stale/orphaned reclassification by re-indexing `SessionFile[]` against recorded anchors on every session load | The exact mechanics needed for "freeze at session start, Refresh re-observes" already exist for exact-patch review; v2.0 needs the equivalent for live index/worktree bytes, **plus** a new explicit mutation (`refresh`) that the exact-patch flow never needed (exact-patch sessions are immutable for their whole lifetime; worktree sessions are refreshed on demand). |
| 4 | Standalone file review | `src/cli/run.ts` Commander wiring (`:754-769`), `src/domain/file-tree.ts`, `src/git/availability.ts` | `run.ts:754-769` — the `Command()` takes **zero** arguments/options today, `.action()` always calls `runOrdinaryAction` which always calls the picker; `availability.ts:50-124` classifies text/binary/oversized from `(mode, blobOid)` pairs read via `ObjectReader`, which assumes Git-object-backed content | CLI needs a `[paths...]` argument that bypasses the picker entirely; file classification logic (`classifyAvailability`) is reusable but needs a sibling entry point that reads worktree bytes directly rather than via blob OID, since standalone files are not necessarily tracked. |
| 5 | Markdown preview toggle | `src/web/model/markdown-preview.ts` (renderer exists), `src/web/model/workspace-command.ts`, `src/web/model/workspace-state.ts` | `markdown-preview.ts:1-19` is a complete, safe (`validateLink`, no raw HTML) Markdown-to-HTML renderer that is **not referenced anywhere else in `src/web/`** (no `WorkspaceCommand` variant, no state field) — confirmed by its isolation from `workspace-command.ts:3-15`'s closed command union | The rendering engine is done; only the toggle state, the `WorkspaceCommand` plumbing, and a UI pane that overlays/replaces the Monaco pane while preserving line anchors are missing. |
| 6 | Agent stdin protocol extension | `src/contracts/request.ts`, `src/cli/request.ts`, `src/cli/run.ts` `launchAttachedSession`/`launchExactPatchSession` (`:431-538`) | `request.ts:62-87` `AgentReviewRequestSchema` is a closed `discriminatedUnion('mode', [RevisionRequestSchema, ExactPatchRequestSchema])` | Two new `mode` branches needed (`'uncommitted'`, `'files'`), each routed to a new attached-session launcher mirroring `launchAttachedSession`/`launchExactPatchSession`. |
| 7 | Draft/export identity for new sources | `src/domain/comparison-key.ts`, `src/server/draft-loader.ts` `draftPaths()` (`:96-106`), `src/contracts/draft.ts` `DraftComparisonSchema` (`:61-94`) | `draftPaths()` already branches on `'reviewKey' in comparison` vs `range?.reviewKey ?? comparisonKey(...)` — a clean extension point; `DraftComparisonSchema` is `z.union([PinnedDraftComparisonSchema, ExactPatchDraftComparisonSchema])` | New source kinds need their own review-key derivation (parallel to `rangeReviewKey()` in `comparison-key.ts:26-39`) and a third/fourth `DraftComparisonSchema` union member, otherwise drafts for uncommitted/standalone sessions have no persistence key. |
| 8 | Export provenance | `src/contracts/draft.ts` `ReviewExportV1/V2/V3Schema` (`:279-444`), `src/export/review-export.ts` `buildReviewExportV1/V2/V3` | V1 carries `comparison` (committed endpoints); V2 adds `range` (CLI revision-request provenance); V3 replaces `comparison`+`drift` with `patch` (exact-patch provenance) — each version is a **strict superset test** of V1 via `superRefine` (`draft.ts:376-390`, `:418-442`) | Uncommitted and standalone-file exports need their own provenance shape (no stable `mergeBaseOid`/commit identity for worktree sources; no diff endpoints at all for standalone files) — this is a new `ReviewExportV4Schema` (uncommitted) and plausibly `V5` (standalone), each following the same "retains valid V1 feedback" superset pattern. |
| 9 | Anchor identity for non-Git-object bytes | `src/domain/anchor.ts` `buildDurableAnchor` (`:115-151`), `src/git/objects.ts` `ObjectReader` (`:24-27`) | `buildDurableAnchor` requires a `blobOid`; `ObjectReader.read(oid, ...)` reads **by OID** via `git cat-file --batch`, which only resolves objects already in the object database | Staged content *is* blob-backed (`git add` writes objects), so `git diff --cached --raw` yields real OIDs readable via the existing `ObjectReader`. Unstaged and untracked content is **not** object-backed — anchors for those sides need a synthetic blob OID computed the same way `src/git/exact-patch.ts`'s `blobOid()` (`:427-429`, `createHash(format).update('blob <len>\0').update(bytes)`) already computes them for exact-patch preimages/postimages, reading bytes via `fs.readFile` instead of `git cat-file`. |
| 10 | `.gitignore`-respecting untracked listing | `src/git/ignore-status.ts` | `inspectCumpaIgnore` (`:26-39`) already shells out to `git check-ignore --no-index --quiet` for a single, unrelated purpose (protecting `.cumpa/`) | The actual mechanism needed for "untracked files respecting `.gitignore`" is `git ls-files --others --exclude-standard`, a **different** native-Git call that already does the filtering — no new ignore-matching logic needs to be written, but it is a new call site, not a reuse of `ignore-status.ts` itself. |

### New vs Modified Components

**New components (do not exist today):**

| Component | Location (suggested) | Purpose |
|-----------|----------------------|---------|
| Uncommitted source inventory | `src/git/worktree-inventory.ts` | Builds `ChangedFile[]`-shaped records for Staged (`git diff --cached --raw/--numstat` against chosen base), Unstaged (`git diff --raw/--numstat`, index→worktree), and Working tree incl. untracked (`git diff` HEAD/base→worktree for tracked, `git ls-files --others --exclude-standard` for untracked, unioned). Computes synthetic blob OIDs for non-indexed bytes via the `blobOid()` pattern from `git/exact-patch.ts`. |
| Standalone file resolver | `src/git/standalone-files.ts` | Resolves CLI-supplied paths/globs (tracked or not) to single-sided `ChangedFile`-shaped records, reusing `git/availability.ts` classification logic against worktree bytes read directly. |
| Worktree snapshot | `src/server/worktree-snapshot.ts` | Mirrors `PatchSnapshot` (`server/patch-snapshot.ts`): materializes frozen index/worktree/untracked bytes into a private on-disk manifest at session start; adds an explicit `refresh()` method (new — `PatchSnapshot` has no mutator, only `observe()`) that re-reads live state, updates the manifest, and reports per-file added/removed/changed deltas for comment reclassification. |
| Uncommitted/standalone session app factories | `src/server/app.ts`: `createUncommittedSessionApp`, `createStandaloneFilesSessionApp` | Parallel to `createSessionApp`/`createExactPatchSessionApp` (`app.ts:133-184`); wire the new snapshot + a new/generalized capability registry. |
| Uncommitted/standalone capability registries | `src/server/capabilities.ts`: `createUncommittedCapabilityRegistry`, `createStandaloneFilesCapabilityRegistry` (or a generalized registry parameterized over a `files()/readContent()/refresh?()` snapshot interface) | Parallel to `createCapabilityRegistry`/`createExactPatchCapabilityRegistry` (`capabilities.ts:297-879`); exposes a `refresh` capability only these registries have. |
| `/api/refresh` route | `src/server/routes.ts` | New endpoint, registered only when `capabilities.refresh !== undefined`, following the existing `if (capabilities.patchStatus !== undefined)` conditional-registration pattern (`routes.ts:197`). |
| Uncommitted/standalone review-key derivation | `src/domain/comparison-key.ts` | New functions parallel to `rangeReviewKey()` (`:26-39`), e.g. `uncommittedReviewKey(sourceKind, baseOid, repositoryRoot)` and `standaloneFilesReviewKey(paths)`, feeding `draftPaths()`. |
| New contract schemas | `src/contracts/comparison.ts`, `src/contracts/draft.ts`, `src/contracts/request.ts` | `UncommittedScopeSchema` (kind: `'uncommitted'`, `sourceKind: 'staged'\|'unstaged'\|'worktree'`, `baseOid`, `reviewKey`), `StandaloneFilesScopeSchema` (kind: `'standalone-files'`, resolved paths, `reviewKey`); new `DraftComparisonSchema` union members; `ReviewExportV4Schema` (uncommitted provenance) and `ReviewExportV5Schema` (standalone-file provenance), each superset-tested against V1 like V2/V3 are today (`draft.ts:376-390`, `:418-442`); two new `mode` branches on `AgentReviewRequestSchema` (`request.ts:62-87`). |
| Monaco single-pane adapter mode | `src/web/monaco/diff-adapter.ts` (new method/mode) or a sibling `src/web/monaco/single-pane-adapter.ts` | Renders one full-width read-only Monaco model for added/deleted/standalone files instead of the diff editor; anchors collapse to one side only (no `ILineChange` derivation needed, since there is no "other side"). |
| Markdown preview pane + toggle | `src/web/model/workspace-command.ts` (new command variant), `src/web/model/workspace-state.ts` (toggle field), new Vue component | Wires the existing `renderMarkdownPreview()` (`markdown-preview.ts:17-19`) into the UI; comment creation continues to anchor to source lines regardless of which pane is visible. |

**Modified components (existing, need changes):**

| Component | Change |
|-----------|--------|
| `src/domain/source.ts` | Add a third `SourceCandidate` variant (e.g. `UncommittedCandidate` with `sourceKind: 'staged'\|'unstaged'\|'worktree'`), distinct from `BranchCandidate`/`WorktreeCandidate` since it has no `commitOid`. |
| `src/git/candidates.ts` `discoverSourceCandidates` | Emit the three fixed uncommitted entries unconditionally (no Git call needed — they always exist for any worktree) alongside discovered branches/worktrees. |
| `src/cli/picker.ts` | Render the three new entries as selectable Head choices (`buildSourceSearchItems`, `candidateItem`); Base selection is unaffected (still branch/worktree/HEAD). |
| `src/git/comparison.ts` | `createPinnedComparison`/`PinnedComparisonSchema`'s all-committed assumption stays correct for the *base* side; a new function (not a modification of `createPinnedComparison` itself, to avoid widening its committed-only contract) builds the uncommitted comparison using the new inventory module. |
| `src/web/monaco/diff-adapter.ts` | `setFile()` and the constructor need a branch on `file`'s status kind (added/deleted/standalone ⇒ single-pane; modified/renamed/copied/type-changed ⇒ existing diff editor). |
| `src/contracts/comparison.ts` `ChangedFileStatusKindSchema` | Needs a value for standalone (non-diff) files — current enum (`'added'\|'copied'\|'deleted'\|'modified'\|'renamed'\|'type-changed'\|'unsupported'`) has no "this file is not part of a comparison" kind. |
| `src/cli/run.ts` | Commander gains a `[paths...]` argument; `runOrdinaryAction` branches to the standalone-file path before invoking the picker when arguments are present; `launchAttachedSession`/`launchExactPatchSession` get siblings for the two new stdin modes. |
| `src/server/draft-loader.ts` `draftPaths()` | New `DraftComparison` branches for uncommitted/standalone keys, alongside the existing `'reviewKey' in comparison` / `range?.reviewKey` branches. |
| `src/web/model/draft-reconciliation.ts` | Reused as-is for stale/orphaned classification (feature 3 explicitly states anchors are never relocated — this module's existing "exact path, present or not" logic is correct for Refresh too), but is **invoked from a new trigger**: today it only runs on session load; Refresh must re-run it against the updated `session.files` after a snapshot refresh. |
| `src/server/capabilities.ts` `attachedCompletion.finish` (`:398-463`) | Its `comparison.range === undefined` guard (`:406`) currently rejects Finish for anything that isn't a range comparison; the equivalent guard for uncommitted/standalone Finish needs its own scope-validity check (there is no `range` object for these sources). |
| README / CLI `--help` / marketplace skill `SKILL.md` | Product repositioning copy (feature 7) — no code dependency on the rest of the milestone, can land independently. |

## Patterns to Follow

### Pattern 1: Provenance-parallel session app factories

**What:** Every distinct review-source kind gets its own `create*SessionApp()` in `src/server/app.ts` and its own `create*CapabilityRegistry()` in `src/server/capabilities.ts`, all sharing the generic `registerSessionRoutes`, `AttachedCompletionCoordinator`, `draft-store`, and anchor-verification machinery.
**When to use:** Any time a new "what am I comparing/reviewing" concept is added.
**Trade-offs:** Duplicates some wiring glue (as V3/exact-patch already duplicates V1/V2's session-building boilerplate), but keeps each provenance's invariants (committed-only vs frozen-snapshot vs live-worktree) explicit and independently testable rather than smuggled behind conditionals in one giant function.

**Example (existing pattern to extend):**
```typescript
// src/server/app.ts — existing dual pattern
export function createSessionApp(comparison: PinnedComparison, options): SessionApp { /* range path */ }
export async function createExactPatchSessionApp(grounded: GroundedExactPatch, options): Promise<SessionApp> { /* v1.3 path */ }
// v2.0 adds:
export async function createUncommittedSessionApp(scope: UncommittedScope, options): Promise<SessionApp> { /* new */ }
export async function createStandaloneFilesSessionApp(scope: StandaloneFilesScope, options): Promise<SessionApp> { /* new */ }
```

### Pattern 2: Freeze-then-observe snapshot, never silently relocate

**What:** `PatchSnapshot` materializes bytes once, verifies integrity on every read (`verifiedManifest()`, per-file sha256 in `readSide()`), and reports drift via `observe()` without ever moving an anchor.
**When to use:** Any review surface backed by content that can change out from under the session (worktree, index, untracked files all qualify).
**Trade-offs:** Requires disk space and an explicit cleanup (`dispose()`) path; in exchange, review state is reproducible and anchors stay drift-detectable instead of silently re-pointing at different bytes.

**Example:**
```typescript
// server/patch-snapshot.ts:493-511 — reusable shape for the new worktree-snapshot.ts
async observe(): Promise<'unchanged' | 'drifted' | 'snapshotUnavailable'> {
  if (this.unavailable) return 'snapshotUnavailable';
  const manifest = await this.verifiedManifest();
  if (!this.drifted) this.drifted = await this.targetDrift(manifest);
  return this.drifted ? 'drifted' : 'unchanged';
}
// v2.0's worktree-snapshot.ts needs the mutating counterpart PatchSnapshot never required:
// async refresh(): Promise<{ added: string[]; removed: string[]; changed: string[] }>
```

### Pattern 3: Synthetic blob OIDs for non-object-backed bytes

**What:** Compute a Git-compatible blob OID (`blob <len>\0<bytes>` hashed with the repo's object format) without writing to `.git/objects`, so anchor/export identity stays uniform whether content came from the object database or raw worktree bytes.
**When to use:** Any ChangedFile-shaped record whose bytes are not already in the Git object database (unstaged, untracked, standalone-file sides).
**Trade-offs:** None functionally — it's the same hash Git itself would produce if the content were staged; it just avoids mutating the repository to obtain an identity.

**Example:**
```typescript
// git/exact-patch.ts:427-429 — already exists, reusable as-is
function blobOid(bytes: Buffer, format: 'sha1' | 'sha256'): string {
  return createHash(format).update(`blob ${bytes.length}\0`, 'ascii').update(bytes).digest('hex');
}
```

### Pattern 4: Provenance-tagged export versions, each a strict superset of V1

**What:** Every new export schema version keeps the full V1 feedback shape (`summary`, `files`, `counts`, comment verification) and adds one new provenance object; a `superRefine` round-trips the document back through a lower schema to prove nothing was lost.
**When to use:** Any new review-source kind that needs its own provenance metadata in the canonical export.
**Trade-offs:** Schema duplication (each version repeats `files`/`counts`/`summary`) in exchange for every version being independently parseable without migration logic — a downstream agent can `switch` on `schemaVersion` and know exactly what's guaranteed.

## Data Flow

### Current data flow (committed comparison)

```
pickOrderedSources() → ComparisonSelection (base, head)
    ↓
createPinnedComparison() → resolveCommit(base) + resolveCommit(head) → merge-base (single, exact)
    ↓
createChangedFileInventory() → git diff --raw/--numstat(mergeBase..head) → ChangedFile[] (opaque file_ ids)
    ↓
createSessionApp(comparison) → createCapabilityRegistry() → SessionResponse (files, mergeBaseOid, ...)
    ↓
Browser: GET /api/session → workspace-state.ts → Monaco diff-adapter (always side-by-side)
    ↓
addComment → draftStore.mutate() → .cumpa/drafts/<comparisonKey>.json (atomic replace)
    ↓
exportReview() → buildReviewExportV1/V2 → .cumpa/exports/<key>/{review.json, review.md}
```

### New data flow (uncommitted source, v2.0)

```
Picker: Staged | Unstaged | Working tree (incl. untracked) chosen as Head, any branch/worktree as Base
    ↓
worktree-inventory.ts:
  staged   → git diff --cached --raw/--numstat (base..index)      [real blob OIDs]
  unstaged → git diff --raw/--numstat (index..worktree)           [index OID + synthetic worktree OID]
  worktree → git diff --raw/--numstat (base..worktree, tracked)
             + git ls-files --others --exclude-standard (untracked, .gitignore-respecting)
             [synthetic blob OIDs via blobOid() for all non-indexed bytes]
    ↓
worktree-snapshot.ts: materialize frozen copy of index/worktree/untracked bytes NOW (session start)
    ↓
createUncommittedSessionApp(scope, snapshot) → createUncommittedCapabilityRegistry()
    ↓
Browser renders from the FROZEN snapshot, not live Git — identical to exact-patch session semantics
    ↓
Explicit Refresh action → POST /api/refresh
    ↓
snapshot.refresh(): re-read live index/worktree/untracked bytes → diff manifest vs previous
    ↓
session.files updated → draft-reconciliation.ts re-run against new files → comments reclassified
    stale (path still exists, content/line moved) / orphaned (path gone) — anchors themselves NEVER rewritten
    ↓
Finish / exportReview() → buildReviewExportV4 (new "uncommitted" provenance: sourceKind, baseOid, snapshot status)
```

### New data flow (standalone file review, v2.0)

```
cumpa src/foo.ts src/bar/*.md   (CLI paths/globs, no picker)
    ↓
standalone-files.ts: resolve globs against worktree → read bytes directly (tracked or not)
    ↓
classifyAvailability()-equivalent against raw bytes (no ObjectReader / blob OID needed up front)
    ↓
createStandaloneFilesSessionApp(scope) — single-pane only, no base side at all
    ↓
Browser: file tree + single-pane Monaco (or Markdown preview toggle for .md files) + commenting
    ↓
exportReview() → buildReviewExportV5 (new "standalone-files" provenance: resolved paths, no diff identity)
```

### Key Data Flow Changes vs v1.6

1. **Snapshot capture of index/worktree/untracked bytes:** net-new. v1.6 never reads index or worktree bytes — `createPinnedComparison` only ever resolves to commit OIDs (`comparison.ts:272-285`). v2.0's uncommitted sessions read three distinct Git states (`git diff --cached`, `git diff`, `git ls-files --others --exclude-standard`) and freeze the result into a private snapshot directory (new, modeled on `patch-snapshot.ts`), exactly once per session start.
2. **Refresh semantics:** net-new capability. Nothing in v1.6 mutates a frozen comparison after session start — `PatchSnapshot` only *observes* drift (`observe()`), it never updates itself. v2.0 needs an explicit, user-triggered mutation that re-snapshots and feeds the result back into `session.files`, which the browser already knows how to reconcile against existing comments (`draft-reconciliation.ts`), but which the server has never driven mid-session before.
3. **New provenance kinds in export schema:** `ReviewExportV1`'s `comparison` (committed endpoints + mergeBase), V2's `range` (CLI revision-request), and V3's `patch` (exact-patch digest/validationTarget) are joined by V4's uncommitted scope (`sourceKind`, `baseOid`, snapshot status — no `mergeBaseOid` exists for an index/worktree comparison) and V5's standalone-files scope (resolved paths only — no comparison identity at all, since there is no second side).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Typical repo, few uncommitted files | No adjustment — `worktree-inventory.ts` reuses the same bounded `git diff --raw/--numstat` calls as today; `git ls-files --others --exclude-standard` is a single native call. |
| Large untracked tree (e.g. `node_modules` not gitignored) | `git ls-files --others --exclude-standard` already returns nothing for gitignored trees; an **unignored** large untracked tree is a real risk — the standalone-file/untracked inventory should apply the same bounded-count/bounded-size ceilings `patch-snapshot.ts` already enforces (`MAX_SNAPSHOT_FILES = 10_000`, `MAX_SNAPSHOT_BYTES = 64 MiB`, `MAX_SIDE_BYTES = 2 MiB` per file) rather than inventing new limits. |
| 10,000-ref repositories (already gated, v1.2) | Unaffected — uncommitted-source discovery adds three static picker entries, not a Git enumeration; the existing packed-ref performance budget (`ROADMAP.md` Phase 11) is untouched. |

### Scaling Priorities

1. **First bottleneck:** An unignored, very large untracked directory inflating snapshot size/time. Mitigate by reusing `patch-snapshot.ts`'s existing byte/file ceilings and failing closed (same `PatchSnapshotError` pattern) rather than silently truncating.
2. **Second bottleneck:** Refresh latency on large working trees (re-running `git diff` + `git ls-files` on every explicit Refresh). Bounded by user-triggered frequency (not automatic/polling per PROJECT.md), so no background-polling cost exists; no further mitigation needed at v2.0 scope.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Widening `createPinnedComparison`'s contract to accept worktree bytes

**What people might do:** Add an `includeDirty` flag to the existing `createPinnedComparison`/`PinnedComparisonSchema` to special-case uncommitted sources.
**Why it's wrong:** `PinnedComparisonSchema` and every consumer of `PinnedComparison` (export V1/V2, `createCapabilityRegistry`, `createSelectorDriftObserver`) is built on the invariant that `base`/`head` are frozen commit OIDs forever (`hasCommittedChanges` field, `mergeBaseOid` as a `GitObjectIdSchema`). Smuggling worktree bytes through the same type silently breaks every piece of code that currently assumes `oid` means "immutable Git object."
**Instead:** A parallel `UncommittedScope` type (Pattern 1 above) with its own session app factory. Keep `PinnedComparison` exactly as committed-only as its name says.

### Anti-Pattern 2: Auto-refreshing uncommitted sessions on a timer or file-watcher

**What people might do:** Poll the filesystem or use `fs.watch` to keep the worktree session "live," since that feels more useful than a stale snapshot.
**Why it's wrong:** PROJECT.md is explicit: *"Working-tree snapshot frozen at session start + explicit Refresh action"* and *"anchors are immutable, never relocated silently."* Automatic refresh would silently change `session.files` mid-review, reclassifying or re-anchoring comments without the developer's knowledge — exactly the ambiguity the "committed Git objects only" decision existed to prevent in v1.
**Instead:** Only the server route triggered by the UI's explicit Refresh control calls `snapshot.refresh()`. Never on a timer, never on WebSocket/SSE push from a file watcher.

### Anti-Pattern 3: Reusing `ObjectReader`/blob-OID lookups for worktree bytes

**What people might do:** Try to make unstaged/untracked content "look like" tracked content by writing it to the object database (`git hash-object -w`) just so the existing `ObjectReader.read(oid)` path works unmodified.
**Why it's wrong:** `git hash-object -w` mutates `.git/objects` — a side effect on disk the product has never had (every Key Decision in PROJECT.md stresses "without modifying Git state" / "no mutating Git apply path"). It would also leave orphaned blobs behind after every review session.
**Instead:** Compute the synthetic OID in memory (Pattern 3 above, already implemented for exact-patch) and read bytes directly from the filesystem; never write to the object database.

## Integration Points

### External Services

None relevant to v2.0 — all target features are local Git/filesystem/CLI/browser integration; no new external service (the existing optional Stripe/Supabase support path is untouched).

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI picker ↔ Git adapter | Direct function calls (`discoverSourceCandidates`, new uncommitted-entry emission) | New entries are static (no Git call), unlike branch/worktree discovery. |
| Git adapter ↔ Server snapshot | `worktree-inventory.ts`/`standalone-files.ts` produce `ChangedFile[]`-shaped data consumed by `worktree-snapshot.ts` at session start | Mirrors the existing `exact-patch.ts` → `patch-snapshot.ts` boundary exactly. |
| Server capabilities ↔ Browser | Fastify JSON routes, Zod-validated both directions (`contracts/api.ts`) | New `/api/refresh` route follows the existing conditional-registration pattern (`routes.ts:197`, gated on `capabilities.patchStatus !== undefined` today, `capabilities.refresh !== undefined` for v2.0). |
| Browser workspace-state ↔ Monaco adapter | `WorkspaceCommand` union dispatched imperatively (`applyMonacoWorkspaceCommand`, `diff-adapter.ts:608-626`) | New single-pane mode and Markdown-preview toggle both need new `WorkspaceCommand` variants; neither replaces existing diff-editor commands for modified files. |
| stdin protocol ↔ session app factories | `cli/request.ts` parses, `cli/run.ts` dispatches to the matching `create*SessionApp` | Two new `mode` branches each need their own `launch*Session` function mirroring `launchAttachedSession`/`launchExactPatchSession` (`run.ts:431-538`). |

## Suggested Build Order

Respecting dependencies (schema → git adapter → server/session wiring → CLI surface → stdin protocol → browser UI → copy), roughly five layers, each buildable/testable before the next depends on it:

1. **Contracts first** (`contracts/comparison.ts`, `contracts/draft.ts`, `contracts/request.ts`): `UncommittedScopeSchema`, `StandaloneFilesScopeSchema`, new `DraftComparisonSchema` union members, `ReviewExportV4Schema`/`V5Schema`, new `ChangedFileStatusKindSchema` value for standalone files, two new `AgentReviewRequestSchema` modes. Nothing downstream can be typed correctly without these.
2. **Git adapter** (`git/worktree-inventory.ts`, `git/standalone-files.ts`, review-key derivation in `domain/comparison-key.ts`): pure functions over Git/filesystem, testable in isolation with Vitest fixtures exactly like `inventory.ts`/`exact-patch.ts` are today. Depends only on layer 1's types.
3. **Server/session wiring** (`server/worktree-snapshot.ts`, `server/app.ts` new factories, `server/capabilities.ts` new registries, `server/routes.ts` `/api/refresh`, `server/draft-loader.ts` key branches, Finish/export wiring): depends on layer 2's inventory shape being stable. This is where "frozen snapshot + explicit Refresh + reclassify, never relocate" gets proven with Fastify `inject()` tests, same as the exact-patch flow was.
4. **CLI surface, two parallel tracks** (can run concurrently once layer 3 exists):
   - Interactive: `domain/source.ts` new candidate kind, `git/candidates.ts` static emission, `cli/picker.ts` new entries, wired to `createUncommittedSessionApp`.
   - Standalone: `cli/run.ts` Commander `[paths...]` argument, wired to `createStandaloneFilesSessionApp`.
5. **stdin agent protocol** (`cli/request.ts` dispatch, new `launchUncommittedSession`/`launchStandaloneFilesSession` in `cli/run.ts`): depends on layer 3's session factories and layer 4's CLI patterns existing, since agent-attached launches reuse the same session apps as interactive launches.
6. **Browser UI, two independent tracks** (can run concurrently, each depends only on layer 1's schemas plus its own slice of layer 3's session data):
   - Monaco single-pane mode (`web/monaco/diff-adapter.ts`), consuming the new standalone status kind from layer 1 and files from layers 3/4.
   - Markdown preview toggle (`web/model/workspace-command.ts`, `workspace-state.ts`, new Vue component), independent of source kind — applies to any `.md` file in any session type, including today's committed comparisons.
7. **Product repositioning copy** (README, CLI `--help` strings, marketplace `SKILL.md`): no code dependency on any other layer; sequence last so copy reflects the shipped feature set rather than the plan.

## Sources

- Direct repository inspection: `src/domain/source.ts`, `src/git/candidates.ts`, `src/git/comparison.ts`, `src/git/inventory.ts`, `src/git/exact-patch.ts`, `src/git/objects.ts`, `src/git/availability.ts`, `src/git/ignore-status.ts`, `src/git/repository.ts`, `src/git/selector-drift.ts`, `src/server/app.ts`, `src/server/capabilities.ts`, `src/server/routes.ts`, `src/server/draft-store.ts`, `src/server/draft-loader.ts`, `src/server/patch-snapshot.ts`, `src/server/attached-completion.ts`, `src/server/gitignore-capability.ts`, `src/contracts/comparison.ts`, `src/contracts/draft.ts`, `src/contracts/request.ts`, `src/contracts/api.ts`, `src/export/review-export.ts`, `src/domain/anchor.ts`, `src/domain/file-tree.ts`, `src/web/monaco/diff-adapter.ts`, `src/web/model/workspace-state.ts`, `src/web/model/workspace-command.ts`, `src/web/model/draft-reconciliation.ts`, `src/web/model/markdown-preview.ts`, `src/web/model/file-tree.ts`, `src/cli/run.ts`, `src/cli/picker.ts`, `src/cli/request.ts` (all read directly, line numbers cited inline).
- `.planning/PROJECT.md` — milestone intent, prior Key Decisions table, reversal statement for "committed Git objects only."

---
*Architecture research for: Cumpa v2.0 Artifact Review*
*Researched: 2026-10-30*
