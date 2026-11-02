import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  createLargeRepository,
  positiveIntegerArgument,
  removeLargeRepository,
} from './support.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '../../..');

async function probe(repository) {
  const [{ runCli }, { discoverSourceCandidates }, { createGitRunner }] =
    await Promise.all([
      import(pathToFileURL(resolve(projectRoot, 'dist/cli/run.js')).href),
      import(pathToFileURL(resolve(projectRoot, 'dist/git/candidates.js')).href),
      import(pathToFileURL(resolve(projectRoot, 'dist/git/runner.js')).href),
    ]);
  const underlyingRunner = createGitRunner({
    maxStdoutBytes: 64 * 1024 * 1024,
    timeoutMs: 120_000,
  });
  let gitProcesses = 0;
  const runner = {
    run(arguments_, options) {
      gitProcesses += 1;
      return underlyingRunner.run(arguments_, options);
    },
  };
  const ready = Symbol('picker-ready');
  try {
    await runCli(
      { cwd: repository },
      {
        discoverCandidates: (options) =>
          discoverSourceCandidates(options, { runner }),
        pickSources: async ({ candidates }) => {
          process.stdout.write(
            `${JSON.stringify({ candidates: candidates.length, gitProcesses })}\n`,
          );
          throw ready;
        },
      },
    );
  } catch (error) {
    if (error !== ready) throw error;
  }
}

function runProbe(repository) {
  return new Promise((resolvePromise, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [scriptPath, '--probe', repository], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8')));
        return;
      }
      const result = JSON.parse(Buffer.concat(stdout).toString('utf8').trim());
      resolvePromise({
        ...result,
        promptReadyMs: Number((performance.now() - startedAt).toFixed(1)),
      });
    });
  });
}

async function main() {
  if (process.argv[2] === '--probe') {
    await probe(process.argv[3]);
    return;
  }

  const branchCount = positiveIntegerArgument('branches', 10_000);
  const worktreeCount = positiveIntegerArgument('worktrees', 4);
  const runCount = positiveIntegerArgument('runs', 3);
  const fixture = await createLargeRepository({ branchCount, worktreeCount });
  try {
    const runs = [];
    for (let index = 0; index < runCount; index += 1) {
      runs.push(await runProbe(fixture.repository));
    }
    const durations = runs.map(({ promptReadyMs }) => promptReadyMs).sort((a, b) => a - b);
    const medianPromptReadyMs = durations[Math.floor(durations.length / 2)];
    process.stdout.write(
      `${JSON.stringify(
        {
          spike: '001-large-repo-startup-baseline',
          fixture: { branchCount, worktreeCount },
          runs,
          medianPromptReadyMs,
          budgetMs: 400,
          passesBudget: medianPromptReadyMs <= 400,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await removeLargeRepository(fixture.tempRoot);
  }
}

await main();
