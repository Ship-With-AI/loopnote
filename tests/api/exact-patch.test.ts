import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { GroundedExactPatch } from '../../src/contracts/comparison.js';
import { createExactPatchSessionApp } from '../../src/server/app.js';
import { ExportReviewResultSchema } from '../../src/contracts/api.js';
import { ReviewExportV3Schema } from '../../src/contracts/draft.js';
import { createAttachedCompletionCoordinator } from '../../src/server/attached-completion.js';
import { createGroundedExactPatch } from '../../src/git/exact-patch.js';
import { createGitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 'p'.repeat(43);
const host = '127.0.0.1:43130';
const headers = {
  host,
  origin: `http://${host}`,
  authorization: `Bearer ${token}`,
};
const fileId = `file_${'p'.repeat(43)}`;
const unknownFileId = `file_${'z'.repeat(43)}`;
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

function path(value: string) {
  return {
    bytesBase64url: Buffer.from(value).toString('base64url'),
    display: value,
    utf8: value,
  } as const;
}

function grounded(
  repositoryRoot = '/private/repository/never-on-the-wire',
  target: 'repository' | 'worktree' = 'repository',
): GroundedExactPatch {
  const before = Buffer.from('before\n');
  const after = Buffer.from('after\n');
  return Object.freeze({
    repositoryRoot,
    objectFormat: 'sha1' as const,
    scope: Object.freeze({
      kind: 'exact-patch' as const,
      digest: 'a'.repeat(64),
      validationTarget: Object.freeze({ kind: target }),
      submittedByteLength: 42,
    }),
    changedFiles: Object.freeze([
      Object.freeze({
        id: fileId,
        status: Object.freeze({ code: 'R', kind: 'renamed' as const, similarity: 100 }),
        oldMode: '100644',
        newMode: '100755',
        oldBlobOid: '1'.repeat(40),
        newBlobOid: '2'.repeat(40),
        oldPath: path('old-name.ts'),
        newPath: path('new-name.ts'),
        additions: 1,
        deletions: 1,
        availability: Object.freeze({ kind: 'text' as const }),
      }),
      Object.freeze({
        id: `file_${'q'.repeat(43)}`,
        status: Object.freeze({ code: 'A', kind: 'added' as const, similarity: null }),
        oldMode: '000000',
        newMode: '100644',
        oldBlobOid: '0'.repeat(40),
        newBlobOid: '3'.repeat(40),
        newPath: path('binary.bin'),
        additions: 0,
        deletions: 0,
        availability: Object.freeze({ kind: 'unsupported' as const, reason: 'binary' as const }),
      }),
    ]),
    contents: new Map<string, GroundedExactPatch['contents'] extends ReadonlyMap<string, infer Content> ? Content : never>([
      [fileId, Object.freeze({ preimage: before, postimage: after })],
      [`file_${'q'.repeat(43)}`, Object.freeze({ preimage: undefined, postimage: Buffer.from([0]) })],
    ]),
  });
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-exact-patch-`));
  roots.push(value);
  return value;
}

async function buildApp(drifted = false) {
  const repositoryRoot = await root();
  const app = await createExactPatchSessionApp(grounded(repositoryRoot), {
    sessionToken: token,
    snapshotParent: repositoryRoot,
    observePatchTarget: async () => drifted,
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return app;
}

async function buildProductionApp() {
  const repositoryRoot = await root();
  await writeFile(join(repositoryRoot, 'new-name.ts'), 'after\n');
  await chmod(join(repositoryRoot, 'new-name.ts'), 0o755);
  await writeFile(join(repositoryRoot, 'binary.bin'), Buffer.from([0]));
  const app = await createExactPatchSessionApp(grounded(repositoryRoot, 'worktree'), {
    sessionToken: token,
    snapshotParent: repositoryRoot,
  });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return { app, repositoryRoot };
}

async function setSummary(app: FastifyInstance, markdown = 'Frozen feedback.') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/draft/mutations',
    headers,
    payload: { type: 'setSummary', expectedRevision: 0, markdown },
  });
  expect(response.statusCode).toBe(200);
}

async function exportReview(app: FastifyInstance) {
  return await app.inject({
    method: 'POST',
    url: '/api/export',
    headers,
    payload: { expectedRevision: 1 },
  });
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (value) => rm(value, { recursive: true, force: true })));
});

describe('exact patch snapshot sessions', () => {
  test('finishes canonical V3 delivery for real added and deleted patch files', async () => {
    const fixture = await createGitFixture({ anchoredReview: true });
    try {
      const content = fixture.git(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--full-index', fixture.baseRef, fixture.headRef]).toString('utf8');
      const patch = await createGroundedExactPatch({ cwd: fixture.root, patchContent: content, target: { kind: 'repository' } });
      const delivered: Uint8Array[] = [];
      const app = await createExactPatchSessionApp(patch, {
        sessionToken: token,
        snapshotParent: fixture.root,
        attachedCompletion: {
          coordinator: createAttachedCompletionCoordinator(),
          storageScope: `agent-${'c'.repeat(32)}`,
          deliver: async (bytes) => { delivered.push(bytes); return true; },
        },
      });
      try {
        app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
        await setSummary(app);
        expect(delivered).toEqual([]);
        const response = await app.inject({ method: 'POST', url: '/api/review-completion/finish', headers, payload: { expectedRevision: 1 } });
        expect(response.statusCode, response.body).toBe(201);
        expect(delivered).toHaveLength(1);
        const document = ReviewExportV3Schema.parse(JSON.parse(Buffer.from(delivered[0]!).toString('utf8')));
        expect(document.patch.snapshot.files.map((file) => file.status.kind)).toEqual(expect.arrayContaining(['added', 'deleted']));
        expect(document.patch.snapshot.files.find((file) => file.status.kind === 'added')).not.toHaveProperty('oldPath');
        expect(document.patch.snapshot.files.find((file) => file.status.kind === 'deleted')).not.toHaveProperty('newPath');
      } finally {
        await app.close();
      }
    } finally {
      await fixture.cleanup();
    }
  });

  test('serves a strict patch-only frozen session and content across reload-like reads', async () => {
    const repositoryRoot = await root();
    const source = grounded(repositoryRoot);
    const app = await createExactPatchSessionApp(source, { sessionToken: token, snapshotParent: repositoryRoot });
    app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
    apps.add(app);
    source.contents.get(fileId)!.preimage!.fill(0x78);
    source.contents.get(fileId)!.postimage!.fill(0x79);

    const session = await app.inject({ method: 'GET', url: '/api/session', headers });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      patch: {
        kind: 'exact-patch',
        digest: 'a'.repeat(64),
        validationTarget: { kind: 'repository' },
        changedFileCount: 2,
      },
      files: [{ fileId }, { fileId: `file_${'q'.repeat(43)}` }],
    });
    expect(Object.keys(session.json() as object)).toEqual(['patch', 'files']);

    for (let index = 0; index < 2; index += 1) {
      const content = await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers });
      expect(content.statusCode).toBe(200);
      expect(content.json()).toMatchObject({
        fileId,
        base: { exists: true, text: 'before\n' },
        head: { exists: true, text: 'after\n' },
      });
    }
  });

  test('keeps equivalent attached patch drafts and exports separate while preserving the patch review key', async () => {
    const repositoryRoot = await root();
    const firstScope = `agent-${'c'.repeat(32)}`;
    const secondScope = `agent-${'d'.repeat(32)}`;
    await writeFile(join(repositoryRoot, 'new-name.ts'), 'after\n');
    await chmod(join(repositoryRoot, 'new-name.ts'), 0o755);
    await writeFile(join(repositoryRoot, 'binary.bin'), Buffer.from([0]));
    const createAttachedApp = async (storageScope: string) => {
      const app = await createExactPatchSessionApp(grounded(repositoryRoot, 'worktree'), {
        sessionToken: token,
        snapshotParent: repositoryRoot,
        attachedCompletion: {
          coordinator: createAttachedCompletionCoordinator(),
          storageScope,
          deliver: async () => true,
        },
      });
      app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
      apps.add(app);
      return app;
    };
    const first = await createAttachedApp(firstScope);
    const second = await createAttachedApp(secondScope);
    const firstReviewKey = (await first.inject({ method: 'GET', url: '/api/session', headers })).json().patch.reviewKey;
    const secondReviewKey = (await second.inject({ method: 'GET', url: '/api/session', headers })).json().patch.reviewKey;
    expect(firstReviewKey).toBe(secondReviewKey);

    expect((await first.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${firstScope}.json`,
    });
    await setSummary(first, 'First patch.');
    const firstExport = await exportReview(first);
    expect(firstExport.statusCode).toBe(201);
    const firstReceipt = ExportReviewResultSchema.parse(firstExport.json());
    expect(firstReceipt).toMatchObject({
      kind: 'exported',
      patch: { reviewKey: firstReviewKey },
    });
    if (firstReceipt.kind !== 'exported') throw new Error('Expected an exact patch export receipt.');
    expect(firstReceipt.files.map((file) => file.path)).toEqual([
      `${RENAME_MAP.repoStateDir}exports/${firstScope}/review.json`,
      `${RENAME_MAP.repoStateDir}exports/${firstScope}/review.md`,
    ]);
    expect((await second.inject({ method: 'GET', url: '/api/draft', headers })).json()).toMatchObject({
      kind: 'missing',
      path: `${RENAME_MAP.repoStateDir}drafts/${secondScope}.json`,
    });
    await expect(readFile(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts', `${secondScope}.json`))).rejects.toMatchObject({ code: 'ENOENT' });
    await first.close();
    apps.delete(first);
    expect((await second.inject({ method: 'GET', url: '/api/session', headers })).json()).toMatchObject({
      patch: { reviewKey: firstReviewKey },
    });
  });

  test('latches drift while frozen content and draft mutations remain available', async () => {
    const app = await buildApp(true);
    const status = await app.inject({ method: 'GET', url: '/api/patch-status', headers });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ kind: 'drifted', validationTargetLabel: 'Repository content' });
    expect((await app.inject({ method: 'GET', url: '/api/patch-status', headers })).json()).toEqual(status.json());
    expect((await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/api/draft/mutations',
      headers,
      payload: { type: 'setSummary', expectedRevision: 0, markdown: 'Frozen feedback.' },
    })).statusCode).toBe(200);
  });

  test('observes production worktree bytes, modes, and path presence without browser authority', async () => {
    const mutations = [
      async (repositoryRoot: string) => writeFile(join(repositoryRoot, 'new-name.ts'), 'changed\n'),
      async (repositoryRoot: string) => chmod(join(repositoryRoot, 'new-name.ts'), 0o644),
      async (repositoryRoot: string) => rm(join(repositoryRoot, 'new-name.ts')),
      async (repositoryRoot: string) => writeFile(join(repositoryRoot, 'old-name.ts'), 'before\n'),
    ];

    for (const mutate of mutations) {
      const { app, repositoryRoot } = await buildProductionApp();
      expect((await app.inject({ method: 'GET', url: '/api/patch-status', headers })).json()).toEqual({
        kind: 'unchanged',
        validationTargetLabel: 'Worktree',
      });
      await mutate(repositoryRoot);
      expect((await app.inject({ method: 'GET', url: '/api/patch-status', headers })).json()).toEqual({
        kind: 'drifted',
        validationTargetLabel: 'Worktree',
      });
    }
  });

  test('publishes an exact V3 export from the accepted draft and frozen snapshot', async () => {
    const { app, repositoryRoot } = await buildProductionApp();
    await setSummary(app);

    const response = await exportReview(app);
    expect(response.statusCode).toBe(201);
    const receipt = ExportReviewResultSchema.parse(response.json());
    expect(receipt).toMatchObject({
      kind: 'exported',
      draftRevision: 1,
      patch: {
        digest: 'a'.repeat(64),
        validationTarget: { kind: 'worktree' },
        snapshot: { status: 'unchanged' },
      },
    });
    expect(receipt).not.toHaveProperty('comparison');
    if (receipt.kind !== 'exported' || !('patch' in receipt)) throw new Error('Expected an exact patch export receipt.');
    const reviewKey = receipt.patch.reviewKey;
    const document = ReviewExportV3Schema.parse(
      JSON.parse(await readFile(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', reviewKey, 'review.json'), 'utf8')),
    );
    expect(document).toMatchObject({
      schemaVersion: 3,
      acceptedDraftRevision: 1,
      summary: { markdown: 'Frozen feedback.' },
      patch: {
        digest: 'a'.repeat(64),
        validationTarget: { kind: 'worktree' },
        reviewKey,
        snapshot: { status: 'unchanged' },
      },
    });
    expect(document.patch.snapshot.files.find((file) => file.id === fileId)).toMatchObject({
      id: fileId,
      newMode: '100755',
    });
  });

  test('exports frozen snapshot provenance after production target drift', async () => {
    const { app, repositoryRoot } = await buildProductionApp();
    await setSummary(app);
    await writeFile(join(repositoryRoot, 'new-name.ts'), 'live target changed\n');

    const response = await exportReview(app);
    expect(response.statusCode).toBe(201);
    const receipt = ExportReviewResultSchema.parse(response.json());
    expect(receipt).toMatchObject({
      kind: 'exported',
      patch: { snapshot: { status: 'drifted' } },
    });
    if (receipt.kind !== 'exported' || !('patch' in receipt)) throw new Error('Expected an exact patch export receipt.');
    const document = ReviewExportV3Schema.parse(
      JSON.parse(await readFile(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', receipt.patch.reviewKey, 'review.json'), 'utf8')),
    );
    expect(document.patch.snapshot.status).toBe('drifted');
    expect(document.patch.snapshot.files.map((file) => file.id)).toContain(fileId);
    expect(JSON.stringify(document)).not.toContain('live target changed');
  });

  test('latches snapshot loss and blocks content and export without live fallback', async () => {
    const { app, repositoryRoot } = await buildProductionApp();
    await setSummary(app);
    const snapshotRoot = (await readdir(repositoryRoot)).find((name) => name.startsWith(`${RENAME_MAP.slug}-patch-`));
    expect(snapshotRoot).toBeDefined();
    await rm(join(repositoryRoot, snapshotRoot!), { recursive: true, force: true });

    expect((await app.inject({ method: 'GET', url: '/api/patch-status', headers })).json()).toEqual({ kind: 'snapshotUnavailable' });
    expect((await app.inject({ method: 'GET', url: `/api/files/${fileId}/content`, headers })).statusCode).toBe(500);
    expect((await exportReview(app)).statusCode).toBe(500);
  });

  test('strictly parses the manifest and permanently latches corruption before every capability use', async () => {
    const { app, repositoryRoot } = await buildProductionApp();
    await setSummary(app);
    const snapshotRoot = (await readdir(repositoryRoot)).find((name) => name.startsWith(`${RENAME_MAP.slug}-patch-`));
    expect(snapshotRoot).toBeDefined();
    const manifestPath = join(repositoryRoot, snapshotRoot!, 'manifest.json');
    const original = await readFile(manifestPath);
    await chmod(manifestPath, 0o600);
    await writeFile(manifestPath, '{"version":1,"unexpected":true}');

    expect((await app.inject({ method: 'GET', url: '/api/session', headers })).statusCode).toBe(500);
    await writeFile(manifestPath, original);
    await chmod(manifestPath, 0o400);
    expect((await app.inject({ method: 'GET', url: '/api/patch-status', headers })).json()).toEqual({ kind: 'snapshotUnavailable' });
    expect((await app.inject({ method: 'GET', url: `/api/files/${fileId}`, headers })).statusCode).toBe(500);
    expect((await exportReview(app)).statusCode).toBe(500);
  });

  test('keeps snapshot capabilities session-local and rejects unauthenticated file and status access', async () => {
    const first = await buildApp();
    const second = await buildApp();
    expect((await first.inject({ method: 'GET', url: `/api/files/${unknownFileId}/content`, headers })).statusCode).toBe(404);
    expect((await second.inject({ method: 'GET', url: `/api/files/${unknownFileId}/content`, headers })).statusCode).toBe(404);
    expect([401, 403]).toContain((await first.inject({ method: 'GET', url: `/api/files/${fileId}/content` })).statusCode);
    expect([401, 403]).toContain((await first.inject({ method: 'GET', url: '/api/patch-status' })).statusCode);
  });
});
