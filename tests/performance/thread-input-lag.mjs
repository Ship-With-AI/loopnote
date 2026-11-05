// THROWAWAY SPIKE SCRIPT — Plan 23-01 go/no-go decision only.
// Measures real input-to-paint lag (ms) for a single keystroke typed into the 25th of
// 30 simultaneous thread widgets, for both the content-widget and overlay-widget
// techniques, against a real Monaco diff editor in a real Chromium instance.
// Adapts the timestamp-delta bracketing technique from
// tests/performance/production-picker.mjs's performance.now() sampling (median of N
// trials) to the browser side, per RESEARCH.md's Supporting Stack table ("simpler
// keystroke-timestamp-delta ... already-proven fallback in repo for different (CLI
// startup) measurement, adaptable to browser input lag").
// Deleted once the decision is recorded (23-01-PLAN.md threat model T-23-01-01).
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const TRIALS_PER_VARIANT = 10;
const TARGET_LABEL = '25';
const HOST_TEST_ID = 'thread-spike-diff-host';

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

async function startPrototypeServer() {
  const server = await createServer({
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
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? '';
  return { server, origin };
}

async function measureOneKeystroke(page) {
  const textareaSelector = `[data-testid="${HOST_TEST_ID}"] textarea[aria-label="Thread ${TARGET_LABEL} body"]`;
  const marker = Math.random().toString(36).slice(2, 5);
  await page.evaluate((selector) => {
    document.querySelector(selector).value = '';
  }, textareaSelector);
  await page.locator(textareaSelector).click();

  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.type(marker[0]);
  const t1 = await page.evaluate(
    async ({ selector, character }) => {
      const textarea = document.querySelector(selector);
      const deadline = performance.now() + 2_000;
      while (!textarea.value.includes(character) && performance.now() < deadline) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
      return performance.now();
    },
    { selector: textareaSelector, character: marker[0] },
  );
  return t1 - t0;
}

async function measureVariant(page, variant) {
  await page.getByRole('button', { name: 'Threads: 30' }).click();
  await page.waitForFunction(() => window.__threadSpike?.threadCount === 30);
  await page.getByRole('button', { name: variant === 'content' ? 'Variant: Content widget' : 'Variant: Overlay widget' }).click();
  await page.waitForFunction((targetVariant) => window.__threadSpike?.variant === targetVariant, variant);
  // Disable hideUnchangedRegions so this is purely an input-lag measurement, not a
  // confound with the hidden-region visibility finding the e2e spec covers (check 5).
  await page.getByRole('button', { name: 'Context: All revealed' }).click();
  await page.waitForFunction(() => window.__threadSpike?.contextMode === 'all-revealed');

  await page.evaluate((threadId) => window.__threadSpike.revealThread(threadId), `thread-${TARGET_LABEL}`);
  await page.waitForTimeout(150);

  const samples = [];
  for (let trial = 0; trial < TRIALS_PER_VARIANT; trial += 1) {
    samples.push(await measureOneKeystroke(page));
  }
  return { variant, samples, medianMs: median(samples), p95Ms: percentile95(samples) };
}

async function main() {
  const { server, origin } = await startPrototypeServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/thread-widget-spike`);
    await page.waitForFunction(() => document.querySelector('[data-testid="thread-spike-render-status"]')?.textContent?.includes('Rendered real Monaco'));

    const results = [];
    for (const variant of ['content', 'overlay']) {
      results.push(await measureVariant(page, variant));
    }

    const report = {
      trialsPerVariant: TRIALS_PER_VARIANT,
      targetThreadLabel: TARGET_LABEL,
      threadCount: 30,
      results: results.map(({ variant, medianMs, p95Ms, samples }) => ({
        variant,
        medianMs: Math.round(medianMs * 100) / 100,
        p95Ms: Math.round(p95Ms * 100) / 100,
        samplesMs: samples.map((value) => Math.round(value * 100) / 100),
      })),
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
