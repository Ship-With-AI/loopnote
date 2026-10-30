import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

import {
  CURRENT_DRAFT_SCHEMA_VERSION,
  DraftVersionEnvelopeSchema,
  ReviewDraftV1Schema,
  type ReviewDraftV1,
} from '../contracts/draft.js';
import { comparisonKey } from '../domain/comparison-key.js';
import type { DraftComparison, DraftFileSystem } from './draft-store.js';

const draftsDirectory = '.cumpa/drafts';
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export function assertAttachedStorageScope(storageScope: string): string {
  if (!/^agent-[0-9a-f]{32}$/u.test(storageScope)) {
    throw new Error('Attached storage scope is invalid.');
  }
  return storageScope;
}

export type DraftIssue = Readonly<{ readonly path: string; readonly message: string }>;

export type DraftLoadState =
  | Readonly<{ readonly kind: 'missing'; readonly path: string }>
  | Readonly<{ readonly kind: 'current'; readonly path: string; readonly raw: Buffer; readonly draft: ReviewDraftV1 }>
  | Readonly<{ readonly kind: 'malformed'; readonly path: string; readonly raw: Buffer; readonly fingerprint: string; readonly detail: Readonly<{ readonly message: string }> }>
  | Readonly<{ readonly kind: 'schemaInvalid'; readonly path: string; readonly raw: Buffer; readonly fingerprint: string; readonly details: readonly DraftIssue[] }>
  | Readonly<{ readonly kind: 'newerUnsupported'; readonly path: string; readonly raw: Buffer; readonly foundVersion: number; readonly supportedVersion: typeof CURRENT_DRAFT_SCHEMA_VERSION }>;

export type DraftPaths = Readonly<{
  readonly key: string;
  readonly directory: string;
  readonly canonicalPath: string;
  readonly relativePath: string;
}>;

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function bounded(value: string): string {
  if (value.length <= 160) {
    return value;
  }
  return `${value.slice(0, 157)}...`;
}

function fingerprint(raw: Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

function sameComparison(left: DraftComparison, right: DraftComparison): boolean {
  if ('kind' in left && 'kind' in right && left.kind === 'uncommitted' && right.kind === 'uncommitted') {
    return left.reviewKey === right.reviewKey;
  }
  if ('kind' in left || 'kind' in right) {
    return (
      'kind' in left &&
      'kind' in right &&
      left.kind === 'exact-patch' &&
      right.kind === 'exact-patch' &&
      left.digest === right.digest &&
      left.validationTarget.kind === right.validationTarget.kind &&
      left.reviewKey === right.reviewKey
    );
  }
  if (
    left.baseCommitOid !== right.baseCommitOid ||
    left.headCommitOid !== right.headCommitOid ||
    left.mergeBaseOid !== right.mergeBaseOid
  ) {
    return false;
  }
  if (left.range === undefined || right.range === undefined) {
    return left.range === right.range;
  }
  return (
    left.range.requestedBase === right.range.requestedBase &&
    left.range.requestedHead === right.range.requestedHead &&
    left.range.baseOid === right.range.baseOid &&
    left.range.headOid === right.range.headOid &&
    left.range.reviewKey === right.range.reviewKey &&
    left.range.pathspecs.length === right.range.pathspecs.length &&
    left.range.pathspecs.every((pathspec, index) => pathspec === right.range?.pathspecs[index])
  );
}

function invalidState(path: string, raw: Buffer, details: readonly DraftIssue[]): DraftLoadState {
  return Object.freeze({
    kind: 'schemaInvalid' as const,
    path,
    raw,
    fingerprint: fingerprint(raw),
    details: Object.freeze(details.slice(0, 8)),
  });
}

export function draftPaths(
  repositoryRoot: string,
  comparison: DraftComparison,
  storageScope?: string,
): DraftPaths {
  const key = storageScope === undefined
    ? ('kind' in comparison
      ? comparison.reviewKey
      : comparison.range?.reviewKey ?? comparisonKey(comparison.baseCommitOid, comparison.headCommitOid))
    : assertAttachedStorageScope(storageScope);
  const relativePath = `${draftsDirectory}/${key}.json`;
  const directory = join(repositoryRoot, draftsDirectory);
  return Object.freeze({ key, directory, canonicalPath: join(repositoryRoot, relativePath), relativePath });
}

export function classifyDraft(raw: Buffer, path: string, comparison: DraftComparison): DraftLoadState {
  let value: unknown;
  try {
    value = JSON.parse(strictUtf8.decode(raw));
  } catch {
    return Object.freeze({
      kind: 'malformed' as const,
      path,
      raw,
      fingerprint: fingerprint(raw),
      detail: Object.freeze({ message: 'Draft is not valid UTF-8 JSON.' }),
    });
  }

  const envelope = DraftVersionEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return invalidState(
      path,
      raw,
      envelope.error.issues.map((issue) => Object.freeze({ path: bounded(issue.path.join('.')), message: bounded(issue.message) })),
    );
  }
  if (envelope.data.schemaVersion > CURRENT_DRAFT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'newerUnsupported' as const,
      path,
      raw,
      foundVersion: envelope.data.schemaVersion,
      supportedVersion: CURRENT_DRAFT_SCHEMA_VERSION,
    });
  }

  const parsed = ReviewDraftV1Schema.safeParse(value);
  if (!parsed.success) {
    return invalidState(
      path,
      raw,
      parsed.error.issues.map((issue) => Object.freeze({ path: bounded(issue.path.join('.')), message: bounded(issue.message) })),
    );
  }
  if (!sameComparison(parsed.data.comparison, comparison)) {
    return invalidState(path, raw, [Object.freeze({ path: 'comparison', message: 'Draft comparison does not match this session.' })]);
  }
  return Object.freeze({ kind: 'current' as const, path, raw, draft: parsed.data });
}

export function createDraftLoader(options: Readonly<{
  readonly repositoryRoot: string;
  readonly comparison: DraftComparison;
  readonly storageScope?: string;
  readonly fileSystem?: Pick<DraftFileSystem, 'readFile'>;
}>): Readonly<{ load(): Promise<DraftLoadState>; paths: DraftPaths }> {
  const paths = draftPaths(options.repositoryRoot, options.comparison, options.storageScope);
  const fileSystem = options.fileSystem ?? { readFile: async (path: string) => fs.readFile(path) };
  return Object.freeze({
    paths,
    async load(): Promise<DraftLoadState> {
      try {
        return classifyDraft(await fileSystem.readFile(paths.canonicalPath), paths.relativePath, options.comparison);
      } catch (error) {
        if (isMissing(error)) {
          return Object.freeze({ kind: 'missing' as const, path: paths.relativePath });
        }
        throw error;
      }
    },
  });
}
