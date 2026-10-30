<script setup lang="ts">
import { computed } from 'vue';

import type { ChangedFileStatusKind } from '../../contracts/comparison.js';

const props = defineProps<{
  kind: ChangedFileStatusKind;
  reviewable?: boolean;
}>();

const presentation = computed(() => {
  switch (props.kind) {
    case 'added':
      return { label: 'Added', text: 'A', tone: 'added' };
    case 'copied':
      return { label: 'Copied', text: 'C', tone: 'moved' };
    case 'deleted':
      return { label: 'Deleted', text: 'D', tone: 'deleted' };
    case 'modified':
      return { label: 'Modified', text: 'M', tone: 'modified' };
    case 'renamed':
      return { label: 'Renamed', text: 'R', tone: 'moved' };
    case 'type-changed':
    case 'unsupported':
      return { label: 'Mode changed', text: 'Mode', tone: 'modified' };
  }
});

const singlePaneSuffix = computed(() =>
  props.reviewable &&
  (props.kind === 'added' ||
    props.kind === 'deleted' ||
    props.kind === 'type-changed')
    ? ', single pane'
    : '',
);
</script>

<template>
  <span class="status-badge" :class="`status-badge--${presentation.tone}`">
    <span aria-hidden="true">{{ presentation.text }}</span>
    <span class="visually-hidden">{{ presentation.label }}{{ singlePaneSuffix }}</span>
  </span>
</template>
