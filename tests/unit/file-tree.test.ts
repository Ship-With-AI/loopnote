import { describe, expect, it } from 'vitest';

import type { SessionFile } from '../../src/contracts/api.js';
import {
  buildFileTree,
  type FileTreeDirectory,
  type FileTreeLeaf,
  type FileTreeNode,
} from '../../src/domain/file-tree.js';
import { createExactPath, type ExactPath } from '../../src/domain/path-bytes.js';
import {
  createFileTreeModel,
  fileTypeMarkFor,
  highlightMatches,
  type FileTreeModel,
  type VisibleFileTreeDirectory,
  type VisibleFileTreeRow,
} from '../../src/web/model/file-tree.js';

const encoder = new TextEncoder();
const idCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function exactPath(value: string | readonly number[]): ExactPath {
  return createExactPath(
    typeof value === 'string' ? encoder.encode(value) : Uint8Array.from(value),
  );
}

function fileId(index: number): string {
  const character = idCharacters[index];
  if (character === undefined) {
    throw new Error(`No test file ID character for index ${index}`);
  }
  return `file_${character.repeat(43)}`;
}

function sessionFile(
  index: number,
  options: {
    readonly kind?: SessionFile['status']['kind'];
    readonly oldPath?: ExactPath;
    readonly newPath?: ExactPath;
    readonly similarity?: number;
  },
): SessionFile {
  return Object.freeze({
    fileId: fileId(index),
    status: Object.freeze({
      kind: options.kind ?? 'modified',
      ...(options.similarity === undefined
        ? {}
        : { similarity: options.similarity }),
    }),
    oldMode: (options.kind ?? 'modified') === 'added' ? '000000' : '100644',
    ...(options.oldPath === undefined ? {} : { oldPath: options.oldPath }),
    ...(options.newPath === undefined ? {} : { newPath: options.newPath }),
    additions: 1,
    deletions: 1,
    availability: Object.freeze({ kind: 'text' as const }),
  });
}

function leaves(nodes: readonly FileTreeNode[]): readonly FileTreeLeaf[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node] : leaves(node.children),
  );
}
function fileDescendantCount(nodes: readonly FileTreeNode[]): number {
  return nodes.reduce(
    (count, node) =>
      count + (node.kind === 'file' ? 1 : fileDescendantCount(node.children)),
    0,
  );
}


function directory(
  nodes: readonly FileTreeNode[],
  firstSegment: string,
): FileTreeDirectory {
  const match = nodes.find(
    (node): node is FileTreeDirectory =>
      node.kind === 'directory' && node.segments[0]?.utf8 === firstSegment,
  );
  if (match === undefined) {
    throw new Error(`Missing directory ${firstSegment}`);
  }
  return match;
}

function row(
  model: FileTreeModel,
  predicate: (candidate: VisibleFileTreeRow) => boolean,
): VisibleFileTreeRow {
  const match = model.visibleRows.find(predicate);
  if (match === undefined) {
    throw new Error('Missing visible row');
  }
  return match;
}

describe('buildFileTree', () => {
  it('orders additions, deletions, renames, copies, and mode-only records by their effective exact path', () => {
    const deletedPath = exactPath('src/z-deleted.ts');
    const addedPath = exactPath('src/a-added.ts');
    const renameOldPath = exactPath('legacy/name.ts');
    const renameNewPath = exactPath('src/m-renamed.ts');
    const copyOldPath = exactPath('templates/source.ts');
    const copyNewPath = exactPath('src/n-copied.ts');
    const modePath = exactPath('src/mode-only.sh');
    const rootBeforeDirectoryPath = exactPath('src-early.ts');

    const input = Object.freeze([
      sessionFile(0, { kind: 'deleted', oldPath: deletedPath }),
      sessionFile(1, { kind: 'added', newPath: addedPath }),
      sessionFile(2, {
        kind: 'renamed',
        oldPath: renameOldPath,
        newPath: renameNewPath,
        similarity: 91,
      }),
      sessionFile(3, {
        kind: 'copied',
        oldPath: copyOldPath,
        newPath: copyNewPath,
        similarity: 100,
      }),
      sessionFile(4, {
        kind: 'modified',
        oldPath: modePath,
        newPath: modePath,
      }),
      sessionFile(11, {
        kind: 'modified',
        oldPath: rootBeforeDirectoryPath,
        newPath: rootBeforeDirectoryPath,
      }),
    ]);

    const tree = buildFileTree(input);
    const projectedLeaves = leaves(tree);

    expect(projectedLeaves.map((leaf) => leaf.fileId)).toEqual([
      fileId(11),
      fileId(1),
      fileId(2),
      fileId(4),
      fileId(3),
      fileId(0),
    ]);
    expect(projectedLeaves.map((leaf) => leaf.effectivePath)).toEqual([
      rootBeforeDirectoryPath,
      addedPath,
      renameNewPath,
      modePath,
      copyNewPath,
      deletedPath,
    ]);
    for (const leaf of projectedLeaves) {
      expect(leaf.file).toBe(input.find((file) => file.fileId === leaf.fileId));
    }
    expect(input.map((file) => file.fileId)).toEqual([
      fileId(0),
      fileId(1),
      fileId(2),
      fileId(3),
      fileId(4),
      fileId(11),
    ]);
  });

  it('uses exact old-path bytes as the tie break and keeps duplicate or display-colliding records distinct', () => {
    const sameNewPath = exactPath('dest/same.ts');
    const oldB = exactPath('source/b.ts');
    const oldA = exactPath('source/a.ts');
    const invalid80 = exactPath([0x80]);
    const invalid81 = exactPath([0x81]);
    const duplicateOld = exactPath('source/duplicate.ts');
    const duplicateNew = exactPath('dest/duplicate.ts');

    expect(invalid80.display).toBe(invalid81.display);

    const input = [
      sessionFile(5, {
        kind: 'copied',
        oldPath: oldB,
        newPath: sameNewPath,
      }),
      sessionFile(6, {
        kind: 'copied',
        oldPath: oldA,
        newPath: sameNewPath,
      }),
      sessionFile(7, { kind: 'added', newPath: invalid81 }),
      sessionFile(8, { kind: 'added', newPath: invalid80 }),
      sessionFile(10, {
        kind: 'renamed',
        oldPath: duplicateOld,
        newPath: duplicateNew,
      }),
      sessionFile(9, {
        kind: 'renamed',
        oldPath: duplicateOld,
        newPath: duplicateNew,
      }),
    ] as const;

    const projectedLeaves = leaves(buildFileTree(input));

    expect(projectedLeaves.map((leaf) => leaf.fileId)).toEqual([
      fileId(9),
      fileId(10),
      fileId(6),
      fileId(5),
      fileId(8),
      fileId(7),
    ]);
    expect(projectedLeaves[0]?.file.oldPath).toBe(duplicateOld);
    expect(projectedLeaves[0]?.file.newPath).toBe(duplicateNew);
    expect(projectedLeaves[1]?.file.oldPath).toBe(duplicateOld);
    expect(projectedLeaves[1]?.file.newPath).toBe(duplicateNew);
    expect(projectedLeaves[4]?.effectivePath).toBe(invalid80);
    expect(projectedLeaves[5]?.effectivePath).toBe(invalid81);
  });

  it('preserves path bytes through unusual directory segments and compacts only single-directory/no-file chains', () => {
    const tree = buildFileTree([
      sessionFile(0, {
        newPath: exactPath('deep/one/two/leaf.ts'),
        oldPath: exactPath('deep/one/two/leaf.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('mixed/root.ts'),
        oldPath: exactPath('mixed/root.ts'),
      }),
      sessionFile(2, {
        newPath: exactPath('mixed/only/chain/leaf.ts'),
        oldPath: exactPath('mixed/only/chain/leaf.ts'),
      }),
      sessionFile(3, {
        newPath: exactPath('branched/left/leaf.ts'),
        oldPath: exactPath('branched/left/leaf.ts'),
      }),
      sessionFile(4, {
        newPath: exactPath('branched/right/leaf.ts'),
        oldPath: exactPath('branched/right/leaf.ts'),
      }),
      sessionFile(5, {
        kind: 'added',
        newPath: exactPath([0x63, 0x74, 0x72, 0x6c, 0x0a, 0x64, 0x69, 0x72, 0x2f, 0x2d, 0x09, 0x66]),
      }),
    ]);

    const deep = directory(tree, 'deep');
    expect(deep.segments.map((segment) => segment.utf8)).toEqual([
      'deep',
      'one',
      'two',
    ]);
    expect(deep.path.utf8).toBe('deep/one/two');

    const mixed = directory(tree, 'mixed');
    expect(mixed.segments.map((segment) => segment.utf8)).toEqual(['mixed']);
    expect(mixed.children.map((child) => child.kind)).toEqual([
      'directory',
      'file',
    ]);
    const only = directory(mixed.children, 'only');
    expect(only.segments.map((segment) => segment.utf8)).toEqual([
      'only',
      'chain',
    ]);

    const branched = directory(tree, 'branched');
    expect(branched.segments.map((segment) => segment.utf8)).toEqual([
      'branched',
    ]);
    expect(
      branched.children.map((child) =>
        child.kind === 'directory' ? child.segments[0]?.utf8 : child.fileId,
      ),
    ).toEqual(['left', 'right']);

    const controlDirectory = tree.find(
      (node): node is FileTreeDirectory =>
        node.kind === 'directory' && node.path.display === 'ctrl\\ndir',
    );
    expect(controlDirectory?.path.bytesBase64url).toBe(
      exactPath('ctrl\ndir').bytesBase64url,
    );
    expect(leaves(controlDirectory?.children ?? [])[0]?.effectivePath.bytesBase64url).toBe(
      exactPath([0x63, 0x74, 0x72, 0x6c, 0x0a, 0x64, 0x69, 0x72, 0x2f, 0x2d, 0x09, 0x66]).bytesBase64url,
    );
  });

  it('returns a frozen empty projection for an empty comparison', () => {
    const tree = buildFileTree([]);

    expect(tree).toEqual([]);
    expect(Object.isFrozen(tree)).toBe(true);
  });
});

describe('createFileTreeModel', () => {
  function navigationFiles(): readonly SessionFile[] {
    return [
      sessionFile(0, {
        newPath: exactPath('a/one.ts'),
        oldPath: exactPath('a/one.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('a/sub/two.ts'),
        oldPath: exactPath('a/sub/two.ts'),
      }),
      sessionFile(2, {
        newPath: exactPath('z.ts'),
        oldPath: exactPath('z.ts'),
      }),
    ];
  }

  it('starts fully expanded with the first deterministic leaf focused and selected', () => {
    const model = createFileTreeModel(navigationFiles());
    const firstLeaf = model.visibleRows.find((candidate) => candidate.kind === 'file');

    expect(model.visibleRows.map((candidate) => [candidate.kind, candidate.depth])).toEqual([
      ['directory', 0],
      ['file', 1],
      ['directory', 1],
      ['file', 2],
      ['file', 0],
    ]);
    expect(firstLeaf?.kind).toBe('file');
    expect(model.focusedRowId).toBe(firstLeaf?.rowId);
    expect(model.selectedFileId).toBe(fileId(0));
    expect(model.expandedDirectoryIds).toHaveLength(2);
  });

  it('expands, collapses, and enters children without replacing file selection with a directory', () => {
    const initial = createFileTreeModel(navigationFiles());
    const aDirectory = row(
      initial,
      (candidate) =>
        candidate.kind === 'directory' && candidate.path.utf8 === 'a',
    );
    if (aDirectory.kind !== 'directory') {
      throw new Error('Expected directory row');
    }

    const focusedDirectory = initial.focusRow(aDirectory.rowId);
    expect(focusedDirectory.selectedFileId).toBe(fileId(0));

    const collapsed = focusedDirectory.handleKey('ArrowLeft');
    expect(collapsed.visibleRows.map((candidate) => candidate.kind)).toEqual([
      'directory',
      'file',
    ]);
    expect(collapsed.focusedRowId).toBe(aDirectory.rowId);
    expect(collapsed.selectedFileId).toBe(fileId(0));
    expect(focusedDirectory.visibleRows).toHaveLength(5);

    const expanded = collapsed.handleKey('ArrowRight');
    expect(expanded.visibleRows).toHaveLength(5);
    expect(expanded.focusedRowId).toBe(aDirectory.rowId);
    expect(expanded.selectedFileId).toBe(fileId(0));

    const entered = expanded.handleKey('ArrowRight');
    expect(entered.focusedRowId).toBe(
      entered.visibleRows.find(
        (candidate) =>
          candidate.kind === 'file' && candidate.fileId === fileId(0),
      )?.rowId,
    );
    expect(entered.selectedFileId).toBe(fileId(0));
  });

  it('moves the tabbable row to a visible selected file', () => {
    const selected = createFileTreeModel(navigationFiles()).selectFile(fileId(2));

    expect(selected.selectedFileId).toBe(fileId(2));
    expect(selected.focusedRowId).toBe(
      row(
        selected,
        (candidate) =>
          candidate.kind === 'file' && candidate.fileId === fileId(2),
      ).rowId,
    );
  });

  it('keeps keyboard navigation focused on a visible row when selecting a hidden file', () => {
    const initial = createFileTreeModel(navigationFiles());
    const aDirectory = row(
      initial,
      (candidate) =>
        candidate.kind === 'directory' && candidate.path.utf8 === 'a',
    );
    if (aDirectory.kind !== 'directory') {
      throw new Error('Expected directory row');
    }

    const collapsed = initial
      .focusRow(aDirectory.rowId)
      .handleKey('ArrowLeft')
      .selectFile(fileId(1));

    expect(collapsed.selectedFileId).toBe(fileId(1));
    expect(collapsed.focusedRowId).toBe(aDirectory.rowId);
    expect(collapsed.handleKey('ArrowDown').focusedRowId).not.toBe(
      aDirectory.rowId,
    );
  });

  it('applies Arrow, Home, End, Enter, and Space transitions over visible rows with roving file selection', () => {
    const initial = createFileTreeModel(navigationFiles());

    const downToDirectory = initial.handleKey('ArrowDown');
    expect(
      row(
        downToDirectory,
        (candidate) => candidate.rowId === downToDirectory.focusedRowId,
      ).kind,
    ).toBe('directory');
    expect(downToDirectory.selectedFileId).toBe(fileId(0));

    const collapsedNestedDirectory = downToDirectory.handleKey('ArrowLeft');
    expect(collapsedNestedDirectory.visibleRows).toHaveLength(4);
    expect(collapsedNestedDirectory.selectedFileId).toBe(fileId(0));
    const parentDirectory =
      collapsedNestedDirectory.handleKey('ArrowLeft');
    expect(
      row(
        parentDirectory,
        (candidate) => candidate.rowId === parentDirectory.focusedRowId,
      ).kind,
    ).toBe('directory');
    expect(parentDirectory.selectedFileId).toBe(fileId(0));
    const reexpandedNestedDirectory =
      collapsedNestedDirectory.handleKey('ArrowRight');
    expect(reexpandedNestedDirectory.visibleRows).toHaveLength(5);
    expect(reexpandedNestedDirectory.selectedFileId).toBe(fileId(0));

    const downToNestedFile = downToDirectory.handleKey('ArrowDown');
    expect(downToNestedFile.selectedFileId).toBe(fileId(1));

    const end = downToNestedFile.handleKey('End');
    expect(end.selectedFileId).toBe(fileId(2));

    const up = end.handleKey('ArrowUp');
    expect(up.selectedFileId).toBe(fileId(1));

    const home = end.handleKey('Home');
    expect(
      row(home, (candidate) => candidate.rowId === home.focusedRowId).kind,
    ).toBe('directory');
    expect(home.selectedFileId).toBe(fileId(2));

    const enteredFirstChild = home.handleKey('ArrowRight');
    expect(enteredFirstChild.selectedFileId).toBe(fileId(0));

    const parent = enteredFirstChild.handleKey('ArrowLeft');
    expect(
      row(parent, (candidate) => candidate.rowId === parent.focusedRowId).kind,
    ).toBe('directory');
    expect(parent.selectedFileId).toBe(fileId(0));

    const collapsedByEnter = parent.handleKey('Enter');
    expect(collapsedByEnter.visibleRows).toHaveLength(2);
    expect(collapsedByEnter.selectedFileId).toBe(fileId(0));

    const expandedBySpace = collapsedByEnter.handleKey(' ');
    expect(expandedBySpace.visibleRows).toHaveLength(5);
    expect(expandedBySpace.selectedFileId).toBe(fileId(0));
  });

  it('selects display-colliding leaves only by row and opaque file identity', () => {
    const firstPath = exactPath([0x80]);
    const secondPath = exactPath([0x81]);
    const model = createFileTreeModel([
      sessionFile(0, { kind: 'added', newPath: secondPath }),
      sessionFile(1, { kind: 'added', newPath: firstPath }),
    ]);
    const secondRow = row(
      model,
      (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(0),
    );

    expect(firstPath.display).toBe(secondPath.display);
    const focused = model.focusRow(secondRow.rowId);
    expect(focused.selectedFileId).toBe(fileId(0));
    expect(
      focused.visibleRows
        .filter((candidate) => candidate.kind === 'file')
        .map((candidate) => candidate.fileId),
    ).toEqual([fileId(1), fileId(0)]);
  });

  it('is a total no-op navigation model for an empty tree', () => {
    const model = createFileTreeModel([]);

    expect(model.visibleRows).toEqual([]);
    expect(model.expandedDirectoryIds).toEqual([]);
    expect(model.focusedRowId).toBeNull();
    expect(model.selectedFileId).toBeNull();
    expect(model.handleKey('ArrowDown')).toBe(model);
    expect(model.handleKey('Home')).toBe(model);
    expect(model.focusRow('missing-row')).toBe(model);
    expect(model.toggleDirectory('missing-directory')).toBe(model);
  });
  function filterFiles(): readonly SessionFile[] {
    return [
      sessionFile(0, {
        newPath: exactPath('parent/branch/filter-zone/alpha.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('parent/branch/filter-zone/beta.ts'),
      }),
      sessionFile(2, {
        newPath: exactPath('docs/guides/guide.ts'),
      }),
      sessionFile(3, {
        newPath: exactPath('other.ts'),
      }),
      sessionFile(4, {
        kind: 'added',
        newPath: exactPath([0x80]),
      }),
      sessionFile(5, {
        kind: 'added',
        newPath: exactPath([0x81]),
      }),
    ];
  }

  it('matches full display paths case-insensitively', () => {
    const model = createFileTreeModel(filterFiles());
    const lowerCase = model.setQuery('filter-zone');
    const upperCase = model.setQuery('FILTER-ZONE');

    expect(
      lowerCase.visibleRows
        .filter((candidate) => candidate.kind === 'file')
        .map((candidate) => candidate.fileId),
    ).toEqual([fileId(0), fileId(1)]);
    expect(upperCase.visibleRows.map((candidate) => candidate.rowId)).toEqual(
      lowerCase.visibleRows.map((candidate) => candidate.rowId),
    );
  });

  it('preserves surviving directory identity and segments while filtering', () => {
    const model = createFileTreeModel(filterFiles());
    const original = directory(model.tree, 'parent');
    const projected = directory(model.setQuery('alpha').projectedTree, 'parent');

    expect(projected.directoryId).toBe(original.directoryId);
    expect(projected.segments).toEqual(original.segments);
  });

  it('force-expands matching ancestors without changing reviewer expansion', () => {
    const model = createFileTreeModel(filterFiles()).toggleDirectory(
      directory(createFileTreeModel(filterFiles()).tree, 'parent').directoryId,
    );
    const filtered = model.setQuery('alpha');

    expect(filtered.expandedDirectoryIds).toEqual(model.expandedDirectoryIds);
    expect(filtered.displayExpandedDirectoryIds).toContain(
      directory(model.tree, 'parent').directoryId,
    );
    expect(
      filtered.visibleRows.some(
        (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(0),
      ),
    ).toBe(true);
  });

  it('restores the reviewer collapse made during filtering', () => {
    const model = createFileTreeModel(filterFiles());
    const target = directory(model.tree, 'parent');
    const rowsBeforeFilter = model.visibleRows;
    const targetIndex = rowsBeforeFilter.findIndex(
      (candidate) => candidate.rowId === `directory:${target.directoryId}`,
    );
    const expectedRowIds = rowsBeforeFilter
      .filter(
        (candidate, index) =>
          index <= targetIndex || candidate.depth <= rowsBeforeFilter[targetIndex]!.depth,
      )
      .map((candidate) => candidate.rowId);

    const restored = model
      .setQuery('alpha')
      .toggleDirectory(target.directoryId)
      .setQuery('');

    expect(restored.visibleRows.map((candidate) => candidate.rowId)).toEqual(
      expectedRowIds,
    );
  });

  it('keeps selection and removes the tab stop when a query has no matches', () => {
    const model = createFileTreeModel(filterFiles()).selectFile(fileId(1));
    const filtered = model.setQuery('no-match');

    expect(filtered.visibleRows).toEqual([]);
    expect(filtered.selectedFileId).toBe(fileId(1));
    expect(filtered.tabbableRowId).toBeNull();
  });

  it('preserves filtered leaf order and display-colliding identities', () => {
    const model = createFileTreeModel(filterFiles());
    const collisionQuery = exactPath([0x80]).display;
    const filtered = model.setQuery(collisionQuery);

    expect(
      filtered.visibleRows
        .filter((candidate) => candidate.kind === 'file')
        .map((candidate) => candidate.fileId),
    ).toEqual([fileId(4), fileId(5)]);
  });

  it('prefers the visible selected row as the tab stop over focus', () => {
    const model = createFileTreeModel(navigationFiles()).selectFile(fileId(1));
    const selected = row(
      model,
      (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(1),
    );
    const focusedElsewhere = model.focusRow(model.visibleRows[0]!.rowId);

    expect(model.tabbableRowId).toBe(selected.rowId);
    expect(focusedElsewhere.tabbableRowId).toBe(selected.rowId);
  });

  it('keeps only surviving descendants in projected directories', () => {
    const model = createFileTreeModel(filterFiles());
    const filtered = model.setQuery('alpha');

    expect(fileDescendantCount(directory(model.projectedTree, 'parent').children)).toBe(
      2,
    );
    expect(
      fileDescendantCount(directory(filtered.projectedTree, 'parent').children),
    ).toBe(1);
  });

  it('preserves selection, focus, and expansion while setting a query', () => {
    const model = createFileTreeModel(filterFiles())
      .selectFile(fileId(1))
      .focusRow(`directory:${directory(createFileTreeModel(filterFiles()).tree, 'parent').directoryId}`);
    const filtered = model.setQuery('alpha');
    const whitespace = filtered.setQuery('   ');

    expect(filtered.selectedFileId).toBe(model.selectedFileId);
    expect(filtered.focusedRowId).toBe(model.focusedRowId);
    expect(filtered.expandedDirectoryIds).toEqual(model.expandedDirectoryIds);
    expect(whitespace.projectedTree).toBe(model.tree);
  });

  it('honours collapsing and expanding a surviving directory while filtering', () => {
    const model = createFileTreeModel(filterFiles());
    const target = directory(model.tree, 'parent');
    const filtered = model.setQuery('alpha');
    const collapsed = filtered.toggleDirectory(target.directoryId);
    const expanded = collapsed.toggleDirectory(target.directoryId);

    expect(collapsed.projectedTree).not.toEqual([]);
    expect(collapsed.displayExpandedDirectoryIds).not.toContain(target.directoryId);
    expect(
      collapsed.visibleRows.some(
        (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(0),
      ),
    ).toBe(false);
    expect(expanded.displayExpandedDirectoryIds).toContain(target.directoryId);
    expect(
      expanded.visibleRows.some(
        (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(0),
      ),
    ).toBe(true);
  });
  it('reconciles opaque selection, focus, expansion, and query across file replacement', () => {
    const initial = createFileTreeModel(filterFiles());
    const parent = directory(initial.tree, 'parent');
    const docs = directory(initial.tree, 'docs');
    const current = initial
      .selectFile(fileId(1))
      .toggleDirectory(docs.directoryId)
      .focusRow(`directory:${parent.directoryId}`)
      .setQuery('filter-zone');
    const replacement = [
      ...filterFiles(),
      sessionFile(6, { newPath: exactPath('new/new.ts') }),
    ];

    const replaced = current.replaceFiles(replacement);

    expect(replaced.selectedFileId).toBe(fileId(1));
    expect(replaced.focusedRowId).toBe(`directory:${parent.directoryId}`);
    expect(replaced.expandedDirectoryIds).not.toContain(docs.directoryId);
    expect(replaced.visibleRows.map((candidate) => candidate.rowId)).toEqual(
      current.visibleRows.map((candidate) => candidate.rowId),
    );
    expect(replaced.tabbableRowId).toBe(`file:${fileId(1)}`);
  });
  it('derives filtered directory expansion and descendant counts once', () => {
    const deepPath = [
      ...Array.from({ length: 30 }, (_, index) => `level-${index}`),
      'leaf.ts',
    ].join('/');
    const model = createFileTreeModel([
      sessionFile(0, { newPath: exactPath(deepPath) }),
    ]).setQuery('leaf.ts');
    const directories = model.visibleRows.filter(
      (candidate): candidate is VisibleFileTreeDirectory =>
        candidate.kind === 'directory',
    );

    expect(model.effectiveExpandedDirectoryIds).toBeInstanceOf(Set);
    expect(model.directoryDescendantCounts.size).toBe(directories.length);
    expect(
      directories.every(
        (directory) =>
          model.effectiveExpandedDirectoryIds.has(directory.directoryId) &&
          model.directoryDescendantCounts.get(directory.directoryId) === 1,
      ),
    ).toBe(true);
  });
});

describe('statusPriorityByDirectoryId', () => {
  it('resolves the winner to deleted when a directory holds a deleted file and an added file', () => {
    const model = createFileTreeModel([
      sessionFile(0, { kind: 'deleted', oldPath: exactPath('dir/deleted.ts') }),
      sessionFile(1, { kind: 'added', newPath: exactPath('dir/added.ts') }),
    ]);
    const dir = directory(model.tree, 'dir');

    expect(model.statusPriorityByDirectoryId.get(dir.directoryId)).toBe('deleted');
  });

  it('resolves the winner to modified once a modified file joins the same directory', () => {
    const model = createFileTreeModel([
      sessionFile(0, { kind: 'deleted', oldPath: exactPath('dir/deleted.ts') }),
      sessionFile(1, { kind: 'added', newPath: exactPath('dir/added.ts') }),
      sessionFile(2, {
        newPath: exactPath('dir/modified.ts'),
        oldPath: exactPath('dir/modified.ts'),
      }),
    ]);
    const dir = directory(model.tree, 'dir');

    expect(model.statusPriorityByDirectoryId.get(dir.directoryId)).toBe('modified');
  });

  it('propagates a nested directory winner up through a parent that also has a lower-priority direct file', () => {
    const model = createFileTreeModel([
      sessionFile(0, { kind: 'added', newPath: exactPath('parent/child/added.ts') }),
      sessionFile(1, {
        kind: 'unsupported',
        newPath: exactPath('parent/sibling.ts'),
      }),
    ]);
    const parent = directory(model.tree, 'parent');
    const child = directory(parent.children, 'child');

    expect(model.statusPriorityByDirectoryId.get(parent.directoryId)).toBe('added');
    expect(model.statusPriorityByDirectoryId.get(child.directoryId)).toBe('added');
  });

  it('records renamed and copied as distinct per-directory winners within the same priority tier', () => {
    const model = createFileTreeModel([
      sessionFile(0, {
        kind: 'renamed',
        newPath: exactPath('renamedDir/file.ts'),
        oldPath: exactPath('renamedDir/old.ts'),
      }),
      sessionFile(1, {
        kind: 'copied',
        newPath: exactPath('copiedDir/file.ts'),
        oldPath: exactPath('copiedDir/source.ts'),
      }),
    ]);
    const renamedDir = directory(model.tree, 'renamedDir');
    const copiedDir = directory(model.tree, 'copiedDir');

    expect(model.statusPriorityByDirectoryId.get(renamedDir.directoryId)).toBe(
      'renamed',
    );
    expect(model.statusPriorityByDirectoryId.get(copiedDir.directoryId)).toBe(
      'copied',
    );
  });

  it('is populated immediately after construction with one entry per directory', () => {
    const model = createFileTreeModel([
      sessionFile(0, {
        newPath: exactPath('a/one.ts'),
        oldPath: exactPath('a/one.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('a/sub/two.ts'),
        oldPath: exactPath('a/sub/two.ts'),
      }),
      sessionFile(2, { newPath: exactPath('z.ts'), oldPath: exactPath('z.ts') }),
    ]);
    const directories = model.visibleRows.filter(
      (candidate): candidate is VisibleFileTreeDirectory =>
        candidate.kind === 'directory',
    );

    expect(model.statusPriorityByDirectoryId.size).toBe(directories.length);
    expect(
      directories.every((candidate) =>
        model.statusPriorityByDirectoryId.has(candidate.directoryId),
      ),
    ).toBe(true);
  });
});

describe('flatFileRows', () => {
  function flatRowFiles(): readonly SessionFile[] {
    return [
      sessionFile(0, {
        newPath: exactPath('dir/sub/one.ts'),
        oldPath: exactPath('dir/sub/one.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('dir/sub/two.ts'),
        oldPath: exactPath('dir/sub/two.ts'),
      }),
    ];
  }

  it('includes files inside a collapsed directory even though they are absent from visibleRows', () => {
    const expanded = createFileTreeModel(flatRowFiles());
    const dir = directory(expanded.tree, 'dir');
    const collapsed = expanded.toggleDirectory(dir.directoryId);

    expect(
      collapsed.visibleRows.some(
        (candidate) => candidate.kind === 'file' && candidate.fileId === fileId(0),
      ),
    ).toBe(false);
    expect(collapsed.flatFileRows.map((fileRow) => fileRow.fileId)).toEqual([
      fileId(0),
      fileId(1),
    ]);
  });

  it('matches the visibleRows file order when every directory is expanded', () => {
    const model = createFileTreeModel([
      sessionFile(0, {
        newPath: exactPath('a/one.ts'),
        oldPath: exactPath('a/one.ts'),
      }),
      sessionFile(1, {
        newPath: exactPath('a/sub/two.ts'),
        oldPath: exactPath('a/sub/two.ts'),
      }),
      sessionFile(2, { newPath: exactPath('z.ts'), oldPath: exactPath('z.ts') }),
    ]);

    expect(model.flatFileRows.map((fileRow) => fileRow.fileId)).toEqual(
      model.visibleRows
        .filter((candidate) => candidate.kind === 'file')
        .map((candidate) => candidate.fileId),
    );
  });

  it('contains only filter-surviving files after setQuery', () => {
    const model = createFileTreeModel([
      sessionFile(0, { newPath: exactPath('parent/branch/filter-zone/alpha.ts') }),
      sessionFile(1, { newPath: exactPath('parent/branch/filter-zone/beta.ts') }),
      sessionFile(2, { newPath: exactPath('docs/guides/guide.ts') }),
      sessionFile(3, { newPath: exactPath('other.ts') }),
    ]);
    const filtered = model.setQuery('alpha');

    expect(new Set(filtered.flatFileRows.map((fileRow) => fileRow.fileId))).toEqual(
      new Set(
        filtered.visibleRows
          .filter((candidate) => candidate.kind === 'file')
          .map((candidate) => candidate.fileId),
      ),
    );
  });

  it('stays reference-stable in content when a directory is toggled', () => {
    const model = createFileTreeModel(flatRowFiles());
    const dir = directory(model.tree, 'dir');
    const before = model.flatFileRows.map((fileRow) => fileRow.fileId);
    const toggled = model.toggleDirectory(dir.directoryId);

    expect(toggled.flatFileRows.map((fileRow) => fileRow.fileId)).toEqual(before);
  });
});

describe('highlightMatches', () => {
  it('returns a single unmatched segment for an empty query', () => {
    expect(highlightMatches('tracked.txt', '')).toEqual([
      { text: 'tracked.txt', matched: false },
    ]);
  });

  it('matches case-insensitively at the start and preserves original casing', () => {
    expect(highlightMatches('tracked.txt', 'track')).toEqual([
      { text: 'track', matched: true },
      { text: 'ed.txt', matched: false },
    ]);
  });

  it('echoes the original casing of every match back to back with no gaps between them', () => {
    expect(highlightMatches('abcABCabc', 'abc')).toEqual([
      { text: 'abc', matched: true },
      { text: 'ABC', matched: true },
      { text: 'abc', matched: true },
    ]);
  });

  it('returns a single unmatched segment when the query has no match', () => {
    expect(highlightMatches('no-match-here.ts', 'zzz')).toEqual([
      { text: 'no-match-here.ts', matched: false },
    ]);
  });
});

describe('fileTypeMarkFor', () => {
  it('resolves a known extension to its mark and tone', () => {
    expect(fileTypeMarkFor('src/App.vue')).toEqual({
      text: 'V',
      tone: '--status-added-foreground',
    });
  });

  it('falls back to the default mark for an unrecognised extension', () => {
    expect(fileTypeMarkFor('src/App.unknownext')).toEqual({
      text: '·',
      tone: '--text-muted',
    });
  });

  it('falls back to the default mark for a path with no extension', () => {
    expect(fileTypeMarkFor('README')).toEqual({
      text: '·',
      tone: '--text-muted',
    });
  });

  it('falls back to the default mark for an undefined path', () => {
    expect(fileTypeMarkFor(undefined)).toEqual({
      text: '·',
      tone: '--text-muted',
    });
  });
});


