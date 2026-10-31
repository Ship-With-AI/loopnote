# Phase 16: Rendered Markdown Preview - Research

**Researched:** 2026-10-31
**Domain:** markdown-it 14.3.0 token-stream internals (block source-map anchoring, inline-rule override mechanics), Fastify same-origin binary content routes under strict CSP, Monaco diff-editor scroll-sync precedent, durable single-line comment-anchor schema
**Confidence:** HIGH

## Summary

Phase 16 is almost entirely internal-API and local-module work: the project already ships `markdown-it@14.3.0` with a hardened renderer (`src/web/model/markdown-preview.ts`, `html:false`, scheme-restricted `validateLink`), and the UI-SPEC has already resolved every open visual/plugin question with code-level specificity. This research independently re-verified the two load-bearing technical claims the UI-SPEC depends on — "GFM tables need zero plugin" and "task-lists/front-matter need only small local rules" — by parsing real sample Markdown through the installed `markdown-it@14.3.0` package and inspecting the actual token stream; both claims are **confirmed correct** with no disagreement to flag.

Research surfaced two findings the UI-SPEC did not account for and that materially change how Tasks must be built. **First**, the project's shared `validateLink` override (`/^(?:https?:|mailto:)/iu`) is called by markdown-it's *inline* `image` rule during parsing, not just by `link_open` at render time; a relative image `src` fails this check, which blanks `href` and makes the whole `![...](...)` fail to parse at all (it falls back to literal bracket text). A `renderer.rules.image` **render-time** override (as the UI-SPEC describes) can never run for relative images, because no `image` token is ever produced. The fix verified in this session is to replace the `image` *inline* rule (`md.inline.ruler.at('image', …)`) with one that substitutes a local, image-specific validator for the duration of that one rule's execution, leaving the shared `validateLink` (and therefore all existing link behavior, D-10) completely untouched. **Second**, the durable comment-anchor schema (`DurableAnchorV1Schema` in `src/contracts/draft.ts`, built by `buildDurableAnchor` in `src/domain/anchor.ts`) is fundamentally single-line (`line: number`, `selectedText` = exactly that one line's text) — there is no `[start,end]` range concept anywhere in the anchor domain model, despite CONTEXT.md's D-05 assuming "Anchors use the block's markdown-it `map` line range." Given Phase 13's explicit precedent (D-14: "No export change… schema changes belong to Phase 17"), the recommended resolution — consistent with zero backend/schema changes — is to anchor each rendered-block comment to the block's **first** source line only (reusing `buildDurableAnchor` unmodified), and to satisfy "visible at those lines in source view" by having the source-view renderer independently recompute the block's full `[start,end]` range (same markdown-it parse used for the rendered view) to decide which Monaco lines get the comment marker, rather than relying on the anchor itself to carry the range.

**Primary recommendation:** Implement Priorities 1–5 as documented below: a dedicated `GET /api/files/:fileId/image` route that resolves a *relative path against the owning Markdown file's commit/snapshot context* (not a second opaque `fileId` lookup, since `filesByCapability` only indexes changed files); a custom markdown-it `image` inline-rule override plus a `renderer.rules.image` render-rule override for D-09; local core/renderer rules for GFM task-lists and YAML front-matter (zero new npm packages); single-line anchors at each block's first line for MDV-02 comments; and a hand-rolled nearest-block scroll-sync listener pair for D-03, modeled on the fact that Monaco's own diff-editor scroll sync is native/non-configurable (no equivalent API exists for two independent DOM panes).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Source/Rendered toggle, block rendering, marker/gutter UI | Browser / Client (Vue) | — | Pure presentational state; `RenderedMarkdownView.vue` + `ActiveFileToolbar.vue`, no server round-trip needed beyond existing content fetch [VERIFIED: src/web/components/SummarySection.vue, src/web/components/ActiveFileToolbar.vue:81-109] |
| Markdown parsing, block source-line mapping, XSS/link/image hardening | Browser / Client (shared module, runs in browser) | — | `src/web/model/markdown-preview.ts` already runs client-side via Vite bundle (imported by `SummarySection.vue`); no server-side rendering of Markdown exists or is needed [VERIFIED: src/web/components/SummarySection.vue:4] |
| Comment anchor construction/verification, durable-anchor schema | API / Backend (shared domain) | Browser / Client (anchor assembly before POST) | `buildDurableAnchor`/`DurableAnchorV1Schema` already shared contract code consumed by both client and `capabilities.ts` server-side `verifyAnchor` [VERIFIED: src/domain/anchor.ts:115-150, src/server/capabilities.ts:389-397] |
| Repo-local image byte serving (D-09) | API / Backend (`src/server/routes.ts`) | Database/Storage (`.cumpa/` snapshot store or git object store depending on session kind) | Must reuse the exact path-safety discipline Phase 15 established (`src/git/exact-patch.ts`'s per-segment `lstat` walk, never `realpath`-follow) and must not create a new network-reachable-by-URL surface outside the existing session's own file set [VERIFIED: src/git/exact-patch.ts:465-480] |
| CSP enforcement | API / Backend (`src/server/security.ts`) | — | Static header list; confirmed `img-src 'self'` already covers the new same-origin image route with zero directive changes [VERIFIED: src/server/security.ts:15-28] |
| Scroll-sync between rendered panes | Browser / Client | — | No Monaco involvement in Rendered mode; two independent DOM `.rendered-block` lists require a hand-rolled listener pair, same tier as the single-pane adapter work from Phase 13 [VERIFIED: src/web/monaco/diff-adapter.ts:124-144 — no scroll-sync option exists in `createDiffEditor`'s options object] |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rendered side-by-side diff
- **D-01:** In side-by-side layout with rendered view on, **both Base and Head render**. Blocks whose source line range overlaps added/removed/changed lines (mapped from Monaco/line-mapping line changes onto markdown-it token `map` ranges) get a marker. Unchanged blocks render plain.
- **D-02:** **Marker style: colored left rule + text tag** (`Added`, `Removed`, `Changed`) using Phase 08 tokens. Never color-only.
- **D-03:** Scroll sync between rendered panes: **Claude's discretion** (block-aligned best effort or independent; planner decides after prototyping).

#### Commenting on rendered blocks
- **D-04:** **Trigger: a hover/focus `+` button** at the block's left edge, matching the code-gutter affordance. Blocks are keyboard-focusable (Tab/arrow navigation) so the button is reachable without a mouse.
- **D-05:** **Granularity: the smallest block with a source map**: list item (not the whole list), table row (not the whole table), paragraph, heading, whole fenced code block, blockquote paragraph. Anchors use the block's markdown-it `map` line range (MDV-02).
- **D-06:** **One block per comment.** No multi-block selection in rendered view; wider ranges use source view's range selection.
- **D-07:** **Existing comments render inline** below their block, always expanded, using the same thread component as code view (MDV-03). A comment whose range covers several blocks shows on the first overlapping block.
- **D-08:** **Side follows pane:** in side-by-side rendered view, left-pane comments anchor to `base`, right-pane comments to `head`, same as code view. In single-pane, the side follows the Phase 13 rule.

#### Images & external content
- **D-09:** **Relative repo images only**, resolved from the same snapshot/commit as the file through a same-origin Cumpa content route (CSP-safe, no `img-src` widening). **Remote images are never fetched.** They render as a text placeholder showing alt text and URL. Researcher: confirm the CSP and add a dedicated route if the existing file content route doesn't fit (path must resolve inside the session's file set/repo, with the Phase 15 path-safety rules).
- **D-10:** **Links reuse the summary renderer's rules** (`src/web/model/markdown-preview.ts`): only `http(s):` and `mailto:` are clickable, opening in a new tab with `noopener noreferrer`. Relative links render as non-clickable text that shows the target.
- **D-11:** **GFM tables + task lists render** (task checkboxes read-only/disabled). YAML front-matter renders as a code block. Mermaid, math and other fenced languages stay code blocks: no diagram or math engines.
- **D-12:** **Markdown files = `.md` and `.markdown` only.** `.mdx` and others stay source-only (no toggle).

### Claude's Discretion (user skipped "Toggle & default view")
- **Default view is source.** A per-file **Source / Rendered** toggle in the file header, remembered per file for the session (not persisted across sessions). In side-by-side, the toggle switches both panes. Toggle state must be conveyed by text and `aria-pressed`, not color.
- D-03 scroll sync.
- markdown-it plugin choice for task lists/front-matter (prefer tiny, maintained plugins or a small local token rule; no `html: true`).

### Deferred Ideas (OUT OF SCOPE)
- Mermaid diagram rendering; math rendering.
- Relative links navigating to other session files.
- `.mdx` support.
- Multi-block comment selection in rendered view.
- Remote image loading (rejected: privacy and CSP).

### UI-SPEC Resolutions (approved 2026-10-31, re-verified in this research session)
- **No third-party markdown-it plugin.** GFM tables render via markdown-it's built-in `table` core-block rule (not a plugin) [RE-VERIFIED below]. Task lists and front-matter get two small local rules (~20–40 lines each) added to `markdown-preview.ts`. **Confirmed correct** by this research — see Priority 3.
- `RenderedMarkdownView.vue` (new) owns block rendering/markers/gutter button/inline comments; mounted by `DiffWorkspace.vue` in place of the Monaco host when the per-file toggle is `Rendered` and the file is `.md`/`.markdown`.
- Marker tokens: `--status-added-*` / `--status-deleted-*` / `--status-modified-*` triplets (Phase 08), text `Added`/`Removed`/`Changed`.
- New server route: `GET /api/files/:fileId/image` (exact shape researched and revised below — Priority 1).
- Scroll sync: block-aligned, best-effort, **enabled by default**, modeled on Monaco's own diff-editor native scroll sync in Source mode.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MDV-01 | User can toggle any Markdown file between source view and rendered view, in single-pane and side-by-side layouts. | Priority 5 (scroll sync); `ActiveFileToolbar.vue:81-109` toggle placement precedent; `DiffWorkspace.vue` host-swap pattern already established for Phase 13 single-pane routing |
| MDV-02 | User can add a comment from a rendered block (heading, paragraph, list item, code block, table); it is stored anchored to that block's source line range and appears at those lines in source view. | Priority 2 (token `map` verification per block type) + **critical finding**: `DurableAnchorV1Schema` is single-line only — recommended resolution anchors to the block's first line, with full-range visibility handled client-side in source view |
| MDV-03 | User sees existing comments marked on the rendered blocks they anchor to. | Priority 2 (D-07 "first overlapping block" rule, directly computable once block `[start,end]` ranges are known) |
| MDV-04 | Rendered Markdown never executes scripts, renders raw HTML, or follows non-http(s)/mailto links, under the existing production CSP. | Priority 1 (CSP confirmed, no widening needed) + Priority 3 (direct render tests proving `html:false` escapes `<script>`, `validateLink` blocks `javascript:`/`data:`) + Priority 4 (test strategy, extending `tests/unit/markdown-preview.test.ts` and `tests/api/security.test.ts` precedents) |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `markdown-it` | 14.3.0 (installed) [VERIFIED: `node_modules/markdown-it/package.json`] | Markdown → HTML, token-stream source mapping | Already the project's hardened renderer; registry latest is `15.0.3` [VERIFIED: `npm view markdown-it version`], but **no upgrade is in scope** — CONTEXT.md locks it at the already-installed, already-audited version and the File Ownership Map forbids touching the existing `html:false`/`linkify:false`/`typographer:false` options |
| `monaco-editor` | 0.55.1 (installed) [VERIFIED: package.json] | Source-view editor, `ILineChange[]` diff data for D-01 markers | Already powers single-pane (Phase 13) and side-by-side diff; `line-mapping.ts`'s `DiffSide`/`counterpartBoundary` reused unmodified |
| `vue` | 3.5.39 (installed) | `RenderedMarkdownView.vue` new component | Project's only UI framework |
| `zod` | 4.4.3 (installed) | Validating the new image route's params (reuses `OpaqueFileIdSchema` pattern) | Project's sole schema/validation library |
| `fastify` | 5.10.0 (installed) | New `GET /api/files/:fileId/image` route | Project's sole HTTP framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | This phase adds **zero new npm packages** — confirmed by independent render-test verification (Priority 3) that markdown-it's built-in `table` rule and two small local rules fully satisfy D-11 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local core/renderer rules for task-lists + front-matter | `markdown-it-task-lists`, `markdown-it-front-matter` (npm plugins) | **Rejected**, matching UI-SPEC's resolution. Verified independently: each behavior is ~20–40 lines of local code against an already-audited hardened renderer; a third-party inline/block-rule plugin adds unaudited surface to the exact module MDV-04's XSS/link-safety requirement depends on, with no compensating benefit (GFM tables need no plugin at all, task-lists/front-matter are structurally trivial once `token.map` is understood — see Priority 3) |
| Custom `image` inline-rule override (this research's recommendation) | A post-parse HTML string regex/DOM rewrite of `<img src="...">` after `md.render()` | **Rejected.** Regex/DOM rewriting after render is exactly the kind of "don't hand-roll HTML sanitization" anti-pattern the hardened-renderer precedent (`validateLink`) exists to avoid; the inline-rule-replacement approach stays entirely inside markdown-it's own token pipeline, reuses `attrSet`, and needs no second HTML-parsing pass |
| `/api/files/:fileId/image` resolving by a second opaque `fileId` | A **path-relative** resolution keyed by the *owning Markdown file's* `fileId` + a relative path string | The opaque `fileId` space (`filesByCapability`/`frozenFilesByCapability`) is populated **only from `comparison.changedFiles`** [VERIFIED: `src/server/capabilities.ts:362-386`] — an unmodified image referenced by a changed `.md` file has no opaque `fileId` of its own. Path-relative resolution, scoped to the referencing file's own side/commit/snapshot, is the only approach that covers unchanged repo-local images |

**Installation:**
```bash
# No installation needed — zero new dependencies this phase.
```

**Version verification:**
```
npm view markdown-it version   → 15.0.3 (registry latest, informational only — not upgrading)
installed: markdown-it@14.3.0  [VERIFIED: node_modules/markdown-it/package.json]
```

## Package Legitimacy Audit

**Not applicable — this phase installs zero new npm packages.** `markdown-it` is already an installed, already-audited dependency (`package.json` lists it under existing `dependencies`); no new package name appears anywhere in CONTEXT.md's locked decisions or the UI-SPEC's Registry Safety section ("no third-party component or markdown-it-plugin source in phase"). The project-local `gsd_run query package-legitimacy check` seam was attempted in this session and failed with a `MODULE_NOT_FOUND` error in this environment's gsd-core installation (unrelated to this phase); since no new package requires a legitimacy verdict, this does not block research completion.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Markdown file content (string, already fetched via GET /api/files/:fileId/content)
        │
        ▼
renderMarkdownPreview-family module (src/web/model/markdown-preview.ts, EXTENDED)
        │  ├─ front-matter block rule (NEW, runs before default block rules)
        │  ├─ core.table / core.list / core.paragraph / core.heading / core.blockquote / core.fence
        │  │      (UNCHANGED — markdown-it built-ins already in default preset)
        │  ├─ task-list core rule (NEW, post-inline, rewrites list_item text → checkbox token flag)
        │  ├─ image inline-rule REPLACEMENT (NEW — local validator, does not touch shared validateLink)
        │  ├─ renderer.rules.image override (NEW — relative → content-route src rewrite; remote → placeholder)
        │  ├─ renderer.rules.{paragraph_open,heading_open,list_item_open,tr_open,blockquote_open,fence}
        │  │      overrides (NEW — stamp data-source-start/data-source-end from token.map)
        │  └─ existing validateLink / link_open overrides (UNCHANGED — D-10 reused verbatim)
        │
        ▼
RenderedMarkdownView.vue (NEW)
        │  ├─ parses HTML string into block-wrapped DOM (data-start/data-end already present)
        │  ├─ D-01/D-02: maps monaco.editor.ILineChange[] (from the SAME diff-adapter data
        │  │      already computed for Source mode) onto each block's [start,end] → marker class
        │  ├─ D-04/D-07: hover/focus "+" button per block; existing comments rendered via the
        │  │      same conversation-card component DiffWorkspace.vue already uses (DiffWorkspace.vue:145-157)
        │  └─ D-03: scroll listener — on scroll, find topmost visible .rendered-block, find
        │         nearest-range block in the counterpart pane, scrollIntoView (hand-rolled,
        │         no Monaco API to delegate to — see Priority 5)
        │
        ▼
Comment creation (D-04 click) ──► buildDurableAnchor({ side, line: block's FIRST source line,
        │                              blobOid, lines: raw markdown source lines })
        │                          (UNCHANGED function/schema — see MDV-02 critical finding)
        ▼
POST /api/draft/mutations (UNCHANGED route, UNCHANGED DurableAnchorV1Schema)
        ▼
Source view (Monaco): when rendering line decorations, re-parse the same Markdown source
        with the same tokenizer to recompute the owning block's [start,end] for any anchor
        whose `line` falls inside it, so the marker/comment-visible-range covers the full
        block even though the STORED anchor is single-line (client-side-only recomputation,
        no new wire format)

Image route (D-09):
GET /api/files/:fileId/image?path=<relative-src>  (fileId = the REFERENCING Markdown file's
        own opaque id, NOT a second lookup for the image) ← NEW route
        │
        ├─ resolve fileId → frozenFilesByCapability entry → side (base/head) → commit OID
        │      (committed-comparison sessions) OR → snapshot entry (uncommitted/standalone
        │      sessions, Phase 14/15 precedent)
        ├─ resolve <relative-src> against the Markdown file's OWN directory, using the same
        │      per-segment lstat walk as src/git/exact-patch.ts (reject .., absolute-outside,
        │      symlink escape — Phase 15 D-04/FILE-04 precedent, NOT realpath-follow)
        ├─ reject if resolved path extension is not in the minimal image set
        │      (png/jpeg/gif/svg/webp) → placeholder, never served
        └─ stream raw bytes with correct Content-Type; same-origin, img-src 'self' already
               covers it — NO CSP directive change
```

### Recommended Project Structure

No new directories. Per the UI-SPEC's File Ownership Map:

```
src/web/model/
└── markdown-preview.ts        # EXTENDED — front-matter rule, task-list rule, image inline-rule
                                #   replacement, renderer.rules.image override, block
                                #   data-start/data-end stamping. UNCHANGED: html/linkify/
                                #   typographer options, validateLink, link_open.
src/web/components/
├── RenderedMarkdownView.vue   # NEW — block rendering, D-01 markers, D-04 gutter button,
                                #   D-07 inline comments, D-03 scroll-sync listener
├── DiffWorkspace.vue          # MODIFIED — new `mode` prop, host-swap branch (reuses the
                                #   Phase 13 single-pane/side-by-side routing precedent)
└── ActiveFileToolbar.vue      # MODIFIED — Source/Rendered button pair (ActiveFileToolbar.vue:81-109)
src/server/
└── routes.ts                  # MODIFIED — new GET /api/files/:fileId/image route
src/web/monaco/
└── diff-adapter.ts            # UNCHANGED (read-only) — ILineChange[] already exposed via
                                #   onDidUpdateDiff; RenderedMarkdownView consumes the same data
```

### Priority 1 — CSP + image route (D-09, MDV-04)

**CSP confirmed, zero widening needed** [VERIFIED: `src/server/security.ts:15-28`]:
```typescript
// Source: src/server/security.ts:15-28
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-elem 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self'",            // ← already covers a new same-origin route; no change
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
```
There is no `data:` or remote host in `img-src`, so even if the renderer somehow emitted a remote `<img src="https://…">`, the browser would refuse to fetch it — but D-09 additionally wants a **text placeholder** instead of a broken-image icon (privacy: no network attempt, no Referer leak, no favicon-style side channel), so the renderer-level block (Priority 2/3) is still required and is the actual enforcement point, with CSP as defense-in-depth.

**The existing `/api/files/:fileId/content` route cannot serve images as-is** [VERIFIED: `src/server/routes.ts:311-337`]: it 409s unless `metadata.availability.kind === 'text'` and returns parsed text content with no `Content-Type` control for binary bytes.

**Critical finding — the opaque `fileId` space does not cover unchanged repo files.** `filesByCapability`/`frozenFilesByCapability` (committed-comparison sessions) are populated *exclusively* from `comparison.changedFiles.map(...)` [VERIFIED: `src/server/capabilities.ts:362-386`]:
```typescript
// Source: src/server/capabilities.ts:362-386
files: comparison.changedFiles.map((file) => {
  // ...
  filesByCapability.set(file.id, metadata);
  frozenFilesByCapability.set(file.id, file);
  return sessionFile;
}),
```
The uncommitted/standalone snapshot manifest has the identical scope — `WorktreeSnapshotEntrySchema.file: ChangedFileSchema` [VERIFIED: `src/server/worktree-snapshot.ts:59-64`]. A Markdown file that is part of the diff very commonly references an image that is **not itself changed** (e.g. an existing logo). That image has **no opaque `fileId`** — `capabilities.lookup(imageFileId)` would return `undefined` for it. Therefore the new route **cannot** be `GET /api/files/:imageFileId/image` keyed by a second independent opaque id; it must resolve a **relative path string against the referencing Markdown file's own already-known side/commit/snapshot**:

```
GET /api/files/:fileId/image?path=<relative-src-as-written-in-markdown>
```
where `:fileId` is the Markdown file's own existing opaque id (already known client-side — the file being rendered), and `path` is the raw (URL-encoded) relative reference exactly as it appeared in the `![alt](src)` syntax, resolved server-side relative to the Markdown file's own directory. Server-side resolution needs two code paths, matching the two session shapes already in the codebase:
- **Committed-comparison sessions:** resolve `path` against the Markdown file's own `side` (base/head) commit tree via the existing `ObjectReader` (`src/git/objects.ts:24-87`), the same primitive `capabilities.readContent` already uses for the file's own bytes — confirm via a tree-walk/`git cat-file`/`git ls-tree` equivalent what the correct blob-at-path-at-commit primitive is (not fully traced in this session; flagged as an Open Question below for the planner to resolve against `src/git/objects.ts`'s actual exported surface).
- **Uncommitted/worktree/standalone sessions:** the content-addressed snapshot only stores changed-file bytes (see above), so an unchanged image is **not** in the snapshot at all and must be read directly from the working tree on disk, reusing the exact Phase 15 path-safety primitive: per-segment `lstat` walk from the repository root, rejecting any intermediate symlink, **never** `fs.realpath`-following [VERIFIED: `src/git/exact-patch.ts:465-480`]:
```typescript
// Source: src/git/exact-patch.ts:465-480 (existing precedent — reuse this discipline, not realpath)
let current = /* repository root, canonicalized once at startup */;
for (const [index, part] of parts.entries()) {
  current = Buffer.concat([current, Buffer.from('/', 'ascii'), Buffer.from(part, 'latin1')]);
  const entry = await lstat(current);
  if (index < parts.length - 1 && entry.isSymbolicLink()) fail();   // no intermediate symlink escapes
  if (index === parts.length - 1) {
    if (entry.isSymbolicLink()) { /* reject or resolve-and-recheck, per existing fail() discipline */ }
  }
}
```

**Content-Type and extension allow-list:** stream raw bytes with `Content-Type` derived from a minimal allow-list — `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`, `image/webp`. Any other extension (or a path that fails resolution/path-safety) must render the D-09 placeholder client-side and must **never** be requested from the server at all (the renderer decides relative-vs-remote and extension eligibility before emitting the `<img>` tag — see Priority 2/3), so the route only needs to defensively re-validate, not be the sole gate.

### Priority 2 — markdown-it token map → block source-line anchoring (MDV-02, D-01, D-05, D-07)

**Verified directly against the installed `markdown-it@14.3.0` package** by parsing representative sample Markdown and inspecting `md.parse(src, {})`'s token stream (full output below). Each top-level block-level `_open` token's `.map` is `[startLine, endLine)` — **0-indexed, end-exclusive** — covering exactly the block named, not its parent or children:

```
// Verified in this session, node -e against installed markdown-it@14.3.0
heading_open      [0,1]   — one heading line
paragraph_open    [2,3]   — one paragraph (multi-line paragraphs get a wider range, e.g. [2,5))
bullet_list_open  [4,7]   — the WHOLE list (do not anchor to this)
  list_item_open  [4,5]   — EACH item has its OWN narrower map — exactly what D-05 needs
  list_item_open  [5,7]
table_open        [7,10]  — the WHOLE table (do not anchor to this)
  thead_open      [7,8]
    tr_open       [7,8]   — header row has its OWN map too
  tbody_open       [9,10]
    tr_open        [9,10] — EACH body row has its OWN map — exactly what D-05 needs
      th_open/td_open/inline  map=null — cell-level tokens do NOT carry map; read it
                                 from the enclosing tr_open token instead
blockquote_open   [11,12]
  paragraph_open  [11,12] — blockquote's inner paragraph carries its own map too
fence             [13,16] — whole fenced code block, one combined map (matches D-05
                              "whole fenced code block" granularity exactly)
```

**D-05's exact granularity list is therefore directly achievable with zero custom block-splitting logic** — every block type D-05 names (paragraph, heading, list item, table row, fenced code block, blockquote paragraph) already carries its own `token.map` in the stock token stream; the work is purely overriding the corresponding `renderer.rules.*` to stamp `data-source-start`/`data-source-end` attributes (1-indexed, matching Monaco's convention — convert via `map[0] + 1` / `map[1]`, since `map` is 0-indexed/end-exclusive and Monaco line numbers are 1-indexed):

```typescript
// NEW in markdown-preview.ts — pattern to repeat for paragraph_open, heading_open,
// list_item_open, blockquote_open, fence, and tr_open
const defaultParagraphOpen = renderer.renderer.rules.paragraph_open ?? renderer.renderer.renderToken.bind(renderer.renderer);
renderer.renderer.rules.paragraph_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  if (token.map) {
    token.attrSet('data-source-start', String(token.map[0] + 1));
    token.attrSet('data-source-end', String(token.map[1]));
  }
  return self.renderToken(tokens, index, options);
};
```
`tr_open` needs the same treatment for table-row granularity; `th_open`/`td_open` need **no** override since D-05 only requires row-level granularity, not cell-level.

**D-01 line-change mapping:** `monaco.editor.ILineChange[]` (already computed by the existing diff adapter via `diffEditor.onDidUpdateDiff` [VERIFIED: `src/web/monaco/diff-adapter.ts:154-160`]) exposes `originalStartLineNumber`/`originalEndLineNumber`/`modifiedStartLineNumber`/`modifiedEndLineNumber` per hunk (standard Monaco type, 1-indexed, inclusive). Overlap with a block's `[data-source-start, data-source-end]` (also 1-indexed after the `+1` conversion above) is simple half-open-interval overlap arithmetic — no new library needed (**Don't Hand-Roll** table below explicitly calls out that nothing beyond basic interval-overlap comparison is warranted here; do not reach for an interval-tree package for a per-file block count in the tens-to-hundreds range).

**Critical finding — `DurableAnchorV1Schema` is single-line, not range-based.** `buildDurableAnchor` [VERIFIED: `src/domain/anchor.ts:115-150`] takes exactly one `input.line: number`, and sets `selectedText: target.text` where `target.text = lines[targetIndex]` — i.e. the content of that **one** line:
```typescript
// Source: src/contracts/draft.ts:28-52 — DurableAnchorV1Schema (relevant fields)
line: z.number().int().positive(),       // ← ONE line, not a range
selectedText: z.string(),                // ← exactly that one line's text (buildDurableAnchor
                                          //    sets this to lines[targetIndex], a single line)
context: z.strictObject({
  before: z.array(AnchorLineSchema).max(3).readonly(),  // up to 3 PRECEDING single lines
  target: AnchorLineSchema,                              // the anchor's own single line
  after: z.array(AnchorLineSchema).max(3).readonly(),    // up to 3 FOLLOWING single lines
}).readonly(),
```
There is **no** `endLine`/range field anywhere in the anchor domain model, despite CONTEXT.md's D-05 phrasing ("Anchors use the block's markdown-it `map` line range"). Combined with Phase 13's explicit precedent — D-14: *"No export change: Markdown and canonical JSON stay as they are. Anchor `side` + file status already carry the meaning; schema changes belong to Phase 17"* [VERIFIED: `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md:32`] — the recommended, lowest-blast-radius resolution is:

1. **Anchor every rendered-block comment to the block's first source line** (`token.map[0] + 1`), calling `buildDurableAnchor` completely unmodified, with `lines` = the raw Markdown source split into lines (the composer already has the full raw source string, since that's exactly what's being rendered).
2. **"Appears at those lines in source view" (MDV-02) is satisfied client-side, not by the stored anchor.** When the source-view Monaco adapter renders comment decorations, it already knows the file's raw text; it can re-run the *same* markdown-it block-map computation used for rendered view to find which block the anchor's single `line` falls inside, and extend the visible decoration/marker to that block's full `[start,end]` range. This needs **zero** contract/export/schema changes and stays inside the "no export change" precedent.

This is flagged with HIGH confidence as the correct minimal-change path, but it is a genuine architectural decision the planner must make explicit (not silently assume) since it diverges from CONTEXT.md's literal D-05 wording — see Open Questions.

**D-07 "first overlapping block" rule** becomes a direct, cheap computation once every block's `[start,end]` is known: for each existing comment anchor, find the block list in document order and take the first block whose range contains (or is contained by, given the anchor is now single-line) the anchor's `line`.

### Priority 3 — Task-list / front-matter / GFM-table plugin choice (independently re-verified)

**GFM tables: zero plugin, confirmed.** `markdown-it`'s block-rule ruler registration [VERIFIED: `node_modules/markdown-it/lib/parser_block.mjs:10,25`]:
```javascript
// Source: node_modules/markdown-it/lib/parser_block.mjs (installed 14.3.0)
import r_table from './rules_block/table.mjs'
// ...
['table', r_table, ['paragraph', 'reference']],   // ← built into the DEFAULT ruler, not a plugin
```
`table.mjs` implements the full GFM table extension (`https://github.github.com/gfm/#tables-extension-`) as a core block rule in the `default` preset (confirmed by inspecting `node_modules/markdown-it/lib/rules_block/table.mjs`'s own header comment). Direct render test confirms correct output with zero configuration:
```
| A | B |        →   <table><thead><tr><th>A</th><th>B</th></tr></thead>
|---|---|             <tbody><tr><td>1</td><td>2</td></tr></tbody></table>
| 1 | 2 |
```
**UI-SPEC's "zero plugin for GFM tables" claim is CONFIRMED correct.**

**Task lists: need a local rule, confirmed — raw text by default.** Direct render test:
```
- [ ] task one      →   <ul><li>[ ] task one</li>
- [x] task done              <li>[x] task done</li></ul>
```
Token inspection confirms the exact shape a local rule must target: each `list_item_open`'s inner `inline` token has a single `text` child whose `.content` starts with the checkbox syntax [VERIFIED, parsed in this session]:
```
list_item_open [0,1]
  paragraph_open [0,1]
    inline: children = [{ type: 'text', content: '[ ] task one' }]
```
A local **core** rule (registered after the `inline` stage, e.g. `md.core.ruler.after('inline', 'task-list', fn)`) can walk `state.tokens`, find each `list_item_open`, look at its immediate `paragraph_open`→`inline`→`children[0]`, and if it's a `text` token matching `/^\[([ xX])\]\s+/u`: strip the matched prefix from `.content` and set a `meta` flag (markdown-it tokens carry an arbitrary `.meta` field) on the `list_item_open` token, e.g. `token.meta = { taskChecked: match[1] !== ' ' }`. A `renderer.rules.list_item_open` override reads that flag and prepends `<input type="checkbox" disabled :checked>` before the stripped text. **UI-SPEC's "local core rule, ~20-40 lines" estimate is CONFIRMED accurate and implementable exactly as scoped.**

**Front-matter: needs a local rule, confirmed — misparsed by default.** Direct render test on:
```
---
title: Example
draft: true
---

# Heading after front matter
```
produces (confirmed in this session):
```
<hr>
<h2>title: Example
draft: true</h2>
<h1>Heading after front matter</h1>
```
— the opening `---` becomes a thematic break (`hr`), and because the following two text lines are immediately followed by another `---`, markdown-it's `lheading` (setext heading) rule claims them as an `<h2>`. This is a genuine misparse, **exactly matching the UI-SPEC's description**. The fix: a **block** rule registered to run before all default block rules (`md.block.ruler.before('table', 'front_matter', fn, { alt: [] })` or equivalent earliest position), that — only when `state.line === 0` and the first line is exactly `---` — scans forward for a closing `---` line, and if found, emits a single `fence` token with `info: 'yaml'` spanning that range and advances `state.line` past it, so the rest of the document parses normally and front matter renders through the **existing, unmodified** fenced-code-block render path (D-11: "YAML front-matter renders as a code block"). **UI-SPEC's approach is CONFIRMED correct and is the only viable fix** — attempting to special-case the `hr`+`lheading` interaction after the fact would be strictly more fragile than pre-empting both rules with an earlier-registered block rule.

**Verdict: UI-SPEC's plugin-choice resolution required no correction.** All three Open-Questions-section claims in `16-UI-SPEC.md` (GFM zero-plugin, task-list local rule, front-matter local rule) are independently confirmed against the actual installed package's parse behavior.

### Priority 3b — Critical gotcha: image href validation happens at PARSE time, not render time

This was **not** anticipated by the UI-SPEC's "add a `renderer.rules.image` override" framing and must be corrected before planning Task 3.

markdown-it's default `image` **inline** rule calls `state.md.validateLink(href)` during *parsing*, before any renderer rule ever runs [VERIFIED: `node_modules/markdown-it/lib/rules_inline/image.mjs`]:
```javascript
// Source: node_modules/markdown-it/lib/rules_inline/image.mjs (installed 14.3.0)
res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax)
if (res.ok) {
  href = state.md.normalizeLink(res.str)
  if (state.md.validateLink(href)) {
    pos = res.pos
  } else {
    href = ''                 // ← pos is NOT advanced past the href on failure
  }
}
// ... later: if the character at `pos` isn't ')', the whole `![...](...)`
//     fails to parse as an image and falls back to literal bracket text —
//     no `image` token is ever produced, so renderer.rules.image never runs.
```
Direct test against the project's **actual, currently-shipped** `renderMarkdownPreview` (not a fresh instance — the real hardened module) confirms this breaks relative images today:
```
Input:  ![alt](./relative/path.png)
Output: <p>![alt](./relative/path.png)</p>     ← literal text, NOT <img>, because the
                                                   existing validateLink (http(s)/mailto
                                                   only) rejects the schemeless relative
                                                   path and the image rule silently fails
Input:  ![remote](https://evil.example.com/x.png)
Output: <p><img src="https://evil.example.com/x.png" alt="remote"></p>  ← https: PASSES
                                                   validateLink, so remote images parse
                                                   fine today — exactly backwards from D-09
```
A `renderer.rules.image` override alone **cannot** fix this, because for relative images no `image` token is ever created to run that override against. The fix verified working in this session is to **replace the `image` inline rule entirely** with one that substitutes a local, image-only validator for the duration of its own execution, leaving `state.md.validateLink` (and therefore `link_open`/D-10's link behavior) completely untouched for every other rule:
```typescript
// Source: verified working in this research session (node, installed markdown-it@14.3.0)
import defaultImageRule from 'markdown-it/lib/rules_inline/image.mjs';

function validateImageHref(href: string): boolean {
  const trimmed = href.trim();
  if (/^https?:/iu.test(trimmed)) return true;        // remote — ALLOWED TO PARSE;
                                                        // render-time rule decides placeholder-vs-fetch
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false; // any other explicit scheme
                                                        // (javascript:, data:, vbscript:, file:) — BLOCKED
  if (trimmed.startsWith('//')) return false;          // protocol-relative — BLOCKED (ambiguous scheme)
  return true;                                          // schemeless relative path — ALLOWED TO PARSE
}

renderer.inline.ruler.at('image', (state, silent) => {
  const original = state.md.validateLink;
  state.md.validateLink = validateImageHref;
  try {
    return defaultImageRule(state, silent);
  } finally {
    state.md.validateLink = original;   // restore the shared link validator immediately
  }
});
```
Verified output with this replacement in place:
```
![alt](./relative/path.png)                       → <img src="./relative/path.png" alt="alt">
                                                       (now a real token — renderer.rules.image
                                                       can rewrite src to the content route)
![remote](https://evil.example.com/x.png)          → <img src="https://…" alt="remote">
                                                       (parses; renderer.rules.image checks for
                                                       an http(s) scheme and substitutes the
                                                       placeholder text at render time)
![bad](javascript:alert(1))                        → literal text, no token produced — blocked
![bad2](data:image/png;base64,AAAA)                → literal text, no token produced — blocked
[link](./relative)                                 → literal text (UNCHANGED — link validateLink
                                                       untouched by the try/finally swap)
[link2](https://good.example.com)                  → real <a href> (UNCHANGED)
```
The `renderer.rules.image` override then only needs to distinguish relative (no scheme) from `https?:` at **render** time to choose "rewrite `src` to the content route" vs. "emit placeholder text", using `token.attrGet('alt')` for the placeholder copy per the UI-SPEC's exact format (`Remote image not loaded: "{alt}" — {url}`).

### Priority 4 — e2e/test strategy for MDV-04 security

**Existing unit-test precedent to extend** [VERIFIED: `tests/unit/markdown-preview.test.ts`]:
```typescript
// Source: tests/unit/markdown-preview.test.ts:5-9 (existing precedent)
test('renders the exact local Markdown buffer and treats hostile content as inert', () => {
  const html = renderMarkdownPreview(
    '# Local attempt\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n' +
    '[file](file:///private/secret)\n\n[data](data:text/html;base64,PHNjcmlwdD4=)\n\n' +
    '[good](https://example.test)',
  );
  // ... asserts the script tag is escaped text, dangerous-scheme links fall back to
  //     literal text, and the good https link becomes a real <a target="_blank" ...>
});
```
This exact pattern extends directly for Phase 16: add cases for `html:false` raw `<img onerror=...>` (must escape, not execute), relative image src (must become `<img src="/api/files/.../image?path=...">`, not a content-route-bypassing absolute URL), remote image src (must become placeholder text, never `<img>`), and `data:`/`javascript:`/`vbscript:` image hrefs (must fall back to literal text per Priority 3b's verified behavior) — same assertion style, same file.

**Existing CSP test precedent to extend** [VERIFIED: `tests/api/security.test.ts:128-136`]:
```typescript
// Source: tests/api/security.test.ts:128-136 (existing precedent)
expect(headers['x-frame-options']).toBe('DENY');
expect(headers['content-security-policy']).toContain("default-src 'self'");
expect(headers['content-security-policy']).toContain("connect-src 'self'");
// ...
```
No new assertion is needed here *unless* the planner wants an explicit regression test asserting `img-src 'self'` specifically remains present and unchanged after the route addition (recommended as a one-line addition, since this phase is the first to add a binary-serving same-origin route and a future regression here would be a real CSP widening).

**Existing e2e comment-composer precedent to model the new MDV-02/03 flow on** [VERIFIED: `tests/e2e/anchored-review.spec.ts:253-283`]: the existing flow is `click a Monaco line → .monaco-anchor-zone--composer textarea appears → fill() → header text asserts "<path> · <Side> line <N>"`. For Rendered mode, the equivalent e2e test should: open a `.md` file, click `Rendered`, locate a `.rendered-block` (e.g. by its text content), click its hover-revealed `+` button (D-04), assert the composer appears with the same `CommentComposer.vue` component (props confirmed `path/side/line/text/status`, no range field [VERIFIED: `src/web/components/CommentComposer.vue:8-17`] — consistent with the single-line-anchor finding above), fill and submit, then toggle to `Source` and assert a marker/decoration is visible at the block's source line(s).

**New negative security e2e tests to add**, run under the real production CSP (the app already boots with these headers per `applySecurityHeaders`):
1. Markdown source containing `<script>alert('xss-marker')</script>` → assert no `dialog`/console side effect fires and the page's `document.title`/a tracked global is unchanged (the existing pattern for "did a script execute" assertions elsewhere in the e2e suite should be followed, not invented fresh).
2. Markdown source containing `[click](javascript:window.__xss=1)` and `[click](data:text/html,<script>...)` → assert the rendered text is non-interactive (no `<a>` element at all, matching Priority 3's/the existing hardened renderer's verified fallback-to-literal-text behavior) and clicking the rendered text does not set any marker global.
3. Markdown source containing a raw `<img src=x onerror="window.__xss=1">` → assert it renders as escaped text (not a live `<img>` tag) per `html:false`.
4. A relative image reference inside a `.md` file in the review session → assert the resulting `<img>` `src` attribute points at the new same-origin `/api/files/:fileId/image?path=...` route (never a raw filesystem path, never the literal relative Markdown reference) and that the image actually loads (asserting `naturalWidth > 0` or an equivalent Playwright image-loaded check).
5. A remote image reference (`https://...`) → assert **no** `<img>` tag is present at all and the placeholder text matches the UI-SPEC's exact copy format.

### Priority 5 — Scroll sync implementation precedent (D-03)

**Monaco's diff-editor scroll sync is native and non-configurable — confirmed no equivalent toggle exists.** The existing `createDiffEditor` call [VERIFIED: `src/web/monaco/diff-adapter.ts:124-144`] passes no scroll-sync-related option:
```typescript
// Source: src/web/monaco/diff-adapter.ts:124-144 (existing, full options object — read in this session)
this.diffEditor = monaco.editor.createDiffEditor(host, {
  ariaLabel: 'Immutable base and head side-by-side diff',
  automaticLayout: false,
  diffAlgorithm: 'advanced',
  diffWordWrap: 'off',
  fontFamily: CODE_FONT_FAMILY,
  fontSize: CODE_FONT_SIZE,
  lineHeight: CODE_LINE_HEIGHT,
  glyphMargin: true,
  minimap: { enabled: false },
  occurrencesHighlight: 'off',
  originalEditable: false,
  readOnly: true,
  renderSideBySide: true,
  renderSideBySideInlineBreakpoint: 0,
  useInlineViewWhenSpaceIsLimited: false,
  hideUnchangedRegions: HIDE_UNCHANGED_REGIONS,
  renderIndicators: false,
  renderGutterMenu: false,
  renderMarginRevertIcon: false,
});
```
No `scrollSync`-shaped field appears in this options object, and `IStandaloneDiffEditor`'s own scroll synchronization between its `originalEditor`/`modifiedEditor` sub-editors is internal engine behavior, not a toggleable public API. This confirms there is **no Monaco primitive to delegate to** for Rendered-mode scroll sync — the two `RenderedMarkdownView.vue` instances (one per pane in side-by-side layout) are plain DOM, entirely outside Monaco, so D-03 genuinely requires a hand-rolled implementation, exactly as UI-SPEC's "visual contract, not full algorithm — implementation detail left to planner" framing anticipated. The recommended mechanism (consistent with the UI-SPEC's resolution): on `scroll` of either pane (debounced via `requestAnimationFrame`, not raw scroll-event-per-frame), find that pane's topmost visible `.rendered-block` (via `getBoundingClientRect()` against the viewport, or an `IntersectionObserver` keyed to each block for a cheaper steady-state cost), locate the block in the counterpart pane whose `[data-start,data-end]` is nearest by range midpoint, and call `scrollIntoView({ block: 'start' })` or an equivalent scrollTop assignment on the counterpart pane — guarding against feedback loops (programmatic scroll from the sync handler must not itself re-trigger the other pane's scroll listener; a simple "is this an in-flight programmatic scroll" boolean flag, set before and cleared after the `scrollIntoView` call, is the standard pattern and needs no new library).

### Anti-Patterns to Avoid

- **Treating `renderer.rules.image` as sufficient for D-09 without the inline-rule replacement.** Confirmed in this session: relative images never reach a render rule at all under the current shared `validateLink`, because the parse-time `image` inline rule blanks the href and fails to produce a token (Priority 3b).
- **Assuming the anchor schema already supports ranges because CONTEXT.md's D-05 says "line range."** Verified false — `DurableAnchorV1Schema`/`buildDurableAnchor` are single-line only; planning must make an explicit choice (Priority 2's critical finding), not silently assume a range field exists.
- **Reaching for a markdown-it plugin "just to be safe."** Both independently-disputable claims in the UI-SPEC (GFM tables, task-lists/front-matter) are confirmed correct by direct render tests against the actual installed version; a plugin would add unaudited surface to a security-load-bearing module for zero functional gain.
- **Serving images by minting a second opaque `fileId`.** The `fileId` space only covers changed files (Priority 1); an image-specific `fileId` lookup would 404 for every unchanged repo-local image, which is the common case for logos/diagrams referenced by Markdown docs.
- **Using `fs.realpath` for the image route's path safety.** Phase 15's own precedent explicitly rejected `realpath` in favor of a per-segment `lstat` walk, because `realpath` *follows* symlinks (the opposite of the "never follow symlinks" rule) [VERIFIED: `.planning/phases/15-standalone-file-review/15-RESEARCH.md` Alternatives Considered table].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GFM table parsing | A custom pipe-table tokenizer | markdown-it's built-in `table` core-block rule (zero config) | Confirmed present and correct in the installed version — see Priority 3 |
| Block source-line tracking | A custom line-counting pass over the rendered HTML | `token.map` already present on every block-level `_open` token at exactly the granularity D-05 needs | Verified per-block-type in Priority 2; re-deriving this from scratch risks drift from markdown-it's own (occasionally subtle, e.g. multi-line-paragraph) line-counting semantics |
| HTML sanitization / XSS filtering | A DOMPurify-style post-render sanitizer pass | `html: false` (already set) + the inline-rule/render-rule overrides documented above, all operating inside markdown-it's own token pipeline | A second sanitization pass after `md.render()` is redundant defense that can itself introduce parsing-mismatch bugs (e.g. a sanitizer that doesn't understand markdown-it's own escaping); the project's existing precedent (`validateLink`) already solves this at the token level, not the string level |
| Interval/overlap matching for D-01 markers | An interval-tree package | Plain half-open-interval overlap comparison (`block.start < change.end && change.start < block.end`) in a per-file loop | Block counts per file are in the tens-to-hundreds range; an interval tree is asymptotic overkill with real integration cost for no measurable benefit here |
| Scroll-sync nearest-block matching | A full virtualization/sync-scroll library | Hand-rolled nearest-range matching on `[data-start,data-end]` (Priority 5) | No Monaco API exists to delegate to for two plain DOM panes (confirmed above); the matching problem is a small, bounded nearest-neighbor lookup over an already-materialized block list, not a general virtualization problem |

**Key insight:** Nearly every piece of "new" capability this phase needs (block source-line tracking, table parsing, front-matter/task-list syntax) is **already present** in markdown-it's existing token stream or default rule set — the actual engineering work is almost entirely *reading off* `token.map`/`token.children` correctly and wiring small, targeted overrides, not building new parsing or sanitization machinery.

## Common Pitfalls

### Pitfall 1: Assuming a render-rule override is enough to fix relative images
**What goes wrong:** Writing only a `renderer.rules.image` override (as the UI-SPEC's phrasing literally suggests) and finding relative images still render as literal bracket text in testing.
**Why it happens:** The shared `validateLink` override runs inside the `image` *inline* rule at parse time, before any render rule executes; on failure it blanks `href` without advancing the parser position, so the image fails to parse entirely — no token exists for the render rule to intercept.
**How to avoid:** Replace the `image` inline rule itself (`md.inline.ruler.at('image', ...)`) with a version that swaps in a local image-only validator for its own duration only, exactly as verified working in Priority 3b.
**Warning signs:** A task/test asserting "relative image src gets rewritten to the content route" fails with the `<img>` tag missing entirely (not present-but-wrong-src) — that's the signature of this specific failure mode.

### Pitfall 2: Assuming the durable anchor schema already supports line ranges
**What goes wrong:** Planning a Task that writes `{ side, startLine, endLine, ... }` directly into a `DurableAnchorV1`-shaped payload, which will fail Zod's `strictObject` validation (`endLine`/`startLine` aren't recognized keys; only `line` is).
**Why it happens:** CONTEXT.md's D-05 phrasing ("Anchors use the block's markdown-it `map` line range") reads as if range anchoring already exists; it doesn't — `DurableAnchorV1Schema`/`buildDurableAnchor` are single-line only throughout the whole anchor domain model.
**How to avoid:** Anchor to the block's first source line (`buildDurableAnchor` unmodified); compute the full visible range client-side in source view by re-parsing the block map, as documented in Priority 2.
**Warning signs:** Any Task description phrase like "store the block's end line in the anchor" — flag it in plan review; this phase's scope (per Phase 13's explicit D-14 precedent) is schema-change-free.

### Pitfall 3: Letting the front-matter block rule run after `hr`/`lheading`
**What goes wrong:** Registering the front-matter detection rule at the default (append) position instead of before `table`/other default rules causes `hr` to claim the opening `---` first, producing the exact misparse (`<hr>` + spurious `<h2>`) documented in Priority 3, with the new rule never getting a chance to run.
**Why it happens:** markdown-it block rules run in ruler-registration order per line; `hr` and `lheading` are both earlier/higher-priority than any `.push()`-appended custom rule by default.
**How to avoid:** Register with `md.block.ruler.before('table', 'front_matter', fn)` (or an equivalently early anchor point) and gate the rule strictly on `state.line === 0` so it only ever fires at the very start of the document, never mid-document on an unrelated `---` (which is valid Markdown for both `hr` and setext-H2 elsewhere in a file and must keep its normal meaning there).
**Warning signs:** A file with front matter renders an `<hr>` before the first real heading, or the front-matter text appears as a heading instead of a code block.

### Pitfall 4: Scroll-sync feedback loops
**What goes wrong:** Pane A's scroll handler programmatically scrolls Pane B, which fires Pane B's own scroll handler, which scrolls Pane A again, producing visible jitter or an infinite ping-pong.
**Why it happens:** `scrollIntoView`/`scrollTop` assignment fires the same `scroll` event a user-initiated scroll would, and naive listener code can't distinguish the two.
**How to avoid:** Set a boolean "programmatic scroll in flight" flag immediately before the sync call and clear it in a microtask/animation-frame callback after; the counterpart pane's scroll listener checks and skips the flag.
**Warning signs:** Scrolling one pane causes visible stutter, or scroll position in the other pane overshoots/undershoots on every sync tick.

## Code Examples

### Confirming the full token stream for the D-05 granularity set
```typescript
// Source: verified in this research session, node -e against installed markdown-it@14.3.0
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
const tokens = md.parse(sampleMarkdown, {});
for (const t of tokens) {
  console.log(t.type, JSON.stringify(t.map), 'tag=' + t.tag);
}
// heading_open [0,1] / paragraph_open [2,3] / list_item_open [4,5] (own map, not the
// whole bullet_list_open [4,7]) / tr_open [9,10] (own map, not the whole table_open
// [7,10]) / blockquote's inner paragraph_open [11,12] / fence [13,16]
```

### Image inline-rule replacement (full working pattern, verified)
```typescript
// Source: verified working in this research session — see Priority 3b for the
// complete file-level pattern and verified input/output pairs
import defaultImageRule from 'markdown-it/lib/rules_inline/image.mjs';

function validateImageHref(href: string): boolean {
  const trimmed = href.trim();
  if (/^https?:/iu.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  return true;
}

renderer.inline.ruler.at('image', (state, silent) => {
  const original = state.md.validateLink;
  state.md.validateLink = validateImageHref;
  try {
    return defaultImageRule(state, silent);
  } finally {
    state.md.validateLink = original;
  }
});
```

### Path-safety primitive to reuse for the image route (existing precedent, read not modified)
```typescript
// Source: src/git/exact-patch.ts:465-480 — per-segment lstat walk, never realpath-follow
let current = /* canonicalized repository root, resolved once */;
for (const [index, part] of parts.entries()) {
  current = Buffer.concat([current, Buffer.from('/', 'ascii'), Buffer.from(part, 'latin1')]);
  const entry = await lstat(current);
  if (index < parts.length - 1 && entry.isSymbolicLink()) fail();
  // final-segment symlink handling per existing exact-patch.ts discretion
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| n/a — this is new functionality, not a migration | markdown-it's built-in `table` core rule for GFM tables (no plugin, since markdown-it 9.x+ when the table rule was promoted into the default preset) | n/a | Confirms the UI-SPEC's "no plugin" call is not just locally-correct-today but has been stable project-wide markdown-it behavior for many major versions — low risk of regressing on a future markdown-it bump |

**Deprecated/outdated:** None relevant — this phase does not touch any deprecated API surface.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact blob-at-path-at-commit primitive for resolving an unchanged repo-local image in a **committed-comparison** session (not uncommitted/standalone) was not fully traced to a specific exported function in `src/git/objects.ts`/`src/git/*` — this research confirmed `ObjectReader.read(oid, options)` exists and is keyed by a known blob `oid`, but did not confirm which existing helper resolves an arbitrary relative path to a blob `oid` at a given commit tree. | Priority 1 (image route, committed-session branch) | If no such helper exists today, the planner needs a new `git ls-tree`/`git rev-parse <commit>:<path>` (or equivalent native-Git-CLI, per this project's "native Git CLI is the pathspec/tree source of truth" constraint already established in Phase 15) wrapper — this is a bounded, well-precedented addition (Phase 15 already added `resolveStandaloneArguments`/`classifyStandaloneGitState` as sibling native-Git-CLI wrappers) but was not located/verified as already existing in this session |

**If this table is empty:** N/A — one item above; every other claim in this document is `[VERIFIED]` against either the installed package's actual source/behavior or this project's own codebase.

## Open Questions (RESOLVED)

1. **Does `src/git/objects.ts` (or a sibling module) already expose a "resolve relative path → blob at this commit" primitive, or does the planner need to add one?**
   - What we know: `ObjectReader.read(oid, options)` reads a blob given its OID; the existing diff/comparison machinery must already resolve `(commit, path) → blob OID` somewhere (that's how `changedFiles` get their `oldBlobOid`/`newBlobOid` in the first place), but this session did not trace which module performs that resolution for arbitrary (not-already-known) paths.
   - What's unclear: Whether that resolution logic is reusable as-is for an arbitrary image path, or whether it's baked into the diff-computation pipeline in a way that needs a small new wrapper.
   - Recommendation: Planner reads `src/git/diff.ts` (or wherever `ChangedFile.oldBlobOid`/`newBlobOid` get computed) before writing the image-route task; very likely a `git ls-tree <commit> -- <path>` or `git rev-parse <commit>:<path>` one-liner, matching the native-Git-CLI-as-source-of-truth constraint already established in Phase 15.

2. **Exact anchor-line convention for list items / table rows whose `map` end-exclusive range spans more than one physical source line (e.g. a wrapped table cell, or a multi-paragraph list item).**
   - What we know: The common case (single-line list items, single-line table rows) maps cleanly to "first line of the block."
   - What's unclear: Whether "first line" is unambiguous enough for every block the project's actual Markdown corpus produces (e.g. a list item containing a nested fenced code block — `token.map` for the outer `list_item_open` would span the whole nested content).
   - Recommendation: Not blocking — "first line of the block's own `map`" is well-defined regardless of nested content width; flagged only so the planner's UAT criteria explicitly test a list item containing a nested code block.

3. **UI-SPEC's "open question" on rendering-failure error copy (`16-UI-SPEC.md` Open Questions #5) is a product-copy decision, not a technical unknown** — no additional research needed; the existing `SummarySection.vue` has no try/catch around `renderMarkdownPreview` either, confirming there is no precedent failure-state copy to match, as the UI-SPEC already notes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `markdown-it` | All of MDV-01..04 | ✓ | 14.3.0 installed [VERIFIED] | — |
| `monaco-editor` | MDV-01 (source view), D-01 markers | ✓ | 0.55.1 installed [VERIFIED] | — |
| `vitest` | Unit tests (Priority 4) | ✓ | 4.1.10 installed [VERIFIED] | — |
| `@playwright/test` | e2e tests (Priority 4) | ✓ | 1.61.1 installed [VERIFIED] | — |
| `node` | Runtime | ✓ | engines requires >=24; repo pinned to Node 24 per project CLAUDE.md | — |
| `git` CLI | Image route (Priority 1, committed-session blob resolution) | ✓ | 2.54.0 installed [VERIFIED in Phase 15 research, same environment] | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V5 Input Validation | yes | Zod (`OpaqueFileIdSchema` pattern reused for the new route's params); image-route `path` query param must go through the same per-segment path-safety walk as `src/git/exact-patch.ts`, never a regex-only check |
| V12 File and Resources (output encoding, SSRF-adjacent) | yes | `img-src 'self'` CSP + renderer-level block on remote `src` (never requested server-side at all — the server route only ever serves bytes the client already decided are repo-local); extension allow-list on the image route prevents arbitrary-file-type disclosure through a Markdown image tag |
| V14 Configuration (CSP) | yes | `src/server/security.ts`'s static CSP header list — confirmed no directive change required (Priority 1) |
| V2 Authentication / V3 Session Management | n/a | Unchanged by this phase — image route reuses the same session/capability-registry gating every other `/api/files/:fileId/*` route already has |
| V6 Cryptography | n/a | No new crypto surface in this phase |

### Known Threat Patterns for markdown-it + Fastify + Vue stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Stored XSS via raw HTML in Markdown source | Tampering / Elevation of Privilege | `html: false` (already set, unchanged) — confirmed via direct render test that `<script>`/`<img onerror>` escape to inert text, never parse as `html_block`/`html_inline` tokens |
| Stored XSS via dangerous link/image scheme (`javascript:`, `data:`, `vbscript:`) | Tampering | `validateLink` (links, unchanged) + the new image-specific validator (Priority 3b) — both confirmed via direct render test to fall back to literal text, never produce a clickable/loadable element |
| SSRF / privacy leak via remote image auto-fetch | Information Disclosure | Renderer never emits a live `<img src="https://…">` for remote images (placeholder text only) — confirmed by the Priority 3b render-rule design; CSP `img-src 'self'` is defense-in-depth, not the primary control, since the primary control must prevent even a CSP-violation-report side channel |
| Path traversal / symlink escape via the new image route's `path` param | Tampering / Information Disclosure | Reuse `src/git/exact-patch.ts`'s per-segment `lstat` walk (Phase 15 precedent), never `fs.realpath`; reject any path resolving outside the referencing file's own session/repo root |
| Arbitrary-file-type disclosure through the image route (e.g. requesting `.env` with a spoofed `.png`-shaped `path`) | Information Disclosure | Server-side Content-Type derivation from a minimal allow-listed extension set; reject/placeholder anything else regardless of what the client's renderer requested |

## Sources

### Primary (HIGH confidence)
- Installed `markdown-it@14.3.0` package source (`node_modules/markdown-it/lib/**`) — direct inspection of `parser_block.mjs`, `rules_block/table.mjs`, `rules_inline/image.mjs`, `renderer.mjs`, `index.mjs` (`BAD_PROTO_RE`/`validateLink` default), plus live `md.parse()`/`md.render()` execution against representative sample Markdown — all claims in Priorities 2 and 3 are `[VERIFIED: markdown-it 14.3.0 installed source + direct execution, this session]`
- Project codebase direct inspection: `src/web/model/markdown-preview.ts`, `src/server/security.ts`, `src/server/routes.ts`, `src/server/capabilities.ts`, `src/server/worktree-snapshot.ts`, `src/web/monaco/diff-adapter.ts`, `src/domain/anchor.ts`, `src/contracts/draft.ts`, `src/web/components/{SummarySection,DiffWorkspace,CommentComposer,ActiveFileToolbar}.vue`, `src/git/exact-patch.ts`, `tests/unit/markdown-preview.test.ts`, `tests/api/security.test.ts`, `tests/e2e/anchored-review.spec.ts`, `package.json` — all claims tagged `[VERIFIED: <path>]` inline above
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md`, `.planning/phases/13-single-pane-file-rendering/13-RESEARCH.md`, `.planning/phases/15-standalone-file-review/15-RESEARCH.md` — prior-phase precedent for path-safety discipline and the "no schema change" convention, read in this session

### Secondary (MEDIUM confidence)
- `.planning/phases/16-rendered-markdown-preview/16-UI-SPEC.md` — approved design contract; treated as locked input, with two technical claims independently re-verified (Priority 3) and one gap identified that the UI-SPEC's own framing did not anticipate (Priority 3b's inline-rule mechanics)

### Tertiary (LOW confidence)
- `npm view markdown-it version` (registry latest `15.0.3`) — informational only, not acted on; the phase stays on the already-installed, already-audited `14.3.0`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every version number directly read from `package.json`/`node_modules`
- Architecture: HIGH — every load-bearing claim (token `map` shapes, anchor schema shape, CSP directives, route behavior, Monaco options) verified by direct source inspection or live execution against the actual installed code, not training-data recall
- Pitfalls: HIGH — both critical pitfalls (image parse-time validation, single-line anchor schema) were discovered and confirmed through direct execution in this session, not inferred

**Research date:** 2026-10-31
**Valid until:** 2026-11-30 (30 days — stable internal codebase; `markdown-it` pinned and not being upgraded this phase)
