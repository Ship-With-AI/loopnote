import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { resolveToken, toCssRgb } from '../../src/web/theme/token-contract.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const canonicalTokens = canonicalRoot(repositoryRoot);
const toRootRgb = (token: string): string => toCssRgb(canonicalTokens, token);
const token = 't'.repeat(43);
const baseOid = 'a'.repeat(40);
const headOid = 'b'.repeat(40);
const exportDirectory = `${RENAME_MAP.repoStateDir}exports/${baseOid}..${headOid}`;

let server: ViteDevServer | undefined;
let origin = '';
let exportAttempt = 0;
const revealBodies: string[] = [];
type IgnoreStatusKind = 'ignored' | 'notIgnored' | 'unavailable';

let ignoreStatus: IgnoreStatusKind = 'ignored';
let heldIgnoreStatus: PromiseWithResolvers<void> | null = null;
const appendBodies: string[] = [];
let appendResult: { readonly kind: string } = { kind: 'appended' };
let failedExportResult: 'publicationFailed' | 'recoveryRequired' = 'publicationFailed';
let receiptHasAcknowledgedDrift = true;
type PendingExport = PromiseWithResolvers<unknown>;

const exportBodies: string[] = [];
const exportResults: unknown[] = [];
let pendingExport: PendingExport | null = null;
let heldExport: PendingExport | null = null;

const session = {
  base: { label: 'base', oid: baseOid },
  head: { label: 'head', oid: headOid },
  mergeBaseOid: 'c'.repeat(40),
  files: [],
};

function json(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  return body;
}

function holdNextExport(): void {
  heldExport = Promise.withResolvers<unknown>();
  pendingExport = heldExport;
}

function completeHeldExport(result: unknown): void {
  heldExport?.resolve(result);
  heldExport = null;
}

function holdNextIgnoreStatus(): void {
  heldIgnoreStatus = Promise.withResolvers<void>();
}

function completeHeldIgnoreStatus(): void {
  heldIgnoreStatus?.resolve();
  heldIgnoreStatus = null;
}

const driftObservation = {
  base: {
    kind: 'moved',
    role: 'base',
    label: 'base',
    selectorType: 'branch',
    oldOid: baseOid,
    newOid: 'd'.repeat(40),
  },
  head: {
    kind: 'unavailable',
    role: 'head',
    label: 'head',
    selectorType: 'branch',
    oldOid: headOid,
    reason: 'source-unavailable',
  },
};

async function startAppServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [{
      name: 'export-receipt-api',
      configureServer(viteServer) {
        viteServer.middlewares.use('/api/session', (_request, response) => json(response, session));
        viteServer.middlewares.use('/api/draft', (_request, response) => json(response, {
          kind: 'current',
          path: `${RENAME_MAP.repoStateDir}drafts/export-receipt.json`,
          draft: {
            schemaVersion: 1,
            comparison: { baseCommitOid: baseOid, headCommitOid: headOid, mergeBaseOid: 'c'.repeat(40) },
            revision: 3,
            summary: '',
            comments: [],
          },
        }));
        viteServer.middlewares.use('/api/export/gitignore', async (request, response) => {
          if (request.method === 'POST') {
            appendBodies.push(await readBody(request));
            if (appendResult.kind === 'appended') {
              ignoreStatus = 'ignored';
            }
            json(response, appendResult);
            return;
          }
          if (heldIgnoreStatus !== null) await heldIgnoreStatus.promise;
          json(response, { kind: ignoreStatus });
        });
        viteServer.middlewares.use('/api/export/reveal', async (request, response) => {
          revealBodies.push(await readBody(request));
          json(response, { kind: 'revealFailed' }, 500);
        });
        viteServer.middlewares.use('/api/export', async (request, response) => {
          exportBodies.push(await readBody(request));
          if (pendingExport !== null) {
            const { promise } = pendingExport;
            pendingExport = null;
            json(response, await promise);
            return;
          }
          const queuedResult = exportResults.shift();
          if (queuedResult !== undefined) {
            json(response, queuedResult);
            return;
          }
          exportAttempt += 1;
          if (exportAttempt === 1) {
            json(response, {
              kind: 'exported',
              draftRevision: 3,
              exportedAt: '2026-07-23T12:34:56.000Z',
              drift: receiptHasAcknowledgedDrift ? {
                kind: 'acknowledged',
                identities: [
                  {
                    role: 'base',
                    pinned: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
                    current: { kind: 'available', label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
                  },
                  {
                    role: 'head',
                    pinned: { label: 'head', selectorType: 'branch', oid: '2'.repeat(40) },
                    current: { kind: 'available', label: 'head', selectorType: 'branch', oid: '3'.repeat(40) },
                  },
                ],
              } : { kind: 'noneObserved' },
              comparison: {
                base: { label: 'base', selectorType: 'branch', oid: '1'.repeat(40) },
                head: { label: 'head', selectorType: 'branch', oid: '2'.repeat(40) },
              },
              files: [
                { path: `${exportDirectory}/review.json`, algorithm: 'sha256', sha256: '1'.repeat(64), bytes: 128 },
                { path: `${exportDirectory}/review.md`, algorithm: 'sha256', sha256: '2'.repeat(64), bytes: 256 },
              ],
            });
            return;
          }
          json(response, { kind: failedExportResult }, 500);
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
  await page.getByRole('button', { name: 'Review notes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review notes' }).getByRole('button', { name: 'Export review' })).toBeVisible();
}

test.beforeAll(async () => {
  origin = await startAppServer();
});

test.afterAll(async () => {
  await server?.close();
});

test.beforeEach(async ({ context }) => {
  exportAttempt = 0;
  exportBodies.length = 0;
  exportResults.length = 0;
  pendingExport = null;
  heldExport = null;
  heldIgnoreStatus = null;
  revealBodies.length = 0;
  appendBodies.length = 0;
  ignoreStatus = 'ignored';
  appendResult = { kind: 'appended' };
  receiptHasAcknowledgedDrift = true;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
});

test('renders only the confirmed receipt, copies it, and retains it after reveal and re-export failures', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Export review' }).click();

  const receipt = page.getByRole('region', { name: 'Review export complete' });
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText(/Accepted revision\s*3/);
  await expect(receipt).toContainText('2026-07-23T12:34:56.000Z');
  await expect(receipt).toContainText(`${exportDirectory}/review.json`);
  await expect(receipt).toContainText(`${exportDirectory}/review.md`);
  await expect(receipt).toContainText('Both files were published together from accepted revision 3.');

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await receipt.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await expect(receipt).toContainText('sha256:1111111111111111111111111111111111111111111111111111111111111111');
  await expect(receipt).toContainText('128');

  await receipt.getByRole('button', { name: 'Copy all receipt details' }).click();
  await expect(receipt.getByText('Copied export receipt details.')).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain(`${exportDirectory}/review.json`);

  await receipt.getByRole('button', { name: 'Reveal export directory' }).click();
  const revealAlert = receipt.getByRole('alert');
  await expect(revealAlert).toContainText('Could not reveal the export directory. Copy the relative path and open it from the repository root.');
  await expect(revealAlert).toBeFocused();
  expect(revealBodies).toEqual(['']);

  const comparisonDisclosure = receipt.getByRole('button', { name: 'Comparison' });
  await comparisonDisclosure.click();
  await expect(receipt).toContainText(`Pinned Base: ${'1'.repeat(40)}`);
  await expect(receipt).toContainText(`Pinned Head: ${'2'.repeat(40)}`);

  const driftDisclosure = receipt.getByRole('button', { name: 'View acknowledged identities' });
  await driftDisclosure.click();
  await expect(receipt).toContainText('Pinned label: base');
  await expect(receipt).toContainText('Pinned type: branch');
  await expect(receipt).toContainText('Current label: head');
  await expect(receipt).toContainText('Current type: branch');
  await expect(receipt).toContainText(`Current Head: ${'3'.repeat(40)}`);

  const jsonRow = receipt.getByRole('article', { name: 'review.json' });
  await expect(jsonRow).toHaveAccessibleDescription(`review.json. Path ${exportDirectory}/review.json. SHA-256 ${'1'.repeat(64)}. 128 bytes.`);
  await jsonRow.getByRole('button', { name: 'Copy path' }).click();
  await expect(jsonRow.getByText('Copied relative path for review.json.')).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('blocked')) });
  });
  await jsonRow.getByRole('button', { name: 'Copy path' }).click();
  await expect(jsonRow.getByText('Could not copy. Select the value and copy it manually.')).toBeVisible();

  for (const width of [768, 360]) {
    await page.setViewportSize({ width, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(receipt).toBeVisible();
    await expect(receipt.locator('h4')).toHaveCSS('font-size', resolveToken(canonicalTokens, '--font-size-page-heading'));
    await expect(receipt.locator('h4')).toHaveCSS('font-weight', '600');
    await expect(receipt.locator('h4')).toHaveCSS('line-height', resolveToken(canonicalTokens, '--line-height-page-heading'));
    await expect(receipt).toHaveCSS('background-color', toRootRgb('--surface-panel'));
    await expect(receipt).toHaveCSS('border-color', toRootRgb('--border-default'));
    await expect(receipt).toHaveCSS('border-radius', resolveToken(canonicalTokens, '--radius-control'));
    await expect(receipt).toHaveCSS('box-shadow', 'none');
    await expect(jsonRow).toHaveCSS('background-color', toRootRgb('--surface-canvas'));
    await expect(jsonRow).toHaveCSS('border-color', toRootRgb('--border-default'));
    await expect(jsonRow).toHaveCSS('border-radius', resolveToken(canonicalTokens, '--radius-control'));
    await expect(jsonRow).toHaveCSS('box-shadow', 'none');
  }

  await page.getByRole('button', { name: 'Export review again' }).click();
  await expect(page.getByRole('heading', { name: 'Export was not published' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Previous confirmed export' })).toContainText(`${exportDirectory}/review.md`);
});

test('keeps a no-drift receipt comparison inspectable', async ({ page }) => {
  receiptHasAcknowledgedDrift = false;
  await openReview(page);
  await page.getByRole('button', { name: 'Export review' }).click();

  const receipt = page.getByRole('region', { name: 'Review export complete' });
  await expect(receipt).toContainText('None observed');
  await receipt.getByRole('button', { name: 'Comparison' }).click();
  await expect(receipt).toContainText(`Pinned Base: ${'1'.repeat(40)}`);
  await expect(receipt).toContainText(`Pinned Head: ${'2'.repeat(40)}`);
});

test('keeps the required recovery surface open and labels the retained receipt as previous', async ({ page }) => {
  failedExportResult = 'recoveryRequired';
  await openReview(page);
  await page.getByRole('button', { name: 'Export review' }).click();
  await page.getByRole('button', { name: 'Export review again' }).click();

  const failure = page.getByRole('alert');
  await expect(failure).toContainText('Export needs recovery');
  await expect(failure).toContainText('Cumpa could not confirm a complete new export pair. No success receipt is available. Check terminal details, then try again after recovery.');
  await expect(failure.getByRole('region', { name: 'Previous confirmed export' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Export needs recovery' })).toBeVisible();
  await expect(failure.getByRole('button', { name: 'Try export again' })).toBeVisible();

});

test('requires a keyboard-safe second confirmation before appending the fixed ignore rule', async ({ page }) => {
  ignoreStatus = 'notIgnored';
  await openReview(page);

  const warning = page.getByRole('heading', { name: 'Export directory is not ignored' }).locator('..');
  const addRule = warning.getByRole('button', { name: 'Add to .gitignore' });
  await addRule.click();
  expect(appendBodies).toEqual([]);
  await expect(warning.getByRole('button', { name: 'Keep .gitignore unchanged' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(addRule).toBeFocused();
  expect(appendBodies).toEqual([]);

  await addRule.click();
  await warning.getByRole('button', { name: 'Append ignore rule' }).click();
  await expect(page.getByText('Export directory ignored')).toBeVisible();
  expect(appendBodies).toEqual(['']);
  expect(exportBodies).toEqual([]);
});

test('reports bounded append-failure outcomes without falsely claiming .gitignore was unchanged', async ({ page }) => {
  ignoreStatus = 'notIgnored';
  await openReview(page);

  const warning = page.getByRole('heading', { name: 'Export directory is not ignored' }).locator('..');
  const append = warning.getByRole('button', { name: 'Add to .gitignore' });

  appendResult = { kind: 'appendUnconfirmed' };
  await append.click();
  await warning.getByRole('button', { name: 'Append ignore rule' }).click();
  await expect(page.getByText('.gitignore contains the ignore rule, but its durability could not be confirmed.')).toBeVisible();

  appendResult = { kind: 'ambiguous' };
  await warning.getByRole('button', { name: 'Try append again' }).click();
  await expect(page.getByText('.gitignore may have changed. Inspect it before retrying.')).toBeVisible();

  appendResult = { kind: 'unchanged' };
  await warning.getByRole('button', { name: 'Try append again' }).click();
  await expect(page.getByText('.gitignore was not changed. You can retry the append.')).toBeVisible();
});

test('Phase 07 explicit export and status states', async ({ page }) => {
  exportResults.push(
    { kind: 'driftAcknowledgementRequired', acknowledgementToken: 'd'.repeat(43), observation: driftObservation },
    { kind: 'driftAcknowledgementStale', acknowledgementToken: 's'.repeat(43), observation: driftObservation },
    { kind: 'revisionConflict', expectedRevision: 3, actualRevision: 4 },
  );
  holdNextIgnoreStatus();
  await openReview(page);

  const ignoreReadiness = page.getByText('Ignore status', { exact: true }).locator('..');
  await expect(ignoreReadiness.getByText('Checking ignore status', { exact: true })).toBeVisible();
  await expect(ignoreReadiness.locator('.review-state-badge--pending')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Checking export directory ignore status' })).toBeVisible();
  expect(exportBodies).toEqual([]);

  ignoreStatus = 'unavailable';
  completeHeldIgnoreStatus();
  await expect(ignoreReadiness.getByText('Ignore status unavailable', { exact: true })).toBeVisible();
  await expect(ignoreReadiness.locator('.review-state-badge--disabled')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Ignore status unavailable' })).toBeVisible();

  const exportSection = page.getByRole('heading', { name: 'Export' }).locator('..').locator('..');
  await exportSection.getByRole('button', { name: 'Collapse export' }).click();
  await exportSection.getByRole('button', { name: 'Expand export' }).click();
  expect(exportBodies).toEqual([]);

  await page.getByRole('button', { name: 'Export review' }).click();
  const drift = page.getByRole('heading', { name: 'Confirm export of pinned review' }).locator('..');
  await expect(drift).toContainText(`Pinned at ${baseOid}`);
  await expect(drift).toContainText(`Now at ${'d'.repeat(40)}`);
  await expect(drift).toContainText('Now unavailable');
  const consent = drift.getByRole('checkbox');
  const exportPinned = drift.getByRole('button', { name: 'Export pinned review' });
  await expect(consent).not.toBeChecked();
  await expect(exportPinned).toBeDisabled();
  expect(JSON.parse(exportBodies[0] ?? '')).toEqual({ expectedRevision: 3 });

  await consent.check();
  expect(exportBodies).toHaveLength(1);
  await exportPinned.click();
  const stale = page.getByRole('heading', { name: 'Selected sources changed again' }).locator('..');
  await expect(stale.getByRole('checkbox')).not.toBeChecked();
  await expect(stale.getByRole('button', { name: 'Export pinned review' })).toBeDisabled();
  expect(JSON.parse(exportBodies[1] ?? '')).toEqual({ expectedRevision: 3, driftAcknowledgementToken: 'd'.repeat(43) });

  await stale.getByRole('checkbox').check();
  await stale.getByRole('button', { name: 'Export pinned review' }).click();
  const conflict = page.getByRole('alert', { name: 'Review changed before export' });
  await expect(conflict).toContainText('Accepted revision 3 is no longer current. Nothing from this export attempt was published.');
  await expect(conflict).toContainText('Latest revision 4');
  const exportHeading = exportSection.getByRole('heading', { name: 'Export' });
  await expect(exportHeading.getByText('Review changed', { exact: true })).toBeVisible();
  await expect(exportHeading.getByText('Ready', { exact: true })).toHaveCount(0);
  expect(JSON.parse(exportBodies[2] ?? '')).toEqual({ expectedRevision: 3, driftAcknowledgementToken: 's'.repeat(43) });

  await conflict.getByRole('button', { name: 'Reload latest' }).click();
  await expect(page.getByRole('button', { name: 'Export review' })).toBeVisible();
  expect(exportBodies).toHaveLength(3);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  holdNextExport();
  await page.getByRole('button', { name: 'Export review' }).click();
  const progress = page.getByRole('status', { name: 'Exporting accepted revision' });
  await expect(progress).toContainText('Preparing accepted revision 3…');
  await expect(progress.locator('.ui-spinner')).toHaveCount(1);
  await expect(progress.locator('.export-progress__spinner')).toHaveCount(0);
  await expect(progress.locator('.ui-spinner')).toHaveAttribute('aria-hidden', 'true');
  await expect(progress.locator('.ui-spinner')).toHaveCSS('animation-duration', '0s');
  await expect(page.getByRole('region', { name: 'Review export complete' })).toHaveCount(0);
  expect(exportBodies).toHaveLength(4);

  completeHeldExport({ kind: 'publicationFailed' });
  const failure = page.getByRole('alert', { name: 'Export was not published' });
  await expect(failure).toContainText('Export was not published');
  await expect(failure.getByRole('region', { name: 'Review export complete' })).toHaveCount(0);
  await expect(failure.locator('.ui-icon')).toHaveCount(1);

  exportResults.push({ kind: 'draftReadOnly' });
  await failure.getByRole('button', { name: 'Try export again' }).click();
  await expect(page.getByRole('heading', { name: 'Export is unavailable' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review export complete' })).toHaveCount(0);
});
