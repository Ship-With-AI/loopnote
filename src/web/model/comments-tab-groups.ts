import type { VisibleFileTreeLeaf } from './file-tree.js';
import type { WorkspaceComment } from './workspace-state.js';

export type CommentsTabBucket = 'open' | 'stale' | 'resolved';

export type CommentsTabRow = Readonly<{
  comment: WorkspaceComment;
  bucket: CommentsTabBucket;
}>;

export type CommentsTabFileGroup = Readonly<{
  leaf: VisibleFileTreeLeaf;
  rows: readonly CommentsTabRow[];
}>;

const BUCKET_RANK: Readonly<Record<CommentsTabBucket, number>> = {
  open: 0,
  stale: 1,
  resolved: 2,
};

function bucketFor(comment: WorkspaceComment): CommentsTabBucket {
  if (comment.state === 'resolved') return 'resolved';
  if (comment.status === 'stale') return 'stale';
  return 'open';
}

function orderText(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function orderRows(left: CommentsTabRow, right: CommentsTabRow): number {
  const bucketOrder = BUCKET_RANK[left.bucket] - BUCKET_RANK[right.bucket];
  if (bucketOrder !== 0) return bucketOrder;
  if (left.comment.line !== right.comment.line) return left.comment.line - right.comment.line;
  return orderText(left.comment.id, right.comment.id);
}

/**
 * Groups comments file-outer (in `flatFileRows` tree order) then
 * state-inner (open -> stale -> resolved, resolved wins over stale per
 * 23-UI-SPEC.md's chip-priority rule, each bucket ordered by line
 * ascending). Orphaned comments (`status === 'orphaned'`) and comments
 * whose `fileId` is `null` or has no matching entry in `flatFileRows` are
 * excluded entirely; a file with zero matching comments produces no group.
 */
export function projectCommentsTabFileGroups(
  comments: readonly WorkspaceComment[],
  flatFileRows: readonly VisibleFileTreeLeaf[],
): readonly CommentsTabFileGroup[] {
  const fileOrder = new Map(flatFileRows.map((row, index) => [row.fileId, index]));

  const rowsByFileId = new Map<string, CommentsTabRow[]>();
  for (const comment of comments) {
    if (comment.status === 'orphaned') continue;
    if (comment.fileId === null) continue;
    if (!fileOrder.has(comment.fileId)) continue;
    const rows = rowsByFileId.get(comment.fileId) ?? [];
    rows.push({ comment, bucket: bucketFor(comment) });
    rowsByFileId.set(comment.fileId, rows);
  }

  return [...rowsByFileId.entries()]
    .sort(([leftFileId], [rightFileId]) => fileOrder.get(leftFileId)! - fileOrder.get(rightFileId)!)
    .map(([fileId, rows]) => ({
      leaf: flatFileRows[fileOrder.get(fileId)!]!,
      rows: [...rows].sort(orderRows),
    }));
}
