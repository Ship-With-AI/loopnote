import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, Page, Request, TestInfo } from '@playwright/test';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

import {
  createGitFixture,
  type GitFixture,
} from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { PANEL_STATE_STORAGE_KEY } from '../../src/web/model/panel-state.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-tree-pack-`));
const extractedPackageRoot = join(packedRoot, 'package');
const fakeBinRoot = join(packedRoot, 'fake-bin');
const executablePath = join(
  extractedPackageRoot,
  `dist/bin/${RENAME_MAP.binCommand}.mjs`,
);
const safeGitArguments = [
  '--no-optional-locks',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.external=',
  '-c',
  'protocol.file.allow=never',
] as const;

const fileTreeHarnessModule = `
import { createApp, h, ref } from 'vue';
import FileTree from '/components/FileTree.vue';
import '/styles.css';

const path = (display) => ({
  bytesBase64url: btoa(display),
  display,
  utf8: display,
});
const file = (fileId, display) => ({
  fileId,
  status: { kind: 'modified', code: 'M' },
  oldPath: path(display),
  newPath: path(display),
  additions: 1,
  deletions: 1,
  availability: { kind: 'text' },
});
const initialFiles = [
  file('file_opaque-alpha', 'kept/alpha.ts'),
  file('file_opaque-bravo', 'kept/bravo.ts'),
  file('file_opaque-charlie', 'collapsed/charlie.ts'),
];
const replacementFiles = [
  ...initialFiles.map((entry) => ({ ...entry })),
  file('file_opaque-new', 'new/new.ts'),
];

export function mountFileTreeHarness() {
  const files = ref(initialFiles);
  const selectCount = ref(0);
  createApp({
    setup: () => () => h('main', { id: 'file-tree-harness' }, [
      h(FileTree, {
        files: files.value,
        openCommentCounts: new Map([['file_opaque-alpha', 2]]),
        onSelect: () => { selectCount.value += 1; },
      }),
      h('output', { id: 'file-tree-select-count' }, String(selectCount.value)),
    ]),
  }).mount('#file-tree-harness');
  globalThis.__replaceFileTreeFiles = () => { files.value = replacementFiles; };
}
`;
let fileTreeHarness: ViteDevServer | undefined;
let fileTreeHarnessUrl = '';

interface PackResult {
  filename: string;
}

interface RunningCli {
  readonly child: ChildProcess;
  readonly outputPath: string;
  readonly outputDescriptor: number;
}

interface FileRequestEvidence {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly postData: string | null;
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before the packaged tree assertion: ${detail}`,
    );
  }
}

function runGitWithInput(
  repository: GitFixture,
  arguments_: readonly string[],
  input: Uint8Array,
): Buffer {
  return execFileSync('git', [...safeGitArguments, ...arguments_], {
    cwd: repository.root,
    encoding: 'buffer',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_EXTERNAL_DIFF: '',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
    input,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function addInvalidUtf8Path(
  repository: GitFixture,
  pathBytes: Buffer,
  content: string,
): void {
  const objectId = runGitWithInput(
    repository,
    ['hash-object', '-w', '--stdin'],
    Buffer.from(content),
  )
    .toString('ascii')
    .trim();
  const indexRecord = Buffer.concat([
    Buffer.from(`100644 ${objectId}\t`, 'ascii'),
    pathBytes,
    Buffer.from([0]),
  ]);
  runGitWithInput(repository, ['update-index', '-z', '--index-info'], indexRecord);
}

async function createFileTreeFixture(): Promise<GitFixture> {
  const repository = await createGitFixture();
  repository.git(['switch', 'main']);
  await repository.write('src/deep/only/rename-source.ts', 'export const renamed = 1;\n');
  await repository.write('copy-source.ts', 'export const copied = true;\n');
  await repository.write('deleted.txt', 'remove me\n');
  repository.git(['add', '--all']);
  repository.git(['commit', '-m', 'tree fixture base']);
  repository.git(['branch', '--force', 'feature', 'main']);
  repository.git(['switch', 'feature']);

  repository.git([
    'mv',
    '--',
    'src/deep/only/rename-source.ts',
    'src/deep/only/renamed.ts',
  ]);
  await repository.write('copy-target.ts', 'export const copied = true;\n');
  await repository.write('tracked.txt', 'head\nwith another line\n');
  await repository.write('control/line\nbreak.ts', 'export const control = true;\n');
  await repository.write('binary.dat', 'binary\0payload');
  repository.git(['rm', '--', 'deleted.txt']);
  repository.git(['add', '--all']);
  addInvalidUtf8Path(
    repository,
    Buffer.concat([Buffer.from('collision/'), Buffer.from([0x80]), Buffer.from('.ts')]),
    'first collision\n',
  );
  addInvalidUtf8Path(
    repository,
    Buffer.concat([Buffer.from('collision/'), Buffer.from([0x81]), Buffer.from('.ts')]),
    'second collision\n',
  );
  repository.git(['commit', '-m', 'tree fixture head']);
  return repository;
}

function startGeneratedCli(repository: GitFixture): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const openerLogPath = join(packedRoot, `opener-${crypto.randomUUID()}.log`);
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
        base: { label: 'Base tree fixture', revision: repository.baseRef },
        head: { label: 'Head tree fixture', revision: repository.headRef },
      }),
      [`${RENAME_MAP.envPrefix}OPENER_LOG`]: openerLogPath,
      [`${RENAME_MAP.envPrefix}TERMINAL_CAPTURE`]: outputPath,
    },
    stdio: ['ignore', outputDescriptor, outputDescriptor],
  });
  return { child, outputPath, outputDescriptor };
}

async function waitForText(
  path: string,
  predicate: (content: string) => boolean,
): Promise<string> {
  const { promise, resolve: resolveWait, reject } =
    Promise.withResolvers<string>();
  const deadline = Date.now() + 10_000;
  const interval = setInterval(() => {
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (predicate(content)) {
      clearInterval(interval);
      resolveWait(content);
      return;
    }
    if (Date.now() >= deadline) {
      clearInterval(interval);
      reject(new Error(`[behavioral] timed out waiting for CLI output:\n${content}`));
    }
  }, 25);
  return await promise;
}

async function waitForLoopbackUrl(running: RunningCli): Promise<string> {
  const output = await waitForText(
    running.outputPath,
    (content) =>
      /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/.test(content) ||
      running.child.exitCode !== null ||
      running.child.signalCode !== null,
  );
  const match = output.match(
    /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/,
  );
  expect(
    match?.[0],
    `[behavioral] generated CLI exited before publishing a loopback URL. Output:\n${output}`,
  ).toBeDefined();
  return match![0];
}

async function stopGeneratedCli(running: RunningCli): Promise<void> {
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill('SIGINT');
  }
  if (running.child.exitCode === null && running.child.signalCode === null) {
    await new Promise<void>((resolveExit, reject) => {
      running.child.once('error', reject);
      running.child.once('exit', () => resolveExit());
    });
  }
  closeSync(running.outputDescriptor);
}

function assertChromiumPrerequisite(browser: Browser, testInfo: TestInfo): void {
  if (
    testInfo.project.name !== 'chromium' ||
    browser.browserType().name() !== 'chromium'
  ) {
    throw new Error(
      `[prerequisite] exact Chromium project required, received ${testInfo.project.name}/${browser.browserType().name()}`,
    );
  }
}

function captureFileRequest(request: Request): FileRequestEvidence | undefined {
  const url = new URL(request.url());
  if (!/^\/api\/files\/file_[A-Za-z0-9_-]{43}\/content$/.test(url.pathname)) {
    return undefined;
  }
  return {
    method: request.method(),
    pathname: url.pathname,
    search: url.search,
    postData: request.postData(),
  };
}


test.beforeAll(async () => {
  runPrerequisite(npmCommand, ['run', 'build']);
  const packOutput = runPrerequisite(npmCommand, [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    packedRoot,
  ]);
  const [packResult] = JSON.parse(packOutput) as PackResult[];
  runPrerequisite('tar', [
    '-xzf',
    join(packedRoot, packResult.filename),
    '-C',
    packedRoot,
  ]);
  symlinkSync(
    join(repositoryRoot, 'node_modules'),
    join(extractedPackageRoot, 'node_modules'),
    'dir',
  );

  writeFileSync(
    join(packedRoot, 'fake-open.mjs'),
    '#!/usr/bin/env node\nprocess.exitCode = 1;\n',
    'utf8',
  );
  mkdirSync(fakeBinRoot, { recursive: true });
  copyFileSync(join(packedRoot, 'fake-open.mjs'), join(fakeBinRoot, 'open'));
  chmodSync(join(fakeBinRoot, 'open'), 0o755);
  fileTreeHarness = await createServer({
    configFile: 'vite.config.ts',
    plugins: [{
      name: 'file-tree-replacement-harness',
      resolveId: (id) =>
        id === 'virtual:file-tree-replacement-harness'
          ? '\0file-tree-replacement-harness'
          : undefined,
      load: (id) =>
        id === '\0file-tree-replacement-harness' ? fileTreeHarnessModule : undefined,
    }],
    server: { host: '127.0.0.1' },
  });
  await fileTreeHarness.listen();
  fileTreeHarnessUrl = fileTreeHarness.resolvedUrls?.local[0] ?? '';
  expect(fileTreeHarnessUrl).not.toBe('');
});

test.afterAll(async () => {
  await fileTreeHarness?.close();
  rmSync(packedRoot, { force: true, recursive: true });
});

test('packaged file tree preserves opaque selection and keyboard semantics', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  const fileRequests: FileRequestEvidence[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    const evidence = captureFileRequest(request);
    if (evidence !== undefined) {
      fileRequests.push(evidence);
    }
  });

  try {
    await page.goto(await waitForLoopbackUrl(running));
    await expect.poll(() => browserErrors).toEqual([]);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    await expect(navigation.getByText(/^\d+ files? · \+\d+ −\d+$/)).toBeVisible();
    await expect(tree).toBeVisible();

    const selectedLeaf = tree.locator('[role="treeitem"][aria-selected="true"]');
    await expect(selectedLeaf).toHaveCount(1);
    await expect(selectedLeaf).toHaveAttribute('aria-level', /\d+/);
    await expect(selectedLeaf).toHaveAttribute('tabindex', '0');
    await expect.poll(() => fileRequests.length).toBeGreaterThan(0);

    const modifiedRow = tree.getByRole('treeitem', {
      name: /tracked\.txt.*Text.*\d+ additions?.*1 deletion.*modified/i,
    });
    await expect(modifiedRow).toBeVisible();
    const rowBox = await modifiedRow.boundingBox();
    expect(rowBox?.height).toBe(26);

    const unsupportedRow = tree.getByRole('treeitem', {
      name: /binary\.dat.*Unsupported.*Line counts unavailable.*added/i,
    });
    await expect(unsupportedRow).toBeVisible();
    await expect(unsupportedRow.getByText('Unsupported', { exact: true })).toBeVisible();

    const renamedRow = tree.getByRole('treeitem', {
      name: /renamed from src\/deep\/only\/rename-source\.ts to src\/deep\/only\/renamed\.ts.*Text.*renamed/i,
    });
    const copiedRow = tree.getByRole('treeitem', {
      name: /copied from copy-source\.ts to copy-target\.ts.*Text.*copied/i,
    });
    await expect(renamedRow).toContainText('rename-source.ts→renamed.ts');
    await expect(renamedRow).toHaveAccessibleName(
      /renamed from src\/deep\/only\/rename-source\.ts to src\/deep\/only\/renamed\.ts.*Text.*renamed/i,
    );
    await expect(copiedRow).toContainText('copy-source.ts→copy-target.ts');

    const escapedControlRow = tree.getByRole('treeitem', {
      name: /control\/line\\nbreak\.ts/,
    });
    await expect(escapedControlRow).toContainText('line\\nbreak.ts');
    await expect(escapedControlRow).not.toContainText('control/');

    const displayCollisions = tree
      .locator('[role="treeitem"] .path-display .path-text__filename')
      .filter({ hasText: /^�\.ts$/ });
    await expect(displayCollisions).toHaveCount(2);
    await expect(tree.getByRole('treeitem', { name: /^collision\/?$/i })).toBeVisible();
    await expect(tree.getByRole('treeitem', { name: /^control\/?$/i })).toBeVisible();
    await displayCollisions.nth(0).click();
    await expect.poll(() => fileRequests.length).toBeGreaterThan(1);
    const firstCollisionRequest = fileRequests.at(-1)!;
    await displayCollisions.nth(1).click();
    await expect
      .poll(() => fileRequests.at(-1)?.pathname)
      .not.toBe(firstCollisionRequest.pathname);

    await copiedRow.click();
    await expect(copiedRow).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => fileRequests.at(-1)?.pathname).toMatch(
      /^\/api\/files\/file_[A-Za-z0-9_-]{43}\/content$/,
    );
    for (const request of fileRequests) {
      expect(request).toMatchObject({ method: 'GET', search: '', postData: null });
      expect(request.pathname).toMatch(/^\/api\/files\/file_[A-Za-z0-9_-]{43}\/content$/);
      expect(request.pathname).not.toContain('copy-source');
      expect(request.pathname).not.toContain('copy-target');
    }

    await renamedRow.click();
    await renamedRow.focus();
    await expect(renamedRow).toBeFocused();
    const selectedBeforeDirectoryFocus =
      await selectedLeaf.getAttribute('data-file-id');
    await page.keyboard.press('ArrowLeft');
    const focusedDirectory = tree.locator(
      '[role="treeitem"][aria-expanded]:focus',
    );
    await expect(focusedDirectory).toBeFocused();
    await expect(selectedLeaf).toHaveAttribute('data-file-id', selectedBeforeDirectoryFocus!);

    await page.keyboard.press('Enter');
    await expect(focusedDirectory).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(focusedDirectory).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tree.locator('[role="treeitem"]:focus')).not.toHaveAttribute(
      'aria-expanded',
      /.+/,
    );

    await page.keyboard.press('Home');
    await expect(tree.getByRole('treeitem').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(tree.getByRole('treeitem').last()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(tree.getByRole('treeitem').last()).not.toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(tree.getByRole('treeitem').last()).toBeFocused();
    await page.keyboard.press('Space');
    await expect.poll(() => fileRequests.at(-1)?.pathname).toMatch(
      /^\/api\/files\/file_[A-Za-z0-9_-]{43}\/content$/,
    );

    const focusedOutline = await tree
      .locator('[role="treeitem"]:focus')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
    expect(focusedOutline).toEqual({ outlineStyle: 'solid', outlineWidth: '2px' });
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('packaged file tree filters and recovers without changing the open file', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  const fileRequests: FileRequestEvidence[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    const evidence = captureFileRequest(request);
    if (evidence !== undefined) {
      fileRequests.push(evidence);
    }
  });

  try {
    await page.goto(await waitForLoopbackUrl(running));
    await expect.poll(() => browserErrors).toEqual([]);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    const filterButton = navigation.getByRole('button', { name: /Filter changed files/ });
    const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
    const treeitems = tree.locator('[role="treeitem"]');
    const tabbableTreeitems = tree.locator('[role="treeitem"][tabindex="0"]');
    const selectedLeaf = tree.locator('[role="treeitem"][aria-selected="true"]');
    const collisionDirectory = tree.getByRole('treeitem', {
      name: /^collision\/?$/i,
    });

    await expect(tree).toBeVisible();
    await expect(selectedLeaf).toHaveCount(1);
    await expect(tabbableTreeitems).toHaveCount(1);
    const selectedLeafFileId = await selectedLeaf.getAttribute('data-file-id');
    if (selectedLeafFileId === null) throw new Error('expected the selected leaf to carry data-file-id');
    await expect(tabbableTreeitems).toHaveAttribute('data-file-id', selectedLeafFileId);
    const trackedRow = tree.getByRole('treeitem', {
      name: /tracked\.txt.*Text.*\d+ additions?.*1 deletion.*modified/i,
    });
    await trackedRow.click();
    const trackedRowFileId = await trackedRow.getAttribute('data-file-id');
    if (trackedRowFileId === null) throw new Error('expected the tracked row to carry data-file-id');
    await expect(selectedLeaf).toHaveAttribute('data-file-id', trackedRowFileId);
    const selectedFileId = await selectedLeaf.getAttribute('data-file-id');
    await expect.poll(() => fileRequests.length).toBeGreaterThan(1);
    const fileRequestsBeforeFilter = fileRequests.length;

    await collisionDirectory.click();
    await expect(collisionDirectory).toHaveAttribute('aria-expanded', 'false');
    const collapsedTreeitemCount = await treeitems.count();
    await filterButton.click();
    await filter.fill('collision');
    await expect(collisionDirectory).toHaveAttribute('aria-expanded', 'true');
    await expect(treeitems).toHaveCount(3);
    await expect(
      tree.locator('[role="treeitem"] .path-display .path-text__filename').filter({
        hasText: /^�\.ts$/,
      }),
    ).toHaveCount(2);
    await expect(
      tree.getByRole('treeitem', { name: /^control\/?$/i }),
    ).toHaveCount(0);
    await expect(
      tree.getByRole('treeitem', { name: /^src\/deep\/only\/?$/i }),
    ).toHaveCount(0);
    await expect(tree.getByRole('treeitem', { name: /binary\.dat/i })).toHaveCount(0);
    await expect(tree.getByRole('treeitem', { name: /copy-target\.ts/i })).toHaveCount(0);
    await expect(tree.getByRole('treeitem', { name: /deleted\.txt/i })).toHaveCount(0);
    await expect(tree.getByRole('treeitem', { name: /tracked\.txt/i })).toHaveCount(0);
    await expect.poll(() => fileRequests.length).toBe(fileRequestsBeforeFilter);

    await filter.fill('COLLISION');
    await expect(treeitems).toHaveCount(3);
    await filter.fill('src/deep');
    await expect(
      tree.getByRole('treeitem', {
        name: /renamed from src\/deep\/only\/rename-source\.ts to src\/deep\/only\/renamed\.ts/i,
      }),
    ).toBeVisible();
    await expect.poll(() => fileRequests.length).toBe(fileRequestsBeforeFilter);

    await filter.fill('no matching path');
    await expect(treeitems).toHaveCount(0);
    await expect(tabbableTreeitems).toHaveCount(0);
    await expect(navigation.getByText('No changed files match “no matching path”.')).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Clear filter' })).toBeVisible();
    await expect(tree).toBeAttached();

    await navigation.getByRole('button', { name: 'Clear filter' }).click();
    await expect(treeitems).toHaveCount(collapsedTreeitemCount);
    await expect(selectedLeaf).toHaveAttribute('data-file-id', selectedFileId!);
    await expect(tabbableTreeitems).toHaveCount(1);
    await expect(tabbableTreeitems).toHaveAttribute('data-file-id', selectedFileId!);
    await expect(collisionDirectory).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => fileRequests.length).toBe(fileRequestsBeforeFilter);

    await filter.fill('tracked');
    const clearFilter = navigation.getByRole('button', { name: 'Clear filter' });
    await expect(clearFilter).toBeVisible();
    await clearFilter.click();
    await expect(filter).toBeFocused();
    await expect(filter).toHaveValue('');
    await expect(clearFilter).toHaveCount(0);

    const listToggle = navigation.getByRole('button', { name: /View as (list|tree)/ });
    const collapseAllButton = navigation.getByRole('button', { name: 'Collapse all' });
    await expect(filter).toBeVisible();
    await expect(listToggle).toBeVisible();
    await expect(collapseAllButton).toBeVisible();
    await filterButton.click();
    await expect(filter).toBeHidden();
    await filterButton.click();
    await expect(filter).toBeFocused();
    await listToggle.click();
    await expect(navigation.getByRole('listbox', { name: 'Changed files' })).toBeVisible();
    await expect(tree).toHaveCount(0);
    await listToggle.click();
    await expect(tree).toBeVisible();
    await expect.poll(() => browserErrors).toEqual([]);
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('packaged file tree view-options menu persists line-count mode and comment-badge toggle', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  try {
    await page.goto(await waitForLoopbackUrl(running));

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    await expect(tree).toBeVisible();

    const trackedRow = tree.getByRole('treeitem', { name: /tracked\.txt/i });
    await trackedRow.click();

    // Add a real comment through the app's own composer (not a raw API
    // call) so the badge reflects normal client state, with no page reload
    // required — reloading this packaged session is out of scope here: the
    // boot script strips the one-time auth token from the URL via
    // `history.replaceState` once read (src/web/api/client.ts:126), so a
    // real reload is covered only by this plan's manual cross-check, not an
    // automated assertion.
    const editorSurface = page
      .locator('.monaco-diff-editor .editor.modified .monaco-scrollable-element.editor-scrollable')
      .first();
    await editorSurface.hover({ position: { x: 16, y: 16 } });
    const affordance = page.locator('.diff-workspace__gutter-action[data-anchor-side="head"]');
    await expect(affordance).toBeVisible();
    await affordance.click();
    await page.locator('.monaco-anchor-zone--composer textarea').fill('seed comment for badge test');
    const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await accepted).status()).toBe(201);

    // Select a different row so tracked.txt stays neither selected nor
    // hovered below — otherwise its line-counts would already render at
    // full opacity under the default hover-or-selected mode, masking
    // whether "Always" mode is actually what made it visible.
    await tree.getByRole('treeitem', { name: /copy-target\.ts/i }).click();
    await expect(trackedRow.locator('.cbadge')).toBeVisible();

    const viewOptionsButton = navigation.getByRole('button', { name: 'View options' });
    const menu = page.getByRole('menu', { name: 'View options' });
    await expect(menu).toBeHidden();
    await viewOptionsButton.click();
    await expect(menu).toBeVisible();

    const alwaysOption = menu.getByRole('menuitemradio', { name: 'Always' });
    await alwaysOption.click();
    await expect(alwaysOption).toHaveAttribute('aria-checked', 'true');
    await expect(menu).toBeVisible();
    await expect(trackedRow.locator('.line-counts')).toHaveCSS('opacity', '1');

    const badgesCheckbox = menu.getByRole('menuitemcheckbox', { name: 'Open comment badges' });
    await badgesCheckbox.click();
    await expect(badgesCheckbox).toHaveAttribute('aria-checked', 'false');
    await expect(trackedRow.locator('.cbadge')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(viewOptionsButton).toBeFocused();

    // Both selections round-tripped through `panelState.persist()` into the
    // same versioned localStorage key Phase 20 already established.
    const persisted = await page.evaluate(
      (key) => localStorage.getItem(key),
      PANEL_STATE_STORAGE_KEY,
    );
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!)).toMatchObject({
      treeLineCounts: 'always',
      treeCommentBadges: false,
    });
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('packaged file tree keeps line counts hidden until a real hover or a keyboard selection in the default hover mode', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(await waitForLoopbackUrl(running));
    await expect.poll(() => browserErrors).toEqual([]);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    await expect(tree).toBeVisible();

    const trackedRow = tree.getByRole('treeitem', {
      name: /tracked\.txt.*Text.*\d+ additions?.*1 deletion.*modified/i,
    });
    const copiedRow = tree.getByRole('treeitem', {
      name: /copied from copy-source\.ts to copy-target\.ts.*Text.*copied/i,
    });
    const renamedRow = tree.getByRole('treeitem', {
      name: /renamed from src\/deep\/only\/rename-source\.ts to src\/deep\/only\/renamed\.ts.*Text.*renamed/i,
    });

    // Select tracked.txt explicitly, then move the real mouse off every row
    // so copiedRow/renamedRow start out neither selected nor hovered — the
    // default-mode scenario from 21-VERIFICATION.md's "Human Verification
    // Required" §1.
    await trackedRow.click();
    await expect(trackedRow).toHaveAttribute('aria-selected', 'true');
    await navigation.locator('.tree-footer').hover();
    await expect(copiedRow).not.toHaveAttribute('aria-selected', 'true');
    await expect(renamedRow).not.toHaveAttribute('aria-selected', 'true');
    await expect(copiedRow.locator('.line-counts')).toHaveCSS('opacity', '0');
    await expect(renamedRow.locator('.line-counts')).toHaveCSS('opacity', '0');

    // A real mouse hover over an unselected, previously-unhovered row makes
    // its +N -N counts visible, with no view-options menu interaction.
    await copiedRow.hover();
    await expect(copiedRow.locator('.line-counts')).toHaveCSS('opacity', '1');
    await navigation.locator('.tree-footer').hover();
    await expect(copiedRow.locator('.line-counts')).toHaveCSS('opacity', '0');

    // Keyboard-selecting a different row, with the mouse never touching
    // it, also reveals its counts. Locator.focus() dispatches a real DOM
    // focus event with no mouse movement — in this app every row's
    // `@focus` handler runs the same `model.focusRow()` path arrow-key
    // navigation uses, which selects the file as well as focusing it.
    await expect(renamedRow).not.toHaveAttribute('aria-selected', 'true');
    await renamedRow.focus();
    await expect(renamedRow).toHaveAttribute('aria-selected', 'true');
    await expect(renamedRow.locator('.line-counts')).toHaveCSS('opacity', '1');
    await expect.poll(() => browserErrors).toEqual([]);
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('packaged file tree filter Enter opens the first match and ArrowDown moves focus into the tree without closing the filter', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  const fileRequests: FileRequestEvidence[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    const evidence = captureFileRequest(request);
    if (evidence !== undefined) {
      fileRequests.push(evidence);
    }
  });

  try {
    await page.goto(await waitForLoopbackUrl(running));
    await expect.poll(() => browserErrors).toEqual([]);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    const filterButton = navigation.getByRole('button', { name: /Filter changed files/ });
    const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
    await expect(tree).toBeVisible();

    await filterButton.click();
    await filter.fill('collision');
    const treeitemsAfterFilter = tree.locator('[role="treeitem"]');
    await expect(treeitemsAfterFilter).toHaveCount(3);
    const rowsAfterFilter = await treeitemsAfterFilter.evaluateAll((elements) =>
      elements.map((element) => ({
        rowId: element.getAttribute('data-row-id'),
        fileId: element.getAttribute('data-file-id'),
        isDirectory: element.hasAttribute('aria-expanded'),
      })),
    );
    const firstMatch = rowsAfterFilter.find((row) => !row.isDirectory);
    expect(firstMatch?.fileId).not.toBeNull();

    // Enter opens/selects the first visible matching file (21-VERIFICATION.md
    // "Human Verification Required" §2, first half).
    await filter.press('Enter');
    const selectedLeaf = tree.locator('[role="treeitem"][aria-selected="true"]');
    await expect(selectedLeaf).toHaveAttribute('data-file-id', firstMatch!.fileId!);
    await expect
      .poll(() => fileRequests.some((request) => request.pathname === `/api/files/${firstMatch!.fileId}/content`))
      .toBe(true);
    // Enter also moves real DOM focus onto the newly-activated row (every
    // FileTree selection change re-focuses its row via applyModel's
    // focusModelRow()) — the filter itself stays open with its value
    // intact, which is what §2 actually requires.
    await expect(selectedLeaf).toBeFocused();
    await expect(filter).toBeVisible();
    await expect(filter).toHaveValue('collision');

    // Re-focus the filter (a plain input click, not a row interaction) so
    // ArrowDown's own filter-keydown branch — not the tree's — is what
    // gets exercised next.
    await filter.click();
    await expect(filter).toBeFocused();

    // ArrowDown moves keyboard focus into the tree without closing or
    // clearing the filter (§2, second half).
    await page.keyboard.press('ArrowDown');
    await expect(filter).toBeVisible();
    await expect(filter).toHaveValue('collision');
    const focusedTreeitem = tree.locator('[role="treeitem"]:focus');
    await expect(focusedTreeitem).toHaveCount(1);
    await expect(focusedTreeitem).toHaveAttribute('data-row-id', firstMatch!.rowId!);
    await expect.poll(() => browserErrors).toEqual([]);
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('packaged file tree list mode keeps tree keyboard semantics and dims the directory segment', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createFileTreeFixture();
  const running = startGeneratedCli(repository);
  const fileRequests: FileRequestEvidence[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text());
    }
  });
  page.on('request', (request) => {
    const evidence = captureFileRequest(request);
    if (evidence !== undefined) {
      fileRequests.push(evidence);
    }
  });

  try {
    await page.goto(await waitForLoopbackUrl(running));
    await expect.poll(() => browserErrors).toEqual([]);

    const navigation = page.getByRole('navigation', { name: 'Changed files' });
    const tree = navigation.getByRole('tree', { name: 'Changed files' });
    await expect(tree).toBeVisible();

    // control/line\nbreak.ts is added (not renamed/copied), so it renders
    // through PathDisplay's single-PathText branch — unlike the renamed/
    // copied rows, which render two PathText instances (old + new) and
    // would make a directory/filename DOM-order assertion ambiguous.
    const controlRow = tree.getByRole('treeitem', { name: /control\/line\\nbreak\.ts/ });
    const controlFileId = await controlRow.getAttribute('data-file-id');
    expect(controlFileId).not.toBeNull();

    const treeFileIdsInOrder = await tree.locator('[role="treeitem"]').evaluateAll((elements) =>
      elements
        .filter((element) => !element.hasAttribute('aria-expanded'))
        .map((element) => element.getAttribute('data-file-id')),
    );
    expect(treeFileIdsInOrder.length).toBeGreaterThan(1);

    const listToggle = navigation.getByRole('button', { name: /View as (list|tree)/ });
    await listToggle.click();
    const list = navigation.getByRole('listbox', { name: 'Changed files' });
    await expect(list).toBeVisible();
    await expect(tree).toHaveCount(0);

    const listRows = list.locator('[role="option"]');
    const listFileIdsInOrder = await listRows.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-file-id')),
    );
    expect(listFileIdsInOrder).toEqual(treeFileIdsInOrder);

    // Dimmed-directory rendering (21-VERIFICATION.md §3): each list row
    // shows a muted `.path-text__directory` segment, dimmed via
    // `--text-muted`. Per PathText.vue's actual template
    // (src/web/components/ui/PathText.vue), the directory span precedes the
    // filename span in DOM order; 21-VERIFICATION.md's "filename first"
    // wording does not match the shipped markup — see this plan's SUMMARY
    // for the deviation note.
    const controlListRow = list.locator(`[role="option"][data-file-id="${controlFileId}"]`);
    await expect(controlListRow.locator('.path-text__directory')).toBeVisible();
    await expect(controlListRow.locator('.path-text__directory')).toContainText('control/');
    await expect(controlListRow.locator('.path-text__filename')).toContainText('line\\nbreak.ts');
    await expect(controlListRow.locator('.path-text__directory')).toHaveCSS('color', 'rgb(167, 177, 189)');
    const segmentClasses = await controlListRow
      .locator('.path-text__directory, .path-text__filename')
      .evaluateAll((elements) => elements.map((element) => element.className));
    expect(segmentClasses).toEqual(['path-text__directory', 'path-text__filename']);

    // Keyboard parity with tree mode: Home/End/ArrowUp/ArrowDown move
    // focus, Enter/Space activate — same keys, same resulting file order.
    const firstRow = listRows.first();
    const lastRow = listRows.last();
    const secondRow = listRows.nth(1);
    const lastRowFileId = listFileIdsInOrder.at(-1);
    const secondRowFileId = listFileIdsInOrder[1];
    expect(lastRowFileId).not.toBeNull();
    expect(secondRowFileId).not.toBeNull();

    await firstRow.focus();
    await page.keyboard.press('Home');
    await expect(firstRow).toBeFocused();
    await page.keyboard.press('End');
    await expect(lastRow).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(lastRow).not.toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(lastRow).toBeFocused();

    await page.keyboard.press('Space');
    await expect(lastRow).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => fileRequests.some((request) => request.pathname === `/api/files/${lastRowFileId}/content`))
      .toBe(true);

    // Enter on a row other than the already-selected `firstRow` (whichever
    // file loaded by default on page open) so a fresh content fetch proves
    // the key actually activates, not merely that the row was already open.
    await page.keyboard.press('Home');
    await expect(firstRow).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(secondRow).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(secondRow).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => fileRequests.some((request) => request.pathname === `/api/files/${secondRowFileId}/content`))
      .toBe(true);

    await expect.poll(() => browserErrors).toEqual([]);
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});

test('component tree replacement preserves opaque state without selecting again', async ({
  browser,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  await page.goto(fileTreeHarnessUrl);
  await page.evaluate(async () => {
    // The Vite plugin only exposes this component harness at runtime.
    const { mountFileTreeHarness } = await import(
      `/@id/${'virtual:file-tree-replacement-harness'}`,
    );
    document.body.innerHTML = '<div id="file-tree-harness"></div>';
    mountFileTreeHarness();
  });

  const navigation = page.getByRole('navigation', { name: 'Changed files' });
  const tree = navigation.getByRole('tree', { name: 'Changed files' });
  const filter = navigation.getByRole('searchbox', { name: 'Filter changed files' });
  const bravo = tree.getByRole('treeitem', { name: /bravo\.ts/i });
  const alpha = tree.getByRole('treeitem', { name: /alpha\.ts/i });
  const collapsed = tree.getByRole('treeitem', { name: /^collapsed\/?$/i });
  const kept = tree.getByRole('treeitem', { name: /^kept\/?$/i });

  await expect(alpha.getByLabel('2 open comments')).toBeVisible();
  await expect(bravo.getByLabel(/\d+ open comments?/)).toHaveCount(0);

  await bravo.click();
  await collapsed.click();
  await expect(collapsed).toHaveAttribute('aria-expanded', 'false');
  await kept.click();
  await expect(kept).toHaveAttribute('aria-expanded', 'false');
  await navigation.getByRole('button', { name: /Filter changed files/ }).click();
  await filter.fill('kept');
  await expect(kept).toHaveAttribute('aria-expanded', 'true');
  const projectedRowIds = await tree.locator('[role="treeitem"]').evaluateAll(
    (rows) => rows.map((row) => row.getAttribute('data-row-id')),
  );
  const selectCount = await page.locator('#file-tree-select-count').textContent();

  await page.evaluate(() =>
    (globalThis as typeof globalThis & {
      __replaceFileTreeFiles: () => void;
    }).__replaceFileTreeFiles(),
  );

  await expect(filter).toHaveValue('kept');
  await expect(bravo).toHaveAttribute('aria-selected', 'true');
  await expect(bravo).toHaveAttribute('tabindex', '0');
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await expect(kept).toBeFocused();
  await expect(tree.locator('[role="treeitem"]').evaluateAll(
    (rows) => rows.map((row) => row.getAttribute('data-row-id')),
  )).resolves.toEqual(projectedRowIds);
  await expect(page.locator('#file-tree-select-count')).toHaveText(selectCount ?? '');

  await filter.fill('');
  await expect(collapsed).toHaveAttribute('aria-expanded', 'false');
  await expect(kept).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.getByRole('treeitem', { name: /^new\/?$/i }))
    .toHaveAttribute('aria-expanded', 'true');
});
