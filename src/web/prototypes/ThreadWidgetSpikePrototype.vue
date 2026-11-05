<script setup lang="ts">
// THROWAWAY SPIKE HARNESS — Plan 23-01 go/no-go decision only.
// Proves (or disproves) whether interactive thread chrome layered over Monaco view
// zones via content widgets or overlay widgets receives pointer/keyboard input
// reliably at N>1 threads, across side-by-side, inline, and single-pane modes, and
// survives scrolling + hideUnchangedRegions collapse/expand. Deleted once Plan 23-01's
// decision checkpoint is recorded (see 23-01-PLAN.md threat model T-23-01-01).
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import '../styles.css';

import * as monaco from 'monaco-editor';
import { TOKEN_ROOT_CSS } from 'virtual:loopnote-tokens';

import { counterpartBoundary, type DiffSide } from '../monaco/line-mapping';
import { configureMonacoWorkers, languageForPath } from '../monaco/configure';
import { applyLoopnoteTheme } from '../monaco/theme';
import { parseTokenRoot, resolveToken } from '../theme/token-contract';

// Parity with diff-adapter.ts:77-101 so measured geometry matches production rendering.
const HIDE_UNCHANGED_REGIONS = {
  enabled: true,
  contextLineCount: 3,
  minimumLineCount: 8,
  revealLineCount: 10,
} as const;

const TOKENS = parseTokenRoot(TOKEN_ROOT_CSS);
const CODE_FONT_FAMILY = resolveToken(TOKENS, '--font-mono');
const CODE_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-code'), 10);
const CODE_LINE_HEIGHT = Number.parseInt(resolveToken(TOKENS, '--line-height-code'), 10);

type WidgetVariant = 'content' | 'overlay';
type SpikeMode = 'side-by-side' | 'inline' | 'single-pane';
type ContextMode = 'collapsed' | 'all-revealed';

type ThreadDef = Readonly<{
  id: string;
  label: string;
  anchorSide: DiffSide;
  anchorLine: number;
}>;

type FixtureSet = Readonly<{
  baseText: string;
  headText: string;
  threads: readonly ThreadDef[];
}>;

type ThreadWidgetHost = {
  def: ThreadDef;
  anchorEditor: monaco.editor.IStandaloneCodeEditor;
  widgetDomNode: HTMLElement;
  textarea: HTMLTextAreaElement;
  overlayTop: number;
  heightPx: number;
  contentWidget: monaco.editor.IContentWidget | undefined;
  overlayWidget: monaco.editor.IOverlayWidget | undefined;
};

type DiffActiveThread = ThreadWidgetHost & {
  counterpartEditor: monaco.editor.IStandaloneCodeEditor;
  anchorZone: monaco.editor.IViewZone;
  spacerZone: monaco.editor.IViewZone;
  anchorZoneId: string;
  spacerZoneId: string;
};

type SinglePaneActiveThread = ThreadWidgetHost & {
  zone: monaco.editor.IViewZone;
  zoneId: string;
};

// Generates a fixture long enough to scroll, with stable blocks long enough that
// hideUnchangedRegions (minimumLineCount: 8) folds at least one of them.
function buildFixtureLines(totalStableLines: number, hunkInsertAt: readonly number[]): { base: string; head: string } {
  const baseLines: string[] = ['export function threadSpikeFixture() {'];
  const headLines: string[] = ['export function threadSpikeFixture() {'];
  for (let i = 1; i <= totalStableLines; i += 1) {
    const line = `  const stable${String(i).padStart(4, '0')} = 'value ${i}';`;
    baseLines.push(line);
    headLines.push(line);
    if (hunkInsertAt.includes(i)) {
      headLines.push(`  const inserted${String(i).padStart(4, '0')} = 'head only ${i}';`);
    }
  }
  baseLines.push('  return true;', '}');
  headLines.push('  return true;', '}');
  return { base: `${baseLines.join('\n')}\n`, head: `${headLines.join('\n')}\n` };
}

// Default 3-thread fixture: three hunks (at stable-lines 5, 20, 85) carve out four
// stable blocks. Threads 1 and 3 anchor immediately adjacent to hunk 1 and hunk 3
// respectively — within HIDE_UNCHANGED_REGIONS' contextLineCount (3), so Monaco's own
// folding algorithm guarantees those lines stay visible regardless of block length.
// Thread 2 anchors in the middle of the 64-line block between hunk 2 and hunk 3 (far
// from any context window), so it reliably folds — the dedicated hidden-region
// collapse/expand subject (check 5). Head-side line numbers are offset by the count
// of hunk insertions at or before each stable index.
function buildDefaultFixture(): FixtureSet {
  const { base, head } = buildFixtureLines(90, [5, 20, 85]);
  const threads: readonly ThreadDef[] = [
    { id: 'thread-1', label: '1', anchorSide: 'head', anchorLine: 8 },
    { id: 'thread-2', label: '2', anchorSide: 'base', anchorLine: 51 },
    { id: 'thread-3', label: '3', anchorSide: 'head', anchorLine: 87 },
  ];
  return { baseText: base, headText: head, threads };
}

// 30-thread fixture for the input-lag measurement: threads spread every 12 lines
// across a 400-line file so thread 25 starts well below the initial fold.
function buildPerfFixture(): FixtureSet {
  const { base, head } = buildFixtureLines(400, [60, 160, 260, 360]);
  const threads: ThreadDef[] = [];
  for (let n = 1; n <= 30; n += 1) {
    threads.push({ id: `thread-${n}`, label: String(n), anchorSide: 'head', anchorLine: n * 12 + 1 });
  }
  return { baseText: base, headText: head, threads };
}

const defaultFixture = buildDefaultFixture();
const perfFixture = buildPerfFixture();

const host = { diff: ref<HTMLElement>(), single: ref<HTMLElement>() };
const diffHost = host.diff;
const singleHost = host.single;

const ready = ref(false);
const mode = ref<SpikeMode>('side-by-side');
const variant = ref<WidgetVariant>('content');
const threadCount = ref<3 | 30>(3);
const contextMode = ref<ContextMode>('collapsed');

let diffEditor: monaco.editor.IStandaloneDiffEditor | undefined;
let singlePaneEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let defaultBaseModel: monaco.editor.ITextModel | undefined;
let defaultHeadModel: monaco.editor.ITextModel | undefined;
let perfBaseModel: monaco.editor.ITextModel | undefined;
let perfHeadModel: monaco.editor.ITextModel | undefined;
let activeFixture: FixtureSet = defaultFixture;
let resizeObserver: ResizeObserver | undefined;

let activeDiffThreads: DiffActiveThread[] = [];
let activeSinglePaneThreads: SinglePaneActiveThread[] = [];
const clickCounts: Record<string, number> = {};

// Mirrors production's ⌥F9 cross-thread navigation (THREAD-07/09): scroll a thread's
// anchor line to the center of its editor before interacting with it, instead of
// relying on the raw initial scroll position. Both the diff editor and the
// single-pane editor stay mounted simultaneously (mode only toggles CSS visibility),
// each with a thread entry sharing the same id — so this must target whichever
// editor the current mode actually shows, not just the first list that matches.
function revealThread(threadId: string): void {
  if (mode.value === 'single-pane') {
    const singleThread = activeSinglePaneThreads.find((thread) => thread.def.id === threadId);
    singleThread?.anchorEditor.revealLineInCenter(singleThread.def.anchorLine);
    return;
  }
  const diffThread = activeDiffThreads.find((thread) => thread.def.id === threadId);
  diffThread?.anchorEditor.revealLineInCenter(diffThread.def.anchorLine);
}

function publishContract(): void {
  const diffThreads = activeDiffThreads.map((thread) => ({
    id: thread.def.id,
    label: thread.def.label,
    anchorSide: thread.def.anchorSide,
    anchorLine: thread.def.anchorLine,
    baseHeightPx: thread.def.anchorSide === 'base' ? thread.anchorZone.heightInPx : thread.spacerZone.heightInPx,
    headHeightPx: thread.def.anchorSide === 'head' ? thread.anchorZone.heightInPx : thread.spacerZone.heightInPx,
  }));
  const singleThreads = activeSinglePaneThreads.map((thread) => ({
    id: thread.def.id,
    label: thread.def.label,
    anchorLine: thread.def.anchorLine,
    heightPx: thread.zone.heightInPx,
  }));
  Object.assign(window, {
    __threadSpike: {
      ready: ready.value,
      mode: mode.value,
      variant: variant.value,
      threadCount: threadCount.value,
      contextMode: contextMode.value,
      clickCounts: { ...clickCounts },
      diffThreads,
      singleThreads,
      diffContentLeft: diffEditor?.getModifiedEditor().getLayoutInfo().contentLeft,
      singleContentLeft: singlePaneEditor?.getLayoutInfo().contentLeft,
      revealThread,
    },
  });
}

function createSpacerDomNode(def: ThreadDef, role: 'anchor' | 'spacer', side: DiffSide): HTMLElement {
  const node = document.createElement('div');
  node.className = `thread-spike-zone thread-spike-zone--${role}`;
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-thread-zone', def.id);
  node.setAttribute('data-zone-role', role);
  node.setAttribute('data-zone-side', side);
  return node;
}

function createWidgetDom(
  def: ThreadDef,
  handlers: Readonly<{ onGrow: (heightPx: number) => void; onEscape: () => void }>,
): { container: HTMLElement; textarea: HTMLTextAreaElement } {
  const container = document.createElement('div');
  container.className = 'thread-spike-widget';
  container.setAttribute('data-thread-id', def.id);
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `Thread ${def.label}`);

  const header = document.createElement('div');
  header.className = 'thread-spike-widget__header';
  header.textContent = `Thread ${def.label}`;
  container.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.className = 'thread-spike-widget__textarea';
  textarea.setAttribute('aria-label', `Thread ${def.label} body`);
  textarea.rows = 2;
  container.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'thread-spike-widget__actions';
  const resolveBtn = document.createElement('button');
  resolveBtn.type = 'button';
  resolveBtn.textContent = 'Resolve';
  resolveBtn.setAttribute('aria-label', `Resolve thread ${def.label}`);
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';
  deleteBtn.setAttribute('aria-label', `Delete thread ${def.label}`);
  actions.append(resolveBtn, deleteBtn);
  container.appendChild(actions);

  const bumpClick = (label: string): void => {
    clickCounts[label] = (clickCounts[label] ?? 0) + 1;
    publishContract();
  };
  resolveBtn.addEventListener('click', () => {
    resolveBtn.classList.toggle('is-active');
    bumpClick(`Resolve thread ${def.label}`);
  });
  deleteBtn.addEventListener('click', () => {
    container.classList.toggle('is-deleted');
    bumpClick(`Delete thread ${def.label}`);
  });

  const recomputeHeight = (): void => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    handlers.onGrow(Math.max(140, container.scrollHeight + 16));
  };
  textarea.addEventListener('input', recomputeHeight);

  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handlers.onEscape();
    }
  });

  return { container, textarea };
}

function escapeToEditor(host: ThreadWidgetHost): void {
  host.anchorEditor.focus();
  host.anchorEditor.setPosition({ lineNumber: host.def.anchorLine, column: 1 });
  host.anchorEditor.revealLineInCenterIfOutsideViewport(host.def.anchorLine);
}

function attachWidget(host: ThreadWidgetHost): void {
  if (variant.value === 'content') {
    const widget: monaco.editor.IContentWidget = {
      allowEditorOverflow: false,
      suppressMouseDown: false,
      getId: () => `content-${host.def.id}`,
      getDomNode: () => host.widgetDomNode,
      getPosition: () => ({
        position: { lineNumber: host.def.anchorLine, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };
    host.anchorEditor.addContentWidget(widget);
    host.contentWidget = widget;
  } else {
    const widget: monaco.editor.IOverlayWidget = {
      allowEditorOverflow: false,
      getId: () => `overlay-${host.def.id}`,
      getDomNode: () => host.widgetDomNode,
      getPosition: () => ({ preference: { top: host.overlayTop, left: host.anchorEditor.getLayoutInfo().contentLeft } }),
    };
    host.anchorEditor.addOverlayWidget(widget);
    host.overlayWidget = widget;
  }
}

function detachWidget(host: ThreadWidgetHost): void {
  if (host.contentWidget !== undefined) {
    host.anchorEditor.removeContentWidget(host.contentWidget);
    host.contentWidget = undefined;
  }
  if (host.overlayWidget !== undefined) {
    host.anchorEditor.removeOverlayWidget(host.overlayWidget);
    host.overlayWidget = undefined;
  }
}

function growDiffThreadZones(thread: DiffActiveThread, heightPx: number): void {
  if (thread.anchorZone.heightInPx === heightPx && thread.spacerZone.heightInPx === heightPx) {
    return;
  }
  // Mirrors diff-adapter.ts:692-700 growPairedZones — both layoutZone calls issued
  // back-to-back, synchronously, inside one changeViewZones pass per side.
  thread.anchorZone.heightInPx = heightPx;
  thread.spacerZone.heightInPx = heightPx;
  thread.anchorEditor.changeViewZones((accessor) => accessor.layoutZone(thread.anchorZoneId));
  thread.counterpartEditor.changeViewZones((accessor) => accessor.layoutZone(thread.spacerZoneId));
  if (thread.contentWidget !== undefined) {
    thread.anchorEditor.layoutContentWidget(thread.contentWidget);
  }
  if (thread.overlayWidget !== undefined) {
    thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
  }
  thread.heightPx = heightPx;
  publishContract();
}

function growSinglePaneThreadZones(thread: SinglePaneActiveThread, heightPx: number): void {
  if (thread.zone.heightInPx === heightPx) {
    return;
  }
  thread.zone.heightInPx = heightPx;
  thread.anchorEditor.changeViewZones((accessor) => accessor.layoutZone(thread.zoneId));
  if (thread.contentWidget !== undefined) {
    thread.anchorEditor.layoutContentWidget(thread.contentWidget);
  }
  if (thread.overlayWidget !== undefined) {
    thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
  }
  thread.heightPx = heightPx;
  publishContract();
}

function measureAndGrowDiffThread(thread: DiffActiveThread): void {
  growDiffThreadZones(thread, Math.max(140, thread.widgetDomNode.scrollHeight + 16));
}

function measureAndGrowSinglePaneThread(thread: SinglePaneActiveThread): void {
  growSinglePaneThreadZones(thread, Math.max(140, thread.widgetDomNode.scrollHeight + 16));
}

function createDiffThread(
  def: ThreadDef,
  anchorEditor: monaco.editor.IStandaloneCodeEditor,
  counterpartEditor: monaco.editor.IStandaloneCodeEditor,
  counterpartLine: number,
): DiffActiveThread {
  const threadRef: { current?: DiffActiveThread } = {};
  const { container, textarea } = createWidgetDom(def, {
    onGrow: (heightPx) => {
      if (threadRef.current !== undefined) {
        growDiffThreadZones(threadRef.current, heightPx);
      }
    },
    onEscape: () => {
      if (threadRef.current !== undefined) {
        escapeToEditor(threadRef.current);
      }
    },
  });

  const initialHeight = 140;
  const spacerSide: DiffSide = def.anchorSide === 'base' ? 'head' : 'base';
  const anchorZone: monaco.editor.IViewZone = {
    afterLineNumber: def.anchorLine,
    domNode: createSpacerDomNode(def, 'anchor', def.anchorSide),
    heightInPx: initialHeight,
    suppressMouseDown: true,
    // Threads can anchor inside what hideUnchangedRegions would otherwise fold
    // (CONTEXT.md: "expanded-by-default threads"); keep them rendered regardless.
    showInHiddenAreas: true,
  };
  const spacerZone: monaco.editor.IViewZone = {
    afterLineNumber: counterpartLine,
    domNode: createSpacerDomNode(def, 'spacer', spacerSide),
    heightInPx: initialHeight,
    suppressMouseDown: true,
    showInHiddenAreas: true,
  };

  let anchorZoneId = '';
  anchorEditor.changeViewZones((accessor) => {
    anchorZoneId = accessor.addZone(anchorZone);
  });
  let spacerZoneId = '';
  counterpartEditor.changeViewZones((accessor) => {
    spacerZoneId = accessor.addZone(spacerZone);
  });

  const thread: DiffActiveThread = {
    def,
    anchorEditor,
    counterpartEditor,
    anchorZone,
    spacerZone,
    anchorZoneId,
    spacerZoneId,
    widgetDomNode: container,
    textarea,
    overlayTop: 0,
    heightPx: initialHeight,
    contentWidget: undefined,
    overlayWidget: undefined,
  };
  threadRef.current = thread;

  anchorZone.onDomNodeTop = (top) => {
    thread.overlayTop = top;
    if (thread.overlayWidget !== undefined) {
      thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
    }
  };

  attachWidget(thread);
  requestAnimationFrame(() => measureAndGrowDiffThread(thread));

  return thread;
}

function createSinglePaneThread(def: ThreadDef): SinglePaneActiveThread {
  if (singlePaneEditor === undefined) {
    throw new Error('Thread spike: single-pane editor is not ready');
  }
  const editor = singlePaneEditor;
  const threadRef: { current?: SinglePaneActiveThread } = {};
  const { container, textarea } = createWidgetDom(def, {
    onGrow: (heightPx) => {
      if (threadRef.current !== undefined) {
        growSinglePaneThreadZones(threadRef.current, heightPx);
      }
    },
    onEscape: () => {
      if (threadRef.current !== undefined) {
        escapeToEditor(threadRef.current);
      }
    },
  });

  const initialHeight = 140;
  const zone: monaco.editor.IViewZone = {
    afterLineNumber: def.anchorLine,
    domNode: createSpacerDomNode(def, 'anchor', 'head'),
    heightInPx: initialHeight,
    suppressMouseDown: true,
    showInHiddenAreas: true,
  };
  let zoneId = '';
  editor.changeViewZones((accessor) => {
    zoneId = accessor.addZone(zone);
  });

  const thread: SinglePaneActiveThread = {
    def,
    anchorEditor: editor,
    widgetDomNode: container,
    textarea,
    overlayTop: 0,
    heightPx: initialHeight,
    contentWidget: undefined,
    overlayWidget: undefined,
    zone,
    zoneId,
  };
  threadRef.current = thread;

  zone.onDomNodeTop = (top) => {
    thread.overlayTop = top;
    if (thread.overlayWidget !== undefined) {
      thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
    }
  };

  attachWidget(thread);
  requestAnimationFrame(() => measureAndGrowSinglePaneThread(thread));

  return thread;
}

function teardownDiffThreads(): void {
  for (const thread of activeDiffThreads) {
    thread.anchorEditor.changeViewZones((accessor) => accessor.removeZone(thread.anchorZoneId));
    thread.counterpartEditor.changeViewZones((accessor) => accessor.removeZone(thread.spacerZoneId));
    detachWidget(thread);
  }
  activeDiffThreads = [];
}

function teardownSinglePaneThreads(): void {
  for (const thread of activeSinglePaneThreads) {
    thread.anchorEditor.changeViewZones((accessor) => accessor.removeZone(thread.zoneId));
    detachWidget(thread);
  }
  activeSinglePaneThreads = [];
}

function rebuildDiffThreads(): void {
  teardownDiffThreads();
  if (diffEditor === undefined) {
    return;
  }
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  const lineChanges = diffEditor.getLineChanges();
  for (const def of activeFixture.threads) {
    const anchorEditor = def.anchorSide === 'base' ? originalEditor : modifiedEditor;
    const counterpartEditor = def.anchorSide === 'base' ? modifiedEditor : originalEditor;
    const counterpartLineCount = counterpartEditor.getModel()?.getLineCount() ?? 0;
    const counterpartLine = counterpartBoundary(lineChanges, def.anchorSide, def.anchorLine, counterpartLineCount);
    activeDiffThreads.push(createDiffThread(def, anchorEditor, counterpartEditor, counterpartLine));
  }
  publishContract();
}

function rebuildSinglePaneThreads(): void {
  teardownSinglePaneThreads();
  if (singlePaneEditor === undefined) {
    return;
  }
  for (const def of activeFixture.threads) {
    activeSinglePaneThreads.push(createSinglePaneThread(def));
  }
  publishContract();
}

function relayoutDiffThreads(): void {
  for (const thread of activeDiffThreads) {
    thread.anchorEditor.changeViewZones((accessor) => accessor.layoutZone(thread.anchorZoneId));
    thread.counterpartEditor.changeViewZones((accessor) => accessor.layoutZone(thread.spacerZoneId));
    if (thread.contentWidget !== undefined) {
      thread.anchorEditor.layoutContentWidget(thread.contentWidget);
    }
    if (thread.overlayWidget !== undefined) {
      thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
    }
  }
}

function relayoutSinglePaneThreads(): void {
  for (const thread of activeSinglePaneThreads) {
    thread.anchorEditor.changeViewZones((accessor) => accessor.layoutZone(thread.zoneId));
    if (thread.contentWidget !== undefined) {
      thread.anchorEditor.layoutContentWidget(thread.contentWidget);
    }
    if (thread.overlayWidget !== undefined) {
      thread.anchorEditor.layoutOverlayWidget(thread.overlayWidget);
    }
  }
}

async function setMode(next: SpikeMode): Promise<void> {
  mode.value = next;
  if (next !== 'single-pane') {
    diffEditor?.updateOptions({ renderSideBySide: next === 'side-by-side' });
  }
  await nextTick();
  diffEditor?.layout();
  singlePaneEditor?.layout();
  requestAnimationFrame(() => {
    relayoutDiffThreads();
    relayoutSinglePaneThreads();
    publishContract();
  });
}

function setVariant(next: WidgetVariant): void {
  variant.value = next;
  rebuildDiffThreads();
  rebuildSinglePaneThreads();
}

function setThreadCount(next: 3 | 30): void {
  threadCount.value = next;
  activeFixture = next === 3 ? defaultFixture : perfFixture;
  const baseModel = next === 3 ? defaultBaseModel : perfBaseModel;
  const headModel = next === 3 ? defaultHeadModel : perfHeadModel;
  if (diffEditor !== undefined && baseModel !== undefined && headModel !== undefined) {
    diffEditor.setModel({ original: baseModel, modified: headModel });
  }
  if (singlePaneEditor !== undefined && headModel !== undefined) {
    singlePaneEditor.setModel(headModel);
  }
  rebuildSinglePaneThreads();
}

function setContextMode(next: ContextMode): void {
  contextMode.value = next;
  diffEditor?.updateOptions({
    hideUnchangedRegions: next === 'collapsed' ? HIDE_UNCHANGED_REGIONS : { enabled: false },
  });
  requestAnimationFrame(() => {
    relayoutDiffThreads();
    publishContract();
  });
}

onMounted(async () => {
  if (diffHost.value === undefined || singleHost.value === undefined) {
    return;
  }
  configureMonacoWorkers();
  applyLoopnoteTheme();

  defaultBaseModel = monaco.editor.createModel(defaultFixture.baseText, languageForPath('thread-spike.ts'));
  defaultHeadModel = monaco.editor.createModel(defaultFixture.headText, languageForPath('thread-spike.ts'));
  perfBaseModel = monaco.editor.createModel(perfFixture.baseText, languageForPath('thread-spike.ts'));
  perfHeadModel = monaco.editor.createModel(perfFixture.headText, languageForPath('thread-spike.ts'));

  diffEditor = monaco.editor.createDiffEditor(diffHost.value, {
    ariaLabel: 'Thread widget spike side-by-side diff',
    automaticLayout: false,
    diffAlgorithm: 'advanced',
    diffWordWrap: 'off',
    fontFamily: CODE_FONT_FAMILY,
    fontSize: CODE_FONT_SIZE,
    lineHeight: CODE_LINE_HEIGHT,
    glyphMargin: true,
    minimap: { enabled: false },
    occurrencesHighlight: 'off',
    originalEditable: false,
    readOnly: true,
    renderSideBySide: true,
    renderSideBySideInlineBreakpoint: 0,
    useInlineViewWhenSpaceIsLimited: false,
    hideUnchangedRegions: HIDE_UNCHANGED_REGIONS,
    renderIndicators: false,
    renderGutterMenu: false,
    renderMarginRevertIcon: false,
  });
  diffEditor.setModel({ original: defaultBaseModel, modified: defaultHeadModel });
  diffEditor.onDidUpdateDiff(() => {
    ready.value = true;
    rebuildDiffThreads();
  });

  singlePaneEditor = monaco.editor.create(singleHost.value, {
    ariaLabel: 'Thread widget spike single-pane',
    automaticLayout: false,
    fontFamily: CODE_FONT_FAMILY,
    fontSize: CODE_FONT_SIZE,
    lineHeight: CODE_LINE_HEIGHT,
    glyphMargin: true,
    minimap: { enabled: false },
    occurrencesHighlight: 'off',
    readOnly: true,
    lineNumbers: 'on',
  });
  singlePaneEditor.setModel(defaultHeadModel);
  rebuildSinglePaneThreads();

  diffEditor.layout();
  singlePaneEditor.layout();
  resizeObserver = new ResizeObserver(() => {
    diffEditor?.layout();
    singlePaneEditor?.layout();
  });
  resizeObserver.observe(diffHost.value);
  resizeObserver.observe(singleHost.value);

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  publishContract();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  teardownDiffThreads();
  teardownSinglePaneThreads();
  diffEditor?.dispose();
  singlePaneEditor?.dispose();
  defaultBaseModel?.dispose();
  defaultHeadModel?.dispose();
  perfBaseModel?.dispose();
  perfHeadModel?.dispose();
  diffEditor = undefined;
  singlePaneEditor = undefined;
});
</script>

<template>
  <main class="thread-spike" aria-label="Thread widget spike prototype">
    <header>
      <h1>Thread widget spike prototype (throwaway — Plan 23-01)</h1>
      <p data-testid="thread-spike-render-status" role="status">
        {{ ready ? 'Rendered real Monaco' : 'Computing real Monaco diff…' }}
      </p>
      <p
        data-testid="thread-spike-state"
        :data-mode="mode"
        :data-variant="variant"
        :data-thread-count="threadCount"
        :data-context-mode="contextMode"
      >
        mode={{ mode }} · variant={{ variant }} · threads={{ threadCount }} · context={{ contextMode }}
      </p>
      <nav aria-label="Thread spike controls">
        <button type="button" :aria-pressed="mode === 'side-by-side'" @click="setMode('side-by-side')">Mode: Side-by-side</button>
        <button type="button" :aria-pressed="mode === 'inline'" @click="setMode('inline')">Mode: Inline</button>
        <button type="button" :aria-pressed="mode === 'single-pane'" @click="setMode('single-pane')">Mode: Single-pane</button>
        <button type="button" :aria-pressed="variant === 'content'" @click="setVariant('content')">Variant: Content widget</button>
        <button type="button" :aria-pressed="variant === 'overlay'" @click="setVariant('overlay')">Variant: Overlay widget</button>
        <button type="button" :aria-pressed="threadCount === 3" @click="setThreadCount(3)">Threads: 3</button>
        <button type="button" :aria-pressed="threadCount === 30" @click="setThreadCount(30)">Threads: 30</button>
        <button type="button" :aria-pressed="contextMode === 'collapsed'" @click="setContextMode('collapsed')">Context: Collapsed</button>
        <button type="button" :aria-pressed="contextMode === 'all-revealed'" @click="setContextMode('all-revealed')">Context: All revealed</button>
      </nav>
    </header>
    <div v-show="mode !== 'single-pane'" ref="diffHost" class="thread-spike-host" data-testid="thread-spike-diff-host" />
    <div v-show="mode === 'single-pane'" ref="singleHost" class="thread-spike-host" data-testid="thread-spike-single-host" />
  </main>
</template>

<style scoped>
.thread-spike {
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
.thread-spike-host { border: 1px solid var(--border-default); height: calc(100dvh - 220px); min-height: 480px; }
</style>

<style>
/* Unscoped: these nodes are mounted imperatively into Monaco's own DOM layers,
   outside this component's scoped-style boundary. */
.thread-spike-zone {
  width: 100%;
}

.thread-spike-widget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 420px;
  max-width: 90vw;
  padding: 8px 10px;
  border: 1px solid var(--border-default, #3a3a3a);
  border-radius: 6px;
  background: var(--surface-panel, #1e1e1e);
  color: var(--text-primary, #e0e0e0);
  box-sizing: border-box;
  pointer-events: auto;
}

.thread-spike-widget.is-deleted {
  opacity: 0.4;
}

.thread-spike-widget__header {
  font-size: 12px;
  font-weight: 600;
}

.thread-spike-widget__textarea {
  width: 100%;
  min-height: 40px;
  resize: none;
  box-sizing: border-box;
  font: inherit;
}

.thread-spike-widget__actions {
  display: flex;
  gap: 8px;
}

.thread-spike-widget__actions button.is-active {
  font-weight: 700;
}
</style>
