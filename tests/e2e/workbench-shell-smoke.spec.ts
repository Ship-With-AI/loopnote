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
import { RENAME_MAP } from '../../src/domain/product-identity.js';

// Shared pack/extract/spawn plumbing, adapted from `pinned-session.spec.ts`'s
// `mkdtempSync` + `npm pack` + `tar -xzf` + `dist/bin/${binCommand}.mjs` pattern
// (tests/e2e/pinned-session.spec.ts:1-58, 278-317). One packaged binary is built
// once and reused by all five session-kind cases below.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-shell-smoke-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the shell smoke assertion: ${detail}`,
    );
  }
}

/**
 * Generic packaged-binary spawn, parameterized over the three distinct launch
 * shapes the real CLI exposes (confirmed by reading `src/cli/run.ts`'s `.action()`
 * handler and `runOrdinaryAction`): positional CLI args (`--staged`/`--unstaged`/
 * `--worktree`/standalone paths), the interactive `LAUNCH_OPTIONS` env var (used
 * for committed branch/worktree picks), or a JSON `review-request` piped over
 * stdin (used for exact-patch and agent-attached kinds — both always resolve to
 * an `agent-review`-attached session server-side, since `runOrdinaryAction`
 * always wires `attachedCompletion` for every non-interactive stdin request).
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

/**
 * Every case shares this baseline: the five-region `WorkbenchShell.vue` host
 * (title bar / side bar / editor / status bar, panel is on-demand) is present
 * and the diff editor has rendered (confirms the shell did not silently drop
 * a region when it was decomposed out of the old monolithic `App.vue`).
 */
async function assertShellRegionsPresent(page: Page): Promise<void> {
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  await expect(page.locator('.workbench-shell')).toBeVisible();
  await expect(page.locator('.workbench-shell__titlebar .titlebar')).toBeVisible();
  await expect(page.locator('.workbench-shell__sidebar')).toBeVisible();
  await expect(page.locator('.workbench-shell__editor')).toBeVisible();
  await expect(page.locator('.workbench-shell__statusbar .statusbar')).toBeVisible();
}

/**
 * The status bar's Export item (`StatusBar.vue:46-54`) is rendered only when
 * `exportSupported` is true, and always carries the emphasis class when it is.
 */
async function assertExportItem(page: Page, supported: boolean): Promise<void> {
  const item = page.locator('.statusbar').getByRole('button', { name: 'Export', exact: true });
  if (!supported) {
    await expect(item).toHaveCount(0);
    return;
  }
  await expect(item).toBeVisible();
  await expect(item).toHaveClass(/statusbar__item--emphasis/);
}

async function openPanel(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle panel (⌘J)' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
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

test('committed branch/worktree: Base → Head identity, no Refresh, Export emphasized', async ({ browser }) => {
  const repository = await createGitFixture();
  const running = spawnCli(repository, {
    launchOptions: {
      base: { label: 'Base fixture', revision: repository.baseRef },
      head: { label: 'Head fixture', revision: repository.headRef },
    },
  });
  try {
    const expectedBase = repository.git(['rev-parse', '--verify', repository.baseRef]).toString('ascii').trim();
    const expectedHead = repository.git(['rev-parse', '--verify', repository.headRef]).toString('ascii').trim();
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByText('BASE', { exact: true })).toBeVisible();
    await expect(banner.getByText('HEAD', { exact: true })).toBeVisible();
    await expect(banner.getByText(`Base fixture · ${expectedBase.slice(0, 7)}`)).toBeVisible();
    await expect(banner.getByText(`Head fixture · ${expectedHead.slice(0, 7)}`)).toBeVisible();
    await expect(banner.getByText('Pinned comparison', { exact: true })).toBeVisible();

    // NAV-04/SHELL-05: Refresh only exists for uncommitted/standalone sessions.
    await expect(page.getByRole('button', { name: 'Refresh snapshot' })).toHaveCount(0);

    // Committed sessions are export-supported (`!isUncommittedSession`).
    await assertExportItem(page, true);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('Staged/Unstaged/Working tree: Working-tree identity, Refresh present, Export not emphasized', async ({ browser }) => {
  const repository = await createGitFixture();
  await repository.write('src/untracked.ts', 'export const untracked = true;\n');
  const running = spawnCli(repository, { args: ['--worktree'] });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByText('BASE', { exact: true })).toBeVisible();
    await expect(banner.getByText('HEAD', { exact: true })).toBeVisible();
    await expect(banner.getByText(/Repository object · [0-9a-f]{7}/)).toBeVisible();
    await expect(banner.getByText(/Working tree · snapshot [0-9a-f]{7}/)).toBeVisible();
    await expect(banner.getByText('Frozen snapshot', { exact: true })).toBeVisible();

    // Uncommitted sessions can Refresh their frozen snapshot.
    await expect(page.getByRole('button', { name: 'Refresh snapshot' })).toBeVisible();

    // Uncommitted-and-not-standalone → `exportSupported` is false.
    await assertExportItem(page, false);
    await openPanel(page);
    const dialog = page.locator('.workbench-shell__panel');
    await expect(dialog.getByRole('button', { name: 'Export review', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Export review again', exact: true })).toHaveCount(0);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('standalone: Standalone identity, Refresh present, Export emphasized', async ({ browser }) => {
  const repository = await createGitFixture();
  const running = spawnCli(repository, { args: ['tracked.txt'] });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByText('STANDALONE', { exact: true })).toBeVisible();
    await expect(banner.getByText(/Standalone review · 1 files · snapshot [0-9a-f]{7}/)).toBeVisible();
    await expect(banner.getByText('BASE', { exact: true })).toHaveCount(0);
    await expect(banner.getByText('HEAD', { exact: true })).toHaveCount(0);
    await expect(banner.getByText('Frozen snapshot', { exact: true })).toBeVisible();

    // Standalone sessions also support Refresh (`showRefresh = isUncommittedSession`,
    // true for standalone because standalone scopes still carry an `uncommitted` key).
    await expect(page.getByRole('button', { name: 'Refresh snapshot' })).toBeVisible();

    // `isStandaloneSession` makes `exportSupported` true even though it is "uncommitted-shaped".
    await assertExportItem(page, true);
    await openPanel(page);
    const dialog = page.locator('.workbench-shell__panel');
    await expect(dialog.getByRole('button', { name: 'Export review', exact: true })).toBeVisible();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('exact patch: Repository object → Implemented content identity, no Refresh, Export emphasized', async ({ browser }) => {
  const repository = await createGitFixture();
  const patch = repository
    .git(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--full-index', repository.baseRef, repository.headRef])
    .toString('utf8');
  const request = {
    kind: reviewRequestKind,
    schemaVersion: 1,
    mode: 'patch',
    patch: { content: patch, target: { kind: 'repository' } },
  };
  const running = spawnCli(repository, { request });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByText('PREIMAGE', { exact: true })).toBeVisible();
    await expect(banner.getByText('POSTIMAGE', { exact: true })).toBeVisible();
    await expect(banner.getByText('Repository object', { exact: true })).toBeVisible();
    await expect(banner.getByText('Implemented content', { exact: true })).toBeVisible();
    await expect(banner.getByText('Frozen patch', { exact: true })).toBeVisible();

    // Exact-patch sessions never show Refresh (`showRefresh = isUncommittedSession`, always
    // false here since `'uncommitted' in session` is false for a `'patch' in session` response).
    await expect(page.getByRole('button', { name: 'Refresh snapshot' })).toHaveCount(0);

    // `!isUncommittedSession` is true for exact-patch sessions → export-supported.
    await assertExportItem(page, true);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('row anatomy: file-type mark → name → markers/line-counts → status letter, fixed-height rows, collapsed status bullet', async ({ browser }) => {
  const repository = await createGitFixture();
  repository.git(['switch', 'main']);
  await repository.write('app.ts', 'export const app = 1;\n');
  await repository.write('docs/guide/readme.ts', 'export const guide = 1;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'add files shared with feature']);
  const baseRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();
  repository.git(['switch', 'feature']);
  repository.git(['merge', 'main', '--no-edit']);
  await repository.write('app.ts', 'export const app = 2;\n');
  await repository.write('docs/guide/readme.ts', 'export const guide = 2;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'modify files on feature']);
  const headRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();

  const running = spawnCli(repository, {
    launchOptions: {
      base: { label: 'Base fixture', revision: baseRevision },
      head: { label: 'Head fixture', revision: headRevision },
    },
  });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const row = page.locator('.file-row').filter({ hasText: 'app.ts' });
    await expect(row).toBeVisible();
    const rowBox = await row.boundingBox();
    expect(rowBox?.height).toBe(26);

    const childClasses = await row.evaluate((element) =>
      Array.from(element.children).map((child) => child.className),
    );
    expect(childClasses[0]).toContain('ft');
    expect(childClasses[1]).toContain('path-display');
    expect(childClasses.at(-1)).toContain('status-badge');

    const docsDirectory = page.getByRole('treeitem', { name: /^docs\/guide\/?$/ });
    if ((await docsDirectory.getAttribute('aria-expanded')) === 'true') {
      await docsDirectory.click();
    }
    await expect(docsDirectory).toHaveAttribute('aria-expanded', 'false');
    const bullet = docsDirectory.locator('.directory-row__bullet');
    await expect(bullet).toBeVisible();
    await expect(bullet).toHaveClass(/directory-row__bullet--modified/);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('filter highlighting, list mode toggle, and footer totals against the real packaged binary', async ({ browser }) => {
  const repository = await createGitFixture({ committedHeadChange: false });
  repository.git(['switch', 'main']);
  await repository.write('alpha.ts', 'export const alpha = 1;\n');
  await repository.write('beta.ts', 'export const beta = 1;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'add files shared with feature']);
  const baseRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();
  repository.git(['switch', 'feature']);
  repository.git(['merge', 'main', '--no-edit']);
  await repository.write('alpha.ts', 'export const alpha = 2;\n');
  await repository.write('beta.ts', 'export const beta = 2;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'modify files on feature']);
  const headRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();

  const running = spawnCli(repository, {
    launchOptions: {
      base: { label: 'Base fixture', revision: baseRevision },
      head: { label: 'Head fixture', revision: headRevision },
    },
  });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const fileTreeRoot = navigation.locator('.file-tree');
    const footer = navigation.locator('.tree-footer');
    await expect(fileTreeRoot).toHaveAttribute('role', 'tree');
    await expect(footer).toHaveText('2 files · +2 −2');

    // Filter opens via the funnel button, highlights the typed substring with
    // a real <mark> element (never v-html), and the footer switches to the
    // "N of M files" form while a query is active.
    const filterButton = navigation.getByRole('button', { name: /Filter changed files/ });
    const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
    await expect(filter).toBeHidden();
    await filterButton.click();
    await expect(filter).toBeFocused();
    await filter.fill('alpha');
    const matchedRow = fileTreeRoot.getByRole('treeitem', { name: /alpha\.ts/i });
    await expect(matchedRow).toBeVisible();
    await expect(matchedRow.locator('mark')).toHaveText('alpha');
    await expect(footer).toHaveText('1 of 2 files');

    // Esc clears the query, closes the filter row, and returns focus to the
    // tree — not back to the filter input (the v1.6 behaviour this changes).
    await filter.press('Escape');
    await expect(filter).toBeHidden();
    await expect(fileTreeRoot.locator('[role="treeitem"][tabindex="0"]')).toBeFocused();
    await expect(footer).toHaveText('2 files · +2 −2');

    // Ctrl+Alt+F (⌥⌘F on macOS) opens the filter while focus is inside the
    // tree; the shortcut is tree-scoped, not a document-level handler.
    await page.keyboard.press('Control+Alt+F');
    await expect(filter).toBeVisible();
    await expect(filter).toBeFocused();
    await filter.press('Escape');

    // The list⇄tree toggle switches the root list's role in both directions.
    const listToggle = navigation.getByRole('button', { name: /View as (list|tree)/ });
    await listToggle.click();
    await expect(fileTreeRoot).toHaveAttribute('role', 'listbox');
    await listToggle.click();
    await expect(fileTreeRoot).toHaveAttribute('role', 'tree');

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('keyboard tab order: single tab stop across toolbar, filter, view-options menu, and a compacted folder row (packaged binary)', async ({ browser }) => {
  const repository = await createGitFixture({ committedHeadChange: false });
  repository.git(['switch', 'main']);
  await repository.write('app.ts', 'export const app = 1;\n');
  await repository.write('docs/guide/readme.ts', 'export const guide = 1;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'add files shared with feature']);
  const baseRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();
  repository.git(['switch', 'feature']);
  repository.git(['merge', 'main', '--no-edit']);
  await repository.write('app.ts', 'export const app = 2;\n');
  await repository.write('docs/guide/readme.ts', 'export const guide = 2;\n');
  repository.git(['add', '-A']);
  repository.git(['commit', '-m', 'modify files on feature']);
  const headRevision = repository.git(['rev-parse', 'HEAD']).toString('ascii').trim();

  const running = spawnCli(repository, {
    launchOptions: {
      base: { label: 'Base fixture', revision: baseRevision },
      head: { label: 'Head fixture', revision: headRevision },
    },
  });
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.locator('.file-tree');
    const tabbable = tree.locator('[role="treeitem"][tabindex="0"], [role="option"][tabindex="0"]');
    const appRow = tree.getByRole('treeitem', { name: /^app\.ts\b/ });
    const docsDirectory = tree.getByRole('treeitem', { name: /^docs\/guide\/?$/ });

    const filterButton = navigation.getByRole('button', { name: /Filter changed files/ });
    const listToggle = navigation.getByRole('button', { name: /View as (list|tree)/ });
    const collapseAllButton = navigation.getByRole('button', { name: 'Collapse all' });
    const viewOptionsButton = navigation.getByRole('button', { name: 'View options' });

    // The toolbar's four buttons and the tree are each exactly one Tab stop
    // with the filter closed — no extra stop inside the tree itself.
    await filterButton.focus();
    await expect(filterButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(listToggle).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(collapseAllButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(viewOptionsButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(tabbable).toHaveCount(1);
    await expect(tabbable).toBeFocused();

    // Exactly one roving tabindex="0" element exists at a time, and the
    // compacted multi-segment "docs/guide" folder row is traversed as
    // exactly one Arrow stop, not one stop per path segment.
    await page.keyboard.press('Home');
    await expect(appRow).toBeFocused();
    await expect(tabbable).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(docsDirectory).toBeFocused();
    await expect(tabbable).toHaveCount(1);
    await page.keyboard.press('ArrowUp');
    await expect(appRow).toBeFocused();
    await expect(tabbable).toHaveCount(1);

    // ⌥⌘F / Ctrl+Alt+F opens the path filter while focus is inside the
    // tree; once open, the filter input is its own Tab stop between the
    // toolbar and the tree, highlights a match with a real <mark>, and Esc
    // clears/closes it and returns focus to the tree, not the filter input.
    await page.keyboard.press('Control+Alt+F');
    const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
    await expect(filter).toBeFocused();
    await filter.fill('app');
    await expect(appRow.locator('mark')).toHaveText('app');
    await filter.fill('');
    await page.keyboard.press('Tab');
    await expect(tabbable).toHaveCount(1);
    await expect(tabbable).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(filter).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(viewOptionsButton).toBeFocused();
    await filter.focus();
    await page.keyboard.press('Escape');
    await expect(filter).toBeHidden();
    await expect(tabbable).toBeFocused();

    // The view-options menu: Arrow keys move focus among its four items
    // with wrapping, and Esc closes the menu and returns focus to the ⋯
    // button.
    await viewOptionsButton.click();
    const menu = page.getByRole('menu', { name: 'View options' });
    await expect(menu).toBeVisible();
    const items = menu.locator('[role="menuitemradio"], [role="menuitemcheckbox"]');
    await expect(items).toHaveCount(4);
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(viewOptionsButton).toBeFocused();

    // The list⇄tree toggle switches the root list's role in both directions.
    await listToggle.click();
    await expect(navigation.getByRole('listbox', { name: 'Changed files' })).toBeVisible();
    await listToggle.click();
    await expect(navigation.getByRole('tree', { name: 'Changed files' })).toBeVisible();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('agent-attached: attachedFact overlay and Finish review entry point in the bottom panel', async ({ browser }) => {
  const repository = await createGitFixture();
  // Any non-interactive stdin `review-request` always resolves server-side to an
  // `agent-review`-attached session (`runOrdinaryAction` -> `launchAttachedSession`
  // always wires `attachedCompletion`, confirmed by reading `src/cli/run.ts:977-1294`
  // and `src/server/capabilities.ts:426`). A plain `revisions` request is the
  // minimal fixture for this orthogonal "agent-attached" overlay, reusing exactly
  // the same stdin-request mechanism `pinned-session.spec.ts`'s "generated range
  // request" test already exercises — no custody-gated harness is required.
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
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await assertShellRegionsPresent(page);

    // `TitleBar.vue`'s `attachedFact` computed, surfaced once `attachedLifecycle`
    // resolves to 'waiting' (IdentityHeader.vue's former copy, now in TitleBar.vue).
    await expect(page.locator('.attached-fact')).toHaveText('Agent attached · waiting for Finish review');

    // Phase 20 keeps the Finish-review entry point inside the bottom panel's
    // attached-completion block (`BottomPanel.vue`, unchanged from the former
    // `ReviewNotesDialog.vue`) — the status bar's one emphasized slot move is
    // out of scope until Phase 22, per this plan's own task instructions.
    await openPanel(page);
    const panel = page.locator('.workbench-shell__panel');
    await expect(panel.getByRole('heading', { name: 'Finish attached review' })).toBeVisible();
    const finishButton = panel.getByRole('button', { name: 'Finish review', exact: true });
    await expect(finishButton).toBeVisible();
    // No pending draft mutations/conflicts/unsaved text on a fresh load, so
    // `attachedFinishReady` is true and the button is enabled.
    await expect(finishButton).toBeEnabled();

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
