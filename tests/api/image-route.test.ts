import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import type { ObjectReader } from '../../src/git/objects.js';
import type { GitRunner, GitRunResult } from '../../src/git/runner.js';
import {
  IMAGE_CONTENT_TYPE_BY_EXTENSION,
  MAX_IMAGE_BYTES,
  readCommittedImageBytes,
  readWorktreeImageBytes,
  resolveRelativeImagePath,
} from '../../src/server/image-content.js';

const roots: string[] = [];

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
