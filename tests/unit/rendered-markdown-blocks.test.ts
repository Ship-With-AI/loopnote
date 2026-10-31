import { describe, expect, test } from 'vitest';

import { renderMarkdownPreview } from '../../src/web/model/markdown-preview.js';
import { buildImageRouteUrl, extractSourceBlocks } from '../../src/web/model/rendered-markdown-blocks.js';

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
  test('builds the same-origin image route URL with path/side query params', () => {
    expect(buildImageRouteUrl('file-1', 'head', './assets/logo.svg')).toBe(
      '/api/files/file-1/image?path=.%2Fassets%2Flogo.svg&side=head',
    );
  });

  test('encodeURIComponent escapes a literal & or space inside the path so neither survives unencoded', () => {
    const url = buildImageRouteUrl('file-1', 'base', 'a & b c.png');
    const pathValue = url.slice(url.indexOf('path=') + 'path='.length, url.indexOf('&side='));
    expect(pathValue).not.toContain('&');
    expect(pathValue).not.toContain(' ');
  });
});
