# Phase 15: Standalone File Review - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 13 (9 modified, 1 new backend module, 1 new web test, 2 web components touched)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/cli/run.ts` (positional-arg wiring + `launchStandaloneSession`) | CLI controller | request-response (process launch) | Same file: `validateUncommittedFlags`/`resolveUncommittedFlagSelection`/`launchUncommittedSession` (`src/cli/run.ts:428-765`) | exact |
| `src/git/standalone-resolution.ts` (NEW) | service (Git-process orchestration) | file-I/O + request-response | `src/git/worktree-inventory.ts` (combined `ls-files` + `lstatWorktreeLeaf`) + `src/git/ignore-status.ts` (`inspectCumpaIgnore`) + `src/git/exact-patch.ts` (`exactPath`/`worktreeEntry`) | role-match (composite of three) |
| `src/contracts/comparison.ts` (`UncommittedScopeSchema` sourceKind extension or sibling `StandaloneScopeSchema`) | model (Zod schema) | CRUD (validation) | `UncommittedScopeSchema` (`src/contracts/comparison.ts:134-164`) | exact |
| `src/contracts/draft.ts` (`ReviewExportV4Schema`, `DraftComparisonSchema` standalone branch) | model (Zod schema) | CRUD (validation) | `ReviewExportV3Schema` (`src/contracts/draft.ts:432-469`) + `UncommittedDraftComparisonSchema` (`src/contracts/draft.ts:92-117`) | exact |
| `src/domain/comparison-key.ts` (`standaloneReviewKey`) | utility (pure hash) | transform | `uncommittedReviewKey` (`src/domain/comparison-key.ts:42-53`) | exact |
| `src/server/worktree-snapshot.ts` (`sourceKind` enum gains `'standalone'`) | service (snapshot engine) | file-I/O | Same file: `WorktreeSnapshotManifestSchema` `superRefine` (`src/server/worktree-snapshot.ts:61-87`) | exact |
| `src/server/capabilities.ts` (`createStandaloneCapabilityRegistry`) | service (capability registry / route handlers) | request-response | `createUncommittedCapabilityRegistry` (`src/server/capabilities.ts:896-1141`) + export wiring from `createExactPatchCapabilityRegistry` (`src/server/capabilities.ts:822-893`) | role-match (composite of two) |
| `src/server/app.ts` (`createStandaloneSessionApp`) | service (Fastify app factory) | request-response | `createUncommittedSessionApp` (`src/server/app.ts:194-218`) | exact |
| `src/server/routes.ts` (no new routes; standalone sessions pass through existing 404-guards) | route (Fastify handlers) | request-response | Same file: `/api/export`/`/api/export/reveal` capability-undefined guards (`src/server/routes.ts:420-499`) | exact (no new code needed) |
| `src/export/review-export.ts` (`buildReviewExportV4`) | service (pure builder) | transform | `buildReviewExportV3` (`src/export/review-export.ts:181-218`) | exact |
| `src/export/render-review-markdown.ts` (`schemaVersion === 4` branch) | utility (pure renderer) | transform | Same file: `schemaVersion === 3` branch (`src/export/render-review-markdown.ts:46-82`) | exact |
| `src/web/components/IdentityHeader.vue` (standalone session identity) | component | request-response (props→render) | Same file: `isUncommitted`/`uncommittedSession` branch (`src/web/components/IdentityHeader.vue:30-46,111-122`) | exact |
| `src/web/components/ActiveFileToolbar.vue` + `FileRow.vue` (git-state label) | component | request-response (props→render) | Same files: `layoutLabel` computed (`ActiveFileToolbar.vue:36-50`) + `availability-marker` span (`FileRow.vue:29-40,69-77`) | exact |
| `tests/e2e/standalone-review.spec.ts` (NEW) | test (Playwright e2e) | event-driven | `tests/e2e/uncommitted-review.spec.ts` (full file, 477 lines) | exact |

## Pattern Assignments

### `src/cli/run.ts` (CLI controller, request-response)

**Analog:** same file, `validateUncommittedFlags`/`resolveUncommittedFlagSelection`/`launchUncommittedSession`

**Imports already present** (lines 1-65) — no new imports needed beyond the new `../git/standalone-resolution.js` module and `createStandaloneSessionApp`/`CreateStandaloneSessionAppOptions` from `../server/app.js`. Mirror the existing import block shape:
```typescript
// Source: src/cli/run.ts:49-56 (existing precedent)
import {
  createConfiguredSupportCapability,
  createExactPatchSessionApp,
  createSessionApp,
  createUncommittedSessionApp,
  type CreateUncommittedSessionAppOptions,
  type SessionApp,
} from '../server/app.js';
```

**Mutual-exclusivity validation pattern** (lines 445-464, to copy verbatim with new signature):
```typescript
// Source: src/cli/run.ts:445-464 (existing precedent, read not modified)
export function validateUncommittedFlags(cliOptions: {
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly worktree?: boolean;
  readonly base?: string;
}): void {
  const selectedCount = [cliOptions.staged, cliOptions.unstaged, cliOptions.worktree]
    .filter((flag) => flag === true).length;
  if (selectedCount > 1) {
    throw new Error('--staged, --unstaged, and --worktree are mutually exclusive. Choose exactly one.');
  }
  if (cliOptions.unstaged === true && cliOptions.base !== undefined) {
    throw new Error(UNSTAGED_BASE_CONFLICT_MESSAGE);
  }
}
// NEW, modeled identically — throws a plain Error, same shape, called from
// .action() before any other dispatch (per research Pattern 1):
export function validateStandaloneExclusivity(
  paths: readonly string[],
  cliOptions: { readonly staged?: boolean; readonly unstaged?: boolean; readonly worktree?: boolean; readonly base?: string },
): void {
  if (paths.length === 0) return;
  if (cliOptions.staged === true || cliOptions.unstaged === true || cliOptions.worktree === true || cliOptions.base !== undefined) {
    throw new Error('Positional paths cannot be combined with --staged, --unstaged, --worktree, or --base.');
  }
}
```

**Session-launch orchestration pattern** (lines 596-765), the full shape `launchStandaloneSession` must mirror — repository discovery → scope build → capability-registry app creation → bind/listen → Refresh-keypress registration → error handling:
```typescript
// Source: src/cli/run.ts:596-765 (existing precedent, structure only — standalone
// swaps createWorktreeChangedFileInventory for resolveStandaloneArguments +
// classifyStandaloneGitState, and UncommittedScopeSchema for the standalone
// scope schema; everything else — AbortController, ShutdownController,
// token generation, bindSessionSecurity, output(url), registerUncommitted-
// RefreshKeypress's structure (rename to registerStandaloneRefreshKeypress) —
// copies verbatim)
async function launchUncommittedSession(
  selection: Readonly<{ readonly sourceKind: UncommittedRowKind; readonly baseRef?: string }>,
  dependencies: OrdinaryActionDependencies,
  options: RunCliOptions,
): Promise<void> {
  const output = dependencies.output ?? console.error;
  const support = dependencies.support ?? createConfiguredSupportCapability();
  const openBrowser = dependencies.openBrowser ?? createBrowserUrlOpener();
  const createApp = dependencies.createUncommittedSessionApp ?? createUncommittedSessionApp;
  const activeGit = new AbortController();
  let app: SessionApp | undefined;
  let stopRefreshKeypress: (() => void) | undefined;

  const shutdown = createShutdownController({ /* ...abort/close wiring... */ });

  try {
    const runner = createGitRunner();
    const repository = await discoverGitRepository(options.cwd, runner, activeGit.signal);
    // ... build scope (standalone: resolveStandaloneArguments + classifyStandaloneGitState) ...
    const scope = UncommittedScopeSchema.parse({ /* ... */ });
    const token = randomBytes(32).toString('base64url');
    app = await createApp(scope, { webRoot: dependencies.webRoot, support, sessionToken: token, revealDraftFile, diagnostics: /* ... */ });
    await app.listen({ host: '127.0.0.1', port: 0 });
    // ... bind session security, open browser, output(url) ...
    stopRefreshKeypress = registerUncommittedRefreshKeypress(authority, token, output, shutdown);
  } catch (error) {
    if (shutdown.isShuttingDown) { await shutdown.shutdown(); return; }
    await shutdown.shutdown(1);
    if (error instanceof Error) { output(error.message); return; }
    throw error;
  }
}
```

**Commander registration pattern** (lines 1139-1182) — add `.argument('[paths...]', '...')` to the same chain, dispatch before the existing flag-selection branch:
```typescript
// Source: src/cli/run.ts:1139-1169 (existing precedent)
await new Command()
  .name('cumpa')
  .description('Local-first review of pinned Git comparisons')
  .version(await readPackageVersionFromManifest())
  .option('--staged', 'Review staged changes (HEAD→index) against a base')
  .option('--unstaged', 'Review unstaged changes (index→working tree)')
  .option('--worktree', 'Review all working-tree changes (HEAD→working tree), including untracked files')
  .option('--base <ref>', 'Base ref or registered worktree to compare against (default: HEAD); rejected with --unstaged')
  // NEW: .argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')
  .action(async (cliOptions) => {
    try {
      validateUncommittedFlags(cliOptions);
      // NEW: validateStandaloneExclusivity(paths, cliOptions);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
    // NEW: if (paths.length > 0) { await launchStandaloneSession(paths, {}, { cwd: process.cwd() }); return; }
    const uncommittedSourceKind = resolveUncommittedFlagSelection(cliOptions);
    if (uncommittedSourceKind !== undefined) {
      await launchUncommittedSession({ sourceKind: uncommittedSourceKind, baseRef: cliOptions.base }, {}, { cwd: process.cwd() });
      return;
    }
    // ... unchanged fall-through to picker/agent-request dispatch ...
  })
  .parseAsync(process.argv);
```

---

### `src/git/standalone-resolution.ts` (NEW — service, file-I/O + request-response)

**Analogs:** `src/git/worktree-inventory.ts` (combined pathspec resolution + `lstatWorktreeLeaf`), `src/git/ignore-status.ts` (`inspectCumpaIgnore`), `src/git/exact-patch.ts` (`exactPath`/`worktreeEntry` path-safety precedent, read-only — do not import from `src/git/exact-patch.ts`; re-derive the per-segment `lstat` discipline as a third copy per research Pattern 6, OR import `worktree-inventory.ts`'s unexported `lstatWorktreeLeaf` equivalent by extracting it — planner must decide export boundary)

**Imports pattern** — this module stays within `src/git/`, importing only sibling `src/git/` and `src/contracts/`/`src/domain/` modules (never `src/server/`):
```typescript
// Source: src/git/worktree-inventory.ts:1-23 (existing precedent for src/git/ import shape)
import { ChangedFileSchema } from '../contracts/comparison.js';
import type { ChangedFile } from '../contracts/comparison.js';
import { createExactPath, decodeBase64url } from '../domain/path-bytes.js';
import { createGitRunner, GitRunnerError } from './runner.js';
import type { GitRunner } from './runner.js';
```

**Per-argument resolution core loop** — resolve one argument at a time (never combine into one `ls-files` call up front), to preserve per-argument error attribution (FILE-02):
```typescript
// Source: composed from src/git/worktree-inventory.ts:538-541 (combined
// tracked+untracked ls-files call) and src/git/ignore-status.ts:26-39
// (check-ignore exit-code contract) — no function of this exact shape
// exists yet in the codebase; this is RESEARCH.md's verified composition.
interface ResolvedArgument {
  readonly argument: string;
  readonly matches: readonly string[]; // repository-relative, NUL-split -z output
}

async function resolveOneArgument(
  repositoryRoot: string,
  argument: string,
  runner: GitRunner,
): Promise<ResolvedArgument> {
  try {
    const result = await runner.run(
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', argument],
      { cwd: repositoryRoot },
    );
    const matches = result.stdout.toString('utf8').split('\0').filter(Boolean);
    if (matches.length > 0) return { argument, matches };
    // Zero matches: distinguish "ignored" from "does not exist" for a literal path.
    try {
      await runner.run(['check-ignore', '--quiet', '--', argument], { cwd: repositoryRoot });
      throw new Error(`"${argument}" is ignored by .gitignore. Remove it from .gitignore to review it.`);
    } catch (checkIgnoreError) {
      if (checkIgnoreError instanceof GitRunnerError && checkIgnoreError.kind === 'exit' && checkIgnoreError.exitCode === 1) {
        throw new Error(`"${argument}" did not match any file in the repository.`);
      }
      throw checkIgnoreError;
    }
  } catch (error) {
    // Git's own fatal pathspec-outside-repository rejection (exit 128) —
    // translate, do not reimplement the check.
    if (error instanceof GitRunnerError && error.kind === 'exit' && error.exitCode === 128) {
      throw new Error(`"${argument}" resolves outside the repository.`);
    }
    throw error;
  }
}
```

**Git-state classification** (`git status --porcelain=v1 -z`), a new sibling computation alongside resolution — never folded into `ChangedFileStatusKind` (see Shared Pattern "Git-state label" below):
```typescript
// Source: verified empirically in research session against real git 2.54.0 —
// `?? path` is always untracked; any other non-space X/Y column means staged
// and/or unstaged uncommitted changes; an absent porcelain line for a
// resolved path means unchanged (git status only emits lines for paths that
// differ from HEAD or are untracked).
export type StandaloneGitState = 'modified-uncommitted' | 'untracked' | 'unchanged';

function classifyFromPorcelainLine(line: string): StandaloneGitState {
  return line.startsWith('??') ? 'untracked' : 'modified-uncommitted';
}
```

**Symlink-escape guard at content-read time** — do not reinvent; reuse the per-segment `lstat` discipline already implemented twice (`src/git/exact-patch.ts:460-502` `worktreeEntry()`, `src/git/worktree-inventory.ts:137-178` `lstatWorktreeLeaf()`). Read both for the walking pattern (shown in Shared Patterns below); call or duplicate `lstatWorktreeLeaf`'s shape, never `fs.realpath` per-file.

**Caps to enforce:**
- Raw-argument count: reuse `MAX_PATHSPEC_COUNT` (`src/contracts/request.ts:7`, value `256`) — note this currently bounds the agent-protocol JSON `pathspecs` array, not CLI argv; Phase 15 is the first caller applying it to `argv`.
- Resolved-file count: new cap, planner-chosen, enforced in addition to `MAX_SNAPSHOT_FILES` (`src/server/worktree-snapshot.ts`) hard ceiling already present in the snapshot layer.
- Reject any resolved path with a `.git`/`.cumpa` path segment as defense-in-depth (Git's own checkout already excludes `.git`), mirroring `exactPath()`'s segment-rejection style (`src/git/exact-patch.ts:127-129`).

---

### `src/contracts/comparison.ts` (model, Zod schema)

**Analog:** `UncommittedScopeSchema` (`src/contracts/comparison.ts:134-164`)

**Extension pattern** — `superRefine` branch for a no-base-commit `sourceKind`, structurally identical to the existing `'unstaged'` branch:
```typescript
// Source: src/contracts/comparison.ts:134-164 (existing precedent)
export const UncommittedScopeSchema = z
  .strictObject({
    kind: z.literal('uncommitted'),
    sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
    repositoryRoot: z.string().min(1),
    objectFormat: z.enum(['sha1', 'sha256']),
    baseCommitOid: GitObjectIdSchema.optional(),
    mergeBaseOid: GitObjectIdSchema.optional(),
    changedFiles: z.array(ChangedFileSchema).readonly(),
  })
  .superRefine((scope, context) => {
    const hasBase = scope.baseCommitOid !== undefined;
    const hasMergeBase = scope.mergeBaseOid !== undefined;
    if (scope.sourceKind === 'unstaged') {
      if (hasBase || hasMergeBase) {
        context.addIssue({ code: 'custom', message: 'Unstaged comparisons must not have a base commit.', path: ['baseCommitOid'] });
      }
    } else if (!hasBase || !hasMergeBase) {
      context.addIssue({ code: 'custom', message: 'Staged and Working tree comparisons require a base commit.', path: ['baseCommitOid'] });
    }
  })
  .readonly();
```
Open Question 2 (RESEARCH.md): extend this schema's `sourceKind` enum with `'standalone'` (no base, no merge base, like `'unstaged'`) OR add a sibling `StandaloneScopeSchema` carrying `originalArguments: readonly string[]` instead of a Git-diff-shaped `changedFiles` array. Either way, every `ChangedFile` entry for a standalone file sets `status.kind = 'added'` with `similarity: null` (reuses Phase 13's existing head-only rendering path) per Pattern 5 below — never a new `ChangedFileStatusKindSchema` member.

---

### `src/contracts/draft.ts` (model, Zod schema)

**Analog:** `ReviewExportV3Schema` (lines 432-469) for the export schema; `UncommittedDraftComparisonSchema` (lines 92-117) for the draft-comparison union branch.

**Draft comparison union branch pattern** (lines 92-117):
```typescript
// Source: src/contracts/draft.ts:92-117 (existing precedent)
const UncommittedDraftComparisonSchema = z
  .strictObject({
    kind: z.literal('uncommitted'),
    sourceKind: z.enum(['staged', 'unstaged', 'worktree']),
    baseCommitOid: GitObjectIdSchema.optional(),
    reviewKey: z.string().regex(/^[0-9a-f]{64}$/u),
    snapshotChain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
  })
  .superRefine((comparison, context) => {
    const hasBase = comparison.baseCommitOid !== undefined;
    if (comparison.sourceKind === 'unstaged' && hasBase) {
      context.addIssue({ code: 'custom', message: 'Unstaged comparisons have no base.', path: ['baseCommitOid'] });
    }
    if (comparison.sourceKind !== 'unstaged' && !hasBase) {
      context.addIssue({ code: 'custom', message: 'Staged and Working tree comparisons require a base commit.', path: ['baseCommitOid'] });
    }
  })
  .readonly();

export const DraftComparisonSchema = z.union([PinnedDraftComparisonSchema, ExactPatchDraftComparisonSchema, UncommittedDraftComparisonSchema]).readonly();
// NEW branch mirrors UncommittedDraftComparisonSchema's shape but with
// `kind: z.literal('standalone')`, `originalArguments: readonly string[]`
// (sorted, domain-separated key inputs), no baseCommitOid at all (always
// absent, no superRefine needed), and the same snapshotChain field.
```

**`ReviewExportV4Schema` pattern** (superset-chain member, modeled on V3's exact shape):
```typescript
// Source: src/contracts/draft.ts:432-469 (existing precedent, V3)
export const ReviewExportV3Schema = z
  .strictObject({
    schemaVersion: z.literal(3),
    kind: z.literal('cumpa/export'),
    exportedAt: z.string().datetime(),
    acceptedDraftRevision: RevisionSchema,
    summary: z.strictObject({ markdown: ExportStringSchema.min(1).nullable() }).readonly(),
    files: z.array(ExportFileSchema).readonly(),
    counts: ExportCountsSchema,
    patch: ExactPatchExportScopeSchema, // <- V4's analogous field is `standalone`
  })
  .superRefine((document, context) => {
    const feedback = ReviewExportV1Schema.safeParse({
      schemaVersion: 1,
      kind: document.kind,
      exportedAt: document.exportedAt,
      acceptedDraftRevision: document.acceptedDraftRevision,
      comparison: { /* synthetic zero-OID comparison, see review-export.ts */ },
      drift: { /* synthetic unchanged drift, see review-export.ts */ },
      summary: document.summary,
      files: document.files,
      counts: document.counts,
    });
    if (!feedback.success) {
      context.addIssue({ code: 'custom', message: 'Version 3 export must retain valid review feedback.' });
    }
  })
  .readonly();
// NEW: ReviewExportV4Schema — schemaVersion: z.literal(4), same superRefine
// shape re-deriving a V1-shaped sub-document for backward compatibility,
// `standalone` scope block per RESEARCH.md Pattern 7:
//   { originalArguments: readonly string[], resolvedPaths: readonly ExactPathDto[],
//     fileDigests: readonly { path: ExactPathDto; sha256: string }[],
//     snapshotChain: readonly string[] }
```
Claim `schemaVersion: 4` now (RESEARCH.md Pitfall 3 / Open Question 1: nothing has claimed V4 in code yet; the ROADMAP's Phase 17 "V4" prose predates Phase 14's decision to defer uncommitted-session export, so FILE-05 forces Phase 15 to claim it).

---

### `src/domain/comparison-key.ts` (utility, transform)

**Analog:** `uncommittedReviewKey` (lines 42-53)

```typescript
// Source: src/domain/comparison-key.ts:1-53 (existing precedent, full file —
// the DOMAIN separation constant pattern and frame() length-prefixing)
const UNCOMMITTED_DOMAIN = Buffer.from('cumpa-uncommitted-review-key-v1', 'utf8');

export function uncommittedReviewKey(
  sourceKind: 'staged' | 'unstaged' | 'worktree',
  baseCommitOid: string | undefined,
  firstSnapshotDigest: string,
): string {
  const hash = createHash('sha256');
  hash.update(UNCOMMITTED_DOMAIN);
  hash.update(frame(sourceKind));
  hash.update(frame(baseCommitOid ?? ''));
  hash.update(frame(firstSnapshotDigest));
  return hash.digest('hex');
}
// NEW: standaloneReviewKey — new STANDALONE_DOMAIN separation constant,
// key by the SORTED ORIGINAL ARGUMENT LIST (never the resolved file list —
// see Common Pitfall 4) plus the first snapshot's content digest:
// standaloneReviewKey(sortedOriginalArgs: readonly string[], firstSnapshotDigest: string)
//   hash.update(STANDALONE_DOMAIN); for (arg of sortedOriginalArgs) hash.update(frame(arg)); hash.update(frame(firstSnapshotDigest));
```
**Critical constraint (Common Pitfall 4):** Refresh re-resolves the original arguments against a possibly-changed working tree; keying by the *resolved* file list would silently orphan existing comments into a new empty draft when a glob's match set changes. Key by the raw argument strings, exactly mirroring how `uncommittedReviewKey` never incorporates `changedFiles`.

---

### `src/server/worktree-snapshot.ts` (service, file-I/O) — MODIFIED

**Analog:** same file, existing manifest `superRefine` (lines 61-87)

```typescript
// Source: src/server/worktree-snapshot.ts:61-87 (existing, to be extended)
export const WorktreeSnapshotManifestSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  sourceKind: z.enum(['staged', 'unstaged', 'worktree' /* , 'standalone' */]),
  repositoryIdentity: z.string().min(1),
  baseCommitOid: GitObjectIdSchema.optional(),
  objectFormat: z.enum(['sha1', 'sha256']),
  entries: z.array(WorktreeSnapshotEntrySchema).max(MAX_SNAPSHOT_FILES).readonly(),
  chain: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).readonly(),
  provenanceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
}).superRefine((manifest, context) => {
  const hasBase = manifest.baseCommitOid !== undefined;
  if (manifest.sourceKind === 'unstaged' /* || manifest.sourceKind === 'standalone' */) {
    if (hasBase) {
      context.addIssue({ code: 'custom', message: 'Unstaged snapshots must not carry a base commit.', path: ['baseCommitOid'] });
    }
  } else if (!hasBase) {
    context.addIssue({ code: 'custom', message: 'Staged and Working tree snapshots require a base commit.', path: ['baseCommitOid'] });
  }
}).readonly();
```
Add `'standalone'` to the `sourceKind` enum and its `superRefine`'s no-`baseCommitOid` branch (alongside `'unstaged'`) — structurally identical, no new branch logic. `WorktreeSnapshot.refresh()` (lines 608-650) already does path-keyed set-comparison (`diffManifestEntries`, lines 478+) producing `{ added, removed, modified }` — this is exactly the "report added/removed files through the Refresh summary" behavior CONTEXT.md's discretion section asks for; no new Refresh logic needed, only a new capture-source function feeding it (standalone's capture source is `resolveStandaloneArguments` re-run + `classifyStandaloneGitState`, replacing the diff-based capture source used by staged/unstaged/worktree).

---

### `src/server/capabilities.ts` (service, request-response) — MODIFIED, `createStandaloneCapabilityRegistry` (NEW)

**Analogs:** `createUncommittedCapabilityRegistry` (lines 896-1141, structural skeleton) + `createExactPatchCapabilityRegistry`'s `revealExportDirectory`/`exportReview` wiring (lines 822-893, since Phase 14 left these two capabilities unregistered on the uncommitted registry per RESEARCH.md's explicit note "Phase 14 left absent").

**Imports pattern** (lines 1-53) — reuse verbatim; add `buildReviewExportV4` to the existing `buildReviewExportV1/V2/V3` import from `../export/review-export.js`, and `standaloneReviewKey` alongside `uncommittedReviewKey` from `../domain/comparison-key.js`.

**Session-response + draft-store + verifyAnchor skeleton** (copy `createUncommittedCapabilityRegistry`'s shape):
```typescript
// Source: src/server/capabilities.ts:896-969 (existing precedent — session
// response shape, draftStore construction keyed by reviewKey + snapshotChain,
// verifyAnchor always resolving the 'head' side since standalone has no base)
export async function createUncommittedCapabilityRegistry(
  scope: UncommittedScope,
  snapshot: WorktreeSnapshot,
  options: CapabilityRegistryOptions = {},
): Promise<CapabilityRegistry> {
  const snapshotSession = await snapshot.session();
  const reviewKey = uncommittedReviewKey(scope.sourceKind, scope.baseCommitOid, snapshotSession.chain[0]!);
  const sessionResponse = async () => { /* ... SessionResponseSchema.parse({ uncommitted: {...}, files: [...] }) ... */ };
  const draftStore = options.draftStore ?? createDraftStore({
    repositoryRoot: scope.repositoryRoot,
    comparison: { kind: 'uncommitted', sourceKind: scope.sourceKind, reviewKey, snapshotChain: snapshotSession.chain },
  });
  const verifyAnchor = async (anchor: DurableAnchorV1) => { /* always side: 'head' for standalone, mirrors this exact body */ };
  // ... diskPathFor, indexStatIdentity/captureChangeBaseline NOT needed for
  // standalone (no index to watch — D-01 says no diff toggle at all) ...
  return Object.freeze({ session: sessionResponse, draftStore, verifyAnchor, /* ... */ });
}
```

**Export wiring to add (missing from the uncommitted registry per Pitfall 3; standalone must include it from day one since FILE-05 is a hard requirement):**
```typescript
// Source: src/server/capabilities.ts:822-893 (existing precedent on the
// exact-patch registry — copy this exportReview/revealExportDirectory shape
// onto createStandaloneCapabilityRegistry, swapping buildReviewExportV3 for
// buildReviewExportV4 and the patch scope for the standalone scope)
async revealExportDirectory() {
  if (options.revealDraftFile === undefined) throw new Error('Export reveal adapter is unavailable.');
  const managedRoot = await ensureManagedExportsRoot(scope.repositoryRoot, false);
  if (managedRoot === undefined) throw new Error('Export reveal adapter is unavailable.');
  const exportDirectory = join(managedRoot.exportsRoot, storageScope ?? reviewKey);
  await assertManagedExportsRoot(managedRoot);
  if (!(await isCompleteExportDirectory(exportDirectory))) throw new Error('Export reveal adapter is unavailable.');
  await assertManagedExportsRoot(managedRoot);
  await options.revealDraftFile(exportDirectory);
},
async exportReview(input) {
  const initial = await draftStore.loadState();
  if (initial.kind !== 'current') return ExportReviewResultSchema.parse({ kind: 'draftReadOnly' });
  if (initial.draft.revision !== input.expectedRevision) { /* ...revisionConflict handling, same shape... */ }
  // build standalone export scope { originalArguments, resolvedPaths, fileDigests, snapshotChain }
  // then: canonicalizeReviewExport(buildReviewExportV4({ acceptedDraft, commentVerification }, standaloneScope, new Date().toISOString()))
},
```

---

### `src/server/app.ts` (service, request-response) — `createStandaloneSessionApp` (NEW)

**Analog:** `createUncommittedSessionApp` (lines 194-218)

```typescript
// Source: src/server/app.ts:194-218 (existing precedent, copy structure
// verbatim — materialize snapshot, build Fastify instance, build capability
// registry, bind security, register routes, serve static web root)
export async function createUncommittedSessionApp(
  scope: UncommittedScope,
  options: CreateUncommittedSessionAppOptions,
): Promise<SessionApp> {
  const snapshot = await materializeWorktreeSnapshot(scope, {
    root: options.snapshotRoot ?? join(tmpdir(), `cumpa-worktree-${randomUUID()}`),
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } }) as unknown as SessionApp;
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, '../web');
  const support = options.support ?? createConfiguredSupportCapability();
  const capabilities = await createUncommittedCapabilityRegistry(scope, snapshot, { ...options, support });
  const security = registerSessionSecurity(app, options);

  app.addHook('onClose', async () => support?.close());
  app.decorate('bindSessionSecurity', security.bind);
  registerSessionRoutes(app, capabilities);
  void app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });
  return app;
}
// NEW createStandaloneSessionApp mirrors this exactly, swapping
// materializeWorktreeSnapshot(scope, ...) for whatever standalone-capture
// entry point the snapshot layer exposes (same `materializeWorktreeSnapshot`
// function if `'standalone'` is added as a sourceKind branch rather than a
// parallel capture path — reuse, don't fork, per RESEARCH.md's "Don't
// Hand-Roll" table) and createUncommittedCapabilityRegistry for
// createStandaloneCapabilityRegistry.
```
`registerSessionRoutes(app, capabilities)` (`src/server/routes.ts:124`) already fires `/api/export`/`/api/export/reveal` whenever `capabilities.exportReview`/`capabilities.revealExportDirectory` are defined (404-guarded otherwise, lines 420-499) — no route-file changes are needed once the standalone capability registry populates those two fields; `src/server/routes.ts` requires **zero new code**, only the capability registry wiring above.

---

### `src/export/review-export.ts` (service, transform) — `buildReviewExportV4` (NEW)

**Analog:** `buildReviewExportV3` (lines 181-218)

```typescript
// Source: src/export/review-export.ts:181-218 (existing precedent)
export function buildReviewExportV3(
  snapshot: AcceptedExactPatchReviewSnapshot,
  patch: ExactPatchExportScope,
  exportedAt: string,
): ReviewExportV3 {
  const draft = ReviewDraftV1Schema.parse(snapshot.acceptedDraft);
  if (!('kind' in draft.comparison) || draft.comparison.kind !== 'exact-patch' || draft.comparison.digest !== patch.digest
    || draft.comparison.validationTarget.kind !== patch.validationTarget.kind || draft.comparison.reviewKey !== patch.reviewKey) {
    throw new TypeError('Exact patch export provenance does not match accepted draft.');
  }
  const feedback = buildReviewExportV1(
    {
      acceptedDraft: draft,
      commentVerification: snapshot.commentVerification,
      comparison: { selectedBase: { label: 'preimage', launchOid: '0'.repeat(40) }, selectedHead: { label: 'postimage', launchOid: '0'.repeat(40) }, mergeBaseOid: '0'.repeat(40), comparisonKey: '0'.repeat(64) },
      drift: { observedAt: exportedAt, acknowledged: false, base: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' }, head: { launchOid: '0'.repeat(40), currentOid: '0'.repeat(40), status: 'unchanged' } },
    },
    exportedAt,
  );
  const { comparison: _comparison, drift: _drift, ...document } = feedback;
  return ReviewExportV3Schema.parse({ ...document, schemaVersion: 3, patch });
}
// NEW buildReviewExportV4(snapshot: AcceptedStandaloneReviewSnapshot, standalone: StandaloneExportScope, exportedAt: string):
// ReviewExportV4 — same synthetic zero-OID comparison/drift call into
// buildReviewExportV1, strip comparison/drift, attach schemaVersion: 4 and
// the standalone scope block. Provenance-match guard mirrors V3's: verify
// draft.comparison.kind === 'standalone' && the draft's originalArguments/
// reviewKey match the standalone scope being exported.
```

---

### `src/export/render-review-markdown.ts` (utility, transform) — MODIFIED

**Analog:** same file, existing `schemaVersion === 3` branch (lines 46-82)

```typescript
// Source: src/export/render-review-markdown.ts:46-62 (existing precedent)
export function renderReviewMarkdown(canonicalBytes: Uint8Array): string {
  const document = parseCanonicalReviewExport(canonicalBytes);
  const exactPatch = document.schemaVersion === 3;
  const lines: string[] = ['# Cumpa Export', ''];
  if (exactPatch) {
    lines.push(
      '## Exact patch',
      `Accepted draft revision: ${document.acceptedDraftRevision}`,
      `Exported at: ${document.exportedAt}`,
      `Patch digest: \`${document.patch.digest}\``,
      `Validation target: \`${document.patch.validationTarget.kind}\``,
      `Review key: \`${document.patch.reviewKey}\``,
      'Anchor sides: `Preimage` and `Postimage`.',
      '', '## Frozen patch files',
    );
    // ... per-file loop over document.patch.snapshot.files ...
  } else {
    // ... V1/V2 branch ...
  }
  // ...
}
// NEW: add `const standalone = document.schemaVersion === 4;` branch with
// its own '## Standalone files' section — "Original arguments: ..." (one
// per line, fenced), "Resolved paths: N", per-file sha256 digest list, and
// "Anchor side: `Head` (current content)." (standalone has only one side,
// unlike exact-patch's preimage/postimage).
```
`appendAnchor` (lines 15-34) and `appendComment` (lines 36-44) stay unmodified — standalone anchors use the existing `side: 'head'` vocabulary already handled by the non-`exactPatch` branch's `anchor.side` rendering (no `preimage`/`postimage` relabeling needed, since D-01/D-03 mean every standalone anchor is `side: 'head'`).

---

### `src/web/components/IdentityHeader.vue` (component) — MODIFIED

**Analog:** same file, `isUncommitted`/`uncommittedSession` branch (lines 30-46, 111-122)

```vue
<!-- Source: src/web/components/IdentityHeader.vue:30-46 (existing precedent) -->
<script setup lang="ts">
const isUncommitted = computed(() => 'uncommitted' in props.session);
const uncommittedSession = computed(() =>
  isUncommitted.value
    ? (props.session as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const sourceLabel = computed(() => {
  switch (uncommittedSession.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    default: return '';
  }
});
const shortDigest = computed(() => controlSafeDisplay(uncommittedSession.value?.reviewKey.slice(0, 7) ?? ''));
</script>
<!-- lines 111-122: template branch -->
<template v-else-if="isUncommitted">
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">BASE</span>
    <span v-if="uncommittedSession?.sourceKind === 'unstaged'" class="session-header__selector">Index</span>
    <span v-else class="session-header__selector" :title="baseCandidateLabel">{{ baseCandidateLabel }} · {{ baseCandidateOid }}</span>
  </span>
  <span aria-hidden="true">→</span>
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">HEAD</span>
    <span class="session-header__selector" :title="sourceLabel">{{ sourceLabel }} · snapshot {{ shortDigest }}</span>
  </span>
</template>
```
NEW: add `isStandalone`/`standaloneSession` computeds identically shaped, and a new `v-else-if="isStandalone"` template branch per D-02/CONTEXT.md's exact copy: single `session-header__endpoint` (no BASE→HEAD arrow pair, since there's no comparison) reading `Standalone review · N files` (N = `standaloneSession.changedFileCount` or `resolvedPaths.length`) plus `snapshot {{ shortDigest }}` reusing the same `controlSafeDisplay(...reviewKey.slice(0, 7))` pattern. `pin-cue` text (line 137, `'Frozen patch' : isUncommitted ? 'Frozen snapshot' : 'Pinned comparison'`) gains a third ternary arm, e.g. `isStandalone ? 'Frozen snapshot' : ...` (can share uncommitted's copy verbatim since both are Phase 14 snapshot-backed).

---

### `src/web/components/ActiveFileToolbar.vue` + `FileRow.vue` (components) — MODIFIED

**Analogs:** same files — `layoutLabel` computed (`ActiveFileToolbar.vue:36-50`), `availability-marker` span (`FileRow.vue:29-40, 69-77`)

```vue
<!-- Source: src/web/components/ActiveFileToolbar.vue:36-50 (existing precedent —
     status.kind-driven label computed; standalone's git-state label is a
     SIBLING concern per Pattern 5, read from a new field, never status.kind) -->
const layoutLabel = computed(() => {
  if (singlePaneSide.value === undefined || props.selectedFile === undefined) return undefined;
  switch (props.selectedFile.status.kind) {
    case 'added': return 'Added · Head only';
    case 'deleted': return 'Deleted · Base only';
    case 'type-changed': return `Type changed · Head only (was ${wasModeKind(props.selectedFile.oldMode)})`;
    default: return undefined;
  }
});
```
NEW: every standalone `SessionFile` carries `status.kind === 'added'` (per Pattern 5) plus a new sibling field, e.g. `standaloneGitState: 'modified-uncommitted' | 'untracked' | 'unchanged'` on the file DTO (added to `SessionFileSchema` in `src/contracts/api.ts`, not shown here since that file wasn't in the explicit modification list but is the natural schema home — flag to planner). Add a `standaloneStateLabel` computed reading that field, mapped to D-02's exact copy:
```typescript
const standaloneStateLabel = computed(() => {
  switch (props.selectedFile?.standaloneGitState) {
    case 'modified-uncommitted': return 'Standalone · Modified (uncommitted)';
    case 'untracked': return 'Standalone · Untracked';
    case 'unchanged': return 'Standalone · Unchanged';
    default: return undefined;
  }
});
```
and render it in place of (or alongside) `layoutLabel`'s `<span class="review-toolbar__status">` (line 82) when the session is standalone.

```vue
<!-- Source: src/web/components/FileRow.vue:69-77 (existing precedent — a
     text marker span, not color-only, matching Phase 09/13's rule; D-02
     requires the exact same discipline for the tree-row git-state marker) -->
<span
  class="availability-marker"
  :class="[`availability-marker--${leaf.file.availability.kind}`, { 'visually-hidden': leaf.file.availability.kind === 'text' }]"
>
  {{ availabilityLabel }}
</span>
```
NEW: add a sibling `standalone-state-marker` span following the same text-marker (not color-only) discipline, visible whenever `leaf.file.standaloneGitState` is present, reading the same three-value label set as above.

---

### `tests/e2e/standalone-review.spec.ts` (NEW — Playwright e2e)

**Analog:** `tests/e2e/uncommitted-review.spec.ts` (full file, 477 lines)

```typescript
// Source: tests/e2e/uncommitted-review.spec.ts:1-99 (existing precedent —
// packed-CLI fixture pattern: pack the project into a tarball once, extract,
// spawn `dist/bin/cumpa.mjs` as a real child process against a git-fixture
// repo, scrape the loopback URL from stdout, drive it with Playwright)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, /* ... */ } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), 'cumpa-standalone-pack-')); // rename prefix only
const executablePath = join(packedRoot, 'package/dist/bin/cumpa.mjs');

function startGeneratedStandaloneCli(
  repository: GitFixture,
  paths: readonly string[], // NEW: positional args instead of flags
  options: Readonly<{ stdin?: 'ignore' | 'pipe' }> = {},
): RunningCli {
  // identical spawn/output-scraping shape to startGeneratedUncommittedCli,
  // swapping `flags` (--staged/--unstaged/--worktree) for positional `paths`
}
```
Coverage to add, mirroring `uncommitted-review.spec.ts`'s test-case shape (tracked+untracked file mix, header copy assertions, Refresh behavior, export provenance): untracked file opened directly, modified-uncommitted file opened directly, glob argument matching multiple files, directory argument recursion, `../` traversal pre-launch error, ignored-file pre-launch error, mode-exclusivity error (`cumpa --worktree foo.ts`), Refresh re-resolving a glob to pick up a newly-created matching file, export producing `schemaVersion: 4` JSON with `originalArguments`/`resolvedPaths`/`fileDigests`.

---

## Shared Patterns

### Native-Git-as-source-of-truth boundary
**Source:** `src/git/exact-patch.ts` (`exactPath` string-level traversal rejection, lines 122-131) + `src/git/worktree-inventory.ts` (`lstatWorktreeLeaf`, lines 137-178)
**Apply to:** `src/git/standalone-resolution.ts` exclusively — `src/git/` never trusts JS-side path arithmetic over Git's own pathspec resolution (`ls-files`'s fatal exit-128 rejection of `../`, absolute-outside, and embedded `../../` paths is FILE-04's actual enforcement point, verified empirically in RESEARCH.md). The only legitimate `fs.realpath` call in the codebase canonicalizes the repository root itself once at startup (`src/git/repository.ts`) — never per-argument, never per-resolved-file.
```typescript
// Per-segment lstat walk discipline (never fs.realpath-follow), identical
// in both existing implementations:
for (const [index, part] of parts.entries()) {
  current = Buffer.concat([current, Buffer.from('/', 'ascii'), Buffer.from(part, 'latin1')]);
  const entry = await lstat(current);
  if (index < parts.length - 1 && entry.isSymbolicLink()) fail(); // never descend through a symlinked directory
  // ... final segment: symlink itself is listed but never followed ...
}
```

### Git-state label is a new sibling field, never an overload of `ChangedFileStatusKind`
**Source:** `src/contracts/comparison.ts:74-82` (`ChangedFileStatusKindSchema`, a *diff*-status vocabulary Phase 13's rendering switch keys off of)
**Apply to:** `src/contracts/comparison.ts`/`src/contracts/api.ts` (new `standaloneGitState` field), `ActiveFileToolbar.vue`, `FileRow.vue`
Every standalone `ChangedFile` sets `status.kind = 'added'` (reusing Phase 13's head-only, full-pane, no-tint rendering verbatim, `similarity: null`) and carries git state in a **separate** field consumed only by header/tree-marker copy — never by `DiffWorkspace.vue`'s layout switch, which must stay untouched by this phase.

### Export schema versioning — superset chain, not a bespoke shape
**Source:** `src/contracts/draft.ts:304-469` (`ReviewExportV1Schema`→`V2`→`V3`), `src/export/review-export.ts:92-218` (`buildReviewExportV1`→`V2`→`V3`)
**Apply to:** `src/contracts/draft.ts` (`ReviewExportV4Schema`), `src/export/review-export.ts` (`buildReviewExportV4`), `src/export/render-review-markdown.ts`
Each version's `superRefine` re-derives and `safeParse`s a V1-shaped sub-document to guarantee backward compatibility by construction — `ReviewExportV4Schema` must do the same.

### Capability-registry 404-guard routing
**Source:** `src/server/routes.ts:420-499` (`/api/export`, `/api/export/gitignore`, `/api/export/reveal`)
**Apply to:** `src/server/capabilities.ts` only — routes.ts requires no new code; a capability simply needs to be populated (or left `undefined`) on the registry object.
```typescript
// Source: src/server/routes.ts:421-424 (existing precedent, repeats 3x)
app.post<{ Querystring: Record<string, never>; Body: unknown }>(
  '/api/export',
  { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 256 },
  async (request, reply) => {
    if (capabilities.exportReview === undefined) return unavailable(reply, 404);
    // ...
  },
);
```

### Don't Hand-Roll (from RESEARCH.md, reconfirmed against codebase)
| Problem | Don't Build | Use Instead |
|---|---|---|
| Glob/directory pathspec expansion | JS glob library | `git ls-files --cached --others --exclude-standard -- <pathspec>` |
| Path-traversal / absolute-outside rejection | Custom `path.resolve()` + prefix check | Git's own fatal exit-128 pathspec rejection |
| Symlink-escape prevention | `fs.realpath` | Per-segment `lstat` walk (`exact-patch.ts:worktreeEntry`/`worktree-inventory.ts:lstatWorktreeLeaf`) |
| New snapshot engine | Parallel capture/retry/chain logic | `WorktreeSnapshotManifestSchema`/`WorktreeSnapshot` with `'standalone'` sourceKind branch |
| Export schema versioning | Bespoke unversioned JSON | `ReviewExportV4Schema` as the next superset-chain member |

## No Analog Found

None — every file in RESEARCH.md's Recommended Project Structure has a direct or composite analog already in the codebase; this is a pure-integration phase per RESEARCH.md's Summary.

## Metadata

**Analog search scope:** `src/cli/`, `src/git/`, `src/contracts/`, `src/domain/`, `src/server/`, `src/export/`, `src/web/components/`, `tests/e2e/`
**Files scanned:** `src/cli/run.ts`, `src/git/exact-patch.ts`, `src/git/worktree-inventory.ts`, `src/git/ignore-status.ts`, `src/git/inventory.ts`, `src/contracts/request.ts`, `src/contracts/comparison.ts`, `src/contracts/draft.ts`, `src/contracts/api.ts`, `src/domain/comparison-key.ts`, `src/server/app.ts`, `src/server/capabilities.ts`, `src/server/routes.ts`, `src/server/worktree-snapshot.ts`, `src/export/review-export.ts`, `src/export/render-review-markdown.ts`, `src/web/components/IdentityHeader.vue`, `src/web/components/ActiveFileToolbar.vue`, `src/web/components/FileRow.vue`, `src/web/components/StatusBadge.vue`, `src/web/model/single-pane-layout.ts`, `tests/e2e/uncommitted-review.spec.ts`
**Pattern extraction date:** 2026-10-31
