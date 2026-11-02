import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import {
  assertNoPrivateValues,
  buildAcceptanceEvidence,
  deriveAcceptanceStatus,
  writeAcceptanceEvidence,
} from '../../scripts/write-acceptance-evidence.mjs';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

const tarballUrl = 'https://registry.npmjs.org/@shipwithai/cumpa/-/cumpa-1.5.0.tgz';
const integrity = 'sha512-gUBrMYwL8u75k1JX1OxO2dwfUsjQGHAqPUjh8e5Ep6gVs52wwEZFwkl49fBU2eggU9S7J1r27SCa8W1X/iHn5g==';
const marketplaceRepository = 'https://github.com/Ship-With-AI/skills.git';
const host = { platform: 'darwin', arch: 'arm64', osRelease: '25.6.0', node: '24.11.0', npm: '11.6.2', git: '2.50.1', playwright: '1.55.0', browser: 'Chromium 140' };
type SupportState = {
  installSource?: string;
  state: string;
  status: 'passed' | 'blocked';
  reason?: string;
  substituted: boolean;
};

type AcceptanceRow = {
  requirement: string;
  status: 'passed' | 'blocked' | 'partially-blocked';
  installSource?: string;
  reason?: string;
  substituted?: boolean;
  supportStates?: SupportState[];
};

type ReportState = {
  state: string;
  status: 'passed' | 'blocked';
  reason?: string;
};

type ProducerReport = {
  requirement: string;
  path: 'public-global' | 'public-npx' | 'marketplace';
  window: 'pre-restore' | 'post-restore';
  host: typeof host;
  installProof: { resolvedIntegrity?: string; packageLabel?: string; status?: 'blocked'; reason?: string };
  sharedSupportIdentity: { shared: boolean; restoreCompleted: boolean; restoreObservedFromSharedIdentity: boolean };
  sourceControlUnchanged: { asserted: boolean; scenarios: Array<{ name: string; unchanged: boolean }> };
  supportStates: Array<ReportState & { window: 'pre-restore' | 'post-restore'; observed: true; substituted: false }>;
  cleanup: { removedOwnedRoots: boolean };
  status?: 'passed' | 'blocked';
  reason?: string;
  substituted?: false;
};
type ReviewEvidence = {
  assetGraph: { assets: boolean; workers: boolean; codicon: boolean };
  reviewExport: {
    relaunch: boolean;
    canonicalV2: boolean;
    isolatedDrafts: boolean;
    reExport: string;
    exactPatch: { canonicalV3: boolean; grounded: boolean };
  };
  finish: { finish: boolean };
};

type AcceptanceEvidencePath = {
  installSource: 'global' | 'npx' | 'marketplace';
  requirement: 'ACC-01' | 'ACC-02' | 'ACC-03';
  status: 'passed';
  installProof: {
    packageLabel: string;
    resolvedTarball: string;
    resolvedIntegrity: string;
    resolvedVersion: string;
    binaryContainedInIsolatedPrefix: boolean;
    npmInstallAttempts: number;
  };
  supportStates: SupportState[];
  sharedSupportIdentity: { shared: boolean; restoreCompleted: boolean; restoreObservedFromSharedIdentity: boolean };
  sourceControlUnchanged: boolean;
  cleanup: { removedOwnedRoots: boolean };
  evidence: ReviewEvidence;
  reason?: string;
  substituted?: boolean;
};

type AcceptanceEvidenceInputs = {
  acceptedAt: string;
  host: typeof host;
  artifactIdentity: {
    tarballUrl: string;
    byteLength: number;
    sha256: string;
    npmShasumSha1: string;
    npmIntegritySha512: string;
  };
  marketplaceIdentity: {
    collectionVersion: string;
    commit: string;
    skillDigest: string;
    repository: string;
  };
  paths: [AcceptanceEvidencePath, AcceptanceEvidencePath, AcceptanceEvidencePath];
};



function supportStates(source: string, verified: 'passed' | 'blocked' = 'passed'): SupportState[] {
  return ['unverified', 'dismissed', 'verified'].map((state) => ({
    installSource: source,
    state,
    status: state === 'verified' ? verified : 'passed',
    ...(state === 'verified' && verified === 'blocked' ? { reason: 'live-entitlement-unavailable' } : {}),
    substituted: false,
  }));
}

function rows(verified: 'passed' | 'blocked' = 'passed'): AcceptanceRow[] {
  return [
    { requirement: 'ACC-01', status: 'passed', installSource: 'global' },
    { requirement: 'ACC-02', status: 'passed', installSource: 'npx' },
    { requirement: 'ACC-03', status: 'passed', installSource: 'marketplace' },
    { requirement: 'ACC-04', status: verified, ...(verified === 'blocked' ? { reason: 'live-entitlement-unavailable', substituted: false } : {}), supportStates: [...supportStates('global', verified), ...supportStates('npx', verified), ...supportStates('marketplace', verified)] },
  ];
}

function reviewEvidence(): ReviewEvidence {
  return {
    assetGraph: { assets: true, workers: true, codicon: true },
    reviewExport: { relaunch: true, canonicalV2: true, isolatedDrafts: true, reExport: 'exported', exactPatch: { canonicalV3: true, grounded: true } },
    finish: { finish: true },
  };
}
function inputs(shared = false): AcceptanceEvidenceInputs {
  return {
    acceptedAt: '2026-09-12T16:05:28.000Z',
    host,
    artifactIdentity: { tarballUrl, byteLength: 3514800, sha256: 'dc8f792920833415d309015d5f4c31501016e9a4a6cc945bb69dde2453137141', npmShasumSha1: '2d58866c862283f2c41b3f4f7d51282b2ca96472', npmIntegritySha512: integrity },
    marketplaceIdentity: { collectionVersion: '0.3.0', commit: '984e28c5838176ec15d2af8b996d0307e45b28d5', skillDigest: '8974c947bceaf2921fdd74ea900c8af6a85c1c9f94428f66f53eea923d630220', repository: marketplaceRepository },
    paths: [
      { installSource: 'global', requirement: 'ACC-01', status: 'passed', installProof: { packageLabel: '@shipwithai/cumpa@1.5.0', resolvedTarball: tarballUrl, resolvedIntegrity: integrity, resolvedVersion: '1.5.0', binaryContainedInIsolatedPrefix: true, npmInstallAttempts: 1 }, supportStates: supportStates('global'), sharedSupportIdentity: { shared, restoreCompleted: false, restoreObservedFromSharedIdentity: false }, sourceControlUnchanged: true, cleanup: { removedOwnedRoots: true }, evidence: reviewEvidence() },
      { installSource: 'npx', requirement: 'ACC-02', status: 'passed', installProof: { packageLabel: '@shipwithai/cumpa@1.5.0', resolvedTarball: tarballUrl, resolvedIntegrity: integrity, resolvedVersion: '1.5.0', binaryContainedInIsolatedPrefix: true, npmInstallAttempts: 1 }, supportStates: supportStates('npx'), sharedSupportIdentity: { shared, restoreCompleted: false, restoreObservedFromSharedIdentity: false }, sourceControlUnchanged: true, cleanup: { removedOwnedRoots: true }, evidence: reviewEvidence() },
      { installSource: 'marketplace', requirement: 'ACC-03', status: 'passed', installProof: { packageLabel: '@shipwithai/cumpa@1.5.0', resolvedTarball: tarballUrl, resolvedIntegrity: integrity, resolvedVersion: '1.5.0', binaryContainedInIsolatedPrefix: true, npmInstallAttempts: 1 }, supportStates: supportStates('marketplace'), sharedSupportIdentity: { shared, restoreCompleted: false, restoreObservedFromSharedIdentity: false }, sourceControlUnchanged: true, cleanup: { removedOwnedRoots: true }, evidence: reviewEvidence() },
    ],
  };
}

function report(path: 'public-global' | 'public-npx' | 'marketplace', window: 'pre-restore' | 'post-restore', states: ReportState[] = [{ state: 'unverified', status: 'passed' }]): ProducerReport {
  const requirement = path === 'public-global' ? 'ACC-01' : path === 'public-npx' ? 'ACC-02' : 'ACC-03';
  return {
    requirement,
    path,
    window,
    host,
    installProof: { resolvedIntegrity: integrity, packageLabel: '@shipwithai/cumpa@1.5.0' },
    sharedSupportIdentity: { shared: true, restoreCompleted: false, restoreObservedFromSharedIdentity: false },
    sourceControlUnchanged: { asserted: true, scenarios: [{ name: 'driver', unchanged: true }] },
    supportStates: states.map((state) => ({ ...state, window, observed: true, substituted: false })),
    cleanup: { removedOwnedRoots: true },
  };
}

function writeRecord(reports: ProducerReport[]) {
  const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-evidence-unit-`));
  try {
    const files = reports.map((entry, index) => {
      const path = join(root, `report-${index}.json`);
      writeFileSync(path, JSON.stringify(entry));
      return { path, report: entry };
    });
    return writeAcceptanceEvidence({
      publicReportPaths: files.filter((entry) => entry.report.path !== 'marketplace').map((entry) => entry.path),
      marketplaceReportPaths: files.filter((entry) => entry.report.path === 'marketplace').map((entry) => entry.path),
      outputPath: join(root, 'record.json'),
      acceptedAt: '2026-09-12T16:05:28.000Z',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('derives passed only from a complete all-passed matrix', () => {
  expect(deriveAcceptanceStatus(rows())).toBe('passed');
  expect(deriveAcceptanceStatus(rows('blocked'))).toBe('partially-blocked');
});

test('treats blocked rows and incomplete support observations as partially blocked', () => {
  expect(deriveAcceptanceStatus(rows('blocked'))).toBe('partially-blocked');
  const incomplete = rows();
  const acc04 = incomplete[3];
  expect(acc04).toBeDefined();
  if (acc04 === undefined) {
    throw new Error('ACC-04 row is required.');
  }
  const supportStates = acc04.supportStates;
  expect(supportStates).toBeDefined();
  if (supportStates === undefined) {
    throw new Error('ACC-04 support states are required.');
  }
  acc04.supportStates = supportStates.filter((row) => row.state !== 'verified');
  expect(deriveAcceptanceStatus(incomplete)).toBe('partially-blocked');
});

test('rejects blocked rows without a named unsubstituted reason', () => {
  expect(() => deriveAcceptanceStatus([...rows().slice(0, 3), { requirement: 'ACC-04', status: 'blocked', supportStates: [] }])).toThrow(/reason/u);
  expect(() => deriveAcceptanceStatus([...rows().slice(0, 3), { requirement: 'ACC-04', status: 'blocked', reason: 'blocked', substituted: true, supportStates: [] }])).toThrow(/substituted/u);
});

test('requires every requirement and every ACC-04 path', () => {
  expect(() => deriveAcceptanceStatus(rows().slice(0, 3))).toThrow(/coverage/u);
  const missingMarketplace = rows();
  const acc04 = missingMarketplace[3];
  expect(acc04).toBeDefined();
  if (acc04 === undefined) {
    throw new Error('ACC-04 row is required.');
  }
  const supportStates = acc04.supportStates;
  expect(supportStates).toBeDefined();
  if (supportStates === undefined) {
    throw new Error('ACC-04 support states are required.');
  }
  acc04.supportStates = supportStates.filter((row) => row.installSource !== 'marketplace');
  expect(() => deriveAcceptanceStatus(missingMarketplace)).toThrow(/marketplace/u);
});

test('refuses private values without echoing them', () => {
  expect(() => assertNoPrivateValues({ token: 'logical-token' })).toThrow(/private key/u);
  expect(() => assertNoPrivateValues({ location: '/Users/example/private' })).toThrow(/absolute private path/u);
  expect(() => assertNoPrivateValues({ arbitrary: '/private/var/folders/secret' })).toThrow(/absolute private path/u);
  expect(() => assertNoPrivateValues({ arbitrary: '/var/db/private' })).toThrow(/absolute private path/u);
  expect(() => assertNoPrivateValues({ arbitrary: 'C:\\Users\\example\\private' })).toThrow(/absolute private path/u);
  expect(() => assertNoPrivateValues({ arbitrary: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq' })).toThrow(/installation id/u);
  expect(() => assertNoPrivateValues({ arbitrary: 'ghp_abcdefghijklmnopqrstuvwxyz12345678901234567890' })).toThrow(/credential/u);
  expect(() => assertNoPrivateValues({ url: 'https://private.example.test/flow' })).toThrow(/https url/u);
  expect(() => assertNoPrivateValues({ tarballUrl, marketplaceRepository, digest: 'abc123' })).not.toThrow();
});

test('builds a pinned record and records shared support narrowing', () => {
  const record = buildAcceptanceEvidence(inputs(true));
  expect(record.kind).toBe(`${RENAME_MAP.kindPrefix}.public-artifact-acceptance/v1`);
  expect(record.status).toBe('passed');
  expect(record.artifactIdentity).toMatchObject(inputs().artifactIdentity);
  expect(record.limitations.join('\n')).toMatch(/shared voluntary-support identity/u);
  const broken = inputs();
  broken.paths[1].installProof.resolvedIntegrity = 'sha512-wrong';
  expect(() => buildAcceptanceEvidence(broken)).toThrow(/integrity/u);
});
test('keeps installation outcomes separate from partially blocked support evidence', () => {
  const evidence = inputs();
  for (const path of evidence.paths) {
    path.supportStates = supportStates(path.installSource, 'blocked');
    path.reason = 'live-entitlement-unavailable';
    path.substituted = false;
  }

  const record = buildAcceptanceEvidence(evidence);

  expect(record.installations).toEqual(expect.arrayContaining([
    expect.objectContaining({ requirement: 'ACC-01', status: 'passed' }),
    expect.objectContaining({ requirement: 'ACC-02', status: 'passed' }),
    expect.objectContaining({ requirement: 'ACC-03', status: 'passed' }),
  ]));
  expect(record.requirements).toContainEqual(expect.objectContaining({ requirement: 'ACC-04', status: 'partially-blocked' }));
  expect(record.status).toBe('partially-blocked');
  expect(record.installations.map((path: { reason?: string }) => path.reason)).toEqual([undefined, undefined, undefined]);
});

test('blocks a failed installation-review axis without treating support as its cause', () => {
  const evidence = inputs();
  evidence.paths[1].evidence.assetGraph.workers = false;

  const record = buildAcceptanceEvidence(evidence);

  expect(record.installations[1]).toMatchObject({ requirement: 'ACC-02', status: 'blocked', reason: 'install-review-evidence-incomplete', substituted: false });
});

test('preserves the public-global Restore linkage finding with bounded provenance', () => {
  const record = buildAcceptanceEvidence({
    ...inputs(),
    restoreReportedCompleteWithoutLinkage: {
      observed: true,
      path: 'public-global',
      window: 'post-restore',
      description: 'The hosted flow reported a successful Restore while installation status remained unverified and the in-product modal reached no terminal state.',
      regenerationNote: 'The report-only regeneration did not reproduce this observation because the single authorized Restore sign-in was already consumed.',
    },
  });

  expect(record.restoreReportedCompleteWithoutLinkage).toMatchObject({ observed: true, path: 'public-global', window: 'post-restore' });
  expect(record.installations.filter((path: { installSource: string }) => path.installSource !== 'global')).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ restoreReportedCompleteWithoutLinkage: expect.anything() }),
  ]));
});

test.each([
  ['passed then blocked', [report('public-global', 'pre-restore', [{ state: 'verified', status: 'passed' }]), report('public-global', 'post-restore', [{ state: 'verified', status: 'blocked', reason: 'live-entitlement-unavailable' }])]],
  ['blocked then passed', [report('public-global', 'post-restore', [{ state: 'verified', status: 'blocked', reason: 'live-entitlement-unavailable' }]), report('public-global', 'pre-restore', [{ state: 'verified', status: 'passed' }])]],
])('rejects contradictory duplicate support reports in %s order', (_, reports) => {
  expect(() => writeRecord(reports)).toThrow(/conflicting support-state observation/u);
});

test('rejects mismatched immutable report facts', () => {
  const wrongProof = report('public-global', 'post-restore');
  wrongProof.installProof = { resolvedIntegrity: integrity, packageLabel: 'different' };
  expect(() => writeRecord([report('public-global', 'pre-restore'), wrongProof])).toThrow(/install proof/u);

  const wrongIdentity = report('public-global', 'post-restore');
  wrongIdentity.sharedSupportIdentity = { shared: false, restoreCompleted: false, restoreObservedFromSharedIdentity: false };
  expect(() => writeRecord([report('public-global', 'pre-restore'), wrongIdentity])).toThrow(/shared support identity/u);

  const wrongHost = report('public-npx', 'pre-restore');
  wrongHost.host = { ...host, node: '24.99.0' };
  expect(() => writeRecord([report('public-global', 'pre-restore'), wrongHost])).toThrow(/host facts/u);
});

test('synthesizes only missing states as blocked and derives source-control evidence', () => {
  const missingScenario = report('public-global', 'pre-restore');
  missingScenario.sourceControlUnchanged = { asserted: true, scenarios: [] };
  const unasserted = report('public-npx', 'pre-restore');
  unasserted.sourceControlUnchanged = { asserted: false, scenarios: [{ name: 'driver', unchanged: true }] };
  const record = writeRecord([missingScenario, unasserted]);
  const global = record.installations.find((installation: { installSource: string }) => installation.installSource === 'global');
  const npx = record.installations.find((installation: { installSource: string }) => installation.installSource === 'npx');
  expect(global.sourceControlUnchanged).toBe(false);
  expect(npx.sourceControlUnchanged).toBe(false);
  expect(global.supportStates).toContainEqual(expect.objectContaining({ state: 'dismissed', status: 'blocked', reason: 'state-not-observed', substituted: false }));
  expect(global.supportStates).toContainEqual(expect.objectContaining({ state: 'verified', status: 'blocked', reason: 'state-not-observed', substituted: false }));
  expect(record.status).toBe('partially-blocked');
});

test('keeps a blocked pre-install report honest without inventing integrity', () => {
  const blocked = report('marketplace', 'pre-restore', []);
  blocked.status = 'blocked';
  blocked.reason = 'omp-isolation-unavailable';
  blocked.substituted = false;
  blocked.installProof = { status: 'blocked', reason: 'omp-isolation-unavailable' };
  const record = writeRecord([blocked]);
  const marketplace = record.installations.find((installation: { installSource: string }) => installation.installSource === 'marketplace');
  expect(marketplace).toMatchObject({ status: 'blocked', reason: 'omp-isolation-unavailable' });
  expect(marketplace.supportStates).toHaveLength(3);
});
