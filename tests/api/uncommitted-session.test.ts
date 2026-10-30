import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { PinnedComparison, UncommittedScope } from '../../src/contracts/comparison.js';
import { createSessionApp, createUncommittedSessionApp, type CreateUncommittedSessionAppOptions } from '../../src/server/app.js';
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

function pinnedComparison(repositoryRoot: string): PinnedComparison {
  return {
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'moving-base', oid: '1'.repeat(40) },
    head: { label: 'moving-head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [],
    hasCommittedChanges: true,
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

  test('rejects a non-empty POST /api/refresh body or content-type without invoking the refresh capability', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'unstaged edit before refresh\n');
    const scope = scopeFor(fixture, 'unstaged');
    const app = await buildApp(scope);

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    const fileId = (session.json().files as ReadonlyArray<{ readonly fileId: string }>)[0]!.fileId;

    await fixture.write('tracked.txt', 'unstaged edit after rejected refresh attempts\n');

    const withBody = await app.inject({ method: 'POST', url: '/api/refresh', headers, payload: { noop: true } });
    expect(withBody.statusCode).toBe(400);

    const withContentType = await app.inject({
      method: 'POST',
      url: '/api/refresh',
      headers: { ...headers, 'content-type': 'application/json' },
    });
    expect(withContentType.statusCode).toBe(400);

    const content = await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers });
    expect(content.json()).toMatchObject({ head: { text: 'unstaged edit before refresh\n' } });
  });

  test('refreshes the frozen snapshot and reports exactly the delta and stale/orphaned transition counts', async () => {
    const fixture = await makeFixture();
    const baseOid = headOid(fixture);
    await fixture.write('tracked.txt', 'first captured line\n');
    const scope = scopeFor(fixture, 'worktree', { baseCommitOid: baseOid, mergeBaseOid: baseOid });
    const app = await buildApp(scope);

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    const trackedFile = (session.json().files as ReadonlyArray<{ readonly fileId: string; readonly newPath?: { readonly utf8?: string } }>)
      .find((candidate) => candidate.newPath?.utf8 === 'tracked.txt');
    expect(trackedFile).toBeDefined();

    const added = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId: trackedFile!.fileId, side: 'head', line: 1, body: 'Checking this line.' },
    });
    expect(added.statusCode).toBe(201);

    const beforeDraft = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(beforeDraft.json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'verified', reason: 'exact-match' } }] },
    });

    await fixture.write('tracked.txt', 'second refreshed line\n');
    await fixture.write('new-untracked.txt', 'brand new after capture\n');

    const refresh = await app.inject({ method: 'POST', url: '/api/refresh', headers });
    expect(refresh.statusCode).toBe(200);
    const refreshBody = refresh.json();
    expect(Object.keys(refreshBody)).toEqual(['added', 'removed', 'modified', 'staleCount', 'orphanedCount']);
    expect(refreshBody.modified).toContain('tracked.txt');
    expect(refreshBody.added).toContain('new-untracked.txt');
    expect(refreshBody.staleCount).toBe(1);
    expect(refreshBody.orphanedCount).toBe(0);

    const afterDraft = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(afterDraft.json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'stale', reason: 'anchor-mismatch' } }] },
    });
  });

  test('reports worktree-status changed only after an on-disk edit since the current snapshot', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'status check baseline\n');
    const scope = scopeFor(fixture, 'unstaged');
    const app = await buildApp(scope);

    const before = await app.inject({ method: 'GET', url: '/api/worktree-status', headers });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ changed: false });

    await fixture.write('tracked.txt', 'status check mutated\n');

    const after = await app.inject({ method: 'GET', url: '/api/worktree-status', headers });
    expect(after.json()).toEqual({ changed: true });
  });

  test('leaves POST /api/refresh and GET /api/worktree-status absent (404) for non-uncommitted sessions', async () => {
    const root = await makeRoot();
    const app = createSessionApp(pinnedComparison(root), { sessionToken: token });
    app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
    apps.add(app);

    const refresh = await app.inject({ method: 'POST', url: '/api/refresh', headers });
    expect(refresh.statusCode).toBe(404);
    const status = await app.inject({ method: 'GET', url: '/api/worktree-status', headers });
    expect(status.statusCode).toBe(404);
  });

  test('recovers a prior uncommitted draft\'s comments into the current draft without touching the candidate file', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'recovery line one\nrecovery line two\n');
    const scope = scopeFor(fixture, 'unstaged');
    const snapshotRoot = await makeRoot();
    const snapshot = await materializeWorktreeSnapshot(scope, { root: snapshotRoot });
    const throwawayRegistry = await createUncommittedCapabilityRegistry(scope, snapshot, {});

    const files = await snapshot.files();
    const file = files.find((candidate) => candidate.newPath?.utf8 === 'tracked.txt');
    expect(file).toBeDefined();
    const content = await throwawayRegistry.readContent(file!.id);
    const headSide = content?.head;
    expect(headSide?.exists).toBe(true);
    if (headSide === undefined || !headSide.exists) throw new Error('Expected head-side content to exist.');

    const openAnchor = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'head',
      blobOid: headSide.blobOid,
      line: 1,
      text: headSide.text,
    });
    const resolvedAnchor = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'head',
      blobOid: headSide.blobOid,
      line: 2,
      text: headSide.text,
    });

    const directory = join(fixture.root, '.cumpa', 'drafts');
    await mkdir(directory, { recursive: true });
    const candidatePath = join(directory, `${'7'.repeat(64)}.json`);
    const priorDraft = {
      schemaVersion: 1,
      comparison: {
        kind: 'uncommitted' as const,
        sourceKind: 'unstaged' as const,
        reviewKey: '7'.repeat(64),
        snapshotChain: ['8'.repeat(64)],
      },
      revision: 0,
      summary: '',
      comments: [
        {
          id: 'comment_00000000-0000-4000-8000-000000000001',
          state: 'open' as const,
          body: 'Open comment body.',
          anchor: openAnchor,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'comment_00000000-0000-4000-8000-000000000002',
          state: 'resolved' as const,
          body: 'Resolved comment body.',
          anchor: resolvedAnchor,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const originalBytes = Buffer.from(JSON.stringify(priorDraft));
    await writeFile(candidatePath, originalBytes);

    const app = await buildApp(scope, { uncommittedRecoveryCandidate: { path: candidatePath } });

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(session.json().uncommitted.recoveryAvailable).toBe(true);

    const recovered = await app.inject({ method: 'POST', url: '/api/uncommitted/recover-draft', headers });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({ kind: 'recovered' });

    const draft = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(draft.json()).toMatchObject({
      kind: 'current',
      draft: {
        comments: [
          { body: 'Open comment body.', state: 'open', verification: { state: 'verified', reason: 'exact-match' } },
          { body: 'Resolved comment body.', state: 'resolved', verification: { state: 'verified', reason: 'exact-match' } },
        ],
      },
    });

    const bytesAfterRecovery = await readFile(candidatePath);
    expect(bytesAfterRecovery.equals(originalBytes)).toBe(true);
  });

  test('omits recoveryAvailable and 404s POST /api/uncommitted/recover-draft when no recovery candidate was supplied', async () => {
    const fixture = await makeFixture();
    await fixture.write('tracked.txt', 'no candidate here\n');
    const scope = scopeFor(fixture, 'unstaged');
    const app = await buildApp(scope);

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect('recoveryAvailable' in session.json().uncommitted).toBe(false);

    const recovered = await app.inject({ method: 'POST', url: '/api/uncommitted/recover-draft', headers });
    expect(recovered.statusCode).toBe(404);
  });
});
