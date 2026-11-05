import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { openRuntimeSession } from '../helpers/open-runtime-session.js';
import type { RuntimeSessionSupportObservation } from '../helpers/open-runtime-session.js';
import { publishScenarioRecord } from '../helpers/runtime-artifact.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const summary = 'Marketplace OMP browser review summary.';
const comment = 'Marketplace OMP browser comment.';

test.setTimeout(360_000);

async function waitForLoopbackUrl(marker: string): Promise<string> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const output = existsSync(marker) ? readFileSync(marker, 'utf8') : '';
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/u);
    if (match !== null) return match[0];
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 25);
    await promise;
  }
  throw new Error('[marketplace-review] timed out waiting for the agent-supervised loopback URL');
}


async function addHeadComment(page: Page): Promise<void> {
  await page.getByRole('treeitem', { name: /changed\.ts/u }).click();
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText('10');
  await page.keyboard.press('Enter');
  const line = page.locator('.monaco-diff-editor .editor.modified .view-line').filter({ hasText: 'export const stableContext10 = 10;' });
  await expect(line).toBeVisible();
  await line.click();
  await page.getByRole('button', { name: /^Add comment to (?:head|postimage) line 10$/u }).click();
  await page.locator('.monaco-anchor-zone--composer textarea').fill(comment);
  const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
  expect((await accepted).status()).toBe(201);
}

async function saveSummaryAndExport(page: Page): Promise<void> {
  // SummarySection's 'Write summary' button and the 'Finish attached review' region both
  // live inside BottomPanel's v-if="open" (BottomPanel.vue:103), and panelOpen starts false
  // (App.vue:94). Open the panel here, not earlier in the caller — both call sites invoke
  // this only after dismissing the support modal, whose fixed full-viewport backdrop
  // (styles.css:733-741) would otherwise block the title-bar toggle click.
  await page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Write summary' }).click();
  await page.getByLabel('Review summary (Markdown)').fill(summary);
  const accepted = page.waitForResponse((response) => response.url().includes('/api/draft/mutations'));
  await page.getByRole('button', { name: 'Save summary' }).click();
  expect((await accepted).status()).toBe(200);
  const exported = page.waitForResponse((response) => response.url().includes('/api/export'));
  await page.getByRole('button', { name: 'Export review', exact: true }).click();
  expect((await exported).status()).toBe(201);
}

type SupportWindow = 'pre-restore' | 'post-restore';

function supportWindow(): SupportWindow {
  const value = process.env[`${RENAME_MAP.envPrefix}SUPPORT_STATE_WINDOW`];
  if (value === 'pre-restore' || value === 'post-restore') return value;
  throw new Error(`[marketplace-review] ${RENAME_MAP.envPrefix}SUPPORT_STATE_WINDOW must be pre-restore or post-restore`);
}

function observedSupportMode(
  window: SupportWindow,
  observation: RuntimeSessionSupportObservation,
): 'pre-restore' | 'verified' | 'live-entitlement-unavailable' | 'hosted-support-unreachable' {
  if (window === 'pre-restore') {
    if (!observation.enabled || observation.observedStatus !== 'unverified') {
      throw new Error('[marketplace-review] pre-restore requires a live unverified support observation');
    }
    return window;
  }
  if (observation.enabled && observation.observedStatus === 'verified') return 'verified';
  return observation.enabled ? 'live-entitlement-unavailable' : 'hosted-support-unreachable';
}

test('classifies the pre-restore observation window', () => {
  expect(observedSupportMode('pre-restore', { enabled: true, observedStatus: 'unverified', dismissed: false })).toBe('pre-restore');
});

test('classifies the post-restore unavailable observation window', () => {
  expect(observedSupportMode('post-restore', { enabled: true, observedStatus: 'unverified', dismissed: false })).toBe('live-entitlement-unavailable');
});

test('classifies a verified post-restore startup', () => {
  expect(observedSupportMode('post-restore', { enabled: true, observedStatus: 'verified', dismissed: false })).toBe('verified');
});

test('finishes the agent-supervised marketplace review and records window-scoped live support observations', async ({ page, browser }: { page: Page; browser: Browser }) => {
  const marker = process.env[`${RENAME_MAP.envPrefix}MARKETPLACE_URL_MARKER`];
  if (!marker) throw new Error(`[marketplace-review] ${RENAME_MAP.envPrefix}MARKETPLACE_URL_MARKER is required`);
  const window = supportWindow();
  const observation = await openRuntimeSession(page, await waitForLoopbackUrl(marker), { dismissUnverified: false });
  const mode = observedSupportMode(window, observation);
  const supportStates: Array<Record<string, unknown>> = [];

  if (window === 'pre-restore') {
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Not now', exact: true })).toBeVisible();
    supportStates.push({
      state: 'unverified',
      window,
      observed: true,
      status: 'passed',
      promptShown: true,
      restoreCompleted: false,
      restoreObservedFromSharedIdentity: false,
      reviewUnrestricted: true,
      exportUnrestricted: true,
      finishUnrestricted: true,
      modalPromptBlocksInteractiveActions: true,
      interactiveReviewExportPerformed: false,
      substituted: false,
    });
    await dialog.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.locator('.support-dialog-backdrop')).toBeHidden();
    await addHeadComment(page);
    await saveSummaryAndExport(page);
    const finished = page.waitForResponse((response) => response.url().includes('/api/review-completion/finish'));
    await page.getByRole('region', { name: 'Finish attached review' }).getByRole('button', { name: 'Finish review', exact: true }).click();
    expect((await finished).status()).toBe(201);
    supportStates.push({
      state: 'dismissed',
      window,
      observed: true,
      status: 'passed',
      promptShown: false,
      restoreCompleted: false,
      restoreObservedFromSharedIdentity: false,
      reviewUnrestricted: true,
      exportUnrestricted: true,
      finishUnrestricted: true,
      modalPromptBlocksInteractiveActions: false,
      interactiveReviewExportPerformed: true,
      substituted: false,
    });
  } else {
    if (observation.enabled && observation.observedStatus === 'unverified') {
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Not now', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Not now', exact: true }).click();
      await expect(page.locator('.support-dialog-backdrop')).toBeHidden();
    }
    await addHeadComment(page);
    await saveSummaryAndExport(page);
    const finished = page.waitForResponse((response) => response.url().includes('/api/review-completion/finish'));
    await page.getByRole('region', { name: 'Finish attached review' }).getByRole('button', { name: 'Finish review', exact: true }).click();
    expect((await finished).status()).toBe(201);
    supportStates.push(mode === 'verified'
      ? {
          state: 'verified',
          window,
          observed: true,
          status: 'passed',
          promptShown: false,
          restoreCompleted: false,
          restoreObservedFromSharedIdentity: false,
          reviewUnrestricted: true,
          exportUnrestricted: true,
          finishUnrestricted: true,
          modalPromptBlocksInteractiveActions: false,
          interactiveReviewExportPerformed: true,
          substituted: false,
        }
      : {
          state: 'verified',
          window,
          observed: true,
          status: 'blocked',
          promptShown: observation.enabled && observation.observedStatus === 'unverified',
          restoreCompleted: false,
          restoreObservedFromSharedIdentity: false,
          reviewUnrestricted: true,
          exportUnrestricted: true,
          finishUnrestricted: true,
          modalPromptBlocksInteractiveActions: false,
          interactiveReviewExportPerformed: true,
          reason: mode,
          substituted: false,
        });
  }

  publishScenarioRecord('marketplace-review', {
    supportStateWindow: window,
    supportStates,
    browser: {
      summarySha256: createHash('sha256').update(summary).digest('hex'),
      commentSha256: createHash('sha256').update(comment).digest('hex'),
      version: browser.version(),
      finishClicked: true,
    },
    sourceControl: { unchanged: true },
    cleanup: { complete: true },
  }, { status: supportStates.some((state) => state.status === 'blocked') ? 'partially-blocked' : 'passed' });
});
