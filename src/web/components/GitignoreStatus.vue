<script setup lang="ts">
import { nextTick, ref } from 'vue';

import type { AppendLoopnoteIgnoreResult, LoopnoteIgnoreStatus } from '../../contracts/api.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import UiIcon from './ui/UiIcon.vue';

const props = defineProps<{
  status: LoopnoteIgnoreStatus | null;
  appendIgnoreRule: () => Promise<AppendLoopnoteIgnoreResult>;
  refreshIgnoreStatus: () => Promise<void>;
}>();

const confirming = ref(false);
const appending = ref(false);
const appendOutcome = ref<Exclude<AppendLoopnoteIgnoreResult['kind'], 'appended' | 'alreadyIgnored'> | null>(null);
const statusMessage = ref('');
const addButton = ref<HTMLButtonElement>();
const keepButton = ref<HTMLButtonElement>();


function appendFailureMessage(
  outcome: Exclude<AppendLoopnoteIgnoreResult['kind'], 'appended' | 'alreadyIgnored'>,
): string {
  switch (outcome) {
    case 'unchanged':
      return '.gitignore was not changed. You can retry the append.';
    case 'appendUnconfirmed':
      return '.gitignore contains the ignore rule, but its durability could not be confirmed.';
    case 'ambiguous':
      return '.gitignore may have changed. Inspect it before retrying.';
    case 'unconfirmed':
      return '.gitignore state could not be confirmed. Inspect it before retrying.';
  }
}
function beginAppendConfirmation(): void {
  appendOutcome.value = null;
  statusMessage.value = '';
  confirming.value = true;
  void nextTick(() => keepButton.value?.focus());
}

function keepUnchanged(): void {
  confirming.value = false;
  appendOutcome.value = null;
  statusMessage.value = '';
  void nextTick(() => addButton.value?.focus());
}

async function appendRule(): Promise<void> {
  appending.value = true;
  appendOutcome.value = null;
  statusMessage.value = '';
  try {
    const result = await props.appendIgnoreRule();
    if (result.kind !== 'appended' && result.kind !== 'alreadyIgnored') {
      appendOutcome.value = result.kind;
      return;
    }
    await props.refreshIgnoreStatus();
    confirming.value = false;
    statusMessage.value = result.kind === 'appended'
      ? `Added /${RENAME_MAP.repoStateDir} to .gitignore.`
      : 'Export directory is already ignored.';
  } catch {
    appendOutcome.value = 'unconfirmed';
  } finally {
    appending.value = false;
  }
}
</script>

<template>
  <section class="gitignore-status" aria-labelledby="gitignore-status-heading">
    <p v-if="statusMessage" role="status" class="gitignore-status__message">
      <UiIcon name="check" />
      <span>{{ statusMessage }}</span>
    </p>

    <section v-if="status === null" class="inline-notice" role="status" aria-labelledby="gitignore-status-heading">
      <span class="ui-spinner" aria-hidden="true" />
      <div class="inline-notice__content">
        <h4 id="gitignore-status-heading">Checking export directory ignore status</h4>
        <p>Export can continue while {{ RENAME_MAP.displayName }} checks whether Git ignores <code>/{{ RENAME_MAP.repoStateDir }}</code>.</p>
      </div>
    </section>

    <section v-else-if="status.kind === 'ignored'" class="inline-notice inline-notice--success" aria-labelledby="gitignore-status-heading">
      <UiIcon name="check" class="inline-notice__icon" />
      <div class="inline-notice__content">
        <h4 id="gitignore-status-heading">Export directory ignored</h4>
        <p>Git already ignores <code>/{{ RENAME_MAP.repoStateDir }}</code>.</p>
      </div>
    </section>

    <section v-else-if="status.kind === 'unavailable'" class="inline-notice inline-notice--error" role="alert" aria-labelledby="gitignore-status-heading">
      <UiIcon name="error" class="inline-notice__icon" />
      <div class="inline-notice__content">
        <h4 id="gitignore-status-heading">Ignore status unavailable</h4>
        <p>{{ RENAME_MAP.displayName }} could not check whether Git ignores <code>/{{ RENAME_MAP.repoStateDir }}</code>. Export can continue without changing <code>.gitignore</code>.</p>
      </div>
    </section>

    <section v-else class="inline-notice inline-notice--warning" aria-labelledby="gitignore-status-heading">
      <UiIcon name="warning" class="inline-notice__icon" />
      <div class="inline-notice__content">
        <h4 id="gitignore-status-heading">Export directory is not ignored</h4>
        <p>Export can continue. {{ RENAME_MAP.displayName }} always excludes <code>{{ RENAME_MAP.repoStateDir }}</code> from this review, but Git may show the generated files as untracked.</p>
        <div v-if="!confirming" class="export-actions">
          <button ref="addButton" type="button" class="ui-button" @click="beginAppendConfirmation">Add to .gitignore</button>
          <button type="button" class="ui-button" @click="keepUnchanged">Keep .gitignore unchanged</button>
        </div>

        <section
          v-else
          class="gitignore-status__confirmation"
          role="region"
          aria-labelledby="gitignore-confirm-heading"
          @keydown.escape.prevent.stop="keepUnchanged"
        >
          <h5 id="gitignore-confirm-heading">Add export directory to .gitignore?</h5>
          <p>{{ RENAME_MAP.displayName }} will append exactly <code>/{{ RENAME_MAP.repoStateDir }}</code> to the repository-root <code>.gitignore</code>. Existing bytes and rules will be preserved.</p>
          <p v-if="appending" role="status">Appending one ignore rule…</p>
          <section v-if="appendOutcome !== null" class="inline-notice inline-notice--error" role="alert" aria-labelledby="gitignore-failed-heading">
            <UiIcon name="error" class="inline-notice__icon" />
            <div class="inline-notice__content">
              <h6 id="gitignore-failed-heading">{{ appendFailureMessage(appendOutcome) }}</h6>
              <p>{{ RENAME_MAP.displayName }} did not replace existing bytes or apply any rollback. Export can continue.</p>
            </div>
          </section>
          <div class="export-actions">
            <button ref="keepButton" type="button" class="ui-button" :disabled="appending" @click="keepUnchanged">Keep .gitignore unchanged</button>
            <button type="button" class="ui-button" :class="{ 'ui-button--busy': appending }" :disabled="appending" :aria-busy="appending" @click="appendRule">
              <span v-if="appending" class="ui-spinner" aria-hidden="true" />
              {{ appendOutcome === null ? 'Append ignore rule' : 'Try append again' }}
            </button>
          </div>
        </section>
      </div>
    </section>
  </section>
</template>
