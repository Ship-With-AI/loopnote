import { Buffer } from 'node:buffer';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path/posix';

import type { ObjectReader } from '../git/objects.js';
import type { GitRunner } from '../git/runner.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MAX_LS_TREE_OUTPUT_BYTES = 64 * 1024;
const modePattern = /^[0-7]{6}$/;
const oidPattern = /^[0-9a-f]+$/;

export const IMAGE_CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === code;
}

export function resolveRelativeImagePath(markdownDisplayPath: string, rawSrc: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSrc);
  } catch {
    return undefined;
  }
  if (
    decoded.length === 0 ||
    decoded.startsWith('/') ||
    /[\u0000-\u001f]/u.test(decoded)
  ) {
    return undefined;
  }
  const normalized = normalize(join(dirname(markdownDisplayPath), decoded));
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.endsWith('/')
  ) {
    return undefined;
  }
  return normalized;
}

export async function readWorktreeImageBytes(repositoryRoot: string, relativePath: string): Promise<Buffer | undefined> {
  const parts = relativePath.split('/');
  let current = repositoryRoot;
  try {
    for (const [index, part] of parts.entries()) {
      current = `${current}/${part}`;
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        return undefined;
      }
      if (index < parts.length - 1) {
        if (!entry.isDirectory()) {
          return undefined;
        }
        continue;
      }
      if (!entry.isFile() || entry.size > MAX_IMAGE_BYTES) {
        return undefined;
      }
      const bytes = await readFile(current);
      return bytes.length > MAX_IMAGE_BYTES ? undefined : bytes;
    }
    return undefined;
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT') || isNodeErrorWithCode(error, 'ENOTDIR')) {
      return undefined;
    }
    throw error;
  }
}

export async function readCommittedImageBytes(
  repositoryRoot: string,
  commitOid: string,
  relativePath: string,
  runner: GitRunner,
  reader: ObjectReader,
): Promise<Buffer | undefined> {
  let result;
  try {
    result = await runner.run(['ls-tree', commitOid, '--', relativePath], {
      cwd: repositoryRoot,
      maxStdoutBytes: MAX_LS_TREE_OUTPUT_BYTES,
    });
  } catch {
    return undefined;
  }
  const output = result.stdout.toString('utf8').trim();
  if (output.length === 0) {
    return undefined;
  }
  const tab = output.indexOf('\t');
  if (tab < 0) {
    return undefined;
  }
  const fields = output.slice(0, tab).split(' ');
  if (fields.length !== 3 || !modePattern.test(fields[0]!) || fields[1] !== 'blob' || !oidPattern.test(fields[2]!)) {
    return undefined;
  }
  const content = await reader.read(fields[2]!, { maxBytes: MAX_IMAGE_BYTES });
  return content.kind === 'missing' ? undefined : content.bytes;
}
