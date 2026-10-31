import { resolve } from 'node:path';

import type * as monaco from 'monaco-editor';

import { canonicalRoot } from '../helpers/canonical-root.js';
import { resolveToken } from '../../src/web/theme/token-contract.js';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const disposable = () => ({ dispose: vi.fn() });
  const cursorListeners: Array<(event: { position: { lineNumber: number } }) => void> = [];
  const decorationCollection = (_decorations?: readonly monaco.editor.IModelDeltaDecoration[]) => ({ clear: vi.fn(), set: vi.fn() });
  const codeEditor = () => {
    const addZone = vi.fn(() => 'zone');
    const removeZone = vi.fn();
    const layoutZone = vi.fn();
    return {
      addAction: vi.fn(() => disposable()),
      addZone,
      changeViewZones: vi.fn((change: (accessor: { addZone: typeof addZone; layoutZone: typeof layoutZone; removeZone: typeof removeZone }) => void) =>
        change({ addZone, layoutZone, removeZone })),
      createDecorationsCollection: vi.fn(decorationCollection),
      dispose: vi.fn(),
      focus: vi.fn(),
      getContainerDomNode: vi.fn(() => ({ classList: { add: vi.fn() } })),
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
  KeyCode: { Enter: 1 },
  KeyMod: { Alt: 1 },
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

import { createMonacoDiffAdapter, createMonacoSinglePaneAdapter } from '../../src/web/monaco/diff-adapter.js';

describe('PublicMonacoDiffAdapter construction', () => {
  it('defines and selects the stable theme before constructing a diff editor', () => {
    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());

    expect(mocks.defineTheme).toHaveBeenCalledOnce();
    expect(mocks.setTheme).toHaveBeenCalledOnce();
    expect(mocks.createDiffEditor).toHaveBeenCalledOnce();
    expect(mocks.defineTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.setTheme.mock.invocationCallOrder[0]);
    expect(mocks.setTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.createDiffEditor.mock.invocationCallOrder[0]);
  });

  it('derives diff-editor code typography from the canonical root', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));

    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());

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
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());

    adapter.setSideNames({ original: 'preimage', modified: 'postimage' });

    const options = { ariaLabel: 'Immutable preimage and postimage side-by-side diff' };
    expect(mocks.originalEditor.updateOptions).toHaveBeenCalledWith(options);
    expect(mocks.modifiedEditor.updateOptions).toHaveBeenCalledWith(options);
  });

  it('updates Monaco code typography for each responsive density', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());
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
    createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());

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
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn());
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
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn());
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
    const adapter = createMonacoDiffAdapter({} as HTMLElement, () => 'typescript', vi.fn());
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
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn());
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
      const adapter = createMonacoDiffAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn());
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

describe('PublicMonacoSinglePaneAdapter construction', () => {
  it('defines and selects the stable theme before constructing a plain editor', () => {
    mocks.createEditor.mockClear();
    mocks.defineTheme.mockClear();
    mocks.setTheme.mockClear();

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');

    expect(mocks.defineTheme).toHaveBeenCalledOnce();
    expect(mocks.setTheme).toHaveBeenCalledOnce();
    expect(mocks.createEditor).toHaveBeenCalledOnce();
    expect(mocks.defineTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.setTheme.mock.invocationCallOrder[0]);
    expect(mocks.setTheme.mock.invocationCallOrder[0]).toBeLessThan(mocks.createEditor.mock.invocationCallOrder[0]);
  });

  it('constructs a plain editor with readonly/typography options and no diff-only keys', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');

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
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'base');
    const baseOptions = mocks.createEditor.mock.calls.at(-1)?.[1] as { ariaLabel: string };

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');
    const headOptions = mocks.createEditor.mock.calls.at(-1)?.[1] as { ariaLabel: string };

    expect(baseOptions.ariaLabel).toContain('base');
    expect(headOptions.ariaLabel).toContain('head');
    expect(baseOptions.ariaLabel).not.toEqual(headOptions.ariaLabel);
  });

  it('loads a single file side synchronously without ever invoking onDidUpdateDiff', async () => {
    mocks.diffUpdateListeners.length = 0;
    const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');
    const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;

    adapter.setCodeDensity('wide');

    expect(mockEditor.updateOptions).toHaveBeenCalledWith({
      fontSize: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10),
      lineHeight: Number.parseInt(resolveToken(tokens, '--font-size-body'), 10) * 2,
    });
  });

  it('disposes the underlying editor exactly once, even across repeated dispose calls', () => {
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');
    const mockEditor = mocks.createEditor.mock.results.at(-1)?.value;

    adapter.dispose();
    adapter.dispose();

    expect(mockEditor.dispose).toHaveBeenCalledOnce();
  });

  it('constructs two independent fixed-side instances with two separate create calls', () => {
    mocks.createEditor.mockClear();

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'base');
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');

    expect(mocks.createEditor).toHaveBeenCalledTimes(2);
    const firstInstance = mocks.createEditor.mock.results[0]?.value;
    const secondInstance = mocks.createEditor.mock.results[1]?.value;
    expect(firstInstance).not.toBe(secondInstance);
  });

  it('always returns an empty array since single-pane has no diff editor to compute changes from', () => {
    const adapter = createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');

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
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
    const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
    await adapter.setFile(sampleFile);

    expect(adapter.getAnchorAffordanceAt('head', 0)).toBeUndefined();
    expect(adapter.getAnchorAffordanceAt('head', 21)).toBeUndefined();
  });

  it('treats a mismatched side argument as a no-op (single fixed side)', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ className: '', setAttribute: vi.fn() })),
    });
    try {
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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
      const adapter = createMonacoSinglePaneAdapter({ offsetTop: 0 } as HTMLElement, () => 'typescript', vi.fn(), 'head');
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

  it('registers the cumpa.add-{side}-comment keybinding exactly once per instance', () => {
    mocks.createEditor.mockClear();
    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'base');
    const baseEditor = mocks.createEditor.mock.results.at(-1)?.value;

    createMonacoSinglePaneAdapter({} as HTMLElement, () => 'typescript', vi.fn(), 'head');
    const headEditor = mocks.createEditor.mock.results.at(-1)?.value;

    expect(baseEditor.addAction).toHaveBeenCalledOnce();
    expect(baseEditor.addAction.mock.calls[0][0].id).toBe('cumpa.add-base-comment');
    expect(headEditor.addAction).toHaveBeenCalledOnce();
    expect(headEditor.addAction.mock.calls[0][0].id).toBe('cumpa.add-head-comment');
  });
});

