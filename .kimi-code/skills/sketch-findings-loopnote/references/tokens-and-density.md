# Tokens and Density

## Design Decisions

- **VS Code-inspired, not a clone.** We chose VS Code's structure and density but kept Loopnote's own palette. The fidelity intake picked "VS Code-inspired" over "near-clone" and "own accent". `sources/themes/dark-modern.css` holds an approximation of VS Code Dark Modern for side-by-side comparison only. Never ship it.
- **Colors stay canonical.** Every surface, text, border, status, diff, and syntax color comes from `src/web/styles.css :root`. The sketch theme `sources/themes/default.css` copies those values under shorter sketch names; map them back to the real tokens (table below). Do not add component-local hex values (`DESIGN.md` § Color).
- **Geometry changes to VS Code density.** The current tokens target a roomier workspace. The redesign changes these:

| Current token (`styles.css`) | Current | Workbench value | Role |
|---|---|---|---|
| `--file-row-min-height` | 34px | 22px | tree/list row height |
| `--sidebar-width` | 294px (248 / 320 at breakpoints) | 264px default, user-resizable 170–520 | side bar width |
| `--tree-indent` | 20px | 12px | per-level indent |
| `--radius-control` | 6px | 4px | buttons, inputs, icon buttons |
| `--radius-file-row` | 5px | 0 (rows are flat, full-bleed) | tree rows |
| `--radius-overlay` | 10px | 6px | popovers, toasts, thread bottom corners |
| `--control-height-compact` | 30px | 22px icon buttons / 26px text buttons | controls |
| `--line-height-code` | 26px | 20px | diff line height (13px font kept) |
| `--font-size-body` | 14px | 13px UI | workbench chrome text |

New workbench geometry tokens (names from the sketch theme; give them `styles.css` semantic names during implementation):

| Sketch token | Value | Role |
|---|---|---|
| `--titlebar-h` | 32px | title bar |
| `--view-header-h` | 35px | side-bar view header ("CHANGED FILES") |
| `--editor-title-h` | 35px | editor title row (file name + actions) |
| `--breadcrumb-h` | 24px | breadcrumbs row |
| `--panel-h` | 240px default, resizable 120–520 | bottom panel |
| `--statusbar-h` | 22px | status bar |
| `--row-h` | 22px | every list row |
| `--font-size-label` | 11px uppercase, `letter-spacing:.04em` | view headers, panel tabs, section labels |
| `--font-size-meta` | 12px | metadata, status bar, breadcrumbs |

- **Separation is borders, not cards.** 1px `--border-default` between all regions. No shadows on persistent areas; `--shadow-overlay` only on popovers, toasts, and the narrow-width side-bar overlay. This is unchanged from `DESIGN.md` § Geometry.
- **Actions are icon-only with tooltips.** 22×22 hit area, 16px stroke icons (1.5px stroke), `--text-muted` at rest, hover gets `--surface-hover` + `--text-primary`, toggled-on gets `--surface-active`. View-header and pane-header actions fade in on hover/focus-within. Every icon button has a `title`/accessible name that includes its shortcut.
- **Status bar stays quiet.** It uses the side-bar surface, not VS Code blue. Only one item may use `--statusbar-emphasis-bg` (`--interactive-accent-emphasis`), and only when it is the primary next action.
- **Motion is functional only.** `.15s` hover/background transitions, a `.14–.18s` fade-up for popovers and toasts, a 2px indeterminate progress bar for snapshot capture. Reduced motion removes durations (`DESIGN.md` § Motion).

## CSS Patterns

Sketch name → canonical token mapping:

```css
/* sketch theme name        -> src/web/styles.css :root */
--surface-hover            /* new: #1c232c, between sidebar and raised */
--surface-active           -> --surface-interactive-active   (#30363d)
--accent                   -> --interactive-accent           (#79b8ff)
--accent-emphasis          -> --interactive-accent-emphasis  (#1f6feb)
--status-added/modified/deleted -> --status-*-foreground
--status-warning-background -> new amber fill #2b2111 (drift, stale ack)
--diff-add-bg / --diff-del-bg  -> --diff-addition-background / --diff-deletion-background
--diff-add-intra / --diff-del-intra -> --diff-*-intraline-background
--statusbar-bg             -> --surface-sidebar
```

Icon button:

```css
.icon-btn{width:22px;height:22px;display:inline-grid;place-items:center;border:0;background:none;
  border-radius:var(--radius-control);color:var(--text-muted);cursor:pointer;
  transition:background .15s,color .15s;padding:0}
.icon-btn:hover{background:var(--surface-hover);color:var(--text-primary)}
.icon-btn.on{background:var(--surface-active);color:var(--text-primary)}
.icon-btn:disabled{opacity:.4;cursor:default;background:none}
```

Uppercase section label (view header, panel tab, popover head):

```css
.view-header{height:var(--view-header-h);display:flex;align-items:center;padding:0 8px 0 20px;
  font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)}
```

## HTML Structures

Icons are inline 24-unit stroke SVGs (`fill="none" stroke="currentColor" stroke-width="1.5"`), `aria-hidden="true"`; the accessible name lives on the button. The existing `src/web/components/ui/UiIcon.vue` is the place to add the new glyphs (side bar, panel, previous/next file, collapse-all, resolve, reopen, filter).

## What to Avoid

- The VS Code Dark Modern palette (`dark-modern.css`). It was a comparison reference and the direction rejected it.
- VS Code's saturated blue status bar. It competes with diff colors.
- Floating cards, drop shadows, or rounded containers around persistent regions.
- Text-labelled toolbar buttons in the editor title (today's "Hide files", "FILE", "CHANGE" groups). Use icons with tooltips and shortcuts instead.
- 34px rows and the 21px "Files" page heading inside the side bar.

## Origin

Synthesized from sketches: 001, 002, 003, 004 (cross-cutting)
Source files available in: sources/themes/default.css, sources/themes/dark-modern.css
