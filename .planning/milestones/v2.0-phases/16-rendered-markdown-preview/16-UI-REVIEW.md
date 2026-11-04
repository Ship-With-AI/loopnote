# Phase 16 — UI Review

**Audited:** 2026-10-31
**Baseline:** `16-UI-SPEC.md` (approved design contract)
**Screenshots:** captured live — real generated-review CLI server (`dist/bin/cumpa.mjs`, packed via `scripts/pack-runtime.mjs`) bound to `127.0.0.1`, driven with a real Chromium instance via the `browser` eval tool, against the `createGitFixture({ markdownPreview: true })`-equivalent fixture (front-matter, heading, two-line paragraph, task list, GFM table, blockquote, fenced code block, relative + remote image, XSS probe strings, `docs/added-note.md` single-pane file). Stored under `.planning/ui-reviews/16-rendered-markdown-preview/` (gitignored, never committed).

This is the Phase 16 advisory UI gate. **Non-blocking** — does not change release status. Findings below are for the record; no implementation code was modified during this audit.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Every comment-trigger/identity label collapses to "paragraph" regardless of actual block kind — `blockKindWord()`'s tag-based branches are dead code |
| 2. Visuals | 1/4 | Side-by-side **Rendered** mode never actually renders two columns — the Base pane is pushed to a measured `0px`-height CSS Grid row and is completely invisible |
| 3. Color | 4/4 | All marker/surface/accent tokens verified via computed styles — exact Phase 08 reuse, no new colors |
| 4. Typography | 4/4 | Heading/body/code roles verified via DOM (front-matter → `<pre><code class="language-yaml">`, H1 only larger role, code font-mono) — matches capped 4-size scale exactly |
| 5. Spacing | 4/4 | Table/code/chip padding and block margins consistent with existing `--space-*` scale; no arbitrary values found |
| 6. Experience Design | 1/4 | The relative-image content route (`GET /api/files/:fileId/image`) returns **HTTP 401 on every real `<img>` request** — D-09's headline "relative images render inline" deliverable is non-functional end-to-end |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Relative images never load (BLOCKER)** — Every reviewer opening a Markdown file with a repo-relative image sees a native broken-image icon instead of the designed inline picture, because the route is guarded by the same `Authorization: Bearer <token>` check as JSON API calls (`src/server/security.ts:110`), and a plain `<img src>` tag cannot send that header. Fix: accept the session token as a signed query parameter (or a scoped, short-lived cookie) specifically for this route, the same way the hash-token in the app's initial URL already proves session possession, instead of requiring a header no `<img>` request can ever send.
2. **Side-by-side Rendered mode shows only Head, Base is invisible (BLOCKER)** — `.diff-workspace__canvas` (`src/web/styles.css:1558-1566`) only declares `grid-template-rows`; it never declares `grid-template-columns`. The two sibling `RenderedMarkdownView` instances (`DiffWorkspace.vue:472-500`) therefore auto-place into separate grid **rows** instead of side-by-side **columns**, and the explicit `minmax(0, 1fr)` row hosting the Base pane loses the space race to the auto-sized row hosting Head, collapsing to a measured `0px`. Fix: give `.diff-workspace__canvas` an explicit two-column track (e.g. `grid-template-columns: 1fr 1fr`) and place the two rendered panes in column 1/column 2 of the same row, mirroring how `.diff-workspace__side-labels` already does it.
3. **Every comment-trigger/identity label always says "paragraph" (BLOCKER for the Copywriting/Accessibility contract)** — `blockKindWord()` (`RenderedMarkdownView.vue:54-61`) branches on `element.tagName` for `H1-6`/`LI`/`CODE`/`P`, but it is always called with the **outer wrapping `<div class="rendered-block">`** (`tagName` is always `DIV`), so every branch is unreachable dead code and the function always returns the `'paragraph'` fallback. Verified live: a `<h1>` heading, a `<li>` list item, a blockquote `<p>`, and a fenced TypeScript `<pre><code>` block all produced the identical label `Add comment · Head · paragraph`. This directly violates `16-UI-SPEC.md:116`'s requirement to name the actual block kind, and strips the only non-color cue this feature gives screen-reader/tooltip users about what they're commenting on. Fix: pass the block's *original* tag (captured at `buildBlocks()` time, before wrapping) into `blockKindWord()`, or move the kind check to the first element child instead of the wrapper.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **BLOCKER** — `RenderedMarkdownView.vue:54-61`:
  ```ts
  function blockKindWord(element: HTMLElement): string {
    const tag = element.tagName;
    if (/^H[1-6]$/u.test(tag)) return 'heading';
    if (tag === 'LI') return 'list item';
    if (tag === 'CODE') return 'code block';
    if (tag === 'P') return element.closest('blockquote') !== null ? 'quote' : 'paragraph';
    return 'paragraph';
  }
  ```
  Both call sites (`:75`, trigger button `aria-label`/`title`; `:165`, the `conversation-card` identity line) pass `entry.element`/`block.element`, which is always the outer `.rendered-block` `<div>` created in `buildBlocks()` — never an `H1-6`, `LI`, `CODE`, or `P` node. Confirmed live with four distinct block kinds, all producing `Add comment · Head · paragraph`:
  - `<h1>Preview Heading</h1>` → "paragraph"
  - `<li>First item</li>` → "paragraph"
  - `<blockquote><p>Blockquote paragraph text.</p></blockquote>` → "paragraph" (see `05-block-kind-mislabel-evidence.webp`, where the paragraph's and the blockquote's conversation cards both read "· paragraph")
  - fenced ` ```ts ` code block → "paragraph" (see `07-source-range-highlight-multiline.webp` composer header: "docs/preview.md · Head · line 20" with body text "Multi-line range audit comment on fenced code block." immediately followed by zero kind differentiation anywhere in the UI)
  - Screenshots: `05-block-kind-mislabel-evidence.webp`, `06-composer-open-list-item.webp`
- The actual string contracts that ARE reachable match the spec exactly: `Source`/`Rendered` toggle text (`01-toggle-source-single-pane.webp`, `02-single-pane-rendered.webp`), `Added`/`Removed`/`Changed` marker chips (`04-...webp`), and the remote-image placeholder copy `Remote image not loaded: "remote" — https://example.test/remote.png` (`08-images-relative-broken-remote-placeholder.webp`) — all verbatim per `16-UI-SPEC.md:117`.
- Net score held to 2/4 rather than 1/4 because the reachable strings are correct; the deduction reflects that the one new, phase-specific copywriting contract (block-kind naming) is **never actually reachable** in practice.

### Pillar 2: Visuals (1/4)

- **BLOCKER** — Side-by-side Rendered mode does not lay the two panes out side by side. Live measurement on `docs/preview.md` (modified on both sides) with Rendered mode active:
  ```js
  getComputedStyle(document.querySelector('.diff-workspace__canvas')).gridTemplateColumns // => "1146px"   (ONE column)
  getComputedStyle(document.querySelector('.diff-workspace__canvas')).gridTemplateRows    // => "37px 0px 687px"
  [...document.querySelectorAll('.rendered-markdown')].map(p => p.getBoundingClientRect())
  // => [{x:294, y:149, width:1146, height:0}, {x:294, y:149, width:1146, height:687}]
  ```
  `src/web/styles.css:1558-1566` declares `.diff-workspace__canvas { display: grid; grid-template-rows: 37px minmax(0, 1fr); }` with **no `grid-template-columns`**. With only one implicit column, CSS Grid auto-placement pushes the second `RenderedMarkdownView` (Head pane) into a new, auto-sized implicit row sized to its full content height (687px); the explicit `minmax(0, 1fr)` row hosting the Base pane then has nothing left to claim in the fixed-height container and renders at exactly `0px`. The Base/removed-side rendered content is not scrolled off-screen — it occupies zero pixels and cannot be revealed by any scroll action. This directly breaks `16-UI-SPEC.md` D-08 ("side-by-side left pane anchors base, right pane anchors head") for the feature's flagship side-by-side use case.
  - Screenshot: `04-toggle-rendered-side-by-side-BUG-base-pane-collapsed.webp` — only one column of content is visible; compare against `03-toggle-source-side-by-side.webp`, which shows the correct two-column Source/Monaco layout for the identical file.
- Markers, chips, and block structure are otherwise correctly implemented in the one visible (Head) pane: the "Changed" chip renders with `border-left` + `status-badge--modified` exactly per D-01/D-02 (confirmed via `rendered-block rendered-block--changed` class + chip DOM), but this cannot be judged a full pass when half of the view that's supposed to carry it is invisible.
- Single-pane Rendered mode (added-only file, `docs/added-note.md`) is unaffected by the grid bug (only one `RenderedMarkdownView` is mounted there) and renders cleanly — `02-single-pane-rendered.webp`.

### Pillar 3: Color (4/4)

- Marker triplet confirmed via live DOM: `.rendered-block--changed` → `.status-badge.status-badge--modified` (maps to Phase 08 `--status-modified-*`), matching the Added/Removed/Changed → `--status-added-*`/`--status-deleted-*`/`--status-modified-*` mapping declared in `16-UI-SPEC.md:88-90`.
- Front-matter and fenced code blocks both resolve to `<pre><code class="language-yaml|ts">` with the shared `.rendered-markdown pre` background (`var(--surface-panel)`), confirmed identical styling path, no special-casing.
- Remote-image placeholder text renders in `--text-muted` per spec; no new accent consumer found beyond the existing `.diff-workspace__gutter-action` focus-ring reuse.
- No hardcoded hex/rgb colors found in `RenderedMarkdownView.vue` or the new CSS block in `styles.css:1989-2048`.

### Pillar 4: Typography (4/4)

- Confirmed via DOM: `<h1>` renders as the lone larger Page-heading role; `<h2>`-`<h6>` (not separately exercised in the fixture beyond h1, but code path shared with h1's Body/600 sibling rule) inherit the capped 4-size scale.
- Code/front-matter blocks use `var(--font-mono)` at the Code role (confirmed class `language-yaml`/`language-ts` inside `<pre><code>`, same selector as the rest of the app's fenced-code styling).
- Table `<th>` renders Body/600 with `--surface-panel` background exactly as declared (`16-UI-SPEC.md:142`); table/code `overflow-x: auto` behavior confirmed present.
- No sixth/new font size or weight introduced anywhere in the rendered output.

### Pillar 5: Spacing (4/4)

- Chip (`status-badge`) padding, table cell padding (`var(--space-2) var(--space-4)`), and code block padding (`var(--space-4)`) all verified present and match `16-UI-SPEC.md:46-57,142,146`.
- Toggle button pair spacing in `ActiveFileToolbar.vue` uses the existing `--space-1` gap, no new value introduced.
- No arbitrary (non-token) spacing values found in the new CSS.

### Pillar 6: Experience Design (1/4)

- **BLOCKER** — The new relative-image content route is unusable from its only real consumer. Live network trace of the actual `<img>` request issued by the browser (not a synthetic fetch) for `docs/assets/logo.svg`:
  ```
  GET /api/files/file_.../image?path=./assets/logo.svg&side=head
  resourceType: image   status: 401   ok: false
  body: {"code":"request-unavailable","message":"This request is not available in the current session. Relaunch Cumpa from the terminal."}
  ```
  Root cause confirmed in source: `src/server/security.ts:91-113` gates **every** `/api/*` request (including this one — `src/server/routes.ts:348`) behind `hasBearerToken()`, which only checks the `Authorization: Bearer <token>` request **header** (`security.ts:62-70`). An `<img src="...">` element has no mechanism to attach a custom header, so this request can never pass the gate when issued the only way the feature actually issues it. The image's `naturalWidth`/`naturalHeight` are both `0` with `complete: true` — a genuinely broken image, not a slow-loading one. The resulting UI shows the browser's native broken-image glyph with 11px alt text ("logo"), which is *worse* than the spec's own fallback: D-09 explicitly designed a dedicated, non-interactive placeholder string for *remote* images specifically so screen readers get a clear announcement instead of a native broken-image failure — but that exact native-broken-image failure (which D-09 was written to avoid) is what every *relative* image now produces.
  - Screenshot: `08-images-relative-broken-remote-placeholder.webp` — the tiny unstyled "logo" alt text directly above the correctly-rendered remote-image placeholder text makes the contrast between "intended fallback" and "actual failure" visible in one frame.
  - This is the core, headline interactive deliverable of Phase 16's image handling (D-09) and it does not work in a real running session, not just in this harness — the auth gate is unconditional for all `/api/*` traffic regardless of caller.
- Comment-add/comment-view state coverage for text content is otherwise solid: composer open/fill/submit, persisted "Open"/"Verified" badges, and "Saved locally" status text all function correctly and match `CommentComposer.vue` reuse with zero changes, confirmed by adding real comments on a paragraph, a blockquote, and a fenced code block during this audit (`06-composer-open-list-item.webp`, `05-block-kind-mislabel-evidence.webp`).
- Source-view range decoration (D-07/A-01 "full source range anchored and highlighted, not just line one") was independently verified correct for a 3-source-line fenced code block: `document.querySelectorAll('.monaco-anchor-line')` returned exactly 3 elements whose underlying view-line text was ` ```ts `, `const value: number = 1;`, and ` ``` ` respectively — the multi-line decoration itself works correctly (`07-source-range-highlight-multiline.webp`).
- Task-list checkboxes render `disabled` and reflect source `[ ]`/`[x]` correctly; no interactive affordance offered, matching D-11.

---

## Files Audited

- `src/web/components/RenderedMarkdownView.vue` (block building, markers, comment triggers, block-kind labeling)
- `src/web/components/DiffWorkspace.vue` (mode toggle, side-by-side mount, canvas host, anchor affordance)
- `src/web/components/ActiveFileToolbar.vue` (Source/Rendered toggle placement)
- `src/web/model/markdown-preview.ts` (not independently re-audited beyond rendered output — front-matter/task-list/image-override behavior verified via live DOM output)
- `src/web/styles.css` (`.diff-workspace__canvas`, `.diff-workspace__side-labels`, `.rendered-markdown` and descendant rules, lines ~1557-2050)
- `src/server/routes.ts` (`GET /api/files/:fileId/image`, line 348)
- `src/server/security.ts` (session bearer-token gate, lines 58-116)
- `16-UI-SPEC.md` (design contract baseline)
- Live artifacts: `tests/e2e/rendered-markdown-preview.spec.ts`, `tests/e2e/anchored-review.spec.ts`, `tests/helpers/git-fixture.ts` (reused launch/fixture pattern, not modified)

Screenshots (gitignored, local evidence only): `.planning/ui-reviews/16-rendered-markdown-preview/01-08-*.webp`

---

## Addendum: Gap-Closure Confirmation (2026-10-31)

All 3 BLOCKER findings above (image-route 401, side-by-side Base-pane collapse, block-kind mislabeling) were fixed in a dedicated gap-closure cycle — see `16-GAP-CLOSURE.md` (commits `69afe20`, `67d9de8`, `9c838f8`, docs `5998a68`) — and independently re-verified against the real codebase (not the fix's own claims) in `16-VERIFICATION.md`'s re-verification pass (commit `8640ead`), including a live `<img>` `naturalWidth` check, a real `getBoundingClientRect()`/`gridTemplateColumns` measurement on both rendered-mode panes, and an accessible-name assertion that trigger labels now read the real block kind. This UI review's screenshots/scores above are preserved as the original audit record; they are superseded by the gap-closure for release-readiness purposes. No fresh live re-screenshot pass was run after the fixes — the regression evidence is e2e/DOM-assertion based, not a second manual visual audit.
