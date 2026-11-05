import { describe, expect, test } from 'vitest';

import type { SessionFile } from '../../src/contracts/api.js';
import { createExactPath, type ExactPath } from '../../src/domain/path-bytes.js';
import type { VisibleFileTreeLeaf } from '../../src/web/model/file-tree.js';
import {
  flattenThreadOrder,
  nextThread,
  previousThread,
  type ThreadOrderEntry,
} from '../../src/web/model/thread-order.js';
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

describe('flattenThreadOrder', () => {
  test('returns an empty order for no comments', () => {
    expect(flattenThreadOrder([], [fileRow('file-a')])).toEqual([]);
  });

  test('orders comments in the same file by line ascending', () => {
    const rows = [fileRow('file-a')];
    const order = flattenThreadOrder(
      [
        comment({ id: 'c2', fileId: 'file-a', side: 'head', line: 20 }),
        comment({ id: 'c1', fileId: 'file-a', side: 'head', line: 5 }),
      ],
      rows,
    );

    expect(order.map((entry) => entry.commentId)).toEqual(['c1', 'c2']);
  });

  test('orders Base before Head on the same line', () => {
    const rows = [fileRow('file-a')];
    const order = flattenThreadOrder(
      [
        comment({ id: 'c-head', fileId: 'file-a', side: 'head', line: 10 }),
        comment({ id: 'c-base', fileId: 'file-a', side: 'base', line: 10 }),
      ],
      rows,
    );

    expect(order.map((entry) => entry.commentId)).toEqual(['c-base', 'c-head']);
  });

  test('orders comments in different files by tree path order, ignoring line number', () => {
    const rows = [fileRow('file-first'), fileRow('file-second')];
    const order = flattenThreadOrder(
      [
        comment({ id: 'c-second', fileId: 'file-second', side: 'head', line: 1 }),
        comment({ id: 'c-first', fileId: 'file-first', side: 'head', line: 9999 }),
      ],
      rows,
    );

    expect(order.map((entry) => entry.commentId)).toEqual(['c-first', 'c-second']);
  });

  test('excludes orphaned comments (fileId: null)', () => {
    const rows = [fileRow('file-a')];
    const order = flattenThreadOrder(
      [
        comment({ id: 'c-orphan', fileId: null, side: 'head', line: 1 }),
        comment({ id: 'c-anchored', fileId: 'file-a', side: 'head', line: 1 }),
      ],
      rows,
    );

    expect(order.map((entry) => entry.commentId)).toEqual(['c-anchored']);
  });

  test('excludes comments whose file is not present in flatFileRows', () => {
    const rows = [fileRow('file-a')];
    const order = flattenThreadOrder(
      [
        comment({ id: 'c-hidden', fileId: 'file-not-in-tree', side: 'head', line: 1 }),
        comment({ id: 'c-visible', fileId: 'file-a', side: 'head', line: 1 }),
      ],
      rows,
    );

    expect(order.map((entry) => entry.commentId)).toEqual(['c-visible']);
  });
});

describe('nextThread', () => {
  test('returns undefined for an empty order', () => {
    expect(nextThread([], undefined)).toBeUndefined();
  });

  test('returns the first entry, not wrapped, when currentCommentId is undefined', () => {
    const order = threeEntryOrder();
    expect(nextThread(order, undefined)).toEqual({ entry: order[0], wrapped: false });
  });

  test('returns the first entry, not wrapped, when currentCommentId is not in order (e.g. deleted)', () => {
    const order = threeEntryOrder();
    expect(nextThread(order, 'id-not-in-order')).toEqual({ entry: order[0], wrapped: false });
  });

  test('wraps to the first entry when stepping past the last entry', () => {
    const order = threeEntryOrder();
    const last = order[order.length - 1]!;
    expect(nextThread(order, last.commentId)).toEqual({ entry: order[0], wrapped: true });
  });
});

describe('previousThread', () => {
  test('returns undefined for an empty order', () => {
    expect(previousThread([], undefined)).toBeUndefined();
  });

  test('wraps to the last entry when stepping before the first entry', () => {
    const order = threeEntryOrder();
    const first = order[0]!;
    const last = order[order.length - 1]!;
    expect(previousThread(order, first.commentId)).toEqual({ entry: last, wrapped: true });
  });
});

function threeEntryOrder(): readonly ThreadOrderEntry[] {
  const rows = [fileRow('file-a')];
  return flattenThreadOrder(
    [
      comment({ id: 'c1', fileId: 'file-a', side: 'head', line: 1 }),
      comment({ id: 'c2', fileId: 'file-a', side: 'head', line: 2 }),
      comment({ id: 'c3', fileId: 'file-a', side: 'head', line: 3 }),
    ],
    rows,
  );
}
