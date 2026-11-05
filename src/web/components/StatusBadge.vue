<script setup lang="ts">
import { computed } from 'vue';

import type { ChangedFileStatusKind } from '../../contracts/comparison.js';
import { isSinglePaneStatusKind } from '../model/single-pane-layout.js';

const props = defineProps<{
  kind: ChangedFileStatusKind;
  code: string;
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
      return { label: 'type changed', text: 'T', tone: 'modified' };
    case 'unsupported':
      return { label: `unsupported status: ${props.code}`, text: props.code, tone: 'warning' };
  }
});

const singlePaneSuffix = computed(() =>
  props.reviewable && isSinglePaneStatusKind(props.kind)
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
