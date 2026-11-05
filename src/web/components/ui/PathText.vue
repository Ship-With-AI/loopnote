<script setup lang="ts">
import { computed } from 'vue';

import { highlightMatches } from '../../model/file-tree.js';

const props = defineProps<{
  display: string;
  basename?: boolean;
  query?: string;
}>();

const directory = computed(() => {
  const lastSlash = props.display.lastIndexOf('/');
  return lastSlash === -1 ? '' : props.display.slice(0, lastSlash + 1);
});
const filename = computed(() => props.display.slice(directory.value.length));
const directorySegments = computed(() => highlightMatches(directory.value, props.query ?? ''));
const filenameSegments = computed(() => highlightMatches(filename.value, props.query ?? ''));
</script>

<template>
  <span class="path-text"><span v-if="!basename" class="path-text__directory"><template v-for="(segment, index) in directorySegments" :key="index"><mark v-if="segment.matched">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span><span class="path-text__filename"><template v-for="(segment, index) in filenameSegments" :key="index"><mark v-if="segment.matched">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span></span>
</template>
