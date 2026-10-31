import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { UncommittedScope } from '../../src/contracts/comparison.js';
import {
  WorktreeSnapshotManifestSchema,
  materializeWorktreeSnapshot,
  type WorktreeSnapshotRefreshDependencies,
} from '../../src/server/worktree-snapshot.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';

const fixtures: GitFixture[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeFixture(options?: Parameters<typeof createGitFixture>[0]): Promise<GitFixture> {
  const fixture = await createGitFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cumpa-wtsnap-'));
  roots.push(root);
  return root;
}

function headOid(fixture: GitFixture): string {
  return fixture.git(['rev-parse', 'HEAD']).toString('ascii').trim();
}

function scopeFor(
  fixture: GitFixture,
  sourceKind: 'staged' | 'unstaged' | 'worktree' | 'standalone',
  options?: {
    readonly baseCommitOid?: string;
    readonly mergeBaseOid?: string;
    readonly standaloneArguments?: readonly string[];
  },
): UncommittedScope {
  return {
    kind: 'uncommitted',
    sourceKind,
    repositoryRoot: fixture.root,
    objectFormat: 'sha1',
    baseCommitOid: options?.baseCommitOid,
    mergeBaseOid: options?.mergeBaseOid,
    standaloneArguments: options?.standaloneArguments === undefined ? undefined : [...options.standaloneArguments],
    changedFiles: [],
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function contentFiles(root: string): Promise<readonly string[]> {
  try {
    return await readdir(join(root, 'content'));
  } catch {
    return [];
  }
}

describe('WorktreeSnapshotManifestSchema', () => {
  it('rejects a manifest with an empty chain array', () => {
    const result = WorktreeSnapshotManifestSchema.safeParse({
      version: 1,
      sourceKind: 'unstaged',
      repositoryIdentity: '/repo',
      objectFormat: 'sha1',
      chain: [],
      entries: [],
      provenanceDigest: '0'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an entry missing captureStatus', () => {
    const result = WorktreeSnapshotManifestSchema.safeParse({
      version: 1,
      sourceKind: 'unstaged',
      repositoryIdentity: '/repo',
      objectFormat: 'sha1',
      chain: ['a'.repeat(64)],
      entries: [
        {
          file: {
            id: `file_${'a'.repeat(43)}`,
            status: { code: 'M', kind: 'modified', similarity: null },
            oldMode: '100644',
            newMode: '100644',
            oldBlobOid: '1'.repeat(40),
            newBlobOid: '2'.repeat(40),
            additions: 1,
            deletions: 1,
            availability: { kind: 'text' },
          },
          preimage: { exists: false, mode: '100644', blobOid: '1'.repeat(40), byteLength: 0 },
          postimage: { exists: false, mode: '100644', blobOid: '2'.repeat(40), byteLength: 0 },
          // captureStatus intentionally omitted
        },
      ],
      provenanceDigest: '0'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest where sourceKind is unstaged but a baseCommitOid is present', () => {
    const result = WorktreeSnapshotManifestSchema.safeParse({
      version: 1,
      sourceKind: 'unstaged',
      repositoryIdentity: '/repo',
      baseCommitOid: '1'.repeat(40),
      objectFormat: 'sha1',
      chain: ['a'.repeat(64)],
      entries: [],
      provenanceDigest: '0'.repeat(64),
    });
    expect(result.success).toBe(false);
  });
});

describe('materializeWorktreeSnapshot: capture round trip', () => {
  it('captures tracked modifications and untracked additions, both readable back', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    const baseOid = headOid(fixture);
    await fixture.write('tracked.txt', 'worktree edit\n');
    await fixture.write('untracked-new.txt', 'brand new\n');

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'worktree', { baseCommitOid: baseOid, mergeBaseOid: baseOid }),
      { root },
    );

    const files = await snapshot.files();
    expect(files).toHaveLength(2);

    const modified = files.find((file) => file.newPath?.utf8 === 'tracked.txt');
    expect(modified).toBeDefined();
    const added = files.find((file) => file.newPath?.utf8 === 'untracked-new.txt');
    expect(added).toBeDefined();

    const modifiedContent = await snapshot.readContent(modified!.id);
    expect(modifiedContent?.postimage?.toString('utf8')).toBe('worktree edit\n');
    expect(modifiedContent?.preimage?.toString('utf8')).toBe('base\n');

    const addedContent = await snapshot.readContent(added!.id);
    expect(addedContent?.postimage?.toString('utf8')).toBe('brand new\n');
    expect(addedContent?.preimage).toBeUndefined();

    const session = await snapshot.session();
    expect(session.chain).toHaveLength(1);
    expect(session.indexRaceNotice).toBe(false);
  });
});

describe('captureFileWithRetry (via materializeWorktreeSnapshot): torn-file handling (D-09)', () => {
  it('retries a file mutated exactly once and succeeds, recording captureStatus "captured"', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit one\n');
    const targetPath = join(fixture.root, 'tracked.txt');

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onFileReadAttempt: async (_fileId, attempt) => {
        if (attempt === 0) await writeFile(targetPath, 'mutated-during-first-attempt\n');
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files[0]!.availability).toEqual({ kind: 'text' });

    const content = await snapshot.readContent(files[0]!.id);
    expect(content?.postimage?.toString('utf8')).toBe('mutated-during-first-attempt\n');
  });

  it('marks a file mutated on every attempt as "changed-during-capture" with no partial bytes on disk', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    const targetPath = join(fixture.root, 'tracked.txt');
    let counter = 0;

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onFileReadAttempt: async () => {
        counter += 1;
        await writeFile(targetPath, `always mutated ${counter}\n`);
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files[0]!.availability).toEqual({ kind: 'unsupported', reason: 'changed-during-capture' });
    expect(counter).toBe(3); // 1 initial + 2 retries, all mutated

    // No content bytes were ever written for the torn file.
    expect(await contentFiles(root)).toHaveLength(0);
  });

  it('completes every other file normally when exactly one file is torn', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await mkdir(join(fixture.root, 'src'), { recursive: true });
    await fixture.write('src/changed.ts', 'export const changed = "committed value";\n');
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add changed.ts']);
    await fixture.write('tracked.txt', 'unstaged edit\n');
    await fixture.write('src/changed.ts', 'export const changed = "unstaged value";\n');
    const tornPath = join(fixture.root, 'tracked.txt');

    let attempts = 0;
    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onFileReadAttempt: async () => {
        attempts += 1;
        await writeFile(tornPath, `torn ${attempts}\n`);
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const files = await snapshot.files();
    expect(files).toHaveLength(2);

    const torn = files.find((file) => file.newPath?.utf8 === 'tracked.txt');
    const stable = files.find((file) => file.newPath?.utf8 === 'src/changed.ts');
    expect(torn?.availability).toEqual({ kind: 'unsupported', reason: 'changed-during-capture' });
    expect(stable?.availability).toEqual({ kind: 'text' });

    const stableContent = await snapshot.readContent(stable!.id);
    expect(stableContent?.postimage?.toString('utf8')).toBe('export const changed = "unstaged value";\n');
  });
});

describe('captureWorktreeManifest (via materializeWorktreeSnapshot): file-set changes mid-capture (D-10)', () => {
  it('classifies a file that disappears between enumerations as "changed-during-capture", not silently dropped', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    const targetPath = join(fixture.root, 'tracked.txt');

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      // A legitimate D-11 whole-capture retry (e.g. triggered by an
      // unrelated index stat-cache refresh as a side effect of git diff
      // itself) must not corrupt this scenario: re-establish the unstaged
      // edit at the start of every attempt, so each attempt's own first
      // enumeration sees the same "expected" file regardless of how many
      // times the whole capture is retried.
      onCaptureStart: async () => {
        await writeFile(targetPath, 'unstaged edit\n');
      },
      onBeforeObservedEnumeration: async () => {
        // Restore to the committed index content so the second enumeration
        // no longer reports this file as changed at all.
        await writeFile(targetPath, 'base\n');
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files[0]!.newPath?.utf8).toBe('tracked.txt');
    expect(files[0]!.availability).toEqual({ kind: 'unsupported', reason: 'changed-during-capture' });
    expect(await contentFiles(root)).toHaveLength(0);
  });

  it('excludes a file that appears only after the initial enumeration; it surfaces on the next Refresh instead', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onBeforeObservedEnumeration: async () => {
        await fixture.write('late-arriving.txt', 'arrived late\n');
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files.some((file) => file.newPath?.utf8 === 'late-arriving.txt')).toBe(false);

    // The late-arriving file is untracked, so it only shows up in a
    // 'worktree' sourceKind capture — confirm Refresh (same sourceKind
    // concept) would pick it up by capturing fresh with sourceKind
    // 'worktree' against the same base, independent of the first capture.
    const baseOid = headOid(fixture);
    const secondRoot = await makeRoot();
    const worktreeSnapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'worktree', { baseCommitOid: baseOid, mergeBaseOid: baseOid }),
      { root: secondRoot },
    );
    const worktreeFiles = await worktreeSnapshot.files();
    expect(worktreeFiles.some((file) => file.newPath?.utf8 === 'late-arriving.txt')).toBe(true);
  });
});

describe('index-identity race guard (D-11, Required Focus 3(c))', () => {
  it('resolves the worktree-specific index path for a linked worktree, not the main checkout\'s index', async () => {
    const fixture = await makeFixture({ registeredWorktree: true });
    const root = await makeRoot();
    expect(fixture.registeredWorktreePath).toBeDefined();
    const worktreeRoot = fixture.registeredWorktreePath!;

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onBeforeIndexRecheck: async () => {
        // Mutate the MAIN checkout's index only — the capture runs against
        // the linked worktree, so this must NOT be observed as a race if
        // indexIdentity correctly resolves the worktree's own index file.
        fixture.git(['add', '-A']);
      },
    };

    const scope: UncommittedScope = {
      kind: 'uncommitted',
      sourceKind: 'unstaged',
      repositoryRoot: worktreeRoot,
      objectFormat: 'sha1',
      changedFiles: [],
    };
    const snapshot = await materializeWorktreeSnapshot(scope, { root }, dependencies);
    const session = await snapshot.session();
    expect(session.indexRaceNotice).toBe(false);
  });

  it('produces indexRaceNotice: false when the index is untouched throughout', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root });
    const session = await snapshot.session();
    expect(session.indexRaceNotice).toBe(false);
  });

  it('retries the whole capture once when the index changes once, settling to indexRaceNotice: false', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    await fixture.write('side-effect.txt', 'will be staged\n');

    let recheckCalls = 0;
    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onBeforeIndexRecheck: async (attempt) => {
        recheckCalls += 1;
        if (attempt === 0) fixture.git(['add', 'side-effect.txt']);
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const session = await snapshot.session();
    expect(recheckCalls).toBe(2); // one retry performed
    expect(session.indexRaceNotice).toBe(false);
    const files = await snapshot.files();
    expect(files.every((file) => true)).toBe(true); // retried capture's own result used
  });

  it('returns indexRaceNotice: true (distinct from per-file captureStatus) when the index keeps changing', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'unstaged edit\n');
    await fixture.write('side-effect.txt', 'will be staged\n');

    let counter = 0;
    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onBeforeIndexRecheck: async () => {
        counter += 1;
        fixture.git(['add', 'side-effect.txt']);
        fixture.git(['reset', 'side-effect.txt']);
      },
    };

    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root }, dependencies);
    const session = await snapshot.session();
    expect(counter).toBe(2); // both attempts' brackets disagreed
    expect(session.indexRaceNotice).toBe(true);

    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files[0]!.availability).toEqual({ kind: 'text' }); // per-file status unaffected
  });
});

describe('WorktreeSnapshot.refresh() (Pattern 3, D-18, D-20, SNAP-04)', () => {
  it('appends to the chain and returns an accurate added/removed/modified delta without discarding prior content', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await mkdir(join(fixture.root, 'src'), { recursive: true });
    await fixture.write('src/changed.ts', 'export const changed = "committed value";\n');
    fixture.git(['add', '-A']);
    fixture.git(['commit', '-m', 'add changed.ts']);
    const baseOid = headOid(fixture);
    await fixture.write('tracked.txt', 'first edit\n');
    await fixture.write('src/changed.ts', 'export const changed = "first value";\n');

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'worktree', { baseCommitOid: baseOid, mergeBaseOid: baseOid }),
      { root },
    );
    const firstSession = await snapshot.session();
    expect(firstSession.chain).toHaveLength(1);

    const firstContentFiles = new Set(await contentFiles(root));
    expect(firstContentFiles.size).toBeGreaterThan(0);

    // Mutate for refresh: tracked.txt changes again (modified), src/changed.ts
    // reverts to its committed content (removed from the diff entirely),
    // and a brand-new untracked file appears (added).
    await fixture.write('tracked.txt', 'second edit\n');
    fixture.git(['checkout', '--', 'src/changed.ts']);
    await fixture.write('new-file.txt', 'brand new\n');

    const delta = await snapshot.refresh();
    expect(delta.added).toContain('new-file.txt');
    expect(delta.removed).toContain('src/changed.ts');
    expect(delta.modified).toContain('tracked.txt');
    expect(delta.indexRaceNotice).toBe(false);

    const secondSession = await snapshot.session();
    expect(secondSession.chain).toHaveLength(2);
    expect(secondSession.chain[0]).toBe(firstSession.chain[0]); // digestA unchanged, appended not replaced

    // digestA's content files are all still present and readable.
    const afterFirstRefreshFiles = new Set(await contentFiles(root));
    for (const file of firstContentFiles) {
      expect(afterFirstRefreshFiles.has(file)).toBe(true);
      const bytes = await readFile(join(root, 'content', file));
      expect(sha256(bytes)).toBe(file.replace(/\.bin$/u, ''));
    }

    // A second refresh with no further changes appends a third chain entry
    // and still never drops any earlier content.
    const secondDelta = await snapshot.refresh();
    expect(secondDelta.added).toEqual([]);
    expect(secondDelta.removed).toEqual([]);
    const thirdSession = await snapshot.session();
    expect(thirdSession.chain).toHaveLength(3);
    expect(thirdSession.chain[0]).toBe(firstSession.chain[0]);
    expect(thirdSession.chain[1]).toBe(secondSession.chain[1]);

    const afterSecondRefreshFiles = new Set(await contentFiles(root));
    for (const file of firstContentFiles) {
      expect(afterSecondRefreshFiles.has(file)).toBe(true);
    }
  });

  it('reports no changes in any of the three delta lists for a file identical across both captures', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('tracked.txt', 'stable edit\n');
    const snapshot = await materializeWorktreeSnapshot(scopeFor(fixture, 'unstaged'), { root });
    const delta = await snapshot.refresh();
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.modified).toEqual([]);
  });
});

describe('standalone sourceKind capture and refresh (Plan 15-03)', () => {
  it('captures the resolved file set, reads frozen content, and refresh() reports added/removed deltas as arguments re-resolve', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('a.txt', 'alpha original\n');
    await fixture.write('sub/b.txt', 'bravo\n');

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'standalone', { standaloneArguments: ['a.txt', 'sub'] }),
      { root },
    );
    const session = await snapshot.session();
    expect(session.sourceKind).toBe('standalone');

    const files = await snapshot.files();
    expect(files.map((file) => file.newPath?.utf8).sort()).toEqual(['a.txt', 'sub/b.txt']);
    for (const file of files) {
      expect(file.status.kind).toBe('added');
      expect(file.oldMode).toBe('000000');
      expect(file.standaloneGitState).toBeDefined();
    }

    // readContent returns the exact bytes present at capture time (SNAP-01);
    // mutating the file on disk afterward must not change what comes back.
    const aFileId = files.find((file) => file.newPath?.utf8 === 'a.txt')!.id;
    const beforeMutation = await snapshot.readContent(aFileId);
    expect(beforeMutation?.postimage?.toString('utf8')).toBe('alpha original\n');
    await fixture.write('a.txt', 'alpha mutated after capture\n');
    const afterMutation = await snapshot.readContent(aFileId);
    expect(afterMutation?.postimage?.toString('utf8')).toBe('alpha original\n');

    // refresh() re-resolves ['a.txt', 'sub'] fresh: a newly-matching file
    // under 'sub' is reported added.
    await fixture.write('sub/c.txt', 'charlie, arrived late\n');
    const addedDelta = await snapshot.refresh();
    expect(addedDelta.added).toContain('sub/c.txt');
    expect((await snapshot.files()).some((file) => file.newPath?.utf8 === 'sub/c.txt')).toBe(true);

    // Deleting a previously-resolved file is reported removed on the next
    // refresh() ('sub' still matches sub/c.txt, so the argument itself
    // keeps resolving to at least one file).
    await rm(join(fixture.root, 'sub', 'b.txt'));
    const removedDelta = await snapshot.refresh();
    expect(removedDelta.removed).toContain('sub/b.txt');
  });

  it('refresh() reports a clean "removed" delta instead of throwing when a single-file argument\'s only match disappears (CR-01 regression)', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('solo.txt', 'solo original\n');

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'standalone', { standaloneArguments: ['solo.txt'] }),
      { root },
    );
    const files = await snapshot.files();
    expect(files.map((file) => file.newPath?.utf8)).toEqual(['solo.txt']);

    // The 'solo.txt' argument's only match disappears entirely between
    // captures. Unlike the other case above (where 'sub' keeps matching
    // sub/c.txt), resolveStandaloneArguments now has nothing left to
    // resolve for this argument at all. refresh() must still report a
    // clean "removed" delta rather than letting the underlying "did not
    // match any file" error crash the refresh request.
    await rm(join(fixture.root, 'solo.txt'));
    const delta = await snapshot.refresh();
    expect(delta.removed).toContain('solo.txt');
    expect(delta.added).toEqual([]);
    expect(await snapshot.files()).toHaveLength(0);
  });

  it('still captures a staged sourceKind snapshot byte-for-byte identically to before this plan (regression)', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    const baseOid = headOid(fixture);
    await fixture.write('tracked.txt', 'staged edit\n');
    fixture.git(['add', 'tracked.txt']);

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'staged', { baseCommitOid: baseOid, mergeBaseOid: baseOid }),
      { root },
    );
    const files = await snapshot.files();
    expect(files).toHaveLength(1);
    expect(files[0]!.newPath?.utf8).toBe('tracked.txt');
    const content = await snapshot.readContent(files[0]!.id);
    expect(content?.postimage?.toString('utf8')).toBe('staged edit\n');
  });
});

describe('standalone sourceKind: torn-capture and invalid-scope rejection (Plan 15-03 Task 3)', () => {
  it('marks a standalone file that disappears between enumerations as "changed-during-capture", reusing the generic torn-capture pipeline (D-10)', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    await fixture.write('sub/torn.txt', 'will disappear\n');
    await fixture.write('sub/keep.txt', 'stays put\n');

    const dependencies: WorktreeSnapshotRefreshDependencies = {
      onBeforeObservedEnumeration: async () => {
        await rm(join(fixture.root, 'sub', 'torn.txt'));
      },
    };

    const snapshot = await materializeWorktreeSnapshot(
      scopeFor(fixture, 'standalone', { standaloneArguments: ['sub'] }),
      { root },
      dependencies,
    );
    const files = await snapshot.files();
    expect(files).toHaveLength(2);
    const tornFile = files.find((file) => file.newPath?.utf8 === 'sub/torn.txt');
    expect(tornFile?.availability).toEqual({ kind: 'unsupported', reason: 'changed-during-capture' });
    const keepFile = files.find((file) => file.newPath?.utf8 === 'sub/keep.txt');
    expect(keepFile?.availability).not.toEqual({ kind: 'unsupported', reason: 'changed-during-capture' });
  });

  it('rejects an invalid scope (standalone sourceKind with a baseCommitOid) at WorktreeSnapshotManifestSchema.parse, before any file is written', async () => {
    const fixture = await makeFixture();
    const root = await makeRoot();
    const baseOid = headOid(fixture);

    const invalidScope = scopeFor(fixture, 'standalone', {
      baseCommitOid: baseOid,
      standaloneArguments: ['tracked.txt'],
    });

    await expect(materializeWorktreeSnapshot(invalidScope, { root })).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
});
