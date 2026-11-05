import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  closeSync,
  chmodSync,
  copyFileSync,
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
import type { Browser, Page, Request, TestInfo } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-threads-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before inline comment thread behavior: ${error instanceof Error ? error.message : String(error)}`,
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
  const browserMarkerPath = join(packedRoot, `browser-open-${crypto.randomUUID()}.log`);
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

function startGeneratedStandaloneCli(repository: GitFixture, paths: readonly string[]): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const browserMarkerPath = join(packedRoot, `browser-open-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath, ...paths], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      [`${RENAME_MAP.envPrefix}BROWSER_OPEN_MARKER`]: browserMarkerPath,
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

async function openGeneratedStandaloneReview(page: Page, url: string, fileCount: number): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const endpoints = page.getByRole('banner');
  await expect(endpoints.getByText('STANDALONE', { exact: true })).toBeVisible();
  await expect(page.locator('.identity-pill')).toContainText(`${fileCount} file`);
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
  const affordance = page.getByRole('button', { name: `Add comment to ${side} line ${lineNumber}` });
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

test('packaged inline comment threads: resolve, edit, collapse-all, and Option+F9/Shift+Option+F9 cross-file navigation (committed two-pane session)', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const running = startGeneratedCli(fixture);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(running));

    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    const commentA = await (async () => {
      await activateMonacoLine(page, 'base', 'export const stableContext3 = 3;', 3);
      return addComment(page, 'Resolve me.');
    })();
    const commentB = await (async () => {
      await activateMonacoLine(page, 'base', 'export const stableContext5 = 5;', 5);
      return addComment(page, 'Edit me.');
    })();

    // Resolve thread A.
    const threadA = threadLocator(page, commentA);
    const resolveResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await threadA.getByRole('button', { name: 'Resolve thread' }).click();
    expect((await resolveResponse).status()).toBe(200);
    await expect(threadA.locator('.review-state-badge')).toContainText('Resolved');

    // Edit-and-save thread B.
    const threadB = threadLocator(page, commentB);
    await threadB.getByRole('button', { name: 'Edit comment' }).click();
    await threadB.locator('textarea').fill('Edited comment body.');
    const saveResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await threadB.getByRole('button', { name: 'Save edit' }).click();
    expect((await saveResponse).status()).toBe(200);
    await expect(threadB).toContainText('Edited comment body.');

    // Edit thread B again, this time saving via the ⌘Enter/Ctrl+Enter keyboard shortcut
    // instead of the Save-edit button — regression for a Phase 23 gap where the shared
    // `.inline-comment-composer` keydown handler routed an existing thread's edit textarea
    // to the new-comment composer's reducer instead of the thread's own save/cancel path.
    await threadB.getByRole('button', { name: 'Edit comment' }).click();
    const editTextareaB = threadB.locator('textarea');
    await editTextareaB.fill('Keyboard-saved body.');
    const keyboardSaveResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await editTextareaB.press('Control+Enter');
    expect((await keyboardSaveResponse).status()).toBe(200);
    await expect(threadB).toContainText('Keyboard-saved body.');
    await expect(threadB.locator('textarea')).toHaveCount(0);

    // Collapse-all / expand-all from the editor title.
    await page.getByRole('button', { name: 'Collapse all threads' }).click();
    await expect(threadA.locator('.conversation-card__body')).toHaveCount(0);
    await expect(threadB.locator('.conversation-card__body')).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand all threads' }).click();
    await expect(threadA.locator('.conversation-card__body')).toHaveCount(1);
    await expect(threadB.locator('.conversation-card__body')).toHaveCount(1);

    // Collapse B specifically (while still viewing changed.ts, where its thread exists)
    // ahead of the cross-file navigation below.
    await threadB.locator('.thread-header').click();
    await expect(threadB.locator('.conversation-card__body')).toHaveCount(0);

    // A third thread in a different file, for cross-file navigation. `added.ts` renders
    // single-pane (status "added").
    await page.getByRole('treeitem', { name: /added\.ts/ }).click();
    const commentC = await (async () => {
      await activateSinglePaneLine(page, 'head', 'export const added = true;', 1);
      return addComment(page, 'Cross file jump target.');
    })();
    const threadC = threadLocator(page, commentC);
    // Collapse C via its own header toggle, so whichever thread turns out to be "last"
    // below, the inside-editor jump proves it re-expands.
    await threadC.locator('.thread-header').click();
    await expect(threadC.locator('.conversation-card__body')).toHaveCount(0);

    // Tree-path order (THREAD-07) depends on the fixture's own file ordering, not an
    // assumption here: read it from the rendered tree so the wraparound assertions below
    // are correct regardless of which of the two files sorts first.
    const addedBox = await page.getByRole('treeitem', { name: /added\.ts/ }).boundingBox();
    const changedBox = await page.getByRole('treeitem', { name: /changed\.ts/ }).boundingBox();
    const addedIsFirst = (addedBox?.y ?? 0) < (changedBox?.y ?? 0);
    const firstThread = addedIsFirst ? threadC : threadA;
    const lastThread = addedIsFirst ? threadB : threadC;
    const firstFileName = addedIsFirst ? 'added.ts' : 'changed.ts';
    const lastFileName = addedIsFirst ? 'changed.ts' : 'added.ts';

    // Inside the editor: with no thread focused, Option+F9 (previous) lands on the last
    // thread in cross-file order, switching files if needed and re-expanding it.
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('changed.ts');
    const editorSurface = page.locator('.monaco-diff-editor .editor.original .monaco-scrollable-element.editor-scrollable').first();
    await editorSurface.click({ position: { x: 16, y: 16 } });
    await page.keyboard.press('Alt+F9');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText(lastFileName);
    await expect(lastThread.locator('.conversation-card__body')).toHaveCount(1);

    // Outside the editor: from the first thread, Option+F9 (previous) wraps backward past
    // the first thread to the last, switching files and announcing the locked verbatim
    // wraparound message.
    await page.getByRole('treeitem', { name: addedIsFirst ? /added\.ts/ : /changed\.ts/ }).click();
    await firstThread.locator('.thread-header').focus();
    await page.keyboard.press('Alt+F9');
    await expect(page.locator('[data-announcement-version]')).toHaveText('Wrapped to last thread');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText(lastFileName);

    // From the last thread, Shift+Option+F9 (next) wraps forward past the last thread to
    // the first, switching files back and announcing the locked verbatim wraparound message.
    await lastThread.locator('.thread-header').focus();
    await page.keyboard.press('Shift+Alt+F9');
    await expect(page.locator('[data-announcement-version]')).toHaveText('Wrapped to first thread');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText(firstFileName);
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('packaged inline comment threads: Escape cancels an existing thread\'s inline edit without sending a mutation (standalone single-pane session)', async ({ browser }) => {
  // Regression for a Phase 23 gap: App.vue's document-level keydown handler matched any
  // textarea inside `.inline-comment-composer` to route ⌘Enter/Esc to the new-comment
  // composer's reducer, even though CommentThread.vue's edit-mode textarea reuses that
  // same class — so pressing Esc while editing an existing thread silently no-opped
  // instead of cancelling the edit. Covers the Esc/cancel half; the ⌘Enter/save half is
  // covered by the keyboard-save assertion in the "resolve, edit, collapse-all" test above.
  const fixture = await createGitFixture();
  await fixture.write('src/notes.ts', [
    'export const noteOne = 1;',
    'export const noteTwo = 2;',
    '',
  ].join('\n'));
  const running = startGeneratedStandaloneCli(fixture, ['src/notes.ts']);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedStandaloneReview(page, url, 1);

    await activateSinglePaneLine(page, 'head', 'export const noteOne = 1;', 1);
    const commentId = await addComment(page, 'Original body.');

    let mutationFired = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/draft/mutations')) mutationFired = true;
    });

    const thread = threadLocator(page, commentId);
    await thread.getByRole('button', { name: 'Edit comment' }).click();
    const editTextarea = thread.locator('textarea');
    await editTextarea.fill('Should not persist.');
    await editTextarea.press('Escape');
    await expect(thread.locator('textarea')).toHaveCount(0);
    await expect(thread).toContainText('Original body.');
    await expect(thread).not.toContainText('Should not persist.');
    expect(mutationFired).toBe(false);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('packaged inline comment threads: delete with Undo, and delete-expiry sends exactly one request (standalone single-pane session)', async ({ browser }) => {
  const fixture = await createGitFixture();
  await fixture.write('src/notes.ts', [
    'export const noteOne = 1;',
    'export const noteTwo = 2;',
    '',
  ].join('\n'));
  const running = startGeneratedStandaloneCli(fixture, ['src/notes.ts']);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedStandaloneReview(page, url, 1);

    await activateSinglePaneLine(page, 'head', 'export const noteOne = 1;', 1);
    const commentA = await addComment(page, 'Delete me, then undo.');
    await activateSinglePaneLine(page, 'head', 'export const noteTwo = 2;', 2);
    const commentB = await addComment(page, 'Delete me, let it expire.');

    const mutationRequestBodies: Array<{ type: string; commentId?: string }> = [];
    page.on('request', (request) => {
      if (!request.url().includes('/api/draft/mutations')) return;
      try {
        mutationRequestBodies.push(request.postDataJSON() as { type: string; commentId?: string });
      } catch {
        // non-JSON body, ignore
      }
    });

    // Delete thread A, then Undo within the 5s window: the thread reappears and no
    // deleteComment request is ever sent.
    const threadA = threadLocator(page, commentA);
    await threadA.getByRole('button', { name: 'Delete thread' }).click();
    await expect(threadA).toHaveCount(0);
    const undoToast = page.locator('.undo-toast');
    await expect(undoToast).toBeVisible();
    await expect(undoToast).toContainText('Comment deleted');
    await undoToast.getByRole('button', { name: 'Undo' }).click();
    await expect(threadA).toBeVisible();
    await expect(undoToast).toHaveCount(0);
    await page.waitForTimeout(5_500);
    expect(mutationRequestBodies.filter((request) => request.type === 'deleteComment' && request.commentId === commentA)).toHaveLength(0);

    // Delete thread B and let the toast expire: exactly one deleteComment request fires,
    // never zero, never two.
    const threadB = threadLocator(page, commentB);
    await threadB.getByRole('button', { name: 'Delete thread' }).click();
    await expect(threadB).toHaveCount(0);
    await page.waitForTimeout(5_500);
    const deleteRequestsForB = mutationRequestBodies.filter(
      (request) => request.type === 'deleteComment' && request.commentId === commentB,
    );
    expect(deleteRequestsForB).toHaveLength(1);
    await expect(threadB).toHaveCount(0);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});
