import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createGroundedExactPatch } from '../../src/git/exact-patch.js';
import { MAX_INLINE_TEXT_BYTES } from '../../src/git/availability.js';
import {
  assertSourceControlUnchanged,
  captureSourceControlSnapshot,
} from '../helpers/source-control-snapshot.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const newStateDirSegment = RENAME_MAP.repoStateDir.replace(/\/$/, '');

const fixtures: string[] = [];

function git(cwd: string, arguments_: readonly string[]): Buffer {
  return execFileSync('git', ['--no-pager', ...arguments_], {
    cwd,
    encoding: 'buffer',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
  });
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-exact-patch-`));
  fixtures.push(root);
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'tests@example.com']);
  git(root, ['config', 'user.name', `${RENAME_MAP.displayName} tests`]);
  return root;
}

function gitPatch(root: string, from: string, to: string): string {
  return git(root, ['diff', '--binary', '--full-index', '--find-renames=20%', from, to, '--']).toString('utf8');
}

async function fixture(): Promise<{ readonly root: string; readonly oldBytes: Buffer; readonly newBytes: Buffer; readonly oldOid: string; readonly newOid: string }> {
  const root = await repository();

  const oldBytes = Buffer.from('first line\nlast line', 'utf8');
  const newBytes = Buffer.from('first line\nchanged line', 'utf8');
  await writeFile(join(root, 'notes.txt'), oldBytes);
  git(root, ['add', '--', 'notes.txt']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  const oldOid = git(root, ['rev-parse', 'HEAD:notes.txt']).toString('ascii').trim();

  await writeFile(join(root, 'notes.txt'), newBytes);
  git(root, ['add', '--', 'notes.txt']);
  git(root, ['commit', '--quiet', '-m', 'implemented patch']);
  const newOid = git(root, ['rev-parse', 'HEAD:notes.txt']).toString('ascii').trim();
  return { root, oldBytes, newBytes, oldOid, newOid };
}

function patch(oldOid: string, newOid: string): string {
  return [
    'diff --git a/notes.txt b/notes.txt',
    `index ${oldOid}..${newOid} 100644`,
    '--- a/notes.txt',
    '+++ b/notes.txt',
    '@@ -1,2 +1,2 @@',
    ' first line',
    '-last line',
    '\\ No newline at end of file',
    '+changed line',
    '\\ No newline at end of file',
    '',
  ].join('\n');
}

async function deleteRenameFixture(): Promise<{ readonly root: string; readonly content: string; readonly deletedBytes: Buffer; readonly renamedBytes: Buffer }> {
  const root = await repository();
  const deletedBytes = Buffer.from('deleted source\n', 'utf8');
  const renamedBytes = Buffer.from('one\ntwo\nthree\nfour\nfive\n', 'utf8');
  await writeFile(join(root, 'deleted.txt'), deletedBytes);
  await writeFile(join(root, 'rename-old.txt'), renamedBytes);
  git(root, ['add', '--', 'deleted.txt', 'rename-old.txt']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();

  await unlink(join(root, 'deleted.txt'));
  await rename(join(root, 'rename-old.txt'), join(root, 'rename-new.txt'));
  await writeFile(join(root, 'rename-new.txt'), Buffer.from('one\ntwo\nthree\nfour\nchanged\n', 'utf8'));
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'delete and rename']);
  const target = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
  return { root, content: gitPatch(root, base, target), deletedBytes, renamedBytes };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('read-only exact patch grounding', () => {
  it('grounds full-object preimages, exact in-memory postimages, digest, and metadata without mutating the repository', async () => {
    const source = await fixture();
    const content = patch(source.oldOid, source.newOid);
    const before = await captureSourceControlSnapshot(source.root);

    const grounded = await createGroundedExactPatch({
      cwd: source.root,
      patchContent: content,
      target: { kind: 'repository' },
    });

    const after = await captureSourceControlSnapshot(source.root);
    assertSourceControlUnchanged(before, after);
    expect(grounded.scope).toEqual({
      kind: 'exact-patch',
      digest: createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex'),
      validationTarget: { kind: 'repository' },
      submittedByteLength: Buffer.byteLength(content, 'utf8'),
    });
    expect(grounded.changedFiles).toHaveLength(1);
    const file = grounded.changedFiles[0]!;
    expect(file.oldBlobOid).toBe(source.oldOid);
    expect(file.newBlobOid).toBe(source.newOid);
    expect(file.oldPath?.utf8).toBe('notes.txt');
    expect(file.newPath?.utf8).toBe('notes.txt');
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(1);
    expect(grounded.contents.get(file.id)?.preimage).toEqual(source.oldBytes);
    expect(grounded.contents.get(file.id)?.postimage).toEqual(source.newBytes);
    expect(Object.isFrozen(grounded)).toBe(true);
    expect(Object.isFrozen(grounded.scope)).toBe(true);
    expect(Object.isFrozen(grounded.changedFiles)).toBe(true);
  });

  it('rejects an exact patch when the selected target differs by one byte and leaves the repository unchanged', async () => {
    const source = await fixture();
    await writeFile(join(source.root, 'notes.txt'), Buffer.from('first line\nchanged lime', 'utf8'));
    git(source.root, ['add', '--', 'notes.txt']);
    git(source.root, ['commit', '--quiet', '-m', 'drift']);
    const before = await captureSourceControlSnapshot(source.root);
    const content = patch(source.oldOid, source.newOid);

    await expect(
      createGroundedExactPatch({ cwd: source.root, patchContent: content, target: { kind: 'repository' } }),
    ).rejects.toMatchObject({ name: 'ExactPatchGroundingError', message: 'Patch does not match the selected target.' });

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(source.root));
  });

  it('rejects malformed hunk ranges, truncation, and body records outside declared counts without mutation', async () => {
    const source = await fixture();
    const valid = patch(source.oldOid, source.newOid);
    const malformed = [
      valid.replace('@@ -1,2 +1,2 @@', '@@ -1,3 +1,2 @@'),
      valid.replace('@@ -1,2 +1,2 @@', '@@ -1,2 +1,3 @@'),
      valid.replace('@@ -1,2 +1,2 @@', '@@ -1,1 +1,1 @@'),
      valid.replace('@@ -1,2 +1,2 @@', '@@ -1,2 +9,2 @@'),
      valid.replace('-last line\n\\ No newline at end of file\n', ''),
      valid.replace('@@ -1,2 +1,2 @@\n', '+outside\n@@ -1,2 +1,2 @@\n'),
    ];
    const before = await captureSourceControlSnapshot(source.root);

    for (const content of malformed) {
      await expect(
        createGroundedExactPatch({ cwd: source.root, patchContent: content, target: { kind: 'repository' } }),
      ).rejects.toMatchObject({ name: 'ExactPatchGroundingError' });
    }

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(source.root));
  });

  it.each(['repository', 'worktree'] as const)('rejects delete and rename drift when old target paths remain in the %s', async (targetKind) => {
    const source = await deleteRenameFixture();
    await writeFile(join(source.root, 'deleted.txt'), source.deletedBytes);
    await writeFile(join(source.root, 'rename-old.txt'), source.renamedBytes);
    if (targetKind === 'repository') {
      git(source.root, ['add', '--', 'deleted.txt', 'rename-old.txt']);
      git(source.root, ['commit', '--quiet', '-m', 'old targets drifted back']);
    }
    const before = await captureSourceControlSnapshot(source.root);

    await expect(
      createGroundedExactPatch({ cwd: source.root, patchContent: source.content, target: { kind: targetKind } }),
    ).rejects.toMatchObject({ name: 'ExactPatchGroundingError', message: 'Patch does not match the selected target.' });

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(source.root));
  });

  it('retains bounded oversized, binary, non-UTF-8, and submodule entries as exact unsupported inventory', async () => {
    const root = await repository();
    await writeFile(join(root, 'marker.txt'), 'first\n');
    git(root, ['add', '--', 'marker.txt']);
    git(root, ['commit', '--quiet', '-m', 'gitlink old object']);
    const oldCommit = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    await writeFile(join(root, 'marker.txt'), 'second\n');
    git(root, ['add', '--', 'marker.txt']);
    git(root, ['commit', '--quiet', '-m', 'gitlink new object']);
    const newCommit = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();

    const oldBinary = Buffer.from([0, 1, 2, 3]);
    const newBinary = Buffer.from([0, 1, 9, 3]);
    const oldNonUtf8 = Buffer.from([0xff, 1, 2]);
    const newNonUtf8 = Buffer.from([0xff, 1, 3]);
    const oldLarge = Buffer.alloc(MAX_INLINE_TEXT_BYTES + 1);
    const newLarge = Buffer.from(oldLarge);
    newLarge[newLarge.length - 1] = 1;
    await writeFile(join(root, '.gitattributes'), 'non-utf8.dat binary\n');
    await writeFile(join(root, 'binary.dat'), oldBinary);
    await writeFile(join(root, 'non-utf8.dat'), oldNonUtf8);
    await writeFile(join(root, 'large.dat'), oldLarge);
    git(root, ['add', '--', '.gitattributes', 'binary.dat', 'non-utf8.dat', 'large.dat']);
    git(root, ['update-index', '--add', '--cacheinfo', `160000,${oldCommit},vendor/sub`]);
    git(root, ['commit', '--quiet', '-m', 'unsupported base']);
    const base = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();

    await writeFile(join(root, 'binary.dat'), newBinary);
    await writeFile(join(root, 'non-utf8.dat'), newNonUtf8);
    await writeFile(join(root, 'large.dat'), newLarge);
    git(root, ['add', '--', 'binary.dat', 'non-utf8.dat', 'large.dat']);
    git(root, ['update-index', '--add', '--cacheinfo', `160000,${newCommit},vendor/sub`]);
    git(root, ['commit', '--quiet', '-m', 'unsupported target']);
    const target = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    await mkdir(join(root, 'vendor'), { recursive: true });
    await writeFile(join(root, 'vendor', 'sub'), 'snapshot placeholder\n');
    const content = gitPatch(root, base, target);
    const before = await captureSourceControlSnapshot(root);

    const grounded = await createGroundedExactPatch({
      cwd: root,
      patchContent: content,
      target: { kind: 'repository' },
    });

    const byPath = new Map(grounded.changedFiles.map((file) => [file.newPath?.utf8, file]));
    expect(byPath.get('binary.dat')?.availability).toEqual({ kind: 'unsupported', reason: 'binary' });
    expect(byPath.get('non-utf8.dat')?.availability).toEqual({ kind: 'unsupported', reason: 'non-utf8' });
    expect(byPath.get('large.dat')?.availability).toEqual({ kind: 'unsupported', reason: 'oversized' });
    expect(byPath.get('vendor/sub')?.availability).toEqual({ kind: 'unsupported', reason: 'submodule' });
    for (const [path, expectedOld, expectedNew] of [
      ['binary.dat', oldBinary, newBinary],
      ['non-utf8.dat', oldNonUtf8, newNonUtf8],
      ['large.dat', oldLarge, newLarge],
    ] as const) {
      const file = byPath.get(path)!;
      expect(grounded.contents.get(file.id)?.preimage).toEqual(expectedOld);
      expect(grounded.contents.get(file.id)?.postimage).toEqual(expectedNew);
    }
    const submodule = byPath.get('vendor/sub')!;
    expect(submodule.oldBlobOid).toBe(oldCommit);
    expect(submodule.newBlobOid).toBe(newCommit);
    expect(grounded.contents.get(submodule.id)).toEqual({ preimage: undefined, postimage: undefined });
    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(root));
  });

  it('rejects a Git binary literal that inflates beyond the grounded object ceiling without mutation', async () => {
    const root = await repository();
    git(root, ['commit', '--quiet', '--allow-empty', '-m', 'empty base']);
    const base = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    await writeFile(join(root, 'bounded.dat'), Buffer.alloc((2 * MAX_INLINE_TEXT_BYTES) + 1));
    git(root, ['add', '--', 'bounded.dat']);
    git(root, ['commit', '--quiet', '-m', 'oversized binary']);
    const target = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    const content = gitPatch(root, base, target);
    expect(Buffer.byteLength(content, 'utf8')).toBeLessThan(MAX_INLINE_TEXT_BYTES);
    const before = await captureSourceControlSnapshot(root);

    await expect(
      createGroundedExactPatch({ cwd: root, patchContent: content, target: { kind: 'repository' } }),
    ).rejects.toMatchObject({ name: 'ExactPatchGroundingError' });

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(root));
  });

  it('rejects a patch path segment equal to the legacy reserved ".cumpa" directory name', async () => {
    const root = await repository();
    git(root, ['commit', '--quiet', '--allow-empty', '-m', 'empty base']);
    const base = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    await mkdir(join(root, '.cumpa', 'exports'), { recursive: true });
    await writeFile(join(root, '.cumpa', 'exports', 'review.json'), '{}\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'add internal export']);
    const target = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    const content = gitPatch(root, base, target);
    const before = await captureSourceControlSnapshot(root);

    await expect(
      createGroundedExactPatch({ cwd: root, patchContent: content, target: { kind: 'repository' } }),
    ).rejects.toMatchObject({ name: 'ExactPatchGroundingError' });

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(root));
  });

  it('rejects a patch path segment equal to the new repo-local state-dir name', async () => {
    const root = await repository();
    git(root, ['commit', '--quiet', '--allow-empty', '-m', 'empty base']);
    const base = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    await mkdir(join(root, newStateDirSegment, 'exports'), { recursive: true });
    await writeFile(join(root, newStateDirSegment, 'exports', 'review.json'), '{}\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'add new-dir internal export']);
    const target = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
    const content = gitPatch(root, base, target);
    const before = await captureSourceControlSnapshot(root);

    await expect(
      createGroundedExactPatch({ cwd: root, patchContent: content, target: { kind: 'repository' } }),
    ).rejects.toMatchObject({ name: 'ExactPatchGroundingError' });

    assertSourceControlUnchanged(before, await captureSourceControlSnapshot(root));
  });
});
