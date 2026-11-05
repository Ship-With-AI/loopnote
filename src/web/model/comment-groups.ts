export type ReviewPathIdentity = Readonly<{
  bytesBase64url: string;
  display: string;
}>;

export type ReviewCommentProjection = Readonly<{
  id: string;
  state: 'open' | 'resolved';
  body: string;
  side: 'base' | 'head';
  line: number;
  createdAt: string;
  path: ReviewPathIdentity;
}>;

export type ChangedFileInventoryEntry = Readonly<{
  identity: string;
  display: string;
}>;

export type CommentGroup = Readonly<{
  path: ReviewPathIdentity;
  comments: readonly ReviewCommentProjection[];
}>;

function pathBytes(identity: string): Uint8Array {
  const padded = identity.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(identity.length / 4) * 4, '=');
  const decoded = globalThis.atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function orderPathIdentity(left: string, right: string): number {
  const leftBytes = pathBytes(left);
  const rightBytes = pathBytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

export function orderText(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function orderComments(left: ReviewCommentProjection, right: ReviewCommentProjection): number {
  const side = (left.side === 'base' ? 0 : 1) - (right.side === 'base' ? 0 : 1);
  if (side !== 0) return side;
  if (left.line !== right.line) return left.line - right.line;
  if (left.createdAt !== right.createdAt) return orderText(left.createdAt, right.createdAt);
  return orderText(left.id, right.id);
}

function groupsForState(
  comments: readonly ReviewCommentProjection[],
  inventory: readonly ChangedFileInventoryEntry[],
  state: ReviewCommentProjection['state'],
): readonly CommentGroup[] {
  const inventoryOrder = new Map(inventory.map((entry, index) => [entry.identity, index]));
  const groups = new Map<string, { path: ReviewPathIdentity; comments: ReviewCommentProjection[] }>();
  for (const comment of comments) {
    if (comment.state !== state) continue;
    const group = groups.get(comment.path.bytesBase64url) ?? { path: comment.path, comments: [] };
    group.comments.push(comment);
    groups.set(comment.path.bytesBase64url, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftInventory = inventoryOrder.get(left);
      const rightInventory = inventoryOrder.get(right);
      if (leftInventory !== undefined && rightInventory !== undefined) return leftInventory - rightInventory;
      if (leftInventory !== undefined) return -1;
      if (rightInventory !== undefined) return 1;
      return orderPathIdentity(left, right);
    })
    .map(([, group]) => ({
      path: group.path,
      comments: [...group.comments].sort(orderComments),
    }));
}

export type CommentGroupSections = Readonly<{
  open: readonly CommentGroup[];
  resolved: readonly CommentGroup[];
}>;

export function projectCommentGroups(
  comments: readonly ReviewCommentProjection[],
  inventory: readonly ChangedFileInventoryEntry[],
): CommentGroupSections {
  return {
    open: groupsForState(comments, inventory, 'open'),
    resolved: groupsForState(comments, inventory, 'resolved'),
  };
}
