import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function run(command, args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited ${code}: ${Buffer.concat(stderr).toString('utf8')}`,
        ),
      );
    });
    child.stdin.end(input);
  });
}

function fastImportStream(branchCount) {
  const chunks = ['blob\nmark :1\ndata 0\n\n'];
  for (let index = 0; index < branchCount; index += 1) {
    const name = index === 0 ? 'main' : `branch-${String(index).padStart(5, '0')}`;
    const message = `commit-${index}`;
    chunks.push(
      `commit refs/heads/${name}\n` +
        `mark :${index + 2}\n` +
        'author Benchmark <benchmark@example.com> 0 +0000\n' +
        'committer Benchmark <benchmark@example.com> 0 +0000\n' +
        `data ${Buffer.byteLength(message)}\n${message}\n` +
        'M 100644 :1 bench.txt\n\n',
    );
  }
  chunks.push('done\n');
  return chunks.join('');
}

export async function createLargeRepository({
  branchCount,
  worktreeCount,
  packRefs = false,
}) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'loopnote-startup-'));
  const repository = join(tempRoot, 'repo');
  await mkdir(repository);
  await run('git', ['init', '-q', '-b', 'main'], { cwd: repository });
  await run('git', ['fast-import', '--quiet', '--done'], {
    cwd: repository,
    input: fastImportStream(branchCount),
  });
  await run('git', ['reset', '--hard', '-q', 'main'], { cwd: repository });
  if (packRefs) {
    await run('git', ['pack-refs', '--all'], { cwd: repository });
  }
  for (let index = 1; index < worktreeCount; index += 1) {
    await run(
      'git',
      ['worktree', 'add', '--detach', '-q', join(tempRoot, `worktree-${index}`), 'main'],
      { cwd: repository },
    );
  }
  return { repository, tempRoot };
}

export async function removeLargeRepository(tempRoot) {
  await rm(tempRoot, { force: true, recursive: true });
}

export function positiveIntegerArgument(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
