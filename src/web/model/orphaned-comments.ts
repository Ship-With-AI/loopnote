import { orderPathIdentity, orderText } from './comment-groups.js';
import type { RecordedAnchorDetails, WorkspaceComment } from './workspace-state.js';

export type OrphanedCommentGroup = Readonly<{
  path: RecordedAnchorDetails['path'];
  comments: readonly WorkspaceComment[];
}>;

function orderOrphanedComments(left: WorkspaceComment, right: WorkspaceComment): number {
  const side = (left.side === 'base' ? 0 : 1) - (right.side === 'base' ? 0 : 1);
  if (side !== 0) return side;
  if (left.line !== right.line) return left.line - right.line;
  if (left.createdAt !== right.createdAt) return orderText(left.createdAt, right.createdAt);
  return orderText(left.id, right.id);
}

export function projectOrphanedCommentGroup(comments: readonly WorkspaceComment[]): readonly OrphanedCommentGroup[] {
  const groups = new Map<string, { path: RecordedAnchorDetails['path']; comments: WorkspaceComment[] }>();

  for (const comment of comments) {
    if (comment.status !== 'orphaned') continue;
    const key = comment.recordedAnchor.path.bytesBase64url;
    const group = groups.get(key) ?? { path: comment.recordedAnchor.path, comments: [] };
    group.comments.push(comment);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => orderPathIdentity(left, right))
    .map(([, group]) => ({
      path: group.path,
      comments: [...group.comments].sort(orderOrphanedComments),
    }));
}
