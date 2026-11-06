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

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { openRuntimeSession } from '../helpers/open-runtime-session.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

// Shared pack/extract/spawn plumbing, copied verbatim from
// `tests/e2e/toolbar-roles.spec.ts` (itself copied from
// `tests/e2e/workbench-shell-smoke.spec.ts:1-37, 46-135`) — one packaged
// binary is built once and reused by every test in this file.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-popover-contract-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the popover keyboard contract assertion: ${detail}`,
    );
  }
}

function spawnCli(
  repository: GitFixture,
  options: Readonly<{
    launchOptions?: Readonly<{ base: { label: string; revision: string }; head: { label: string; revision: string } }>;
    env?: Readonly<Record<string, string>>;
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
      ...options.env,
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

function anchoredLaunchOptions(repository: GitFixture) {
  return {
    base: { label: 'Base fixture', revision: repository.baseRef },
    head: { label: 'Head fixture', revision: repository.headRef },
  };
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

// Proof-only: `IdentityPopover.vue`, `ViewOptionsMenu.vue`, and
// `ModalDialog.vue` (shared by `SupportDialog.vue`) already implement the
// Esc-closes/focus-returns-to-trigger contract per `25-PATTERNS.md`'s
// re-verified table. No component under test is modified by this plan.

test('identity popover closes on Escape and returns focus to its trigger', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    // `.identity-pill`'s accessible name is session-dependent, so a CSS
    // locator is used instead of `getByRole` name matching.
    const trigger = page.locator('.identity-pill');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Comparison' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('view options menu closes on Escape and returns focus to its trigger', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  const running = spawnCli(repository, { launchOptions: anchoredLaunchOptions(repository) });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRuntimeSession(page, url);

    const trigger = page.getByRole('button', { name: 'View options' });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'View options' });
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('support dialog closes on Escape and returns focus to its trigger', async ({ browser }) => {
  const repository = await createGitFixture({ anchoredReview: true });
  // `createConfiguredSupportCapability` (`src/server/app.ts:60-71`) only checks the
  // URL's `https:` protocol to enable `session.support.enabled` — it never needs to
  // be reachable, since this test never exercises the paid Support action itself.
  const running = spawnCli(repository, {
    launchOptions: anchoredLaunchOptions(repository),
    env: { [`${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL`]: 'https://support.example.invalid' },
  });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    // Default `dismissUnverified: true` dismisses any auto-opened invitation
    // dialog before this test interacts with anything.
    await openRuntimeSession(page, url);

    // The heart glyph beside the button text is `aria-hidden`, so the
    // accessible name is just `Support ${RENAME_MAP.displayName}`.
    const trigger = page.locator('.statusbar').getByRole('button', { name: /Support/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: `Support ${RENAME_MAP.displayName}` });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
