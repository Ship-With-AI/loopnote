import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { expect, test } from 'vitest';
import { z } from 'zod';
import { bootstrapVersion, version as stableVersion } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

import { readRuntimeArtifact, rehashRuntimeArtifact } from '../helpers/runtime-artifact.js';
import { assertSourceControlUnchanged, captureSourceControlSnapshot } from '../helpers/source-control-snapshot.js';
import { hasObservedNativeReExport } from '../helpers/agent-ready-export-target.js';

const projectRoot = resolve(import.meta.dirname, '../..');
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const passed = z.literal(true);
const archiveSchema = z.strictObject({
  basename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u),
  byteLength: z.number().int().positive(),
  sha256: hash,
  npmShasumSha1: z.string().regex(/^[a-f0-9]{40}$/u),
  npmIntegritySha512: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/u),
});
type SelectedProfile = 'stable' | 'bootstrap';

function profileIdentity(profile: 'bootstrap' | undefined) {
  return profile === 'bootstrap'
    ? { profile: 'bootstrap' as const, purpose: 'bootstrap' as const, version: bootstrapVersion }
    : { profile: 'stable' as const, purpose: 'candidate' as const, version: stableVersion };
}

function packageSchema(version: string) {
  return z.strictObject({
    name: z.literal(RENAME_MAP.npmPackage),
    version: z.literal(version),
    runtimeDependencies: z.record(z.string(), z.string()),
  });
}

function installSchema(version: string) {
  return z.strictObject({
    packageLabel: z.literal(`${RENAME_MAP.npmPackage}@${version}`),
    binLabel: z.literal(RENAME_MAP.binCommand),
    manifestSha256: hash,
    dependencyCount: z.number().int().positive(),
    dependencyInventorySha256: hash,
  });
}

function scannerSchema(profile: SelectedProfile) {
  const identity = profileIdentity(profile === 'bootstrap' ? 'bootstrap' : undefined);
  return z.strictObject({
    kind: z.literal(`${RENAME_MAP.kindPrefix}.runtime-artifact-verification/v1`),
    status: z.literal('passed'),
    purpose: z.literal(identity.purpose),
    ...(profile === 'bootstrap' ? { profile: z.literal('bootstrap') } : {}),
    archive: archiveSchema,
    inventory: z.strictObject({ sha256: hash, count: z.number().int().positive(), bytes: z.number().int().positive() }),
    legal: z.strictObject({ README: hash, LICENSE: hash, THIRD_PARTY_NOTICES: hash }),
    package: packageSchema(identity.version),
    web: z.strictObject({ entry: z.literal('dist/web/index.html'), reachableFiles: z.number().int().positive(), workerRoles: z.array(z.string()), codicon: passed }),
    native: z.strictObject({ target: z.string(), binary: z.boolean(), fallback: z.literal('reExportUnsupported') }),
    support: z.strictObject({ configured: passed, originSha256: hash }),
    checks: z.strictObject({ archiveIdentity: passed, protectedExtraction: passed, inventoryParity: passed, legalParity: passed, completeDistParity: passed, boundedContentScan: passed }),
    limitations: z.array(z.string()),
  });
}

function driverEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
}

function runChild(command: string, args: string[], environment: NodeJS.ProcessEnv, origin: string): string {
  try {
    return execFileSync(command, args, { cwd: projectRoot, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    const diagnostics = `${failure.stdout ?? ''}${failure.stderr ?? ''}`.replaceAll(origin, '[support-origin]');
    throw new Error(`Runtime acceptance child failed (exit ${failure.status ?? 'unavailable'}):\n${diagnostics}`);
  }
}

function parseScenarios(
  runId: string,
  expected: { archive: z.infer<typeof archiveSchema>; package: { name: string; version: string; runtimeDependencies: Record<string, string> }; manifestSha256: string },
  assetInput: unknown,
  reviewInput: unknown,
  selectedBootstrapProfile?: 'bootstrap',
) {
  const identity = profileIdentity(selectedBootstrapProfile);
  const native = hasObservedNativeReExport(process.platform, process.arch);
  const common = {
    kind: z.literal(`${RENAME_MAP.kindPrefix}.runtime-artifact-scenario/v1`),
    status: z.literal('passed'),
    runId: z.literal(runId),
    profile: z.literal(identity.profile),
    archive: archiveSchema,
    package: packageSchema(identity.version),
    install: installSchema(identity.version),
    target: z.strictObject({ platform: z.literal(process.platform), arch: z.literal(process.arch) }),
    cleanup: z.strictObject({ complete: passed }),
  };
  const assetSchema = z.strictObject({
    ...common,
    scenario: z.literal('package-assets'),
    browser: z.strictObject({ assets: passed, workers: passed, codicon: passed }),
    checks: z.strictObject({ version: passed, help: passed, isolatedInstall: passed, dependencyTree: passed }),
  });
  const reviewSchema = z.strictObject({
    ...common,
    scenario: z.literal('review'),
    review: z.strictObject({ relaunch: passed, canonicalV2: passed, isolatedDrafts: passed, reExport: z.literal(native ? 'exported' : 'reExportUnsupported') }),
    support: z.strictObject({ unavailable: passed, dismissed: passed, unrestricted: passed }),
    exactPatch: z.strictObject({ canonicalV3: passed, grounded: passed }),
    native: z.strictObject({ observedReExport: z.literal(native), fallback: z.literal('reExportUnsupported') }),
    sourceControl: z.strictObject({
      unchanged: passed,
      scenarios: z.array(z.strictObject({ name: z.string().min(1), unchanged: z.literal(true) })).nonempty(),
    }),
    checks: z.strictObject({ finish: passed }),
  });
  const assets = assetSchema.parse(assetInput);
  const review = reviewSchema.parse(reviewInput);
  for (const scenario of [assets, review]) {
    expect(scenario.archive).toEqual(expected.archive);
    expect(scenario.package).toEqual(expected.package);
    expect(scenario.install.manifestSha256).toBe(expected.manifestSha256);
  }
  expect(assets.install).toEqual(review.install);
  return { assets, review };
}

test('accepts one supplied candidate through isolated installed browser and Finish workflows', { timeout: 600_000 }, async () => {
  const origin = process.env[`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  if (!origin) throw new Error(`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL is required for candidate acceptance`);
  const reportPath = process.env[`${RENAME_MAP.envPrefix}RUNTIME_ACCEPTANCE_REPORT`];
  if (!reportPath || !isAbsolute(reportPath) || existsSync(reportPath)) throw new Error('A new absolute acceptance report path is required');
  if (!lstatSync(dirname(reportPath)).isDirectory()) throw new Error('Acceptance report parent must be a directory');
  const requestedProfile = process.env[`${RENAME_MAP.envPrefix}RUNTIME_PROFILE`];
  if (requestedProfile !== undefined && requestedProfile !== 'bootstrap') throw new Error(`${RENAME_MAP.envPrefix}RUNTIME_PROFILE must be bootstrap when set`);
  const selected = profileIdentity(requestedProfile);
  const artifact = readRuntimeArtifact();
  const archive = archiveSchema.parse(artifact.archive);
  const packageIdentity = packageSchema(selected.version).parse(artifact.package);
  if (
    artifact.profile !== selected.profile
    || artifact.evidence.purpose !== selected.purpose
    || (selected.profile === 'bootstrap' && artifact.evidence.status !== 'bootstrap')
    || (selected.profile === 'stable' && !['candidate', 'verified', 'accepted-local'].includes(artifact.evidence.status))
  ) throw new Error('Runtime profile evidence is not eligible for acceptance');
  if (resolve(reportPath) === artifact.archivePath || resolve(reportPath) === resolve(process.env[`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]!)) throw new Error('Acceptance report must not overwrite archive or evidence');
  if (realpathSync(dirname(reportPath)) === realpathSync(dirname(artifact.archivePath))) throw new Error('Acceptance reports must remain outside archive custody');

  const before = await captureSourceControlSnapshot(projectRoot);
  const scanner = scannerSchema(selected.profile).parse(JSON.parse(runChild(process.execPath, [
    join(projectRoot, 'scripts/verify-production-artifacts.mjs'),
    '--archive', artifact.archivePath,
    '--expected-sha256', archive.sha256,
    '--evidence', process.env[`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]!,
    ...(selected.profile === 'bootstrap' ? ['--profile', 'bootstrap'] : []),
  ], { ...driverEnvironment(), [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin }, origin)));
  expect(scanner.archive).toEqual(archive);
  expect(scanner.package).toEqual(packageIdentity);
  expect(scanner.support.originSha256).toBe(createHash('sha256').update(origin).digest('hex'));
  expect([...scanner.web.workerRoles].sort()).toEqual(['css', 'editor', 'html', 'json', 'ts']);
  rehashRuntimeArtifact(artifact);

  const directory = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-runtime-acceptance-`));
  const bridge = join(directory, 'scenario');
  const runId = randomUUID();
  try {
    const childEnvironment = driverEnvironment();
    for (const key of [`${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR`, `${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_BASENAME`, `${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`, `${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]) childEnvironment[key] = process.env[key];
    if (selected.profile === 'bootstrap') childEnvironment[`${RENAME_MAP.envPrefix}RUNTIME_PROFILE`] = 'bootstrap';
    childEnvironment[`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_REPORT`] = bridge;
    childEnvironment[`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_RUN_ID`] = runId;
    runChild(process.execPath, [join(projectRoot, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.runtime-artifact.config.ts', 'tests/e2e/package-assets.spec.ts', 'tests/e2e/agent-ready-export.spec.ts'], childEnvironment, origin);
    const { assets, review } = parseScenarios(
      runId,
      {
        archive,
        package: packageIdentity,
        manifestSha256: selected.profile === 'bootstrap'
          ? artifact.evidence.package.manifestProjection!.packedOutputSha256
          : artifact.evidence.source.packageJsonSha256,
      },
      JSON.parse(readFileSync(`${bridge}.package-assets.json`, 'utf8')),
      JSON.parse(readFileSync(`${bridge}.review.json`, 'utf8')),
      selected.profile === 'bootstrap' ? 'bootstrap' : undefined,
    );
    rehashRuntimeArtifact(artifact);
    await assertSourceControlUnchanged(before, await captureSourceControlSnapshot(projectRoot));
    rmSync(directory, { recursive: true, force: true });
    const result = {
      kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-acceptance/v1`,
      status: 'passed',
      profile: selected.profile,
      purpose: selected.purpose,
      archive,
      package: packageIdentity,
      install: assets.install,
      scanner,
      browser: assets.browser,
      review: review.review,
      support: { ...review.support, ...scanner.support },
      exactPatch: review.exactPatch,
      native: { ...review.native, target: review.target },
      cleanup: { complete: true },
      sourceControl: review.sourceControl,
      checks: ['PKG-03', 'PKG-04', 'PKG-05', 'REL-03'],
      limitations: ['Local installed archive only; no registry, publication, provenance or public-source alignment claim.', 'Native re-export observation is limited to the actual target; other targets retain reExportUnsupported.', 'Dependency resolution is observed at installation time; transitive dependencies are not inside the tarball.', 'Static disclosure scanning is bounded and assumes trusted local producer output.'],
    };
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    for (const privateValue of [origin, artifact.archivePath, directory, projectRoot, process.env[`${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR`]!, process.env[`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]!]) {
      if (serialized.includes(privateValue)) throw new Error('Acceptance report contains a private value');
    }
    const temporary = join(dirname(reportPath), `.acceptance-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, serialized, { flag: 'wx', mode: 0o600 });
      rehashRuntimeArtifact(artifact);
      linkSync(temporary, reportPath);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test.for(['stable', 'bootstrap'] as const)('enforces trusted %s scenario identity across passed and substituted reports', (profile) => {
  const version = profile === 'bootstrap' ? bootstrapVersion : stableVersion;
  const selectedProfile = profile === 'bootstrap' ? 'bootstrap' : undefined;
  const digest = 'a'.repeat(64);
  const expected = {
    archive: {
      basename: `shipwithai-${RENAME_MAP.slug}-${version}.tgz`,
      byteLength: 1,
      sha256: digest,
      npmShasumSha1: 'b'.repeat(40),
      npmIntegritySha512: `sha512-${createHash('sha512').update('fixture').digest('base64')}`,
    },
    package: { name: RENAME_MAP.npmPackage, version, runtimeDependencies: { zod: '4.4.3' } },
    manifestSha256: digest,
  };
  const native = hasObservedNativeReExport(process.platform, process.arch);
  const common = {
    kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-scenario/v1`,
    status: 'passed',
    runId: 'current-run',
    profile,
    archive: expected.archive,
    package: expected.package,
    install: { packageLabel: `${RENAME_MAP.npmPackage}@${version}`, binLabel: RENAME_MAP.binCommand, manifestSha256: digest, dependencyCount: 1, dependencyInventorySha256: digest },
    target: { platform: process.platform, arch: process.arch },
    cleanup: { complete: true },
  };
  const assets = {
    ...common,
    scenario: 'package-assets',
    browser: { assets: true, workers: true, codicon: true },
    checks: { version: true, help: true, isolatedInstall: true, dependencyTree: true },
  };
  const review = {
    ...common,
    scenario: 'review',
    review: { relaunch: true, canonicalV2: true, isolatedDrafts: true, reExport: native ? 'exported' : 'reExportUnsupported' },
    support: { unavailable: true, dismissed: true, unrestricted: true },
    exactPatch: { canonicalV3: true, grounded: true },
    native: { observedReExport: native, fallback: 'reExportUnsupported' },
    sourceControl: { unchanged: true, scenarios: [{ name: 'review', unchanged: true }] },
    checks: { finish: true },
  };
  const parsed = parseScenarios('current-run', expected, assets, review, selectedProfile);
  expect(parsed.assets.package.version).toBe(version);
  if (selectedProfile === 'bootstrap') expect(() => parseScenarios('current-run', expected, assets, review)).toThrow();
  const substitutions: Array<[string[], unknown]> = [
    [['assets', 'archive', 'sha256'], 'c'.repeat(64)],
    [['assets', 'archive', 'npmShasumSha1'], 'c'.repeat(40)],
    [['assets', 'archive', 'npmIntegritySha512'], `sha512-${createHash('sha512').update('substituted').digest('base64')}`],
    [['assets', 'archive', 'byteLength'], 2],
    [['assets', 'archive', 'basename'], 'other.tgz'],
    [['review', 'runId'], 'stale-run'],
    [['review', 'target', 'arch'], 'wrong-target'],
    [['review', 'package', 'version'], '9.0.0'],
    [['review', 'install', 'dependencyCount'], 2],
    [['review', 'install', 'dependencyInventorySha256'], 'c'.repeat(64)],
    [['review', 'support', 'unavailable'], false],
    [['review', 'exactPatch', 'grounded'], false],
    [['review', 'scanner'], { status: 'passed' }],
  ];
  for (const [path, value] of substitutions) {
    const reports = JSON.parse(JSON.stringify({ assets, review }));
    let target = reports;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)!] = value;
    expect(() => parseScenarios('current-run', expected, reports.assets, reports.review, selectedProfile)).toThrow();
  }
});
