import { describe, expect, it } from 'vitest';

import type { SessionFile } from '../../src/contracts/api.js';
import { resolvePathToFileId, resolvePathsToFileIds } from '../../src/web/model/refresh-resolution.js';

function path(display: string): NonNullable<SessionFile['oldPath']> {
  return { bytesBase64url: display, display };
}

function sessionFile(options: {
  fileId: string;
  status: SessionFile['status']['kind'];
  oldPath?: string;
  newPath?: string;
}): SessionFile {
  return Object.freeze({
    fileId: options.fileId,
    status: Object.freeze({ kind: options.status }),
    oldMode: '100644',
    ...(options.oldPath === undefined ? {} : { oldPath: path(options.oldPath) }),
    ...(options.newPath === undefined ? {} : { newPath: path(options.newPath) }),
    additions: 1,
    deletions: 1,
    availability: Object.freeze({ kind: 'text' as const }),
  });
}

describe('refresh resolution', () => {
  const added = sessionFile({ fileId: 'file_added', status: 'added', newPath: 'src/added.ts' });
  const deleted = sessionFile({ fileId: 'file_deleted', status: 'deleted', oldPath: 'src/deleted.ts' });
  const modifiedBoth = sessionFile({
    fileId: 'file_modified',
    status: 'modified',
    oldPath: 'src/modified-old.ts',
    newPath: 'src/modified.ts',
  });
  const unchangedOldOnly = sessionFile({
    fileId: 'file_unchanged',
    status: 'unchanged',
    oldPath: 'src/unchanged.ts',
  });
  const files: readonly SessionFile[] = Object.freeze([added, deleted, modifiedBoth, unchangedOldOnly]);

  it('resolves an added file by its newPath display', () => {
    expect(resolvePathToFileId('src/added.ts', files)).toBe('file_added');
  });

  it('resolves a modified file by newPath.display over oldPath.display', () => {
    expect(resolvePathToFileId('src/modified.ts', files)).toBe('file_modified');
    expect(resolvePathToFileId('src/modified-old.ts', files)).toBeUndefined();
  });

  it('falls back to oldPath.display when newPath is absent (unchanged file)', () => {
    expect(resolvePathToFileId('src/unchanged.ts', files)).toBe('file_unchanged');
  });

  it('resolves a deleted-but-listed file by its oldPath display', () => {
    expect(resolvePathToFileId('src/deleted.ts', files)).toBe('file_deleted');
  });

  it('resolves an absent path to undefined', () => {
    expect(resolvePathToFileId('src/missing.ts', files)).toBeUndefined();
  });

  it('resolves multiple paths against the same file list independently without leaking state or mutating input', () => {
    const snapshot = JSON.parse(JSON.stringify(files)) as unknown;

    const result = resolvePathsToFileIds(
      ['src/added.ts', 'src/deleted.ts', 'src/missing.ts'],
      files,
    );

    expect(result.get('src/added.ts')).toBe('file_added');
    expect(result.get('src/deleted.ts')).toBe('file_deleted');
    expect(result.get('src/missing.ts')).toBeUndefined();
    expect(JSON.parse(JSON.stringify(files)) as unknown).toEqual(snapshot);
  });
});
