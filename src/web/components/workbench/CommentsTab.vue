<script setup lang="ts">
import { computed, ref } from 'vue';

import { fileTypeMarkFor } from '../../model/file-tree.js';
import type { VisibleFileTreeLeaf } from '../../model/file-tree.js';
import { projectCommentsTabFileGroups } from '../../model/comments-tab-groups.js';
import type { CommentsTabBucket, CommentsTabRow } from '../../model/comments-tab-groups.js';
import { projectOrphanedCommentGroup } from '../../model/orphaned-comments.js';
import type { WorkspaceComment } from '../../model/workspace-state.js';
import PathText from '../ui/PathText.vue';
import ReviewStateBadge from '../ui/ReviewStateBadge.vue';
import UiIcon, { type UiIconName } from '../ui/UiIcon.vue';

const props = defineProps<{
  comments: readonly WorkspaceComment[];
  flatFileRows: readonly VisibleFileTreeLeaf[];
}>();

const emit = defineEmits<{
  reveal: [commentId: string, fileId: string, side: WorkspaceComment['side'], line: number];
}>();

const fileGroups = computed(() => projectCommentsTabFileGroups(props.comments, props.flatFileRows));
const orphanedGroups = computed(() => projectOrphanedCommentGroup(props.comments));

// Session-local file-group disclosure state — never lifted to BottomPanel.vue/App.vue,
// per 24-PATTERNS.md's disclosure-state rule (same precedent as SummarySection.vue:25 /
// ExportSection.vue:44's own local `open` refs). Default expanded: a group is collapsed
// only once its fileId is explicitly set `true` in this map.
const collapsedByFileId = ref(new Map<string, boolean>());

function isCollapsed(fileId: string): boolean {
  return collapsedByFileId.value.get(fileId) ?? false;
}

function toggleFileGroup(fileId: string): void {
  const next = new Map(collapsedByFileId.value);
  next.set(fileId, !isCollapsed(fileId));
  collapsedByFileId.value = next;
}

const BUCKET_ICON: Readonly<Record<CommentsTabBucket, UiIconName>> = {
  open: 'comment',
  stale: 'warning',
  resolved: 'check',
};

function groupPath(leaf: VisibleFileTreeLeaf): string | undefined {
  return leaf.file.newPath?.display ?? leaf.file.oldPath?.display;
}

function groupMark(leaf: VisibleFileTreeLeaf): Readonly<{ text: string; tone: string }> {
  return fileTypeMarkFor(groupPath(leaf));
}

function sideLineLabel(row: CommentsTabRow): string {
  return `${row.comment.side === 'base' ? 'B' : 'H'}${row.comment.line}`;
}
</script>

<template>
  <div class="comments-tab">
    <p v-if="comments.length === 0" class="comments-tab__empty">
      No comments yet. Hover a line number in the diff and click +.
    </p>

    <ul v-else class="comments-tab__groups" role="list">
      <li v-for="group in fileGroups" :key="group.leaf.fileId" class="comments-tab__group">
        <div
          class="comments-tab__group-header"
          role="button"
          tabindex="0"
          :aria-expanded="!isCollapsed(group.leaf.fileId)"
          @click="toggleFileGroup(group.leaf.fileId)"
          @keydown.enter="toggleFileGroup(group.leaf.fileId)"
        >
          <span class="directory-row__disclosure" aria-hidden="true">{{ isCollapsed(group.leaf.fileId) ? '▸' : '▾' }}</span>
          <span class="ft" aria-hidden="true" :style="{ color: `var(${groupMark(group.leaf).tone})` }">{{ groupMark(group.leaf).text }}</span>
          <PathText class="comments-tab__group-path" :display="groupPath(group.leaf) ?? ''" />
          <span class="comments-tab__group-count">{{ group.rows.length }}</span>
        </div>

        <ul v-if="!isCollapsed(group.leaf.fileId)" class="comments-tab__rows" role="list">
          <li
            v-for="row in group.rows"
            :key="row.comment.id"
            class="comments-tab__row"
            :class="`comments-tab__row--${row.bucket}`"
            role="button"
            tabindex="0"
            @click="emit('reveal', row.comment.id, group.leaf.fileId, row.comment.side, row.comment.line)"
            @keydown.enter="emit('reveal', row.comment.id, group.leaf.fileId, row.comment.side, row.comment.line)"
          >
            <UiIcon :name="BUCKET_ICON[row.bucket]" class="comments-tab__row-icon" />
            <span class="comments-tab__row-text">{{ row.comment.body }}</span>
            <span class="comments-tab__row-location">{{ sideLineLabel(row) }}</span>
          </li>
        </ul>
      </li>

      <li
        v-for="group in orphanedGroups"
        :key="group.path.bytesBase64url"
        class="comments-tab__group comments-tab__group--orphaned"
      >
        <div class="comments-tab__group-header comments-tab__group-header--orphaned">
          <PathText class="comments-tab__group-path" :display="group.path.display" />
        </div>

        <ul class="comments-tab__rows" role="list">
          <li v-for="comment in group.comments" :key="comment.id" class="comments-tab__row comments-tab__row--orphaned">
            <UiIcon name="warning" class="comments-tab__row-icon" />
            <span class="comments-tab__row-text">{{ comment.body }}</span>
            <ReviewStateBadge kind="unavailable" label="Anchor missing" size="compact" />
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.comments-tab {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.comments-tab__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}

.comments-tab__groups,
.comments-tab__rows {
  display: flex;
  min-width: 0;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comments-tab__group + .comments-tab__group {
  margin-top: var(--space-3);
}

.comments-tab__group-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
  font-size: var(--font-size-chrome);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-chrome);
}

.comments-tab__group-header--orphaned {
  cursor: default;
}

.comments-tab__group-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comments-tab__group-count {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
  line-height: var(--line-height-metadata);
}

.comments-tab__rows {
  padding-inline-start: var(--space-4);
}

.comments-tab__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-1);
  cursor: pointer;
  color: var(--text-primary);
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}

.comments-tab__row--resolved {
  color: var(--text-muted);
}

.comments-tab__row--orphaned {
  cursor: default;
  color: var(--text-muted);
}

.comments-tab__row-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comments-tab__row-location {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-metadata);
  line-height: var(--line-height-metadata);
}

.comments-tab__row--stale .comments-tab__row-location {
  color: var(--status-warning-foreground);
}
</style>
