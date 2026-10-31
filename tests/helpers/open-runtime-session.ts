import { expect, type Page } from '@playwright/test';

import { SessionResponseSchema, SupportStatusSchema } from '../../src/contracts/api.js';

export interface RuntimeSessionSupportObservation {
  readonly enabled: boolean;
  readonly observedStatus?: 'unverified' | 'verified';
  readonly dismissed: boolean;
}

export async function openRuntimeSession(
  page: Page,
  url: string,
  options: Readonly<{ readonly dismissUnverified?: boolean }> = {},
): Promise<RuntimeSessionSupportObservation> {
  const dismissUnverified = options.dismissUnverified ?? true;
  const origin = new URL(url).origin;
  const startup = page.waitForResponse(async (response) => {
    const target = new URL(response.url());
    if (target.origin !== origin) return false;
    if (target.pathname === '/api/support/refresh' && response.request().method() === 'POST') return true;
    if (target.pathname !== '/api/session') return false;
    return SessionResponseSchema.parse(await response.json()).support?.enabled !== true;
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  const response = await startup;
  if (new URL(response.url()).pathname !== '/api/support/refresh') {
    return { enabled: false, dismissed: false };
  }
  if (!response.ok()) return { enabled: true, dismissed: false };
  const support = SupportStatusSchema.parse(await response.json());
  const dismissed = support.status === 'unverified' && dismissUnverified;
  if (dismissed) {
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.locator('.support-dialog-backdrop')).toBeHidden();
  }
  return { enabled: true, observedStatus: support.status, dismissed };
}
