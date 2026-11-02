import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChangedFile } from '../../src/contracts/comparison.js';
import {
  classifyAvailability,
  MAX_INLINE_TEXT_BYTES,
} from '../../src/git/availability.js';
import { createChangedFileInventory } from '../../src/git/inventory.js';
import { createObjectReader } from '../../src/git/objects.js';
import { createGitRunner } from '../../src/git/runner.js';
import type {
  GitRunOptions,
  GitRunResult,
  GitRunner,
} from '../../src/git/runner.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const safeGitArguments = [
  '--no-optional-locks',
  '-c',
  'core.hooksPath=',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'diff.external=',
  '-c',
  'protocol.file.allow=never',
] as const;
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_EXTERNAL_DIFF: '',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
};

interface AvailabilityFixture {
  readonly root: string;
  readonly baseOid: string;
  readonly headOid: string;
  readonly textOid: string;
  git(arguments_: readonly string[], input?: Uint8Array): Buffer;
  cleanup(): Promise<void>;
}

const fixtures: AvailabilityFixture[] = [];

async function createAvailabilityFixture(): Promise<AvailabilityFixture> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-availability-`));
  const git = (arguments_: readonly string[], input?: Uint8Array): Buffer =>
    execFileSync('git', [...safeGitArguments, ...arguments_], {
      cwd: root,
      encoding: 'buffer',
      env: gitEnvironment,
      input,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

  git(['init', '--initial-branch=main']);
  git(['config', '--local', 'user.name', `${RENAME_MAP.displayName} Availability Fixture`]);
  git([
    'config',
    '--local',
    'user.email',
    'availability@test.invalid',
  ]);
  git(['config', '--local', 'commit.gpgSign', 'false']);
  git(['commit', '--allow-empty', '-m', 'availability base']);
  const baseOid = git(['rev-parse', 'HEAD']).toString('ascii').trim();
  git(['switch', '-c', 'feature']);

  await Promise.all([
    writeFile(join(root, '.gitattributes'), '*.txt diff=blocked filter=blocked\n'),
    writeFile(join(root, 'text.txt'), 'immutable text\n'),
    writeFile(
      join(root, 'exact-limit.txt'),
      Buffer.alloc(MAX_INLINE_TEXT_BYTES, 0x61),
    ),
    writeFile(
      join(root, 'over-limit.txt'),
      Buffer.alloc(MAX_INLINE_TEXT_BYTES + 1, 0x61),
    ),
    writeFile(join(root, 'binary.txt'), Buffer.from([0x61, 0x00, 0x62])),
    writeFile(join(root, 'invalid-utf8.txt'), Buffer.from([0xc3, 0x28])),
    writeFile(join(root, 'worktree-target.txt'), 'must never be followed\n'),
    symlink('worktree-target.txt', join(root, 'link.txt')),
  ]);
  git([
    'add',
    '--',
    '.gitattributes',
    'text.txt',
    'exact-limit.txt',
    'over-limit.txt',
    'binary.txt',
    'invalid-utf8.txt',
    'link.txt',
  ]);
  git(['update-index', '--add', '--cacheinfo', `160000,${baseOid},submodule`]);
  git(['commit', '-m', 'availability matrix']);
  const headOid = git(['rev-parse', 'HEAD']).toString('ascii').trim();
  const textOid = git(['rev-parse', `${headOid}:text.txt`])
    .toString('ascii')
    .trim();

  git(['config', '--local', 'diff.blocked.textconv', 'false']);
  git(['config', '--local', 'filter.blocked.clean', 'false']);
  git(['config', '--local', 'filter.blocked.smudge', 'false']);
  git(['config', '--local', 'diff.external', 'false']);

  const fixture: AvailabilityFixture = {
    root,
    baseOid,
    headOid,
    textOid,
    git,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
  fixtures.push(fixture);
  return fixture;
}

function fileByPath(files: readonly ChangedFile[], path: string): ChangedFile {
  const file = files.find(
    (candidate) => (candidate.newPath?.utf8 ?? candidate.oldPath?.utf8) === path,
  );
  expect(file, `missing inventory entry for ${JSON.stringify(path)}`).toBeDefined();
  return file!;
}

function availabilityMatrix(
  files: readonly ChangedFile[],
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    files.map((file) => [
      file.newPath?.utf8 ?? file.oldPath?.utf8 ?? file.id,
      Reflect.get(file, 'availability'),
    ]),
  );
}

function recordingRunner(
  commands: Array<{
    readonly arguments: readonly string[];
    readonly input: Buffer | undefined;
    readonly maxStdoutBytes: number | undefined;
  }>,
): GitRunner {
  const nativeRunner = createGitRunner();
  return {
    async run(
      arguments_: readonly string[],
      options: GitRunOptions,
    ): Promise<GitRunResult> {
      const input = Reflect.get(options, 'input');
      commands.push({
        arguments: [...arguments_],
        input: Buffer.isBuffer(input) ? input : undefined,
        maxStdoutBytes: options.maxStdoutBytes,
      });
      return await nativeRunner.run(arguments_, options);
    },
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('real immutable Git object availability', () => {
  it('attaches the exact text and unsupported matrix to every pinned inventory entry', async () => {
    const repository = await createAvailabilityFixture();

    const files = await createChangedFileInventory({
      repositoryRoot: repository.root,
      mergeBaseOid: repository.baseOid,
      headOid: repository.headOid,
      objectFormat: 'sha1',
      fileIdNamespace: Buffer.from('availability inventory namespace'),
    });

    expect(availabilityMatrix(files)).toMatchObject({
      '.gitattributes': { kind: 'text' },
      'binary.txt': { kind: 'unsupported', reason: 'binary' },
      'exact-limit.txt': { kind: 'text' },
      'invalid-utf8.txt': { kind: 'unsupported', reason: 'non-utf8' },
      'link.txt': { kind: 'unsupported', reason: 'symlink' },
      'over-limit.txt': { kind: 'unsupported', reason: 'oversized' },
      submodule: { kind: 'unsupported', reason: 'submodule' },
      'text.txt': { kind: 'text' },
    });
    expect(files.every((file) => Object.isFrozen(file))).toBe(true);
  });

  it('uses only raw object IDs through bounded NUL machine-protocol commands', async () => {
    const repository = await createAvailabilityFixture();
    const commands: Array<{
      readonly arguments: readonly string[];
      readonly input: Buffer | undefined;
      readonly maxStdoutBytes: number | undefined;
    }> = [];
    const reader = createObjectReader(repository.root, {
      runner: recordingRunner(commands),
    });

    await expect(reader.inspect(repository.textOid)).resolves.toEqual({
      kind: 'available',
      objectType: 'blob',
      size: 15,
    });
    await expect(
      reader.read(repository.textOid, { maxBytes: MAX_INLINE_TEXT_BYTES }),
    ).resolves.toEqual({
      kind: 'available',
      bytes: Buffer.from('immutable text\n'),
    });

    expect(commands).toHaveLength(2);
    expect(commands.every((command) =>
      command.arguments.join(' ').includes('cat-file --batch-command -Z'),
    )).toBe(true);
    expect(commands.map((command) => command.input?.toString('ascii'))).toEqual([
      `info ${repository.textOid}\0`,
      `contents ${repository.textOid}\0`,
    ]);
    expect(
      commands.every(
        (command) =>
          !command.arguments.some(
            (argument) =>
              argument.includes(repository.textOid) || argument.includes(':'),
          ),
      ),
    ).toBe(true);
    expect(commands[1]?.maxStdoutBytes).toBeLessThanOrEqual(
      MAX_INLINE_TEXT_BYTES + 256,
    );
  });

  it('ignores advancing refs, dirty files, conversion drivers, and symlink targets', async () => {
    const repository = await createAvailabilityFixture();
    const frozenOptions = {
      repositoryRoot: repository.root,
      mergeBaseOid: repository.baseOid,
      headOid: repository.headOid,
      objectFormat: 'sha1' as const,
      fileIdNamespace: Buffer.from('immutable availability namespace'),
    };
    const before = await createChangedFileInventory(frozenOptions);

    await Promise.all([
      writeFile(join(repository.root, 'text.txt'), Buffer.from([0x00, 0xff])),
      writeFile(
        join(repository.root, 'worktree-target.txt'),
        Buffer.alloc(MAX_INLINE_TEXT_BYTES + 1, 0x00),
      ),
    ]);
    repository.git(['update-ref', 'refs/heads/feature', repository.baseOid]);

    const after = await createChangedFileInventory(frozenOptions);
    expect(availabilityMatrix(after)).toEqual(availabilityMatrix(before));
    expect(fileByPath(after, 'text.txt')).toMatchObject({
      newBlobOid: repository.textOid,
      availability: { kind: 'text' },
    });
    expect(fileByPath(after, 'link.txt')).toMatchObject({
      availability: { kind: 'unsupported', reason: 'symlink' },
    });
  });

  it('preserves loaded inventory metadata when a pinned object disappears', async () => {
    const repository = await createAvailabilityFixture();
    const files = await createChangedFileInventory({
      repositoryRoot: repository.root,
      mergeBaseOid: repository.baseOid,
      headOid: repository.headOid,
      objectFormat: 'sha1',
      fileIdNamespace: Buffer.from('missing availability namespace'),
    });
    const pinnedText = fileByPath(files, 'text.txt');

    await rm(
      join(
        repository.root,
        '.git',
        'objects',
        repository.textOid.slice(0, 2),
        repository.textOid.slice(2),
      ),
    );

    await expect(
      classifyAvailability(
        pinnedText,
        createObjectReader(repository.root),
      ),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'missing-object' });
    expect(pinnedText).toMatchObject({
      newBlobOid: repository.textOid,
      newPath: { utf8: 'text.txt' },
      availability: { kind: 'text' },
    });
  });

  it('maps an existing non-blob at a regular-file slot to missing-object', async () => {
    const repository = await createAvailabilityFixture();
    const files = await createChangedFileInventory({
      repositoryRoot: repository.root,
      mergeBaseOid: repository.baseOid,
      headOid: repository.headOid,
      objectFormat: 'sha1',
      fileIdNamespace: Buffer.from('wrong object availability namespace'),
    });
    const pinnedText = fileByPath(files, 'text.txt');

    await expect(
      classifyAvailability(
        { ...pinnedText, newBlobOid: repository.baseOid },
        createObjectReader(repository.root),
      ),
    ).resolves.toEqual({ kind: 'unavailable', reason: 'missing-object' });
  });

  it('honors cancellation before object metadata work starts', async () => {
    const repository = await createAvailabilityFixture();
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      createObjectReader(repository.root).inspect(
        repository.textOid,
        controller.signal,
      ),
    ).rejects.toThrow(/cancel/i);
  });
});
