import { describe, expect, it } from 'vitest';

import type { DraftView } from '../../src/web/api/client.js';
import type { SessionFile } from '../../src/contracts/api.js';
import { reconcileDraftComment, reconcileDraftComments } from '../../src/web/model/draft-reconciliation.js';

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
