import { describe, expect, it, vi } from 'vitest';

import {
  createBrowserUrlOpener,
  launchPinnedComparison,
  resolveUncommittedFlagSelection,
  runCli,
  validateStandaloneExclusivity,
  validateUncommittedFlags,
  type RunCliDependencies,
} from '../../src/cli/run.js';
import {
  pickOrderedSources,
  type SourceSearchPromptConfig,
} from '../../src/cli/picker.js';
import type { PinnedComparison } from '../../src/contracts/comparison.js';
import type { SourceCandidate } from '../../src/domain/source.js';
import type { SourceDiscovery } from '../../src/git/candidates.js';

const baseOid = '1'.repeat(40);
const headOid = '2'.repeat(40);
const mergeBaseOid = '3'.repeat(40);

const baseCandidate = {
  kind: 'branch',
  id: 'branch:refs/heads/main',
  label: 'main',
  refName: 'refs/heads/main',
  commitOid: baseOid,
  shortOid: baseOid.slice(0, 12),
} as const satisfies SourceCandidate;

const headCandidate = {
  kind: 'branch',
  id: 'branch:refs/heads/feature',
  label: 'feature',
  refName: 'refs/heads/feature',
  commitOid: headOid,
  shortOid: headOid.slice(0, 12),
} as const satisfies SourceCandidate;

const worktreeCandidate = {
  kind: 'worktree',
  id: 'worktree:/repo/linked',
  label: 'linked',
  path: '/repo/linked',
  detached: false,
  commitOid: headOid,
  shortOid: headOid.slice(0, 12),
  availability: 'clean',
  isCurrentCheckout: false,
} as const satisfies SourceCandidate;

const comparison: PinnedComparison = {
  repositoryRoot: '/repo',
  objectFormat: 'sha1',
  base: { label: 'main', oid: baseOid },
  head: { label: 'feature', oid: headOid },
  mergeBaseOid,
  changedFiles: [],
  hasCommittedChanges: true,
};

function sourceDiscovery(
  initialCandidates: readonly SourceCandidate[],
  searchBranches: SourceDiscovery['searchBranches'] = async () => [],
): SourceDiscovery {
  return {
    initialCandidates,
    candidateEnrichment: Promise.resolve([]),
    startCandidateEnrichment: () => {},
    searchBranches,
  };
}

type FailureRecovery =
  | { readonly kind: 'exit' }
  | {
      readonly kind: 'return';
      readonly role: 'base' | 'head';
      readonly preserve: 'base' | 'head';
      readonly focus: 'previous-row' | 'search-input';
    };

function plannedFailure(
  kind: string,
  message: string,
  recovery: FailureRecovery,
): Error {
  return Object.assign(new Error(message), {
    name: 'LaunchError',
    kind,
    recovery,
  });
}

const fatalCases = [
  [
    'git-missing',
    'Git is required but was not found. Install Git, then run Cumpa again.',
  ],
  [
    'git-unsupported',
    'Git 2.43.0 or newer with the required machine protocols is required. Upgrade Git, then run Cumpa again.',
  ],
  [
    'not-worktree',
    'This directory is not inside a Git worktree. Run Cumpa from a Git worktree.',
  ],
  [
    'bare-repository',
    'Bare repositories are not supported. Run Cumpa from a non-bare Git worktree.',
  ],
  [
    'empty-repository',
    'This repository has no commits yet. Create the first commit, then run Cumpa again.',
  ],
] as const;

const headRecoveryCases = [
  [
    'equal-commits',
    'Base and head resolve to the same commit. Choose a different head.',
  ],
  [
    'unrelated-histories',
    'Base and head have unrelated histories; Git could not find a merge base. Choose a different head or go back to change base.',
  ],
  [
    'multiple-merge-bases',
    'Base and head have multiple merge bases, so this comparison cannot be pinned unambiguously. Choose a different head or go back to change base.',
  ],
] as const;

describe('pre-session terminal failure ownership', () => {
  it.each(fatalCases)(
    'prints exact %s fatal copy, sets failure status, and performs zero picker, bind, or open activity',
    async (kind, message) => {
      const output = vi.fn();
      const setExitStatus = vi.fn();
      const pickSources = vi.fn();
      const createDescriptor = vi.fn();
      const launchComparison = vi.fn();

      await runCli(
        { cwd: '/repo' },
        {
          discoverCandidates: async () => {
            throw plannedFailure(kind, message, { kind: 'exit' });
          },
          pickSources,
          createDescriptor,
          launchComparison,
          output,
          setExitStatus,
        },
      );

      expect(output).toHaveBeenCalledExactlyOnceWith(message);
      expect(setExitStatus).toHaveBeenCalledExactlyOnceWith(1);
      expect(pickSources).not.toHaveBeenCalled();
      expect(createDescriptor).not.toHaveBeenCalled();
      expect(launchComparison).not.toHaveBeenCalled();
    },
  );

  it.each(headRecoveryCases)(
    'prints exact %s copy, preserves base, clears head, and focuses the prior head row before a valid retry launches',
    async (kind, message) => {
      const output = vi.fn();
      const setExitStatus = vi.fn();
      const launchComparison = vi.fn();
      const pickCalls: unknown[] = [];
      const selected = {
        kind: 'committed',
        base: baseCandidate,
        head: headCandidate,
      } as const;
      const pickSources: NonNullable<RunCliDependencies['pickSources']> = async (
        options,
      ) => {
        pickCalls.push(options);
        return selected;
      };
      let attempts = 0;

      await runCli(
        { cwd: '/repo' },
        {
          discoverCandidates: async () =>
            sourceDiscovery([baseCandidate, headCandidate]),
          pickSources,
          createDescriptor: async () => {
            attempts += 1;
            if (attempts === 1) {
              throw plannedFailure(kind, message, {
                kind: 'return',
                role: 'head',
                preserve: 'base',
                focus: 'previous-row',
              });
            }
            return comparison;
          },
          confirmComparison: async () => 'launch',
          launchComparison,
          output,
          setExitStatus,
        },
      );

      expect(output).toHaveBeenCalledExactlyOnceWith(message);
      expect(setExitStatus).not.toHaveBeenCalled();
      expect(pickCalls).toHaveLength(2);
      expect(pickCalls[1]).toMatchObject({
        initialBase: baseCandidate,
        recovery: {
          role: 'head',
          focusedCandidateId: headCandidate.id,
          searchTerm: headCandidate.label,
        },
      });
      expect(pickCalls[1]).not.toHaveProperty('initialHead');
      expect(launchComparison).toHaveBeenCalledExactlyOnceWith(comparison);
    },
  );

  it('restores a stale base role while preserving the opposite valid head selection', async () => {
    const message =
      'The selected base “main” no longer resolves to a commit. Choose another base or repair the ref with Git.';
    const output = vi.fn();
    const pickCalls: unknown[] = [];
    let attempts = 0;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () =>
          sourceDiscovery([baseCandidate, headCandidate]),
        pickSources: async (options) => {
          pickCalls.push(options);
          return { kind: 'committed', base: baseCandidate, head: headCandidate };
        },
        createDescriptor: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw plannedFailure('endpoint-unavailable', message, {
              kind: 'return',
              role: 'base',
              preserve: 'head',
              focus: 'previous-row',
            });
          }
          return comparison;
        },
        confirmComparison: async () => 'launch',
        launchComparison: async () => undefined,
        output,
      },
    );

    expect(output).toHaveBeenCalledExactlyOnceWith(message);
    expect(pickCalls[1]).toMatchObject({
      initialHead: headCandidate,
      recovery: {
        role: 'base',
        focusedCandidateId: baseCandidate.id,
        searchTerm: baseCandidate.label,
      },
    });
    expect(pickCalls[1]).not.toHaveProperty('initialBase');
  });

  it('uses the exact worktree failure copy and falls back to the search input when the failed row disappeared', async () => {
    const message =
      'The selected head worktree cannot resolve a committed HEAD. Choose another head or repair the worktree with Git.';
    const output = vi.fn();
    const pickCalls: unknown[] = [];
    let attempts = 0;
    let discoveries = 0;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () => {
          discoveries += 1;
          return sourceDiscovery(
            discoveries === 1
              ? [baseCandidate, worktreeCandidate]
              : [baseCandidate, headCandidate],
          );
        },
        pickSources: async (options) => {
          pickCalls.push(options);
          if (attempts === 0) {
            return { kind: 'committed', base: baseCandidate, head: worktreeCandidate };
          }
          return { kind: 'committed', base: baseCandidate, head: headCandidate };
        },
        createDescriptor: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw plannedFailure('endpoint-unavailable', message, {
              kind: 'return',
              role: 'head',
              preserve: 'base',
              focus: 'search-input',
            });
          }
          return comparison;
        },
        confirmComparison: async () => 'launch',
        launchComparison: async () => undefined,
        output,
      },
    );

    expect(output).toHaveBeenCalledExactlyOnceWith(message);
    expect(pickCalls[1]).toMatchObject({
      initialBase: baseCandidate,
      recovery: {
        role: 'head',
        focusedCandidateId: undefined,
        searchTerm: '',
      },
    });
  });

  it('maps a missing merge-base object to head recovery and never binds or opens on the failed attempt', async () => {
    const message = `Required Git object ${mergeBaseOid.slice(0, 12)} is missing or unreadable. Repair the repository's object data with Git, then retry.`;
    const output = vi.fn();
    const launchComparison = vi.fn();
    const pickCalls: unknown[] = [];
    let attempts = 0;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () =>
          sourceDiscovery([baseCandidate, headCandidate]),
        pickSources: async (options) => {
          pickCalls.push(options);
          return { kind: 'committed', base: baseCandidate, head: headCandidate };
        },
        createDescriptor: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw plannedFailure('object-unavailable', message, {
              kind: 'return',
              role: 'head',
              preserve: 'base',
              focus: 'previous-row',
            });
          }
          return comparison;
        },
        confirmComparison: async () => 'launch',
        launchComparison,
        output,
      },
    );

    expect(output).toHaveBeenCalledExactlyOnceWith(message);
    expect(pickCalls[1]).toMatchObject({
      initialBase: baseCandidate,
      recovery: {
        role: 'head',
        focusedCandidateId: headCandidate.id,
      },
    });
    expect(launchComparison).toHaveBeenCalledTimes(1);
  });

  it('restores the actual picker at the failed role with the opposite endpoint visibly retained', async () => {
    const headConfigs: SourceSearchPromptConfig[] = [];
    const recoveredHead = await pickOrderedSources(
      {
        candidates: [baseCandidate, headCandidate],
        searchBranches: async () => [],
        initialBase: baseCandidate,
        recovery: {
          role: 'head',
          focusedCandidateId: headCandidate.id,
          searchTerm: 'feature',
        },
      },
      {
        prompt: async (config) => {
          headConfigs.push(config);
          return headCandidate.id;
        },
      },
    );

    expect(headConfigs).toHaveLength(1);
    expect(headConfigs[0]).toMatchObject({
      message: expect.stringContaining(
        `Base retained: main · ${baseCandidate.shortOid}`,
      ),
      default: headCandidate.id,
    });
    expect(recoveredHead).toEqual({
      base: baseCandidate,
      head: headCandidate,
    });

    const baseConfigs: SourceSearchPromptConfig[] = [];
    const recoveredBase = await pickOrderedSources(
      {
        candidates: [baseCandidate, headCandidate],
        searchBranches: async () => [],
        initialHead: headCandidate,
        recovery: {
          role: 'base',
          focusedCandidateId: baseCandidate.id,
          searchTerm: 'main',
        },
      },
      {
        prompt: async (config) => {
          baseConfigs.push(config);
          return baseCandidate.id;
        },
      },
    );

    expect(baseConfigs).toHaveLength(1);
    expect(baseConfigs[0]).toMatchObject({
      message: expect.stringContaining(
        `Head retained: feature · ${headCandidate.shortOid}`,
      ),
      default: baseCandidate.id,
    });
    expect(recoveredBase).toEqual({
      base: baseCandidate,
      head: headCandidate,
    });
  });

  it('freshly re-resolves a searched failed branch by exact ID while retaining its opposite endpoint', async () => {
    const freshHead = {
      ...headCandidate,
      label: 'feature refreshed',
      shortOid: '333333333333',
    } as const satisfies SourceCandidate;
    const pickCalls: Parameters<NonNullable<RunCliDependencies['pickSources']>>[0][] = [];
    let discoveries = 0;
    let attempts = 0;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () => {
          discoveries += 1;
          return sourceDiscovery([baseCandidate], async (term: string) => {
            expect(term).toBe(headCandidate.label);
            return [freshHead];
          });
        },
        pickSources: async (options) => {
          pickCalls.push(options);
          return attempts === 0
            ? { kind: 'committed', base: baseCandidate, head: headCandidate }
            : { kind: 'committed', base: baseCandidate, head: freshHead };
        },
        createDescriptor: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw plannedFailure('endpoint-unavailable', 'Head moved', {
              kind: 'return',
              role: 'head',
              preserve: 'base',
              focus: 'previous-row',
            });
          }
          return comparison;
        },
        confirmComparison: async () => 'launch',
        launchComparison: async () => undefined,
        output: vi.fn(),
      },
    );

    expect(discoveries).toBe(2);
    expect(pickCalls[1]).toMatchObject({
      candidates: [baseCandidate, freshHead],
      initialBase: baseCandidate,
      recovery: {
        role: 'head',
        focusedCandidateId: headCandidate.id,
        searchTerm: headCandidate.label,
      },
    });
    expect(pickCalls[1]?.candidates[1]).toBe(freshHead);
  });

  it('falls back to an unfocused searched branch recovery when its exact ID disappeared', async () => {
    const pickCalls: Parameters<NonNullable<RunCliDependencies['pickSources']>>[0][] = [];
    let discoveries = 0;
    let attempts = 0;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () => {
          discoveries += 1;
          return sourceDiscovery([baseCandidate]);
        },
        pickSources: async (options) => {
          pickCalls.push(options);
          return { kind: 'committed', base: baseCandidate, head: headCandidate };
        },
        createDescriptor: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw plannedFailure('endpoint-unavailable', 'Head disappeared', {
              kind: 'return',
              role: 'head',
              preserve: 'base',
              focus: 'search-input',
            });
          }
          return comparison;
        },
        confirmComparison: async () => 'launch',
        launchComparison: async () => undefined,
        output: vi.fn(),
      },
    );

    expect(discoveries).toBe(2);
    expect(pickCalls[1]).toMatchObject({
      candidates: [baseCandidate],
      initialBase: baseCandidate,
      recovery: {
        role: 'head',
        focusedCandidateId: undefined,
        searchTerm: headCandidate.label,
      },
    });
  });

  it('keeps the fragment bearer out of browser-opener failure diagnostics', async () => {
    const output = vi.fn();
    let rejectedUrl = '';
    const launched = await launchPinnedComparison(comparison, {
      output,
      openBrowser: async (url) => {
        rejectedUrl = url;
        throw new Error(`Unable to open ${url}`);
      },
    });

    expect(launched).toBeDefined();
    try {
      expect(rejectedUrl).toContain('#token=');
      expect(output).toHaveBeenNthCalledWith(1, rejectedUrl);
      const postLaunchDiagnostics = output.mock.calls
        .slice(1)
        .map(([message]) => message)
        .join('\n');
      expect(postLaunchDiagnostics).not.toContain('#token=');
      expect(postLaunchDiagnostics).not.toContain(rejectedUrl);
    } finally {
      await launched?.shutdown.shutdown();
    }
  });
});

describe('browser URL opener routing', () => {
  const url =
    'http://127.0.0.1:4242/#token=abcdefghijklmnopqrstuvwxyzABCDEFG';

  it('uses the system opener outside cmux', async () => {
    const openSystemBrowser = vi.fn(async () => undefined);
    const runCmux = vi.fn(async () => undefined);
    const openBrowser = createBrowserUrlOpener({
      environment: {},
      openSystemBrowser,
      runCmux,
    });

    await openBrowser(url);

    expect(openSystemBrowser).toHaveBeenCalledExactlyOnceWith(url);
    expect(runCmux).not.toHaveBeenCalled();
  });

  it('uses cmux with exact shell-free arguments whenever its workspace key is present', async () => {
    const openSystemBrowser = vi.fn(async () => undefined);
    const runCmux = vi.fn(async () => undefined);
    const openBrowser = createBrowserUrlOpener({
      environment: { CMUX_WORKSPACE_ID: '' },
      openSystemBrowser,
      runCmux,
    });

    await openBrowser(url);

    expect(openSystemBrowser).not.toHaveBeenCalled();
    expect(runCmux).toHaveBeenCalledExactlyOnceWith('cmux', ['open', url]);
  });
});

describe('uncommitted flag validation', () => {
  it('resolves exactly one source row per flag and undefined when none are set', () => {
    expect(resolveUncommittedFlagSelection({})).toBeUndefined();
    expect(resolveUncommittedFlagSelection({ staged: true })).toBe('staged');
    expect(resolveUncommittedFlagSelection({ unstaged: true })).toBe(
      'unstaged',
    );
    expect(resolveUncommittedFlagSelection({ worktree: true })).toBe(
      'worktree',
    );
  });

  it('accepts a single source flag with no base, and --staged/--worktree with --base', () => {
    expect(() => validateUncommittedFlags({})).not.toThrow();
    expect(() => validateUncommittedFlags({ staged: true })).not.toThrow();
    expect(() =>
      validateUncommittedFlags({ staged: true, base: 'main' }),
    ).not.toThrow();
    expect(() =>
      validateUncommittedFlags({ worktree: true, base: 'main' }),
    ).not.toThrow();
  });

  it('rejects more than one of --staged/--unstaged/--worktree', () => {
    expect(() =>
      validateUncommittedFlags({ staged: true, unstaged: true }),
    ).toThrow(
      '--staged, --unstaged, and --worktree are mutually exclusive. Choose exactly one.',
    );
    expect(() =>
      validateUncommittedFlags({
        staged: true,
        unstaged: true,
        worktree: true,
      }),
    ).toThrow(
      '--staged, --unstaged, and --worktree are mutually exclusive. Choose exactly one.',
    );
  });

  it('rejects --base combined with --unstaged with the exact UI-SPEC message', () => {
    expect(() =>
      validateUncommittedFlags({ unstaged: true, base: 'main' }),
    ).toThrow(
      '--base cannot be used with --unstaged — Unstaged always compares the index against the working tree.',
    );
  });
});

describe('standalone positional-argument exclusivity validation', () => {
  it('does not throw with no positional paths, regardless of flags', () => {
    expect(() => validateStandaloneExclusivity([], {})).not.toThrow();
  });

  it('does not throw with positional paths and no conflicting flags', () => {
    expect(() => validateStandaloneExclusivity(['a.ts'], {})).not.toThrow();
  });

  it('throws when positional paths are combined with --staged', () => {
    expect(() =>
      validateStandaloneExclusivity(['a.ts'], { staged: true }),
    ).toThrow(/positional path|--staged/i);
  });

  it('throws when positional paths are combined with --unstaged', () => {
    expect(() =>
      validateStandaloneExclusivity(['a.ts'], { unstaged: true }),
    ).toThrow(/positional path|--unstaged/i);
  });

  it('throws when positional paths are combined with --worktree', () => {
    expect(() =>
      validateStandaloneExclusivity(['a.ts'], { worktree: true }),
    ).toThrow(/positional path|--worktree/i);
  });

  it('throws when positional paths are combined with --base', () => {
    expect(() =>
      validateStandaloneExclusivity(['a.ts'], { base: 'main' }),
    ).toThrow(/positional path|--base/i);
  });

  it('throws exactly once even when multiple conflicting flags are set', () => {
    expect(() =>
      validateStandaloneExclusivity(['a.ts'], { staged: true, base: 'main' }),
    ).toThrow();
  });
});
