import { execFileSync } from 'node:child_process';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { createPinnedComparison } from '../../src/git/comparison.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createCapabilityRegistry } from '../../src/server/capabilities.js';

const roots: string[] = [];

function git(root: string, arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
  }).trim();
}

async function createFixture(): Promise<{ readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-anchor-`));
  roots.push(root);
  git(root, ['init', '--initial-branch=main']);
  git(root, ['config', 'user.name', `${RENAME_MAP.displayName} Anchor Fixture`]);
  git(root, ['config', 'user.email', 'anchor@test.invalid']);
  await writeFile(join(root, 'old-name.ts'), 'shared\nbase only\nunchanged\n');
  await writeFile(join(root, 'deleted.ts'), 'delete me\n');
  await writeFile(join(root, 'modified.ts'), 'before\nshared\n');
  git(root, ['add', '--', 'old-name.ts', 'deleted.ts', 'modified.ts']);
  git(root, ['commit', '-m', 'base']);
  git(root, ['switch', '-c', 'feature']);
  await rename(join(root, 'old-name.ts'), join(root, 'new-name.ts'));
  await rm(join(root, 'deleted.ts'));
  await writeFile(join(root, 'new-name.ts'), 'shared\nhead only\nunchanged\n');
  await writeFile(join(root, 'modified.ts'), 'after\nshared\n');
  await writeFile(join(root, 'added.ts'), 'added\n');
  git(root, ['add', '--all']);
  git(root, ['commit', '-m', 'feature']);
  return { root };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe('frozen side-specific Git content capabilities', () => {
  test('reads pinned old/base and new/head rename blobs by opaque capability after refs and worktree move', async () => {
    const fixture = await createFixture();
    const comparison = await createPinnedComparison({
      cwd: fixture.root,
      base: { label: 'main', revision: 'refs/heads/main' },
      head: { label: 'feature', revision: 'refs/heads/feature' },
    });
    const renamed = comparison.changedFiles.find((file) => file.status.kind === 'renamed');
    const deleted = comparison.changedFiles.find((file) => file.status.kind === 'deleted');
    const added = comparison.changedFiles.find((file) => file.status.kind === 'added');
    const modified = comparison.changedFiles.find((file) => file.status.kind === 'modified');
    expect(renamed).toBeDefined();
    expect(deleted).toBeDefined();
    expect(added).toBeDefined();
    expect(modified).toBeDefined();

    const registry = createCapabilityRegistry(comparison);
    git(fixture.root, ['switch', '--detach']);
    git(fixture.root, ['branch', '-f', 'feature', 'main']);
    await writeFile(join(fixture.root, 'new-name.ts'), 'worktree replacement\n');

    const renamedContent = await registry.readContent(renamed!.id);
    const deletedContent = await registry.readContent(deleted!.id);
    const addedContent = await registry.readContent(added!.id);
    const modifiedContent = await registry.readContent(modified!.id);

    expect(renamedContent).toMatchObject({
      base: {
        exists: true,
        path: renamed!.oldPath,
        blobOid: renamed!.oldBlobOid,
        text: 'shared\nbase only\nunchanged\n',
      },
      head: {
        exists: true,
        path: renamed!.newPath,
        blobOid: renamed!.newBlobOid,
        text: 'shared\nhead only\nunchanged\n',
      },
    });
    expect(deletedContent).toMatchObject({ base: { exists: true }, head: { exists: false } });
    expect(addedContent).toMatchObject({ base: { exists: false }, head: { exists: true } });
    expect(modifiedContent).toMatchObject({
      base: { text: 'before\nshared\n' },
      head: { text: 'after\nshared\n' },
    });
  });
});
