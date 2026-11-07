---
phase: 25-accessibility-design-docs-regression-sweep
plan: 06
subsystem: testing
tags: [typescript, typecheck, vitest, gap-closure]

requires: []
provides:
  - "npm run typecheck:tests at 0 errors"
affects: [milestone-v2.1-closeout, A11Y-03]

tech-stack:
  added: []
  patterns:
    - "A test file importing a .vue component belongs in tsconfig.web.test.json's include list (vue-tsc), never tsconfig.test.json's exclude-by-name list (plain tsc) — the Phase 19 split"

key-files:
  created: []
  modified:
    - tsconfig.test.json
    - tsconfig.web.test.json
    - tests/unit/identity-pill.test.ts
    - tests/unit/monaco-diff-adapter.test.ts
---

# Phase 25 Gap 06: typecheck:tests split

**Summary:** Moved `comment-thread.test.ts`, `identity-pill.test.ts`, and `status-bar.test.ts` from `tsconfig.test.json`'s plain-tsc exclude list to `tsconfig.web.test.json`'s vue-tsc include list; fixed `identity-pill.test.ts`'s missing `.js` extension; and typed `monaco-diff-adapter.test.ts`'s `addAction` mock against `monaco.editor.IActionDescriptor` (matching how production always calls it) so its inferred call signature stops disagreeing with the test's own assertion type — a second, previously-masked error the first fix exposed once `typecheck:tests:node && typecheck:tests:web`'s short-circuit stopped hiding the `:web` half.

## Root Cause

`tsconfig.test.json` globs `tests/unit/**/*.ts` and relies on a hand-maintained exclude list to route `.vue`-importing files to the vue-tsc config instead. The 3 files Phase 25 added were never added to either list. `identity-pill.test.ts` separately omitted the explicit `.js` extension Node's ESM resolution (`moduleResolution: node16`) requires on a relative import. Because the npm script is `tsc ... && vue-tsc ...`, the plain-tsc failure prevented vue-tsc from ever running, so `monaco-diff-adapter.test.ts`'s own pre-existing type error (a `vi.fn(() => disposable())` mock inferred as zero-argument, disagreeing with a later `.mock.calls.map((call: [{...}]) => ...)` annotation) was silently never checked.

## Evidence

- `npm run typecheck:tests` → 0 errors (was 4, then surfaced 1 more after the first fix, now 0).
- `npx vitest run --no-file-parallelism tests/unit/comment-thread.test.ts tests/unit/identity-pill.test.ts tests/unit/status-bar.test.ts tests/unit/monaco-diff-adapter.test.ts` → 4 files, 62 tests, all passed (behavior unchanged by the type-only mock fix).
- Full `npx vitest run --no-file-parallelism` → 91 files, 979 tests, 0 failed.
- Full `npx playwright test` → 155/155 passed (monaco-diff-adapter's mock typing has no runtime effect).

## Known Stubs

None.

## Threat Flags

None — test-config and test-file-only changes; no production source touched.

---
*Phase: 25-accessibility-design-docs-regression-sweep*
