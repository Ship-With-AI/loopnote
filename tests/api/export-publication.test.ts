import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type * as Crypto from 'node:crypto';

import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return { ...actual, randomUUID: () => 'race' };
});

import { ReviewExportV1Schema, ReviewExportV2Schema } from '../../src/contracts/draft.js';
import { canonicalizeReviewExport } from '../../src/export/review-export.js';
import { renderReviewMarkdown } from '../../src/export/render-review-markdown.js';
import { publishReviewExport, recoverReviewExport } from '../../src/server/export-store.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const roots: string[] = [];
const baseOid = '1'.repeat(40);
const headOid = '2'.repeat(40);
const rangeReviewKey = 'a'.repeat(64);

async function root(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-publication-`));
  roots.push(directory);
  return directory;
}

async function readStable(repositoryRoot: string): Promise<readonly [string, string]> {
  const stable = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${baseOid}..${headOid}`);
  return Promise.all([
    readFile(join(stable, 'review.json'), 'utf8'),
    readFile(join(stable, 'review.md'), 'utf8'),
  ]);
}

function candidatePair(kind: string): Readonly<{ readonly json: Buffer; readonly markdown: Buffer }> {
  const json = Buffer.from(
    canonicalizeReviewExport(
      ReviewExportV1Schema.parse({
        schemaVersion: 1,
        kind: `${RENAME_MAP.kindPrefix}/export`,
        exportedAt: '2026-07-23T08:02:00.000Z',
        acceptedDraftRevision: 0,
        comparison: {
          selectedBase: { label: 'base', launchOid: baseOid },
          selectedHead: { label: 'head', launchOid: headOid },
          mergeBaseOid: '3'.repeat(40),
          comparisonKey: '4'.repeat(64),
        },
        drift: {
          observedAt: '2026-07-23T08:02:00.000Z',
          acknowledged: false,
          base: { launchOid: baseOid, currentOid: baseOid, status: 'unchanged' },
          head: { launchOid: headOid, currentOid: headOid, status: 'unchanged' },
        },
        summary: { markdown: kind },
        files: [],
        counts: { all: 0, openActionable: 0, openNeedsAttention: 0, resolved: 0 },
      }),
    ),
  );
  return Object.freeze({ json, markdown: Buffer.from(renderReviewMarkdown(json), 'utf8') });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

describe('literal export publication state machine', () => {
  test('allows first export through one validated candidate-to-stable rename and returns only final exact-byte receipt evidence', async () => {
    const repositoryRoot = await root();
    const pair = candidatePair('new');

    const result = await publishReviewExport({
      repositoryRoot,
      identity: { kind: 'interactive', baseOid, headOid },
      json: pair.json,
      markdown: pair.markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    });

    expect(result.kind).toBe('exported');
    expect(await readStable(repositoryRoot)).toEqual([pair.json.toString('utf8'), pair.markdown.toString('utf8')]);
    if (result.kind === 'exported') {
      expect(result.receipt.files.map((file) => file.path)).toEqual([
        `${RENAME_MAP.repoStateDir}exports/${baseOid}..${headOid}/review.json`,
        `${RENAME_MAP.repoStateDir}exports/${baseOid}..${headOid}/review.md`,
      ]);
      expect(result.receipt.files.every((file) => /^[0-9a-f]{64}$/u.test(file.sha256))).toBe(true);
    }
  });

  test('refuses an invalid candidate before it can become the stable pair', async () => {
    const repositoryRoot = await root();

    const result = await publishReviewExport({
      repositoryRoot,
      identity: { kind: 'interactive', baseOid, headOid },
      json: Buffer.from('{"kind":"invalid"}'),
      markdown: Buffer.from('# invalid\n'),
      reExportCapability: { kind: 'reExportUnsupported' },
    });

    expect(result).toEqual({ kind: 'publicationFailed' });
  });

  test('refuses unsupported re-export before exchange or stable mutation while retaining the exact old pair', async () => {
    const repositoryRoot = await root();
    const stable = join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports', `${baseOid}..${headOid}`);
    const oldPair = candidatePair('old');
    const newPair = candidatePair('new');
    await mkdir(stable, { recursive: true });
    await writeFile(join(stable, 'review.json'), oldPair.json);
    await writeFile(join(stable, 'review.md'), oldPair.markdown);

    const result = await publishReviewExport({
      repositoryRoot,
      identity: { kind: 'interactive', baseOid, headOid },
      json: newPair.json,
      markdown: newPair.markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    });

    expect(result).toEqual({ kind: 'reExportUnsupported' });
    expect(await readStable(repositoryRoot)).toEqual([oldPair.json.toString('utf8'), oldPair.markdown.toString('utf8')]);
  });

  test.each([RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'] as const)(
    'detects %s parent replacement after candidate validation before it can rename an external candidate',
    async (managedParent) => {
      const repositoryRoot = await root();
      const outside = await root();
      const pair = candidatePair(`race ${managedParent}`);
      const stableName = `${baseOid}..${headOid}`;
      const candidateName = `.${stableName}.candidate-race`;
      const outsideExportsRoot = managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '') ? join(outside, 'exports') : outside;
      const outsideCandidate = join(outsideExportsRoot, candidateName);
      const outsideStable = join(outsideExportsRoot, stableName);
      await mkdir(outsideCandidate, { recursive: true });
      await writeFile(join(outsideCandidate, 'review.json'), pair.json);
      await writeFile(join(outsideCandidate, 'review.md'), pair.markdown);

      const result = await publishReviewExport({
        repositoryRoot,
        identity: { kind: 'interactive', baseOid, headOid },
        json: pair.json,
        markdown: pair.markdown,
        reExportCapability: { kind: 'reExportUnsupported' },
        revalidate: async () => {
          if (managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '')) {
            await rm(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')), { recursive: true });
            await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')), 'dir');
          } else {
            await rm(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'), { recursive: true });
            await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'), 'dir');
          }
          return true;
        },
      });

      expect(result).toEqual({ kind: 'publicationFailed' });
      await expect(readFile(join(outsideStable, 'review.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(Promise.all([
        readFile(join(outsideCandidate, 'review.json')),
        readFile(join(outsideCandidate, 'review.md')),
      ])).resolves.toEqual([pair.json, pair.markdown]);
    },
  );

  test.each([RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'] as const)(
    'rejects %s symlink parent for publication and recovery without touching its target',
    async (managedParent) => {
      const repositoryRoot = await root();
      const outside = await root();
      const oldPair = candidatePair(`outside ${managedParent}`);
      const stableName = `${baseOid}..${headOid}`;
      const outsideExportsRoot = managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '') ? join(outside, 'exports') : outside;
      const outsideStable = join(outsideExportsRoot, stableName);
      await mkdir(outsideStable, { recursive: true });
      await writeFile(join(outsideStable, 'review.json'), oldPair.json);
      await writeFile(join(outsideStable, 'review.md'), oldPair.markdown);
      if (managedParent === RENAME_MAP.repoStateDir.replace(/\/$/, '')) {
        await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')), 'dir');
      } else {
        await mkdir(join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, '')));
        await symlink(outside, join(repositoryRoot, RENAME_MAP.repoStateDir.replace(/\/$/, ''), 'exports'), 'dir');
      }

      await expect(publishReviewExport({
        repositoryRoot,
        identity: { kind: 'interactive', baseOid, headOid },
        json: candidatePair('new').json,
        markdown: candidatePair('new').markdown,
        reExportCapability: { kind: 'reExportUnsupported' },
      })).resolves.toEqual({ kind: 'publicationFailed' });
      await expect(recoverReviewExport(repositoryRoot, { kind: 'interactive', baseOid, headOid })).rejects.toThrow(
        'Managed export directory is not a real directory.',
      );
      await expect(Promise.all([
        readFile(join(outsideStable, 'review.json')),
        readFile(join(outsideStable, 'review.md')),
      ])).resolves.toEqual([oldPair.json, oldPair.markdown]);
    },
  );
});

  test('publishes and recovers a range export only through its server-derived review key', async () => {
    const repositoryRoot = await root();
    const interactive = candidatePair('range');
    const document = JSON.parse(interactive.json.toString('utf8'));
    const range = {
      kind: 'revisions',
      requestedBase: 'agent/base',
      requestedHead: 'agent/head',
      baseOid,
      headOid,
      pathspecs: ['src', ':(exclude)src/generated'],
      reviewKey: rangeReviewKey,
    };
    const json = Buffer.from(canonicalizeReviewExport(ReviewExportV2Schema.parse({
      ...document,
      schemaVersion: 2,
      comparison: {
        ...document.comparison,
        selectedBase: { label: range.requestedBase, launchOid: range.baseOid },
        selectedHead: { label: range.requestedHead, launchOid: range.headOid },
        mergeBaseOid: range.baseOid,
        comparisonKey: range.reviewKey,
      },
      range,
    })));
    const markdown = Buffer.from(renderReviewMarkdown(json));

    await expect(publishReviewExport({
      repositoryRoot,
      identity: { kind: 'range', reviewKey: rangeReviewKey },
      json,
      markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    })).resolves.toMatchObject({
      kind: 'exported',
      receipt: {
        files: [
          { path: `${RENAME_MAP.repoStateDir}exports/${rangeReviewKey}/review.json` },
          { path: `${RENAME_MAP.repoStateDir}exports/${rangeReviewKey}/review.md` },
        ],
      },
    });
    await expect(recoverReviewExport(repositoryRoot, { kind: 'range', reviewKey: rangeReviewKey })).resolves.toMatchObject({ json, markdown });
    const attachedScope = `agent-${'e'.repeat(32)}`;
    await expect(publishReviewExport({
      repositoryRoot,
      identity: { kind: 'range', reviewKey: rangeReviewKey },
      storageScope: attachedScope,
      json,
      markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    })).resolves.toMatchObject({
      kind: 'exported',
      receipt: {
        files: [
          { path: `${RENAME_MAP.repoStateDir}exports/${attachedScope}/review.json` },
          { path: `${RENAME_MAP.repoStateDir}exports/${attachedScope}/review.md` },
        ],
      },
    });
    await expect(recoverReviewExport(
      repositoryRoot,
      { kind: 'range', reviewKey: rangeReviewKey },
      attachedScope,
    )).resolves.toMatchObject({ json, markdown });
    await expect(publishReviewExport({
      repositoryRoot,
      identity: { kind: 'range', reviewKey: rangeReviewKey },
      storageScope: '../controlled',
      json,
      markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    })).resolves.toEqual({ kind: 'publicationFailed' });
    await expect(publishReviewExport({
      repositoryRoot,
      identity: { kind: 'range', reviewKey: `${rangeReviewKey}x` },
      json,
      markdown,
      reExportCapability: { kind: 'reExportUnsupported' },
    })).resolves.toEqual({ kind: 'publicationFailed' });
  });
