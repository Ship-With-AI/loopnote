# Comments and Export

## Design Decisions

**Inline threads plus the bottom panel (004 A).**

### Inline thread widget

- Each thread renders directly under its anchored line, shaped as a Monaco view zone on that side's editor. The opposite editor gets an equal-height empty zone so Base/Head stay line-aligned. `src/web/monaco/diff-adapter.ts` already creates and removes view zones (`changeViewZones`) for the composer; threads use the same mechanism. Interactive DOM inside a zone needs an overlay/content widget positioned over the zone, because view-zone DOM does not receive pointer events reliably.
- **Frame:** 1px `--border-default`, a 2px top rule in state color, bottom corners `--radius-overlay`, background `--surface-panel`, max width 720px, indented to the code column (56px from the gutter in side-by-side, 96px in inline mode).
- **Header (one line, clickable to collapse):** twistie · `Base · L4` / `Head · L51` (semibold) · state chip · hover actions (resolve or reopen, delete).
- **State chips** are 10px uppercase pills with a 1px currentColor border:
  - **Open:** `--interactive-accent`.
  - **Resolved:** `--status-resolved-foreground` (purple).
  - **Anchor moved:** `--status-warning-foreground`. The body adds a warning row: "Line changed after this comment. Export marks it **stale**; re-anchor or keep as is."
- **Body:** each comment shows `You · 4 min ago` (12px muted), then the text with inline `code` rendered. Open threads get a one-row reply textarea; ⌘Enter saves.
- **Collapsed:** the header shows a one-line ellipsized snippet of the first comment. Resolved threads start collapsed. Whether open threads start collapsed while reading is still undecided; both states are in the sketch.
- **New comment:** hovering a line number shows a 16px `+` chip in `--interactive-accent-emphasis`. Click opens the composer zone ("New comment · Head L45", Markdown textarea, `⌘ Enter to save`, Cancel / Add comment). Esc cancels. Empty submit marks the textarea border `--status-error-foreground`.
- **Gutter glyph:** lines with a thread show a 13px comment icon in the line-number gutter.
- **Resolve/delete feedback:** a toast ("Thread resolved · stays in export as resolved history"; delete offers Undo for ~3s).
- **Thread navigation:** editor-title ⌃/⌄ buttons with a "2 comments" label, plus "Collapse all comments". ⌥F9 / ⇧⌥F9 cycle threads across files in tree order, opening the file and scrolling the thread to center.

### Bottom panel (Comments / Summary / Export)

- Closed while reading. It opens via ⌘J, the title-bar panel toggle, the status-bar comment count (Comments tab), or the status-bar Export item (Export tab).
- **Comments tab:** grouped by file. The file row shows a twistie, file-type mark, name, dim directory, and count. Thread rows show a state icon (comment / resolved check / warning), the first-comment text on one line, and a right-aligned mono `B4` / `H51`. Resolved rows use muted text. Clicking a row opens the file, expands the thread, scrolls it into view, and flashes a 1px focus outline. Empty state: "No comments yet. Hover a line number in the diff and click +."
- **Summary tab:** "Overall summary · Markdown", with a save indicator on the right ("Saving…" → "✓ Saved", 500ms debounce) and a full-height textarea. The summary stays optional.
- **Export tab:**
  - **Readiness:** a checklist of rows (16px icon + text): `2 open · 1 resolved comments`, `Summary written` / `No summary (optional)`, and `1/9 files viewed · not required`.
  - **Stale gate:** if any open comment has a moved anchor, an amber checkbox reads "1 comment's anchor moved. Export it marked **stale**." The primary **Export review** button stays disabled until it is checked. Helper text: "Writes Markdown + canonical JSON to `.loopnote/exports/`".
  - **Writing:** "Writing review.json and review.md…" plus a 2px indeterminate bar.
  - **Done (receipt):** "✓ Exported · an agent can apply it now", two mono path rows (`.loopnote/exports/<timestamp>/review.md`, `…/review.json`) each with a copy icon, then **Copy agent prompt** and **Export again** (ghost). A toast confirms with the directory path.
- These map onto existing pieces: `ExportReadinessSummary.vue`, `DriftExportAcknowledgement.vue`, `ExportProgress.vue`, `ExportReceipt.vue`, `SummarySection.vue`, and `ReviewNotesDialog.vue` (which the panel replaces).

## CSS Patterns

```css
.thread{border:1px solid var(--border-default);border-top:2px solid var(--interactive-accent);
  border-radius:0 0 var(--radius-overlay) var(--radius-overlay);background:var(--surface-panel);max-width:720px}
.thread.resolved{border-top-color:var(--status-resolved-foreground)}
.thread.stale{border-top-color:var(--status-warning-foreground)}
.th-head{display:flex;align-items:center;gap:6px;white-space:nowrap;min-width:0;padding:2px 6px 2px 4px;
  font-size:12px;color:var(--text-muted);cursor:pointer}
.th-head .title{color:var(--text-primary);font-weight:600;flex:none}
.th-state{font-size:10px;text-transform:uppercase;letter-spacing:.04em;border:1px solid currentColor;
  border-radius:9px;padding:0 6px;line-height:15px;flex:none}
.th-snippet{display:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;color:var(--text-muted)}
.thread.collapsed .th-body{display:none}
.thread.collapsed .th-snippet{display:inline}
.th-body{padding:2px 12px 10px 28px;border-top:1px solid var(--border-default)}

/* gutter "+" on hover */
.ln[data-line]:hover::before{content:'+';position:absolute;left:4px;top:2px;width:16px;height:16px;line-height:15px;
  text-align:center;border-radius:3px;background:var(--interactive-accent-emphasis);color:#fff;font-weight:700}
```

## HTML Structures

```html
<div class="thread stale" role="group" aria-label="Comment thread, Head line 45, anchor moved">
  <div class="th-head" role="button" aria-expanded="true">
    <span class="twistie">…</span><span class="title">Head · L45</span>
    <span class="th-state stale">Anchor moved</span><span class="th-snippet">…</span>
    <span class="actions"><button class="icon-btn" aria-label="Resolve thread">…</button>
      <button class="icon-btn" aria-label="Delete thread">…</button></span>
  </div>
  <div class="th-body">
    <div class="stale-note">…Line changed after this comment…</div>
    <div class="cmt-meta"><b>You</b> · 31 min ago</div>
    <div class="cmt-text">Keep the <code>300</code> floor in sync with the Stripe minimum.</div>
    <textarea class="reply-input" aria-label="Reply" placeholder="Reply…"></textarea>
  </div>
</div>
```

## What to Avoid

- **Review view in the side bar (004 B).** It swaps out the file tree, and summary and export become cramped in 264px.
- **Finish-review overlay (004 C).** A modal hides comments until the end and covers the diff. Reading and finishing should coexist.
- **Always-open review rail.** The current `DESIGN.md` composition with a persistent review rail costs diff width on every file.
- **Export without the stale acknowledgement,** or a stale gate that only warns and does not disable the button.
- **Feature-card styling for export readiness.** Use checklist rows with icons, not cards (`DESIGN.md` § Geometry).

## Origin

Synthesized from sketches: 004 (winner A)
Source files available in: sources/004-comment-threads/ (variant tab "A"; State tabs: reading, threads collapsed, writing a comment, finishing, exported)
