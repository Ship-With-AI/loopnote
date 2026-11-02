import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { canonicalRoot } from '../helpers/canonical-root.js';
import { toMonacoHex } from '../../src/web/theme/token-contract.js';

const { defineTheme, setTheme } = vi.hoisted(() => ({
  defineTheme: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('monaco-editor', () => ({
  editor: { defineTheme, setTheme },
}));

import {
  applyLoopnoteTheme,
  Loopnote_THEME,
  Loopnote_THEME_ID,
} from '../../src/web/monaco/theme.js';

type RootMapping = Readonly<{ token: string }>;

const THEME_COLOR_ROOT_MAP: Readonly<Record<string, RootMapping>> = {
  'editor.background': { token: '--surface-canvas' },
  'editor.foreground': { token: '--text-primary' },
  'editorGutter.background': { token: '--surface-sidebar' },
  'editorLineNumber.foreground': { token: '--text-line-number' },
  'editorLineNumber.activeForeground': { token: '--text-primary' },
  'editorLink.activeForeground': { token: '--diff-hunk-foreground' },
  'editorCursor.foreground': { token: '--focus-ring' },
  'editorWhitespace.foreground': { token: '--monaco-whitespace-foreground' },
  'editorIndentGuide.background1': { token: '--border-gap' },
  'editorIndentGuide.activeBackground1': { token: '--border-default' },
  'editor.selectionBackground': { token: '--text-selection-background' },
  'editor.inactiveSelectionBackground': { token: '--monaco-inactive-selection-background' },
  'editor.selectionForeground': { token: '--text-on-emphasis' },
  'editor.lineHighlightBorder': { token: '--border-control' },
  'editorOverviewRuler.border': { token: '--border-default' },
  'diffEditor.insertedLineBackground': { token: '--diff-addition-background' },
  'diffEditor.removedLineBackground': { token: '--diff-deletion-background' },
  'diffEditor.insertedTextBackground': { token: '--diff-addition-intraline-background' },
  'diffEditor.removedTextBackground': { token: '--diff-deletion-intraline-background' },
  'diffEditorGutter.insertedLineBackground': { token: '--diff-addition-background' },
  'diffEditorGutter.removedLineBackground': { token: '--diff-deletion-background' },
  'diffEditorOverview.insertedForeground': { token: '--diff-addition-foreground' },
  'diffEditorOverview.removedForeground': { token: '--diff-deletion-foreground' },
  'diffEditor.border': { token: '--diff-region-border' },
  'diffEditor.diagonalFill': { token: '--diff-empty-background' },
  'diffEditor.unchangedCodeBackground': { token: '--diff-unchanged-background' },
  'diffEditor.unchangedRegionBackground': { token: '--surface-panel' },
  'diffEditor.unchangedRegionForeground': { token: '--diff-hunk-foreground' },
  'editorWidget.background': { token: '--surface-interactive' },
  'editorWidget.foreground': { token: '--text-primary' },
  'editorWidget.border': { token: '--border-default' },
  'editorHoverWidget.background': { token: '--surface-interactive' },
  'editorHoverWidget.foreground': { token: '--text-primary' },
  'editorHoverWidget.border': { token: '--border-default' },
  focusBorder: { token: '--focus-ring' },
  'scrollbarSlider.background': { token: '--scrollbar-thumb' },
  'scrollbarSlider.hoverBackground': { token: '--monaco-scrollbar-hover-background' },
  'scrollbarSlider.activeBackground': { token: '--monaco-scrollbar-active-background' },
};

const UNPAINTED_THEME_COLORS = {
  'editor.lineHighlightBackground': '#00000000',
  'diffEditor.unchangedRegionShadow': '#00000000',
} as const;

const TOKEN_ROOT_MAP: Readonly<Record<string, Readonly<{ token: string; fontStyle?: string }>>> = {
  '': { token: '--syntax-default-foreground' },
  source: { token: '--syntax-default-foreground' },
  comment: { token: '--syntax-comment-foreground' },
  'comment.*': { token: '--syntax-comment-foreground' },
  keyword: { token: '--syntax-keyword-foreground' },
  'keyword.*': { token: '--syntax-keyword-foreground' },
  storage: { token: '--syntax-keyword-foreground' },
  control: { token: '--syntax-keyword-foreground' },
  string: { token: '--syntax-string-foreground' },
  'string.*': { token: '--syntax-string-foreground' },
  number: { token: '--syntax-number-foreground' },
  'number.*': { token: '--syntax-number-foreground' },
  'constant.numeric': { token: '--syntax-number-foreground' },
  'constant.language': { token: '--syntax-number-foreground' },
  'constant.character': { token: '--syntax-number-foreground' },
  type: { token: '--syntax-type-foreground' },
  'type.*': { token: '--syntax-type-foreground' },
  'type.identifier': { token: '--syntax-type-foreground' },
  class: { token: '--syntax-type-foreground' },
  interface: { token: '--syntax-type-foreground' },
  namespace: { token: '--syntax-type-foreground' },
  function: { token: '--syntax-default-foreground' },
  'function.*': { token: '--syntax-default-foreground' },
  method: { token: '--syntax-default-foreground' },
  identifier: { token: '--syntax-default-foreground' },
  variable: { token: '--syntax-default-foreground' },
  property: { token: '--syntax-default-foreground' },
  operator: { token: '--syntax-comment-foreground' },
  delimiter: { token: '--syntax-comment-foreground' },
  'delimiter.*': { token: '--syntax-comment-foreground' },
  punctuation: { token: '--syntax-comment-foreground' },
  tag: { token: '--syntax-keyword-foreground' },
  'attribute.name': { token: '--syntax-string-foreground' },
  invalid: { token: '--syntax-invalid-foreground', fontStyle: 'underline' },
  'invalid.*': { token: '--syntax-invalid-foreground', fontStyle: 'underline' },
};

describe('Loopnote Monaco theme', () => {
  it('maps every semantic Monaco color and token foreground to the canonical root bytes', () => {
    const tokens = canonicalRoot(resolve(import.meta.dirname, '../..'));
    const colors = Loopnote_THEME.colors;
    const mappedKeys = Object.keys(THEME_COLOR_ROOT_MAP).sort();
    expect(Object.keys(colors).filter((key) => !(key in UNPAINTED_THEME_COLORS)).sort()).toEqual(mappedKeys);

    for (const [color, mapping] of Object.entries(THEME_COLOR_ROOT_MAP)) {
      expect(colors[color as keyof typeof colors], color).toBe(toMonacoHex(tokens, mapping.token));
    }
    expect(Object.fromEntries(Object.entries(UNPAINTED_THEME_COLORS).map(([color, value]) => [color, colors[color as keyof typeof colors]]))).toEqual(UNPAINTED_THEME_COLORS);

    for (const [lineToken, intralineToken] of [
      ['--diff-addition-background', '--diff-addition-intraline-background'],
      ['--diff-deletion-background', '--diff-deletion-intraline-background'],
    ]) {
      const line = toMonacoHex(tokens, lineToken);
      const intraline = toMonacoHex(tokens, intralineToken);
      expect(line).toHaveLength(7);
      expect(intraline).toHaveLength(9);
      expect(intraline).not.toBe(line);
    }

    const rules = Object.fromEntries(Loopnote_THEME.rules.map((rule) => [rule.token, rule]));
    expect(Object.keys(rules).sort()).toEqual(Object.keys(TOKEN_ROOT_MAP).sort());
    for (const [scope, mapping] of Object.entries(TOKEN_ROOT_MAP)) {
      const rule = rules[scope];
      expect(rule?.foreground).toBe(toMonacoHex(tokens, mapping.token).slice(1));
      expect(rule?.fontStyle).toBe(mapping.fontStyle);
    }
  });

  it('rejects color literals outside the unpainted sentinel', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/web/monaco/theme.ts'),
      'utf8',
    );
    const colorLiterals = [...source.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\(/giu)]
      .map((match) => match[0]);

    expect(colorLiterals).toEqual(['#00000000']);
  });

  it('redefines then selects the stable theme on every invocation', () => {
    applyLoopnoteTheme();
    applyLoopnoteTheme();

    expect(defineTheme).toHaveBeenNthCalledWith(1, Loopnote_THEME_ID, Loopnote_THEME);
    expect(setTheme).toHaveBeenNthCalledWith(1, Loopnote_THEME_ID);
    expect(defineTheme).toHaveBeenNthCalledWith(2, Loopnote_THEME_ID, Loopnote_THEME);
    expect(setTheme).toHaveBeenNthCalledWith(2, Loopnote_THEME_ID);
    expect(defineTheme.mock.invocationCallOrder[0]).toBeLessThan(setTheme.mock.invocationCallOrder[0]);
    expect(defineTheme.mock.invocationCallOrder[1]).toBeLessThan(setTheme.mock.invocationCallOrder[1]);
  });
});
