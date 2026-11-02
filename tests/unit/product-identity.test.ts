import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { deriveProductIdentity, RENAME_MAP } from '../../src/domain/product-identity.js';

const RENAME_MAP_JSON_PATH = fileURLToPath(
  new URL('../../scripts/rename-map.json', import.meta.url),
);

describe('deriveProductIdentity', () => {
  test('derives every form from a single-word name', () => {
    const identity = deriveProductIdentity('Acme');

    expect(identity).toEqual({
      displayName: 'Acme',
      slug: 'acme',
      npmPackage: '@shipwithai/acme',
      binCommand: 'acme',
      repoStateDir: '.acme/',
      xdgStateDirLower: 'acme',
      xdgStateDirTitleCase: 'Acme',
      kindPrefix: 'acme',
      envPrefix: 'ACME_',
      cssPrefix: 'acme-',
      tsIdentifierPrefix: 'Acme',
    });
  });

  test('slugifies a multi-word name with a reused hyphen-segment capitalization rule', () => {
    const identity = deriveProductIdentity('Acme Review');

    expect(identity.slug).toBe('acme-review');
    expect(identity.npmPackage).toBe('@shipwithai/acme-review');
    expect(identity.binCommand).toBe('acme-review');
    expect(identity.envPrefix).toBe('ACME_REVIEW_');
    expect(identity.cssPrefix).toBe('acme-review-');
    expect(identity.xdgStateDirTitleCase).toBe('AcmeReview');
    expect(identity.tsIdentifierPrefix).toBe('AcmeReview');
  });

  test('freezes the returned object', () => {
    const identity = deriveProductIdentity('Acme');

    expect(Object.isFrozen(identity)).toBe(true);
  });

  test.each(['foo/bar', '../escape', 'foo\0bar', 'foo\x01bar'])(
    'rejects names containing unsafe path-shaped characters: %j',
    (unsafeName) => {
      expect(() => deriveProductIdentity(unsafeName)).toThrow(/slug|path/i);
    },
  );

  test('rejects a slug that would produce a leading digit in the env var prefix', () => {
    expect(() => deriveProductIdentity('1Review')).toThrow();
  });

  test('rejects an empty name', () => {
    expect(() => deriveProductIdentity('')).toThrow(/empty slug/i);
  });

  test('rejects a name that slugifies to an empty string', () => {
    expect(() => deriveProductIdentity('   ...---   ')).toThrow(/empty slug/i);
  });

  test('rejects a slug long enough to exceed npm\'s 214-character unscoped-name budget', () => {
    const longName = 'a'.repeat(220);
    expect(() => deriveProductIdentity(longName)).toThrow();
  });

  test('round-trips through JSON without losing or altering any field', () => {
    const identity = deriveProductIdentity('Acme');
    const roundTripped = JSON.parse(JSON.stringify(identity));

    expect(roundTripped).toEqual({ ...identity });
  });

  test('scripts/rename-map.json mirrors RENAME_MAP exactly', () => {
    const jsonMirror = JSON.parse(readFileSync(RENAME_MAP_JSON_PATH, 'utf8'));

    expect(jsonMirror).toEqual(JSON.parse(JSON.stringify(RENAME_MAP)));
  });
});
