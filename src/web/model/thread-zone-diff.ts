import type { WorkspaceComment } from './workspace-state.js';

export type ThreadZoneDiff = Readonly<{
  toCreate: readonly string[];
  toRemove: readonly string[];
  toKeep: readonly string[];
}>;

export function diffThreadIds(previous: ReadonlySet<string>, next: readonly WorkspaceComment[]): ThreadZoneDiff {
  const nextIds = new Set(next.map((comment) => comment.id));
  const toCreate: string[] = [];
  const toKeep: string[] = [];

  for (const id of nextIds) {
    (previous.has(id) ? toKeep : toCreate).push(id);
  }

  const toRemove = [...previous].filter((id) => !nextIds.has(id));

  return { toCreate, toRemove, toKeep };
}
