import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { babelParse, walk } from 'vue/compiler-sfc';
import { bootstrapVersion, version } from './release-identity.mjs';
import renameMap from './rename-map.json' with { type: 'json' };

const root = resolve(dirname(dirname(fileURLToPath(import.meta.url))));
const purposes = new Set(['bootstrap', 'candidate', 'development-check', 'deployment-check']);
const reusableStatuses = new Set(['candidate', 'verified', 'accepted-local']);
const profiles = {
  stable: { purpose: undefined, version },
  bootstrap: { purpose: 'bootstrap', version: bootstrapVersion },
};
const requiredRoots = ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', `dist/bin/${renameMap.binCommand}.mjs`];
const legalRoots = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const workerRoles = ['editor', 'css', 'html', 'json', 'ts'];
const maxArchiveBytes = 16 * 1024 * 1024; // Measured candidate is 3.52 MB; retain >4x headroom.
const maxFiles = 512; // Measured candidate has 140 dist entries; retain >3x headroom.
const maxFileBytes = 32 * 1024 * 1024;
const maxExtractedBytes = 64 * 1024 * 1024;
const textFile = /\.(?:js|mjs|cjs|json|html|css|svg|txt|md)$/u;
const forbiddenPath = new RegExp(`(?:^|/)(?:\\.agents|\\.claude|\\.cumpa|\\.${renameMap.slug}|\\.github|\\.git|\\.kimi-code|\\.planning|fixtures?|node_modules|src|tests?)(?:/|$)|(?:^|/)\\.env(?:\\.|$)|\\.(?:map|p12|pem|key|tsx?|vue)$`, 'u');
const protectedValue = /(?:\b(?:sk|rk|pk)_[A-Za-z0-9_]+|\bwhsec_[A-Za-z0-9_]+|\bgh[ops]_[A-Za-z0-9_]+|\b(?:STRIPE|SUPABASE|GITHUB)_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|CLIENT_ID|PRICE_ID|WEBHOOK_ENDPOINT_ID)\b|(?:oauth|access_token|id_token|payer_email|profile_email)=)/iu;
const legacyRuntime = /(?:services\/support|render\.ya?ml|RESEND_API_KEY|magic[-_ ]?link|recovery[-_ ]?token|DATABASE_URL|EMAIL_LOOKUP_HMAC_KEY|RECOVERY_TOKEN_HMAC_KEY)/iu;
// Anchored emitted-map signatures deliberately do not classify compiler string literals as maps.
const sourceMapContent = /(?:^[ \t]*\/\/[#@][ \t]*sourceMappingURL=|^[ \t]*\/\*[#@][ \t]*sourceMappingURL=|["']sourcesContent["']\s*:\s*\[)/mu;
const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sha1Pattern = /^[a-f0-9]{40}$/u;
const sha512Pattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


const gitObjectPattern = /^[a-f0-9]{40,64}$/u;
function normalizePath(path) {
  const normalized = path.split(sep).join('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\\')
    || /[\0-\x1f\x7f]/u.test(normalized)
    || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) fail('unsafe package path');
  return normalized;
}

function safeAbsoluteFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be an absolute path`);
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  const parent = lstatSync(dirname(absolute));
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail(`${label} parent must be a directory`);
  return absolute;
}

function parseArguments(argv) {
  if (argv.length !== 6 && argv.length !== 8) fail('expected --archive, --expected-sha256, --evidence, and optional --profile bootstrap');
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--archive', '--expected-sha256', '--evidence', '--profile'].includes(name) || typeof value !== 'string' || value === '' || options.has(name)) {
      fail('invalid runtime artifact verifier options');
    }
    options.set(name, value);
  }
  const profile = options.get('--profile') ?? 'stable';
  if (profile !== 'stable' && profile !== 'bootstrap') fail('invalid runtime artifact verifier profile');
  if (profile === 'stable' && options.has('--profile')) fail('stable verifier profile must be omitted');
  const expectedSha256 = options.get('--expected-sha256');
  if (!sha256Pattern.test(expectedSha256)) fail('expected SHA-256 must be lowercase hexadecimal');
  return {
    archivePath: safeAbsoluteFile(options.get('--archive'), 'archive'),
    expectedSha256,
    evidencePath: safeAbsoluteFile(options.get('--evidence'), 'evidence'),
    profile,
  };
}

function digestArchive(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) fail('archive must be a regular file');
  if (before.size > maxArchiveBytes) fail('archive exceeds compressed size limit');
  const descriptor = openSync(path, 'r');
  const hashes = [createHash('sha256'), createHash('sha1'), createHash('sha512')];
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let offset = 0;
  try {
    while (offset < before.size) {
      const read = readSync(descriptor, chunk, 0, Math.min(chunk.byteLength, before.size - offset), offset);
      if (read === 0) fail('archive changed during hashing');
      for (const hash of hashes) hash.update(chunk.subarray(0, read));
      offset += read;
    }
    const after = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.dev !== pathAfter.dev || before.ino !== pathAfter.ino || before.size !== pathAfter.size
    ) fail('archive changed during hashing');
  } finally {
    closeSync(descriptor);
  }
  return {
    byteLength: before.size,
    sha256: hashes[0].digest('hex'),
    npmShasumSha1: hashes[1].digest('hex'),
    npmIntegritySha512: `sha512-${hashes[2].digest('base64')}`,
  };
}

function exactDependencies(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const entries = Object.entries(value);
  const sorted = [...entries].sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(entries) !== JSON.stringify(sorted)) fail(`${label} must be sorted`);
  for (const [name, version] of entries) {
    if (!name || typeof version !== 'string' || !exactVersion.test(version)) fail(`${label} must contain exact versions`);
  }
  return Object.fromEntries(entries);
}

function requiredHash(value, label, pattern = sha256Pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} must be a valid digest`);
  return value;
}

function exactKeys(value, keys, label) {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`invalid ${label}`);
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

function readEvidence(path, profile) {
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('evidence must be valid JSON');
  }
  if (!isRecord(evidence) || evidence.kind !== `${renameMap.kindPrefix}.runtime-artifact-evidence/v1`) fail('unexpected producer evidence kind');
  if (!purposes.has(evidence.purpose) || typeof evidence.status !== 'string') fail('invalid producer evidence purpose or status');
  if (profile === 'bootstrap') {
    if (evidence.purpose !== profiles.bootstrap.purpose || evidence.status !== 'bootstrap') fail('bootstrap profile requires bootstrap evidence');
  } else if (reusableStatuses.has(evidence.status)) {
    if (evidence.purpose !== 'candidate') fail('candidate status requires candidate purpose');
  } else if (evidence.status !== evidence.purpose || !['development-check', 'deployment-check'].includes(evidence.status)) {
    fail('invalid producer evidence status');
  }
  if (!isRecord(evidence.package) || evidence.package.name !== renameMap.npmPackage || evidence.package.version !== profiles[profile].version) fail('invalid package identity');
  evidence.package.runtimeDependencies = exactDependencies(evidence.package.runtimeDependencies, 'runtime dependencies');
  if (profile === 'bootstrap') {
    exactKeys(evidence.package.manifestProjection, ['field', 'sourceVersion', 'packedVersion', 'sourceSha256', 'projectedInputSha256', 'packedOutputSha256'], 'bootstrap manifest projection');
    const projection = evidence.package.manifestProjection;
    if (
      projection.field !== 'version'
      || projection.sourceVersion !== profiles.stable.version
      || projection.packedVersion !== profiles.bootstrap.version
      || requiredHash(projection.sourceSha256, 'bootstrap source manifest SHA-256') !== evidence.source?.packageJsonSha256
      || requiredHash(projection.projectedInputSha256, 'bootstrap projected manifest SHA-256') !== requiredHash(projection.packedOutputSha256, 'bootstrap packed manifest SHA-256')
    ) fail('invalid bootstrap manifest projection');
  } else if (Object.hasOwn(evidence.package, 'manifestProjection')) fail('stable evidence must not contain a manifest projection');
  if (!isRecord(evidence.archive)) fail('invalid archive evidence');
  if (
    typeof evidence.archive.basename !== 'string'
    || basename(evidence.archive.basename) !== evidence.archive.basename
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u.test(evidence.archive.basename)
    || !Number.isSafeInteger(evidence.archive.byteLength)
    || evidence.archive.byteLength < 0
  ) fail('invalid archive identity');
  requiredHash(evidence.archive.sha256, 'archive SHA-256');
  requiredHash(evidence.archive.npmShasumSha1, 'archive SHA-1', sha1Pattern);
  requiredHash(evidence.archive.npmIntegritySha512, 'archive SHA-512 integrity', sha512Pattern);
  if (!Array.isArray(evidence.archive.files) || evidence.archive.files.length === 0 || evidence.archive.files.length > maxFiles) fail('invalid npm archive inventory');
  const archiveFiles = new Map();
  for (const entry of evidence.archive.files) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !Number.isSafeInteger(entry.size) || entry.size < 0 || !Number.isSafeInteger(entry.mode)) fail('invalid npm archive inventory entry');
    const archivePath = normalizePath(entry.path);
    if (archiveFiles.has(archivePath)) fail('duplicate npm archive inventory entry');
    archiveFiles.set(archivePath, { size: entry.size, mode: entry.mode });
  }
  if (!isRecord(evidence.contents) || !isRecord(evidence.contents.dist) || !Array.isArray(evidence.contents.dist.files)) fail('invalid dist evidence');
  const distFiles = new Map();
  const distEntries = [];
  for (const entry of evidence.contents.dist.files) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || !Number.isSafeInteger(entry.mode)) fail('invalid dist evidence entry');
    const path = normalizePath(entry.path);
    if (!path.startsWith('dist/') || distFiles.has(path)) fail('invalid dist evidence path');
    const sha = requiredHash(entry.sha256, 'dist file SHA-256');
    distFiles.set(path, { byteLength: entry.byteLength, mode: entry.mode, sha256: sha });
    distEntries.push({ path, mode: entry.mode, byteLength: entry.byteLength, sha256: sha });
  }
  requiredHash(evidence.contents.dist.sha256, 'dist inventory SHA-256');
  if (sha256(JSON.stringify(distEntries)) !== evidence.contents.dist.sha256) fail('dist inventory digest mismatch');
  if (!isRecord(evidence.source)) fail('invalid source evidence');
  for (const field of ['head', 'tree']) requiredHash(evidence.source[field], `source ${field}`, gitObjectPattern);
  for (const field of ['trackedDiffSha256', 'packageJsonSha256', 'inputsSha256', 'packageLockSha256']) requiredHash(evidence.source[field], `source ${field}`);
  if (
    !isRecord(evidence.build)
    || typeof evidence.build.configured !== 'boolean'
    || typeof evidence.build.platform !== 'string'
    || typeof evidence.build.arch !== 'string'
    || !isRecord(evidence.build.compiler)
    || evidence.build.compiler.target !== `${evidence.build.arch}-${evidence.build.platform}`
  ) fail('invalid build evidence');
  if (typeof evidence.source.clean !== 'boolean') fail('invalid source clean state');
  if ((evidence.purpose === 'bootstrap' || evidence.purpose === 'candidate' || evidence.purpose === 'deployment-check') && !evidence.source.clean) fail('clean source is required for this purpose');
  if (!isRecord(evidence.legal)) fail('invalid legal evidence');
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) requiredHash(evidence.legal[file], `legal ${file}`);
  if (!isRecord(evidence.native) || !isRecord(evidence.native.source) || evidence.native.source.path !== 'src/native/directory-exchange.cc') fail('invalid native evidence');
  requiredHash(evidence.native.source.sha256, 'native source SHA-256');
  if (evidence.native.binary !== null) {
    if (!isRecord(evidence.native.binary) || evidence.native.binary.path !== 'dist/native/directory_exchange.node') fail('invalid native binary evidence');
    requiredHash(evidence.native.binary.sha256, 'native binary SHA-256');
  }
  if (!isRecord(evidence.support) || typeof evidence.support.configured !== 'boolean') fail('invalid support evidence');
  if (evidence.support.configured) requiredHash(evidence.support.originSha256, 'support origin SHA-256');
  else if (Object.hasOwn(evidence.support, 'originSha256')) fail('unconfigured support must not retain an origin fingerprint');
  if (evidence.build.configured !== evidence.support.configured) fail('build and support configuration disagree');
  if ((evidence.purpose === 'bootstrap' || evidence.purpose === 'candidate' || evidence.purpose === 'deployment-check') && !evidence.support.configured) fail('configured support is required for this purpose');
  return { evidence, archiveFiles, distFiles };
}

function checkArchiveIdentity(archive, evidence) {
  if (archive.sha256 !== evidence.archive.sha256) fail('archive SHA-256 does not match evidence');
  if (archive.sha256 !== options.expectedSha256) fail('archive SHA-256 does not match expected digest');
  if (archive.npmShasumSha1 !== evidence.archive.npmShasumSha1) fail('archive SHA-1 does not match evidence');
  if (archive.npmIntegritySha512 !== evidence.archive.npmIntegritySha512) fail('archive SHA-512 integrity does not match evidence');
  if (archive.byteLength !== evidence.archive.byteLength) fail('archive byte length does not match evidence');
}

function canonicalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL must be canonical`);
  }
  const ref = url.hostname.slice(0, -'.supabase.co'.length);
  if (
    value !== `https://${ref}.supabase.co`
    || url.protocol !== 'https:'
    || !/^[a-z0-9]{20}$/u.test(ref)
  ) fail(`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL must be canonical`);
  return { origin: value, ref };
}

function walkExtracted(path, relativePath = '') {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('extracted archive contains a link or special file');
  if (stat.isFile()) return [{ path: normalizePath(relativePath), stat }];
  const entries = [];
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(path, entry.name);
    const normalized = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const listed = lstatSync(entryPath);
    if (entry.isSymbolicLink() || entry.isBlockDevice() || entry.isCharacterDevice() || entry.isFIFO() || entry.isSocket() || listed.isSymbolicLink()) fail('extracted archive contains an unsafe entry');
    entries.push(...walkExtracted(entryPath, normalized));
  }
  return entries;
}

function scanContent(path, bytes, support) {
  if (forbiddenPath.test(path)) fail(`forbidden package path: ${path}`);
  const content = bytes.toString('utf8');
  if (legacyRuntime.test(path) || legacyRuntime.test(content)) fail(`legacy runtime content: ${path}`);
  if (protectedValue.test(content)) fail(`protected value: ${path}`);
  if (sourceMapContent.test(content)) fail(`forbidden source-map content: ${path}`);
  if (!support) {
    if (/\b[a-z0-9]{20}\.supabase\.co\b/iu.test(content) || /^(?:[a-z0-9]{20})$/imu.test(content)) fail(`unexpected Supabase origin: ${path}`);
    return 0;
  }
  const occurrences = content.split(support.origin).length - 1;
  const remainder = content.replaceAll(support.origin, '');
  if (remainder.includes('.supabase.co') || new RegExp(`(?<![a-z0-9])${support.ref}(?![a-z0-9])`, 'iu').test(remainder)) fail(`unexpected Supabase origin: ${path}`);
  return occurrences;
}

function assertManifest(bytes, evidence, profile) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('packaged manifest must be valid JSON');
  }
  if (
    !isRecord(manifest)
    || manifest.name !== renameMap.npmPackage
    || manifest.version !== profiles[profile].version
    || manifest.engines?.node !== '>=24'
    || manifest.bin?.[renameMap.binCommand] !== `dist/bin/${renameMap.binCommand}.mjs`
    || Object.hasOwn(manifest, 'private')
    || !Array.isArray(manifest.files)
    || JSON.stringify(manifest.files) !== JSON.stringify(['dist/', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
  ) fail('packaged manifest does not satisfy the runtime contract');
  if (profile === 'bootstrap') {
    const sourceBytes = readFileSync(join(root, 'package.json'));
    let sourceManifest;
    try {
      sourceManifest = JSON.parse(sourceBytes);
    } catch {
      fail('reviewed source manifest must be valid JSON');
    }
    if (
      sourceManifest.version !== profiles.stable.version
      || sha256(sourceBytes) !== evidence.package.manifestProjection.sourceSha256
      || sha256(bytes) !== evidence.package.manifestProjection.packedOutputSha256
      || !sameValue(sourceManifest, { ...manifest, version: profiles.stable.version })
    ) fail('bootstrap manifest projection does not preserve source semantics');
  }
  const dependencies = exactDependencies(manifest.dependencies ?? {}, 'packaged runtime dependencies');
  if (JSON.stringify(dependencies) !== JSON.stringify(evidence.package.runtimeDependencies)) fail('packaged runtime dependencies do not match evidence');
  return manifest;
}

function webReferences(path, content) {
  const references = [];
  const add = (value) => {
    if (!value || value.startsWith('#') || value.startsWith('data:') || /^[a-z]+:/iu.test(value)) return;
    if (value.startsWith('/') || value.includes('\\')) fail('non-relative web asset reference');
    const normalized = normalizePath(join(dirname(path), value.split(/[?#]/u, 1)[0]));
    if (!normalized.startsWith('dist/web/')) fail(`web asset escaped web root: ${value}`);
    references.push(normalized);
  };
  if (path.endsWith('.html')) {
    for (const match of content.matchAll(/(?:src|href)=["']([^"']+)["']/giu)) add(match[1]);
  } else if (path.endsWith('.css')) {
    for (const match of content.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/giu)) add(match[1]);
  } else if (/\.[cm]?js$/u.test(path)) {
    // Vue already exposes Babel's parser; parse syntax, never compiler string contents.
    walk(babelParse(content, { sourceType: 'unambiguous', createImportExpressions: true }), {
      enter(node) {
        let source;
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) source = node.source;
        if ((node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL')
          || (node.type === 'CallExpression' && node.callee.type === 'Import')) source = node.arguments[0];
        if (source?.type === 'StringLiteral') add(source.value);
        if (source?.type === 'TemplateLiteral' && source.expressions.length === 0) add(source.quasis[0].value.cooked);
      },
    });
  }
  return references;
}

function assertWebGraph(files) {
  const seen = new Set(['dist/web/index.html']);
  const queue = ['dist/web/index.html'];
  while (queue.length > 0) {
    const path = queue.shift();
    const file = files.get(path);
    if (!file) fail(`missing referenced web asset: ${path}`);
    if (!textFile.test(path)) continue;
    for (const reference of webReferences(path, file.bytes.toString('utf8'))) {
      if (!files.has(reference)) fail(`missing referenced web asset: ${reference}`);
      if (!seen.has(reference)) {
        seen.add(reference);
        queue.push(reference);
      }
    }
  }
  for (const role of workerRoles) {
    if (![...files.keys()].some((path) => new RegExp(`/(${role === 'ts' ? 'ts|typescript' : role})\\.worker(?:[-.][^/]+)?\\.js$`, 'u').test(path))) fail(`missing Monaco ${role} worker`);
  }
  if (![...files.keys()].some((path) => /\/codicon(?:[-.][^/]*)?\.(?:ttf|woff2)$/u.test(path))) fail('missing Monaco codicon font');
  return { entry: 'dist/web/index.html', reachableFiles: seen.size, workerRoles, codicon: true };
}

function verify(options) {
  const { evidence, archiveFiles, distFiles } = readEvidence(options.evidencePath, options.profile);
  if (basename(options.archivePath) !== evidence.archive.basename) fail('archive basename does not match evidence');
  const custodyEntries = readdirSync(dirname(options.archivePath));
  if (custodyEntries.length !== 1 || custodyEntries[0] !== evidence.archive.basename) fail('archive custody directory must contain only the supplied archive');
  const archiveBefore = digestArchive(options.archivePath);
  checkArchiveIdentity(archiveBefore, evidence);

  if (
    sha256(readFileSync(join(root, 'package.json'))) !== evidence.source.packageJsonSha256
    || sha256(readFileSync(join(root, 'package-lock.json'))) !== evidence.source.packageLockSha256
    || sha256(readFileSync(join(root, evidence.native.source.path))) !== evidence.native.source.sha256
  ) fail('reviewed source identity mismatch');

  const originValue = process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  let support;
  if (evidence.support.configured) {
    if (originValue === undefined) fail(`configured evidence requires ${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`);
    support = canonicalOrigin(originValue);
    if (sha256(support.origin) !== evidence.support.originSha256) fail('configured support origin does not match evidence fingerprint');
  } else {
    if (originValue !== undefined) fail(`unconfigured evidence rejects ${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`);
    support = undefined;
  }

  const originalUmask = process.umask(0o077);
  const parent = mkdtempSync(join(os.tmpdir(), `${renameMap.slug}-artifact-`));
  const extractionRoot = join(parent, `extract-${randomBytes(8).toString('hex')}`);
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;
      rmSync(parent, { force: true, recursive: true });
    }
  };
  const onSignal = () => {
    cleanup();
    process.exit(128);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    chmodSync(parent, 0o700);
    mkdirSync(extractionRoot, { mode: 0o700 });
    execFileSync('tar', ['-xzf', options.archivePath, '-C', extractionRoot], { stdio: 'pipe' });
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.mode & 0o777) !== 0o700) fail('extraction parent is not protected');
    if (readdirSync(parent).length !== 1 || readdirSync(parent)[0] !== basename(extractionRoot)) fail('extraction parent contains unexpected siblings');
    const rootEntries = readdirSync(extractionRoot);
    if (rootEntries.length !== 1 || rootEntries[0] !== 'package') fail('archive must contain exactly one package root');
    const packageRoot = join(extractionRoot, 'package');
    const packageStat = lstatSync(packageRoot);
    if (!packageStat.isDirectory() || packageStat.isSymbolicLink()) fail('archive package root is unsafe');
    const extracted = walkExtracted(packageRoot, 'package');
    if (extracted.length > maxFiles) fail('archive exceeds extracted file count limit');
    const files = new Map();
    let totalBytes = 0;
    let originOccurrences = 0;
    for (const entry of extracted) {
      const packagePath = entry.path.slice('package/'.length);
      const inventory = archiveFiles.get(packagePath);
      if (!inventory) fail(`archive file is absent from npm inventory: ${packagePath}`);
      const mode = entry.stat.mode & 0o777;
      // Native tar applies our 077 umask; owner execute remains significant.
      if (mode !== (inventory.mode & ~0o077)) fail(`archive mode mismatch: ${packagePath}`);
      if (entry.stat.size !== inventory.size) fail(`archive size mismatch: ${packagePath}`);
      if (entry.stat.size > maxFileBytes) fail(`archive file exceeds size limit: ${packagePath}`);
      totalBytes += entry.stat.size;
      if (totalBytes > maxExtractedBytes) fail('archive exceeds extracted size limit');
      const bytes = readFileSync(join(packageRoot, packagePath));
      const expectedDist = distFiles.get(packagePath);
      if (expectedDist) {
        if (expectedDist.byteLength !== bytes.byteLength || (expectedDist.mode & ~0o077) !== mode || expectedDist.sha256 !== sha256(bytes)) fail(`dist evidence mismatch: ${packagePath}`);
      }
      originOccurrences += scanContent(packagePath, bytes, support);
      files.set(packagePath, { bytes, mode, sha256: sha256(bytes) });
    }
    if (files.size !== archiveFiles.size) fail('archive inventory parity mismatch');
    for (const path of archiveFiles.keys()) if (!files.has(path)) fail(`archive inventory member is missing: ${path}`);
    if (totalBytes !== [...archiveFiles.values()].reduce((sum, entry) => sum + entry.size, 0)) fail('archive inventory byte parity mismatch');
    for (const path of requiredRoots) if (!files.has(path)) fail(`required package file is missing: ${path}`);
    for (const path of distFiles.keys()) if (!files.has(path)) fail(`dist evidence member is missing: ${path}`);
    if ([...files.keys()].filter((path) => path.startsWith('dist/')).length !== distFiles.size) fail('dist inventory parity mismatch');
    for (const path of legalRoots) {
      const reviewed = readFileSync(join(root, path));
      if (!files.get(path).bytes.equals(reviewed)) fail(`reviewed legal file mismatch: ${path}`);
    }
    if (sha256(files.get('LICENSE').bytes) !== evidence.legal.LICENSE || sha256(files.get('THIRD_PARTY_NOTICES.md').bytes) !== evidence.legal['THIRD_PARTY_NOTICES.md']) fail('legal evidence mismatch');
    assertManifest(files.get('package.json').bytes, evidence, options.profile);
    const web = assertWebGraph(new Map([...files.entries()].filter(([path]) => path.startsWith('dist/'))));
    const nativePath = 'dist/native/directory_exchange.node';
    const nativeRequired = evidence.build.platform === 'darwin' && evidence.build.arch === 'arm64';
    if (nativeRequired) {
      if (!files.has(nativePath) || evidence.native.binary === null || files.get(nativePath).sha256 !== evidence.native.binary.sha256) fail('Darwin ARM64 native binary is missing or mismatched');
    } else if (files.has(nativePath) || evidence.native.binary !== null) fail('unsupported target must omit the native binary');
    if (support) {
      const launcher = files.get(`dist/bin/${renameMap.binCommand}.mjs`).bytes.toString('utf8');
      const assignment = `if (process.env.${renameMap.envPrefix}SUPPORT_SERVICE_URL === undefined) process.env.${renameMap.envPrefix}SUPPORT_SERVICE_URL = '${support.origin}';`;
      const assignments = babelParse(launcher, { sourceType: 'module' }).program.body.filter(
        (node) => node.type === 'IfStatement' && launcher.slice(node.start, node.end) === assignment,
      );
      if (originOccurrences !== 1 || assignments.length !== 1) fail('configured origin requires exactly one launcher assignment');
    }
    if (!support && originOccurrences !== 0) fail('unconfigured archive contains a support origin');
    const archiveAfter = digestArchive(options.archivePath);
    if (JSON.stringify(archiveAfter) !== JSON.stringify(archiveBefore)) fail('archive changed during verification');
    return {
      kind: `${renameMap.kindPrefix}.runtime-artifact-verification/v1`,
      status: 'passed',
      purpose: evidence.purpose,
      ...(options.profile === 'bootstrap' ? { profile: 'bootstrap' } : {}),
      archive: { basename: evidence.archive.basename, ...archiveBefore },
      inventory: { sha256: evidence.contents.dist.sha256, count: files.size, bytes: totalBytes },
      legal: { README: sha256(files.get('README.md').bytes), LICENSE: evidence.legal.LICENSE, THIRD_PARTY_NOTICES: evidence.legal['THIRD_PARTY_NOTICES.md'] },
      package: { name: evidence.package.name, version: evidence.package.version, runtimeDependencies: evidence.package.runtimeDependencies },
      web,
      native: { target: evidence.build.compiler.target, binary: nativeRequired, fallback: 'reExportUnsupported' },
      support: evidence.support.configured ? { configured: true, originSha256: evidence.support.originSha256 } : { configured: false },
      checks: { archiveIdentity: true, protectedExtraction: true, inventoryParity: true, legalParity: true, completeDistParity: true, boundedContentScan: true },
      limitations: ['Eligible only for trusted local producer evidence and source preflight; this is not an arbitrary hostile-tar safety service.', 'Bounded signatures do not prove every possible credential or legal obligation absent.'],
    };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
    process.umask(originalUmask);
  }
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(verify(options))}\n`);
} catch (error) {
  const origin = process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`];
  const detail = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`runtime artifact verifier failed: ${origin ? detail.replaceAll(origin, '[redacted]') : detail}\n`);
  process.exitCode = 1;
}
