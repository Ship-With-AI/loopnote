import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';

import open from 'open';
import { z } from 'zod';

import { confirmPinnedComparison } from './confirm.js';
import { AgentRequestError, readAgentReviewRequest } from './request.js';
import {
  pickSource,
  type PickedSource,
  type PickerRecoveryOptions,
  type UncommittedRowKind,
} from './picker.js';
import {
  ComparisonSelectionSchema,
  GitObjectIdSchema,
  UncommittedScopeSchema,
  type GroundedExactPatch,
  type ComparisonSelection,
  type PinnedComparison,
  type UncommittedScope,
} from '../contracts/comparison.js';
import type {
  OrderedSources,
  SourceCandidate,
  WorktreeCandidate,
} from '../domain/source.js';
import { isLaunchError, type LaunchError } from '../domain/errors.js';
import { discoverSourceCandidates } from '../git/candidates.js';
import type { SourceDiscovery } from '../git/candidates.js';
import { discoverGitRepository } from '../git/repository.js';
import type { GitRepository } from '../git/repository.js';
import { createGitRunner, GitRunnerError } from '../git/runner.js';
import type { GitRunner } from '../git/runner.js';
import { createWorktreeChangedFileInventory } from '../git/worktree-inventory.js';
import {
  classifyStandaloneGitState,
  createStandaloneChangedFileInventory,
  resolveStandaloneArguments,
} from '../git/standalone-resolution.js';
import {
  createPinnedComparison,
  createPinnedRangeComparison,
  type CreatePinnedComparisonOptions,
  type CreatePinnedRangeComparisonOptions,
} from '../git/comparison.js';
import {
  createGroundedExactPatch,
  ExactPatchGroundingError,
} from '../git/exact-patch.js';
import {
  createConfiguredSupportCapability,
  createExactPatchSessionApp,
  createSessionApp,
  createStandaloneSessionApp,
  createUncommittedSessionApp,
  type CreateStandaloneSessionAppOptions,
  type CreateUncommittedSessionAppOptions,
  type SessionApp,
} from '../server/app.js';
import {
  createAttachedCompletionCoordinator,
  type AttachedCompletionCoordinator,
} from '../server/attached-completion.js';
import type {
  AttachedCompletionOptions,
  DraftRevealPort,
  SupportCapability,
} from '../server/capabilities.js';
import { PatchSnapshotError } from '../server/patch-snapshot.js';
import { findUncommittedDraftCandidate } from '../server/draft-store.js';
import {
  createShutdownController,
  type ShutdownController,
  type ShutdownSignalSource,
} from '../server/lifecycle.js';

const expectedPackageName = '@shipwithai/cumpa';
const semanticVersionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export async function readPackageVersionFromManifest(
  manifestUrl = new URL('../../package.json', import.meta.url),
): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(manifestUrl, 'utf8'));
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Package manifest must be an object');
  }
  const { name, version } = manifest as { name?: unknown; version?: unknown };
  if (name !== expectedPackageName) {
    throw new Error(`Package manifest name must be ${expectedPackageName}`);
  }
  if (typeof version !== 'string' || !semanticVersionPattern.test(version)) {
    throw new Error('Package manifest version must be a semantic version');
  }
  return version;
}

const packagedLaunchOptionsSchema = z.strictObject({
  cwd: z.string().min(1),
  base: ComparisonSelectionSchema,
  head: ComparisonSelectionSchema,
});

const browserFallback =
  'Open the URL above if the browser did not open. Press Ctrl+C to stop.';

type CmuxCommandRunner = (
  executable: 'cmux',
  arguments_: readonly ['open', string],
) => Promise<unknown>;

export interface BrowserUrlOpenerDependencies {
  readonly environment?: NodeJS.ProcessEnv;
  readonly openSystemBrowser?: (url: string) => Promise<unknown>;
  readonly runCmux?: CmuxCommandRunner;
}

function runCmux(
  executable: 'cmux',
  arguments_: readonly ['open', string],
): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  const child = spawn(executable, arguments_, { shell: false, stdio: 'ignore' });
  child.once('error', reject);
  child.once('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error('cmux could not open the browser URL'));
  });
  return promise;
}

export function createBrowserUrlOpener(
  dependencies: BrowserUrlOpenerDependencies = {},
): (url: string) => Promise<unknown> {
  const environment = dependencies.environment ?? process.env;
  const openSystemBrowser =
    dependencies.openSystemBrowser ??
    (async (url: string) => {
      await open(url);
    });
  const runCmuxCommand = dependencies.runCmux ?? runCmux;

  return async (url: string) => {
    if (environment.CMUX_WORKSPACE_ID !== undefined) {
      await runCmuxCommand('cmux', ['open', url]);
      return;
    }
    await openSystemBrowser(url);
  };
}

export interface LaunchPinnedSessionDependencies {
  readonly openBrowser?: (url: string) => Promise<unknown>;
  readonly revealDraftFile?: DraftRevealPort;
  readonly output?: (message: string) => void;
  readonly signalSource?: ShutdownSignalSource;
  readonly setExitStatus?: (status: number) => void;
  readonly support?: SupportCapability;
  readonly webRoot?: string;
}

export interface RunCliOptions {
  readonly cwd: string;
}

export interface RunCliDependencies {
  readonly discoverCandidates?: (
    options: RunCliOptions,
  ) => Promise<SourceDiscovery>;
  readonly pickSources?: (
    options: {
      readonly candidates: readonly SourceCandidate[];
      readonly searchBranches: SourceDiscovery['searchBranches'];
      readonly candidateEnrichment?: SourceDiscovery['candidateEnrichment'];
      readonly startCandidateEnrichment?: SourceDiscovery['startCandidateEnrichment'];
      readonly suggestedHeadId?: string;
      readonly preselectedBaseId?: string;
      readonly initialBase?: SourceCandidate;
      readonly initialHead?: SourceCandidate;
      readonly recovery?: PickerRecoveryOptions;
    },
  ) => Promise<PickedSource>;
  readonly createDescriptor?: (
    options: CreatePinnedComparisonOptions,
  ) => Promise<PinnedComparison>;
  readonly confirmComparison?: (
    comparison: PinnedComparison,
  ) => Promise<'back' | 'launch'>;
  readonly launchComparison?: (
    comparison: PinnedComparison,
  ) => Promise<unknown>;
  readonly openBrowser?: (url: string) => Promise<unknown>;
  readonly webRoot?: string;
  readonly revealDraftFile?: DraftRevealPort;
  readonly signalSource?: ShutdownSignalSource;
  readonly support?: SupportCapability;
  readonly createUncommittedSessionApp?: typeof createUncommittedSessionApp;
  readonly findUncommittedDraftCandidate?: typeof findUncommittedDraftCandidate;
  readonly output?: (message: string) => void;
  readonly setExitStatus?: (status: number) => void;
}

export interface OrdinaryActionDependencies {
  readonly isTTY?: boolean;
  readonly input?: AsyncIterable<Uint8Array>;
  readonly runCli?: (options: RunCliOptions) => Promise<void>;
  readonly readRequest?: typeof readAgentReviewRequest;
  readonly createRangeComparison?: (
    options: CreatePinnedRangeComparisonOptions,
  ) => Promise<PinnedComparison>;
  readonly createGroundedExactPatch?: typeof createGroundedExactPatch;
  readonly createSessionApp?: typeof createSessionApp;
  readonly createExactPatchSessionApp?: typeof createExactPatchSessionApp;
  readonly createUncommittedSessionApp?: typeof createUncommittedSessionApp;
  readonly createStandaloneSessionApp?: typeof createStandaloneSessionApp;
  readonly findUncommittedDraftCandidate?: typeof findUncommittedDraftCandidate;
  readonly openBrowser?: (url: string) => Promise<unknown>;
  readonly webRoot?: string;
  readonly revealDraftFile?: DraftRevealPort;
  readonly output?: (message: string) => void;
  readonly stdout?: (bytes: Uint8Array) => Promise<void> | void;
  readonly signalSource?: ShutdownSignalSource;
  readonly support?: SupportCapability;

  readonly setExitStatus?: (status: number) => void;
}

export interface PinnedSessionLaunch {
  readonly comparison: PinnedComparison;
  readonly shutdown: ShutdownController;
  readonly url: string;
}

export async function createComparisonLaunchDescriptor(
  options: CreatePinnedComparisonOptions,
): Promise<PinnedComparison> {
  return await createPinnedComparison(options);
}

interface LaunchRuntime {
  readonly activeGit: AbortController;
  readonly launch: (
    comparison: PinnedComparison,
  ) => Promise<PinnedSessionLaunch | undefined>;
  readonly fail: (error: unknown) => Promise<undefined>;
}

function createLaunchRuntime(
  dependencies: LaunchPinnedSessionDependencies,
): LaunchRuntime {
  const support = dependencies.support ?? createConfiguredSupportCapability();
  const activeGit = new AbortController();
  const output = dependencies.output ?? console.log;
  const openBrowser = dependencies.openBrowser ?? createBrowserUrlOpener();
  const revealDraftFile =
    dependencies.revealDraftFile ??
    (async (canonicalPath: string) => {
      await open(canonicalPath);
    });
  let app: SessionApp | undefined;
  const shutdown = createShutdownController({
    signalSource: dependencies.signalSource,
    abortActiveWork: () => {
      activeGit.abort();
    },
    closeListener: async () => {
      if (app !== undefined) {
        await app.close();
      }
    },
    setExitStatus: dependencies.setExitStatus,
    reportError: (error) => {
      console.error('Cumpa shutdown failed.', error);
    },
  });

  const fail = async (error: unknown): Promise<undefined> => {
    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return undefined;
    }
    await shutdown.shutdown(1);
    throw error;
  };

  const launch = async (
    comparison: PinnedComparison,
  ): Promise<PinnedSessionLaunch | undefined> => {
    try {
      if (shutdown.isShuttingDown) {
        await shutdown.shutdown();
        return undefined;
      }

      const token = randomBytes(32).toString('base64url');
      app = createSessionApp(comparison, {
        webRoot: dependencies.webRoot,
        support,
        sessionToken: token,
        revealDraftFile,
        diagnostics: ({ correlationId, reason }) => {
          console.error(`Cumpa request denied [${correlationId}]: ${reason}.`);
        },
      });
      await app.listen({ host: '127.0.0.1', port: 0 });
      if (shutdown.isShuttingDown) {
        await shutdown.shutdown();
        return undefined;
      }

      const address = app.server.address();
      if (
        address === null ||
        typeof address === 'string' ||
        address.address !== '127.0.0.1' ||
        address.port === 0
      ) {
        throw new Error(
          'Fastify did not bind the required IPv4 loopback address',
        );
      }
      const authority = `127.0.0.1:${address.port}`;
      app.bindSessionSecurity({
        expectedHost: authority,
        expectedOrigin: `http://${authority}`,
      });
      const url = `http://${authority}/#token=${token}`;

      output(url);
      output(browserFallback);
      try {
        await openBrowser(url);
      } catch {
        output(
          'Browser did not open automatically. Open the URL above manually.',
        );
      }

      return { comparison, shutdown, url };
    } catch (error) {
      return await fail(error);
    }
  };

  return { activeGit, launch, fail };
}

export async function launchPinnedComparison(
  comparison: PinnedComparison,
  dependencies: LaunchPinnedSessionDependencies = {},
): Promise<PinnedSessionLaunch | undefined> {
  return await createLaunchRuntime(dependencies).launch(comparison);
}

export async function launchPinnedSession(
  options: CreatePinnedComparisonOptions,
  dependencies: LaunchPinnedSessionDependencies = {},
): Promise<PinnedSessionLaunch | undefined> {
  const runtime = createLaunchRuntime(dependencies);
  let comparison: PinnedComparison;
  try {
    comparison = await createComparisonLaunchDescriptor({
      ...options,
      signal:
        options.signal === undefined
          ? runtime.activeGit.signal
          : AbortSignal.any([options.signal, runtime.activeGit.signal]),
    });
  } catch (error) {
    return await runtime.fail(error);
  }
  return await runtime.launch(comparison);
}

function selectionForCandidate(
  candidate: SourceCandidate,
): ComparisonSelection {
  if (candidate.kind === 'branch') {
    return {
      label: candidate.label,
      revision: candidate.refName,
      source: {
        kind: 'branch',
        id: candidate.id,
        refName: candidate.refName,
      },
    };
  }
  return selectionForWorktree(candidate);
}

function selectionForWorktree(
  candidate: WorktreeCandidate,
): ComparisonSelection {
  if (
    (candidate.availability !== 'clean' &&
      candidate.availability !== 'dirty') ||
    candidate.commitOid === undefined
  ) {
    throw new Error(
      `Unavailable worktree cannot be selected: ${candidate.path}`,
    );
  }
  return {
    label: candidate.label,
    revision: candidate.commitOid,
    source: {
      kind: 'worktree',
      id: candidate.id,
      path: candidate.path,
      detached: candidate.detached,
      dirty: candidate.availability === 'dirty',
    },
  };
}

function reportFatalLaunchError(
  error: LaunchError,
  output: (message: string) => void,
  setExitStatus: (status: number) => void,
): void {
  output(error.message);
  setExitStatus(1);
}

const UNSTAGED_BASE_CONFLICT_MESSAGE =
  '--base cannot be used with --unstaged — Unstaged always compares the index against the working tree.';

export function resolveUncommittedFlagSelection(cliOptions: {
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly worktree?: boolean;
}): UncommittedRowKind | undefined {
  if (cliOptions.staged === true) {
    return 'staged';
  }
  if (cliOptions.unstaged === true) {
    return 'unstaged';
  }
  if (cliOptions.worktree === true) {
    return 'worktree';
  }
  return undefined;
}

export function validateUncommittedFlags(cliOptions: {
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly worktree?: boolean;
  readonly base?: string;
}): void {
  const selectedCount = [
    cliOptions.staged,
    cliOptions.unstaged,
    cliOptions.worktree,
  ].filter((flag) => flag === true).length;
  if (selectedCount > 1) {
    throw new Error(
      '--staged, --unstaged, and --worktree are mutually exclusive. Choose exactly one.',
    );
  }
  if (cliOptions.unstaged === true && cliOptions.base !== undefined) {
    throw new Error(UNSTAGED_BASE_CONFLICT_MESSAGE);
  }
}

export function validateStandaloneExclusivity(
  paths: readonly string[],
  cliOptions: {
    readonly staged?: boolean;
    readonly unstaged?: boolean;
    readonly worktree?: boolean;
    readonly base?: string;
  },
): void {
  if (paths.length === 0) {
    return;
  }
  if (
    cliOptions.staged === true ||
    cliOptions.unstaged === true ||
    cliOptions.worktree === true ||
    cliOptions.base !== undefined
  ) {
    throw new Error(
      'Positional paths cannot be combined with --staged, --unstaged, --worktree, or --base.',
    );
  }
}

async function resolveUncommittedObjectFormat(
  repositoryRoot: string,
  runner: GitRunner,
  signal?: AbortSignal,
): Promise<'sha1' | 'sha256'> {
  const result = await runner.run(
    ['rev-parse', '--show-object-format=storage'],
    { cwd: repositoryRoot, signal },
  );
  const objectFormat = result.stdout.toString('utf8').trim();
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
    throw new Error('Git repository reports an unsupported object format.');
  }
  return objectFormat;
}

async function resolveUncommittedBaseCommitOid(
  baseRef: string | undefined,
  repository: GitRepository,
  runner: GitRunner,
  signal?: AbortSignal,
): Promise<string> {
  const revision = baseRef ?? repository.headOid;
  try {
    const result = await runner.run(
      ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`],
      { cwd: repository.root, signal },
    );
    return GitObjectIdSchema.parse(result.stdout.toString('ascii').trim());
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new Error(
      `Base ref "${revision}" could not be resolved to a commit.`,
    );
  }
}

async function resolveUncommittedMergeBaseOid(
  baseCommitOid: string,
  headOid: string,
  repositoryRoot: string,
  runner: GitRunner,
  signal?: AbortSignal,
): Promise<string> {
  let stdout: Buffer = Buffer.alloc(0);
  try {
    const result = await runner.run(
      ['merge-base', '--all', baseCommitOid, headOid],
      { cwd: repositoryRoot, signal },
    );
    stdout = result.stdout;
  } catch (error) {
    if (
      !(
        error instanceof GitRunnerError &&
        error.kind === 'exit' &&
        error.exitCode === 1 &&
        error.stderr.length === 0
      )
    ) {
      throw error;
    }
  }
  const mergeBases = stdout
    .toString('ascii')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (mergeBases.length === 0) {
    throw new Error(
      'Base and HEAD have unrelated histories; Git could not find a merge base.',
    );
  }
  if (mergeBases.length > 1) {
    throw new Error(
      'Base and HEAD have multiple merge bases, so this comparison cannot be resolved unambiguously.',
    );
  }
  return GitObjectIdSchema.parse(mergeBases[0]);
}

function registerUncommittedRefreshKeypress(
  authority: string,
  token: string,
  output: (message: string) => void,
  shutdown: ShutdownController,
): () => void {
  const stdin = process.stdin;
  if (stdin.isTTY !== true) {
    return () => undefined;
  }
  const wasRaw = stdin.isRaw === true;
  stdin.setRawMode(true);
  stdin.resume();
  const onData = (chunk: Buffer): void => {
    const key = chunk.toString('utf8');
    if (key === '\u0003') {
      shutdown.shutdown(130).catch((error: unknown) => {
        console.error('Cumpa shutdown failed.', error);
      });
      return;
    }
    if (key === 'r') {
      void fetch(`http://${authority}/api/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => {
          output(
            response.ok
              ? 'Refreshed the uncommitted session snapshot.'
              : 'Could not refresh the uncommitted session snapshot.',
          );
        })
        .catch(() => {
          output('Could not refresh the uncommitted session snapshot.');
        });
    }
  };
  stdin.on('data', onData);
  return () => {
    stdin.off('data', onData);
    if (stdin.isTTY === true) {
      stdin.setRawMode(wasRaw);
    }
  };
}

async function launchUncommittedSession(
  selection: Readonly<{
    readonly sourceKind: UncommittedRowKind;
    readonly baseRef?: string;
  }>,
  dependencies: OrdinaryActionDependencies,
  options: RunCliOptions,
): Promise<void> {
  const output = dependencies.output ?? console.error;
  const support = dependencies.support ?? createConfiguredSupportCapability();
  const openBrowser = dependencies.openBrowser ?? createBrowserUrlOpener();
  const revealDraftFile =
    dependencies.revealDraftFile ??
    (async (canonicalPath: string) => {
      await open(canonicalPath);
    });
  const createApp =
    dependencies.createUncommittedSessionApp ??
    ((scope: UncommittedScope, appOptions: CreateUncommittedSessionAppOptions) =>
      createUncommittedSessionApp(scope, appOptions));
  const findDraftCandidate =
    dependencies.findUncommittedDraftCandidate ?? findUncommittedDraftCandidate;
  const activeGit = new AbortController();
  let app: SessionApp | undefined;
  let stopRefreshKeypress: (() => void) | undefined;

  const shutdown = createShutdownController({
    signalSource: dependencies.signalSource,
    abortActiveWork: () => {
      activeGit.abort();
    },
    closeListener: async () => {
      stopRefreshKeypress?.();
      if (app !== undefined) {
        await app.close();
      }
    },
    setExitStatus: dependencies.setExitStatus,
    reportError: (error) => {
      console.error('Cumpa shutdown failed.', error);
    },
  });

  try {
    const runner = createGitRunner();
    const repository = await discoverGitRepository(
      options.cwd,
      runner,
      activeGit.signal,
    );
    const objectFormat = await resolveUncommittedObjectFormat(
      repository.root,
      runner,
      activeGit.signal,
    );

    let baseCommitOid: string | undefined;
    let mergeBaseOid: string | undefined;
    if (selection.sourceKind !== 'unstaged') {
      baseCommitOid = await resolveUncommittedBaseCommitOid(
        selection.baseRef,
        repository,
        runner,
        activeGit.signal,
      );
      mergeBaseOid = await resolveUncommittedMergeBaseOid(
        baseCommitOid,
        repository.headOid,
        repository.root,
        runner,
        activeGit.signal,
      );
    }

    const changedFiles = await createWorktreeChangedFileInventory(
      {
        sourceKind: selection.sourceKind,
        repositoryRoot: repository.root,
        objectFormat,
        signal: activeGit.signal,
        ...(mergeBaseOid === undefined ? {} : { mergeBaseOid }),
      },
      { runner },
    );

    const scope: UncommittedScope = UncommittedScopeSchema.parse({
      kind: 'uncommitted',
      sourceKind: selection.sourceKind,
      repositoryRoot: repository.root,
      objectFormat,
      changedFiles,
      ...(baseCommitOid === undefined ? {} : { baseCommitOid }),
      ...(mergeBaseOid === undefined ? {} : { mergeBaseOid }),
    });

    const recoveryCandidate = await findDraftCandidate(
      repository.root,
      selection.sourceKind,
      baseCommitOid,
    );

    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }

    const token = randomBytes(32).toString('base64url');
    app = await createApp(scope, {
      webRoot: dependencies.webRoot,
      support,
      sessionToken: token,
      revealDraftFile,
      ...(recoveryCandidate === undefined ? {} : { uncommittedRecoveryCandidate: { path: recoveryCandidate.path } }),
      diagnostics: ({ correlationId, reason }) => {
        console.error(`Cumpa request denied [${correlationId}]: ${reason}.`);
      },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }

    const address = app.server.address();
    if (
      address === null ||
      typeof address === 'string' ||
      address.address !== '127.0.0.1' ||
      address.port === 0
    ) {
      throw new Error(
        'Fastify did not bind the required IPv4 loopback address',
      );
    }
    const authority = `127.0.0.1:${address.port}`;
    app.bindSessionSecurity({
      expectedHost: authority,
      expectedOrigin: `http://${authority}`,
    });
    const url = `http://${authority}/#token=${token}`;

    output(url);
    output(browserFallback);
    try {
      await openBrowser(url);
    } catch {
      output(
        'Browser did not open automatically. Open the URL above manually.',
      );
    }

    stopRefreshKeypress = registerUncommittedRefreshKeypress(
      authority,
      token,
      output,
      shutdown,
    );
  } catch (error) {
    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }
    await shutdown.shutdown(1);
    if (error instanceof Error) {
      output(error.message);
      return;
    }
    throw error;
  }
}

async function launchStandaloneSession(
  paths: readonly string[],
  dependencies: OrdinaryActionDependencies,
  options: RunCliOptions,
): Promise<void> {
  const output = dependencies.output ?? console.error;
  const support = dependencies.support ?? createConfiguredSupportCapability();
  const openBrowser = dependencies.openBrowser ?? createBrowserUrlOpener();
  const revealDraftFile =
    dependencies.revealDraftFile ??
    (async (canonicalPath: string) => {
      await open(canonicalPath);
    });
  const createApp =
    dependencies.createStandaloneSessionApp ??
    ((scope: UncommittedScope, appOptions: CreateStandaloneSessionAppOptions) =>
      createStandaloneSessionApp(scope, appOptions));
  const activeGit = new AbortController();
  let app: SessionApp | undefined;
  let stopRefreshKeypress: (() => void) | undefined;

  const shutdown = createShutdownController({
    signalSource: dependencies.signalSource,
    abortActiveWork: () => {
      activeGit.abort();
    },
    closeListener: async () => {
      stopRefreshKeypress?.();
      if (app !== undefined) {
        await app.close();
      }
    },
    setExitStatus: dependencies.setExitStatus,
    reportError: (error) => {
      console.error('Cumpa shutdown failed.', error);
    },
  });

  try {
    const runner = createGitRunner();
    const repository = await discoverGitRepository(
      options.cwd,
      runner,
      activeGit.signal,
    );
    const objectFormat = await resolveUncommittedObjectFormat(
      repository.root,
      runner,
      activeGit.signal,
    );

    const resolvedPaths = await resolveStandaloneArguments(
      repository.root,
      paths,
      { runner },
    );
    const gitStates = await classifyStandaloneGitState(
      repository.root,
      resolvedPaths,
      { runner },
    );
    const changedFiles = await createStandaloneChangedFileInventory(
      repository.root,
      resolvedPaths,
      gitStates,
      objectFormat,
      { runner, signal: activeGit.signal },
    );

    const scope: UncommittedScope = UncommittedScopeSchema.parse({
      kind: 'uncommitted',
      sourceKind: 'standalone',
      repositoryRoot: repository.root,
      objectFormat,
      standaloneArguments: paths,
      changedFiles,
    });

    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }

    const token = randomBytes(32).toString('base64url');
    app = await createApp(scope, {
      webRoot: dependencies.webRoot,
      support,
      sessionToken: token,
      revealDraftFile,
      diagnostics: ({ correlationId, reason }) => {
        console.error(`Cumpa request denied [${correlationId}]: ${reason}.`);
      },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }

    const address = app.server.address();
    if (
      address === null ||
      typeof address === 'string' ||
      address.address !== '127.0.0.1' ||
      address.port === 0
    ) {
      throw new Error(
        'Fastify did not bind the required IPv4 loopback address',
      );
    }
    const authority = `127.0.0.1:${address.port}`;
    app.bindSessionSecurity({
      expectedHost: authority,
      expectedOrigin: `http://${authority}`,
    });
    const url = `http://${authority}/#token=${token}`;

    output(url);
    output(browserFallback);
    try {
      await openBrowser(url);
    } catch {
      output(
        'Browser did not open automatically. Open the URL above manually.',
      );
    }

    stopRefreshKeypress = registerUncommittedRefreshKeypress(
      authority,
      token,
      output,
      shutdown,
    );
  } catch (error) {
    if (shutdown.isShuttingDown) {
      await shutdown.shutdown();
      return;
    }
    await shutdown.shutdown(1);
    if (error instanceof Error) {
      output(error.message);
      return;
    }
    throw error;
  }
}

function writeStdout(bytes: Uint8Array): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  process.stdout.write(bytes, (error) => {
    if (error === undefined || error === null) {
      resolve();
      return;
    }
    reject(error);
  });
  return promise;
}

function waitForAttachedOutcome(
  coordinator: AttachedCompletionCoordinator,
  signalSource: ShutdownSignalSource | undefined,
): Promise<Awaited<AttachedCompletionCoordinator['delivery']> | undefined> {
  const source = signalSource ?? process;
  const signal = Promise.withResolvers<undefined>();
  const onSignal = () => {
    signal.resolve(undefined);
  };
  source.on('SIGINT', onSignal);
  source.on('SIGTERM', onSignal);
  return Promise.race([coordinator.delivery, signal.promise]).finally(() => {
    source.off('SIGINT', onSignal);
    source.off('SIGTERM', onSignal);
  });
}

async function launchAttachedSession(
  dependencies: OrdinaryActionDependencies,
  support: SupportCapability | undefined,
  activeGit: AbortController,
  createApp: (
    sessionToken: string,
    attachedCompletion: AttachedCompletionOptions,
    revealDraftFile: DraftRevealPort,
  ) => Promise<SessionApp>,
): Promise<void> {
  const output = dependencies.output ?? console.error;
  const openBrowser = dependencies.openBrowser ?? createBrowserUrlOpener();
  const stdout = dependencies.stdout ?? writeStdout;
  const revealDraftFile =
    dependencies.revealDraftFile ??
    (async (canonicalPath: string) => {
      await open(canonicalPath);
    });
  const coordinator = createAttachedCompletionCoordinator();
  let app: SessionApp | undefined;
  const shutdown = createShutdownController({
    signalSource: dependencies.signalSource,
    abortActiveWork: () => {
      coordinator.cancel();
      activeGit.abort();
    },
    closeListener: async () => {
      await app?.close();
    },
    setExitStatus: dependencies.setExitStatus,
    reportError: () => {
      output('Attached review shutdown failed.');
    },
  });

  try {
    const token = randomBytes(32).toString('base64url');
    const storageScope = `agent-${randomBytes(16).toString('hex')}`;
    app = await createApp(token, {
      coordinator,
      storageScope,
      deliver: async (bytes) => await coordinator.runDelivery(
        async () => await stdout(bytes),
      ),
    }, revealDraftFile);
    await app.listen({ host: '127.0.0.1', port: 0 });
    if (shutdown.isShuttingDown) return;

    const address = app.server.address();
    if (
      address === null
      || typeof address === 'string'
      || address.address !== '127.0.0.1'
      || address.port === 0
    ) {
      throw new Error('Fastify did not bind the required IPv4 loopback address');
    }
    const authority = `127.0.0.1:${address.port}`;
    app.bindSessionSecurity({
      expectedHost: authority,
      expectedOrigin: `http://${authority}`,
    });
    const url = `http://${authority}/#token=${token}`;
    output(url);
    output(browserFallback);
    await openBrowser(url);

    const result = await waitForAttachedOutcome(coordinator, dependencies.signalSource);
    if (result === undefined || result.kind !== 'completed') {
      if (result !== undefined) output('Attached review result could not be delivered.');
      await shutdown.shutdown(1);
      return;
    }
    await coordinator.responseSettled;
    await shutdown.shutdown();
  } catch {
    output('Attached review could not be completed.');
    await shutdown.shutdown(1);
  }
}

async function launchExactPatchSession(
  grounded: GroundedExactPatch,
  dependencies: OrdinaryActionDependencies,
  support: SupportCapability | undefined,
  activeGit: AbortController,
): Promise<void> {
  await launchAttachedSession(
    dependencies,
    support,
    activeGit,
    async (sessionToken, attachedCompletion, revealDraftFile) => {
      return await (dependencies.createExactPatchSessionApp ?? createExactPatchSessionApp)(
        grounded,
        {
          webRoot: dependencies.webRoot,
          sessionToken,
          revealDraftFile,
          support,
          attachedCompletion,
          diagnostics: () => {
            (dependencies.output ?? console.error)('Exact patch review request denied.');
          },
        },
      );
    },
  );
}

export async function runOrdinaryAction(
  options: RunCliOptions,
  dependencies: OrdinaryActionDependencies = {},
): Promise<void> {
  if (dependencies.isTTY ?? process.stdin.isTTY === true) {
    await (dependencies.runCli ?? runCli)(options);
    return;
  }

  const readRequest = dependencies.readRequest ?? readAgentReviewRequest;
  const createRangeComparison =
    dependencies.createRangeComparison ?? createPinnedRangeComparison;
  const output = dependencies.output ?? console.error;
  const setExitStatus =
    dependencies.setExitStatus ??
    ((status: number) => {
      process.exitCode = status;
    });
  const activeGit = new AbortController();
  try {
    const request = await readRequest(dependencies.input ?? process.stdin);
    const support = dependencies.support ?? createConfiguredSupportCapability();
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

    if (request.mode !== 'revisions') {
      throw new Error(`Request mode "${request.mode}" dispatch is not yet implemented.`);
    }

    const comparison = await createRangeComparison({
      cwd: options.cwd,
      baseRevision: request.revisions.base,
      headRevision: request.revisions.head,
      pathspecs: request.revisions.pathspecs,
    });
    await launchAttachedSession(
      dependencies,
      support,
      activeGit,
      async (sessionToken, attachedCompletion, revealDraftFile) => {
        return (dependencies.createSessionApp ?? createSessionApp)(comparison, {
          webRoot: dependencies.webRoot,
          sessionToken,
          revealDraftFile,
          attachedCompletion,
          support,
          diagnostics: ({ correlationId, reason }) => {
            output(`Cumpa request denied [${correlationId}]: ${reason}.`);
          },
        });
      },
    );
  } catch (error) {
    if (
      error instanceof AgentRequestError
      || error instanceof ExactPatchGroundingError
      || error instanceof PatchSnapshotError
      || (isLaunchError(error) && error.recovery.kind === 'exit')
    ) {
      output(
        error instanceof ExactPatchGroundingError || error instanceof PatchSnapshotError
          ? 'Exact patch review could not be prepared.'
          : error.message,
      );
      setExitStatus(1);
      return;
    }
    throw error;
  }
}

export async function runCli(
  options: RunCliOptions,
  dependencies: RunCliDependencies = {},
): Promise<void> {
  const discoverCandidates =
    dependencies.discoverCandidates ?? discoverSourceCandidates;
  const pickSources =
    dependencies.pickSources ?? ((pickOptions) => pickSource(pickOptions));
  const createDescriptor =
    dependencies.createDescriptor ?? createComparisonLaunchDescriptor;
  const confirmComparison =
    dependencies.confirmComparison ?? confirmPinnedComparison;
  const launchComparison =
    dependencies.launchComparison ?? launchPinnedComparison;
  const output = dependencies.output ?? console.error;
  const setExitStatus =
    dependencies.setExitStatus ??
    ((status: number) => {
      process.exitCode = status;
    });

  let discovery: SourceDiscovery;
  try {
    discovery = await discoverCandidates(options);
  } catch (error) {
    if (!isLaunchError(error) || error.recovery.kind !== 'exit') {
      throw error;
    }
    reportFatalLaunchError(error, output, setExitStatus);
    return;
  }

  let candidates = discovery.initialCandidates;
  let searchBranches = discovery.searchBranches;
  let initialBase: SourceCandidate | undefined;
  let initialHead: SourceCandidate | undefined;
  let recovery: PickerRecoveryOptions | undefined;

  while (true) {
    const suggestedHead = candidates.find(
      (candidate) =>
        candidate.kind === 'worktree' &&
        candidate.isCurrentCheckout &&
        candidate.availability !== 'unavailable',
    );
    const picked = await pickSources({
      candidates,
      searchBranches,
      candidateEnrichment: discovery.candidateEnrichment,
      startCandidateEnrichment: discovery.startCandidateEnrichment,
      ...(suggestedHead === undefined
        ? {}
        : {
            suggestedHeadId: suggestedHead.id,
            preselectedBaseId: suggestedHead.id,
          }),
      ...(initialBase === undefined ? {} : { initialBase }),
      ...(initialHead === undefined ? {} : { initialHead }),
      ...(recovery === undefined ? {} : { recovery }),
    });

    if (picked.kind === 'uncommitted') {
      await launchUncommittedSession(
        {
          sourceKind: picked.sourceKind,
          ...(picked.base === undefined
            ? {}
            : { baseRef: selectionForCandidate(picked.base).revision }),
        },
        dependencies,
        options,
      );
      return;
    }

    const selected = picked;
    let comparison: PinnedComparison;
    try {
      comparison = await createDescriptor({
        cwd: options.cwd,
        base: selectionForCandidate(selected.base),
        head: selectionForCandidate(selected.head),
      });
    } catch (error) {
      if (!isLaunchError(error)) {
        throw error;
      }
      output(error.message);
      if (error.recovery.kind === 'exit') {
        setExitStatus(1);
        return;
      }

      try {
        discovery = await discoverCandidates(options);
      } catch (discoveryError) {
        if (
          !isLaunchError(discoveryError) ||
          discoveryError.recovery.kind !== 'exit'
        ) {
          throw discoveryError;
        }
        reportFatalLaunchError(discoveryError, output, setExitStatus);
        return;
      }

      const failedCandidate = selected[error.recovery.role];
      const eagerCandidate = discovery.initialCandidates.find(
        (candidate) => candidate.id === failedCandidate.id,
      );
      let recoveredCandidate = eagerCandidate;
      if (recoveredCandidate === undefined && failedCandidate.kind === 'branch') {
        const branches = await discovery.searchBranches(failedCandidate.label);
        recoveredCandidate = branches.find(
          (candidate) => candidate.id === failedCandidate.id,
        );
      }
      candidates =
        recoveredCandidate === undefined || eagerCandidate !== undefined
          ? discovery.initialCandidates
          : Object.freeze([...discovery.initialCandidates, recoveredCandidate]);
      searchBranches = discovery.searchBranches;
      initialBase =
        error.recovery.preserve === 'base' ? selected.base : undefined;
      initialHead =
        error.recovery.preserve === 'head' ? selected.head : undefined;
      recovery = {
        role: error.recovery.role,
        focusedCandidateId: recoveredCandidate?.id,
        searchTerm:
          failedCandidate.kind === 'branch' ? failedCandidate.label : '',
      };
      continue;
    }

    const action = await confirmComparison(comparison);
    if (action === 'back') {
      initialBase = selected.base;
      initialHead = undefined;
      recovery = undefined;
      continue;
    }

    await launchComparison(comparison);
    return;
  }
}

export function run(): Promise<void>;
export function run(
  options: CreatePinnedComparisonOptions,
): Promise<PinnedComparison>;
export async function run(
  options?: CreatePinnedComparisonOptions,
): Promise<void | PinnedComparison> {
  if (options !== undefined) {
    return await createComparisonLaunchDescriptor(options);
  }

  await new Command()
    .name('cumpa')
    .description('Local-first review of pinned Git comparisons')
    .version(await readPackageVersionFromManifest())
    .option('--staged', 'Review staged changes (HEAD→index) against a base')
    .option('--unstaged', 'Review unstaged changes (index→working tree)')
    .option('--worktree', 'Review all working-tree changes (HEAD→working tree), including untracked files')
    .option('--base <ref>', 'Base ref or registered worktree to compare against (default: HEAD); rejected with --unstaged')
    .argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')
    .action(async (paths: string[], cliOptions: {
      readonly staged?: boolean;
      readonly unstaged?: boolean;
      readonly worktree?: boolean;
      readonly base?: string;
    }) => {
      if (paths.length > 0) {
        try {
          validateStandaloneExclusivity(paths, cliOptions);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
          return;
        }
        await launchStandaloneSession(paths, {}, { cwd: process.cwd() });
        return;
      }

      try {
        validateUncommittedFlags(cliOptions);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }

      const uncommittedSourceKind = resolveUncommittedFlagSelection(cliOptions);
      if (uncommittedSourceKind !== undefined) {
        await launchUncommittedSession(
          { sourceKind: uncommittedSourceKind, baseRef: cliOptions.base },
          {},
          { cwd: process.cwd() },
        );
        return;
      }

      const serializedLaunchOptions = process.env.CUMPA_LAUNCH_OPTIONS;
      if (serializedLaunchOptions === undefined) {
        await runOrdinaryAction({ cwd: process.cwd() });
        return;
      }
      const launchOptions = packagedLaunchOptionsSchema.parse(
        JSON.parse(serializedLaunchOptions),
      );
      await launchPinnedSession(launchOptions);
    })
    .parseAsync(process.argv);
}
