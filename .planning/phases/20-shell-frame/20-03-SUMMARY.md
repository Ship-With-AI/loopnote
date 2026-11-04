---
phase: 20-shell-frame
plan: 03
subsystem: ui
tags: [css-tokens, vue, workbench, identity, status-bar]

# Dependency graph
requires:
  - phase: 20-shell-frame
    provides: "Phase 20's overall geometry/token scope defined in 20-UI-SPEC.md (Workbench Geometry Tokens, Interim Placements)"
provides:
  - "Revalued --file-row-min-height/--sidebar-width/--tree-indent/--radius-control/--radius-file-row/--radius-overlay/--line-height-code :root tokens at workbench density values"
  - "New --titlebar-height/--statusbar-height/--control-height-icon/--font-size-chrome/--line-height-chrome tokens registered in CANONICAL_TOKENS with real consumers"
  - "TitleBar.vue — standalone, unwired presentational component replacing IdentityHeader.vue's identity text + Refresh, with sidebar/panel icon-toggle buttons"
  - "StatusBar.vue — standalone, unwired presentational component replacing ShellFooter.vue, with snapshot/comment-count/Export/Support items"
  - "UiIcon.vue sidebar/panel glyphs"
affects: [20-04, 20-05, 20-06, 20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Five-session-kind discriminant ('patch' in session / 'base' in session / uncommittedKey.value?.sourceKind) copied byte-identical from IdentityHeader.vue into every new session-kind-branching component, per RESEARCH.md Pitfall 1"
    - "New chrome components stay presentational and props-driven for anything beyond their own direct discriminant needs (StatusBar receives snapshotLabel/exportSupported pre-resolved rather than re-deriving session kind)"
    - "New icon-only toggle buttons get a dedicated .icon-btn class (22x22 hit area via --control-height-icon) distinct from the existing text-button .identity-disclosure class that Refresh/Support keep using verbatim"

key-files:
  created:
    - src/web/components/workbench/TitleBar.vue
    - src/web/components/workbench/StatusBar.vue
  modified:
    - src/web/styles.css
    - scripts/css-token-contract.mjs
    - src/web/components/ui/UiIcon.vue

key-decisions:
  - "Registered only the 5 new tokens with a real consumer in this plan (--titlebar-height, --statusbar-height, --control-height-icon, --font-size-chrome, --line-height-chrome), deferring the UI-SPEC's remaining ~11 new-token rows (--view-header-height, --editor-title-height, --breadcrumb-height, --panel-height-*, --sidebar-width-*) to the later plans (20-04..20-06) that actually build those consumers, since verify-semantic-css.mjs fails on any canonical token without a var(...) consumer"
  - "StatusBar's Export-item emphasis reuses --interactive-accent-emphasis directly rather than registering a new --statusbar-emphasis-bg color-alias token, per UI-SPEC's Color section (no new hex/color tokens this phase)"
  - ".tree-row retuned from --font-size-body/--line-height-body + 5px padding-block to --font-size-chrome/--line-height-chrome + 3px padding-block (3+3+16=22px), giving --font-size-chrome/--line-height-chrome a second real consumer alongside TitleBar.vue/StatusBar.vue"
  - "Removed the dead 761-1050px and >=1650px --sidebar-width breakpoint overrides; left the surrounding .session-header/.header-facts flex-wrap sibling rule in the first media block untouched for 20-07's integration pass"

requirements-completed: [TOK-01, SHELL-01, SHELL-02, SHELL-03]

# Metrics
duration: 35min
completed: 2026-11-04
status: complete
---

# Phase 20 Plan 03: Workbench Geometry Tokens + TitleBar/StatusBar Summary

**Registered 5 new workbench chrome tokens (titlebar/statusbar height, icon-button hit area, chrome font/line-height) and revalued 7 existing geometry tokens to workbench density, paired with two new standalone components — TitleBar.vue and StatusBar.vue — that consume them and reproduce IdentityHeader.vue's/ShellFooter.vue's content verbatim.**

## Performance

- **Duration:** 35 min
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `:root` geometry tokens revalued to workbench density: `--file-row-min-height` 34→22px, `--sidebar-width` 294→264px, `--tree-indent` 20→12px, `--radius-control` 6→4px, `--radius-file-row` 5→0, `--radius-overlay` 10→6px, `--line-height-code` 26→20px
- 5 new tokens added to `:root` and `CANONICAL_TOKENS` (alphabetically ordered): `--titlebar-height: 32px`, `--statusbar-height: 22px`, `--control-height-icon: 22px`, `--font-size-chrome: 13px`, `--line-height-chrome: 16px`
- `.tree-row` retuned to the new 22px row height via `--font-size-chrome`/`--line-height-chrome` and 3px `padding-block`
- Dead `--sidebar-width` breakpoint overrides (761-1050px, >=1650px) removed
- `TitleBar.vue` created: brand, compact centered identity text for all five session kinds (committed/exact-patch/standalone/uncommitted-staged/unstaged/worktree), dirty-badge/attached-fact/worktree-changed facts, Refresh button (uncommitted-only), new sidebar-toggle and panel-toggle icon buttons with `aria-pressed`, no Support button
- `StatusBar.vue` created: snapshot indicator (lock icon + `snapshotLabel` prop), open-comment-count item, Export item (emphasized via `--interactive-accent-emphasis` when `exportSupported`), relocated Support button with `focusSupport()`/`defineExpose`
- `UiIcon.vue` gained `sidebar`/`panel` glyphs (rounded-rect outline with vertical/horizontal divider, 16x16, 1-2 path elements matching existing glyph economy)

## Task Commits

1. **Task 1: Token root migration — revalue existing tokens, register this plan's new tokens** - `7165406` (feat)
2. **Task 2: TitleBar.vue + sidebar/panel UiIcon glyphs** - `ce77f4a` (feat)
3. **Task 3: StatusBar.vue** - `3474c8f` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/web/components/workbench/TitleBar.vue` - New title-bar component (249 lines)
- `src/web/components/workbench/StatusBar.vue` - New status-bar component (106 lines)
- `src/web/styles.css` - Revalued 7 geometry tokens, added 5 new tokens, retuned `.tree-row`, removed dead breakpoints
- `scripts/css-token-contract.mjs` - Registered 5 new tokens in `CANONICAL_TOKENS`, alphabetically inserted
- `src/web/components/ui/UiIcon.vue` - Added `sidebar`/`panel` icon glyphs

## Decisions Made

See `key-decisions` in frontmatter.

## Deviations from Plan

None - plan executed exactly as written. (Minor note: the plan's Task 1 action mentioned removing an "Approved continuity" comment on both `--tree-indent` and `--radius-control`; only `--tree-indent` actually had such a comment in the current file — `--radius-control` had none to remove. No comment was fabricated; this is a plan-text imprecision, not a deviation in the applied change.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `verify:semantic-css` passes with zero missing/extra/unconsumed tokens; `typecheck:web` passes
- `TitleBar.vue`/`StatusBar.vue` exist, type-check, and are ready for `App.vue` (20-07) to import and wire with real reactive props
- Remaining UI-SPEC new-token rows (`--view-header-height`, `--editor-title-height`, `--breadcrumb-height`, `--panel-height-*`, `--sidebar-width-*`) are intentionally deferred to the plans (20-04..20-06) that build their real consumers (`FileTree.vue` view header, `EditorTitle.vue`, `Breadcrumbs.vue`, `BottomPanel.vue`, `WorkbenchShell.vue`/`useSash`)
- No blockers

## Self-Check: PASSED

- `src/web/components/workbench/TitleBar.vue` — FOUND
- `src/web/components/workbench/StatusBar.vue` — FOUND
- `src/web/components/ui/UiIcon.vue` — FOUND (modified)
- `src/web/styles.css` — FOUND (modified)
- `scripts/css-token-contract.mjs` — FOUND (modified)
- Commit `7165406` — FOUND in `git log`
- Commit `ce77f4a` — FOUND in `git log`
- Commit `3474c8f` — FOUND in `git log`
- `npm run build:web && node scripts/verify-semantic-css.mjs` — PASSED
- `npm run typecheck:web` — PASSED

---
*Phase: 20-shell-frame*
*Completed: 2026-11-04*
