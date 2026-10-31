import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';

import type { GroundedExactPatch, PinnedComparison } from '../../src/contracts/comparison.js';
import type { ObjectReader } from '../../src/git/objects.js';
import type { GitRunner, GitRunResult } from '../../src/git/runner.js';
import { createExactPatchSessionApp, createSessionApp } from '../../src/server/app.js';
import {
  IMAGE_CONTENT_TYPE_BY_EXTENSION,
  MAX_IMAGE_BYTES,
  readCommittedImageBytes,
  readWorktreeImageBytes,
  resolveRelativeImagePath,
} from '../../src/server/image-content.js';

const token = 'i'.repeat(43);
const expectedHost = '127.0.0.1:43180';
const expectedOrigin = `http://${expectedHost}`;
const headers = { host: expectedHost, origin: expectedOrigin, authorization: `Bearer ${token}` };
const apps = new Set<FastifyInstance>();
const roots: string[] = [];

function markdownPath(value: string) {
  return {
    bytesBase64url: Buffer.from(value).toString('base64url'),
    display: value,
    utf8: value,
  } as const;
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'cumpa-image-content-'));
  roots.push(value);
  return value;
}

function stubRunner(result: GitRunResult | (() => GitRunResult)): GitRunner {
  return {
    async run() {
      return typeof result === 'function' ? result() : result;
    },
  };
}

function stubReader(reads: ReadonlyMap<string, Buffer>): ObjectReader {
  return {
    async inspect(oid: string) {
      const bytes = reads.get(oid);
      return bytes === undefined
        ? { kind: 'missing' as const }
        : { kind: 'available' as const, objectType: 'blob', size: bytes.byteLength };
    },
    async read(oid: string) {
      const bytes = reads.get(oid);
      return bytes === undefined ? { kind: 'missing' as const } : { kind: 'available' as const, bytes };
    },
  };
}

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
  await Promise.all(roots.splice(0).map(async (value) => rm(value, { recursive: true, force: true })));
});

describe('image-content: resolveRelativeImagePath', () => {
  test('joins a dot-relative src against the Markdown file\'s own directory', () => {
    expect(resolveRelativeImagePath('docs/readme.md', './assets/logo.png')).toBe('docs/assets/logo.png');
  });

  test('joins a bare-relative src against a sibling directory', () => {
    expect(resolveRelativeImagePath('docs/readme.md', '../shared/logo.png')).toBe('shared/logo.png');
  });

  test('rejects a src that escapes the repository root', () => {
    expect(resolveRelativeImagePath('readme.md', '../outside/x.png')).toBeUndefined();
  });

  test('rejects an absolute-path src', () => {
    expect(resolveRelativeImagePath('readme.md', '/etc/passwd')).toBeUndefined();
  });

  test('rejects an empty src', () => {
    expect(resolveRelativeImagePath('readme.md', '')).toBeUndefined();
  });

  test('rejects malformed percent-encoding', () => {
    expect(resolveRelativeImagePath('readme.md', '%')).toBeUndefined();
  });

  test('decodes URL-encoded segments before joining', () => {
    expect(resolveRelativeImagePath('docs/readme.md', './assets/logo%20final.png')).toBe('docs/assets/logo final.png');
  });
});

describe('image-content: readWorktreeImageBytes', () => {
  test('returns bytes for a real file at the resolved path', async () => {
    const repositoryRoot = await root();
    await mkdir(join(repositoryRoot, 'docs', 'assets'), { recursive: true });
    await writeFile(join(repositoryRoot, 'docs', 'assets', 'logo.png'), 'fake-png-bytes');
    const bytes = await readWorktreeImageBytes(repositoryRoot, 'docs/assets/logo.png');
    expect(bytes?.toString('utf8')).toBe('fake-png-bytes');
  });

  test('returns undefined when an intermediate segment is a symlink', async () => {
    const repositoryRoot = await root();
    const outside = await root();
    await mkdir(join(outside, 'assets'), { recursive: true });
    await writeFile(join(outside, 'assets', 'logo.png'), 'escaped-bytes');
    await symlink(outside, join(repositoryRoot, 'docs'));
    const bytes = await readWorktreeImageBytes(repositoryRoot, 'docs/assets/logo.png');
    expect(bytes).toBeUndefined();
  });

  test('returns undefined when the final segment is a symlink', async () => {
    const repositoryRoot = await root();
    const outsideFile = join(await root(), 'real-logo.png');
    await writeFile(outsideFile, 'escaped-bytes');
    await mkdir(join(repositoryRoot, 'docs'), { recursive: true });
    await symlink(outsideFile, join(repositoryRoot, 'docs', 'logo.png'));
    const bytes = await readWorktreeImageBytes(repositoryRoot, 'docs/logo.png');
    expect(bytes).toBeUndefined();
  });

  test('returns undefined when the file exceeds MAX_IMAGE_BYTES', async () => {
    const repositoryRoot = await root();
    await writeFile(join(repositoryRoot, 'oversized.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    const bytes = await readWorktreeImageBytes(repositoryRoot, 'oversized.png');
    expect(bytes).toBeUndefined();
    await expect(lstat(join(repositoryRoot, 'oversized.png'))).resolves.toBeDefined();
  });

  test('returns undefined when the path does not exist', async () => {
    const repositoryRoot = await root();
    const bytes = await readWorktreeImageBytes(repositoryRoot, 'missing/logo.png');
    expect(bytes).toBeUndefined();
  });
});

describe('image-content: readCommittedImageBytes', () => {
  test('resolves bytes for a blob entry', async () => {
    const oid = '4'.repeat(40);
    const runner = stubRunner({
      stdout: Buffer.from(`100644 blob ${oid}\tdocs/assets/logo.png\n`, 'utf8'),
      stderr: Buffer.alloc(0),
    });
    const reader = stubReader(new Map([[oid, Buffer.from('committed-png-bytes')]]));
    const bytes = await readCommittedImageBytes('/repo', 'a'.repeat(40), 'docs/assets/logo.png', runner, reader);
    expect(bytes?.toString('utf8')).toBe('committed-png-bytes');
  });

  test('returns undefined for a tree entry', async () => {
    const runner = stubRunner({
      stdout: Buffer.from(`040000 tree ${'5'.repeat(40)}\tdocs/assets\n`, 'utf8'),
      stderr: Buffer.alloc(0),
    });
    const reader = stubReader(new Map());
    const bytes = await readCommittedImageBytes('/repo', 'a'.repeat(40), 'docs/assets', runner, reader);
    expect(bytes).toBeUndefined();
  });

  test('returns undefined for a submodule (commit) entry', async () => {
    const runner = stubRunner({
      stdout: Buffer.from(`160000 commit ${'6'.repeat(40)}\tvendor/sub\n`, 'utf8'),
      stderr: Buffer.alloc(0),
    });
    const reader = stubReader(new Map());
    const bytes = await readCommittedImageBytes('/repo', 'a'.repeat(40), 'vendor/sub', runner, reader);
    expect(bytes).toBeUndefined();
  });

  test('returns undefined when ls-tree output is empty (path not found at that commit)', async () => {
    const runner = stubRunner({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
    const reader = stubReader(new Map());
    const bytes = await readCommittedImageBytes('/repo', 'a'.repeat(40), 'docs/missing.png', runner, reader);
    expect(bytes).toBeUndefined();
  });

  test('returns undefined when the object reader reports the blob missing', async () => {
    const oid = '7'.repeat(40);
    const runner = stubRunner({
      stdout: Buffer.from(`100644 blob ${oid}\tdocs/assets/logo.png\n`, 'utf8'),
      stderr: Buffer.alloc(0),
    });
    const reader = stubReader(new Map());
    const bytes = await readCommittedImageBytes('/repo', 'a'.repeat(40), 'docs/assets/logo.png', runner, reader);
    expect(bytes).toBeUndefined();
  });
});

describe('image-content: IMAGE_CONTENT_TYPE_BY_EXTENSION', () => {
  test('maps the allow-listed extensions to their content types', () => {
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['png']).toBe('image/png');
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['jpg']).toBe('image/jpeg');
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['jpeg']).toBe('image/jpeg');
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['gif']).toBe('image/gif');
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['svg']).toBe('image/svg+xml');
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['webp']).toBe('image/webp');
  });

  test('has no entry for a non-allow-listed extension', () => {
    expect(IMAGE_CONTENT_TYPE_BY_EXTENSION['exe']).toBeUndefined();
  });
});

const safeGitArguments = [
  '--no-optional-locks',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.external=',
  '-c',
  'protocol.file.allow=never',
] as const;

const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_EXTERNAL_DIFF: '',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
};

interface CommittedImageFixture {
  readonly repositoryRoot: string;
  readonly baseOid: string;
  readonly headOid: string;
  readonly baseLogoOid: string;
  readonly headLogoOid: string;
}

async function createCommittedImageFixture(): Promise<CommittedImageFixture> {
  const repositoryRoot = await root();
  const git = (arguments_: readonly string[]): Buffer =>
    execFileSync('git', [...safeGitArguments, ...arguments_], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      env: gitEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  execFileSync('git', [...safeGitArguments, 'init', '--initial-branch=main'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    env: gitEnvironment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  git(['config', '--local', 'user.name', 'Cumpa Image Fixture']);
  git(['config', '--local', 'user.email', 'fixture@test.invalid']);
  git(['config', '--local', 'commit.gpgSign', 'false']);

  await mkdir(join(repositoryRoot, 'docs', 'assets'), { recursive: true });
  await writeFile(join(repositoryRoot, 'docs', 'readme.md'), '# Readme\n');
  await writeFile(join(repositoryRoot, 'docs', 'assets', 'logo.png'), 'base-logo-bytes');
  git(['add', '-A']);
  git(['commit', '-m', 'base']);
  const baseOid = git(['rev-parse', 'HEAD']).toString('ascii').trim();
  const baseLogoOid = git(['rev-parse', 'HEAD:docs/assets/logo.png']).toString('ascii').trim();

  await writeFile(join(repositoryRoot, 'docs', 'assets', 'logo.png'), 'head-logo-bytes');
  git(['add', '-A']);
  git(['commit', '-m', 'head']);
  const headOid = git(['rev-parse', 'HEAD']).toString('ascii').trim();
  const headLogoOid = git(['rev-parse', 'HEAD:docs/assets/logo.png']).toString('ascii').trim();

  return { repositoryRoot, baseOid, headOid, baseLogoOid, headLogoOid };
}

const committedFileId = `file_${'m'.repeat(43)}`;
const committedUnknownFileId = `file_${'z'.repeat(43)}`;

function committedComparison(fixture: CommittedImageFixture): PinnedComparison {
  return {
    repositoryRoot: fixture.repositoryRoot,
    objectFormat: 'sha1',
    base: { label: 'main', oid: fixture.baseOid },
    head: { label: 'feature', oid: fixture.headOid },
    mergeBaseOid: fixture.baseOid,
    changedFiles: [
      {
        id: committedFileId,
        status: { code: 'M', kind: 'modified', similarity: null },
        oldMode: '100644',
        newMode: '100644',
        oldBlobOid: '4'.repeat(40),
        newBlobOid: '5'.repeat(40),
        oldPath: markdownPath('docs/readme.md'),
        newPath: markdownPath('docs/readme.md'),
        additions: 1,
        deletions: 1,
        availability: { kind: 'text' },
      },
    ],
    hasCommittedChanges: true,
  };
}

function buildCommittedApp(fixture: CommittedImageFixture): FastifyInstance {
  const app = createSessionApp(committedComparison(fixture), {
    sessionToken: token,
    objectReader: stubReader(
      new Map([
        [fixture.baseLogoOid, Buffer.from('BASE-PNG-BYTES')],
        [fixture.headLogoOid, Buffer.from('HEAD-PNG-BYTES')],
      ]),
    ),
  });
  app.bindSessionSecurity({ expectedHost, expectedOrigin });
  apps.add(app);
  return app;
}

describe('GET /api/files/:fileId/image — committed-comparison sessions', () => {
  test('serves the head-side blob bytes resolved via git ls-tree for a relative image reference', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/png/);
    expect(response.body).toBe('HEAD-PNG-BYTES');
  });

  test('serves the base-side blob bytes for the same relative reference', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=base`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('BASE-PNG-BYTES');
  });

  test('returns 404 for an unknown fileId', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedUnknownFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(404);
  });

  test('returns 400 when side is outside base|head', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=wrong`,
      headers,
    });
    expect(response.statusCode).toBe(400);
  });

  test('returns 400 when path is omitted', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({ method: 'GET', url: `/api/files/${committedFileId}/image?side=head`, headers });
    expect(response.statusCode).toBe(400);
  });

  test('returns 400 when an unexpected extra query parameter is present', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=head&extra=1`,
      headers,
    });
    expect(response.statusCode).toBe(400);
  });

  test('returns 409 (never bytes) when the path escapes the repository root', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('../../outside')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain('HEAD-PNG-BYTES');
  });

  test('returns 409 for a non-allow-listed extension even though the markdown file exists', async () => {
    const fixture = await createCommittedImageFixture();
    const app = buildCommittedApp(fixture);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${committedFileId}/image?path=${encodeURIComponent('./assets/notes.exe')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(409);
  });
});

const exactPatchFileId = `file_${'e'.repeat(43)}`;

function exactPatchGrounded(repositoryRoot: string): GroundedExactPatch {
  return Object.freeze({
    repositoryRoot,
    objectFormat: 'sha1' as const,
    scope: Object.freeze({
      kind: 'exact-patch' as const,
      digest: 'a'.repeat(64),
      validationTarget: Object.freeze({ kind: 'worktree' as const }),
      submittedByteLength: 42,
    }),
    changedFiles: Object.freeze([
      Object.freeze({
        id: exactPatchFileId,
        status: Object.freeze({ code: 'M', kind: 'modified' as const, similarity: null }),
        oldMode: '100644',
        newMode: '100644',
        oldBlobOid: '1'.repeat(40),
        newBlobOid: '2'.repeat(40),
        oldPath: markdownPath('docs/readme.md'),
        newPath: markdownPath('docs/readme.md'),
        additions: 1,
        deletions: 1,
        availability: Object.freeze({ kind: 'text' as const }),
      }),
    ]),
    contents: new Map([
      [exactPatchFileId, Object.freeze({ preimage: Buffer.from('before\n'), postimage: Buffer.from('after\n') })],
    ]),
  });
}

describe('GET /api/files/:fileId/image — worktree-disk sessions (exact-patch)', () => {
  test('serves real on-disk bytes for a relative image reference next to the markdown file', async () => {
    const repositoryRoot = await root();
    await mkdir(join(repositoryRoot, 'docs', 'assets'), { recursive: true });
    await writeFile(join(repositoryRoot, 'docs', 'assets', 'logo.png'), 'worktree-png-bytes');
    const app = await createExactPatchSessionApp(exactPatchGrounded(repositoryRoot), {
      sessionToken: token,
      snapshotParent: repositoryRoot,
    });
    app.bindSessionSecurity({ expectedHost, expectedOrigin });
    apps.add(app);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${exactPatchFileId}/image?path=${encodeURIComponent('./assets/logo.png')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/png/);
    expect(response.body).toBe('worktree-png-bytes');
  });

  test('returns 409 when the resolved on-disk path is a symlink', async () => {
    const repositoryRoot = await root();
    const outsideFile = join(await root(), 'escaped.png');
    await writeFile(outsideFile, 'escaped-bytes');
    await mkdir(join(repositoryRoot, 'docs'), { recursive: true });
    await symlink(outsideFile, join(repositoryRoot, 'docs', 'logo.png'));
    const app = await createExactPatchSessionApp(exactPatchGrounded(repositoryRoot), {
      sessionToken: token,
      snapshotParent: repositoryRoot,
    });
    app.bindSessionSecurity({ expectedHost, expectedOrigin });
    apps.add(app);
    const response = await app.inject({
      method: 'GET',
      url: `/api/files/${exactPatchFileId}/image?path=${encodeURIComponent('./logo.png')}&side=head`,
      headers,
    });
    expect(response.statusCode).toBe(409);
  });
});
