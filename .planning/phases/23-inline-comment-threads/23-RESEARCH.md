# Phase 23: Inline Comment Threads - Research

**Researched:** 2026-11-05
**Domain:** Monaco view-zone / content-widget / overlay-widget interaction model for a keyed multi-thread comment UI, layered on an existing single-zone paired-composer adapter (Vue 3 + Monaco Editor 0.55.1)
**Confidence:** HIGH (every architectural claim grounded in this repo's own `src/` and installed `node_modules/monaco-editor` type declarations; Monaco pointer-event/content-widget behavior cross-checked against Microsoft's own typedoc and real GitHub issue reports, not training-data recall alone)

## Summary

This phase ports the current **single active composer, one zone pair** model in `src/web/monaco/diff-adapter.ts` to **N simultaneously expanded threads per file**, each independently interactive (click, type, Tab/Shift+Tab, Esc) and each keeping Base/Head paired-zone heights in sync. The existing code already proves three of the four hard pieces in isolation — paired-zone height sync for exactly one pair (`growPairedZones`), one-shot Vue-component-into-zone-DOM rendering (`DiffWorkspace.vue`'s `render(h(...), zone)` into `.monaco-anchor-zone--composer`), and the dual-registration keybinding pattern (Monaco `addAction` + global `document` keydown, already shipped for F7/⇧F7 and ⌥↑/⌥↓) — but none of these have been proven at N>1, and the interactive-DOM-inside-a-zone approach the current composer uses is exactly the pattern Monaco's own ecosystem has documented as unreliable once more than one pane/line is involved. **No prior spike or SKILL precedent exists for the content-widget/overlay-widget interaction model in this codebase** — `spike-findings-loopnote` only covers CLI branch-discovery startup performance (unrelated), confirmed by reading its `SKILL.md` and `sources/` listing.

The single highest-risk unknown — content widgets going blank mid-scroll when "half in/out" of the viewport (a documented, reproduced Monaco community bug, not a theoretical concern) — means the spike must test **both** the content-widget (`addContentWidget`, position `BELOW` the anchor line) and overlay-widget (`addOverlayWidget` with `onDomNodeTop`-driven pixel coordinates) techniques against real scrolling, not pick one from documentation alone.

**Primary recommendation:** Build Plan 01 as a throwaway Monaco-only prototype (no Vue component mounting yet) that (a) creates 2–3 view zones per editor for layout/height reservation, (b) renders one real `<textarea>` + 3 buttons per zone via **overlay widgets positioned through `onDomNodeTop` + `IOverlayWidgetPositionCoordinates`** (not content widgets) as the primary candidate, with content-widget-`BELOW` kept only as a documented fallback to compare against, and (c) measures all four CONTEXT.md spike criteria (pointer/keyboard, paired-height sync at N≥2, scroll/hidden-region survival, 30-thread lag) with real Playwright + CDP tracing before any production code is written.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Thread render position (which line, Base vs Head) | Browser / Client (Monaco adapter) | — | Already owned by `PairedZoneDiffAdapter`'s `afterLineNumber` zone placement; this phase extends, not relocates, it |
| Paired zone height sync across N threads | Browser / Client (`diff-adapter.ts`) | — | Pure Monaco view-zone layout concern; no server involvement |
| Interactive thread chrome (click/type/Tab/Esc) | Browser / Client (new content/overlay widget layer) | — | Must live in Monaco's dedicated widget-rendering layer, not the view-zone `domNode`, per Critical Pitfall 2 |
| Thread state (open/resolved, anchor verification) | API / Backend (unchanged) | Browser / Client (read-only render) | `src/contracts/draft.ts` + `mutate-draft.ts` already own this; UI only renders `comment.state`/`verification.state`, never recomputes |
| Draft reconciliation / zone diffing on Refresh | Browser / Client (`draft-reconciliation.ts` consumer) | — | Reconciliation itself stays pure-function; the *new* keyed-zone diff lives in the adapter/DiffWorkspace layer that consumes its output |
| Anchor identity / golden-hash | API / Backend + shared domain (`src/domain/anchor.ts`) | — | Read-only from this phase's perspective; must not be touched |
| Editor-title navigation actions (prev/next thread, collapse-all) | Browser / Client (`EditorTitle.vue` + `diff-adapter.ts` `addAction`) | — | Direct extension of the existing icon-button + dual-keybinding pattern used for F7/Alt-arrows |
| Delete-with-Undo timing/flush | Browser / Client (`App.vue` session lifecycle hooks) | — | No new persistence authority; `pagehide`/`visibilitychange` flush is client-only, matches "UI preferences stay client-local" security pitfall |

## Standard Stack

### Core
No new runtime dependencies. This phase extends already-installed libraries only.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `monaco-editor` | 0.55.1 [VERIFIED: package.json] | Diff editor, view zones, content/overlay widgets | Already the project's sole editor dependency; `package.json` pins `0.55.1`, `node_modules` confirms it (note: `npm view monaco-editor version` reports `0.57.0` latest on the registry [VERIFIED: npm registry] — **do not bump** mid-phase; CONTEXT.md and this research assume the pinned 0.55.1 API surface, which already exposes every API this phase needs: `addContentWidget`, `addOverlayWidget`, `IViewZone.onDomNodeTop`, `layoutContentWidget`, `layoutOverlayWidget` — confirmed present in `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts`) |
| `vue` | 3.5.39 [VERIFIED: package.json] | `render(h(...), domNode)` imperative mount into widget DOM, exactly as `DiffWorkspace.vue` already does for the composer | Project's established "Vue owns content *inside* each zone, Monaco owns the zone itself" split (confirmed in PITFALLS.md Integration Gotchas table) |
| `zod` | 4.4.3 [VERIFIED: package.json] | No schema changes needed this phase (see Phase Requirements table) | — |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | 1.61.1 [VERIFIED: package.json] | Spike's pointer/keyboard/scroll/perf measurement harness | Existing `tests/e2e`/`tests/integration` Playwright suites are the only real-browser verification path in this repo; no new test runner needed |
| `vitest` | 4.1.10 [VERIFIED: package.json] | Unit-level adapter tests (keyed-map logic) | Mirrors `tests/unit/monaco-diff-adapter.test.ts`'s existing mocked-Monaco pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Monaco `IContentWidget` positioned `BELOW` anchor line | Monaco `IOverlayWidget` with `onDomNodeTop`-driven pixel coordinates | Content widgets are simpler to reason about but have a **reproduced** bug (GitHub discussion #4477, 2024) where content widgets render blank once scrolled "half in/out" of the viewport — both with and without `allowEditorOverflow`. Overlay widgets avoid the disappearing-widget bug (they render in Monaco's dedicated overlay layer, not clipped by the same culling) but the same source reports scroll "rubber-band" jank when manually syncing `top` from `onDomNodeTop` during a scrollbar-drag. **The spike must test both against real scroll interaction** — this is not a documentation-level decision. |
| Raw DOM inside the view zone's own `domNode` (today's composer pattern) | Content/overlay widget layered over a spacer-only zone | Today's `createComposerZone` puts the interactive `<textarea>` directly in the zone's `domNode` with `suppressMouseDown: false`. This is **already flagged as unproven at scale** by the project's own design research (PITFALLS.md Critical Pitfall 2, quoting `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md:9` verbatim) and works today only because there is exactly one zone, one textarea, and manual slow clicks in practice — fast automated Playwright clicks are flagged as focus-timing-sensitive even in the one-zone case. |

**Installation:** None — no new packages.

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages. All work extends `monaco-editor`, `vue`, `zod`, and `@playwright/test`, all already present and verified in `package.json`/`node_modules`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THREAD-01 | Every comment on current file renders as inline thread under its anchored line, reachable by mouse/keyboard; delete offers Undo | Architecture Pattern 1 (keyed zone map) + Pattern 2 (content/overlay widget layer) solve render+reachability; Delete-Undo is a client-only timer/flush pattern (`pagehide`/`visibilitychange`), no new schema — see `DraftMutationRequestSchema` in Phase Requirements support below |
| THREAD-02 | *(not in provided REQUIREMENTS excerpt beyond title; covered by state chip + verification rendering)* | `src/contracts/draft.ts` `AnchorVerificationSchema`/`DraftCommentSchema` already expose `state`/`verification.state`/`verification.reason` read-only — UI-SPEC's Chip Priority table consumes these directly |
| THREAD-03 | Resolve/reopen via header actions | `DraftMutationRequestSchema` already has `resolveComment`/`reopenComment` variants (api.ts:62-70) — zero schema change confirmed by reading the Zod source directly |
| THREAD-04 | Edit comment text inline, ⌘Enter save / Esc cancel | `editComment` variant already present (api.ts:51-55); in-progress text kept client-side keyed by `comment.id`, same pattern as today's single `activeComposer.text` field generalized to a map |
| THREAD-05 | Open expanded / resolved collapsed by default, per-thread and collapse-all toggle, session-scoped | Pure client state: `Map<CommentId, boolean>` collapse flags, not persisted (matches Security Mistakes table: "keep UI-only preferences in browser-local state, never a new persistence authority") |
| THREAD-06 | Gutter `+` to add comment | Existing `CommentComposer.vue`/`activateAnchor` flow unchanged per UI-SPEC; only a new hover-triggered `+` chip affordance, no adapter change |
| THREAD-07 | Jump prev/next thread across files, tree order | Needs a flattened thread-order model (tree-path → Base/Head → line, per CONTEXT.md) independent of Monaco; Monaco adapter only needs `revealAnchor` (already exists) + expand-on-arrival |
| THREAD-08 | Threads survive draft reconciliation + Refresh: position, expanded state, in-progress edit text | Architecture Pattern 3 (diff-by-comment-id reconciliation) is the direct answer; Critical Pitfall 3 below is this requirement's exact failure mode |
| THREAD-09 | Prev/next-thread + collapse-all icons in editor title; ⌥F9/⇧⌥F9 inside and outside editor | Architecture Pattern 4 (dual-registration precedent already shipped for F7/Alt-arrows) is the direct template; Critical Pitfall 7 (single-layer-per-shortcut) must be followed, not re-derived |

</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Design source:** `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` § Inline thread widget and sketch `004-comment-threads` variant **A** (thread frame, 2px state-coloured top rule, header anatomy, state chips, collapsed snippet, gutter `+` chip). The reply textarea in the sketch is out of scope.

**Undo & anchor states:**
- Delete with Undo = delayed commit: hide the thread immediately and show a toast with Undo for 5s; send `deleteComment` only when the toast expires or the session is left (flush on `pagehide`/`visibilitychange`). Undo restores the same comment (same id). No schema change.
- Orphaned comments (anchor unavailable): shown as a file-level "Orphaned comments" group pinned at the top of the diff area (and later in the Phase 24 Comments tab), state chip "Anchor missing".
- Stale comments (anchor mismatch): rendered at the recorded line with the "Anchor moved" chip and the recorded selected text quoted in the body.
- Edit is available on open threads only; resolved threads must be reopened first.

**Thread interaction:**
- Keyboard entry: with editor cursor on a line that has a thread, ⌥Enter focuses the thread header (⌥Enter on an uncommented line keeps opening the composer as today); Tab cycles header actions; Esc returns focus to the editor at that line.
- Header actions (Resolve/Reopen, Edit, Delete) are visible on hover AND whenever focus is within the thread — never hover-only.
- Collapse state: in-memory per comment id for the session; editor-title "Collapse all threads" applies to the current file and toggles to "Expand all threads". Defaults: open threads expanded, resolved collapsed.
- ⌥F9 / ⇧⌥F9 order: tree path order (Phase 21 order), then Base before Head, then line; wraps around with a single live announcement "Wrapped to first thread" / "Wrapped to last thread".

**Spike & fallback:**
- Plan 01 is a go/no-go spike proving, in the real diff editor (side-by-side, inline mode, single-pane): pointer clicks, textarea typing, Tab/Shift+Tab and Esc inside a content widget layered over a view zone; paired zone heights stay in sync when a thread grows/shrinks; widgets survive scrolling and hidden-unchanged-region collapse/expand; 30 threads in one file without perceptible input lag (measure).
- If the spike fails: STOP and return to the user for a re-plan decision before any thread UI is built (do not silently fall back to panel-only threads).
- In-progress edit text is kept in memory keyed by comment id through draft reconciliation and Refresh; if the anchor becomes stale/orphaned mid-edit, keep the editor open with a warning.
- No per-file thread cap; zones/widgets are diffed by comment id (keyed map), never rebuilt wholesale.

### Claude's Discretion
- Adapter architecture (keyed multi-zone map extending `diff-adapter.ts`'s paired-zone helpers), component split (`CommentThread.vue` mounted via `render()` into widget DOM as today's cards are), focus management details, toast component reuse.

### Deferred Ideas (OUT OF SCOPE)
- Replies (REQUIREMENTS Future REPLY-01).
- The Comments panel tab (Phase 24).
- Per-file viewed tracking (deferred, DEFER-01).
- No draft/export schema changes this phase.
</user_constraints>

## Architecture Patterns

### System Architecture Diagram

```
User input (click / keystroke / Tab / Esc)
        │
        ▼
Monaco mouse/keyboard layer
  (editor DOM, view-lines layer, widget layer — DISTINCT STACKING CONTEXTS)
        │
        ├─► if target is inside a VIEW-ZONE domNode  ──► Critical Pitfall 2:
        │                                                 pointer events NOT reliable
        │                                                 at N>1 zones (today's composer
        │                                                 only works because N=1)
        │
        └─► if target is inside a CONTENT/OVERLAY WIDGET's domNode
                   (Monaco's dedicated widget-rendering layer, zIndex above view-lines)
                        │
                        ▼
              DiffWorkspace.vue's render(h(CommentThread, {...}), widgetDomNode)
                        │
                        ▼
              Vue component emits (resolve/reopen/edit/delete) ──► App.vue mutateReview()
                        │                                                   │
                        │                                                   ▼
                        │                                        existing DraftMutationRequestSchema
                        │                                        (editComment/deleteComment/
                        │                                         resolveComment/reopenComment)
                        │                                        — ZERO schema change
                        ▼
              Keyed zone map: Map<CommentId, {anchorZoneId, spacerZoneId, widgetId}>
                        │
                        ▼
              growPairedZones-equivalent, generalized per key
              (height sync so Base/Head stay line-aligned per thread)
                        │
                        ▼
      Draft reconciliation (draft-reconciliation.ts, UNCHANGED pure function)
                        │
                        ▼
      NEW: diff-by-comment-id pass (add/remove/update exactly the zones that
      changed comment identity — never tear down and rebuild the whole map)
```

### Recommended Project Structure
No new top-level folders. Extend existing files:
```
src/web/monaco/
├── diff-adapter.ts          # extend: Map<CommentId, PairedZonePair> replaces single originalZone/modifiedZone;
│                            #   keep single-composer path for the "add new comment" draft-in-progress case
│                            #   (THREAD-06 gutter + still uses the existing unchanged composer flow)
src/web/model/
├── draft-reconciliation.ts  # UNCHANGED — already comment-id-keyed per-comment output; consumer owns the diff
├── thread-order.ts          # NEW (discretion): flattened tree-path → Base/Head → line ordering for THREAD-07/09
src/web/components/
├── DiffWorkspace.vue        # extend: one render(h(...), widgetDomNode) call per live thread, not one total
├── CommentThread.vue        # NEW (discretion): header + body + actions, mounted exactly like today's
│                            #   inline-accepted-comment <section>, replaces its single-comment render call
├── UndoToast.vue            # NEW — THREAD-01 delete-Undo, reuses existing .modal-dialog overlay chrome recipe
└── workbench/
    └── EditorTitle.vue      # extend: add previous-thread/next-thread/collapse-threads icon group,
                              #   same pattern as existing previous-file/next-file group
```

### Pattern 1: Keyed paired-zone map (generalizes `growPairedZones` from 1 pair to N)
**What:** Replace `PublicMonacoDiffAdapter`'s single `originalZone`/`modifiedZone` fields with `Map<string, { anchorZoneId: string; spacerZoneId: string; anchorSide: DiffSide }>` keyed by `comment.id`. `rebuildAnchoredLayout()` becomes a per-key operation; `growPairedZones(heightInPx)` becomes `growPairedZones(commentId, heightInPx)` looking up the one pair in the map instead of the two private fields.
**When to use:** Any time the adapter needs to create, resize, or remove a thread's zone pair — covers THREAD-01 (render), THREAD-04 (edit grows the zone), THREAD-08 (reconciliation updates one key without touching others).
**Why this is safe to do without an architectural rewrite:** The *shape* of the per-pair logic (`createComposerZone`/`createSpacerZone`/`addZone`/`positionZones`/`growPairedZones`, `diff-adapter.ts:637-699`) is already a pure function of `(anchor, heightInPx)` — it does not currently read or write the single-pair fields except to store/retrieve the two zone ids. Swapping `this.originalZone`/`this.modifiedZone: X | undefined` for `this.pairsByCommentId: Map<string, X>` and iterating is a mechanical generalization, not a redesign. **The activeComposer (new, unsaved comment being drafted) stays a single field** — it is not yet a comment id, so it does not belong in the keyed map; keep `rebuildAnchoredLayout()`'s existing one composer-zone path for the in-progress-add case, and add a second, parallel keyed-map path for already-persisted comments. This is the "not architectural rewrite" the CONTEXT.md discretion note asks for.
**Example (shape, not literal diff):**
```typescript
// Source: generalized from src/web/monaco/diff-adapter.ts:692-699 (verified in this repo)
private readonly threadZones = new Map<string, { id: string; zone: monaco.editor.IViewZone }>();
// one entry per (commentId, side) — i.e. 2 Map entries per thread, same as today's 2 fields per composer

private growThreadZone(commentId: string, side: DiffSide, heightInPx: number): void {
  const entry = this.threadZones.get(`${commentId}:${side}`);
  if (entry === undefined) return;
  entry.zone.heightInPx = heightInPx;
  this.editorFor(side).changeViewZones((accessor) => accessor.layoutZone(entry.id));
}
```

### Pattern 2: Interactive chrome via overlay widget, position driven by the zone's own `onDomNodeTop`
**What:** The zone's `domNode` becomes a plain, non-interactive spacer again (as `createSpacerZone` already is for the counterpart side) — **on both sides**, including the "anchored" side. The actual `CommentThread.vue` DOM lives in a separate `IOverlayWidget` (not inside any zone's `domNode`), whose vertical position is driven by that zone's `onDomNodeTop` callback.
**When to use:** Every rendered thread, replacing today's "interactive DOM directly in the zone's `domNode`" composer pattern once N>1 zones are live.
**Why overlay widget over content widget:** [CITED: github.com/microsoft/monaco-editor/discussions/4477] A content widget positioned with `preference: [ContentWidgetPositionPreference.BELOW]` at the anchor line goes **blank mid-scroll** once it is partially outside the viewport — reproduced with and without `allowEditorOverflow: true` — because Monaco's content-widget layer culls/repaints based on the *text position* it's anchored to, which stops being fully visible before the zone's reserved space does. An `IOverlayWidget` does not have this failure mode (it renders in a fixed overlay DOM layer, independent of text-position culling), but the same report found a "rubber-band" visual jank when manually syncing a widget's `top` style from scroll events during fast scrollbar drags. **Both must be spiked against real `page.mouse.wheel()`/scrollbar-drag interaction**, not assumed from documentation.
**Verified API surface (installed 0.55.1, confirmed in `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts`):**
- `IViewZone.onDomNodeTop?: (top: number) => void` (line 5500) — fires with the zone's live top-in-px, accounting for scroll.
- `IOverlayWidgetPosition.preference: OverlayWidgetPositionPreference | IOverlayWidgetPositionCoordinates | null` (line 5673) where `IOverlayWidgetPositionCoordinates = { top: number; left: number }` (line 5655-5664) — lets the widget be placed at an exact pixel offset instead of a named corner.
- `ICodeEditor.layoutOverlayWidget(widget): void` / `.layoutContentWidget(widget): void` (lines 6331, 6344) — must be called explicitly after changing a widget's reported position; Monaco does not auto-relayout a widget when only the backing view zone's height changes.
**Example (shape, not literal diff):**
```typescript
// Source: pattern synthesized from node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts
// IViewZone (5441-5505), IOverlayWidget (5684-5710) + community precedent
// (github.com/microsoft/monaco-editor/discussions/4477, reply by issue author diddiman)
let widgetTop = 0;
const zone: monaco.editor.IViewZone = {
  afterLineNumber: anchor.line,
  domNode: spacerDiv,          // plain, non-interactive, aria-hidden
  heightInPx: currentHeight,
  suppressMouseDown: true,     // spacer never needs to receive clicks itself
  onDomNodeTop: (top) => {
    widgetTop = top;
    editor.layoutOverlayWidget(overlayWidget);
  },
};
const overlayWidget: monaco.editor.IOverlayWidget = {
  getId: () => `thread-${commentId}`,
  getDomNode: () => threadDomNode,     // CommentThread.vue mounts here via render(h(...), threadDomNode)
  getPosition: () => ({ preference: { top: widgetTop, left: gutterOffsetPx } }),
  allowEditorOverflow: false,
};
editor.addOverlayWidget(overlayWidget);
```

### Pattern 3: Diff-by-comment-id reconciliation (never tear-down-and-rebuild)
**What:** On every draft reconciliation pass (`draft-reconciliation.ts`'s `reconcileDraftComments` output, unchanged) and every Refresh, the **consumer** (DiffWorkspace.vue / adapter) must diff the new `WorkspaceComment[]` against the previously-rendered `threadZones` map by `comment.id`: create zones only for ids newly present, remove zones only for ids no longer present, update in place (text/state/height) for ids present in both. Never call a blanket "clear all zones, re-render everything" path.
**When to use:** Every time `App.vue` calls into the workspace after a server round-trip (Refresh, conflict recovery, resolve/reopen/delete/edit confirmation).
**Why `draft-reconciliation.ts` itself needs no structural change:** `reconcileDraftComments` (lines 55-62) already maps `DraftComment[] → WorkspaceComment[]` one-to-one, keyed by `comment.id` implicitly (the `id` field survives the map). The gap is entirely on the **consumer** side — today there is no consumer that owns more than one rendered comment at a time, so no diffing logic exists yet to generalize. This is new code, not a rewrite of existing code — write the diff as a small, separately-testable function: `diffThreadIds(previousIds: ReadonlySet<string>, nextComments: readonly WorkspaceComment[]): { toCreate: string[]; toRemove: string[]; toUpdate: string[] }`.
**Example:**
```typescript
// Source: new — generalizes the pattern described in PITFALLS.md Critical Pitfall 3
// ("Key zones by comment.id ... reuse Phase 14's already-proven reconciliation [approach]")
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

### Pattern 4: Dual-registration keybindings — ONE layer per shortcut (direct precedent, do not re-derive)
**What:** `⌥F9`/`⇧⌥F9` must be registered as a Monaco `editor.addAction` (fires when focus is inside either Monaco editor) **and separately** on `App.vue`'s existing global `document.addEventListener('keydown', handleKeydown)` (fires when focus is anywhere else, e.g. the sidebar or a dialog). This is **not** a double-fire risk in this codebase's existing implementation: Monaco's own keybinding service calls `preventDefault`/`stopPropagation` internally for actions registered via `addAction`, so the event never reaches `document` while focus is inside the editor — confirmed by the fact that `F7`/`⇧F7`/`⌥↑`/`⌥↓` are *already* registered at both layers today (`diff-adapter.ts:199-246` for Monaco; `App.vue:963-970` for the global handler) and REQUIREMENTS.md's NAV-03 explicitly requires exactly this "both inside and outside the diff editor" behavior as already-shipped, Complete-status behavior.
**When to use:** THREAD-09's ⌥F9/⇧⌥F9 previous/next-thread shortcuts — copy the existing F7/Alt-arrow registration shape exactly (one `addAction` per editor instance — both `originalEditor` and `modifiedEditor` get their own action with the same keybinding, matching lines 199-246 and 761-784's per-side duplication — plus one new branch in `App.vue`'s `handleKeydown`).
**Anti-pattern this guards against (Critical Pitfall 7):** Registering the same shortcut only globally, or only in Monaco, will make it work in one focus context and silently do nothing in the other — invisible in the existing e2e suite because `page.keyboard.press` doesn't reproduce browser-chrome shortcut interception differences, so this must be verified by the same dual-focus-context check the F7 tests already use (search `tests/e2e`/`tests/integration` for how F7 is tested both editor-focused and editor-unfocused before writing a new assertion style).
**Example:**
```typescript
// Source: verified in this repo, src/web/monaco/diff-adapter.ts:199-210 (existing, unmodified)
this.originalEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.next-change-base`,
  label: 'Next change',
  keybindings: [monaco.KeyCode.F7],
  run: () => this.navigate.nextChange(),
}),
// THREAD-09 copies this exact shape with KeyMod.Alt | KeyCode.F9 / KeyMod.Alt | KeyMod.Shift | KeyCode.F9
```

### Anti-Patterns to Avoid
- **Driving zone DOM mutation from a Vue `watch`/reactive render cycle on every comment-state change:** Monaco's own layout pass and Vue's render pass will fight each other (each re-triggering the other). Keep zone/widget creation and mutation imperative inside the adapter class (as today), with Vue owning only the content rendered *inside* each widget's mounted app instance. [Verified pattern from PITFALLS.md Integration Gotchas table, cross-checked against existing `DiffWorkspace.vue`/`diff-adapter.ts` split.]
- **Putting the interactive thread DOM inside the view zone's own `domNode`:** This is today's composer pattern and it is explicitly flagged as unproven beyond N=1 — see Critical Pitfall 2.
- **Treating `draft-reconciliation.ts` as needing a rewrite:** It already outputs a comment-id-keyed array; the new work is entirely in the consumer's diffing layer, not the reconciliation function itself.
- **Letting `src/domain/anchor.ts` be touched "just to also show the last line" or similar UI convenience:** Any change to `buildDurableAnchor`'s hash inputs (`CONTEXT_DOMAIN`/`UNIQUE_DOMAIN` fields) risks silently moving the golden-hash regression pinned in `tests/unit/anchor.test.ts`. Read `comment.anchor.line`/`.endLine`/`.state` only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Positioning interactive DOM relative to a scrolling Monaco line | A custom `scroll` listener computing `getBoundingClientRect()` offsets by hand | `IViewZone.onDomNodeTop` + `IOverlayWidget.getPosition()` returning `IOverlayWidgetPositionCoordinates` | Monaco already computes the scroll-adjusted top for you per render frame; a hand-rolled scroll listener will drift from Monaco's own internal frame timing and reproduce exactly the "rubber-band" jank the community report describes, likely worse |
| Toast/snackbar for delete-Undo | A new overlay primitive from scratch | Reuse the existing `.modal-dialog` overlay chrome recipe (`styles.css:737-741`), already reused by `22-UI-SPEC.md`'s identity popover | UI-SPEC explicitly confirms (via `glob` across `src/web/components/`) no toast precedent exists, but the *chrome recipe* (border/shadow/surface token) is already established and should not be reinvented as a third variant |
| Flattened cross-file thread ordering for ⌥F9/⇧⌥F9 | A new tree-walk from scratch | Reuse Phase 21's tree path order (the same order FileTreeModel already produces) as the outer sort key, then Base-before-Head, then line number | CONTEXT.md locks this exact ordering; Phase 21 is landing concurrently and already owns the canonical tree order — do not re-derive it independently (and per this assignment's own constraint, do not edit `FileTree.vue`/`file-tree.ts` — only consume their already-exposed order) |

**Key insight:** Every "hard" primitive this phase needs (scroll-aware positioning, comment-id-keyed diffing, dual-layer keybindings, mutation schema) already has either a Monaco-native API or an in-repo precedent. The actual unknown is purely empirical: *do the Monaco APIs behave correctly at N>1 and under real scroll/perf conditions* — which is exactly what Plan 01's spike must measure, not architect around.

## Common Pitfalls

### Pitfall 1: Monaco view-zone height desync between Base/Head panes, generalized to N pairs
**What goes wrong:** Today exactly one `ActiveComposer` zone pair exists; `growPairedZones()` resizes both sides together in one call. With N independently-growing threads (each can be expanded/collapsed/edited at different times), a height change to thread A's zone pair must never be allowed to leave thread B's pair out of sync, and the two sides' zones for the *same* thread must always resize atomically together.
**Why it happens:** `layoutZone()` is called once per side per resize; if the two calls for the same thread aren't both issued inside the same tick (e.g., one is deferred behind a `nextTick()` that the other isn't), a frame can render with one side already grown and the other not yet — visible as a one-frame "jump."
**How to avoid:** Keep the existing pattern of resizing both sides' `IViewZoneChangeAccessor.layoutZone()` calls back-to-back, synchronously, inside one `changeViewZones` pass per side, exactly as `growPairedZones` does today (`diff-adapter.ts:692-699`) — just looked up by key instead of by field. Never let a Vue `nextTick()` separate the two `layoutZone()` calls for the same thread.
**Warning signs:** Two side-by-side threads on different lines visually overlapping or leaving a gap on one side only; Base/Head code drifting out of row alignment when resolving/reopening a thread; Chromium screenshot diffs showing misaligned gutters.
**Verification approach:** A real-browser (not source-review) geometry assertion with **≥2 simultaneously open threads of different heights** — `expect.poll` comparing `getBoundingClientRect()` of both sides' zones, following the existing `tests/integration/monaco-anchor.spec.ts:78-83` `expectPairedZonesAligned` helper's shape but parameterized over multiple thread ids instead of the single hardcoded pair.

### Pitfall 2: Interactive DOM inside a zone doesn't reliably receive pointer events at N>1 (Critical, go/no-go gate)
**What goes wrong:** Buttons, the edit textarea, Tab/Shift+Tab focus cycling inside a thread silently stop responding to clicks/keystrokes, or events "pass through" to the Monaco line underneath.
**Why it happens:** [CITED: `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md:9`] "Interactive DOM inside zone needs overlay/content widget positioned over zone, view-zone DOM does not receive pointer events reliably." Monaco's own mouse-handling layer sits above the view-zone content layer in some interaction paths; today's single composer zone (`suppressMouseDown: false`, interactive `<textarea>` directly in the zone's `domNode`) is the exact pattern flagged as unproven beyond N=1, and real-world Monaco usage ([CITED: github.com/microsoft/monaco-editor/issues/2395] "Right click in view zone or content/overlay widget has inconsistent behavior") confirms this is a known, still-open upstream inconsistency, not a one-off local bug.
**How to avoid:** Render thread chrome via an **overlay widget** (Pattern 2 above), not inside the zone's own `domNode`. Reserve layout space with a plain spacer zone on both sides (as `createSpacerZone` already does for the counterpart side today); drive the overlay widget's position from that zone's `onDomNodeTop` callback. This moves the interactive DOM into Monaco's dedicated widget-rendering layer, which is architecturally distinct from the view-zone content layer the pointer-event bug affects.
**Warning signs:** Manual slow clicks work, fast Playwright `.click()` calls don't (focus-timing sensitive); keyboard Tab cycling skips elements or loses focus entirely when the thread is scrolled partially off-screen.
**Verification approach — concrete, for Plan 01's spike acceptance criteria:**
1. `page.getByRole('button', { name: 'Resolve thread' }).click()` (and Edit/Delete) against **every** rendered thread, not just the first — N≥3 in one file, packaged Chromium (not dev server), per PITFALLS.md's existing "Recovery Strategies" verification-shape precedent.
2. Keyboard: focus a thread header, `page.keyboard.press('Tab')` through Resolve→Edit→Delete, `Shift+Tab` back, `Escape` returns focus to the Monaco editor at that line — assert via `page.evaluate(() => document.activeElement?.getAttribute('aria-label'))` at each step, not just a final state check (Tab-order bugs are intermediate-state bugs).
3. Typing: open edit mode on a thread not at the top of the file, type into the textarea, assert the value lands (not silently dropped) — repeat with the editor pre-scrolled so the thread starts partially below the fold.
4. Scroll survival (explicit CONTEXT.md criterion): `page.mouse.wheel(0, N)` through a file with 5+ threads at varying scroll positions, re-run checks 1-3 on a thread that was mid-scroll (partially clipped) at the moment of interaction — this is the specific scenario the content-widget disappearing-bug report describes, so it must be the scroll pattern tested, not just "scroll to top/bottom."
5. Hidden-unchanged-region collapse/expand (explicit CONTEXT.md criterion): toggle `hideUnchangedRegions` (as `revealAnchor`/`setActiveAnchor` already do via `contextMode`), assert a thread anchored inside a region that just expanded/collapsed re-renders at the correct position without losing its widget identity.
**Phase to address:** This phase, Plan 01, before any production thread UI is built — if this fails even with the overlay-widget approach, STOP per CONTEXT.md's explicit instruction (do not silently fall back to panel-only threads).

### Pitfall 3: Zone churn during draft reconciliation silently drops/duplicates thread UI
**What goes wrong:** `draft-reconciliation.ts` rebuilds the comment→file index (`exactFileIndex`, lines 25-35) whenever the session's server-returned file set changes (Refresh, conflict-recovery reload). Today this only ever re-renders zero or one zone. A naive port ("just re-run thread rendering on every reconciliation pass") will destroy and recreate every Monaco view zone/overlay widget on every Refresh — visible as the whole diff "jumping," lost scroll position, and lost in-progress edit-textarea content, which directly violates THREAD-08.
**Why it happens:** Reconciliation today is comment-anchor-centric and was never required to preserve DOM/widget identity across a pass, because at most one live zone ever existed. `reconcileDraftComments` itself is fine (it already outputs comments keyed by stable `id`); the risk is entirely in a consumer that doesn't diff against what's already rendered.
**How to avoid:** Implement and unit-test the `diffThreadIds`-shaped function from Pattern 3 above as its own small, pure function — verifiable without a real Monaco instance — then wire the consumer to call create/update/remove only for the ids the diff identifies, never a blanket clear-and-rebuild.
**Warning signs:** Visible flicker on every Refresh even when no comments actually changed; an in-progress edit's typed text disappearing after Refresh; scroll position jumping to the top of the file after any reconciliation pass.
**Verification approach:** Refresh an uncommitted session with an open edit-textarea mid-type on one thread and at least one *other* unrelated thread rendered; assert (a) the unrelated thread's zone/widget DOM node identity (`data-comment-id` attribute, same element reference) is unchanged, (b) the in-progress edit text is still present, (c) scroll position (`editor.getScrollTop()`) is unchanged. This is the literal shape of PITFALLS.md's own "Pitfall-to-Phase Mapping" verification note for Critical Pitfall 3.

### Pitfall 4: Golden-hash anchor contract drift via UI convenience changes
**What goes wrong:** `src/domain/anchor.ts`'s `buildDurableAnchor`/`verifyDurableAnchor` is covered by a pinned golden-hash regression test (`tests/unit/anchor.test.ts`). A seemingly harmless UI change — e.g., "also show the comment's recorded context line in the thread header" — can tempt a developer to add a new field to `buildDurableAnchor`'s inputs or change what context window it hashes, silently moving the golden hash and breaking drift-detection correctness for every *existing* draft on disk.
**Why it happens:** The same comment object carries both the anchor-identity fields (`anchor.line`/`anchor.endLine`, consumed by `buildDurableAnchor`) and the UI-rendering fields (`recordedAnchor`, `verification.state`) adjacent to each other in `draft-reconciliation.ts:45-51`'s `reconcile()` output, making it easy to reach for the wrong one.
**How to avoid:** Treat `src/domain/anchor.ts` as read-only for this entire phase. The thread UI only ever reads already-computed `comment.anchor.line` / `comment.anchor.endLine` / `comment.state` / `comment.verification.state` / `comment.verification.reason` — confirmed these are exactly the fields `DraftCommentSchema`/`ExportCommentSchema` already expose (`src/contracts/draft.ts:63-66, 131-148`) — and never calls into `buildDurableAnchor`/`verifyDurableAnchor` directly or adds new hash-input fields.
**Warning signs:** Any diff touching `src/domain/anchor.ts` in a thread-UI plan; `tests/unit/anchor.test.ts`'s pinned hash assertion failing.
**Verification approach:** Grep every plan's `files_modified` for `src/domain/anchor.ts` before merging — it should never appear in this phase's plans. Run `tests/unit/anchor.test.ts` unchanged at the end of every plan that touches comment rendering.

### Pitfall 5 (new to this phase, not in PITFALLS.md verbatim): Single-pane adapter has no counterpart zone to keep in sync, but still needs the keyed map
**What goes wrong:** `PublicMonacoSinglePaneAdapter` (diff-adapter.ts:709-1091) has only one `zone` field, no paired counterpart, because single-pane mode (standalone sessions, added/deleted files) has only one editor. If the keyed-map generalization is written only against `PublicMonacoDiffAdapter`'s paired-zone shape, the single-pane adapter's thread rendering will need a parallel, non-paired keyed-map implementation — easy to forget since both classes currently expose the same `MonacoDiffAdapter` public interface (`setAnchorZoneHeight`, `getActiveAnchor`, etc.) but have structurally different private zone-tracking.
**Why it happens:** The two classes share a public interface but not an implementation; a plan written only against `PublicMonacoDiffAdapter`'s internals risks leaving `PublicMonacoSinglePaneAdapter` on the old single-zone model, silently breaking THREAD-01 for every added/deleted file and standalone session (same "five session kinds" risk class flagged generally in PITFALLS.md Critical Pitfall 9, applied specifically to this adapter pair).
**How to avoid:** Generalize both classes' zone tracking to a keyed map in the same plan/commit; add an explicit test matrix row for single-pane mode in Plan 01's spike (CONTEXT.md's own spike description explicitly lists "single-pane" as one of the three modes to prove, alongside side-by-side and inline).
**Verification approach:** Run the full Pitfall 2 verification checklist against a single-pane (added/deleted file) session, not only a two-pane diff session.

## Code Examples

### Existing single-pair growth (verified, current behavior — the pattern being generalized)
```typescript
// Source: src/web/monaco/diff-adapter.ts:692-700 (verified, current repo state)
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

### Existing Vue-into-zone mount (verified, current behavior — the pattern `CommentThread.vue` extends)
```typescript
// Source: src/web/components/DiffWorkspace.vue:176-194 (verified, current repo state)
render(h('section', { class: 'conversation-card inline-accepted-comment', 'data-comment-id': comment.id }, [
  h('header', { class: 'conversation-card__header' }, [/* ... */]),
  h('div', { class: 'conversation-card__body' }, [h('p', comment.body)]),
]), zone);
void nextTick(() => {
  resizeAnchorZoneToContent(zone);
});
```

### Existing dual-registration keybinding (verified, current behavior — THREAD-09's exact template)
```typescript
// Source: src/web/monaco/diff-adapter.ts:199-210 and src/web/App.vue:963-970 (verified, current repo state)
// Layer 1 — Monaco addAction, fires when focus is inside either editor:
this.originalEditor.addAction({
  id: `${RENAME_MAP.kindPrefix}.next-change-base`,
  label: 'Next change',
  keybindings: [monaco.KeyCode.F7],
  run: () => this.navigate.nextChange(),
});
// Layer 2 — App.vue global document listener, fires when focus is outside the editor:
// (inside handleKeydown(event: KeyboardEvent))
} else if (event.key === 'F7') {
  event.preventDefault();
  event.shiftKey ? previousChange() : nextChange();
}
```

### Monaco overlay-widget scroll-synced positioning (NEW pattern for this phase; API surface verified against installed types, usage shape cited from community precedent)
```typescript
// Source: API shapes verified in node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts
// (IViewZone.onDomNodeTop line 5500; IOverlayWidgetPositionCoordinates lines 5655-5664;
//  IOverlayWidget lines 5684-5710; layoutOverlayWidget line 6344)
// Usage shape cited from github.com/microsoft/monaco-editor/discussions/4477
let widgetTop = 0;
const spacerZone: monaco.editor.IViewZone = {
  afterLineNumber: anchor.line,
  domNode: document.createElement('div'),
  heightInPx: currentHeightPx,
  suppressMouseDown: true,
  onDomNodeTop: (top) => {
    widgetTop = top;
    editor.layoutOverlayWidget(overlayWidget);
  },
};
const overlayWidget: monaco.editor.IOverlayWidget = {
  getId: () => `thread-${commentId}`,
  getDomNode: () => threadMountNode,
  getPosition: () => ({ preference: { top: widgetTop, left: gutterOffsetPx } }),
};
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The overlay-widget + `onDomNodeTop` approach will avoid the content-widget "blank when half-scrolled" bug in practice, for this project's specific hideUnchangedRegions + side-by-side diff configuration | Pattern 2, Pitfall 2 | If wrong, the spike will simply surface the same disappearing-widget symptom under the overlay approach too — this is exactly why the spike must empirically test both techniques rather than commit to one from this research alone; the research's job here is to narrow the starting hypothesis, not replace the spike |
| A2 | `monaco-editor@0.55.1`'s `onDomNodeTop`/overlay-widget pixel-coordinate behavior matches the typedoc description with no version-specific regressions | Pattern 2, Code Examples | Low — confirmed present in the exact installed `node_modules` type declarations (not just training-data recall of a possibly-different version), but behavior (not just type signature) is only confirmed by the spike itself |
| A3 | Monaco's `addAction` keybinding handling calls `preventDefault`/`stopPropagation` before the keydown event reaches `document`, which is why F7/Alt-arrow dual-registration doesn't double-fire today | Pattern 4 | If this mechanism differs for `KeyMod.Alt | KeyCode.F9` specifically (e.g. if F9 has a different OS/browser-chrome interaction than F7 does), THREAD-09's shortcut could double-fire or silently not fire in one focus context — flagged explicitly as a cross-platform verification gap in PITFALLS.md Critical Pitfall 7, independent of this assumption |

## Open Questions

1. **Does `allowEditorOverflow` need to be `true` or `false` for the overlay widget, given threads can exceed the visible editor width/height when expanded?**
   - What we know: `IOverlayWidget.allowEditorOverflow` exists (line 5692) and lets the widget render outside the editor's own view DOM node bounds.
   - What's unclear: Whether this project's CSP (`src/server/security.ts`, flagged in PITFALLS.md's CSP/popover Integration Gotcha) or the fixed 720px max-width thread frame (per UI-SPEC) ever actually needs overflow — likely not, since threads are capped at 720px and the diff pane is wider, but should be confirmed empirically in the spike rather than assumed.
   - Recommendation: Default to `false` (matches the fixed-width thread frame) and only flip to `true` if the spike surfaces clipping.

2. **What exact code-column indent values (56px side-by-side / 96px inline) does the real rendered `glyphMargin` + line-number column produce?**
   - What we know: UI-SPEC explicitly defers this to "Plan 01 go/no-go spike against app's actual rendered `glyphMargin` + line-number column widths (`CODE_FONT_SIZE`/`lineNumbersMinChars` in `diff-adapter.ts`)."
   - What's unclear: The exact pixel values at each code density (`wide`/`default`/`compact`, `CODE_DENSITIES` constant, diff-adapter.ts:91-101).
   - Recommendation: Measure via `editor.getLayoutInfo().decorationsLeft`/`.contentLeft` in the spike itself; UI-SPEC already defers this, so this research does not need to resolve it, only confirm the measurement API exists (`getLayoutInfo()` is a standard, long-stable Monaco API — [ASSUMED] not re-verified against 0.55.1 type defs in this session, low risk since it's unrelated to the content-widget risk area).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All tooling | ✓ | v24.15.0 [VERIFIED] | — |
| npm | Package management | ✓ | 11.12.1 [VERIFIED] | — |
| `monaco-editor` (installed) | Core adapter work | ✓ | 0.55.1 [VERIFIED: node_modules] | — |
| `@playwright/test` | Spike verification harness | ✓ | 1.61.1 [VERIFIED: package.json] | — |
| Chrome DevTools Protocol session via Playwright | 30-thread input-lag measurement | ✓ | Precedent already exists: `tests/e2e/responsive-session.spec.ts:1111` uses `page.context().newCDPSession(page)` for vision-deficiency emulation — same API usable for `Tracing.start`/timing | No fallback needed; if CDP tracing proves awkward, a simpler keystroke-timestamp-delta (`performance.now()` bracketing in `page.evaluate`, same technique as `tests/performance/production-picker.mjs:279-304`) is an already-proven fallback in this repo for a different (CLI startup) measurement, adaptable to browser input lag |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — both the primary (CDP tracing) and fallback (keystroke-timestamp-delta) measurement techniques already have precedent in this repository, confirmed by direct grep of `tests/e2e/` and `tests/performance/`. **No existing harness measures browser-side input-to-paint latency specifically** — this is a genuine Wave 0 gap (see below), not a missing dependency.

### Wave 0 gap for the spike plan
- No existing test file measures Monaco editor input-to-paint/interaction latency. Plan 01 must create a new, throwaway measurement script (likely `tests/performance/thread-input-lag.mjs` or an ad-hoc Playwright spec under `tests/e2e/`, per the user's/planner's discretion) that either (a) opens a CDP tracing session and measures the delta between an input event and the next paint/layout event, or (b) brackets a `page.keyboard.type()` call with `performance.now()` reads taken via `page.evaluate` before dispatch and after the DOM shows the typed character, following the exact timestamp-delta shape already proven in `tests/performance/production-picker.mjs:278-304` for CLI startup timing.

## Security Domain

`security_enforcement` is `true` (ASVS level 1) per `.planning/config.json`. This phase is almost entirely a client-rendering change with zero new network surface, zero new persistence authority, and zero schema change, so most ASVS categories are not applicable — documented explicitly rather than silently skipped.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new auth surface; server stays `127.0.0.1`-only, unchanged |
| V3 Session Management | No | No new session concept; UI-only collapse/Undo state is browser-local, not server session state |
| V4 Access Control | No | No new routes; existing `editComment`/`deleteComment`/`resolveComment`/`reopenComment` mutation routes already enforce whatever access control they enforce today, unchanged by this phase |
| V5 Input Validation | Yes (unchanged) | `DraftMutationRequestSchema` (Zod, `src/contracts/api.ts:47-70`) already validates every mutation this phase's UI will send; no new fields, no new schema branches needed |
| V6 Cryptography | No | No cryptographic operations; `src/domain/anchor.ts`'s hashing is explicitly read-only/untouched this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| New UI preference (collapse state, scroll position) becoming a second, un-reviewed persistence authority | Tampering (data integrity split-brain) | Per PITFALLS.md Security Mistakes table: keep UI-only preferences in browser-local, session-scoped in-memory state, clearly separated from the server-returned canonical draft; never let a UI-preference code path share a route/schema with comment/summary/export data. This phase's collapse-state and Undo-timer state are explicitly in-memory-only per CONTEXT.md, satisfying this already. |
| Delete-with-Undo race: `pagehide`/`visibilitychange` flush firing twice, or not firing before tab close, leaving a server-side delete un-sent or double-sent | Repudiation / Tampering (inconsistent state between client-optimistic-hide and server-authoritative draft) | Register the flush exactly once (one `pagehide` + one `visibilitychange` listener pair, idempotent flush function that no-ops if the delete already committed or was undone) — mirrors the existing single-live-region-owner discipline (PITFALLS.md Pitfall 5) applied to a different kind of "exactly one owner" invariant |
| Overlay widget DOM rendering comment body text without escaping (XSS via comment content) | Tampering / Elevation of Privilege (stored XSS via own review comments) | Continue using Vue's `h()`/template interpolation (auto-escaping) for comment body text, exactly as today's `inline-accepted-comment` render call already does (`h('p', comment.body)` — Vue text interpolation, not `v-html` or `innerHTML`) — do not introduce any raw HTML insertion when building the new `CommentThread.vue` |

## Sources

### Primary (HIGH confidence)
- `src/web/monaco/diff-adapter.ts` (this repo, read in full) — current single-zone-pair adapter implementation, both `PublicMonacoDiffAdapter` and `PublicMonacoSinglePaneAdapter` classes
- `src/web/model/draft-reconciliation.ts`, `src/web/model/workspace-state.ts`, `src/web/model/comment-groups.ts` (this repo, read in full/relevant parts)
- `src/domain/anchor.ts` (this repo) — golden-hash contract, confirmed read-only scope
- `src/contracts/draft.ts`, `src/contracts/api.ts` (this repo) — confirmed zero schema changes needed
- `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts` (installed package, lines 5441-5713, 6331-6348) — `IViewZone`, `IContentWidget`, `IOverlayWidget`, `IOverlayWidgetPositionCoordinates`, `layoutContentWidget`/`layoutOverlayWidget` — verified against the exact installed version (0.55.1), not a newer/older version's docs
- `.planning/research/PITFALLS.md` (this repo) — Critical Pitfalls 1-4, Pitfall 7, Pitfall-to-Phase Mapping, Integration Gotchas, Security Mistakes tables
- `.planning/phases/23-inline-comment-threads/23-CONTEXT.md`, `23-UI-SPEC.md` (this repo) — locked decisions
- `.kimi-code/skills/sketch-findings-loopnote/references/comments-and-export.md` (this repo) — design source, including the exact pointer-events warning quoted in PITFALLS.md

### Secondary (MEDIUM confidence)
- [CITED: github.com/microsoft/monaco-editor/discussions/4477] "Best way to render html content inside the editor?" — reproduced content-widget-blank-on-partial-scroll bug, and the overlay-widget + `onDomNodeTop` workaround with its own reported scroll-jank tradeoff
- [CITED: github.com/microsoft/monaco-editor/issues/2395] "Right click in view zone or content/overlay widget has inconsistent behavior" — corroborates the pointer-event-reliability concern independently of this project's own design research
- [CITED: microsoft.github.io/monaco-editor/typedoc] `IContentWidgetPosition`, `IOverlayWidget` API reference pages — confirms the typed API shape matches the installed package's own `.d.ts` (cross-checked, not relied on alone)

### Tertiary (LOW confidence)
- None — every claim above was either verified against this repo's own source/installed types, or cited to a specific external document with a URL.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every version read directly from `package.json`/`node_modules`
- Architecture: HIGH — every pattern either already exists verbatim in this repo (Patterns 1, 3, 4) or is built from installed-type-verified Monaco APIs plus cited external precedent (Pattern 2)
- Pitfalls: HIGH — Critical Pitfalls 1-4 are this project's own prior research, deepened here with concrete verification steps and (for Pitfall 2) real external corroboration; Pitfall 5 is newly identified from direct code reading of the single-pane adapter

**Research date:** 2026-11-05
**Valid until:** 30 days (stable domain — Monaco 0.55.1 is pinned, not auto-upgrading; re-verify if `monaco-editor` version in `package.json` changes before Plan 01 executes)
