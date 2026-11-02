import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ReviewExportV1Schema } from '../../src/contracts/draft.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { canonicalizeReviewExport, parseCanonicalReviewExport } from '../../src/export/review-export.js';
import { renderReviewMarkdown } from '../../src/export/render-review-markdown.js';
import { runGeneratedExport, runGeneratedIgnoreAppend, runGeneratedRecovery, sampleGeneratedStablePair } from '../helpers/export-fault-runner.js';
import { hasObservedNativeReExport } from '../helpers/agent-ready-export-target.js';

import { afterEach, describe, expect, test } from 'vitest';

import {
  createDirtyGitFixture,
  createDirtyGitFixtureMatrix,
  type DirtyGitFixture,
} from '../helpers/git-fixture.js';
import {
  approvedGitignoreAppend,
  assertNoForbiddenProductCommands,
  assertSourceControlUnchanged,
  captureSourceControlSnapshot,
} from '../helpers/source-control-snapshot.js';

const fixtures: DirtyGitFixture[] = [];
const outsideRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  await Promise.all(outsideRoots.splice(0).map((outside) => rm(outside, { recursive: true, force: true })));
});

describe('agent-ready export source-control safety evidence', () => {
  test('records four dirty real-Git selector fixtures and permits only the exact export and consent outputs', async () => {
    const matrix = await createDirtyGitFixtureMatrix();
    fixtures.push(...matrix);

    expect(matrix.map((fixture) => fixture.selectorKind)).toEqual([
      'branch-to-branch',
      'branch-to-worktree',
      'worktree-to-branch',
      'worktree-to-worktree',
    ]);

    for (const fixture of matrix) {
      const before = await captureSourceControlSnapshot(fixture.root);
      await fixture.write(`${RENAME_MAP.repoStateDir}exports/evidence.txt`, 'generated export evidence\n');
      await expect(
        assertSourceControlUnchanged(before, await captureSourceControlSnapshot(fixture.root)),
      ).resolves.toBeUndefined();

      const originalGitignore = await readFile(fixture.gitignorePath);
      await writeFile(
        fixture.gitignorePath,
        Buffer.concat([originalGitignore, approvedGitignoreAppend]),
      );
      await expect(
        assertSourceControlUnchanged(before, await captureSourceControlSnapshot(fixture.root)),
      ).resolves.toBeUndefined();
    }
  }, 30_000);

  test('allows the generated fixed ignore capability to append only the approved suffix', async () => {
    const fixture = await createDirtyGitFixture();
    fixtures.push(fixture);
    const before = await captureSourceControlSnapshot(fixture.root);
    const original = await readFile(fixture.gitignorePath);

    await expect(runGeneratedIgnoreAppend(fixture.root)).resolves.toEqual({ kind: 'appended' });
    await expect(readFile(fixture.gitignorePath)).resolves.toEqual(Buffer.concat([original, approvedGitignoreAppend]));
    await expect(assertSourceControlUnchanged(before, await captureSourceControlSnapshot(fixture.root))).resolves.toBeUndefined();
  }, 30_000);

  test('detects each forbidden source-control mutation class independently', async () => {
    const fixture = await createDirtyGitFixture();
    fixtures.push(fixture);

    const controls: readonly [string, () => Promise<void>][] = [
      ['HEAD/ref', async () => { fixture.git(['update-ref', 'refs/heads/safety-control', 'HEAD']); }],
      ['remote', async () => { fixture.git(['remote', 'add', 'safety-control', 'https://example.invalid/control.git']); }],
      ['index', async () => { await fixture.write('index-control.txt', 'index mutation\n'); fixture.git(['add', '--', 'index-control.txt']); }],
      ['tracked source', async () => { await fixture.write('tracked.txt', 'forbidden mutation\n'); }],
      ['tracked mode', async () => { await chmod(fixture.path('tracked.txt'), 0o644); }],
      ['untracked bytes', async () => { await fixture.write('unexpected-control.bin', 'forbidden\0bytes'); }],
    ];

    for (const [label, mutate] of controls) {
      const before = await captureSourceControlSnapshot(fixture.root);
      await mutate();
      await expect(
        assertSourceControlUnchanged(before, await captureSourceControlSnapshot(fixture.root)),
        label,
      ).rejects.toThrow(label);
    }
  }, 30_000);

  test('rejects mutating Git, network, shell, repository executable, and package-script product commands', () => {
    for (const command of [
      ['git', 'add', '--', 'tracked.txt'],
      ['git', 'push', 'origin', 'feature'],
      ['git', 'fetch', 'https://example.invalid/repository.git'],
      ['sh', '-c', 'echo unsafe'],
      ['npm', 'run', 'unsafe'],
      ['.git/hooks/pre-commit'],
    ]) {
      expect(() => assertNoForbiddenProductCommands([command])).toThrow();
    }
  });
});

function candidatePair(marker: string): Readonly<{ readonly json: Buffer; readonly markdown: Buffer }> {
  const json = Buffer.from(canonicalizeReviewExport(ReviewExportV1Schema.parse({
    schemaVersion: 1,
    kind: `${RENAME_MAP.kindPrefix}/export`,
    exportedAt: '2026-07-23T00:00:00.000Z',
    acceptedDraftRevision: 1,
    comparison: {
      selectedBase: { label: 'main', launchOid: '1'.repeat(40) },
      selectedHead: { label: 'feature', launchOid: '2'.repeat(40) },
      mergeBaseOid: '1'.repeat(40),
      comparisonKey: '4'.repeat(64),
    },
    drift: {
      observedAt: '2026-07-23T00:00:00.000Z',
      acknowledged: false,
      base: { launchOid: '1'.repeat(40), currentOid: '1'.repeat(40), status: 'unchanged' },
      head: { launchOid: '2'.repeat(40), currentOid: '2'.repeat(40), status: 'unchanged' },
    },
    summary: { markdown: marker },
    files: [],
    counts: { all: 0, openActionable: 0, openNeedsAttention: 0, resolved: 0 },
  })));
  return Object.freeze({ json, markdown: Buffer.from(renderReviewMarkdown(json), 'utf8') });
}

describe('generated publication and recovery safety evidence', () => {
  test.skipIf(!hasObservedNativeReExport(process.platform, process.arch))('uses the declared native target to atomically replace one complete stable pair and recover the new bytes', async () => {
    const fixture = await createDirtyGitFixture();
    fixtures.push(fixture);
    const beforeSource = await captureSourceControlSnapshot(fixture.root);
    const oldPair = candidatePair('old stable generation');
    const newPair = candidatePair('new rejected generation');

    await expect(runGeneratedExport(fixture.root, oldPair, 'unsupported')).resolves.toMatchObject({ kind: 'exported' });
    const stable = join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${'1'.repeat(40)}..${'2'.repeat(40)}`);
    const [oldJson, oldMarkdown] = await Promise.all([readFile(join(stable, 'review.json')), readFile(join(stable, 'review.md'))]);
    const stableStat = await lstat(stable);

    await expect(runGeneratedExport(fixture.root, newPair, 'observed')).resolves.toMatchObject({ kind: 'exported' });
    await expect(sampleGeneratedStablePair(stable, 32)).resolves.toEqual(
      Array.from({ length: 32 }, () => Object.freeze({ json: newPair.json, markdown: newPair.markdown })),
    );

    await expect(Promise.all([readFile(join(stable, 'review.json')), readFile(join(stable, 'review.md'))])).resolves.toEqual([
      newPair.json,
      newPair.markdown,
    ]);
    const recovered = await runGeneratedRecovery(fixture.root);
    expect(recovered).toEqual({ json: newPair.json, markdown: newPair.markdown });

    const names = await readdir(stable);
    expect(names.sort()).toEqual(['review.json', 'review.md']);
    expect(parseCanonicalReviewExport(newPair.json)).toMatchObject({ summary: { markdown: 'new rejected generation' } });
    expect(Buffer.from(renderReviewMarkdown(newPair.json), 'utf8')).toEqual(newPair.markdown);
    expect(createHash('sha256').update(newPair.json).digest('hex')).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update(newPair.markdown).digest('hex')).toMatch(/^[0-9a-f]{64}$/);
    await expect(assertSourceControlUnchanged(beforeSource, await captureSourceControlSnapshot(fixture.root))).resolves.toBeUndefined();
  }, 30_000);

  test('leaves failed first export absent and preserves ambiguous candidate remnants on child-process restart', async () => {
    const fixture = await createDirtyGitFixture();
    fixtures.push(fixture);
    const stable = join(fixture.root, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${'1'.repeat(40)}..${'2'.repeat(40)}`);
    const invalid = Object.freeze({ json: Buffer.from('{invalid'), markdown: Buffer.from('not derived\n') });

    await expect(runGeneratedExport(fixture.root, invalid, 'unsupported')).resolves.toEqual({ kind: 'publicationFailed' });
    await expect(lstat(stable)).rejects.toMatchObject({ code: 'ENOENT' });

    const remnant = `${stable}.candidate-ambiguous`;
    await mkdir(remnant, { recursive: true });
    await writeFile(join(remnant, 'preserve-me'), 'ambiguous restart evidence\n');
    await expect(runGeneratedRecovery(fixture.root)).resolves.toBeUndefined();
    await expect(readFile(join(remnant, 'preserve-me'), 'utf8')).resolves.toBe('ambiguous restart evidence\n');
  }, 30_000);

  test.each([RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'] as const)(
    'generated publisher and recovery reject externally directed %s parent symlink',
    async (managedParent) => {
      const stateDirSegment = RENAME_MAP.repoStateDir.replace(/\/$/, '');
      const fixture = await createDirtyGitFixture();
      fixtures.push(fixture);
      const outside = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-outside-`));
      outsideRoots.push(outside);
      const stableName = `${'1'.repeat(40)}..${'2'.repeat(40)}`;
      const oldPair = candidatePair(`outside ${managedParent}`);
      const outsideExportsRoot = managedParent === stateDirSegment ? join(outside, 'exports') : outside;
      const outsideStable = join(outsideExportsRoot, stableName);
      await mkdir(outsideStable, { recursive: true });
      await writeFile(join(outsideStable, 'review.json'), oldPair.json);
      await writeFile(join(outsideStable, 'review.md'), oldPair.markdown);
      if (managedParent === stateDirSegment) {
        await symlink(outside, join(fixture.root, stateDirSegment), 'dir');
      } else {
        await mkdir(join(fixture.root, stateDirSegment));
        await symlink(outside, join(fixture.root, stateDirSegment, 'exports'), 'dir');
      }

      await expect(runGeneratedExport(fixture.root, candidatePair('new'), 'unsupported')).resolves.toEqual({
        kind: 'publicationFailed',
      });
      await expect(runGeneratedRecovery(fixture.root)).rejects.toThrow('Generated export child exited');
      await expect(Promise.all([
        readFile(join(outsideStable, 'review.json')),
        readFile(join(outsideStable, 'review.md')),
      ])).resolves.toEqual([oldPair.json, oldPair.markdown]);
    },
    30_000,
  );
});

