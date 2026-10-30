# Phase 17: Agent Protocol Extension & Marketplace Skill - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Coding agents can request **uncommitted** (Phase 14) and **standalone-file** (Phase 15) reviews over the same stdin request contract used for committed ranges and exact patches. They receive exactly one versioned canonical JSON result with full provenance after the developer finishes, and get specific validation errors before any browser launch for malformed, oversized or out-of-repository requests. Existing range and exact-patch requests and V1–V3 exports stay byte-for-byte unchanged. The ShipWithAI marketplace skill (`Ship-With-AI/skills`, `skills/cumpa/`) is updated to request the new review kinds, with its CLI prerequisite bumped to the release that supports them.

Requirements: AGENT-06..09, SKL-04 (`.planning/REQUIREMENTS.md`).

Out of scope: publishing the npm release and merging the marketplace PR (release operations happen outside GSD execution; see D-05), README/positioning copy (Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Result & Refresh provenance
- **D-01:** **Final snapshot + full chain:** comments are reported against the **final** snapshot's content digests (what the developer last saw), and the result also carries the **ordered snapshot digest chain** (Phase 14 D-18). Each comment keeps its own recorded evidence (the snapshot digest it was written against, context hash, path, side, line range).
- **D-02:** **Stale/orphaned comments are included and clearly classified** (current/stale/orphaned, per Phase 14 D-16) with evidence intact. The agent decides what to apply. Nothing is dropped from canonical JSON.
- **D-03:** **Drift-after-final-snapshot warning:** at finish, Cumpa runs a cheap stat/index check (same mechanism as Phase 14 D-14). If the working tree changed after the final snapshot (e.g. the agent edited files while the review was open), the result includes an explicit flag naming the changed paths, so the agent compares digests before applying.

### Skill & release coupling
- **D-04:** ~~Release is a 1.x minor (1.7.0).~~ **AMENDED 2026-10-30 by Phase 17.1 D-03:** there is no 1.7.0. The v2.0 milestone ships once, renamed, as `<new-package>@2.0.0`. Phase 17 still keeps new request modes and export versions additive, with V1–V3 structure unchanged. Phase 17 work uses the current name (`cumpa`); Phase 17.1 renames it afterwards.
- **D-05:** **Skill: prepare the change, land after release.** Phase 17 makes the skill update on a branch in the skills repo (`/Users/alessandro/projects/shipwithai-skills`, remote `Ship-With-AI/skills`, path `skills/cumpa/`) and opens a **draft PR**. It merges only after the Cumpa release is published (outside GSD execution). The phase verifies the updated skill end to end against a **locally packed** CLI tarball (`npm pack`), never a published one.
- **D-06:** **Hard prerequisite bump** (one prerequisite for all review kinds; user chose this over feature-gated dual support). **AMENDED by Phase 17.1 D-03:** the final prerequisite is `<new-package> >=2.0.0 <3.0.0`. In Phase 17, write the skill change against the current name with the prerequisite `>=2.0.0 <3.0.0` and verify against a locally packed tarball whose version is set to `2.0.0-dev`/`2.0.0` locally (never published). Phase 17.1 renames the package, checker script and install guidance on the same skills branch/draft PR. Update `scripts/check-cumpa.mjs`, the install guidance and the "independent release verification" wording accordingly.

### Claude's Discretion (user skipped these areas; conservative defaults)
- **Request shape:** add new `mode` values (`uncommitted`, `files`) to the existing request contract (`src/contracts/request.ts`, `kind: "cumpa.review-request"`) **within `schemaVersion: 1`**: additive, existing `revisions`/exact-patch modes untouched. `uncommitted`: `source: "staged" | "unstaged" | "worktree"`, optional `base` (bounded `GitArgument`, ref or OID; rejected for `unstaged` per Phase 14 D-05), optional `pathspecs` (`MAX_PATHSPEC_COUNT`). `files`: `paths` (1..`MAX_PATHSPEC_COUNT` bounded pathspecs). Names align with Phase 14 CLI flags (`--staged/--unstaged/--worktree/--base`) and Phase 15 positional args.
- **Export versions:** new export schema versions following the established V1→V2→V3 superset pattern in `src/contracts/draft.ts` (ROADMAP research flag: finalize `ReviewExportV4Schema`/`V5Schema` field shapes during planning). One version per new session kind or one shared version: researcher decides, provided V1–V3 parsing/serialization stays unchanged and is regression-tested.
- **Validation errors:** specific, machine-readable error codes emitted **before** browser launch through the existing request-error channel (`src/cli/request.ts`). Cover at least: malformed/unknown mode, oversized request, path outside repository (`../`, absolute outside, symlink escape), pathspec matching nothing, explicitly named ignored file, `base` given with `unstaged`. "No changes" is **not** an error (Phase 14 D-03: empty session).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — AGENT-06..09, SKL-04
- `.planning/ROADMAP.md` §"Phase 17" — success criteria; **Research flag**: exact V4/V5 export field shapes, finalize against the V1→V2→V3 superset pattern per `research/SUMMARY.md`
- `.planning/research/SUMMARY.md`

### Prior phases
- `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-CONTEXT.md` — source kinds, Unstaged semantics, snapshot chain, draft keying, passive change check
- `.planning/phases/15-standalone-file-review/15-CONTEXT.md` — path resolution/safety, export provenance defaults, mode exclusivity

### Code
- `src/contracts/request.ts` — request schema, `GitArgumentSchema`, `MAX_AGENT_REQUEST_BYTES`, `MAX_PATHSPEC_COUNT`
- `src/cli/request.ts` — stdin request parsing and error channel
- `src/cli/run.ts` — attached-session launch
- `src/contracts/draft.ts` (~L279-461) — `ReviewExportV1/V2/V3Schema`
- `src/export/review-export.ts`, `src/export/render-review-markdown.ts`
- `src/server/attached-completion.ts` — one-result-after-finish completion

### Marketplace skill (separate repo)
- `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/SKILL.md` — current workflow; prerequisite `>=1.5.0 <2.0.0`
- `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/scripts/` — `check-cumpa.mjs` version gate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Request contract + bounded argument validators; attached completion flow (one canonical result).
- Export superset pattern V1→V2→V3 with cross-version parse checks.
- Phase 14/15 session factories (uncommitted, standalone).

### Established Patterns
- Agent protocol is strict JSON on stdin; request/result files mode `0600`.
- Never break existing export versions; superset + explicit version bump.
- Skill is a gate around the installed CLI only; never reimplements review logic or installs automatically.

### Integration Points
- `request.ts` schema → `cli/request.ts` validation → Phase 14/15 factories → attached completion → new export version.
- Skills repo branch + draft PR; local `npm pack` verification.

</code_context>

<specifics>
## Specific Ideas

- Result flag for D-03, e.g. `workingTreeChangedAfterFinalSnapshot: { changed: true, paths: [...] }` (exact naming per research).

</specifics>

<deferred>
## Deferred Ideas

- Publishing the npm release and merging the skills PR: release operations, outside this phase.
- Feature-gated dual skill prerequisite (rejected in favor of the hard bump).

</deferred>

---

*Phase: 17-agent-protocol-extension-marketplace-skill*
*Context gathered: 2026-10-30*
