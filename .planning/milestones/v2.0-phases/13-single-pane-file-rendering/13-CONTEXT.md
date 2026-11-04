# Phase 13: Single-Pane File Rendering - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Files that exist on only one side of the comparison (added, deleted) — plus type-changed files, by explicit user decision — render as one full-width Monaco pane instead of a side-by-side diff with an empty side. Reviewers can comment on any line of that pane (Head for added/type-changed, Base for deleted), and can tell single-pane files apart from side-by-side files (modified, renamed, copied) in the file header and file tree without relying on color.

Requirements: PANE-01, PANE-02, PANE-03 (`.planning/REQUIREMENTS.md`).

Out of scope: uncommitted sources (Phase 14), standalone file review (Phase 15), rendered Markdown (Phase 16), protocol/export schema changes (Phase 17). The single-pane surface built here is reused by Phases 14–16, so it should be a reusable path, not a special case buried in the diff editor.

</domain>

<decisions>
## Implementation Decisions

### Pane mechanics
- **D-01:** Render single-pane files with a **plain Monaco editor** (`monaco.editor.create`, a new path next to `createDiffEditor` in `src/web/monaco/diff-adapter.ts` or a sibling adapter). Do NOT use the diff editor in inline mode. The comment gutter, view zones and decorations must work with a plain `ICodeEditor` as well as the diff's original/modified sub-editors.
- **D-02:** **No added/removed tint**: content reads as a neutral file. No whole-file green/red background and no per-line +/- gutter signs. The added/deleted meaning comes from the header and side label (D-09, D-12).
- **D-03:** **Only that side's line numbers**: Head numbers for added/type-changed, Base numbers for deleted. One line-number column, matching the anchor side.
- **D-04:** **Hide diff-only controls** in single-pane files: next/prev change, hidden-region expand/collapse and any other control with no meaning without hunks. Keep file-level controls (e.g. wrap).

### Which files qualify
- **D-05:** Single-pane statuses: **`added`, `deleted`, and `type-changed`**. `modified`, `renamed` and `copied` (even at 100% similarity) stay side-by-side. Including type-changed goes beyond the PANE-01..03 wording and is deliberate.
- **D-06:** **Type-changed shows Head only**, full width, comments anchored to `head`. The header notes what the Base was (e.g. `Type changed · Head only (was symlink)`). Researcher: confirm what the comparison contract exposes about the Base object type/mode. If the Base kind isn't available, fall back to `was <old mode>` or a generic "type changed" note rather than adding git plumbing beyond what the phase needs.
- **D-07:** **0-byte added/deleted files** still use the single-pane layout, with an inline `Empty file (0 bytes)` notice instead of a blank editor and no comment target lines.
- **D-08:** **Binary, oversized and unsupported files keep today's non-reviewable placeholder.** They get NO single-pane marker, so the marker never promises a pane that can't render. Single-pane treatment applies only to reviewable text files.

### Single-pane marker (header + tree)
- **D-09:** **File tree:** the existing `StatusBadge` letter (A/D/…) already separates them without color. Extend its visually hidden label to say single pane (e.g. `Added, single pane`, `Deleted, single pane`). No new glyph or column; keep the Phase 09 dense rows.
- **D-10:** **File header (`ActiveFileToolbar.vue`):** show **both** the `StatusBadge` and a text layout label: `Added · Head only`, `Deleted · Base only`, `Type changed · Head only (was <kind>)`. This replaces today's plain `status.kind` text for these files.
- **D-11:** **Side-by-side files get no extra layout label.** Only single-pane files are marked.

### Side identity & comments
- **D-12:** **Reuse the side label strip** (`.diff-workspace__side-labels` in `DiffWorkspace.vue`) as one full-width label for the shown side (e.g. `Head · <short oid>`), matching the side-by-side panes. Note: the strip is `aria-hidden="true"` today, so the accessible side identity must come from the header text (D-10) and the composer.
- **D-13:** **Multi-line/range selection comments** behave exactly as on one side of a diff. No new selection rules.
- **D-14:** **No export change**: Markdown and canonical JSON stay as they are. Anchor `side` + file status already carry the meaning; schema changes belong to Phase 17.

### Claude's Discretion
- **Composer side display:** the user chose "You decide". `CommentComposer.vue:48` already renders `· Base line N` / `· Head line N`, so keep that as is in single-pane files. Add a chip only if planning finds the side is implicit somewhere (e.g. existing thread headers).
- Whether the single-pane editor lives in `diff-adapter.ts` or a sibling adapter module, and how editor instances are reused/disposed when switching between diff and single-pane files.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — PANE-01, PANE-02, PANE-03
- `.planning/ROADMAP.md` §"Phase 13: Single-Pane File Rendering" — goal and success criteria (UI hint: yes)
- `.planning/PROJECT.md` — v2.0 target features, constraints (Monaco, Vue 3, Zod contracts)

### Prior locked decisions
- `.planning/milestones/v1.6-phases/08-semantic-visual-foundation/08-CONTEXT.md` — token contract; new visual tokens go through it, no literals in the Monaco theme
- `.planning/milestones/v1.6-phases/09-changed-file-tree/09-CONTEXT.md` — dense file rows, status markers, no color-only meaning, roving tabindex
- `.planning/milestones/v1.6-phases/10-diff-reading-surface/10-CONTEXT.md` — Monaco is the diff authority, explicit side identity, add/remove meaning without color

### Code
- `src/web/monaco/diff-adapter.ts` (~L131-152) — current `createDiffEditor` config (`renderSideBySide: true`, inline fallback disabled, `hideUnchangedRegions`)
- `src/web/components/DiffWorkspace.vue` (~L324) — side label strip, editor host
- `src/web/components/ActiveFileToolbar.vue` — header showing plain `status.kind`
- `src/web/components/StatusBadge.vue` — status letter/label/tone mapping (`type-changed` → "Mode changed" / "Mode")
- `src/web/components/CommentComposer.vue` — side + line display
- `src/contracts/comparison.ts` (~L73-106) — `ChangedFileStatusKind`, reviewability kinds (binary/oversized/unsupported)
- `src/domain/anchor.ts` — `AnchorSide = 'base' | 'head'`
- `src/domain/file-tree.ts` — `FileTreeLeaf.effectivePath` (deleted → oldPath)
- `src/export/render-review-markdown.ts` — side rendering (no change per D-14)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StatusBadge.vue`: letter + tone + visually hidden label. Reuse in the header (D-10) and extend the label (D-09).
- `.diff-workspace__side-labels` strip: reuse as a one-label full-width strip (D-12).
- Anchor model (`base`/`head`): already routes deleted-file comments to `base`. No anchor schema change needed.
- `CommentComposer` already states side + line.

### Established Patterns
- Monaco is the only rendering engine. No custom diff/file rendering in Vue.
- Status is never conveyed by color alone (Phase 09/10).
- Visual tokens come from the Phase 08 token contract.
- Zod contracts are shared across API, drafts and export. Don't change them for this phase.

### Integration Points
- `diff-adapter.ts` is the single place `createDiffEditor` is called. The single-pane editor needs a parallel creation path, and the comment gutter/view-zone wiring must accept a plain `ICodeEditor`.
- `DiffWorkspace.vue` decides layout per selected file (single-pane vs side-by-side) from `status.kind` + reviewability.
- Toolbar/navigation controls must know the layout to hide diff-only controls (D-04).
- Tests: diff-adapter, line-mapping, anchor and file-tree unit tests, plus Playwright e2e for the picker→comment→export flow. Add coverage for added/deleted/type-changed/empty single-pane rendering and commenting.

</code_context>

<specifics>
## Specific Ideas

- Header copy: `Added · Head only`, `Deleted · Base only`, `Type changed · Head only (was symlink)`.
- Tree hidden label copy: `Added, single pane`, `Deleted, single pane`.
- Empty-file notice copy: `Empty file (0 bytes)`.
- The single-pane surface is the foundation for Phase 15 (standalone files) and Phase 16 (rendered Markdown), so neutral styling (D-02) was chosen partly for that reuse.

</specifics>

<deferred>
## Deferred Ideas

None. Discussion stayed within phase scope.

</deferred>

---

*Phase: 13-single-pane-file-rendering*
*Context gathered: 2026-10-30*
