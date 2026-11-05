import { describe, expect, it } from 'vitest';

import type { SessionResponse } from '../../src/contracts/api';
import {
  identityAccessibleName,
  identityCanRefresh,
  identityDriftKind,
  identityKind,
} from '../../src/web/components/workbench/IdentityPill.vue';

const BASE_OID = '4f2a91c4f2a91c4f2a91c4f2a91c4f2a91c4f2a';
const HEAD_OID = '9c03e7d9c03e7d9c03e7d9c03e7d9c03e7d9c03';
const MERGE_BASE_OID = '0000000000000000000000000000000000000f';
const REVIEW_KEY = 'dde98ebdde98ebdde98ebdde98ebdde98ebdde98ebdde98ebdde98ebdde98eb';
const PATCH_DIGEST = 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123ab';

const branchSession: SessionResponse = {
  base: { label: 'main', oid: BASE_OID },
  head: { label: 'feat/x', oid: HEAD_OID },
  mergeBaseOid: MERGE_BASE_OID,
  files: [],
};

const worktreeSession: SessionResponse = {
  base: { label: 'main', oid: BASE_OID },
  head: { label: 'feat/x', oid: HEAD_OID, worktree: { path: '/repo/wt', dirty: false } },
  mergeBaseOid: MERGE_BASE_OID,
  files: [],
};

const rangeSession: SessionResponse = {
  base: { label: 'main', oid: BASE_OID },
  head: { label: 'feat/x', oid: HEAD_OID },
  mergeBaseOid: MERGE_BASE_OID,
  range: { kind: 'revisions', baseOid: BASE_OID, headOid: HEAD_OID, pathspecs: [] },
  files: [],
};

const exactPatchSession: SessionResponse = {
  patch: {
    kind: 'exact-patch',
    digest: PATCH_DIGEST,
    reviewKey: REVIEW_KEY,
    validationTarget: { kind: 'repository' },
    changedFileCount: 3,
  },
  files: [],
};

const stagedSession: SessionResponse = {
  uncommitted: {
    kind: 'uncommitted',
    sourceKind: 'staged',
    baseCommitOid: BASE_OID,
    reviewKey: REVIEW_KEY,
    changedFileCount: 2,
  },
  files: [],
};

const unstagedSession: SessionResponse = {
  uncommitted: {
    kind: 'uncommitted',
    sourceKind: 'unstaged',
    reviewKey: REVIEW_KEY,
    changedFileCount: 2,
  },
  files: [],
};

const workingTreeSession: SessionResponse = {
  uncommitted: {
    kind: 'uncommitted',
    sourceKind: 'worktree',
    baseCommitOid: BASE_OID,
    reviewKey: REVIEW_KEY,
    changedFileCount: 2,
  },
  files: [],
};

const standaloneSession: SessionResponse = {
  uncommitted: {
    kind: 'uncommitted',
    sourceKind: 'standalone',
    reviewKey: REVIEW_KEY,
    changedFileCount: 9,
  },
  files: [],
};

describe('identityKind', () => {
  it('discriminates every SessionResponse shape into the correct IdentityKind', () => {
    expect(identityKind(branchSession)).toBe('branch');
    expect(identityKind(worktreeSession)).toBe('worktree');
    expect(identityKind(rangeSession)).toBe('range');
    expect(identityKind(exactPatchSession)).toBe('exact-patch');
    expect(identityKind(stagedSession)).toBe('staged');
    expect(identityKind(unstagedSession)).toBe('unstaged');
    expect(identityKind(workingTreeSession)).toBe('working-tree');
    expect(identityKind(standaloneSession)).toBe('standalone');
  });
});

describe('identityCanRefresh', () => {
  it('is true only for uncommitted/standalone kinds', () => {
    expect(identityCanRefresh('staged')).toBe(true);
    expect(identityCanRefresh('unstaged')).toBe(true);
    expect(identityCanRefresh('working-tree')).toBe(true);
    expect(identityCanRefresh('standalone')).toBe(true);
    expect(identityCanRefresh('branch')).toBe(false);
    expect(identityCanRefresh('worktree')).toBe(false);
    expect(identityCanRefresh('range')).toBe(false);
    expect(identityCanRefresh('exact-patch')).toBe(false);
  });
});

describe('identityDriftKind', () => {
  it('prioritizes patch drift over everything else', () => {
    expect(identityDriftKind(true, undefined, true)).toBe('patch');
  });

  it('reports selector drift only when selectorDriftStatus actually carries a moved/unavailable role', () => {
    expect(
      identityDriftKind(false, {
        base: { kind: 'moved', role: 'base', label: 'main', selectorType: 'branch', oldOid: BASE_OID, newOid: HEAD_OID },
        head: { kind: 'unchanged', role: 'head' },
      }, false),
    ).toBe('selector');
  });

  it('does not report selector drift when both sides are unchanged', () => {
    expect(
      identityDriftKind(false, {
        base: { kind: 'unchanged', role: 'base' },
        head: { kind: 'unchanged', role: 'head' },
      }, false),
    ).toBeUndefined();
  });

  it('does not falsely report selector drift when selectorDriftStatus is undefined (uncommitted sessions never populate it)', () => {
    // Regression guard: a naive `selectorDriftStatus?.base.kind !== 'unchanged'` check evaluates
    // true when selectorDriftStatus is undefined, which would permanently warn on every
    // staged/unstaged/working-tree/standalone session (the server never serves
    // /api/selector-drift for those kinds, so the ref stays undefined forever).
    expect(identityDriftKind(false, undefined, false)).toBeUndefined();
  });

  it('falls back to worktree drift when nothing else applies', () => {
    expect(identityDriftKind(false, undefined, true)).toBe('worktree');
  });

  it('is undefined when nothing has drifted', () => {
    expect(
      identityDriftKind(false, {
        base: { kind: 'unchanged', role: 'base' },
        head: { kind: 'unchanged', role: 'head' },
      }, false),
    ).toBeUndefined();
  });
});

describe('identityAccessibleName', () => {
  it('builds the branch/worktree template from full untruncated label/oid strings', () => {
    expect(identityAccessibleName(branchSession, 'branch', undefined, false)).toBe(
      'Comparison: Base main at 4f2a91c, Head feat/x at 9c03e7d. Opens comparison details.',
    );
  });

  it('builds the range template without SHAs', () => {
    expect(identityAccessibleName(rangeSession, 'range', undefined, false)).toBe(
      'Comparison: pinned revisions main to feat/x. Opens comparison details.',
    );
  });

  it('uses the literal exact-patch template', () => {
    expect(identityAccessibleName(exactPatchSession, 'exact-patch', undefined, false)).toBe(
      'Comparison: Repository object to Implemented content, frozen patch. Opens comparison details.',
    );
  });

  it('builds the staged template from the base commit oid', () => {
    expect(identityAccessibleName(stagedSession, 'staged', undefined, false)).toBe(
      'Comparison: HEAD at 4f2a91c to Staged changes. Opens comparison details.',
    );
  });

  it('uses the literal unstaged template', () => {
    expect(identityAccessibleName(unstagedSession, 'unstaged', undefined, false)).toBe(
      'Comparison: Index to Unstaged changes. Opens comparison details.',
    );
  });

  it('builds the working-tree template from the base commit oid', () => {
    expect(identityAccessibleName(workingTreeSession, 'working-tree', undefined, false)).toBe(
      'Comparison: HEAD at 4f2a91c to Working tree. Opens comparison details.',
    );
  });

  it('builds the standalone template from the changed file count', () => {
    expect(identityAccessibleName(standaloneSession, 'standalone', undefined, false)).toBe(
      'Comparison: Standalone review, 9 files. Opens comparison details.',
    );
  });

  it('appends the drift suffix when driftKind is set', () => {
    expect(identityAccessibleName(branchSession, 'branch', 'selector', false)).toBe(
      'Comparison: Base main at 4f2a91c, Head feat/x at 9c03e7d. Opens comparison details. Source changed since this review was pinned.',
    );
  });

  it('appends the capturing suffix when refreshBusy is true and nothing has drifted', () => {
    expect(identityAccessibleName(stagedSession, 'staged', undefined, true)).toBe(
      'Comparison: HEAD at 4f2a91c to Staged changes. Opens comparison details. Capturing current changes.',
    );
  });
});
