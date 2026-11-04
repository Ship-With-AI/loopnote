---
sketch: 003
name: explorer-tree
question: "How should the changed-files ledger read as a VS Code side-bar view?"
winner: "A"
tags: [tree, files, side-bar, density]
---

# Sketch 003: Explorer Tree

## Design Question

The current ledger uses 34px rows, a large "Files" heading, a search box, and keyboard hints. What should the VS Code-density version look like: 22px rows, compact folders, file-type marks, and right-aligned M/A/D decorations? Which grouping helps a reviewer move through a change?

## How to View

open .planning/sketches/003-explorer-tree/index.html

## Variants

- **A: Folder tree**: VS Code Explorer. Compact folders (`web/components`), twisties, status-colored names, comment badge, `+/−` counts, and the M/A/D letter on the right. Toolbar: filter, list/tree toggle, collapse all, view options.
- **B: Flat SCM list**: VS Code Source Control list. File name first, dimmed directory after it, same decorations. Can switch to a tree.
- **C: Grouped by status**: collapsible Modified / Added / Deleted / Not reviewable as text groups, each a flat list with counts.

## What to Look For

- **State** tabs: 9 files, an active filter (with match highlighting and the "5 of 9" count), no match, viewed marks, and a 412-file change to test scanning and scrolling.
- The **⋯ View options** menu: line counts always / on hover or selection (default) / never, comment badges, viewed check marks. Which defaults keep rows quiet enough?
- Keyboard: focus the list, then ↑↓ to preview files, ←→ to fold folders, Enter to open. The filter opens with the funnel icon; Esc clears it.
- The footer total (`9 files +64 −17 · 1 viewed`) replaces the current file-count heading.
