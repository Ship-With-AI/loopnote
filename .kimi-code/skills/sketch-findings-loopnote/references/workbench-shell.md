# Workbench Shell

## Design Decisions

**Frame: files side bar + bottom panel (001 S2).** The shell has no activity bar.

```
┌ title bar 32 ─ brand ─────── [Base main 4f2a91c → Head feat/x 9c03e7d ▾] ── ⟳ ▯ ▭ ┐
├ side bar 264 ┬ editor title 35: file.ts  M +13 −8      ↑ ↓ │ ◧ ◨ │ ⇆ ┤
│ CHANGED FILES│ breadcrumbs 24: src › server › file.ts                   │
│ tree         │ diff (Base | Head)                                        │
│              ├──────────────────────────────────────────────────────── │
│              │ bottom panel (closed while reading): COMMENTS SUMMARY EXPORT │
├ status bar 22: 🔒 a5f6387                    💬 2 open · 1 stale  👁 3/9  ⇪ Export ┤
```

- **Title bar (32px).** Brand on the left. The comparison identity pill sits centered (002 A, see below). Icon toggles on the right: Refresh snapshot, Toggle side bar (⌘B), Toggle panel (⌘J). The panel toggle shows the `.on` state while the panel is open.
- **Side bar.** A single "CHANGED FILES" view with the folder tree (see `changed-files-tree.md`). It is resizable by a 4px sash (hover/drag shows `--interactive-accent-emphasis`, double-click resets), and ⌘B hides it. No activity bar: with one view it would cost 48px for nothing.
- **Editor title (35px).** File name (semibold, ellipsized), M/A/D letter, `+N −N` in mono. Right-aligned icon actions: previous/next change (⇧F7 / F7), separator, previous/next file (⌥↑ / ⌥↓), separator, inline/side-by-side toggle, then comment navigation (see `comments-and-export.md`). This replaces the current `ActiveFileToolbar` + `ReviewToolbar` text groups.
- **Breadcrumbs (24px).** File path segments, with the file-type mark on the last one. Segments get a hover background; clicking a segment can reveal that folder in the tree.
- **Bottom panel.** It is closed while reading. ⌘J, the title-bar toggle, the status-bar comment count, and the status-bar Export item open it. Tabs: Comments (with count) / Summary / Export. Resizable by a horizontal sash; ✕ closes it.
- **Status bar (22px).** Left: snapshot (lock icon + SHA). Right: open comments plus a stale count in warning ink (opens the panel's Comments tab), viewed count, Export (opens the panel's Export tab). Draft-saved state may sit here too.
- **No footer copy.** "Local review · pinned commits" and "Draft stays local · export is explicit" leave the persistent chrome.

**Comparison identity: title-bar command-center pill (002 A).**

- Pill content: `[compare icon] BASE main 4f2a91c → HEAD feat/support-payments 9c03e7d ▾`. The labels are 10px uppercase muted, ref names are mono `--text-primary`, SHAs are mono muted.
- Variants by source:
  - **Branches:** both refs plus their SHAs.
  - **Staged:** `HEAD dde98eb → [commit icon] Staged`.
  - **Exact patch:** `main 4f2a91c → [patch icon] Exact patch`.
- Click opens a details popover (440px) below the pill: a key/value grid with Base (+ kind chip), Head (+ kind chip), Merge base, Snapshot (+ capture time), Worktree, and for exact patches Produced by and Patch digest. Footer: Copy (ghost) and Refresh snapshot. For exact patches the Refresh button is replaced by the note "Exact patches cannot refresh".
- **Drift** (head moved since capture): the pill border turns `--status-warning-foreground` and the compare icon becomes a warning dot. The popover opens with a warning row: "*feat/x* moved to `1b7e2aa` (+2 commits). This review stays pinned to `9c03e7d` until you refresh." Refresh becomes the primary button labelled "Refresh to 1b7e2aa". Drift does not take diff height and does not raise a toast.
- **Refreshing:** a 2px indeterminate progress bar at the top of the editor area. The pill appends "· capturing…" and the Refresh control is disabled. On completion a toast reports the result ("Snapshot recaptured · Head now 1b7e2aa · 1 comment re-anchored, 0 stale", or "No new changes").
- The identity is the `DESIGN.md` "top boundary". It moves into the title bar instead of a 78px header band. `IdentityHeader.vue` collapses into the pill + popover.

**Keyboard map (VS Code conventions):** ⌘B side bar · ⌘J panel · F7 / ⇧F7 next/previous change · ⌥↓ / ⌥↑ next/previous file · ⌥F9 / ⇧⌥F9 next/previous comment thread · Esc closes popovers and composers. On Windows/Linux, Ctrl replaces ⌘.

## CSS Patterns

```css
.wb{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr);
  grid-template-rows:var(--titlebar-h) minmax(0,1fr) var(--statusbar-h);
  background:var(--surface-canvas);overflow:hidden}
/* minmax(0,1fr) column matters: without it the side-by-side diff's intrinsic
   width blows the grid past the viewport. */
.wb-main{display:flex;min-height:0;position:relative}
.sidebar{width:var(--sidebar-w);flex:none;background:var(--surface-sidebar);
  border-right:1px solid var(--border-default);display:flex;flex-direction:column;min-width:0;overflow:hidden}
.editor{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--surface-canvas);position:relative}

.titlebar{display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;background:var(--surface-sidebar);
  border-bottom:1px solid var(--border-default);font-size:12px;color:var(--text-muted);position:relative;min-width:0}
.titlebar .center{position:absolute;left:50%;transform:translateX(-50%);max-width:56%;display:flex;justify-content:center}
.titlebar .right{margin-left:auto;display:flex;gap:2px;align-items:center}

.cc{display:flex;align-items:center;gap:6px;height:22px;padding:0 10px;border:1px solid var(--border-control);
  border-radius:6px;background:var(--surface-canvas);color:var(--text-muted);cursor:pointer;font-size:12px;
  max-width:100%;min-width:0;transition:border-color .15s,background .15s}
.cc:hover{border-color:var(--border-overlay);background:var(--surface-hover);color:var(--text-primary)}
.cc .ref{color:var(--text-primary);font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc.warn{border-color:var(--status-warning-foreground)}

.editor-title{height:var(--editor-title-h);display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;
  border-bottom:1px solid var(--border-default);background:var(--surface-sidebar);min-width:0;white-space:nowrap}
.editor-title .actions{margin-left:auto;display:flex;gap:2px;align-items:center}
.editor-title .sep{width:1px;height:16px;background:var(--border-default);margin:0 4px}

.panel{height:var(--panel-h);border-top:1px solid var(--border-default);background:var(--surface-canvas);
  display:flex;flex-direction:column;flex:none;min-height:0}
.panel-tabs{height:35px;display:flex;align-items:center;gap:20px;padding:0 8px 0 20px}
.ptab{border:0;background:none;color:var(--text-muted);height:100%;border-bottom:1px solid transparent;
  font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.ptab.active{color:var(--text-primary);border-bottom-color:var(--interactive-accent)}

.statusbar{display:flex;align-items:stretch;background:var(--surface-sidebar);color:var(--text-muted);
  font-size:12px;border-top:1px solid var(--border-default);white-space:nowrap;overflow:hidden;min-width:0}
.sb-item{height:100%;display:flex;align-items:center;gap:4px;padding:0 7px;border:0;background:none;color:inherit}
.sb-item:hover{background:var(--surface-hover);color:var(--text-primary)}

.sash{width:4px;margin:0 -2px;cursor:ew-resize;position:relative;z-index:5;flex:none;transition:background .15s .1s}
.sash:hover,.sash.dragging{background:var(--interactive-accent-emphasis)}

.popover{position:absolute;z-index:40;background:var(--surface-panel);border:1px solid var(--border-overlay);
  border-radius:var(--radius-overlay);box-shadow:var(--shadow-overlay)}
.kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:2px 12px;padding:8px 12px;font-size:12px}
.kv dd{margin:0;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

## HTML Structures

```html
<div class="wb">
  <header class="titlebar">
    <span class="brand"><svg class="i">…logo…</svg> Loopnote</span>
    <span class="center">
      <button class="cc" aria-haspopup="dialog" aria-expanded="false" aria-label="Comparison details: main 4f2a91c to feat/support-payments 9c03e7d">
        <svg class="i">…compare…</svg><span class="side-tag">Base</span><span class="ref">main</span><span class="sha">4f2a91c</span>
        <span>→</span><span class="side-tag">Head</span><span class="ref">feat/support-payments</span><span class="sha">9c03e7d</span><svg class="i">…chevron…</svg>
      </button>
    </span>
    <span class="right">
      <button class="icon-btn" aria-label="Refresh snapshot">…</button>
      <button class="icon-btn" aria-label="Toggle side bar (⌘B)" aria-pressed="true">…</button>
      <button class="icon-btn" aria-label="Toggle panel (⌘J)" aria-pressed="false">…</button>
    </span>
  </header>
  <div class="wb-main">
    <aside class="sidebar" aria-label="Changed files">…view-header + tree…</aside>
    <div class="sash" role="separator" aria-orientation="vertical" aria-label="Resize side bar"></div>
    <main class="editor">
      <div class="editor-title">…name, M, +/−, <span class="actions" role="toolbar" aria-label="Diff navigation">…</span></div>
      <nav class="breadcrumbs" aria-label="File path">…</nav>
      <div class="diff-wrap">…Monaco diff editor host…</div>
      <div class="hsash" role="separator" aria-orientation="horizontal"></div>
      <section class="panel" aria-label="Review" hidden>…role=tablist tabs + tabpanel…</section>
    </main>
  </div>
  <footer class="statusbar">…</footer>
</div>
```

Give toolbar groups `role="toolbar"`/`role="group"` with accessible names; that closes backlog DEBT-01 (`ReviewToolbar.vue` containers carried `aria-label` without a queryable role).

## What to Avoid

- **Activity bar (001 A).** 48px for three views. The Comments and Export views duplicated the panel.
- **Everything in one side-bar column (001 B as built).** Summary and export squeezed into a 264px column, and the comment list fought the tree for height.
- **Editor-first with no persistent tree (001 C).** ⌘P quick-open and an overlay tree hid the shape of the change, and the review drawer covered the Head column.
- **Comments pane stacked under the tree (001 S1).** It duplicates the panel's Comments tab. The tree loses height on large changes.
- **Identity as the first breadcrumb (002 B).** Drift needs a notification bar that steals diff height, and the identity scrolls out of focus with the file path.
- **Identity as status-bar segments (002 C).** Identity at the bottom edge reads as incidental, and drift needed a toast on top.
- **A tall identity header band (current `IdentityHeader.vue`, ~78px).**

## Origin

Synthesized from sketches: 001 (winner S2), 002 (winner A)
Source files available in: sources/001-shell-layout/ (variant tab "S2"), sources/002-comparison-identity/ (variant tab "A", State tabs for staged / exact patch / drifted / refreshing)
