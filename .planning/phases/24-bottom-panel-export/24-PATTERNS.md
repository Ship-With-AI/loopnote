# Phase 24: Bottom Panel & Export - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 11 (3 new components, 1 new model file, 7 modified files)
**Analogs found:** 10 / 11 exact-or-role-match; 1 (`SummarySection.vue`'s debounced autosave `watch`) has **no exact analog anywhere in `src/web/`** — closest structural pieces identified below and flagged explicitly.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/components/workbench/BottomPanel.vue` (modify → tab shell) | component (ARIA tablist shell) | event-driven (click/arrow-key tab activation; forwards children's emits unchanged) | itself — current static `.bottom-panel__label` header (lines 102-109) becomes the tablist; `SummarySection.vue`'s own `role="tablist"`/Edit-Preview tab pair (lines 152-181) is the in-repo `role="tab"`/arrow-key precedent | exact (role-match for the tablist mechanics) |
| `src/web/components/workbench/CommentsTab.vue` (**new**) | component (event-driven grouped list + disclosure) | event-driven (click/Enter row → `reveal` emit); transform (consumes pre-grouped data, no internal sort) | `DirectoryRow.vue` (twistie `▾`/`▸` glyph, lines 85-87) + `FileTree.vue`/`DirectoryRow.vue` recursive `v-for` grouped-list shape (`DirectoryRow.vue:97-131`); local-disclosure convention from `SummarySection.vue:25` / `ExportSection.vue:44` | role-match (twistie + list shape); exact (disclosure-state convention) |
| `src/web/components/workbench/SummaryTab.vue` (**new**) | component (thin wrapper) | event-driven (pure pass-through of `SummarySection`'s props/emits) | `BottomPanel.vue`'s existing pass-through wrapping of `SummarySection`/`ExportSection` (lines 147-184) — same "thin wrapper, no own state" shape | exact |
| `src/web/components/SummarySection.vue` (modify — new 800ms autosave `watch`) | component; new behavior is transform+event-driven (debounced side-effect emit) | transform/event-driven | **No exact debounced-watch analog exists in `src/web/`.** Closest `watch()` shape: itself, `watch(() => props.failure, ...)` (lines 125-127); closest timer-cleanup-on-unmount idiom: `CopyButton.vue`'s `resetTimer`/`clearResetTimer`/`onBeforeUnmount(clearResetTimer)` (lines 15-23, 40) | no-analog for debounce itself; role-match for `watch()` shape and for the unmount-cleanup idiom (see **No Analog Found**) |
| `src/web/components/ExportSection.vue` (modify — absorbs attached-completion state machine) | component (state-machine template + gating) | event-driven (prop-driven lifecycle branching, `watch` → focus-move side effects) | **itself-as-destination** — the block being moved is `BottomPanel.vue:187-321` verbatim, landing beside `ExportSection.vue`'s own existing `watch(() => props.exportState.phase, ...)` focus-move pattern (lines 70-79) | exact (move verbatim; destination's own `watch` is the template for how the moved block's `watch` at `BottomPanel.vue:89-95` should slot in) |
| `src/web/components/workbench/ExportTab.vue` (**new**) | component (thin wrapper) | event-driven (pure pass-through of extended `ExportSection`'s props/emits) | same as `SummaryTab.vue` — `BottomPanel.vue`'s existing thin-wrapper pass-through (lines 166-185) | exact |
| `src/web/components/ExportReceipt.vue` (modify — new "Copy agent prompt" button) | component (clipboard-write action) | event-driven (click → async clipboard write → status message) | itself — `copyDetails()`/`copyAcknowledgedIdentities()` (lines 93-111) `copyMessage` success/failure pattern; sibling `CopyButton.vue` (lines 25-38) is the generic version of the same idiom | exact |
| `src/web/model/panel-state.ts` (modify — new `activeTab` field) | model (reactive state factory) | transform/request-response (synchronous ref + setter, no persistence round-trip) | itself — `panelHeight`/`sidebarWidth`/`sidebarVisible` `shallowRef` + `createPanelState()` return-object pattern (lines 123-171) | exact |
| `src/web/components/workbench/StatusBar.vue` (modify — `openPanel` emit gains a tab param) | component (emit-signature change only) | event-driven (click → emit) | itself — current `emit('openPanel')` call sites (lines 42, 50); Phase 22's planned replacement shape in `22-03-PLAN.md` (Task 1, lines 60-81) | exact |
| `src/web/App.vue` (modify — `revealCommentFromPanel`, `openPanel(tab)`, ⌘S binding) | component (single state owner; event-driven dispatch) | event-driven (keyboard/emit → mutate refs → side-effect `nextTick` focus chain) | `handleKeydown`'s ⌘B/⌘J dual-registration (lines 964-972, 1238, 1296) for ⌘S; Phase 23's planned `jumpThread()` (`23-08-PLAN.md` Task 3, lines 112-120) for `revealCommentFromPanel`'s `selectFile` + `collapsedByCommentId` + `diffWorkspace.value?.revealComment()` chain | exact |
| `src/web/model/comments-tab-groups.ts` (**new**) | model (pure transform) | transform (group-by-path, multi-key sort, pure function) | `src/web/model/comment-groups.ts`'s `orderPathIdentity`/`orderText`/`orderComments`/`groupsForState` comparator-composition style (lines 32-86); `file-tree.ts`'s `flattenFileRows` (lines 186-203) for the file-outer traversal shape | exact |

---

## Pattern Assignments

### `src/web/components/workbench/BottomPanel.vue` (component, event-driven tab shell)

**Role today:** single-section panel with a static uppercase label, hosting `SummarySection`, a comment-count badge row, `ExportSection`, and (lines 187-321) an inline "attached-completion" state machine. All 11 emits are already declared (lines 50-62) and simply forwarded from children — this convention does not change.

**Current header (becomes the tablist)** (`BottomPanel.vue:102-109`):
```vue
<section v-if="open" role="region" aria-label="Review" class="bottom-panel">
  <header class="bottom-panel__header">
    <span class="bottom-panel__label">REVIEW</span>
    <button type="button" class="icon-btn" aria-label="Close panel" @click="emit('close')">
      <UiIcon name="close" />
    </button>
  </header>
```

**In-repo `role="tab"`/arrow-key precedent** already exists one file over — `SummarySection.vue:152-181` (Edit/Preview tabs): `role="tablist"` wrapper, `role="tab"` buttons with `:aria-selected`, `aria-controls`, `:tabindex="mode === X ? 0 : -1"`, and `@keydown.left`/`@keydown.right` calling a `moveTab(event, nextMode)` that both switches mode and moves focus:
```vue
<button
  id="summary-tab-edit" ref="editTab" type="button" role="tab" class="ui-button"
  :class="{ 'ui-button--selected': mode === 'edit' }"
  :aria-selected="mode === 'edit'" aria-controls="summary-panel-edit"
  :tabindex="mode === 'edit' ? 0 : -1"
  @click="selectMode('edit')"
  @keydown.left="moveTab($event, 'preview')" @keydown.right="moveTab($event, 'preview')"
>Edit</button>
```
UI-SPEC's own pseudo-code (`24-UI-SPEC.md:86-96`) is this same shape generalized to 3 tabs via `v-for="tab in TABS"`, plus a `moveTab(-1|1)` wrap-around stepper — the one new piece is `defineExpose({ focusActiveTab })` mirroring `StatusBar.vue`'s existing `defineExpose({ focusSupport })` (`StatusBar.vue:25-29`).

**Emits to keep forwarding unchanged** (`BottomPanel.vue:50-62`):
```ts
const emit = defineEmits<{
  close: [];
  'update:summaryBuffer': [body: string];
  saveSummary: []; cancelSummary: []; cancelExport: []; export: []; reloadLatest: [];
  reviewUnsavedText: []; reviewInlineComposer: [fileId: string]; finishReview: []; reloadAttached: [];
}>();
```
Per UI-SPEC, add `update:activeTab: [tab: PanelTab]` and the new `reveal: [commentId, fileId, side, line]` passthrough from `CommentsTab`; every existing name stays, simply re-emitted from the new child components instead of handled locally.

---

### `src/web/components/workbench/CommentsTab.vue` (new component, event-driven list + disclosure)

**Role:** receives `comments` + `flatFileRows` props, projects them via the new `comments-tab-groups.ts` + Phase 23's unchanged `projectOrphanedCommentGroup()`, renders file-group disclosure rows each with nested comment rows, emits `reveal` on row click/Enter.

**Twistie/collapse-state analog — `DirectoryRow.vue:42-96`:**
```vue
const expanded = computed(() =>
  props.expandedDirectoryIds.has(props.directory.directoryId),
);
...
<div class="tree-row directory-row" role="treeitem" :aria-expanded="expanded" @click="emit('toggleDirectory', directory.directoryId)">
  <span class="directory-row__disclosure" aria-hidden="true">
    {{ expanded ? '▾' : '▸' }}
  </span>
  ...
</div>
<ul v-if="expanded" class="tree-group" role="group">
  <template v-for="child in directory.children" :key="child.kind === 'file' ? child.fileId : child.directoryId">
    ...
  </template>
</ul>
```
UI-SPEC's own Icon Inventory section (`24-UI-SPEC.md:309`) explicitly names this file as the reuse target: *"The file-group twistie reuses `DirectoryRow.vue`'s plain `▾`/`▸` text glyphs, not a `UiIcon`."* Difference: `DirectoryRow.vue` keys expand state off a prop (`expandedDirectoryIds` lifted to `FileTree.vue`'s model); `CommentsTab.vue` instead follows the **session-local, not-lifted-to-`App.vue`** convention below, since UI-SPEC never asks `App.vue` to own per-file-group open/closed state for the Comments tab.

**"Local open ref, not lifted to `App.vue`" convention — `SummarySection.vue:25` and `ExportSection.vue:44`:**
```ts
// SummarySection.vue:25
const open = ref(true);
```
```ts
// ExportSection.vue:44
const open = ref(true);
```
Both are plain component-local `ref<boolean>`, toggled by a local click handler (`SummarySection.vue:141` `@click="open = !open"`; `ExportSection.vue:86` `@click="open = !open"`), never passed in as a prop and never read by `App.vue`. `CommentsTab.vue`'s per-file-group expand/collapse state should follow this exact shape — likely `ref(new Map<string, boolean>())` (file-outer groups, default-expanded) kept local to `CommentsTab.vue`, never threaded through `BottomPanel.vue`/`App.vue` — contrast with Phase 23's `collapsedByCommentId`, which *is* lifted to `App.vue` because it must be mutable from `revealCommentFromPanel` to force-expand a specific thread on reveal (see `App.vue` section below). The two states are orthogonal: file-group disclosure (local to `CommentsTab.vue`) vs. per-thread collapse (owned by `App.vue`, Phase 23).

**Row-state icon table and row click/Enter emit** are given verbatim in UI-SPEC (`24-UI-SPEC.md:188-213`); the emit signature is:
```ts
reveal: [commentId: string, fileId: string, side: DiffSide, line: number];
```
bubbled unchanged through `BottomPanel.vue` to `App.vue`'s new `revealCommentFromPanel` (see that section).

---

### `src/web/components/workbench/SummaryTab.vue` (new component, thin wrapper)

**Role:** mounts the extended `SummarySection.vue` unchanged (same props/emits it has today), per UI-SPEC's Component Split table (`24-UI-SPEC.md:170`). No own logic — this is the same shape `BottomPanel.vue` already uses to wrap `SummarySection`/`ExportSection` today (lines 147-159, 166-185): a template with the child component and `v-bind`/`emit`-forwarding, zero local state.

---

### `src/web/components/SummarySection.vue` (modify — new 800ms autosave `watch`; "Saving…" copy)

**New behavior, locked verbatim (`24-UI-SPEC.md:226-234`, `24-CONTEXT.md:22`):**
```ts
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => props.modelValue, () => {
  clearTimeout(autosaveTimer);
  if (!unsaved.value || props.pending || props.conflict) return;
  autosaveTimer = setTimeout(() => emit('save'), 800);
});
onBeforeUnmount(() => clearTimeout(autosaveTimer));
```
Guard condition `unsaved.value && !props.pending && !props.conflict` is **copied, not reinvented** — it is the exact condition the existing ⌘Enter handler already uses at `SummarySection.vue:97`:
```ts
function onTextareaKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && unsaved.value && !props.pending && !props.conflict) {
    event.preventDefault();
    event.stopPropagation();
    emit('save');
    return;
  }
  ...
```

**No exact debounced-`watch` analog exists anywhere in `src/web/`** — confirmed by grep for `setTimeout`/`debounce` across the whole directory (only 3 hits total: `App.vue:1044-1045` support-dialog auto-close timer, `App.vue:1088` support-status poll backoff timer, `CopyButton.vue:16-38` copy-feedback reset timer — none of them wrap a `watch()`). Two separate closest pieces to copy from instead:

1. **Structural `watch()` shape** (conditional side effect, no debounce) — `SummarySection.vue`'s own existing failure-focus watcher, right below where the new one lands:
```ts
// SummarySection.vue:125-127
watch(() => props.failure, (failed) => {
  if (failed) void nextTick(() => failureAlert.value?.focus());
});
```
or `ExportSection.vue:70-79`'s richer multi-branch version (`watch(() => props.exportState.phase, (phase) => { ... })`).

2. **`setTimeout` + cleanup-on-unmount idiom** — `CopyButton.vue:15-23,40`:
```ts
const feedback = ref<'idle' | 'success' | 'failure'>('idle');
let resetTimer: ReturnType<typeof setTimeout> | undefined;

function clearResetTimer(): void {
  if (resetTimer !== undefined) {
    clearTimeout(resetTimer);
    resetTimer = undefined;
  }
}
...
onBeforeUnmount(clearResetTimer);
```
The new autosave timer should follow this same "module-scope `let` timer variable (not a `ref` — it's not rendered), clear-before-reschedule, `onBeforeUnmount` flush" shape; UI-SPEC's own pseudo-code already does this (`clearTimeout(autosaveTimer)` at the top of the watcher body, `onBeforeUnmount(() => clearTimeout(autosaveTimer))`), it is simply not reusing an existing named helper since none exists.

**Copy change (`24-UI-SPEC.md:238`, `24-CONTEXT.md` copy table):** `status` computed's `'Saving'` string (`SummarySection.vue:39`) gains an ellipsis:
```ts
// current, SummarySection.vue:36-42
const status = computed(() => {
  if (props.conflict) return 'Conflict — unsaved text retained';
  if (props.failure) return 'Save failed';
  if (props.saving) return 'Saving';          // → 'Saving…'
  if (props.retained && unsaved.value) return 'Retained after reload — not saved';
  return unsaved.value ? 'Unsaved' : 'Saved';
});
```

---

### `src/web/components/ExportSection.vue` (modify — absorbs attached-completion state machine)

**This is a move, not an invention — the exact block being relocated is `BottomPanel.vue:187-321` verbatim** (per `24-UI-SPEC.md:259-269`, `24-CONTEXT.md:30`). Its current props (`BottomPanel.vue:39-44`):
```ts
readonly attachedLifecycle?: AttachedLifecycle;
readonly attachedReady?: boolean;
readonly attachedFailure?: FinishReviewResult;
readonly unsavedInlineComposerFile?: Readonly<{ fileId: string; display: string }>;
readonly mutationLocked?: boolean;
readonly isExactPatch?: boolean;
```
and its emits (`BottomPanel.vue:60-61`):
```ts
finishReview: [];
reloadAttached: [];
```
must become `ExportSection.vue` props/emits — `ExportSection.vue` already has `attached?: boolean` (`ExportSection.vue:31`) and already receives/forwards `reloadLatest`/`reviewUnsavedText` (`ExportSection.vue:35-40`), so those two are not duplicated, only the 6 attached-specific ones above are newly added.

**Dependencies that move with the template block** (currently computed/ref'd in `BottomPanel.vue`, used **only** inside lines 187-321, confirmed by reading every use site):
- `attached` (line 70) — **exception:** also consumed by `ExportSection`'s existing `:attached="attached"` binding at line 178, so this computed already exists in the destination's caller contract; after the move it should be recomputed *inside* `ExportSection.vue` from its own new `attachedLifecycle` prop (`computed(() => props.attachedLifecycle !== undefined)`), replacing the externally-passed boolean.
- `attachedHasUnsavedText` (71-74), `attachedBlockedByUnsavedText` (75-77), `attachedBlockedByPending` (78), `attachedBlockedByConflict` (79), `attachedNoFeedback` (80) — used exclusively inside the block (lines 290-319); move verbatim.
- `completionAction`/`completionSuccess`/`completionFailure` refs (81-83) and `finishAttachedReview()` (85-87) — used exclusively inside the block (refs at 207, 200, 217/228/239/250/260/270/281; function called at 283, 320); move verbatim.
- The focus-move `watch` (89-95):
```ts
watch(() => [props.attachedLifecycle, props.attachedFailure] as const, ([lifecycle, failure]) => {
  if (lifecycle === 'finishing') void nextTick(() => completionAction.value?.focus());
  if (lifecycle === 'completed') void nextTick(() => completionSuccess.value?.focus());
  if (lifecycle === 'waitingDisconnected' || lifecycle === 'terminalFailure' || failure !== undefined) {
    void nextTick(() => completionFailure.value?.focus());
  }
}, { deep: true });
```
slots in beside `ExportSection.vue`'s own existing, structurally identical focus-move watcher (`ExportSection.vue:70-79`) — same "`watch` a prop tuple → `nextTick` → `.focus()` on a `ref`" shape, just a second `watch` call, not a merge into one.

**Template anchor point:** the block is gated `v-if="attached"` at `BottomPanel.vue:187` — in `ExportSection.vue` it should render as a new top-level `<section>` sibling inside `#export-section-content` (after the existing `<template v-else>`/readiness-checklist branch at lines 153-170), gated the same way, since `ExportSection.vue`'s own primary-action button must now be the single "Finish review"/"Export review" button per UI-SPEC's dispatch-order rule (`24-UI-SPEC.md:261-267`) rather than two separate buttons living in two different sections as today.

---

### `src/web/components/workbench/ExportTab.vue` (new component, thin wrapper)

Same shape as `SummaryTab.vue` — wraps the now-extended `ExportSection.vue`, forwarding "everything `ExportSection` already receives today, plus the 6 attached props `BottomPanel.vue` currently owns directly" (`24-UI-SPEC.md` Component Split table). No local state; template is a single child component tag plus `v-bind`/`@emit` forwarding, matching `BottomPanel.vue:166-185`'s current `<ExportSection>` usage.

---

### `src/web/components/ExportReceipt.vue` (modify — new "Copy agent prompt" button)

**Analog is itself** — the existing `copyMessage`-based success/failure clipboard pattern, already used twice in this exact file:
```ts
// ExportReceipt.vue:93-101
async function copyDetails(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(receiptDetails.value);
    copyMessage.value = 'Copied export receipt details.';
  } catch {
    copyMessage.value = 'Could not copy. Select the value and copy it manually.';
  }
}
```
```ts
// ExportReceipt.vue:103-111
async function copyAcknowledgedIdentities(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(acknowledgedIdentityDetails.value);
    copyMessage.value = 'Acknowledged identities copied.';
  } catch {
    copyMessage.value = 'Could not copy acknowledged identities. Select and copy the visible values manually.';
  }
}
```
New `copyAgentPrompt()` (UI-SPEC `24-UI-SPEC.md:273-286`, locked verbatim copy) follows the identical try/catch/`copyMessage.value =` shape — third function of the same name-and-shape family, reusing the already-rendered single `copyMessage` status element (`ExportReceipt.vue:203-206`):
```vue
<p v-if="copyMessage !== ''" class="export-receipt__message" :class="{ 'export-receipt__message--error': copyMessage.startsWith('Could not'), 'export-receipt__message--success': !copyMessage.startsWith('Could not') }" :role="copyMessage.startsWith('Could not') ? 'alert' : 'status'">
  <UiIcon :name="copyMessage.startsWith('Could not') ? 'error' : 'check'" />
  <span>{{ copyMessage }}</span>
</p>
```
— no second message element needed; the new button is inserted first in the `v-if="!previous"` actions row (`ExportReceipt.vue:199-202`), before `copyDetails`/`revealDirectory`.

**Generic sibling analog** — `CopyButton.vue:25-38` is the same `try { await navigator.clipboard.writeText(...) } catch { }` shape generalized into a reusable `feedback: 'idle'|'success'|'failure'` component with its own 2s auto-reset timer; `ExportReceipt.vue` deliberately does **not** use `CopyButton.vue` for its three copy actions (confirmed: `ExportReceipt.vue` has no `CopyButton` import) — it keeps its own local `copyMessage` string instead, so the new button must match `copyDetails`/`copyAcknowledgedIdentities`'s local pattern, not `CopyButton.vue`'s.

---

### `src/web/model/panel-state.ts` (modify — new `activeTab` field)

**Exact existing shape to extend** — `PanelState` interface (lines 123-131) and `createPanelState()` (141-171):
```ts
export interface PanelState {
  readonly sidebarWidth: ShallowRef<number>;
  readonly sidebarVisible: ShallowRef<boolean>;
  readonly panelHeight: ShallowRef<number>;
  readonly treeViewMode: ShallowRef<TreeViewMode>;
  readonly treeLineCounts: ShallowRef<TreeLineCountsMode>;
  readonly treeCommentBadges: ShallowRef<boolean>;
  persist(): void;
}
```
```ts
export function createPanelState(options: PanelStateOptions = {}): PanelState {
  const storage = options.storage ?? window.localStorage;
  const initial = parsePanelState(storage.getItem(PANEL_STATE_STORAGE_KEY));

  const sidebarWidth = shallowRef(initial.sidebarWidth);
  ...
  const treeCommentBadges = shallowRef(initial.treeCommentBadges);

  return Object.freeze({
    sidebarWidth,
    ...
    treeCommentBadges,
    persist() {
      const persisted: PersistedPanelState = { sidebarWidth: sidebarWidth.value, ... };
      storage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(persisted));
    },
  });
}
```
Per UI-SPEC (`24-UI-SPEC.md:112-128`), `activeTab` is **session-only** (plain `shallowRef<PanelTab>('comments')`, default on first load, never read from `parsePanelState`/`localStorage`) — it must **not** be added to `PersistedPanelState` (lines 50-57) or to `defaultPersistedPanelState()`/`parsePanelState()`/`persist()`'s serialized object; it is a sibling field on the returned `PanelState` object only, with its own `setActiveTab(tab: PanelTab): void` setter (same "closure-captured `shallowRef`, exposed as a frozen-object field + matching setter method" shape `createPanelState()` already uses for every other field — though note every *other* field here is set directly via `.value =` by its consumer rather than through a named setter method; `setActiveTab` is the first field in this file to get its own named setter, which matches `BottomPanel.vue`'s own `update:activeTab` emit needing a single call site in `App.vue`).

---

### `src/web/components/workbench/StatusBar.vue` (modify — `openPanel` emit gains a tab param)

**Current emit + 2 call sites** (`StatusBar.vue:18-21, 39-53`):
```ts
const emit = defineEmits<{
  openPanel: [];
  support: [];
}>();
```
```vue
<button type="button" class="statusbar__item" @click="emit('openPanel')">
  {{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}
</button>
<button v-if="exportSupported" type="button" class="statusbar__item statusbar__item--emphasis" @click="emit('openPanel')">
  Export
</button>
```
New shape per UI-SPEC (`24-UI-SPEC.md:140-146`) and locked by `24-CONTEXT.md:23` ("the status-bar comment count opens Comments; the status-bar Export/Finish item opens Export"):
```ts
openPanel: [tab: PanelTab];
```
```vue
<button ... @click="emit('openPanel', 'comments')">{{ ... }}</button>
<button v-if="exportSupported" ... @click="emit('openPanel', 'export')">{{ ... }}</button>
```
Phase 22's planned `22-03-PLAN.md` (Task 1, lines 60-81) independently reworks this same button's *label* (open/stale segments, `attachedLifecycle`-driven "Export"/"Finish review"/"Finishing…"/"Finished" text) without touching the `@click` handler — the two phases' changes are orthogonal (label text vs. emit argument) and must both land on the same two `@click` bindings; this phase only adds the `'comments'`/`'export'` literal argument, it does not touch label logic.

---

### `src/web/App.vue` (modify — `openPanel(tab)`, `revealCommentFromPanel`, ⌘S binding)

**`openPanel` today** (lines 387-389) — parameterless:
```ts
function openPanel(): void {
  panelOpen.value = true;
}
```
bound at line 1513: `@open-panel="openPanel"` (binding site itself is unchanged — only the handler's signature changes, same pattern Phase 22 cites). New shape (`24-UI-SPEC.md:150-157`):
```ts
function openPanel(tab: PanelTab): void {
  panelState.setActiveTab(tab);
  panelOpen.value = true;
  void nextTick(() => panelRef.value?.focusActiveTab());
}
```

**⌘S dual-registration analog** — `handleKeydown`'s existing ⌘B/⌘J branch (`App.vue:964-972`), registered/unregistered exactly once each in the existing lifecycle hooks (lines 1238, 1296):
```ts
function handleKeydown(event: KeyboardEvent): void {
  const chromeKey = (event.metaKey || event.ctrlKey) ? event.key.toLowerCase() : '';
  if (chromeKey === 'b' || chromeKey === 'j') {
    event.preventDefault();
    if (!shellModalOpen.value) (chromeKey === 'b' ? toggleSidebar : togglePanel)();
    return;
  }
  ...
}
```
```ts
onMounted(async () => { document.addEventListener('keydown', handleKeydown); ... });
onBeforeUnmount(() => { document.removeEventListener('keydown', handleKeydown); ... });
```
The new ⌘S branch (UI-SPEC pseudo-code, `24-UI-SPEC.md:242-247`) is a new `else if` arm in this same function — `event.preventDefault()` unconditionally (matching the project's "always preventDefault, even when inert" rule the UI-SPEC calls out explicitly, since there is no competing `⌘S` binding anywhere else today), then only dispatch the save path when `panelOpen.value && panelState.activeTab.value === 'summary'`.

**`revealCommentFromPanel` analog** — two existing pieces compose it, both already read above:
1. `App.vue`'s own single live-region owner / `selectFile` / `diffWorkspace.value?.revealComment(...)` primitives (`App.vue:907-908`, `873-877`).
2. Phase 23's planned `jumpThread()` (`23-08-PLAN.md` Task 3, lines 112-120) — the **structural twin** of this new function, already composing the same three pieces for cross-file thread navigation:
```
Add function jumpThread(direction): ... call nextThread/previousThread; if result.entry.fileId !== selectedFile.value?.fileId, call the existing selectFile(result.entry.fileId) helper; regardless of file change, void nextTick(() => { collapsedByCommentId.value = new Map([...collapsedByCommentI… diffWorkspace.value?.revealComment(...) })
```
UI-SPEC gives the exact body to write (`24-UI-SPEC.md:204-213`):
```ts
function revealCommentFromPanel(commentId: string, fileId: string, side: DiffSide, line: number): void {
  if (fileId !== selectedFile.value?.fileId) selectFile(fileId);
  collapsedByCommentId.value = new Map([...collapsedByCommentId.value, [commentId, false]]);
  void nextTick(() => {
    diffWorkspace.value?.revealComment(side, line);
    void nextTick(() => {
      (document.querySelector(`[data-comment-id="${commentId}"] .thread-header`) as HTMLElement | null)?.focus();
    });
  });
}
```
UI-SPEC is explicit that this reuses exactly the three pieces `jumpThread` uses (`selectFile()`, the `collapsedByCommentId` expand-on-arrival map replacement, `diffWorkspace.value?.revealComment(side, line)`), adding only the final `.thread-header` focus-move step that `jumpThread` itself does not need (it only has to land on the thread's container, not rename focus explicitly, since `jumpThread`'s own focus story is handled elsewhere in `23-08-PLAN.md`'s Task 3). **Both `collapsedByCommentId` (the ref) and `diffWorkspace` (the template ref) are Phase 23 artifacts that must exist on disk before this function compiles** — Phase 23 is planned but not yet executed in this tree; this phase's plan must treat those two names as a hard dependency on Phase 23 landing first, not something to stub.

---

### `src/web/model/comments-tab-groups.ts` (new model file, pure transform)

**Comparator-composition style to copy — `comment-groups.ts:32-58`:**
```ts
function orderPathIdentity(left: string, right: string): number {
  const leftBytes = pathBytes(left);
  const rightBytes = pathBytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}
```
```ts
function orderComments(left: ReviewCommentProjection, right: ReviewCommentProjection): number {
  const side = (left.side === 'base' ? 0 : 1) - (right.side === 'base' ? 0 : 1);
  if (side !== 0) return side;
  if (left.line !== right.line) return left.line - right.line;
  if (left.createdAt !== right.createdAt) return orderText(left.createdAt, right.createdAt);
  return orderText(left.id, right.id);
}
```
```ts
function groupsForState(
  comments: readonly ReviewCommentProjection[],
  inventory: readonly ChangedFileInventoryEntry[],
  state: ReviewCommentProjection['state'],
): readonly CommentGroup[] {
  const inventoryOrder = new Map(inventory.map((entry, index) => [entry.identity, index]));
  const groups = new Map<string, { path: ReviewPathIdentity; comments: ReviewCommentProjection[] }>();
  for (const comment of comments) {
    if (comment.state !== state) continue;
    const group = groups.get(comment.path.bytesBase64url) ?? { path: comment.path, comments: [] };
    group.comments.push(comment);
    groups.set(comment.path.bytesBase64url, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftInventory = inventoryOrder.get(left);
      const rightInventory = inventoryOrder.get(right);
      if (leftInventory !== undefined && rightInventory !== undefined) return leftInventory - rightInventory;
      if (leftInventory !== undefined) return -1;
      if (rightInventory !== undefined) return 1;
      return orderPathIdentity(left, right);
    })
    .map(([, group]) => ({ path: group.path, comments: [...group.comments].sort(orderComments) }));
}
```
`comments-tab-groups.ts`'s `projectCommentsTabFileGroups(comments, flatFileRows)` is the **file-outer/state-inner mirror** of this state-outer/file-inner shape: outer grouping key becomes `comment.fileId` (not `comment.path.bytesBase64url` — `WorkspaceComment` identifies files by `fileId: string | null`, `src/web/model/workspace-state.ts:19`, not the base64url path identity `comment-groups.ts` uses), outer order comes from `flatFileRows`'s index (not a separate `inventory` array), and the inner 3-bucket split (open → stale → resolved, per `24-UI-SPEC.md:188-197`) replaces the 2-bucket open/resolved split `groupsForState` does today — same `new Map()`-for-O(1)-grouping, `.sort()`, then `.map()` pipeline shape, same `orderComments`-style numeric-tiebreak comparator (reusable almost verbatim for the within-bucket line-ascending order), but a different bucket key (`state`+`status` combined, not `state` alone) and a different outer key (`fileId`, not `path.bytesBase64url`).

**File-outer traversal-order precedent — `file-tree.ts:186-203`'s `flattenFileRows`:**
```ts
function flattenFileRows(
  nodes: readonly FileTreeNode[],
  output: VisibleFileTreeLeaf[],
): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      flattenFileRows(node.children, output);
    } else {
      output.push(Object.freeze({ ...node, rowId: fileRowId(node.fileId), depth: 0 }));
    }
  }
}
```
This produces the `flatFileRows: readonly VisibleFileTreeLeaf[]` array that is **already** the tree-path order `thread-order.ts`'s planned `flattenThreadOrder()` consumes directly (`23-02-PLAN.md:55`: *"Build a `Map<fileId, number>` [from] `flatFileRows`'s index ... never re-derive tree order independently"*) — `comments-tab-groups.ts` must do the exact same thing: build `const fileOrder = new Map(flatFileRows.map((row, index) => [row.fileId, index]))` once, then `.sort()` file-groups by that index, mirroring both `groupsForState`'s `inventoryOrder` map (above) and `thread-order.ts`'s planned identical idiom — this is the one Map-based O(1)-lookup idiom actually present in this codebase for "get a stable ordinal for a tree-path position," not a lookup inside `flattenFileRows` itself (which has no map — it is a pure depth-first push).

---

## Shared Patterns

These three conventions are each already established exactly once elsewhere in `src/web/` and apply to **multiple** new files in this phase — do not reinvent per-component variants.

**1. Single live-region / `announce()` owner.** `App.vue` owns exactly one `aria-live` element (`App.vue:1549-1551`):
```vue
<p class="visually-hidden" aria-live="polite">
  <span :key="liveMessageVersion" :data-announcement-version="liveMessageVersion">{{ liveMessage }}</span>
</p>
```
fed by the single `announce(message)` function (`App.vue:355-358`):
```ts
function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}
```
`24-UI-SPEC.md:294` explicitly reuses this for export-complete ("toast confirms" via the existing, unchanged `announce('Review export complete. Both files published together.')` call at `App.vue:690`, fired on `result.kind === 'exported'`) rather than introducing a second toast/live-region. Any new announcement this phase needs (e.g. for `revealCommentFromPanel`'s reveal, if one is ever added) must go through this same `announce()` call, never a second `aria-live` element in `CommentsTab.vue`/`SummaryTab.vue`/`ExportTab.vue`.

**2. `copyMessage` success/failure clipboard pattern.** Established at `ExportReceipt.vue:93-111` (two existing functions) and generalized in `CopyButton.vue:25-38`: `try { await navigator.clipboard.writeText(value); message.value = 'Copied ...'; } catch { message.value = 'Could not copy. ...'; }`, rendered through one shared status element keyed off whether the message string starts with `'Could not'` (`ExportReceipt.vue:203-206`) to pick `role="alert"` vs `role="status"` and the error/success icon. `ExportReceipt.vue`'s new `copyAgentPrompt()` is the third function in this family in the same file — reuse the existing `copyMessage` ref and its existing rendered `<p>`, do not add a second message slot.

**3. Session-local `ref`/`ref<Map>`, not lifted to `App.vue`, for disclosure state.** `SummarySection.vue:25` (`const open = ref(true)`) and `ExportSection.vue:44` (`const open = ref(true)`) both keep their own section-collapse state as a plain component-local `ref`, toggled by a local `@click` handler, never a prop from `App.vue` and never read back by it. `CommentsTab.vue`'s per-file-group expand/collapse state (new in this phase) should follow the identical shape — local `ref(new Map<string, boolean>())`, not threaded through `BottomPanel.vue` or `App.vue` — in deliberate contrast to Phase 23's `collapsedByCommentId`, which is lifted to `App.vue` *only* because `revealCommentFromPanel` (also in `App.vue`) needs to force-expand a specific thread from outside the component tree. The rule: disclosure state stays local unless some other part of `App.vue`'s own dispatch needs to reach in and change it — `CommentsTab.vue`'s file-group twisties have no such external caller, so they stay local.

---

## No Analog Found

**`SummarySection.vue`'s new 800ms debounced autosave `watch`** has no exact precedent in `src/web/` — confirmed via `grep -r 'setTimeout|debounce' src/web`, which returns exactly 3 hits, none of them a `watch()`-wrapped debounce: `App.vue:1044-1045` (support-dialog auto-close, a one-shot `setTimeout` with no `watch`), `App.vue:1088` (support-status poll backoff, a self-rescheduling `setTimeout` chain, also no `watch`), and `CopyButton.vue:16-38` (copy-feedback auto-reset, again a bare `setTimeout`/`clearTimeout` pair with no `watch`). The plan should explicitly compose two existing idioms rather than claim a direct analog: `SummarySection.vue`'s/`ExportSection.vue`'s own `watch(() => props.X, callback)` shape for the reactive trigger, and `CopyButton.vue`'s module-scope-timer-variable + `onBeforeUnmount`-flush shape for the timer lifecycle — UI-SPEC's pseudo-code (`24-UI-SPEC.md:227-233`) already does exactly this composition.

---

**Pattern extraction date:** 2026-11-05
