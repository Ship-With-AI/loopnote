# Phase 13: Single-Pane File Rendering - Pattern Map

**Mapped:** 2026-10-30
**Files analyzed:** 10 (6 source files + 4 test files)
**Analogs found:** 10 / 10 (all analogs are in-file siblings — this phase is pure modification, no new files)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/web/monaco/diff-adapter.ts` | utility/service (Monaco editor adapter) | event-driven | `PublicMonacoDiffAdapter` class, same file (`createDiffEditor` construction, per-side event wiring, `setFile`) | exact (sibling factory in same file) |
| `src/web/components/StatusBadge.vue` | component | transform (props → presentation) | itself — `presentation` computed + `.visually-hidden` label | exact |
| `src/web/components/ActiveFileToolbar.vue` | component | request-response (props → header markup) | itself (`status.kind` text being replaced) + `FileRow.vue` (badge-then-text pairing precedent) | exact / role-match |
| `src/web/components/DiffWorkspace.vue` | component | request-response + event-driven | itself — existing side-by-side `<template>` branch, `visibleSides` discriminator computed | exact |
| `src/web/App.vue` | composition root / layout router | request-response | itself — existing `availability.kind === 'text'` routing (L152, L292, L1150) and `source-kind` discriminator prop already threaded into `DiffWorkspace` (L1179) | exact |
| `src/web/components/ReviewToolbar.vue` | component | request-response | itself — "File navigation" group (always-visible) vs. "Change navigation" group (to gate) | exact |
| `tests/unit/monaco-diff-adapter.test.ts` | test | — | itself — `vi.hoisted` Monaco mock factory (`codeEditor()`, `changeViewZones`, decoration collections) | exact |
| `tests/unit/anchor.test.ts` | test | — | itself — `buildDurableAnchor`/`verifyDurableAnchor` side-agnostic fixtures | exact (no anchor.ts change expected; extend fixtures only if planner finds a gap) |
| `tests/unit/file-tree.test.ts` | test | — | itself — `sessionFile()` fixture builder, `FileTreeLeaf`/`effectivePath` assertions | exact |
| `tests/e2e/anchored-review.spec.ts` | test (Playwright e2e) | — | itself — `activateMonacoLine`/`openGeneratedReview` helpers, picker→comment→export flow | exact |

No `line-mapping.test.ts` exists in the repo (CONTEXT.md's "line-mapping (or similar)" referred to `counterpartBoundary`, which research confirms is diff-only and **unchanged** — `src/web/monaco/line-mapping.ts` stays as-is; `DiffSide` type is simply reused). No new test file is implied.

## Pattern Assignments

### `src/web/monaco/diff-adapter.ts` (utility/service, event-driven)

**Analog:** same file, `PublicMonacoDiffAdapter` class and `createMonacoDiffAdapter` factory (L628-634)

**Imports pattern** (lines 1-9):
```typescript
import * as monaco from 'monaco-editor';

import { TOKEN_ROOT_CSS } from 'virtual:cumpa-tokens';

import { counterpartBoundary, type DiffSide } from './line-mapping';
import { buildDiffDecorations } from './diff-semantics';
import { applyCumpaTheme } from './theme';
import { parseTokenRoot, resolveToken } from '../theme/token-contract';
import type { WorkspaceCommand } from '../model/workspace-command.js';
```
New single-pane module/class must reuse `applyCumpaTheme`, `TOKENS`/`CODE_DENSITIES` (already module-scope constants, L73-90) — no new theme or token import needed per D-01's "no separate theme call."

**Direct creation-path pattern to parallel** (constructor, lines 117-151):
```typescript
constructor(
  private readonly host: HTMLElement,
  private readonly languageForPath: (path: string) => string,
  private readonly onChange: () => void,
) {
  applyCumpaTheme();
  this.diffEditor = monaco.editor.createDiffEditor(host, {
    ariaLabel: 'Immutable base and head side-by-side diff',
    automaticLayout: false,
    diffAlgorithm: 'advanced',
    diffWordWrap: 'off',
    fontFamily: CODE_FONT_FAMILY,
    fontSize: CODE_FONT_SIZE,
    lineHeight: CODE_LINE_HEIGHT,
    glyphMargin: true,
    minimap: { enabled: false },
    occurrencesHighlight: 'off',
    originalEditable: false,
    readOnly: true,
    renderSideBySide: true,
    renderSideBySideInlineBreakpoint: 0,
    useInlineViewWhenSpaceIsLimited: false,
    hideUnchangedRegions: HIDE_UNCHANGED_REGIONS,
    renderIndicators: false,
    renderGutterMenu: false,
    renderMarginRevertIcon: false,
  });
  this.originalEditor = this.diffEditor.getOriginalEditor();
  this.modifiedEditor = this.diffEditor.getModifiedEditor();
  this.originalDiffDecorations = this.originalEditor.createDecorationsCollection();
  this.modifiedDiffDecorations = this.modifiedEditor.createDecorationsCollection();
  this.originalSelectionDecorations = this.originalEditor.createDecorationsCollection();
  this.modifiedSelectionDecorations = this.modifiedEditor.createDecorationsCollection();
  this.originalEditor.getContainerDomNode().classList.add('monaco-diff-pane--base');
  this.modifiedEditor.getContainerDomNode().classList.add('monaco-diff-pane--head');
```
The single-pane constructor swaps `monaco.editor.createDiffEditor(host, {...diff-only options...})` + `getOriginalEditor()/getModifiedEditor()` for a single `monaco.editor.create(host, {...})` call — no `renderSideBySide`, `diffAlgorithm`, `diffWordWrap`, `hideUnchangedRegions`, `originalEditable` (none of those options exist on `IStandaloneEditorConstructionOptions`). Keep `fontFamily`/`fontSize`/`lineHeight`/`minimap`/`readOnly`/`glyphMargin` — these are shared `IEditorOptions`. `monaco.editor.create` returns `IStandaloneCodeEditor` directly (confirmed same type as `originalEditor`/`modifiedEditor`, `diff-adapter.ts:94-96` and `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts:947`), so one `createDecorationsCollection()` call replaces the paired `original.../modified...` pair, and one `classList.add('monaco-pane--single')`-style class replaces the two `monaco-diff-pane--base/head` calls.

**Per-side event wiring to reuse verbatim against the single editor instance** (lines 152-186):
```typescript
this.staticDisposables.push(
  this.diffEditor.onDidUpdateDiff(() => { ... }),           // ← DROP: no diff computation on plain editor
  this.originalEditor.onDidFocusEditorText(() => this.captureFocusedSide('base')),
  this.modifiedEditor.onDidFocusEditorText(() => this.captureFocusedSide('head')),
  this.originalEditor.onDidChangeCursorPosition((event) => this.captureCursor('base', event.position.lineNumber)),
  this.modifiedEditor.onDidChangeCursorPosition((event) => this.captureCursor('head', event.position.lineNumber)),
  this.originalEditor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
  this.modifiedEditor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
  this.originalEditor.onDidChangeModel(() => this.refreshSelectionDecorations()),
  this.modifiedEditor.onDidChangeModel(() => this.refreshSelectionDecorations()),
  this.originalEditor.onMouseMove((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
  this.modifiedEditor.onMouseMove((event) => this.captureAffordance('head', event.target.position?.lineNumber)),
  this.originalEditor.onMouseDown((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
  this.modifiedEditor.onMouseDown((event) => this.captureAffordance('head', event.target.position?.lineNumber)),
  this.originalEditor.onDidScrollChange(() => this.refreshAnchorAffordance()),
  this.modifiedEditor.onDidScrollChange(() => this.refreshAnchorAffordance()),
  this.originalEditor.addAction({
    id: 'cumpa.add-base-comment',
    label: 'Add comment base line',
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
    run: () => this.activateFocusedAnchor('base'),
  }),
  this.modifiedEditor.addAction({ ... 'cumpa.add-head-comment' ... }),
);
```
Each listener already takes a single `side: DiffSide` tag and calls instance methods (`captureFocusedSide`, `captureCursor`, `captureAffordance`, `activateFocusedAnchor`) that are editor-agnostic. The single-pane class needs exactly **one** `side` value (`'base'` for deleted, `'head'` for added/type-changed) and **one** set of these nine listeners + one `addAction`, not two. `this.diffEditor.onDidUpdateDiff(...)` has no equivalent — drop it; there is no diff to recompute.

**`setFile`-equivalent pattern** (lines 199-247, single-model subset):
```typescript
async setFile(file: ImmutableDiffFile): Promise<void> {
  this.saveOutgoingState();
  this.removeZones();
  this.disposeModels();
  this.currentFile = file;
  const saved = this.stateByFileId.get(file.id);
  this.originalModel = monaco.editor.createModel(
    file.base.text,
    this.languageForPath(file.base.path),
    monaco.Uri.parse(`inmemory://cumpa/${encodeURIComponent(file.id)}/base/${file.base.path...}`),
  );
  // (modifiedModel pair omitted for single-pane — only one model)
  this.diffEditor.setModel({ original: this.originalModel, modified: this.modifiedModel });
  await ready; // ← DROP: plain editor.setModel() has no onDidUpdateDiff promise to await
  this.diffEditor.restoreViewState(saved?.viewState ?? null);
  ...
  this.layout();
  this.onChange();
}
```
Pitfall 4 from research confirms: `editor.setModel(model)` is synchronous — the single-pane `setFile`-equivalent creates exactly one `monaco.editor.createModel(...)` (for whichever side is shown), calls `editor.setModel(model)` directly, then proceeds straight to `restoreViewState`/`layout()` without the `ready` promise/`onDidUpdateDiff` wait used at L221-228.

**Selection-decoration helper — lift to module scope, reuse directly** (lines 493-507):
```typescript
private refreshSelectionDecorations(): void {
  const decorationsFor = (editor: monaco.editor.IStandaloneCodeEditor): monaco.editor.IModelDeltaDecoration[] =>
    (editor.getSelections() ?? [])
      .filter((selection) => !selection.isEmpty())
      .map((selection) => ({
        range: selection,
        options: {
          inlineClassName: 'monaco-selection-contrast-foreground',
          inlineClassNameAffectsLetterSpacing: false,
        },
      }));

  this.originalSelectionDecorations.set(decorationsFor(this.originalEditor));
  this.modifiedSelectionDecorations.set(decorationsFor(this.modifiedEditor));
}
```
`decorationsFor` already takes one `IStandaloneCodeEditor` and needs zero changes. Only the two call sites (`.set(decorationsFor(this.originalEditor))` / `.set(decorationsFor(this.modifiedEditor))`) collapse to one `.set(decorationsFor(this.editor))` call for the single-pane class. Research recommends lifting `decorationsFor` to a module-level shared helper so both adapters import the same implementation instead of duplicating it.

**Comment view-zone placement — PAIR-BASED, must NOT be ported verbatim** (lines 509-553):
```typescript
private rebuildAnchoredLayout(): void {
  ...
  const anchoredEditor = this.editorFor(anchor.side);
  const counterpartSide: DiffSide = anchor.side === 'base' ? 'head' : 'base';
  const counterpartEditor = this.editorFor(counterpartSide);
  const counterpartModel = this.modelFor(counterpartSide);
  if (counterpartModel === undefined) { return; }
  const counterpartLine = counterpartBoundary(
    this.diffEditor.getLineChanges(), anchor.side, anchor.line, counterpartModel.getLineCount(),
  );
  const anchoredZone = this.createComposerZone(anchor);
  const spacerZone = this.createSpacerZone(anchoredZone.heightInPx ?? 280);
  const anchoredZoneId = this.addZone(anchoredEditor, anchoredZone);
  const spacerZoneId = this.addZone(counterpartEditor, spacerZone);
  if (anchor.side === 'base') {
    this.originalZone = { id: anchoredZoneId, zone: anchoredZone };
    this.modifiedZone = { id: spacerZoneId, zone: spacerZone };
    this.positionZones(anchor.line, counterpartLine);
    this.originalDecorations = anchoredEditor.createDecorationsCollection([this.anchorDecoration(anchor.line)]);
  } else {
    ... // mirror for 'head'
  }
}
```
**Unpaired equivalent to write instead** (Pattern 3 from research): open exactly one `IViewZone` via `editor.changeViewZones((accessor) => accessor.addZone(zone))` on the single editor — no `counterpartEditor`, no `counterpartModel`, no `counterpartBoundary()` call, no `spacerZone`. Keep `createComposerZone(anchor)` (L562-567) unchanged — it builds a `monaco.editor.IViewZone` from `{ afterLineNumber: anchor.line, domNode, heightInPx: 280, suppressMouseDown: false }` and has no pairing dependency. Drop `createSpacerZone` (L568-573) entirely for single-pane — there is no second column to keep height-synced with. Keep `anchorDecoration(line)` (L555-560) unchanged.

**Zone helpers reusable as-is** (lines 575-581, 589-591 single-side half only):
```typescript
private addZone(editor: monaco.editor.IStandaloneCodeEditor, zone: monaco.editor.IViewZone): string {
  let zoneId = '';
  editor.changeViewZones((accessor) => {
    zoneId = accessor.addZone(zone);
  });
  return zoneId;
}
```
`addZone` is already editor-agnostic — call it once instead of twice. `positionZones`/`growPairedZones` (L583-601) are intrinsically paired (they always touch both `originalZone` and `modifiedZone`); the single-pane class needs single-editor variants that call `this.editor.changeViewZones((accessor) => accessor.layoutZone(this.zone?.id ?? ''))` for the one zone only.

**`goToChange`/hidden-region controls — no Monaco-layer branching needed:**
`goToChange` (L330-332) calls `this.diffEditor.goToDiff(direction)`; `hideUnchangedRegions` is a diff-editor-only construction option (L66-71, L139, L206-210, L326). `monaco.editor.create()` returns `IStandaloneCodeEditor`, which has neither `goToDiff` nor `hideUnchangedRegions` — these APIs simply don't exist on the plain editor type, so the single-pane adapter's public surface should omit `goToChange` entirely (D-04 hiding happens in `ReviewToolbar.vue`, not here).

**Editor/model lookup helpers to narrow from side-dispatch to constant** (lines 433-444):
```typescript
private editorFor(side: DiffSide): monaco.editor.IStandaloneCodeEditor {
  return side === 'base' ? this.originalEditor : this.modifiedEditor;
}
private modelFor(side: DiffSide): monaco.editor.ITextModel | undefined {
  return side === 'base' ? this.originalModel : this.modifiedModel;
}
private isValidLine(side: DiffSide, line: number): boolean {
  const model = this.modelFor(side);
  return model !== undefined && line > 0 && line <= model.getLineCount();
}
```
Single-pane class has one fixed `side` per file (not a runtime branch) — these collapse to direct `this.editor`/`this.model` field access, with `isValidLine(line)` dropping the `side` parameter.

**`dispose()` pattern to mirror** (lines 355-367):
```typescript
dispose(): void {
  if (this.disposed) return;
  this.disposed = true;
  this.removeZones();
  this.disposeModels();
  for (const disposable of this.staticDisposables) { disposable.dispose(); }
  this.staticDisposables.length = 0;
  this.diffEditor.dispose();
}
```
Single-pane `dispose()` mirrors this exactly, calling `this.editor.dispose()` instead of `this.diffEditor.dispose()`.

**Exported factory to mirror** (lines 628-634):
```typescript
export function createMonacoDiffAdapter(
  host: HTMLElement,
  languageForPath: (path: string) => string,
  onChange: () => void,
): MonacoDiffAdapter {
  return new PublicMonacoDiffAdapter(host, languageForPath, onChange);
}
```
New factory (e.g. `createMonacoSinglePaneAdapter`) follows the identical `(host, languageForPath, onChange) => AdapterInterface` shape so `DiffWorkspace.vue` can call either constructor interchangeably from its `onMounted` hook (see below).

---

### `src/web/components/StatusBadge.vue` (component, transform)

**Analog:** itself — full file is the pattern source (only 34 lines)

**Current tone/label mapping** (lines 10-26):
```typescript
const presentation = computed(() => {
  switch (props.kind) {
    case 'added':
      return { label: 'Added', text: 'A', tone: 'added' };
    case 'copied':
      return { label: 'Copied', text: 'C', tone: 'moved' };
    case 'deleted':
      return { label: 'Deleted', text: 'D', tone: 'deleted' };
    case 'modified':
      return { label: 'Modified', text: 'M', tone: 'modified' };
    case 'renamed':
      return { label: 'Renamed', text: 'R', tone: 'moved' };
    case 'type-changed':
    case 'unsupported':
      return { label: 'Mode changed', text: 'Mode', tone: 'modified' };
  }
});
```
**Pitfall 4 warning (from research):** `type-changed` and `unsupported` currently share one switch arm — do NOT append `, single pane` inside this shared arm, or genuinely unsupported files get mislabeled "single pane." The label-suffix logic must branch specifically on `props.kind === 'type-changed'` (combined with a `reviewable`/`availability.kind === 'text'` check per D-08), computed as a second, separate `computed()` or merged into `presentation` with an explicit three-way condition (`added`/`deleted`/`type-changed` AND reviewable) rather than reusing the existing `switch`'s fallthrough arm.

**Template to extend** (lines 29-34):
```vue
<template>
  <span class="status-badge" :class="`status-badge--${presentation.tone}`">
    <span aria-hidden="true">{{ presentation.text }}</span>
    <span class="visually-hidden">{{ presentation.label }}</span>
  </span>
</template>
```
Only the `visually-hidden` span's text content changes (appending `, single pane`); the glyph span, tone class, and markup structure are explicitly out of scope per the File Ownership Map ("Letter glyph, tone mapping, visible markup" must not change).

---

### `src/web/components/ActiveFileToolbar.vue` (component, request-response)

**Analog 1 (what gets replaced):** itself, line 54:
```vue
<span v-if="selectedFile !== undefined" class="review-toolbar__status">{{ selectedFile.status.kind }}</span>
```
This raw `status.kind` text is the exact node D-10 replaces with `<StatusBadge>` + layout-label text for single-pane files, while side-by-side files (`modified`/`renamed`/`copied`) keep this exact span unchanged (D-11).

**Analog 2 (badge-then-text pairing precedent):** `FileRow.vue:56-57`
```vue
<StatusBadge :kind="leaf.file.status.kind" />
<PathDisplay :file="leaf.file" basename />
```
`FileRow.vue` already places `<StatusBadge>` immediately before adjacent text content with no wrapper — this is the existing project convention for "badge, then text, read in document order" that `ActiveFileToolbar.vue` should copy for `<StatusBadge :kind="selectedFile.status.kind" />` + a new layout-label `<span>`.

**Existing props/computed shape to extend** (lines 7-30):
```typescript
const props = defineProps<{
  readonly filesCollapsed: boolean;
  readonly filesDrawer: boolean;
  readonly selectedFile?: SessionFile;
  readonly selectedPath: string;
}>();
...
const effectivePath = computed(() => {
  const file = props.selectedFile;
  if (file === undefined) return props.selectedPath;
  return file.status.kind === 'deleted'
    ? file.oldPath?.display ?? props.selectedPath
    : file.newPath?.display ?? file.oldPath?.display ?? props.selectedPath;
});
```
The existing `effectivePath` computed already branches on `file.status.kind === 'deleted'` — the new layout-label computed (`Added · Head only` / `Deleted · Base only` / `Type changed · Head only (was <kind>)`) follows the identical `computed(() => { switch/ternary on selectedFile.status.kind })` shape, reading `selectedFile.availability.kind` for the single-pane/reviewable gate and `selectedFile.oldMode` (via the `availability.ts` mode-to-kind mapping, see Shared Patterns) for the `was <kind>` suffix.

---

### `src/web/components/DiffWorkspace.vue` (component, request-response + event-driven)

**Analog:** itself — existing side-by-side-only template and the `sourceKind` discriminator prop pattern

**Existing discriminator prop to copy for the new `layout`/`status` prop** (lines 17-26):
```typescript
const props = withDefaults(defineProps<{
  comments: readonly WorkspaceComment[];
  composer?: WorkspaceComposer;
  mutationsLocked?: boolean;
  content: FileContentResponse;
  path: string;
  sourceKind?: 'range' | 'exact-patch';
}>(), {
  sourceKind: 'range',
});
```
`sourceKind` is exactly the prior precedent for threading a small discriminator enum from `App.vue` into `DiffWorkspace.vue` and branching render output on it (see `visibleSides`/`commentSideName` below). Research's Pitfall 3 confirms `DiffWorkspace.vue` has **no** `status` prop today — the plan must add one (e.g. `status: ChangedFileStatus` or a pre-computed `layout: 'single-pane' | 'side-by-side'`), following this exact `withDefaults(defineProps<{...}>(), {...})` shape.

**Existing branch-on-discriminator computed to copy** (lines 51-59):
```typescript
const visibleSides = computed(() =>
  props.sourceKind === 'exact-patch'
    ? { original: 'PREIMAGE', modified: 'POSTIMAGE', originalName: 'preimage', modifiedName: 'postimage' }
    : { original: 'BASE', modified: 'HEAD', originalName: 'base', modifiedName: 'head' },
);
const commentSideName = (side: DiffSide) =>
  props.sourceKind === 'exact-patch'
    ? side === 'base' ? 'preimage' : 'postimage'
    : side === 'base' ? 'Base' : 'Head';
```
A new `singlePaneSide` (or similar) computed branching on the new `status`/`layout` prop follows this identical ternary-on-prop shape.

**`onMounted` adapter construction to parallel for the single-pane branch** (lines 290-299):
```typescript
onMounted(() => {
  if (host.value === undefined) return;
  configureMonacoWorkers();
  adapter = createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState);
  wideCodeMedia = window.matchMedia('(min-width: 1650px)');
  compactCodeMedia = window.matchMedia('(max-width: 760px)');
  syncCodeDensity();
  wideCodeMedia.addEventListener('change', syncCodeDensity);
  compactCodeMedia.addEventListener('change', syncCodeDensity);
  syncSideNames();
  ...
});
```
When `layout === 'single-pane'`, this calls the new `createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState)` factory instead of `createMonacoDiffAdapter` — the `MonacoDiffAdapter`-shaped return type (from the diff-adapter.ts pattern above) means `syncCodeDensity`/`syncSideNames`/`loadContent`/`layout()` call sites need no structural change if the single-pane adapter implements the same method names it actually uses (`setFile`, `layout`, `activateAnchor`, `getActiveAnchor`, `setActiveAnchor`, `getAnchorAffordance(At)`, `revealAnchor`, `clearAnchor`, `dispose`) minus `goToChange`.

**Existing template section to branch (side labels + editor host)** (lines 320-349):
```vue
<section class="diff-workspace" :aria-label="`${path}: ${visibleSides.originalName} and ${visibleSides.modifiedName} side-by-side diff`">
  <div class="diff-workspace__viewport">
    <div class="diff-workspace__canvas">
      <div class="diff-workspace__side-labels" aria-hidden="true">
        <span>
          <span>{{ visibleSides.original }}</span>
          <span class="diff-workspace__side-cue diff-workspace__side-cue--base">− REMOVED</span>
        </span>
        <span>
          <span>{{ visibleSides.modified }}</span>
          <span class="diff-workspace__side-cue diff-workspace__side-cue--head">+ ADDED</span>
        </span>
      </div>
      ...
      <div ref="host" class="diff-workspace__editor" />
    </div>
  </div>
  ...
</section>
```
Per D-12/UI-SPEC, the single-pane branch reuses `.diff-workspace__side-labels` as **one** `<span>` (just `Head · <short oid>` or `Base · <short oid>`, no `diff-workspace__side-cue` +/- text since D-02 forbids added/removed tint), keeps `aria-hidden="true"` on the strip exactly as today, and the outer `<section>`'s `:aria-label` changes from the two-sided `"${path}: ${original} and ${modified} side-by-side diff"` string to a single-sided `` `${path}: head only` ``/`` `${path}: base only` `` string (UI-SPEC L160, mirroring `10-UI-SPEC.md:192-193`'s pattern). The `v-if`/`v-else` split happens around this whole template block, with the single-pane branch adding the D-07 empty-file `<InlineNotice>` (pattern below) in place of `<div ref="host" class="diff-workspace__editor" />` when the file is 0 bytes.

**Empty-file notice pattern to copy** (from `InlineNotice.vue`, consumed as in `App.vue:1100-1103`):
```vue
<InlineNotice tone="neutral" role="note">
  <p>Empty file (0 bytes)</p>
</InlineNotice>
```
`InlineNotice.vue`'s own default `tone: 'neutral'`/`role: 'note'` (component defaults, L6-15) already match the UI-SPEC's "`role="note"` region, discoverable in document order, not an `alert`" requirement (UI-SPEC L208) — no prop overrides needed beyond slot content.

---

### `src/web/App.vue` (composition root, request-response)

**Analog:** itself — existing `availability.kind === 'text'` routing and the already-threaded `source-kind` prop

**Existing reviewability routing to extend with status-kind branching** (lines 1130, 1150-1153):
```vue
:has-active-file="selectedFile?.availability.kind === 'text'"
...
<section v-else-if="selectedFile?.availability.kind !== 'text'" class="empty-state">
  <h2>Diff unavailable for this file</h2>
  <p>{{ selectedFile?.availability.kind === 'unsupported' ? `unsupported: ${selectedFile.availability.reason}` : 'unavailable: missing-object' }}. Select another changed file to continue reviewing.</p>
</section>
```
This is the confirmed (Pitfall 3) location of today's reviewability gate — `DiffWorkspace.vue` itself never sees `status.kind` today. The new single-pane/side-by-side layout decision is computed here (e.g. `const diffLayout = computed(() => selectedFile.value !== undefined && ['added','deleted','type-changed'].includes(selectedFile.value.status.kind) ? 'single-pane' : 'side-by-side')`) and threaded down as a new prop.

**Existing discriminator-prop threading to copy exactly** (line 1179):
```vue
:source-kind="isExactPatchSession ? 'exact-patch' : 'range'"
```
This is the direct precedent cited in the assignment: a computed ternary/ expression passed as a kebab-case prop directly on the `<DiffWorkspace>` tag inside the `<DiffWorkspace ... />` invocation (lines 1172-1189). The new prop (e.g. `:status="selectedFile?.status"` or `:layout="diffLayout"`) is added to this same prop list, following identical formatting (one `:kebab-prop="expression"` per line, alphabetically grouped with the existing props).

---

### `src/web/components/ReviewToolbar.vue` (component, request-response)

**Analog:** itself — "File navigation" group (always visible) vs. "Change navigation" group (to conditionally hide)

**Group to keep unconditional** (lines 22-46):
```vue
<div class="review-toolbar__group" aria-label="File navigation">
  <span class="review-toolbar__label" aria-hidden="true">File</span>
  <UiTooltip :text="atFirstFile ? '...' : '...'">
    <button type="button" class="ui-button ui-button--icon" aria-label="Previous file" :disabled="atFirstFile || !hasActiveFile" @click="emit('previousFile')">
      <UiIcon name="previous-file" />
    </button>
  </UiTooltip>
  ...
</div>
```
**Group to gate with `v-if`** (lines 47-71):
```vue
<div class="review-toolbar__group" aria-label="Change navigation">
  <span class="review-toolbar__label" aria-hidden="true">Change</span>
  <UiTooltip text="Previous change · Shift+F7">
    <button type="button" class="ui-button ui-button--icon" aria-label="Previous change" :disabled="!hasActiveFile" @click="emit('previousChange')">
      <UiIcon name="previous-change" />
    </button>
  </UiTooltip>
  <UiTooltip text="Next change · F7">...</UiTooltip>
</div>
```
Per UI-SPEC's accessibility contract (L207): hide this entire `<div>` with `v-if="!singlePane"` (new prop, e.g. `singlePane: boolean` added to the existing `defineProps<{ atFirstFile: boolean; atLastFile: boolean; hasActiveFile: boolean; }>()` block at lines 5-9) — **not** a CSS `visibility`/`display` toggle — so it is removed from the accessibility tree, consistent with the existing all-`v-if`-based conditional pattern already used elsewhere in the toolbar family (e.g. `ActiveFileToolbar.vue:51` `v-if="selectedFile !== undefined"`, `ReviewToolbar.vue`'s own parent-controlled `<slot />` at line 21).

---

### `tests/unit/monaco-diff-adapter.test.ts` (test)

**Analog:** itself — `vi.hoisted` Monaco API mock factory

**Mock shape to extend/parallel for a single-pane editor mock** (lines 1-37):
```typescript
const mocks = vi.hoisted(() => {
  const disposable = () => ({ dispose: vi.fn() });
  const cursorListeners: Array<(event: { position: { lineNumber: number } }) => void> = [];
  const decorationCollection = () => ({ clear: vi.fn(), set: vi.fn() });
  const codeEditor = () => ({
    addAction: vi.fn(),
    changeViewZones: vi.fn((change) => change({
      addZone: vi.fn(() => 'zone'),
      layoutZone: vi.fn(),
      removeZone: vi.fn(),
    })),
    createDecorationsCollection: vi.fn(decorationCollection),
    focus: vi.fn(),
    getContainerDomNode: vi.fn(() => ({ classList: { add: vi.fn() } })),
    getPosition: vi.fn(() => null),
    getScrolledVisiblePosition: vi.fn(() => ({ top: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelections: vi.fn(() => []),
    getTopForLineNumber: vi.fn(() => 0),
    onDidChangeCursorSelection: vi.fn(disposable),
    onDidChangeModel: vi.fn(disposable),
    onDidFocusEditorText: vi.fn(disposable),
    onDidScrollChange: vi.fn(disposable),
    onDidChangeCursorPosition: vi.fn((listener) => { cursorListeners.push(listener); return disposable(); }),
    onMouseMove: vi.fn(disposable),
    updateOptions: vi.fn(),
    onMouseDown: vi.fn(disposable),
    revealLineInCenter: vi.fn(),
    ...
  });
```
`codeEditor()` already produces a complete `IStandaloneCodeEditor` mock shape — the single-pane adapter tests reuse this exact factory (it's already editor-type-correct, not diff-editor-specific) and additionally mock `monaco.editor.create` to return one `codeEditor()` instance (parallel to however `monaco.editor.createDiffEditor` is currently mocked to return `{ getOriginalEditor: () => codeEditor(), getModifiedEditor: () => codeEditor(), ... }` further down this same hoisted block — not shown above, read `monaco-diff-adapter.test.ts` lines 38-100 for the diff-editor mock wrapper when writing the new `monaco.editor.create` mock).

---

### `tests/unit/file-tree.test.ts` (test)

**Analog:** itself — `sessionFile()` fixture builder

**Fixture pattern to reuse for added/deleted/type-changed assertions** (lines 1-43):
```typescript
function sessionFile(
  index: number,
  options: {
    readonly kind?: SessionFile['status']['kind'];
    readonly oldPath?: ExactPath;
    readonly newPath?: ExactPath;
    readonly similarity?: number;
  },
): SessionFile { ... }
```
This already parameterizes `status.kind` including `'added'`/`'deleted'`/`'type-changed'` — no new fixture builder needed; single-pane-relevant test cases (e.g. asserting `effectivePath` still correctly falls back to `oldPath` for deleted files, unchanged behavior) call this existing builder with `{ kind: 'deleted' }` etc., exactly as existing tests already do.

---

### `tests/e2e/anchored-review.spec.ts` (e2e test, Playwright)

**Analog:** itself — `activateMonacoLine` + comment-affordance click flow

**Helper to reuse for single-pane comment flow assertions** (lines 160-173, referenced):
```typescript
async function activateMonacoLine(page: Page, side: 'base' | 'head', lineText: string, lineNumber: number): Promise<void> {
  ...
  await line.hover();
  await line.click();
  const affordance = page.getByRole('button', { name: `Add comment to ${side} line ${lineNumber}` });
  await expect(affordance).toBeVisible();
  await affordance.click();
}
```
This exact `getByRole('button', { name: 'Add comment to ${side} line ${lineNumber}' })` affordance pattern (from `DiffWorkspace.vue`'s `:aria-label="`Add comment to ${...} line ${...}`"` gutter button, L342) is unchanged by this phase — the single-pane editor reuses the identical gutter-affordance button markup/aria-label convention, so this helper works unmodified for single-pane files once a fixture adds an added/deleted/type-changed file to the test repo.

**Tree selection + header assertions to extend** (lines 238, 304, 320):
```typescript
await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
await expect(page.getByRole('heading', { level: 1, name: 'src/changed.ts' })).toBeVisible();
```
New assertions for single-pane coverage follow this identical `getByRole('treeitem', ...)` → `getByRole('heading', { level: 1, ... })` shape, additionally asserting the new header layout-label text (e.g. `page.getByText('Added · Head only')`) and the tree row's accessible name now including `, single pane` (Playwright's `getByRole('treeitem', { name: /.../ })` already matches on accessible name, which includes visually-hidden text).

---

## Shared Patterns

### Monaco global theme singleton — apply once, no new registration
**Source:** `src/web/monaco/theme.ts:108-110` (referenced), invoked at `diff-adapter.ts:122`
```typescript
applyCumpaTheme();
```
**Apply to:** `diff-adapter.ts`'s new single-pane constructor — call `applyCumpaTheme()` once (or rely on the existing call already having run for the diff adapter instance, if both adapters coexist); do NOT call `monaco.editor.defineTheme`/`setTheme` again. Monaco themes are global/singleton — a second registration is redundant and risks flicker.

### Token-driven code density table — reuse verbatim
**Source:** `diff-adapter.ts:73-90`
```typescript
const TOKENS = parseTokenRoot(TOKEN_ROOT_CSS);
const CODE_FONT_FAMILY = resolveToken(TOKENS, '--font-mono');
const CODE_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-code'), 10);
const CODE_LINE_HEIGHT = Number.parseInt(resolveToken(TOKENS, '--line-height-code'), 10);
const BODY_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-body'), 10);
const METADATA_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-metadata'), 10);

const CODE_DENSITIES = {
  wide: { fontSize: BODY_FONT_SIZE, lineHeight: BODY_FONT_SIZE * 2 },
  default: { fontSize: CODE_FONT_SIZE, lineHeight: CODE_LINE_HEIGHT },
  compact: { fontSize: METADATA_FONT_SIZE, lineHeight: METADATA_FONT_SIZE * 2 },
} as const;
```
**Apply to:** single-pane adapter's `setCodeDensity(density)` method — call `this.editor.updateOptions(CODE_DENSITIES[density])` (parallel to `diff-adapter.ts:189-191`'s `this.diffEditor.updateOptions(CODE_DENSITIES[density])`), reusing the same module-level `CODE_DENSITIES` constant, no new density values.

### Status badge: never color alone — tone class + visually-hidden label
**Source:** `StatusBadge.vue:10-33`
**Apply to:** `StatusBadge.vue`'s own extension (this phase) and `ActiveFileToolbar.vue`'s header label — the project-wide invariant (Phase 08/09/10) is that status/meaning is never conveyed by color alone; every colored element pairs with a `.visually-hidden` text equivalent. The new header layout-label text in `ActiveFileToolbar.vue` is additional *visible* text (not `aria-hidden`), which independently satisfies this invariant per UI-SPEC L204.

### Discriminator prop threaded from App.vue into a child component
**Source:** `App.vue:1179` (`:source-kind="isExactPatchSession ? 'exact-patch' : 'range'"`) consumed by `DiffWorkspace.vue:17-26,51-59` (`sourceKind` prop + `visibleSides`/`commentSideName` computeds)
**Apply to:** the new `status`/`layout` prop threaded from `App.vue` into `DiffWorkspace.vue`, and the new `singlePane` boolean threaded from `App.vue` (or `DiffWorkspace.vue`) into `ReviewToolbar.vue` — same shape: parent computes a value from already-fetched data, passes it as a kebab-case prop, child branches render/computed logic on it via ternary/switch.

### Git mode-literal-to-kind mapping — precedent for "was `<kind>`" derivation
**Source:** `src/git/availability.ts:15-18,55-60`
```typescript
const regularFileModes: Readonly<Record<string, true>> = Object.freeze({
  '100644': true,
  '100755': true,
});
...
if (file.oldMode === '160000' || file.newMode === '160000') {
  return unsupportedAvailability.submodule;
}
if (file.oldMode === '120000' || file.newMode === '120000') {
  return unsupportedAvailability.symlink;
}
```
**Apply to:** the client-side `was <kind>` derivation for type-changed headers (D-06). `ChangedFileSchema.oldMode` (`comparison.ts:121`, required, non-optional — even `added` files get `'000000'`) is already present on `SessionFile`/`ChangedFile` with no new network call needed. The new derivation (likely a small pure function colocated in `ActiveFileToolbar.vue`'s `<script setup>` or a tiny exported helper) reads `selectedFile.oldMode` and maps the same literal values this file already hardcodes (`'160000'` → `submodule`, `'120000'` → `symlink`, else fall back to a generic `was <old mode>`/"type changed" string per D-06's explicit fallback instruction) — do NOT import or call into `availability.ts` itself (it's server/shared code for a different concern, reviewability classification, not display copy); duplicate only the two literal checks as precedent, not the module.

### `DiffSide` type — reused unchanged, no new export needed
**Source:** `src/web/monaco/line-mapping.ts:3` (`export type DiffSide = 'base' | 'head';`), re-exported at `diff-adapter.ts:11`
**Apply to:** single-pane adapter's single fixed `side: DiffSide` field — import the existing type, do not redeclare it. `counterpartBoundary` (the rest of `line-mapping.ts`) is diff-pairing-only and genuinely unused by the single-pane path — confirmed no changes needed to this file.

## No Analog Found

None — every file in this phase's File Ownership Map is a modification to an existing file with a same-file or closely-related sibling pattern already present in the codebase. This is expected for a phase explicitly scoped as "internal-API work: no new npm packages, no new Monaco surface."

## Metadata

**Analog search scope:** `src/web/monaco/`, `src/web/components/`, `src/web/App.vue`, `src/contracts/`, `src/domain/`, `src/git/`, `tests/unit/`, `tests/e2e/`
**Files scanned:** `diff-adapter.ts` (full, 634 lines), `StatusBadge.vue` (full), `ActiveFileToolbar.vue` (full), `ReviewToolbar.vue` (full), `DiffWorkspace.vue` (full, 355 lines), `App.vue` (targeted: L23-26,92-95,151-196,291-295,384-391,423-425,764-768,1099-1213), `FileRow.vue` (targeted, badge usage), `InlineNotice.vue` (full), `CommentComposer.vue` (targeted, side-label lines 1-58), `comparison.ts` (targeted schema defs), `anchor.ts` (targeted), `file-tree.ts` (targeted), `availability.ts` (full), `line-mapping.ts` (full), `monaco-diff-adapter.test.ts` (targeted), `anchor.test.ts` (targeted), `file-tree.test.ts` (targeted), `anchored-review.spec.ts` (targeted)
**Pattern extraction date:** 2026-10-30
