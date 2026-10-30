<script setup lang="ts">
import { computed } from 'vue';

import UiIcon, { type UiIconName } from './ui/UiIcon.vue';

const props = withDefaults(
  defineProps<{
    readonly tone?: 'neutral' | 'information' | 'success' | 'warning' | 'error';
    readonly role?: 'alert' | 'note' | 'status';
    readonly dismissible?: boolean;
    readonly dismissLabel?: string;
  }>(),
  {
    tone: 'neutral',
    role: 'note',
    dismissible: false,
  },
);

const emit = defineEmits<{ dismiss: [] }>();

const toneIcon = computed<UiIconName>(() => {
  switch (props.tone) {
    case 'neutral':
    case 'information':
      return 'information';
    case 'success':
      return 'check';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
  }
});
</script>

<template>
  <aside class="inline-notice" :class="`inline-notice--${tone}`" :role="role">
    <UiIcon :name="toneIcon" class="inline-notice__icon" />
    <div class="inline-notice__content">
      <slot />
      <button
        v-if="dismissible"
        type="button"
        class="ui-button"
        :aria-label="dismissLabel"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
  </aside>
</template>
