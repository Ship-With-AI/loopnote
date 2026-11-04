# Architecture Research

**Domain:** Browser-based local review workspace (Vue 3 + Vite + Monaco), VS Code-inspired workbench redesign
**Researched:** 2026-11-04
**Confidence:** HIGH — based on direct reading of `src/web/**`, `src/contracts/**`, `src/server/routes.ts`, `src/draft/mutate-draft.ts`, `scripts/css-token-contract.mjs`, `scripts/verify-semantic-css.mjs`, the four sketch-findings reference docs, and live `npm view` checks against the registry for `typescript`/`vue-tsc`/`typescript-native-bridge`.

## Standard Architecture

### System Overview

Loopnote's browser workspace is a single Vue 3 SPA (`src/web/main.ts` → `App.vue`) served by the local Fastify API. `App.vue` is a 1,468-line orchestration root: it owns every piece of session/draft/UI state and threads it down through ~15 presentational components. There is no router, no store library (Pinia/Vuex) — state lives in `ref`/`shallowRef`/`computed` inside `App.vue`, plus two hand-rolled state machines (`workspace-state.ts`, `review-draft-state.ts`) that return `{ state, commands }` transitions consumed by an imperative `runCommands()` dispatcher.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ App.vue (orchestration root — session, draft, dialog, warning-stack state)│
├───────────────┬───────────────────────────────┬───────────────────────────┤
│ IdentityHeader│ review-shell                   │ ChangedFilesDialog         │
│ (→ delete,    │ ┌───────────┬─────────────────┤ (Teleport host; narrow-   │
│  replaced by  │ │#changed-  │ review-main      │  viewport only in v2.1)  │
│  title bar)   │ │files div  │ ReviewToolbar +  │                           │
│               │ │(Teleport  │ ActiveFileToolbar│ ReviewNotesDialog         │
│               │ │ target)   │ DiffWorkspace    │ (→ delete, replaced by   │
│               │ └───────────┘  └─ Monaco diff  │  BottomPanel tabs)        │
│               │                  └─ CommentComposer (single active zone)  │
├───────────────┴───────────────────────────────┴───────────────────────────┤
│ ShellFooter (→ delete, no replacement — status bar absorbs its role)      │
└──────────────────────────────────────────────────────────────────────────┘
          ↓                              ↓                         ↓
  model/workspace-state.ts      model/review-draft-state.ts   api/client.ts
  (per-file composer/anchor     (summary/comment buffers,     (SessionClient:
   focus, command emission)      export lifecycle, revision    typed fetch
                                  conflict handling)            wrapper over
          ↓                              ↓                      /api/* routes)
  monaco/diff-adapter.ts                                              ↓
  (single active-anchor view                                  src/server/routes.ts
   zone pair per file)                                        src/draft/mutate-draft.ts
```

Target workbench frame (`workbench-shell.md`, sketch 001 S2 / 002 A):

```
┌ title bar 32px ─ brand ── [identity pill ▾] ──────── ⟳ ▯ ▭ ┐
├ side bar 264 ┬ editor title 35px: name M +N −N  ◧◨ ⇆ ───── ┤
│ CHANGED      │ breadcrumbs 24px: src › server › file.ts    │
│ FILES tree   │ diff (Base | Head), inline thread zones     │
│ (22px rows)  ├──────────────────────────────────────────── │
│              │ bottom panel (closed while reading):        │
│              │   COMMENTS · SUMMARY · EXPORT                │
├ status bar 22px: 🔒 sha  💬 open/stale  👁 viewed  ⇪ Export ┤
└──────────────────────────────────────────────────────────────┘
```

The redesign is a **restyle-and-recompose of the shell**, not a rewrite of the app. The state machines, the API client, the draft model, and the Monaco diff core stay. What moves is: (1) where chrome lives (title bar / side bar / bottom panel / status bar instead of header band / toolbar rows / modal dialogs / footer), and (2) how comments render inside Monaco (many expanded-by-default zones instead of one active zone).

### Component Responsibilities — Disposition Table

| Existing component | Lines | Disposition | Target component(s) | Notes |
|---|---|---|---|---|
| `App.vue` | 1468 | **Decompose** | `App.vue` (shell composition + session bootstrap only) + new `WorkbenchShell.vue` layout host | Keep all state refs/computeds and the `workspace`/`reviewState` controllers in `App.vue` (or extract to a composable, see Patterns). Move the giant `<template>` tree into a `WorkbenchShell.vue` that lays out title bar / side bar / editor / bottom panel / status bar as `<slot>`-based regions, so App.vue stops being simultaneously "state owner" and "1000-line template." |
| `IdentityHeader.vue` | 200 | **Replace** | `TitleBar.vue` + `IdentityPill.vue` + `IdentityPopover.vue` | `workbench-shell.md` explicitly rejects "a tall identity header band (current `IdentityHeader.vue`, ~78px)" as a losing sketch variant. Base/Head label logic (lines 29–83: exact-patch / standalone / uncommitted / pinned branches), `dirtyEndpoints`, `attachedFact`, Refresh button and Support button all carry over as *logic* into the new components; the 78px full-width band markup does not. |
| `ReviewToolbar.vue` | 74 | **Replace** | `EditorTitle.vue` toolbar section | Previous/next-file and previous/next-change groups keep their click handlers and disabled-state logic; the labelled `<span class="review-toolbar__label">File</span>`/`Change` text groups become icon-only buttons with `title`/`aria-label` per `tokens-and-density.md`: *"Text-labelled toolbar buttons in editor title… Use icons + tooltips and shortcuts instead."* This directly closes DEBT-01 (toolbar groups reachable by role and name) if each icon button keeps a distinct accessible name. |
| `ActiveFileToolbar.vue` | 129 | **Replace** | `EditorTitle.vue` (name/status/counts) + `Breadcrumbs.vue` | `effectivePath`/`layoutLabel`/`standaloneStateLabel`/`counts` computed logic carries over. The "Hide files"/"Show files" text button becomes the title-bar ⌘B toggle (moves out of this component entirely); Source/Rendered toggle becomes icon buttons (◧◨); breadcrumb segments (`src › server › file.ts`) are new — no current component renders path-segment breadcrumbs, `PathDisplay.vue`/`PathText.vue` only render a basename or full path string. |
| `ShellFooter.vue` | 20 | **Delete** | *(status bar absorbs "local/pinned" + "draft stays local" facts, or they move into the identity popover footer)* | `workbench-shell.md`: *"No footer copy… leave persistent chrome."* This component's two static strings have no 1:1 home; fold `localStatus` into the identity popover and drop `"Draft stays local · export is explicit"` or relocate it into the Export tab's existing helper line (`ExportSection.vue:149` already says almost the same thing). |
| `FileTree.vue` | 231 | **Restyle** | `ChangedFilesTree.vue` (same file, new template/CSS) | **Keep.** All keyboard nav (`handleKeydown`, `ArrowUp/Down/Left/Right/Home/End/Enter/Space`), filter-prune-not-rebuild (`updateQuery`/`model.setQuery`), roving tabindex (`tabbableRowId`), and selection-restore-on-file-change logic is reused as-is via `model/file-tree.ts`. Only the `<template>`/CSS (34px→22px rows, add M/A/D column, comment badges, hover-only counts, view-options menu, list⇄tree toggle) changes. |
| `DirectoryRow.vue` | 97 | **Restyle** | `ChangedFilesTree.vue` internal row | Compact-folder chain collapsing ("`web/components`" single line) is new; `countDirectoryDescendants`/`directoryDescendantCounts` already exist in `model/file-tree.ts` and feed the existing `descendantCount` span — reuse, just restyle to the dimmed-dot/count convention in `changed-files-tree.md`. |
| `FileRow.vue` | 89 | **Restyle** | `ChangedFilesTree.vue` internal row | `StatusBadge`/`PathDisplay` reused. New: file-type mark (`TS`/`V`/`#`/`M↓`/`IMG`), comment-open-count badge (needs a `fileId → openCommentCount` map threaded in as a prop — does not exist today, derive from `workspaceComments` similar to `comment-groups.ts`'s per-file grouping), `+N −N` hover/selected-only visibility (CSS `:hover`/`.selected` gating, counts already rendered unconditionally at `FileRow.vue:70-74`). |
| `ChangedFilesDialog.vue` | 58 | **Keep (narrow only) / Restyle (default)** | `SideBar.vue` hosts `ChangedFilesTree` directly via the same `#changed-files` Teleport target for desktop; `ChangedFilesDialog` keeps its modal form only for the already-accepted-as-debt sub-1050px path. | The `v-show` (not `v-if`) comment at `App.vue:1321-1323` is load-bearing: Teleport resolves `#changed-files` once, so any `v-if` on the host strands the tree. Preserve this `Teleport defer` + stable-host-id pattern exactly when building `SideBar.vue`. |
| `ReviewNotesDialog.vue` | 331 | **Replace** | `BottomPanel.vue` (Comments / Summary / Export tabs) | This is today's accidental "bottom panel" — a full-height `ModalDialog` that stacks `SummarySection`, an open/resolved count strip, `ExportSection`, and (for attached sessions) a Finish-review block, all in one scroll. v2.1 turns it into a non-modal, closable (⌘J) panel with three tabs instead of one scroll; `attachedLifecycle` state-machine branches (lines 194-315) and all `watch()`-driven focus management carry over verbatim, just re-homed outside `ModalDialog`. |
| `SummarySection.vue` | — | **Keep** | `BottomPanel.vue` → Summary tab | No sketch changes to its save-indicator/debounce behavior beyond moving its host; `tokens-and-density.md` only asks for 11px uppercase panel-tab labels around it. |
| `ExportSection.vue` + `ExportReadinessSummary.vue` + `DriftExportAcknowledgement.vue` + `ExportProgress.vue` + `ExportReceipt.vue` + `GitignoreStatus.vue` | — | **Keep** | `BottomPanel.vue` → Export tab | Entire export state machine (readiness → drift-gate → pending → exported/failed) and its 6 child components are reused unchanged; only the collapsible-`<section>` wrapper (`ExportSection.vue:83-180`, its own open/closed `<header>`) is redundant once a real tab exists and should be unwrapped. |
| `DiffWorkspace.vue` | 525 | **Extend** | `DiffWorkspace.vue` (same file) + new `CommentThread.vue` | Keeps Monaco mount/layout/keyboard wiring. `renderAnnotation()` (lines 146-206) currently renders **one** view-zone body (either the accepted-comment card or the composer) for whatever `adapter.getActiveAnchor()` currently is. This must become "render one `CommentThread.vue` zone per commented line" — see Data Flow below. |
| `CommentComposer.vue` | 102 | **Keep (as the add/reply input), wrap** | `CommentThread.vue`'s reply row for the "Open" case; standalone for new-comment case | Add/cancel/confirm-discard/confirm-move logic is unchanged; it becomes one state inside a thread widget that also renders prior comment(s), state chip, and resolve/reopen/delete actions. |
| `comment-groups.ts` (`projectCommentGroups`) | 101 | **Keep** | `BottomPanel.vue` → Comments tab data source | Already groups comments by file + open/resolved, sorted by path then line (`groupsForState`, `orderComments`). This is exactly the Comments-tab-grouped-by-file structure in `comments-and-export.md`; no model change needed for the panel, only for inline zones (below). |
| `IdentityHeader.vue` Support button / `SupportDialog.vue` | — | **Keep** | Unchanged modal, opened from title bar instead of header band | Support flow is explicitly out of scope for behavior changes; only its trigger button moves from the header band into the title bar's right-hand icon group. |
| `ErrorState.vue`, `DraftRecovery.vue`, `InlineNotice.vue`, `SelectorDriftNotice.vue`, `StaleAnchorNotice.vue`, `RefreshSummaryPanel.vue` | — | **Keep** | Unchanged; warning-stack semantics preserved | These all sit inside the existing single `<section class="shell-warning-stack">` (App.vue:1278-1305), which is the one-live-region-owner pattern from v1.6. The workbench redesign does not touch this contract — drift/stale/capture/recovery notices keep their current positions above `review-shell`, independent of title-bar/status-bar additions for the same facts (the sketch deliberately keeps warning banners separate from the passive status-bar/pill cues). |
| `ui/ModalDialog.vue`, `ui/UiIcon.vue`, `ui/PathText.vue`, `ui/ReviewStateBadge.vue`, `ui/UiPrimitives.vue` (`UiTooltip`) | — | **Keep** | Reused by every new component | `UiTooltip` already implements the hover/focus tooltip pattern `tokens-and-density.md` requires for every icon-only action ("Every icon button has `title`/accessible name includes shortcut"). |

New components with no existing counterpart: `TitleBar.vue`, `IdentityPill.vue`, `IdentityPopover.vue`, `SideBar.vue` (resizable-sash host), `Breadcrumbs.vue`, `BottomPanel.vue` (tab host), `StatusBar.vue`, `CommentThread.vue` (zone widget), `ViewOptionsMenu.vue` (tree `⋯` menu).

## Recommended Project Structure

```
src/web/
├── App.vue                      # session bootstrap + state ownership only (shrinks from ~1470 → target ~500-700 lines)
├── components/
│   ├── workbench/                # NEW — shell chrome, replaces header/toolbar/footer
│   │   ├── TitleBar.vue
│   │   ├── IdentityPill.vue
│   │   ├── IdentityPopover.vue
│   │   ├── SideBar.vue
│   │   ├── Breadcrumbs.vue
│   │   ├── EditorTitle.vue       # replaces ReviewToolbar.vue + ActiveFileToolbar.vue
│   │   ├── BottomPanel.vue       # tab host: Comments / Summary / Export
│   │   ├── StatusBar.vue
│   │   └── ViewOptionsMenu.vue
│   ├── ChangedFilesTree.vue      # renamed/restyled FileTree.vue (keep file-tree.ts model as-is)
│   ├── DirectoryRow.vue          # restyled in place
│   ├── FileRow.vue               # restyled in place
│   ├── DiffWorkspace.vue         # extended: multi-zone thread rendering
│   ├── CommentThread.vue         # NEW — replaces the single-anchor card in DiffWorkspace
│   ├── CommentComposer.vue       # unchanged, used inside CommentThread.vue
│   ├── SummarySection.vue        # unchanged, rehosted under BottomPanel
│   ├── ExportSection.vue         # unchanged (minus its own collapsible header), rehosted
│   └── ui/                       # unchanged primitives
├── model/
│   ├── workspace-state.ts        # extend: per-file *set* of visible threads, not one active anchor
│   ├── review-draft-state.ts     # unchanged (already carries resolve/reopen/delete pending ops)
│   ├── comment-groups.ts         # unchanged (Comments-tab projection)
│   ├── file-tree.ts              # unchanged (tree/keyboard/filter model)
│   └── panel-state.ts            # NEW — bottom-panel open/closed + active tab (⌘J, status-bar triggers)
├── monaco/
│   └── diff-adapter.ts           # extend: Map<anchorKey, zone> per editor instead of one zone pair
└── styles.css                    # :root gains workbench geometry tokens (see Token Architecture)
```

### Structure Rationale

- **`components/workbench/`** isolates every brand-new shell-chrome component from the diff/tree/panel components that already exist and are only being restyled — this makes the "restyle vs. replace" boundary from the disposition table visible in the file tree itself, and keeps `App.vue`'s import list legible during the transition.
- **`model/panel-state.ts`** is new because today's dialog-open state (`shellDialog: 'changed-files' | 'review-notes' | 'support'`, `App.vue:78-96`) conflates "which modal is open" with what becomes "which bottom-panel tab is active, and is it open at all" — a different shape (persistent open/closed + tab selection, not a transient modal). Keeping it a separate tiny model file (mirroring the existing `selector-drift-state.ts`/`review-draft-state.ts` convention of one state machine per concern) avoids re-bloating `App.vue`.
- **`monaco/diff-adapter.ts` stays one file.** It is already 1,044 lines and the single largest model/adapter file; the zone-management rework (see below) is additive to its existing `PublicMonacoDiffAdapter` class, not a new file, because zone lifecycle must stay co-located with `rebuildAnchoredLayout`/`removeZones`/model disposal to avoid leaking `IViewZone`s across file switches (the existing `stateByFileId` save/restore pattern at `setFile()` must extend to multi-zone state the same way).

## Architectural Patterns

### Pattern 1: Multi-zone Monaco thread rendering (the core v2.1 adapter change)

**What:** Today, `PublicMonacoDiffAdapter` tracks exactly one `activeComposer: ActiveComposer | undefined` and one paired `originalZone`/`modifiedZone` (`diff-adapter.ts:111,115-116`). `rebuildAnchoredLayout()` (`diff-adapter.ts:547-591`) removes all zones and creates at most one new pair, on the line of whichever anchor is currently "active" (clicked, via `activateAnchor`) or being revealed (`setActiveAnchor`/`revealAnchor`). `DiffWorkspace.vue`'s `renderAnnotation()` then mounts either an `inline-accepted-comment` card or a `CommentComposer` into that single zone's DOM node (`DiffWorkspace.vue:146-206`), found via `host.value?.querySelector('.monaco-anchor-zone--composer')` — a single, unkeyed selector, because there is only ever one such zone.

v2.1 requires every comment-bearing line to show an **expanded-by-default thread** simultaneously (Open/Resolved/Anchor-moved), not just the one the user last clicked. That needs:
- `originalZone`/`modifiedZone` singular fields → `Map<string, { id: string; zone: IViewZone }>` per editor, keyed by `${side}:${line}` (or the comment's anchor `uniqueKey`).
- `rebuildAnchoredLayout()` → iterate every distinct anchor with comments (plus the one active composer anchor, if different) and create a paired zone per anchor, each independently height-grown via a keyed variant of `growPairedZones`/`setAnchorZoneHeight` (currently unkeyed, single-pair — `diff-adapter.ts:375-377,631-639`).
- `counterpartBoundary`-based pairing (already used to keep Base/Head zones line-aligned for one anchor, `diff-adapter.ts:570-575`) must run per-anchor, since each thread's Base line and Head line can differ independently.
- `DiffWorkspace.vue`'s single `.monaco-anchor-zone--composer` query becomes a `querySelectorAll` keyed by `data-anchor-key`, rendering one `CommentThread.vue` (or `CommentComposer.vue` for the live-composer anchor) per zone via Vue's `render()`/`h()` — the existing manual-mount-into-view-zone-DOM technique (`render(h(...), zone)`) is reused per zone, just looped.
- **Collapse-all** (session-scoped, per `comments-and-export.md`) is a thin UI toggle on top of this: a `collapsedThreadKeys: Set<string>` that the per-zone render consults before mounting, defaulting empty.

**When:** This is required for Feature 3 regardless of any other sequencing choice — it's the only way to satisfy "expanded by default" + "cross-file thread navigation" (⌥F9/⇧⌥F9) at once, because cross-file navigation needs every thread's zone and DOM node to exist ahead of the user navigating to it, not materialize-on-click as today.

**Trade-off:** More zones per file costs layout work on every `onDidUpdateDiff`/resize; the existing single-zone path is proven cheap. Mitigate by only materializing zones for files that are currently active (one file is ever mounted in Monaco at a time already, per `DiffWorkspace.vue`'s `setFile` lifecycle) — so the ceiling is "number of comments in the currently open file," which the product's own 10,000-ref/400-file performance gates (v1.2) suggest is small in practice, not file-count-wide.

**Example (shape of the change, not literal code):**
```typescript
// diff-adapter.ts — today (single anchor)
private activeComposer: ActiveComposer | undefined;
private originalZone: { id: string; zone: monaco.editor.IViewZone } | undefined;
private modifiedZone: { id: string; zone: monaco.editor.IViewZone } | undefined;

// diff-adapter.ts — v2.1 shape (per-thread anchors + one live composer)
private activeComposer: ActiveComposer | undefined; // unchanged: the one being typed into
private threadZones = new Map<string, { original?: ZoneRef; modified?: ZoneRef }>(); // keyed by anchor
```

### Pattern 2: Token geometry pipeline (source of truth → generated CSS → Monaco theme → verifier)

**What:** `src/web/styles.css`'s `:root` block is the single canonical token source (2,704-line file; `:root` is lines 1-160). It feeds three independent consumers through one pipeline:
1. **CSS itself** — every other selector in `styles.css` and every `.vue` `<style>` block must reference `var(--token-name)`, never a literal color (enforced by `assertAuthorStyle`/`assertDirectColorConfinement` in `scripts/verify-semantic-css.mjs`).
2. **Monaco theme** (`src/web/monaco/theme.ts`) and **adapter sizing** (`src/web/monaco/diff-adapter.ts:76-81`, e.g. `CODE_FONT_SIZE`, `CODE_LINE_HEIGHT`) — these import `TOKEN_ROOT_CSS` from the Vite **virtual module** `virtual:loopnote-tokens` (declared in `src/web/theme/virtual-tokens.d.ts`, produced at build/dev time by `scripts/token-root-plugin.mjs`, wired in `vite.config.ts:6,11`), parse it with `parseTokenRoot()`/`resolveToken()`/`toMonacoHex()` (`src/web/theme/token-contract.ts`), and convert to Monaco's hex/rgb option shapes.
3. **The verifier** (`scripts/verify-semantic-css.mjs`, run by `npm run verify:semantic-css`) — asserts the **exact** set of custom properties in `styles.css :root` matches `CANONICAL_TOKENS`, a hard-coded array in `scripts/css-token-contract.mjs` (currently ~115 entries), that every token value matches an allowed shape (hex or `rgb(R G B / A%)`), that every canonical token is referenced at least once outside the root (`assertDeclaredTokensConsumed`), and that no component file authors a literal color.

**New workbench geometry tokens** (per `tokens-and-density.md`: `--sidebar-w`, row-height `22px`, `--tree-indent: 12px`, `--radius-control: 4px`, `--radius-file-row: 0`, `--radius-overlay: 6px`, `--control-height-compact: 22px`/`26px`, `--line-height-code: 20px`, `--font-size-body: 13px` for chrome, plus new titlebar/statusbar/panel-tab height and uppercase-label tokens) must be added at **four** coordinated points, in this order, or `verify:semantic-css` fails:
1. `src/web/styles.css :root` — add/rename the custom property.
2. `scripts/css-token-contract.mjs` `CANONICAL_TOKENS` — add the exact same name (the array is the allowlist; anything in `:root` not in this array fails `assertTokenRoot`'s exact-match check).
3. At least one consuming declaration outside `:root` — a component's CSS, a `.vue` `<style>` block, or `monaco/theme.ts`/`diff-adapter.ts` (`assertDeclaredTokensConsumed` fails on any declared-but-unused token).
4. If the token drives Monaco sizing (font/line-height) or a Monaco color, `diff-adapter.ts`/`theme.ts` must read it via `resolveToken`/`toMonacoHex`, not hardcode the geometry — this is how Monaco currently stays byte-identical to the CSS root (`tokens-and-density.md`: "Colors stay canonical… Do not add component-local hex values").

Several current tokens are **renamed, not just retuned** by the redesign (`--file-row-min-height` 34→22px, `--sidebar-width` 294→264px-with-resize-range, `--tree-indent` 20→12px, `--radius-control` 6→4px, `--radius-file-row` 5→0, `--radius-overlay` 10→6px, `--control-height-compact` 30→22/26px, `--line-height-code` 26→20px, `--font-size-body` 14→13px for chrome only — code stays 13px). Renaming (vs. just changing the value) matters because the old names are checked by `assertNoLegacy()`'s retired-vocabulary list in the verifier; if the team instead wants to retarget the *existing* token names to new values (simpler migration, no renames), that is a valid alternative but loses the "±value changed, not meaning changed" signal the verifier's `--sidebar-width` consumers (styles.css itself, and any `.vue` that reads it) would otherwise get for free. Either choice is a roadmap-phase decision; the fixed invariant is that `--file-row-min-height`/`--sidebar-width`/`--tree-indent`/`--radius-*`/`--control-height-compact`/`--line-height-code`/`--font-size-body` are consumed by both CSS and (for the code-affecting ones) `diff-adapter.ts`'s density/size constants, so a change to any of them is felt in Monaco immediately, with no separate Monaco-side edit required.

**Monaco theme tokens unaffected:** `theme.ts`'s syntax/diff/status color tokens (`--syntax-*`, `--diff-*`, `--status-*`) are untouched by the geometry pass — "colour roles… unchanged" per the milestone goal — only `theme.ts`'s few *size* reads in `diff-adapter.ts` (font/line-height) move with the geometry tokens.

### Pattern 3: Single-live-region warning stack (keep, do not duplicate)

**What:** `App.vue:1278-1305` wraps every transient notice (patch drift, selector drift, stale anchors, capture-changed banner, recovery offer, refresh summary) in one `<section class="shell-warning-stack">` that is the sole owner of assistive announcements for these events (a v1.6 contract: "every warning class sits behind a single live-region owner"). The new title-bar drift cue (pill border turns warning color) and status-bar comment counts are **visual echoes** of state that already has its single announcement owner here — they must not become a second live region for the same event. `workbench-shell.md` itself notes this tension: *"Drift does not… raise toast"* at the pill level, and the refresh toast fires from the existing `announce()` plumbing (`App.vue:333-336`, `performRefresh()`).

**When:** Any new title-bar/status-bar element that mirrors drift/stale/refresh state must read the same computed flags (`patchDrifted`, `hasUnverifiedAnchors`, `selectorDriftStatus`, `worktreeChanged`) already in `App.vue` and stay presentation-only; it must not call `announce()` itself.

## Data Flow

### Comment thread lifecycle (draft → zones → mutation → reconciliation)

```
user clicks gutter "+chip" or an existing thread's reply box
            ↓
DiffWorkspace.vue emits 'activate'(side, line[, endLine])
            ↓
App.vue dispatchWorkspace({ type: 'activate-line' | 'activate-focused-line', side, line, endLine })
            ↓
model/workspace-state.ts activateLine() → WorkspaceTransition { state, commands }
  - state.files[fileId].composer = { side, line, endLine, text: '', status: 'ready' }
            ↓
App.vue runCommands() interprets 'persist-comment' command (emitted on save/⌘Enter, not on activate)
            ↓
sessionClient.mutate({ type: 'addComment', expectedRevision, fileId, side, line, endLine, body })
            ↓ (api/client.ts createSessionClient().mutate)
POST /api/draft/mutate  →  src/server/routes.ts (generic mutation route, ~line 388-452)
            ↓
src/draft/mutate-draft.ts: addComment case
  - rejects with { kind: 'invalidTarget' } if an existing comment already has the SAME anchor.uniqueKey  ← see note below
  - otherwise appends comment, bumps revision, re-validates against ReviewDraftV1Schema (src/contracts/draft.ts)
            ↓
200/201 DraftMutationResult { kind: 'accepted', draft } | { kind: 'revisionConflict', latest } | ...
            ↓
App.vue mutateReview().then(): acceptReviewDraft(result.draft, ...)
  - reviewState.accept(...)              → review-draft-state.ts canonical snapshot
  - workspace.replaceComments(...)       → workspace-state.ts reconciles WorkspaceComment[] into per-file state
            ↓
workspaceState (shallowRef) changes → DiffWorkspace.vue's `comments` prop changes
            ↓
diff-adapter.ts rebuildAnchoredLayout() (v2.1: loops all comment anchors, not just the active one)
            ↓
one Monaco view-zone pair per anchor; DiffWorkspace.vue mounts a CommentThread.vue (or CommentComposer.vue
for the live composer) into each zone's DOM node via Vue's render(h(...), zoneDom)
```

Resolve/reopen/delete follow the identical `mutateReview()` → `POST /api/draft/mutate` → `acceptReviewDraft()` path with `{ type: 'resolveComment' | 'reopenComment' | 'deleteComment', commentId }` — **this path already exists and is fully wired** in `App.vue` (`mutationOperation()`/`mutationFailure()`, `App.vue:544-560`) and in `review-draft-state.ts` (`ReviewPendingOperation` already includes `'resolve' | 'reopen' | 'delete'`, line 18) and in the server (`DraftMutationRequestSchema` discriminated union, `src/contracts/api.ts:47-72`, and `routes.ts`'s single generic `/api/draft/mutate` handler routes all five mutation types through the same `capabilities.draftStore.mutate()` call). **Nothing server-side or in the state machines needs to change to restore resolve/reopen/delete** — quick task `260915-jbv` removed only the UI (the `ReviewToolbar`/comment-rail markup that called these), not the underlying capability. The v2.1 work here is purely: give `CommentThread.vue` resolve/reopen/delete buttons that call the already-existing `mutateReview()` function with the already-existing request shapes.

**"Reply" is the one genuinely new primitive, and it needs a data-model decision before implementation, not just UI work:**

- `src/contracts/draft.ts` validates `ReviewDraftV1Schema` with a hard constraint: *"Comments must have unique anchors"* (lines 175-179) — a `superRefine` that rejects two comments sharing one `anchor.uniqueKey`.
- `src/draft/mutate-draft.ts`'s `addComment` case enforces the same rule defensively before even reaching schema validation (lines 22-25): a second `addComment` at a line that already has a comment returns `{ kind: 'invalidTarget' }`.
- `model/workspace-state.ts`'s `canonicalComment()` (lines 121-131) and `DiffWorkspace.vue`'s `currentComment()` (lines 121-127) both assume **at most one** verified comment per `(fileId, side, line)` and use `.find()` (first match).

The sketch (`comments-and-export.md`: *"Open threads get one-row reply textarea; ⌘Enter saves"*, HTML shows `<textarea class="reply-input">` under a single `cmt-text`/`cmt-meta` pair) depicts a literal second message appended to the same thread — which today's schema forbids outright. This is not a UI gap like resolve/reopen/delete; it is a **schema-level invariant that blocks the sketched behavior**. Before Feature 3's "reply" sub-feature can be planned as an implementation task, the team needs one explicit decision, because the current one-comment-per-anchor invariant is load-bearing for export/anchor-drift machinery elsewhere (durable anchors, stale/orphaned classification) and should not be loosened blindly:
- **Option A — relax uniqueness, add ordering.** Drop the anchor-uniqueness `superRefine`, let `addComment` append additional comments at an existing anchor, and give `WorkspaceComment`/`ReviewCommentProjection` an explicit ordering field (e.g. `createdAt` is already present and sortable) so a thread renders its comments chronologically. `comment-groups.ts`'s per-file/per-state grouping already tolerates multiple comments; only the anchor-uniqueness check and the "first match" assumptions in `workspace-state.ts`/`DiffWorkspace.vue` need to change to "all matches, sorted."
- **Option B — single comment, richer body.** Treat "reply" as literally appending text to the existing comment's `body` (an edit via the already-wired `editComment` mutation) rather than a second comment entity. This needs zero schema change but diverges from the sketch's two-speaker-turn visual (`You · 4 min ago` repeated per reply) and loses per-reply timestamps/authorship.
- Either way, this touches `ReviewDraftV1Schema` (if Option A) — a schema version bump is the kind of change that should get its own roadmap phase with migration tests (the project already has precedent: `src/contracts/draft.ts`'s versioned schema and the existing schema-version-mismatch `DraftLoadResponse` states `malformed`/`schemaInvalid`/`newerUnsupported` exist specifically to handle this kind of change safely).

## Token Architecture — gates summary

`npm run verify:semantic-css` (= `npm run build:web && node scripts/verify-semantic-css.mjs`) is the single gate for every CSS/token change in this milestone. It will fail the build, not just warn, on any of:
- `:root` custom properties not exactly matching `CANONICAL_TOKENS` (`scripts/css-token-contract.mjs`) — add new geometry tokens here in lockstep with `styles.css`.
- A canonical token declared in `:root` but never referenced elsewhere (`assertDeclaredTokensConsumed`) — every new token needs at least one consumer before merge.
- A literal hex/`rgb()` color anywhere outside `:root` (`assertDirectColorConfinement`, with a narrow `forced-colors` media-query and shadow-token allowlist) — new workbench chrome CSS must use `var(--token)` exclusively, consistent with existing practice.
- Retired/legacy token vocabulary reappearing (`assertNoLegacy`) — if the team renames tokens (recommended above) rather than retuning values in place, old names must be fully removed, not left as aliases.
- `.vue` `<style>` blocks violating the same author-style rules (`assertVueStyleBlocks`, currently only checked against the two Monaco prototype files explicitly, but `assertAuthorStyle` itself scans the full generated CSS output, which includes all compiled `.vue` styles) — new components' scoped styles are covered automatically once built.

## Test Impact

Grouping by functional area, with spec-file counts and relative size (lines) as a proxy for how much pinned DOM/selector/copy the redesign will touch. "Touches" = the area the test exercises changes shape (selectors, element hierarchy, or visible copy) under the v2.1 plan above.

| Area | Files | Approx. size | Why it's affected |
|---|---|---|---|
| **Shell chrome (header/toolbar/footer → title bar/side bar/status bar)** | `tests/e2e/pinned-session.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/e2e/file-tree.spec.ts`, `tests/e2e/anchored-review.spec.ts` | 1380 + 1401 + 691 + 478 lines | These assert on `IdentityHeader`/`ReviewToolbar`/`ActiveFileToolbar`/`ShellFooter` markup, labels, and the `#changed-files` sidebar toggle flow — all replaced components. `responsive-session.spec.ts` is the largest single file and the most exposed, since it exercises breakpoint behavior that the milestone explicitly narrows to "desktop only, below 1050px may regress (debt)." |
| **Changed-files tree** | `tests/e2e/file-tree.spec.ts`, `tests/unit/file-tree.test.ts` | 691 + large unit suite | `tests/unit/file-tree.test.ts` exercises `model/file-tree.ts` (kept as-is — low risk) while `tests/e2e/file-tree.spec.ts` exercises the rendered 34px-row DOM, counts-always-visible assumptions, and row class names that the Explorer-density restyle changes directly. |
| **Comment lifecycle (compose/accept/resolve/reopen/delete/reply)** | `tests/integration/anchored-workspace.spec.ts`, `tests/integration/monaco-anchor.spec.ts`, `tests/e2e/anchored-review.spec.ts`, `tests/e2e/complete-review-draft.spec.ts`, `tests/unit/workspace-state.test.ts`, `tests/unit/monaco-diff-adapter.test.ts` | 1221 + 351 + 478 + 867 lines, plus unit suites | The largest-risk group. `monaco-anchor.spec.ts` and `monaco-diff-adapter.test.ts` assert the **single active-zone** behavior (one `.monaco-anchor-zone--composer`, `getDiagnostics().pairedZoneCount` capped at 1 per `diff-adapter.ts:385`/`AdapterDiagnostics`) that Pattern 1 above replaces with a multi-zone model — these are the tests most likely to need structural rewrites, not just selector updates, because the adapter's observable zone-count contract changes. `complete-review-draft.spec.ts` exercises the old single-scroll review-notes flow that becomes tabbed. |
| **Review notes / bottom panel (summary, export, counts)** | `tests/e2e/review-notes-dialog.spec.ts`, `tests/integration/complete-review-panel.spec.ts`, `tests/integration/export-receipt-ui.spec.ts`, `tests/integration/draft-recovery-ui.spec.ts`, `tests/integration/agent-ready-export-states.spec.ts`, `tests/e2e/agent-ready-export.spec.ts`, `tests/e2e/agent-ready-export-safety.spec.ts` | 73 + 33 + 437 + 382 + 137 + 1193 + 270 lines | `ReviewNotesDialog` → `BottomPanel` is a container/host change; most of the inner `SummarySection`/`ExportSection` assertions should survive if those components' markup is reused verbatim inside the new tab host, but every test that asserts the dialog is `role="dialog"`/modal, or asserts open/close via the Review-notes button, needs updating for the non-modal ⌘J/status-bar-triggered panel. |
| **Drift/stale notices** | `tests/integration/selector-drift-ui.spec.ts` | 517 lines | Low direct risk — Pattern 3 says these stay in the existing warning-stack section — but the new title-bar drift pill is an **additional** assertable surface these tests may want to extend to cover (pill border color / "Refresh 1b7e2aa" label), not just a surface that breaks. |
| **Support dialog** | `tests/integration/support-dialog.spec.ts`, `tests/e2e/support-payment.spec.ts`, `tests/e2e/support-restore.spec.ts`, `tests/e2e/public-support-states.spec.ts` | 171 + 642 + 412 + 546 lines | Low risk — only the trigger button's host (header band → title bar) moves; the dialog itself, its `SupportDialog.vue` ref wiring (`App.vue` `supportDialog`/`identityHeader.value?.focusSupport()` focus-return target), needs its focus-return target updated to whatever hosts the new title-bar button. |
| **Markdown preview, standalone/uncommitted session chrome, marketplace/package smoke** | `tests/e2e/rendered-markdown-preview.spec.ts`, `tests/e2e/rendered-markdown-security.spec.ts`, `tests/e2e/standalone-review.spec.ts`, `tests/e2e/uncommitted-review.spec.ts`, `tests/e2e/marketplace-review.spec.ts`, `tests/e2e/package-assets.spec.ts` | ~300+267+424+478+196+246 lines | Low-to-moderate — these mostly exercise behavior unaffected by the shell redesign (per scope: session kinds unchanged), but any test that locates the Source/Rendered toggle or the files-toggle button via today's text labels will need the new icon-button selectors. |
| **Monaco theme / token contract (non-DOM)** | `tests/unit/monaco-theme.test.ts`, `tests/unit/token-contract.test.ts` | 3 + 10 tests | Needs new assertions for the added geometry tokens, not rewrites of existing ones (color tokens are untouched). |

**Net read:** the two highest-cost groups to update are **Shell chrome** (large files, near-total selector/structure churn) and **Comment lifecycle** (the Monaco adapter's zone-count contract genuinely changes, not just its styling) — both should get dedicated UAT/verification passes in the roadmap rather than being swept into a generic "update snapshots" step.

## Build Order (dependency-ordered phases)

Each phase lists what it unblocks and what can be verified before moving on.

1. **Typecheck foundation.** Resolve the TypeScript/vue-tsc pairing (target feature 7) *before* any `.vue` restructuring, so every subsequent phase gets type-checked as it's written instead of accumulating a second debt pile. Current state: `tsconfig.web.json` is a 7-file allowlist (`files: [...]`) that covers almost none of `src/web` — not just `.vue` files, but most of `src/web/**/*.ts` (App.vue's imports, `api/client.ts`, `model/workspace-state.ts`, `model/review-draft-state.ts`, `model/file-tree.ts`, every component) have **zero** compiler coverage today, and `vue-tsc` is an installed-but-unused devDependency (only referenced by `scripts/verify-prerequisites.mjs`'s version check, never invoked by any script). Confirmed live: `vue-tsc@3.3.7`/`3.3.14` cannot run against `typescript@7.0.2` (pinned exact in `package.json`) — `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined` ([vuejs/language-tools#6121](https://github.com/vuejs/language-tools/discussions/6121), confirmed still broken as of [#6156](https://github.com/vuejs/language-tools/issues/6156), closed as "use `typescript-native-bridge` instead" since official TS7 plugin support needs TS 7.1). The maintainer-endorsed fix is aliasing the `typescript` package to [`typescript-native-bridge`](https://www.npmjs.com/package/typescript-native-bridge) (published `6.0.3-bridge.19.tsgo.7.0.2`, i.e. a TS6-API-compatible bridge over the real tsgo/TS7 checker) — `"typescript": "npm:typescript-native-bridge@^6.0.3-bridge"` — which keeps `tsc`/`tsserver` working for the Node build (`build:node`) while making `vue-tsc` functional again; bump `vue-tsc` to latest (`3.3.14`) at the same time. Then replace `tsconfig.web.json`'s `files` allowlist with a real `include: ["src/web/**/*.ts", "src/web/**/*.vue"]`, add a `typecheck:web` script that runs `vue-tsc --noEmit --project tsconfig.web.json` instead of plain `tsc`, and fix whatever the newly-covered 100+ files surface. *Verify:* `npm run typecheck:web` passes clean against the **current** (pre-redesign) component tree before any workbench component is written — this proves the tool pairing works independent of the redesign's own correctness.
2. **Token architecture + `DESIGN.md` rewrite.** Add/rename geometry tokens in `styles.css :root` + `CANONICAL_TOKENS`, update `DESIGN.md` §Geometry/§Composition, add a first consumer for each new token (can be a no-op placeholder rule) so `verify:semantic-css` passes before any chrome component exists. *Verify:* `npm run verify:semantic-css` green with zero behavioral/visual change yet (tokens exist and are consumed, nothing renders differently).
3. **Shell frame.** Build `WorkbenchShell.vue`/`TitleBar.vue`/`SideBar.vue`/`StatusBar.vue` as a layout skeleton around the *existing* `ReviewToolbar`/`ActiveFileToolbar`/`FileTree`/`DiffWorkspace`/`ReviewNotesDialog` (i.e., re-plumb the existing components into the new regions before restyling their internals). *Verify:* existing Playwright "Shell chrome" group still passes if selectors are kept stable at this step (defer selector churn to steps 4-6), proving the layout swap alone doesn't regress behavior.
4. **Changed-files tree restyle.** 22px rows, M/A/D column, comment badges (needs the new `fileId → openCommentCount` derivation), hover-only counts, view-options menu, filter highlighting. *Verify:* `tests/unit/file-tree.test.ts` unchanged (model untouched); `tests/e2e/file-tree.spec.ts` updated and green.
5. **Identity/status bar.** `IdentityPill.vue` + `IdentityPopover.vue` replacing `IdentityHeader.vue`; `StatusBar.vue` wiring snapshot/comment-counts/viewed/Export/support. *Verify:* drift/refresh/support-trigger flows re-pass against `tests/integration/selector-drift-ui.spec.ts` and `tests/integration/support-dialog.spec.ts` with updated focus-return targets.
6. **Comment threads (the adapter rework).** Multi-zone `diff-adapter.ts`, `CommentThread.vue`, resolve/reopen/delete wiring (restoring already-existing `mutateReview()` call sites into new UI), and the reply data-model decision (Option A or B above) implemented. This is the largest and riskiest phase — sequence it after the shell exists so thread zones render inside a stable layout, but before final a11y/e2e sweep since it changes the most DOM. *Verify:* `tests/unit/monaco-diff-adapter.test.ts` rewritten for multi-zone diagnostics; `tests/integration/monaco-anchor.spec.ts`/`anchored-workspace.spec.ts` rewritten; new coverage for resolve/reopen/delete/reply flows that `260915-jbv` left untested since v1.6.
7. **Bottom panel / export.** `BottomPanel.vue` tab host wrapping existing `SummarySection`/`ExportSection`; ⌘J toggle, status-bar triggers, session-scoped collapse-all for threads lives here too (cross-cutting with phase 6). *Verify:* `tests/e2e/review-notes-dialog.spec.ts`, `tests/integration/complete-review-panel.spec.ts`, `tests/integration/export-receipt-ui.spec.ts`, export-gate e2e suites green.
8. **Toolbar role/name audit (DEBT-01) + accessibility/e2e sweep.** Once every icon-only action exists, do the "reachable by role and name" pass across title bar, side bar, editor title, bottom panel, status bar as one coordinated check (this is cheap to defer to the end precisely because it's a cross-cutting audit of surfaces built in 3-7, not new functionality). *Verify:* full Playwright suite green, plus a dedicated keyboard-only and screen-reader-label pass across the new chrome (shortcuts: ⌘B, ⌘J, F7/⇧F7, ⌥↑/⌥↓, ⌥F9/⇧⌥F9).

## Anti-Patterns to Avoid

### Anti-Pattern 1: Second live-region owner for drift/stale state

**What people do:** Add a `aria-live` region to the new title-bar pill or status-bar comment count because it visually echoes drift/stale state.
**Why it's wrong:** v1.6 fixed exactly this class of bug — duplicate assistive announcements on state transitions — by funneling every warning through one `shell-warning-stack` owner (`App.vue:1278-1305`). A second region re-announcing the same transition regresses a shipped, tested invariant.
**Instead:** New chrome reads the same computed flags (`patchDrifted`, `hasUnverifiedAnchors`, `selectorDriftStatus`) purely for visual styling; only the existing `announce()` call sites fire live-region text.

### Anti-Pattern 2: Treating "resolve/reopen/delete/reply" as one undifferentiated backlog item

**What people do:** Plan all four comment actions as equivalent "restore the removed UI" work.
**Why it's wrong:** Resolve/reopen/delete are **already fully wired** end-to-end (schema, server route, state machine, even the `ReviewPendingOperation` union) — restoring them is UI work only. Reply requires a schema-level decision (anchor-uniqueness relaxation or body-append) that the other three don't, and has correctness implications for anchor-drift classification that need their own review before implementation starts.
**Instead:** Sequence reply's schema decision as an explicit, separately-reviewed sub-task inside phase 6, not folded silently into "wire the four buttons."

### Anti-Pattern 3: Component-local hex colors or inline geometry in new workbench chrome

**What people do:** Hardcode `22px`/`#1c232c` directly in a new `TitleBar.vue`'s `<style>` block "just for this component" during rapid prototyping, planning to tokenize later.
**Why it's wrong:** `verify:semantic-css`'s `assertDirectColorConfinement`/`assertAuthorStyle` will fail the build the moment this lands in `main` (it scans the full generated CSS, including compiled `.vue` styles) — "later" tokenization becomes a required pre-merge step regardless, so skipping it first just adds a failed-CI round-trip.
**Instead:** Add the token to `styles.css :root` + `CANONICAL_TOKENS` in the same change that introduces its first consumer (Pattern 2's four-point checklist).

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `App.vue` ↔ `WorkbenchShell.vue`/new chrome components | Props down, events up (standard Vue) | `App.vue` keeps owning `session`, `workspaceState`, `reviewDraft`, dialog/panel-open state; new components are purely presentational, same contract as today's `IdentityHeader`/`ReviewToolbar`. |
| `App.vue` ↔ `sessionClient` (`api/client.ts`) | Typed async methods (`getSession`, `mutate`, `exportReview`, …) over `fetch` to `/api/*` | Unchanged by this milestone; every new UI action (resolve/reopen/delete/reply, panel export) reuses existing or (for reply) one new `SessionClient` method plus one new `DraftMutationRequest` variant. |
| `DiffWorkspace.vue` ↔ `diff-adapter.ts` | Imperative method calls (`setFile`, `activateAnchor`, `setActiveAnchor`, `revealAnchor`, `goToChange`, `layout`) + `onChange` callback polled via `syncAdapterState()` | The adapter remains the sole Monaco-diff authority (an explicit existing invariant: "Derive Base/Head cues only from public `ILineChange` ranges… preserve Monaco as diff authority"); multi-zone support extends this surface, it does not bypass it. |
| `styles.css :root` ↔ `monaco/theme.ts` + `monaco/diff-adapter.ts` | Build-time Vite virtual module (`virtual:loopnote-tokens`) + `theme/token-contract.ts` parse/resolve helpers | One-directional: CSS is authored, Monaco reads it at module-load time via the virtual module; there is no reverse flow. |
| `scripts/verify-semantic-css.mjs` ↔ everything above | Build-output + source-file static analysis, run via `npm run verify:semantic-css` | The only automated gate that spans both the CSS and the Monaco theme/adapter consumers; treat it as CI-blocking for every token-touching change in this milestone, not just a lint suggestion. |

## Sources

- Direct reads: `src/web/App.vue`, `src/web/components/*.vue`, `src/web/model/*.ts`, `src/web/monaco/diff-adapter.ts`, `src/web/monaco/theme.ts`, `src/web/theme/token-contract.ts`, `src/web/api/client.ts`, `src/web/styles.css`, `src/contracts/api.ts`, `src/contracts/draft.ts`, `src/draft/mutate-draft.ts`, `src/server/routes.ts`, `scripts/css-token-contract.mjs`, `scripts/verify-semantic-css.mjs`, `vite.config.ts`, `tsconfig.web.json`, `tsconfig.json`, `package.json` (HIGH confidence — primary source, this repository).
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md`, `changed-files-tree.md`, `comments-and-export.md`, `tokens-and-density.md` — the design decision record this milestone is built from (HIGH confidence — curated team artifact, cited verbatim where quoted).
- `.planning/PROJECT.md` — current milestone scope, constraints, key decisions, DEBT-01/typecheck-gap history (HIGH confidence — primary project record).
- `npm view typescript`, `npm view vue-tsc`, `npm view typescript-native-bridge` (registry queries, 2026-11-04) — version/dist-tag facts (HIGH confidence — live registry data).
- [vuejs/language-tools discussion #6121 "vue-tsc support for TypeScript 7"](https://github.com/vuejs/language-tools/discussions/6121) and [issue #6156 "vue-tsc does not work with Typescript 7"](https://github.com/vuejs/language-tools/issues/6156) — confirms the `ERR_PACKAGE_PATH_NOT_EXPORTED` failure mode and the maintainer-stated `typescript-native-bridge` workaround pending TS 7.1 plugin support (HIGH confidence — primary upstream issue tracker, directly reproduces this repo's pinned-version failure).

---
*Architecture research for: Loopnote v2.1 Workbench Redesign*
*Researched: 2026-11-04*
