# Sketch Wrap-Up Summary

**Date:** 2026-11-04
**Sketches processed:** 4
**Design areas:** Workbench shell, Changed-files tree, Comments and export, Tokens and density
**Skill output:** `./.kimi-code/skills/sketch-findings-loopnote/`

## Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 001 | shell-layout | S2: Files side bar + bottom panel (synthesis of B + 004 A) | Workbench shell |
| 002 | comparison-identity | A: Title bar center pill | Workbench shell |
| 003 | explorer-tree | A: Folder tree | Changed-files tree |
| 004 | comment-threads | A: Inline threads + bottom panel | Comments and export |

All four also feed **Tokens and density** (cross-cutting).

## Excluded Sketches

| # | Name | Reason |
|---|------|--------|
| — | — | None excluded |

## Design Direction

The workbench takes VS Code's shape and keeps Loopnote's own palette and type tokens. The diff gets nearly all the space. The title bar carries the Base→Head identity pill. A resizable side bar holds only the changed-files tree. The editor area has icon-only title actions, breadcrumbs, the side-by-side diff with inline comment threads, and a bottom panel (Comments / Summary / Export) that stays closed while reading. A 22px status bar shows the snapshot, open/stale comments, viewed count, and Export.

## Key Decisions

- **Layout:** no activity bar. Side bar has one view. Review surfaces live behind ⌘J in the bottom panel, which the status bar also opens.
- **Identity:** a 32px title-bar pill replaces the ~78px header. Its popover holds merge base, snapshot, worktree, Copy, and Refresh. Drift shows as a warning border plus an explanation in the popover, never as a bar over the diff. Exact patches show "cannot refresh".
- **Palette:** canonical `styles.css :root` colors unchanged. New fills: `--surface-hover`, amber warning background. VS Code Dark Modern was rejected.
- **Typography:** 13px UI, 12px metadata, 11px uppercase labels, mono for paths, SHAs, counts, and line refs. Code line height 26 → 20px.
- **Spacing:** rows 34 → 22px, side bar 294 → 264px (resizable), tree indent 20 → 12px, control radius 6 → 4px, overlay radius 10 → 6px.
- **Tree:** compact folders, status-colored names with an M/A/D letter (deleted files struck through), comment badges, `+/−` counts shown on hover or selection, path filter with "N of M", footer totals, ↑↓ preview.
- **Comments:** Monaco view-zone threads with Open / Resolved / Anchor-moved chips, collapse to a snippet, ⌘Enter reply, gutter `+` to comment, ⌥F9 thread navigation across files.
- **Export:** a checklist of readiness rows. Stale-anchor acknowledgement gates the Export button. The receipt shows `.loopnote/exports/<ts>/review.{md,json}` with copy actions and "Copy agent prompt".
- **Accessibility carried in:** toolbar groups get `role="toolbar"`/`group` with accessible names (closes backlog DEBT-01); status is never color-only.

## Open Questions

- Narrow and phone widths for the S2 frame.
- Whether open threads default to expanded or collapsed.
- New home for the voluntary-support entry point.
- `DESIGN.md` § Composition and § Geometry rewrite.
- Tree virtualization for 400+ files.
