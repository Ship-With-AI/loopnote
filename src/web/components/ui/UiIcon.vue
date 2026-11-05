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
  | 'sidebar'
  | 'panel'
  | 'close'
  | 'diff-split'
  | 'diff-inline'
  | 'markdown-source'
  | 'markdown-preview'
  | 'comment'
  | 'filter'
  | 'list'
  | 'tree'
  | 'collapse-all'
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
    <template v-else-if="name === 'sidebar'">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.25 3v10" />
    </template>
    <template v-else-if="name === 'panel'">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 9.75h11" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
    </template>
    <template v-else-if="name === 'diff-split'">
      <rect x="2" y="3" width="5" height="10" rx="1" />
      <rect x="9" y="3" width="5" height="10" rx="1" />
    </template>
    <template v-else-if="name === 'diff-inline'">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 8h11" />
    </template>
    <template v-else-if="name === 'markdown-source'">
      <path d="M6 5 3.25 8 6 11M10 5l2.75 3L10 11M9 4l-2 8" />
    </template>
    <template v-else-if="name === 'markdown-preview'">
      <path d="M3.5 5h9M3.5 8h9M3.5 11h6" />
    </template>
    <template v-else-if="name === 'comment'">
      <path d="M3 4.5h10a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H7l-2.5 2.5V11H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
    </template>
    <template v-else-if="name === 'filter'">
      <path d="M2.75 3.5h10.5L9.5 8.25v4.25l-3-1.5V8.25L2.75 3.5Z" />
    </template>
    <template v-else-if="name === 'list'">
      <circle cx="3" cy="4.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="3" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
      <path d="M6 4.5h6.5M6 8h6.5M6 11.5h6.5" />
    </template>
    <template v-else-if="name === 'tree'">
      <path d="M4.5 3v8.5" />
      <path d="M4.5 5.5h3M4.5 8.5h3M4.5 11h3" />
    </template>
    <template v-else-if="name === 'collapse-all'">
      <path d="M4.5 6.5 8 3.5l3.5 3M4.5 12.5 8 9.5l3.5 3" />
    </template>
    <template v-else>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.5 5.5 5 5M10.5 5.5l-5 5" />
    </template>
  </svg>
</template>
