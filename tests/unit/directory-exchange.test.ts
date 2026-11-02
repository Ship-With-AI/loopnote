import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, test } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

const require = createRequire(import.meta.url);
const roots: string[] = [];
const declaredNativeTarget = process.platform === 'darwin' && process.arch === 'arm64';


type DirectoryExchangeAddon = Readonly<{
  probeDirectoryExchange(root: string): Readonly<{ kind: 'supported' | 'unsupported' }>;
}>;

async function buildAddon(): Promise<DirectoryExchangeAddon> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-native-exchange-`));
  roots.push(root);
  const source = join(process.cwd(), 'src/native/directory-exchange.cc');
  const output = join(root, 'directory_exchange.node');
  const nodeRoot = dirname(dirname(process.execPath));
  const build = spawnSync('/usr/bin/c++', [
    '-std=c++20',
    '-dynamiclib',
    '-undefined',
    'dynamic_lookup',
    '-I',
    join(nodeRoot, 'include', 'node'),
    source,
    '-o',
    output,
  ], { encoding: 'utf8' });

  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
  return require(output) as DirectoryExchangeAddon;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('native directory exchange probe', () => {
  test.runIf(declaredNativeTarget)('compiles the actual adapter and proves one complete sibling pair swaps without stable absence', async () => {
    const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-native-probe-`));
    roots.push(root);


    const addon = await buildAddon();
    const result = addon.probeDirectoryExchange(root);

    expect(result).toEqual({ kind: 'supported' });
    expect(await readFile(join(root, 'stable', 'review.json'), 'utf8')).toBe('new-json');
    expect(await readFile(join(root, 'stable', 'review.md'), 'utf8')).toBe('new-markdown');
    expect(await readFile(join(root, 'candidate', 'review.json'), 'utf8')).toBe('old-json');
    expect(await readFile(join(root, 'candidate', 'review.md'), 'utf8')).toBe('old-markdown');
  });
});
