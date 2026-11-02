import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as verifier from '../../scripts/verify-npm-release.mjs';
import { archiveBasename, packageLabel, packumentUrl, provenanceSubject, registryTarballUrl, version } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const execFileAsync = promisify(execFile);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const verifierPath = join(projectRoot, 'scripts/verify-npm-release.mjs');
// Child probes load this URL in their isolated CI fixture process.
const verifierUrl = new URL('../../scripts/verify-npm-release.mjs', import.meta.url).href;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sha1 = (value: string | Buffer) => createHash('sha1').update(value).digest('hex');
const integrity = (value: string | Buffer) => `sha512-${createHash('sha512').update(value).digest('base64')}`;
const mismatchedVersion = '9999.0.0';

type Archive = {
  readonly basename: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly npmShasumSha1: string;
  readonly npmIntegritySha512: string;
};
type Fixture = {
  readonly root: string;
  readonly archivePath: string;
  readonly archive: Archive;
  readonly producerPath: string;
  readonly scannerPath: string;
  readonly acceptancePath: string;
  readonly sealedPath: string;
  readonly producer: Record<string, unknown>;
  readonly scanner: Record<string, unknown>;
  readonly acceptance: Record<string, unknown>;
};

let fixture: Fixture;

function currentCi(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY: `Ship-With-AI/${RENAME_MAP.slug}`,
    GITHUB_REPOSITORY_ID: '1327753770',
    GITHUB_WORKFLOW_REF: `Ship-With-AI/${RENAME_MAP.slug}/.github/workflows/publish-npm.yml@refs/heads/main`,
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123456789',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'macOS',
    RUNNER_ARCH: 'ARM64',
    ...overrides,
  };
}

function archiveIdentity(bytes: Buffer): Archive {
  return {
    basename: archiveBasename,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    npmShasumSha1: sha1(bytes),
    npmIntegritySha512: integrity(bytes),
  };
}

function candidateReports(archive: Archive): Pick<Fixture, 'producer' | 'scanner' | 'acceptance'> {
  const hash = 'b'.repeat(64);
  const runtimeDependencies = { '@fastify/static': '8.3.0', fastify: '5.5.0', zod: '4.4.3' };
  const packageIdentity = { name: RENAME_MAP.npmPackage, version, runtimeDependencies };
  const distFiles = [`dist/bin/${RENAME_MAP.binCommand}.mjs`, 'dist/native/directory_exchange.node', 'dist/web/index.html'].map((path) => ({ path, mode: path.endsWith('.mjs') ? 0o755 : 0o644, byteLength: 1, sha256: hash }));
  const distSha256 = sha256(JSON.stringify(distFiles));
  const files = [...distFiles.map(({ path, mode, byteLength }) => ({ path, mode, size: byteLength })), ...['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].map((path) => ({ path, mode: 0o644, size: 1 }))];
  const producer = {
    kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-evidence/v1`, status: 'candidate', purpose: 'candidate', package: packageIdentity, archive: { ...archive, files },
    source: { repository: `git+https://github.com/Ship-With-AI/${RENAME_MAP.slug}.git`, head: 'a'.repeat(40), tree: 'c'.repeat(40), clean: true, trackedDiffSha256: sha256(JSON.stringify(['', ''])), packageJsonSha256: hash, inputsSha256: hash, packageLockSha256: hash },
    build: { configured: true, platform: 'darwin', arch: 'arm64', node: 'v24.15.0', npm: '11.19.1', git: 'git version 2.50.1', os: 'fixture', napi: '10', compiler: { command: '/usr/bin/c++', version: 'Apple clang fixture', target: 'arm64-darwin' } },
    contents: { dist: { sha256: distSha256, files: distFiles } },
    legal: { LICENSE: 'c947d781600d41cdeac710b2c81f5cd04ed88bad83dcc2277cffb30768490c7d', 'THIRD_PARTY_NOTICES.md': '44ac7b248ca311016ec0e10cd2446dd5d34df53a666af3dc5f74da18ed3e9ced' },
    native: { source: { path: 'src/native/directory-exchange.cc', sha256: hash }, binary: { path: 'dist/native/directory_exchange.node', sha256: hash } },
    support: { configured: true, originSha256: '89485617b2d50d4778542ebedc3817a3e3fcddb6520a4a9c3a66e37c3a9c6cdf' },
  };
  const scanner = {
    kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-verification/v1`, status: 'passed', purpose: 'candidate', archive, package: packageIdentity,
    inventory: { sha256: distSha256, count: files.length, bytes: files.length }, legal: { README: hash, LICENSE: producer.legal.LICENSE, THIRD_PARTY_NOTICES: producer.legal['THIRD_PARTY_NOTICES.md'] },
    web: { entry: 'dist/web/index.html', reachableFiles: 1, workerRoles: ['css', 'editor', 'html', 'json', 'ts'], codicon: true },
    native: { target: 'arm64-darwin', binary: true, fallback: 'reExportUnsupported' },
    support: { configured: true, originSha256: producer.support.originSha256 },
    checks: { archiveIdentity: true, protectedExtraction: true, inventoryParity: true, legalParity: true, completeDistParity: true, boundedContentScan: true },
    limitations: ['Bounded source disclosure scan.'],
  };
  const acceptance = {
    kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-acceptance/v1`, status: 'passed', profile: 'stable', purpose: 'candidate', archive, package: packageIdentity,
    install: { packageLabel, binLabel: RENAME_MAP.binCommand, manifestSha256: hash, dependencyCount: 3, dependencyInventorySha256: hash },
    scanner, browser: { assets: true, workers: true, codicon: true }, review: { relaunch: true, canonicalV2: true, isolatedDrafts: true, reExport: 'exported' },
    support: { unavailable: true, dismissed: true, unrestricted: true, configured: true, originSha256: producer.support.originSha256 },
    exactPatch: { canonicalV3: true, grounded: true }, native: { observedReExport: true, fallback: 'reExportUnsupported', target: { platform: 'darwin', arch: 'arm64' } },
    cleanup: { complete: true }, sourceControl: { unchanged: true, scenarios: [{ name: 'review', unchanged: true }] }, checks: ['PKG-03', 'PKG-04', 'PKG-05', 'REL-03'], limitations: ['Acceptance fixture only.'],
  };
  return { producer, scanner, acceptance };
}

function provenanceStatement() {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: provenanceSubject, digest: { sha512: Buffer.from(fixture.archive.npmIntegritySha512.slice(7), 'base64').toString('hex') } }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: { workflow: { repository: `https://github.com/Ship-With-AI/${RENAME_MAP.slug}`, path: '.github/workflows/publish-npm.yml', ref: 'refs/heads/main' } },
        internalParameters: { github: { event_name: 'workflow_dispatch', repository_id: '1327753770', repository_owner_id: '224984099' } },
        resolvedDependencies: [{ uri: `git+https://github.com/Ship-With-AI/${RENAME_MAP.slug}@refs/heads/main`, digest: { gitCommit: 'a'.repeat(40) } }],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
        metadata: { invocationId: `https://github.com/Ship-With-AI/${RENAME_MAP.slug}/actions/runs/123456789/attempts/1` },
      },
    },
  };
}

function verifiedAudit(statement = provenanceStatement()) {
  // Policy fixture only: real cryptography remains npm's responsibility.
  return {
    invalid: [], missing: [],
    verified: [{
      name: RENAME_MAP.npmPackage, version, location: `node_modules/${RENAME_MAP.npmPackage}`, registry: 'https://registry.npmjs.org/',
      attestations: { url: `https://registry.npmjs.org/-/npm/v1/attestations/@shipwithai%2f${RENAME_MAP.slug}@${version}` },
      attestationBundles: [statement, { ...statement, predicateType: 'https://docs.npmjs.com/attestations/publish/v0.1' }].map((value) => ({
        predicateType: value.predicateType,
        bundle: { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(value)).toString('base64'), signatures: [{ keyid: '', sig: 'fixture-only' }] } },
      })),
    }],
  };
}

async function publicNpmFixture(mode: string): Promise<void> {
  const bin = join(fixture.root, 'tools', 'bin');
  const npmRoot = join(fixture.root, 'tools', 'node_modules', 'npm');
  await mkdir(join(npmRoot, 'bin'), { recursive: true, mode: 0o700 });
  await mkdir(bin, { recursive: true, mode: 0o700 });
  await writeJson(join(npmRoot, 'package.json'), { name: 'npm', version: '11.19.1', type: 'module' });
  const audit = verifiedAudit();
  if (mode === 'missing-attestation') audit.verified = [];
  const program = `#!${process.execPath}
import { mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { join, basename } from 'node:path';
const args = process.argv.slice(2), env = process.env;
const option = (name) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : env['npm_config_' + name] ?? env['NPM_CONFIG_' + name.toUpperCase()];
if (env.NODE_AUTH_TOKEN || env.NPM_TOKEN || env.NODE_OPTIONS) process.exit(41);
const cache = option('cache');
if (!cache || !env.HOME || !option('userconfig') || !option('globalconfig')) process.exit(42);
for (const path of [option('userconfig'), option('globalconfig')]) if (readFileSync(path, 'utf8').trim()) process.exit(43);
if (args.length === 1 && args[0] === '--version') { console.log('11.19.1'); process.exit(0); }
mkdirSync(cache, { recursive: true });
if (basename(process.argv[1]).startsWith('npx')) {
  if (existsSync(join(cache, 'consumer-used')) || JSON.stringify(args) !== JSON.stringify(['--yes', ${JSON.stringify(packageLabel)}, '--version'])) process.exit(44);
  console.log(${JSON.stringify(mode === 'wrong-npx' ? mismatchedVersion : version)}); process.exit(0);
}
if (args.includes('install')) {
  if (!args.includes(${JSON.stringify(packageLabel)}) || !args.includes('--ignore-scripts') || existsSync(join(cache, 'consumer-used'))) process.exit(45);
  writeFileSync(join(cache, 'consumer-used'), 'fixture');
  const global = args.includes('--global') || args.includes('-g');
  const prefix = option('prefix');
  const target = global ? join(prefix, 'lib/node_modules/@shipwithai/${RENAME_MAP.slug}') : join(process.cwd(), 'node_modules/@shipwithai/${RENAME_MAP.slug}');
  if (${JSON.stringify(mode)} !== 'missing-installed-target' || global) {
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: '@shipwithai/${RENAME_MAP.slug}', version: ${JSON.stringify(version)}, bin: { ${RENAME_MAP.binCommand}: 'dist/bin/${RENAME_MAP.binCommand}.mjs' } }));
  }
  if (global) {
    mkdirSync(join(prefix, 'bin'), { recursive: true });
    writeFileSync(join(prefix, 'bin/${RENAME_MAP.binCommand}'), '#!${process.execPath}\\nconsole.log(${JSON.stringify(version)});\\n'); chmodSync(join(prefix, 'bin/${RENAME_MAP.binCommand}'), 0o755);
  } else {
    const root = JSON.parse(readFileSync('package.json', 'utf8'));
    writeFileSync('package-lock.json', JSON.stringify({ name: root.name, lockfileVersion: 3, packages: { '': root, 'node_modules/@shipwithai/${RENAME_MAP.slug}': { name: '@shipwithai/${RENAME_MAP.slug}', version: ${JSON.stringify(version)}, integrity: ${JSON.stringify(fixture.archive.npmIntegritySha512)}, resolved: ${JSON.stringify(registryTarballUrl)} } } }));
  }
  console.log('{}'); process.exit(0);
}
if (args.includes('audit') && args.includes('signatures') && args.includes('--include-attestations')) {
  console.log(${JSON.stringify(JSON.stringify(audit))}); process.exit(0);
}
process.exit(46);
`;
  for (const name of ['npm', 'npx']) {
    const script = join(npmRoot, 'bin', `${name}-cli.js`);
    await writeFile(script, program, { mode: 0o700 });
    await symlink(script, join(bin, name));
  }
  vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
  vi.stubEnv('NODE_AUTH_TOKEN', 'fixture-credential-must-not-reach-consumers');
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== 'https://registry.npmjs.org') throw new Error('Unexpected registry fixture request');
    if (url.pathname.endsWith('.tgz')) return new Response(mode === 'wrong-download' ? 'wrong bytes' : await readFile(fixture.archivePath, 'utf8'));
    return Response.json({
      name: RENAME_MAP.npmPackage, version,
      dist: { tarball: registryTarballUrl, shasum: fixture.archive.npmShasumSha1, integrity: fixture.archive.npmIntegritySha512 },
    });
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function invoke(command: string, args: readonly string[], environment: NodeJS.ProcessEnv = {}): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(process.execPath, [verifierPath, command, ...args], {
    cwd: projectRoot,
    env: { PATH: process.env.PATH, ...environment },
    maxBuffer: 256 * 1024,
  });
}

async function commandFailure(command: string, args: readonly string[], environment: NodeJS.ProcessEnv = {}): Promise<string> {
  try {
    await invoke(command, args, environment);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
  throw new Error(`${command} unexpectedly accepted the fixture`);
}


async function seal(environment: NodeJS.ProcessEnv = {}): Promise<Record<string, unknown>> {
  const input = {
    archivePath: fixture.archivePath, producerEvidencePath: fixture.producerPath,
    scannerReportPath: fixture.scannerPath, acceptanceReportPath: fixture.acceptancePath, outputPath: fixture.sealedPath,
  };
  const { stdout } = await execFileAsync(process.execPath, [
    '--input-type=module', '-e',
    'const {sealCiCandidateEvidence}=await import(process.argv[1]); console.log(JSON.stringify(await sealCiCandidateEvidence(JSON.parse(process.argv[2]))));',
    verifierUrl, JSON.stringify(input),
  ], { cwd: fixture.root, env: { PATH: process.env.PATH, ...currentCi(environment) }, maxBuffer: 256 * 1024 });
  return JSON.parse(stdout) as Record<string, unknown>;
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-npm-release-verifier-`));
  const bytes = Buffer.from('fresh same-run candidate archive bytes');
  const archive = archiveIdentity(bytes);
  const archivePath = join(root, archive.basename);
  const producerPath = join(root, 'producer.json');
  const scannerPath = join(root, 'scanner.json');
  const acceptancePath = join(root, 'acceptance.json');
  const sealedPath = join(root, 'sealed.json');
  const reports = candidateReports(archive);
  fixture = { root, archivePath, archive, producerPath, scannerPath, acceptancePath, sealedPath, ...reports };
  await writeFile(archivePath, bytes, { mode: 0o600 });
  await Promise.all([writeJson(producerPath, fixture.producer), writeJson(scannerPath, fixture.scanner), writeJson(acceptancePath, fixture.acceptance)]);
});

afterEach(async () => {
  await rm(fixture.root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('npm release verifier', () => {

  test('seals one fresh Darwin ARM64 candidate with bounded exact CI and report digests', async () => {
    const before = await stat(fixture.archivePath);
    const result = await seal();
    const sealed = JSON.parse(await readFile(fixture.sealedPath, 'utf8')) as Record<string, unknown>;
    const after = await stat(fixture.archivePath);
    const producerCore = structuredClone(sealed);
    for (const enrichment of ['scanner', 'acceptance', 'ci']) delete producerCore[enrichment];
    producerCore.status = 'candidate';
    expect(sha256(JSON.stringify(producerCore))).toBe(sha256(JSON.stringify(fixture.producer)));

    expect(result).toMatchObject({ kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-evidence/v1`, status: 'verified', purpose: 'candidate' });
    expect(sealed).toMatchObject({
      kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-evidence/v1`, status: 'verified', purpose: 'candidate', archive: fixture.archive,
      ci: {
        repository: `Ship-With-AI/${RENAME_MAP.slug}`, repositoryId: '1327753770', workflowPath: '.github/workflows/publish-npm.yml',
        workflowRef: `Ship-With-AI/${RENAME_MAP.slug}/.github/workflows/publish-npm.yml@refs/heads/main`, ref: 'refs/heads/main',
        sourceSha: 'a'.repeat(40), runId: '123456789', runAttempt: '1', runnerEnvironment: 'github-hosted', producerPlatform: 'darwin', producerArch: 'arm64',
      },
      scanner: { kind: fixture.scanner.kind, status: 'passed', sha256: sha256(await readFile(fixture.scannerPath)) },
      acceptance: { kind: fixture.acceptance.kind, status: 'passed', sha256: sha256(await readFile(fixture.acceptancePath)) },
    });
    expect(Object.keys((sealed.ci ?? {}) as Record<string, unknown>).sort()).toEqual(['producerArch', 'producerPlatform', 'ref', 'repository', 'repositoryId', 'runAttempt', 'runId', 'runnerEnvironment', 'sourceSha', 'workflowPath', 'workflowRef']);
    expect(after).toMatchObject({ ino: before.ino, size: before.size });
    expect(JSON.stringify(sealed)).not.toContain(fixture.root);
  });

  const ciMismatches: readonly [string, NodeJS.ProcessEnv][] = [
    ['repository', { GITHUB_REPOSITORY: 'other/repository' }],
    ['repository ID', { GITHUB_REPOSITORY_ID: '1' }],
    ['workflow', { GITHUB_WORKFLOW_REF: `Ship-With-AI/${RENAME_MAP.slug}/.github/workflows/other.yml@refs/heads/main` }],
    ['source SHA', { GITHUB_SHA: 'd'.repeat(40) }],
    ['run ID', { GITHUB_RUN_ID: 'invalid' }],
    ['run attempt', { GITHUB_RUN_ATTEMPT: '0' }],
    ['runner environment', { RUNNER_ENVIRONMENT: 'self-hosted' }],
    ['runner OS', { RUNNER_OS: 'Linux' }],
    ['runner architecture', { RUNNER_ARCH: 'X64' }],
  ];
  test.for(ciMismatches)('rejects a mismatched %s before writing sealed evidence', async ([, environment]) => {
    await expect(commandFailure('seal-candidate', [
      '--archive', fixture.archivePath, '--producer-evidence', fixture.producerPath, '--scanner-report', fixture.scannerPath,
      '--acceptance-report', fixture.acceptancePath, '--output', fixture.sealedPath,
    ], currentCi(environment))).resolves.toMatch(/failed|invalid|mismatch|candidate/i);
    await expect(readFile(fixture.sealedPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects crossed observations, accepted-local fallback authority, failed checks, and output replacement', async () => {
    expect(mismatchedVersion).not.toBe(version);
    const substitutions: Array<[string, (reports: Pick<Fixture, 'producer' | 'scanner' | 'acceptance'>) => void]> = [
      ['scanner archive', ({ scanner }) => { (scanner.archive as Record<string, unknown>).sha256 = 'd'.repeat(64); }],
      ['producer archive basename', ({ producer }) => { (producer.archive as Record<string, unknown>).basename = `shipwithai-${RENAME_MAP.slug}-${mismatchedVersion}.tgz`; }],
      ['acceptance package', ({ acceptance }) => { ((acceptance.package as Record<string, unknown>).version) = mismatchedVersion; }],
      ['accepted-local fallback authority', ({ producer }) => { producer.status = 'accepted-local'; }],
      ['missing native re-export', ({ acceptance }) => { ((acceptance.native as Record<string, unknown>).observedReExport) = false; }],
      ['failed scanner check', ({ scanner }) => { ((scanner.checks as Record<string, unknown>).inventoryParity) = false; }],
      ['incomplete acceptance checks', ({ acceptance }) => { acceptance.checks = ['PKG-03']; }],
      ['wrong acceptance profile', ({ acceptance }) => { acceptance.profile = 'bootstrap'; }],
      ['installed manifest identity', ({ acceptance }) => { (acceptance.install as Record<string, unknown>).manifestSha256 = 'd'.repeat(64); }],
      ['unknown private producer metadata', ({ producer }) => { (producer.build as Record<string, unknown>).privatePath = '/private/fixture/custody'; }],
      ['unbounded private report text', ({ scanner }) => { scanner.limitations = ['https://abcdefghijklmnopqrst.supabase.co']; }],
      ['absent source-control scenarios', ({ acceptance }) => { delete (acceptance.sourceControl as Record<string, unknown>).scenarios; }],
      ['empty source-control scenarios', ({ acceptance }) => { (acceptance.sourceControl as Record<string, unknown>).scenarios = []; }],
      ['unasserted source-control scenario', ({ acceptance }) => { (acceptance.sourceControl as Record<string, unknown>).scenarios = [{ name: 'review', unchanged: false }]; }],
    ];
    for (const [, mutate] of substitutions) {
      const reports = structuredClone(candidateReports(fixture.archive));
      mutate(reports);
      await Promise.all([writeJson(fixture.producerPath, reports.producer), writeJson(fixture.scannerPath, reports.scanner), writeJson(fixture.acceptancePath, reports.acceptance)]);
      await expect(seal()).rejects.toThrow();
      await expect(readFile(fixture.sealedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    }

    await Promise.all([writeJson(fixture.producerPath, fixture.producer), writeJson(fixture.scannerPath, fixture.scanner), writeJson(fixture.acceptancePath, fixture.acceptance)]);
    await seal();
    await expect(seal()).rejects.toThrow();
  });

  test('requires an unchanged sealed candidate and exact current context before publishing can proceed', async () => {
    await seal();
    const evidenceSha256 = sha256(await readFile(fixture.sealedPath));
    const valid = [
      '--archive', fixture.archivePath, '--evidence', fixture.sealedPath, '--expected-evidence-sha256', evidenceSha256,
      '--artifact-id', '12345', '--artifact-digest', `sha256:${'c'.repeat(64)}`,
    ];
    const accepted = JSON.parse((await invoke('verify-candidate', valid, currentCi({ RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64' }))).stdout) as Record<string, unknown>;
    expect(accepted).toMatchObject({ kind: `${RENAME_MAP.kindPrefix}.ci-candidate-prepublish/v1`, status: 'passed', archive: fixture.archive });

    for (const environment of [
      { GITHUB_SHA: 'd'.repeat(40) }, { GITHUB_RUN_ID: '987654321' }, { GITHUB_RUN_ATTEMPT: '2' },
      { GITHUB_REPOSITORY: 'other/repository' }, { RUNNER_ENVIRONMENT: 'self-hosted' },
    ]) {
      await expect(commandFailure('verify-candidate', valid, currentCi({ RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', ...environment }))).resolves.toMatch(/failed|invalid|mismatch|candidate/i);
    }
    await writeFile(fixture.archivePath, 'substituted archive bytes', 'utf8');
    await expect(commandFailure('verify-candidate', valid, currentCi())).resolves.toMatch(/failed|invalid|mismatch|candidate/i);
  });

  test('keeps every command fixed and rejects malformed input before npm or registry access', async () => {
    const commands = await mkdtemp(join(fixture.root, 'commands-'));
    const npmUsed = join(fixture.root, 'npm-used');
    const npm = join(commands, 'npm');
    await writeFile(npm, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(npmUsed)}, 'used');\n`);
    await chmod(npm, 0o755);
    try {
      for (const [command, args] of [
        ['seal-candidate', ['--archive', fixture.archivePath]],
        ['seal-candidate', ['--archive', fixture.archivePath, '--archive', fixture.archivePath, '--producer-evidence', fixture.producerPath, '--scanner-report', fixture.scannerPath, '--acceptance-report', fixture.acceptancePath, '--output', fixture.sealedPath]],
        ['verify-candidate', ['--package', '@other/package@1.5.0']],
        ['verify-public', ['--evidence', fixture.sealedPath, '--registry', 'https://registry.example.invalid/']],
      ] as const) {
        await expect(commandFailure(command, args, { PATH: `${commands}:${process.env.PATH ?? ''}` })).resolves.toMatch(/failed|invalid|expected|unknown/i);
      }
      await expect(readFile(npmUsed)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(commands, { recursive: true, force: true });
    }
  });

  test('accepts npm-verified exact claims and rejects independently mismatched claims', async () => {
    await seal();
    const evidence = JSON.parse(await readFile(fixture.sealedPath, 'utf8'));
    const inspect = verifier.inspectNpmProvenance;
    expect(await inspect({ evidence, audit: verifiedAudit() })).toMatchObject({ status: 'passed' });
    const baseline = provenanceStatement();
    const changes: Array<(statement: typeof baseline) => void> = [
      (value) => { value.subject[0]!.digest.sha512 = '0'.repeat(128); },
      (value) => { value.predicate.buildDefinition.resolvedDependencies[0]!.digest.gitCommit = 'd'.repeat(40); },
      (value) => { value.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml'; },
      (value) => { value.predicate.buildDefinition.internalParameters.github.event_name = 'push'; },
      (value) => { value.predicate.buildDefinition.internalParameters.github.repository_owner_id = '1'; },
      (value) => { value.predicate.runDetails.builder.id = 'https://github.com/actions/runner/self-hosted'; },
      (value) => { value.predicate.runDetails.metadata.invocationId = `https://github.com/Ship-With-AI/${RENAME_MAP.slug}/actions/runs/123456789/attempts/2`; },
    ];
    for (const mutate of changes) {
      const statement = provenanceStatement();
      mutate(statement);
      await expect(Promise.resolve().then(() => inspect({ evidence, audit: verifiedAudit(statement) }))).rejects.toThrow();
    }
    for (const audit of [
      { invalid: [], missing: [], verified: [] },
      { ...verifiedAudit(), invalid: [{ name: RENAME_MAP.npmPackage, code: 'EATTESTATIONVERIFY' }] },
      { ...verifiedAudit(), verified: [...verifiedAudit().verified, ...verifiedAudit().verified] },
    ]) await expect(Promise.resolve().then(() => inspect({ evidence, audit }))).rejects.toThrow();
  });

  test.for(['passed', 'missing-installed-target', 'missing-attestation', 'wrong-download', 'wrong-npx'])('public verification enforces real consumer observations: %s', async (mode) => {
    await seal();
    if (mode === 'wrong-npx') expect(mismatchedVersion).not.toBe(version);
    await publicNpmFixture(mode);
    const verifyPublic = verifier.verifyPublicNpmRelease;
    const operation = verifyPublic({
      evidencePath: fixture.sealedPath,
      expectedEvidenceSha256: sha256(await readFile(fixture.sealedPath)),
      artifactId: '12345', artifactDigest: `sha256:${'c'.repeat(64)}`,
      outputPath: join(fixture.root, 'public-verification.json'),
    });
    if (mode === 'passed') {
      expect(await operation).toMatchObject({ kind: `${RENAME_MAP.kindPrefix}.npm-release-verification/v1`, status: 'passed' });
      const report = await readFile(join(fixture.root, 'public-verification.json'), 'utf8');
      expect(report).not.toContain(fixture.root);
      expect(report).not.toContain('fixture-credential-must-not-reach-consumers');
    } else {
      await expect(operation).rejects.toThrow();
      await expect(readFile(join(fixture.root, 'public-verification.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });


  test('seals a fixture through the standalone symlinked CLI without project dependencies', async () => {
    const scripts = join(fixture.root, 'scripts');
    const standalone = join(scripts, 'standalone.mjs');
    const launcher = join(fixture.root, 'entry.mjs');
    await mkdir(scripts);
    await Promise.all([
      writeFile(standalone, await readFile(verifierPath)),
      writeFile(join(scripts, 'release-identity.mjs'), await readFile(join(projectRoot, 'scripts', 'release-identity.mjs'))),
      writeFile(join(scripts, 'rename-map.json'), await readFile(join(projectRoot, 'scripts', 'rename-map.json'))),
      writeJson(join(fixture.root, 'package.json'), { name: RENAME_MAP.npmPackage, version }),
    ]);
    await symlink(standalone, launcher);
    const result = await execFileAsync(process.execPath, [
      launcher, 'seal-candidate', '--archive', fixture.archivePath, '--producer-evidence', fixture.producerPath,
      '--scanner-report', fixture.scannerPath, '--acceptance-report', fixture.acceptancePath, '--output', fixture.sealedPath,
    ], { cwd: fixture.root, env: { PATH: process.env.PATH, ...currentCi() }, maxBuffer: 256 * 1024 });
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'verified', archive: fixture.archive });
    expect(JSON.parse(await readFile(fixture.sealedPath, 'utf8'))).toMatchObject({ status: 'verified', archive: fixture.archive });
    await expect(stat(join(fixture.root, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('emits bounded failure data without custody, origin, auth, or raw provider payloads', async () => {
    const privateOrigin = 'https://abcdefghijklmnopqrst.supabase.co';
    const failure = await commandFailure('seal-candidate', [
      '--archive', fixture.archivePath, '--producer-evidence', fixture.producerPath, '--scanner-report', fixture.scannerPath,
      '--acceptance-report', fixture.acceptancePath, '--output', fixture.sealedPath,
    ], currentCi({ GITHUB_REPOSITORY: 'other/repository', [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: privateOrigin, NODE_AUTH_TOKEN: 'secret-token' }));
    for (const privateValue of [fixture.root, privateOrigin, 'secret-token']) expect(failure).not.toContain(privateValue);
    expect(failure).toMatch(/failed|invalid|candidate/i);
  });
});
