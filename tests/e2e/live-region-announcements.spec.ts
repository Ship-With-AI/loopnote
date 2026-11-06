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
import type { Page } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { openRuntimeSession } from '../helpers/open-runtime-session.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

// Shared pack/extract/spawn plumbing, copied verbatim from
// `tests/e2e/toolbar-roles.spec.ts` (itself copied from
// `tests/e2e/workbench-shell-smoke.spec.ts:1-37, 46-135`) — one packaged
// binary is built once and reused by every test in this file.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-live-region-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the live-region announcement assertion: ${detail}`,
    );
  }
}

function spawnCli(
  repository: GitFixture,
  options: Readonly<{
    launchOptions?: Readonly<{ base: { label: string; revision: string }; head: { label: string; revision: string } }>;
  }> = {},
): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      ...(options.launchOptions === undefined
        ? {}
        : {
            [`${RENAME_MAP.envPrefix}LAUNCH_OPTIONS`]: JSON.stringify({
              cwd: repository.nestedCwd,
              ...options.launchOptions,
            }),
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

async function openBottomPanel(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle panel (⌘J)' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

function anchoredLaunchOptions(repository: GitFixture) {
  return {
    base: { label: 'Base fixture', revision: repository.baseRef },
    head: { label: 'Head fixture', revision: repository.headRef },
  };
}

// Live-region announcement proof, per `25-UI-SPEC.md`'s Live-Region
// Announcement Contract: `App.vue`'s single `announce()` owner
// (`App.vue:494-497`) is the only live region in the shell
// (`.visually-hidden[aria-live="polite"]`, the e2e full-shell root — not the
// `.session-shell >`-prefixed selector the integration specs use). Each
// assertion below captures the `data-announcement-version` counter before
// triggering a single real user action, then asserts both the exact locked
// copy and an exact +1 version delta — stronger than
// `tests/integration/anchored-workspace.spec.ts:1050-1079`'s weaker
// `.not.toBe(firstVersion)` form.
function liveRegion(page: Page) {
  return page.locator('.visually-hidden[aria-live="polite"]');
}

async function assertAnnouncement(
  page: Page,
  trigger: () => Promise<void>,
  expectedMessage: string | (() => Promise<string>),
): Promise<void> {
  const region = liveRegion(page);
  const before = Number(await region.locator('span').getAttribute('data-announcement-version'));
  await trigger();
  const message = typeof expectedMessage === 'string' ? expectedMessage : await expectedMessage();
  await expect(region).toHaveText(message);
  const after = Number(await region.locator('span').getAttribute('data-announcement-version'));
  expect(after).toBe(before + 1);
}

// Shared comment-thread helpers, copied from the same pattern
// `tests/e2e/inline-comment-threads.spec.ts` establishes (`activateMonacoLine`,
// `addComment`, `threadLocator`) — one comment thread on `src/changed.ts` is
// enough fixture state for the thread-collapse, collapse-all, and Undo outcomes.
async function activateMonacoLine(
  page: Page,
  side: 'base' | 'head',
  text: string,
  lineNumber: number,
): Promise<void> {
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
  writeFileSync(
    join(packedRoot, 'fake-open.mjs'),
    '#!/usr/bin/env node\nprocess.exitCode = 1;\n',
    'utf8',
  );
  copyFileSync(join(packedRoot, 'fake-open.mjs'), join(fakeBinRoot, 'open'));
  chmodSync(join(fakeBinRoot, 'open'), 0o755);
});

test.afterAll(() => {
  rmSync(packedRoot, { force: true, recursive: true });
});

// 1. Panel tab switch — `App.vue`'s `<BottomPanel>` has no listener wired to
// `announce()` today (only `panelState.setActiveTab` directly).
test('panel tab switch announces exactly once per tab, with the tab label', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);
    await openBottomPanel(page);

    await assertAnnouncement(page, () => page.getByRole('tab', { name: 'Summary' }).click(), 'Summary tab selected.');
    await assertAnnouncement(page, () => page.getByRole('tab', { name: 'Export' }).click(), 'Export tab selected.');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 2. Single-thread collapse/expand — `toggleCommentCollapse` has no
// `announce()` call today.
test('single-thread collapse and expand each announce exactly once', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateMonacoLine(page, 'base', 'export const stableContext3 = 3;', 3);
    const commentId = await addComment(page, 'Collapse me.');
    const thread = threadLocator(page, commentId);

    await assertAnnouncement(page, () => thread.locator('.thread-header').click(), 'Thread collapsed.');
    await assertAnnouncement(page, () => thread.locator('.thread-header').click(), 'Thread expanded.');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 3. Collapse-all / expand-all — `toggleThreadsCollapsed` has no
// `announce()` call today.
test('collapse-all and expand-all each announce exactly once', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateMonacoLine(page, 'base', 'export const stableContext3 = 3;', 3);
    await addComment(page, 'Collapse-all target.');

    await assertAnnouncement(
      page,
      () => page.getByRole('button', { name: 'Collapse all threads' }).click(),
      'All threads collapsed.',
    );
    await assertAnnouncement(
      page,
      () => page.getByRole('button', { name: 'Expand all threads' }).click(),
      'All threads expanded.',
    );

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 4. File-tree view-mode toggle (TREE-04) — `toggleTreeViewMode` has no
// `announce()` call today.
test('file-tree view-mode toggle announces exactly once per toggle', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const viewModeToggle = navigation.getByRole('button', { name: /View as (list|tree)/ });

    await assertAnnouncement(page, () => viewModeToggle.click(), 'Viewing as list.');
    await assertAnnouncement(page, () => viewModeToggle.click(), 'Viewing as tree.');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 5. File-tree filter match count (TREE-03) — no `filterResult` emit exists on
// `FileTree.vue` today and no listener exists on `App.vue`'s file tree.
test('file-tree filter match count announces exactly once after the 400ms debounce settles', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    await navigation.getByRole('button', { name: /Filter changed files/ }).click();
    const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
    await expect(filter).toBeFocused();

    // "added" is a substring of exactly one fixture file (`src/added.ts`).
    // Read the instant "N of M" badge `FileTree.vue` already renders
    // synchronously (untouched by this plan) to build the expected sentence
    // without hardcoding the fixture's total file count.
    await assertAnnouncement(page, () => filter.fill('added'), async () => {
      const badge = (await navigation.locator('.filter .n').textContent())?.trim();
      if (badge === undefined || badge === '') {
        throw new Error('[behavioral] filter match badge did not render after typing a matching query');
      }
      return `${badge} files match.`;
    });

    // A query with no match in any fixture filename announces the locked
    // zero-match sentence, reusing `FileTree.vue`'s empty-state copy.
    await assertAnnouncement(page, () => filter.fill('zzzznomatch'), 'No changed files match "zzzznomatch".');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 6. Markdown source/rendered toggle — `setFileMode` has no `announce()` call
// today.
test('Markdown source/rendered toggle announces exactly once per toggle', async ({ browser }) => {
  const repository = await createGitFixture({ markdownPreview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    await page.getByRole('treeitem', { name: /preview\.md/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'docs/preview.md' })).toBeVisible();

    await assertAnnouncement(
      page,
      () => page.getByRole('button', { name: 'Markdown rendered preview' }).click(),
      'Showing rendered Markdown.',
    );
    await assertAnnouncement(
      page,
      () => page.getByRole('button', { name: 'Markdown source' }).click(),
      'Showing Markdown source.',
    );

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 7. Undo count-context fix — `undoPendingDelete` announces the bare
// 'Comment restored.' today, not the `{open} open, {resolved} resolved.`
// count-context its resolve/reopen/delete siblings carry.
test('Undo restores a deleted comment and announces the resulting open/resolved counts', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateMonacoLine(page, 'base', 'export const stableContext3 = 3;', 3);
    const commentId = await addComment(page, 'Delete me, then undo.');
    const thread = threadLocator(page, commentId);

    await thread.getByRole('button', { name: 'Delete thread' }).click();
    await expect(thread).toHaveCount(0);
    const undoToast = page.locator('.undo-toast');
    await expect(undoToast).toBeVisible();

    await assertAnnouncement(
      page,
      () => undoToast.getByRole('button', { name: 'Undo' }).click(),
      'Comment restored. 1 open, 0 resolved.',
    );
    await expect(thread).toBeVisible();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
