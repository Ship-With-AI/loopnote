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
import type { Browser, Page, Request, TestInfo } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

// Phase 24 follow-up (24-VERIFICATION.md): regression coverage for
// `SummarySection.vue`'s debounced 800ms autosave (`watch(() => props.modelValue, ...)`).
//
// No precedent exists in this repo for mounting a real `.vue` SFC in `tests/unit`: the
// only `tests/unit/*.test.ts` files that import a `.vue` path (e.g. `status-bar.test.ts`,
// `comment-thread.test.ts`) import pure functions exported from that SFC's non-setup
// `<script lang="ts">` block, never `mount()` the component — and `vitest.config.ts` runs
// `environment: 'node'` with no `@vue/test-utils`/`jsdom`/`happy-dom` dependency installed.
// Per this phase's own constraint (no new testing library/dependency), this is therefore a
// packaged-binary Playwright e2e test, using `page.clock` fake timers against the real
// autosave watcher, following the pack/extract/spawn plumbing shared with
// `tests/e2e/workbench-shell-smoke.spec.ts` and the Summary-tab-opening flow in
// `tests/e2e/complete-review-draft.spec.ts`.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-summary-autosave-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the autosave assertion: ${detail}`,
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

async function openSummaryEditTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
  const region = page.getByRole('region', { name: 'Review', exact: true });
  await expect(region).toBeVisible();
  await region.getByRole('tab', { name: 'Summary', exact: true }).click();
  await page.getByRole('button', { name: 'Write summary' }).click();
}

/** Mutation POSTs to `/api/draft/mutations` observed since this was created. */
function trackMutationRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/draft/mutations')) requests.push(request);
  });
  return requests;
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

test('pausing after typing for just over 800ms autosaves the summary exactly once (packaged binary)', async ({ browser }, testInfo) => {
  assertChromium(browser, testInfo);
  const repository = await createGitFixture();
  const running = spawnCli(repository);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    await openSummaryEditTab(page);

    const summaryEditor = page.getByLabel('Review summary (Markdown)');
    const mutationRequests = trackMutationRequests(page);

    await page.clock.install();
    await summaryEditor.fill('Autosaved summary body.');
    expect(mutationRequests).toHaveLength(0);

    await page.clock.fastForward(850);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(mutationRequests).toHaveLength(1);
    expect(JSON.parse(mutationRequests[0]!.postData() ?? '{}')).toMatchObject({
      type: 'setSummary',
      markdown: 'Autosaved summary body.',
    });

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('a new keystroke before 800ms resets the autosave timer (no premature save)', async ({ browser }, testInfo) => {
  assertChromium(browser, testInfo);
  const repository = await createGitFixture();
  const running = spawnCli(repository);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    await openSummaryEditTab(page);

    const summaryEditor = page.getByLabel('Review summary (Markdown)');
    const mutationRequests = trackMutationRequests(page);

    await page.clock.install();
    await summaryEditor.fill('First draft.');
    await page.clock.fastForward(500);
    expect(mutationRequests).toHaveLength(0);

    // Keystroke at the 500ms mark resets the timer. If it hadn't, the original timer
    // (armed at t=0) would already have fired by t=800, which the next fastForward
    // crosses (t=1000) — so finding zero requests here proves the reset.
    await summaryEditor.fill('Second draft.');
    await page.clock.fastForward(500);
    expect(mutationRequests).toHaveLength(0);

    // 800ms after the *second* keystroke (t=500+800=1300) the reset timer fires.
    await page.clock.fastForward(300);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(mutationRequests).toHaveLength(1);
    expect(JSON.parse(mutationRequests[0]!.postData() ?? '{}')).toMatchObject({
      markdown: 'Second draft.',
    });

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('unmounting the Summary tab before the timer fires cancels the pending autosave', async ({ browser }, testInfo) => {
  assertChromium(browser, testInfo);
  const repository = await createGitFixture();
  const running = spawnCli(repository);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.diff-workspace__editor')).toBeVisible();
    await openSummaryEditTab(page);

    const summaryEditor = page.getByLabel('Review summary (Markdown)');
    const mutationRequests = trackMutationRequests(page);

    await page.clock.install();
    await summaryEditor.fill('Never saved because tab closes.');
    await page.clock.fastForward(300);
    expect(mutationRequests).toHaveLength(0);

    // Switching tabs unmounts `SummaryTab`/`SummarySection` (`BottomPanel.vue`'s
    // `v-if="activeTab === 'summary'"`), which must run `onBeforeUnmount`'s
    // `clearTimeout(autosaveTimer)` — the only thing that can stop the pending save.
    const region = page.getByRole('region', { name: 'Review', exact: true });
    await region.getByRole('tab', { name: 'Comments', exact: true }).click();
    await expect(page.getByLabel('Review summary (Markdown)')).toHaveCount(0);

    await page.clock.fastForward(2_000);
    expect(mutationRequests).toHaveLength(0);

    // The lifted `summaryBuffer` state survives the unmount, so switching back still
    // shows the unsaved text with no save having happened — remounting resets
    // `SummarySection`'s local `mode` ref back to its 'preview' default, so this reads
    // the rendered preview rather than re-entering edit mode.
    await region.getByRole('tab', { name: 'Summary', exact: true }).click();
    await expect(page.locator('.review-summary__preview')).toContainText('Never saved because tab closes.');
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
    expect(mutationRequests).toHaveLength(0);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
