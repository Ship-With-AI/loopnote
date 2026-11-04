# Stack Research

**Domain:** Browser-based VS Code-style review workbench (Vue 3 + Vite + Monaco diff editor) — v2.1 Workbench Redesign
**Researched:** 2026-11-04
**Confidence:** HIGH (all findings verified against installed `package.json`/`package-lock.json`, npm registry metadata, primary-source changelogs/wikis, and a live reproduction in this repository)

v2.1 is a UI/UX rebuild inside the existing stack (Node 24, Fastify 5, Vue 3.5.39, Vite 8.1.4, Monaco 0.55.1, Zod, Vitest, Playwright — unchanged, confirmed against `package.json`). This file covers only what the redesign actually requires: fixing `.vue` typechecking, confirming the Monaco APIs for inline comment threads, and choosing (or explicitly rejecting) UI libraries for icons, resizable panes, tree rendering, popovers, and keybindings.

**Headline recommendation: add zero new runtime dependencies.** The only dependency changes are a `devDependencies` reshuffle to fix `.vue` typechecking. Everything else (sashes, popovers, virtualization-readiness, icons, keybindings) is achievable with the existing Vue/Monaco/native-DOM toolchain and matches what the sketches themselves already implement in plain CSS/JS.

## Recommended Stack

### Core Technologies (unchanged — confirmed from `package.json`)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vue 3 | 3.5.39 | Workbench UI framework | Already in use; Composition API fits the existing `App.vue`/component split. No breaking changes needed for the redesign. |
| Vite | 8.1.4 | Dev server / web bundle build | Already in use via `vite.config.mjs`; no plugin changes required. |
| `@vitejs/plugin-vue` | 6.0.7 | Compiles `.vue` SFCs | Unaffected by the `.vue`-typecheck fix below (uses `@vue/compiler-sfc` at build time, not `tsc`). |
| `monaco-editor` | 0.55.1 | Diff editor, comment-thread hosting | All APIs the redesign needs (`changeViewZones`, `IViewZone`, `addOverlayWidget`, `addContentWidget`, `onDidScrollChange`, `getTopForLineNumber`) are already used in `src/web/monaco/diff-adapter.ts` and unchanged since 0.55.1. See Monaco section below. |
| TypeScript | `7.0.2` (native, "latest" dist-tag) | Node/CLI/server/shared-contract typechecking | Stays the fast native (`tsgo`-based) compiler for `build:node`/`typecheck:web`'s `tsc` invocations — see TS7/vue-tsc section. |

### Supporting Libraries (devDependency changes only — no new runtime deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vue-tsc` | `3.3.14` (was `3.3.7`) | Typechecks `.vue` SFCs | Required to close DEBT-01's sibling gap ("`.vue` components typechecked"). `3.3.7` (currently pinned) predates the TypeScript 7 compatibility fix and always throws. See below. |
| `typescript` (npm alias) | `npm:@typescript/typescript6@6.0.2` | Provides the `typescript` **module** (JS API) that `vue-tsc`, and any other tool that does `require('typescript')`, resolves to | Official TypeScript 7.0 dual-install scheme (Microsoft DevBlog, 2026-07-08). Needed only because `vue-tsc` imports `typescript/lib/tsc` as a Node module; it does not spawn the `tsc` CLI. |
| `@typescript/native` (new devDependency, npm alias) | `npm:typescript@7.0.2` | Provides the real `tsc` **binary** (Go-native, fast) | Keeps `build:node` (`tsc --project tsconfig.json`) and `typecheck:web` on the 8–12x-faster native compiler; only `vue-tsc`'s internal module resolution needs the TS6 JS API, not the CLI. |

No new `dependencies` (runtime bundle) entries are needed for icons, resizable sashes, popovers, tree virtualization, or keyboard shortcuts — see "What NOT to Use."

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vue-tsc` CLI | `.vue`-aware typecheck gate | Wire as `vue-tsc --noEmit --project tsconfig.web.json`, replacing the current plain `tsc` invocation in the `typecheck:web` npm script (see Installation). `tsconfig.web.test.json`'s `typecheck:tests:web` can stay on plain `tsc` since `tests/**` are `.ts`-only. |

## Installation

```bash
# No new runtime dependencies.

# Dev dependency changes (fixes `.vue` typechecking under TypeScript 7):
npm install -D vue-tsc@3.3.14
npm pkg set devDependencies.typescript="npm:@typescript/typescript6@6.0.2"
npm pkg set devDependencies."@typescript/native"="npm:typescript@7.0.2"
npm install
```

`package.json` `devDependencies` after the change:

```jsonc
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@6.0.2",
    "@typescript/native": "npm:typescript@7.0.2",
    "vue-tsc": "3.3.14"
    // ...unchanged entries
  },
  "scripts": {
    // was: "typecheck:web": "tsc --noEmit --project tsconfig.web.json"
    "typecheck:web": "vue-tsc --noEmit --project tsconfig.web.json"
    // ...unchanged entries ("build:node", "typecheck:tests:*" keep plain `tsc`
    // — `node_modules/.bin/tsc` still resolves to the real native 7.0.2 binary
    // because npm bin-linking uses each package's own declared `bin` name
    // regardless of which devDependency alias key points at it.
  }
}
```

`tsconfig.web.json` must change its root-file declaration from a `files` array of 7 `.ts` entries to an `include` that also reaches the `.vue` tree, e.g.:

```jsonc
{
  "compilerOptions": { /* unchanged */ },
  "include": [
    "src/web/shims-vue.d.ts",
    "src/web/**/*.ts",
    "src/web/**/*.vue"
  ]
}
```

(Whether to carry `src/web/prototypes/*.vue` — two unreferenced dev-harness components not imported from `main.ts` — into the typecheck scope, or exclude them, is a phase-planning scope call, not a stack decision; flagging it as an open question below.)

## Deep-Dive Findings

### 1. `.vue` typechecking: exact fix for the TS7/`vue-tsc` break

**Reproduced live in this repo:** `npx vue-tsc --noEmit -p tsconfig.web.json` throws
`Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports" in .../node_modules/typescript/package.json` — exactly the failure named in the task.

**Root cause:** TypeScript 7.0 (released 2026-07-08, the native Go port, now `typescript@latest` at `7.0.2` per `npm view typescript dist-tags`) ships *no programmatic API* — only the `tsc`/`tsserver` binaries. `vue-tsc` doesn't spawn `tsc`; it `require.resolve('typescript/lib/tsc')` to patch the compiler in-process, and that subpath no longer exists in TS7's `exports` map. Confirmed via the official announcement: *"While TypeScript 7.0 is here, it does not ship with an API... until [7.1] we have made it a priority to ensure TypeScript can be run side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the compiler (such as typescript-eslint)."* — [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), "Running Side-by-Side with TypeScript 6.0".

**Official fix (from the same post), the npm alias dual-install scheme:**
```jsonc
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",
    "typescript": "npm:@typescript/typescript6@^6.0.2"
  }
}
```
`@typescript/typescript6` is Microsoft's own compatibility package: its `dependencies` are `{"@typescript/old": "npm:typescript@^6"}` (verified via `npm view @typescript/typescript6@6.0.2 dependencies`), so aliasing `typescript` → `@typescript/typescript6` makes `require('typescript/lib/tsc')` resolve again, now backed by a real TS6 compiler.

**`vue-tsc` needed its own patch to use this correctly**, and it has one — but only from **3.3.8 onward**. Diffing the published bundles confirms it:
- `vue-tsc@3.3.7` (currently pinned): no `resolveTscPath` shim-detection in `index.js`.
- `vue-tsc@3.3.8+` (published 2026-07-22, after [vuejs/language-tools#6123](https://github.com/vuejs/language-tools/pull/6123) landed): `index.js` now contains
  ```js
  function resolveTscPath(tscPath = require.resolve('typescript/lib/tsc')) {
      const { name } = require(path.join(tscPath, '..', '..', 'package.json'));
      if (name === '@typescript/typescript6') {
          // `typescript` may be aliased to `@typescript/typescript6`,
          // which keeps tsc in its full TypeScript 6 dependency (`@typescript/old`)
          return require.resolve('@typescript/old/lib/tsc', { paths: [path.dirname(tscPath)] });
      }
      return tscPath;
  }
  ```
  i.e. it detects the `@typescript/typescript6` shim and redirects to the real TS6 compiler behind it. Confirmed by downloading and diffing `index.js` for both published versions via unpkg.
- Tracking issues: [vuejs/language-tools#6121](https://github.com/vuejs/language-tools/discussions/6121) ("vue-tsc support for TypeScript 7"), [#6124](https://github.com/vuejs/language-tools/issues/6124) ("Failed with typescript@7.0.2"), [#6156](https://github.com/vuejs/language-tools/issues/6156) — all closed, all pointing at the same alias scheme.

**Net effect after the fix:** `node_modules/.bin/tsc` still resolves to real native TypeScript 7.0.2 (the `@typescript/native` alias's own `package.json` declares `"bin": {"tsc": "bin/tsc"}` — confirmed via `npm view typescript@7.0.2 bin` — and npm bin-linking keys off a package's *own* `bin` field, not the alias name used in `devDependencies`). So `build:node`/`typecheck:web`'s plain `tsc` invocations keep the 8–12x native speedup; only `vue-tsc`, which imports `typescript` as a module rather than spawning it, is routed to the TS6 JS API shim. No ESLint/`typescript-eslint` is present in this repo, so there is no second consumer to coordinate.

### 2. Monaco: version and inline-comment-thread APIs

**Installed:** `monaco-editor@0.55.1` (2025-11-20). **Latest stable:** `0.57.1` (`0.56.0` 2026-07-20, `0.57.0` 2026-09-24, `0.57.1` current). Diffing the official [CHANGELOG](https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md) for `0.55.1 → 0.57.1`: no breaking changes to view zones, overlay widgets, content widgets, or diff-editor APIs. `0.56.0`'s only breaking change is an ESM entry-point reorg for tree-shaking ("`monaco-editor` entry point continues to load all features/languages") — irrelevant here since `diff-adapter.ts` does `import * as monaco from 'monaco-editor'` (the full package). `0.57.1`'s one breaking change (remote-image loading default for rendered Markdown in hovers) doesn't apply to this app. **Recommendation: no Monaco version bump is required for this redesign.** All APIs named in the task — `changeViewZones`, `IViewZone`, `addOverlayWidget`/`addContentWidget`, `onDidScrollChange`, `getTopForLineNumber` — are already in active use in `diff-adapter.ts` (e.g. lines 175–177 `onDidScrollChange`, 310–313/426–427 `getTopForLineNumber`, 501–639 `changeViewZones`/`IViewZone` paired-zone machinery for the existing composer). Bumping to `0.57.1` is a safe, optional pickup for minor fixes/features, not a requirement.

**Interactive DOM inside a view zone (the core question for inline comment threads):** a view zone's own DOM node does not reliably receive pointer/keyboard focus — it reserves vertical space ("pushes text down") but Monaco's hit-testing treats its content as largely inert. The established pattern — used by VS Code's own comment-thread widget and documented community-wide — is to pair the view zone (which reserves the layout space) with an `IContentWidget` (or `IOverlayWidget`) rendered on top of it to actually host interactive controls: *"As recommended on StackOverflow, I am displaying an IContentWidget over an IViewZone so that I can handle input events in my overlay."* — [microsoft/monaco-editor#1781](https://github.com/microsoft/monaco-editor/issues/1781). This exact approach is independently confirmed by this project's own design research: `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` states *"Interactive DOM inside [the] zone needs [an] overlay/content widget positioned over [the] zone, [since] view-zone DOM does not receive pointer events reliably."* Use `IContentWidget` (not `IOverlayWidget`) for per-thread widgets, since content widgets track a model position and scroll with the text (what a per-line comment thread needs); overlay widgets are viewport-fixed and better suited to the title-bar/status-bar-style chrome, not inline threads.

**Paired Base/Head zones:** `diff-adapter.ts` already implements the exact mechanism the comment threads should reuse — `createComposerZone`/`createSpacerZone`/`addZone`/`growPairedZones` creates a real zone on the side with content and an equal-height empty spacer zone on the opposite side via two separate `changeViewZones` calls (one per `IStandaloneCodeEditor` — `originalEditor`/`modifiedEditor`), so Base and Head stay line-aligned. This is already proven in production (PROJECT.md: *"Resize accepted and composing inline cards through one post-render paired-zone helper... production Chromium proves long-card containment"*). Inline comment threads (Open/Resolved/Anchor-moved) should extend this same adapter class rather than introduce a second zone-management code path.

### 3. Icons: extend `UiIcon.vue`, do not add `@vscode/codicons`

**Current state:** `src/web/components/ui/UiIcon.vue` is a single-file, zero-dependency `<script setup>` component rendering hand-drawn 16×16 `stroke="currentColor"` SVG paths selected by a `v-if`/`v-else-if` chain keyed on a `UiIconName` union (currently 13 names: file/change navigation, open, check, warning, error, information, selected, lock, refresh, disabled). Stroke width 1.5px, token-colored via `currentColor`, no font loading, no build step.

**Considered alternative:** `@vscode/codicons` (`0.0.46-24` on npm, `CC-BY-4.0` license, ~3.5MB unpacked per `npm view @vscode/codicons dist.unpackedSize`). **Rejected:**
- Visual mismatch: codicons are VS Code's filled/outline icon set at its own stroke geometry; the design decision in `tokens-and-density.md` is explicit — *"VS Code-inspired, not clone... we chose VS Code's structure/density but kept Loopnote's own palette"* — extending to codicons for iconography would import VS Code's own visual language wholesale, contradicting that decision, whereas `UiIcon.vue`'s hand-drawn strokes already match the rest of the design system pixel-for-pixel.
- Licensing overhead: `CC-BY-4.0` requires attribution; this project tracks third-party notices in `THIRD_PARTY_NOTICES.md` and ships a compiled-runtime-only npm package (v1.5 constraint) — a new attributed asset is avoidable overhead for ~15–20 additional glyphs.
- Bundle/complexity: codicons ship as an icon font or SVG sprite requiring either `@font-face` loading (FOUC risk) or a sprite-sheet build step; `UiIcon.vue`'s approach adds zero bytes beyond the Vue component itself and composes with existing CSS custom properties directly.

**Recommendation:** extend `UiIconName`'s union and the template's branch chain with the ~15–20 new glyphs the sketches require (sidebar/panel toggle, refresh, compare, drift-warning-dot, previous/next change, previous/next file, inline/side-by-side toggle, breadcrumb chevron, tree twistie, filter funnel, list⇄tree toggle, collapse-all, view-options ellipsis, resolve/reopen/delete/reply, copy, export arrow, eye/viewed, support heart) at the same 16×16/1.5px-stroke geometry. This is additive, in-pattern work, not a new dependency.

### 4. Resizable panes, tree virtualization, popovers/menus: no new dependencies

**Resizable sashes (side-bar sash + panel sash).** No resize/drag code exists in `src/web` today (`resize: vertical` CSS appears only on plain `<textarea>`s; `ResizeObserver` usage is all Monaco-relayout, not drag-resize). The sketches' own CSS (`workbench-shell.md`) already specifies the full interaction in ~6 lines of plain CSS plus pointer-event JS: a 4px `.sash{cursor:ew-resize}` strip, `.sash:hover,.sash.dragging{background:var(--interactive-accent-emphasis)}`, clamped 170–520px width, double-click-to-reset. **Recommendation:** implement a small `useResizableSash` composable (pointerdown/pointermove/pointerup with `setPointerCapture`, `role="separator"`/`aria-orientation`/`aria-valuenow` for a11y, persisted width) — ~60–80 lines, no dependency. **Rejected alternative:** generic split-pane libraries (e.g. `splitpanes`) — unnecessary abstraction for exactly two independent single-axis sashes (side bar width, panel height) that the design has already fully specified in CSS; a generic multi-pane library adds API surface (nested panes, size-unit conversion, nested nesting) this app will never use.

**Tree virtualization (400+ files).** The sketches explicitly flag this as untested, not a confirmed requirement: *"Large changes: 412 files must scan without per-row noise... Implementation should virtualize list when it exceeds viewport (a sketch caveat; it was not tested)."* At 22px rows, 412 flat rows is ≈9,000px of simple, low-complexity DOM (no per-row images/layout thrash) — well within what Chromium/Firefox/Safari render and scroll without virtualization; this matches the project's own established practice of gating on measured production performance rather than pre-emptive libraries (Phase 11's 10,000-ref picker budget was proven against the compiled binary, not assumed). **Recommendation: build the tree as a plain recursive/flat component first; do not add a virtualization library speculatively.** If a later phase's measurement against a real large-changeset repository shows jank, the lightweight native escape hatch is CSS `content-visibility: auto` on offscreen rows before reaching for a library. **Alternatives, if ever needed:** `@tanstack/vue-virtual@3.13.52` (framework-agnostic core + thin Vue adapter, actively maintained) over `vue-virtual-scroller@3.0.5` (peer dep `vue: ^3.3.0`, compatible, but far less actively maintained) — noted for the record, not recommended now.

**Popovers/menus (identity details popover, drift warning, view-options `⋯` menu).** The sketch's own implementation is plain `position:absolute` CSS (`workbench-shell.md`: `.popover{position:absolute;z-index:40;...}`) with box-shadow/border from existing tokens — not CSS anchor positioning, not the native Popover API. This matches the existing codebase's own pattern of manual pixel positioning already used for the comment-composer affordance (`getScrolledVisiblePosition`/`getTopForLineNumber`-based `top` computation in `diff-adapter.ts`). **Recommendation:** a small Vue component computing position from the trigger's `getBoundingClientRect()`, with outside-click + `Escape`-to-dismiss handling (both patterns already present elsewhere in the codebase, e.g. `UiPrimitives.vue`'s tooltip `@keydown.escape`). **Rejected:** `@floating-ui/vue` — a general-purpose collision-detection/flipping middleware engine is unnecessary for a handful of popovers anchored at fixed, known positions (below a title-bar pill, below a `⋯` button) exactly as the sketch already implements without it. **Considered but not required:** the HTML `popover` attribute (Baseline *Newly available* since Feb 2025 — [web.dev](https://web.dev/blog/popover-baseline), 93%+ global support per caniuse) would give free light-dismiss/top-layer stacking; CSS anchor positioning (`position-anchor`/`anchor()`) only reached Baseline *Newly available* in September 2026 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-anchor)) — too recent to rely on for users on slightly older browser builds. If a future phase wants native light-dismiss semantics, adopt the `popover` attribute (safe, broadly supported) but keep manual `getBoundingClientRect()` positioning rather than CSS anchor positioning.

### 5. Keyboard shortcuts: real browser conflicts, and the Monaco-focus interaction

Verified directly against Google's own shortcut reference ([Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179)) and Mozilla's ([Firefox keyboard shortcuts](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly)):

| Target shortcut | Conflict | Verdict |
|---|---|---|
| **F7** / **⇧F7** (next/previous change) | Chrome (Win/Linux **and** Mac): `F7` = "Turn on caret browsing" (confirmed in both OS tables on Chrome's own help page). Firefox (Linux): `F7` = caret browsing toggle (per community shortcut reference). | **Real conflict on plain F7, both major browsers.** But `App.vue` (`handleKeydown`, line 934) *already* does `event.key === 'F7'` → `event.preventDefault()` for change navigation in production today, so `preventDefault()` does suppress it in this app's tested browsers in practice — first-party evidence outweighs generic "F-keys can't be prevented" folklore. **However:** see the Monaco-focus caveat below — this only runs when focus is *outside* any `<textarea>`/`<input>`/`<select>`. |
| **Monaco's own F7/⇧F7** | Monaco's diff editor binds `F7`/`Shift+F7` **by default** to "Go to Next/Previous Difference," which opens Monaco's own internal **Diff Review Pane** overlay (confirmed in the official [Monaco Editor Accessibility Guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide), maintained by the Monaco team, last edited Aug 2026). | **Genuine internal conflict, not a browser one.** `App.vue`'s current `handleKeydown` explicitly bails out (`return`) for any `HTMLTextAreaElement`/`HTMLInputElement`/`HTMLSelectElement` target — and Monaco's own cursor-input capture *is* a hidden `<textarea class="inputarea">`. So today, whenever editor text-focus is inside Monaco (the common case, once a user has clicked into the diff), the app's document-level F7 handler does nothing, and Monaco's native F7 (its own next-difference / Diff Review Pane) is free to fire instead. The v2.1 phase must explicitly decide: register the change-navigation action via `editor.addAction({keybindings:[monaco.KeyCode.F7]}, ...)` on **both** diff sub-editors (the pattern already used for `Alt+Enter` in `diff-adapter.ts`, lines 178–189) to take command priority over Monaco's built-in and suppress the Diff Review Pane, or deliberately reuse Monaco's native pane. This is a design decision for the implementing phase, not a library gap — flagging as a required design/test item, not a stack choice. |
| **⌘B** / **Ctrl+B** (side bar toggle) | Chrome: *not* a default binding on either OS (only `Ctrl+Shift+B` = bookmarks bar). Firefox: `Ctrl+B`/`Cmd+B` **is** bound to "Bookmarks sidebar" toggle (Mozilla's own shortcut reference). | **Firefox-only conflict.** `preventDefault()` on a page-level `keydown` listener reliably overrides non-tab/window Ctrl-shortcuts like this in all evergreen browsers (the same technique already used for `Cmd/Ctrl+Enter` in the comment composer at line 918). |
| **⌘J** / **Ctrl+J** (panel toggle) | Chrome Windows/Linux: `Ctrl+J` = "Open the Downloads page." Chrome **Mac**: Downloads is bound to `Cmd+Shift+J` instead — plain `Cmd+J` is unbound on Mac. | **Conflict on Windows/Linux only** (where the sketch's own convention maps `⌘J` → `Ctrl+J`, per *"On Windows/Linux, Ctrl replaces ⌘"*, `workbench-shell.md`). Suppressible via `preventDefault()` on page keydown, same mechanism as above. |
| **⌥↑** / **⌥↓** (prev/next file) | Not a Chrome- or Firefox-reserved browser-chrome binding on either OS (Chrome's own Mac tab-switching uses `Cmd+Option+Left/Right`, not plain `Option+Up/Down`). **But** Monaco's own default editor keybindings bind `Alt+Up`/`Alt+Down` to "Move Line Up"/"Move Line Down" (`editor.action.moveLinesUpAction`/`DownAction`) — a long-standing VS Code/Monaco default. | **No browser conflict; a Monaco-internal one.** Since this diff editor is read-only, `moveLinesUp/Down` should no-op, but the keybinding still intercepts the keystroke before it can reach a document-level handler if editor focus holds it — same "must register via `editor.addAction` on both sub-editors, not just `document`" requirement as F7 above. |
| **⌥F9** / **⇧⌥F9** (comment thread nav) | No Chrome/Firefox default binding found for `Alt+F9` in either reference; Monaco has no documented default F9 binding. | No known conflict. Standard risk: some external window managers/laptop firmware remap bare F9 to a media/brightness key requiring `Fn`, but that is OS/hardware-level and outside this app's control either way. |

**General mechanism, confirmed by the existing codebase:** this app already uses a `document.addEventListener('keydown', handleKeydown)` global handler (`App.vue`) *and* per-editor `editor.addAction({keybindings: [...]})` registrations (`diff-adapter.ts`, for `Alt+Enter`) side by side. **The redesign needs both, consistently, for every new shortcut**: the document-level handler for when focus is on the file tree, toolbar, or panel, and a matching `editor.addAction` on each Monaco sub-editor instance for when text-focus is inside the diff (where a document-level listener's existing `instanceof HTMLTextAreaElement` early-return means it currently does nothing). `editor.addCommand` is documented to have known focus-context bugs for this kind of override (see [OpenFn/lightning#3903](https://github.com/OpenFn/lightning/issues/3903), [coatless/quarto-webr#28](https://github.com/coatless/quarto-webr/issues/28)) — use `editor.addAction` (already this codebase's convention), not `addCommand`.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| `.vue` typecheck engine | `vue-tsc@3.3.14` + TS6/TS7 npm-alias dual-install | Pin the whole project's `typescript` devDependency down to a 5.x/6.x release | Loses the native `tsgo` 8–12x build-speed win for `build:node`/`typecheck:web` that the project is already on TS7 for; the dual-alias scheme keeps both. |
| `.vue` typecheck engine | `vue-tsc@3.3.14` | `@vue/language-tools`'s Volar language-server alone (editor-only diagnostics) | Gives IDE red-squiggles but no CLI exit code for a `typecheck:web` npm script / CI gate — this milestone needs an enforceable gate, not just editor hints. |
| Icons | Extend `UiIcon.vue` | `@vscode/codicons@0.0.46-24` | Visual-language mismatch with "VS Code-inspired, not clone"; `CC-BY-4.0` attribution overhead; font/sprite loading vs. zero-byte inline SVG. |
| Resizable panes | Hand-rolled pointer-event sash composable | `splitpanes` or similar generic split-pane library | Two independent single-axis sashes, already fully specified in the sketch's own CSS; a generic multi-pane library's API surface (nesting, size units) is unused overhead. |
| Tree rendering (400+ rows) | Plain DOM, defer virtualization | `@tanstack/vue-virtual@3.13.52` / `vue-virtual-scroller@3.0.5` | Sketch caveat is explicitly "not tested"; 412 flat 22px rows is well within unvirtualized-DOM budgets; matches project's measure-before-adding precedent (Phase 11). Revisit only if a later phase's real-repository measurement shows jank. |
| Popovers/menus | Manual `getBoundingClientRect()` positioning + outside-click/Escape | `@floating-ui/vue` | Sketch's own popovers are plain `position:absolute`, fixed relative to one trigger each — no collision/flip logic needed. |
| Popover dismissal semantics | Manual outside-click + `Escape` listeners (existing codebase pattern) | HTML `popover` attribute / CSS anchor positioning | `popover` attribute is safe (Baseline since Feb 2025) but not required; CSS anchor positioning only reached Baseline in Sept 2026 — too new to depend on yet. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `vue-tsc@3.3.7` (currently pinned) | Predates the TS7 compatibility fix (vuejs/language-tools#6123); always throws `ERR_PACKAGE_PATH_NOT_EXPORTED` against the project's installed `typescript@7.0.2`. | `vue-tsc@3.3.14` + the `typescript`/`@typescript/native` alias pair. |
| `@vscode/codicons` | ~3.5MB asset, `CC-BY-4.0` attribution overhead, visually mismatched to Loopnote's hand-drawn stroke-icon language. | Extend `UiIcon.vue` with the same hand-drawn pattern. |
| `@floating-ui/vue` / `popper.js` | General-purpose anchor/collision engine for a handful of fixed-position popovers the sketch already implements in plain CSS. | Manual `getBoundingClientRect()` positioning, same technique already used in `diff-adapter.ts`. |
| `splitpanes` / generic split-pane libraries | Unused API surface (nested panes, unit conversion) for exactly two independent single-axis sashes fully specified in sketch CSS. | Hand-rolled pointer-event sash composable. |
| `@tanstack/vue-virtual` / `vue-virtual-scroller` *(now)* | Sketch explicitly marks virtualization as an untested caveat, not a proven requirement, at the 412-file scale observed. | Plain DOM; revisit only after a measured real-repository jank finding. |
| `editor.addCommand` for new workbench shortcuts | Documented focus-context bugs when overriding built-ins from outside the editor's own focus (OpenFn/lightning#3903, coatless/quarto-webr#28). | `editor.addAction` with explicit `keybindings`, the pattern already used for `Alt+Enter` in `diff-adapter.ts`. |
| `@vue/tsconfig` preset | The project already owns a fully explicit, intentional `compilerOptions` block; the preset would obscure deliberate choices (`verbatimModuleSyntax`, `skipLibCheck`, etc.) already made. | Keep hand-written `tsconfig.web.json`, just change `files` → `include` to add the `.vue` glob. |

## Stack Patterns by Variant

**If a later performance measurement against a real 1,000+/10,000+-file changeset shows tree jank:**
- Add `@tanstack/vue-virtual@3.13.52` (or current) to the changed-files tree only.
- Because it's the actively-maintained, framework-agnostic-core option with a thin official Vue adapter, versus `vue-virtual-scroller`'s comparatively stale maintenance cadence.

**If a future phase wants native top-layer/light-dismiss semantics for popovers instead of manual outside-click handlers:**
- Adopt the HTML `popover` attribute (safe, Baseline since Feb 2025).
- Keep manual `getBoundingClientRect()` positioning rather than CSS anchor positioning (`position-anchor`/`anchor()`), which only reached Baseline in September 2026 and is riskier for users on slightly older browser builds.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vue-tsc@3.3.14` | `@vue/language-core@3.3.14` (its own dependency, installed transitively — no explicit devDependency needed), `@volar/typescript@2.4.30` | Peer range `typescript: >=5.0.0` is satisfied by the TS6 shim's reported version. |
| `typescript: npm:@typescript/typescript6@6.0.2` | `@typescript/old: npm:typescript@^6` (its own internal dependency) | This is the real TS6 compiler, installed under the shim's own `node_modules`; `vue-tsc@3.3.8+`'s `resolveTscPath` redirects to it automatically. |
| `@typescript/native: npm:typescript@7.0.2` | `node_modules/.bin/tsc` | Own `package.json` declares `"bin":{"tsc":"bin/tsc"}` — npm links this as the `tsc` binary regardless of the `@typescript/native` alias key, keeping `build:node`/`typecheck:web`'s CLI calls on native TS7. Requires npm ≥6.9 for alias (`npm:pkg@ver`) support — trivially satisfied by this project's Node 24 toolchain. |
| `monaco-editor@0.55.1` | `vite@8.1.4`, `@vitejs/plugin-vue@6.0.7` | No known interop issues; orthogonal libraries, Monaco is consumed as a plain ESM import, not through the Vue plugin. |
| `vue@3.5.39` | `@vue/language-core@3.3.14` (via `vue-tsc`) | `@vue/language-core`'s own dependency on `@vue/compiler-dom` is `^3.5.0` — satisfied. |

## Open Questions (for phase planning, not stack decisions)

- Whether `src/web/prototypes/*.vue` (two dev-harness components not imported from `main.ts`) should be included in or excluded from the new `tsconfig.web.json` `.vue` glob.
- Whether Monaco's native F7/⇧F7 "Go to Next Difference" Diff Review Pane should be suppressed (via `editor.addAction` override) in favor of custom change-navigation, or adopted/built upon — both are implementable; this is a UX decision, not a library gap.

## Sources

- `package.json` / `package-lock.json` (this repository) — installed versions, confirmed via direct read.
- Live reproduction: `npx vue-tsc --noEmit -p tsconfig.web.json` in this repo — confirms the exact `ERR_PACKAGE_PATH_NOT_EXPORTED` failure.
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) — Microsoft DevBlog, 2026-07-08 — official dual-install alias scheme ("Running Side-by-Side with TypeScript 6.0").
- [vuejs/language-tools#6123](https://github.com/vuejs/language-tools/pull/6123) — the PR that fixed `vue-tsc`'s shim-resolution for TS7; cross-checked against published `vue-tsc@3.3.7` vs `3.3.8` bundles on unpkg.
- [vuejs/language-tools#6121](https://github.com/vuejs/language-tools/discussions/6121), [#6124](https://github.com/vuejs/language-tools/issues/6124), [#6156](https://github.com/vuejs/language-tools/issues/6156) — community-confirmed break/fix reports.
- `npm view typescript …`, `npm view vue-tsc …`, `npm view @typescript/typescript6 …`, `npm view monaco-editor …`, `npm view @vscode/codicons …`, `npm view @tanstack/vue-virtual …`, `npm view vue-virtual-scroller …` — npm registry metadata (versions, dist-tags, dependencies, bin fields, package size/license), queried directly.
- [Monaco Editor CHANGELOG](https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md) — diffed `0.55.1` → `0.57.1` for breaking changes.
- [microsoft/monaco-editor#1781](https://github.com/microsoft/monaco-editor/issues/1781) — "Large content widgets do not render properly," source of the IContentWidget-over-IViewZone pattern.
- [Monaco Editor Accessibility Guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide) — microsoft/monaco-editor wiki, last edited Aug 2026 — documents the default F7/⇧F7 "Diff Review Pane" binding and the Alt+Up/Down "Move Line" default.
- [Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179) — Google Support, official reference, both Windows/Linux and Mac tables read directly.
- [Firefox keyboard shortcuts](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly) — Mozilla Support.
- [OpenFn/lightning#3903](https://github.com/OpenFn/lightning/issues/3903), [coatless/quarto-webr#28](https://github.com/coatless/quarto-webr/issues/28) — `editor.addCommand` vs `editor.addAction` focus-context bug reports.
- [Popover API is now Baseline Newly available](https://web.dev/blog/popover-baseline) — web.dev, Feb 2025.
- [`position-anchor` CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-anchor) — MDN, Baseline 2026 status.
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md`, `changed-files-tree.md`, `comments-and-export.md`, `tokens-and-density.md` — this project's own design-decision record (sketches 001–004), cross-checked against and consistent with every external finding above.
- `src/web/monaco/diff-adapter.ts`, `src/web/App.vue`, `src/web/components/ui/UiIcon.vue` — read directly to confirm current implementation state.

---
*Stack research for: Browser-based VS Code-style review workbench — v2.1 Workbench Redesign*
*Researched: 2026-11-04*
