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
// `tests/e2e/workbench-shell-smoke.spec.ts:1-43`.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-finish-review-live-region-pack-`));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);
const fakeBinRoot = join(packedRoot, 'fake-bin');
test.setTimeout(90_000);

const loopbackUrlPattern = /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/;
const reviewRequestKind = `${RENAME_MAP.kindPrefix}.review-request` as const;

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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the finish-review live-region assertion: ${detail}`,
    );
  }
}

/**
 * Generic packaged-binary spawn, copied from `tests/e2e/workbench-shell-smoke.spec.ts:67-107`.
 * A `review-request` piped over stdin (used here) always resolves server-side
 * to an `agent-review`-attached session (`runOrdinaryAction` always wires
 * `attachedCompletion` for every non-interactive stdin request).
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

function liveRegion(page: Page) {
  return page.locator('.visually-hidden[aria-live="polite"]');
}

async function liveRegionVersion(page: Page): Promise<number> {
  return Number(await liveRegion(page).locator('span').getAttribute('data-announcement-version'));
}

async function openReviewNotes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
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

test('Finish review announces the validating-start and completed transitions exactly once each, from the single live-region owner', async ({ browser }) => {
  const repository = await createGitFixture();
  const request = {
    kind: reviewRequestKind,
    schemaVersion: 1,
    mode: 'revisions',
    revisions: { base: repository.baseRef, head: repository.headRef },
  };
  const running = spawnCli(repository, { request });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);
    await openReviewNotes(page);
    // `ExportSection.vue`'s `.attached-completion` is only rendered inside
    // the Export tabpanel (`BottomPanel.vue:190`); the status bar's own
    // "Finish review" shortcut button lives outside this region entirely.
    await page.getByRole('tab', { name: 'Export' }).click();

    const completion = page.getByRole('region', { name: 'Finish attached review' });
    const finish = completion.getByRole('button', { name: 'Finish review', exact: true });
    await expect(finish).toBeVisible();

    const before = await liveRegionVersion(page);
    const finished = page.waitForResponse((response) => response.url().includes('/api/review-completion/finish'));
    await finish.click();

    await expect(liveRegion(page)).toHaveText('Validating accepted revision 0 and its recorded anchors.');
    expect(await liveRegionVersion(page)).toBe(before + 1);

    // No second live region remains, proven at each lifecycle state in turn
    // (the progress paragraph only exists while `attachedLifecycle` is
    // `'finishing'`; the success notice replaces it once completed). A
    // single evaluate reads both attributes in one round trip, since two
    // separate polling assertions would straddle the fast finishing ->
    // completed transition.
    const progressAttributes = await completion.locator('.attached-completion__progress').evaluate((element) => ({
      ariaLive: element.getAttribute('aria-live'),
      role: element.getAttribute('role'),
    }));
    expect(progressAttributes.ariaLive).toBeNull();
    expect(progressAttributes.role).toBeNull();

    expect((await finished).status()).toBe(201);

    await expect(liveRegion(page)).toHaveText('Review finished.');
    expect(await liveRegionVersion(page)).toBe(before + 2);
    await expect(completion.locator('.inline-notice--success')).not.toHaveAttribute('role');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
