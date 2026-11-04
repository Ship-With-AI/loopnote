# Deferred Items — Phase 16

## tests/unit/token-contract.test.ts flaky timeout under full `npm run test:unit` run

- **Found during:** 16-03 post-task full `npm run test:unit` regression check.
- **Symptom:** `token contract > reloads the virtual token module after styles.css changes in a Vite dev server` times out (10000ms) when run as part of the full 287-test suite.
- **Scope:** Out of scope for 16-03 — this test spins up a real Vite dev server and asserts HMR behavior unrelated to anything 16-03 touches (RenderedMarkdownView.vue, rendered-markdown-blocks.ts, styles.css additions, its own test file).
- **Confirmed pre-existing/environmental:** re-run in isolation (`node scripts/run-focused-vitest.mjs tests/unit/token-contract.test.ts --grep "reloads the virtual token module"`) passes in 260ms. The timeout only occurs under full-suite resource contention (30 other test files running concurrently), not from any change in this plan.
- **Action:** Not fixed, per scope-boundary rule (only auto-fix issues directly caused by the current task's changes). No change made to `tests/unit/token-contract.test.ts` or its fixture helper.
