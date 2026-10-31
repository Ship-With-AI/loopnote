import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

describe('createGitFixture({ markdownPreview: true })', () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
  });

  test('produces a committed docs/preview.md whose head/base content diverges only in the paragraph text and list item, while every hostile/benign line stays identical', async () => {
    fixture = await createGitFixture({ markdownPreview: true });

    const headContent = await readFile(join(fixture.root, 'docs', 'preview.md'), 'utf8');
    const baseContent = fixture.git(['show', 'main:docs/preview.md']).toString('utf8');

    const sharedLines = [
      '<script>window.__xssMarker = true;</script>',
      '[bad link](javascript:window.__xssMarker=true)',
      '[bad2](data:text/html,<script>window.__xssMarker=true</script>)',
      '<img src="x" onerror="window.__xssMarker=true">',
      '[good link](https://example.test)',
      '![logo](./assets/logo.svg)',
      '![remote](https://example.test/remote.png)',
    ];

    for (const line of sharedLines) {
      expect(headContent).toContain(line);
      expect(baseContent).toContain(line);
    }

    expect(headContent).toContain('Second paragraph line of the preview. (edited on head)');
    expect(headContent).toContain('- Third item (added on head)');

    expect(baseContent).not.toContain('(edited on head)');
    expect(baseContent).not.toContain('Third item (added on head)');
    expect(baseContent).toContain('Second paragraph line of the preview.');
    expect(baseContent).toContain('- First item');
    expect(baseContent).toContain('- [ ] Second item');
  });

  test('writes a sibling docs/assets/logo.svg image committed on base and unchanged on head', async () => {
    fixture = await createGitFixture({ markdownPreview: true });

    const headSvg = await readFile(join(fixture.root, 'docs', 'assets', 'logo.svg'), 'utf8');
    const baseSvg = fixture.git(['show', 'main:docs/assets/logo.svg']).toString('utf8');

    expect(headSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(headSvg).toBe(baseSvg);
  });

  test('adds a head-only docs/added-note.md markdown file for single-pane layout coverage', async () => {
    fixture = await createGitFixture({ markdownPreview: true });

    const content = await readFile(join(fixture.root, 'docs', 'added-note.md'), 'utf8');
    expect(content).toContain('# Added Note');

    const status = fixture
      .git(['diff', '--name-status', fixture.baseRef, fixture.headRef])
      .toString('utf8');
    expect(status).toContain('A\tdocs/added-note.md');
  });
});
