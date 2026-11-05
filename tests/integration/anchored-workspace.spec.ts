import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import type {
  AnchorVerificationDto,
  ReviewDraftCommentV1,
} from '../../src/contracts/draft.js';


import { expect, test, type Page } from '@playwright/test';
import {
  DraftLoadResponseSchema,
  DraftMutationRequestSchema,
  DraftMutationResultSchema,
  type DraftMutationRequest,
  type SessionResponse,
} from '../../src/contracts/api.js';
import { createServer, type ViteDevServer } from 'vite';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { toCssRgb } from '../../src/web/theme/token-contract.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const canonicalTokens = canonicalRoot(repositoryRoot);
const toRootRgb = (token: string): string => toCssRgb(canonicalTokens, token);
const firstFileId = `file_${'a'.repeat(43)}`;
const secondFileId = `file_${'b'.repeat(43)}`;
const token = 't'.repeat(43);
let server: ViteDevServer | undefined;
let origin = '';
let canonicalComments: WorkspaceComment[] = [];
let contentRequests: string[] = [];
type DelayedMutationOutcome = 'accepted' | 'persistenceFailure' | 'revisionConflict';

type DelayedMutation = Readonly<{
  outcome: DelayedMutationOutcome;
  received: Promise<void>;
  release: () => void;
  notifyReceived: () => void;
  waitForRelease: () => Promise<void>;
}>;

type WorkspaceComment = ReviewDraftCommentV1 & Readonly<{
  verification?: AnchorVerificationDto;
}>;

let delayedMutation: DelayedMutation | undefined;

const collisionPath = (terminalByte: number) => ({
  bytesBase64url: Buffer.from([0x73, 0x72, 0x63, 0x2f, terminalByte, 0x2e, 0x74, 0x73]).toString('base64url'),
  display: 'src/�.ts',
});


const path = (display: string) => ({
  bytesBase64url: Buffer.from(display).toString('base64url'),
  display,
  utf8: display,
});

const firstText = Array.from({ length: 20 }, (_, index) =>
  index === 9 ? 'export const changed = 2;' : `const context${index + 1} = ${index + 1};`,
).join('\n');
const changedFirstText = firstText.replace('export const changed = 2;', 'export const changed = 3;');
const secondText = firstText.replace('export const changed = 2;', 'export const secondChanged = 2;');
const changedSecondText = secondText.replace('export const secondChanged = 2;', 'export const secondChanged = 3;');

let session: SessionResponse = {
  base: { label: 'base', oid: 'a'.repeat(40) },
  head: { label: 'head', oid: 'b'.repeat(40) },
  mergeBaseOid: 'c'.repeat(40),
  files: [
    {
      fileId: firstFileId,
      status: { kind: 'modified' },
      oldMode: '100644',
      newPath: path('src/first.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    },
    {
      fileId: secondFileId,
      status: { kind: 'modified' },
      oldMode: '100644',
      newPath: path('src/second.ts'),
      additions: 1,
      deletions: 1,
      availability: { kind: 'text' },
    },
  ],
};

function content(fileId: string) {
  const display = fileId === firstFileId ? 'src/first.ts' : 'src/second.ts';
  const [baseText, headText] = fileId === firstFileId
    ? [firstText, changedFirstText]
    : [secondText, changedSecondText];
  return {
    fileId,
    base: { exists: true, path: path(display), language: 'typescript', blobOid: 'd'.repeat(40), text: baseText },
    head: { exists: true, path: path(display), language: 'typescript', blobOid: 'e'.repeat(40), text: headText },
  };
}

function metadata(fileId: string) {
  const file = session.files.find((candidate) => candidate.fileId === fileId);
  return file === undefined ? undefined : { ...file, oldMode: '100644', newMode: '100644' };
}

function json(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

function draftSnapshot(comments: readonly WorkspaceComment[]) {
  return {
    schemaVersion: 1,
    comparison: {
      baseCommitOid: 'a'.repeat(40),
      headCommitOid: 'b'.repeat(40),
      mergeBaseOid: 'c'.repeat(40),
    },
    revision: comments.length,
    summary: '',
    comments,
  };
}

function draftView(comments: readonly WorkspaceComment[]) {
  const draft = draftSnapshot(comments);
  return {
    ...draft,
    comments: draft.comments.map((comment) => ({
      ...comment,
      verification: 'verification' in comment
        ? comment.verification
        : { state: 'verified', reason: 'exact-match' },
    })),
  };
}

function draftLoad(comments: readonly WorkspaceComment[]) {
  return DraftLoadResponseSchema.parse({
    kind: 'current',
    path: `${RENAME_MAP.repoStateDir}drafts/anchored-workspace.json`,
    draft: draftView(comments),
  });
}

function isDeleteCommentMutation(
  mutation: DraftMutationRequest,
): mutation is Extract<DraftMutationRequest, Readonly<{ type: 'deleteComment' }>> {
  return mutation.type === 'deleteComment';
}

function delayNextMutation(outcome: DelayedMutationOutcome): DelayedMutation {
  const received = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const delayed: DelayedMutation = {
    outcome,
    received: received.promise,
    release: released.resolve,
    notifyReceived: received.resolve,
    waitForRelease: () => released.promise,
  };
  delayedMutation = delayed;
  return delayed;
}

function resetAsyncSettlementFixture(): void {
  session = {
    ...session,
    files: session.files.map((file) => ({
      ...file,
      newPath: path(file.fileId === firstFileId ? 'src/first.ts' : 'src/second.ts'),
    })),
  };
  canonicalComments = [];
  contentRequests = [];
  delayedMutation = undefined;
}

async function startAppServer(): Promise<string> {
  server = await createServer({
    configFile: resolve(repositoryRoot, 'vite.config.ts'),
    plugins: [{
      name: 'anchored-workspace-api',
      configureServer(viteServer) {
        viteServer.middlewares.use('/api/session', (_request, response) => json(response, session));
        viteServer.middlewares.use('/api/draft/mutations', (request, response) => {
          let rawBody = '';
          request.on('data', (chunk) => { rawBody += String(chunk); });
          request.on('end', async () => {
            let input: unknown;
            try {
              input = JSON.parse(rawBody);
            } catch {
              response.statusCode = 400;
              response.end();
              return;
            }
            const mutation = DraftMutationRequestSchema.safeParse(input);
            if (!mutation.success) {
              response.statusCode = 400;
              response.end();
              return;
            }

            const request = mutation.data;

            const delayed = delayedMutation;
            if (delayed !== undefined) {
              delayedMutation = undefined;
              delayed.notifyReceived();
              await delayed.waitForRelease();
            }

            const latest = draftSnapshot(canonicalComments);
            if (delayed?.outcome === 'revisionConflict') {
              const conflictLatest = latest;
              json(response, DraftMutationResultSchema.parse({
                kind: 'revisionConflict',
                expectedRevision: mutation.data.expectedRevision,
                actualRevision: conflictLatest.revision,
                latest: conflictLatest,
              }), 409);
              return;
            }
            if (delayed?.outcome === 'persistenceFailure') {
              json(response, DraftMutationResultSchema.parse({ kind: 'persistenceFailure' }), 500);
              return;
            }

            if (mutation.data.expectedRevision !== latest.revision) {
              json(response, DraftMutationResultSchema.parse({
                kind: 'revisionConflict',
                expectedRevision: mutation.data.expectedRevision,
                actualRevision: latest.revision,
                latest,
              }), 409);
              return;
            }

            if (isDeleteCommentMutation(request)) {
              canonicalComments = canonicalComments.filter(
                (comment) => typeof comment !== 'object' || comment === null || !('id' in comment) || comment.id !== request.commentId,
              );
              json(response, DraftMutationResultSchema.parse({
                kind: 'accepted',
                draft: draftSnapshot(canonicalComments),
              }), 201);
              return;
            }

            if (mutation.data.type !== 'addComment') {
              response.statusCode = 400;
              response.end();
              return;
            }

            const accepted = {
              id: 'comment_123e4567-e89b-12d3-a456-426614174000',
              state: 'open' as const,
              body: mutation.data.body,
              anchor: {
                version: 'durable-anchor-v1' as const,
                path: path(mutation.data.fileId === firstFileId ? 'src/first.ts' : 'src/second.ts'),
                safeDisplayPath: mutation.data.fileId === firstFileId ? 'src/first.ts' : 'src/second.ts',
                side: mutation.data.side,
                line: mutation.data.line,
                blobOid: 'd'.repeat(40),
                selectedText: 'const context1 = 1;',
                context: { before: [], target: { line: mutation.data.line, text: 'const context1 = 1;' }, after: [] },
                contextHash: { algorithm: 'sha256-v1' as const, value: 'f'.repeat(64) },
                uniqueKey: 'e'.repeat(64),
              },
              createdAt: '2026-07-21T00:00:00.000Z',
              updatedAt: '2026-07-21T00:00:00.000Z',
            };
            canonicalComments = [...canonicalComments, accepted];
            json(response, DraftMutationResultSchema.parse({
              kind: 'accepted',
              draft: draftSnapshot(canonicalComments),
            }), 201);
          });
        });
        viteServer.middlewares.use('/api/draft', (_request, response) => json(response, draftLoad(canonicalComments)));
        viteServer.middlewares.use('/api/files', (request, response) => {
          const fileId = request.url?.match(/^\/(file_[A-Za-z0-9_-]{43})(?:\/content)?$/)?.[1];
          if (fileId !== firstFileId && fileId !== secondFileId) {
            response.statusCode = 404;
            response.end();
            return;
          }
          if (request.url?.endsWith('/content') === true) {
            contentRequests.push(fileId);
            json(response, content(fileId));
            return;
          }
          json(response, metadata(fileId));
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  return server.resolvedUrls?.local[0] ?? '';
}

async function openReview(page: Page, expectedPath = 'src/first.ts', resumeAttempt?: number): Promise<void> {
  const entries: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') entries.push(message.text());
  });
  page.on('pageerror', (error) => entries.push(error.message));
  const resumeQuery = resumeAttempt === undefined ? '' : `?resume=${resumeAttempt}`;
  await page.goto(`${origin}${resumeQuery}#token=${token}`);
  await expect(page.getByRole('heading', { level: 1, name: expectedPath })).toBeVisible();
  await expect(page.locator('.monaco-diff-editor')).toBeVisible();
  expect(entries).toEqual([]);
}

async function hoverMonacoLine(page: Page, side: 'base' | 'head', text: string): Promise<void> {
  const editor = side === 'base' ? 'original' : 'modified';
  const line = page.locator(`.monaco-diff-editor .${editor} .view-line`).filter({ hasText: text });
  let bounds: { height: number; width: number; x: number; y: number } | undefined;
  await expect.poll(async () => {
    bounds = await line.evaluateAll((elements) => elements
      .map((element) => {
        const { height, width, x, y } = element.getBoundingClientRect();
        return { height, width, x, y };
      })
      .find(({ height, width }) => height > 0 && width > 0));
    return bounds !== undefined;
  }).toBe(true);
  await page.mouse.move(bounds!.x + 20, bounds!.y + 9);
}

type GeometryRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type ScrollGeometry = Readonly<{
  clientHeight: number;
  clientWidth: number;
  rect: GeometryRect;
  scrollHeight: number;
  scrollWidth: number;
}>;

type MonacoGeometry = Readonly<{
  action: GeometryRect | null;
  codeOrigin: Readonly<{ tokenX: number; viewLineX: number; lineHeight: number }> | null;
  diffCanvas: ScrollGeometry | null;
  diffViewport: ScrollGeometry | null;
  document: Readonly<{ clientWidth: number; scrollWidth: number }>;
  gutters: readonly number[];
  panes: readonly GeometryRect[];
  reviewMain: ScrollGeometry | null;
  reviewShell: ScrollGeometry | null;
  sashes: readonly GeometryRect[];
  scrollOwners: readonly Readonly<{ clientHeight: number; clientWidth: number; scrollHeight: number; scrollWidth: number }>[];
  zones: readonly GeometryRect[];
}>;

async function readMonacoGeometry(page: Page, targetText: string): Promise<MonacoGeometry> {
  return page.evaluate<MonacoGeometry, string>((text) => {
    const canvasBounds = document.querySelector('.diff-workspace__canvas')?.getBoundingClientRect();
    const rawRect = (element: Element | null): GeometryRect | null => {
      if (element === null) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { height, width, x, y };
    };
    const rect = (element: Element | null): GeometryRect | null => {
      const bounds = rawRect(element);
      if (bounds === null) return null;
      return {
        height: bounds.height,
        width: bounds.width,
        x: bounds.x - (canvasBounds?.x ?? 0),
        y: bounds.y - (canvasBounds?.y ?? 0),
      };
    };
    const scrollDimensions = (element: HTMLElement) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    });
    const scrollGeometry = (element: HTMLElement | null): ScrollGeometry | null => {
      if (element === null) return null;
      const bounds = rawRect(element);
      if (bounds === null) return null;
      return { ...scrollDimensions(element), rect: bounds };
    };
    const action = document.querySelector('.diff-workspace__gutter-action');
    const actionBounds = action?.getBoundingClientRect();
    const actionRect = rect(action);
    const visibleLines = [...document.querySelectorAll('.monaco-diff-editor .modified .view-line')]
      .filter((element) => element.getBoundingClientRect().height > 0);
    const line = visibleLines.find((element) => {
      const bounds = element.getBoundingClientRect();
      return actionBounds !== undefined
        && actionBounds.y + actionBounds.height / 2 >= bounds.y
        && actionBounds.y + actionBounds.height / 2 <= bounds.y + bounds.height;
    }) ?? visibleLines.find(
      (element) => element.textContent?.includes(text) || (element as HTMLElement).innerText.includes(text),
    ) ?? visibleLines[0];
    const lineRect = rect(line ?? null);
    const tokenRect = rect(line?.querySelector('span') ?? null);
    const reviewMain = document.querySelector<HTMLElement>('.workbench-shell__main');
    const reviewShell = document.querySelector<HTMLElement>('.workbench-shell__body');
    const diffViewport = document.querySelector<HTMLElement>('.diff-workspace__viewport');
    const diffCanvas = document.querySelector<HTMLElement>('.diff-workspace__canvas');
    return {
      action: actionRect,
      codeOrigin: lineRect === null || tokenRect === null
        ? null
        : { tokenX: tokenRect.x, viewLineX: lineRect.x, lineHeight: lineRect.height },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      gutters: [...document.querySelectorAll('.monaco-diff-editor .margin')]
        .map((element) => element.getBoundingClientRect().width),
      panes: [...document.querySelectorAll('.monaco-diff-pane--base, .monaco-diff-pane--head')]
        .map((element) => rect(element)).filter((value): value is GeometryRect => value !== null),
      diffCanvas: scrollGeometry(diffCanvas),
      diffViewport: scrollGeometry(diffViewport),
      reviewMain: scrollGeometry(reviewMain),
      reviewShell: scrollGeometry(reviewShell),
      sashes: [...document.querySelectorAll('.monaco-diff-editor .monaco-sash')]
        .map((element) => rect(element)).filter((value): value is GeometryRect => value !== null
          && value.width > 0 && value.height > 0),
      scrollOwners: [...document.querySelectorAll<HTMLElement>('.monaco-diff-editor .monaco-scrollable-element')]
        .map(scrollDimensions),
      zones: [...document.querySelectorAll('.monaco-anchor-zone')]
        .map((element) => rect(element)).filter((value): value is GeometryRect => value !== null),
    };
  }, targetText);
}

function expectAnchoringNotToReflow(before: MonacoGeometry, anchored: MonacoGeometry): void {
  expect(anchored.codeOrigin).toEqual(before.codeOrigin);
  expect(anchored.gutters).toEqual(before.gutters);
  expect(anchored.panes).toEqual(before.panes);
  expect(anchored.sashes).toEqual(before.sashes);
  expect(anchored.document).toEqual(before.document);
  expect(anchored.reviewMain).toMatchObject(before.reviewMain ?? {});
  expect(anchored.scrollOwners.map(({ clientHeight, clientWidth, scrollWidth }) => ({ clientHeight, clientWidth, scrollWidth })))
    .toEqual(before.scrollOwners.map(({ clientHeight, clientWidth, scrollWidth }) => ({ clientHeight, clientWidth, scrollWidth })));
  expect(anchored.document.scrollWidth).toBeLessThanOrEqual(anchored.document.clientWidth);
}

function expectConversationCardNotToReflow(before: MonacoGeometry, anchored: MonacoGeometry): void {
  expect(anchored.codeOrigin).toEqual(before.codeOrigin);
  expect(anchored.gutters).toEqual(before.gutters);
  expect(anchored.panes).toEqual(before.panes);
  expect(anchored.sashes).toEqual(before.sashes);
  expect(anchored.document).toEqual(before.document);
  expect(anchored.reviewMain).toMatchObject(before.reviewMain ?? {});
  expect(anchored.scrollOwners.map(({ clientHeight, clientWidth, scrollWidth }) => ({ clientHeight, clientWidth, scrollWidth })))
    .toEqual(before.scrollOwners.map(({ clientHeight, clientWidth, scrollWidth }) => ({ clientHeight, clientWidth, scrollWidth })));
  expect(anchored.document.scrollWidth).toBeLessThanOrEqual(anchored.document.clientWidth);
}


test.beforeAll(async () => {
  origin = await startAppServer();
});

test.afterAll(async () => {
  await server?.close();
});

test('diff navigation and session state', async ({ page }) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await openReview(page);
  await expect(page.getByRole('button', { name: 'Previous file' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next file' })).toBeEnabled();
  await expect(page.getByText(/Unchanged regions begin collapsed/)).toBeVisible();

  const selectedFile = page.locator('[role="treeitem"][aria-selected="true"]');
  await expect(page.getByRole('heading', { level: 1, name: 'src/first.ts' })).toBeVisible();
  await expect(selectedFile).toHaveCount(1);

  await page.getByRole('button', { name: 'Next file' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
  await expect(selectedFile).toHaveCount(1);

  await page.getByRole('button', { name: 'Previous file' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'src/first.ts' })).toBeVisible();
  await expect(selectedFile).toHaveCount(1);


  await page.setViewportSize({ width: 640, height: 700 });
  const narrowGeometry = await readMonacoGeometry(page, 'export const changed = 3;');
  expect(narrowGeometry.document.scrollWidth).toBeLessThanOrEqual(narrowGeometry.document.clientWidth);
  expect(narrowGeometry.reviewShell).not.toBeNull();
  expect(narrowGeometry.reviewMain).not.toBeNull();
  if (narrowGeometry.reviewShell === null || narrowGeometry.reviewMain === null) {
    throw new Error('Expected rendered review shell and main geometry.');
  }
  expect(narrowGeometry.reviewMain.rect.width).toBeLessThanOrEqual(narrowGeometry.reviewShell.rect.width + 1);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('Download the Vue Devtools extension'))).toEqual([]);
});

test('Phase 07 header and control states', async ({ page }) => {
  resetAsyncSettlementFixture();
  session = {
    ...session,
    files: session.files.map((file) => file.fileId === firstFileId
      ? {
        ...file,
        status: { kind: 'renamed' },
        oldPath: path('src/old/first.ts'),
        newPath: path('src/new/first.ts'),
      }
      : file),
  };

  try {
    await page.goto(`${origin}#token=${token}`);
    await expect(page.locator('.monaco-diff-editor')).toBeVisible();

    const header = page.locator('.editor-title');
    await expect(header).toHaveCount(1);
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toHaveCount(1);
    await expect(page.getByRole('banner')).toContainText(new RegExp('HEAD\\s*headbbbbbbb'));
    await expect(page.getByRole('heading', {
      level: 1,
      name: 'renamed from src/old/first.ts to src/new/first.ts',
    })).toBeVisible();
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toHaveAttribute('title', 'src/new/first.ts');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading .path-display__old .path-text__filename`)).toHaveText('first.ts');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading .path-display__new .path-text__filename`)).toHaveText('first.ts');

    const previousFile = page.getByRole('button', { name: 'Previous file', exact: true });
    const nextFile = page.getByRole('button', { name: 'Next file', exact: true });
    const previousChange = page.getByRole('button', { name: 'Previous change', exact: true });
    const nextChange = page.getByRole('button', { name: 'Next change', exact: true });

    await expect(previousFile).toBeDisabled();
    await expect(nextFile).toBeEnabled();
    await expect(previousChange).toBeEnabled();
    await expect(nextChange).toBeEnabled();

    for (const control of [previousFile, nextFile, previousChange, nextChange]) {
      await expect(control).toHaveClass(/ui-button--icon/);
      await expect(control).toHaveJSProperty('offsetWidth', 32);
      await expect(control).toHaveJSProperty('offsetHeight', 32);
    }

    await nextFile.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Next file · Alt+↓');
    const restBounds = await nextFile.boundingBox();
    const disabledBackground = await previousFile.evaluate((element) => getComputedStyle(element).backgroundColor);
    await previousFile.hover({ force: true });
    expect(await previousFile.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(disabledBackground);
    expect(await nextFile.boundingBox()).toEqual(restBounds);


    for (const width of [1440, 1280, 1100, 768, 640]) {
      await page.setViewportSize({ width, height: 700 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
        .toBe(true);
    }
    await expect(page.getByRole('button', { name: 'Open files', exact: true })).toBeVisible();
  } finally {
    resetAsyncSettlementFixture();
  }
});

test('inline comment persistence', async ({ page }) => {
  await openReview(page);
  await hoverMonacoLine(page, 'head', 'export const changed = 3;');
  await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
  const textarea = page.locator('.monaco-anchor-zone--composer textarea');
  await expect(textarea).toBeVisible();
  await textarea.fill('Please explain this context.');
  await textarea.blur();
  await expect(textarea).toHaveValue('Please explain this context.');
  const accepted = page.waitForResponse((candidate) => candidate.url().includes('/api/draft/mutations'));
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
  expect((await accepted).status()).toBe(201);
  await expect(page.locator('.monaco-anchor-zone--composer .inline-accepted-comment')).toHaveCount(1);
});

test('Phase 07 inline conversation states', async ({ page }) => {
  resetAsyncSettlementFixture();
  const targetText = 'export const changed = 3;';
  const retainedText = `Keep this long accepted comment ${'without-losing-words while proving the paired Monaco zone contains every rendered line. '.repeat(120)}after the failed save.`;
  const resolvedText = 'A separately saved resolved comment.';
  canonicalComments = [{
    id: 'comment_223e4567-e89b-12d3-a456-426614174000',
    state: 'resolved',
    body: resolvedText,
    anchor: {
      version: 'durable-anchor-v1',
      path: path('src/first.ts'),
      safeDisplayPath: 'src/first.ts',
      side: 'head',
      line: 11,
      blobOid: 'd'.repeat(40),
      selectedText: 'const context11 = 11;',
      context: { before: [], target: { line: 11, text: 'const context11 = 11;' }, after: [] },
      contextHash: { algorithm: 'sha256-v1', value: 'f'.repeat(64) },
      uniqueKey: '1'.repeat(64),
    },
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    resolvedAt: '2026-07-21T00:00:00.000Z',
  }];

  await page.setViewportSize({ width: 1280, height: 760 });
  await openReview(page);
  await hoverMonacoLine(page, 'head', targetText);
  const before = await readMonacoGeometry(page, targetText);
  await page.getByRole('button', { name: 'Add comment to head line 10' }).click({ force: true });

  const composer = page.locator('.monaco-anchor-zone--composer .inline-comment-composer');
  const textarea = composer.locator('textarea');
  await expect(composer).toHaveClass(/conversation-card/);
  await expect(composer.getByText('Fixed anchor', { exact: true })).toBeVisible();
  await expect(composer).toContainText('src/first.ts · Head line 10');
  await expect(textarea).toHaveAttribute('aria-label', 'Comment');
  await expect(textarea).toHaveAttribute('aria-describedby', /comment-support-head-10/);
  await expect(composer.locator('.conversation-card__header')).toBeVisible();
  await expect(composer.locator('.conversation-card__body')).toBeVisible();
  await expect(composer.locator('.conversation-card__support')).toBeVisible();
  await expect(composer.locator('.conversation-card__footer')).toBeVisible();

  const ready = await readMonacoGeometry(page, targetText);
  expectConversationCardNotToReflow(before, ready);
  expect(ready.zones).toHaveLength(2);
  expect(Math.abs(ready.zones[0]!.y - ready.zones[1]!.y)).toBeLessThanOrEqual(1);
  expect(ready.zones[0]!.height).toBe(ready.zones[1]!.height);

  await composer.locator('button').filter({ hasText: 'Add comment' }).click();
  await expect(composer.locator('[role="alert"]')).toHaveText('Write a comment before adding it.');
  await expect(textarea).toHaveAttribute('aria-describedby', /comment-feedback-head-10/);

  const delayedFailure = delayNextMutation('persistenceFailure');
  const failureResponse = page.waitForResponse((candidate) =>
    candidate.url().includes('/api/draft/mutations')
      && candidate.request().postData()?.includes(retainedText) === true);
  await textarea.fill(retainedText);
  await composer.locator('button').filter({ hasText: 'Add comment' }).click();
  await delayedFailure.received;
  await expect(composer).toHaveAttribute('aria-busy', 'true');
  const pendingButton = composer.locator('button').filter({ hasText: 'Adding comment…' });
  await expect(pendingButton).toBeDisabled();
  await expect(pendingButton).toHaveAttribute('aria-busy', 'true');
  await expect(composer.locator('.ui-spinner[aria-hidden="true"]')).toHaveCount(1);
  const pending = await readMonacoGeometry(page, targetText);
  expectConversationCardNotToReflow(before, pending);
  expect(Math.abs(pending.zones[0]!.y - pending.zones[1]!.y)).toBeLessThanOrEqual(1);
  expect(pending.zones[0]!.height).toBe(pending.zones[1]!.height);
  delayedFailure.release();
  expect((await failureResponse).status()).toBe(500);
  await expect(composer.locator('[role="alert"]')).toHaveText(
    `Comment wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`,
  );
  await expect(textarea).toHaveValue(retainedText);
  await expect(composer).not.toHaveAttribute('aria-busy', 'true');

  await composer.locator('.conversation-card__footer > .conversation-card__actions > .ui-button--destructive').click();
  await textarea.focus();
  await page.keyboard.press('Escape');
  await expect(textarea).toHaveValue(retainedText);
  await expect(textarea).toBeFocused();

  const acceptedResponse = page.waitForResponse((candidate) =>
    candidate.url().includes('/api/draft/mutations')
      && candidate.request().postData()?.includes(retainedText) === true);
  await composer.locator('button').filter({ hasText: 'Add comment' }).click();
  expect((await acceptedResponse).status()).toBe(201);
  const inlineAccepted = page.locator('.monaco-anchor-zone--composer .inline-accepted-comment');
  const acceptedHeading = inlineAccepted.locator('h3.conversation-card__identity');
  await expect(inlineAccepted).toHaveCount(1);
  await expect(acceptedHeading).toHaveText('src/first.ts · Head · line 10');
  await expect(acceptedHeading).toBeFocused();
  await expect(inlineAccepted.getByText('Open', { exact: true })).toBeVisible();
  await expect(inlineAccepted.getByText('Verified', { exact: true })).toBeVisible();
  await expect(inlineAccepted.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(inlineAccepted.locator('.review-state-badge svg[aria-hidden="true"]')).toHaveCount(2);
  await expect(page.locator('.monaco-anchor-zone--composer')).toHaveCount(1);
  await expect(page.locator('.monaco-anchor-zone--spacer')).toHaveCount(1);
  await expect.poll(async () => await page.evaluate(() => {
    const composerZone = document.querySelector('.monaco-anchor-zone--composer');
    const spacerZone = document.querySelector('.monaco-anchor-zone--spacer');
    if (composerZone === null || spacerZone === null) return false;
    const composerRect = composerZone.getBoundingClientRect();
    const spacerRect = spacerZone.getBoundingClientRect();
    return Math.abs(composerRect.top - spacerRect.top) <= 1 && composerRect.height === spacerRect.height;
  })).toBe(true);
  const acceptedGeometry = await page.evaluate(() => {
    const rect = (element: Element): DOMRect => element.getBoundingClientRect();
    const card = document.querySelector('.monaco-anchor-zone--composer .inline-accepted-comment');
    const composerZone = document.querySelector('.monaco-anchor-zone--composer');
    const spacerZone = document.querySelector('.monaco-anchor-zone--spacer');
    if (card === null || composerZone === null || spacerZone === null) {
      return null;
    }
    const cardRect = rect(card);
    const composerRect = rect(composerZone);
    const spacerRect = rect(spacerZone);
    const nextCode = [...document.querySelectorAll('.monaco-diff-editor .modified .view-line')]
      .map(rect)
      .filter((line) => line.height > 0 && line.top >= composerRect.bottom - 1)
      .sort((left, right) => left.top - right.top)[0] ?? null;
    return {
      cardHeight: (card as HTMLElement).scrollHeight,
      cardBottom: cardRect.bottom,
      composerBottom: composerRect.bottom,
      composerHeight: composerRect.height,
      spacerHeight: spacerRect.height,
      zoneTopDelta: Math.abs(composerRect.top - spacerRect.top),
      nextCodeTop: nextCode?.top ?? null,
    };
  });
  if (acceptedGeometry === null) throw new Error('expected accepted comment geometry');
  expect(acceptedGeometry.cardHeight).toBeGreaterThan(280);
  expect(acceptedGeometry.zoneTopDelta).toBeLessThanOrEqual(1);
  expect(acceptedGeometry.composerHeight).toBe(acceptedGeometry.spacerHeight);
  expect(acceptedGeometry.cardBottom).toBeLessThanOrEqual(acceptedGeometry.composerBottom + 1);
  expect(acceptedGeometry.nextCodeTop).not.toBeNull();
  expect(acceptedGeometry.nextCodeTop).toBeGreaterThanOrEqual(acceptedGeometry.composerBottom - 1);
  expect(acceptedGeometry.nextCodeTop).toBeGreaterThanOrEqual(acceptedGeometry.cardBottom - 1);

  await expect(inlineAccepted.getByText('Verified', { exact: true })).toBeVisible();

  const restored = await readMonacoGeometry(page, targetText);
  expectConversationCardNotToReflow(before, restored);
  expect(Math.abs(restored.zones[0]!.y - restored.zones[1]!.y)).toBeLessThanOrEqual(1);
  expect(restored.zones[0]!.height).toBe(restored.zones[1]!.height);
});


test('draft resume and anchor states', async ({ page }) => {
  canonicalComments = [{
    id: 'comment_123e4567-e89b-12d3-a456-426614174000',
    state: 'open',
    body: 'Please explain this context.',
    anchor: {
      version: 'durable-anchor-v1',
      path: path('src/first.ts'),
      safeDisplayPath: 'src/first.ts',
      side: 'head',
      line: 10,
      blobOid: 'd'.repeat(40),
      selectedText: 'export const changed = 2;',
      context: { before: [], target: { line: 10, text: 'export const changed = 2;' }, after: [] },
      contextHash: { algorithm: 'sha256-v1', value: 'f'.repeat(64) },
      uniqueKey: '0'.repeat(64),
    },
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  }];

  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`${origin}#token=${token}`);
  await expect(page.locator('.session-shell > .visually-hidden[aria-live="polite"]')).toHaveText(
    'Local draft resumed. Accepted comments for this pinned comparison are ready.',
  );
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('Download the Vue Devtools extension'))).toEqual([]);
});

test('exact-byte draft resume', async ({ page }) => {
  const firstPath = collisionPath(0xff);
  const secondPath = collisionPath(0xfe);

  let resumeAttempt = 0;
  for (const { paths, anchorPath } of [
    { paths: [firstPath, secondPath], anchorPath: secondPath },
    { paths: [secondPath, firstPath], anchorPath: firstPath },
  ] as const) {
    session = {
      ...session,
      files: session.files.map((file, index) => ({ ...file, newPath: paths[index]! })),
    };
    canonicalComments = [{
      id: 'comment_123e4567-e89b-12d3-a456-426614174000',
      state: 'open',
      body: 'Restore the second exact-byte path.',
      anchor: {
        version: 'durable-anchor-v1',
        path: anchorPath,
        safeDisplayPath: anchorPath.display,
        side: 'head',
        line: 1,
        blobOid: 'd'.repeat(40),
        selectedText: 'const context1 = 1;',
        context: { before: [], target: { line: 1, text: 'const context1 = 1;' }, after: [] },
        contextHash: { algorithm: 'sha256-v1', value: 'f'.repeat(64) },
        uniqueKey: 'e'.repeat(64),
      },
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
      verification: { state: 'verified', reason: 'exact-match' },
    }];
    await openReview(page, 'src/�.ts', resumeAttempt++);
    const resumedDraft = await page.evaluate(async () => (await fetch('/api/draft')).json());
    expect(JSON.stringify(resumedDraft)).toContain('Restore the second exact-byte path.');
  }
});

test('anchored gap closure', async ({ page }) => {
  session = {
    ...session,
    files: session.files.map((file) => ({
      ...file,
      newPath: path(file.fileId === firstFileId ? 'src/first.ts' : 'src/second.ts'),
    })),
  };
  canonicalComments = [
    {
      id: 'comment_11111111-1111-4111-8111-111111111111',
      state: 'open',
      body: 'Stale comment stays attached to its recorded anchor.',
      anchor: {
        version: 'durable-anchor-v1',
        path: path('src/first.ts'),
        safeDisplayPath: 'src/first.ts',
        side: 'head',
        line: 10,
        blobOid: 'd'.repeat(40),
        selectedText: 'export const changed = 2;',
        context: { before: [], target: { line: 10, text: 'export const changed = 2;' }, after: [] },
        contextHash: { algorithm: 'sha256-v1', value: 'f'.repeat(64) },
        uniqueKey: 'e'.repeat(64),
      },
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
      verification: { state: 'stale', reason: 'anchor-mismatch' },
    },
    {
      id: 'comment_22222222-2222-4222-8222-222222222222',
      state: 'open',
      body: 'Orphan comment preserves its exact bytes.',
      anchor: {
        version: 'durable-anchor-v1',
        path: path('src/deleted.ts'),
        safeDisplayPath: 'src/deleted.ts',
        side: 'head',
        line: 8,
        blobOid: '0'.repeat(40),
        selectedText: 'const context8 = 8;',
        context: { before: [], target: { line: 8, text: 'const context8 = 8;' }, after: [] },
        contextHash: { algorithm: 'sha256-v1', value: 'a'.repeat(64) },
        uniqueKey: 'b'.repeat(64),
      },
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
      verification: { state: 'orphaned', reason: 'anchor-unavailable' },
    },
  ];
  canonicalComments.push({
    ...canonicalComments[0]!,
    id: 'comment_33333333-3333-4333-8333-333333333333',
    state: 'resolved',
    resolvedAt: '2026-07-21T00:01:00.000Z',
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await openReview(page);

  const staleNotice = page.getByRole('complementary', {
    name: 'Some saved comment anchors cannot be verified',
  });
  await expect(staleNotice).toBeVisible();
  await expect(staleNotice).not.toHaveAttribute('role');
  await expect(staleNotice).toContainText('Their recorded anchors are unchanged and may not be actionable in exported feedback.');
  await page.setViewportSize({ width: 1200, height: 1100 });
  const staleComment = page.locator('[data-comment-id="comment_11111111-1111-4111-8111-111111111111"]');
  const orphanComment = page.locator('[data-comment-id="comment_22222222-2222-4222-8222-222222222222"]');

  await hoverMonacoLine(page, 'head', 'export const changed = 3;');
  await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
  const composer = page.locator('.monaco-anchor-zone--composer textarea');
  await expect(composer).toBeFocused();
  await composer.fill('Keep this draft while moving.');
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Discard draft' }).click();
  await expect(page.locator('.inline-comment-composer__confirm')).toBeVisible();
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Keep writing' }).click();
  await expect(composer).toHaveValue('Keep this draft while moving.');
  await hoverMonacoLine(page, 'head', 'const context11 = 11;');
  await page.getByRole('button', { name: 'Add comment to head line 11' }).click();
  await expect(page.locator('.inline-comment-composer__confirm')).toBeVisible();
  await expect(composer).toHaveValue('Keep this draft while moving.');
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Keep writing' }).click();
  await expect(composer).toHaveValue('Keep this draft while moving.');

  await hoverMonacoLine(page, 'head', 'const context11 = 11;');
  await page.getByRole('button', { name: 'Add comment to head line 11' }).click();
  await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Discard draft' }).click();
  const movedComposer = page.locator('.modified .monaco-anchor-zone--composer textarea');
  await expect(movedComposer).toBeFocused();
  await expect(movedComposer).toHaveValue('');

  await page.setViewportSize({ width: 1200, height: 900 });

  await page.setViewportSize({ width: 760, height: 900 });
  const filesToggle = page.getByRole('button', { name: 'Open files', exact: true });
  const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
  await filesToggle.click();
  await expect(changedFiles).toBeVisible();
  await expect(changedFiles.locator('[role="treeitem"][tabindex="0"], [role="option"][tabindex="0"]')).toBeFocused();
  await page.getByRole('button', { name: 'Close files' }).click();
  await expect(filesToggle).toBeFocused();
  await expect(page.locator('.workbench-shell__sidebar [role="treeitem"]')).toHaveCount(0);
  await expect(page.locator('#changed-files-dialog-tree [role="treeitem"]').first()).toBeAttached();
  await filesToggle.click();
  await expect(changedFiles).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopFilesToggle = page.getByRole('button', { name: 'Toggle side bar (⌘B)', exact: true });
  await expect(changedFiles).toHaveCount(0);
  await expect(desktopFilesToggle).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });


  const reviewNotes = page.getByRole('button', { name: 'Toggle panel (⌘J)', exact: true });
  await reviewNotes.focus();
  await reviewNotes.click();
  const reviewNotesDialog = page.getByRole('region', { name: 'Review', exact: true });
  const reviewNotesClose = reviewNotesDialog.getByRole('button', { name: 'Close panel', exact: true });
  await expect(reviewNotesDialog).toBeVisible();
  await reviewNotesClose.click();
  await expect(reviewNotesDialog).toHaveCount(0);
  await reviewNotes.click();
  await expect(reviewNotesDialog).toBeVisible();
  await openReview(page);
  await page.setViewportSize({ width: 1200, height: 1100 });
});

test.describe('async comment settlement', () => {
  test.beforeEach(() => {
    resetAsyncSettlementFixture();
  });

  test.afterEach(() => {
    resetAsyncSettlementFixture();
  });

  test('async comment settlement keeps B active when accepted A completion returns', async ({ page }) => {
    const delayed = delayNextMutation('accepted');
    const body = 'Keep acceptance on its originating file.';

    await openReview(page);
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    const composer = page.locator('.monaco-anchor-zone--composer textarea');
    await composer.fill(body);
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/draft/mutations'));
    let settled = false;
    void response.then(() => { settled = true; });
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await delayed.received;
    expect(settled).toBe(false);

    await page.getByRole('treeitem', { name: /src\/second\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
    await hoverMonacoLine(page, 'head', 'export const secondChanged = 3;');
    expect(settled).toBe(false);
    delayed.release();
    expect((await response).status()).toBe(201);
    await expect(page.locator('.session-shell > .visually-hidden[aria-live="polite"]')).toHaveText(
      'Comment on src/first.ts at head line 10 was added and saved locally.',
      { timeout: 15_000 },
    );

    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
    await expect(page.locator('.monaco-anchor-zone--composer')).toHaveCount(0);
    await page.getByRole('treeitem', { name: /src\/first\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/first.ts' })).toBeVisible();
    await expect(page.locator('.inline-accepted-comment')).toContainText(body);
    await expect(page.locator('.monaco-anchor-zone--composer textarea')).toHaveCount(0);
  });

  test('async comment settlement restores A retry state when its delayed failure returns', async ({ page }) => {
    const delayed = delayNextMutation('persistenceFailure');
    const body = 'Keep retry text and anchor on file A.';
    const message = `Comment wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`;

    await openReview(page);
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer textarea').fill(body);
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await delayed.received;

    await page.getByRole('treeitem', { name: /src\/second\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
    await hoverMonacoLine(page, 'head', 'export const secondChanged = 3;');
    delayed.release();
    expect((await response).status()).toBe(500);
    await expect(page.locator('.session-shell > .visually-hidden[aria-live="polite"]')).toHaveText(
      `Comment on src/first.ts at head line 10 wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`,
    );
    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
    await expect(page.locator('.monaco-anchor-zone--composer')).toHaveCount(0);

    await page.getByRole('treeitem', { name: /src\/first\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/first.ts' })).toBeVisible();
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    const retryComposer = page.locator('.monaco-anchor-zone--composer');
    await expect(retryComposer.locator('textarea')).toHaveValue(body);
    await expect(retryComposer).toContainText('src/first.ts · Head line 10');
    await expect(retryComposer.locator('[role="alert"]')).toHaveText(message);
    await expect(retryComposer.locator('button').filter({ hasText: 'Add comment' })).toBeEnabled();
  });

  test('async comment settlement announces A revision conflict while keeping B active', async ({ page }) => {
    const delayed = delayNextMutation('revisionConflict');
    const body = 'Keep conflict text and anchor on file A.';
    const message = 'Comment wasn’t added. Your text is still here. Reload the latest draft before trying again.';

    await openReview(page);
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    const response = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/draft/mutations')
      && candidate.request().postData()?.includes(body) === true);
    await page.locator('.monaco-anchor-zone--composer textarea').fill(body);
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await delayed.received;

    await page.getByRole('treeitem', { name: /src\/second\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();
    await hoverMonacoLine(page, 'head', 'export const secondChanged = 3;');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    await page.locator('.monaco-anchor-zone--composer textarea').fill('Advance the canonical draft on file B.');
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await expect(page.locator('.session-shell > .visually-hidden[aria-live="polite"]')).toHaveText(
      'Comment on src/second.ts at head line 10 was added and saved locally.',
    );
    delayed.release();
    expect((await response).status()).toBe(409);
    await expect(page.locator('.session-shell > .visually-hidden[aria-live="polite"]')).toHaveText(
      'Comment on src/first.ts at head line 10 wasn’t added. Your text is still here. Reload the latest draft before trying again.',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'src/second.ts' })).toBeVisible();

    await page.getByRole('treeitem', { name: /src\/first\.ts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'src/first.ts' })).toBeVisible();
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    const retryComposer = page.locator('.monaco-anchor-zone--composer');
    await expect(retryComposer.locator('textarea')).toHaveValue(body);
    await expect(retryComposer.locator('[role="alert"]')).toHaveText(message);
  });

  test('repeated identical settlement messages create distinct live-region updates', async ({ page }) => {
    const body = 'Retry the same failed comment.';
    const announcement = `Comment on src/first.ts at head line 10 wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`;
    const liveRegion = page.locator('.session-shell > .visually-hidden[aria-live="polite"]');

    const firstDelayed = delayNextMutation('persistenceFailure');
    await openReview(page);
    await hoverMonacoLine(page, 'head', 'export const changed = 3;');
    await page.getByRole('button', { name: 'Add comment to head line 10' }).click();
    await page.locator('.monaco-anchor-zone--composer textarea').fill(body);
    const firstResponse = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await firstDelayed.received;
    firstDelayed.release();
    expect((await firstResponse).status()).toBe(500);
    await expect(liveRegion).toHaveText(announcement);
    const firstVersion = await liveRegion.locator('span').getAttribute('data-announcement-version');

    const secondDelayed = delayNextMutation('persistenceFailure');
    const secondResponse = page.waitForResponse((candidate) =>
      candidate.url().includes('/api/draft/mutations'));
    await page.locator('.monaco-anchor-zone--composer button').filter({ hasText: 'Add comment' }).click();
    await secondDelayed.received;
    secondDelayed.release();
    expect((await secondResponse).status()).toBe(500);
    await expect.poll(async () =>
      liveRegion.locator('span').getAttribute('data-announcement-version')).not.toBe(firstVersion);
    await expect(liveRegion).toHaveText(announcement);
  });
});

test('preserves no-reflow Monaco semantic channels at every phase viewport', async ({ page }) => {
  test.setTimeout(120_000);
  const targetText = 'export const changed = 3;';

  for (const width of [1440, 1280, 1100, 1099, 768, 767, 640, 320]) {
    resetAsyncSettlementFixture();
    await page.setViewportSize({ width, height: 760 });
    await openReview(page);
    await expect(page.locator('.monaco-diff-pane--base')).toHaveCount(1);
    await expect(page.locator('.monaco-diff-pane--head')).toHaveCount(1);

    const initial = await readMonacoGeometry(page, targetText);
    expect(initial.document.scrollWidth).toBeLessThanOrEqual(initial.document.clientWidth);
    if (initial.reviewShell === null || initial.reviewMain === null
      || initial.diffViewport === null || initial.diffCanvas === null) {
      throw new Error('Expected rendered review shell, main, diff viewport, and diff canvas geometry.');
    }
    expect(initial.reviewMain.rect.width).toBeLessThanOrEqual(initial.reviewShell.rect.width + 1);
    expect(initial.diffViewport.rect.width).toBeLessThanOrEqual(initial.reviewMain.rect.width + 1);
    const outerOverflowOwners = await page.locator('.workbench-shell__main').evaluate((root) => [...root.querySelectorAll<HTMLElement>('*')]
      .filter((element) => !element.closest('.diff-workspace__viewport')
        && !element.closest('.review-toolbar__active-file')
        && !element.classList.contains('sr-only')
        && element.scrollWidth > element.clientWidth)
      .map((element) => element.className));
    expect(outerOverflowOwners).toEqual([]);
    expect(initial.reviewMain.scrollWidth).toBeLessThanOrEqual(initial.reviewMain.clientWidth);
    expect(initial.reviewShell.scrollWidth).toBeLessThanOrEqual(initial.reviewShell.clientWidth);
    expect(initial.diffCanvas.rect.width).toBeGreaterThanOrEqual(640);

    if (width === 320) {
      const reachability = await page.locator('.diff-workspace__viewport').evaluate((viewport) => {
        const intersectsViewport = (element: Element | null) => {
          if (element === null) return false;
          const bounds = element.getBoundingClientRect();
          const viewportBounds = viewport.getBoundingClientRect();
          return bounds.left < viewportBounds.right && bounds.right > viewportBounds.left;
        };
        viewport.scrollLeft = 0;
        const baseReachableAtStart = intersectsViewport(document.querySelector('.monaco-diff-pane--base'));
        const baseLabelReachableAtStart = intersectsViewport(document.querySelector('.diff-workspace__side-labels > span:first-child > span:first-child'));
        viewport.scrollLeft = viewport.scrollWidth;
        const headLabelReachableAtEnd = intersectsViewport(document.querySelector('.diff-workspace__side-labels > span:last-child > span:first-child'));
        const headReachableAtEnd = intersectsViewport(document.querySelector('.monaco-diff-pane--head'));
        const actionReachableAtEnd = intersectsViewport(document.querySelector('.diff-workspace__gutter-action'));
        const canvasWidth = document.querySelector<HTMLElement>('.diff-workspace__canvas')?.getBoundingClientRect().width;
        const viewportClientWidth = viewport.clientWidth;
        const viewportScrollWidth = viewport.scrollWidth;
        viewport.scrollLeft = 0;
        return {
          actionReachableAtEnd,
          baseLabelReachableAtStart,
          baseReachableAtStart,
          canvasWidth,
          documentScrollLeft: document.documentElement.scrollLeft,
          headLabelReachableAtEnd,
          headReachableAtEnd,
          viewportClientWidth,
          viewportScrollWidth,
        };
      });
      expect(reachability.viewportScrollWidth).toBeGreaterThan(reachability.viewportClientWidth);
      expect(reachability.canvasWidth).toBeGreaterThanOrEqual(640);
      expect(reachability.baseReachableAtStart).toBe(true);
      expect(reachability.baseLabelReachableAtStart).toBe(true);
      expect(reachability.headReachableAtEnd).toBe(true);
      expect(reachability.headLabelReachableAtEnd).toBe(true);
      expect(reachability.actionReachableAtEnd).toBe(true);
      expect(reachability.documentScrollLeft).toBe(0);
    }

    await hoverMonacoLine(page, 'head', targetText);
    const action = page.getByRole('button', { name: 'Add comment to head line 10' });
    await expect(action).toHaveCSS('width', '32px');
    await expect(action).toHaveCSS('height', '32px');
    const before = await readMonacoGeometry(page, targetText);
    expect(before.codeOrigin).not.toBeNull();
    expect(before.action).not.toBeNull();

    await action.click({ force: true });
    const anchorLine = page.locator('.monaco-anchor-line').first();
    await expect(anchorLine).toHaveCSS('border-left-width', '0px');
    await expect(anchorLine).toHaveCSS('box-shadow', `${toRootRgb('--interactive-accent')} 3px 0px 0px 0px inset`);
    let anchored: MonacoGeometry | undefined;
    await expect.poll(async () => {
      const candidate = await readMonacoGeometry(page, targetText);
      if (candidate.zones.length !== 2) return false;
      if (Math.abs(candidate.zones[0].y - candidate.zones[1].y) > 1) return false;
      if (candidate.zones[0].height !== candidate.zones[1].height) return false;
      anchored = candidate;
      return true;
    }).toBe(true);
    if (anchored === undefined) throw new Error('expected settled anchor geometry');
    expectAnchoringNotToReflow(before, anchored);
    expect(anchored.zones).toHaveLength(2);
    expect(Math.abs(anchored.zones[0].y - anchored.zones[1].y)).toBeLessThanOrEqual(1);
    expect(anchored.zones[0].height).toBe(anchored.zones[1].height);

    const targetLine = page.locator('.monaco-diff-editor .modified .view-line').filter({ hasText: targetText }).first();
    await targetLine.click({ force: true, position: { x: 20, y: 9 } });
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Shift');
    await hoverMonacoLine(page, 'head', targetText);
    await expect.poll(async () => await readMonacoGeometry(page, targetText)).toEqual(anchored);
    const semanticStates = await readMonacoGeometry(page, targetText);
    expect(semanticStates.document.scrollWidth).toBeLessThanOrEqual(semanticStates.document.clientWidth);
  }
});
