import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { buildDurableAnchor } from '../../src/domain/anchor.js';
import { comparisonKey } from '../../src/domain/comparison-key.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createDraftStore, type DraftFileSystem } from '../../src/server/draft-store.js';

const roots: string[] = [];
const comparison = {
  baseCommitOid: '1'.repeat(40),
  headCommitOid: '2'.repeat(40),
  mergeBaseOid: '3'.repeat(40),
};
const anchor = buildDurableAnchor({
  path: {
    utf8: 'src/review.ts',
    display: 'src/review.ts',
    bytesBase64url: Buffer.from('src/review.ts').toString('base64url'),
  },
  safeDisplayPath: 'src/review.ts',
  side: 'head',
  blobOid: '4'.repeat(40),
  line: 1,
  text: 'after',
});

async function root(): Promise<string> {
  const value = await fs.mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-atomic-`));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => fs.rm(path, { recursive: true, force: true })));
});

function failingFileSystem(
  failAt: 'mkdir' | 'open' | 'write' | 'sync' | 'close' | 'rename' | 'directory-sync',
): DraftFileSystem {
  const fail = (stage: typeof failAt): void => {
    if (stage === failAt) {
      throw new Error(`injected ${stage} failure`);
    }
  };

  return {
    readFile: async (path) => fs.readFile(path),
    mkdir: async (path) => {
      fail('mkdir');
      await fs.mkdir(path, { recursive: true });
    },
    open: async (path, flags, mode) => {
      fail('open');
      const handle = await fs.open(path, flags, mode);
      return {
        writeFile: async (bytes) => {
          fail('write');
          await handle.writeFile(bytes);
        },
        sync: async () => {
          fail('sync');
          await handle.sync();
        },
        close: async () => {
          fail('close');
          await handle.close();
        },
      };
    },
    rename: async (from, to) => {
      fail('rename');
      await fs.rename(from, to);
    },
    unlink: async (path) => fs.unlink(path),
    syncDirectory: async (path) => {
      fail('directory-sync');
      const directory = await fs.open(path, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    },
  };
}

describe('atomic draft persistence', () => {
  test.each(['mkdir', 'open', 'write', 'sync', 'close', 'rename', 'directory-sync'] as const)(
    'preserves prior canonical bytes and rejects acceptance when %s fails',
    async (failAt) => {
      const repositoryRoot = await root();
      const initialStore = createDraftStore({ repositoryRoot, comparison });
      expect(await initialStore.mutate({ expectedRevision: 0, mutation: { type: 'addComment', body: 'already persisted', anchor } })).toMatchObject({ kind: 'accepted' });
      const canonicalPath = join(
        repositoryRoot,
        RENAME_MAP.repoStateDir.replace(/\/$/, ''),
        'drafts',
        `${comparisonKey(comparison.baseCommitOid, comparison.headCommitOid)}.json`,
      );
      const priorBytes = await fs.readFile(canonicalPath, 'utf8');
      const nextAnchor = { ...anchor, line: 2, uniqueKey: `${anchor.uniqueKey.slice(0, -1)}0` };
      const store = createDraftStore({
        repositoryRoot,
        comparison,
        fileSystem: failingFileSystem(failAt),
      });

      await expect(
        store.mutate({ expectedRevision: 1, mutation: { type: 'addComment', body: 'This must not claim acceptance.', anchor: nextAnchor } }),
      ).resolves.toMatchObject({ kind: 'persistenceFailure' });
      const finalBytes = await fs.readFile(canonicalPath, 'utf8');
      if (failAt === 'directory-sync') {
        expect(JSON.parse(finalBytes)).toMatchObject({ revision: 2, comments: [{ body: 'already persisted' }, { body: 'This must not claim acceptance.' }] });
      } else {
        expect(finalBytes).toBe(priorBytes);
      }
    },
  );

  test('serializes same-revision additions so exactly one is accepted and the other receives the latest draft', async () => {
    const repositoryRoot = await root();
    const store = createDraftStore({ repositoryRoot, comparison });
    const anotherAnchor = { ...anchor, side: 'base' as const, uniqueKey: `${anchor.uniqueKey.slice(0, -1)}0` };

    const results = await Promise.all([
      store.mutate({ expectedRevision: 0, mutation: { type: 'addComment', body: 'first', anchor } }),
      store.mutate({ expectedRevision: 0, mutation: { type: 'addComment', body: 'second', anchor: anotherAnchor } }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(['accepted', 'revisionConflict']);
    const document = await store.load();
    expect(document).toMatchObject({ revision: 1, comments: [{ body: expect.any(String) }] });
  });
});
