import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  PINNED_PUBLIC_ARTIFACT,
  assertPinnedInstalledResolution,
  buildIsolatedPath,
  isContainedPath,
} from './public-artifact-identity.js';
import { protectedEnvironment, runRuntimeCommand } from './runtime-artifact.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

type InstallScripts = 'enabled' | 'disabled';
type Resolution = Readonly<{ version: string; resolved: string; integrity: string }>;
type RecordValue = Record<string, unknown>;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const nodeCommand = process.platform === 'win32' ? 'node.exe' : 'node';
const projectRoot = resolve(import.meta.dirname, '../..');
const defaultSharedSupportHome = join(tmpdir(), `${RENAME_MAP.slug}-phase-07-shared-support-home`);


export interface InstalledPublicRuntime {
  readonly source: 'public-global' | 'public-npx';
  readonly root: string;
  readonly packageRoot?: string;
  readonly launch: Readonly<{ readonly command: string; readonly args: readonly string[] }>;
  readonly env: NodeJS.ProcessEnv;
  readonly proof: Readonly<{
    readonly packageLabel: typeof PINNED_PUBLIC_ARTIFACT.packageLabel;
    readonly resolvedTarball: string;
    readonly resolvedIntegrity: string;
    readonly resolvedVersion: string;
    readonly installScripts: InstallScripts;
    readonly binaryContainedInIsolatedPrefix: true;
    readonly manifestSha256?: string;
    readonly npmCacheEntryCountBefore?: number;
    readonly npmInstallAttempts: number;
  }>;
  cleanup(): void;
}

type SharedSupportHome = Readonly<{
  readonly home: string;
  readonly owned: boolean;
  applyTo(env: NodeJS.ProcessEnv): void;
  cleanup(): void;
}>;

export const D02_SUPPORT_IDENTITY_POLICY = Object.freeze({
  option: 'shared-support-home',
  operatorConfirmed: true,
  restoreSignInCount: 1,
  supportHome: 'shared',
  installationIdentity: 'shared',
  voluntarySupportStatus: 'shared',
  perPathIsolation: Object.freeze({
    npmCache: true,
    npmConfiguration: true,
    installPrefix: true,
    browserProfileState: true,
    checkout: true,
    sanitizedPath: true,
  }),
  sharedIdentityObservation: Object.freeze({
    restoreCompleted: false,
    restoreObservedFromSharedIdentity: true,
  }),
});

function fail(message: string): never {
  throw new Error(`[public-runtime] ${message}`);
}

export function isTransientNpmNetworkFailure(error: unknown): error is Error {
  return error instanceof Error
    && /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network aborted)\b/iu.test(error.message);
}

function runNetworkedNpmCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Readonly<{ readonly output: string; readonly attempts: number }> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return Object.freeze({ output: runRuntimeCommand(command, args, options), attempts: attempt });
    } catch (error) {
      if (!isTransientNpmNetworkFailure(error)) throw error;
      if (attempt === 3) {
        throw new Error(`[public-runtime] npm network command failed after ${attempt} attempts: ${error.message}`, { cause: error });
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 250);
    }
  }
  throw new Error('[public-runtime] npm network command exhausted without an attempt');
}

function asRecord(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;
}

function bundledExecutable(command: string): string {
  const candidate = join(dirname(realpathSync(process.execPath)), command);
  if (!existsSync(candidate)) fail(`${command} executable is not colocated with Node`);
  return realpathSync(candidate);
}

function createToolBin(root: string): string {
  const toolBin = join(root, 'tool-bin');
  mkdirSync(toolBin, { mode: 0o700 });
  for (const [name, target] of [
    [nodeCommand, realpathSync(process.execPath)],
    [npmCommand, bundledExecutable(npmCommand)],
    [npxCommand, bundledExecutable(npxCommand)],
  ] as const) {
    symlinkSync(target, join(toolBin, name));
  }
  return toolBin;
}

function isolatedEnvironment(root: string, supportHome: SharedSupportHome): NodeJS.ProcessEnv {
  const env = protectedEnvironment(root, process.env);
  const prefix = env.npm_config_prefix;
  if (prefix === undefined) fail('isolated npm prefix is missing');
  const systemDirectories = process.platform === 'win32'
    ? (() => {
      const systemRoot = env.SystemRoot;
      if (systemRoot === undefined || !isAbsolute(systemRoot)) fail('SystemRoot must be an absolute directory');
      return [join(systemRoot, 'System32'), systemRoot];
    })()
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  env.PATH = buildIsolatedPath([
    join(prefix, 'bin'),
    createToolBin(root),
    ...systemDirectories,
  ]);
  supportHome.applyTo(env);
  return env;
}

function assertNoResolvableCumpa(root: string, env: NodeJS.ProcessEnv): void {
  const probe = spawnSync('cumpa', ['--version'], { cwd: root, env, shell: false, encoding: 'utf8' });
  const errorCode = probe.error !== undefined && 'code' in probe.error ? probe.error.code : undefined;
  if (errorCode !== 'ENOENT') fail('PATH leakage resolved a pre-existing cumpa executable before install');
}

function resolutionFrom(value: unknown): Resolution | undefined {
  const record = asRecord(value);
  if (
    record === undefined || typeof record.version !== 'string'
    || typeof record.resolved !== 'string' || typeof record.integrity !== 'string'
  ) return undefined;
  return { version: record.version, resolved: record.resolved, integrity: record.integrity };
}

function resolutionFromNpmView(value: unknown): Resolution | undefined {
  const record = asRecord(value);
  if (
    record === undefined || typeof record.version !== 'string'
    || typeof record['dist.tarball'] !== 'string' || typeof record['dist.integrity'] !== 'string'
  ) return undefined;
  return { version: record.version, resolved: record['dist.tarball'], integrity: record['dist.integrity'] };
}

function resolutionFromLock(lockPath: string): Resolution | undefined {
  if (!existsSync(lockPath)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    fail(`npm wrote malformed metadata at ${lockPath}`);
  }
  const packages = asRecord(asRecord(parsed)?.packages);
  return resolutionFrom(packages?.[`node_modules/${PINNED_PUBLIC_ARTIFACT.name}`]);
}

function cachedNpmResolution(root: string, env: NodeJS.ProcessEnv): Resolution {
  let view: unknown;
  try {
    view = JSON.parse(runRuntimeCommand(npmCommand, [
      'view', PINNED_PUBLIC_ARTIFACT.packageLabel, 'version', 'dist.tarball', 'dist.integrity', '--json', '--offline',
    ], { cwd: root, env }));
  } catch {
    fail('npm did not record the installed package resolution');
  }
  const resolution = resolutionFromNpmView(view);
  if (resolution === undefined) fail('npm did not record the installed package resolution');
  return resolution;
}

function assertRecordedResolution(tree: unknown, metadataPaths: readonly string[], fallback?: Resolution): Resolution {
  const dependencies = asRecord(asRecord(tree)?.dependencies);
  const installed = dependencies?.[PINNED_PUBLIC_ARTIFACT.name];
  const resolution = resolutionFrom(installed) ?? metadataPaths
    .map(resolutionFromLock)
    .find((candidate): candidate is Resolution => candidate !== undefined) ?? fallback;
  if (resolution === undefined) fail('npm did not record the installed package resolution');
  assertPinnedInstalledResolution(resolution);
  return resolution;
}

function validateManifest(packageRoot: string): Readonly<{ readonly sha256: string }> {
  const manifestPath = join(packageRoot, 'package.json');
  let parsed: unknown;
  const bytes = readFileSync(manifestPath);
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('installed package manifest is malformed');
  }
  const manifest = asRecord(parsed);
  const bin = asRecord(manifest?.bin);
  const engines = asRecord(manifest?.engines);
  if (
    manifest?.name !== PINNED_PUBLIC_ARTIFACT.name
    || manifest.version !== PINNED_PUBLIC_ARTIFACT.version
    || bin?.cumpa !== 'dist/bin/cumpa.mjs'
    || engines?.node !== '>=24'
  ) fail('installed package manifest does not match the pinned runtime contract');
  return Object.freeze({
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

function assertContainedPackage(packageRoot: string, executablePath: string, isolatedRoot: string): void {
  if (!existsSync(packageRoot) || !existsSync(executablePath)) fail('npm did not create the package and generated executable');
  if (lstatSync(packageRoot).isSymbolicLink()) fail('installed package root is a symbolic link');
  const realRoot = realpathSync(isolatedRoot);
  if (
    !isContainedPath(realpathSync(packageRoot), realRoot)
    || !isContainedPath(realpathSync(executablePath), realRoot)
  ) fail('installed package or executable escaped its isolated prefix');
}

function ownedRoot(prefix: string): Readonly<{ readonly root: string; cleanup(): void }> {
  const root = mkdtempSync(join(tmpdir(), prefix));
  let cleaned = false;
  return Object.freeze({
    root,
    cleanup() {
      if (cleaned) return;
      rmSync(root, { recursive: true, force: true });
      if (existsSync(root)) fail('adapter temporary root was not removed');
      cleaned = true;
    },
  });
}

export function createSharedSupportHome(existingHome?: string): SharedSupportHome {
  const home = resolve(existingHome ?? process.env[`${RENAME_MAP.envPrefix}ACCEPTANCE_SUPPORT_HOME`] ?? defaultSharedSupportHome);
  const existed = existsSync(home);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  if (!existed) chmodSync(home, 0o700);
  const stat = lstatSync(home);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('shared support HOME must be a real directory');
  const realHome = realpathSync(home);
  if (
    isContainedPath(realHome, realpathSync(homedir()))
    || isContainedPath(realHome, realpathSync(projectRoot))
  ) fail('shared support HOME must stay outside the operator HOME and checkout');
  return Object.freeze({
    home: realHome,
    owned: false,
    applyTo(env) {
      env.HOME = realHome;
      env.USERPROFILE = realHome;
      if (process.platform === 'linux') env.XDG_STATE_HOME = join(realHome, 'state');
    },
    cleanup() {},
  });
}

export function installPublicGlobalRuntime(options: Readonly<{
  readonly supportHome: SharedSupportHome;
  readonly installScripts: InstallScripts;
}>): InstalledPublicRuntime {
  const temporary = ownedRoot(`${RENAME_MAP.slug}-public-global-`);
  try {
    const env = isolatedEnvironment(temporary.root, options.supportHome);
    const prefix = env.npm_config_prefix;
    if (prefix === undefined) fail('isolated npm prefix is missing');
    assertNoResolvableCumpa(temporary.root, env);
    const installArgs = [
      'install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org/',
      PINNED_PUBLIC_ARTIFACT.packageLabel,
    ];
    if (options.installScripts === 'disabled') installArgs.splice(4, 0, '--ignore-scripts');
    const install = runNetworkedNpmCommand(npmCommand, installArgs, { cwd: temporary.root, env });
    let tree: unknown;
    try {
      tree = JSON.parse(runRuntimeCommand(npmCommand, [
        'ls', '--global', '--prefix', prefix, '--omit=dev', '--json', '--all', '--long',
      ], { cwd: temporary.root, env }));
    } catch (error) {
      fail(`npm ls rejected the isolated public runtime tree: ${error instanceof Error ? error.message : String(error)}`);
    }
    const problems = asRecord(tree)?.problems;
    if (Array.isArray(problems) && problems.length > 0) fail('npm ls reported dependency problems');
    const packageDirectory = process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules');
    const packageRoot = join(packageDirectory, '@shipwithai', 'cumpa');
    const executablePath = process.platform === 'win32' ? join(prefix, 'cumpa.cmd') : join(prefix, 'bin', 'cumpa');
    const resolution = assertRecordedResolution(
      tree,
      [join(packageDirectory, '.package-lock.json')],
      cachedNpmResolution(temporary.root, env),
    );
    assertContainedPackage(packageRoot, executablePath, prefix);
    const manifest = validateManifest(packageRoot);
    if (runRuntimeCommand(executablePath, ['--version'], { cwd: temporary.root, env }) !== `${PINNED_PUBLIC_ARTIFACT.version}\n`) {
      fail('npm-generated executable does not report the pinned version');
    }
    return Object.freeze({
      source: 'public-global',
      root: temporary.root,
      packageRoot,
      launch: Object.freeze({ command: executablePath, args: Object.freeze([]) }),
      env: Object.freeze(env),
      proof: Object.freeze({
        packageLabel: PINNED_PUBLIC_ARTIFACT.packageLabel,
        resolvedTarball: resolution.resolved,
        resolvedIntegrity: resolution.integrity,
        resolvedVersion: resolution.version,
        installScripts: options.installScripts,
        binaryContainedInIsolatedPrefix: true,
        manifestSha256: manifest.sha256,
        npmInstallAttempts: install.attempts,
      }),
      cleanup: temporary.cleanup,
    });
  } catch (error) {
    temporary.cleanup();
    throw error;
  }
}

function npxEntryPoint(): string {
  const entryPoint = join(dirname(dirname(bundledExecutable(npmCommand))), 'bin', 'npx-cli.js');
  if (!existsSync(entryPoint)) fail('npx-cli.js is not bundled with npm');
  return entryPoint;
}

function npxPackage(cache: string): Readonly<{ readonly packageRoot: string; readonly lockPath: string }> {
  const npxRoot = join(cache, '_npx');
  if (!existsSync(npxRoot) || !lstatSync(npxRoot).isDirectory()) fail('npx did not create an isolated _npx cache');
  const candidates = readdirSync(npxRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => join(npxRoot, entry.name))
    .filter((root) => existsSync(join(root, 'node_modules', '@shipwithai', 'cumpa', 'package.json')));
  if (candidates.length !== 1) fail('npx did not create one isolated package cache entry');
  return Object.freeze({
    packageRoot: join(candidates[0], 'node_modules', '@shipwithai', 'cumpa'),
    lockPath: join(candidates[0], 'node_modules', '.package-lock.json'),
  });
}

export function preparePublicNpxRuntime(options: Readonly<{
  readonly supportHome: SharedSupportHome;
}>): InstalledPublicRuntime {
  const temporary = ownedRoot(`${RENAME_MAP.slug}-public-npx-`);
  try {
    const env = isolatedEnvironment(temporary.root, options.supportHome);
    const cache = env.npm_config_cache;
    if (cache === undefined) fail('isolated npm cache is missing');
    assertNoResolvableCumpa(temporary.root, env);
    if (existsSync(join(temporary.root, 'node_modules', '.bin', 'cumpa'))) {
      fail('npx local-install condition: a local cumpa executable exists');
    }
    const launch = Object.freeze({
      command: process.execPath,
      args: Object.freeze([npxEntryPoint(), '--yes', PINNED_PUBLIC_ARTIFACT.packageLabel]),
    });
    const npmCacheEntryCountBefore = readdirSync(cache).length;
    if (npmCacheEntryCountBefore !== 0) fail('npx cache-reuse condition: isolated npm cache is not empty');
    const launchResult = runNetworkedNpmCommand(launch.command, [...launch.args, '--version'], { cwd: temporary.root, env });
    if (launchResult.output.trim() !== PINNED_PUBLIC_ARTIFACT.version) fail('npx did not run the pinned public package version');
    const installed = npxPackage(cache);
    const cacache = join(cache, '_cacache');
    if (!existsSync(cacache) || !lstatSync(cacache).isDirectory() || readdirSync(cacache).length === 0) {
      fail('npx did not populate the isolated _cacache');
    }
    assertContainedPackage(installed.packageRoot, join(installed.packageRoot, 'dist', 'bin', 'cumpa.mjs'), cache);
    const resolution = assertRecordedResolution(
      undefined,
      [installed.lockPath],
      cachedNpmResolution(temporary.root, env),
    );
    const manifest = validateManifest(installed.packageRoot);
    return Object.freeze({
      source: 'public-npx',
      root: temporary.root,
      packageRoot: installed.packageRoot,
      launch,
      env: Object.freeze(env),
      proof: Object.freeze({
        packageLabel: PINNED_PUBLIC_ARTIFACT.packageLabel,
        resolvedTarball: resolution.resolved,
        resolvedIntegrity: resolution.integrity,
        resolvedVersion: resolution.version,
        installScripts: 'enabled',
        binaryContainedInIsolatedPrefix: true,
        manifestSha256: manifest.sha256,
        npmCacheEntryCountBefore,
        npmInstallAttempts: launchResult.attempts,
      }),
      cleanup: temporary.cleanup,
    });
  } catch (error) {
    temporary.cleanup();
    throw error;
  }
}
