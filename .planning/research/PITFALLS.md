# Domain Pitfalls

**Domain:** Local-first Git review tool — adding uncommitted-source review, standalone-file review, single-pane diff rendering, and rendered Markdown preview to an existing committed-object-only architecture
**Researched:** 2026-10-30
**Confidence:** HIGH (codebase-grounded) for architectural/integration pitfalls; MEDIUM for general Git worktree edge-case enumeration (cross-checked against Git documentation behavior, not live-tested against every OS/filesystem combination)

## Critical Pitfalls

### Pitfall 1: Reusing the commit-OID draft/anchor identity scheme for uncommitted content

**What goes wrong:**
Drafts, comments, and durable anchors are keyed and content-addressed entirely off immutable commit object IDs today. `comparisonKey()` hashes only `baseCommitOid`/`headCommitOid` (`src/domain/comparison-key.ts:18-24`), and `buildDurableAnchor()` embeds `blobOid` directly into both the anchor's `contextHash` and its `uniqueKey` (`src/domain/anchor.ts:82-113,136-149`). If the new Staged/Unstaged/Working-tree sources are wired through the same key derivation using only the resolved base commit OID (ignoring the dirty content itself), two different working-tree states compared against the same base collapse onto the *same* draft file and the *same* anchor identity. A developer's comments from yesterday's working tree would silently reattach to today's completely different working tree, defeating the "immutable anchors, never silently relocated" guarantee that is this product's core value proposition.

**Why it happens:**
The existing precedent in the same codebase masks the trap: `ExactPatchValidationTarget` already has a `'worktree'` kind (`src/contracts/comparison.ts:50-55`) and `PatchSnapshot` already proves this is solvable — but it solves it by hashing frozen *content* into a `reviewKey`/`provenanceDigest` (`src/server/patch-snapshot.ts:134-141,167-169`, domain tag `cumpa-exact-patch-review-key-v1`), not by reusing a commit-OID key. It is easy to skim that precedent, see "worktree" already modeled, and wire the new uncommitted-source feature straight into `comparisonKey()` without noticing it needs the content-digest scheme instead.

**How to avoid:**
Give each uncommitted source kind (staged/unstaged/working-tree) its own key derivation domain separator (mirroring `PATCH_KEY_DOMAIN`), built from the resolved base commit OID **plus a content digest of the frozen snapshot** (blob hashes for tracked paths via `git hash-object`/index SHA, plus a digest over untracked file bytes). Anchors for worktree-side lines cannot carry a real Git blob OID (worktree/index content is not a committed object) — use the same `git hash-object --stdin` (no `-w`) technique Git itself uses for `diff --no-index`/`diff` blob headers so the anchor's `blobOid` field stays meaningful and comparable across Refresh cycles, rather than inventing an out-of-band hash format that breaks the existing anchor schema contract.

**Warning signs:**
- New code calls `comparisonKey(baseOid, headOid)` where `headOid` is a constant sentinel (e.g., `'WORKTREE'`) instead of varying with content.
- Draft files for different working-tree states end up at the same `.cumpa/drafts/<key>.json` path.
- Anchor `uniqueKey`/`contextHash` functions receive a hardcoded or absent `blobOid` for worktree-side lines.

**Phase to address:**
Phase introducing uncommitted-source comparison plumbing (before any UI work depends on draft/anchor identity).

---

### Pitfall 2: Freeze-at-launch snapshot races a filesystem that keeps changing underneath it

**What goes wrong:**
The milestone requires "Working-tree snapshot frozen at session start." A snapshot built by walking `git status --porcelain=v2 -z` (or similar) to get the file list, then separately `read()`-ing each file's bytes, is not atomic. Between listing and reading, an agent or editor can write, delete, rename, or truncate a file (agents are explicitly the primary actor producing this content, and they write iteratively). The result is a snapshot with some files reflecting state T0 and others reflecting state T1, a `ENOENT` on a file that was listed but then deleted, or a short/corrupt read on a file mid-write — all while reporting it to the user as one coherent "frozen" moment.

**Why it happens:**
`git status` and a subsequent filesystem read are two independent syscalls with a window between them; nothing in Git's plumbing commands gives a single atomic "list + read all working-tree bytes" primitive the way `git cat-file` does for committed objects. The existing `PatchSnapshot`/`worktreeEntry()` machinery (`src/server/patch-snapshot.ts:243-275`) already reads worktree bytes for the *exact-patch* worktree-target case, but that is a single-file read grounded against one already-known target, not an enumerate-then-read-N-files snapshot — the new uncommitted-source feature introduces the N-file race that doesn't exist today.

**How to avoid:**
Capture size+mtime (or a content hash) per file at listing time, then re-stat (or re-hash) immediately after reading each file's bytes and reject/flag the file if it changed between stat and read (same pattern `PatchSnapshot`'s `boundedFileBytes` + manifest `sha256` verification already uses for single files — extend it to the snapshot's bulk path). Missing files encountered mid-walk must be classified as "removed during snapshot" rather than silently excluded or treated as parse errors that abort the whole launch.

**Warning signs:**
- Snapshot code has a list step and a read step with no verification that the file is unchanged between them.
- No test exercises "file modified between enumeration and read" or "file deleted after `git status` reported it."
- Snapshot failures surface as unhandled `ENOENT` exceptions rather than a classified per-file state.

**Phase to address:**
Phase implementing the working-tree snapshot/freeze mechanism, with its own fault-injection tests (the repo already has a precedent test style for this: `tests/api/draft-recovery-faults.test.ts`).

---

### Pitfall 3: Untracked-file enumeration pulls in `.cumpa/`, ignored build output, or escapes the repo via symlinks

**What goes wrong:**
"Working tree incl. untracked files respecting `.gitignore`" sounds like a single `git status` flag, but getting it exactly right has several traps: (a) forgetting `--exclude-standard` pulls in *everything* `.gitignore`-ignored, including the tool's own `.cumpa/` directory and typical `node_modules`/`dist` trees, producing a multi-gigabyte "diff" nobody wants reviewed; (b) Git's untracked listing can include symlinks (and the existing patch/availability code already treats any `120000` mode path as explicitly unsupported — `src/git/exact-patch.ts:433`, `src/git/availability.ts:58-59`, `src/git/inventory.ts:48`); if the new untracked-file walk doesn't apply the same `lstat`-before-read discipline (`src/git/exact-patch.ts:472-478`), a crafted untracked symlink pointing outside the repository root could have its target bytes read and displayed as if it were repository content; (c) sparse-checkout and submodule boundaries mean "working tree" is not simply "every file under the root" — files outside the sparse cone or inside submodule directories need the same `unsupported: 'submodule'` treatment the comparison path already applies (`src/git/exact-patch.ts:432`, `src/git/availability.ts:34`).

**Why it happens:**
`.cumpa/`'s own gitignore entry (`src/server/gitignore-capability.ts:7`, rule `/.cumpa/\n`) is a *repository-config* fact, not something the diff/inventory layer currently has to reason about, because today's comparisons only ever touch committed objects where `.cumpa/` can never appear (it's gitignored, so it's never committed). Uncommitted-source review is the first feature where the tool reads the live filesystem directly, so a safety property that was previously "free" (committed trees can't contain `.cumpa/`) must now be enforced explicitly.

**How to avoid:**
Reuse `git status --porcelain=v2 -z --ignore-submodules --no-renames` (or `ls-files --others --exclude-standard`) so Git's own exclude-standard logic (`.gitignore`, global excludes, `.git/info/exclude`) does the filtering — never hand-roll gitignore matching. Explicitly skip the repository's `.cumpa/` directory even if somehow not excluded (defense in depth). For every untracked path, `lstat` first and reject symlinks the same way `exact-patch.ts` already does, rather than `readFile`-ing through them. Apply the existing submodule (`160000`)/sparse-checkout skip rules uniformly to the new untracked walk, not just to the tracked diff path.

**Warning signs:**
- Untracked file list includes anything under `.cumpa/`, `node_modules/`, or `dist/` in manual testing.
- New untracked-walk code calls `readFile`/`stat` (follows symlinks) instead of `lstat` first.
- No test places a symlink in the untracked set pointing to `/etc/passwd` or similar outside-repo target and asserts it's rejected/unsupported, not rendered.

**Phase to address:**
Phase implementing Working-tree (untracked-inclusive) source discovery.

---

### Pitfall 4: Refresh silently relocates or fabricates anchors instead of reclassifying

**What goes wrong:**
The product's existing hard invariant — "anchors are immutable, never relocated silently" — already has a tested implementation for the *comparison-changes* case (`src/web/model/draft-reconciliation.ts` reconciles comments against the current file set and marks unmatched anchors `unavailable` rather than moving them; `AnchorVerification` has explicit `'stale' | 'orphaned'` states, `src/domain/anchor.ts:42-45`). It's tempting, when implementing the new explicit Refresh action, to "helpfully" re-run the anchor builder against the refreshed snapshot and treat a same-line/same-path match as "still verified," or to shift a comment to a new line number if the surrounding context looks similar (a diff-style fuzzy match). Either move breaks drift-detectability: a refreshed anchor that silently updates its recorded `blobOid`/context erases the evidence that the agent's artifact changed underneath the comment.

**Why it happens:**
Refresh is new interaction surface with no existing precedent in this codebase (the closest analog, selector drift in `src/git/selector-drift.ts`, handles branch-pointer drift between launches, not an *in-session* explicit re-snapshot action), so there's no established pattern to copy from and a developer reaching for "just recompute and compare" will naturally reach for *updating* the anchor on a plausible match rather than *re-verifying* the original recorded anchor against new content and reclassifying on mismatch.

**How to avoid:**
Refresh must call the existing `verifyDurableAnchor(recorded, current)` (`src/domain/anchor.ts:153-178`) against the new snapshot's content for the *same recorded* anchor — never rebuild/replace the stored anchor. A changed `contextHash` after Refresh must produce `state: 'stale'`/`'orphaned'` exactly like today's post-comparison reconciliation, with the original recorded anchor and context preserved in the export for drift inspection, not overwritten.

**Warning signs:**
- Refresh code path writes new `blobOid`/`contextHash` values into an existing comment's stored anchor.
- A comment "follows" content that moved to a different line number after Refresh without being marked stale.
- No test exercises "comment on line 10, file edited so content shifts to line 12, Refresh" and asserts the comment stays anchored to its original recorded line/context with a stale/orphaned classification, not a relocated one.

**Phase to address:**
Phase implementing explicit Refresh for working-tree sessions.

---

### Pitfall 5: Standalone file review admits path traversal or symlink escape outside the repository

**What goes wrong:**
"`cumpa` CLI paths/globs open named files (changed or not)" is the first feature where arbitrary user- or agent-supplied path strings choose files to display, outside the Git-object-graph safety net that every prior feature relied on. A path like `../../../../etc/passwd`, an absolute path outside the repo, or a glob that expands through a symlink pointing outside the repository root can all end up read and served to the browser as "reviewable content" unless explicitly bounded to the repository root.

**Why it happens:**
Every existing content-reading path in this codebase is reached only after Git has already resolved a path to a blob OID inside a tree the comparison pinned (`src/git/objects.ts` reads by OID, never by raw filesystem path from user input) — except the already-existing `exact-patch.ts` worktree-target path, which *does* read raw filesystem paths but does so defensively (`lstat` each path segment, reject symlinks mid-path, bound entry size — `src/git/exact-patch.ts:472-480`). A new standalone-file CLI argument handler that resolves paths/globs with a plain `path.resolve(cwd, arg)` + `readFile` and skips that per-segment `lstat` discipline reopens exactly the traversal class that precedent already solved once.

**How to avoid:**
Resolve every standalone path/glob argument to a real path with `fs.realpath` (or manual per-segment `lstat`, matching the existing `exact-patch.ts` worktree-entry walk) and reject any result outside the repository root (`discoverGitRepository`'s resolved root, `src/git/repository.ts`) before reading bytes. Reject mid-path symlinks the same way `exact-patch.ts:472-474` already does. Glob expansion must run rooted at the repository root with no `..` segments permitted to escape it, and must apply the same binary/oversized/non-UTF-8 `Availability` classification (`src/git/availability.ts`) standalone files already need for consistent "unsupported" rendering.

**Warning signs:**
- Standalone-file resolution code calls `path.resolve`/`readFile` without a `realpath`-and-root-check step.
- No test passes `../`-containing or absolute out-of-repo paths/globs and asserts rejection.
- No test places a symlink inside the repo pointing outside it and opens that path standalone.

**Phase to address:**
Phase implementing standalone file review (CLI path/glob intake).

---

### Pitfall 6: Rendered Markdown preview introduces an XSS/CSP gap the rest of the app doesn't have

**What goes wrong:**
Every surface in the app today is either Monaco-rendered plain text or Vue-templated structured data — there is no path anywhere in the current codebase that parses untrusted text into HTML and injects it into the DOM. Markdown preview is new: it must take artifact text (frequently agent-authored, i.e., semi-trusted but not fully trusted) and render it as HTML. A naive `v-html="markdownToHtml(source)"` binding opens classic stored-XSS vectors (`<img onerror=...>`, `<a href="javascript:...">`, raw `<script>`/`<style>` blocks passed through by a permissive Markdown renderer) that nothing else in the app currently has to defend against.

**Why it happens:**
The existing strict CSP (`src/server/security.ts:15-28`) — `script-src 'self'` with **no** `'unsafe-inline'`, `img-src 'self'` with **no** `data:` — blocks *script execution* and *external image loads*, which gives a false sense of safety; it does **not** block `javascript:` URI click-through on an `<a href="javascript:...">`, does not block DOM-based attribute-based exfiltration via `<a>`/`<form>` if `form-action` weren't already `'none'`, and does not sanitize the HTML tree at all. CSP is defense-in-depth, not a substitute for sanitization.

**How to avoid:**
Render Markdown to a sanitized subset (disallow raw HTML passthrough entirely, or sanitize with an allowlist-based sanitizer such as DOMPurify configured to strip `script`/`style`/event-handler attributes/`javascript:`/`data:` URIs) before any `v-html`-equivalent insertion. Keep the existing CSP unchanged (it already correctly has no `img-src data:` or `'unsafe-inline'` — do not loosen it to accommodate the renderer; fix the renderer/sanitizer instead). Treat rendered Markdown output as another `Availability`-classified view, not a trusted-by-default one.

**Warning signs:**
- Markdown preview code uses `v-html` with output from a Markdown library's default (HTML-permissive) mode and no sanitizer call in between.
- Any change to `src/server/security.ts`'s CSP (e.g., adding `'unsafe-inline'` to `script-src` or `data:` to `img-src`) made specifically to accommodate the Markdown renderer, rather than fixing the renderer.
- No test renders a Markdown document containing `<script>`, `<img onerror>`, or `[link](javascript:alert(1))` and asserts the dangerous construct is stripped/neutralized in the rendered DOM.

**Phase to address:**
Phase implementing rendered Markdown preview.

---

### Pitfall 7: Export schema extension breaks V1–V3 consumers instead of extending them

**What goes wrong:**
`contracts/draft.ts` already layers V1→V2→V3 export schemas with explicit backward-compatibility superRefine checks — V2 must "retain valid version 1 feedback" and V3 re-derives and checks a V1-shaped feedback subset (`src/contracts/draft.ts:349-380,408-423` and `src/export/review-export.ts:157-217`). Adding uncommitted-source and standalone-file export support by mutating `ReviewExportV1Schema`/`V2Schema`/`V3Schema` in place (e.g., loosening `RangeReviewScope`/`ExactPatchExportScope` to also accept an uncommitted-source scope) rather than introducing a new discriminated scope/version breaks every agent integration built against the documented V1–V3 shapes: fields they rely on for range/patch-specific scope could become optional, ambiguous, or differently typed underneath them with no version bump to signal the change.

**Why it happens:**
The new "uncommitted" and "standalone-file" review scopes don't fit either existing scope shape (`RangeReviewScope` assumes two pinned commit endpoints; `ExactPatchExportScope` assumes a submitted patch) — someone racing to ship V2.0 features may reach for the path of least resistance (loosen an existing union/add optional fields to an existing version) instead of doing the work of adding a new versioned export variant following the established V1→V2→V3 pattern.

**How to avoid:**
Add a new export version (e.g., V4) with its own discriminated `schemaVersion` literal and its own scope type for uncommitted/standalone sources, following the exact pattern `buildReviewExportV3` already demonstrates for extending without breaking earlier versions (`src/export/review-export.ts:181-217`) — including a superRefine check that the new version still embeds valid V1-shaped feedback. Never add new required/narrowing fields to `ReviewExportV1Schema`/`V2Schema`/`V3Schema` themselves. Parsing (`parseCanonicalReviewExport`, `src/export/review-export.ts:223-232`) must keep accepting all prior versions unchanged.

**Warning signs:**
- A diff touches `ReviewExportV1Schema`, `ReviewExportV2Schema`, or `ReviewExportV3Schema`'s field sets rather than adding a new schema.
- `RangeReviewScope` or `ExactPatchScope` gains fields that are only meaningful for uncommitted/standalone review.
- Existing export fixture tests for V1/V2/V3 (`tests/api/export.test.ts`, `tests/api/export-publication.test.ts`) need changes to keep passing after the new feature lands — that's a signal of a breaking change, not an additive one.

**Phase to address:**
Phase implementing agent stdin request/export extension for uncommitted and standalone-file review.

---

### Pitfall 8: Stdin request protocol version collision between "add a mode" and "bump the version"

**What goes wrong:**
`AgentReviewRequestSchema` is a `discriminatedUnion('mode', …)` fixed at `schemaVersion: z.literal(1)` with exactly two modes today, `'revisions'` and `'patch'` (`src/contracts/request.ts:62-87`), and the CLI's version-mismatch detection explicitly checks `schemaVersion !== 1` to produce the `unsupported-version` error with message "Use schemaVersion 1" (`src/cli/request.ts:19-25,38-46`). Adding `'uncommitted'` and `'files'` modes under the *same* `schemaVersion: 1` is actually the *correct* additive move (new discriminant branch, old branch literal unchanged) — but it's easy to get backwards: either (a) bumping to `schemaVersion: 2` unnecessarily and breaking every existing agent integration sending `schemaVersion: 1` for the already-shipped revisions/patch modes, or (b) adding the new modes without updating the `'invalid-request'` error message/CLI help text that still says only range/patch review is supported, confusing agents that get a generic rejection for a mode that's actually implemented but not yet accepted by a stale validator somewhere in the pipeline (e.g., `cli/run.ts`'s dispatch switch not extended for the new modes even though the schema accepts them).

**Why it happens:**
The schema, the CLI stdin reader's error messages, and the downstream dispatch/handling code in `cli/run.ts` are three separate places that all encode "which modes exist" — adding a mode to the Zod union alone (contracts/request.ts) without touching the other two leaves a schema-valid request that the rest of the pipeline doesn't know what to do with, or stale human-facing error copy that undersells what's now supported.

**How to avoid:**
Add `'uncommitted'` and `'files'` as new discriminant branches on `AgentReviewRequestSchema` under the existing `schemaVersion: z.literal(1)` (this is additive, not breaking, matching Zod discriminated-union semantics). Update `requestErrorMessages['invalid-request']` (`src/cli/request.ts:25`) to describe all four modes. Grep every `mode === 'revisions'`/`mode === 'patch'` exhaustive switch (`cli/run.ts` and wherever requests are dispatched) and extend it for the two new modes — TypeScript's exhaustiveness checking on the discriminated union will catch missed switches only if the switch doesn't have a default/fallthrough case already.

**Warning signs:**
- `schemaVersion` literal changes to `2` anywhere.
- `requestErrorMessages['unsupported-version']`/`'invalid-request'` strings still mention only two modes after the new modes ship.
- A `switch (request.mode)` somewhere has a `default: throw` or silent no-op that would swallow the new modes rather than a compile error from exhaustiveness checking.

**Phase to address:**
Phase implementing agent stdin request extension for uncommitted/standalone-file review.

---

### Pitfall 9: Single-pane added/deleted rendering silently changes line-anchor semantics for existing comments

**What goes wrong:**
Monaco's diff editor is currently configured with `renderSideBySide: true` unconditionally (`src/web/monaco/diff-adapter.ts:123,136-137`), and the anchor/comment model is keyed by `(side: 'base' | 'head', line)` throughout (`src/web/monaco/diff-adapter.ts:19-23`, `src/domain/anchor.ts:6,17-18`). Switching added/deleted files to a single full-width pane (likely a plain `IStandaloneCodeEditor` rather than `createDiffEditor`, since one side is always empty for pure adds/deletes) risks either (a) introducing a *third* line-addressing scheme that doesn't map cleanly onto the existing `AnchorSide`/`DiffSide` type used everywhere comments are stored and reconciled, or (b) reusing the diff-editor's side convention incorrectly for the single-pane case (e.g., always writing anchors as `side: 'head'` for an added file's content when the file is actually all-new content that has no "base" side at all, versus a deleted file where the shown content is entirely base-side).

**Why it happens:**
Added files today already route through `base: { path: '', text: '' }` with empty-base content on one Monaco side (standard diff-editor idiom for additions) — the single-pane change removes the empty side from *rendering* but the anchor plumbing underneath still needs a side label for every comment. Getting this wrong doesn't crash anything — it silently writes `side: 'base'` anchors for comments on an added file's content (or vice versa), which then fail to reconcile against the correct `exactFileIndex` lookup in `draft-reconciliation.ts:12-14` (`selectedPath` keys strictly off `side === 'base' ? oldPath : newPath`), making every comment on a single-pane added/deleted file appear `unavailable` after the very next reconciliation.

**How to avoid:**
For single-pane added files, anchor all comments as `side: 'head'` (the file's only existing content is head-side, matching `oldPath === undefined, newPath = <path>`); for single-pane deleted files, anchor all comments as `side: 'base'` (matching `oldPath = <path>, newPath === undefined`). This is exactly the convention `draft-reconciliation.ts`'s `selectedPath()` already expects — no new side value or anchor schema change needed, only ensuring the single-pane editor's comment-creation path picks the correct existing `AnchorSide` deterministically from the file's `ChangedFileStatus`, not from which Monaco pane the click happened to land in.

**Warning signs:**
- New single-pane-specific code introduces a new `AnchorSide`-like literal (e.g., `'full'`) instead of reusing `'base'`/`'head'`.
- Comments created on added files reconcile against `oldPath` or comments on deleted files reconcile against `newPath`.
- `tests/e2e/file-tree.spec.ts` or anchor tests aren't extended to cover single-pane comment creation + reconciliation round-trip.

**Phase to address:**
Phase implementing single-pane full-width rendering for added/deleted files.

---

## Moderate Pitfalls

### Pitfall: CRLF/autocrlf and filter/smudge content divergence between Git's view and the raw filesystem read

**What goes wrong:**
Comparisons between committed objects go entirely through `git cat-file`/diff plumbing, which already applies the repository's configured `core.autocrlf`/`.gitattributes` text/filter normalization consistently on both sides. The new uncommitted-source feature reads worktree bytes directly off disk (for the working-tree/untracked portion) while the index/HEAD side still comes through Git's object store — if the committed/staged side has gone through a smudge filter or CRLF normalization and the raw worktree read hasn't (or vice versa), the "diff" shown between index and worktree can show spurious whole-file changes (every line "changed" due to line-ending differences) that don't reflect what `git diff` itself would show.

**Prevention:** Compute the unstaged (index→worktree) and untracked comparisons through `git diff`/`git diff --cached`'s own text conversion (i.e., still shell out to Git for the diff computation itself, only using direct filesystem reads for snapshot *freezing*/display of raw content, not for diff computation) so CRLF/filter normalization stays consistent with what Git itself considers "changed." Never hand-roll a byte-level diff for the uncommitted case; keep Git as the diff authority per the existing architectural constraint.

### Pitfall: Intent-to-add (`git add -N`) files classified incorrectly

**What goes wrong:** Files added with `git add -N` appear in the index with no content (zero-byte blob) but are no longer "untracked" from Git's perspective — a naive Staged-source implementation using `git diff --cached` would show them as an empty-to-current diff correctly, but a naive Unstaged implementation might skip them (not "untracked" so excluded from the untracked walk; index content is empty so a dumb equality check sees "no staged content" and silently omits the file from either bucket).

**Prevention:** Test intent-to-add files explicitly against both the Staged and Unstaged source definitions; rely on `git status --porcelain=v2` which reports intent-to-add with a distinct status code (`AM`/`A ` with the right combination) rather than re-deriving tracked/untracked status from index presence alone.

### Pitfall: Rename/copy detection differs between committed diffs and uncommitted statuses

**What goes wrong:** `git status`'s rename detection for uncommitted changes is heuristic and off by default in `--porcelain` unless `-z` combined with appropriate similarity flags, differing from the `raw-diff.ts` NUL-delimited rename/copy parsing (`src/git/raw-diff.ts:68-75`) already built for committed-range diffs. Reusing that exact parser against `git status --porcelain=v2` output (a different format entirely) will fail to parse or silently misinterpret records.

**Prevention:** Build a separate, explicitly-tested parser for `git status --porcelain=v2 -z` (or use `git diff --raw` with the index/worktree pseudo-refs, e.g. comparing against the empty tree / using `git diff -z --raw HEAD` for working-tree-vs-HEAD, `git diff -z --raw --cached` for staged, `git diff -z --raw` for unstaged) rather than assuming the committed-diff raw-diff parser's grammar applies unchanged.

### Pitfall: Mode changes (executable bit) on uncommitted files rendered as content changes or silently dropped

**What goes wrong:** A chmod-only change (`100644`→`100755`) with no byte content change is a real, reviewable "diff" in committed comparisons (status `T`/mode delta surfaces in `GitModeSchema`-validated `ChangedFile` records) but is easy to lose when reading worktree bytes directly for snapshot display, since a byte-level comparison alone shows "no change."

**Prevention:** Carry forward the existing mode-tracking fields (`oldMode`/`newMode`) for uncommitted comparisons the same way committed ones do, sourced from `git diff --raw` (which reports mode changes) rather than inferred from raw-content comparison.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Skip per-file stat-then-read verification in the working-tree snapshot, read files once and trust it | Faster to ship, simpler code | Silent torn snapshots under concurrent agent writes (Pitfall 2), hard-to-reproduce bug reports | Never — this is the exact race the "frozen snapshot" requirement exists to prevent |
| Render Markdown with the library's default HTML-passthrough mode and sanitize "later" | Preview ships faster, richer Markdown support (raw HTML embeds) immediately | XSS window open in shipped releases; sanitizer bolted on later is easy to get wrong retroactively (allowlist drift) | Never for a default-on preview; acceptable only as an explicitly opt-in, clearly labeled "unsafe" dev-only toggle, which this product should not ship |
| Treat all four uncommitted sources (staged/unstaged/working-tree/standalone) with one shared `comparisonKey` namespace instead of separate domain-tagged key functions | Less code to write initially | Key collisions across source kinds corrupt unrelated drafts into each other (same class of bug as Pitfall 1, broader blast radius) | Never |
| Defer symlink/traversal hardening on the standalone-file path until "someone reports it" | Ships the CLI path/glob feature faster | A trivially exploitable local traversal/escape in a tool whose whole trust model is "runs with the user's own filesystem permissions" — reports here are security incidents, not bug reports | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Monaco `createDiffEditor` vs single-pane | Reuse the diff editor with one side forced empty to "fake" single-pane (current add/delete rendering) and call it done, rather than switching to `IStandaloneCodeEditor` | Use a real standalone (non-diff) Monaco editor for pure add/delete/standalone-file content; the diff editor's gutter/decoration semantics (`src/web/monaco/diff-semantics.ts`) are built around *two-sided* `ILineChange` ranges and don't map cleanly onto a one-sided view |
| `git status --porcelain=v2 -z` parsing | Parsing porcelain v1 (unstable, locale-sensitive renaming format) or non-`-z` output (whitespace/quoting ambiguity for paths with spaces/special chars) | Always `-z` NUL-delimited, porcelain **v2** (stable, documented field layout), matching the NUL-delimited discipline already used for raw-diff/numstat parsing elsewhere in this codebase |
| `.gitignore`/global excludes for untracked files | Hand-rolling glob matching against `.gitignore` patterns (easy to miss negation patterns, directory-only patterns, `**` semantics, nested `.gitignore` precedence) | Delegate entirely to `git status --porcelain --exclude-standard` / `git ls-files --others --exclude-standard`; never reimplement gitignore matching |
| Stdin agent protocol mode dispatch | Only updating `contracts/request.ts`'s Zod union and forgetting `cli/run.ts`'s mode-dispatch switch or `cli/request.ts`'s human-facing error copy | Grep all three locations (schema, dispatch switch, error messages) whenever a mode is added; add an exhaustiveness-checked `switch` with no `default` branch so TypeScript flags missed cases at compile time |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Reading every untracked file's full bytes into memory during snapshot enumeration before any size/binary classification | Large accidental untracked files (build output not yet gitignored, downloaded fixtures) spike memory/latency on launch | Apply the same `MAX_INLINE_TEXT_BYTES` (1 MiB, `src/git/availability.ts:13`) oversized-classification check *before* reading full content — stat first, classify oversized without reading, read only files under the threshold | Repositories with any untracked file over a few MB, or many thousands of small untracked files (generated caches) |
| Re-walking the entire working tree on every Refresh click without reusing the prior snapshot's unaffected-file hashes | Refresh feels slow on large repos/monorepos as the feature gets used repeatedly in a session | Bound Refresh cost similarly to how the existing 10,000-ref branch-picker performance gate bounds branch enumeration (`ROADMAP.md` Phase 11 precedent) — reuse `git status`'s own fast dirty-detection rather than re-reading unchanged file bytes | Monorepos with large working trees reviewed repeatedly in one session |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering Markdown preview with raw HTML passthrough and no sanitizer | Stored XSS from agent-authored or repository content rendered in the loopback browser session (Pitfall 6) | Allowlist-sanitize (e.g., DOMPurify) before any HTML injection; keep the existing CSP's lack of `'unsafe-inline'`/`data:` as defense-in-depth, not the primary control |
| Standalone file / untracked walk following symlinks without `lstat` | Local path traversal / arbitrary-file-read-as-review-content outside the repository root (Pitfalls 3, 5) | `lstat` every path segment before follow; reject symlinks mid-path and at the leaf per the existing `exact-patch.ts:472-480` pattern |
| Treating `.cumpa/`-internal files as potentially reviewable once the tool reads the live filesystem | Tool could display its own draft/export JSON (which may contain prior review content/comments) as if it were artifact content under review, or worse, let an untracked-file review request target `.cumpa/` paths directly | Explicitly exclude the `.cumpa/` directory from every live-filesystem read path (untracked walk, standalone-file resolution), in addition to relying on `.gitignore` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Leaving the existing "Dirty — committed HEAD only... Staged, unstaged, and untracked bytes are ignored" copy (`src/domain/source.ts:1-3`, surfaced in `cli/confirm.ts:71` and `cli/picker.ts:120-121`) unchanged after shipping Staged/Unstaged/Working-tree as selectable Head sources | Actively contradicts the new feature — tells the user their dirty bytes are ignored on the same screen where they just chose to review exactly those dirty bytes | Update this copy as part of the same phase that adds the new Head source choices, not as an afterthought; the picker's worktree-candidate dirty label and the new explicit-source picker are two different UI surfaces that both need to agree with reality |
| Refresh with no visible indication of *what* changed since the last snapshot | User clicks Refresh, sees some comments go stale/orphaned, has no way to tell what moved without re-diffing manually | Surface a summary of what changed since the frozen snapshot (files added/removed/modified) alongside the Refresh action, consistent with the existing selector-drift reporting pattern (`src/git/selector-drift.ts`) |
| Markdown preview toggle losing scroll position or comment-composer state when switching between source and rendered view | Jarring context loss while reviewing/commenting | Preserve comment anchors and viewport position across the toggle the same way `SavedFileState` already preserves Monaco view state across file switches (`src/web/monaco/diff-adapter.ts:32-37`) |

## "Looks Done But Isn't" Checklist

- [ ] **Single-pane added/deleted rendering:** Looks done when the empty Monaco side visually disappears — verify comments created on single-pane files still reconcile correctly through `draft-reconciliation.ts` after a draft reload (Pitfall 9), not just that they render once.
- [ ] **Uncommitted source review:** Looks done when a one-shot diff renders correctly — verify a *second* launch against the same base with *different* working-tree content produces an independent draft, not a reused/corrupted one (Pitfall 1), and that a file write mid-snapshot is handled, not just the happy path (Pitfall 2).
- [ ] **Untracked files respecting `.gitignore`:** Looks done when a simple ignored test file is excluded — verify `.cumpa/` itself, a symlink escaping the repo, a file inside a submodule, and a file outside a sparse-checkout cone are all handled correctly (Pitfall 3), not just one trivial `.gitignore` pattern.
- [ ] **Standalone file review:** Looks done when a relative path inside the repo opens correctly — verify `../` traversal, absolute out-of-repo paths, and symlink escapes are all rejected (Pitfall 5), and that globs can't expand outside the repo root.
- [ ] **Markdown preview toggle:** Looks done when `**bold**` renders bold — verify a document containing `<script>`, event-handler attributes, and `javascript:` links is sanitized, not just that well-formed Markdown looks nice (Pitfall 6).
- [ ] **Agent stdin protocol extension:** Looks done when the new JSON shape parses — verify `cli/run.ts`'s mode dispatch, not just the Zod schema, handles the new modes (Pitfall 8), and that existing `revisions`/`patch` requests at `schemaVersion: 1` are completely unaffected.
- [ ] **Export schema extension:** Looks done when a new export round-trips — verify every existing V1/V2/V3 fixture in `tests/api/export.test.ts`/`export-publication.test.ts` still parses unchanged (Pitfall 7).
- [ ] **Product repositioning copy:** Looks done when `PROJECT.md`'s "What This Is" is updated — verify `README.md`'s tagline (currently "which is what a code review is for," `README.md:11`), CLI `--help` text, and the marketplace skill description are all updated consistently, not just the planning document.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-----------------|
| Commit-OID key reuse corrupts drafts across working-tree states (Pitfall 1) | HIGH | Requires a draft-schema migration: introduce the new content-digest key scheme, detect legacy-keyed uncommitted drafts (if any shipped), and either discard them with a clear user-facing message or best-effort re-key by content digest; cannot be silently patched without user-visible data implications |
| Torn/raced snapshot admitted as "frozen" (Pitfall 2) | MEDIUM | Add post-hoc stat/hash verification and re-snapshot on detected mismatch; existing sessions with a torn snapshot likely need the user to Refresh once the fix ships |
| `.cumpa/` or symlink-escaped content leaked into a review (Pitfall 3, 5) | LOW–MEDIUM | Filter retroactively at read time (cheap fix); if content was already persisted into a draft/export, treat as a security incident requiring draft/export invalidation, not just a UI filter |
| Markdown XSS shipped (Pitfall 6) | HIGH (security incident) | Patch release with sanitizer added immediately; cannot be mitigated by CSP alone since `javascript:` URIs and other non-script vectors aren't CSP-blocked by this app's current policy |
| Export schema breaking change shipped (Pitfall 7) | HIGH | Requires a follow-up release restoring the old V1–V3 shapes exactly and moving the new fields to a genuinely new version; breaks trust with any external agent integration in the meantime |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Commit-OID key reuse for uncommitted drafts/anchors (1) | Uncommitted-source comparison plumbing phase | Two launches against the same base with different working-tree content produce distinct draft files and distinct anchor `uniqueKey`s |
| Torn/raced working-tree snapshot (2) | Working-tree snapshot/freeze phase | Fault-injection test: mutate a file between enumeration and read, assert the snapshot either excludes it with a classified reason or the whole snapshot fails explicitly — never silently mixes states |
| `.cumpa/`/symlink/submodule/sparse-checkout leakage in untracked walk (3) | Working-tree (untracked-inclusive) source discovery phase | Fixture repo with a symlink pointing outside the repo, a file inside `.cumpa/`, a submodule, and (if feasible) a sparse-checkout cone, all asserted excluded/unsupported |
| Refresh relocating/fabricating anchors (4) | Explicit Refresh phase | Test: comment anchored at line N, content shifts so matching text moves to line M after Refresh, assert the comment stays recorded at its original anchor with a stale/orphaned classification |
| Standalone file path traversal/symlink escape (5) | Standalone file review phase | Tests for `../` traversal, absolute out-of-repo path, and symlink-to-outside-repo all rejected before any byte is read |
| Markdown preview XSS (6) | Rendered Markdown preview phase | Test renders a document with `<script>`, `onerror` handlers, and `javascript:` links, asserts none execute/persist in the sanitized DOM |
| Export schema backward-compat break (7) | Agent stdin/export extension phase | All existing V1/V2/V3 export fixtures continue to parse unchanged; new scope ships as an additive new version |
| Stdin protocol mode dispatch gaps (8) | Agent stdin/export extension phase | New `uncommitted`/`files` modes handled end-to-end (schema → CLI dispatch → error copy), existing `revisions`/`patch` requests unaffected |
| Single-pane anchor side-mapping (9) | Single-pane added/deleted rendering phase | Comment created on a single-pane added file and on a single-pane deleted file both reconcile correctly via `draft-reconciliation.ts` after a draft reload |
| CRLF/filter divergence between index and raw worktree reads | Uncommitted-source comparison plumbing phase | Repository with `.gitattributes` text normalization: unstaged diff via the new feature matches `git diff`'s own output line-for-line |

## Sources

- Direct codebase inspection with file:line citations throughout (`src/domain/anchor.ts`, `src/domain/comparison-key.ts`, `src/domain/source.ts`, `src/git/exact-patch.ts`, `src/git/availability.ts`, `src/git/inventory.ts`, `src/git/raw-diff.ts`, `src/server/patch-snapshot.ts`, `src/server/gitignore-capability.ts`, `src/server/security.ts`, `src/contracts/comparison.ts`, `src/contracts/draft.ts`, `src/contracts/request.ts`, `src/export/review-export.ts`, `src/cli/request.ts`, `src/cli/picker.ts`, `src/cli/confirm.ts`, `src/web/monaco/diff-adapter.ts`, `src/web/model/draft-reconciliation.ts`, `README.md`, `.planning/PROJECT.md`).
- Existing in-repo precedent for frozen-snapshot/content-digest identity: `PatchSnapshot` (`src/server/patch-snapshot.ts`) and `GroundedExactPatch`/`ExactPatchValidationTarget` worktree-target handling (`src/git/exact-patch.ts`), which already solves several of these problems for the exact-patch feature and should be extended/mirrored rather than reinvented.
- Git plumbing behavior (porcelain v2 format stability, `--exclude-standard`, intent-to-add status codes, submodule mode `160000`, symlink mode `120000`) per standard `git-status(1)`/`git-diff(1)` documented semantics — general Git domain knowledge, not independently re-verified against a live Git binary in this research pass (MEDIUM confidence on exact flag combinations; HIGH confidence on the underlying existence of each edge case).

---
*Pitfalls research for: Cumpa v2.0 Artifact Review*
*Researched: 2026-10-30*
