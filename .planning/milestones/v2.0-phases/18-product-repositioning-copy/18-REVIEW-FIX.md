---
phase: 18-product-repositioning-copy
fixed_at: 2026-11-02T17:04:52Z
review_path: .planning/phases/18-product-repositioning-copy/18-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-11-02T17:04:52Z
**Source review:** .planning/phases/18-product-repositioning-copy/18-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (WR-01..WR-07; IN-01..IN-04 out of scope per fix_scope=critical_warning)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### WR-01: Give standalone sessions their own empty-state copy

**Files modified:** `src/web/App.vue`
**Commit:** `f5f35e0`
**Applied fix:** Verified `isStandaloneSession` sessions fell through to the generic uncommitted branch of `emptyFilesCopy`, whose heading interpolates `uncommittedSourceLabel.value` — which returns `''` for `sourceKind === 'standalone'` (the `switch` only handles `staged`/`unstaged`/`worktree`) — producing the literal string "No changes in .". Added a dedicated `isStandaloneSession.value` branch, checked before the generic uncommitted branch, returning a standalone-specific fact + next-action pair following D-10's pattern: heading `'No files in this standalone review.'`, message `'Restore the files, then Refresh.'` (standalone sessions do support Refresh per SNAP-01..05 / 18-COPY-DRAFT.md's "Uncommitted standalone reviews freeze snapshot … explicit Refresh re-reads current worktree").
**New user-facing copy — flagging for human sign-off:** the approved `18-COPY-DRAFT.md` empty-states table (`## Approval record`, "Uncommitted empty-state message") only resolved staged/unstaged/worktree wording; it never addressed the standalone case, so this heading/message pair is new copy, not previously drafted or approved. It is minimal, factual, and matches the voice/shape of the already-approved rows, but a human should confirm the exact wording.

### WR-02: Pass `repoName` through `controlSafeDisplay` before the tab title

**Files modified:** `src/web/App.vue`
**Commit:** `f5f35e0`
**Applied fix:** Confirmed `documentTitle` interpolated `session.value.repoName` raw while every other externally-derived string (branch/OID labels, dirty-source labels) is passed through `controlSafeDisplay` (already imported in this file at `src/web/App.vue:56`) before display. Rewrote `documentTitle` to build an array of segments — `RENAME_MAP.displayName`, `controlSafeDisplay(session.value.repoName ?? '')`, `sessionKindTitleSegment.value` — filter out empty segments, and `.join(' · ')`. This also closes IN-04 (empty title segment when `repoName` is absent) as a trivial side effect of the same `.filter(...)` call, per the task's IN-04-adjacent guidance.

### WR-03: Restore static `<title>` fallback in `index.html`

**Files modified:** `src/web/index.html`
**Commit:** `84c1055`
**Applied fix:** Confirmed `src/web/index.html` had no `<title>` element and no build-time injection (no title logic in `vite.config.ts`/build scripts), so a titleless document briefly shows the token-bearing review URL (`#token=<43 chars>`) in the tab/window title before `App.vue`'s `documentTitle` watcher runs post-mount. Re-added `<title>Loopnote</title>` (matching `RENAME_MAP.displayName`, confirmed via `src/domain/product-identity.ts:100`) to `src/web/index.html`'s `<head>`. The dynamic watcher (`watch(documentTitle, ..., { immediate: true })`, `src/web/App.vue:313-315`) still overwrites it on mount, so this only closes the pre-hydration exposure window; no behavior change once the app has mounted.
**Note (not acted on):** `.planning/phases/18-04-PLAN.md:116` records an automated verify step that expected `grep -c '<title>' src/web/index.html` to equal `0`; that expectation is now stale. No live test or CI check enforces it (confirmed via grep across `tests/`), so this is a historical planning artifact only — left unchanged, documented here for visibility rather than edited.

### WR-04: Stop hardcoding "vs HEAD" in the uncommitted title segment

**Files modified:** `src/web/App.vue`
**Commit:** `f5f35e0`
**Applied fix:** Confirmed `sessionKindTitleSegment` always appended literal `vs HEAD` for uncommitted sessions, but `--base <ref>` (validated in `src/cli/run.ts:455-473`, resolved in `src/cli/run.ts:689-699`) lets the comparison base be an arbitrary ref for `--staged`/`--worktree` sessions, and `baseCommitOid` is already present on the uncommitted session DTO (`src/contracts/api.ts:433`). Changed the uncommitted branch to read `uncommittedSession.value?.baseCommitOid` and render `vs HEAD` only when it is `undefined`, otherwise `vs ${controlSafeDisplay(baseOid.slice(0, 7))}` (mirroring the existing `singlePaneBaseOid`/`singlePaneHeadOid` short-OID + sanitize pattern already in this file).

### WR-05: Fix the `--base` example that the CLI silently ignores

**Files modified:** `docs/usage.md`
**Commit:** `faeb1ff`
**Applied fix:** Traced `validateUncommittedFlags`/`resolveUncommittedFlagSelection`/`runOrdinaryAction` (`src/cli/run.ts:438-497`, `:1500-1503`) and confirmed `loopnote --base release/2.0` alone resolves to no uncommitted selection and falls through to the interactive base/head picker, silently discarding `--base`. Confirmed `--staged --base <ref>` is a valid, accepted combination (not rejected by `validateUncommittedFlags`; only `--unstaged` + `--base` is rejected) and resolves the comparison base via `resolveUncommittedBaseCommitOid` (`src/cli/run.ts:686-701`). Replaced the broken standalone `loopnote --base release/2.0` example line with `loopnote --staged --base release/2.0`, a real, working invocation. CLI semantics were not changed — this is a documentation-only fix.

### WR-06: Correct the standalone-review description

**Files modified:** `docs/usage.md`
**Commit:** `cc6aad8`
**Applied fix:** Confirmed both halves of the original sentence were wrong for `--staged`/`--unstaged`/`--worktree`: (1) those flags review uncommitted changes against a base commit, not named paths, and `validateStandaloneExclusivity` (`src/cli/run.ts:476-497`) actively forbids combining them with positional paths; (2) their modified files render side-by-side, since single-pane rendering is scoped to `added`/`deleted`/`type-changed` status kinds only (`src/web/model/single-pane-layout.ts:7-28`), not every reviewed file. Also confirmed single-pane rendering *is* accurate for true standalone (positional-path) review specifically, because `buildUntrackedChangedFile` (`src/git/worktree-inventory.ts:362-402`) always assigns standalone files `status: 'A'` (added). Rewrote the paragraph to describe positional `[paths...]` arguments only, dropping the incorrect `--staged`/`--unstaged`/`--worktree` clause, per the review's suggested fix text.

### WR-07: Catch D-06's claim forms, not just full comma-separated phrases

**Files modified:** `tests/unit/product-copy-claims.test.ts`
**Commit:** `ed76d2d`
**Applied fix:** Confirmed `extractBannedPhrases` only yields whole comma-separated phrases from `PRODUCT.md` (e.g. `remote hosting`, `cloud synchronization`, `multi-user collaboration`) and that D-06's shorter named forms (`hosted`, `cloud sync`, `multi-user`, `multi-reviewer`) are not substrings of those phrases, so a paraphrase using D-06's forms would pass the guard undetected (verified by grep: none of these stems currently appear in the real `README.md`/`package.json`, so the existing assertions still pass). Added a `BANNED_CLAIM_STEMS` constant (`hosted`, `cloud sync`, `multi-user`, `multi-reviewer`, `approvals`) and wired stem checks into the existing README/npm-copy assertions. Added a `findBannedClaim` helper and a new self-test, `findBannedClaim catches D-06 paraphrases that the phrase-only check would miss`, that feeds four fixture sentences — each paraphrasing a non-capability using one of D-06's stems rather than PRODUCT.md's exact phrasing — through the detection helper and asserts each is caught, plus one clean-text fixture asserted *not* caught. Ran `npx vitest run tests/unit/product-copy-claims.test.ts`: 4/4 tests pass against the real repository files.

## Skipped Issues

None — all 7 in-scope findings were fixed.

## Final checks

- `npx tsc --noEmit -p tsconfig.json` — pass (no output/errors)
- `npm run typecheck:web` — pass
- `npm run typecheck:tests` (node + web) — pass
- `npm run build` — pass (`✓ built in 1.08s`, exit 0; pre-existing "chunks larger than 500 kB" advisory only)
- `npm test` (vitest, full suite) — 851/854 passed on first run; 3 failures were `Test timed out in 10000ms` in `tests/git/candidates.test.ts` (2) and `tests/package/runtime-producer.test.ts` (1) — exactly the known machine-load flakes called out in this task's constraints. Rerunning those two files alone: `npx vitest run tests/git/candidates.test.ts tests/package/runtime-producer.test.ts` → **27/27 passed.**
- `npx playwright test` (full suite, 113 tests, 1 worker) — **111/113 passed.** 2 failures, both pre-existing and named in this task's constraints: `tests/integration/selector-drift-ui.spec.ts:423` and `:441` ("exact patch resumed drafts announce frozen provenance without pinned wording" / "exact patch retry stays snapshot-only..."), both failing with a `ZodError` inside the spec's own `exactPatchSession()` test-fixture helper (`SessionResponseSchema.parse` rejecting a malformed fixture payload) — unrelated to any file this fix touched (`src/web/App.vue`, `src/web/index.html`, `docs/usage.md`, `tests/unit/product-copy-claims.test.ts`).

---

_Fixed: 2026-11-02T17:04:52Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_

## Orchestrator follow-up

- `9f565b2` (WR-04): `f5f35e0` fell back to `vs HEAD` when `baseCommitOid` is absent, which happens only for Unstaged (index vs working tree, no base). Unstaged now titles as `Unstaged`; Staged/Working tree show `vs <short base oid>` (always resolved, `src/cli/run.ts:688-702`), matching the identity header. D-09's example `Working tree vs HEAD` is no longer literally produced; the session payload carries no ref name, so the short oid is the accurate value.
- Needs human sign-off (new copy, not in the Approval record): standalone empty state `No files in this standalone review.` / `Restore the files, then Refresh.`; tab-title segment `<Source> vs <short oid>` / `Unstaged`.
- Checks after follow-up: `npm run typecheck:web`, `npm run build:web` pass; Playwright responsive-session, anchored-workspace, file-tree 16/16 (twice).
