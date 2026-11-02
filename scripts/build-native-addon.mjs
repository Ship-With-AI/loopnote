import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import renameMap from './rename-map.json' with { type: 'json' };

const root = resolve(process.env[`${renameMap.envPrefix}NATIVE_BUILD_ROOT`] ?? dirname(dirname(fileURLToPath(import.meta.url))));
const platform = process.env[`${renameMap.envPrefix}NATIVE_BUILD_PLATFORM`] ?? process.platform;
const arch = process.env[`${renameMap.envPrefix}NATIVE_BUILD_ARCH`] ?? process.arch;
const nodeRoot = dirname(dirname(process.execPath));
const output = join(root, 'dist', 'native', 'directory_exchange.node');

if (platform !== 'darwin' || arch !== 'arm64') {
  rmSync(output, { force: true });
  process.exit(0);
}

mkdirSync(dirname(output), { recursive: true });
execFileSync('/usr/bin/c++', [
  '-std=c++20',
  '-dynamiclib',
  '-undefined',
  'dynamic_lookup',
  '-I',
  join(nodeRoot, 'include', 'node'),
  join(root, 'src', 'native', 'directory-exchange.cc'),
  '-o',
  output,
], { stdio: 'inherit' });
