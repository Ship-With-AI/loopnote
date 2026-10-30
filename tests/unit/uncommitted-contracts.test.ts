import { describe, expect, it } from 'vitest';

import {
  AvailabilitySchema,
  UncommittedScopeSchema,
  UnsupportedAvailabilityReasonSchema,
} from '../../src/contracts/comparison.js';

const base40 = 'a'.repeat(40);
const mergeBase40 = 'b'.repeat(40);

describe('UncommittedScopeSchema', () => {
  it('accepts an unstaged scope with no base commit or merge base', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'unstaged',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      changedFiles: [],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unstaged scope with a baseCommitOid present', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'unstaged',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      baseCommitOid: base40,
      changedFiles: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('baseCommitOid');
    }
  });

  it('rejects a staged scope with no baseCommitOid', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'staged',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      changedFiles: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('baseCommitOid');
    }
  });

  it('accepts a staged scope with both baseCommitOid and mergeBaseOid present', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'staged',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      baseCommitOid: base40,
      mergeBaseOid: mergeBase40,
      changedFiles: [],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a worktree scope with both baseCommitOid and mergeBaseOid present, same shape as staged', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'worktree',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      baseCommitOid: base40,
      mergeBaseOid: mergeBase40,
      changedFiles: [],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown extra key, matching every other strictObject contract in this file', () => {
    const result = UncommittedScopeSchema.safeParse({
      kind: 'uncommitted',
      sourceKind: 'unstaged',
      repositoryRoot: '/repo',
      objectFormat: 'sha1',
      changedFiles: [],
      extra: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('UnsupportedAvailabilityReasonSchema changed-during-capture', () => {
  it('accepts changed-during-capture through AvailabilitySchema', () => {
    const result = AvailabilitySchema.safeParse({
      kind: 'unsupported',
      reason: 'changed-during-capture',
    });

    expect(result.success).toBe(true);
  });

  it('includes changed-during-capture as a seventh enum value', () => {
    expect(UnsupportedAvailabilityReasonSchema.options).toContain(
      'changed-during-capture',
    );
    expect(UnsupportedAvailabilityReasonSchema.options).toHaveLength(7);
  });
});
