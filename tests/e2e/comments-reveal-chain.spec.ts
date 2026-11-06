import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, Page, TestInfo } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

// Phase 24 follow-up (24-VERIFICATION.md): regression coverage for the Comments-tab
// row click/Enter → reveal chain (`CommentsTab.vue`'s `reveal` emit → `BottomPanel.vue`
// → `App.vue`'s `revealCommentFromPanel`). Pack/extract/spawn plumbing adapted from
// `tests/e2e/workbench-shell-smoke.spec.ts`'s shared helpers (itself adapted from
// `pinned-session.spec.ts`'s `mkdtempSync` + `npm pack` + `tar -xzf` +
// `dist/bin/${binCommand}.mjs` pattern), and comment-composer helpers adapted from
// `tests/e2e/inline-comment-threads.spec.ts`.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-reveal-chain-pack-`));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);
const fakeBinRoot = join(packedRoot, 'fake-bin');
test.setTimeout(90_000);

const loopbackUrlPattern = /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/;

interface PackResult {
  readonly filename: string;
}

interface RunningCli {
  readonly child: ChildProcess;
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
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the reveal-chain assertion: ${detail}`,
    );
  }
}

function spawnCli(repository: GitFixture): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      [`${RENAME_MAP.envPrefix}LAUNCH_OPTIONS`]: JSON.stringify({
        cwd: repository.nestedCwd,
        base: { label: 'Base fixture', revision: repository.baseRef },
        head: { label: 'Head fixture', revision: repository.headRef },
      }),
    },
    stdio: ['ignore', outputDescriptor, outputDescriptor],
  });
  return { child, outputPath, outputDescriptor };
}

async function waitForLoopbackUrl(running: RunningCli): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const output = existsSync(running.outputPath) ? readFileSync(running.outputPath, 'utf8') : '';
    const match = output.match(loopbackUrlPattern);
    if (match !== null) return match[0];
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      throw new Error(`[behavioral] packaged CLI exited before publishing a loopback URL:\n${output}`);
    }
    const { promise, resolve: resolveWait } = Promise.withResolvers<void>();
    setTimeout(resolveWait, 25);
    await promise;
  }
  throw new Error('[behavioral] timed out waiting for packaged CLI loopback URL');
}

async function stopGeneratedCli(running: RunningCli): Promise<void> {
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill('SIGINT');
    const events = running.child as unknown as EventEmitter;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    events.once('error', reject);
    events.once('exit', resolve);
    await promise;
  }
  closeSync(running.outputDescriptor);
}

function assertChromium(browser: Browser, testInfo: TestInfo): void {
  expect(testInfo.project.name).toBe('chromium');
  expect(browser.browserType().name()).toBe('chromium');
}

async function activateMonacoLine(page: Page, side: 'base' | 'head', text: string, lineNumber: number): Promise<void> {
  const editor = side === 'base' ? 'editor original' : 'editor modified';
  const editorSurface = page
    .locator(`.monaco-diff-editor .${editor.split(' ').join('.')} .monaco-scrollable-element.editor-scrollable`)
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
  const affordance = page.getByRole('button', { name: `Add comment to ${side} line ${lineNumber}` });
  await expect(affordance).toBeVisible();
  await affordance.click();
}

async function activateSinglePaneLine(page: Page, side: 'base' | 'head', text: string, lineNumber: number): Promise<void> {
  const sideWord = side === 'base' ? 'BASE' : 'HEAD';
  const editorSurface = page.locator('.diff-workspace__editor .monaco-scrollable-element.editor-scrollable').first();
  await editorSurface.click({ position: { x: 16, y: 16 } });
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText(String(lineNumber));
  await page.keyboard.press('Enter');
  const line = page.locator('.diff-workspace__editor').locator('.view-line').filter({ hasText: text });
  await expect(line).toBeVisible();
  await line.hover();
  await line.click();
  const affordance = page.getByRole('button', { name: `Add comment to ${sideWord} line ${lineNumber}` });
  await expect(affordance).toBeVisible();
  await affordance.click();
}

async function addComment(page: Page, body: string): Promise<string> {
  const composer = page.locator('.monaco-anchor-zone--composer textarea');
  await expect(composer).toHaveCount(1);
  await composer.fill(body);
  const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
  expect((await addResponse).status()).toBe(201);
  const thread = page.locator('.comment-thread').filter({ hasText: body });
  await expect(thread).toBeVisible();
  const commentId = await thread.getAttribute('data-comment-id');
  if (commentId === null) {
    throw new Error('[behavioral] newly added comment thread has no data-comment-id');
  }
  return commentId;
}

function threadLocator(page: Page, commentId: string) {
  return page.locator(`.comment-thread[data-comment-id="${commentId}"]`);
}

async function openCommentsTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
  const region = page.getByRole('region', { name: 'Review', exact: true });
  await expect(region).toBeVisible();
  await region.getByRole('tab', { name: 'Comments', exact: true }).click();
}

function commentsTabRow(page: Page, body: string) {
  return page.locator('.comments-tab__row').filter({ hasText: body });
}

test.beforeAll(() => {
  runPrerequisite(npmCommand, ['run', 'build']);
  const packOutput = runPrerequisite(npmCommand, [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    packedRoot,
  ]);
  const [packResult] = JSON.parse(packOutput) as PackResult[];
  runPrerequisite('tar', ['-xzf', join(packedRoot, packResult.filename), '-C', packedRoot]);
  symlinkSync(join(repositoryRoot, 'node_modules'), join(extractedPackageRoot, 'node_modules'), 'dir');

  mkdirSync(fakeBinRoot, { recursive: true });
  writeFileSync(join(packedRoot, 'fake-open.mjs'), '#!/usr/bin/env node\nprocess.exitCode = 1;\n', 'utf8');
  copyFileSync(join(packedRoot, 'fake-open.mjs'), join(fakeBinRoot, 'open'));
  chmodSync(join(fakeBinRoot, 'open'), 0o755);
});

test.afterAll(() => {
  rmSync(packedRoot, { force: true, recursive: true });
});

test('Comments-tab row click reveals same-file comment: expand, scroll, focus thread header (packaged binary)', async ({ browser }, testInfo) => {
  assertChromium(browser, testInfo);
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();

    // A single comment on `added.ts` (single-pane, status "added"), which is also the
    // file left open when we switch to the Comments tab below — the same-file case.
    await page.getByRole('treeitem', { name: /added\.ts/ }).click();
    const commentId = await activateSinglePaneLine(page, 'head', 'export const added = true;', 1).then(() =>
      addComment(page, 'Same file reveal target.'),
    );
    const thread = threadLocator(page, commentId);

    // Collapse it (new comments render expanded by default) so the reveal chain's
    // "expand the thread" step has an observable effect.
    await thread.locator('.thread-header').click();
    await expect(thread.locator('.conversation-card__body')).toHaveCount(0);

    // Move focus elsewhere first, so a later "focus moved to the thread header" assertion
    // proves the reveal chain moved it, not that it was already there.
    await page.locator('body').click({ position: { x: 4, y: 4 } });

    await openCommentsTab(page);
    await commentsTabRow(page, 'Same file reveal target.').click();

    // (a) File unchanged — still on added.ts.
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('added.ts');
    // (b) Thread expanded.
    await expect(thread.locator('.conversation-card__body')).toHaveCount(1);
    // (c) Scrolled into view.
    await expect(thread).toBeInViewport();
    // (d) Focus moved to the thread header.
    await expect(thread.locator('.thread-header')).toBeFocused();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('Comments-tab row Enter reveals cross-file comment: switch file, expand, scroll, focus thread header (packaged binary)', async ({ browser }, testInfo) => {
  assertChromium(browser, testInfo);
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();

    // A comment on `changed.ts` (two-pane diff).
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    const crossFileCommentId = await activateMonacoLine(page, 'base', 'export const stableContext3 = 3;', 3).then(() =>
      addComment(page, 'Cross file reveal target.'),
    );
    const crossFileThread = threadLocator(page, crossFileCommentId);
    await crossFileThread.locator('.thread-header').click();
    await expect(crossFileThread.locator('.conversation-card__body')).toHaveCount(0);

    // Switch to a different file (`added.ts`), so the comment above is off-screen on a
    // file that is not currently selected — this is the riskier cross-file case, forcing
    // `revealCommentFromPanel` through its Monaco diff editor teardown/remount path.
    await page.getByRole('treeitem', { name: /added\.ts/ }).click();
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('added.ts');

    await openCommentsTab(page);
    const row = commentsTabRow(page, 'Cross file reveal target.');
    await row.focus();
    await page.keyboard.press('Enter');

    // (a) File switched to changed.ts.
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('changed.ts');
    // (b) Thread expanded.
    await expect(crossFileThread.locator('.conversation-card__body')).toHaveCount(1);
    // (c) Scrolled into view.
    await expect(crossFileThread).toBeInViewport();
    // (d) Focus moved to the thread header.
    await expect(crossFileThread.locator('.thread-header')).toBeFocused();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
