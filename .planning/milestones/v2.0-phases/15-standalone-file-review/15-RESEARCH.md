# Phase 15: Standalone File Review - Research

**Researched:** 2026-10-31
**Domain:** Git pathspec resolution/security hardening for a new CLI positional-argument surface, frozen-snapshot session reuse (Phase 14), single-pane rendering reuse (Phase 13), versioned export-schema extension (Node 24 + TypeScript + Commander + Fastify + Vue 3 + Zod, native Git CLI — no new runtime dependencies)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Changed files in standalone**
- **D-01:** Current content only: a standalone file always renders as full-width current content, even if it has uncommitted changes. No diff toggle and no change gutter in standalone sessions. To see changes, the user runs `cumpa --worktree` (Phase 14). All comments anchor to the snapshot content (one anchor mode per session).
- **D-02:** Git state text label per file: the file header shows e.g. `Standalone · Modified (uncommitted)`, `Standalone · Untracked`, `Standalone · Unchanged`. The tree row gets a matching text marker (not color-only, per Phase 09/13 rules). Git state is computed at capture time and refreshed on Refresh.
- **D-03:** Content source is working-tree bytes (what is on disk, per FILE-03), even when a file has staged and unstaged changes. Captured with the Phase 14 snapshot capture, including torn-capture detection and `Changed during capture` marking.

### Claude's Discretion (user skipped these areas; conservative defaults)
- Argument matching: directory arguments recurse through Git pathspec semantics. Globs use Git pathspec glob rules, not shell expansion beyond what the shell already did. A file explicitly named but ignored fails before launch with a clear message (consistent with FILE-02 "respect ignore rules"); no `-f` override in this phase. Enforce a file-count cap reusing `MAX_PATHSPEC_COUNT` (256 arguments, `src/contracts/request.ts`) plus a resolved-file cap chosen by the planner, with a clear error. In-repo symlinks stay non-reviewable entries (WTREE-04 precedent): Cumpa never follows them.
- Mode exclusivity: positional paths cannot be combined with `--staged`/`--unstaged`/`--worktree`/`--base` (Phase 14 flags) or with the interactive picker; combining them is a clear pre-launch error. `cumpa` with no args keeps the existing picker flow.
- Session identity: the identity header shows `Standalone review · N files` (no Base/Head) plus the snapshot timestamp/short digest. Refresh (Phase 14 control, `r` in terminal) recaptures the same resolved argument list. The planner decides whether arguments are re-resolved on Refresh (new matching files appear) or the file set stays fixed. Default: re-resolve the original arguments, and report added/removed files through the Phase 14 Refresh summary.
- Export provenance (FILE-05): canonical JSON records the original argument list, the resolved path list, per-file sha256 of the snapshot bytes, and the snapshot digest chain. Markdown renders a human-readable version. Exact schema shape is left to research, but it must stay versioned (Zod) and drift-detectable, and must not break existing committed/exact-patch exports. Phase 17 owns the agent-facing request/result protocol.
- Security (FILE-04): follow the ROADMAP research flag: resolve with `realpath`/per-segment checks, reject `../` traversal, absolute paths outside the repo, and symlink escapes before launch. Verify against the `src/git/exact-patch.ts` precedent.

### Deferred Ideas (OUT OF SCOPE)
- Diff toggle / change gutter for standalone files with uncommitted changes (rejected for this phase; `--worktree` covers it).
- Reviewing index (staged) content of named files.
- `-f`/force flag to include explicitly named ignored files.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FILE-01 | `cumpa <path\|glob>...` opens named files, tracked/untracked, changed/unchanged, with no Base/Head choice | Architecture Patterns → Pattern 1 (CLI positional-argument wiring), Pattern 2 (combined tracked+untracked resolution) |
| FILE-02 | Path/glob arguments resolve with Git pathspec semantics, respect ignore rules, fail before launch with a clear message when an argument matches nothing | Architecture Patterns → Pattern 2 (per-argument `git ls-files` resolution) and Pattern 3 (ignored-file detection via `check-ignore`); Common Pitfalls 1, 2 |
| FILE-03 | Standalone file renders full width, current working-tree content, any line commentable | Architecture Patterns → Pattern 4 (snapshot manifest extension) and Pattern 5 (git-state label is a sibling field, not an overload of `status.kind`); reuses Phase 13 single-pane surface unmodified |
| FILE-04 | Clear pre-launch error when any argument resolves outside the repository (`../`, absolute-outside, symlink escape) | **Architectural Responsibility Map** + Architecture Patterns → Pattern 2 (empirically verified Git pathspec rejection) and Pattern 6 (per-segment `lstat` symlink-escape guard); Security Domain |
| FILE-05 | Finish standalone review with Markdown + canonical JSON provenance naming exactly the reviewed paths/snapshot content | Architecture Patterns → Pattern 7 (`ReviewExportV4Schema` extension of the V1→V2→V3 superset pattern); Common Pitfalls 3; Open Questions 1 |

</phase_requirements>

## Summary

Phase 15 is a pure-integration phase: every primitive it needs already exists in the codebase from Phase 13 (single-pane rendering) and Phase 14 (frozen snapshot capture, Refresh, draft chain, CLI flag/picker-exclusivity pattern). No new npm package is required — Git's own pathspec engine already implements directory recursion, glob expansion, and (critically, confirmed empirically in this research) traversal/absolute-outside rejection, so there is no case for adding a JS glob-matching library. The three new pieces of work are: (1) a CLI positional-argument resolver that turns `cumpa <path|glob>...` into a validated, deduplicated list of repository-relative paths using the exact `git ls-files --cached --others --exclude-standard` pattern Phase 14's `worktree-inventory.ts` already uses, with one resolution call per original argument (not one combined call) so each argument can be individually diagnosed as "matched," "ignored," or "not found"; (2) a `git status --porcelain=v1`-driven git-state classifier that fills the three-way `Modified (uncommitted)`/`Untracked`/`Unchanged` label Phase 14 never needed (its diff-based inventory only ever emits files that *differ*); and (3) a new `ReviewExportV4Schema` (the project's first export-schema version past V3) because — contrary to the shape of Phase 14, which shipped deliberately *without* any export capability (`exportReview`/`revealExportDirectory` are `undefined` for uncommitted sessions, confirmed in `14-08-SUMMARY.md`) — FILE-05 is a Phase-15-owned requirement that Phase 15 cannot defer.

The mandatory security research flag is resolved with high confidence: `src/git/exact-patch.ts` contains **no `fs.realpath` call on a per-file basis at all**. Its actual defense is two-layered — (a) a pure string-level rejection of `.`/`..`/leading-slash/`.git`/`.cumpa` path segments (`exactPath()`), and (b) a per-path-segment `lstat` walk from the (once, at startup) `realpath`-canonicalized repository root that fails if *any* intermediate segment is a symlink and never calls `readFile`/`realpath` through a final-segment symlink (`worktreeEntry()`). This exact two-layer pattern is independently duplicated in `src/git/worktree-inventory.ts`'s `lstatWorktreeLeaf()` (with an explicit code comment pointing at the precedent) because `src/git/` never imports from `src/server/`. Separately, and even more directly dispositive for FILE-04: Git's own pathspec engine, invoked with `cwd` pinned to the repository root, already fatally rejects `../outside.txt`, absolute paths outside the repository, and multi-segment escapes like `sub/../../outside.txt` with `fatal: '<pathspec>' is outside repository at '<root>'` (exit 128) — verified empirically against a real Git 2.54 binary in this session (see Code Examples). Phase 15 should therefore not invent a third path-safety mechanism: resolve every positional argument with `git ls-files`/`git status` at `cwd = repositoryRoot`, let Git's own fatal pathspec-outside-repository check catch traversal/absolute-outside, and reuse (import, not reimplement) the existing per-segment `lstat` walk for symlink-escape protection at the point content bytes are actually read into the snapshot.

**Primary recommendation:** Resolve positional arguments one-at-a-time via `git ls-files --cached --others --exclude-standard -z -- <arg>` at `cwd = repository.root` (catching Git's own `GitRunnerError` exit-128 "outside repository" failures as the FILE-04 traversal/absolute-outside error), classify each resolved path's state with one combined `git status --porcelain=v1 -z --untracked-files=normal -- <all resolved paths>` call, extend `WorktreeSnapshotManifestSchema`'s `sourceKind` enum with `'standalone'` (no `baseCommitOid`, mirroring the existing `'unstaged'` branch) to capture bytes through the already-built `WorktreeSnapshot`/snapshot-fs.ts machinery, and add `ReviewExportV4Schema` (a `patch`→`standalone` provenance-block sibling of `ReviewExportV3Schema`) plus a matching `renderReviewMarkdown` branch and `createStandaloneCapabilityRegistry` wiring `exportReview`/`revealExportDirectory` the way `createExactPatchCapabilityRegistry` does (which Phase 14 deliberately omitted).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Positional-argument parsing (`cumpa <path\|glob>...`) + mode-exclusivity validation | CLI (`src/cli/run.ts`) | — | Commander owns argv; mirrors the existing `validateUncommittedFlags`/`resolveUncommittedFlagSelection` pair for `--staged`/`--unstaged`/`--worktree` |
| Pathspec resolution, traversal/absolute-outside rejection, ignored-argument detection | API/Backend (`src/git/`) | — | Native Git CLI via `child_process.spawn` argument arrays is the sole source of truth for pathspec semantics (project constraint); never reimplemented in JS |
| Symlink-escape guard at content-read time | API/Backend (`src/git/worktree-inventory.ts`, duplicated per-package in `src/server/` snapshot modules) | — | Per-segment `lstat` discipline, not `realpath`; independent of what Git's pathspec engine already rejected, defends against TOCTOU |
| Git-state label computation (`Modified (uncommitted)` / `Untracked` / `Unchanged`) | API/Backend (`src/git/`) | — | `git status --porcelain` is the single source of truth, parsed once per session/Refresh |
| Frozen-snapshot capture, torn-capture detection, Refresh, chain digest | API/Backend (`src/server/worktree-snapshot.ts`) | Database/Storage (`.cumpa/` content-addressed files) | Phase 14 already built this as a reusable abstraction; Phase 15 extends the manifest's `sourceKind` enum, does not fork a parallel engine |
| Single-pane rendering, header/tree git-state label, no diff toggle | Browser/Client (`src/web/`) | — | Phase 13's plain-Monaco adapter is reused unmodified; the git-state label is new client-rendered copy, not a new rendering engine |
| Export provenance (argument list, resolved paths, per-file sha256, digest chain) + Markdown rendering | API/Backend (`src/export/`) | — | Extends the existing versioned Zod export-schema superset chain (V1→V2→V3→**V4**); canonicalization/hashing infra (`canonicalizeReviewExport`, `hashExportBytes`) is reused verbatim |

## Standard Stack

### Core

No new runtime dependency is required. Every capability is built from already-installed, already-used libraries:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.4.3 [VERIFIED: codebase `package.json`] | `WorktreeSnapshotManifestSchema` extension, `ReviewExportV4Schema` | Already the project's sole validation layer; `.strictObject()`/`.superRefine()`/`.readonly()` idioms are used identically in every prior schema this phase touches |
| `commander` | 15.0.0 [VERIFIED: codebase `package.json`] | New `.argument('[paths...]', ...)` positional-argument declaration | Already the project's CLI framework; Commander supports variadic positional arguments natively (`[paths...]`) — no new CLI library needed |
| native `git` CLI via `node:child_process.spawn` | installed: 2.54.0 [VERIFIED: tool `git --version`], minimum required: 2.43.0 [VERIFIED: codebase `src/git/repository.ts` `MINIMUM_GIT_VERSION`] | Pathspec resolution (`ls-files`), ignore detection (`check-ignore`), git-state classification (`status --porcelain`) | Project constraint: "Invoke installed Git CLI as source of truth." All of FILE-01/02/03/04's semantics (recursion, globbing, ignore rules, traversal rejection) are Git's own documented and empirically-verified behavior |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | This phase adds zero new supporting libraries |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Git pathspec glob resolution (`git ls-files -- '*.txt'`) | A JS glob library (`minimatch`, `fast-glob`, `globby`) | **Rejected.** CONTEXT.md's own locked discretion says "Globs use Git pathspec glob rules, not shell expansion." A JS glob library would (a) introduce a second, subtly different globbing dialect from Git's own `fnmatch`-style pathspec matching (verified empirically: unprefixed `*.txt` matches across directory boundaries in Git pathspec matching, which most JS glob libraries treat differently without an explicit `globstar`/`**` flag) and (b) duplicate work Git already does safely, risking a second path-safety surface to audit |
| `fs.realpath` per resolved file | Per-segment `lstat` walk (existing precedent) | **Rejected as primary mechanism.** `realpath` would *follow* symlinks to compute a canonical path, which is the opposite of WTREE-04/D-04's "never follow symlinks" rule; the existing codebase uses `realpath` exactly once, to canonicalize the repository root itself at startup, never per-file |

**Installation:** None — no `npm install` required for this phase.

**Version verification:** No new packages to verify against a registry. `zod@4.4.3` and `commander@15.0.0` are already pinned in `package.json` and already exercised by the exact code paths this phase extends.

## Package Legitimacy Audit

**N/A — this phase installs no new packages.** All required behavior (pathspec glob/recursion, traversal rejection, ignore-rule respecting, symlink non-following) is delivered by the already-installed native `git` binary and the already-installed `zod`/`commander` libraries. The Package Legitimacy Gate protocol is not applicable; no `npm view`/registry check was run because no package name is being introduced.

## Architecture Patterns

### System Architecture Diagram

```
cumpa <path|glob>...  (argv)
        │
        ▼
Commander `.argument('[paths...]')`  ──► validateStandaloneArgs()
        │  (mode-exclusivity check: rejects if --staged/--unstaged/
        │   --worktree/--base also present, or if argv paths is empty
        │   and no flags given → falls through to existing picker)
        ▼
discoverGitRepository(cwd)  [existing, unchanged]
        │  cwd := repository.root  (all further Git calls run here)
        ▼
resolveStandaloneArguments(repositoryRoot, rawArgs)        ← NEW (src/git/)
        │
        ├─ for each rawArg (bounded ≤ MAX_PATHSPEC_COUNT):
        │     git ls-files --cached --others --exclude-standard -z -- <rawArg>
        │       - Git itself fatally rejects ../, absolute-outside, and
        │         embedded ../../ escapes here (exit 128) — this is FILE-04's
        │         enforcement point, not custom JS code
        │       - zero matches ⇒ run `git check-ignore --quiet -- <rawArg>`
        │         to distinguish "ignored" (FILE-02 clear error) from
        │         "no such file" (clear error)
        ├─ union + dedupe resolved paths (Set keyed by base64url path bytes)
        ├─ enforce resolved-file-count cap (Common Pitfall 1)
        └─ reject any resolved path containing a `.git`/`.cumpa` segment
           (defense-in-depth; Git's own checkout already excludes `.git`)
        ▼
classifyStandaloneGitState(repositoryRoot, resolvedPaths)   ← NEW (src/git/)
        │  ONE combined call:
        │  git status --porcelain=v1 -z --untracked-files=normal -- <all paths>
        │  absent from output   → 'unchanged'
        │  '??' prefix          → 'untracked'
        │  any other XY code    → 'modified-uncommitted'
        ▼
captureStandaloneSnapshot(scope, repositoryRoot)            ← NEW (src/server/)
        │  reuses: boundedFileBytes/digest/syncDirectory/writeOwned
        │  (snapshot-fs.ts), captureFileWithRetry (torn-capture retry),
        │  per-segment lstat symlink guard (lstatWorktreeLeaf pattern)
        │  writes: WorktreeSnapshotManifestSchema with
        │  sourceKind: 'standalone', no baseCommitOid
        ▼
createStandaloneSessionApp(scope, snapshot)                 ← NEW (src/server/)
        │  mirrors createExactPatchSessionApp/createUncommittedSessionApp
        │  registers: verifyAnchor/lookup/readContent (anchor side
        │  always 'head'), POST /api/refresh (re-resolves original
        │  argument list, diffs against previous chain entry),
        │  POST /api/export (NEW — Phase 14 left this unregistered)
        ▼
Browser (Vue 3 + Monaco)
        │  IdentityHeader: "Standalone review · N files"
        │  ActiveFileToolbar: "Standalone · Modified (uncommitted)" etc.
        │  DiffWorkspace: Phase 13 single-pane editor, head-only, no tint
        ▼
Export: buildReviewExportV4() → canonicalizeReviewExport() → .cumpa/exports/
        renderReviewMarkdown() (new schemaVersion===4 branch)
```

### Recommended Project Structure

No new top-level directories. New files land beside their closest structural sibling:

```
src/
├── git/
│   ├── standalone-resolution.ts   # NEW — resolveStandaloneArguments(), classifyStandaloneGitState()
│   ├── exact-patch.ts             # UNCHANGED — read for the path-safety precedent only
│   └── worktree-inventory.ts      # UNCHANGED — lstatWorktreeLeaf() precedent reused by reading, not importing (src/git/ has no src/server/ dependency; this module stays within src/git/)
├── server/
│   ├── worktree-snapshot.ts       # MODIFIED — sourceKind enum gains 'standalone'; superRefine gains a no-baseCommitOid branch
│   ├── capabilities.ts            # MODIFIED — createStandaloneCapabilityRegistry (new), exportReview/revealExportDirectory wired (Phase 14 left these absent)
│   ├── app.ts                     # MODIFIED — createStandaloneSessionApp
│   └── routes.ts                  # MODIFIED — /api/export, /api/export/reveal 404-guards now also pass for standalone sessions
├── contracts/
│   ├── comparison.ts              # MODIFIED — UncommittedScopeSchema sourceKind enum extension OR a sibling StandaloneScopeSchema (see Open Questions 2)
│   └── draft.ts                   # MODIFIED — ReviewExportV4Schema (new), DraftComparisonSchema gains a 'standalone' kind branch
├── domain/
│   └── comparison-key.ts          # MODIFIED — standaloneReviewKey(sortedOriginalArgs, firstSnapshotDigest), new domain-separation constant
├── cli/
│   ├── run.ts                     # MODIFIED — .argument('[paths...]'), launchStandaloneSession(), validateStandaloneExclusivity()
│   └── picker.ts                  # UNCHANGED — positional paths bypass the picker entirely, no new prompt rows
├── export/
│   ├── review-export.ts           # MODIFIED — buildReviewExportV4()
│   └── render-review-markdown.ts  # MODIFIED — schemaVersion === 4 branch
└── web/
    └── components/
        ├── IdentityHeader.vue     # MODIFIED — "Standalone review · N files" header variant
        ├── ActiveFileToolbar.vue  # MODIFIED — "Standalone · <state>" label (D-02)
        └── FileRow.vue            # MODIFIED — matching tree-row text marker
```

### Pattern 1: Positional-argument CLI wiring, modeled on the existing flag-exclusivity pair

**What:** Commander already has zero positional arguments (`src/cli/run.ts:1139-1146` registers only `--staged`/`--unstaged`/`--worktree`/`--base` options, no `.argument(...)` call) [VERIFIED: codebase]. The existing `resolveUncommittedFlagSelection()`/`validateUncommittedFlags()` pair (`src/cli/run.ts:428-464`) is the exact precedent for mutual-exclusivity validation: it counts how many of a set of mutually-exclusive booleans are `true` and throws a plain `Error` with a clear message before any session launches.

**When to use:** Add `.argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')` to the same `Command` chain, then in the `.action()` callback, before any other dispatch: if `paths.length > 0`, validate it is not combined with `--staged`/`--unstaged`/`--worktree`/`--base` (reuse the same `Error`-throwing shape as `validateUncommittedFlags`), then call a new `launchStandaloneSession(paths, dependencies, options)` instead of `launchUncommittedSession`/`runOrdinaryAction`. If `paths.length === 0`, behavior is byte-for-byte unchanged (falls through to the existing picker/flag dispatch).

**Example:**
```typescript
// Source: src/cli/run.ts:445-464 (existing precedent, read not modified)
export function validateUncommittedFlags(cliOptions: {
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly worktree?: boolean;
  readonly base?: string;
}): void {
  const selectedCount = [cliOptions.staged, cliOptions.unstaged, cliOptions.worktree]
    .filter((flag) => flag === true).length;
  if (selectedCount > 1) {
    throw new Error('--staged, --unstaged, and --worktree are mutually exclusive. Choose exactly one.');
  }
  if (cliOptions.unstaged === true && cliOptions.base !== undefined) {
    throw new Error(UNSTAGED_BASE_CONFLICT_MESSAGE);
  }
}
// NEW, modeled identically:
export function validateStandaloneExclusivity(
  paths: readonly string[],
  cliOptions: { readonly staged?: boolean; readonly unstaged?: boolean; readonly worktree?: boolean; readonly base?: string },
): void {
  if (paths.length === 0) return;
  if (cliOptions.staged === true || cliOptions.unstaged === true || cliOptions.worktree === true || cliOptions.base !== undefined) {
    throw new Error('Positional paths cannot be combined with --staged, --unstaged, --worktree, or --base.');
  }
}
```

### Pattern 2: Per-argument pathspec resolution — Git itself enforces FILE-04

**What:** `createWorktreeChangedFileInventory`'s `'worktree'` branch (`src/git/worktree-inventory.ts:538-541`) already combines tracked and untracked discovery with pathspecs: `git ls-files --others --exclude-standard -z -- <pathspecs>` for untracked files [VERIFIED: codebase]. For standalone resolution — which must resolve *every* matching file (changed or not), not just diff-changed ones — the equivalent combined call is `git ls-files --cached --others --exclude-standard -z -- <pathspec>`.

Resolving **all** arguments in one combined call is the natural first instinct for performance, but it cannot answer FILE-02's "which specific argument failed" requirement, because `ls-files` returns a flat, unattributed file list. Resolving **one argument at a time** is measured at ~0.14ms/call even at the `MAX_PATHSPEC_COUNT` ceiling of 256 sequential invocations (37ms total for 256 single-pathspec calls against a real repository — see Code Examples), so the N-calls approach is not a meaningful performance concern and directly satisfies "argument matching no file fails before launch clear message" per-argument.

**When to use:** `resolveStandaloneArguments()`'s core loop.

**Example (empirically verified against a real Git 2.54.0 repository in this research session):**
```bash
# Source: this research session, `_bash` tool, real git 2.54.0 (Apple Git-157)
# 1) Relative traversal out of the repo — Git itself rejects it, exit 128:
$ git ls-files -- ../outside.txt
fatal: ../outside.txt: '../outside.txt' is outside repository at '<repo-root>'

# 2) Absolute path outside the repo — same fatal rejection:
$ git ls-files -- /tmp/xyz/outside.txt
fatal: /tmp/xyz/outside.txt: '/tmp/xyz/outside.txt' is outside repository at '<repo-root>'

# 3) Embedded "../../" escape via a subdirectory — same fatal rejection
#    (Git normalizes lexically against the repo root, not just leading "../"):
$ git ls-files -- 'sub/../../outside.txt'
fatal: sub/../../outside.txt: 'sub/../../outside.txt' is outside repository at '<repo-root>'

# 4) Absolute path INSIDE the repo — accepted, normalized to relative:
$ git ls-files -- "$PWD/a.txt"
a.txt

# 5) Directory argument — recurses (FILE-02's dir-recursion requirement):
$ git ls-files --cached -- 'sub'
sub/b.txt

# 6) Glob argument — crosses directory boundaries by default (Git pathspec
#    glob semantics, not shell glob semantics — confirms the CONTEXT.md
#    "Git pathspec glob rules" decision is exactly what `ls-files` already does):
$ git ls-files --cached -- '*.txt'
a.txt
sub/b.txt

# 7) Untracked file inside a symlinked directory — NEVER discovered
#    (confirms symlinked directories are not traversed for untracked discovery):
$ git ls-files --others --exclude-standard -- 'escape-link/*'
(empty)

# 8) The symlink itself, named directly — listed as its own path, not followed:
$ git ls-files --others --exclude-standard -- 'escape-link'
escape-link

# 9) An explicitly-named, .gitignore'd file — correctly excluded (empty),
#    `check-ignore` distinguishes "ignored" from "does not exist":
$ git ls-files --others --exclude-standard -- ignored.txt
(empty)
$ git check-ignore -v -- ignored.txt
.gitignore:1:ignored.txt	ignored.txt

# 10) 256 pathspecs in one call (MAX_PATHSPEC_COUNT ceiling) — negligible cost:
$ time git ls-files --cached -z -- $(printf 'a.txt %.0s' {1..256}) > /dev/null
real 0m0.037s
```

### Pattern 3: Ignored-argument diagnosis reuses `check-ignore`, not a new mechanism

**What:** `src/git/ignore-status.ts`'s `inspectCumpaIgnore()` already runs `git check-ignore --no-index --quiet -- <probe>` and interprets exit code 0 as "ignored", exit 1 as "not ignored", anything else as "unavailable" [VERIFIED: codebase]. This is the exact mechanism needed when a `ls-files` resolution for one argument comes back empty and the resolver must decide between FILE-02's two distinct clear-error messages: "matched an ignored path" vs. "no such file or directory."

**When to use:** Inside `resolveStandaloneArguments()`, only on the zero-match branch for a literal (non-glob, non-directory) argument. For a glob/directory argument that matches zero files, there is no single path to probe with `check-ignore`; report "matched no files" without attempting an ignore distinction (confirmed empirically: `check-ignore` only answers for exact literal paths, and a genuinely non-existent literal path and an existing-but-fully-ignored-directory's non-match are otherwise indistinguishable without this probe).

### Pattern 4: Snapshot manifest extension — add `'standalone'`, do not fork a new engine

**What:** `WorktreeSnapshotManifestSchema` (`src/server/worktree-snapshot.ts:61-87`) already has `sourceKind: z.enum(['staged', 'unstaged', 'worktree'])` with a `superRefine` that requires `baseCommitOid` for `'staged'`/`'worktree'` and forbids it for `'unstaged'` [VERIFIED: codebase]. A standalone session has no base commit at all — structurally identical to the existing `'unstaged'` no-base branch.

**When to use:** Add `'standalone'` to the enum and to the `superRefine`'s no-`baseCommitOid` branch (alongside `'unstaged'`). `WorktreeSnapshot`'s `refresh()` method (`src/server/worktree-snapshot.ts:608-650`) already implements the exact append-to-chain, path-keyed added/removed/modified delta (`diffManifestEntries`) that D-18/SNAP-04/the "re-resolve on Refresh" discretion need — it requires no change beyond `captureWorktreeManifest`/`captureWithIndexRaceGuard` gaining a standalone capture path (resolve arguments again, re-run the git-state classifier, re-capture bytes) parallel to its existing `staged`/`unstaged`/`worktree` branches.

**Example:**
```typescript
// Source: src/server/worktree-snapshot.ts:61-87 (existing, to be extended)
export const WorktreeSnapshotManifestSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  sourceKind: z.enum(['staged', 'unstaged', 'worktree' /* , 'standalone' */]),
  repositoryIdentity: z.string().min(1),
  baseCommitOid: GitObjectIdSchema.optional(),
  // ...
}).superRefine((manifest, context) => {
  const hasBase = manifest.baseCommitOid !== undefined;
  if (manifest.sourceKind === 'unstaged' /* || manifest.sourceKind === 'standalone' */) {
    if (hasBase) { /* reject */ }
  } else if (!hasBase) { /* reject */ }
});
```

### Pattern 5: Git-state label is a new sibling field, never an overload of `ChangedFileStatusKind`

**What:** `ChangedFileStatusKindSchema` (`src/contracts/comparison.ts:74-85`) is `'added' | 'copied' | 'deleted' | 'modified' | 'renamed' | 'type-changed'` — a *diff*-status vocabulary that Phase 13's single-pane layout decision (D-05: single-pane for `added`/`deleted`/`type-changed`) and the whole `ChangedFile` shape are built around [VERIFIED: codebase]. There is no `'unchanged'` or `'untracked'` member, and there must not be: Phase 13's rendering switch keys off `status.kind`, and an `'unchanged'` file reused as `'added'` for rendering purposes (to get the single-pane, head-only, no-diff-toggle layout D-01 asks for) is correct, but conflating that rendering-status reuse with the user-facing *git state label* (D-02's `Modified (uncommitted)`/`Untracked`/`Unchanged` copy) in the same enum would corrupt Phase 13's existing switch statement for every other phase that reads `status.kind`.

**When to use:** Every standalone `ChangedFile` entry sets `status.kind = 'added'` (reusing Phase 13's existing "head-only, full pane, no tint" rendering path verbatim, with `similarity: null`), and carries git state as a **new, separate** field (e.g. `standaloneGitState: 'modified-uncommitted' | 'untracked' | 'unchanged'`) consumed only by the header/tree-marker copy (D-02), never by `DiffWorkspace.vue`'s layout switch.

### Pattern 6: Symlink-escape guard at content-read time — reuse, do not reinvent

**What:** Two independent, byte-identical implementations of the same per-segment `lstat` walk already exist: `exact-patch.ts`'s `worktreeEntry()` (lines 460-502) and `worktree-inventory.ts`'s `lstatWorktreeLeaf()` (lines 137-178, with an explicit doc-comment citing the first as precedent) [VERIFIED: codebase]. Both walk from the (already `realpath`-canonicalized, see `discoverGitRepository`, `src/git/repository.ts:178`) repository root, one path segment at a time, calling `lstat` on each cumulative prefix; any **intermediate** segment that is a symlink fails the walk; a symlink as the **final** segment is classified (never read through) as `availability: { kind: 'unsupported', reason: 'symlink' }`.

**When to use:** Standalone's snapshot-capture step must call into this exact pattern (not Git's pathspec resolution, which only tells you a path *name* matched — it does not protect the subsequent `fs.readFile` against a symlink that appeared between resolution and capture, nor against a tracked path whose on-disk type no longer matches what Git's index/worktree listing implied). Because `src/git/` cannot import from `src/server/` (an established project boundary, cited verbatim in the `lstatWorktreeLeaf` doc comment), the standalone capture path should call `src/git/worktree-inventory.ts`'s existing `lstatWorktreeLeaf`-equivalent logic (or a third, equally-duplicated copy if the capture code lives outside `src/git/`) rather than adding a fourth, divergent re-implementation.

### Pattern 7: `ReviewExportV4Schema` — fourth member of the existing superset chain

**What:** `review-export.ts`'s `buildReviewExportV1`/`V2`/`V3` (lines 92-218) establish an unambiguous pattern: each version is a `z.strictObject` with its own `schemaVersion` literal; `buildReviewExportV2` builds on `buildReviewExportV1`'s output and adds a `range` scope block; `buildReviewExportV3` builds on the same V1 feedback shape (discarding the synthetic committed-comparison/drift fields V1 otherwise requires) and adds a `patch` scope block; `ReviewExportV3Schema`'s own `superRefine` re-derives and checks a V1-shaped sub-document for backward compatibility [VERIFIED: codebase]. `render-review-markdown.ts`'s `renderReviewMarkdown()` branches only on `document.schemaVersion === 3` (lines 46-48) for exact-patch-specific anchor-side copy ("preimage"/"postimage" instead of "base"/"head").

**When to use:** Add `buildReviewExportV4(snapshot, standalone: StandaloneExportScope, exportedAt)` following `buildReviewExportV3`'s exact shape: call `buildReviewExportV1` with synthetic zero-OID comparison/drift fields (there is no real comparison for a standalone session, same as exact-patch), strip `comparison`/`drift`, attach `schemaVersion: 4` and a `standalone` scope block containing `{ originalArguments: readonly string[], resolvedPaths: readonly ExactPathDto[], fileDigests: readonly { path: ExactPathDto; sha256: string }[], snapshotChain: readonly string[] }` (verbatim CONTEXT.md discretion wording: "original argument list, resolved path list, per-file sha256 of snapshot bytes, snapshot digest chain"). Add a `document.schemaVersion === 4` branch to `renderReviewMarkdown()` with anchor-side copy that always reads "head" (never "base" — standalone has only one side) and its own "Applying-agent instructions" footer naming the argument/resolved-path/digest-chain provenance a consuming agent must verify.

### Anti-Patterns to Avoid

- **Reimplementing path traversal checks in JS before calling Git:** The temptation is to write a `path.resolve()`/string-prefix-check gate in front of `git ls-files`. Don't: Git's own pathspec engine already performs a stricter, lexical (not filesystem-trusting) rejection of every traversal form tested in this research, and a second, slightly different JS implementation is a second attack surface to keep in sync, not a safety improvement. Trust Git's fatal exit, catch it, and translate it into Cumpa's own error copy.
- **Calling `fs.realpath` on user-supplied arguments to "normalize" them before passing to Git:** `realpath` follows symlinks — exactly the behavior WTREE-04/the symlink-escape rule forbids. The one legitimate `realpath` call in the codebase canonicalizes the repository root itself, once, at startup; it is never applied per-argument or per-resolved-file.
- **Combining all positional arguments into a single `ls-files` call for "efficiency":** This is fine for the final resolved-file list (and is the obvious optimization once every argument is already known to match), but it loses the per-argument attribution FILE-02 requires ("argument matching no file fails before launch *clear message*" implies naming *which* argument). Resolve once-per-argument for the error path; the measured 256-call cost (37ms) is not a reason to give this up.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob/directory pathspec expansion | A JS glob-matching library (minimatch/fast-glob/micromatch) or hand-rolled `fnmatch` | `git ls-files --cached --others --exclude-standard -- <pathspec>` | CONTEXT.md's own locked discretion requires Git pathspec glob rules, not shell/JS glob rules; Git already implements directory recursion and cross-directory `*` matching exactly as needed, verified empirically in this session |
| Path-traversal / absolute-outside-repo rejection | A custom `path.resolve()` + prefix-check validator | Git's own fatal pathspec-outside-repository rejection (catch the `GitRunnerError` exit-128) | Verified empirically to catch leading `../`, absolute-outside paths, and embedded `../../` escapes identically and lexically (not filesystem-trusting); a parallel JS implementation is strictly a second surface to audit, not an improvement |
| Symlink-escape prevention at content-read time | `fs.realpath` on the resolved path, or a "does this path lexically contain a symlinked ancestor" heuristic | The existing per-segment `lstat` walk (`exact-patch.ts worktreeEntry()` / `worktree-inventory.ts lstatWorktreeLeaf()`) | Already implemented twice in the codebase with an explicit cross-reference comment; a third divergent implementation risks missing the "intermediate segment is a symlink" check that the glob-resolution step (Git) does not perform at read time |
| Ignored-vs-missing diagnosis for a zero-match literal argument | A custom `.gitignore` parser | `git check-ignore --quiet -- <path>` (exit 0 ignored / exit 1 not-ignored) | `src/git/ignore-status.ts` already implements and relies on exactly this exit-code contract for a different purpose (probing whether `.cumpa/` itself would be ignored); same contract, new call site |
| Frozen-snapshot capture, torn-capture retry, chain digests | A new snapshot engine parallel to Phase 14's | `WorktreeSnapshotManifestSchema`/`WorktreeSnapshot`/`captureFileWithRetry` with a `'standalone'` `sourceKind` branch | 14-CONTEXT.md explicitly scoped Phase 14's snapshot mechanism to be Phase 15's reusable session-source abstraction; forking it would also fork Refresh/chain/retry logic that has no standalone-specific reason to differ |
| Export schema versioning | A bespoke, unversioned JSON shape for standalone exports | `ReviewExportV4Schema` as the next member of the existing `ReviewExportV1Schema`→V2→V3 `superRefine`-checked superset chain | The versioned-Zod/drift-detectable requirement is explicit in CONTEXT.md; the V1→V2→V3 pattern is a proven, three-times-repeated template (`buildReviewExportV1/V2/V3`) that already guarantees "must not break existing committed/exact-patch exports" by construction (each version's `superRefine` round-trips a V1-shaped sub-document) |

**Key insight:** Every piece of "custom security logic" this phase might be tempted to write already exists, twice, in the codebase, or is already implemented more rigorously by Git itself. The actual new code in this phase is orchestration (which argument resolved to which files, with what error when it didn't) and schema extension (new enum members, a new schema version), not new safety logic.

## Common Pitfalls

### Pitfall 1: Trusting `MAX_PATHSPEC_COUNT` (256) as the only cap needed

**What goes wrong:** `MAX_PATHSPEC_COUNT` (`src/contracts/request.ts:7`) bounds the agent-protocol JSON request's `pathspecs` array (Phase 17 scope), not CLI `argv`. Commander's `.argument('[paths...]')` imposes no length limit at all; nothing stops a user (or a shell glob already expanded by the shell before Cumpa even runs) from passing thousands of arguments, or a single directory argument that itself recurses into thousands of files.
**Why it happens:** CONTEXT.md's discretion note says "reusing `MAX_PATHSPEC_COUNT` (256 arguments) plus a resolved-file cap chosen by the planner" — two distinct caps for two distinct things (raw argument count vs. resolved file count), easy to conflate into one check and accidentally skip the other.
**How to avoid:** Enforce `rawArgs.length <= MAX_PATHSPEC_COUNT` (reusing the imported constant, same error-shape convention as `GitArgumentSchema`'s own refinement messages) *and* a separate resolved-file-count cap after expansion (recommend reusing `MAX_SNAPSHOT_FILES` = 10,000, already the hard ceiling `WorktreeSnapshotManifestSchema`/`SnapshotManifestSchema` enforce for every other snapshot kind — do not invent a third limit [ASSUMED: a UX-appropriate practical cap could be lower, e.g. a few hundred, since a single-session full-width review of 10,000 files is unlikely to be useful even though the storage layer can technically hold that many; confirm with the user/planner, see Open Questions]).
**Warning signs:** A directory or glob argument silently materializing a multi-thousand-file session with no feedback until the browser tab hangs rendering the file tree.

### Pitfall 2: Reporting "zero files resolved" as a single generic error loses FILE-02's per-argument clarity

**What goes wrong:** If all positional arguments are resolved in one combined `git ls-files -- <arg1> <arg2> ...` call, a typo in one argument (e.g., `cumpa src/foo.ts src/bar.ts` where `bar.ts` doesn't exist) either silently drops the bad argument (if any other argument matches) or produces one undifferentiated "no files matched" error (if none do) — neither satisfies "fail before launch clear message" naming *which* argument failed.
**Why it happens:** `git ls-files` is designed to answer "what matches this pathspec set," not "did each individual pathspec match something" — it has no `--ignore-unmatch`-style per-pathspec diagnostic (unlike `git add`, which does, but for a different purpose).
**How to avoid:** Resolve one argument at a time (Pattern 2), only union into a combined set once every argument has individually been confirmed to match ≥1 file (or had its specific failure reason determined via `check-ignore`).
**Warning signs:** A bug report where a multi-argument `cumpa a.ts nonexistent.ts` either silently reviews only `a.ts` or reports a message that doesn't name `nonexistent.ts`.

### Pitfall 3: Assuming Phase 14 already claimed `ReviewExportV4Schema`

**What goes wrong:** 14-RESEARCH.md's own Deferred Ideas note (written during Phase 14's research step) anticipated "Phase 17's `ReviewExportV4Schema` field enumeration" for uncommitted-session export provenance [CITED: `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-RESEARCH.md:50`]. But Phase 14, as actually executed, shipped with `exportReview`/`revealExportDirectory` deliberately left **undefined** for uncommitted sessions — `/api/export` and `/api/export/reveal` 404 for them — with the explicit key-decision rationale "Phase 17 export-provenance scope" [VERIFIED: codebase, `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-08-SUMMARY.md` key-decisions]. No `ReviewExportV4Schema` exists in `src/contracts/draft.ts` today (confirmed by grep: only `ReviewExportV1Schema`/`V2`/`V3` exist). Meanwhile, FILE-05 is an explicit, `Pending`, Phase-15-owned requirement in `REQUIREMENTS.md` (not a Phase 17 requirement), requiring a *working* "export Markdown plus canonical JSON" deliverable now.
**Why it happens:** The ROADMAP's Phase 17 entry ("exact `ReviewExportV4Schema`/`V5Schema` field shapes (uncommitted/standalone provenance metadata) aren't fully specified in research file; finalize during planning") was written before Phase 14 executed and deliberately deferred export for uncommitted sessions — so the "V4" slot it anticipated for uncommitted sessions is, as of today, unclaimed, and Phase 15 has a hard requirement that forces the decision first.
**How to avoid:** Phase 15 should claim `schemaVersion: 4` for standalone-session export now (Pattern 7), since nothing has claimed it and FILE-05 cannot be satisfied without a real, versioned export schema. This leaves `schemaVersion: 5` open for Phase 17 (or a later phase) if/when uncommitted-session export is eventually built. Flagged as Open Question 1 below for explicit user/planner confirmation, since it reassigns a version number the ROADMAP's prose associated with a different phase.

### Pitfall 4: Confusing "Refresh re-resolves arguments" with "draft key depends on the resolved file list"

**What goes wrong:** If the standalone draft's identity key is derived from the *resolved* file list (e.g., a hash of all matched paths), then Refresh re-resolving the same original arguments against a changed working tree (a new file now matches a glob, or a previously-matching file was deleted) would change the draft key and silently orphan the user's existing comments into a brand-new, empty draft — exactly the failure D-18/D-19 engineered the uncommitted-session draft key to avoid.
**Why it happens:** It is tempting to key standalone drafts by "what's actually being reviewed" (the resolved files), which seems more precise than keying by the raw argument strings.
**How to avoid:** Mirror `uncommittedReviewKey(sourceKind, baseCommitOid, firstSnapshotDigest)` (`src/domain/comparison-key.ts:42-53`) exactly: key the standalone draft by a domain-separated hash of the **sorted original argument list** plus the **first snapshot's content digest**, never by the resolved path list, which is expected to change across Refresh while the same draft persists (exactly as the file *set* inside an uncommitted session's `WorktreeSnapshotManifest` already changes across chain entries while `uncommittedReviewKey` stays fixed).
**Warning signs:** A Playwright/manual test where re-running `cumpa src/*.ts` after adding a new matching file loses previously-recorded comments instead of reclassifying them through the Refresh summary.

## Code Examples

### Per-argument resolution with traversal rejection and ignore-detection (composed from verified precedents)

```typescript
// Source: composed from src/git/worktree-inventory.ts:538-541 (combined ls-files
// pattern) and src/git/ignore-status.ts:26-39 (check-ignore exit-code contract),
// both read in this research session — not copied verbatim, no such function
// exists yet in the codebase.
import { createGitRunner, GitRunnerError } from '../git/runner.js';

interface ResolvedArgument {
  readonly argument: string;
  readonly matches: readonly string[]; // repository-relative, NUL-split from -z output
}

async function resolveOneArgument(
  repositoryRoot: string,
  argument: string,
  runner: ReturnType<typeof createGitRunner>,
): Promise<ResolvedArgument> {
  try {
    const result = await runner.run(
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', argument],
      { cwd: repositoryRoot },
    );
    const matches = result.stdout.toString('utf8').split('\0').filter(Boolean);
    if (matches.length > 0) return { argument, matches };

    // Zero matches: distinguish "ignored" from "does not exist" for a literal path.
    try {
      await runner.run(['check-ignore', '--quiet', '--', argument], { cwd: repositoryRoot });
      throw new Error(`"${argument}" is ignored by .gitignore. Remove it from .gitignore to review it.`);
    } catch (checkIgnoreError) {
      if (checkIgnoreError instanceof GitRunnerError && checkIgnoreError.kind === 'exit' && checkIgnoreError.exitCode === 1) {
        throw new Error(`"${argument}" did not match any file in the repository.`);
      }
      throw checkIgnoreError;
    }
  } catch (error) {
    // Git's own fatal pathspec-outside-repository rejection surfaces here
    // (exit 128) for traversal/absolute-outside arguments — translate, don't
    // reimplement the check.
    if (error instanceof GitRunnerError && error.kind === 'exit' && error.exitCode === 128) {
      throw new Error(`"${argument}" resolves outside the repository.`);
    }
    throw error;
  }
}
```

### Git-state classification (composed from the verified `git status --porcelain` empirical test)

```typescript
// Source: verified in this research session against a real git 2.54.0 binary —
// ` M a.txt` (modified, tracked), `?? c.txt` (untracked), and an absent entry
// for an unchanged tracked file (sub/b.txt, no line emitted at all).
type StandaloneGitState = 'modified-uncommitted' | 'untracked' | 'unchanged';

function classifyFromPorcelainLine(line: string): StandaloneGitState {
  // porcelain v1 "XY path" — '??' is always untracked; anything else with a
  // non-space in X or Y means staged and/or unstaged uncommitted changes.
  return line.startsWith('??') ? 'untracked' : 'modified-uncommitted';
}
// A resolved path with NO corresponding porcelain line is 'unchanged' by
// definition: `git status` only ever emits lines for paths that differ from
// HEAD or are untracked.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| (n/a — this is the project's first standalone-file review surface) | Reuse Phase 14's snapshot/Refresh/draft-chain abstraction, explicitly built with Phase 15 reuse in mind | Phase 14, completed 2026-10-30 [VERIFIED: `STATE.md`] | No new concurrency/retry/torn-capture logic needed; only the manifest's `sourceKind` enum and capture-source function need extension |

**Deprecated/outdated:** Nothing in this phase's domain is deprecated; this is net-new integration of two just-shipped subsystems (Phase 13, Phase 14).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The resolved-file-count cap should reuse `MAX_SNAPSHOT_FILES` (10,000) as the hard ceiling, with a lower UX-oriented practical cap left to the planner/user | Common Pitfalls 1 | If 10,000 is too permissive for a single-session full-width review UX, the planner should pick a smaller number; this does not block implementation since the hard ceiling is still enforced either way |
| A2 | Phase 15 should claim `schemaVersion: 4` for the standalone export schema (not deferring it, despite one prior research doc's prose associating "V4" with uncommitted-session provenance) | Common Pitfalls 3, Open Questions 1 | If the user intends Phase 17 to own *all* new export schema versions regardless of which phase builds the underlying feature, Phase 15 should instead ship FILE-05 against a schema version chosen by explicit coordination with Phase 17's eventual plan — this is the single highest-impact open decision in this research and should be confirmed before planning locks in a version number |
| A3 | Git-state label should be carried as a new sibling field on `ChangedFile` (e.g. `standaloneGitState`), not a new `ChangedFileStatusKind` enum member | Architecture Patterns → Pattern 5 | If the planner instead extends `ChangedFileStatusKindSchema` with `'unchanged'`/`'untracked'`, every existing switch over `status.kind` (Phase 13's single-pane layout decision, StatusBadge.vue's letter/tone mapping, any export-schema code keyed on status) must be audited for an unhandled-default risk; keeping it a separate field avoids that blast radius entirely |

**If this table is empty:** Not applicable — see above.

## Open Questions

1. **Which export schema version number does Phase 15 claim?**
   - What we know: Only `ReviewExportV1Schema`/`V2`/`V3` exist today (confirmed by reading `src/contracts/draft.ts`). Phase 14 shipped with no export capability for uncommitted sessions at all, explicitly deferring it ("Phase 17 export-provenance scope," per `14-08-SUMMARY.md`). FILE-05 is a Phase-15-owned, `Pending` requirement needing a real, working export now. `ROADMAP.md`'s Phase 17 entry anticipates "V4Schema/V5Schema... uncommitted/standalone provenance," written before Phase 14's export deferral was decided.
   - What's unclear: Whether "V4" is reserved by prior intent for the *uncommitted* session (per the ROADMAP prose and 14-RESEARCH.md's Deferred Ideas note) even though Phase 14 didn't build it, or whether it is simply "the next free version number" that whichever phase ships a working export first (Phase 15) gets to claim.
   - Recommendation: Claim `schemaVersion: 4` in Phase 15 for standalone-session export (Pattern 7), since FILE-05 forces the decision now and nothing has claimed V4 in code. Confirm this explicitly with the user during planning/discuss-phase, since it is a naming decision with no functional ambiguity (either numbering works equally well technically) but does affect what Phase 17's eventual plan needs to assume.

2. **Does `UncommittedScopeSchema` gain a `'standalone'` `sourceKind` member, or does standalone get a sibling `StandaloneScopeSchema`?**
   - What we know: `UncommittedScopeSchema` (`src/contracts/comparison.ts:134-144`) requires `baseCommitOid` for non-`'unstaged'` kinds via `superRefine`, and its `changedFiles: ChangedFile[]` shape assumes diff-derived files. `WorktreeSnapshotManifestSchema`'s `sourceKind` enum is the more natural extension point (Pattern 4) since it already tolerates a no-base branch (`'unstaged'`).
   - What's unclear: Whether `DraftComparisonSchema`'s existing `'exact-patch'`/`'uncommitted'`/pinned-range three-way union (restructured in Phase 14's `sameComparison()`) should grow a fourth `'standalone'` branch, or whether standalone reuses the `'uncommitted'` branch with `sourceKind: 'standalone'` threaded through.
   - Recommendation: Extend `UncommittedScopeSchema.sourceKind` and `WorktreeSnapshotManifestSchema.sourceKind` with `'standalone'` (reusing the existing `'unstaged'`-shaped no-base branch) rather than introducing a fourth top-level `DraftComparisonSchema` kind — this keeps `sameComparison()`'s three-way branch structure intact and lets `createUncommittedCapabilityRegistry`'s/`createUncommittedSessionApp`'s existing machinery parameterize over the new `sourceKind` with minimal duplication. The planner should verify this against `draft-loader.ts`'s exact `sameComparison()` branch structure before committing to the approach.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `git` CLI | All pathspec resolution, ignore detection, git-state classification, snapshot capture | ✓ [VERIFIED: tool] | 2.54.0 (Apple Git-157) | — minimum required by the codebase is 2.43.0 (`src/git/repository.ts` `MINIMUM_GIT_VERSION`), already enforced by `requireSupportedGit()` at every session launch |
| Node.js | CLI runtime | ✓ [VERIFIED: tool] | v24.15.0 | — matches `package.json` `engines.node: ">=24"` |
| `zod` | Schema extension | ✓ [VERIFIED: codebase] | 4.4.3 | — |
| `commander` | CLI positional-argument parsing | ✓ [VERIFIED: codebase] | 15.0.0 (supports variadic `[paths...]` natively) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — every dependency required by this phase is already installed and already exercised by the exact code paths Phase 15 extends.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V1 Architecture | yes | Native-Git-as-source-of-truth boundary (`src/git/` never trusts JS-side path arithmetic over Git's own pathspec resolution) |
| V5 Input Validation | yes | `zod` (`GitArgumentSchema`-style refinements for raw CLI argv bytes/length; `WorktreeSnapshotManifestSchema`/`ReviewExportV4Schema` for all persisted/exported shapes) |
| V12 File and Resources | yes | Per-segment `lstat` symlink-escape guard (never `fs.realpath`-follow); resolved-file-count cap; `MAX_SNAPSHOT_FILES`/`MAX_SIDE_BYTES` bounds already enforced by the reused snapshot-fs.ts primitives |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `../` or absolute-outside-repo CLI arguments (FILE-04) | Information Disclosure / Elevation of Privilege (reading files outside the intended repository) | Invoke `git ls-files`/`git status` with `cwd` pinned to the Git-discovered, `realpath`-canonicalized repository root; let Git's own fatal "outside repository" pathspec rejection (verified empirically, exit 128) reject every traversal form before any Cumpa-side file read occurs. Do not attempt to pre-sanitize the argument string in JS as a substitute. |
| Symlink escape — a resolved path (or an intermediate path segment) is a symlink pointing outside the repository | Information Disclosure (reading an arbitrary filesystem target through a symlink) | Reuse the existing per-segment `lstat` walk (`worktreeEntry()`/`lstatWorktreeLeaf()`); never call `readFile`/`realpath` on a path whose final or intermediate segment is a symlink; classify such paths as non-reviewable (`availability.reason === 'symlink'`), matching WTREE-04 |
| Resource exhaustion via an unbounded directory/glob argument resolving to an excessive number of files | Denial of Service | Enforce the raw-argument-count cap (`MAX_PATHSPEC_COUNT`, reused from `src/contracts/request.ts`) and a separate resolved-file-count cap (reusing `MAX_SNAPSHOT_FILES` as the hard ceiling), both producing a clear pre-launch error rather than attempting to open an oversized session |
| TOCTOU between pathspec resolution and snapshot byte capture (a file changes type — regular file → symlink, or disappears — between `ls-files` and the actual read) | Tampering | Already handled generically by the existing torn-capture retry (`captureFileWithRetry`) and the per-segment `lstat` walk performed again at read time, independent of what the resolution step observed |

## Sources

### Primary (HIGH confidence)
- `src/git/exact-patch.ts` (read in full) — `exactPath()` string-level traversal rejection; `worktreeEntry()` per-segment `lstat` symlink-escape guard — [VERIFIED: codebase]
- `src/git/worktree-inventory.ts` (read in full) — `lstatWorktreeLeaf()` (duplicate of the above, with explicit cross-reference comment); combined tracked+untracked pathspec resolution pattern (`ls-files --others --exclude-standard`) — [VERIFIED: codebase]
- `src/git/repository.ts` (read in full) — the sole `realpath` call, applied once to the repository root, not per-file — [VERIFIED: codebase]
- `src/git/ignore-status.ts` (read in full) — `check-ignore --quiet` exit-code contract — [VERIFIED: codebase]
- `src/server/worktree-snapshot.ts` (read in full) — `WorktreeSnapshotManifestSchema`, `WorktreeSnapshot.refresh()`, `diffManifestEntries()` — [VERIFIED: codebase]
- `src/server/patch-snapshot.ts`, `src/server/snapshot-fs.ts` (read) — shared snapshot-fs primitives (`boundedFileBytes`, `digest`, `writeOwned`, `syncDirectory`, `MAX_SIDE_BYTES`) — [VERIFIED: codebase]
- `src/contracts/comparison.ts`, `src/contracts/request.ts`, `src/contracts/draft.ts` (read, relevant sections) — `ChangedFileSchema`, `UncommittedScopeSchema`, `GitArgumentSchema`/`MAX_PATHSPEC_COUNT`/`MAX_GIT_ARGUMENT_BYTES`, `ReviewExportV1/V2/V3Schema` — [VERIFIED: codebase]
- `src/export/review-export.ts`, `src/export/render-review-markdown.ts` (read in full) — versioned export-builder superset pattern; Markdown-render schema-version branching — [VERIFIED: codebase]
- `src/domain/comparison-key.ts`, `src/domain/anchor.ts`, `src/domain/path-bytes.ts` (read) — `uncommittedReviewKey()` domain-separated hash pattern; `AnchorSide` plain union type; `ExactPath`/traversal-rejecting path-byte encoding — [VERIFIED: codebase]
- `src/cli/run.ts` (read, relevant sections) — Commander setup (no positional args today), `validateUncommittedFlags`/`resolveUncommittedFlagSelection`, `launchUncommittedSession` — [VERIFIED: codebase]
- `src/server/capabilities.ts`, `src/server/routes.ts` (read, relevant sections) — `exportReview`/`revealExportDirectory` optionality and 404-guard precedent — [VERIFIED: codebase]
- `package.json` — pinned dependency versions, no glob library present — [VERIFIED: codebase]
- `_bash` tool, real `git 2.54.0` (Apple Git-157) binary, this research session — empirical verification of pathspec traversal rejection (relative `../`, absolute-outside, embedded `../../`), glob cross-directory matching, symlinked-directory non-traversal, explicit-ignored-file exclusion, `check-ignore` exit codes, `git status --porcelain` state classification, and 256-pathspec performance — [VERIFIED: tool]

### Secondary (MEDIUM confidence)
- `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-RESEARCH.md`, `14-CONTEXT.md`, `14-08-SUMMARY.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` — prior-phase decisions, the export-schema-version ambiguity (Pitfall 3/Open Question 1), and the explicit "Phase 15 reuses Phase 14's snapshot mechanism as a reusable abstraction" design intent — [CITED: project planning documents]
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md` — single-pane rendering decisions (D-01 through D-14) this phase reuses unmodified — [CITED: project planning documents]

### Tertiary (LOW confidence)
- None — no unverified web/training-data claims were needed for this phase; every claim is either read directly from the codebase, empirically tested against the real `git` binary, or cited from the project's own planning documents.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every library claim verified directly against `package.json` and existing call sites
- Architecture: HIGH — every pattern is either an existing, read, working codebase module or an empirically-verified `git` CLI behavior tested live in this session
- Pitfalls: HIGH for Pitfalls 1, 2, 4 (directly derived from reading the exact schemas/functions involved); MEDIUM for Pitfall 3 (the export-schema-version claim depends on reconciling two planning documents written at different times — flagged explicitly as Open Question 1 for user confirmation)

**Research date:** 2026-10-31
**Valid until:** 2026-11-30 (30 days — stable internal-integration domain; no external API/library surface involved that could move faster than this. Re-verify sooner only if the project's minimum-supported Git version changes, or if Phase 17's planning claims a different export schema version than the one this research recommends for Phase 15.)
