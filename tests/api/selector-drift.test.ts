import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import type { SelectorDriftObserver } from '../../src/git/selector-drift.js';
import { createSessionApp } from '../../src/server/app.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43131';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const roots: string[] = [];
const apps = new Set<FastifyInstance>();
const baseOid = '1'.repeat(40);
const headOid = '2'.repeat(40);
const changedHeadOid = '3'.repeat(40);

function comparison(repositoryRoot: string): PinnedComparison {
  return {
    repositoryRoot,
    objectFormat: 'sha1',
    base: {
      label: 'Base branch',
      oid: baseOid,
      source: { kind: 'branch', id: 'branch:refs/heads/main', refName: 'refs/heads/main' },
    },
    head: {
      label: 'Head worktree',
      oid: headOid,
      source: { kind: 'worktree', id: 'worktree:/server-only/path', path: '/server-only/path', detached: true, dirty: true },
    },
    mergeBaseOid: baseOid,
    changedFiles: [],
    hasCommittedChanges: true,
  };
}

async function buildApp(observer: SelectorDriftObserver) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-selector-drift-api-`));
  roots.push(repositoryRoot);
  const app = createSessionApp(comparison(repositoryRoot), {
    sessionToken: token,
    selectorDriftObserver: observer,
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return { app, repositoryRoot };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('fixed selector drift API', () => {
  test('returns a strict full-OID projection from only the retained server descriptor', async () => {
    const observe = vi.fn<SelectorDriftObserver['observe']>(async () => ({
      base: { kind: 'unchanged', role: 'base' },
      head: {
        kind: 'moved',
        role: 'head',
        label: 'Head worktree',
        selectorType: 'worktree',
        oldOid: headOid,
        newOid: changedHeadOid,
      },
    }));
    const { app, repositoryRoot } = await buildApp({ observe });
    const pinnedState = {
      pinned: comparison(repositoryRoot),
      comparisonKey: `${baseOid}:${headOid}`,
      draft: { revision: 3, raw: Buffer.from('draft bytes', 'utf8') },
      blobs: [Buffer.from('base'), Buffer.from('head')],
      inventory: [{ id: 'file_a' }],
      anchors: [{ line: 8, blobOid: headOid }],
    };
    const immutableSnapshot = JSON.stringify(pinnedState);

    const response = await app.inject({ method: 'GET', url: '/api/selector-drift', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      base: { kind: 'unchanged', role: 'base' },
      head: {
        kind: 'moved',
        role: 'head',
        label: 'Head worktree',
        selectorType: 'worktree',
        oldOid: headOid,
        newOid: changedHeadOid,
      },
    });
    expect(observe).toHaveBeenCalledOnce();
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
    expect(JSON.stringify(pinnedState)).toBe(immutableSnapshot);
  });

  test('denies token, Host, Origin, body, and query authority before selector observation', async () => {
    const observe = vi.fn<SelectorDriftObserver['observe']>(async () => ({
      base: { kind: 'unchanged', role: 'base' },
      head: { kind: 'unchanged', role: 'head' },
    }));
    const { app } = await buildApp({ observe });

    for (const deniedHeaders of [
      { ...headers, authorization: `Bearer ${'z'.repeat(43)}` },
      { ...headers, host: 'localhost:43131' },
      { ...headers, origin: 'http://localhost:43131' },
    ]) {
      const response = await app.inject({ method: 'GET', url: '/api/selector-drift', headers: deniedHeaders });
      expect([401, 403]).toContain(response.statusCode);
      expect(observe).not.toHaveBeenCalled();
    }

    for (const request of [
      { url: '/api/selector-drift?ref=refs/heads/evil', payload: undefined },
      { url: '/api/selector-drift', payload: { oid: changedHeadOid, path: '/server-only/path' } },
    ]) {
      const response = await app.inject({ method: 'GET', url: request.url, headers, payload: request.payload });
      expect(response.statusCode).toBe(400);
      expect(observe).not.toHaveBeenCalled();
    }
  });

  test('maps unavailable observations to a bounded DTO without a fabricated identity or Git diagnostics', async () => {
    const observe = vi.fn<SelectorDriftObserver['observe']>(async () => ({
      base: {
        kind: 'unavailable',
        role: 'base',
        label: 'Base branch',
        selectorType: 'branch',
        oldOid: baseOid,
        reason: 'source-unavailable',
      },
      head: { kind: 'unchanged', role: 'head' },
    }));
    const { app, repositoryRoot } = await buildApp({ observe });
    const response = await app.inject({ method: 'GET', url: '/api/selector-drift', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json().base).toEqual({
      kind: 'unavailable',
      role: 'base',
      label: 'Base branch',
      selectorType: 'branch',
      oldOid: baseOid,
      reason: 'source-unavailable',
    });
    expect(JSON.stringify(response.json())).not.toContain('newOid');
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
    expect(JSON.stringify(response.json())).not.toContain('stderr');
    expect(JSON.stringify(response.json())).not.toContain('stack');
  });
});
