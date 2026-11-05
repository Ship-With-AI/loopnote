<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, render, watch } from 'vue';
import type * as monaco from 'monaco-editor';

import type { FileContentResponse } from '../../contracts/api.js';
import CommentComposer from './CommentComposer.vue';
import CommentThread from './CommentThread.vue';
import InlineNotice from './InlineNotice.vue';
import RenderedMarkdownView from './RenderedMarkdownView.vue';
import {
  createMonacoDiffAdapter,
  createMonacoSinglePaneAdapter,
  type AdapterNavigation,
  type AnchorAffordanceTarget,
  type DiffSide,
  type MonacoDiffAdapter,
} from '../monaco/diff-adapter.js';
import { diffThreadIds } from '../model/thread-zone-diff.js';
import type { WorkspaceComment, WorkspaceComposer } from '../model/workspace-state.js';
import { configureMonacoWorkers, languageForPath } from '../monaco/configure.js';

const props = withDefaults(defineProps<{
  comments: readonly WorkspaceComment[];
  composer?: WorkspaceComposer;
  mutationsLocked?: boolean;
  content: FileContentResponse;
  path: string;
  sessionToken: string;
  baseOid?: string;
  headOid?: string;
  singlePaneSide?: DiffSide;
  sourceKind?: 'range' | 'exact-patch';
  mode?: 'source' | 'rendered';
  renderSideBySide?: boolean;
  collapsedByCommentId?: ReadonlyMap<string, boolean>;
  editingCommentId?: string;
  commentBuffers?: ReadonlyMap<string, string>;
}>(), {
  sourceKind: 'range',
  mode: 'source',
  renderSideBySide: true,
  collapsedByCommentId: () => new Map(),
  commentBuffers: () => new Map(),
});

const emit = defineEmits<{
  add: [];
  cancel: [];
  confirmDiscard: [];
  confirmMove: [];
  activate: [side: DiffSide, line: number, endLine?: number];
  keepWriting: [];
  ready: [fileId: string];
  updateText: [text: string];
  'next-change': [];
  'previous-change': [];
  'next-file': [];
  'previous-file': [];
  'next-thread': [];
  'previous-thread': [];
  resolveComment: [commentId: string];
  reopenComment: [commentId: string];
  deleteComment: [commentId: string];
  beginEditComment: [commentId: string];
  updateCommentEditText: [commentId: string, text: string];
  saveCommentEdit: [commentId: string];
  cancelCommentEdit: [commentId: string];
  toggleCommentCollapse: [commentId: string];
}>();

const navigate: AdapterNavigation = {
  nextChange: () => emit('next-change'),
  previousChange: () => emit('previous-change'),
  nextFile: () => emit('next-file'),
  previousFile: () => emit('previous-file'),
  nextThread: () => emit('next-thread'),
  previousThread: () => emit('previous-thread'),
};

const host = ref<HTMLElement>();
const basePaneRef = ref<InstanceType<typeof RenderedMarkdownView>>();
const headPaneRef = ref<InstanceType<typeof RenderedMarkdownView>>();
const anchorAffordance = ref<AnchorAffordanceTarget>();
const lineChanges = ref<readonly monaco.editor.ILineChange[]>([]);
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
const baseText = computed(() => (props.content.base.exists ? props.content.base.text : ''));
const headText = computed(() => (props.content.head.exists ? props.content.head.text : ''));
const singlePaneRenderedSide = computed<DiffSide>(() => props.singlePaneSide ?? 'head');
const singlePaneRenderedContent = computed(() =>
  singlePaneRenderedSide.value === 'base' ? baseText.value : headText.value,
);

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

function syncRenderSideBySide(): void {
  adapter?.setRenderSideBySide(props.renderSideBySide);
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

const renderedThreadNodes = new Map<string, HTMLElement>();

function unmountThread(commentId: string): void {
  const node = renderedThreadNodes.get(commentId);
  if (node !== undefined) {
    render(null, node);
  }
  renderedThreadNodes.delete(commentId);
}

function clearRenderedThreads(): void {
  for (const commentId of [...renderedThreadNodes.keys()]) {
    unmountThread(commentId);
  }
}

function resizeThreadZoneToContent(commentId: string, node: HTMLElement): void {
  const contentHeight = node.firstElementChild?.scrollHeight ?? node.scrollHeight;
  adapter?.growThread(commentId, Math.max(140, contentHeight + 16));
}

function renderThreads(): void {
  const liveComments = props.comments.filter((comment) =>
    comment.fileId === props.content.fileId && comment.status !== 'orphaned');
  const diff = diffThreadIds(new Set(renderedThreadNodes.keys()), liveComments);

  for (const commentId of diff.toRemove) {
    adapter?.removeThread(commentId);
    unmountThread(commentId);
  }

  for (const commentId of diff.toCreate) {
    if (adapter === undefined) continue;
    const comment = liveComments.find((candidate) => candidate.id === commentId);
    if (comment === undefined) continue;
    const node = adapter.createThread(comment.id, {
      fileId: props.content.fileId,
      side: comment.side,
      line: comment.line,
      endLine: comment.recordedAnchor.endLine,
    });
    renderedThreadNodes.set(comment.id, node);
  }

  for (const commentId of [...diff.toCreate, ...diff.toKeep]) {
    const comment = liveComments.find((candidate) => candidate.id === commentId);
    const node = renderedThreadNodes.get(commentId);
    if (comment === undefined || node === undefined) continue;
    render(h(CommentThread, {
      comment,
      path: props.path,
      sideLabel: commentSideName(comment.side),
      collapsed: props.collapsedByCommentId?.get(comment.id) ?? (comment.state === 'resolved'),
      editing: props.editingCommentId === comment.id,
      editText: props.commentBuffers?.get(comment.id) ?? comment.body,
      mutationDisabled: props.mutationsLocked,
      onResolve: () => emit('resolveComment', comment.id),
      onReopen: () => emit('reopenComment', comment.id),
      onEdit: () => emit('beginEditComment', comment.id),
      onDelete: () => emit('deleteComment', comment.id),
      onToggleCollapse: () => emit('toggleCommentCollapse', comment.id),
      onUpdateEditText: (text: string) => emit('updateCommentEditText', comment.id, text),
      onSaveEdit: () => emit('saveCommentEdit', comment.id),
      onCancelEdit: () => emit('cancelCommentEdit', comment.id),
    }), node);
    void nextTick(() => {
      resizeThreadZoneToContent(commentId, node);
    });
  }
}

function renderAnnotation(): void {
  const zone = host.value?.querySelector<HTMLElement>('.monaco-anchor-zone--composer');
  const anchor = adapter?.getActiveAnchor();
  if (zone === undefined || zone === null || anchor === undefined || anchor.fileId !== props.content.fileId) {
    unmountZone();
    return;
  }
  if (zoneRoot !== zone) {
    unmountZone();
    zoneRoot = zone;
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
  lineChanges.value = adapter?.getLineChanges() ?? [];
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
  void nextTick(renderThreads);

  const composer = props.composer;
  if (composer !== undefined && composer.side !== undefined && composer.line !== undefined) {
    const anchor = composerAnchor(composer.side, composer.line);
    observedAnchor = anchor;
    focusComposerAnchor = anchor;
    adapter.setActiveAnchor({ fileId: props.content.fileId, side: composer.side, line: composer.line, endLine: composer.endLine });
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
    host.value?.querySelector<HTMLElement>(`[data-comment-id="${CSS.escape(commentId)}"] .thread-header`)?.focus();
  });
}


function revealComment(side: DiffSide, line: number, endLine?: number): void {
  adapter?.revealAnchor({ fileId: props.content.fileId, side, line, endLine });
  void nextTick(renderAnnotation);
  void nextTick(renderThreads);
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
        endLine: props.composer.endLine,
      });
      focusComposerAnchor = activeComposerAnchor;
    }
  } else {
    observedComposerAnchor = '';
    if (adapter?.getActiveAnchor() !== undefined) {
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

watch(() => [props.comments, props.collapsedByCommentId, props.editingCommentId, props.commentBuffers] as const, renderThreads);

watch(visibleSides, syncSideNames);
watch(() => props.renderSideBySide, syncRenderSideBySide);
watch(() => props.mode, () => {
  // v-show toggles the Monaco container's display between none/block; Monaco never
  // observes that transition on its own (ResizeObserver timing is not reliable enough
  // for anchor zones created while hidden), so force a relayout once the container is
  // visible again, or the editor — and any anchor zone/decoration created while hidden
  // (e.g. a rendered-block comment) — stays laid out at its stale zero-size dimensions.
  // A zone created while the editor had zero size also never renders correctly once the
  // editor is resized, so re-apply the active anchor to force rebuildAnchoredLayout()
  // to recreate it against the now-correctly-sized editor.
  void nextTick(() => {
    const width = host.value?.clientWidth ?? 0;
    const height = host.value?.clientHeight ?? 0;
    adapter?.layout(width > 0 && height > 0 ? { width, height } : undefined);
    const anchor = adapter?.getActiveAnchor();
    if (anchor !== undefined) {
      adapter?.setActiveAnchor(anchor);
      void nextTick(renderAnnotation);
      void nextTick(renderThreads);
    }
  });
});

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
  clearRenderedThreads();
  adapter?.dispose();
  adapter = undefined;
  void nextTick(() => {
    if (host.value === undefined) return;
    adapter = props.singlePaneSide !== undefined
      ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, navigate, props.singlePaneSide)
      : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState, navigate);
    syncCodeDensity();
    syncSideNames();
    syncRenderSideBySide();
    void loadContent();
  });
});

onMounted(() => {
  if (host.value === undefined) return;
  configureMonacoWorkers();
  adapter = props.singlePaneSide !== undefined
    ? createMonacoSinglePaneAdapter(host.value, languageForPath, syncAdapterState, navigate, props.singlePaneSide)
    : createMonacoDiffAdapter(host.value, languageForPath, syncAdapterState, navigate);
  wideCodeMedia = window.matchMedia('(min-width: 1650px)');
  compactCodeMedia = window.matchMedia('(max-width: 760px)');
  syncCodeDensity();
  wideCodeMedia.addEventListener('change', syncCodeDensity);
  compactCodeMedia.addEventListener('change', syncCodeDensity);
  syncSideNames();
  syncRenderSideBySide();
  resizeObserver = new ResizeObserver(() => {
    adapter?.layout();
    const zone = host.value?.querySelector<HTMLElement>('.monaco-anchor-zone--composer');
    if (zone === null || zone === undefined) return;
    const contentHeight = zone.firstElementChild?.scrollHeight ?? zone.scrollHeight;
    const height = Math.max(280, contentHeight + 16);
    if (Math.abs(zone.clientHeight - height) > 1) resizeAnchorZoneToContent(zone);
  });
  resizeObserver.observe(host.value);
  void loadContent();
});
onBeforeUnmount(() => {
  unmountZone();
  clearRenderedThreads();
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
          <div ref="host" class="diff-workspace__editor" v-show="mode === 'source'" :aria-hidden="mode === 'rendered'" />
          <RenderedMarkdownView
            v-if="mode === 'rendered'"
            :content="singlePaneRenderedContent"
            :side="singlePaneRenderedSide"
            :comments="comments"
            :composer="composer"
            :mutations-locked="mutationsLocked"
            :path="path"
            :file-id="content.fileId"
            :session-token="sessionToken"
            @add="emit('add')"
            @cancel="emit('cancel')"
            @confirm-discard="emit('confirmDiscard')"
            @confirm-move="emit('confirmMove')"
            @activate="(side, line, endLine) => emit('activate', side, line, endLine)"
            @keep-writing="emit('keepWriting')"
            @ready="(fileId) => emit('ready', fileId)"
            @update-text="(text) => emit('updateText', text)"
          />
        </template>
      </div>
    </div>
  </section>
  <section v-else class="diff-workspace" :aria-label="`${path}: ${visibleSides.originalName} and ${visibleSides.modifiedName} side-by-side diff`">
    <div class="diff-workspace__viewport">
      <div class="diff-workspace__canvas" :class="{ 'diff-workspace__canvas--rendered': mode === 'rendered' }">
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
        <div ref="host" class="diff-workspace__editor" v-show="mode === 'source'" :aria-hidden="mode === 'rendered'" />
        <RenderedMarkdownView
          v-if="mode === 'rendered'"
          ref="basePaneRef"
          :content="baseText"
          side="base"
          :changes="lineChanges"
          :comments="comments"
          :composer="composer"
          :mutations-locked="mutationsLocked"
          :path="path"
          :file-id="content.fileId"
          :session-token="sessionToken"
          @add="emit('add')"
          @cancel="emit('cancel')"
          @confirm-discard="emit('confirmDiscard')"
          @confirm-move="emit('confirmMove')"
          @activate="(side, line, endLine) => emit('activate', side, line, endLine)"
          @keep-writing="emit('keepWriting')"
          @ready="(fileId) => emit('ready', fileId)"
          @update-text="(text) => emit('updateText', text)"
          @scrolled-to-block="(range) => headPaneRef?.scrollToRange(range.start, range.end)"
        />
        <RenderedMarkdownView
          v-if="mode === 'rendered'"
          ref="headPaneRef"
          :content="headText"
          side="head"
          :changes="lineChanges"
          :comments="comments"
          :composer="composer"
          :mutations-locked="mutationsLocked"
          :path="path"
          :file-id="content.fileId"
          :session-token="sessionToken"
          @add="emit('add')"
          @cancel="emit('cancel')"
          @confirm-discard="emit('confirmDiscard')"
          @confirm-move="emit('confirmMove')"
          @activate="(side, line, endLine) => emit('activate', side, line, endLine)"
          @keep-writing="emit('keepWriting')"
          @ready="(fileId) => emit('ready', fileId)"
          @update-text="(text) => emit('updateText', text)"
          @scrolled-to-block="(range) => basePaneRef?.scrollToRange(range.start, range.end)"
        />
      </div>
    </div>
    <p class="diff-workspace__horizontal-cue" aria-hidden="true">Scroll horizontally to view {{ visibleSides.modified }}.</p>
    <p class="diff-workspace__context-help">
      Unchanged regions begin collapsed. Use Monaco’s context controls to reveal bounded context or all remaining context.
    </p>
  </section>
</template>
