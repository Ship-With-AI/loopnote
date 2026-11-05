import { describe, expect, test } from 'vitest';

import type { SessionFile } from '../../src/contracts/api.js';
import { createExactPath, type ExactPath } from '../../src/domain/path-bytes.js';
import type { VisibleFileTreeLeaf } from '../../src/web/model/file-tree.js';
import {
  projectCommentsTabFileGroups,
  type CommentsTabFileGroup,
} from '../../src/web/model/comments-tab-groups.js';
import type { WorkspaceComment } from '../../src/web/model/workspace-state.js';

const encoder = new TextEncoder();

function exactPath(value: string): ExactPath {
  return createExactPath(encoder.encode(value));
}

function sessionFile(path: string): SessionFile {
  return Object.freeze({
    fileId: path,
    status: Object.freeze({ kind: 'modified' as const }),
    oldMode: '100644',
    newPath: exactPath(path),
    additions: 1,
    deletions: 1,
    availability: Object.freeze({ kind: 'text' as const }),
  });
}

function fileRow(fileId: string): VisibleFileTreeLeaf {
  return Object.freeze({
    kind: 'file' as const,
    fileId,
    file: sessionFile(fileId),
    effectivePath: exactPath(fileId),
    rowId: `file:${fileId}`,
    depth: 0,
  });
}

function comment(overrides: Partial<WorkspaceComment> & { id: string; fileId: string | null }): WorkspaceComment {
  return Object.freeze({
    id: overrides.id,
    fileId: overrides.fileId,
    exactFile: overrides.exactFile ?? Object.freeze({ kind: 'available' as const, fileId: overrides.fileId ?? 'file-a' }),
    side: overrides.side ?? 'head',
    line: overrides.line ?? 1,
    body: overrides.body ?? 'Review this.',
    state: overrides.state ?? 'open',
    createdAt: overrides.createdAt ?? '2026-07-22T00:00:00.000Z',
    status: overrides.status ?? 'verified',
    recordedAnchor: overrides.recordedAnchor ?? ({} as WorkspaceComment['recordedAnchor']),
  });
}

function summarize(groups: readonly CommentsTabFileGroup[]): readonly { fileId: string; rows: readonly { commentId: string; bucket: string }[] }[] {
  return groups.map((group) => ({
    fileId: group.leaf.fileId,
    rows: group.rows.map((row) => ({ commentId: row.comment.id, bucket: row.bucket })),
  }));
}

describe('projectCommentsTabFileGroups', () => {
  test('returns [] for empty comments and empty flatFileRows', () => {
    expect(projectCommentsTabFileGroups([], [])).toEqual([]);
  });

  test('returns [] for empty comments with non-empty flatFileRows', () => {
    expect(projectCommentsTabFileGroups([], [fileRow('file-a')])).toEqual([]);
  });

  test('returns [] for non-empty comments with empty flatFileRows', () => {
    const comments = [comment({ id: 'c1', fileId: 'file-a' })];
    expect(projectCommentsTabFileGroups(comments, [])).toEqual([]);
  });

  test('a single open/verified comment in a visible file produces one group with one open row', () => {
    const rows = [fileRow('file-a')];
    const comments = [comment({ id: 'c1', fileId: 'file-a', state: 'open', status: 'verified' })];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(summarize(groups)).toEqual([
      { fileId: 'file-a', rows: [{ commentId: 'c1', bucket: 'open' }] },
    ]);
  });

  test('orders rows within a file open -> stale -> resolved regardless of input order', () => {
    const rows = [fileRow('file-a')];
    const comments = [
      comment({ id: 'c-resolved', fileId: 'file-a', state: 'resolved', status: 'verified' }),
      comment({ id: 'c-stale', fileId: 'file-a', state: 'open', status: 'stale' }),
      comment({ id: 'c-open', fileId: 'file-a', state: 'open', status: 'verified' }),
    ];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(summarize(groups)).toEqual([
      {
        fileId: 'file-a',
        rows: [
          { commentId: 'c-open', bucket: 'open' },
          { commentId: 'c-stale', bucket: 'stale' },
          { commentId: 'c-resolved', bucket: 'resolved' },
        ],
      },
    ]);
  });

  test('a resolved comment with status stale buckets to resolved, not stale ("resolved wins")', () => {
    const rows = [fileRow('file-a')];
    const comments = [comment({ id: 'c1', fileId: 'file-a', state: 'resolved', status: 'stale' })];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(summarize(groups)).toEqual([
      { fileId: 'file-a', rows: [{ commentId: 'c1', bucket: 'resolved' }] },
    ]);
  });

  test('two comments in the same bucket and file are ordered by line ascending', () => {
    const rows = [fileRow('file-a')];
    const comments = [
      comment({ id: 'c-line-20', fileId: 'file-a', state: 'open', status: 'verified', line: 20 }),
      comment({ id: 'c-line-5', fileId: 'file-a', state: 'open', status: 'verified', line: 5 }),
    ];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(summarize(groups)).toEqual([
      {
        fileId: 'file-a',
        rows: [
          { commentId: 'c-line-5', bucket: 'open' },
          { commentId: 'c-line-20', bucket: 'open' },
        ],
      },
    ]);
  });

  test('group order follows flatFileRows tree order, never line number, across files', () => {
    const rows = [fileRow('file-first'), fileRow('file-second')];
    const comments = [
      comment({ id: 'c-second', fileId: 'file-second', state: 'open', status: 'verified', line: 1 }),
      comment({ id: 'c-first', fileId: 'file-first', state: 'open', status: 'verified', line: 9999 }),
    ];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(groups.map((group) => group.leaf.fileId)).toEqual(['file-first', 'file-second']);
  });

  test('excludes orphaned comments even when fileId matches a flatFileRows entry', () => {
    const rows = [fileRow('file-a')];
    const comments = [
      comment({ id: 'c-orphaned', fileId: 'file-a', state: 'open', status: 'orphaned' }),
    ];

    expect(projectCommentsTabFileGroups(comments, rows)).toEqual([]);
  });

  test('excludes comments with fileId: null', () => {
    const rows = [fileRow('file-a')];
    const comments = [comment({ id: 'c-null', fileId: null, state: 'open', status: 'verified' })];

    expect(projectCommentsTabFileGroups(comments, rows)).toEqual([]);
  });

  test('excludes comments whose fileId has no matching entry in flatFileRows', () => {
    const rows = [fileRow('file-a')];
    const comments = [comment({ id: 'c-missing', fileId: 'file-missing', state: 'open', status: 'verified' })];

    expect(projectCommentsTabFileGroups(comments, rows)).toEqual([]);
  });

  test('a file present in flatFileRows with only excluded comments produces no group at all', () => {
    const rows = [fileRow('file-a'), fileRow('file-b')];
    const comments = [
      comment({ id: 'c-orphaned', fileId: 'file-a', state: 'open', status: 'orphaned' }),
      comment({ id: 'c-missing', fileId: 'file-missing', state: 'open', status: 'verified' }),
      comment({ id: 'c-b', fileId: 'file-b', state: 'open', status: 'verified' }),
    ];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(groups.map((group) => group.leaf.fileId)).toEqual(['file-b']);
  });

  test('ties within a bucket/file/line break by comment.id lexicographically', () => {
    const rows = [fileRow('file-a')];
    const comments = [
      comment({ id: 'c-z', fileId: 'file-a', state: 'open', status: 'verified', line: 5 }),
      comment({ id: 'c-a', fileId: 'file-a', state: 'open', status: 'verified', line: 5 }),
    ];

    const groups = projectCommentsTabFileGroups(comments, rows);

    expect(summarize(groups)).toEqual([
      {
        fileId: 'file-a',
        rows: [
          { commentId: 'c-a', bucket: 'open' },
          { commentId: 'c-z', bucket: 'open' },
        ],
      },
    ]);
  });
});
