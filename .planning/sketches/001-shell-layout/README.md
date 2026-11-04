---
sketch: 001
name: shell-layout
question: "Which VS Code-style frame fits a diff-first review?"
winner: "S2"
tags: [layout, shell, workbench]
---

# Sketch 001: Shell Layout

## Design Question

Which VS Code workbench structure replaces the current tall identity header, the files pane, and the footer, while giving the Base/Head diff as much room as possible?

## How to View

open .planning/sketches/001-shell-layout/index.html

## Variants

- **A: Full workbench**: activity bar (Changed files / Comments / Export) switches the side bar view. A bottom panel holds Comments, Summary, and Export, closed by default (⌘J). The status bar shows the comparison, the snapshot, open/stale comments, and viewed count.
- **B: Stacked side bar**: no activity bar and no bottom panel. One side bar with collapsible panes: Changed files (fills), Comments, Summary & export. Everything for the review sits in one column next to the diff.
- **C: Editor first**: no persistent side bar. A file pill in the editor title (⌘P) opens a quick-pick of changed files, and ⌘B opens the tree as an overlay. Review (comments / summary / export) is a right drawer from the title bar or status bar, and Export is the emphasized status-bar item.
- **S1: Synthesis, stacked side bar + panel**: B's stacked side bar with Changed files and Comments panes. The bottom panel (⌘J) holds Summary and Export. Uses the 002 A title-bar pill and the 003 A folder tree.
- **S2: Synthesis, files side bar + panel** ★: B's side bar without the activity bar, now holding only Changed files. The bottom panel (⌘J, closed while reading) holds Comments, Summary, and Export, as in 004 A. The 002 A title-bar pill carries the identity, with refresh, side-bar, and panel toggles beside it. The status bar shows the snapshot, open/stale comments, viewed count, and Export. Chosen because B's single column and 004 A's panel conflicted, and S2 keeps the tree at full height and every review surface in one ⌘J place.

## What to Look For

- How much horizontal space the Head column keeps at 1280–1440px with each frame.
- Whether reaching comments and export feels "one shortcut away" (A: activity bar or ⌘J; B: always visible; C: drawer).
- Whether the activity bar earns its 48px with only three views.
- Keyboard: ⌘B side bar, ⌘J panel/drawer, ⌘P quick open (C), F7 / ⇧F7 next/previous change, ⌥↑/⌥↓ previous/next file, ↑↓ in the tree.
- Clicking a line number adds a comment; clicking "N unchanged lines" expands context (both are placeholders for sketch 004).
- The theme switcher swaps to a VS Code Dark Modern reference palette, only to compare; the chosen direction keeps Loopnote tokens.
