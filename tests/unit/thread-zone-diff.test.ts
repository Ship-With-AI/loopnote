import { describe, expect, test } from 'vitest';

import { diffThreadIds } from '../../src/web/model/thread-zone-diff.js';
import type { WorkspaceComment } from '../../src/web/model/workspace-state.js';

const oid = (character: string) => character.repeat(40);
const hash = (character: string) => character.repeat(64);

const comment = (id: string): WorkspaceComment => ({
  id,
  fileId: 'file-1',
  exactFile: { kind: 'available', fileId: 'file-1' },
  side: 'head',
  line: 7,
  body: 'Review this.',
  state: 'open',
  createdAt: '2026-07-22T00:00:00.000Z',
  status: 'verified',
  recordedAnchor: {
    version: 'durable-anchor-v1',
    path: { bytesBase64url: 'c3JjL2EudHM', display: 'src/a.ts' },
    safeDisplayPath: 'src/a.ts',
    side: 'head',
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
});

describe('diffThreadIds', () => {
  test('previous empty, next has two comments -> both toCreate', () => {
    const result = diffThreadIds(new Set(), [comment('a'), comment('b')]);
    expect(result.toCreate.slice().sort()).toEqual(['a', 'b']);
    expect(result.toRemove).toEqual([]);
    expect(result.toKeep).toEqual([]);
  });

  test('previous has two ids, next is empty -> both toRemove', () => {
    const result = diffThreadIds(new Set(['a', 'b']), []);
    expect(result.toCreate).toEqual([]);
    expect(result.toRemove.slice().sort()).toEqual(['a', 'b']);
    expect(result.toKeep).toEqual([]);
  });

  test('shared id plus one new id -> shared toKeep, new toCreate, nothing toRemove', () => {
    const result = diffThreadIds(new Set(['a']), [comment('a'), comment('b')]);
    expect(result.toCreate).toEqual(['b']);
    expect(result.toRemove).toEqual([]);
    expect(result.toKeep).toEqual(['a']);
  });

  test('stale id plus different new id -> stale toRemove, new toCreate, neither toKeep', () => {
    const result = diffThreadIds(new Set(['a']), [comment('b')]);
    expect(result.toCreate).toEqual(['b']);
    expect(result.toRemove).toEqual(['a']);
    expect(result.toKeep).toEqual([]);
  });

  test('identical sets -> everything toKeep', () => {
    const result = diffThreadIds(new Set(['a', 'b']), [comment('a'), comment('b')]);
    expect(result.toCreate).toEqual([]);
    expect(result.toRemove).toEqual([]);
    expect(result.toKeep.slice().sort()).toEqual(['a', 'b']);
  });

  test('duplicate id in next appears exactly once across outputs', () => {
    const result = diffThreadIds(new Set(), [comment('a'), { ...comment('a') }]);
    expect(result.toCreate).toEqual(['a']);
    expect(result.toRemove).toEqual([]);
    expect(result.toKeep).toEqual([]);
  });
});
