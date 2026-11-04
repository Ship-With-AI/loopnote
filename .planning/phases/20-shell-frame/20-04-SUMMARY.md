---
phase: 20-shell-frame
plan: 04
subsystem: ui
tags: [css-tokens, vue, workbench, editor-title, breadcrumbs, icons]

# Dependency graph
requires:
  - phase: 20-shell-frame
    provides: "Token-root migration pattern + TitleBar.vue/StatusBar.vue precedent (standalone, unwired, props-driven presentational components) from 20-03"
provides:
  - "New --editor-title-height/--breadcrumb-height/--view-header-height/--font-size-label/--letter-spacing-label tokens registered in CANONICAL_TOKENS with real consumers"
  - "EditorTitle.vue — standalone, unwired component folding ReviewToolbar.vue + ActiveFileToolbar.vue: filename/status/counts heading plus 8 icon-only actions (previous/next-change, previous/next-file, diff-split/diff-inline, markdown-source/markdown-preview) in UI-SPEC's exact order"
  - "Breadcrumbs.vue — standalone, unwired, non-interactive <nav> rendering path segments with a file-type mark on the last segment"
  - "UiIcon.vue diff-split/diff-inline/markdown-source/markdown-preview glyphs"
  - "FileTree.vue's .file-tree-pane h2 view-header row re-skinned to 35px uppercase label typography (CSS-only, no template/script change)"
affects: [20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Icon-only toolbar group fold: ActiveFileToolbar.vue's computeds (effectivePath/singlePaneSide/layoutLabel/standaloneStateLabel/counts/isMarkdownFile/filesHostVisible/filesToggleCopy/filesToggleLabel) and focusFilesToggle/focusHeading/defineExpose copied byte-identical into the new component; only the surrounding template markup changes (group wrapper divs + text labels dropped, buttons already icon-only kept verbatim)"
    - "New toggle-action aria-pressed binds to the actual boolean semantics of its driving prop (Monaco's own renderSideBySide: true means side-by-side), not to a literal reading of prose shorthand describing two bindings at once"

key-files:
  created:
    - src/web/components/workbench/EditorTitle.vue
    - src/web/components/workbench/Breadcrumbs.vue
  modified:
    - src/web/styles.css
    - scripts/css-token-contract.mjs
    - src/web/components/ui/UiIcon.vue

key-decisions:
  - "diff-split's :aria-pressed binds to renderSideBySide (true) and diff-inline's to !renderSideBySide — not the inverted '!renderSideBySide/renderSideBySide respectively' literal text in the plan's Task 2 action paragraph. Verified via DiffWorkspace.vue/diff-adapter.ts: renderSideBySide:true is Monaco's own side-by-side option; UI-SPEC's Icon Inventory table independently confirms diff-split's state is 'aria-pressed = !inline' (i.e. pressed when side-by-side, not inline). The plan's prose had the two values transposed; implemented the semantically correct (and UI-SPEC-matching) binding as a Rule 1 auto-fix."
  - "Breadcrumbs.vue's last-segment file-type mark reuses PathDisplay.vue's own convention (color: var(--text-primary); font-weight: var(--font-weight-semibold) — found on .path-text__filename) via a local .breadcrumbs__segment--file class, per the plan's documented fallback (PathDisplay.vue exposes no separable file-type-mark sub-part to import directly)."
  - "EditorTitle.vue's filename/status/counts block keeps ActiveFileToolbar.vue's original class names (review-toolbar__active-file, review-toolbar__status, review-toolbar__counts) since the template block is copied verbatim per the plan and those classes are already styled globally in styles.css; ReviewToolbar.vue/ActiveFileToolbar.vue are untouched (not in files_modified) and keep using the same classes without collision since EditorTitle.vue is unwired/unmounted."
  - "The narrow-only 'Open files' trigger button is copied verbatim with no new viewport media query — the plan's action text says 'kept exactly as-is', and the previous always-visible behavior is intentionally left for 20-07's real integration to resolve against actual viewport-responsive props."
  - "NAV-01/NAV-02 left Pending in REQUIREMENTS.md despite this plan's frontmatter listing them, following the precedent set in 20-02-SUMMARY.md: both components are unwired (no App.vue integration yet), so the requirements' 'Reviewer sees...' language is not yet user-observable. 20-07 (App.vue integration) is the plan that makes NAV-01/NAV-02 true and should flip them."

patterns-established:
  - "Toggle-action aria-pressed bindings are derived from the real prop/runtime semantics (checked against the actual consuming adapter code), not from plan prose shorthand, when the two conflict."

requirements-completed: []

# Metrics
duration: 40min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 04: EditorTitle.vue + Breadcrumbs.vue Summary

**Folded ReviewToolbar.vue + ActiveFileToolbar.vue into a new icon-only EditorTitle.vue (8 actions: change/file nav, diff-split/inline, markdown source/preview) and built a non-interactive Breadcrumbs.vue, landing all five of this plan's new geometry/typography tokens with real consumers.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-11-04
- **Completed:** 2026-11-04
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Registered `--editor-title-height: 35px`, `--breadcrumb-height: 24px`, `--view-header-height: 35px`, `--font-size-label: 11px`, `--letter-spacing-label: 0.04em` in `styles.css` `:root` and `CANONICAL_TOKENS` (alphabetical positions)
- Re-skinned `FileTree.vue`'s `.file-tree-pane h2` view-header row to `var(--view-header-height)` with uppercase `--font-size-label`/`--letter-spacing-label` typography — CSS-only, template/script untouched
- Added `diff-split`, `diff-inline`, `markdown-source`, `markdown-preview` glyphs to `UiIcon.vue`'s `UiIconName` union (1-2 path/rect elements each, matching the existing minimalist convention)
- Created `EditorTitle.vue`: filename `h1` + status badge + `+N −N` counts (verbatim `ActiveFileToolbar.vue` computeds/template), followed by previous/next-change, previous/next-file, `diff-split`/`diff-inline` (role="group", disabled on single-pane files), and — Markdown files only — `markdown-source`/`markdown-preview` (role="group"), plus the narrow-only "Open files" trigger; `role="toolbar" aria-label="Diff navigation"` root migration target for 20-07
- Created `Breadcrumbs.vue`: `<nav aria-label="File path">` with `›` separators and a file-type mark on the last segment; zero `tabindex`/`@click`/`role="button"` anywhere

## Task Commits

Each task was committed atomically:

1. **Task 1: Register this plan's tokens; retune FileTree.vue's view-header row** - `71637d4` (feat)
2. **Task 2: EditorTitle.vue — fold ReviewToolbar.vue + ActiveFileToolbar.vue** - `1102d51` (feat)
3. **Task 3: Breadcrumbs.vue** - `1c700f2` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/web/styles.css` - 5 new `:root` tokens; `.file-tree-pane h2` view-header row retuned
- `scripts/css-token-contract.mjs` - 5 new `CANONICAL_TOKENS` entries at alphabetical positions
- `src/web/components/ui/UiIcon.vue` - `diff-split`/`diff-inline`/`markdown-source`/`markdown-preview` glyphs
- `src/web/components/workbench/EditorTitle.vue` - new, folds `ReviewToolbar.vue` + `ActiveFileToolbar.vue`
- `src/web/components/workbench/Breadcrumbs.vue` - new, non-interactive path row

## Decisions Made

See `key-decisions` in frontmatter. Most significant: corrected the plan's inverted `diff-split`/`diff-inline` `aria-pressed` binding to match `renderSideBySide`'s real semantics (verified against `DiffWorkspace.vue`/`diff-adapter.ts` and UI-SPEC's Icon Inventory table), and left NAV-01/NAV-02 unflipped in `REQUIREMENTS.md` pending 20-07's `App.vue` wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected inverted `diff-split`/`diff-inline` `aria-pressed` binding**
- **Found during:** Task 2 (EditorTitle.vue)
- **Issue:** The plan's Task 2 action text literally specifies "each `:aria-pressed` bound `!renderSideBySide`/`renderSideBySide` respectively" for `diff-split`/`diff-inline` in that order — i.e. `diff-split` → `!renderSideBySide`, `diff-inline` → `renderSideBySide`. This is backwards: `renderSideBySide: true` is Monaco's own side-by-side rendering option (confirmed in `DiffWorkspace.vue:38` default `true` and `diff-adapter.ts`'s `setRenderSideBySide`/`updateOptions({ renderSideBySide })`), so the side-by-side ("split") button should be pressed when `renderSideBySide` is `true`, not `false`. UI-SPEC's own Icon Inventory table independently confirms this: `diff-split` → `aria-pressed = !inline` (pressed when *not* inline, i.e. when side-by-side), `diff-inline` → `aria-pressed = inline`.
- **Fix:** Implemented `diff-split` with `:aria-pressed="renderSideBySide"` and `diff-inline` with `:aria-pressed="!renderSideBySide"` — the semantically correct, UI-SPEC-matching binding. The `@click` handlers (`toggle-layout` with `true`/`false` for split/inline respectively) were already correct in the plan text and are unchanged.
- **Files modified:** `src/web/components/workbench/EditorTitle.vue`
- **Verification:** `npm run typecheck:web` passes; manually traced both bindings against `renderSideBySide`'s documented default/consumer semantics and the UI-SPEC table's `!inline`/`inline` column.
- **Committed in:** `1102d51` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the toggle buttons to reflect the correct pressed state; no scope creep — same markup structure, same click handlers, only the `aria-pressed` expressions were corrected.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm run typecheck:web`, `npm run build:web`, and `node scripts/verify-semantic-css.mjs` all pass; all five of this plan's new tokens have real consumers
- `EditorTitle.vue`/`Breadcrumbs.vue` exist, type-check, and are ready for 20-07's `App.vue` integration to replace `ReviewToolbar`/`ActiveFileToolbar`'s template usage one-for-one (including the `.review-toolbar` → `role="toolbar"` locator-migration note left for `tests/e2e/responsive-session.spec.ts`)
- NAV-01/NAV-02 remain Pending in `REQUIREMENTS.md` until 20-07 wires both components into `App.vue`
- No blockers

## Self-Check: PASSED

- `src/web/components/workbench/EditorTitle.vue` — FOUND (261 lines)
- `src/web/components/workbench/Breadcrumbs.vue` — FOUND (51 lines)
- Commit `71637d4` — FOUND in `git log`
- Commit `1102d51` — FOUND in `git log`
- Commit `1c700f2` — FOUND in `git log`
- `npm run typecheck:web` — PASS (0 diagnostics)
- `npm run build:web && node scripts/verify-semantic-css.mjs` — PASS ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.")
- `grep -c 'tabindex\|@click\|role="button"' src/web/components/workbench/Breadcrumbs.vue` — `0`

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
