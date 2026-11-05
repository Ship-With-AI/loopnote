# Phase 23: Inline Comment Threads - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 9 (4 modified model/adapter files, 1 modified component, 1 modified shell file, 2 likely-new components, 1 new/extended test matrix)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/monaco/diff-adapter.ts` (generalize `PublicMonacoDiffAdapter` + `PublicMonacoSinglePaneAdapter`) | adapter/controller (Monaco glue) | event-driven (view-zone + widget layout, keyed by comment id) | itself, `originalZone`/`modifiedZone` single-pair fields → `growPairedZones`/`positionZones`/`createComposerZone`/`createSpacerZone`/`rebuildAnchoredLayout` (lines 122-124, 608-700, 1052-1134) | exact (self-generalization, not a different-file analog) |
| `src/web/model/draft-reconciliation.ts` | model/transform | transform (pure function, `DraftComment[] → WorkspaceComment[]`) | itself — `reconcileDraftComments`/`reconcile` (lines 37-62) stay unchanged; new consumer-side diff function is new code, no existing analog inside this file | exact (no structural change needed) / no-analog for the new `diffThreadIds` helper (see **No Analog Found**) |
| `src/web/model/comment-groups.ts` | model/transform | transform (group-by-path, sort, pure function) | itself — `groupsForState`/`projectCommentGroups` (lines 1-101) is the direct analog for any new "Orphaned comments" grouping logic (file-level group pinned at top) | exact |
| `src/web/model/workspace-state.ts` | model/store (reducer) | event-driven (discriminated `WorkspaceEvent` → `WorkspaceTransition`) | itself — `WorkspaceComment`/`WorkspaceEvent`/`WorkspaceController` (lines 17-96) is the type shape new collapse-state / delete-undo-timer / edit-draft-text fields extend | exact |
| `src/web/components/workbench/EditorTitle.vue` | component (toolbar) | request-response (click → emit → parent handles) | itself — existing `previousFile`/`nextFile`/`previousChange`/`nextChange` icon-button group (lines 94-187) is the direct template for new `previous-thread`/`next-thread`/`collapse-threads` buttons | exact |
| `src/web/App.vue` | component (shell / session orchestrator) | event-driven (keydown dispatch, `mutateReview()` request-response, single live-region) | itself — `handleKeydown` (941-975), `mutateReview`/`mutationOperation`/`announce` (582-622, 347-350) are the direct analogs for ⌥F9/⇧⌥F9 dual registration and resolve/reopen/delete/edit mutation dispatch | exact |
| `src/web/components/CommentThread.vue` (**new**) | component (interactive card, mounted via `render()` into widget DOM) | request-response (emits resolve/reopen/edit/delete → parent `mutateReview()`) | `src/web/components/CommentComposer.vue` (structure/footer-actions) + `ReviewStateBadge.vue` (state chip) + the inline `h(...)` card literal in `DiffWorkspace.vue:177-190` (`inline-accepted-comment`) | role-match (composite of three analogs) |
| `src/web/components/UndoToast.vue` (**new**, implied by THREAD-01 delete-with-Undo) | component (transient overlay) | event-driven (timer-driven dismiss + Undo click) | **no toast/snackbar precedent** — UI-SPEC explicitly confirms via `glob` across `src/web/components/`; reuse `.modal-dialog` chrome recipe (`styles.css:736-746`) and `InlineNotice.vue`'s tone/icon pattern for internal layout, but the timer + `pagehide`/`visibilitychange` flush logic has no component analog | no-analog (see **No Analog Found**) — reuse chrome CSS only |
| `src/web/model/thread-order.ts` (**new**, implied by THREAD-07/THREAD-09 — "a likely-new keyed-zone-map model module") | model/transform | transform (pure function: flatten comments into cross-file navigation order) | `src/web/model/file-tree.ts`'s `flatFileRows`/`flattenFileRows` (lines 48, 186-194, 298) for the outer tree-path sort key; `src/web/model/comment-groups.ts`'s `orderComments`/`orderPathIdentity` (lines 32-58) for the Base-before-Head-then-line tiebreak shape | role-match |
| `tests/unit/monaco-diff-adapter.test.ts` (extend) | test | — | itself — existing `describe('PublicMonacoDiffAdapter construction', …)` / `describe('PublicMonacoSinglePaneAdapter unpaired anchor and view-zone wiring', …)` blocks (lines 130, 464) are the template for new keyed-multi-zone assertions | exact |
| `tests/integration/monaco-anchor.spec.ts` (extend) | test | — | itself — `expectPairedZonesAligned` helper (lines 78-87) is the direct template for a parameterized multi-thread alignment assertion | exact |

## Pattern Assignments

### `src/web/monaco/diff-adapter.ts` (adapter, event-driven — generalize in place)

**Analog:** itself, current single-pair fields and helpers.

**Current single-pair state** (lines 122-124):
```typescript
private contextMode: 'collapsed' | 'all-revealed' = 'collapsed';
private originalZone: { id: string; zone: monaco.editor.IViewZone } | undefined;
private modifiedZone: { id: string; zone: monaco.editor.IViewZone } | undefined;
```
Generalize to a keyed map (per CONTEXT.md/UI-SPEC: `Map<CommentId, {anchorZoneId, spacerZoneId, anchorSide}>`), leaving `activeComposer` (the in-progress, not-yet-saved comment) as the **only** remaining single field — it has no `comment.id` yet, so it must not go in the keyed map (per RESEARCH.md Pattern 1).

**Current growPairedZones (the function to generalize, unchanged shape otherwise)** (lines 692-700):
```typescript
private growPairedZones(heightInPx: number): void {
  if (this.originalZone === undefined || this.modifiedZone === undefined) {
    return;
  }
  this.originalZone.zone.heightInPx = heightInPx;
  this.modifiedZone.zone.heightInPx = heightInPx;
  this.originalEditor.changeViewZones((accessor) => accessor.layoutZone(this.originalZone?.id ?? ''));
  this.modifiedEditor.changeViewZones((accessor) => accessor.layoutZone(this.modifiedZone?.id ?? ''));
}
```
Becomes `growPairedZones(commentId, heightInPx)` looking up one pair in the map — **both** `layoutZone()` calls must stay synchronous, back-to-back, inside one `changeViewZones` pass per side (RESEARCH.md Pitfall 1): never let a Vue `nextTick()` separate the two calls for the same thread, or Base/Head rows desync for one frame.

**Current zone creation / positioning (per-pair logic to make per-key)** (lines 608-700, `rebuildAnchoredLayout`/`createComposerZone`/`createSpacerZone`/`positionZones`):
```typescript
private rebuildAnchoredLayout(): void {
  if (this.activeComposer === undefined || this.currentFile === undefined) {
    this.removeZones();
    …
  }
  …
  const anchoredZone = this.createComposerZone(anchor);
  const spacerZone = this.createSpacerZone(anchoredZone.heightInPx ?? 280);
  const anchoredZoneId = this.addZone(anchoredEditor, anchoredZone);
  const spacerZoneId = this.addZone(counterpartEditor, spacerZone);
  if (anchor.side === 'base') {
    this.originalZone = { id: anchoredZoneId, zone: anchoredZone };
    this.modifiedZone = { id: spacerZoneId, zone: spacerZone };
    this.positionZones(anchor.line, counterpartLine);
    …
  } else { … }
}
```
This per-pair logic (`createComposerZone`/`createSpacerZone`/`addZone`/`positionZones`/`growPairedZones`) is already a pure function of `(anchor, heightInPx)`; swap the two private fields for `Map<string, {…}>` entries keyed by `comment.id`, iterating — mechanical generalization per RESEARCH.md Pattern 1, not a redesign. Apply the identical generalization to `PublicMonacoSinglePaneAdapter`'s single-zone fields (`this.zone`, lines 1052-1066) — RESEARCH.md Pitfall 5 flags this class as the easy-to-forget second adapter that must be generalized in the same commit, or standalone/added/deleted-file sessions silently keep the old single-thread model.

**Dual-registration action pattern (template for THREAD-09's ⌥F9/⇧⌥F9 Monaco-side registration)** (lines 199-246, existing F7 pair, unmodified):
```typescript
this.originalEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.next-change-base`,
  label: 'Next change',
  keybindings: [monaco.KeyCode.F7],
  run: () => this.navigate.nextChange(),
}),
this.modifiedEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.next-change-head`,
  label: 'Next change',
  keybindings: [monaco.KeyCode.F7],
  run: () => this.navigate.nextChange(),
}),
```
THREAD-09 copies this exact shape with `monaco.KeyMod.Alt | monaco.KeyCode.F9` / `monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9`, one `addAction` per editor instance (both `originalEditor` and `modifiedEditor`, plus the `PublicMonacoSinglePaneAdapter`'s single `this.editor`, lines 761-784).

**`AdapterNavigation`/`MonacoDiffAdapter` public interface to extend** (lines 50-75):
```typescript
export type AdapterNavigation = Readonly<{
  nextChange: () => void;
  previousChange: () => void;
  nextFile: () => void;
  previousFile: () => void;
}>;

export type MonacoDiffAdapter = Readonly<{
  activateAnchor: (side: DiffSide, line: number, endLine?: number) => void;
  …
  revealAnchor: (anchor: Anchor) => void;
  setAnchorZoneHeight: (heightInPx: number) => void;
  setActiveAnchor: (anchor: Anchor | undefined) => void;
  …
}>;
```
`revealAnchor`/`setActiveAnchor` already exist and cover THREAD-07's "expand-on-arrival + reveal" requirement without new adapter surface; `setAnchorZoneHeight` becomes `setAnchorZoneHeight(commentId, heightInPx)` once keyed.

---

### `src/web/model/draft-reconciliation.ts` (model, unchanged pure function) + new keyed-diff consumer helper

**Analog:** itself.

**Unchanged reconciliation (read-only this phase, per RESEARCH.md Pitfall 4 — do not touch `src/domain/anchor.ts` or add hash-input fields)** (lines 37-62):
```typescript
function reconcile(comment: DraftComment, index: ExactFileIndex): WorkspaceComment {
  const exactFile = index[comment.anchor.side].get(comment.anchor.path.bytesBase64url) ?? UNAVAILABLE_FILE;
  const fileId = exactFile.kind === 'available' ? exactFile.fileId : null;
  return {
    id: comment.id,
    fileId,
    exactFile,
    side: comment.anchor.side,
    line: comment.anchor.line,
    body: comment.body,
    state: comment.state,
    createdAt: comment.createdAt,
    status: comment.verification.state,
    recordedAnchor: comment.anchor,
  };
}

export function reconcileDraftComments(comments: readonly DraftComment[], files: readonly SessionFile[]): readonly WorkspaceComment[] {
  const index = exactFileIndex(files);
  return comments.map((comment) => reconcile(comment, index));
}
```
This already outputs comments keyed by stable `id`; the gap is entirely on the **consumer** side (adapter/`DiffWorkspace.vue`), which today only ever renders zero or one zone so no diffing logic exists yet. New code (not a modification of this file) should follow the shape RESEARCH.md already specifies:
```typescript
// New — generalizes PITFALLS.md Critical Pitfall 3 ("Key zones by comment.id … reuse
// Phase 14's already-proven reconciliation approach")
function diffThreadIds(
  previous: ReadonlySet<string>,
  next: readonly WorkspaceComment[],
): { toCreate: readonly string[]; toRemove: readonly string[]; toKeep: readonly string[] } {
  const nextIds = new Set(next.map((c) => c.id));
  return {
    toCreate: next.filter((c) => !previous.has(c.id)).map((c) => c.id),
    toRemove: [...previous].filter((id) => !nextIds.has(id)),
    toKeep: [...previous].filter((id) => nextIds.has(id)),
  };
}
```
Never call a blanket "clear all zones, re-render everything" path on reconciliation/Refresh — create only for `toCreate`, remove only for `toRemove`, update in place (text/state/height) for `toKeep`.

---

### `src/web/model/comment-groups.ts` (model, transform — template for Orphaned-comments grouping)

**Analog:** itself.

**Group-by-path + sort pattern** (lines 60-86):
```typescript
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
    .sort(([left], [right]) => { … })
    .map(([, group]) => ({ path: group.path, comments: [...group.comments].sort(orderComments) }));
}
```
The file-level "Orphaned comments" group (comments where `verification.state === 'orphaned'`, pinned at the top of the diff area) is the same group-by/sort shape, filtered on `verification.state` instead of `state`. Reuse `orderComments`/`orderPathIdentity` (lines 32-58) for the internal sort rather than re-deriving a tiebreak order.

---

### `src/web/model/workspace-state.ts` (model/reducer — extend event union + comment/file-state shape)

**Analog:** itself.

**Current comment/composer/file-state shape to extend** (lines 17-47):
```typescript
export type WorkspaceComment = Readonly<{
  id: string;
  fileId: string | null;
  exactFile: ExactFileCapability;
  side: DiffSide;
  line: number;
  body: string;
  state: 'open' | 'resolved';
  createdAt: string;
  status: WorkspaceCommentStatus;
  recordedAnchor: RecordedAnchorDetails;
}>;

export type WorkspaceFileState = Readonly<{
  scrollTop: number;
  focused?: Readonly<{ side: DiffSide; line: number }>;
  context: 'collapsed' | 'all-revealed';
  composer?: WorkspaceComposer;
}>;
```
New session-scoped state (collapse flags per comment id, in-progress edit text per comment id, pending-delete timer state) is pure client state per CONTEXT.md/RESEARCH.md ("keep UI-only preferences in browser-local, session-scoped in-memory state") — follows the same `Readonly<{...}>` + optional-field convention already used for `WorkspaceComposer`/`WorkspaceFileState`, not a new persistence authority.

**Current event union to extend** (lines 63-85) — add discriminated variants for resolve/reopen/delete(-with-undo)/edit/collapse/collapse-all/jump-thread in the same style:
```typescript
export type WorkspaceEvent =
  | Readonly<{ type: 'activate-focused-line'; side: DiffSide; line: number; endLine?: number }>
  | Readonly<{ type: 'activate-line'; side: DiffSide; line: number; endLine?: number }>
  | Readonly<{ type: 'add-comment' }>
  …
  | Readonly<{ type: 'show-comment'; commentId: string }>
  | Readonly<{ type: 'switch-file'; fileId: string }>
  | Readonly<{ type: 'view-changed'; scrollTop: number; side: DiffSide; line: number; context: 'collapsed' | 'all-revealed' }>;
```

**Note on mutation dispatch — resolve/reopen/delete/edit do NOT flow through `WorkspaceEvent`/`dispatch()` today.** They flow directly from component emit → `App.vue`'s `mutateReview()` (see App.vue pattern below), matching `addComment`'s existing path. Only session-local UI state (collapse, pending-delete-undo timer, in-progress edit text) belongs in the reducer; the server mutation itself reuses the existing `mutateReview()` dispatch, not a new reducer branch.

---

### `src/web/components/workbench/EditorTitle.vue` (component, toolbar — template for thread-nav icon group)

**Analog:** itself — existing prev/next-file and prev/next-change icon-button groups.

**Icon-button-with-tooltip-and-disabled-state pattern** (lines 114-160):
```vue
<template v-if="!singlePane">
  <UiTooltip text="Previous change · Shift+F7">
    <button
      type="button"
      class="ui-button ui-button--icon"
      aria-label="Previous change"
      :disabled="!hasActiveFile"
      @click="emit('previousChange')"
    >
      <UiIcon name="previous-change" />
    </button>
  </UiTooltip>
  <UiTooltip text="Next change · F7">
    <button type="button" class="ui-button ui-button--icon" aria-label="Next change" :disabled="!hasActiveFile" @click="emit('nextChange')">
      <UiIcon name="next-change" />
    </button>
  </UiTooltip>
  <span class="editor-title__separator" aria-hidden="true" />
</template>
```
New `previous-thread`/`next-thread` buttons follow this exact shape (new `UiIconName` glyphs per UI-SPEC's Icon Inventory), with `aria-label`/`title` pair sourced from props (no-threads-anywhere-in-session → disabled, per UI-SPEC keyboard table). The `collapse-threads`/`expand-threads` toggle is a **single** mutually-exclusive icon/label pair (not two buttons) — same pattern as the existing `renderSideBySide` toggle group (lines 162-187) where `aria-pressed`/icon swap on one shared boolean, but here label text itself swaps (`"Collapse all threads"` ⇄ `"Expand all threads"`) rather than just `aria-pressed`, per CONTEXT.md's "label reflects action, not current state" rule and the `20-UI-REVIEW.md` lesson (never ship two differently-labelled controls for one piece of state).

**Emits block to extend** (lines 24-32):
```typescript
const emit = defineEmits<{
  toggleFiles: [];
  'toggle-mode': [mode: 'source' | 'rendered'];
  previousFile: [];
  nextFile: [];
  previousChange: [];
  nextChange: [];
  'toggle-layout': [renderSideBySide: boolean];
}>();
```
Add `previousThread: []`, `nextThread: []`, `'toggle-collapse-all': []` in the same flat-emit style.

---

### `src/web/App.vue` (shell — template for keydown dual registration, mutation dispatch, announce)

**Analog:** itself.

**Document-level keydown dual-registration (THREAD-09's outside-editor half)** (lines 941-975, registered at 1215/1273):
```typescript
function handleKeydown(event: KeyboardEvent): void {
  const chromeKey = (event.metaKey || event.ctrlKey) ? event.key.toLowerCase() : '';
  …
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.closest('.inline-comment-composer') !== null) { … return; }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.altKey && event.key === 'ArrowUp') {
    event.preventDefault();
    previousFile();
  } else if (event.altKey && event.key === 'ArrowDown') {
    event.preventDefault();
    nextFile();
  } else if (event.key === 'F7') {
    event.preventDefault();
    event.shiftKey ? previousChange() : nextChange();
  } …
}
```
Add an `else if (event.key === 'F9')` branch (`event.altKey` required, `event.shiftKey` selects next vs previous) calling new `previousThread()`/`nextThread()` functions — this is the "+ one new branch in App.vue's handleKeydown" RESEARCH.md Pattern 4 specifies, paired with the Monaco-side `addAction` registration in `diff-adapter.ts`. Per RESEARCH.md Pitfall 7 (anti-pattern guard), both halves are mandatory — registering only one makes the shortcut silently inert in the other focus context.

**Mutation dispatch + announce copy table (resolve/reopen/delete/edit all route through this unchanged)** (lines 582-622):
```typescript
function mutationOperation(request: DraftMutationRequest): … {
  switch (request.type) {
    case 'setSummary': return 'summary';
    case 'editComment': return 'comment';
    case 'deleteComment': return 'delete';
    case 'resolveComment': return 'resolve';
    case 'reopenComment': return 'reopen';
    case 'addComment': return 'add';
  }
}

function mutateReview(request: DraftMutationRequest, successfulBuffer?: 'summary' | string): void {
  if (attachedMutationLocked.value || reviewState === undefined || sessionClient === undefined || !reviewState.start(mutationOperation(request))) return;
  reviewFailure.value = null;
  refreshReviewSnapshot();
  … // on success:
  announce(
    request.type === 'setSummary'
      ? 'Summary saved locally.'
      : request.type === 'resolveComment'
        ? `Comment resolved. ${open} open, ${resolved} resolved.`
        : request.type === 'reopenComment'
          ? `Comment reopened. ${open} open, ${resolved} resolved.`
          : request.type === 'deleteComment'
            ? `Comment deleted. ${open} open, ${resolved} resolved.`
            : 'Comment saved locally.',
  );
}
```
This is **already wired end-to-end** for `editComment`/`deleteComment`/`resolveComment`/`reopenComment` — `CommentThread.vue`'s emits (`resolve`/`reopen`/`edit`/`delete`) call straight into existing `mutateReview({ type: 'resolveComment', expectedRevision, commentId })` etc. with **zero new dispatch code**, only new call sites. The delayed-commit delete (5s Undo) means the `deleteComment` `mutateReview()` call itself is deferred behind the timer/flush logic — it is sent later with the same shape, not changed.

**Single live-region owner (reused unchanged for `"Wrapped to first/last thread"` / `"Comment restored."`)** (lines 347-350, 1519-1521):
```typescript
function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}
```
```vue
<p class="visually-hidden" aria-live="polite">
  <span :key="liveMessageVersion" :data-announcement-version="liveMessageVersion">{{ liveMessage }}</span>
</p>
```
No second `aria-live` region is introduced anywhere in this phase (UndoToast uses `role="status"` on its own container instead, per UI-SPEC).

---

### `src/web/components/CommentThread.vue` (**new**, component — composite of three analogs)

**Analogs:** `CommentComposer.vue` (footer-actions/textarea structure), `ReviewStateBadge.vue` (state chip), `DiffWorkspace.vue`'s inline `h(...)` literal (lines 177-190, current read-only accepted-comment card — the thing this component replaces/generalizes).

**Card structure to generalize (current read-only `h()` literal mounted per-zone in `DiffWorkspace.vue`)** (lines 177-190):
```typescript
render(h('section', { class: 'conversation-card inline-accepted-comment', 'data-comment-id': comment.id }, [
  h('header', { class: 'conversation-card__header' }, [
    h('h3', { tabindex: -1, class: 'conversation-card__identity' }, [
      h(PathText, { display: props.path }),
      h('span', ` · ${commentSideName(comment.side)} · line ${comment.line}`),
    ]),
    h('div', { class: 'conversation-card__badges' }, [
      h(ReviewStateBadge, { kind: comment.state, label: comment.state === 'open' ? 'Open' : 'Resolved' }),
      h(ReviewStateBadge, { kind: 'verified', label: 'Verified' }),
    ]),
  ]),
  h('div', { class: 'conversation-card__body' }, [h('p', comment.body)]),
  h('footer', { class: 'conversation-card__footer' }, [h('span', { class: 'comment-badge' }, 'Saved locally')]),
]), zone);
```
`CommentThread.vue` becomes a real `.vue` SFC (not an inline `h()` literal) mounted the same way — `render(h(CommentThread, {...props, onResolve, onReopen, onEdit, onDelete}), widgetDomNode)` — matching how `CommentComposer`/`CommentThread` siblings are already mounted into zone DOM today (`DiffWorkspace.vue:201-211`, see below). Comment body text stays plain Vue interpolation/`h('p', comment.body)` (auto-escaping) — never `v-html`/`innerHTML` (RESEARCH.md Security Domain, XSS mitigation).

**Vue-component-into-widget-DOM mount pattern (unchanged mechanism, now targets an overlay/content widget node instead of only a view-zone node)** (lines 200-211):
```typescript
const shouldFocusComposer = focusComposerAnchor === composerAnchor(props.composer.side, props.composer.line);
render(h(CommentComposer, {
  ...props.composer,
  path: props.path,
  mutationsLocked: props.mutationsLocked,
  onCancel: () => emit('cancel'),
  onAdd: () => emit('add'),
  …
}), zone);
```

**Props/emits + footer-action structure to copy** (`CommentComposer.vue`, lines 8-26, 85-100):
```typescript
const props = defineProps<{
  path: string;
  side: DiffSide;
  line: number;
  text: string;
  status: 'ready' | 'pending' | 'confirm-discard' | 'confirm-move';
  mutationsLocked?: boolean;
  validation?: string;
  error?: string;
}>();

const emit = defineEmits<{
  add: [];
  cancel: [];
  confirmDiscard: [];
  confirmMove: [];
  keepWriting: [];
  updateText: [text: string];
}>();
```
```vue
<footer v-else class="conversation-card__footer">
  <div class="conversation-card__actions">
    <button type="button" class="ui-button ui-button--primary" :disabled="mutationDisabled" @click="emit('add')">…</button>
    <button type="button" class="ui-button ui-button--destructive" :disabled="mutationDisabled" @click="emit('cancel')">Discard draft</button>
  </div>
</footer>
```
`CommentThread.vue` emits `resolve`/`reopen`/`edit`/`delete`/`toggleCollapse` in the same flat-array emit style; header action icons use the **non-toolbar** `.icon-btn` class (`styles.css:576-591`), not `.ui-button--icon` (UI-SPEC explicitly distinguishes these — `.icon-btn` is the `TitleBar.vue`/`BottomPanel.vue` contextual-icon convention, reserved for inside-card actions; `.ui-button--icon` stays reserved for the `EditorTitle.vue` toolbar row).

**State chip usage (unchanged component, new `size="compact"` prop per UI-SPEC)** (`ReviewStateBadge.vue`, full file, 44 lines):
```vue
<script setup lang="ts">
import UiIcon, { type UiIconName } from './UiIcon.vue';
type ReviewStateKind = 'open' | 'resolved' | 'verified' | 'stale' | 'unavailable' | …;
const props = defineProps<{ kind: ReviewStateKind; label: string }>();
const icons: Readonly<Record<…, UiIconName>> = { open: 'open', resolved: 'check', stale: 'warning', unavailable: 'warning', … };
</script>
<template>
  <span class="review-state-badge" :class="`review-state-badge--${props.kind}`">
    <UiIcon :name="icons[props.kind]" />
    <span>{{ props.label }}</span>
  </span>
</template>
```
Add `size?: 'default' | 'compact'` prop → `:class="[..., props.size === 'compact' && 'review-state-badge--compact']"`, new CSS rule only (no new size token, reuses `--font-size-label`/11px per UI-SPEC).

**Warning-row body for Anchor-moved copy (reuse unchanged)** — `InlineNotice.vue` full file (53 lines): `<InlineNotice tone="warning">Line changed since comment. Export marks <strong>stale</strong>; re-anchor or keep as is.</InlineNotice>` — same component/tokens as every other warning notice in the app (RESEARCH.md/UI-SPEC both lock this reuse).

---

### `src/web/components/UndoToast.vue` (**new**, no analog — reuse chrome CSS only)

**No component precedent** (confirmed by `glob` across `src/web/components/` — `.modal-dialog` is the nearest *chrome recipe*, not a component, already reused by `22-UI-SPEC.md`'s identity popover):
```css
/* styles.css:736-746 */
.modal-dialog {
  display: grid;
  width: var(--dialog-width);
  max-height: var(--dialog-max-height);
  gap: var(--space-4);
  padding: var(--space-6);
  overflow-y: auto;
  border: 1px solid var(--border-overlay);
  border-radius: var(--radius-overlay);
  background: var(--surface-raised);
  box-shadow: var(--shadow-overlay);
}
```
Build `.undo-toast` as a new class with this same border/radius/background/shadow recipe (no new hex, no new token) — UI-SPEC already pins this exact approach. The 5s timer + `pagehide`/`visibilitychange` flush is new logic; register exactly one `pagehide` listener and one `visibilitychange` listener (idempotent flush, no-op if already committed/undone) in `App.vue`'s existing `onMounted`/`onBeforeUnmount` pair (lines 1214-1275) alongside the existing `document.addEventListener('keydown', handleKeydown)` registration — same single-owner-per-listener discipline already used there.

---

### `src/web/model/thread-order.ts` (**new**, implied keyed-zone-order model — "a likely-new keyed-zone-map model module")

**Analogs:** `file-tree.ts`'s `flatFileRows` (outer tree-path sort key), `comment-groups.ts`'s `orderComments`/`orderPathIdentity` (tiebreak shape).

**Tree-path file order already produced by Phase 21 (consume, do not re-derive)** (`file-tree.ts`, lines 48, 186-194, 298):
```typescript
export interface FileTreeModel {
  readonly tree: readonly FileTreeNode[];
  readonly visibleRows: readonly VisibleFileTreeRow[];
  readonly flatFileRows: readonly VisibleFileTreeLeaf[];
  …
}

function flattenFileRows(nodes: readonly FileTreeNode[], output: VisibleFileTreeLeaf[]): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      flattenFileRows(node.children, output);
    } else {
      output.push(Object.freeze({ … }));
    }
  }
}
```
`flatFileRows` is exactly "tree path order" per CONTEXT.md's locked ⌥F9/⇧⌥F9 ordering ("tree path order (Phase 21 order), then Base before Head, then line"). Per this assignment's own constraint, do not edit `FileTree.vue`/`file-tree.ts` — only consume `flatFileRows`'s already-exposed order as the outer sort key.

**Base-before-Head-then-line tiebreak shape (same comparator style to copy)** (`comment-groups.ts`, lines 43-58, elided body — comparator returns negative/zero/positive, composed left-to-right):
```typescript
function orderComments(left: ReviewCommentProjection, right: ReviewCommentProjection): number {
  // existing: orders by side then line then createdAt/id tiebreak
}
```
New `orderThreads(fileOrder: ReadonlyMap<fileId, index>) => (a, b) => number` composes `fileOrder` lookup → `side === 'base' ? -1 : 1` tiebreak → `line - line` tiebreak, in the same multi-step comparator style already used by `groupsForState`'s outer `.sort()` call (lines 73-81).

---

## Shared Patterns

### Keyed-map generalization (zones, zone-diffing, thread order)
**Source:** `diff-adapter.ts:122-124,608-700` (single pair → `Map<CommentId, …>`); `draft-reconciliation.ts` consumer-side `diffThreadIds`; `workspace-state.ts`'s existing `Readonly<Record<string, WorkspaceFileState>>` keyed-by-`fileId` convention (lines 52, 103-115) is the established precedent for "keyed-by-id Readonly<Record/Map>" state shape in this codebase.
**Apply to:** `diff-adapter.ts` zone map, new collapse-state map, new in-progress-edit-text map, new pending-delete-undo-timer map.
```typescript
function replaceFileState(state: WorkspaceState, fileId: string, replacement: WorkspaceFileState): WorkspaceState {
  return { ...state, files: { ...state.files, [fileId]: replacement } };
}
```

### Dual-registration keybindings (document-level + Monaco `addAction`)
**Source:** `App.vue:962-970` (`handleKeydown`) + `diff-adapter.ts:199-246,761-784` (`addAction` per editor side).
**Apply to:** ⌥F9/⇧⌥F9 previous/next-thread. Both halves mandatory (RESEARCH.md Pitfall 7) — verify with the same dual-focus-context test shape F7/Alt-arrow tests already use.

### Single live-region owner
**Source:** `App.vue:347-350,1519-1521` (`announce()`/`liveMessage`/`liveMessageVersion`).
**Apply to:** Wraparound announcements, "Comment restored.", resolve/reopen/edit/delete announce copy (all copy already exists except the two new wraparound strings and "Comment restored.").

### Mutation request → `mutateReview()` dispatch (zero schema change)
**Source:** `App.vue:582-622`; `api.ts:47-70` (`DraftMutationRequestSchema` discriminated union already has `editComment`/`deleteComment`/`resolveComment`/`reopenComment`).
**Apply to:** `CommentThread.vue`'s resolve/reopen/edit/delete emits — call `mutateReview({ type: 'resolveComment', expectedRevision, commentId })` etc. directly; no new request shape.

### Read-only anchor/verification consumption (never call into `src/domain/anchor.ts`)
**Source:** `draft.ts:62-66` (`AnchorVerificationSchema`), `draft.ts:131-148` (`DraftCommentSchema`), `workspace-state.ts:8,17-28` (`WorkspaceCommentStatus`, `WorkspaceComment.status`/`.recordedAnchor`).
**Apply to:** State-chip rendering (`comment.state`/`comment.status`/`comment.recordedAnchor`), Anchor-moved/Anchor-missing copy. Never add new fields to `buildDurableAnchor`'s inputs or touch `src/domain/anchor.ts` (RESEARCH.md Pitfall 4 — golden-hash regression risk).

### XSS-safe comment body rendering
**Source:** `DiffWorkspace.vue:188` — `h('div', { class: 'conversation-card__body' }, [h('p', comment.body)])` (Vue text interpolation, auto-escaping).
**Apply to:** `CommentThread.vue` body rendering — never `v-html`/`innerHTML` for comment text.

### `.conversation-card` chrome base + `.icon-btn` vs `.ui-button--icon` distinction
**Source:** `styles.css:218-234` (`.conversation-card`/`.inline-comment-composer`/`.inline-accepted-comment` shared border/radius/background rule); `styles.css:576-591` (`.icon-btn`, contextual non-toolbar icon actions) vs `EditorTitle.vue`'s `.ui-button--icon` (toolbar-grouped).
**Apply to:** `CommentThread.vue` frame (new 2px state-coloured top-rule override only); thread header action buttons use `.icon-btn`, editor-title thread-nav buttons use `.ui-button--icon`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/web/components/UndoToast.vue` | component (transient overlay) | event-driven (timer + flush) | No toast/snackbar component precedent anywhere in `src/web/components/` (confirmed by UI-SPEC's own `glob` search); only a CSS chrome recipe (`.modal-dialog`) to reuse, not a component shape. The 5s-timer + `pagehide`/`visibilitychange`-flush logic is new — closest behavioral precedent is `App.vue`'s existing single-listener-pair discipline (`keydown` add/remove in `onMounted`/`onBeforeUnmount`), not a toast-specific pattern. |
| New `diffThreadIds`-shaped keyed-zone diff function (consumer of `draft-reconciliation.ts`) | model/transform | transform | No existing consumer ever rendered more than one zone/widget at a time, so no "diff what's already rendered against what's next" logic exists yet in this codebase. RESEARCH.md supplies the exact target shape (quoted above); it is new code, not a modification of an existing analog. |
| Overlay-widget-driven-by-`onDomNodeTop` positioning (content/overlay widget layer itself) | adapter (Monaco glue) | event-driven (scroll-synced layout) | Today's single composer only uses a view zone's own `domNode`; no content/overlay widget exists anywhere in the current adapter. RESEARCH.md Pattern 2 supplies the target shape from Monaco's own installed `.d.ts` plus cited external precedent — this is genuinely new adapter surface, proven only by Plan 01's go/no-go spike, not by an in-repo analog. |
| `tests/performance/thread-input-lag.mjs` (or equivalent spike measurement script) | test (throwaway) | — | No existing harness measures browser-side input-to-paint latency specifically (RESEARCH.md "Wave 0 gap"). `tests/performance/production-picker.mjs:278-304`'s timestamp-delta technique is the closest *technique* to adapt, but no file measures this *kind* of latency today. |

## Metadata

**Analog search scope:** `src/web/monaco/`, `src/web/model/`, `src/web/components/` (incl. `ui/` and `workbench/`), `src/web/App.vue`, `src/contracts/api.ts`, `src/contracts/draft.ts`, `src/web/styles.css`, `tests/unit/monaco-diff-adapter.test.ts`, `tests/integration/monaco-anchor.spec.ts`.
**Files scanned:** diff-adapter.ts, draft-reconciliation.ts, comment-groups.ts, workspace-state.ts, workspace-command.ts, file-tree.ts, EditorTitle.vue, App.vue, DiffWorkspace.vue, CommentComposer.vue, InlineNotice.vue, ReviewStateBadge.vue, UiIcon.vue, api.ts, draft.ts, styles.css, monaco-diff-adapter.test.ts, monaco-anchor.spec.ts.
**Pattern extraction date:** 2026-11-05
