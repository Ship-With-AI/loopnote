---
sketch: 002
name: comparison-identity
question: "Where does the Base→Head identity live once the tall header is gone?"
winner: "A"
tags: [identity, header, status-bar, drift]
---

# Sketch 002: Comparison Identity

## Design Question

`DESIGN.md` makes the selected comparison identity the "top boundary" of the review. In a VS Code-shaped shell that header is gone. Where should Base, Head, merge base, snapshot, refresh, and drift warnings live so the identity stays visible but stops costing a 78px band?

## How to View

open .planning/sketches/002-comparison-identity/index.html

## Variants

- **A: Title bar center**: a command-center pill in the title bar (`Base main 4f2a91c → Head feat/support-payments 9c03e7d`). Click it for a details popover (merge base, snapshot, worktree, Copy, Refresh). Drift adds a warning dot, and the explanation is in the popover.
- **B: Breadcrumb identity**: the comparison is the first breadcrumb above the diff (`main 4f2a91c → feat/support-payments 9c03e7d › src › server › support-client.ts`). Drift shows as an editor notification bar with Refresh.
- **C: Status bar segments**: Base, Head, snapshot, and refresh are separate status-bar items on the left, and each opens the details upward. Drift turns the Head segment amber and raises a VS Code-style notification toast with Refresh / Keep reviewing.

## What to Look For

- Use the **State** tabs: Branches, Staged (HEAD vs index), Exact patch (frozen, no refresh), Head drifted, Refreshing.
- Which placement stays legible with long branch names and still reads as "this review is pinned to these commits".
- How loud drift should be: a dot (A), a bar that takes diff height (B), or a segment plus toast (C).
- Click **Refresh** in drifted state: the snapshot is recaptured and Head moves to `1b7e2aa`.
- The side bar, activity bar, and diff are the neutral frame from sketch 001 A. If 001 picks a different frame, the identity placement carries over.
