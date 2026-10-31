import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  closeSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request as requestHttp } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, Page, TestInfo } from '@playwright/test';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), 'cumpa-complete-draft-pack-'));
const extractedPackageRoot = join(packedRoot, 'package');
const executablePath = join(extractedPackageRoot, 'dist/bin/cumpa.mjs');
const fakeBinRoot = join(packedRoot, 'fake-bin');
test.setTimeout(90_000);


interface RunningCli {
  readonly child: ChildProcess;
  readonly outputPath: string;
  readonly outputDescriptor: number;
}
interface StartGeneratedCliOptions {
  readonly head?: string;
  readonly recoveryFailure?: 'backup' | 'replacement';
  readonly revealMarkerPath?: string;
  readonly revealSucceeds?: boolean;
  readonly selections?: {
    readonly base: Record<string, unknown>;
    readonly head: Record<string, unknown>;
  };
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
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before packaged review behavior: ${error instanceof Error ? error.message : String(error)}`,
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
    if (match !== null) return match[0];
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      throw new Error(`[behavioral] generated CLI exited before publishing a loopback URL:\n${output}`);
    }
    const { promise, resolve: resolveWait } = Promise.withResolvers<void>();
    setTimeout(resolveWait, 25);
    await promise;
  }
  throw new Error('[behavioral] timed out waiting for generated CLI loopback URL');
}

function startGeneratedCli(
  repository: GitFixture,
  options: StartGeneratedCliOptions = {},
): RunningCli {
  const head = options.head ?? repository.headRef;
  const selections = options.selections ?? {
    base: {
      label: 'main',
      revision: repository.baseRef,
      source: { kind: 'branch', id: 'fixture-base', refName: repository.baseRef },
    },
    head: {
      label: head.slice('refs/heads/'.length),
      revision: head,
      source: { kind: 'branch', id: 'fixture-head', refName: head },
    },
  };
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      CUMPA_LAUNCH_OPTIONS: JSON.stringify({ cwd: repository.nestedCwd, ...selections }),
      ...(options.recoveryFailure === undefined
        ? {}
        : {
            NODE_ENV: 'test',
            CUMPA_TEST_RECOVERY_FAILURE: options.recoveryFailure,
          }),
      ...(options.revealMarkerPath === undefined
        ? {}
        : { CUMPA_TEST_REVEAL_MARKER: options.revealMarkerPath }),
      ...(options.revealSucceeds === true ? { CUMPA_TEST_REVEAL_SUCCESS: '1' } : {}),
    },
    stdio: ['ignore', outputDescriptor, outputDescriptor],
  });
  return { child, outputPath, outputDescriptor };
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


async function openReviewNotes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Review notes', exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Review notes' })).toBeVisible();
}

async function openGeneratedReview(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const endpoints = page.getByRole('banner');
  await expect(endpoints.getByText('BASE', { exact: true })).toBeVisible();
  await expect(endpoints.getByText('HEAD', { exact: true })).toBeVisible();
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
  const editorSurface = page.locator(`.monaco-diff-editor .${editor.split(' ').join('.')} .monaco-scrollable-element.editor-scrollable`).first();
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
  const affordance = page.getByRole('button', {
    name: `Add comment to ${side} line ${lineNumber}`,
  });
  await expect(affordance).toBeVisible();
  await affordance.click();
}

async function activateTopMonacoLine(page: Page, side: 'base' | 'head'): Promise<void> {
  const editor = side === 'base' ? 'editor original' : 'editor modified';
  const editorSurface = page
    .locator(
      `.monaco-diff-editor .${editor.split(' ').join('.')} .monaco-scrollable-element.editor-scrollable`,
    )
    .first();
  await editorSurface.hover({ position: { x: 16, y: 16 } });
  const affordance = page.locator(
    `.diff-workspace__gutter-action[data-anchor-side="${side}"]`,
  );
  await expect(affordance).toBeVisible();
  await affordance.click();
}

interface FileSnapshot {
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly mtimeMs: number;
  readonly size: number;
}

function snapshotFile(path: string): FileSnapshot {
  const bytes = readFileSync(path);
  const stat = statSync(path);
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
}

function expectSameFileSnapshot(before: FileSnapshot, path: string): void {
  const after = snapshotFile(path);
  expect(after.bytes).toEqual(before.bytes);
  expect(after.sha256).toBe(before.sha256);
  expect(after.size).toBe(before.size);
  expect(after.mtimeMs).toBe(before.mtimeMs);
}

function snapshotSource(fixture: GitFixture): Readonly<Record<string, string>> {
  return {
    head: fixture.git(['rev-parse', 'HEAD']).toString('ascii').trim(),
    index: fixture.git(['status', '--porcelain=v1', '-z']).toString('base64'),
    tree: fixture.git(['rev-parse', 'HEAD^{tree}']).toString('ascii').trim(),
  };
}

async function postReveal(
  url: string,
  options: Readonly<{
    readonly authorization?: string;
    readonly host?: string;
    readonly origin?: string;
    readonly path?: string;
    readonly body?: string;
  }> = {},
): Promise<Readonly<{ readonly status: number; readonly body: string }>> {
  const target = new URL(options.path ?? '/api/draft/reveal', url);
  const { promise, resolve: resolveRequest, reject: rejectRequest } =
    Promise.withResolvers<Readonly<{ readonly status: number; readonly body: string }>>();
  const request = requestHttp({
    host: '127.0.0.1',
    port: Number(target.port),
    path: `${target.pathname}${target.search}`,
    method: 'POST',
    headers: {
      host: options.host ?? target.host,
      ...(options.origin === undefined ? {} : { origin: options.origin }),
      ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(options.body) }),
    },
  }, (response) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => {
      resolveRequest({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
    });
  });
  request.on('error', rejectRequest);
  request.end(options.body);
  return await promise;
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
      "const openedDraft = process.argv.slice(2).some((argument) => !argument.startsWith('-') && !argument.startsWith('http://'));",
      "if (process.env.CUMPA_TEST_REVEAL_MARKER !== undefined && openedDraft) appendFileSync(process.env.CUMPA_TEST_REVEAL_MARKER, 'revealed\\n');",
      "process.exitCode = process.env.CUMPA_TEST_REVEAL_SUCCESS === '1' ? 0 : 1;",
      '',
    ].join('\n'),
  );
  copyFileSync(fakeOpen, join(fakeBinRoot, 'open'));
  chmodSync(join(fakeBinRoot, 'open'), 0o755);
});

test.afterAll(() => {
  rmSync(packedRoot, { force: true, recursive: true });
});

test('complete draft lifecycle saves a safe summary and relaunches it through the packaged Review', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const summary = '## Review outcome\n\nKeep **this** review.';
  let running = startGeneratedCli(fixture);

  try {
    await openGeneratedReview(page, await waitForLoopbackUrl(running));
    await openReviewNotes(page);
    await page.getByRole('button', { name: 'Write summary' }).click();
    const summaryEditor = page.getByLabel('Review summary (Markdown)');
    await summaryEditor.fill('<script>window.bad = true</script>\n\n' + summary);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.locator('.review-summary__preview script')).toHaveCount(0);
    await expect(page.locator('.review-summary__preview')).toContainText('Review outcome');
    await page.getByRole('tab', { name: 'Edit' }).click();
    await summaryEditor.fill(summary);
    await expect(page.getByRole('button', { name: 'Save summary' })).toBeEnabled();
    const savedResponse = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.getByRole('button', { name: 'Save summary' }).click();
    expect((await savedResponse).status()).toBe(200);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  } finally {
    await stopGeneratedCli(running);
  }

  running = startGeneratedCli(fixture);
  try {
    await openGeneratedReview(page, await waitForLoopbackUrl(running));
    await openReviewNotes(page);
    await expect(page.locator('.review-summary__preview')).toContainText('Review outcome');
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('two-tab conflict retains the summary buffer and requires fresh explicit CAS after reload', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const otherTab = await browser.newPage();
  const seedBody = 'Shared comment before two tabs.';
  const remoteBody = 'Comment added by tab A after tab B loaded.';
  const firstCanonicalSummary = 'Summary accepted by tab A.';
  const attemptedSummary = 'Summary attempted by tab B.';
  let running: RunningCli | undefined;

  try {
    running = startGeneratedCli(fixture);
    const url = await waitForLoopbackUrl(running);
    const accessToken = new URL(url).hash.replace(/^#token=/, '');
    expect(accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, url);
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateMonacoLine(page, 'head', 'export const stableContext10 = 10;', 10);
    await page.locator('.monaco-anchor-zone--composer textarea').fill(seedBody);
    const seeded = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await seeded).status()).toBe(201);

    await otherTab.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(otherTab, url);
    await openReviewNotes(otherTab);
    await otherTab.getByRole('button', { name: 'Write summary' }).click();
    const otherSummary = otherTab.getByLabel('Review summary (Markdown)');
    await otherSummary.fill(attemptedSummary);

    await activateMonacoLine(page, 'head', 'export const stableContext8 = 8;', 8);
    await page.locator('.monaco-anchor-zone--composer textarea').fill(remoteBody);
    const remoteAdded = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await remoteAdded).status()).toBe(201);

    await openReviewNotes(page);
    await page.getByRole('button', { name: 'Write summary' }).click();
    const canonicalSummary = page.getByLabel('Review summary (Markdown)');
    await canonicalSummary.fill(firstCanonicalSummary);
    const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await page.getByRole('button', { name: 'Save summary' }).click();
    expect((await accepted).status()).toBe(200);
    await page.getByRole('button', { name: 'Close review notes' }).click();

    const draftsDirectory = join(fixture.root, '.cumpa', 'drafts');
    const draftFilename = readdirSync(draftsDirectory).find((candidate) => candidate.endsWith('.json'));
    expect(draftFilename).toBeDefined();
    const draftPath = join(draftsDirectory, draftFilename!);
    const acceptedBytes = readFileSync(draftPath);
    const acceptedHash = createHash('sha256').update(acceptedBytes).digest('hex');
    const acceptedRevision = JSON.parse(acceptedBytes.toString('utf8')).revision;
    const acceptedStat = statSync(draftPath);
    const acceptedEntries = readdirSync(draftsDirectory).sort();

    const conflict = otherTab.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
    await otherTab.getByRole('button', { name: 'Save summary' }).click();
    const conflictResponse = await conflict;
    expect(conflictResponse.status()).toBe(409);
    await expect(otherTab.getByText('Conflict — unsaved text retained', { exact: true })).toBeVisible();
    expect(await conflictResponse.json()).toMatchObject({
      kind: 'revisionConflict',
      expectedRevision: acceptedRevision - 2,
      actualRevision: acceptedRevision,
      latest: { revision: acceptedRevision, summary: firstCanonicalSummary },
    });
    expect(readFileSync(draftPath)).toEqual(acceptedBytes);
    expect(createHash('sha256').update(readFileSync(draftPath)).digest('hex')).toBe(acceptedHash);
    expect(statSync(draftPath).mtimeMs).toBe(acceptedStat.mtimeMs);
    expect(readdirSync(draftsDirectory).sort()).toEqual(acceptedEntries);
    await expect(otherSummary).toHaveValue(attemptedSummary);

    await otherTab.getByRole('button', { name: 'Reload latest' }).click();
    await expect(otherTab.getByText('Conflict — unsaved text retained', { exact: true })).toHaveCount(0);
    await expect(otherSummary).toHaveValue(attemptedSummary);
    await otherTab.getByRole('button', { name: 'Close review notes' }).click();
    const afterDeleteRevision = JSON.parse(readFileSync(draftPath).toString('utf8')).revision;

    const occupiedResult = await page.evaluate(async ({ token, expectedRevision }) => {
      const headers = { authorization: `Bearer ${token}` };
      const sessionResponse = await fetch('/api/session', { headers });
      const session = await sessionResponse.json() as { readonly files: readonly { readonly fileId: string; readonly newPath?: { readonly display: string } }[] };
      const file = session.files.find((candidate) => candidate.newPath?.display === 'src/changed.ts');
      if (file === undefined) throw new Error('changed fixture file is unavailable');
      const response = await fetch('/api/draft/mutations', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'addComment',
          expectedRevision,
          fileId: file.fileId,
          side: 'head',
          line: 9,
          body: 'Tab A owns this anchor.',
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { token: accessToken, expectedRevision: afterDeleteRevision });
    expect(occupiedResult).toMatchObject({
      status: 201,
      body: { kind: 'accepted', draft: { revision: afterDeleteRevision + 1 } },
    });
    const occupiedBytes = readFileSync(draftPath);
    const occupiedHash = createHash('sha256').update(occupiedBytes).digest('hex');
    const occupiedStat = statSync(draftPath);
    const occupiedEntries = readdirSync(draftsDirectory).sort();

    const staleAddResult = await otherTab.evaluate(async ({ token, expectedRevision }) => {
      const headers = { authorization: `Bearer ${token}` };
      const sessionResponse = await fetch('/api/session', { headers });
      const session = await sessionResponse.json() as { readonly files: readonly { readonly fileId: string; readonly newPath?: { readonly display: string } }[] };
      const file = session.files.find((candidate) => candidate.newPath?.display === 'src/changed.ts');
      if (file === undefined) throw new Error('changed fixture file is unavailable');
      const response = await fetch('/api/draft/mutations', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'addComment',
          expectedRevision,
          fileId: file.fileId,
          side: 'head',
          line: 9,
          body: 'Add attempted by tab B.',
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { token: accessToken, expectedRevision: afterDeleteRevision });
    expect(staleAddResult).toMatchObject({
      status: 409,
      body: {
        kind: 'revisionConflict',
        expectedRevision: afterDeleteRevision,
        actualRevision: afterDeleteRevision + 1,
      },
    });
    expect(readFileSync(draftPath)).toEqual(occupiedBytes);
    expect(createHash('sha256').update(readFileSync(draftPath)).digest('hex')).toBe(occupiedHash);
    expect(statSync(draftPath).mtimeMs).toBe(occupiedStat.mtimeMs);
    expect(readdirSync(draftsDirectory).sort()).toEqual(occupiedEntries);

    const freshAddResult = await otherTab.evaluate(async ({ token, expectedRevision }) => {
      const headers = { authorization: `Bearer ${token}` };
      const sessionResponse = await fetch('/api/session', { headers });
      const session = await sessionResponse.json() as { readonly files: readonly { readonly fileId: string; readonly newPath?: { readonly display: string } }[] };
      const file = session.files.find((candidate) => candidate.newPath?.display === 'src/changed.ts');
      if (file === undefined) throw new Error('changed fixture file is unavailable');
      const response = await fetch('/api/draft/mutations', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'addComment',
          expectedRevision,
          fileId: file.fileId,
          side: 'head',
          line: 9,
          body: 'Add attempted by tab B.',
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { token: accessToken, expectedRevision: afterDeleteRevision + 1 });
    expect(freshAddResult).toMatchObject({
      status: 404,
      body: { kind: 'invalidTarget' },
    });
    expect(readFileSync(draftPath)).toEqual(occupiedBytes);
    expect(JSON.parse(readFileSync(draftPath, 'utf8'))).toMatchObject({
      revision: afterDeleteRevision + 1,
      summary: firstCanonicalSummary,
      comments: expect.arrayContaining([
        expect.objectContaining({ body: remoteBody }),
        expect.objectContaining({ body: 'Tab A owns this anchor.' }),
      ]),
    });
  } finally {
    if (running !== undefined) await stopGeneratedCli(running);
    await otherTab.close();
    await fixture.cleanup();
  }
});

async function createPersistedDraft(page: Page, fixture: GitFixture): Promise<string> {
  const running = startGeneratedCli(fixture);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGeneratedReview(page, await waitForLoopbackUrl(running));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateMonacoLine(page, 'head', 'export const changed = "head value";', 9);
    await page.locator('.monaco-anchor-zone--composer textarea').fill('Recovery seed comment.');
    const response = page.waitForResponse((candidate) => candidate.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    expect((await response).status()).toBe(201);
  } finally {
    await stopGeneratedCli(running);
  }

  const directory = join(fixture.root, '.cumpa', 'drafts');
  const filename = readdirSync(directory).find((candidate) => candidate.endsWith('.json') && !candidate.includes('.bak'));
  expect(filename).toBeDefined();
  return join(directory, filename!);
}

test('corrupt draft recovery backs up exact bytes before starting a fresh packaged review', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  let running: RunningCli | undefined;

  try {
    const draftPath = await createPersistedDraft(page, fixture);
    const corrupted = Buffer.from('{ not a valid review draft', 'utf8');
    writeFileSync(draftPath, corrupted);
    const original = snapshotFile(draftPath);
    const source = snapshotSource(fixture);

    running = startGeneratedCli(fixture);
    await page.goto(await waitForLoopbackUrl(running), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Local review draft needs recovery' })).toBeVisible();
    await expect(page.getByText('Read only', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(fixture.root);
    await page.getByRole('button', { name: 'Back up and start new' }).click();
    await page.getByRole('button', { name: 'Back up and start new' }).last().click();
    await expect(page.getByRole('heading', { name: 'New draft started' })).toBeVisible();

    const backup = readdirSync(join(fixture.root, '.cumpa', 'drafts'))
      .find((candidate) => candidate.endsWith('.bak'));
    expect(backup).toBeDefined();
    const backupSnapshot = snapshotFile(join(fixture.root, '.cumpa', 'drafts', backup!));
    expect(backupSnapshot.bytes).toEqual(original.bytes);
    expect(backupSnapshot.sha256).toBe(original.sha256);
    expect(backupSnapshot.size).toBe(original.size);
    expect(snapshotFile(draftPath).sha256).not.toBe(original.sha256);
    expect(snapshotSource(fixture)).toEqual(source);
  } finally {
    if (running !== undefined) await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('corrupt recovery failures retain raw draft bytes and read-only packaged state', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);

  for (const failure of ['backup', 'replacement'] as const) {
    const fixture = await createGitFixture({ anchoredReview: true });
    let running: RunningCli | undefined;

    try {
      const draftPath = await createPersistedDraft(page, fixture);
      const corrupted = Buffer.from(`{ malformed recovery ${failure} bytes`, 'utf8');
      writeFileSync(draftPath, corrupted);
      const original = snapshotFile(draftPath);
      const source = snapshotSource(fixture);

      running = startGeneratedCli(fixture, { recoveryFailure: failure });
      await page.goto(await waitForLoopbackUrl(running), { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Back up and start new' }).click();
      const response = page.waitForResponse((candidate) => candidate.url().includes('/api/draft/recovery'));
      await page.getByRole('button', { name: 'Back up and start new' }).last().click();
      expect((await response).status()).toBe(500);

      await expect(page.getByRole('heading', { name: 'Recovery did not complete' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Local review draft needs recovery' })).toBeVisible();
      await expect(page.getByText('Read only', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'New draft started' })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(fixture.root);
      await expect(page.locator('body')).not.toContainText(corrupted.toString('utf8'));
      expectSameFileSnapshot(original, draftPath);
      expect(snapshotSource(fixture)).toEqual(source);

      const backups = readdirSync(join(fixture.root, '.cumpa', 'drafts'))
        .filter((candidate) => candidate.endsWith('.bak'));
      if (failure === 'backup') {
        expect(backups).toEqual([]);
      } else {
        expect(backups).toHaveLength(1);
        const backup = snapshotFile(join(fixture.root, '.cumpa', 'drafts', backups[0]!));
        expect(backup.bytes).toEqual(original.bytes);
        expect(backup.sha256).toBe(original.sha256);
        expect(backup.size).toBe(original.size);
      }
    } finally {
      if (running !== undefined) await stopGeneratedCli(running);
      await fixture.cleanup();
    }
  }
});

test('newer draft stays immutable while fixed reveal and safe copy reject browser authority', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  let running: RunningCli | undefined;

  try {
    const draftPath = await createPersistedDraft(page, fixture);
    const rawDraftSentinel = 'DRAFT_BYTES_MUST_NOT_LEAK';
    const newer = {
      ...JSON.parse(readFileSync(draftPath, 'utf8')) as Record<string, unknown>,
      schemaVersion: 2,
      summary: rawDraftSentinel,
    };
    writeFileSync(draftPath, JSON.stringify(newer));
    const original = snapshotFile(draftPath);
    const source = snapshotSource(fixture);

    running = startGeneratedCli(fixture, { revealSucceeds: true });
    const url = await waitForLoopbackUrl(running);
    const authority = new URL(url);
    const token = new URL(url).hash.replace(/^#token=/u, '');
    const authorization = `Bearer ${token}`;
    const denied = await Promise.all([
      postReveal(url, { host: `localhost:${authority.port}`, authorization, origin: authority.origin }),
      postReveal(url, { authorization, origin: 'http://example.invalid' }),
      postReveal(url),
      postReveal(url, { authorization, origin: authority.origin, body: JSON.stringify({ path: fixture.root }) }),
      postReveal(url, { authorization, origin: authority.origin, path: `/api/draft/reveal?path=${encodeURIComponent(fixture.root)}` }),
      postReveal(url, { authorization, origin: authority.origin, path: '/api/draft/reveal/arbitrary-path' }),
    ]);
    expect(denied.map((result) => result.status)).toEqual([403, 403, 401, 400, 400, 404]);
    for (const result of denied) {
      expect(result.body).not.toContain(fixture.root);
      expect(result.body).not.toContain(rawDraftSentinel);
      expect(result.body).not.toContain(token);
    }

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'This draft needs a newer Cumpa' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back up and start new' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /reset|downgrade|migrat/i })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(fixture.root);
    await expect(page.locator('body')).not.toContainText(rawDraftSentinel);

    const readOnlyProbes = await page.evaluate(async (accessToken) => {
      const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
      const [load, mutation, recovery] = await Promise.all([
      fetch('/api/draft', { headers }).then(async (response) => ({
        status: response.status,
        body: await response.text(),
      })),
        fetch('/api/draft/mutations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ type: 'setSummary', expectedRevision: 0, markdown: 'must not save' }),
        }).then(async (response) => ({ status: response.status, body: await response.text() })),
        fetch('/api/draft/recovery', {
          method: 'POST',
          headers,
          body: JSON.stringify({ expectedFingerprint: '0'.repeat(64) }),
        }).then(async (response) => ({ status: response.status, body: await response.text() })),
      ]);
      return [load, mutation, recovery];
    }, token);
    expect(readOnlyProbes[0]?.status).toBe(200);
    expect(readOnlyProbes[1]?.status).toBe(409);
    expect(readOnlyProbes[2]?.status).toBe(409);
    for (const probe of readOnlyProbes) {
      expect(probe.body).not.toContain(rawDraftSentinel);
      expect(probe.body).not.toContain(fixture.root);
      expect(probe.body).not.toContain(token);
    }

    const revealResponse = page.waitForResponse((candidate) => candidate.url().includes('/api/draft/reveal'));
    await page.getByRole('button', { name: 'Reveal draft file' }).click();
    const revealBody = await (await revealResponse).text();
    expect(revealBody).toBe('{"kind":"revealed"}');
    await page.getByRole('button', { name: 'Copy draft path' }).click();
    const copiedPath = await page.evaluate(async () => await navigator.clipboard.readText());
    expect(copiedPath).toMatch(/^\.cumpa\/drafts\/[a-z0-9_-]+\.json$/u);
    for (const value of [await page.locator('body').innerText(), copiedPath, revealBody]) {
      expect(value).not.toContain(fixture.root);
      expect(value).not.toContain(rawDraftSentinel);
      expect(value).not.toContain(token);
      expect(value).not.toMatch(/(?:stderr|stack|\/(?:usr\/bin\/)?open\b)/iu);
    }
    expectSameFileSnapshot(original, draftPath);
    expect(snapshotSource(fixture)).toEqual(source);
  } finally {
    if (running !== undefined) await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('newer draft fixed reveal invokes the darwin opener', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  test.skip(
    process.platform !== 'darwin',
    'the fake opener is intercepted only through PATH, which open consults for `open` on darwin alone; elsewhere it spawns bundled absolute xdg-open',
  );
  const fixture = await createGitFixture({ anchoredReview: true });
  let running: RunningCli | undefined;
  try {
    const draftPath = await createPersistedDraft(page, fixture);
    const newer = {
      ...JSON.parse(readFileSync(draftPath, 'utf8')) as Record<string, unknown>,
      schemaVersion: 2,
    };
    writeFileSync(draftPath, JSON.stringify(newer));
    const revealMarker = join(packedRoot, `reveal-${crypto.randomUUID()}.marker`);
    running = startGeneratedCli(fixture, {
      revealMarkerPath: revealMarker,
      revealSucceeds: true,
    });
    const url = await waitForLoopbackUrl(running);
    const revealResponse = page.waitForResponse((candidate) => candidate.url().includes('/api/draft/reveal'));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Reveal draft file' }).click();
    expect(await (await revealResponse).text()).toBe('{"kind":"revealed"}');
    await expect.poll(() => existsSync(revealMarker)).toBe(true);
    expect(readFileSync(revealMarker, 'utf8')).toBe('revealed\n');
  } finally {
    if (running !== undefined) await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('selector drift reports complete OIDs while the packaged comparison stays pinned', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);
  const fixture = await createGitFixture({ anchoredReview: true });
  const pinnedHead = fixture.git(['rev-parse', fixture.headRef]).toString('utf8').trim();
  const running = startGeneratedCli(fixture);

  try {
    await openGeneratedReview(page, await waitForLoopbackUrl(running));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await expect(page.getByText('head value', { exact: false })).toBeVisible();
    fixture.git(['update-ref', fixture.headRef, fixture.futureHeadOid]);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const notice = page.getByRole('heading', { name: 'Selected source changed — open review remains pinned' });
    await expect(notice).toBeVisible({ timeout: 10_000 });
    const drift = page.locator('.selector-drift-notice');
    await expect(drift).toContainText(pinnedHead);
    await expect(drift).toContainText(fixture.futureHeadOid);
    await expect(page.getByText('head value', { exact: false })).toBeVisible();
  } finally {
    await stopGeneratedCli(running);
    await fixture.cleanup();
  }
});

test('registered worktree drift reports moved and unavailable full-OID state without changing pinned review state', async ({ browser, page }, testInfo) => {
  assertChromium(browser, testInfo);

  const selectionsFor = (fixture: GitFixture, worktreePath: string) => ({
    base: {
      label: 'main',
      revision: fixture.baseRef,
      source: { kind: 'branch', id: 'fixture-base', refName: fixture.baseRef },
    },
    head: {
      label: 'Registered feature worktree',
      revision: fixture.headRef,
      source: {
        kind: 'worktree' as const,
        id: 'fixture-registered-worktree',
        path: worktreePath,
        detached: true,
        dirty: false,
      },
    },
  });

  const movedFixture = await createGitFixture({ anchoredReview: true, registeredWorktree: true });
  const movedWorktreePath = movedFixture.registeredWorktreePath;
  expect(movedWorktreePath).toBeDefined();
  const pinnedHead = movedFixture.git(['-C', movedWorktreePath!, 'rev-parse', 'HEAD']).toString('utf8').trim();
  const movedRunning = startGeneratedCli(movedFixture, {
    selections: selectionsFor(movedFixture, movedWorktreePath!),
  });

  try {
    await waitForLoopbackUrl(movedRunning);
    movedFixture.git(['-C', movedWorktreePath!, 'checkout', '--detach', movedFixture.futureHeadOid]);
    await openGeneratedReview(page, await waitForLoopbackUrl(movedRunning));
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateTopMonacoLine(page, 'head');
    const buffer = page.locator('.monaco-anchor-zone--composer textarea');
    await buffer.fill('Pinned local Monaco buffer.');
    const drift = page.locator('.selector-drift-notice');
    await expect(drift).toContainText(pinnedHead, { timeout: 10_000 });
    await expect(drift).toContainText(movedFixture.futureHeadOid);
    await expect(drift).toContainText('Worktree');
    await expect(page.locator('.monaco-diff-editor')).toBeVisible();
    await expect(buffer).toHaveValue('Pinned local Monaco buffer.');
  } finally {
    await stopGeneratedCli(movedRunning);
    await movedFixture.cleanup();
  }

  const unavailableFixture = await createGitFixture({ anchoredReview: true, registeredWorktree: true });
  const unavailableWorktreePath = unavailableFixture.registeredWorktreePath;
  expect(unavailableWorktreePath).toBeDefined();
  const unavailablePinnedHead = unavailableFixture
    .git(['-C', unavailableWorktreePath!, 'rev-parse', 'HEAD'])
    .toString('utf8')
    .trim();
  const unavailableRunning = startGeneratedCli(unavailableFixture, {
    selections: selectionsFor(unavailableFixture, unavailableWorktreePath!),
  });

  try {
    const unavailableUrl = await waitForLoopbackUrl(unavailableRunning);
    rmSync(unavailableWorktreePath!, { recursive: true, force: true });
    await openGeneratedReview(page, unavailableUrl);
    await page.getByRole('treeitem', { name: /changed\.ts/ }).click();
    await activateTopMonacoLine(page, 'head');
    const buffer = page.locator('.monaco-anchor-zone--composer textarea');
    await buffer.fill('Unavailable worktree buffer.');
    const drift = page.locator('.selector-drift-notice');
    await expect(drift).toContainText('Head source unavailable', { timeout: 10_000 });
    await expect(drift).toContainText(unavailablePinnedHead);
    await expect(drift).not.toContainText(unavailableFixture.futureHeadOid);
    await expect(page.locator('.monaco-diff-editor')).toBeVisible();
    await expect(buffer).toHaveValue('Unavailable worktree buffer.');
  } finally {
    await stopGeneratedCli(unavailableRunning);
    await unavailableFixture.cleanup();
  }
});
