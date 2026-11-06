<script lang="ts">
export function openCommentSegment(openCommentCount: number): string {
  return openCommentCount === 0 ? '0' : `${openCommentCount} open`;
}

export function staleCommentSegment(staleCommentCount: number): string | undefined {
  return staleCommentCount > 0 ? `${staleCommentCount} stale` : undefined;
}

export function emphasisLabel(attachedLifecycle: 'waiting' | 'finishing' | 'completed' | undefined): string {
  switch (attachedLifecycle) {
    case 'waiting': return 'Finish review';
    case 'finishing': return 'Finishing…';
    case 'completed': return 'Finished';
    default: return 'Export';
  }
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import UiIcon from '../ui/UiIcon.vue';

const props = defineProps<{
  readonly session: SessionResponse;
  readonly identifier: string;
  readonly exportSupported: boolean;
  readonly openCommentCount: number;
  readonly staleCommentCount: number;
  readonly attachedLifecycle?: 'waiting' | 'finishing' | 'completed';
  readonly supportEnabled?: boolean;
  readonly supportInert?: boolean;
  readonly supportOpen?: boolean;
}>();

const emit = defineEmits<{
  openPanel: [tab: 'comments' | 'export'];
  support: [];
}>();

const support = ref<HTMLButtonElement>();

const openSegment = computed(() => openCommentSegment(props.openCommentCount));
const staleSegment = computed(() => staleCommentSegment(props.staleCommentCount));
const emphasizedLabel = computed(() => emphasisLabel(props.attachedLifecycle));
const emphasizedBusy = computed(() => props.attachedLifecycle === 'finishing');

function focusSupport(): void {
  support.value?.focus();
}

defineExpose({ focusSupport });
</script>

<template>
  <footer class="statusbar">
    <div class="statusbar__left">
      <UiIcon name="lock" />
      <span>{{ identifier }}</span>
    </div>
    <div class="statusbar__right" role="toolbar" aria-label="Status bar actions">
      <button
        type="button"
        class="statusbar__item"
        :aria-label="staleSegment === undefined
          ? `Comments: ${openSegment}`
          : `Comments: ${openSegment}, ${staleSegment}`"
        @click="emit('openPanel', 'comments')"
      ><span aria-hidden="true">💬</span> {{ openSegment }}<template v-if="staleSegment !== undefined"> · <span class="statusbar__stale">{{ staleSegment }}</span></template></button>
      <button
        v-if="exportSupported"
        type="button"
        class="statusbar__item statusbar__item--emphasis"
        :disabled="emphasizedBusy"
        :aria-busy="emphasizedBusy"
        @click="emit('openPanel', 'export')"
      >
        {{ emphasizedLabel }}
      </button>
      <button
        v-if="supportEnabled"
        ref="support"
        type="button"
        class="identity-disclosure"
        :disabled="supportInert"
        :aria-expanded="supportOpen"
        @click="emit('support')"
      >
        <span aria-hidden="true">♡</span> Support {{ RENAME_MAP.displayName }}
      </button>
    </div>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  min-width: 0;
  height: var(--statusbar-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}

.statusbar__left,
.statusbar__right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.statusbar__item {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding-block: 0;
}

/* Above the narrow breakpoint the bar is a fixed 22px row, so the disclosure must
   shrink into it. At <=760px styles.css's 44px touch-target arm owns the control. */
@media (min-width: 761px) {
  .statusbar .identity-disclosure {
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding-block: 0;
  }
}

.statusbar__item--emphasis {
  padding-inline: var(--space-2);
  border-radius: var(--radius-control);
  background: var(--interactive-accent-emphasis);
  color: var(--text-on-emphasis);
}

.statusbar__stale {
  color: var(--status-warning-foreground);
}
</style>
