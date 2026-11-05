<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  lineCounts: 'always' | 'hover' | 'never';
  commentBadgesEnabled: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:line-counts': [mode: 'always' | 'hover' | 'never'];
  'update:comment-badges': [enabled: boolean];
  close: [];
}>();

// Line-count radio items, index-addressed so arrow-key roving tabindex and
// Enter/Space activation can share one 0-2 index space with the checkbox at
// index 3 (four items total, per the menu's must-have contract).
const LINE_COUNT_ITEMS: readonly Readonly<{ mode: 'always' | 'hover' | 'never'; label: string }>[] = [
  { mode: 'always', label: 'Always' },
  { mode: 'hover', label: 'On hover or selection' },
  { mode: 'never', label: 'Never' },
];
const CHECKBOX_INDEX = 3;

const menuRoot = ref<HTMLElement>();
const itemRefs = ref<(HTMLElement | null)[]>([null, null, null, null]);

function setItemRef(index: number, element: Element | null): void {
  itemRefs.value[index] = element instanceof HTMLElement ? element : null;
}

const checkedLineCountsIndex = computed(() =>
  Math.max(
    LINE_COUNT_ITEMS.findIndex((item) => item.mode === props.lineCounts),
    0,
  ),
);

const focusedIndex = ref(checkedLineCountsIndex.value);

function focusItem(index: number): void {
  focusedIndex.value = index;
  void nextTick(() => itemRefs.value[index]?.focus());
}

function activateLineCounts(index: number): void {
  focusItem(index);
  emit('update:line-counts', LINE_COUNT_ITEMS[index]!.mode);
}

function activateCommentBadges(): void {
  focusItem(CHECKBOX_INDEX);
  emit('update:comment-badges', !props.commentBadgesEnabled);
}

function activateFocused(): void {
  if (focusedIndex.value === CHECKBOX_INDEX) {
    activateCommentBadges();
    return;
  }
  activateLineCounts(focusedIndex.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusItem((focusedIndex.value + 1) % 4);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusItem((focusedIndex.value + 3) % 4);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activateFocused();
  }
}

// Hand-rolled outside-click dismiss: no existing anchored-popover component
// to reuse (ModalDialog.vue's backdrop is full-viewport, unsuitable for a
// small menu anchored under a 22x22px button — 21-RESEARCH.md Pitfall 4).
// The `[aria-haspopup="menu"]` check skips the opener button itself so its
// own click handler stays the single source of truth for toggling `open`
// (otherwise a click that re-closes the menu would immediately reopen it:
// pointerdown closes via this listener, then the button's own click handler
// toggles the now-false state back to true).
function handlePointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Node)) {
    return;
  }
  if (menuRoot.value?.contains(event.target)) {
    return;
  }
  if (event.target instanceof Element && event.target.closest('[aria-haspopup="menu"]') !== null) {
    return;
  }
  emit('close');
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      focusedIndex.value = checkedLineCountsIndex.value;
      document.addEventListener('pointerdown', handlePointerDown);
      void nextTick(() => itemRefs.value[focusedIndex.value]?.focus());
    } else {
      document.removeEventListener('pointerdown', handlePointerDown);
    }
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown);
});
</script>

<template>
  <div
    v-if="open"
    ref="menuRoot"
    role="menu"
    aria-label="View options"
    class="view-options-menu"
    @keydown="handleKeydown"
  >
    <div role="group" aria-label="Line counts" class="view-options-menu__group">
      <div
        v-for="(item, index) in LINE_COUNT_ITEMS"
        :key="item.mode"
        :ref="(element) => setItemRef(index, element as Element | null)"
        role="menuitemradio"
        class="view-options-menu__item"
        :aria-checked="item.mode === lineCounts"
        :tabindex="focusedIndex === index ? 0 : -1"
        @click="activateLineCounts(index)"
      >{{ item.label }}</div>
    </div>
    <div
      :ref="(element) => setItemRef(CHECKBOX_INDEX, element as Element | null)"
      role="menuitemcheckbox"
      class="view-options-menu__item"
      :aria-checked="commentBadgesEnabled"
      :tabindex="focusedIndex === CHECKBOX_INDEX ? 0 : -1"
      @click="activateCommentBadges()"
    >Open comment badges</div>
  </div>
</template>
