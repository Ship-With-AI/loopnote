import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { toCssRgb } from '../../src/web/theme/token-contract.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const canonicalTokens = canonicalRoot(repositoryRoot);
const toRootRgb = (token: string): string => toCssRgb(canonicalTokens, token);
let server: ViteDevServer | undefined;
let origin = '';

type PrototypeState = {
  rendered: boolean;
  language: string;
  fileId: string;
  diffUpdates: number;
  liveModels: number;
  listenerCount: number;
  pairedZones: number;
  activeComposers: number;
  contextMode: 'collapsed' | 'all-revealed';
  firstFrame: Readonly<{
    canvasBackground: string;
    gutterBackground: string;
    capturedAt: number;
    sequence: number;
  }> | undefined;
  fileReadyAt: number | undefined;
  fileReadySequence: number | undefined;
};

declare global {
  interface Window {
    __monacoStabilityPrototype: PrototypeState;
  }
}

async function startPrototypeServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [
      {
        name: 'monaco-stability-prototype-entry',
        configureServer(viteServer) {
          viteServer.middlewares.use('/monaco-stability', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('content-type', 'text/html');
            response.end(`<!doctype html><html lang="en"><body><div id="app"></div><script type="module" src="/__monaco-stability-entry.ts"></script></body></html>`);
          });
        },
        resolveId(id) {
          return id === '/__monaco-stability-entry.ts' ? id : undefined;
        },
        load(id) {
          return id === '/__monaco-stability-entry.ts'
            ? `import { createApp } from 'vue';\nimport Prototype from '/prototypes/MonacoStabilityPrototype.vue';\ncreateApp(Prototype).mount('#app');`
            : undefined;
        },
      },
    ],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  return server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
}

async function readState(page: Page): Promise<PrototypeState> {
  return page.evaluate<PrototypeState>(() => window.__monacoStabilityPrototype);
}

async function openPrototype(page: Page): Promise<void> {
  await page.goto(`${origin}/monaco-stability`);
  await expect(page.getByTestId('monaco-render-status')).toHaveText('Rendered real Monaco');
}

async function expectPairedZonesAligned(page: Page): Promise<void> {
  const composer = page.locator('.monaco-anchor-zone--composer');
  const spacer = page.locator('.monaco-anchor-zone--spacer');
  await expect(composer).toBeVisible();
  await expect(spacer).toBeVisible();
  const [composerBox, spacerBox] = await Promise.all([composer.boundingBox(), spacer.boundingBox()]);
  expect(composerBox, 'Monaco stability: composer zone must be rendered').not.toBeNull();
  expect(spacerBox, 'Monaco stability: paired spacer zone must be rendered').not.toBeNull();
  expect(Math.abs((composerBox?.y ?? 0) - (spacerBox?.y ?? 0)), 'Monaco stability: paired-zone top alignment').toBeLessThanOrEqual(1);
}

test.beforeAll(async () => {
  origin = await startPrototypeServer();
});

test.afterAll(async () => {
  await server?.close();
});

test('1. renders real read-only Monaco with exact immutable TypeScript fixture text', async ({ page }) => {
  await openPrototype(page);
  const diff = page.locator('.monaco-diff-editor');
  await expect(diff).toBeVisible();
  expect(await diff.boundingBox()).not.toBeNull();
  await expect(page.locator('.view-lines').nth(1)).toContainText("const inserted = 'head only';");
  await expect.poll(() => readState(page)).toMatchObject({
    rendered: true,
    language: 'typescript',
    fileId: 'fixture-a',
    liveModels: 2,
  });
});

test('2. anchors both base and head model lines through one active composer', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add base comment' }).click();
  await expect(page.locator('textarea[aria-label=\"Comment\"]')).toHaveCount(1);
  await expect(page.locator('.monaco-anchor-zone--composer')).toContainText('Base line 10');
  await expectPairedZonesAligned(page);

  await page.getByRole('button', { name: 'Add head comment' }).click();
  await expect(page.locator('.monaco-anchor-zone--composer')).toContainText('Head line 16');
  await expect.poll(() => readState(page)).toMatchObject({ pairedZones: 2, activeComposers: 1 });
});

test('3. reveals a hidden durable anchor only through the public all-context fallback', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Show hidden comment' }).click();
  await expect(page.locator('.monaco-anchor-zone--composer')).toContainText('Head line 5');
  await expect.poll(() => readState(page)).toMatchObject({ contextMode: 'all-revealed', pairedZones: 2 });
  await expectPairedZonesAligned(page);
});

test('4. keeps paired zones aligned through composer growth, layout, and resize', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add head comment' }).click();
  await page.locator('textarea[aria-label=\"Comment\"]').fill('A deliberately long comment\nthat grows the editor-owned composer\nwithout moving its paired spacer.');
  await expectPairedZonesAligned(page);
  await page.setViewportSize({ width: 1280, height: 760 });
  await expectPairedZonesAligned(page);
  await expect.poll(() => readState(page)).toMatchObject({ liveModels: 2, pairedZones: 2 });
});

test('5. follows deterministic file order and public previous/next change controls', async ({ page }) => {
  await openPrototype(page);
  await expect(page.getByRole('button', { name: 'Previous file' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(page.getByTestId('monaco-metrics')).toContainText('fixture-b · json');
  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(page.getByTestId('monaco-metrics')).toContainText('fixture-added · typescript');
  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(page.getByTestId('monaco-metrics')).toContainText('fixture-deleted · typescript');
  await expect(page.getByRole('button', { name: 'Next file' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous change' }).click();
  await page.getByRole('button', { name: 'Next change' }).click();
  await page.keyboard.press('F7');
  await page.keyboard.press('Shift+F7');
  await page.getByRole('button', { name: 'Previous file' }).click();
  await page.getByRole('button', { name: 'Previous file' }).click();
  await page.getByRole('button', { name: 'Previous file' }).click();
  await expect(page.getByTestId('monaco-metrics')).toContainText('fixture-a · typescript');
});

test('6. restores A → B → A composer text, anchor, and model state after readiness', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add base comment' }).click();
  await page.locator('textarea[aria-label=\"Comment\"]').fill('preserved composer text');
  await page.getByRole('button', { name: 'Next file' }).click();
  await page.getByRole('button', { name: 'Previous file' }).click();
  await expect(page.locator('textarea[aria-label=\"Comment\"]')).toHaveValue('preserved composer text');
  await expect(page.locator('.monaco-anchor-zone--composer')).toContainText('Base line 10');
  await expect.poll(() => readState(page)).toMatchObject({ fileId: 'fixture-a', liveModels: 2, pairedZones: 2 });
});

test('7. bounds live models, listeners, zones, and composers over ten recomputations', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add head comment' }).click();
  const initial = await readState(page);
  expect(initial.listenerCount).toBe(25);
  await page.getByRole('button', { name: 'Recompute 10 times' }).click();
  await expect.poll(() => readState(page)).toMatchObject({
    fileId: 'fixture-a',
    liveModels: 2,
    listenerCount: initial.listenerCount,
    pairedZones: 2,
  });
  expect((await readState(page)).diffUpdates).toBeGreaterThanOrEqual(11);
});

test('8. keyboard and pointer activation converge on the same one-composer action', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add head comment' }).click();
  await expect(page.locator('textarea[aria-label=\"Comment\"]')).toHaveCount(1);
  await page.locator('.monaco-editor').nth(1).click({ position: { x: 80, y: 60 } });
  await page.keyboard.press('Alt+Enter');
  await expect(page.locator('textarea[aria-label=\"Comment\"]')).toHaveCount(1);
  await expect.poll(() => readState(page)).toMatchObject({ activeComposers: 1, pairedZones: 2 });
});

test('9. uses read-only side editors and preserves separate base/head syntax language selection', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Next file' }).click();
  await expect.poll(() => readState(page)).toMatchObject({ language: 'json', liveModels: 2 });
  await page.locator('.monaco-editor').nth(1).click({ position: { x: 80, y: 60 } });
  await page.keyboard.type('unsafe mutation');
  await expect(page.locator('.view-lines').nth(1)).not.toContainText('unsafe mutation');
  await page.getByRole('button', { name: 'Previous file' }).click();
  await expect.poll(() => readState(page)).toMatchObject({ language: 'typescript', liveModels: 2 });
});

test('10. reconstructs paired public zones after repeated diff updates without duplicate composers', async ({ page }) => {
  await openPrototype(page);
  await page.getByRole('button', { name: 'Add base comment' }).click();
  const updatesBeforeRecompute = (await readState(page)).diffUpdates;
  await page.getByRole('button', { name: 'Recompute 10 times' }).click();
  await expect.poll(() => readState(page).then((state) => state.diffUpdates)).toBeGreaterThan(updatesBeforeRecompute);
  await expect(page.locator('textarea[aria-label=\"Comment\"]')).toHaveCount(1);
  await expect(page.locator('.monaco-anchor-zone')).toHaveCount(2);
  await expectPairedZonesAligned(page);
  await expect.poll(() => readState(page)).toMatchObject({ pairedZones: 2, activeComposers: 1, liveModels: 2 });
});


test('11. paints first-frame semantic theme, flat empty regions, and sparse signed bars', async ({ page }) => {
  await page.goto(`${origin}/monaco-stability`);
  await expect.poll(() => page.evaluate(() => (window as Window & {
    __monacoStabilityPrototype?: PrototypeState;
  }).__monacoStabilityPrototype?.firstFrame !== undefined)).toBe(true);
  await expect(page.getByTestId('monaco-render-status')).toHaveText('Rendered real Monaco');
  const state = await readState(page);
  expect(state.firstFrame).toMatchObject({
    canvasBackground: toRootRgb('--surface-canvas'),
    gutterBackground: toRootRgb('--surface-sidebar'),
  });
  expect(state.fileReadyAt).toBeGreaterThanOrEqual(state.firstFrame?.capturedAt ?? Infinity);
  expect(state.fileReadySequence).toBeGreaterThan(state.firstFrame?.sequence ?? Infinity);

  const headBars = page.locator('.monaco-diff-change-bar--head');
  const baseBars = page.locator('.monaco-diff-change-bar--base');
  const headSigns = page.locator('.monaco-diff-change-sign--head');
  const baseSigns = page.locator('.monaco-diff-change-sign--base');
  await expect(headBars).not.toHaveCount(0);
  await expect(baseBars).not.toHaveCount(0);
  await expect(headSigns).not.toHaveCount(0);
  await expect(baseSigns).not.toHaveCount(0);
  await expect(headBars.first()).toHaveCSS('border-left-width', '2px');
  await expect(baseBars.first()).toHaveCSS('border-left-width', '2px');
  await expect(headSigns.first()).toHaveJSProperty('tabIndex', -1);
  await expect(baseSigns.first()).toHaveJSProperty('tabIndex', -1);
  await expect.poll(() => headSigns.first().evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"+"');
  await expect.poll(() => baseSigns.first().evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"−"');

  await page.getByRole('button', { name: 'Next file' }).click();
  await page.getByRole('button', { name: 'Next file' }).click();
  const addedEmpty = page.locator('.diagonal-fill').first();
  await expect(addedEmpty).toHaveCSS('background-image', 'none');
  await expect(addedEmpty).toHaveCSS('background-color', toRootRgb('--surface-empty'));
  await expect(page.locator('.monaco-diff-change-sign--base')).toHaveCount(0);
  await expect(page.locator('.monaco-diff-change-sign--head')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(page.locator('.monaco-diff-change-sign--head')).toHaveCount(0);
  await expect(page.locator('.monaco-diff-change-sign--base')).not.toHaveCount(0);
});

test('11a. omits edit affordances from the immutable two-pane diff', async ({ page }) => {
  await openPrototype(page);

  await expect(page.locator('.monaco-diff-editor .gutter')).toHaveCount(0);
  await expect(page.locator('.monaco-diff-pane--base')).toHaveCount(1);
  await expect(page.locator('.monaco-diff-pane--base')).toBeVisible();
  await expect(page.locator('.monaco-diff-pane--head')).toHaveCount(1);
  await expect(page.locator('.monaco-diff-pane--head')).toBeVisible();
  // Keep this readOnly regression canary even though the option is unit-proven.
  await expect(page.locator('.monaco-diff-editor .arrow-revert-change')).toHaveCount(0);
});

test('11b. paints hidden-region controls from canonical token bytes', async ({ page }) => {
  await openPrototype(page);

  const hiddenLines = page.locator('.monaco-diff-pane--head .diff-hidden-lines');
  await expect(hiddenLines).not.toHaveCount(0);

  const band = hiddenLines.first().locator('.center');
  await expect(band).toContainText(/\d+ hidden lines/);
  const reveal = band.locator('a[title="Show Unchanged Region"]');
  await expect(reveal).toHaveAttribute('role', 'button');
  await expect(reveal).toHaveAttribute('title', 'Show Unchanged Region');
  await expect(band).toHaveCSS('background-color', toRootRgb('--surface-panel'));
  await expect(band).toHaveCSS('color', toRootRgb('--diff-hunk-foreground'));

  const edge = hiddenLines.first().locator('.bottom');
  await expect(edge).toHaveCSS('background-color', toRootRgb('--surface-gap'));
  await expect(edge).toHaveCSS('border-bottom-color', toRootRgb('--border-gap'));

  await edge.hover();
  await expect.poll(() => edge.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(toRootRgb('--diff-hunk-background'));

  await reveal.hover();
  await expect.poll(() => reveal.locator('.codicon').evaluate((element) => getComputedStyle(element).color))
    .toBe(toRootRgb('--diff-hunk-foreground'));
});

test('11c. paints hunk boundaries without changing code-line or paired-zone geometry', async ({ page }) => {
  await openPrototype(page);

  const start = page.locator('.monaco-diff-pane--head .monaco-diff-hunk-start').first();
  const end = page.locator('.monaco-diff-pane--head .monaco-diff-hunk-end').first();
  const interior = page.locator(
    '.monaco-diff-pane--head .monaco-diff-change-bar--head:not(.monaco-diff-hunk-start):not(.monaco-diff-hunk-end)',
  ).first();
  await expect(start).toBeVisible();
  await expect(end).toBeVisible();
  await expect(interior).toBeVisible();
  await expect(start).toHaveCSS('border-top-width', '1px');
  await expect(start).toHaveCSS('border-top-style', 'solid');
  await expect(start).toHaveCSS('border-top-color', toRootRgb('--diff-region-border'));
  await expect(end).toHaveCSS('border-bottom-width', '1px');
  await expect(end).toHaveCSS('border-bottom-style', 'solid');
  await expect(end).toHaveCSS('border-bottom-color', toRootRgb('--diff-region-border'));
  expect((await start.boundingBox())?.height).toBe((await interior.boundingBox())?.height);
  expect((await end.boundingBox())?.height).toBe((await interior.boundingBox())?.height);

  await page.getByRole('button', { name: 'Add head comment' }).click();
  await expectPairedZonesAligned(page);
});

test('12. keeps selection contrast, anchor rail, diff meaning, and focus in separate channels', async ({ page }) => {
  await openPrototype(page);
  expect((await readState(page)).listenerCount).toBe(25);

  const modifiedPane = page.locator('.monaco-diff-pane--head');
  await modifiedPane.click({ position: { x: 100, y: 80 } });
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');

  const selectionContrast = page.locator('.monaco-selection-contrast-foreground');
  await expect(selectionContrast).not.toHaveCount(0);
  await expect(selectionContrast.first()).toHaveCSS('color', toRootRgb('--text-on-emphasis'));
  await expect(page.locator('.selected-text').first()).toHaveCSS('outline-color', toRootRgb('--selection-border'));
  await expect(modifiedPane).toHaveCSS('outline-color', toRootRgb('--focus-ring'));
  await expect(page.locator('.monaco-diff-change-bar--head')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Add head comment' }).click();
  const anchorLine = page.locator('.monaco-anchor-line').first();
  await expect(anchorLine).toHaveCSS('border-left-width', '0px');
  await expect(anchorLine).toHaveCSS('box-shadow', `${toRootRgb('--interactive-accent')} 3px 0px 0px 0px inset`);
  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(selectionContrast).toHaveCount(0);
  await expect.poll(() => readState(page)).toMatchObject({ listenerCount: 25, liveModels: 2 });
});
