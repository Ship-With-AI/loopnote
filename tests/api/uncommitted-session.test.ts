import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { UncommittedScope } from '../../src/contracts/comparison.js';
import { createUncommittedSessionApp, type CreateUncommittedSessionAppOptions } from '../../src/server/app.js';
import { createUncommittedCapabilityRegistry } from '../../src/server/capabilities.js';
import { materializeWorktreeSnapshot } from '../../src/server/worktree-snapshot.js';
import { buildDurableAnchor } from '../../src/domain/anchor.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const token = 'p'.repeat(43);
const host = '127.0.0.1:43132';
const headers = {
  host,
  origin: `http://${host}`,
  authorization: `Bearer ${token}`,
};

const apps = new Set<FastifyInstance>();
const roots: string[] = [];
const fixtures: GitFixture[] = [];

async function makeFixture(options?: Parameters<typeof createGitFixture>[0]): Promise<GitFixture> {
  const fixture = await createGitFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cumpa-uncommitted-session-'));
  roots.push(root);
  return root;
}

function headOid(fixture: GitFixture): string {
  return fixture.git(['rev-parse', 'HEAD']).toString('ascii').trim();
}

function scopeFor(
  fixture: GitFixture,
  sourceKind: 'staged' | 'unstaged' | 'worktree',
  options?: { readonly baseCommitOid?: string; readonly mergeBaseOid?: string },
): UncommittedScope {
  return {
    kind: 'uncommitted',
    sourceKind,
    repositoryRoot: fixture.root,
    objectFormat: 'sha1',
    baseCommitOid: options?.baseCommitOid,
    mergeBaseOid: options?.mergeBaseOid,
    changedFiles: [],
  };
}

async function buildApp(scope: UncommittedScope, options: Partial<CreateUncommittedSessionAppOptions> = {}) {
  const app = await createUncommittedSessionApp(scope, {
    sessionToken: token,
    snapshotRoot: await makeRoot(),
    ...options,
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return app;
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(fixtures.splice(0).map(async (fixture) => fixture.cleanup()));
  await Promise.all(roots.splice(0).map(async (value) => rm(value, { recursive: true, force: true })));
});

describe('uncommitted session apps', () => {
  test('serves an uncommitted GET /api/session discriminated by sourceKind/baseCommitOid/reviewKey/files', async () => {
    const fixture = await makeFixture();
    const baseOid = headOid(fixture);
    await fixture.write('tracked.txt', 'staged edit\n');
    fixture.git(['add', 'tracked.txt']);
    await fixture.write('new-file.txt', 'added staged content\n');
    fixture.git(['add', 'new-file.txt']);

    const scope = scopeFor(fixture, 'staged', { baseCommitOid: baseOid, mergeBaseOid: baseOid });
    const app = await buildApp(scope);
    const response = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect('uncommitted' in body).toBe(true);
    expect(body.uncommitted).toMatchObject({
      kind: 'uncommitted',
      sourceKind: 'staged',
      baseCommitOid: baseOid,
      changedFileCount: 2,
    });
    expect(body.uncommitted.reviewKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.keys(body)).toEqual(['uncommitted', 'files']);
    expect(body.files).toHaveLength(2);
  });

  test('verifies a newly added comment anchor against the frozen snapshot content', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    const scope = scopeFor(fixture, 'unstaged');
    const app = await buildApp(scope);

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    const file = (session.json().files as ReadonlyArray<{ readonly fileId: string; readonly newPath?: { readonly utf8?: string } }>)
      .find((candidate) => candidate.newPath?.utf8 === 'tracked.txt');
    expect(file).toBeDefined();

    const added = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId: file!.fileId, side: 'head', line: 1, body: 'Looks correct.' },
    });
    expect(added.statusCode).toBe(201);

    const draft = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(draft.json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'verified', reason: 'exact-match' } }] },
    });
  });

  test('classifies a stale anchor via unmodified verifyDurableAnchor when recorded content no longer matches the frozen snapshot', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    const scope = scopeFor(fixture, 'unstaged');
    const root = await makeRoot();
    const snapshot = await materializeWorktreeSnapshot(scope, { root });
    const registry = await createUncommittedCapabilityRegistry(scope, snapshot, {});

    const files = await snapshot.files();
    const file = files.find((candidate) => candidate.newPath?.utf8 === 'tracked.txt');
    expect(file).toBeDefined();
    const content = await registry.readContent(file!.id);
    const headSide = content?.head;
    expect(headSide?.exists).toBe(true);
    if (headSide === undefined || !headSide.exists) throw new Error('Expected head-side content to exist.');

    const recorded = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'head',
      blobOid: headSide.blobOid,
      line: 1,
      text: 'a completely different recorded line\n',
    });

    expect(await registry.verifyAnchor(recorded)).toEqual({ state: 'stale', reason: 'anchor-mismatch' });
  });

  test('omits exportReview and revealExportDirectory entirely from the uncommitted capability registry', async () => {
    const fixture = await makeFixture();
    const scope = scopeFor(fixture, 'unstaged');
    const root = await makeRoot();
    const snapshot = await materializeWorktreeSnapshot(scope, { root });
    const registry = await createUncommittedCapabilityRegistry(scope, snapshot, {});

    expect('exportReview' in registry).toBe(false);
    expect('revealExportDirectory' in registry).toBe(false);
  });

  test('captures the frozen worktree snapshot exactly once per app construction', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'worktree once edit\n');
    const scope = scopeFor(fixture, 'unstaged');
    const app = await buildApp(scope);

    const first = await app.inject({ method: 'GET', url: '/api/session', headers });
    const second = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(first.json().uncommitted.reviewKey).toBe(second.json().uncommitted.reviewKey);

    await fixture.write('tracked.txt', 'worktree mutated after construction\n');
    const third = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(third.json().uncommitted.reviewKey).toBe(first.json().uncommitted.reviewKey);

    const fileId = first.json().files[0].fileId as string;
    const content = await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers });
    expect(content.json()).toMatchObject({ head: { text: 'worktree once edit\n' } });
  });
});
