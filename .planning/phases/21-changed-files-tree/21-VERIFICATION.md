---
phase: 21-changed-files-tree
status: passed-with-warnings
verified_at: 2026-11-05
verifier: gsd-verifier (goal-backward)
must_haves:
  truths:
    - "SC1: 22px rows, single-child folder chain compaction, file-type mark, status-coloured name, right-aligned non-colour-only M/A/D letter (line-through deleted), open-comment badge"
    - "SC2: +N -N counts on hover-or-selection by default, changeable via keyboard-reachable view-options menu (always/hover/never + comment-badge toggle)"
    - "SC3: path filter — highlighted substring, 'N of M', Enter/↓/Esc, empty state; tree⇄list switch with dimmed directory"
    - "SC4: file count + totals under the tree"
    - "SC5: entire tree operable by keyboard through a single tab stop, proven with real-browser Tab/Arrow evidence across compact-folder-chain rows"
    - "TREE-01..TREE-07 (see per-requirement table below)"
  artifacts:
    - path: src/web/model/file-tree.ts
      provides: "statusPriorityByDirectoryId, flatFileRows, highlightMatches"
    - path: src/web/model/panel-state.ts
      provides: "treeViewMode/treeLineCounts/treeCommentBadges persisted fields"
    - path: src/web/components/FileRow.vue
      provides: "row anatomy: file-type mark → name → comment badge → markers → line counts → status letter"
    - path: src/web/components/DirectoryRow.vue
      provides: "collapsed status-colour bullet, no descendant-count badge"
    - path: src/web/components/StatusBadge.vue
      provides: "independent type-changed (T) / unsupported (raw code) tones"
    - path: src/web/components/FileTree.vue
      provides: "view-header toolbar, collapsible filter, footer totals, tree/listbox mode switch"
    - path: src/web/components/ViewOptionsMenu.vue
      provides: "role=menu popover, menuitemradio x3 + menuitemcheckbox x1, roving tabindex"
    - path: src/web/App.vue
      provides: "openCommentCounts + view-option handlers wired to panelState"
  key_links:
    - from: src/web/components/ViewOptionsMenu.vue
      to: src/web/App.vue
      via: "update:line-counts/update:comment-badges → ChangedFilesDialog relay → panelState.treeLineCounts/treeCommentBadges.persist()"
    - from: src/web/components/FileTree.vue
      to: src/web/model/file-tree.ts
      via: "model.flatFileRows drives filter count, list-mode rows, and footer totals"
behavior_unverified_items:
  - "+N −N line counts become visible on real mouse hover or on row selection by default (treeLineCounts='hover'); no Playwright test exercises an actual :hover trigger or a default-mode (non-'always') selection to observe the opacity 0→1 transition — the only opacity assertion in the suite follows an explicit switch to 'Always' mode."
  - "Filter Enter opens the first visible match, and ↓ moves focus from the filter input into the tree without closing the filter — no test presses Enter or ArrowDown with the filter focused to observe either outcome."
  - "List mode's ↑/↓/Home/End/Enter/Space keyboard semantics are identical to tree mode, and list rows show the dimmed directory (PathText basename=false) — no test toggles into list mode and drives its keyboard navigation or inspects a list row's directory text; only the tree⇄listbox role switch itself is exercised."
---

# Phase 21 — Changed-Files Tree: Verification

**Adversarial starting hypothesis**: tasks completed, goal missed until proven otherwise. SUMMARY.md claims were treated as hypotheses and checked against the current `main` codebase (`07d5a06`..`d265169`), not trusted.

## Method

Three-level check (exists → substantive → wired) against `src/web/components/{FileTree,FileRow,DirectoryRow,StatusBadge,ViewOptionsMenu,ChangedFilesDialog}.vue`, `src/web/App.vue`, `src/web/model/{file-tree,panel-state}.ts`, `src/web/styles.css`, cross-referenced against `.planning/phases/21-changed-files-tree/21-UI-SPEC.md` and the 4 plans' `must_haves`. Behavior-dependent truths (hover, keyboard semantics) were additionally checked for a *specific passing test that exercises the exact behavior*, not just markup/ARIA presence.

Gates re-run directly (not trusted from SUMMARY):
- `npm run typecheck:web` → clean.
- `npx vitest run --no-file-parallelism tests/unit` → 390/390 passed.
- `npm run verify:semantic-css` → passed.
- `npx playwright test tests/e2e/file-tree.spec.ts` → 4/4 passed.
- `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` → 8/8 passed.
- `npx playwright test tests/e2e/pinned-session.spec.ts tests/e2e/responsive-session.spec.ts tests/integration/anchored-workspace.spec.ts` → 25/25 passed (confirms the orchestrator's `198be93` pinned-session fix and the 21-03 locator migrations in responsive-session/anchored-workspace both hold).
- Commit hashes named in all 4 SUMMARYs and the orchestrator fixes (`07d5a06`, `4e151dd`, `ae5fabc`, `d54b1a9`, `870d912`, `463f0bb`, `fddc4a0`, `e5a972f`, `5550713`, `89c0ea9`, `198be93`, `d265169`) all exist on `main` via `git log`.
- `.planning/REQUIREMENTS.md` confirms TREE-01..TREE-07 marked Complete under Phase 21 (bookkeeping matches earned state, not just claimed).

## ROADMAP Success Criteria

| # | Criterion | Verdict |
|---|---|---|
| 1 | 22px rows, compacted single-child folder chains, file-type mark, status-coloured name, right-aligned non-colour-only M/A/D letter (line-through deleted), open-comment badge | ✓ VERIFIED, with one WARNING (row height nuance below) |
| 2 | `+N −N` on hover-or-selection by default, changeable via keyboard-reachable view-options menu | ✓ VERIFIED for the *menu/control* path; ⚠️ PRESENT_BEHAVIOR_UNVERIFIED for the *default hover/selection* visibility trigger itself |
| 3 | Path filter: highlight, "N of M", Enter/↓/Esc, empty state; tree⇄list switch with dimmed directory | ✓ VERIFIED for highlight/empty-state/Esc/mode-switch; ⚠️ PRESENT_BEHAVIOR_UNVERIFIED for Enter/↓ filter semantics and list-mode keyboard parity/dimmed-directory rendering |
| 4 | File count + `+X −Y` totals under the tree | ✓ VERIFIED |
| 5 | Entire tree keyboard-operable through a single tab stop, proven with real-browser evidence across compact-folder-chain rows | ✓ VERIFIED |

### SC1 detail — row height
`--file-row-min-height` is 22px (token, unchanged), but the actually rendered `.tree-row` box is 26px (padding-block + border overhead), not literal 22px. This is **not a Phase 21 regression** — 21-02's own SUMMARY documents the pre-Phase-21 baseline was already 28px (never literally 22px), and the phase's chrome-flattening work *reduced* it from 28px→26px, with a Playwright assertion (`workbench-shell-smoke.spec.ts` "row anatomy" test) locking in 26px as the verified value. Everything else in SC1 (compacted chain rows, file-type mark, status-coloured name via `name-tone--*` classes, right-aligned `StatusBadge` letter with `line-through` on `name-tone--deleted`, `.cbadge` with a real seeded comment) is directly exercised by passing tests. Flagged as a WARNING on literal wording, not a functional gap.

## TREE-01..TREE-07

| Req | Verdict | Evidence |
|---|---|---|
| TREE-01 | ✓ VERIFIED | `FileRow.vue`/`DirectoryRow.vue`/`StatusBadge.vue` row anatomy in exact DOM order; `workbench-shell-smoke.spec.ts:349` ("row anatomy…") passes; `directory-row__bullet--modified` class asserted on a real collapsed folder (`:398`) |
| TREE-02 | Split — menu control ✓ VERIFIED; default hover/selection trigger ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `tree-row--counts-always/never` classes + CSS rules present and correctly wired (`styles.css:1090-1102`); `file-tree.spec.ts:693` proves opacity flips to 1 only after explicitly selecting "Always" in the menu — no test exercises the default `'hover'` mode's `:hover`/`--selected` opacity transition via a real pointer hover or an unmodified selection |
| TREE-03 | Split — highlight/empty-state/Esc ✓ VERIFIED; Enter/↓ semantics ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `highlightMatches` unit-tested + real `<mark>` asserted (`workbench-shell-smoke.spec.ts:454`, `:561`); empty state `"No changed files match "…"."` asserted (`file-tree.spec.ts:599`); Esc-returns-focus-to-tree asserted (`:571-573`); no test presses `Enter` or `ArrowDown` with the filter input focused |
| TREE-04 | Split — tree⇄list role switch ✓ VERIFIED; list-mode keyboard parity + dimmed directory ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `flatFileRows` (expansion-independent, filter-aware) unit-tested in `tests/unit/file-tree.test.ts`; list⇄tree button flips `role="tree"`↔`role="listbox"` and is exercised in both e2e specs; `FileRow.vue:143` correctly binds `basename="mode !== 'list'"` and `PathText.vue` renders a dimmed `.path-text__directory` span — but no e2e test actually switches into list mode and drives ↑/↓/Home/End/Enter/Space there, nor inspects a rendered list row's directory text |
| TREE-05 | ✓ VERIFIED | `ViewOptionsMenu.vue` role=menu/menuitemradio×3/menuitemcheckbox×1, roving-tabindex arrow-wrap (`% 4`), Enter/Space activation, Esc→focus-returns-to-⋯-button all directly exercised in `workbench-shell-smoke.spec.ts:578-584` and `file-tree.spec.ts:689-702`; persistence to `panelState.treeLineCounts`/`treeCommentBadges` end-to-end wired (`App.vue:401-414,1524-1536`) and the written `localStorage` value asserted (`file-tree.spec.ts:706-714`) |
| TREE-06 | ✓ VERIFIED | `footerText` computed matches UI-SPEC exactly (`"{N} files · +{A} −{D}"` / `"{N} of {M} files"` while filtering); both forms asserted verbatim in `workbench-shell-smoke.spec.ts:441,455` |
| TREE-07 | ✓ VERIFIED | `workbench-shell-smoke.spec.ts:485` ("keyboard tab order: single tab stop…") drives Home/↑/↓ across a compacted folder-chain row (`docs/guide`) and a leaf row while asserting `tabbable` count stays 1 throughout, then separately proves Tab/Shift+Tab ordering across toolbar→filter→tree and the view-options menu's own Esc-returns-focus contract — this is the named passing test that upgrades TREE-07 to VERIFIED rather than PRESENT_BEHAVIOR_UNVERIFIED |

## Artifacts (Level 1–3)

| Path | Exists | Substantive | Wired | Status |
|---|---|---|---|---|
| `src/web/model/file-tree.ts` (`statusPriorityByDirectoryId`, `flatFileRows`, `highlightMatches`) | ✓ | ✓ (real recursive priority fold, real recursive flatten, real segment function; not stubs) | ✓ (exported on `FileTreeModel`, consumed by `DirectoryRow.vue`/`FileTree.vue`/`PathText.vue`) | ✓ VERIFIED |
| `src/web/model/panel-state.ts` (`treeViewMode`/`treeLineCounts`/`treeCommentBadges`) | ✓ | ✓ (independent per-field validation arms, own defaults) | ✓ (read by `App.vue`, written by `persist()`, round-trip unit-tested) | ✓ VERIFIED |
| `src/web/components/FileRow.vue` | ✓ | ✓ | ✓ (rendered from `DirectoryRow.vue`/`FileTree.vue` list-mode block) | ✓ VERIFIED |
| `src/web/components/DirectoryRow.vue` | ✓ | ✓ | ✓ | ✓ VERIFIED |
| `src/web/components/StatusBadge.vue` | ✓ | ✓ (7 distinct `kind` branches incl. `type-changed`/`unsupported`) | ✓ (both `FileRow.vue` and `EditorTitle.vue` pass `code`) | ✓ VERIFIED |
| `src/web/components/FileTree.vue` | ✓ | ✓ (toolbar, filter, footer, tree/listbox switch all present) | ✓ (consumes model, emits to `ChangedFilesDialog.vue`) | ✓ VERIFIED |
| `src/web/components/ViewOptionsMenu.vue` | ✓ | ✓ | ✓ (mounted in `FileTree.vue`, events relayed to `App.vue`) | ✓ VERIFIED |
| `src/web/App.vue` (`openCommentCounts`, `toggleTree*`) | ✓ | ✓ | ✓ | ✓ VERIFIED |

## Key links

| From | To | Via | Status |
|---|---|---|---|
| `ViewOptionsMenu.vue` | `App.vue` | `update:line-counts`/`update:comment-badges` → `ChangedFilesDialog.vue` relay → `toggleTreeLineCounts`/`toggleTreeCommentBadges` → `panelState.*.value` + `persist()` | ✓ WIRED |
| `FileTree.vue` | `file-tree.ts` | `model.value.flatFileRows` drives filter `"N of M"`, list-mode row set, and footer totals | ✓ WIRED |
| `App.vue` | `ChangedFilesDialog.vue` → `FileTree.vue` | `openCommentCounts`/`lineCounts`/`commentBadgesEnabled`/`viewMode` props forwarded | ✓ WIRED |
| `DirectoryRow.vue` | `file-tree.ts` | `statusPriorityByDirectoryId` prop drives collapsed bullet tone class | ✓ WIRED |

## Gaps

None. No must-have truth resolved to FAILED. The three behavior-dependent truths below resolved to PRESENT_BEHAVIOR_UNVERIFIED (code present and correctly wired, but no passing test exercises the exact runtime behavior) rather than FAILED, per protocol — they do not block the phase but are listed for human verification.

## Human Verification Required

### 1. Default hover/selection line-count visibility
**Test:** With the view-options menu left at its default "On hover or selection" setting (do not switch to "Always"), hover the mouse over a file row that is neither selected nor previously hovered, and separately select a different row via keyboard without hovering it.
**Expected:** The `+N −N` line counts are invisible (opacity 0) on an unselected, unhovered row, become visible on real mouse hover, and remain visible on keyboard selection — without needing to open the view-options menu.
**Why human:** `styles.css`'s `.tree-row:hover .line-counts` / `.tree-row--selected .line-counts` rules are present and correctly scoped, but the only Playwright assertion of `opacity: 1` follows an explicit switch to "Always" mode; no test drives a real pointer hover or inspects a selected-but-unmodified row's opacity.

### 2. Filter Enter/↓ keyboard semantics
**Test:** Open the path filter, type a substring that matches at least one file, then press Enter with focus still in the filter input; separately, repeat and press ↓ instead.
**Expected:** Enter opens (activates) the first visible match; ↓ moves focus from the filter input into the tree's first visible row without closing the filter row.
**Why human:** `FileTree.vue`'s `handleFilterKeydown` implements both branches correctly, but no Playwright test exercises either keypress while the filter is focused.

### 3. List-mode keyboard parity and dimmed-directory rendering
**Test:** Click the list⇄tree toggle to switch into list mode, then drive ↑/↓/Home/End/Enter/Space across the flat list; inspect a list row's directory portion.
**Expected:** Navigation behaves identically to tree mode (same file order, same keys), and each row shows its filename first with a dimmed (`--text-muted`) directory segment after it.
**Why human:** `FileRow.vue`/`PathText.vue` correctly bind `basename="mode !== 'list'"` and `handleListKeydown` implements the full key set, but no e2e test actually switches into list mode and drives its keyboard navigation or visually/DOM-inspects a list row's directory text — only the `role="tree"`↔`role="listbox"` switch itself is exercised.

## Verdict

**status: passed-with-warnings**

All 5 ROADMAP Success Criteria and all 7 TREE-01..TREE-07 requirements have their structural/wiring claims VERIFIED against the live codebase (not SUMMARY narrative), all re-run automated gates are green, and the orchestrator's cross-cutting fixes (`e5a972f`'s `--space-5`/allowlist fix, `51dba44`'s grid-overflow fix, `198be93`'s pinned-session locator fix) all hold under direct re-run. No BLOCKER findings. Three narrowly-scoped runtime behaviors (default hover/selection line-count visibility, filter Enter/↓ semantics, list-mode keyboard parity + dimmed-directory rendering) are present and correctly wired in code but not exercised by any passing automated test, and are routed to human verification per protocol — these keep the status at `passed-with-warnings` rather than `passed`, but do not constitute a gap in the phase's delivered functionality.
