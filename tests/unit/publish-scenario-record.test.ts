import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

import { publishScenarioRecord, writeRuntimeScenario } from '../helpers/runtime-artifact.js';

const bridgeRoots: string[] = [];

function bridgeEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    [`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_REPORT`]: join(root, 'scenario'),
    [`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_RUN_ID`]: 'unit-run',
  };
}

function published(root: string, scenario: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, `scenario.${scenario}.json`), 'utf8')) as Record<string, unknown>;
}

function localArchiveRecord(): Readonly<Record<string, unknown>> {
  return {
    archive: { sha256: 'archive' },
    package: { version: '1.5.0' },
    install: { manifestSha256: 'manifest' },
    target: { platform: process.platform, arch: process.arch },
    cleanup: { complete: true },
    observation: 'retained',
  };
}

afterEach(() => {
  for (const root of bridgeRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('publishScenarioRecord', () => {
  it('publishes passed by default and retains caller record keys', () => {
    const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-scenario-record-`));
    bridgeRoots.push(root);

    publishScenarioRecord('public-global', { observation: 'retained' }, { environment: bridgeEnvironment(root) });

    expect(published(root, 'public-global')).toMatchObject({
      kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-scenario/v1`,
      status: 'passed',
      runId: 'unit-run',
      scenario: 'public-global',
      profile: 'stable',
      observation: 'retained',
    });
  });

  it('preserves a caller-supplied partially-blocked status', () => {
    const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-scenario-record-`));
    bridgeRoots.push(root);

    publishScenarioRecord('marketplace', { observation: 'blocked' }, {
      status: 'partially-blocked',
      environment: bridgeEnvironment(root),
    });

    expect(published(root, 'marketplace').status).toBe('partially-blocked');
  });

  it('keeps local archive scenarios pinned to passed', () => {
    const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-scenario-record-`));
    bridgeRoots.push(root);

    writeRuntimeScenario('review', localArchiveRecord(), bridgeEnvironment(root));

    expect(published(root, 'review')).toMatchObject({ status: 'passed', scenario: 'review', observation: 'retained' });
  });

  it('rejects private keys and absolute home literals without publishing a record', () => {
    const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-scenario-record-`));
    bridgeRoots.push(root);
    const environment = bridgeEnvironment(root);

    for (const record of [{ path: 'private' }, { observation: `/Users/private/${RENAME_MAP.slug}` }]) {
      expect(() => publishScenarioRecord('public-npx', record, { environment })).toThrow('[runtime-artifact]');
      expect(existsSync(join(root, 'scenario.public-npx.json'))).toBe(false);
    }
  });

  it('does nothing when its supplied environment does not configure a bridge', () => {
    const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-scenario-record-`));
    bridgeRoots.push(root);

    expect(() => publishScenarioRecord('public-npx', { observation: 'ignored' }, { environment: {} })).not.toThrow();
    expect(existsSync(join(root, 'scenario.public-npx.json'))).toBe(false);
  });
});
