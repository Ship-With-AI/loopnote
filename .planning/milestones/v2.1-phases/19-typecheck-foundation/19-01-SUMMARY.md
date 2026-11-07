---
phase: 19-typecheck-foundation
plan: 01
subsystem: infra
tags: [typescript, vue-tsc, npm-alias, build-tooling, tsconfig]

# Dependency graph
requires: []
provides:
  - "vue-tsc@3.3.14 installed and working via the Microsoft dual npm-alias scheme (typescript -> npm:@typescript/typescript6@6.0.2, @typescript/native -> npm:typescript@7.0.2)"
  - "tsconfig.web.json widened from a 7-file allowlist to a full-tree include glob (src/web/**/*.ts, src/web/**/*.vue) with vite/client types and shims-vue.d.ts excluded"
  - "typecheck:web / typecheck:tests:web scripts switched from tsc to vue-tsc; build:node still resolves the real native TypeScript 7 binary unchanged"
  - "Proof that build:node's dist/ output is byte-identical (SHA-256, 50/50 files) across the toolchain swap (TYPE-02)"
affects: [19-02-typecheck-foundation, 19-03-typecheck-foundation, 19-04-typecheck-foundation]

# Tech tracking
tech-stack:
  added: ["vue-tsc@3.3.14", "@typescript/typescript6@6.0.2 (aliased as typescript)", "typescript@7.0.2 (aliased as @typescript/native)"]
  patterns: ["Microsoft dual npm-alias TypeScript 6/7 toolchain split: devDependency name != real resolved package"]

key-files:
  created: []
  modified: ["package.json", "package-lock.json", "tsconfig.web.json"]

key-decisions:
  - "Task 1's checkpoint:human-verify (vue-tsc@3.3.14 package-legitimacy gate) was pre-approved by the user on 2026-11-04 in the orchestrating session, outside this delegated execution run; approval is recorded here per that authorization rather than via an interactive pause."
  - "Task 3's git-stash mechanism, as literally written in the plan, is a no-op once Task 2's changes are committed (task_commit_protocol commits each task immediately, leaving package.json/package-lock.json with zero uncommitted diff against HEAD by the time Task 3 runs, so `git stash push -- package.json package-lock.json` finds nothing to stash). Substituted `git checkout <parent-commit> -- package.json package-lock.json` / `git checkout HEAD -- package.json package-lock.json` for the stash push/pop pair - equivalent revert-and-restore semantics against a committed state, confirmed working (vue-tsc correctly read 3.3.7 during the 'before' build and 3.3.14 during the 'after' build)."

patterns-established:
  - "Pattern: when a plan task's verification step assumes uncommitted working-tree state from a prior task, but task_commit_protocol commits each task before moving to the next, substitute an equivalent git-checkout-based revert/restore against the commit history rather than git stash (which is a silent no-op on clean paths)."

requirements-completed: [TYPE-01, TYPE-02]

# Metrics
duration: 5min
completed: 2026-11-04
status: complete
---

# Phase 19 Plan 01: Toolchain Repair Summary

**Installed vue-tsc@3.3.14 behind the Microsoft dual npm-alias TypeScript 6/7 split, widened tsconfig.web.json from a 7-file allowlist to a full-tree include glob, and proved build:node's dist/ output is byte-identical (50/50 files, SHA-256) across the swap.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-04T16:01:52Z
- **Completed:** 2026-11-04T16:06:24Z
- **Tasks:** 3/3 (1 pre-approved checkpoint + 2 auto)
- **Files modified:** 3 (package.json, package-lock.json, tsconfig.web.json)

## Accomplishments
- `vue-tsc@3.3.14`, `typescript` (aliased to `npm:@typescript/typescript6@6.0.2`), and `@typescript/native` (aliased to `npm:typescript@7.0.2`) installed and resolving cleanly; `node_modules/.bin/tsc --version` confirms `Version 7.0.2`.
- `typecheck:web` and `typecheck:tests:web` scripts now invoke `vue-tsc --noEmit --project <config>`; `build:node`'s script string (`tsc --project tsconfig.json`) is byte-for-byte unchanged and still resolves the real native TS7 binary.
- `tsconfig.web.json` rewritten: `files` allowlist (7 paths) replaced with `include: ["src/web/**/*.ts", "src/web/**/*.vue"]`, `vite/client` added to `types` in the same edit, `src/web/shims-vue.d.ts` added to `exclude`.
- TYPE-02 proven: `build:node`'s `dist/` output hashed identically (50 files, SHA-256) between the pre-swap (`typescript@7.0.2` plain, `vue-tsc@3.3.7`) and post-swap (dual-alias, `vue-tsc@3.3.14`) toolchains.

## Task Commits

1. **Task 1: Confirm vue-tsc@3.3.14 package legitimacy before install** - *pre-approved, no commit* (checkpoint:human-verify, approval-only, no file changes)
2. **Task 2: Install the dual-alias TypeScript toolchain and migrate tsconfig.web.json to full-tree scope** - `4ebde97` (chore)
3. **Task 3: Prove build:node output is byte-identical across the toolchain swap (TYPE-02)** - *verification-only, no commit* (no files modified; `dist/` is gitignored)

**Plan metadata:** pending (this commit, see below)

## Files Created/Modified
- `package.json` - `vue-tsc` pinned to `3.3.14`; `typescript` aliased to `npm:@typescript/typescript6@6.0.2`; `@typescript/native` added, aliased to `npm:typescript@7.0.2`; `typecheck:web`/`typecheck:tests:web` scripts switched to `vue-tsc`
- `package-lock.json` - regenerated by `npm install` to resolve all three aliases (no hand-edits)
- `tsconfig.web.json` - `files` allowlist replaced with `include` globs, `vite/client` added to `types`, `exclude` added for `shims-vue.d.ts`

## Decisions Made
- Task 1's checkpoint was pre-approved by the user on 2026-11-04 in the orchestrating session (outside this delegated run). Per that authorization, approval is recorded here rather than via an interactive pause: RESEARCH.md's Package Legitimacy Audit finding (9,108,013 weekly downloads, long-established `github.com/vuejs/language-tools` source repo, empty `postinstall` script, exact package name `vue-tsc` with no typosquat concern) was read and confirmed to match the task's stated verdict before proceeding directly to Task 2. No package, lockfile, or config file was modified before this confirmation.
- `npm install -D vue-tsc@3.3.14` initially wrote `"vue-tsc": "^3.3.14"` (caret range) into `package.json`, which would have failed Task 2's acceptance criterion requiring the exact string `3.3.14`. Pinned to the exact version via `npm pkg set devDependencies.vue-tsc="3.3.14"` to match the project's existing exact-pin convention (no `.npmrc` with `save-exact` present; all sibling `devDependencies`/`dependencies` entries are already unprefixed exact versions).
- Task 3's `git stash` mechanism, as literally written, is a no-op once Task 2 is committed (see Deviations below) — substituted `git checkout <rev> -- package.json package-lock.json` for the stash push/pop pair, which achieves the identical proof against a committed working tree with no `git stash` risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned vue-tsc to an exact version instead of npm's default caret range**
- **Found during:** Task 2 (toolchain install)
- **Issue:** `npm install -D vue-tsc@3.3.14` wrote `"^3.3.14"` into `package.json` by default, which fails Task 2's acceptance criterion `p.devDependencies['vue-tsc']!=='3.3.14'` (strict equality) and breaks the project's existing exact-pin convention for all other dependencies.
- **Fix:** `npm pkg set devDependencies.vue-tsc="3.3.14"`, then re-ran `npm install` to keep the lockfile consistent.
- **Files modified:** package.json, package-lock.json
- **Verification:** `node -e "...p.devDependencies['vue-tsc']!=='3.3.14'..."` exits 0 (Task 2's literal acceptance check).
- **Committed in:** `4ebde97` (Task 2 commit)

**2. [Rule 3 - Blocking] Replaced Task 3's git-stash mechanism with an equivalent git-checkout revert/restore**
- **Found during:** Task 3 (byte-identical build proof)
- **Issue:** Task 3's `<action>`/`<verify>` literally call `git stash push --include-untracked -- package.json package-lock.json` to temporarily revert to the pre-swap toolchain, then `git stash pop` to restore it. This assumes Task 2's changes are still *uncommitted* in the working tree at the time Task 3 runs. Per `task_commit_protocol`, Task 2 was committed immediately after it completed (`4ebde97`), so by the time Task 3 ran, `package.json`/`package-lock.json` already matched `HEAD` exactly with zero uncommitted diff. Confirmed empirically: `git stash push -- package.json package-lock.json` printed `No local changes to save`, created no stash entry, and `require('./package.json').devDependencies['vue-tsc']` still read `3.3.14` (post-swap) immediately afterward — i.e. the literal command silently built the "before" hash set with the *post-swap* toolchain, invalidating the proof it was meant to produce.
- **Fix:** Discarded the invalid first-attempt hash files and substituted `git checkout 4ebde97~1 -- package.json package-lock.json` (revert to the pre-Task-2 commit's content, confirmed via `vue-tsc` reading back as `3.3.7`) for the "before" build, then `git checkout HEAD -- package.json package-lock.json` (confirmed `vue-tsc` back to `3.3.14`, `git status` clean against the three Task 1/2 files) for the "after" build. Same `rm -rf dist && npm ci && npm run build:node` + `shasum -a 256` hashing methodology as the plan specified, run against correctly-reverted/-restored toolchain states.
- **Files modified:** None (package.json/package-lock.json end in the identical Task-2-committed state; `dist/` is gitignored)
- **Verification:** Before-build `vue-tsc` read `3.3.7`; after-build `vue-tsc` read `3.3.14`; both hash listings contained 50/50 identical relative paths; `diff` between them was empty; final `git status --short -- package.json package-lock.json tsconfig.web.json` showed no diff against HEAD.
- **Committed in:** n/a (verification-only task, no files changed; the already-committed `4ebde97` state is unaffected)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues preventing the stated acceptance/verification criteria from passing as literally written)
**Impact on plan:** Both fixes were necessary to actually satisfy the plan's own acceptance criteria and verification intent (exact-version pin; a real, not silently-invalidated, byte-identical build proof). No scope creep — no additional files, dependencies, or behavior beyond what the plan specified.

## Issues Encountered
- `npx vue-tsc --version` does not print `3.3.14` as the plan's overall `<verification>` section anticipated — it prints `Version 6.0.3` (the resolved version of the aliased `typescript` package, `@typescript/typescript6@6.0.2`, which itself reports as `6.0.3`). Inspected `node_modules/vue-tsc/index.js` and `node_modules/vue-tsc/bin/vue-tsc.js` directly: `vue-tsc` 3.3.14 is a thin wrapper around `@volar/typescript`'s `runTsc()`, which has no custom `--version` handling at all and delegates argument parsing (including `--version`) straight through to the underlying real `tsc` binary it wraps. This is vue-tsc's actual, documented-in-source behavior (not something this plan's changes caused) — `vue-tsc --version` has never reported its own package version since it became a `runTsc`-based CLI wrapper. All of Task 2's *literal* acceptance criteria (package.json alias/version assertions, `tsconfig.web.json` shape assertions, `node_modules/.bin/tsc --version` reporting `Version 7.0.2`) pass exactly as written; only the plan-level `<verification>` section's informal expectation about `vue-tsc --version`'s output string does not match reality. Package identity/resolution is independently confirmed correct via `node_modules/vue-tsc/package.json` (`name: "vue-tsc", version: "3.3.14"`) and `package.json`'s `devDependencies.vue-tsc === "3.3.14"`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Toolchain and `tsconfig.web.json` scope are now in place for 19-02/19-03 to run `vue-tsc` against the widened `src/web/` tree and fix the resulting errors.
- 19-04 (CI-gate plan) can wire `npm run typecheck:web` into `repository-gates` now that the script invokes a working compiler.
- No blockers.

---
*Phase: 19-typecheck-foundation*
*Completed: 2026-11-04*

## Self-Check: PASSED
- FOUND: `.planning/phases/19-typecheck-foundation/19-01-SUMMARY.md`
- FOUND: `4ebde97` (Task 2 commit) in `git log --oneline --all`
