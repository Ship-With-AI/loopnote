---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 07
subsystem: server
tags: [snapshot, git-diff, worktree, torn-read, index-race, refresh, zod]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "snapshot-fs.ts file-IO primitives (14-01), UncommittedScopeSchema/changed-during-capture availability reason (14-02), createWorktreeChangedFileInventory (14-04), resolveWorktreeSideContent + exported blobOid (14-05)"
provides:
  - "WorktreeSnapshotManifestSchema/WorktreeSnapshotEntrySchema/WorktreeSnapshotSideSchema — a sibling manifest version space to patch-snapshot.ts's SnapshotManifestSchema, adding per-entry captureStatus and a manifest-level chain"
  - "materializeWorktreeSnapshot(scope, options): Promise<WorktreeSnapshot> — single entry point for freezing a Staged/Unstaged/Working-tree session"
  - "WorktreeSnapshot class: files()/readContent()/session() read-back methods plus refresh() (freeze-then-observe-then-mutate, chain-append, path-keyed added/removed/modified delta)"
  - "Bracket-and-retry per-file torn-capture detection (3 attempts, 10ms delay) and a whole-capture index-identity race guard, both fixture/fault-injection verified"
affects: [14-08-session-wiring, uncommitted-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Freeze-then-observe-then-mutate: refresh() is WorktreeSnapshot's one capability PatchSnapshot never needed, re-capturing and appending to an immutable chain rather than replacing it"
    - "Content-addressed snapshot store (sha256-named files under content/) with write-if-absent dedup, so refresh() never needs to delete or overwrite a prior chain entry's bytes"
    - "Double-enumeration (expected set, then observed set after every per-file read) to detect file-set changes mid-capture without a generic file-watcher"

key-files:
  created: [src/server/worktree-snapshot.ts, tests/api/worktree-snapshot.test.ts]
  modified: []

key-decisions:
  - "Content capture is gated on file.availability.kind === 'text' (already computed by 14-04's inventory classification) rather than re-deriving text/binary status here — binary/unsupported/unavailable sides are recorded as exists:false placeholders with no bytes read, avoiding resolveWorktreeSideContent's precondition violation on binary diffs."
  - "Worktree-resident sides try resolveWorktreeSideContent first (CRLF-safe, per 14-05) and fall back to a raw boundedFileBytes read when it throws (untracked files, which git diff never reports, and mode-only changes with no hunk) — both paths run inside the same lstat-bracket retry loop."
  - "Synthetic blobOid(bytes, objectFormat) (14-05's exported helper) is used for worktree-resident side blobOid fields instead of the raw zeroOid git diff --raw reports for uncommitted content, per WTREE-04/D-21 — ChangedFile.newBlobOid itself is left untouched as the raw inventory value."
  - "WorktreeSnapshotManifestSchema's field order places entries before chain (not chain before entries) because zod's z.strictObject.parse() reorders output keys to schema-declaration order, and the manifest is built via `{...base, chain}` (base already ends in entries) — provenanceDigest must be computed from an object whose key order matches what a write-then-read-then-parse round trip reproduces, or the self-verification check fails permanently. Discovered and fixed during implementation (see Deviations)."
  - "refresh() takes zero parameters (acceptance criteria requires the literal 'async refresh()' signature, matching RESEARCH.md Pattern 3's code example exactly); runner/test-injection hooks are instead captured once on the WorktreeSnapshot instance at construction (materializeWorktreeSnapshot's 4th, optional dependencies argument) and reused by refresh()."
  - "A chain-entry digest (captureDigest) is kept distinct from the full-manifest provenanceDigest (manifestDigest): the chain-entry value must exclude the chain array itself (which wraps a sequence of these digests), while provenanceDigest covers the complete on-disk manifest including chain — conflating the two was the root cause of the digest-mismatch bug described above."

patterns-established:
  - "Snapshot manifest self-verification (write manifestDigest(withoutChainAndDigest-equivalent) at write time, recompute and compare at every read) requires the pre-parse object literal's key order to exactly match the zod schema's declared field order, since .parse() reorders output keys."

requirements-completed: [WTREE-05, SNAP-01, SNAP-02, SNAP-03, SNAP-04]

# Metrics
duration: 70min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 07: Uncommitted Source Review & Frozen Snapshots — Worktree Snapshot Capture Engine Summary

**`src/server/worktree-snapshot.ts` freezes Staged/Unstaged/Working-tree sessions into a content-addressed, chain-extendable snapshot with bracket-and-retry torn-file detection, an index-identity race guard, and a zero-argument `refresh()` that appends to the chain without ever touching a prior entry's content.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 2 (plan-level `type: tdd` gate — both tasks' behaviors land in a single RED/GREEN commit pair, per the same plan-level TDD precedent recorded in 14-04's summary)
- **Files modified:** 2 (both new)

## Accomplishments

- `WorktreeSnapshotManifestSchema`/`WorktreeSnapshotEntrySchema`/`WorktreeSnapshotSideSchema`: a new, independent manifest version space (not a widened `SnapshotManifestSchema`), mirroring `patch-snapshot.ts`'s discriminated-`exists` side shape and adding `captureStatus: 'captured' | 'changed-during-capture'` per entry and `chain: readonly string[]` (min length 1) at the manifest level.
- `captureFileWithRetry`: generic lstat-before/produce-bytes/lstat-after bracket with 3 total attempts (1 initial + 2 retries) and a 10ms fixed delay between attempts; returns `{ torn: true }` — never a partial/mixed buffer — if the file is still unstable after every attempt.
- `captureWorktreeManifest`: enumerates the expected file set once via `createWorktreeChangedFileInventory` (14-04), captures content only for `availability.kind === 'text'` entries (object-backed via `ObjectReader` for Staged/preimage sides with no retry risk; worktree-resident via `resolveWorktreeSideContent` with a raw-read fallback, both under the retry bracket), then re-enumerates (the "observed set") and forces any expected-but-now-missing file to `'changed-during-capture'` instead of silently dropping it from the manifest (D-10). A late-appearing file (present only in the observed set) is excluded from this snapshot entirely, by design (SNAP-01's "frozen at session start").
- `indexIdentity`/`captureWithIndexRaceGuard`: resolves the live index path via `git rev-parse --git-path index` (correct for linked worktrees), brackets the whole capture, retries once on mismatch, and surfaces a session-level `indexRaceNotice` distinct from any per-file `captureStatus` signal (D-11/D-12).
- `WorktreeSnapshot.refresh()`: re-captures via the same index-race-guarded path, appends the new capture's digest to the existing `chain` (never replacing or truncating it), writes any new content under the same content-addressed store (write-if-absent dedup — no delete call exists anywhere in `refresh()`), and returns a path-keyed `{ added, removed, modified }` delta plus the fresh `indexRaceNotice`.
- `materializeWorktreeSnapshot(scope, options)` is the single exported entry point; `WorktreeSnapshot` also exposes `files()`, `readContent(fileId)`, and `session()` for read-back, mirroring `PatchSnapshot`'s shape as a structural sibling.

## Task Commits

Plan-level TDD gate (both tasks' behaviors verified in one RED/GREEN cycle):

1. **RED: failing test for worktree snapshot capture engine** — `64bcb63` (test) — committed `tests/api/worktree-snapshot.test.ts` alone; confirmed it fails with "Cannot find module '../../src/server/worktree-snapshot.js'" before the implementation existed.
2. **GREEN: implement worktree snapshot capture engine** — `734486c` (feat) — committed `src/server/worktree-snapshot.ts`; confirmed all 15 tests pass and `npx tsc --noEmit --project tsconfig.json` exits 0.

No separate REFACTOR commit — style cleanup (inlining single-use helpers, `Promise.withResolvers()` instead of `new Promise`) was applied before the RED/GREEN split, so GREEN already reflects the final form.

## Files Created/Modified

- `src/server/worktree-snapshot.ts` — Frozen-snapshot capture engine: manifest/entry/side Zod schemas, `captureFileWithRetry`, `captureWorktreeManifest`, `indexIdentity`, `captureWithIndexRaceGuard`, `materializeWorktreeSnapshot`, and the `WorktreeSnapshot` class with `refresh()`.
- `tests/api/worktree-snapshot.test.ts` — 15 tests covering schema validation, torn-file retry (success and exhaustion), file-set-change mid-capture (disappeared and late-appearing files), the index-identity race guard (including a linked-worktree fixture), and `refresh()`'s chain-append/delta/retention behavior.

## Decisions Made

See `key-decisions` in frontmatter. The most significant: content capture is gated purely on `availability.kind === 'text'` (not re-derived here), worktree-resident bytes prefer `resolveWorktreeSideContent` with a raw-read fallback, synthetic `blobOid()` is used for worktree-resident side identity, the manifest schema's field order was fixed to match zod's output-reordering behavior so self-verification round-trips correctly, `refresh()` is a true zero-argument method with dependencies captured once at construction, and a chain-entry digest is kept distinct from the full-manifest `provenanceDigest`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Manifest self-verification failed permanently due to zod key-reordering vs. field order mismatch**
- **Found during:** Task 1/2 verification (first `materializeWorktreeSnapshot` call followed by `files()` threw `WorktreeSnapshotError: Frozen worktree snapshot is unavailable.`)
- **Issue:** `WorktreeSnapshotManifestSchema.parse()` returns an object with keys in schema-declaration order (verified empirically: zod's `z.strictObject` output key order follows the schema's field order, not the input's). The manifest was constructed as `{...base, chain: [...]}` where `base` (from `captureWorktreeManifest`) already ends in `entries`, so `chain` was appended *after* `entries` in the raw object — but the schema originally declared `chain` *before* `entries`. `provenanceDigest` was computed from the raw (entries-then-chain) object at write time, but `verifiedManifest()`'s read-time recomputation used the zod-parsed (chain-then-entries, per the original schema order) object, so the digests never matched — every snapshot was unreadable immediately after being written.
- **Fix:** Reordered the schema's declared fields to `entries` before `chain`, matching the natural `{...base, chain}` construction order, and added a distinct `captureDigest()` helper (chain-entry digest, excluding both `chain` and `provenanceDigest`) kept separate from `manifestDigest()` (full-manifest digest, excluding only `provenanceDigest`, used for the stored integrity check).
- **Files modified:** `src/server/worktree-snapshot.ts`
- **Verification:** Reproduced via a standalone script confirming the zod reordering behavior, then confirmed `materialized OK` / `files 1` after the fix; the full 15-test suite passes.
- **Committed in:** `734486c` (GREEN commit — the bug was caught and fixed before any commit landed).

**2. [Rule 1 - Bug] Style-rule violations: `new Promise` delay pattern and two single-use trivial wrapper functions**
- **Found during:** Implementation (harness style-rule reminders fired on the initial write)
- **Issue:** The retry-delay used `new Promise((resolve) => setTimeout(resolve, retryDelayMs))` (the project's `ts-promise-with-resolvers` rule prefers `Promise.withResolvers()`); a `diskPath()` helper and (initially suspected) an `entryKey()` helper were single-expression functions with too few call sites to justify the indirection per the `ts-no-tiny-functions` rule.
- **Fix:** Replaced the delay with `Promise.withResolvers<void>()` + `setTimeout`; inlined `diskPath()` at its one call site. `entryKey()` was re-checked and kept — it has 3 call sites (lockstep key-matching behavior across `diffManifestEntries`' two maps plus `entryDisplay`'s fallback), which meets the rule's own exception.
- **Files modified:** `src/server/worktree-snapshot.ts`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` exits 0; full test suite still passes after each change.
- **Committed in:** `734486c` (GREEN commit).

**3. [Rule 3 - Blocking] `async refresh()` acceptance criterion required a zero-argument signature, but refresh needs test-injectable dependencies**
- **Found during:** Task 2 acceptance-criteria verification (`grep -c "async refresh()"` returned 0 against an initial `refresh(dependencies = {})` signature)
- **Issue:** The plan's literal acceptance criterion and RESEARCH.md Pattern 3's code example both show `async refresh(): Promise<...>` with no parameters, but the fault-injection test hooks (`onFileReadAttempt`, `onBeforeIndexRecheck`, a test `runner`) needed a way to reach `refresh()`'s internal capture call.
- **Fix:** Added an optional 4th constructor parameter (`dependencies`, defaulting to `{}`) to `WorktreeSnapshot`, stored as a private instance field, and reused internally by `refresh()` (which now takes zero parameters, satisfying the literal grep). `materializeWorktreeSnapshot` passes its own `dependencies` argument through to the constructor so the same runner/hooks apply to both the initial capture and every subsequent refresh.
- **Files modified:** `src/server/worktree-snapshot.ts`
- **Verification:** `grep -c "async refresh()" src/server/worktree-snapshot.ts` returns `1`; index-race and torn-file tests that inject hooks via `materializeWorktreeSnapshot`'s dependencies argument pass.
- **Committed in:** `734486c` (GREEN commit).

---

**Total deviations:** 3 auto-fixed (1 correctness bug caught by the plan's own fixture-verification requirement, 1 style-rule compliance, 1 blocking signature reconciliation). None reduced scope or changed the delivered behavior described in the plan's `<behavior>`/`<must_haves>` blocks.
**Impact on plan:** All three were necessary to deliver a working, test-verified implementation matching the plan's literal acceptance criteria. No scope creep.

## Known Stubs

None — every path described in the plan's `<behavior>` blocks is wired to real git/filesystem I/O and fixture/fault-injection tested; no mocked data flows into any returned shape.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-14-07-01..04, T-14-07-SC) — no new network endpoints, auth paths, or trust-boundary-crossing file access was introduced beyond what the plan specified.

## Issues Encountered

- Two test fixtures initially referenced `src/changed.ts` as if it were already a tracked file from `createGitFixture()`'s default setup; it is only present with `anchoredReview: true` (a different fixture variant with different content). Fixed by explicitly writing, staging, and committing the file before treating its later edit as an "unstaged"/"worktree" change — a test-data bug, not an implementation defect, caught by the tests actually running against real git fixtures rather than mocks.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `materializeWorktreeSnapshot(scope, options)` and `WorktreeSnapshot` (with `refresh()`) are ready for 14-08's session wiring (`createUncommittedCapabilityRegistry` calling `materializeWorktreeSnapshot` once at session start and `snapshot.refresh()` from the `POST /api/refresh` handler).
- `WorktreeSnapshotManifestSchema`/`WorktreeSnapshotEntrySchema`/`WorktreeSnapshotSideSchema` are exported and available for any downstream module needing to read the manifest shape directly.
- No blockers for 14-08 or later Phase 14 plans.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

- `src/server/worktree-snapshot.ts` — FOUND
- `tests/api/worktree-snapshot.test.ts` — FOUND
- Commit `64bcb63` — FOUND in `git log --oneline`
- Commit `734486c` — FOUND in `git log --oneline`
- `npx vitest run tests/api/worktree-snapshot.test.ts` — 15/15 tests passed
- `npx tsc --noEmit --project tsconfig.json` — exits 0
- `grep -c "export const WorktreeSnapshotManifestSchema" src/server/worktree-snapshot.ts` → 1
- `grep -c "captureStatus" src/server/worktree-snapshot.ts` → 7 (≥3 required)
- `grep -c "maxAttempts = 3" src/server/worktree-snapshot.ts` → 1
- `grep -c "retryDelayMs = 10" src/server/worktree-snapshot.ts` → 1
- `grep -c "rev-parse', '--git-path', 'index'" src/server/worktree-snapshot.ts` → 1
- `grep -c "async refresh()" src/server/worktree-snapshot.ts` → 1
- `grep -c "indexRaceNotice" src/server/worktree-snapshot.ts` → 15 (≥4 required)
- `grep -c "rm(\|unlink(\|rmdir("` anywhere in the file → 0 (no selective or whole-root delete exists at all)
