import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createSessionApp } from '../../src/server/app.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43129';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const fileId = `file_${'a'.repeat(43)}`;
const roots: string[] = [];
const apps = new Set<FastifyInstance>();

function path(value: string) {
  return { utf8: value, display: value, bytesBase64url: Buffer.from(value).toString('base64url') };
}

function comparison(repositoryRoot: string): PinnedComparison {
  return {
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'base', oid: '1'.repeat(40) },
    head: { label: 'head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [{
      id: fileId,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '4'.repeat(40),
      newBlobOid: '5'.repeat(40),
      oldPath: path('src/review.ts'),
      newPath: path('src/review.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }],
    hasCommittedChanges: true,
  };
}

async function app(): Promise<FastifyInstance> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-lifecycle-`));
  roots.push(repositoryRoot);
  const value = createSessionApp(comparison(repositoryRoot), {
    sessionToken: token,
    objectReader: {
      inspect: async () => ({ kind: 'available' as const, objectType: 'blob' as const, size: 12 }),
      read: async (oid: string) => ({
        kind: 'available' as const,
        bytes: Buffer.from(oid === '4'.repeat(40) ? 'before\n' : 'after\n'),
      }),
    },
  });
  value.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(value);
  return value;
}

afterEach(async () => {
  await Promise.all([...apps].map(async (value) => value.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('aggregate draft lifecycle API', () => {
  test('uses one strict mutation gateway for add, edit, resolve, reopen, delete, and summary', async () => {
    const value = await app();
    const added = await value.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'Exact body.  ' },
    });
    expect(added.statusCode).toBe(201);
    const first = added.json();
    expect(first).toMatchObject({ kind: 'accepted', draft: { revision: 1 } });
    const commentId = first.draft.comments[0].id as string;

    const edit = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'editComment', expectedRevision: 1, commentId, body: 'Edited exactly.  ' } });
    expect(edit.statusCode).toBe(200);
    expect(edit.json()).toMatchObject({ kind: 'accepted', draft: { revision: 2, comments: [{ id: commentId, body: 'Edited exactly.  ', state: 'open' }] } });

    const resolved = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'resolveComment', expectedRevision: 2, commentId } });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ kind: 'accepted', draft: { revision: 3, comments: [{ id: commentId, state: 'resolved', resolvedAt: expect.any(String) }] } });

    const reopened = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'reopenComment', expectedRevision: 3, commentId } });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({ kind: 'accepted', draft: { revision: 4, comments: [{ id: commentId, state: 'open' }] } });

    const summary = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'setSummary', expectedRevision: 4, markdown: '' } });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({ kind: 'accepted', draft: { revision: 5, summary: '' } });

    const deleted = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'deleteComment', expectedRevision: 5, commentId } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ kind: 'accepted', draft: { revision: 6, comments: [] } });
  });

  test('rejects malformed mutations and security denials before repository work', async () => {
    const value = await app();
    for (const payload of [
      { type: 'setSummary', markdown: 'missing revision' },
      { type: 'setSummary', expectedRevision: 0, markdown: '', force: true },
    ]) {
      expect((await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload })).statusCode).toBe(400);
    }
    expect((await value.inject({ method: 'POST', url: '/api/draft/replace', headers, payload: {} })).statusCode).toBe(404);
    expect((await value.inject({ method: 'POST', url: '/api/draft/mutations', headers: { ...headers, authorization: `Bearer ${'z'.repeat(43)}` }, payload: { type: 'setSummary', expectedRevision: 0, markdown: '' } })).statusCode).toBe(401);
  });
});
