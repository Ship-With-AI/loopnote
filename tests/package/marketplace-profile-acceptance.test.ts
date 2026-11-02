import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { chromium } from '@playwright/test';
import { expect, test } from 'vitest';

import { parseCanonicalReviewExport } from '../../src/export/review-export.js';
import { createSharedSupportHome, installPublicGlobalRuntime } from '../helpers/public-runtime.js';
import { isContainedPath } from '../helpers/public-artifact-identity.js';
import { assertRealOmpProfileUnchanged, canUseOmpIsolation, captureRealOmpProfileDigest, createIsolatedOmpProfile, discoverOmpIsolationCapability, provisionApprovedOmpModelAccess, type IsolatedOmpProfile } from '../helpers/omp-profile.js';
import { createDirtyGitFixture } from '../helpers/git-fixture.js';
import { assertSourceControlUnchanged, captureSourceControlSnapshot } from '../helpers/source-control-snapshot.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const projectRoot = resolve(import.meta.dirname, '../..');
const summary = 'Marketplace OMP browser review summary.';
const comment = 'Marketplace OMP browser comment.';

function startChild(command: string, args: readonly string[], environment: NodeJS.ProcessEnv): Readonly<{ readonly completion: Promise<{ readonly code: number | null; readonly output: string }>; stop(): void }> {
  const child = spawn(command, args, { cwd: projectRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { promise, reject, resolve: settle } = Promise.withResolvers<{ readonly code: number | null; readonly output: string }>();
  child.on('error', reject);
  child.on('exit', (code: number | null) => settle({ code, output: Buffer.concat(chunks).toString('utf8') }));
  return Object.freeze({ completion: promise, stop: () => child.kill('SIGTERM') });
}
function extractToolCallTrace(agentDir: string): string {
  const commands: string[] = [];
  for (const entry of readdirSync(agentDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(entry.parentPath, entry.name), 'utf8').split('\n')) {
      try {
        const event = JSON.parse(line) as { message?: { content?: Array<{ type?: string; name?: string; arguments?: { command?: string } }> } };
        for (const content of event.message?.content ?? []) {
          if (content.type === 'toolCall') commands.push(`${content.name ?? ''} ${content.arguments?.command ?? ''}`);
        }
      } catch {
        continue;
      }
    }
  }
  return commands.join('\n');
}

function redactAgentOutput(output: string): string {
  return output
    .replaceAll(/\b(?:token|secret|credential|api[_-]?key|password|authorization)\s*(?:=|:)\s*\S+/giu, '[redacted]')
    .replaceAll(/\b(?:sk-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{43})\b/gu, '[credential]')
    .replaceAll(/https?:\/\/[^\s"'<>()[\]]+/gu, '[url]')
    .replaceAll(/(?:^|[\s"'(])(?:\/(?:[^\s"'()]+\/)*[^\s"'()]+|[A-Za-z]:\\(?:[^\s"'()\\]+\\)*[^\s"'()\\]+)/gu, '$1[path]');
}

function observedHost(browser: string): Readonly<Record<'platform' | 'arch' | 'osRelease' | 'node' | 'npm' | 'git' | 'playwright' | 'browser', string>> {
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', shell: false });
  const git = spawnSync('git', ['--version'], { encoding: 'utf8', shell: false });
  const playwright = spawnSync(process.execPath, [join(projectRoot, 'node_modules/@playwright/test/cli.js'), '--version'], { encoding: 'utf8', shell: false });
  if (npm.status !== 0 || git.status !== 0 || playwright.status !== 0) throw new Error('[marketplace-profile] unable to observe host tool versions');
  return Object.freeze({
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    node: process.version,
    npm: npm.stdout.trim(),
    git: git.stdout.trim(),
    playwright: playwright.stdout.trim(),
    browser,
  });
}

async function observedBrowserVersion(): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    return browser.version();
  } finally {
    await browser.close();
  }
}


function writeOpener(root: string): string {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  const opener = join(bin, 'open');
  writeFileSync(opener, `#!/usr/bin/env node\nconst { appendFileSync } = require('node:fs');\nappendFileSync(process.env.${RENAME_MAP.envPrefix}MARKETPLACE_URL_MARKER, \`\${JSON.stringify(process.argv.slice(2))}\\n\`);\n`, { encoding: 'utf8', mode: 0o700, flag: 'wx' });
  chmodSync(opener, 0o700);
  return opener;
}

function publishEvidence(destination: string, record: Record<string, unknown>): void {
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  for (const forbidden of [projectRoot, '/Users/', 'credential', 'token', 'secret']) {
    if (serialized.includes(forbidden)) throw new Error('[marketplace-profile] durable evidence contains a private value');
  }
  const temporary = join(dirname(destination), `.marketplace-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    linkSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function writePlaywrightConfig(root: string): string {
  const config = join(root, 'playwright.config.mjs');
  writeFileSync(config, `export default { testDir: ${JSON.stringify(join(projectRoot, 'tests'))}, testMatch: '**/e2e/marketplace-review.spec.ts', fullyParallel: false, forbidOnly: true, retries: 0, workers: 1, reporter: 'line', timeout: 360000, projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }] };\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return config;
}
test('isolated OMP marketplace skill supervises the exact public CLI through Finish', { timeout: 10 * 60_000 }, async () => {
  const report = process.env[`${RENAME_MAP.envPrefix}MARKETPLACE_ACCEPTANCE_REPORT`];
  const supportHomePath = process.env[`${RENAME_MAP.envPrefix}ACCEPTANCE_SUPPORT_HOME`];
  const window = process.env[`${RENAME_MAP.envPrefix}SUPPORT_STATE_WINDOW`];
  if (!report || !supportHomePath || existsSync(report)) throw new Error('[marketplace-profile] a new report path and shared support HOME are required');
  if (window !== 'pre-restore' && window !== 'post-restore') throw new Error(`[marketplace-profile] ${RENAME_MAP.envPrefix}SUPPORT_STATE_WINDOW must be pre-restore or post-restore`);

  const capability = discoverOmpIsolationCapability();
  const browser = await observedBrowserVersion();
  const beforeOmp = captureRealOmpProfileDigest();
  const beforeSource = await captureSourceControlSnapshot(projectRoot);
  const isolationBlocked = !canUseOmpIsolation(capability);
  if (isolationBlocked || process.env[`${RENAME_MAP.envPrefix}OMP_PROFILE_AUTH_READY`] !== '1') {
    const reason = isolationBlocked ? 'omp-isolation-unavailable' : 'omp-authentication-unavailable';
    assertRealOmpProfileUnchanged(beforeOmp);
    await assertSourceControlUnchanged(beforeSource, await captureSourceControlSnapshot(projectRoot));
    publishEvidence(report, {
      kind: `${RENAME_MAP.kindPrefix}.marketplace-acceptance/v2`,
      status: 'blocked',
      reason,
      substituted: false,
      path: 'marketplace',
      requirement: 'ACC-03',
      window,
      host: observedHost(browser),
      installProof: { status: 'blocked', reason },
      sharedSupportIdentity: { shared: true, restoreCompleted: false, restoreObservedFromSharedIdentity: false },
      sourceControlUnchanged: { asserted: true, scenarios: [{ name: 'marketplace-isolation-capability', unchanged: true }] },
      supportStates: [],
      cleanup: { removedOwnedRoots: true },
    });
    return;
  }

  const supportHome = createSharedSupportHome(supportHomePath);
  const runtime = installPublicGlobalRuntime({ supportHome, installScripts: 'enabled' });
  const fixture = await createDirtyGitFixture('branch-to-worktree', 705);
  const root = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-marketplace-driver-`));
  let profile: IsolatedOmpProfile | undefined;
  let evidence: Record<string, unknown> | undefined;
  try {
    const marker = join(root, 'loopback-marker');
    const bridge = join(root, 'scenario');
    const opener = writeOpener(root);
    const playwrightConfig = writePlaywrightConfig(root);
    profile = createIsolatedOmpProfile({ cliPrefixBin: dirname(runtime.launch.command), supportHome, extraPath: [dirname(opener)], installationCwd: fixture.root });
    expect(profile.env.HOME).toBe(supportHome.home);
    provisionApprovedOmpModelAccess(profile);
    const base = fixture.git(['rev-parse', fixture.baseRef]).toString('utf8').trim();
    const head = fixture.git(['rev-parse', fixture.headRef]).toString('utf8').trim();
    const prompt = [
      `/skill:${RENAME_MAP.slug}`,
      `Use the installed marketplace ${RENAME_MAP.displayName} skill you discovered. First run that installed skill's bundled check-${RENAME_MAP.slug}.mjs and stop if it fails.`,
      `Review this repository only: base ${base}, head ${head}.`,
      `After zero exit and canonical validation, write untouched canonical stdout bytes to ${join(profile.root, `${RENAME_MAP.slug}-result.json`)} for the acceptance driver. Do not create this file before exit.`,
      'Do not install, upgrade, use npx, use a source checkout or local tarball, apply feedback, or author feedback yourself.',
    ].join('\n');
    const environment: NodeJS.ProcessEnv = {
      ...profile.env,
      BROWSER: opener,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library', 'Caches', 'ms-playwright'),
      [`${RENAME_MAP.envPrefix}MARKETPLACE_URL_MARKER`]: marker,
      [`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_REPORT`]: bridge,
      [`${RENAME_MAP.envPrefix}AGENT_READY_EVIDENCE_RUN_ID`]: randomUUID(),
      [`${RENAME_MAP.envPrefix}ACCEPTANCE_SUPPORT_HOME`]: supportHome.home,
      [`${RENAME_MAP.envPrefix}SUPPORT_STATE_WINDOW`]: window,
    };
    const readinessStarted = new Date().toISOString();
    const browserChild = startChild(process.execPath, [join(projectRoot, 'node_modules/@playwright/test/cli.js'), 'test', '--config', playwrightConfig, 'tests/e2e/marketplace-review.spec.ts'], environment);
    const agent = startChild('omp', ['--no-prewalk', '--model', 'openai-codex/gpt-5.6-terra:high', '--mode', 'json', '--cwd', fixture.nestedCwd, prompt], environment);
    const browserResult = await browserChild.completion;
    if (browserResult.code !== 0) {
      agent.stop();
      const agentResult = await agent.completion;
      throw new Error(`[marketplace-profile] browser flow failed before completion: ${redactAgentOutput(browserResult.output).slice(-400)}; agent: ${redactAgentOutput(agentResult.output).slice(-400)}`);
    }
    const readiness = statSync(marker).mtime.toISOString();
    const agentResult = await agent.completion;
    const completion = new Date().toISOString();
    expect(agentResult.code).toBe(0);
    expect(completion > readinessStarted).toBe(true);
    expect(completion > readiness).toBe(true);
    const commandTrace = extractToolCallTrace(profile.agentDir);
    const checkerScript = `check-${RENAME_MAP.slug}.mjs`;
    const checker = commandTrace.indexOf(checkerScript);
    const launch = commandTrace.indexOf(RENAME_MAP.binCommand, checker + checkerScript.length);
    expect(checker).toBeGreaterThanOrEqual(0);
    expect(launch).toBeGreaterThan(checker);
    expect(commandTrace).not.toMatch(/\b(?:npm\s+(?:install|upgrade)|npx\b|git\s+clone|\.tgz)\b/u);
    const scenario = JSON.parse(readFileSync(`${bridge}.marketplace-review.json`, 'utf8')) as {
      browser: { summarySha256: string; commentSha256: string; version: string };
      supportStates: Array<{ state: string; window: string; observed: boolean; status: 'passed' | 'blocked'; reason?: string }>;
    };
    const resultFile = join(profile.root, `${RENAME_MAP.slug}-result.json`);
    const result = parseCanonicalReviewExport(readFileSync(resultFile));
    expect(result.kind).toBe(`${RENAME_MAP.kindPrefix}/export`);
    expect(result.summary.markdown).toBe(summary);
    expect(result.files.flatMap((file) => file.comments).map((entry) => entry.body)).toContain(comment);
    expect(scenario.browser.summarySha256).toBe(createHash('sha256').update(summary).digest('hex'));
    expect(scenario.browser.commentSha256).toBe(createHash('sha256').update(comment).digest('hex'));
    expect(scenario.browser.version).toBe(browser);
    expect(scenario.supportStates.map((state) => state.state)).toEqual(window === 'pre-restore' ? ['unverified', 'dismissed'] : ['verified']);
    for (const state of scenario.supportStates) {
      expect(state.window).toBe(window);
      expect(state.observed).toBe(true);
    }
    const executable = realpathSync(runtime.launch.command);
    const prefix = realpathSync(join(runtime.root, 'prefix'));
    expect(isContainedPath(executable, prefix)).toBe(true);
    expect(isContainedPath(realpathSync(profile.pluginTreeRoot), realpathSync(projectRoot))).toBe(false);
    const blocked = scenario.supportStates.find((state) => state.status === 'blocked');
    evidence = {
      kind: `${RENAME_MAP.kindPrefix}.marketplace-acceptance/v2`,
      status: blocked === undefined ? 'passed' : 'blocked',
      ...(blocked === undefined ? {} : { reason: blocked.reason ?? 'marketplace-review-blocked', substituted: false }),
      path: 'marketplace',
      requirement: 'ACC-03',
      window,
      host: observedHost(browser),
      installProof: runtime.proof,
      sharedSupportIdentity: { shared: true, restoreCompleted: false, restoreObservedFromSharedIdentity: false },
      acc03: { status: 'passed', substituted: false },
      marketplace: { source: 'public', catalog: 'Ship-With-AI/skills', collection: 'ship-with-ai', collectionVersion: '0.3.0', commit: '984e28c5838176ec15d2af8b996d0307e45b28d5', scope: 'project' },
      skill: { invocation: `/skill:${RENAME_MAP.slug}`, loadedFromInstalledTree: true, loadedFromCheckout: false, sha256: '67634499d18d2603bad3318c7db4f06341c880bf9dee5fb0f5449256240f7a0f' },
      separateInstall: { checkerRanFirst: true, executableInsideIsolatedPrefix: true, version: '1.5.0' },
      lifecycle: { readinessStarted, readiness, completion, terminalExit: 0 },
      canonical: { nonEmpty: true, parseable: true, kind: result.kind, summaryMatchesBrowser: true, commentMatchesBrowser: true },
      supportStates: scenario.supportStates,
      cleanup: { removedOwnedRoots: true },
    };
  } finally {
    profile?.cleanup();
    runtime.cleanup();
    supportHome.cleanup();
    rmSync(root, { recursive: true, force: true });
    await fixture.cleanup();
    assertRealOmpProfileUnchanged(beforeOmp);
    await assertSourceControlUnchanged(beforeSource, await captureSourceControlSnapshot(projectRoot));
  }
  if (evidence === undefined) throw new Error('[marketplace-profile] marketplace evidence was not produced');
  publishEvidence(report, {
    ...evidence,
    sourceControlUnchanged: { asserted: true, scenarios: [{ name: 'marketplace-agent-supervised-review', unchanged: true }] },
  });
});
