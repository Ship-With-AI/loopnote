import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let serverUrl: string;

const harnessModule = `
import { createApp, h, ref } from 'vue';
import BottomPanel from '/components/workbench/BottomPanel.vue';
import '/styles.css';

export function mountReviewNotesHarness() {
  const open = ref(true);
  const summaryBuffer = ref('');
  createApp({
    render: () => h(BottomPanel, {
      open: open.value,
      comments: [],
      inventory: [],
      summary: '',
      summaryBuffer: summaryBuffer.value,
      revision: 7,
      commentBuffers: new Map(),
      pending: null,
      conflict: null,
      failure: null,
      retainedSummary: false,
      exportState: { phase: 'ready', pending: false, progress: null, failure: null, conflict: null, receipt: null, previousConfirmedReceipt: null, driftObservation: null, ignoreStatus: null, driftStale: false },
      appendIgnoreRule: async () => ({ kind: 'alreadyIgnored' }),
      refreshIgnoreStatus: async () => {},
      revealExportDirectory: async () => ({ kind: 'revealed' }),
      onClose: () => { open.value = false; },
      'onUpdate:summaryBuffer': (value) => { summaryBuffer.value = value; },
    }),
  }).mount('#review-notes-harness');
}
`;

test.beforeAll(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    plugins: [{
      name: 'review-notes-harness',
      resolveId: (id) => id === 'virtual:review-notes-harness' ? '\0review-notes-harness' : undefined,
      load: (id) => id === '\0review-notes-harness' ? harnessModule : undefined,
    }],
    server: { host: '127.0.0.1' },
  });
  await server.listen();
  serverUrl = server.resolvedUrls?.local[0] ?? '';
});

test.afterAll(async () => {
  await server.close();
});

test('Review panel owns the summary editor and closes via its close button', async ({ page }) => {
  await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="review-notes-harness"></div>';
    const { mountReviewNotesHarness } = await import(`/@id/${'virtual:review-notes-harness'}`);
    mountReviewNotesHarness();
  });

  const panel = page.getByRole('region', { name: 'Review', exact: true });
  await expect(panel.getByRole('region', { name: 'Summary Saved' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Edit' }).click();
  const summary = panel.getByLabel('Review summary (Markdown)');
  await summary.fill('Unsaved review note');
  await panel.getByRole('button', { name: 'Close panel' }).click();
  await expect(panel).toHaveCount(0);
});
