# Phase 16: Rendered Markdown Preview - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can toggle any Markdown file (`.md`, `.markdown`) between source and rendered view in both single-pane (Phase 13) and side-by-side layouts. They can comment directly from a rendered block (stored anchored to that block's source line range and visible at those lines in source view) and see existing comments on the rendered blocks they anchor to. The renderer never executes scripts, renders raw HTML, or follows non-http(s)/mailto links, under the existing production CSP.

Requirements: MDV-01..04 (`.planning/REQUIREMENTS.md`).

Out of scope: Mermaid/math rendering, remote images, in-session relative-link navigation, `.mdx` support (see Deferred).

</domain>

<decisions>
## Implementation Decisions

### Rendered side-by-side diff
- **D-01:** In side-by-side layout with rendered view on, **both Base and Head render**. Blocks whose source line range overlaps added/removed/changed lines (mapped from Monaco/line-mapping line changes onto markdown-it token `map` ranges) get a marker. Unchanged blocks render plain.
- **D-02:** **Marker style: colored left rule + text tag** (`Added`, `Removed`, `Changed`) using Phase 08 tokens. Never color-only.
- **D-03:** Scroll sync between rendered panes: **Claude's discretion** (block-aligned best effort or independent; planner decides after prototyping).

### Commenting on rendered blocks
- **D-04:** **Trigger: a hover/focus `+` button** at the block's left edge, matching the code-gutter affordance. Blocks are keyboard-focusable (Tab/arrow navigation) so the button is reachable without a mouse.
- **D-05:** **Granularity: the smallest block with a source map**: list item (not the whole list), table row (not the whole table), paragraph, heading, whole fenced code block, blockquote paragraph. Anchors use the block's markdown-it `map` line range (MDV-02).
- **D-06:** **One block per comment.** No multi-block selection in rendered view; wider ranges use source view's range selection.
- **D-07:** **Existing comments render inline** below their block, always expanded, using the same thread component as code view (MDV-03). A comment whose range covers several blocks shows on the first overlapping block.
- **D-08:** **Side follows pane:** in side-by-side rendered view, left-pane comments anchor to `base`, right-pane comments to `head`, same as code view. In single-pane, the side follows the Phase 13 rule.

### Images & external content
- **D-09:** **Relative repo images only**, resolved from the same snapshot/commit as the file through a same-origin Cumpa content route (CSP-safe, no `img-src` widening). **Remote images are never fetched.** They render as a text placeholder showing alt text and URL. Researcher: confirm the CSP and add a dedicated route if the existing file content route doesn't fit (path must resolve inside the session's file set/repo, with the Phase 15 path-safety rules).
- **D-10:** **Links reuse the summary renderer's rules** (`src/web/model/markdown-preview.ts`): only `http(s):` and `mailto:` are clickable, opening in a new tab with `noopener noreferrer`. Relative links render as non-clickable text that shows the target.
- **D-11:** **GFM tables + task lists render** (task checkboxes read-only/disabled). YAML front-matter renders as a code block. Mermaid, math and other fenced languages stay code blocks: no diagram or math engines.
- **D-12:** **Markdown files = `.md` and `.markdown` only.** `.mdx` and others stay source-only (no toggle).

### Claude's Discretion (user skipped "Toggle & default view")
- **Default view is source.** A per-file **Source / Rendered** toggle in the file header, remembered per file for the session (not persisted across sessions). In side-by-side, the toggle switches both panes. Toggle state must be conveyed by text and `aria-pressed`, not color.
- D-03 scroll sync.
- markdown-it plugin choice for task lists/front-matter (prefer tiny, maintained plugins or a small local token rule; no `html: true`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — MDV-01..04
- `.planning/ROADMAP.md` §"Phase 16" — success criteria (UI hint: yes)

### Prior phases
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md` and `13-UI-SPEC.md` — single-pane surface, header conventions, neutral styling
- `.planning/phases/15-standalone-file-review/15-CONTEXT.md` — path-safety rules (D-09 image route)
- `.planning/milestones/v1.6-phases/08-semantic-visual-foundation/08-CONTEXT.md` — token contract

### Code
- `src/web/model/markdown-preview.ts` — hardened markdown-it config (`html:false`, `validateLink` http(s)/mailto, `noopener noreferrer`): reuse/extend for MDV-04
- `src/web/components/SummarySection.vue` — current consumer of the renderer
- `src/web/monaco/diff-adapter.ts` + Phase 13 single-pane adapter — line changes and anchor wiring
- `src/server/security.ts` — production CSP
- `src/server/routes.ts` — file content routes (image route)
- `package.json` — `markdown-it` 14.3.0 already a dependency

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `markdown-preview.ts` renderer with XSS-safe settings: the base for MDV-04.
- markdown-it tokens carry `map: [startLine, endLine]` for block-level source mapping (D-05).
- Comment thread component and composer from code view (D-07).
- Line-change data from the diff adapter/line-mapping for block markers (D-01).

### Established Patterns
- Never color-only meaning. Phase 08 tokens only.
- Anchors immutable, side + line range. Rendered comments are ordinary line-range anchors.
- Strict CSP; same-origin API routes only.

### Integration Points
- File header (toggle), DiffWorkspace/single-pane host (swap Monaco for rendered view), the anchor/composer pipeline, the server image route, CSP tests.

</code_context>

<specifics>
## Specific Ideas

- Marker tags: `Added`, `Removed`, `Changed`.
- Remote image placeholder shows alt text + URL as text.

</specifics>

<deferred>
## Deferred Ideas

- Mermaid diagram rendering; math rendering.
- Relative links navigating to other session files.
- `.mdx` support.
- Multi-block comment selection in rendered view.
- Remote image loading (rejected: privacy and CSP).

</deferred>

---

*Phase: 16-rendered-markdown-preview*
*Context gathered: 2026-10-30*
