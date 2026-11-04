---
phase: 16-rendered-markdown-preview
verified: 2026-10-31T16:30:00Z
status: passed
score: 34/34 must-haves verified
behavior_unverified: 0
overrides_applied: 0
is_re_verification: true
re_verification:
  trigger: "16-UI-REVIEW.md's live-browser screenshot audit found 3 BLOCKER bugs this phase's own
    initial goal-backward verification (committed 7f82902, status: passed, score: 31/31) missed —
    the earlier verification had no gaps: section because it never caught these; the UI review is
    the source of the gap list for this re-verification, closed by 16-GAP-CLOSURE.md."
  previous_status: passed (score 31/31, but incomplete — missed 3 live-browser-only blockers)
  previous_score: 31/31
  previous_verified_at: 2026-10-31T13:44:24Z
  gaps_closed:
    - "Relative images render via a real <img src> tag without a 401 (GAP-01)"
    - "Side-by-side Rendered mode shows both Base and Head panes with nonzero width (GAP-02)"
    - "Comment-trigger labels name the real block type, not always 'paragraph' (GAP-03)"
  gaps_remaining: []
  regressions: []
---

# Phase 16: Rendered Markdown Preview Verification Report

**Phase Goal:** Users can toggle any Markdown file between source and rendered view in both single-pane and side-by-side layouts, comment directly on rendered blocks, and trust the renderer never introduces XSS or link-following risk.
**Verified:** 2026-10-31T16:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (`16-GAP-CLOSURE.md`, commits `69afe20`, `67d9de8`, `9c838f8`, docs `5998a68`), itself triggered by `16-UI-REVIEW.md`'s live-browser audit.

## Why the Original "Passed, 31/31" Verification Was Wrong

The initial goal-backward verification (committed `7f82902`) checked every truth via source-code
reads, unit/API tests, and 5 Playwright e2e tests run against a real packaged production build —
a thorough sweep by grep/static/test-runner standards. It scored 31/31 and returned `passed`.

It still missed 3 real BLOCKER bugs because its e2e coverage never exercised the exact failure
mode a human driving a real browser hits:

1. **Images:** the e2e test proved the image *route* worked by issuing a manually-headered
   `fetch()` (bearer token in an `Authorization` header). A real `<img src="...">` tag — the only
   way the feature is actually consumed — cannot attach that header, so every relative image
   404/401'd in a live browser while the test suite stayed green.
2. **Side-by-side grid:** no e2e assertion measured the actual rendered `boundingBox()` of the
   Base/Head panes or `grid-template-columns`; the DOM elements existed and had non-empty markup,
   which is all the prior checks looked for.
3. **Block-kind labels:** `blockKindWord()` was unit-tested in isolation with the correct element
   types passed directly — never through the real `buildBlocks()` wrapping path that always calls
   it on the generic `<div class="rendered-block">` wrapper, where the tag-based branches are dead
   code.

This is the exact class of gap goal-backward verification is supposed to catch and didn't: task
completion (tests pass) was accepted as a proxy for goal achievement (the feature really works) in
a place where the proxy and the goal silently diverged. `16-UI-REVIEW.md`'s live Chromium screenshot
audit (a different, slower verification method) caught all 3. This report re-verifies the fixes
directly in the current codebase — not from `16-GAP-CLOSURE.md`'s narrative — and re-runs the full
regression set the original verification covered to confirm GAP-01's `security.ts` auth-gate
widening didn't silently break anything else.

## Goal Achievement

### The 3 Previously-Missed Truths — Re-verified With Live Evidence

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 32 | Relative images render through a real `<img>` tag without a 401 — not just a manually-headered fetch | ✓ VERIFIED | **Code (read directly):** `security.ts:65` adds `IMAGE_ROUTE_PATTERN = /^\/api\/files\/[^/?]+\/image(?:\?.*)?$/u` matching *only* the image content route; `security.ts:84-91` `hasImageRouteQueryToken()` reads `?token=` from the query string via `timingSafeEqual` (`tokenMatches`, shared with the header path); `security.ts:131-132` `onRequest` hook: `authorized = hasBearerToken(...) \|\| (IMAGE_ROUTE_PATTERN.test(request.url) && hasImageRouteQueryToken(...))` — the query-token path is gated behind the regex, so no other `/api/*` route accepts a bare query token. `rendered-markdown-blocks.ts:41-42` `buildImageRouteUrl(fileId, side, path, token)` now appends `&token=${encodeURIComponent(token)}`. `RenderedMarkdownView.vue:212` calls it with the new `sessionToken` prop (`:28`); prop threads `App.vue:80,1144,1346` (`sessionToken.value = sessionClient.sessionToken`) → `DiffWorkspace.vue:27,433,485,507` (`:session-token="sessionToken"`, all 3 mount sites: single-pane, side-by-side base, side-by-side head) → `RenderedMarkdownView.vue`. **Test (ran in this session):** `tests/e2e/rendered-markdown-security.spec.ts:252-253` — `expect(imageSrc).toMatch(/[?&]token=[^&]+/)` then `await expect.poll(() => logoImage.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)` against the **literal rendered `<img>` DOM element**, not a synthetic fetch. `npx playwright test tests/e2e/rendered-markdown-security.spec.ts` — 3/3 PASS, this session. |
| 33 | Side-by-side Rendered mode shows both Base and Head panes with nonzero width | ✓ VERIFIED | **Code (read directly):** `DiffWorkspace.vue:449` side-by-side canvas gains `:class="{ 'diff-workspace__canvas--rendered': mode === 'rendered' }"`; `styles.css:1575-1578` `.diff-workspace__canvas--rendered { grid-template-columns: 1fr 1fr; }` plus `:1579-1581` makes `.diff-workspace__side-labels` span both columns in that mode; `styles.css:2004-2011` `.rendered-markdown` carries `min-width: 0; min-height: 0;` so each pane shrinks to its grid track instead of forcing the implicit row-stacking that previously collapsed Base to 0px. **Test (ran in this session):** `tests/e2e/rendered-markdown-preview.spec.ts:187-199` measures real `boundingBox()` for both `.rendered-markdown` panes (`expect(baseBox?.width ?? 0).toBeGreaterThan(0)`, same for height, and for the Head pane) and asserts `getComputedStyle(.diff-workspace__canvas).gridTemplateColumns` splits into exactly 2 tracks. `npx playwright test tests/e2e/rendered-markdown-preview.spec.ts` — 2/2 PASS, this session. |
| 34 | Comment-trigger labels name the real block type (heading/list item/etc.), not always "paragraph" | ✓ VERIFIED | **Code (read directly):** `RenderedMarkdownView.vue:44` `RenderedBlockEntry` gains `contentElement: HTMLElement` holding the original pre-wrap element; `:230` `buildBlocks()` assigns it before reparenting into the generic wrapper; `:76` (gutter button `aria-label`) and `:166` (accepted-comment identity line) both now call `blockKindWord(entry.contentElement)` / `blockKindWord(block.contentElement)` instead of the wrapper `<div>`. **Test (ran in this session):** `tests/e2e/rendered-markdown-preview.spec.ts:201-207` hovers the real `# Preview Heading` block and asserts `toHaveAccessibleName(/heading/)` **and** `not.toHaveAccessibleName(/paragraph/)`. `npx playwright test tests/e2e/rendered-markdown-preview.spec.ts` — 2/2 PASS, this session. |

**Score:** 3/3 previously-missed truths now verified with live evidence (0 present-but-behavior-unverified).

### Observable Truths — Roadmap Success Criteria (non-negotiable contract) — Regression-confirmed

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User toggles any Markdown file between source view and rendered view, in both single-pane and side-by-side layouts | ✓ VERIFIED (regression) | `ActiveFileToolbar.vue:105-118` gates Source/Rendered buttons on `.md`/`.markdown`; `App.vue:91-92,320-324` per-file mode map; `DiffWorkspace.vue:422-426,471-494` mounts `RenderedMarkdownView` alongside Monaco in both layouts, now additionally with the `--rendered` grid-column fix (truth #33). `rendered-markdown-preview.spec.ts` full toggle round-trip — ran this session, PASS. |
| 2 | User adds a comment on a rendered block (heading, paragraph, list item, code block, table) and sees it stored anchored to the block's source line range, appearing on those lines in source view | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:70-89` `+` button emits `activate(side, entry.start+1, entry.end)`; `workspace-state.ts` threads `endLine` through `activate-line`→`persist-comment`; `contracts/api.ts` + `routes.ts:413-428` build the anchor with `endLine`; `anchor.ts buildDurableAnchor` stores the true `[line,endLine]` range; `diff-adapter.ts:592-597,981-986` renders `isWholeLine` decorations over the full range. `rendered-markdown-preview.spec.ts` comment-flow + A-01 range-highlight test — ran this session, PASS. |
| 3 | User sees existing comments marked on the rendered blocks they anchor to | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:145-175` `renderAnnotations()` filters by `fileId`+`side`+`status==='verified'`, mounts the same `conversation-card` thread markup used in code view. Exercised live by the comment-flow e2e test. |
| 4 | User confirms rendered Markdown never executes scripts, renders raw HTML, or follows non-http(s)/mailto links, under the existing production CSP | ✓ VERIFIED (regression) | `markdown-preview.ts`: `html:false`, `validateLink` restricted to `https?:`/`mailto:`, `validateImageHref` hardened separately; `security.ts:17,22` `script-src 'self'`, `img-src 'self'` unchanged by GAP-01 (the widened auth gate only affects *authorization*, not CSP). 3 e2e tests under the real packaged CLI + production CSP in `rendered-markdown-security.spec.ts` — ran this session, 5/5 PASS (3 security + 2 preview). |

**Score:** 4/4 roadmap truths verified (regression-confirmed, 0 present-but-behavior-unverified)

### Additional Must-Haves — Plan Frontmatter Truths + CONTEXT.md Decisions D-01..D-12 / A-01 — Regression-confirmed

Quick regression check per the role's re-verification optimization: each was VERIFIED in the
original pass via direct source reads and specific test files; this pass confirms none of those
test files regressed by re-running them (via the full `test:unit`/`test:api` suites plus the named
e2e specs) and spot-checking the cited source lines are unchanged or, where touched by gap closure,
still correct.

| # | Must-have | Source | Status | Evidence |
|---|-----------|--------|--------|----------|
| 5 | `renderMarkdownPreview` keeps its single-argument signature; `SummarySection.vue` call site unchanged | 16-01 | ✓ VERIFIED (regression) | `markdown-preview.ts:167-169` unchanged signature; `SummarySection.vue:42` unchanged call. `npm run typecheck:web` — ran this session, 0 errors. |
| 6 | Every renderable block carries 1-indexed `data-source-start`/`data-source-end` matching real source lines | 16-01, D-05 | ✓ VERIFIED (regression) | `markdown-preview.ts:22-57` `stampSourceMap`. `markdown-preview.test.ts` — ran this session as part of full unit suite, PASS. |
| 7 | Raw `<script>`/`onerror`, dangerous-scheme links/images never produce live tags; relative images survive; http(s) images become inert placeholders | 16-01, D-09, D-10 | ✓ VERIFIED (regression) | `markdown-preview.ts:14-20,131-165`; `markdown-preview.test.ts` — ran, PASS, unchanged by gap closure. |
| 8 | GFM tables, task-list checkboxes, YAML front matter render with zero new npm dependencies | 16-01, D-11 | ✓ VERIFIED (regression) | `package.json` still lists only pre-existing `markdown-it@14.3.0`; no new deps added by gap closure (`git diff` stat shows no `package.json` change in the gap-closure commits). |
| 9 | Relative image resolves to correct bytes per session type/side; path never escapes repo/symlink/non-allow-listed extension | 16-02, D-09 | ✓ VERIFIED (regression) | `image-content.ts:30-82` traversal/symlink/extension guards untouched by gap closure (GAP-01 only touched `security.ts`'s auth gate and `rendered-markdown-blocks.ts`'s URL builder, not the byte-serving path). `tests/api/image-route.test.ts` — ran this session as part of full API suite, PASS. |
| 10 | Image route never widens the CSP (same-origin, `img-src 'self'` already covers it) | 16-02 | ✓ VERIFIED (regression) | `security.ts:22` `img-src 'self'` unchanged; GAP-01's fix is scoped to the auth-gate `onRequest` hook, not CSP headers. |
| 11 | User sees rendered blocks (heading/paragraph/list-item/table-row/fence/blockquote) instead of raw source on mount | 16-03 | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:198-239` `buildBlocks()`. e2e PASS this session. |
| 12 | Hover/focus `+` button emits `activate(side,line,endLine)` carrying the block's full range (A-01) on the same channel as Monaco | 16-03, D-04 | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:70-89,96-105`; same `activate` event signature used by `diff-adapter.ts`'s `activateAnchor`. |
| 13 | Existing comments render inline below the first overlapping block, always expanded, same thread markup as code view | 16-03, D-07 | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:145-175` — no collapse state. |
| 14 | Blocks overlapping a changed line carry a left-rule + text tag (Added/Removed/Changed), never color alone | 16-03, D-01, D-02 | ✓ VERIFIED (regression) | `rendered-markdown-blocks.ts:48-76` `classifyBlockChange`; `RenderedMarkdownView.vue:120-135` `applyMarkers()` adds both CSS class and `status-badge` chip with literal text. |
| 15 | Relative images render through the same-origin route; http(s) images never produce a live `<img>` | 16-03, D-09 | ✓ VERIFIED (regression, strengthened) | `RenderedMarkdownView.vue:212` rewrites every `<img src>` via `buildImageRouteUrl` — now additionally proven to actually *load* via GAP-01's fix (truth #32) rather than just rewriting the `src` attribute. |
| 16 | Source/Rendered toggle visible only when the file is `.md`/`.markdown` | 16-04, D-12 | ✓ VERIFIED (regression) | `ActiveFileToolbar.vue:66-69,105` `isMarkdownFile` gate, unchanged. |
| 17 | Clicking Rendered swaps the Monaco host for `RenderedMarkdownView` in both layouts without losing comment/composer state | 16-04 | ✓ VERIFIED (regression) | `DiffWorkspace.vue:422,471-494`. |
| 18 | Clicking Source swaps back to the exact same Monaco content/scroll/selection | 16-04 | ✓ VERIFIED (regression) | Monaco instance never unmounted (`v-show`, not `v-if`). e2e: `.monaco-diff-editor` count stays 1 across the round trip, ran this session. |
| 19 | Toggle state conveyed by text + `aria-pressed`, never color alone; defaults to Source per file | 16-04, D-02/discretion | ✓ VERIFIED (regression) | `ActiveFileToolbar.vue:105-118`; `App.vue:92` `?? 'source'` default. e2e asserts `aria-pressed` toggling, ran this session. |
| 20 | Scrolling one rendered pane in side-by-side moves its counterpart to the nearest corresponding block | 16-05, D-03 | ✓ VERIFIED (regression) | `RenderedMarkdownView.vue:241-270` `handleScroll`/`scrollToRange`; `DiffWorkspace.vue:491,512` cross-wires. `rendered-markdown-blocks.test.ts` — ran this session, PASS. |
| 21 | Scroll sync never jitters/ping-pongs | 16-05 | ✓ VERIFIED (behavioral, regression) | `shouldEmitScrollSync` feedback-loop guard, unit-tested true/false — ran this session as part of full unit suite, PASS. |
| 22 | Real browser, packaged app, real CSP proves the toggle round-trip in both layouts | 16-06 | ✓ VERIFIED (regression, strengthened) | `rendered-markdown-preview.spec.ts` — ran against a freshly-built `npm pack` production artifact this session, PASS; now additionally asserts pane width/height and grid column count (truth #33). |
| 23 | Real browser proves the full rendered-block comment flow incl. A-01 range highlight | 16-06 | ✓ VERIFIED (regression) | `rendered-markdown-preview.spec.ts` — ran this session, PASS. |
| 24 | Real browser proves script/dangerous-link/image inertness under real CSP; image route never serves off-origin/outside-repo | 16-06 | ✓ VERIFIED (regression, strengthened) | `rendered-markdown-security.spec.ts` — ran this session, 3/3 PASS, including live `naturalWidth` proof the real `<img>` tag loads (truth #32), not just that the route rejects path traversal. |
| 25 | Single-line anchor (no `endLine`) produces byte-for-byte identical `contextHash`/`selectedText`/`context`/`uniqueKey` to pre-A-01 | 16-07, A-01 | ✓ VERIFIED (regression) | `anchor.ts:84-116`. `anchor.test.ts` golden-regression case — ran this session as part of full unit suite, PASS. |
| 26 | Range anchor stores the true `[line,endLine]`, `selectedText` spans the range, `context.after` computed from `endLine` | 16-07, A-01 | ✓ VERIFIED (regression) | `anchor.ts` unchanged by gap closure; `anchor.test.ts` — ran, PASS. |
| 27 | Pre-phase-16 draft/export fixture with no `endLine` key still parses and verifies exact-match | 16-07, A-01 | ✓ VERIFIED (regression) | `draft.ts:35,54-55` additive optional field; `draft-reconciliation.test.ts`, `anchor.test.ts` back-compat cases — ran this session, PASS. |
| 28 | Editing a line inside `(line,endLine)` flips `verifyAnchor` to stale; never relocates | 16-07, A-01 | ✓ VERIFIED (regression) | `anchor.test.ts` interior-drift cases; `tests/api/anchor.test.ts` — ran this session as part of full API suite, PASS. |
| 29 | Malformed `endLine < line` rejected with 400 before `buildDurableAnchor` runs | 16-07 | ✓ VERIFIED (regression) | `contracts/api.ts:35,39-40` `superRefine`; `routes.ts` `safeParse` gate precedes anchor-building — unchanged by GAP-01's addition of the unrelated `token` field at the same file's image-route querystring schema. `tests/api/anchor.test.ts` — ran, PASS. |
| 30 | All 4 `verifyAnchor` closures (committed/pinned, exact-patch, uncommitted, standalone) pass `endLine` into `buildDurableAnchor` | 16-07 | ✓ VERIFIED (regression) | `capabilities.ts` lines 444, 763, 1033, 1294 — all 4 call sites confirmed by direct read, unchanged. |
| 31 | Comment from a rendered block, reopened in Source view, highlights every line of its stored range, not just the first | 16-08, A-01 | ✓ VERIFIED (behavioral, regression) | `diff-adapter.ts:592-597,981-986` `isWholeLine:true` over the full range. `monaco-diff-adapter.test.ts` — ran this session as part of full unit suite, PASS. e2e confirms `.monaco-anchor-line` count 2 live, ran this session. |

**Score:** 27/27 additional must-haves regression-confirmed (0 present-but-behavior-unverified)

**Combined score: 34/34 must-haves verified** (31 original, regression-confirmed + 3 previously-missed, now closed with live evidence).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/web/model/markdown-preview.ts` | Hardened renderer, source-map stamping | ✓ VERIFIED | Unchanged by gap closure. |
| `src/server/image-content.ts` | Path-safety + extension allow-list image readers | ✓ VERIFIED | Unchanged by gap closure (GAP-01 only touched auth, not byte-serving). |
| `src/server/capabilities.ts` | `readRelativeImage` on all 4 factories | ✓ VERIFIED | Unchanged. |
| `src/server/routes.ts` | `GET /api/files/:fileId/image` route | ✓ VERIFIED | Gap closure adds `token: z.string().optional()` to the querystring schema (`:36-38`) — additive, schema-validated, no other field touched. |
| `src/server/security.ts` | Session auth gate | ✓ VERIFIED (new, GAP-01) | 139 lines; `IMAGE_ROUTE_PATTERN` (`:65`), `tokenMatches` (`:67-73`, shared timing-safe comparison), `hasBearerToken` (`:75-82`, unchanged behavior for all non-image routes), `hasImageRouteQueryToken` (`:84-91`), `onRequest` hook (`:112-139`) only widens auth for URLs matching the image-route regex. |
| `src/web/model/rendered-markdown-blocks.ts` | `buildImageRouteUrl` + block helpers | ✓ VERIFIED | `buildImageRouteUrl(fileId, side, path, token)` (`:41-42`) now requires and appends `&token=`; all other exports (`extractSourceBlocks`, `classifyBlockChange`, `findTopmostVisibleBlock`, `findNearestBlock`, `shouldEmitScrollSync`) unchanged. |
| `src/web/components/RenderedMarkdownView.vue` | Block-wrapped rendered view | ✓ VERIFIED (updated, GAP-01/03) | `sessionToken: string` prop (`:28`); `RenderedBlockEntry.contentElement` field (`:44`) and its 2 `blockKindWord()` call sites (`:76,166`); `buildImageRouteUrl(..., props.sessionToken)` call (`:212`). |
| `src/web/components/DiffWorkspace.vue` | `mode` prop, host-swap branch, canvas grid | ✓ VERIFIED (updated, GAP-01/02) | `sessionToken: string` prop (`:27`) threaded to all 3 `RenderedMarkdownView` mounts (`:433,485,507`); `:class="{ 'diff-workspace__canvas--rendered': mode === 'rendered' }"` on the side-by-side canvas (`:449`). |
| `src/web/App.vue` | Session token source | ✓ VERIFIED (new, GAP-01) | `sessionToken` ref (`:80`), populated from `sessionClient.sessionToken` on mount (`:1144`), passed to `DiffWorkspace` (`:1346`). |
| `src/web/api/client.ts` | `SessionClient.sessionToken` exposed | ✓ VERIFIED (new, GAP-01) | Interface gains `readonly sessionToken: string` (`:85`); implementation exposes the already-validated `token` local (`:181`) — no change to token validation/fetch logic. |
| `src/web/styles.css` | `.diff-workspace__canvas--rendered`, `.rendered-markdown` shrink fix | ✓ VERIFIED (new, GAP-02) | `.diff-workspace__canvas--rendered { grid-template-columns: 1fr 1fr; }` (`:1575-1578`) + side-labels span fix (`:1579-1581`); `.rendered-markdown` gains `min-width: 0; min-height: 0;` (`:2004-2011`) so grid children shrink instead of forcing row-stacking. |
| `tests/e2e/rendered-markdown-preview.spec.ts` | Toggle + comment-flow e2e, now with GAP-02/03 regressions | ✓ VERIFIED | 2 tests, grew by 24 lines in gap closure to add pane-width/grid-column and block-kind-label assertions — ran this session, PASS. |
| `tests/e2e/rendered-markdown-security.spec.ts` | Negative security e2e, now with GAP-01 regression | ✓ VERIFIED | 3 tests, grew by 8 lines to assert `?token=` in `src` and real `naturalWidth > 0` — ran this session, PASS. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `App.vue` | `DiffWorkspace.vue` | `:session-token="sessionToken"` | ✓ WIRED | `App.vue:1346` |
| `DiffWorkspace.vue` | `RenderedMarkdownView.vue` (×3 mounts) | `:session-token="sessionToken"` | ✓ WIRED | `DiffWorkspace.vue:433,485,507` — single-pane, side-by-side base, side-by-side head |
| `RenderedMarkdownView.vue` | `rendered-markdown-blocks.ts` | `buildImageRouteUrl(fileId, side, src, props.sessionToken)` | ✓ WIRED | `RenderedMarkdownView.vue:212` |
| `routes.ts` image route | `security.ts` | `IMAGE_ROUTE_PATTERN` matches only `GET /api/files/:fileId/image`, scoping the query-token acceptance | ✓ WIRED (narrowly) | `security.ts:65,131-132`; confirmed no other `/api/*` route can authenticate via query token — regex is anchored and route-specific. `test:api` full suite (217 tests, covering other `/api/*` auth paths) — ran this session, PASS, 0 regressions. |
| `RenderedMarkdownView.vue buildBlocks()` | `blockKindWord()` | `entry.contentElement` (real pre-wrap element) instead of `entry.element` (generic wrapper) | ✓ WIRED | `RenderedMarkdownView.vue:76,166,230` |
| `DiffWorkspace.vue` side-by-side canvas | `styles.css` | `.diff-workspace__canvas--rendered` class toggled by `mode === 'rendered'` | ✓ WIRED | `DiffWorkspace.vue:449` ↔ `styles.css:1575` |

### Behavioral Spot-Checks (this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Web type safety | `npm run typecheck:web` | 0 errors | ✓ PASS |
| Node/server type safety | `npx tsc --noEmit --project tsconfig.json` | 0 errors | ✓ PASS |
| Node/server build | `npm run build:node` | clean | ✓ PASS |
| Full unit suite (regression, run once) | `npm run test:unit` | 32 files, 311 tests passed | ✓ PASS |
| Full API suite (regression, run once) | `npm run test:api` | 23 files, 217 tests passed — confirms other `/api/*` auth paths, draft, anchor, image-route coverage all unaffected by `security.ts`'s widened gate | ✓ PASS |
| Phase-16 unit tests (targeted) | `npx vitest run tests/unit/rendered-markdown-blocks.test.ts tests/unit/markdown-preview.test.ts tests/unit/git-fixture-markdown-preview.test.ts` | 3 files, 34 tests passed | ✓ PASS |
| Phase-16 e2e (toggle + comment flow + all 3 gap regressions) against real packaged production build | `npx playwright test tests/e2e/rendered-markdown-preview.spec.ts tests/e2e/rendered-markdown-security.spec.ts` | 5/5 passed | ✓ PASS |
| Regression e2e set (other Monaco/comment flows under production CSP) | `npx playwright test tests/e2e/anchored-review.spec.ts tests/e2e/complete-review-draft.spec.ts tests/e2e/pinned-session.spec.ts tests/e2e/responsive-session.spec.ts tests/e2e/uncommitted-review.spec.ts tests/e2e/standalone-review.spec.ts` | 38/38 passed | ✓ PASS |
| Integration spec (dev-server, mocked middlewares) | `npx playwright test tests/integration/anchored-workspace.spec.ts` | 12/12 passed on 2 of 3 runs; see Flake Investigation below | ✓ PASS (flake ruled out) |

### Flake Investigation — `anchored-workspace.spec.ts` "diff navigation and session state"

One run of the full 12-test integration file produced a single failure in this test (`Pinned
session unavailable` error page instead of the expected diff heading). This is NOT a regression:

- Re-running the same test standalone (`-g "diff navigation and session state"`) on current HEAD: **passed**.
- Re-running the full 12-test file a second time on current HEAD: **all 12 passed**, including this test.
- Checked out the pre-gap-closure commit (`6f08fd5`) in a disposable `git worktree`, installed deps,
  and ran the identical test standalone: **passed**.

This test's Vite dev server never passes through `security.ts` at all (it mocks `/api/session`,
`/api/draft`, `/api/files` directly via Vite middleware in `beforeAll`), so GAP-01's auth-gate change
cannot be its cause. The one-off failure is consistent with ordinary first-run flakiness (cold
Vite dependency pre-bundling racing the test's 5s timeout when run first in a batch), not a
code regression. No fix applied; none needed.

### Probe Execution

No probes declared in any `16-*-PLAN.md`/SUMMARY.md, no conventional `scripts/*/tests/probe-*.sh` apply to this phase. Step 7c: SKIPPED (no probes found).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| MDV-01 | 16-03, 16-04, 16-05, 16-06, 16-08 | Toggle source/rendered, layouts | ✓ SATISFIED | Truths #1, #16-19, #22, #31, #33 |
| MDV-02 | 16-01, 16-03, 16-06, 16-07 | Comment on rendered block, anchored source range | ✓ SATISFIED | Truths #2, #6, #12, #23, #25-30, #34 |
| MDV-03 | 16-03, 16-06 | Existing comments marked on rendered blocks | ✓ SATISFIED | Truths #3, #13 |
| MDV-04 | 16-01, 16-02, 16-03, 16-06 | No script execution/raw HTML/non-http(s) links under production CSP; images actually load | ✓ SATISFIED | Truths #4, #7, #9-10, #15, #24, #32 |

No orphaned requirements — all 4 MDV-01..04 entries in REQUIREMENTS.md claimed by at least one of the 8 phase plans.

### Anti-Patterns Found

None. Scanned every gap-closure-touched file (`security.ts`, `routes.ts`, `App.vue`, `client.ts`, `DiffWorkspace.vue`, `RenderedMarkdownView.vue`, `rendered-markdown-blocks.ts`, `styles.css`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero hits. No new debt markers introduced by the gap-closure cycle.

### Human Verification Required

None. All 3 previously-missed truths are now backed by live-DOM Playwright assertions (real `<img>` `naturalWidth`, real `boundingBox()`/`gridTemplateColumns`, real `toHaveAccessibleName`) against a freshly-built production artifact, run in this session — the same standard `16-UI-REVIEW.md` used to find them, closing the loop between "automated checks pass" and "a human driving a real browser sees it work."

### Gaps Summary

No gaps remain. All 3 UI-review-discovered blockers (relative-image 401 under `<img>`, side-by-side
Base pane collapsing to 0px, comment-trigger labels always reading "paragraph") are fixed in the
current codebase, verified directly against source (not `16-GAP-CLOSURE.md`'s narrative) plus live
Playwright assertions that exercise the exact failure mode the UI review found — ran in this
session, all passing. The full regression sweep (typecheck ×2, `build:node`, 311-test unit suite,
217-test API suite, 5 phase-16 e2e tests, 38 cross-phase e2e tests, 12 integration tests) confirms
GAP-01's `security.ts` auth-gate widening is correctly scoped to only the image route and introduced
no regressions elsewhere, including other `/api/*` auth paths, the Monaco code-view comment flow,
and every other e2e spec exercised.

---

_Verified: 2026-10-31T16:30:00Z_
_Verifier: gsd-verifier (re-verification)_
