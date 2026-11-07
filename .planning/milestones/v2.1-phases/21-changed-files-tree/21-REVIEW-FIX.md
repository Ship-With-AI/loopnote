---
phase: 21-changed-files-tree
fixed_at: 2026-11-05T13:19:30Z
review_path: .planning/phases/21-changed-files-tree/21-REVIEW.md
iteration: 3
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Source review:** .planning/phases/21-changed-files-tree/21-REVIEW.md
**Iterations run:** 3 of 3 (`--auto`, cap reached — no further re-review runs after this iteration per the workflow's `while ITERATION -lt MAX_ITERATIONS` cap)

**Overall summary:**
- Findings in scope across all 3 iterations: 9 (Critical + Warning only — default scope, no `--all`)
- Fixed: 9
- Skipped: 0

Note: `.planning/phases/21-changed-files-tree/21-REVIEW.md` reflects the iteration-3 *re-review* snapshot (0 Critical, 2 Warning, 5 Info — the 2 Warnings below were fixed by this report's Iteration 3 section). Per the capped `--auto` loop, no fourth re-review runs to refresh REVIEW.md's `status` field to `clean`; this fix report is the authoritative record that those 2 findings were addressed.

## Iteration 1 — fixes for the initial review (1 Critical, 3 Warning)

**Fixed at:** 2026-11-05T12:43:40Z

### CR-01: Remove `overflow: hidden` from the tree header so the view-options menu is not clipped
**Files modified:** `src/web/styles.css` · **Commit:** `7e9dbdb`
Dropped `overflow: hidden` from `.file-tree-pane__top`.

### WR-01: Keep line counts hidden on hover when the "Never" mode is selected
**Files modified:** `src/web/styles.css` · **Commit:** `7e9dbdb` (bundled with CR-01 — same file, same single-concern CSS pass)
Added `.tree-row--counts-never:hover .line-counts` so the "Never" override wins at equal specificity to `.tree-row:hover .line-counts` regardless of source order.

### WR-02: Activate the first *visible* row when Enter is pressed in the filter in tree mode
**Files modified:** `src/web/components/FileTree.vue` · **Commit:** `24d4fec`
Tree mode now searches `model.value.visibleRows` for the first `kind === 'file'` entry (expansion-aware) instead of the expansion-independent `flatFileRows[0]`; list mode unchanged.

### WR-03: Use `Object.hasOwn` for the file-type-mark lookup instead of the `in` operator
**Files modified:** `src/web/components/FileRow.vue` · **Commit:** `0990f11`
Replaced `extension in FILE_TYPE_MARKS` with `Object.hasOwn(FILE_TYPE_MARKS, extension)`.

**Iteration 1 verification:** `vue-tsc --noEmit` — zero errors. Info findings (IN-01..IN-04) left out of scope (no `--all`).

## Iteration 2 — fixes for the re-review (0 Critical, 3 Warning found after iteration 1)

**Fixed at:** 2026-11-05T13:02:47Z

### WR-01 (re-review): `status.code` not forwarded by the exact-patch session producer
**Files modified:** `src/server/patch-snapshot.ts` · **Commit:** `39f9c66`
`PatchSnapshot.session()`'s per-file `status` object now includes `code: file.status.code` in both branches, matching every other producer in `src/server/capabilities.ts`. Root cause: phase 21 added the optional `code` field to `ApiFileStatusSchema` but this one producer (outside the originally-scoped 23-file list) was never updated.

### WR-02 (re-review): Escape in the filter/view-options menu also closed the ancestor Files modal
**Files modified:** `src/web/components/FileTree.vue`, `src/web/components/ViewOptionsMenu.vue` · **Commit:** `e1936eb`
Added `event.stopPropagation()` to both `handleFilterKeydown`'s and `ViewOptionsMenu`'s `handleKeydown`'s Escape branches, so Escape no longer bubbles to `ModalDialog.vue`'s `containFocus` when the tree is teleported inside the narrow-layout Files dialog.

### WR-03 (re-review): Residual `overflow: hidden` on `.file-tree-pane` still clipped the popover
**Files modified:** `src/web/styles.css` · **Commit:** `7d9efb6`
Removed `overflow: hidden` from `.file-tree-pane` itself. All four grid rows manage their own overflow independently (label ellipsis, scroller's own `overflow-y: auto`, simple content rows), so the outer clip was redundant.

**Iteration 2 verification:** `vue-tsc --noEmit` + `tsc --noEmit` (server) — zero errors; unit suite 390/390; 4 relevant Playwright specs 25/25.

## Iteration 3 — fixes for the second re-review (0 Critical, 2 Warning found after iteration 2) — final capped pass

**Fixed at:** 2026-11-05T13:19:30Z

### WR-01 (2nd re-review): `.file-tree-pane` grid auto-placement shifted rows when the filter row was hidden
**Files modified:** `src/web/styles.css` · **Commit:** `38d91a8`
`.filter` uses `v-show` and generates no box when `display: none`, so CSS Grid auto-placement shifted `.file-tree-pane__scroller` and `.tree-footer` into the wrong tracks (`minmax(0, 1fr)` / overflow). Pinned each of the four `.file-tree-pane` direct children to an explicit `grid-row` (1: `.file-tree-pane__top`, 2: `.filter`, 3: `.file-tree-pane__scroller`, 4: `.tree-footer`) so hiding the filter row no longer reflows the others. Pre-existing layout bug, not introduced by iterations 1–2 (those only changed which overflow half was visible).

### WR-02 (2nd re-review): Popover still clipped in the narrow Files dialog by `.changed-files-dialog__results`/`.modal-dialog` ancestors
**Files modified:** `src/web/components/ChangedFilesDialog.vue` · **Commit:** `9085c35`
Added `min-height: 160px` to `.changed-files-dialog__results` (alongside its existing `max-height: 50dvh; overflow: auto`) so the content-sized results box is tall enough to clear the view-options popover's full extent even with very few changed files.

**Iteration 3 verification:** `vue-tsc --noEmit` + `verify:semantic-css` + `npm run build` — all pass; unit suite 390/390; 4 relevant Playwright specs 25/25.

Carried-forward Info items (IN-01..IN-05) remain out of scope for this `--fix` run (no `--all` flag); not blocking.

---
_Fixer: the agent (gsd-code-fixer, applied directly by the post-exec orchestrator — no separate worktree isolation needed; no concurrent writers)_
_Loop: capped at 3 of 3 iterations per the `--auto` workflow — stopping here regardless of remaining Info-level findings._
