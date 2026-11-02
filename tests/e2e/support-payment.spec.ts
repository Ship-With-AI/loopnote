import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const execFileAsync = promisify(execFile);
const script = new URL('../../scripts/verify-supabase-support.mjs', import.meta.url).pathname;

async function reject(args: string[], message: string) {
  await expect(execFileAsync(process.execPath, [script, ...args])).rejects.toMatchObject({
    stderr: expect.stringContaining(message),
  });
}

test('the CI verifier rejects malformed and retired routing options', async ({}, testInfo) => {
  const workflow = testInfo.outputPath('workflow.yml');
  await writeFile(workflow, 'name: unsafe\non: workflow_dispatch\n');

  await reject(['--deploy'], 'unknown option --deploy');
  await reject(['--verify-workflow'], 'missing value --verify-workflow');
  await reject([
    '--run-deployment',
    '--mode',
    'prelaunch-test',
    '--evidence',
    testInfo.outputPath('deployment.json'),
  ], 'hosted deployment is CI-only');
  await reject(['--verify-workflow', workflow, '--require-environment'], 'missing value --require-environment');
  await reject(['--verify-workflow', workflow, '--require-environment', 'production', '--require-environment', 'production'], 'duplicate option --require-environment');
  await reject(['--verify-workflow', workflow, '--expected-mode', 'invalid'], 'invalid expected mode');
  await reject(['--verify-workflow', workflow, '--unknown'], 'unknown option --unknown');
  await reject(['--verify-workflow', workflow, '--require-custom-domain'], 'unknown option --require-custom-domain');
});

test('run evidence validation permits only canonical default-origin routes and fails closed', async ({}, testInfo) => {
  const evidence = testInfo.outputPath('evidence.json');
  const fingerprint = 'dd65eea0329dcb94b17187af9dff28c31a1d78026737a16af75979a1fa4618e5';
  const origin = 'https://abcdefghijklmnopqrst.supabase.co';
  const base = {
    version: 99,
    kind: 'deployment-run',
    mode: 'prelaunch-test',
    run: { id: 'run', url: 'https://github.com/example/run', commit: 'a'.repeat(40), immutable: true },
    fingerprint,
    public_origin: origin,
  };

  await writeFile(evidence, JSON.stringify(base));
  await reject(['--check-run-evidence', evidence], 'missing required option --expected-mode');
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test', '--expected-mode', 'prelaunch-test'], 'duplicate option --expected-mode');
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test', '--require-immutable-run', '--require-immutable-run'], 'duplicate option --require-immutable-run');
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test', '--require-exact-cleanup', '--acceptance'], 'missing value --acceptance');
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test'], 'evidence version must be 1');

  await writeFile(evidence, JSON.stringify({ ...base, release_label: 'abcdefghijklmnopqrst' }));
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test'], 'evidence contains protected or raw content');
  await writeFile(evidence, JSON.stringify({ ...base, release_url: 'https://otherprojectabcdefgh.supabase.co/functions/v1/support-api' }));
  await reject(['--check-run-evidence', evidence, '--expected-mode', 'prelaunch-test'], 'evidence contains protected or raw content');
});
test('deployment accepts hosted response contracts without losing redacted errors', async ({}, testInfo) => {
  const projectRef = 'a'.repeat(20);
  const bin = testInfo.outputPath('bin');
  const npx = join(bin, 'npx');
  const fetchHook = testInfo.outputPath('fetch-hook.mjs');
  await mkdir(bin, { recursive: true });
  await writeFile(npx, `#!/usr/bin/env node
const actual = process.argv.slice(2);
const projectRef = process.env.SUPABASE_PROJECT_REF;
const database = JSON.stringify(['supabase@2.114.0', 'db', 'push', '--project-ref', projectRef]);
const functions = ['support-api', 'support-flow', 'stripe-webhook'];
const functionDeployment = actual.length === 9 && actual[0] === 'supabase@2.114.0' && actual[1] === 'functions' && actual[2] === 'deploy' && functions.includes(actual[3]) && actual[4] === '--project-ref' && actual[5] === projectRef && actual[6] === '--use-api' && actual[7] === '--import-map' && actual[8] === 'supabase/functions/deno.json';
if (JSON.stringify(actual) !== database && !functionDeployment) {
  console.error(\`unexpected npx arguments: \${JSON.stringify(actual)}\`);
  process.exit(92);
}
`);
  await chmod(npx, 0o755);
  await writeFile(fetchHook, [
    'let calls = 0;',
    'globalThis.fetch = async (_url, options = {}) => {',
    "  if (++calls === 1) return new Response('{}');",
    '  if (calls === 2) {',
    '    const actual = JSON.parse(options.body);',
    '    const expected = [',
    "      { name: 'STRIPE_SECRET_KEY', value: process.env.STRIPE_SECRET_KEY },",
    "      { name: 'STRIPE_WEBHOOK_SECRET', value: process.env.STRIPE_WEBHOOK_SECRET },",
    "      { name: 'STRIPE_PRICE_ID', value: process.env.STRIPE_PRICE_ID },",
    '    ];',
    "    if (JSON.stringify(actual) !== JSON.stringify(expected)) return new Response(JSON.stringify({ message: `unexpected secrets payload ${process.env.SUPABASE_DB_PASSWORD}` }), { status: 400 });",
    '    return new Response(null, { status: 201 });',
    '  }',
    "  if (calls === 3) return new Response('[]');",
    "  if (calls === 4) return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } });",
    "  if (calls === 5) return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } });",
    "  if (calls === 6) return new Response('', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });",
    "  if (calls === 7) return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } });",
    '  return new Response(JSON.stringify({ message: `route probes accepted ${process.env.SUPABASE_DB_PASSWORD}` }), { status: 400 });',
    '};',
    '',
  ].join('\n'));

  const failure = await execFileAsync(process.execPath, [
    script,
    '--run-deployment',
    '--mode',
    'prelaunch-test',
    '--evidence',
    testInfo.outputPath('deployment.json'),
  ], {
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      NODE_OPTIONS: `--import=${pathToFileURL(fetchHook).href}`,
      GITHUB_ACTIONS: 'true',
      [`${RENAME_MAP.envPrefix}DEPLOYMENT_ENVIRONMENT`]: 'production',
      SUPPORT_PROVIDER_MODE: 'prelaunch-test',
      SUPABASE_ACCESS_TOKEN: 'token',
      SUPABASE_PROJECT_REF: projectRef,
      SUPABASE_DB_PASSWORD: 'sensitive-db-value',
      SUPABASE_GITHUB_CLIENT_ID: 'client-id',
      SUPABASE_GITHUB_CLIENT_SECRET: 'client-secret',
      STRIPE_SECRET_KEY: 'stripe-secret',
      STRIPE_WEBHOOK_SECRET: 'webhook-secret',
      STRIPE_PRICE_ID: 'price',
      STRIPE_WEBHOOK_ENDPOINT_ID: 'endpoint',
    },
  }).then(() => undefined, (error: { stderr: string }) => error);

  expect(failure?.stderr).toContain('HTTP 400: {"message":"route probes accepted [redacted]"}');
  expect(failure?.stderr).not.toContain('sensitive-db-value');
});

test('live deployment accepts unchanged populated authority and rejects changed authority', async ({}, testInfo) => {
  const projectRef = 'a'.repeat(20);
  const origin = `https://${projectRef}.supabase.co`;
  const bin = testInfo.outputPath('live-bin');
  const npx = join(bin, 'npx');
  const fetchHook = testInfo.outputPath('live-fetch-hook.mjs');
  const evidence = testInfo.outputPath('live-deployment.json');
  await mkdir(bin, { recursive: true });
  await writeFile(npx, '#!/usr/bin/env node\n');
  await chmod(npx, 0o755);
  await writeFile(fetchHook, `
let authorityCalls = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('/database/query')) {
    authorityCalls += 1;
    const populated = process.env.POPULATED === 'true' || (process.env.CHANGED === 'true' && authorityCalls > 1);
    return new Response(JSON.stringify(populated ? [{ table_name: 'auth.users', id: '11111111-1111-4111-8111-111111111111' }] : []));
  }
  if (url === 'https://api.stripe.com/v1/prices/price_live') return new Response(JSON.stringify({ object: 'price', active: true, livemode: true, currency: 'usd', unit_amount: 4999, type: 'one_time' }));
  if (url === 'https://api.stripe.com/v1/webhook_endpoints/we_live') return new Response(JSON.stringify({ object: 'webhook_endpoint', status: 'enabled', livemode: true, url: '${origin}/functions/v1/stripe-webhook', enabled_events: process.env.BAD_ENDPOINT === 'true' ? ['checkout.session.completed'] : ['checkout.session.completed', 'checkout.session.async_payment_succeeded'] }));
  if (url.includes('/config/auth')) return new Response('{}');
  if (url.includes('/secrets')) return new Response(null, { status: 201 });
  if (url.includes('/auth/v1/settings')) return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } });
  if (url.includes('/support-api/status?')) return new Response('{"status":"unverified"}', { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/support-api')) return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/support-flow')) return new Response('', { status: 400, headers: { 'content-type': 'text/plain' } });
  if (url.endsWith('/stripe-webhook')) return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } });
  throw new Error('unexpected hosted request');
};
`);
  const environment = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    NODE_OPTIONS: `--import=${pathToFileURL(fetchHook).href}`,
    GITHUB_ACTIONS: 'true',
    [`${RENAME_MAP.envPrefix}DEPLOYMENT_ENVIRONMENT`]: 'production',
    SUPPORT_PROVIDER_MODE: 'production-live',
    SUPABASE_ACCESS_TOKEN: 'token',
    SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_DB_PASSWORD: 'database-password',
    SUPABASE_GITHUB_CLIENT_ID: 'github-client',
    SUPABASE_GITHUB_CLIENT_SECRET: 'github-secret',
    STRIPE_SECRET_KEY: `sk${'_'}live_example`,
    STRIPE_WEBHOOK_SECRET: `whsec${'_'}example`,
    STRIPE_PRICE_ID: 'price_live',
    STRIPE_WEBHOOK_ENDPOINT_ID: 'we_live',
    GITHUB_RUN_ID: '200',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'example/repo',
    GITHUB_SHA: 'd'.repeat(40),
  };
  const args = ['--run-deployment', '--mode', 'production-live', '--evidence', evidence];

  await expect(execFileAsync(process.execPath, [script, ...args], { env: environment })).resolves.toBeDefined();
  expect(JSON.parse(await readFile(evidence, 'utf8'))).toMatchObject({
    mode: 'production-live',
    coherence: { status: 'passed' },
    live_smoke: { status: 'passed', non_destructive: true },
  });
  await expect(execFileAsync(process.execPath, [script, ...args], {
    env: { ...environment, POPULATED: 'true' },
  })).resolves.toBeDefined();
  expect(JSON.parse(await readFile(evidence, 'utf8'))).toMatchObject({
    coherence: { status: 'passed' },
    live_smoke: { status: 'passed', non_destructive: true },
    authority: { 'auth.users': { count: 1 } },
  });
  await expect(execFileAsync(process.execPath, [script, ...args], {
    env: { ...environment, CHANGED: 'true' },
  })).rejects.toMatchObject({ stderr: expect.stringContaining('live deployment changed authority rows') });
  await expect(execFileAsync(process.execPath, [script, ...args], {
    env: { ...environment, BAD_ENDPOINT: 'true' },
  })).rejects.toMatchObject({ stderr: expect.stringContaining('live Stripe coherence failed: endpoint-events') });
});


test('workflow verification rejects toolchain, database-order, and retired-input regressions', async ({}, testInfo) => {
  const source = await readFile(new URL('../../.github/workflows/deploy-supabase-production.yml', import.meta.url), 'utf8');
  const cases: Array<[string, string, string, string]> = [
    ['node', 'node-version: 24', 'node-version: 22', 'workflow is missing required'],
    ['deno', 'deno-version: v2.7.14', 'deno-version: v2.7.13', 'workflow is missing required'],
    ['install', 'npm ci', 'npm install', 'workflow is missing required'],
    ['test typecheck', 'npm run typecheck:tests', 'npm run typecheck:tests:web', 'workflow is missing required'],
    ['build', 'npm run build', 'npm run build:runtime', 'workflow is missing required'],
    ['browser install', 'npx playwright install --with-deps chromium', 'npx playwright install chromium', 'workflow is missing required'],
    ['vitest', 'npx vitest run --no-file-parallelism', 'npx vitest run --no-file-parallelism tests/unit', 'workflow is missing required'],
    ['playwright', 'npx playwright test', 'npx playwright test tests/e2e/support-payment.spec.ts', 'workflow is missing required'],
    ['deno suite', 'deno test --allow-env --config supabase/functions/deno.json supabase/functions/tests', 'deno test supabase/functions/tests', 'workflow is missing required'],
    ['Supabase pin', 'npx supabase@2.114.0 db start', 'npx supabase db start', 'workflow is missing required'],
    ['project ref', 'SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}', 'SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}', 'workflow does not map the protected project ref'],
    ['stored origin', 'STRIPE_PRICE_ID: ${{ vars.STRIPE_PRICE_ID }}', 'SUPPORT_PUBLIC_ORIGIN: ${{ vars.SUPPORT_PUBLIC_ORIGIN }}', 'workflow contains forbidden retired input'],
    ['configured fingerprint', 'STRIPE_PRICE_ID: ${{ vars.STRIPE_PRICE_ID }}', 'APPROVED_SUPABASE_PROJECT_REF_SHA256: ${{ vars.APPROVED_SUPABASE_PROJECT_REF_SHA256 }}', 'workflow contains forbidden retired input'],
    ['domain command', 'node scripts/verify-supabase-support.mjs "${args[@]}"', 'npx supabase@2.114.0 domains activate --project-ref "$SUPABASE_PROJECT_REF"', 'workflow contains forbidden domain lifecycle'],
    ['cleanup evidence', '02-09-ACCEPTANCE-EVIDENCE.md', '02-09-ACCEPTANCE-MARKER.json', 'workflow is missing required'],
    ['cleanup branch', 'args+=(--acceptance "$acceptance")', 'args+=(--acceptance-marker "$acceptance")', 'workflow is missing required'],
    ['live branch', 'production-live', 'production-staging', 'workflow is missing required'],
  ];
  for (const [name, expected, replacement, message] of cases) {
    const workflow = testInfo.outputPath(`${name}.yml`);
    await writeFile(workflow, source.replace(expected, replacement));
    await reject(['--verify-workflow', workflow], message);
  }
  const reordered = testInfo.outputPath('reordered.yml');
  await writeFile(reordered, source.replace(
    'npx supabase@2.114.0 db start\n      - run: npx supabase@2.114.0 db reset --local --no-seed',
    'npx supabase@2.114.0 db reset --local --no-seed\n      - run: npx supabase@2.114.0 db start',
  ));
  await reject(['--verify-workflow', reordered], 'workflow database gates are out of order');
  const testsReordered = testInfo.outputPath('tests-reordered.yml');
  await writeFile(testsReordered, source.replace(
    'npx playwright install --with-deps chromium\n      - run: npx vitest run --no-file-parallelism',
    'npx vitest run --no-file-parallelism\n      - run: npx playwright install --with-deps chromium',
  ));
  await reject(['--verify-workflow', testsReordered], 'workflow test gates are out of order');
  const deployWithoutInstall = testInfo.outputPath('deploy-without-install.yml');
  await writeFile(deployWithoutInstall, source.replace(
    /(deploy-production:[\s\S]*?)      - run: npm ci\n/u,
    '$1',
  ));
  await expect(execFileAsync(process.execPath, [script, '--verify-workflow', deployWithoutInstall])).rejects.toMatchObject({ code: 1 });
});

test('acceptance markers reject browser observations not covered by their digest', async ({}, testInfo) => {
  const projectRef = 'a'.repeat(20);
  const publicOrigin = `https://${projectRef}.supabase.co`;
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
  const marker = testInfo.outputPath('marker.json');
  const deployment = testInfo.outputPath('deployment.json');
  await writeFile(marker, JSON.stringify({
    version: 1,
    kind: 'acceptance-marker',
    mode: 'prelaunch-test',
    fingerprint: createHash('sha256').update(projectRef).digest('hex'),
    public_origin: publicOrigin,
    run: { id: '100', url: 'https://github.com/example/repo/actions/runs/100', commit: 'b'.repeat(40), immutable: true },
    routes: {
      'auth-settings': { status: 401, content_type: 'application/json' },
      'support-api-invalid-input': { status: 400, content_type: 'application/json' },
      'support-flow-invalid-state': { status: 400, content_type: 'text/plain' },
      'stripe-webhook-invalid-signature': { status: 400, content_type: 'application/json' },
    },
    acceptance_marker: {
      status: 'interactive-matrix-complete',
      deployment_evidence_sha256: '1'.repeat(64),
      observations_sha256: '2'.repeat(64),
    },
    observations,
  }));
  await writeFile(deployment, '{}');

  await reject([
    '--check-acceptance-marker', marker,
    '--deployment', deployment,
    '--expected-mode', 'prelaunch-test',
  ], 'acceptance marker observations digest does not match');
});


test('local security collector rejects hosted and retired configuration before running', async ({}, testInfo) => {
  await expect(execFileAsync(process.execPath, [
    script,
    '--local-package-security-review',
    '--output',
    testInfo.outputPath('02-17-LOCAL-PACKAGE-SECURITY-EVIDENCE.md'),
  ], {
    env: { ...process.env, SUPPORT_PUBLIC_ORIGIN: 'https://example.invalid' },
  })).rejects.toMatchObject({
    stderr: expect.stringContaining('local package security review forbids SUPPORT_PUBLIC_ORIGIN'),
  });
});

test('final review rejects the former five-input contract and binds six immutable records', async ({}, testInfo) => {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const writeRecord = async (path: string, record: object) => {
    const serialized = JSON.stringify(record);
    await writeFile(path, serialized);
    return { serialized, sha256: hash(serialized) };
  };
  const bindDigest = (record: { artifacts: { evidence_sha256: string } }) => {
    record.artifacts.evidence_sha256 = '';
    record.artifacts.evidence_sha256 = hash(JSON.stringify(record));
  };
  const projectRef = 'abcdefghijklmnopqrst';
  const fingerprint = hash(projectRef);
  const origin = `https://${projectRef}.supabase.co`;
  const tables = [
    'auth.users',
    'support_private.support_intents',
    'support_private.supporters',
    'support_private.checkout_sessions',
    'support_private.stripe_events',
    'support_private.installation_bindings',
  ];
  const manifest = (populated: string[] = []) => Object.fromEntries(tables.map((table) => [
    table,
    { count: populated.includes(table) ? 1 : 0, handles: populated.includes(table) ? [hash(table)] : [] },
  ]));
  const routes = {
    'auth-settings': { status: 401, content_type: 'application/json' },
    'support-api-invalid-input': { status: 400, content_type: 'application/json' },
    'support-flow-invalid-state': { status: 400, content_type: 'text/plain' },
    'stripe-webhook-invalid-signature': { status: 400, content_type: 'application/json' },
  };
  const deploymentPath = testInfo.outputPath('test-deployment.json');
  const observationsPath = testInfo.outputPath('observations.json');
  const markerPath = testInfo.outputPath('acceptance-marker.json');
  const hostileRunPath = testInfo.outputPath('hostile-run.json');
  const acceptancePath = testInfo.outputPath('acceptance.json');
  const cleanupPath = testInfo.outputPath('cleanup.json');
  const livePath = testInfo.outputPath('live.json');
  const promotionPath = testInfo.outputPath('promotion.json');
  const retirementPath = testInfo.outputPath('retirement.json');
  const packagePath = testInfo.outputPath('package.json');
  const releasePath = testInfo.outputPath('release.json');
  const local = testInfo.outputPath('02-17-LOCAL-PACKAGE-SECURITY-EVIDENCE.md');
  const deployment = {
    version: 1,
    kind: 'deployment-run',
    status: 'passed',
    mode: 'prelaunch-test',
    fingerprint,
    public_origin: origin,
    run: { id: '100', url: 'https://github.com/example/repository/actions/runs/100', commit: 'a'.repeat(40), immutable: true },
    order: ['schema', 'auth-provider-configuration', 'edge-function-secrets', 'support-api', 'support-flow', 'stripe-webhook'],
    routes,
    authority: manifest(),
    artifacts: { evidence_sha256: '' },
  };
  bindDigest(deployment);
  const deploymentPayload = await writeRecord(deploymentPath, deployment);
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
  const observationsPayload = await writeRecord(observationsPath, observations);
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
      observations_sha256: observationsPayload.sha256,
    },
    observations,
  };
  const markerPayload = await writeRecord(markerPath, marker);
  const rejected = manifest();
  const settled = manifest([
    'support_private.supporters',
    'support_private.stripe_events',
    'support_private.installation_bindings',
  ]);
  const hostileMatrix: Array<Record<string, unknown>> = [
    'wrong-signature',
    'wrong-product',
    'wrong-amount',
    'wrong-currency',
    'wrong-binding',
    'expired-intent',
    'reused-intent',
  ].map((id, index) => ({
    id,
    fixtures: [(index + 1).toString(16).padStart(64, '0')],
    before: rejected,
    after: rejected,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  }));
  hostileMatrix.push({
    id: 'sequential-replay',
    fixtures: ['8'.padStart(64, '0')],
    before: rejected,
    after: settled,
    expected: 'idempotent-replay',
    actual: 'idempotent-replay',
    guard: true,
    responses: [200, 200],
    first_after: settled,
  });
  hostileMatrix.push({
    id: 'concurrent-replay-settlement',
    fixtures: ['9'.padStart(64, '0')],
    before: rejected,
    after: settled,
    expected: 'single-authority-settlement',
    actual: 'single-authority-settlement',
    guard: true,
    responses: [200, 503],
  });
  const hostileRun = {
    ...deployment,
    run: { id: '101', url: 'https://github.com/example/repository/actions/runs/101', commit: 'b'.repeat(40), immutable: true },
    hostile_matrix: hostileMatrix,
    fixture_manifest: settled,
    acceptance_marker: { ...marker.acceptance_marker, marker_sha256: markerPayload.sha256 },
    artifacts: { evidence_sha256: '' },
  };
  bindDigest(hostileRun);
  await writeRecord(hostileRunPath, hostileRun);
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
    fixture_manifest: settled,
    artifacts: {
      deployment_evidence_sha256: deployment.artifacts.evidence_sha256,
      hostile_run_evidence_sha256: hostileRun.artifacts.evidence_sha256,
      marker_sha256: markerPayload.sha256,
    },
    approval: { status: 'approved' },
  };
  const acceptancePayload = await writeRecord(acceptancePath, acceptance);
  const cleanup = {
    version: 1,
    kind: 'deployment-run',
    status: 'passed',
    mode: 'prelaunch-test',
    operation: 'exact-cleanup',
    fingerprint,
    public_origin: origin,
    run: { id: '102', url: 'https://github.com/example/repository/actions/runs/102', commit: 'c'.repeat(40), immutable: true },
    order: [
      'delete:support_private.stripe_events',
      'delete:support_private.installation_bindings',
      'delete:support_private.supporters',
      'delete:support_private.checkout_sessions',
      'delete:support_private.support_intents',
      'delete:auth.users',
    ],
    routes,
    authority_before: settled,
    deleted: settled,
    authority: manifest(),
    authority_confirmation: manifest(),
    acceptance: {
      run_id: acceptance.run.id,
      run_evidence_sha256: acceptance.artifacts.hostile_run_evidence_sha256,
      record_sha256: acceptancePayload.sha256,
    },
    artifacts: { evidence_sha256: '' },
  };
  bindDigest(cleanup);
  await writeRecord(cleanupPath, cleanup);
  const live = {
    ...deployment,
    mode: 'production-live',
    run: { id: '103', url: 'https://github.com/example/repository/actions/runs/103', commit: 'd'.repeat(40), immutable: true },
    coherence: { status: 'passed' },
    live_smoke: { status: 'passed', non_destructive: true },
    artifacts: { evidence_sha256: '' },
    authority_before: manifest(),
  };
  bindDigest(live);
  await writeRecord(livePath, live);
  const promotion = {
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
    live_smoke: live.live_smoke,
    artifacts: {
      cleanup_evidence_sha256: cleanup.artifacts.evidence_sha256,
      live_evidence_sha256: live.artifacts.evidence_sha256,
    },
  };
  const promotionPayload = await writeRecord(promotionPath, promotion);
  const retirement = {
    version: 1,
    kind: 'retirement-review',
    status: 'passed',
    configured_absent: true,
    violations: [],
    artifacts: { evidence_sha256: '' },
  };
  bindDigest(retirement);
  const retirementPayload = await writeRecord(retirementPath, retirement);
  const packagePayload = await writeRecord(packagePath, { name: 'synthetic-package', version: '1.0.0' });
  const release = {
    version: 1,
    kind: 'release',
    status: 'passed',
    mode: 'production-live',
    fingerprint,
    public_origin: origin,
    run: live.run,
    routes,
    route_probes: routes,
    authority_before: manifest(),
    authority_after: manifest(),
    non_destructive: true,
    artifacts: {
      promotion_evidence_sha256: promotionPayload.sha256,
      retirement_evidence_sha256: retirementPayload.sha256,
      deployment_evidence_sha256: deploymentPayload.sha256,
      package_sha256: packagePayload.sha256,
      evidence_sha256: '',
    },
  };
  bindDigest(release);
  const releasePayload = await writeRecord(releasePath, release);
  await writeRecord(testInfo.outputPath('02-16-RELEASE-APPROVAL.md'), {
    version: 1,
    kind: `${RENAME_MAP.kindPrefix}.release-approval`,
    status: 'approved',
    release_record_sha256: releasePayload.sha256,
    run_id: release.run.id,
    package_sha256: packagePayload.sha256,
  });
  const commandIds = [
    'vitest', 'playwright', 'database-start', 'database-reset-1', 'database-test-1',
    'database-migrations-1', 'database-lint-1', 'database-reset-2', 'database-test-2',
    'database-migrations-2', 'database-lint-2', 'deno',
  ];
  const localRecord = {
    version: 1,
    kind: 'local-package-security',
    status: 'passed',
    configured_absent: true,
    database_cycles: 2,
    commands: commandIds.map((id) => ({
      id,
      status: 'passed',
      command_sha256: hash(`command:${id}`),
      output_sha256: hash(`output:${id}`),
    })),
    artifacts: { evidence_sha256: '' },
  };
  bindDigest(localRecord);
  await writeRecord(local, localRecord);
  const flags = [
    '--test-deployment', deploymentPath,
    '--acceptance', acceptancePath,
    '--promotion', promotionPath,
    '--retirement', retirementPath,
    '--release', releasePath,
  ];
  await reject(['--final-review', ...flags, '--output', testInfo.outputPath('five.json')], 'missing required option --local-package-security');
  const final = testInfo.outputPath('02-17-FINAL-EVIDENCE.md');
  const complete = ['--local-package-security', local];
  await expect(execFileAsync(process.execPath, [script, '--final-review', ...flags, ...complete, '--output', final])).resolves.toBeDefined();
  await expect(execFileAsync(process.execPath, [script, '--check-final', final, ...flags, ...complete])).resolves.toBeDefined();
  await writeRecord(local, { ...localRecord, status: 'failed' });
  await reject(['--check-final', final, ...flags, ...complete], 'final local-package-security record is invalid');
  await writeRecord(local, {
    ...localRecord,
    artifacts: { evidence_sha256: '0'.repeat(64) },
  });
  await reject(['--check-final', final, ...flags, ...complete], 'final local-package-security digest binding is invalid');
});
