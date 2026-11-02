import * as monaco from 'monaco-editor';

import { TOKEN_ROOT_CSS } from 'virtual:loopnote-tokens';

import { RENAME_MAP } from '../../domain/product-identity.js';
import { parseTokenRoot, toMonacoHex } from '../theme/token-contract';

const TOKENS = parseTokenRoot(TOKEN_ROOT_CSS);
const UNPAINTED_COLOR = '#00000000';

function color(token: string): string {
  return toMonacoHex(TOKENS, token);
}

export const Loopnote_THEME_ID = `${RENAME_MAP.cssPrefix}dark`;

export const Loopnote_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'source', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'comment', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'comment.*', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'keyword', foreground: color('--syntax-keyword-foreground').slice(1) },
    { token: 'keyword.*', foreground: color('--syntax-keyword-foreground').slice(1) },
    { token: 'storage', foreground: color('--syntax-keyword-foreground').slice(1) },
    { token: 'control', foreground: color('--syntax-keyword-foreground').slice(1) },
    { token: 'string', foreground: color('--syntax-string-foreground').slice(1) },
    { token: 'string.*', foreground: color('--syntax-string-foreground').slice(1) },
    { token: 'number', foreground: color('--syntax-number-foreground').slice(1) },
    { token: 'number.*', foreground: color('--syntax-number-foreground').slice(1) },
    { token: 'constant.numeric', foreground: color('--syntax-number-foreground').slice(1) },
    { token: 'constant.language', foreground: color('--syntax-number-foreground').slice(1) },
    { token: 'constant.character', foreground: color('--syntax-number-foreground').slice(1) },
    { token: 'type', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'type.*', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'type.identifier', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'class', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'interface', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'namespace', foreground: color('--syntax-type-foreground').slice(1) },
    { token: 'function', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'function.*', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'method', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'identifier', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'variable', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'property', foreground: color('--syntax-default-foreground').slice(1) },
    { token: 'operator', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'delimiter', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'delimiter.*', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'punctuation', foreground: color('--syntax-comment-foreground').slice(1) },
    { token: 'tag', foreground: color('--syntax-keyword-foreground').slice(1) },
    { token: 'attribute.name', foreground: color('--syntax-string-foreground').slice(1) },
    {
      token: 'invalid',
      foreground: color('--syntax-invalid-foreground').slice(1),
      fontStyle: 'underline',
    },
    {
      token: 'invalid.*',
      foreground: color('--syntax-invalid-foreground').slice(1),
      fontStyle: 'underline',
    },
  ],
  colors: {
    'editor.background': color('--surface-canvas'),
    'editor.foreground': color('--text-primary'),
    'editorGutter.background': color('--surface-sidebar'),
    'editorLineNumber.foreground': color('--text-line-number'),
    'editorLineNumber.activeForeground': color('--text-primary'),
    'editorLink.activeForeground': color('--diff-hunk-foreground'),
    'editorCursor.foreground': color('--focus-ring'),
    'editorWhitespace.foreground': color('--monaco-whitespace-foreground'),
    'editorIndentGuide.background1': color('--border-gap'),
    'editorIndentGuide.activeBackground1': color('--border-default'),
    'editor.selectionBackground': color('--text-selection-background'),
    'editor.inactiveSelectionBackground': color('--monaco-inactive-selection-background'),
    'editor.selectionForeground': color('--text-on-emphasis'),
    'editor.lineHighlightBackground': UNPAINTED_COLOR,
    'editor.lineHighlightBorder': color('--border-control'),
    'editorOverviewRuler.border': color('--border-default'),
    'diffEditor.insertedLineBackground': color('--diff-addition-background'),
    'diffEditor.removedLineBackground': color('--diff-deletion-background'),
    'diffEditor.insertedTextBackground': color('--diff-addition-intraline-background'),
    'diffEditor.removedTextBackground': color('--diff-deletion-intraline-background'),
    'diffEditorGutter.insertedLineBackground': color('--diff-addition-background'),
    'diffEditorGutter.removedLineBackground': color('--diff-deletion-background'),
    'diffEditorOverview.insertedForeground': color('--diff-addition-foreground'),
    'diffEditorOverview.removedForeground': color('--diff-deletion-foreground'),
    'diffEditor.border': color('--diff-region-border'),
    'diffEditor.diagonalFill': color('--diff-empty-background'),
    'diffEditor.unchangedCodeBackground': color('--diff-unchanged-background'),
    'diffEditor.unchangedRegionBackground': color('--surface-panel'),
    'diffEditor.unchangedRegionForeground': color('--diff-hunk-foreground'),
    'diffEditor.unchangedRegionShadow': UNPAINTED_COLOR,
    'editorWidget.background': color('--surface-interactive'),
    'editorWidget.foreground': color('--text-primary'),
    'editorWidget.border': color('--border-default'),
    'editorHoverWidget.background': color('--surface-interactive'),
    'editorHoverWidget.foreground': color('--text-primary'),
    'editorHoverWidget.border': color('--border-default'),
    focusBorder: color('--focus-ring'),
    'scrollbarSlider.background': color('--scrollbar-thumb'),
    'scrollbarSlider.hoverBackground': color('--monaco-scrollbar-hover-background'),
    'scrollbarSlider.activeBackground': color('--monaco-scrollbar-active-background'),
  },
} satisfies monaco.editor.IStandaloneThemeData;

export function applyLoopnoteTheme(): void {
  monaco.editor.defineTheme(Loopnote_THEME_ID, Loopnote_THEME);
  monaco.editor.setTheme(Loopnote_THEME_ID);
}
