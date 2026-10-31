import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { createSessionApp } from '../../src/server/app.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = 'a'.repeat(43);
const expectedHost = '127.0.0.1:43129';
const expectedOrigin = `http://${expectedHost}`;
const fileId = `file_${'a'.repeat(43)}`;
const unsupportedFileId = `file_${'b'.repeat(43)}`;
const unknownFileId = `file_${'z'.repeat(43)}`;
const securityMessage =
  'This request is not available in the current session. Relaunch Cumpa from the terminal.';
const apps = new Set<FastifyInstance>();

function path(value: string) {
  return {
    bytesBase64url: Buffer.from(value).toString('base64url'),
    display: value,
    utf8: value,
  } as const;
}

function comparisonFixture(): PinnedComparison {
  return {
    repositoryRoot: '/private/repository/must-not-leak',
    objectFormat: 'sha1',
    base: { label: 'main', oid: '1'.repeat(40) },
    head: { label: 'feature', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [
      {
        id: fileId,
        status: { code: 'R', kind: 'renamed', similarity: 100 },
        oldMode: '100644',
        newMode: '100644',
        oldBlobOid: '4'.repeat(40),
        newBlobOid: '5'.repeat(40),
        oldPath: path('src/old-name.ts'),
        newPath: path('src/new-name.ts'),
        additions: 1,
        deletions: 1,
        availability: { kind: 'text' },
      },
      {
        id: unsupportedFileId,
        status: { code: 'M', kind: 'modified', similarity: null },
        oldMode: '100644',
        newMode: '100644',
        oldBlobOid: '6'.repeat(40),
        newBlobOid: '7'.repeat(40),
        oldPath: path('src/binary.ts'),
        newPath: path('src/binary.ts'),
        additions: null,
        deletions: null,
        availability: { kind: 'unsupported', reason: 'binary' },
      },
    ],
    hasCommittedChanges: true,
  };
}

const headers = {
  host: expectedHost,
  origin: expectedOrigin,
  authorization: `Bearer ${token}`,
};

function buildApp(options: {
  readonly onCapabilityLookup?: (requested: string) => void;
  readonly onAnchorAdd?: (input: unknown) => Promise<unknown>;
} = {}) {
  const reads = new Map([
    ['4'.repeat(40), Buffer.from('base line\nunchanged\n')],
    ['5'.repeat(40), Buffer.from('head line\nunchanged\n')],
  ]);
  const app = createSessionApp(comparisonFixture(), {
    sessionToken: token,
    onCapabilityLookup: options.onCapabilityLookup,
    onAnchorAdd: options.onAnchorAdd,
    objectReader: {
      async inspect(oid: string) {
        const bytes = reads.get(oid);
        return bytes === undefined
          ? { kind: 'missing' as const }
          : { kind: 'available' as const, objectType: 'blob', size: bytes.byteLength };
      },
      async read(oid: string) {
        const bytes = reads.get(oid);
        return bytes === undefined
          ? { kind: 'missing' as const }
          : { kind: 'available' as const, bytes };
      },
    },
  } as never);
  apps.add(app);
  app.bindSessionSecurity({ expectedHost, expectedOrigin });
  return app;
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => await app.close()));
  apps.clear();
});

function expectGenericDenial(response: { readonly body: string; json(): unknown }): void {
  expect(response.json()).toEqual({ code: 'request-unavailable', message: securityMessage });
  expect(response.body).not.toContain('/private/repository');
  expect(response.body).not.toContain('old-name.ts');
  expect(response.body).not.toContain('4'.repeat(40));
}

describe('closed capability content and anchor routes', () => {
  test('returns exact frozen side DTOs only through an authenticated opaque file capability', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      fileId,
      base: {
        exists: true,
        path: path('src/old-name.ts'),
        language: 'typescript',
        blobOid: '4'.repeat(40),
        text: 'base line\nunchanged\n',
      },
      head: {
        exists: true,
        path: path('src/new-name.ts'),
        language: 'typescript',
        blobOid: '5'.repeat(40),
        text: 'head line\nunchanged\n',
      },
    });
  });

  test('derives base and head anchors server-side, including asymmetric path and blob facts', async () => {
    const accepted: unknown[] = [];
    const app = buildApp({
      onAnchorAdd: async (input) => {
        accepted.push(input);
        return { id: 'comment_1' };
      },
    });

    for (const side of ['base', 'head'] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/draft/mutations',
        headers,
        payload: { type: 'addComment', expectedRevision: 0, fileId, side, line: 1, body: 'Please revise this.' },
      });
      expect(response.statusCode).toBe(201);
    }

    expect(accepted).toMatchObject([
      {
        body: 'Please revise this.',
        anchor: {
          side: 'base',
          line: 1,
          safeDisplayPath: 'src/old-name.ts',
          blobOid: '4'.repeat(40),
          selectedText: 'base line',
        },
      },
      {
        body: 'Please revise this.',
        anchor: {
          side: 'head',
          line: 1,
          safeDisplayPath: 'src/new-name.ts',
          blobOid: '5'.repeat(40),
          selectedText: 'head line',
        },
      },
    ]);
  });

  test('rejects invalid, smuggled, unknown, unsupported, and unauthorized requests before lookup or object work', async () => {
    const onLookup = vi.fn();
    const app = buildApp({ onCapabilityLookup: onLookup });
    const invalidBodies: ReadonlyArray<Readonly<{ readonly payload: unknown; readonly statusCode: number }>> = [
      { payload: { fileId, side: 'base', line: 0, body: 'body' }, statusCode: 400 },
      { payload: { fileId, side: 'base', line: 3, body: 'body' }, statusCode: 409 },
      { payload: { fileId, side: 'base', line: 1, body: '   ' }, statusCode: 400 },
      { payload: { fileId, side: 'base', line: 1, body: 'x'.repeat(100_001) }, statusCode: 400 },
      {
        payload: { fileId, side: 'base', line: 1, body: 'body', path: 'src/forged.ts' },
        statusCode: 400,
      },
      {
        payload: {
          fileId,
          side: 'base',
          line: 1,
          body: 'body',
          repository: '/private/repository/must-not-leak',
          ref: 'main',
          commit: 'f'.repeat(40),
          blobOid: 'f'.repeat(40),
          contextHash: 'forged',
          draftKey: 'forged',
        },
        statusCode: 400,
      },
      {
        payload: { fileId, side: 'base', line: 2, endLine: 1, body: 'body' },
        statusCode: 400,
      },
    ];
    for (const { payload, statusCode } of invalidBodies) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/draft/mutations',
        headers,
        payload: { type: 'addComment', expectedRevision: 0, ...(payload as object) },
      });
      expect(response.statusCode).toBe(statusCode);
      expectGenericDenial(response);
    }

    for (const url of [
      `/api/files/${unknownFileId}/content`,
      `/api/files/${unsupportedFileId}/content`,
      `/api/files/${fileId}/content?repository=forged`,
    ]) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect([400, 404, 409]).toContain(response.statusCode);
      expectGenericDenial(response);
    }

    onLookup.mockClear();
    const denied = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers: { ...headers, authorization: `Bearer ${'x'.repeat(43)}` },
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'base', line: 1, body: 'body' },
    });
    expect(denied.statusCode).toBe(401);
    expectGenericDenial(denied);
    expect(onLookup).not.toHaveBeenCalled();
  });
});

describe('range-aware durable anchor (A-01)', () => {
  test('round-trips endLine through addComment and keeps legacy single-line anchors endLine-free', async () => {
    const accepted: unknown[] = [];
    const app = buildApp({
      onAnchorAdd: async (input) => {
        accepted.push(input);
        return { id: 'comment_1' };
      },
    });

    const withRange = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'base', line: 1, endLine: 2, body: 'Covers the whole block.' },
    });
    expect(withRange.statusCode).toBe(201);

    const withoutRange = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'Single line, unchanged.' },
    });
    expect(withoutRange.statusCode).toBe(201);

    expect(accepted).toMatchObject([
      {
        body: 'Covers the whole block.',
        anchor: { side: 'base', line: 1, endLine: 2, selectedText: 'base line\nunchanged' },
      },
      {
        body: 'Single line, unchanged.',
        anchor: { side: 'head', line: 1, selectedText: 'head line' },
      },
    ]);
    const second = accepted[1];
    if (second === null || typeof second !== 'object' || !('anchor' in second)) {
      throw new Error('Expected a captured anchor payload.');
    }
    expect(second.anchor).not.toHaveProperty('endLine');
  });

  test('rejects endLine below line with 400 before buildDurableAnchor runs, and never stores an anchor', async () => {
    const accepted: unknown[] = [];
    const app = buildApp({
      onAnchorAdd: async (input) => {
        accepted.push(input);
        return { id: 'comment_1' };
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'base', line: 2, endLine: 1, body: 'Malformed range.' },
    });

    expect(response.statusCode).toBe(400);
    expect(accepted).toHaveLength(0);
  });
});

describe('range-aware durable anchor drift (A-01)', () => {
  const driftRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(driftRoots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
  });

  async function tempRoot(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), 'cumpa-anchor-'));
    driftRoots.push(value);
    return value;
  }

  function rangeComparison(root: string): PinnedComparison {
    return {
      repositoryRoot: root,
      objectFormat: 'sha1',
      base: { label: 'main', oid: '1'.repeat(40) },
      head: { label: 'feature', oid: '2'.repeat(40) },
      mergeBaseOid: '3'.repeat(40),
      changedFiles: [{
        id: fileId,
        status: { code: 'M', kind: 'modified', similarity: null },
        oldMode: '100644',
        newMode: '100644',
        oldBlobOid: '4'.repeat(40),
        newBlobOid: '5'.repeat(40),
        oldPath: path('src/old-name.ts'),
        newPath: path('src/new-name.ts'),
        additions: 1,
        deletions: 1,
        availability: { kind: 'text' },
      }],
      hasCommittedChanges: true,
    };
  }

  function buildRangeApp(root: string, headText: string) {
    const app = createSessionApp(rangeComparison(root), {
      sessionToken: token,
      objectReader: {
        async inspect() {
          return { kind: 'available' as const, objectType: 'blob', size: 12 };
        },
        async read(oid: string) {
          return {
            kind: 'available' as const,
            bytes: Buffer.from(oid === '5'.repeat(40) ? headText : 'base line\nunchanged\n'),
          };
        },
      },
    } as never);
    apps.add(app);
    app.bindSessionSecurity({ expectedHost, expectedOrigin });
    return app;
  }

  test('flags interior drift strictly inside the stored [line, endLine] range as stale', async () => {
    const root = await tempRoot();
    const headText = 'line one\nline two\nline three\nline four\nline five\n';
    const initial = buildRangeApp(root, headText);
    const added = await initial.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 2, endLine: 4, body: 'Watch this whole block.' },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({
      kind: 'accepted',
      draft: { comments: [{ anchor: { line: 2, endLine: 4, selectedText: 'line two\nline three\nline four' } }] },
    });

    const driftedText = 'line one\nline two\nline three CHANGED\nline four\nline five\n';
    const drifted = buildRangeApp(root, driftedText);
    const view = await drifted.inject({ method: 'GET', url: '/api/draft', headers });

    expect(view.json()).toMatchObject({
      kind: 'current',
      draft: { comments: [{ verification: { state: 'stale', reason: 'anchor-mismatch' } }] },
    });
  });
});
