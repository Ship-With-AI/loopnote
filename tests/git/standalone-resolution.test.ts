import { symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyStandaloneGitState,
  createStandaloneChangedFileInventory,
  resolveStandaloneArguments,
} from '../../src/git/standalone-resolution.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

interface MinimalExactPath {
  readonly bytesBase64url: string;
  readonly display: string;
}

function pathDisplays(paths: readonly MinimalExactPath[]): readonly string[] {
  return paths.map((path) => path.display).toSorted();
}

async function makeStandaloneFixture(): Promise<GitFixture> {
  const fixture = await createGitFixture();
  fixtures.push(fixture);

  await fixture.write('a.txt', 'a contents\n');
  await fixture.write('sub/b.txt', 'b contents\n');
  fixture.git(['add', '-A']);
  fixture.git(['commit', '-m', 'add standalone literal/glob fixtures']);

  await fixture.write('.gitignore', 'ignored.txt\n');
  fixture.git(['add', '.gitignore']);
  fixture.git(['commit', '-m', 'add gitignore']);

  await fixture.write('untracked.txt', 'untracked contents\n');
  await fixture.write('ignored.txt', 'ignored contents\n');

  symlinkSync(
    join(tmpdir(), 'cumpa-standalone-escape-target.txt'),
    join(fixture.root, 'escape-link'),
  );

  return fixture;
}

describe('resolveStandaloneArguments', () => {
  it('resolves a tracked literal path to exactly one entry', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['a.txt']);
    expect(pathDisplays(resolved)).toEqual(['a.txt']);
  });

  it('resolves an untracked literal path identically to a tracked one', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['untracked.txt']);
    expect(pathDisplays(resolved)).toEqual(['untracked.txt']);
  });

  it('recurses a directory argument to every file beneath it', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['sub']);
    expect(pathDisplays(resolved)).toEqual(['sub/b.txt']);
  });

  it('matches glob arguments across directory boundaries per Git pathspec rules', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['*.txt']);
    expect(pathDisplays(resolved)).toEqual(['a.txt', 'sub/b.txt']);
  });

  it('dedupes a file matched by more than one overlapping argument', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, [
      'a.txt',
      'sub/*.txt',
      'sub/b.txt',
    ]);
    expect(pathDisplays(resolved)).toEqual(['a.txt', 'sub/b.txt']);
  });

  it('rejects a `../` traversal argument, naming the argument in the error', async () => {
    const fixture = await makeStandaloneFixture();
    await expect(
      resolveStandaloneArguments(fixture.root, ['../outside.txt']),
    ).rejects.toThrow('../outside.txt');
  });

  it('rejects an absolute path outside the repository, naming the argument in the error', async () => {
    const fixture = await makeStandaloneFixture();
    const outside = join(tmpdir(), 'outside.txt');
    await expect(
      resolveStandaloneArguments(fixture.root, [outside]),
    ).rejects.toThrow(outside);
  });

  it('rejects a multi-segment embedded escape, naming the argument in the error', async () => {
    const fixture = await makeStandaloneFixture();
    await expect(
      resolveStandaloneArguments(fixture.root, ['sub/../../outside.txt']),
    ).rejects.toThrow('sub/../../outside.txt');
  });

  it('rejects an explicitly gitignored literal path, mentioning .gitignore', async () => {
    const fixture = await makeStandaloneFixture();
    await expect(
      resolveStandaloneArguments(fixture.root, ['ignored.txt']),
    ).rejects.toThrow(/\.gitignore/);
  });

  it('rejects a nonexistent literal path distinctly from the ignored case', async () => {
    const fixture = await makeStandaloneFixture();
    await expect(
      resolveStandaloneArguments(fixture.root, ['does-not-exist.txt']),
    ).rejects.toThrow(/did not match any file/);
  });

  it('resolves a symlink named directly as its own non-reviewable entry without following it', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['escape-link']);
    expect(pathDisplays(resolved)).toEqual(['escape-link']);
  });

  it('never traverses a symlinked directory to discover files inside it', async () => {
    const fixture = await makeStandaloneFixture();
    await expect(
      resolveStandaloneArguments(fixture.root, ['escape-link/*']),
    ).rejects.toThrow(/did not match any file/);
  });

  it('rejects more than the raw-argument cap before any Git call', async () => {
    const fixture = await makeStandaloneFixture();
    const tooMany = Array.from({ length: 257 }, (_, index) => `arg-${index}.txt`);
    await expect(
      resolveStandaloneArguments(fixture.root, tooMany),
    ).rejects.toThrow(/256/);
  });
});

describe('classifyStandaloneGitState', () => {
  it('classifies untracked, unchanged, and modified-uncommitted files', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, ['a.txt', 'untracked.txt']);
    const untrackedPath = resolved.find((path) => path.display === 'untracked.txt')!;
    const trackedPath = resolved.find((path) => path.display === 'a.txt')!;

    const beforeStates = await classifyStandaloneGitState(fixture.root, resolved);
    expect(beforeStates.get(untrackedPath.bytesBase64url)).toBe('untracked');
    expect(beforeStates.get(trackedPath.bytesBase64url)).toBe('unchanged');

    await fixture.write('a.txt', 'a contents modified\n');
    const afterStates = await classifyStandaloneGitState(fixture.root, resolved);
    expect(afterStates.get(trackedPath.bytesBase64url)).toBe('modified-uncommitted');
  });
});

describe('createStandaloneChangedFileInventory', () => {
  it('builds one added ChangedFile per resolved path with the matching git state attached', async () => {
    const fixture = await makeStandaloneFixture();
    const resolved = await resolveStandaloneArguments(fixture.root, [
      'a.txt',
      'untracked.txt',
      'escape-link',
    ]);
    const gitStates = await classifyStandaloneGitState(fixture.root, resolved);
    const files = await createStandaloneChangedFileInventory(
      fixture.root,
      resolved,
      gitStates,
      'sha1',
    );

    expect(files).toHaveLength(resolved.length);
    for (const file of files) {
      expect(file.status.kind).toBe('added');
      expect(file.status.similarity).toBeNull();
      expect(file.oldMode).toBe('000000');
      const path = resolved.find(
        (candidate) => candidate.bytesBase64url === file.newPath?.bytesBase64url,
      )!;
      expect(file.standaloneGitState).toBe(gitStates.get(path.bytesBase64url));
    }

    const symlinkFile = files.find((file) => file.newPath?.display === 'escape-link')!;
    expect(symlinkFile.availability).toEqual({ kind: 'unsupported', reason: 'symlink' });
  });
});
