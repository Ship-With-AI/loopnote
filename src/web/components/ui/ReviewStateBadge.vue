<script setup lang="ts">
import UiIcon, { type UiIconName } from './UiIcon.vue';

type ReviewStateKind =
  | 'open'
  | 'resolved'
  | 'verified'
  | 'stale'
  | 'unavailable'
  | 'selected'
  | 'pending'
  | 'disabled'
  | 'success'
  | 'information'
  | 'warning'
  | 'error';

const props = withDefaults(
  defineProps<{
    kind: ReviewStateKind;
    label: string;
    size?: 'default' | 'compact';
  }>(),
  { size: 'default' },
);

const icons: Readonly<Record<Exclude<ReviewStateKind, 'pending'>, UiIconName>> = {
  open: 'open',
  resolved: 'check',
  verified: 'check',
  stale: 'warning',
  unavailable: 'warning',
  selected: 'selected',
  disabled: 'disabled',
  success: 'check',
  information: 'information',
  warning: 'warning',
  error: 'error',
};
</script>

<template>
  <span
    class="review-state-badge"
    :class="{
      [`review-state-badge--${props.kind}`]: true,
      'review-state-badge--compact': props.size === 'compact',
    }"
  >
    <span v-if="props.kind === 'pending'" class="ui-spinner" aria-hidden="true" />
    <UiIcon v-else :name="icons[props.kind]" />
    <span>{{ props.label }}</span>
  </span>
</template>
