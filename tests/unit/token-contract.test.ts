import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { TOKEN_ROOT_CSS } from 'virtual:loopnote-tokens';

import { CANONICAL_TOKENS } from '../../scripts/css-token-contract.mjs';
import { tokenRootPlugin } from '../../scripts/token-root-plugin.mjs';
import { canonicalRoot, independentRootCss } from '../helpers/canonical-root.js';
import {
  normalizeColor,
  normalizeDeclaration,
  parseTokenRoot,
  resolveToken,
  toCssRgb,
  toMonacoHex,
} from '../../src/web/theme/token-contract.js';

const root = `
  color-scheme: dark;
  --opaque: #A7B1BD;
  --translucent: rgb(46 160 67 / 45%);
  --faint: rgb(248 81 73 / 22%);
  --alias-one: var(--alias-two);
  --alias-two: var(--opaque);
  --font: -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--opaque);
`;

const fixtureRoot = (overrides: Readonly<Record<string, string>> = {}, prefix = ''): string => `:root {${prefix}
${CANONICAL_TOKENS.map((token) => `  ${token}: ${overrides[token] ?? '#000000'};`).join('\n')}
}`;

function temporaryStyles(styles: string): Readonly<{ repositoryRoot: string; sourcePath: string }> {
  const repositoryRoot = mkdtempSync(resolve(tmpdir(), 'loopnote-token-root-'));
  const sourcePath = resolve(repositoryRoot, 'src/web/styles.css');
  mkdirSync(resolve(repositoryRoot, 'src/web'), { recursive: true });
  writeFileSync(sourcePath, styles);
  return { repositoryRoot, sourcePath };
}

describe('token contract', () => {
  it('parses custom properties and resolves aliases', () => {
    const tokens = parseTokenRoot(root);

    expect([...tokens]).toEqual([
      ['--opaque', '#A7B1BD'],
      ['--translucent', 'rgb(46 160 67 / 45%)'],
      ['--faint', 'rgb(248 81 73 / 22%)'],
      ['--alias-one', 'var(--alias-two)'],
      ['--alias-two', 'var(--opaque)'],
      ['--font', '-apple-system, BlinkMacSystemFont, sans-serif'],
    ]);
    expect(resolveToken(tokens, '--alias-one')).toBe('#A7B1BD');
  });

  it('normalizes only colors within the supported channel and alpha ranges', () => {
    expect(normalizeColor('#A7B1BD')).toBe('#a7b1bd');
    expect(normalizeColor('rgb(46 160 67 / 45%)')).toBe('#2ea04373');
    expect(normalizeColor('rgb(248 81 73 / 22%)')).toBe('#f8514938');
    for (const value of ['rgb(256 0 0 / 45%)', 'rgb(0 0 0 / 45.5%)', '14px']) {
      expect(normalizeColor(value)).toBeNull();
    }
  });

  it('formats Monaco and Chromium color spellings from resolved tokens', () => {
    const tokens = parseTokenRoot(root);

    expect(toMonacoHex(tokens, '--alias-one')).toBe('#a7b1bd');
    expect(toMonacoHex(tokens, '--translucent')).toBe('#2ea04373');
    expect(toCssRgb(tokens, '--opaque')).toBe('rgb(167, 177, 189)');
  });

  it('rejects duplicate, absent, and non-color tokens by name', () => {
    expect(() => parseTokenRoot('--opaque: #ffffff; --opaque: #000000;')).toThrow('--opaque');

    const tokens = parseTokenRoot(root);
    expect(() => resolveToken(tokens, '--missing')).toThrow('--missing');
    expect(() => toMonacoHex(tokens, '--font')).toThrow('--font');
  });

  it('rejects alias cycles before Monaco resolves a token', () => {
    const tokens = parseTokenRoot('--surface-canvas: var(--surface-panel); --surface-panel: var(--surface-canvas);');

    expect(() => resolveToken(tokens, '--surface-canvas')).toThrow('alias cycle');
  });

  it('normalizes colors within composite declarations only', () => {
    expect(normalizeDeclaration('0 8px 24px rgb(1 4 9 / 68%)')).toBe('0 8px 24px #010409ad');
  });

  it('loads brace-containing canonical roots through the Vite plugin', () => {
    const fixture = temporaryStyles(fixtureRoot(
      { '--font-ui': '"brace }"' },
      '\n  /* a multiline comment\n  } */',
    ));
    const plugin = tokenRootPlugin(fixture.repositoryRoot);
    const load = plugin.load?.call({ addWatchFile: vi.fn() }, '\0virtual:loopnote-tokens');

    try {
      expect(load).toBeTypeOf('string');
      const emitted = JSON.parse((load as string).slice('export const TOKEN_ROOT_CSS = '.length, -2));
      expect(emitted).toBe(independentRootCss(fixtureRoot(
        { '--font-ui': '"brace }"' },
        '\n  /* a multiline comment\n  } */',
      )));
      expect(parseTokenRoot(emitted).size).toBe(CANONICAL_TOKENS.length);
      expect(() => independentRootCss(':root { --surface-canvas: #000000;')).toThrow('unbalanced');
      expect(() => plugin.load?.call({ addWatchFile: vi.fn() }, '\0virtual:loopnote-tokens')).not.toThrow();
    } finally {
      rmSync(fixture.repositoryRoot, { recursive: true, force: true });
    }
  });

  it('rejects malformed canonical roots in the Vite plugin', () => {
    const missing = temporaryStyles(fixtureRoot().replace(`  ${CANONICAL_TOKENS[0]}: #000000;\n`, ''));
    const duplicate = temporaryStyles(fixtureRoot().replace('\n}', '\n  --surface-canvas: #111111;\n}'));

    try {
      expect(() => tokenRootPlugin(missing.repositoryRoot).load?.call({ addWatchFile: vi.fn() }, '\0virtual:loopnote-tokens')).toThrow(CANONICAL_TOKENS[0]);
      expect(() => tokenRootPlugin(duplicate.repositoryRoot).load?.call({ addWatchFile: vi.fn() }, '\0virtual:loopnote-tokens')).toThrow('duplicate token');
    } finally {
      rmSync(missing.repositoryRoot, { recursive: true, force: true });
      rmSync(duplicate.repositoryRoot, { recursive: true, force: true });
    }
  });

  it('reloads the virtual token module after styles.css changes in a Vite dev server', async () => {
    const fixture = temporaryStyles(fixtureRoot());
    const server = await createServer({
      appType: 'custom',
      configFile: false,
      plugins: [tokenRootPlugin(fixture.repositoryRoot)],
    });

    try {
      const before = await server.ssrLoadModule('virtual:loopnote-tokens') as { TOKEN_ROOT_CSS: string };
      const changed = new Promise<void>((done) => {
        server.watcher.once('change', (path) => {
          if (path === fixture.sourcePath) done();
        });
      });
      writeFileSync(fixture.sourcePath, fixtureRoot({ '--surface-canvas': '#010203' }));
      await changed;
      const after = await server.ssrLoadModule('virtual:loopnote-tokens') as { TOKEN_ROOT_CSS: string };

      expect(before.TOKEN_ROOT_CSS).toContain('--surface-canvas: #000000;');
      expect(after.TOKEN_ROOT_CSS).toContain('--surface-canvas: #010203;');
    } finally {
      await server.close();
      rmSync(fixture.repositoryRoot, { recursive: true, force: true });
    }
  });
  it('agrees on the canonical root from build and filesystem readers', () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..');
    const buildTokens = parseTokenRoot(TOKEN_ROOT_CSS);
    const filesystemTokens = canonicalRoot(repositoryRoot);

    expect(buildTokens.size).toBeGreaterThan(0);
    expect(filesystemTokens.size).toBeGreaterThan(0);
    expect(buildTokens).toEqual(filesystemTokens);
  });

});
