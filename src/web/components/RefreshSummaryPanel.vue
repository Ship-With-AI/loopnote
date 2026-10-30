<script setup lang="ts">
import { computed } from 'vue';

import InlineNotice from './InlineNotice.vue';

const props = defineProps<{
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly modified: readonly string[];
  readonly staleCount: number;
  readonly orphanedCount: number;
}>();

const emit = defineEmits<{ dismiss: []; 'select-file': [path: string] }>();

const headingText = computed(() => {
  const categories: ReadonlyArray<{ count: number; label: string }> = [
    { count: props.added.length, label: 'added' },
    { count: props.removed.length, label: 'removed' },
    { count: props.modified.length, label: 'modified' },
  ];
  const clauses = categories
    .filter((category) => category.count > 0)
    .map((category) => `${category.count} ${category.label}`);
  const joined =
    clauses.length <= 1
      ? clauses.join('')
      : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
  return `Since previous snapshot: ${joined}`;
});
</script>

<template>
  <InlineNotice
    tone="neutral"
    role="status"
    dismissible
    dismiss-label="Dismiss Refresh summary"
    @dismiss="emit('dismiss')"
  >
    <h2>{{ headingText }}</h2>
    <section v-if="added.length > 0">
      <h3>Added</h3>
      <ul>
        <li v-for="path in added" :key="path">
          <button type="button" class="ui-button" @click="emit('select-file', path)">{{ path }}</button>
        </li>
      </ul>
    </section>
    <section v-if="removed.length > 0">
      <h3>Removed</h3>
      <ul>
        <li v-for="path in removed" :key="path">
          <button type="button" class="ui-button" @click="emit('select-file', path)">{{ path }}</button>
        </li>
      </ul>
    </section>
    <section v-if="modified.length > 0">
      <h3>Modified</h3>
      <ul>
        <li v-for="path in modified" :key="path">
          <button type="button" class="ui-button" @click="emit('select-file', path)">{{ path }}</button>
        </li>
      </ul>
    </section>
    <p v-if="staleCount > 0 || orphanedCount > 0">
      <template v-if="staleCount > 0">{{ staleCount }} comment{{ staleCount === 1 ? '' : 's' }} now stale</template>
      <template v-if="staleCount > 0 && orphanedCount > 0">, </template>
      <template v-if="orphanedCount > 0"
        >{{ orphanedCount }} comment{{ orphanedCount === 1 ? '' : 's' }} now orphaned</template
      >
    </p>
  </InlineNotice>
</template>
