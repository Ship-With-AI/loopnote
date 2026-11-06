---
phase: 25-accessibility-design-docs-regression-sweep
plan: 07
subsystem: testing
tags: [vitest, contracts, dependency-contract, gap-closure]

requires: []
provides:
  - "npx vitest run --no-file-parallelism at 0 failures (beyond the dist-build-presence-dependent v2.0-era set)"
affects: [milestone-v2.1-closeout, A11Y-03]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - tests/api/session.test.ts
    - scripts/verify-prerequisites.mjs
    - tests/package/runtime-package-contract.test.ts
---

# Phase 25 Gap 07: vitest session DTO + dependency contract regressions

**Summary:** Updated `session.test.ts`'s two stale fixtures to include the `status.code` field `ApiFileStatusSchema` deliberately declares and production always emits (production was correct; the test predated the field). Updated `scripts/verify-prerequisites.mjs`'s `approvedDependencies` allow-list to match package.json's actual Phase-19 pinned devDependencies (`@typescript/native`, `typescript` aliased to `@typescript/typescript6`, `vue-tsc@3.3.14`) — the allow-list was stale, not the manifest — and updated the 2 dependent `.toBe(18)` count assertions in `runtime-package-contract.test.ts` to `.toBe(19)` (the allow-list now has one more approved package).

## Root Cause

Two independent, unrelated staleness bugs: (1) `session.test.ts`'s fixtures were written before `status.code` existed in the DTO and never updated; (2) `verify-prerequisites.mjs`'s hardcoded allow-list was never updated when Phase 19 pinned `typescript`/`vue-tsc`/`@typescript/native` to their current aliased versions, so the real manifest's dependency set no longer matched the allow-list.

Also confirmed: the v2.0-era failing set (help/agent-ready-export-safety/version) observed at commit `0481bcc` is environment-dependent on `dist/` being built (those 3 test groups spawn the packaged `dist/bin/loopnote.mjs` CLI directly) — it is not present in this session because `dist/` was already built, and requires no code fix.

## Evidence

- `npx vitest run --no-file-parallelism tests/api/session.test.ts tests/package/runtime-package-contract.test.ts` → 2 files, 27 tests, all passed.
- Full `npx vitest run --no-file-parallelism` → 91 files, 979 tests, 0 failed.
- `ls dist/bin/` confirms `loopnote.mjs` exists in this session, explaining why `tests/cli/help.test.ts` and the "version" test pass without any code change.

## Known Stubs

None.

## Threat Flags

None. `verify-prerequisites.mjs` still rejects any unapproved/drifted direct dependency; this change only widens the allow-list to match the dependencies that were already installed and pinned in package.json/package-lock.json by Phase 19 — it does not loosen the drift check itself.

---
*Phase: 25-accessibility-design-docs-regression-sweep*
