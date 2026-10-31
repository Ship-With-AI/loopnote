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
const packedRoot = mkdtempSync(join(tmpdir(), 'cumpa-rendered-md-pack-'));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before rendered Markdown preview behavior: ${error instanceof Error ? error.message : String(error)}`,
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

test('toggles source and rendered views in single-pane and side-by-side layouts', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ markdownPreview: true });
  const running = startGeneratedCli(fixture);

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(running));

    // Side-by-side: docs/preview.md is modified on both sides.
    await page.getByRole('treeitem', { name: /preview\.md/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'docs/preview.md' })).toBeVisible();
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(1);

    const sourceToggle = page.getByRole('button', { name: 'Source' });
    const renderedToggle = page.getByRole('button', { name: 'Rendered' });
    await expect(sourceToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(renderedToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();

    await renderedToggle.click();
    await expect(renderedToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(sourceToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.diff-workspace__editor')).toBeHidden();
    await expect(page.locator('.diff-workspace__editor')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.rendered-block').filter({ hasText: 'Preview Heading' }).first()).toBeVisible();

    await sourceToggle.click();
    await expect(sourceToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    await expect(page.locator('.diff-workspace__editor')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(1);

    // Single-pane: docs/added-note.md exists only on head.
    const addedTreeRow = page.getByRole('treeitem', { name: /added-note\.md/ });
    await expect(addedTreeRow).toHaveAccessibleName(/single pane/i);
    await addedTreeRow.click();
    await expect(page.getByText('Added · Head only')).toBeVisible();
    await expect(page.locator('.diff-workspace__editor')).toHaveCount(1);
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);

    const singlePaneSource = page.getByRole('button', { name: 'Source' });
    const singlePaneRendered = page.getByRole('button', { name: 'Rendered' });
    await expect(singlePaneSource).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();

    await singlePaneRendered.click();
    await expect(singlePaneRendered).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.diff-workspace__editor')).toBeHidden();
    await expect(page.locator('.rendered-block').filter({ hasText: 'Added Note' }).first()).toBeVisible();

    await singlePaneSource.click();
    await expect(singlePaneSource).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('adds a comment from a rendered block and sees its full source range anchored and highlighted (A-01)', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ markdownPreview: true });
  const commentBody = 'Packaged comment on the rendered paragraph block.';
  const running = startGeneratedCli(fixture);

  try {
    await openGeneratedReview(page, await waitForLoopbackUrl(running));

    await page.getByRole('treeitem', { name: /preview\.md/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'docs/preview.md' })).toBeVisible();
    await page.getByRole('button', { name: 'Rendered' }).click();
    await expect(page.locator('.diff-workspace__editor')).toBeHidden();

    // The head pane's paragraph is uniquely identifiable by its "(edited on head)" text,
    // which this plan's markdownPreview fixture appends only to the head-side paragraph.
    const headParagraph = page.locator('.rendered-block').filter({ hasText: '(edited on head)' });
    await expect(headParagraph).toBeVisible();
    await headParagraph.hover();
    const addButton = headParagraph.getByRole('button', { name: 'Add comment · Head · paragraph' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    const composer = page.getByRole('textbox', { name: 'Comment' });
    await expect(composer).toBeVisible();
    await expect(page.locator('.rendered-markdown .inline-comment-composer__header')).toContainText('docs/preview.md · Head line 7');
    await composer.fill(commentBody);

    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.getByRole('button', { name: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);
    await expect(composer).toHaveCount(0);

    const renderedComment = page.locator('.rendered-markdown .conversation-card.inline-accepted-comment');
    await expect(renderedComment).toBeVisible();
    await expect(renderedComment.locator('.conversation-card__identity')).toContainText('docs/preview.md');
    await expect(renderedComment.locator('.conversation-card__identity')).toContainText('Head · paragraph');
    await expect(renderedComment.locator('.conversation-card__body')).toContainText(commentBody);

    // Switch back to Source and confirm the same comment reopens at the Markdown
    // paragraph's first source line, with the Monaco decoration spanning the full
    // stored range (both source lines of the two-line paragraph), not just line one.
    await page.getByRole('button', { name: 'Source' }).click();
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();

    const sourceComment = page.locator('.monaco-anchor-zone--composer .conversation-card.inline-accepted-comment');
    await expect(sourceComment).toBeVisible();
    await expect(sourceComment.locator('.conversation-card__identity')).toContainText('docs/preview.md');
    await expect(sourceComment.locator('.conversation-card__identity')).toContainText('Head · line 7');
    await expect(sourceComment.locator('.conversation-card__body')).toContainText(commentBody);

    await expect(page.locator('.monaco-anchor-line')).toHaveCount(2);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});
