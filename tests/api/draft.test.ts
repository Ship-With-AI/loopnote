import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { comparisonKey, rangeReviewKey } from '../../src/domain/comparison-key.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createSessionApp } from '../../src/server/app.js';
import { createAttachedCompletionCoordinator } from '../../src/server/attached-completion.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43129';
const origin = `http://${host}`;
const fileId = `file_${'a'.repeat(43)}`;
const headers = { host, origin, authorization: `Bearer ${token}` };
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

type ReviewRange = NonNullable<PinnedComparison['range']>;

function exactPath(value: string) {
  return {
    utf8: value,
    display: value,
    bytesBase64url: Buffer.from(value, 'utf8').toString('base64url'),
  };
}

function range(pathspecs: readonly string[]): ReviewRange {
  return {
    kind: 'revisions' as const,
    requestedBase: 'main~1',
    requestedHead: 'main',
    baseOid: '1'.repeat(40),
    headOid: '2'.repeat(40),
    pathspecs,
    reviewKey: rangeReviewKey('1'.repeat(40), '2'.repeat(40), pathspecs),
  };
}

function comparison(
  root: string,
  baseOid = '1'.repeat(40),
  headOid = '2'.repeat(40),
  reviewRange?: ReviewRange,
): PinnedComparison {
  return {
    repositoryRoot: root,
    objectFormat: 'sha1',
    base: { label: 'moving-base', oid: baseOid },
    head: { label: 'moving-head', oid: headOid },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [{
      id: fileId,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '4'.repeat(40),
      newBlobOid: '5'.repeat(40),
      oldPath: exactPath('src/review.ts'),
      newPath: exactPath('src/review.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }],
    hasCommittedChanges: true,
    ...(reviewRange === undefined ? {} : { range: reviewRange }),
  };
}

function buildApp(
  root: string,
  baseOid?: string,
  headOid?: string,
  onLookup?: (file: string) => void,
  headText = 'after\n',
  missingHead = false,
  reviewRange?: ReviewRange,
  storageScope?: string,
) {
  const app = createSessionApp(comparison(root, baseOid, headOid, reviewRange), {
    sessionToken: token,
    diagnostics: (d) => console.error('DIAG', JSON.stringify(d)),
    onCapabilityLookup: onLookup,
    objectReader: {
      inspect: async () => ({ kind: 'available' as const, objectType: 'blob', size: 12 }),
      read: async (oid: string) => {
        if (missingHead && oid === '5'.repeat(40)) {
          return { kind: 'missing' as const };
        }
        return {
          kind: 'available' as const,
          bytes: Buffer.from(oid === '4'.repeat(40) ? 'before\n' : headText),
        };
      },
    },
    ...(storageScope === undefined
      ? {}
      : {
          attachedCompletion: {
            coordinator: createAttachedCompletionCoordinator(),
            storageScope,
            deliver: async () => true,
          },
        }),
  });
  apps.add(app);
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: origin });
  return app;
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-draft-`));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

describe('comparison-local draft routes', () => {
  test('returns an empty strict draft and resumes only the same selected pair', async () => {
    const repositoryRoot = await root();
    const first = buildApp(repositoryRoot);

    expect((await first.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/` + comparisonKey('1'.repeat(40), '2'.repeat(40)) + '.json',
    });

    const added = await first.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'Keep this exact line.' },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ kind: 'accepted', draft: { comments: [{ state: 'open', body: 'Keep this exact line.' }] } });

    const persisted = JSON.parse(await readFile(
      join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts', `${comparisonKey('1'.repeat(40), '2'.repeat(40))}.json`),
      'utf8',
    )) as { comparison: Record<string, unknown> };
    expect(persisted.comparison).not.toHaveProperty('range');

    const resumed = buildApp(repositoryRoot);
    expect((await resumed.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'current',
      draft: {
        revision: 1,
        comments: [{ state: 'open', body: 'Keep this exact line.', verification: { state: 'verified', reason: 'exact-match' } }],
      },
    });

    const isolated = buildApp(repositoryRoot, '6'.repeat(40));
    expect((await isolated.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({ kind: 'missing' });
  });

  test('isolates same-OID range drafts by frozen ordered scope and resumes exact provenance', async () => {
    const repositoryRoot = await root();
    const firstRange = range(['src', ':(exclude)src/generated']);
    const secondRange = range([':(exclude)src/generated', 'src']);
    const first = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', false, firstRange);
    const second = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', false, secondRange);

    expect((await first.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${firstRange.reviewKey}.json`,
    });
    expect((await second.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${secondRange.reviewKey}.json`,
    });

    expect((await first.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'Range one.' },
    })).statusCode).toBe(201);
    expect((await second.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({ kind: 'missing' });

    const resumed = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', false, firstRange);
    expect((await resumed.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'current',
      draft: { revision: 1, comparison: { range: firstRange } },
    });
  });

  test('gives equivalent attached ranges distinct draft keys without changing their provenance', async () => {
    const repositoryRoot = await root();
    const reviewRange = range(['src']);
    const firstScope = `agent-${'a'.repeat(32)}`;
    const secondScope = `agent-${'b'.repeat(32)}`;
    const first = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', false, reviewRange, firstScope);
    const second = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', false, reviewRange, secondScope);

    expect(reviewRange.reviewKey).toBe(range(['src']).reviewKey);
    expect((await first.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${firstScope}.json`,
    });
    expect((await first.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'setSummary', expectedRevision: 0, markdown: 'First attached review.' },
    })).statusCode).toBe(200);
    expect((await second.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${secondScope}.json`,
    });
    expect(await readFile(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts', `${firstScope}.json`), 'utf8')).toContain('First attached review.');
  });

  test.each([
    ['reviewKey', 'f'.repeat(64)],
    ['path', `${RENAME_MAP.repoStateDir}drafts/controlled.json`],
    ['baseCommitOid', 'f'.repeat(40)],
    ['headCommitOid', 'f'.repeat(40)],
    ['label', 'controlled'],
    ['pathspecs', ['controlled']],
  ])('rejects browser-supplied %s authority', async (authority, value) => {
    const app = buildApp(await root(), undefined, undefined, undefined, 'after\n', false, range(['src']));
    const response = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: {
        type: 'addComment',
        expectedRevision: 0,
        fileId,
        side: 'head',
        line: 1,
        body: 'Cannot control persisted scope.',
        [authority]: value,
      },
    });

    expect(response.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({ kind: 'missing' });
  });

  test('stores only server-derived canonical records and rejects the exact side-specific duplicate', async () => {
    const app = buildApp(await root());
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'base', line: 1, body: 'Check the prior version.' },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({
      kind: 'accepted',
      draft: {
        comments: [{
          id: expect.any(String),
          state: 'open',
          body: 'Check the prior version.',
          anchor: { side: 'base', line: 1, blobOid: '4'.repeat(40), safeDisplayPath: 'src/review.ts' },
        }],
      },
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 1, fileId, side: 'base', line: 1, body: 'A different body cannot duplicate the anchor.' },
    });
    expect(duplicate.statusCode).toBe(404);

    const view = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(view.json()).toMatchObject({
      kind: 'current',
      draft: { revision: 1, comments: [expect.objectContaining({ body: 'Check the prior version.' })] },
    });
  });

  test('returns stale and orphaned presentation states without rewriting persisted anchors', async () => {
    const repositoryRoot = await root();
    const initial = buildApp(repositoryRoot);
    const added = await initial.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'This anchor must remain exact.' },
    });
    expect(added.statusCode).toBe(201);

    const stale = buildApp(repositoryRoot, undefined, undefined, undefined, 'changed text\n');
    expect((await stale.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'stale', reason: 'anchor-mismatch' } }] },
    });

    const orphaned = buildApp(repositoryRoot, undefined, undefined, undefined, 'after\n', true);
    expect((await orphaned.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'orphaned', reason: 'anchor-unavailable' } }] },
    });
  });

  test('denies unauthenticated draft work before lookup and preserves invalid existing bytes', async () => {
    const repositoryRoot = await root();

    const onLookup = vi.fn();
    const app = buildApp(repositoryRoot, undefined, undefined, onLookup);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/draft',
      headers: { ...headers, authorization: `Bearer ${'z'.repeat(43)}` },
    });
    expect(denied.statusCode).toBe(401);
    expect(onLookup).not.toHaveBeenCalled();

    const directory = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
    await mkdir(directory, { recursive: true });
    const file = join(
      directory,
      `${comparisonKey('1'.repeat(40), '2'.repeat(40))}.json`,
    );
    await writeFile(file, '{ invalid json');
    const invalid = await app.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'do not overwrite' } });
    expect(invalid.statusCode).toBe(409);
    expect(await readFile(file, 'utf8')).toBe('{ invalid json');
  });
});
