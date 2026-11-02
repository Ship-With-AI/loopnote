import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_EXTERNAL_DIFF: '',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
};

const safeGitArguments = [
  '--no-optional-locks',
  '--no-pager',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.external=',
  '-c',
  'protocol.file.allow=never',
] as const;

export const approvedGitignoreAppend = Buffer.from(`/${RENAME_MAP.repoStateDir}\n`, 'ascii');

type TrackedEntry = Readonly<{ readonly path: string; readonly mode: number; readonly bytes: Buffer }>;
type UntrackedEntry = Readonly<{ readonly path: string; readonly bytes: Buffer }>;

export type SourceControlSnapshot = Readonly<{
  readonly head: string;
  readonly ref: string | undefined;
  readonly refs: Buffer;
  readonly remotes: Buffer;
  readonly index: Buffer;
  readonly indexSha256: string;
  readonly objectCount: Buffer;
  readonly objectInventory: Buffer;
  readonly tracked: readonly TrackedEntry[];
  readonly stagedDelta: Buffer;
  readonly unstagedDelta: Buffer;
  readonly untracked: readonly UntrackedEntry[];
}>;

function git(repositoryRoot: string, arguments_: readonly string[], allowDifference = false): Buffer {
  try {
    return execFileSync('git', [...safeGitArguments, ...arguments_], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      env: gitEnvironment,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowDifference && typeof error === 'object' && error !== null && 'status' in error && error.status === 1 && 'stdout' in error) {
      return Buffer.from(error.stdout as Uint8Array);
    }
    throw error;
  }
}

function nulPaths(bytes: Buffer): readonly string[] {
  return bytes.toString('utf8').split('\0').filter(Boolean);
}

async function entries(repositoryRoot: string, paths: readonly string[]): Promise<readonly TrackedEntry[]> {
  return Promise.all(paths.map(async (path) => {
    const fullPath = join(repositoryRoot, path);
    const information = await lstat(fullPath);
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new Error(`Snapshot only permits regular tracked source files: ${path}`);
    }
    return Object.freeze({ path, mode: information.mode & 0o777, bytes: await readFile(fullPath) });
  }));
}

async function untrackedEntries(repositoryRoot: string, paths: readonly string[]): Promise<readonly UntrackedEntry[]> {
  return Promise.all(paths.map(async (path) => Object.freeze({ path, bytes: await readFile(join(repositoryRoot, path)) })));
}

function equalBytes(left: Buffer, right: Buffer): boolean {
  return left.equals(right);
}

function withoutExports<T extends { readonly path: string }>(entries_: readonly T[]): readonly T[] {
  const stateDirSegment = RENAME_MAP.repoStateDir.replace(/\/$/, '');
  return entries_.filter((entry) => entry.path !== stateDirSegment && !entry.path.startsWith(RENAME_MAP.repoStateDir));
}

function replacePermittedGitignore(
  before: readonly UntrackedEntry[],
  after: readonly UntrackedEntry[],
): readonly UntrackedEntry[] {
  const previous = before.find((entry) => entry.path === '.gitignore');
  const next = after.find((entry) => entry.path === '.gitignore');
  if (previous === undefined || next === undefined || !next.bytes.equals(Buffer.concat([previous.bytes, approvedGitignoreAppend]))) {
    return after;
  }
  return after.map((entry) => entry.path === '.gitignore' ? previous : entry);
}

function sameEntries<T extends { readonly path: string; readonly bytes: Buffer }>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return left.length === right.length && left.every((entry, index) => entry.path === right[index]?.path && equalBytes(entry.bytes, right[index]!.bytes));
}

export async function captureSourceControlSnapshot(repositoryRoot: string): Promise<SourceControlSnapshot> {
  const indexPath = git(repositoryRoot, ['rev-parse', '--git-path', 'index']).toString('utf8').trim();
  const trackedPaths = nulPaths(git(repositoryRoot, ['ls-files', '-z']));
  const untrackedPaths = nulPaths(git(repositoryRoot, ['ls-files', '--others', '--exclude-standard', '-z']));
  const [tracked, untracked, index] = await Promise.all([
    entries(repositoryRoot, trackedPaths),
    untrackedEntries(repositoryRoot, untrackedPaths),
    readFile(join(repositoryRoot, indexPath)),
  ]);
  const refResult = git(repositoryRoot, ['symbolic-ref', '-q', 'HEAD'], true).toString('utf8').trim();
  const ref = refResult === '' ? undefined : refResult;
  return Object.freeze({
    head: git(repositoryRoot, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    ref,
    refs: git(repositoryRoot, [
      'for-each-ref',
      ['--format=%(refname)', '%(objectname)', ''].join('%00'),
    ]),
    remotes: git(repositoryRoot, ['remote', '-v']),
    index,
    indexSha256: createHash('sha256').update(index).digest('hex'),
    objectCount: git(repositoryRoot, ['count-objects', '-v']),
    objectInventory: git(repositoryRoot, [
      'cat-file',
      '--batch-all-objects',
      '--batch-check=%(objectname) %(objecttype) %(objectsize)',
    ]),
    tracked: Object.freeze(tracked),
    stagedDelta: git(repositoryRoot, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--no-color'], true),
    unstagedDelta: git(repositoryRoot, ['diff', '--no-ext-diff', '--no-textconv', '--binary', '--no-color'], true),
    untracked: Object.freeze(untracked),
  });
}

export async function assertSourceControlUnchanged(
  before: SourceControlSnapshot,
  after: SourceControlSnapshot,
): Promise<void> {
  if (before.head !== after.head || before.ref !== after.ref || !equalBytes(before.refs, after.refs)) {
    throw new Error('HEAD/ref changed');
  }
  if (!equalBytes(before.remotes, after.remotes)) throw new Error('remote changed');
  if (!equalBytes(before.index, after.index) || before.indexSha256 !== after.indexSha256) throw new Error('index changed');
  if (!equalBytes(before.objectCount, after.objectCount) || !equalBytes(before.objectInventory, after.objectInventory)) {
    throw new Error('object inventory changed');
  }

  const beforeTracked = withoutExports(before.tracked);
  const afterTracked = withoutExports(after.tracked);
  if (beforeTracked.length !== afterTracked.length) throw new Error('tracked source changed');
  for (const [index, entry] of beforeTracked.entries()) {
    const candidate = afterTracked[index];
    if (candidate === undefined || entry.path !== candidate.path || !equalBytes(entry.bytes, candidate.bytes)) throw new Error('tracked source changed');
    if (entry.mode !== candidate.mode) throw new Error('tracked mode changed');
  }
  if (!equalBytes(before.stagedDelta, after.stagedDelta)) throw new Error('staged delta changed');
  if (!equalBytes(before.unstagedDelta, after.unstagedDelta)) throw new Error('unstaged delta changed');

  const beforeUntracked = withoutExports(before.untracked);
  const afterUntracked = replacePermittedGitignore(beforeUntracked, withoutExports(after.untracked));
  if (!sameEntries(beforeUntracked, afterUntracked)) throw new Error('untracked bytes changed');
}

const forbiddenGitCommands: Readonly<Record<string, true>> = {
  add: true,
  am: true,
  apply: true,
  checkout: true,
  commit: true,
  merge: true,
  push: true,
  rebase: true,
  reset: true,
  restore: true,
  switch: true,
  'update-index': true,
  'update-ref': true,
};
const forbiddenNetworkCommands: Readonly<Record<string, true>> = {
  clone: true,
  fetch: true,
  pull: true,
  push: true,
  remote: true,
  submodule: true,
};

export function assertNoForbiddenProductCommands(commands: readonly (readonly string[])[]): void {
  for (const command of commands) {
    const [executable = '', ...arguments_] = command;
    const basename = executable.split(/[\\/]/u).at(-1) ?? executable;
    if (['sh', 'bash', 'zsh', 'fish', 'cmd', 'powershell', 'npm', 'npx', 'pnpm', 'yarn'].includes(basename)) {
      throw new Error(`forbidden product command executable: ${executable}`);
    }
    if (executable.includes('.git/hooks/') || executable.startsWith('./') || executable.startsWith('../')) {
      throw new Error(`forbidden repository executable: ${executable}`);
    }
    if (basename === 'git') {
      const subcommand = arguments_.find((argument) => !argument.startsWith('-') && !argument.includes('='));
      if (subcommand !== undefined && (subcommand in forbiddenGitCommands || subcommand in forbiddenNetworkCommands)) {
        throw new Error(`forbidden Git command: git ${subcommand}`);
      }
    }
  }
}
