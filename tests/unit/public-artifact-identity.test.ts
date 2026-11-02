import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

import {
  PINNED_PUBLIC_ARTIFACT,
  assertPinnedInstalledResolution,
  assertPinnedRegistryDist,
  buildIsolatedPath,
  isContainedPath,
} from '../helpers/public-artifact-identity.js';

const pinnedDist = {
  tarball: PINNED_PUBLIC_ARTIFACT.tarballUrl,
  shasum: PINNED_PUBLIC_ARTIFACT.npmShasumSha1,
  integrity: PINNED_PUBLIC_ARTIFACT.npmIntegritySha512,
};

const pinnedResolution = {
  version: PINNED_PUBLIC_ARTIFACT.version,
  resolved: PINNED_PUBLIC_ARTIFACT.tarballUrl,
  integrity: PINNED_PUBLIC_ARTIFACT.npmIntegritySha512,
};

describe('public artifact identity', () => {
  it('pins the immutable Phase 5 public artifact values', () => {
    expect(PINNED_PUBLIC_ARTIFACT).toEqual({
      packageLabel: '@shipwithai/cumpa@1.5.0',
      name: '@shipwithai/cumpa',
      version: '1.5.0',
      tarballUrl: 'https://registry.npmjs.org/@shipwithai/cumpa/-/cumpa-1.5.0.tgz',
      byteLength: 3514800,
      sha256: 'dc8f792920833415d309015d5f4c31501016e9a4a6cc945bb69dde2453137141',
      npmShasumSha1: '2d58866c862283f2c41b3f4f7d51282b2ca96472',
      npmIntegritySha512: 'sha512-gUBrMYwL8u75k1JX1OxO2dwfUsjQGHAqPUjh8e5Ep6gVs52wwEZFwkl49fBU2eggU9S7J1r27SCa8W1X/iHn5g==',
    });
    expect(Object.isFrozen(PINNED_PUBLIC_ARTIFACT)).toBe(true);
  });

  it('accepts only the pinned registry distribution record', () => {
    expect(assertPinnedRegistryDist(pinnedDist)).toEqual(pinnedDist);

    for (const dist of [
      { ...pinnedDist, tarball: `https://registry.example.test/${RENAME_MAP.slug}-1.5.0.tgz` },
      { ...pinnedDist, shasum: `${pinnedDist.shasum.slice(0, -1)}0` },
      { ...pinnedDist, integrity: `${pinnedDist.integrity}x` },
    ]) {
      expect(() => assertPinnedRegistryDist(dist)).toThrow('[public-artifact]');
    }
  });

  it('accepts only an installed package-lock resolution for the pinned archive', () => {
    expect(assertPinnedInstalledResolution(pinnedResolution)).toEqual(pinnedResolution);

    for (const entry of [
      { ...pinnedResolution, resolved: `file:../${RENAME_MAP.slug}-1.5.0.tgz` },
      { version: pinnedResolution.version, integrity: pinnedResolution.integrity },
      { ...pinnedResolution, integrity: `${pinnedResolution.integrity}x` },
      { ...pinnedResolution, version: '1.5.0-bootstrap.0' },
    ]) {
      expect(() => assertPinnedInstalledResolution(entry)).toThrow('[public-artifact]');
    }
  });

  it('uses a separator boundary for realpath containment', () => {
    const root = resolve(tmpdir(), `${RENAME_MAP.slug}-public-artifact-prefix`);

    expect(isContainedPath(root, root)).toBe(true);
    expect(isContainedPath(join(root, 'bin', RENAME_MAP.binCommand), root)).toBe(true);
    expect(isContainedPath(`${root}-sibling`, root)).toBe(false);
    expect(isContainedPath(dirname(root), root)).toBe(false);
    expect(isContainedPath(resolve(tmpdir(), 'unrelated'), root)).toBe(false);
  });

  it('builds PATH only from supplied absolute directories', () => {
    const directories = [
      resolve(tmpdir(), `${RENAME_MAP.slug}-prefix`, 'bin'),
      dirname(process.execPath),
      '/usr/bin',
      '/bin',
    ];

    expect(buildIsolatedPath(directories)).toBe(directories.join(delimiter));
    expect(buildIsolatedPath(directories).split(delimiter)).toHaveLength(directories.length);
    expect(() => buildIsolatedPath([])).toThrow('[public-artifact]');
    expect(() => buildIsolatedPath(['relative'])).toThrow('[public-artifact]');
    expect(() => buildIsolatedPath([''])).toThrow('[public-artifact]');
  });
});
