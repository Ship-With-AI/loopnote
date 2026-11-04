# Phase 20: Shell Frame - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 14 new/modified files (8 new components/modules, 6 modified)
**Analogs found:** 12 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/components/workbench/WorkbenchShell.vue` | component (grid host, presentational) | props-down/events-up | `src/web/App.vue` template lines 1258-1322 (region being extracted) | role-match (extraction source, not a sibling peer) |
| `src/web/components/workbench/TitleBar.vue` | component (presentational) | props-down/events-up | `src/web/components/IdentityHeader.vue` | exact (same props shape, same five-kind branches, same emits) |
| `src/web/components/workbench/EditorTitle.vue` | component (presentational) | props-down/events-up | `src/web/components/ReviewToolbar.vue` + `src/web/components/ActiveFileToolbar.vue` (fold of both) | exact (icon-button-row half from `ReviewToolbar.vue`; filename/status/counts half from `ActiveFileToolbar.vue`) |
| `src/web/components/workbench/Breadcrumbs.vue` | component (presentational, non-interactive) | props-down, no events | `src/web/components/PathDisplay.vue` | role-match (path-segment rendering, no existing non-interactive `<nav>` to copy structurally) |
| `src/web/components/workbench/BottomPanel.vue` | component (presentational, un-wrapped dialog body) | props-down/events-up | `src/web/components/ReviewNotesDialog.vue` | exact (literally the same component, minus `ModalDialog` wrapper) |
| `src/web/components/workbench/StatusBar.vue` | component (presentational) | props-down/events-up | `src/web/components/ShellFooter.vue` | exact (same slot in the shell, same session-derived text, now with more items) |
| `src/web/composables/useSash.ts` | hook/composable (drag-resize) | event-driven (pointer events) | *(none in codebase)* | no analog — see "No Analog Found" |
| `src/web/model/panel-state.ts` | model (persisted UI-preference state) | file-I/O (`localStorage`) + transform (clamp) | `src/web/model/single-pane-layout.ts` (pure-function style) + `src/web/model/selector-drift-state.ts` (factory-with-refs style) | role-match (two partial analogs combine to the full shape) |
| `src/web/App.vue` (modified) | controller/state-owner (unchanged role) | event-driven (keydown) + props-down to new shell | itself — `handleKeydown` (lines 914-940), shell template (lines 1258-1467) | exact (modification target, not analog target) |
| `src/web/monaco/diff-adapter.ts` (modified) | service/adapter (editor keybinding registration) | event-driven | itself — `PublicMonacoDiffAdapter` constructor `addAction` calls (lines 178-189) and `PublicMonacoSinglePaneAdapter` constructor `addAction` call (lines 693-699) | exact (self-analog: same file, same pattern, 3 more call sites of the identical shape) |
| `src/web/components/ui/UiIcon.vue` (modified — new glyphs) | component (icon library) | props-down (name → SVG) | itself — existing `v-else-if` chain (lines 36-59+) | exact (self-analog: append arms to the same chain) |
| `src/web/styles.css` (modified — token root) | config (CSS custom properties) | — | itself — `:root` block (lines 1-154) | exact (self-analog: add/rename/revalue entries in place) |
| `src/web/theme/token-contract.ts` + `scripts/css-token-contract.mjs` (modified — `CANONICAL_TOKENS`) | config (token registry/gate) | — | itself — `CANONICAL_TOKENS` array (`css-token-contract.mjs:1`) | exact (self-analog: literal string array edit) |
| `tests/e2e/*.spec.ts` / `tests/integration/*.spec.ts` (modified locators) + `tests/e2e/workbench-shell-smoke.spec.ts` (new) | test | request-response (Playwright) | `tests/e2e/pinned-session.spec.ts`, `tests/e2e/uncommitted-review.spec.ts`, `tests/e2e/standalone-review.spec.ts` (packaged-binary pack/spawn pattern) | exact (SHELL-05 explicitly says extend/reuse these, not invent a new fixture mechanism) |

## Pattern Assignments

### `src/web/components/workbench/TitleBar.vue` (component, props-down/events-up)

**Analog:** `src/web/components/IdentityHeader.vue` (200 lines, to be deleted — its logic moves here)

**Imports pattern** (lines 1-7):
```typescript
import { computed, ref } from 'vue';

import type { SessionResponse } from '../../contracts/api';
import { RENAME_MAP } from '../../domain/product-identity';
import { controlSafeDisplay } from '../../domain/path-bytes';
import UiIcon from './ui/UiIcon.vue';
```

**Props/emits shape** (lines 9-25) — copy verbatim as the baseline prop surface, then add `sidebarVisible`/`panelOpen` props and `toggleSidebar`/`togglePanel` emits per UI-SPEC's title-bar-right group:
```typescript
const props = defineProps<{
  readonly attachedLifecycle?: 'waiting' | 'finishing' | 'completed';
  readonly inert?: boolean;
  readonly refreshBusy?: boolean;
  readonly showRefresh?: boolean;
  readonly supportEnabled?: boolean;
  readonly supportInert?: boolean;
  readonly supportOpen?: boolean;
  readonly worktreeChanged?: boolean;
  readonly session: SessionResponse;
}>();

const emit = defineEmits<{
  refresh: [];
  reviewNotes: [];
  support: [];
}>();
```
Note: `support` prop/emit and the Support button markup (lines 179-189) are dropped from `TitleBar.vue` — Support moves to `StatusBar.vue` per CONTEXT. `reviewNotes` emit is kept but relabeled "toggle panel" (click opens/focuses the bottom panel instead of a modal).

**Core five-session-kind discriminant pattern** (lines 29-39) — copy verbatim, this is the canonical discriminant every new component must reuse (RESEARCH.md Pitfall 1):
```typescript
const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => 'base' in props.session ? props.session : undefined);
const uncommittedKey = computed(() =>
  'uncommitted' in props.session
    ? (props.session as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isUncommitted = computed(() => uncommittedKey.value !== undefined && !isStandalone.value);
const uncommittedSession = computed(() => (isUncommitted.value ? uncommittedKey.value : undefined));
const standaloneSession = computed(() => (isStandalone.value ? uncommittedKey.value : undefined));
```

**Focus-expose pattern** (lines 95-99) — `support` ref/`focusSupport` moves to `StatusBar.vue`; `App.vue`'s existing `identityHeader.value?.focusSupport()` caller must be repointed to the new host:
```typescript
const support = ref<HTMLButtonElement>();
function focusSupport(): void {
  support.value?.focus();
}
defineExpose({ focusSupport });
```

**Template brand/identity markup** (lines 102-108, 110-120) — copy verbatim into `TitleBar.vue`'s centered identity slot, restyled only via new `--titlebar-height`/`--font-size-chrome` tokens, no structural change:
```html
<div class="session-header__brand" :aria-label="RENAME_MAP.displayName" role="img">
  <span aria-hidden="true">‹/›</span>
  <span>{{ RENAME_MAP.displayName }}</span>
</div>
<div class="session-header__comparison">
  <template v-if="isExactPatch">
    <span class="session-header__endpoint">
      <span class="session-header__endpoint-label">PREIMAGE</span>
      <span class="session-header__selector" title="Repository object">Repository object</span>
    </span>
    <span aria-hidden="true">→</span>
    <span class="session-header__endpoint">
      <span class="session-header__endpoint-label">POSTIMAGE</span>
      <span class="session-header__selector" title="Implemented content">Implemented content</span>
    </span>
  </template>
  <!-- ...isStandalone / isUncommitted / else(committed) branches, same shape -->
</div>
```

**Refresh button pattern** (lines ~170-178) — reuse verbatim, gated by `showRefresh` unchanged:
```html
<button v-if="showRefresh" type="button" class="icon-btn" :aria-busy="refreshBusy" @click="emit('refresh')">
  <UiIcon name="refresh" />
</button>
```
New in `TitleBar.vue`: append `sidebar`/`panel` toggle icon buttons after Refresh, same `icon-btn` shape, `aria-pressed` bound to `sidebarVisible`/`panelOpen` (per Icon Inventory's `aria-pressed = inline` contract).

---

### `src/web/components/workbench/EditorTitle.vue` (component, props-down/events-up)

**Analog 1 — icon action row:** `src/web/components/ReviewToolbar.vue` (73 lines, to be deleted)

**Full file** (this is the exact shape to replicate for every icon-only action — `UiTooltip`-wrapped `UiIcon` button with `aria-label`, `disabled` binding, emit-on-click):
```vue
<script setup lang="ts">
import UiIcon from './ui/UiIcon.vue';
import UiTooltip from './ui/UiPrimitives.vue';

defineProps<{
  atFirstFile: boolean;
  atLastFile: boolean;
  hasActiveFile: boolean;
  singlePane: boolean;
}>();

const emit = defineEmits<{
  previousFile: [];
  nextFile: [];
  previousChange: [];
  nextChange: [];
}>();
</script>

<template>
  <div class="review-toolbar" aria-label="Diff navigation">
    <slot />
    <div class="review-toolbar__group" aria-label="File navigation">
      <span class="review-toolbar__label" aria-hidden="true">File</span>
      <UiTooltip :text="atFirstFile ? 'Previous file · Alt+Shift+[ · First changed file.' : 'Previous file · Alt+Shift+['">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Previous file"
          :disabled="atFirstFile || !hasActiveFile"
          @click="emit('previousFile')"
        >
          <UiIcon name="previous-file" />
        </button>
      </UiTooltip>
      <!-- next-file, previous-change, next-change follow the identical shape -->
    </div>
  </div>
</template>
```
For `EditorTitle.vue`: copy this button shape for each of previous-change/next-change/previous-file/next-file/`diff-split`/`diff-inline`/`markdown-source`/`markdown-preview`, update tooltip text to the new shortcuts (⌥↑/⌥↓ replacing Alt+Shift+[/]), wrap the diff-layout pair and markdown pair each in their own `role="group" aria-label="…"` per UI-SPEC's Icon Inventory order. `diff-split`/`diff-inline`/`markdown-source`/`markdown-preview` need `:aria-pressed` added (not present in the `ReviewToolbar.vue` precedent — that pattern comes from `ActiveFileToolbar.vue`'s Source/Rendered toggle below).

**Analog 2 — filename/status/counts + toggle-button `aria-pressed`:** `src/web/components/ActiveFileToolbar.vue` (129 lines, to be deleted)

**Computed `effectivePath`/`layoutLabel` (reuse verbatim per RESEARCH.md)** (lines 24-30, 39-52ish):
```typescript
const effectivePath = computed(() => {
  const file = props.selectedFile;
  if (file === undefined) return props.selectedPath;
  return file.status.kind === 'deleted'
    ? file.oldPath?.display ?? props.selectedPath
    : file.newPath?.display ?? file.oldPath?.display ?? props.selectedPath;
});
```

**Filename heading + status badge + counts template** (lines 88-105):
```html
<h1 :id="`${RENAME_MAP.cssPrefix}heading`" tabindex="-1" :title="effectivePath">
  <PathDisplay v-if="selectedFile !== undefined" :file="selectedFile" basename />
  <template v-else>{{ selectedPath }}</template>
</h1>
<template v-if="selectedFile !== undefined">
  <template v-if="standaloneStateLabel !== undefined">
    <StatusBadge :kind="selectedFile.status.kind" reviewable />
    <span class="review-toolbar__status">{{ standaloneStateLabel }}</span>
  </template>
  <!-- layoutLabel / else branches, same shape -->
</template>
<span v-if="counts !== undefined" class="review-toolbar__counts">{{ counts }}</span>
```

**`aria-pressed` toggle-button pattern** (lines 106-119, Source/Rendered — reuse shape for `diff-split`/`diff-inline`/`markdown-source`/`markdown-preview`):
```html
<button type="button" class="ui-button" :aria-pressed="mode === 'source'" @click="emit('toggle-mode', 'source')">Source</button>
```

**`focusHeading`/`focusFilesToggle` expose pattern** (line 85) — `App.vue:894` calls `activeFileToolbar.value?.focusHeading()`; keep an equivalent `defineExpose` on `EditorTitle.vue` and repoint the caller.

---

### `src/web/components/workbench/BottomPanel.vue` (component, props-down/events-up)

**Analog:** `src/web/components/ReviewNotesDialog.vue` (323 lines) — this component's *entire inner markup is reused verbatim*; only the `ModalDialog` wrapper is removed.

**Imports to drop:** `import ModalDialog from './ui/ModalDialog.vue';` (line 13) — nothing else in the import list changes.

**Props/emits:** unchanged (lines 20-50+) — same `open`, `comments`, `summary`, `revision`, `pinnedEndpoints`, `exportState`, `attachedLifecycle`, etc.

**Watch/focus-management pattern — MUST KEEP (RESEARCH.md Pitfall 5)** (lines 82-100):
```typescript
const completionAction = ref<HTMLButtonElement>();
const completionSuccess = ref<HTMLElement>();
const completionFailure = ref<HTMLElement>();

watch(() => [props.attachedLifecycle, props.attachedFailure] as const, ([lifecycle, failure]) => {
  if (lifecycle === 'finishing') void nextTick(() => completionAction.value?.focus());
  if (lifecycle === 'completed') void nextTick(() => completionSuccess.value?.focus());
  if (lifecycle === 'waitingDisconnected' || lifecycle === 'terminalFailure' || failure !== undefined) {
    void nextTick(() => completionFailure.value?.focus());
  }
}, { deep: true });

watch(reviewFailure, (failed) => {
  if (failed) void nextTick(() => failureAlert.value?.focus());
});
```
These four refs/two watchers are **not** modal-specific — they stay unchanged in `BottomPanel.vue`.

**Template un-wrap:**
```html
<!-- BEFORE (ReviewNotesDialog.vue:104-109) -->
<ModalDialog :open="open" title="Review notes" close-aria-label="Close review notes" @close="emit('close')">
  <!-- body content lines 110-323 -->
</ModalDialog>

<!-- AFTER (BottomPanel.vue) -->
<section v-if="open" role="region" aria-label="Review" class="bottom-panel">
  <header class="bottom-panel__header">
    <span class="bottom-panel__label">REVIEW</span>
    <button type="button" class="icon-btn" aria-label="Close panel" @click="emit('close')"><UiIcon name="close" /></button>
  </header>
  <!-- body content lines 110-323, byte-for-byte unchanged -->
</section>
```
What is **removed** along with `ModalDialog` (per UI-SPEC "no focus trap, no Esc-to-close"): `ModalDialog.vue`'s `containFocus` keydown handler, `focusInitial`/`restoreFocus` opener-tracking (`ModalDialog.vue:21-46`) — these were `ModalDialog`-internal, not `ReviewNotesDialog`-internal, so removing the wrapper removes them automatically; no code to delete inside the body itself.

---

### `src/web/components/workbench/StatusBar.vue` (component, props-down/events-up)

**Analog:** `src/web/components/ShellFooter.vue` (20 lines, to be deleted — full file, this is the entire pattern to extend)
```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { SessionResponse } from '../../contracts/api.js';

const props = defineProps<{ readonly session: SessionResponse }>();

const localStatus = computed(() => 'patch' in props.session
  ? 'Local review · frozen patch'
  : 'Local review · pinned commits');
</script>

<template>
  <footer class="shell-footer">
    <span class="shell-footer__local-status">{{ localStatus }}</span>
    <span class="shell-footer__draft-status">Draft stays local · export is explicit</span>
  </footer>
</template>
```
`StatusBar.vue` replaces both static spans with: left — 🔒 (`UiIcon name="lock"`) + short identifier (reuse the same `'patch' in props.session` discriminant style, extended to the five-kind matrix per UI-SPEC's table — exact patch → "Frozen patch" fallback text, committed → `headOid`, etc.); right — three button-like items (open-comment count, Export, Support), each `@click` emitting an `open-panel`/`support` event up to `App.vue`. The Support button's accessible name (`Support ${RENAME_MAP.displayName}`) and its `focusSupport`-returning behavior move here from `IdentityHeader.vue` (see TitleBar.vue's focus-expose note above) — same ref/`defineExpose({ focusSupport })` shape, new host.

---

### `src/web/monaco/diff-adapter.ts` (modified — 8 new `addAction` registrations)

**Analog:** itself — existing `Alt+Enter` registrations, exact shape to copy 8× (2 on each of `originalEditor`/`modifiedEditor` in `PublicMonacoDiffAdapter`, plus 4 on `editor` in `PublicMonacoSinglePaneAdapter`).

**Paired-editor site** (`diff-adapter.ts:178-189`, inside the `this.staticDisposables.push(...)` array in the constructor, lines 121-191):
```typescript
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
New registrations follow this exact shape with new `id`s (e.g. `` `${RENAME_MAP.kindPrefix}.next-change` ``), new `label`s, and:
- `keybindings: [monaco.KeyCode.F7]` / `[monaco.KeyMod.Shift | monaco.KeyCode.F7]` → `run: () => this.<nextChange/previousChange>()` (method needs to call up into `App.vue`'s navigation via the existing `onChange`/command callback convention — check how `activateFocusedAnchor` is already plumbed back to `App.vue` for the exact callback-injection pattern to reuse, since F7/⌥↓/⌥↑ navigate across files, not within the adapter's own anchor state).
- `keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow]` / `[monaco.KeyMod.Alt | monaco.KeyCode.UpArrow]` for next/previous file, same run-callback shape.

**Single-pane site** (`diff-adapter.ts:693-699`, inside the `this.staticDisposables.push(...)` array, lines 685-699):
```typescript
this.editor.addAction({
  id: `${RENAME_MAP.kindPrefix}.add-${side}-comment`,
  label: `Add comment to ${side} line`,
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor(),
}),
```
Same 4 new registrations here too (F7/⇧F7/⌥↓/⌥↑), `run` callbacks pointed at the same navigation methods.

**Import already present** (line 1): `import * as monaco from 'monaco-editor';` — `monaco.KeyCode.F7`, `monaco.KeyMod.Shift`, `monaco.KeyMod.Alt`, `monaco.KeyCode.UpArrow`, `monaco.KeyCode.DownArrow` all resolve off this existing import, no new import needed.

---

### `src/web/App.vue` (modified — `handleKeydown`, shell template region)

**`handleKeydown` chord-replacement site** (lines 914-940; the ⌥⇧[ / ⌥⇧] branches at lines 927-932 must become ⌥↓/⌥↑, F7 branch at line 933 stays, ⌘B/⌘J are new unconditional-`preventDefault` branches to add):
```typescript
function handleKeydown(event: KeyboardEvent): void {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.closest('.inline-comment-composer') !== null) {
    // ...composer-scoped Cmd+Enter / Escape handling, unchanged
    return;
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.altKey && event.shiftKey && event.key === '[') {        // → becomes event.altKey && event.key === 'ArrowUp'
    event.preventDefault();
    previousFile();
  } else if (event.altKey && event.shiftKey && event.key === ']') { // → becomes event.altKey && event.key === 'ArrowDown'
    event.preventDefault();
    nextFile();
  } else if (event.key === 'F7') {
    event.preventDefault();
    event.shiftKey ? previousChange() : nextChange();
  } else if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'r' && isUncommittedSession.value) {
    event.preventDefault();
    // ...refresh
  }
  // NEW: ⌘B/Ctrl+B and ⌘J/Ctrl+J branches go here, unconditional preventDefault,
  // placed BEFORE the early-return guard above (line 926) is irrelevant to them since
  // CONTEXT requires they fire "always ... including inside the editor" — Monaco's own
  // textarea capture means this document-level listener only reaches them when focus is
  // outside Monaco; the Monaco-focused half of "always" is satisfied by `addAction`
  // registrations in diff-adapter.ts only for F7/⇧F7/⌥↑/⌥↓, NOT for ⌘B/⌘J (RESEARCH.md:
  // "⌘B/⌘J are not Monaco conflicts ... no addAction needed").
}
```

**Teleport host — MUST stay `v-show` (RESEARCH.md Pitfall 3, Teleport Stranding)** (`App.vue:1320-1322`):
```html
<!-- v-show, not v-if: Teleport resolves `#changed-files` once, so destroying the host
     strands the teleported tree and the sidebar comes back empty. -->
<div v-show="!isNarrow && !filesCollapsed" id="changed-files" class="changed-files-sidebar"></div>
```
When this host moves inside `WorkbenchShell.vue`, the comment and the `v-show` (never `v-if`) binding must move with it unchanged; sidebar show/hide must toggle via CSS/`v-show` on this div or an ancestor, never via `v-if`.

**`ReviewToolbar` wiring to copy into `EditorTitle.vue`'s parent usage** (`App.vue:1325-1333`):
```html
<ReviewToolbar
  :at-first-file="atFirstFile"
  :at-last-file="atLastFile"
  :has-active-file="selectedFile?.availability.kind === 'text'"
  :single-pane="singlePaneSide !== undefined"
  @previous-file="previousFile"
  @next-file="nextFile"
  @previous-change="previousChange"
  @next-change="nextChange"
/>
```

---

### `src/web/components/workbench/Breadcrumbs.vue` (component, props-down, non-interactive)

**No structural analog** — no existing non-interactive `<nav>` breadcrumb exists. Closest partial analog for path-segment rendering: `src/web/components/PathDisplay.vue` (renders `file.newPath`/`file.oldPath` display segments with file-type-mark convention — reuse its path-segmentation logic, not its interactive affordances). Build per UI-SPEC: `<nav class="breadcrumbs" aria-label="File path">`, `›` separators, no `tabindex`, no click handlers, file-type mark on the last segment reusing the existing file-type-mark visual convention (used today in `FileRow.vue`/`PathDisplay.vue`).

---

### `src/web/model/panel-state.ts` (model, file-I/O + transform)

**Analog 1 — pure clamp/derive function style:** `src/web/model/single-pane-layout.ts` (52 lines, full file) — copy its documentation convention (JSDoc referencing requirement IDs) and pure-function shape for the clamp helpers:
```typescript
export function singlePaneSideFor(kind: ChangedFileStatusKind, availability: Availability): DiffSide | undefined {
  if (availability.kind !== 'text') return undefined;
  return singlePaneStatusSides[kind];
}
```
For `panel-state.ts`: `clampSidebarWidth(value: number): number` / `clampPanelHeight(value: number): number` follow this exact shape (pure, no side effects, single early-return guard).

**Analog 2 — factory-with-refs state-machine style:** `src/web/model/selector-drift-state.ts` (123 lines) — copy its `createXState(...)` factory convention, options-object-with-injectable-dependencies pattern (here: inject `window.localStorage`, not a poll client), and `ShallowRef`-based public state shape:
```typescript
import { shallowRef, type ShallowRef } from 'vue';

export interface SelectorDriftStateOptions {
  readonly document?: SelectorDriftDocument;
  readonly status?: ShallowRef<SelectorDriftResponse | undefined>;
}

export function createSelectorDriftState(
  client: SelectorDriftClient,
  announce: (message: string) => void,
  options: SelectorDriftStateOptions = {},
): SelectorDriftState { /* ... */ }
```
For `panel-state.ts`: `createPanelState(options: { storage?: Storage } = {})` returning `{ sidebarWidth: ShallowRef<number>, sidebarVisible: ShallowRef<boolean>, panelHeight: ShallowRef<number>, persist(): void }`, with `storage` injectable for testability exactly like `selectorDriftState`'s injectable `document`/`setInterval`.

**Schema to implement** (from UI-SPEC/RESEARCH, key `loopnote.workbench.v1`):
```json
{ "sidebarWidth": 264, "sidebarVisible": true, "panelHeight": 240 }
```
Load: `JSON.parse` failure, wrong shape, non-numeric, or out-of-range values → fall back per-field to defaults (264/true/240), never reject the whole object silently without self-healing — re-persist corrected value on next debounced write.

---

## Shared Patterns

### Five-session-kind discriminant (CRITICAL — RESEARCH.md Pitfall 1)
**Source:** `src/web/components/IdentityHeader.vue:29-39`
**Apply to:** `TitleBar.vue` (identity variant), `StatusBar.vue` (snapshot text, Refresh/Export availability), any other new component that branches on session kind.
```typescript
const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => 'base' in props.session ? props.session : undefined);
const uncommittedKey = computed(() => 'uncommitted' in props.session ? props.session.uncommitted : undefined);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isUncommitted = computed(() => uncommittedKey.value !== undefined && !isStandalone.value);
```
Never re-derive a parallel classification shape — every branch must trace back to this exact discriminant.

### Icon-only action button (tooltip + accessible name + shortcut)
**Source:** `src/web/components/ReviewToolbar.vue:25-46`
**Apply to:** `EditorTitle.vue` (all 8 icon actions), `TitleBar.vue` (Refresh/sidebar/panel toggles), `StatusBar.vue` items if icon-fronted, `BottomPanel.vue`'s close button.
```html
<UiTooltip :text="'Action name · Shortcut'">
  <button type="button" class="ui-button ui-button--icon" aria-label="Action name" :disabled="…" @click="emit('action')">
    <UiIcon name="icon-name" />
  </button>
</UiTooltip>
```

### Teleport host must stay `v-show` (CRITICAL — RESEARCH.md Pitfall 3, regression `80c3b92`)
**Source:** `src/web/App.vue:1320-1322`
**Apply to:** `WorkbenchShell.vue`'s `#changed-files` host when relocated.
```html
<div v-show="!isNarrow && !filesCollapsed" id="changed-files" class="changed-files-sidebar"></div>
```
Toggling sidebar visibility must use CSS/`v-show`, never `v-if`, on this div or its ancestor.

### Single live-region owner (RESEARCH.md Pitfall 6)
**Source:** `App.vue`'s `liveMessage`/`liveMessageVersion` refs (lines ~96-97) and their render site (~1461-1463) — not separately excerpted here since the pair stays in `App.vue` unmodified; new chrome (status-bar counts, relocated warning strip) must read the same computed flags for display only and never instantiate a second `aria-live` region.

### Token-root + `CANONICAL_TOKENS` gate (TOK-01)
**Source:** `src/web/styles.css:1-154` (`:root` block) + `scripts/css-token-contract.mjs:1` (`CANONICAL_TOKENS` array) + `src/web/theme/token-contract.ts:10-22` (`parseTokenRoot`/`resolveToken`/`toMonacoHex` re-exports)
**Apply to:** every new token (`--titlebar-height`, `--view-header-height`, `--editor-title-height`, `--breadcrumb-height`, `--statusbar-height`, `--control-height-icon`, `--sidebar-width-min/-max/-default`, `--panel-height-min/-max/-default`, `--font-size-chrome`, `--line-height-chrome`, `--font-size-label`, `--letter-spacing-label`) and every renamed/revalued token (`--file-row-min-height` 34→22px, `--sidebar-width` 294→264px, `--tree-indent` 20→12px, `--radius-control` 6→4px, `--radius-file-row` 5→0px, `--radius-overlay` 10→6px, `--line-height-code` 26→20px).
```css
:root {
  /* existing entries, e.g. */
  --surface-canvas: #0d1117;
  /* new/renamed geometry tokens land here, exact match with CANONICAL_TOKENS */
}
```
```javascript
// scripts/css-token-contract.mjs:1
export const CANONICAL_TOKENS = [
  '--border-control', '--border-default', /* ...alphabetical, add new/rename changed entries here, same commit as styles.css and the var() consumer */
];
```
**Gate mechanics (`scripts/verify-semantic-css.mjs`):** `assertCanonicalTokenSet` requires exact match (no missing, no extra); `assertDeclaredTokensConsumed` requires every declared `--token` to appear inside a literal `var(--token-name)` somewhere outside `:root` in the same commit — land token + `CANONICAL_TOKENS` entry + real consumer together, never "token now, consumer later."

### `addAction` Monaco keybinding override
**Source:** `src/web/monaco/diff-adapter.ts:178-189` (paired) and `:693-699` (single-pane) — see full excerpt under `diff-adapter.ts` pattern assignment above.
**Apply to:** all 8 new F7/⇧F7/⌥↑/⌥↓ registrations across both adapter classes.

### UiIcon glyph addition
**Source:** `src/web/components/ui/UiIcon.vue:2-19` (the `UiIconName` union type) and `:36-59+` (the `v-else-if` chain)
**Apply to:** new glyphs `sidebar` (toggle), `panel` (toggle), `diff-split`, `diff-inline`, `markdown-source`, `markdown-preview`, `close` (panel close).
```typescript
export type UiIconName =
  | 'previous-file'
  | 'next-file'
  // ...existing 13 names...
  | 'disabled';
```
```html
<template v-else-if="name === 'previous-file'">
  <path d="M10.5 2.5H5.25A1.75 1.75 0 0 0 3.5 4.25v7.5c0 .97.78 1.75 1.75 1.75h5.25c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75Z" />
  <path d="m7.5 5.5-2.5 2.5 2.5 2.5M5.25 8H11" />
</template>
```
Each new arm: `stroke="currentColor"`, `stroke-width="1.5"`, 16×16 viewBox, hand-drawn `<path>`s, no new attributes on the parent `<svg>`.

### Packaged-binary e2e per session kind (SHELL-05)
**Source:** `tests/e2e/pinned-session.spec.ts` (committed), `tests/e2e/uncommitted-review.spec.ts` (`mkdtempSync(...'-uncommitted-pack-')`), `tests/e2e/standalone-review.spec.ts` (`mkdtempSync(...'-standalone-pack-')`), `tests/e2e/agent-ready-export.spec.ts` (custody-gated, agent-attached)
**Apply to:** `tests/e2e/workbench-shell-smoke.spec.ts` (new, per SHELL-05) or extended assertions inside the five existing files — all five already use the pack-extract-spawn-`dist/bin/${binCommand}.mjs` pattern; reuse it rather than inventing a sixth fixture mechanism.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/web/composables/useSash.ts` | hook (pointerdown/pointermove/pointerup drag-resize) | event-driven | No prior resizable-sash/split-pane code exists anywhere in `src/web` (confirmed by RESEARCH.md "no prior pattern in codebase"). Build from scratch: `pointerdown` → `setPointerCapture` → `pointermove` (clamp + write inline CSS custom property) → `pointerup` (release capture, debounce persist); `dblclick` resets to default. Follow Vue 3 Composition API composable conventions already used by `useId`/other Vue built-ins imported in `ModalDialog.vue` (i.e., a plain exported function returning refs + handler functions, no class). ~60-80 lines per STACK.md's own estimate. |
| `src/web/components/workbench/Breadcrumbs.vue` structural shape (non-interactive `<nav>`) | component | props-down | No existing non-interactive breadcrumb/path-trail component; `PathDisplay.vue` is the nearest content-shape analog (path segmentation, file-type mark) but has no `<nav>`/breadcrumb semantics to copy structurally — build the `<nav aria-label="File path">` wrapper fresh. |

## Metadata

**Analog search scope:** `src/web/components/`, `src/web/components/ui/`, `src/web/model/`, `src/web/monaco/`, `src/web/theme/`, `src/web/App.vue`, `src/web/styles.css`, `scripts/css-token-contract.mjs`, `scripts/verify-semantic-css.mjs`, `tests/e2e/`, `tests/integration/`
**Files scanned:** ~20 component files, 7 model files, `diff-adapter.ts` (1044 lines, targeted reads), `styles.css` (154-line `:root` block), `token-contract.ts`, `css-token-contract.mjs`, `App.vue` (full 1467-line structure via RESEARCH.md citations + direct reads of lines 1-63, 895-950, 1257-1333)
**Pattern extraction date:** 2026-11-04
