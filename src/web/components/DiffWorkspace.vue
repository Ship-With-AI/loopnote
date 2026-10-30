<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, render, watch } from 'vue';

import type { FileContentResponse } from '../../contracts/api.js';
import CommentComposer from './CommentComposer.vue';
import InlineNotice from './InlineNotice.vue';
import PathText from './ui/PathText.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import {
  createMonacoDiffAdapter,
  createMonacoSinglePaneAdapter,
  type AnchorAffordanceTarget,
  type DiffSide,
  type MonacoDiffAdapter,
} from '../monaco/diff-adapter.js';
import type { WorkspaceComment, WorkspaceComposer } from '../model/workspace-state.js';
import { configureMonacoWorkers, languageForPath } from '../monaco/configure.js';

const props = withDefaults(defineProps<{
  comments: readonly WorkspaceComment[];
  composer?: WorkspaceComposer;
  mutationsLocked?: boolean;
  content: FileContentResponse;
  path: string;
  baseOid?: string;
  headOid?: string;
  singlePaneSide?: DiffSide;
  sourceKind?: 'range' | 'exact-patch';
}>(), {
  sourceKind: 'range',
});

const emit = defineEmits<{
  add: [];
  cancel: [];
  confirmDiscard: [];
  confirmMove: [];
  activate: [side: DiffSide, line: number];
  keepWriting: [];
  ready: [fileId: string];
  updateText: [text: string];
}>();

const host = ref<HTMLElement>();
const anchorAffordance = ref<AnchorAffordanceTarget>();
let adapter: MonacoDiffAdapter | undefined;
let resizeObserver: ResizeObserver | undefined;
let wideCodeMedia: MediaQueryList | undefined;
let compactCodeMedia: MediaQueryList | undefined;
let loadVersion = 0;
let observedAnchor = '';
let observedComposerAnchor = '';
let zoneRoot: HTMLElement | undefined;
let focusComposerAnchor: string | undefined;

const visibleSides = computed(() =>
  props.sourceKind === 'exact-patch'
    ? { original: 'PREIMAGE', modified: 'POSTIMAGE', originalName: 'preimage', modifiedName: 'postimage' }
    : { original: 'BASE', modified: 'HEAD', originalName: 'base', modifiedName: 'head' },
);
const commentSideName = (side: DiffSide) =>
  props.sourceKind === 'exact-patch'
    ? side === 'base' ? 'preimage' : 'postimage'
    : side === 'base' ? 'Base' : 'Head';
function immutableFile() {
  const fallbackPath = props.path;
  return {
    id: props.content.fileId,
    base: props.content.base.exists
      ? { path: props.content.base.path.display, text: props.content.base.text }
      : { path: fallbackPath, text: '' },
    head: props.content.head.exists
      ? { path: props.content.head.path.display, text: props.content.head.text }
      : { path: fallbackPath, text: '' },
  };
}

const singlePaneSideWord = computed(() =>
  props.singlePaneSide === 'base' ? visibleSides.value.original : visibleSides.value.modified,
);
const singlePaneOid = computed(() => (props.singlePaneSide === 'base' ? props.baseOid : props.headOid));
const singlePaneSideLabel = computed(() =>
  singlePaneOid.value !== undefined
    ? `${singlePaneSideWord.value} · ${singlePaneOid.value}`
    : singlePaneSideWord.value,
);
const isSinglePaneFileEmpty = computed(() => {
  if (props.singlePaneSide === undefined) return false;
  const side = props.singlePaneSide === 'base' ? props.content.base : props.content.head;
  return side.exists && side.text.length === 0;
});
const editorKind = computed(() => props.singlePaneSide ?? 'diff');

function syncSideNames(): void {
  adapter?.setSideNames({
    original: visibleSides.value.originalName,
    modified: visibleSides.value.modifiedName,
  });
}

function syncCodeDensity(): void {
  adapter?.setCodeDensity(
    wideCodeMedia?.matches ? 'wide' : compactCodeMedia?.matches ? 'compact' : 'default',
  );
}

function currentComment() {
  const anchor = adapter?.getActiveAnchor();
  return anchor === undefined
    ? undefined
    : props.comments.find((comment) => comment.fileId === anchor.fileId
      && comment.side === anchor.side && comment.line === anchor.line && comment.status === 'verified');
}
function composerAnchor(side: DiffSide, line: number): string {
  return `${side}:${line}`;
}



function unmountZone(): void {
  if (zoneRoot !== undefined) {
    render(null, zoneRoot);
    zoneRoot = undefined;
  }
}
function resizeAnchorZoneToContent(zone: HTMLElement): void {
  const contentHeight = zone.firstElementChild?.scrollHeight ?? zone.scrollHeight;
  adapter?.setAnchorZoneHeight(Math.max(280, contentHeight + 16));
}


function renderAnnotation(): void {
  const zone = host.value?.querySelector<HTMLElement>('.monaco-anchor-zone--composer');
  const anchor = adapter?.getActiveAnchor();
  if (zone === undefined || anchor === undefined || anchor.fileId !== props.content.fileId) {
    unmountZone();
    return;
  }
  if (zoneRoot !== zone) {
    unmountZone();
    zoneRoot = zone;
  }
  const comment = currentComment();
  if (comment !== undefined) {
    render(h('section', { class: 'conversation-card inline-accepted-comment', 'data-comment-id': comment.id }, [
      h('header', { class: 'conversation-card__header' }, [
        h('h3', { tabindex: -1, class: 'conversation-card__identity' }, [
          h(PathText, { display: props.path }),
          h('span', ` · ${commentSideName(comment.side)} · line ${comment.line}`),
        ]),
        h('div', { class: 'conversation-card__badges' }, [
          h(ReviewStateBadge, { kind: comment.state, label: comment.state === 'open' ? 'Open' : 'Resolved' }),
          h(ReviewStateBadge, { kind: 'verified', label: 'Verified' }),
        ]),
      ]),
      h('div', { class: 'conversation-card__body' }, [h('p', comment.body)]),
      h('footer', { class: 'conversation-card__footer' }, [h('span', { class: 'comment-badge' }, 'Saved locally')]),
    ]), zone);
    void nextTick(() => {
      resizeAnchorZoneToContent(zone);
    });
    return;
  }
  if (props.composer === undefined || props.composer.side !== anchor.side || props.composer.line !== anchor.line) {
    render(null, zone);
    return;
  }
  const shouldFocusComposer = focusComposerAnchor === composerAnchor(props.composer.side, props.composer.line);
  render(h(CommentComposer, {
    ...props.composer,
    path: props.path,
    mutationsLocked: props.mutationsLocked,
    onCancel: () => emit('cancel'),
    onAdd: () => emit('add'),
    onConfirmDiscard: () => emit('confirmDiscard'),
    onConfirmMove: () => emit('confirmMove'),
    onKeepWriting: () => emit('keepWriting'),
    onUpdateText: (text: string) => emit('updateText', text),
  }), zone);
  void nextTick(() => {
    resizeAnchorZoneToContent(zone);
    if (shouldFocusComposer) {
      requestAnimationFrame(() => {
        if (zone !== host.value?.querySelector('.monaco-anchor-zone--composer')) {
          return;
        }
        zone.querySelector<HTMLTextAreaElement>('textarea')?.focus();
        focusComposerAnchor = undefined;
      });
    }
  });
}

function syncAdapterState(): void {
  const pendingMove = props.composer?.pendingMove;
  anchorAffordance.value = pendingMove === undefined
    ? adapter?.getAnchorAffordance()
    : adapter?.getAnchorAffordanceAt(pendingMove.side, pendingMove.line);
  if (pendingMove !== undefined) {
    return;
  }
  const anchor = adapter?.getActiveAnchor();
  if (anchor === undefined || anchor.fileId !== props.content.fileId) {
    return;
  }
  const key = composerAnchor(anchor.side, anchor.line);
  if (key === observedAnchor) {
    return;
  }
  observedAnchor = key;
  focusComposerAnchor = key;
  emit('activate', anchor.side, anchor.line);
}

async function loadContent(): Promise<void> {
  if (adapter === undefined) return;
  const version = ++loadVersion;
  await adapter.setFile(immutableFile());
  syncSideNames();
  if (version !== loadVersion) return;

  const composer = props.composer;
  if (composer !== undefined && composer.side !== undefined && composer.line !== undefined) {
    const anchor = composerAnchor(composer.side, composer.line);
    observedAnchor = anchor;
    focusComposerAnchor = anchor;
    adapter.setActiveAnchor({ fileId: props.content.fileId, side: composer.side, line: composer.line });
    void nextTick(renderAnnotation);
  }

  emit('ready', props.content.fileId);
}

function previousChange(): void {
  adapter?.goToChange('previous');
}

function nextChange(): void {
  adapter?.goToChange('next');
}

function layout(): void {
  adapter?.layout();
}

function addComment(target: AnchorAffordanceTarget): void {
  if (props.composer === undefined || props.composer.text.trim().length === 0) {
    adapter?.activateAnchor(target.side, target.line);
    return;
  }
  emit('activate', target.side, target.line);
}

function focusComment(commentId: string): void {
  void nextTick(() => {
    host.value?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(commentId)}"] h3`)?.focus();
  });
}


function revealComment(side: DiffSide, line: number): void {
  adapter?.revealAnchor({ fileId: props.content.fileId, side, line });
  void nextTick(renderAnnotation);
}

defineExpose({ focusComment, layout, nextChange, previousChange, revealComment });

watch(() => [props.composer, props.comments] as const, () => {
  if (props.composer !== undefined) {
    const activeComposerAnchor = composerAnchor(props.composer.side, props.composer.line);
    if (activeComposerAnchor !== observedComposerAnchor) {
      observedComposerAnchor = activeComposerAnchor;
      focusComposerAnchor = activeComposerAnchor;
    }
    observedAnchor = activeComposerAnchor;
    const anchor = adapter?.getActiveAnchor();
    if (anchor?.fileId !== props.content.fileId
      || anchor.side !== props.composer.side || anchor.line !== props.composer.line) {
      adapter?.setActiveAnchor({
        fileId: props.content.fileId,
        side: props.composer.side,
        line: props.composer.line,
      });
      focusComposerAnchor = activeComposerAnchor;
    }
  } else {
    observedComposerAnchor = '';
    if (currentComment() === undefined && adapter?.getActiveAnchor() !== undefined) {
      unmountZone();
      adapter.clearAnchor();
    }
  }
  const pendingMove = props.composer?.pendingMove;
  anchorAffordance.value = pendingMove === undefined
    ? adapter?.getAnchorAffordance()
    : adapter?.getAnchorAffordanceAt(pendingMove.side, pendingMove.line);
  void nextTick(renderAnnotation);
}, { deep: true });

watch(visibleSides, syncSideNames);

watch(() => props.content, () => {
  observedAnchor = '';
  observedComposerAnchor = '';
  focusComposerAnchor = undefined;
  anchorAffordance.value = undefined;
  unmountZone();
  void loadContent();
});

watch(editorKind, () => {
  unmountZone();
  adapter?.dispose();
  adapter = undefined;
  void nextTick(() => {
    if (host.value === undefined) return;
    adapter = props.singlePaneSide !== undefined
      ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, props.singlePaneSide)
      : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState);
    syncCodeDensity();
    syncSideNames();
    void loadContent();
  });
});

onMounted(() => {
  if (host.value === undefined) return;
  configureMonacoWorkers();
  adapter = props.singlePaneSide !== undefined
    ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, props.singlePaneSide)
    : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState);
  wideCodeMedia = window.matchMedia('(min-width: 1650px)');
  compactCodeMedia = window.matchMedia('(max-width: 760px)');
  syncCodeDensity();
  wideCodeMedia.addEventListener('change', syncCodeDensity);
  compactCodeMedia.addEventListener('change', syncCodeDensity);
  syncSideNames();
  resizeObserver = new ResizeObserver(() => {
    adapter?.layout();
    const zone = host.value?.querySelector<HTMLElement>('.monaco-anchor-zone--composer');
    if (zone === null) return;
    const contentHeight = zone.firstElementChild?.scrollHeight ?? zone.scrollHeight;
    const height = Math.max(280, contentHeight + 16);
    if (Math.abs(zone.clientHeight - height) > 1) resizeAnchorZoneToContent(zone);
  });
  resizeObserver.observe(host.value);
  void loadContent();
});
onBeforeUnmount(() => {
  unmountZone();
  resizeObserver?.disconnect();
  wideCodeMedia?.removeEventListener('change', syncCodeDensity);
  compactCodeMedia?.removeEventListener('change', syncCodeDensity);
  adapter?.dispose();
});
</script>

<template>
  <section
    v-if="singlePaneSide !== undefined"
    class="diff-workspace diff-workspace--single-pane"
    :aria-label="`${path}: ${singlePaneSideWord} only`"
  >
    <div class="diff-workspace__viewport">
      <div class="diff-workspace__canvas">
        <div class="diff-workspace__side-labels diff-workspace__side-labels--single-pane" aria-hidden="true">
          <span>
            <span>{{ singlePaneSideLabel }}</span>
          </span>
        </div>
        <InlineNotice v-if="isSinglePaneFileEmpty" tone="neutral" role="note">
          <p>Empty file (0 bytes)</p>
        </InlineNotice>
        <template v-else>
          <button
            v-if="anchorAffordance"
            type="button"
            class="diff-workspace__gutter-action"
            :style="{ top: `${anchorAffordance.top}px` }"
            :data-anchor-side="anchorAffordance.side"
            :data-anchor-line="anchorAffordance.line"
            :aria-label="`Add comment to ${singlePaneSideWord} line ${anchorAffordance.line}`"
            :title="`Add comment to ${singlePaneSideWord} line ${anchorAffordance.line} · Option+Enter`"
            :disabled="mutationsLocked"
            @click="addComment(anchorAffordance)"
          >+</button>
          <div ref="host" class="diff-workspace__editor" />
        </template>
      </div>
    </div>
  </section>
  <section v-else class="diff-workspace" :aria-label="`${path}: ${visibleSides.originalName} and ${visibleSides.modifiedName} side-by-side diff`">
    <div class="diff-workspace__viewport">
      <div class="diff-workspace__canvas">
        <div class="diff-workspace__side-labels" aria-hidden="true">
          <span>
            <span>{{ visibleSides.original }}</span>
            <span class="diff-workspace__side-cue diff-workspace__side-cue--base">− REMOVED</span>
          </span>
          <span>
            <span>{{ visibleSides.modified }}</span>
            <span class="diff-workspace__side-cue diff-workspace__side-cue--head">+ ADDED</span>
          </span>
        </div>
        <button
          v-if="anchorAffordance"
          type="button"
          class="diff-workspace__gutter-action"
          :class="{ 'diff-workspace__gutter-action--base': anchorAffordance.side === 'base' }"
          :style="{ top: `${anchorAffordance.top}px` }"
          :data-anchor-side="anchorAffordance.side"
          :data-anchor-line="anchorAffordance.line"
          :aria-label="`Add comment to ${anchorAffordance.side === 'base' ? visibleSides.originalName : visibleSides.modifiedName} line ${anchorAffordance.line}`"
          :title="`Add comment to ${anchorAffordance.side === 'base' ? visibleSides.originalName : visibleSides.modifiedName} line ${anchorAffordance.line} · Option+Enter`"
          :disabled="mutationsLocked"
          @click="addComment(anchorAffordance)"
        >+</button>
        <div ref="host" class="diff-workspace__editor" />
      </div>
    </div>
    <p class="diff-workspace__horizontal-cue" aria-hidden="true">Scroll horizontally to view {{ visibleSides.modified }}.</p>
    <p class="diff-workspace__context-help">
      Unchanged regions begin collapsed. Use Monaco’s context controls to reveal bounded context or all remaining context.
    </p>
  </section>
</template>
