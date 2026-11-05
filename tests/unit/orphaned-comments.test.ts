import { describe, expect, test } from 'vitest';

import { projectOrphanedCommentGroup } from '../../src/web/model/orphaned-comments.js';
import type { WorkspaceComment, WorkspaceCommentStatus } from '../../src/web/model/workspace-state.js';

const oid = (character: string) => character.repeat(40);
const hash = (character: string) => character.repeat(64);

type PathFixture = Readonly<{ bytesBase64url: string; display: string }>;

type CommentOverrides = Readonly<{
  id?: string;
  status?: WorkspaceCommentStatus;
  side?: 'base' | 'head';
  line?: number;
  createdAt?: string;
  path?: PathFixture;
}>;

const comment = (overrides: CommentOverrides = {}): WorkspaceComment => {
  const path = overrides.path ?? { bytesBase64url: 'c3JjL2EudHM', display: 'src/a.ts' };
  const side = overrides.side ?? 'head';
  const line = overrides.line ?? 7;
  const createdAt = overrides.createdAt ?? '2026-07-22T00:00:00.000Z';
  return {
    id: overrides.id ?? 'comment_00000000-0000-4000-8000-000000000001',
    fileId: 'file-1',
    exactFile: { kind: 'unavailable' },
    side,
    line,
    body: 'Review this.',
    state: 'open',
    createdAt,
    status: overrides.status ?? 'orphaned',
    recordedAnchor: {
      version: 'durable-anchor-v1',
      path,
      safeDisplayPath: path.display,
      side,
      line,
      blobOid: oid('a'),
      selectedText: 'const changed = true;',
      context: {
        before: [{ line: 6, text: 'const before = true;' }],
        target: { line, text: 'const changed = true;' },
        after: [{ line: 8, text: 'const after = true;' }],
      },
      contextHash: { algorithm: 'sha256-v1', value: hash('b') },
      uniqueKey: hash('c'),
    },
  };
};

describe('projectOrphanedCommentGroup', () => {
  test('empty input -> []', () => {
    expect(projectOrphanedCommentGroup([])).toEqual([]);
  });

  test('all verified -> []', () => {
    const comments = [comment({ status: 'verified' }), comment({ id: 'comment_00000000-0000-4000-8000-000000000002', status: 'verified' })];
    expect(projectOrphanedCommentGroup(comments)).toEqual([]);
  });

  test('two orphaned comments with different paths -> two groups ordered by byte order', () => {
    const pathZ: PathFixture = { bytesBase64url: 'c3JjL3oudHM', display: 'src/z.ts' };
    const pathA: PathFixture = { bytesBase64url: 'c3JjL2EudHM', display: 'src/a.ts' };
    const comments = [
      comment({ id: 'comment_00000000-0000-4000-8000-000000000001', path: pathZ }),
      comment({ id: 'comment_00000000-0000-4000-8000-000000000002', path: pathA }),
    ];
    const groups = projectOrphanedCommentGroup(comments);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.path).toEqual(pathA);
    expect(groups[1]?.path).toEqual(pathZ);
  });

  test('shared path, base before head within one group at same line', () => {
    const path: PathFixture = { bytesBase64url: 'c3JjL2EudHM', display: 'src/a.ts' };
    const headComment = comment({ id: 'comment_00000000-0000-4000-8000-000000000001', path, side: 'head', line: 7 });
    const baseComment = comment({ id: 'comment_00000000-0000-4000-8000-000000000002', path, side: 'base', line: 7 });
    const groups = projectOrphanedCommentGroup([headComment, baseComment]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments.map((entry) => entry.id)).toEqual([baseComment.id, headComment.id]);
  });

  test('mix of statuses -> only orphaned comments appear', () => {
    const comments = [
      comment({ id: 'comment_00000000-0000-4000-8000-000000000001', status: 'verified' }),
      comment({ id: 'comment_00000000-0000-4000-8000-000000000002', status: 'stale' }),
      comment({ id: 'comment_00000000-0000-4000-8000-000000000003', status: 'orphaned' }),
    ];
    const groups = projectOrphanedCommentGroup(comments);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.comments.map((entry) => entry.id)).toEqual(['comment_00000000-0000-4000-8000-000000000003']);
  });
});
