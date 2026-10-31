# Phase 17: Agent Protocol Extension & Marketplace Skill - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 11 (9 in `diff-review`, 2 in `shipwithai-skills`)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/contracts/request.ts` (add `UncommittedRequestSchema`, `FilesRequestSchema`) | model (Zod contract) | request-response | same file's `RevisionRequestSchema`/`ExactPatchRequestSchema` (lines 36-87) | exact |
| `src/cli/request.ts` (extend `AgentRequestErrorKind`, `freezeRequest`) | middleware (validation/framing) | request-response | same file, existing five-kind union + `freezeRequest` if/else (lines 11-57) | exact |
| `src/contracts/draft.ts` (add `ReviewExportV5Schema`, `ReviewExportV6Schema`, `UncommittedExportScopeSchema`, `WorkingTreeDriftFlagSchema`) | model (Zod contract) | transform | same file's `ReviewExportV3Schema`/`ReviewExportV4Schema` + `ExactPatchExportScopeSchema`/`StandaloneExportScopeSchema` (lines 420-529) | exact |
| `src/export/review-export.ts` (add `buildReviewExportV5`, `buildReviewExportV6`) | service (pure builder) | transform | same file's `buildReviewExportV3`/`buildReviewExportV4` (lines 190-265) | exact |
| `src/server/capabilities.ts` — `createUncommittedCapabilityRegistry` (add `attachedCompletion` block) | service (capability registry) | event-driven | `createCapabilityRegistry`'s pinned block (lines 414-480) | exact |
| `src/server/capabilities.ts` — `createStandaloneCapabilityRegistry` (add `attachedCompletion` block) | service (capability registry) | event-driven | `createExactPatchCapabilityRegistry`'s block (lines 715-761) | exact |
| `src/server/capabilities.ts` — drift-accumulation helper (D-03, replaces single `worktreeChangeIndicator()`-adjacent early-return) | utility (stat comparison) | file-I/O | `worktreeChangeIndicator()` + `indexStatIdentity()`/`captureChangeBaseline()`, both registries (lines 1046-1069, 1299-1322) | exact (same function, extend return shape) |
| `src/cli/run.ts` (new `mode:'uncommitted'`/`mode:'files'` dispatch branches in `runOrdinaryAction`) | controller (CLI dispatch) | request-response | same file's `mode:'patch'` branch (lines 1106-1115) + interactive `launchUncommittedSession`/`launchStandaloneSession` (lines 628-944) | exact |
| `src/git/standalone-resolution.ts` (map plain `Error` throws to typed `AgentRequestErrorKind`) | utility (error adapter) | transform | `GitRunnerError`/`GitRunnerErrorKind` (`src/git/runner.ts:19-34`) for the typed-error shape; `resolveOneArgument`/`resolveStandaloneArguments` (lines 79-188) for the three message sites to map | role-match |
| `tests/unit/review-export.test.ts` (V5/V6 cases + V1-V4 regression) | test | transform | same file's V3/V4 fixtures + `snapshot()`/`rangeSnapshot()` helpers (lines 1-104) | exact |
| `tests/e2e/agent-ready-export.spec.ts` (uncommitted/files stdin scenarios) | test | request-response | same file's `'installed exact-patch review grounds...'` scenario (lines 683-772) | exact |

## Pattern Assignments

### `src/contracts/request.ts` (model, request-response)

**Analog:** same file, `RevisionRequestSchema`/`ExactPatchRequestSchema`/`AgentReviewRequestSchema` (lines 32-89)

**Imports pattern** (lines 1-3):
```typescript
import { Buffer } from 'node:buffer';

import { z } from 'zod';
```

**Core pattern — bounded Git argument + discriminated-union branch** (lines 28-46, 62-89):
```typescript
const GitArgumentSchema = z.string().refine(isBoundedGitArgument, {
  message: 'Git arguments must be non-empty, valid Unicode without NUL, and at most 4096 UTF-8 bytes.',
});

const RevisionRangeSchema = z
  .strictObject({
    base: GitArgumentSchema,
    head: GitArgumentSchema,
    pathspecs: z
      .array(GitArgumentSchema)
      .max(MAX_PATHSPEC_COUNT)
      .default(emptyPathspecs)
      .transform((pathspecs) => Object.freeze(pathspecs)),
  })
  .readonly();
// ...
export const AgentReviewRequestSchema = z
  .discriminatedUnion('mode', [RevisionRequestSchema, ExactPatchRequestSchema])
  .readonly();

export type AgentReviewRequest = z.infer<typeof AgentReviewRequestSchema>;
```

**New code to add (per 17-RESEARCH.md Pattern 1):** export `GitArgumentSchema` (currently module-private), add `UncommittedSourceSchema`/`UncommittedRequestScopeSchema` (with a `superRefine` rejecting `base` when `source === 'unstaged'`), `UncommittedRequestSchema`, `FilesRequestScopeSchema` (`paths: z.array(GitArgumentSchema).min(1).max(MAX_PATHSPEC_COUNT)`), `FilesRequestSchema`, and extend the `discriminatedUnion('mode', [...])` array with both new branches. Field names (`source`, `base`, `pathspecs`, `paths`) must mirror Phase 14 CLI flags / Phase 15 positional-args vocabulary, not invent new names.

**Validation pattern:** every object uses `.strictObject(...).readonly()` — no bare `z.object`, no non-readonly schema anywhere in this file.

---

### `src/cli/request.ts` (middleware, request-response)

**Analog:** same file in full (95 lines) — this file IS what gets extended, not a separate analog.

**Imports pattern** (lines 1-7):
```typescript
import { Buffer } from 'node:buffer';

import {
  AgentReviewRequestSchema,
  MAX_AGENT_REQUEST_BYTES,
  type AgentReviewRequest,
} from '../contracts/request.js';
```

**Error-kind convention to extend** (lines 11-36):
```typescript
export type AgentRequestErrorKind =
  | 'empty-request'
  | 'request-too-large'
  | 'invalid-utf8'
  | 'malformed-json'
  | 'unsupported-version'
  | 'invalid-request';

const requestErrorMessages = {
  'empty-request': 'Request input is empty. Pipe one cumpa.review-request JSON document.',
  // ...
} as const satisfies Record<AgentRequestErrorKind, string>;

export class AgentRequestError extends Error {
  readonly kind: AgentRequestErrorKind;

  constructor(kind: AgentRequestErrorKind) {
    super(requestErrorMessages[kind]);
    this.name = 'AgentRequestError';
    this.kind = kind;
  }
}
```

**`freezeRequest` if/else to extend with two more branches** (lines 48-57):
```typescript
function freezeRequest(request: AgentReviewRequest): AgentReviewRequest {
  if (request.mode === 'revisions') {
    Object.freeze(request.revisions.pathspecs);
    Object.freeze(request.revisions);
  } else {
    Object.freeze(request.patch.target);
    Object.freeze(request.patch);
  }
  return Object.freeze(request);
}
```
New code: add `'unknown-mode' | 'base-with-unstaged' | 'path-outside-repository' | 'pathspec-no-match' | 'pathspec-ignored'` to `AgentRequestErrorKind`, matching messages to `requestErrorMessages`, and two pre-check helpers (`isUnknownMode`, `isBaseWithUnstaged`) mirroring the existing `isUnsupportedVersion` style (lines 38-46) used in the `safeParse`-failure branch (lines 87-92). `freezeRequest` becomes an `if/else if/else` chain (or a `switch`) adding `request.mode === 'uncommitted'` → freeze `request.uncommitted.pathspecs`/`.uncommitted`, and `request.mode === 'files'` → freeze `request.files.paths`/`.files`. The three Git-dependent kinds (`path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) are **not** thrown from this file — they are thrown as `new AgentRequestError(...)` from adapters inside `cli/run.ts`'s dispatch (see below), because they need a live repository this file never touches.

---

### `src/contracts/draft.ts` (model, transform)

**Analog:** same file, `ReviewExportV3Schema`/`ExactPatchExportScopeSchema` and `ReviewExportV4Schema`/`StandaloneExportScopeSchema` (lines 420-529)

**Imports pattern** (lines 1-10):
```typescript
import { z } from 'zod';

import {
  ChangedFileSchema,
  ExactPatchValidationTargetSchema,
  ExactPathSchema,
  GitObjectIdSchema,
  RangeReviewScopeSchema,
} from './comparison.js';
import { orderExactPaths, decodeBase64url } from '../domain/path-bytes.js';
```

**Core pattern — strict-superset schema + strip-and-reparse-against-V1 proof** (lines 492-529, V4 shown; V3 at 420-471 is structurally identical):
```typescript
export const ReviewExportV4Schema = z
  .strictObject({
    schemaVersion: z.literal(4),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    standalone: StandaloneExportScopeSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
  })
  .superRefine((document, context) => {
    const feedback = ReviewExportV1Schema.safeParse({
      schemaVersion: 1,
      kind: document.kind,
      exportedAt: document.exportedAt,
      acceptedDraftRevision: document.acceptedDraftRevision,
      comparison: {
        selectedBase: { label: 'preimage', launchOid: '0'.repeat(40) },
        selectedHead: { label: 'postimage', launchOid: '0'.repeat(40) },
        mergeBaseOid: '0'.repeat(40),
        comparisonKey: '0'.repeat(64),
      },
      drift: {
        observedAt: document.exportedAt,
        acknowledged: false,
        base: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
        head: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' },
      },
      summary: document.summary,
      files: document.files,
      counts: document.counts,
    });
    if (!feedback.success) {
      context.addIssue({ code: 'custom', message: 'Version 4 export must retain valid review feedback.' });
    }
  })
  .readonly();
```

**Scope-shape analog for `UncommittedExportScopeSchema`** — `StandaloneExportScopeSchema` (lines 473-490):
```typescript
const StandaloneExportScopeSchema = z
  .strictObject({
    originalArguments: z.array(z.string().min(1)).readonly(),
    resolvedPaths: z.array(ExactPathSchema).readonly(),
    fileDigests: z
      .array(z.strictObject({ path: ExactPathSchema, sha256: z.string().regex(/^[0-9a-f]{64}$/u) }).readonly())
      .readonly(),
    snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .readonly();
```

**New code (per 17-RESEARCH.md Pattern 2):**
- `UncommittedExportScopeSchema`: `sourceKind: z.enum(['staged','unstaged','worktree'])`, `baseCommitOid: GitObjectIdSchema.optional()`, `pathspecs: z.array(z.string()).readonly()`, `reviewKey`, `snapshotChain` — plus a `superRefine` enforcing `baseCommitOid` absent iff `sourceKind === 'unstaged'` (mirrors `UncommittedScopeSchema`'s own `superRefine` in `src/contracts/comparison.ts:148-186`, which already encodes this exact base/no-base split — reuse that logic shape, don't invent a new one).
- `WorkingTreeDriftFlagSchema` (D-03, shared by V5 and V6): `{ changed: boolean, paths: z.array(ExportExactPathSchema).readonly() }` with a `superRefine` that rejects `paths.length !== 0` when `!changed` and rejects `paths.length === 0` when `changed`.
- `ReviewExportV5Schema` (schemaVersion 5): same shape as V4 but with `uncommitted: UncommittedExportScopeSchema` instead of `standalone`, plus `workingTreeChangedAfterFinalSnapshot: WorkingTreeDriftFlagSchema`; `superRefine` strips `uncommitted`/`workingTreeChangedAfterFinalSnapshot` and builds the same zeroed-placeholder-V1 proof as V3/V4 above (uncommitted sources have no committed base/head OIDs either).
- `ReviewExportV6Schema` (schemaVersion 6): V4 **plus** `workingTreeChangedAfterFinalSnapshot`; its `superRefine` strips that one field and reparses the rest through `ReviewExportV4Schema.safeParse({ ...v4Shape, schemaVersion: 4 })` — proving V6 ⊃ V4 directly, rather than re-deriving the V1 proof from scratch.
- Union/type exports at the bottom of the file (lines 542-548) gain `ReviewExportV5`/`ReviewExportV6` members: `export type ReviewExport = ReviewExportV1 | ReviewExportV2 | ReviewExportV3 | ReviewExportV4 | ReviewExportV5 | ReviewExportV6;`

**Why two versions, not one:** `ReviewExportV4Schema` is `strictObject` — adding a field to it would change what `schemaVersion:4` means, violating "V1-V4 unchanged." `uncommitted` and `standalone` scopes are structurally different types already (`UncommittedScopeSchema`'s `sourceKind` enum includes `'standalone'` as a sibling case, not a shared shape), so one shared version can't serve both cleanly.

---

### `src/export/review-export.ts` (service, transform)

**Analog:** same file, `buildReviewExportV3`/`buildReviewExportV4` (lines 190-265)

**Imports pattern** (lines 1-30):
```typescript
import { createHash } from 'node:crypto';

import {
  AnchorVerificationSchema,
  ReviewDraftV1Schema,
  ReviewExportV1Schema,
  ReviewExportV2Schema,
  ReviewExportV3Schema,
  ReviewExportV4Schema,
  orderReviewExportComments,
  orderUtf16CodeUnits,
  type AnchorVerificationDto,
  type ExactPatchExportScope,
  type ReviewDraftV1,
  type ReviewExport,
  type ReviewExportV1,
  type ReviewExportV2,
  type ReviewExportV3,
  type ReviewExportV4,
  type StandaloneExportScope,
} from '../contracts/draft.js';
export type { ReviewExport, ReviewExportV1, ReviewExportV2, ReviewExportV3, ReviewExportV4 } from '../contracts/draft.js';
import type { RangeReviewScope } from '../contracts/comparison.js';
import { orderExactPaths } from '../domain/path-bytes.js';
```

**Core pattern — provenance check, delegate to V1 builder, strip and re-tag** (lines 229-265, V4 shown; V3 at 190-227 identical shape):
```typescript
export function buildReviewExportV4(
  snapshot: AcceptedStandaloneReviewSnapshot,
  standalone: StandaloneExportScope,
  exportedAt: string,
): ReviewExportV4 {
  const draft = ReviewDraftV1Schema.parse(snapshot.acceptedDraft);
  if (
    !('kind' in draft.comparison)
    || draft.comparison.kind !== 'uncommitted'
    || draft.comparison.sourceKind !== 'standalone'
    || draft.comparison.reviewKey !== standalone.reviewKey
  ) {
    throw new TypeError('Standalone export provenance does not match accepted draft.');
  }

  const feedback = buildReviewExportV1(
    {
      acceptedDraft: draft,
      commentVerification: snapshot.commentVerification,
      comparison: { /* zeroed placeholder, see Draft.ts excerpt above */ },
      drift: { /* zeroed placeholder, acknowledged: false */ },
    },
    exportedAt,
  );
  const { comparison: _comparison, drift: _drift, ...document } = feedback;
  return ReviewExportV4Schema.parse({ ...document, schemaVersion: 4, standalone });
}
```

**New code (per 17-RESEARCH.md "V5/V6 builder signatures"):**
```typescript
export interface AcceptedUncommittedReviewSnapshot {
  readonly acceptedDraft: ReviewDraftV1;
  readonly commentVerification: Readonly<Record<string, AnchorVerificationDto>>;
}

export function buildReviewExportV5(
  snapshot: AcceptedUncommittedReviewSnapshot,
  uncommitted: UncommittedExportScope,
  drift: WorkingTreeDriftFlag,
  exportedAt: string,
): ReviewExportV5 { /* same TypeError-on-provenance-mismatch style as buildReviewExportV4;
                       check draft.comparison.kind==='uncommitted' && .sourceKind matches && .reviewKey matches */ }

export function buildReviewExportV6(
  snapshot: AcceptedStandaloneReviewSnapshot,   // reused as-is, same param as V4
  standalone: StandaloneExportScope,            // reused as-is, same type as V4
  drift: WorkingTreeDriftFlag,
  exportedAt: string,
): ReviewExportV6 { /* same provenance check as buildReviewExportV4, plus thread drift through */ }
```
Both delegate to `buildReviewExportV1` exactly like V3/V4, strip `comparison`/`drift`, and `.parse({ ...document, schemaVersion: 5|6, uncommitted|standalone, workingTreeChangedAfterFinalSnapshot: drift })`. `canonicalizeReviewExport`/`parseCanonicalReviewExport`/`zodParseReviewExport` (lines 267-291, a `schemaVersion`-keyed dispatch) need two more arms — re-read the exact switch/if-chain at write time, don't guess its shape from this excerpt.

---

### `src/server/capabilities.ts` — `createUncommittedCapabilityRegistry` `attachedCompletion` block (service, event-driven)

**Analog A (pinned/committed registry):** `createCapabilityRegistry`'s block, lines 414-480
**Analog B (exact-patch registry):** `createExactPatchCapabilityRegistry`'s block, lines 715-761

**Imports already present and reusable unchanged** (lines 1-66): `AttachedCompletionCoordinator` from `./attached-completion.js`; `buildReviewExportV1..V4`, `canonicalizeReviewExport`, `parseCanonicalReviewExport` from `../export/review-export.js`; `FinishReviewResult` from `../contracts/api.js`. Add `buildReviewExportV5`/`buildReviewExportV6` to the existing `../export/review-export.js` import block (lines 48-55).

**Exact template to copy (exact-patch variant, lines 715-761 — closer match than the pinned variant because it has no `range`/`selectorDriftObserver` branching, same as uncommitted/standalone):**
```typescript
const attachedCompletion = options.attachedCompletion === undefined ? undefined : {
  status: () => options.attachedCompletion!.coordinator.status(),
  markResponseSettled: () => options.attachedCompletion!.coordinator.markResponseSettled(),
  finish: async (expectedRevision: number): Promise<FinishReviewResult> => {
    return options.attachedCompletion!.coordinator.finish(expectedRevision, async () => {
      const settled = await draftStore.settle(expectedRevision, {
        prepare: async (acceptedDraft) => {
          const patch = await snapshot.exportScope();
          if (patch.snapshot.status !== 'unchanged') return { kind: 'scopeInvalid' as const };
          const verification = Object.fromEntries(await Promise.all(acceptedDraft.comments.map(async (comment) => [comment.id, await verifyAnchor(comment.anchor)] as const)));
          const affectedCommentIds = acceptedDraft.comments.filter((comment) => verification[comment.id]?.state !== 'verified').map((comment) => comment.id);
          if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
          try {
            const bytes = canonicalizeReviewExport(buildReviewExportV3({ acceptedDraft, commentVerification: verification }, patch, new Date().toISOString()));
            return { kind: 'ready' as const, bytes, revision: acceptedDraft.revision };
          } catch {
            return { kind: 'canonicalizationFailure' as const };
          }
        },
        finalize: async ({ draft, prepared }) => {
          if (prepared.kind !== 'ready') return prepared;
          if ((await snapshot.exportScope()).snapshot.status !== 'unchanged') return { kind: 'scopeInvalid' as const };
          const affectedCommentIds = (await Promise.all(draft.comments.map(async (comment) => ({ id: comment.id, verification: await verifyAnchor(comment.anchor) })))).filter(({ verification }) => verification.state !== 'verified').map(({ id }) => id);
          if (affectedCommentIds.length !== 0) return { kind: 'staleAnchors' as const, affectedCommentIds, affectedCount: affectedCommentIds.length };
          try {
            const document = parseCanonicalReviewExport(prepared.bytes);
            if (document.schemaVersion !== 3 || document.acceptedDraftRevision !== draft.revision) return { kind: 'canonicalizationFailure' as const };
          } catch {
            return { kind: 'canonicalizationFailure' as const };
          }
          try {
            if (!await options.attachedCompletion!.deliver(prepared.bytes)) return { kind: 'deliveryFailed' as const };
            return { kind: 'completed' as const, revision: prepared.revision };
          } catch {
            return { kind: 'deliveryFailed' as const };
          }
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

**Adaptation for `createUncommittedCapabilityRegistry` (currently has NO `attachedCompletion` key at all — confirmed by direct read of lines 897-1148; the function's `Object.freeze({...})` return at lines 1016-1147 ends at `appendCumpaIgnoreRule` with no `attachedCompletion` property anywhere):**
- Replace the `patch.snapshot.status !== 'unchanged'` scope check with D-03's drift check: call the new drift-accumulation helper (see next section) instead of a boolean `exportScope()`.
- `prepare` builds `bytes` via `buildReviewExportV5({ acceptedDraft, commentVerification: verification }, { sourceKind: scope.sourceKind, baseCommitOid: scope.baseCommitOid, pathspecs: requestPathspecs, reviewKey, snapshotChain: snapshotSession.chain }, drift, exportedAt)` — `reviewKey` and `snapshotSession` are already in scope in this function (lines 910-911); `requestPathspecs` must be threaded in from the request's `request.uncommitted.pathspecs` via a new field on `CapabilityRegistryOptions` or captured in the `scope` passed to this factory (confirm exact threading in planning — `UncommittedScope` (`src/contracts/comparison.ts:137-187`) has no `pathspecs` field today; D-03/A3 in 17-RESEARCH.md flags this as a decision point for the planner).
- `finalize` checks `document.schemaVersion !== 5` instead of `!== 3`.
- Add `attachedCompletion,` to the `Object.freeze({...})` return (line 1016 onward), after `appendCumpaIgnoreRule` (line 1144-1146), matching where `createExactPatchCapabilityRegistry` and the pinned registry each place it in their own return blocks.

---

### `src/server/capabilities.ts` — `createStandaloneCapabilityRegistry` `attachedCompletion` block (service, event-driven)

**Analog:** same exact-patch block above (lines 715-761); **sibling reference for export-building style within the same function:** this registry's own existing `exportReview` method (lines 1378-1444), which already calls `buildReviewExportV4` and shows the exact `standaloneScope` object shape to reuse:
```typescript
const standaloneScope = {
  originalArguments: [...scope.standaloneArguments!].sort(),
  resolvedPaths,
  fileDigests,
  snapshotChain: snapshotSession.chain,
  reviewKey,
};
const json = canonicalizeReviewExport(buildReviewExportV4(
  { acceptedDraft, commentVerification },
  standaloneScope,
  exportedAt,
));
```

**Adaptation:** build the same `attachedCompletion` object as above, but `prepare` computes `standalone` the same way `exportReview` already does (resolvedPaths/fileDigests from `snapshot.files()`/`snapshot.readContent()`), calls `buildReviewExportV6({ acceptedDraft, commentVerification: verification }, standaloneScope, drift, exportedAt)`, and `finalize` checks `document.schemaVersion !== 6`. Add `attachedCompletion,` to the `Object.freeze({...})` return (currently ends at `appendCumpaIgnoreRule`, lines 1445-1451) — this registry already has `exportReview`, so unlike the uncommitted registry no new manual-export method is needed, only `attachedCompletion`.

---

### `src/server/capabilities.ts` — drift-accumulation helper (utility, file-I/O)

**Analog:** `worktreeChangeIndicator()` + `indexStatIdentity()`/`captureChangeBaseline()`, identical in both registries (lines 983-1069 and 1236-1322 — byte-for-byte duplicated between the two functions today):
```typescript
const indexStatIdentity = async (): Promise<Readonly<{ readonly size: number; readonly mtimeMs: number }>> => {
  const runner = createGitRunner();
  const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: scope.repositoryRoot });
  const indexPathRaw = result.stdout.toString('utf8').trim();
  const resolvedIndexPath = indexPathRaw.startsWith('/') ? indexPathRaw : join(scope.repositoryRoot, indexPathRaw);
  const info = await lstat(resolvedIndexPath);
  return { size: info.size, mtimeMs: info.mtimeMs };
};
// ...
async worktreeChangeIndicator() {
  const index = await indexStatIdentity();
  if (index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs) {
    return { changed: true };
  }
  const files = await snapshot.files();
  for (const file of files) {
    const diskPath = diskPathFor(file);
    if (diskPath === undefined) continue;
    const expected = changeBaseline.files.get(file.id);
    let actual: StatIdentity | undefined;
    try {
      const info = await lstat(diskPath);
      actual = { size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      actual = undefined;
    }
    const changed = expected === undefined
      ? actual !== undefined
      : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
    if (changed) return { changed: true };   // ← EARLY RETURN: this is what D-03 must NOT do
  }
  return { changed: false };
},
```

**New code (D-03):** add a sibling async function (or an options parameter on the existing loop) that reuses `indexStatIdentity()`/`captureChangeBaseline()`/`diskPathFor()` unchanged but **accumulates every path whose stat differs** instead of returning on the first mismatch:
```typescript
async function collectWorkingTreeDrift(): Promise<WorkingTreeDriftFlag> {
  const index = await indexStatIdentity();
  const files = await snapshot.files();
  const changedPaths: ExactPathDto[] = [];
  if (index.size !== changeBaseline.index.size || index.mtimeMs !== changeBaseline.index.mtimeMs) {
    // index itself changed — still walk files to report which paths moved, same loop body as below
  }
  for (const file of files) {
    const diskPath = diskPathFor(file);
    if (diskPath === undefined) continue;
    const expected = changeBaseline.files.get(file.id);
    let actual: StatIdentity | undefined;
    try {
      const info = await lstat(diskPath);
      actual = { size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      actual = undefined;
    }
    const changed = expected === undefined ? actual !== undefined : actual === undefined || actual.size !== expected.size || actual.mtimeMs !== expected.mtimeMs;
    if (changed) changedPaths.push(file.newPath ?? file.oldPath!);
  }
  return { changed: changedPaths.length > 0, paths: changedPaths };
}
```
Call this once at `finish` time (inside the new `attachedCompletion.prepare`), not on the polling interval `worktreeChangeIndicator()` already serves — the early-return in `worktreeChangeIndicator()` stays as-is for the UI indicator, where it is correct and cheaper. Place this helper right after `captureChangeBaseline()` in both registries (same duplication pattern the file already uses), or factor it to a shared module-level function taking `scope`/`snapshot`/`changeBaseline`/`diskPathFor` as arguments if the planner prefers de-duplication (the file does NOT currently de-duplicate this logic between the two registries, so either approach matches an existing precedent).

---

### `src/cli/run.ts` — new `runOrdinaryAction` dispatch branches (controller, request-response)

**Analog A (existing agent-path template):** `mode:'patch'` branch, lines 1106-1115:
```typescript
if (request.mode === 'patch') {
  const grounded = await (dependencies.createGroundedExactPatch ?? createGroundedExactPatch)({
    cwd: options.cwd,
    patchContent: request.patch.content,
    target: request.patch.target,
    signal: activeGit.signal,
  });
  await launchExactPatchSession(grounded, dependencies, support, activeGit);
  return;
}
```

**Analog B (interactive flow supplying all the Git-dependent resolution calls to reuse):** `launchUncommittedSession` (lines 628-797) and `launchStandaloneSession` (lines 799-944) — both already call every helper the agent path needs:
```typescript
const runner = createGitRunner();
const repository = await discoverGitRepository(options.cwd, runner, activeGit.signal);
const objectFormat = await resolveUncommittedObjectFormat(repository.root, runner, activeGit.signal);
let baseCommitOid: string | undefined;
let mergeBaseOid: string | undefined;
if (selection.sourceKind !== 'unstaged') {
  baseCommitOid = await resolveUncommittedBaseCommitOid(selection.baseRef, repository, runner, activeGit.signal);
  mergeBaseOid = await resolveUncommittedMergeBaseOid(baseCommitOid, repository.headOid, repository.root, runner, activeGit.signal);
}
const changedFiles = await createWorktreeChangedFileInventory(
  { sourceKind: selection.sourceKind, repositoryRoot: repository.root, objectFormat, signal: activeGit.signal, ...(mergeBaseOid === undefined ? {} : { mergeBaseOid }) },
  { runner },
);
const scope: UncommittedScope = UncommittedScopeSchema.parse({ kind: 'uncommitted', sourceKind: selection.sourceKind, repositoryRoot: repository.root, objectFormat, changedFiles, ...(baseCommitOid === undefined ? {} : { baseCommitOid }), ...(mergeBaseOid === undefined ? {} : { mergeBaseOid }) });
```
and for standalone (lines 850-875):
```typescript
const resolvedPaths = await resolveStandaloneArguments(repository.root, paths, { runner });
const gitStates = await classifyStandaloneGitState(repository.root, resolvedPaths, { runner });
const changedFiles = await createStandaloneChangedFileInventory(repository.root, resolvedPaths, gitStates, objectFormat, { runner, signal: activeGit.signal });
const scope: UncommittedScope = UncommittedScopeSchema.parse({ kind: 'uncommitted', sourceKind: 'standalone', repositoryRoot: repository.root, objectFormat, standaloneArguments: paths, changedFiles });
```

**`launchAttachedSession` — the exact helper to reuse unchanged** (lines 975-1054), already the single "wait for Finish, deliver one canonical result to stdout, exit" machine `launchExactPatchSession` wraps (lines 1056-1082):
```typescript
async function launchExactPatchSession(
  grounded: GroundedExactPatch,
  dependencies: OrdinaryActionDependencies,
  support: SupportCapability | undefined,
  activeGit: AbortController,
): Promise<void> {
  await launchAttachedSession(dependencies, support, activeGit, async (sessionToken, attachedCompletion, revealDraftFile) => {
    return await (dependencies.createExactPatchSessionApp ?? createExactPatchSessionApp)(grounded, {
      webRoot: dependencies.webRoot, sessionToken, revealDraftFile, support, attachedCompletion,
      diagnostics: () => { (dependencies.output ?? console.error)('Exact patch review request denied.'); },
    });
  });
}
```

**New code:** two new branches inside `runOrdinaryAction`'s `try` block (before the final `const comparison = await createRangeComparison(...)` fallback for `mode:'revisions'`), each combining Analog B's Git-dependent resolution with Analog A's `launchAttachedSession(...)` call instead of the interactive `app.listen()`/`openBrowser()`/keypress-refresh sequence `launchUncommittedSession`/`launchStandaloneSession` use. New helper functions `launchUncommittedAgentSession`/`launchStandaloneAgentSession` should mirror `launchExactPatchSession`'s shape exactly (thin wrapper calling `launchAttachedSession` with `createUncommittedSessionApp`/`createStandaloneSessionApp`), not the full interactive functions' shutdown/keypress machinery, which doesn't apply to the one-shot agent path. The Git-dependent validation errors (`path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) must be thrown as `new AgentRequestError(...)` from adapter functions (`mapGitPathspecError`, `mapStandaloneResolutionError`) wrapped around `createWorktreeChangedFileInventory(...).catch(...)` and `resolveStandaloneArguments(...).catch(...)` respectively — see the `standalone-resolution.ts` entry below for the exact messages to pattern-match.

**Error-catch pattern to extend** (lines 1140-1156) — `AgentRequestError` is already caught here, so no new catch arm is needed, only the two adapters above must guarantee they always throw `AgentRequestError` (never a bare `Error`) before it reaches this handler:
```typescript
} catch (error) {
  if (
    error instanceof AgentRequestError
    || error instanceof ExactPatchGroundingError
    || error instanceof PatchSnapshotError
    || (isLaunchError(error) && error.recovery.kind === 'exit')
  ) {
    output(error instanceof ExactPatchGroundingError || error instanceof PatchSnapshotError ? 'Exact patch review could not be prepared.' : error.message);
    setExitStatus(1);
    return;
  }
  throw error;
}
```

---

### `src/git/standalone-resolution.ts` — error-kind mapping adapter (utility, transform)

**Analog for the typed-error shape:** `GitRunnerError`/`GitRunnerErrorKind` (`src/git/runner.ts:19-34`):
```typescript
export type GitRunnerErrorKind = 'aborted' | 'exit' | 'spawn' /* ... */;

export class GitRunnerError extends Error {
  readonly kind: GitRunnerErrorKind;
  readonly exitCode: number | null;
  readonly stderr: Buffer;
  constructor(kind: GitRunnerErrorKind, message: string, options: { readonly cause?: unknown; /* ... */ }) { /* ... */ }
}
```

**Existing plain-`Error` throw sites to map (lines 79-188, this file, already read in full):**
```typescript
// resolveOneArgument, line 92 — path escapes the repository boundary
throw new Error(`Argument "${argument}" resolves outside the repository.`);

// resolveOneArgument, lines 120-122 — matched only an explicitly-ignored path
throw new Error(`Argument "${argument}" matched only a path excluded via .gitignore; it was not opened.`);

// resolveOneArgument, line 124 — matched nothing at all
throw new Error(`Argument "${argument}" did not match any file.`);
```

**Adaptation (per 17-RESEARCH.md Pitfall 4, option (a), the default/cheapest path unless the planner chooses otherwise):** write `mapStandaloneResolutionError(error: unknown): never` in `src/cli/run.ts` as a regex-matching adapter over `.message`, explicitly documented as coupled to these three message strings:
```typescript
function mapStandaloneResolutionError(error: unknown): never {
  if (error instanceof Error) {
    if (/resolves outside the repository/.test(error.message)) throw new AgentRequestError('path-outside-repository');
    if (/matched only a path excluded via \.gitignore/.test(error.message)) throw new AgentRequestError('pathspec-ignored');
    if (/did not match any file/.test(error.message)) throw new AgentRequestError('pathspec-no-match');
  }
  throw error;
}
```
`src/cli/run.ts:932-943`'s existing `catch (error) { if (error instanceof Error) { output(error.message); return; } throw error; }` in `launchStandaloneSession` already only reads `.message`, so this adapter does not break the interactive CLI path. A second helper `mapGitPathspecError` performs the equivalent mapping for `createWorktreeChangedFileInventory`'s pathspec-outside-repository failures in the `uncommitted` branch (Git's own exit-128 signal, reusing the same `GitRunnerError.kind === 'exit' && error.exitCode === 128` check already used inside `resolveOneArgument`, line 91).

**Pitfall to flag explicitly (per 17-RESEARCH.md Pitfall 2):** apply `pathspec-no-match` only to `files` mode's `paths` (every named argument must resolve to something). `uncommitted` mode's optional `pathspecs` filtering down to zero files is **not** an error — it's an empty-but-valid session, same as Phase 14 D-03's "no changes" rule. Do not route `createWorktreeChangedFileInventory`'s empty-result case through `mapGitPathspecError`'s "no match" branch.

---

### `tests/unit/review-export.test.ts` (test, transform)

**Analog:** same file's fixture builders and V3/V4 round-trip assertions (lines 1-104 read in full; V3/V4 `test(...)` blocks follow the same file past line 104)

**Fixture pattern to extend** (lines 25-104):
```typescript
function path(utf8: string) { return { bytesBase64url: /* base64url(utf8) */, display: utf8, utf8 }; }
function comment(overrides: Record<string, unknown> = {}) { return { id: commentId, state: 'open' as const, body: '...', anchor: { /* durable-anchor-v1 shape */ }, ...overrides }; }
function snapshot(comments = [comment()]) {
  return {
    acceptedDraft: { schemaVersion: 1 as const, comparison: { baseCommitOid: oid, headCommitOid: oid, mergeBaseOid: oid }, revision: 4, summary: '', comments },
    commentVerification: Object.fromEntries(comments.map((item) => [item.id, { state: 'verified' as const, reason: 'exact-match' as const }])),
    comparison: { /* zeroed-shape */ },
    drift: { /* zeroed-shape */ },
  };
}
```
**New code:** add `uncommittedSnapshot()`/`standaloneSnapshot()` sibling builders following `rangeSnapshot()`'s pattern (lines 86-104) — override `acceptedDraft.comparison` to the `{ kind: 'uncommitted', sourceKind, ... }` shape `buildReviewExportV5`/`V6` require for their provenance checks, then assert: (1) `ReviewExportV5Schema.parse(buildReviewExportV5(...))` round-trips; (2) `ReviewExportV6Schema.parse(buildReviewExportV6(...))` round-trips; (3) every existing V1-V4 `test(...)` block in this file still passes unmodified (regression — these must not be touched, only read to confirm nothing in the file's shared fixtures changed shape).

---

### `tests/e2e/agent-ready-export.spec.ts` (test, request-response)

**Analog:** `'installed exact-patch review grounds the submitted patch and emits canonical V3 only after Finish'` (lines 683-772, the closest existing stdin-driven agent scenario — `mode:'patch'` is structurally identical to the new `mode:'uncommitted'`/`mode:'files'` scenarios: build a request object, spawn the CLI with it on stdin, drive the browser to Finish, parse the resulting canonical bytes).

**Imports already present and reusable** (lines 1-38): `ReviewExportV1Schema`, `ReviewExportV3Schema` from `../../src/contracts/draft.js` (add `ReviewExportV5Schema`/`ReviewExportV6Schema`); `parseCanonicalReviewExport` from `../../src/export/review-export.js`; `createDirtyGitFixture`, `captureSourceControlSnapshot`/`assertSourceControlUnchanged`, `openRuntimeSession` helpers — all reusable unchanged.

**Core pattern to copy** (lines 683-772, abbreviated to the shape; full excerpt already captured above in file-read):
```typescript
test('installed exact-patch review grounds the submitted patch and emits canonical V3 only after Finish', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createDirtyGitFixture('branch-to-worktree', 8);
  try {
    const before = await captureSourceControlSnapshot(fixture.root);
    const request = { kind: 'cumpa.review-request', schemaVersion: 1, mode: 'patch', patch: { content: patch, target: { kind: 'repository' } } };
    const running = startAttachedCli(fixture, { base: fixture.baseRef, head: fixture.headRef }, request);
    try {
      const url = await waitForAttachedLoopbackUrl(running);
      expect(readFileSync(running.stdoutPath)).toEqual(Buffer.alloc(0));
      await openAcceptanceRuntimeSession(page, url);
      await addHeadComment(page, 'Grounded exact-patch feedback.', 9, '...');
      const finished = page.waitForResponse((response) => response.url().includes('/api/review-completion/finish'));
      await page.getByRole('button', { name: 'Finish review', exact: true }).click();
      const finishResponse = await finished;
      expect(finishResponse.status(), await finishResponse.text()).toBe(201);
      expect(await waitForAttachedExit(running)).toBe(0);
      const bytes = readFileSync(running.stdoutPath);
      const exported = ReviewExportV3Schema.parse(parseCanonicalReviewExport(bytes));
      // ... assert provenance fields match the request/fixture
      await registerSourceControlAssertion('exact-patch', before, fixture);
      completedScenarios.add('exact-patch');
    } finally { /* kill/cleanup running */ }
  } finally { await fixture.cleanup(); }
});
```
**New code:** two scenarios (`'uncommitted'`, `'files'`), each: builds a `request` object with `mode: 'uncommitted'`/`mode: 'files'` and the new field shapes from `src/contracts/request.ts`; spawns via `startAttachedCli`; asserts `ReviewExportV5Schema`/`ReviewExportV6Schema.parse(...)` round-trips; asserts `workingTreeChangedAfterFinalSnapshot.changed === false` in the clean case and add a dedicated scenario mutating a file mid-review (after opening the browser session, before clicking Finish) to assert `changed: true` with the expected `paths` array (D-03). Register each new scenario name in `sourceIndependentScenarios`/`completedScenarios`/`requiredScenarios` (lines 48-58) exactly as `'exact-patch'` already is, or confirm via the file's own scenario-registration convention at write time — don't invent a different tracking mechanism.

**Validation-error scenarios (AGENT-09):** add scenarios asserting `AgentRequestError`'s exit code/message for each new error kind (`unknown-mode`, `base-with-unstaged`, `path-outside-repository`, `pathspec-no-match`, `pathspec-ignored`) **before any browser launch** — assert `readFileSync(running.stdoutPath)` stays empty and no loopback URL ever appears in stderr, distinguishing these from the post-launch scenarios above.

---

## Shared Patterns

### Error-kind convention (flat literal union + `satisfies Record<K,string>` message map + `Error` subclass carrying `.kind`)
**Source:** `src/cli/request.ts:11-36` (`AgentRequestErrorKind`), `src/git/runner.ts:19-34` (`GitRunnerErrorKind`)
**Apply to:** every new error path in Phase 17 — `AgentRequestErrorKind`'s five new members, and (if the planner picks Pitfall 4 option (b)) a `StandaloneResolutionError` class following the identical shape. No other error-kind scheme exists in the codebase for this purpose; do not invent a third style.

### Strict-superset export schema + strip-and-reparse proof
**Source:** `src/contracts/draft.ts:434-471` (V3), `:492-529` (V4)
**Apply to:** `ReviewExportV5Schema`, `ReviewExportV6Schema`. Every `ReviewExportVN` (N≥2) is `.strictObject(...).superRefine(...)` where the `superRefine` proves "this is a valid V1 document in disguise" (V3/V4/V5 via zeroed-placeholder reconstruction) or "this is a valid V(N-1) document plus one field" (V6 via field-strip). Never relax `strictObject` to `object`/`passthrough` to add a field to an existing version.

### `attachedCompletion` capability block
**Source:** `src/server/capabilities.ts:414-480` (pinned), `:715-761` (exact-patch)
**Apply to:** `createUncommittedCapabilityRegistry`, `createStandaloneCapabilityRegistry`. Identical `status`/`markResponseSettled`/`finish` shape in all four registries after this phase; only the `prepare`/`finalize` scope-check and `buildReviewExportVN`/`schemaVersion` literal differ per registry.

### One-shot agent completion / stdout delivery
**Source:** `src/server/attached-completion.ts` (`AttachedCompletionCoordinator`), `src/cli/run.ts:975-1054` (`launchAttachedSession`)
**Apply to:** both new `launchUncommittedAgentSession`/`launchStandaloneAgentSession` helpers in `cli/run.ts`. Never build a second "wait for POST then write stdout" loop — this is the one mechanism that keeps "exactly one canonical result" true across all four request kinds (AGENT-06/07/08).

### Canonical JSON serialization
**Source:** `src/export/review-export.ts:74-99` (`serializeCanonicalJson`), `:267-269` (`canonicalizeReviewExport`)
**Apply to:** `buildReviewExportV5`/`V6` — call `canonicalizeReviewExport(buildReviewExportV5(...))` at every call site exactly as V1-V4 do; never hand-roll `JSON.stringify` for export bytes.

## No Analog Found

None. Every file in scope (per 17-RESEARCH.md's "Don't Hand-Roll" table and direct codebase reads) extends an existing sibling pattern in the same file or a structurally identical sibling file; no new algorithm, new directory, or new architectural shape is introduced anywhere in Phase 17.

## Marketplace Skill (separate repo: `/Users/alessandro/projects/shipwithai-skills`)

This repo has its own independent analog set — its prior version is the closest (and only relevant) reference, since application-code patterns from `diff-review` don't transfer to documentation/shell-script content.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `skills/cumpa/SKILL.md` (prerequisite bump, new request-mode examples) | config (agent-facing workflow doc) | request-response (documents a protocol, doesn't execute one) | same file's existing `## Requirements` + `## Native exact-patch mode` sections | exact |
| `skills/cumpa/scripts/check-cumpa.mjs` (version-gate regex bump) | utility (CLI prerequisite probe) | request-response (spawn + parse) | same file, in full | exact |

### `skills/cumpa/SKILL.md`

**Analog:** same file, `## Requirements` (lines 11-17) and `## Native exact-patch mode` (lines 87-95) — the latter is the exact precedent for "add a new mode's JSON shape as its own doc section."

**Requirements section to bump** (lines 13, 15, verbatim current text):
```text
The CLI is installed separately. Require Node.js 24+, Git 2.43.0+, and a stable Cumpa version `>=1.5.0 <2.0.0`; prereleases are not accepted. The bundled checker accepts valid build metadata without changing version precedence.

Only Cumpa 1.5.0 has independent release verification. Acceptance of later stable 1.x versions is a compatibility policy, not a claim that those releases were tested.
```
**New code (per D-06):** replace `>=1.5.0 <2.0.0` with `>=2.0.0 <3.0.0` everywhere it appears (lines 13, 24's `npm install --global @shipwithai/cumpa@1.5.0` guidance text, and 21's embedded `text` code block), and replace "Only Cumpa 1.5.0 has independent release verification" with the Phase 17 equivalent naming the verified `2.0.0`/`2.0.0-dev` locally-packed baseline (D-05) — never claim a published-release verification that hasn't happened (release is outside this phase's scope per the Deferred Ideas section of CONTEXT.md).

**Mode-example section pattern to copy** (lines 87-95, exact-patch section — use as the literal template for two new sections, `## Native uncommitted mode` and `## Native standalone-file mode`):
```text
## Native exact-patch mode

Use exact-patch mode only when the user explicitly supplies a patch or asks to review one. Do not synthesize patches or temporary commits to extend Cumpa.

\`\`\`json
{"kind":"cumpa.review-request","schemaVersion":1,"mode":"patch","patch":{"content":"<exact UTF-8 patch>","target":{"kind":"repository"}}}
\`\`\`

`target.kind` is `repository` for committed `HEAD` or `worktree` for current on-disk entries. The patch must be non-empty, NUL-free UTF-8 and the entire request must not exceed 1 MiB.
```
**New code:** two sections with the same three-part shape (when-to-use guidance, fenced `json` example matching the exact `UncommittedRequestSchema`/`FilesRequestSchema` field names from `src/contracts/request.ts`, then a short field-semantics note) — e.g.:
```json
{"kind":"cumpa.review-request","schemaVersion":1,"mode":"uncommitted","uncommitted":{"source":"worktree","base":"<ref-or-oid>"}}
```
```json
{"kind":"cumpa.review-request","schemaVersion":1,"mode":"files","files":{"paths":["src/a.ts","src/b.ts"]}}
```
Field names in these examples must be copied byte-for-byte from the planner's final `src/contracts/request.ts` schema (`source`/`base`/`pathspecs` and `paths`) — do not invent alternate names.

**`## Protocol invariants` section (lines 97-104)** also needs one new bullet distinguishing "Cumpa reviews committed worktree `HEAD`, not dirty worktree bytes" (line 102, now only true for `revisions`/`patch` modes) from the new uncommitted/files modes, which explicitly do review dirty worktree bytes — this existing invariant bullet becomes mode-conditional, not universally true, once Phase 17 ships.

### `skills/cumpa/scripts/check-cumpa.mjs`

**Analog:** same file in full (33 lines, already read in full above).

**Current version-gate regex and acceptance logic (lines 1-33):**
```javascript
import { spawnSync } from 'node:child_process';

let acceptedVersion;

try {
  const result = spawnSync('cumpa', ['--version'], {
    encoding: 'utf8', shell: false, timeout: 10_000, killSignal: 'SIGKILL', maxBuffer: 4_096,
  });
  if (!result.error && !result.signal && result.status === 0) {
    const version = result.stdout.replace(/\r?\n$/, '');
    const match = /^1\.(0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    if (match && match[0] === version && (match[1].length > 1 || match[1] >= '5')) {
      acceptedVersion = version;
    }
  }
} catch {
  // Probe exceptions use the same recovery path without exposing process details.
}

if (acceptedVersion === undefined) {
  process.stderr.write('npm install --global @shipwithai/cumpa@1.5.0\nRequires Node.js 24+ and Git 2.43.0+.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${acceptedVersion}\n`);
}
```
**New code (per D-06):** change the major-version literal from `1\.` to `2\.` in the regex, and the minor-floor condition from `(match[1].length > 1 || match[1] >= '5')` (accepts `1.5+`) to accept all `2.x` (minor floor is `0`, since the entire `2.0.0` release is the first supported one — drop the minor-floor sub-condition entirely, since D-06 says "the final prerequisite is `<new-package> >=2.0.0 <3.0.0`" with no minor floor inside 2.x). Update the `spawnSync`/error-path guidance string from `npm install --global @shipwithai/cumpa@1.5.0` to `npm install --global @shipwithai/cumpa@2.0.0`. The `spawnSync` invocation itself (timeout, `shell: false`, `killSignal`, `maxBuffer`, the bare `try { } catch { }` swallow-and-fall-through-to-stderr style) needs no change — it is process-probing plumbing independent of the version policy.

## Metadata

**Analog search scope:** `src/contracts/`, `src/cli/`, `src/export/`, `src/server/`, `src/git/`, `tests/unit/`, `tests/e2e/`, `tests/package/` in `diff-review`; `skills/cumpa/` in `shipwithai-skills`.
**Files read in full or by targeted non-overlapping range:** `src/contracts/request.ts` (full), `src/cli/request.ts` (full), `src/contracts/draft.ts` (full + targeted re-reads of lines 420-529), `src/export/review-export.ts` (full + targeted re-read of 190-269), `src/contracts/comparison.ts` (full + targeted re-read of 137-187), `src/git/standalone-resolution.ts` (full + targeted re-read of 79-188), `src/git/runner.ts` (targeted, 18-37), `src/server/capabilities.ts` (targeted: 1-103, 413-483, 714-764, 896-1452), `src/cli/run.ts` (targeted: 1-43, 497-540, 627-947, 974-1160), `tests/unit/review-export.test.ts` (targeted, 1-104), `tests/e2e/agent-ready-export.spec.ts` (targeted: 1-83, 682-776), `tests/e2e/standalone-review.spec.ts` (targeted, 1-63), `tests/package/agent-ready-export.test.ts` (targeted, 1-103), `shipwithai-skills/skills/cumpa/SKILL.md` (full), `shipwithai-skills/skills/cumpa/scripts/check-cumpa.mjs` (full).
**Pattern extraction date:** 2026-10-31
