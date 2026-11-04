---
phase: 17
slug: agent-protocol-extension-marketplace-skill
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-31
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| stdin (coding agent) → `AgentReviewRequestSchema.safeParse` | Fully untrusted JSON: mode string, source string, base ref/OID string, pathspec/path strings, byte length. | Agent-controlled request document (17-01) |
| `buildReviewExportV5`/`buildReviewExportV6` input → canonical export bytes | Pure data-shape layer; no direct untrusted I/O, inputs already validated/typed by the capability-registry callers. | Accepted-draft + provenance data (17-02) |
| `attachedCompletion.finish` → canonical stdout delivery | Server-authoritative one-shot completion transaction; the agent cannot force a second or partial delivery. | Canonical export bytes (17-03) |
| Disk state at Finish time → `collectWorkingTreeDrift()` | Working tree can change between snapshot capture and Finish (another process or the agent itself editing files). | Filesystem stat/content state (17-03) |
| stdin agent-request JSON (`request.uncommitted.base`/`.pathspecs`, `request.files.paths`) → native Git execution and filesystem access | Untrusted paths/pathspecs/mode values/base refs cross into `git diff`/`git ls-files`/`git rev-parse` invocations and disk reads. | Agent-controlled path/pathspec strings (17-04) |
| Locally packed `cumpa@2.0.0` tarball → `npm install --global` into an isolated prefix | Never-published build output, installed only into a throwaway temp prefix, never the operator's real global npm prefix or any registry. | Local npm package bytes (17-05) |
| `check-cumpa.mjs`'s `spawnSync('cumpa', ...)` probe | Unchanged: shells out to whatever `cumpa` resolves on `PATH`, `shell: false`, bounded timeout/buffer. | CLI version string (17-05) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-17-01 | Tampering | `UncommittedRequestScopeSchema`/`FilesRequestScopeSchema` `pathspecs`/`paths` arrays | mitigate | `GitArgumentSchema` (src/contracts/request.ts:32-34) bounds every element; `MAX_PATHSPEC_COUNT`/`.min(1)` (request.ts:87-96, 117-125) bound array length before any Git call runs | closed |
| T-17-02 | Denial of Service | `readAgentReviewRequest`'s byte-capped streaming read | accept | `MAX_AGENT_REQUEST_BYTES` (1 MiB) enforcement pre-existing and unchanged (src/cli/request.ts:102-113); new modes share the same cap, no new DoS surface | closed |
| T-17-03 | Information Disclosure | `requestErrorMessages` for the five new kinds | mitigate | `unknown-mode`/`base-with-unstaged`/`path-outside-repository`/`pathspec-no-match`/`pathspec-ignored` (src/cli/request.ts:24-36) name only structural defects, never echo request body or filesystem paths | closed |
| T-17-04 | Repudiation | `freezeRequest`'s new branches | mitigate | `Object.freeze` on `pathspecs`/`paths` arrays (request.ts:44, 95, 123) plus `.readonly()` on both new scope schemas, matching the existing `revisions`/`patch` freeze discipline | closed |
| T-17-05 | Tampering | `ReviewExportV5Schema`/`V6Schema` `.strictObject` | mitigate | Both schemas use `.strictObject` (src/contracts/draft.ts:587-588, 627-628), matching every other `ReviewExportVN` schema | closed |
| T-17-06 | Repudiation | `buildReviewExportV5`/`V6`'s provenance check | mitigate | `TypeError('Uncommitted/Standalone export provenance does not match accepted draft.')` guards (src/export/review-export.ts:280-294, 324-338) mirror V3/V4's existing guard exactly | closed |
| T-17-07 | Tampering | `ReviewExportV4Schema` accidental mutation during this plan's work | mitigate | Committed Vitest snapshot regression test (`tests/unit/__snapshots__/review-export.test.ts.snap`) passes; `ReviewExportV4Schema`/`buildReviewExportV4` confirmed untouched by diff (17-VERIFICATION.md truth #5) | closed |
| T-17-08 | Tampering | Working tree edited between final snapshot and Finish | mitigate | `collectWorkingTreeDrift()` (src/server/capabilities.ts:1118-1142, 1476-1500) walks every changed path via `continue` (not `break`/early-return), always included as `workingTreeChangedAfterFinalSnapshot` in the delivered V5/V6 document; confirmed by direct code reading in 17-VERIFICATION.md truth #8 | closed |
| T-17-09 | Repudiation | Stale/orphaned comment anchors at Finish time | accept | Unchanged from already-shipped pinned/exact-patch behavior: `finish` short-circuits with `staleAnchors` (capabilities.ts:1154, 1512) exactly as the pre-existing registries already do | closed |
| T-17-10 | Elevation of Privilege | `requestPathspecs` threaded from an agent-controlled request into the delivered export's provenance field | mitigate | `options.requestPathspecs` (capabilities.ts:1162) flows only into `buildReviewExportV5`'s `pathspecs` provenance field, never into any `runner.run()`/git invocation — confirmed via full-repo grep for `requestPathspecs` usages (only capabilities.ts:181,1162 and cli/run.ts:1101,1119) | closed |
| T-17-11 | Tampering | `request.files.paths`/`request.uncommitted.pathspecs` crafted to look like a Git option | mitigate | Every reused Git invocation passes a literal `--` separator before pathspecs (`pathspecTail`, src/git/worktree-inventory.ts:408-411, used at lines 438,449,478,483,524,534,539) and `spawn('git', ..., { shell: false })` (src/git/runner.ts:148-157) | closed |
| T-17-12 | Information Disclosure | Path-outside-repository / symlink-escape detection in `files` mode | mitigate | Delegated to Git's exit-128 authority via `resolveOneArgument` (src/git/standalone-resolution.ts:91-106), surfaced as typed `StandaloneResolutionError('path-outside-repository', ...)` — Git remains the single source of truth for path semantics | closed |
| T-17-13 | Denial of Service | Oversized agent-triggered uncommitted/files requests, or pathological pathspec counts | mitigate | `MAX_AGENT_REQUEST_BYTES` (request.ts:110) and `MAX_PATHSPEC_COUNT`/`.min(1)` (request.ts, Plan 17-01) both reject oversized input before any Git call runs in the new dispatch branches (src/cli/run.ts:1190,1224) | closed |
| T-17-14 | Spoofing | `AgentRequestError` thrown from `mapStandaloneResolutionError`/`mapGitPathspecError` reaching the top-level catch | mitigate | Both adapters (src/cli/run.ts:1085-1097) only ever throw `AgentRequestError` for known kinds, rethrow any other error type unchanged to the existing generic-error path (run.ts:1277-1281) | closed |
| T-17-15 | Denial of Service | Repeated agent-triggered attached-session launches | accept | Identical resource profile to already-shipped interactive `--staged`/`--worktree`/standalone CLI launches (one process, one loopback server, exits after Finish or signal); no new amplification surface introduced | closed |
| T-17-16 | Tampering | `diff-review`'s `package.json` `version` field, temporarily set to `2.0.0` for Task 2's pack step | mitigate | Field reverted; `package.json` version confirmed `1.6.1` with zero residual diff at audit time; the version bump was never committed in the `diff-review` repository | closed |
| T-17-17 | Elevation of Privilege | `npm install --global` during Task 2's verification | mitigate | `installRuntimeArtifact` (tests/helpers/runtime-artifact.ts:400-402) invokes `npm install --global --prefix <isolated-tmp-dir> --ignore-scripts --no-audit --no-fund --registry <public-registry>`, never the operator's real global prefix, lifecycle scripts disabled | closed |
| T-17-18 | Repudiation | Accidental push or PR creation against `Ship-With-AI/skills` | mitigate | `cumpa-uncommitted-files-request-modes` branch exists locally in `/Users/alessandro/projects/shipwithai-skills` at commit `065045c` with no `refs/remotes/origin/cumpa-uncommitted-files-request-modes` ref — confirmed no push occurred; Plan 17-05 Task 3 is `checkpoint:human-action`, `autonomous: false` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-17-01 | T-17-02 | `MAX_AGENT_REQUEST_BYTES` (1 MiB) streaming-read cap is pre-existing and unchanged by Plan 17-01; the two new `discriminatedUnion` branches (`uncommitted`, `files`) sit behind the same cap as `revisions`/`patch`. No new DoS surface introduced. | gsd-security-auditor (Exec17.Secure17) | 2026-10-31 |
| AR-17-02 | T-17-09 | Stale/orphaned comment-anchor handling at Finish time is unchanged from the already-shipped pinned/exact-patch `staleAnchors` short-circuit; the RESEARCH.md Amendment confirmed this behavior is unaffected by Phase 17's new uncommitted/standalone registries. | gsd-security-auditor (Exec17.Secure17) | 2026-10-31 |
| AR-17-03 | T-17-15 | Repeated agent-triggered `mode:'uncommitted'`/`'files'` launches have an identical resource profile (one process, one loopback server per invocation, exits after Finish/signal) to the already-shipped interactive CLI launches. Rate-limiting/throttling of repeated local CLI invocations is explicitly out of this phase's scope. | gsd-security-auditor (Exec17.Secure17) | 2026-10-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. All 5 SUMMARY.md files' `## Threat Flags` sections (where present) report no new attack surface beyond the plan-authored register; 17-01-SUMMARY.md explicitly states "None beyond what the plan's own `<threat_model>` already covers." Plans 17-02 through 17-05's SUMMARY.md files carry no `## Threat Flags` heading at all (no new surface flagged during implementation).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-31 | 18 | 18 | 0 | gsd-security-auditor (Exec17.Secure17, subagent) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-31
