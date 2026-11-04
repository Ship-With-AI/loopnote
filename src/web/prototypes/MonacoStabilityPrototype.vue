<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, render } from 'vue';
import '../styles.css';


import CommentComposer from '../components/CommentComposer.vue';

import {
  createMonacoDiffAdapter,
  type MonacoDiffAdapter,
  type ImmutableDiffFile,
} from '../monaco/diff-adapter';
import { configureMonacoWorkers, languageForPath } from '../monaco/configure';
import { RENAME_MAP } from '../../domain/product-identity';

const FILES: readonly ImmutableDiffFile[] = [
  {
    id: 'fixture-a',
    base: {
      path: 'src/review.ts',
      text: `export function renderReview() {
  const title = '${RENAME_MAP.displayName}';
  const stable00 = 'zero';
  const stable00a = 'zero a';
  const stable00b = 'zero b';
  const stable00c = 'zero c';
  const stable00d = 'zero d';
  const stable00e = 'zero e';
  const stable00f = 'zero f';
  const stable00g = 'zero g';
  const stable01 = 'one';
  const stable02 = 'two';
  const stable03 = 'three';
  const stable04 = 'four';
  const stable05 = 'five';
  const stable06 = 'six';
  const stable07 = 'seven';
  const stable08 = 'eight';
  const stable09 = 'nine';
  const stable10 = 'ten';
  const stable11 = 'eleven';
  const stable12 = 'twelve';
  const stable13 = 'thirteen';
  const stable14 = 'fourteen';
  const stable15 = 'fifteen';
  return title;
}`,
    },
    head: {
      path: 'src/review.ts',
      text: `export function renderReview() {
  const title = '${RENAME_MAP.displayName}';
  const stable00 = 'zero';
  const stable00a = 'zero a';
  const stable00b = 'zero b';
  const stable00c = 'zero c';
  const stable00d = 'zero d';
  const stable00e = 'zero e';
  const stable00f = 'zero f';
  const stable00g = 'zero g';
  const stable01 = 'one';
  const stable02 = 'two';
  const stable03 = 'three';
  const stable04 = 'four';
  const stable05 = 'five';
  const stable06 = 'six';
  const stable07 = 'seven';
  const inserted = 'head only';
  const inserted02 = 'head only';
  const inserted03 = 'head only';
  const inserted04 = 'head only';
  const stable08 = 'eight';
  const stable09 = 'nine';
  const stable10 = 'ten changed';
  const stable11 = 'eleven';
  const stable12 = 'twelve';
  const stable13 = 'thirteen';
  const stable14 = 'fourteen';
  return title;
}`,
    },
  },
  {
    id: 'fixture-b',
    base: {
      path: 'config/review.json',
      text: `{
  "name": "${RENAME_MAP.slug}",
  "stable01": true,
  "stable02": true,
  "stable03": true,
  "stable04": true,
  "stable05": true,
  "stable06": true,
  "stable07": true,
  "obsolete01": "base only",
  "obsolete02": "base only",
  "obsolete03": "base only",
  "obsolete04": "base only",
  "stable08": true,
  "stable09": true,
  "stable10": true,
  "stable11": true,
  "stable12": true,
  "stable13": true,
  "stable14": true,
  "stable15": true
}`,
    },
    head: {
      path: 'config/review.json',
      text: `{
  "name": "${RENAME_MAP.slug}",
  "stable01": true,
  "stable02": true,
  "stable03": true,
  "stable04": true,
  "stable05": true,
  "stable06": true,
  "stable07": true,
  "stable08": true,
  "stable09": true,
  "stable10": "changed",
  "stable11": true,
  "stable12": true,
  "stable13": true,
  "stable14": true,
  "stable15": true
}`,
    },
  },
  {
    id: 'fixture-added',
    base: { path: 'src/added.ts', text: '' },
    head: {
      path: 'src/added.ts',
      text: `export type Added = {
  created: true;
};

export const added = 'head only';`,
    },
  },
  {
    id: 'fixture-deleted',
    base: {
      path: 'src/deleted.ts',
      text: `export interface Deleted {
  removed: true;
}

export const deleted = 'base only';`,
    },
    head: { path: 'src/deleted.ts', text: '' },
  },
];

const host = ref<HTMLElement>();
const currentFileIndex = ref(0);
const rendered = ref(false);
const updateVersion = ref(0);
const currentFile = computed(() => FILES[currentFileIndex.value]);
let adapter: MonacoDiffAdapter | undefined;
let resizeObserver: ResizeObserver | undefined;
let zoneRoot: HTMLElement | undefined;
let firstFrameObserver: MutationObserver | undefined;
const composerTextByFileId = new Map<string, string>();
type FirstFrame = Readonly<{
  canvasBackground: string;
  gutterBackground: string;
  capturedAt: number;
  sequence: number;
}>;

let firstFrame: FirstFrame | undefined;
let fileReadyAt: number | undefined;
let fileReadySequence: number | undefined;
let lifecycleSequence = 0;

function captureFirstFrame(): boolean {
  if (firstFrame !== undefined) {
    return true;
  }
  const canvas = host.value?.querySelector<HTMLElement>('.monaco-editor-background');
  const gutter = host.value?.querySelector<HTMLElement>('.monaco-editor .margin');
  if (canvas === undefined || canvas === null || gutter === undefined || gutter === null) {
    return false;
  }
  firstFrame = {
    canvasBackground: getComputedStyle(canvas).backgroundColor,
    gutterBackground: getComputedStyle(gutter).backgroundColor,
    capturedAt: performance.now(),
    sequence: ++lifecycleSequence,
  };
  firstFrameObserver?.disconnect();
  return true;
}

function beginFirstFrameCapture(): void {
  if (host.value === undefined) {
    return;
  }
  firstFrameObserver = new MutationObserver(() => {
    captureFirstFrame();
  });
  firstFrameObserver.observe(host.value, { childList: true, subtree: true });
}

function markFileReady(): void {
  if (fileReadyAt !== undefined) {
    return;
  }
  fileReadyAt = performance.now();
  fileReadySequence = ++lifecycleSequence;
}


function unmountComposer(): void {
  if (zoneRoot !== undefined) {
    render(null, zoneRoot);
    zoneRoot = undefined;
  }
}

function renderComposer(): void {
  const zone = host.value?.querySelector<HTMLElement>('.monaco-anchor-zone--composer');
  const anchor = adapter?.getActiveAnchor();
  if (zone === undefined || zone === null || anchor === undefined || anchor.fileId !== currentFile.value.id) {
    unmountComposer();
    return;
  }

  if (zoneRoot !== zone) {
    unmountComposer();
    zoneRoot = zone;
  }

  render(h(CommentComposer, {
    path: currentFile.value.head.path,
    side: anchor.side,
    line: anchor.line,
    text: composerTextByFileId.get(anchor.fileId) ?? '',
    status: 'ready',
    onCancel: () => adapter?.clearAnchor(),
    onUpdateText: (text: string) => {
      composerTextByFileId.set(anchor.fileId, text);
      renderComposer();
    },
  }), zone);
  void nextTick(() => {
    if (zoneRoot !== zone) {
      return;
    }
    const contentHeight = zone.firstElementChild?.scrollHeight ?? zone.scrollHeight;
    adapter?.setAnchorZoneHeight(Math.max(280, contentHeight + 16));
  });
}


function publishContract(): void {
  const diagnostics = adapter?.getDiagnostics();
  Object.assign(window, {
    __monacoStabilityPrototype: {
      rendered: rendered.value,
      language: languageForPath(currentFile.value.head.path),
      fileId: currentFile.value.id,
      diffUpdates: diagnostics?.diffUpdates ?? 0,
      liveModels: diagnostics?.liveModels ?? 0,
      listenerCount: diagnostics?.listenerCount ?? 0,
      pairedZones: diagnostics?.pairedZoneCount ?? 0,
      activeComposers: diagnostics?.activeComposerCount ?? 0,
      contextMode: diagnostics?.contextMode ?? 'collapsed',
      firstFrame,
      fileReadyAt,
      fileReadySequence,
    },
  });
}

async function selectFile(index: number): Promise<void> {
  currentFileIndex.value = index;
  await adapter?.setFile(currentFile.value);
  markFileReady();
  rendered.value = true;
  updateVersion.value += 1;
  publishContract();
}

function addComment(side: 'base' | 'head'): void {
  adapter?.activateAnchor(side, side === 'base' ? 10 : 16);
  updateVersion.value += 1;
  publishContract();
}

function showHiddenComment(): void {
  adapter?.revealAnchor({
    fileId: currentFile.value.id,
    side: 'head',
    line: 5,
  });
  updateVersion.value += 1;
  publishContract();
}

function navigateChange(direction: 'next' | 'previous'): void {
  adapter?.goToChange(direction);
}

async function stressRecompute(): Promise<void> {
  const initialIndex = currentFileIndex.value;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await selectFile((initialIndex + iteration + 1) % FILES.length);
  }
  await selectFile(initialIndex);
}

onMounted(async () => {
  if (host.value === undefined) {
    return;
  }
  configureMonacoWorkers();
  beginFirstFrameCapture();
  adapter = createMonacoDiffAdapter(
    host.value,
    languageForPath,
    () => {
      markFileReady();
      rendered.value = true;
      renderComposer();
      updateVersion.value += 1;
      publishContract();
    },
    {
      nextChange: () => navigateChange('next'),
      previousChange: () => navigateChange('previous'),
      nextFile: () => {},
      previousFile: () => {},
    },
  );
  adapter.layout();
  resizeObserver = new ResizeObserver(() => adapter?.layout());
  resizeObserver.observe(host.value);
  const initialFile = selectFile(0);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (!captureFirstFrame()) {
    throw new Error('Monaco first frame did not create canvas and gutter surfaces');
  }
  publishContract();
  await initialFile;
});

onBeforeUnmount(() => {
  unmountComposer();
  firstFrameObserver?.disconnect();
  resizeObserver?.disconnect();
  adapter?.dispose();
  adapter = undefined;
});
</script>

<template>
  <main class="prototype" aria-label="Monaco stability prototype">
    <header>
      <h1>Monaco stability prototype</h1>
      <p data-testid="monaco-render-status" role="status">
        {{ rendered ? 'Rendered real Monaco' : 'Computing real Monaco diff…' }}
      </p>
      <p data-testid="monaco-metrics" :data-version="updateVersion">
        {{ currentFile.id }} · {{ languageForPath(currentFile.head.path) }}
      </p>
      <nav aria-label="Prototype navigation">
        <button type="button" :disabled="currentFileIndex === 0" @click="selectFile(currentFileIndex - 1)">Previous file</button>
        <button type="button" :disabled="currentFileIndex === FILES.length - 1" @click="selectFile(currentFileIndex + 1)">Next file</button>
        <button type="button" title="Previous change · Shift+F7" @click="navigateChange('previous')">Previous change</button>
        <button type="button" title="Next change · F7" @click="navigateChange('next')">Next change</button>
        <button type="button" @click="addComment('base')">Add base comment</button>
        <button type="button" @click="addComment('head')">Add head comment</button>
        <button type="button" @click="showHiddenComment">Show hidden comment</button>
        <button type="button" @click="stressRecompute">Recompute 10 times</button>
      </nav>
    </header>
    <div ref="host" class="monaco-host" data-testid="monaco-host" />
  </main>
</template>

<style scoped>
.prototype {
  background: var(--surface-canvas);
  color: var(--text-primary);
  font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
  min-height: 100dvh;
  padding: 16px;
}

h1 { font-size: 18px; margin: 0; }
p { margin: 4px 0; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
button { min-height: 32px; }
.monaco-host { border: 1px solid var(--border-default); height: calc(100dvh - 164px); min-height: 500px; }
</style>
