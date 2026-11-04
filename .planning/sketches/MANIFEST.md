# Sketch Manifest

## Design Direction

Give Loopnote a VS Code-shaped workbench while keeping its own canonical palette and type tokens from `src/web/styles.css :root` (VS Code-inspired, not a clone). The diff is the product: the editor area gets nearly all the space, the side bar and bottom surfaces can collapse, and comments, the overall summary, and export sit one shortcut away instead of being permanently on screen. Density follows VS Code: 22px list rows, 35px view and editor headers, a 22px status bar, icon-only actions that reveal on hover, and flat 1px borders instead of cards. Comments become Monaco view-zone threads anchored under the commented line.

## Reference Points

- VS Code workbench: activity bar, side bar views with collapsible panes, editor title actions, breadcrumbs, bottom panel, status bar
- VS Code Explorer and Source Control views: twisties, compact folders, right-aligned M/A/D decorations, list/tree toggle
- VS Code comment widget (`vscode.comments` API) and the Comments panel
- Existing Loopnote design contract: `DESIGN.md`, `src/web/styles.css :root`

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | shell-layout | Which VS Code-style frame fits a diff-first review? | S2: Files side bar + bottom panel (synthesis of B + 004 A) | layout, shell, workbench |
| 002 | comparison-identity | Where does the Base→Head identity live once the tall header is gone? | A: Title bar center | identity, header, status-bar |
| 003 | explorer-tree | How should the changed-files ledger read as a VS Code side-bar view? | A: Folder tree | tree, files, side-bar |
| 004 | comment-threads | How do inline threads, the summary, and export fit without taking diff space? | A: Inline threads + bottom panel | comments, monaco, export |
