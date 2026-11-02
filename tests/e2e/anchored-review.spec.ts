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
  readdirSync,
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
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-anchored-pack-`));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before anchored review behavior: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function fakeOpenerInterceptedUrl(running: RunningCli, url: string): boolean {
  if (!existsSync(running.browserMarkerPath)) return false;
  return readFileSync(running.browserMarkerPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .some((line) => {
      const arguments_ = JSON.parse(line) as unknown;
      return (
        Array.isArray(arguments_) &&
        arguments_.length === 1 &&
        arguments_[0] === url
      );
    });
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
      [`${RENAME_MAP.envPrefix}BROWSER_OPEN_MARKER`]: browserMarkerPath,
      [`${RENAME_MAP.envPrefix}LAUNCH_OPTIONS`]: JSON.stringify({
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

async function activateMonacoLine(
  page: Page,
  side: 'base' | 'head',
  text: string,
  lineNumber: number,
): Promise<void> {
  const editor = side === 'base' ? 'editor original' : 'editor modified';
  const editorSurface = page
    .locator(
      `.monaco-diff-editor .${editor.split(' ').join('.')} .monaco-scrollable-element.editor-scrollable`,
    )
    .first();
  await editorSurface.click({ position: { x: 16, y: 16 } });
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText(String(lineNumber));
  await page.keyboard.press('Enter');
  const line = page
    .locator(`.monaco-diff-editor .${editor.split(' ').join('.')}`)
    .locator('.view-line')
    .filter({ hasText: text });
  await expect(line).toBeVisible();
  await line.hover();
  await line.click();
  const affordance = page.getByRole('button', {
    name: `Add comment to ${side} line ${lineNumber}`,
  });
  await expect(affordance).toBeVisible();
  await affordance.click();
}

async function activateSinglePaneLine(
  page: Page,
  side: 'base' | 'head',
  text: string,
  lineNumber: number,
): Promise<void> {
  const sideWord = side === 'base' ? 'BASE' : 'HEAD';
  const editorSurface = page
    .locator('.diff-workspace__editor .monaco-scrollable-element.editor-scrollable')
    .first();
  await editorSurface.click({ position: { x: 16, y: 16 } });
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText(String(lineNumber));
  await page.keyboard.press('Enter');
  const line = page
    .locator('.diff-workspace__editor')
    .locator('.view-line')
    .filter({ hasText: text });
  await expect(line).toBeVisible();
  await line.hover();
  await line.click();
  const affordance = page.getByRole('button', {
    name: `Add comment to ${sideWord} line ${lineNumber}`,
  });
  await expect(affordance).toBeVisible();
  await affordance.click();
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
      `const markerPath = process.env.${RENAME_MAP.envPrefix}BROWSER_OPEN_MARKER;`,
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

test('packaged anchored review records the darwin opener invocation', async () => {
  test.skip(
    process.platform !== 'darwin',
    'the fake opener is intercepted only through PATH, which open consults for `open` on darwin alone; elsewhere it spawns bundled absolute xdg-open',
  );
  const fixture = await createGitFixture({ anchoredReview: true });
  const running = startGeneratedCli(fixture);
  try {
    const url = await waitForLoopbackUrl(running);
    await expect
      .poll(() => fakeOpenerInterceptedUrl(running, url))
      .toBe(true);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});


test('packaged anchored gap closure recovers a non-line-1 exact anchor', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const baseOid = fixture.git(['rev-parse', fixture.baseRef]).toString('ascii').trim();
  const headOid = fixture.git(['rev-parse', fixture.headRef]).toString('ascii').trim();
  const mergeBaseOid = fixture.git(['merge-base', fixture.baseRef, fixture.headRef]).toString('ascii').trim();
  const draftsPath = join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
  const commentBody = 'Packaged comment on unchanged head line ten.';
  const initial = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(initial));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.getByText(/Unchanged regions begin collapsed/)).toBeVisible();

    await activateMonacoLine(page, 'base', 'export const stableContext10 = 10;', 10);
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await expect(composer).toHaveCount(1);
    await expect(page.locator('.inline-comment-composer__header')).toContainText(
      'src/changed.ts · Base line 10',
    );
    const composerCard = page.locator('.monaco-anchor-zone--composer .conversation-card');
    await expect(composerCard).toHaveCSS('background-color', 'rgb(13, 17, 23)');
    await expect(composerCard.locator('.conversation-card__header')).toHaveCSS(
      'border-bottom-color',
      'rgb(37, 45, 56)',
    );
    await composer.fill('Keep this draft while moving.');

    await activateMonacoLine(page, 'head', 'export const stableContext10 = 10;', 10);
    await expect(page.locator('.inline-comment-composer__confirm')).toBeVisible();
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Keep writing' }).click();
    await expect(composer).toHaveValue('Keep this draft while moving.');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Discard draft' }).click();
    await expect(composer).toHaveCount(1);
    await expect(composer).toBeFocused();
    await expect(page.locator('.inline-comment-composer__header')).toContainText(
      'src/changed.ts · Head line 10',
    );
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(composer).toHaveCount(1);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(composer).toHaveCount(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Next file' }).click();
    await page.getByRole('button', { name: 'Previous file' }).click();
    await expect(composer).toHaveCount(1);
    await composer.fill(commentBody);
    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);
  } finally {
    await stopGeneratedCli(initial);
  }

  const [draftFile] = readdirSync(draftsPath).filter((file) => file.endsWith('.json'));
  expect(draftFile).toBeDefined();
  const draft = JSON.parse(readFileSync(join(draftsPath, draftFile!), 'utf8')) as {
    comparison: { baseCommitOid: string; headCommitOid: string; mergeBaseOid: string };
    comments: Array<{ anchor: { line: number; selectedText: string; side: string }; body: string }>;
  };
  expect(draft.comparison).toEqual({ baseCommitOid: baseOid, headCommitOid: headOid, mergeBaseOid });
  expect(draft.comments).toEqual([
    expect.objectContaining({
      body: commentBody,
      anchor: expect.objectContaining({
        line: 10,
        selectedText: 'export const stableContext10 = 10;',
        side: 'head',
      }),
    }),
  ]);

  const resumed = startGeneratedCli(fixture);
  try {
    await openGeneratedReview(page, await waitForLoopbackUrl(resumed));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/changed.ts' })).toBeVisible();
  } finally {
    await stopGeneratedCli(resumed);
    await fixture.cleanup();
  }
});

test('packaged files dialog returns to the diff heading', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const initial = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(initial));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/changed.ts' })).toBeVisible();

    await page.setViewportSize({ width: 760, height: 900 });
    const filesToggle = page.getByRole('button', { name: 'Open files', exact: true });
    await filesToggle.click();
    await expect(page.getByRole('dialog', { name: 'Files', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close files' }).click();
    await expect(filesToggle).toBeFocused();
    await expect(page.locator('.changed-files-sidebar')).not.toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('heading', { level: 1, name: 'src/changed.ts' })).toBeVisible();
  } finally {
    await stopGeneratedCli(initial);
    await fixture.cleanup();
  }
});

test('packaged review renders an added file as one single-pane and accepts a comment', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const draftsPath = join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
  const commentBody = 'Packaged comment on the added file head line one.';
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(running));

    const treeRow = page.getByRole('treeitem', { name: /added\.ts/ });
    await expect(treeRow).toHaveAccessibleName(/single pane/i);
    await treeRow.click();
    await expect(page.getByText('Added · Head only')).toBeVisible();
    await expect(page.locator('.diff-workspace__editor')).toHaveCount(1);
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next change' })).toHaveCount(0);

    await activateSinglePaneLine(page, 'head', 'export const added = true;', 1);
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await expect(composer).toHaveCount(1);
    await expect(page.locator('.inline-comment-composer__header')).toContainText(
      'src/added.ts · Head line 1',
    );
    await composer.fill(commentBody);
    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);
    await expect(composer).toHaveCount(0);
  } finally {
    await stopGeneratedCli(running);
  }

  const [draftFile] = readdirSync(draftsPath).filter((file) => file.endsWith('.json'));
  expect(draftFile).toBeDefined();
  const draft = JSON.parse(readFileSync(join(draftsPath, draftFile!), 'utf8')) as {
    comments: Array<{ anchor: { line: number; selectedText: string; side: string }; body: string }>;
  };
  expect(draft.comments).toEqual([
    expect.objectContaining({
      body: commentBody,
      anchor: expect.objectContaining({
        line: 1,
        selectedText: 'export const added = true;',
        side: 'head',
      }),
    }),
  ]);

  await fixture.cleanup();
});

test('packaged review renders a deleted file as one single-pane and accepts a comment', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const draftsPath = join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'drafts');
  const commentBody = 'Packaged comment on the deleted file base line one.';
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(running));

    const treeRow = page.getByRole('treeitem', { name: /deleted\.ts/ });
    await expect(treeRow).toHaveAccessibleName(/single pane/i);
    await treeRow.click();
    await expect(page.getByText('Deleted · Base only')).toBeVisible();
    await expect(page.locator('.diff-workspace__editor')).toHaveCount(1);
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next change' })).toHaveCount(0);

    await activateSinglePaneLine(page, 'base', 'export const deleted = true;', 1);
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await expect(composer).toHaveCount(1);
    await expect(page.locator('.inline-comment-composer__header')).toContainText(
      'src/deleted.ts · Base line 1',
    );
    await composer.fill(commentBody);
    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);
    await expect(composer).toHaveCount(0);

    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/changed.ts' })).toBeVisible();
    await expect(
      page.getByText(/Added · Head only|Deleted · Base only|Type changed · Head only/),
    ).toHaveCount(0);
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(1);
  } finally {
    await stopGeneratedCli(running);
  }

  const [draftFile] = readdirSync(draftsPath).filter((file) => file.endsWith('.json'));
  expect(draftFile).toBeDefined();
  const draft = JSON.parse(readFileSync(join(draftsPath, draftFile!), 'utf8')) as {
    comments: Array<{ anchor: { line: number; selectedText: string; side: string }; body: string }>;
  };
  expect(draft.comments).toEqual([
    expect.objectContaining({
      body: commentBody,
      anchor: expect.objectContaining({
        line: 1,
        selectedText: 'export const deleted = true;',
        side: 'base',
      }),
    }),
  ]);

  await fixture.cleanup();
});
