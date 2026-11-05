<template>
  <div class="workbench-shell" ref="shellRoot">
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
        :aria-valuemax="sidebarCeiling"
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
            :aria-valuemax="panelCeiling"
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
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

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

const SIDEBAR_WIDTH_MIN = 170;
const SIDEBAR_WIDTH_MAX = 520;
// Mirrors the `calc(100vw - 480px)` editor-width floor the layout previously
// enforced in CSS alone (`.workbench-shell__sidebar`'s `max-width`). WR-01:
// a static `max: 520` sash ceiling disagreed with that viewport-driven CSS
// clamp below a ~1000px viewport, so the sash stopped tracking the cursor
// partway through the drag. The live ceiling below is now the single source
// of truth for both the sash and the layout.
const EDITOR_WIDTH_FLOOR = 480;
const PANEL_HEIGHT_MIN = 120;
const PANEL_HEIGHT_MAX = 520;

const shellRoot = ref<HTMLElement | null>(null);
const sidebarCeiling = shallowRef(SIDEBAR_WIDTH_MAX);
const panelCeiling = shallowRef(PANEL_HEIGHT_MAX);

// `--titlebar-height`/`--statusbar-height` step from 32px/22px to 44px below
// the 760px narrow breakpoint (`styles.css`); read the live computed value
// instead of duplicating that breakpoint's numbers here.
function chromeRowHeight(token: string, fallback: number): number {
  if (shellRoot.value === null) return fallback;
  const parsed = Number.parseFloat(getComputedStyle(shellRoot.value).getPropertyValue(token));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// WR-01: the sash's drag ceiling and the layout's rendered ceiling must be
// the same number, derived from the live viewport, not two independent
// static/CSS clamps that can disagree.
function syncCeilings(): void {
  sidebarCeiling.value = Math.max(
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, window.innerWidth - EDITOR_WIDTH_FLOOR),
  );
  if (sidebarWidth.value > sidebarCeiling.value) sidebarWidth.value = sidebarCeiling.value;

  const titlebarHeight = chromeRowHeight('--titlebar-height', 32);
  const statusbarHeight = chromeRowHeight('--statusbar-height', 22);
  panelCeiling.value = Math.max(
    PANEL_HEIGHT_MIN,
    Math.min(PANEL_HEIGHT_MAX, window.innerHeight - titlebarHeight - statusbarHeight),
  );
  if (panelHeight.value > panelCeiling.value) panelHeight.value = panelCeiling.value;
}

onMounted(() => {
  syncCeilings();
  window.addEventListener('resize', syncCeilings);
});
onUnmounted(() => window.removeEventListener('resize', syncCeilings));

const sidebarSash = useSash({
  axis: 'vertical',
  min: SIDEBAR_WIDTH_MIN,
  get max() { return sidebarCeiling.value; },
  default: 264,
  value: sidebarWidth,
  onCommit: (value) => emit('update:sidebarWidth', value),
});

const panelSash = useSash({
  axis: 'horizontal',
  min: PANEL_HEIGHT_MIN,
  get max() { return panelCeiling.value; },
  default: 240,
  value: panelHeight,
  onCommit: (value) => emit('update:panelHeight', value),
});

// The `.workbench-shell__body` grid's column track is driven by the live
// `sidebarWidth` value (not just the sidebar element's own inline width) so
// dragging the sash never overflows the sidebar item past its track into the
// editor column; hiding the sidebar collapses the column entirely. The sash
// already clamps `sidebarWidth` to `sidebarCeiling` on every pointermove, so
// the track reuses that same ceiling instead of re-deriving its own via a
// second CSS `min()`/`calc()` clamp that could disagree (WR-01).
const clampedSidebarWidth = computed(
  () => `${Math.min(sidebarWidth.value, sidebarCeiling.value)}px`,
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
  /* WR-01: `sidebarWidth` is already clamped to the live `sidebarCeiling`
     (JS, computed from the viewport width) before it ever reaches this
     inline style, so this is a backstop against the static documented
     maximum only — not a second, independently viewport-driven clamp that
     could disagree with the JS one. */
  max-width: var(--sidebar-width-max);
  overflow: hidden;
  border-right: 1px solid var(--border-default);
}

.workbench-shell__sash {
  background: transparent;
  touch-action: none;
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
  position: relative;
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
