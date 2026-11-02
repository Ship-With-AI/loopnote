import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ReviewExportV1Schema } from '../../src/contracts/draft.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { canonicalizeReviewExport } from '../../src/export/review-export.js';
import { renderReviewMarkdown } from '../../src/export/render-review-markdown.js';
import { runGeneratedExport, runGeneratedRecovery, sampleGeneratedStablePair } from '../helpers/export-fault-runner.js';
import { createDirtyGitFixture } from '../helpers/git-fixture.js';
import { assertSourceControlUnchanged, captureSourceControlSnapshot } from '../helpers/source-control-snapshot.js';
import { createServer, type ViteDevServer } from 'vite';
import type { FinishReviewResult } from '../../src/contracts/api.js';

type AttachedLifecycle = 'waiting' | 'waitingDisconnected' | 'finishing' | 'completed' | 'retryableFailure' | 'terminalFailure';

type LifecycleHarnessContext = Readonly<{
  readonly isExactPatch?: boolean;
  readonly summaryBuffer?: string;
  readonly conflict?: Readonly<{
    readonly kind: 'revisionConflict';
    readonly expectedRevision: number;
    readonly actualRevision: number;
  }> | null;
}>;

declare global {
  var __setAttachedLifecycle: (
    next: AttachedLifecycle,
    nextResult?: FinishReviewResult,
    context?: LifecycleHarnessContext,
  ) => void;
}


let lifecycleServer: ViteDevServer;
let lifecycleUrl: string;

const lifecycleHarness = `
import { createApp, h, ref } from 'vue';
import ReviewNotesDialog from '/components/ReviewNotesDialog.vue';
import CommentComposer from '/components/CommentComposer.vue';
import '/styles.css';

export function mountLifecycleHarness() {
  const lifecycle = ref('waiting');
  const result = ref(undefined);
  const finished = ref(0);
  const isExactPatch = ref(false);
  const summaryBuffer = ref('');
  const conflict = ref(null);
  const composerMutations = ref(0);
  const exportState = {
    pending: false, progress: null, phase: 'ready', failure: null, conflict: null,
    receipt: null, previousConfirmedReceipt: null, driftObservation: null,
    ignoreStatus: null, driftStale: false,
  };
  createApp({
    render: () => h('main', [
 h(ReviewNotesDialog, {
 open: true,
 comments: [], inventory: [], summary: '', revision: 7, summaryBuffer: summaryBuffer.value,
        commentBuffers: new Map(), pending: null, conflict: conflict.value, failure: null,
        retainedSummary: false, exportState, appendIgnoreRule: async () => ({ kind: 'alreadyIgnored' }),
        refreshIgnoreStatus: async () => {}, revealExportDirectory: async () => ({ kind: 'revealed' }),
        attachedLifecycle: lifecycle.value, attachedReady: lifecycle.value === 'waiting',
        mutationLocked: lifecycle.value === 'finishing' || lifecycle.value === 'completed',
        attachedFailure: result.value, isExactPatch: isExactPatch.value,
        onFinishReview: () => { finished.value += 1; },
      }),
      h('section', { 'aria-label': 'Inline composer lock harness' }, [
        h(CommentComposer, {
          path: 'src/changed.ts', side: 'head', line: 2, text: 'Ready draft', status: 'ready',
          mutationsLocked: lifecycle.value === 'finishing' || lifecycle.value === 'completed',
          onAdd: () => { composerMutations.value += 1; },
          onCancel: () => { composerMutations.value += 1; },
          onUpdateText: () => { composerMutations.value += 1; },
        }),
        h(CommentComposer, {
          path: 'src/changed.ts', side: 'head', line: 3, text: 'Confirm draft', status: 'confirm-discard',
          mutationsLocked: lifecycle.value === 'finishing' || lifecycle.value === 'completed',
          onConfirmDiscard: () => { composerMutations.value += 1; },
          onKeepWriting: () => { composerMutations.value += 1; },
          onUpdateText: () => { composerMutations.value += 1; },
        }),
      ]),
      h('output', { id: 'finish-count' }, String(finished.value)),
      h('output', { id: 'composer-mutation-count' }, String(composerMutations.value)),
    ]),
  }).mount('#lifecycle-harness');
  globalThis.__setAttachedLifecycle = (next, nextResult, context = {}) => {
    lifecycle.value = next;
    result.value = nextResult;
    isExactPatch.value = context.isExactPatch ?? false;
    summaryBuffer.value = context.summaryBuffer ?? '';
    conflict.value = context.conflict ?? null;
  };
}
`;

test.beforeAll(async () => {
  lifecycleServer = await createServer({
    configFile: 'vite.config.ts',
    plugins: [{
      name: 'attached-lifecycle-harness',
      resolveId: (id) => id === 'virtual:attached-lifecycle-harness' ? '\\0attached-lifecycle-harness' : undefined,
      load: (id) => id === '\\0attached-lifecycle-harness' ? lifecycleHarness : undefined,
    }],
    server: { host: '127.0.0.1' },
  });
  await lifecycleServer.listen();
  lifecycleUrl = lifecycleServer.resolvedUrls?.local[0] ?? '';
  expect(lifecycleUrl).not.toBe('');
});

test.afterAll(async () => {
  await lifecycleServer.close();
});

function pair(summary: string): Readonly<{ readonly json: Buffer; readonly markdown: Buffer }> {
  const json = Buffer.from(canonicalizeReviewExport(ReviewExportV1Schema.parse({
    schemaVersion: 1,
    kind: `${RENAME_MAP.kindPrefix}/export`,
    exportedAt: '2026-07-23T00:00:00.000Z',
    acceptedDraftRevision: 1,
    comparison: {
      selectedBase: { label: 'main', launchOid: '1'.repeat(40) },
      selectedHead: { label: 'feature', launchOid: '2'.repeat(40) },
      mergeBaseOid: '1'.repeat(40),
      comparisonKey: '4'.repeat(64),
    },
    drift: {
      observedAt: '2026-07-23T00:00:00.000Z',
      acknowledged: false,
      base: { launchOid: '1'.repeat(40), currentOid: '1'.repeat(40), status: 'unchanged' },
      head: { launchOid: '2'.repeat(40), currentOid: '2'.repeat(40), status: 'unchanged' },
    },
    summary: { markdown: summary },
    files: [],
    counts: { all: 0, openActionable: 0, openNeedsAttention: 0, resolved: 0 },
  })));
  return Object.freeze({ json, markdown: Buffer.from(renderReviewMarkdown(json), 'utf8') });
}

test('forced unavailable capability refuses re-export before touching the complete old stable pair', async () => {
  const fixture = await createDirtyGitFixture();
  try {
    const before = await captureSourceControlSnapshot(fixture.root);
    const stable = join(fixture.root, '.cumpa', 'exports', `${'1'.repeat(40)}..${'2'.repeat(40)}`);
    const oldPair = pair('old generation');

    await expect(runGeneratedExport(fixture.root, oldPair, 'unsupported')).resolves.toMatchObject({ kind: 'exported' });
    const expected = Object.freeze({
      json: await readFile(join(stable, 'review.json')),
      markdown: await readFile(join(stable, 'review.md')),
    });
    await expect(runGeneratedExport(fixture.root, pair('new generation'), 'unsupported')).resolves.toEqual({ kind: 'reExportUnsupported' });
    await expect(sampleGeneratedStablePair(stable, 24)).resolves.toEqual(Array.from({ length: 24 }, () => expected));
    await expect(runGeneratedRecovery(fixture.root)).resolves.toEqual(expected);
    await expect(assertSourceControlUnchanged(before, await captureSourceControlSnapshot(fixture.root))).resolves.toBeUndefined();
  } finally {
    await fixture.cleanup();
  }
});

test('attached lifecycle renders waiting, progress, completion, and safe recovery actions', async ({ page }) => {
  await page.goto(lifecycleUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="lifecycle-harness"></div>';
    // Virtual Vite modules exist only after the test server starts.
    const { mountLifecycleHarness } = await import(`/@id/${'virtual:attached-lifecycle-harness'}`);
    mountLifecycleHarness();
  });

  const completion = page.getByRole('region', { name: 'Finish attached review' });
  const composerHarness = page.getByRole('region', { name: 'Inline composer lock harness' });
  const composerControls = composerHarness.locator('textarea, button');
  const expectComposerLocked = async () => {
    await expect(composerControls).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(composerControls.nth(index)).toBeDisabled();
    }
    await composerControls.evaluateAll((controls) => {
      controls.forEach((control) => (control as HTMLButtonElement | HTMLTextAreaElement).click());
    });
    await expect(page.locator('#composer-mutation-count')).toHaveText('0');
  };
  await expect(completion.getByText('Waiting', { exact: true })).toBeVisible();
  await expect(completion.getByText('The requesting agent is waiting. Only Finish review returns the accepted summary and comments. Exporting, closing, reloading, or disconnecting leaves this review unfinished.', { exact: true })).toBeVisible();
  await expect(completion.getByText('No feedback added', { exact: true })).toBeVisible();
  await expect(completion.getByText('This review has no accepted summary or comments. You can still finish and return an empty review result, or add feedback first.', { exact: true })).toBeVisible();
  await expect(composerHarness.getByRole('textbox', { name: 'Comment' }).first()).toBeEnabled();
  await expect(composerHarness.getByRole('button', { name: 'Add comment' })).toBeEnabled();
  await expect(composerHarness.getByRole('button', { name: 'Discard draft' }).first()).toBeEnabled();
  await expect(composerHarness.getByRole('button', { name: 'Keep writing' })).toBeEnabled();
  await completion.getByRole('button', { name: 'Finish review', exact: true }).click();
  await expect(page.locator('#finish-count')).toHaveText('1');

  await page.evaluate(() => globalThis.__setAttachedLifecycle('finishing'));
  await expect(completion.getByRole('button', { name: 'Finishing review…', exact: true })).toBeDisabled();
  await expect(completion.getByText('Validating accepted revision 7 and its recorded anchors…', { exact: true })).toHaveAttribute('role', 'status');
  await expectComposerLocked();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('completed'));
  await expect(completion.getByText('Review finished', { exact: true })).toBeFocused();
  await expect(completion.getByText('The accepted review was returned to the requesting agent from revision 7. You can close this tab.', { exact: true })).toBeVisible();
  await expectComposerLocked();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', {
    kind: 'staleAnchors', affectedCommentIds: [], affectedCount: 1,
  }));
  await expect(completion.getByRole('alert').getByText('Review can’t be finished', { exact: true })).toBeFocused();
  await expect(completion.getByText(`${RENAME_MAP.displayName} found stale or unavailable feedback anchors in the accepted review. Affected comments: 1. No feedback returned. Their recorded anchors remain unchanged and may not be actionable in exported feedback.`, { exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', {
    kind: 'revisionConflict', expectedRevision: 7, actualRevision: 8,
  }));
  await expect(completion.getByRole('alert').getByText('Review changed before finish', { exact: true })).toBeFocused();
  await expect(completion.getByText('Accepted revision 7 is no longer current. Latest revision is 8. No feedback was returned. Reload the latest review, check the comments and summary, then choose Finish review again.', { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Reload latest', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', { kind: 'scopeInvalid' }));
  await expect(completion.getByRole('alert').getByText('Reviewed content changed', { exact: true })).toBeFocused();
  await expect(completion.getByText('The submitted review scope no longer passes completion validation. No feedback returned. Relaunch agent request against valid content.', { exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', { kind: 'scopeInvalid' }, { isExactPatch: true }));
  await expect(completion.getByText('The submitted patch content no longer passes completion validation. No feedback returned. Relaunch agent request against valid content.', { exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', { kind: 'draftReadOnly' }));
  await expect(completion.getByRole('alert').getByText('Review draft can’t be validated', { exact: true })).toBeFocused();
  await expect(completion.getByText(`The accepted local draft is corrupt, incomplete, or read-only. No feedback was returned. Reload the review; if it remains unavailable, relaunch ${RENAME_MAP.displayName}.`, { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Reload review', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('retryableFailure', { kind: 'persistenceFailure' }));
  await expect(completion.getByRole('alert').getByText('Review was not finished', { exact: true })).toBeFocused();
  await expect(completion.getByText(`No feedback was returned. Check that ${RENAME_MAP.displayName} is still running, then try Finish review again.`, { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Try Finish review again', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('terminalFailure'));
  await expect(completion.getByRole('alert').getByText('Completion status unavailable', { exact: true })).toBeFocused();
  await expect(completion.getByText(`${RENAME_MAP.displayName} disconnected before this tab received confirmation. This tab does not claim the review was finished. Check the invoking terminal. If ${RENAME_MAP.displayName} is still running, reload to reconnect.`, { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('waitingDisconnected'));
  await expect(completion.getByRole('alert').getByText('Attached review disconnected', { exact: true })).toBeFocused();
  await expect(completion.getByText(`The browser lost its connection to ${RENAME_MAP.displayName}. This review is still unfinished. Reload this page while ${RENAME_MAP.displayName} is running, then choose Finish review.`, { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('waiting', undefined, { summaryBuffer: 'Unsaved summary' }));
  await expect(completion.getByText('Unsaved text must be reviewed', { exact: true })).toBeVisible();
  await expect(completion.getByText('Save or discard unsaved summary or comment text before finishing. The requesting agent only receives the accepted review.', { exact: true })).toBeVisible();
  await expect(completion.getByRole('button', { name: 'Review unsaved text', exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setAttachedLifecycle('waiting', undefined, {
    conflict: { kind: 'revisionConflict', expectedRevision: 7, actualRevision: 8 },
  }));
  await expect(completion.getByText('Review changed before finish', { exact: true })).toBeVisible();
  await expect(completion.getByText('Accepted revision 7 is no longer current. Latest revision is 8. No feedback was returned. Reload the latest review, check the comments and summary, then choose Finish review again.', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await page.evaluate(() => globalThis.__setAttachedLifecycle('waiting'));
  const finish = completion.getByRole('button', { name: 'Finish review', exact: true });
  await expect(finish).toBeVisible();
  expect((await finish.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 767, height: 720 });
  expect((await finish.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(finish).toBeVisible();
});
