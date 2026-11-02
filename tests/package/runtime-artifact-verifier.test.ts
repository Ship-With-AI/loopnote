import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { bootstrapVersion, version } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

import { readRuntimeArtifact } from '../helpers/runtime-artifact.js';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
let root: string;
let producer: string;
let verifier: string;
const origin = `https://${'a'.repeat(20)}.supabase.co`;
let temporaryRoot: string;
type Evidence = {
  archive: {
    basename: string;
    byteLength: number;
    sha256: string;
    npmShasumSha1: string;
    npmIntegritySha512: string;
  };
  status: string;
  [key: string]: unknown;
};

type Produced = Readonly<{ custody: string; evidencePath: string; evidence: Evidence; archive: string }>;

async function execute(
  script: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const env = { ...process.env, ...environment };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return await execFileAsync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function produce(purpose: 'bootstrap' | 'candidate' | 'development-check', configured = false): Promise<Produced> {
  const custody = join(temporaryRoot, `custody-${purpose}-${configured ? 'configured' : 'absent'}-${Math.random()}`);
  const evidencePath = join(temporaryRoot, `${purpose}-${configured ? 'configured' : 'absent'}-${Math.random()}.json`);
  const environment = { ...process.env };
  if (configured) environment[`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`] = origin;
  else delete environment[`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  await execute(producer, ['--purpose', purpose, '--custody-dir', custody, '--evidence', evidencePath], environment);
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as Evidence;
  return { custody, evidencePath, evidence, archive: join(custody, evidence.archive.basename) };
}

function verifierArgs(
  produced: Produced,
  evidencePath = produced.evidencePath,
  expectedSha256 = produced.evidence.archive.sha256,
  profile?: string,
): string[] {
  return [
    '--archive', produced.archive,
    '--expected-sha256', expectedSha256,
    '--evidence', evidencePath,
    ...(profile === undefined ? [] : ['--profile', profile]),
  ];
}

async function verifierFailure(args: readonly string[], environment: NodeJS.ProcessEnv = {}): Promise<string> {
  try {
    await execute(verifier, args, environment);
  } catch (error) {
    const result = error as Error & { stderr?: string; stdout?: string };
    return `${result.stdout ?? ''}${result.stderr ?? ''}${result.message}`;
  }
  throw new Error('verifier unexpectedly accepted the fixture');
}

async function clonedEvidence(produced: Produced, mutate: (evidence: Evidence) => void): Promise<string> {
  const copy = structuredClone(produced.evidence);
  mutate(copy);
  const path = join(temporaryRoot, `evidence-${Math.random()}.json`);
  await writeFile(path, `${JSON.stringify(copy)}\n`, 'utf8');
  return path;
}

function archiveIdentity(bytes: Buffer): Pick<Evidence['archive'], 'byteLength' | 'sha256' | 'npmShasumSha1' | 'npmIntegritySha512'> {
  return {
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    npmShasumSha1: createHash('sha1').update(bytes).digest('hex'),
    npmIntegritySha512: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

async function reboundedModifiedArchive(produced: Produced): Promise<{ readonly archive: string; readonly evidence: string }> {
  const staging = await mkdtemp(join(temporaryRoot, 'staging-'));
  const custody = await mkdtemp(join(temporaryRoot, 'modified-custody-'));
  const archive = join(custody, produced.evidence.archive.basename);
  try {
    await execFileAsync('tar', ['-xzf', produced.archive, '-C', staging]);
    const launcher = join(staging, 'package', 'dist', 'bin', `${RENAME_MAP.binCommand}.mjs`);
    const bytes = await readFile(launcher);
    bytes[0] ^= 1;
    await writeFile(launcher, bytes);
    await execFileAsync('tar', ['-czf', archive, '-C', staging, 'package']);
  } finally {
    await rm(staging, { force: true, recursive: true });
  }
  const evidence = structuredClone(produced.evidence);
  Object.assign(evidence.archive, archiveIdentity(await readFile(archive)));
  const evidencePath = join(temporaryRoot, `rebound-${Math.random()}.json`);
  await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`, 'utf8');
  return { archive, evidence: evidencePath };
}

async function reboundEvidence(produced: Produced, mutate: (evidence: Evidence) => void): Promise<string> {
  const evidence = structuredClone(produced.evidence);
  mutate(evidence);
  Object.assign(evidence.archive, archiveIdentity(await readFile(produced.archive)));
  const evidencePath = join(temporaryRoot, `rebound-policy-${Math.random()}.json`);
  await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`, 'utf8');
  return evidencePath;
}

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-runtime-artifact-verifier-`));
  await symlink(join(projectRoot, 'node_modules'), join(temporaryRoot, 'node_modules'), 'dir');
  root = join(temporaryRoot, 'source');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'src/native'), { recursive: true });
  producer = join(root, 'scripts/pack-runtime.mjs');
  verifier = join(root, 'scripts/verify-production-artifacts.mjs');
  for (const path of ['scripts/pack-runtime.mjs', 'scripts/release-identity.mjs', 'scripts/rename-map.json', 'scripts/verify-production-artifacts.mjs', 'src/native/directory-exchange.cc', 'package-lock.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await writeFile(join(root, path), await readFile(join(projectRoot, path)));
  }
  const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  manifest.scripts = { build: 'node scripts/build-fixture.mjs' };
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'scripts/build-fixture.mjs'), `
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
for (const path of ['dist/bin', 'dist/web/assets', 'dist/native']) mkdirSync(path, { recursive: true });
const origin = process.env.${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL;
const launcher = '#!/usr/bin/env node\\n' + (origin ? "if (process.env.${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL === undefined) process.env.${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL = '" + origin + "';\\n" : '');
writeFileSync('dist/bin/${RENAME_MAP.binCommand}.mjs', launcher);
chmodSync('dist/bin/${RENAME_MAP.binCommand}.mjs', 0o755);
writeFileSync('dist/web/index.html', '<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">');
writeFileSync('dist/web/assets/app.js', ${JSON.stringify('const compilerExample = `import("{0}")`; const generatedHtml = `<img src="` + name + `">`; new URL(`editor.worker-fixture.js`, import.meta.url);')});
writeFileSync('dist/web/assets/app.css', '@font-face{font-family:codicon;src:url("./codicon-fixture.ttf")}');
writeFileSync('dist/web/assets/codicon-fixture.ttf', 'font fixture');
for (const role of ['editor', 'css', 'html', 'json', 'ts']) writeFileSync('dist/web/assets/' + role + '.worker-fixture.js', 'self.onmessage=()=>{};');
if (process.platform === 'darwin' && process.arch === 'arm64') writeFileSync('dist/native/directory_exchange.node', 'static inventory fixture, not a native capability observation');
`);
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'scanner fixture'], { cwd: root });
}, 120_000);

afterAll(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

describe('runtime artifact verifier', () => {
  test('re-verifies a producer archive without creating or changing archive bytes', async () => {
    const produced = await produce('development-check');
    const before = await stat(produced.archive);
    const output = JSON.parse((await execute(verifier, verifierArgs(produced), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: undefined })).stdout) as Record<string, unknown>;
    const after = await stat(produced.archive);

    expect(output).toMatchObject({
      kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-verification/v1`,
      status: 'passed',
      purpose: 'development-check',
      archive: { basename: produced.evidence.archive.basename, sha256: produced.evidence.archive.sha256 },
      support: { configured: false },
    });
    expect(after).toMatchObject({ ino: before.ino, size: before.size });
  }, 120_000);

  test('accepts bootstrap only with its explicit verifier profile and rejects crossed policy identities after archive hashes are rebound', async () => {
    const bootstrap = await produce('bootstrap', true);
    const output = JSON.parse((await execute(
      verifier,
      ['--profile', 'bootstrap', ...verifierArgs(bootstrap)],
      { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin },
    )).stdout) as Record<string, unknown>;

    expect(output).toMatchObject({
      status: 'passed',
      purpose: 'bootstrap',
      package: { name: RENAME_MAP.npmPackage, version: bootstrapVersion },
      support: { configured: true, originSha256: createHash('sha256').update(origin).digest('hex') },
    });
    await expect(verifierFailure(verifierArgs(bootstrap), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin })).resolves.toContain('runtime artifact verifier failed');
    await expect(verifierFailure(verifierArgs(bootstrap, bootstrap.evidencePath, bootstrap.evidence.archive.sha256, 'stable'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin })).resolves.toContain('runtime artifact verifier failed');
    await expect(verifierFailure([
      ...verifierArgs(bootstrap, bootstrap.evidencePath, bootstrap.evidence.archive.sha256, 'bootstrap'),
      '--profile',
      'bootstrap',
    ], { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin })).resolves.toContain('runtime artifact verifier failed');

    const crossed = await Promise.all([
      reboundEvidence(bootstrap, (evidence) => {
        evidence.purpose = 'candidate';
        evidence.status = 'candidate';
      }),
      reboundEvidence(bootstrap, (evidence) => {
        (evidence.package as Record<string, unknown>).version = version;
      }),
      reboundEvidence(bootstrap, (evidence) => {
        (evidence.package as Record<string, unknown>).manifestProjection = {
          field: 'name',
          sourceVersion: version,
          packedVersion: bootstrapVersion,
          sourceSha256: (evidence.source as Record<string, unknown>).packageJsonSha256,
          projectedInputSha256: (evidence.source as Record<string, unknown>).packageJsonSha256,
          packedOutputSha256: (evidence.source as Record<string, unknown>).packageJsonSha256,
        };
      }),
    ]);
    for (const evidencePath of crossed) {
      await expect(verifierFailure(
        verifierArgs(bootstrap, evidencePath, archiveIdentity(await readFile(bootstrap.archive)).sha256, 'bootstrap'),
        { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin },
      )).resolves.toContain('runtime artifact verifier failed');
    }
  }, 180_000);

  test('selects the trusted runtime profile before installation while the default remains stable', async () => {
    const stable = await produce('development-check');
    const stableEnvironment = {
      [`${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR`]: stable.custody,
      [`${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_BASENAME`]: stable.evidence.archive.basename,
      [`${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`]: stable.evidence.archive.sha256,
      [`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]: stable.evidencePath,
    };
    expect(readRuntimeArtifact(stableEnvironment).package.version).toBe(version);

    const bootstrap = await produce('bootstrap', true);
    const bootstrapEnvironment = {
      [`${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR`]: bootstrap.custody,
      [`${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_BASENAME`]: bootstrap.evidence.archive.basename,
      [`${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`]: bootstrap.evidence.archive.sha256,
      [`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`]: bootstrap.evidencePath,
      [`${RENAME_MAP.envPrefix}RUNTIME_PROFILE`]: 'bootstrap',
    };
    expect(readRuntimeArtifact(bootstrapEnvironment).package.version).toBe(bootstrapVersion);
    for (const profile of ['', 'candidate']) {
      expect(() => readRuntimeArtifact({ ...bootstrapEnvironment, [`${RENAME_MAP.envPrefix}RUNTIME_PROFILE`]: profile })).toThrow();
    }
  }, 180_000);

  test('reports independent archive identity failures before accepting content', async () => {
    const produced = await produce('development-check');
    const differentExpected = '0'.repeat(64);
    await expect(verifierFailure(verifierArgs(produced, produced.evidencePath, differentExpected))).resolves.toContain('expected digest');

    const sha1 = await clonedEvidence(produced, (evidence) => { evidence.archive.npmShasumSha1 = '0'.repeat(40); });
    await expect(verifierFailure(verifierArgs(produced, sha1))).resolves.toContain('SHA-1');
    const sha512 = await clonedEvidence(produced, (evidence) => { evidence.archive.npmIntegritySha512 = `sha512-${'A'.repeat(88)}`; });
    await expect(verifierFailure(verifierArgs(produced, sha512))).resolves.toContain('SHA-512');
    const length = await clonedEvidence(produced, (evidence) => { evidence.archive.byteLength += 1; });
    await expect(verifierFailure(verifierArgs(produced, length))).resolves.toContain('byte length');
    const basename = await clonedEvidence(produced, (evidence) => { evidence.archive.basename = 'substituted.tgz'; });
    await expect(verifierFailure(verifierArgs(produced, basename))).resolves.toContain('basename');
  }, 120_000);

  test('rejects malformed CLI input before it can invoke package tooling', async () => {
    const commands = await mkdtemp(join(temporaryRoot, 'commands-'));
    const sentinel = join(temporaryRoot, 'npm-used');
    const npm = join(commands, 'npm');
    await writeFile(npm, `#!${process.execPath}\nimport { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'used');\n`);
    await chmod(npm, 0o755);
    try {
      for (const args of [
        [],
        ['--archive', 'relative.tgz', '--expected-sha256', '0'.repeat(64), '--evidence', '/tmp/evidence.json'],
        ['--archive', '/tmp/archive.tgz', '--expected-sha256', '0'.repeat(64), '--evidence', '/tmp/evidence.json', '--unknown', 'value'],
      ]) {
        await expect(verifierFailure(args, { PATH: `${commands}:${process.env.PATH ?? ''}` })).resolves.toContain('runtime artifact verifier failed');
      }
      await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(commands, { force: true, recursive: true });
    }
  });

  test('rejects a rehashed archive whose extracted runtime content no longer matches producer inventory', async () => {
    const produced = await produce('development-check');
    const modified = await reboundedModifiedArchive(produced);
    await expect(verifierFailure([
      '--archive', modified.archive,
      '--expected-sha256', archiveIdentity(await readFile(modified.archive)).sha256,
      '--evidence', modified.evidence,
    ])).resolves.toContain('dist evidence mismatch');
  }, 120_000);

  test('rejects a static template asset reference missing from an otherwise matching inventory', async () => {
    const buildScript = join(root, 'scripts/build-fixture.mjs');
    const original = await readFile(buildScript, 'utf8');
    try {
      await writeFile(buildScript, original + `\nwriteFileSync('dist/web/assets/app.js', ${JSON.stringify('new URL(`missing.js`, import.meta.url);')});\n`);
      const produced = await produce('development-check');
      await expect(verifierFailure(verifierArgs(produced))).resolves.toContain('missing referenced web asset: dist/web/assets/missing.js');
    } finally {
      await writeFile(buildScript, original);
    }
  });

  test('accepts immutable candidate enrichment statuses and enforces configured-origin policy', async () => {
    const produced = await produce('candidate', true);
    for (const status of ['candidate', 'verified', 'accepted-local']) {
      const evidence = await clonedEvidence(produced, (copy) => { copy.status = status; });
      const output = JSON.parse((await execute(verifier, verifierArgs(produced, evidence), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin })).stdout) as Record<string, unknown>;
      expect(output).toMatchObject({ status: 'passed', purpose: 'candidate', support: { configured: true, originSha256: createHash('sha256').update(origin).digest('hex') } });
    }
    await expect(verifierFailure(verifierArgs(produced), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: undefined })).resolves.toContain(`requires ${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`);
  }, 180_000);
});
