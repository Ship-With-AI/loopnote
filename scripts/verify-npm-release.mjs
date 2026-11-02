import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { archiveBasename, packageLabel, packumentUrl, provenanceSubject, registryTarballUrl, version as packageVersion } from './release-identity.mjs';
import renameMap from './rename-map.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
const packageName = renameMap.npmPackage;
const registry = 'https://registry.npmjs.org/';
const repository = `Ship-With-AI/${renameMap.slug}`;
const repositoryId = '1327753770';
const ownerId = '224984099';
const workflowPath = '.github/workflows/publish-npm.yml';
const workflowRef = `${repository}/${workflowPath}@refs/heads/main`;
const branchRef = 'refs/heads/main';
const supportFingerprint = '89485617b2d50d4778542ebedc3817a3e3fcddb6520a4a9c3a66e37c3a9c6cdf';
const maxArchiveBytes = 32 * 1024 * 1024;
const maxJsonBytes = 1024 * 1024;
const maxMetadataBytes = 128 * 1024;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sha1Pattern = /^[a-f0-9]{40}$/u;
const sha512IntegrityPattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const positiveIntegerPattern = /^[1-9]\d*$/u;
const expectedChecks = ['PKG-03', 'PKG-04', 'PKG-05', 'REL-03'];
const scannerChecks = ['archiveIdentity', 'protectedExtraction', 'inventoryParity', 'legalParity', 'completeDistParity', 'boundedContentScan'];
const producerKeys = ['kind', 'status', 'purpose', 'package', 'archive', 'source', 'build', 'contents', 'legal', 'native', 'support'];

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hash(algorithm, value, encoding = 'hex') {
  return createHash(algorithm).update(value).digest(encoding);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value === '') fail(`invalid ${label}`);
  return value;
}

function requirePattern(value, label, pattern) {
  const string = requireString(value, label);
  if (!pattern.test(string)) fail(`invalid ${label}`);
  return string;
}

function same(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(`${label} mismatch`);
}

function allowedObject(source, keys, label, optional = []) {
  if (!isRecord(source) || Object.keys(source).some((key) => !keys.includes(key) && !optional.includes(key))) fail(`invalid ${label}`);
  const result = {};
  for (const key of keys) {
    if (!Object.hasOwn(source, key)) fail(`missing ${label}.${key}`);
    result[key] = source[key];
  }
  return result;
}

function boundedEvidence(value, label) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > maxJsonBytes || /https?:\/\/[a-z0-9.-]*supabase\.co\b|\/(?:Users|home|private|var|tmp)\/|(?:^|["\s])[A-Za-z]:[\\/]|(?:npm_|gh[pousr]_)[A-Za-z0-9]{20,}/iu.test(serialized)) fail(`private or unbounded ${label}`);
}

async function safeAbsoluteFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be an absolute path`);
  const absolute = resolve(path);
  const entry = await lstat(absolute);
  if (!entry.isFile() || entry.isSymbolicLink()) fail(`${label} must be a regular file`);
  const parent = await lstat(dirname(absolute));
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail(`${label} parent must be a directory`);
  return absolute;
}

async function newAbsoluteOutput(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be an absolute path`);
  const absolute = resolve(path);
  const parent = await lstat(dirname(absolute));
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail(`${label} parent must be a directory`);
  try {
    await lstat(absolute);
    fail(`${label} must not already exist`);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return absolute;
    throw error;
  }
}

async function stableBytes(path, label, limit) {
  const absolute = await safeAbsoluteFile(path, label);
  const before = await stat(absolute);
  if (before.size > limit) fail(`${label} exceeds size limit`);
  const handle = await open(absolute, 'r');
  let bytes;
  let during;
  try {
    bytes = await handle.readFile();
    during = await handle.stat();
  } finally {
    await handle.close();
  }
  const after = await stat(absolute);
  if (
    before.dev !== during.dev || before.ino !== during.ino || before.size !== during.size
    || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
  ) fail(`${label} changed while read`);
  return bytes;
}

async function readJson(path, label) {
  const bytes = await stableBytes(path, label, maxJsonBytes);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${label} must contain JSON`);
  }
}

function archiveIdentity(bytes, basenameValue) {
  if (basenameValue !== archiveBasename) fail('invalid archive basename');
  return {
    basename: basenameValue,
    byteLength: bytes.byteLength,
    sha256: hash('sha256', bytes),
    npmShasumSha1: hash('sha1', bytes),
    npmIntegritySha512: `sha512-${hash('sha512', bytes, 'base64')}`,
  };
}

async function readArchive(path) {
  const archivePath = await safeAbsoluteFile(path, 'archive');
  const bytes = await stableBytes(archivePath, 'archive', maxArchiveBytes);
  return { archivePath, archive: archiveIdentity(bytes, basename(archivePath)) };
}

function validateArchive(value, label) {
  const archive = allowedObject(value, ['basename', 'byteLength', 'sha256', 'npmShasumSha1', 'npmIntegritySha512'], label, ['files']);
  if (archive.basename !== archiveBasename || !Number.isSafeInteger(archive.byteLength) || archive.byteLength <= 0 || archive.byteLength > maxArchiveBytes) fail(`invalid ${label}`);
  requirePattern(archive.sha256, `${label}.sha256`, sha256Pattern);
  requirePattern(archive.npmShasumSha1, `${label}.npmShasumSha1`, sha1Pattern);
  requirePattern(archive.npmIntegritySha512, `${label}.npmIntegritySha512`, sha512IntegrityPattern);
  return archive;
}

function validatePackage(value, label) {
  const packageInfo = allowedObject(value, ['name', 'version', 'runtimeDependencies'], label);
  if (packageInfo.name !== packageName || packageInfo.version !== packageVersion || !isRecord(packageInfo.runtimeDependencies)) fail(`invalid ${label}`);
  const dependencies = Object.entries(packageInfo.runtimeDependencies);
  if (JSON.stringify(dependencies) !== JSON.stringify([...dependencies].sort(([left], [right]) => left.localeCompare(right)))) fail(`unsorted ${label}.runtimeDependencies`);
  for (const [name, version] of dependencies) if (!name || typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) fail(`invalid ${label}.runtimeDependencies`);
  return { name: packageName, version: packageVersion, runtimeDependencies: Object.fromEntries(dependencies) };
}

function allTrue(value, label, expected) {
  if (
    !isRecord(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
    || Object.values(value).some((entry) => entry !== true)
  ) fail(`incomplete ${label}`);
  return value;
}

function validateProducer(value, archive) {
  allowedObject(value, producerKeys, 'producer evidence');
  boundedEvidence(value, 'producer evidence');
  if (value.kind !== `${renameMap.kindPrefix}.runtime-artifact-evidence/v1` || value.status !== 'candidate' || value.purpose !== 'candidate') fail('invalid producer evidence');
  validatePackage(value.package, 'producer package');
  same(validateArchive(value.archive, 'producer archive'), archive, 'producer archive');
  const source = allowedObject(value.source, ['repository', 'head', 'tree', 'clean', 'trackedDiffSha256', 'packageJsonSha256', 'inputsSha256', 'packageLockSha256'], 'producer source');
  if (source.repository !== `git+https://github.com/Ship-With-AI/${renameMap.slug}.git` || source.clean !== true || source.trackedDiffSha256 !== hash('sha256', JSON.stringify(['', '']))) fail('invalid producer source');
  for (const field of ['head', 'tree', 'trackedDiffSha256', 'packageJsonSha256', 'inputsSha256', 'packageLockSha256']) requirePattern(source[field], `producer source ${field}`, field === 'head' || field === 'tree' ? gitShaPattern : sha256Pattern);
  const build = allowedObject(value.build, ['configured', 'platform', 'arch', 'node', 'npm', 'git', 'os', 'napi', 'compiler'], 'producer build');
  const compiler = allowedObject(build.compiler, ['command', 'version', 'target'], 'producer compiler');
  if (build.configured !== true || build.platform !== 'darwin' || build.arch !== 'arm64' || !/^v24\.\d+\.\d+$/u.test(build.node) || build.npm !== '11.19.1' || compiler.command !== '/usr/bin/c++' || compiler.target !== 'arm64-darwin') fail('invalid producer build');
  for (const field of ['git', 'os', 'napi']) requireString(build[field], `producer build ${field}`);
  requireString(compiler.version, 'producer compiler version');
  const legal = allowedObject(value.legal, ['LICENSE', 'THIRD_PARTY_NOTICES.md'], 'producer legal');
  if (legal.LICENSE !== 'c947d781600d41cdeac710b2c81f5cd04ed88bad83dcc2277cffb30768490c7d') fail('producer LICENSE mismatch');
  requirePattern(legal['THIRD_PARTY_NOTICES.md'], 'producer notices', sha256Pattern);
  const contents = allowedObject(value.contents, ['dist'], 'producer contents');
  const dist = allowedObject(contents.dist, ['files', 'sha256'], 'producer dist');
  if (!Array.isArray(dist.files) || dist.files.length === 0 || dist.files.length > 4096 || hash('sha256', JSON.stringify(dist.files)) !== dist.sha256) fail('invalid producer dist');
  const outputFiles = new Map();
  for (const entry of dist.files) {
    allowedObject(entry, ['path', 'mode', 'byteLength', 'sha256'], 'producer dist entry');
    if (typeof entry.path !== 'string' || !/^dist\/[A-Za-z0-9_./-]+$/u.test(entry.path) || entry.path.split('/').some((part) => part === '' || part === '.' || part === '..') || outputFiles.has(entry.path) || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) fail('invalid producer dist entry');
    requirePattern(entry.sha256, 'producer dist entry digest', sha256Pattern);
    outputFiles.set(entry.path, entry);
  }
  for (const path of [`dist/bin/${renameMap.binCommand}.mjs`, 'dist/web/index.html', 'dist/native/directory_exchange.node']) if (!outputFiles.has(path)) fail('missing producer runtime output');
  const inventory = value.archive.files;
  if (!Array.isArray(inventory) || inventory.length !== outputFiles.size + 4) fail('invalid producer archive inventory');
  const paths = new Set();
  for (const entry of inventory) {
    allowedObject(entry, ['path', 'size', 'mode'], 'producer archive entry');
    const output = outputFiles.get(entry.path);
    if ((!output && !['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'].includes(entry.path)) || paths.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777 || (output && (entry.size !== output.byteLength || entry.mode !== output.mode))) fail('producer archive inventory mismatch');
    paths.add(entry.path);
  }
  const native = allowedObject(value.native, ['source', 'binary'], 'producer native');
  allowedObject(native.source, ['path', 'sha256'], 'producer native source');
  allowedObject(native.binary, ['path', 'sha256'], 'producer native binary');
  if (native.source.path !== 'src/native/directory-exchange.cc' || native.binary.path !== 'dist/native/directory_exchange.node' || native.binary.sha256 !== outputFiles.get(native.binary.path).sha256) fail('invalid producer native');
  requirePattern(native.source.sha256, 'producer native source', sha256Pattern);
  const support = allowedObject(value.support, ['configured', 'originSha256'], 'producer support');
  if (support.configured !== true || support.originSha256 !== supportFingerprint) fail('invalid producer support');
  return value;
}

function validateScanner(value, producer) {
  allowedObject(value, ['kind', 'status', 'purpose', 'archive', 'inventory', 'legal', 'package', 'web', 'native', 'support', 'checks', 'limitations'], 'scanner report', ['sha256']);
  boundedEvidence(value, 'scanner report');
  if (!isRecord(value) || value.kind !== `${renameMap.kindPrefix}.runtime-artifact-verification/v1` || value.status !== 'passed' || value.purpose !== 'candidate') fail('invalid scanner report');
  const archive = validateArchive(value.archive, 'scanner archive');
  const packageInfo = validatePackage(value.package, 'scanner package');
  same(archive, validateArchive(producer.archive, 'producer archive'), 'scanner archive');
  same(packageInfo, producer.package, 'scanner package');
  const inventory = allowedObject(value.inventory, ['sha256', 'count', 'bytes'], 'scanner inventory');
  if (inventory.sha256 !== producer.contents.dist.sha256 || inventory.count !== producer.archive.files.length || inventory.bytes !== producer.archive.files.reduce((total, entry) => total + entry.size, 0)) fail('scanner inventory mismatch');
  allowedObject(value.legal, ['README', 'LICENSE', 'THIRD_PARTY_NOTICES'], 'scanner legal');
  requirePattern(value.legal.README, 'scanner README digest', sha256Pattern);
  if (value.legal.LICENSE !== producer.legal.LICENSE || value.legal.THIRD_PARTY_NOTICES !== producer.legal['THIRD_PARTY_NOTICES.md']) fail('scanner legal mismatch');
  const web = allowedObject(value.web, ['entry', 'reachableFiles', 'workerRoles', 'codicon'], 'scanner web');
  if (web.entry !== 'dist/web/index.html' || !Number.isSafeInteger(web.reachableFiles) || web.reachableFiles <= 0 || web.codicon !== true || !Array.isArray(web.workerRoles) || JSON.stringify([...web.workerRoles].sort()) !== JSON.stringify(['css', 'editor', 'html', 'json', 'ts'])) fail('scanner web mismatch');
  allowedObject(value.native, ['target', 'binary', 'fallback'], 'scanner native');
  allowedObject(value.support, ['configured', 'originSha256'], 'scanner support');
  if (!isRecord(value.support) || value.support.configured !== true || value.support.originSha256 !== producer.support.originSha256) fail('scanner support mismatch');
  if (!isRecord(value.native) || value.native.target !== 'arm64-darwin' || value.native.binary !== true || value.native.fallback !== 'reExportUnsupported') fail('scanner native mismatch');
  allTrue(value.checks, 'scanner checks', scannerChecks);
  if (!Array.isArray(value.limitations) || value.limitations.some((entry) => typeof entry !== 'string')) fail('invalid scanner limitations');
  return {
    kind: value.kind, status: value.status, purpose: value.purpose, archive, package: packageInfo,
    inventory: value.inventory, legal: value.legal, web: value.web, native: value.native, support: value.support,
    checks: value.checks, limitations: value.limitations,
  };
}

function validateAcceptance(value, producer, scanner) {
  allowedObject(value, ['kind', 'status', 'profile', 'purpose', 'archive', 'package', 'install', 'scanner', 'browser', 'review', 'support', 'exactPatch', 'native', 'cleanup', 'sourceControl', 'checks', 'limitations'], 'acceptance report', ['sha256']);
  boundedEvidence(value, 'acceptance report');
  if (value.kind !== `${renameMap.kindPrefix}.runtime-artifact-acceptance/v1` || value.status !== 'passed' || value.profile !== 'stable' || value.purpose !== 'candidate') fail('invalid acceptance report');
  const archive = validateArchive(value.archive, 'acceptance archive');
  const packageInfo = validatePackage(value.package, 'acceptance package');
  same(archive, validateArchive(producer.archive, 'producer archive'), 'acceptance archive');
  same(packageInfo, producer.package, 'acceptance package');
  const install = allowedObject(value.install, ['packageLabel', 'binLabel', 'manifestSha256', 'dependencyCount', 'dependencyInventorySha256'], 'acceptance install');
  if (install.packageLabel !== packageLabel || install.binLabel !== renameMap.binCommand || install.manifestSha256 !== producer.source.packageJsonSha256 || !Number.isSafeInteger(install.dependencyCount) || install.dependencyCount < Object.keys(producer.package.runtimeDependencies).length || !sha256Pattern.test(install.dependencyInventorySha256)) fail('acceptance install mismatch');
  const browser = allowedObject(value.browser, ['assets', 'workers', 'codicon'], 'acceptance browser');
  const review = allowedObject(value.review, ['relaunch', 'canonicalV2', 'isolatedDrafts', 'reExport'], 'acceptance review');
  const exactPatch = allowedObject(value.exactPatch, ['canonicalV3', 'grounded'], 'acceptance patch');
  if (browser.assets !== true || browser.workers !== true || browser.codicon !== true || review.relaunch !== true || review.canonicalV2 !== true || review.isolatedDrafts !== true || review.reExport !== 'exported' || exactPatch.canonicalV3 !== true || exactPatch.grounded !== true) fail('acceptance observations mismatch');
  same(validateScanner(value.scanner, producer), scanner, 'acceptance scanner');
  allowedObject(value.support, ['unavailable', 'dismissed', 'unrestricted', 'configured', 'originSha256'], 'acceptance support');
  allowedObject(value.native, ['observedReExport', 'fallback', 'target'], 'acceptance native');
  allowedObject(value.native.target, ['platform', 'arch'], 'acceptance target');
  allowedObject(value.cleanup, ['complete'], 'acceptance cleanup');
  allowedObject(value.sourceControl, ['unchanged', 'scenarios'], 'acceptance source control');
  if (!isRecord(value.support) || value.support.configured !== true || value.support.originSha256 !== producer.support.originSha256 || value.support.unavailable !== true || value.support.dismissed !== true || value.support.unrestricted !== true) fail('acceptance support mismatch');
  if (!isRecord(value.native) || value.native.observedReExport !== true || value.native.fallback !== 'reExportUnsupported' || !isRecord(value.native.target) || value.native.target.platform !== 'darwin' || value.native.target.arch !== 'arm64') fail('acceptance native mismatch');
  if (!isRecord(value.cleanup) || value.cleanup.complete !== true || !isRecord(value.sourceControl) || value.sourceControl.unchanged !== true) fail('acceptance cleanup mismatch');
  if (
    !Array.isArray(value.sourceControl.scenarios) || value.sourceControl.scenarios.length === 0
    || value.sourceControl.scenarios.some((scenario) => {
      if (!isRecord(scenario)) return true;
      allowedObject(scenario, ['name', 'unchanged'], 'acceptance source control scenario');
      return typeof scenario.name !== 'string' || scenario.name.length === 0 || scenario.unchanged !== true;
    })
  ) fail('acceptance source control scenario mismatch');
  if (!Array.isArray(value.checks) || JSON.stringify([...value.checks].sort()) !== JSON.stringify([...expectedChecks].sort())) fail('incomplete acceptance checks');
  if (!Array.isArray(value.limitations) || value.limitations.some((entry) => typeof entry !== 'string')) fail('invalid acceptance limitations');
  return {
    kind: value.kind, status: value.status, profile: value.profile, purpose: value.purpose, archive, package: packageInfo,
    install, scanner, browser, review, support: value.support, exactPatch, native: value.native,
    cleanup: value.cleanup, sourceControl: value.sourceControl, checks: value.checks, limitations: value.limitations,
  };
}

function ciIdentity(environment, producer) {
  const sourceSha = requirePattern(environment.GITHUB_SHA, 'GITHUB_SHA', gitShaPattern);
  const runId = requirePattern(environment.GITHUB_RUN_ID, 'GITHUB_RUN_ID', positiveIntegerPattern);
  const runAttempt = requirePattern(environment.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT', positiveIntegerPattern);
  if (
    environment.GITHUB_REPOSITORY !== repository || environment.GITHUB_REPOSITORY_ID !== repositoryId
    || environment.GITHUB_WORKFLOW_REF !== workflowRef || environment.RUNNER_ENVIRONMENT !== 'github-hosted'
    || sourceSha !== producer.source.head
  ) fail('current CI identity mismatch');
  return { sourceSha, runId, runAttempt };
}

function producerCiIdentity(environment, producer) {
  const current = ciIdentity(environment, producer);
  if (environment.RUNNER_OS !== 'macOS' || environment.RUNNER_ARCH !== 'ARM64') fail('candidate producer must be Darwin ARM64');
  return {
    repository, repositoryId, workflowPath, workflowRef, ref: branchRef,
    sourceSha: current.sourceSha, runId: current.runId, runAttempt: current.runAttempt,
    runnerEnvironment: 'github-hosted', producerPlatform: 'darwin', producerArch: 'arm64',
  };
}

async function writeOnce(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(body, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await writeFile(path, await readFile(temporary), { flag: 'wx', mode: 0o600 });
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function sealCiCandidateEvidence({ archivePath, producerEvidencePath, scannerReportPath, acceptanceReportPath, outputPath }) {
  const output = await newAbsoluteOutput(outputPath, 'output');
  const { archive } = await readArchive(archivePath);
  const producer = validateProducer(await readJson(producerEvidencePath, 'producer evidence'), archive);
  const scannerBytes = await stableBytes(scannerReportPath, 'scanner report', maxJsonBytes);
  const acceptanceBytes = await stableBytes(acceptanceReportPath, 'acceptance report', maxJsonBytes);
  let scannerReport;
  let acceptanceReport;
  try {
    scannerReport = JSON.parse(scannerBytes.toString('utf8'));
    acceptanceReport = JSON.parse(acceptanceBytes.toString('utf8'));
  } catch {
    fail('candidate reports must contain JSON');
  }
  const scanner = validateScanner(scannerReport, producer);
  const acceptance = validateAcceptance(acceptanceReport, producer, scanner);
  const ci = producerCiIdentity(process.env, producer);
  const evidence = {
    ...producer,
    status: 'verified',
    scanner: { ...scanner, sha256: hash('sha256', scannerBytes) },
    acceptance: { ...acceptance, sha256: hash('sha256', acceptanceBytes) },
    ci,
  };
  await writeOnce(output, evidence);
  return evidence;
}

function validateSealedEvidence(value) {
  if (!isRecord(value) || value.kind !== `${renameMap.kindPrefix}.runtime-artifact-evidence/v1` || value.status !== 'verified' || value.purpose !== 'candidate') fail('invalid sealed candidate evidence');
  const core = allowedObject(value, producerKeys, 'sealed candidate', ['scanner', 'acceptance', 'ci']);
  const producer = validateProducer({ ...core, status: 'candidate' }, validateArchive(value.archive, 'sealed archive'));
  const scanner = validateScanner(value.scanner, producer);
  const acceptance = validateAcceptance(value.acceptance, producer, scanner);
  requirePattern(value.scanner.sha256, 'sealed scanner digest', sha256Pattern);
  requirePattern(value.acceptance.sha256, 'sealed acceptance digest', sha256Pattern);
  const ci = allowedObject(value.ci, ['repository', 'repositoryId', 'workflowPath', 'workflowRef', 'ref', 'sourceSha', 'runId', 'runAttempt', 'runnerEnvironment', 'producerPlatform', 'producerArch'], 'sealed ci');
  if (
    ci.repository !== repository || ci.repositoryId !== repositoryId || ci.workflowPath !== workflowPath || ci.workflowRef !== workflowRef || ci.ref !== branchRef
    || ci.sourceSha !== producer.source.head || !gitShaPattern.test(ci.sourceSha) || !positiveIntegerPattern.test(ci.runId) || !positiveIntegerPattern.test(ci.runAttempt)
    || ci.runnerEnvironment !== 'github-hosted' || ci.producerPlatform !== 'darwin' || ci.producerArch !== 'arm64'
  ) fail('sealed CI identity mismatch');
  return { ...producer, status: 'verified', scanner: { ...scanner, sha256: value.scanner.sha256 }, acceptance: { ...acceptance, sha256: value.acceptance.sha256 }, ci };
}

function validateArtifactTransport(artifactId, artifactDigest) {
  requirePattern(artifactId, 'artifact ID', positiveIntegerPattern);
  const digest = requireString(artifactDigest, 'artifact digest');
  if (!/^(?:sha256:)?[a-f0-9]{64}$/u.test(digest)) fail('invalid artifact digest');
  return { id: artifactId, digest };
}

export async function verifyCiCandidateForPublish({ archivePath, evidencePath, expectedEvidenceSha256, artifactId, artifactDigest }) {
  requirePattern(expectedEvidenceSha256, 'expected evidence SHA-256', sha256Pattern);
  const evidenceBytes = await stableBytes(evidencePath, 'evidence', maxJsonBytes);
  if (hash('sha256', evidenceBytes) !== expectedEvidenceSha256) fail('sealed evidence digest mismatch');
  let parsed;
  try { parsed = JSON.parse(evidenceBytes.toString('utf8')); } catch { fail('evidence must contain JSON'); }
  const evidence = validateSealedEvidence(parsed);
  const current = ciIdentity(process.env, evidence);
  if (evidence.ci.runId !== current.runId || evidence.ci.runAttempt !== current.runAttempt) fail('same-run CI identity mismatch');
  const { archive } = await readArchive(archivePath);
  same(archive, validateArchive(evidence.archive, 'sealed archive'), 'archive');
  const artifact = validateArtifactTransport(artifactId, artifactDigest);
  return { kind: `${renameMap.kindPrefix}.ci-candidate-prepublish/v1`, status: 'passed', archive, ci: evidence.ci, artifact };
}

function statementFromBundle(bundle) {
  if (!isRecord(bundle) || !isRecord(bundle.dsseEnvelope) || bundle.dsseEnvelope.payloadType !== 'application/vnd.in-toto+json' || typeof bundle.dsseEnvelope.payload !== 'string') fail('invalid npm attestation bundle');
  let decoded;
  try {
    decoded = Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8');
    if (!decoded || Buffer.from(decoded).toString('base64').replace(/=+$/u, '') !== bundle.dsseEnvelope.payload.replace(/=+$/u, '')) fail('invalid npm attestation payload');
    return JSON.parse(decoded);
  } catch {
    fail('invalid npm attestation payload');
  }
}

export function inspectNpmProvenance({ evidence, audit }) {
  const sealed = validateSealedEvidence(evidence);
  if (!isRecord(audit) || !Array.isArray(audit.invalid) || !Array.isArray(audit.missing) || !Array.isArray(audit.verified) || audit.invalid.length !== 0 || audit.missing.length !== 0) fail('npm audit did not verify its dependencies');
  const matches = audit.verified.filter((entry) => isRecord(entry) && entry.name === packageName && entry.version === packageVersion);
  if (matches.length !== 1) fail('npm audit did not verify exactly one package');
  const verified = matches[0];
  if (verified.registry !== registry || !Array.isArray(verified.attestationBundles)) fail('npm audit target mismatch');
  const bundles = verified.attestationBundles.filter((entry) => isRecord(entry) && entry.predicateType === 'https://slsa.dev/provenance/v1');
  if (bundles.length !== 1) fail('npm audit must verify one provenance bundle');
  const bundle = bundles[0];
  const statement = statementFromBundle(bundle.bundle);
  if (!isRecord(statement) || statement._type !== 'https://in-toto.io/Statement/v1' || statement.predicateType !== 'https://slsa.dev/provenance/v1' || !Array.isArray(statement.subject) || statement.subject.length !== 1) fail('invalid provenance statement');
  const subject = statement.subject[0];
  const sha512 = Buffer.from(sealed.archive.npmIntegritySha512.slice('sha512-'.length), 'base64').toString('hex');
  if (!isRecord(subject) || subject.name !== provenanceSubject || !isRecord(subject.digest) || subject.digest.sha512 !== sha512) fail('provenance subject mismatch');
  const predicate = statement.predicate;
  if (!isRecord(predicate) || !isRecord(predicate.buildDefinition) || !isRecord(predicate.runDetails)) fail('invalid provenance predicate');
  const definition = predicate.buildDefinition;
  if (definition.buildType !== 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' || !isRecord(definition.externalParameters) || !isRecord(definition.externalParameters.workflow) || !isRecord(definition.internalParameters) || !isRecord(definition.internalParameters.github)) fail('invalid provenance build definition');
  const workflow = definition.externalParameters.workflow;
  const github = definition.internalParameters.github;
  if (workflow.repository !== `https://github.com/${repository}` || workflow.path !== workflowPath || workflow.ref !== branchRef || github.event_name !== 'workflow_dispatch' || github.repository_id !== repositoryId || github.repository_owner_id !== ownerId) fail('provenance workflow mismatch');
  if (!Array.isArray(definition.resolvedDependencies) || definition.resolvedDependencies.length !== 1 || !isRecord(definition.resolvedDependencies[0]) || definition.resolvedDependencies[0].uri !== `git+https://github.com/${repository}@${branchRef}` || !isRecord(definition.resolvedDependencies[0].digest) || definition.resolvedDependencies[0].digest.gitCommit !== sealed.ci.sourceSha) fail('provenance source mismatch');
  if (!isRecord(predicate.runDetails.builder) || predicate.runDetails.builder.id !== 'https://github.com/actions/runner/github-hosted' || !isRecord(predicate.runDetails.metadata) || predicate.runDetails.metadata.invocationId !== `https://github.com/${repository}/actions/runs/${sealed.ci.runId}/attempts/${sealed.ci.runAttempt}`) fail('provenance runner mismatch');
  return {
    kind: `${renameMap.kindPrefix}.npm-provenance-inspection/v1`, status: 'passed',
    subject: { name: subject.name, sha512 },
    claims: { repository, repositoryId, ownerId, workflowPath, ref: branchRef, sourceSha: sealed.ci.sourceSha, runId: sealed.ci.runId, runAttempt: sealed.ci.runAttempt, event: 'workflow_dispatch', runner: 'github-hosted' },
    checks: [
      ['subject', provenanceSubject, subject.name],
      ['sha512', sha512, subject.digest.sha512],
      ['repository', `https://github.com/${repository}`, workflow.repository],
      ['repositoryId', repositoryId, github.repository_id],
      ['ownerId', ownerId, github.repository_owner_id],
      ['workflow', workflowPath, workflow.path],
      ['ref', branchRef, workflow.ref],
      ['sourceUri', `git+https://github.com/${repository}@${branchRef}`, definition.resolvedDependencies[0].uri],
      ['sourceSha', sealed.ci.sourceSha, definition.resolvedDependencies[0].digest.gitCommit],
      ['event', 'workflow_dispatch', github.event_name],
      ['runner', 'https://github.com/actions/runner/github-hosted', predicate.runDetails.builder.id],
      ['invocation', `https://github.com/${repository}/actions/runs/${sealed.ci.runId}/attempts/${sealed.ci.runAttempt}`, predicate.runDetails.metadata.invocationId],
    ].map(([field, expected, observed]) => ({ field, expected, observed, pass: expected === observed })),
  };
}

function inheritedEnvironment(source) {
  const result = {};
  for (const key of ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ', 'SystemRoot', 'COMSPEC', 'PATHEXT']) if (source[key] !== undefined) result[key] = source[key];
  if (!result.PATH) fail('PATH is required for npm verification');
  return result;
}

async function protectedNpmEnvironment(root) {
  const home = join(root, 'home');
  const cache = join(root, 'cache');
  const prefix = join(root, 'prefix');
  const config = join(root, 'config');
  for (const path of [home, cache, prefix, config]) await mkdir(path, { recursive: true, mode: 0o700 });
  const userconfig = join(config, 'npmrc');
  const globalconfig = join(config, 'npmrc-global');
  await writeFile(userconfig, '', { flag: 'wx', mode: 0o600 });
  await writeFile(globalconfig, '', { flag: 'wx', mode: 0o600 });
  return {
    ...inheritedEnvironment(process.env), HOME: home, USERPROFILE: home,
    npm_config_cache: cache, npm_config_prefix: prefix, npm_config_registry: registry,
    npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig,
  };
}

async function executable(name) {
  for (const part of (process.env.PATH ?? '').split(delimiter)) {
    if (!part) continue;
    const candidate = join(part, name);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch { /* keep searching */ }
  }
  fail(`required ${name} executable is unavailable`);
}

async function run(command, args, options) {
  try {
    return await execFileAsync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true, timeout: 180_000, ...options });
  } catch {
    fail('required npm command failed');
  }
}

async function fetchBytes(url, limit) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (current.protocol !== 'https:' || current.hostname !== 'registry.npmjs.org') fail('unexpected registry URL');
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) fail('registry redirect limit exceeded');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok || !response.body) fail('registry request failed');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > limit) fail('registry response exceeds size limit');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  fail('registry redirect limit exceeded');
}

function exactDist(metadata) {
  if (!isRecord(metadata) || metadata.name !== packageName || metadata.version !== packageVersion || !isRecord(metadata.dist)) fail('registry metadata mismatch');
  const { tarball, shasum, integrity } = metadata.dist;
  if (tarball !== registryTarballUrl || !sha1Pattern.test(shasum) || !sha512IntegrityPattern.test(integrity)) fail('registry distribution metadata mismatch');
  return { tarball, shasum, integrity };
}

async function readInstalledTarget(root, integrity) {
  const target = join(root, 'node_modules', '@shipwithai', renameMap.slug, 'package.json');
  let manifest;
  let lock;
  try {
    manifest = JSON.parse(await readFile(target, 'utf8'));
    lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  } catch {
    fail('npm did not install the audit target');
  }
  if (!isRecord(manifest) || manifest.name !== packageName || manifest.version !== packageVersion || !isRecord(lock) || !isRecord(lock.packages)) fail('npm audit target mismatch');
  const entry = lock.packages[`node_modules/@shipwithai/${renameMap.slug}`];
  if (!isRecord(entry) || (Object.hasOwn(entry, 'name') && entry.name !== packageName) || entry.version !== packageVersion || entry.integrity !== integrity || entry.resolved !== registryTarballUrl) fail('npm lock target mismatch');
}

export async function verifyPublicNpmRelease({ evidencePath, expectedEvidenceSha256, artifactId, artifactDigest, outputPath }) {
  const output = await newAbsoluteOutput(outputPath, 'output');
  const evidenceBytes = await stableBytes(evidencePath, 'evidence', maxJsonBytes);
  requirePattern(expectedEvidenceSha256, 'expected evidence SHA-256', sha256Pattern);
  if (hash('sha256', evidenceBytes) !== expectedEvidenceSha256) fail('sealed evidence digest mismatch');
  let rawEvidence;
  try { rawEvidence = JSON.parse(evidenceBytes.toString('utf8')); } catch { fail('evidence must contain JSON'); }
  const evidence = validateSealedEvidence(rawEvidence);
  const artifact = validateArtifactTransport(artifactId, artifactDigest);
  const npmPath = await executable('npm');
  const npmRoot = dirname(dirname(npmPath));
  const npxPath = join(npmRoot, 'bin', 'npx-cli.js');
  const root = await mkdtemp(join(tmpdir(), `${renameMap.slug}-npm-release-`));
  let result;
  try {
    await chmod(root, 0o700);
    const auditEnv = await protectedNpmEnvironment(join(root, 'audit-npm'));
    const npmVersion = (await run(process.execPath, [npmPath, '--version'], { cwd: root, env: auditEnv })).stdout.trim();
    if (npmVersion !== '11.19.1') fail('unsupported npm version');
    const packumentBytes = await fetchBytes(packumentUrl, maxMetadataBytes);
    let metadata;
    try { metadata = JSON.parse(packumentBytes.toString('utf8')); } catch { fail('registry metadata must contain JSON'); }
    const dist = exactDist(metadata);
    const downloaded = await fetchBytes(dist.tarball, maxArchiveBytes);
    const archive = archiveIdentity(downloaded, evidence.archive.basename);
    same(archive, validateArchive(evidence.archive, 'sealed archive'), 'downloaded registry archive');
    if (dist.shasum !== archive.npmShasumSha1 || dist.integrity !== archive.npmIntegritySha512) fail('registry archive integrity mismatch');

    const auditRoot = join(root, 'audit');
    await mkdir(auditRoot, { mode: 0o700 });
    await writeFile(join(auditRoot, 'package.json'), `${JSON.stringify({ private: true, dependencies: { [packageName]: packageVersion } })}\n`, { flag: 'wx', mode: 0o600 });
    await run(process.execPath, [npmPath, 'install', packageLabel, '--ignore-scripts', '--no-audit', '--save-exact', '--registry', registry], { cwd: auditRoot, env: auditEnv });
    await readInstalledTarget(auditRoot, archive.npmIntegritySha512);
    const auditOutput = await run(process.execPath, [npmPath, 'audit', 'signatures', '--json', '--include-attestations'], { cwd: auditRoot, env: auditEnv, maxBuffer: 16 * 1024 * 1024 });
    let audit;
    try { audit = JSON.parse(auditOutput.stdout); } catch { fail('npm audit did not return JSON'); }
    const provenance = inspectNpmProvenance({ evidence, audit });

    const globalRoot = join(root, 'global');
    await mkdir(globalRoot, { mode: 0o700 });
    const globalEnv = await protectedNpmEnvironment(join(root, 'global-npm'));
    await run(process.execPath, [npmPath, 'install', '--global', '--prefix', globalEnv.npm_config_prefix, packageLabel, '--ignore-scripts', '--no-audit', '--registry', registry], { cwd: globalRoot, env: globalEnv });
    const globalBin = join(globalEnv.npm_config_prefix, 'bin', renameMap.binCommand);
    const globalManifest = JSON.parse(await readFile(join(globalEnv.npm_config_prefix, 'lib', 'node_modules', '@shipwithai', renameMap.slug, 'package.json'), 'utf8'));
    if (!isRecord(globalManifest) || globalManifest.name !== packageName || globalManifest.version !== packageVersion) fail('global install target mismatch');
    if ((await run(globalBin, ['--version'], { cwd: globalRoot, env: globalEnv })).stdout.trim() !== packageVersion) fail('global consumer version mismatch');

    const npxRoot = join(root, 'npx');
    await mkdir(npxRoot, { mode: 0o700 });
    const npxEnv = await protectedNpmEnvironment(join(root, 'npx-npm'));
    if ((await run(process.execPath, [npxPath, '--yes', packageLabel, '--version'], { cwd: npxRoot, env: npxEnv })).stdout.trim() !== packageVersion) fail('npx consumer version mismatch');

    result = { kind: `${renameMap.kindPrefix}.npm-release-verification/v1`, status: 'passed', archive, artifact, provenance, consumers: { global: { package: packageLabel, command: `${renameMap.binCommand} --version`, version: packageVersion }, npx: { command: `npx --yes ${packageLabel} --version`, version: packageVersion } }, cleanup: { complete: true } };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  await writeOnce(output, result);
  return result;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const expected = {
    'seal-candidate': ['--archive', '--producer-evidence', '--scanner-report', '--acceptance-report', '--output'],
    'verify-candidate': ['--archive', '--evidence', '--expected-evidence-sha256', '--artifact-id', '--artifact-digest'],
    'verify-public': ['--evidence', '--expected-evidence-sha256', '--artifact-id', '--artifact-digest', '--output'],
  }[command];
  if (!expected || rest.length !== expected.length * 2) fail('invalid release verifier command');
  const options = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const [name, value] = [rest[index], rest[index + 1]];
    if (!expected.includes(name) || typeof value !== 'string' || value === '' || options.has(name)) fail('invalid release verifier options');
    options.set(name, value);
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const input = Object.fromEntries(options.entries());
  const result = command === 'seal-candidate'
    ? await sealCiCandidateEvidence({ archivePath: input['--archive'], producerEvidencePath: input['--producer-evidence'], scannerReportPath: input['--scanner-report'], acceptanceReportPath: input['--acceptance-report'], outputPath: input['--output'] })
    : command === 'verify-candidate'
      ? await verifyCiCandidateForPublish({ archivePath: input['--archive'], evidencePath: input['--evidence'], expectedEvidenceSha256: input['--expected-evidence-sha256'], artifactId: input['--artifact-id'], artifactDigest: input['--artifact-digest'] })
      : await verifyPublicNpmRelease({ evidencePath: input['--evidence'], expectedEvidenceSha256: input['--expected-evidence-sha256'], artifactId: input['--artifact-id'], artifactDigest: input['--artifact-digest'], outputPath: input['--output'] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) {
  main().catch(() => {
    process.stderr.write('npm release verifier failed\n');
    process.exitCode = 1;
  });
}
