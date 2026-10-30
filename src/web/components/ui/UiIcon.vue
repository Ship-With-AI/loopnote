<script setup lang="ts">
export type UiIconName =
  | 'previous-file'
  | 'next-file'
  | 'previous-change'
  | 'next-change'
  | 'open'
  | 'check'
  | 'warning'
  | 'error'
  | 'information'
  | 'selected'
  | 'lock'
  | 'refresh'
  | 'disabled';

defineProps<{
  name: UiIconName;
}>();
</script>

<template>
  <svg
    class="ui-icon"
    aria-hidden="true"
    focusable="false"
    fill="none"
    height="16"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.5"
    viewBox="0 0 16 16"
    width="16"
  >
    <template v-if="name === 'previous-file'">
      <path d="M10.5 2.5H5.25A1.75 1.75 0 0 0 3.5 4.25v7.5c0 .97.78 1.75 1.75 1.75h5.25c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75Z" />
      <path d="m7.5 5.5-2.5 2.5 2.5 2.5M5.25 8H11" />
    </template>
    <template v-else-if="name === 'next-file'">
      <path d="M10.5 2.5H5.25A1.75 1.75 0 0 0 3.5 4.25v7.5c0 .97.78 1.75 1.75 1.75h5.25c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75Z" />
      <path d="m8.5 5.5 2.5 2.5-2.5 2.5M10.75 8H5" />
    </template>
    <template v-else-if="name === 'previous-change'">
      <path d="m4.5 9.5 3.5-3.5 3.5 3.5M8 6v6.5" />
    </template>
    <template v-else-if="name === 'next-change'">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5M8 10V3.5" />
    </template>
    <template v-else-if="name === 'open'">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.5 8 1.75 1.75 3.25-3.5" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M8 2.5 13.5 13h-11L8 2.5Z" />
      <path d="M8 6v3.5M8 11.5h.01" />
    </template>
    <template v-else-if="name === 'error'">
      <circle cx="8" cy="8" r="5.5" />
      <path d="m6 6 4 4m0-4-4 4" />
    </template>
    <template v-else-if="name === 'information'">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.25v3M8 5.25h.01" />
    </template>
    <template v-else-if="name === 'selected'">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v6M5 8h6" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="4" y="7" width="8" height="6" rx="1" />
      <path d="M5.75 7V5.75a2.25 2.25 0 0 1 4.5 0V7M8 9.5v1" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M5.75 4.1a4.5 4.5 0 1 1 4.5 0" />
      <path d="M8.9 2.1 10.25 4.1 12.25 3.4" />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
    </template>
  </svg>
</template>
