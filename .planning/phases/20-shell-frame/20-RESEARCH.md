# Phase 20: Shell Frame - Research

**Researched:** 2026-11-04
**Domain:** Vue 3 SFC decomposition + CSS token migration + Monaco `editor.addAction` keybinding overrides, inside an already-shipped local-review workspace (zero new runtime dependencies)
**Confidence:** HIGH

## Summary

Phase 20 is a **restyle-and-recompose**, not a rewrite: `App.vue` stays the sole state owner (session/draft/dialog state, `handleKeydown`, the five hand-rolled session-kind branches) while its ~170-line shell region (`IdentityHeader` + `ReviewToolbar`/`ActiveFileToolbar` + the `#changed-files` Teleport host + `DiffWorkspace`'s surrounding warning-stack/empty-state markup + `ShellFooter` + the three shell dialogs) is re-plumbed into new presentational components (`WorkbenchShell.vue`, `TitleBar.vue`, `EditorTitle.vue`, `Breadcrumbs.vue`, `BottomPanel.vue`, `StatusBar.vue`) under new workbench-geometry tokens. Every existing model/state-machine file (`workspace-state.ts`, `review-draft-state.ts`, `file-tree.ts`, `draft-reconciliation.ts`), every reused child (`FileTree.vue`, `DiffWorkspace.vue`, `SummarySection.vue`, `ExportSection.vue`, `SupportDialog.vue`, the five warning-stack notice components) and `diff-adapter.ts`'s existing Monaco wiring are untouched in markup/behavior — only re-hosted.

The two pieces of genuinely new engineering are: (1) two independent drag-resize sashes (no prior pattern in the codebase — build via a small `useSash` composable, pointerdown/pointermove/pointerup + `setPointerCapture`, following the pattern STACK.md already specifies, ~60-80 lines, zero dependencies) and (2) four new Monaco keybinding overrides (F7/⇧F7/⌥↑/⌥↓) that must be registered via `editor.addAction` on **three** separate editor instances (`originalEditor`, `modifiedEditor` in `PublicMonacoDiffAdapter`, plus `editor` in `PublicMonacoSinglePaneAdapter`) using the exact pattern already proven for `Alt+Enter` at `diff-adapter.ts:178-189` and `:693-699`, while the existing `App.vue:914-940` `handleKeydown` document-level fallback is kept for focus outside Monaco. Everything else — icons, popovers, persistence — is plain Vue/CSS/`localStorage`, confirmed zero new npm dependencies.

**Primary recommendation:** Sequence token-root-first (land every new/renamed geometry token in `styles.css :root` + `CANONICAL_TOKENS` with a real consumer before any chrome component exists, satisfying `verify:semantic-css`), then build `WorkbenchShell.vue` as a pure layout host around the *existing* reused components, decompose `App.vue`'s template region in place (not a parallel rewrite), and update every broken Playwright locator in the same commit that changes its region (A11Y-03), using `review-notes-dialog.spec.ts` (full rewrite — `role="dialog"` disappears entirely) and `responsive-session.spec.ts` (30 shell-region locator hits, heaviest-impact single file) as the two highest-risk test files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session/draft state ownership, five-session-kind branching | Browser / Client (`App.vue` script) | — | Unchanged by this phase; CONTEXT.md explicitly requires `App.vue` stays state owner |
| Shell chrome layout (title bar/side bar/editor/panel/status bar) | Browser / Client (new `components/workbench/*.vue`, presentational only) | — | Pure props-down/events-up Vue components, no new state authority |
| Sash drag-resize + persistence | Browser / Client (`useSash.ts` composable + `model/panel-state.ts` + `localStorage`) | — | UI-preference-only state, explicitly must stay separate from the server-authoritative draft store (PITFALLS.md Security Mistakes table) |
| Monaco keybinding overrides (F7/⇧F7/⌥↑/⌥↓) | Browser / Client (`monaco/diff-adapter.ts` `editor.addAction`) | Browser / Client (`App.vue` `handleKeydown` document fallback) | Monaco owns its own keybinding service; must register per-editor-instance to override Monaco's internal F7 Diff Review Pane / Alt+Up/Down move-line defaults |
| CSS token root / geometry | Browser / Client (`src/web/styles.css :root`) | Build tool (`scripts/verify-semantic-css.mjs`, Vite virtual module `virtual:loopnote-tokens`) | Single canonical source feeds CSS, Monaco theme sizing, and the CI gate |
| API/server | API / Backend (Fastify `src/server/routes.ts`) | — | **Zero backend changes this phase** — no new routes, no schema changes; persistence is browser-local only |
| Teleport-hosted file tree | Browser / Client (`ChangedFilesDialog.vue` + `#changed-files` host in new `SideBar.vue`/`WorkbenchShell.vue`) | — | Host div must stay `v-show`, never `v-if`, per the v1.6 regression this phase must not reintroduce |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Design source:** Visual and structural spec is `.kimi-code/skills/sketch-findings-loopnote/` (`references/workbench-shell.md`, `references/tokens-and-density.md`) and sketch `001-shell-layout` variant **S2**. Loopnote colour roles unchanged; geometry per the tokens table.

**Interim placement until later phases:**
- Identity: render today's identity text compactly centred in the title bar (no pill/popover yet — Phase 22). Title-bar right holds Refresh (uncommitted/standalone only, as today), Review notes → now "toggle panel", side-bar toggle, panel toggle; Support moves to the status bar.
- Bottom panel: a single interim "Review" tab hosting today's `ReviewNotesDialog` body (summary, export readiness/receipt, attached Finish and its error/reload states). The modal dialog is removed; Phase 24 splits the panel into Comments / Summary / Export.
- Status bar: snapshot ID, open-comment count (opens panel), Export item (opens panel; the single emphasized item — becomes Finish in attached sessions in Phase 22), plain Support item, using existing data only.
- Warning stack (patch drifted, selector drift, stale anchors, captured-files-changed, resume-uncommitted offer, refresh summary): a strip at the top of the editor area below the editor title, content unchanged. Phase 22 moves drift into the pill.

**Layout & view:**
- Below 760px: keep the existing narrow drawer path (`ChangedFilesDialog` narrow mode) working unchanged — no new narrow work, no deletion. Desktop only is the target; regressions below 1050px are accepted debt.
- Persist side-bar width + shown/hidden and panel height in one versioned localStorage key (e.g. `loopnote.workbench.v1`), ignoring/overwriting corrupt or out-of-range values.
- Inline/side-by-side toggle (NAV-01): session-scoped, default side-by-side, disabled for single-pane files. This reverses v2.0's Out-of-Scope "User-configurable unified/split layout"; update PROJECT.md Out of Scope accordingly.
- Breadcrumbs are orientation only in this phase (no interaction).

**Keyboard & tests:**
- Register F7/⇧F7 (change) and ⌥↑/⌥↓ (file) as Monaco editor actions on both sub-editors (and the single-pane editor) so they work with focus in the diff and override Monaco's Diff Review Pane and move-line; keep the document-level handler for focus outside Monaco.
- Replace the old file-nav chords ⌥⇧[ / ⌥⇧] with ⌥↑/⌥↓ (no aliases).
- ⌘B / ⌘J (Ctrl+B / Ctrl+J on non-mac) always preventDefault, including inside the editor.
- Update every Playwright/integration locator this phase breaks within this phase (A11Y-03 rule), and add one packaged-binary shell smoke spec per session kind (committed branch/worktree, exact patch, Staged/Unstaged/Working tree, standalone, agent-attached) reusing existing fixtures/helpers (SHELL-05).

### Claude's Discretion
- Component decomposition (e.g. `components/workbench/WorkbenchShell.vue`, `TitleBar.vue`, `EditorTitle.vue`, `Breadcrumbs.vue`, `BottomPanel.vue`, `StatusBar.vue`, a `useSash` composable, `model/panel-state.ts`) and how App.vue state is passed down, provided App.vue stays the state owner and every session-kind branch is preserved (five-kind matrix checked per surface).
- Icon glyph additions to `UiIcon.vue`.
- Token names in `styles.css :root` and their `CANONICAL_TOKENS` registration, provided `verify:semantic-css` passes and every new token has a real consumer.

### Deferred Ideas (OUT OF SCOPE)
- Interactive breadcrumbs (reveal folder in tree) — consider in Phase 21.
- Persisting the inline/side-by-side choice across sessions.

**Also out of this phase per the phase boundary** (not CONTEXT.md verbatim, but load-bearing for scope): identity pill/popover and final status-bar content (Phase 22), tree restyle (Phase 21), inline threads and their editor-title actions/⌥F9 (Phase 23), panel tabs Comments/Summary/Export (Phase 24), DESIGN.md prose rewrite (Phase 25).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOK-01 | Workbench geometry tokens (22px rows, 264px side bar, 32/35/24/22px heights, 4px/6px radii, 20px code line height) over unchanged colour roles; `verify:semantic-css` passes | See "Token Architecture & the `verify:semantic-css` Gate" — exact token list, exact-match `:root` rule, consumer-detection mechanism documented with line citations |
| SHELL-01 | Title bar, files-only side bar, editor area, bottom panel, status bar; no activity bar/identity header band/review rail/footer copy | See "Component Disposition" — exact App.vue lines and component files to delete/replace/keep |
| SHELL-02 | Side bar hide/show (⌘B/toggle), resize 170–520px, double-click reset | See "Resizable Sashes" — no existing pattern, composable spec from STACK.md |
| SHELL-03 | Bottom panel open/close (⌘J/toggle/✕), resize, closed at session start | Same composable, horizontal variant; panel-open state is *not* persisted (SHELL-04 distinction documented) |
| SHELL-04 | Side-bar width + panel height persist across sessions, same machine | See "Persistence — `localStorage`" — confirmed zero prior usage, exact schema from UI-SPEC, clamping contract |
| SHELL-05 | Every capability preserved across all five session kinds, proven by one packaged-binary e2e check per kind | See "Five-Session-Kind Matrix" and "Packaged-Binary E2E Template" — exact existing spec files per kind, exact CLI-pack-and-spawn pattern to copy |
| SHELL-06 | No page-level horizontal scroll 1050–1920px | See "Pitfalls" Moderate Pitfall 3 — clamp sidebar max width by viewport, reuse existing 760/1050/1650 breakpoint vocabulary |
| NAV-01 | Editor title: filename/M-A-D/counts + icon-only actions (prev/next change, prev/next file, inline/side-by-side, Markdown toggle) each with tooltip+shortcut in accessible name | See "Component Disposition" `ActiveFileToolbar.vue`/`ReviewToolbar.vue` → `EditorTitle.vue` mapping; `UiTooltip` pattern documented |
| NAV-02 | Breadcrumbs above diff, orientation only | See UI-SPEC excerpt — non-interactive `<nav>`, no tabindex, not a tab stop |
| NAV-03 | F7/⇧F7/⌥↓/⌥↑ work both inside and outside Monaco; Monaco's own Diff Review Pane / move-line bindings suppressed | See "Monaco `addAction` Pattern" — exact `diff-adapter.ts` line numbers for both the paired-editor and single-pane adapter, existing `Alt+Enter` precedent to copy verbatim |
| NAV-04 | Explanation for unsupported/unavailable/changed-during-capture files stays beneath editor title | See App.vue template lines 1340-1372 (empty-state branches) — content unchanged, only relocated |

</phase_requirements>

## Component Disposition

Exact current state, read directly from source (`src/web/App.vue`, 1467 lines total):

| Region | File:Lines | Owns | Disposition this phase |
|---|---|---|---|
| Skip links | `App.vue:1260-1261` | 2 links: `#changed-files-heading` (files), `#${cssPrefix}heading` (diff) | Retarget per UI-SPEC "Focus Order & Skip Links"; same count/position, same target IDs |
| `IdentityHeader` | `App.vue:1262-1276`, component `src/web/components/IdentityHeader.vue` (200 lines) | Props: `session`, `support-enabled/open/inert`, `attached-lifecycle`, `inert`, `show-refresh`, `refresh-busy`, `worktree-changed`. Emits: `support`, `review-notes`, `refresh`. Internally branches on `isExactPatch`/`isStandalone`/`isUncommitted`/else (committed) to render the Base→Head comparison text — **this is the canonical five-session-kind-branch template to copy** (lines 29-83, 110-150) | **Delete component.** Fold brand + identity text (compact, centred) + icon actions (Refresh/side-bar-toggle/panel-toggle) into new `TitleBar.vue`. Support button moves to `StatusBar.vue`. The `focusSupport()` `defineExpose` (line 95-99, consumed at `App.vue` via `identityHeader.value?.focusSupport()`, search confirms sole caller) must get a new focus-return target in whichever component now hosts the Support trigger |
| Warning stack | `App.vue:1277-1372` (`<section class="shell-warning-stack">`, single-live-region-owner pattern) | Conditionally renders `InlineNotice` (patch drifted, captured-files-changed, resume-uncommitted-offer), `SelectorDriftNotice`, `StaleAnchorNotice`, `RefreshSummaryPanel` | **Keep unchanged**, only relocate under the new editor-title row per UI-SPEC. Single-live-region-owner contract (App.vue's `liveMessage`) must not gain a second announcer (ARCHITECTURE.md Anti-Pattern 1) |
| `review-shell` / `ReviewToolbar` + `ActiveFileToolbar` | `App.vue:1317-1345`, components `ReviewToolbar.vue` (73 lines), `ActiveFileToolbar.vue` (129 lines) | `ReviewToolbar.vue` wraps 2 labelled-but-roleless `<div>` groups ("File navigation" line 23, "Change navigation" line 48 — DEBT-01, deferred to Phase 25/A11Y-01) with prev/next-file and prev/next-change icon buttons; slot holds `ActiveFileToolbar` (filename `h1`, status badge, counts, Source/Rendered toggle, "Hide files"/"Show files" button) | **Delete both components.** Fold into `EditorTitle.vue`: filename/M-A-D/counts (from `ActiveFileToolbar`'s `effectivePath`/`layoutLabel`/`standaloneStateLabel`/`counts` computeds — reuse verbatim), then icon-only action row (prev/next change, prev/next file, inline/side-by-side, Markdown toggle) per UI-SPEC's exact order. "Hide/Show files" button becomes the title-bar `sidebar` toggle (removed from this component entirely) |
| `#changed-files` Teleport host | `App.vue:1322` | `<div v-show="!isNarrow && !filesCollapsed" id="changed-files" class="changed-files-sidebar">` | **Must stay `v-show`**, not `v-if` — see "Teleport Stranding" below. Move inside new `SideBar.vue`/`WorkbenchShell.vue` region |
| Empty/error diff states | `App.vue:1346-1372` | 5 branches: no files, unavailable/unsupported file, loading, diff-load-failure (3 sub-branches: exact-patch / range / generic) | **Keep content verbatim** (NAV-04), relocate "beneath the normal editor title" per UI-SPEC |
| `DiffWorkspace` | `App.vue:1373-1395` | Unchanged props/emits | **No change** — same component, same wiring |
| `ShellFooter` | `App.vue:1399`, component `ShellFooter.vue` (20 lines) | Two static text spans: `localStatus` ("Local review · pinned commits" / "Local review · frozen patch") and a fixed "Draft stays local · export is explicit" string | **Delete entirely**, no replacement copy (SHELL-01 explicit). `responsive-session.spec.ts:820-821` locks both exact strings — must be deleted in same commit, not just the component |
| `ChangedFilesDialog` | `App.vue:1401-1413`, component `ChangedFilesDialog.vue` (58 lines) | Teleports `FileTree` into `#changed-files` (desktop) or `#changed-files-dialog-tree` (narrow, inside its own `ModalDialog`) | **Keep unchanged** — narrow-mode path is explicitly frozen this phase (CONTEXT.md: "no new narrow work, no deletion") |
| `SupportDialog` | `App.vue:1414-1424` | Unchanged | **Keep unchanged**; only its trigger button's host moves (title bar → status bar) |
| `ReviewNotesDialog` | `App.vue:1425-1460`, component `ReviewNotesDialog.vue` (323 lines) | Wraps `ModalDialog` (focus-trap, `role="dialog"`, Esc-to-close, focus-restore-on-close); body = conflict/failure alerts, `SummarySection`, open/resolved count badges, `ExportSection`, attached-session "Finish review" block with 7 `attachedLifecycle` branches (`waiting`/`finishing`/`completed`/`waitingDisconnected`/`terminalFailure`/`retryableFailure` × 4 sub-kinds) | **Un-wrap from `ModalDialog`.** New `BottomPanel.vue` hosts the exact same inner markup (lines 110-323 of `ReviewNotesDialog.vue`) as a non-modal `role="region" aria-label="Review"` panel. No focus trap, no Esc-to-close (SHELL-03's close affordances are `✕`/⌘J/toggle only). `role="dialog"` disappears — `review-notes-dialog.spec.ts` must be fully rewritten (see Test Impact) |

**Five-session-kind branch template (already proven in production code, reuse this shape verbatim when writing new components' computeds):** `IdentityHeader.vue:29-39` —
```ts
const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => 'base' in props.session ? props.session : undefined);
const uncommittedKey = computed(() => 'uncommitted' in props.session ? props.session.uncommitted : undefined);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isUncommitted = computed(() => uncommittedKey.value !== undefined && !isStandalone.value);
```
Any new component branching on session kind (title bar identity text, status bar Refresh-availability) should discriminate the same way, not re-derive a different classification.

## Monaco `addAction` Pattern (NAV-03)

Two adapter classes in `src/web/monaco/diff-adapter.ts` (1044 lines total), both already register one action each with an identical shape — copy this shape for the four new actions:

**`PublicMonacoDiffAdapter`** (paired base/head editors, `diff-adapter.ts:96-648`) — constructor pushes onto `this.staticDisposables` at lines 178-189:
```ts
this.originalEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.add-base-comment`,
  label: 'Add comment to base line',
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor('base'),
}),
this.modifiedEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.add-head-comment`,
  label: 'Add comment to head line',
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor('head'),
}),
```
Both `this.originalEditor` and `this.modifiedEditor` are `monaco.editor.IStandaloneCodeEditor` (lines 98-99); `renderSideBySide: true` is fixed at construction (line 140) — not toggled per CONTEXT's NAV-01 inline/side-by-side action (that toggle must be a higher-level "swap which adapter/option is mounted" concern, not a live Monaco option flip, since `diff-adapter.ts` has no existing runtime `renderSideBySide` setter).

**`PublicMonacoSinglePaneAdapter`** (`diff-adapter.ts:648-1003`, used for added/deleted/type-changed/standalone files) — same pattern, one editor:
```ts
this.editor.addAction({
  id: `${RENAME_MAP.kindPrefix}.add-${side}-comment`,
  label: `Add comment to ${side} line`,
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor(),
}),
```

**What to add (NAV-03):** four new `addAction` registrations per editor instance (so 8 total across both adapter classes — 2× on `originalEditor`/`modifiedEditor` in the paired adapter, plus the same 4 on the single-pane `editor`), using:
- `keybindings: [monaco.KeyCode.F7]` and `[monaco.KeyMod.Shift | monaco.KeyCode.F7]` for next/previous change
- `keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow]` and `[monaco.KeyMod.Alt | monaco.KeyCode.UpArrow]` for next/previous file

**Why this specific registration is required (not optional):** Monaco's diff editor binds plain `F7`/`Shift+F7` by default to open its own internal **Diff Review Pane** overlay, and `Alt+Up`/`Alt+Down` by default to `editor.action.moveLinesUpAction`/`DownAction` [CITED: github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide — Monaco team's own accessibility guide documents the F7 Diff Review Pane default]. These are genuine **Monaco-internal** conflicts (not browser-chrome conflicts) — `editor.addAction` with explicit `keybindings` is Monaco's documented mechanism for one action's keybinding taking precedence over a built-in one when the editor has focus. `App.vue:914-940`'s existing `handleKeydown` already implements the document-level half of this (F7 at line 933, the old ⌥⇧[ / ⌥⇧] chords at lines 927-932 — these must be changed to the new ⌥↓/⌥↑ bindings, matching CONTEXT's "no aliases" instruction) but **only fires when focus is outside any `<textarea>`/`<input>`/`<select>`** (the early-return guard at line 926) — and Monaco's own text-input capture *is* a hidden `<textarea class="inputarea">`, so today, with focus inside Monaco, `handleKeydown` is a no-op and Monaco's native F7/Alt+Up/Down win. The `addAction` registrations are what make the new shortcuts work *with focus inside the diff* (NAV-03's literal requirement), while the modified `handleKeydown` branch keeps them working *outside* Monaco. Register each shortcut at exactly one layer per context — do not let both layers handle the same keypress when focus is in a shared ambiguous zone, since Monaco's internal keybinding service can call `preventDefault()`/`stopPropagation()` before the event bubbles to `document`, or the reverse can cause double-fire [CITED: `.planning/research/STACK.md` §5 "Keyboard shortcut collisions", cross-referencing OpenFn/lightning#3903 and coatless/quarto-webr#28 as documented focus-context bug reports for this exact `addAction` + global-listener coexistence pattern].

⌘B/⌘J are **not** Monaco conflicts (Monaco has no default binding for either) — CONTEXT.md's "always preventDefault, including inside the editor" is satisfiable purely via the existing `document.addEventListener('keydown', handleKeydown)` global listener (`App.vue:1173`), no `addAction` needed for those two.

## Teleport Stranding (v1.6 Regression, commit `80c3b92`)

`ChangedFilesDialog.vue:37-50` already has a `Teleport v-if="narrow || files.length > 0"` on the **Teleport element itself** — this is fine and unrelated to the bug. The actual regression pattern was a `v-if` on the **target host element** (`#changed-files` in `App.vue`): Vue resolves a Teleport's `to` target once at mount; destroying and recreating the host div with `v-if` strands the already-teleported `FileTree` in a detached DOM node, permanently emptying the sidebar on next toggle. The fix (still in place today, confirmed at `App.vue:1322`) is `v-show`, with an inline comment explaining why: *"v-show, not v-if: Teleport resolves `#changed-files` once, so destroying the host strands the teleported tree and the sidebar comes back empty."*

**For this phase:** the new `SideBar.vue`'s `#changed-files` host **must stay `v-show`** when toggled by ⌘B/the title-bar toggle — never convert it to `v-if` for the "hide sidebar" interaction, even though `v-if` would seem more natural for a collapsible region. The narrow-mode `#changed-files-dialog-tree` host inside `ChangedFilesDialog.vue`'s own `ModalDialog` (which already uses `keep-mounted: true` at `ChangedFilesDialog.vue:27`, i.e. also effectively `v-show`-equivalent) is untouched this phase per CONTEXT.md. Any **new** collapsible/resizable region this phase introduces (the bottom panel, specifically) is not itself a Teleport target, so this specific pitfall only applies to the side-bar host — but PITFALLS.md's Moderate Pitfall 1 flags it as a general pattern risk for "any new collapsible/resizable region" using `v-if`/`<Teleport>` instead of `v-show`, so apply the same rule by default to any future Teleport-based surface in this phase.

## Token Architecture & the `verify:semantic-css` Gate

**Current canonical token root:** `src/web/styles.css:1-154` (`:root` block). `--sidebar-width: 294px` (line 133), `--file-row-min-height: 34px` (line 134), `--tree-indent: 20px` (line 120), `--radius-control: 6px` (line 117), `--radius-overlay: 10px` (line 121), `--control-height-compact: 30px` (line 129), `--line-height-code: 26px` (line 103), `--font-size-body: 14px` (line 104) are the tokens UI-SPEC renames/revalues.

**Exact gate mechanics** (`npm run verify:semantic-css` = `"npm run build:web && node scripts/verify-semantic-css.mjs"`, confirmed `package.json`):
1. `rootRule()` + `assertTokenRoot(rule, label, exact=true)` (`verify-semantic-css.mjs:60-83`): the **source** `styles.css :root` block must declare the **exact set** of tokens in `CANONICAL_TOKENS` (`scripts/css-token-contract.mjs:1-27`, currently ~115 entries, alphabetically listed array literal) — no missing token, no extra token, no duplicate. Registering a new token name means literally adding the string to this array AND to `styles.css :root`, in the same change.
2. `assertDeclaredTokensConsumed(rule, sources)` (`verify-semantic-css.mjs:91-106`): every declared `--token` must appear inside a `var(--token-name)` (or `color('--token-name')`) reference somewhere in: any other rule in `styles.css` (outside `:root` itself), every `.css`/`.vue` file recursively under `src/web/` except `styles.css`, or `src/web/monaco/theme.ts` (`verify-semantic-css.mjs:405-413`, `readdir(..., { recursive: true })`). **"Real consumer" = a literal `var(--your-token)` substring in generated/compiled output of one of those files** — a token declared but never referenced fails with `canonical tokens have no consumer: --your-token`. A token-to-token dependency chain (one token's value references another via `var()`) also counts (lines 99-104).
3. `assertTokenValueShapes` validates hex (`#RRGGBB[AA]`) or `rgb(R G B / A%)` shape via the regexes at `css-token-contract.mjs:29-31`.
4. `assertNoLegacy` (retired-name blocklist) — if a token is **renamed** rather than retuned in place, the old name must be fully removed from `styles.css`, not left as a dead alias.
5. `assertDirectColorConfinement`/`assertAuthorStyle` — no literal hex/`rgb()` color anywhere outside `:root` in any compiled `.vue`/`.css` output; new chrome CSS must reference `var(--token)` exclusively.
6. The generated-CSS `:root` rule is checked for the same token *set* but not required to be byte-identical to source (`assertTokenRoot(generatedRoot, 'generated CSS', exact=false)`), since Vite may reorder/minify.

**Practical sequencing implication (Moderate Pitfall 5, confirmed mechanically above):** land every new/renamed token in `styles.css :root` + `CANONICAL_TOKENS` *and* its first real `var()` consumer (can be a placeholder rule if the full component doesn't exist yet) in the same commit/plan step that introduces it — never "tokens now, consumer later," since the gate runs `build:web` first and will fail on any declared-but-unconsumed token the moment it merges.

**New tokens this phase needs** (from UI-SPEC, to add to both `styles.css :root` and `CANONICAL_TOKENS`): `--titlebar-height` (32px), `--view-header-height` (35px), `--editor-title-height` (35px), `--breadcrumb-height` (24px), `--statusbar-height` (16px, paired with `--font-size-chrome`), `--control-height-icon` (22px), `--sidebar-width-min`/`-max`/`-default` (170/520/264px), `--panel-height-min`/`-max`/`-default` (120/520/240px), `--font-size-chrome` (13px), `--line-height-chrome` (16px), `--font-size-label` (11px), `--letter-spacing-label` (0.04em). **Renamed/revalued** (old name must disappear per `assertNoLegacy`): `--file-row-min-height` 34→22px, `--sidebar-width` 294→264px (becomes the *default*, resizable 170-520), `--tree-indent` 20→12px, `--radius-control` 6→4px, `--radius-file-row` 5→0, `--radius-overlay` 10→6px, `--line-height-code` 26→20px. **Explicitly NOT changed** (UI-SPEC's own rationale, verified by its `grep` claims): `--font-size-body` (14px) stays — only consumer of a 13px rename would be `--control-height-compact`'s sole remaining consumer `.review-toolbar .ui-button`, which is deleted this phase; a direct `--control-height-icon` (22px) replacement is cleaner than retuning the orphaned token.

**Monaco theme is unaffected by this phase's token changes** — `theme.ts`'s `--syntax-*`/`--diff-*`/`--status-*` color tokens are untouched; only `diff-adapter.ts`'s own *size* reads (`CODE_FONT_SIZE`, `CODE_LINE_HEIGHT` — confirmed via `theme.ts`/`token-contract.ts`'s `toMonacoHex`/`resolveToken` pipeline, which parses the `virtual:loopnote-tokens` Vite virtual module produced by `scripts/token-root-plugin.mjs`) consume the geometry pass, specifically `--line-height-code`.

## Resizable Sashes (SHELL-02, SHELL-03)

**No existing pattern in the codebase** — confirmed by grep across `src/web/`: zero hits for `role="separator"`, `aria-orientation`, `aria-valuenow`, `setPointerCapture`, or any `pointerdown`/drag-resize code. The only `resize:` CSS usage is plain browser `<textarea>` resize; `ResizeObserver` usage elsewhere is all Monaco auto-relayout, not drag-resize. This must be built from scratch this phase.

**Recommended shape** [CITED: STACK.md, which already specifies the exact interaction contract from the sketch's own plain-CSS implementation]: a `useSash.ts` composable shared by both the side-bar sash (vertical, `ew-resize` cursor, width 170-520px) and the panel sash (horizontal, `aria-orientation="horizontal"`, height 120-520px), handling `pointerdown`/`pointermove`/`pointerup` with `event.target.setPointerCapture(event.pointerId)`, clamped range, double-click reset to default, `role="separator"` + `aria-orientation` + `aria-valuenow` for accessibility. ~60-80 lines, zero new dependency (rejecting `splitpanes` per STACK.md: two independent single-axis sashes, already fully specified, don't need a generic multi-pane library's unused API surface).

**Drag performance (Performance Trap, STACK.md/PITFALLS.md):** drive the drag visually via direct DOM style mutation (CSS custom property or `style.width`/`style.height` set outside Vue reactivity) during `pointermove`, committing the final value into reactive state (and persisting to `localStorage`) only on drag-end — never bind width/height reactively to every `pointermove` event, which would force a full Vue re-render per pixel.

**SHELL-06 interaction (Moderate Pitfall 3):** clamp the sidebar's *effective* max width by remaining viewport space (e.g. `min(520px, viewport - minimum-editor-width)`) rather than inventing a new named breakpoint between the existing 760/1050/1650px vocabulary — the existing `--sidebar-width` breakpoint overrides at 761-1050px (248px) and ≥1650px (320px) (`styles.css:2271-2291` per ARCHITECTURE.md) become dead code once `useSash` writes a persisted/dragged inline custom property on the host element (which wins by CSS specificity over any stylesheet media query) — remove them as part of the token migration.

## Persistence — `localStorage` (SHELL-04)

**Confirmed: zero existing `localStorage`/`sessionStorage` usage anywhere in `src/web`** (grep across the whole directory tree returns no hits) — UI-SPEC's claim is accurate; there is no prior convention to extend, this is a genuinely new persistence mechanism for the project.

**Exact schema from UI-SPEC** (`model/panel-state.ts`, new file, mirrors the existing one-state-machine-per-concern convention of `selector-drift-state.ts`/`review-draft-state.ts`):
```json
{ "sidebarWidth": 264, "sidebarVisible": true, "panelHeight": 240 }
```
Key: `loopnote.workbench.v1`. Persisted: `sidebarWidth` (clamp 170-520), `sidebarVisible` (boolean), `panelHeight` (clamp 120-520). **Not persisted:** panel open/closed state — SHELL-03 explicitly requires the panel start closed every session. On load: any `JSON.parse` failure, wrong shape, non-numeric value, or out-of-range value for any field is replaced with its default (264/true/240) rather than rejecting the whole object — the key is then overwritten with the corrected value on next persist (debounced on drag-end/toggle), so a corrupt value self-heals on first interaction rather than persisting forever.

**Security Mistakes table cross-reference (PITFALLS.md):** keep this strictly UI-preference state, scoped per-browser/per-machine — never let this become a second persistence authority for review content, which must stay accepted-only from the server-returned canonical draft (PROJECT.md Key Decisions invariant). Do not share a route schema or storage key namespace with the draft store.

## Five-Session-Kind Matrix (SHELL-05)

The five kinds and where each is currently discriminated/tested:

| Kind | Discriminant (`IdentityHeader.vue`) | Existing packaged-binary e2e spec(s) |
|---|---|---|
| Committed branch/worktree (pinned range) | `else` branch (not exact-patch/standalone/uncommitted) — `'base' in session` | `tests/e2e/pinned-session.spec.ts` (packs+spawns `dist/bin/`, confirmed `mkdtempSync` + `extractedPackageRoot` pattern at lines 44-58), `tests/e2e/anchored-review.spec.ts` (single-pane added/deleted file comment flows, also packaged) |
| Exact patch | `isExactPatch` = `'patch' in session` | Coverage lives inside `tests/e2e/agent-ready-export.spec.ts`/`agent-ready-export-safety.spec.ts` (both in `custodyGatedSpecs`, run via `npm run test:runtime-artifact`) — **no standalone exact-patch-only browser spec exists today**; confirm during planning whether a new minimal exact-patch smoke fixture is needed or whether extending `pinned-session.spec.ts` with a patch fixture is cheaper |
| Staged/Unstaged/Working-tree (uncommitted) | `isUncommitted` = `uncommittedKey.value !== undefined && !isStandalone` | `tests/e2e/uncommitted-review.spec.ts` (packaged, `mkdtempSync(...'-uncommitted-pack-')`) |
| Standalone | `isStandalone` = `uncommittedKey.value?.sourceKind === 'standalone'` | `tests/e2e/standalone-review.spec.ts` (packaged, `mkdtempSync(...'-standalone-pack-')`) |
| Agent-attached | `attachedLifecycle` prop (`waiting`/`finishing`/`completed`/…) | `tests/e2e/agent-ready-export.spec.ts` (custody-gated, packaged) |

**SHELL-05's required deliverable** — "one packaged-binary e2e check per kind" — should extend/add assertions inside these five existing spec files (or add one new shared `tests/e2e/workbench-shell-smoke.spec.ts` that reuses their existing fixture/CLI-spawn helpers) rather than invent a sixth fixture mechanism. All five already use the pack-extract-spawn-`dist/bin/${binCommand}.mjs` pattern; the new assertions need only check: title bar renders the correct identity variant for that kind, Refresh is present/absent correctly (only uncommitted — `isUncommittedSession` — per `ActiveFileToolbar`/`IdentityHeader`'s existing `show-refresh` wiring; exact-patch explicitly shows "Exact patches cannot refresh" per `workbench-shell.md:32`), status-bar Export item is present/absent correctly (`exportSupported = !isUncommittedSession || isStandaloneSession`, an existing computed already wired at `App.vue:1448`), and the five-kind-specific empty/unavailable states still render.

## Packaged-Binary E2E Template

`tests/e2e/uncommitted-review.spec.ts` (and `pinned-session.spec.ts`, `standalone-review.spec.ts`, `anchored-review.spec.ts`) share one pattern, confirmed by direct read: `mkdtempSync(join(tmpdir(), '${slug}-...-pack-'))` → extract an `npm pack`'d tarball into `packedRoot/package` → `executablePath = join(extractedPackageRoot, 'dist/bin/${binCommand}.mjs')` → `spawn()` the CLI binary with a `createGitFixture()`-built temp repo as cwd → `page.goto()` the printed loopback URL → assert via `page.locator`/`getByRole`. These run under the **default** `playwright.config.ts` (`testIgnore: custodyGatedSpecs`), invoked by `npm run test:package` (`"playwright test"`). `agent-ready-export.spec.ts` uses the same packaged-binary shape but runs under `playwright.runtime-artifact.config.ts` (`npm run test:runtime-artifact`) because it's custody-gated (writes real export artifacts). `openRuntimeSession()` (`tests/helpers/open-runtime-session.ts:11-39`) is a shared helper already used across specs: navigates, waits for `/api/session` or `/api/support/refresh`, asserts `.diff-workspace__editor` visible, optionally dismisses the unverified-support dialog via `page.getByRole('button', { name: 'Not now' })` — reuse this helper for any new shared smoke spec rather than re-deriving the startup wait.

## Test Impact — Exact Locators to Update (A11Y-03)

Grepped directly against the live spec files (not inferred from ARCHITECTURE.md's prose):

**`tests/e2e/responsive-session.spec.ts`** (1401 lines, heaviest-impact file) — exact hits requiring updates:
- `page.locator('.review-toolbar')` (lines 440, 987, 1077) — `.review-toolbar` class disappears with `ReviewToolbar.vue`'s deletion
- `document.querySelectorAll('.review-toolbar__group')` (line 466)
- `page.getByRole('button', { name: width <= 760 ? 'Open files' : 'Hide files sidebar', exact: true })` (line 506) — desktop branch's accessible name changes once the toggle moves to the title bar (narrow-mode "Open files" stays, per UI-SPEC: "In narrow (`<760px`) viewports only, 'Open files' trigger button is kept")
- `page.getByRole('dialog', { name: 'Files', exact: true })` (lines 512, 546) — narrow-mode `ChangedFilesDialog` unchanged, these stay valid
- `page.locator('.session-header__comparison')` (line 815) — `.session-header` class disappears with `IdentityHeader.vue`
- `page.locator('.shell-footer__local-status')` / `.shell-footer__draft-status')` (lines 820-821) — `ShellFooter.vue` deleted, these exact strings have **no replacement home** per SHELL-01 — these two assertions must be deleted, not relocated
- `page.locator('.changed-files-sidebar')` (lines 1081, 1141, 1154, 1168, 1184, 1187, 1210, 1235, 1297, 1330) and `#changed-files` (lines 1168, 1184) — host class/id likely unchanged structurally (still the Teleport target), but verify against final `SideBar.vue` markup
- `page.locator('.session-header')` (lines 1145, 1210, 1260) and `.session-header__brand` (line 1260)
- `page.getByRole('button', { name: 'Hide files sidebar'/'Show files sidebar', exact: true })` (lines 1150, 1166, 1231, 1254) — accessible names should carry over to the new `sidebar` toggle if kept identical, but confirm against UI-SPEC's icon-button accessible-name contract

**`tests/e2e/review-notes-dialog.spec.ts`** (73 lines) — **full rewrite required**, not locator patching. This spec mounts `ReviewNotesDialog.vue` directly in an isolated Vite harness (not through `App.vue`) and asserts `page.getByRole('dialog', { name: 'Review notes' })` (line 65). Since this phase un-wraps the component from `ModalDialog` (`role="dialog"` → `role="region" aria-label="Review"`, no Esc-to-close, no focus trap), every assertion in this file (`dialog.getByRole('tab', ...)`, `dialog.getByRole('button', { name: 'Close review notes' })`, the Escape-closes-and-returns-count-0 expectation) targets behavior that no longer exists in this shape. Either rewrite this spec to mount the new `BottomPanel.vue` (or whatever hosts the un-wrapped body) in the same isolated-harness style, or fold its coverage into a new integration spec — this is the single highest-certainty test breakage in the phase.

**`tests/e2e/pinned-session.spec.ts`** — `.session-header` / `.session-header__comparison` (lines 356-357, 783, 862-863, 967, 991, 1261) — same `IdentityHeader.vue` deletion impact as above, lower volume (7 hits vs. responsive-session's 30).

**`tests/e2e/anchored-review.spec.ts`** — 1 hit: `.changed-files-sidebar` (line 357).

**`tests/integration/support-dialog.spec.ts`** — **low risk, confirmed by reading the file.** All assertions key on `page.getByRole('dialog')` (the `SupportDialog.vue` itself, untouched) and `page.getByRole('button', { name: 'Support ${displayName}' })` — the button's accessible name is preserved regardless of whether its host is the title bar or the status bar, so these locators likely survive unchanged; only `App.vue`'s `identityHeader.value?.focusSupport()` focus-return wiring (search confirms this is the only call site) needs its ref retargeted to wherever the Support trigger now lives (per CONTEXT.md, the status bar).

**`tests/integration/complete-review-panel.spec.ts`** — **zero DOM/Playwright risk.** This is a plain unit test of `review-draft-state.ts`'s state machine, no browser/page interaction at all — confirmed by reading the file (imports `createReviewDraftState` directly, calls its methods, asserts on the returned snapshot). Not actually affected by this phase despite appearing in ARCHITECTURE.md's "Review notes / bottom panel" test-impact table — that table groups it by *functional area*, not by actual locator risk.

**Recommendation:** follow the 18-05 precedent cited in PITFALLS.md exactly — grep every `getByRole`/`getByText`/`.locator('.class-name')` string across `tests/e2e/` and `tests/integration/` for each old class/accessible-name the moment it's renamed, update in the **same commit** as the markup change, then re-run the full Playwright suite once at the end of the phase (not per-file) to catch cross-spec reuse of the same selector string.

## Icon Inventory & Existing Patterns to Reuse

`src/web/components/ui/UiIcon.vue` currently has 13 names (confirmed via `v-else-if` chain): `previous-file`, `next-file`, `previous-change`, `next-change`, `open`, `check`, `warning`, `error`, `information`, `selected`, `lock`, `refresh`, `disabled`. Hand-drawn inline `stroke="currentColor"` SVG, `stroke-width: 1.5`, zero font loading, zero build step — this is the pattern new icon glyphs (sidebar toggle, panel toggle, `diff-split`/`diff-inline`, `markdown-source`/`markdown-preview`) must follow (add a new `v-else-if` arm per UI-SPEC's icon inventory, no new dependency, rejecting `@vscode/codicons` per STACK.md's visual-mismatch/3.5MB-unpacked analysis).

`src/web/components/ui/UiPrimitives.vue`'s `UiTooltip` (27 lines) — hover/focus-triggered `role="tooltip"` span, dismissed on `mouseleave`/`focusout`/Escape — already implements the "every icon-only action needs a tooltip with accessible name including its shortcut" pattern (`ReviewToolbar.vue:25,36,50,61` show the existing usage: `<UiTooltip :text="'Previous file · Alt+Shift+['">`). Reuse this component verbatim for every new icon-only action's tooltip; just update the shortcut text to the new bindings.

`FileTree.vue`'s roving-tabindex (`model/file-tree.ts`'s `tabbableRowId`/`focusRow`, consumed at `FileRow.vue:60,64` and `DirectoryRow.vue:55,58` via `:tabindex="tabbable ? 0 : -1"` + `@focus="emit('focusRow', rowId)"`) is **not modified this phase** (tree restyle is Phase 21) — noted here only because UI-SPEC's Focus Order section references the tree's "single roving-tabindex stop" as the side bar's sole tab stop; the shell phase must route its new skip-link ("Skip files") to focus this existing mechanism, not build a competing one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Icon glyphs | A second icon component or `@vscode/codicons` import | Extend `UiIcon.vue`'s existing `v-else-if` chain | Zero-dependency, visual-match guaranteed, already the project's only icon mechanism |
| Resizable sash drag | A generic multi-pane split library | `useSash.ts` composable (pointer events + `setPointerCapture`, ~60-80 lines) | Only two independent single-axis sashes needed, both fully specified by the sketch's own CSS; a generic library's nesting/unit API is unused overhead |
| Tooltip-with-shortcut | A new tooltip component | Existing `UiTooltip` (`UiPrimitives.vue`) | Already implements exactly the hover/focus/Escape contract every icon action needs |
| Popover positioning (if any lands this phase — likely deferred to Phase 22's identity popover) | `@floating-ui/vue` | Manual `getBoundingClientRect()` + outside-click/Escape listeners | Sketch's own popovers are fixed single-trigger `position:absolute`, no collision/flip logic needed |
| Tree virtualization | `@tanstack/vue-virtual` preemptively | Nothing — plain DOM, defer | Tree restyle is Phase 21's scope, not this phase's; 412 flat rows at 22px is within unvirtualized budgets per STACK.md's own measurement reasoning |
| Session-kind classification in any new component | A new/different discriminant shape | Copy `IdentityHeader.vue:29-39`'s `'patch' in session` / `'base' in session` / `uncommittedKey.value?.sourceKind` pattern exactly | Prevents Critical Pitfall 9 (silently dropping a session-kind branch) by reusing the one proven-correct discriminant instead of re-deriving a parallel one |

## Common Pitfalls

### Pitfall 1: App.vue decomposition silently drops a session-kind branch (CRITICAL)
**What goes wrong:** The shell holds five materially different behavior sets (committed: full Refresh-less comparison; exact-patch: immutable, "cannot refresh"; uncommitted: Refresh + reclassification; standalone: no Base/Head, single-pane; attached: server-authoritative Finish lifecycle). Decomposing the 1,467-line `App.vue` template into new components risks a plan/task listing only 3-4 kinds explicitly (the ones visible in the design sketch) and silently defaulting the rest, or a sibling plan assuming "deferred to sibling plan X" when X's actual scope never lists the item (exact pattern flagged in v2.0's retrospective).
**How to avoid:** Every new component that branches on session kind must use the exact `'patch' in session`/`'base' in session`/`uncommittedKey.value?.sourceKind` discriminant from `IdentityHeader.vue:29-39`. Before the phase closes, verify each of the five kinds explicitly against: title-bar identity variant, Refresh availability, status-bar Export-item enablement (`exportSupported` computed already exists at `App.vue:1448`), and the empty/unavailable-file copy.
**Warning signs:** A new component's session-kind `computed` has a different shape than `IdentityHeader.vue`'s; a plan's SUMMARY says "handled by sibling plan" without that sibling actually listing the item; exact-patch sessions showing an enabled Refresh control in manual testing.

### Pitfall 2: `verify:semantic-css` rejects any new geometry literal landed ahead of its token
**What goes wrong:** Writing a new component's CSS against `22px`/`264px`/etc. literals (or even a token name not yet added to `CANONICAL_TOKENS`) before the token-root step lands fails the build the moment it merges, since the gate runs `build:web` first and scans *all* compiled `.vue` output.
**How to avoid:** Land every new/renamed token into `styles.css :root` + `CANONICAL_TOKENS` + at least one real `var()` consumer in the same commit, before any dependent chrome component's CSS is written.

### Pitfall 3: Teleport-stranding regression in the new side-bar host
**What goes wrong:** Converting `#changed-files`'s `v-show` to `v-if` for the "hide sidebar" interaction (a natural-seeming choice when a region becomes "toggleable") permanently empties the file tree on next show, because Vue resolves a `Teleport`'s target once.
**How to avoid:** Keep the host `v-show`, exactly as it is today (`App.vue:1322`, with its explanatory comment). Toggle the sidebar's hidden state via CSS/`v-show` on the host, never `v-if`.

### Pitfall 4: Keyboard shortcut double-fire or silent shadowing between Monaco `addAction` and the document-level listener
**What goes wrong:** Registering the same logical shortcut (e.g. "next file") at both the Monaco `editor.addAction` layer and the global `document.addEventListener('keydown', handleKeydown)` layer without an explicit focus-context split causes either double-handling (both fire) or the keypress never reaching `document` (Monaco's internal keybinding service calls `preventDefault`/`stopPropagation` first).
**How to avoid:** One layer per focus context, documented explicitly: Monaco `addAction` handles the shortcut when focus is inside that editor instance; `handleKeydown`'s existing `instanceof HTMLTextAreaElement` early-return (`App.vue:926`) already naturally excludes Monaco-focused keypresses from the document listener today (Monaco's text input *is* a hidden textarea) — preserve that property rather than trying to make both layers independently idempotent.

### Pitfall 5: `ReviewNotesDialog` → `BottomPanel` un-wrap drops the `attachedLifecycle` watch-driven focus management
**What goes wrong:** `ReviewNotesDialog.vue:90-100` has two `watch()` calls that move focus to `completionAction`/`completionSuccess`/`completionFailure`/`failureAlert` refs on lifecycle transitions — these exist because the component is normally inside a modal where focus management matters for screen-reader users tracking state changes. Simply deleting the `ModalDialog` wrapper while keeping the inner markup verbatim (as UI-SPEC specifies) must **keep** these four `watch`-driven focus moves — they're not modal-specific, they're transition-announcement-specific, and the attached-session Finish lifecycle still needs them in a non-modal panel.
**How to avoid:** When un-wrapping, audit each of the 4 refs and 2 watchers at `ReviewNotesDialog.vue:82-100` individually — keep all of them, only remove the `ModalDialog`-specific `containFocus`/Esc/focus-trap/opener-restore logic that lived in `ModalDialog.vue` itself (which the new non-modal panel never had and doesn't need).

### Pitfall 6: Second live-region owner for drift/stale state
**What goes wrong:** Adding a fresh `aria-live` region to the relocated warning-stack strip, or to the new status-bar comment-count, duplicates the single existing announcement owner (`App.vue`'s `liveMessage`/`liveMessageVersion` pair at lines 96-97, rendered at line 1461-1463).
**How to avoid:** New chrome (status-bar counts, the relocated warning strip) reads the same computed flags purely for visual styling; only the existing `App.vue` `liveMessage` pipeline announces.

## Code Examples

### Monaco `addAction` for an override keybinding (verified pattern, `diff-adapter.ts:178-189`)
```typescript
// Source: src/web/monaco/diff-adapter.ts:178-189 (existing Alt+Enter registration, the pattern to copy)
this.originalEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.add-base-comment`,
  label: 'Add comment to base line',
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor('base'),
}),
```
New F7/⇧F7/⌥↑/⌥↓ registrations follow this exact shape on `originalEditor`, `modifiedEditor` (paired adapter) and `editor` (single-pane adapter), using `monaco.KeyCode.F7`, `monaco.KeyMod.Shift | monaco.KeyCode.F7`, `monaco.KeyMod.Alt | monaco.KeyCode.UpArrow`, `monaco.KeyMod.Alt | monaco.KeyCode.DownArrow`.

### `verify-semantic-css`'s exact consumer-detection regex (`scripts/verify-semantic-css.mjs:95-98`)
```javascript
// Source: scripts/verify-semantic-css.mjs:91-106
const referenced = new Set(sources.flatMap((source) => [
  ...source.matchAll(/var\(\s*(--[\w-]+)/g),
  ...source.matchAll(/\bcolor\(\s*['"](--[\w-]+)['"]\s*\)/g),
].map(([, name]) => name)));
```
Any new token needs a literal `var(--your-token-name)` (or the `color('--your-token-name')` form) somewhere in a `.vue`/`.css` file under `src/web/` (or `monaco/theme.ts`) to count as consumed.

### Teleport host — correct (`App.vue:1320-1322`)
```html
<!-- Source: src/web/App.vue:1320-1322 -->
<!-- v-show, not v-if: Teleport resolves `#changed-files` once, so destroying the host
     strands the teleported tree and the sidebar comes back empty. -->
<div v-show="!isNarrow && !filesCollapsed" id="changed-files" class="changed-files-sidebar"></div>
```

## Runtime State Inventory

*(This phase is not a rename/refactor/migration phase — this section is included for completeness per the role's trigger condition, which does not strictly apply, but the one genuinely new piece of runtime state introduced is documented below rather than omitted.)*

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database/datastore involvement this phase | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None — `dist/web` is regenerated by `npm run build:web` on every build, no stale-artifact risk | None |
| **New browser-local state (not a migration, a genuinely new mechanism)** | `localStorage['loopnote.workbench.v1']` — introduced fresh this phase, no prior value to migrate from | Code only: write the clamping/corrupt-value-tolerant load/save logic in `model/panel-state.ts` per the schema above; no server-side or existing-data migration needed since nothing currently writes this key |

## Open Questions

1. **Does SHELL-05's "one packaged-binary e2e check per kind" require a brand-new exact-patch-only spec file, or can coverage be added to an existing spec?**
   - What we know: `pinned-session.spec.ts`, `uncommitted-review.spec.ts`, `standalone-review.spec.ts`, `anchored-review.spec.ts` each already cover one or more non-exact-patch kinds with the packaged-binary pattern; exact-patch browser coverage today only exists inside the custody-gated `agent-ready-export*.spec.ts` files, which are oriented around the agent-attached/export-safety flow, not a general-purpose exact-patch shell smoke test.
   - What's unclear: whether reusing `agent-ready-export.spec.ts`'s existing exact-patch fixture setup for a new shell-smoke assertion is cheaper than building a minimal new exact-patch fixture inside `pinned-session.spec.ts` (which already has the pack/spawn boilerplate for the non-custody-gated config).
   - Recommendation: the planner should decide at task-breakdown time based on which existing fixture requires less new boilerplate; both are viable, this is an implementation-detail choice, not a design gap.

2. **(RESOLVED) NAV-01's inline/side-by-side toggle — is there an existing runtime switch point, or does it require new adapter-selection logic in `DiffWorkspace.vue`?** Resolved by 20-02 Task 1: `PublicMonacoDiffAdapter.setRenderSideBySide(value)` calls `this.diffEditor.updateOptions({ renderSideBySide: value })` — a live option update, no editor recreation (`diff-adapter.ts`, per 20-02-PLAN.md Task 1's `setRenderSideBySide` action).
   - What we know: `PublicMonacoDiffAdapter`'s `renderSideBySide: true` is set once at construction (`diff-adapter.ts:140`) with no confirmed runtime setter method found in the adapter class's public surface during this research pass (the file is 1044 lines; only the constructor region and the `addAction` sites were read in depth).
   - What's unclear: whether Monaco's `IDiffEditor` exposes a live `updateOptions({ renderSideBySide })` call that can flip the layout without recreating the editor, or whether toggling requires swapping between the paired adapter and a stacked/inline rendering mode entirely.
   - Recommendation: the planner should budget a dedicated read of the full `diff-adapter.ts` (and Monaco's `IDiffEditor.updateOptions` API surface) before writing the NAV-01 task, since this determines whether the toggle is a cheap `updateOptions` call or requires new adapter lifecycle logic. [ASSUMED: Monaco's `IDiffEditor.updateOptions()` does support live `renderSideBySide` toggling based on general Monaco API knowledge, not verified against this repo's pinned `monaco-editor@0.55.1` in this research pass.]

## Environment Availability

No new external tools, services, or runtimes are required by this phase — it is pure in-repo Vue/CSS/TypeScript/Monaco work on the already-confirmed-installed stack (Vue 3.5.39, Vite 8.1.4, Monaco 0.55.1, Playwright, all per `.planning/research/STACK.md`'s live `package.json` verification). Skipping this section's table per the "no external dependencies" skip condition.

## Validation Architecture

Skipped — `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`.

## Security Domain

`security_enforcement: true` in `.planning/config.json` — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface touched this phase |
| V3 Session Management | No | No session/token changes; loopback-token auth (`App.vue` `sessionToken`) is unchanged |
| V4 Access Control | No | No new routes or access boundaries |
| V5 Input Validation | Yes (narrow) | `localStorage['loopnote.workbench.v1']` is user-browser-controlled, untrusted input to the app on load — the clamping/corrupt-value-tolerant `JSON.parse` + range-check contract specified above (reject out-of-range/non-numeric/malformed, fall back to defaults) is the standard control; never `eval`/`Function`-construct the stored value |
| V6 Cryptography | No | No new crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/adversarial `localStorage` value causing a layout crash or XSS via unsanitized reflection | Tampering | Strict JSON-shape + numeric-range validation before use (as specified in "Persistence" above); never interpolate the stored value into `innerHTML` |
| New popovers/sashes using dynamic inline-style positioning triggering CSP `script-src 'self'` rejection | Denial of Service (build-time, not runtime) | Confirmed via `src/server/security.ts`: production CSP is `script-src 'self'` / `style-src 'self'` with `style-src-elem 'self' 'unsafe-inline'` already permitted (line 20) — inline `style` attributes (used for sash drag positioning) are already allowed by the existing `style-src-elem`/`style-src-attr 'unsafe-inline'` policy (lines 20-21); no CSP change needed as long as no new inline `<script>` is introduced |
| New persistence location becoming a second review-content authority | Tampering / Elevation of Privilege (data-integrity sense) | Keep `loopnote.workbench.v1` strictly UI-preference-only, never let it carry comment/summary/export data; the server-returned canonical draft remains the sole accepted authority (existing PROJECT.md invariant) |

## Sources

### Primary (HIGH confidence — direct repository reads this session)
- `src/web/App.vue` (full file read: lines 1-103, 898-950, 1239-1467) — session state, `handleKeydown`, full shell template region
- `src/web/components/IdentityHeader.vue` (full file) — five-session-kind discriminant pattern
- `src/web/components/ReviewToolbar.vue`, `ActiveFileToolbar.vue`, `ShellFooter.vue` (full files) — components being deleted
- `src/web/components/ChangedFilesDialog.vue`, `ui/ModalDialog.vue` (full files) — Teleport host contract, modal focus-trap mechanics
- `src/web/components/ReviewNotesDialog.vue` (lines 1-300 of 323) — attached-lifecycle watch/focus management to preserve
- `src/web/monaco/diff-adapter.ts` (lines 96-713 targeted) — both `addAction` registration sites
- `src/web/styles.css` (lines 1-173) — current `:root` token values
- `src/web/theme/token-contract.ts`, `scripts/css-token-contract.mjs` (CANONICAL_TOKENS array, parse/resolve functions), `scripts/verify-semantic-css.mjs` (full gate mechanics, lines 1-115, 379-420)
- `src/web/components/FileTree.vue` (full file) — roving-tabindex pattern, existing keyboard handler
- `src/web/components/ui/UiPrimitives.vue`, `UiIcon.vue` (grep) — tooltip and icon patterns
- `package.json` (scripts section) — exact `verify:semantic-css`/`typecheck:web`/`test:package`/`test:runtime-artifact` invocations
- `playwright.config.ts`, `playwright.runtime-artifact.config.ts` — custody-gated spec list, config split
- `tests/e2e/responsive-session.spec.ts`, `pinned-session.spec.ts`, `review-notes-dialog.spec.ts`, `anchored-review.spec.ts`, `uncommitted-review.spec.ts`, `standalone-review.spec.ts`, `tests/integration/complete-review-panel.spec.ts`, `support-dialog.spec.ts` (grepped + targeted reads) — exact locator strings and launch patterns
- `tests/helpers/open-runtime-session.ts` (full file) — shared startup-wait helper
- Full-text search across `src/web/` confirming zero existing `localStorage`/`role="separator"`/`setPointerCapture` usage
- `.planning/phases/20-shell-frame/20-CONTEXT.md`, `20-UI-SPEC.md` (full/near-full reads) — locked decisions and visual contract
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md`, `tokens-and-density.md` (full reads) — design source of truth
- `.planning/research/SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md` (full reads) — project-wide pre-phase research, HIGH confidence per that research's own self-rating (grounded in direct repo reads, live `npm view`/reproduction)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (full/near-full reads) — requirement text, prior decisions
- `.kimi-code/skills/spike-findings-loopnote/SKILL.md` — confirmed out of scope for this phase (covers CLI branch-discovery performance, unrelated to shell/Monaco/keyboard)

### Secondary (MEDIUM confidence)
- `[CITED: github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide]` — Monaco's own F7/Diff-Review-Pane default keybinding, cited via `.planning/research/STACK.md`'s synthesis, not independently re-fetched this session

### Tertiary (LOW confidence / flagged for planner verification)
- `[ASSUMED]` Monaco `IDiffEditor.updateOptions({ renderSideBySide })` live-toggle capability for NAV-01's inline/side-by-side action — not verified against the pinned `monaco-editor@0.55.1` API surface in this research pass (see Open Question 2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, directly confirmed by STACK.md's live `npm view` checks and this session's own `package.json` read; no package-legitimacy audit needed (no new packages)
- Architecture (component disposition, token gate mechanics, Teleport contract): HIGH — every claim traced to a specific file:line in this session's direct reads, not inferred from prior research alone
- Pitfalls: HIGH — all six pitfalls documented here are either directly observed in source (Teleport comment, `handleKeydown` guard) or cross-cited from the project's own PITFALLS.md, itself rated HIGH confidence by that research pass
- Test impact: HIGH for the 8 spec files directly grepped/read this session; MEDIUM for the claim that no other spec files reference shell-region locators (a full-repo grep was run across the named files, not an exhaustive scan of every `tests/` file)
- Open Question 2 (Monaco inline/side-by-side runtime toggle): LOW — flagged explicitly, needs a dedicated read before planning that specific task

**Research date:** 2026-11-04
**Valid until:** Stable for the duration of Phase 20 planning/execution — no externally-moving dependencies in scope; re-verify if `monaco-editor` or `vue-tsc` versions change before this phase executes

## Package Legitimacy Audit

Not applicable — this phase introduces **zero new npm dependencies** (confirmed: STACK.md's project-wide headline finding "add zero new runtime dependencies" applies in full to this specific phase's scope; icons/sashes/popovers/persistence are all plain Vue/CSS/`localStorage`/Monaco-API work on already-installed packages). No `package-legitimacy check` run needed.
