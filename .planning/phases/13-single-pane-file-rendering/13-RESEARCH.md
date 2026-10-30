# Phase 13: Single-Pane File Rendering - Research

**Researched:** 2026-10-30
**Domain:** Monaco editor API (plain `IStandaloneCodeEditor` vs. diff-editor sub-editors), Vue 3 component layout branching, Zod comparison contracts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Pane mechanics
- **D-01:** Render single-pane files with a **plain Monaco editor** (`monaco.editor.create`, a new path next to `createDiffEditor` in `src/web/monaco/diff-adapter.ts` or a sibling adapter). Do NOT use the diff editor in inline mode. The comment gutter, view zones and decorations must work with a plain `ICodeEditor` as well as the diff's original/modified sub-editors.
- **D-02:** **No added/removed tint**: content reads as a neutral file. No whole-file green/red background and no per-line +/- gutter signs. The added/deleted meaning comes from the header and side label (D-09, D-12).
- **D-03:** **Only that side's line numbers**: Head numbers for added/type-changed, Base numbers for deleted. One line-number column, matching the anchor side.
- **D-04:** **Hide diff-only controls** in single-pane files: next/prev change, hidden-region expand/collapse and any other control with no meaning without hunks. Keep file-level controls (e.g. wrap).

### Which files qualify
- **D-05:** Single-pane statuses: **`added`, `deleted`, and `type-changed`**. `modified`, `renamed` and `copied` (even at 100% similarity) stay side-by-side. Including type-changed goes beyond the PANE-01..03 wording and is deliberate.
- **D-06:** **Type-changed shows Head only**, full width, comments anchored to `head`. The header notes what the Base was (e.g. `Type changed · Head only (was symlink)`). Researcher: confirm what the comparison contract exposes about the Base object type/mode. If the Base kind isn't available, fall back to `was <old mode>` or a generic "type changed" note rather than adding git plumbing beyond what the phase needs.
- **D-07:** **0-byte added/deleted files** still use the single-pane layout, with an inline `Empty file (0 bytes)` notice instead of a blank editor and no comment target lines.
- **D-08:** **Binary, oversized and unsupported files keep today's non-reviewable placeholder.** They get NO single-pane marker, so the marker never promises a pane that can't render. Single-pane treatment applies only to reviewable text files.

### Single-pane marker (header + tree)
- **D-09:** **File tree:** the existing `StatusBadge` letter (A/D/…) already separates them without color. Extend its visually hidden label to say single pane (e.g. `Added, single pane`, `Deleted, single pane`). No new glyph or column; keep the Phase 09 dense rows.
- **D-10:** **File header (`ActiveFileToolbar.vue`):** show **both** the `StatusBadge` and a text layout label: `Added · Head only`, `Deleted · Base only`, `Type changed · Head only (was <kind>)`. This replaces today's plain `status.kind` text for these files.
- **D-11:** **Side-by-side files get no extra layout label.** Only single-pane files are marked.

### Side identity & comments
- **D-12:** **Reuse the side label strip** (`.diff-workspace__side-labels` in `DiffWorkspace.vue`) as one full-width label for the shown side (e.g. `Head · <short oid>`), matching the side-by-side panes. Note: the strip is `aria-hidden="true"` today, so the accessible side identity must come from the header text (D-10) and the composer.
- **D-13:** **Multi-line/range selection comments** behave exactly as on one side of a diff. No new selection rules.
- **D-14:** **No export change**: Markdown and canonical JSON stay as they are. Anchor `side` + file status already carry the meaning; schema changes belong to Phase 17.

### Claude's Discretion
- **Composer side display:** the user chose "You decide". `CommentComposer.vue:48` already renders `· Base line N` / `· Head line N`, so keep that as is in single-pane files. Add a chip only if planning finds the side is implicit somewhere (e.g. existing thread headers).
- Whether the single-pane editor lives in `diff-adapter.ts` or a sibling adapter module, and how editor instances are reused/disposed when switching between diff and single-pane files.

### Deferred Ideas (OUT OF SCOPE)

None. Discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| PANE-01 | Reviewer sees an added file as one full-width pane containing the whole new content, with no empty Base side, and can comment on any of its lines (anchored to Head). | Pattern 1-4 (unpaired single-pane editor construction, event wiring, comment-zone placement) + Code Example "Confirming `monaco.editor.create`..." establish the editor/anchor mechanics; `ChangedFileStatusKindSchema` (`comparison.ts:74-82`) confirms `added` is a distinct, reliably-identifiable status to route on |
| PANE-02 | Reviewer sees a deleted file as one full-width pane containing the whole removed content, with no empty Head side, and can comment on any of its lines (anchored to Base). | Same mechanics as PANE-01, anchored to `base`; `file-tree.ts:49-55` (`effectivePath` uses `oldPath` for deleted files) confirms the existing precedent for deleted-file path resolution the single-pane header/tree label must match |
| PANE-03 | Reviewer can tell from the file header and file tree, without relying on color, that a single-pane file is entirely added or entirely deleted; modified, renamed, and copied files keep the existing side-by-side diff. | `StatusBadge.vue:10-26` (visually-hidden label mechanism) + Pitfall 4 (type-changed/unsupported label collision) + Pitfall 3 (where the side-by-side vs. single-pane layout decision currently lives and what prop must be threaded) directly address the header/tree marking and layout-routing mechanics |
</phase_requirements>


## Summary

This phase is almost entirely internal-API work: no new npm packages, no new Monaco surface beyond what `monaco-editor@0.55.1` (already installed) exposes via `monaco.editor.create()`. The critical risk is not "does a plain editor exist" (it does, confirmed in the installed type defs) but **how much of the existing comment-anchor/view-zone wiring in `PublicMonacoDiffAdapter` is actually reusable**. Reading `diff-adapter.ts` end to end shows the class is internally built on exactly two `IStandaloneCodeEditor` instances (`originalEditor`/`modifiedEditor`, both produced by `IStandaloneDiffEditor.getOriginalEditor()/.getModifiedEditor()`), and most per-side event wiring (cursor capture, mouse capture, selection decorations, add-comment keybinding) is already written generically against one `editor: IStandaloneCodeEditor` at a time — so that part genuinely parallels cleanly onto a `monaco.editor.create()` instance. **However, the comment view-zone placement logic (`rebuildAnchoredLayout`, `positionZones`, `growPairedZones`, `counterpartBoundary`) is fundamentally pair-based**: every time a composer zone opens on one side, the adapter also opens a same-height *spacer* zone on the counterpart side purely to keep the two diff panes visually aligned. A single-pane editor has no counterpart, so this pairing logic must NOT be ported as-is — the single-pane adapter needs a strictly simpler, unpaired zone placement (composer zone only, no spacer, no `counterpartBoundary` call). This is the one place where "wire it up the same way" (as D-01/13-UI-SPEC imply) is not literally true and needs its own code path.

D-06's "open research question" (what the comparison contract exposes about the Base object's old type/mode) is resolved by direct schema inspection: `ChangedFileSchema` (`src/contracts/comparison.ts:117-131`) has **required, non-optional** `oldMode: GitModeSchema` and `newMode: GitModeSchema` fields (6-digit octal git mode strings, always present — even for `added` files `oldMode` is `'000000'`). No new git plumbing is needed; the existing `src/git/availability.ts:55-80` already implements the exact mode-literal-to-kind mapping precedent (`'160000'` → submodule, `'120000'` → symlink, `regularFileModes` = `{'100644', '100755'}`) that the Type-changed header copy (`was <kind>`) should mirror.

**Primary recommendation:** Build a new, smaller, unpaired single-pane adapter (new exported factory alongside `createMonacoDiffAdapter` in `diff-adapter.ts`, per D-01/discretion) that creates one `monaco.editor.create()` instance, reuses the per-editor event-wiring patterns verbatim (cursor/mouse capture, selection decorations, add-comment action, `createDecorationsCollection`), but implements its own non-paired `rebuildAnchoredLayout` equivalent (one composer zone, no spacer zone, no `counterpartBoundary`). Derive the type-changed "was `<kind>`" header copy from `oldMode` using the same literal-mode mapping already in `src/git/availability.ts`. No `Package Legitimacy Audit` is required — zero new dependencies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Single-pane Monaco editor creation/lifecycle | Browser / Client | — | `monaco.editor.create()` runs entirely client-side inside `src/web/monaco/`, mirroring `createDiffEditor`'s existing placement [VERIFIED: src/web/monaco/diff-adapter.ts:628-634] |
| Layout routing (single-pane vs. side-by-side) | Browser / Client (Vue) | — | Decided from `status.kind` + `availability.kind`, both already computed server-side and shipped in the `SessionFile`/`ChangedFile` payload consumed by `DiffWorkspace.vue`/`App.vue`; no new backend logic [VERIFIED: src/web/App.vue:152,292,1150] |
| Type-changed "was `<kind>`" derivation | Browser / Client | — | Pure client-side string derivation from `oldMode` already present on the `ChangedFile` the UI already has; precedent logic lives client-adjacent in `src/git/availability.ts` but is itself server/shared code reused as a pattern, not a new call [VERIFIED: src/contracts/comparison.ts:121; src/git/availability.ts:55-80] |
| Comment gutter / view-zone wiring for single pane | Browser / Client | — | Same tier as existing diff-adapter wiring; no API/backend involvement [VERIFIED: src/web/monaco/diff-adapter.ts:160-186,509-553] |
| Status badge / header label text | Browser / Client (Vue) | — | Pure presentational change in `StatusBadge.vue` / `ActiveFileToolbar.vue` [VERIFIED: src/web/components/StatusBadge.vue; src/web/components/ActiveFileToolbar.vue] |
| Export (Markdown/JSON) | API / Backend (shared) | — | **Explicitly unchanged** per D-14 — `render-review-markdown.ts` already renders by `anchor.side` + file status, no new work [VERIFIED: src/export/render-review-markdown.ts:1-63] |

## Standard Stack

**No new dependencies for this phase.** `monaco.editor.create()` is already part of the installed `monaco-editor@0.55.1` dependency (`package.json:62`), and returns `IStandaloneCodeEditor` — the identical type the diff adapter's `originalEditor`/`modifiedEditor` already are [VERIFIED: node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts:947]. Skipping the Package Legitimacy Audit section per the role's explicit allowance for zero-new-package phases.

## Package Legitimacy Audit

Skipped — this phase installs no new packages. `monaco.editor.create` is an existing export of the already-installed, already-audited `monaco-editor` dependency; no registry lookup is needed.

## Architecture Patterns

### System Architecture Diagram

```
SessionFile (status.kind, availability.kind, oldMode)
        │  [already shipped by existing API, no change]
        ▼
App.vue  ── routes selection ──▶  (today) always DiffWorkspace.vue if availability.kind === 'text'
        │                                   [VERIFIED: src/web/App.vue:1150-1180]
        │  NEW: pass status.kind (or a derived `layout`) as a prop into DiffWorkspace.vue
        ▼
DiffWorkspace.vue
   ├─ side-by-side branch (existing, UNCHANGED): createMonacoDiffAdapter → createDiffEditor
   │       (modified/renamed/copied, or non-reviewable placeholder stays in App.vue)
   └─ NEW single-pane branch: createMonacoSinglePaneAdapter (sibling factory in diff-adapter.ts)
            → monaco.editor.create() → ONE IStandaloneCodeEditor
            → reused per-editor wiring: cursor/mouse capture, selection decorations,
              addAction('add-<side>-comment'), createDecorationsCollection
            → NEW unpaired zone logic: composer-only view zone, no spacer/counterpart
        │
        ▼
CommentComposer.vue (unchanged, D-13) ── anchors to single side (base for deleted,
                                           head for added/type-changed)
        │
        ▼
Export (render-review-markdown.ts) — UNCHANGED (D-14); anchor.side + file status already
                                       carry single-pane meaning
```

### Recommended Project Structure

No new directories. Extend existing files per the UI-SPEC's File Ownership Map:

```
src/web/monaco/
├── diff-adapter.ts     # existing createDiffEditor path UNCHANGED; add sibling
│                          createMonacoSinglePaneAdapter() factory (or new sibling
│                          file, per CONTEXT.md discretion — diff-adapter.ts keeps
│                          both factories together for shared helpers: editorFor-
│                          style selection-decoration logic, CODE_DENSITIES, TOKENS)
├── theme.ts             # UNCHANGED — applyCumpaTheme() already global (theme.ts:108-110)
└── line-mapping.ts       # UNCHANGED — counterpartBoundary is diff-only, not needed
                            for single pane (no counterpart side exists)
```

### Pattern 1: Per-editor event wiring is already generic — reuse verbatim

**What:** The existing diff adapter's per-side listeners (cursor capture, mouse-move/mouse-down affordance capture, selection decorations, add-comment `addAction`) are already written against a single `monaco.editor.IStandaloneCodeEditor`, not against the diff editor as a pair. They take `side: DiffSide` as a parameter purely to tag which side's state is being updated — the underlying editor API calls are per-instance.
**When to use:** Wiring the new single-pane editor's comment affordance (hover, click, cursor, keyboard shortcut).
**Example (existing code to parallel, not literally reuse — the single-pane class has only one `editor`, not `originalEditor`/`modifiedEditor`):**
```typescript
// Source: src/web/monaco/diff-adapter.ts:160-185 (constructor wiring)
this.originalEditor.onDidFocusEditorText(() => this.captureFocusedSide('base')),
this.originalEditor.onDidChangeCursorPosition((event) => this.captureCursor('base', event.position.lineNumber)),
this.originalEditor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
this.originalEditor.onMouseMove((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
this.originalEditor.onMouseDown((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
this.originalEditor.addAction({
  id: 'cumpa.add-base-comment',
  label: 'Add comment to base line',
  keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
  run: () => this.activateFocusedAnchor('base'),
}),
```
The single-pane adapter wires the SAME calls against its one `editor` with a fixed `side` (resolved once from `status.kind`: `'head'` for added/type-changed, `'base'` for deleted) — no `editorFor(side)` branching needed since there is only one side ever.

### Pattern 2: `refreshSelectionDecorations` is already a reusable per-editor helper

**What:** `decorationsFor(editor)` takes one editor and returns multi-line selection decorations; it is called twice today (once per side) but the inner function itself has no pairing dependency.
**When to use:** Selection-based commenting in the single-pane editor (D-13: behaves exactly as on one side of a diff).
**Example:**
```typescript
// Source: src/web/monaco/diff-adapter.ts:493-507
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
```
Call this with the single editor instance directly; no change to the function needed if extracted to a shared module-level helper (currently it's an inline closure inside `refreshSelectionDecorations` — consider lifting it to module scope so both adapters import the same implementation, avoiding duplication).

### Pattern 3: Comment view-zone placement is PAIR-BASED — do not port directly

**What goes wrong if copied verbatim:** `rebuildAnchoredLayout` (diff-adapter.ts:509-553) always creates TWO view zones per composer open: an `anchoredZone` (the actual composer) on the anchor's side, and a `spacerZone` of matching height on the *counterpart* side (`counterpartEditor`), positioned via `counterpartBoundary()` so the two Monaco panes stay vertically aligned. This logic requires a second editor and a second model (`counterpartModel`) to exist — neither exists for a single-pane file.
**Why it happens:** Side-by-side diff panes must stay visually synchronized when one side grows; a single full-width pane has no second pane to keep aligned.
**How to avoid:** Write a simpler, unpaired version for the single-pane adapter: open exactly one composer `IViewZone` on the one editor via `editor.changeViewZones((accessor) => accessor.addZone(zone))`, with no spacer, no `counterpartBoundary` call, no `positionZones`/`growPairedZones` pairing. `createComposerZone` (diff-adapter.ts:562-567) and `addZone` (diff-adapter.ts:575-581) ARE directly reusable as-is since they already take a single `editor`/`anchor` and return a zone id.
**Warning signs:** If a single-pane implementation calls `counterpartBoundary` or references a second model/editor, it has incorrectly copied the paired logic.

```typescript
// Source: src/web/monaco/diff-adapter.ts:538-541,562-581 — the directly reusable half
const anchoredZone = this.createComposerZone(anchor);   // reusable verbatim
const anchoredZoneId = this.addZone(anchoredEditor, anchoredZone); // reusable verbatim
// NOT reusable for single-pane: spacerZone, counterpartBoundary(), positionZones(), growPairedZones()
```

### Pattern 4: `setFile`'s diff-readiness promise does not apply to a plain editor

**What:** `setFile` (diff-adapter.ts:199-247) awaits a `Promise` that resolves on `this.diffEditor.onDidUpdateDiff()` before restoring view state — this event only fires on `IStandaloneDiffEditor`, not on a plain `IStandaloneCodeEditor`.
**When to use:** Loading single-pane file content into the new editor.
**How to avoid the pitfall:** `monaco.editor.ITextModel` creation + `editor.setModel(model)` is synchronous; there is no diff computation to await. The single-pane `setFile`-equivalent can call `editor.setModel(model)` and proceed directly to `restoreViewState`/`layout()` without an intermediate `onDidUpdateDiff` promise.

### Pattern 5: `goToChange`/hidden-region controls are diff-editor-only APIs — confirms D-04 needs no explicit "hide" code on the Monaco side

**What:** `goToChange` calls `this.diffEditor.goToDiff(direction)`; `revealAnchor`/`contextMode`/`hideUnchangedRegions` are all `IStandaloneDiffEditor`-only options (diff-adapter.ts:66-71,123-143,330-332). A plain `IStandaloneCodeEditor` created via `monaco.editor.create()` has no `goToDiff` method and no `hideUnchangedRegions` option — these APIs simply don't exist on it, so no "disable" branching is needed inside the Monaco layer. The hiding work (D-04) is purely at the Vue layer: `ReviewToolbar.vue`'s "Change navigation" `<div>` (lines 47-71) must be conditionally `v-if`-removed when the active file is single-pane — confirmed by the existing precedent of the sibling "File navigation" group (lines 22-46) which stays visible unconditionally [VERIFIED: src/web/components/ReviewToolbar.vue:14-15,22-69].

### Anti-Patterns to Avoid

- **Porting `rebuildAnchoredLayout` wholesale:** Would force a fake "counterpart editor" to exist just to satisfy the pairing logic, adding complexity the single-pane layout doesn't need. Write the unpaired version (Pattern 3).
- **Re-deriving `oldMode`/type info via new git plumbing:** `oldMode` is already a required field on every `ChangedFile` returned by the API (`comparison.ts:121`); no new subprocess call, no new API endpoint, no schema change needed — D-06 already said "fall back... rather than adding git plumbing," and the data already exists.
- **Adding `hideUnchangedRegions`/`goToDiff`-style no-ops to the single-pane editor "for symmetry":** These options don't exist in `IStandaloneEditorConstructionOptions`; passing them would be a TypeScript compile error against the installed `monaco.d.ts`, not a silent no-op.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Mode-string → semantic kind (symlink/submodule/regular) | A new mode-parsing switch inside the UI/adapter | The literal-match pattern already in `src/git/availability.ts:55-80` (`'160000'` → submodule, `'120000'` → symlink, `regularFileModes` set) | Single source of truth for git mode semantics already exists and is tested (`tests/unit/availability.test.ts`); duplicating the mapping risks drift if git mode semantics are revisited |
| Theming the new editor | A second `monaco.editor.defineTheme`/`setTheme` call | Nothing — `applyCumpaTheme()` is called once per adapter construction today (diff-adapter.ts:122) and registers ONE global theme (`theme.ts:108-110`) consumed by every editor instance created afterward, including ones created later via `monaco.editor.create()` | Monaco themes are global/singleton by design; a second registration is redundant and risks flicker if timing differs |
| Line-number-column suppression for the unused side | Custom CSS to hide a "ghost" second column | Simply don't create a second model/editor — `monaco.editor.create()` with a single model naturally has exactly one line-number gutter | The diff editor's dual-gutter is a side-by-side-specific rendering mode; a plain editor never has the problem to suppress |

**Key insight:** Nearly every "hand-roll risk" in this phase evaporates because `IStandaloneCodeEditor` (plain) is architecturally the *simpler* editor Monaco already builds the diff editor's sub-editors from — the diff editor adds pairing/alignment machinery ON TOP of plain editors, so going single-pane means *subtracting* that machinery, not re-adding equivalent machinery via custom code.

## Common Pitfalls

### Pitfall 1: Assuming the comment-zone wiring is a 1:1 drop-in reuse
**What goes wrong:** Treating `rebuildAnchoredLayout` as something that "just accepts a plain `ICodeEditor`" (as the CONTEXT.md phrasing could be read) and trying to call it unmodified with a `counterpartEditor` of `undefined`.
**Why it happens:** D-01 and the UI-SPEC both correctly state the *editor type* is already plain (`IStandaloneCodeEditor`) for both diff sub-editors — that claim is TRUE and verified (diff-adapter.ts:94-96). But the *zone-pairing logic* is a separate concern layered on top of the editor type, and that part is diff-specific.
**How to avoid:** Write a new, unpaired `rebuildAnchoredLayout`-equivalent for the single-pane adapter (see Pattern 3). Reuse `createComposerZone`/`addZone` verbatim; do not reuse `positionZones`/`growPairedZones`/`counterpartBoundary`.
**Warning signs:** A single-pane adapter implementation that imports `counterpartBoundary` from `line-mapping.ts`.

### Pitfall 2: Forgetting `oldMode` is present even for `added` files
**What goes wrong:** Assuming `oldMode` might be `undefined`/optional and adding defensive git-plumbing or a new API call to "fetch" the old mode for type-changed files.
**Why it happens:** It's intuitive to think "added files have no old side," but the schema always sets `oldMode` (to `'000000'` for genuinely new files, and to the real prior mode for type-changed files) — it's a required field, not `.optional()` [VERIFIED: src/contracts/comparison.ts:121, no `.optional()` modifier, unlike `oldPath`/`newPath` at lines 125-126 which ARE `.optional()`].
**How to avoid:** Read `file.oldMode` directly off the already-fetched `ChangedFile`/`SessionFile` object client-side; no new network request.
**Warning signs:** Any new Fastify route or git subprocess call added just to resolve D-06.

### Pitfall 3: Layout routing doesn't currently live in `DiffWorkspace.vue`
**What goes wrong:** CONTEXT.md's Integration Points section says "`DiffWorkspace.vue` decides layout per selected file ... from `status.kind` + reviewability" — but as of today, `DiffWorkspace.vue` has ZERO references to `status.kind` (confirmed via grep) and receives no `status` prop at all. The reviewability check (`availability.kind === 'text'`) and the non-reviewable placeholder currently live in `App.vue` (lines 152, 292, 1150-1152), one level up. `DiffWorkspace.vue` is unconditionally rendered as side-by-side for every reviewable file today.
**Why it happens:** The phase description is aspirational about where the branch *should* live post-phase (and the UI-SPEC's File Ownership Map explicitly assigns the new single-pane branch to `DiffWorkspace.vue`), but it doesn't reflect current code.
**How to avoid:** The plan must (a) add a new prop to `DiffWorkspace.vue` (e.g. `status: ChangedFileStatus` or a pre-computed `layout: 'single-pane' | 'side-by-side'`) passed down from `App.vue`'s existing `selectedFile`, and (b) add the `v-if`/`v-else` branch inside `DiffWorkspace.vue`'s template using that new prop. `App.vue`'s existing non-reviewable/binary/oversized placeholder path (lines 1150-1152) stays exactly as-is per D-08 — single-pane files must still be `availability.kind === 'text'` to reach `DiffWorkspace.vue` at all.
**Warning signs:** A plan task that only touches `DiffWorkspace.vue` without also touching the prop passed from `App.vue:1172-1180`.

### Pitfall 4: `StatusBadge.vue` currently collapses `type-changed` and `unsupported` into the same "Mode changed"/"Mode" presentation
**What goes wrong:** `StatusBadge.vue:22-24` has `case 'type-changed': case 'unsupported': return { label: 'Mode changed', text: 'Mode', tone: 'modified' }` — a single switch arm shared by both kinds. D-09 only wants the `, single pane` suffix added for `type-changed` (which IS single-pane per D-05), NOT for `unsupported` (which stays non-reviewable per D-08, never single-pane).
**Why it happens:** The existing badge logic doesn't distinguish `type-changed` from `unsupported` because historically they rendered identically.
**How to avoid:** The label-suffix logic must split on `props.kind === 'type-changed'` specifically (not on the shared switch arm), likely computed outside the existing `presentation` switch, gated additionally by `reviewable` (D-05/D-08's "Binary, oversized and unsupported files... get NO single-pane marker").
**Warning signs:** A plan that adds `, single pane` inside the shared `case 'type-changed': case 'unsupported':` arm — this would incorrectly label genuinely unsupported files as "single pane."

## Code Examples

### Confirming `monaco.editor.create` returns the same type as the diff sub-editors
```typescript
// Source: node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts:947 (installed monaco-editor@0.55.1)
export function create(domElement: HTMLElement, options?: IStandaloneEditorConstructionOptions, override?: IEditorOverrideServices): IStandaloneCodeEditor;

// Source: src/web/monaco/diff-adapter.ts:94-96 — confirms the diff editor's sub-editors are the SAME type
class PublicMonacoDiffAdapter {
  private readonly diffEditor: monaco.editor.IStandaloneDiffEditor;
  private readonly originalEditor: monaco.editor.IStandaloneCodeEditor;  // ← same type `create()` returns
  private readonly modifiedEditor: monaco.editor.IStandaloneCodeEditor;  // ← same type `create()` returns
```

### `ChangedFileSchema` — resolving D-06 (oldMode always present)
```typescript
// Source: src/contracts/comparison.ts:117-131
export const ChangedFileSchema = z
  .strictObject({
    id: z.string().regex(/^file_[A-Za-z0-9_-]{43}$/),
    status: ChangedFileStatusSchema,
    oldMode: GitModeSchema,     // ← required (no .optional()), always a 6-digit octal string
    newMode: GitModeSchema,     // ← required
    oldBlobOid: GitObjectIdSchema,
    newBlobOid: GitObjectIdSchema,
    oldPath: ExactPathSchema.optional(),   // contrast: paths ARE optional
    newPath: ExactPathSchema.optional(),
    additions: z.number().int().nonnegative().nullable(),
    deletions: z.number().int().nonnegative().nullable(),
    availability: AvailabilitySchema,
  })
  .readonly();
```

### Mode-to-kind mapping precedent to mirror for "was `<kind>`" header copy
```typescript
// Source: src/git/availability.ts:15-18,55-80
const regularFileModes: Readonly<Record<string, true>> = Object.freeze({
  '100644': true,
  '100755': true,
});
// ...
if (file.oldMode === '160000' || file.newMode === '160000') {
  return unsupportedAvailability.submodule;
}
if (file.oldMode === '120000' || file.newMode === '120000') {
  return unsupportedAvailability.symlink;
}
```
A client-side `<kind>` derivation for the type-changed header (e.g. `was symlink`, `was submodule`, generic `was <mode>` fallback) should mirror this literal-match structure against `file.oldMode`, per D-06's explicit instruction to fall back to a generic note "rather than adding git plumbing beyond what the phase needs."

### `ChangedFileStatusKindSchema` — confirms the full kind enum and which values matter for D-05
```typescript
// Source: src/contracts/comparison.ts:74-82
export const ChangedFileStatusKindSchema = z.enum([
  'added',
  'copied',
  'deleted',
  'modified',
  'renamed',
  'type-changed',
  'unsupported',
]);
```
D-05's single-pane set is `{added, deleted, type-changed}`. `unsupported` is a DISTINCT status kind from the `availability.kind === 'unsupported'` reviewability check — both must independently gate the marker/layout per D-08.

### Existing precedent for a discriminator prop driving `DiffWorkspace.vue`'s rendering branch
```typescript
// Source: src/web/components/DiffWorkspace.vue:17-26,51-59 — sourceKind already demonstrates
// the exact pattern needed for a new `status`/`layout` prop: a discriminated prop that
// flows into a `computed()` used by the template to branch rendering/copy.
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
const visibleSides = computed(() =>
  props.sourceKind === 'exact-patch'
    ? { original: 'PREIMAGE', modified: 'POSTIMAGE', originalName: 'preimage', modifiedName: 'postimage' }
    : { original: 'BASE', modified: 'HEAD', originalName: 'base', modifiedName: 'head' },
);
```

### Existing single-side-strip markup to reuse for D-12
```vue
<!-- Source: src/web/components/DiffWorkspace.vue:321-333 -->
<section class="diff-workspace" :aria-label="...">
  <div class="diff-workspace__viewport">
    <div class="diff-workspace__canvas">
      <div class="diff-workspace__side-labels" aria-hidden="true">
        <span><span>{{ visibleSides.original }}</span><span class="diff-workspace__side-cue ...">− REMOVED</span></span>
        <span><span>{{ visibleSides.modified }}</span><span class="diff-workspace__side-cue ...">+ ADDED</span></span>
      </div>
      ...
      <div ref="host" class="diff-workspace__editor" />
    </div>
  </div>
</section>
```
D-12's single-pane strip is a ONE-`<span>` variant of this (one side only, e.g. `Head · <short oid>`), reusing the same `.diff-workspace__side-labels` class and the `9px 18px` padding exception already declared for it (per `13-UI-SPEC.md:57`, citing `08-UI-SPEC.md:79-83` / `10-UI-SPEC.md:75` / `src/web/styles.css:1576-1586`).

### `CommentComposer.vue` side/line text — confirms D-13/Claude's Discretion needs no change
```vue
<!-- Source: src/web/components/CommentComposer.vue:28,48 -->
<script>
const sideLabel = () => props.side === 'base' ? 'Base' : 'Head';
</script>
<template>
  <span> · {{ sideLabel() }} line {{ line }}</span>
</template>
```
This already renders per-comment side identity regardless of layout; CONTEXT.md's discretion note ("keep as is... Add a chip only if planning finds the side is implicit somewhere") is satisfied with zero changes here — confirmed no other component relies on an *implicit* side (every existing side reference is explicit text).

### `App.vue`'s current reviewability gate (where single-pane routing attaches)
```typescript
// Source: src/web/App.vue:152,1129-1152,1172-1180
const reviewableFiles = computed(() => session.value?.files.filter((file) => file.availability.kind === 'text') ?? []);
// ...
<section v-else-if="selectedFile?.availability.kind !== 'text'" class="empty-state">
  <h2>Diff unavailable for this file</h2>
  <p>{{ selectedFile?.availability.kind === 'unsupported' ? `unsupported: ${selectedFile.availability.reason}` : 'unavailable: missing-object' }}. Select another changed file to continue reviewing.</p>
</section>
<!-- ... -->
<DiffWorkspace
  v-else-if="selectedContent !== undefined"
  ref="diffWorkspace"
  :comments="workspaceComments"
  :composer="activeComposer"
  :content="selectedContent"
  :path="selectedPath"
  :source-kind="isExactPatchSession ? 'exact-patch' : 'range'"
  :mutations-locked="attachedMutationLocked"
```
D-08's "binary, oversized, unsupported files keep today's non-reviewable placeholder" is this exact `v-else-if` block at line 1150 — it is reached BEFORE `DiffWorkspace` and does not change. `DiffWorkspace` only needs a new prop (e.g. `:status="selectedFile?.status"`) threaded through from this call site.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The module-location choice (single-pane factory inside `diff-adapter.ts` vs. a new sibling file) should default to "inside `diff-adapter.ts`" because `CODE_DENSITIES`, `TOKENS`, and the module-scope constants are already there and both factories would share them | Recommended Project Structure | Low — explicitly left to "Claude's Discretion" in CONTEXT.md; a sibling file with re-exported constants works equally well, just adds an import hop |
| A2 | `decorationsFor` (selection decoration helper) should be lifted to module scope so both adapters share one implementation, rather than each adapter duplicating the inline closure | Pattern 2 | Low — purely a DRY recommendation, not a correctness requirement; duplicating the ~10-line closure would still work |

**All other claims in this research were verified directly against source files read in this session** (`diff-adapter.ts`, `comparison.ts`, `anchor.ts`, `file-tree.ts`, `availability.ts`, `DiffWorkspace.vue`, `ActiveFileToolbar.vue`, `StatusBadge.vue`, `CommentComposer.vue`, `ReviewToolbar.vue`, `InlineNotice.vue`, `theme.ts`, `render-review-markdown.ts`, `App.vue`, installed `monaco-editor` type defs, `package.json`, `.planning/config.json`) or cited from `13-CONTEXT.md`/`13-UI-SPEC.md`/`REQUIREMENTS.md`/`ROADMAP.md`/`.claude/CLAUDE.md` — no user confirmation needed beyond A1/A2, both already flagged as the user's explicit discretion.

## Open Questions

1. **Exact final module boundary (sibling file vs. same file) for the single-pane factory**
   - What we know: CONTEXT.md explicitly defers this to "Claude's Discretion." The UI-SPEC's File Ownership Map lists `diff-adapter.ts` as owning "New plain-editor creation path parallel `createDiffEditor`," implying same-file.
   - What's unclear: Whether the planner wants a hard file-size/separation-of-concerns split given `diff-adapter.ts` is already 634 lines.
   - Recommendation: Default to same-file (per UI-SPEC's File Ownership Map wording), sharing `CODE_DENSITIES`/`TOKENS`/`applyCumpaTheme()` imports; only split into a sibling file if the planner determines line-count/readability warrants it. Either choice has zero behavioral difference.

2. **Prop shape for threading layout decision from `App.vue` into `DiffWorkspace.vue`**
   - What we know: `DiffWorkspace.vue` currently has no `status` prop; `sourceKind` is the only existing discriminator prop and demonstrates the pattern (string literal union, `withDefaults`).
   - What's unclear: Whether to pass the raw `ChangedFileStatus` object, just `kind: ChangedFileStatusKind`, or a pre-computed boolean/enum like `layout: 'single-pane' | 'side-by-side'` computed once in `App.vue`.
   - Recommendation: Pass a minimal computed prop (e.g. `singlePaneSide: 'base' | 'head' | undefined`, pre-resolved in `App.vue` from `status.kind`) rather than the full status object — keeps `DiffWorkspace.vue` decoupled from the full `ChangedFileStatus` shape and mirrors the existing narrow-prop style (`sourceKind`, not the full session object).

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` per `.planning/config.json` — section included per policy, but this phase introduces **no new attack surface**:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Unchanged — Fastify server stays bound to `127.0.0.1` ephemeral port (CLAUDE.md constraint), no new auth surface added by a rendering-only phase |
| V3 Session Management | No | No new session state; single-pane rendering reuses the existing in-memory `WorkspaceState`/`workspaceComments` already flowing into `DiffWorkspace.vue` |
| V4 Access Control | No | No new roles/permissions; file content access is already gated by `availability.kind === 'text'` (unchanged, D-08) |
| V5 Input Validation | No new surface | The only new user input is identical to the existing comment composer flow (D-13: "No new selection rules"); `oldMode`/`status.kind` are read-only fields already validated server-side by `GitModeSchema`/`ChangedFileStatusKindSchema` (`comparison.ts:74-82,92`) before reaching the client — the client only branches rendering on already-validated enum values, no new parsing of untrusted strings |
| V6 Cryptography | No | Unchanged — anchors still use the existing `buildDurableAnchor` SHA-256 context hashing (`anchor.ts`), untouched by this phase (D-14: no export/schema change) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| XSS via rendered file content | Tampering/Info Disclosure | Already mitigated — Monaco renders file text into its own canvas-based editor surface (not raw `innerHTML`), identical for both the existing diff editor and the new plain editor; no new rendering path is introduced that bypasses Monaco's model-based text rendering |
| Type-changed "was `<kind>`" label spoofing via crafted git mode | Tampering | `oldMode` is validated server-side by `GitModeSchema` (`z.string().regex(/^[0-7]{6}$/)`, `comparison.ts:92`) before the client ever sees it; the client-side mode→kind mapping is a closed literal switch (mirroring `availability.ts:55-80`) over a small known set of octal values, with an explicit generic fallback (D-06) for anything unrecognized — no injection surface |

**Justification for no new threat surface:** This phase changes only how already-fetched, already-validated, read-only review data (`ChangedFile.status`, `ChangedFile.oldMode`, existing file blob text) is laid out and labeled in the browser. It adds no new HTTP endpoints, no new persisted data, no new input fields (the comment composer is reused unchanged per D-13), and no new export/schema surface (D-14). The only "new" data consumed (`oldMode`) was already part of `ChangedFileSchema` and already shipped to the client before this phase; it was simply unused by the UI until now.

## Sources

### Primary (HIGH confidence — verified via direct file read in this session)
- `src/web/monaco/diff-adapter.ts` (full file, 634 lines) — diff editor construction, per-side event wiring, paired view-zone logic
- `src/contracts/comparison.ts:1-165` — `ChangedFileStatusKindSchema`, `ChangedFileSchema`, `AvailabilitySchema`
- `src/domain/anchor.ts`, `src/domain/file-tree.ts` — `AnchorSide`, `FileTreeLeaf.effectivePath`
- `src/git/availability.ts` (full file) — mode-to-kind classification precedent
- `src/web/components/DiffWorkspace.vue`, `ActiveFileToolbar.vue`, `StatusBadge.vue`, `CommentComposer.vue`, `ReviewToolbar.vue`, `InlineNotice.vue`
- `src/web/App.vue` (relevant sections) — current layout/reviewability routing
- `src/web/monaco/theme.ts` — `applyCumpaTheme` global theme registration
- `src/export/render-review-markdown.ts:1-63`
- `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts:947` — installed `monaco.editor.create` signature (monaco-editor@0.55.1, confirmed via `package.json:62`)
- `.planning/phases/13-single-pane-file-rendering/13-CONTEXT.md`, `13-UI-SPEC.md`
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/config.json`
- `./.claude/CLAUDE.md`

### Secondary (MEDIUM confidence)
- None used — no WebSearch/external docs needed for this internal-API phase.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, Monaco API confirmed directly in installed type defs
- Architecture: HIGH — every claim traced to actual line numbers in the current codebase, including the one correction to CONTEXT.md's stated integration point (Pitfall 3)
- Pitfalls: HIGH — derived from reading the full `rebuildAnchoredLayout`/`setFile` implementations, not inference

**Research date:** 2026-10-30
**Valid until:** 2026-11-27 (30 days — stable internal codebase, no fast-moving external dependency)
