import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
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
import type { Page } from '@playwright/test';

import { ExportReviewResultSchema } from '../../src/contracts/api.js';
import { ReviewExportV4Schema } from '../../src/contracts/draft.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), 'cumpa-standalone-pack-'));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, 'dist/bin/cumpa.mjs');
const fakeBinRoot = join(packedRoot, 'fake-bin');
test.setTimeout(90_000);

const loopbackUrlPattern = /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/;

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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before standalone review behavior: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function waitForLoopbackUrl(running: RunningCli): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const output = existsSync(running.outputPath)
      ? readFileSync(running.outputPath, 'utf8')
      : '';
    const match = output.match(loopbackUrlPattern);
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
    '[behavioral] timed out waiting for generated CLI loopback URL',
  );
}

/**
 * Inverts `waitForLoopbackUrl`'s success condition for the FILE-02/FILE-04
 * negative-path tests: waits until the generated CLI process exits, while
 * asserting the loopback URL never appears in its accumulated output at any
 * point during the wait (distinguishing "exited with a pre-launch error"
 * from "hung" rather than relying on a bare timeout).
 */
async function waitForRejectionWithoutLoopbackUrl(running: RunningCli): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const output = existsSync(running.outputPath)
      ? readFileSync(running.outputPath, 'utf8')
      : '';
    if (loopbackUrlPattern.test(output)) {
      throw new Error(
        `[behavioral] generated CLI printed a loopback URL when it should have been rejected before launch:\n${output}`,
      );
    }
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      return output;
    }
    const { promise, resolve: resolveWait } = Promise.withResolvers<void>();
    setTimeout(resolveWait, 25);
    await promise;
  }
  throw new Error(
    '[behavioral] timed out waiting for generated CLI to exit before launch',
  );
}

function startGeneratedStandaloneCli(
  repository: GitFixture,
  paths: readonly string[],
  options: Readonly<{ stdin?: 'ignore' | 'pipe' }> = {},
): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const browserMarkerPath = join(
    packedRoot,
    `browser-open-${crypto.randomUUID()}.log`,
  );
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath, ...paths], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      CUMPA_BROWSER_OPEN_MARKER: browserMarkerPath,
    },
    stdio: [options.stdin ?? 'ignore', outputDescriptor, outputDescriptor],
  });
  return { child, browserMarkerPath, outputPath, outputDescriptor };
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

async function openGeneratedStandaloneReview(
  page: Page,
  url: string,
  fileCount: number,
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const endpoints = page.getByRole('banner');
  await expect(endpoints.getByText('STANDALONE', { exact: true })).toBeVisible();
  await expect(endpoints.getByText(`Standalone review · ${fileCount} files`)).toBeVisible();
  await expect(endpoints.getByText('BASE', { exact: true })).toHaveCount(0);
  await expect(endpoints.getByText('HEAD', { exact: true })).toHaveCount(0);
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
  const affordance = page.getByRole('button', {
    name: `Add comment to ${sideWord} line ${lineNumber}`,
  });
  await expect(affordance).toBeVisible();
  await affordance.click();
}

async function openReviewNotes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Review notes', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Review notes' })).toBeVisible();
}

test.beforeAll(() => {
  const custody = join(packedRoot, 'custody');
  const evidence = join(packedRoot, 'runtime-evidence.json');
  runPrerequisite(process.execPath, [
    join(repositoryRoot, 'scripts/pack-runtime.mjs'),
    '--purpose',
    'development-check',
    '--custody-dir',
    custody,
    '--evidence',
    evidence,
  ]);
  const packed = JSON.parse(readFileSync(evidence, 'utf8')) as {
    readonly archive: { readonly basename: string; readonly sha256: string };
  };
  const archive = join(custody, packed.archive.basename);
  runPrerequisite(process.execPath, [
    join(repositoryRoot, 'scripts/verify-production-artifacts.mjs'),
    '--archive',
    archive,
    '--expected-sha256',
    packed.archive.sha256,
    '--evidence',
    evidence,
  ]);
  execFileSync('tar', ['-xzf', archive, '-C', packedRoot]);
  symlinkSync(join(repositoryRoot, 'node_modules'), join(extractedPackageRoot, 'node_modules'), 'dir');
  mkdirSync(fakeBinRoot, { recursive: true });
  const fakeOpen = join(packedRoot, 'open');
  writeFileSync(
    fakeOpen,
    [
      '#!/usr/bin/env node',
      "const { appendFileSync } = require('node:fs');",
      'const markerPath = process.env.CUMPA_BROWSER_OPEN_MARKER;',
      'if (markerPath !== undefined) appendFileSync(markerPath, `${JSON.stringify(process.argv.slice(2))}\\n`);',
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

test('packaged cumpa <path> opens a standalone file, accepts a comment, and exports a schemaVersion 4 document whose provenance matches exactly what was reviewed', async ({ browser }) => {
  const fixture = await createGitFixture();
  const untrackedContent = 'export const added = true;\n';
  await fixture.write('src/added.ts', untrackedContent);
  const trackedPath = join(fixture.root, 'tracked.txt');
  const trackedBytes = readFileSync(trackedPath);
  const untrackedPath = join(fixture.root, 'src/added.ts');
  const untrackedBytes = readFileSync(untrackedPath);

  const argumentPaths = ['tracked.txt', 'src/added.ts'];
  const running = startGeneratedStandaloneCli(fixture, argumentPaths);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedStandaloneReview(page, url, 2);

    const treeRow = page.getByRole('treeitem', { name: /added\.ts/ });
    await treeRow.click();
    await expect(
      page.getByLabel('Diff navigation').getByText('Standalone · Untracked'),
    ).toBeVisible();

    await activateSinglePaneLine(page, 'head', 'export const added = true;', 1);
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await expect(composer).toHaveCount(1);
    await composer.fill('Standalone review comment.');
    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);

    await openReviewNotes(page);
    const dialog = page.getByRole('dialog', { name: 'Review notes' });
    const exported = page.waitForResponse((response) => response.url().includes('/api/export'));
    await dialog.getByRole('button', { name: 'Export review', exact: true }).click();
    const exportResponse = await exported;
    expect(exportResponse.status()).toBe(201);
    const exportResult = ExportReviewResultSchema.parse(await exportResponse.json());
    if (exportResult.kind !== 'exported' || !('standalone' in exportResult)) {
      throw new Error(`[behavioral] expected a standalone export result, got: ${JSON.stringify(exportResult)}`);
    }

    const reviewJsonPath = join(fixture.root, exportResult.files[0].path);
    const reviewJson = ReviewExportV4Schema.parse(
      JSON.parse(readFileSync(reviewJsonPath, 'utf8')),
    );
    expect(reviewJson.schemaVersion).toBe(4);
    expect([...reviewJson.standalone.originalArguments].sort()).toEqual(
      [...argumentPaths].sort(),
    );
    expect(reviewJson.standalone.resolvedPaths.length).toBe(2);

    const trackedDigest = reviewJson.standalone.fileDigests.find(
      (entry) => entry.path.display === 'tracked.txt',
    );
    const untrackedDigest = reviewJson.standalone.fileDigests.find(
      (entry) => entry.path.display === 'src/added.ts',
    );
    expect(trackedDigest?.sha256).toBe(createHash('sha256').update(trackedBytes).digest('hex'));
    expect(untrackedDigest?.sha256).toBe(createHash('sha256').update(untrackedBytes).digest('hex'));

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('cumpa <nonexistent-path> fails before launch with a clear error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  const running = startGeneratedStandaloneCli(fixture, ['does-not-exist.txt']);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain('does-not-exist.txt');
    expect(output).toContain('did not match any file');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('cumpa <ignored-path> fails before launch with a .gitignore-specific error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  await fixture.write('.gitignore', 'secret.txt\n');
  await fixture.write('secret.txt', 'ignored content\n');
  const running = startGeneratedStandaloneCli(fixture, ['secret.txt']);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain('secret.txt');
    expect(output).toContain('.gitignore');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('cumpa --worktree <path> fails before launch with a mode-exclusivity error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  const running = startGeneratedStandaloneCli(fixture, ['tracked.txt', '--worktree']);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain('--worktree');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('cumpa ../outside.txt fails before launch with a clear traversal error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  // Argument resolution always runs `git ls-files`/`check-ignore` with the
  // repository root as cwd (resolveOneArgument in
  // src/git/standalone-resolution.ts), regardless of the CLI process's own
  // working directory — so a `../` argument escapes one level above the
  // repository root, not above whatever nested directory the CLI happens to
  // be spawned from.
  const outsideFile = join(dirname(fixture.root), 'outside.txt');
  writeFileSync(outsideFile, 'outside content\n');
  const running = startGeneratedStandaloneCli(fixture, ['../outside.txt']);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain('../outside.txt');
    expect(output).toContain('resolves outside the repository');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
    rmSync(outsideFile, { force: true });
  }
});

test('cumpa <absolute-path-outside> fails before launch with a clear error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  const outsideFile = join(tmpdir(), `cumpa-standalone-absolute-outside-${crypto.randomUUID()}.txt`);
  writeFileSync(outsideFile, 'outside content\n');
  const running = startGeneratedStandaloneCli(fixture, [outsideFile]);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain(outsideFile);
    expect(output).toContain('resolves outside the repository');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
    rmSync(outsideFile, { force: true });
  }
});

test('cumpa <symlink-escape-path> fails before launch with a clear error and never opens a browser', async () => {
  const fixture = await createGitFixture();
  const outsideTargetDirectory = join(tmpdir(), `cumpa-standalone-escape-target-${crypto.randomUUID()}`);
  mkdirSync(outsideTargetDirectory, { recursive: true });
  writeFileSync(join(outsideTargetDirectory, 'secret.txt'), 'outside secret\n');
  // DEVIATION (Rule 1 - bug in plan wording): argument resolution runs
  // `git ls-files`/`check-ignore` with the repository root as cwd
  // (resolveOneArgument), never the CLI process's own nested working
  // directory, so a symlink placed under `fixture.nestedCwd` would never be
  // reached by the pathspec at all (it would just look like a nonexistent
  // top-level path and short-circuit before the symlink defense is ever
  // exercised). Placing the symlink at the repository root — matching
  // `tests/git/standalone-resolution.test.ts`'s own `makeStandaloneFixture`
  // fixture — is the only placement that actually walks Git's pathspec
  // engine through the symlinked directory and proves the real defense.
  symlinkSync(outsideTargetDirectory, join(fixture.root, 'escape-link'), 'dir');
  const running = startGeneratedStandaloneCli(fixture, ['escape-link/secret.txt']);
  try {
    const output = await waitForRejectionWithoutLoopbackUrl(running);
    expect(running.child.exitCode).toBe(1);
    expect(output).toContain('did not match any file');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
    rmSync(outsideTargetDirectory, { force: true, recursive: true });
  }
});
