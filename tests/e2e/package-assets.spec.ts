import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { SessionResponseSchema } from '../../src/contracts/api.js';
import { createDirtyGitFixture } from '../helpers/git-fixture.js';
import { openRuntimeSession } from '../helpers/open-runtime-session.js';
import type { RuntimeSessionSupportObservation } from '../helpers/open-runtime-session.js';
import { resolveAcceptanceRuntime } from '../helpers/acceptance-runtime.js';
import type { AcceptanceRuntime } from '../helpers/acceptance-runtime.js';
import {
  publishScenarioRecord,
  rehashRuntimeArtifact,
  runRuntimeCommand,
  writeRuntimeScenario,
} from '../helpers/runtime-artifact.js';

let acceptance: AcceptanceRuntime;
let temporaryRoot: string | undefined;
let assetChecksPassed = false;
let cleaned = false;
let supportObserved: RuntimeSessionSupportObservation | undefined;

function commandOutput(executablePath: string, args: readonly string[], environment: NodeJS.ProcessEnv): string {
  return runRuntimeCommand(executablePath, args, { cwd: tmpdir(), env: environment });
}

async function loopbackUrl(outputPath: string, markerPath: string, child: ChildProcess): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/u);
    if (match !== null && existsSync(markerPath)) return match[0];
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('[runtime-artifact] installed CLI exited before opening its loopback URL');
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error('[runtime-artifact] timed out waiting for installed CLI loopback URL');
}

function installedAssets(packageRoot: string): readonly string[] {
  const root = join(packageRoot, 'dist', 'web', 'assets');
  const assets: string[] = [];
  const visit = (directory: string, publicPath: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${publicPath}/${entry.name}`;
      if (entry.isDirectory()) visit(join(directory, entry.name), path);
      else if (entry.isFile()) assets.push(path);
    }
  };
  visit(root, '/assets');
  return assets.sort((left, right) => left.localeCompare(right));
}

async function loadedBrowserAssets(page: Page): Promise<readonly string[]> {
  return await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => path.startsWith('/assets/'))
    .sort((left, right) => left.localeCompare(right)));
}

test.beforeAll(() => {
  acceptance = resolveAcceptanceRuntime();
  temporaryRoot = acceptance.root;
});

test.afterAll(() => {
  if (acceptance === undefined) return;
  try {
    if (acceptance.source === 'local-archive') {
      if (acceptance.artifact === undefined || acceptance.installProof === undefined) {
        throw new Error('[runtime-artifact] local-archive runtime evidence is incomplete');
      }
      acceptance.cleanup();
      cleaned = true;
      rehashRuntimeArtifact(acceptance.artifact);
      if (assetChecksPassed) {
        writeRuntimeScenario('package-assets', {
          archive: acceptance.artifact.archive,
          package: acceptance.artifact.package,
          install: acceptance.installProof,
          target: { platform: process.platform, arch: process.arch },
          cleanup: { complete: cleaned },
          browser: { assets: true, workers: true, codicon: true },
          checks: { version: true, help: true, isolatedInstall: true, dependencyTree: true },
        });
      }
      return;
    }
    if (acceptance.publicProof === undefined || supportObserved === undefined) {
      throw new Error('[public-runtime] public runtime evidence is incomplete');
    }
    acceptance.cleanup();
    cleaned = true;
    if (assetChecksPassed) {
      publishScenarioRecord('public-package-assets', {
        installSource: acceptance.source,
        publicProof: acceptance.publicProof,
        target: { platform: process.platform, arch: process.arch },
        supportObserved,
        browser: { assets: true, workers: true, codicon: true },
        checks: { version: true, help: true, isolatedInstall: true, dependencyTree: true },
        cleanup: { complete: true },
      });
    }
  } finally {
    if (!cleaned) acceptance.cleanup();
  }
});

test('resolved runtime serves its complete browser asset graph', async ({ page }) => {
  if (temporaryRoot === undefined) throw new Error('[runtime-artifact] isolated installation was not initialized');
  expect(commandOutput(acceptance.launch.command, [...acceptance.launch.args, '--version'], acceptance.env)).toBe(`${acceptance.expectedVersion}\n`);
  expect(commandOutput(acceptance.launch.command, [...acceptance.launch.args, '--help'], acceptance.env)).toMatch(/--version\b/u);

  if (acceptance.packageRoot !== undefined) {
    const packageManifest = JSON.parse(readFileSync(join(acceptance.packageRoot, 'package.json'), 'utf8')) as {
      readonly name: string;
      readonly version: string;
      readonly engines: { readonly node: string };
      readonly bin: { readonly cumpa: string };
    };
    expect(packageManifest).toEqual(expect.objectContaining({
      name: '@shipwithai/cumpa',
      version: acceptance.expectedVersion,
      engines: { node: '>=24' },
      bin: { cumpa: 'dist/bin/cumpa.mjs' },
    }));
    for (const forbidden of ['src', 'tests', '.planning', '.cumpa', '.github', '.git', '.kimi-code']) {
      expect(existsSync(join(acceptance.packageRoot, forbidden))).toBe(false);
    }
  }
  if (acceptance.artifact !== undefined && acceptance.packageRoot !== undefined) {
    for (const legalFile of ['LICENSE', 'THIRD_PARTY_NOTICES.md'] as const) {
      expect(createHash('sha256').update(readFileSync(join(acceptance.packageRoot, legalFile))).digest('hex')).toBe(acceptance.artifact.evidence.legal[legalFile]);
    }
  }

  const fixture = await createDirtyGitFixture('branch-to-worktree', 8);
  const fakeBin = join(temporaryRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true, mode: 0o700 });
  const outputPath = join(temporaryRoot, 'cli.log');
  const browserMarker = join(temporaryRoot, 'browser-open.log');
  const opener = join(fakeBin, 'open');
  writeFileSync(opener, [
    '#!/usr/bin/env node',
    "const { appendFileSync } = require('node:fs');",
    "appendFileSync(process.env.CUMPA_BROWSER_OPEN_MARKER, process.argv.slice(2).join(' '));",
    '',
  ].join('\n'), { mode: 0o700 });
  chmodSync(opener, 0o700);

  const child = spawn(acceptance.launch.command, [...acceptance.launch.args], {
    cwd: fixture.nestedCwd,
    env: {
      ...acceptance.env,
      PATH: `${fakeBin}:${acceptance.env.PATH}`,
      BROWSER: opener,
      CUMPA_BROWSER_OPEN_MARKER: browserMarker,
      CUMPA_LAUNCH_OPTIONS: JSON.stringify({
        cwd: fixture.nestedCwd,
        base: { label: fixture.baseRef.slice('refs/heads/'.length), revision: fixture.baseRef },
        head: { label: fixture.headRef.slice('refs/heads/'.length), revision: fixture.headRef },
      }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = createWriteStream(outputPath, { flags: 'wx' });
  child.stdout?.pipe(output, { end: false });
  child.stderr?.pipe(output, { end: false });

  // Keep support startup pending beyond the editor's first paint.
  const supportRefreshRelease = Promise.withResolvers<void>();
  try {
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      return ['127.0.0.1', '[::1]', 'localhost'].includes(host) ? route.continue() : route.abort();
    });
    await page.route('**/api/support/refresh', async (route) => {
      await supportRefreshRelease.promise;
      await route.continue();
    });
    const url = await loopbackUrl(outputPath, browserMarker, child);
    const responseFailures: string[] = [];
    page.on('requestfailed', (request) => responseFailures.push(request.url()));
    const sessionResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/session');
    const opening = openRuntimeSession(page, url);
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    const session = SessionResponseSchema.parse(await (await sessionResponse).json());
    const supportResponse = session.support?.enabled === true
      ? page.waitForResponse((response) => new URL(response.url()).pathname === '/api/support/refresh')
      : undefined;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    supportRefreshRelease.resolve();
    supportObserved = await opening;
    if (supportResponse !== undefined) {
      await (await supportResponse).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      await expect(page.locator('.support-dialog-backdrop')).toBeHidden();
    }
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    const assets = acceptance.packageRoot === undefined
      ? await loadedBrowserAssets(page)
      : installedAssets(acceptance.packageRoot);
    expect(assets).not.toHaveLength(0);
    const responses = await page.evaluate(async (paths) => await Promise.all(paths.map(async (path) => {
      const response = await fetch(path);
      return { path, ok: response.ok };
    })), assets);
    expect(responses).toEqual(expect.arrayContaining(assets.map((path) => ({ path, ok: true }))));
    expect(responseFailures).toEqual([]);
    for (const worker of ['editor', 'css', 'html', 'json', 'ts']) {
      expect(assets.some((path) => path.includes(`${worker}.worker-`))).toBe(true);
    }
    expect(assets.some((path) => /codicon.*\.(?:ttf|woff2?)/u.test(path))).toBe(true);
  } finally {
    supportRefreshRelease.resolve();
    await page.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await new Promise<void>((done) => output.end(done));
    await fixture.cleanup();
  }

  assetChecksPassed = true;
});
