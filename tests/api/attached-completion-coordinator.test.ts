import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { AttachedCompletionCoordinator } from '../../src/server/attached-completion.js';
import { createDraftStore } from '../../src/server/draft-store.js';

const roots: string[] = [];
const comparison = {
  baseCommitOid: '1'.repeat(40),
  headCommitOid: '2'.repeat(40),
  mergeBaseOid: '3'.repeat(40),
};

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-attached-completion-`));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

describe('AttachedCompletionCoordinator', () => {
  test('shares concurrent finishing work, freezes completion, and never redelivers', async () => {
    const coordinator = new AttachedCompletionCoordinator();
    let deliveries = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const operation = async () => {
      await gate;
      deliveries += 1;
      return { kind: 'completed' as const, revision: 0 };
    };

    const first = coordinator.finish(0, operation);
    const second = coordinator.finish(0, operation);
    expect(coordinator.status()).toEqual({ kind: 'finishing', expectedRevision: 0 });
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: 'completed', revision: 0 },
      { kind: 'completed', revision: 0 },
    ]);
    expect(deliveries).toBe(1);
    await expect(coordinator.finish(0, operation)).resolves.toEqual({ kind: 'alreadyCompleted', revision: 0 });
    expect(deliveries).toBe(1);
  });

  test('returns definitive zero-delivery failures to waiting but keeps delivery failures terminal', async () => {
    const retryable = new AttachedCompletionCoordinator();
    await expect(retryable.finish(0, async () => ({ kind: 'revisionConflict', expectedRevision: 0, actualRevision: 1 }))).resolves.toEqual({
      kind: 'revisionConflict', expectedRevision: 0, actualRevision: 1,
    });
    expect(retryable.status()).toEqual({ kind: 'waiting' });

    const terminal = new AttachedCompletionCoordinator();
    await expect(terminal.finish(0, async () => ({ kind: 'deliveryFailed' }))).resolves.toEqual({ kind: 'deliveryFailed' });
    expect(terminal.status()).toEqual({ kind: 'finishing', expectedRevision: 0 });
    await expect(terminal.finish(0, async () => ({ kind: 'completed', revision: 0 }))).resolves.toEqual({ kind: 'deliveryFailed' });
  });

  test('keeps concurrent peer coordinators and terminal failure invocation-local', async () => {
    const first = new AttachedCompletionCoordinator();
    const second = new AttachedCompletionCoordinator();
    let firstDeliveries = 0;
    let secondDeliveries = 0;

    await expect(first.finish(0, async () => {
      firstDeliveries += 1;
      return { kind: 'deliveryFailed' as const };
    })).resolves.toEqual({ kind: 'deliveryFailed' });
    expect(first.status()).toEqual({ kind: 'finishing', expectedRevision: 0 });
    expect(second.status()).toEqual({ kind: 'waiting' });

    await expect(Promise.all([
      second.finish(0, async () => {
        secondDeliveries += 1;
        return { kind: 'completed' as const, revision: 0 };
      }),
      second.finish(0, async () => {
        secondDeliveries += 1;
        return { kind: 'completed' as const, revision: 0 };
      }),
    ])).resolves.toEqual([
      { kind: 'completed', revision: 0 },
      { kind: 'completed', revision: 0 },
    ]);
    expect(firstDeliveries).toBe(1);
    expect(secondDeliveries).toBe(1);
  });
});

describe('DraftStore.settle', () => {
  test('keeps a missing revision-zero draft in memory through finalize without persistence', async () => {
    const store = createDraftStore({ repositoryRoot: await root(), comparison });
    const settled = await store.settle(0, {
      prepare: async (draft) => ({ revision: draft.revision, summary: draft.summary }),
      finalize: async ({ draft, prepared }) => ({ revision: draft.revision, prepared }),
    });

    expect(settled).toEqual({ kind: 'accepted', value: { revision: 0, prepared: { revision: 0, summary: '' } } });
    await expect(store.loadState()).resolves.toMatchObject({ kind: 'missing' });
  });

  test('holds mutations behind prepare, final checks, and delivery', async () => {
    const store = createDraftStore({ repositoryRoot: await root(), comparison });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const settled = store.settle(0, {
      prepare: async (draft) => draft.revision,
      finalize: async ({ draft, prepared }) => {
        await gate;
        return { draft, prepared };
      },
    });
    const mutation = store.mutate({ expectedRevision: 0, mutation: { type: 'setSummary', markdown: 'later' } });

    await Promise.resolve();
    await expect(store.loadState()).resolves.toMatchObject({ kind: 'missing' });
    release();
    await expect(settled).resolves.toMatchObject({ kind: 'accepted', value: { prepared: 0 } });
    await expect(mutation).resolves.toMatchObject({ kind: 'accepted', draft: { revision: 1, summary: 'later' } });
  });
});
