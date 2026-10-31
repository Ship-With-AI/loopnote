<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, render, watch } from 'vue';
import type * as monaco from 'monaco-editor';

import type { DiffSide } from '../monaco/diff-adapter.js';
import type { WorkspaceComment, WorkspaceComposer } from '../model/workspace-state.js';
import { renderMarkdownPreview } from '../model/markdown-preview.js';
import {
  buildImageRouteUrl,
  classifyBlockChange,
  extractSourceBlocks,
  findNearestBlock,
  findTopmostVisibleBlock,
  shouldEmitScrollSync,
} from '../model/rendered-markdown-blocks.js';
import CommentComposer from './CommentComposer.vue';
import PathText from './ui/PathText.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';

const props = defineProps<{
  content: string;
  side: DiffSide;
  comments: readonly WorkspaceComment[];
  composer?: WorkspaceComposer;
  mutationsLocked?: boolean;
  path: string;
  fileId: string;
  changes?: readonly monaco.editor.ILineChange[] | null;
}>();

const emit = defineEmits<{
  add: [];
  cancel: [];
  confirmDiscard: [];
  confirmMove: [];
  activate: [side: DiffSide, line: number, endLine: number];
  keepWriting: [];
  ready: [fileId: string];
  updateText: [text: string];
  scrolledToBlock: [range: { start: number; end: number }];
}>();

type RenderedBlockEntry = Readonly<{ element: HTMLElement; start: number; end: number }>;

const container = ref<HTMLElement>();
const blocks = ref<RenderedBlockEntry[]>([]);
const programmaticScrollInFlight = ref(false);
const html = computed(() => renderMarkdownPreview(props.content));

const annotationNodes: HTMLElement[] = [];
let activeButton: HTMLButtonElement | undefined;
let activeButtonBlock: HTMLElement | undefined;

function blockKindWord(element: HTMLElement): string {
  const tag = element.tagName;
  if (/^H[1-6]$/u.test(tag)) return 'heading';
  if (tag === 'LI') return 'list item';
  if (tag === 'TR') return 'table row';
  if (tag === 'CODE') return 'code block';
  if (tag === 'P') return element.closest('blockquote') !== null ? 'quote' : 'paragraph';
  return 'paragraph';
}

function removeActiveButton(): void {
  activeButton?.remove();
  activeButton = undefined;
  activeButtonBlock = undefined;
}

function showButtonFor(entry: RenderedBlockEntry): void {
  if (activeButtonBlock === entry.element) return;
  removeActiveButton();

  const sideWord = props.side === 'base' ? 'Base' : 'Head';
  const label = `Add comment · ${sideWord} · ${blockKindWord(entry.element)}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'diff-workspace__gutter-action';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = props.mutationsLocked === true;
  button.textContent = '+';
  button.addEventListener('click', () => {
    emit('activate', props.side, entry.start + 1, entry.end);
  });
  entry.element.append(button);
  activeButton = button;
  activeButtonBlock = entry.element;
}

function hideButtonIfOutside(entry: RenderedBlockEntry, related: Node | null): void {
  if (related !== null && entry.element.contains(related)) return;
  if (activeButtonBlock === entry.element) removeActiveButton();
}

function attachBlockInteractions(entry: RenderedBlockEntry): void {
  entry.element.addEventListener('mouseenter', () => showButtonFor(entry));
  entry.element.addEventListener('mouseleave', (event) => {
    hideButtonIfOutside(entry, (event as MouseEvent).relatedTarget as Node | null);
  });
  entry.element.addEventListener('focusin', () => showButtonFor(entry));
  entry.element.addEventListener('focusout', (event) => {
    hideButtonIfOutside(entry, (event as FocusEvent).relatedTarget as Node | null);
  });
}

function clearAnnotations(): void {
  for (const node of annotationNodes) {
    render(null, node);
    node.remove();
  }
  annotationNodes.length = 0;
}

function firstOverlappingBlockIndex(line: number): number | undefined {
  const index = blocks.value.findIndex((block) => block.start + 1 <= line && line <= block.end);
  return index === -1 ? undefined : index;
}

function applyMarkers(): void {
  for (const block of blocks.value) {
    block.element.classList.remove('rendered-block--added', 'rendered-block--removed', 'rendered-block--changed');
    block.element.querySelector(':scope > .status-badge')?.remove();

    const classification = classifyBlockChange(block.start + 1, block.end, props.side, props.changes ?? null);
    if (classification === undefined) continue;

    block.element.classList.add(`rendered-block--${classification}`);
    const modifier = classification === 'removed' ? 'deleted' : classification === 'changed' ? 'modified' : 'added';
    const chip = document.createElement('span');
    chip.className = `status-badge status-badge--${modifier}`;
    chip.textContent = classification === 'added' ? 'Added' : classification === 'removed' ? 'Removed' : 'Changed';
    block.element.prepend(chip);
  }
}

function mountAnnotation(afterElement: HTMLElement): HTMLElement {
  const node = document.createElement('div');
  node.className = 'rendered-markdown__annotation';
  afterElement.after(node);
  annotationNodes.push(node);
  return node;
}

function renderAnnotations(): void {
  clearAnnotations();

  const matchingComments = props.comments.filter((comment) =>
    comment.fileId === props.fileId && comment.side === props.side && comment.status === 'verified');
  const insertAfter = new Map<number, HTMLElement>();
  const sideWord = props.side === 'base' ? 'Base' : 'Head';

  for (const comment of matchingComments) {
    const blockIndex = firstOverlappingBlockIndex(comment.line);
    if (blockIndex === undefined) continue;
    const block = blocks.value[blockIndex];
    const anchorElement = insertAfter.get(blockIndex) ?? block.element;
    const node = mountAnnotation(anchorElement);
    insertAfter.set(blockIndex, node);

    render(h('section', { class: 'conversation-card inline-accepted-comment', 'data-comment-id': comment.id }, [
      h('header', { class: 'conversation-card__header' }, [
        h('h3', { tabindex: -1, class: 'conversation-card__identity' }, [
          h(PathText, { display: props.path }),
          h('span', ` · ${sideWord} · ${blockKindWord(block.element)}`),
        ]),
        h('div', { class: 'conversation-card__badges' }, [
          h(ReviewStateBadge, { kind: comment.state, label: comment.state === 'open' ? 'Open' : 'Resolved' }),
          h(ReviewStateBadge, { kind: 'verified', label: 'Verified' }),
        ]),
      ]),
      h('div', { class: 'conversation-card__body' }, [h('p', comment.body)]),
      h('footer', { class: 'conversation-card__footer' }, [h('span', { class: 'comment-badge' }, 'Saved locally')]),
    ]), node);
  }

  const composer = props.composer;
  if (composer === undefined || composer.side !== props.side) return;
  const blockIndex = firstOverlappingBlockIndex(composer.line);
  if (blockIndex === undefined) return;
  const block = blocks.value[blockIndex];
  const anchorElement = insertAfter.get(blockIndex) ?? block.element;
  const node = mountAnnotation(anchorElement);

  render(h(CommentComposer, {
    ...composer,
    path: props.path,
    mutationsLocked: props.mutationsLocked,
    onCancel: () => emit('cancel'),
    onAdd: () => emit('add'),
    onConfirmDiscard: () => emit('confirmDiscard'),
    onConfirmMove: () => emit('confirmMove'),
    onKeepWriting: () => emit('keepWriting'),
    onUpdateText: (text: string) => emit('updateText', text),
  }), node);
}

function buildBlocks(): void {
  removeActiveButton();
  clearAnnotations();

  const host = container.value;
  if (host === undefined) return;

  const parsed = document.createElement('div');
  parsed.innerHTML = html.value;

  for (const image of parsed.querySelectorAll('img')) {
    const originalSrc = image.getAttribute('src');
    if (originalSrc === null || originalSrc === '') continue;
    image.setAttribute('src', buildImageRouteUrl(props.fileId, props.side, originalSrc));
  }

  const ranges = extractSourceBlocks(html.value);
  const matches = parsed.querySelectorAll<HTMLElement>('[data-source-start]');
  const entries: RenderedBlockEntry[] = [];
  matches.forEach((element, index) => {
    const range = ranges[index];
    if (range === undefined) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'rendered-block';
    wrapper.tabIndex = 0;
    wrapper.dataset.start = String(range.start);
    wrapper.dataset.end = String(range.end);
    element.replaceWith(wrapper);
    wrapper.appendChild(element);

    const entry: RenderedBlockEntry = { element: wrapper, start: range.start, end: range.end };
    attachBlockInteractions(entry);
    entries.push(entry);
  });

  host.replaceChildren(...Array.from(parsed.childNodes));
  blocks.value = entries;
  applyMarkers();
  renderAnnotations();
  emit('ready', props.fileId);
}

function handleScroll(): void {
  if (!shouldEmitScrollSync(programmaticScrollInFlight.value)) return;

  const host = container.value;
  if (host === undefined) return;

  const containerRect = host.getBoundingClientRect();
  const visibleBlocks = blocks.value.map((block) => ({
    start: block.start,
    end: block.end,
    top: block.element.getBoundingClientRect().top - containerRect.top,
  }));
  const topmost = findTopmostVisibleBlock(visibleBlocks, 0);
  if (topmost === undefined) return;

  emit('scrolledToBlock', { start: topmost.start, end: topmost.end });
}

defineExpose({
  scrollToRange(startLine: number, endLine: number): void {
    const block = findNearestBlock(blocks.value, startLine, endLine);
    if (block === undefined) return;

    programmaticScrollInFlight.value = true;
    block.element.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(() => {
      programmaticScrollInFlight.value = false;
    });
  },
});

onMounted(() => {
  buildBlocks();
  container.value?.addEventListener('scroll', handleScroll, { passive: true });
});
watch(() => [props.content, props.fileId, props.side] as const, buildBlocks);
watch(() => [props.comments, props.composer] as const, renderAnnotations, { deep: true });
watch(() => props.changes, applyMarkers);
watch(() => props.mutationsLocked, () => {
  if (activeButton !== undefined) activeButton.disabled = props.mutationsLocked === true;
});

onBeforeUnmount(() => {
  container.value?.removeEventListener('scroll', handleScroll);
  removeActiveButton();
  clearAnnotations();
});
</script>

<template>
  <div ref="container" class="rendered-markdown" />
</template>
