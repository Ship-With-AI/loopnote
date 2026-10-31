# Phase 17: Agent Protocol Extension & Marketplace Skill - Research

**Researched:** 2026-10-31
**Domain:** Zod request/export contract extension, Fastify session-factory wiring, native Git path-safety validation, npm package local-tarball verification
**Confidence:** HIGH

## Summary

Phase 17 wires two already-built session kinds — Phase 14's uncommitted sessions (staged/unstaged/worktree) and Phase 15's standalone-file sessions — into the existing agent stdin protocol (`src/contracts/request.ts`, `src/cli/request.ts`, `src/cli/run.ts`) and the attached one-shot completion flow (`src/server/attached-completion.ts`, `AttachedCompletionCoordinator`). The request contract gets two new additive `mode` branches (`uncommitted`, `files`) under the existing `schemaVersion: 1`. The export contract gets two new schema versions, **V5** (agent-driven uncommitted) and **V6** (agent-driven standalone), because the already-shipped `ReviewExportV4Schema` (Phase 15, standalone) is a `strictObject` that cannot be extended with Phase 17's new drift field without breaking it — the two new review kinds both need that field, so neither can reuse V4 as-is.

A concrete, previously-undocumented gap found while reading the live code: `createUncommittedCapabilityRegistry` (`src/server/capabilities.ts:897-1148`) has **no `exportReview` method and no `attachedCompletion` wiring at all** — not even for the plain interactive CLI flow. `createStandaloneCapabilityRegistry` (`src/server/capabilities.ts:1150-1452`) has `exportReview` (UI export button, via `buildReviewExportV4`) but also **no `attachedCompletion` wiring**. Both gaps must be closed in this phase by following the exact `attachedCompletion` block pattern already shipped in the pinned (`capabilities.ts:414-480`) and exact-patch (`capabilities.ts:715-761`) registries. This is the core implementation task, not a side effect.

**Primary recommendation:** Add `uncommitted`/`files` request branches reusing `GitArgumentSchema` (currently unexported — must be exported) and `MAX_PATHSPEC_COUNT`; add `ReviewExportV5Schema`/`ReviewExportV6Schema` to `draft.ts` following the exact V3/V4 strip-and-reparse-against-V1 superset pattern; add `attachedCompletion` blocks (and `exportReview` for the uncommitted registry) to both capability-registry factories, reusing the already-built `worktreeChangeIndicator()` stat-comparison mechanism (extended to collect *all* changed paths, not just the first) for the D-03 drift flag; extend `cli/run.ts`'s `runOrdinaryAction` dispatch and `cli/request.ts`'s `AgentRequestErrorKind` taxonomy; update the marketplace skill on a branch/draft PR verified against a `npm pack`-produced local tarball built via the project's own `scripts/pack-runtime.mjs --purpose development-check`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Request shape validation (`mode`, bounds, `base`+`unstaged` conflict) | API / Backend (contracts) | — | Pure Zod schema in `src/contracts/request.ts`; no I/O. |
| JSON/byte/UTF-8/size framing + coarse error classification | API / Backend (CLI stdin parser) | — | `src/cli/request.ts`, already owns this for `revisions`/`patch`. |
| Git-dependent path/pathspec validation (outside-repo, symlink escape, no-match, ignored) | API / Backend (CLI dispatch) | Git adapter | Needs `git ls-files`/`git diff` calls; lives in `src/cli/run.ts` dispatch before `app.listen()`, reusing `src/git/standalone-resolution.ts` and `src/git/worktree-inventory.ts`. |
| Session construction (snapshot capture, draft store, capability registry) | API / Backend (server) | — | `src/server/app.ts` + `src/server/capabilities.ts`; **already built** by Phase 14/15, reused unchanged. |
| One-shot agent completion (`finish` → export → deliver → exit) | API / Backend (server) | — | `AttachedCompletionCoordinator` + per-registry `attachedCompletion` block; **must be added** to the two uncommitted/standalone registries. |
| Export schema versioning (V5/V6) | API / Backend (contracts + export) | — | `src/contracts/draft.ts`, `src/export/review-export.ts`; pure data-shape layer, no I/O. |
| Drift-after-final-snapshot detection | API / Backend (server) | Git adapter (stat) | Reuses the existing `indexStatIdentity()`/`captureChangeBaseline()` mechanism already in both registries (D-14 lineage), extended to not short-circuit. |
| Marketplace skill request construction + lifecycle | External (separate repo, agent-facing prompt) | — | `shipwithai-skills/skills/cumpa/SKILL.md` — documentation/workflow text, not application code. |
| Local tarball build + install verification | Build / CI tooling | — | `scripts/pack-runtime.mjs` (existing project tool) + a draft-PR-side e2e check against the installed tarball. |

## User Constraints

### Locked Decisions

#### Result & Refresh provenance
- **D-01:** **Final snapshot + full chain:** comments are reported against the **final** snapshot's content digests (what the developer last saw), and the result also carries the **ordered snapshot digest chain** (Phase 14 D-18). Each comment keeps its own recorded evidence (the snapshot digest it was written against, context hash, path, side, line range).
- **D-02:** **Stale/orphaned comments are included and clearly classified** (current/stale/orphaned, per Phase 14 D-16) with evidence intact. The agent decides what to apply. Nothing is dropped from canonical JSON.
- **D-03:** **Drift-after-final-snapshot warning:** at finish, Cumpa runs a cheap stat/index check (same mechanism as Phase 14 D-14). If the working tree changed after the final snapshot (e.g. the agent edited files while the review was open), the result includes an explicit flag naming the changed paths, so the agent compares digests before applying.

#### Skill & release coupling
- **D-04:** ~~Release is a 1.x minor (1.7.0).~~ **AMENDED 2026-10-30 by Phase 17.1 D-03:** there is no 1.7.0. The v2.0 milestone ships once, renamed, as `<new-package>@2.0.0`. Phase 17 still keeps new request modes and export versions additive, with V1–V3 structure unchanged. Phase 17 work uses the current name (`cumpa`); Phase 17.1 renames it afterwards.
- **D-05:** **Skill: prepare the change, land after release.** Phase 17 makes the skill update on a branch in the skills repo (`/Users/alessandro/projects/shipwithai-skills`, remote `Ship-With-AI/skills`, path `skills/cumpa/`) and opens a **draft PR**. It merges only after the Cumpa release is published (outside GSD execution). The phase verifies the updated skill end to end against a **locally packed** CLI tarball (`npm pack`), never a published one.
- **D-06:** **Hard prerequisite bump** (one prerequisite for all review kinds; user chose this over feature-gated dual support). **AMENDED by Phase 17.1 D-03:** the final prerequisite is `<new-package> >=2.0.0 <3.0.0`. In Phase 17, write the skill change against the current name with the prerequisite `>=2.0.0 <3.0.0` and verify against a locally packed tarball whose version is set to `2.0.0-dev`/`2.0.0` locally (never published). Phase 17.1 renames the package, checker script and install guidance on the same skills branch/draft PR. Update `scripts/check-cumpa.mjs`, the install guidance and the "independent release verification" wording accordingly.

### the agent's Discretion (user skipped these areas; conservative defaults)
- **Request shape:** add new `mode` values (`uncommitted`, `files`) to the existing request contract (`src/contracts/request.ts`, `kind: "cumpa.review-request"`) **within `schemaVersion: 1`**: additive, existing `revisions`/exact-patch modes untouched. `uncommitted`: `source: "staged" | "unstaged" | "worktree"`, optional `base` (bounded `GitArgument`, ref or OID; rejected for `unstaged` per Phase 14 D-05), optional `pathspecs` (`MAX_PATHSPEC_COUNT`). `files`: `paths` (1..`MAX_PATHSPEC_COUNT` bounded pathspecs). Names align with Phase 14 CLI flags (`--staged/--unstaged/--worktree/--base`) and Phase 15 positional args.
- **Export versions:** new export schema versions following the established V1→V2→V3 superset pattern in `src/contracts/draft.ts` (ROADMAP research flag: finalize `ReviewExportV4Schema`/`V5Schema` field shapes during planning). One version per new session kind or one shared version: researcher decides, provided V1–V3 parsing/serialization stays unchanged and is regression-tested.
- **Validation errors:** specific, machine-readable error codes emitted **before** browser launch through the existing request-error channel (`src/cli/request.ts`). Cover at least: malformed/unknown mode, oversized request, path outside repository (`../`, absolute outside, symlink escape), pathspec matching nothing, explicitly named ignored file, `base` given with `unstaged`. "No changes" is **not** an error (Phase 14 D-03: empty session).

### Deferred Ideas (OUT OF SCOPE)
- Publishing the npm release and merging the skills PR: release operations, outside this phase.
- Feature-gated dual skill prerequisite (rejected in favor of the hard bump).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-06 | Coding agent can submit a stdin request for uncommitted review (source kind, optional base, optional pathspecs) and receive one canonical JSON result after the developer finishes. | §Request contract additions (`mode: 'uncommitted'`); §Dispatch into Phase 14's factory; §V5 export schema; §`attachedCompletion` wiring gap in `createUncommittedCapabilityRegistry`. |
| AGENT-07 | Coding agent can submit a stdin request for standalone-file review (paths or pathspecs) and receive one canonical JSON result after the developer finishes. | §Request contract additions (`mode: 'files'`); §Dispatch into Phase 15's factory; §V6 export schema; §`attachedCompletion` wiring gap in `createStandaloneCapabilityRegistry`. |
| AGENT-08 | Coding agent receives uncommitted and standalone results in new versioned export formats carrying their provenance; existing range and exact-patch requests and V1–V3 exports are unchanged. | §V5/V6 decision and exact field shapes; §Regression-test strategy for V1–V4. |
| AGENT-09 | Coding agent gets a specific validation error before any browser launch for a malformed, oversized, or out-of-repository uncommitted or standalone request. | §Error code taxonomy; §Two-stage validation model (Zod-only vs. Git-dependent). |
| SKL-04 | Coding-agent users of the ShipWithAI marketplace skill can request uncommitted and standalone-file reviews through it, with the CLI version prerequisite updated to the release that supports them. | §Marketplace skill update mechanics; §Local tarball verification workflow. |
</phase_requirements>

## Standard Stack

No new runtime or dev dependencies. This phase extends existing Zod contracts, existing Fastify capability registries, and existing native-Git-CLI adapters already shipped in Phases 14/15. `[VERIFIED: codebase grep]`

### Core (reused, not newly installed)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | per `package.json` (already a dependency) | Request/export schema validation | Already the sole validation layer project-wide; `strictObject`/`discriminatedUnion`/`superRefine` are the established idiom in `src/contracts/*.ts`. |
| `fastify` | per `package.json` (already a dependency) | Session HTTP server | `createUncommittedSessionApp`/`createStandaloneSessionApp` already exist in `src/server/app.ts`; no server-shape change needed. |
| native `git` CLI via `node:child_process.spawn` | Git `>=2.43.0` (project floor) `[CITED: project README/constraints]` | Path/pathspec resolution, diff enumeration | `src/git/standalone-resolution.ts`, `src/git/worktree-inventory.ts` already implement this; Phase 17 reuses, does not reimplement. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `AgentRequestError` with an extended `AgentRequestErrorKind` union | A dedicated error class per new mode | Rejected: the existing channel in `src/cli/request.ts` is explicitly named as the required error channel in CONTEXT.md D-(discretion); a second class would fragment the one place `runOrdinaryAction`'s catch block already checks (`error instanceof AgentRequestError`). |
| `npm pack` via the project's own `scripts/pack-runtime.mjs --purpose development-check` | Hand-rolled `npm pack` + manual tar inspection | The project already has a purpose-built, audited local-pack tool (`purposes = new Set(['bootstrap','candidate','development-check','deployment-check'])`) that runs `npm run build` then `npm pack --json --ignore-scripts --pack-destination <dir>` and writes evidence; `development-check` is the only purpose that **does not** require clean tracked source or a configured support origin — exactly what an uncommitted local `2.0.0-dev` version bump needs. `[VERIFIED: codebase read, scripts/pack-runtime.mjs:530-646]` |

**Installation:** none — no new packages.

## Package Legitimacy Audit

**Not applicable.** This phase installs no new npm packages (confirmed by reading `src/contracts/request.ts`, `src/contracts/draft.ts`, `src/export/review-export.ts`, `src/server/capabilities.ts`, `src/server/app.ts`, and `package.json`'s existing dependency set — all work reuses `zod`/`fastify`/native `git`, already present). The only "packaging" involved is `npm pack` against the project's **own** package, locally, never published. The Package Legitimacy Gate (external-package verification) is skipped per its own "whenever this phase installs external packages" condition.

## Architecture Patterns

### System Architecture Diagram

```
stdin (agent) ──▶ readAgentReviewRequest()                         [src/cli/request.ts]
                    │  JSON parse + byte/size/UTF-8 framing
                    │  AgentReviewRequestSchema.safeParse()         [src/contracts/request.ts]
                    │    ├─ mode:'revisions'  (existing, unchanged)
                    │    ├─ mode:'patch'      (existing, unchanged)
                    │    ├─ mode:'uncommitted'  (NEW) ─┐
                    │    └─ mode:'files'        (NEW) ─┤
                    ▼                                   │
              AgentReviewRequest (frozen)                │
                    │                                    │
                    ▼                                    ▼
         runOrdinaryAction() dispatch          [src/cli/run.ts]
                    │
      ┌─────────────┼───────────────────────────────────────────────┐
      │ mode:'uncommitted'                      mode:'files'        │
      ▼                                          ▼                  │
resolveUncommittedBaseCommitOid/MergeBaseOid   resolveStandaloneArguments   (Git-dependent
  (existing, reused)                            (existing, reused)          validation —
      │  bounded pathspecs ──▶ createWorktreeChangedFileInventory           NEW error codes
      │     {pathspecs}  (existing option, newly exposed via request)       surface here,
      ▼                                          ▼                          before app.listen)
 UncommittedScope                           UncommittedScope
 (sourceKind: staged|unstaged|worktree)     (sourceKind: standalone)
      │                                          │
      ▼                                          ▼
createUncommittedSessionApp()              createStandaloneSessionApp()   [src/server/app.ts]
      │  materializeWorktreeSnapshot()           │  (same factory, unchanged)
      ▼                                          ▼
createUncommittedCapabilityRegistry()      createStandaloneCapabilityRegistry()  [src/server/capabilities.ts]
      │  + attachedCompletion block (NEW)        │  + attachedCompletion block (NEW)
      │  + exportReview (NEW, uses V5)            │  exportReview exists (V4, UI) → ALSO
      │                                            │  needs an agent path using V6
      ▼                                          ▼
 browser opens, developer reviews, clicks Finish
      │
      ▼
AttachedCompletionCoordinator.finish(expectedRevision, operation)   [src/server/attached-completion.ts]
      │  operation = draftStore.settle({prepare, finalize})
      │    prepare:  verify anchors, compute worktreeChangeIndicator() delta (ALL paths, not just first),
      │              buildReviewExportV5()/V6()  [src/export/review-export.ts]
      │    finalize: re-verify anchors, re-check drift, deliver(bytes)
      ▼
 canonical JSON written to stdout result file; process exits 0
```

### Recommended Project Structure

No new directories. All changes land in existing files:
```
src/contracts/
├── request.ts     # export GitArgumentSchema; add UncommittedRequestSchema, FilesRequestSchema
├── draft.ts        # add ReviewExportV5Schema, ReviewExportV6Schema, UncommittedExportScopeSchema,
│                    #   WorkingTreeDriftFlagSchema
src/cli/
├── request.ts      # extend AgentRequestErrorKind + requestErrorMessages
├── run.ts           # extend runOrdinaryAction dispatch; new launchUncommittedAgentSession /
│                    #   launchStandaloneAgentSession helpers mirroring launchExactPatchSession
src/export/
├── review-export.ts  # add buildReviewExportV5, buildReviewExportV6
src/server/
├── capabilities.ts   # add attachedCompletion block + exportReview to createUncommittedCapabilityRegistry;
│                      #   add attachedCompletion block (agent path, V6) to createStandaloneCapabilityRegistry;
│                      #   extend worktreeChangeIndicator()-adjacent stat comparison to collect all changed paths
tests/unit/
├── review-export.test.ts   # extend with V5/V6 cases + V1–V4 regression assertions
tests/e2e/
├── agent-ready-export.spec.ts        # extend with uncommitted/files stdin scenarios
├── uncommitted-review.spec.ts        # extend if agent-path coverage belongs here instead
├── standalone-review.spec.ts         # extend similarly
tests/package/
├── agent-ready-export.test.ts        # pattern to follow for any new packaged-artifact scenario

(separate repo) /Users/alessandro/projects/shipwithai-skills/skills/cumpa/
├── SKILL.md              # prerequisite bump, new request examples
├── scripts/check-cumpa.mjs  # version regex bump to >=2.0.0 <3.0.0
```

### Pattern 1: Additive discriminated-union request branch

**What:** Add new `mode` literals to `AgentReviewRequestSchema`'s existing `z.discriminatedUnion('mode', [...])`, each a `strictObject` with its own nested scope object named after the mode (mirrors `revisions`/`patch`).
**When to use:** Any new agent-protocol input shape.
**Example (exact field shapes for Phase 17):**
```typescript
// Source: src/contracts/request.ts (existing file, pattern extended)
export const GitArgumentSchema = z.string().refine(isBoundedGitArgument, {  // now exported
  message: 'Git arguments must be non-empty, valid Unicode without NUL, and at most 4096 UTF-8 bytes.',
});

const UncommittedSourceSchema = z.enum(['staged', 'unstaged', 'worktree']);

const UncommittedRequestScopeSchema = z
  .strictObject({
    source: UncommittedSourceSchema,
    base: GitArgumentSchema.optional(),
    pathspecs: z
      .array(GitArgumentSchema)
      .max(MAX_PATHSPEC_COUNT)
      .default(emptyPathspecs)
      .transform((pathspecs) => Object.freeze(pathspecs)),
  })
  .superRefine((scope, context) => {
    if (scope.source === 'unstaged' && scope.base !== undefined) {
      context.addIssue({
        code: 'custom',
        message: '"base" cannot be combined with source "unstaged".',
        path: ['base'],
      });
    }
  })
  .readonly();

const UncommittedRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('uncommitted'),
    uncommitted: UncommittedRequestScopeSchema,
  })
  .readonly();

const FilesRequestScopeSchema = z
  .strictObject({
    paths: z
      .array(GitArgumentSchema)
      .min(1)
      .max(MAX_PATHSPEC_COUNT)
      .transform((paths) => Object.freeze(paths)),
  })
  .readonly();

const FilesRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('files'),
    files: FilesRequestScopeSchema,
  })
  .readonly();

export const AgentReviewRequestSchema = z
  .discriminatedUnion('mode', [
    RevisionRequestSchema,
    ExactPatchRequestSchema,
    UncommittedRequestSchema,
    FilesRequestSchema,
  ])
  .readonly();
```
Field names (`source`, `base`, `pathspecs`, `paths`) deliberately mirror the Phase 14 CLI flag names (`--staged/--unstaged/--worktree/--base`) and the Phase 15 positional-args/`pathspecs` vocabulary already used by `RevisionRangeSchema`, per the locked discretion note.

`freezeRequest()` in `src/cli/request.ts` must gain two more branches (`request.mode === 'uncommitted'` → freeze `request.uncommitted`/`.pathspecs`; `request.mode === 'files'` → freeze `request.files`/`.paths`), matching its existing `if/else` for `revisions`/`patch`.

### Pattern 2: Export schema version as a strict superset, verified by strip-and-reparse against V1

**What:** Every `ReviewExportVN` (N≥2) schema's `superRefine` proves it "retains valid V1 feedback" by constructing a V1-shaped document (substituting zeroed placeholder `comparison`/`drift` when the session kind has no committed-OID endpoints) and parsing it through `ReviewExportV1Schema`. V2 keeps the real `comparison`/`drift` (it has real OIDs); V3/V4 substitute all-zero placeholders (they don't). V5/V6 follow the **V3/V4 branch** of this pattern exactly, because uncommitted/standalone sources have no committed base/head OIDs either.
**When to use:** Any new export schema version.
**Example — exact V5/V6 field shapes:**
```typescript
// Source: src/contracts/draft.ts (existing file, pattern extended)

const UncommittedExportScopeSchema = z
  .strictObject({
    sourceKind: z.enum(['staged', 'unstaged', 'worktree']),       // never 'standalone' here — V6 owns that
    baseCommitOid: GitObjectIdSchema.optional(),                   // absent only for 'unstaged'
    pathspecs: z.array(z.string()).readonly(),                     // echoes the request filter, empty if none
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),  // D-01
  })
  .superRefine((scope, context) => {
    const hasBase = scope.baseCommitOid !== undefined;
    if (scope.sourceKind === 'unstaged' && hasBase) {
      context.addIssue({ code: 'custom', message: 'Unstaged scope must not have a base commit.', path: ['baseCommitOid'] });
    }
    if (scope.sourceKind !== 'unstaged' && !hasBase) {
      context.addIssue({ code: 'custom', message: 'Staged and Working tree scope require a base commit.', path: ['baseCommitOid'] });
    }
  })
  .readonly();

// D-03: reused by both V5 and V6, named per the CONTEXT.md <specifics> hint.
const WorkingTreeDriftFlagSchema = z
  .strictObject({
    changed: z.boolean(),
    paths: z.array(ExportExactPathSchema).readonly(),   // reuse the same repo-relative path schema as ExportFileSchema
  })
  .superRefine((flag, context) => {
    if (!flag.changed && flag.paths.length !== 0) {
      context.addIssue({ code: 'custom', message: 'Unchanged drift flags must not name paths.', path: ['paths'] });
    }
    if (flag.changed && flag.paths.length === 0) {
      context.addIssue({ code: 'custom', message: 'Changed drift flags must name at least one path.', path: ['paths'] });
    }
  })
  .readonly();

export const ReviewExportV5Schema = z
  .strictObject({
    schemaVersion: z.literal(5),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    uncommitted: UncommittedExportScopeSchema,
    workingTreeChangedAfterFinalSnapshot: WorkingTreeDriftFlagSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    // Same strip-and-reparse-against-V1 technique as V3/V4 (see draft.ts:445-470, 503-528):
    // substitute zeroed placeholder comparison/drift, parse as schemaVersion 1.
    const feedback = ReviewExportV1Schema.safeParse({
      schemaVersion: 1, kind: document.kind, exportedAt: document.exportedAt,
      acceptedDraftRevision: document.acceptedDraftRevision,
      comparison: { selectedBase: { label: 'preimage', launchOid: '0'.repeat(40) }, selectedHead: { label: 'postimage', launchOid: '0'.repeat(40) }, mergeBaseOid: '0'.repeat(40), comparisonKey: '0'.repeat(64) },
      drift: { observedAt: document.exportedAt, acknowledged: false, base: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' }, head: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' } },
      summary: document.summary, files: document.files, counts: document.counts,
    });
    if (!feedback.success) context.addIssue({ code: 'custom', message: 'Version 5 export must retain valid review feedback.' });
  })
  .readonly();

export const ReviewExportV6Schema = z
  .strictObject({
    schemaVersion: z.literal(6),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    standalone: StandaloneExportScopeSchema,              // reused verbatim from V4 — same shape
    workingTreeChangedAfterFinalSnapshot: WorkingTreeDriftFlagSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    // Prove V6 is V4 plus the drift flag: strip the new field, reparse at schemaVersion 4.
    const { workingTreeChangedAfterFinalSnapshot: _drift, ...v4Shape } = document;
    if (!ReviewExportV4Schema.safeParse({ ...v4Shape, schemaVersion: 4 }).success) {
      context.addIssue({ code: 'custom', message: 'Version 6 export must retain a valid version 4 (standalone) document.' });
    }
  })
  .readonly();
```
`ReviewExport = ReviewExportV1 | V2 | V3 | V4 | V5 | V6`; `parseCanonicalReviewExport`/`zodParseReviewExport` (`src/export/review-export.ts:271-291`, currently a `schemaVersion`-keyed dispatch — re-read the exact switch/if-chain at write time) gain two more arms. `ExportFileSchema`/`ExportCommentSchema`/`ExportCountsSchema`/`ExportExactPathSchema`/`ExportStringSchema` are all reused unmodified — D-01 ("each comment keeps its own recorded evidence") and D-02 (stale/orphaned classification) are **already structurally satisfied** by the existing `ExportCommentSchema.verification: AnchorVerificationSchema` (`state: 'verified'|'stale'|'orphaned'`) and `DurableAnchorV1Schema` fields; nothing new is needed there. `[VERIFIED: codebase read, src/contracts/draft.ts:218-249]`

**Why V5+V6, not one shared version:** `ReviewExportV4Schema` is a `strictObject` (Zod rejects unknown keys) already shipped for Phase 15's CLI-triggered standalone export (`kind:'cumpa/export', schemaVersion:4`). Adding `workingTreeChangedAfterFinalSnapshot` to it would change what `schemaVersion:4` documents look like, violating "V1–V4 parsing/serialization stays byte-for-byte unchanged." A single new version also cannot serve both kinds cleanly, because `uncommitted` (sourceKind staged/unstaged/worktree) and `standalone` (originalArguments/resolvedPaths/fileDigests) have genuinely different scope shapes that already exist as separate types (`UncommittedDraftComparisonSchema` vs. the `standalone` arm). Two versions, each a minimal superset of its nearest existing sibling (V5 ⊃ V1-shape, parallel to V3; V6 ⊃ V4 exactly), keeps every version's superset relationship provable by the same technique already used for V2/V3/V4, and keeps the git history of "what changed between versions" legible.

### Pattern 3: `attachedCompletion` capability block (the actual missing piece)

**What:** A capability-registry-local object built only when `options.attachedCompletion !== undefined`, exposing `status()`/`markResponseSettled()`/`finish(expectedRevision)`. `finish` calls `coordinator.finish(expectedRevision, operation)`, where `operation` runs `draftStore.settle({ prepare, finalize })`: `prepare` verifies anchors, checks scope validity, builds the canonical export bytes, returns `{kind:'ready', bytes, revision}`; `finalize` re-verifies anchors/scope after any mutation race, re-parses the prepared bytes to confirm `schemaVersion`/`revision` match, then calls `options.attachedCompletion.deliver(bytes)`.
**When to use:** Required for AGENT-06/07 — this is the mechanism that turns "developer clicked Finish in the browser" into "one canonical JSON result written to the agent's stdout and the process exits."
**Already-shipped examples to copy exactly:** `src/server/capabilities.ts:414-480` (pinned/committed, uses `buildReviewExportV1`/`V2`, scope check via `selectorDriftObserver.observe()`) and `src/server/capabilities.ts:715-761` (exact-patch, uses `buildReviewExportV3`, scope check via `snapshot.exportScope().snapshot.status !== 'unchanged'`).
**New wiring needed — `createUncommittedCapabilityRegistry`:**
```typescript
// Source: pattern copied from src/server/capabilities.ts:414-480, adapted for uncommitted scope
const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
  status: () => options.attachedCompletion!.coordinator.status(),
  markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
  finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
    return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
      const settled = await draftStore.settle(expectedRevision, {
        prepare: async (acceptedDraft) => {
          const verification = Object.fromEntries(await Promise.all(
            acceptedDraft.comments.map(async (c) => [c.id, await verifyAnchor(c.anchor)] as const),
          ));
          // D-02: do NOT reject on stale/orphaned here — include and classify, per D-02/D-16.
          const drift = await collectWorkingTreeDrift();   // NEW helper, see Pitfall 3 below
          try {
            const exportedAt = new Date().toISOString();
            const bytes = canonicalizeReviewExport(buildReviewExportV5(
              { acceptedDraft, commentVerification: verification },
              { sourceKind: scope.sourceKind, baseCommitOid: scope.baseCommitOid, pathspecs: requestPathspecs, reviewKey, snapshotChain: snapshotSession.chain },
              drift,
              exportedAt,
            ));
            return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
          } catch { return { kind: 'canonicalizationFailure' as const }; }
        },
        finalize: async ({ draft, prepared }) => {
          if (prepared.kind !== 'ready') return prepared;
          try {
            const document = parseCanonicalReviewExport(prepared.bytes);
            if (document.schemaVersion !== 5 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
          } catch { return { kind: 'canonicalizationFailure' as const }; }
          try {
            if (!await options.attachedCompletion!.deliver(prepared.bytes)) return { kind: 'deliveryFailed' as const };
            return { kind: 'completed' as const, revision: prepared.revision };
          } catch { return { kind: 'deliveryFailed' as const }; }
        },
      });
      if (settled.kind === 'accepted') return settled.value;
      if (settled.kind === 'revisionConflict') return { kind: 'revisionConflict', expectedRevision: settled.expectedRevision, actualRevision: settled.actualRevision };
      if (settled.kind === 'draftChanged') return { kind: 'revisionConflict', expectedRevision, actualRevision: settled.actualRevision };
      return settled.kind === 'readOnly' ? { kind: 'draftReadOnly' } : { kind: 'persistenceFailure' };
    });
  },
};
```
Add `attachedCompletion,` to the returned `Object.freeze({...})` in both `createUncommittedCapabilityRegistry` and `createStandaloneCapabilityRegistry` (the latter reuses `buildReviewExportV6`/`StandaloneExportScopeSchema` instead). `createUncommittedCapabilityRegistry` also needs a bare `exportReview` method added (it currently has none at all, unlike every other registry) if the UI export button should also work for plain interactive uncommitted sessions going forward — **confirm with the planner whether that UI-export gap is in scope for Phase 17 or deliberately deferred**; AGENT-06/07 only require the *agent* path (`attachedCompletion`), not the manual "Export" button, so the minimal correct scope is: add `attachedCompletion` to both registries, and leave `createUncommittedCapabilityRegistry`'s manual `exportReview` absence alone unless the planner decides otherwise (flagged as an Open Question below).

### Pattern 4: Two-stage request validation (pure-schema vs. Git-dependent)

**What:** `readAgentReviewRequest()` in `src/cli/request.ts` can only validate what's knowable from the JSON bytes alone (shape, bounds, the `base`+`unstaged` conflict — all pure Zod). Everything that needs the actual repository (`../` outside-repo, symlink escape, pathspec-matches-nothing, explicitly-ignored-file) can only be checked after `discoverGitRepository()` runs, inside `runOrdinaryAction`'s dispatch in `cli/run.ts`, **before** `createApp`/`app.listen()`.
**When to use:** Any validation that needs filesystem/Git state.
**Example — the new dispatch branches in `runOrdinaryAction` (`src/cli/run.ts:1084-1157`):**
```typescript
// Source: pattern extends src/cli/run.ts:1084-1157 (existing mode:'patch' branch as the template)
if (request.mode === 'uncommitted') {
  const runner = createGitRunner();
  const repository = await discoverGitRepository(options.cwd, runner, activeGit.signal);
  const objectFormat = await resolveUncommittedObjectFormat(repository.root, runner, activeGit.signal);
  const baseCommitOid = request.uncommitted.source === 'unstaged'
    ? undefined
    : await resolveUncommittedBaseCommitOid(request.uncommitted.base, repository, runner, activeGit.signal);
  const mergeBaseOid = baseCommitOid === undefined
    ? undefined
    : await resolveUncommittedMergeBaseOid(baseCommitOid, repository.headOid, repository.root, runner, activeGit.signal);
  // NEW: path-outside-repository detection for any pathspec, reusing Git's own exit-128 "outside repository" signal
  // (same failure Git raises for ls-files/diff with a ../ or absolute-outside pathspec).
  const changedFiles = await createWorktreeChangedFileInventory(
    { repositoryRoot: repository.root, objectFormat, sourceKind: request.uncommitted.source, baseCommitOid, mergeBaseOid, pathspecs: request.uncommitted.pathspecs, signal: activeGit.signal },
    { runner },
  ).catch((error) => { throw mapGitPathspecError(error, request.uncommitted.pathspecs); });  // NEW adapter, see below
  const scope = UncommittedScopeSchema.parse({ kind: 'uncommitted', sourceKind: request.uncommitted.source, repositoryRoot: repository.root, objectFormat, changedFiles, ...(baseCommitOid === undefined ? {} : { baseCommitOid }), ...(mergeBaseOid === undefined ? {} : { mergeBaseOid }) });
  await launchAttachedSession(dependencies, support, activeGit, async (sessionToken, attachedCompletion, revealDraftFile) =>
    (dependencies.createUncommittedSessionApp ?? createUncommittedSessionApp)(scope, { webRoot: dependencies.webRoot, sessionToken, revealDraftFile, support, attachedCompletion, diagnostics: ({correlationId, reason}) => output(`Cumpa request denied [${correlationId}]: ${reason}.`) }));
  return;
}

if (request.mode === 'files') {
  const runner = createGitRunner();
  const repository = await discoverGitRepository(options.cwd, runner, activeGit.signal);
  const objectFormat = await resolveUncommittedObjectFormat(repository.root, runner, activeGit.signal);
  // resolveStandaloneArguments already throws plain Error('... resolves outside the repository.') / Error('... matched only a path excluded via .gitignore ...') / Error('... did not match any file.')
  // — map these three to AgentRequestError kinds; see mapStandaloneResolutionError below.
  const resolvedPaths = await resolveStandaloneArguments(repository.root, request.files.paths, { runner }).catch(mapStandaloneResolutionError);
  const gitStates = await classifyStandaloneGitState(repository.root, resolvedPaths, { runner });
  const changedFiles = await createStandaloneChangedFileInventory(repository.root, resolvedPaths, gitStates, objectFormat, { runner, signal: activeGit.signal });
  const scope = UncommittedScopeSchema.parse({ kind: 'uncommitted', sourceKind: 'standalone', repositoryRoot: repository.root, objectFormat, standaloneArguments: request.files.paths, changedFiles });
  await launchAttachedSession(dependencies, support, activeGit, async (sessionToken, attachedCompletion, revealDraftFile) =>
    (dependencies.createStandaloneSessionApp ?? createStandaloneSessionApp)(scope, { webRoot: dependencies.webRoot, sessionToken, revealDraftFile, support, attachedCompletion, diagnostics: ({correlationId, reason}) => output(`Cumpa request denied [${correlationId}]: ${reason}.`) }));
  return;
}
```
`resolveUncommittedBaseCommitOid`, `resolveUncommittedMergeBaseOid`, `resolveUncommittedObjectFormat`, `resolveStandaloneArguments`, `classifyStandaloneGitState`, `createStandaloneChangedFileInventory`, `createWorktreeChangedFileInventory` all already exist and are imported/used elsewhere in `cli/run.ts`/`server/worktree-snapshot.ts` — none are new. `launchAttachedSession` (`cli/run.ts:975-1054`) is the exact helper `launchExactPatchSession` already wraps; reuse it unchanged.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path-outside-repository / symlink-escape detection for `files` mode | A new `realpath`-based per-segment walker | `resolveStandaloneArguments`/`resolveOneArgument` (`src/git/standalone-resolution.ts`), which already asks `git ls-files -- <argument>` and treats Git's own exit-128 fatal ("is outside repository" / "beyond a symbolic link") as the authority | Git is the project's single source of truth for path semantics (project constraint); a second traversal checker would be a second, possibly-divergent implementation of the same security boundary. |
| Stat-based drift detection for D-03 | A new polling/fs-watch mechanism | `indexStatIdentity()` + `captureChangeBaseline()` (`src/server/capabilities.ts:983-1014`, `1236-1265`), already built for Phase 14 D-14/`worktreeChangeIndicator()` | Same stat-identity comparison logic already proven in both registries; Phase 17 only needs to change the iteration to **collect all** changed paths instead of returning on the first (see Pitfall 3). |
| One-shot agent completion / stdout delivery | A bespoke "wait for POST then write stdout" loop per new mode | `AttachedCompletionCoordinator` (`src/server/attached-completion.ts`) + `launchAttachedSession` (`src/cli/run.ts:975-1054`) | Already handles the finishing/completed/deliveryFailed state machine and the stdout write path for `revisions`/`patch`; reusing it is the only way to keep "exactly one canonical result" true across four request kinds. |
| Export canonicalization / hashing | Custom JSON.stringify with manual key sorting | `canonicalizeReviewExport`/`serializeCanonicalJson` (`src/export/review-export.ts:74-99`) | Already enforces I-JSON-only values, sorted keys, lone-surrogate rejection — exactly the byte-stability guarantee AGENT-08 needs. |
| npm tarball production for skill verification | A manual `tar`/`npm pack` invocation in a throwaway script | `scripts/pack-runtime.mjs --purpose development-check --custody-dir <dir> --evidence <path>` | Already builds (`npm run build`), packs (`npm pack --json --ignore-scripts --pack-destination <dir>`), and writes a structured evidence record; `development-check` is the one purpose that explicitly tolerates uncommitted tracked-source changes (needed for a throwaway `2.0.0-dev` version bump) and doesn't require `CUMPA_RELEASE_SUPPORT_SERVICE_URL`. `[VERIFIED: codebase read]` |

**Key insight:** every piece of machinery Phase 17 needs (path safety, drift detection, one-shot completion, canonical export, local packing) **already exists** in this codebase for at least one sibling session kind. The work is wiring and additive schema extension, not new algorithms — the planner should treat any task that proposes a new algorithm here as a scope-creep flag.

## Common Pitfalls

### Pitfall 1: Reusing `ReviewExportV4Schema` for agent-driven standalone export
**What goes wrong:** It's tempting to route `mode:'files'` agent results through the already-shipped `buildReviewExportV4`, since it already has `snapshotChain`/`fileDigests`/`originalArguments` — everything D-01 needs.
**Why it happens:** V4 genuinely does satisfy D-01 and D-02 already; only D-03's drift flag is missing, and adding one field feels like a small change.
**How to avoid:** `ReviewExportV4Schema` is a `strictObject` consumed by existing tests (`tests/unit/review-export.test.ts`) and the shipped Phase 15 UI export button; AGENT-08 explicitly requires "existing range and exact-patch requests and V1–V3 exports are unchanged" and the reconciliation note extends that same byte-stability guarantee to V4. Adding a field changes what `schemaVersion:4` means. Use V6 (superset of V4) instead.
**Warning signs:** A diff that modifies `ReviewExportV4Schema`'s `strictObject({...})` body or `buildReviewExportV4`'s return shape.

### Pitfall 2: `pathspec-no-match` applied to the wrong mode
**What goes wrong:** Treating an `uncommitted` mode `pathspecs` filter that happens to match zero files the same as a `files` mode path that matches zero files — rejecting the former as an error.
**Why it happens:** CONTEXT.md's validation-error bullet list names "pathspec matching nothing" once, without splitting it by mode.
**How to avoid:** Phase 14 D-03 is explicit: "No changes = empty session, not an error," and the committed `revisions` mode's existing `pathspecs` field has never special-cased empty-match either (`createRangeComparison({ pathspecs })` just produces an empty-but-valid diff). `files` mode is different: each named path/glob is a user-supplied target that must resolve to *something* to be reviewable at all (Phase 15 D: "fail before launch when they match nothing"), which is a per-argument contract, not a filter. Apply `pathspec-no-match` only to `files` mode's `paths`; let `uncommitted` mode's optional `pathspecs` filter down to zero files silently (results in an empty but valid session, same as "No changes").
**Warning signs:** A test asserting `uncommitted` + narrowing `pathspecs` throws a validation error instead of opening an empty session.

### Pitfall 3: `worktreeChangeIndicator()`'s early-return doesn't satisfy D-03
**What goes wrong:** Reusing `worktreeChangeIndicator()` (`capabilities.ts:1299-1322`, and its near-duplicate in the uncommitted registry at `1046-1069`) as-is for the `finish`-time drift check, and discovering the result only ever contains `{ changed: true }` with no path list.
**Why it happens:** `worktreeChangeIndicator()` was built for a boolean UI indicator ("show the Refresh nudge, yes/no") and intentionally short-circuits on the first changed file (`if (changed) return { changed: true };`) for cheapness.
**How to avoid:** At `finish` time, D-03 needs the **full list** of changed paths, not just "something changed." Add a sibling function (or a parameter) that runs the same `indexStatIdentity()` + per-file `lstat()` comparison loop but **accumulates** every path whose stat differs instead of returning on the first, reusing `captureChangeBaseline()`/`diskPathFor()` unchanged. This only needs to run once, at `finish`, not on a poll interval, so the cost profile is different from the UI indicator and early-return isn't needed there.
**Warning signs:** `workingTreeChangedAfterFinalSnapshot.paths` always has length ≤ 1 in tests with multiple simultaneously-changed files.

### Pitfall 4: Mapping `resolveStandaloneArguments`'s plain `Error` messages to codes with regex is fragile
**What goes wrong:** `resolveOneArgument`/`resolveStandaloneArguments` (`src/git/standalone-resolution.ts`) throw plain `Error` objects with human-readable messages (`` `Argument "${argument}" resolves outside the repository.` ``, `` `Argument "${argument}" matched only a path excluded via .gitignore; it was not opened.` ``, `` `Argument "${argument}" did not match any file.` ``), not a typed `kind`. A naive regex adapter in the new agent dispatch is coupled to exact message text that Phase 15 owns and could change independently.
**Why it happens:** Phase 15 built this for a human-readable CLI stderr message, not a machine-readable protocol.
**How to avoid:** Either (a) accept the regex-matching adapter as a pragmatic, explicitly-documented coupling (cheapest, zero risk to Phase 15's shipped CLI behavior since the messages aren't changing anyway), or (b) refactor `standalone-resolution.ts` to throw a small typed `StandaloneResolutionError extends Error { readonly kind: 'outside-repository' | 'ignored' | 'no-match' }` and have `launchStandaloneSession`'s existing `catch (error) { output(error.message); ... }` in `cli/run.ts:932-943` keep working unchanged (it only reads `.message`, never `.kind`) while the new agent path reads `.kind` directly. **Recommend (b)** — it's a small, additive, low-risk change to a module Phase 17 already touches, and it removes the regex-matching fragility entirely for future maintainers. Document the choice in the plan since CONTEXT.md doesn't mandate either.
**Warning signs:** A test that changes `resolveOneArgument`'s message wording silently breaks error-code mapping with no type error to catch it.

### Pitfall 5: Forgetting to export `GitArgumentSchema`
**What goes wrong:** `src/contracts/request.ts`'s `GitArgumentSchema` is currently `const GitArgumentSchema = ...` (module-private). The new `uncommitted`/`files` schemas need it for `base`/`pathspecs`/`paths`, and so do any tests constructing fixtures directly against it.
**How to avoid:** Change to `export const GitArgumentSchema = ...` as part of this phase's first task. Grep confirms no other file currently imports it, so this is a pure addition with no call-site risk.

### Pitfall 6: `pathspecTail` already supports pathspecs for uncommitted inventory, but nothing wires it through the CLI scope schema
**What goes wrong:** Assuming `pathspecs` for `uncommitted` mode requires new Git-adapter work.
**Why it happens:** `UncommittedScopeSchema` (`src/contracts/comparison.ts:137-187`) and Phase 14's CLI flags (`--staged/--unstaged/--worktree/--base`) have no `pathspecs` field/flag today.
**How to avoid:** `createWorktreeChangedFileInventory` (`src/git/worktree-inventory.ts:31-32, 407-542`) **already accepts** an `options.pathspecs` array and threads it into every `git diff`/`git ls-files` call via `pathspecTail`. The new agent dispatch can pass `request.uncommitted.pathspecs` directly into that existing option — no git-adapter change needed. Only the export scope (V5's `pathspecs` field, for provenance) and the request contract are new; the enumeration capability already exists, just unexposed until now.
**Warning signs:** A plan task that proposes modifying `worktree-inventory.ts`'s diff/ls-files argument construction — that work is already done.

## Code Examples

### Error code taxonomy (extends `src/cli/request.ts`)

Reuses the exact existing convention: a flat string-literal union, a `satisfies Record<Kind, string>` message map, and an `Error` subclass carrying `.kind`. No competing error-kind scheme exists anywhere else in the codebase for this purpose (`LaunchErrorKind`, `GitRunnerErrorKind`, `SessionClientErrorKind` are each scoped to their own unrelated subsystem — none is a precedent to merge with; `AgentRequestErrorKind` is the one the CONTEXT.md discretion note names explicitly).

```typescript
// Source: extends src/cli/request.ts:11-26
export type AgentRequestErrorKind =
  | 'empty-request'
  | 'request-too-large'
  | 'invalid-utf8'
  | 'malformed-json'
  | 'unsupported-version'
  | 'unknown-mode'                 // NEW: mode present but not revisions|patch|uncommitted|files
  | 'base-with-unstaged'           // NEW: Zod-level, caught via a pre-check mirroring isUnsupportedVersion
  | 'path-outside-repository'      // NEW: Git-dependent, covers ../, absolute-outside, symlink-escape
  | 'pathspec-no-match'            // NEW: Git-dependent, files mode only (see Pitfall 2)
  | 'pathspec-ignored'             // NEW: Git-dependent, explicitly-named ignored file (files mode)
  | 'invalid-request';

const requestErrorMessages = {
  // ...existing five entries unchanged...
  'unknown-mode': 'Request mode is not supported. Use "revisions", "patch", "uncommitted", or "files".',
  'base-with-unstaged': '"base" cannot be combined with source "unstaged" in an uncommitted request.',
  'path-outside-repository': 'A requested path resolves outside the repository.',
  'pathspec-no-match': 'A requested path did not match any file.',
  'pathspec-ignored': 'A requested path is explicitly excluded by an ignore rule.',
  'invalid-request': 'Request is invalid. Use kind "cumpa.review-request", schemaVersion 1, and one supported source mode.',
} as const satisfies Record<AgentRequestErrorKind, string>;
```

`readAgentReviewRequest` gains two more pre-checks before falling back to `'invalid-request'`, mirroring the existing `isUnsupportedVersion` style:
```typescript
function isUnknownMode(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'mode' in value && typeof value.mode === 'string'
    && !['revisions', 'patch', 'uncommitted', 'files'].includes(value.mode);
}

function isBaseWithUnstaged(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'uncommitted' in value
    && typeof value.uncommitted === 'object' && value.uncommitted !== null
    && (value.uncommitted as Record<string, unknown>).source === 'unstaged'
    && (value.uncommitted as Record<string, unknown>).base !== undefined;
}
// in readAgentReviewRequest's safeParse-failure branch:
// isUnsupportedVersion(value) ? 'unsupported-version'
//   : isUnknownMode(value) ? 'unknown-mode'
//   : isBaseWithUnstaged(value) ? 'base-with-unstaged'
//   : 'invalid-request'
```
The three Git-dependent kinds (`path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) are thrown as `new AgentRequestError(...)` from the new `mapStandaloneResolutionError`/`mapGitPathspecError` adapters inside `cli/run.ts`'s dispatch (Pattern 4 above), not from `readAgentReviewRequest` — they need a live repository.

### V5/V6 builder signatures (extends `src/export/review-export.ts`)
```typescript
// Source: pattern matches buildReviewExportV3/V4 (src/export/review-export.ts:190-265)
export interface AcceptedUncommittedReviewSnapshot {
  readonly acceptedDraft: ReviewDraftV1;
  readonly commentVerification: Readonly<Record<string, AnchorVerificationDto>>;
}

export function buildReviewExportV5(
  snapshot: AcceptedUncommittedReviewSnapshot,
  uncommitted: UncommittedExportScope,
  drift: WorkingTreeDriftFlag,
  exportedAt: string,
): ReviewExportV5 { /* throws TypeError if draft.comparison doesn't match `uncommitted`'s provenance,
                        same style as buildReviewExportV3's digest/validationTarget/reviewKey check */ }

export function buildReviewExportV6(
  snapshot: AcceptedStandaloneReviewSnapshot,   // reused as-is, same shape as V4's param
  standalone: StandaloneExportScope,            // reused as-is, same type as V4's param
  drift: WorkingTreeDriftFlag,
  exportedAt: string,
): ReviewExportV6 { /* same provenance check as buildReviewExportV4 */ }
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended choice to refactor `standalone-resolution.ts`'s plain `Error` throws into a typed `kind`-carrying error (Pitfall 4, option b) rather than regex-matching messages | Common Pitfalls §4 | Low — this is a recommendation with an explicit fallback (option a), not a locked decision; the planner can choose either without blocking other work. |
| A2 | `createUncommittedCapabilityRegistry`'s missing manual `exportReview` (UI export button) is out of Phase 17's required scope, since AGENT-06/07 only name the agent `attachedCompletion` path | Architecture Patterns §3 | Low-medium — if the planner/user actually wants the "Export" button enabled for plain interactive uncommitted sessions too, that's a small additional task using the same `buildReviewExportV5`, flagged explicitly as an Open Question below so it isn't silently missed. |
| A3 | V5's `uncommitted` export scope should echo `pathspecs` (for provenance parity with V2's `range.pathspecs`), even though CONTEXT.md doesn't explicitly require it | Architecture Patterns §2 | Low — omitting it doesn't violate any requirement, it's a consistency recommendation; the planner can drop the field from V5 without breaking AGENT-06/08 if preferred. |

**Overall confidence:** HIGH. Every claim above is grounded in a direct `read`/`grep` of the live `diff-review` and `shipwithai-skills` repositories during this research session (file:line citations given throughout); no npm-registry or external-API lookups were needed since no new packages are introduced.

## Open Questions

1. **Should `createUncommittedCapabilityRegistry` also get a manual `exportReview` (UI export button), not just `attachedCompletion`?**
   - What we know: it currently has neither. `createStandaloneCapabilityRegistry` has `exportReview` (via V4) but not `attachedCompletion`. AGENT-06/07 only require the agent (`attachedCompletion`) path.
   - What's unclear: whether the pre-existing UI gap (`App.vue:396`: `:export-supported="!isUncommittedSession || isStandaloneSession"`) for plain interactive uncommitted sessions is something this phase should also close while touching this registry, or whether it's intentionally out of scope (not named in AGENT-06..09 or SKL-04).
   - Recommendation: default to **not** adding a manual `exportReview` to the uncommitted registry (only `attachedCompletion`, which AGENT-06 requires) unless the planner/user confirms otherwise during plan review — closing it is a UI-surfaced product decision (should the "Export" button become enabled for `--staged`/`--unstaged`/`--worktree` sessions too?) that CONTEXT.md's domain/decisions sections never raise.

2. **Does V5's `uncommitted.pathspecs` field need to exist at all, or is echoing the request's pathspecs back in the export unnecessary for AGENT-06/08?**
   - What we know: V2 (committed range) echoes `range.pathspecs` for provenance. Nothing in CONTEXT.md explicitly requires pathspec echoing for the new `uncommitted` export scope.
   - What's unclear: whether an agent consuming V5 needs to verify "exactly these pathspecs were used" the way it can for V2's `range`.
   - Recommendation: include it (shown in the V5 example above) for consistency with the established provenance pattern; it's a pure addition with no cost, and omitting it later is cheaper than adding it to a shipped `strictObject` later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.15.0 | — |
| npm | `npm pack`/`scripts/pack-runtime.mjs` | ✓ | 11.12.1 | — |
| git | All Git-adapter reuse (`src/git/*`) | ✓ | 2.54.0 | — |
| `/Users/alessandro/projects/shipwithai-skills` checkout | D-05 skill branch/draft PR | ✓ (read during this research session) | — | — |

**Missing dependencies with no fallback:** none.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Protocol is local-loopback, token-gated per existing `registerSessionSecurity`/`bindSessionSecurity` (unchanged by this phase). |
| V3 Session Management | yes (reused, unchanged) | Existing `sessionToken`/loopback-origin binding in `src/server/app.ts`/`security.ts`; new modes reuse the same `createSessionApp`-family wiring, no new session surface. |
| V4 Access Control | yes | Requests only ever read/open files **inside the discovered repository root**; `files` mode must reject anything resolving outside it (see V5 Input Validation). |
| V5 Input Validation | yes | `zod` `strictObject`s with `MAX_AGENT_REQUEST_BYTES`/`MAX_PATHSPEC_COUNT`/`GitArgumentSchema` byte/NUL/Unicode bounds (existing, reused) for the new `uncommitted`/`files` branches; Git-dependent path safety via `resolveStandaloneArguments`/Git's own exit-128 "outside repository" signal. |
| V6 Cryptography | no new surface | `sha256` content digests (snapshot chain, file digests) are already produced by `node:crypto.createHash` in existing Phase 14/15 code; Phase 17 reads/echoes them, does not generate new cryptographic material. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `files` mode arguments (`../../etc/passwd`, absolute paths outside repo) | Tampering / Information Disclosure | `resolveStandaloneArguments` → `git ls-files -- <argument>`; Git's own repository-boundary enforcement (exit 128 "outside repository") is the authority, mapped to `path-outside-repository`. Never read bytes from a resolved path without first confirming it came back through this Git-mediated resolution — never build a parallel `fs.readFile(join(root, userPath))` shortcut. |
| Symlink escape (a tracked/untracked symlink inside the repo pointing outside it, named explicitly) | Tampering / Information Disclosure | Same `ls-files`/`check-ignore` boundary as above; in-repo symlinks are never followed for content (Phase 14 WTREE-04 precedent: "In-repo symlinks stay non-reviewable entries… Cumpa never follows them"), consistent with `exact-patch.ts`'s `reason: 'symlink'` unsupported classification for mode `120000`. |
| Oversized-request DoS (very large stdin payload or pathological pathspec counts) | Denial of Service | `MAX_AGENT_REQUEST_BYTES` (1 MiB) enforced byte-by-byte during the streaming read in `readAgentReviewRequest` **before** `JSON.parse` (existing, reused unchanged); `MAX_PATHSPEC_COUNT` (256) and `MAX_RESOLVED_STANDALONE_FILES` (10,000, `standalone-resolution.ts:24`) bound the new `uncommitted.pathspecs`/`files.paths` arrays at the Zod layer before any Git call runs. |
| Pathspec injection (an argument crafted to look like a Git option, e.g. `--upload-pack=...`) | Tampering | Every Git invocation in the reused adapters already passes pathspecs after a literal `--` separator (`['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', argument]`, `pathspecTail = ['--', ...pathspecs]`) and uses `spawn()` with `shell: false` and argument arrays (project-wide constraint, never shell interpolation) — this is already the established mitigation; Phase 17 must not introduce any new Git invocation that omits the `--` separator or that interpolates a pathspec into a shell string. |
| Resource exhaustion via repeated agent-triggered snapshot captures (`mode:'uncommitted'`/`'files'` launched many times) | Denial of Service | Out of this phase's scope to newly mitigate — identical resource profile to the already-shipped interactive `--staged`/`--worktree`/standalone CLI launches (one process, one snapshot, exits after Finish); no new amplification vector is introduced by accepting the same launch via stdin instead of a flag. |

## Sources

### Primary (HIGH confidence — direct codebase reads, this session)
- `src/contracts/draft.ts` (full file) — `ReviewExportV1Schema`–`V4Schema`, `DraftComparisonSchema`, `UncommittedDraftComparisonSchema`, `DurableAnchorV1Schema`, `AnchorVerificationSchema`, `CURRENT_DRAFT_SCHEMA_VERSION`.
- `src/export/review-export.ts` (full file) — `buildReviewExportV1`–`V4`, `canonicalizeReviewExport`, `serializeCanonicalJson`, `parseCanonicalReviewExport`.
- `src/contracts/request.ts` (full file) — `AgentReviewRequestSchema`, `GitArgumentSchema` (unexported), `MAX_AGENT_REQUEST_BYTES`, `MAX_PATHSPEC_COUNT`, `RevisionRangeSchema`.
- `src/cli/request.ts` (full file) — `AgentRequestErrorKind`, `readAgentReviewRequest`, `freezeRequest`.
- `src/cli/run.ts` (lines 429-1157, 975-1157 close read) — `runOrdinaryAction` dispatch, `launchAttachedSession`, `launchExactPatchSession`, `launchUncommittedSession`, `launchStandaloneSession`, `resolveUncommittedBaseCommitOid`/`MergeBaseOid`, `validateUncommittedFlags`.
- `src/server/attached-completion.ts` (full file) — `AttachedCompletionCoordinator`.
- `src/server/app.ts` (lines 1-260) — `createUncommittedSessionApp`, `createStandaloneSessionApp`, `CreateUncommittedSessionAppOptions`.
- `src/server/capabilities.ts` (lines 100-168, 315-480, 664-1452 close read) — `CapabilityRegistryOptions`, `CapabilityRegistry`, `createCapabilityRegistry` (pinned), `createExactPatchCapabilityRegistry`, `createUncommittedCapabilityRegistry`, `createStandaloneCapabilityRegistry`, all three `attachedCompletion`-or-absent blocks, `worktreeChangeIndicator`.
- `src/contracts/comparison.ts` (lines 118-212) — `UncommittedScopeSchema`, `ChangedFileSchema`, `RangeReviewScopeSchema`.
- `src/git/standalone-resolution.ts` (full file) — `resolveOneArgument`, `resolveStandaloneArguments`, `classifyStandaloneGitState`, `createStandaloneChangedFileInventory`.
- `src/git/worktree-inventory.ts` (lines 1-50, 400-545) — `WorktreeChangedFileInventoryDependencies.pathspecs`, `pathspecTail`.
- `scripts/pack-runtime.mjs` (full file) — `purposes`, `parseArguments`, `main()`, the `npm pack --json --ignore-scripts --pack-destination` invocation.
- `tests/unit/review-export.test.ts` (lines 1-85), `tests/package/agent-ready-export.test.ts` (lines 1-233) — existing regression/e2e-style test patterns.
- `.planning/phases/14-uncommitted-source-review-frozen-snapshots/14-CONTEXT.md`, `.planning/phases/15-standalone-file-review/15-CONTEXT.md`, `.planning/phases/17-agent-protocol-extension-marketplace-skill/17-CONTEXT.md`, `.planning/research/SUMMARY.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 17.
- `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/SKILL.md` (full file), `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/scripts/check-cumpa.mjs` (full file).
- `package.json` (diff-review repo) — package name `@shipwithai/cumpa`, version `1.6.1`, bin `cumpa`.

### Secondary (MEDIUM confidence)
- none beyond the above — this phase required no external/web research since it is a pure internal-codebase extension with no new dependencies.

### Tertiary (LOW confidence)
- none.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every reused library/tool confirmed present via direct file reads.
- Architecture: HIGH — every pattern (request branch, export superset, `attachedCompletion` block, two-stage validation) is copied from an already-shipped sibling implementation in the same files, with exact line citations.
- Pitfalls: HIGH — each pitfall was discovered by directly reading the specific code path it concerns (e.g., `worktreeChangeIndicator`'s early return, the absent `attachedCompletion` block, the plain-`Error` throws in `standalone-resolution.ts`), not inferred.

**Research date:** 2026-10-31
**Valid until:** No external-dependency expiry; revalidate only if `src/contracts/draft.ts`, `src/server/capabilities.ts`, or `src/cli/run.ts` change materially before planning executes (internal-only staleness risk, not a time-boxed external one).
