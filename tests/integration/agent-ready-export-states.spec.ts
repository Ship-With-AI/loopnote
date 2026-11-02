import { expect, test } from '@playwright/test';

import { createSessionClient } from '../../src/web/api/client.js';
import { createReviewDraftState } from '../../src/web/model/review-draft-state.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const commentId = 'comment_00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(43);

test('exports only the accepted revision and preserves unsaved buffers through a failed pair publication', async () => {
  const requests: Array<{ readonly path: string; readonly body: unknown }> = [];
  const client = createSessionClient({
    location: { hash: `#token=${token}`, pathname: '/', search: '' },
    history: { state: null, replaceState() {} },
    fetch: async (path, init) => {
      requests.push({ path: String(path), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ kind: 'publicationFailed' }), { status: 500 });
    },
  });
  const review = createReviewDraftState({
    revision: 7,
    summary: 'Accepted summary',
    comments: [{
      id: commentId,
      state: 'open',
      body: 'Accepted comment',
      side: 'head',
      line: 4,
      createdAt: '2026-07-23T00:00:00.000Z',
      path: { bytesBase64url: 'c3JjL2ZpbGUudHM', display: 'src/file.ts' },
    }],
  });

  review.setSummaryBuffer('Unsaved summary');
  review.setCommentBuffer(commentId, 'Unsaved comment');
  expect(review.startExport()).toBe(true);

  const result = await client.exportReview({ expectedRevision: review.snapshot().canonical.revision });
  review.completeExport(result);

  expect(requests).toEqual([{ path: '/api/export', body: { expectedRevision: 7 } }]);
  expect(review.snapshot().canonical).toMatchObject({ revision: 7, summary: 'Accepted summary' });
  expect(review.snapshot().summaryBuffer).toBe('Unsaved summary');
  expect(review.snapshot().commentBuffers.get(commentId)).toBe('Unsaved comment');
  expect(review.snapshot().export).toMatchObject({ pending: false, failure: 'publicationFailed' });
});

test('rejects malformed exported receipt ordering and pairing in the browser client', async () => {
  const firstDirectory = `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}`;
  const secondDirectory = `${RENAME_MAP.repoStateDir}exports/${'3'.repeat(40)}..${'4'.repeat(40)}`;
  const json = { path: `${firstDirectory}/review.json`, algorithm: 'sha256', sha256: 'a'.repeat(64), bytes: 128 };
  const markdown = { path: `${firstDirectory}/review.md`, algorithm: 'sha256', sha256: 'b'.repeat(64), bytes: 256 };
  for (const files of [
    [markdown, json],
    [json, { ...json, sha256: 'c'.repeat(64) }],
    [json, { ...markdown, path: `${secondDirectory}/review.md` }],
  ]) {
    const client = createSessionClient({
      location: { hash: `#token=${token}`, pathname: '/', search: '' },
      history: { state: null, replaceState() {} },
      fetch: async () => new Response(JSON.stringify({
        kind: 'exported',
        draftRevision: 1,
        exportedAt: '2026-07-23T12:34:56.000Z',
          drift: { kind: 'noneObserved' },
          comparison: {
            base: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
            head: { label: 'head', selectorType: 'branch', oid: '2'.repeat(40) },
          },
        files,
      }), { status: 201 }),
    });

    await expect(client.exportReview({ expectedRevision: 1 })).rejects.toMatchObject({ kind: 'draft' });
  }
});

test('requires the latest drift acknowledgement before showing accepted-pair export progress', () => {
  const review = createReviewDraftState({ revision: 7, summary: '', comments: [] });
  const observation = {
    base: {
      kind: 'moved' as const,
      role: 'base' as const,
      label: 'main',
      selectorType: 'branch' as const,
      oldOid: '1'.repeat(40),
      newOid: '2'.repeat(40),
    },
    head: {
      kind: 'unchanged' as const,
      role: 'head' as const,
      label: 'feature/export',
      selectorType: 'branch' as const,
    },
  };

  review.completeExport({
    kind: 'driftAcknowledgementRequired',
    acknowledgementToken: 'first-token',
    observation,
  });

  expect(review.startExport('old-token')).toBe(false);
  expect(review.startExport('first-token')).toBe(true);
  expect(review.snapshot().export.progress).toBe('preparing');
});

test('uses no-field fixed capabilities for ignore consent and export-directory reveal', async () => {
  const requests: Array<{ readonly path: string; readonly method: string; readonly body: unknown }> = [];
  const client = createSessionClient({
    location: { hash: `#token=${token}`, pathname: '/', search: '' },
    history: { state: null, replaceState() {} },
    fetch: async (path, init) => {
      requests.push({
        path: String(path),
        method: String(init?.method),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      const result = String(path) === '/api/export/reveal'
        ? { kind: 'revealed' }
        : String(path) === '/api/export/gitignore' && init?.method === 'POST'
          ? { kind: 'appended' }
          : { kind: 'ignored' };
      return new Response(JSON.stringify(result));
    },
  });

  await expect(client.revealExportDirectory()).resolves.toEqual({ kind: 'revealed' });
  await expect(client.appendLoopnoteIgnoreRule()).resolves.toEqual({ kind: 'appended' });
  await expect(client.getLoopnoteIgnoreStatus()).resolves.toEqual({ kind: 'ignored' });

  expect(requests).toEqual([
    { path: '/api/export/reveal', method: 'POST', body: undefined },
    { path: '/api/export/gitignore', method: 'POST', body: undefined },
    { path: '/api/export/gitignore', method: 'GET', body: undefined },
  ]);
});
