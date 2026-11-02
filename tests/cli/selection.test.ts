import { EventEmitter } from 'node:events';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Separator } from '@inquirer/search';
import { confirmPinnedComparison } from '../../src/cli/confirm.js';
import {
  buildSourceSearchItems,
  escapeTerminalText,
  pickOrderedSources,
  pickSource,
} from '../../src/cli/picker.js';
import type {
  SourceSearchPrompt,
  SourceSearchPromptConfig,
} from '../../src/cli/picker.js';
import {
  runCli,
  runOrdinaryAction,
  type RunCliDependencies,
} from '../../src/cli/run.js';
import type {
  GroundedExactPatch,
  PinnedComparison,
} from '../../src/contracts/comparison.js';
import type { SessionApp } from '../../src/server/app.js';
import { createDirtyGitFixture } from '../helpers/git-fixture.js';
import { ExactPatchGroundingError } from '../../src/git/exact-patch.js';
import { PatchSnapshotError } from '../../src/server/patch-snapshot.js';
import type {
  BranchCandidate,
  SourceCandidate,
} from '../../src/domain/source.js';

type PromptChoice = {
  readonly value: string;
  readonly name: string;
  readonly disabled?: string;
};

function isPromptChoice(
  item: Separator | PromptChoice,
): item is PromptChoice {
  return !(item instanceof Separator);
}

const baseOid = '1'.repeat(40);
const headOid = '2'.repeat(40);
const mergeBaseOid = '3'.repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

const candidates = [
  {
    kind: 'branch',
    id: 'branch:refs/heads/main',
    label: 'main',
    refName: 'refs/heads/main',
    commitOid: baseOid,
    shortOid: '111111111111',
  },
  {
    kind: 'branch',
    id: 'branch:refs/heads/feature',
    label: 'feature',
    refName: 'refs/heads/feature',
    commitOid: headOid,
    shortOid: '222222222222',
  },
  {
    kind: 'worktree',
    id: 'worktree:/repo',
    label: 'feature',
    path: '/repo',
    branchRef: 'refs/heads/feature',
    detached: false,
    commitOid: headOid,
    shortOid: '222222222222',
    availability: 'dirty',
    isCurrentCheckout: true,
  },
  {
    kind: 'worktree',
    id: 'worktree:/repo/detached',
    label: 'Detached HEAD',
    path: '/repo/detached',
    detached: true,
    commitOid: headOid,
    shortOid: '222222222222',
    availability: 'clean',
    isCurrentCheckout: false,
  },
  {
    kind: 'worktree',
    id: 'worktree:/repo/gone',
    label: 'gone',
    path: '/repo/gone',
    branchRef: 'refs/heads/gone',
    detached: false,
    commitOid: baseOid,
    shortOid: '111111111111',
    availability: 'unavailable',
    unavailableReason:
      'Unavailable — this registered worktree cannot be resolved. Choose another entry or repair it with Git.',
    isCurrentCheckout: false,
  },
] as const;

const comparison: PinnedComparison = {
  repositoryRoot: '/repo',
  objectFormat: 'sha1',
  base: {
    label: 'main',
    oid: baseOid,
    source: {
      kind: 'branch',
      id: 'branch:refs/heads/main',
      refName: 'refs/heads/main',
    },
  },
  head: {
    label: 'feature',
    oid: headOid,
    source: {
      kind: 'worktree',
      id: 'worktree:/repo',
      path: '/repo',
      detached: false,
      dirty: true,
    },
  },
  mergeBaseOid,
  changedFiles: [],
  hasCommittedChanges: true,
};

describe('ordered searchable source picker', () => {
  it('escapes C1 terminal controls', () => {
    expect(escapeTerminalText('\u009B')).toBe('\\x9B');
  });

  it('groups branch and worktree rows while searching every identifying field', () => {
    const unfiltered = buildSourceSearchItems(candidates, '', {
      role: 'head',
      suggestedHeadId: 'worktree:/repo',
    });

    expect(unfiltered[0]).toMatchObject({
      kind: 'separator',
      label: 'Local branches',
    });
    expect(unfiltered.findIndex((item) =>
      item.kind === 'separator' && item.label === 'Worktrees',
    )).toBeGreaterThan(0);
    expect(unfiltered.filter((item) => item.kind === 'candidate')).toHaveLength(
      candidates.length,
    );
    expect(unfiltered.find((item) =>
      item.kind === 'candidate' && item.value === 'worktree:/repo',
    )).toMatchObject({
      disabled: undefined,
      name: expect.stringContaining('Dirty — committed HEAD only'),
    });
    expect(unfiltered.find((item) =>
      item.kind === 'candidate' && item.value === 'worktree:/repo',
    )).toMatchObject({
      name: expect.stringContaining('Suggested: current checkout'),
    });
    expect(unfiltered.find((item) =>
      item.kind === 'candidate' && item.value === 'worktree:/repo/gone',
    )).toMatchObject({
      disabled:
        'Unavailable — this registered worktree cannot be resolved. Choose another entry or repair it with Git.',
    });

    const queries = [
      ['branch', 'branch:refs/heads/main'],
      ['feature', 'branch:refs/heads/feature'],
      ['222222222222', 'worktree:/repo'],
      ['/repo/detached', 'worktree:/repo/detached'],
      ['detached', 'worktree:/repo/detached'],
      ['dirty', 'worktree:/repo'],
      ['clean', 'worktree:/repo/detached'],
      ['unavailable', 'worktree:/repo/gone'],
    ] as const;

    for (const [query, expectedId] of queries) {
      expect(
        buildSourceSearchItems(candidates, query, { role: 'head' }).some(
          (item) => item.kind === 'candidate' && item.value === expectedId,
        ),
      ).toBe(true);
    }
  });

  it('keeps both group separators, focused query recovery copy, and no selectable placeholder when nothing matches', () => {
    const noMatches = buildSourceSearchItems(candidates, 'does-not-exist', {
      role: 'base',
    });

    expect(noMatches).toEqual([
      { kind: 'separator', label: 'Local branches' },
      { kind: 'separator', label: 'Worktrees' },
      {
        kind: 'separator',
        label: 'No branches or worktrees match this search.',
      },
    ]);
    expect(noMatches.some((item) => item.kind === 'candidate')).toBe(false);

    const afterEscape = buildSourceSearchItems(candidates, '', { role: 'base' });
    expect(afterEscape.filter((item) => item.kind === 'candidate')).toHaveLength(
      candidates.length,
    );
    expect(afterEscape.some((item) =>
      item.kind === 'candidate' && item.name.includes('Suggested:'),
    )).toBe(false);
  });

  it('requires base first, suggests only the current checkout for head, and supports returning from head to base', async () => {
    const seen: SourceSearchPromptConfig[] = [];
    const answers = [
      'branch:refs/heads/main',
      'back',
      'branch:refs/heads/feature',
      'worktree:/repo',
    ];
    const prompt: SourceSearchPrompt = async (config) => {
      seen.push(config);
      const answer = answers.shift();
      if (answer === 'back') {
        return config.backValue;
      }
      if (answer === undefined) {
        throw new Error('Test prompt exhausted its answers');
      }
      return answer;
    };

    const selected = await pickOrderedSources(
      {
        candidates,
        searchBranches: async () => [],
        suggestedHeadId: 'worktree:/repo',
      },
      { prompt },
    );

    expect(seen.map((config) => config.message)).toEqual([
      'Choose base — changes will be compared from its merge base with head',
      'Choose head — this committed state will be reviewed',
      'Choose base — changes will be compared from its merge base with head',
      'Choose head — this committed state will be reviewed',
    ]);
    expect(seen[0]?.default).toBeUndefined();
    expect(seen[1]?.default).toBe('worktree:/repo');
    expect(seen[2]?.default).toBeUndefined();
    expect(seen[3]?.default).toBe('worktree:/repo');
    expect(selected.base.id).toBe('branch:refs/heads/feature');
    expect(selected.head.id).toBe('worktree:/repo');
  });
});

describe('pickSource / Uncommitted sources', () => {
  function makePrompt(answers: readonly string[]) {
    const seen: SourceSearchPromptConfig[] = [];
    const queue = [...answers];
    const prompt: SourceSearchPrompt = async (config) => {
      seen.push(config);
      const answer = queue.shift();
      if (answer === undefined) {
        throw new Error('Test prompt exhausted its answers');
      }
      return answer;
    };
    return { prompt, seen };
  }

  it('shows the Uncommitted group ahead of Local branches on the Base prompt', async () => {
    const { prompt, seen } = makePrompt([`${RENAME_MAP.slug}:uncommitted:unstaged`]);

    await pickSource({ candidates, searchBranches: async () => [] }, { prompt });

    expect(seen).toHaveLength(1);
    const items = await seen[0]!.source(undefined, {
      signal: new AbortController().signal,
    });
    const labels = items.map((item) =>
      item instanceof Separator ? item.separator : item.value,
    );
    expect(labels.slice(0, 5)).toEqual([
      'Uncommitted',
      `${RENAME_MAP.slug}:uncommitted:staged`,
      `${RENAME_MAP.slug}:uncommitted:unstaged`,
      `${RENAME_MAP.slug}:uncommitted:worktree`,
      'Local branches',
    ]);
    const rows = items.filter(isPromptChoice);
    expect(
      rows.find((item) => item.value === `${RENAME_MAP.slug}:uncommitted:staged`),
    ).toMatchObject({ name: 'Staged' });
    expect(
      rows.find((item) => item.value === `${RENAME_MAP.slug}:uncommitted:unstaged`),
    ).toMatchObject({ name: 'Unstaged' });
    expect(
      rows.find((item) => item.value === `${RENAME_MAP.slug}:uncommitted:worktree`),
    ).toMatchObject({ name: 'Working tree' });
  });

  it('returns Unstaged immediately with no second prompt', async () => {
    const { prompt, seen } = makePrompt([`${RENAME_MAP.slug}:uncommitted:unstaged`]);

    const selected = await pickSource(
      { candidates, searchBranches: async () => [] },
      { prompt },
    );

    expect(seen).toHaveLength(1);
    expect(selected).toEqual({ kind: 'uncommitted', sourceKind: 'unstaged' });
  });

  it('advances Staged to a HEAD-preselected Base prompt and resolves the chosen base', async () => {
    const { prompt, seen } = makePrompt([
      `${RENAME_MAP.slug}:uncommitted:staged`,
      'branch:refs/heads/main',
    ]);

    const selected = await pickSource(
      {
        candidates,
        searchBranches: async () => [],
        preselectedBaseId: 'branch:refs/heads/feature',
      },
      { prompt },
    );

    expect(seen).toHaveLength(2);
    expect(seen[1]?.message).toBe(
      'Choose base — changes will be compared from its merge base with HEAD',
    );
    expect(seen[1]?.default).toBe('branch:refs/heads/feature');
    expect(selected).toEqual({
      kind: 'uncommitted',
      sourceKind: 'staged',
      base: candidates[0],
    });
  });

  it('falls through to the unchanged committed Base→Head flow for a normal branch selection', async () => {
    const { prompt, seen } = makePrompt([
      'branch:refs/heads/main',
      'branch:refs/heads/feature',
    ]);

    const selected = await pickSource(
      { candidates, searchBranches: async () => [] },
      { prompt },
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]?.message).toBe(
      'Choose base — changes will be compared from its merge base with head',
    );
    expect(seen[1]?.message).toBe(
      'Choose head — this committed state will be reviewed',
    );
    expect(selected).toEqual({
      kind: 'committed',
      base: candidates[0],
      head: candidates[1],
    });
  });
});

describe('staged source discovery', () => {
  const eagerCandidates = [candidates[1], candidates[2], candidates[3]] as const;
  const alphaCandidate = {
    kind: 'branch',
    id: 'branch:refs/heads/alpha',
    label: 'alpha',
    refName: 'refs/heads/alpha',
    commitOid: baseOid,
    shortOid: '111111111111',
  } as const satisfies SourceCandidate;
  const zuluCandidate = {
    kind: 'branch',
    id: 'branch:refs/heads/zulu',
    label: 'zulu',
    refName: 'refs/heads/zulu',
    commitOid: headOid,
    shortOid: '222222222222',
  } as const satisfies SourceCandidate;

  it('renders identities before installing exact asynchronous worktree state', async () => {
    let searchStarted = false;
    const sourceCalls: SourceSearchPromptConfig[] = [];
    const answers = ['branch:refs/heads/feature', 'worktree:/repo'];
    const candidateEnrichment =
      Promise.withResolvers<readonly SourceCandidate[]>();
    const identityCandidates = [
      eagerCandidates[0],
      { ...eagerCandidates[1], availability: 'pending' as const },
      eagerCandidates[2],
    ];

    const selected = await pickOrderedSources(
      {
        candidates: identityCandidates,
        candidateEnrichment: candidateEnrichment.promise,
        searchBranches: async () => {
          searchStarted = true;
          return [alphaCandidate];
        },
      },
      {
        prompt: async (config) => {
          sourceCalls.push(config);
          const items = await config.source(undefined, {
            signal: new AbortController().signal,
          });
          expect(
            items
              .filter(isPromptChoice)
              .filter(
                (item) =>
                  item.value.startsWith('branch:') ||
                  item.value.startsWith('worktree:'),
              )
              .map((item) => item.value),
          ).toEqual([
            'branch:refs/heads/feature',
            'worktree:/repo',
            'worktree:/repo/detached',
          ]);
          expect(searchStarted).toBe(false);
          if (sourceCalls.length === 1) {
            expect(
              items.find(
                (item): item is PromptChoice =>
                  isPromptChoice(item) && item.value === 'worktree:/repo',
              )?.name,
            ).toContain('Checking worktree state…');
          } else {
            setTimeout(() => candidateEnrichment.resolve(eagerCandidates), 10);
          }
          return answers.shift();
        },
      },
    );

    expect(selected).toEqual({
      base: candidates[1],
      head: candidates[2],
    });
    const refreshedItems = await sourceCalls[1]!.source(undefined, {
      signal: new AbortController().signal,
    });
    expect(
      refreshedItems.find(
        (item): item is PromptChoice =>
          isPromptChoice(item) && item.value === 'worktree:/repo',
      )?.name,
    ).toContain('Dirty — committed HEAD only');
    expect(sourceCalls).toHaveLength(2);
    expect(searchStarted).toBe(false);
  });

  it('installs completed lazy branches by exact ID for either ordered role', async () => {
    const answers = ['branch:refs/heads/alpha', 'branch:refs/heads/zulu'];
    const receivedSignals: AbortSignal[] = [];

    const selected = await pickOrderedSources(
      {
        candidates: eagerCandidates,
        searchBranches: async (_term: string, signal?: AbortSignal) => {
          if (signal !== undefined) {
            receivedSignals.push(signal);
          }
          return [alphaCandidate, zuluCandidate];
        },
      },
      {
        prompt: async (config) => {
          const controller = new AbortController();
          const items = await config.source('a branch', {
            signal: controller.signal,
          });
          expect(items.some((item) => !(item instanceof Separator) && item.value === alphaCandidate.id)).toBe(true);
          expect(items.some((item) => !(item instanceof Separator) && item.value === zuluCandidate.id)).toBe(true);
          expect(receivedSignals).toContain(controller.signal);
          return answers.shift();
        },
      },
    );

    expect(selected).toEqual({ base: alphaCandidate, head: zuluCandidate });
  });

  it('renders only fresh branch rows in returned order before porcelain worktrees', async () => {
    let source: SourceSearchPromptConfig['source'] | undefined;
    let promptCalls = 0;
    await expect(
      pickOrderedSources(
        {
          candidates: eagerCandidates,
          searchBranches: async () => [zuluCandidate, alphaCandidate, zuluCandidate],
        },
        {
          prompt: async (config) => {
            source = config.source;
            await config.source('branch', {
              signal: new AbortController().signal,
            });
            promptCalls += 1;
            return promptCalls === 1 ? alphaCandidate.id : 'missing';
          },
        },
      ),
    ).rejects.toThrow('Head selection did not identify an available source');

    const items = await source?.('branch', {
      signal: new AbortController().signal,
    });
    expect(
      items
        ?.filter(isPromptChoice)
        .filter(
          (item) =>
            item.value.startsWith('branch:') ||
            item.value.startsWith('worktree:'),
        )
        .map((item) => item.value),
    ).toEqual([
      zuluCandidate.id,
      alphaCandidate.id,
      candidates[2].id,
      candidates[3].id,
    ]);
    expect(items?.some((item) =>
      !(item instanceof Separator) && item.value === candidates[1].id,
    )).toBe(false);
  });

  it('rejects superseded rows while current exact IDs remain selectable for Base and Head', async () => {
    const oldLookup = Promise.withResolvers<readonly BranchCandidate[]>();
    const newLookup = Promise.withResolvers<readonly BranchCandidate[]>();
    let calls = 0;
    let promptCalls = 0;
    const answers = [zuluCandidate.id, zuluCandidate.id];

    const selected = await pickOrderedSources(
      {
        candidates: eagerCandidates,
        searchBranches: async () => {
          calls += 1;
          return calls === 1 ? oldLookup.promise : newLookup.promise;
        },
      },
      {
        prompt: async (config) => {
          promptCalls += 1;
          if (promptCalls === 1) {
            const obsolete = new AbortController();
            const current = new AbortController();
            const stale = config.source('old', { signal: obsolete.signal });
            obsolete.abort();
            const fresh = config.source('new', { signal: current.signal });
            newLookup.resolve([zuluCandidate]);
            const items = await fresh;
            expect(
              items
                .filter(isPromptChoice)
                .filter(
                  (item) =>
                    item.value.startsWith('branch:') ||
                    item.value.startsWith('worktree:'),
                )
                .map((item) => item.value),
            ).toEqual([zuluCandidate.id, candidates[2].id, candidates[3].id]);
            oldLookup.resolve([alphaCandidate]);
            await expect(stale).rejects.toThrow();
          }
          return answers.shift();
        },
      },
    );

    expect(selected).toEqual({ base: zuluCandidate, head: zuluCandidate });
  });

  it('passes only eager candidates into runCli before deferred discovery starts', async () => {
    const events: string[] = [];
    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () => ({
          initialCandidates: eagerCandidates,
          candidateEnrichment: Promise.resolve(eagerCandidates),
          startCandidateEnrichment: () => {
            events.push('enrich');
          },
          searchBranches: async () => {
            events.push('search');
            return [alphaCandidate];
          },
        }),
        pickSources: async (options) => {
          events.push('pick');
          expect(options.candidates).toEqual(eagerCandidates);
          return { kind: 'committed', base: eagerCandidates[0], head: eagerCandidates[1] };
        },
        createDescriptor: async () => comparison,
        confirmComparison: async () => 'launch',
        launchComparison: async () => {
          events.push('launch');
        },
      } satisfies RunCliDependencies,
    );

    expect(events).toEqual(['pick', 'launch']);
  });
});

describe('pinned comparison confirmation and CLI integration', () => {
  it('renders ordered full identities, selected worktree paths, dirty warning, pin statement, and launch/back labels', async () => {
    const output: string[] = [];
    let promptConfig:
      | {
          readonly message: string;
          readonly choices: readonly {
            readonly name: string;
            readonly value: 'back' | 'launch';
          }[];
        }
      | undefined;

    const result = await confirmPinnedComparison(comparison, {
      output: (message) => output.push(message),
      prompt: async (config) => {
        promptConfig = config;
        return 'back';
      },
    });

    expect(output).toEqual([
      'Confirm pinned comparison',
      `Base: main\n${baseOid}`,
      `Head: feature\n${headOid}`,
      `Merge base:\n${mergeBaseOid}`,
      'Head worktree: /repo',
      "Dirty — committed HEAD only\nThe worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored.",
      'This session is pinned to the commits shown below and does not follow moving refs.',
    ]);
    expect(promptConfig).toEqual({
      message: 'Launch this pinned comparison?',
      choices: [
        { name: 'Launch pinned comparison', value: 'launch' },
        { name: 'Back', value: 'back' },
      ],
    });
    expect(result).toBe('back');
  });

  it('feeds ordered candidate authority into frozen comparison creation and launches only after confirmation', async () => {
    const events: string[] = [];
    let selectionOptions:
      | {
          readonly base: { readonly label: string; readonly revision: string };
          readonly head: { readonly label: string; readonly revision: string };
        }
      | undefined;

    await runCli(
      { cwd: '/repo' },
      {
        discoverCandidates: async () => {
          events.push('discover');
          return {
            initialCandidates: [...candidates],
            candidateEnrichment: Promise.resolve([...candidates]),
            startCandidateEnrichment: () => undefined,
            searchBranches: async () => [],
          };
        },
        pickSources: async () => {
          events.push('pick-base-head');
          return { kind: 'committed', base: candidates[0], head: candidates[2] };
        },
        createDescriptor: async (options) => {
          events.push('pin-comparison');
          selectionOptions = options;
          return comparison;
        },
        confirmComparison: async () => {
          events.push('confirm');
          return 'launch';
        },
        launchComparison: async (pinned) => {
          expect(pinned).toBe(comparison);
          events.push('launch');
        },
      },
    );

    expect(events).toEqual([
      'discover',
      'pick-base-head',
      'pin-comparison',
      'confirm',
      'launch',
    ]);
    expect(selectionOptions).toMatchObject({
      base: {
        label: 'main',
        revision: 'refs/heads/main',
      },
      head: {
        label: 'feature',
        revision: headOid,
      },
    });
  });
});

describe('exact patch CLI dispatch', () => {
  const request = {
    schemaVersion: 1 as const,
    kind: `${RENAME_MAP.kindPrefix}.review-request` as const,
    mode: 'patch' as const,
    patch: {
      content: 'diff --git a/src/a.ts b/src/a.ts\n',
      target: { kind: 'repository' as const },
    },
  };

  it('grounds once, creates the exact session app with that authority, and opens only after readiness', async () => {
    const events: string[] = [];
    const grounded = {} as GroundedExactPatch;
    const signalSource = new EventEmitter();
    const app = {
      listen: async () => {
        events.push('listen');
      },
      server: {
        address: () => ({ address: '127.0.0.1', port: 43130 }),
      },
      bindSessionSecurity: () => {
        events.push('security');
      },
      close: async () => undefined,
    } as unknown as SessionApp;

    vi.stubEnv('CUMPA_SUPPORT_SERVICE_URL', '');

    const running = runOrdinaryAction(
      { cwd: '/repo' },
      {
        isTTY: false,
        readRequest: async () => request,
        createRangeComparison: async () => {
          throw new Error('range resolution must not run for a patch request');
        },
        createGroundedExactPatch: async (options) => {
          expect(options).toEqual({
            cwd: '/repo',
            patchContent: request.patch.content,
            target: request.patch.target,
            signal: expect.any(AbortSignal),
          });
          events.push('ground');
          return grounded;
        },
        createExactPatchSessionApp: async (received, options) => {
          expect(received).toBe(grounded);
          expect(options.support).toBeUndefined();
          events.push('app');
          return app;
        },
        openBrowser: async () => {
          events.push('browser');
        },
        signalSource,
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    signalSource.emit('SIGINT');
    await running;

    expect(events).toEqual(['ground', 'app', 'listen', 'security', 'browser']);
  });

  it('reports grounding and snapshot failures without launching or leaking patch bytes', async () => {
    for (const failure of [
      new ExactPatchGroundingError(request.patch.content),
      new PatchSnapshotError('snapshot-unavailable', false),
    ]) {
      const output: string[] = [];
      const launch = async () => {
        throw failure;
      };

      await runOrdinaryAction(
        { cwd: '/repo' },
        {
          isTTY: false,
          readRequest: async () => request,
          createGroundedExactPatch: launch,
          createExactPatchSessionApp: launch,
          openBrowser: async () => {
            throw new Error('browser must not open after a failed exact patch setup');
          },
          output: (message) => output.push(message),
          setExitStatus: () => undefined,
        },
      );

      expect(output).toEqual(['Exact patch review could not be prepared.']);
    }
  });
});

describe('uncommitted CLI launch wiring', () => {
  it('launches createUncommittedSessionApp with the picker-resolved uncommitted scope', async () => {
    const fixture = await createDirtyGitFixture('branch-to-branch', 20);
    try {
      const events: string[] = [];
      const app = {
        listen: async () => {
          events.push('listen');
        },
        server: {
          address: () => ({ address: '127.0.0.1', port: 43141 }),
        },
        bindSessionSecurity: () => {
          events.push('security');
        },
        close: async () => undefined,
      } as unknown as SessionApp;

      let receivedScope:
        | Readonly<{
            readonly sourceKind: string;
            readonly baseCommitOid?: string;
            readonly mergeBaseOid?: string;
          }>
        | undefined;

      await runCli(
        { cwd: fixture.root },
        {
          discoverCandidates: async () => ({
            initialCandidates: [],
            candidateEnrichment: Promise.resolve([]),
            startCandidateEnrichment: () => undefined,
            searchBranches: async () => [],
          }),
          pickSources: async () => ({
            kind: 'uncommitted',
            sourceKind: 'staged',
            base: {
              kind: 'branch',
              id: 'branch:refs/heads/main',
              label: 'main',
              refName: fixture.baseRef,
              commitOid: '0'.repeat(40),
              shortOid: '0'.repeat(12),
            },
          }),
          createUncommittedSessionApp: async (scope) => {
            receivedScope = scope;
            events.push('app');
            return app;
          },
          findUncommittedDraftCandidate: async () => undefined,
          openBrowser: async () => {
            events.push('browser');
          },
        } satisfies RunCliDependencies,
      );

      expect(events).toEqual(['app', 'listen', 'security', 'browser']);
      expect(receivedScope?.sourceKind).toBe('staged');
      expect(receivedScope?.baseCommitOid).toMatch(/^[0-9a-f]{40}$/u);
      expect(receivedScope?.mergeBaseOid).toMatch(/^[0-9a-f]{40}$/u);
    } finally {
      await fixture.cleanup();
    }
  });
});
