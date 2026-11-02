import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { inspectLoopnoteIgnore } from '../git/ignore-status.js';
import { RENAME_MAP } from '../domain/product-identity.js';

const loopnoteIgnoreRule = Buffer.from(`/${RENAME_MAP.repoStateDir}\n`, 'ascii');
const appendQueues = new Map<string, Promise<void>>();

export type AppendLoopnoteIgnoreResult =
  | Readonly<{ kind: 'appended' }>
  | Readonly<{ kind: 'alreadyIgnored' }>
  | Readonly<{ kind: 'unconfirmed' }>
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'appendUnconfirmed' }>
  | Readonly<{ kind: 'ambiguous' }>;

export interface AppendLoopnoteIgnoreOptions {
  readonly repositoryRoot: string;
}

export interface AppendLoopnoteIgnoreDependencies {
  readonly beforeAppend?: () => Promise<void>;
  readonly writeAddition?: (handle: FileHandle, addition: Buffer) => Promise<void>;
  readonly sync?: (handle: FileHandle) => Promise<void>;
  readonly close?: (handle: FileHandle) => Promise<void>;
}

type FileIdentity = Readonly<{ device: number; inode: number }>;

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function result(kind: AppendLoopnoteIgnoreResult['kind']): AppendLoopnoteIgnoreResult {
  return Object.freeze({ kind });
}

async function closeAsUnconfirmed(handle: FileHandle): Promise<AppendLoopnoteIgnoreResult> {
  try {
    await handle.close();
  } catch {
    // A failed close cannot make this append safe to claim.
  }
  return result('unconfirmed');
}

async function inspectFailedMutation(
  ignorePath: string,
  identity: FileIdentity,
  original: Buffer,
  addition: Buffer,
): Promise<AppendLoopnoteIgnoreResult> {
  let confirmation: FileHandle | undefined;
  let outcome: AppendLoopnoteIgnoreResult = result('ambiguous');
  try {
    confirmation = await open(ignorePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await confirmation.stat();
    if (stat.isFile() && stat.dev === identity.device && stat.ino === identity.inode) {
      const bytes = await confirmation.readFile();
      outcome = bytes.equals(original)
        ? result('unchanged')
        : bytes.equals(Buffer.concat([original, addition]))
          ? result('appendUnconfirmed')
          : result('ambiguous');
    }
  } catch {
    outcome = result('ambiguous');
  } finally {
    if (confirmation !== undefined) {
      try {
        await confirmation.close();
      } catch {
        outcome = result('ambiguous');
      }
    }
  }
  return outcome;
}

export async function appendLoopnoteIgnoreRule(
  options: AppendLoopnoteIgnoreOptions,
  dependencies: AppendLoopnoteIgnoreDependencies = {},
): Promise<AppendLoopnoteIgnoreResult> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const previous = appendQueues.get(repositoryRoot) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    release = resolveCurrent;
  });
  const queued = previous.then(() => current);
  appendQueues.set(repositoryRoot, queued);
  await previous;

  try {
    const status = await inspectLoopnoteIgnore({ repositoryRoot });
    if (status.kind === 'ignored') {
      return result('alreadyIgnored');
    }
    if (status.kind === 'unavailable') {
      return result('unconfirmed');
    }

    const ignorePath = join(repositoryRoot, '.gitignore');
    if (dirname(ignorePath) !== repositoryRoot) {
      return result('unconfirmed');
    }

    let handle: FileHandle | undefined;
    let original: Buffer;
    let identity: FileIdentity;
    let size: number;

    try {
      let initial;
      try {
        initial = await lstat(ignorePath);
      } catch (error) {
        if (!isMissingPath(error)) {
          return result('unconfirmed');
        }
      }

      if (initial !== undefined) {
        if (!initial.isFile() || initial.isSymbolicLink()) {
          return result('unconfirmed');
        }
        handle = await open(
          ignorePath,
          constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW,
        );
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.dev !== initial.dev ||
          opened.ino !== initial.ino ||
          opened.size !== initial.size
        ) {
          return closeAsUnconfirmed(handle);
        }
        original = await handle.readFile();
        if (original.byteLength !== opened.size) {
          return closeAsUnconfirmed(handle);
        }
        identity = { device: opened.dev, inode: opened.ino };
        size = opened.size;
      } else {
        handle = await open(
          ignorePath,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_RDWR |
            constants.O_APPEND |
            constants.O_NOFOLLOW,
          0o600,
        );
        const created = await handle.stat();
        if (!created.isFile() || created.size !== 0) {
          return closeAsUnconfirmed(handle);
        }
        original = Buffer.alloc(0);
        identity = { device: created.dev, inode: created.ino };
        size = created.size;
      }
    } catch {
      return handle === undefined ? result('unconfirmed') : closeAsUnconfirmed(handle);
    }

    if (handle === undefined) {
      return result('unconfirmed');
    }

    const addition = original.byteLength === 0 || original.at(-1) === 0x0a
      ? loopnoteIgnoreRule
      : Buffer.concat([Buffer.from('\n', 'ascii'), loopnoteIgnoreRule]);
    let mutationFailed = false;

    try {
      await dependencies.beforeAppend?.();
      const beforeWrite = await handle.stat();
      if (
        !beforeWrite.isFile() ||
        beforeWrite.dev !== identity.device ||
        beforeWrite.ino !== identity.inode ||
        beforeWrite.size !== size
      ) {
        try {
          await handle.close();
        } catch {
          // No append was attempted, so the outcome remains unconfirmed.
        }
        return result('unconfirmed');
      }
      await (dependencies.writeAddition?.(handle, addition) ?? handle.writeFile(addition));
      await (dependencies.sync?.(handle) ?? handle.sync());
    } catch {
      mutationFailed = true;
    }

    try {
      await (dependencies.close?.(handle) ?? handle.close());
    } catch {
      mutationFailed = true;
    }

    if (mutationFailed) {
      return inspectFailedMutation(ignorePath, identity, original, addition);
    }

    try {
      const confirmation = await open(ignorePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const confirmed = await confirmation.stat();
        const bytes = await confirmation.readFile();
        const expected = Buffer.concat([original, addition]);
        if (
          !confirmed.isFile() ||
          confirmed.dev !== identity.device ||
          confirmed.ino !== identity.inode ||
          confirmed.size !== expected.byteLength ||
          !bytes.equals(expected)
        ) {
          return result('ambiguous');
        }
      } finally {
        await confirmation.close();
      }
    } catch {
      return result('ambiguous');
    }

    return (await inspectLoopnoteIgnore({ repositoryRoot })).kind === 'ignored'
      ? result('appended')
      : result('appendUnconfirmed');
  } catch {
    return result('unconfirmed');
  } finally {
    release();
    if (appendQueues.get(repositoryRoot) === queued) {
      appendQueues.delete(repositoryRoot);
    }
  }
}
