---
phase: 21-changed-files-tree
reviewed: 2026-11-05T12:15:13Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - scripts/verify-semantic-css.mjs
  - src/contracts/api.ts
  - src/server/capabilities.ts
  - src/server/patch-snapshot.ts
  - src/web/App.vue
  - src/web/components/ChangedFilesDialog.vue
  - src/web/components/DirectoryRow.vue
  - src/web/components/FileRow.vue
  - src/web/components/FileTree.vue
  - src/web/components/PathDisplay.vue
  - src/web/components/StatusBadge.vue
  - src/web/components/ui/PathText.vue
  - src/web/components/ui/UiIcon.vue
  - src/web/components/ViewOptionsMenu.vue
  - src/web/components/workbench/EditorTitle.vue
  - src/web/model/file-tree.ts
  - src/web/model/panel-state.ts
  - src/web/styles.css
  - tests/e2e/file-tree.spec.ts
  - tests/e2e/responsive-session.spec.ts
  - tests/e2e/workbench-shell-smoke.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/unit/file-tree.test.ts
  - tests/unit/panel-state.test.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-11-05T12:15:13Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Final re-review (iteration 3) of the full phase-21 diff (`9fda6e1..HEAD`) across the 23 original files plus `src/server/patch-snapshot.ts`, after commits `39f9c66` (WR-01-new), `e1936eb` (WR-02-new) and `7d9efb6` (WR-03-new). Each file was read in full again, plus the called-into code the fixes depend on but that is not itself in the diff: `src/web/components/ui/ModalDialog.vue`, `src/web/components/workbench/WorkbenchShell.vue`, `src/contracts/comparison.ts`, and the base revision of `FileTree.vue`/`styles.css` at `9fda6e1` for before/after layout comparison.

**All three second-round fixes hold up and none of them regressed anything.** Two findings remain, both in the CSS the third fix touches, and both are new to this pass rather than regressions caused by it: one is a grid-placement defect introduced earlier in the phase that the `overflow` removal merely stopped hiding, and one is the un-clipping job being incomplete one DOM level further out.

- **WR-01-new — holds, and it was the last omission.** `src/server/patch-snapshot.ts:407` now emits `code: file.status.code` in both the `similarity === null` and `similarity !== null` branches, byte-identical in shape to the six `capabilities.ts` producers (`:433-434`, `:867`, `:1029`, `:1290`, `:1385`, `:1631`). `ChangedFileStatusSchema` declares `code` as required and non-nullable (`src/contracts/comparison.ts:86`, `z.string().regex(/^[A-Z]$/)`), so `file.status.code` can never be `undefined` at any of the seven call sites. I enumerated every producer of an API-shaped status object across all of `src/` by searching for both `status: {`/`kind: file.status` and `fileId: file.id` (the two session/metadata response shapes): exactly seven exist, all in `src/server/capabilities.ts` and `src/server/patch-snapshot.ts`, and **all seven now forward `code`**. No other producer omits it, so the `.optional()` on `ApiFileStatusSchema.code` (`src/contracts/api.ts:316`) no longer lets a silent gap through, and the consumer-side `?? ''` fallbacks (`FileRow.vue:166`, `EditorTitle.vue:103,107`) are now unreachable for every real server response.
- **WR-02-new — holds, and it is correctly scoped to the two handlers.** `event.stopPropagation()` is present at `FileTree.vue:304` (filter `Escape`) and `ViewOptionsMenu.vue:68` (menu `Escape`). `ModalDialog`'s own `Escape`-to-close is untouched everywhere else: `containFocus` is a bubble-phase listener on `<section class="modal-dialog">` (`ui/ModalDialog.vue:89-96`), so it still fires for `Escape` pressed on the close button, the `<h2>`, the panel itself, and on tree/list rows — `FileTree.handleKeydown` returns early for `Escape` (it is not in `supportedKeys`, `:345-355`) and `handleTreeScopedKeydown` only claims ⌥⌘F (`:334-341`), and neither calls `stopPropagation`. That is exactly the path two existing narrow-layout assertions exercise (`responsive-session.spec.ts:1086-1096` and `:1330-1338`: focus lands on the initial tabbable row via the new `initial-focus-selector`, `Escape` closes the dialog and refocuses the trigger), so they still hold. `App.vue`'s document-level handler loses nothing either: the filter input already hit the `HTMLInputElement` early return (`App.vue:984`), and for the menu's `role="menuitemradio"`/`menuitemcheckbox` `<div>`s no branch matches an unmodified `Escape` (the remaining branches require Alt+Arrow, F7, or Alt+Shift+R). The three wide-layout `Escape` assertions (`workbench-shell-smoke.spec.ts:570-573`, `:592-594`, `file-tree.spec.ts:700-702`) are unaffected because there is no ancestor dialog in that layout.
- **WR-03-new — the removal itself is correct and introduces no new overflow of its own.** `overflow: hidden` is gone from `.file-tree-pane` (`styles.css:923-933`). The scroller is self-sufficient and never depended on the parent clip: `.file-tree-pane__scroller` declares `min-height: 0` and `overflow-y: auto` (`:1328-1335`), which makes it a scroll container — so its automatic minimum size is zero, whichever track it lands on is capped by the pane's available height during grid track maximisation, and the file list always scrolls internally. Its unspecified `overflow-x` computes to `auto` (not `visible`) because the other axis is not `visible`, so long paths are still handled by the scroller rather than by any ancestor. The pane's other children cannot overflow the 240-440px sidebar horizontally either: `.filter`'s input is `flex: 1 1 auto; min-width: 0` against `flex: 0 0 auto` siblings totalling ~98px (the `.n` counter, the 22px `.file-tree-pane__clear`, two 8px gaps) inside the 204px content box at the 240px minimum; `.tree-footer` has no `nowrap` and wraps; and `.file-tree-pane__label` keeps its own `overflow: hidden` + `text-overflow: ellipsis`.

What the un-clipping *did* expose is a separate, earlier defect: with the filter row hidden (its default state) the pane's four declared grid tracks receive only three in-flow children, so `.file-tree-pane__scroller` and `.tree-footer` both land one track too early. That mis-placement was already present in iterations 1 and 2 — it is in-flow layout, so `overflow: hidden` never fixed it, only concealed its overflow half — and I missed it both times. It is reported below as WR-01. WR-02 records that the popover is still clipped in the narrow Files dialog, because `.changed-files-dialog__results` (`max-height: 50dvh; overflow: auto`, `ChangedFilesDialog.vue:75-78`) and `.modal-dialog` (`overflow-y: auto`, `styles.css:741`) are two further clipping ancestors that the `.file-tree-pane` removal does not reach.

Neither finding is caught by the suite: the only view-options assertions run in the default wide layout (`file-tree.spec.ts:640-717` and `workbench-shell-smoke.spec.ts:576-594`, neither calls `setViewportSize`), the only footer assertions check text (`workbench-shell-smoke.spec.ts:441`, `:462`) not geometry, and `assertNoPageOverflow` compares `scrollWidth` against `clientWidth` only (`responsive-session.spec.ts:429-435`), so it is blind to vertical overflow.

Re-verified correct on this pass (no findings): the three new emits remain routed end-to-end through `FileTree` → `ChangedFilesDialog` (`:57-61`) → `App.vue` (`:1534-1537`) → `panelState.*` + `persist()`, with one `FileTree` instance as the only consumer; `closeFilterReturnFocusToTree` cannot lose focus to `<body>`, because it resets the query before reading `tabbableRowId` (`FileTree.vue:252-264`) and `FileTree` is only mounted when `files.length > 0` (`ChangedFilesDialog.vue:51-52`), so a visible row always exists; `highlightMatches` still renders exclusively through `v-for` plus text interpolation with no `v-html` anywhere in the patch; `STATUS_PRIORITY_ORDER` and `BULLET_TONE_BY_STATUS_KIND` are both total over all seven `ChangedFileStatusKind` members; `parsePanelState` defaults all six fields independently and never throws; and `Object.hasOwn` in `FileRow.vue:97` keeps the extension lookup off the prototype chain.

## Narrative Findings (AI reviewer)

### Warnings

#### WR-01: Place the tree scroller and footer on explicit grid rows

**File:** `src/web/styles.css:929-930` (with `src/web/components/FileTree.vue:445` and `:545`)

**Issue:** This patch rewrote `.file-tree-pane` from the two-track `grid-template-rows: auto minmax(0, 1fr)` it had at `9fda6e1` to the four-track `auto auto minmax(0, 1fr) auto`, and added two new children to match: the filter row, which was moved out of `.file-tree-pane__top` into a sibling `<div class="filter" v-show="filterOpen">` (`FileTree.vue:445`), and `<p class="tree-footer">` (`:545`). Placement is left entirely to auto-placement — no child declares `grid-row` — but `filterOpen` starts `false` (`FileTree.vue:50`) and `v-show` renders `display: none`, which generates no box. So in the pane's default state only three items are placed, into tracks 1-3: the header takes `auto`, **the scroller takes the second `auto` instead of `minmax(0, 1fr)`, and the footer takes `minmax(0, 1fr)` instead of the trailing `auto`**, leaving track 4 empty. The layout is therefore correct only while the filter is open. With the filter closed and a short list, the `auto` scroller track stops at its content height and the flexible footer track absorbs all remaining space, so the footer's `border-top` separator and text render directly beneath the last row with a tall empty block below instead of pinned at the pane's bottom edge — the state `workbench-shell-smoke.spec.ts:441` renders (two files) and asserts by text only. With a list taller than the pane, the `auto` scroller track absorbs all the free space during track maximisation, the `1fr` footer track resolves to `0`, and the footer — whose `min-height: auto` resolves to its ~32px content-based minimum — overflows the pane's bottom edge. That overflow is where `7d9efb6` changed the symptom rather than caused it: `.file-tree-pane`'s own `overflow: hidden` used to clip it (footer simply invisible), and now it reaches the next scroll container, so `.changed-files-sidebar` (`overflow-x: hidden; overflow-y: auto`, `styles.css:1536-1544`) gains ~32px of scrollable height and scrolls the whole pane, header included. In the narrow Files dialog the same thing happens for *any* list length, because the pane's `height: 100%` resolves against an indefinite height, which makes the flex fraction zero and the footer track `0` unconditionally.

**Fix:**
```css
.file-tree-pane__scroller {
  min-height: 0;
  grid-row: 3;
  padding: var(--space-2);
  padding-bottom: var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
```
and, for `.tree-footer` (`styles.css:1363-1370`):
```css
.tree-footer {
  margin: 0;
  grid-row: 4;
  padding: var(--space-2) 18px;
  border-top: var(--border-width-default) solid var(--border-default);
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
  line-height: var(--line-height-metadata);
}
```

#### WR-02: Reserve popover height in the narrow Files dialog — two clipping ancestors remain

**File:** `src/web/components/ChangedFilesDialog.vue:75-78` (with `src/web/styles.css:969-984` and `:741`)

**Issue:** `7d9efb6` removed the last `overflow: hidden` inside the pane, but the view-options popover is still clipped in the narrow Files dialog, because `.file-tree-pane` was not the only clipping ancestor on the chain: the teleport target `.changed-files-dialog__results` declares `max-height: 50dvh; overflow: auto` (pre-existing, `ChangedFilesDialog.vue:75-78`) and `.modal-dialog` declares `overflow-y: auto` (`styles.css:741`). Both are scroll containers, and the menu's containing block `.file-tree-pane__view-options` (`:964-967`) sits inside both, so the absolutely positioned `.view-options-menu` is clipped by whichever one it exceeds first. The numbers come out against it whenever the dialog's list is short. The menu measures 118px tall from its own tokens (`padding: var(--space-1)` ×2 = 8px, four 24px items at `padding: var(--space-1) var(--space-2)` over `--line-height-chrome: 16px`, three 4px gaps, 2px of border) and starts at `calc(100% + var(--space-1))` below a 22px `.icon-btn` centred in the 35px header, so it spans roughly y=32.5 to y=150.5 from the pane's top. The results box, meanwhile, is content-sized (its `max-height` never makes the height definite, so the pane's `height: 100%` resolves to `auto`): with N rows it measures about 59 + 26N px — 85px for one file, 137px for three — so with three or fewer rows the bottom of the menu is cut off, and with one file more than half of it, including the "Never" radio and the "Open comment badges" checkbox, is unreachable without scrolling the list out from under the anchor. Raising the box's floor above the menu's 150.5px reach clears both ancestors at once: `.modal-dialog` then grows with it (24px padding + 44px close button + 16px gap + heading + 16px gap + box + 24px padding, against an 85dvh cap) and no longer clips either.

**Fix:**
```css
.changed-files-dialog__results {
  min-height: 160px;
  max-height: 50dvh;
  overflow: auto;
}
```

### Info

#### IN-01: Delete the now-unused `directoryDescendantCounts` model surface

**File:** `src/web/model/file-tree.ts:40`, `:98-112`, `:317-318`, `:564`

**Issue:** Unchanged and re-confirmed accurate (deferred as out of `--fix` scope). This patch removed the only consumer — `DirectoryRow`'s `descendantCount`/`descendantCountLabel` and the `:directory-descendant-counts` prop — replacing it with `statusPriorityByDirectoryId`. The map is still declared on the public `FileTreeModel` interface and recomputed by a full recursive `countDirectoryDescendants` walk on every `createModel` call (i.e. every keystroke, toggle and selection), with `tests/unit/file-tree.test.ts:715-721` as the only remaining reference. Dead production code kept alive by its own test.

**Fix:** Remove the `directoryDescendantCounts` field, the `countDirectoryDescendants` helper and its two call sites, and drop the corresponding unit-test block.

#### IN-02: Match the capitalisation convention in the two new `StatusBadge` labels

**File:** `src/web/components/StatusBadge.vue:26,28`

**Issue:** Unchanged and re-confirmed accurate. The five pre-existing labels are sentence-cased (`'Added'`, `'Copied'`, `'Deleted'`, `'Modified'`, `'Renamed'`); the two this patch introduces are lower-cased: `'type changed'` and the `unsupported status: ...` template. These strings are the row's screen-reader status label (`.visually-hidden`, `:36`), so the announcement style now differs by status kind.

**Fix:** Return `label: 'Type changed'` and the back-ticked `Unsupported status: ${props.code}` respectively — the e2e name regexes in `tests/e2e/file-tree.spec.ts` all carry the `i` flag, so they stay green.

#### IN-03: Highlight across the directory/filename split in `PathText`

**File:** `src/web/components/ui/PathText.vue:17-18`

**Issue:** Unchanged and re-confirmed accurate. `highlightMatches` is applied separately to `directory` (`'src/'`) and `filename` (`'app.ts'`), but the filter that selected the row matches against the whole `effectivePath.display` (`src/web/model/file-tree.ts:313-316`). A query spanning the final `/` — e.g. `src/ap` for `src/app.ts` — therefore matches the row while neither half contains the needle, so the row renders with no `<mark>` at all and the user cannot see why it survived the filter.

**Fix:** Segment the full `display` once and split the resulting segments at `directory.value.length`, instead of calling `highlightMatches` twice on the two halves.

#### IN-04: Close the view-options menu on Tab

**File:** `src/web/components/ViewOptionsMenu.vue:65-84`

**Issue:** Unchanged and re-confirmed accurate (the `Escape` branch gained `stopPropagation` but no `Tab` branch). `handleKeydown` handles `Escape`, `ArrowUp`/`ArrowDown` and `Enter`/`Space`, but not `Tab`. Tabbing out of a menu item moves focus to the next document element while the `role="menu"` stays open and the `document` `pointerdown` listener stays attached (`:110-116`), leaving an open menu with focus outside it — a deviation from the WAI-ARIA menu-button pattern, which closes the menu on Tab.

**Fix:** Add `if (event.key === 'Tab') { emit('close'); return; }` at the top of `handleKeydown` (without `preventDefault`, so the Tab still moves focus naturally).

#### IN-05: Ignore modified Arrow keys in the view-options menu

**File:** `src/web/components/ViewOptionsMenu.vue:72-80`

**Issue:** Unchanged and re-confirmed accurate. The menu's `ArrowUp`/`ArrowDown` branches match on `event.key` alone with no modifier check, while `App.vue` registers `handleKeydown` on `document` (`:1238`) where `altKey` plus `ArrowUp`/`ArrowDown` drives `previousFile()`/`nextFile()` (`:985-991`). That global handler's early-return guard only covers `HTMLInputElement`, `HTMLTextAreaElement` and `HTMLSelectElement` (`:984`), and the menu items are `<div role="menuitemradio">`/`menuitemcheckbox` elements, so `Alt+ArrowDown` with the menu open both moves focus inside the menu and switches the open file behind it. `preventDefault()` does not stop the document listener. Low-traffic (it requires holding Alt inside the popover), but the two handlers were clearly not meant to both act.

**Fix:** Gate both branches on an unmodified press — e.g. `if (event.key === 'ArrowDown' && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey)` — or call `event.stopPropagation()` alongside `preventDefault()` for the keys the menu owns.

---
_Reviewed: 2026-11-05T12:15:13Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
