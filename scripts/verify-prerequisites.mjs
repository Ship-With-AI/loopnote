import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import renameMap from './rename-map.json' with { type: 'json' };

export const approvedDependencies = new Map([
  ['@fastify/static', '9.3.0'],
  ['@inquirer/search', '4.2.1'],
  ['@playwright/test', '1.61.1'],
  ['@types/markdown-it', '14.1.2'],
  ['@types/node', '24.11.1'],
  ['@vitejs/plugin-vue', '6.0.7'],
  ['commander', '15.0.0'],
  ['fastify', '5.10.0'],
  ['markdown-it', '14.3.0'],
  ['monaco-editor', '0.55.1'],
  ['open', '11.0.0'],
  ['supabase', '2.114.0'],
  ['typescript', '7.0.2'],
  ['vite', '8.1.4'],
  ['vitest', '4.1.10'],
  ['vue', '3.5.39'],
  ['vue-tsc', '3.3.7'],
  ['zod', '4.4.3'],
]);

const repositoryRoot = resolve(import.meta.dirname, '..');

export function assertSupportedNodeVersion(nodeVersion = process.versions.node) {
  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10);
  if (nodeMajor < 24) {
    throw new Error(`Node.js 24 or newer is required; found v${nodeVersion}`);
  }
}

export function assertApprovedDependencies(packageJson, approved = approvedDependencies) {
  const configured = new Map(
    Object.entries({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }),
  );
  for (const [name, version] of configured) {
    const approvedVersion = approved.get(name);
    if (approvedVersion === undefined) {
      throw new Error(`Unapproved direct dependency ${name}`);
    }
    if (version !== approvedVersion) {
      throw new Error(
        `Expected approved exact release ${name}@${approvedVersion}; found ${version}`,
      );
    }
  }
  for (const [name, version] of approved) {
    if (!configured.has(name)) {
      throw new Error(`Expected approved exact release ${name}@${version}; found missing`);
    }
  }
  return approved.size;
}

export async function verifyPrerequisites(options = {}) {
  assertSupportedNodeVersion(options.nodeVersion);
  const root = options.repositoryRoot ?? repositoryRoot;
  const packageJson =
    options.packageJson
    ?? JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const count = assertApprovedDependencies(packageJson);
  const executeFile = options.executeFile ?? execFileSync;
  try {
    executeFile('git', ['--version'], { stdio: 'pipe' });
  } catch (error) {
    throw new Error(
      `Git is required but was not found. Install Git, then run ${renameMap.displayName} again.`,
      { cause: error },
    );
  }
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  executeFile(npmCommand, ['ls', '--depth=0'], {
    cwd: root,
    stdio: 'pipe',
  });
  return count;
}

export async function main() {
  const count = await verifyPrerequisites();
  console.log(
    `Prerequisites verified: ${process.version}, Git available, and ${count} approved exact releases installed.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
