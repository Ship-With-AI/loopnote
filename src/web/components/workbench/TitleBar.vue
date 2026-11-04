<script setup lang="ts">
import { computed } from 'vue';

import type { SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import { controlSafeDisplay } from '../../../domain/path-bytes';
import UiIcon from '../ui/UiIcon.vue';

const props = defineProps<{
  readonly attachedLifecycle?: 'waiting' | 'finishing' | 'completed';
  readonly inert?: boolean;
  readonly refreshBusy?: boolean;
  readonly showRefresh?: boolean;
  readonly worktreeChanged?: boolean;
  readonly session: SessionResponse;
  readonly sidebarVisible: boolean;
  readonly panelOpen: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  togglePanel: [];
  toggleSidebar: [];
}>();

const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => 'base' in props.session ? props.session : undefined);
const uncommittedKey = computed(() =>
  'uncommitted' in props.session
    ? (props.session as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isUncommitted = computed(() => uncommittedKey.value !== undefined && !isStandalone.value);
const uncommittedSession = computed(() => (isUncommitted.value ? uncommittedKey.value : undefined));
const standaloneSession = computed(() => (isStandalone.value ? uncommittedKey.value : undefined));
const sourceLabel = computed(() => {
  switch (uncommittedSession.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    default: return '';
  }
});
const shortDigest = computed(() =>
  controlSafeDisplay(uncommittedSession.value?.reviewKey.slice(0, 7) ?? ''),
);
const standaloneLabel = computed(() =>
  controlSafeDisplay(`Standalone review · ${standaloneSession.value?.changedFileCount ?? 0} files`),
);
const standaloneShortDigest = computed(() =>
  controlSafeDisplay(standaloneSession.value?.reviewKey.slice(0, 7) ?? ''),
);
const baseCandidateLabel = computed(() => controlSafeDisplay('Repository object'));
const baseCandidateOid = computed(() =>
  controlSafeDisplay(uncommittedSession.value?.baseCommitOid?.slice(0, 7) ?? ''),
);
const baseLabel = computed(() =>
  controlSafeDisplay(pinnedSession.value?.base.label ?? 'Repository object'),
);
const baseOid = computed(() =>
  controlSafeDisplay(pinnedSession.value?.base.oid.slice(0, 7) ?? ''),
);
const headLabel = computed(() =>
  controlSafeDisplay(pinnedSession.value?.head.label ?? 'Implemented content'),
);
const headOid = computed(() =>
  controlSafeDisplay(pinnedSession.value?.head.oid.slice(0, 7) ?? ''),
);
const dirtyEndpoints = computed(() =>
  isExactPatch.value || isUncommitted.value || isStandalone.value
    ? []
    : [
        { role: 'Base', worktree: pinnedSession.value!.base.worktree },
        { role: 'Head', worktree: pinnedSession.value!.head.worktree },
      ].filter(
        (entry): entry is { role: string; worktree: { path: string; dirty: true } } =>
          entry.worktree?.dirty === true,
      ),
);

const attachedFact = computed(() => {
  switch (props.attachedLifecycle) {
    case 'finishing': return 'Agent attached · finishing review';
    case 'completed': return 'Agent review finished';
    case 'waiting': return 'Agent attached · waiting for Finish review';
    default: return '';
  }
});
</script>

<template>
  <header class="titlebar">
    <div class="session-header__brand" :aria-label="RENAME_MAP.displayName" role="img">
      <span aria-hidden="true">‹/›</span>
      <span>{{ RENAME_MAP.displayName }}</span>
    </div>
    <div class="titlebar__center">
      <div class="session-header__comparison">
        <template v-if="isExactPatch">
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">PREIMAGE</span>
            <span class="session-header__selector" title="Repository object">Repository object</span>
          </span>
          <span aria-hidden="true">→</span>
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">POSTIMAGE</span>
            <span class="session-header__selector" title="Implemented content">Implemented content</span>
          </span>
        </template>
        <template v-else-if="isStandalone">
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">STANDALONE</span>
            <span class="session-header__selector" :title="standaloneLabel">{{ standaloneLabel }} · snapshot {{ standaloneShortDigest }}</span>
          </span>
        </template>
        <template v-else-if="isUncommitted">
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">BASE</span>
            <span v-if="uncommittedSession?.sourceKind === 'unstaged'" class="session-header__selector">Index</span>
            <span v-else class="session-header__selector" :title="baseCandidateLabel">{{ baseCandidateLabel }} · {{ baseCandidateOid }}</span>
          </span>
          <span aria-hidden="true">→</span>
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">HEAD</span>
            <span class="session-header__selector" :title="sourceLabel">{{ sourceLabel }} · snapshot {{ shortDigest }}</span>
          </span>
        </template>
        <template v-else>
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">BASE</span>
            <span class="session-header__selector" :title="baseLabel">{{ baseLabel }} · {{ baseOid }}</span>
          </span>
          <span aria-hidden="true">→</span>
          <span class="session-header__endpoint">
            <span class="session-header__endpoint-label">HEAD</span>
            <span class="session-header__selector" :title="headLabel">{{ headLabel }} · {{ headOid }}</span>
          </span>
        </template>
      </div>
      <div class="header-facts">
        <span class="pin-cue">{{ isExactPatch ? 'Frozen patch' : (isUncommitted || isStandalone) ? 'Frozen snapshot' : 'Pinned comparison' }}</span>
        <span
          v-for="endpoint in dirtyEndpoints"
          :key="endpoint.role"
          class="dirty-badge"
        >
          <span>Dirty bytes ignored</span>
          <span class="visually-hidden">
            Committed HEAD reviewed; uncommitted changes aren't included.
          </span>
        </span>
        <span v-if="attachedFact !== ''" class="attached-fact">{{ attachedFact }}</span>
        <span v-if="worktreeChanged" class="change-indicator">Working tree changed since snapshot</span>
      </div>
    </div>
    <div class="titlebar__right">
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
        {{ refreshBusy ? 'Refreshing…' : 'Refresh' }}
      </button>
      <button
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
  position: absolute;
  left: 50%;
  display: flex;
  max-width: 56%;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  transform: translateX(-50%);
}

.titlebar__right {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.icon-btn {
  display: inline-flex;
  min-width: var(--control-height-icon);
  min-height: var(--control-height-icon);
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-muted);
}

.icon-btn:hover {
  background: var(--surface-interactive-hover);
  color: var(--text-primary);
}

.icon-btn[aria-pressed="true"] {
  background: var(--surface-interactive-active);
  color: var(--text-primary);
}

.titlebar .identity-disclosure {
  min-width: 0;
  min-height: 0;
  height: var(--control-height-icon);
  padding-block: 0;
}
</style>
