<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import type { DiffSide } from '../monaco/diff-adapter.js';
import type { WorkspaceComment, WorkspaceComposer } from '../model/workspace-state.js';
import { renderMarkdownPreview } from '../model/markdown-preview.js';
import { buildImageRouteUrl, extractSourceBlocks } from '../model/rendered-markdown-blocks.js';

const props = defineProps<{
  content: string;
  side: DiffSide;
  comments: readonly WorkspaceComment[];
  composer?: WorkspaceComposer;
  mutationsLocked?: boolean;
  path: string;
  fileId: string;
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
}>();

type RenderedBlockEntry = Readonly<{ element: HTMLElement; start: number; end: number }>;

const container = ref<HTMLElement>();
const blocks = ref<RenderedBlockEntry[]>([]);
const html = computed(() => renderMarkdownPreview(props.content));

function buildBlocks(): void {
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

    entries.push({ element: wrapper, start: range.start, end: range.end });
  });

  host.replaceChildren(...Array.from(parsed.childNodes));
  blocks.value = entries;
  emit('ready', props.fileId);
}

onMounted(buildBlocks);
watch(() => [props.content, props.fileId, props.side] as const, buildBlocks);
</script>

<template>
  <div ref="container" class="rendered-markdown" />
</template>
