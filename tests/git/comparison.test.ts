import { afterEach, describe, expect, it } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

import {
  createPinnedComparison,
  createPinnedRangeComparison,
} from '../../src/git/comparison.js';
import {
  createGitRunner,
  GitRunnerError,
  type GitRunner,
} from '../../src/git/runner.js';
import {
  createValidationGitFixture,
  type ValidationGitFixture,
} from '../helpers/git-fixture.js';

const fixtures: ValidationGitFixture[] = [];

async function fixture(
  kind: Parameters<typeof createValidationGitFixture>[0],
): Promise<ValidationGitFixture> {
  const created = await createValidationGitFixture(kind);
  fixtures.push(created);
  return created;
}

function ascii(
  repository: ValidationGitFixture,
  arguments_: readonly string[],
): string {
  return repository.git(arguments_).toString('ascii').trim();
}

function comparisonOptions(repository: ValidationGitFixture) {
  return {
    cwd: repository.nestedCwd,
    base: { label: 'main', revision: repository.baseRef },
    head: { label: 'feature', revision: repository.headRef },
  } as const;
}


function rangeOptions(
  repository: ValidationGitFixture,
  pathspecs: readonly string[] = [],
) {
  return {
    cwd: repository.nestedCwd,
    baseRevision: repository.baseRef,
    headRevision: repository.headRef,
    pathspecs,
  } as const;
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected comparison creation to fail');
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(async (item) => await item.cleanup()));
});

describe('comparison fixture authority', () => {
  it('fixture has two best merge bases', async () => {
    const repository = await fixture('criss-cross');

    const mergeBases = ascii(repository, [
      'merge-base',
      '--all',
      repository.baseRef,
      repository.headRef,
    ]).split('\n');

    expect(mergeBases).toHaveLength(2);
    expect(new Set(mergeBases).size).toBe(2);
    expect(mergeBases.every((oid) => /^[0-9a-f]{40,64}$/.test(oid))).toBe(
      true,
    );
  });
});

describe('comparison validation matrix', () => {
  it('positively probes Git 2.43 and every required machine protocol before pinning', async () => {
    const repository = await fixture('removed-object');
    const delegate = createGitRunner();
    const commands: readonly string[][] = [];
    const recorded: string[][] = commands as string[][];
    const runner: GitRunner = {
      async run(arguments_, options) {
        recorded.push([...arguments_]);
        return await delegate.run(arguments_, options);
      },
    };

    await createPinnedComparison(comparisonOptions(repository), { runner });

    expect(commands).toEqual(
      expect.arrayContaining([
        ['--version'],
        ['worktree', 'list', '--porcelain', '-z'],
        expect.arrayContaining(['for-each-ref']),
        expect.arrayContaining(['merge-base', '--all']),
        expect.arrayContaining(['diff', '--raw', '-z']),
        expect.arrayContaining(['diff', '--numstat', '-z']),
        ['cat-file', '--batch-command', '-Z'],
      ]),
    );
    expect(commands).toContainEqual(
      expect.arrayContaining([
        'for-each-ref',
        '--count=1',
        '--format=%(refname)%00',
        'refs/heads',
      ]),
    );
  });


  it('rejects Git below 2.43 with one actionable prerequisite failure and no parser fallback', async () => {
    const repository = await fixture('removed-object');
    const commands: string[][] = [];
    const runner: GitRunner = {
      async run(arguments_) {
        commands.push([...arguments_]);
        return {
          stdout: Buffer.from('git version 2.42.9\n'),
          stderr: Buffer.alloc(0),
        };
      },
    };

    const error = await captureFailure(
      createPinnedComparison(comparisonOptions(repository), { runner }),
    );

    expect(error).toMatchObject({
      name: 'LaunchError',
      kind: 'git-unsupported',
      message:
        `Git 2.43.0 or newer with the required machine protocols is required. Upgrade Git, then run ${RENAME_MAP.displayName} again.`,
      recovery: { kind: 'exit' },
    });
    expect(commands).toEqual([['--version']]);
  });

  it('maps a missing Git executable before any repository or protocol probe', async () => {
    const commands: string[][] = [];
    const runner: GitRunner = {
      async run(arguments_) {
        commands.push([...arguments_]);
        throw new GitRunnerError('spawn', 'Unable to start Git');
      },
    };

    const error = await captureFailure(
      createPinnedComparison(
        {
          cwd: '/repo',
          base: { label: 'main', revision: 'refs/heads/main' },
          head: { label: 'feature', revision: 'refs/heads/feature' },
        },
        { runner },
      ),
    );

    expect(error).toMatchObject({
      name: 'LaunchError',
      kind: 'git-missing',
      message:
        `Git is required but was not found. Install Git, then run ${RENAME_MAP.displayName} again.`,
      recovery: { kind: 'exit' },
    });
    expect(commands).toEqual([['--version']]);
  });
  it('preserves abort errors during repository root and bare probes', async () => {
    for (const abortAt of ['top-level', 'bare'] as const) {
      const controller = new AbortController();
      const aborted = new GitRunnerError('aborted', 'Git command was cancelled');
      const fallbackAbort = new GitRunnerError(
        'aborted',
        'Git command was cancelled',
      );

      const runner: GitRunner = {
        async run(arguments_) {
          if (arguments_[0] === '--version') {
            return {
              stdout: Buffer.from('git version 2.43.0\n'),
              stderr: Buffer.alloc(0),
            };
          }
          if (arguments_.includes('--show-toplevel')) {
            if (abortAt === 'top-level') {
              controller.abort();
              throw aborted;
            }
            throw new GitRunnerError('exit', 'Not a worktree');
          }
          controller.abort();
          throw abortAt === 'top-level' ? fallbackAbort : aborted;
        },
      };

      await expect(
        createPinnedComparison(
          {
            cwd: '/repo',
            base: { label: 'main', revision: 'refs/heads/main' },
            head: { label: 'feature', revision: 'refs/heads/feature' },
            signal: controller.signal,
          },
          { runner },
        ),
      ).rejects.toBe(aborted);
    }
  });


  it.each([
    [
      'non-repository',
      'not-worktree',
      `This directory is not inside a Git worktree. Run ${RENAME_MAP.displayName} from a Git worktree.`,
    ],
    [
      'bare',
      'bare-repository',
      `Bare repositories are not supported. Run ${RENAME_MAP.displayName} from a non-bare Git worktree.`,
    ],
    [
      'unborn',
      'empty-repository',
      `This repository has no commits yet. Create the first commit, then run ${RENAME_MAP.displayName} again.`,
    ],
  ] as const)(
    'maps the real %s fixture to its exact fatal repository state',
    async (kind, expectedKind, message) => {
      const repository = await fixture(kind);

      const error = await captureFailure(
        createPinnedComparison(comparisonOptions(repository)),
      );

      expect(error).toMatchObject({
        name: 'LaunchError',
        kind: expectedKind,
        message,
        recovery: { kind: 'exit' },
      });
    },
  );

  it('rejects equal full OIDs before merge-base and restores head while retaining base', async () => {
    const repository = await fixture('equal');
    const delegate = createGitRunner();
    const commands: string[][] = [];
    const runner: GitRunner = {
      async run(arguments_, options) {
        commands.push([...arguments_]);
        return await delegate.run(arguments_, options);
      },
    };

    const error = await captureFailure(
      createPinnedComparison(comparisonOptions(repository), { runner }),
    );

    expect(error).toMatchObject({
      name: 'LaunchError',
      kind: 'equal-commits',
      message:
        'Base and head resolve to the same commit. Choose a different head.',
      recovery: {
        kind: 'return',
        role: 'head',
        preserve: 'base',
        focus: 'previous-row',
      },
    });
    expect(
      commands.filter((command) => command[0] === 'merge-base'),
    ).toHaveLength(1);
  });

  it('pins explicit ancestor revisions once, permits equality, and never follows a moved ref', async () => {
    const repository = await fixture('removed-object');
    const delegate = createGitRunner();
    const commands: string[][] = [];
    const runner: GitRunner = {
      async run(arguments_, options) {
        commands.push([...arguments_]);
        return await delegate.run(arguments_, options);
      },
    };

    const comparison = await createPinnedRangeComparison(
      rangeOptions(repository),
      { runner },
    );

    expect(comparison.mergeBaseOid).toBe(comparison.base.oid);
    expect(comparison.range).toMatchObject({
      requestedBase: repository.baseRef,
      requestedHead: repository.headRef,
      baseOid: repository.baseOid,
      headOid: repository.headOid,
      pathspecs: [],
    });
    const range = comparison.range;
    expect(range).toBeDefined();
    if (range === undefined) {
      throw new Error('Expected pinned range provenance.');
    }
    expect(range.reviewKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      commands.filter((command) =>
        command.some((argument_) => argument_.includes(repository.baseRef)),
      ),
    ).toHaveLength(1);
    expect(
      commands.filter((command) =>
        command.some((argument_) => argument_.includes(repository.headRef)),
      ),
    ).toHaveLength(1);
    expect(
      commands.filter((command) => command[0] === 'merge-base'),
    ).toContainEqual([
      'merge-base',
      '--is-ancestor',
      repository.baseOid!,
      repository.headOid!,
    ]);

    repository.git(['update-ref', repository.headRef, repository.baseOid!]);
    expect(comparison.head.oid).toBe(repository.headOid);
    expect(comparison.changedFiles).not.toHaveLength(0);
  });

  it('accepts equal endpoint OIDs and rejects reversed or unavailable range revisions before inventory', async () => {
    const equal = await fixture('equal');
    const reversed = await fixture('removed-object');

    const equalComparison = await createPinnedRangeComparison(rangeOptions(equal));
    expect(equalComparison.changedFiles).toHaveLength(0);

    const reversedError = await captureFailure(
      createPinnedRangeComparison({
        cwd: reversed.nestedCwd,
        baseRevision: reversed.headRef,
        headRevision: reversed.baseRef,
        pathspecs: [],
      }),
    );
    expect(reversedError).toMatchObject({
      name: 'LaunchError',
      kind: 'non-ancestor-range',
      recovery: { kind: 'exit' },
    });

    const unavailableError = await captureFailure(
      createPinnedRangeComparison({
        cwd: reversed.nestedCwd,
        baseRevision: 'refs/heads/missing',
        headRevision: reversed.headRef,
        pathspecs: [],
      }),
    );
    expect(unavailableError).toMatchObject({
      name: 'LaunchError',
      kind: 'endpoint-unavailable',
      recovery: { kind: 'exit' },
    });
  });

  it('distinguishes unrelated histories from an ambiguous two-base history', async () => {
    const unrelated = await fixture('independent');
    const crissCross = await fixture('criss-cross');

    const unrelatedError = await captureFailure(
      createPinnedComparison(comparisonOptions(unrelated)),
    );
    const ambiguousError = await captureFailure(
      createPinnedComparison(comparisonOptions(crissCross)),
    );

    expect(unrelatedError).toMatchObject({
      name: 'LaunchError',
      kind: 'unrelated-histories',
      message:
        'Base and head have unrelated histories; Git could not find a merge base. Choose a different head or go back to change base.',
      recovery: { kind: 'return', role: 'head', preserve: 'base' },
    });
    expect(ambiguousError).toMatchObject({
      name: 'LaunchError',
      kind: 'multiple-merge-bases',
      message:
        'Base and head have multiple merge bases, so this comparison cannot be pinned unambiguously. Choose a different head or go back to change base.',
      recovery: { kind: 'return', role: 'head', preserve: 'base' },
    });
  });

  it('maps a stale selected ref to its failed role without substituting another identity', async () => {
    const repository = await fixture('removed-object');
    repository.git(['switch', 'main']);
    repository.git(['update-ref', '-d', repository.headRef]);
    const delegate = createGitRunner();
    const commands: string[][] = [];
    const runner: GitRunner = {
      async run(arguments_, options) {
        commands.push([...arguments_]);
        return await delegate.run(arguments_, options);
      },
    };

    const error = await captureFailure(
      createPinnedComparison(comparisonOptions(repository), { runner }),
    );

    expect(error).toMatchObject({
      name: 'LaunchError',
      kind: 'endpoint-unavailable',
      message:
        'The selected head “feature” no longer resolves to a commit. Choose another head or repair the ref with Git.',
      recovery: {
        kind: 'return',
        role: 'head',
        preserve: 'base',
        focus: 'previous-row',
      },
    });
    expect(
      commands.filter((command) =>
        command.some((argument_) => argument_.includes(repository.headRef)),
      ),
    ).toHaveLength(1);
  });

  it('fails on the pinned object when it disappears after resolution and never re-resolves or reads a worktree file', async () => {
    const repository = await fixture('removed-object');
    const headOid = repository.headOid!;
    const delegate = createGitRunner();
    const commands: string[][] = [];
    let removed = false;
    const runner: GitRunner = {
      async run(arguments_, options) {
        commands.push([...arguments_]);
        if (
          !removed &&
          arguments_[0] === 'cat-file' &&
          arguments_[2] === `${headOid}^{commit}`
        ) {
          removed = true;
          await repository.removeObject(headOid);
        }
        return await delegate.run(arguments_, options);
      },
    };

    const error = await captureFailure(
      createPinnedComparison(comparisonOptions(repository), { runner }),
    );

    expect(error).toMatchObject({
      name: 'LaunchError',
      kind: 'object-unavailable',
      message: `Required Git object ${headOid.slice(0, 12)} is missing or unreadable. Repair the repository's object data with Git, then retry.`,
      recovery: {
        kind: 'return',
        role: 'head',
        preserve: 'base',
        focus: 'previous-row',
      },
    });
    expect(removed).toBe(true);
    expect(
      commands.filter((command) =>
        command.some((argument_) => argument_.includes(repository.headRef)),
      ),
    ).toHaveLength(1);
    expect(
      commands.some(
        (command) =>
          command[0] === 'show' ||
          command.some((argument_) => argument_.includes(':feature.txt')),
      ),
    ).toBe(false);
  });
});
