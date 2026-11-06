import { resolve } from 'node:path';

import * as monaco from 'monaco-editor';

import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { resolveToken } from '../../src/web/theme/token-contract.js';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const disposable = () => ({ dispose: vi.fn() });
  const cursorListeners: Array<(event: { position: { lineNumber: number } }) => void> = [];
  const decorationCollection = (_decorations?: readonly monaco.editor.IModelDeltaDecoration[]) => ({ clear: vi.fn(), set: vi.fn() });
  const codeEditor = () => {
    let zoneSequence = 0;
    const addZone = vi.fn(() => `zone-${(zoneSequence += 1)}`);
    const removeZone = vi.fn();
    const layoutZone = vi.fn();
    return {
      addAction: vi.fn((_descriptor: monaco.editor.IActionDescriptor) => disposable()),
      addZone,
      changeViewZones: vi.fn((change: (accessor: { addZone: typeof addZone; layoutZone: typeof layoutZone; removeZone: typeof removeZone }) => void) =>
        change({ addZone, layoutZone, removeZone })),
      createDecorationsCollection: vi.fn(decorationCollection),
      dispose: vi.fn(),
      focus: vi.fn(),
      getContainerDomNode: vi.fn(() => ({ classList: { add: vi.fn() } })),
      addOverlayWidget: vi.fn(),
      removeOverlayWidget: vi.fn(),
      layoutOverlayWidget: vi.fn(),
      getLayoutInfo: vi.fn(() => ({ contentLeft: 0 })),
      getPosition: vi.fn(() => null),
      getScrolledVisiblePosition: vi.fn(() => ({ top: 0 })),
      getScrollTop: vi.fn(() => 0),
      getSelections: vi.fn(() => []),
      getTopForLineNumber: vi.fn(() => 0),
      layout: vi.fn(),
      layoutZone,
      onDidChangeCursorSelection: vi.fn(disposable),
      onDidChangeModel: vi.fn(disposable),
      onDidFocusEditorText: vi.fn(disposable),
      onDidScrollChange: vi.fn(disposable),
      onDidChangeCursorPosition: vi.fn((listener: (event: { position: { lineNumber: number } }) => void) => {
        cursorListeners.push(listener);
        return disposable();
      }),
      onMouseMove: vi.fn(disposable),
      onMouseDown: vi.fn(disposable),
      removeZone,
      restoreViewState: vi.fn(),
      revealLineInCenter: vi.fn(),
      saveViewState: vi.fn(() => null),
      setModel: vi.fn(),
      setPosition: vi.fn(),
      updateOptions: vi.fn(),
    };
  };
  const originalEditor = codeEditor();
  const modifiedEditor = codeEditor();
  const diffUpdateListeners: Array<() => void> = [];
  const diffEditor = {
    dispose: vi.fn(),
    getLineChanges: vi.fn(() => []),
    getModifiedEditor: vi.fn(() => modifiedEditor),
    getOriginalEditor: vi.fn(() => originalEditor),
    layout: vi.fn(),
    onDidUpdateDiff: vi.fn((listener: () => void) => {
      diffUpdateListeners.push(listener);
      return disposable();
    }),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => null),
    setModel: vi.fn(),
    updateOptions: vi.fn(),
  };
  return {
    codeEditor,
    createDiffEditor: vi.fn(() => diffEditor),
    createEditor: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => codeEditor()),
    createModel: vi.fn(() => ({
      dispose: vi.fn(),
      getLineCount: vi.fn(() => 20),
      getValueLength: vi.fn(() => 1),
      updateOptions: vi.fn(),
    })),
    originalEditor,
    modifiedEditor,
    defineTheme: vi.fn(),
    cursorListeners,
    diffUpdateListeners,
    parseUri: vi.fn((value: string) => value),
    setTheme: vi.fn(),
  };
});

vi.mock('monaco-editor', () => ({
  KeyCode: { Enter: 1, F9: 2 },
  KeyMod: { Alt: 1, Shift: 4 },
  Range: class Range {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  Uri: { parse: mocks.parseUri },
  editor: {
    create: mocks.createEditor,
    createDiffEditor: mocks.createDiffEditor,
    createModel: mocks.createModel,
    defineTheme: mocks.defineTheme,
    setTheme: mocks.setTheme,
  },
}));

import { createMonacoDiffAdapter, createMonacoSinglePaneAdapter, type AdapterNavigation } from '../../src/web/monaco/diff-adapter.js';

// Phase 20-02 (commit 0c76bfa) added a required `navigate` parameter to both factories so
// F7/Shift+F7/Alt+Up/Alt+Down can be registered as Monaco `addAction` overrides on the
// single-pane editor too (20-UI-SPEC.md "Keyboard Map": dual registration on sub-editors
// *and* the single-pane editor). Plan 23-05 extended `AdapterNavigation` with
// `nextThread`/`previousThread` for the new Alt+F9/Shift+Alt+F9 thread-navigation actions.
// Construction-only tests below never trigger these actions, so a shared no-op stub is
// enough to keep the real five-argument call shape intact.
const noopNavigate: AdapterNavigation = {
  nextChange: vi.fn(),
  previousChange: vi.fn(),
  nextFile: vi.fn(),
  previousFile: vi.fn(),
  nextThread: vi.fn(),
  previousThread: vi.fn(),
};

describe('PublicMonacoDiffAdapter construction', () => {
  it('defines and selects the stable theme before constructing a diff editor', () => {
    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);

    expect(mocks.defineTheme).toHaveBeenCalledOnce();
    expect(mocks.setTheme).toHaveBeenCalledOnce();
    expect(mocks.createDiffEditor).toHaveBeenCalledOnce();
    expect(mocks.defineTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.setTheme.mock.invocationCallOrder[0]);
    expect(mocks.setTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.createDiffEditor.mock.invocationCallOrder[0]);
  });

  it('derives diff-editor code typography from the canonical root', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));

    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);

    expect(mocks.createDiffEditor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fontFamily: resolveToken(tokens, '--font-mono'),
        fontSize: Number.parseInt(resolveToken(tokens, '--font-size-code'), 10),
        lineHeight: Number.parseInt(resolveToken(tokens, '--line-height-code'), 10),
      }),
    );
  });

  it('updates Monaco aria label with source-correct side names', () => {
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);

    adapter.setSideNames({ original: 'preimage', modified: 'postimage' });

    const options = { ariaLabel: 'Immutable preimage and postimage side-by-side diff' };
    expect(mocks.originalEditor.updateOptions).toHaveBeenCalledWith(options);
    expect(mocks.modifiedEditor.updateOptions).toHaveBeenCalledWith(options);
  });

  it('updates Monaco code typography for each responsive density', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
    const updateOptions = mocks.createDiffEditor.mock.results.at(-1)?.value.updateOptions;

    adapter.setCodeDensity('wide');
    adapter.setCodeDensity('compact');
    adapter.setCodeDensity('default');

    expect(updateOptions).toHaveBeenNthCalledWith(1, {
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10) * 2,
    });
    expect(updateOptions).toHaveBeenNthCalledWith(2, {
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-metadata'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--font-size-metadata'), 10) * 2,
    });
    expect(updateOptions).toHaveBeenNthCalledWith(3, {
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-code'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--line-height-code'), 10),
    });
  });
  it('pins the immutable side-by-side review surface options', () => {
    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);

    expect(mocks.createDiffEditor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        diffAlgorithm: 'advanced',
        diffWordWrap: 'off',
        readOnly: true,
        renderGutterMenu: false,
        renderMarginRevertIcon: false,
        renderSideBySide: true,
        renderSideBySideInlineBreakpoint: 0,
        useInlineViewWhenSpaceIsLimited: false,
      }),
    );
  });

  it('keeps an anchor activated while its file is finishing its first diff', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      mocks.diffUpdateListeners.length = 0;
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      const loading = adapter.setFile({
        id: 'file_a',
        base: { path: 'src/example.ts', text: 'const base = 1;' },
        head: { path: 'src/example.ts', text: 'const head = 2;' },
      });

      adapter.activateAnchor('head', 10);
      const finishInitialDiff = mocks.diffUpdateListeners.at(-1);
      if (finishInitialDiff === undefined) throw new Error('expected pending initial diff listener');
      finishInitialDiff();

      await loading;

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'head', line: 10 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores saved focus independently from saved composer', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      mocks.diffUpdateListeners.length = 0;
      mocks.cursorListeners.length = 0;
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      const fileA = {
        id: 'file_a',
        base: { path: 'src/example.ts', text: 'const base = 1;' },
        head: { path: 'src/example.ts', text: 'const head = 2;' },
      };
      const loadingA = adapter.setFile(fileA);
      const finishA = mocks.diffUpdateListeners.at(-1);
      if (finishA === undefined) throw new Error('expected file A diff listener');
      finishA();
      await loadingA;
      adapter.activateAnchor('base', 10);
      const captureHeadCursor = mocks.cursorListeners.at(-1);
      if (captureHeadCursor === undefined) throw new Error('expected head cursor listener');
      captureHeadCursor({ position: { lineNumber: 11 } });

      const loadingB = adapter.setFile({
        id: 'file_b',
        base: { path: 'src/other.ts', text: 'const otherBase = 1;' },
        head: { path: 'src/other.ts', text: 'const otherHead = 2;' },
      });
      const finishB = mocks.diffUpdateListeners.at(-1);
      if (finishB === undefined) throw new Error('expected file B diff listener');
      finishB();
      await loadingB;

      const restoringA = adapter.setFile(fileA);
      const finishRestoringA = mocks.diffUpdateListeners.at(-1);
      if (finishRestoringA === undefined) throw new Error('expected restored file A diff listener');
      finishRestoringA();
      await restoringA;

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'base', line: 10 });
      expect(mocks.modifiedEditor.setPosition).toHaveBeenLastCalledWith({ lineNumber: 11, column: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('forwards the diff editor\'s computed line changes through getLineChanges()', () => {
    const sampleChanges = [{
      originalStartLineNumber: 1,
      originalEndLineNumber: 1,
      modifiedStartLineNumber: 1,
      modifiedEndLineNumber: 1,
      charChanges: undefined,
    }];
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
    const diffEditorInstance = mocks.createDiffEditor.mock.results.at(-1)?.value;
    diffEditorInstance.getLineChanges.mockReturnValueOnce(sampleChanges);

    expect(adapter.getLineChanges()).toBe(sampleChanges);
  });

  it('threads an activated endLine through getActiveAnchor() and into the anchor decoration range', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      mocks.diffUpdateListeners.length = 0;
      mocks.modifiedEditor.createDecorationsCollection.mockClear();
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      const loading = adapter.setFile({
        id: 'file_a',
        base: { path: 'src/example.ts', text: 'const base = 1;' },
        head: { path: 'src/example.ts', text: 'const head = 2;' },
      });
      const finishInitialDiff = mocks.diffUpdateListeners.at(-1);
      if (finishInitialDiff === undefined) throw new Error('expected pending initial diff listener');
      finishInitialDiff();
      await loading;

      adapter.activateAnchor('head', 10, 14);

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'head', line: 10, endLine: 14 });
      const decoration = mocks.modifiedEditor.createDecorationsCollection.mock.calls.at(-1)![0]![0]!;
      expect(decoration.range).toEqual({ startLineNumber: 10, startColumn: 1, endLineNumber: 14, endColumn: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('collapses the anchor decoration to a single line when endLine is omitted (legacy behavior unchanged)', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      mocks.diffUpdateListeners.length = 0;
      mocks.modifiedEditor.createDecorationsCollection.mockClear();
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      const loading = adapter.setFile({
        id: 'file_a',
        base: { path: 'src/example.ts', text: 'const base = 1;' },
        head: { path: 'src/example.ts', text: 'const head = 2;' },
      });
      const finishInitialDiff = mocks.diffUpdateListeners.at(-1);
      if (finishInitialDiff === undefined) throw new Error('expected pending initial diff listener');
      finishInitialDiff();
      await loading;

      adapter.activateAnchor('head', 10);

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'head', line: 10 });
      const decoration = mocks.modifiedEditor.createDecorationsCollection.mock.calls.at(-1)![0]![0]!;
      expect(decoration.range).toEqual({ startLineNumber: 10, startColumn: 1, endLineNumber: 10, endColumn: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('PublicMonacoDiffAdapter keyed thread zones', () => {
  it('creates independently-keyed paired zones for two threads, returning distinct DOM nodes and zone ids', () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      mocks.originalEditor.addZone.mockClear();
      mocks.modifiedEditor.addZone.mockClear();

      const domNodeA = adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });

      expect(domNodeA).toBeDefined();
      expect(mocks.originalEditor.addZone).toHaveBeenCalledOnce();
      expect(mocks.modifiedEditor.addZone).toHaveBeenCalledOnce();

      const domNodeB = adapter.createThread('comment-b', { fileId: 'file_a', side: 'base', line: 20 });

      expect(domNodeB).toBeDefined();
      expect(domNodeB).not.toBe(domNodeA);
      expect(mocks.originalEditor.addZone).toHaveBeenCalledTimes(2);
      expect(mocks.modifiedEditor.addZone).toHaveBeenCalledTimes(2);
      expect(mocks.originalEditor.addZone.mock.results[1]?.value).not.toBe(mocks.originalEditor.addZone.mock.results[0]?.value);
      expect(mocks.modifiedEditor.addZone.mock.results[1]?.value).not.toBe(mocks.modifiedEditor.addZone.mock.results[0]?.value);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("grows only the targeted thread's paired zones, leaving a second thread's zones untouched", () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });
      const originalZoneIdA = mocks.originalEditor.addZone.mock.results.at(-1)?.value;
      const modifiedZoneIdA = mocks.modifiedEditor.addZone.mock.results.at(-1)?.value;
      adapter.createThread('comment-b', { fileId: 'file_a', side: 'base', line: 20 });
      const originalZoneIdB = mocks.originalEditor.addZone.mock.results.at(-1)?.value;
      const modifiedZoneIdB = mocks.modifiedEditor.addZone.mock.results.at(-1)?.value;

      mocks.originalEditor.layoutZone.mockClear();
      mocks.modifiedEditor.layoutZone.mockClear();

      adapter.growThread('comment-a', 400);

      expect(mocks.originalEditor.layoutZone).toHaveBeenCalledOnce();
      expect(mocks.originalEditor.layoutZone).toHaveBeenCalledWith(originalZoneIdA);
      expect(mocks.originalEditor.layoutZone).not.toHaveBeenCalledWith(originalZoneIdB);
      expect(mocks.modifiedEditor.layoutZone).toHaveBeenCalledOnce();
      expect(mocks.modifiedEditor.layoutZone).toHaveBeenCalledWith(modifiedZoneIdA);
      expect(mocks.modifiedEditor.layoutZone).not.toHaveBeenCalledWith(modifiedZoneIdB);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes exactly the targeted thread's two zones, leaving a second thread's zones intact", () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);
      adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });
      const originalZoneIdA = mocks.originalEditor.addZone.mock.results.at(-1)?.value;
      const modifiedZoneIdA = mocks.modifiedEditor.addZone.mock.results.at(-1)?.value;
      adapter.createThread('comment-b', { fileId: 'file_a', side: 'base', line: 20 });

      mocks.originalEditor.removeZone.mockClear();
      mocks.modifiedEditor.removeZone.mockClear();

      adapter.removeThread('comment-a');

      expect(mocks.originalEditor.removeZone).toHaveBeenCalledOnce();
      expect(mocks.originalEditor.removeZone).toHaveBeenCalledWith(originalZoneIdA);
      expect(mocks.modifiedEditor.removeZone).toHaveBeenCalledOnce();
      expect(mocks.modifiedEditor.removeZone).toHaveBeenCalledWith(modifiedZoneIdA);

      mocks.originalEditor.layoutZone.mockClear();
      adapter.growThread('comment-a', 500);
      expect(mocks.originalEditor.layoutZone).not.toHaveBeenCalled();

      mocks.originalEditor.removeZone.mockClear();
      mocks.modifiedEditor.removeZone.mockClear();
      adapter.removeThread('comment-b');
      expect(mocks.originalEditor.removeZone).toHaveBeenCalledOnce();
      expect(mocks.modifiedEditor.removeZone).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('registers Alt+F9/Shift+Alt+F9 previous-thread/next-thread actions on both editors', () => {
    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate);

    const previousThreadKeybinding = monaco.KeyMod.Alt | monaco.KeyCode.F9;
    const nextThreadKeybinding = monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9;

    for (const editor of [mocks.originalEditor, mocks.modifiedEditor]) {
      const registrations = editor.addAction.mock.calls.map((call: [monaco.editor.IActionDescriptor]) => call[0]);
      const previous = registrations.find((call: { id: string }) =>
        call.id.endsWith('.previous-thread-base') || call.id.endsWith('.previous-thread-head'));
      const next = registrations.find((call: { id: string }) =>
        call.id.endsWith('.next-thread-base') || call.id.endsWith('.next-thread-head'));
      expect(previous?.keybindings).toEqual([previousThreadKeybinding]);
      expect(next?.keybindings).toEqual([nextThreadKeybinding]);
    }
  });
});


describe('PublicMonacoSinglePaneAdapter construction', () => {
  it('defines and selects the stable theme before constructing a plain editor', () => {
    mocks.createEditor.mockClear();
    mocks.defineTheme.mockClear();
    mocks.setTheme.mockClear();

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');

    expect(mocks.defineTheme).toHaveBeenCalledOnce();
    expect(mocks.setTheme).toHaveBeenCalledOnce();
    expect(mocks.createEditor).toHaveBeenCalledOnce();
    expect(mocks.defineTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.setTheme.mock.invocationCallOrder[0]);
    expect(mocks.setTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.createEditor.mock.invocationCallOrder[0]);
  });

  it('constructs a plain editor with readonly/typography options and no diff-only keys', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');

    const options = mocks.createEditor.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(options).toMatchObject({
      readOnly: true,
      glyphMargin: true,
      minimap: { enabled: false },
      fontFamily: resolveToken(tokens, '--font-mono'),
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-code'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--line-height-code'), 10),
    });
    for (const diffOnlyKey of [
      'renderSideBySide',
      'renderSideBySideInlineBreakpoint',
      'useInlineViewWhenSpaceIsLimited',
      'diffAlgorithm',
      'diffWordWrap',
      'originalEditable',
      'hideUnchangedRegions',
      'renderIndicators',
      'renderGutterMenu',
      'renderMarginRevertIcon',
    ]) {
      expect(options).not.toHaveProperty(diffOnlyKey);
    }
  });

  it('derives a side-specific aria label for base vs head construction', () => {
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'base');
    const baseOptions = mocks.createEditor.mock.calls.at(-1)?.[1] as { ariaLabel: string };

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    const headOptions = mocks.createEditor.mock.calls.at(-1)?.[1] as { ariaLabel: string };

    expect(baseOptions.ariaLabel).toContain('base');
    expect(headOptions.ariaLabel).toContain('head');
    expect(baseOptions.ariaLabel).not.toEqual(headOptions.ariaLabel);
  });

  it('loads a single file side synchronously without ever invoking onDidUpdateDiff', async () => {
    mocks.diffUpdateListeners.length = 0;
    const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;

    await adapter.setFile({
      id: 'file_a',
      base: { path: 'src/example.ts', text: 'const base = 1;' },
      head: { path: 'src/example.ts', text: 'const head = 2;' },
    });

    expect(mockEditor.setModel).toHaveBeenLastCalledWith(mocks.createModel.mock.results.at(-1)?.value);
    expect(mocks.diffUpdateListeners).toHaveLength(0);
  });

  it('reports density changes through the shared CODE_DENSITIES table', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;

    adapter.setCodeDensity('wide');

    expect(mockEditor.updateOptions).toHaveBeenCalledWith({
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10) * 2,
    });
  });

  it('disposes the underlying editor exactly once, even across repeated dispose calls', () => {
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;

    adapter.dispose();
    adapter.dispose();

    expect(mockEditor.dispose).toHaveBeenCalledOnce();
  });

  it('constructs two independent fixed-side instances with two separate create calls', () => {
    mocks.createEditor.mockClear();

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'base');
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');

    expect(mocks.createEditor).toHaveBeenCalledTimes(2);
    const firstInstance = mocks.createEditor.mock.results[0]?.value;
    const secondInstance = mocks.createEditor.mock.results[1]?.value;
    expect(firstInstance).not.toBe(secondInstance);
  });

  it('always returns an empty array since single-pane has no diff editor to compute changes from', () => {
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');

    expect(adapter.getLineChanges()).toEqual([]);
  });
});

describe('PublicMonacoSinglePaneAdapter unpaired anchor and view-zone wiring', () => {
  const sampleFile = {
    id: 'file_a',
    base: { path: 'src/example.ts', text: 'const base = 1;' },
    head: { path: 'src/example.ts', text: 'const head = 2;' },
  };

  it('opens exactly one view zone on activation, never a spacer on a counterpart editor', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);

      adapter.activateAnchor('head', 5);

      expect(mockEditor.addZone).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clears the single zone without referencing a counterpart editor', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);
      adapter.activateAnchor('head', 5);

      adapter.setActiveAnchor(undefined);

      expect(mockEditor.removeZone).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('removes the zone on dispose when a composer is active', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);
      adapter.activateAnchor('head', 5);

      adapter.dispose();

      expect(mockEditor.removeZone).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns undefined affordance for a line outside the model line-count bounds', async () => {
    const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    await adapter.setFile(sampleFile);

    expect(adapter.getAnchorAffordanceAt('head', 0)).toBeUndefined();
    expect(adapter.getAnchorAffordanceAt('head', 21)).toBeUndefined();
  });

  it('treats a mismatched side argument as a no-op (single fixed side)', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);

      adapter.activateAnchor('base', 5);

      expect(mockEditor.addZone).not.toHaveBeenCalled();
      expect(adapter.getAnchorAffordanceAt('base', 5)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('threads an activated endLine through getActiveAnchor() and into the anchor decoration range', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);

      adapter.activateAnchor('head', 5, 8);

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'head', line: 5, endLine: 8 });
      const decoration = mockEditor.createDecorationsCollection.mock.calls.at(-1)?.[0]?.[0];
      expect(decoration.range).toEqual({ startLineNumber: 5, startColumn: 1, endLineNumber: 8, endColumn: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('collapses the anchor decoration to a single line when endLine is omitted (legacy behavior unchanged)', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      await adapter.setFile(sampleFile);

      adapter.activateAnchor('head', 5);

      expect(adapter.getActiveAnchor()).toEqual({ fileId: 'file_a', side: 'head', line: 5 });
      const decoration = mockEditor.createDecorationsCollection.mock.calls.at(-1)?.[0]?.[0];
      expect(decoration.range).toEqual({ startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it(`registers the ${RENAME_MAP.kindPrefix}.add-{side}-comment keybinding exactly once per instance, alongside the NAV-03/THREAD-09 navigation actions`, () => {
    mocks.createEditor.mockClear();
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'base');
    const baseEditor = mocks.createEditor.mock.results.at(-1)?.value;

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
    const headEditor = mocks.createEditor.mock.results.at(-1)?.value;

    // 20-UI-SPEC.md "Keyboard Map": F7/Shift+F7/Alt+Up/Alt+Down are registered as Monaco
    // addAction overrides on the single-pane editor in addition to the pre-existing
    // add-comment action; Plan 23-05 adds Alt+F9/Shift+Alt+F9 previous-thread/next-thread
    // actions on top of that, so each instance now registers seven actions total.
    expect(baseEditor.addAction).toHaveBeenCalledTimes(7);
    expect(headEditor.addAction).toHaveBeenCalledTimes(7);

    const baseActionIds = baseEditor.addAction.mock.calls.map((call: [{ id: string }]) => call[0].id);
    const headActionIds = headEditor.addAction.mock.calls.map((call: [{ id: string }]) => call[0].id);

    expect(baseEditor.addAction.mock.calls[0][0].id).toBe(`${RENAME_MAP.kindPrefix}.add-base-comment`);
    expect(headEditor.addAction.mock.calls[0][0].id).toBe(`${RENAME_MAP.kindPrefix}.add-head-comment`);
    expect(baseActionIds.filter((id: string) => id === `${RENAME_MAP.kindPrefix}.add-base-comment`)).toHaveLength(1);
    expect(headActionIds.filter((id: string) => id === `${RENAME_MAP.kindPrefix}.add-head-comment`)).toHaveLength(1);

    const previousThreadKeybinding = monaco.KeyMod.Alt | monaco.KeyCode.F9;
    const nextThreadKeybinding = monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.F9;
    const previousThreadCall = baseEditor.addAction.mock.calls.find(
      (call: [{ id: string }]) => call[0].id === `${RENAME_MAP.kindPrefix}.previous-thread-base`,
    );
    const nextThreadCall = baseEditor.addAction.mock.calls.find(
      (call: [{ id: string }]) => call[0].id === `${RENAME_MAP.kindPrefix}.next-thread-base`,
    );
    expect(previousThreadCall?.[0].keybindings).toEqual([previousThreadKeybinding]);
    expect(nextThreadCall?.[0].keybindings).toEqual([nextThreadKeybinding]);
  });
});

describe('PublicMonacoSinglePaneAdapter keyed thread zones', () => {
  it('creates independently-keyed zones for two threads, returning distinct DOM nodes and zone ids', () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      mockEditor.addZone.mockClear();

      const domNodeA = adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });
      expect(domNodeA).toBeDefined();
      expect(mockEditor.addZone).toHaveBeenCalledOnce();

      const domNodeB = adapter.createThread('comment-b', { fileId: 'file_a', side: 'head', line: 20 });
      expect(domNodeB).toBeDefined();
      expect(domNodeB).not.toBe(domNodeA);
      expect(mockEditor.addZone).toHaveBeenCalledTimes(2);
      expect(mockEditor.addZone.mock.results[1]?.value).not.toBe(mockEditor.addZone.mock.results[0]?.value);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("grows only the targeted thread's zone, leaving a second thread's zone untouched", () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });
      const zoneIdA = mockEditor.addZone.mock.results.at(-1)?.value;
      adapter.createThread('comment-b', { fileId: 'file_a', side: 'head', line: 20 });
      const zoneIdB = mockEditor.addZone.mock.results.at(-1)?.value;

      mockEditor.layoutZone.mockClear();
      adapter.growThread('comment-a', 400);

      expect(mockEditor.layoutZone).toHaveBeenCalledOnce();
      expect(mockEditor.layoutZone).toHaveBeenCalledWith(zoneIdA);
      expect(mockEditor.layoutZone).not.toHaveBeenCalledWith(zoneIdB);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes exactly the targeted thread's zone, leaving a second thread's zone intact", () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), noopNavigate, 'head');
      const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;
      adapter.createThread('comment-a', { fileId: 'file_a', side: 'head', line: 10 });
      const zoneIdA = mockEditor.addZone.mock.results.at(-1)?.value;
      adapter.createThread('comment-b', { fileId: 'file_a', side: 'head', line: 20 });

      mockEditor.removeZone.mockClear();
      adapter.removeThread('comment-a');

      expect(mockEditor.removeZone).toHaveBeenCalledOnce();
      expect(mockEditor.removeZone).toHaveBeenCalledWith(zoneIdA);

      mockEditor.layoutZone.mockClear();
      adapter.growThread('comment-a', 500);
      expect(mockEditor.layoutZone).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});


