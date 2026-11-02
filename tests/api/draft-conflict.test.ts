import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { PinnedComparison } from '../../src/contracts/comparison.js';
import { comparisonKey } from '../../src/domain/comparison-key.js';
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

async function app(): Promise<{ readonly app: FastifyInstance; readonly repositoryRoot: string }> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-conflict-`));
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
  return { app: value, repositoryRoot };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (value) => value.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('aggregate draft revision conflicts', () => {
  test('lets one same-revision operation win and preserves raw bytes for the stale operation', async () => {
    const { app: value, repositoryRoot } = await app();
    const added = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'addComment', expectedRevision: 0, fileId, side: 'head', line: 1, body: 'First.' } });
    expect(added.statusCode).toBe(201);
    const commentId = added.json().draft.comments[0].id as string;

    const [edit, summary] = await Promise.all([
      value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'editComment', expectedRevision: 1, commentId, body: 'Edited.' } }),
      value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'setSummary', expectedRevision: 1, markdown: '# Summary' } }),
    ]);
    expect([edit.statusCode, summary.statusCode].sort()).toEqual([200, 409]);

    const directory = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
    const canonicalPath = join(directory, `${comparisonKey('1'.repeat(40), '2'.repeat(40))}.json`);
    const before = await readFile(canonicalPath);
    const beforeHash = createHash('sha256').update(before).digest('hex');
    const beforeStat = await stat(canonicalPath);
    const beforeEntries = await readdir(directory);

    const stale = await value.inject({ method: 'POST', url: '/api/draft/mutations', headers, payload: { type: 'setSummary', expectedRevision: 1, markdown: 'Stale summary' } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ kind: 'revisionConflict', expectedRevision: 1, actualRevision: 2, latest: JSON.parse(before.toString('utf8')) });

    const after = await readFile(canonicalPath);
    expect(after.equals(before)).toBe(true);
    expect(createHash('sha256').update(after).digest('hex')).toBe(beforeHash);
    expect((await stat(canonicalPath)).mtimeMs).toBe(beforeStat.mtimeMs);
    expect(await readdir(directory)).toEqual(beforeEntries);
  });
});
