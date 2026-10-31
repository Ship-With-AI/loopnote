import { describe, expect, test } from 'vitest';

import { renderMarkdownPreview } from '../../src/web/model/markdown-preview.js';

describe('renderMarkdownPreview', () => {
  test('renders the exact local Markdown buffer and treats hostile content as inert', () => {
    const html = renderMarkdownPreview(
      '# Local attempt\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[file](file:///private/secret)\n\n[data](data:text/html;base64,PHNjcmlwdD4=)\n\n[good](https://example.test)',
    );

    expect(html).toContain('<h1 data-source-start="1" data-source-end="1">Local attempt</h1>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/href=["'](?:javascript:|file:|data:)/iu);
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  test('uses the empty-state copy without persisting a rendered representation', () => {
    expect(renderMarkdownPreview('')).toBe('<p>No summary yet</p>');
  });

  test('stamps data-source-start/data-source-end on every block type D-05 names, derived from real source lines', () => {
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

    expect(html).toContain('<h1 data-source-start="1" data-source-end="1">Heading</h1>');
    expect(html).toContain('<p data-source-start="3" data-source-end="3">Paragraph text.</p>');
    expect(html).toContain('<li data-source-start="5" data-source-end="5">item one</li>');
    expect(html).toContain('<li data-source-start="6" data-source-end="7">item two</li>');
    expect(html).toContain('<tr data-source-start="8" data-source-end="8">');
    expect(html).toContain('<tr data-source-start="10" data-source-end="10">');
    expect(html).toContain('<p data-source-start="12" data-source-end="12">Quote paragraph.</p>');
    expect(html).toContain(
      '<pre><code data-source-start="14" data-source-end="16" class="language-js">code\n</code></pre>',
    );
    expect(html).not.toMatch(/<table[^>]*data-source-start/u);
  });

  test('renders a leading front-matter block as fenced YAML instead of misparsing into hr + heading', () => {
    const html = renderMarkdownPreview('---\ntitle: Example\n---\n\n# Heading\n');

    expect(html).toContain(
      '<pre><code data-source-start="1" data-source-end="3" class="language-yaml">title: Example\n</code></pre>',
    );
    expect(html).toContain('<h1 data-source-start="5" data-source-end="5">Heading</h1>');
    expect(html).not.toContain('<hr>');
  });

  test('regression: a --- later in the document (not at line 0) keeps its normal hr meaning', () => {
    const html = renderMarkdownPreview('Paragraph one.\n\n---\n\nParagraph two.\n');

    expect(html).toContain('<hr>');
    expect(html).not.toContain('language-yaml');
  });

  test('renders GFM task-list checkboxes and leaves a plain list item unaffected', () => {
    const html = renderMarkdownPreview('- [ ] todo\n- [x] done\n- plain item\n');

    expect(html).toContain('<input type="checkbox" disabled>todo</li>');
    expect(html).toContain('<input type="checkbox" disabled checked>done</li>');
    expect(html).toMatch(/<li[^>]*>plain item<\/li>/u);
    expect(html).not.toMatch(/plain item.*checkbox/u);
  });

  test('hardens image sources at inline-rule parse time: relative survives, remote becomes placeholder, dangerous schemes fall back to literal text', () => {
    const relative = renderMarkdownPreview('![alt](./relative/path.png)');
    expect(relative).toContain('<img src="./relative/path.png" alt="alt">');

    const remote = renderMarkdownPreview('![alt](https://example.test/x.png)');
    expect(remote).not.toContain('<img');
    expect(remote).toContain('Remote image not loaded: "alt" — https://example.test/x.png');

    const remoteNoAlt = renderMarkdownPreview('![](https://example.test/y.png)');
    expect(remoteNoAlt).not.toContain('<img');
    expect(remoteNoAlt).toContain('Remote image not loaded (no alt text) — https://example.test/y.png');

    const dangerousScript = renderMarkdownPreview('![bad](javascript:alert(1))');
    expect(dangerousScript).not.toContain('<img');
    expect(dangerousScript).toContain('![bad](javascript:alert(1))');

    const dangerousData = renderMarkdownPreview('![bad2](data:image/png;base64,AAAA)');
    expect(dangerousData).not.toContain('<img');
    expect(dangerousData).toContain('![bad2](data:image/png;base64,AAAA)');
  });
});
