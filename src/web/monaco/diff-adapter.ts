import * as monaco from 'monaco-editor';

import { TOKEN_ROOT_CSS } from 'virtual:loopnote-tokens';

import { counterpartBoundary, type DiffSide } from './line-mapping';
import { buildDiffDecorations } from './diff-semantics';
import { applyLoopnoteTheme } from './theme';
import { RENAME_MAP } from '../../domain/product-identity.js';
import { parseTokenRoot, resolveToken } from '../theme/token-contract';
import type { WorkspaceCommand } from '../model/workspace-command.js';

export type { DiffSide } from './line-mapping';

export type ImmutableDiffFile = Readonly<{
  id: string;
  base: Readonly<{ path: string; text: string }>;
  head: Readonly<{ path: string; text: string }>;
}>;

export type Anchor = Readonly<{
  fileId: string;
  side: DiffSide;
  line: number;
  endLine?: number;
}>;

export type AnchorAffordanceTarget = Readonly<{
  side: DiffSide;
  line: number;
  top: number;
}>;

type ActiveComposer = Anchor & { text: string };
type SavedFileState = {
  viewState: monaco.editor.IDiffEditorViewState | null;
  focused: { side: DiffSide; line: number } | undefined;
  composer: ActiveComposer | undefined;
  contextMode: 'collapsed' | 'all-revealed';
};

export type AdapterDiagnostics = Readonly<{
  diffUpdates: number;
  liveModels: number;
  listenerCount: number;
  pairedZoneCount: number;
  activeComposerCount: number;
  contextMode: 'collapsed' | 'all-revealed';
}>;

export type AdapterNavigation = Readonly<{
  nextChange: () => void;
  previousChange: () => void;
  nextFile: () => void;
  previousFile: () => void;
  nextThread: () => void;
  previousThread: () => void;
}>;

export type MonacoDiffAdapter = Readonly<{
  activateAnchor: (side: DiffSide, line: number, endLine?: number) => void;
  clearAnchor: () => void;
  createThread: (commentId: string, anchor: Anchor) => HTMLElement;
  dispose: () => void;
  focusAnchor: (side: DiffSide, line: number) => void;
  getActiveAnchor: () => Anchor | undefined;
  getAnchorAffordance: () => AnchorAffordanceTarget | undefined;
  getLineChanges: () => readonly monaco.editor.ILineChange[];
  getAnchorAffordanceAt: (side: DiffSide, line: number) => AnchorAffordanceTarget | undefined;
  getDiagnostics: () => AdapterDiagnostics;
  goToChange: (direction: 'next' | 'previous') => void;
  growThread: (commentId: string, heightInPx: number) => void;
  layout: (forceDimensions?: Readonly<{ width: number; height: number }>) => void;
  removeThread: (commentId: string) => void;
  revealAnchor: (anchor: Anchor) => void;
  setAnchorZoneHeight: (heightInPx: number) => void;
  setActiveAnchor: (anchor: Anchor | undefined) => void;
  setSideNames: (names: { readonly original: string; readonly modified: string }) => void;
  setCodeDensity: (density: 'wide' | 'default' | 'compact') => void;
  setRenderSideBySide: (renderSideBySide: boolean) => void;
  setFile: (file: ImmutableDiffFile) => Promise<void>;
}>;

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
const BODY_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-body'), 10);
const METADATA_FONT_SIZE = Number.parseInt(resolveToken(TOKENS, '--font-size-metadata'), 10);

const CODE_DENSITIES = {
  wide: {
    fontSize: BODY_FONT_SIZE,
    lineHeight: BODY_FONT_SIZE * 2,
  },
  default: { fontSize: CODE_FONT_SIZE, lineHeight: CODE_LINE_HEIGHT },
  compact: {
    fontSize: METADATA_FONT_SIZE,
    lineHeight: METADATA_FONT_SIZE * 2,
  },
} as const;


class PublicMonacoDiffAdapter {
  private readonly diffEditor: monaco.editor.IStandaloneDiffEditor;
  private readonly originalEditor: monaco.editor.IStandaloneCodeEditor;
  private readonly modifiedEditor: monaco.editor.IStandaloneCodeEditor;
  private readonly stateByFileId = new Map<string, SavedFileState>();
  private readonly staticDisposables: monaco.IDisposable[] = [];
  private originalModel: monaco.editor.ITextModel | undefined;
  private modifiedModel: monaco.editor.ITextModel | undefined;
  private originalDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
  private modifiedDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
  private readonly originalDiffDecorations: monaco.editor.IEditorDecorationsCollection;
  private readonly modifiedDiffDecorations: monaco.editor.IEditorDecorationsCollection;
  private readonly originalSelectionDecorations: monaco.editor.IEditorDecorationsCollection;
  private readonly modifiedSelectionDecorations: monaco.editor.IEditorDecorationsCollection;
  private readonly originalGutterDecorations: monaco.editor.IEditorDecorationsCollection;
  private readonly modifiedGutterDecorations: monaco.editor.IEditorDecorationsCollection;
  private currentFile: ImmutableDiffFile | undefined;
  private activeComposer: ActiveComposer | undefined;
  private focused: { side: DiffSide; line: number } | undefined;
  private anchorAffordance: AnchorAffordanceTarget | undefined;
  private contextMode: 'collapsed' | 'all-revealed' = 'collapsed';
  private originalZone: { id: string; zone: monaco.editor.IViewZone } | undefined;
  private modifiedZone: { id: string; zone: monaco.editor.IViewZone } | undefined;
  private readonly threadZones = new Map<string, {
    originalZoneId: string;
    originalZone: monaco.editor.IViewZone;
    modifiedZoneId: string;
    modifiedZone: monaco.editor.IViewZone;
    anchorEditor: monaco.editor.IStandaloneCodeEditor;
    widget: monaco.editor.IOverlayWidget;
    widgetTop: number;
  }>();
  private diffUpdates = 0;
  private disposed = false;
  private pendingSetFileReady: (() => void) | undefined;

  constructor(
    private readonly host: HTMLElement,
    private readonly languageForPath: (path: string) => string,
    private readonly onChange: () => void,
    private readonly navigate: AdapterNavigation,
  ) {
    applyLoopnoteTheme();
    this.diffEditor = monaco.editor.createDiffEditor(host, {
      ariaLabel: 'Immutable base and head side-by-side diff',
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
    this.originalEditor = this.diffEditor.getOriginalEditor();
    this.modifiedEditor = this.diffEditor.getModifiedEditor();
    this.originalDiffDecorations = this.originalEditor.createDecorationsCollection();
    this.modifiedDiffDecorations = this.modifiedEditor.createDecorationsCollection();
    this.originalSelectionDecorations = this.originalEditor.createDecorationsCollection();
    this.modifiedSelectionDecorations = this.modifiedEditor.createDecorationsCollection();
    this.originalGutterDecorations = this.originalEditor.createDecorationsCollection();
    this.modifiedGutterDecorations = this.modifiedEditor.createDecorationsCollection();
    this.originalEditor.getContainerDomNode().classList.add('monaco-diff-pane--base');
    this.modifiedEditor.getContainerDomNode().classList.add('monaco-diff-pane--head');
    this.staticDisposables.push(
      this.diffEditor.onDidUpdateDiff(() => {
        this.diffUpdates += 1;
        this.refreshDiffDecorations();
        this.rebuildAnchoredLayout();
        this.refreshAnchorAffordance();
        this.onChange();
      }),
      this.originalEditor.onDidFocusEditorText(() => this.captureFocusedSide('base')),
      this.modifiedEditor.onDidFocusEditorText(() => this.captureFocusedSide('head')),
      this.originalEditor.onDidChangeCursorPosition((event) => this.captureCursor('base', event.position.lineNumber)),
      this.modifiedEditor.onDidChangeCursorPosition((event) => this.captureCursor('head', event.position.lineNumber)),
      this.originalEditor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
      this.modifiedEditor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
      this.originalEditor.onDidChangeModel(() => this.refreshSelectionDecorations()),
      this.modifiedEditor.onDidChangeModel(() => this.refreshSelectionDecorations()),
      this.originalEditor.onMouseMove((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
      this.modifiedEditor.onMouseMove((event) => this.captureAffordance('head', event.target.position?.lineNumber)),
      this.originalEditor.onMouseDown((event) => this.captureAffordance('base', event.target.position?.lineNumber)),
      this.modifiedEditor.onMouseDown((event) => this.captureAffordance('head', event.target.position?.lineNumber)),
      this.originalEditor.onDidScrollChange(() => this.refreshAnchorAffordance()),
      this.modifiedEditor.onDidScrollChange(() => this.refreshAnchorAffordance()),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.add-base-comment`,
        label: 'Add comment to base line',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
        run: () => this.activateFocusedAnchor('base'),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.add-head-comment`,
        label: 'Add comment to head line',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
        run: () => this.activateFocusedAnchor('head'),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-change-base`,
        label: 'Next change',
        keybindings: [monaco.KeyCode.F7],
        run: () => this.navigate.nextChange(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-change-head`,
        label: 'Next change',
        keybindings: [monaco.KeyCode.F7],
        run: () => this.navigate.nextChange(),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-change-base`,
        label: 'Previous change',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F7],
        run: () => this.navigate.previousChange(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-change-head`,
        label: 'Previous change',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F7],
        run: () => this.navigate.previousChange(),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-file-base`,
        label: 'Next file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
        run: () => this.navigate.nextFile(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-file-head`,
        label: 'Next file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
        run: () => this.navigate.nextFile(),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-file-base`,
        label: 'Previous file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
        run: () => this.navigate.previousFile(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-file-head`,
        label: 'Previous file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
        run: () => this.navigate.previousFile(),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-thread-base`,
        label: 'Previous thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F9],
        run: () => this.navigate.previousThread(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-thread-head`,
        label: 'Previous thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F9],
        run: () => this.navigate.previousThread(),
      }),
      this.originalEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-thread-base`,
        label: 'Next thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9],
        run: () => this.navigate.nextThread(),
      }),
      this.modifiedEditor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-thread-head`,
        label: 'Next thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9],
        run: () => this.navigate.nextThread(),
      }),
    );
  }

  setCodeDensity(density: 'wide' | 'default' | 'compact'): void {
    this.diffEditor.updateOptions(CODE_DENSITIES[density]);
  }

  setSideNames({ original, modified }: { readonly original: string; readonly modified: string }): void {
    const ariaLabel = `Immutable ${original} and ${modified} side-by-side diff`;
    this.originalEditor.updateOptions({ ariaLabel });
    this.modifiedEditor.updateOptions({ ariaLabel });
  }

  setRenderSideBySide(renderSideBySide: boolean): void {
    this.diffEditor.updateOptions({ renderSideBySide });
  }

  async setFile(file: ImmutableDiffFile): Promise<void> {
    this.saveOutgoingState();
    this.removeZones();
    this.disposeModels();
    this.currentFile = file;
    const saved = this.stateByFileId.get(file.id);
    this.contextMode = saved?.contextMode ?? 'collapsed';
    this.diffEditor.updateOptions({
      hideUnchangedRegions: this.contextMode === 'collapsed'
        ? HIDE_UNCHANGED_REGIONS
        : { enabled: false },
    });
    this.originalModel = monaco.editor.createModel(
      file.base.text,
      this.languageForPath(file.base.path),
      monaco.Uri.parse(`inmemory://${RENAME_MAP.slug}/${encodeURIComponent(file.id)}/base/${file.base.path.split('/').map(encodeURIComponent).join('/')}`),
    );
    this.modifiedModel = monaco.editor.createModel(
      file.head.text,
      this.languageForPath(file.head.path),
      monaco.Uri.parse(`inmemory://${RENAME_MAP.slug}/${encodeURIComponent(file.id)}/head/${file.head.path.split('/').map(encodeURIComponent).join('/')}`),
    );
    const { promise: ready, resolve: resolveReady } = Promise.withResolvers<void>();
    const diffUpdateDisposable = this.diffEditor.onDidUpdateDiff(() => {
      diffUpdateDisposable.dispose();
      this.pendingSetFileReady = undefined;
      resolveReady();
    });
    this.pendingSetFileReady = () => {
      diffUpdateDisposable.dispose();
      resolveReady();
    };
    this.diffEditor.setModel({ original: this.originalModel, modified: this.modifiedModel });
    await ready;
    if (this.disposed) {
      return;
    }
    this.diffEditor.restoreViewState(saved?.viewState ?? null);
    this.refreshSelectionDecorations();
    const inFlightComposer = this.activeComposer?.fileId === file.id
      ? this.activeComposer
      : undefined;
    const activeComposer = inFlightComposer ?? saved?.composer;
    this.focused = inFlightComposer === undefined
      ? saved?.focused
      : { side: inFlightComposer.side, line: inFlightComposer.line };
    this.activeComposer = activeComposer;
    this.rebuildAnchoredLayout();
    if (this.focused !== undefined) {
      this.editorFor(this.focused.side).setPosition({ lineNumber: this.focused.line, column: 1 });
      this.editorFor(this.focused.side).revealLineInCenter(this.focused.line);
      this.editorFor(this.focused.side).focus();
    }
    this.layout();
    this.onChange();
  }

  activateAnchor(side: DiffSide, line: number, endLine?: number): void {
    if (this.currentFile === undefined || !this.isValidLine(side, line)) {
      return;
    }
    this.focused = { side, line };
    this.activeComposer = {
      fileId: this.currentFile.id,
      side,
      line,
      endLine,
      text: this.activeComposer?.fileId === this.currentFile.id
        && this.activeComposer.side === side
        && this.activeComposer.line === line
        && this.activeComposer.endLine === endLine
        ? this.activeComposer.text
        : '',
    };
    this.editorFor(side).setPosition({ lineNumber: line, column: 1 });
    this.editorFor(side).revealLineInCenter(line);
    this.editorFor(side).focus();
    this.captureAffordance(side, line);
    this.rebuildAnchoredLayout();
    this.onChange();
  }
  clearAnchor(): void {
    this.activeComposer = undefined;
    this.rebuildAnchoredLayout();
    this.onChange();
  }

  focusAnchor(side: DiffSide, line: number): void {
    if (this.currentFile === undefined || !this.isValidLine(side, line)) {
      return;
    }
    this.editorFor(side).setPosition({ lineNumber: line, column: 1 });
    this.editorFor(side).revealLineInCenter(line);
    this.editorFor(side).focus();
  }

  getActiveAnchor(): Anchor | undefined {
    return this.activeComposer === undefined
      ? undefined
      : { fileId: this.activeComposer.fileId, side: this.activeComposer.side, line: this.activeComposer.line, endLine: this.activeComposer.endLine };
  }

  getAnchorAffordance(): AnchorAffordanceTarget | undefined {
    return this.anchorAffordance;
  }
  getLineChanges(): readonly monaco.editor.ILineChange[] {
    return this.diffEditor.getLineChanges() ?? [];
  }
  getAnchorAffordanceAt(side: DiffSide, line: number): AnchorAffordanceTarget | undefined {
    if (!this.isValidLine(side, line)) {
      return undefined;
    }
    const editor = this.editorFor(side);
    const visible = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
    return {
      side,
      line,
      top: this.host.offsetTop + (visible?.top ?? editor.getTopForLineNumber(line) - editor.getScrollTop()),
    };
  }

  setActiveAnchor(anchor: Anchor | undefined): void {
    if (anchor === undefined || this.currentFile?.id !== anchor.fileId || !this.isValidLine(anchor.side, anchor.line)) {
      this.activeComposer = undefined;
      this.rebuildAnchoredLayout();
      this.onChange();
      return;
    }
    // Rendered-view composer creation (plan 16) can anchor any block, including one
    // Monaco would otherwise fold inside a collapsed unchanged region; force it visible
    // the same way revealAnchor() does, or the anchor zone renders with zero height.
    this.contextMode = 'all-revealed';
    this.diffEditor.updateOptions({ hideUnchangedRegions: { enabled: false } });
    this.activeComposer = {
      fileId: anchor.fileId,
      side: anchor.side,
      line: anchor.line,
      endLine: anchor.endLine,
      text: this.activeComposer?.fileId === anchor.fileId
        && this.activeComposer.side === anchor.side
        && this.activeComposer.line === anchor.line
        && this.activeComposer.endLine === anchor.endLine
        ? this.activeComposer.text
        : '',
    };
    this.rebuildAnchoredLayout();
    this.onChange();
  }

  revealAnchor(anchor: Anchor): void {
    if (this.currentFile?.id !== anchor.fileId) {
      return;
    }
    // Monaco 0.55.1 exposes no public selective hidden-region expansion API.
    this.contextMode = 'all-revealed';
    this.diffEditor.updateOptions({ hideUnchangedRegions: { enabled: false } });
    this.activateAnchor(anchor.side, anchor.line, anchor.endLine);
  }

  goToChange(direction: 'next' | 'previous'): void {
    this.diffEditor.goToDiff(direction);
  }

  layout(forceDimensions?: Readonly<{ width: number; height: number }>): void {
    // Monaco's DiffEditorWidget does not reliably re-measure its sub-editor heights from a
    // parameterless layout() call when automaticLayout is off (verified: a diff pane left
    // display:none while a cross-mode anchor zone was created — plan 16's Rendered->Source
    // toggle — stays pinned at a stale ~5px height even after an explicit no-arg layout()
    // call; only an explicit {width, height} forces the sub-editors to re-measure). Every
    // other call site (ResizeObserver, window resize, next/previous file) keeps using the
    // parameterless auto-detect it always has, since that already works correctly there
    // and passing explicit dimensions from every call site risks capturing a transiently
    // wrong read (e.g. mid-reflow from an unrelated banner).
    if (forceDimensions === undefined) {
      this.diffEditor.layout();
    } else {
      this.diffEditor.layout(forceDimensions);
    }
    this.refreshAnchorAffordance();
  }

  setAnchorZoneHeight(heightInPx: number): void {
    this.growPairedZones(heightInPx);
  }

  getDiagnostics(): AdapterDiagnostics {
    const liveModels = monaco.editor.getModels().filter((model) => model.uri.scheme === 'inmemory' && model.uri.authority === RENAME_MAP.slug).length;
    return {
      diffUpdates: this.diffUpdates,
      liveModels,
      listenerCount: this.staticDisposables.length,
      pairedZoneCount: (this.originalZone === undefined ? 0 : 1) + (this.modifiedZone === undefined ? 0 : 1),
      activeComposerCount: this.activeComposer === undefined ? 0 : 1,
      contextMode: this.contextMode,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.pendingSetFileReady?.();
    this.pendingSetFileReady = undefined;
    this.removeZones();
    this.removeAllThreadZones();
    this.disposeModels();
    for (const disposable of this.staticDisposables) {
      disposable.dispose();
    }
    this.staticDisposables.length = 0;
    this.diffEditor.dispose();
  }

  private captureFocusedSide(side: DiffSide): void {
    const position = this.editorFor(side).getPosition();
    if (position !== null) {
      this.focused = { side, line: position.lineNumber };
      this.captureAffordance(side, position.lineNumber);
    }
  }

  private captureCursor(side: DiffSide, line: number): void {
    this.focused = { side, line };
    this.captureAffordance(side, line);
  }

  private captureAffordance(side: DiffSide, line: number | undefined): void {
    if (line === undefined || !this.isValidLine(side, line)) {
      this.clearAnchorAffordance();
      return;
    }
    const editor = this.editorFor(side);
    const visible = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
    const top = this.host.offsetTop + (visible?.top ?? editor.getTopForLineNumber(line) - editor.getScrollTop());
    const next = { side, line, top };
    if (this.anchorAffordance?.side === next.side
      && this.anchorAffordance.line === next.line
      && this.anchorAffordance.top === next.top) {
      return;
    }
    this.anchorAffordance = next;
    this.onChange();
  }

  private clearAnchorAffordance(): void {
    if (this.anchorAffordance === undefined) {
      return;
    }
    this.anchorAffordance = undefined;
    this.onChange();
  }

  private refreshAnchorAffordance(): void {
    if (this.anchorAffordance !== undefined) {
      this.captureAffordance(this.anchorAffordance.side, this.anchorAffordance.line);
    }
  }

  private activateFocusedAnchor(side: DiffSide): void {
    const position = this.editorFor(side).getPosition();
    if (position !== null) {
      this.activateAnchor(side, position.lineNumber);
    }
  }

  private saveOutgoingState(): void {
    if (this.currentFile === undefined) {
      return;
    }
    this.stateByFileId.set(this.currentFile.id, {
      viewState: this.diffEditor.saveViewState(),
      focused: this.focused,
      composer: this.activeComposer,
      contextMode: this.contextMode,
    });
  }

  private editorFor(side: DiffSide): monaco.editor.IStandaloneCodeEditor {
    return side === 'base' ? this.originalEditor : this.modifiedEditor;
  }

  private modelFor(side: DiffSide): monaco.editor.ITextModel | undefined {
    return side === 'base' ? this.originalModel : this.modifiedModel;
  }

  private isValidLine(side: DiffSide, line: number): boolean {
    const model = this.modelFor(side);
    return model !== undefined && line > 0 && line <= model.getLineCount();
  }

  private disposeModels(): void {
    this.originalDecorations?.clear();
    this.modifiedDecorations?.clear();
    this.originalDecorations = undefined;
    this.modifiedDecorations = undefined;
    this.originalDiffDecorations.clear();
    this.modifiedDiffDecorations.clear();
    this.originalGutterDecorations.clear();
    this.modifiedGutterDecorations.clear();
    this.originalSelectionDecorations.clear();
    this.modifiedSelectionDecorations.clear();
    this.diffEditor.setModel(null);
    this.originalModel?.dispose();
    this.modifiedModel?.dispose();
    this.originalModel = undefined;
    this.modifiedModel = undefined;
  }

  private removeZones(): void {
    if (this.originalZone !== undefined) {
      this.originalEditor.changeViewZones((accessor) => accessor.removeZone(this.originalZone?.id ?? ''));
    }
    if (this.modifiedZone !== undefined) {
      this.modifiedEditor.changeViewZones((accessor) => accessor.removeZone(this.modifiedZone?.id ?? ''));
    }
    this.originalZone = undefined;
    this.modifiedZone = undefined;
  }

  private refreshDiffDecorations(): void {
    const changes = this.diffEditor.getLineChanges();
    const originalLineCount = this.originalModel?.getValueLength() === 0
      ? 0
      : this.originalModel?.getLineCount() ?? 0;
    const modifiedLineCount = this.modifiedModel?.getValueLength() === 0
      ? 0
      : this.modifiedModel?.getLineCount() ?? 0;
    this.originalDiffDecorations.set(buildDiffDecorations(
      changes,
      'base',
      originalLineCount,
    ));
    this.modifiedDiffDecorations.set(buildDiffDecorations(
      changes,
      'head',
      modifiedLineCount,
    ));
    this.originalGutterDecorations.set(this.buildGutterLineDecorations(originalLineCount));
    this.modifiedGutterDecorations.set(this.buildGutterLineDecorations(modifiedLineCount));
  }

  private buildGutterLineDecorations(lineCount: number): monaco.editor.IModelDeltaDecoration[] {
    if (lineCount <= 0) {
      return [];
    }
    return [{
      range: new monaco.Range(1, 1, lineCount, 1),
      options: { glyphMarginClassName: 'diff-gutter-line' },
    }];
  }

  private refreshSelectionDecorations(): void {
    const decorationsFor = (editor: monaco.editor.IStandaloneCodeEditor): monaco.editor.IModelDeltaDecoration[] =>
      (editor.getSelections() ?? [])
        .filter((selection) => !selection.isEmpty())
        .map((selection) => ({
          range: selection,
          options: {
            inlineClassName: 'monaco-selection-contrast-foreground',
            inlineClassNameAffectsLetterSpacing: false,
          },
        }));

    this.originalSelectionDecorations.set(decorationsFor(this.originalEditor));
    this.modifiedSelectionDecorations.set(decorationsFor(this.modifiedEditor));
  }

  private rebuildAnchoredLayout(): void {
    if (this.activeComposer === undefined || this.currentFile === undefined) {

      this.removeZones();
      this.originalDecorations?.clear();

      this.modifiedDecorations?.clear();
      return;
    }
    const anchor = this.activeComposer;
    if (anchor.fileId !== this.currentFile.id || !this.isValidLine(anchor.side, anchor.line)) {
      return;
    }
    this.removeZones();
    this.originalDecorations?.clear();
    this.modifiedDecorations?.clear();
    const anchoredEditor = this.editorFor(anchor.side);
    const counterpartSide: DiffSide = anchor.side === 'base' ? 'head' : 'base';
    const counterpartEditor = this.editorFor(counterpartSide);
    const counterpartModel = this.modelFor(counterpartSide);
    if (counterpartModel === undefined) {
      return;
    }
    const counterpartLine = counterpartBoundary(
      this.diffEditor.getLineChanges(),
      anchor.side,
      anchor.line,
      counterpartModel.getLineCount(),
    );
    const anchoredZone = this.createComposerZone(anchor);
    const spacerZone = this.createSpacerZone(anchoredZone.heightInPx ?? 280);
    const anchoredZoneId = this.addZone(anchoredEditor, anchoredZone);
    const spacerZoneId = this.addZone(counterpartEditor, spacerZone);
    if (anchor.side === 'base') {
      this.originalZone = { id: anchoredZoneId, zone: anchoredZone };
      this.modifiedZone = { id: spacerZoneId, zone: spacerZone };
      this.positionZones(anchor.line, counterpartLine);
      this.originalDecorations = anchoredEditor.createDecorationsCollection([this.anchorDecoration(anchor.line, anchor.endLine)]);
    } else {
      this.modifiedZone = { id: anchoredZoneId, zone: anchoredZone };
      this.originalZone = { id: spacerZoneId, zone: spacerZone };
      this.positionZones(counterpartLine, anchor.line);
      this.modifiedDecorations = anchoredEditor.createDecorationsCollection([this.anchorDecoration(anchor.line, anchor.endLine)]);
    }
  }

  private anchorDecoration(line: number, endLine?: number): monaco.editor.IModelDeltaDecoration {
    return {
      range: new monaco.Range(line, 1, endLine ?? line, 1),
      options: { isWholeLine: true, className: 'monaco-anchor-line' },
    };
  }

  private createComposerZone(anchor: ActiveComposer): monaco.editor.IViewZone {
    const container = document.createElement('section');
    container.className = 'monaco-anchor-zone monaco-anchor-zone--composer';
    container.setAttribute('aria-label', `Comment on ${anchor.side} line ${anchor.line}`);
    return { afterLineNumber: anchor.line, domNode: container, heightInPx: 280, suppressMouseDown: false };
  }
  private createSpacerZone(heightInPx: number): monaco.editor.IViewZone {
    const spacer = document.createElement('div');
    spacer.className = 'monaco-anchor-zone monaco-anchor-zone--spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return { afterLineNumber: 0, domNode: spacer, heightInPx, suppressMouseDown: true };
  }

  private addZone(editor: monaco.editor.IStandaloneCodeEditor, zone: monaco.editor.IViewZone): string {
    let zoneId = '';
    editor.changeViewZones((accessor) => {
      zoneId = accessor.addZone(zone);
    });
    return zoneId;
  }

  private positionZones(originalAfterLine: number, modifiedAfterLine: number): void {
    if (this.originalZone === undefined || this.modifiedZone === undefined) {
      return;
    }
    this.originalZone.zone.afterLineNumber = originalAfterLine;
    this.modifiedZone.zone.afterLineNumber = modifiedAfterLine;
    this.originalEditor.changeViewZones((accessor) => accessor.layoutZone(this.originalZone?.id ?? ''));
    this.modifiedEditor.changeViewZones((accessor) => accessor.layoutZone(this.modifiedZone?.id ?? ''));
  }

  private growPairedZones(heightInPx: number): void {
    if (this.originalZone === undefined || this.modifiedZone === undefined) {
      return;
    }
    this.originalZone.zone.heightInPx = heightInPx;
    this.modifiedZone.zone.heightInPx = heightInPx;
    this.originalEditor.changeViewZones((accessor) => accessor.layoutZone(this.originalZone?.id ?? ''));
    this.modifiedEditor.changeViewZones((accessor) => accessor.layoutZone(this.modifiedZone?.id ?? ''));
  }

  createThread(commentId: string, anchor: Anchor): HTMLElement {
    return this.createThreadZone(commentId, anchor);
  }

  growThread(commentId: string, heightInPx: number): void {
    this.growThreadZone(commentId, heightInPx);
  }

  removeThread(commentId: string): void {
    this.removeThreadZone(commentId);
  }

  private createThreadSpacerDomNode(): HTMLElement {
    const spacer = document.createElement('div');
    spacer.className = 'monaco-anchor-zone monaco-anchor-zone--thread-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  private createThreadSpacerZone(afterLineNumber: number): monaco.editor.IViewZone {
    return {
      afterLineNumber,
      domNode: this.createThreadSpacerDomNode(),
      heightInPx: 140,
      suppressMouseDown: true,
      showInHiddenAreas: true,
    };
  }

  private createThreadZone(commentId: string, anchor: Anchor): HTMLElement {
    this.removeThreadZone(commentId);
    const anchoredEditor = this.editorFor(anchor.side);
    const counterpartSide: DiffSide = anchor.side === 'base' ? 'head' : 'base';
    const counterpartEditor = this.editorFor(counterpartSide);
    const counterpartModel = this.modelFor(counterpartSide);
    const counterpartLine = counterpartModel === undefined
      ? anchor.line
      : counterpartBoundary(this.diffEditor.getLineChanges(), anchor.side, anchor.line, counterpartModel.getLineCount());

    const widgetDomNode = document.createElement('div');
    widgetDomNode.className = 'monaco-thread-widget';
    widgetDomNode.setAttribute('data-thread-id', commentId);

    const anchoredZone = this.createThreadSpacerZone(anchor.line);
    const counterpartZone = this.createThreadSpacerZone(counterpartLine);
    const anchoredZoneId = this.addZone(anchoredEditor, anchoredZone);
    const counterpartZoneId = this.addZone(counterpartEditor, counterpartZone);

    const widget: monaco.editor.IOverlayWidget = {
      allowEditorOverflow: false,
      getId: () => `${RENAME_MAP.kindPrefix}.thread-${commentId}`,
      getDomNode: () => widgetDomNode,
      getPosition: () => ({
        preference: { top: this.threadZones.get(commentId)?.widgetTop ?? 0, left: anchoredEditor.getLayoutInfo().contentLeft },
      }),
    };
    anchoredZone.onDomNodeTop = (top) => {
      const entry = this.threadZones.get(commentId);
      if (entry === undefined) {
        return;
      }
      entry.widgetTop = top;
      anchoredEditor.layoutOverlayWidget(widget);
    };
    anchoredEditor.addOverlayWidget(widget);

    this.threadZones.set(commentId, {
      originalZoneId: anchor.side === 'base' ? anchoredZoneId : counterpartZoneId,
      originalZone: anchor.side === 'base' ? anchoredZone : counterpartZone,
      modifiedZoneId: anchor.side === 'base' ? counterpartZoneId : anchoredZoneId,
      modifiedZone: anchor.side === 'base' ? counterpartZone : anchoredZone,
      anchorEditor: anchoredEditor,
      widget,
      widgetTop: 0,
    });
    return widgetDomNode;
  }

  private growThreadZone(commentId: string, heightInPx: number): void {
    const entry = this.threadZones.get(commentId);
    if (entry === undefined) {
      return;
    }
    entry.originalZone.heightInPx = heightInPx;
    entry.modifiedZone.heightInPx = heightInPx;
    this.originalEditor.changeViewZones((accessor) => accessor.layoutZone(entry.originalZoneId));
    this.modifiedEditor.changeViewZones((accessor) => accessor.layoutZone(entry.modifiedZoneId));
    entry.anchorEditor.layoutOverlayWidget(entry.widget);
  }

  private removeThreadZone(commentId: string): void {
    const entry = this.threadZones.get(commentId);
    if (entry === undefined) {
      return;
    }
    entry.anchorEditor.removeOverlayWidget(entry.widget);
    this.originalEditor.changeViewZones((accessor) => accessor.removeZone(entry.originalZoneId));
    this.modifiedEditor.changeViewZones((accessor) => accessor.removeZone(entry.modifiedZoneId));
    this.threadZones.delete(commentId);
  }

  private removeAllThreadZones(): void {
    for (const commentId of [...this.threadZones.keys()]) {
      this.removeThreadZone(commentId);
    }
  }
}

type SinglePaneSavedState = {
  viewState: monaco.editor.ICodeEditorViewState | null;
  focusedLine: number | undefined;
  composer: ActiveComposer | undefined;
};

class PublicMonacoSinglePaneAdapter {
  private readonly editor: monaco.editor.IStandaloneCodeEditor;
  private readonly side: DiffSide;
  private readonly stateByFileId = new Map<string, SinglePaneSavedState>();
  private readonly staticDisposables: monaco.IDisposable[] = [];
  private readonly selectionDecorations: monaco.editor.IEditorDecorationsCollection;
  private model: monaco.editor.ITextModel | undefined;
  private decorations: monaco.editor.IEditorDecorationsCollection | undefined;
  private currentFile: ImmutableDiffFile | undefined;
  private activeComposer: ActiveComposer | undefined;
  private focusedLine: number | undefined;
  private anchorAffordance: AnchorAffordanceTarget | undefined;
  private zone: { id: string; zone: monaco.editor.IViewZone } | undefined;
  private readonly threadZones = new Map<string, {
    zoneId: string;
    zone: monaco.editor.IViewZone;
    widget: monaco.editor.IOverlayWidget;
    widgetTop: number;
  }>();
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly languageForPath: (path: string) => string,
    private readonly onChange: () => void,
    private readonly navigate: AdapterNavigation,
    side: DiffSide,
  ) {
    this.side = side;
    applyLoopnoteTheme();
    this.editor = monaco.editor.create(host, {
      ariaLabel: side === 'base' ? 'Immutable base only' : 'Immutable head only',
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
    this.selectionDecorations = this.editor.createDecorationsCollection();
    this.editor.getContainerDomNode().classList.add(`monaco-diff-pane--${side}`);
    this.staticDisposables.push(
      this.editor.onDidFocusEditorText(() => this.captureFocusedSide()),
      this.editor.onDidChangeCursorPosition((event) => this.captureCursor(event.position.lineNumber)),
      this.editor.onDidChangeCursorSelection(() => this.refreshSelectionDecorations()),
      this.editor.onDidChangeModel(() => this.refreshSelectionDecorations()),
      this.editor.onMouseMove((event) => this.captureAffordance(event.target.position?.lineNumber)),
      this.editor.onMouseDown((event) => this.captureAffordance(event.target.position?.lineNumber)),
      this.editor.onDidScrollChange(() => this.refreshAnchorAffordance()),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.add-${side}-comment`,
        label: `Add comment to ${side} line`,
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.Enter],
        run: () => this.activateFocusedAnchor(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-change-${side}`,
        label: 'Next change',
        keybindings: [monaco.KeyCode.F7],
        run: () => this.navigate.nextChange(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-change-${side}`,
        label: 'Previous change',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F7],
        run: () => this.navigate.previousChange(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-file-${side}`,
        label: 'Next file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
        run: () => this.navigate.nextFile(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-file-${side}`,
        label: 'Previous file',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
        run: () => this.navigate.previousFile(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.previous-thread-${side}`,
        label: 'Previous thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F9],
        run: () => this.navigate.previousThread(),
      }),
      this.editor.addAction({
        id: `${RENAME_MAP.kindPrefix}.next-thread-${side}`,
        label: 'Next thread',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9],
        run: () => this.navigate.nextThread(),
      }),
    );
  }

  setCodeDensity(density: 'wide' | 'default' | 'compact'): void {
    this.editor.updateOptions(CODE_DENSITIES[density]);
  }

  setSideNames({ original, modified }: { readonly original: string; readonly modified: string }): void {
    const picked = this.side === 'base' ? original : modified;
    this.editor.updateOptions({ ariaLabel: `Immutable ${picked} only` });
  }

  setRenderSideBySide(): void {}

  async setFile(file: ImmutableDiffFile): Promise<void> {
    this.saveOutgoingState();
    this.removeZone();
    this.disposeModel();
    this.currentFile = file;
    const saved = this.stateByFileId.get(file.id);
    const sideFile = this.side === 'base' ? file.base : file.head;
    const encodedPath = sideFile.path.split('/').map(encodeURIComponent).join('/');
    this.model = monaco.editor.createModel(
      sideFile.text,
      this.languageForPath(sideFile.path),
      monaco.Uri.parse(`inmemory://${RENAME_MAP.slug}/${encodeURIComponent(file.id)}/${this.side}/${encodedPath}`),
    );
    this.editor.setModel(this.model);
    this.editor.restoreViewState(saved?.viewState ?? null);
    this.refreshSelectionDecorations();
    const inFlightComposer = this.activeComposer?.fileId === file.id ? this.activeComposer : undefined;
    const activeComposer = inFlightComposer ?? saved?.composer;
    this.focusedLine = inFlightComposer === undefined ? saved?.focusedLine : inFlightComposer.line;
    this.activeComposer = activeComposer;
    this.rebuildAnchoredLayout();
    if (this.focusedLine !== undefined) {
      this.editor.setPosition({ lineNumber: this.focusedLine, column: 1 });
      this.editor.revealLineInCenter(this.focusedLine);
      this.editor.focus();
    }
    this.layout();
    this.onChange();
  }

  activateAnchor(side: DiffSide, line: number, endLine?: number): void {
    if (side !== this.side || this.currentFile === undefined || !this.isValidLine(line)) {
      return;
    }
    this.focusedLine = line;
    this.activeComposer = {
      fileId: this.currentFile.id,
      side: this.side,
      line,
      endLine,
      text: this.activeComposer?.fileId === this.currentFile.id && this.activeComposer.line === line
        && this.activeComposer.endLine === endLine
        ? this.activeComposer.text
        : '',
    };
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.revealLineInCenter(line);
    this.editor.focus();
    this.captureAffordance(line);
    this.rebuildAnchoredLayout();
    this.onChange();
  }

  clearAnchor(): void {
    this.activeComposer = undefined;
    this.rebuildAnchoredLayout();
    this.onChange();
  }

  focusAnchor(side: DiffSide, line: number): void {
    if (side !== this.side || this.currentFile === undefined || !this.isValidLine(line)) {
      return;
    }
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.revealLineInCenter(line);
    this.editor.focus();
  }

  getActiveAnchor(): Anchor | undefined {
    return this.activeComposer === undefined
      ? undefined
      : { fileId: this.activeComposer.fileId, side: this.activeComposer.side, line: this.activeComposer.line, endLine: this.activeComposer.endLine };
  }

  getAnchorAffordance(): AnchorAffordanceTarget | undefined {
    return this.anchorAffordance;
  }

  getLineChanges(): readonly monaco.editor.ILineChange[] {
    return [];
  }

  getAnchorAffordanceAt(side: DiffSide, line: number): AnchorAffordanceTarget | undefined {
    if (side !== this.side || !this.isValidLine(line)) {
      return undefined;
    }
    const visible = this.editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
    return {
      side: this.side,
      line,
      top: this.host.offsetTop + (visible?.top ?? this.editor.getTopForLineNumber(line) - this.editor.getScrollTop()),
    };
  }

  setActiveAnchor(anchor: Anchor | undefined): void {
    if (anchor === undefined || anchor.side !== this.side || this.currentFile?.id !== anchor.fileId || !this.isValidLine(anchor.line)) {
      this.activeComposer = undefined;
      this.rebuildAnchoredLayout();
      this.onChange();
      return;
    }
    this.activeComposer = {
      fileId: anchor.fileId,
      side: this.side,
      line: anchor.line,
      endLine: anchor.endLine,
      text: this.activeComposer?.fileId === anchor.fileId && this.activeComposer.line === anchor.line
        && this.activeComposer.endLine === anchor.endLine
        ? this.activeComposer.text
        : '',
    };
    this.rebuildAnchoredLayout();
    this.onChange();
  }

  revealAnchor(anchor: Anchor): void {
    if (this.currentFile?.id !== anchor.fileId || anchor.side !== this.side) {
      return;
    }
    this.activateAnchor(anchor.side, anchor.line, anchor.endLine);
  }

  goToChange(_direction: 'next' | 'previous'): void {
    // A single pane has no paired hunks to navigate between; nothing to do.
  }

  layout(forceDimensions?: Readonly<{ width: number; height: number }>): void {
    if (forceDimensions === undefined) {
      this.editor.layout();
    } else {
      this.editor.layout(forceDimensions);
    }
    this.refreshAnchorAffordance();
  }

  setAnchorZoneHeight(heightInPx: number): void {
    if (this.zone === undefined) {
      return;
    }
    this.zone.zone.heightInPx = heightInPx;
    this.editor.changeViewZones((accessor) => accessor.layoutZone(this.zone?.id ?? ''));
  }

  getDiagnostics(): AdapterDiagnostics {
    const liveModels = monaco.editor.getModels().filter((model) => model.uri.scheme === 'inmemory' && model.uri.authority === RENAME_MAP.slug).length;
    return {
      diffUpdates: 0,
      liveModels,
      listenerCount: this.staticDisposables.length,
      pairedZoneCount: this.zone === undefined ? 0 : 1,
      activeComposerCount: this.activeComposer === undefined ? 0 : 1,
      contextMode: 'all-revealed',
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.removeZone();
    this.removeAllThreadZones();
    this.disposeModel();
    for (const disposable of this.staticDisposables) {
      disposable.dispose();
    }
    this.staticDisposables.length = 0;
    this.editor.dispose();
  }

  private captureFocusedSide(): void {
    const position = this.editor.getPosition();
    if (position !== null) {
      this.focusedLine = position.lineNumber;
      this.captureAffordance(position.lineNumber);
    }
  }

  private captureCursor(line: number): void {
    this.focusedLine = line;
    this.captureAffordance(line);
  }

  private captureAffordance(line: number | undefined): void {
    if (line === undefined || !this.isValidLine(line)) {
      this.clearAnchorAffordance();
      return;
    }
    const visible = this.editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
    const top = this.host.offsetTop + (visible?.top ?? this.editor.getTopForLineNumber(line) - this.editor.getScrollTop());
    const next = { side: this.side, line, top };
    if (this.anchorAffordance?.line === next.line && this.anchorAffordance.top === next.top) {
      return;
    }
    this.anchorAffordance = next;
    this.onChange();
  }

  private clearAnchorAffordance(): void {
    if (this.anchorAffordance === undefined) {
      return;
    }
    this.anchorAffordance = undefined;
    this.onChange();
  }

  private refreshAnchorAffordance(): void {
    if (this.anchorAffordance !== undefined) {
      this.captureAffordance(this.anchorAffordance.line);
    }
  }

  private activateFocusedAnchor(): void {
    const position = this.editor.getPosition();
    if (position !== null) {
      this.activateAnchor(this.side, position.lineNumber);
    }
  }

  private saveOutgoingState(): void {
    if (this.currentFile === undefined) {
      return;
    }
    this.stateByFileId.set(this.currentFile.id, {
      viewState: this.editor.saveViewState(),
      focusedLine: this.focusedLine,
      composer: this.activeComposer,
    });
  }

  private isValidLine(line: number): boolean {
    return this.model !== undefined && line > 0 && line <= this.model.getLineCount();
  }

  private disposeModel(): void {
    this.decorations?.clear();
    this.decorations = undefined;
    this.selectionDecorations.clear();
    this.editor.setModel(null);
    this.model?.dispose();
    this.model = undefined;
  }

  private removeZone(): void {
    if (this.zone !== undefined) {
      this.editor.changeViewZones((accessor) => accessor.removeZone(this.zone?.id ?? ''));
    }
    this.zone = undefined;
  }

  private refreshSelectionDecorations(): void {
    const decorations = (this.editor.getSelections() ?? [])
      .filter((selection) => !selection.isEmpty())
      .map((selection) => ({
        range: selection,
        options: {
          inlineClassName: 'monaco-selection-contrast-foreground',
          inlineClassNameAffectsLetterSpacing: false,
        },
      }));
    this.selectionDecorations.set(decorations);
  }

  private rebuildAnchoredLayout(): void {
    if (this.activeComposer === undefined || this.currentFile === undefined) {
      this.removeZone();
      this.decorations?.clear();
      return;
    }
    const anchor = this.activeComposer;
    if (anchor.fileId !== this.currentFile.id || !this.isValidLine(anchor.line)) {
      return;
    }
    this.removeZone();
    this.decorations?.clear();
    const zone = this.createComposerZone(anchor);
    const zoneId = this.addZone(zone);
    this.zone = { id: zoneId, zone };
    this.decorations = this.editor.createDecorationsCollection([this.anchorDecoration(anchor.line, anchor.endLine)]);
  }

  private anchorDecoration(line: number, endLine?: number): monaco.editor.IModelDeltaDecoration {
    return {
      range: new monaco.Range(line, 1, endLine ?? line, 1),
      options: { isWholeLine: true, className: 'monaco-anchor-line' },
    };
  }

  private createComposerZone(anchor: ActiveComposer): monaco.editor.IViewZone {
    const container = document.createElement('section');
    container.className = 'monaco-anchor-zone monaco-anchor-zone--composer';
    container.setAttribute('aria-label', `Comment on ${anchor.side} line ${anchor.line}`);
    return { afterLineNumber: anchor.line, domNode: container, heightInPx: 280, suppressMouseDown: false };
  }

  private addZone(zone: monaco.editor.IViewZone): string {
    let zoneId = '';
    this.editor.changeViewZones((accessor) => {
      zoneId = accessor.addZone(zone);
    });
    return zoneId;
  }

  createThread(commentId: string, anchor: Anchor): HTMLElement {
    return this.createThreadZone(commentId, anchor);
  }

  growThread(commentId: string, heightInPx: number): void {
    this.growThreadZone(commentId, heightInPx);
  }

  removeThread(commentId: string): void {
    this.removeThreadZone(commentId);
  }

  private createThreadSpacerDomNode(): HTMLElement {
    const spacer = document.createElement('div');
    spacer.className = 'monaco-anchor-zone monaco-anchor-zone--thread-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  private createThreadZone(commentId: string, anchor: Anchor): HTMLElement {
    this.removeThreadZone(commentId);
    const widgetDomNode = document.createElement('div');
    widgetDomNode.className = 'monaco-thread-widget';
    widgetDomNode.setAttribute('data-thread-id', commentId);

    const zone: monaco.editor.IViewZone = {
      afterLineNumber: anchor.line,
      domNode: this.createThreadSpacerDomNode(),
      heightInPx: 140,
      suppressMouseDown: true,
      showInHiddenAreas: true,
    };
    const zoneId = this.addZone(zone);

    const widget: monaco.editor.IOverlayWidget = {
      allowEditorOverflow: false,
      getId: () => `${RENAME_MAP.kindPrefix}.thread-${commentId}`,
      getDomNode: () => widgetDomNode,
      getPosition: () => ({
        preference: { top: this.threadZones.get(commentId)?.widgetTop ?? 0, left: this.editor.getLayoutInfo().contentLeft },
      }),
    };
    zone.onDomNodeTop = (top) => {
      const entry = this.threadZones.get(commentId);
      if (entry === undefined) {
        return;
      }
      entry.widgetTop = top;
      this.editor.layoutOverlayWidget(widget);
    };
    this.editor.addOverlayWidget(widget);

    this.threadZones.set(commentId, { zoneId, zone, widget, widgetTop: 0 });
    return widgetDomNode;
  }

  private growThreadZone(commentId: string, heightInPx: number): void {
    const entry = this.threadZones.get(commentId);
    if (entry === undefined) {
      return;
    }
    entry.zone.heightInPx = heightInPx;
    this.editor.changeViewZones((accessor) => accessor.layoutZone(entry.zoneId));
    this.editor.layoutOverlayWidget(entry.widget);
  }

  private removeThreadZone(commentId: string): void {
    const entry = this.threadZones.get(commentId);
    if (entry === undefined) {
      return;
    }
    this.editor.removeOverlayWidget(entry.widget);
    this.editor.changeViewZones((accessor) => accessor.removeZone(entry.zoneId));
    this.threadZones.delete(commentId);
  }

  private removeAllThreadZones(): void {
    for (const commentId of [...this.threadZones.keys()]) {
      this.removeThreadZone(commentId);
    }
  }
}

/**
 * Executes only commands that belong to the public Monaco adapter surface.
 * State transitions, persistence, and DOM focus remain owned by workspace composition.
 */
export function applyMonacoWorkspaceCommand(
  adapter: MonacoDiffAdapter,
  command: WorkspaceCommand,
): void {
  switch (command.type) {
    case 'go-to-change':
      adapter.goToChange(command.direction);
      return;
    case 'layout':
      adapter.layout();
      return;
    case 'reveal-comment-context':
    case 'reveal-line':
      adapter.revealAnchor(command);
      return;
    default:
      return;
  }
}

export function createMonacoDiffAdapter(
  host: HTMLElement,
  languageForPath: (path: string) => string,
  onChange: () => void,
  navigate: AdapterNavigation,
): MonacoDiffAdapter {
  return new PublicMonacoDiffAdapter(host, languageForPath, onChange, navigate);
}

export function createMonacoSinglePaneAdapter(
  host: HTMLElement,
  languageForPath: (path: string) => string,
  onChange: () => void,
  navigate: AdapterNavigation,
  side: DiffSide,
): MonacoDiffAdapter {
  return new PublicMonacoSinglePaneAdapter(host, languageForPath, onChange, navigate, side);
}
