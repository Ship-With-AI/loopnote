<script lang="ts">
import type { SelectorDriftResponse, SessionResponse } from '../../../contracts/api';
import { controlSafeDisplay } from '../../../domain/path-bytes';

export type IdentityKind =
  | 'branch'
  | 'worktree'
  | 'range'
  | 'exact-patch'
  | 'staged'
  | 'unstaged'
  | 'working-tree'
  | 'standalone';

export type DriftKind = 'selector' | 'patch' | 'worktree' | undefined;

function shortOid(oid: string): string {
  return controlSafeDisplay(oid.slice(0, 7));
}

export function identityKind(session: SessionResponse): IdentityKind {
  if ('patch' in session) return 'exact-patch';
  if ('base' in session) {
    if (session.range?.kind === 'revisions') return 'range';
    if (session.base.worktree !== undefined || session.head.worktree !== undefined) return 'worktree';
    return 'branch';
  }
  switch (session.uncommitted.sourceKind) {
    case 'standalone': return 'standalone';
    case 'staged': return 'staged';
    case 'unstaged': return 'unstaged';
    default: return 'working-tree';
  }
}

export function identityCanRefresh(kind: IdentityKind): boolean {
  return kind === 'staged' || kind === 'unstaged' || kind === 'working-tree' || kind === 'standalone';
}

export function identityDriftKind(
  patchDrifted: boolean,
  selectorDriftStatus: SelectorDriftResponse | undefined,
  worktreeChanged: boolean,
): DriftKind {
  if (patchDrifted) return 'patch';
  // Guarded (not a bare `selectorDriftStatus?.base.kind !== 'unchanged'` check): the server only
  // ever serves /api/selector-drift for pinned (branch/worktree/range) sessions, so
  // selectorDriftStatus stays undefined forever for staged/unstaged/working-tree/standalone
  // sessions. A bare optional-chained comparison against 'unchanged' would evaluate to true when
  // undefined, permanently warning on every uncommitted session.
  if (
    selectorDriftStatus !== undefined &&
    (selectorDriftStatus.base.kind !== 'unchanged' || selectorDriftStatus.head.kind !== 'unchanged')
  ) {
    return 'selector';
  }
  if (worktreeChanged) return 'worktree';
  return undefined;
}

export function identityAccessibleName(
  session: SessionResponse,
  kind: IdentityKind,
  driftKind: DriftKind,
  refreshBusy: boolean,
): string {
  let base: string;
  switch (kind) {
    case 'branch':
    case 'worktree': {
      const pinned = 'base' in session ? session : undefined;
      base = `Comparison: Base ${controlSafeDisplay(pinned?.base.label ?? '')} at ${shortOid(pinned?.base.oid ?? '')}, Head ${controlSafeDisplay(pinned?.head.label ?? '')} at ${shortOid(pinned?.head.oid ?? '')}. Opens comparison details.`;
      break;
    }
    case 'range': {
      const pinned = 'base' in session ? session : undefined;
      base = `Comparison: pinned revisions ${controlSafeDisplay(pinned?.base.label ?? '')} to ${controlSafeDisplay(pinned?.head.label ?? '')}. Opens comparison details.`;
      break;
    }
    case 'exact-patch':
      base = 'Comparison: Repository object to Implemented content, frozen patch. Opens comparison details.';
      break;
    case 'staged': {
      const uncommitted = 'uncommitted' in session ? session.uncommitted : undefined;
      base = `Comparison: HEAD at ${shortOid(uncommitted?.baseCommitOid ?? '')} to Staged changes. Opens comparison details.`;
      break;
    }
    case 'unstaged':
      base = 'Comparison: Index to Unstaged changes. Opens comparison details.';
      break;
    case 'working-tree': {
      const uncommitted = 'uncommitted' in session ? session.uncommitted : undefined;
      base = `Comparison: HEAD at ${shortOid(uncommitted?.baseCommitOid ?? '')} to Working tree. Opens comparison details.`;
      break;
    }
    case 'standalone': {
      const uncommitted = 'uncommitted' in session ? session.uncommitted : undefined;
      base = `Comparison: Standalone review, ${uncommitted?.changedFileCount ?? 0} files. Opens comparison details.`;
      break;
    }
  }
  if (driftKind !== undefined) return `${base} Source changed since this review was pinned.`;
  if (refreshBusy) return `${base} Capturing current changes.`;
  return base;
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { truncateMiddle } from '../../../domain/truncate-middle';
import UiIcon, { type UiIconName } from '../ui/UiIcon.vue';
import IdentityPopover from './IdentityPopover.vue';

const props = defineProps<{
  readonly session: SessionResponse;
  readonly selectorDriftStatus?: SelectorDriftResponse;
  readonly patchDrifted: boolean;
  readonly worktreeChanged: boolean;
  readonly refreshBusy: boolean;
}>();

const emit = defineEmits<{ refresh: [] }>();

const popoverOpen = ref(false);
const trigger = ref<HTMLButtonElement>();

const kind = computed<IdentityKind>(() => identityKind(props.session));
const driftKind = computed<DriftKind>(() =>
  identityDriftKind(props.patchDrifted, props.selectorDriftStatus, props.worktreeChanged),
);
const canRefresh = computed(() => identityCanRefresh(kind.value));

const pinnedBase = computed(() => ('base' in props.session ? props.session.base : undefined));
const pinnedHead = computed(() => ('base' in props.session ? props.session.head : undefined));
const uncommitted = computed(() => ('uncommitted' in props.session ? props.session.uncommitted : undefined));

const baseFullLabel = computed(() => controlSafeDisplay(pinnedBase.value?.label ?? ''));
const headFullLabel = computed(() => controlSafeDisplay(pinnedHead.value?.label ?? ''));
const baseDisplayLabel = computed(() => truncateMiddle(baseFullLabel.value));
const headDisplayLabel = computed(() => truncateMiddle(headFullLabel.value));
const baseSha7 = computed(() => controlSafeDisplay(pinnedBase.value?.oid.slice(0, 7) ?? ''));
const headSha7 = computed(() => controlSafeDisplay(pinnedHead.value?.oid.slice(0, 7) ?? ''));
const baseHasWorktree = computed(() => pinnedBase.value?.worktree !== undefined);
const headHasWorktree = computed(() => pinnedHead.value?.worktree !== undefined);

const baseCommitOid7 = computed(() => controlSafeDisplay(uncommitted.value?.baseCommitOid?.slice(0, 7) ?? ''));
const standaloneFileCount = computed(() => uncommitted.value?.changedFileCount ?? 0);

const leadIcon = computed<UiIconName>(() => {
  switch (kind.value) {
    case 'range': return 'lock';
    case 'exact-patch': return 'patch';
    default: return 'compare';
  }
});

const pillAccessibleName = computed(() =>
  identityAccessibleName(props.session, kind.value, driftKind.value, props.refreshBusy),
);

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
}

function closePopover(): void {
  popoverOpen.value = false;
  trigger.value?.focus();
}
</script>

<template>
  <div class="identity-pill-host">
    <button
      ref="trigger"
      type="button"
      class="identity-pill"
      :class="{ 'identity-pill--warning': driftKind !== undefined, 'identity-pill--refreshing': refreshBusy }"
      aria-haspopup="dialog"
      :aria-expanded="popoverOpen"
      :aria-label="pillAccessibleName"
      @click="togglePopover"
    >
      <UiIcon v-if="driftKind === undefined" :name="leadIcon" class="identity-pill__icon" />
      <span v-else class="identity-pill__dot" aria-hidden="true" />

      <template v-if="kind === 'exact-patch'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">PREIMAGE</span>
          <span class="identity-pill__ref">Repository object</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">POSTIMAGE</span>
          <UiIcon name="patch" class="identity-pill__mark" />
          <span class="identity-pill__ref">Implemented content</span>
        </span>
      </template>
      <template v-else-if="kind === 'standalone'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">STANDALONE</span>
          <span class="identity-pill__ref">{{ standaloneFileCount }} files</span>
        </span>
      </template>
      <template v-else-if="kind === 'unstaged'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">BASE</span>
          <span class="identity-pill__ref">Index</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">HEAD</span>
          <span class="identity-pill__ref">Unstaged</span>
        </span>
      </template>
      <template v-else-if="kind === 'staged'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">BASE</span>
          <span class="identity-pill__ref">HEAD</span>
          <span class="identity-pill__sha">{{ baseCommitOid7 }}</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">HEAD</span>
          <UiIcon name="commit" class="identity-pill__mark" />
          <span class="identity-pill__ref">Staged</span>
        </span>
      </template>
      <template v-else-if="kind === 'working-tree'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">BASE</span>
          <span class="identity-pill__ref">HEAD</span>
          <span class="identity-pill__sha">{{ baseCommitOid7 }}</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">HEAD</span>
          <span class="identity-pill__ref">Working tree</span>
        </span>
      </template>
      <template v-else-if="kind === 'range'">
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">BASE</span>
          <span class="identity-pill__ref">{{ baseDisplayLabel }}</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">HEAD</span>
          <span class="identity-pill__ref">{{ headDisplayLabel }}</span>
        </span>
      </template>
      <template v-else>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">BASE</span>
          <UiIcon v-if="baseHasWorktree" name="worktree" class="identity-pill__mark" />
          <span class="identity-pill__ref">{{ baseDisplayLabel }}</span>
          <span class="identity-pill__sha">{{ baseSha7 }}</span>
        </span>
        <span class="identity-pill__arrow" aria-hidden="true">→</span>
        <span class="identity-pill__endpoint">
          <span class="identity-pill__label">HEAD</span>
          <UiIcon v-if="headHasWorktree" name="worktree" class="identity-pill__mark" />
          <span class="identity-pill__ref">{{ headDisplayLabel }}</span>
          <span class="identity-pill__sha">{{ headSha7 }}</span>
        </span>
      </template>

      <span v-if="refreshBusy" class="identity-pill__suffix">· capturing…</span>
      <UiIcon name="chevron" class="identity-pill__chevron" />
    </button>
    <IdentityPopover
      v-if="popoverOpen"
      :session="session"
      :selector-drift-status="selectorDriftStatus"
      :patch-drifted="patchDrifted"
      :worktree-changed="worktreeChanged"
      :refresh-busy="refreshBusy"
      :can-refresh="canRefresh"
      @close="closePopover"
      @refresh="emit('refresh')"
    />
  </div>
</template>
