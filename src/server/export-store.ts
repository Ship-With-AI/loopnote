import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { Stats } from 'node:fs';

import { hashExportBytes, parseCanonicalReviewExport } from '../export/review-export.js';
import type { ExportHash, ReviewExport } from '../export/review-export.js';
import { renderReviewMarkdown } from '../export/render-review-markdown.js';
import { RENAME_MAP } from '../domain/product-identity.js';
import { assertAttachedStorageScope } from './draft-loader.js';

export class ReExportUnsupported extends Error {
  constructor() {
    super('The current packaged target has no observed native directory exchange support.');
  }
}

export type ReExportCapability =
  | Readonly<{ readonly kind: 'reExportUnsupported' }>
  | Readonly<{
      readonly kind: 'observedNativeExchange';
      readonly exchangeDirectories: (root: string, stable: string, candidate: string) => Readonly<{ readonly kind: 'supported' | 'unsupported' | 'failed' }>;
    }>;

export type ExportReceipt = Readonly<{
  readonly files: readonly [
    Readonly<{ readonly path: string; readonly algorithm: ExportHash['algorithm']; readonly sha256: string; readonly bytes: number }>,
    Readonly<{ readonly path: string; readonly algorithm: ExportHash['algorithm']; readonly sha256: string; readonly bytes: number }>,
  ];
}>;

export type PublishReviewExportResult =
  | Readonly<{ readonly kind: 'exported'; readonly receipt: ExportReceipt }>
  | Readonly<{ readonly kind: 'reExportUnsupported' }>
  | Readonly<{ readonly kind: 'publicationFailed' }>
  | Readonly<{ readonly kind: 'recoveryRequired' }>;

export type ExportPublicationIdentity =
  | Readonly<{ readonly kind: 'interactive'; readonly baseOid: string; readonly headOid: string }>
  | Readonly<{ readonly kind: 'range'; readonly reviewKey: string }>
  | Readonly<{ readonly kind: 'exact-patch'; readonly reviewKey: string }>
  | Readonly<{ readonly kind: 'standalone'; readonly reviewKey: string }>;

export type PublishReviewExportInput = Readonly<{
  readonly revalidate?: () => Promise<boolean>;
  readonly repositoryRoot: string;
  readonly identity: ExportPublicationIdentity;
  readonly storageScope?: string;
  readonly json: Uint8Array;
  readonly markdown: Uint8Array;
  readonly reExportCapability: ReExportCapability;
}>;

type CompletePair = Readonly<{ readonly json: Buffer; readonly markdown: Buffer }>;

type DirectoryIdentity = Readonly<{ readonly dev: number; readonly ino: number }>;

export type ManagedExportsRoot = Readonly<{
  readonly stateRoot: string;
  readonly exportsRoot: string;
  readonly stateIdentity: DirectoryIdentity;
  readonly exportsIdentity: DirectoryIdentity;
}>;

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && ['EINVAL', 'ENOTSUP', 'EISDIR'].includes(String(error.code)))) {
      throw error;
    }
  }
}

async function writeFileExactly(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function completePair(path: string): Promise<CompletePair> {
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('Managed export directory is not a real directory.');
  }
  const names = await readdir(path);
  if (names.length !== 2 || !names.includes('review.json') || !names.includes('review.md')) {
    throw new Error('Managed export directory does not contain exactly the review pair.');
  }
  const [jsonInfo, markdownInfo, json, markdown] = await Promise.all([
    lstat(join(path, 'review.json')),
    lstat(join(path, 'review.md')),
    readFile(join(path, 'review.json')),
    readFile(join(path, 'review.md')),
  ]);
  if (!jsonInfo.isFile() || jsonInfo.isSymbolicLink() || !markdownInfo.isFile() || markdownInfo.isSymbolicLink()) {
    throw new Error('Managed export pair contains an unsupported file type.');
  }
  return Object.freeze({ json, markdown });
}

async function stableExists(path: string): Promise<boolean> {
  try {
    await completePair(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function stableNameFor(
  identity: ExportPublicationIdentity,
  storageScope?: string,
): string | undefined {
  if (storageScope !== undefined) {
    try {
      return assertAttachedStorageScope(storageScope);
    } catch {
      return undefined;
    }
  }
  if (identity.kind === 'range' || identity.kind === 'exact-patch' || identity.kind === 'standalone') {
    return Object.keys(identity).length === 2 && /^[0-9a-f]{64}$/u.test(identity.reviewKey)
      ? identity.reviewKey
      : undefined;
  }
  return Object.keys(identity).length === 3
    && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(identity.baseOid)
    && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(identity.headOid)
    ? `${identity.baseOid}..${identity.headOid}`
    : undefined;
}

function matchesPublicationIdentity(document: ReviewExport, identity: ExportPublicationIdentity): boolean {
  if (identity.kind === 'standalone') {
    return document.schemaVersion === 4 && document.standalone.reviewKey === identity.reviewKey;
  }
  if (identity.kind === 'exact-patch') {
    return document.schemaVersion === 3 && document.patch.reviewKey === identity.reviewKey;
  }
  return identity.kind === 'range'
    ? document.schemaVersion === 2 && document.range.reviewKey === identity.reviewKey
    : document.schemaVersion === 1
      && document.comparison.selectedBase.launchOid === identity.baseOid
      && document.comparison.selectedHead.launchOid === identity.headOid;
}

function receipt(exportsRoot: string, stable: string, pair: CompletePair): ExportReceipt {
  const stableRelative = relative(exportsRoot, stable).split('\\').join('/');
  const json = hashExportBytes(pair.json);
  const markdown = hashExportBytes(pair.markdown);
  const files: ExportReceipt['files'] = [
    Object.freeze({ path: `${RENAME_MAP.repoStateDir}exports/${stableRelative}/review.json`, ...json }),
    Object.freeze({ path: `${RENAME_MAP.repoStateDir}exports/${stableRelative}/review.md`, ...markdown }),
  ];
  return Object.freeze({ files: Object.freeze(files) as ExportReceipt['files'] });
}

function identity(info: Stats): DirectoryIdentity {
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Managed export directory is not a real directory.');
  }
  return Object.freeze({ dev: info.dev, ino: info.ino });
}

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function managedDirectory(component: string, create: boolean): Promise<DirectoryIdentity | undefined> {
  let info: Stats;
  try {
    info = await lstat(component);
  } catch (error) {
    if (!isMissing(error)) throw error;
    if (!create) return undefined;
    await mkdir(component, { mode: 0o700 });
    info = await lstat(component);
  }
  return identity(info);
}

export async function ensureManagedExportsRoot(
  repositoryRoot: string,
  create: boolean,
): Promise<ManagedExportsRoot | undefined> {
  const root = resolve(repositoryRoot);
  const stateRoot = join(root, RENAME_MAP.repoStateDir.replace(/\/$/, ''));
  const stateIdentity = await managedDirectory(stateRoot, create);
  if (stateIdentity === undefined) return undefined;
  const exportsRoot = join(stateRoot, 'exports');
  const exportsIdentity = await managedDirectory(exportsRoot, create);
  if (exportsIdentity === undefined) return undefined;
  return Object.freeze({ stateRoot, exportsRoot, stateIdentity, exportsIdentity });
}

export async function assertManagedExportsRoot(managedRoot: ManagedExportsRoot): Promise<void> {
  const stateIdentity = await managedDirectory(managedRoot.stateRoot, false);
  if (
    stateIdentity === undefined
    || !sameIdentity(stateIdentity, managedRoot.stateIdentity)
  ) {
    throw new Error('Managed export directory identity changed.');
  }
  const exportsIdentity = await managedDirectory(managedRoot.exportsRoot, false);
  if (
    exportsIdentity === undefined
    || !sameIdentity(exportsIdentity, managedRoot.exportsIdentity)
  ) {
    throw new Error('Managed export directory identity changed.');
  }
}

export async function publishReviewExport(input: PublishReviewExportInput): Promise<PublishReviewExportResult> {
  const publication = input.identity;
  const stableName = stableNameFor(publication, input.storageScope);
  if (stableName === undefined) return Object.freeze({ kind: 'publicationFailed' });
  const repositoryRoot = resolve(input.repositoryRoot);
  let managedRoot: ManagedExportsRoot | undefined;
  let candidate: string | undefined;
  let exportsRoot: string | undefined;
  let stable: string | undefined;
  let publicationMayHaveChanged = false;
  try {
    managedRoot = await ensureManagedExportsRoot(repositoryRoot, true);
    if (managedRoot === undefined) {
      return Object.freeze({ kind: 'publicationFailed' });
    }
    exportsRoot = managedRoot.exportsRoot;
    stable = join(exportsRoot, stableName);
    await assertManagedExportsRoot(managedRoot);
    const stablePresent = await stableExists(stable);
    if (stablePresent && input.reExportCapability.kind === 'reExportUnsupported') {
      return Object.freeze({ kind: 'reExportUnsupported' });
    }

    const candidateName = `.${stableName}.candidate-${randomUUID()}`;
    candidate = join(exportsRoot, candidateName);
    await assertManagedExportsRoot(managedRoot);
    await mkdir(candidate, { mode: 0o700 });
    await assertManagedExportsRoot(managedRoot);
    await writeFileExactly(join(candidate, 'review.json'), input.json);
    await assertManagedExportsRoot(managedRoot);
    await writeFileExactly(join(candidate, 'review.md'), input.markdown);
    await assertManagedExportsRoot(managedRoot);
    const validatedCandidate = await completePair(candidate);
    if (!validatedCandidate.json.equals(input.json) || !validatedCandidate.markdown.equals(input.markdown)) {
      throw new Error('Candidate reread differs from validated export bytes.');
    }
    const document = parseCanonicalReviewExport(validatedCandidate.json);
    if (
      !matchesPublicationIdentity(document, publication)
      || !Buffer.from(renderReviewMarkdown(validatedCandidate.json), 'utf8').equals(validatedCandidate.markdown)
    ) {
      throw new Error('Candidate export identity or Markdown does not match canonical export JSON.');
    }
    await assertManagedExportsRoot(managedRoot);
    await syncDirectory(candidate);
    if (input.revalidate !== undefined && !(await input.revalidate())) {
      return Object.freeze({ kind: 'publicationFailed' });
    }
    await assertManagedExportsRoot(managedRoot);

    if (!stablePresent) {
      await assertManagedExportsRoot(managedRoot);
      if (await stableExists(stable)) {
        return Object.freeze({ kind: 'publicationFailed' });
      }
      publicationMayHaveChanged = true;
      await rename(candidate, stable);
    } else {
      if (input.reExportCapability.kind !== 'observedNativeExchange') {
        throw new ReExportUnsupported();
      }
      const exchanged = input.reExportCapability.exchangeDirectories(exportsRoot, stableName, candidateName);
      if (exchanged.kind === 'unsupported') {
        throw new ReExportUnsupported();
      }
      publicationMayHaveChanged = true;
      if (exchanged.kind !== 'supported') {
        throw new Error('Native exchange did not confirm publication.');
      }
    }

    await assertManagedExportsRoot(managedRoot);
    await syncDirectory(exportsRoot);
    await assertManagedExportsRoot(managedRoot);
    const finalPair = await completePair(stable);
    if (!finalPair.json.equals(input.json) || !finalPair.markdown.equals(input.markdown)) {
      return Object.freeze({ kind: 'publicationFailed' });
    }
    const finalReceipt = receipt(exportsRoot, stable, finalPair);
    return Object.freeze({ kind: 'exported', receipt: finalReceipt });
  } catch (error) {
    if (error instanceof ReExportUnsupported) {
      return Object.freeze({ kind: 'reExportUnsupported' });
    }
    if (!publicationMayHaveChanged || managedRoot === undefined || exportsRoot === undefined || stable === undefined) {
      return Object.freeze({ kind: 'publicationFailed' });
    }
    try {
      await assertManagedExportsRoot(managedRoot);
      const recovered = await completePair(stable);
      if (!recovered.json.equals(input.json) || !recovered.markdown.equals(input.markdown)) {
        return Object.freeze({ kind: 'recoveryRequired' });
      }
      return Object.freeze({ kind: 'exported', receipt: receipt(exportsRoot, stable, recovered) });
    } catch (recoveryError) {
      return Object.freeze({ kind: isMissing(recoveryError) ? 'publicationFailed' : 'recoveryRequired' });
    }
  } finally {
    if (candidate !== undefined && managedRoot !== undefined) {
      try {
        await assertManagedExportsRoot(managedRoot);
        await rm(candidate, { force: true, recursive: true });
      } catch {
        // A failed cleanup never changes the complete stable generation.
      }
    }
  }
}

export async function recoverReviewExport(
  repositoryRoot: string,
  identity: ExportPublicationIdentity,
  storageScope?: string,
): Promise<CompletePair | undefined> {
  const stableName = stableNameFor(identity, storageScope);
  if (stableName === undefined) return undefined;
  const managedRoot = await ensureManagedExportsRoot(repositoryRoot, false);
  if (managedRoot === undefined) return undefined;
  await assertManagedExportsRoot(managedRoot);
  const stable = join(managedRoot.exportsRoot, stableName);
  try {
    await assertManagedExportsRoot(managedRoot);
    return await completePair(stable);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}
