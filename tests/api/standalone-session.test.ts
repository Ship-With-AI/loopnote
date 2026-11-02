import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, afterEach } from 'vitest';

import type { UncommittedScope } from '../../src/contracts/comparison.js';
import { createStandaloneCapabilityRegistry } from '../../src/server/capabilities.js';
import { materializeWorktreeSnapshot } from '../../src/server/worktree-snapshot.js';
import { buildDurableAnchor } from '../../src/domain/anchor.js';
import { ReviewExportV4Schema } from '../../src/contracts/draft.js';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const roots: string[] = [];
const fixtures: GitFixture[] = [];

async function makeFixture(options?: Parameters<typeof createGitFixture>[0]): Promise<GitFixture> {
  const fixture = await createGitFixture(options);
  fixtures.push(fixture);
  return fixture;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-standalone-session-`));
  roots.push(root);
  return root;
}

function scopeFor(fixture: GitFixture, standaloneArguments: readonly string[]): UncommittedScope {
  return {
    kind: 'uncommitted',
    sourceKind: 'standalone',
    repositoryRoot: fixture.root,
    objectFormat: 'sha1',
    standaloneArguments: [...standaloneArguments],
    changedFiles: [],
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(async (fixture) => fixture.cleanup()));
  await Promise.all(roots.splice(0).map(async (value) => rm(value, { recursive: true, force: true })));
});

describe('standalone capability registry', () => {
  test('session() reports sourceKind standalone, a derived standaloneReviewKey, and per-file standaloneGitState', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha\n');
    fixture.git(['add', 'a.txt']);
    await fixture.write('b.txt', 'bravo\n');
    const scope = scopeFor(fixture, ['a.txt', 'b.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});

    const session = await registry.session();
    expect('uncommitted' in session).toBe(true);
    if (!('uncommitted' in session)) throw new Error('Expected an uncommitted session response.');
    expect(session.uncommitted).toMatchObject({
      kind: 'uncommitted',
      sourceKind: 'standalone',
      changedFileCount: 2,
    });
    expect(session.uncommitted.reviewKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(session.files).toHaveLength(2);
    for (const file of session.files) {
      expect(file.standaloneGitState).toBeDefined();
    }
  });

  test('verifyAnchor resolves a head-side anchor to verified and a base-side anchor to orphaned, since standalone files carry no oldPath', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha line\n');
    const scope = scopeFor(fixture, ['a.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});

    const files = await snapshot.files();
    const file = files.find((candidate) => candidate.newPath?.utf8 === 'a.txt');
    expect(file).toBeDefined();
    const content = await registry.readContent(file!.id);
    const headSide = content?.head;
    expect(headSide?.exists).toBe(true);
    if (headSide === undefined || !headSide.exists) throw new Error('Expected head-side content to exist.');

    const headAnchor = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'head',
      blobOid: headSide.blobOid,
      line: 1,
      text: headSide.text,
    });
    expect(await registry.verifyAnchor(headAnchor)).toMatchObject({ state: 'verified' });

    const baseAnchor = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'base',
      blobOid: headSide.blobOid,
      line: 1,
      text: headSide.text,
    });
    expect(await registry.verifyAnchor(baseAnchor)).toEqual({ state: 'orphaned', reason: 'anchor-unavailable' });
  });

  test('lookup and readContent return uncommitted-shaped metadata/content with an empty base side', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha content\n');
    const scope = scopeFor(fixture, ['a.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});

    const files = await snapshot.files();
    const file = files.find((candidate) => candidate.newPath?.utf8 === 'a.txt');
    expect(file).toBeDefined();

    const metadata = await registry.lookup(file!.id);
    expect(metadata).toMatchObject({ fileId: file!.id, oldMode: '000000' });

    const content = await registry.readContent(file!.id);
    expect(content?.head).toMatchObject({ exists: true, text: 'alpha content\n' });
    expect(content?.base).toEqual({ exists: false });
  });

  test('refresh() delegates to snapshot.refresh() and reports added/removed/modified plus stale/orphaned transition counts', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'first captured line\n');
    const scope = scopeFor(fixture, ['a.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});

    const files = await snapshot.files();
    const file = files.find((candidate) => candidate.newPath?.utf8 === 'a.txt');
    const content = await registry.readContent(file!.id);
    const headSide = content?.head;
    if (headSide === undefined || !headSide.exists) throw new Error('Expected head-side content to exist.');
    const anchor = buildDurableAnchor({
      path: headSide.path,
      safeDisplayPath: headSide.path.display,
      side: 'head',
      blobOid: headSide.blobOid,
      line: 1,
      text: headSide.text,
    });
    const added = await registry.draftStore.mutate({
      expectedRevision: 0,
      mutation: { type: 'addComment', body: 'Checking this line.', anchor },
    });
    expect(added.kind).toBe('accepted');

    await fixture.write('a.txt', 'second refreshed line\n');
    await fixture.write('b.txt', 'brand new untracked file\n');

    const refreshResult = await registry.refresh!();
    expect(Object.keys(refreshResult)).toEqual(['added', 'removed', 'modified', 'staleCount', 'orphanedCount']);
    expect(refreshResult.modified).toContain('a.txt');
    expect(refreshResult.orphanedCount).toBe(1);
  });

  test('exportReview publishes a schemaVersion 4 document whose standalone provenance matches the captured scope, plus a Markdown "## Standalone files" section', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha export content\n');
    await fixture.write('sub/b.txt', 'beta export content\n');
    const scope = scopeFor(fixture, ['a.txt', 'sub']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});

    const session = await registry.session();
    if (!('uncommitted' in session)) throw new Error('Expected an uncommitted session response.');
    const reviewKey = session.uncommitted.reviewKey;

    const file = session.files[0]!;
    const content = await registry.readContent(file.fileId);
    const headSide = content?.head;
    if (headSide === undefined || !headSide.exists) throw new Error('Expected head-side content to exist.');
    const added = await registry.draftStore.mutate({
      expectedRevision: 0,
      mutation: {
        type: 'addComment',
        body: 'Looks correct.',
        anchor: buildDurableAnchor({
          path: headSide.path,
          safeDisplayPath: headSide.path.display,
          side: 'head',
          blobOid: headSide.blobOid,
          line: 1,
          text: headSide.text,
        }),
      },
    });
    expect(added.kind).toBe('accepted');

    const result = await registry.exportReview!({ expectedRevision: 1 });
    expect(result.kind).toBe('exported');

    const document = ReviewExportV4Schema.parse(
      JSON.parse(await readFile(join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', reviewKey, 'review.json'), 'utf8')),
    );
    expect(document.schemaVersion).toBe(4);
    expect(document.standalone.originalArguments).toEqual(['a.txt', 'sub'].sort());
    expect(document.standalone.resolvedPaths.map((path) => path.utf8).sort()).toEqual(['a.txt', 'sub/b.txt']);
    expect(document.standalone.fileDigests).toHaveLength(2);
    expect(document.standalone.reviewKey).toBe(reviewKey);

    const markdown = await readFile(join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', reviewKey, 'review.md'), 'utf8');
    expect(markdown).toContain('## Standalone files');
  });

  test('exportReview on a stale expectedRevision returns revisionConflict, mirroring the exact-patch registry', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha\n');
    const scope = scopeFor(fixture, ['a.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {});
    const summarized = await registry.draftStore.mutate({
      expectedRevision: 0,
      mutation: { type: 'setSummary', markdown: 'Frozen feedback.' },
    });
    expect(summarized.kind).toBe('accepted');

    const result = await registry.exportReview!({ expectedRevision: 5 });
    expect(result).toEqual({ kind: 'revisionConflict', expectedRevision: 5, actualRevision: 1 });
  });

  test('revealExportDirectory throws when no export has happened yet', async () => {
    const fixture = await makeFixture();
    await fixture.write('a.txt', 'alpha\n');
    const scope = scopeFor(fixture, ['a.txt']);
    const snapshot = await materializeWorktreeSnapshot(scope, { root: await makeRoot() });
    const registry = await createStandaloneCapabilityRegistry(scope, snapshot, {
      revealDraftFile: async () => {},
    });

    await expect(registry.revealExportDirectory!()).rejects.toThrow();
  });
});
