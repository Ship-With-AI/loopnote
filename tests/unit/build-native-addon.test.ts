import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(projectRoot, 'scripts', 'build-native-addon.mjs');
const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-native-build-`));
  roots.push(root);
  await mkdir(join(root, 'src', 'native'), { recursive: true });
  await copyFile(join(projectRoot, 'src', 'native', 'directory-exchange.cc'), join(root, 'src', 'native', 'directory-exchange.cc'));
  return root;
}

function runBuild(root: string, platform: string, arch: string) {
  return spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CUMPA_NATIVE_BUILD_ROOT: root,
      CUMPA_NATIVE_BUILD_PLATFORM: platform,
      CUMPA_NATIVE_BUILD_ARCH: arch,
    },
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('native addon build target gate', () => {
  test('removes a stale addon and succeeds without compiling for an unsupported target', async () => {
    const root = await fixtureRoot();
    const output = join(root, 'dist', 'native', 'directory_exchange.node');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, 'stale addon');

    const result = runBuild(root, 'linux', 'x64');

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test.runIf(process.platform === 'darwin' && process.arch === 'arm64')('builds the declared darwin-arm64 addon target', async () => {
    const root = await fixtureRoot();
    const output = join(root, 'dist', 'native', 'directory_exchange.node');

    const result = runBuild(root, 'darwin', 'arm64');

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect((await readFile(output)).byteLength).toBeGreaterThan(0);
  });
});
