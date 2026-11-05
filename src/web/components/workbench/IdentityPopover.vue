<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

import type { SelectorDriftResponse, SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import { controlSafeDisplay } from '../../../domain/path-bytes';
import UiIcon from '../ui/UiIcon.vue';
import InlineNotice from '../InlineNotice.vue';
import SelectorDriftNotice from '../SelectorDriftNotice.vue';
import { identityDriftKind, identityKind, type DriftKind, type IdentityKind } from './IdentityPill.vue';

const props = defineProps<{
  readonly session: SessionResponse;
  readonly selectorDriftStatus?: SelectorDriftResponse;
  readonly patchDrifted: boolean;
  readonly worktreeChanged: boolean;
  readonly refreshBusy: boolean;
  readonly canRefresh: boolean;
}>();

const emit = defineEmits<{ close: []; refresh: [] }>();

interface PopoverRow {
  readonly dt: string;
  readonly ddText: string;
  readonly chipText?: string;
  readonly dirty?: boolean;
}

const panel = ref<HTMLElement>();
const headingId = useId();
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
let copiedTimer: number | undefined;
// Centered via CSS (`left: 50%; transform: translateX(-50%)`) relative to `.identity-pill-host`,
// which is sized to the pill's own (possibly tiny, off-center) box — not the viewport. When the
// title bar's left/right groups are uneven width (e.g. an agent-attached `.attached-fact` badge
// widens the right side), the pill itself sits left-of-center, and a popover simply centered on
// the pill can run off the left or right edge of the viewport. This measures the rendered panel
// after each open/resize and nudges it back on-screen with the same 8px margin the width rule
// (`min(440px, calc(100vw - var(--space-4)))`) already reserves per side — pure measurement-based
// repositioning, no popper/floating-ui dependency added.
const VIEWPORT_EDGE_MARGIN_PX = 8;
const edgeShiftPx = ref(0);

function clampToViewport(): void {
  void nextTick(() => {
    const element = panel.value;
    if (element === undefined) return;
    const rect = element.getBoundingClientRect();
    // `rect` already includes the current translation, so the next correction has to be
    // computed against the unshifted box — otherwise a correct clamp measures as in-bounds
    // and resets to 0 on the next resize event (un-clamping the popover again).
    const shift = edgeShiftPx.value;
    const overflowLeft = VIEWPORT_EDGE_MARGIN_PX - (rect.left - shift);
    const overflowRight = rect.right - shift - (window.innerWidth - VIEWPORT_EDGE_MARGIN_PX);
    edgeShiftPx.value = overflowLeft > 0 ? overflowLeft : overflowRight > 0 ? -overflowRight : 0;
  });
}

const focusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(', ');

const kind = computed<IdentityKind>(() => identityKind(props.session));
const driftKind = computed<DriftKind>(() =>
  identityDriftKind(props.patchDrifted, props.selectorDriftStatus, props.worktreeChanged),
);

const pinnedSession = computed(() => ('base' in props.session ? props.session : undefined));
const uncommitted = computed(() => ('uncommitted' in props.session ? props.session.uncommitted : undefined));
const exactPatch = computed(() => ('patch' in props.session ? props.session.patch : undefined));
const isRange = computed(() => pinnedSession.value?.range?.kind === 'revisions');

function endpointChip(hasWorktree: boolean): string {
  if (isRange.value) return 'Pinned';
  return hasWorktree ? 'Worktree' : 'Branch';
}

const rows = computed<readonly PopoverRow[]>(() => {
  const list: PopoverRow[] = [];
  const pinned = pinnedSession.value;
  if (pinned !== undefined) {
    const baseHasWorktree = pinned.base.worktree !== undefined;
    const headHasWorktree = pinned.head.worktree !== undefined;
    list.push({
      dt: 'Base',
      ddText: isRange.value
        ? controlSafeDisplay(pinned.base.label)
        : `${controlSafeDisplay(pinned.base.label)} · ${controlSafeDisplay(pinned.base.oid.slice(0, 7))}`,
      chipText: endpointChip(baseHasWorktree),
    });
    list.push({
      dt: 'Head',
      ddText: isRange.value
        ? controlSafeDisplay(pinned.head.label)
        : `${controlSafeDisplay(pinned.head.label)} · ${controlSafeDisplay(pinned.head.oid.slice(0, 7))}`,
      chipText: endpointChip(headHasWorktree),
    });
    if (pinned.mergeBaseOid !== undefined) {
      list.push({ dt: 'Merge base', ddText: controlSafeDisplay(pinned.mergeBaseOid.slice(0, 7)) });
    }
    if (baseHasWorktree) {
      list.push({
        dt: headHasWorktree ? 'Base worktree' : 'Worktree',
        ddText: controlSafeDisplay(pinned.base.worktree!.path),
        dirty: pinned.base.worktree!.dirty === true,
      });
    }
    if (headHasWorktree) {
      list.push({
        dt: baseHasWorktree ? 'Head worktree' : 'Worktree',
        ddText: controlSafeDisplay(pinned.head.worktree!.path),
        dirty: pinned.head.worktree!.dirty === true,
      });
    }
    return list;
  }
  const uncommittedValue = uncommitted.value;
  if (uncommittedValue !== undefined) {
    switch (uncommittedValue.sourceKind) {
      case 'staged':
        list.push({ dt: 'Base', ddText: `HEAD · ${controlSafeDisplay(uncommittedValue.baseCommitOid?.slice(0, 7) ?? '')}` });
        list.push({ dt: 'Head', ddText: 'Staged' });
        break;
      case 'unstaged':
        list.push({ dt: 'Base', ddText: 'Index' });
        list.push({ dt: 'Head', ddText: 'Unstaged' });
        break;
      case 'worktree':
        list.push({ dt: 'Base', ddText: `HEAD · ${controlSafeDisplay(uncommittedValue.baseCommitOid?.slice(0, 7) ?? '')}` });
        list.push({ dt: 'Head', ddText: 'Working tree' });
        break;
      case 'standalone':
        break;
    }
    list.push({ dt: 'Snapshot', ddText: controlSafeDisplay(uncommittedValue.reviewKey.slice(0, 7)) });
    return list;
  }
  const patch = exactPatch.value;
  if (patch !== undefined) {
    list.push({ dt: 'Snapshot', ddText: controlSafeDisplay(patch.digest.slice(0, 7)) });
    list.push({
      dt: 'Validated against',
      ddText: patch.validationTarget.kind === 'repository' ? 'Repository' : 'Worktree',
    });
    list.push({ dt: 'Patch digest', ddText: controlSafeDisplay(patch.digest) });
  }
  return list;
});

const worktreeSourceLabel = computed(() => {
  switch (uncommitted.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    case 'standalone': return 'the reviewed files';
    default: return '';
  }
});
const worktreeSnapshotDigest = computed(() => controlSafeDisplay(uncommitted.value?.reviewKey.slice(0, 7) ?? ''));

function selectorGuidance(): string {
  const drift = props.selectorDriftStatus;
  const status = drift === undefined ? undefined : [drift.base, drift.head].find((candidate) => candidate.kind !== 'unchanged');
  if (status === undefined) {
    return 'This review stays pinned to these commits. Relaunch to review a different ref.';
  }
  const role = status.role === 'base' ? 'Base' : 'Head';
  if (status.kind === 'moved') {
    return `${role} moved to ${controlSafeDisplay(status.newOid.slice(0, 7))}. Relaunch to review the new commits.`;
  }
  return `${role} source is no longer available. Relaunch with a different ref.`;
}

const guidanceText = computed(() => {
  switch (kind.value) {
    case 'range':
      return 'This review stays pinned to these exact revisions. Relaunch to review different revisions.';
    case 'exact-patch':
      return driftKind.value === 'patch'
        ? 'This exact patch no longer matches the current content. Relaunch with a patch that matches the current implementation.'
        : 'Exact patches cannot refresh. Relaunch with an updated patch to review new changes.';
    case 'branch':
    case 'worktree':
      return driftKind.value === 'selector'
        ? selectorGuidance()
        : 'This review stays pinned to these commits. Relaunch to review a different ref.';
    default:
      return '';
  }
});

const refreshLabel = computed(() => {
  if (props.refreshBusy) return 'Capturing…';
  return driftKind.value === 'worktree' ? 'Refresh' : 'Refresh to capture current changes';
});

function copyIdentity(): void {
  copyState.value = 'idle';
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
  const text = rows.value
    .map((row) => {
      const chip = row.dirty === true ? ' (Dirty bytes ignored)' : row.chipText !== undefined ? ` (${row.chipText})` : '';
      return `${row.dt}: ${row.ddText}${chip}`;
    })
    .join('\n');
  void navigator.clipboard.writeText(text)
    .then(() => {
      copyState.value = 'copied';
      copiedTimer = window.setTimeout(() => { copyState.value = 'idle'; }, 1_200);
    })
    .catch(() => {
      // Deliberately does not auto-clear: an unannounced, time-limited failure state is the
      // defect this fixes (WR-04). The failure stays visible/announced until the reviewer
      // retries (copyIdentity resets to 'idle' at the top on the next click) or closes the
      // popover.
      copyState.value = 'failed';
    });
}

function containFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;

  const controls = Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
  if (controls.length === 0) return;

  const first = controls[0]!;
  const last = controls.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handlePointerDown(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  // The popover panel and its pill trigger button are both direct children of the shared
  // `.identity-pill-host` wrapper (see IdentityPill.vue) — checking that ancestor is equivalent
  // to "outside both the popover panel and the pill trigger button" without needing a separate
  // trigger-element prop.
  const host = panel.value?.parentElement;
  if (host?.contains(target) === true) return;
  emit('close');
}

onMounted(() => {
  document.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('resize', clampToViewport);
  void nextTick(() => {
    panel.value?.querySelector<HTMLElement>(focusableSelector)?.focus();
  });
  clampToViewport();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePointerDown);
  window.removeEventListener('resize', clampToViewport);
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
});

</script>

<template>
  <section
    ref="panel"
    role="dialog"
    :aria-labelledby="headingId"
    class="identity-popover"
    :style="edgeShiftPx !== 0 ? { transform: `translateX(calc(-50% + ${edgeShiftPx}px))` } : undefined"
    @keydown="containFocus"
  >
    <div :id="headingId" class="identity-popover__head">
      <UiIcon name="compare" />Comparison
    </div>
    <dl class="identity-popover__grid">
      <div v-for="row in rows" :key="row.dt" class="identity-popover__row">
        <dt>{{ row.dt }}</dt>
        <dd>
          {{ row.ddText }}
          <span v-if="row.dirty === true" class="dirty-badge">
            <span>Dirty bytes ignored</span>
            <span class="visually-hidden">
              Committed HEAD reviewed; uncommitted changes aren't included.
            </span>
          </span>
          <span v-else-if="row.chipText !== undefined" class="identity-popover__chip">{{ row.chipText }}</span>
        </dd>
      </div>
    </dl>
    <SelectorDriftNotice v-if="driftKind === 'selector'" :drift="selectorDriftStatus" />
    <InlineNotice v-else-if="driftKind === 'patch'" tone="error">
      <h2>Implemented content changed</h2>
      <p>{{ `The repository or worktree no longer matches this exact patch. The frozen review remains readable, but ${RENAME_MAP.displayName} will not substitute current content. Relaunch with a patch that matches the current implementation.` }}</p>
    </InlineNotice>
    <InlineNotice v-else-if="driftKind === 'worktree'" tone="warning">
      <h2>Working tree changed since snapshot</h2>
      <p>{{ `Files in ${worktreeSourceLabel} changed after this snapshot was captured. The review stays pinned to snapshot ${worktreeSnapshotDigest} until you refresh.` }}</p>
    </InlineNotice>
    <div class="identity-popover__footer">
      <button type="button" class="ui-button ui-button--ghost" @click="copyIdentity">
        <UiIcon name="copy" />{{ copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy' }}
      </button>
      <p v-if="copyState === 'failed'" class="identity-popover__copy-failure" role="alert">
        Couldn’t copy to the clipboard. The values above remain visible to select manually.
      </p>
      <button
        v-if="canRefresh"
        type="button"
        class="ui-button ui-button--primary identity-popover__refresh"
        :disabled="refreshBusy"
        :aria-busy="refreshBusy"
        @click="emit('refresh')"
      >
        {{ refreshLabel }}
      </button>
      <p v-else class="identity-popover__guidance">{{ guidanceText }}</p>
    </div>
  </section>
</template>
