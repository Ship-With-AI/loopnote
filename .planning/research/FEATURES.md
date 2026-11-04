# Feature Research

**Domain:** Local-first code/artifact review workspace — VS Code-inspired desktop workbench shell (browser app launched from a CLI, not an extension host)
**Researched:** 2026-11-04
**Confidence:** HIGH (VS Code behaviour verified against official docs and `microsoft/vscode` source; GitHub/Gerrit behaviour verified against official docs; GitLab/diffmux/PRless context is MEDIUM — general knowledge, not independently re-verified this session)

**Scope note:** Design is already decided (sketches 001–004, `sketch-findings-loopnote` skill). This research does not re-litigate chosen directions — it grounds *why* each chosen behaviour matches reviewer expectations, flags complexity/dependencies for roadmap phasing, and surfaces gaps the sketches left open that the roadmap must resolve before or during implementation.

## Feature Landscape

### Table Stakes (Users Expect These)

#### Shell & identity

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 32px title bar with brand + centered comparison identity "pill" | VS Code's 1.76+ **command center** puts a centered, pill-shaped control (quick-open, now also comparison context in forks like Cursor/Positron) in the title bar instead of a second header row — see [Custom Layout § Command Center](https://code.visualstudio.com/docs/configure/custom-layout) and [User interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface). GitHub's PR header similarly pins base→head ref identity above the diff, not inline per file. | MEDIUM | Relocates existing `IdentityHeader.vue` logic (drift computation, popover data) from a persistent 78px band into a 32px bar + on-demand popover. Logic carries over; geometry and trigger surface are new. |
| Click-to-open details popover (Base/Head/Merge base/Snapshot/Worktree, Copy, Refresh) | VS Code's title-bar command center and Source Control input both use click-to-reveal popovers rather than permanent panels, keeping chrome at a fixed height regardless of content. GitHub's PR header shows a similar "base ↔ compare" dropdown. | MEDIUM | Sketch 002 (winner A) fully specifies content and copy for branches, staged, and exact-patch variants — see Gaps below for the **standalone** session, which the sketch's state tabs (Branches / Staged / Exact patch / Head drifted / Refreshing) do not cover. |
| Drift indicator on the pill (border + icon color change) that never steals diff height | VS Code reserves height-stealing notifications for true errors; ambient warnings (e.g. Source Control's incoming/outgoing badge) use color/badge changes on persistent chrome instead of banners. | LOW | Direct carry-over of existing drift detection (`selector-drift-state.ts`) with a new visual presentation only. |
| Resizable side bar (⌘B toggle, drag sash, double-click reset) containing only the changed-files tree | VS Code's **Primary Side Bar**: default 170–520px typical range, `⌘B`/`Ctrl+B` toggles visibility, drag resizes, and (per [User interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface)) can be toggled or moved — see also [Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout). | MEDIUM | Resizable sash with hover/drag affordance and persisted width is new; `FileTree.vue`'s tree model and keyboard roving-tabindex nav carry over unchanged. |
| No activity bar | VS Code's activity bar exists because it hosts *multiple* views (Explorer, Search, SCM, Debug, Extensions). A single-purpose workbench with one sidebar view has no reason to pay the 48px activity-bar cost — this is a deliberate simplification *past* VS Code's own default, validated by the sketch's own reasoning ("one view costs 48px for nothing"). | LOW | Removes nothing that exists today (Loopnote has no activity bar); confirms the shell should not add one. |
| 35px editor title bar: file name, M/A/D badge, `+N −N`, icon-only actions (prev/next change, prev/next file, inline/side-by-side, comment nav) | VS Code's editor title area hosts per-editor actions as icon buttons with tooltips (not labeled buttons); diff editors add inline/side-by-side and navigation actions here. | MEDIUM | Existing `ActiveFileToolbar.vue` already renders most of this *as labeled buttons*; the work is visual/density conversion to icon-only + tooltip, not new logic, **except** file-nav keybinding (see below) and comment nav (new, depends on inline threads). |
| Breadcrumbs bar (24px) showing path segments (`src › server › file.ts`) | VS Code's breadcrumbs bar sits between editor title and content, toggleable via **View: Toggle Breadcrumbs**, and is one of VS Code's most recognizable "I'm in a real workbench" signals ([User interface § Breadcrumbs](https://code.visualstudio.com/docs/editing/getting-started/userinterface)). | SMALL–MEDIUM | New component; can reuse path-segment splitting already used by `PathDisplay.vue`/`PathText.vue`. No click-to-navigate-ancestor-folder requirement exists today (VS Code's breadcrumbs open a dropdown per segment) — decide whether Loopnote's breadcrumbs are interactive or purely orientational; sketch doesn't specify. |
| Change navigation: **F7 next change, ⇧F7 previous change** | VS Code's diff editor has shipped exactly this since the 2017 "Diff review pane" feature: *"Navigate Diff editor changes quickly with F7"* ([VS Code 1.14 release notes](https://code.visualstudio.com/updates/v1_14); renamed "Accessible Diff Viewer" in [1.81](https://code.visualstudio.com/updates/v1_81), keybinding unchanged). | NONE | **Already implemented** in `App.vue`'s `handleKeydown` (`event.key === 'F7'`) and `DiffWorkspace.vue`'s `nextChange()`/`previousChange()`. No new behaviour — only needs its icon exposed in the restyled editor title. |
| File navigation: **⌥↑ / ⌥↓ (Alt+Up/Down)** | Sketch chooses VS Code's generic "move between items" chord pattern for prev/next file, consistent with VS Code's own `editor.action.moveLinesUpAction`/`DownAction` key shape (`Alt+Up`/`Alt+Down`) reused across many "move to adjacent item" commands. | SMALL | **Rebind, not build**: `App.vue` currently binds file nav to `Alt+Shift+[` / `Alt+Shift+]`. Changing to `⌥↑`/`⌥↓` is a one-line key-matcher change, but must not collide with the editor's own `Alt+Up`/`Alt+Down` (move-line) when focus is inside Monaco — needs an explicit `when`-style focus guard, mirroring how VS Code scopes `editor.action.moveLinesUpAction` to editor focus only. |
| Bottom panel (Comments / Summary / Export tabs), **closed while reading**, ⌘J toggle | VS Code's **Panel** area defaults to closed-ish/collapsed state in many layouts and is explicitly `⌘J`/`Ctrl+J`-toggleable; it hosts Terminal/Problems/Output/Debug Console as tabs exactly like the sketch's Comments/Summary/Export tabs ([User interface § Basic layout](https://code.visualstudio.com/docs/editing/getting-started/userinterface)). | LARGE | This replaces the modal `ReviewNotesDialog.vue` (currently a `ModalDialog`) with a persistent, resizable, closed-by-default panel region — a structural shell change, not a restyle. Comments/Summary/Export *content* (readiness, stale gate, receipt, save-indicator) carries over from existing components; the *container* is new. |
| 22px status bar: snapshot identity, open/stale comment counts, viewed count, Export entry point, voluntary-support item | VS Code's status bar is a fixed 22px row of small, quiet, click-to-act items (branch name, errors/warnings, language mode, etc.) — never a second toolbar ([User interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface)). | MEDIUM | Comment counts are a straightforward aggregation of existing draft state. **Viewed count requires a new backend-persisted field** (see Gaps/Dependencies — tracked as v1.6 `DEFER-01`, not yet built). Support item is a relocation of the existing `SupportDialog.vue` trigger (see Gap below for exact placement). |
| Toolbar groups reachable by role and name (ARIA `role="group"` + accessible name) | Matches WAI-ARIA toolbar-grouping conventions that `getByRole('group', { name })` testing relies on; this is explicitly Loopnote's own accepted debt (DEBT-01), not a new VS Code-derived requirement. | SMALL | `ReviewToolbar.vue`'s three `aria-label`-only containers (`Diff navigation`, `File navigation`, `Change navigation`) need `role="group"`. Naturally falls out of rebuilding the editor-title toolbar for this milestone — closing it alongside is low marginal cost. |

#### Changed-files tree

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 22px flat rows, no card radius, hover/selection via background not shadow | VS Code's Explorer and every other tree view in the product use flat 22px rows; this is the single most recognizable "VS Code density" signal, documented implicitly throughout [User interface § Explorer view](https://code.visualstudio.com/docs/editing/getting-started/userinterface) and visible in every VS Code screenshot. | SMALL | Pure CSS restyle of `FileRow.vue`/`DirectoryRow.vue`; row structure and data model are unchanged. |
| Compact (single-child-chain-collapsing) folders | VS Code shipped **Compact Folders** in [November 2019 (v1.41)](https://code.visualstudio.com/updates/v1_41) — chains like `src/vs/base` with no sibling files collapse onto one row — and refined their accessibility narration in [v1.50](https://www.infoworld.com/article/2257702/whats-new-in-microsoft-visual-studio-code-150.html) ("compact folders in the File Explorer now properly narrate expanded/collapsed"). Configurable via `explorer.compactFolders`. | MEDIUM | New tree-flattening logic; `file-tree.ts` builds a full hierarchical model today but has no single-child-chain collapsing. Must preserve existing expand/filter/selection-identity-survives-reflow guarantees recorded in PROJECT.md Context. |
| Right-aligned M/A/D status letter (never color-only) | WCAG 1.4.1 (don't convey info by color alone) plus VS Code's own SCM decorations always pair a letter/badge with color. Loopnote's own DESIGN.md already states "Status never color-only." | NONE | Already Loopnote policy and already implemented (`FileRow.vue` renders the letter); only the column position/width changes to match the 22px row. |
| Comment badges + hover-only `+N −N` counts | GitHub's Files Changed tab shows comment counts per file and an additions/deletions summary per file; VS Code's SCM view shows per-file change counts only on hover/selection in dense modes, which is exactly what the sketch adopts to avoid row noise at scale. | SMALL | Carries existing per-file comment/line-count aggregation; "hover-or-selected" visibility is a CSS/state change, not new data. |
| Path filter (funnel-triggered, highlight vs. filter modes) | VS Code's Explorer **Find/Filter** (`⌥⌘F` / `Ctrl+Alt+F`) toggles between *highlighting* matches (badges show which folders contain a match) and *filtering* the tree to matches only — documented in [User interface § Advanced tree navigation](https://code.visualstudio.com/docs/editing/getting-started/userinterface). | SMALL–MEDIUM | Loopnote already has a working substring filter (`query`/`updateQuery` in `FileTree.vue`) but it is an **always-visible** input box — the sketch explicitly lists "inline search box always visible" as something to *stop* doing. Work is: hide behind a funnel toggle, add match highlighting (new), keep existing substring matching logic. Full two-mode (highlight vs. filter) parity with VS Code is a stretch; plain substring-filter-only satisfies table stakes. |
| View options menu (counts always/hover/never; comment badges on/off; viewed marks on/off) | VS Code's tree "..." view-header menu (e.g., Timeline's **Sort By**, Outline's display toggles) is the standard place for list-display preferences that don't warrant a settings page. | SMALL | New menu component; each toggle controls an existing or soon-to-exist data source except "viewed marks," which depends on the new viewed-tracking field (see Gaps). |
| Footer totals (file/comment counts) | GitHub's PR header progress bar ("X of Y files viewed") and footer summary rows in VS Code's Source Control view (staged/unstaged counts) both establish footer/header aggregate counts as expected orientation, especially at scale (sketch notes 412 files tested visually). | SMALL | New footer row; data is a simple aggregation over the existing file list. |
| Keyboard tree navigation (arrows, type-ahead, Enter to open) | Already implemented (`role="tree"`/`role="treeitem"`, `handleKeydown`, roving tabindex — PROJECT.md records a "roving-tabindex defect" was fixed, confirming this exists and is tested). Matches [ARIA Authoring Practices tree pattern](https://code.visualstudio.com/docs/editing/getting-started/userinterface) VS Code itself follows. | NONE | Carries over; must survive the compact-folder flattening and the 22px row conversion without regressing existing e2e coverage. |
| List ⇄ tree view toggle (flat list, dimmed parent dir, matching VS Code's Source Control list mode) | VS Code's Source Control view defaults to a flat list (`name` + dimmed `dir`) as an alternative to the Explorer's nested tree — both are first-class, user-toggleable view modes. | SMALL–MEDIUM | New alternate render path reusing the existing flat file array (no second data model needed — tree is already derived from a flat list per `file-tree.ts`). |

#### Inline comment threads

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Thread renders as a Monaco view zone directly under the anchored line, with an equal-height empty zone on the opposite side to keep Base/Head aligned | This is VS Code's own extension-facing comment model: `vscode.CommentThread` widgets render inline under the commented range via the editor's zone-widget mechanism (see [`CommentController` API](https://vscode-api.netlify.app/interfaces/vscode.commentcontroller) and `microsoft/vscode`'s `commentThreadZoneWidget.ts`). | LARGE | `diff-adapter.ts` already creates/removes view zones for the composer via `changeViewZones` — the mechanism is proven in this codebase. The **new** risk, flagged explicitly by the sketch itself, is that "view-zone DOM does not receive pointer events reliably," requiring an overlay/content-widget positioned over the zone for interactive controls (reply textarea, resolve/delete buttons). This is the single highest-risk UI mechanism in the milestone. |
| Open / Resolved / Anchor-moved state chips | GitHub PRs: open vs. resolved (collapsed, muted) conversation threads. Gerrit: per-comment **Resolved** checkbox plus draft/published distinction ([Gerrit Review UI docs](https://gerrit-review.googlesource.com/Documentation/user-review-ui.html)). "Anchor-moved" (stale) is Loopnote-specific — it has no VS Code or GitHub analogue because those tools don't do durable-anchor drift detection; it is a genuine differentiator layered on a familiar open/resolved pattern. | MEDIUM | **Backend states already exist for open/resolved** — `DraftMutationRequestSchema` in `src/contracts/api.ts` already has `resolveComment`/`reopenComment`/`deleteComment`/`editComment` request types and comments carry `state: 'open' \| 'resolved'`. "Anchor-moved" is a *derived* presentation state (compare the durable anchor to current line mapping), not a third server-side comment state — confirm this stays a client-side classification rather than inventing a third persisted state. |
| Resolve / reopen / delete / reply actions on a thread | Table stakes for *any* review tool with resolvable comments (GitHub, GitLab, Gerrit, Bitbucket) — and specifically **restoring previously-shipped Loopnote behaviour**: quick task `260915-jbv` removed the UI for these exact actions on 2026-09-15 while leaving the API intact. | MEDIUM | This is a UI reconnection project, not new product behaviour: `sessionClient.mutate()` already accepts `resolveComment`/`reopenComment`/`deleteComment`/`editComment`; `App.vue`'s `mutateReview()` dispatch plumbing is generic and type-safe already. Complexity is MEDIUM only because of the interactive-view-zone-overlay risk above, not the mutation wiring. |
| Expanded-by-default threads with session-scoped "Collapse all" | GitHub keeps unresolved review comments expanded by default on the Files Changed tab; VS Code's Comments panel defaults threads collapsed but the *editor-inline* widget is expanded when focused. Loopnote's choice (expanded while reading, collapse-all as an explicit session action) matches the GitHub review-reading pattern more than VS Code's panel-browsing pattern — appropriate given diffs, not a notification feed, are the product's focus. | SMALL | New `collapsed` UI state per thread, default `false`, session-only (not persisted) — low complexity once the view-zone mechanism exists. |
| Resolved threads start collapsed | Matches GitHub (resolved threads auto-collapse) and reduces noise from threads no longer needing attention — this is explicitly decided in the sketch ("Resolved threads start collapsed"), unlike the open/collapsed starting state, which is explicitly undecided (see Gaps). | NONE (once above exists) | |
| Hover-gutter `+` affordance to start a new comment | Already shipped (quick task `260915-jbv` left comment *creation* intact) — GitHub and VS Code's `commentingRangeDecorator` both use a hover-revealed `+` glyph in the gutter as the universal "comment here" affordance. | NONE | Visual restyle only (16px chip, `--interactive-accent-emphasis`) of an existing interaction. |
| Cross-file thread navigation: **⌥F9 next thread, ⇧⌥F9 previous thread** | **Exact match to VS Code's own default keybinding**, verified directly in `microsoft/vscode` source: `CommentCommandId.NextThread` → `primary: KeyMod.Alt \| KeyCode.F9`, `CommentCommandId.PreviousThread` → `primary: KeyMod.Shift \| KeyMod.Alt \| KeyCode.F9` ([`commentsEditorContribution.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/comments/browser/commentsEditorContribution.ts)). This is as close to a "VS Code-inspired, not clone" exception as the sketch makes — it's identical to VS Code because reviewers already carry this muscle memory. | MEDIUM | New capability (no equivalent exists today); depends on inline threads existing and on a stable cross-file ordering (tree order, per the sketch). Also note VS Code ships **Alt+F10 / Shift+Alt+F10** for "next/previous commented **range**" (lines eligible for commenting, not existing threads) — out of scope here but worth knowing the distinction exists in the reference product. |

#### Review panel & export

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Comments tab: grouped-by-file list, click row → open file, expand thread, scroll into view, flash focus outline | VS Code's own **Comments panel** (`workbench.panel.comments`) aggregates all threads across files in exactly this grouped, click-to-reveal structure — it is the panel-side counterpart to the inline widgets. | SMALL–MEDIUM | Existing `comment-groups.ts` already produces `CommentGroup`/`CommentGroupSections` keyed by state — this is close to the data shape needed; work is primarily a new list view plus the reveal/scroll/flash interaction (reuses patterns from existing `revealComment` in `DiffWorkspace.vue`). |
| Summary tab: full-height Markdown textarea with debounced save indicator | Already shipped (`SummarySection.vue` — "Saving…" → "✓ Saved" pattern exists today, per PROJECT.md "comment persists draft, still appear in exports"). | NONE | Pure relocation into the panel container; no logic changes. |
| Export tab: readiness checklist → stale-anchor acknowledgement gate → write progress → receipt | GitHub's "Ready to merge" / review-submission checklist pattern (reviewed/approved state, required checks) and Gerrit's "Reply" flow (must resolve before Submit in many configs) both establish a pre-flight checklist before a review action completes. | NONE–SMALL | All four stages already exist as components: `ExportReadinessSummary.vue`, `DriftExportAcknowledgement.vue`, `ExportProgress.vue`, `ExportReceipt.vue`. This is a relocation into the new panel tab, not new product logic — lowest-risk item in the whole milestone. |
| Export readiness never silently gates on stale/orphaned anchors — explicit acknowledgement required | Matches Loopnote's own Key Decision: "Keep durable anchors immutable and classify mismatch instead of relocating... stale and orphaned records retain exact recorded evidence and never move silently." Not a VS Code pattern (VS Code has no anchor-drift concept) — this is Loopnote's differentiator, carried forward unchanged. | NONE | Already implemented; only the container moves. |
| Panel opens via ⌘J, title-bar toggle, status-bar comment count, and status-bar Export item (four entry points, one destination) | VS Code's panel similarly has multiple triggers (keybinding, View menu, status bar language/error clicks sometimes focus Problems) converging on one panel region — multiple low-friction entry points to the same destination is standard VS Code UX. | SMALL | Each trigger dispatches to the same `openPanel('comments' \| 'summary' \| 'export')` call — straightforward once the panel container exists. |

#### Accessibility

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Toolbar groups queryable by `role="group"` + accessible name | WAI-ARIA toolbar pattern; closes Loopnote's own DEBT-01. | SMALL | See Shell & identity table above — same item, listed once. |
| Single live-region owner per dynamic state transition | Already an established Loopnote pattern/Key Decision ("Give each dynamic recovery and selector-copy outcome one authoritative live-region owner") — new panel/thread/popover transitions must follow the same rule, not invent a second announcement path. | SMALL (per surface) | Discipline/consistency item more than a feature: every new dynamic surface (popover open, panel tab switch, thread resolve, refresh toast) needs exactly one `aria-live` owner, matching the existing pattern audited in Phase 04.1. |
| Keyboard-operable popovers/overlays with Esc-to-close and focus return | Standard modal/popover accessibility (WAI-ARIA APG Dialog pattern); VS Code's own popovers (Quick Open, Command Center dropdown) follow this. | SMALL | New popovers (identity pill details, view-options menu) must follow the same focus-trap/return pattern `ModalDialog.vue` and `SupportDialog.vue` already use — reuse, don't reinvent. |
| Icon-only buttons carry `title`/accessible name that includes the shortcut | VS Code's own tooltip convention (hovering any toolbar icon shows the command name *and* its keybinding). Sketch explicitly states this requirement. | SMALL | Mechanical but must not be skipped — every converted labeled-button → icon-button needs an accessible-name audit, not just a visual pass. |
| View-zone comment widgets remain operable via keyboard (not just hover/click) | WCAG 2.1.1 (keyboard operable) — the interactive-overlay risk flagged above for inline threads has an accessibility dimension too: content widgets layered over view zones must stay in the tab order and support the documented Esc/⌘Enter/F9-family shortcuts, not just mouse hover. | MEDIUM | Rolls into the LARGE inline-thread item above; called out separately because it's easy to ship a mouse-only interactive overlay by accident. |

#### Design contract

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Workbench geometry tokens (22px rows, 264px side bar, 4px radius, 20px code line-height, etc.) layered over unchanged color roles | Standard design-system practice: separate density/geometry tokens from color/semantic tokens so a visual-density change doesn't require a second accessibility/contrast audit. `tokens-and-density.md` already provides the full old→new token table. | SMALL (mechanical) | Token-only change; no new contrast math needed since colors are explicitly unchanged — avoids re-triggering DEFER-04 (contrast re-verification) scope. |
| `DESIGN.md` § Composition and § Geometry rewritten to describe the workbench (title bar is new top boundary; no persistent review rail) | Loopnote's own evolution contract requires `DESIGN.md` to describe shipped reality (PROJECT.md § Evolution: "Is 'What This Is' still accurate? Update it if reality drifted."). The sketch's own Open Questions flags this explicitly as unresolved. | SMALL | Documentation task, but has a real dependency: can't be finalized until the shell/tree/thread/panel decisions above are actually implemented (or at minimum frozen), since DESIGN.md should describe shipped behaviour, not aspiration. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Durable, drift-detectable comment anchors with explicit "Anchor-moved" state and export-blocking acknowledgement | Neither VS Code (no review-anchor concept) nor GitHub/GitLab/Gerrit (anchors silently follow blame/diff context, or simply orphan without surfacing it to the *exporting* reviewer) make stale-anchor acknowledgement a first-class, export-gating step. This is Loopnote's core "precise, drift-detectable feedback agent can act on" value proposition, now expressed through VS Code-familiar chip/state vocabulary instead of a bespoke one. | Already built | Carried into the workbench, not re-researched; the only new work is visual (state chip, amber gate checkbox). |
| Canonical JSON + generated Markdown dual export with receipt and "Copy agent prompt" | diffmux/PRless (both cited in `.claude/CLAUDE.md` as local agent-review precedents) ground review in local diffs but don't define a dual canonical+human export contract with a receipt step; most PR tools export nothing machine-readable at all. | Already built | Pure relocation into the Export tab. |
| Title-bar comparison identity that encodes five distinct session kinds (branches, staged, unstaged, working-tree, exact patch) in one pill + popover, including "cannot refresh" framing for frozen exact-patch sessions | GitHub/GitLab/Gerrit's header identity only ever expresses "this ref vs. that ref" — none of them have an uncommitted-snapshot-with-explicit-Refresh model or an immutable-exact-patch model to express. This is a genuine differentiator requiring more states than any reference product's header. | MEDIUM | Sketch 002 covers 5 of Loopnote's session kinds in its state tabs; **does not cover "standalone"** (named files/globs, no head ref at all) — see Gaps. |
| Agent stdin protocol + "Finish attached review" one-shot delivery, now living inside a reading-first shell instead of a modal that blocks reading | No reference review tool in this research (VS Code, GitHub, GitLab, Gerrit, diffmux, PRless) has a "hand this review back to the requesting coding agent" concept at all — this is Loopnote-unique. The question the milestone must answer is *where* the Finish action lives now that both the dedicated rail and the "Finish overlay that blocks reading" were explicitly rejected (see Gaps). | Already built (needs new placement) | Logic/contract unchanged; UI placement is unresolved — flagged below. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Activity bar with multiple icon-switchable views | "VS Code has one, so we should too" — surface-level parity impulse. | Loopnote has exactly one sidebar view (changed files). An activity bar for one view is 48px of permanent chrome with zero navigational value — directly contradicts the milestone's "diff gets nearly all the space" goal. | No activity bar; side bar toggle lives in the title bar (⌘B / icon) as sketch 001 (winner S2) specifies. |
| Dedicated "Review" view in the side bar duplicating the Comments tab (sketch 004 B, explicitly rejected) | Seems natural to put review state next to file navigation. | At 264px it's too narrow for comments/summary/export to be legible, and it *doubles* review content across two surfaces that can drift out of sync (which comment list is authoritative?). | Single source of truth: bottom panel's Comments tab; side bar stays files-only. |
| "Finish review" modal overlay that covers the diff until the agent handoff completes (sketch 004 C, explicitly rejected) | Mirrors GitHub's "Review changes" submission dialog, which *is* a blocking modal in the reference product. | The sketch's own evaluation says it outright: "Reading and finishing should coexist" — for an agent-handoff flow that may need a final read-through, blocking the diff is actively counterproductive to the product's reading-first goal. | Finish action surfaces inline in the Export tab / status bar without blocking diff access (exact placement is an open gap, see below). |
| Identity band as a tall persistent header (current 78px `IdentityHeader.vue`), identity in the breadcrumb, or identity as status-bar segments (sketches 002 B/C, explicitly rejected) | Each is a plausible-looking place to put "what am I comparing" info. | Tall header steals height from the diff permanently; breadcrumb placement makes drift notices steal diff height *and* scrolls identity out of view as you scroll the file path context; status-bar placement reads as incidental and still needed a toast for drift (defeating the "never steals height" goal). | Title-bar pill + popover (sketch 002 A) — height-neutral in all states including drift. |
| Always-visible line-count columns on every tree row | GitHub shows `+N −N` inline per file row without a hover requirement, so it feels like the obvious default. | At scale (412-file changes, the sketch's own stress case) constant numeric columns are pure noise for files the reviewer isn't currently looking at — directly works against the Explorer-density goal. | Hover-or-selected visibility by default, with an explicit "always on" view-option for reviewers who want GitHub's behaviour. |
| Status-color-only indication of file M/A/D state | Visually "cleaner" without a letter column. | WCAG 1.4.1 violation; also directly contradicts Loopnote's own DESIGN.md rule already in force. | Keep the letter (and line-through for deleted) always, regardless of color. |
| A VS Code-blue-styled status bar, or more than one "emphasized" status-bar item | Closer visual parity to real VS Code. | Loopnote's product identity is its own dark palette (DESIGN.md § Color); a blue status bar reads as "we're pretending to be VS Code" rather than "VS Code-inspired." Multiple emphasized items also defeats the "one primary next action" signal the status bar is supposed to give. | Status-bar surface matches the side-bar surface token; at most one item uses the accent-emphasis background, reserved for the single most relevant next action. |

## Feature Dependencies

```
[Workbench geometry tokens] ──required-by──> [Changed-files tree restyle]
                                ──required-by──> [Editor title restyle]
                                ──required-by──> [Bottom panel container]
                                ──required-by──> [Status bar]

[Bottom panel container] ──required-by──> [Comments tab]
                           ──required-by──> [Summary tab] (relocation only)
                           ──required-by──> [Export tab] (relocation only)

[Inline comment thread view-zone overlay] ──required-by──> [Resolve/reopen/delete/reply UI]
                                            ──required-by──> [Cross-file thread nav (⌥F9/⇧⌥F9)]
                                            ──enhances──> [Comments tab] (click-to-reveal needs a thread to reveal)

[Existing resolveComment/reopenComment/deleteComment/editComment API] ──required-by──> [Resolve/reopen/delete/reply UI]
  (already shipped server-side; no backend work needed for this part)

[New persisted "viewed" draft field (DEFER-01)] ──required-by──> [Status-bar viewed count]
                                                  ──required-by──> [Tree view-option: viewed marks]
                                                  ──required-by──> [Per-file "mark viewed" affordance]

[Title-bar identity pill + popover] ──enhances──> [Drift indicator] (same data, new surface)

[Editor title restyle] ──required-by──> [DEBT-01 toolbar role/name fix] (same surface being rebuilt; bundle them)

[Decision: Markdown preview toggle placement] ──required-by──> [Editor title final icon set] (currently unresolved — see Gaps)
[Decision: standalone-session pill variant] ──required-by──> [Title-bar identity pill final spec] (currently unresolved — see Gaps)
[Decision: Finish-attached-review placement] ──required-by──> [Status bar / Export tab final spec] (currently unresolved — see Gaps)
[Decision: support entry point] ──required-by──> [Status bar final spec] (currently unresolved — see Gaps)

[.vue TypeScript/vue-tsc pairing decision] ──independent-of──> all of the above
  (infra decision; earlier is lower-risk since every component above gets touched or rebuilt this milestone)
```

### Dependency Notes

- **Geometry tokens gate almost everything:** every visual surface in this milestone consumes the new density tokens (`tokens-and-density.md`), so landing the token table first (even before the shell structure) lets tree/editor-title/panel/status-bar work proceed in parallel without a second restyle pass.
- **View-zone interactive overlay is the critical-path risk:** both "resolve/reopen/delete/reply" and "cross-file thread navigation" depend on solving pointer-event delivery inside a Monaco view zone. This should be spiked early — it's the one piece of this milestone without a direct precedent already proven in this codebase (the *composer* uses the same view-zone mechanism today, but is not yet known to handle reply/resolve/delete button interactions reliably inside it).
- **"Viewed" tracking is a backend feature wearing a UI costume:** the status bar's "viewed count" and the tree's "viewed marks" view-option both require a new field in the persisted draft schema (Zod contract, draft storage version, mutation endpoint) — this is **not** pure frontend work, and per Loopnote's own versioned-JSON persistence model, a schema change needs the same migration discipline as any other draft field. Sequence it as its own unit of work, not a styling detail of the status bar.
- **Resolve/reopen/delete/reply is UI-only work:** unlike "viewed," the backend contract (`resolveComment`, `reopenComment`, `deleteComment`, `editComment` in `DraftMutationRequestSchema`) already exists and was exercised in production before quick task `260915-jbv` removed its UI. This significantly de-risks that item relative to its LARGE/MEDIUM complexity rating, which stems from the view-zone overlay problem, not from unknown backend behaviour.
- **DEBT-01 should ride along with the editor-title rebuild**, not be scheduled separately — the three containers needing `role="group"` (`Diff navigation`, `File navigation`, `Change navigation`) are being visually rebuilt anyway.
- **`.vue` typechecking is organizationally independent** but practically urgent: since this milestone touches/rebuilds nearly every `.vue` component in `src/web/`, doing the TypeScript/vue-tsc pairing decision (DEBT item, TS 7.0.2 / vue-tsc 3.3.7 `ERR_PACKAGE_PATH_NOT_EXPORTED`) **before** most of that churn lands catches type errors in new code instead of requiring a second pass later. (Version-pairing recommendation itself is StackResearch's scope, not this document's.)

## Sketch Gaps Requiring Product Decisions

These are not omissions in this research — they are gaps the sketches themselves left open (confirmed by direct inspection of `sketch-findings-loopnote`'s `findings_index` "Open Questions" and by reading the sketch HTML/README sources). The roadmap should resolve each explicitly rather than let an implementer improvise mid-phase:

1. **Standalone session identity.** Sketch 002's state tabs cover Branches, Staged, Exact patch, Head drifted, and Refreshing — but not **Standalone** (named files/globs reviewed outside any diff, no Base/Head comparison at all per PROJECT.md § Out of Scope boundary notes). The title-bar pill's whole design is built around "Base → Head"; a standalone session has neither. Needs an explicit pill variant (e.g., `[file icon] Reviewing N files` with no arrow) before implementation.
2. **"Finish attached review" placement.** The sketches explored and *rejected* a Finish overlay (004 C: "A modal hides comments until the end and covers the diff. Reading and finishing should coexist.") but the winning variant (004 A, inline + bottom panel) never says where Finish actually lives instead. Given `App.vue`'s existing `attachedFinishReady`/`finishAttachedReview` logic and the Export tab's existing readiness-checklist pattern, the Export tab is the natural home — but this is an inference, not a sketch decision, and must be confirmed (including how it reads for non-attached, ordinary sessions where no Finish action exists at all).
3. **Markdown rendered-preview toggle placement.** The existing Source/Rendered toggle (`ActiveFileToolbar.vue`) has no stated home in the new icon-only editor title's action list (prev/next change, prev/next file, inline/side-by-side, comment nav). It must be placed — most likely as a third icon-only toggle alongside inline/side-by-side — but the sketches don't show it.
4. **Voluntary-support entry point.** Explicitly listed as unresolved in the sketch's own Open Questions ("status bar or title-bar menu"). Given the status bar's design intent ("only one item may use the emphasized background, only when primary next action"), a support item competes with Export for that one emphasized slot — needs a decision on whether support ever gets the emphasized treatment or stays a plain status-bar entry.
5. **Open-thread default collapse state while reading.** Sketch 004's own findings say "Whether open threads start expanded or collapsed while reading still undecided; both states in sketch." Resolved threads collapsing by default is decided; open threads are not.
6. **Narrow/phone layout for the new shell.** Sketch's Open Questions explicitly defer this ("the side-by-side diff below ~760px is unresolved"); PROJECT.md's scope decision accepts desktop-only regression as debt below 1050px — consistent, but confirms no narrow-width work should be attempted this milestone beyond "don't crash."
7. **Tree virtualization at scale.** 412 files were "scanned visually, not performance-tested" per the sketch's own caveat. If Loopnote's real-world changesets regularly exceed what an unvirtualized 22px-row tree can render smoothly, this becomes a late-discovered performance bug rather than a planned feature — worth a deliberate go/no-go check against realistic fixture sizes early in implementation.
8. **Error/unavailable-file state placement in the new editor title/breadcrumb chrome.** The existing "Diff unavailable" / "changed during capture" messaging (`ErrorState.vue`, `FileRow.vue`'s `unsupported`/`unavailable` availability reasons) has no stated treatment in the new 35px editor title + 24px breadcrumb stack — confirm it still renders (likely replacing the diff canvas below an otherwise-normal title/breadcrumb bar) rather than being silently dropped.

## MVP Definition

### Launch With (v2.1)

Everything in the milestone's stated target features is launch-scope by definition (this is a planned milestone, not an exploratory MVP) — the ordering below reflects what the dependency graph requires to land first, not optionality:

- [ ] Workbench geometry tokens over unchanged color roles — unblocks every other visual surface.
- [ ] Title bar shell: brand, identity pill (branches/staged/unstaged/working-tree/exact-patch variants), side-bar/panel toggles — core navigational frame.
- [ ] Resizable files-only side bar with Explorer-density tree (rows, compact folders, M/A/D, badges, filter, view options, footer totals) — primary reading surface.
- [ ] Editor title (icon actions, breadcrumbs) + DEBT-01 role/name fix, bundled together since both touch the same toolbar surface.
- [ ] Inline Monaco view-zone comment threads with working resolve/reopen/delete/reply (highest-risk item — spike the pointer-event/overlay mechanism first).
- [ ] Bottom panel (Comments/Summary/Export) closed-by-default, ⌘J-toggleable, all four entry points wired.
- [ ] Cross-file thread navigation (⌥F9/⇧⌥F9) — depends on inline threads existing.
- [ ] Status bar (comment counts, Export entry, support entry) — viewed count deferred until its backend field lands (see below).
- [ ] Export readiness + stale-anchor acknowledgement gate + receipt relocated into the panel.
- [ ] `DESIGN.md` § Composition/Geometry rewritten to describe the shipped shell — last, since it should describe reality not aspiration.

### Requires an Explicit Decision Before Scheduling (not optional scope-cuts — see Gaps section)

- [ ] Standalone-session identity pill variant.
- [ ] Finish-attached-review placement.
- [ ] Markdown rendered-preview toggle placement in the new editor title.
- [ ] Voluntary-support status-bar entry treatment.
- [ ] Open-thread default collapse state.

### Sequenced Within v2.1 But Logically Separable

- [ ] Per-file "viewed" tracking (new persisted draft field, status-bar viewed count, tree viewed marks) — PROJECT.md lists this as a v2.1 target feature, but it is the one item in this milestone that is backend work wearing UI clothing (v1.6's `DEFER-01`). If backend schema work slips, the rest of the shell does not need to wait on it — the status bar and tree view-options can ship with this item visually absent/disabled rather than blocking the whole milestone.
- [ ] `.vue` typechecking (TypeScript/vue-tsc pairing). Independent of the UI work; doing it early reduces rework across the many components this milestone touches, but it does not block any single visual surface from shipping.

### Future Consideration (beyond v2.1)

- [ ] Full two-mode (highlight vs. filter) Explorer-style tree filtering, matching VS Code's `Ctrl+Alt+F` behaviour exactly — table-stakes substring filtering satisfies this milestone; the highlight-while-browsing mode is a refinement.
- [ ] Tree virtualization for very large changesets — only if real-world fixture testing during implementation shows it's needed; not scoped work today.
- [ ] Change-to-change (hunk) jump with a position indicator ("3 of 12") — tracked separately as v1.6 `DEFER-02`; F7/⇧F7 navigation itself is already shipped and in scope, the position indicator is not.
- [ ] Narrow/phone-width workbench layout — explicitly deferred as accepted debt below 1050px per the milestone's own scope decision.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Resolve/reopen/delete/reply on comment threads | HIGH (restores removed capability) | MEDIUM (UI only; backend exists) | P1 |
| Workbench shell (title bar, side bar, editor title, panel, status bar) | HIGH (the milestone's core ask) | HIGH (structural rebuild) | P1 |
| Explorer-density changed-files tree | HIGH (diff gets "nearly all the space") | MEDIUM | P1 |
| Export readiness/stale-gate/receipt relocation | HIGH (preserves existing drift-detectable guarantee) | LOW (relocation only) | P1 |
| Cross-file thread navigation (⌥F9/⇧⌥F9) | MEDIUM | MEDIUM (depends on P1 thread work) | P2 |
| DEBT-01 toolbar role/name fix | MEDIUM (accessibility debt, zero new user value) | LOW (bundled with editor-title rebuild) | P1 (ride-along) |
| Per-file viewed tracking + viewed count | MEDIUM (GitHub-familiar progress signal) | MEDIUM-HIGH (new persisted field) | P2 |
| `.vue` typechecking | LOW direct user value / HIGH engineering risk-reduction | MEDIUM (version-pairing TBD by StackResearch) | P1 (infra) |
| `DESIGN.md` rewrite | LOW direct user value / HIGH maintainability value | LOW | P2 (after shell stabilizes) |
| Standalone/Finish/Markdown-toggle/support-entry placement decisions | Blocks nothing to *decide*, blocks shipping to *not decide* | LOW (decision, not implementation) | P1 (decide early, implement at natural dependency point) |

**Priority key:**
- P1: Required for the milestone's stated goal; no meaningful "ship without it" version exists.
- P2: Required by PROJECT.md's target features but can trail P1 items without blocking the rest of the shell.

## Competitor Feature Analysis

| Feature | VS Code | GitHub PR | Gerrit | Our Approach |
|---------|---------|-----------|--------|--------------|
| Comparison identity | No single-comparison concept (editor-per-file, no "base vs head" chrome) | Base/compare dropdown in PR header, ref names only | Change screen header with patch-set selector | Title-bar pill encoding 5 session kinds including frozen-snapshot and exact-patch states neither reference has ([User interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface); GitHub PR docs) |
| Changed-file list | Explorer tree (general-purpose, not diff-aware) / SCM flat list for changes | Files Changed tab: flat list, per-file viewed checkbox, progress bar | File list with per-file comment/size counts | Explorer-density **tree** (not flat list) with M/A/D + badges + viewed marks, merging VS Code's density with GitHub's viewed-tracking and per-file counts |
| Comment lifecycle | `vscode.CommentThread`: open/resolved via extension-defined contextValue, no built-in "stale" concept | Open / resolved (outdated-diff comments shown collapsed/greyed, not "stale" exactly) | Draft → Published; per-comment Resolved checkbox; Done vs Ack semantics vary by project convention ([Gerrit Review UI](https://gerrit-review.googlesource.com/Documentation/user-review-ui.html)) | Open/Resolved (matches both) **plus** Anchor-moved as a distinct, export-gating state — unique to Loopnote's durable-anchor model |
| Comment navigation | Alt+F9 / Shift+Alt+F9 next/prev thread (verified in source) | "Jump to next unresolved comment" via Conversation tab scroll, no dedicated keybinding | Keyboard `n`/`p` thread nav in some Gerrit UIs | Adopts VS Code's exact keybinding (⌥F9/⇧⌥F9) — intentional parity, not "inspired by" |
| Export/handoff | None (not a review tool) | Review submission (Approve/Request changes/Comment), no machine-readable export | Vote + Submit; no generated artifact beyond the commit itself | Canonical JSON + generated Markdown + receipt — no reference tool here produces anything comparable |
| "Mark reviewed" progress | N/A | Per-file Viewed checkbox + "X of Y files viewed" progress bar in PR header ([GitHub docs](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request)) | No per-file viewed concept (patch-set level review state only) | Status-bar viewed count + tree viewed marks, directly modeled on GitHub's pattern — requires new backend field (see Gaps/Dependencies) |

## Sources

### Primary (HIGH confidence — official docs or source code read directly)
- [VS Code: User interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface) — six-area layout, Primary Side Bar, ⌘B/Ctrl+B toggle, Explorer view, Compact Folders behaviour reference, Advanced tree navigation (Ctrl+Alt+F highlight/filter modes), Breadcrumbs.
- [VS Code: Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout) — command center, Panel region, workbench part toggling.
- [VS Code: Default keyboard shortcuts reference](https://code.visualstudio.com/docs/reference/default-keybindings) — confirms the curated default-shortcut model and documents many of the move/navigate key shapes Loopnote's own shortcuts echo.
- [VS Code 1.14 release notes](https://code.visualstudio.com/updates/v1_14) — origin of F7/⇧F7 diff navigation ("New Diff review pane - Navigate Diff editor changes quickly with F7").
- [VS Code 1.81 release notes](https://code.visualstudio.com/updates/v1_81) — Diff Review Pane renamed Accessible Diff Viewer; keybinding unchanged.
- [VS Code 1.41 release notes](https://code.visualstudio.com/updates/v1_41) — Compact Folders shipped.
- `microsoft/vscode` source, [`commentsEditorContribution.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/comments/browser/commentsEditorContribution.ts) — exact keybinding constants: `NextThread` = `Alt+F9`, `PreviousThread` = `Shift+Alt+F9`, plus `NextCommentedRange`/`PreviousCommentedRange` = `Alt+F10`/`Shift+Alt+F10` (distinct, out-of-scope command).
- [`CommentController` API reference](https://vscode-api.netlify.app/interfaces/vscode.commentcontroller) — comment widget/thread model VS Code extensions use, matching the inline view-zone pattern Loopnote already partially implements.
- [GitHub Docs: Reviewing proposed changes in a pull request](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request) — "mark it as Viewed," progress bar in PR header.
- [GitHub Docs: Commenting on a pull request](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/commenting-on-a-pull-request) — PR comment/resolve conventions.
- [Gerrit: Review UI Overview](https://gerrit-review.googlesource.com/Documentation/user-review-ui.html) — Reply flow, draft vs. published inline comments, per-comment resolved state.

### Repository (ground truth for "what already exists")
- `/Users/alessandro/projects/diff-review/.planning/PROJECT.md` — Current Milestone target features, Context (quick task `260915-jbv` removal), Requirements (Active), Key Decisions.
- `/Users/alessandro/projects/diff-review/.planning/ROADMAP.md` — DEBT-01 exact description/line numbers, DEFER-01/02/03/04.
- `/Users/alessandro/projects/diff-review/.kimi-code/skills/sketch-findings-loopnote/SKILL.md` and `references/{workbench-shell,changed-files-tree,comments-and-export,tokens-and-density}.md` — design decisions, rejected variants, Open Questions.
- `/Users/alessandro/projects/diff-review/.kimi-code/skills/sketch-findings-loopnote/sources/{001..004}*/` — sketch HTML/README confirming state-tab coverage (used to identify the standalone-session and Finish-placement gaps).
- `/Users/alessandro/projects/diff-review/DESIGN.md` — current design contract (Composition/Geometry sections that must be rewritten).
- `/Users/alessandro/projects/diff-review/src/contracts/api.ts` — `DraftMutationRequestSchema` confirming `resolveComment`/`reopenComment`/`deleteComment`/`editComment` already exist server-side.
- `/Users/alessandro/projects/diff-review/src/web/App.vue`, `components/{ActiveFileToolbar,FileTree,ReviewToolbar,ReviewNotesDialog,IdentityHeader}.vue`, `model/comment-groups.ts` — current implementation of F7/⇧F7 navigation, file-nav keybindings, filter box, toolbar ARIA groups, attached/Finish lifecycle, comment-group projection.

### Secondary (MEDIUM confidence — general knowledge, not independently re-verified this session)
- GitLab Merge Request resolve-thread/unresolved-count conventions (referenced only to corroborate that "resolvable thread with a count gate" is an industry-standard pattern, not independently re-read this session).
- diffmux/PRless (`.claude/CLAUDE.md` Alternatives Considered) — cited as existing local-review precedent for the agent-handoff differentiator claim; not re-fetched this session (prior STACK.md research already covers them).

---
*Feature research for: Loopnote v2.1 Workbench Redesign*
*Researched: 2026-11-04*
</content>
