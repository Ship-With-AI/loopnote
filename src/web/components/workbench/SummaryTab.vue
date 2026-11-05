<script setup lang="ts">
import SummarySection from '../SummarySection.vue';

defineProps<{
  canonical: string;
  modelValue: string;
  pending: boolean;
  saving: boolean;
  conflict: boolean;
  failure: boolean;
  retained: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  cancel: [];
  save: [];
}>();
</script>

<template>
  <SummarySection
    :canonical="canonical"
    :model-value="modelValue"
    :pending="pending"
    :saving="saving"
    :conflict="conflict"
    :failure="failure"
    :retained="retained"
    @cancel="emit('cancel')"
    @save="emit('save')"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
