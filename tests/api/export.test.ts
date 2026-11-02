import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createSessionApp } from '../../src/server/app.js';
import { ExportReviewResultSchema } from '../../src/contracts/api.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43130';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

async function buildApp(range?: {
  readonly kind: 'revisions';
  readonly requestedBase: string;
  readonly requestedHead: string;
  readonly baseOid: string;
  readonly headOid: string;
  readonly pathspecs: readonly string[];
  readonly reviewKey: string;
}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-api-`));
  roots.push(repositoryRoot);
  const revealDraftFile = vi.fn(async () => undefined);
  const app = createSessionApp({
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'base', oid: '1'.repeat(40) },
    head: { label: 'head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [{
      id: `file_${'b'.repeat(43)}`,
      status: { code: 'M', kind: 'modified', similarity: null },
      oldMode: '100644',
      newMode: '100644',
      oldBlobOid: '4'.repeat(40),
      newBlobOid: '5'.repeat(40),
      oldPath: { utf8: 'review.ts', display: 'review.ts', bytesBase64url: Buffer.from('review.ts').toString('base64url') },
      newPath: { utf8: 'review.ts', display: 'review.ts', bytesBase64url: Buffer.from('review.ts').toString('base64url') },
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    }],
    hasCommittedChanges: true,
    ...(range === undefined ? {} : { range }),
  }, {
    sessionToken: token,
    revealDraftFile,
    objectReader: {
      inspect: async () => ({ kind: 'available' as const, objectType: 'blob' as const, size: 11 }),
      read: async () => ({ kind: 'available' as const, bytes: Buffer.from('review line\n') }),
    },
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return { app, repositoryRoot, revealDraftFile };
}

async function writeCompleteExport(repositoryRoot: string): Promise<void> {
  const directory = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${'1'.repeat(40)}..${'2'.repeat(40)}`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'review.json'), '{}');
  await writeFile(join(directory, 'review.md'), 'review\n');
}

function exportedReceipt(files: readonly Readonly<{ readonly path: string; readonly sha256: string; readonly bytes: number }>[]) {
  return {
    kind: 'exported',
    draftRevision: 1,
    exportedAt: '2026-07-23T12:34:56.000Z',
    drift: { kind: 'noneObserved' },
    comparison: {
      base: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
      head: { label: 'head', selectorType: 'branch', oid: '2'.repeat(40) },
    },
    files: files.map((file) => ({ algorithm: 'sha256', ...file })),
  };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('secured export and fixed export-directory reveal APIs', () => {
  test('refuses invalid export authority before any reveal-capability invocation', async () => {
    const { app, revealDraftFile } = await buildApp();
    for (const deniedHeaders of [
      { ...headers, authorization: `Bearer ${'z'.repeat(43)}` },
      { ...headers, host: 'localhost:43130' },
      { ...headers, origin: 'http://localhost:43130' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/export/reveal', headers: deniedHeaders });
      expect([401, 403]).toContain(response.statusCode);

      expect(revealDraftFile).not.toHaveBeenCalled();
    }
  });

  test('exports one accepted revision only after server-side snapshot validation and returns final bounded receipts', async () => {
    const { app, repositoryRoot } = await buildApp();
    const draft = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: {
        type: 'addComment',
        expectedRevision: 0,
        fileId: `file_${'b'.repeat(43)}`,
        side: 'head',
        line: 1,
        body: 'Keep this exact line.',
      },
    });
    expect(draft.statusCode).toBe(201);

    const response = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers,
      payload: { expectedRevision: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      kind: 'exported',
      draftRevision: 1,
      comparison: {
        base: { label: 'base', oid: '1'.repeat(40) },
        head: { label: 'head', oid: '2'.repeat(40) },
      },
      files: [
        { path: `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}/review.json` },
        { path: `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}/review.md` },
      ],
    });
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
  });

  test('exports frozen range provenance and publishes through its scoped review key', async () => {
    const reviewKey = 'a'.repeat(64);
    const { app, repositoryRoot } = await buildApp({
      kind: 'revisions',
      requestedBase: 'agent/base',
      requestedHead: 'agent/head',
      baseOid: '1'.repeat(40),
      headOid: '2'.repeat(40),
      pathspecs: ['src', ':(exclude)src/generated'],
      reviewKey,
    });
    const draft = await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: {
        type: 'addComment',
        expectedRevision: 0,
        fileId: `file_${'b'.repeat(43)}`,
        side: 'head',
        line: 1,
        body: 'Keep this exact line.',
      },
    });
    expect(draft.statusCode).toBe(201);

    const response = await app.inject({
      method: 'POST',
      url: '/api/export',
      headers,
      payload: { expectedRevision: 1 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      comparison: {
        base: { oid: '1'.repeat(40) },
        head: { oid: '2'.repeat(40) },
      },
      files: [
        { path: `${RENAME_MAP.repoStateDir}exports/${reviewKey}/review.json` },
        { path: `${RENAME_MAP.repoStateDir}exports/${reviewKey}/review.md` },
      ],
    });
    expect(JSON.parse(await readFile(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', reviewKey, 'review.json'), 'utf8'))).toMatchObject({
      schemaVersion: 2,
      range: {
        requestedBase: 'agent/base',
        requestedHead: 'agent/head',
        baseOid: '1'.repeat(40),
        headOid: '2'.repeat(40),
        pathspecs: ['src', ':(exclude)src/generated'],
        reviewKey,
      },
    });
  });

  test('rejects export replacement authority and fixed reveal body, query, and wrong methods', async () => {
    const { app, repositoryRoot, revealDraftFile } = await buildApp();
    await writeCompleteExport(repositoryRoot);
    for (const request of [
      { method: 'POST' as const, url: '/api/export', payload: { expectedRevision: 0, path: '/tmp/evil' } },
      { method: 'POST' as const, url: '/api/export', payload: { expectedRevision: 0, content: 'evil' } },
      { method: 'POST' as const, url: '/api/export/reveal?path=/tmp/evil', payload: undefined },
      { method: 'POST' as const, url: '/api/export/reveal', payload: { path: '/tmp/evil' } },
      { method: 'GET' as const, url: '/api/export/reveal', payload: undefined },
    ]) {
      const response = await app.inject({ method: request.method, url: request.url, headers, payload: request.payload });
      expect([400, 404]).toContain(response.statusCode);
      expect(revealDraftFile).not.toHaveBeenCalled();
    }
  });

  test('reveals only the complete full-launch-OID export directory without leaking its absolute path', async () => {
    const { app, repositoryRoot, revealDraftFile } = await buildApp();
    await writeCompleteExport(repositoryRoot);

    const response = await app.inject({ method: 'POST', url: '/api/export/reveal', headers });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ kind: 'revealed' });
    expect(revealDraftFile).toHaveBeenCalledWith(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${'1'.repeat(40)}..${'2'.repeat(40)}`));
    expect(JSON.stringify(response.json())).not.toContain(repositoryRoot);
  });

  test('rejects malformed confirmed receipts before API clients can mislabel the pair', () => {
    const firstDirectory = `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}`;
    const secondDirectory = `${RENAME_MAP.repoStateDir}exports/${'3'.repeat(40)}..${'4'.repeat(40)}`;
    const json = { path: `${firstDirectory}/review.json`, sha256: 'a'.repeat(64), bytes: 128 };
    const markdown = { path: `${firstDirectory}/review.md`, sha256: 'b'.repeat(64), bytes: 256 };

    expect(ExportReviewResultSchema.safeParse(exportedReceipt([json, markdown])).success).toBe(true);
    for (const files of [
      [markdown, json],
      [json, { ...json, sha256: 'c'.repeat(64) }],
      [json, { ...markdown, path: `${secondDirectory}/review.md` }],
    ]) {
      expect(ExportReviewResultSchema.safeParse(exportedReceipt(files)).success).toBe(false);
    }
  });

  test('accepts only server-confirmed receipt drift identities and the distinct recovery-required result', () => {
    const directory = `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}`;
    const receipt = exportedReceipt([
      { path: `${directory}/review.json`, sha256: 'a'.repeat(64), bytes: 128 },
      { path: `${directory}/review.md`, sha256: 'b'.repeat(64), bytes: 256 },
    ]);

    expect(ExportReviewResultSchema.safeParse({
      ...receipt,
      comparison: {
        ...receipt.comparison,
        head: { ...receipt.comparison.head, selectorType: 'worktree' },
      },
      drift: {
        kind: 'acknowledged',
        identities: [
          {
            role: 'base',
            pinned: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
            current: { kind: 'available', label: 'base', selectorType: 'branch', oid: '3'.repeat(40) },
          },
          {
            role: 'head',
            pinned: { label: 'head', selectorType: 'worktree', oid: '2'.repeat(40) },
            current: { kind: 'unavailable', label: 'head', selectorType: 'worktree', reason: 'source-unavailable' },
          },
        ],
      },
    }).success).toBe(true);
    expect(ExportReviewResultSchema.safeParse({ kind: 'recoveryRequired' }).success).toBe(true);
  });

  test('rejects acknowledged receipt drift that does not map one-to-one to the pinned comparison', () => {
    const directory = `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}`;
    const receipt = exportedReceipt([
      { path: `${directory}/review.json`, sha256: 'a'.repeat(64), bytes: 128 },
      { path: `${directory}/review.md`, sha256: 'b'.repeat(64), bytes: 256 },
    ]);
    const base = {
      role: 'base' as const,
      pinned: { label: 'base', selectorType: 'branch' as const, oid: '1'.repeat(40) },
      current: { kind: 'available' as const, label: 'base', selectorType: 'branch' as const, oid: '3'.repeat(40) },
    };
    const head = {
      role: 'head' as const,
      pinned: { label: 'head', selectorType: 'branch' as const, oid: '2'.repeat(40) },
      current: { kind: 'available' as const, label: 'head', selectorType: 'branch' as const, oid: '4'.repeat(40) },
    };
    const acknowledged = { kind: 'acknowledged' as const, identities: [base, head] as const };

    expect(ExportReviewResultSchema.safeParse({ ...receipt, drift: acknowledged }).success).toBe(true);
    expect(ExportReviewResultSchema.safeParse({
      ...receipt,
      drift: { ...acknowledged, identities: [base, { ...base, current: head.current }] },
    }).success).toBe(false);
    expect(ExportReviewResultSchema.safeParse({
      ...receipt,
      drift: { ...acknowledged, identities: [base, { ...head, pinned: { ...head.pinned, oid: '4'.repeat(40) } }] },
    }).success).toBe(false);
    expect(ExportReviewResultSchema.safeParse({
      ...receipt,
      drift: {
        ...acknowledged,
        identities: [
          { ...base, current: { ...base.current, oid: base.pinned.oid } },
          { ...head, current: { ...head.current, oid: head.pinned.oid } },
        ],
      },
    }).success).toBe(false);
  });

  test('requires server-confirmed pinned comparison identities on every receipt', () => {
    const directory = `${RENAME_MAP.repoStateDir}exports/${'1'.repeat(40)}..${'2'.repeat(40)}`;
    expect(ExportReviewResultSchema.safeParse({
      ...exportedReceipt([
        { path: `${directory}/review.json`, sha256: 'a'.repeat(64), bytes: 128 },
        { path: `${directory}/review.md`, sha256: 'b'.repeat(64), bytes: 256 },
      ]),
      comparison: {
        base: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
        head: { label: 'head', selectorType: 'worktree', oid: '2'.repeat(40) },
      },
    }).success).toBe(true);
  });

  test.each([RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'] as const)(
    'refuses reveal through an externally directed %s parent symlink',
    async (managedParent) => {
      const { app, repositoryRoot, revealDraftFile } = await buildApp();
      const outside = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-reveal-outside-`));
      roots.push(outside);
      const stableName = `${'1'.repeat(40)}..${'2'.repeat(40)}`;
      const outsideExportsRoot = managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '') ? join(outside, 'exports') : outside;
      const outsideStable = join(outsideExportsRoot, stableName);
      await mkdir(outsideStable, { recursive: true });
      await writeFile(join(outsideStable, 'review.json'), '{}');
      await writeFile(join(outsideStable, 'review.md'), 'review\n');
      if (managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '')) {
        await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')), 'dir');
      } else {
        await mkdir(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')));
        await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'), 'dir');
      }

      const response = await app.inject({ method: 'POST', url: '/api/export/reveal', headers });

      expect(response.statusCode).toBe(500);
      expect(revealDraftFile).not.toHaveBeenCalled();
    },
  );
});
