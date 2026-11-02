import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

import { buildIsolatedPath, isContainedPath } from './public-artifact-identity.js';
import { inheritedEnvironment, runRuntimeCommand } from './runtime-artifact.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
const projectRoot = resolve(import.meta.dirname, '../..');
const publishedSkillSha256 = '67634499d18d2603bad3318c7db4f06341c880bf9dee5fb0f5449256240f7a0f';

type SharedSupportHome = Readonly<{
  readonly home: string;
  applyTo(env: NodeJS.ProcessEnv): void;
}>;

type ProfilePaths = Readonly<{
  readonly ompRoot: string;
  readonly home: string;
  readonly agentDir: string;
  readonly xdgConfigDir: string;
  readonly xdgDataDir: string;
  readonly xdgStateDir: string;
  readonly xdgCacheDir: string;
}>;

type Digest = Readonly<
  | { readonly present: false }
  | { readonly present: true; readonly sha256: string; readonly entries: Readonly<Record<string, string>> }
>;
const providerAuthenticationVariables = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_CODEX_OAUTH_TOKEN',
] as const;
const requiredIsolationVariables = ['HOME', 'PI_CODING_AGENT_DIR'] as const;

type RealOmpProfileDigest = Readonly<Record<
  | 'agentConfiguration'
  | 'modelConfiguration'
  | 'brokerCredential'
  | 'agents'
  | 'managedSkills'
  | 'marketplaces'
  | 'plugins'
  | 'xdgConfig'
  | 'xdgData'
  | 'xdgState'
  | 'xdgCache',
  Digest
>>;

export interface IsolatedOmpProfile {
  readonly root: string;
  readonly home: string;
  readonly agentDir: string;
  readonly xdgConfigDir: string;
  readonly xdgDataDir: string;
  readonly xdgStateDir: string;
  readonly xdgCacheDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly pluginTreeRoot: string;
  cleanup(): void;
}

type OmpIsolationObservation = Readonly<{
  readonly homeHasOmpTree: boolean;
  readonly agentDatabasePresent: boolean;
  readonly resolvedRealProfilePath: boolean;
  readonly realProfileChanged: boolean;
}>;

export type OmpIsolationCapability = Readonly<{
  readonly ompAvailable: boolean;
  readonly ompVersion?: string;
  readonly honoredVariables: readonly string[];
  readonly unhonoredVariables: readonly string[];
  readonly contaminated: boolean;
}>;

function fail(message: string): never {
  throw new Error(`[omp-profile] ${message}`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function digest(path: string): Digest {
  if (!existsSync(path)) return Object.freeze({ present: false });
  const digest_ = createHash('sha256');
  const entries: Record<string, string> = {};
  const visited = new Set<string>();
  const update = (candidate: string, name: string, relativePath: string): void => {
    const entry = lstatSync(candidate);
    digest_.update(name);
    if (entry.isSymbolicLink()) {
      const link = readlinkSync(candidate);
      if (!existsSync(candidate)) {
        const value = `broken-symlink:${link}`;
        digest_.update(value);
        entries[relativePath] = value;
        return;
      }
      const target = realpathSync(candidate);
      const value = `symlink:${link}:${target}`;
      digest_.update(value);
      entries[relativePath] = value;
      if (visited.has(target)) return;
      visited.add(target);
      update(target, 'target', `${relativePath}->${target}`);
      return;
    }
    if (entry.isFile()) {
      const contents = readFileSync(candidate);
      digest_.update(contents);
      entries[relativePath] = `file:${createHash('sha256').update(contents).digest('hex')}`;
      return;
    }
    if (!entry.isDirectory()) {
      const value = `special:${entry.mode}:${entry.size}:${entry.mtimeMs}`;
      digest_.update(value);
      entries[relativePath] = value;
      return;
    }
    entries[relativePath] = 'directory';
    for (const child of readdirSync(candidate, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      update(join(candidate, child.name), child.name, join(relativePath, child.name));
    }
  };
  update(path, '', '.');
  return Object.freeze({
    present: true,
    sha256: digest_.digest('hex'),
    entries: Object.freeze(entries),
  });
}

export function assessOmpIsolation(
  observation: OmpIsolationObservation,
  ompAvailable = true,
  ompVersion?: string,
): OmpIsolationCapability {
  const observed = {
    HOME: observation.homeHasOmpTree,
    PI_CODING_AGENT_DIR: observation.agentDatabasePresent,
  };
  return Object.freeze({
    ompAvailable,
    ...(ompVersion === undefined ? {} : { ompVersion }),
    honoredVariables: Object.freeze(requiredIsolationVariables.filter((variable) => observed[variable])),
    unhonoredVariables: Object.freeze(requiredIsolationVariables.filter((variable) => !observed[variable])),
    contaminated: observation.resolvedRealProfilePath || observation.realProfileChanged,
  });
}

export function canUseOmpIsolation(capability: OmpIsolationCapability): boolean {
  return capability.ompAvailable && capability.unhonoredVariables.length === 0 && !capability.contaminated;
}

function ompExecutable(): string | undefined {
  const path = inheritedEnvironment(process.env).PATH;
  if (path === undefined) return undefined;
  for (const directory of path.split(delimiter)) {
    const candidate = join(directory, process.platform === 'win32' ? 'omp.cmd' : 'omp');
    if (existsSync(candidate) && lstatSync(candidate).isFile()) return realpathSync(candidate);
  }
  return undefined;
}

function requireOmp(): string {
  return ompExecutable() ?? fail('omp executable is unavailable');
}

function profilePaths(root: string): ProfilePaths {
  const ompRoot = join(root, 'omp');
  return Object.freeze({
    ompRoot,
    home: join(ompRoot, 'home'),
    agentDir: join(ompRoot, 'agent'),
    xdgConfigDir: join(ompRoot, 'xdg-config'),
    xdgDataDir: join(ompRoot, 'xdg-data'),
    xdgStateDir: join(ompRoot, 'xdg-state'),
    xdgCacheDir: join(ompRoot, 'xdg-cache'),
  });
}

function createDirectories(paths: ProfilePaths): void {
  for (const path of [
    paths.ompRoot,
    paths.home,
    paths.agentDir,
    paths.xdgConfigDir,
    paths.xdgDataDir,
    paths.xdgStateDir,
    paths.xdgCacheDir,
  ]) mkdirSync(path, { recursive: true, mode: 0o700 });
}

function isolatedEnvironment(
  paths: ProfilePaths,
  cliPrefixBin?: string,
  extraPath: readonly string[] = [],
): NodeJS.ProcessEnv {
  const omp = requireOmp();
  const env = inheritedEnvironment(process.env);
  for (const variable of providerAuthenticationVariables) {
    if (process.env[variable] !== undefined) env[variable] = process.env[variable];
  }
  delete env.OMP_PROFILE;
  Object.assign(env, {
    HOME: paths.home,
    USERPROFILE: paths.home,
    PI_CODING_AGENT_DIR: paths.agentDir,
    XDG_CONFIG_HOME: paths.xdgConfigDir,
    XDG_DATA_HOME: paths.xdgDataDir,
    XDG_STATE_HOME: paths.xdgStateDir,
    XDG_CACHE_HOME: paths.xdgCacheDir,
  });
  const nodeBin = dirname(realpathSync(process.execPath));
  env.PATH = buildIsolatedPath([
    ...(cliPrefixBin === undefined ? [] : [cliPrefixBin]),
    nodeBin,
    dirname(omp),
    ...extraPath,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]);
  return env;
}

function locateInstalledSkill(profile: ProfilePaths, installationCwd: string): string {
  const candidates = [
    join(profile.xdgDataDir, 'omp', 'plugins', 'cache'),
    join(profile.xdgDataDir, 'omp', 'plugins'),
    join(profile.agentDir, 'plugins'),
    join(installationCwd, '.omp', 'plugins'),
    join(dirname(profile.ompRoot), '.omp', 'plugins'),
    join(profile.ompRoot, '.omp', 'plugins', 'cache'),
  ];
  for (const root of candidates) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name !== RENAME_MAP.slug) continue;
      const candidate = join(entry.parentPath, entry.name);
      if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
    }
  }
  fail(`installed marketplace tree does not contain skills/${RENAME_MAP.slug}/SKILL.md`);
}

function assertInstalledSkill(skillDirectory: string): void {
  const skillRealpath = realpathSync(skillDirectory);
  if (isContainedPath(skillRealpath, realpathSync(projectRoot))) fail(`installed ${RENAME_MAP.displayName} skill resolves inside the ${RENAME_MAP.displayName} checkout`);
  if (sha256(join(skillRealpath, 'SKILL.md')) !== publishedSkillSha256) fail(`installed ${RENAME_MAP.displayName} SKILL.md digest does not match the published marketplace copy`);
}

/** Runs only read-only OMP inspection inside a throwaway profile. */
export function discoverOmpIsolationCapability(): OmpIsolationCapability {
  const unavailable = () => assessOmpIsolation({
    homeHasOmpTree: false,
    agentDatabasePresent: false,
    resolvedRealProfilePath: false,
    realProfileChanged: false,
  }, false);
  const omp = ompExecutable();
  if (omp === undefined) return unavailable();
  const version = spawnSync(omp, ['--version'], { encoding: 'utf8', shell: false });
  if (version.error !== undefined || version.status !== 0) return unavailable();
  const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-omp-probe-`));
  const before = captureRealOmpProfileDigest();
  try {
    const paths = profilePaths(root);
    createDirectories(paths);
    const env = isolatedEnvironment(paths);
    const result = spawnSync(omp, ['config', 'list'], { cwd: root, env, encoding: 'utf8', shell: false });
    if (result.error !== undefined || result.status !== 0) fail(`OMP isolation probe failed: ${result.stderr}`);
    const after = captureRealOmpProfileDigest();
    return assessOmpIsolation({
      homeHasOmpTree: existsSync(join(paths.home, '.omp')),
      agentDatabasePresent: existsSync(join(paths.agentDir, 'agent.db')),
      resolvedRealProfilePath: `${result.stdout}${result.stderr}`.includes(homedir()),
      realProfileChanged: JSON.stringify(before) !== JSON.stringify(after),
    }, true, version.stdout.trim());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function captureOmpProfileDigest(home = homedir()): RealOmpProfileDigest {
  const ompRoot = join(home, '.omp');
  const agentRoot = join(ompRoot, 'agent');
  return Object.freeze({
    agentConfiguration: digest(join(agentRoot, 'config.yml')),
    modelConfiguration: digest(join(agentRoot, 'models.yml')),
    brokerCredential: digest(join(ompRoot, 'auth-broker.token')),
    agents: digest(join(agentRoot, 'agents')),
    managedSkills: digest(join(agentRoot, 'managed-skills')),
    marketplaces: digest(join(agentRoot, 'marketplaces')),
    plugins: digest(join(agentRoot, 'plugins')),
    xdgConfig: digest(join(home, '.config', 'omp')),
    xdgData: digest(join(home, '.local', 'share', 'omp')),
    xdgState: digest(join(home, '.local', 'state', 'omp')),
    xdgCache: digest(join(home, '.cache', 'omp')),
  });
}

export function captureRealOmpProfileDigest(): RealOmpProfileDigest {
  return captureOmpProfileDigest();
}

export function changedOmpProfileEntries(before: RealOmpProfileDigest, after: RealOmpProfileDigest): readonly string[] {
  return Object.entries(after).flatMap(([root, digest_]) => {
    const previous = before[root as keyof RealOmpProfileDigest];
    if (!previous.present || !digest_.present) return JSON.stringify(previous) === JSON.stringify(digest_) ? [] : [root];
    return [...new Set([...Object.keys(previous.entries), ...Object.keys(digest_.entries)])]
      .filter((path) => previous.entries[path] !== digest_.entries[path])
      .map((path) => `${root}:${path}`);
  });
}

export function assertRealOmpProfileUnchanged(before: RealOmpProfileDigest): void {
  const after = captureRealOmpProfileDigest();
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const changed = changedOmpProfileEntries(before, after);
  fail(`operator real OMP or XDG configuration, data, state, or cache changed: ${changed.length === 0 ? 'digest' : changed.join(', ')}`);
}

/**
 * Copies only the operator-authorized local OMP credential store and routing
 * configuration into the owned profile; it never mutates the source profile.
 */
export function provisionApprovedOmpModelAccess(profile: IsolatedOmpProfile): void {
  if (process.env.CUMPA_OMP_PROFILE_AUTH_READY !== '1') fail('operator authorization flag is required before copying provider credentials');
  const source = join(homedir(), '.omp', 'agent');
  const destination = profile.agentDir;
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const name of ['agent.db', 'config.yml', 'models.yml']) {
    const from = join(source, name);
    if (!existsSync(from)) {
      if (name === 'agent.db') fail('operator OMP provider credential store is unavailable');
      continue;
    }
    const to = join(destination, name);
    cpSync(from, to, { force: true, preserveTimestamps: true });
    chmodSync(to, 0o600);
  }
  writeFileSync(join(profile.root, '.approved-provider-credential-copy'), 'read-only source credential copy; profile cleanup removes this temporary state\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

export function createIsolatedOmpProfile(options: Readonly<{
  readonly cliPrefixBin: string;
  readonly supportHome: SharedSupportHome;
  readonly extraPath?: readonly string[];
  readonly installationCwd?: string;
}>): IsolatedOmpProfile {
  const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-omp-profile-`));
  chmodRoot(root);
  const paths = profilePaths(root);
  let cleaned = false;
  try {
    createDirectories(paths);
    const env = isolatedEnvironment(paths, options.cliPrefixBin, options.extraPath);
    const omp = requireOmp();
    options.supportHome.applyTo(env);
    if (env.HOME !== options.supportHome.home) fail('shared support HOME was not applied last');
    try {
      runRuntimeCommand(omp, ['plugin', 'marketplace', 'add', 'Ship-With-AI/skills'], { cwd: root, env });
    } catch (error) {
      if (!String(error).includes('Marketplace "ship-with-ai-skills" already exists')) throw error;
    }
    const installationCwd = options.installationCwd ?? root;
    runRuntimeCommand(omp, ['plugin', 'install', '--scope', 'project', 'ship-with-ai@ship-with-ai-skills'], { cwd: installationCwd, env });
    const home = env.HOME;
    if (home === undefined) fail('OMP profile HOME is missing');
    const skillDirectory = locateInstalledSkill(paths, installationCwd);
    assertInstalledSkill(skillDirectory);
    return Object.freeze({
      root,
      home,
      agentDir: paths.agentDir,
      xdgConfigDir: paths.xdgConfigDir,
      xdgDataDir: paths.xdgDataDir,
      xdgStateDir: paths.xdgStateDir,
      xdgCacheDir: paths.xdgCacheDir,
      env: Object.freeze(env),
      pluginTreeRoot: skillDirectory,
      cleanup() {
        if (cleaned) return;
        rmSync(root, { recursive: true, force: true });
        if (existsSync(root)) fail('isolated OMP profile root was not removed');
        cleaned = true;
      },
    });
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function chmodRoot(path: string): void {
  // mkdtemp honors the process umask; copied credentials remain private and are removed with this profile.
  writeFileSync(join(path, '.profile-isolation'), 'provider credentials are copied only after explicit operator authorization and removed with this profile.\n', { mode: 0o600, flag: 'wx' });
}
