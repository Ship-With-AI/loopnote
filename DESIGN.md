# Visual system

## Direction

A local Git workbench: dense, inspectable, and commit-specific. The interface borrows the material language of a dark code host—continuous code canvas, restrained borders, status ink, and monospace identifiers—without becoming a generic dashboard. The product anchor is the selected file flowing from the changed-files ledger into a paired Base/Head diff.

## Color

Source: `src/web/styles.css :root` is the single canonical semantic dark contract.

Surfaces distinguish the continuous review canvas, navigation inset, grouped panels, raised controls, empty regions, diff gaps, and hunk context. Text, borders, interaction, selection, scrollbar, status, diff, and syntax roles use their named variables from that root. Literal minus/plus labels and dashed/solid rails carry removed and added meaning without colour.

Components consume semantic variables; isolated component hex values are not introduced.

## Type

Source: the platform-system and editor stacks defined by the canonical root; no webfont dependency.

- Transitional loading and unavailable states use the `--font-size-display` and `--line-height-display` roles, preserving a clear state boundary without enlarging the working diff header.
- Page headings use the `--font-size-page-heading` role; interface body, metadata, and code use their corresponding named roles.
- Code, paths, object IDs, and line gutters use the `--font-mono` stack.
- Long paths truncate only where the full accessible name remains available.

## Geometry

- `src/web/styles.css :root` owns shell, dialog, rail, gutter, control, icon, radius, border, focus, and spacing values through semantic geometry and density tokens.
- Borders, not floating cards or shadows, separate persistent work areas. Radius is reserved for controls, compact state badges, and overlays.
- Changed-file rows use the named file-row density token, with fixed status/count columns and an ellipsized fluid path.
- Only the inner diff viewport may own horizontal overflow.

## Components

- The changed-files pane reads as a ledger: status → path → signed counts → exceptional availability.
- Reviewable text files do not repeat a visible `Text` badge; unsupported states remain visible and named.
- The diff names `BASE − REMOVED` and `HEAD + ADDED`; deletion uses a dashed rail and addition a solid rail.
- The bottom panel's Comments, Summary, and Export tabs replace the prior single scrolling list: each tab owns one concern, and thread state is communicated by icon and text together, never by colour alone.

## Composition

The selected comparison identity forms the top boundary. Below it, the changed-files side bar, paired diff, and bottom panel share one persistent grid so file choice, code evidence, and feedback read as one workflow. The signature moment is selection continuity: choosing a compact file row immediately updates the named Base/Head canvas while the status bar's counts and the bottom panel's thread state stay in view.

## Motion

Motion is functional only: drawer transitions, focus movement, and pending-state feedback. Reduced motion preserves all content and removes nonessential transition duration.

## Responsive behavior

- The workbench supports 1050–1920px without page-level horizontal scroll; only the diff canvas scrolls horizontally (SHELL-06).
- The side bar and bottom panel are independently shown, hidden, and resized by the reviewer (⌘B / Ctrl+B, ⌘J / Ctrl+J, or their title-bar toggles) rather than opening as breakpoint-driven overlays.
- Below 1050px the layout is accepted debt (NARROW-01): no phone or narrow-laptop treatment is described or guaranteed.
