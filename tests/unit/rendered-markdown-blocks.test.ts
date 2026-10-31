import type * as monaco from 'monaco-editor';
import { describe, expect, test } from 'vitest';

import { renderMarkdownPreview } from '../../src/web/model/markdown-preview.js';
import {
  buildImageRouteUrl,
  classifyBlockChange,
  extractSourceBlocks,
  findNearestBlock,
  findTopmostVisibleBlock,
  shouldEmitScrollSync,
} from '../../src/web/model/rendered-markdown-blocks.js';

function change(
  originalStartLineNumber: number,
  originalEndLineNumber: number,
  modifiedStartLineNumber = originalStartLineNumber,
  modifiedEndLineNumber = originalEndLineNumber,
): monaco.editor.ILineChange {
  return {
    originalStartLineNumber,
    originalEndLineNumber,
    modifiedStartLineNumber,
    modifiedEndLineNumber,
    charChanges: [],
  };
}

describe('extractSourceBlocks', () => {
  test('extracts every block type D-05 names from a real renderMarkdownPreview fixture, in document order', () => {
    const sample = [
      '# Heading',
      '',
      'Paragraph text.',
      '',
      '- item one',
      '- item two',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '> Quote paragraph.',
      '',
      '```js',
      'code',
      '```',
      '',
    ].join('\n');

    const html = renderMarkdownPreview(sample);

    expect(extractSourceBlocks(html)).toEqual([
      { start: 0, end: 1 }, // h1
      { start: 2, end: 3 }, // paragraph
      { start: 4, end: 5 }, // li "item one"
      { start: 5, end: 7 }, // li "item two"
      { start: 7, end: 8 }, // table header tr
      { start: 9, end: 10 }, // table body tr
      { start: 11, end: 12 }, // blockquote's inner paragraph
      { start: 13, end: 16 }, // fenced code block (<code>)
    ]);
  });

  test('returns an empty array when no element carries a data-source-start attribute', () => {
    expect(extractSourceBlocks('<p>no attributes</p>')).toEqual([]);
  });

  test('matches data-source-start/data-source-end regardless of attribute order', () => {
    expect(extractSourceBlocks('<p data-source-end="2" data-source-start="1">text</p>')).toEqual([
      { start: 0, end: 2 },
    ]);
  });
});

describe('buildImageRouteUrl', () => {
  test('builds the same-origin image route URL with path/side/token query params', () => {
    expect(buildImageRouteUrl('file-1', 'head', './assets/logo.svg', 'session-token')).toBe(
      '/api/files/file-1/image?path=.%2Fassets%2Flogo.svg&side=head&token=session-token',
    );
  });

  test('encodeURIComponent escapes a literal & or space inside the path so neither survives unencoded', () => {
    const url = buildImageRouteUrl('file-1', 'base', 'a & b c.png', 'session-token');
    const pathValue = url.slice(url.indexOf('path=') + 'path='.length, url.indexOf('&side='));
    expect(pathValue).not.toContain('&');
    expect(pathValue).not.toContain(' ');
  });

  test('encodeURIComponent escapes the token so it never breaks the query string', () => {
    const url = buildImageRouteUrl('file-1', 'base', 'logo.svg', 'a&b c');
    const tokenValue = url.slice(url.indexOf('token=') + 'token='.length);
    expect(tokenValue).not.toContain('&');
    expect(tokenValue).not.toContain(' ');
  });
});

describe('classifyBlockChange', () => {
  test('returns "changed" for both sides when a change has nonzero ranges on both sides', () => {
    const changes = [change(5, 6, 5, 6)];
    expect(classifyBlockChange(5, 6, 'base', changes)).toBe('changed');
    expect(classifyBlockChange(5, 6, 'head', changes)).toBe('changed');
  });

  test('returns "added" on head and undefined on base for a pure insertion (originalEndLineNumber === 0)', () => {
    const changes = [change(4, 0, 5, 6)];
    expect(classifyBlockChange(5, 6, 'head', changes)).toBe('added');
    expect(classifyBlockChange(5, 6, 'base', changes)).toBeUndefined();
  });

  test('returns "removed" on base and undefined on head for a pure deletion (modifiedEndLineNumber === 0)', () => {
    const changes = [change(5, 6, 4, 0)];
    expect(classifyBlockChange(5, 6, 'base', changes)).toBe('removed');
    expect(classifyBlockChange(5, 6, 'head', changes)).toBeUndefined();
  });

  test('returns undefined when the block overlaps no entry in changes, regardless of side', () => {
    const changes = [change(10, 12, 10, 12)];
    expect(classifyBlockChange(1, 2, 'base', changes)).toBeUndefined();
    expect(classifyBlockChange(1, 2, 'head', changes)).toBeUndefined();
  });

  test('returns undefined when changes is null', () => {
    expect(classifyBlockChange(1, 2, 'base', null)).toBeUndefined();
  });
});

describe('findTopmostVisibleBlock', () => {
  const blocks = [
    { start: 0, end: 1, top: -40 },
    { start: 2, end: 3, top: -5 },
    { start: 4, end: 5, top: 20 },
    { start: 6, end: 7, top: 60 },
  ];

  test('returns the first block whose top is at or below the container top', () => {
    expect(findTopmostVisibleBlock(blocks, 0)).toEqual({ start: 4, end: 5, top: 20 });
  });

  test('returns the first block when every block is already visible (containerTop below all tops)', () => {
    expect(findTopmostVisibleBlock(blocks, -100)).toEqual({ start: 0, end: 1, top: -40 });
  });

  test('returns undefined when every block has scrolled past the container top', () => {
    expect(findTopmostVisibleBlock(blocks, 1000)).toBeUndefined();
  });

  test('returns undefined for an empty list', () => {
    expect(findTopmostVisibleBlock([], 0)).toBeUndefined();
  });
});

describe('findNearestBlock', () => {
  const blocks = [
    { start: 0, end: 2 },
    { start: 5, end: 7 },
    { start: 10, end: 12 },
  ];

  test('returns the exact [start,end] match when present', () => {
    expect(findNearestBlock(blocks, 5, 7)).toEqual({ start: 5, end: 7 });
  });

  test('returns the closest-by-start block when no exact match exists', () => {
    expect(findNearestBlock(blocks, 9, 20)).toEqual({ start: 10, end: 12 });
  });

  test('returns undefined for an empty list', () => {
    expect(findNearestBlock([], 0, 0)).toBeUndefined();
  });
});

describe('shouldEmitScrollSync', () => {
  test('returns false while a programmatic scroll is in flight', () => {
    expect(shouldEmitScrollSync(true)).toBe(false);
  });

  test('returns true when no programmatic scroll is in flight', () => {
    expect(shouldEmitScrollSync(false)).toBe(true);
  });
});

