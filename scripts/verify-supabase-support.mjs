import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import renameMap from './rename-map.json' with { type: 'json' };

const EVIDENCE_VERSION = 1;
const MANAGEMENT_ORIGIN = 'https://api.supabase.com';
// v1.4 milestone archive, not `.planning/phases/`: the phase directory was deleted when v1.4
// closed, which left this path dangling and hard-failed prelaunch-test deployments.
const PRELAUNCH_DEPLOYMENT_EVIDENCE = '.planning/milestones/v1.4-phases/02-move-the-implementation-to-supabase/02-08-TEST-DEPLOYMENT-EVIDENCE.md';
const TABLES = [
  ['auth.users', 'id'],
  ['support_private.support_intents', 'id'],
  ['support_private.supporters', 'user_id'],
  ['support_private.checkout_sessions', 'id'],
  ['support_private.stripe_events', 'stripe_event_id'],
  ['support_private.installation_bindings', 'installation_id'],
];
const CLEANUP_TABLES = [
  ['support_private.stripe_events', 'stripe_event_id'],
  ['support_private.installation_bindings', 'installation_id'],
  ['support_private.supporters', 'user_id'],
  ['support_private.checkout_sessions', 'id'],
  ['support_private.support_intents', 'id'],
  ['auth.users', 'id'],
];
const HOSTILE_CASES = [
  'wrong-signature',
  'wrong-product',
  'wrong-amount',
  'wrong-currency',
  'wrong-binding',
  'expired-intent',
  'reused-intent',
  'sequential-replay',
  'concurrent-replay-settlement',
];
const BROWSER_CASES = [
  'paid-support',
  'restart-persistence',
  'restore-paid-one',
  'restore-paid-two',
  'restore-unpaid',
  'checkout-delay',
  'checkout-cancellation',
];
const MODES = new Set(['prelaunch-test', 'production-live']);
const PROTECTED_INPUTS = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_GITHUB_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPPORT_PROVIDER_MODE',
  'SUPABASE_GITHUB_CLIENT_ID',
  'STRIPE_PRICE_ID',
  'STRIPE_WEBHOOK_ENDPOINT_ID',
];
const RAW_VALUE_KEY = /(?:^|_)(?:access_token|secret|password|project_ref|client_id|oauth|email|provider|token)(?:$|_)/iu;
const RETIRED_INPUTS = [
  'SUPPORT_PUBLIC_ORIGIN',
  'SUPABASE_SITE_URL',
  'SUPABASE_REDIRECT_URL',
  'SUPABASE_GITHUB_CALLBACK_URL',
  'STRIPE_WEBHOOK_URL',
  'APPROVED_SUPABASE_PROJECT_REF_SHA256',
];

function fail(message) {
  throw new Error(message);
}
class HostedRequestError extends Error {
  constructor(status, context, detail = '') {
    super(`${context} failed with HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.status = status;
    this.detail = detail;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

function isHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function canonicalOrigin(projectRef) {
  if (typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/u.test(projectRef)) fail('SUPABASE_PROJECT_REF must be a complete Supabase project ref');
  return `https://${projectRef}.supabase.co`;
}

function canonicalOriginPolicy(origin) {
  let url;
  try {
    url = new URL(requireString(origin, 'public_origin'));
  } catch {
    fail('public_origin must be a canonical Supabase origin');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !url.hostname.endsWith('.supabase.co')) {
    fail('public_origin must be a canonical Supabase origin');
  }
  const projectRef = url.hostname.slice(0, -'.supabase.co'.length);
  if (canonicalOrigin(projectRef) !== url.origin) fail('public_origin must be a canonical Supabase origin');
  const routes = publicRoutes(url.origin);
  return { origin: url.origin, projectRef, allowed: new Set([url.origin, ...Object.values(routes)]) };
}

function publicRoutes(origin) {
  const base = canonicalOriginPolicyOrigin(origin);
  return {
    authCallback: `${base}/auth/v1/callback`,
    supportApi: `${base}/functions/v1/support-api`,
    supportFlow: `${base}/functions/v1/support-flow`,
    supportFlowCallback: `${base}/functions/v1/support-flow/callback`,
    supportFlowComplete: `${base}/functions/v1/support-flow/complete`,
    stripeWebhook: `${base}/functions/v1/stripe-webhook`,
  };
}

function canonicalOriginPolicyOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    fail('canonical origin is invalid');
  }
  const projectRef = url.hostname.slice(0, -'.supabase.co'.length);
  if (canonicalOrigin(projectRef) !== url.origin) fail('canonical origin is invalid');
  return url.origin;
}

const commandDefinitions = {
  '--verify-workflow': {
    values: new Set(['--verify-workflow', '--require-environment', '--expected-mode']),
    flags: new Set(),
  },
  '--check-release-evidence': {
    values: new Set(['--check-release-evidence', '--live-promotion', '--retirement']),
    flags: new Set(['--require-approved', '--require-immutable-run', '--require-package-digest', '--require-zero-authority', '--non-destructive']),
    required: ['--check-release-evidence', '--live-promotion', '--retirement'],
  },
  '--check-run-evidence': {
    values: new Set(['--check-run-evidence', '--expected-mode', '--acceptance', '--deployment']),
    flags: new Set(['--require-immutable-run', '--require-zero-authority', '--require-exact-cleanup']),
    required: ['--expected-mode'],
  },
  '--check-acceptance-evidence': {
    values: new Set(['--check-acceptance-evidence', '--deployment']),
    flags: new Set(['--require-hostile-matrix', '--require-fixture-manifest', '--require-immutable-run', '--require-approved']),
    required: ['--deployment'],
  },
  '--check-acceptance-marker': {
    values: new Set(['--check-acceptance-marker', '--deployment', '--expected-mode']),
    flags: new Set(),
    required: ['--deployment', '--expected-mode'],
  },
  '--merge-acceptance-evidence': {
    values: new Set(['--merge-acceptance-evidence', '--deployment-run', '--marker', '--output']),
    flags: new Set(),
    required: ['--deployment-run', '--marker', '--output'],
  },
  '--check-promotion-evidence': {
    values: new Set(['--check-promotion-evidence', '--acceptance', '--deployment']),
    flags: new Set(['--require-approved', '--require-cleanup-run', '--require-live-run', '--require-one-fingerprint', '--require-exact-cleanup', '--require-zero-authority', '--require-zero-after-cleanup', '--require-live-smoke', '--non-destructive', '--require-immutable-runs']),
    required: ['--deployment'],
  },
  '--run-deployment': {
    values: new Set(['--mode', '--evidence', '--acceptance-marker', '--acceptance']),
    flags: new Set(['--run-deployment']),
    required: ['--mode', '--evidence'],
  },
  '--retirement-review': {
    values: new Set(['--output']),
    flags: new Set(['--retirement-review']),
    required: ['--output'],
  },
  '--local-package-security-review': {
    values: new Set(['--output']),
    flags: new Set(['--local-package-security-review']),
    required: ['--output'],
  },
  '--final-review': {
    values: new Set(['--test-deployment', '--acceptance', '--promotion', '--retirement', '--release', '--local-package-security', '--output']),
    flags: new Set(['--final-review']),
    required: ['--test-deployment', '--acceptance', '--promotion', '--retirement', '--release', '--local-package-security', '--output'],
  },
  '--check-final': {
    values: new Set(['--check-final', '--test-deployment', '--acceptance', '--promotion', '--retirement', '--release', '--local-package-security']),
    flags: new Set(),
    required: ['--check-final', '--test-deployment', '--acceptance', '--promotion', '--retirement', '--release', '--local-package-security'],
  },
};

function parseArguments(argv) {
  const commands = argv.filter((argument) => Object.hasOwn(commandDefinitions, argument));
  if (commands.length === 0) fail(`unknown option ${argv[0] ?? ''}`);
  if (commands.length !== 1) fail('exactly one verifier command is required');
  const command = commands[0];
  const definition = commandDefinitions[command];
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (definition.values.has(option)) {
      if (values.has(option) || flags.has(option)) fail(`duplicate option ${option}`);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`missing value ${option}`);
      values.set(option, value);
      index += 1;
      continue;
    }
    if (definition.flags.has(option)) {
      if (flags.has(option) || values.has(option)) fail(`duplicate option ${option}`);
      flags.add(option);
      continue;
    }
    fail(`unknown option ${option}`);
  }
  for (const required of definition.required ?? []) if (!values.has(required)) fail(`missing required option ${required}`);
  if (values.has('--expected-mode') && !MODES.has(values.get('--expected-mode'))) fail('invalid expected mode');
  if (values.has('--mode') && !MODES.has(values.get('--mode'))) fail('invalid deployment mode');
  if (flags.has('--require-exact-cleanup') && command === '--check-run-evidence' && !values.has('--acceptance')) fail('missing required option --acceptance');
  return { command, values, flags };
}

const RETIREMENT_SCOPE_VERSION = 1;
const RETIREMENT_LEGACY = /(?:services\/support|render(?:\.com|\.ya?ml)|RESEND_API_KEY|magic[-_ ]?link|recovery[-_ ]?token|DATABASE_URL|EMAIL_LOOKUP_HMAC_KEY|RECOVERY_TOKEN_HMAC_KEY)/iu;
const RETIREMENT_PROTECTED = /(?:\b(?:sk|rk|pk)_[A-Za-z0-9_]*[A-Za-z0-9](?![A-Za-z0-9_])|\bwhsec_[A-Za-z0-9_]+|\bgh[ops]_[A-Za-z0-9_]+|(?:oauth|access_token|id_token|payer_email|profile_email)=)/iu;
const RETIREMENT_CONTRACT_PATHS = new Set([
  'scripts/verify-supabase-support.mjs',
  'scripts/verify-production-artifacts.mjs',
  'tests/e2e/support-payment.spec.ts',
  'tests/e2e/package-assets.spec.ts',
]);

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

async function filePaths(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await filePaths(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

function scanRetirementText(path, content, { allowContractDescriptions = false, allowOrigin = false } = {}) {
  if (RETIREMENT_PROTECTED.test(content)) fail(`retirement policy protected-value: ${path}`);
  if (!allowContractDescriptions && (RETIREMENT_LEGACY.test(path) || RETIREMENT_LEGACY.test(content))) fail(`retirement policy legacy-runtime: ${path}`);
  if (!allowOrigin && (content.includes('.supabase.co') || /^(?:[a-z0-9]{20})$/imu.test(content))) fail(`retirement policy configured-origin: ${path}`);
}

async function scanRetirementFiles(paths, root, policy) {
  let count = 0;
  for (const path of paths) {
    if (!/\.(?:js|mjs|cjs|json|ya?ml|md|html|css|ts|vue)$/iu.test(path)) continue;
    const content = await readFile(join(root, path), 'utf8');
    scanRetirementText(path, content, policy(path));
    count += 1;
  }
  return count;
}


function digestFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function verifyRuntimeArtifact(purpose) {
  const temporary = await mkdtemp(join(tmpdir(), `${renameMap.slug}-runtime-`));
  const custodyDirectory = join(temporary, 'custody');
  const evidencePath = join(temporary, 'runtime-artifact-evidence.json');
  const environment = { ...process.env };
  delete environment[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  const cleanup = () => rm(temporary, { recursive: true, force: true });
  const onInterrupt = () => { void cleanup().finally(() => process.exit(130)); };
  const onTerminate = () => { void cleanup().finally(() => process.exit(143)); };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    execFileSync(process.execPath, [
      fileURLToPath(new URL('./pack-runtime.mjs', import.meta.url)),
      '--purpose', purpose,
      '--custody-dir', custodyDirectory,
      '--evidence', evidencePath,
    ], { encoding: 'utf8', stdio: 'pipe', env: environment });
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    if (
      evidence?.kind !== `${renameMap.kindPrefix}.runtime-artifact-evidence/v1`
      || evidence.status !== purpose
      || evidence.purpose !== purpose
      || evidence.support?.configured !== false
      || typeof evidence.archive?.basename !== 'string'
      || basename(evidence.archive.basename) !== evidence.archive.basename
    ) fail('runtime producer did not create an unconfigured development-check artifact');
    const archivePath = join(custodyDirectory, evidence.archive.basename);
    const expectedSha256 = digestFile(archivePath);
    const result = JSON.parse(execFileSync(process.execPath, [
      fileURLToPath(new URL('./verify-production-artifacts.mjs', import.meta.url)),
      '--archive', archivePath,
      '--expected-sha256', expectedSha256,
      '--evidence', evidencePath,
    ], { encoding: 'utf8', stdio: 'pipe', env: environment }));
    if (
      result?.kind !== `${renameMap.kindPrefix}.runtime-artifact-verification/v1`
      || result.status !== 'passed'
      || result.purpose !== purpose
      || result.archive?.sha256 !== expectedSha256
      || result.support?.configured !== false
    ) fail('runtime verifier did not pass the unconfigured development-check artifact');
    return result;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    await cleanup();
  }
}

async function retirementReview(output) {
  if (basename(output) !== '02-15-RETIREMENT-EVIDENCE.md') fail('retirement review output basename is invalid');
  if (process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`] !== undefined) fail(`retirement review forbids ${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`);
  const root = process.cwd();
  const tracked = trackedPaths();
  const trackedCount = await scanRetirementFiles(tracked, root, (path) => ({
    allowContractDescriptions: path.startsWith('.planning/') || RETIREMENT_CONTRACT_PATHS.has(path),
    allowOrigin: true,
  }));
  const verified = await verifyRuntimeArtifact('development-check');
  const dist = await filePaths(join(root, 'dist'));
  const distCount = await scanRetirementFiles(dist.map((path) => relative(root, path)), root, () => ({}));
  const record = {
    version: EVIDENCE_VERSION,
    kind: 'retirement-review',
    status: 'passed',
    policy: {
      version: RETIREMENT_SCOPE_VERSION,
      classifier_sha256: sha256(`${RETIREMENT_LEGACY.source}\n${RETIREMENT_PROTECTED.source}\n${[...RETIREMENT_CONTRACT_PATHS].join('\n')}`),
    },
    scope: {
      tracked_paths: tracked.length,
      scanned_tracked_files: trackedCount,
      immutable_description_exclusion: '.planning/**',
      contract_description_exclusions: [...RETIREMENT_CONTRACT_PATHS].sort(),
    },
    configured_absent: true,
    package: {
      scanned_dist_files: distCount,
      inventory_paths: verified.inventory.count,
      archive_sha256: verified.archive.sha256,
      archive_bytes: verified.archive.byteLength,
      inventory_sha256: verified.inventory.sha256,
    },
    artifacts: {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      evidence_sha256: '',
    },
    violations: [],
  };
  record.artifacts.evidence_sha256 = sha256(JSON.stringify({ ...record, artifacts: { ...record.artifacts, evidence_sha256: '' } }));
  await writeEvidence(output, record);
}

const FINAL_INPUTS = [
  ['test-deployment', '--test-deployment', 'deployment-run'],
  ['acceptance', '--acceptance', 'acceptance'],
  ['promotion', '--promotion', 'promotion'],
  ['retirement', '--retirement', 'retirement-review'],
  ['release', '--release', 'release'],
  ['local-package-security', '--local-package-security', 'local-package-security'],
];
const LOCAL_PROTECTED_INPUTS = [
  ...PROTECTED_INPUTS,
  ...RETIRED_INPUTS,
  `${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`,
  `${renameMap.envPrefix}SUPPORT_SERVICE_URL`,
  `${renameMap.envPrefix}DEPLOYMENT_ENVIRONMENT`,
  'GITHUB_ACTIONS',
];
const LOCAL_SECURITY_COMMAND_IDS = [
  'vitest',
  'playwright',
  'database-start',
  'database-reset-1',
  'database-test-1',
  'database-migrations-1',
  'database-lint-1',
  'database-reset-2',
  'database-test-2',
  'database-migrations-2',
  'database-lint-2',
  'deno',
];

function finalDigest(record) {
  return sha256(JSON.stringify({ ...record, artifacts: { ...record.artifacts, evidence_sha256: '' } }));
}
function assertImmutableFinalRecord(record, kind, name) {
  if (!record || record.version !== EVIDENCE_VERSION || record.kind !== kind || record.status !== 'passed') fail(`final ${name} record is invalid`);
  if (!record.artifacts || !isHash(record.artifacts.evidence_sha256) || finalDigest(record) !== record.artifacts.evidence_sha256) fail(`final ${name} digest binding is invalid`);
  if (name === 'release') {
    assertBaseRecord(record, kind);
    if (record.run.immutable !== true) fail(`final ${name} run is mutable`);
  } else {
    if (Object.hasOwn(record, 'public_origin')) fail(`final ${name} evidence must not carry a hosted origin`);
    if (name === 'local-package-security' && (
      record.configured_absent !== true
      || record.database_cycles !== 2
      || JSON.stringify(record.commands?.map((command) => command.id)) !== JSON.stringify(LOCAL_SECURITY_COMMAND_IDS)
      || record.commands.some((command) => command.status !== 'passed' || !isHash(command.command_sha256) || !isHash(command.output_sha256))
    )) fail('final local-package-security conclusions are incomplete');
  }
}

async function readFinalInput(path, name, kind) {
  const resolved = resolve(path);
  const raw = await readFile(resolved, 'utf8');
  const record = await readEvidence(resolved);
  assertImmutableFinalRecord(record, kind, name);
  return { path: resolved, raw, record, digest: sha256(raw) };
}

async function validateReleaseApproval(release, releasePath) {
  const approvalPath = join(dirname(releasePath), '02-16-RELEASE-APPROVAL.md');
  const approval = await readEvidence(approvalPath);
  const packageDigest = release.artifacts.package_sha256;
  if (
    approval?.version !== EVIDENCE_VERSION
    || approval.kind !== `${renameMap.kindPrefix}.release-approval`
    || approval.status !== 'approved'
    || approval.release_record_sha256 !== sha256(await readFile(releasePath, 'utf8'))
    || approval.run_id !== release.run.id
    || !isHash(packageDigest)
    || approval.package_sha256 !== packageDigest
  ) fail('release approval binding is invalid');
}

async function checkReleaseEvidence(options) {
  const releasePath = options.values.get('--check-release-evidence');
  const release = await readFinalInput(releasePath, 'release', 'release');
  const promotionPath = options.values.get('--live-promotion');
  const promotionRaw = await readFile(promotionPath, 'utf8');
  const promotionRecord = await readEvidence(promotionPath);
  assertBaseRecord(promotionRecord, 'promotion');
  if (promotionRecord.status !== 'passed' || promotionRecord.mode !== 'production-live' || promotionRecord.run.immutable !== true) fail('release promotion lineage is invalid');
  const promotion = { record: promotionRecord, digest: sha256(promotionRaw) };
  const retirementPath = options.values.get('--retirement');
  const retirementRaw = await readFile(retirementPath, 'utf8');
  const retirement = await readEvidence(retirementPath);
  if (
    retirement?.version !== EVIDENCE_VERSION
    || retirement.kind !== 'retirement-review'
    || retirement.configured_absent !== true
    || !Array.isArray(retirement.violations)
    || retirement.violations.length !== 0
  ) fail('release retirement lineage is invalid');
  if (
    release.record.public_origin !== promotion.record.public_origin
    || release.record.fingerprint !== promotion.record.fingerprint
    || release.record.artifacts?.promotion_evidence_sha256 !== promotion.digest
    || release.record.artifacts?.retirement_evidence_sha256 !== sha256(retirementRaw)
    || !isHash(release.record.artifacts?.deployment_evidence_sha256)
  ) fail('release evidence lineage is invalid');
  assertRoutes(release.record.routes);
  if (JSON.stringify(release.record.route_probes) !== JSON.stringify(release.record.routes)) fail('release route probe lineage is invalid');
  if (options.flags.has('--require-package-digest') && !isHash(release.record.artifacts?.package_sha256)) fail('release package digest is invalid');
  if (options.flags.has('--require-zero-authority')) {
    assertManifest(release.record.authority_before, true);
    assertManifest(release.record.authority_after, true);
  }
  if (options.flags.has('--non-destructive')) {
    if (release.record.non_destructive !== true) fail('release smoke is not non-destructive');
    const flow = release.record.route_probes?.['support-flow-invalid-state'];
    if (flow?.status !== 400 || flow.content_type !== 'text/plain') fail('release support-flow signature is invalid');
  }
  if (options.flags.has('--require-approved')) await validateReleaseApproval(release.record, release.path);
}

async function collectFinalInputs(options) {
  const seen = new Set();
  const inputs = [];
  let policy;
  let run;
  for (const [name, option, kind] of FINAL_INPUTS) {
    const path = resolve(options.values.get(option));
    const raw = await readFile(path, 'utf8');
    const record = await readEvidence(path);
    const input = { path: relative(process.cwd(), path), raw, record, digest: sha256(raw) };
    if (seen.has(path)) fail('final evidence input paths must be distinct');
    seen.add(path);
    if (name === 'test-deployment') {
      validateRun(record, {
        values: new Map([['--expected-mode', 'prelaunch-test']]),
        flags: new Set(['--require-immutable-run', '--require-zero-authority']),
      });
    } else if (name === 'acceptance') {
      await validateAcceptance(record, {
        values: new Map([['--deployment', options.values.get('--test-deployment')]]),
        flags: new Set(['--require-approved', '--require-hostile-matrix', '--require-fixture-manifest', '--require-immutable-run']),
      });
    } else if (name === 'promotion') {
      await validatePromotion(record, {
        values: new Map([
          ['--acceptance', options.values.get('--acceptance')],
          ['--deployment', options.values.get('--test-deployment')],
        ]),
        flags: new Set(),
      });
    } else if (name === 'retirement' || name === 'local-package-security') {
      assertImmutableFinalRecord(record, kind, name);
    } else if (name === 'release') {
      await checkReleaseEvidence({
        values: new Map([
          ['--check-release-evidence', options.values.get('--release')],
          ['--live-promotion', options.values.get('--promotion')],
          ['--retirement', options.values.get('--retirement')],
        ]),
        flags: new Set(['--require-approved', '--require-immutable-run', '--require-package-digest', '--require-zero-authority', '--non-destructive']),
      });
      run = record.run;
    }
    if (['test-deployment', 'acceptance', 'promotion', 'release'].includes(name)) {
      const current = canonicalOriginPolicy(record.public_origin);
      if (!policy) policy = current;
      else if (policy.origin !== current.origin) fail('final public origin lineage does not match');
    }
    inputs.push({ name, ...input });
  }
  const retirement = inputs.find((input) => input.name === 'retirement').record;
  if (retirement.configured_absent !== true || !Array.isArray(retirement.violations) || retirement.violations.length !== 0) fail('retirement evidence is not a clean configured-absent review');
  return { inputs, policy, run };
}

async function finalReview(options, write) {
  const collected = await collectFinalInputs(options);
  if (!write) {
    const final = await readEvidence(options.values.get('--check-final'));
    if (final?.version !== EVIDENCE_VERSION || final.kind !== 'final-review' || final.status !== 'passed') fail('final evidence is invalid');
    if (final.public_origin !== collected.policy.origin || JSON.stringify(final.run) !== JSON.stringify(collected.run)) fail('final evidence lineage does not match');
    const expected = collected.inputs.map(({ name, path, digest, record }) => ({ name, path, kind: record.kind, version: record.version, sha256: digest }));
    if (JSON.stringify(final.inputs) !== JSON.stringify(expected)) fail('final evidence input bindings do not match');
    if (!isHash(final.artifacts?.evidence_sha256) || finalDigest(final) !== final.artifacts.evidence_sha256) fail('final evidence digest binding is invalid');
    return;
  }
  if (basename(options.values.get('--output')) !== '02-17-FINAL-EVIDENCE.md') fail('final evidence output basename is invalid');
  const record = {
    version: EVIDENCE_VERSION,
    kind: 'final-review',
    status: 'passed',
    public_origin: collected.policy.origin,
    run: collected.run,
    inputs: collected.inputs.map(({ name, path, digest, record: input }) => ({ name, path, kind: input.kind, version: input.version, sha256: digest })),
    conclusions: {
      configured_absent_local_package_security: true,
      configured_absent_retirement: true,
      immutable_six_input_lineage: true,
      protected_value_violations: 0,
    },
    artifacts: { evidence_sha256: '' },
  };
  record.artifacts.evidence_sha256 = finalDigest(record);
  await writeEvidence(options.values.get('--output'), record);
}

async function localPackageSecurityReview(output) {
  if (basename(output) !== '02-17-LOCAL-PACKAGE-SECURITY-EVIDENCE.md') fail('local package security output basename is invalid');
  for (const name of LOCAL_PROTECTED_INPUTS) if (process.env[name] !== undefined) fail(`local package security review forbids ${name}`);
  const commands = [
    { id: 'vitest', command: 'npx', args: ['vitest', 'run', '--no-file-parallelism'] },
    { id: 'playwright', command: 'npx', args: ['playwright', 'test'] },
    { id: 'database-start', command: 'npx', args: ['supabase@2.114.0', 'db', 'start'] },
    { id: 'database-reset-1', command: 'npx', args: ['supabase@2.114.0', 'db', 'reset', '--local', '--no-seed'] },
    { id: 'database-test-1', command: 'npx', args: ['supabase@2.114.0', 'test', 'db'] },
    { id: 'database-migrations-1', command: 'npx', args: ['supabase@2.114.0', 'migration', 'list', '--local'] },
    { id: 'database-lint-1', command: 'npx', args: ['supabase@2.114.0', 'db', 'lint', '--local'] },
    { id: 'database-reset-2', command: 'npx', args: ['supabase@2.114.0', 'db', 'reset', '--local', '--no-seed'] },
    { id: 'database-test-2', command: 'npx', args: ['supabase@2.114.0', 'test', 'db'] },
    { id: 'database-migrations-2', command: 'npx', args: ['supabase@2.114.0', 'migration', 'list', '--local'] },
    { id: 'database-lint-2', command: 'npx', args: ['supabase@2.114.0', 'db', 'lint', '--local'] },
    { id: 'deno', command: 'deno', args: ['test', '--allow-env', '--config', 'supabase/functions/deno.json', 'supabase/functions/tests'] },
  ];
  const retirement = join(await mkdtemp(join(tmpdir(), `${renameMap.slug}-local-security-`)), '02-15-RETIREMENT-EVIDENCE.md');
  try {
    const results = [];
    for (const { id, command, args } of commands) {
      results.push({
        id,
        status: 'passed',
        command_sha256: sha256(`${command}\0${args.join('\0')}`),
        output_sha256: await commandOutput(command, args, process.env),
      });
    }
    await retirementReview(retirement);
    const record = {
      version: EVIDENCE_VERSION,
      kind: 'local-package-security',
      status: 'passed',
      commands: results,
      database_cycles: 2,
      configured_absent: true,
      artifacts: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), evidence_sha256: '' },
    };
    record.artifacts.evidence_sha256 = finalDigest(record);
    await writeEvidence(output, record);
  } finally {
    await rm(dirname(retirement), { recursive: true, force: true });
  }
}

function commandOutput(command, args, environment) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    const digest = createHash('sha256');
    let diagnostics = '';
    const collect = (chunk) => {
      digest.update(chunk);
      diagnostics = (diagnostics + String(chunk)).slice(-16_384);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', () => rejectPromise(new Error(`${command} is unavailable`)));
    child.once('exit', (code) => code === 0
      ? resolvePromise(digest.digest('hex'))
      : rejectPromise(new Error(`${command} failed with exit ${code}: ${diagnostics}`)));
  });
}

function guardTarget(inputs) {
  canonicalOrigin(inputs.SUPABASE_PROJECT_REF);
}

function protectedInputs(environment) {
  if (environment.GITHUB_ACTIONS !== 'true' || environment[`${renameMap.envPrefix}DEPLOYMENT_ENVIRONMENT`] !== 'production') fail('hosted deployment is CI-only in protected production environment');
  const values = Object.fromEntries(PROTECTED_INPUTS.map((name) => [name, environment[name]]));
  for (const [name, value] of Object.entries(values)) requireString(value, name);
  if (!MODES.has(values.SUPPORT_PROVIDER_MODE)) fail('SUPPORT_PROVIDER_MODE is invalid');
  guardTarget(values);
  const origin = canonicalOrigin(values.SUPABASE_PROJECT_REF);
  return { ...values, origin, routes: publicRoutes(origin) };
}
function redactedHostedError(body, inputs) {
  let value = body;
  const protectedValues = [
    ...PROTECTED_INPUTS.map((name) => inputs[name]),
    inputs.origin,
    ...Object.values(inputs.routes),
  ].filter((entry) => typeof entry === 'string' && entry.length > 0).sort((left, right) => right.length - left.length);
  for (const protectedValue of protectedValues) value = value.replaceAll(protectedValue, '[redacted]');
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, 512);
}


async function managementRequest(inputs, path, options = {}) {
  const { safeErrorDetail, suppressDetail = false, ...requestOptions } = options;
  const response = await fetch(`${MANAGEMENT_ORIGIN}${path}`, {
    ...requestOptions,
    headers: {
      authorization: `Bearer ${inputs.SUPABASE_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      ...requestOptions.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    const detail = safeErrorDetail ? safeErrorDetail(body) : suppressDetail ? '' : redactedHostedError(body, inputs);
    throw new HostedRequestError(response.status, 'hosted request', detail);
  }
  return body.length === 0 ? undefined : JSON.parse(body);
}

async function guardedMutation(inputs, operation, mutate, order) {
  guardTarget(inputs);
  order.push(operation);
  return mutate();
}

async function deploy(inputs, evidencePath, acceptanceMarkerPath, acceptancePath) {
  if (acceptanceMarkerPath && acceptancePath) fail('deployment accepts only one acceptance input');
  if (acceptancePath) {
    if (inputs.SUPPORT_PROVIDER_MODE !== 'prelaunch-test') fail('exact cleanup is unavailable in live mode');
    return exactCleanup(inputs, evidencePath, acceptancePath);
  }
  if (inputs.SUPPORT_PROVIDER_MODE === 'production-live') {
    if (acceptanceMarkerPath) fail('acceptance marker is unavailable in live mode');
    return deployLive(inputs, evidencePath);
  }

  let marker;
  if (acceptanceMarkerPath) {
    marker = await readEvidence(acceptanceMarkerPath);
    await validateAcceptanceMarker(marker, PRELAUNCH_DEPLOYMENT_EVIDENCE, 'prelaunch-test');
    if (marker.public_origin !== inputs.origin || marker.fingerprint !== sha256(inputs.SUPABASE_PROJECT_REF)) fail('acceptance marker target does not match');
  }
  const order = await applyHostedConfiguration(inputs);
  const authority = await snapshotAuthority(inputs);
  const routes = await probeRoutes(inputs.routes);
  const after = await snapshotAuthority(inputs);
  if (JSON.stringify(authority) !== JSON.stringify(after)) fail('route probes changed authority rows');
  const record = deploymentRecord(inputs, order, routes, authority);
  if (marker) {
    record.hostile_matrix = await runHostileExecutor(inputs, marker);
    record.fixture_manifest = await snapshotAuthority(inputs);
    record.acceptance_marker = {
      ...marker.acceptance_marker,
      marker_sha256: sha256(JSON.stringify(marker)),
    };
  }
  await writeRunEvidence(evidencePath, record);
}

async function applyHostedConfiguration(inputs) {
  const order = [];
  await guardedMutation(inputs, 'schema', () => commandOutput('npx', ['supabase@2.114.0', 'db', 'push', '--project-ref', inputs.SUPABASE_PROJECT_REF], process.env), order);
  await guardedMutation(inputs, 'auth-provider-configuration', () => managementRequest(inputs, `/v1/projects/${inputs.SUPABASE_PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({
      external_github_enabled: true,
      external_github_client_id: inputs.SUPABASE_GITHUB_CLIENT_ID,
      external_github_secret: inputs.SUPABASE_GITHUB_CLIENT_SECRET,
      site_url: inputs.routes.supportFlowComplete,
      uri_allow_list: inputs.routes.supportFlowCallback,
    }),
  }), order);
  await guardedMutation(inputs, 'edge-function-secrets', () => managementRequest(inputs, `/v1/projects/${inputs.SUPABASE_PROJECT_REF}/secrets`, {
    method: 'POST',
    body: JSON.stringify([
      { name: 'STRIPE_SECRET_KEY', value: inputs.STRIPE_SECRET_KEY },
      { name: 'STRIPE_WEBHOOK_SECRET', value: inputs.STRIPE_WEBHOOK_SECRET },
      { name: 'STRIPE_PRICE_ID', value: inputs.STRIPE_PRICE_ID },
    ]),
  }), order);
  for (const name of ['support-api', 'support-flow', 'stripe-webhook']) {
    await guardedMutation(inputs, name, () => commandOutput('npx', ['supabase@2.114.0', 'functions', 'deploy', name, '--project-ref', inputs.SUPABASE_PROJECT_REF, '--use-api', '--import-map', 'supabase/functions/deno.json'], process.env), order);
  }
  return order;
}

function deploymentRecord(inputs, order, routes, authority) {
  return {
    version: EVIDENCE_VERSION,
    kind: 'deployment-run',
    status: 'passed',
    mode: inputs.SUPPORT_PROVIDER_MODE,
    fingerprint: sha256(inputs.SUPABASE_PROJECT_REF),
    public_origin: inputs.origin,
    run: immutableRunContext(process.env),
    order,
    routes,
    authority,
    artifacts: { evidence_sha256: '' },
  };
}

async function writeRunEvidence(path, record) {
  record.artifacts.evidence_sha256 = sha256(JSON.stringify({ ...record, artifacts: { evidence_sha256: '' } }));
  await writeEvidence(path, record);
}

function immutableRunContext(environment) {
  const id = requireString(environment.GITHUB_RUN_ID, 'GITHUB_RUN_ID');
  const serverUrl = requireString(environment.GITHUB_SERVER_URL, 'GITHUB_SERVER_URL');
  const repository = requireString(environment.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  const commit = requireString(environment.GITHUB_SHA, 'GITHUB_SHA');
  if (!/^[a-f0-9]{40}$/u.test(commit)) fail('GITHUB_SHA must be a full commit SHA');
  return { id, url: `${serverUrl}/${repository}/actions/runs/${id}`, commit, immutable: true };
}

async function authorityRows(inputs) {
  const query = TABLES
    .map(([table, key]) => `select '${table}' as table_name, ${key}::text as id from ${table}`)
    .join('\nunion all\n');
  const result = await managementRequest(inputs, `/v1/projects/${inputs.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: `${query}\norder by table_name, id`, read_only: true }),
  });
  if (!Array.isArray(result)) fail('authority snapshot must be a row array');
  const rows = Object.fromEntries(TABLES.map(([table]) => [table, []]));
  for (const row of result) {
    const table = requireString(row?.table_name, 'authority table');
    if (!Object.hasOwn(rows, table)) fail('authority snapshot returned an unknown table');
    rows[table].push(requireString(row?.id, 'authority handle'));
  }
  return rows;
}

function manifestForRows(rows) {
  const manifest = Object.fromEntries(TABLES.map(([table]) => [
    table,
    {
      count: rows[table].length,
      handles: rows[table].map((id) => sha256(`${table}:${id}`)).sort(),
    },
  ]));
  assertManifest(manifest);
  return manifest;
}

async function snapshotAuthority(inputs) {
  return manifestForRows(await authorityRows(inputs));
}

async function validateCleanupAcceptance(acceptance, inputs) {
  await validateAcceptance(acceptance, {
    values: new Map([['--deployment', PRELAUNCH_DEPLOYMENT_EVIDENCE]]),
    flags: new Set(['--require-approved', '--require-hostile-matrix', '--require-fixture-manifest', '--require-immutable-run']),
  });
  if (
    acceptance.public_origin !== inputs.origin
    || acceptance.fingerprint !== sha256(inputs.SUPABASE_PROJECT_REF)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(acceptance.approval?.approved_on)
    || acceptance.approval?.run_id !== acceptance.run.id
    || acceptance.approval?.run_evidence_sha256 !== acceptance.artifacts?.hostile_run_evidence_sha256
    || acceptance.approval?.scope !== 'exact-manifest-cleanup-and-same-project-promotion'
  ) fail('acceptance approval lineage does not match cleanup target');
}

function cleanupSql(rows) {
  const exactChecks = TABLES.map(([table, key]) => {
    const values = rows[table];
    const matches = values.length === 0
      ? '0'
      : `(select count(*) from ${table} where ${key}::text = any (array[${values.map(sqlText).join(', ')}]::text[]))`;
    return `if (select count(*) from ${table}) <> ${values.length} or ${matches} <> ${values.length} then raise exception 'fixture manifest mismatch'; end if;`;
  }).join('\n');
  const deletes = CLEANUP_TABLES.map(([table, key]) => {
    const values = rows[table];
    return values.length === 0
      ? ''
      : `delete from ${table} where ${key}::text = any (array[${values.map(sqlText).join(', ')}]::text[]);`;
  }).filter(Boolean).join('\n');
  return `do $${renameMap.slug}$\nbegin\nlock table ${TABLES.map(([table]) => table).join(', ')} in access exclusive mode;\n${exactChecks}\n${deletes}\nend\n$${renameMap.slug}$;`;
}

async function exactCleanup(inputs, evidencePath, acceptancePath) {
  const acceptance = await readEvidence(acceptancePath);
  await validateCleanupAcceptance(acceptance, inputs);
  const rows = await authorityRows(inputs);
  const before = manifestForRows(rows);
  if (JSON.stringify(before) !== JSON.stringify(acceptance.fixture_manifest)) fail('current authority does not exactly match approved fixture manifest');
  guardTarget(inputs);
  await databaseQuery(inputs, cleanupSql(rows), 'exact fixture cleanup');
  const authority = await snapshotAuthority(inputs);
  assertManifest(authority, true);
  const routes = await probeRoutes(inputs.routes);
  const confirmation = await snapshotAuthority(inputs);
  assertManifest(confirmation, true);
  const record = deploymentRecord(inputs, CLEANUP_TABLES.map(([table]) => `delete:${table}`), routes, authority);
  record.operation = 'exact-cleanup';
  record.authority_before = before;
  record.deleted = before;
  record.authority_confirmation = confirmation;
  record.acceptance = {
    run_id: acceptance.run.id,
    run_evidence_sha256: acceptance.artifacts.hostile_run_evidence_sha256,
    record_sha256: sha256(JSON.stringify(acceptance)),
  };
  await writeRunEvidence(evidencePath, record);
}

async function verifyLiveCoherence(inputs) {
  const inputFailures = [
    !inputs.STRIPE_SECRET_KEY.startsWith(`sk${'_'}live_`) && 'secret-mode',
    !inputs.STRIPE_WEBHOOK_SECRET.startsWith(`whsec${'_'}`) && 'webhook-secret',
  ].filter(Boolean);
  if (inputFailures.length > 0) fail(`live Stripe coherence failed: ${inputFailures.join('+')}`);
  const price = await stripeRequest(inputs, `/v1/prices/${encodeURIComponent(inputs.STRIPE_PRICE_ID)}`, { method: 'GET', operation: 'live price verification' });
  const endpoint = await stripeRequest(inputs, `/v1/webhook_endpoints/${encodeURIComponent(inputs.STRIPE_WEBHOOK_ENDPOINT_ID)}`, { method: 'GET', operation: 'live webhook verification' });
  const failures = [
    price?.object !== 'price' && 'price-object',
    price.active !== true && 'price-active',
    price.livemode !== true && 'price-mode',
    price.currency !== 'usd' && 'price-currency',
    price.unit_amount !== 4999 && 'price-amount',
    price.type !== 'one_time' && 'price-type',
    endpoint?.object !== 'webhook_endpoint' && 'endpoint-object',
    endpoint.status !== 'enabled' && 'endpoint-status',
    endpoint.livemode !== true && 'endpoint-mode',
    endpoint.url !== inputs.routes.stripeWebhook && 'endpoint-url',
    !Array.isArray(endpoint.enabled_events) && 'endpoint-events-shape',
    Array.isArray(endpoint.enabled_events)
      && JSON.stringify([...endpoint.enabled_events].sort()) !== JSON.stringify(['checkout.session.async_payment_succeeded', 'checkout.session.completed'])
      && 'endpoint-events',
  ].filter(Boolean);
  if (failures.length > 0) fail(`live Stripe coherence failed: ${failures.join('+')}`);
  return { status: 'passed' };
}

async function probeLiveStatus(inputs) {
  const response = await fetch(`${inputs.routes.supportApi}/status?installationId=${encodeURIComponent(installationId())}`);
  const contentType = response.headers.get('content-type') ?? '';
  let body;
  try {
    body = await response.json();
  } catch {
    fail('live status probe returned invalid JSON');
  }
  if (response.status !== 200 || !contentType.startsWith('application/json') || JSON.stringify(body) !== JSON.stringify({ status: 'unverified' })) fail('live status probe failed');
  return { status: 'passed', non_destructive: true };
}

async function deployLive(inputs, evidencePath) {
  const before = await snapshotAuthority(inputs);
  const coherence = await verifyLiveCoherence(inputs);
  const order = await applyHostedConfiguration(inputs);
  const routes = await probeRoutes(inputs.routes);
  const liveSmoke = await probeLiveStatus(inputs);
  const authority = await snapshotAuthority(inputs);
  if (JSON.stringify(before) !== JSON.stringify(authority)) fail('live deployment changed authority rows');
  const record = deploymentRecord(inputs, order, routes, authority);
  record.authority_before = before;
  record.coherence = coherence;
  record.live_smoke = liveSmoke;
  await writeRunEvidence(evidencePath, record);
}

async function probeRoutes(routes) {
  const probes = [
    ['auth-settings', `${new URL(routes.authCallback).origin}/auth/v1/settings`, 401, 'application/json', 'GET'],
    ['support-api-invalid-input', routes.supportApi, 400, 'application/json', 'POST'],
    ['support-flow-invalid-state', routes.supportFlow, 400, 'text/plain', 'POST'],
    ['stripe-webhook-invalid-signature', routes.stripeWebhook, 400, 'application/json', 'POST'],
  ];
  const result = {};
  for (const [name, url, expectedStatus, contentType, method] of probes) {
    const response = await fetch(url, { method });
    const actualContentType = response.headers.get('content-type') ?? '';
    if (response.status !== expectedStatus || !actualContentType.startsWith(contentType)) fail(`route probe failed for ${name}`);
    result[name] = { status: response.status, content_type: contentType };
  }
  return result;
}

function evidencePolicy(record) {
  try {
    return record && typeof record.public_origin === 'string' ? canonicalOriginPolicy(record.public_origin) : undefined;
  } catch {
    return undefined;
  }
}

function evidenceContainsProtectedValue(value, key = '', policy) {
  if (RAW_VALUE_KEY.test(key)) return true;
  if (typeof value === 'string') {
    if (policy?.allowed.has(value)) return false;
    return value.includes('.supabase.co') || (policy && value.includes(policy.projectRef)) || value.includes('@') || /(?:sk_|whsec_|gh[ops]_|price_|we_|oauth|email|token|code=|state=|profile)/iu.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => evidenceContainsProtectedValue(entry, '', policy));
  if (value && typeof value === 'object') return Object.entries(value).some(([entryKey, entryValue]) => evidenceContainsProtectedValue(entryValue, entryKey, policy));
  return false;
}

async function writeEvidence(path, record) {
  if (evidenceContainsProtectedValue(record, '', evidencePolicy(record))) fail(`evidence contains protected or raw content: ${record.kind ?? 'unknown'}`);
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function readEvidence(path) {
  const content = await readFile(path, 'utf8');
  const marker = content.match(new RegExp(`<!--\\s*${renameMap.slug}(?:-prelaunch)?-evidence\\s+(.+?)\\s*-->`, 'su'));
  let record;
  try {
    record = JSON.parse(marker?.[1] ?? content);
  } catch {
    fail('evidence machine record is invalid');
  }
  if (evidenceContainsProtectedValue(record, '', evidencePolicy(record))) fail('evidence contains protected or raw content');
  return record;
}

function evidenceDigest(record) {
  if (!record?.artifacts || !isHash(record.artifacts.evidence_sha256)) fail('evidence artifact digest is invalid');
  return sha256(JSON.stringify({ ...record, artifacts: { ...record.artifacts, evidence_sha256: '' } }));
}

function assertExactKeys(value, expected, message) {
  if (!value || typeof value !== 'object' || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(message);
}

function validateObservations(observations) {
  assertExactKeys(observations, ['browser_matrix', 'completion', 'review_unrestricted'], 'browser observations are malformed');
  if (!Array.isArray(observations.browser_matrix) || observations.browser_matrix.length !== BROWSER_CASES.length) fail('browser matrix is incomplete');
  for (const [index, id] of BROWSER_CASES.entries()) {
    const entry = observations.browser_matrix[index];
    if (!entry || entry.id !== id || entry.status !== 'passed' || Object.keys(entry).length !== 2) fail('browser matrix is incomplete');
  }
  const completion = observations.completion;
  if (!completion || completion.status !== 200 || completion.content_type !== 'text/plain' || completion.body !== 'Support flow complete. You can return to Loopnote.' || Object.keys(completion).length !== 3) fail('browser completion signature is invalid');
  if (observations.review_unrestricted !== true) fail('browser review availability is incomplete');
}

function validateMarkerRecord(record, expectedMode) {
  assertBaseRecord(record, 'acceptance-marker');
  assertExactKeys(record, ['version', 'kind', 'mode', 'fingerprint', 'public_origin', 'run', 'routes', 'acceptance_marker', 'observations'], 'acceptance marker fields are invalid');
  if (record.mode !== expectedMode || record.run.immutable !== true) fail('acceptance marker immutable mode is invalid');
  assertRoutes(record.routes);
  assertExactKeys(record.acceptance_marker, ['status', 'deployment_evidence_sha256', 'observations_sha256'], 'acceptance marker binding is invalid');
  if (record.acceptance_marker.status !== 'interactive-matrix-complete' || !isHash(record.acceptance_marker.deployment_evidence_sha256) || !isHash(record.acceptance_marker.observations_sha256)) fail('acceptance marker binding is invalid');
  validateObservations(record.observations);
  if (sha256(JSON.stringify(record.observations)) !== record.acceptance_marker.observations_sha256) fail('acceptance marker observations digest does not match');
}

async function validateAcceptanceMarker(record, deploymentPath, expectedMode) {
  validateMarkerRecord(record, expectedMode);
  const deployment = await readEvidence(deploymentPath);
  validateRun(deployment, {
    values: new Map([['--expected-mode', expectedMode]]),
    flags: new Set(['--require-immutable-run', '--require-zero-authority']),
  });
  if (
    record.fingerprint !== deployment.fingerprint
    || record.public_origin !== deployment.public_origin
    || JSON.stringify(record.run) !== JSON.stringify(deployment.run)
    || JSON.stringify(record.routes) !== JSON.stringify(deployment.routes)
    || evidenceDigest(deployment) !== deployment.artifacts.evidence_sha256
    || record.acceptance_marker.deployment_evidence_sha256 !== deployment.artifacts.evidence_sha256
  ) fail('acceptance marker deployment binding does not match');
}

async function writeAcceptanceEvidence(path, record) {
  if (evidenceContainsProtectedValue(record, '', evidencePolicy(record))) fail('evidence contains protected or raw content');
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `# Phase 02 hosted acceptance evidence\n\n<!-- ${renameMap.slug}-evidence\n${JSON.stringify(record, null, 2)}\n-->\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}

function assertManifest(manifest, requireZero = false) {
  if (!manifest || typeof manifest !== 'object' || Object.keys(manifest).length !== TABLES.length) fail('evidence fixture manifest is incomplete');
  const handles = new Set();
  for (const [table] of TABLES) {
    const entry = manifest[table];
    if (
      !entry
      || !Number.isSafeInteger(entry.count)
      || entry.count < 0
      || !Array.isArray(entry.handles)
      || entry.count !== entry.handles.length
      || new Set(entry.handles).size !== entry.handles.length
      || entry.handles.some((handle) => !isHash(handle) || handles.has(handle))
      || JSON.stringify(entry.handles) !== JSON.stringify([...entry.handles].sort())
    ) fail('evidence fixture manifest is invalid');
    for (const handle of entry.handles) handles.add(handle);
    if (requireZero && entry.count !== 0) fail('evidence authority is not zero');
  }
}

function assertBaseRecord(record, kind) {
  if (!record || record.version !== EVIDENCE_VERSION) fail('evidence version must be 1');
  if (record.kind !== kind) fail(`evidence kind must be ${kind}`);
  if (!MODES.has(record.mode)) fail('evidence mode is invalid');
  if (!isHash(record.fingerprint)) fail('evidence fingerprint is invalid');
  if (!record.run || typeof record.run.id !== 'string' || typeof record.run.url !== 'string' || !/^https:\/\/github\.com\//u.test(record.run.url) || !/^[a-f0-9]{40}$/u.test(record.run.commit)) fail('evidence immutable run lineage is invalid');
  const policy = canonicalOriginPolicy(record.public_origin);
  if (sha256(policy.projectRef) !== record.fingerprint) fail('evidence public origin does not match fingerprint');
  return policy;
}

function assertRoutes(routes) {
  const expected = {
    'auth-settings': ['application/json', 401],
    'support-api-invalid-input': ['application/json', 400],
    'support-flow-invalid-state': ['text/plain', 400],
    'stripe-webhook-invalid-signature': ['application/json', 400],
  };
  if (!routes || typeof routes !== 'object' || JSON.stringify(Object.keys(routes).sort()) !== JSON.stringify(Object.keys(expected).sort())) fail('evidence routes are incomplete');
  for (const [name, [contentType, status]] of Object.entries(expected)) {
    const route = routes[name];
    if (!route || route.status !== status || route.content_type !== contentType || Object.keys(route).length !== 2) fail(`evidence route is invalid ${name}`);
  }
}

function validateRun(record, options, acceptance) {
  assertBaseRecord(record, 'deployment-run');
  if (record.mode !== options.values.get('--expected-mode')) fail('evidence mode does not match expected mode');
  if (options.flags.has('--require-immutable-run') && record.run.immutable !== true) fail('evidence run is not immutable');
  if (evidenceDigest(record) !== record.artifacts.evidence_sha256) fail('evidence artifact digest does not match');
  if (options.flags.has('--require-zero-authority')) assertManifest(record.authority, true);
  if (options.flags.has('--require-exact-cleanup')) {
    const order = CLEANUP_TABLES.map(([table]) => `delete:${table}`);
    if (record.status !== 'passed' || record.operation !== 'exact-cleanup' || JSON.stringify(record.order) !== JSON.stringify(order)) fail('evidence exact cleanup order is invalid');
    assertManifest(record.authority_before);
    assertManifest(record.deleted);
    assertManifest(record.authority_confirmation, true);
    if (!acceptance || JSON.stringify(record.authority_before) !== JSON.stringify(acceptance.fixture_manifest) || JSON.stringify(record.deleted) !== JSON.stringify(acceptance.fixture_manifest)) fail('evidence cleanup manifest does not match acceptance');
    if (
      record.public_origin !== acceptance.public_origin
      || record.fingerprint !== acceptance.fingerprint
      || record.acceptance?.run_id !== acceptance.run.id
      || record.acceptance?.run_evidence_sha256 !== acceptance.artifacts.hostile_run_evidence_sha256
      || record.acceptance?.record_sha256 !== sha256(JSON.stringify(acceptance))
    ) fail('evidence cleanup lineage does not match acceptance');
  } else if (record.status !== 'passed' || JSON.stringify(record.order) !== JSON.stringify(['schema', 'auth-provider-configuration', 'edge-function-secrets', 'support-api', 'support-flow', 'stripe-webhook'])) {
    fail('evidence mutation order is invalid');
  }
  if (Object.hasOwn(record, 'domain') || Object.hasOwn(record, 'display_suffix')) fail('evidence retains retired domain state');
  assertRoutes(record.routes);
}

function validateHostileMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== HOSTILE_CASES.length) fail('hostile matrix is incomplete');
  const fixtures = new Set();
  for (const [index, id] of HOSTILE_CASES.entries()) {
    const entry = matrix[index];
    if (!entry || entry.id !== id || !Array.isArray(entry.fixtures) || entry.fixtures.length === 0 || entry.guard !== true) fail('hostile matrix case is incomplete');
    assertManifest(entry.before);
    assertManifest(entry.after);
    for (const fixture of entry.fixtures) {
      if (!isHash(fixture) || fixtures.has(fixture)) fail('hostile matrix reuses fixture handles');
      fixtures.add(fixture);
    }
    if (index < 7) {
      if (entry.expected !== 'rejected-without-authority' || entry.actual !== entry.expected || JSON.stringify(entry.before) !== JSON.stringify(entry.after)) fail('hostile matrix rejection invariant failed');
      continue;
    }
    const expected = id === 'sequential-replay' ? 'idempotent-replay' : 'single-authority-settlement';
    if (entry.expected !== expected || entry.actual !== expected || !Array.isArray(entry.responses) || entry.responses.length !== 2) fail('hostile matrix replay invariant failed');
    if (id === 'sequential-replay' && (JSON.stringify(entry.responses) !== JSON.stringify([200, 200]) || JSON.stringify(entry.first_after) !== JSON.stringify(entry.after))) fail('hostile matrix sequential replay invariant failed');
    if (id === 'concurrent-replay-settlement' && (!entry.responses.includes(200) || entry.responses.some((status) => status !== 200 && status !== 503))) fail('hostile matrix concurrent replay invariant failed');
    for (const [table] of TABLES) {
      const delta = entry.after[table].count - entry.before[table].count;
      const expectedDelta = ['support_private.supporters', 'support_private.stripe_events', 'support_private.installation_bindings'].includes(table) ? 1 : 0;
      if (delta !== expectedDelta) fail('hostile matrix settlement authority invariant failed');
    }
  }
}

async function validateAcceptance(record, options) {
  assertBaseRecord(record, 'acceptance');
  if (options.flags.has('--require-immutable-run') && record.run.immutable !== true) fail('evidence run is not immutable');
  const deployment = await readEvidence(options.values.get('--deployment'));
  validateRun(deployment, {
    values: new Map([['--expected-mode', 'prelaunch-test']]),
    flags: new Set(['--require-immutable-run', '--require-zero-authority']),
  });
  if (
    record.status !== 'passed'
    || deployment.fingerprint !== record.fingerprint
    || deployment.public_origin !== record.public_origin
    || JSON.stringify(record.deployment_run) !== JSON.stringify(deployment.run)
    || record.acceptance_marker?.deployment_evidence_sha256 !== deployment.artifacts?.evidence_sha256
  ) fail('acceptance deployment lineage does not match');
  validateObservations(record.observations);
  if (sha256(JSON.stringify(record.observations)) !== record.acceptance_marker?.observations_sha256) fail('acceptance observations lineage does not match');
  if (options.flags.has('--require-hostile-matrix')) validateHostileMatrix(record.hostile_matrix);
  if (options.flags.has('--require-fixture-manifest')) assertManifest(record.fixture_manifest);
  if (record.acceptance_marker?.status !== 'interactive-matrix-complete' || !isHash(record.acceptance_marker?.marker_sha256)) fail('acceptance marker is incomplete');
  if (options.flags.has('--require-approved') && record.approval?.status !== 'approved') fail('evidence is not separately approved');
}

async function mergeAcceptanceEvidence(observationsPath, deploymentRunPath, markerPath, outputPath) {
  const observations = await readEvidence(observationsPath);
  const marker = await readEvidence(markerPath);
  const deploymentRun = await readEvidence(deploymentRunPath);
  validateObservations(observations);
  validateMarkerRecord(marker, 'prelaunch-test');
  validateRun(deploymentRun, {
    values: new Map([['--expected-mode', 'prelaunch-test']]),
    flags: new Set(['--require-immutable-run']),
  });
  validateHostileMatrix(deploymentRun.hostile_matrix);
  assertManifest(deploymentRun.fixture_manifest);
  const markerSha256 = sha256(JSON.stringify(marker));
  if (
    sha256(JSON.stringify(observations)) !== marker.acceptance_marker.observations_sha256
    || JSON.stringify(observations) !== JSON.stringify(marker.observations)
    || deploymentRun.fingerprint !== marker.fingerprint
    || deploymentRun.public_origin !== marker.public_origin
    || JSON.stringify(deploymentRun.routes) !== JSON.stringify(marker.routes)
    || deploymentRun.acceptance_marker?.status !== marker.acceptance_marker.status
    || deploymentRun.acceptance_marker?.deployment_evidence_sha256 !== marker.acceptance_marker.deployment_evidence_sha256
    || deploymentRun.acceptance_marker?.observations_sha256 !== marker.acceptance_marker.observations_sha256
    || deploymentRun.acceptance_marker?.marker_sha256 !== markerSha256
    || evidenceDigest(deploymentRun) !== deploymentRun.artifacts.evidence_sha256
  ) fail('acceptance merge lineage does not match');
  await writeAcceptanceEvidence(outputPath, {
    version: EVIDENCE_VERSION,
    kind: 'acceptance',
    status: 'passed',
    mode: 'prelaunch-test',
    fingerprint: marker.fingerprint,
    public_origin: marker.public_origin,
    deployment_run: marker.run,
    run: deploymentRun.run,
    routes: marker.routes,
    acceptance_marker: deploymentRun.acceptance_marker,
    observations,
    hostile_matrix: deploymentRun.hostile_matrix,
    fixture_manifest: deploymentRun.fixture_manifest,
    artifacts: {
      deployment_evidence_sha256: marker.acceptance_marker.deployment_evidence_sha256,
      hostile_run_evidence_sha256: deploymentRun.artifacts.evidence_sha256,
      marker_sha256: markerSha256,
    },
    approval: { status: 'pending' },
  });
}

async function validatePromotion(record, options) {
  assertBaseRecord(record, 'promotion');
  if (record.status !== 'passed' || record.mode !== 'production-live') fail('promotion is incomplete');
  if (!options.values.has('--acceptance')) fail('promotion acceptance is required');
  const acceptance = await readEvidence(options.values.get('--acceptance'));
  await validateAcceptance(acceptance, {
    values: new Map([['--deployment', options.values.get('--deployment')]]),
    flags: new Set(['--require-approved', '--require-hostile-matrix', '--require-fixture-manifest', '--require-immutable-run']),
  });
  validateRun(record.cleanup, {
    values: new Map([['--expected-mode', 'prelaunch-test']]),
    flags: new Set(['--require-exact-cleanup', '--require-zero-authority', '--require-immutable-run']),
  }, acceptance);
  validateRun(record.live, {
    values: new Map([['--expected-mode', 'production-live']]),
    flags: new Set(['--require-zero-authority', '--require-immutable-run']),
  });
  assertManifest(record.live.authority_before, true);
  if (
    record.fingerprint !== acceptance.fingerprint
    || record.public_origin !== acceptance.public_origin
    || record.cleanup.fingerprint !== record.fingerprint
    || record.live.fingerprint !== record.fingerprint
    || record.cleanup.public_origin !== record.public_origin
    || record.live.public_origin !== record.public_origin
    || JSON.stringify(record.run) !== JSON.stringify(record.live.run)
    || JSON.stringify(record.authority) !== JSON.stringify(record.live.authority)
  ) fail('promotion project lineage does not match');
  const cleanupRun = {
    ...record.cleanup.run,
    fingerprint: record.cleanup.fingerprint,
    status: record.cleanup.status,
    authority_after: 'zero',
    evidence_sha256: record.cleanup.artifacts.evidence_sha256,
  };
  const liveRun = {
    ...record.live.run,
    fingerprint: record.live.fingerprint,
    status: record.live.status,
    evidence_sha256: record.live.artifacts.evidence_sha256,
  };
  if (
    JSON.stringify(record.cleanup_run) !== JSON.stringify(cleanupRun)
    || JSON.stringify(record.live_run) !== JSON.stringify(liveRun)
    || record.artifacts?.cleanup_evidence_sha256 !== cleanupRun.evidence_sha256
    || record.artifacts?.live_evidence_sha256 !== liveRun.evidence_sha256
  ) fail('promotion artifact lineage does not match');
  if (record.live.coherence?.status !== 'passed') fail('promotion live coherence is incomplete');
  if (record.live.live_smoke?.status !== 'passed' || record.live.live_smoke?.non_destructive !== true) fail('promotion live smoke is incomplete');
  if (JSON.stringify(record.live_smoke) !== JSON.stringify(record.live.live_smoke)) fail('promotion live smoke lineage does not match');
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function safeDatabaseError(body) {
  const normalized = body.toLowerCase();
  const categories = ['generated always', 'null value', 'not-null', 'invalid input syntax', 'duplicate key', 'permission denied', 'does not exist', 'violates']
    .filter((value) => normalized.includes(value));
  const columns = ['instance_id', 'confirmed_at', 'email_confirmed_at', 'email', 'confirmation_token', 'email_change', 'email_change_token_new', 'recovery_token', 'aud', 'role']
    .filter((value) => normalized.includes(value));
  return `category=${categories.join('+') || 'unknown'};column=${columns.join('+') || 'unknown'}`;
}

async function databaseQuery(inputs, query, operation, readOnly = false) {
  if (!readOnly) guardTarget(inputs);
  try {
    return await managementRequest(inputs, `/v1/projects/${inputs.SUPABASE_PROJECT_REF}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query, read_only: readOnly }),
      safeErrorDetail: safeDatabaseError,
    });
  } catch (error) {
    if (error instanceof HostedRequestError) throw new HostedRequestError(error.status, `hosted database ${operation}`, error.detail);
    throw error;
  }
}

async function expectDatabaseRejection(operation) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof HostedRequestError && (error.status === 400 || error.status === 422)) return;
    throw error;
  }
  fail('hostile database mutation was accepted');
}

async function stripeRequest(inputs, path, { method = 'POST', operation = 'request', params } = {}) {
  if (method !== 'GET') guardTarget(inputs);
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${inputs.STRIPE_SECRET_KEY}`,
      ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params?.toString(),
  });
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    fail(`Stripe acceptance ${operation} returned invalid JSON`);
  }
  if (!response.ok) {
    const code = typeof payload?.error?.code === 'string' && /^[a-z0-9_]{1,80}$/u.test(payload.error.code) ? payload.error.code : 'unknown';
    const parameter = typeof payload?.error?.param === 'string' && /^[a-z0-9_[\].]{1,80}$/u.test(payload.error.param) ? payload.error.param : 'unknown';
    fail(`Stripe acceptance ${operation} failed with HTTP ${response.status}, code ${code}, parameter ${parameter}`);
  }
  return payload;
}

function installationId() {
  return randomBytes(32).toString('base64url');
}

function fixtureHandles(caseId, fixtures) {
  return fixtures.map(([kind, value]) => sha256(`${caseId}:${kind}:${requireString(value, 'hostile fixture')}`)).sort();
}

async function insertAcceptanceUser(inputs) {
  const id = randomUUID();
  await databaseQuery(inputs, `
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (${sqlText(id)}::uuid, 'authenticated', 'authenticated', ${sqlText(`${id}@example.test`)}, '', now(), now(), now())
  `, 'user insertion');
  return id;
}

async function createIntent(inputs, action, targetInstallation, expired = false) {
  const digest = randomBytes(32).toString('hex');
  const result = await databaseQuery(inputs, `
    select public.create_support_intent(
      ${sqlText(action)},
      ${sqlText(targetInstallation)},
      decode(${sqlText(digest)}, 'hex'),
      now() ${expired ? "- interval '1 second'" : "+ interval '10 minutes'"}
    )::text as id
  `, 'intent creation');
  return { id: requireString(result?.[0]?.id, 'support intent id'), digest };
}

async function claimIntent(inputs, intent, userId) {
  return databaseQuery(inputs, `
    select * from public.claim_support_intent(
      decode(${sqlText(intent.digest)}, 'hex'),
      ${sqlText(userId)}::uuid
    )
  `, 'intent claim');
}

async function recordCheckout(inputs, fixture, userId, targetInstallation) {
  return databaseQuery(inputs, `
    select public.record_checkout_session(
      ${sqlText(fixture.intentId)}::uuid,
      ${sqlText(fixture.sessionId)},
      ${sqlText(userId)}::uuid,
      ${sqlText(targetInstallation)},
      ${sqlText(fixture.currency)},
      ${sqlText(fixture.priceId)},
      ${fixture.amount},
      1
    )
  `, 'checkout recording');
}

async function createStripePrice(inputs, amount, currency) {
  const product = await stripeRequest(inputs, '/v1/products', {
    operation: 'product creation',
    params: new URLSearchParams({ name: `${renameMap.slug}-acceptance-${randomUUID()}` }),
  });
  const price = await stripeRequest(inputs, '/v1/prices', {
    operation: 'price creation',
    params: new URLSearchParams({
      product: requireString(product.id, 'Stripe product id'),
      unit_amount: String(amount),
      currency,
    }),
  });
  return {
    productId: requireString(product.id, 'Stripe product id'),
    priceId: requireString(price.id, 'Stripe price id'),
  };
}

async function createStripeSession(inputs, priceId, metadata) {
  const params = new URLSearchParams({
    success_url: inputs.routes.supportFlowComplete,
    cancel_url: inputs.routes.supportFlowComplete,
    mode: 'payment',
    customer_creation: 'always',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
  });
  for (const [key, value] of Object.entries(metadata ?? {})) params.set(`metadata[${key}]`, value);
  const session = await stripeRequest(inputs, '/v1/checkout/sessions', { operation: 'session creation', params });
  if (!Number.isSafeInteger(session.created)) fail('Stripe Checkout Session timestamp is invalid');
  return {
    id: requireString(session.id, 'Stripe Checkout Session id'),
    created: session.created,
  };
}

async function completeStripeSession(inputs, sessionId, expectedAmount) {
  await stripeRequest(inputs, `/v1/payment_pages/${encodeURIComponent(sessionId)}`, { method: 'GET', operation: 'payment page initialization' });
  const paymentMethod = await stripeRequest(inputs, '/v1/payment_methods', {
    operation: 'payment method creation',
    params: new URLSearchParams({
      type: 'card',
      'card[token]': 'tok_visa',
      'billing_details[email]': `${renameMap.slug}-acceptance@example.com`,
      'billing_details[name]': `${renameMap.displayName} Acceptance`,
      'billing_details[address][line1]': '510 Townsend St',
      'billing_details[address][postal_code]': '94103',
      'billing_details[address][city]': 'San Francisco',
      'billing_details[address][state]': 'CA',
      'billing_details[address][country]': 'US',
    }),
  });
  await stripeRequest(inputs, `/v1/payment_pages/${encodeURIComponent(sessionId)}/confirm`, {
    operation: 'payment confirmation',
    params: new URLSearchParams({
      payment_method: requireString(paymentMethod.id, 'Stripe PaymentMethod id'),
      expected_amount: String(expectedAmount),
    }),
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const session = await stripeRequest(inputs, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price`, { method: 'GET', operation: 'session retrieval' });
    if (session.payment_status === 'paid') return requireString(paymentMethod.id, 'Stripe PaymentMethod id');
    await delay(250);
  }
  fail('Stripe Checkout Session did not become paid');
}

async function checkoutEventForSession(inputs, sessionId, created) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const events = await stripeRequest(inputs, `/v1/events?type=checkout.session.completed&created[gte]=${created}&limit=100`, { method: 'GET', operation: 'event retrieval' });
    const event = Array.isArray(events.data) ? events.data.find((candidate) => candidate?.data?.object?.id === sessionId) : undefined;
    if (event?.id) return requireString(event.id, 'Stripe Event id');
    await delay(250);
  }
  fail('Stripe Checkout completion event was unavailable');
}

async function createPaidStripeFixture(inputs, { amount, currency, priceId, metadata }) {
  const session = await createStripeSession(inputs, priceId, metadata);
  const paymentMethodId = await completeStripeSession(inputs, session.id, amount);
  const eventId = await checkoutEventForSession(inputs, session.id, session.created);
  return { sessionId: session.id, paymentMethodId, eventId };
}

async function updateStripeMetadata(inputs, sessionId, metadata) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(metadata)) params.set(`metadata[${key}]`, value);
  await stripeRequest(inputs, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { operation: 'session metadata update', params });
}

async function postWebhook(inputs, eventId, sessionId, validSignature = true) {
  const body = JSON.stringify({ id: eventId, type: 'checkout.session.completed', data: { object: { id: sessionId } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = validSignature
    ? createHmac('sha256', inputs.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')
    : '0'.repeat(64);
  guardTarget(inputs);
  const response = await fetch(inputs.routes.stripeWebhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
  return response.status;
}

async function runWrongSignature(inputs) {
  const eventId = `evt_${randomUUID()}`;
  const before = await snapshotAuthority(inputs);
  const status = await postWebhook(inputs, eventId, `cs_${randomUUID()}`, false);
  const after = await snapshotAuthority(inputs);
  if (status !== 400 || JSON.stringify(before) !== JSON.stringify(after)) fail('wrong-signature invariant failed');
  return {
    id: 'wrong-signature',
    fixtures: fixtureHandles('wrong-signature', [['event', eventId]]),
    before,
    after,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  };
}

async function runWrongStripeInvariant(inputs, id, amount, currency) {
  const { productId, priceId } = await createStripePrice(inputs, amount, currency);
  const metadata = { user_id: randomUUID(), installation_id: installationId(), intent_id: randomUUID() };
  const fixture = await createPaidStripeFixture(inputs, { amount, currency, priceId, metadata });
  const before = await snapshotAuthority(inputs);
  const status = await postWebhook(inputs, fixture.eventId, fixture.sessionId);
  const after = await snapshotAuthority(inputs);
  if (status !== 400 || JSON.stringify(before) !== JSON.stringify(after)) fail(`${id} invariant failed`);
  return {
    id,
    fixtures: fixtureHandles(id, [
      ['product', productId],
      ['price', priceId],
      ['session', fixture.sessionId],
      ['payment-method', fixture.paymentMethodId],
      ['event', fixture.eventId],
    ]),
    before,
    after,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  };
}

async function runWrongBinding(inputs) {
  const ownerId = await insertAcceptanceUser(inputs);
  const otherId = await insertAcceptanceUser(inputs);
  const targetInstallation = installationId();
  const intent = await createIntent(inputs, 'support', targetInstallation);
  await claimIntent(inputs, intent, ownerId);
  const session = await createStripeSession(inputs, inputs.STRIPE_PRICE_ID);
  const before = await snapshotAuthority(inputs);
  await expectDatabaseRejection(() => recordCheckout(inputs, {
    intentId: intent.id,
    sessionId: session.id,
    currency: 'usd',
    priceId: inputs.STRIPE_PRICE_ID,
    amount: 4999,
  }, otherId, targetInstallation));
  const after = await snapshotAuthority(inputs);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('wrong-binding invariant failed');
  return {
    id: 'wrong-binding',
    fixtures: fixtureHandles('wrong-binding', [['owner', ownerId], ['other', otherId], ['intent', intent.id], ['session', session.id]]),
    before,
    after,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  };
}

async function runExpiredIntent(inputs) {
  const userId = await insertAcceptanceUser(inputs);
  const intent = await createIntent(inputs, 'restore', installationId(), true);
  const before = await snapshotAuthority(inputs);
  await expectDatabaseRejection(() => claimIntent(inputs, intent, userId));
  const after = await snapshotAuthority(inputs);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('expired-intent invariant failed');
  return {
    id: 'expired-intent',
    fixtures: fixtureHandles('expired-intent', [['user', userId], ['intent', intent.id]]),
    before,
    after,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  };
}

async function runReusedIntent(inputs) {
  const userId = await insertAcceptanceUser(inputs);
  const intent = await createIntent(inputs, 'restore', installationId());
  await claimIntent(inputs, intent, userId);
  const before = await snapshotAuthority(inputs);
  await expectDatabaseRejection(() => claimIntent(inputs, intent, userId));
  const after = await snapshotAuthority(inputs);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('reused-intent invariant failed');
  return {
    id: 'reused-intent',
    fixtures: fixtureHandles('reused-intent', [['user', userId], ['intent', intent.id]]),
    before,
    after,
    expected: 'rejected-without-authority',
    actual: 'rejected-without-authority',
    guard: true,
  };
}

async function prepareSettlement(inputs, caseId) {
  const userId = await insertAcceptanceUser(inputs);
  const targetInstallation = installationId();
  const intent = await createIntent(inputs, 'support', targetInstallation);
  await claimIntent(inputs, intent, userId);
  const fixture = await createPaidStripeFixture(inputs, {
    amount: 4999,
    currency: 'usd',
    priceId: inputs.STRIPE_PRICE_ID,
  });
  await recordCheckout(inputs, {
    intentId: intent.id,
    sessionId: fixture.sessionId,
    currency: 'usd',
    priceId: inputs.STRIPE_PRICE_ID,
    amount: 4999,
  }, userId, targetInstallation);
  const before = await snapshotAuthority(inputs);
  await updateStripeMetadata(inputs, fixture.sessionId, {
    user_id: userId,
    installation_id: targetInstallation,
    intent_id: intent.id,
  });
  return {
    userId,
    intentId: intent.id,
    fixture,
    before,
    fixtures: fixtureHandles(caseId, [
      ['user', userId],
      ['intent', intent.id],
      ['session', fixture.sessionId],
      ['payment-method', fixture.paymentMethodId],
      ['event', fixture.eventId],
    ]),
  };
}

async function runSequentialReplay(inputs) {
  const prepared = await prepareSettlement(inputs, 'sequential-replay');
  const first = await postWebhook(inputs, prepared.fixture.eventId, prepared.fixture.sessionId);
  const firstAfter = await snapshotAuthority(inputs);
  const second = await postWebhook(inputs, prepared.fixture.eventId, prepared.fixture.sessionId);
  const after = await snapshotAuthority(inputs);
  return {
    id: 'sequential-replay',
    fixtures: prepared.fixtures,
    before: prepared.before,
    after,
    first_after: firstAfter,
    responses: [first, second],
    expected: 'idempotent-replay',
    actual: 'idempotent-replay',
    guard: true,
  };
}

async function runConcurrentReplay(inputs) {
  const prepared = await prepareSettlement(inputs, 'concurrent-replay-settlement');
  const responses = await Promise.all([
    postWebhook(inputs, prepared.fixture.eventId, prepared.fixture.sessionId),
    postWebhook(inputs, prepared.fixture.eventId, prepared.fixture.sessionId),
  ]);
  const after = await snapshotAuthority(inputs);
  return {
    id: 'concurrent-replay-settlement',
    fixtures: prepared.fixtures,
    before: prepared.before,
    after,
    responses,
    expected: 'single-authority-settlement',
    actual: 'single-authority-settlement',
    guard: true,
  };
}

async function runHostileExecutor(inputs, marker) {
  if (inputs.SUPPORT_PROVIDER_MODE !== 'prelaunch-test') fail('hostile executor is unavailable in live mode');
  validateMarkerRecord(marker, 'prelaunch-test');
  const results = [
    await runWrongSignature(inputs),
    await runWrongStripeInvariant(inputs, 'wrong-product', 4999, 'usd'),
    await runWrongStripeInvariant(inputs, 'wrong-amount', 5000, 'usd'),
    await runExpiredIntent(inputs),
    await runReusedIntent(inputs),
    await runSequentialReplay(inputs),
    await runConcurrentReplay(inputs),
  ];
  validateHostileMatrix(results);
  return results;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === '--retirement-review') return retirementReview(options.values.get('--output'));
  if (options.command === '--local-package-security-review') return localPackageSecurityReview(options.values.get('--output'));
  if (options.command === '--final-review') return finalReview(options, true);
  if (options.command === '--check-final') return finalReview(options, false);
  if (options.command === '--verify-workflow') return verifyWorkflow(options.values.get('--verify-workflow'), options);
  if (options.command === '--check-release-evidence') return checkReleaseEvidence(options);
  if (options.command === '--check-run-evidence') {
    const record = await readEvidence(options.values.get('--check-run-evidence'));
    let acceptance;
    if (options.values.has('--acceptance')) {
      if (!options.values.has('--deployment')) fail('missing required option --deployment');
      acceptance = await readEvidence(options.values.get('--acceptance'));
      await validateAcceptance(acceptance, {
        values: new Map([['--deployment', options.values.get('--deployment')]]),
        flags: new Set(['--require-approved', '--require-hostile-matrix', '--require-fixture-manifest', '--require-immutable-run']),
      });
    }
    return validateRun(record, options, acceptance);
  }
  if (options.command === '--check-acceptance-evidence') return validateAcceptance(await readEvidence(options.values.get('--check-acceptance-evidence')), options);
  if (options.command === '--check-acceptance-marker') {
    return validateAcceptanceMarker(
      await readEvidence(options.values.get('--check-acceptance-marker')),
      options.values.get('--deployment'),
      options.values.get('--expected-mode'),
    );
  }
  if (options.command === '--merge-acceptance-evidence') {
    return mergeAcceptanceEvidence(
      options.values.get('--merge-acceptance-evidence'),
      options.values.get('--deployment-run'),
      options.values.get('--marker'),
      options.values.get('--output'),
    );
  }
  if (options.command === '--check-promotion-evidence') return validatePromotion(await readEvidence(options.values.get('--check-promotion-evidence')), options);
  const inputs = protectedInputs(process.env);
  if (inputs.SUPPORT_PROVIDER_MODE !== options.values.get('--mode')) fail('deployment mode does not match protected inputs');
  return deploy(inputs, options.values.get('--evidence'), options.values.get('--acceptance-marker'), options.values.get('--acceptance'));
}

async function verifyWorkflow(path, options) {
  const workflow = await readFile(path, 'utf8');
  const required = [
    'push:', 'branches: [main]', 'contents: read', 'group: supabase-production', 'cancel-in-progress: false',
    'repository-gates:', 'deploy-production:', 'needs: repository-gates', 'environment: production',
    'actions/setup-node@v4', 'node-version: 24', 'denoland/setup-deno@v2', 'deno-version: v2.7.14',
    'npm ci', 'npm run build', 'npm run typecheck:tests', 'npx playwright install --with-deps chromium', 'npx vitest run --no-file-parallelism', 'npx playwright test', 'deno test --allow-env --config supabase/functions/deno.json supabase/functions/tests',
    'npx supabase@2.114.0 db start', 'npx supabase@2.114.0 db reset --local --no-seed', 'npx supabase@2.114.0 test db', 'npx supabase@2.114.0 migration list --local', 'npx supabase@2.114.0 db lint --local', '--run-deployment', '02-09-ACCEPTANCE-EVIDENCE.md', 'args+=(--acceptance "$acceptance")', 'production-live',
  ];
  for (const value of required) if (!workflow.includes(value)) fail(`workflow is missing required ${value}`);
  const commands = new Set(workflow.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- run:')).map((line) => line.slice('- run:'.length).trim()));
  for (const value of ['npm ci', 'npm run build', 'npm run typecheck:tests', 'npx playwright install --with-deps chromium', 'npx vitest run --no-file-parallelism', 'npx playwright test', 'deno test --allow-env --config supabase/functions/deno.json supabase/functions/tests', 'npx supabase@2.114.0 db start', 'npx supabase@2.114.0 db reset --local --no-seed', 'npx supabase@2.114.0 test db', 'npx supabase@2.114.0 migration list --local', 'npx supabase@2.114.0 db lint --local']) {
    if (!commands.has(value)) fail(`workflow is missing required ${value}`);
  }
  if (/workflow_dispatch:|paths(?:-ignore)?:/u.test(workflow)) fail('workflow has a forbidden trigger filter');
  const gates = workflow.slice(workflow.indexOf('repository-gates:'), workflow.indexOf('deploy-production:'));
  for (const value of ['actions/setup-node@v4', 'node-version: 24', 'denoland/setup-deno@v2', 'deno-version: v2.7.14']) {
    if (!gates.includes(value)) fail(`workflow is missing required ${value}`);
  }
  const gateCommands = new Set(gates.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- run:')).map((line) => line.slice('- run:'.length).trim()));
  for (const value of ['npm ci', 'npm run build', 'npm run typecheck:tests', 'npx playwright install --with-deps chromium', 'npx vitest run --no-file-parallelism', 'npx playwright test', 'deno test --allow-env --config supabase/functions/deno.json supabase/functions/tests', 'npx supabase@2.114.0 db start', 'npx supabase@2.114.0 db reset --local --no-seed', 'npx supabase@2.114.0 test db', 'npx supabase@2.114.0 migration list --local', 'npx supabase@2.114.0 db lint --local']) {
    if (!gateCommands.has(value)) fail(`workflow is missing required ${value}`);
  }
  const testOrder = ['npm ci', 'npm run build', 'npx playwright install --with-deps chromium', 'npx vitest run --no-file-parallelism'].map((value) => workflow.indexOf(value));
  if (testOrder.some((index) => index < 0) || testOrder.some((index, position) => position > 0 && index < testOrder[position - 1])) fail('workflow test gates are out of order');
  if (/environment:|secrets\.|SUPABASE_|STRIPE_|APPROVED_SUPABASE/u.test(gates)) fail('repository-gates must be credential-free');
  const order = ['npx supabase@2.114.0 db start', 'npx supabase@2.114.0 db reset --local --no-seed', 'npx supabase@2.114.0 test db', 'npx supabase@2.114.0 migration list --local', 'npx supabase@2.114.0 db lint --local'].map((value) => workflow.indexOf(value));
  if (order.some((index) => index < 0) || order.some((index, position) => position > 0 && index < order[position - 1])) fail('workflow database gates are out of order');
  if (options.values.has('--require-environment') && options.values.get('--require-environment') !== 'production') fail('workflow only supports the production environment');
  if (options.values.has('--expected-mode') && !workflow.includes('SUPPORT_PROVIDER_MODE: ${{ vars.SUPPORT_PROVIDER_MODE }}')) fail('workflow does not map the protected deployment mode');
  if (!workflow.includes('SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}')) fail('workflow does not map the protected project ref');
  for (const input of RETIRED_INPUTS) if (workflow.includes(input)) fail('workflow contains forbidden retired input');
  if (workflow.includes('--acceptance-marker')) fail('workflow retains obsolete hostile acceptance branch');
  if (/\b(?:domains|custom-domain|custom domain|dns|cname|txt)\b/iu.test(workflow)) fail('workflow contains forbidden domain lifecycle');
  const guard = '[[ "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || exit 1';
  const deployGuard = workflow.indexOf('name: Guard canonical Supabase target');
  const deploy = workflow.indexOf('name: Deploy guarded Supabase release');
  const release = workflow.indexOf('name: Verify configured deployment runtime package');
  const upload = workflow.indexOf('actions/upload-artifact@v4');
  const deployInstall = workflow.indexOf('      - run: npm ci', workflow.indexOf('deploy-production:'));
  if (
    deployInstall < 0 || deployInstall > release || deployGuard < 0 || deploy < 0 || release < 0 || upload < 0
    || deployGuard > deploy || !workflow.includes(guard) || new RegExp(`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL:\\s*\\$\\{\\{`, 'u').test(workflow)
  ) fail('workflow does not guard the release project ref');
  const releaseBlock = workflow.slice(release, upload);
  const producer = 'node scripts/pack-runtime.mjs --purpose deployment-check --custody-dir "$custody" --evidence "$evidence"';
  const verifier = 'node scripts/verify-production-artifacts.mjs --archive "$archive" --expected-sha256 "$expected_sha256" --evidence "$evidence"';
  if (
    !releaseBlock.includes(`origin="https://${'${SUPABASE_PROJECT_REF}'}.supabase.co"`)
    || !releaseBlock.includes(`export ${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL="$origin"`)
    || !releaseBlock.includes(producer)
    || !releaseBlock.includes('archive_basename=')
    || !releaseBlock.includes('archive="$custody/$archive_basename"')
    || !releaseBlock.includes('expected_sha256=')
    || !releaseBlock.includes(verifier)
    || !releaseBlock.includes('trap cleanup EXIT')
    || releaseBlock.includes('npm run build')
    || releaseBlock.includes('npm pack')
    || (workflow.match(/scripts\/pack-runtime\.mjs/g) ?? []).length !== 1
    || (workflow.match(/scripts\/verify-production-artifacts\.mjs/g) ?? []).length !== 1
  ) fail('workflow does not verify one configured deployment-check artifact');
  const uploadSteps = workflow.match(/^\s*(?:-\s+)?uses:\s+actions\/upload-artifact@/gmu) ?? [];
  const uploadPath = workflow.slice(upload).match(/^\s*path:\s*([^\r\n]+)$/mu)?.[1]?.trim();
  if (uploadSteps.length !== 1 || uploadPath !== 'supabase-deployment-evidence.json') {
    fail('workflow must upload only redacted deployment evidence');
  }
}

main().catch((error) => {
  process.stderr.write(`supabase support verifier rejected: ${error.message}\n`);
  process.exitCode = 1;
});
