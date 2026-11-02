import type { OutgoingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { createSessionApp } from '../../src/server/app.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 't'.repeat(43);
const wrongToken = 'w'.repeat(43);
const expectedHost = '127.0.0.1:43127';
const expectedOrigin = `http://${expectedHost}`;
const fileId = `file_${'f'.repeat(43)}`;
const securityMessage =
  `This request is not available in the current session. Relaunch ${RENAME_MAP.displayName} from the terminal.`;

const comparison: PinnedComparison = {
  repositoryRoot: '/private/repository/that-must-not-leak',
  objectFormat: 'sha1',
  base: { label: 'main', oid: '1'.repeat(40) },
  head: { label: 'feature', oid: '2'.repeat(40) },
  mergeBaseOid: '3'.repeat(40),
  changedFiles: [
    {
      id: fileId,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '4'.repeat(40),
      newBlobOid: '5'.repeat(40),
      oldPath: {
        bytesBase64url: Buffer.from('src/secret.ts').toString('base64url'),
        display: 'src/secret.ts',
        utf8: 'src/secret.ts',
      },
      newPath: {
        bytesBase64url: Buffer.from('src/secret.ts').toString('base64url'),
        display: 'src/secret.ts',
        utf8: 'src/secret.ts',
      },
      additions: 2,
      deletions: 1,
      availability: { kind: 'text' },
    },
  ],
  hasCommittedChanges: true,
};

interface SecurityDiagnostic {
  readonly correlationId: string;
  readonly reason: string;
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

function buildApp(options: {
  readonly diagnostics?: (diagnostic: SecurityDiagnostic) => void;
  readonly onProtectedRoute?: () => void;
} = {}): SecurityAwareApp {
  const app = createSessionApp(comparison, {
    sessionToken: token,
    diagnostics: options.diagnostics,
  } as never) as SecurityAwareApp;
  apps.add(app);
  if (typeof app.bindSessionSecurity === 'function') {
    app.bindSessionSecurity({ expectedHost, expectedOrigin });
  }
  if (options.onProtectedRoute !== undefined) {
    app.addHook('preHandler', async (request) => {
      if (request.url.startsWith('/api/')) {
        options.onProtectedRoute?.();
      }
    });
  }
  return app;
}

function authorizedHeaders(origin?: string): Record<string, string> {
  return {
    host: expectedHost,
    authorization: `Bearer ${token}`,
    ...(origin === undefined ? {} : { origin }),
  };
}

function expectGenericSecurityDenial(response: {
  readonly statusCode: number;
  json(): unknown;
  readonly body: string;
}): void {
  expect([400, 401, 403, 404, 405]).toContain(response.statusCode);
  expect(response.json()).toEqual({
    code: 'request-unavailable',
    message: securityMessage,
  });
  expect(response.body).not.toContain(token);
  expect(response.body).not.toContain(wrongToken);
  expect(response.body).not.toContain(comparison.repositoryRoot);
  expect(response.body).not.toContain(fileId);
  expect(response.body).not.toContain('src/secret.ts');
  expect(response.body).not.toContain('git ');
  expect(response.body).not.toContain('stderr');
}

function normalizedHeaders(headers: OutgoingHttpHeaders): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, typeof value === 'number' ? value.toString() : value]),
  );
}

function expectSecurityHeaders(headers: Record<string, string | string[] | undefined>): void {
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("connect-src 'self'");
  expect(headers['content-security-policy']).toContain(
    "style-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'",
  );
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("base-uri 'none'");
  expect(headers['access-control-allow-origin']).toBeUndefined();
  expect(headers['access-control-allow-credentials']).toBeUndefined();
}

describe('closed loopback request boundary', () => {
  test.each([
    ['missing bearer', { host: expectedHost }, 401],
    ['wrong bearer', { host: expectedHost, authorization: `Bearer ${wrongToken}` }, 401],
    ['length-mismatched bearer', { host: expectedHost, authorization: 'Bearer short' }, 401],
    ['malformed bearer', { host: expectedHost, authorization: token }, 401],
    ['hostile Host', { host: 'attacker.example', authorization: `Bearer ${token}` }, 403],
    [
      'unexpected present Origin',
      { ...authorizedHeaders(), origin: 'https://attacker.example' },
      403,
    ],
  ])('rejects %s before protected route work', async (_name, headers, status) => {
    const onProtectedRoute = vi.fn();
    const app = buildApp({ onProtectedRoute });

    const response = await app.inject({ method: 'GET', url: '/api/session', headers });

    expect(response.statusCode).toBe(status);
    expectGenericSecurityDenial(response);
    expect(onProtectedRoute).not.toHaveBeenCalled();
    expectSecurityHeaders(normalizedHeaders(response.headers));
  });

  test.each([
    ['absent Origin', authorizedHeaders()],
    ['exact same Origin', authorizedHeaders(expectedOrigin)],
  ])('allows exact Host and token with %s', async (_name, headers) => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/session', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      base: comparison.base,
      head: comparison.head,
      mergeBaseOid: comparison.mergeBaseOid,
    });
    expectSecurityHeaders(normalizedHeaders(response.headers));
  });

  test('protects static responses with exact Host and Origin without requiring the fragment bearer', async () => {
    const app = buildApp();

    const allowed = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: expectedHost },
    });
    const hostileHost = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'attacker.example' },
    });
    const hostileOrigin = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: expectedHost, origin: 'https://attacker.example' },
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).not.toContain(token);
    expectSecurityHeaders(normalizedHeaders(allowed.headers));
    expect(hostileHost.statusCode).toBe(403);
    expectGenericSecurityDenial(hostileHost);
    expect(hostileOrigin.statusCode).toBe(403);
    expectGenericSecurityDenial(hostileOrigin);
  });

  test('uses non-secret terminal diagnostics with correlation only', async () => {
    const diagnostics: SecurityDiagnostic[] = [];
    const app = buildApp({ diagnostics: (diagnostic) => diagnostics.push(diagnostic) });

    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      headers: {
        host: expectedHost,
        origin: 'https://attacker.example',
        authorization: `Bearer ${wrongToken}`,
      },
    });

    expectGenericSecurityDenial(response);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.correlationId).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(diagnostics[0]?.reason).toBe('origin-mismatch');
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(wrongToken);
    expect(serialized).not.toContain(fileId);
    expect(serialized).not.toContain(comparison.repositoryRoot);
  });

  test('fails closed before binding and uses the actual loopback authority after a real bind', async () => {
    const app = createSessionApp(comparison, { sessionToken: token } as never) as SecurityAwareApp;
    apps.add(app);

    const beforeBind = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: authorizedHeaders(),
    });
    expectGenericSecurityDenial(beforeBind);

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    const host = `127.0.0.1:${address.port}`;
    app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });

    const response = await fetch(`http://${host}/api/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.url).not.toContain(token);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(JSON.stringify(await response.json())).not.toContain(token);
  });
});
