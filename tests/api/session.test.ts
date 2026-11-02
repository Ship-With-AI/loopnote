import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { createSessionApp } from '../../src/server/app.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 's'.repeat(43);
const expectedHost = '127.0.0.1:43128';
const expectedOrigin = `http://${expectedHost}`;
const fileId = `file_${'a'.repeat(43)}`;
const unknownFileId = `file_${'z'.repeat(43)}`;
const securityMessage =
  `This request is not available in the current session. Relaunch ${RENAME_MAP.displayName} from the terminal.`;

function path(value: string) {
  return {
    bytesBase64url: Buffer.from(value).toString('base64url'),
    display: value,
    utf8: value,
  } as const;
}

function comparisonFixture(): PinnedComparison {
  return {
    repositoryRoot: '/private/repository/never-on-the-wire',
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
        oldPath: path('src/old.ts'),
        newPath: path('src/new.ts'),
        additions: 4,
        deletions: 2,
        availability: { kind: 'text' },
      },
      {
        id: `file_${'b'.repeat(43)}`,
        status: { code: 'D', kind: 'deleted', similarity: null },
        oldMode: '100644',
        newMode: '000000',
        oldBlobOid: '6'.repeat(40),
        newBlobOid: '0'.repeat(40),
        oldPath: path('src/vanished.ts'),
        additions: 0,
        deletions: 1,
        availability: { kind: 'unavailable', reason: 'missing-object' },
      },
    ],
    hasCommittedChanges: true,
  };
}

function rangeComparisonFixture(): PinnedComparison {
  return {
    ...comparisonFixture(),
    mergeBaseOid: '1'.repeat(40),
    range: {
      kind: 'revisions',
      requestedBase: 'refs/heads/main',
      requestedHead: 'refs/heads/feature',
      baseOid: '1'.repeat(40),
      headOid: '2'.repeat(40),
      pathspecs: ['src', ':!generated', '--literal'],
      reviewKey: 'f'.repeat(64),
    },
  };
}

interface SecurityAwareApp extends FastifyInstance {
  bindSessionSecurity(target: {
    readonly expectedHost: string;
    readonly expectedOrigin: string;
  }): void;
}

const apps = new Set<FastifyInstance>();

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => await app.close()));
  apps.clear();
});

function buildApp(
  comparison = comparisonFixture(),
  options: { readonly onCapabilityLookup?: (fileId: string) => void } = {},
): SecurityAwareApp {
  const app = createSessionApp(comparison, {
    sessionToken: token,
    onCapabilityLookup: options.onCapabilityLookup,
  } as never) as SecurityAwareApp;
  apps.add(app);
  if (typeof app.bindSessionSecurity === 'function') {
    app.bindSessionSecurity({ expectedHost, expectedOrigin });
  }
  return app;
}

const headers = {
  host: expectedHost,
  origin: expectedOrigin,
  authorization: `Bearer ${token}`,
};

function expectGenericDenial(response: {
  readonly statusCode: number;
  json(): unknown;
  readonly body: string;
}): void {
  expect([400, 404, 405]).toContain(response.statusCode);
  expect(response.json()).toEqual({
    code: 'request-unavailable',
    message: securityMessage,
  });
  expect(response.body).not.toContain('/private/repository');
  expect(response.body).not.toContain('src/');
  expect(response.body).not.toContain('4'.repeat(40));
  expect(response.body).not.toContain('5'.repeat(40));
  expect(response.body).not.toContain('stderr');
}

describe('frozen opaque session capabilities', () => {
  test('returns a strict session DTO without repository, blob, or token authority', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/session', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      base: { label: 'main', oid: '1'.repeat(40) },
      head: { label: 'feature', oid: '2'.repeat(40) },
      mergeBaseOid: '3'.repeat(40),
      repoName: 'never-on-the-wire',
      files: [
        {
          fileId,
          status: { kind: 'renamed', similarity: 100 },
          oldMode: '100644',
          oldPath: path('src/old.ts'),
          newPath: path('src/new.ts'),
          additions: 4,
          deletions: 2,
          availability: { kind: 'text' },
        },
        {
          fileId: `file_${'b'.repeat(43)}`,
          status: { kind: 'deleted' },
          oldMode: '100644',
          oldPath: path('src/vanished.ts'),
          additions: 0,
          deletions: 1,
          availability: { kind: 'unavailable', reason: 'missing-object' },
        },
      ],
    });
    expect(response.body).not.toContain('repositoryRoot');
    expect(response.body).not.toContain('oldBlobOid');
    expect(response.body).not.toContain('newBlobOid');
    expect(response.body).not.toContain(token);
  });

  test('projects only frozen range scope and does not follow later ref movement', async () => {
    const comparison = rangeComparisonFixture();
    const app = buildApp(comparison);

    const before = await app.inject({ method: 'GET', url: '/api/session', headers });
    Reflect.set(comparison.base, 'oid', '9'.repeat(40));
    Reflect.set(comparison.head, 'oid', '8'.repeat(40));
    Reflect.set(comparison.range!, 'pathspecs', ['changed-after-launch']);
    const after = await app.inject({ method: 'GET', url: '/api/session', headers });

    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({
      base: { oid: '1'.repeat(40) },
      head: { oid: '2'.repeat(40) },
      range: {
        kind: 'revisions',
        baseOid: '1'.repeat(40),
        headOid: '2'.repeat(40),
        pathspecs: ['src', ':!generated', '--literal'],
      },
    });
    expect(after.json()).toEqual(before.json());
    expect(after.body).not.toContain('requestedBase');
    expect(after.body).not.toContain('requestedHead');
    expect(after.body).not.toContain('reviewKey');
    expect(after.body).not.toContain('/private/repository');
    expect(after.body).not.toContain('4'.repeat(40));
    expect(after.body).not.toContain(token);
  });

  test('returns metadata only for one frozen opaque file capability', async () => {
    const lookup = vi.fn();
    const app = buildApp(comparisonFixture(), { onCapabilityLookup: lookup });

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      fileId,
      status: { kind: 'renamed', similarity: 100 },
      oldMode: '100644',
      newMode: '100644',
      oldPath: path('src/old.ts'),
      newPath: path('src/new.ts'),
      additions: 4,
      deletions: 2,
      availability: { kind: 'text' },
    });
    expect(lookup).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledWith(fileId);
    expect(response.body).not.toContain('oldBlobOid');
    expect(response.body).not.toContain('newBlobOid');
    expect(response.body).not.toContain(token);
  });

  test('serves a frozen snapshot even if the source object is changed after app creation', async () => {
    const source = comparisonFixture();
    const app = buildApp(source);
    const mutable = source.changedFiles[0] as {
      additions: number | null;
      availability: { kind: 'text' } | { kind: 'unavailable'; reason: 'missing-object' };
    };
    mutable.additions = 999;
    mutable.availability = { kind: 'unavailable', reason: 'missing-object' };

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      additions: 4,
      availability: { kind: 'text' },
    });
  });

  test('retains already-classified missing-object metadata without live object work', async () => {
    const lookup = vi.fn();
    const app = buildApp(comparisonFixture(), { onCapabilityLookup: lookup });
    const unavailableId = `file_${'b'.repeat(43)}`;

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${unavailableId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fileId: unavailableId,
      availability: { kind: 'unavailable', reason: 'missing-object' },
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith(unavailableId);
  });

  test.each([
    `/api/files/${unknownFileId}`,
    '/api/files/..%2F..%2Fsecret',
    '/api/files/%2E%2E%2Fobjects%2Fdeadbeef',
  ])('makes unknown and traversal-like file IDs indistinguishable: %s', async (url) => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url, headers });

    expect(response.statusCode).toBe(404);
    expectGenericDenial(response);
    expect(response.body).not.toContain(unknownFileId);
    expect(response.body).not.toContain('deadbeef');
  });

  test.each([
    'repository',
    'ref',
    'commit',
    'object',
    'blob',
    'path',
    'gitOption',
    'exportPath',
    'mutation',
  ])('rejects extra request authority before capability lookup: %s', async (field) => {
    const lookup = vi.fn();
    const app = buildApp(comparisonFixture(), { onCapabilityLookup: lookup });

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}?${field}=attacker-controlled`,
      headers,
    });

    expect(response.statusCode).toBe(400);
    expectGenericDenial(response);
    expect(lookup).not.toHaveBeenCalled();
  });

  test.each([
    ['POST', '/api/session', '{"repository":"/tmp/repo"}'],
    ['DELETE', `/api/files/${fileId}`, undefined],
    ['GET', `/api/blobs/${'4'.repeat(40)}`, undefined],
    ['POST', '/api/session', '{malformed'],
  ] as const)('rejects unknown methods, routes, and malformed payloads generically', async (method, url, payload) => {
    const lookup = vi.fn();
    const app = buildApp(comparisonFixture(), { onCapabilityLookup: lookup });

    const response = await app.inject({
      method,
      url,
      headers: {
        ...headers,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { payload }),
    });

    expectGenericDenial(response);
    expect(lookup).not.toHaveBeenCalled();
  });
});
