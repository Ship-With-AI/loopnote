<script setup lang="ts">
import UiIcon from './ui/UiIcon.vue';
import UiTooltip from './ui/UiPrimitives.vue';

defineProps<{
  atFirstFile: boolean;
  atLastFile: boolean;
  hasActiveFile: boolean;
  singlePane: boolean;
}>();

const emit = defineEmits<{
  previousFile: [];
  nextFile: [];
  previousChange: [];
  nextChange: [];
}>();
</script>

<template>
  <div class="review-toolbar" aria-label="Diff navigation">
    <slot />
    <div class="review-toolbar__group" aria-label="File navigation">
      <span class="review-toolbar__label" aria-hidden="true">File</span>
      <UiTooltip :text="atFirstFile ? 'Previous file · Alt+Shift+[ · First changed file.' : 'Previous file · Alt+Shift+['">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Previous file"
          :disabled="atFirstFile || !hasActiveFile"
          @click="emit('previousFile')"
        >
          <UiIcon name="previous-file" />
        </button>
      </UiTooltip>
      <UiTooltip :text="atLastFile ? 'Next file · Alt+Shift+] · Last changed file.' : 'Next file · Alt+Shift+]'">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Next file"
          :disabled="atLastFile || !hasActiveFile"
          @click="emit('nextFile')"
        >
          <UiIcon name="next-file" />
        </button>
      </UiTooltip>
    </div>
    <div v-if="!singlePane" class="review-toolbar__group" aria-label="Change navigation">
      <span class="review-toolbar__label" aria-hidden="true">Change</span>
      <UiTooltip text="Previous change · Shift+F7">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Previous change"
          :disabled="!hasActiveFile"
          @click="emit('previousChange')"
        >
          <UiIcon name="previous-change" />
        </button>
      </UiTooltip>
      <UiTooltip text="Next change · F7">
        <button
          type="button"
          class="ui-button ui-button--icon"
          aria-label="Next change"
          :disabled="!hasActiveFile"
          @click="emit('nextChange')"
        >
          <UiIcon name="next-change" />
        </button>
      </UiTooltip>
    </div>
  </div>
</template>
