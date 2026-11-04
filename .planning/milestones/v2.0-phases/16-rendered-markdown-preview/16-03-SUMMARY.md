---
phase: 16-rendered-markdown-preview
plan: 03
subsystem: ui
tags: [vue, markdown, monaco, commenting, accessibility]

# Dependency graph
requires:
  - phase: 16-01
    provides: "renderMarkdownPreview extended with data-source-start/data-source-end block source-map attributes (MDV-02/D-05)"
  - phase: 16-02
    provides: "GET /api/files/:fileId/image?path=&side= same-origin image content route"
provides:
  - "RenderedMarkdownView.vue: block-wrapped rendered Markdown view with D-01/D-02/D-04/D-05/D-06/D-07/D-08/D-09/D-10/D-11 implemented, same props/emits shape as DiffWorkspace.vue's Monaco host"
  - "extractSourceBlocks(html): SourceBlockRange[] — regex-based data-source-start/data-source-end block extraction, no DOM parsing required"
  - "buildImageRouteUrl(fileId, side, path): string — same-origin image route URL builder"
  - "classifyBlockChange(blockStart, blockEnd, side, changes): 'added'|'removed'|'changed'|undefined — pure D-01/D-02 classification reusing diff-semantics.ts's side-to-field convention"
affects: [16-04, 16-05, 16-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw DOM manipulation (DOMParser-equivalent detached container + element.replaceWith/appendChild) to wrap already-hardened renderMarkdownPreview HTML into per-block tabindex=\"0\" wrapper divs, instead of a single v-html blob — zip extractSourceBlocks' ordered range list against container.querySelectorAll('[data-source-start]') by index"
    - "Native DOM button mount (not Vue h()/render()) for the D-04 comment-trigger button, since it must live as an additional child inside an already-populated .rendered-block wrapper; Vue's render(vnode, container) is reserved for the D-07 comment-card/composer, which mount into a freshly created, otherwise-empty sibling div inserted after the block (mirrors DiffWorkspace.vue's zone-based render pattern)"
    - "Chip/marker reuse: D-01/D-02's Added/Removed/Changed tag reuses the existing .status-badge/.status-badge--added|deleted|modified classes verbatim (zero new chip CSS); only the new .rendered-block--added|removed|changed border-left is new CSS"

key-files:
  created:
    - src/web/components/RenderedMarkdownView.vue
    - src/web/model/rendered-markdown-blocks.ts
    - tests/unit/rendered-markdown-blocks.test.ts
  modified:
    - src/web/styles.css

key-decisions:
  - "extractSourceBlocks' {start,end} pair deliberately mirrors markdown-it's own token.map semantics: start = data-source-start attribute minus one (0-indexed), end = data-source-end attribute as-is (already 1-indexed inclusive); callers recover the 1-indexed inclusive range as [start+1, end] everywhere (activate(), classifyBlockChange(), D-07 containment check)"
  - "D-07 comment matching mirrors DiffWorkspace.vue's currentComment() filter (fileId + side + status==='verified') with the single-line equality replaced by range containment (block.start+1 <= comment.line <= block.end), rendering every matching comment (not just one active anchor) since rendered view has no gutter-marker equivalent to indicate collapsed comments"

requirements-completed: [MDV-01, MDV-02, MDV-03, MDV-04]

# Metrics
duration: 50min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 03: RenderedMarkdownView.vue Block Rendering, Commenting, and Change Markers Summary

**New `RenderedMarkdownView.vue` turns `renderMarkdownPreview`'s hardened HTML into keyboard-focusable per-block divs with a hover/focus comment-trigger emitting the block's full `[start,end]` range (A-01), inline reused `conversation-card`/`CommentComposer` rendering, same-origin image rewriting, and Added/Removed/Changed left-rule+chip markers — using the exact props/emits contract `DiffWorkspace.vue`'s Monaco host already exposes.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-10-31T11:33:00Z
- **Completed:** 2026-10-31T12:23:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `RenderedMarkdownView.vue` parses `renderMarkdownPreview(content)`'s output into a detached container, rewrites every `<img>` `src` to the same-origin `/api/files/:fileId/image` route, then wraps each `[data-source-start]` element (the innermost row/item/paragraph/heading/code-block per D-05, never the enclosing table/list/quote) in a `tabindex="0" .rendered-block` div before moving the whole tree into the live DOM.
- A hover/focus-revealed `+` button (`.diff-workspace__gutter-action`, reused verbatim) emits `activate(side, block.start+1, block.end)` — the block's full 1-indexed inclusive source range per CONTEXT.md amendment A-01 — with an `aria-label`/`title` naming the block kind (heading/paragraph/list item/table row/code block/quote).
- Every `verified` comment matching the pane's `fileId`/`side` renders inline, always expanded, below the *first* block whose `[start+1,end]` range contains its anchor line (D-07), via the byte-for-byte `DiffWorkspace.vue` `conversation-card` `h()` shape; the open composer mounts the same way via the identical `CommentComposer` `h()` call.
- `classifyBlockChange()` classifies each block against an optional `changes` prop using the same `original*`/`modified*` side mapping `diff-semantics.ts` already uses, driving a new `.rendered-block--added|removed|changed` left-rule plus an always-visible `Added`/`Removed`/`Changed` text chip (reusing the existing `.status-badge--added|deleted|modified` classes — never color alone).
- 10 unit tests covering `extractSourceBlocks` (real 8-block fixture reused from `markdown-preview.test.ts`'s ground truth, empty-array case, attribute-order independence), `buildImageRouteUrl` (exact route shape, `&`/space escaping), and `classifyBlockChange`'s added/removed/changed/undefined decision table, all passing; `tsc --project tsconfig.web.json` and `verify:semantic-css` both clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Block-wrapped DOM construction, props/emits scaffold, and D-11 base styling** - `28cbe7b` (feat)
2. **Task 2: D-04 comment-trigger button, D-07 existing-comment rendering, composer mount** - `88908d2` (feat)
3. **Task 3: D-01/D-02 side-by-side change markers** - `ee48e51` (feat)

_Non-TDD `type="auto"` tasks: one feat commit per task, each independently passing `npm run typecheck:web` and the focused vitest run, matching plan 16-01's precedent._

## Files Created/Modified
- `src/web/components/RenderedMarkdownView.vue` - New component: block wrapping, image rewriting, D-04 button, D-07 comment/composer rendering, D-01/D-02 markers (248 lines)
- `src/web/model/rendered-markdown-blocks.ts` - New pure module: `extractSourceBlocks`, `buildImageRouteUrl`, `classifyBlockChange`
- `tests/unit/rendered-markdown-blocks.test.ts` - New test file: 10 unit cases across all three exports
- `src/web/styles.css` - New rules only: `.rendered-markdown`, `.rendered-block(--added|--removed|--changed)`, table/th/td, pre, code, blockquote, `.rendered-markdown__remote-image`; zero edits to existing selectors

## Decisions Made
- `extractSourceBlocks`'s `{start,end}` indexing (`start` = attribute minus one, `end` = attribute as-is) mirrors markdown-it's own `token.map` convention, so every downstream caller recovers the 1-indexed inclusive range as `[start+1, end]` — matching the plan's literal `block.start+1`/`block.end` usage throughout.
- D-07 renders *every* matching comment (not a single "active anchor" like `DiffWorkspace.vue`'s Monaco-zone pattern), since D-07 requires comments "always expanded" inline with no gutter-marker equivalent to indicate collapsed/hidden comments exist elsewhere in a rendered-block layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added an optional `changes` prop so D-01/D-02 markers can actually receive line-change data**
- **Found during:** Task 3 (D-01/D-02 side-by-side change markers)
- **Issue:** The plan specifies `classifyBlockChange(blockStart, blockEnd, side, changes: readonly monaco.editor.ILineChange[])` and directs the component to "call it from the component for each `.rendered-block`'s range," but Task 1's own prop list (`content`, `side`, `comments`, `composer`, `mutationsLocked`, `path`, `fileId`) never includes a `changes` source, and 16-UI-SPEC.md's own Open Question #3 explicitly leaves "how `ILineChange[]` data reaches `RenderedMarkdownView` while in rendered mode" as "an implementation/architecture decision... left to the planner" (i.e., this execution). Without it, D-01/D-02 — two of this plan's five locked `must_haves` truths — would be unimplementable.
- **Fix:** Added `changes?: readonly monaco.editor.ILineChange[] | null;` to `defineProps` (optional, consistent with the `| null` convention `diff-semantics.ts`/`line-mapping.ts` already use for the same type), wired into `applyMarkers()` and a dedicated `watch(() => props.changes, applyMarkers)`. This is a prop addition to a component this very plan creates, not a new service/schema/infra change — plan 16-04 (host-swap, out of scope here) wires `DiffWorkspace`'s actual line changes into it.
- **Files modified:** `src/web/components/RenderedMarkdownView.vue`
- **Verification:** `npm run typecheck:web` clean; `classifyBlockChange` unit-tested directly; component compiles with the new prop.
- **Committed in:** `ee48e51` (Task 3 commit)

**2. [Rule 1 - Bug] Corrected Task 1's acceptance-criteria block count from 7 to 8**
- **Found during:** Task 1 (block-wrapped DOM construction)
- **Issue:** Task 1's `<behavior>` states the reference fixture (1 heading, 1 paragraph, 2-item list, 2-row table, 1 blockquote, 1 fenced code block) "produces exactly 7 `.rendered-block` elements," but its own parenthetical breakdown ("1 heading + 1 paragraph + 2 list items + 2 table rows + 1 blockquote paragraph; fence collapses to 1") sums to 8 when the fence is included. The already-merged, ground-truth `tests/unit/markdown-preview.test.ts` (plan 16-01) stamps `data-source-start` on exactly 8 elements for this identical fixture (`h1`, `p`, `li`×2, `tr`×2, blockquote's `p`, fenced `code`) — confirmed by reading its exact assertions.
- **Fix:** Wrote `extractSourceBlocks`'s fixture test asserting 8 entries (full ordered array, not just a count), using the same fixture and matching the real renderer's verified output rather than the plan's miscounted headline number.
- **Files modified:** `tests/unit/rendered-markdown-blocks.test.ts`
- **Verification:** Test passes against the real `renderMarkdownPreview` implementation.
- **Committed in:** `28cbe7b` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 missing-critical-functionality, 1 Rule 1 bug). **Impact:** Both fixes were required for the plan's own must_haves (D-01/D-02 markers; a block-count assertion that matches reality) to be implementable/correct at all. No scope creep — no other files, props, or behaviors were touched beyond what the plan's own text and locked `must_haves` already required.

## Issues Encountered
- `npm run test:unit` (full suite, run once as a post-task regression check, not part of this plan's own `<verification>` command) showed one unrelated flaky timeout in `tests/unit/token-contract.test.ts`'s Vite-dev-server HMR test under full-suite resource contention; confirmed pre-existing/environmental by re-running it in isolation (passes in 260ms). Logged to `.planning/phases/16-rendered-markdown-preview/deferred-items.md`, not fixed (out of scope per the deviation rules' scope boundary).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `RenderedMarkdownView.vue` exposes the exact `comments`/`composer`/`mutationsLocked`/`content`/`path`/`side`(-equivalent)/`fileId` props and `add`/`cancel`/`confirmDiscard`/`confirmMove`/`activate`/`keepWriting`/`ready`/`updateText` emits `DiffWorkspace.vue` already passes its Monaco host — plan 16-04's host-swap branch can pass through an identical listener object to either child.
- The new optional `changes` prop (this plan's Rule 2 addition) is ready for plan 16-04 to wire from `DiffWorkspace`'s own line-change data; no further shape changes expected on this component's public surface for that wiring.
- No blockers.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/web/components/RenderedMarkdownView.vue
- FOUND: src/web/model/rendered-markdown-blocks.ts
- FOUND: tests/unit/rendered-markdown-blocks.test.ts
- FOUND: .planning/phases/16-rendered-markdown-preview/16-03-SUMMARY.md
- FOUND commits: 28cbe7b (feat), 88908d2 (feat), ee48e51 (feat) — all present via `git log --oneline --all --grep="16-03"`
