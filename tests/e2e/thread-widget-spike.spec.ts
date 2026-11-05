// THROWAWAY SPIKE SPEC — Plan 23-01 go/no-go decision only.
// Exercises ThreadWidgetSpikePrototype.vue in a real Chromium instance against a real
// Monaco diff/single editor: pointer clicks, keyboard Tab/Shift-Tab/Esc, typing,
// scroll survival, and hideUnchangedRegions collapse/expand, for both the
// content-widget and overlay-widget techniques, across side-by-side, inline, and
// single-pane modes. Findings feed 23-01-SUMMARY.md. Deleted once the decision is
// recorded (23-01-PLAN.md threat model T-23-01-01).
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const repositoryRoot = resolve(import.meta.dirname, '../..');
let server: ViteDevServer | undefined;
let origin = '';

type WidgetVariant = 'content' | 'overlay';
type SpikeMode = 'side-by-side' | 'inline' | 'single-pane';
type ContextMode = 'collapsed' | 'all-revealed';

type ThreadGeometry = Readonly<{
  id: string;
  label: string;
  anchorLine: number;
  baseHeightPx?: number;
  headHeightPx?: number;
  heightPx?: number;
}>;

type SpikeState = {
  ready: boolean;
  mode: SpikeMode;
  variant: WidgetVariant;
  threadCount: 3 | 30;
  contextMode: ContextMode;
  clickCounts: Record<string, number>;
  diffThreads: readonly ThreadGeometry[];
  singleThreads: readonly ThreadGeometry[];
  revealThread: (id: string) => void;
};

declare global {
  interface Window {
    __threadSpike: SpikeState;
  }
}

const MODE_LABEL: Record<SpikeMode, string> = {
  'side-by-side': 'Mode: Side-by-side',
  inline: 'Mode: Inline',
  'single-pane': 'Mode: Single-pane',
};
const VARIANT_LABEL: Record<WidgetVariant, string> = {
  content: 'Variant: Content widget',
  overlay: 'Variant: Overlay widget',
};
const HOST_TEST_ID: Record<SpikeMode, string> = {
  'side-by-side': 'thread-spike-diff-host',
  inline: 'thread-spike-diff-host',
  'single-pane': 'thread-spike-single-host',
};
const SCROLL_TARGET_SELECTOR: Record<SpikeMode, string> = {
  'side-by-side': '[data-testid="thread-spike-diff-host"] .editor.modified',
  inline: '[data-testid="thread-spike-diff-host"] .editor.modified',
  'single-pane': '[data-testid="thread-spike-single-host"] .monaco-editor',
};

async function startPrototypeServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [
      {
        name: 'thread-widget-spike-entry',
        configureServer(viteServer) {
          viteServer.middlewares.use('/thread-widget-spike', (_request, response) => {
            response.statusCode = 200;
            response.setHeader('content-type', 'text/html');
            response.end('<!doctype html><html lang="en"><body><div id="app"></div><script type="module" src="/__thread-widget-spike-entry.ts"></script></body></html>');
          });
        },
        resolveId(id) {
          return id === '/__thread-widget-spike-entry.ts' ? id : undefined;
        },
        load(id) {
          return id === '/__thread-widget-spike-entry.ts'
            ? "import { createApp } from 'vue';\nimport Prototype from '/prototypes/ThreadWidgetSpikePrototype.vue';\ncreateApp(Prototype).mount('#app');"
            : undefined;
        },
      },
    ],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  return server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
}

async function readState(page: Page): Promise<SpikeState> {
  return page.evaluate<SpikeState>(() => window.__threadSpike);
}

async function openPrototype(page: Page): Promise<void> {
  await page.goto(`${origin}/thread-widget-spike`);
  await expect(page.getByTestId('thread-spike-render-status')).toHaveText('Rendered real Monaco');
}

async function setVariant(page: Page, variant: WidgetVariant): Promise<void> {
  await page.getByRole('button', { name: VARIANT_LABEL[variant] }).click();
  await expect.poll(async () => (await readState(page)).variant).toBe(variant);
}

async function setMode(page: Page, mode: SpikeMode): Promise<void> {
  await page.getByRole('button', { name: MODE_LABEL[mode] }).click();
  await expect.poll(async () => (await readState(page)).mode).toBe(mode);
}

async function setContextMode(page: Page, next: ContextMode): Promise<void> {
  const label = next === 'collapsed' ? 'Context: Collapsed' : 'Context: All revealed';
  await page.getByRole('button', { name: label }).click();
  await expect.poll(async () => (await readState(page)).contextMode).toBe(next);
}

async function revealThread(page: Page, id: string): Promise<void> {
  await page.evaluate((threadId) => window.__threadSpike.revealThread(threadId), id);
  // Monaco's render pass (and our onDomNodeTop/content-widget reposition) runs on the
  // next animation frame, not synchronously with revealLineInCenter().
  await page.waitForTimeout(80);
}

function resolveButton(page: Page, hostTestId: string, label: string) {
  return page.locator(`[data-testid="${hostTestId}"] button[aria-label="Resolve thread ${label}"]`);
}
function threadTextarea(page: Page, hostTestId: string, label: string) {
  return page.locator(`[data-testid="${hostTestId}"] textarea[aria-label="Thread ${label} body"]`);
}

/** Check 1: pointer clicks register on every one of the N rendered threads, not just the first. */
async function assertPointerClicksWork(page: Page, hostTestId: string, labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    await revealThread(page, `thread-${label}`);

    const resolveBefore = (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0;
    await resolveButton(page, hostTestId, label).click();
    await expect.poll(async () => (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0, {
      message: `Thread ${label}: Resolve click must register (${hostTestId})`,
    }).toBe(resolveBefore + 1);

    const deleteBefore = (await readState(page)).clickCounts[`Delete thread ${label}`] ?? 0;
    await page.locator(`[data-testid="${hostTestId}"] button[aria-label="Delete thread ${label}"]`).click();
    await expect.poll(async () => (await readState(page)).clickCounts[`Delete thread ${label}`] ?? 0, {
      message: `Thread ${label}: Delete click must register (${hostTestId})`,
    }).toBe(deleteBefore + 1);
  }
}

/** Check 2: Tab/Shift-Tab cycles textarea -> Resolve -> Delete and back; Esc returns focus to Monaco. */
async function assertKeyboardCycling(page: Page, hostTestId: string, label: string): Promise<void> {
  await revealThread(page, `thread-${label}`);
  const activeAriaLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

  await threadTextarea(page, hostTestId, label).click();
  await expect.poll(activeAriaLabel, { message: 'Focus must start on the thread body textarea' }).toBe(`Thread ${label} body`);

  await page.keyboard.press('Tab');
  await expect.poll(activeAriaLabel, { message: 'Tab 1 must land on Resolve' }).toBe(`Resolve thread ${label}`);

  await page.keyboard.press('Tab');
  await expect.poll(activeAriaLabel, { message: 'Tab 2 must land on Delete' }).toBe(`Delete thread ${label}`);

  await page.keyboard.press('Shift+Tab');
  await expect.poll(activeAriaLabel, { message: 'Shift+Tab 1 must land back on Resolve' }).toBe(`Resolve thread ${label}`);

  await page.keyboard.press('Shift+Tab');
  await expect.poll(activeAriaLabel, { message: 'Shift+Tab 2 must land back on the textarea' }).toBe(`Thread ${label} body`);

  await page.keyboard.press('Escape');
  await expect.poll(
    // Monaco 0.55.1 focuses a `.native-edit-context` element for keyboard input
    // (not the classic `textarea.inputarea` from older Monaco versions) — assert
    // version-agnostically: focus left the thread widget and landed somewhere
    // inside the Monaco editor DOM.
    () => page.evaluate(() => {
      const active = document.activeElement;
      return active !== null && active.closest('.thread-spike-widget') === null && active.closest('.monaco-editor') !== null;
    }),
    { message: 'Escape must return focus to the Monaco editor, out of the thread widget' },
  ).toBe(true);
}

/** Check 3: typing lands in a thread that is not first in the file, pre-scrolled partially below the fold. */
async function assertTypingLands(page: Page, hostTestId: string, scrollTargetSelector: string, label: string): Promise<void> {
  // Scroll the pane down first so the thread starts partially below the fold, then
  // reveal it precisely (mirrors a real "scroll, then click a partially-visible
  // thread" flow) before asserting the typed text lands.
  const target = await page.locator(scrollTargetSelector).boundingBox();
  if (target !== null) {
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(100);
  }
  await revealThread(page, `thread-${label}`);

  const textarea = threadTextarea(page, hostTestId, label);
  await textarea.click();
  await textarea.fill('');
  const typed = `typed-${label}-${Date.now()}`;
  await page.keyboard.type(typed);
  await expect(textarea, `Thread ${label}: typed text must land in the textarea`).toHaveValue(typed);
}

type ScrollStep = Readonly<{ step: number; attached: boolean; computedVisible: boolean; top: number }>;

/**
 * Check 4 (scroll survival): steps the editor pane through a real page.mouse.wheel
 * sequence and records, at each step, whether the thread's Resolve button is
 * attached/visible and where Monaco believes its top is. This is the literal "half
 * in/out" scroll scenario RESEARCH.md's cited content-widget bug describes.
 */
async function measureScrollSurvival(
  page: Page,
  hostTestId: string,
  scrollTargetSelector: string,
  label: string,
  steps = 16,
  stepPx = 300,
): Promise<ScrollStep[]> {
  // Checks 1-3 (and other variant/mode iterations) leave scroll position wherever
  // they last revealed a thread — start this measurement from a known baseline
  // (the target thread centered) so the trace is reproducible step-to-step.
  await revealThread(page, `thread-${label}`);

  const target = await page.locator(scrollTargetSelector).boundingBox();
  if (target === null) {
    throw new Error(`Thread spike: scroll target not found for ${scrollTargetSelector}`);
  }
  await page.mouse.move(target.x + target.width / 2, target.y + 50);

  const trace: ScrollStep[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(0, stepPx);
    await page.waitForTimeout(70);
    const measurement = await page.evaluate(
      ({ hostId, buttonLabel }) => {
        const button = document.querySelector<HTMLButtonElement>(
          `[data-testid="${hostId}"] button[aria-label="Resolve thread ${buttonLabel}"]`,
        );
        if (button === null) {
          return { attached: false, computedVisible: false, top: Number.NaN };
        }
        const style = getComputedStyle(button);
        const box = button.getBoundingClientRect();
        // Overlay widgets stay CSS visibility:visible even when Monaco parks their
        // underlying zone off-canvas (onDomNodeTop reports a huge sentinel, e.g.
        // ~-1,000,000px) while its line isn't in the currently rendered range —
        // content widgets instead flip visibility:hidden for the same condition.
        // Both must count as "not really on screen" here.
        const onCanvas = Math.abs(box.y) < 5_000;
        return {
          attached: true,
          computedVisible: style.display !== 'none' && style.visibility !== 'hidden' && onCanvas,
          top: box.y,
        };
      },
      { hostId: hostTestId, buttonLabel: label },
    );
    trace.push({ step, ...measurement });
  }
  return trace;
}

/** Interacts with a thread at whatever scroll position measureScrollSurvival left it in, if it is currently clickable. */
async function assertInteractiveIfVisible(page: Page, hostTestId: string, label: string, trace: readonly ScrollStep[]): Promise<boolean> {
  const lastVisible = [...trace].reverse().find((entry) => entry.computedVisible);
  if (lastVisible === undefined) {
    return false;
  }
  const button = resolveButton(page, hostTestId, label);
  const before = (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0;
  try {
    await button.click({ timeout: 2_000 });
  } catch {
    return false;
  }
  const after = (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0;
  return after === before + 1;
}

/** Check 5 (hidden-unchanged-region collapse/expand): thread 2 anchors deep inside a foldable block. */
async function assertHiddenRegionSurvival(page: Page, hostTestId: string, label: string): Promise<{ collapsedVisible: boolean; revealedVisible: boolean; recoveredAfterRecollapse: boolean }> {
  await setContextMode(page, 'collapsed');
  const collapsedVisible = await page.evaluate(
    ({ hostId, buttonLabel }) => {
      const button = document.querySelector<HTMLButtonElement>(`[data-testid="${hostId}"] button[aria-label="Resolve thread ${buttonLabel}"]`);
      if (button === null) return false;
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    },
    { hostId: hostTestId, buttonLabel: label },
  );

  await setContextMode(page, 'all-revealed');
  await revealThread(page, `thread-${label}`);
  const revealedBefore = (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0;
  await resolveButton(page, hostTestId, label).click();
  const revealedVisible = ((await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0) === revealedBefore + 1;

  await setContextMode(page, 'collapsed');
  await setContextMode(page, 'all-revealed');
  await revealThread(page, `thread-${label}`);
  const recoverBefore = (await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0;
  await resolveButton(page, hostTestId, label).click();
  const recoveredAfterRecollapse = ((await readState(page)).clickCounts[`Resolve thread ${label}`] ?? 0) === recoverBefore + 1;

  await setContextMode(page, 'collapsed');
  return { collapsedVisible, revealedVisible, recoveredAfterRecollapse };
}

/** Check 6 (paired zone-height sync): growing thread 2's textarea must land both sides' zone heights together. */
async function assertPairedZoneHeightSync(page: Page, label: string): Promise<void> {
  // Thread 2 anchors in the foldable region (check 5's subject); check 5 may leave
  // context mode collapsed as its own final measurement, so restore visibility here.
  await setContextMode(page, 'all-revealed');
  await revealThread(page, `thread-${label}`);
  const textarea = threadTextarea(page, 'thread-spike-diff-host', label);
  await textarea.click();
  await textarea.fill('');
  await page.keyboard.type('line one\nline two\nline three\nline four\nline five\nline six');
  await expect.poll(async () => {
    const state = await readState(page);
    const thread = state.diffThreads.find((entry) => entry.label === label);
    if (thread === undefined || thread.baseHeightPx === undefined || thread.headHeightPx === undefined) {
      return undefined;
    }
    return { equal: thread.baseHeightPx === thread.headHeightPx, grown: thread.baseHeightPx > 140 };
  }, { message: `Thread ${label}: base/head zone heights must land together after growth` }).toEqual({ equal: true, grown: true });
}

test.beforeAll(async () => {
  origin = await startPrototypeServer();
});

test.afterAll(async () => {
  await server?.close();
});

const VARIANTS: readonly WidgetVariant[] = ['content', 'overlay'];
const MODES: readonly SpikeMode[] = ['side-by-side', 'inline', 'single-pane'];
const THREAD_LABELS = ['1', '2', '3'] as const;

for (const variant of VARIANTS) {
  for (const mode of MODES) {
    test(`${variant} variant / ${mode} mode: pointer, keyboard, typing, scroll, and (where applicable) zone-height/hidden-region survival`, async ({ page }) => {
      await openPrototype(page);
      await setVariant(page, variant);
      await setMode(page, mode);
      await setContextMode(page, 'all-revealed');

      const hostTestId = HOST_TEST_ID[mode];
      const scrollTargetSelector = SCROLL_TARGET_SELECTOR[mode];

      await test.step('1. pointer clicks on all 3 threads', async () => {
        await assertPointerClicksWork(page, hostTestId, THREAD_LABELS);
      });

      await test.step('2. keyboard Tab/Shift-Tab/Escape cycling', async () => {
        await assertKeyboardCycling(page, hostTestId, '2');
      });

      await test.step('3. typing lands in a non-first, partially-scrolled thread', async () => {
        await assertTypingLands(page, hostTestId, scrollTargetSelector, '3');
      });

      await test.step('4. scroll survival (half in/out)', async () => {
        const trace = await measureScrollSurvival(page, hostTestId, scrollTargetSelector, '1');
        const prematureHideIndex = trace.findIndex((entry, index) => {
          if (index === 0 || !entry.attached) return false;
          const previous = trace[index - 1];
          return previous.computedVisible && !entry.computedVisible && entry.top > 0 && entry.top < 900;
        });
        const stillInteractive = await assertInteractiveIfVisible(page, hostTestId, '1', trace);
        test.info().annotations.push({
          type: 'scroll-survival-measurement',
          description: JSON.stringify({
            variant,
            mode,
            prematureHideDetectedAtStep: prematureHideIndex === -1 ? null : prematureHideIndex,
            prematureHideTopPx: prematureHideIndex === -1 ? null : trace[prematureHideIndex]?.top,
            stillInteractiveAtLastVisibleStep: stillInteractive,
            trace,
          }),
        });
        // Soft: this is the exact comparison the go/no-go decision is made from — a
        // "failure" here for the content variant is expected, measured evidence, not
        // a defect in this throwaway harness.
        expect.soft(prematureHideIndex, `${variant}/${mode}: thread 1 should not go invisible while still inside the editor's visible pane`).toBe(-1);
      });

      if (mode !== 'single-pane') {
        await test.step('5. hidden-unchanged-region collapse/expand survival (thread 2)', async () => {
          const result = await assertHiddenRegionSurvival(page, hostTestId, '2');
          test.info().annotations.push({
            type: 'hidden-region-measurement',
            description: JSON.stringify({ variant, mode, ...result }),
          });
          expect(result.revealedVisible, `${variant}/${mode}: thread 2 must be interactive once hideUnchangedRegions is disabled`).toBe(true);
          expect(result.recoveredAfterRecollapse, `${variant}/${mode}: thread 2 must recover interactivity after a collapse->reveal round trip (same widget identity)`).toBe(true);
          expect.soft(result.collapsedVisible, `${variant}/${mode}: thread 2 interactive while its region is still collapsed (comparison point, not a hard requirement)`);
        });

        await test.step('6. paired Base/Head zone-height sync on growth', async () => {
          await assertPairedZoneHeightSync(page, '2');
        });
      }
    });
  }
}
