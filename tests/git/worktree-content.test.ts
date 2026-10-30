import { afterEach, describe, expect, it } from 'vitest';

import { blobOid } from '../../src/git/exact-patch.js';
import { createObjectReader } from '../../src/git/objects.js';
import { createGitRunner } from '../../src/git/runner.js';
import { resolveWorktreeSideContent } from '../../src/git/worktree-content.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function makeFixture(): Promise<GitFixture> {
  const fixture = await createGitFixture();
  fixtures.push(fixture);
  return fixture;
}

function diffStatOutput(fixture: GitFixture, arguments_: readonly string[]): string {
  return fixture.git(['diff', '--stat', '--no-color', ...arguments_, '--']).toString('utf8').trim();
}

describe('resolveWorktreeSideContent', () => {
  it('shows zero changed lines when CRLF line endings alone separate the worktree copy from the normalized index content', async () => {
    const fixture = await makeFixture();
    await fixture.write('.gitattributes', '* text=auto eol=lf\n');
    const normalizedLines = ['line one', 'line two', 'line three', ''];
    await fixture.write('crlf.txt', normalizedLines.join('\n'));
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add CRLF-normalized file']);

    // Worktree copy differs only by line-ending style, not content: git diff
    // must report zero changes for this path (verified against git itself,
    // not against this module, since resolveWorktreeSideContent must only be
    // called for files already reported changed).
    await fixture.write('crlf.txt', normalizedLines.join('\r\n'));

    expect(diffStatOutput(fixture, [])).toBe('');
  });

  it('reconstructs exactly one changed line against the same CRLF fixture carrying one genuine edit', async () => {
    const fixture = await makeFixture();
    await fixture.write('.gitattributes', '* text=auto eol=lf\n');
    const normalizedLines = ['line one', 'line two', 'line three', ''];
    await fixture.write('crlf.txt', normalizedLines.join('\n'));
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add CRLF-normalized file']);

    const editedLines = ['line one', 'line TWO edited', 'line three', ''];
    await fixture.write('crlf.txt', editedLines.join('\r\n'));

    expect(diffStatOutput(fixture, [])).toContain('crlf.txt');
    expect(diffStatOutput(fixture, [])).toContain('1 file changed');

    const runner = createGitRunner();
    const objectReader = createObjectReader(fixture.root, { runner });
    const preimageOid = fixture.git(['rev-parse', ':crlf.txt']).toString('ascii').trim();
    const preimage = await objectReader.read(preimageOid, { maxBytes: 1024 * 1024 });
    if (preimage.kind !== 'available') throw new Error('expected index blob to be available');

    const result = await resolveWorktreeSideContent(
      { repositoryRoot: fixture.root, path: 'crlf.txt', scope: 'worktree', objectFormat: 'sha1' },
      { runner },
    );

    const preimageLines = Buffer.from(preimage.bytes).toString('utf8').split('\n');
    const postimageLines = result.bytes.toString('utf8').split('\n');
    expect(postimageLines).toHaveLength(preimageLines.length);
    const differing = preimageLines.filter((line, index) => line !== postimageLines[index]);
    expect(differing).toEqual(['line two']);

    expect(result.blobOid).toBe(blobOid(result.bytes, 'sha1'));
  });

  it('reconstructs the worktree side across a merge-base endpoint for a two-region edit, proving -U1000000 collapses to one hunk', async () => {
    const fixture = await makeFixture();
    const baseLines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
    await fixture.write('multi.txt', `${baseLines.join('\n')}\n`);
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add multi-region file']);
    const mergeBaseOid = fixture.git(['rev-parse', 'HEAD']).toString('ascii').trim();

    const editedLines = [...baseLines];
    editedLines[1] = 'line 2 EDITED';
    editedLines[17] = 'line 18 EDITED';
    await fixture.write('multi.txt', `${editedLines.join('\n')}\n`);

    const rawDiff = fixture
      .git(['diff', '-U1000000', '--no-color', '--no-ext-diff', '--no-textconv', mergeBaseOid, '--', 'multi.txt'])
      .toString('utf8');
    const hunkHeaders = rawDiff.split('\n').filter((line) => line.startsWith('@@ '));
    expect(hunkHeaders).toHaveLength(1);

    const runner = createGitRunner();
    const result = await resolveWorktreeSideContent(
      {
        repositoryRoot: fixture.root,
        path: 'multi.txt',
        scope: 'worktree',
        endpoint: mergeBaseOid,
        objectFormat: 'sha1',
      },
      { runner },
    );

    expect(result.bytes.toString('utf8')).toBe(`${editedLines.join('\n')}\n`);
    expect(result.blobOid).toBe(blobOid(result.bytes, 'sha1'));
  });

  it('exposes the same blobOid algorithm exact-patch.ts uses, so committed and uncommitted anchors share one hashing path', async () => {
    const fixture = await makeFixture();
    await fixture.write('plain.txt', 'alpha\nbeta\n');
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add plain file']);
    await fixture.write('plain.txt', 'alpha\nbeta edited\n');

    const runner = createGitRunner();
    const result = await resolveWorktreeSideContent(
      { repositoryRoot: fixture.root, path: 'plain.txt', scope: 'worktree', objectFormat: 'sha1' },
      { runner },
    );

    expect(result.blobOid).toBe(blobOid(Buffer.from('alpha\nbeta edited\n', 'utf8'), 'sha1'));
  });

  it('throws a descriptive error when invoked for a path git diff reports no change for', async () => {
    const fixture = await makeFixture();
    await fixture.write('unchanged.txt', 'same\n');
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add unchanged file']);

    const runner = createGitRunner();
    await expect(
      resolveWorktreeSideContent(
        { repositoryRoot: fixture.root, path: 'unchanged.txt', scope: 'worktree', objectFormat: 'sha1' },
        { runner },
      ),
    ).rejects.toThrow(/unchanged\.txt/);
  });
});
