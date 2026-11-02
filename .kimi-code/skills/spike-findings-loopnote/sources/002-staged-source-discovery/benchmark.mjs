import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  createLargeRepository,
  positiveIntegerArgument,
  removeLargeRepository,
  run,
} from '../001-large-repo-startup-baseline/support.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '../../..');

function parseWorktrees(buffer) {
  const records = [];
  let current = {};
  for (const field of buffer.toString('utf8').split('\0')) {
    if (field === '') {
      if (current.path !== undefined) records.push(current);
      current = {};
      continue;
    }
    const separator = field.indexOf(' ');
    const key = separator === -1 ? field : field.slice(0, separator);
    const value = separator === -1 ? undefined : field.slice(separator + 1);
    if (key === 'worktree') current.path = value;
    else if (key === 'HEAD') current.headOid = value;
    else if (key === 'branch') current.branchRef = value;
    else if (key === 'detached') current.detached = true;
    else if (key === 'prunable') current.prunable = true;
    else if (key === 'bare') current.bare = true;
  }
  if (current.path !== undefined) records.push(current);
  return records;
}

function parseBranches(buffer, query) {
  const lines = buffer.toString('utf8').trimEnd().split('\n');
  const matches = [];
  for (const line of lines) {
    const separator = line.indexOf(' ');
    if (separator === -1) continue;
    const commitOid = line.slice(0, separator);
    const refName = line.slice(separator + 1);
    const label = refName.replace(/^refs\/heads\//, '');
    const searchable = `${label} ${refName} ${commitOid}`.toLowerCase();
    if (searchable.includes(query)) {
      matches.push({ refName, label, commitOid });
    }
  }
  return matches;
}

function parseAbbreviations(buffer) {
  const fields = buffer.toString('ascii').split('\0');
  const abbreviations = new Map();
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const oid = fields[index].replace(/^\n/, '');
    if (oid !== '') abbreviations.set(oid, fields[index + 1]);
  }
  return abbreviations;
}
function escapeBranchPattern(value) {
  return value.replace(/[\\*?\[\]]/g, '\\$&');
}


async function probe(repository) {
  await import(pathToFileURL(resolve(projectRoot, 'dist/cli/run.js')).href);
  let gitProcesses = 0;
  const git = (arguments_, cwd, input) => {
    gitProcesses += 1;
    return run('git', arguments_, { cwd, input });
  };

  const root = (await git(['rev-parse', '--show-toplevel'], repository))
    .toString('utf8')
    .trim();
  const worktrees = parseWorktrees(
    await git(['worktree', 'list', '--porcelain', '-z'], root),
  );
  const resolvedWorktrees = await Promise.all(
    worktrees.map(async (worktree) => {
      if (worktree.bare || worktree.prunable || worktree.headOid === undefined) {
        return { ...worktree, availability: 'unavailable' };
      }
      const [status, shortOid] = await Promise.all([
        git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], worktree.path),
        git(['rev-parse', '--short=12', worktree.headOid], root),
      ]);
      return {
        ...worktree,
        availability: status.length === 0 ? 'clean' : 'dirty',
        shortOid: shortOid.toString('ascii').trim(),
      };
    }),
  );
  const current = resolvedWorktrees.find((worktree) => worktree.path === root);
  const initialCandidateCount =
    resolvedWorktrees.length + (current?.branchRef === undefined ? 0 : 1);
  process.stdout.write(
    `${JSON.stringify({ event: 'ready', initialCandidateCount, gitProcesses })}\n`,
  );

  const input = createInterface({ input: process.stdin, terminal: false });
  const [term] = await new Promise((resolvePromise) => {
    input.once('line', (line) => resolvePromise([line.toLowerCase()]));
  });
  input.close();
  const initialGitProcesses = gitProcesses;
  const searchStartedAt = performance.now();
  const listStartedAt = performance.now();
  const branchOutput = await git(
    [
      'branch',
      '--list',
      '--ignore-case',
      `*${escapeBranchPattern(term)}*`,
      '--format=%(objectname) %(refname)',
    ],
    root,
  );
  const listMs = Number((performance.now() - listStartedAt).toFixed(1));
  const branches = parseBranches(branchOutput, term);
  const uniqueOids = [...new Set(branches.map(({ commitOid }) => commitOid))];
  const abbreviateStartedAt = performance.now();
  const abbreviations = parseAbbreviations(
    await git(
      [
        'log',
        '--no-walk=unsorted',
        '--abbrev=12',
        '--format=%H%x00%h%x00',
        '--stdin',
      ],
      root,
      `${uniqueOids.join('\n')}\n`,
    ),
  );
  const abbreviateMs = Number(
    (performance.now() - abbreviateStartedAt).toFixed(1),
  );
  if (uniqueOids.some((oid) => !abbreviations.has(oid))) {
    throw new Error('Git did not abbreviate every matching branch head');
  }
  process.stdout.write(
    `${JSON.stringify({
      event: 'search',
      matches: branches.length,
      searchGitProcesses: gitProcesses - initialGitProcesses,
      listMs,
      abbreviateMs,
      searchInternalMs: Number((performance.now() - searchStartedAt).toFixed(1)),
    })}\n`,
  );
}

function runProbe(repository, searchTerm) {
  return new Promise((resolvePromise, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [scriptPath, '--probe', repository], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stderr = [];
    let buffer = '';
    let ready;
    let searchStartedAt;
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\n')) {
        const newline = buffer.indexOf('\n');
        const event = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (event.event === 'ready') {
          ready = {
            ...event,
            promptReadyMs: Number((performance.now() - startedAt).toFixed(1)),
          };
          searchStartedAt = performance.now();
          child.stdin.end(`${searchTerm}\n`);
        } else {
          event.searchRoundTripMs = Number(
            (performance.now() - searchStartedAt).toFixed(1),
          );
          resolvePromise({ ...ready, ...event });
        }
      }
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString('utf8')));
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
  const runCount = positiveIntegerArgument('runs', 5);
  const packRefs = !process.argv.includes('--loose-refs');
  const searchTerm =
    process.argv.find((argument) => argument.startsWith('--term='))?.slice(7) ??
    'branch-099';
  if (searchTerm.length === 0 || searchTerm.includes('\n')) {
    throw new Error('term must be non-empty and single-line');
  }
  const fixture = await createLargeRepository({
    branchCount,
    worktreeCount,
    packRefs,
  });
  try {
    const runs = [];
    for (let index = 0; index < runCount; index += 1) {
      runs.push(await runProbe(fixture.repository, searchTerm));
    }
    const median = (key) =>
      runs.map((result) => result[key]).sort((a, b) => a - b)[
        Math.floor(runs.length / 2)
      ];
    const medianPromptReadyMs = median('promptReadyMs');
    const medianSearchRoundTripMs = median('searchRoundTripMs');
    process.stdout.write(
      `${JSON.stringify(
        {
          spike: '002-staged-source-discovery',
          fixture: {
            branchCount,
            worktreeCount,
            refStorage: packRefs ? 'packed' : 'loose',
          },
            searchTerm,
          runs,
          medians: { medianPromptReadyMs, medianSearchRoundTripMs },
          budgets: { promptReadyMs: 400, searchRoundTripMs: 500 },
          passesBudgets:
            medianPromptReadyMs <= 400 && medianSearchRoundTripMs <= 500,
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
