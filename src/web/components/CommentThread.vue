<script lang="ts">
import type { WorkspaceCommentStatus } from '../model/workspace-state.js';

export type ThreadChipKind = 'resolved' | 'open' | 'stale';

/**
 * Chip priority when a thread's verification state conflicts with its open/resolved state
 * (23-UI-SPEC.md "Chip priority..."): resolved always wins over stale (a resolved thread shows
 * Resolved even if its anchor later drifted); otherwise an open thread with a stale status shows
 * Anchor moved; otherwise Open. Orphaned comments never reach this component — they're routed to
 * the file-level orphaned group by Plan 23-03's projectOrphanedCommentGroup — so there is no
 * fourth "unavailable" chip kind here; a stray orphaned status simply falls through to Open.
 */
export function threadChip(
  comment: { state: 'open' | 'resolved'; status: WorkspaceCommentStatus },
): { kind: ThreadChipKind; label: string } {
  if (comment.state === 'resolved') return { kind: 'resolved', label: 'Resolved' };
  if (comment.status === 'stale') return { kind: 'stale', label: 'Anchor moved' };
  return { kind: 'open', label: 'Open' };
}
</script>

<script setup lang="ts">
import { computed } from 'vue';

import type { WorkspaceComment } from '../model/workspace-state.js';
import InlineNotice from './InlineNotice.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import UiIcon from './ui/UiIcon.vue';

const props = defineProps<{
  comment: WorkspaceComment;
  path: string;
  collapsed: boolean;
  editing: boolean;
  editText: string;
  mutationDisabled?: boolean;
  sideLabel: string;
}>();

const emit = defineEmits<{
  resolve: [];
  reopen: [];
  edit: [];
  delete: [];
  toggleCollapse: [];
  updateEditText: [text: string];
  saveEdit: [];
  cancelEdit: [];
}>();

const chip = computed(() => threadChip(props.comment));

const snippet = computed(() => props.comment.body.split('\n', 1)[0] ?? '');
</script>

<template>
  <article
    class="comment-thread"
    :class="[`comment-thread--${chip.kind}`, { 'comment-thread--collapsed': collapsed }]"
    :data-comment-id="comment.id"
    :aria-label="`Comment thread, ${path}, ${sideLabel} line ${comment.line}`"
  >
    <header class="thread-header" tabindex="-1" @click="emit('toggleCollapse')">
      <span class="directory-row__disclosure" aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
      <span class="thread-header__location">{{ sideLabel }} · L{{ comment.line }}</span>
      <ReviewStateBadge :kind="chip.kind" :label="chip.label" size="compact" />
      <span class="thread-header__snippet">{{ snippet }}</span>
      <div class="thread-header__actions">
        <button
          v-if="comment.state === 'open'"
          type="button"
          class="icon-btn"
          aria-label="Resolve thread"
          title="Resolve thread"
          :disabled="mutationDisabled"
          @click.stop="emit('resolve')"
        >
          <UiIcon name="check" />
        </button>
        <button
          v-else
          type="button"
          class="icon-btn"
          aria-label="Reopen thread"
          title="Reopen thread"
          :disabled="mutationDisabled"
          @click.stop="emit('reopen')"
        >
          <UiIcon name="reopen" />
        </button>
        <button
          v-if="comment.state === 'open'"
          type="button"
          class="icon-btn"
          aria-label="Edit comment"
          title="Edit comment"
          :disabled="mutationDisabled"
          @click.stop="emit('edit')"
        >
          <UiIcon name="edit" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Delete thread"
          title="Delete thread"
          :disabled="mutationDisabled"
          @click.stop="emit('delete')"
        >
          <UiIcon name="delete" />
        </button>
      </div>
    </header>

    <template v-if="!collapsed">
      <div class="conversation-card__body" :class="{ 'inline-comment-composer': editing }">
        <template v-if="editing">
          <textarea
            aria-label="Edit comment"
            :value="editText"
            :disabled="mutationDisabled"
            @input="emit('updateEditText', ($event.target as HTMLTextAreaElement).value)"
          />
          <div class="conversation-card__actions">
            <button
              type="button"
              class="icon-btn"
              aria-label="Save edit"
              title="Save edit"
              :disabled="mutationDisabled"
              @click="emit('saveEdit')"
            >
              <UiIcon name="check" />
            </button>
            <button
              type="button"
              class="icon-btn"
              aria-label="Cancel edit"
              title="Cancel edit"
              :disabled="mutationDisabled"
              @click="emit('cancelEdit')"
            >
              <UiIcon name="close" />
            </button>
          </div>
          <p class="inline-comment-composer__support">⌘Enter to save · Esc to cancel</p>
        </template>
        <template v-else>
          <InlineNotice v-if="chip.kind === 'stale'" tone="warning">
            <p>Line changed after this comment. Export marks it <strong>stale</strong>; re-anchor or keep as is.</p>
            <p>&quot;{{ comment.recordedAnchor.selectedText }}&quot;</p>
          </InlineNotice>
          <p>{{ comment.body }}</p>
        </template>
      </div>
      <footer class="conversation-card__footer">
        <span class="comment-badge">Saved locally</span>
      </footer>
    </template>
  </article>
</template>
