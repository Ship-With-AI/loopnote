<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  path: string;
}>();

const segments = computed(() => props.path.split('/'));
</script>

<template>
  <nav class="breadcrumbs" aria-label="File path">
    <span v-for="(segment, i) in segments" :key="i">
      <span v-if="i > 0" aria-hidden="true" class="breadcrumbs__separator">›</span>
      <span
        class="breadcrumbs__segment"
        :class="{ 'breadcrumbs__segment--file': i === segments.length - 1 }"
      >{{ segment }}</span>
    </span>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  display: flex;
  min-width: 0;
  height: var(--breadcrumb-height);
  align-items: center;
  gap: var(--space-1);
  overflow: hidden;
  padding-inline: var(--space-2);
  border-bottom: 1px solid var(--border-default);
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
  white-space: nowrap;
}

.breadcrumbs__separator {
  color: var(--text-muted);
}

.breadcrumbs__segment {
  overflow: hidden;
  text-overflow: ellipsis;
}

.breadcrumbs__segment--file {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}
</style>
