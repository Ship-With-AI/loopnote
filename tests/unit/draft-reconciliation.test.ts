import { describe, expect, it } from 'vitest';

import type { DraftView } from '../../src/web/api/client.js';
import type { SessionFile } from '../../src/contracts/api.js';
import { reconcileDraftComment, reconcileDraftComments } from '../../src/web/model/draft-reconciliation.js';
import { AddCommentRequestSchema } from '../../src/contracts/api.js';
import {
  DurableAnchorV1Schema,
  ReviewDraftV1Schema,
  ReviewExportV1Schema,
  ReviewExportV2Schema,
  ReviewExportV3Schema,
  ReviewExportV4Schema,
} from '../../src/contracts/draft.js';
import {
  buildReviewExportV1,
  buildReviewExportV2,
  buildReviewExportV3,
  buildReviewExportV4,
} from '../../src/export/review-export.js';

const oid = (character: string) => character.repeat(40);
const hash = (character: string) => character.repeat(64);

type ExactPathFixture = Readonly<{
  bytesBase64url: string;
  display: string;
}>;

const exactPath = (bytesBase64url: string, display = 'src/�.ts'): ExactPathFixture => ({
  bytesBase64url,
  display,
});

const anchor = (
  side: 'base' | 'head',
  path = exactPath('c3JjL_8udHM'),
  verification: 'verified' | 'stale' | 'orphaned' = 'verified',
): DraftView['comments'][number] => ({
  id: 'comment_123e4567-e89b-12d3-a456-426614174000',
  state: 'open',
  body: 'Explain this change.',
  anchor: {
    version: 'durable-anchor-v1',
    path,
    safeDisplayPath: path.display,
    side,
    line: 7,
    blobOid: oid('a'),
    selectedText: 'const changed = true;',
    context: {
      before: [{ line: 6, text: 'const before = true;' }],
      target: { line: 7, text: 'const changed = true;' },
      after: [{ line: 8, text: 'const after = true;' }],
    },
    contextHash: { algorithm: 'sha256-v1', value: hash('b') },
    uniqueKey: hash('c'),
  },
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  verification: {
    state: verification,
    reason: verification === 'verified' ? 'exact-match' : verification === 'stale' ? 'anchor-mismatch' : 'anchor-unavailable',
  },
});

const file = (
  fileId: string,
  paths: { base?: ExactPathFixture; head?: ExactPathFixture },
): SessionFile => ({
  fileId,
  status: { kind: 'modified' },
  oldMode: '100644',
  ...(paths.base === undefined ? {} : { oldPath: paths.base }),
  ...(paths.head === undefined ? {} : { newPath: paths.head }),
  additions: 1,
  deletions: 1,
  availability: { kind: 'text' },
});

describe('draft reconciliation', () => {
  const firstBytes = 'c3JjL_8udHM';
  const secondBytes = 'c3JjL_7udHM';
  const firstPath = exactPath(firstBytes);
  const secondPath = exactPath(secondBytes);

  it('matches colliding displays by exact selected-side bytes in either file order', () => {
    const first = file('file_first', { base: firstPath, head: secondPath });
    const second = file('file_second', { base: secondPath, head: firstPath });

    for (const files of [[first, second], [second, first]]) {
      expect(reconcileDraftComment(anchor('base', firstPath), files)).toMatchObject({
        fileId: 'file_first',
        exactFile: { kind: 'available', fileId: 'file_first' },
      });
      expect(reconcileDraftComment(anchor('head', firstPath), files)).toMatchObject({
        fileId: 'file_second',
        exactFile: { kind: 'available', fileId: 'file_second' },
      });
    }
  });

  it('never falls back from exact bytes to identical display text', () => {
    const comment = reconcileDraftComment(
      anchor('base', exactPath('c3JjL_9taXNzaW5nLnRz')),
      [file('file_first', { base: firstPath, head: secondPath })],
    );

    expect(comment.fileId).toBeNull();
    expect(comment.exactFile).toEqual({ kind: 'unavailable' });
  });

  it.each(['verified', 'stale', 'orphaned'] as const)('%s comments retain immutable recorded evidence', (verification) => {
    const comment = reconcileDraftComment(anchor('head', secondPath, verification), [
      file('file_second', { head: secondPath }),
    ]);

    expect(comment).toMatchObject({
      fileId: 'file_second',
      status: verification,
      recordedAnchor: {
        path: secondPath,
        safeDisplayPath: 'src/�.ts',
        side: 'head',
        line: 7,
        blobOid: oid('a'),
        selectedText: 'const changed = true;',
        contextHash: { algorithm: 'sha256-v1', value: hash('b') },
        uniqueKey: hash('c'),
      },
    });
  });

  it('keeps stale and orphaned records unavailable when no exact selected-side file exists', () => {
    const comments = reconcileDraftComments([
      anchor('base', exactPath('c3JjL3N0YWxlLnRz'), 'stale'),
      anchor('head', exactPath('c3JjL29ycGhhbi50cw'), 'orphaned'),
    ], [file('file_first', { base: firstPath, head: secondPath })]);

    expect(comments.map((comment) => ({ status: comment.status, fileId: comment.fileId, exactFile: comment.exactFile }))).toEqual([
      { status: 'stale', fileId: null, exactFile: { kind: 'unavailable' } },
      { status: 'orphaned', fileId: null, exactFile: { kind: 'unavailable' } },
    ]);
  });
});

describe('range-aware durable anchor schemas (A-01 back-compat)', () => {
  const legacyCommentId = 'comment_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function legacyPath(utf8: string) {
    return {
      bytesBase64url: Buffer.from(utf8, 'utf8').toString('base64url'),
      display: utf8,
      utf8,
    };
  }

  function legacyAnchor() {
    return {
      version: 'durable-anchor-v1' as const,
      path: legacyPath('src/legacy.ts'),
      safeDisplayPath: 'src/legacy.ts',
      side: 'head' as const,
      line: 7,
      blobOid: oid('a'),
      selectedText: 'const answer = 41;',
      context: {
        before: [{ line: 6, text: 'export function answer() {' }],
        target: { line: 7, text: 'const answer = 41;' },
        after: [{ line: 8, text: 'return answer;' }],
      },
      contextHash: { algorithm: 'sha256-v1' as const, value: hash('b') },
      uniqueKey: hash('c'),
    };
  }

  function exportComment(overrides: Record<string, unknown> = {}) {
    return {
      id: legacyCommentId,
      state: 'open' as const,
      body: 'Please make this explicit.',
      createdAt: '2026-07-23T08:00:00.000Z',
      updatedAt: '2026-07-23T08:00:00.000Z',
      anchor: legacyAnchor(),
      ...overrides,
    };
  }

  function exportSnapshot(comments = [exportComment()]) {
    return {
      acceptedDraft: {
        schemaVersion: 1 as const,
        comparison: { baseCommitOid: oid('a'), headCommitOid: oid('a'), mergeBaseOid: oid('a') },
        revision: 4,
        summary: '',
        comments,
      },
      commentVerification: Object.fromEntries(
        comments.map((item) => [item.id, { state: 'verified' as const, reason: 'exact-match' as const }]),
      ),
      comparison: {
        selectedBase: { label: 'main', launchOid: oid('a') },
        selectedHead: { label: 'topic', launchOid: oid('a') },
        mergeBaseOid: oid('a'),
        comparisonKey: hash('d'),
      },
      drift: {
        observedAt: '2026-07-23T08:01:00.000Z',
        acknowledged: false,
        base: { launchOid: oid('a'), currentOid: oid('a'), status: 'unchanged' as const },
        head: { launchOid: oid('a'), currentOid: oid('a'), status: 'unchanged' as const },
      },
    };
  }

  it('accepts a pre-phase-16 anchor literal with no endLine key on DurableAnchorV1Schema', () => {
    expect(DurableAnchorV1Schema.safeParse(legacyAnchor()).success).toBe(true);
  });

  it('accepts endLine >= line and rejects endLine < line on DurableAnchorV1Schema', () => {
    const base = legacyAnchor();
    expect(DurableAnchorV1Schema.safeParse({ ...base, endLine: base.line + 2 }).success).toBe(true);
    expect(DurableAnchorV1Schema.safeParse({ ...base, endLine: base.line - 1 }).success).toBe(false);
  });

  it('accepts endLine >= line and rejects endLine < line on AddCommentRequestSchema', () => {
    const payload = {
      type: 'addComment' as const,
      expectedRevision: 1,
      fileId: `file_${'a'.repeat(43)}`,
      side: 'base' as const,
      line: 5,
      body: 'x',
    };
    expect(AddCommentRequestSchema.safeParse({ ...payload, endLine: 7 }).success).toBe(true);
    expect(AddCommentRequestSchema.safeParse({ ...payload, endLine: 4 }).success).toBe(false);
    expect(AddCommentRequestSchema.safeParse(payload).success).toBe(true);
  });

  it('parses a pre-phase-16 anchor fixture (no endLine key) through ReviewDraftV1Schema and all four ReviewExportV{1,2,3,4}Schema unchanged', () => {
    const draft = ReviewDraftV1Schema.safeParse({
      schemaVersion: 1,
      comparison: { baseCommitOid: oid('a'), headCommitOid: oid('b'), mergeBaseOid: oid('c') },
      revision: 4,
      summary: '',
      comments: [{
        id: legacyCommentId,
        state: 'open',
        body: 'Legacy comment body.',
        anchor: legacyAnchor(),
        createdAt: '2026-07-23T08:00:00.000Z',
        updatedAt: '2026-07-23T08:00:00.000Z',
      }],
    });
    expect(draft.success).toBe(true);

    const v1 = buildReviewExportV1(exportSnapshot(), '2026-07-23T08:02:00.000Z');
    expect(ReviewExportV1Schema.safeParse(v1).success).toBe(true);

    const range = {
      kind: 'revisions' as const,
      requestedBase: 'main',
      requestedHead: 'topic',
      baseOid: oid('a'),
      headOid: oid('a'),
      pathspecs: ['src'],
      reviewKey: hash('d'),
    };
    const rangeBase = exportSnapshot();
    const v2 = buildReviewExportV2(
      {
        ...rangeBase,
        acceptedDraft: { ...rangeBase.acceptedDraft, comparison: { ...rangeBase.acceptedDraft.comparison, range } },
        comparison: {
          selectedBase: { label: range.requestedBase, launchOid: range.baseOid },
          selectedHead: { label: range.requestedHead, launchOid: range.headOid },
          mergeBaseOid: range.baseOid,
          comparisonKey: range.reviewKey,
        },
      },
      range,
      '2026-07-23T08:02:00.000Z',
    );
    expect(ReviewExportV2Schema.safeParse(v2).success).toBe(true);

    const patch = {
      digest: hash('e'),
      validationTarget: { kind: 'repository' as const },
      reviewKey: hash('f'),
      snapshot: { status: 'drifted' as const, files: [] },
    };
    const v3Base = exportSnapshot();
    const v3 = buildReviewExportV3(
      {
        acceptedDraft: {
          ...v3Base.acceptedDraft,
          comparison: { kind: 'exact-patch' as const, digest: patch.digest, validationTarget: patch.validationTarget, reviewKey: patch.reviewKey },
        },
        commentVerification: v3Base.commentVerification,
      },
      patch,
      '2026-07-23T08:02:00.000Z',
    );
    expect(ReviewExportV3Schema.safeParse(v3).success).toBe(true);

    const standalone = {
      originalArguments: ['src/legacy.ts'],
      resolvedPaths: [legacyPath('src/legacy.ts')],
      fileDigests: [{ path: legacyPath('src/legacy.ts'), sha256: hash('e') }],
      snapshotChain: [hash('a')],
      reviewKey: hash('f'),
    };
    const v4Base = exportSnapshot();
    const v4 = buildReviewExportV4(
      {
        acceptedDraft: {
          ...v4Base.acceptedDraft,
          comparison: { kind: 'uncommitted' as const, sourceKind: 'standalone' as const, reviewKey: standalone.reviewKey, snapshotChain: standalone.snapshotChain },
        },
        commentVerification: v4Base.commentVerification,
      },
      standalone,
      '2026-07-23T08:02:00.000Z',
    );
    expect(ReviewExportV4Schema.safeParse(v4).success).toBe(true);
  });
});
