<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SelectorDriftResponse, SelectorDriftStatus } from '../../contracts/api.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import { controlSafeDisplay } from '../../domain/path-bytes.js';
import UiIcon from './ui/UiIcon.vue';

const props = defineProps<{
  readonly drift: SelectorDriftResponse | undefined;
}>();

const copied = ref('');
const relaunchInstructionsOpen = ref(false);

const affectedSources = computed(() => {
  const drift = props.drift;
  if (drift === undefined) {
    return [];
  }
  return [drift.base, drift.head].filter(
    (status): status is Exclude<SelectorDriftStatus, { readonly kind: 'unchanged' }> => status.kind !== 'unchanged',
  );
});

function sourceHeading(status: Exclude<SelectorDriftStatus, { readonly kind: 'unchanged' }>): string {
  return `${status.role === 'base' ? 'Base' : 'Head'} source ${status.kind}`;
}

function sourceType(status: Exclude<SelectorDriftStatus, { readonly kind: 'unchanged' }>): string {
  return status.selectorType === 'branch' ? 'Branch' : 'Worktree';
}

function copyPinnedCommit(status: Exclude<SelectorDriftStatus, { readonly kind: 'unchanged' }>): void {
  void navigator.clipboard.writeText(status.oldOid)
    .then(() => { copied.value = `Pinned ${status.role === 'base' ? 'Base' : 'Head'} commit copied.`; })
    .catch(() => { copied.value = 'Couldn’t copy the pinned commit.'; });
}
</script>

<template>
  <aside
    v-if="affectedSources.length > 0"
    class="inline-notice inline-notice--warning selector-drift-notice"
    aria-labelledby="selector-drift-heading"
  >
    <UiIcon name="warning" class="inline-notice__icon" />
    <div class="inline-notice__content">
      <h2 id="selector-drift-heading">Selected source changed — open review remains pinned</h2>
      <p>
        The selected branch or worktree now resolves differently. This review still shows and anchors comments to the original pinned commits.
      </p>
      <section v-for="source in affectedSources" :key="source.role" class="selector-drift-notice__source">
        <h3>{{ sourceHeading(source) }}</h3>
        <p>{{ sourceType(source) }}: {{ controlSafeDisplay(source.label) }}</p>
        <p>Open review pinned to <code>{{ source.oldOid }}</code></p>
        <p v-if="source.kind === 'moved'">Source now resolves to <code>{{ source.newOid }}</code></p>
        <p v-else>This source is no longer available.</p>
        <button
          type="button"
          class="ui-button"
          :aria-label="`Copy pinned ${source.role === 'base' ? 'Base' : 'Head'} commit ${source.oldOid}`"
          @click="copyPinnedCommit(source)"
        >
          Copy pinned commit
        </button>
      </section>
      <p v-if="copied !== ''" :role="copied.startsWith('Couldn') ? 'alert' : 'status'">{{ copied }}</p>
      <button type="button" class="ui-button" @click="relaunchInstructionsOpen = !relaunchInstructionsOpen">
        Launch new comparison
      </button>
      <p v-if="relaunchInstructionsOpen">
        Return to the terminal and launch {{ RENAME_MAP.displayName }} again, then choose the current sources. This open review will remain pinned.
      </p>
    </div>
  </aside>
</template>
