---
phase: 24
plan: 06
type: auto
status: complete
---

# 24-06 Summary: StatusBar openPanel tab-target emit

## Commits

| Commit | Description |
|--------|-------------|
| `175da0c` | feat(24-06): StatusBar openPanel emit carries tab target |

## What shipped

- `src/web/components/workbench/StatusBar.vue`'s `defineEmits<{ openPanel: []; support: []; }>()` narrowed the `openPanel` member to `openPanel: [tab: 'comments' | 'export'];` (inline union, not an import of `panel-state.ts`'s 3-value `PanelTab` — `StatusBar.vue` never targets `'summary'`).
- The comment-count button's `@click="emit('openPanel')"` (line 71) → `@click="emit('openPanel', 'comments')"`.
- The emphasized Export/Finish-review button's `@click="emit('openPanel')"` (line 79) → `@click="emit('openPanel', 'export')"`.
- No other line in the file changed: the `support` emit, label computeds (`openSegment`/`staleSegment`/`emphasizedLabel`/`emphasizedBusy`), props, markup, and `<style>` block are byte-identical to before this task — confirmed via `git diff`, which shows exactly the three lines above changed (two `+`/`-` pairs plus the emit type line).
- Reconciled against the real, current on-disk `StatusBar.vue` at execution time (not `22-03-PLAN.md`'s prose): Phase 22 shipped the plain parameterless `openPanel: []` signature on both buttons exactly as this plan's own cross-phase-conflict note anticipated as the "did not materialize" case — the Pitfall 2 conflict described in `24-RESEARCH.md` did not apply; the file was in the simple, expected pre-this-plan shape.
- `src/web/App.vue` was **not** touched, per this plan's scope (StatusBar.vue-only; downstream `openPanel(tab)` handler wiring is Plan 24-09's job). Its existing `@open-panel="openPanel"` binding to the parameterless `function openPanel(): void` still type-checks cleanly: Vue/TS function-parameter-count contravariance makes a zero-arg handler structurally assignable to a one-arg emit listener type (the handler is simply called with an argument it ignores), so there is no type error at all here — not even a "pre-existing mismatch to be fixed later." Plan 24-09 still needs to update the handler body to actually branch on `tab`, but that is a behavioral gap, not a type error.

## Deviations from Plan

None — plan executed exactly as written. Only the three lines specified in the plan's Task 1 were changed.

## Verification

- `npm run typecheck:web` — **0 errors**. (Includes `App.vue`'s now-structurally-compatible, still-parameterless `openPanel` handler; no mismatch surfaced because of parameter-count contravariance, as noted above.)
- `npm run verify:semantic-css` — **passed** ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."); no CSS touched by this plan.
- `npx vitest run --no-file-parallelism tests/unit` — **46 test files passed, 478 tests passed**, 0 failures.
- Playwright: grepped `tests/e2e` and `tests/integration` for `StatusBar`/`openPanel`. Only `tests/e2e/workbench-shell-smoke.spec.ts` matches — it reads `StatusBar.vue` line-number comments in a docblock and checks the comment-count/Export/Finish-review items' visibility, text, and `statusbar__item--emphasis` class, but opens the panel via a separate `Toggle panel (⌘J)` button (App.vue's own toggle), not by clicking `StatusBar.vue`'s comment-count/Export buttons — so it does not exercise the changed `@click` handlers at all. Ran it anyway: `npx playwright test tests/e2e/workbench-shell-smoke.spec.ts` — **8 passed**, 0 failures.
- Per this plan's own `<verification>` block, the packaged-binary Chromium proof that the comment-count item opens Comments and the Export item opens Export is **explicitly deferred to Plan 24-09/24-10** (App.vue's `openPanel` handler does not yet consume the tab argument). Not fabricated here.

## Self-Check: PASSED

- Truth 1 (`openPanel` becomes `openPanel: [tab: 'comments' | 'export']`; comment-count button passes `'comments'`; emphasized Export/Finish-review button passes `'export'`; reconciled against real on-disk shape, not Phase 22's plan doc) — re-verified directly against the file: emit type at lines 39–42, comment-count `@click` at line 71, emphasized-button `@click` at line 79, all confirmed.
- Truth 2 (no markup/visual change beyond the one literal argument per `@click`; labels, `aria-busy`, `disabled`, lifecycle label matrix untouched) — re-verified via `git diff`: exactly 3 changed lines (emit type signature + two `@click` arguments), nothing else.
- `typecheck:web`: 0 errors — confirmed for real, including App.vue's binding (contravariant-compatible, no error produced).
- `verify:semantic-css`: passed — confirmed for real.
- `vitest run --no-file-parallelism tests/unit`: 478/478 passed — confirmed for real.
- `workbench-shell-smoke.spec.ts` (only matching Playwright spec): 8/8 passed — confirmed for real; spec does not exercise the changed click handlers directly (uses the separate keyboard-toggle button), so this is a non-regression confirmation, not a tab-targeting proof — that proof is Plan 24-09/24-10's job per this plan's own verification block.
