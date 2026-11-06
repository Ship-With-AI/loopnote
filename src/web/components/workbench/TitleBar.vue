<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SelectorDriftResponse, SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import UiIcon from '../ui/UiIcon.vue';
import IdentityPill from './IdentityPill.vue';

const props = defineProps<{
  readonly attachedLifecycle?: 'waiting' | 'finishing' | 'completed';
  readonly inert?: boolean;
  readonly refreshBusy?: boolean;
  readonly showRefresh?: boolean;
  readonly worktreeChanged?: boolean;
  readonly selectorDriftStatus?: SelectorDriftResponse;
  readonly patchDrifted: boolean;
  readonly session: SessionResponse;
  readonly sidebarVisible: boolean;
  readonly panelOpen: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  togglePanel: [];
  toggleSidebar: [];
}>();

const attachedFact = computed(() => {
  switch (props.attachedLifecycle) {
    case 'finishing': return 'Agent attached · finishing review';
    case 'completed': return 'Agent review finished';
    case 'waiting': return 'Agent attached · waiting for Finish review';
    default: return '';
  }
});

const sidebarToggle = ref<HTMLButtonElement>();

function focusSidebarToggle(): void {
  sidebarToggle.value?.focus();
}

defineExpose({ focusSidebarToggle });
</script>

<template>
  <header class="titlebar">
    <div class="session-header__brand" :aria-label="RENAME_MAP.displayName" role="img">
      <span aria-hidden="true">‹/›</span>
      <span>{{ RENAME_MAP.displayName }}</span>
    </div>
    <div class="titlebar__center">
      <IdentityPill
        :session="session"
        :selector-drift-status="selectorDriftStatus"
        :patch-drifted="patchDrifted"
        :worktree-changed="worktreeChanged ?? false"
        :refresh-busy="refreshBusy ?? false"
        @refresh="emit('refresh')"
      />
      <span v-if="attachedFact !== ''" class="attached-fact" :title="attachedFact">{{ attachedFact }}</span>
    </div>
    <div class="titlebar__right" role="toolbar" aria-label="Title bar actions">
      <button
        v-if="showRefresh"
        type="button"
        class="identity-disclosure"
        :aria-busy="refreshBusy"
        :disabled="refreshBusy"
        :title="'Refresh snapshot · Alt+Shift+R'"
        aria-label="Refresh snapshot"
        @click="emit('refresh')"
      >
        <UiIcon name="refresh" />
      </button>
      <button
        ref="sidebarToggle"
        type="button"
        class="icon-btn"
        title="Toggle side bar (⌘B)"
        aria-label="Toggle side bar (⌘B)"
        :aria-pressed="sidebarVisible"
        @click="emit('toggleSidebar')"
      >
        <UiIcon name="sidebar" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Toggle panel (⌘J)"
        aria-label="Toggle panel (⌘J)"
        :aria-pressed="panelOpen"
        @click="emit('togglePanel')"
      >
        <UiIcon name="panel" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  position: relative;
  display: flex;
  min-width: 0;
  height: var(--titlebar-height);
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}

.titlebar__center {
  /* Centered via `inset-inline: 0` + `margin-inline: auto` + `width: fit-content`,
     not `left: 50%; transform: translateX(-50%)`: a `transform` establishes a new
     CSS stacking context, which trapped `.identity-popover`'s `z-index` inside this
     box and let `.workbench-shell__editor`'s later-painted content (z-index: auto)
     cover the popover whenever it overlapped the editor region below — the Copy/
     Refresh/Launch-new-comparison controls were rendered but genuinely unclickable
     in real Chromium. This centers an intrinsically-sized box with no stacking
     context of its own, so the popover's explicit `z-index: 10` (styles.css) is
     compared directly against the editor region and correctly paints on top. */
  position: absolute;
  inset-inline: 0;
  margin-inline: auto;
  width: fit-content;
  display: flex;
  max-width: 56%;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.titlebar__right {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

/* Above the narrow breakpoint the bar is a fixed-height row, so the disclosure must
   shrink into it. At <=760px styles.css's 44px touch-target arm owns the control. */
@media (min-width: 761px) {
  .titlebar .identity-disclosure {
    min-width: 0;
    min-height: 0;
    height: var(--control-height-icon);
    padding-block: 0;
  }
}
</style>
