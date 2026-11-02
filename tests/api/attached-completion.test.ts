import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { GroundedExactPatch, PinnedComparison } from '../../src/contracts/comparison.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { AttachedCompletionCoordinator } from '../../src/server/attached-completion.js';
import { createExactPatchSessionApp, createSessionApp } from '../../src/server/app.js';
import { createDraftStore } from '../../src/server/draft-store.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43132';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

function comparison(): PinnedComparison {
  return {
    repositoryRoot: '/private/repository/attached-completion',
    objectFormat: 'sha1',
    base: { label: 'main', oid: '1'.repeat(40) },
    head: { label: 'feature', oid: '2'.repeat(40) },
    mergeBaseOid: '1'.repeat(40),
    range: {
      kind: 'revisions',
      requestedBase: 'main',
      requestedHead: 'feature',
      baseOid: '1'.repeat(40),
      headOid: '2'.repeat(40),
      pathspecs: [],
      reviewKey: 'f'.repeat(64),
    },
    changedFiles: [],
    hasCommittedChanges: false,
  };
}

function path(value: string) {
  return {
    bytesBase64url: Buffer.from(value).toString('base64url'),
    display: value,
    utf8: value,
  };
}

function exactPatch(repositoryRoot: string): GroundedExactPatch {
  const before = Buffer.from('before\n');
  const after = Buffer.from('after\n');
  return {
    repositoryRoot,
    objectFormat: 'sha1',
    scope: {
      kind: 'exact-patch',
      digest: 'a'.repeat(64),
      validationTarget: { kind: 'repository' },
      submittedByteLength: 42,
    },
    changedFiles: [{
      id: `file_${'p'.repeat(43)}`,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '1'.repeat(40),
      newBlobOid: '2'.repeat(40),
      oldPath: path('old-name.ts'),
      newPath: path('new-name.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }],
    contents: new Map([[`file_${'p'.repeat(43)}`, { preimage: before, postimage: after }]]),
  };
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-attached-completion-`));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => await app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

describe('attached completion API', () => {
  test('exposes authenticated status and explicit one-shot Finish only for attached sessions', async () => {
    let deliveries = 0;
    const coordinator = new AttachedCompletionCoordinator();
    const app = createSessionApp(comparison(), {
      sessionToken: token,
      selectorDriftObserver: {
        observe: async () => ({
          base: { kind: 'unchanged', role: 'base' as const },
          head: { kind: 'unchanged', role: 'head' as const },
        }),
      },
      attachedCompletion: {
        coordinator,
        storageScope: `agent-${'a'.repeat(32)}`,
        deliver: async () => {
          deliveries += 1;
          return true;
        },
      },
    });
    apps.add(app);
    app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(session.json()).toMatchObject({ attached: { kind: 'agent-review' } });
    await expect(app.inject({ method: 'GET', url: '/api/review-completion', headers })).resolves.toMatchObject({
      statusCode: 200,
      json: expect.any(Function),
    });
    await expect(app.inject({
      method: 'POST',
      url: '/api/review-completion/finish?unexpected=true',
      headers,
      payload: { expectedRevision: 0, extra: true },
    })).resolves.toMatchObject({ statusCode: 400 });
    const first = await app.inject({ method: 'POST', url: '/api/review-completion/finish', headers, payload: { expectedRevision: 0 } });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ kind: 'completed', revision: 0 });
    await expect(coordinator.delivery).resolves.toEqual({ kind: 'completed', revision: 0 });
    await expect(coordinator.responseSettled).resolves.toBeUndefined();
    const duplicate = await app.inject({ method: 'POST', url: '/api/review-completion/finish', headers, payload: { expectedRevision: 0 } });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ kind: 'alreadyCompleted', revision: 0 });
    expect(deliveries).toBe(1);

    const ordinary = createSessionApp(comparison(), { sessionToken: token });
    apps.add(ordinary);
    ordinary.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });

    await expect(ordinary.inject({ method: 'GET', url: '/api/review-completion', headers })).resolves.toMatchObject({ statusCode: 404 });
  });

  test('rejects malformed attached scope even when a caller supplies the draft store', async () => {
    const repositoryRoot = await root();
    expect(() => createSessionApp(comparison(), {
      sessionToken: token,
      draftStore: createDraftStore({
        repositoryRoot,
        comparison: {
          baseCommitOid: '1'.repeat(40),
          headCommitOid: '2'.repeat(40),
          mergeBaseOid: '3'.repeat(40),
        },
      }),
      attachedCompletion: {
        coordinator: new AttachedCompletionCoordinator(),
        storageScope: '../controlled',
        deliver: async () => true,
      },
    })).toThrow('Attached storage scope is invalid.');
  });
  test('settles exact-patch completion only through the attached finish response', async () => {
    let deliveries = 0;
    const coordinator = new AttachedCompletionCoordinator();
    const app = await createExactPatchSessionApp(exactPatch(await root()), {
      sessionToken: token,
      snapshotParent: roots.at(-1)!,
      observePatchTarget: async () => false,
      attachedCompletion: {
        coordinator,
        storageScope: `agent-${'b'.repeat(32)}`,
        deliver: async () => {
          deliveries += 1;
          return true;
        },
      },
    });
    apps.add(app);
    app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });

    expect((await app.inject({ method: 'GET', url: '/api/session', headers })).json()).toMatchObject({
      attached: { kind: 'agent-review' },
    });
    await expect(app.inject({
      method: 'POST',
      url: '/api/review-completion/finish',
      headers,
      payload: { expectedRevision: 0 },
    })).resolves.toMatchObject({ statusCode: 201 });
    await expect(coordinator.responseSettled).resolves.toBeUndefined();
    expect(deliveries).toBe(1);
  });
});
