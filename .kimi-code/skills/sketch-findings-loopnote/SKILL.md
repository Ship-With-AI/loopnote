---
name: sketch-findings-loopnote
description: Validated design decisions, CSS patterns, and visual direction from sketch experiments for the VS Code-inspired review workbench. Auto-loaded during UI implementation on Loopnote.
---

<context>
## Project: Loopnote (repo `diff-review`)

The goal is a VS Code-shaped workbench that keeps Loopnote's own canonical palette and type tokens from `src/web/styles.css :root`: VS Code-inspired, not a clone. The diff is the product. The editor area gets nearly all the space, the side bar and bottom panel collapse, and comments, the overall summary, and export sit one shortcut away instead of being permanently on screen. Density follows VS Code: 22px list rows, 35px view and editor headers, a 22px status bar, icon-only actions with tooltips, and flat 1px borders instead of cards. Comments become Monaco view-zone threads under the anchored line.

Reference points: the VS Code workbench (side bar, editor title actions, breadcrumbs, bottom panel, status bar, command-center title bar), the VS Code Explorer (compact folders, right-aligned M/A/D decorations), the VS Code comment widget and Comments panel, and the existing contract in `DESIGN.md` and `src/web/styles.css :root`.

Sketch sessions wrapped: 2026-11-04
</context>

<design_direction>
## Overall Direction

- **Palette:** unchanged Loopnote dark tokens (`--surface-*`, `--text-*`, `--status-*`, `--diff-*`, `--syntax-*`). The only new fills are `--surface-hover` (#1c232c) and an amber warning background (#2b2111). There is no VS Code blue status bar; at most one emphasized status item.
- **Typography:** platform UI stack at 13px for chrome, 12px metadata, 11px uppercase labels (`letter-spacing:.04em`), and mono 13px/20px code. Paths, SHAs, counts, and line refs use mono.
- **Spacing and geometry:** title bar 32, view header 35, editor title 35, breadcrumbs 24, rows 22, status bar 22. Side bar 264 (resizable), panel 240 (resizable). Radii are 4px for controls and 6px for overlays; rows are flat.
- **Layout:** title bar (brand · identity pill · refresh, side-bar and panel toggles), then a side bar with only the changed-files tree, then the editor (title actions, breadcrumbs, Base | Head diff, bottom panel closed while reading), then the status bar. No activity bar.
- **Interaction:** VS Code shortcuts. ⌘B side bar, ⌘J panel, F7 / ⇧F7 change, ⌥↑ / ⌥↓ file, ⌥F9 / ⇧⌥F9 comment thread, Esc closes. The tree previews files on ↑↓. Hovering the gutter shows `+` to comment. Head drift lives on the identity pill and popover and never takes diff height.
</design_direction>

<findings_index>
## Design Areas

| Area | Reference | Key Decision |
|------|-----------|--------------|
| Workbench shell | references/workbench-shell.md | Files side bar + bottom panel, no activity bar; Base→Head identity is a title-bar pill with a details/drift/refresh popover |
| Changed-files tree | references/changed-files-tree.md | VS Code Explorer folder tree: 22px rows, compact folders, status-colored names, right-aligned M/A/D, counts on hover, path filter |
| Comments and export | references/comments-and-export.md | Inline view-zone threads with state chips; Comments / Summary / Export live in the ⌘J bottom panel; stale acknowledgement gates Export |
| Tokens and density | references/tokens-and-density.md | Keep Loopnote colors, adopt VS Code geometry; token deltas table (34→22px rows, 294→264 side bar, 6→4 radius, 26→20 code line height) |

## Theme

The winning theme file is `sources/themes/default.css`, the Loopnote palette with workbench geometry. `sources/themes/dark-modern.css` is a rejected comparison reference; do not ship it. In the product, colors must come from `src/web/styles.css :root`; see the name mapping in `references/tokens-and-density.md`.

## Source Files

The original sketch HTML is preserved in `sources/NNN-name/index.html` (all variants; the winner tab is marked ★, and the State tabs cycle data conditions). Open one in a browser to see the interaction.

- `sources/001-shell-layout/`: winner **S2** (files side bar + panel)
- `sources/002-comparison-identity/`: winner **A** (title-bar pill)
- `sources/003-explorer-tree/`: winner **A** (folder tree)
- `sources/004-comment-threads/`: winner **A** (inline + bottom panel)

## Open Questions (not decided by sketches)

- Phone and narrow widths for S2. Map the `DESIGN.md` § Responsive drawer behavior onto the side bar and panel; the side-by-side diff below ~760px is unresolved.
- Whether open threads start expanded or collapsed while reading.
- Where the voluntary-support entry point goes now that the activity bar is gone (status bar or title-bar menu).
- `DESIGN.md` § Composition (identity band as top boundary, persistent review rail) and § Geometry need rewriting to match before implementation.
- Tree virtualization for very large changes (412 files was scanned visually, not performance-tested).
</findings_index>

<metadata>
## Processed Sketches

- 001-shell-layout
- 002-comparison-identity
- 003-explorer-tree
- 004-comment-threads
</metadata>
