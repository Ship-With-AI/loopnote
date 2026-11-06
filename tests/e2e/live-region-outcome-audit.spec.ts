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
// `tests/e2e/workbench-shell-smoke.spec.ts:1-43` (same convention
// `tests/e2e/live-region-announcements.spec.ts` already uses) — one packaged
// binary is built once and reused by every test in this file.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-live-region-outcome-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the live-region outcome assertion: ${detail}`,
    );
  }
}

/**
 * Generic packaged-binary spawn, parameterized over the distinct launch
 * shapes the real CLI exposes: positional CLI args (`--staged`), the
 * interactive `LAUNCH_OPTIONS` env var, or a plain launch with neither
 * (copied from `tests/e2e/workbench-shell-smoke.spec.ts:67-107`).
 */
function spawnCli(
  repository: GitFixture,
  options: Readonly<{
    args?: readonly string[];
    launchOptions?: Readonly<{ base: { label: string; revision: string }; head: { label: string; revision: string } }>;
    request?: unknown;
  }> = {},
): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath, ...(options.args ?? [])], {
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
    stdio: [options.request === undefined ? 'ignore' : 'pipe', outputDescriptor, outputDescriptor],
  });
  if (options.request !== undefined) child.stdin?.end(JSON.stringify(options.request));
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

function anchoredLaunchOptions(repository: GitFixture) {
  return {
    base: { label: 'Base fixture', revision: repository.baseRef },
    head: { label: 'Head fixture', revision: repository.headRef },
  };
}

// Live-region announcement proof, same locator/assertion idiom as
// `tests/e2e/live-region-announcements.spec.ts`'s `liveRegion`/`assertAnnouncement`:
// `App.vue`'s single `announce()` owner (`App.vue:497-500`) is the only live
// region in the shell (`.visually-hidden[aria-live="polite"]`, the e2e
// full-shell root 25-02-PLAN.md's Task 1 already established).
function liveRegion(page: Page) {
  return page.locator('.visually-hidden[aria-live="polite"]');
}

async function liveRegionVersion(page: Page): Promise<number> {
  return Number(await liveRegion(page).locator('span').getAttribute('data-announcement-version'));
}

async function assertAnnouncement(page: Page, trigger: () => Promise<void>, expectedMessage: string): Promise<void> {
  const before = await liveRegionVersion(page);
  await trigger();
  await expect(liveRegion(page)).toHaveText(expectedMessage);
  expect(await liveRegionVersion(page)).toBe(before + 1);
}

// Comment-thread helpers, adapted from `tests/e2e/marketplace-review.spec.ts:30-43`'s
// `addHeadComment` (Meta+g line-jump + Add comment) and
// `tests/e2e/inline-comment-threads.spec.ts:211-213`'s `threadLocator` idiom.
async function addHeadComment(page: Page, body: string): Promise<string> {
  await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText('10');
  await page.keyboard.press('Enter');
  const line = page
    .locator('.monaco-diff-editor .editor.modified .view-line')
    .filter({ hasText: 'export const stableContext10 = 10;' });
  await expect(line).toBeVisible();
  await line.click();
  await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
  const composer = page.locator('.monaco-anchor-zone--composer textarea');
  await expect(composer).toHaveCount(1);
  await composer.fill(body);
  const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
  expect((await accepted).status()).toBe(201);
  const thread = page.locator('.comment-thread').filter({ hasText: body });
  await expect(thread).toBeVisible();
  const commentId = await thread.getAttribute('data-comment-id');
  if (commentId === null) {
    throw new Error('[behavioral] newly added comment thread has no data-comment-id');
  }
  return commentId;
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

// 1/5. Thread resolve/reopen/delete — already-shipped `announce()` call sites
// in `mutateReview()` (`App.vue:790-799`); never proven against the real
// packaged binary before this plan.
test('resolve, reopen, and delete each announce exactly once with open/resolved counts', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    const commentId = await addHeadComment(page, 'Resolve, reopen, then delete me.');
    const thread = page.locator(`.comment-thread[data-comment-id="${commentId}"]`);

    await assertAnnouncement(
      page,
      () => thread.getByRole('button', { name: 'Resolve thread' }).click(),
      'Comment resolved. 0 open, 1 resolved.',
    );
    await assertAnnouncement(
      page,
      () => thread.getByRole('button', { name: 'Reopen thread' }).click(),
      'Comment reopened. 1 open, 0 resolved.',
    );

    // The click only begins a 5-second client-side undo window
    // (`beginPendingDelete`, `App.vue:398-406`) before the real `deleteComment`
    // mutation — and its announcement — fires; wait it out the same way
    // `tests/e2e/inline-comment-threads.spec.ts:542`'s undo-toast-expiry case does.
    const before = await liveRegionVersion(page);
    await thread.getByRole('button', { name: 'Delete thread' }).click();
    await expect(thread).toHaveCount(0);
    await expect(page.locator('.undo-toast')).toBeVisible();
    await page.waitForTimeout(5_500);
    await expect(liveRegion(page)).toHaveText('Comment deleted. 0 open, 0 resolved.');
    expect(await liveRegionVersion(page)).toBe(before + 1);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 2/5. Refresh (working-tree drift) — already-shipped `announce()` call site
// in the `worktreeChanged` watcher (`App.vue:487-490`); never proven against
// the real packaged binary before this plan.
test('refresh announces working-tree drift exactly once', async ({ browser }) => {
  const repository = await createGitFixture();
  await repository.write('src/added.ts', 'export const added = true;\n');
  repository.git(['add', 'src/added.ts']);
  const running = spawnCli(repository, { args: ['--staged'] });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    // A real edit made entirely outside Loopnote, after the session snapshot
    // was captured. `--staged` reviews HEAD→index (git diff --cached), so the
    // edit must be re-staged to register as drift the background poll can see.
    await repository.write('src/added.ts', 'export const added = true;\nexport const extra = 1;\n');
    repository.git(['add', 'src/added.ts']);

    const before = await liveRegionVersion(page);
    // Trigger the background worktree-drift poll (`refreshWorktreeIndicatorWhenVisible`,
    // `App.vue:1377-1381`) the same way `tests/e2e/complete-review-draft.spec.ts:769-777`
    // reaches it: a hidden->visible visibilitychange round trip.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect.poll(() => liveRegionVersion(page)).toBe(before + 1);
    await expect(liveRegion(page)).toHaveText('Working tree changed since snapshot.');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

// 3/5. Export — already-shipped `announce()` call site in the export-result
// handler (`App.vue:844-845`); never proven against the real packaged binary
// before this plan.
test('export announces completion exactly once', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    // Save-summary step adapted from `tests/e2e/marketplace-review.spec.ts:45-57`'s
    // `saveSummaryAndExport` — this non-attached session's panel defaults to the
    // Comments tab, so the Summary tab must be selected explicitly first.
    await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Summary' }).click();
    await page.getByRole('button', { name: 'Write summary' }).click();
    await page.getByLabel('Review summary (Markdown)').fill('Export outcome summary.');
    const saved = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.getByRole('button', { name: 'Save summary' }).click();
    expect((await saved).status()).toBe(200);

    // Non-attached sessions default to the Comments tab; `ExportTab`'s
    // `v-if="activeTab === 'export'"` (`BottomPanel.vue:190`) means the Export
    // tab must be selected before `Export review` renders.
    await page.getByRole('tab', { name: 'Export' }).click();
    const before = await liveRegionVersion(page);
    const exported = page.waitForResponse((response) => response.url().includes('/api/export'));
    await page.getByRole('button', { name: 'Export review', exact: true }).click();
    // `exportReview()` (`App.vue:833,845`) announces twice in sequence: a
    // checking-start notice synchronously on click, then the result once the
    // request resolves — each individual transition still fires exactly once.
    await expect(liveRegion(page)).toHaveText('Checking accepted revision for export.');
    expect(await liveRegionVersion(page)).toBe(before + 1);
    expect((await exported).status()).toBe(201);

    await expect(liveRegion(page)).toHaveText('Review export complete. Both files were published together.');
    expect(await liveRegionVersion(page)).toBe(before + 2);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
