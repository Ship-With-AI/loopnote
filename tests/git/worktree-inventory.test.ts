import { mkdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChangedFile } from '../../src/contracts/comparison.js';
import { createWorktreeChangedFileInventory } from '../../src/git/worktree-inventory.js';
import { joinDiffStats, parseNumstat } from '../../src/git/numstat.js';
import type { JoinedDiffStat } from '../../src/git/numstat.js';
import { parseRawDiff } from '../../src/git/raw-diff.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const sharedDiffFlags = [
  '-z',
  '--find-renames=50%',
  '--find-copies=50%',
  '--find-copies-harder',
  '--no-ext-diff',
  '--no-textconv',
] as const;

const fixtures: GitFixture[] = [];

async function makeFixture(): Promise<GitFixture> {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  return fixture;
}

function mergeBaseOid(fixture: GitFixture): string {
  return fixture.git(['rev-parse', 'HEAD']).toString('ascii').trim();
}

interface ComparableFile {
  readonly code: string;
  readonly similarity: number | null;
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldPath: string | undefined;
  readonly newPath: string | undefined;
  readonly additions: number | null;
  readonly deletions: number | null;
}

function comparableFromChangedFile(file: ChangedFile): ComparableFile {
  return {
    code: file.status.code,
    similarity: file.status.similarity,
    oldMode: file.oldMode,
    newMode: file.newMode,
    oldPath: file.oldPath?.utf8,
    newPath: file.newPath?.utf8,
    additions: file.additions,
    deletions: file.deletions,
  };
}

function comparableFromJoined(entries: readonly JoinedDiffStat[]): ComparableFile[] {
  return entries.map(({ diff, stats }) => {
    const oldPath =
      diff.paths.length === 2
        ? diff.paths[0].utf8
        : diff.oldMode === '000000'
          ? undefined
          : diff.paths[0].utf8;
    const newPath =
      diff.paths.length === 2
        ? diff.paths[1].utf8
        : diff.newMode === '000000'
          ? undefined
          : diff.paths[0].utf8;
    return {
      code: diff.status,
      similarity: diff.similarity,
      oldMode: diff.oldMode,
      newMode: diff.newMode,
      oldPath,
      newPath,
      additions: stats.additions,
      deletions: stats.deletions,
    };
  });
}

function sortComparable(entries: readonly ComparableFile[]): ComparableFile[] {
  return [...entries].sort((left, right) =>
    (left.newPath ?? left.oldPath ?? '').localeCompare(
      right.newPath ?? right.oldPath ?? '',
    ),
  );
}

function realTrackedDiff(
  fixture: GitFixture,
  diffArguments: readonly string[],
): readonly JoinedDiffStat[] {
  const rawOutput = fixture.git([
    'diff',
    ...diffArguments,
    '--raw',
    ...sharedDiffFlags,
    '--no-abbrev',
  ]);
  const numstatOutput = fixture.git([
    'diff',
    ...diffArguments,
    '--numstat',
    ...sharedDiffFlags,
  ]);
  return joinDiffStats(parseRawDiff(rawOutput), parseNumstat(numstatOutput));
}

function pathText(file: ChangedFile): string | undefined {
  return file.newPath?.utf8 ?? file.oldPath?.utf8;
}

function fileByPath(files: readonly ChangedFile[], path: string): ChangedFile {
  const file = files.find((candidate) => pathText(candidate) === path);
  expect(file, `missing inventory entry for ${JSON.stringify(path)}`).toBeDefined();
  return file!;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('staged source kind', () => {
  it('matches git diff --cached for additions, modifications, and renames', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);

    await fixture.write('staged-add.txt', 'new file\n');
    await fixture.write('tracked.txt', 'tracked modified\n');
    fixture.git(['mv', 'committed.txt', 'committed-renamed.txt']);
    fixture.git(['add', '-A']);

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'staged',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    const expected = realTrackedDiff(fixture, ['--cached', baseOid]);
    expect(sortComparable(files.map(comparableFromChangedFile))).toEqual(
      sortComparable(comparableFromJoined(expected)),
    );

    const added = fileByPath(files, 'staged-add.txt');
    expect(added.status).toMatchObject({ code: 'A', kind: 'added' });
    expect(added.availability).toEqual({ kind: 'text' });

    const modified = fileByPath(files, 'tracked.txt');
    expect(modified.status).toMatchObject({ code: 'M', kind: 'modified' });

    const renamed = fileByPath(files, 'committed-renamed.txt');
    expect(renamed.status.kind).toBe('renamed');
    expect(renamed.oldPath?.utf8).toBe('committed.txt');
    expect(renamed.status.similarity).toBeGreaterThanOrEqual(50);
  });

  it('classifies a staged binary file as unsupported/binary via numstat, not re-read bytes', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);

    await writeFile(join(fixture.root, 'binary.dat'), Buffer.from([0, 1, 0, 2]));
    fixture.git(['add', '--', 'binary.dat']);

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'staged',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    const binary = fileByPath(files, 'binary.dat');
    expect(binary.additions).toBeNull();
    expect(binary.deletions).toBeNull();
    expect(binary.availability).toEqual({ kind: 'unsupported', reason: 'binary' });
  });

  it('excludes .cumpa/ paths from staged results', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);

    await mkdir(join(fixture.root, '.cumpa', 'drafts'), { recursive: true });
    await writeFile(join(fixture.root, '.cumpa', 'drafts', 'x.json'), '{}\n');
    await fixture.write('visible.txt', 'visible\n');
    fixture.git(['add', '-A']);

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'staged',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    expect(files.some((file) => (pathText(file) ?? '').startsWith('.cumpa'))).toBe(false);
    expect(pathText(fileByPath(files, 'visible.txt'))).toBe('visible.txt');
  });
});

describe('unstaged source kind', () => {
  it('matches plain git diff (index to worktree) and omits staged-only changes', async () => {
    const fixture = await makeFixture();
    await fixture.write('unstaged-target.txt', 'before\n');
    fixture.git(['add', '--', 'unstaged-target.txt']);
    fixture.git(['commit', '-m', 'add unstaged target']);

    await fixture.write('staged-add.txt', 'staged only\n');
    fixture.git(['add', '--', 'staged-add.txt']);

    await fixture.write('unstaged-target.txt', 'after\n');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'unstaged',
      repositoryRoot: fixture.root,
      objectFormat: 'sha1',
    });

    expect(files).toHaveLength(1);
    const modified = fileByPath(files, 'unstaged-target.txt');
    expect(modified.status).toMatchObject({ code: 'M', kind: 'modified' });
    expect(modified.availability).toEqual({ kind: 'text' });

    const expected = realTrackedDiff(fixture, []);
    expect(sortComparable(files.map(comparableFromChangedFile))).toEqual(
      sortComparable(comparableFromJoined(expected)),
    );
  });

  it('classifies a worktree-only binary edit as unsupported/binary', async () => {
    const fixture = await makeFixture();
    await fixture.write('binary-target.txt', 'text\n');
    fixture.git(['add', '--', 'binary-target.txt']);
    fixture.git(['commit', '-m', 'add binary target']);

    await writeFile(join(fixture.root, 'binary-target.txt'), Buffer.from([0, 1, 2, 0]));

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'unstaged',
      repositoryRoot: fixture.root,
      objectFormat: 'sha1',
    });

    const binary = fileByPath(files, 'binary-target.txt');
    expect(binary.additions).toBeNull();
    expect(binary.deletions).toBeNull();
    expect(binary.availability).toEqual({ kind: 'unsupported', reason: 'binary' });
  });

  it('classifies a worktree-resident symlink as unsupported/symlink without following it', async () => {
    const fixture = await makeFixture();
    await fixture.write('symlink-target.txt', 'text\n');
    fixture.git(['add', '--', 'symlink-target.txt']);
    fixture.git(['commit', '-m', 'add symlink target']);

    await unlink(join(fixture.root, 'symlink-target.txt'));
    await symlink('/does/not/exist', join(fixture.root, 'symlink-target.txt'));

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'unstaged',
      repositoryRoot: fixture.root,
      objectFormat: 'sha1',
    });

    const changed = fileByPath(files, 'symlink-target.txt');
    expect(changed.newMode).toBe('120000');
    expect(changed.availability).toEqual({ kind: 'unsupported', reason: 'symlink' });
  });

  it('excludes .cumpa/ paths from unstaged results', async () => {
    const fixture = await makeFixture();
    await mkdir(join(fixture.root, '.cumpa', 'drafts'), { recursive: true });
    await writeFile(join(fixture.root, '.cumpa', 'drafts', 'x.json'), '{}\n');
    fixture.git(['add', '--', '.cumpa/drafts/x.json']);
    fixture.git(['commit', '-m', 'add internal file']);

    await writeFile(join(fixture.root, '.cumpa', 'drafts', 'x.json'), '{"edited":true}\n');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'unstaged',
      repositoryRoot: fixture.root,
      objectFormat: 'sha1',
    });

    expect(files.some((file) => (pathText(file) ?? '').startsWith('.cumpa'))).toBe(false);
  });
});

describe('worktree source kind', () => {
  it('unions merge-base->worktree tracked changes with untracked additions', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);
    await fixture.write('tracked.txt', 'worktree edit\n');
    await fixture.write('untracked-new.txt', 'brand new\n');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'worktree',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    const modified = fileByPath(files, 'tracked.txt');
    expect(modified.status).toMatchObject({ code: 'M', kind: 'modified' });

    const added = fileByPath(files, 'untracked-new.txt');
    expect(added.status).toMatchObject({ code: 'A', kind: 'added' });
    expect(added.oldMode).toBe('000000');
    expect(added.oldPath).toBeUndefined();
    expect(added.newMode).toBe('100644');
    expect(added.oldBlobOid).toBe('0'.repeat(40));
    expect(added.newBlobOid).toBe('0'.repeat(40));
    expect(added.additions).toBeNull();
    expect(added.deletions).toBeNull();
    expect(added.availability).toEqual({ kind: 'text' });

    const expectedTracked = realTrackedDiff(fixture, [baseOid]);
    const trackedActual = files.filter((file) => pathText(file) !== 'untracked-new.txt');
    expect(sortComparable(trackedActual.map(comparableFromChangedFile))).toEqual(
      sortComparable(comparableFromJoined(expectedTracked)),
    );

    const untrackedPaths = fixture
      .git(['ls-files', '--others', '--exclude-standard', '-z'])
      .toString('latin1')
      .split('\0')
      .filter(Boolean);
    expect(untrackedPaths).toEqual(['untracked-new.txt']);
  });

  it('excludes gitignored untracked files', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);
    await fixture.write('.gitignore', 'ignored.txt\n');
    fixture.git(['add', '--', '.gitignore']);
    fixture.git(['commit', '-m', 'add gitignore']);
    await fixture.write('ignored.txt', 'should not appear\n');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'worktree',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    expect(files.some((file) => pathText(file) === 'ignored.txt')).toBe(false);
  });

  it('excludes untracked .cumpa/ paths even without a matching .gitignore rule', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);
    await mkdir(join(fixture.root, '.cumpa'), { recursive: true });
    await writeFile(join(fixture.root, '.cumpa', 'untracked.json'), '{}\n');

    const rawUntracked = fixture
      .git(['ls-files', '--others', '--exclude-standard', '-z'])
      .toString('latin1')
      .split('\0')
      .filter(Boolean);
    expect(rawUntracked).toContain('.cumpa/untracked.json');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'worktree',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    expect(files.some((file) => (pathText(file) ?? '').startsWith('.cumpa'))).toBe(false);
  });

  it('reflects the cumulative base->worktree diff once for a staged-then-further-edited file', async () => {
    const fixture = await makeFixture();
    const baseOid = mergeBaseOid(fixture);
    await fixture.write('tracked.txt', 'staged value\n');
    fixture.git(['add', '--', 'tracked.txt']);
    await fixture.write('tracked.txt', 'staged value\nworktree continuation\n');

    const files = await createWorktreeChangedFileInventory({
      sourceKind: 'worktree',
      repositoryRoot: fixture.root,
      mergeBaseOid: baseOid,
      objectFormat: 'sha1',
    });

    const trackedMatches = files.filter((file) => pathText(file) === 'tracked.txt');
    expect(trackedMatches).toHaveLength(1);

    const expectedTracked = realTrackedDiff(fixture, [baseOid]);
    expect(sortComparable(files.map(comparableFromChangedFile))).toEqual(
      sortComparable(comparableFromJoined(expectedTracked)),
    );
  });
});
