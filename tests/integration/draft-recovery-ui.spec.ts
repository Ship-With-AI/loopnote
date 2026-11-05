import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { expect, test, type Page } from '@playwright/test';
import {
  DraftLoadResponseSchema,
  DraftRecoveryResultSchema,
  DraftRevealResultSchema,
  SessionResponseSchema,
  type DraftLoadResponse,
  type DraftRecoveryResult,
  type SessionResponse,
} from '../../src/contracts/api.js';
import { createServer, type ViteDevServer } from 'vite';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { resolveToken, toCssRgb } from '../../src/web/theme/token-contract.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const canonicalTokens = canonicalRoot(repositoryRoot);
const toRootRgb = (token: string): string => toCssRgb(canonicalTokens, token);
const token = 't'.repeat(43);
const safeDraftPath = `${RENAME_MAP.repoStateDir}drafts/active-review.json`;
const safeBackupPath = `${RENAME_MAP.repoStateDir}drafts/active-review.corrupt-backup.json`;
const fingerprint = 'a'.repeat(64);
const absolutePath = `/private/repositories/review/${RENAME_MAP.repoStateDir}drafts/active-review.json`;

let server: ViteDevServer | undefined;
let origin = '';
let draftLoad: DraftLoadResponse;
let recoveryResult: DraftRecoveryResult;
let releaseRecovery: (() => void) | undefined;
const recoveryBodies: string[] = [];
const revealBodies: string[] = [];

function releasePendingRecovery(): void {
  const release = releaseRecovery;
  if (release !== undefined) {
    release();
  }
}

function pinnedSession(): SessionResponse {
  return SessionResponseSchema.parse({
    base: { label: 'base', oid: 'a'.repeat(40) },
    head: { label: 'head', oid: 'b'.repeat(40) },
    mergeBaseOid: 'c'.repeat(40),
    files: [],
  });
}

function exactPatchSession(): SessionResponse {
  return SessionResponseSchema.parse({
    patch: {
      kind: 'exact-patch',
      digest: 'd'.repeat(64),
      reviewKey: 'e'.repeat(64),
      validationTarget: { kind: 'repository' },
      changedFileCount: 0,
    },
    files: [],
  });
}

let session = pinnedSession();

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

function malformedLoad() {
  return DraftLoadResponseSchema.parse({
    kind: 'malformed',
    path: safeDraftPath,
    fingerprint,
    detail: { message: 'Unexpected token at byte 1.' },
  });
}

function newerLoad() {
  return DraftLoadResponseSchema.parse({
    kind: 'newerUnsupported',
    path: safeDraftPath,
    foundVersion: 2,
    supportedVersion: 1,
  });
}

function recoveredResult() {
  return DraftRecoveryResultSchema.parse({
    kind: 'recovered',
    backupPath: safeBackupPath,
    draft: {
      schemaVersion: 1,
      comparison: {
        baseCommitOid: 'a'.repeat(40),
        headCommitOid: 'b'.repeat(40),
        mergeBaseOid: 'c'.repeat(40),
      },
      revision: 0,
      summary: '',
      comments: [],
    },
  });
}
function exactRecoveredResult(): DraftRecoveryResult {
  return DraftRecoveryResultSchema.parse({
    kind: 'recovered',
    backupPath: safeBackupPath,
    draft: {
      schemaVersion: 1,
      comparison: {
        kind: 'exact-patch',
        digest: 'd'.repeat(64),
        reviewKey: 'e'.repeat(64),
        validationTarget: { kind: 'repository' },
      },
      revision: 0,
      summary: '',
      comments: [],
    },
  });
}

async function startAppServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [{
      name: 'draft-recovery-ui-api',
      configureServer(viteServer) {
        viteServer.middlewares.use('/api/session', (_request, response) => json(response, session));
        viteServer.middlewares.use('/api/patch-status', (_request, response) => {
          json(response, { kind: 'unchanged', validationTargetLabel: 'Repository content' });
        });
        viteServer.middlewares.use('/api/draft/reveal', async (request, response) => {
          revealBodies.push(await readBody(request));
          json(response, DraftRevealResultSchema.parse({ kind: 'revealed' }));
        });
        viteServer.middlewares.use('/api/draft/recovery', async (request, response) => {
          recoveryBodies.push(await readBody(request));
          if (releaseRecovery === undefined) {
            releaseRecovery = () => json(response, recoveryResult, recoveryResult.kind === 'recovered' ? 201 : 500);
            return;
          }
          json(response, recoveryResult, recoveryResult.kind === 'recovered' ? 201 : 500);
        });
        viteServer.middlewares.use('/api/draft', (_request, response) => json(response, draftLoad));
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  return server.resolvedUrls?.local[0] ?? '';
}

async function openDraft(page: Page): Promise<void> {
  await page.goto(`${origin}#token=${token}`);
}

test.beforeAll(async () => {
  origin = await startAppServer();
});

test.afterAll(async () => {
  await server?.close();
});

test.beforeEach(async ({ context }) => {
  session = pinnedSession();
  draftLoad = malformedLoad();
  recoveryResult = DraftRecoveryResultSchema.parse({ kind: 'persistenceFailure' });
  releaseRecovery = undefined;
  recoveryBodies.length = 0;
  revealBodies.length = 0;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
});

test('corrupt drafts remain read only until the fingerprint-bound recovery response succeeds', async ({ page }) => {
  const requests: { url: string; method: string; postData: string | null }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/draft/reveal') || request.url().includes('/api/draft/recovery')) {
      requests.push({ url: request.url(), method: request.method(), postData: request.postData() });
    }
  });

  await openDraft(page);
  await expect(page.getByRole('heading', { name: 'Local review draft needs recovery' })).toBeVisible();
  const readOnlyStatus = page.locator('.draft-recovery__status');
  await expect(readOnlyStatus).toContainText('Read only');
  await expect(readOnlyStatus).toHaveClass(/review-state-badge--disabled/);
  await expect(readOnlyStatus.locator('.ui-icon')).toHaveCount(1);
  await expect(page.getByText(safeDraftPath, { exact: true })).toBeVisible();
  await expect(page.getByText('Unexpected token at byte 1.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal draft file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy draft path' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up and start new' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comments' })).toHaveCount(0);
  await expect(page.getByText(absolutePath)).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(absolutePath);
  const recovery = page.locator('.draft-recovery');
  const card = page.locator('.draft-recovery__card');
  const badge = readOnlyStatus;
  const recoveryAction = page.getByRole('button', { name: 'Back up and start new' });
  await expect(recovery).toHaveCSS('background-color', toRootRgb('--surface-canvas'));
  await expect(card).toHaveCSS('background-color', toRootRgb('--surface-panel'));
  await expect(card).toHaveCSS('border-color', toRootRgb('--border-default'));
  await expect(card).toHaveCSS('border-radius', resolveToken(canonicalTokens, '--radius-control'));
  await expect(card).toHaveCSS('box-shadow', 'none');
  await expect(badge).toHaveCSS('border-style', 'solid');
  await expect(badge).toHaveCSS('border-width', '1px');
  await recoveryAction.focus();
  await expect(recoveryAction).toHaveCSS('outline-color', toRootRgb('--focus-ring'));
  await expect(recoveryAction).toHaveCSS('outline-width', resolveToken(canonicalTokens, '--focus-outline-width'));
  await expect(recoveryAction).toHaveCSS('outline-offset', resolveToken(canonicalTokens, '--focus-offset'));

  await page.getByRole('button', { name: 'Reveal draft file' }).click();
  await expect(page.getByText('Draft file revealed in the system file browser.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy draft path' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(safeDraftPath);
  expect(revealBodies).toEqual(['']);
  expect(requests[0]).toEqual({ url: `${origin}api/draft/reveal`, method: 'POST', postData: null });

  const startNew = page.getByRole('button', { name: 'Back up and start new' });
  await startNew.click();
  const keepExisting = page.getByRole('button', { name: 'Keep existing draft' });
  await expect(keepExisting).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Start a new draft?' })).toHaveCount(0);
  await expect(startNew).toBeFocused();
  expect(recoveryBodies).toEqual([]);

  await startNew.click();
  await keepExisting.click();
  await expect(page.getByRole('heading', { name: 'Start a new draft?' })).toHaveCount(0);
  expect(recoveryBodies).toEqual([]);

  await startNew.click();
  const confirmationAction = page.locator('.draft-recovery__recovery-action');
  const confirmationBounds = await confirmationAction.boundingBox();
  await expect(confirmationAction).toHaveAttribute('aria-busy', 'false');
  await confirmationAction.click();
  await expect(confirmationAction).toHaveClass(/draft-recovery__action--busy/);
  await expect(confirmationAction).toHaveAttribute('aria-busy', 'true');
  await expect(confirmationAction.locator('.ui-spinner')).toHaveCount(1);
  expect(await confirmationAction.boundingBox()).toMatchObject({
    height: confirmationBounds?.height,
    width: confirmationBounds?.width,
  });
  await expect(page.getByRole('button', { name: 'Reveal draft file' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy draft path' })).toBeDisabled();
  await expect(page.locator('.draft-recovery .ui-spinner')).toHaveCount(1);
  await expect(page.getByText('Backing up existing draft…', { exact: true })).toBeVisible();
  await expect.poll(() => recoveryBodies).toEqual([JSON.stringify({ expectedFingerprint: fingerprint })]);
  releasePendingRecovery();
  await expect(page.getByRole('heading', { name: 'Recovery did not complete' })).toBeVisible();
  await expect(page.getByText('The existing draft is still read only and has not been replaced. Check the terminal details, then try again.', { exact: true })).toBeVisible();
  await expect(page.getByText(safeDraftPath, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comments' })).toHaveCount(0);
  expect(recoveryBodies).toEqual([JSON.stringify({ expectedFingerprint: fingerprint })]);
  expect(requests[1]).toEqual({
    url: `${origin}api/draft/recovery`,
    method: 'POST',
    postData: JSON.stringify({ expectedFingerprint: fingerprint }),
  });

  recoveryResult = recoveredResult();
  releaseRecovery = undefined;
  await startNew.click();
  await page.getByRole('button', { name: 'Back up and start new' }).last().click();
  await expect(page.getByText('Backing up existing draft…', { exact: true })).toBeVisible();
  releasePendingRecovery();
  await expect(page.getByRole('heading', { name: 'New draft started' })).toBeVisible();
  const recoveredCard = page.locator('.draft-recovery__card');
  const recoveryNotice = recoveredCard.locator('.draft-recovery__notice');
  const recoveryLiveOwners = recoveredCard.locator('[role="status"], [aria-live="polite"]');
  await expect(recoveryLiveOwners).toHaveCount(1);
  await expect(recoveryLiveOwners).toHaveClass(/inline-notice--success/);
  await expect(recoveryNotice).toHaveAttribute('role', 'status');
  await expect(recoveryNotice.getByRole('heading', { name: 'New draft started' })).toHaveCount(1);
  await expect(recoveryNotice).toContainText('The original draft was preserved before the new empty draft was created.');
  await expect(page.getByText(safeBackupPath, { exact: true })).toBeVisible();
  await expect(page.locator('.draft-recovery__receipt-status')).toContainText('Recovered');
  await expect(page.locator('.draft-recovery__receipt-status .ui-icon')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Comments' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open new draft' }).click();
  await expect(page.getByRole('heading', { name: 'No changes in this comparison.' })).toBeVisible();
});

test('schema-invalid drafts remain read only while exposing only bounded validation details', async ({ page }) => {
  draftLoad = DraftLoadResponseSchema.parse({
    kind: 'schemaInvalid',
    path: safeDraftPath,
    fingerprint,
    details: [{ path: 'comments.0.body', message: 'Required' }],
  });

  await openDraft(page);
  await expect(page.getByRole('heading', { name: 'Local review draft needs recovery' })).toBeVisible();
  await expect(page.locator('.draft-recovery__status')).toContainText('Read only');
  await expect(page.locator('.draft-recovery__status .ui-icon')).toHaveCount(1);
  await expect(page.locator('.draft-recovery__notice.inline-notice--warning')).toHaveCount(1);
  await expect(page.getByText('Draft data does not match the supported schema', { exact: true })).toBeVisible();
  await expect(page.getByText('comments.0.body', { exact: true })).toBeVisible();
  await expect(page.getByText('Required', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up and start new' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comments' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(absolutePath);
});

test('newer drafts are upgrade-only and expose only fixed reveal and safe copy actions', async ({ page }) => {
  draftLoad = newerLoad();
  const revealRequests: { url: string; postData: string | null }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/draft/reveal')) {
      revealRequests.push({ url: request.url(), postData: request.postData() });
    }
  });

  await openDraft(page);
  await expect(page.getByRole('heading', { name: `This draft needs a newer ${RENAME_MAP.displayName}` })).toBeVisible();
  await expect(page.getByText(`Draft schema version 2 is newer than supported version 1. Upgrade ${RENAME_MAP.displayName} to open it. The file has not been changed.`, { exact: true })).toBeVisible();
  await expect(page.getByText('Read only', { exact: true })).toBeVisible();
  await expect(page.locator('.draft-recovery__status')).toContainText('Read only');
  await expect(page.locator('.draft-recovery__status .ui-icon')).toHaveCount(1);
  await expect(page.locator('.draft-recovery__notice.inline-notice--error')).toHaveCount(1);
  await expect(page.getByText(safeDraftPath, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal draft file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy draft path' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(`This draft needs a newer ${RENAME_MAP.displayName}`);
  await page.locator('html').evaluate((element) => { element.style.zoom = '2'; });
  const reveal = page.getByRole('button', { name: 'Reveal draft file' });
  await reveal.focus();
  await expect(reveal).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Copy draft path' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back up and start new' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /reset|downgrade|migrat|preview/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Comments' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(absolutePath);

  await page.getByRole('button', { name: 'Reveal draft file' }).click();
  await page.getByRole('button', { name: 'Copy draft path' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(safeDraftPath);
  expect(revealBodies).toEqual(['']);
  expect(revealRequests).toEqual([{ url: `${origin}api/draft/reveal`, postData: null }]);
});

test('exact patch recovery opens a frozen draft without pinned-session language', async ({ page }) => {
  const vueWarnings: string[] = [];
  page.on('console', (message) => {
    if (/\[Vue warn\]|Unhandled/u.test(message.text())) {
      vueWarnings.push(message.text());
    }
  });
  session = exactPatchSession();
  recoveryResult = exactRecoveredResult();

  await openDraft(page);
  await expect(page.locator('body')).not.toContainText(/\bpinned\b/iu);
  await page.getByRole('button', { name: 'Back up and start new' }).click();
  await page.getByRole('button', { name: 'Back up and start new' }).last().click();
  await expect.poll(() => releaseRecovery !== undefined).toBe(true);
  releasePendingRecovery();

  await expect(page.getByRole('heading', { name: 'New draft started' })).toBeVisible();
  await page.getByRole('button', { name: 'Open new draft' }).click();
  await expect(page.getByRole('heading', { name: 'No files in this exact patch' })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toContainText('New local draft for this frozen exact patch.');
  await expect(page.locator('body')).not.toContainText(/\bpinned\b/iu);
  expect(vueWarnings).toEqual([]);
});
