import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, test } from 'vitest';
import { bootstrapVersion, version } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const execFileAsync = promisify(execFile);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const producerSource = join(projectRoot, 'scripts', 'pack-runtime.mjs');
const identitySource = join(projectRoot, 'scripts', 'release-identity.mjs');
const renameMapSource = join(projectRoot, 'scripts', 'rename-map.json');
const roots: string[] = [];

const origin = `https://${'a'.repeat(20)}.supabase.co`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type Fixture = Readonly<{
  root: string;
  pack: string;
  custody: string;
  evidence: string;
  calls: string;
  packingObservations: string;
  env: NodeJS.ProcessEnv;
}>;

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-runtime-producer-`));
  roots.push(root);
  const scripts = join(root, 'scripts');
  const bin = join(root, 'bin');
  await Promise.all([
    mkdir(join(root, 'src', 'native'), { recursive: true }),
    mkdir(scripts, { recursive: true }),
    mkdir(bin, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, 'package.json'), JSON.stringify({
      name: RENAME_MAP.npmPackage,
      version,
      engines: { node: '>=24' },
      bin: { [RENAME_MAP.binCommand]: `dist/bin/${RENAME_MAP.binCommand}.mjs` },
      files: ['dist/', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
      dependencies: { fastify: '5.10.0' },
    }), 'utf8'),
    writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8'),
    writeFile(join(root, 'README.md'), 'runtime fixture\n', 'utf8'),
    writeFile(join(root, 'LICENSE'), 'MIT fixture\n', 'utf8'),
    writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'notices fixture\n', 'utf8'),
    writeFile(join(root, 'src', 'native', 'directory-exchange.cc'), 'native fixture\n', 'utf8'),
    writeFile(join(scripts, 'pack-runtime.mjs'), await readFile(producerSource)),
    writeFile(join(scripts, 'release-identity.mjs'), await readFile(identitySource)),
    writeFile(join(scripts, 'rename-map.json'), await readFile(renameMapSource)),
  ]);

  const calls = join(root, 'calls.log');
  const packingObservations = join(root, 'packing-observations.json');
  const npm = join(bin, 'npm');
  await writeFile(npm, `#!${process.execPath}
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write('11.12.1\\n'); process.exit(0); }
appendFileSync(process.env.${RENAME_MAP.envPrefix}FAKE_NPM_CALLS, args.join(' ') + '\\n');
if (args[0] === 'run' && args[1] === 'build') {
  if (process.env.${RENAME_MAP.envPrefix}FAKE_BUILD_FAILURE) process.exit(7);
  const dist = join(process.cwd(), 'dist');
  mkdirSync(join(dist, 'bin'), { recursive: true });
  mkdirSync(join(dist, 'web'), { recursive: true });
  mkdirSync(join(dist, 'native'), { recursive: true });
  writeFileSync(join(dist, 'bin', '${RENAME_MAP.binCommand}.mjs'), process.env.${RENAME_MAP.envPrefix}FAKE_BUNDLE_CONTENT ?? 'bin\\n');
  writeFileSync(join(dist, 'web', 'index.html'), '<html></html>\\n');
  writeFileSync(join(dist, 'native', 'directory_exchange.node'), 'native\\n');
  if (process.env.${RENAME_MAP.envPrefix}FAKE_FORBIDDEN_CONTENT) writeFileSync(join(dist, 'web', 'app.js.map'), '{}\\n');
  if (process.env.${RENAME_MAP.envPrefix}FAKE_SOURCE_DRIFT) writeFileSync(join(process.cwd(), 'README.md'), 'drifted source\\n');
  const holdMilliseconds = Number.parseInt(process.env.${RENAME_MAP.envPrefix}FAKE_BUILD_HOLD_MS ?? '0', 10);
  if (holdMilliseconds > 0) {
    appendFileSync(process.env.${RENAME_MAP.envPrefix}FAKE_BUILD_EVENTS, 'start ' + process.pid + '\\n');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMilliseconds);
    appendFileSync(process.env.${RENAME_MAP.envPrefix}FAKE_BUILD_EVENTS, 'end ' + process.pid + '\\n');
  }
  process.exit(0);
}
if (args[0] !== 'pack') process.exit(8);
const custody = args[args.indexOf('--pack-destination') + 1];
const packingDirectory = args.find((argument, index) => index > 0 && !argument.startsWith('-') && args[index - 1] !== '--pack-destination');
const packageRoot = packingDirectory ?? process.cwd();
const files = [];
const add = (path) => {
  const bytes = readFileSync(join(packageRoot, path));
  const stat = statSync(join(packageRoot, path));
  files.push({ path, size: stat.size, mode: stat.mode & 0o777, bytes });
};
const addDirectory = (path) => {
  for (const entry of readdirSync(join(packageRoot, path), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path + '/' + entry.name;
    if (entry.isDirectory()) addDirectory(child);
    else add(child);
  }
};
for (const path of ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) add(path);
addDirectory('dist');
files.sort((left, right) => left.path.localeCompare(right.path));
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (packingDirectory) {
  writeFileSync(process.env.${RENAME_MAP.envPrefix}FAKE_PACK_OBSERVATIONS, JSON.stringify({
    directory: packingDirectory,
    mode: statSync(packingDirectory).mode & 0o777,
    manifest,
    manifestSha256: createHash('sha256').update(readFileSync(join(packageRoot, 'package.json'))).digest('hex'),
    files: files.map(({ path, size, mode, bytes }) => ({ path, size, mode, sha256: createHash('sha256').update(bytes).digest('hex') })),
  }) + '\\n');
}
const field = (header, offset, length, value) => header.write(String(value).slice(0, length), offset, length, 'utf8');
const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\\0';
const entry = ({ path, mode, bytes }) => {
  const header = Buffer.alloc(512);
  field(header, 0, 100, 'package/' + path);
  field(header, 100, 8, octal(mode, 8));
  field(header, 108, 8, octal(0, 8));
  field(header, 116, 8, octal(0, 8));
  field(header, 124, 12, octal(bytes.byteLength, 12));
  field(header, 136, 12, octal(0, 12));
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  field(header, 257, 6, 'ustar');
  field(header, 263, 2, '00');
  field(header, 329, 8, octal(0, 8));
  field(header, 337, 8, octal(0, 8));
  field(header, 148, 8, octal(header.reduce((sum, value) => sum + value, 0), 8));
  const padding = Buffer.alloc((512 - bytes.byteLength % 512) % 512);
  return [header, bytes, padding];
};
const archiveBytes = gzipSync(Buffer.concat([...files.flatMap(entry), Buffer.alloc(1024)]));
const filename = '${RENAME_MAP.slug}-' + manifest.version + '.tgz';
const archive = process.env.${RENAME_MAP.envPrefix}FAKE_ARCHIVE_SUBSTITUTION ? Buffer.concat([archiveBytes, Buffer.from('substituted archive')]) : archiveBytes;
writeFileSync(join(custody, filename), archive);
if (process.env.${RENAME_MAP.envPrefix}FAKE_PACK_FAILURE) process.exit(9);
const inventory = files.map(({ path, size, mode }) => ({ path, size, mode }));
if (process.env.${RENAME_MAP.envPrefix}FAKE_EXTRA_FILE) inventory.push({ path: 'unexpected.txt', size: 1, mode: 420 });
if (process.env.${RENAME_MAP.envPrefix}FAKE_INVENTORY_MISMATCH) inventory.pop();
const result = {
  filename,
  shasum: createHash('sha1').update(archiveBytes).digest('hex'),
  integrity: 'sha512-' + createHash('sha512').update(archiveBytes).digest('base64'),
  files: inventory,
};
process.stdout.write(JSON.stringify(process.env.${RENAME_MAP.envPrefix}FAKE_MULTIPLE_RESULTS ? [result, result] : [result]));
`, 'utf8');
  await chmod(npm, 0o755);

  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });

  return {
    root,
    pack: join(scripts, 'pack-runtime.mjs'),
    custody: join(root, 'custody'),
    evidence: join(root, 'runtime-evidence.json'),
    calls,
    packingObservations,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      [`${RENAME_MAP.envPrefix}FAKE_NPM_CALLS`]: calls,
      [`${RENAME_MAP.envPrefix}FAKE_PACK_OBSERVATIONS`]: packingObservations,
    },
  };
}

type Invocation = Readonly<{ stdout: string; stderr: string }> | (Error & Readonly<{ stdout?: string; stderr?: string }>);

async function invoke(fixture: Fixture, args: readonly string[], extra: NodeJS.ProcessEnv = {}): Promise<Invocation> {
  try {
    return await execFileAsync(process.execPath, [fixture.pack, ...args], {
      cwd: fixture.root,
      env: { ...fixture.env, ...extra },
    });
  } catch (error) {
    return error as Invocation;
  }
}

async function invokeConcurrent(
  fixture: Fixture,
  args: readonly string[],
  extra: NodeJS.ProcessEnv = {},
): Promise<{ readonly code: number | null; readonly stderr: string }> {
  const { promise, reject, resolve } = Promise.withResolvers<{
    readonly code: number | null;
    readonly stderr: string;
  }>();
  const child = spawn(process.execPath, [fixture.pack, ...args], {
    cwd: fixture.root,
    env: { ...fixture.env, ...extra },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.once('error', reject);
  child.once('close', (code) => {
    resolve({ code, stderr });
  });
  return await promise;
}

function runtimePackLock(root: string): string {
  return join(
    tmpdir(),
    `${RENAME_MAP.slug}-pack-runtime-${createHash('sha256').update(root).digest('hex').slice(0, 16)}.lock`,
  );
}

function maxConcurrentBuilds(events: string): number {
  let current = 0;
  let maximum = 0;
  for (const event of events.trim().split('\n').filter(Boolean)) {
    current += event.startsWith('start ') ? 1 : -1;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function producerArgs(fixture: Fixture, purpose = 'development-check'): string[] {
  return ['--purpose', purpose, '--custody-dir', fixture.custody, '--evidence', fixture.evidence];
}

async function npmCalls(fixture: Fixture): Promise<string[]> {
  try {
    return (await readFile(fixture.calls, 'utf8')).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

type PackingObservation = Readonly<{
  directory: string;
  mode: number;
  manifest: Record<string, unknown>;
  manifestSha256: string;
  files: readonly Readonly<{ path: string; size: number; mode: number; sha256: string }>[];
}>;

async function packingObservation(fixture: Fixture): Promise<PackingObservation> {
  return JSON.parse(await readFile(fixture.packingObservations, 'utf8')) as PackingObservation;
}


describe('runtime archive producer', () => {
  test('distinguishes compiler source-map strings from emitted source-map payloads', async () => {
    const compiler = await createFixture();
    await invoke(compiler, producerArgs(compiler), {
      [`${RENAME_MAP.envPrefix}FAKE_BUNDLE_CONTENT`]: 'writer.writeComment(`//# sourceMappingURL=${url}`);',
    });
    expect(JSON.parse(await readFile(compiler.evidence, 'utf8')).archive.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const directive = await createFixture();
    await invoke(directive, producerArgs(directive), {
      [`${RENAME_MAP.envPrefix}FAKE_BUNDLE_CONTENT`]: 'console.log(1);\n//# sourceMappingURL=app.js.map',
    });
    await expect(lstat(directive.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects staged changes cancelled by unstaged bytes and extra npm inventory members', async () => {
    const staged = await createFixture();
    const readme = join(staged.root, 'README.md');
    const original = await readFile(readme);
    await writeFile(readme, 'staged modification\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: staged.root });
    await writeFile(readme, original);
    await invoke(staged, producerArgs(staged, 'candidate'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    expect(await npmCalls(staged)).toEqual([]);
    await expect(lstat(staged.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
    const extra = await createFixture();
    await invoke(extra, producerArgs(extra), { [`${RENAME_MAP.envPrefix}FAKE_EXTRA_FILE`]: '1' });
    await expect(lstat(extra.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rejects malformed options, origin-valued argv, reused custody, and invalid purpose/origin combinations before child work', async () => {
    const cases = [
      [] as string[],
      ['--purpose', 'development-check', '--purpose', 'development-check', '--custody-dir', '/tmp/c', '--evidence', '/tmp/e'],
      ['--purpose', 'development-check', '--custody-dir', 'relative', '--evidence', '/tmp/e'],
      ['--purpose', 'development-check', '--custody-dir', '/tmp/c', '--evidence', '/tmp/e', '--origin', origin],
      ['--purpose', 'not-a-purpose', '--custody-dir', '/tmp/c', '--evidence', '/tmp/e'],
    ];
    for (const args of cases) {
      const fixture = await createFixture();
      const result = await invoke(fixture, args);
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result instanceof Error ? result.message : ''}`;
      expect(output).toContain('runtime producer failed');
      expect(await npmCalls(fixture)).toEqual([]);
    }

    const reused = await createFixture();
    await mkdir(reused.custody);
    await invoke(reused, producerArgs(reused));
    expect(await npmCalls(reused)).toEqual([]);

    const candidate = await createFixture();
    await invoke(candidate, producerArgs(candidate, 'candidate'));
    expect(await npmCalls(candidate)).toEqual([]);
  });

  test('records only configured state and fingerprint, never support-origin cleartext', async () => {
    const absent = await createFixture();
    await invoke(absent, producerArgs(absent));
    const absentEvidence = JSON.parse(await readFile(absent.evidence, 'utf8'));
    expect(absentEvidence.status).toBe('development-check');
    expect(absentEvidence.support).toEqual({ configured: false });

    const configured = await createFixture();
    const result = await invoke(configured, producerArgs(configured), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    const evidenceText = await readFile(configured.evidence, 'utf8');
    const evidence = JSON.parse(evidenceText);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result instanceof Error ? result.message : ''}`;
    expect(output).not.toContain(origin);
    expect(evidenceText).not.toContain(origin);
    expect(evidence.support).toEqual({
      configured: true,
      originSha256: createHash('sha256').update(origin).digest('hex'),
    });

    const deployment = await createFixture();
    await invoke(deployment, producerArgs(deployment, 'deployment-check'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    expect(JSON.parse(await readFile(deployment.evidence, 'utf8')).status).toBe('deployment-check');

    const candidate = await createFixture();
    await invoke(candidate, producerArgs(candidate, 'candidate'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    expect(JSON.parse(await readFile(candidate.evidence, 'utf8')).status).toBe('candidate');
  });

  test('rejects unsafe source/package inputs and source drift while retaining only disposable dirty-development identity', async () => {

    const symlinked = await createFixture();
    await symlink(join(symlinked.root, 'README.md'), join(symlinked.root, 'src', 'linked-input'));
    await invoke(symlinked, producerArgs(symlinked));
    expect(await npmCalls(symlinked)).toEqual([]);

    if (process.platform !== 'win32') {
      const special = await createFixture();
      await execFileAsync('mkfifo', [join(special.root, 'src', 'special-input')]);
      await invoke(special, producerArgs(special));
      expect(await npmCalls(special)).toEqual([]);
    }

    const forbidden = await createFixture();
    await invoke(forbidden, producerArgs(forbidden), { [`${RENAME_MAP.envPrefix}FAKE_FORBIDDEN_CONTENT`]: '1' });
    expect(await npmCalls(forbidden)).toEqual(['run build']);
    await expect(lstat(forbidden.evidence)).rejects.toMatchObject({ code: 'ENOENT' });

    const candidate = await createFixture();
    await writeFile(join(candidate.root, 'README.md'), 'dirty source\n');
    await invoke(candidate, producerArgs(candidate, 'candidate'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    expect(await npmCalls(candidate)).toEqual([]);

    const development = await createFixture();
    await writeFile(join(development.root, 'README.md'), 'dirty source\n');
    await invoke(development, producerArgs(development));
    const developmentEvidence = JSON.parse(await readFile(development.evidence, 'utf8'));
    expect(developmentEvidence.source.clean).toBe(false);
    expect(developmentEvidence.source.trackedDiffSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(developmentEvidence.native.source.path).toBe('src/native/directory-exchange.cc');
    expect(developmentEvidence.native.binary.path).toBe('dist/native/directory_exchange.node');

    const drifting = await createFixture();
    await invoke(drifting, producerArgs(drifting), { [`${RENAME_MAP.envPrefix}FAKE_SOURCE_DRIFT`]: '1' });
    expect(await npmCalls(drifting)).toEqual(['run build']);
    await expect(lstat(drifting.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('runs one build then one pack and atomically records complete archive and inventory identity', async () => {
    const fixture = await createFixture();
    await invoke(fixture, producerArgs(fixture));
    const evidenceText = await readFile(fixture.evidence, 'utf8');
    const evidence = JSON.parse(evidenceText);
    const archive = await readFile(join(fixture.custody, evidence.archive.basename));

    expect(await npmCalls(fixture)).toHaveLength(2);
    expect((await npmCalls(fixture))[0]).toBe('run build');
    expect((await npmCalls(fixture))[1]).toMatch(/^pack --json --ignore-scripts --pack-destination /u);
    expect(evidence.kind).toBe(`${RENAME_MAP.kindPrefix}.runtime-artifact-evidence/v1`);
    expect(evidence.package.version).toBe(version);
    expect(evidence.archive).toMatchObject({
      basename: `${RENAME_MAP.slug}-${version}.tgz`,
      byteLength: archive.byteLength,
      sha256: createHash('sha256').update(archive).digest('hex'),
      npmShasumSha1: createHash('sha1').update(archive).digest('hex'),
      npmIntegritySha512: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
    });
    expect(evidence.archive.files).toHaveLength(7);
    expect(evidence.archive).not.toHaveProperty('path');
    expect(evidenceText).not.toContain(fixture.root);
    expect(evidence.contents.dist.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: `dist/bin/${RENAME_MAP.binCommand}.mjs` }),
      expect.objectContaining({ path: 'dist/web/index.html' }),
    ]));
  });

  test('creates the configured bootstrap archive from one private version-only packing tree without changing stable source files', async () => {
    const fixture = await createFixture();
    const sourceManifest = await readFile(join(fixture.root, 'package.json'));
    const sourceLock = await readFile(join(fixture.root, 'package-lock.json'));
    const sourceManifestMode = (await lstat(join(fixture.root, 'package.json'))).mode & 0o777;
    const sourceLockMode = (await lstat(join(fixture.root, 'package-lock.json'))).mode & 0o777;

    const result = await invoke(fixture, producerArgs(fixture, 'bootstrap'), { [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin });
    expect(result).not.toBeInstanceOf(Error);

    const evidenceText = await readFile(fixture.evidence, 'utf8');
    const evidence = JSON.parse(evidenceText);
    const observation = await packingObservation(fixture);
    const archive = join(fixture.custody, evidence.archive.basename);
    const packedManifest = Buffer.from((await execFileAsync('tar', ['-xOf', archive, 'package/package.json'])).stdout);

    expect(await npmCalls(fixture)).toEqual([
      'run build',
      `pack ${observation.directory} --json --ignore-scripts --pack-destination ${fixture.custody}`,
    ]);
    expect(observation.mode).toBe(0o700);
    expect(observation.manifest).toEqual({ ...JSON.parse(sourceManifest.toString('utf8')), version: bootstrapVersion });
    expect(observation.files.map((file) => file.path).sort()).toEqual([
      'LICENSE',
      'README.md',
      'THIRD_PARTY_NOTICES.md',
      `dist/bin/${RENAME_MAP.binCommand}.mjs`,
      'dist/native/directory_exchange.node',
      'dist/web/index.html',
      'package.json',
    ]);
    expect(observation.files.some((file) => ['package-lock.json', 'src/native/directory-exchange.cc'].includes(file.path))).toBe(false);
    expect(evidence).toMatchObject({
      purpose: 'bootstrap',
      status: 'bootstrap',
      package: {
        name: RENAME_MAP.npmPackage,
        version: bootstrapVersion,
        manifestProjection: {
          field: 'version',
          sourceVersion: version,
          packedVersion: bootstrapVersion,
          sourceSha256: createHash('sha256').update(sourceManifest).digest('hex'),
          projectedInputSha256: observation.manifestSha256,
          packedOutputSha256: createHash('sha256').update(packedManifest).digest('hex'),
        },
      },
      source: {
        packageJsonSha256: createHash('sha256').update(sourceManifest).digest('hex'),
        packageLockSha256: createHash('sha256').update(sourceLock).digest('hex'),
      },
      archive: {
        basename: `${RENAME_MAP.slug}-${bootstrapVersion}.tgz`,
        byteLength: (await readFile(archive)).byteLength,
        sha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
      },
    });
    expect(evidenceText).not.toContain(fixture.root);
    expect(evidenceText).not.toContain(observation.directory);
    expect(await readFile(join(fixture.root, 'package.json'))).toEqual(sourceManifest);
    expect((await lstat(join(fixture.root, 'package.json'))).mode & 0o777).toBe(sourceManifestMode);
    expect(await readFile(join(fixture.root, 'package-lock.json'))).toEqual(sourceLock);
    expect((await lstat(join(fixture.root, 'package-lock.json'))).mode & 0o777).toBe(sourceLockMode);
    await expect(lstat(observation.directory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('cleans the bootstrap packing tree and preserves stable source files after pack failure', async () => {
    const fixture = await createFixture();
    const sourceManifest = await readFile(join(fixture.root, 'package.json'));
    const sourceLock = await readFile(join(fixture.root, 'package-lock.json'));
    const sourceManifestMode = (await lstat(join(fixture.root, 'package.json'))).mode & 0o777;
    const sourceLockMode = (await lstat(join(fixture.root, 'package-lock.json'))).mode & 0o777;

    await invoke(fixture, producerArgs(fixture, 'bootstrap'), {
      [`${RENAME_MAP.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]: origin,
      [`${RENAME_MAP.envPrefix}FAKE_PACK_FAILURE`]: '1',
    });
    expect(await npmCalls(fixture)).toHaveLength(2);

    const observation = await packingObservation(fixture);
    await expect(lstat(observation.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(fixture.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(fixture.root, 'package.json'))).toEqual(sourceManifest);
    expect((await lstat(join(fixture.root, 'package.json'))).mode & 0o777).toBe(sourceManifestMode);
    expect(await readFile(join(fixture.root, 'package-lock.json'))).toEqual(sourceLock);
    expect((await lstat(join(fixture.root, 'package-lock.json'))).mode & 0o777).toBe(sourceLockMode);
  });

  test('atomically recovers a dead owner while serializing concurrent packers', async () => {
    const fixture = await createFixture();
    const lock = runtimePackLock(fixture.root);
    const events = join(fixture.root, 'build-events.log');
    await mkdir(lock, { mode: 0o700 });
    await writeFile(
      join(lock, 'owner'),
      JSON.stringify({ pid: 999_999_999, identity: 'dead-owner', token: 'dead-owner' }),
    );

    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, async (_, index) => await invokeConcurrent(
          fixture,
          [
            '--purpose',
            'development-check',
            '--custody-dir',
            join(fixture.root, `custody-${index}`),
            '--evidence',
            join(fixture.root, `evidence-${index}.json`),
          ],
          {
            [`${RENAME_MAP.envPrefix}FAKE_BUILD_EVENTS`]: events,
            [`${RENAME_MAP.envPrefix}FAKE_BUILD_HOLD_MS`]: '250',
          },
        )),
      );

      expect(results).toEqual(
        Array.from({ length: 8 }, () => expect.objectContaining({ code: 0, stderr: '' })),
      );
      expect(maxConcurrentBuilds(await readFile(events, 'utf8'))).toBe(1);
    } finally {
      await rm(lock, { recursive: true, force: true });
      await rm(`${lock}.takeover`, { recursive: true, force: true });
    }
  });

  test('denies evidence after build/pack failures, ambiguous results, inventory mismatch, or archive substitution without deleting emitted archives', async () => {
    for (const failure of [
      `${RENAME_MAP.envPrefix}FAKE_BUILD_FAILURE`,
      `${RENAME_MAP.envPrefix}FAKE_PACK_FAILURE`,
      `${RENAME_MAP.envPrefix}FAKE_MULTIPLE_RESULTS`,
      `${RENAME_MAP.envPrefix}FAKE_INVENTORY_MISMATCH`,
      `${RENAME_MAP.envPrefix}FAKE_ARCHIVE_SUBSTITUTION`,
    ]) {
      const fixture = await createFixture();
      await invoke(fixture, producerArgs(fixture), { [failure]: '1' });
      await expect(lstat(fixture.evidence)).rejects.toMatchObject({ code: 'ENOENT' });
      if (failure !== `${RENAME_MAP.envPrefix}FAKE_BUILD_FAILURE`) {
        await expect(lstat(join(fixture.custody, `${RENAME_MAP.slug}-${version}.tgz`))).resolves.toMatchObject({ isFile: expect.any(Function) });
      }
    }
  });
});
