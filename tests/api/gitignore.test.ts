import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { appendLoopnoteIgnoreRule } from '../../src/server/gitignore-capability.js';
import { createSessionApp } from '../../src/server/app.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const token = 'a'.repeat(43);
const host = '127.0.0.1:43131';
const headers = { host, origin: `http://${host}`, authorization: `Bearer ${token}` };
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

async function createRepository(): Promise<string> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'loopnote-gitignore-api-'));
  roots.push(repositoryRoot);
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: repositoryRoot, stdio: 'ignore' });
  return repositoryRoot;
}

async function buildApp() {
  const repositoryRoot = await createRepository();
  const app = createSessionApp({
    repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'base', oid: '1'.repeat(40) },
    head: { label: 'head', oid: '2'.repeat(40) },
    mergeBaseOid: '3'.repeat(40),
    changedFiles: [],
    hasCommittedChanges: false,
  }, { sessionToken: token });
  app.bindSessionSecurity({ expectedHost: host, expectedOrigin: `http://${host}` });
  apps.add(app);
  return { app, repositoryRoot };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('fixed append-only gitignore capability', () => {
  it('rejects token, host, origin, method, body, and unknown-field authority before mutation', async () => {
    const { app, repositoryRoot } = await buildApp();
    const ignorePath = join(repositoryRoot, '.gitignore');
    const original = Buffer.from('# keep every byte\r\n');
    await writeFile(ignorePath, original);

    for (const request of [
      { method: 'POST' as const, url: '/api/export/gitignore', headers: { ...headers, authorization: `Bearer ${'z'.repeat(43)}` }, payload: undefined },
      { method: 'POST' as const, url: '/api/export/gitignore', headers: { ...headers, host: 'localhost:43131' }, payload: undefined },
      { method: 'POST' as const, url: '/api/export/gitignore', headers: { ...headers, origin: 'http://localhost:43131' }, payload: undefined },
      { method: 'PUT' as const, url: '/api/export/gitignore', headers, payload: undefined },
      { method: 'POST' as const, url: '/api/export/gitignore', headers, payload: {} },
      { method: 'POST' as const, url: '/api/export/gitignore?path=/tmp/evil', headers, payload: undefined },
      { method: 'POST' as const, url: '/api/export/gitignore', headers, payload: { path: '/tmp/evil' } },
    ]) {
      const response = await app.inject(request);
      expect([400, 401, 403, 404]).toContain(response.statusCode);
      expect(await readFile(ignorePath)).toEqual(original);
    }
  });

  it('reports effective status and appends the one fixed rule only through an empty explicit request', async () => {
    const { app, repositoryRoot } = await buildApp();

    const before = await app.inject({ method: 'GET', url: '/api/export/gitignore', headers });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ kind: 'notIgnored' });

    const appended = await app.inject({ method: 'POST', url: '/api/export/gitignore', headers });
    expect(appended.statusCode).toBe(200);
    expect(appended.json()).toEqual({ kind: 'appended' });
    expect(await readFile(join(repositoryRoot, '.gitignore'))).toEqual(Buffer.from(`/${RENAME_MAP.repoStateDir}\n`));

    const after = await app.inject({ method: 'GET', url: '/api/export/gitignore', headers });
    expect(after.json()).toEqual({ kind: 'ignored' });
  });

  it('preserves every original byte as a prefix across missing, empty, LF, non-LF, and non-UTF-8 files', async () => {
    const cases: Array<Buffer | undefined> = [
      undefined,
      Buffer.alloc(0),
      Buffer.from('# LF\n'),
      Buffer.from('# no final newline'),
      Buffer.from([0xff, 0x00, 0x0a]),
    ];

    for (const original of cases) {
      const repositoryRoot = await createRepository();
      const ignorePath = join(repositoryRoot, '.gitignore');
      if (original !== undefined) {
        await writeFile(ignorePath, original);
      }

      const result = await appendLoopnoteIgnoreRule({ repositoryRoot });
      const expected = Buffer.concat([
        original ?? Buffer.alloc(0),
        original === undefined || original.byteLength === 0 || original.at(-1) === 0x0a
          ? Buffer.from(`/${RENAME_MAP.repoStateDir}\n`)
          : Buffer.from(`\n/${RENAME_MAP.repoStateDir}\n`),
      ]);

      expect(result).toEqual({ kind: 'appended' });
      expect(await readFile(ignorePath)).toEqual(expected);
      expect((await lstat(ignorePath)).isSymbolicLink()).toBe(false);
    }
  });

  it('does not modify already-effective, symlink, or externally changed targets', async () => {
    const alreadyIgnored = await createRepository();
    await writeFile(join(alreadyIgnored, '.git', 'info', 'exclude'), `/${RENAME_MAP.repoStateDir}\n`);
    await expect(appendLoopnoteIgnoreRule({ repositoryRoot: alreadyIgnored })).resolves.toEqual({ kind: 'alreadyIgnored' });
    await expect(lstat(join(alreadyIgnored, '.gitignore'))).rejects.toMatchObject({ code: 'ENOENT' });

    const symlinkRoot = await createRepository();
    const target = join(symlinkRoot, 'ignore-target');
    const targetBytes = Buffer.from('target bytes\n');
    await writeFile(target, targetBytes);
    await symlink(target, join(symlinkRoot, '.gitignore'));
    await expect(appendLoopnoteIgnoreRule({ repositoryRoot: symlinkRoot })).resolves.toEqual({ kind: 'unconfirmed' });
    expect(await readFile(target)).toEqual(targetBytes);

    const directoryRoot = await createRepository();
    const directoryPath = join(directoryRoot, '.gitignore');
    await mkdir(directoryPath);
    await expect(appendLoopnoteIgnoreRule({ repositoryRoot: directoryRoot })).resolves.toEqual({ kind: 'unconfirmed' });
    expect((await lstat(directoryPath)).isDirectory()).toBe(true);

    const concurrentRoot = await createRepository();
    const concurrentPath = join(concurrentRoot, '.gitignore');
    await writeFile(concurrentPath, Buffer.from('# initial\n'));
    await expect(
      appendLoopnoteIgnoreRule(
        { repositoryRoot: concurrentRoot },
        { beforeAppend: async () => writeFile(concurrentPath, Buffer.from('# external\n')) },
      ),
    ).resolves.toEqual({ kind: 'unconfirmed' });
    expect(await readFile(concurrentPath)).toEqual(Buffer.from('# external\n'));
  });
  it('classifies partial-write, sync, and close failures by the reread target bytes', async () => {
    const original = Buffer.from('# keep\n');
    const rule = Buffer.from(`/${RENAME_MAP.repoStateDir}\n`);
    const cases = [
      {
        inject: {
          writeAddition: async (handle: FileHandle, addition: Buffer) => {
            await handle.write(addition.subarray(0, 4));
            throw new Error('partial write');
          },
        },
        expected: { kind: 'ambiguous' },
        bytes: Buffer.concat([original, rule.subarray(0, 4)]),
      },
      {
        inject: { sync: async () => { throw new Error('sync failure'); } },
        expected: { kind: 'appendUnconfirmed' },
        bytes: Buffer.concat([original, rule]),
      },
      {
        inject: {
          close: async (handle: FileHandle) => {
            await handle.close();
            throw new Error('close failure');
          },
        },
        expected: { kind: 'appendUnconfirmed' },
        bytes: Buffer.concat([original, rule]),
      },
    ];

    for (const testCase of cases) {
      const repositoryRoot = await createRepository();
      const ignorePath = join(repositoryRoot, '.gitignore');
      await writeFile(ignorePath, original);
      await expect(
        appendLoopnoteIgnoreRule({ repositoryRoot }, testCase.inject),
      ).resolves.toEqual(testCase.expected);
      expect(await readFile(ignorePath)).toEqual(testCase.bytes);
    }
  });
});
