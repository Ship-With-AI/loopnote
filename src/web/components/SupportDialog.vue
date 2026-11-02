<script setup lang="ts">
import { computed, ref } from 'vue';

import ModalDialog from './ui/ModalDialog.vue';
import { RENAME_MAP } from '../../domain/product-identity';

const props = defineProps<{
  readonly open: boolean;
  readonly mode: 'invitation' | 'waiting' | 'verified' | 'thankYou' | 'notConfirmed';
  readonly busy: boolean;
}>();

const emit = defineEmits<{
  support: [];
  restore: [];
  dismiss: [];
  close: [];
}>();

const dialog = ref<InstanceType<typeof ModalDialog>>();
const status = computed(() => {
  if (props.mode === 'waiting') return 'Waiting for confirmation… You can close this and keep reviewing.';
  if (props.mode === 'verified') return 'Support is verified on this machine.';
  if (props.mode === 'thankYou') return `Thank you for supporting ${RENAME_MAP.displayName}.`;
  if (props.mode === 'notConfirmed') return "Support wasn't confirmed. You can try again.";
  return '';
});

function focusInitial(): void {
  dialog.value?.focusInitial();
}

defineExpose({ focusInitial });
</script>

<template>
  <ModalDialog
    ref="dialog"
    :open="open"
    :title="`Support ${RENAME_MAP.displayName}`"
    close-label="Close"
    close-aria-label="Close support dialog"
    description-id="support-dialog-status"
    @close="emit('close')"
  >
    <div class="support-dialog">
      <p id="support-dialog-status" class="support-dialog__status" aria-live="polite">{{ status }}</p>
      <template v-if="mode === 'invitation' || mode === 'notConfirmed'">
        <p>{{ RENAME_MAP.displayName }} stays fully usable. One optional USD $49.99 payment supports development. Paying once stops the launch prompt.</p>
        <div class="support-dialog__actions">
          <button type="button" class="ui-button ui-button--primary" :disabled="busy" @click="emit('support')">{{ `Support ${RENAME_MAP.displayName} — $49.99` }}</button>
          <button type="button" class="ui-button" :disabled="busy" @click="emit('restore')">Restore support</button>
          <button type="button" class="ui-button" :disabled="busy" @click="emit('dismiss')">Not now</button>
        </div>
      </template>
      <template v-else-if="mode === 'waiting'">
        <button type="button" class="ui-button" @click="emit('close')">Keep reviewing</button>
      </template>
      <template v-else-if="mode === 'verified'">
        <p>Thank you for supporting {{ RENAME_MAP.displayName }}. {{ RENAME_MAP.displayName }} remains fully usable.</p>
        <button type="button" class="ui-button" @click="emit('close')">Close</button>
      </template>
    </div>
  </ModalDialog>
</template>
