# Changed-Files Tree

## Design Decisions

**VS Code Explorer folder tree (003 A).**

- **View header** "CHANGED FILES" (11px uppercase). Actions on the right: Filter (funnel), View as list ⇄ tree, Collapse all, ⋯ View options. They stay visible in the winning sketch; they may fade in on hover once the layout settles.
- **Rows** are 22px, flat (no radius), with a 1px transparent border that becomes `--focus-ring` on the selected row while the list has focus. Hover uses `--surface-hover`; selection uses `--selection-background`.
- **Folders:** a twistie (chevron down/right), then the name in `--text-primary`. Single-child folder chains collapse onto one line (`web/components`, `tests/server`), as VS Code's compact folders do. A collapsed folder shows a dimmed `●` in the status color of its contents.
- **Files:**
  - Left: a file-type mark (`TS`, `V`, `#`, `M↓`, `IMG`; 8.5px bold mono, colored per type), then the name colored by status: modified `--status-modified-foreground`, added `--status-added-foreground`, deleted `--status-deleted-foreground` with line-through, unsupported/binary `--text-muted`.
  - Right, in order: comment badge (comment icon + open count, `--interactive-accent`), `+N −N` counts (mono 11px), and the status letter M/A/D (mono 600 11px, 12px column).
  - Status is never color-only: the letter and the line-through carry it.
- **Line counts default to "on hover / selected"** to keep rows quiet. View options (⋯) offer: counts always / hover-or-selected / never; open-comment badges on/off; viewed check marks on/off (off by default).
- **Filter:** the funnel opens a 24px filter input under the header. It filters by path substring, highlights the match in names (`mark`, amber 35% fill), and shows "5 of 9". Enter opens the first match, ↓ moves focus into the list, Esc clears and closes. No match: "No changed files match “…”." in muted 12px.
- **Footer** under the tree: `9 files  +64 −17 … 1 viewed` (11px muted). This replaces the current "Files 1 · Changed" heading.
- **Keyboard** (tree semantics): ↑↓ move the selection and preview the file immediately. ←/→ collapse/expand a folder. Home/End jump. Enter/Space open. No persistent key-hint text inside the side bar; the current "↑↓ move · → open…" paragraph is removed.
- **Large changes:** 412 files must scan without per-row noise. Counts stay hover-only, and the activity badge or footer shows totals. Implementation should virtualize the list when it exceeds the viewport (a sketch caveat; it was not tested).
- The list ⇄ tree toggle exists (flat list renders `name  dim/dir` like VS Code Source Control), but tree is the default.

## CSS Patterns

```css
.row{height:22px;display:flex;align-items:center;gap:5px;padding-right:10px;cursor:pointer;white-space:nowrap;
  color:var(--text-primary);position:relative;border:1px solid transparent;user-select:none;min-width:0}
.row:hover{background:var(--surface-hover)}
.row.selected{background:var(--selection-background)}
.list:focus-within .row.selected{border-color:var(--focus-ring)}
/* indentation: padding-left = 8px + depth * var(--tree-indent) (+16px for files, aligning with folder names) */

.twistie{width:16px;display:grid;place-items:center;color:var(--text-muted);flex:none}
.ft{font:700 8.5px/1 var(--font-mono);width:20px;text-align:center;flex:none}
.name{overflow:hidden;text-overflow:ellipsis;min-width:0}
.row.f-M .name{color:var(--status-modified-foreground)}
.row.f-A .name{color:var(--status-added-foreground)}
.row.f-D .name{color:var(--status-deleted-foreground);text-decoration:line-through}

.cbadge{display:inline-flex;align-items:center;gap:2px;color:var(--interactive-accent);font-size:11px;flex:none;margin-left:auto}
.counts{font:11px var(--font-mono);flex:none;margin-left:auto;display:flex;gap:6px;opacity:0;transition:opacity .12s}
.row:hover .counts,.row.selected .counts,.list.show-counts .row .counts{opacity:1}
.cbadge+.counts,.cbadge+.deco{margin-left:8px}
.counts+.deco{margin-left:6px}
.deco{margin-left:auto;font:600 11px/1 var(--font-mono);flex:none;width:12px;text-align:center}

.filter{display:flex;align-items:center;gap:4px;margin:0 8px 6px 12px;height:24px;padding:0 4px 0 6px;
  border:1px solid var(--border-control);border-radius:var(--radius-control);background:var(--surface-canvas)}
.filter:focus-within{border-color:var(--focus-ring)}
mark{background:rgb(210 153 34 / 35%);color:inherit;border-radius:2px}
```

## HTML Structures

```html
<div class="view-header"><span>Changed files</span>
  <span class="actions" role="toolbar" aria-label="Changed files actions">
    <button class="icon-btn" aria-label="Filter changed files">…</button>
    <button class="icon-btn" aria-label="View as list">…</button>
    <button class="icon-btn" aria-label="Collapse all">…</button>
    <button class="icon-btn" aria-label="View options" aria-haspopup="menu">…</button>
  </span></div>
<div class="filter" hidden><svg class="i">…search…</svg><input aria-label="Filter changed files" placeholder="Filter by path"><span class="n">5 of 9</span><button class="icon-btn" aria-label="Clear filter">…</button></div>
<div class="list" role="tree" aria-label="Changed files" tabindex="0">
  <div class="row folder" role="treeitem" aria-expanded="true" aria-level="1" style="padding-left:8px">
    <span class="twistie">…</span><span class="name">src/server</span></div>
  <div class="row file f-M selected" role="treeitem" aria-level="2" aria-selected="true" title="src/server/support-client.ts" style="padding-left:36px">
    <span class="ft ts">TS</span><span class="name">support-client.ts</span>
    <span class="cbadge" title="1 open comment">…1</span>
    <span class="counts"><span class="lc-plus">+13</span><span class="lc-minus">−8</span></span>
    <span class="deco M" aria-label="modified">M</span></div>
</div>
<div class="tree-footer">9 files · +64 −17 · 1 viewed</div>
```

The full path stays available as the row's accessible name or title even when the name is truncated (`DESIGN.md` § Type).

## What to Avoid

- **Flat Source Control list as default (003 B).** It loses directory structure. The `name dim/dir` layout truncates the directory first on narrow side bars. Keep it only as a toggle.
- **Grouping by status (003 C).** The Modified / Added / Deleted / Not reviewable groups split related files in the same folder and duplicate what the M/A/D letter already shows.
- **Always-on line counts.** They make every row noisy, especially at 400+ files.
- **Status by color alone.** Always keep the letter and line-through.
- **The current 34px rows, 5px row radius, inline search box always visible, and key-hint paragraph.**

## Origin

Synthesized from sketches: 003 (winner A)
Source files available in: sources/003-explorer-tree/ (variant tab "A"; State tabs: filter, no match, viewed marks, 412 files)
