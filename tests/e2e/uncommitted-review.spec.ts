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
import type { Page } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-uncommitted-pack-`));
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before uncommitted review behavior: ${error instanceof Error ? error.message : String(error)}`,
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
    '[behavioral] timed out waiting for generated CLI loopback URL',
  );
}

function startGeneratedUncommittedCli(
  repository: GitFixture,
  flags: readonly string[],
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
  const child = spawn(process.execPath, [executablePath, ...flags], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      [`${RENAME_MAP.envPrefix}BROWSER_OPEN_MARKER`]: browserMarkerPath,
    },
    stdio: [options.stdin ?? 'ignore', outputDescriptor, outputDescriptor],
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

async function openGeneratedUncommittedReview(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const endpoints = page.getByRole('banner');
  await expect(endpoints.getByText('BASE', { exact: true })).toBeVisible();
  await expect(endpoints.getByText('HEAD', { exact: true })).toBeVisible();
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
  const button = page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
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
      `const markerPath = process.env.${RENAME_MAP.envPrefix}BROWSER_OPEN_MARKER;`,
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

test(`packaged ${RENAME_MAP.binCommand} --staged launches a frozen snapshot that survives an external edit, and Refresh reclassifies a comment to orphaned`, async ({ browser }) => {
  const fixture = await createGitFixture();
  await fixture.write('src/added.ts', 'export const added = true;\n');
  fixture.git(['add', 'src/added.ts']);
  const running = startGeneratedUncommittedCli(fixture, ['--staged']);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(page, url);

    const treeRow = page.getByRole('treeitem', { name: /added\.ts/ });
    await treeRow.click();
    await expect(page.getByText('Added · Head only')).toBeVisible();

    await activateSinglePaneLine(page, 'head', 'export const added = true;', 1);
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await expect(composer).toHaveCount(1);
    await composer.fill('Frozen snapshot comment.');
    const addResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);

    // A real edit made entirely outside Loopnote, after the snapshot was captured.
    // --staged reviews HEAD→index (git diff --cached), so the edit must be
    // re-staged to register as a change the Staged scope can see at all.
    await fixture.write('src/added.ts', 'export const added = true;\nexport const extra = 1;\n');
    fixture.git(['add', 'src/added.ts']);

    // SNAP-01: the already-open editor keeps showing only the frozen, one-line snapshot.
    const viewLines = page.locator('.diff-workspace__editor .view-line');
    await expect(viewLines.filter({ hasText: 'export const added = true;' })).toHaveCount(1);
    await expect(viewLines.filter({ hasText: 'extra' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Refresh snapshot' }).click();

    // D-15: the exact heading template, correctly omitting zero-count categories
    // (RefreshSummaryPanel.vue's headingText computed, 14-11) rather than the
    // literal "0 added, 0 removed, 1 modified" wording in 14-UI-SPEC.md's prose.
    const summaryHeading = page.getByRole('heading', { name: 'Since previous snapshot: 1 modified' });
    await expect(summaryHeading).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Modified', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'src/added.ts' })).toBeVisible();

    // D-16/SNAP-05: the server-side reclassification machinery (verifyDurableAnchor,
    // src/server/capabilities.ts's uncommitted refresh()) looks up the anchor's file
    // by exact (path, blobOid) match; any content change produces a new blobOid, so
    // the lookup fails and the comment reclassifies to 'orphaned' (not 'stale') —
    // confirmed by the panel's own count below. The RefreshSummaryPanel's count is
    // delivered directly in the POST /api/refresh response, so it updates correctly.
    await expect(page.getByText('1 comment now orphaned')).toBeVisible();

    // D-15/SNAP-04 (fixed by 14-14): performRefresh() now calls
    // workspace.replaceComments(...) after every successful refresh, so the
    // individual comment's client-side `status` field — and therefore
    // StaleAnchorNotice's `hasUnverifiedAnchors` trigger — reflects the
    // server-side reclassification above without a page reload.
    await expect(
      page.getByRole('heading', { name: 'Some saved comment anchors cannot be verified' }),
    ).toBeVisible();

    // D-15/SNAP-04 (fixed by 14-14 Task 2): the tree-row marker reflects the most recent Refresh's delta until the file is reopened.
    await expect(treeRow.getByText('Changed', { exact: true })).toBeVisible();
    await treeRow.click();
    await expect(treeRow.getByText('Changed', { exact: true })).toHaveCount(0);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test(`packaged ${RENAME_MAP.binCommand} --unstaged has no Base endpoint and ${RENAME_MAP.binCommand} --worktree surfaces an untracked file as added`, async ({ browser }) => {
  const unstagedFixture = await createGitFixture();
  await unstagedFixture.write('tracked.txt', 'base\nedited without staging\n');
  const unstagedRunning = startGeneratedUncommittedCli(unstagedFixture, ['--unstaged']);
  try {
    const url = await waitForLoopbackUrl(unstagedRunning);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(page, url);

    const endpoints = page.getByRole('banner');
    await expect(endpoints.getByText('Index', { exact: true })).toBeVisible();
    await expect(endpoints.getByText(/^[0-9a-f]{7}$/u)).toHaveCount(0);

    await page.close();
  } finally {
    await stopGeneratedCli(unstagedRunning);
    await unstagedFixture.cleanup();
  }

  const worktreeFixture = await createGitFixture();
  await worktreeFixture.write('src/untracked.ts', 'export const untracked = true;\n');
  const worktreeRunning = startGeneratedUncommittedCli(worktreeFixture, ['--worktree']);
  try {
    const url = await waitForLoopbackUrl(worktreeRunning);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(page, url);

    const treeRow = page.getByRole('treeitem', { name: /untracked\.ts/ });
    await treeRow.click();
    await expect(page.getByText('Added · Head only')).toBeVisible();

    await page.close();
  } finally {
    await stopGeneratedCli(worktreeRunning);
    await worktreeFixture.cleanup();
  }
});

test('the Export section is absent for an uncommitted session', async ({ browser }) => {
  const fixture = await createGitFixture();
  await fixture.write('src/added.ts', 'export const added = true;\n');
  fixture.git(['add', 'src/added.ts']);
  const running = startGeneratedUncommittedCli(fixture, ['--staged']);
  try {
    const url = await waitForLoopbackUrl(running);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(page, url);

    await openReviewNotes(page);
    const dialog = page.getByRole('region', { name: 'Review', exact: true });
    await expect(dialog.getByRole('button', { name: 'Export review', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Export review again', exact: true })).toHaveCount(0);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('Alt+Shift+R triggers the same real server-side refresh as the Refresh button, independently verified via /api/worktree-status', async ({ browser }) => {
  const fixture = await createGitFixture();
  await fixture.write('src/added.ts', 'export const added = true;\n');
  fixture.git(['add', 'src/added.ts']);
  const running = startGeneratedUncommittedCli(fixture, ['--staged'], { stdin: 'pipe' });
  try {
    const url = await waitForLoopbackUrl(running);
    const authority = new URL(url);
    const host = authority.host;
    const token = authority.hash.slice('#token='.length);

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(page, url);

    async function worktreeStatus(): Promise<boolean> {
      const response = await fetch(`http://${host}/api/worktree-status`, {
        headers: { host, origin: `http://${host}`, authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as { readonly changed: boolean };
      return body.changed;
    }

    await expect.poll(() => worktreeStatus()).toBe(false);

    await fixture.write('src/added.ts', 'export const added = true;\nexport const extra = 1;\n');
    fixture.git(['add', 'src/added.ts']);
    await expect.poll(() => worktreeStatus()).toBe(true);

    await page.keyboard.press('Alt+Shift+KeyR');
    await expect(
      page.getByRole('heading', { name: 'Since previous snapshot: 1 modified' }),
    ).toBeVisible();

    // Independent, UI-free proof the keyboard shortcut drove a real server-side
    // refresh, not just client-side state: the worktree-status change indicator
    // clears because the snapshot now matches the working tree again (D-13).
    await expect.poll(() => worktreeStatus()).toBe(false);

    // DEVIATION (documented in 14-13-SUMMARY.md): the running CLI terminal's
    // own `r`-keypress refresh (registerUncommittedRefreshKeypress in
    // src/cli/run.ts) only ever registers its stdin 'data' handler when
    // `process.stdin.isTTY === true`. A child process spawned with
    // `stdio: [..., 'pipe', ...]` never has a TTY stdin (confirmed
    // empirically), so writing 'r' to `running.child.stdin` below is the
    // literal D-13 mechanism but is a structural no-op in this harness —
    // src/cli/run.ts is outside this plan's files_modified scope, so it is
    // not changed here. The assertion below pins today's real, confirmed
    // behavior (status stays unchanged) rather than asserting an outcome
    // this suite cannot actually produce.
    await fixture.write('src/added.ts', 'export const added = true;\nexport const extra = 1;\nexport const more = 2;\n');
    fixture.git(['add', 'src/added.ts']);
    await expect.poll(() => worktreeStatus()).toBe(true);
    if (running.child.stdin === null) {
      throw new Error('[behavioral] generated CLI was not spawned with a writable stdin pipe');
    }
    running.child.stdin.write('r');
    const { promise: settle, resolve: resolveSettle } = Promise.withResolvers<void>();
    setTimeout(resolveSettle, 500);
    await settle;
    expect(await worktreeStatus()).toBe(true);

    await page.close();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test(`a second ${RENAME_MAP.binCommand} --staged launch on different staged content offers "Resume previous uncommitted review?", and accepting it copies the first session\'s comment into the new draft`, async ({ browser }) => {
  const fixture = await createGitFixture();
  let firstRunning: RunningCli | undefined;
  let secondRunning: RunningCli | undefined;
  const seededCommentBody = 'Carried over from the first uncommitted session.';
  try {
    await fixture.write('src/added.ts', 'export const added = true;\n');
    fixture.git(['add', 'src/added.ts']);
    firstRunning = startGeneratedUncommittedCli(fixture, ['--staged']);
    const firstUrl = await waitForLoopbackUrl(firstRunning);
    const firstPage = await browser.newPage();
    await firstPage.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(firstPage, firstUrl);

    const firstTreeRow = firstPage.getByRole('treeitem', { name: /added\.ts/ });
    await firstTreeRow.click();
    await expect(firstPage.getByText('Added · Head only')).toBeVisible();

    await activateSinglePaneLine(firstPage, 'head', 'export const added = true;', 1);
    const firstComposer = firstPage.locator('.monaco-anchor-zone--composer textarea');
    await expect(firstComposer).toHaveCount(1);
    await firstComposer.fill(seededCommentBody);
    const addResponse = firstPage.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await firstPage.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await addResponse).status()).toBe(201);

    await firstPage.close();
    await stopGeneratedCli(firstRunning);
    firstRunning = undefined;

    // Different digest, same source (Staged) and base (HEAD) — the exact D-19 trigger.
    await fixture.write('src/added.ts', 'export const added = true;\nexport const extra = 1;\n');
    fixture.git(['add', 'src/added.ts']);

    secondRunning = startGeneratedUncommittedCli(fixture, ['--staged']);
    const secondUrl = await waitForLoopbackUrl(secondRunning);
    const secondPage = await browser.newPage();
    await secondPage.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedUncommittedReview(secondPage, secondUrl);

    const warningStack = secondPage.locator('.shell-warning-stack');
    await expect(
      warningStack.getByRole('heading', { name: 'Resume previous uncommitted review?' }),
    ).toBeVisible();

    const draftResponse = secondPage.waitForResponse((response) => response.url().includes('/api/draft'));
    await warningStack.getByRole('button', { name: 'Resume', exact: true }).click();
    const draftBody = (await (await draftResponse).json()) as Readonly<{
      readonly draft?: Readonly<{ readonly comments?: readonly Readonly<{ readonly body: string }>[] }>;
    }>;
    expect(draftBody.draft?.comments?.length).toBe(1);
    expect(draftBody.draft?.comments?.[0]?.body).toBe(seededCommentBody);

    await expect(
      warningStack.getByRole('heading', { name: 'Resume previous uncommitted review?' }),
    ).toHaveCount(0);

    await secondPage.close();
  } finally {
    if (firstRunning !== undefined) {
      await stopGeneratedCli(firstRunning);
    }
    if (secondRunning !== undefined) {
      await stopGeneratedCli(secondRunning);
    }
    await fixture.cleanup();
  }
});
