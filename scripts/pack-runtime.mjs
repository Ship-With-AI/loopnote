import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapVersion, version as stableVersion } from './release-identity.mjs';
import renameMap from './rename-map.json' with { type: 'json' };

const root = resolve(dirname(dirname(fileURLToPath(import.meta.url))));

const runtimePackLock = join(os.tmpdir(), `${renameMap.slug}-pack-runtime-${sha256(root).slice(0, 16)}.lock`);
const lockWait = new Int32Array(new SharedArrayBuffer(4));
const purposes = new Set(['bootstrap', 'candidate', 'development-check', 'deployment-check']);
const requiredFiles = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const buildInputs = ['src', 'scripts', 'index.html', 'tsconfig.json', 'tsconfig.web.json', 'vite.config.ts'];
const packageFiles = ['package.json', 'package-lock.json', ...requiredFiles];
const forbiddenPath = new RegExp(`(?:^|/)(?:\\.git|\\.github|\\.planning|\\.cumpa|\\.${renameMap.slug}|node_modules|src|tests?|fixtures?|\\.kimi-code)(?:/|$)|\\.(?:map|tsx?|vue)$`, 'u');
// Bounded scan: compiler strings describing maps are not emitted map payloads.
const sourceMapContent = /(?:^[ \t]*\/\/[#@][ \t]*sourceMappingURL=|^[ \t]*\/\*[#@][ \t]*sourceMappingURL=|["']sourcesContent["']\s*:\s*\[)/mu;

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha1(value) {
  return createHash('sha1').update(value).digest('hex');
}

function sha512Integrity(value) {
  return `sha512-${createHash('sha512').update(value).digest('base64')}`;
}

function runtimePackProcessIdentity(pid) {
  if (process.platform === 'linux') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const closingParenthesis = stat.lastIndexOf(')');
      const startTime = stat.slice(closingParenthesis + 2).trim().split(/\s+/u)[19];
      return /^\d+$/u.test(startTime) ? `linux:${startTime}` : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'darwin') {
    try {
      const startTime = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().replace(/\s+/gu, ' ');
      return startTime ? `darwin:${startTime}` : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'win32') {
    try {
      const startTime = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      return /^\d+$/u.test(startTime) ? `win32:${startTime}` : null;
    } catch {
      return null;
    }
  }
  return null;
}

function runtimePackLockOwner() {
  try {
    const owner = JSON.parse(readFileSync(join(runtimePackLock, 'owner'), 'utf8'));
    if (
      owner === null
      || typeof owner !== 'object'
      || !Number.isSafeInteger(owner.pid)
      || owner.pid < 1
      || typeof owner.identity !== 'string'
      || typeof owner.token !== 'string'
    ) return null;
    return owner;
  } catch {
    return null;
  }
}

function runtimePackLockOwnerIsAlive(owner) {
  return owner !== null && runtimePackProcessIdentity(owner.pid) === owner.identity;
}

function recoverDeadRuntimePackLock(owner) {
  const takeover = `${runtimePackLock}.takeover`;
  try {
    mkdirSync(takeover, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') return false;
    throw error;
  }
  try {
    const currentOwner = runtimePackLockOwner();
    if (
      currentOwner === null
      || currentOwner.token !== owner?.token
      || runtimePackLockOwnerIsAlive(currentOwner)
    ) return false;
    const staleLock = `${runtimePackLock}.stale-${randomBytes(8).toString('hex')}`;
    renameSync(runtimePackLock, staleLock);
    rmSync(staleLock, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  } finally {
    rmSync(takeover, { recursive: true, force: true });
  }
}

let runtimePackLockToken;

function acquireRuntimePackLock() {
  const deadline = Date.now() + 300_000;
  for (;;) {
    try {
      mkdirSync(runtimePackLock, { mode: 0o700 });
      const identity = runtimePackProcessIdentity(process.pid);
      if (identity === null) fail(`cannot identify runtime pack lock owner on ${process.platform}`);
      runtimePackLockToken = randomBytes(16).toString('hex');
      writeFileSync(
        join(runtimePackLock, 'owner'),
        `${JSON.stringify({ pid: process.pid, identity, token: runtimePackLockToken })}\n`,
        { mode: 0o600, flag: 'wx' },
      );
      return;
    } catch (error) {
      if (!(error && typeof error === 'object' && error.code === 'EEXIST')) throw error;
      const owner = runtimePackLockOwner();
      if (!runtimePackLockOwnerIsAlive(owner) && recoverDeadRuntimePackLock(owner)) continue;
      if (Date.now() >= deadline) fail('timed out waiting for runtime pack lock');
      Atomics.wait(lockWait, 0, 0, 50);
    }
  }
}

function releaseRuntimePackLock() {
  if (runtimePackLockToken === undefined) return;
  const owner = runtimePackLockOwner();
  if (owner?.token === runtimePackLockToken) rmSync(runtimePackLock, { recursive: true, force: true });
  runtimePackLockToken = undefined;
}

function normalizePath(path) {
  const normalized = path.split(sep).join('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized.includes('\\')
    || /[\0-\x1f\x7f]/u.test(normalized)
  ) fail('unsafe package path');
  return normalized;
}

function safeAbsoluteDirectory(path, label) {
  if (!isAbsolute(path)) fail(`${label} must be an absolute path`);
  const parent = dirname(path);
  let parentStat;
  try {
    parentStat = lstatSync(parent);
  } catch {
    fail(`${label} parent must exist`);
  }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail(`${label} parent must be a directory`);
  return resolve(path);
}

function parseArguments(argv) {
  if (argv.length !== 6) fail('expected exactly --purpose, --custody-dir, and --evidence');
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--purpose', '--custody-dir', '--evidence'].includes(name) || !value || options.has(name)) {
      fail('invalid runtime producer options');
    }
    options.set(name, value);
  }
  const purpose = options.get('--purpose');
  if (!purposes.has(purpose)) fail('invalid runtime producer purpose');
  const custodyDirectory = safeAbsoluteDirectory(options.get('--custody-dir'), 'custody directory');
  const evidencePath = safeAbsoluteDirectory(options.get('--evidence'), 'evidence path');
  if (lstatExists(custodyDirectory) || lstatExists(evidencePath)) fail('custody and evidence destinations must not already exist');
  return { purpose, custodyDirectory, evidencePath };
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function supportConfiguration(value, purpose) {
  if (value === undefined) {
    if (purpose !== 'development-check') fail('configured support origin is required for this purpose');
    return { configured: false };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('support origin must be canonical');
  }
  const ref = url.hostname.slice(0, -'.supabase.co'.length);
  if (
    value !== `https://${ref}.supabase.co`
    || url.protocol !== 'https:'
    || !/^[a-z0-9]{20}$/u.test(ref)
  ) fail('support origin must be canonical');
  return { configured: true, originSha256: sha256(value) };
}

function command(commandName, args, options = {}) {
  try {
    return execFileSync(commandName, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: packEnvironment(),
      ...options,
    }).trim();
  } catch {
    fail(`required ${commandName} command failed`);
  }
}

function trackedSource() {
  const head = command('git', ['rev-parse', 'HEAD']);
  const tree = command('git', ['rev-parse', 'HEAD^{tree}']);
  const diffOptions = ['--binary', '--no-ext-diff', '--no-textconv', '--no-renames'];
  const index = command('git', ['diff', ...diffOptions, '--cached', 'HEAD', '--']);
  const working = command('git', ['diff', ...diffOptions, '--']);
  return { head, tree, clean: index.length === 0 && working.length === 0, trackedDiffSha256: sha256(JSON.stringify([index, working])) };
}

function trackedFiles() {
  const output = command('git', ['ls-files', '-z']);
  return output.split('\0').filter(Boolean).map(normalizePath).sort();
}

function walkClosed(path, relativePath = '') {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('source input must contain only regular files and directories');
  if (stat.isFile()) return [{ path: normalizePath(relativePath), stat }];
  const entries = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    entries.push(...walkClosed(join(path, entry.name), relativePath ? join(relativePath, entry.name) : entry.name));
  }
  return entries;
}

function preflightSource() {
  for (const path of trackedFiles()) {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('tracked source must not contain links or special files');
  }
  const inputs = [];
  for (const input of [...packageFiles, ...buildInputs]) {
    const path = join(root, input);
    if (!lstatExists(path)) continue;
    for (const entry of walkClosed(path, input)) {
      inputs.push([entry.path, entry.stat.mode & 0o777, sha256(readFileSync(join(root, entry.path)))]);
    }
  }
  return sha256(JSON.stringify(inputs));
}

function exactDependencies(manifest) {
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies)) return {};
  return Object.fromEntries(Object.entries(manifest.dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => {
      if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
        fail('runtime dependencies must use exact versions');
      }
      return [name, version];
    }));
}

function packageContract() {
  const manifestBytes = readFileSync(join(root, 'package.json'));
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes);
  } catch {
    fail('package manifest must be valid JSON');
  }
  if (
    !manifest
    || manifest.name !== renameMap.npmPackage
    || manifest.engines?.node !== '>=24'
    || manifest.bin?.[renameMap.binCommand] !== `dist/bin/${renameMap.binCommand}.mjs`
    || Object.hasOwn(manifest, 'private')
    || !Array.isArray(manifest.files)
    || manifest.files.length !== 4
    || !['dist/', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].every((file) => manifest.files.includes(file))
  ) fail('package manifest does not satisfy the runtime contract');
  return {
    manifest,
    manifestBytes,
    manifestSha256: sha256(manifestBytes),
    lockSha256: sha256(readFileSync(join(root, 'package-lock.json'))),
    runtimeDependencies: exactDependencies(manifest),
  };
}

function packageOutputInventory() {
  const dist = join(root, 'dist');
  if (!lstatExists(dist)) fail('build did not create dist');
  const files = walkClosed(dist, 'dist').map(({ path, stat }) => {
    if (forbiddenPath.test(path)) fail('forbidden package path');
    const content = readFileSync(join(root, path));
    if (sourceMapContent.test(content.toString('utf8'))) fail('forbidden source map content');
    return {
      path,
      mode: stat.mode & 0o777,
      byteLength: stat.size,
      sha256: sha256(content),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (!files.some((file) => file.path === `dist/bin/${renameMap.binCommand}.mjs`) || !files.some((file) => file.path === 'dist/web/index.html')) {
    fail('build did not produce required runtime files');
  }
  return { files, sha256: sha256(JSON.stringify(files)) };
}

function nativeIdentity() {
  const sourcePath = 'src/native/directory-exchange.cc';
  const binaryPath = 'dist/native/directory_exchange.node';
  const source = join(root, sourcePath);
  const binary = join(root, binaryPath);
  if (!lstatExists(source)) fail('native source is missing');
  const sourceStat = lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) fail('native source is unsafe');
  if (!lstatExists(binary)) return { source: { path: sourcePath, sha256: sha256(readFileSync(source)) }, binary: null };
  const binaryStat = lstatSync(binary);
  if (!binaryStat.isFile() || binaryStat.isSymbolicLink()) fail('native binary is unsafe');
  return {
    source: { path: sourcePath, sha256: sha256(readFileSync(source)) },
    binary: { path: binaryPath, sha256: sha256(readFileSync(binary)) },
  };
}

function legalIdentity() {
  return Object.fromEntries(requiredFiles.filter((path) => path !== 'README.md').map((path) => [path, sha256(readFileSync(join(root, path)))]));
}

function inventoryFromNpm(files, distInventory, packageRoot = root) {
  if (!Array.isArray(files) || files.length === 0) fail('npm pack did not return an inventory');
  const expected = new Map(distInventory.files.map((file) => [file.path, file]));
  for (const path of ['package.json', ...requiredFiles]) {
    const stat = lstatSync(join(packageRoot, path));
    expected.set(path, { byteLength: stat.size, mode: stat.mode & 0o777 });
  }
  const paths = new Set();
  const inventory = files.map((file) => {
    if (!file || typeof file.path !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) fail('npm pack returned an invalid inventory');
    const path = normalizePath(file.path);
    if (paths.has(path)) fail('npm pack returned a duplicate inventory path');
    paths.add(path);
    const source = expected.get(path);
    if (!source || file.size !== source.byteLength || file.mode !== source.mode) fail('npm pack inventory does not match source');
    return { path, size: file.size, mode: file.mode };
  });
  if (paths.size !== expected.size) fail('npm pack inventory does not match source');
  return inventory;
}

function archiveIdentity(custodyDirectory, pack) {
  if (!pack || typeof pack.filename !== 'string' || basename(pack.filename) !== pack.filename || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u.test(pack.filename)) {
    fail('npm pack returned an unsafe archive name');
  }
  const archivePath = resolve(custodyDirectory, pack.filename);
  if (relative(custodyDirectory, archivePath).startsWith('..') || !archivePath.startsWith(`${custodyDirectory}${sep}`)) fail('npm pack archive escaped custody');
  const custodyEntries = readdirSync(custodyDirectory);
  if (custodyEntries.length !== 1 || custodyEntries[0] !== pack.filename) fail('npm pack produced an unexpected archive set');
  const before = lstatSync(archivePath);
  if (!before.isFile() || before.isSymbolicLink()) fail('npm pack archive is unsafe');
  const descriptor = openSync(archivePath, 'r');
  let bytes;
  let after;
  try {
    bytes = readFileSync(descriptor);
    after = fstatSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const pathAfter = lstatSync(archivePath);
  if (
    before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || before.size !== pathAfter.size
  ) fail('archive changed during hashing');
  const archive = {
    basename: pack.filename,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    npmShasumSha1: sha1(bytes),
    npmIntegritySha512: sha512Integrity(bytes),
  };
  if (pack.shasum !== archive.npmShasumSha1 || pack.integrity !== archive.npmIntegritySha512) fail('npm pack archive identity mismatch');
  return archive;
}

function writeEvidence(path, evidence) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    linkSync(temporary, path);
  } finally {
    unlinkSync(temporary);
  }
}

function npmVersion() {
  return command('npm', ['--version']);
}

function buildEnvironment(origin) {
  const environment = { ...process.env, NODE_ENV: 'production' };
  if (origin === undefined) delete environment[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  return environment;
}
function compilerIdentity() {
  const commandPath = '/usr/bin/c++';
  try {
    const version = execFileSync(commandPath, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: packEnvironment(),
    }).split('\n', 1)[0];
    return { command: commandPath, version, target: `${process.arch}-${process.platform}` };
  } catch {
    return { command: commandPath, version: null, target: `${process.arch}-${process.platform}` };
  }
}


function packEnvironment() {
  const environment = { ...process.env };
  delete environment[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  return environment;
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value]) => Object.hasOwn(right, key) && sameValue(value, right[key]));
  }
  return left === right;
}

function bootstrapPackingTree(packageIdentity) {
  const packingTree = mkdtempSync(join(os.tmpdir(), `${renameMap.slug}-bootstrap-pack-`));
  chmodSync(packingTree, 0o700);
  const manifest = { ...packageIdentity.manifest, version: bootstrapVersion };
  if (
    !sameValue(packageIdentity.manifest, { ...manifest, version: stableVersion })
    || manifest.version !== bootstrapVersion
  ) fail('bootstrap manifest projection must change only version');
  try {
    cpSync(join(root, 'dist'), join(packingTree, 'dist'), { recursive: true, force: false, errorOnExist: true });
    for (const path of requiredFiles) {
      copyFileSync(join(root, path), join(packingTree, path));
      chmodSync(join(packingTree, path), lstatSync(join(root, path)).mode & 0o777);
    }
    const projectedBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(packingTree, 'package.json'), projectedBytes, { mode: lstatSync(join(root, 'package.json')).mode & 0o777, flag: 'wx' });
    return {
      packingTree,
      manifestProjection: {
        field: 'version',
        sourceVersion: stableVersion,
        packedVersion: bootstrapVersion,
        sourceSha256: packageIdentity.manifestSha256,
        projectedInputSha256: sha256(projectedBytes),
      },
    };
  } catch (error) {
    rmSync(packingTree, { recursive: true, force: true });
    throw error;
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const origin = process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  const support = supportConfiguration(origin, options.purpose);
  const sourceBefore = trackedSource();
  if (!sourceBefore.clean && options.purpose !== 'development-check') fail('clean tracked source is required for this purpose');
  const packageIdentity = packageContract();
  const inputsSha256 = preflightSource();
  mkdirSync(options.custodyDirectory, { mode: 0o700 });
  acquireRuntimePackLock();
  let packingTree;
  const cleanup = () => {
    if (packingTree !== undefined) {
      rmSync(packingTree, { recursive: true, force: true });
      packingTree = undefined;
    }
  };
  const onSignal = () => {
    cleanup();
    releaseRuntimePackLock();
    process.exit(128);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.once('SIGHUP', onSignal);
  process.once('SIGQUIT', onSignal);
  try {
    command('npm', ['run', 'build'], { env: buildEnvironment(origin) });
    const contents = { dist: packageOutputInventory() };
    const sourceAfterBuild = trackedSource();
    if (
      sourceBefore.head !== sourceAfterBuild.head
      || sourceBefore.tree !== sourceAfterBuild.tree
      || sourceBefore.trackedDiffSha256 !== sourceAfterBuild.trackedDiffSha256
      || inputsSha256 !== preflightSource()
    ) fail('tracked source changed during build');
    const native = nativeIdentity();
    let packOutput;
    let projection;
    if (options.purpose === 'bootstrap') {
      const bootstrap = bootstrapPackingTree(packageIdentity);
      packingTree = bootstrap.packingTree;
      projection = bootstrap.manifestProjection;
      packOutput = command('npm', ['pack', packingTree, '--json', '--ignore-scripts', '--pack-destination', options.custodyDirectory], { env: packEnvironment() });
    } else {
      packOutput = command('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', options.custodyDirectory], { env: packEnvironment() });
    }
    let packResults;
    try {
      packResults = JSON.parse(packOutput);
    } catch {
      fail('npm pack did not return JSON');
    }
    if (!Array.isArray(packResults) || packResults.length !== 1) fail('npm pack must return exactly one archive');
    const archive = archiveIdentity(options.custodyDirectory, packResults[0]);
    archive.files = inventoryFromNpm(packResults[0].files, contents.dist, packingTree ?? root);
    if (projection) {
      const packedManifest = execFileSync('tar', ['-xOf', join(options.custodyDirectory, archive.basename), 'package/package.json'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      projection.packedOutputSha256 = sha256(packedManifest);
    }
    const sourceAfterPack = trackedSource();
    if (
      sourceBefore.head !== sourceAfterPack.head
      || sourceBefore.tree !== sourceAfterPack.tree
      || sourceBefore.trackedDiffSha256 !== sourceAfterPack.trackedDiffSha256
      || inputsSha256 !== preflightSource()
    ) fail('tracked source changed during pack');
    const evidence = {
      kind: `${renameMap.kindPrefix}.runtime-artifact-evidence/v1`,
      status: options.purpose === 'candidate' ? 'candidate' : options.purpose,
      purpose: options.purpose,
      package: {
        name: packageIdentity.manifest.name,
        version: options.purpose === 'bootstrap' ? bootstrapVersion : packageIdentity.manifest.version,
        runtimeDependencies: packageIdentity.runtimeDependencies,
        ...(projection === undefined ? {} : { manifestProjection: projection }),
      },
      archive,
      source: {
        repository: packageIdentity.manifest.repository?.url ?? null,
        head: sourceBefore.head,
        tree: sourceBefore.tree,
        clean: sourceBefore.clean,
        trackedDiffSha256: sourceBefore.trackedDiffSha256,
        packageJsonSha256: packageIdentity.manifestSha256,
        inputsSha256,
        packageLockSha256: packageIdentity.lockSha256,
      },
      build: {
        configured: support.configured,
        node: process.version,
        npm: npmVersion(),
        git: command('git', ['--version']),
        os: os.release(),
        platform: process.platform,
        arch: process.arch,
        napi: process.versions.napi ?? null,
        compiler: compilerIdentity(),
      },
      contents,
      legal: legalIdentity(),
      native,
      support,
    };
    writeEvidence(options.evidencePath, evidence);
    process.stdout.write(`Created ${options.purpose} runtime artifact evidence.\n`);
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGHUP', onSignal);
    process.removeListener('SIGQUIT', onSignal);
    cleanup();
    releaseRuntimePackLock();
  }
}

try {
  main();
} catch (error) {
  const origin = process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  const detail = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`runtime producer failed: ${origin ? detail.replaceAll(origin, '[redacted]') : detail}\n`);
  process.exitCode = 1;
}
