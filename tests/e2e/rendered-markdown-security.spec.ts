import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  closeSync,
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, Page, TestInfo } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), 'cumpa-rendered-md-sec-pack-'));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, 'dist/bin/cumpa.mjs');
const fakeBinRoot = join(packedRoot, 'fake-bin');
test.setTimeout(90_000);

interface RunningCli {
  readonly child: ChildProcess;
  readonly browserMarkerPath: string;
  readonly outputPath: string;
  readonly outputDescriptor: number;
}

function runPrerequisite(command: string, arguments_: readonly string[]): string {
  try {
    return execFileSync(command, [...arguments_], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before rendered Markdown security behavior: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function waitForLoopbackUrl(running: RunningCli): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const output = existsSync(running.outputPath)
      ? readFileSync(running.outputPath, 'utf8')
      : '';
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/);
    if (match !== null) {
      return match[0];
    }
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      throw new Error(`[behavioral] generated CLI exited before publishing a loopback URL:\n${output}`);
    }
    const { promise, resolve: resolveWait } = Promise.withResolvers<void>();
    setTimeout(resolveWait, 25);
    await promise;
  }
  throw new Error(
    '[behavioral] timed out waiting for generated CLI loopback URL and fake opener interception',
  );
}

function startGeneratedCli(repository: GitFixture, head = repository.headRef): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const browserMarkerPath = join(
    packedRoot,
    `browser-open-${crypto.randomUUID()}.log`,
  );
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      CUMPA_BROWSER_OPEN_MARKER: browserMarkerPath,
      CUMPA_LAUNCH_OPTIONS: JSON.stringify({
        cwd: repository.nestedCwd,
        base: { label: 'main', revision: repository.baseRef },
        head: { label: head.slice('refs/heads/'.length), revision: head },
      }),
    },
    stdio: ['ignore', outputDescriptor, outputDescriptor],
  });
  return { child, browserMarkerPath, outputPath, outputDescriptor };
}

async function stopGeneratedCli(running: RunningCli): Promise<void> {
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill('SIGINT');
  }
  const events = running.child as unknown as EventEmitter;
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  events.once('error', reject);
  events.once('exit', resolve);
  await promise;
  closeSync(running.outputDescriptor);
}

async function openGeneratedReview(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const endpoints = page.getByRole('banner');
  await expect(endpoints.getByText('BASE', { exact: true })).toBeVisible();
  await expect(endpoints.getByText('HEAD', { exact: true })).toBeVisible();
}

function assertChromium(browser: Browser, testInfo: TestInfo): void {
  expect(testInfo.project.name).toBe('chromium');
  expect(browser.browserType().name()).toBe('chromium');
}

function bearerTokenFrom(loopbackUrl: string): string {
  const hash = new URL(loopbackUrl).hash;
  const token = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '').get('token');
  if (token === null) {
    throw new Error(`[behavioral] loopback URL carried no session token: ${loopbackUrl}`);
  }
  return token;
}

async function openRenderedPreview(page: Page, loopbackUrl: string): Promise<void> {
  await openGeneratedReview(page, loopbackUrl);
  await page.getByRole('treeitem', { name: /preview\.md/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'docs/preview.md' })).toBeVisible();
  await page.getByRole('button', { name: 'Rendered' }).click();
  await expect(page.locator('.diff-workspace__editor')).toBeHidden();
  await expect(page.locator('.rendered-block').filter({ hasText: 'Preview Heading' }).first()).toBeVisible();
}

test.beforeAll(() => {
  const custody = join(packedRoot, 'custody');
  const evidence = join(packedRoot, 'runtime-evidence.json');
  runPrerequisite(process.execPath, [join(repositoryRoot, 'scripts/pack-runtime.mjs'), '--purpose', 'development-check', '--custody-dir', custody, '--evidence', evidence]);
  const packed = JSON.parse(readFileSync(evidence, 'utf8'));
  const archive = join(custody, packed.archive.basename);
  runPrerequisite(process.execPath, [join(repositoryRoot, 'scripts/verify-production-artifacts.mjs'), '--archive', archive, '--expected-sha256', packed.archive.sha256, '--evidence', evidence]);
  execFileSync('tar', ['-xzf', archive, '-C', packedRoot]);
  symlinkSync(join(repositoryRoot, 'node_modules'), join(extractedPackageRoot, 'node_modules'), 'dir');
  mkdirSync(fakeBinRoot, { recursive: true });
  const fakeOpen = join(packedRoot, 'open');
  writeFileSync(
    fakeOpen,
    [
      '#!/usr/bin/env node',
      "const { appendFileSync } = require('node:fs');",
      "const markerPath = process.env.CUMPA_BROWSER_OPEN_MARKER;",
      "if (markerPath !== undefined) appendFileSync(markerPath, `${JSON.stringify(process.argv.slice(2))}\\n`);",
      'process.exitCode = 1;',
      '',
    ].join('\n'),
  );
  const fakeOpenTarget = join(fakeBinRoot, 'open');
  copyFileSync(fakeOpen, fakeOpenTarget);
  chmodSync(fakeOpenTarget, 0o755);
});

test.afterAll(() => {
  rmSync(packedRoot, { force: true, recursive: true });
});

test('rendered Markdown never executes a raw script tag', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ markdownPreview: true });
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRenderedPreview(page, await waitForLoopbackUrl(running));

    expect(await page.evaluate(() => (window as unknown as { __xssMarker?: unknown }).__xssMarker)).toBeUndefined();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __xssMarker?: unknown }).__xssMarker)).toBeUndefined();

    // The raw <script> line and the raw <img onerror> line both set the same marker if
    // either fires live; the rendered block shows their escaped literal text instead.
    await expect(page.getByText('<script>window.__xssMarker = true;</script>', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('<img src="x" onerror="window.__xssMarker=true">', { exact: false }).first()).toBeVisible();
    await expect(page.locator('script:has-text("__xssMarker")')).toHaveCount(0);
    await expect(page.locator('[onerror]')).toHaveCount(0);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('javascript: and data: links and remote images never become live elements', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ markdownPreview: true });
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRenderedPreview(page, await waitForLoopbackUrl(running));

    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.getByText('[bad link](javascript:window.__xssMarker=true)', { exact: false }).first()).toBeVisible();

    await expect(page.locator('a[href^="data:"]')).toHaveCount(0);
    await expect(page.getByText('[bad2](data:text/html,', { exact: false }).first()).toBeVisible();

    // Clicking where the bad link's text sits must not navigate or execute anything.
    const badLinkText = page.getByText('[bad link](javascript:window.__xssMarker=true)', { exact: false }).first();
    await badLinkText.click({ force: true });
    expect(await page.evaluate(() => (window as unknown as { __xssMarker?: unknown }).__xssMarker)).toBeUndefined();

    await expect(
      page.getByText('Remote image not loaded: "remote" — https://example.test/remote.png', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator('img[src^="https://example.test"]')).toHaveCount(0);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('the relative image loads only through the same-origin content route, never off-origin', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ markdownPreview: true });
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const loopbackUrl = await waitForLoopbackUrl(running);
    await openRenderedPreview(page, loopbackUrl);

    const logoImage = page.locator('img[alt="logo"]').first();
    await expect(logoImage).toBeVisible();
    const imageSrc = await logoImage.getAttribute('src');
    expect(imageSrc).not.toBeNull();
    expect(imageSrc).toMatch(/^\/api\/files\//);
    expect(imageSrc).not.toMatch(/^https?:\/\//);

    const traversalUrl = new URL(imageSrc!, page.url());
    traversalUrl.searchParams.set('path', '../../../../etc/passwd');
    const response = await page.request.get(traversalUrl.toString(), {
      headers: { authorization: `Bearer ${bearerTokenFrom(loopbackUrl)}` },
    });
    expect(response.status()).not.toBe(200);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});
