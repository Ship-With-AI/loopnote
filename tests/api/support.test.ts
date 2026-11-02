import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import * as contracts from '../../src/contracts/api.js';
import type { GroundedExactPatch, PinnedComparison } from '../../src/contracts/comparison.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createExactPatchSessionApp, createSessionApp, type SessionApp } from '../../src/server/app.js';
import { createSupportCapability } from '../../src/server/capabilities.js';
import type { CapabilityRegistry } from '../../src/server/capabilities.js';
import { createHostedSupportClient } from '../../src/server/support-client.js';
import type { HostedSupportClient } from '../../src/server/support-client.js';
import type { SupportStateV1, SupportStore } from '../../src/server/support-store.js';
import { registerSessionRoutes } from '../../src/server/routes.js';

const installationId = 'a'.repeat(43);
const serviceUrl = 'https://support.example.test';

const token = 's'.repeat(43);
const host = '127.0.0.1:43128';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const apps = new Set<SessionApp>();
const roots: string[] = [];

function comparison(repositoryRoot: string): PinnedComparison {
  return {
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'main', oid: '1'.repeat(40) },
    head: { label: 'feature', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
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
  const fileId = `file_${'p'.repeat(43)}`;
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
      id: fileId,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '1'.repeat(40),
      newBlobOid: '2'.repeat(40),
      oldPath: path('old.ts'),
      newPath: path('new.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }],
    contents: new Map([[fileId, { preimage: Buffer.from('before\n'), postimage: Buffer.from('after\n') }]]),
  };
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-support-`));
  roots.push(value);
  return value;
}

function bind(app: SessionApp): void {
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all([...apps].map(async (app) => await app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
});

function supportStore(status: 'unverified' | 'verified' = 'unverified') {
  let state: SupportStateV1 = status === 'verified'
    ? { version: 1, installationId, status, verifiedAt: '2026-08-15T00:00:00.000Z' }
    : { version: 1, installationId, status };
  const markVerified = vi.fn(async (verifiedAt: string) => {
    state = { ...state, status: 'verified', verifiedAt };
    return state;
  });
  const store: SupportStore = {
    canonicalPath: '/tmp/support.json',
    state: async () => state,
    markVerified,
  };
  return { store, markVerified };
}

describe('hosted support contracts', () => {
  test('accept only a strict support or restore action', () => {
    expect(contracts.SupportActionSchema.safeParse('support').success).toBe(true);
    expect(contracts.SupportActionSchema.safeParse('restore').success).toBe(true);
    expect(contracts.SupportActionSchema.safeParse('checkout').success).toBe(false);
    expect(contracts.SupportStartRequestSchema.safeParse({ action: 'support', installationId }).success).toBe(false);
    expect(contracts.SupportStartResultSchema.safeParse({ kind: 'ready', flowUrl: 'https://support.example.test/flow' }).success).toBe(true);
    expect(contracts.SupportStartResultSchema.safeParse({ kind: 'ready', flowUrl: 'http://support.example.test/flow' }).success).toBe(false);
    expect(contracts.SupportStatusSchema.safeParse({ status: 'verified', email: 'payer@example.test' }).success).toBe(false);
  });

  test('posts the server-owned installation ID only to the configured HTTPS capability', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ flowUrl: `${serviceUrl}/functions/v1/support-flow?intent=1` })));
    const client = createHostedSupportClient({ serviceUrl, fetch: fetch as typeof globalThis.fetch });

    await expect(client.start('support', installationId)).resolves.toEqual({ flowUrl: `${serviceUrl}/functions/v1/support-flow?intent=1` });
    expect(fetch).toHaveBeenCalledWith(
      `${serviceUrl}/functions/v1/support-api/start`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'support', installationId }),
      }),
    );
  });

  test('fails closed for malformed, oversized, cross-origin, and aborted hosted responses', async () => {
    const oversized = createHostedSupportClient({
      serviceUrl,
      fetch: (async () => new Response('{}', { headers: { 'content-length': '8193' } })) as typeof globalThis.fetch,
    });
    await expect(oversized.start('support', installationId)).resolves.toBeUndefined();

    const crossOrigin = createHostedSupportClient({
      serviceUrl,
      fetch: (async () => new Response(JSON.stringify({ flowUrl: 'https://attacker.example.test/flow' }))) as typeof globalThis.fetch,
    });
    await expect(crossOrigin.start('restore', installationId)).resolves.toBeUndefined();

    let rejectRequest: ((reason?: unknown) => void) | undefined;
    const aborted = createHostedSupportClient({
      serviceUrl,
      fetch: ((_input, init) => new Promise<Response>((_resolve, reject) => {
        rejectRequest = reject;
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })) as typeof globalThis.fetch,
    });
    const pending = aborted.status(installationId);
    aborted.close();
    rejectRequest?.(new Error('aborted'));
    await expect(pending).resolves.toBeUndefined();
  });

  test('a timed-out hosted request does not poison later polling', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        calls += 1;
        if (calls > 1) {
          return init?.signal?.aborted
            ? Promise.reject(new Error('poisoned'))
            : Promise.resolve(new Response(JSON.stringify({ status: 'verified' })));
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
        });
      });
      const client = createHostedSupportClient({ serviceUrl, fetch: fetch as typeof globalThis.fetch });

      const timedOut = client.status(installationId);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(timedOut).resolves.toBeUndefined();
      await expect(client.status(installationId)).resolves.toBe('verified');
    } finally {
      vi.useRealTimers();
    }
  });

  test('starts hosted flow without treating it as support authority', async () => {
    const { store, markVerified } = supportStore();
    const client: HostedSupportClient = {
      start: vi.fn(async () => ({ flowUrl: `${serviceUrl}/functions/v1/support-flow?intent=1` })),
      status: vi.fn<HostedSupportClient['status']>(async () => 'unverified'),
      close: vi.fn(),
    };
    const capability = createSupportCapability(store, client);

    await expect(capability.start('restore')).resolves.toEqual({ kind: 'ready', flowUrl: `${serviceUrl}/functions/v1/support-flow?intent=1` });
    expect(client.start).toHaveBeenCalledWith('restore', installationId);
    expect(markVerified).not.toHaveBeenCalled();
    await expect(capability.refresh()).resolves.toEqual({ status: 'unverified' });
    expect(markVerified).not.toHaveBeenCalled();
  });

  test('only refresh can monotonically promote hosted verified status and existing verified state remains local', async () => {
    const { store, markVerified } = supportStore('verified');
    const client: HostedSupportClient = {
      start: vi.fn(async () => ({ flowUrl: `${serviceUrl}/functions/v1/support-flow?intent=1` })),
      status: vi.fn<HostedSupportClient['status']>(async () => 'unverified'),
      close: vi.fn(),
    };
    const capability = createSupportCapability(store, client);

    await expect(capability.status()).resolves.toEqual({ status: 'verified' });
    expect(client.status).not.toHaveBeenCalled();
    await expect(capability.refresh()).resolves.toEqual({ status: 'verified' });
    expect(markVerified).not.toHaveBeenCalled();
  });

  test('omits support routes from pinned and exact sessions when no HTTPS service is configured', async () => {
    vi.stubEnv(`${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL`, '');
    const repositoryRoot = await root();
    const pinned = createSessionApp(comparison(repositoryRoot), { sessionToken: token });
    const exact = await createExactPatchSessionApp(exactPatch(repositoryRoot), {
      sessionToken: token,
      snapshotParent: repositoryRoot,
      observePatchTarget: async () => false,
    });
    bind(pinned);
    bind(exact);

    for (const app of [pinned, exact]) {
      const session = await app.inject({ method: 'GET', url: '/api/session', headers });
      expect(session.statusCode).toBe(200);
      expect(session.json()).not.toHaveProperty('support');
      await expect(app.inject({ method: 'GET', url: '/api/support/status', headers })).resolves.toMatchObject({
        statusCode: 404,
      });
    }
  });

  test('advertises support for an explicit HTTPS service', async () => {
    vi.stubEnv(`${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL`, serviceUrl);
    const app = createSessionApp(comparison(await root()), { sessionToken: token });
    bind(app);

    await expect(app.inject({ method: 'GET', url: '/api/session', headers })).resolves.toMatchObject({
      statusCode: 200,
      json: expect.any(Function),
    });
    expect((await app.inject({ method: 'GET', url: '/api/session', headers })).json()).toMatchObject({
      support: { enabled: true },
    });
  });

  test('exposes only action start, status, and refresh loopback routes', async () => {
    const { store } = supportStore();
    const capability = createSupportCapability(store, {
      start: async () => undefined,
      status: async () => undefined,
      close: () => undefined,
    });
    const app = Fastify();
    registerSessionRoutes(app, { support: capability } as CapabilityRegistry);

    await expect(app.inject({
      method: 'POST',
      url: '/api/support/start',
      payload: { action: 'support' },
    })).resolves.toMatchObject({ statusCode: 200, json: expect.any(Function) });
    await expect(app.inject({ method: 'POST', url: '/api/support/checkout' })).resolves.toMatchObject({ statusCode: 404 });
    await expect(app.inject({ method: 'POST', url: '/api/support/recovery' })).resolves.toMatchObject({ statusCode: 404 });
    await expect(app.inject({
      method: 'POST',
      url: '/api/support/start',
      payload: { action: 'checkout' },
    })).resolves.toMatchObject({ statusCode: 400 });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const refresh = await fetch(`${address}/api/support/refresh`, { method: 'POST' });
    expect(refresh.status).toBe(200);
    expect(await refresh.json()).toEqual({ status: 'unverified' });
    await app.close();
  });

  test('removes legacy checkout and recovery exports', () => {
    expect(contracts).not.toHaveProperty('SupportCheckoutResultSchema');
    expect(contracts).not.toHaveProperty('SupportRecoveryRequestSchema');
    expect(contracts).not.toHaveProperty('SupportRecoveryResultSchema');
    expect(contracts).not.toHaveProperty('SupportRecoveryStatusSchema');
  });
});
