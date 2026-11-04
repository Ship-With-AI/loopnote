<script setup lang="ts">
import { ref } from 'vue';

import type { SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import UiIcon from '../ui/UiIcon.vue';

defineProps<{
  readonly session: SessionResponse;
  readonly snapshotLabel: string;
  readonly exportSupported: boolean;
  readonly openCommentCount: number;
  readonly supportEnabled?: boolean;
  readonly supportInert?: boolean;
  readonly supportOpen?: boolean;
}>();

const emit = defineEmits<{
  openPanel: [];
  support: [];
}>();

const support = ref<HTMLButtonElement>();

function focusSupport(): void {
  support.value?.focus();
}

defineExpose({ focusSupport });
</script>

<template>
  <footer class="statusbar">
    <div class="statusbar__left">
      <UiIcon name="lock" />
      <span>{{ snapshotLabel }}</span>
    </div>
    <div class="statusbar__right">
      <button
        type="button"
        class="statusbar__item"
        @click="emit('openPanel')"
      >
        {{ openCommentCount }} open comments
      </button>
      <button
        type="button"
        class="statusbar__item"
        :class="{ 'statusbar__item--emphasis': exportSupported }"
        @click="emit('openPanel')"
      >
        Export
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
        Support {{ RENAME_MAP.displayName }}
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
}

.statusbar__item,
.statusbar .identity-disclosure {
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding-block: 0;
}

.statusbar__item--emphasis {
  padding-inline: var(--space-2);
  border-radius: var(--radius-control);
  background: var(--interactive-accent-emphasis);
  color: var(--text-on-emphasis);
}
</style>
