---
phase: 22-identity-status-bar
plan: 02
subsystem: ui
tags: [vue, title-bar, identity, drift-notices, accessibility, icons]

# Dependency graph
requires:
  - phase: 22-identity-status-bar/22-01
    provides: truncateMiddle domain helper (src/domain/truncate-middle.ts)
provides:
  - IdentityPill.vue (title-bar comparison pill, 8-way IdentityKind view-model)
  - IdentityPopover.vue (non-modal disclosure with Base/Head/Merge base/Snapshot/Worktree grid)
  - 6 new UiIcon.vue branches (compare, chevron, patch, commit, worktree, copy)
  - TitleBar.vue wired to IdentityPill, dead inline-identity markup/computeds removed
  - App.vue warning strip narrowed to the four unrelated notices; worktree-changed announcement watcher; 2px editor refresh progress bar
affects: [22-03 (StatusBar), 22-04 (e2e/integration locator fixes for this plan's markup changes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vue SFC dual <script>/<script setup> blocks: pure, unit-testable view-model functions (identityKind/identityDriftKind/identityCanRefresh/identityAccessibleName) live in a plain <script lang=\"ts\"> block and are imported by sibling components (IdentityPopover.vue imports from IdentityPill.vue) without a separate composables/ file"
    - "@vitejs/plugin-vue registered in vitest.config.ts so tests/unit/*.test.ts can import named exports straight out of a .vue SFC, avoiding a new @vue/test-utils dependency"

key-files:
  created:
    - src/web/components/workbench/IdentityPill.vue
    - src/web/components/workbench/IdentityPopover.vue
    - tests/unit/identity-pill.test.ts
  modified:
    - src/web/components/ui/UiIcon.vue
    - src/web/components/workbench/TitleBar.vue
    - src/web/components/workbench/WorkbenchShell.vue
    - src/web/App.vue
    - src/web/styles.css
    - vitest.config.ts
    - scripts/verify-semantic-css.mjs

key-decisions:
  - "Fixed a latent bug in the plan's literal driftKind formula: a bare `selectorDriftStatus?.base.kind !== 'unchanged'` check evaluates true when selectorDriftStatus is undefined, which is its permanent value for staged/unstaged/working-tree/standalone sessions (the server only ever registers /api/selector-drift for pinned sessions). Gated the check on `selectorDriftStatus !== undefined` first so uncommitted sessions never show a false selector-drift warning."
  - "Did not apply the 4-property truncation guard to .identity-pill-host itself (only to .identity-pill and its descendants): .identity-pill-host is also the popover's position:relative anchor, so overflow:hidden on it would clip the absolutely-positioned .identity-popover entirely."
  - "Shared the 8-way IdentityKind/driftKind/canRefresh/accessibleName derivation between IdentityPill.vue and IdentityPopover.vue via named exports from IdentityPill.vue's plain <script> block (imported by IdentityPopover.vue), instead of literally duplicating the ~15 lines as the UI-SPEC's 'Claude's Discretion' note allowed — avoids the one correctness-risk of two independently-maintained discriminant chains while still introducing no new composables/ file."
  - "Registered @vitejs/plugin-vue in vitest.config.ts (already a devDependency used by vite.config.ts) rather than adding @vue/test-utils, so Task 1's TDD test could exercise the real pure functions inside IdentityPill.vue without introducing new test infrastructure."
  - "Added .identity-popover to verify-semantic-css.mjs's overlay box-shadow allowlist, same precedent as .modal-dialog/.view-options-menu."
  - "Kept .header-facts and .dirty-badge CSS rules in styles.css (not dead): .header-facts is still consumed by src/web/prototypes/Phase6DiffSemanticsPrototype.vue; .dirty-badge is reused verbatim inside IdentityPopover.vue's Worktree row."

patterns-established:
  - "Drift-signal gating: any boolean/response prop whose server-side population is conditional on session kind must be explicitly checked for undefined before comparing its fields, never relied on via bare optional chaining against a sentinel value."

requirements-completed: [IDENT-01, IDENT-02, IDENT-03, IDENT-04]

# Metrics
duration: 95min
completed: 2026-11-05
status: complete
---

# Phase 22 Plan 02: Identity Pill & Popover Summary

**Replaced TitleBar.vue's Phase-20 interim plain-text identity block with IdentityPill.vue (8-way session-kind discriminant pill) and IdentityPopover.vue (Base/Head/Merge-base/Snapshot/Worktree disclosure), folding selector/patch/worktree drift into one pill warning signal and relocating their always-visible warning-strip notices into the popover.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 2 (Task 1 TDD: RED → GREEN; Task 2: auto)
- **Files modified:** 9 (2 created components + 1 created test + 6 modified)

## Accomplishments
- `IdentityPill.vue` renders the correct markup/text for all 8 `IdentityKind` variants (branch, worktree, range, exact-patch, staged, unstaged, working-tree, standalone), with `controlSafeDisplay` → `truncateMiddle` wrapping on every ref/label and an `aria-label` built from the full untruncated strings.
- `IdentityPopover.vue` is a non-modal `role="dialog"` disclosure (ModalDialog's `focusableSelector`/`containFocus` ported verbatim, no backdrop/`aria-modal`) with a key/value grid, per-drift-kind explanation (reusing `SelectorDriftNotice`/`InlineNotice` unchanged), a Copy-to-clipboard footer action, and a Refresh-or-guidance footer action.
- `TitleBar.vue` lost its 18 now-dead identity computeds and the `.session-header__comparison`/`.header-facts` markup; `attached-fact` and the icon-only Refresh button survive unchanged.
- `App.vue`'s `shell-warning-stack` no longer mounts the patch-drift `InlineNotice` or `SelectorDriftNotice` (both now popover-only); a new `hadWorktreeChanged` watcher announces "Working tree changed since snapshot." once per transition; a 2px `.editor-refresh-progress` bar renders over the editor while `refreshBusy`.
- Fixed a real false-positive bug in the plan's literal `driftKind` formula before it could ship (see Decisions).

## Task Commits

1. **Task 1 (TDD RED): failing test for identity pill view-model** - `530de7a` (test)
2. **Task 1 (TDD GREEN): IdentityPill.vue, IdentityPopover.vue, UiIcon.vue branches, styles.css** - `96adaec` (feat)
3. **Task 2: wire IdentityPill into TitleBar, relocate drift notices, add refresh progress** - `02455ab` (feat)
4. **Post-task fix: wrap exact-patch digest row in controlSafeDisplay** - `e34fe26` (fix)

No separate REFACTOR commit was needed — Task 1's GREEN implementation needed no cleanup pass.

## Files Created/Modified
- `src/web/components/workbench/IdentityPill.vue` (new, 283 lines) - 8-way IdentityKind/driftKind view-model (exported, unit-tested) + per-kind pill markup + popoverOpen toggle
- `src/web/components/workbench/IdentityPopover.vue` (new, 292 lines) - Base/Head/Merge-base/Snapshot/Worktree grid, drift explanation, Copy/Refresh footer, focus trap
- `tests/unit/identity-pill.test.ts` (new) - 17 tests covering identityKind/identityCanRefresh/identityDriftKind/identityAccessibleName
- `src/web/components/ui/UiIcon.vue` - added `compare`/`chevron`/`patch`/`commit`/`worktree`/`copy` icon branches
- `src/web/components/workbench/TitleBar.vue` - mounts `IdentityPill`; removed dead markup/computeds; icon-only Refresh button
- `src/web/components/workbench/WorkbenchShell.vue` - `.workbench-shell__editor` gets `position: relative`
- `src/web/App.vue` - `TitleBar` wiring gains `:selector-drift-status`/`:patch-drifted`; warning-strip `v-if` narrowed; `hadWorktreeChanged` watcher; `.editor-refresh-progress` bar
- `src/web/styles.css` - new `.identity-pill*`/`.identity-popover*`/`.ui-button--ghost`/`.editor-refresh-progress*` rules; removed dead `.session-header__comparison`/`.session-header__endpoint`/`.session-header__endpoint-label`/`.session-header__selector`/`.pin-cue` rules
- `vitest.config.ts` - registered `@vitejs/plugin-vue`
- `scripts/verify-semantic-css.mjs` - allowlisted `.identity-popover` for the existing overlay shadow pattern

## Decisions Made

- **driftKind false-positive fix (Rule 1 — bug):** The plan's literal formula `selectorDriftStatus?.base.kind !== 'unchanged' || selectorDriftStatus?.head.kind !== 'unchanged'` evaluates to `true` when `selectorDriftStatus` is `undefined`. Traced through `src/server/capabilities.ts`/`routes.ts`: the `/api/selector-drift` endpoint is registered only when a `selectorDriftObserver` capability exists, which only `createCapabilityRegistry` (pinned sessions) sets — `createUncommittedCapabilityRegistry`/`createStandaloneCapabilityRegistry`/`createExactPatchCapabilityRegistry` never do. So for staged/unstaged/working-tree/standalone sessions the client's `getSelectorDrift()` 404s forever and `selectorDriftStatus.value` never leaves `undefined` (confirmed in `src/web/model/selector-drift-state.ts`'s `.catch(() => undefined)`). Implemented `identityDriftKind` to check `selectorDriftStatus !== undefined` before comparing its fields, which fixes the false-positive while being behaviorally identical to the plan's formula whenever `selectorDriftStatus` actually is populated. Added an explicit regression test for this case.
- **`.identity-pill-host` truncation guard (Rule 1 — bug):** Task 1's action text named `.identity-pill-host` among the elements needing the `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;` guard. Applying `overflow: hidden` to that element would clip the absolutely-positioned `.identity-popover` (its own anchor/positioning parent), breaking the popover the same plan requires. Applied the full guard to `.identity-pill` (the button) and its descendant spans instead, and only `min-width: 0` (no overflow clipping) to `.identity-pill-host`.
- **Shared view-model via named exports, not duplication:** UI-SPEC's "Claude's Discretion" note permitted duplicating the ~15-line discriminant chain across `IdentityPill.vue`/`IdentityPopover.vue` rather than adding a composables/ file. Instead, exported the pure `identityKind`/`identityDriftKind`/`identityCanRefresh`/`IdentityKind`/`DriftKind` bindings from `IdentityPill.vue`'s plain `<script>` block and imported them into `IdentityPopover.vue`. No new file was added (satisfies the "no composables/ file" constraint) and the 8-way discriminant now has exactly one implementation to keep correct.
- **Vue SFC testing via `@vitejs/plugin-vue` in vitest, not `@vue/test-utils`:** The repo has no DOM-mounting test infrastructure for Vue components (no `@vue/test-utils`, no jsdom/happy-dom, `environment: 'node'`). To genuinely TDD Task 1's "behavior" bullets without introducing new test dependencies, registered the already-installed `@vitejs/plugin-vue` in `vitest.config.ts` so `tests/unit/identity-pill.test.ts` can import `IdentityPill.vue`'s named pure-function exports directly and call them as plain functions — no mounting, no new runtime surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `driftKind` false-positive on every uncommitted/standalone session**
- **Found during:** Task 1 (writing the TDD test for `identityDriftKind`)
- **Issue:** The plan's literal `driftKind` formula treats `selectorDriftStatus === undefined` as "selector drift present," which is the server's permanent state for staged/unstaged/working-tree/standalone sessions — every such session's pill would show a false warning border/dot forever.
- **Fix:** Gated the selector-drift branch of `identityDriftKind` on `selectorDriftStatus !== undefined` before reading its fields.
- **Files modified:** `src/web/components/workbench/IdentityPill.vue`
- **Verification:** `tests/unit/identity-pill.test.ts` asserts `identityDriftKind(false, undefined, false)` is `undefined` (regression guard), plus the existing-drift cases still resolve correctly.
- **Committed in:** `96adaec` (Task 1 commit)

**2. [Rule 1 - Bug] Did not apply `overflow: hidden` to `.identity-pill-host`**
- **Found during:** Task 1 (CSS authoring)
- **Issue:** Literally following the plan's text ("every text-bearing span, `.identity-pill-host`... MUST carry the exact 4-property truncation guard") would clip the popover, since `.identity-pill-host` is also the popover's `position: relative` anchor.
- **Fix:** Applied the full 4-property guard to `.identity-pill` and its descendant spans; `.identity-pill-host` only gets `position: relative; min-width: 0;`.
- **Files modified:** `src/web/styles.css`
- **Verification:** `npm run verify:semantic-css` passes; popover positioning logic (`position: absolute; top: 100%;` relative to the host) is unobstructed.
- **Committed in:** `96adaec` (Task 1 commit)

**3. [Rule 3 - Blocking] Registered `@vitejs/plugin-vue` in `vitest.config.ts`**
- **Found during:** Task 1 (RED test authoring)
- **Issue:** `tests/unit/identity-pill.test.ts` needs to import named exports from `IdentityPill.vue`; Vitest cannot transform `.vue` files without the Vue plugin registered, and the project has no other precedent for testing Vue component logic.
- **Fix:** Added `import vue from '@vitejs/plugin-vue'` and `vue()` to `vitest.config.ts`'s `plugins` array. The package was already a `devDependency` (used by `vite.config.ts`); no new install.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run --no-file-parallelism tests/unit` passes (40 files, 417 tests); no other `.test.ts` file imports `.vue`, so this is additive with zero effect on existing tests.
- **Committed in:** `530de7a` (RED test commit)

**4. [Rule 3 - Blocking] Allowlisted `.identity-popover` in `verify-semantic-css.mjs`**
- **Found during:** Task 1 (`npm run verify:semantic-css` first run)
- **Issue:** The script's `assertAuthorStyle` enforces an explicit allowlist for selectors using `box-shadow: var(--shadow-overlay)`; `.identity-popover` reuses that exact token (per UI-SPEC, matching `.modal-dialog`) but wasn't yet in the allowlist, so the gate failed.
- **Fix:** Added `.identity-popover` to the `overlayAllowlist` `Set`, same precedent as `.modal-dialog`/`.view-options-menu`.
- **Files modified:** `scripts/verify-semantic-css.mjs`
- **Verification:** `npm run verify:semantic-css` passes.
- **Committed in:** `96adaec` (Task 1 commit)

**5. [Rule 1 - Bug] Wrapped the exact-patch digest row in `controlSafeDisplay`**
- **Found during:** post-Task-2 threat-model self-check (T-22-04)
- **Issue:** The Patch digest popover row interpolated `patch.digest` directly, the one interpolated field in `IdentityPopover.vue` not passed through `controlSafeDisplay`, breaking the "every interpolated string is wrapped, never skipped" invariant the rest of the component follows (a no-op today since the digest is a validated sha256 hex string, but not unconditional).
- **Fix:** Changed `ddText: patch.digest` to `ddText: controlSafeDisplay(patch.digest)`.
- **Files modified:** `src/web/components/workbench/IdentityPopover.vue`
- **Verification:** `npm run typecheck:web` passes; unit suite unaffected (no test exercises this exact row's string value directly).
- **Committed in:** `e34fe26`

**6. [Rule 1 - Bug] Dropped `.pin-cue` from the shared badge-selector CSS list and the narrow-breakpoint `white-space: normal` rule**
- **Found during:** Task 2 (styles.css cleanup after removing `.pin-cue`'s only markup consumer in `TitleBar.vue`)
- **Issue:** `.pin-cue`'s markup (`TitleBar.vue`'s "Pinned comparison"/"Frozen snapshot"/"Frozen patch" span) is deleted with no replacement per the plan; leaving the CSS rule in place after its only consumer disappears is dead weight (clean-cutover contract).
- **Fix:** Removed `.pin-cue,` from the three selector lists it appeared in (`styles.css`'s shared badge block, the standalone `padding-inline` rule which was deleted entirely, and the `@media (max-width: 760px)` `white-space: normal` rule). Verified `.header-facts` and `.dirty-badge` are still consumed elsewhere (`Phase6DiffSemanticsPrototype.vue` and `IdentityPopover.vue` respectively) before leaving those rules in place.
- **Files modified:** `src/web/styles.css`
- **Verification:** `grep` confirmed no remaining `.pin-cue` references anywhere in `src/`; `npm run verify:semantic-css` passes.
- **Committed in:** `02455ab` (Task 2 commit)

---

**Total deviations:** 6 auto-fixed (4 Rule 1 bug fixes, 2 Rule 3 blocking-infra fixes).
**Impact:** All six were necessary for correctness (two were real false-positive/visual-breakage bugs in the plan's literal text, one was a threat-model-completeness gap, one was dead-CSS cleanup required by the plan's own clean-cutover contract) or to unblock the plan's own TDD/verification requirements (test infra, CSS allowlist). No scope creep — no feature, abstraction, or validation beyond what the plan specified was added.

## Issues Encountered

None beyond the deviations documented above. The plan's own line-number references (e.g. "TitleBar.vue lines ~107-148," "styles.css:1911-1919") were stale from before Phase 21; every edit in this plan was made against freshly-read, live file content located by class name/content rather than by the stale line numbers.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- `src/web/components/workbench/IdentityPill.vue` — FOUND (283 lines, ≥140 required)
- `src/web/components/workbench/IdentityPopover.vue` — FOUND (292 lines, ≥150 required)
- `530de7a`, `96adaec`, `02455ab`, `e34fe26` — all FOUND in `git log --oneline`
- `npm run typecheck:web` — 0 errors
- `npm run verify:semantic-css` — passes
- `npx vitest run --no-file-parallelism tests/unit` — 40 files / 417 tests passed, 0 failed (baseline 400 + 17 new identity-pill tests, no regressions)

## Next Phase Readiness

- Ready for plan `22-04` (wave 3, `depends_on: ["22-02"]`), which fixes the e2e/integration Playwright locators this plan's markup changes broke (`.session-header__comparison`, `Pinned comparison` text, `Dirty bytes ignored` title-bar visibility, and the Refresh button's now-icon-only content) — explicitly out of this plan's own verification scope per its `success_criteria`.
- `StatusBar.vue` (left snapshot/pinned-head item, comment counts, Export/Finish/Support items) is untouched by this plan and remains for plan `22-03`.

---
*Phase: 22-identity-status-bar*
*Completed: 2026-11-05*
