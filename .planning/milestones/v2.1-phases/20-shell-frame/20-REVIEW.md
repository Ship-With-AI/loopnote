---
phase: 20-shell-frame
reviewed: 2026-11-05T00:26:51Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - scripts/css-token-contract.mjs
  - src/web/App.vue
  - src/web/components/DiffWorkspace.vue
  - src/web/components/ui/UiIcon.vue
  - src/web/components/workbench/BottomPanel.vue
  - src/web/components/workbench/Breadcrumbs.vue
  - src/web/components/workbench/EditorTitle.vue
  - src/web/components/workbench/StatusBar.vue
  - src/web/components/workbench/TitleBar.vue
  - src/web/components/workbench/WorkbenchShell.vue
  - src/web/composables/useSash.ts
  - src/web/monaco/diff-adapter.ts
  - src/web/prototypes/MonacoStabilityPrototype.vue
  - src/web/styles.css
  - tests/e2e/agent-ready-export-safety.spec.ts
  - tests/e2e/agent-ready-export.spec.ts
  - tests/e2e/anchored-review.spec.ts
  - tests/e2e/complete-review-draft.spec.ts
  - tests/e2e/pinned-session.spec.ts
  - tests/e2e/responsive-session.spec.ts
  - tests/e2e/review-notes-dialog.spec.ts
  - tests/e2e/standalone-review.spec.ts
  - tests/e2e/uncommitted-review.spec.ts
  - tests/e2e/workbench-shell-smoke.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/integration/export-receipt-ui.spec.ts
  - tests/integration/selector-drift-ui.spec.ts
  - tests/integration/support-dialog.spec.ts
  - tests/unit/use-sash.test.ts
findings:
  critical: 0
  warning: 1
  info: 9
  total: 10
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-11-05T00:26:51Z
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

Third and final adversarial pass over the same 29-file scope, read against the current working tree after the second round of fix commits (`53e4308`..`83a42db`), with concentrated scrutiny on the six files those commits touched.

**All six findings from the previous pass are genuinely resolved, and every fix is itself correct.** Each was re-derived from the current file bytes rather than from the commit messages:

- **CR-01 (`53e4308`) — resolved.** `assertExportEmphasized` is gone; `assertExportItem(page, supported)` branches to `toHaveCount(0)` for the unsupported case, matching `StatusBar.vue:46-54`'s `v-if="exportSupported"`. All four call sites (`:225` true, `:257` false, `:293` true, `:337` true) agree with `App.vue:1477`'s `exportSupported = !isUncommittedSession || isStandaloneSession` for the launch shape each test spawns; `grep` finds zero surviving `assertExportEmphasized` references, and `workbench-shell-smoke.spec.ts:157` is the only status-bar Export locator in the whole suite, so no other spec was invalidated.
- **WR-01 (`4444634`) — resolved.** `teardown()` now snapshots `activeTarget`/`activePointerId`, clears both plus `isDragging` *first*, removes all three listeners, and only then calls `releasePointerCapture` inside a `try`/`catch`. The spec-mandated `NotFoundError` on the `pointercancel` path can therefore no longer strand listeners or leave `isDragging` stuck true.
- **WR-02 (`88fc456`) — resolved, and the recorded UX decision is intact.** `event.preventDefault()` still runs unconditionally for both chords, which is exactly what `20-CONTEXT.md:36` ("⌘B / ⌘J … always preventDefault, including inside the editor") and threat `T-20-10` / `AR-20-04` pinned; only the *toggle* is gated. The gate condition is `shellModalOpen`, byte-identical to the expression `App.vue:1301` already feeds to `:inert` on `.workbench-shell`, and `ShellDialog` has exactly two members (`App.vue:79`), so in the common non-modal case `shellDialog.value === null` and ⌘B/⌘J behave precisely as before — including from inside Monaco, since the branch still precedes the `.inline-comment-composer` and generic input guards (`STATE.md:243`'s requirement).
- **WR-03 (`b56221b`) — resolved, and it does not reintroduce the fixed-row overflow below 761px.** At ≤760px the scoped `.identity-disclosure` arms no longer exist, so `styles.css:2359-2363`'s 44px floor owns both controls again, *and* the new `.workbench-shell { --titlebar-height: 44px; --statusbar-height: 44px }` arm (`styles.css:2365-2368`) grows the rows to match — a 44px control in a 44px row, no overflow. The override is contained: `grep` confirms those two tokens have exactly three consumers (`WorkbenchShell.vue:112`, `TitleBar.vue:200`, `StatusBar.vue:73`), all inside `.workbench-shell`, and `isNarrow` uses the same `(max-width: 760px)` query (`App.vue:1208`). At ≥761px the `@media (min-width: 761px)` arms restore the shrink-into-row geometry at specificity (0,3,0), outranking `styles.css:487`'s unconditional `min-width/min-height: 40px`. Neither gate breaks the CSS contracts: `assertCanonicalTokenSet`/`assertTokenRoot` only inspect the single context-free `:root` rule, and `verify-semantic-css.mjs`'s custom-property paint check (`isPaintBearingProperty` matches any `--*`) finds no colour syntax in `44px`.
- **WR-04 (`ea425a5`) — resolved.** All three narrow-viewport side-bar assertions (`anchored-review.spec.ts:357-358`, `responsive-session.spec.ts:1082-1083`, `anchored-workspace.spec.ts:926-927`) now prove both halves of the claim. The positive half is satisfiable because `ChangedFilesDialog.vue:26` passes `:keep-mounted="true"` to `ModalDialog`, so `#changed-files-dialog-tree` exists while the dialog is closed and the `narrow ? '#changed-files-dialog-tree' : '#changed-files'` Teleport target resolves.
- **WR-05 (`83a42db`) — resolved.** The arithmetic was traced by hand: `dragBy('vertical', 60)` sets `startCoordinate = clientX = 400`, `startValue = 300`, then `delta = +60` with `signedDelta = +60` → 360; `dragBy('horizontal', 60)` reads `clientY`, `signedDelta = -60` → 240; the `pointercancel` case drains the listener map to 0 and clears `isDragging`. Both sign branches of `useSash.ts:60` and the whole cancel path are now covered.

**One Warning remains, and it is new.** `WorkbenchShell.vue` enforces two different side-bar ceilings: `useSash`'s static `max: 520` and the layout's `min(var(--sidebar-width-max), calc(100vw - 480px))`. Between 761px and 999px viewport widths the second ceiling is the binding one, so dragging past it decouples the sash from the pointer, makes `aria-valuenow` report a width the side bar does not have (contradicting `20-UI-SPEC.md:185`'s "reflecting live px width"), and persists an unachievable value. Nothing else rises above Info: the remaining nine items are the seven unfixed Info findings from the previous pass (all re-verified against current bytes) plus two new ones — a fractional-viewport-width hole between the two `760px`/`761px` media queries WR-03 now depends on, and the `20-UI-SPEC.md` geometry table's silent divergence from the new narrow-viewport row heights.

## Warnings

### WR-01: Clamp the side-bar sash to the same ceiling the layout enforces

**File:** `src/web/components/workbench/WorkbenchShell.vue:82`
**Issue:** The drag clamp and the layout clamp disagree. `useSash` is constructed with a static `max: 520` (line 82), but the rendered width is `min(${sidebarWidth}px, var(--sidebar-width-max), calc(100vw - 480px))` — applied to the grid track at lines 101-105 and to the element's `max-width` at line 131. Below a 1000px viewport, `100vw - 480px` is smaller than 520, so it becomes the binding ceiling: at a 900px viewport it is 420px. Dragging the vertical sash from 264px toward 520px therefore stops moving the side bar — and the sash itself, whose `left` is `calc(${clampedSidebarWidth} - 2px)` (line 18) — at 418px, while `sidebarWidth` keeps climbing to 520. Three consequences follow. The sash stops tracking the cursor for the last 100px of the drag, the identical symptom CR-01 was fixed for in `0ce3a74`. `:aria-valuenow="sidebarWidth"` (line 13) announces 520 for a 420px-wide side bar, contradicting `20-UI-SPEC.md:185`, which specifies `aria-valuenow` as "reflecting live px width". And `onPointerup` commits 520 through `commitSidebarWidth` (`App.vue:382-385`), which writes it into `panelState.sidebarWidth` and persists it — `clampSidebarWidth` (`panel-state.ts:30`) passes 520 unchanged, so every later session restores a persisted width the layout silently discards. The affected band (761-999px) is live: below 761px `isNarrow` removes the sash entirely (`v-if="sidebarVisible && !isNarrow"`), and `responsive-session.spec.ts` drives 768px directly. The horizontal panel sash has the mirror-image gap — `max: 520` (line 91) with *no* viewport term at all, so on a 560px-tall window (a height `responsive-session.spec.ts` uses) a full-range drag makes the `flex: none` panel overrun the `1fr` body row, and since no ancestor in `.workbench-shell__body` / `.workbench-shell__main` sets `overflow`, the panel's bottom edge disappears behind the later-painting `.workbench-shell__statusbar`.
**Fix:** Derive one ceiling and feed it to both the sash and the layout. A getter satisfies `readonly max: number` structurally and is re-read by `onPointermove` on every move, so `useSash.ts` needs no change:
```ts
const SIDEBAR_WIDTH_MIN = 170;
const SIDEBAR_WIDTH_MAX = 520;
const EDITOR_WIDTH_FLOOR = 480;

const sidebarCeiling = shallowRef(SIDEBAR_WIDTH_MAX);
function syncSidebarCeiling(): void {
  sidebarCeiling.value = Math.max(
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, window.innerWidth - EDITOR_WIDTH_FLOOR),
  );
  if (sidebarWidth.value > sidebarCeiling.value) sidebarWidth.value = sidebarCeiling.value;
}
onMounted(() => {
  syncSidebarCeiling();
  window.addEventListener('resize', syncSidebarCeiling);
});
onUnmounted(() => window.removeEventListener('resize', syncSidebarCeiling));

const sidebarSash = useSash({
  axis: 'vertical',
  min: SIDEBAR_WIDTH_MIN,
  get max() { return sidebarCeiling.value; },
  default: 264,
  value: sidebarWidth,
  onCommit: (value) => emit('update:sidebarWidth', value),
});

// Single ceiling: the sash already clamped the value, so the layout must not re-clamp.
const clampedSidebarWidth = computed(() => `${Math.min(sidebarWidth.value, sidebarCeiling.value)}px`);
```
Then bind `:aria-valuemax="sidebarCeiling"` on the vertical sash (line 15) and drop the `calc(100vw - 480px)` term from `.workbench-shell__sidebar`'s `max-width` (line 131) so the element cannot contradict the value. Apply the same shape to the panel sash with `window.innerHeight` minus the two chrome rows.

## Info

### IN-01: Delete the shell CSS orphaned by the workbench migration

**File:** `src/web/styles.css:192-193, 252-254, 911, 1396-1441, 2255-2262, 2385-2388, 2514-2516, 2571`
**Issue:** Re-verified by repo-wide `grep` over `src/**/*.vue`, `src/**/*.ts` and `tests/`: `.review-shell` (1396), `.review-shell--files-collapsed` (1407), `.changed-files-sidebar` (declared twice, 1411 and 1416, plus a descendant rule at 1421), `.review-main` (1434) and `.session-shell__content` (252, `display: contents`, whose wrapper element was deleted in `c5a749e`) have zero consumers. Their shared arms at 192-193 and 911 and their media-query/forced-colors arms at 2255-2262, 2385-2388, 2514-2516 and 2571 persist too. `--sidebar-width` (131) duplicates `--sidebar-width-default` (132) and its only `var()` reference anywhere in `src/` is `styles.css:1404`, inside the dead `.review-shell` rule — which is the sole reason it still satisfies `assertDeclaredTokensConsumed`.
**Fix:** Delete the five dead rule sets and their media-query/forced-colors arms, then drop `--sidebar-width` from `styles.css:131` *and* from `CANONICAL_TOKENS` in `scripts/css-token-contract.mjs:15` — `assertCanonicalTokenSet` asserts set equality in both directions, so removing only one side fails the contract.

### IN-02: Replace BottomPanel's leftover ReviewNotesDialog class hooks

**File:** `src/web/components/workbench/BottomPanel.vue:135, 161`
**Issue:** `review-panel__failure` (135) and `review-notes-dialog__counts` (161) still have no matching rule anywhere: `styles.css` defines only `.review-panel__conflict` (1322 and 1331), and the component's scoped block styles only `.bottom-panel`, `.bottom-panel__header` and `.bottom-panel__label`. The two `ReviewStateBadge` comment-count badges therefore render as bare inline siblings with no flex container, gap or inline padding.
**Fix:** Drop `review-panel__failure` — the element already carries `inline-notice inline-notice--error` — and swap `review-notes-dialog__counts` for a panel-local class styled next to `.bottom-panel__header`, e.g. `.bottom-panel__counts { display: flex; flex: none; gap: var(--space-2); padding-inline: var(--space-2); }`.

### IN-03: Delete the unused shell prop and exposed member

**File:** `src/web/components/workbench/TitleBar.vue:11`, `src/web/components/workbench/EditorTitle.vue:89, 97`
**Issue:** `TitleBar`'s `readonly inert?: boolean` prop is read by neither its script nor its template, and `App.vue:1306-1317` does not pass it — only `WorkbenchShell` receives `:inert` (`App.vue:1301`), where it falls through to the root `.workbench-shell` element as `support-dialog.spec.ts:111` and `responsive-session.spec.ts` both assert. Because `inert` is a *declared* prop on `TitleBar`, passing it there would be swallowed instead of applied, so the declaration is actively misleading. `EditorTitle.focusFilesToggle` (89) is defined and exposed (97) but `grep` finds no caller in `src/` or `tests/`.
**Fix:** Delete the `inert` prop declaration and the `focusFilesToggle` function plus its entry in `defineExpose`.

### IN-04: Derive the sash bounds from one source

**File:** `src/web/components/workbench/WorkbenchShell.vue:14-15, 30-31, 81-82, 90-91`
**Issue:** `170`/`520` and `120`/`520` each appear three times — as hardcoded `aria-valuemin`/`aria-valuemax` attributes (14-15, 30-31), as `useSash` `min`/`max` options (81-82, 90-91), and as the module-private `SIDEBAR_WIDTH_MIN`/`SIDEBAR_WIDTH_MAX`/`PANEL_HEIGHT_MIN`/`PANEL_HEIGHT_MAX` constants in `src/web/model/panel-state.ts:6-11` that `clampSidebarWidth`/`clampPanelHeight` enforce against persisted values — on top of the `--sidebar-width-min/max` and `--panel-height-min/max` tokens at `styles.css:133-137`. A future bound change silently desynchronises the ARIA range the sash announces from the clamp actually enforced. WR-01 above makes this concrete rather than hypothetical.
**Fix:** Export the bounds from `panel-state.ts` (e.g. `SIDEBAR_WIDTH_BOUNDS`/`PANEL_HEIGHT_BOUNDS`), import them in `WorkbenchShell.vue`, and bind both the `useSash` options and the `:aria-valuemin`/`:aria-valuemax` attributes from them, leaving the CSS tokens as the single presentational mirror.

### IN-05: Reconcile the sash's separator semantics with its keyboard reachability

**File:** `src/web/components/workbench/WorkbenchShell.vue:10-16, 26-32`
**Issue:** Both sashes expose `role="separator"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` while setting `tabindex="-1"`. ARIA treats a separator carrying a value as a focusable widget; as written, assistive technology announces an adjustable range on a control that can neither be focused nor adjusted, and there is no arrow-key resize path at all. `20-UI-SPEC.md:189` records the missing keyboard resize as a known non-blocking limitation, but the value attributes still advertise a widget that does not exist.
**Fix:** Either make the separators real widgets (`tabindex="0"` plus a `keydown` handler stepping the value through `clampAxisValue` and committing via `onCommit`), or drop `aria-valuenow`/`aria-valuemin`/`aria-valuemax` so they are announced as plain non-interactive separators.

### IN-06: Pluralise the status-bar comment count

**File:** `src/web/components/workbench/StatusBar.vue:44`
**Issue:** The template renders `{{ openCommentCount }} open comments`, producing "1 open comments". `20-UI-REVIEW.md:28,37` records this as a direct violation of the phase's own Copywriting Contract entry (`Status-bar comment count | "{N} open comment{s}"`), and the codebase already has the idiom at `App.vue:1369` and `RefreshSummaryPanel.vue:67,70`.
**Fix:** `{{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}`.

### IN-07: Remove the non-existent `inventory` prop from the BottomPanel harnesses

**File:** `tests/e2e/review-notes-dialog.spec.ts:19`, `tests/e2e/agent-ready-export-safety.spec.ts:60`
**Issue:** Both virtual harnesses pass `inventory: []` to `BottomPanel`, which declares no such prop (`BottomPanel.vue:20-47`). Vue forwards it to the root `<section>` as a stringified fallthrough attribute, leaving a dead carry-over from the superseded `ReviewNotesDialog` interface in two harness contracts.
**Fix:** Delete the `inventory: []` entry from both harness prop objects.

### IN-08: Close the fractional-width hole between the two chrome-row media queries

**File:** `src/web/components/workbench/StatusBar.vue:105`, `src/web/components/workbench/TitleBar.vue:230`
**Issue:** WR-03's fix splits responsibility across `@media (max-width: 760px)` (which supplies both the 44px floor and the 44px rows) and `@media (min-width: 761px)` (which supplies the shrink-into-row geometry). Viewport width is not required to be an integer, so at e.g. 760.5px — reachable via non-100% browser zoom or fractional OS display scaling — neither query matches: `styles.css:487`'s unconditional `.identity-disclosure { min-width: 40px; min-height: 40px }` applies while `--statusbar-height` stays 22px and `--titlebar-height` stays 32px, so the Support and Refresh buttons overflow their rows. `styles.css:2245` already uses the same `761px` idiom, but there the band only adds `flex-wrap`, so the gap is harmless; here the `761px` band carries the only rule preventing overflow.
**Fix:** Make the upper band the exact complement of the lower one in both components: `@media not all and (max-width: 760px) { … }`.

### IN-09: Record the narrow-viewport chrome row heights in the UI spec

**File:** `src/web/styles.css:2365-2368`
**Issue:** `20-UI-SPEC.md:83,87` declares `--titlebar-height` as 32px and `--statusbar-height` as 22px with no responsive exception, and lines 36/44 of the same contract draw them as fixed 32px/22px rows. WR-03 now overrides both to 44px below 761px, which is the right call (line 337's `<760px` row is marked "unchanged", and the pre-phase narrow behaviour did apply the 44px touch-target floor), but the spec's geometry table is the document a future phase will read when retuning these tokens, and it no longer describes the implementation.
**Fix:** Add the `<=760px` 44px values to the Workbench Geometry Tokens table in `20-UI-SPEC.md`, citing the `styles.css:2359-2363` touch-target floor as the reason, so the two cannot drift further apart.

---

_Reviewed: 2026-11-05T00:26:51Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
