import { createHash } from 'node:crypto';

const DOMAIN = Buffer.from('cumpa-comparison-key-v1', 'utf8');
const RANGE_DOMAIN = Buffer.from('cumpa-range-review-key-v1', 'utf8');
const UNCOMMITTED_DOMAIN = Buffer.from('cumpa-uncommitted-review-key-v1', 'utf8');
const encoder = new TextEncoder();

function frame(value: string): Buffer {
  const bytes = encoder.encode(value);
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  return Buffer.concat([length, bytes]);
}

/**
 * Computes the repository-local draft identity for an ordered pinned comparison.
 * Labels, refs, merge bases, and paths deliberately never enter this namespace.
 */
export function comparisonKey(baseCommitOid: string, headCommitOid: string): string {
  const hash = createHash('sha256');
  hash.update(DOMAIN);
  hash.update(frame(baseCommitOid));
  hash.update(frame(headCommitOid));
  return hash.digest('hex');
}

export function rangeReviewKey(
  baseCommitOid: string,
  headCommitOid: string,
  pathspecs: readonly string[],
): string {
  const hash = createHash('sha256');
  hash.update(RANGE_DOMAIN);
  hash.update(frame(baseCommitOid));
  hash.update(frame(headCommitOid));
  for (const pathspec of pathspecs) {
    hash.update(frame(pathspec));
  }
  return hash.digest('hex');
}

export function uncommittedReviewKey(
  sourceKind: 'staged' | 'unstaged' | 'worktree',
  baseCommitOid: string | undefined,
  firstSnapshotDigest: string,
): string {
  const hash = createHash('sha256');
  hash.update(UNCOMMITTED_DOMAIN);
  hash.update(frame(sourceKind));
  hash.update(frame(baseCommitOid ?? ''));
  hash.update(frame(firstSnapshotDigest));
  return hash.digest('hex');
}
