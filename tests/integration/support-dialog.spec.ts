import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

import { DraftLoadResponseSchema, SessionResponseSchema } from '../../src/contracts/api.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const token = 't'.repeat(43);
let server: ViteDevServer | undefined;
let origin = '';
let support = 'unverified';
let startAvailable = true;
let refreshes = 0;
let startResponseGate: Promise<void> | undefined;
let supportEnabled = true;

function json(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

async function startServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [{
      name: 'support-dialog-api',
      configureServer(vite) {
        vite.middlewares.use('/api/session', (_request, response) => json(response, SessionResponseSchema.parse({
          base: { label: 'base', oid: 'a'.repeat(40) },
          head: { label: 'head', oid: 'b'.repeat(40) },
          mergeBaseOid: 'c'.repeat(40),
          files: [],
          ...(supportEnabled ? { support: { enabled: true } } : {}),
        })));
        vite.middlewares.use('/api/draft', (_request, response) => json(response, DraftLoadResponseSchema.parse({ kind: 'missing', path: `${RENAME_MAP.repoStateDir}drafts/review.json` })));
        vite.middlewares.use('/api/selector-drift', (_request, response) => json(response, { base: { kind: 'unchanged', role: 'base' }, head: { kind: 'unchanged', role: 'head' } }));
        vite.middlewares.use('/api/support/status', (_request, response) => json(response, { status: support }));
        vite.middlewares.use('/api/support/refresh', (_request, response) => { refreshes += 1; json(response, { status: support }); });
        vite.middlewares.use('/api/support/start', async (_request, response) => {
          await startResponseGate;
          if (!startAvailable) {
            json(response, { kind: 'unavailable' });
            return;
          }
          json(response, { kind: 'ready', flowUrl: 'https://flow.example.test/' });
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
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Support ${RENAME_MAP.displayName}` })).toBeVisible();
}

async function startHostedAction(page: Page, name: 'Support Loopnote — $49.99' | 'Restore support'): Promise<void> {
  await page.context().route('https://flow.example.test/**', (route) => route.fulfill({ body: '' }));
  const gate = Promise.withResolvers<void>();
  startResponseGate = gate.promise;
  const started = page.waitForRequest((request) => request.url().endsWith('/api/support/start'));
  const popup = page.waitForEvent('popup');
  let popupOpened = false;
  void popup.then(() => { popupOpened = true; });
  await page.getByRole('button', { name }).click();
  expect(JSON.parse((await started).postData() ?? '')).toEqual({
    action: name === 'Restore support' ? 'restore' : 'support',
  });
  try {
    await expect.poll(() => popupOpened, { timeout: 500 }).toBe(true);
  } finally {
    gate.resolve();
    startResponseGate = undefined;
  }
  await expect(await popup).toHaveURL('https://flow.example.test/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Waiting for confirmation… You can close this and keep reviewing.')).toBeVisible();
}

test.beforeAll(async () => { origin = await startServer(); });
test.afterAll(async () => { await server?.close(); });
test.beforeEach(() => {
  support = 'unverified';
  startAvailable = true;
  refreshes = 0;
  startResponseGate = undefined;
  supportEnabled = true;
});

test('keeps anonymous review support-free when the session omits the capability', async ({ page }) => {
  supportEnabled = false;

  await page.goto(`${origin}#token=${token}`);

  await expect(page.getByText('No changes in this comparison.')).toBeVisible();
  await expect(page.getByRole('button', { name: `Support ${RENAME_MAP.displayName}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => refreshes).toBe(0);
});

test('offers optional support without gating the review, preserving dialog accessibility and dismissal', async ({ page }) => {
  await openReview(page);
  await expect(page.locator('.workbench-shell')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: `Support ${RENAME_MAP.displayName} — $49.99` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore support' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
  await expect(page.getByText('No changes in this comparison.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /recovery email/i })).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Not now' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close support dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: `Support ${RENAME_MAP.displayName}`, exact: true })).toBeFocused();
  await page.getByRole('button', { name: `Support ${RENAME_MAP.displayName}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('No changes in this comparison.')).toBeVisible();
});

test('hands Support and Restore to hosted tabs, allows cancellation, and keeps unavailable actions local', async ({ page }) => {
  await openReview(page);
  await startHostedAction(page, 'Support Loopnote — $49.99');
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('No changes in this comparison.')).toBeVisible();
  const restorePage = await page.context().newPage();
  await openReview(restorePage);
  await startHostedAction(restorePage, 'Restore support');
  await restorePage.getByRole('button', { name: 'Keep reviewing' }).click();
  const unavailablePage = await page.context().newPage();
  startAvailable = false;
  await openReview(unavailablePage);
  await unavailablePage.getByRole('button', { name: 'Restore support' }).click();
  await expect(unavailablePage.getByRole('button', { name: 'Restore support' })).toBeVisible();
});

test('only polling promotion thanks, closes, and suppresses future launches', async ({ page }) => {
  await openReview(page);
  await startHostedAction(page, 'Support Loopnote — $49.99');
  await expect(page.getByText('Waiting for confirmation… You can close this and keep reviewing.')).toBeVisible();
  support = 'verified';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('dialog').getByText(`Thank you for supporting ${RENAME_MAP.displayName}.`)).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3_000 });
  expect(refreshes).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('ends an unconfirmed hosted restore wait with a retryable invitation', async ({ page }) => {
  await page.clock.install();
  await openReview(page);
  await startHostedAction(page, 'Restore support');
  await expect(page.getByText('Waiting for confirmation… You can close this and keep reviewing.')).toBeVisible();

  for (let i = 0; i < 12; i += 1) await page.clock.runFor('01:00');

  await expect(page.getByText('Waiting for confirmation… You can close this and keep reviewing.')).toBeHidden();
  await expect(page.getByRole('dialog').getByText("Support wasn't confirmed. You can try again.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore support' })).toBeEnabled();
});
