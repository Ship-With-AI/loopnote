<script setup lang="ts">
import { computed, ref } from 'vue';

import type { SessionResponse } from '../../contracts/api';
import { controlSafeDisplay } from '../../domain/path-bytes';
import UiIcon from './ui/UiIcon.vue';

const props = defineProps<{
  readonly attachedLifecycle?: 'waiting' | 'finishing' | 'completed';
  readonly inert?: boolean;
  readonly refreshBusy?: boolean;
  readonly showRefresh?: boolean;
  readonly supportEnabled?: boolean;
  readonly supportInert?: boolean;
  readonly supportOpen?: boolean;
  readonly worktreeChanged?: boolean;
  readonly session: SessionResponse;
}>();

const emit = defineEmits<{
  refresh: [];
  reviewNotes: [];
  support: [];
}>();

const support = ref<HTMLButtonElement>();

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


function focusSupport(): void {
  support.value?.focus();
}

defineExpose({ focusSupport });
</script>

<template>
  <header class="session-header">
    <div class="session-header__identity">
      <div class="session-header__brand" role="img" aria-label="Cumpa">
        <span aria-hidden="true">‹/›</span>
        <span>Cumpa</span>
      </div>
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
          Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.
        </span>
      </span>
      <span v-if="attachedFact !== ''" class="attached-fact">{{ attachedFact }}</span>
      <span v-if="worktreeChanged" class="change-indicator">Working tree changed since snapshot</span>
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
        v-if="supportEnabled"
        ref="support"
        type="button"
        class="identity-disclosure"
        :disabled="supportInert"
        :aria-expanded="supportOpen"
        @click="emit('support')"
      >
        Support Cumpa
      </button>
      <button
        type="button"
        class="identity-disclosure identity-disclosure--accent"
        aria-haspopup="dialog"
        @click="emit('reviewNotes')"
      >
        Review notes
      </button>
    </div>
  </header>
</template>
