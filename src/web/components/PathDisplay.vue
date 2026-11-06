<script setup lang="ts">
import { computed } from 'vue';

import PathText from './ui/PathText.vue';

import type { SessionFile } from '../../contracts/api.js';

const props = defineProps<{
  file: SessionFile;
  basename?: boolean;
  nameFirst?: boolean;
  query?: string;
}>();

const isMove = computed(
  () => props.file.status.kind === 'renamed' || props.file.status.kind === 'copied',
);
const effectivePath = computed(() => {
  if (props.file.status.kind === 'deleted') {
    return props.file.oldPath;
  }
  return props.file.newPath ?? props.file.oldPath;
});
const moveLabel = computed(() => {
  if (!isMove.value || props.file.oldPath === undefined || props.file.newPath === undefined) {
    return undefined;
  }
  const verb = props.file.status.kind === 'copied' ? 'copied' : 'renamed';
  return `${verb} from ${props.file.oldPath.display} to ${props.file.newPath.display}`;
});
</script>

<template>
  <span
    v-if="isMove && file.oldPath !== undefined && file.newPath !== undefined"
    class="path-display"
    :aria-label="moveLabel"
    :title="moveLabel"
  >
    <span aria-hidden="true" class="path-display__old"><PathText :display="file.oldPath.display" :basename="basename" :name-first="nameFirst" :query="query" /></span>
    <span aria-hidden="true" class="path-display__arrow">→</span>
    <span aria-hidden="true" class="path-display__new"><PathText :display="file.newPath.display" :basename="basename" :name-first="nameFirst" :query="query" /></span>
  </span>
  <span v-else class="path-display" :aria-label="effectivePath?.display" :title="effectivePath?.display">
    <PathText v-if="effectivePath !== undefined" :display="effectivePath.display" :basename="basename" :name-first="nameFirst" :query="query" />
  </span>
</template>
