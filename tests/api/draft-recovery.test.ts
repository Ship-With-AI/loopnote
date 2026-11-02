import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import { comparisonKey } from '../../src/domain/comparison-key.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createSessionApp } from '../../src/server/app.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43129';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const fileId = `file_${'a'.repeat(43)}`;
const roots: string[] = [];
const apps = new Set<FastifyInstance>();

function comparison(repositoryRoot: string) {
  return {
    repositoryRoot,
    objectFormat: 'sha1' as const,
    base: { label: 'base', oid: '1'.repeat(40) },
    head: { label: 'head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [{
      id: fileId,
      status: { code: 'M' as const, kind: 'modified' as const, similarity: null },
      oldMode: '100644' as const,
      newMode: '100644' as const,
      oldBlobOid: '4'.repeat(40),
      newBlobOid: '5'.repeat(40),
      oldPath: { utf8: 'src/review.ts', display: 'src/review.ts', bytesBase64url: 'c3JjL3Jldmlldy50cw' },
      newPath: { utf8: 'src/review.ts', display: 'src/review.ts', bytesBase64url: 'c3JjL3Jldmlldy50cw' },
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' as const },
    }],
    hasCommittedChanges: true,
  };
}

async function buildApp(repositoryRoot: string) {
  const app = createSessionApp(comparison(repositoryRoot), {
    sessionToken: token,
    objectReader: {
      inspect: async () => ({ kind: 'available' as const, objectType: 'blob', size: Buffer.byteLength('after\n') }),
      read: async () => ({ kind: 'available' as const, bytes: Buffer.from('after\n', 'utf8') }),
    },
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return app;
}

async function corruptDraft(bytes: Buffer): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-draft-recovery-`));
  roots.push(root);
  const directory = join(root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
  const path = join(directory, `${comparisonKey('1'.repeat(40), '2'.repeat(40))}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, bytes);
  return { root, path };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('corrupt draft recovery API', () => {
  test('reports corrupt bytes without exposing them and locks every mutation before a write', async () => {
    const bytes = Buffer.from('{"schemaVersion":1,\xff', 'binary');
    const { root, path } = await corruptDraft(bytes);
    const app = await buildApp(root);

    const loaded = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json()).toMatchObject({
      kind: 'malformed',
      path: `${RENAME_MAP.repoStateDir}drafts/` + comparisonKey('1'.repeat(40), '2'.repeat(40)) + '.json',
      fingerprint: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(JSON.stringify(loaded.json())).not.toContain(bytes.toString('utf8'));
    expect(JSON.stringify(loaded.json())).not.toContain(root);

    const mutations = [
      { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'No write.' },
      { type: 'editComment', expectedRevision: 0, commentId: 'comment_00000000-0000-4000-8000-000000000000', body: 'No write.' },
      { type: 'deleteComment', expectedRevision: 0, commentId: 'comment_00000000-0000-4000-8000-000000000000' },
      { type: 'resolveComment', expectedRevision: 0, commentId: 'comment_00000000-0000-4000-8000-000000000000' },
      { type: 'reopenComment', expectedRevision: 0, commentId: 'comment_00000000-0000-4000-8000-000000000000' },
      { type: 'setSummary', expectedRevision: 0, markdown: 'No write.' },
    ];
    for (const payload of mutations) {
      const response = await app.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ kind: 'readOnly', load: { kind: 'malformed' } });
      expect(await readFile(path)).toEqual(bytes);
    }
  });

  test('backs up byte-identical corrupt data before atomically creating an empty draft', async () => {
    const bytes = Buffer.from('{\n  "schemaVersion": 1,\n  "invalid": true\n}\n', 'utf8');
    const { root, path } = await corruptDraft(bytes);
    const app = await buildApp(root);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');

    const recovered = await app.inject({
      method: 'POST',
      url: '/api/draft/recovery',
      headers,
      payload: { expectedFingerprint: fingerprint },
    });
    expect(recovered.statusCode).toBe(201);
    expect(recovered.json()).toMatchObject({
      kind: 'recovered',
      backupPath: `${RENAME_MAP.repoStateDir}drafts/` + comparisonKey('1'.repeat(40), '2'.repeat(40)) + `.corrupt.${fingerprint}.bak`,
      draft: { schemaVersion: 1, revision: 0, summary: '', comments: [] },
    });
    const backup = join(root, recovered.json().backupPath);
    expect(await readFile(backup)).toEqual(bytes);
    expect(createHash('sha256').update(await readFile(backup)).digest('hex')).toBe(fingerprint);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ revision: 0, summary: '', comments: [] });
  });

  test('rejects stale recovery fingerprints and newer schemas without writing', async () => {
    const bytes = Buffer.from('{"schemaVersion": 1, "invalid": true}', 'utf8');
    const { root, path } = await corruptDraft(bytes);
    const app = await buildApp(root);
    const stale = await app.inject({
      method: 'POST',
      url: '/api/draft/recovery',
      headers,
      payload: { expectedFingerprint: 'f'.repeat(64) },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ kind: 'fingerprintChanged' });
    expect(await readFile(path)).toEqual(bytes);

    const newer = Buffer.from('{"schemaVersion": 2, "preserve": true}', 'utf8');
    await writeFile(path, newer);
    const loaded = await app.inject({ method: 'GET', url: '/api/draft', headers });
    expect(loaded.json()).toMatchObject({ kind: 'newerUnsupported', foundVersion: 2, supportedVersion: 1 });
    const recovery = await app.inject({
      method: 'POST',
      url: '/api/draft/recovery',
      headers,
      payload: { expectedFingerprint: createHash('sha256').update(newer).digest('hex') },
    });
    expect(recovery.statusCode).toBe(409);
    expect(recovery.json()).toMatchObject({ kind: 'recoveryUnavailable', load: { kind: 'newerUnsupported' } });
    expect(await readFile(path)).toEqual(newer);
  });
});
