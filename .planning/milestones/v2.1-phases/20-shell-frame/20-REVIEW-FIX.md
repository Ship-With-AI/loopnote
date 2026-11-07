---
phase: 20-shell-frame
fixed_at: 2026-11-05T00:40:00Z
review_path: .planning/phases/20-shell-frame/20-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-11-05T00:40:00Z
**Source review:** .planning/phases/20-shell-frame/20-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 1
- Fixed: 1
- Skipped: 0

This is the final auto-fix iteration (3-iteration cap). Only the single Warning (`WR-01`) was in scope per `fix_scope: critical_warning`; all 9 Info findings were intentionally skipped per the orchestrator's final-iteration instruction and remain as documented follow-up work for a future phase/manual pass.

## Fixed Issues

### WR-01: Clamp the side-bar sash to the same ceiling the layout enforces

**Files modified:** `src/web/components/workbench/WorkbenchShell.vue`
**Commit:** `9bfb2d9`
**Applied fix:** Replaced both `useSash` calls' static `max: 520` with a live getter (`get max() { return sidebarCeiling.value; }` / `panelCeiling.value`), re-read on every `pointermove` with no change needed to `useSash.ts` itself. Added `sidebarCeiling`/`panelCeiling` `shallowRef`s plus a `syncCeilings()` function, wired through `onMounted`/`window.addEventListener('resize', …)`/`onUnmounted`, that derives:
- the side-bar ceiling from `window.innerWidth - EDITOR_WIDTH_FLOOR` (480px), mirroring the CSS `calc(100vw - 480px)` term the layout previously enforced independently, clamped to `[170, 520]`;
- the panel ceiling from `window.innerHeight` minus the live `--titlebar-height`/`--statusbar-height` custom-property values (read via `getComputedStyle` on a new `shellRoot` template ref, so the 32/22px → 44/44px narrow-breakpoint step in `styles.css` is honored automatically rather than duplicated as magic numbers), clamped to `[120, 520]`.

Both ceilings also actively re-clamp the live `sidebarWidth`/`panelHeight` values on every resize, so a value committed at a wider/taller viewport can't silently sit stale and out-of-bounds after the window shrinks. `:aria-valuemax` on both sash elements is now bound to the same live ceiling refs instead of the static `"520"` string literals, so the ARIA-reported range always matches what the sash can actually reach. `clampedSidebarWidth` (feeding the grid column track) no longer re-derives its own ceiling via a second CSS `min()`/`calc()` expression — it reuses `sidebarCeiling` directly, since the sash already clamped `sidebarWidth` to it. The now-redundant `calc(100vw - 480px)` term was removed from `.workbench-shell__sidebar`'s `max-width` in the scoped `<style>` block, leaving `var(--sidebar-width-max)` as a static backstop only (the JS-side live ceiling is the single source of truth, not two independent clamps that could disagree). The panel's `.workbench-shell__panel { max-height: var(--panel-height-max) }` had no viewport term to begin with (that was half of the original bug) and is now likewise just a static backstop behind the live JS clamp.

**Verification:**
- Tier 1: Re-read the full modified file; template bindings, script logic, and the trimmed CSS rule are intact and consistent with each other.
- Tier 2: `npx vue-tsc --project tsconfig.web.json --noEmit` — zero errors. `npx vue-tsc --project tsconfig.web.test.json --noEmit` — 29 pre-existing `TS2554` errors in `tests/unit/monaco-diff-adapter.test.ts` (unrelated file, confirmed present identically on `main` before this fix via the same command run against the main checkout); zero errors referencing `WorkbenchShell.vue` or `useSash.ts`.

## Skipped Issues

All 9 Info findings (`IN-01` through `IN-09`) were out of scope for this final iteration per the orchestrator's instruction (`fix_scope: critical_warning`, explicit directive to skip all Info items on this final auto-pass) and were not attempted. They remain open as documented follow-up:

- `IN-01` — Delete the shell CSS orphaned by the workbench migration (`styles.css`)
- `IN-02` — Replace BottomPanel's leftover ReviewNotesDialog class hooks (`BottomPanel.vue:135,161`)
- `IN-03` — Delete the unused shell prop and exposed member (`TitleBar.vue:11`, `EditorTitle.vue:89,97`)
- `IN-04` — Derive the sash bounds from one source (`WorkbenchShell.vue`, `panel-state.ts`, `styles.css`)
- `IN-05` — Reconcile the sash's separator semantics with its keyboard reachability (`WorkbenchShell.vue:10-16,26-32`)
- `IN-06` — Pluralise the status-bar comment count (`StatusBar.vue:44`)
- `IN-07` — Remove the non-existent `inventory` prop from the BottomPanel harnesses (`review-notes-dialog.spec.ts:19`, `agent-ready-export-safety.spec.ts:60`)
- `IN-08` — Close the fractional-width hole between the two chrome-row media queries (`StatusBar.vue:105`, `TitleBar.vue:230`)
- `IN-09` — Record the narrow-viewport chrome row heights in the UI spec (`styles.css:2365-2368`, `20-UI-SPEC.md`)

---

_Fixed: 2026-11-05T00:40:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
