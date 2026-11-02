import { createHash } from 'node:crypto';

import { decodeBase64url } from './path-bytes.js';
import { RENAME_MAP } from './product-identity.js';
import type { ExactPathDto } from '../contracts/comparison.js';

export type AnchorSide = 'base' | 'head';

export type AnchorContextLine = Readonly<{
  readonly line: number;
  readonly text: string;
}>;

export type DurableAnchorV1 = Readonly<{
  readonly version: 'durable-anchor-v1';
  readonly path: ExactPathDto;
  readonly safeDisplayPath: string;
  readonly side: AnchorSide;
  readonly line: number;
  readonly endLine?: number; // absent = single-line anchor (pre-A-01 shape, byte-for-byte unchanged)
  readonly blobOid: string;
  readonly selectedText: string;
  readonly context: Readonly<{
    readonly before: readonly AnchorContextLine[];
    readonly target: AnchorContextLine;
    readonly after: readonly AnchorContextLine[];
  }>;
  readonly contextHash: Readonly<{
    readonly algorithm: 'sha256-v1';
    readonly value: string;
  }>;
  readonly uniqueKey: string;
}>;

export type BuildDurableAnchorInput = Readonly<{
  readonly path: ExactPathDto;
  readonly safeDisplayPath: string;
  readonly side: AnchorSide;
  readonly blobOid: string;
  readonly line: number;
  readonly endLine?: number;
  readonly text: string;
}>;

export type AnchorVerification = Readonly<{
  readonly state: 'verified' | 'stale' | 'orphaned';
  readonly reason: 'exact-match' | 'anchor-mismatch' | 'anchor-unavailable';
}>;

const CONTEXT_DOMAIN = Buffer.from(`${RENAME_MAP.slug}-anchor-context-v1`, 'utf8');
const UNIQUE_DOMAIN = Buffer.from(`${RENAME_MAP.slug}-anchor-unique-v1`, 'utf8');
const UTF8 = new TextEncoder();

function framedSha256(domain: Uint8Array, fields: readonly Uint8Array[]): string {
  const hash = createHash('sha256');
  hash.update(domain);
  for (const field of fields) {
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(field.byteLength));
    hash.update(length);
    hash.update(field);
  }
  return hash.digest('hex');
}

function encodeLine(line: AnchorContextLine): readonly Uint8Array[] {
  return [UTF8.encode(String(line.line)), UTF8.encode(line.text)];
}

function sameLine(left: AnchorContextLine, right: AnchorContextLine): boolean {
  return left.line === right.line && left.text === right.text;
}

function sameLines(
  left: readonly AnchorContextLine[],
  right: readonly AnchorContextLine[],
): boolean {
  return left.length === right.length && left.every((line, index) => sameLine(line, right[index]!));
}

function samePath(left: ExactPathDto, right: ExactPathDto): boolean {
  return left.bytesBase64url === right.bytesBase64url;
}

function contextHash(
  pathBytes: Uint8Array,
  side: AnchorSide,
  blobOid: string,
  line: number,
  endLine: number | undefined,
  context: DurableAnchorV1['context'],
  selectedText: string,
): string {
  const fields: Uint8Array[] = [
    pathBytes,
    UTF8.encode(side),
    UTF8.encode(blobOid),
    UTF8.encode(String(line)),
  ];
  if (endLine !== undefined) {
    fields.push(
      UTF8.encode('endLine'),
      UTF8.encode(String(endLine)),
      UTF8.encode('selectedText'),
      UTF8.encode(selectedText),
    );
  }
  fields.push(UTF8.encode('before'));
  for (const entry of context.before) {
    fields.push(...encodeLine(entry));
  }
  fields.push(UTF8.encode('target'), ...encodeLine(context.target), UTF8.encode('after'));
  for (const entry of context.after) {
    fields.push(...encodeLine(entry));
  }
  return framedSha256(CONTEXT_DOMAIN, fields);
}

function duplicateKey(pathBytes: Uint8Array, side: AnchorSide, blobOid: string, line: number): string {
  return framedSha256(UNIQUE_DOMAIN, [
    pathBytes,
    UTF8.encode(side),
    UTF8.encode(blobOid),
    UTF8.encode(String(line)),
  ]);
}

export function buildDurableAnchor(input: BuildDurableAnchorInput): DurableAnchorV1 {
  if (!Number.isSafeInteger(input.line) || input.line < 1) {
    throw new RangeError('Anchor line must be a positive safe integer.');
  }
  if (
    input.endLine !== undefined &&
    (!Number.isSafeInteger(input.endLine) || input.endLine < input.line)
  ) {
    throw new RangeError('Anchor endLine must be a safe integer not less than line.');
  }
  const lines = input.text.split(/\r\n|\n/u);
  const lastLine = input.endLine ?? input.line;
  if (lastLine > lines.length) {
    throw new RangeError('Anchor line is outside frozen text.');
  }
  const targetIndex = input.line - 1;
  const endIndex = lastLine - 1;
  const before = lines
    .slice(Math.max(0, targetIndex - 3), targetIndex)
    .map((text, index) => Object.freeze({ line: Math.max(1, input.line - 3) + index, text }));
  const target = Object.freeze({ line: input.line, text: lines[targetIndex]! });
  const after = lines
    .slice(endIndex + 1, endIndex + 4)
    .map((text, index) => Object.freeze({ line: lastLine + index + 1, text }));
  const context = Object.freeze({
    before: Object.freeze(before),
    target,
    after: Object.freeze(after),
  });
  const selectedText =
    input.endLine === undefined ? target.text : lines.slice(targetIndex, endIndex + 1).join('\n');
  const pathBytes = decodeBase64url(input.path.bytesBase64url);
  const contextHashValue = contextHash(
    pathBytes,
    input.side,
    input.blobOid,
    input.line,
    input.endLine,
    context,
    selectedText,
  );

  return Object.freeze({
    version: 'durable-anchor-v1',
    path: input.path,
    safeDisplayPath: input.safeDisplayPath,
    side: input.side,
    line: input.line,
    ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
    blobOid: input.blobOid,
    selectedText,
    context,
    contextHash: Object.freeze({ algorithm: 'sha256-v1', value: contextHashValue }),
    uniqueKey: duplicateKey(pathBytes, input.side, input.blobOid, input.line),
  });
}

export function verifyDurableAnchor(
  recorded: DurableAnchorV1,
  current: DurableAnchorV1 | undefined,
): AnchorVerification {
  if (current === undefined) {
    return Object.freeze({ state: 'orphaned', reason: 'anchor-unavailable' });
  }
  const matches =
    recorded.version === current.version &&
    samePath(recorded.path, current.path) &&
    recorded.side === current.side &&
    recorded.line === current.line &&
    recorded.endLine === current.endLine &&
    recorded.blobOid === current.blobOid &&
    recorded.selectedText === current.selectedText &&
    sameLines(recorded.context.before, current.context.before) &&
    sameLine(recorded.context.target, current.context.target) &&
    sameLines(recorded.context.after, current.context.after) &&
    recorded.contextHash.algorithm === current.contextHash.algorithm &&
    recorded.contextHash.value === current.contextHash.value &&
    recorded.uniqueKey === current.uniqueKey;
  return Object.freeze(
    matches
      ? { state: 'verified' as const, reason: 'exact-match' as const }
      : { state: 'stale' as const, reason: 'anchor-mismatch' as const },
  );
}
