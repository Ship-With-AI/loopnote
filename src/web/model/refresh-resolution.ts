import type { SessionFile } from '../../contracts/api.js';

function effectiveDisplayPath(file: SessionFile): string {
  if (file.status.kind === 'deleted') {
    if (file.oldPath === undefined) {
      throw new Error(`Deleted file ${file.fileId} has no old path`);
    }
    return file.oldPath.display;
  }

  if (
    file.status.kind === 'added' ||
    file.status.kind === 'renamed' ||
    file.status.kind === 'copied'
  ) {
    if (file.newPath === undefined) {
      throw new Error(`${file.status.kind} file ${file.fileId} has no new path`);
    }
    return file.newPath.display;
  }

  const path = file.newPath ?? file.oldPath;
  if (path === undefined) {
    throw new Error(`File ${file.fileId} has no effective path`);
  }
  return path.display;
}

function pathIndex(files: readonly SessionFile[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    index.set(effectiveDisplayPath(file), file.fileId);
  }
  return index;
}

export function resolvePathToFileId(path: string, files: readonly SessionFile[]): string | undefined {
  return pathIndex(files).get(path);
}

export function resolvePathsToFileIds(
  paths: readonly string[],
  files: readonly SessionFile[],
): ReadonlyMap<string, string | undefined> {
  const index = pathIndex(files);
  const result = new Map<string, string | undefined>();
  for (const path of paths) {
    result.set(path, index.get(path));
  }
  return result;
}
