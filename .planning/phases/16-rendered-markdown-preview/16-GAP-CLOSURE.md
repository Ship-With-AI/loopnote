# Phase 16 Gap Closure

Triggered by `16-UI-REVIEW.md`'s live-browser-verified findings: 3 functional
BLOCKER bugs that earlier automated verification/e2e/code-review missed, each
directly contradicting a locked requirement (ROADMAP Phase 16 success criteria
#1/#3, D-09, MDV-02/04). This document records root cause, fix, and regression
coverage for each, independently committed.

## GAP-01 — Relative images 401 under `<img src>`

**Commit:** `69afe20` — `fix(16-gap-01): authenticate rendered-image <img> loads via query-param token`

**Root cause:** `security.ts`'s `onRequest` hook rejected any `/api/*` request
without a matching `Authorization: Bearer <token>` header (`hasBearerToken`,
line 110 pre-fix). `client.ts` attaches this header via `fetch()` for every
other API call, but the image route (`GET /api/files/:fileId/image`) is
consumed through a literal rendered `<img src="...">` tag
(`rendered-markdown-blocks.ts`'s `buildImageRouteUrl`, used by
`RenderedMarkdownView.vue`), which structurally cannot attach a custom
header. Every relative image 401'd in a real browser despite passing in
earlier verification, because that verification only ever issued
request-level fetches with a manually-attached header — never the literal
`<img>` tag a browser actually renders.

**Fix:**
- `security.ts`: extracted the timing-safe comparison shared by both auth
  paths into `tokenMatches()` (reused by `hasBearerToken` and the new
  `hasImageRouteQueryToken`), added an `IMAGE_ROUTE_PATTERN` matching only
  `GET /api/files/:fileId/image`, and widened the auth gate so *that one
  route* also accepts the session token via a `?token=` query parameter.
  No other `/api/*` path accepts a query-string token.
- `routes.ts`: `FileImageQuerySchema` gained an optional `token` field so the
  route's own strict-object query validation tolerates the parameter.
- `rendered-markdown-blocks.ts`: `buildImageRouteUrl()` now takes a `token`
  argument and appends `&token=<encoded>` to the generated URL.
- Token threading: the session token was already parsed once from
  `location.hash` inside `createSessionClient()` (`client.ts`) and never
  exposed elsewhere. `SessionClient` gained a `readonly sessionToken: string`
  field; `App.vue` captures it into a `sessionToken` ref right after
  `createSessionClient()` returns and passes it down as a `session-token`
  prop through `DiffWorkspace.vue` to all three `RenderedMarkdownView`
  instances (single-pane, base pane, head pane), which use it in their
  `buildImageRouteUrl()` call. No second `location.hash` parse was added.

**Regression test:** `tests/e2e/rendered-markdown-security.spec.ts` — "the
relative image loads only through the same-origin content route, never
off-origin" now additionally asserts the generated `src` carries a
`?token=` parameter and polls the real `<img>` element's
`naturalWidth`/`complete` state (not a manually-headered fetch) to prove the
literal rendered tag actually loads the resource.

## GAP-02 — Side-by-side Rendered mode hides the Base pane

**Commit:** `9c838f8` — `fix(16-gap-02): give side-by-side Rendered mode two grid columns`

**Root cause:** `.diff-workspace__canvas` (`styles.css`) declares
`display: grid; grid-template-rows: 37px minmax(0, 1fr);` but never
`grid-template-columns`. Monaco's diff editor only needs one column because
it renders its own internal two-pane split inside a single
`.diff-workspace__editor` host div. Side-by-side Rendered mode instead places
two separate sibling `RenderedMarkdownView` roots (`basePaneRef`/
`headPaneRef`) directly as grid items in the same canvas
(`DiffWorkspace.vue`). With zero explicit columns, the grid's implicit
column-track count collapsed to one, forcing auto-placement to stack Base and
Head into separate rows instead of side-by-side columns — live-verified via
`getComputedStyle` showing `gridTemplateRows: "37px 0px 687px"` with no
`grid-template-columns` at all, and the Base pane measuring 0px tall.

**Fix:**
- `DiffWorkspace.vue`: the side-by-side canvas `<div>` gained a conditional
  `diff-workspace__canvas--rendered` modifier class, applied only while
  `mode === 'rendered'`.
- `styles.css`: `.diff-workspace__canvas--rendered` declares
  `grid-template-columns: 1fr 1fr`, matching the existing
  `.diff-workspace__side-labels` two-column pattern already used for the
  header row. `.diff-workspace__canvas--rendered > .diff-workspace__side-labels`
  spans both new columns so the header bar doesn't shrink to half width.
  Source mode (no modifier class) is unaffected — Monaco's single editor
  host still spans the canvas's one implicit column exactly as before.
- `.rendered-markdown` also gained `min-width: 0; min-height: 0;` (mirroring
  the sibling `.diff-workspace__editor` rule) so each pane stretches to fill
  its grid cell instead of sizing to content.

**Regression test:** `tests/e2e/rendered-markdown-preview.spec.ts` — "toggles
source and rendered views in single-pane and side-by-side layouts" now
asserts, with side-by-side Rendered mode active, that both
`.rendered-markdown` panes have nonzero bounding-box width and height, and
that `.diff-workspace__canvas`'s computed `grid-template-columns` resolves to
exactly two tracks.

## GAP-03 — Comment-trigger labels always say "paragraph"

**Commit:** `67d9de8` — `fix(16-gap-03): label comment triggers with the real block type`

**Root cause:** `RenderedMarkdownView.vue`'s `blockKindWord()` was called
with `entry.element`/`block.element`. Per `buildBlocks()`, `entry.element` is
always the generic wrapper `<div class="rendered-block">` created to host
hover/focus interactions and the comment-add button — the real block element
(the actual `<h1>`, `<li>`, `<pre>`, etc.) is appended *inside* that wrapper
as a child, and was never stored separately. `blockKindWord()` read the
wrapper's `tagName` (always `DIV`), fell through every branch, and returned
its `'paragraph'` default for every block type — live-verified: heading,
list-item, blockquote, and code-block triggers all produced identical
"paragraph" labels.

**Fix:** `RenderedBlockEntry` gained a `contentElement: HTMLElement` field
holding a reference to the original (pre-wrap) element, assigned in
`buildBlocks()` before it's reparented into the wrapper. Both call sites that
build a label (`showButtonFor`'s gutter-button `aria-label`/`title`, and
`renderAnnotations`'s accepted-comment identity line) now call
`blockKindWord(entry.contentElement)` / `blockKindWord(block.contentElement)`
instead of the wrapper.

**Regression test:** `tests/e2e/rendered-markdown-preview.spec.ts` — the
same side-by-side toggle test now hovers the rendered `# Preview Heading`
block and asserts its "Add comment" button's accessible name contains
"heading" and explicitly does **not** contain "paragraph".

## Verification run (final committed state)

- `npx vitest run tests/unit/rendered-markdown-blocks.test.ts tests/unit/markdown-preview.test.ts` — 31 passed.
- `npx playwright test tests/e2e/rendered-markdown-preview.spec.ts tests/e2e/rendered-markdown-security.spec.ts tests/e2e/anchored-review.spec.ts` — 10 passed.
- `npm run typecheck:web` — clean, zero errors.
- `npm run build:node` — clean, zero errors.

## Deviations

None. All three fixes were implementable within the explicit guidance given
for each gap (reuse the existing timing-safe comparison and token-threading
path for GAP-01; mirror the existing Monaco-mode column pattern for GAP-02;
store the pre-wrap element reference for GAP-03). No Rule-4 architectural
fork was hit.
