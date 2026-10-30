import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { comparisonKey, rangeReviewKey, uncommittedReviewKey } from '../../src/domain/comparison-key.js';
import { createDraftLoader, draftPaths } from '../../src/server/draft-loader.js';
import { findUncommittedDraftCandidate } from '../../src/server/draft-store.js';
import type { DraftIssue } from '../../src/server/draft-loader.js';

const comparison = {
  baseCommitOid: '1'.repeat(40),
  headCommitOid: '2'.repeat(40),
  mergeBaseOid: '3'.repeat(40),
};

function rangeComparison(pathspecs: readonly string[]) {
  return {
    ...comparison,
    range: {
      kind: 'revisions' as const,
      requestedBase: 'main~1',
      requestedHead: 'main',
      baseOid: comparison.baseCommitOid,
      headOid: comparison.headCommitOid,
      pathspecs,
      reviewKey: rangeReviewKey(comparison.baseCommitOid, comparison.headCommitOid, pathspecs),
    },
  };
}
const roots: string[] = [];

async function fixture(bytes?: Buffer): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cumpa-draft-load-'));
  roots.push(root);
  if (bytes !== undefined) {
    const directory = join(root, '.cumpa', 'drafts');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${comparisonKey(comparison.baseCommitOid, comparison.headCommitOid)}.json`), bytes);
  }
  return root;
}

async function rangeFixture(scope: { readonly range: { readonly reviewKey: string } }, bytes: Buffer): Promise<string> {
  const root = await fixture();
  const directory = join(root, '.cumpa', 'drafts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${scope.range.reviewKey}.json`), bytes);
  return root;
}

function uncommittedComparison(overrides: Readonly<{
  readonly sourceKind?: 'staged' | 'unstaged' | 'worktree';
  readonly baseCommitOid?: string;
  readonly snapshotChain?: readonly string[];
  readonly reviewKey?: string;
}> = {}) {
  const sourceKind = overrides.sourceKind ?? 'staged';
  const baseCommitOid = overrides.baseCommitOid ?? '4'.repeat(40);
  const snapshotChain = overrides.snapshotChain ?? ['5'.repeat(64)];
  const reviewKey = overrides.reviewKey ?? uncommittedReviewKey(sourceKind, baseCommitOid, snapshotChain[0]!);
  return {
    kind: 'uncommitted' as const,
    sourceKind,
    baseCommitOid,
    reviewKey,
    snapshotChain,
  };
}

async function uncommittedFixture(scope: { readonly reviewKey: string }, bytes: Buffer): Promise<string> {
  const root = await fixture();
  const directory = join(root, '.cumpa', 'drafts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${scope.reviewKey}.json`), bytes);
  return root;
}

function current(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    comparison,
    revision: 0,
    summary: '',
    comments: [],
    ...overrides,
  }), 'utf8');
}

function fingerprint(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('raw draft load classification', () => {
  test('distinguishes missing and strictly current bytes without normalizing them', async () => {
    const missing = await fixture();
    await expect(createDraftLoader({ repositoryRoot: missing, comparison }).load()).resolves.toMatchObject({
      kind: 'missing',
      path: '.cumpa/drafts/' + comparisonKey(comparison.baseCommitOid, comparison.headCommitOid) + '.json',
    });

    const bytes = Buffer.from(`{\n  "comments": [], "summary": "", "revision": 0,\n  "comparison": ${JSON.stringify(comparison)}, "schemaVersion": 1\n}\n`, 'utf8');
    const root = await fixture(bytes);
    const state = await createDraftLoader({ repositoryRoot: root, comparison }).load();
    expect(state).toMatchObject({ kind: 'current', draft: { revision: 0, comments: [] } });
    if (state.kind !== 'current') {
      throw new Error('Expected current draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
    expect(state.raw.length).toBe(bytes.length);
    expect(fingerprint(state.raw)).toBe(fingerprint(bytes));
  });

  test('treats the legacy namespace as ordinary repository content', async () => {
    const root = await fixture();
    const legacyNamespace = String.fromCharCode(99, 111, 109, 112, 97, 114, 101);
    const directory = join(root, `.${legacyNamespace}`, 'drafts');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${comparisonKey(comparison.baseCommitOid, comparison.headCommitOid)}.json`), current());

    await expect(createDraftLoader({ repositoryRoot: root, comparison }).load()).resolves.toMatchObject({
      kind: 'missing',
      path: `.cumpa/drafts/${comparisonKey(comparison.baseCommitOid, comparison.headCommitOid)}.json`,
    });
  });

  test('keys exact ordered range scopes independently and resumes matching provenance', async () => {
    const first = rangeComparison(['src', ':(exclude)src/generated']);
    const reordered = rangeComparison([':(exclude)src/generated', 'src']);
    const same = rangeComparison(['src', ':(exclude)src/generated']);

    expect(draftPaths('/repository', first)).toMatchObject({
      key: first.range.reviewKey,
      relativePath: `.cumpa/drafts/${first.range.reviewKey}.json`,
    });
    expect(draftPaths('/repository', first)).not.toEqual(draftPaths('/repository', reordered));
    expect(draftPaths('/repository', first)).toEqual(draftPaths('/repository', same));

    const bytes = current({ comparison: first });
    const state = await createDraftLoader({
      repositoryRoot: await rangeFixture(first, bytes),
      comparison: first,
    }).load();
    expect(state).toMatchObject({ kind: 'current', draft: { comparison: first } });
  });

  test.each([
    ['missing', comparison],
    ['partial', { ...rangeComparison(['src']), range: { kind: 'revisions' } }],
    ['mismatched', { ...rangeComparison(['src']), range: { ...rangeComparison(['src']).range, pathspecs: ['test'] } }],
    ['reordered', rangeComparison([':(exclude)src/generated', 'src'])],
    ['malformed key', { ...rangeComparison(['src']), range: { ...rangeComparison(['src']).range, reviewKey: 'not-a-key' } }],
    ['unknown', { ...rangeComparison(['src']), range: { ...rangeComparison(['src']).range, unknown: true } }],
  ])('rejects %s range provenance without changing canonical bytes', async (_label, persistedComparison) => {
    const expected = rangeComparison(['src']);
    const bytes = current({ comparison: persistedComparison });
    const root = await rangeFixture(expected, bytes);
    const state = await createDraftLoader({ repositoryRoot: root, comparison: expected }).load();

    expect(state).toMatchObject({ kind: 'schemaInvalid', fingerprint: fingerprint(bytes) });
    if (state.kind !== 'schemaInvalid') {
      throw new Error('Expected schema-invalid draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
  });

  test('keeps malformed bytes intact and fingerprints the original buffer', async () => {
    const bytes = Buffer.from('{"schemaVersion":1,\n\xff', 'binary');
    const state = await createDraftLoader({ repositoryRoot: await fixture(bytes), comparison }).load();
    expect(state).toMatchObject({ kind: 'malformed', fingerprint: fingerprint(bytes) });
    if (state.kind !== 'malformed') {
      throw new Error('Expected malformed draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
    expect(state.raw.length).toBe(bytes.length);
    expect(state.detail.message.length).toBeLessThanOrEqual(160);
  });

  test.each([
    ['absent version', Buffer.from(JSON.stringify({ comparison, revision: 0, summary: '', comments: [] }))],
    ['noninteger version', current({ schemaVersion: 1.5 })],
    ['nonpositive version', current({ schemaVersion: 0 })],
    ['invalid current shape', current({ unknown: true })],
  ])('classifies %s as schema-invalid without altering bytes', async (_label, bytes) => {
    const state = await createDraftLoader({ repositoryRoot: await fixture(bytes), comparison }).load();
    expect(state).toMatchObject({ kind: 'schemaInvalid', fingerprint: fingerprint(bytes) });
    if (state.kind !== 'schemaInvalid') {
      throw new Error('Expected schema-invalid draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
    expect(state.details.length).toBeGreaterThan(0);
    expect(state.details.length).toBeLessThanOrEqual(8);
    expect(state.details.every((detail: DraftIssue) => detail.message.length <= 160 && detail.path.length <= 160)).toBe(true);
  });

  test('recognizes a greater schema version before strict current parsing and retains raw bytes', async () => {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 2, futureOnly: { preserve: ['all', 'unknown', 'fields'] } }), 'utf8');
    const state = await createDraftLoader({ repositoryRoot: await fixture(bytes), comparison }).load();
    expect(state).toMatchObject({ kind: 'newerUnsupported', foundVersion: 2, supportedVersion: 1 });
    if (state.kind !== 'newerUnsupported') {
      throw new Error('Expected newer unsupported draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
    expect('fingerprint' in state).toBe(false);
  });
});

describe('uncommitted comparison provenance', () => {
  test('loads current when a persisted uncommitted comparison matches every requested field', async () => {
    const expected = uncommittedComparison();
    const bytes = current({ comparison: expected });
    const root = await uncommittedFixture(expected, bytes);
    const state = await createDraftLoader({ repositoryRoot: root, comparison: expected }).load();
    expect(state).toMatchObject({ kind: 'current', draft: { comparison: expected } });
  });

  test('rejects an uncommitted comparison differing only in reviewKey without changing canonical bytes', async () => {
    const expected = uncommittedComparison();
    const differentChain = ['6'.repeat(64)];
    const persisted = uncommittedComparison({
      snapshotChain: differentChain,
      reviewKey: uncommittedReviewKey(expected.sourceKind, expected.baseCommitOid, differentChain[0]!),
    });
    const bytes = current({ comparison: persisted });
    const root = await uncommittedFixture(expected, bytes);
    const state = await createDraftLoader({ repositoryRoot: root, comparison: expected }).load();

    expect(state).toMatchObject({ kind: 'schemaInvalid', fingerprint: fingerprint(bytes) });
    if (state.kind !== 'schemaInvalid') {
      throw new Error('Expected schema-invalid draft state');
    }
    expect(state.raw.equals(bytes)).toBe(true);
  });

  test('rejects an exact-patch-shaped persisted comparison against a requested uncommitted comparison without throwing', async () => {
    const expected = uncommittedComparison();
    const persisted = {
      kind: 'exact-patch' as const,
      digest: '7'.repeat(64),
      validationTarget: { kind: 'repository' as const },
      reviewKey: expected.reviewKey,
    };
    const bytes = current({ comparison: persisted });
    const root = await uncommittedFixture(expected, bytes);
    const state = await createDraftLoader({ repositoryRoot: root, comparison: expected }).load();

    expect(state).toMatchObject({ kind: 'schemaInvalid', fingerprint: fingerprint(bytes) });
  });
});

describe('findUncommittedDraftCandidate', () => {
  test('finds only the draft matching sourceKind and baseCommitOid via a bounded scan', async () => {
    const root = await fixture();
    const directory = join(root, '.cumpa', 'drafts');
    await mkdir(directory, { recursive: true });
    const baseCommitOid = '8'.repeat(40);

    const matching = uncommittedComparison({ sourceKind: 'staged', baseCommitOid, snapshotChain: ['9'.repeat(64)] });
    await writeFile(join(directory, `${matching.reviewKey}.json`), current({ comparison: matching }));

    const differentSourceKind = uncommittedComparison({ sourceKind: 'worktree', baseCommitOid, snapshotChain: ['a'.repeat(64)] });
    await writeFile(join(directory, `${differentSourceKind.reviewKey}.json`), current({ comparison: differentSourceKind }));

    const exactPatch = {
      kind: 'exact-patch' as const,
      digest: 'b'.repeat(64),
      validationTarget: { kind: 'repository' as const },
      reviewKey: 'c'.repeat(64),
    };
    await writeFile(join(directory, `${exactPatch.reviewKey}.json`), current({ comparison: exactPatch }));

    const candidate = await findUncommittedDraftCandidate(root, 'staged', baseCommitOid);
    expect(candidate).toEqual({ reviewKey: matching.reviewKey, path: join(directory, `${matching.reviewKey}.json`) });
  });

  test('returns undefined when no stored draft matches the requested source and base', async () => {
    const root = await fixture();
    const candidate = await findUncommittedDraftCandidate(root, 'unstaged', undefined);
    expect(candidate).toBeUndefined();
  });
});
