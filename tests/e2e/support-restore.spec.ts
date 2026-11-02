import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const execFileAsync = promisify(execFile);
const script = new URL('../../scripts/verify-supabase-support.mjs', import.meta.url).pathname;
const fingerprint = 'dd65eea0329dcb94b17187af9dff28c31a1d78026737a16af75979a1fa4618e5';
const origin = 'https://abcdefghijklmnopqrst.supabase.co';

async function reject(args: string[], message: string) {
  await expect(execFileAsync(process.execPath, [script, ...args])).rejects.toMatchObject({
    stderr: expect.stringContaining(message),
  });
}

const tables = [
  'auth.users',
  'support_private.support_intents',
  'support_private.supporters',
  'support_private.checkout_sessions',
  'support_private.stripe_events',
  'support_private.installation_bindings',
];
const routes = {
  'auth-settings': { status: 401, content_type: 'application/json' },
  'support-api-invalid-input': { status: 400, content_type: 'application/json' },
  'support-flow-invalid-state': { status: 400, content_type: 'text/plain' },
  'stripe-webhook-invalid-signature': { status: 400, content_type: 'application/json' },
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

type Manifest = Record<string, { count: number; handles: string[] }>;

type AcceptanceFixture = {
  fingerprint: string;
  public_origin: string;
  run: { id: string };
  fixture_manifest: Manifest;
  artifacts: { hostile_run_evidence_sha256: string };
};

function fixtureManifest(counts: Record<string, number> = {}) {
  return Object.fromEntries(tables.map((table) => {
    const handles = Array.from({ length: counts[table] ?? 0 }, (_, index) => hash(`${table}:${index}`)).sort();
    return [table, { count: handles.length, handles }];
  }));
}

async function writeSyntheticAcceptance(deploymentPath: string, acceptancePath: string) {
  const empty = fixtureManifest();
  const settled = fixtureManifest({
    'support_private.supporters': 1,
    'support_private.stripe_events': 1,
    'support_private.installation_bindings': 1,
  });
  const acceptedManifest = fixtureManifest({
    'auth.users': 2,
    'support_private.supporters': 1,
    'support_private.stripe_events': 1,
    'support_private.installation_bindings': 1,
  });
  const deployment = {
    version: 1,
    kind: 'deployment-run',
    status: 'passed',
    mode: 'prelaunch-test',
    fingerprint,
    public_origin: origin,
    run: { id: '100', url: 'https://github.com/example/repo/actions/runs/100', commit: 'a'.repeat(40), immutable: true },
    order: ['schema', 'auth-provider-configuration', 'edge-function-secrets', 'support-api', 'support-flow', 'stripe-webhook'],
    routes,
    authority: empty,
    artifacts: { evidence_sha256: '' },
  };
  deployment.artifacts.evidence_sha256 = hash(JSON.stringify(deployment));
  const observations = {
    browser_matrix: [
      'paid-support',
      'restart-persistence',
      'restore-paid-one',
      'restore-paid-two',
      'restore-unpaid',
      'checkout-delay',
      'checkout-cancellation',
    ].map((id) => ({ id, status: 'passed' })),
    completion: { status: 200, content_type: 'text/plain', body: `Support flow complete. You can return to ${RENAME_MAP.displayName}.` },
    review_unrestricted: true,
  };
  const marker = {
    version: 1,
    kind: 'acceptance-marker',
    mode: 'prelaunch-test',
    fingerprint,
    public_origin: origin,
    run: deployment.run,
    routes,
    acceptance_marker: {
      status: 'interactive-matrix-complete',
      deployment_evidence_sha256: deployment.artifacts.evidence_sha256,
      observations_sha256: hash(JSON.stringify(observations)),
    },
    observations,
  };
  const hostileMatrix: Array<Record<string, unknown>> = [
    'wrong-signature',
    'wrong-product',
    'wrong-amount',
    'wrong-currency',
    'wrong-binding',
    'expired-intent',
    'reused-intent',
  ].map((id) => ({
    id,
    fixtures: [hash(`hostile:${id}`)],
    before: empty,
    after: empty,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  }));
  hostileMatrix.push({
    id: 'sequential-replay',
    fixtures: [hash('hostile:sequential-replay')],
    before: empty,
    after: settled,
    expected: 'idempotent-replay',
    actual: 'idempotent-replay',
    guard: true,
    responses: [200, 200],
    first_after: settled,
  });
  hostileMatrix.push({
    id: 'concurrent-replay-settlement',
    fixtures: [hash('hostile:concurrent-replay-settlement')],
    before: empty,
    after: settled,
    expected: 'single-authority-settlement',
    actual: 'single-authority-settlement',
    guard: true,
    responses: [200, 503],
  });
  const hostileRun = {
    ...deployment,
    run: { id: '101', url: 'https://github.com/example/repo/actions/runs/101', commit: 'b'.repeat(40), immutable: true },
    hostile_matrix: hostileMatrix,
    fixture_manifest: acceptedManifest,
    acceptance_marker: { ...marker.acceptance_marker, marker_sha256: hash(JSON.stringify(marker)) },
    artifacts: { evidence_sha256: '' },
  };
  hostileRun.artifacts.evidence_sha256 = hash(JSON.stringify(hostileRun));
  const acceptance = {
    version: 1,
    kind: 'acceptance',
    status: 'passed',
    mode: 'prelaunch-test',
    fingerprint,
    public_origin: origin,
    deployment_run: deployment.run,
    run: hostileRun.run,
    routes,
    acceptance_marker: hostileRun.acceptance_marker,
    observations,
    hostile_matrix: hostileMatrix,
    fixture_manifest: acceptedManifest,
    artifacts: {
      deployment_evidence_sha256: deployment.artifacts.evidence_sha256,
      hostile_run_evidence_sha256: hostileRun.artifacts.evidence_sha256,
      marker_sha256: hostileRun.acceptance_marker.marker_sha256,
    },
    approval: { status: 'approved' },
  };
  await Promise.all([
    writeFile(deploymentPath, JSON.stringify(deployment)),
    writeFile(acceptancePath, JSON.stringify(acceptance)),
  ]);
  return { acceptance, empty, hostileRun, marker, observations };
}

function cleanupRecord(acceptance: AcceptanceFixture, empty: Manifest) {
  return {
    version: 1,
    kind: 'deployment-run',
    status: 'passed',
    mode: 'prelaunch-test',
    operation: 'exact-cleanup',
    fingerprint: acceptance.fingerprint,
    public_origin: acceptance.public_origin,
    run: { id: '102', url: 'https://github.com/example/repo/actions/runs/102', commit: 'c'.repeat(40), immutable: true },
    order: [
      'delete:support_private.stripe_events',
      'delete:support_private.installation_bindings',
      'delete:support_private.supporters',
      'delete:support_private.checkout_sessions',
      'delete:support_private.support_intents',
      'delete:auth.users',
    ],
    routes,
    authority_before: acceptance.fixture_manifest,
    deleted: acceptance.fixture_manifest,
    authority: empty,
    authority_confirmation: empty,
    acceptance: {
      run_id: acceptance.run.id,
      run_evidence_sha256: acceptance.artifacts.hostile_run_evidence_sha256,
      record_sha256: hash(JSON.stringify(acceptance)),
    },
    artifacts: { evidence_sha256: '' },
  };
}

async function writeRunEvidence(path: string, record: { artifacts: { evidence_sha256: string } }) {
  record.artifacts.evidence_sha256 = '';
  record.artifacts.evidence_sha256 = hash(JSON.stringify(record));
  await writeFile(path, JSON.stringify(record));
}

test('acceptance and promotion evidence reject incomplete lineage', async ({}, testInfo) => {
  const evidence = testInfo.outputPath('evidence.json');
  const deployment = testInfo.outputPath('deployment.json');
  await writeFile(deployment, JSON.stringify({ version: 1, kind: 'deployment-run', mode: 'prelaunch-test', fingerprint }));
  await writeFile(evidence, JSON.stringify({
    version: 1,
    kind: 'acceptance',
    mode: 'prelaunch-test',
    fingerprint,
    public_origin: origin,
    acceptance_marker: { status: 'interactive-matrix-complete' },
    hostile_matrix: [{ id: 'wrong-signature', fixtures: [], before: {}, after: {} }],
    fixture_manifest: { 'auth.users': { count: 0, handles: [] } },
    run: { id: 'run', url: 'https://github.com/example/run', commit: 'a'.repeat(40), immutable: false },
  }));

  await reject(['--check-acceptance-evidence', evidence], 'missing required option --deployment');
  await reject(['--check-acceptance-evidence', evidence, '--deployment', deployment, '--require-immutable-run'], 'evidence run is not immutable');
  await reject(['--check-promotion-evidence', evidence, '--deployment', deployment, '--non-destructive', '--require-exact-cleanup'], 'evidence kind must be promotion');
});

test('acceptance marker and machine merge bind browser observations to the protected hostile run', async ({}, testInfo) => {
  const deploymentPath = testInfo.outputPath('deployment.json');
  const observationsPath = testInfo.outputPath('observations.json');
  const markerPath = testInfo.outputPath('marker.json');
  const runPath = testInfo.outputPath('hostile-run.json');
  const outputPath = testInfo.outputPath('acceptance.md');
  const { hostileRun, marker, observations } = await writeSyntheticAcceptance(
    deploymentPath,
    testInfo.outputPath('synthetic-acceptance.json'),
  );
  await Promise.all([
    writeFile(observationsPath, JSON.stringify(observations)),
    writeFile(markerPath, JSON.stringify(marker)),
    writeFile(runPath, JSON.stringify(hostileRun)),
  ]);

  await expect(execFileAsync(process.execPath, [
    script,
    '--check-acceptance-marker', markerPath,
    '--deployment', deploymentPath,
    '--expected-mode', 'prelaunch-test',
  ])).resolves.toBeDefined();
  await expect(execFileAsync(process.execPath, [
    script,
    '--merge-acceptance-evidence', observationsPath,
    '--deployment-run', runPath,
    '--marker', markerPath,
    '--output', outputPath,
  ])).resolves.toBeDefined();
  const merged = JSON.parse((await readFile(outputPath, 'utf8')).match(new RegExp(`<!-- ${RENAME_MAP.slug}-evidence\\n(.+)\\n-->`, 'su'))?.[1] ?? '');
  expect(merged).toMatchObject({
    kind: 'acceptance',
    hostile_matrix: hostileRun.hostile_matrix,
    fixture_manifest: hostileRun.fixture_manifest,
    acceptance_marker: { status: 'interactive-matrix-complete' },
  });
  const duplicateManifestRun = structuredClone(hostileRun);
  const duplicated = duplicateManifestRun.fixture_manifest['auth.users'].handles[0];
  duplicateManifestRun.fixture_manifest['auth.users'] = { count: 2, handles: [duplicated, duplicated] };
  duplicateManifestRun.artifacts.evidence_sha256 = '';
  duplicateManifestRun.artifacts.evidence_sha256 = hash(JSON.stringify(duplicateManifestRun));
  await writeFile(runPath, JSON.stringify(duplicateManifestRun));
  await reject([
    '--merge-acceptance-evidence', observationsPath,
    '--deployment-run', runPath,
    '--marker', markerPath,
    '--output', outputPath,
  ], 'evidence fixture manifest is invalid');
});

test('exact cleanup evidence requires the approved manifest, repeated zero, and immutable lineage', async ({}, testInfo) => {
  const deploymentPath = testInfo.outputPath('deployment.json');
  const acceptancePath = testInfo.outputPath('acceptance.json');
  const { acceptance, empty } = await writeSyntheticAcceptance(deploymentPath, acceptancePath);
  const record = cleanupRecord(acceptance, empty);
  const evidencePath = testInfo.outputPath('cleanup.json');
  const args = [
    '--check-run-evidence', evidencePath,
    '--deployment', deploymentPath,
    '--expected-mode', 'prelaunch-test',
    '--acceptance', acceptancePath,
    '--require-exact-cleanup',
    '--require-zero-authority',
    '--require-immutable-run',
  ];

  await writeRunEvidence(evidencePath, record);
  await expect(execFileAsync(process.execPath, [script, ...args])).resolves.toBeDefined();

  const extra = structuredClone(record);
  extra.authority_before['auth.users'].handles.push('f'.repeat(64));
  extra.authority_before['auth.users'].handles.sort();
  extra.authority_before['auth.users'].count += 1;
  await writeRunEvidence(evidencePath, extra);
  await reject(args, 'evidence cleanup manifest does not match acceptance');

  const missing = structuredClone(record);
  missing.deleted['auth.users'].handles.pop();
  missing.deleted['auth.users'].count -= 1;
  await writeRunEvidence(evidencePath, missing);
  await reject(args, 'evidence cleanup manifest does not match acceptance');

  const duplicate = structuredClone(record);
  duplicate.deleted['auth.users'].handles[1] = duplicate.deleted['auth.users'].handles[0];
  await writeRunEvidence(evidencePath, duplicate);
  await reject(args, 'evidence fixture manifest is invalid');

  const nonzero = structuredClone(record);
  nonzero.authority_confirmation['auth.users'] = { count: 1, handles: ['e'.repeat(64)] };
  await writeRunEvidence(evidencePath, nonzero);
  await reject(args, 'evidence authority is not zero');

  const wrongRun = structuredClone(record);
  wrongRun.acceptance.run_id = '999';
  await writeRunEvidence(evidencePath, wrongRun);
  await reject(args, 'evidence cleanup lineage does not match acceptance');
});

test('promotion evidence binds complete cleanup and live artifacts', async ({}, testInfo) => {
  const deploymentPath = testInfo.outputPath('deployment.json');
  const acceptancePath = testInfo.outputPath('acceptance.json');
  const { acceptance, empty } = await writeSyntheticAcceptance(deploymentPath, acceptancePath);
  const cleanup = cleanupRecord(acceptance, empty);
  const cleanupPath = testInfo.outputPath('cleanup.json');
  await writeRunEvidence(cleanupPath, cleanup);
  const live = {
    version: 1,
    kind: 'deployment-run',
    status: 'passed',
    mode: 'production-live',
    fingerprint,
    public_origin: origin,
    run: { id: '103', url: 'https://github.com/example/repo/actions/runs/103', commit: 'd'.repeat(40), immutable: true },
    order: ['schema', 'auth-provider-configuration', 'edge-function-secrets', 'support-api', 'support-flow', 'stripe-webhook'],
    routes,
    authority: empty,
    authority_before: empty,
    coherence: { status: 'passed' },
    live_smoke: { status: 'passed', non_destructive: true },
    artifacts: { evidence_sha256: '' },
  };
  await writeRunEvidence(testInfo.outputPath('live.json'), live);
  const record = {
    version: 1,
    kind: 'promotion',
    status: 'passed',
    mode: 'production-live',
    fingerprint,
    public_origin: origin,
    run: live.run,
    authority: live.authority,
    cleanup,
    live,
    cleanup_run: {
      ...cleanup.run,
      fingerprint: cleanup.fingerprint,
      status: cleanup.status,
      authority_after: 'zero',
      evidence_sha256: cleanup.artifacts.evidence_sha256,
    },
    live_run: {
      ...live.run,
      fingerprint: live.fingerprint,
      status: live.status,
      evidence_sha256: live.artifacts.evidence_sha256,
    },
    artifacts: {
      cleanup_evidence_sha256: cleanup.artifacts.evidence_sha256,
      live_evidence_sha256: live.artifacts.evidence_sha256,
    },
    live_smoke: live.live_smoke,
  };
  const promotionPath = testInfo.outputPath('promotion.json');
  await writeFile(promotionPath, JSON.stringify(record));
  const args = [
    '--check-promotion-evidence', promotionPath,
    '--deployment', deploymentPath,
    '--acceptance', acceptancePath,
    '--require-cleanup-run',
    '--require-live-run',
    '--require-one-fingerprint',
    '--require-zero-authority',
    '--non-destructive',
    '--require-immutable-runs',
  ];
  await expect(execFileAsync(process.execPath, [script, ...args])).resolves.toBeDefined();

  record.cleanup_run.id = '999';
  await writeFile(promotionPath, JSON.stringify(record));
  await reject(args, 'promotion artifact lineage does not match');
});
