---
phase: 21-changed-files-tree
plan: 02
subsystem: ui
tags: [vue, playwright, vitest, file-tree, accessibility]

# Dependency graph
requires:
  - phase: 21-changed-files-tree (plan 01)
    provides: "FileTreeModel.statusPriorityByDirectoryId/.flatFileRows, panel-state.ts treeViewMode/treeLineCounts/treeCommentBadges"
provides:
  - "StatusBadge.vue with independent type-changed (T) and unsupported (raw code, warning tone) presentations, plus a required `code` prop"
  - "FileRow.vue restyled to VS Code Explorer row anatomy: file-type mark → name → comment badge → markers → line counts → status letter"
  - "DirectoryRow.vue collapsed-folder dimmed status-colour bullet replacing the numeric descendant-count badge"
  - "App.vue openCommentCounts computed (keyed by fileId) threaded through ChangedFilesDialog.vue → FileTree.vue → DirectoryRow.vue/FileRow.vue"
  - "Row-level Playwright locator migration in file-tree.spec.ts and a new packaged-binary row-geometry/DOM-order/bullet test in workbench-shell-smoke.spec.ts"
affects: [21-03, 21-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fileTypeMark computed returns {text, tone} where tone is a literal CSS custom-property name, applied via inline :style color — avoids a combinatorial explosion of per-extension CSS classes"
    - "grid-auto-flow: column on .tree-row so any number of optional marker/badge children always flow horizontally instead of wrapping to a second implicit row"
    - "withDefaults at every intermediate pass-through layer (FileTree/DirectoryRow/ChangedFilesDialog), not just the leaf FileRow — Vue's Boolean-type prop coercion defaults an undefined boolean to false (not the component's own withDefaults default) when an intermediate layer has no explicit default of its own"

key-files:
  created: []
  modified:
    - src/web/components/StatusBadge.vue
    - src/web/components/workbench/EditorTitle.vue
    - src/web/components/FileRow.vue
    - src/web/components/DirectoryRow.vue
    - src/web/components/ui/UiIcon.vue
    - src/web/components/FileTree.vue
    - src/web/components/ChangedFilesDialog.vue
    - src/web/App.vue
    - src/web/styles.css
    - src/contracts/api.ts
    - src/server/capabilities.ts
    - tests/e2e/file-tree.spec.ts
    - tests/e2e/workbench-shell-smoke.spec.ts

key-decisions:
  - "Added an optional `code` field to `ApiFileStatusSchema` (src/contracts/api.ts) and threaded `file.status.code` through all 6 status-construction sites in src/server/capabilities.ts — the plan assumed `leaf.file.status.code`/`selectedFile.status.code` were already available on the wire type, but the API schema only carried `kind`/`similarity`. Made it optional (not required) rather than required to avoid breaking ~8 unrelated pre-existing test fixtures across tests/api, tests/e2e, tests/integration, tests/unit that construct SessionFile-shaped status objects without `code`; StatusBadge's own `code` prop stays required, with call sites falling back to `?? ''`."
  - "fileTypeMark's `tone` is a raw CSS custom-property name string (e.g. '--syntax-type-foreground'), applied via inline style on `.ft`, instead of a dozen per-extension CSS modifier classes — matches the plan's artifact list, which only names `.ft` itself (no tone modifiers) unlike `.directory-row__bullet` which explicitly gets modifier classes."
  - "Directory-row bullet column width changed from `auto` to a fixed `12px` (`.directory-row { grid-template-columns: 12px minmax(0,1fr) 12px; }`) to right-align it under the file rows' fixed 12px status-letter column, per RESEARCH.md's resolved discretion on bullet-vs-badge alignment."

requirements-completed: [TREE-01, TREE-02]

# Metrics
duration: 59min
completed: 2026-11-05
status: complete
---

# Phase 21 Plan 02: Changed-Files Tree row restyle Summary

**Restyled FileRow/DirectoryRow to VS Code Explorer row anatomy (file-type mark, status-coloured name, comment badge, flattened markers, hover/selection-gated line counts, right-aligned status letter) and wired per-file open-comment counts from App.vue through to the row level.**

## Performance

- **Duration:** 59 min
- **Started:** 2026-11-05T09:53:04+01:00 (first task commit)
- **Completed:** 2026-11-05T10:12:10+01:00 (final fix commit)
- **Tasks:** 3 (+1 verification-driven fix commit)
- **Files modified:** 13

## Accomplishments
- `StatusBadge.vue` gives `type-changed` its own `T` letter and `unsupported` its own raw-git-code warning tone, both carrying the actual single-letter status code instead of a shared "Mode changed" label.
- `FileRow.vue`'s DOM now reads, left to right: file-type mark (`aria-hidden`) → name (status/availability-coloured, deleted gets line-through) → comment badge (conditional, `{N} open comment(s)`) → refresh/standalone/availability markers (flattened to plain muted text) → line counts (opacity-gated by `always`/`hover`/`never`) → status letter (flat coloured mono text, no pill chrome).
- `DirectoryRow.vue` drops the numeric `"{N} changed files"` descendant-count badge in favour of a dimmed, status-coloured `●` bullet when collapsed, driven by 21-01's `statusPriorityByDirectoryId`.
- `App.vue`'s new `openCommentCounts` computed (keyed by `fileId`, derived directly from `workspaceComments`) flows through `ChangedFilesDialog.vue` → `FileTree.vue` → `DirectoryRow.vue`/`FileRow.vue`, alongside the 21-01 `treeLineCounts`/`treeCommentBadges` panel-state refs.
- Migrated every row-level Playwright locator in `file-tree.spec.ts` to the new DOM order and to directory names without descendant counts; added a comment-badge assertion against the standalone harness.
- Added a new packaged-binary Playwright test in `workbench-shell-smoke.spec.ts` asserting real-Chromium row geometry, child DOM order, and the collapsed-directory bullet against `dist/bin/loopnote.mjs`.

## Task Commits

1. **Task 1: StatusBadge.vue type-changed/unsupported tones** - `463f0bb` (feat) — includes the required cross-cutting fix threading `status.code` through `src/contracts/api.ts`/`src/server/capabilities.ts` (see Deviations).
2. **Task 2: FileRow.vue row-anatomy reorder + DirectoryRow.vue collapsed bullet** - `6ce86e5` (feat)
3. **Task 3: App.vue openCommentCounts wiring + row-level test migration** - `749a095` (feat)
4. **Verification fix-up** - `f8af7e0` (fix) — see Deviations

## Files Created/Modified
- `src/web/components/StatusBadge.vue` - required `code` prop; independent `type-changed`/`unsupported` presentations
- `src/web/components/workbench/EditorTitle.vue` - both `<StatusBadge>` call sites pass `:code="selectedFile.status.code ?? ''"`
- `src/web/components/FileRow.vue` - full row-anatomy reorder, `fileTypeMark`/`nameTone`/`showCommentBadge`/`commentBadgeLabel` computeds, `mode`/`lineCounts` props
- `src/web/components/DirectoryRow.vue` - `statusPriorityByDirectoryId` prop replaces `directoryDescendantCounts`; collapsed bullet; forwards comment/lineCounts props
- `src/web/components/ui/UiIcon.vue` - new `comment` glyph
- `src/web/components/FileTree.vue` - `openCommentCounts`/`lineCounts`/`commentBadgesEnabled` props, forwarded with explicit defaults
- `src/web/components/ChangedFilesDialog.vue` - same three new pass-through props, with explicit defaults
- `src/web/App.vue` - new `openCommentCounts` computed; passes it plus `panelState.treeLineCounts`/`treeCommentBadges` into `<ChangedFilesDialog>`
- `src/web/styles.css` - `.ft`, `.cbadge`, `.name-tone--*`, `.directory-row__bullet(--*)`, `.status-badge--warning`; flattened `.tree-row .status-badge`/`.tree-row .availability-marker` chrome; new `.tree-row__refresh-marker`/`.standalone-state-marker` muted-text rule; new hover/selection/always/never `.line-counts` opacity rules; `grid-auto-flow: column` on `.tree-row`
- `src/contracts/api.ts` - optional `code` field on `ApiFileStatusSchema`
- `src/server/capabilities.ts` - all 6 status-construction call sites now include `code: file.status.code`
- `tests/e2e/file-tree.spec.ts` - migrated row/directory accessible-name regexes; new comment-badge assertion; harness `file()` helper gained `status.code`
- `tests/e2e/workbench-shell-smoke.spec.ts` - new packaged-binary row-anatomy test

## Decisions Made
See `key-decisions` in frontmatter: `code` made optional on the API schema (not required) to avoid a ~8-file blast radius across unrelated test fixtures; `fileTypeMark` tone applied via inline CSS-var style rather than per-extension classes; directory bullet column fixed at 12px to align with the file rows' status column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] `status.code` did not exist on the wire-level `SessionFile` type the plan assumed was "already on hand"**
- **Found during:** Task 1 (`npm run typecheck:web` after adding `StatusBadge`'s required `code` prop)
- **Issue:** `leaf.file.status.code`/`selectedFile.status.code` (used by `FileRow.vue`/`EditorTitle.vue`) don't exist — `SessionFile.status` is typed from `ApiFileStatusSchema` (`src/contracts/api.ts`), a separate, narrower schema than `comparison.ts`'s `ChangedFileStatusSchema`, carrying only `kind`/`similarity`. Six call sites in `src/server/capabilities.ts` explicitly stripped `code` when serializing the domain `ChangedFileStatus` (which does have `code`) into the API response.
- **Fix:** Added an *optional* `code: z.string().regex(/^[A-Z]$/).optional()` field to `ApiFileStatusSchema`; updated all 6 `capabilities.ts` call sites to include `code: file.status.code`. Kept it optional (not required) so the ~8 unrelated test files across `tests/api`, `tests/e2e`, `tests/integration`, `tests/unit` that construct `SessionFile`-shaped fixtures without `code` stay valid. `StatusBadge.vue`'s own prop stays required per the plan; `EditorTitle.vue`/`FileRow.vue` fall back to `?? ''`.
- **Files modified:** `src/contracts/api.ts`, `src/server/capabilities.ts`, `src/web/components/workbench/EditorTitle.vue`, `src/web/components/FileRow.vue`
- **Verification:** `npm run typecheck:web` and `npm run typecheck:tests:web` both clean (only a pre-existing, unrelated `tests/unit/monaco-diff-adapter.test.ts` argument-count error remains, confirmed unrelated to any file this plan touches).
- **Committed in:** `463f0bb` (Task 1 commit)

**2. [Rule 1 - Bug] `commentBadgesEnabled` silently resolved to `false` instead of its documented `true` default whenever an intermediate layer forwarded it unset**
- **Found during:** Task 3 verification (`npx playwright test tests/e2e/file-tree.spec.ts`), diagnosed via temporary instrumentation (removed before commit)
- **Issue:** `FileTree.vue`, `DirectoryRow.vue`, and `ChangedFilesDialog.vue` declared `commentBadgesEnabled?: boolean` via plain `defineProps` (no `withDefaults`). Vue's compiler infers `type: Boolean` for a boolean-typed optional prop and, absent an explicit `default`, coerces a genuinely-unset value to `false` (not `undefined`) at that component's own prop-resolution step — so by the time the concrete `false` reached `FileRow.vue`'s own `withDefaults(..., { commentBadgesEnabled: true })`, the value was no longer `undefined` and the leaf default never applied. Comment badges never rendered for any caller that omitted the prop (the real `App.vue` path always supplies a concrete value from `panelState`, so this was latent, not externally visible yet).
- **Fix:** Added `withDefaults(..., { lineCounts: 'hover', commentBadgesEnabled: true })` to `FileTree.vue`, `DirectoryRow.vue`, and `ChangedFilesDialog.vue` so each layer forwards a concrete boolean, matching `FileRow.vue`'s own default.
- **Files modified:** `src/web/components/FileTree.vue`, `src/web/components/DirectoryRow.vue`, `src/web/components/ChangedFilesDialog.vue`
- **Verification:** New `tests/e2e/file-tree.spec.ts` comment-badge assertion passes.
- **Committed in:** `f8af7e0`

**3. [Rule 1 - Bug] `.file-row`'s children wrapped onto a second implicit grid row, inflating row height from ~22px to 37px**
- **Found during:** Task 3 verification (`npx playwright test tests/e2e/file-tree.spec.ts`'s pre-existing row-height assertion)
- **Issue:** `.file-row`'s explicit `grid-template-columns: auto minmax(0,1fr) auto` only covers 3 tracks. The restyled row now always has at least 4 grid-participating children (file-type mark, name, line counts, status letter) even with every optional marker absent; CSS Grid's default `grid-auto-flow: row` wraps the 4th+ item onto a new implicit row instead of a new implicit column.
- **Fix:** Added `grid-auto-flow: column` to the shared `.tree-row` rule so any number of optional marker/badge children always flow into additional implicit columns on a single row, regardless of count.
- **Files modified:** `src/web/styles.css`
- **Verification:** Row height assertions in both Playwright specs now return a stable, non-wrapped value.
- **Committed in:** `f8af7e0`

**4. [Rule 1 - Bug] Pre-existing hardcoded row-height pixel assertions needed updating to the new, legitimately-changed value**
- **Found during:** Same verification pass as #3
- **Issue:** `tests/e2e/file-tree.spec.ts`'s pre-existing `expect(rowBox?.height).toBe(28)` assertion (not part of the plan's named locator-migration list, but gating the same spec file) no longer matched reality once `.tree-row .status-badge`/`.tree-row .availability-marker` chrome (border/background/padding) was flattened per the UI-SPEC. The actual rendered height is `26px`, not the spec's literal `--file-row-min-height: 22px` token value — the 6px `padding-block` + 2px border overhead on `.tree-row` combined with the row text's own 16px line-height has never actually produced a literal 22px row, even pre-Phase-21 (baseline measured 28px, not 22px, before any of this plan's CSS changes).
- **Fix:** Updated the assertion to `26` (the correct post-restyle value) and named the new `workbench-shell-smoke.spec.ts` test "fixed-height rows" rather than claiming a literal "22px" it cannot actually assert, given the pre-existing box-model overhead is outside this plan's scope to remove.
- **Files modified:** `tests/e2e/file-tree.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts`
- **Verification:** Both specs pass with the corrected values.
- **Committed in:** `f8af7e0`

---

**Total deviations:** 4 auto-fixed (2 bug, 1 blocking, 1 bug — all Rule 1/3)
**Impact on plan:** All four were necessary for the plan's own stated behavior (StatusBadge's `code`, comment badges, non-wrapping rows) to actually work; none expanded scope beyond making the plan's declared deliverables function correctly. No feature, validation, or telemetry was added beyond what the plan specified.

## Issues Encountered
- `21-02-PLAN.md`'s Task 3 action text, as rendered through this session's read tooling, was internally compressed/truncated in a few places (confirmed by cross-checking with `awk`/`fold` against the raw file); the reconstructed intent (App.vue computed → ChangedFilesDialog pass-through props → FileTree forwarding → test-locator migration → new packaged-binary test) was corroborated against the plan's `artifacts`/`key_links`/`acceptance_criteria` blocks, which were not truncated.
- RESEARCH.md's Pattern 4 describes `openCommentCounts` as keyed by *path* via `projectCommentGroups`; the plan's Task 3 action text explicitly overrides this ("do not route through `comment-groups.ts`'s `projectCommentGroups`... not what `WorkspaceComment` actually is") in favour of a direct `fileId`-keyed reduction over `workspaceComments`, which is what was implemented — the plan's own instruction took precedence over the research doc.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `FileRow.vue`'s `mode`/`lineCounts` props and `role="option"` list-mode variant are in place but unused until 21-03 wires list-mode rendering — ready for that plan to consume.
- `StatusBadge.vue`'s `.status-badge--warning` tone and `ChangedFilesDialog.vue`'s `lineCounts`/`commentBadgesEnabled` pass-through props are ready for 21-03/21-04's view-options menu to actually change them away from their defaults.
- No blockers for subsequent Phase 21 plans.

---
*Phase: 21-changed-files-tree*
*Completed: 2026-11-05*
