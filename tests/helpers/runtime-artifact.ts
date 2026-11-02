import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { z } from 'zod';
import { bootstrapVersion, version } from '../../scripts/release-identity.mjs';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const packageName = RENAME_MAP.npmPackage;
const runtimeProfiles = {
  stable: { version, purpose: undefined },
  bootstrap: { version: bootstrapVersion, purpose: 'bootstrap' },
} as const;
type RuntimeProfile = keyof typeof runtimeProfiles;
const publicRegistry = 'https://registry.npmjs.org/';
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sha1Pattern = /^[a-f0-9]{40}$/u;
const sha512Pattern = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const archiveBasenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/u;
const exactVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

const RuntimeDependenciesSchema = z.record(z.string(), z.string());
const ManifestProjectionSchema = z.strictObject({
  field: z.literal('version'),
  sourceVersion: z.literal(runtimeProfiles.stable.version),
  packedVersion: z.literal(runtimeProfiles.bootstrap.version),
  sourceSha256: z.string().regex(sha256Pattern),
  projectedInputSha256: z.string().regex(sha256Pattern),
  packedOutputSha256: z.string().regex(sha256Pattern),
});
const ProducerEvidenceSchema = z.object({
  status: z.enum(['bootstrap', 'candidate', 'verified', 'accepted-local', 'development-check', 'deployment-check']),
  purpose: z.enum(['bootstrap', 'candidate', 'development-check', 'deployment-check']),
  kind: z.literal(`${RENAME_MAP.kindPrefix}.runtime-artifact-evidence/v1`),
  archive: z.object({
    basename: z.string(),
    byteLength: z.number().int().nonnegative(),
    sha256: z.string(),
    npmShasumSha1: z.string(),
    npmIntegritySha512: z.string(),
  }).passthrough(),
  package: z.object({
    name: z.literal(packageName),
    version: z.union([z.literal(runtimeProfiles.stable.version), z.literal(runtimeProfiles.bootstrap.version)]),
    runtimeDependencies: RuntimeDependenciesSchema,
    manifestProjection: ManifestProjectionSchema.optional(),
  }).passthrough(),
  source: z.object({ packageJsonSha256: z.string().regex(sha256Pattern) }).passthrough(),
  legal: z.object({ LICENSE: z.string().regex(sha256Pattern), 'THIRD_PARTY_NOTICES.md': z.string().regex(sha256Pattern) }),
}).passthrough();

type ProducerEvidence = z.infer<typeof ProducerEvidenceSchema>;

interface NpmNode {
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, NpmNode>>;
  readonly extraneous?: boolean;
  readonly invalid?: boolean;
  readonly missing?: boolean;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
}

const NpmNodeSchema: z.ZodType<NpmNode> = z.object({
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.lazy(() => NpmNodeSchema)).optional(),
  extraneous: z.boolean().optional(),
  invalid: z.boolean().optional(),
  missing: z.boolean().optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean().optional() }).passthrough()).optional(),
}).passthrough();

const NpmTreeSchema = z.object({
  dependencies: z.record(z.string(), NpmNodeSchema),
  problems: z.array(z.string()).optional(),
}).passthrough();

function installedManifestSchema(version: string) {
  return z.object({
    name: z.literal(packageName),
    version: z.literal(version),
    license: z.literal('MIT'),
    engines: z.object({ node: z.literal('>=24') }),
    bin: z.object({ [RENAME_MAP.binCommand]: z.literal(`dist/bin/${RENAME_MAP.binCommand}.mjs`) }),
  });
}

export interface RuntimeArchiveIdentity {
  readonly basename: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly npmShasumSha1: string;
  readonly npmIntegritySha512: string;
}

export interface RuntimePackageIdentity {
  readonly name: typeof packageName;
  readonly version: (typeof runtimeProfiles)[RuntimeProfile]['version'];
  readonly runtimeDependencies: Readonly<Record<string, string>>;
}

export interface RuntimeArtifact {
  readonly profile: RuntimeProfile;
  readonly archivePath: string;
  readonly evidence: ProducerEvidence;
  readonly archive: RuntimeArchiveIdentity;
  readonly package: RuntimePackageIdentity;
}

export interface RuntimeInstallProof {
  readonly packageLabel: `${typeof packageName}@${RuntimePackageIdentity['version']}`;
  readonly binLabel: 'loopnote';
  readonly manifestSha256: string;
  readonly dependencyCount: number;
  readonly dependencyInventorySha256: string;
}

export interface InstalledRuntimeArtifact {
  readonly root: string;
  readonly packageRoot: string;
  readonly executablePath: string;
  readonly nodeEntrypointPath: string;
  readonly fetchGuardPath: string;
  readonly blockedFetchesPath: string;
  readonly launch: Readonly<{ readonly command: string; readonly args: readonly string[] }>;
  readonly env: NodeJS.ProcessEnv;
  readonly proof: RuntimeInstallProof;
  cleanup(): void;
}

function fail(message: string): never {
  throw new Error(`[runtime-artifact] ${message}`);
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) fail(`${name} is required`);
  return value;
}

function exactDependencies(value: unknown): Readonly<Record<string, string>> {
  const parsed = RuntimeDependenciesSchema.safeParse(value);
  if (!parsed.success) fail('producer evidence runtime dependencies must be an object');
  const entries = Object.entries(parsed.data);
  const sorted = [...entries].sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(entries) !== JSON.stringify(sorted)) fail('producer evidence runtime dependencies must be sorted');
  for (const [name, version] of entries) {
    if (name.length === 0 || !exactVersionPattern.test(version)) fail('producer evidence runtime dependencies must use exact versions');
  }
  return Object.freeze(Object.fromEntries(entries));
}

function requiredDigest(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} is malformed`);
  return value;
}

function runtimeProfile(environment: NodeJS.ProcessEnv): RuntimeProfile {
  const value = environment.CUMPA_RUNTIME_PROFILE;
  if (value === undefined) return 'stable';
  if (value === 'bootstrap') return value;
  fail('CUMPA_RUNTIME_PROFILE must be bootstrap when set');
}

function manifestProjection(evidence: ProducerEvidence): void {
  const projection = evidence.package.manifestProjection;
  if (projection === undefined || projection.sourceSha256 !== evidence.source.packageJsonSha256) fail('bootstrap manifest projection is invalid');
}
function safeArchivePath(custody: string, archiveBasename: string): string {
  if (basename(archiveBasename) !== archiveBasename || !archiveBasenamePattern.test(archiveBasename)) {
    fail(`${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_BASENAME must be a safe .tgz basename`);
  }
  const custodyPath = resolve(custody);
  const custodyStat = lstatSync(custodyPath);
  if (!custodyStat.isDirectory() || custodyStat.isSymbolicLink()) fail(`${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR must be a real directory`);
  const archivePath = resolve(custodyPath, archiveBasename);
  if (relative(custodyPath, archivePath).startsWith('..') || !archivePath.startsWith(`${custodyPath}${sep}`)) fail('archive path escaped custody directory');
  const archiveStat = lstatSync(archivePath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink()) fail('archive must be a regular non-symbolic file');
  const realCustody = realpathSync(custodyPath);
  const realArchive = realpathSync(archivePath);
  if (relative(realCustody, realArchive).startsWith('..') || !realArchive.startsWith(`${realCustody}${sep}`)) fail('archive realpath escaped custody directory');
  return realArchive;
}

function readIdentity(path: string, archiveBasename: string): RuntimeArchiveIdentity {
  const before = statSync(path);
  const descriptor = openSync(path, 'r');
  let bytes: Buffer;
  let during;
  try {
    bytes = readFileSync(descriptor);
    during = fstatSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const after = statSync(path);
  if (
    before.dev !== during.dev || before.ino !== during.ino || before.size !== during.size
    || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
  ) fail('archive changed while its identity was read');
  return Object.freeze({
    basename: archiveBasename,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    npmShasumSha1: createHash('sha1').update(bytes).digest('hex'),
    npmIntegritySha512: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  });
}

function sameIdentity(left: RuntimeArchiveIdentity, right: RuntimeArchiveIdentity, label: string): void {
  if (
    left.basename !== right.basename || left.byteLength !== right.byteLength || left.sha256 !== right.sha256
    || left.npmShasumSha1 !== right.npmShasumSha1 || left.npmIntegritySha512 !== right.npmIntegritySha512
  ) fail(`${label} does not match the supplied archive`);
}

function producerEvidence(path: string, profile: RuntimeProfile): ProducerEvidence {
  const evidencePath = resolve(path);
  const evidenceStat = lstatSync(evidencePath);
  if (!evidenceStat.isFile() || evidenceStat.isSymbolicLink()) fail(`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE must name a regular file`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch {
    fail(`${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE must contain JSON`);
  }
  const parsed = ProducerEvidenceSchema.safeParse(raw);
  if (!parsed.success) fail('unexpected producer evidence shape');
  const evidence = parsed.data;
  if (evidence.package.version !== runtimeProfiles[profile].version) fail('producer evidence package identity does not match runtime profile');
  if (profile === 'bootstrap') {
    if (evidence.purpose !== 'bootstrap' || evidence.status !== 'bootstrap') fail('bootstrap runtime profile requires bootstrap evidence');
    manifestProjection(evidence);
  } else {
    if (evidence.package.manifestProjection !== undefined) fail('stable runtime profile forbids manifest projections');
    if (evidence.purpose === 'candidate'
      ? !['candidate', 'verified', 'accepted-local'].includes(evidence.status)
      : evidence.status !== evidence.purpose) fail('producer purpose and status disagree');
  }
  return evidence;
}
export function readRuntimeArtifact(environment: NodeJS.ProcessEnv = process.env): RuntimeArtifact {
  scenarioBridge(environment);
  const profile = runtimeProfile(environment);
  const custody = requiredEnvironment(environment, `${RENAME_MAP.envPrefix}RUNTIME_CUSTODY_DIR`);
  const archiveBasename = requiredEnvironment(environment, `${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_BASENAME`);
  const expectedSha256 = requiredDigest(requiredEnvironment(environment, `${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`), `${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`, sha256Pattern);
  const evidence = producerEvidence(requiredEnvironment(environment, `${RENAME_MAP.envPrefix}RUNTIME_EVIDENCE`), profile);
  const archivePath = safeArchivePath(custody, archiveBasename);
  const archive = readIdentity(archivePath, archiveBasename);
  if (archive.sha256 !== expectedSha256) fail(`archive SHA-256 does not match ${RENAME_MAP.envPrefix}RUNTIME_ARCHIVE_SHA256`);
  const evidenceArchive: RuntimeArchiveIdentity = {
    basename: evidence.archive.basename,
    byteLength: evidence.archive.byteLength,
    sha256: requiredDigest(evidence.archive.sha256, 'producer evidence archive SHA-256', sha256Pattern),
    npmShasumSha1: requiredDigest(evidence.archive.npmShasumSha1, 'producer evidence archive SHA-1', sha1Pattern),
    npmIntegritySha512: requiredDigest(evidence.archive.npmIntegritySha512, 'producer evidence archive SHA-512 integrity', sha512Pattern),
  };
  sameIdentity(archive, evidenceArchive, 'producer evidence archive identity');
  return Object.freeze({
    profile,
    archivePath,
    evidence,
    archive,
    package: Object.freeze({
      name: packageName,
      version: runtimeProfiles[profile].version,
      runtimeDependencies: exactDependencies(evidence.package.runtimeDependencies),
    }),
  });
}

export function rehashRuntimeArtifact(artifact: RuntimeArtifact): RuntimeArchiveIdentity {
  const identity = readIdentity(artifact.archivePath, artifact.archive.basename);
  sameIdentity(identity, artifact.archive, 'rehash');
  return identity;
}

export function inheritedEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ']) {
    if (environment[name] !== undefined) result[name] = environment[name];
  }
  if (process.platform === 'win32') {
    for (const name of ['SystemRoot', 'COMSPEC', 'PATHEXT']) {
      if (environment[name] !== undefined) result[name] = environment[name];
    }
  }
  if (result.PATH === undefined) fail('PATH is required for isolated npm installation');
  return result;
}

export function protectedEnvironment(root: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = join(root, 'home');
  const cache = join(root, 'cache');
  const prefix = join(root, 'prefix');
  const config = join(root, 'config');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  mkdirSync(prefix, { recursive: true, mode: 0o700 });
  mkdirSync(config, { recursive: true, mode: 0o700 });
  const environment = inheritedEnvironment(source);
  Object.assign(environment, {
    HOME: home,
    USERPROFILE: home,
    npm_config_cache: cache,
    npm_config_userconfig: join(config, 'npmrc'),
    npm_config_globalconfig: join(config, 'npmrc-global'),
    npm_config_prefix: prefix,
    npm_config_registry: publicRegistry,
  });
  writeFileSync(environment.npm_config_userconfig!, '', { mode: 0o600, flag: 'wx' });
  writeFileSync(environment.npm_config_globalconfig!, '', { mode: 0o600, flag: 'wx' });
  return environment;
}

function collectDependencyInventory(tree: z.infer<typeof NpmTreeSchema>): readonly string[] {
  const inventory: string[] = [];
  const visit = (path: string, node: NpmNode): void => {
    if (typeof node.version !== 'string' || !exactVersionPattern.test(node.version)) fail('npm dependency has an invalid version');
    if (node.extraneous === true || node.invalid === true || node.missing === true) fail('npm dependency is invalid');
    inventory.push(`${path}@${node.version}`);
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      // npm represents absent, explicitly optional peers as empty nodes.
      if (Object.keys(child).length === 0 && Object.hasOwn(node.peerDependencies ?? {}, name) && node.peerDependenciesMeta?.[name]?.optional === true) continue;
      visit(`${path}>${name}`, child);
    }
  };
  for (const [name, node] of Object.entries(tree.dependencies)) visit(name, node);
  return Object.freeze(inventory.sort());
}

function assertDirectDependencies(tree: z.infer<typeof NpmTreeSchema>, artifact: RuntimeArtifact): void {
  const installed = tree.dependencies[packageName];
  if (installed === undefined || installed.version !== artifact.package.version) fail('npm ls installed package identity is invalid');
  const actual = Object.entries(installed.dependencies ?? {})
    .map(([name, node]) => [name, node.version] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actual) !== JSON.stringify(Object.entries(artifact.package.runtimeDependencies))) {
    fail('installed direct runtime dependency versions do not match producer evidence');
  }
}

export function runRuntimeCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): string {
  if (process.platform !== 'win32') {
    return execFileSync(command, args, { ...options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const environment = { ...options.env };
  const references = [command, ...args].map((value, index) => {
    if (/["\r\n]/u.test(value)) fail('unsafe Windows command argument');
    const key = `${RENAME_MAP.envPrefix}TEST_COMMAND_ARG_${index}`;
    environment[key] = value;
    return `"%${key}%"`;
  });
  const result = spawnSync(environment.COMSPEC ?? 'cmd.exe', ['/d', '/s', '/c', `"${references.join(' ')}"`], {
    ...options, env: environment, windowsVerbatimArguments: true,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) fail(`command failed with exit ${result.status}: ${result.stderr}`);
  return result.stdout;
}

export function installRuntimeArtifact(artifact: RuntimeArtifact): InstalledRuntimeArtifact {
  rehashRuntimeArtifact(artifact);
  const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-runtime-artifact-`));
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    rmSync(root, { recursive: true, force: true });
    if (existsSync(root)) fail('isolated installation state was not removed');
    cleaned = true;
  };
  try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npmEnv = protectedEnvironment(root, process.env);
    const prefix = npmEnv.npm_config_prefix!;
    runRuntimeCommand(npmCommand, [
      'install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--registry', publicRegistry, artifact.archivePath,
    ], { cwd: root, env: npmEnv });
    let tree: unknown;
    try {
      tree = JSON.parse(runRuntimeCommand(npmCommand, [
        'ls', '--global', '--prefix', prefix, '--omit=dev', '--json', '--all', '--long',
      ], { cwd: root, env: npmEnv }));
    } catch (error) {
      fail(`npm ls rejected the isolated runtime dependency tree: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsedTree = NpmTreeSchema.safeParse(tree);
    if (!parsedTree.success || (parsedTree.data.problems?.length ?? 0) > 0) fail('npm ls reported dependency problems');
    assertDirectDependencies(parsedTree.data, artifact);
    const inventory = collectDependencyInventory(parsedTree.data);
    const packageRoot = process.platform === 'win32'
      ? join(prefix, 'node_modules', '@shipwithai', RENAME_MAP.binCommand)
      : join(prefix, 'lib', 'node_modules', '@shipwithai', RENAME_MAP.binCommand);
    const executablePath = process.platform === 'win32' ? join(prefix, `${RENAME_MAP.binCommand}.cmd`) : join(prefix, 'bin', RENAME_MAP.binCommand);
    if (!existsSync(packageRoot) || !existsSync(executablePath) || lstatSync(packageRoot).isSymbolicLink()) fail('npm did not create the scoped package and generated bin');
    const manifestBytes = readFileSync(join(packageRoot, 'package.json'));
    const manifest = installedManifestSchema(artifact.package.version).safeParse(JSON.parse(manifestBytes.toString('utf8')));
    if (!manifest.success) fail('installed package manifest does not match the runtime contract');
    const env = inheritedEnvironment(process.env);
    env.HOME = npmEnv.HOME;
    env.USERPROFILE = npmEnv.USERPROFILE;
    const fetchGuardPath = join(root, 'deny-hosted-fetch.mjs');
    const blockedFetchesPath = join(root, 'blocked-fetches.log');
    writeFileSync(fetchGuardPath, [
      "import { appendFileSync } from 'node:fs';",
      'const originalFetch = globalThis.fetch.bind(globalThis);',
      'globalThis.fetch = (input, init) => {',
      '  const url = new URL(input instanceof Request ? input.url : input);',
      "  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {",
      `    appendFileSync(${JSON.stringify(blockedFetchesPath)}, 'blocked\\n', { mode: 0o600 });`,
      "    return Promise.reject(new TypeError('Non-loopback fetch denied by runtime acceptance'));",
      '  }',
      '  return originalFetch(input, init);',
      '};',
      '',
    ].join('\n'), { mode: 0o600, flag: 'wx' });
    const nodeEntrypointPath = process.platform === 'win32' ? join(packageRoot, manifest.data.bin[RENAME_MAP.binCommand]) : executablePath;
    return Object.freeze({
      root,
      packageRoot,
      executablePath,
      nodeEntrypointPath,
      fetchGuardPath,
      blockedFetchesPath,
      launch: Object.freeze({
        command: process.execPath,
        args: Object.freeze(['--import', fetchGuardPath, nodeEntrypointPath]),
      }),
      env: Object.freeze(env),
      proof: Object.freeze({
        packageLabel: `${artifact.package.name}@${artifact.package.version}`,
        binLabel: 'loopnote',
        manifestSha256: createHash('sha256').update(new Uint8Array(manifestBytes.buffer, manifestBytes.byteOffset, manifestBytes.byteLength)).digest('hex'),
        dependencyCount: inventory.length,
        dependencyInventorySha256: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
      }),
      cleanup,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}

function scenarioBridge(environment: NodeJS.ProcessEnv): Readonly<{ readonly path: string; readonly runId: string }> | undefined {
  const report = environment.CUMPA_AGENT_READY_EVIDENCE_REPORT;
  const runId = environment.CUMPA_AGENT_READY_EVIDENCE_RUN_ID;
  if (report === undefined && runId === undefined) return undefined;
  if (report === undefined || report.length === 0 || runId === undefined || runId.length === 0) fail('CUMPA_AGENT_READY_EVIDENCE_REPORT and CUMPA_AGENT_READY_EVIDENCE_RUN_ID must be supplied together');
  return Object.freeze({ path: resolve(report), runId });
}

export function publishScenarioRecord(
  scenario: string,
  record: Readonly<Record<string, unknown>>,
  options: {
    readonly status?: 'passed' | 'partially-blocked';
    readonly environment?: NodeJS.ProcessEnv;
  } = {},
): void {
  const environment = options.environment ?? process.env;
  const bridge = scenarioBridge(environment);
  if (bridge === undefined) return;
  const encoded = JSON.stringify(record);
  if (/"[^"]*(?:path|origin|email|credential|token|secret)[^"]*"\s*:|(?:^|[^A-Za-z])(?:\/Users\/|[A-Z]:\\)/iu.test(encoded)) {
    fail('runtime scenario record contains durable private data');
  }
  const destination = `${bridge.path}.${scenario}.json`;
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({
      ...record,
      kind: `${RENAME_MAP.kindPrefix}.runtime-artifact-scenario/v1`,
      status: options.status ?? 'passed',
      runId: bridge.runId,
      scenario,
      profile: runtimeProfile(environment),
    })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    linkSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function writeRuntimeScenario(
  scenario: 'package-assets' | 'review',
  record: Readonly<Record<string, unknown>>,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (scenarioBridge(environment) === undefined) return;
  if (record.archive === undefined || record.package === undefined || record.install === undefined || record.target === undefined || record.cleanup === undefined) {
    fail('runtime scenario record is incomplete');
  }
  if (!z.object({ complete: z.literal(true) }).strict().safeParse(record.cleanup).success) fail('runtime scenario cleanup must be complete');
  publishScenarioRecord(scenario, record, { environment });
}
