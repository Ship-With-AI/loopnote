
# Domain Pitfalls

**Domain:** Rebuilding an existing Vue 3 + Vite + Monaco browser review workspace (Loopnote) as a VS Code-inspired workbench shell, Explorer-density changed-files tree, inline Monaco view-zone comment threads, and a bottom review/export panel — on top of 6 shipped milestones of behavior that must stay byte-for-byte unchanged.
**Researched:** 2026-11-04
**Confidence:** HIGH (all findings grounded in this repository's own source, shipped-milestone history, and verified primary docs; no speculative ecosystem claims)

This file is scoped to mistakes specific to **adding these four surfaces to this system**, not generic Vue/Monaco advice. Every pitfall below is evidenced from `src/`, `.planning/RETROSPECTIVE.md`, `.planning/MILESTONES.md`, `.planning/STATE.md`, `.planning/milestones/v1.6-phases/` and `v2.0-phases/`, or the sketch-findings design docs that already anticipated some of these failure modes.

## Critical Pitfalls

### Pitfall 1: Monaco view-zone height desync between Base and Head panes

**What goes wrong:**
Monaco's diff editor is two independent `IStandaloneCodeEditor` instances (`originalEditor`/`modifiedEditor` in `src/web/monaco/diff-adapter.ts`) kept line-aligned only because every zone insertion is mirrored on both sides with the same height. Today `PairedZoneDiffAdapter` inserts exactly one `ActiveComposer` zone pair at a time (`createComposerZone`/`createSpacerZone`, `diff-adapter.ts:577-638`) and resizes it post-render via `growPairedZones()` → `layoutZone()` (`diff-adapter.ts:631-638`). The workbench redesign requires **many persistent, simultaneously expanded threads per file** (target feature 3: "expanded by default"), each potentially on a different side (Base-only, Head-only) with independent height (reply textarea growing, collapse/expand, resolve-state change). If zone height changes aren't mirrored to the opposite editor's spacer on every content change — not just the one "active composer" case the adapter was built for — the two panes drift out of line-alignment, which is exactly the defect class `src/web/model/comment-groups.ts`/the adapter were built to prevent for the single-composer case.

**Why it happens:**
The adapter's two-collection design (`originalZone`/`modifiedZone` singular fields at `diff-adapter.ts:115-116`) assumes one composer. Scaling to N persistent threads means N zone pairs with independent lifecycles (resolve, reopen, reply-growth, delete), and the "equal-height empty zone on the opposite side" rule from the design spec (`comments-and-export.md:9`: "opposite editor gets equal-height empty zone so Base/Head stay line-aligned") must hold for every pair, continuously, including while the user is live-typing a reply.

**How to avoid:**
Generalize the adapter's zone bookkeeping from singular `originalZone`/`modifiedZone` fields to a keyed collection (one entry per thread id), reuse the existing `addZone`/`layoutZone`/`growPairedZones` primitives per entry, and resize via a `ResizeObserver` on the zone's content `domNode` (not only on explicit state transitions) so height drift from textarea autosize or reply-growth is caught automatically rather than requiring every call site to remember to call `setAnchorZoneHeight`.

**Warning signs:** Two side-by-side threads at different source lines visually overlapping or leaving a gap on one side only; Base/Head code drifting out of row alignment after resolving/reopening a thread; Chromium screenshot diffs showing misaligned gutters after a reply is typed.

**Phase to address:** The phase that builds inline Monaco comment threads (target feature 3) — must land the keyed paired-zone model before any thread-state UI (resolve/reopen/reply) is wired up, since every later state transition depends on it.

---

### Pitfall 2: View-zone DOM doesn't receive pointer events reliably — already flagged in the design spec

**What goes wrong:**
Buttons, the collapse twistie, the reply textarea, and resolve/reopen/delete actions inside an inline thread silently stop responding to clicks, or clicks "pass through" to the Monaco line beneath the zone.

**Why it happens:**
This is a **known, already-documented Monaco limitation**, called out directly in this project's own design research: *"Interactive DOM inside zone needs overlay/content widget positioned over zone, view-zone DOM does not receive pointer events reliably."* (`.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md:9`). Monaco view zones are positioned in the editor's layout flow but the editor's own mouse-handling layer can intercept events above the zone's content depending on `suppressMouseDown` and overlay stacking; the current adapter already special-cases this per zone (`suppressMouseDown: false` for composer zones, `true` for pure spacers — `diff-adapter.ts:604,610`), which was sufficient for one textarea but has not been proven for nested interactive controls (twistie, three separate icon buttons, a reply box) inside the same zone.

**How to avoid:**
Follow the design doc's own prescription: render the thread's interactive chrome as a Monaco **content widget** (`addContentWidget`/overlay positioned via `afterLineNumber` → pixel offset) layered over the zone's reserved space, rather than depending on raw view-zone DOM event delivery for anything beyond simple keypress focus. Prove pointer-click reliability for every actionable element (twistie, resolve, reopen, delete, reply submit) in a real Chromium page — not jsdom — before building the thread list UI on top of it, since this is a rendering-engine behavior that unit tests cannot observe.

**Warning signs:** Playwright `click()` succeeding but no state change (a strong signal the click landed on the editor's own mouse layer, not the zone's button); works in manual testing with a slow click but fails in fast automated clicks (focus-timing sensitive).

**Phase to address:** Same phase as Pitfall 1 (inline comment threads) — this is a go/no-go spike that should happen **before** committing to the "many expanded threads per file" interaction model, because if content widgets don't solve it cleanly the whole thread-rendering approach needs rethinking.

---

### Pitfall 3: Zone churn during draft reconciliation silently drops or duplicates thread UI

**What goes wrong:**
`src/web/model/draft-reconciliation.ts` rebuilds the comment→file index (`ExactFileIndex`, lines 6-46) whenever the session's file set or server-returned draft changes (e.g., after Refresh reclassifies comments for uncommitted sessions, or after a conflict-recovery reload). Today this only has to re-render **zero or one** active composer zone. With persistent multi-thread rendering, every reconciliation pass must diff the previous zone set against the new comment list and add/remove/update exactly the zones that changed — not tear down and recreate every zone on every reconciliation, which would cause visible flicker, lost scroll position, and lost in-progress reply-textarea content on every Refresh.

**Why it happens:**
Reconciliation today is comment-anchor-centric (`selectedPath`, `exactFile` lookups) and was never required to preserve DOM/zone identity across a pass because there was at most one live zone. A naive port ("just re-run thread rendering on every reconciliation") will destroy and recreate Monaco view zones wholesale, which is observable to the user as the whole diff "jumping" on every uncommitted-session Refresh — a session kind this milestone's scope decisions require to stay behaviorally unchanged.

**How to avoid:**
Key zones by `comment.id` (stable across reconciliation) rather than by anchor-derived position, and reuse Phase 14's already-proven reconciliation pattern (`reconciledWorkspaceComments()`, fixed in STATE.md's 14-14 note to stop discarding fresh `state`/`exactFile`/`fileId` on merge) as the model for diffing old vs. new thread state before touching Monaco zones.

**Warning signs:** The diff pane visibly re-rendering/scrolling after every Refresh even when no comment actually changed; an in-progress reply draft disappearing after an unrelated background reconciliation; Playwright screenshot flakiness correlated with Refresh timing.

**Phase to address:** Inline comment threads phase, in the same reconciliation code path Phase 14 already touched for uncommitted sessions — do not let this phase treat `draft-reconciliation.ts` as untouched infrastructure.

---

### Pitfall 4: Comment anchoring regressions — the golden-hash and `endLine` contract must stay inert

**What goes wrong:**
`src/domain/anchor.ts`'s `buildDurableAnchor`/`verifyDurableAnchor` is covered by a **pinned golden-hash regression test** (`tests/unit/anchor.test.ts`, asserting `contextHash.value === '23c54f8c...'` per the 17.1-04 plan notes) and an additive, optional `endLine` field proven to leave single-line anchors byte-identical (PROJECT.md Key Decisions: *"single-line anchors stay byte-identical (golden-hash pinned); block ranges highlight fully in Source view"*). Any change to how the workbench renders or positions inline threads (e.g., deriving a different context window for display purposes, or touching `CONTEXT_DOMAIN`/`UNIQUE_DOMAIN` hash inputs for a new UI need) risks silently moving the golden hash, which would be a drift-detection correctness regression, not just a visual one — exported anchors are the contract an applying agent trusts.

**Why it happens:**
UI and anchor-identity code are adjacent (the same comment object carries both `anchor.line`/`anchor.endLine` for positioning and `recordedAnchor` for drift verification — `draft-reconciliation.ts:45-51`), so it's easy for a workbench-rendering change (e.g., "also show the last line of a block comment in the thread header") to reach into `buildDurableAnchor` inputs instead of reading already-computed fields.

**How to avoid:**
Treat `src/domain/anchor.ts` as read-only for this milestone: the workbench consumes `comment.anchor.line`/`comment.anchor.endLine`/`comment.state` (open/resolved/anchor-moved) for *rendering*, and never recomputes a hash input to serve a UI need. Re-run `tests/unit/anchor.test.ts` unmodified after every phase that touches comment rendering as a drift canary.

**Warning signs:** `tests/unit/anchor.test.ts`'s golden-hash assertion needing an "update" during a UI-only phase — that is itself the warning sign, not something to silence by recomputing a new golden value.

**Phase to address:** Inline comment threads phase; verification step owned by whichever plan first renders thread state from `comment.anchor`.

---

### Pitfall 5: Roving tabindex in the 22px Explorer tree repeats the v1.6 "never satisfied" defect

**What goes wrong:**
v1.6's own retrospective records: *"Roving tabindex never satisfied by implementation"* as a defect found and fixed only by the widened CI gate (`.planning/MILESTONES.md` v1.6 section, "Defects found fixed predated restyle"). The current `FileTreeModel` (`src/web/model/file-tree.ts:44,244-247`) and `FileRow.vue:60`/`DirectoryRow.vue:55` implement a working `tabbableRowId`-derived `:tabindex="tabbable ? 0 : -1"` pattern — but the Explorer-density rewrite changes row height (34px → 22px), indentation (20px → 12px), compact single-child folder chains (new: multiple path segments collapse onto one row — `changed-files-tree.md:9`), and adds new interactive affordances per row (hover-only `+`/`−` counts, comment badges, view-options menu) that the current model was never built to carry. A rewrite that treats the tree as "mostly new markup" risks reintroducing the same bug the fix already solved once.

**Why it happens:**
Compact folder-chain rows and virtualization (needed for 412+ files per `changed-files-tree.md:18`) both change what "the next/previous visible row" means for arrow-key navigation — a single collapsed chain row must act as one tab stop representing several real directory segments, and a virtualized list must keep `tabbableRowId` pointing at a DOM node that actually exists.

**How to avoid:**
Reuse — don't reimplement — `FileTreeModel`'s `tabbableRowId`/`focusRow`/`selectFile` functional-update pattern (`file-tree.ts:244-247,375-378`) as the single source of truth for which row is tabbable, extending it for compact-chain rows and virtualization rather than building a second focus-tracking mechanism in the new tree component. Prove keyboard reachability with real browser `Tab`/Arrow-key Playwright evidence (not just source review) before marking the tree phase done, exactly the gate that caught this the first time.

**Warning signs:** Any row reachable only by mouse; `Tab` landing on a `-1` tabindex row; arrow-key navigation skipping a collapsed folder-chain row or a virtualized-out row.

**Phase to address:** Changed-files Explorer tree phase (target feature 2), specifically the plan that introduces compact folder chains and/or virtualization — flag it for a dedicated real-browser keyboard-navigation verification pass, not a code-review-only gate.

---

### Pitfall 6: Duplicate live-region announcements from new toast/panel/thread-action surfaces

**What goes wrong:**
v1.6 fixed this exact class of bug and recorded the fix as a Key Decision: *"Give each dynamic recovery and selector-copy outcome one authoritative live-region owner... focused browser checks count exactly one owner after each real state transition"* (PROJECT.md Key Decisions). The current implementation has one global owner (`App.vue:1462-1464`, `liveMessage`/`liveMessageVersion`) plus several deliberately **scoped, component-local** `role="status" aria-live="polite"` regions for actions whose feedback is local to that component (`CopyButton.vue:53`, `ExportProgress.vue:22`, `ReviewNotesDialog.vue:217`, `SupportDialog.vue:47`). The workbench design introduces several **new** dynamic-feedback surfaces that don't exist today and have no assigned owner yet: the title-bar Refresh toast (*"Snapshot recaptured · Head now 1b7e2aa · 1 comment re-anchored, 0 stale"* — `workbench-shell.md:34`), per-thread resolve/reopen/delete feedback, the bottom panel's Export "Writing…"/"Done" sequence (`comments-and-export.md:29-32`), and the Comments-tab row click that *"flashes 1px focus outline"* (`comments-and-export.md:26`). If two of these layer (e.g., a global toast **and** a local panel status both announce the same Refresh outcome), the fix v1.6 already shipped gets silently undone for the new surfaces.

**Why it happens:**
It's natural to add `aria-live` to each new component in isolation without checking whether the action it announces is *also* already covered by App.vue's existing global `liveMessage` pipeline (e.g., Refresh already routes through recovery/selector-drift state that the global owner may already announce).

**How to avoid:**
Before adding any new `aria-live` region, grep for existing coverage of that state transition in `App.vue`'s `liveMessage` call sites and in the scoped components above; assign exactly one owner per outcome (global for app-wide state transitions like Refresh/export, local-scoped for a single component's own transient feedback like `CopyButton`), and add a focused Playwright check per new announcement type that counts live-region mutations after the real state transition — the same evidence shape v1.6 used to close this.

**Warning signs:** Two DOM nodes both carrying `aria-live` text that changes on the same user action; a screen-reader smoke test reading an announcement twice.

**Phase to address:** Whichever phase introduces the title-bar Refresh toast and the bottom-panel Export sequence (workbench shell / export-gate phases) — assign live-region ownership explicitly in that phase's design, not as a cross-cutting afterthought.

---

### Pitfall 7: Keyboard shortcut collisions with the browser chrome and with Monaco's existing keybindings

**What goes wrong:**
The target shortcut set (⌘B sidebar, ⌘J panel, F7/⇧F7 next/prev change, ⌥↑/⌥↓ next/prev file, ⌥F9/⇧⌥F9 comment-thread cycling) is chosen to mirror VS Code, but VS Code is a native/Electron app with no browser chrome to collide with; Loopnote runs inside a real browser tab. Verified against Chrome's own macOS shortcut reference (DCA Chrome shortcuts page, cross-checked 2026-11-04):
- **⌘J is not free on every platform.** On macOS Chrome, ⌘J is bound to "Jump to selection" (Find-bar context) — likely low collision risk in practice since it only fires with Find focused — but on **Windows/Linux Chrome, `Ctrl+J` opens the Downloads page**, and Chromium's own contributor docs describe global browser shortcuts as *"a strictly conserved resource"* that pages are often not allowed to override. If Loopnote is ever run on Windows/Linux (the CLI and server have no OS restriction — Node 24/Fastify/Vite all run cross-platform), `Ctrl+J` for "toggle bottom panel" may never reach the page at all.
- **⌘P is browser-reserved everywhere** (Print) and is explicitly out of scope for any Loopnote binding — PROJECT.md's shortcut list for this milestone does not actually assign ⌘P to anything, but the research question's own phrasing ("browser ⌘B/⌘J/⌘P") flags it as a checkpoint; confirm no future plan assigns it.
- **⌘B has no macOS browser-chrome binding** (Chrome/Safari use `⌘⇧B` for the bookmarks bar, not plain `⌘B`), so it is safe — but this should be verified again for the actual target browsers at implementation time rather than assumed from VS Code parity.
- **Monaco already owns `Alt+Enter`** for `add-base-comment`/`add-head-comment` (`diff-adapter.ts:178-189,692-699`), registered per-editor via `editor.addAction`. The new ⌥↑/⌥↓ (next/prev file) and ⌥F9 (comment-thread cycling) must be registered at a **single** layer — either all as Monaco `addAction` keybindings scoped to the active editor, or all as the existing global `document.addEventListener('keydown', handleKeydown)` listener (`App.vue:1174,1232`) — not split across both, or a key can double-fire (once via Monaco's internal keybinding service, once via the document bubble listener) or never fire (if Monaco's handler calls `stopPropagation`/`preventDefault` before the event reaches `document`).

**Why it happens:**
VS Code's keybindings were designed assuming no host browser; porting them 1:1 without cross-checking against the actual deployment surface (a Chrome/Edge/Firefox tab, cross-platform) imports collisions invisibly, since they only surface on specific OS/browser combinations a developer may not be testing on.

**How to avoid:**
Build one keybinding registry/table as part of this milestone's design doc (shortcut → owning layer → verified-free-on {macOS Chrome, macOS Safari, Windows Chrome} checklist) before implementing; prefer registering workbench-level shortcuts (⌘B, ⌘J) on the single existing `document` keydown listener rather than per-editor Monaco actions, since those are global regardless of which pane has focus; for any shortcut with a known platform collision (⌘J on Windows/Linux), either pick a collision-free alternate binding or explicitly accept and document it as scoped to macOS/the primary verified platform — do not assume it silently works everywhere.

**Warning signs:** A keyboard shortcut working in local Mac-Chrome dev testing but a user report that it "opens Downloads instead" on Windows; a Playwright keyboard test passing only because Playwright's `page.keyboard.press` bypasses real browser chrome interception (Playwright does **not** reproduce browser-reserved-shortcut behavior, so this class of bug is invisible to the existing e2e suite and needs explicit manual/real-browser verification).

**Phase to address:** Workbench shell phase (title bar ⌘B/⌘J) and inline comment threads phase (⌥F9 cycling) — each phase that introduces a new global shortcut should include this cross-platform check as an explicit verification step, since the existing Playwright suite structurally cannot catch it.

---

### Pitfall 8: `.vue` typechecking adoption blocked by a real, already-diagnosed toolchain incompatibility

**What goes wrong:**
This milestone's target feature 7 requires `.vue` components to come "under typechecking via a TypeScript/vue-tsc pairing decision" — phrased as a decision still to be made because **the obvious path is already proven broken in this repo**. `vue-tsc@3.3.7` fails to even start against the installed `typescript@7.0.2`: multiple quick-task summaries record the exact failure — *"`vue-tsc@3.3.7` resolves `typescript/lib/tsc` at startup but `typescript@7.0.2` no longer exposes [that] inspectable [subpath]... dies `ERR_PACKAGE_PATH_NOT_EXPORTED` before it reads any tsconfig"* (`.planning/quick/260915-jbv-remove-details-review-keyboard-help/260915-jbv-PLAN.md:876-880`, corroborated in `.planning/ROADMAP.md:71-74` and four separate phase SUMMARYs across v1.5/v1.6/v2.0). `npm run typecheck:web` today only covers 7 standalone `.ts` files via `tsconfig.web.json` and explicitly excludes every `.vue` file — meaning **zero** of the ~24 Vue SFCs in `src/web/components/` have ever been typechecked, including through template expressions and prop/emit contracts. A rewrite this large, done blind to this gap, will surface a large batch of latent type errors all at once mid-milestone rather than incrementally.

**Why it happens:**
TypeScript 7 (the Go-ported "tsc7"/"tsgo"-lineage compiler per its 2026-07-08 release) changed its package export surface in a way `vue-tsc@3.3.7`'s Node-API integration assumes still exists; this is a genuine upstream compatibility gap, not a local misconfiguration — three separate quick tasks already explicitly declined to "fix" it mid-task because resolving it is "far outside [a] quick task's scope."

**How to avoid:**
Resolve the TypeScript/vue-tsc pairing **as the first work in this milestone**, before any `.vue` decomposition work, as one of: (a) pin `typescript` back to a 5.x/6.x line `vue-tsc@3.3.7` supports, accepting the loss of TS7 features elsewhere in the build; (b) find/wait for a `vue-tsc` release with TS7 support (check `github.com/vuejs/language-tools` releases at implementation time — the risk flagged in `.planning/milestones/v2.0-ROADMAP.md:124` was already "latest release very recent, keep separate Vite build"); or (c) adopt a different SFC-checking mechanism entirely (e.g. `vite-plugin-checker` driving Vue's own language server, or `vue-language-tools`' standalone CLI) that doesn't depend on `vue-tsc`'s specific `typescript/lib/tsc` import. Whichever is chosen, budget time for the first typecheck run to surface a real backlog of errors across ~24 untouched-by-tsc files, not a clean pass.

**Warning signs:** `vue-tsc` exiting immediately with `ERR_PACKAGE_PATH_NOT_EXPORTED` before reading any config (confirms the known failure, not a new one); a newly-"passing" `.vue` typecheck gate that silently only checks `declare module '*.vue'` shim types and not real template/prop/emit types (the exact gap `16-04-SUMMARY.md:430-433` already warned about for the model-only `typecheck:web` gate).

**Phase to address:** Should be its own early phase or the first plan of the toolbar-a11y/typecheck phase (target feature 7), sequenced *before* the App.vue decomposition phase — decomposing 1,468 lines of `.vue` template/script into new components without a working typecheck gate means the decomposition itself is unverified by the tool meant to catch exactly that kind of breakage.

---

### Pitfall 9: App.vue decomposition silently drops a session-kind branch

**What goes wrong:**
`src/web/App.vue` is ~1,468 lines and is the single place that branches UI behavior across **five distinct session kinds** with materially different rules: committed pinned/range comparisons, exact-patch sessions (immutable — no Refresh, per the design spec's own callout: *"Exact patches cannot refresh"*, `workbench-shell.md:32`), uncommitted staged/unstaged/working-tree sessions (frozen snapshot + Refresh + comment reclassification), standalone file/glob sessions (no Base/Head at all, single-pane), and attached/agent-driven sessions (server-authoritative one-shot Finish lifecycle via `ReviewNotesDialog.vue`'s `attachedLifecycle` states). This project's own history shows this exact failure mode repeatedly: v2.0's rename milestone found "12 files [with] genuinely unrenamed leftovers... despite some explicitly 'deferred to sibling plan X'... that no sibling owned" (`.planning/RETROSPECTIVE.md` v2.0 "What Was Inefficient"), and the v1.6 quick task `260915-jbv` removed Details/Review/Keyboard-help "outright... with no relocation," later requiring v2.1 to explicitly restore the lost comment-lifecycle actions. Decomposing App.vue into workbench shell pieces (title bar, side bar, editor title, status bar, bottom panel) is exactly the kind of large mechanical-looking refactor where a session-kind-specific branch (e.g., the standalone-session "no Base/Head pill" case, or the exact-patch "Refresh disabled" case) gets dropped because the extracting plan reads as "move this JSX/template to a new component" rather than "re-verify every session kind still renders correctly here."

**Why it happens:**
Session-kind branching in Vue templates is easy to visually skim past during extraction (a `v-if="session.kind === 'standalone'"` a few hundred lines from the code being moved), and the five-kind matrix is nowhere written down as a single checklist — it has to be reconstructed from PROJECT.md's scope decisions, the title-bar pill's three documented variants (`workbench-shell.md:29-32`: Branches / Staged / Exact patch — which is already only 3 of the 5 real kinds and needs Unstaged/Working-tree and Standalone variants designed, not just ported), and `ActiveFileToolbar.vue`'s existing `singlePaneSideFor`/session-kind computeds.

**How to avoid:**
Before decomposing App.vue, write an explicit 5-row session-kind × workbench-surface matrix (title-bar pill content, Refresh availability, status-bar snapshot segment, side-bar content, bottom-panel Export-tab stale-gate wording) as a planning artifact, and make every extraction plan's acceptance criteria reference specific rows of that matrix rather than "visually matches the sketch." Add or reuse an integration test per session kind that renders the full shell and asserts the kind-specific affordances it must show/hide (Refresh disabled for exact patch, no Base/Head pill for standalone, drift warning only for staleness-capable kinds).

**Warning signs:** A plan's SUMMARY containing language like "deferred to sibling plan" without that sibling's plan actually listing the item (the precise pattern the v2.0 retrospective flagged as a "silent drop" risk); a session kind rendering the wrong/default title-bar pill variant in manual testing; exact-patch sessions showing an enabled Refresh control.

**Phase to address:** The App.vue decomposition work implied by the workbench shell phase — should explicitly list the 5-kind matrix as a phase deliverable, verified before (not after) the phase closes.

---

## Moderate Pitfalls

### Pitfall 1: Repeating the Teleport `v-if` sidebar-stranding bug in the new resizable side bar / bottom panel

**What goes wrong:** v1.6 shipped and then had to hotfix (`80c3b92`) a bug where `v-if` on a Teleport target (`#changed-files`) permanently emptied the sidebar, because *"Vue resolves a Teleport target once, so `v-if` on `#changed-files` stranded the file tree in a detached element"* (`.planning/MILESTONES.md` v1.6 post-close section). The new resizable side bar (⌘B toggle) and the bottom panel's mobile-overlay fallback (`tokens-and-density.md` responsive notes) are new candidates for the same pattern if toggled visibility is implemented with `v-if`/`<Teleport>` instead of `v-show`.

**Prevention:** Any new collapsible/resizable region that uses `<Teleport>` for overlay positioning must toggle visibility with `v-show`, never `v-if`, on the teleported content — exactly the fix already applied once. Grep for `<Teleport` + `v-if` together as a lint-level check during the shell phase.

---

### Pitfall 2: Repeating the "review surface renders transparent over Monaco" background-loss bug

**What goes wrong:** v1.6 also hotfixed (`8b2a050`) the review rail rendering transparent over Monaco, "bisected to Phase 11-05... which deleted its only `background` declaration while retiring drawer styles" (`.planning/MILESTONES.md`). The bottom panel is a new raised surface over the same Monaco canvas; a CSS refactor to the new token root (moving from `--sidebar-width: 294px` etc. to the new workbench geometry tokens in `tokens-and-density.md`) risks dropping a `background` declaration the same way during cleanup of old rail/drawer styles.

**Prevention:** Verify the bottom panel and any popover (title-bar details popover, view-options menu) against **real packaged Chromium** screenshots with Monaco actually rendering underneath — not just token/CSS source review — since this exact defect was invisible to source review the first time and was only caught by a real-browser bisect.

---

### Pitfall 3: Reintroducing a fourth, disagreeing breakpoint system

**What goes wrong:** v1.6 unified four disagreeing breakpoint systems onto 760/1050/1650 as a named accomplishment. The new resizable side bar (170–520px user range per `tokens-and-density.md:12`) interacting with the existing fixed breakpoints, plus the "desktop only, may regress below 1050px" scope decision, creates pressure to add an ad-hoc new breakpoint for "sidebar too wide to coexist with a narrow window" rather than reusing the existing 1050px floor.

**Prevention:** Clamp the resizable sidebar's effective max width by the viewport (e.g. `min(520px, viewport - minimum-editor-width)`) rather than introducing a new named breakpoint; keep 760/1050/1650 as the only breakpoint vocabulary and treat anything the resizable sidebar does below 1050px as the already-accepted "may regress" debt, not a new responsive tier to design for.

---

### Pitfall 4: Packaged-runtime `NODE_ENV` leak recurring with new dev tooling

**What goes wrong:** v1.6's retrospective records an order-sensitive suite failure where "the runtime packer inherit[ed] `NODE_ENV=development` from [a] Vite server started earlier [in another] spec, packaging [a] development Vue runtime" into the production artifact (`.planning/MILESTONES.md`). If a new dev-only tool is added for this milestone (a `vite-plugin-checker` for the `.vue` typecheck gate, a Vite dev-server-based Storybook/sketch-preview tool, etc.), it's a new vector for the same leak if its dev server isn't torn down before the production `build:runtime`/packer step runs in the same CI job.

**Prevention:** Any new dev-server-backed tool added this milestone must be proven not to leave `NODE_ENV` set after it exits (same class of regression test that caught the original bug), and the packaged-artifact Playwright gate must keep asserting the packaged bundle is the production Vue build.

---

### Pitfall 5: `verify:semantic-css` rejecting new workbench-geometry literals

**What goes wrong:** `npm run verify:semantic-css` (`scripts/verify-semantic-css.mjs`) parses `src/web/styles.css :root` via `scripts/css-token-contract.mjs` and fails the build if a component CSS rule uses a literal value instead of a token reference (confirmed by reading the script's `leafRules`/`declarationRules`/`rootRule` structure). `tokens-and-density.md` introduces ~15 new named geometry tokens (`--file-row-min-height: 22px`, `--sidebar-w`, `--tree-indent: 12px`, `--control-height-compact`, etc.) that must be added to the canonical `:root` **before** any component CSS references them, or the gate fails at `npm run verify:semantic-css` (which runs `build:web` first).

**Prevention:** Land all new workbench geometry/density tokens in `src/web/styles.css :root` as their own first plan/commit in the shell phase, before any component migrates to the new density — mirrors how v1.6's token-root-first approach avoided this exact class of gate failure.

---

### Pitfall 6: Toolbar `role="toolbar"`/`role="group"` fix (DEBT-01) done cosmetically without closing the actual accessibility gap

**What goes wrong:** DEBT-01 is precisely specified: three containers in `ReviewToolbar.vue` (`:20` "Diff navigation", `:22` "File navigation", `:47` "Change navigation" — one of an original four already deleted by quick task `260915-jbv`) carry `aria-label` without a queryable `role`, so `getByRole('group', { name: ... })` resolves to `generic` (`.planning/ROADMAP.md:79-88`). Since the workbench redesign replaces the toolbar surface entirely (icon-only editor-title actions, title-bar icon toggles, status-bar items), it's easy to "close" DEBT-01 by deleting `ReviewToolbar.vue` outright without verifying the **new** icon-action groups (editor-title actions, title-bar right-side icons) themselves expose `role="toolbar"`/`role="group"` + accessible names — i.e., replacing the broken old surface with an equally unreachable new one.

**Prevention:** Treat DEBT-01's acceptance criterion as "every icon-action cluster in the new shell is reachable via `getByRole('toolbar'|'group', { name: ... })`," write that as a positive assertion against the *new* surfaces, not just a regression check that the old `ReviewToolbar.vue` containers are gone.

---

## Minor Pitfalls

### Pitfall 1: `screen-reader`/visible-text decorative noun duplication reappearing
`FileTree.vue` previously carried both a visible "Files" heading and a decorative `aria-hidden` "Changed" eyebrow span removed in Phase 18 (D-08). The new Explorer tree's "CHANGED FILES" view header (`changed-files-tree.md:7`) reintroduces the word "Changed" as the *visible* label — confirm this is an intentional VS-Code-parity choice distinct from the D-08 decision (which only banned a redundant *decorative* duplicate, not the view-header noun itself) before treating it as a regression.

### Pitfall 2: Hover-only counts/badges reducing discoverability without a non-hover fallback
`changed-files-tree.md:14` makes `+N −N` counts and comment badges hover/selection-only by default. Ensure the equivalent information remains reachable via keyboard focus (not just mouse hover) and via the View-options (⋯) "always on" setting, so keyboard-only and touch users aren't silently missing information sighted mouse users see.

### Pitfall 3: Virtualization "caveat, not tested" in the source sketches
`changed-files-tree.md:18` explicitly flags list virtualization for 412+ files as "a sketch caveat; it was not tested." Budget real verification (keyboard nav across virtualized rows, screen-reader row count announcements) rather than treating the sketch's mention of virtualization as already-validated.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reimplement tree focus/tabindex logic from scratch per new Explorer component instead of extending `FileTreeModel` | Faster to write fresh code matching the new row markup | Reintroduces the exact "roving tabindex never satisfied" class of bug v1.6 already paid to fix once | Never |
| Ship the `.vue` typecheck gate as shim-only (`declare module '*.vue'`) and call target feature 7 "done" | Gate turns green immediately | Leaves template/prop/emit type errors completely uncaught — the exact gap `16-04-SUMMARY.md` already flagged for the model-only gate | Only as an explicit, documented interim step with a tracked follow-up, never as the milestone's final state |
| Let the title-bar Refresh toast and the bottom-panel status region both announce Refresh outcomes "to be safe" | Avoids deciding ownership up front | Duplicate screen-reader announcements — the exact defect class the v1.6 live-region fix closed | Never |
| Defer the 5-session-kind matrix to "whichever plan touches it" instead of writing it once | Saves an up-front planning artifact | Repeats the "deferred to sibling plan X that doesn't own it" silent-drop pattern from the v2.0 rename milestone | Never |
| Accept `vue-tsc`/TS7 incompatibility as permanent and skip `.vue` typechecking for this milestone too | Avoids blocking the rewrite on an upstream toolchain gap | Target feature 7 stays unmet for a third consecutive milestone (v1.5, v2.0, now v2.1) while the codebase triples in `.vue` surface area, with the decomposition itself unverified by any type system | Only with an explicit, owner-approved scope reduction recorded in PROJECT.md — not a silent carry-forward |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-------------------|
| Monaco view zones ↔ Vue reactivity | Driving zone DOM mutation reactively from a Vue `watch`/render cycle on every comment-state change, causing Monaco's own layout pass and Vue's render pass to fight (each re-triggering the other) | Keep zone DOM creation/mutation imperative inside the existing `PairedZoneDiffAdapter`/`SinglePaneAdapter` classes (as today), with Vue only owning the content rendered *inside* each zone's mounted app instance, matching the current `createComposerZone` pattern |
| Global `document` keydown handler ↔ per-editor Monaco `addAction` keybindings | Registering the same logical shortcut (e.g. "next file") at both layers, causing double-fire or silent shadowing depending on focus location | Pick one layer per shortcut and document it in a single keybinding table (see Critical Pitfall 7); workbench-level shortcuts (⌘B/⌘J) belong on the existing global listener, in-editor shortcuts (comment navigation while an editor has focus) belong on Monaco `addAction` |
| CSP (`src/server/security.ts`) ↔ new popovers/sashes using dynamic positioning | Assuming the production CSP (`script-src 'self'` only, no `unsafe-inline`/`unsafe-eval`) blocks dynamically-positioned popovers/resizable sashes, and over-engineering a nonce system to work around a non-problem | The CSP already permits inline **styles**: `style-src-attr 'unsafe-inline'` and `style-src-elem 'self' 'unsafe-inline'` (`security.ts:17-19`) — Vue's `:style` bindings for popover position / sash width are already CSP-safe. The real constraint is `script-src 'self'` with no `unsafe-inline`/`unsafe-eval`: never build popover/sash interactivity via inline `<script>`, `onclick="..."` attributes, or `javascript:` URLs; keep all behavior in bundled `self`-origin JS as the codebase already does everywhere |
| `verify:semantic-css` gate ↔ new workbench CSS | Writing new component styles against the sketch's literal pixel/hex values first and "tokenizing later" | Land new tokens in `styles.css :root` first (see Moderate Pitfall 5), reference them from day one in component CSS |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Rendering every comment thread as a live Monaco view zone, even for files not currently scrolled into view | Editor layout/scroll jank proportional to total open-thread count across the whole file, not just the visible viewport | Monaco's own `revealLine`/viewport virtualization already hides off-screen content, but zone *creation* cost (one per thread, each mounting a Vue app) still happens eagerly per file-open; confirm zones are only created for the currently-open file (as today's single-composer model already does) and disposed on file switch, not accumulated across every file in the session | Sessions with many (dozens+) open threads concentrated in one large file |
| Explorer tree re-deriving the full visible-row list on every keystroke in the path filter | Typing lag in the filter input at large file counts (412+ per the sketch's stated stress case) | Reuse the existing filter-that-prunes-not-rebuilds pattern already shipped for the current tree ("a filter that prunes rather than rebuilds so expansion identity and selection survive clearing" — PROJECT.md v1.6 summary) rather than re-deriving from scratch | 400+ changed files, as explicitly called out in the sketch's own stress-test note |
| Resizable sidebar drag firing a full Vue re-render per `mousemove` pixel | Visible stutter while dragging the sash | Drive the drag visually via a CSS custom property / transform updated outside Vue's reactivity (e.g. direct DOM style mutation during drag, committing to reactive state only on drag-end), not a reactive width bound to `mousemove` events | Any drag interaction if implemented naively |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Adding a new `/api/*` route for the bottom panel (e.g. a thread-cycling or view-options preference endpoint) without routing it through the existing `registerSessionSecurity` bearer-token/origin/host checks | Bypasses the loopback-only, token-protected session boundary that is this product's whole security model | Every new route must sit behind the existing `onRequest` hook in `security.ts`; do not special-case a new route the way the image route needed a query-token carve-out (`IMAGE_ROUTE_PATTERN`) unless it has the same structural reason (a literal `<img src>` that cannot carry an `Authorization` header) |
| Persisting new workbench UI preferences (sidebar width, panel-open state, collapse-all toggle) to a new, un-reviewed storage location | Could silently become a second persistence authority alongside the existing repository-local draft store, violating "Accept only server-returned canonical draft state" (PROJECT.md Key Decisions) if it's conflated with review data | Keep UI-only preferences (not review content) in browser-local state scoped per session, clearly separated from the draft/export authority; never let a UI preference endpoint share a route or schema with comment/summary/export data |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Closing the bottom panel by default ("closed while reading") without an obvious way back in for first-time users | A user who hasn't yet learned ⌘J/the status-bar comment-count click may believe commenting/export disappeared, echoing the real post-v1.6 user-facing regression where Review/resolve/reopen/delete were removed outright | Make the status-bar comment-count and Export items (already in the design) unmistakably clickable affordances, not just passive counters, so the panel is discoverable without memorizing a shortcut |
| Exact-patch sessions showing a Refresh control that silently does nothing | Confusing dead UI for an immutable session kind | The design spec already calls for replacing Refresh with the text "Exact patches cannot refresh" (`workbench-shell.md:32`) — verify this is implemented as a conditional swap, not a disabled-but-still-visible button that invites a click |
| Collapse-all being "session-scoped" (target feature 3) without a visible indicator of which session state is remembered | A user reopening the same review later being surprised threads are collapsed/expanded differently than last time, with no explanation | Surface the collapse-all state's scope explicitly in its own control label/tooltip (e.g. "Collapse all (this session)") so the behavior isn't mysterious |

## "Looks Done But Isn't" Checklist

- [ ] **Inline comment threads:** Often missing real-browser pointer-event verification inside the Monaco zone (Critical Pitfall 2) — verify every actionable element (twistie, resolve, reopen, delete, reply submit) actually receives clicks in packaged Chromium, not just in source review.
- [ ] **Explorer tree keyboard navigation:** Often missing compact-folder-chain and virtualized-row coverage — verify `Tab`/arrow-key reachability for a collapsed single-child folder chain and for rows outside the initially-rendered virtualization window, not just a flat small fixture.
- [ ] **`.vue` typecheck gate:** Often missing real template/prop/emit coverage behind a shim that only checks `declare module '*.vue'` — verify by deliberately introducing a bad prop type in a `.vue` file and confirming the gate fails.
- [ ] **Session-kind parity in the new shell:** Often missing the Unstaged/Working-tree and Standalone title-bar pill variants (only Branches/Staged/Exact-patch are in the current design doc) — verify all five session kinds render correct title-bar, Refresh-availability, and status-bar behavior, not just the three explicitly sketched.
- [ ] **Live-region ownership:** Often missing an explicit decision for each *new* dynamic surface (Refresh toast, thread actions, Export sequence) — verify exactly one DOM node announces each outcome via a focused Playwright assertion, per surface.
- [ ] **Cross-platform keyboard shortcuts:** Often missing verification beyond "works in my local macOS Chrome" — verify or explicitly scope ⌘J/Ctrl+J behavior on Windows/Linux Chrome before calling the shortcut shipped.
- [ ] **e2e selector/copy updates:** Often missing the same-wave requirement proven necessary by the 18-05 "Changed files"→"Files" precedent (~30 pinned Playwright locators) — verify every renamed/restructured accessible name has its locator updated in the same commit, not a follow-up.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Zone height desync shipped to a phase's verification gate | LOW | Generalize `growPairedZones`/`layoutZone` calls to run on every zone content mutation (ResizeObserver) rather than only explicit transitions; this is a localized fix inside `diff-adapter.ts`, not an architecture change, if caught before the keyed-zone refactor is abandoned |
| `.vue` typecheck gate adopted late, after App.vue decomposition already happened | HIGH | Re-run the newly-working gate against the already-decomposed components; expect and budget time for a real backlog of newly-surfaced errors across every `.vue` file touched during decomposition, since none of them were ever previously checked |
| Session-kind branch silently dropped during App.vue decomposition | MEDIUM | Reconstruct the 5-kind matrix (Critical Pitfall 9) retroactively from PROJECT.md scope decisions and the pre-decomposition `App.vue` git history, then add the missing conditional back with a regression test pinned to that specific session kind |
| Duplicate live-region announcement shipped | LOW | Remove the redundant `aria-live` region and re-point the single owner (App.vue's `liveMessage` or the correct scoped component) — the v1.6 fix for the same class of bug is a direct template to follow |
| Playwright locator breakage after a copy/accessible-name rename | LOW–MEDIUM depending on blast radius | Follow the 18-05 precedent exactly: grep every `getByRole`/`getByText`/`aria-label` string match across `tests/e2e/` and `tests/integration/` for the old string, update in the same commit as the source change, re-run the full suite once (not per-file) to catch cross-spec reuse of the same string |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Zone height desync (Critical 1) | Inline comment threads phase | Chromium screenshot/geometry assertion proving Base/Head line alignment with ≥2 simultaneously open threads of different heights |
| Pointer events inside zones (Critical 2) | Inline comment threads phase (spike before full build-out) | Playwright `click()` on every actionable zone element (twistie/resolve/reopen/delete/reply) against packaged Chromium |
| Zone churn on reconciliation (Critical 3) | Inline comment threads phase | Refresh an uncommitted session with an open reply draft in progress; assert the draft and unrelated zones survive unchanged |
| Anchor golden-hash drift (Critical 4) | Inline comment threads phase | `tests/unit/anchor.test.ts` passes unmodified after every plan in this phase |
| Roving tabindex regression (Critical 5) | Changed-files Explorer tree phase | Real-browser `Tab`/Arrow-key Playwright walk across a fixture with a collapsed folder chain and (if virtualized) off-screen rows |
| Shortcut collisions (Critical 7) | Workbench shell phase (⌘B/⌘J) + Inline comment threads phase (⌥F9) | Documented keybinding-ownership table; manual/real-browser check on Windows Chrome for ⌘J-equivalent `Ctrl+J` |
| `.vue` typecheck toolchain gap (Critical 8) | First phase of the milestone (or first plan of the typecheck/a11y phase), before App.vue decomposition | `npm run typecheck:web`-equivalent gate exits non-zero on a deliberately broken `.vue` prop type |
| Session-kind drop during decomposition (Critical 9) | Workbench shell phase (App.vue decomposition) | Explicit 5-row session-kind matrix checked off per surface (title-bar pill, Refresh availability, status bar, side bar, Export-tab wording) |
| Teleport `v-if` stranding (Moderate 1) | Workbench shell phase (side bar / panel toggle) | Toggle side bar/panel closed→open→closed via `v-show`-only code path; assert content still renders after multiple toggles |
| Transparent-over-Monaco background loss (Moderate 2) | Workbench shell phase (bottom panel) / tokens phase | Real Chromium screenshot of the bottom panel open over live Monaco content, opaque background confirmed |
| Fourth breakpoint system (Moderate 3) | Workbench shell phase | No new `@media` breakpoint literal outside {760, 1050, 1650} introduced; resizable sidebar width clamped by viewport math instead |
| `NODE_ENV` leak with new dev tooling (Moderate 4) | Whichever phase adds new dev-server-backed tooling (e.g. vue-tsc alternative) | Packaged-artifact Playwright gate asserts production Vue build bytes after the new tool has run in the same CI job |
| `verify:semantic-css` literal rejection (Moderate 5) | Tokens/geometry phase, first plan | `npm run verify:semantic-css` passes with every new workbench token declared in `:root` before component CSS references it |
| DEBT-01 closed cosmetically (Moderate 6) | Workbench shell phase (toolbar replacement) | `getByRole('toolbar'|'group', { name: ... })` resolves for every new icon-action cluster, not just absence of the old broken containers |
| e2e selector/copy churn (Minor, cross-cutting) | Every phase that renames an accessible name or visible string | Same-commit locator update per the 18-05 precedent; full suite re-run, not per-file |
| Flaky/deferred Playwright specs made to "pass" superficially | Any phase touching `tests/e2e/responsive-session.spec.ts:773`, `tests/integration/anchored-workspace.spec.ts:1039`, or `tests/e2e/agent-ready-export.spec.ts:1157` | Root-cause before loosening timeouts/retries; these are pre-existing accepted debt (STATE.md Deferred Items), not newly introduced by this milestone — do not let the rewrite accumulate new ones alongside them undiagnosed |

## Sources

- `src/web/monaco/diff-adapter.ts` (view-zone/paired-zone implementation, lines 115-116, 577-638, 660-1001)
- `src/web/model/draft-reconciliation.ts`, `src/web/model/file-tree.ts` (reconciliation and roving-tabindex implementations)
- `src/web/App.vue` (session-kind branching, global keydown handler, single live-region owner)
- `src/server/security.ts` (production CSP, confirmed `style-src-attr 'unsafe-inline'`/`style-src-elem 'self' 'unsafe-inline'`, `script-src 'self'` only)
- `scripts/verify-semantic-css.mjs`, `package.json` (`verify:semantic-css`, `typecheck:web` scripts)
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md`, `changed-files-tree.md`, `comments-and-export.md`, `tokens-and-density.md` (design source of truth, including the project's own documented view-zone pointer-event caveat)
- `.planning/PROJECT.md` (current milestone scope, Key Decisions, Constraints)
- `.planning/RETROSPECTIVE.md` (v1.0–v2.0 "What Was Inefficient"/Key Lessons sections)
- `.planning/MILESTONES.md` (v1.6 post-close hotfixes: Teleport `v-if`, transparent review rail, roving tabindex, NODE_ENV leak; v2.0 rename "deferred to sibling" pattern)
- `.planning/STATE.md` (Deferred Items table: flaky/order-sensitive Playwright specs)
- `.planning/ROADMAP.md` (DEBT-01 exact description; TS7/vue-tsc `ERR_PACKAGE_PATH_NOT_EXPORTED` note)
- `.planning/quick/260915-jbv-remove-details-review-keyboard-help/260915-jbv-PLAN.md` (verbatim vue-tsc/TS7 failure mode)
- `.planning/milestones/v2.0-phases/18-product-repositioning-copy/` (18-04/18-05 "Changed files"→"Files" ~30-locator precedent)
- `.planning/milestones/v2.0-phases/16-rendered-markdown-preview/` (golden-hash/`endLine` anchor contract)
- Chrome keyboard shortcuts reference, DCA (`https://www.dca.ca.gov/about_us/kbs_chrome.shtml`) — cross-checked macOS ⌘B/⌘J/⌘P bindings, 2026-11-04
- Chromium contributor docs on global keyboard shortcuts as "a strictly conserved browser resource" (`https://chromium.googlesource.com/chromium/src/+show/HEAD/docs/ui/learn/keyboard_shortcuts.md`)
- Stack Overflow, "Which Chrome keyboard shortcuts cannot be overridden with Javascript?" (`https://stackoverflow.com/questions/44998250/`) — confirms some Ctrl-combinations are non-overridable by page JS, supporting caution on ⌘J/Ctrl+J cross-platform

---
*Pitfalls research for: Loopnote v2.1 Workbench Redesign*
*Researched: 2026-11-04*
