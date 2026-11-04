<template>
  <div class="workbench-shell">
    <div class="workbench-shell__titlebar"><slot name="titlebar" /></div>
    <div class="workbench-shell__body" :style="{ gridTemplateColumns: sidebarGridTemplateColumns }">
      <!-- v-show, not v-if: Teleport resolves `#changed-files` once, so destroying the host
           strands the teleported tree and the sidebar comes back empty. -->
      <div v-show="sidebarVisible" id="changed-files" class="workbench-shell__sidebar" :style="{ width: sidebarWidth + 'px' }"></div>
      <div
        v-if="sidebarVisible && !isNarrow"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side bar"
        :aria-valuenow="sidebarWidth"
        aria-valuemin="170"
        aria-valuemax="520"
        tabindex="-1"
        class="workbench-shell__sash workbench-shell__sash--vertical"
        :style="{ left: `calc(${clampedSidebarWidth} - 2px)` }"
        @pointerdown="sidebarSash.handlers.onPointerdown"
        @dblclick="sidebarSash.reset"
      />
      <div class="workbench-shell__main">
        <div class="workbench-shell__editor"><slot name="editor" /></div>
        <template v-if="panelOpen">
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize panel"
            :aria-valuenow="panelHeight"
            aria-valuemin="120"
            aria-valuemax="520"
            tabindex="-1"
            class="workbench-shell__sash workbench-shell__sash--horizontal"
            @pointerdown="panelSash.handlers.onPointerdown"
            @dblclick="panelSash.reset"
          />
          <div class="workbench-shell__panel" :style="{ height: panelHeight + 'px' }"><slot name="panel" /></div>
        </template>
      </div>
    </div>
    <div class="workbench-shell__statusbar"><slot name="statusbar" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';

import { useSash } from '../../composables/useSash';

const props = defineProps<{
  readonly sidebarVisible: boolean;
  readonly sidebarWidth: number;
  readonly panelOpen: boolean;
  readonly panelHeight: number;
  readonly isNarrow: boolean;
}>();

const emit = defineEmits<{
  'update:sidebarWidth': [value: number];
  'update:panelHeight': [value: number];
}>();

// `sidebarWidth`/`panelHeight` props are not mutable refs, so each gets a local
// shallowRef seeded from the prop and kept in sync via `watch` (e.g. when a
// persisted value loads after this component mounts). `useSash` writes the
// live dragged value directly into that local ref for immediate visual
// feedback, then commits the final value back up through the prop's `update:`
// emit on pointerup/reset.
const sidebarWidth = shallowRef(props.sidebarWidth);
watch(() => props.sidebarWidth, (next) => {
  sidebarWidth.value = next;
});

const panelHeight = shallowRef(props.panelHeight);
watch(() => props.panelHeight, (next) => {
  panelHeight.value = next;
});

const sidebarSash = useSash({
  axis: 'vertical',
  min: 170,
  max: 520,
  default: 264,
  value: sidebarWidth,
  onCommit: (value) => emit('update:sidebarWidth', value),
});

const panelSash = useSash({
  axis: 'horizontal',
  min: 120,
  max: 520,
  default: 240,
  value: panelHeight,
  onCommit: (value) => emit('update:panelHeight', value),
});

// The `.workbench-shell__body` grid's column track is driven by the live
// `sidebarWidth` value (not just the sidebar element's own inline width) so
// dragging the sash never overflows the sidebar item past its track into the
// editor column; hiding the sidebar collapses the column entirely.
const clampedSidebarWidth = computed(
  () => `min(${sidebarWidth.value}px, var(--sidebar-width-max), calc(100vw - 480px))`,
);
const sidebarGridTemplateColumns = computed(
  () => (props.sidebarVisible ? `${clampedSidebarWidth.value} 1fr` : '1fr'),
);
</script>

<style scoped>
.workbench-shell {
  display: grid;
  grid-template-rows: var(--titlebar-height) 1fr var(--statusbar-height);
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.workbench-shell__body {
  position: relative;
  display: grid;
  grid-template-columns: var(--sidebar-width-default) 1fr;
  min-width: 0;
  min-height: 0;
}

.workbench-shell__sidebar {
  min-width: var(--sidebar-width-min);
  /* SHELL-06: clamp the resizable width by the remaining viewport space so dragging
     the sash can never push the body past 100vw; 480px is a reasonable
     minimum-editor-width floor. */
  max-width: min(var(--sidebar-width-max), calc(100vw - 480px));
  overflow: hidden;
  border-right: 1px solid var(--border-default);
}

.workbench-shell__sash {
  background: transparent;
  transition: background 0.15s;
}

.workbench-shell__sash:hover,
.workbench-shell__sash:active {
  background: var(--interactive-accent-emphasis);
}

.workbench-shell__sash--vertical {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 1;
}

.workbench-shell__sash--horizontal {
  flex: none;
  height: 4px;
  cursor: row-resize;
}

.workbench-shell__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.workbench-shell__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.workbench-shell__editor > :last-child {
  flex: 1;
  min-height: 0;
}

.workbench-shell__panel {
  flex: none;
  height: var(--panel-height-default);
  min-height: var(--panel-height-min);
  max-height: var(--panel-height-max);
  overflow: hidden;
}

.workbench-shell__titlebar,
.workbench-shell__statusbar {
  min-width: 0;
}

@media (max-width: 760px) {
  .workbench-shell__body {
    display: block;
  }
}
</style>
