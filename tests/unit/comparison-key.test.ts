import { describe, expect, test } from 'vitest';

import {
  comparisonKey,
  rangeReviewKey,
  uncommittedReviewKey,
} from '../../src/domain/comparison-key.js';

const sha1Base = 'a'.repeat(40);
const sha1Head = 'b'.repeat(40);
const sha256Base = 'c'.repeat(64);
const sha256Head = 'd'.repeat(64);

describe('comparisonKey', () => {
  test('is stable for identical opaque full selected endpoint OIDs', () => {
    expect(comparisonKey(sha1Base, sha1Head)).toBe(comparisonKey(sha1Base, sha1Head));
    expect(comparisonKey(sha1Base, sha1Head)).toMatch(/^[0-9a-f]{64}$/u);
    expect(comparisonKey(sha256Base, sha256Head)).toMatch(/^[0-9a-f]{64}$/u);
  });

  test('frames the ordered selected base and head identities independently', () => {
    const original = comparisonKey(sha1Base, sha1Head);

    expect(comparisonKey(sha1Head, sha1Base)).not.toBe(original);
    expect(comparisonKey('e'.repeat(40), sha1Head)).not.toBe(original);
    expect(comparisonKey(sha1Base, 'f'.repeat(40))).not.toBe(original);
  });

  test('does not derive comparison identity from labels, refs, paths, short IDs, or merge base', () => {
    const selectedBase = '0123456789abcdef0123456789abcdef01234567';
    const selectedHead = '89abcdef0123456789abcdef0123456789abcdef';

    expect(comparisonKey(selectedBase, selectedHead)).toBe(
      comparisonKey(selectedBase, selectedHead),
    );
    expect(comparisonKey(selectedBase, selectedHead)).not.toBe(
      comparisonKey(selectedBase.slice(0, 12), selectedHead),
    );
  });
});

describe('rangeReviewKey', () => {
  test('is stable only for identical pinned OIDs and exact ordered pathspecs', () => {
    const scope = ['src/**/*.ts', ':(exclude)src/generated/**'] as const;
    const original = rangeReviewKey(sha1Base, sha1Head, scope);

    expect(original).toBe(rangeReviewKey(sha1Base, sha1Head, scope));
    expect(original).toMatch(/^[0-9a-f]{64}$/u);
    expect(rangeReviewKey(sha256Base, sha256Head, scope)).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });

  test('frames each ordered pathspec independently in a separate domain', () => {
    const scope = ['src/**/*.ts', ':(exclude)src/generated/**'] as const;
    const original = rangeReviewKey(sha1Base, sha1Head, scope);

    expect(rangeReviewKey(sha1Head, sha1Base, scope)).not.toBe(original);
    expect(rangeReviewKey(sha1Base, sha1Head, [...scope].reverse())).not.toBe(
      original,
    );
    expect(
      rangeReviewKey(sha1Base, sha1Head, [
        'src/**/*.ts:(exclude)src/generated/**',
      ]),
    ).not.toBe(original);
    expect(rangeReviewKey(sha1Base, sha1Head, [])).not.toBe(original);
    expect(original).not.toBe(comparisonKey(sha1Base, sha1Head));
  });
});

describe('uncommittedReviewKey', () => {
  test('is stable deterministic hash matching 64 hex characters', () => {
    const digest = sha256Head;

    expect(uncommittedReviewKey('staged', sha1Base, digest)).toBe(
      uncommittedReviewKey('staged', sha1Base, digest),
    );
    expect(uncommittedReviewKey('staged', sha1Base, digest)).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });

  test('differs when firstSnapshotDigest differs for same sourceKind and base (WTREE-05)', () => {
    const original = uncommittedReviewKey('staged', sha1Base, sha256Head);

    expect(uncommittedReviewKey('staged', sha1Base, sha256Base)).not.toBe(
      original,
    );
  });

  test('differs when sourceKind differs for same base and digest', () => {
    const original = uncommittedReviewKey('staged', sha1Base, sha256Head);

    expect(uncommittedReviewKey('worktree', sha1Base, sha256Head)).not.toBe(
      original,
    );
  });

  test('does not collide undefined base with empty-string base across sourceKind', () => {
    expect(uncommittedReviewKey('unstaged', undefined, sha256Head)).not.toBe(
      uncommittedReviewKey('staged', '', sha256Head),
    );
  });

  test('keeps uncommitted keys in a disjoint hash space from comparisonKey and rangeReviewKey', () => {
    const key = uncommittedReviewKey('staged', sha1Base, sha256Head);

    expect(key).not.toBe(comparisonKey(sha1Base, sha256Head));
    expect(key).not.toBe(rangeReviewKey(sha1Base, sha256Head, []));
  });
});
