import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { cpus, loadavg, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { StringDecoder } from 'node:string_decoder';

import renameMap from '../../scripts/rename-map.json' with { type: 'json' };

const BRANCH_COUNT = 10_000;
const SAMPLE_COUNT = 5;
const MARKER_TIMEOUT_MS = 10_000;
const CLEANUP_TIMEOUT_MS = 1_000;
const SETUP_TIMEOUT_MS = 10_000;
const OUTPUT_LIMIT = 64 * 1024;
const COMMAND_OUTPUT_LIMIT = 2 * 1024 * 1024;
const READY_BUDGET_MS = 400;
const SEARCH_BUDGET_MS = 500;
const baseEnvironment = { ...process.env };
for (const key of [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  `${renameMap.envPrefix}LAUNCH_OPTIONS`,
  'CMUX_WORKSPACE_ID',
]) {
  delete baseEnvironment[key];
}
const fixtureEnv = {
  ...baseEnvironment,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};
const root = resolve(import.meta.dirname, '../..');
const executablePath = resolve(root, `dist/bin/${renameMap.binCommand}.mjs`);

function appendTail(previous, value, limit = OUTPUT_LIMIT) {
  const combined = previous + value;
  return combined.length > limit ? combined.slice(-limit) : combined;
}

function appendBufferTail(previous, chunk, limit = OUTPUT_LIMIT) {
  const combined = Buffer.concat([previous, chunk]);
  return combined.length > limit ? combined.subarray(-limit) : combined;
}

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
  };
}

function commandError(command, args, result) {
  return new Error(
    `${command} ${args.join(' ')} failed (${result.code ?? 'null'}/${result.signal ?? 'none'}): ${result.stderrTail}`,
  );
}

function runCommand(command, args, { cwd, input, timeout = SETUP_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let overflow = false;
    const child = spawn(command, args, {
      cwd,
      env: fixtureEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (callback, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(watchdog);
        callback(value);
      }
    };
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`${command} ${args.join(' ')} timed out after ${timeout} ms`));
    }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > COMMAND_OUTPUT_LIMIT) overflow = true;
      stdout = appendTail(stdout, chunk, COMMAND_OUTPUT_LIMIT);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendTail(stderr, chunk);
    });
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code, signal) => {
      const result = { code, signal, stdout, stderrTail: stderr };
      if (overflow) {
        finish(reject, new Error(`${command} output exceeded ${COMMAND_OUTPUT_LIMIT} bytes`));
      } else if (code === 0 && signal === null) {
        finish(resolvePromise, result);
      } else {
        finish(reject, commandError(command, args, result));
      }
    });
    child.stdin.end(input);
  });
}

async function git(cwd, args, options = {}) {
  return await runCommand('git', args, { cwd, ...options });
}

function expectedRefs() {
  return new Set(
    Array.from({ length: BRANCH_COUNT }, (_, index) =>
      `refs/heads/${index === 0 ? 'main' : `branch-${String(index).padStart(5, '0')}`}`,
    ),
  );
}

function parseRefLines(output) {
  const values = output.trimEnd().split('\n').filter(Boolean);
  return new Set(values);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

async function countFiles(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const child = join(path, entry.name);
      count += entry.isDirectory() ? await countFiles(child) : 1;
    }
    return count;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return 0;
    throw error;
  }
}

function packedHeadRefs(contents) {
  const refs = new Set();
  for (const line of contents.split('\n')) {
    if (line.length === 0 || line.startsWith('#') || line.startsWith('^')) continue;
    const [, ref] = line.split(' ');
    if (ref?.startsWith('refs/heads/')) refs.add(ref);
  }
  return refs;
}

async function createFixture(tempRoot) {
  const repository = join(tempRoot, 'repository');
  await mkdir(repository);
  await git(repository, ['init', '-q', '-b', 'main']);
  await git(repository, ['config', 'user.name', `${renameMap.displayName} performance fixture`]);
  await git(repository, ['config', 'user.email', 'performance@example.invalid']);
  await git(repository, ['commit', '--allow-empty', '-q', '-m', 'fixture']);
  const commitOid = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim();
  const stream = Array.from({ length: BRANCH_COUNT - 1 }, (_, index) => {
    const name = `branch-${String(index + 1).padStart(5, '0')}`;
    return `reset refs/heads/${name}\nfrom ${commitOid}\n\n`;
  }).join('') + 'done\n';
  await git(repository, ['fast-import', '--quiet', '--done'], { input: stream });
  await git(repository, ['pack-refs', '--all']);
  const expected = expectedRefs();
  const logical = parseRefLines(
    (await git(repository, ['for-each-ref', '--format=%(refname)', 'refs/heads'])).stdout,
  );
  const commonDirectoryResult = await git(repository, ['rev-parse', '--git-common-dir']);
  const commonDirectory = resolve(repository, commonDirectoryResult.stdout.trim());
  const looseCount = await countFiles(join(commonDirectory, 'refs', 'heads'));
  const packed = packedHeadRefs(await readFile(join(commonDirectory, 'packed-refs'), 'utf8'));
  const proof = {
    expectedCount: expected.size,
    logicalCount: logical.size,
    packedCount: packed.size,
    looseHeadFiles: looseCount,
    logicalMatchesExpected: sameSet(logical, expected),
    packedMatchesExpected: sameSet(packed, expected),
    logicalMatchesPacked: sameSet(logical, packed),
  };
  if (
    proof.expectedCount !== BRANCH_COUNT ||
    proof.logicalCount !== BRANCH_COUNT ||
    proof.packedCount !== BRANCH_COUNT ||
    proof.looseHeadFiles !== 0 ||
    !proof.logicalMatchesExpected ||
    !proof.packedMatchesExpected ||
    !proof.logicalMatchesPacked
  ) {
    throw new Error(`fixture proof failed: ${JSON.stringify(proof)}`);
  }
  const mainShortOid = (await git(repository, ['rev-parse', '--short=12', 'main'])).stdout.trim();
  const targetShortOid = (await git(repository, ['rev-parse', '--short=12', 'branch-09999'])).stdout.trim();
  return { repository, proof, mainShortOid, targetShortOid };
}

function sanitizedEnvironment() {
  return {
    ...baseEnvironment,
    COLUMNS: '120',
    LINES: '40',
    NO_COLOR: '1',
    TERM: 'dumb',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function waitForClose(child) {
  return new Promise((resolvePromise) => {
    child.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
}

async function terminate(child, closed) {
  child.kill('SIGTERM');
  const result = await Promise.race([
    closed,
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(undefined), CLEANUP_TIMEOUT_MS)),
  ]);
  if (result !== undefined) return result;
  child.kill('SIGKILL');
  return await closed;
}

function runPickerSample({ repository, mainShortOid, targetShortOid, kind }) {
  return new Promise((resolvePromise, reject) => {
    const readyMarker = `[Branch] main · ${mainShortOid}`;
    const targetMarker = `[Branch] branch-09999 · ${targetShortOid}`;
    const markerLimit = Math.max(readyMarker.length, targetMarker.length);
    const environment = sanitizedEnvironment();
    let stdoutTail = Buffer.alloc(0);
    let stderrTail = Buffer.alloc(0);
    let markerTail = '';
    let readyMs;
    let searchMs;
    let searchStartedAt;
    let markerWatchdog;
    let settled = false;
    let child;
    let closed;
    const stdoutDecoder = new StringDecoder('utf8');
    const fail = async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(markerWatchdog);
      let cleanupError;
      try {
        await terminate(child, closed);
      } catch (terminationError) {
        cleanupError = terminationError instanceof Error ? terminationError.message : String(terminationError);
      }
      reject(Object.assign(error, {
        stdoutTail: stdoutTail.toString('utf8'),
        stderrTail: stderrTail.toString('utf8'),
        cleanupSucceeded: cleanupError === undefined,
        cleanupError,
      }));
    };
    const armWatchdog = (phase) => {
      clearTimeout(markerWatchdog);
      markerWatchdog = setTimeout(() => {
        void fail(new Error(`${phase} marker watchdog expired after ${MARKER_TIMEOUT_MS} ms`));
      }, MARKER_TIMEOUT_MS);
    };
    const readyStartedAt = performance.now();
    child = spawn(process.execPath, [executablePath], {
      cwd: repository,
      env: environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.on('error', (error) => void fail(error));
    closed = waitForClose(child);
    child.stdout.on('data', (chunk) => {
      stdoutTail = appendBufferTail(stdoutTail, chunk);
      const markerOutput = markerTail + stdoutDecoder.write(chunk);
      markerTail = markerOutput.slice(-markerLimit);
      if (readyMs === undefined && markerOutput.includes(readyMarker)) {
        readyMs = performance.now() - readyStartedAt;
        try {
          searchStartedAt = performance.now();
          child.stdin.write('branch-09999');
        } catch (error) {
          void fail(error);
          return;
        }
        armWatchdog('search');
      }
      if (readyMs !== undefined && searchMs === undefined && markerOutput.includes(targetMarker)) {
        searchMs = performance.now() - searchStartedAt;
        if (settled) return;
        settled = true;
        clearTimeout(markerWatchdog);
        void terminate(child, closed).then(
          (close) => resolvePromise({
            kind,
            readinessMs: readyMs,
            searchMs,
            close,
            cleanupSucceeded: true,
          }),
          (error) => reject(Object.assign(error, {
            stdoutTail: stdoutTail.toString('utf8'),
            stderrTail: stderrTail.toString('utf8'),
            cleanupSucceeded: false,
          })),
        );
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrTail = appendBufferTail(stderrTail, chunk);
    });
    child.once('error', (error) => void fail(error));
    child.once('close', (code, signal) => {
      stdoutDecoder.end();
      if (!settled) {
        void fail(new Error(`picker exited before both markers (${code ?? 'null'}/${signal ?? 'none'})`));
      }
    });
    armWatchdog('readiness');
  });
}

async function metadata() {
  let gitVersion = 'unavailable';
  try {
    gitVersion = (await runCommand('git', ['--version'])).stdout.trim();
  } catch {}
  return {
    node: process.versions.node,
    git: gitVersion,
    platform: platform(),
    arch: process.arch,
    cpu: { model: cpus()[0]?.model ?? 'unknown', count: cpus().length },
    load: loadavg(),
    ci: {
      CI: process.env.CI ?? null,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? null,
      GITHUB_RUN_ID: process.env.GITHUB_RUN_ID ?? null,
      GITHUB_JOB: process.env.GITHUB_JOB ?? null,
    },
  };
}

const report = {
  classification: 'HARD_FAILURE',
  executablePath,
  fixture: null,
  warmup: null,
  samples: [],
  completed: { warmups: 0, measured: 0 },
  readiness: null,
  search: null,
  budgets: { readinessMs: READY_BUDGET_MS, searchMs: SEARCH_BUDGET_MS },
  cleanup: { childrenSettled: false, tempRemoved: false },
  environment: {
    [`removed${renameMap.tsIdentifierPrefix}LaunchOptions`]: true,
    removedCmuxWorkspaceId: true,
    shell: false,
    stdinTerm: 'branch-09999',
  },
  metadata: await metadata(),
  diagnostics: null,
};
let tempRoot;
try {
  if (!existsSync(executablePath)) {
    throw new Error(`compiled executable is absent: ${executablePath}`);
  }
  tempRoot = await mkdtemp(join(tmpdir(), `${renameMap.slug}-production-picker-`));
  const fixture = await createFixture(tempRoot);
  report.fixture = fixture.proof;
  const warmup = await runPickerSample({ ...fixture, kind: 'warmup' });
  report.warmup = warmup;
  report.completed.warmups = 1;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const sample = await runPickerSample({ ...fixture, kind: 'measured' });
    report.samples.push(sample);
    report.completed.measured += 1;
    console.log(`${renameMap.envPrefix}PERF_SAMPLE=${JSON.stringify(sample)}`);
  }
  if (report.completed.warmups !== 1 || report.completed.measured !== SAMPLE_COUNT) {
    throw new Error('incomplete warmup or measured invocation set');
  }
  const readinessValues = report.samples.map(({ readinessMs }) => readinessMs);
  const searchValues = report.samples.map(({ searchMs }) => searchMs);
  report.readiness = { values: readinessValues, ...statistics(readinessValues), pass: median(readinessValues) <= READY_BUDGET_MS };
  report.search = { values: searchValues, ...statistics(searchValues), pass: median(searchValues) <= SEARCH_BUDGET_MS };
  report.cleanup.childrenSettled = [report.warmup, ...report.samples].every((sample) => sample.cleanupSucceeded);
  if (!report.cleanup.childrenSettled) throw new Error('a picker child did not settle cleanly');
  report.classification = report.readiness.pass && report.search.pass ? 'PASS' : 'BUDGET_RED';
} catch (error) {
  report.diagnostics = {
    message: error instanceof Error ? error.message : String(error),
    stdoutTail: error?.stdoutTail ?? null,
    stderrTail: error?.stderrTail ?? null,
    cleanupSucceeded: error?.cleanupSucceeded ?? null,
    cleanupError: error?.cleanupError ?? null,
  };
} finally {
  if (tempRoot !== undefined) {
    try {
      await rm(tempRoot, { force: true, recursive: true });
      report.cleanup.tempRemoved = true;
    } catch (error) {
      report.diagnostics = {
        ...(report.diagnostics ?? {}),
        cleanupError: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
if (!report.cleanup.tempRemoved || report.classification === 'HARD_FAILURE') {
  report.classification = 'HARD_FAILURE';
}
console.log(`${renameMap.envPrefix}PERF_RESULT=${JSON.stringify(report)}`);
process.exitCode = report.classification === 'PASS' || (report.classification === 'BUDGET_RED' && process.argv.includes('--accept-budget-red')) ? 0 : report.classification === 'BUDGET_RED' ? 2 : 1;
