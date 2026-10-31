import { randomBytes } from 'node:crypto';

import type { ChangedFile } from '../contracts/comparison.js';
import { createExactPath, decodeBase64url } from '../domain/path-bytes.js';
import type { ExactPath } from '../domain/path-bytes.js';
import { createObjectReader } from './objects.js';
import type { ObjectReader } from './objects.js';
import { createGitRunner, GitRunnerError } from './runner.js';
import type { GitRunner } from './runner.js';
import { buildUntrackedChangedFile } from './worktree-inventory.js';

/**
 * Mirrors `MAX_PATHSPEC_COUNT` (`src/contracts/request.ts:7`), duplicated as
 * a local literal because this phase is the first caller applying that bound
 * to CLI argv rather than the agent-protocol JSON contract.
 */
const MAX_RAW_STANDALONE_ARGUMENTS = 256;

/**
 * Mirrors `MAX_SNAPSHOT_FILES` (`src/server/worktree-snapshot.ts`),
 * duplicated as a local literal because `src/git/` never depends on
 * `src/server/`.
 */
const MAX_RESOLVED_STANDALONE_FILES = 10_000;

const standaloneFileIdNamespace = randomBytes(32);

export type StandaloneGitState = 'modified-uncommitted' | 'untracked' | 'unchanged';

export type StandaloneChangedFile = ChangedFile & {
  readonly standaloneGitState: StandaloneGitState;
};

export interface ResolveStandaloneArgumentsDependencies {
  readonly runner?: GitRunner;
}

export interface ClassifyStandaloneGitStateDependencies {
  readonly runner?: GitRunner;
}

export interface CreateStandaloneChangedFileInventoryDependencies {
  readonly runner?: GitRunner;
  readonly objectReader?: ObjectReader;
  readonly signal?: AbortSignal;
}

function parseNulDelimitedPaths(output: Buffer): readonly ExactPath[] {
  const paths: ExactPath[] = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    if (end === -1) {
      break;
    }
    if (end > offset) {
      paths.push(createExactPath(output.subarray(offset, end)));
    }
    offset = end + 1;
  }
  return Object.freeze(paths);
}

function parsePorcelainRecords(output: Buffer): ReadonlyMap<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0, offset);
    const segmentEnd = end === -1 ? output.length : end;
    if (segmentEnd > offset) {
      const record = output.subarray(offset, segmentEnd).toString('utf8');
      records.set(record.slice(3), record);
    }
    offset = segmentEnd + 1;
  }
  return records;
}

async function resolveOneArgument(
  repositoryRoot: string,
  argument: string,
  runner: GitRunner,
): Promise<readonly ExactPath[]> {
  let stdout: Buffer;
  try {
    ({ stdout } = await runner.run(
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', argument],
      { cwd: repositoryRoot },
    ));
  } catch (error) {
    if (error instanceof GitRunnerError && error.kind === 'exit' && error.exitCode === 128) {
      throw new Error(`Argument "${argument}" resolves outside the repository.`);
    }
    throw error;
  }

  const matches = parseNulDelimitedPaths(stdout);
  if (matches.length > 0) {
    return matches;
  }

  let ignored: boolean;
  try {
    await runner.run(['check-ignore', '--quiet', '--', argument], { cwd: repositoryRoot });
    ignored = true;
  } catch (error) {
    // Exit 0 is the only "ignored" signal `check-ignore` gives. Any other
    // outcome — exit 1 ("not ignored"), or Git's own fatal "pathspec is
    // beyond a symbolic link" rejection (exit 128) when the argument walks
    // through a symlinked directory the ls-files probe above already
    // declined to traverse — all collapse to "not ignored" here.
    if (error instanceof GitRunnerError && error.kind === 'exit') {
      ignored = false;
    } else {
      throw error;
    }
  }

  if (ignored) {
    throw new Error(
      `Argument "${argument}" matched only a path excluded via .gitignore; it was not opened.`,
    );
  }
  throw new Error(`Argument "${argument}" did not match any file.`);
}

function rejectReservedSegments(path: ExactPath): void {
  const segments = Buffer.from(decodeBase64url(path.bytesBase64url))
    .toString('latin1')
    .split('/');
  for (const segment of segments) {
    if (segment === '.git' || segment === '.cumpa') {
      throw new Error(
        `Resolved path "${path.display}" contains a reserved ".git"/".cumpa" segment and was rejected.`,
      );
    }
  }
}

export async function resolveStandaloneArguments(
  repositoryRoot: string,
  rawArguments: readonly string[],
  dependencies: ResolveStandaloneArgumentsDependencies = {},
  options: { readonly toleratesNoMatch?: boolean } = {},
): Promise<readonly ExactPath[]> {
  if (rawArguments.length > MAX_RAW_STANDALONE_ARGUMENTS) {
    throw new Error(
      `Too many arguments: ${rawArguments.length} exceeds the ${MAX_RAW_STANDALONE_ARGUMENTS}-argument limit.`,
    );
  }

  const runner = dependencies.runner ?? createGitRunner();
  const resolved = new Map<string, ExactPath>();
  for (const argument of rawArguments) {
    let matches: readonly ExactPath[];
    try {
      matches = await resolveOneArgument(repositoryRoot, argument, runner);
    } catch (error) {
      // Opt-in drift tolerance for the refresh path (CR-01): a single-file
      // standalone argument whose only match has since been deleted/moved
      // should surface as a clean "removed" delta on refresh, matching
      // every other sourceKind's diff-based enumeration, rather than
      // crashing the refresh request. The initial CLI launch in
      // `src/cli/run.ts` never passes `toleratesNoMatch`, so it keeps
      // rejecting typos/missing files at startup.
      if (
        options.toleratesNoMatch === true &&
        error instanceof Error &&
        /did not match any file/.test(error.message)
      ) {
        continue;
      }
      throw error;
    }
    for (const match of matches) {
      rejectReservedSegments(match);
      resolved.set(match.bytesBase64url, match);
    }
  }

  if (resolved.size > MAX_RESOLVED_STANDALONE_FILES) {
    throw new Error(
      `Resolved file count ${resolved.size} exceeds the ${MAX_RESOLVED_STANDALONE_FILES}-file limit.`,
    );
  }

  return Object.freeze([...resolved.values()]);
}

export async function classifyStandaloneGitState(
  repositoryRoot: string,
  resolvedPaths: readonly ExactPath[],
  dependencies: ClassifyStandaloneGitStateDependencies = {},
): Promise<ReadonlyMap<string, StandaloneGitState>> {
  const states = new Map<string, StandaloneGitState>();
  if (resolvedPaths.length === 0) {
    return states;
  }

  const runner = dependencies.runner ?? createGitRunner();
  const pathArguments = resolvedPaths.map((path) => path.utf8 ?? path.display);
  const { stdout } = await runner.run(
    ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--', ...pathArguments],
    { cwd: repositoryRoot },
  );
  const records = parsePorcelainRecords(stdout);

  for (const path of resolvedPaths) {
    const record = records.get(path.utf8 ?? path.display);
    const state: StandaloneGitState =
      record === undefined
        ? 'unchanged'
        : record.startsWith('??')
          ? 'untracked'
          : 'modified-uncommitted';
    states.set(path.bytesBase64url, state);
  }

  return states;
}

export async function createStandaloneChangedFileInventory(
  repositoryRoot: string,
  resolvedPaths: readonly ExactPath[],
  gitStates: ReadonlyMap<string, StandaloneGitState>,
  objectFormat: 'sha1' | 'sha256',
  dependencies: CreateStandaloneChangedFileInventoryDependencies = {},
): Promise<readonly StandaloneChangedFile[]> {
  const runner = dependencies.runner ?? createGitRunner();
  const objectReader =
    dependencies.objectReader ?? createObjectReader(repositoryRoot, { runner });

  const files = await Promise.all(
    resolvedPaths.map(async (path) => {
      const file = await buildUntrackedChangedFile(
        path,
        objectFormat,
        standaloneFileIdNamespace,
        objectReader,
        repositoryRoot,
        dependencies.signal,
      );
      const standaloneGitState = gitStates.get(path.bytesBase64url);
      if (standaloneGitState === undefined) {
        throw new RangeError(
          `Missing Git-state classification for resolved path "${path.display}".`,
        );
      }
      return { ...file, standaloneGitState };
    }),
  );

  return Object.freeze(files);
}
