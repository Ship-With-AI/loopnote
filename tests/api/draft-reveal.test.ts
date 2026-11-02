import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createSessionApp } from '../../src/server/app.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43129';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const roots: string[] = [];
const apps = new Set<FastifyInstance>();

async function buildApp(revealDraftFile = vi.fn(async () => undefined)) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-draft-reveal-`));
  roots.push(repositoryRoot);
  const app = createSessionApp({
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'base', oid: '1'.repeat(40) },
    head: { label: 'head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [],
    hasCommittedChanges: true,
  }, { sessionToken: token, revealDraftFile });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return { app, revealDraftFile, repositoryRoot };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('fixed active-draft reveal API', () => {
  test('runs inherited token host and origin denials before the reveal adapter', async () => {
    const { app, revealDraftFile } = await buildApp();
    for (const deniedHeaders of [
      { ...headers, authorization: `Bearer ${'z'.repeat(43)}` },
      { ...headers, host: 'localhost:43129' },
      { ...headers, origin: 'http://localhost:43129' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/draft/reveal', headers: deniedHeaders });
      expect([401, 403]).toContain(response.statusCode);
      expect(revealDraftFile).not.toHaveBeenCalled();
    }
  });

  test('accepts no body query or path authority and reveals only the active draft', async () => {
    const { app, revealDraftFile, repositoryRoot } = await buildApp();
    for (const request of [
      { url: '/api/draft/reveal?path=/tmp/evil', payload: undefined },
      { url: '/api/draft/reveal', payload: { path: '/tmp/evil' } },
      { url: '/api/draft/reveal', payload: {} },
    ]) {
      const response = await app.inject({ method: 'POST', url: request.url, headers, payload: request.payload });
      expect(response.statusCode).toBe(400);
      expect(revealDraftFile).not.toHaveBeenCalled();
    }

    const response = await app.inject({ method: 'POST', url: '/api/draft/reveal', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'revealed' });
    expect(revealDraftFile).toHaveBeenCalledTimes(1);
    expect(revealDraftFile).toHaveBeenCalledWith(expect.stringContaining(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts')));
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
  });

  test('returns a bounded failure without filesystem or platform diagnostics', async () => {
    const revealDraftFile = vi.fn(async () => {
      throw new Error('/absolute/path: platform stderr and stack detail');
    });
    const { app, repositoryRoot } = await buildApp(revealDraftFile);
    const response = await app.inject({ method: 'POST', url: '/api/draft/reveal', headers });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ kind: 'revealFailed' });
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
    expect(JSON.stringify(response.json())).not.toContain('stderr');
    expect(JSON.stringify(response.json())).not.toContain('stack');
  });
});
