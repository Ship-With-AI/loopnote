---
phase: quick
plan: 261031-au0
status: complete
subsystem: e2e-tests
tags: [playwright, monaco, single-pane, phase-13-regression]

# Dependency graph
requires: []
provides:
  - "tests/e2e/complete-review-draft.spec.ts's openGeneratedReview helper uses a status-agnostic editor-host selector, fixing the 8/8 failure introduced by Phase 13 single-pane rendering"
affects: [complete-review-draft-spec, e2e-regression-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "e2e helpers that assert 'an editor rendered' after page load must target .diff-workspace__editor (shared host div), not .monaco-diff-editor (diff-only); file-status-specific assertions belong after the test explicitly selects a file of known status"

key-files:
  created: []
  modified:
    - tests/e2e/complete-review-draft.spec.ts

key-decisions:
  - "D-1: root cause is a stale test assertion, not a product bug — Phase 13 D-05 deliberately renders added/deleted/type-changed files single-pane; the fixture's alphabetically-first file (src/added.ts, status added) is correctly single-pane, and the spec's openGeneratedReview wrongly assumed a diff editor on initial load."
  - "D-2: fixed by reusing the exact pattern already established in tests/e2e/anchored-review.spec.ts:134 (.diff-workspace__editor instead of .monaco-diff-editor) rather than inventing a new selector — same helper, same bug, same fix, now applied consistently across both spec files."
  - "D-3: left all 5 other .monaco-diff-editor locators in the file untouched — they only run after the test explicitly selects src/changed.ts (status modified), which Phase 13 D-05 keeps side-by-side, so .monaco-diff-editor is still correct there."
---

# Quick Task 261031-au0: Fix complete-review-draft e2e regression from Phase 13 single-pane rendering

## Root Cause

`tests/e2e/complete-review-draft.spec.ts` failed 8/8 against the packaged build.
Its `openGeneratedReview` helper ran `page.goto(url)` and then immediately
asserted `.monaco-diff-editor` was visible, before any file was explicitly
selected. All 8 tests use `createGitFixture({ anchoredReview: true })`, whose
changed-file set is `src/added.ts` (added), `src/changed.ts` (modified),
`src/deleted.ts` (deleted), and `src/new-name.ts` (renamed from
`src/old-name.ts`). The file tree's default selection is the alphabetically
first file, `src/added.ts`.

Since Phase 13 (`13-single-pane-file-rendering`), files with status `added`,
`deleted`, or `type-changed` render as a single full-width plain Monaco editor
(`.diff-workspace--single-pane`), not the two-pane `.monaco-diff-editor`
(`13-CONTEXT.md` D-05). `src/added.ts` is therefore correctly single-pane, and
`.monaco-diff-editor` legitimately does not exist on initial page load anymore.
This is a **pre-existing Phase 13 regression in the test**, already recorded
verbatim in `.planning/STATE.md`'s Blockers/Concerns (discovered during
14-14 Task 3's sanity check, left out of scope there) — not a Phase 14
regression and not a product bug.

Confirmed by running the failing spec before the fix: Playwright's error
context snapshot showed the tree with `src/added.ts` `[selected]` and labeled
`"Added, single pane"`, while the assertion waited on a `.monaco-diff-editor`
that was never rendered.

## Fix

In `openGeneratedReview` (`tests/e2e/complete-review-draft.spec.ts:149-155`),
changed the post-navigation assertion from

```ts
await expect(page.locator('.monaco-diff-editor')).toBeVisible();
```

to

```ts
await expect(page.locator('.diff-workspace__editor')).toBeVisible();
```

`.diff-workspace__editor` is the Monaco host `<div>` rendered by **both**
branches of `DiffWorkspace.vue` (single-pane `v-if` at line 387, side-by-side
`v-else` at line 418), so the assertion now proves the editor mounted and the
review loaded regardless of which file Phase 13 routes to which layout —
matching the helper's actual intent (confirm the review page loaded with an
editor and BASE/HEAD banner) rather than hard-coding a diff-specific element
that is only true for some file statuses.

This is the identical fix already present in `tests/e2e/anchored-review.spec.ts`'s
own copy of the same helper (`:134`), applied here to keep both specs
consistent. No other `.monaco-diff-editor` locator in the file changed: the 5
remaining uses (`activateMonacoLine` ×2 internal locators, `activateTopMonacoLine`
×1, and two direct assertions at lines ~830/~860) all run only after the test
explicitly clicks the `src/changed.ts` tree row, and `changed.ts` (status
`modified`) stays side-by-side per Phase 13 D-05 — `.monaco-diff-editor` is
still correct and present there.

## Test Results

| Command | Result |
|---|---|
| `npm run build:web` | succeeded |
| `npx playwright test tests/e2e/complete-review-draft.spec.ts --project=chromium` (before fix) | 1 failed, 7 did not run — `.monaco-diff-editor` timeout in `openGeneratedReview` |
| `npx playwright test tests/e2e/complete-review-draft.spec.ts --project=chromium` (after fix) | **8 passed (31.4s)** |
| `npx playwright test tests/e2e/anchored-review.spec.ts tests/e2e/pinned-session.spec.ts tests/e2e/responsive-session.spec.ts --project=chromium` | **18 passed (49.3s)** |
| `npx playwright test tests/e2e/uncommitted-review.spec.ts --project=chromium` (Phase 14 spec) | **5 passed (17.3s)** |
| `npx playwright test tests/integration/anchored-workspace.spec.ts --project=chromium` | **12 passed (21.1s)** |
| `npx tsc --noEmit --project tsconfig.web.test.json` (covers `tests/e2e/**`) | clean, no output |
| `npm run typecheck:web` | clean, no output |
| `npx tsc --noEmit --project tsconfig.test.json` | clean, no output |

`tests/e2e/anchored-workspace.spec.ts` does not exist; the matching file is
`tests/integration/anchored-workspace.spec.ts` (a mocked-server integration
spec, not a real-Git e2e spec). It already passed 12/12 before this change —
its default-selected file (`src/first.ts`) and its Phase 07 rename-status test
both resolve to side-by-side statuses, so it was never exposed to the Phase 13
single-pane regression.

## E2E Regression Set

This repository has no dedicated "regression set" config file: `playwright.config.ts`
uses `testMatch: '**/*.spec.ts'` with `testIgnore: custodyGatedSpecs` (the 4
custody-gated specs in `playwright.runtime-artifact.config.ts`), so every spec
under `tests/` — including `complete-review-draft.spec.ts` — is already part of
the default `npm run test:package` / `npm run test:browser` run and therefore
already in scope for phase verification by construction; it needed fixing, not
registration. The gap was that 14-14's verification pass treated this failure
as pre-existing/out-of-scope rather than closing it. Recorded explicitly here so
future phase verification (15+) treats `complete-review-draft.spec.ts` as a
must-pass spec, not a known-flaky exception: **any phase verification task that
runs a Playwright subset must include `tests/e2e/complete-review-draft.spec.ts`
in that subset (or run the full default `npm run test:package` config, which
already includes it).**

## Task Commits

1. **Task 1: Make openGeneratedReview's post-load assertion status-agnostic** —
   fixes the stale `.monaco-diff-editor` assertion in
   `tests/e2e/complete-review-draft.spec.ts`.

## Files Created/Modified

- `tests/e2e/complete-review-draft.spec.ts` — `openGeneratedReview` now asserts
  `.diff-workspace__editor` instead of `.monaco-diff-editor`; no other change.

## Decisions Made

See `key-decisions` in frontmatter (D-1..D-3).

## Deviations from Plan

None.

---
*Phase: quick*
*Completed: 2026-10-31*
