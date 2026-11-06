import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import {
  DraftLoadResponseSchema,
  PatchStatusResponseSchema,
  SelectorDriftResponseSchema,
  SessionResponseSchema,
  type DraftLoadResponse,
  type PatchStatusResponse,
  type SelectorDriftResponse,
  type SessionResponse,
} from '../../src/contracts/api.js';
import { createSelectorDriftState } from '../../src/web/model/selector-drift-state.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const token = 't'.repeat(43);
const baseOid = 'a'.repeat(40);
const headOid = 'b'.repeat(40);
const movedBaseOid = 'd'.repeat(40);
const patchFileId = `file_${'p'.repeat(43)}`;
const patchPath = {
  bytesBase64url: Buffer.from('src/exact.ts').toString('base64url'),
  display: 'src/exact.ts',
  utf8: 'src/exact.ts',
};
const frozenPreimage = 'export const source = "frozen preimage";';
const frozenPostimage = 'export const source = "frozen postimage";';

let server: ViteDevServer | undefined;
let origin = '';
let session: SessionResponse;
let driftResponse: SelectorDriftResponse;
let patchStatusResponse: PatchStatusResponse;
let draftResponse: DraftLoadResponse;
const driftRequests: { body: string; method: string; url: string }[] = [];
const patchStatusRequests: { body: string; method: string; url: string }[] = [];
let patchContentFailures = 0;
const patchContentRequests: string[] = [];

function pinnedSession(): SessionResponse {
  return SessionResponseSchema.parse({
    base: { label: 'base', oid: baseOid },
    head: { label: 'head', oid: headOid },
    mergeBaseOid: 'c'.repeat(40),
    files: [],
  });
}

function exactPatchSession(withTextFile = false): SessionResponse {
  return SessionResponseSchema.parse({
    patch: {
      kind: 'exact-patch',
      digest: 'd'.repeat(64),
      reviewKey: 'e'.repeat(64),
      validationTarget: { kind: 'repository' },
      changedFileCount: withTextFile ? 1 : 0,
    },
    files: withTextFile
      ? [{
          fileId: patchFileId,
          status: { kind: 'modified' },
          oldMode: '100644',
          newPath: patchPath,
          additions: 1,
          deletions: 1,
          availability: { kind: 'text' },
        }]
      : [],
  });
}

function unchanged(): SelectorDriftResponse {
  return SelectorDriftResponseSchema.parse({
    base: { kind: 'unchanged', role: 'base' },
    head: { kind: 'unchanged', role: 'head' },
  });
}

function movedBase(): SelectorDriftResponse {
  return SelectorDriftResponseSchema.parse({
    base: {
      kind: 'moved',
      role: 'base',
      label: 'base',
      selectorType: 'branch',
      oldOid: baseOid,
      newOid: movedBaseOid,
    },
    head: { kind: 'unchanged', role: 'head' },
  });
}

function unavailableHead(): SelectorDriftResponse {
  return SelectorDriftResponseSchema.parse({
    base: { kind: 'unchanged', role: 'base' },
    head: {
      kind: 'unavailable',
      role: 'head',
      label: 'head worktree',
      selectorType: 'worktree',
      oldOid: headOid,
      reason: 'source-unavailable',
    },
  });
}
function exactPatchContent() {
  return {
    fileId: patchFileId,
    base: {
      exists: true,
      path: patchPath,
      language: 'typescript',
      blobOid: 'a'.repeat(40),
      text: frozenPreimage,
    },
    head: {
      exists: true,
      path: patchPath,
      language: 'typescript',
      blobOid: 'b'.repeat(40),
      text: frozenPostimage,
    },
  };
}
function resumedDraft(): DraftLoadResponse {
  return DraftLoadResponseSchema.parse({
    kind: 'current',
    path: `${RENAME_MAP.repoStateDir}drafts/active-review.json`,
    draft: {
      schemaVersion: 1,
      comparison: {
        baseCommitOid: baseOid,
        headCommitOid: headOid,
        mergeBaseOid: 'c'.repeat(40),
      },
      revision: 1,
      summary: '',
      comments: [{
        id: 'comment_123e4567-e89b-12d3-a456-426614174000',
        state: 'open',
        body: 'Review the frozen source.',
        anchor: {
          version: 'durable-anchor-v1',
          path: patchPath,
          safeDisplayPath: patchPath.display,
          side: 'base',
          line: 1,
          blobOid: 'a'.repeat(40),
          selectedText: frozenPreimage,
          context: {
            before: [],
            target: { line: 1, text: frozenPreimage },
            after: [],
          },
          contextHash: { algorithm: 'sha256-v1', value: 'f'.repeat(64) },
          uniqueKey: 'c'.repeat(64),
        },
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
        verification: { state: 'verified', reason: 'exact-match' },
      }],
    },
  });
}

function json(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  const { promise, resolve: resolveBody } = Promise.withResolvers<string>();
  let body = '';
  request.on('data', (chunk) => { body += String(chunk); });
  request.on('end', () => resolveBody(body));
  return promise;
}
function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  return promise;
}


async function startAppServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [{
      name: 'selector-drift-ui-api',
      configureServer(viteServer) {
        viteServer.middlewares.use('/api/session', (_request, response) => json(response, session));
        viteServer.middlewares.use('/api/draft', (_request, response) => json(response, draftResponse));
      viteServer.middlewares.use('/api/selector-drift', async (request, response) => {
        driftRequests.push({ body: await readBody(request), method: request.method ?? '', url: request.url ?? '' });
        json(response, driftResponse);
      });
      viteServer.middlewares.use('/api/patch-status', async (request, response) => {
        patchStatusRequests.push({ body: await readBody(request), method: request.method ?? '', url: request.url ?? '' });
        json(response, patchStatusResponse);
      });
      viteServer.middlewares.use('/api/files', (request, response) => {
        patchContentRequests.push(request.url ?? '');
        if (patchContentFailures > 0) {
          patchContentFailures -= 1;
          json(response, { error: 'frozen-snapshot-read-failed' }, 500);
          return;
        }
        json(response, exactPatchContent());
      });
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  return server.resolvedUrls?.local[0] ?? '';
}

async function openReview(page: Page): Promise<void> {
  await page.goto(`${origin}#token=${token}`);
  await expect(page.locator('.workbench-shell__editor')).toBeVisible();
}

test.beforeAll(async () => {
  origin = await startAppServer();
});

test.afterAll(async () => {
  await server?.close();
});

test.beforeEach(() => {
  session = pinnedSession();
  draftResponse = DraftLoadResponseSchema.parse({
    kind: 'missing',
    path: `${RENAME_MAP.repoStateDir}drafts/active-review.json`,
  });
  driftResponse = unchanged();
  patchStatusResponse = PatchStatusResponseSchema.parse({
    kind: 'unchanged',
    validationTargetLabel: 'Repository content',
  });
  driftRequests.length = 0;
  patchStatusRequests.length = 0;
  patchContentFailures = 0;
  patchContentRequests.length = 0;
});

test('visible-only polling coalesces overlap and announces each selector transition once', async () => {
  const listeners = new Map<string, () => void>();
  let visibilityState: DocumentVisibilityState = 'visible';
  let interval: (() => void) | undefined;
  let intervalCleared = false;
  const first = Promise.withResolvers<SelectorDriftResponse>();
  let requestCount = 0;
  const announcements: string[] = [];
  const drift = createSelectorDriftState(
    {
      getSelectorDrift: async () => {
        requestCount += 1;
        return requestCount === 1 ? first.promise : movedBase();
      },
    },
    (message) => announcements.push(message),
    {
      document: {
        get visibilityState() { return visibilityState; },
        addEventListener(type, listener) { listeners.set(type, listener as () => void); },
        removeEventListener(type) { listeners.delete(type); },
      },
      setInterval(callback) {
        interval = callback as () => void;
        return 1;
      },
      clearInterval() { intervalCleared = true; },
    },
  );

  drift.start();
  drift.refresh();
  drift.refresh();
  expect(requestCount).toBe(1);

  first.resolve(movedBase());
  await first.promise;
  await flush();
  expect(requestCount).toBe(2);
  expect(announcements).toEqual(['Selected source changed. The open review remains pinned.']);

  interval?.();
  await flush();
  expect(announcements).toHaveLength(1);

  visibilityState = 'hidden';
  listeners.get('visibilitychange')?.();
  interval?.();
  await flush();
  expect(requestCount).toBe(3);

  visibilityState = 'visible';
  listeners.get('visibilitychange')?.();
  await flush();
  expect(requestCount).toBe(4);

  drift.stop();
  expect(intervalCleared).toBe(true);
});

test('selector drift uses the fixed endpoint and leaves the pinned review and focused draft buffer intact', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const browserRequests: { body: string | null; method: string; url: string }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/selector-drift')) {
      browserRequests.push({ body: request.postData(), method: request.method(), url: request.url() });
    }
  });
  await openReview(page);
  expect(driftRequests).toHaveLength(1);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(50);
  expect(driftRequests).toHaveLength(1);

  driftResponse = movedBase();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.locator('.identity-pill').click();
  const notice = page.getByRole('complementary', { name: 'Selected source changed — open review remains pinned' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Base source moved');
  await expect(notice).toContainText(baseOid);
  await expect(notice).toContainText(movedBaseOid);

  await expect(page.locator('.identity-popover')).toContainText('Selected source changed — open review remains pinned');

  const reviewNotes = page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true });
  await expect(reviewNotes).toBeVisible();
  await reviewNotes.click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();

  const summaryTab = page.getByRole('tab', { name: 'Summary', exact: true });
  await summaryTab.click();
  await expect(summaryTab).toHaveAttribute('aria-selected', 'true');
  const editSummary = page.getByRole('tab', { name: 'Edit', exact: true });
  await editSummary.click();
  await expect(editSummary).toHaveAttribute('aria-selected', 'true');

  const summary = page.getByLabel('Review summary (Markdown)');
  await summary.fill('Unsaved review buffer');
  await summary.focus();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => driftRequests.length).toBe(3);
  await expect(summary).toHaveValue('Unsaved review buffer');
  await expect(summary).toBeFocused();
  await expect(page.getByRole('banner')).toContainText(new RegExp(`BASE\\s*base${baseOid.slice(0, 7)}`));
  await page.getByRole('region', { name: 'Review', exact: true }).getByRole('button', { name: 'Close panel' }).click();
  // Toggling the review panel is a mousedown outside `.identity-pill-host`, which
  // `IdentityPopover.vue`'s outside-click listener treats as a close — reopen it
  // before interacting with the drift notice's Copy button again.
  await page.locator('.identity-pill').click();

  await page.getByRole('button', { name: `Copy pinned Base commit ${baseOid}` }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(baseOid);

  driftResponse = unavailableHead();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(notice).toContainText('Head source unavailable');
  await expect(notice).toContainText(headOid);
  await expect(notice).toContainText('This source is no longer available.');
  await page.getByRole('button', { name: 'Launch new comparison' }).click();
  await expect(notice).toContainText(`Return to the terminal and launch ${RENAME_MAP.displayName} again, then choose the current sources. This open review will remain pinned.`);

  for (const request of browserRequests) {
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`${origin}api/selector-drift`);
    expect(request.body).toBeNull();
  }
  for (const request of driftRequests) {
    expect(request.body).toBe('');
  }
});

test('exact patch drift is announced while the review panel is open', async ({ page }) => {
  const pinnedPropWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && /prop "pinned(?:Base|Head)"/u.test(message.text())) {
      pinnedPropWarnings.push(message.text());
    }
  });
  session = exactPatchSession();
  await openReview(page);

  await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
  expect(patchStatusRequests).toHaveLength(1);
  expect(driftRequests).toHaveLength(0);

  patchStatusResponse = PatchStatusResponseSchema.parse({
    kind: 'drifted',
    validationTargetLabel: 'Repository content',
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.locator('[aria-live="polite"]')).toHaveText('Implemented content changed.');
  await expect(page.locator('.workbench-shell [role="alert"]')).toHaveCount(0);
  expect(pinnedPropWarnings).toEqual([]);
});

test('exact patch resumed drafts announce frozen provenance without pinned wording', async ({ page }) => {
  const vueWarnings: string[] = [];
  page.on('console', (message) => {
    if (/\[Vue warn\]|Unhandled/u.test(message.text())) {
      vueWarnings.push(message.text());
    }
  });
  session = exactPatchSession(true);
  draftResponse = resumedDraft();

  await openReview(page);
  await expect(page.locator('p.visually-hidden[aria-live="polite"]')).toContainText(
    'Local draft resumed. Accepted comments for this frozen exact patch are ready.',
  );
  await expect(page.locator('body')).not.toContainText(/\bpinned\b/iu);
  expect(vueWarnings).toEqual([]);
});

test('exact patch retry stays snapshot-only and terminal loss focuses one source-correct heading', async ({ page }) => {
  const vueWarnings: string[] = [];
  page.on('console', (message) => {
    if (/\[Vue warn\]|Unhandled/u.test(message.text())) {
      vueWarnings.push(message.text());
    }
  });
  session = exactPatchSession(true);
  patchContentFailures = 1;

  await openReview(page);
  await expect(page.getByRole('heading', { name: 'Frozen patch file unavailable' })).toBeVisible();
  await expect(page.getByText(
    `${RENAME_MAP.displayName} could not read this file from the frozen patch snapshot. Try the same snapshot again; current repository or worktree bytes will not be substituted.`,
    { exact: true },
  )).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bpinned\b/iu);

  const retry = page.getByRole('button', { name: 'Try frozen snapshot again' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(page.getByText('PREIMAGE', { exact: true })).toBeVisible();
  await expect(page.getByLabel('src/exact.ts: preimage and postimage side-by-side diff').getByText('POSTIMAGE', { exact: true })).toBeVisible();
  await expect(page.getByText('− REMOVED', { exact: true })).toBeVisible();
  await expect(page.getByText('+ ADDED', { exact: true })).toBeVisible();
  await expect(page.getByLabel('src/exact.ts: preimage and postimage side-by-side diff')).toBeVisible();
  await expect(page.locator('.monaco-diff-editor').getByRole('textbox').first()).toHaveAccessibleName(
    'Immutable preimage and postimage side-by-side diff',
  );
  expect(patchContentRequests).toEqual([
    `/${patchFileId}/content`,
    `/${patchFileId}/content`,
  ]);

  await page.evaluate(() => {
    document.body.dataset.snapshotHeadingFocusCount = '0';
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLElement && event.target.id === 'unavailable-heading') {
        document.body.dataset.snapshotHeadingFocusCount = String(
          Number(document.body.dataset.snapshotHeadingFocusCount) + 1,
        );
      }
    });
  });
  await expect.poll(() => patchStatusRequests.length).toBeGreaterThanOrEqual(1);
  patchStatusResponse = PatchStatusResponseSchema.parse({ kind: 'snapshotUnavailable' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const blockingHeading = page.getByRole('heading', { name: 'Frozen patch unavailable' });
  await expect(blockingHeading).toHaveCount(1);
  await expect(blockingHeading).toBeFocused();
  await expect(page.getByText(
    `The accepted patch snapshot is missing, corrupt, incomplete, or unreadable. Relaunch ${RENAME_MAP.displayName} with an exact patch that matches the current implementation.`,
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinned session unavailable' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try frozen snapshot again' })).toHaveCount(0);
  await expect(page.locator('.workbench-shell__body')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/\bpinned\b/iu);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(
    () => Number(document.body.dataset.snapshotHeadingFocusCount),
  )).toBe(1);
  expect(patchContentRequests).toHaveLength(2);
  expect(vueWarnings).toEqual([]);
});

