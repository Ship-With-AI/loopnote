# Phase 16: Rendered Markdown Preview - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 7 (6 modified, 1 new)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/web/model/markdown-preview.ts` | utility (transform) | transform | itself (existing renderer, extend in place) | exact (self-extension) |
| `src/web/components/RenderedMarkdownView.vue` (new) | component | request-response + event-driven | `src/web/components/DiffWorkspace.vue` (host-swap target, gutter-action, conversation-card inline render) + `src/web/components/SummarySection.vue` (renderer consumer, mode toggle) | role-match (composite of two) |
| `src/web/components/DiffWorkspace.vue` | component (host) | event-driven | itself (existing `singlePaneSide`/`editorKind` branch-and-swap pattern) | exact (self-extension) |
| `src/web/components/ActiveFileToolbar.vue` | component | request-response (prop-driven) | itself (existing `Hide files`/`Show files` toggle button) | exact (self-extension) |
| `src/web/styles.css` | config (styles) | — | existing `.diff-workspace__gutter-action`, `.status-badge*`, `.conversation-card*`, `button[aria-pressed="true"]` blocks | role-match |
| `src/server/routes.ts` | route | request-response (binary file-I/O) | `GET /api/files/:fileId/content` (`routes.ts:311-337`) | role-match (JSON→binary swap) |
| `src/server/security.ts` | config | — | N/A — file not modified this phase | n/a |

## Pattern Assignments

### `src/web/model/markdown-preview.ts` (utility, transform)

**Analog:** itself — this phase extends the existing hardened renderer in place; the file's own current shape is the pattern to continue.

**Current full file** (`markdown-preview.ts:1-19`):
```typescript
import MarkdownIt from 'markdown-it';

const renderer = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

renderer.validateLink = (url) => /^(?:https?:|mailto:)/iu.test(url.trim());
renderer.renderer.rules.link_open = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, index, options);
};

export function renderMarkdownPreview(markdown: string): string {
  return markdown === '' ? '<p>No summary yet</p>' : renderer.render(markdown);
}
```

**Pattern to copy for the four new additions:**
- **Hardening convention:** every link/image-producing rule is overridden at the `renderer.renderer.rules.*` (render-time) or `md.inline.ruler`/`md.core.ruler` (parse-time) level, never via the `html: true` escape hatch. RESEARCH.md's critical finding: `validateLink` only runs through `link_open`/inline `image` parsing — a **render-time-only** `renderer.rules.image` override (as naively described in UI-SPEC) never fires for relative-path images because the inline `image` rule blanks `href` and fails the whole `![...](...)` parse before any `image` token exists. The new image rule MUST replace the *inline* rule via `md.inline.ruler.at('image', …)` the same way `validateLink` gates at parse time, not just add a `renderer.rules.image` render override.
- **Same `link_open` shape to mirror for the new `image` rule** — read token, mutate/attrSet, delegate to `self.renderToken(...)`:
  ```typescript
  renderer.renderer.rules.link_open = (tokens, index, options, environment, self) => {
    const token = tokens[index];
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    return self.renderToken(tokens, index, options);
  };
  ```
- **Export shape:** keep a single exported pure function (`renderMarkdownPreview`) per transform; `RenderedMarkdownView.vue` should import this same function (extended to also attach `data-source-start`/`data-source-end`), not a parallel renderer.
- **No new npm dependency** — front-matter, task-list and `data-start`/`data-end` attribute rules are added as local `md.block.ruler`/`md.core.ruler.push(...)` functions in this same file, matching the file's existing "one `MarkdownIt` instance, local rule overrides only" shape. Do not import `markdown-it-task-lists` / `markdown-it-front-matter` (CONTEXT.md/UI-SPEC/RESEARCH.md all reject third-party plugins for this module).

**Token `map` access pattern** (from RESEARCH.md verified token dump, `markdown-it@14.3.0`): top-level `*_open` tokens carry `.map` as `[startLine, endLine)` (0-indexed, end-exclusive) for the block itself — `list_item_open`/`tr_open` have their *own* narrower `.map`, not the parent `bullet_list_open`/`table_open`. Cell-level `th_open`/`td_open` tokens have `map: null`; read the enclosing `tr_open` token's map instead. The new "block `data-start`/`data-end` attribute" core rule should walk `state.tokens`, and for each top-level `*_open` token with a non-null `.map`, set `data-source-start`/`data-source-end` attrs on that token (0-indexed `map[0]`, exclusive `map[1]`) before render.

---

### `src/web/components/RenderedMarkdownView.vue` (component, request-response + event-driven)

**Primary analog:** `src/web/components/DiffWorkspace.vue` (gutter-action comment trigger, conversation-card inline render, host-swap branching)
**Secondary analog:** `src/web/components/SummarySection.vue` (renderer invocation + `v-html`)

**Imports pattern to follow** (mirrors `DiffWorkspace.vue:1-17`):
```typescript
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, render, watch } from 'vue';

import type { FileContentResponse } from '../../contracts/api.js';
import CommentComposer from './CommentComposer.vue';
import InlineNotice from './InlineNotice.vue';
import PathText from './ui/PathText.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import type { WorkspaceComment, WorkspaceComposer } from '../model/workspace-state.js';
```
Add: `import { renderMarkdownPreview } from '../model/markdown-preview.js';` (same relative-import style as `SummarySection.vue:4`).

**Renderer invocation pattern** (`SummarySection.vue:42`):
```typescript
const preview = computed(() => renderMarkdownPreview(props.modelValue));
```
`RenderedMarkdownView.vue` should follow the same `computed(() => renderMarkdownPreview(content))` shape, then post-process the returned HTML string into a `DocumentFragment`/DOM walk to wrap top-level blocks in `.rendered-block` elements (reading the `data-source-start`/`data-source-end` attributes the renderer now emits), rather than injecting the whole string via a single `v-html` the way `SummarySection.vue:226` does — D-05/D-04 require per-block `tabindex="0"` wrapper elements and per-block gutter buttons, which a single `v-html` blob cannot provide.

**Comment-trigger gutter button pattern to copy** (`DiffWorkspace.vue:375-386`, single-pane variant):
```vue
<button
  v-if="anchorAffordance"
  type="button"
  class="diff-workspace__gutter-action"
  :style="{ top: `${anchorAffordance.top}px` }"
  :data-anchor-side="anchorAffordance.side"
  :data-anchor-line="anchorAffordance.line"
  :aria-label="`Add comment to ${singlePaneSideWord} line ${anchorAffordance.line}`"
  :title="`Add comment to ${singlePaneSideWord} line ${anchorAffordance.line} · Option+Enter`"
  :disabled="mutationsLocked"
  @click="addComment(anchorAffordance)"
>+</button>
```
UI-SPEC's D-04 trigger copy (`Add comment · {side word} · {block description}`) replaces the `line ${N}` wording, but the button element shape (`type="button"`, `.diff-workspace__gutter-action` class reused verbatim per UI-SPEC's "zero new glyphs" directive, `:disabled="mutationsLocked"`, `aria-label` + matching `title`) is copied as-is — no new CSS class needed for the button itself, only for `.rendered-block` positioning context.

**Inline comment thread render pattern to copy** (`DiffWorkspace.vue:143-158`, the `conversation-card` block referenced by UI-SPEC's "D-07 reuses `conversation-card` pattern already used `DiffWorkspace.vue:145-157`"):
```typescript
render(h('section', { class: 'conversation-card inline-accepted-comment', 'data-comment-id': comment.id }, [
  h('header', { class: 'conversation-card__header' }, [
    h('h3', { tabindex: -1, class: 'conversation-card__identity' }, [
      h(PathText, { display: props.path }),
      h('span', ` · ${commentSideName(comment.side)} · line ${comment.line}`),
    ]),
    h('div', { class: 'conversation-card__badges' }, [
      h(ReviewStateBadge, { kind: comment.state, label: comment.state === 'open' ? 'Open' : 'Resolved' }),
      h(ReviewStateBadge, { kind: 'verified', label: 'Verified' }),
    ]),
  ]),
  h('div', { class: 'conversation-card__body' }, [h('p', comment.body)]),
  h('footer', { class: 'conversation-card__footer' }, [h('span', { class: 'comment-badge' }, 'Saved locally')]),
]), zone);
```
`RenderedMarkdownView.vue` renders this unchanged (D-07: "existing comments render inline below their block, always expanded, using the same thread component as code view") below the first overlapping `.rendered-block`, rather than inside a Monaco view-zone — swap the `zone` mount target for a plain DOM node appended after the block, same `h(...)`/`render(...)` Vue-in-non-SFC-context call shape.

**Composer mount pattern to copy** (`DiffWorkspace.vue:169-191`):
```typescript
render(h(CommentComposer, {
  ...props.composer,
  path: props.path,
  mutationsLocked: props.mutationsLocked,
  onCancel: () => emit('cancel'),
  onAdd: () => emit('add'),
  onConfirmDiscard: () => emit('confirmDiscard'),
  onConfirmMove: () => emit('confirmMove'),
  onKeepWriting: () => emit('keepWriting'),
  onUpdateText: (text: string) => emit('updateText', text),
}), zone);
```
UI-SPEC's "`CommentComposer.vue` reused with zero changes" directive means this exact prop/emit wiring is copied verbatim — same event names, same `h(CommentComposer, {...})` call — only the mount target (`zone`) changes from a Monaco view-zone element to a plain element inserted after the clicked `.rendered-block`.

**Props/emits shape to mirror** (`DiffWorkspace.vue:19-42`): `RenderedMarkdownView` should accept the same `comments`, `composer`, `mutationsLocked`, `content`, `path`, `singlePaneSide`-equivalent (`side`) props and emit the same `add`/`cancel`/`confirmDiscard`/`confirmMove`/`activate`/`keepWriting`/`ready`/`updateText` events, so `DiffWorkspace.vue`'s host-swap branch can pass through an identical listener object to either child.

---

### `src/web/components/DiffWorkspace.vue` (component, event-driven) — host-swap branch

**Analog:** itself — the existing `singlePaneSide !== undefined` / `editorKind` branch-and-recreate pattern is the template for the new `mode === 'rendered'` branch.

**Existing adapter-recreation-on-prop-change pattern to mirror** (`DiffWorkspace.vue:311-324`):
```typescript
watch(editorKind, () => {
  unmountZone();
  adapter?.dispose();
  adapter = undefined;
  void nextTick(() => {
    if (host.value === undefined) return;
    adapter = props.singlePaneSide !== undefined
      ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, props.singlePaneSide)
      : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState);
    syncCodeDensity();
    syncSideNames();
    void loadContent();
  });
});
```
The new `mode` prop (`'source' | 'rendered'`) is a sibling discriminator to `editorKind`: when `mode === 'rendered'`, skip Monaco adapter creation entirely and mount `RenderedMarkdownView` instead — same `watch(...)`-triggered teardown/rebuild shape (dispose old, `nextTick`, create new), not a conditional inside a single persistent component instance.

**Template branch pattern to mirror** (`DiffWorkspace.vue:358-391`, the `singlePaneSide !== undefined` vs. default branch): add a third top-level `<template>`/`v-if` tier for `mode === 'rendered'` at the same nesting level as the existing `v-if="singlePaneSide !== undefined"` / `v-else` pair, reusing `diff-workspace__viewport`/`diff-workspace__canvas` wrapper classes so layout/scroll chrome stays identical between Source and Rendered.

**Props addition pattern** (`DiffWorkspace.vue:19-31`, `withDefaults(defineProps<{...}>(), {...})`): add `mode?: 'source' | 'rendered'` alongside the existing `sourceKind` default-valued prop, same `withDefaults` block, defaulting to `'source'` to match CONTEXT.md's "Default view is source" decision.

---

### `src/web/components/ActiveFileToolbar.vue` (component, request-response/prop-driven)

**Analog:** itself — the existing `Hide files`/`Show files` toggle button (`ActiveFileToolbar.vue:65-68, 99-107`) is the closest existing single-button-pair-toggle pattern in this file; it is a single toggling button (copy changes, state via prop), while the new control is a *segmented pair* per UI-SPEC D-02 resolution — both buttons mirror this button's shape individually.

**Existing toggle button pattern to copy the shape of** (`ActiveFileToolbar.vue:99-107`):
```vue
<button
  ref="filesToggle"
  type="button"
  class="ui-button"
  :aria-label="filesToggleLabel"
  :aria-controls="filesHostVisible ? 'changed-files' : undefined"
  :aria-expanded="filesHostVisible ? true : undefined"
  @click="emit('toggleFiles')"
>{{ filesToggleCopy }}</button>
```
**Computed copy/label pattern to mirror** (`ActiveFileToolbar.vue:65-68`):
```typescript
const filesHostVisible = computed(() => !props.filesDrawer && !props.filesCollapsed);
const filesToggleCopy = computed(() => props.filesDrawer ? 'Files' : props.filesCollapsed ? 'Show files' : 'Hide files');
```
New Source/Rendered pair follows the same `type="button" class="ui-button"` shell but swaps `:aria-expanded`/`:aria-controls` for `:aria-pressed="mode === 'source'"` / `:aria-pressed="mode === 'rendered'"` (UI-SPEC's exact markup: `<button type="button" class="ui-button" :aria-pressed="mode==='source'|'rendered'">Source|Rendered</button>`), inserted into the same `review-toolbar__active-file` flex row immediately before the existing `filesToggle` button (`ActiveFileToolbar.vue:98`), gated by a new computed (`isMarkdownFile`, mirroring the existing `layoutLabel`/`counts` computed-gating style at lines 36-63) checking the file extension is `.md`/`.markdown` (D-12).

**Prop addition pattern**: add `mode: 'source' | 'rendered'` to the existing `defineProps<{...}>()` block (`ActiveFileToolbar.vue:9-14`, same `readonly` prop style) and a `setMode: [mode: 'source' | 'rendered']`-shaped new emit alongside the existing `toggleFiles: []` emit (`ActiveFileToolbar.vue:16-18`).

---

### `src/server/routes.ts` (route, request-response / binary file-I/O)

**Analog:** `GET /api/files/:fileId/content` (`routes.ts:311-337`) — same fileId-validate → capability-lookup → availability-gate → serve shape; the new route swaps the final "serve typed JSON" step for "serve raw bytes with a resolved `Content-Type`".

**Imports pattern already in file to extend, not replace** (`routes.ts:1-33`):
```typescript
import type { FastifyInstance } from 'fastify';

import {
  // ...existing schema imports...
  OpaqueFileIdSchema,
  // ...
} from '../contracts/api.js';
import { DurableAnchorV1Schema } from '../contracts/draft.js';
import { buildDurableAnchor } from '../domain/anchor.js';
import type { CapabilityRegistry } from './capabilities.js';
```

**Route skeleton to copy** (`routes.ts:288-337`, both the metadata and content routes share this shape):
```typescript
app.get<{
  Params: { fileId: string };
  Querystring: Record<string, never>;
}>(
  '/api/files/:fileId/content',
  async (request, reply) => {
    if (Object.keys(request.query).length !== 0) {
      return unavailable(reply, 400);
    }
    const fileId = OpaqueFileIdSchema.safeParse(request.params.fileId);
    if (!fileId.success) {
      return unavailable(reply, 404);
    }
    const metadata = await capabilities.lookup(fileId.data);
    if (metadata === undefined) {
      return unavailable(reply, 404);
    }
    if (metadata.availability.kind !== 'text') {
      return unavailable(reply, 409);
    }
    const content = await capabilities.readContent(fileId.data);
    if (content === undefined) {
      return unavailable(reply, 409);
    }
    return content;
  },
);
```
The new `GET /api/files/:fileId/image` route copies this exact validate/lookup/gate sequence (`OpaqueFileIdSchema.safeParse` → `unavailable(reply, 404)` on failure → `capabilities.lookup` → `unavailable(reply, 404)` on `undefined`), but:
- adds a required `path` querystring param (RESEARCH.md: `?path=<relative-src>`) validated the same `safeParse` → `unavailable(reply, 400)` way rather than the zero-query-params check the `/content` route uses;
- the final "serve" step has **no existing analog in this codebase** — no route currently sets `Content-Type`/sends a raw `Buffer` (grep across `src/server` found no `reply.type(`/`reply.header(`/binary-`send` usage). The planner must introduce this using Fastify's standard `reply.type(contentType).send(buffer)` idiom (not represented in the existing codebase, so RESEARCH.md's content-type table is the controlling reference, not a local analog).

**Error helper to reuse unchanged** (`routes.ts:50-52`):
```typescript
function unavailable(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, statusCode: number) {
  return reply.code(statusCode).send(REQUEST_UNAVAILABLE_ERROR);
}
```

**Schema registration pattern to mirror** (`routes.ts:40-44, 288-295`, the `FILE_PARAMS_SCHEMA` const + inline `schema: { params: ..., querystring: ... }` option object):
```typescript
const FILE_PARAMS_SCHEMA = {
  type: 'object',
  required: ['fileId'],
  properties: { /* ... */ },
};
```
Define an analogous querystring JSON-schema const for the new `path` param (or extend an existing pattern) and pass via the same `{ schema: { params: FILE_PARAMS_SCHEMA, querystring: ... } }` option object as the metadata route at `routes.ts:290-295`.

**Path-safety walk to reuse unchanged** (`src/git/exact-patch.ts:460-502`, per-segment `lstat` walk — Phase 15 precedent cited directly by both CONTEXT.md D-09 and RESEARCH.md):
```typescript
// src/git/exact-patch.ts:468-479
let current = Buffer.from(root, 'utf8');
const parts = path.bytes.toString('latin1').split('/');
for (const [index, part] of parts.entries()) {
  current = Buffer.concat([current, Buffer.from('/', 'ascii'), Buffer.from(part, 'latin1')]);
  const entry = await lstat(current);
  if (index < parts.length - 1 && entry.isSymbolicLink()) fail(); // no intermediate symlink
  if (index === parts.length - 1) {
    if (entry.isSymbolicLink()) { /* reject or resolve explicitly, never realpath-follow */ }
    if (entry.isFile()) {
      if (entry.size > MAX_GROUNDED_OBJECT_BYTES) fail();
      const bytes = await readFile(current);
      // ...
    }
  }
}
```
The new image route's worktree/standalone-session resolution path (per RESEARCH.md's two-session-shape split) must reuse this exact segment-by-segment `lstat`-before-descend discipline — never `fs.realpath`, matching the "Phase 15 D-04/FILE-04 precedent" CONTEXT.md D-09 cites by name. For committed-comparison sessions, the researcher flagged `src/git/objects.ts`'s exact blob-at-path-at-commit primitive as not fully traced — planner must resolve the correct exported function against `src/git/objects.ts`'s actual surface (Open Question #4 in RESEARCH.md/UI-SPEC, unresolved, left to planner).

---

### `src/web/styles.css` (config, token-only additions)

**Analog:** existing `.diff-workspace__gutter-action`, `.status-badge*`, `.conversation-card*` blocks (all already consumed by `DiffWorkspace.vue`).

**Chip/marker-tag pattern to copy** (`styles.css:383-422`):
```css
.dirty-badge,
.status-badge,
.availability-marker {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  /* ... */
}
.status-badge--modified {
  border-color: var(--status-modified-border);
  background: var(--status-modified-background);
  color: var(--status-modified-foreground);
}
.status-badge--added, .line-counts__added {
  border-color: var(--status-added-border);
  background: var(--status-added-background);
}
.status-badge--deleted, .line-counts__deleted {
  border-color: var(--status-deleted-border);
  background: var(--status-deleted-background);
}
```
UI-SPEC's marker chip spec (`16-UI-SPEC.md:136`) explicitly names this block (`styles.css:382-397`) as the chip pattern to reuse for `Added`/`Removed`/`Changed` tags, swapping only the modifier class suffix and `--status-{added|deleted|modified}-*` triplet per marker kind — `Removed` maps to the `deleted` triplet (reuses `status-badge--deleted`'s tokens), `Changed` to `modified`.

**Toggle button state rule already applies with zero changes** (`styles.css:537-541`):
```css
textarea:active:not(:disabled),
button[aria-pressed="true"] {
  border-color: var(--border-control);
  background: var(--surface-interactive-active);
  box-shadow: none;
}
```
No new CSS needed for the Source/Rendered toggle's pressed state — this global attribute-selector rule already styles any `button[aria-pressed="true"]` in the app (confirmed only prior usage is in `src/web/prototypes/Phase6DiffSemanticsPrototype.vue:395`, not yet in production markup).

**Gutter-action button to reuse unchanged** (`styles.css:1600-1648`, full block including hover/focus tooltip `::after` and `--base` right-offset variant) — `.rendered-block`'s comment-trigger button reuses this class verbatim per UI-SPEC's "zero new glyphs" directive; only new CSS is for `.rendered-block` positioning context (`position: relative` on the block wrapper so the absolutely-positioned `.diff-workspace__gutter-action` can anchor to it instead of to Monaco's line-relative `top` offset).

**Scroll-container precedent to copy for tables/code blocks** (`styles.css:1984-1987`, cited directly by UI-SPEC):
```css
.review-summary__preview { overflow-x: auto; overflow-wrap: anywhere; }
```
Apply the same `overflow-x: auto` idiom to the new table/fenced-code-block wrapper rules (UI-SPEC: "Tables and fenced code blocks get `overflow-x: auto` on own container... consistent existing `.review-summary__preview` precedent").

## Shared Patterns

### Hardened-renderer parse-time gating (validateLink precedent)
**Source:** `src/web/model/markdown-preview.ts:9`
**Apply to:** the new image inline-rule override
```typescript
renderer.validateLink = (url) => /^(?:https?:|mailto:)/iu.test(url.trim());
```
Any new content-admission check (relative-image routing, remote-image rejection) must gate at the same inline-parse layer this scheme check uses, not only at render time — this is the module's one load-bearing security invariant and the file's "do not touch" boundary (UI-SPEC File Ownership Map: "Existing `validateLink`/`link_open` override ... reuses unchanged").

### fileId validate → capability lookup → availability gate → serve
**Source:** `src/server/routes.ts:288-337` (both `/api/files/:fileId` and `/api/files/:fileId/content`)
**Apply to:** new `GET /api/files/:fileId/image` route
```typescript
const fileId = OpaqueFileIdSchema.safeParse(request.params.fileId);
if (!fileId.success) return unavailable(reply, 404);
const metadata = await capabilities.lookup(fileId.data);
if (metadata === undefined) return unavailable(reply, 404);
// availability/kind gate specific to the route, then serve
```

### Prop-driven mode/branch-and-rebuild
**Source:** `src/web/components/DiffWorkspace.vue:92, 311-324` (`editorKind` computed + `watch(editorKind, …)` teardown/rebuild)
**Apply to:** `DiffWorkspace.vue`'s new `mode` prop host-swap, and `RenderedMarkdownView`'s own internal re-render when `content`/`mode` changes
```typescript
const editorKind = computed(() => props.singlePaneSide ?? 'diff');
watch(editorKind, () => {
  // dispose/unmount old, nextTick, create new
});
```

### Never-color-only status chip
**Source:** `src/web/components/StatusBadge.vue:38-41`
**Apply to:** block marker tags (D-01/D-02)
```vue
<span class="status-badge" :class="`status-badge--${presentation.tone}`">
  <span aria-hidden="true">{{ presentation.text }}</span>
  <span class="visually-hidden">{{ presentation.label }}</span>
</span>
```
Phase 16's marker chip always carries visible text (`Added`/`Removed`/`Changed`), matching this component's "icon/letter + always-present text label" invariant rather than a color-only treatment.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| binary `Content-Type` response in `src/server/routes.ts` | route (serve step) | file-I/O | No existing route in the codebase sends raw bytes with a resolved MIME `Content-Type`; every existing route returns JSON via zod-schema-typed objects. Planner must use Fastify's standard `reply.type(contentType).send(buffer)` idiom directly, informed by RESEARCH.md's content-type table rather than a local precedent. |
| committed-comparison blob-at-path-at-commit lookup (`src/git/objects.ts`) | service | file-I/O | RESEARCH.md explicitly flags this as "not fully traced in session" — the exact exported primitive (tree-walk/`git cat-file`/`git ls-tree` equivalent) is an open question for the planner to resolve against `src/git/objects.ts`'s actual surface before implementing the image route's committed-session path. |
| block-aligned scroll-sync between two rendered panes (D-03) | component (event handler) | event-driven | No existing hand-rolled scroll-sync code exists in the codebase (Monaco's side-by-side scroll sync is native to the `monaco-editor` diff widget, not application code); UI-SPEC explicitly defers the exact matching heuristic to the planner/implementer with only the visual contract fixed. |

## Metadata

**Analog search scope:** `src/web/components/`, `src/web/model/`, `src/web/monaco/`, `src/server/`, `src/git/`, `src/domain/`, `src/web/styles.css`
**Files scanned:** `markdown-preview.ts`, `SummarySection.vue`, `DiffWorkspace.vue`, `ActiveFileToolbar.vue`, `StatusBadge.vue`, `routes.ts`, `exact-patch.ts`, `anchor.ts`, `diff-adapter.ts`, `line-mapping.ts`, `styles.css`, `api.ts` contracts
**Pattern extraction date:** 2026-10-31

---

## Addendum: A-01 Range-Aware Durable Anchor — Files Not Covered Above (2026-10-31)

This File Classification table predates CONTEXT.md amendment A-01 and does not cover the files plans 16-07/16-08 touch for it. No new analog search was run for these — each file's own plan `<read_first>` cites concrete existing-code line ranges directly, which is sufficient for execution — this addendum exists only so the table isn't silently stale:

| File | Role | Plan | Analog |
|------|------|------|--------|
| `src/domain/anchor.ts` | domain (pure functions) | 16-07 | itself — additive optional-field extension in place, same pattern as `markdown-preview.ts`'s self-extension above |
| `src/contracts/draft.ts`, `src/contracts/api.ts` | contract (zod schema) | 16-07 | itself — additive `.optional()` field + `.superRefine`, same `strictObject` conventions already used throughout both files |
| `src/server/routes.ts`, `src/server/capabilities.ts` | route / service (mechanical call-site update) | 16-07 | itself — existing `buildDurableAnchor(...)`/`verifyAnchor` call sites gain one additional named argument, no structural change |
| `src/web/model/workspace-state.ts`, `src/web/model/workspace-command.ts` | state (client reducer/command types) | 16-08 | itself — existing `activate-line`/`persist-comment`/`reveal-line` variants gain one additional optional field, same discriminated-union-literal style already in both files |
| `src/web/monaco/diff-adapter.ts` | adapter (Monaco wrapper) | 16-04 (`getLineChanges`), 16-08 (`anchorDecoration` range) | itself — existing `Anchor`/`anchorDecoration` extended in place with one additional optional parameter |
