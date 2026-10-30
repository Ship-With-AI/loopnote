# Phase 14: Uncommitted Source Review & Frozen Snapshots - Pattern Map

**Mapped:** 2026-10-30
**Files analyzed:** 19 (10 new, 9 modified)
**Analogs found:** 17 / 19

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/git/worktree-inventory.ts` (NEW) | service (git adapter) | request-response (spawn git, parse) | `src/git/inventory.ts` (`createChangedFileInventory`) | exact |
| `src/git/worktree-content.ts` (NEW) | service (git adapter) | transform (hunk → pre/post text) | `src/git/exact-patch.ts` (hunk-replay `applyText`, `completeHunk`/`append`) | role-match (inverse operation) |
| `src/server/snapshot-fs.ts` (NEW) | utility (extracted primitives) | file-I/O | `src/server/patch-snapshot.ts` (module-private `boundedFileBytes`/`writeOwned`/`digest`/`frame`/`syncDirectory`/`isMissing`) | exact (mechanical extraction) |
| `src/server/worktree-snapshot.ts` (NEW) | service (snapshot capture/mutate) | file-I/O + event-driven (`refresh()`) | `src/server/patch-snapshot.ts` (`PatchSnapshot` class, `materializePatchSnapshot`) | exact (structural sibling) |
| `src/server/patch-snapshot.ts` (MODIFIED) | service | file-I/O | itself (refactor only — import from `snapshot-fs.ts`) | exact |
| `src/domain/comparison-key.ts` (MODIFIED — add `uncommittedReviewKey()`) | utility (pure hash fn) | transform | itself (`rangeReviewKey()`, same file, lines 26-39) | exact |
| `src/contracts/comparison.ts` (MODIFIED — `UncommittedScopeSchema`, `'changed-during-capture'` enum value) | model (zod contract) | transform | itself (`UnsupportedAvailabilityReasonSchema`, `AvailabilitySchema`, lines 93-114) | exact |
| `src/contracts/draft.ts` (MODIFIED — `UncommittedDraftComparisonSchema`) | model (zod contract) | transform | itself (`ExactPatchDraftComparisonSchema`, lines 83-94) | exact |
| `src/server/draft-loader.ts` (MODIFIED — `sameComparison()` new branch) | service | request-response | itself (lines 55-84, 96-109) | exact |
| `src/server/app.ts` (MODIFIED/NEW — `createUncommittedSessionApp`) | service (session factory) | request-response | itself (`createSessionApp`, line 133) | role-match |
| `src/server/capabilities.ts` (MODIFIED/NEW — `createUncommittedCapabilityRegistry`) | service (DI/wiring) | request-response | itself (`createCapabilityRegistry`, line 297) | role-match |
| `src/server/routes.ts` (MODIFIED — new `POST /api/refresh`, passive-indicator poll endpoint) | controller (Fastify routes) | request-response | itself (`/api/patch-status` GET lines 197-212, `/api/support/refresh` POST lines 141-144, `/api/draft/recovery` POST lines 460-477) | exact |
| `src/cli/picker.ts` (MODIFIED — `Uncommitted` group, Base-prompt copy variant) | controller (TTY prompt) | request-response | itself (`buildSourceSearchItems` lines 191-226, `candidateItem` lines 159-189) | exact |
| `src/cli/run.ts` (MODIFIED — `--staged`/`--unstaged`/`--worktree`/`--base` flags) | controller (Commander CLI) | request-response | itself (`Command()` chain, line 754) — **no flag-parsing analog exists yet** | no-analog (see below) |
| `src/git/selector-drift.ts` (reused as model, not modified) | service (polling observer) | pub-sub-ish/polling | — (this IS the model for D-14's indicator) | n/a (source, not target) |
| `src/web/components/IdentityHeader.vue` (MODIFIED — comparison-strip 3rd branch, Refresh button, change indicator) | component (Vue) | event-driven | itself (`isExactPatch` ternary lines 23, 74-95, 99, `dirtyEndpoints` lines 37-47) | exact |
| `src/web/components/ui/UiIcon.vue` (MODIFIED — new `refresh` glyph) | component (Vue, icon atom) | transform | itself (existing 12-glyph `v-else-if` chain, lines 2-14, 35-80) | exact |
| `src/web/components/InlineNotice.vue` (MODIFIED — `dismissible`/`dismiss-label` prop + `dismiss` event) | component (Vue) | event-driven | itself (current props/template, lines 6-38) | exact |
| `src/web/components/FileRow.vue` (MODIFIED — `changed-during-capture` availability case, post-Refresh `Changed` marker) | component (Vue) | transform (render) | itself (`availabilityLabel` computed lines 28-37, `.availability-marker` template lines 65-73) | exact |
| `src/web/App.vue` (MODIFIED — session banner, Refresh summary panel, change-indicator polling) | component (Vue, shell) | event-driven + polling | itself (`refreshPatchStatusWhenVisible`/`patchStatusInterval` lines 881-884, 1000-1009; `.shell-warning-stack` lines 1110-1114) | exact |
| `src/domain/anchor.ts` | — | — | **untouched per D-21/Required Focus 1** — zero schema change, `blobOid` field stays a Git-format hex digest regardless of producer (real vs. synthetic) | n/a — explicitly out of scope |

## Pattern Assignments

### `src/git/worktree-inventory.ts` (service, request-response)

**Analog:** `src/git/inventory.ts` (`createChangedFileInventory`, lines 1-227)

**Imports pattern** (`inventory.ts:1-16`):
```typescript
import { createHash, randomBytes } from 'node:crypto';

import { ChangedFileSchema } from '../contracts/comparison.js';
import type { ChangedFile, ChangedFileStatusKind } from '../contracts/comparison.js';
import type { ExactPath } from '../domain/path-bytes.js';
import { decodeBase64url } from '../domain/path-bytes.js';
import { classifyAvailability } from './availability.js';
import { createObjectReader } from './objects.js';
import type { ObjectReader } from './objects.js';
import { joinDiffStats, parseNumstat } from './numstat.js';
import { parseRawDiff } from './raw-diff.js';
import type { RawDiffRecord } from './raw-diff.js';
import { createGitRunner } from './runner.js';
```

**Shared diff-flag constant** (`inventory.ts:62-69`), reuse verbatim and extend per source-kind endpoints (RESEARCH.md Pattern 1):
```typescript
const sharedDiffOptions = [
  '-z',
  '--find-renames=50%',
  '--find-copies=50%',
  '--find-copies-harder',
  '--no-ext-diff',
  '--no-textconv',
] as const;
```

**Core invocation pattern — parallel `--raw`/`--numstat` runner calls** (`inventory.ts:140-174`), one call site per source kind per RESEARCH.md Pattern 1 (never a single parameterized function):
```typescript
export async function createChangedFileInventory(
  options: CreateChangedFileInventoryOptions,
  dependencies: ChangedFileInventoryDependencies = {},
): Promise<readonly ChangedFile[]> {
  const pathspecTail = Object.freeze(['--', ...(options.pathspecs ?? emptyPathspecs)]);
  const runner = dependencies.runner ?? createGitRunner();
  const [rawResult, numstatResult] = await Promise.all([
    runner.run(
      ['diff', '--raw', sharedDiffOptions[0], '--no-abbrev', ...sharedDiffOptions.slice(1),
       options.mergeBaseOid, options.headOid, ...pathspecTail],
      { cwd: options.repositoryRoot, signal: options.signal },
    ),
    runner.run(
      ['diff', '--numstat', ...sharedDiffOptions, options.mergeBaseOid, options.headOid, ...pathspecTail],
      { cwd: options.repositoryRoot, signal: options.signal },
    ),
  ]);
  const joined = joinDiffStats(parseRawDiff(rawResult.stdout), parseNumstat(numstatResult.stdout));
  // ...filter isCumpaInternalPath, map to ChangedFile via classifyAvailability, ChangedFileSchema.parse
}
```
For `worktree-inventory.ts`, replace `options.mergeBaseOid, options.headOid` with per-source-kind endpoints exactly as RESEARCH.md's System Architecture Diagram specifies:
- Staged: `['diff', '--cached', '--raw', '-z', ...]` then same with `--numstat`, endpoint = `mergeBaseOid` only (one-sided, since `--cached` always compares against the given tree).
- Unstaged: identical `--raw`/`--numstat` calls with **no** trailing OID args at all (index→worktree).
- Working tree: same two calls as Staged (tracked side) **plus** a third `runner.run(['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs])` call for untracked files (D-07).

**Internal-path filtering + error handling** (`inventory.ts:74-87, 180-187`): reuse `isCumpaInternalPath()` unchanged — do not reimplement.

---

### `src/git/worktree-content.ts` (service, transform)

**Analog:** `src/git/exact-patch.ts` hunk-walk (`applyText`, lines 362-425) — same line-classification idiom, inverted purpose (that function *replays* a submitted patch against a known preimage; this one *reads* pre/post text directly off Git's own hunk, since Git already normalized it).

**Hunk-line classification excerpt to model against** (`exact-patch.ts:383-421`):
```typescript
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index]!;
  const header = /^@@ -(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? \+(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? @@(?: .*)?$/u.exec(line);
  if (header !== null) { /* start new hunk, carry forward unchanged context lines */ continue; }
  const prefix = line[0];
  if (prefix !== ' ' && prefix !== '+' && prefix !== '-') fail();
  // ' ' or '-' => belongs to preimage; ' ' or '+' => belongs to postimage
}
```
New code invokes `git diff -U1000000 --no-color --no-ext-diff --no-textconv [--cached] [<endpoint>] -- <path>` (RESEARCH.md Pattern 2 code example, `src/git/worktree-content.ts` target) and walks the single full-context hunk this way to recover preimage (context+`-` lines) and postimage (context+`+` lines) — never an independent `fs.readFile` compared against an `ObjectReader` read, per the CRLF pitfall (Required Focus 2).

**Synthetic blob OID** (`exact-patch.ts:427-429`), reuse verbatim for non-object-backed sides:
```typescript
function blobOid(bytes: Buffer, format: 'sha1' | 'sha256'): string {
  return createHash(format).update(`blob ${bytes.length}\0`, 'ascii').update(bytes).digest('hex');
}
```

---

### `src/server/snapshot-fs.ts` (utility, file-I/O) — new, mechanical extraction

**Source to extract from:** `src/server/patch-snapshot.ts` (currently module-private, no `export` keyword) — move these six functions verbatim, add `export`, and have both `patch-snapshot.ts` and `worktree-snapshot.ts` import them.

**`digest`/`frame`** (`patch-snapshot.ts:123-132`):
```typescript
function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function frame(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}
```

**`isMissing`** (`patch-snapshot.ts:202-204`):
```typescript
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
```

**`boundedFileBytes`** (`patch-snapshot.ts:222-241`) — single-file bracket-and-verify read, the base for Required Focus 3(a)'s N-file retry loop:
```typescript
async function boundedFileBytes(path: Buffer, expectedBytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== expectedBytes || expectedBytes > MAX_SIDE_BYTES) {
      throw new Error('Target file differs from its frozen size.');
    }
    const bytes = Buffer.allocUnsafe(expectedBytes + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== expectedBytes) throw new Error('Target file changed during observation.');
    return bytes.subarray(0, expectedBytes);
  } finally {
    await handle.close();
  }
}
```

**`writeOwned`/`syncDirectory`** — same file, lines 175-193 (atomic-write + `0o600`/`0o700` mode discipline); extract verbatim, no behavior change.

---

### `src/server/worktree-snapshot.ts` (service, file-I/O + event-driven)

**Analog:** `src/server/patch-snapshot.ts` `PatchSnapshot` class (lines 309-534) and `materializePatchSnapshot` (536-591) — structural sibling, **not** a widened version (RESEARCH.md Discretion Resolution 4: new `WorktreeSnapshotManifestSchema` in its own version space).

**Manifest schema shape to mirror** (`patch-snapshot.ts:38-108`, `SnapshotSideSchema`/`SnapshotEntrySchema`/`SnapshotManifestSchema`) — add the new `WorktreeSnapshotManifestSchema` with the same `z.strictObject(...).superRefine(...).readonly()` shape, but with a `captureStatus: 'captured' | 'changed-during-capture'` field per entry (no equivalent in `SnapshotEntrySchema`) and a `chain: z.array(digest).min(1).readonly()` field on the manifest (no equivalent in `SnapshotManifestSchema`, which is for a single immutable capture).

**New capability — `refresh()`, freeze-then-observe-then-mutate** (RESEARCH.md Pattern 3, contrast with `PatchSnapshot.observe()` at `patch-snapshot.ts:494-512`, which never mutates):
```typescript
async refresh(): Promise<Readonly<{ added: readonly string[]; removed: readonly string[]; modified: readonly string[] }>> {
  const previous = this.manifest; // chain-tip manifest before this call
  const next = await captureWorktreeManifest(this.scope, this.repositoryRoot); // Pattern 1 + Pattern 4 (retry)
  const delta = diffManifestEntries(previous.entries, next.entries); // path-keyed set comparison
  this.manifest = { ...next, chain: [...previous.chain, next.digest] }; // D-18: append, don't replace
  return delta;
}
```

**Per-file bracket-and-retry capture** (Required Focus 3(a), extending `boundedFileBytes`'s single-read verification to capture-time stat-before/read/stat-after with bounded retry):
```typescript
async function captureFileWithRetry(
  path: Buffer,
  expectedBytes: number,
  maxAttempts = 3,       // 1 initial + 2 retries (Discretion Resolution 1)
  retryDelayMs = 10,     // short fixed delay, not exponential
): Promise<{ bytes: Buffer; sha256: string } | { torn: true }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const before = await lstat(path);
    try {
      const bytes = await boundedFileBytes(path, expectedBytes); // from snapshot-fs.ts
      const after = await lstat(path);
      if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
        return { bytes, sha256: digest(bytes) };
      }
    } catch { /* fall through to retry */ }
    if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return { torn: true };
}
```

**Index-identity race bracket** (Required Focus 3(c), D-11) — resolve the real index path via `git rev-parse --git-path index` (not a hardcoded `.git/index`, for linked-worktree correctness), `lstat` before and after the whole capture, retry the entire capture once on mismatch, else open with a session-level notice distinct from the per-file banner:
```typescript
async function indexIdentity(repositoryRoot: string, runner: GitRunner): Promise<{ size: number; mtimeMs: number }> {
  const result = await runner.run(['rev-parse', '--git-path', 'index'], { cwd: repositoryRoot });
  const indexPath = result.stdout.toString('utf8').trim();
  const info = await lstat(join(repositoryRoot, indexPath));
  return { size: info.size, mtimeMs: info.mtimeMs };
}
```

**Session/entry verification shape to mirror** (`patch-snapshot.ts:348-399`, `verifiedManifest()`/`readSide()`): same manifest-on-disk + sha256-check-per-read discipline; copy the `fail()`/`PatchSnapshotError`-style unavailability signaling pattern (`patch-snapshot.ts:114-121, 332-335`), adapted to a new error class if the planner decides the error taxonomy differs (e.g. to carry `'changed-during-capture'` as a non-retryable reason).

---

### `src/domain/comparison-key.ts` — add `uncommittedReviewKey()` (utility, transform)

**Analog:** same file, `rangeReviewKey()` (lines 26-39) — identical framed-field hashing idiom.

**Existing pattern to copy exactly** (`comparison-key.ts:1-24`):
```typescript
import { createHash } from 'node:crypto';

const DOMAIN = Buffer.from('cumpa-comparison-key-v1', 'utf8');
const RANGE_DOMAIN = Buffer.from('cumpa-range-review-key-v1', 'utf8');
const encoder = new TextEncoder();

function frame(value: string): Buffer {
  const bytes = encoder.encode(value);
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}

export function rangeReviewKey(
  baseCommitOid: string,
  headCommitOid: string,
  pathspecs: readonly string[],
): string {
  const hash = createHash('sha256');
  hash.update(RANGE_DOMAIN);
  hash.update(frame(baseCommitOid));
  hash.update(frame(headCommitOid));
  for (const pathspec of pathspecs) hash.update(frame(pathspec));
  return hash.digest('hex');
}
```

**New function, same pattern, new domain constant** (RESEARCH.md Required Focus 1 §1):
```typescript
const UNCOMMITTED_DOMAIN = Buffer.from('cumpa-uncommitted-review-key-v1', 'utf8');

export function uncommittedReviewKey(
  sourceKind: 'staged' | 'unstaged' | 'worktree',
  baseCommitOid: string | undefined, // undefined only for 'unstaged'
  firstSnapshotDigest: string,        // chain's [0] entry — computed once, never on Refresh
): string {
  const hash = createHash('sha256');
  hash.update(UNCOMMITTED_DOMAIN);
  hash.update(frame(sourceKind));
  hash.update(frame(baseCommitOid ?? ''));
  hash.update(frame(firstSnapshotDigest));
  return hash.digest('hex');
}
```

---

### `src/contracts/draft.ts` — `UncommittedDraftComparisonSchema` (model, transform)

**Analog:** `ExactPatchDraftComparisonSchema` (`draft.ts:83-94`):
```typescript
const ExactPatchDraftComparisonSchema = z
  .strictObject({
    kind: z.literal('exact-patch'),
    digest: z.string().regex(/^[0-9a-f]{64}$/u),
    validationTarget: ExactPatchValidationTargetSchema,
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .readonly();

export const DraftComparisonSchema = z
  .union([PinnedDraftComparisonSchema, ExactPatchDraftComparisonSchema])
  .readonly();
```

**New union member** (RESEARCH.md Required Focus 1 §3), add as third member of `DraftComparisonSchema`'s union:
```typescript
const UncommittedDraftComparisonSchema = z.strictObject({
  kind: z.literal('uncommitted'),
  sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
  baseCommitOid: GitObjectIdSchema.optional(),
  reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
  snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
}).superRefine((comparison, context) => {
  const hasBase = comparison.baseCommitOid !== undefined;
  if (comparison.sourceKind === 'unstaged' && hasBase) {
    context.addIssue({ code: 'custom', message: 'Unstaged comparisons have no base.', path: ['baseCommitOid'] });
  }
  if (comparison.sourceKind !== 'unstaged' && !hasBase) {
    context.addIssue({ code: 'custom', message: 'Staged and Working tree comparisons require a base commit.', path: ['baseCommitOid'] });
  }
}).readonly();
```

---

### `src/server/draft-loader.ts` — `sameComparison()` new branch (service, request-response)

**Analog:** same file, existing two-branch structure (`draft-loader.ts:55-84`):
```typescript
function sameComparison(left: DraftComparison, right: DraftComparison): boolean {
  if ('kind' in left || 'kind' in right) {
    return (
      'kind' in left && 'kind' in right &&
      left.digest === right.digest &&
      left.validationTarget.kind === right.validationTarget.kind &&
      left.reviewKey === right.reviewKey
    );
  }
  // ...pinned-range branch, left.baseCommitOid/headCommitOid/mergeBaseOid/range...
}
```
Add a third branch before the `'kind' in left` check becomes ambiguous between `'exact-patch'` and `'uncommitted'` (both have `kind`): discriminate on `comparison.kind === 'uncommitted'` first and compare `reviewKey` equality, then fall through to the existing `'kind' in` exact-patch branch.

**`draftPaths()` needs NO change** (`draft-loader.ts:96-109`) — its existing `'kind' in comparison ? comparison.reviewKey : ...` ternary already generalizes to any `kind`-tagged comparison carrying `reviewKey`:
```typescript
export function draftPaths(repositoryRoot: string, comparison: DraftComparison, storageScope?: string): DraftPaths {
  const key = storageScope === undefined
    ? ('kind' in comparison ? comparison.reviewKey : comparison.range?.reviewKey ?? comparisonKey(comparison.baseCommitOid, comparison.headCommitOid))
    : assertAttachedStorageScope(storageScope);
  // ...
}
```

---

### `src/server/routes.ts` — new `POST /api/refresh` + passive-indicator poll endpoint (controller, request-response)

**Analog for a no-body POST action** (`routes.ts:141-144`, `/api/support/refresh`):
```typescript
app.post<{ Querystring: Record<string, never>; Body: unknown }>('/api/support/refresh', { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 1 }, async (request, reply) => {
  if (request.body !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') || request.headers['content-type'] !== undefined) return unavailable(reply, 400);
  return SupportStatusSchema.parse(await capabilities.support!.refresh());
});
```

**Analog for a cheap GET poll endpoint** (`routes.ts:197-212`, `/api/patch-status`):
```typescript
if (capabilities.patchStatus !== undefined) {
  app.get<{ Querystring: Record<string, never> }>('/api/patch-status', { schema: { querystring: EMPTY_QUERY_SCHEMA } }, async (request, reply) => {
    if (Object.keys(request.query).length !== 0 || request.body !== undefined || request.headers['content-length'] !== undefined || request.headers['content-type'] !== undefined) {
      return unavailable(reply, 400);
    }
    return PatchStatusResponseSchema.parse(await capabilities.patchStatus!());
  });
}
```
`POST /api/refresh` should follow the `/api/support/refresh` shape (no-body POST → capability call → schema-validated response with D-15's `{added, removed, modified}` delta + comment-reclassification counts). The passive change-indicator poll endpoint (D-14) should follow `/api/patch-status`'s shape (capability-gated `if (capabilities.worktreeChangeIndicator !== undefined)` GET, zero-arg query validation, `O(1)` Git subprocess cost per RESEARCH.md's "index lstat + stat of snapshot files, no git diff/git status re-walk").

**Analog for conditional-capability registration guard**: every new route is gated behind `if (capabilities.<newCapability> !== undefined)` exactly like `patchStatus`/`selectorDriftObserver`/`support` above — uncommitted-only capabilities must not register for committed/exact-patch sessions.

---

### `src/cli/picker.ts` — `Uncommitted` group + Base-prompt copy variant (controller, request-response)

**Analog:** `buildSourceSearchItems` (`picker.ts:191-226`) and `candidateItem` (`picker.ts:159-189`):
```typescript
export function buildSourceSearchItems(
  candidates: readonly SourceCandidate[], term: string | undefined, options: BuildSourceSearchOptions,
): readonly SourceSearchItem[] {
  const query = (term ?? '').toLowerCase();
  const branchItems = candidates.filter((c) => c.kind === 'branch' && candidateMatches(c, query)).map((c) => candidateItem(c, options));
  const worktreeItems = candidates.filter((c) => c.kind === 'worktree' && candidateMatches(c, query)).map((c) => candidateItem(c, options));
  const items: SourceSearchItem[] = [
    { kind: 'separator', label: 'Local branches' },
    ...branchItems,
    { kind: 'separator', label: 'Worktrees' },
    ...worktreeItems,
  ];
  // ...
  return items;
}
```
D-01's new `Uncommitted` group is a **third, top-positioned** `{ kind: 'separator', label: 'Uncommitted' }` block followed by three `SourceCandidateSearchItem`-shaped rows (`Staged`/`Unstaged`/`Working tree`) — these are a **new `SourceSearchItem` variant**, not `BranchCandidate`/`WorktreeCandidate` instances (per `14-UI-SPEC.md:141`, no `[Branch]`/`[Worktree]` bracket prefix, no "Suggested" suffix). Use the same `{ kind: 'candidate', value, name }` item shape (`SourceCandidateSearchItem`, `picker.ts:20-25`) but populate `name` with the bare row label, matching `candidateItem`'s `value`/`name` field discipline without reusing its branch/worktree-specific formatting.

**Prompt copy constants to update** (`picker.ts:14-17`):
```typescript
const BASE_PROMPT = 'Choose base — changes will be cumpad from its merge base with head';
const HEAD_PROMPT = 'Choose head — this committed state will be reviewed';
```
Per D-01/UI-SPEC copywriting table: unchanged for the committed flow; add a parallel `Choose base — changes compared to merge base HEAD` (with `HEAD` preselected) string used only after a Staged/Working-tree row is chosen.

---

### `src/web/components/IdentityHeader.vue` (component, event-driven)

**Analog:** itself — existing two-way `isExactPatch` ternary becomes three-way.

**Comparison-strip ternary to extend** (`IdentityHeader.vue:73-96`):
```vue
<div class="session-header__comparison">
  <template v-if="isExactPatch">
    <span class="session-header__endpoint">
      <span class="session-header__endpoint-label">PREIMAGE</span>
      <span class="session-header__selector" title="Repository object">Repository object</span>
    </span>
    <span aria-hidden="true">→</span>
    <span class="session-header__endpoint">...</span>
  </template>
  <template v-else>
    <span class="session-header__endpoint">
      <span class="session-header__endpoint-label">BASE</span>
      <span class="session-header__selector" :title="baseLabel">{{ baseLabel }} · {{ baseOid }}</span>
    </span>
    <span aria-hidden="true">→</span>
    <span class="session-header__endpoint">...</span>
  </template>
</div>
```
Add a third `<template v-else-if="isUncommitted">` branch using the identical `.session-header__endpoint`/`.session-header__endpoint-label`/`.session-header__selector` classes (no new CSS), with `HEAD` showing `{{ sourceLabel }} · snapshot {{ shortDigest }}` and `BASE` showing either the resolved merge-base label+OID (Staged/Working tree) or the fixed non-interactive `Index` text (Unstaged, D-05).

**Cue-text ternary to extend** (`IdentityHeader.vue:99`):
```vue
<span class="pin-cue">{{ isExactPatch ? 'Frozen patch' : 'Pinned comparison' }}</span>
```
→ three-way: `'Pinned comparison'` / `'Frozen patch'` / `'Frozen snapshot'` (uncommitted).

**Dirty-badge suppression** (`IdentityHeader.vue:37-47, 100-109`) — `dirtyEndpoints` computed must return `[]` for uncommitted sessions too (extend the existing `isExactPatch.value ? [] : [...]` guard to `isExactPatch.value || isUncommitted.value ? [] : [...]`), since the "Dirty bytes ignored" badge is semantically inverted for uncommitted sessions (which exist specifically *to* review those bytes).

**New Refresh button + passive indicator** — model on the existing `identity-disclosure` button (`IdentityHeader.vue:122-129`, "Review notes"):
```vue
<button
  type="button"
  class="identity-disclosure identity-disclosure--accent"
  aria-haspopup="dialog"
  @click="emit('reviewNotes')"
>
  Review notes
</button>
```
Refresh button follows the same `identity-disclosure` class + `@click` emit pattern (`emit('refresh')`), placed in `.header-facts` before this button per UI-SPEC; the passive indicator is a plain `<span class="change-indicator">` sibling, not a button (D-14: inert text only).

---

### `src/web/components/ui/UiIcon.vue` — new `refresh` glyph (component, transform)

**Analog:** itself — existing glyph union + `v-else-if` chain (`UiIcon.vue:2-14, 35-80`):
```vue
export type UiIconName =
  | 'previous-file' | 'next-file' | 'previous-change' | 'next-change'
  | 'open' | 'check' | 'warning' | 'error' | 'information' | 'selected' | 'lock' | 'disabled';
```
Add `'refresh'` to the union and one new `<template v-else-if="name === 'refresh'">` branch inside the existing `<svg viewBox="0 0 16 16" stroke-width="1.5">` wrapper (`UiIcon.vue:21-34`), drawing a circular-arrow path in the same stroke-based style as the 12 existing glyphs (e.g. `warning`'s two-path shape at lines 57-60 is a good proportion reference).

---

### `src/web/components/InlineNotice.vue` — `dismissible` prop + `dismiss` event (component, event-driven)

**Analog:** itself, full current file (38 lines) — add optional props/emit to the existing structure, no new component:
```vue
const props = withDefaults(
  defineProps<{
    readonly tone?: 'neutral' | 'information' | 'success' | 'warning' | 'error';
    readonly role?: 'alert' | 'note' | 'status';
  }>(),
  { tone: 'neutral', role: 'note' },
);
```
```vue
<aside class="inline-notice" :class="`inline-notice--${tone}`" :role="role">
  <UiIcon :name="toneIcon" class="inline-notice__icon" />
  <div class="inline-notice__content"><slot /></div>
</aside>
```
Add `dismissible?: boolean` and `dismissLabel?: string` props, an `emit('dismiss')` event, and a conditionally-rendered dismiss `<button>` inside `.inline-notice__content` — consumers (session banner, Refresh summary panel) pass `dismissible dismiss-label="Dismiss ..."` and handle `@dismiss`.

---

### `src/web/components/FileRow.vue` (component, transform/render)

**Analog:** itself — `availabilityLabel` computed + marker template (`FileRow.vue:28-37, 65-73`):
```typescript
const availabilityLabel = computed(() => {
  switch (props.leaf.file.availability.kind) {
    case 'text': return 'Text';
    case 'unsupported': return 'Unsupported';
    case 'unavailable': return 'Unavailable';
  }
});
```
```vue
<span
  class="availability-marker"
  :class="[`availability-marker--${leaf.file.availability.kind}`, { 'visually-hidden': leaf.file.availability.kind === 'text' }]"
>
  {{ availabilityLabel }}
</span>
```
`availability.kind` stays a closed 3-value union (`text`/`unsupported`/`unavailable`) — `'changed-during-capture'` is a new **reason** value inside the existing `{ kind: 'unsupported', reason }` shape (mirrors `UnsupportedAvailabilityReasonSchema`'s existing `binary`/`non-utf8`/`oversized`/`submodule`/`symlink`/`mode-or-type` enum), so `availabilityLabel`'s `'unsupported'` case needs a nested switch on `props.leaf.file.availability.reason` to render `Changed during capture` as that one new reason's label — no new top-level case, no new CSS class.

The separate post-Refresh `Changed` marker (D-15) is a **new, independent** `<span class="tree-row__refresh-marker">` sibling inside the same row template, not a variant of `availability-marker` — it coexists with normal reviewable rows (per `14-UI-SPEC.md:170`, "does not replace or gate reviewability").

---

### `src/web/App.vue` — session banner, Refresh summary panel, change-indicator polling (component, event-driven + polling)

**Analog — 30s visibility-aware polling precedent** (`App.vue:1000-1009`, `refreshPatchStatusWhenVisible`/`patchStatusInterval`):
```typescript
function refreshPatchStatusWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    void refreshPatchStatus();
  }
}
// ...in start function:
void refreshPatchStatus();
document.addEventListener('visibilitychange', refreshPatchStatusWhenVisible);
patchStatusInterval = window.setInterval(refreshPatchStatusWhenVisible, 30_000);
// ...in stop function:
document.removeEventListener('visibilitychange', refreshPatchStatusWhenVisible);
if (patchStatusInterval !== undefined) { window.clearInterval(patchStatusInterval); patchStatusInterval = undefined; }
```
Reuse this exact shape, same 30_000 interval, for the new worktree change-indicator poll (RESEARCH.md Discretion Resolution 2, D-14) — `document.addEventListener('visibilitychange', refreshWorktreeIndicatorWhenVisible)` + `window.setInterval(refreshWorktreeIndicatorWhenVisible, 30_000)`, calling the new `GET` poll endpoint.

**Analog — `.shell-warning-stack` mount point** (`App.vue:1110-1114`):
```vue
<div
  v-if="patchDrifted || hasUnverifiedAnchors || selectorDriftStatus?.base.kind !== 'unchanged' || selectorDriftStatus?.head.kind !== 'unchanged'"
  class="shell-warning-stack"
>
  <InlineNotice v-if="patchDrifted" tone="error">
    <h2>Implemented content changed</h2>
    ...
```
The new session banner ("Changed during capture", D-12) and Refresh summary panel (D-15) are additional `<InlineNotice>` children of this same `v-if`-gated stack, extending the existing `v-if` condition with the new reactive flags (dismissed-session-banner ref, refresh-summary-open ref) — same `dismissedForSession`-style parent-owned `ref` pattern already used for the support dialog (`App.vue:113, 970-973`).

---

## Shared Patterns

### Framed-field sha256 hashing (domain-separated hash construction)
**Source:** `src/domain/comparison-key.ts:7-24` (`frame()` + `rangeReviewKey()`), identical idiom in `src/server/patch-snapshot.ts:123-141` (`digest()`/`frame()`/`reviewKey()`) and `src/domain/anchor.ts:51-61` (`framedSha256`)
**Apply to:** `uncommittedReviewKey()` in `comparison-key.ts`; any new content-digest or key derivation in `worktree-snapshot.ts`
```typescript
function frame(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}
// hash.update(DOMAIN_CONSTANT); hash.update(frame(field1)); hash.update(frame(field2)); ...
```
Never concatenate raw strings without length-prefixing — the length prefix is what makes `''` (Unstaged's absent base) structurally distinguishable from an adjacent empty field.

### Capability-gated route registration
**Source:** `src/server/routes.ts:197-213, 215-233` (`capabilities.patchStatus !== undefined` / `capabilities.selectorDriftObserver !== undefined` guards)
**Apply to:** All new uncommitted-only routes (`/api/refresh`, the change-indicator poll endpoint) — gate behind `capabilities.<newField> !== undefined` so these routes simply do not exist for committed/exact-patch sessions, rather than branching inside a shared handler.

### Zero-body-POST request validation
**Source:** `src/server/routes.ts:141-144` (`/api/support/refresh`)
**Apply to:** `POST /api/refresh` — reject any request carrying a body/content-length/content-type before calling the capability.

### `boundedFileBytes`-style read-then-verify discipline
**Source:** `src/server/patch-snapshot.ts:222-241`
**Apply to:** Both the extracted `snapshot-fs.ts` primitive and the new capture-time `captureFileWithRetry` wrapper in `worktree-snapshot.ts` — stat, bounded-allocate `expected+1`, loop-read, verify exact byte count, never silently accept a short/long read.

### `isCumpaInternalPath()` defense-in-depth filtering
**Source:** `src/git/inventory.ts:74-87` (used at `inventory.ts:180-187`)
**Apply to:** `worktree-inventory.ts`'s untracked-file walk (`git ls-files --others --exclude-standard`) — filter `.cumpa/`-internal paths out even though `.gitignore` should already exclude them (defense in depth per RESEARCH.md's STRIDE table).

### `lstat`-per-segment symlink defense
**Source:** `src/server/patch-snapshot.ts:243-275` (`worktreeEntry()`)
**Apply to:** Any new worktree-boundary file read in `worktree-snapshot.ts`/`worktree-content.ts` — never `stat` (follows symlinks), always `lstat` each path segment and reject symlinks explicitly.

### Vue `v-if` three-way session-kind branching
**Source:** `src/web/components/IdentityHeader.vue:23-24, 73-96, 99` (`isExactPatch` computed + `v-if`/`v-else` template)
**Apply to:** `IdentityHeader.vue`'s extension to a third `isUncommitted` branch — same computed-flag-plus-template-branch shape, reusing existing CSS classes without new rules (UI-SPEC: "zero new tokens").

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/cli/run.ts` CLI flag parsing (`--staged`/`--unstaged`/`--worktree`/`--base`) | controller | request-response | `run.ts`'s current `Command()` chain (line 754) has no `.option()` calls anywhere in the file — today's CLI is purely interactive (picker-driven) with zero flag-parsing precedent. The planner must introduce Commander's `.option()`/mutual-exclusivity handling as new surface, following Commander's own conventions (already a project dependency) rather than an in-repo analog; the `AgentRequestError`-style typed-error-with-message-table pattern in `src/cli/request.ts:11-35` is the closest in-repo precedent for the `--base`-with-`--unstaged` conflict error's typed-message shape. |
| D-19 relaunch-recovery draft lookup (bounded scan of `.cumpa/drafts/*.json` filtered by `sourceKind`/`baseCommitOid`) | service | batch (directory scan) | No existing code scans the drafts directory by content — `draftStore.recover()` (`draft-store.ts:350+`) resolves a single fixed canonical path via fingerprint match, a different problem (same path, corrupt content) from D-19's (different path, need-to-discover-candidates). RESEARCH.md's own recommendation (bounded directory scan, add an index file only if proven slow) is the only guidance; there is no in-repo file-scanning precedent to copy from for this specific lookup. |

## Metadata

**Analog search scope:** `src/git/`, `src/server/`, `src/domain/`, `src/contracts/`, `src/cli/`, `src/web/components/` (including `src/web/components/ui/`), `src/web/App.vue`
**Files scanned:** `src/git/inventory.ts`, `src/git/exact-patch.ts`, `src/git/selector-drift.ts`, `src/server/patch-snapshot.ts`, `src/server/routes.ts`, `src/server/draft-loader.ts`, `src/server/draft-recovery.ts`, `src/server/draft-store.ts`, `src/server/app.ts`, `src/server/capabilities.ts`, `src/domain/comparison-key.ts`, `src/domain/anchor.ts`, `src/domain/source.ts`, `src/contracts/draft.ts`, `src/contracts/comparison.ts`, `src/cli/picker.ts`, `src/cli/run.ts`, `src/cli/request.ts`, `src/web/components/IdentityHeader.vue`, `src/web/components/FileRow.vue`, `src/web/components/InlineNotice.vue`, `src/web/components/ui/UiIcon.vue`, `src/web/components/DraftRecovery.vue`, `src/web/App.vue`
**Pattern extraction date:** 2026-10-30
