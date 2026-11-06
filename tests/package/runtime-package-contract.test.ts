import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { readPackageVersionFromManifest } from '../../src/cli/run.js';
import {
  approvedDependencies,
  assertApprovedDependencies,
  assertSupportedNodeVersion,
  verifyPrerequisites,
} from '../../scripts/verify-prerequisites.mjs';
import { archiveBasename, version } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';


const projectRoot = resolve(import.meta.dirname, '../..');
const packageManifestPath = join(projectRoot, 'package.json');
const packagedCli = join(projectRoot, 'dist', 'bin', `${RENAME_MAP.binCommand}.mjs`);

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(packageManifestPath, 'utf8')) as Record<string, unknown>;
}

async function writeSentinelCommand(
  directory: string,
  command: string,
  sentinel: string,
): Promise<void> {
  const executable = join(directory, process.platform === 'win32' ? `${command}.cmd` : command);
  const body = process.platform === 'win32'
    ? `@echo off\r\ntype nul > "${sentinel}"\r\n`
    : `#!/bin/sh\n: > "${sentinel}"\n`;
  await writeFile(executable, body, 'utf8');
  if (process.platform !== 'win32') await chmod(executable, 0o755);
}

async function runVersion(
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<{ readonly code: number | null; readonly stderr: string; readonly stdout: string }> {
  const { promise, reject, resolve: resolveResult } = Promise.withResolvers<{
    readonly code: number | null;
    readonly stderr: string;
    readonly stdout: string;
  }>();
  const child = spawn(process.execPath, [packagedCli, '--version'], {
    cwd,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  // The open pipe has no completion event; this timeout proves --version never waits for stdin.
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error(`${RENAME_MAP.binCommand} --version waited for ordinary action input`));
  }, 1_000);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.on('error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on('close', (code: number | null) => {
    clearTimeout(timer);
    resolveResult({ code, stderr, stdout });
  });
  return await promise;
}

describe('runtime package contract', () => {
  test('version reads the installed manifest and exits before ordinary action side effects', async () => {
    const directory = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-version-`));
    const commands = join(directory, 'commands');
    const gitSentinel = join(directory, 'git-used');
    const browserSentinel = join(directory, 'browser-used');
    const serverSentinel = join(directory, 'server-used');
    const serverHook = join(directory, 'server-hook.cjs');
    try {
      await mkdir(commands);
      await writeFile(join(directory, '.gitignore'), '', 'utf8');
      await writeFile(join(directory, 'commands-placeholder'), '', 'utf8');
      await writeFile(
        serverHook,
        `const fs = require('node:fs');\nconst net = require('node:net');\nconst listen = net.Server.prototype.listen;\nnet.Server.prototype.listen = function (...arguments_) {\n  fs.writeFileSync(process.env.${RENAME_MAP.envPrefix}SERVER_SENTINEL, 'used');\n  return Reflect.apply(listen, this, arguments_);\n};\n`,
        'utf8',
      );
      await writeSentinelCommand(commands, 'git', gitSentinel);
      await writeSentinelCommand(commands, 'open', browserSentinel);
      await writeSentinelCommand(commands, 'xdg-open', browserSentinel);
      const result = await runVersion(directory, {
        ...process.env,
        BROWSER: 'open',
        [`${RENAME_MAP.envPrefix}SERVER_SENTINEL`]: serverSentinel,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${serverHook}`,
        PATH: `${commands}${delimiter}${process.env.PATH ?? ''}`,
      });

      expect(result).toEqual({ code: 0, stderr: '', stdout: `${version}\n` });
      await expect(readFile(gitSentinel)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(browserSentinel)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(serverSentinel)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test('publishes only the scoped runtime and legal manifest contract', async () => {
    const manifest = await readManifest();

    expect(manifest).toMatchObject({
      bin: { [RENAME_MAP.binCommand]: `dist/bin/${RENAME_MAP.binCommand}.mjs` },
      engines: { node: '>=24' },
      name: RENAME_MAP.npmPackage,
      version,
    });
    expect(archiveBasename).toBe(`shipwithai-${RENAME_MAP.slug}-${version}.tgz`);
    expect(manifest).not.toHaveProperty('private');
    expect(manifest.files).toEqual([
      'dist/',
      'README.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
    ]);
  });

  // These temp-manifest vectors stay independent: the latter rejects the package name, not its version.
  test('accepts a controlled valid manifest version and rejects malformed metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-manifest-`));
    const manifestPath = join(directory, 'package.json');

    try {
      await writeFile(
        manifestPath,
        JSON.stringify({ name: RENAME_MAP.npmPackage, version: '1.5.1-beta.1' }),
        'utf8',
      );
      await expect(readPackageVersionFromManifest(pathToFileURL(manifestPath))).resolves.toBe('1.5.1-beta.1');
      await writeFile(manifestPath, JSON.stringify({ name: RENAME_MAP.slug, version: '1.5.1' }), 'utf8');
      await expect(readPackageVersionFromManifest(pathToFileURL(manifestPath))).rejects.toThrow('Package manifest name');
      await writeFile(manifestPath, JSON.stringify({ name: RENAME_MAP.npmPackage, version: '' }), 'utf8');
      await expect(readPackageVersionFromManifest(pathToFileURL(manifestPath))).rejects.toThrow('Package manifest version');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test('dependencies approve exactly every declared direct release', async () => {
    const manifest = await readManifest();
    const declared = {
      ...(manifest.dependencies as Record<string, string>),
      ...(manifest.devDependencies as Record<string, string>),
    };

    expect(approvedDependencies).toEqual(new Map(Object.entries(declared).sort(([left], [right]) => left.localeCompare(right))));
    expect(assertApprovedDependencies(manifest as { dependencies: Record<string, string>; devDependencies: Record<string, string> })).toBe(19);
  });

  test('dependencies reject direct additions, removals, and version drift by package name', async () => {
    const manifest = await readManifest();
    const direct = {
      ...(manifest.dependencies as Record<string, string>),
      ...(manifest.devDependencies as Record<string, string>),
    };
    const withoutMarkdown = { ...direct };
    delete withoutMarkdown['markdown-it'];

    expect(() => assertApprovedDependencies({ dependencies: { ...direct, unexpected: '1.0.0' } })).toThrow('unexpected');
    expect(() => assertApprovedDependencies({ dependencies: withoutMarkdown })).toThrow('markdown-it');
    expect(() => assertApprovedDependencies({ dependencies: { ...direct, zod: '4.4.4' } })).toThrow('zod');
  });

  test('keeps the Node and Git prerequisite guidance while the real checkout passes', async () => {
    expect(() => assertSupportedNodeVersion('23.0.0')).toThrow('Node.js 24 or newer is required; found v23.0.0');
    await expect(verifyPrerequisites({
      packageJson: await readManifest() as { dependencies: Record<string, string>; devDependencies: Record<string, string> },
      executeFile: () => {
        throw new Error('missing git');
      },
    })).rejects.toThrow(`Git is required but was not found. Install Git, then run ${RENAME_MAP.displayName} again.`);
    await expect(verifyPrerequisites()).resolves.toBe(19);
  });
});
