---
phase: 15
slug: standalone-file-review
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-31
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, audit trail.

Retroactive audit covering all 8 plans (15-01 through 15-08). Every plan shipped a plan-time STRIDE threat register (`register_authored_at_plan_time: true`), so this audit verifies each declared mitigation against the implemented code rather than building a register from scratch. `.planning/config.json`'s `workflow.security_asvs_level` is `1`; `workflow.security_block_on` is `high` — all `OPEN_THREATS` below are treated as blockers regardless of severity, per this skill's stricter `block_on: open` instruction.

Also reviewed: all 8 `SUMMARY.md` files (no `## Threat Flags` sections exist in any — none were emitted during implementation) and `15-REVIEW-FIX.md`'s two iterations (CR-01, WR-01, WR-02, WR-03). All four fixes are correctness/robustness fixes (crash-on-vanished-file handling, dead-code removal, export-markdown wording) confined to files/branches already covered by the threat IDs below; none introduce new attacker-reachable surface.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLI `process.argv` positional paths → `resolveOneArgument`/`resolveStandaloneArguments` | First untrusted input the whole standalone pathway processes — traversal, absolute-outside, symlink-escape, unbounded globs |
| Resolution (point-in-time) → byte capture | A resolved file may be replaced/deleted/symlinked between `resolveStandaloneArguments` returning and the actual disk read (TOCTOU) |
| Draft/export JSON on disk → Zod parse | Every persisted or exported document is re-validated on read; a widened schema must not accept a malformed standalone document |
| Accepted draft (user comments) → exported JSON/Markdown | The export is the artifact a coding agent later trusts as ground truth; must never claim provenance mismatching what was reviewed |
| Server-provided `SessionResponse` → client rendering | The browser trusts `sourceKind`/`standaloneGitState` as server-provided; no client-side path/content decisions made |
| HTTP API (loopback-only, token-authenticated) → capability registry | Every capability call is already gated by `registerSessionSecurity`'s token/origin check (unchanged by this phase) |
| Export write → `.cumpa/exports/` managed directory | Must only ever write within the repository's managed exports root |
| `process.argv` → `launchStandaloneSession` process exit | A resolution failure must never leave a listening server or opened browser tab behind |
| Test harness → real packaged CLI subprocess | FILE-05's e2e spec spawns the shipped `dist/bin/cumpa.mjs`, proving the packaged artifact, not just unit-level behavior |

---

## Threat Verification

| Threat ID | Category | Disposition | Evidence | Status |
|-----------|----------|-------------|----------|--------|
| T-15-01 | Information Disclosure / Elevation of Privilege | mitigate | `resolveOneArgument` runs `git ls-files` with `cwd` pinned to the repo root and catches Git's own exit-128 "outside repository" fatal, rethrown as a clear error — `src/git/standalone-resolution.ts:85-95` | closed |
| T-15-02 | Information Disclosure | mitigate | `createStandaloneChangedFileInventory` calls `buildUntrackedChangedFile` (`standalone-resolution.ts:235-242`), which calls `lstatWorktreeLeaf`'s per-segment `lstat` walk classifying symlink leaves as `unsupported`/`symlink`, never traversing a symlinked directory — `src/git/worktree-inventory.ts:137-178,362-372` | closed |
| T-15-03 | Denial of Service | mitigate | `MAX_RAW_STANDALONE_ARGUMENTS` (256) checked before any Git call (`standalone-resolution.ts:146-150`); `MAX_RESOLVED_STANDALONE_FILES` (10,000) checked after resolution/dedup (`standalone-resolution.ts:181-185`) | closed |
| T-15-04 | Tampering | accept (here) / mitigate (downstream) | This module only resolves paths, never reads bytes. Downstream `captureWorktreeManifest`'s standalone branch feeds into the same `captureFileWithRetry` torn-capture retry and expected-vs-observed re-enumeration every other `sourceKind` uses — `src/server/worktree-snapshot.ts:267-278,299-376` (verified under T-15-09) | closed |
| T-15-05 | Information Disclosure | mitigate | `rejectReservedSegments` rejects any resolved path with a `.git`/`.cumpa` path segment, called on every match before it's added to the result set — `standalone-resolution.ts:127-138,176` | closed |
| T-15-06 | Tampering | mitigate | `UncommittedScopeSchema.superRefine` enforces `standaloneArguments` required iff `sourceKind === 'standalone'`, forbidden otherwise, symmetric both directions — `src/contracts/comparison.ts:171-184` | closed |
| T-15-07 | Repudiation | mitigate | Dedicated `STANDALONE_DOMAIN` buffer (`'cumpa-standalone-review-key-v1'`), distinct from `UNCOMMITTED_DOMAIN`, hashed first in `standaloneReviewKey` — `src/domain/comparison-key.ts:5-6,56-61` | closed |
| T-15-08 | Tampering | mitigate | `ReviewExportV4Schema.superRefine` re-derives and `safeParse`s a synthetic V1-shaped sub-document; a V4 document that would corrupt the common feedback shape fails parsing — `src/contracts/draft.ts:492-529` | closed |
| T-15-09 | Tampering | mitigate | Standalone branch of `inventoryForScope` feeds into the same `captureFileWithRetry`-wrapped read loop (not the `staged` object-backed branch) used by every other `sourceKind`; a file disappearing/changing between expected/observed enumeration is marked `'changed-during-capture'` — `src/server/worktree-snapshot.ts:261-289,299-376` | closed |
| T-15-10 | Information Disclosure | mitigate | `createStandaloneChangedFileInventory` → `buildUntrackedChangedFile` → `lstatWorktreeLeaf` re-runs at actual read time on both the `expected` (line 307) and `observed` (line 376) enumeration passes, independent of what resolution observed earlier | closed |
| T-15-11 | Denial of Service | mitigate | `WorktreeSnapshotManifestSchema.entries` capped at `MAX_SNAPSHOT_FILES` (10,000) via `.max()` (`worktree-snapshot.ts:30,73`); runtime guard `if (expected.length > MAX_SNAPSHOT_FILES) throw ...` applies to every `sourceKind` including standalone (`worktree-snapshot.ts:308`) | closed |
| T-15-12 | Spoofing / Tampering | mitigate | `buildReviewExportV4` throws `TypeError` unless the draft's own recorded `comparison.kind === 'uncommitted'`, `sourceKind === 'standalone'`, and `reviewKey` exactly match the scope being exported — `src/export/review-export.ts:234-242` | closed |
| T-15-13 | Tampering | mitigate | `parseCanonicalReviewExport`'s byte-for-byte canonical re-serialization check applies generically via `zodParseReviewExport`'s `schemaVersion === 4` dispatch to `ReviewExportV4Schema.parse` — `src/export/review-export.ts:271-291` | closed |
| T-15-14 | Information Disclosure | mitigate | `export-supported` is a client-only visibility flag; the actual capability is enforced server-side — `capabilities.exportReview === undefined` → `404` in `src/server/routes.ts:424`, and `createUncommittedCapabilityRegistry`'s returned object (`src/server/capabilities.ts:897-1149`) contains no `exportReview`/`revealExportDirectory` key at all | closed |
| T-15-15 | Tampering | accept | `standaloneGitState`/`reviewKey`/paths pass through `controlSafeDisplay` where interpolated (`src/web/components/IdentityHeader.vue:48-70`); the three new label strings themselves are static literals, not interpolated from untrusted input | closed |
| T-15-16 | Elevation of Privilege | mitigate | `createUncommittedCapabilityRegistry` throws for `sourceKind === 'standalone'` (`capabilities.ts:904`) and its returned object omits `exportReview`/`revealExportDirectory` entirely (verified: no match in lines 897-1149); only `createStandaloneCapabilityRegistry` (guarded to standalone-only at line 1157) exposes them — `routes.ts:424`'s 404-guard rejects export for other sourceKinds | closed |
| T-15-17 | Repudiation | mitigate | Standalone `exportReview` builds `fileDigests` from `snapshot.files()`/`snapshot.readContent(file.id)` — the same frozen snapshot object the browser itself reads from, never a second independently-resolved file list — `capabilities.ts:1394-1409` | closed |
| T-15-18 | Information Disclosure | mitigate | `ensureManagedExportsRoot`/`assertManagedExportsRoot` reused verbatim from `export-store.js`, same calls used by the already-audited exact-patch registry path (`capabilities.ts:499-500,514,518` vs. standalone `capabilities.ts:1370,1373,1375`) — no new directory-construction logic | closed |
| T-15-19 | Denial of Service / Information Disclosure | mitigate | `resolveStandaloneArguments` is awaited (`src/cli/run.ts:850`) before `createApp`/`app.listen`/`openBrowser` (lines 883,892,919) are reached; any thrown error is caught at lines 932-943 and calls `shutdown.shutdown(1)` before returning — no partial server, no browser launch | closed |
| T-15-20 | Tampering | mitigate | `validateStandaloneExclusivity` (synchronous, throws) runs at `run.ts:1335`, before `launchStandaloneSession` is called at line 1341, mirroring `validateUncommittedFlags`'s placement at line 1346 | closed |
| T-15-21 | Repudiation | mitigate | `tests/e2e/standalone-review.spec.ts:298-305` independently recomputes `sha256` from bytes read directly off disk (`trackedBytes`/`untrackedBytes`) and compares against the exported `reviewJson.standalone.fileDigests`, rather than trusting the export's self-reported values | closed |
| T-15-22 | Elevation of Privilege / Information Disclosure | mitigate | `waitForRejectionWithoutLoopbackUrl` (`standalone-review.spec.ts:88-109`) asserts the generated CLI's combined stdout/stderr never matches `loopbackUrlPattern` while waiting for exit; used by all six FILE-04 negative tests (nonexistent path, ignored path, `--worktree` exclusivity, `../` traversal, absolute-path-outside, symlink-escape) — lines 318,334,348,369,386,415 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-15-01 | T-15-04 | `resolveStandaloneArguments`/`classifyStandaloneGitState` resolve paths only, never read bytes; the TOCTOU window itself is accepted here because the read-time mitigation (torn-capture retry + re-run symlink guard) lives downstream in Plan 15-03's `captureWorktreeManifest`, verified under T-15-09/T-15-10. | Phase 15 plan authors | 2026-10-31 |
| AR-15-02 | T-15-15 | `standaloneGitState`/`reviewKey`/file-path values are server-computed and already pass through `controlSafeDisplay` where interpolated; the three new Plan 15-05 label strings are static literals, not interpolated from untrusted input — no new XSS surface. | Phase 15 plan authors | 2026-10-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. No `SUMMARY.md` across the 8 plans contains a `## Threat Flags` section (grepped all 8; zero matches). The four post-plan fixes in `15-REVIEW-FIX.md` (CR-01, WR-01, WR-02, WR-03) are all correctness/robustness fixes confined to code paths already covered by the threat IDs above (vanished-file race handling under T-15-04/T-15-09; dead-branch removal under T-15-16's scope guard; export-markdown wording, no new data flow) — none introduce attacker-reachable surface requiring a new threat ID. No new third-party dependency was introduced by this phase (`package.json` unchanged across all 8 plans' commits), so no supply-chain threat entries were expected or needed.

---

## Sign-Off

- [x] All 22 threats (T-15-01 through T-15-22) disposed (mitigate / accept) and verified against current code
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-31
