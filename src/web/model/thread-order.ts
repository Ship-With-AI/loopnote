import type { DiffSide } from '../monaco/line-mapping.js';
import type { VisibleFileTreeLeaf } from './file-tree.js';
import type { WorkspaceComment } from './workspace-state.js';

export type ThreadOrderEntry = Readonly<{
  commentId: string;
  fileId: string;
  side: DiffSide;
  line: number;
}>;

export type ThreadNavigationResult = Readonly<{
  entry: ThreadOrderEntry;
  wrapped: boolean;
}>;

/**
 * Flattens comments into cross-file navigation order: tree path order (per
 * `flatFileRows`, already produced by `file-tree.ts` — never re-derived here),
 * then Base before Head, then line number ascending. Orphaned comments
 * (`fileId === null`) and comments whose file is not present in
 * `flatFileRows` (not currently visible in the tree) are excluded.
 */
export function flattenThreadOrder(
  comments: readonly WorkspaceComment[],
  flatFileRows: readonly VisibleFileTreeLeaf[],
): readonly ThreadOrderEntry[] {
  const treeIndexByFileId = new Map<string, number>(
    flatFileRows.map((row, index) => [row.fileId, index]),
  );

  const entries: ThreadOrderEntry[] = [];
  for (const comment of comments) {
    if (comment.fileId === null) continue;
    if (!treeIndexByFileId.has(comment.fileId)) continue;
    entries.push({
      commentId: comment.id,
      fileId: comment.fileId,
      side: comment.side,
      line: comment.line,
    });
  }

  return entries.sort((left, right) => {
    const treeOrder = treeIndexByFileId.get(left.fileId)! - treeIndexByFileId.get(right.fileId)!;
    if (treeOrder !== 0) return treeOrder;
    const sideOrder = (left.side === 'base' ? 0 : 1) - (right.side === 'base' ? 0 : 1);
    if (sideOrder !== 0) return sideOrder;
    return left.line - right.line;
  });
}

/**
 * Returns the entry immediately after `currentCommentId`'s position in
 * `order` (or the first entry when `currentCommentId` is undefined or not
 * found in `order`). `wrapped` is true only when stepping past the last
 * entry back to the first.
 */
export function nextThread(
  order: readonly ThreadOrderEntry[],
  currentCommentId: string | undefined,
): ThreadNavigationResult | undefined {
  if (order.length === 0) return undefined;

  const currentIndex = currentCommentId === undefined
    ? -1
    : order.findIndex((entry) => entry.commentId === currentCommentId);

  const rawNextIndex = currentIndex + 1;
  const wrapped = rawNextIndex >= order.length;
  const nextIndex = wrapped ? 0 : rawNextIndex;
  return { entry: order[nextIndex]!, wrapped };
}

/**
 * Mirror of `nextThread`: returns the entry immediately before
 * `currentCommentId`'s position in `order` (or the last entry when
 * `currentCommentId` is undefined or not found in `order`). `wrapped` is
 * true only when stepping before the first entry to the last.
 */
export function previousThread(
  order: readonly ThreadOrderEntry[],
  currentCommentId: string | undefined,
): ThreadNavigationResult | undefined {
  if (order.length === 0) return undefined;

  const currentIndex = currentCommentId === undefined
    ? order.length
    : (() => {
        const found = order.findIndex((entry) => entry.commentId === currentCommentId);
        return found === -1 ? order.length : found;
      })();

  const rawPreviousIndex = currentIndex - 1;
  const wrapped = rawPreviousIndex < 0;
  const previousIndex = wrapped ? order.length - 1 : rawPreviousIndex;
  return { entry: order[previousIndex]!, wrapped };
}
