# Stack Research

**Domain:** Local-first review-workspace CLI/browser tool (Node 24 + TypeScript + Fastify + Vue 3 + Monaco), extending an existing shipped product for v2.0 Artifact Review
**Researched:** 2026-10-30
**Confidence:** HIGH

## Headline Finding

**v2.0 needs zero new runtime npm dependencies.** Every target feature is reachable by extending libraries and patterns the codebase already ships and has already proven in production: `monaco-editor`'s standalone-editor API (already bundled alongside its diff-editor API), native Git CLI plumbing invoked through the existing `createGitRunner`/`spawn`-array pattern, the existing `PatchSnapshot` fs+SHA-256 frozen-snapshot pattern, native Git pathspec resolution (already threaded end-to-end for agent range requests), and the existing `markdown-it` configuration already shipped for the Summary preview (`src/web/model/markdown-preview.ts`, consumed via `v-html` in `src/web/components/SummarySection.vue:226`). The one concrete stack change is a **patch-level version bump of `markdown-it`** (14.3.0 → 15.0.3) justified by a new, less-trusted input source, plus dropping the now-redundant `@types/markdown-it` dev dependency.

## Recommended Stack

### Core Technologies (reused, extended — no version-breaking changes required)

| Technology | Version in repo | Purpose for v2.0 | Why Recommended |
|------------|---------|---------|-----------------|
| `monaco-editor` | 0.55.1 (latest: 0.57.0) | Single-pane full-width view for added/deleted/standalone files (feature 1, 4) | `monaco.editor.create()` (the standalone `ICodeEditor`) is the same API family `createDiffEditor` is built on, in the same already-installed package (`src/web/monaco/diff-adapter.ts:1,628-634`). It shares `deltaDecorations`, `addViewZone`/`changeViewZones`, and mouse/keyboard event hooks with the diff editor's `original`/`modified` sub-editors, so the existing comment-anchor, gutter-decoration, and focus-management code (`src/web/monaco/line-mapping.ts`, `src/web/monaco/diff-semantics.ts`) ports to single-pane mode with the same interaction model, not a second editor library. |
| Native Git CLI (via `node:child_process.spawn`, argument arrays, `createGitRunner`) | Git 2.54.0 (local) | Staged/Unstaged/Working-tree Head sources, merge-base semantics, untracked enumeration, index/worktree byte reads (feature 2, 3) | The raw-diff and merge-base plumbing already in `src/git/raw-diff.ts` (`-z --raw` parsing) and `src/git/comparison.ts` (`git merge-base`, object-format detection) is endpoint-agnostic: `git diff --cached --raw -z` (HEAD→index), `git diff --raw -z` (index→worktree), and `git diff <merge-base> --raw -z` (HEAD→worktree, via `git status`/`ls-files` for untracked) parse with the *same* record format already implemented. `git ls-files --others --exclude-standard -z` enumerates untracked files respecting `.gitignore`, matching the `check-ignore --no-index` precedent already in `src/git/ignore-status.ts`. Constraint "Git semantics: invoke the installed Git CLI as source of truth" stays satisfied without a second implementation of diff/ignore logic. |
| `markdown-it` | **14.3.0 → bump to 15.0.3** | Rendered Markdown preview with source-line mapping (feature 5) | Already configured with `html: false`, `linkify: false`, `typographer: false`, and an overridden `validateLink` restricting `http(s):`/`mailto:` (`src/web/model/markdown-preview.ts:3-15`) — this is the exact config needed for file-content rendering too, just reused for a new, lower-trust input (arbitrary repository/agent-authored Markdown instead of only the reviewer's own summary text). 15.0.2/15.0.3 patch a High-severity (CVSS 7.5) quadratic-complexity DoS in smartquotes (GHSA-r7fv-28h4-cvq7, fixed 14.3.2/15.0.2) plus further quadratic-parsing fixes for multiline definitions and unclosed inline HTML/CDATA in 15.0.3. The shipped config sets `typographer: false` so the DoS is not currently exploitable, but rendering repo-sourced/agent-produced content (a new, adversarial-leaning trust boundary per the "any agent-produced artifact" repositioning) is exactly the scenario this class of bug targets — bump before widening the attack surface, don't wait for an incident. 15.0.0 bundles its own TypeScript declarations and moved `validateLink`/`normalizeLink`/`normalizeLinkText` from static to prototype methods; the repo's existing `renderer.validateLink = (url) => …` instance override (an own-property shadowing the prototype method) is unaffected. No code imports the removed `markdown-it/lib/*` subpaths (verified by repo-wide search). |
| `zod` | 4.4.3 | Validate extended agent stdin request shapes for uncommitted/standalone review (feature 6) | Same contract-sharing pattern already used for range (`src/contracts/request.ts`) and exact-patch requests; extend the discriminated union with new request kinds, no new validation library. |
| `@inquirer/search` | 4.2.1 | Add Staged/Unstaged/Working-tree as selectable Head entries (feature 2) | Same ordered, searchable picker already used for branches/worktrees (`PROJECT.md` Phase 09/10); the new entries are additional candidate rows, not a new picker component. |
| `commander` | 15.0.0 (latest, already current) | Accept file/glob positional arguments for standalone review (feature 4) | Commander already parses CLI args; variadic positional arguments (`cumpa <paths...>`) are native Commander, no argument-parsing library needed. |

### Supporting Libraries — Markdown Source-Line Mapping (new code, no new package)

| Technique | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `markdown-it` block-token `.map` + custom renderer rule | n/a (built into markdown-it core since early versions) | Attach `data-source-line="<n>"` to rendered block elements so clicking/selecting in the rendered preview resolves back to a source line for comment anchoring | Write one small `renderer.renderer.rules.*_open` / `core.ruler` override that reads each block token's `token.map[0]` (0-indexed start line) and sets it as a `data-source-line` attribute, following the exact pattern already used for `link_open` in `src/web/model/markdown-preview.ts:10-15`. This is the standard technique editors like VS Code/Typora use for "scroll sync"; it needs ~10–20 lines, not a dependency. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@types/markdown-it` → remove after the 15.x bump | Was needed because 14.x shipped no bundled types | 15.0.0's migration notes say to remove this package once `markdown-it` is bumped; keeping both risks type-definition drift/duplicate-identifier errors. |
| Vitest fixtures for new Git plumbing | Cover `--cached`, no-arg `diff`, and untracked enumeration the same way existing fixtures cover range/exact-patch plumbing | Extend `src/git/*.test.ts`-style real-Git fixtures (constraint: "Testing: Vitest for Git, diff, persistence, and export contracts") — add fixtures with staged/unstaged/untracked state rather than mocking `spawn`. |
| Playwright coverage for single-pane mode and preview toggle | Browser-level proof Monaco standalone mode and the rendered-preview toggle keep anchors stable | Extend the existing Playwright suite (94 tests) rather than add a new browser-testing tool. |

## Installation

```bash
# Version bump only — no new runtime packages
npm install markdown-it@15.0.3

# Drop the now-redundant type package
npm uninstall @types/markdown-it
```

No other `npm install` is required for v2.0's target features.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Glob/path expansion for standalone file review (feature 4) | Native Git pathspec resolution (`git ls-files -z -- <pathspecs>` + `git ls-files --others --exclude-standard -z -- <pathspecs>`), reusing the pathspec pass-through already wired end-to-end (`src/contracts/request.ts:39-44`, `src/domain/comparison-key.ts:28-38`, `src/server/capabilities.ts:341-343`) | `tinyglobby` 0.2.17 / `fast-glob` 3.3.3 / `micromatch` 4.0.8 | A JS glob engine implements shell-glob semantics (`**` always recursive, different bracket/negation rules) that diverge from Git pathspec magic (`**` needs explicit `:(glob)` magic; default matching is per-path-component). Shipping both would give users two subtly different glob dialects in the same product and a second file-discovery implementation that can disagree with the Git-CLI source of truth the whole architecture is built on. `tinyglobby`/`picomatch` are already present transitively through Vite's own devDependency tree, but that is a *build-time* toolchain graph, not something available or appropriate to lean on from the shipped CLI runtime. |
| Rendered-HTML sanitization for untrusted Markdown (feature 5) | Reuse the existing `markdown-it` config (`html: false` + restricted `validateLink` for both link and image `src`) | `dompurify` 3.4.17 (client-side sanitizer) | `html: false` already removes the only script-executing vector: raw `<script>`/`on*=` HTML is never parsed as markup, it is escaped to literal text. `validateLink` already blocks `javascript:`/`data:` link and image targets (markdown-it applies the same `validateLink` hook to both `link_open` and `image` tokens). This is the identical sanitization boundary already shipped and relied on for `v-html="preview"` in `SummarySection.vue:226` for the reviewer's own summary text; reusing it for file-content preview adds no new gap to close, while `dompurify` would add ~22 KB (gzipped) of bundle weight and a redundant pass for a threat the existing config already neutralizes. Revisit only if `html: true` or raw-HTML-emitting plugins are ever enabled. |
| Frozen working-tree snapshot storage (feature 3) | Extend the existing `PatchSnapshot` pattern: `node:fs` reads of index/worktree bytes, atomic temp-then-rename writes, `node:crypto` SHA-256 identities, Zod-validated manifests (`src/server/patch-snapshot.ts`) | A cache/KV library (e.g. `better-sqlite3`, `lmdb`) | The exact-patch feature already solved "freeze bytes at session start, detect drift, store under `.cumpa/`" with plain Node built-ins plus Zod; uncommitted-source sessions need the same shape (freeze staged/unstaged/worktree bytes, not commit objects). Introducing a database contradicts the shipped persistence constraint ("Versioned JSON files… no database") and duplicates work already done. |
| Detecting out-of-date working-tree state for Refresh (feature 3) | Explicit, user-triggered Refresh that re-runs the same Git plumbing and re-diffs against the frozen snapshot (matches the already-shipped "selector-drift" pattern in `src/git/selector-drift.ts`) | `chokidar` or `node:fs.watch`-based live file watching | The spec is an *explicit* Refresh action, not automatic live sync; a watcher adds cross-platform flakiness (inotify limits, debounce logic, macOS FSEvents coalescing) and a second source of truth for "what changed" that the architecture's single-flight, server-authoritative model (Finish, drafts) does not need. Stale/orphaned comment reclassification already works from a point-in-time diff, which Refresh naturally provides. |
| Single-pane editor rendering (feature 1) | `monaco.editor.create()` standalone editor, same `monaco-editor` package already bundled (0.55.1) | A second lightweight editor/viewer (e.g. CodeMirror 6) for non-diff files | Running two editor engines would double the Monaco worker/theme/CSP-safety work already solved in `src/web/monaco/theme.ts` and `configure.ts`, fragment the "one typed semantic theme" investment from v1.6, and complicate the anchor/decoration model that comments rely on. The standalone editor already shares the diff editor's `ICodeEditor` surface. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `tinyglobby` / `fast-glob` / `micromatch` / `minimatch` / `glob` for CLI path/glob arguments | Introduces a second, shell-style glob dialect that disagrees with Git pathspec semantics the rest of the product is built on; new runtime dependency for something Git already does correctly | `git ls-files [--others --exclude-standard] -z -- <pathspecs>` through the existing `GitRunner` |
| `dompurify` / `isomorphic-dompurify` for the Markdown preview | Redundant given `html: false` + restricted `validateLink`; `isomorphic-dompurify` specifically pulls in `jsdom`, a large server-side DOM polyfill with no purpose here since sanitization only needs to happen in the already-browser-side Vue component | Keep rendering through the shared `markdown-it` instance/config; if raw HTML support is ever requested later, re-evaluate then |
| `markdown-it-source-map` (npm, latest 0.1.1, last publish years stale, single-maintainer micro-plugin) | Does a few lines' worth of work (copy `token.map[0]` onto a `data-*` attribute) through an unmaintained third-party plugin, inconsistent with the hand-rolled `link_open` override style already in the codebase | A local renderer-rule override in `src/web/model/markdown-preview.ts`, identical pattern to the existing `link_open` rule |
| `chokidar` / live `fs.watch`-based auto-refresh | Feature spec calls for an explicit Refresh action, not automatic file watching; watchers add platform-specific flakiness and a second "what changed" authority | Re-run the same Git plumbing used for the initial snapshot when the user clicks Refresh |
| A second diff/patch library (e.g. `diff`, `jsdiff`) for uncommitted comparisons | All diff computation already goes through native `git diff --raw -z`/`--numstat -z`, parsed by `src/git/raw-diff.ts`/`src/git/numstat.ts`; a JS diff library would compute different hunks than Git itself in edge cases (renames, whitespace modes, binary detection) | Pass different endpoint arguments (`--cached`, no args, or a merge-base commit) to the same native Git plumbing already wired |
| Upgrading `monaco-editor` to 0.57.0 as part of this milestone | Not required by any v2.0 target feature — the standalone-editor API used for single-pane mode is unchanged between 0.55.1 and 0.57.0; an editor-core bump is cross-cutting risk (theme parity, CSP positioning, decoration behavior all re-verified in v1.6) unrelated to v2.0's scope | Stay on 0.55.1 for this milestone; revisit as an independent maintenance task |

## Stack Patterns by Variant

**If rendering the Markdown preview for a file that is part of a diff (not standalone):**
- Render the rendered-HTML preview from the Head-side (or Base-side, per toggle) text content already loaded into the Monaco model, not a second fetch.
- Because the file bytes are already resident (loaded for Monaco), reusing them avoids a second Git object/worktree read and keeps the preview and the diff pane showing provably identical bytes.

**If rendering the Markdown preview for a standalone (non-diff) file:**
- Resolve bytes once (working-tree read, since standalone review is explicitly "changed or not" and not pinned to a commit) and feed the same bytes to both the Monaco single-pane source view and the `markdown-it` rendered view.
- Because feature 4 reviews named files "changed or not," there is no Base/Head duality to reconcile — one content source, two presentation modes (source/preview).

**If the Head source is Staged or Unstaged:**
- Blob OIDs exist for the index side (real Git objects) but not for the worktree side (worktree bytes are never Git objects until added). Anchor identity for worktree-side comments needs a content hash (SHA-256 of the frozen snapshot bytes, per the existing `PatchSnapshot` `digest()` helper) rather than a blob OID, mirroring how `src/server/patch-snapshot.ts:123-125` already derives non-Git-object identities for exact-patch snapshots.
- Because the architecture's drift-detection/export contracts (`anchor.blobOid`) assume a Git object today, this is a contract-shape decision for the roadmap/architecture phase, not a new dependency — flag it for ARCHITECTURE/PITFALLS research, not solved here.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `markdown-it@15.0.3` | `markdown-it-py`-equivalent CommonMark behavior unchanged for the repo's config (`html:false, linkify:false, typographer:false`) | No behavioral change to rendered output for the existing Summary-preview use case; only parser-internals/export surface and bundled-types changed between 14.x and 15.x. |
| `markdown-it@15.0.3` | `@types/markdown-it@14.1.2` | **Incompatible to keep both** — 15.x bundles its own `.d.ts`; remove `@types/markdown-it` in the same change that bumps `markdown-it`, per the package's own v15 migration notes. |
| `monaco-editor@0.55.1` standalone `editor.create()` | Existing `src/web/monaco/theme.ts` typed theme, `src/web/monaco/configure.ts` worker routing | Both already operate on the shared `monaco` namespace import; no separate configuration path needed for standalone vs. diff editors — `configureMonacoWorkers()` and the theme registration already run once per page and cover any editor instance created afterward. |
| Git 2.54.0 (local) raw-diff `-z --raw` / `--numstat -z` flags | `src/git/raw-diff.ts`, `src/git/numstat.ts` parsers | These flags and the record format are stable Git plumbing (documented in `git-diff-index(1)`/`git-diff(1)` since Git 1.x); no minimum-Git-version change needed for `--cached` or endpoint-less `git diff` compared to what range/exact-patch review already requires. |

## Sources

- Repo inspection (HIGH, curated): `src/web/monaco/diff-adapter.ts`, `src/web/monaco/configure.ts`, `src/web/monaco/line-mapping.ts`, `src/git/runner.ts`, `src/git/objects.ts`, `src/git/ignore-status.ts`, `src/git/raw-diff.ts`, `src/git/comparison.ts`, `src/server/patch-snapshot.ts`, `src/server/security.ts`, `src/web/model/markdown-preview.ts`, `src/web/components/SummarySection.vue`, `src/contracts/request.ts`, `src/domain/comparison-key.ts`, `src/server/capabilities.ts` — read directly to ground every recommendation above in existing, shipped patterns.
- `package.json` (repo) — current pinned versions for all existing dependencies.
- npm registry (`npm view <pkg> version|time|dependencies`, HIGH, official): `markdown-it` 14.3.0→15.0.3, `monaco-editor` 0.55.1→0.57.0, `@inquirer/search` 4.2.1→4.3.6, `dompurify` 3.4.17, `tinyglobby` 0.2.17, `fast-glob` 3.3.3, `micromatch` 4.0.8, `markdown-it-source-map` 0.1.1 — checked 2026-10-30.
- `markdown-it` CHANGELOG (GitHub, HIGH, official): https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md — confirms 15.0.1/15.0.2/15.0.3 quadratic-complexity security fixes and the 15.0.0 breaking-change list (bundled types, removed subpath exports, `validateLink` moved to prototype).
- GHSA-r7fv-28h4-cvq7 (GitHub Security Advisories, HIGH, official): https://github.com/markdown-it/markdown-it/security/advisories/GHSA-r7fv-28h4-cvq7 — High/CVSS 7.5 quadratic smartquotes DoS, confirms `typographer: false` (the repo's config) is unaffected today but patched in 14.3.2/15.0.2.
- Vite `node_modules/vite/package.json` (repo-local inspection, HIGH): confirms `tinyglobby`/`picomatch` are Vite's own *devDependency-only* glob engine, not something available to the shipped runtime — basis for rejecting it as a new runtime dependency.
- `.planning/PROJECT.md` (repo) — validated requirements, constraints, and Key Decisions consulted to avoid re-litigating already-settled stack choices (native Git CLI authority, Zod contracts, Vitest/Playwright testing, `.cumpa/` JSON persistence).

---
*Stack research for: Cumpa v2.0 Artifact Review*
*Researched: 2026-10-30*
