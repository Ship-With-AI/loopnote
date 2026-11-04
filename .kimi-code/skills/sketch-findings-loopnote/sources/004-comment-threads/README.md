---
sketch: 004
name: comment-threads
question: "How do inline threads, the summary, and export fit without taking diff space?"
winner: "A"
tags: [comments, monaco, view-zones, summary, export]
---

# Sketch 004: Comment Threads

## Design Question

Line comments become VS Code-style threads inside the diff, shaped like Monaco view zones under the anchored line, with the matching padding on the other side. Where do the comment list, the overall summary, and export go, so that reading the diff stays the default and finishing the review is one step away?

## How to View

open .planning/sketches/004-comment-threads/index.html

## Variants

All three share the same inline thread widget: header with side and line, Open / Resolved / Anchor moved state, resolve / reopen / delete on hover, collapse to a one-line snippet, and a ⌘Enter reply. Hover a line number and click **+** to add a comment.

- **A: Inline + bottom panel**: a VS Code bottom panel with Comments / Summary / Export tabs. Closed while reading. ⌘J or the status-bar comment count opens it.
- **B: Inline + Review side bar**: a second activity-bar view, "Review", with stacked Comments, Summary, and Export panes in the side bar.
- **C: Inline + Finish overlay**: no persistent review surface. "Finish review" in the status bar opens a centered overlay with comments, summary, and export. The status-bar comment count jumps to the next thread.

## What to Look For

- **State** tabs: Reading, Threads collapsed, Writing a comment (composer open on Head L45), Finishing, Exported.
- Expanded threads push code down. Is "Threads collapsed" (one-line snippets) the better default for reading?
- Export readiness: the stale-anchor acknowledgment gates the Export button, and the receipt shows the `.loopnote/exports/<timestamp>/review.{md,json}` paths with copy actions.
- Comment navigation: the ⌃/⌄ arrows in the editor title (⌥F9 / ⇧⌥F9) move through threads across files. Clicking a row in any comment list jumps to its thread.
- Placement cost: A steals diff height only while open, B swaps out the file tree, C hides everything until you finish.
