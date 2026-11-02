import { createGitRunner, GitRunnerError } from './runner.js';
import type { GitRunner } from './runner.js';
import { RENAME_MAP } from '../domain/product-identity.js';

const loopnoteIgnoreProbe = `${RENAME_MAP.repoStateDir}.${RENAME_MAP.slug}-ignore-probe`;
const loopnoteIgnoreArguments = [
  'check-ignore',
  '--no-index',
  '--quiet',
  '--',
  loopnoteIgnoreProbe,
] as const;

export type LoopnoteIgnoreStatus =
  | Readonly<{ kind: 'ignored' }>
  | Readonly<{ kind: 'not-ignored' }>
  | Readonly<{ kind: 'unavailable' }>;

export interface InspectLoopnoteIgnoreOptions {
  readonly repositoryRoot: string;
}

export interface IgnoreStatusDependencies {
  readonly runner?: GitRunner;
}

export async function inspectLoopnoteIgnore(
  options: InspectLoopnoteIgnoreOptions,
  dependencies: IgnoreStatusDependencies = {},
): Promise<LoopnoteIgnoreStatus> {
  const runner = dependencies.runner ?? createGitRunner();
  try {
    await runner.run(loopnoteIgnoreArguments, { cwd: options.repositoryRoot });
    return Object.freeze({ kind: 'ignored' });
  } catch (error) {
    if (error instanceof GitRunnerError && error.kind === 'exit' && error.exitCode === 1) {
      return Object.freeze({ kind: 'not-ignored' });
    }
    return Object.freeze({ kind: 'unavailable' });
  }
}
