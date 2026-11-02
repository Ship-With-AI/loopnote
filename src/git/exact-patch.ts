import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { lstat, readFile, readlink } from 'node:fs/promises';

import { createExactPath, type ExactPath } from '../domain/path-bytes.js';
import { RENAME_MAP } from '../domain/product-identity.js';
import type {
  Availability,
  ChangedFile,
  ChangedFileStatusKind,
  ExactPatchValidationTarget,
  GroundedExactPatch,
} from '../contracts/comparison.js';
import { MAX_INLINE_TEXT_BYTES } from './availability.js';
import { createObjectReader } from './objects.js';
import { discoverGitRepository } from './repository.js';
import { createGitRunner, type GitRunner } from './runner.js';

const newStateDirSegment = RENAME_MAP.repoStateDir.replace(/\/$/, '');

const modePattern = /^[0-7]{6}$/;
const oidPattern = /^[0-9a-f]+$/;
const MAX_PATCH_LINES = 100_000;
const MAX_PATCH_ENTRIES = 10_000;
const MAX_PATCH_HUNKS = 10_000;
const MAX_GROUNDED_OBJECT_BYTES = 2 * MAX_INLINE_TEXT_BYTES;
const MAX_GROUNDED_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_REPOSITORY_TREE_BYTES = 16 * 1024 * 1024;
const BASE85_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';

interface BinaryPayload {
  readonly kind: 'literal' | 'delta';
  readonly declaredSize: number;
  readonly lines: readonly string[];
}

export class ExactPatchGroundingError extends Error {
  constructor(message = 'Invalid exact patch.') {
    super(message);
    this.name = 'ExactPatchGroundingError';
  }
}

export interface CreateGroundedExactPatchOptions {
  readonly cwd: string;
  readonly patchContent: string;
  readonly target: ExactPatchValidationTarget;
  readonly signal?: AbortSignal;
}

interface ParsedPath {
  readonly bytes: Buffer;
  readonly path: ExactPath;
}

interface ParsedPatch {
  oldPath: ParsedPath | undefined;
  newPath: ParsedPath | undefined;
  oldMode: string;
  newMode: string;
  oldOid: string;
  newOid: string;
  status: string;
  similarity: number | null;
  text: readonly string[] | undefined;
  binary: Readonly<{ readonly forward: BinaryPayload; readonly reverse: BinaryPayload }> | undefined;
}

interface TargetEntry {
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
}

interface ActualTargetEntry {
  readonly mode: string;
  readonly type: string;
  readonly oid?: string;
  readonly bytes?: Buffer;
}

function fail(message?: string): never {
  throw new ExactPatchGroundingError(message);
}

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function decodeQuotedPath(value: string): Buffer {
  if (!value.startsWith('"') || !value.endsWith('"')) return Buffer.from(value, 'utf8');
  const bytes: number[] = [];
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index]!;
    if (character !== '\\') {
      bytes.push(...Buffer.from(character, 'utf8'));
      continue;
    }
    const escape = value[++index];
    if (escape === undefined) fail();
    if (/^[0-7]$/u.test(escape)) {
      const octal = `${escape}${value[++index] ?? ''}${value[++index] ?? ''}`;
      if (!/^[0-7]{3}$/u.test(octal)) fail();
      bytes.push(Number.parseInt(octal, 8));
      continue;
    }
    const escaped: Readonly<Record<string, number>> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34 };
    if (escaped[escape] === undefined) fail();
    bytes.push(escaped[escape]!);
  }
  return Buffer.from(bytes);
}

function exactPath(value: string, prefix: 'a/' | 'b/' | undefined): ParsedPath | undefined {
  if (value === '/dev/null') return undefined;
  const bytes = decodeQuotedPath(value);
  const path = prefix !== undefined && bytes.subarray(0, 2).equals(Buffer.from(prefix, 'ascii')) ? bytes.subarray(2) : bytes;
  if (path.length === 0 || path[0] === 47 || path[0] === 92 || path.includes(0)) fail();
  for (const part of path.toString('latin1').split('/')) {
    if (part === '' || part === '.' || part === '..' || part === '.git' || part === '.cumpa' || part === newStateDirSegment) fail();
  }
  return Object.freeze({ bytes: Buffer.from(path), path: createExactPath(path) });
}

function splitGitTokens(value: string): readonly string[] {
  const result: string[] = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '"') quoted = !quoted;
    if (character === ' ' && !quoted) {
      if (token.length > 0) result.push(token);
      token = '';
    } else {
      token += character;
    }
  }
  if (quoted || token.length === 0) fail();
  result.push(token);
  return result;
}

function parsePatch(content: string, oidLength: number): readonly ParsedPatch[] {
  let lineCount = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10 && ++lineCount > MAX_PATCH_LINES) fail();
  }
  const lines = content.split('\n').map((line) => line.endsWith('\r') ? line.slice(0, -1) : line);
  const records: ParsedPatch[] = [];
  type MutablePayload = { kind: 'literal' | 'delta'; declaredSize: number; lines: string[] };
  type CurrentPatch = Omit<ParsedPatch, 'oldOid' | 'newOid' | 'text' | 'binary'> & {
    oldOid?: string;
    newOid?: string;
    text?: string[];
    binary?: { payloads: MutablePayload[] };
  };
  let current: CurrentPatch | undefined;
  let body: 'text' | 'binary' | undefined;
  let activePayload: MutablePayload | undefined;

  const finish = () => {
    if (current === undefined || current.oldOid === undefined || current.newOid === undefined || records.length >= MAX_PATCH_ENTRIES) fail();
    let binary: ParsedPatch['binary'];
    if (current.binary !== undefined) {
      if (current.binary.payloads.length !== 2 || current.binary.payloads.some((payload) => payload.lines.length === 0)) fail();
      const [forward, reverse] = current.binary.payloads;
      binary = Object.freeze({
        forward: Object.freeze({ ...forward!, lines: Object.freeze([...forward!.lines]) }),
        reverse: Object.freeze({ ...reverse!, lines: Object.freeze([...reverse!.lines]) }),
      });
    }
    records.push(Object.freeze({
      ...current,
      oldOid: current.oldOid,
      newOid: current.newOid,
      text: current.text === undefined ? undefined : Object.freeze([...current.text]),
      binary,
    }));
    current = undefined;
    body = undefined;
    activePayload = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith('diff --combined ') || line.startsWith('diff --cc ')) fail();
    if (line.startsWith('diff --git ')) {
      if (current !== undefined) finish();
      const tokens = splitGitTokens(line.slice('diff --git '.length));
      if (tokens.length !== 2) fail();
      current = { oldPath: exactPath(tokens[0]!, 'a/'), newPath: exactPath(tokens[1]!, 'b/'), oldMode: '100644', newMode: '100644', status: 'M', similarity: null };
      continue;
    }
    if (current === undefined) {
      if (line.length !== 0) fail();
      continue;
    }
    if (body === 'text') {
      current.text!.push(line);
      continue;
    }
    if (body === 'binary') {
      const header = /^(literal|delta) (0|[1-9][0-9]*)$/u.exec(line);
      if (header !== null) {
        const declaredSize = Number(header[2]);
        if (activePayload !== undefined || current.binary!.payloads.length >= 2 || !Number.isSafeInteger(declaredSize) || declaredSize > MAX_GROUNDED_OBJECT_BYTES) fail();
        activePayload = { kind: header[1] === 'literal' ? 'literal' : 'delta', declaredSize, lines: [] };
        current.binary!.payloads.push(activePayload);
      } else if (line.length === 0) {
        if (activePayload !== undefined && activePayload.lines.length > 0) activePayload = undefined;
        else if (!(current.binary!.payloads.length === 2 && index === lines.length - 1)) fail();
      } else {
        if (activePayload === undefined || activePayload.lines.length >= MAX_PATCH_LINES) fail();
        activePayload.lines.push(line);
      }
      continue;
    }
    if (line.startsWith('index ')) {
      const match = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: ([0-7]{6}))?$/u.exec(line);
      if (current.oldOid !== undefined || current.newOid !== undefined || match === null || match[1]!.length !== oidLength || match[2]!.length !== oidLength || !oidPattern.test(match[1]!) || !oidPattern.test(match[2]!)) fail();
      current.oldOid = match[1]!;
      current.newOid = match[2]!;
      if (match[3] !== undefined) current.oldMode = current.newMode = match[3];
      continue;
    }
    if (line.startsWith('new file mode ')) {
      current.oldMode = '000000'; current.newMode = line.slice(14); current.status = 'A'; continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.oldMode = line.slice(18); current.newMode = '000000'; current.status = 'D'; continue;
    }
    if (line.startsWith('old mode ')) { current.oldMode = line.slice(9); continue; }
    if (line.startsWith('new mode ')) { current.newMode = line.slice(9); continue; }
    if (line.startsWith('similarity index ')) {
      const number = Number.parseInt(line.slice(17, -1), 10);
      if (!/^[0-9]{1,3}%$/u.test(line.slice(17)) || number > 100) fail();
      current.similarity = number; continue;
    }
    if (line.startsWith('rename from ')) { current.oldPath = exactPath(line.slice(12), undefined); current.status = 'R'; continue; }
    if (line.startsWith('rename to ')) { current.newPath = exactPath(line.slice(10), undefined); current.status = 'R'; continue; }
    if (line.startsWith('copy from ')) { current.oldPath = exactPath(line.slice(10), undefined); current.status = 'C'; continue; }
    if (line.startsWith('copy to ')) { current.newPath = exactPath(line.slice(8), undefined); current.status = 'C'; continue; }
    if (line.startsWith('--- ')) {
      current.oldPath = exactPath(line.slice(4), 'a/');
      const next = lines[++index];
      if (next === undefined || !next.startsWith('+++ ')) fail();
      current.newPath = exactPath(next.slice(4), 'b/');
      current.text = [];
      body = 'text';
      continue;
    }
    if (line === 'GIT binary patch') {
      current.binary = { payloads: [] };
      body = 'binary';
      continue;
    }
    if (line.length !== 0) fail();
  }
  if (current !== undefined) finish();
  if (records.length === 0) fail();
  return Object.freeze(records);
}

function decodeBinaryPayload(payload: BinaryPayload): Buffer {
  const chunks: Buffer[] = [];
  let compressedLength = 0;
  for (const line of payload.lines) {
    const lengthCode = line.charCodeAt(0);
    const length = lengthCode >= 65 && lengthCode <= 90 ? lengthCode - 64 : lengthCode >= 97 && lengthCode <= 122 ? lengthCode - 70 : -1;
    const encodedLength = 1 + (Math.ceil(length / 4) * 5);
    if (length < 1 || length > 52 || line.length !== encodedLength || compressedLength + length > MAX_INLINE_TEXT_BYTES) fail();
    const block = Buffer.allocUnsafe(Math.ceil(length / 4) * 4);
    let blockOffset = 0;
    for (let index = 1; index < line.length; index += 5) {
      let value = 0;
      for (const character of line.slice(index, index + 5)) {
        const digit = BASE85_ALPHABET.indexOf(character);
        if (digit < 0) fail();
        value = (value * 85) + digit;
      }
      if (value > 0xffffffff) fail();
      block.writeUInt32BE(value, blockOffset);
      blockOffset += 4;
    }
    chunks.push(block.subarray(0, length));
    compressedLength += length;
  }
  try {
    const compressed = Buffer.concat(chunks, compressedLength);
    const inflated: unknown = inflateSync(compressed, {
      info: true,
      maxOutputLength: MAX_GROUNDED_OBJECT_BYTES,
    });
    if (
      typeof inflated !== 'object' ||
      inflated === null ||
      !('buffer' in inflated) ||
      !Buffer.isBuffer(inflated.buffer) ||
      !('engine' in inflated) ||
      typeof inflated.engine !== 'object' ||
      inflated.engine === null ||
      !('bytesWritten' in inflated.engine) ||
      inflated.engine.bytesWritten !== compressed.length
    ) fail();
    const decoded = Buffer.from(inflated.buffer);
    if (decoded.length !== payload.declaredSize) fail();
    return decoded;
  } catch (error) {
    if (error instanceof ExactPatchGroundingError) throw error;
    return fail();
  }
}

function readVarint(bytes: Buffer, offset: { value: number }): number {
  let value = 0;
  let shift = 0;
  while (true) {
    const byte = bytes[offset.value++];
    if (byte === undefined || shift > 28) fail();
    value += (byte & 127) * (2 ** shift);
    if (!Number.isSafeInteger(value) || value > MAX_GROUNDED_OBJECT_BYTES) fail();
    if ((byte & 128) === 0) return value;
    shift += 7;
  }
}

function applyDelta(base: Buffer, delta: Buffer): Buffer {
  const offset = { value: 0 };
  if (readVarint(delta, offset) !== base.length) fail();
  const resultSize = readVarint(delta, offset);
  if (resultSize > MAX_GROUNDED_OBJECT_BYTES) fail();
  const result: Buffer[] = [];
  let length = 0;
  while (offset.value < delta.length) {
    const instruction = delta[offset.value++]!;
    if ((instruction & 128) === 0) {
      if (instruction === 0 || offset.value + instruction > delta.length) fail();
      if (length > resultSize - instruction) fail();
      result.push(delta.subarray(offset.value, offset.value + instruction)); offset.value += instruction; length += instruction;
      continue;
    }
    let source = 0; let count = 0;
    for (let bit = 0; bit < 4; bit += 1) if ((instruction & (1 << bit)) !== 0) source |= (delta[offset.value++] ?? fail()) << (bit * 8);
    for (let bit = 0; bit < 3; bit += 1) if ((instruction & (1 << (bit + 4))) !== 0) count |= (delta[offset.value++] ?? fail()) << (bit * 8);
    if (count === 0) count = 0x10000;
    if (source + count > base.length || length > resultSize - count) fail();
    result.push(base.subarray(source, source + count)); length += count;
  }
  if (length !== resultSize) fail();
  return Buffer.concat(result, resultSize);
}

function applyText(preimage: Buffer, lines: readonly string[]): Buffer {
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(preimage); } catch { return fail(); }
  let originalLineCount = preimage.length > 0 && preimage[preimage.length - 1] !== 10 ? 1 : 0;
  for (const byte of preimage) {
    if (byte === 10 && ++originalLineCount > MAX_PATCH_LINES) fail();
  }
  const original = source.match(/.*(?:\n|$)/gu)?.filter((line) => line.length > 0) ?? [];
  if (original.length !== originalLineCount) fail();
  const output: string[] = [];
  let outputBytes = 0;
  const append = (value: string) => {
    outputBytes += Buffer.byteLength(value, 'utf8');
    if (outputBytes > MAX_GROUNDED_OBJECT_BYTES) fail();
    output.push(value);
  };
  let cursor = 0;
  let hunkCount = 0;
  let hunk: { oldCount: number; newCount: number; oldConsumed: number; newConsumed: number } | undefined;
  const completeHunk = () => hunk !== undefined && hunk.oldConsumed === hunk.oldCount && hunk.newConsumed === hunk.newCount;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = /^@@ -(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? \+(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? @@(?: .*)?$/u.exec(line);
    if (header !== null) {
      if (hunk !== undefined && !completeHunk()) fail();
      if (++hunkCount > MAX_PATCH_HUNKS) fail();
      const oldStart = Number(header[1]);
      const oldCount = Number(header[2] ?? 1);
      const newStart = Number(header[3]);
      const newCount = Number(header[4] ?? 1);
      if (![oldStart, oldCount, newStart, newCount].every((value) => Number.isSafeInteger(value) && value <= MAX_PATCH_LINES)) fail();
      if ((oldCount > 0 && oldStart === 0) || (newCount > 0 && newStart === 0)) fail();
      const oldIndex = oldCount === 0 ? oldStart : oldStart - 1;
      const newIndex = newCount === 0 ? newStart : newStart - 1;
      if (oldIndex < cursor || oldIndex > original.length) fail();
      for (const value of original.slice(cursor, oldIndex)) append(value);
      cursor = oldIndex;
      if (newIndex !== output.length) fail();
      hunk = { oldCount, newCount, oldConsumed: 0, newConsumed: 0 };
      continue;
    }
    if (line.length === 0 && index === lines.length - 1 && completeHunk()) continue;
    if (hunk === undefined || completeHunk() || line === '\\ No newline at end of file') fail();
    const prefix = line[0];
    if (prefix !== ' ' && prefix !== '+' && prefix !== '-') fail();
    const noNewline = lines[index + 1] === '\\ No newline at end of file';
    if (noNewline) index += 1;
    const value = `${line.slice(1)}${noNewline ? '' : '\n'}`;
    if (prefix === ' ' || prefix === '-') {
      if (hunk.oldConsumed >= hunk.oldCount || original[cursor] !== value) fail();
      hunk.oldConsumed += 1;
      cursor += 1;
    }
    if (prefix === ' ' || prefix === '+') {
      if (hunk.newConsumed >= hunk.newCount) fail();
      hunk.newConsumed += 1;
      append(value);
    }
  }
  if (hunkCount === 0 || !completeHunk()) fail();
  for (const value of original.slice(cursor)) append(value);
  return Buffer.from(output.join(''), 'utf8');
}

export function blobOid(bytes: Buffer, format: 'sha1' | 'sha256'): string {
  return createHash(format).update(`blob ${bytes.length}\0`, 'ascii').update(bytes).digest('hex');
}

function availability(oldMode: string, newMode: string, oldBytes: Buffer | undefined, newBytes: Buffer | undefined): Availability {
  if (oldMode === '160000' || newMode === '160000') return Object.freeze({ kind: 'unsupported', reason: 'submodule' });
  if (oldMode === '120000' || newMode === '120000') return Object.freeze({ kind: 'unsupported', reason: 'symlink' });
  const modes = [oldMode, newMode].filter((mode) => mode !== '000000');
  const bytes = [oldBytes, newBytes].filter((value) => value !== undefined);
  if (modes.length === 0 || modes.some((mode) => !/^100(?:644|755)$/u.test(mode)) || bytes.length !== modes.length) return Object.freeze({ kind: 'unsupported', reason: 'mode-or-type' });
  if (bytes.some((value) => value.length > MAX_INLINE_TEXT_BYTES)) return Object.freeze({ kind: 'unsupported', reason: 'oversized' });
  if (bytes.some((value) => value.includes(0))) return Object.freeze({ kind: 'unsupported', reason: 'binary' });
  try {
    for (const value of bytes) new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    return Object.freeze({ kind: 'unsupported', reason: 'non-utf8' });
  }
  return Object.freeze({ kind: 'text' });
}

async function repositoryTree(root: string, runner: GitRunner, signal?: AbortSignal): Promise<ReadonlyMap<string, TargetEntry>> {
  const result = await runner.run(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd: root, maxStdoutBytes: MAX_REPOSITORY_TREE_BYTES, signal });
  const tree = new Map<string, TargetEntry>();
  for (const record of result.stdout.toString('latin1').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t'); const header = record.slice(0, tab); const path = Buffer.from(record.slice(tab + 1), 'latin1');
    const fields = header.split(' ');
    if (tab < 0 || fields.length !== 3 || !modePattern.test(fields[0]!) || !oidPattern.test(fields[2]!)) fail();
    if (tree.size >= MAX_PATCH_LINES) fail();
    tree.set(path.toString('base64url'), Object.freeze({ mode: fields[0]!, type: fields[1]!, oid: fields[2]! }));
  }
  return tree;
}

async function worktreeEntry(
  root: string,
  path: ParsedPath,
  expectedMode: string,
  runner: GitRunner,
  signal?: AbortSignal,
): Promise<ActualTargetEntry | undefined> {
  try {
    let current = Buffer.from(root, 'utf8');
    const parts = path.bytes.toString('latin1').split('/');
    for (const [index, part] of parts.entries()) {
      current = Buffer.concat([current, Buffer.from('/', 'ascii'), Buffer.from(part, 'latin1')]);
      const entry = await lstat(current);
      if (index < parts.length - 1 && entry.isSymbolicLink()) fail();
      if (index === parts.length - 1) {
        if (entry.isSymbolicLink()) {
          const bytes = await readlink(current, { encoding: 'buffer' });
          if (bytes.length > MAX_GROUNDED_OBJECT_BYTES) fail();
          return Object.freeze({ mode: '120000', type: 'blob', bytes });
        }
        if (entry.isFile()) {
          if (entry.size > MAX_GROUNDED_OBJECT_BYTES) fail();
          const bytes = await readFile(current);
          if (bytes.length > MAX_GROUNDED_OBJECT_BYTES) fail();
          return Object.freeze({ mode: (entry.mode & 0o111) === 0 ? '100644' : '100755', type: 'blob', bytes });
        }
        if (entry.isDirectory() && expectedMode === '160000' && path.path.utf8 !== undefined) {
          const result = await runner.run(['rev-parse', '--verify', 'HEAD^{commit}'], {
            cwd: current.toString('utf8'),
            maxStdoutBytes: 65,
            signal,
          });
          return Object.freeze({ mode: '160000', type: 'commit', oid: result.stdout.toString('ascii').trim() });
        }
        fail();
      }
    }
    return undefined;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function createGroundedExactPatch(options: CreateGroundedExactPatchOptions): Promise<GroundedExactPatch> {
  try {
    const submittedByteLength = Buffer.byteLength(options.patchContent, 'utf8');
    if (options.patchContent.length === 0 || options.patchContent.includes('\0') || !validUnicode(options.patchContent) || submittedByteLength > MAX_INLINE_TEXT_BYTES) fail();
    const runner = createGitRunner();
    const repository = await discoverGitRepository(options.cwd, runner, options.signal);
    const formatResult = await runner.run(['rev-parse', '--show-object-format'], { cwd: repository.root, maxStdoutBytes: 16, signal: options.signal });
    const objectFormat = formatResult.stdout.toString('ascii').trim();
    if (objectFormat !== 'sha1' && objectFormat !== 'sha256') fail();
    const oidLength = objectFormat === 'sha1' ? 40 : 64;
    const records = parsePatch(options.patchContent, oidLength);
    const objectReader = createObjectReader(repository.root, { runner });
    const tree = options.target.kind === 'repository' ? await repositoryTree(repository.root, runner, options.signal) : undefined;
    const seen = new Set<string>();
    const files: ChangedFile[] = [];
    const contents = new Map<string, Readonly<{ readonly preimage: Buffer | undefined; readonly postimage: Buffer | undefined }>>();
    let groundedByteLength = 0;

    const readTarget = async (path: ParsedPath, expectedMode: string): Promise<ActualTargetEntry | undefined> => {
      if (tree === undefined) return worktreeEntry(repository.root, path, expectedMode, runner, options.signal);
      const entry = tree.get(path.bytes.toString('base64url'));
      if (entry === undefined) return undefined;
      if (entry.type !== 'blob') return Object.freeze({ mode: entry.mode, type: entry.type, oid: entry.oid });
      const metadata = await objectReader.inspect(entry.oid, options.signal);
      if (metadata.kind !== 'available' || metadata.objectType !== 'blob' || metadata.size > MAX_GROUNDED_OBJECT_BYTES) fail();
      const object = await objectReader.read(entry.oid, { maxBytes: MAX_GROUNDED_OBJECT_BYTES, signal: options.signal });
      if (object.kind !== 'available' || object.bytes.length !== metadata.size) fail();
      return Object.freeze({ mode: entry.mode, type: entry.type, oid: entry.oid, bytes: Buffer.from(object.bytes) });
    };

    for (const [index, record] of records.entries()) {
      const absentOid = '0'.repeat(oidLength);
      if (!modePattern.test(record.oldMode) || !modePattern.test(record.newMode)) fail();
      const oldAbsent = record.oldOid === absentOid;
      const newAbsent = record.newOid === absentOid;
      if (
        oldAbsent !== (record.oldMode === '000000') ||
        newAbsent !== (record.newMode === '000000') ||
        oldAbsent !== (record.oldPath === undefined) ||
        newAbsent !== (record.newPath === undefined) ||
        (oldAbsent && newAbsent)
      ) fail();
      const identity = `${record.oldPath?.path.bytesBase64url ?? ''}\0${record.newPath?.path.bytesBase64url ?? ''}`;
      if (seen.has(identity)) fail();
      seen.add(identity);

      let oldBytes: Buffer | undefined;
      let patchPreimage: Buffer = Buffer.alloc(0);
      if (!oldAbsent) {
        const metadata = await objectReader.inspect(record.oldOid, options.signal);
        if (metadata.kind !== 'available') fail();
        if (record.oldMode === '160000') {
          if (metadata.objectType !== 'commit') fail();
          patchPreimage = Buffer.from(`Subproject commit ${record.oldOid}\n`, 'ascii');
        } else {
          if (metadata.objectType !== 'blob' || metadata.size > MAX_GROUNDED_OBJECT_BYTES || groundedByteLength > MAX_GROUNDED_TOTAL_BYTES - metadata.size) fail();
          const preimage = await objectReader.read(record.oldOid, { maxBytes: MAX_GROUNDED_OBJECT_BYTES, signal: options.signal });
          if (preimage.kind !== 'available' || preimage.bytes.length !== metadata.size) fail();
          oldBytes = Buffer.from(preimage.bytes);
          patchPreimage = oldBytes;
          groundedByteLength += oldBytes.length;
        }
      }

      let produced: Buffer;
      if (record.text !== undefined) {
        produced = applyText(patchPreimage, record.text);
      } else if (record.binary !== undefined) {
        const forward = decodeBinaryPayload(record.binary.forward);
        produced = record.binary.forward.kind === 'delta' ? applyDelta(patchPreimage, forward) : forward;
        const reverse = decodeBinaryPayload(record.binary.reverse);
        const reversed = record.binary.reverse.kind === 'delta' ? applyDelta(produced, reverse) : reverse;
        if (!reversed.equals(patchPreimage)) fail();
      } else {
        produced = Buffer.from(patchPreimage);
      }

      let postBytes: Buffer | undefined;
      if (newAbsent) {
        if (produced.length !== 0) fail();
      } else if (record.newMode === '160000') {
        if (!produced.equals(Buffer.from(`Subproject commit ${record.newOid}\n`, 'ascii'))) fail();
      } else {
        if (produced.length > MAX_GROUNDED_OBJECT_BYTES || blobOid(produced, objectFormat) !== record.newOid || groundedByteLength > MAX_GROUNDED_TOTAL_BYTES - produced.length) fail();
        postBytes = Buffer.from(produced);
        groundedByteLength += postBytes.length;
      }

      const oldPathMustBeAbsent = newAbsent || (
        record.status === 'R' &&
        record.oldPath !== undefined &&
        record.newPath !== undefined &&
        !record.oldPath.bytes.equals(record.newPath.bytes)
      );
      if (oldPathMustBeAbsent && record.oldPath !== undefined && await readTarget(record.oldPath, record.oldMode) !== undefined) {
        fail('Patch does not match the selected target.');
      }
      if (!newAbsent) {
        const actual = await readTarget(record.newPath!, record.newMode);
        const mismatch = actual === undefined ||
          actual.mode !== record.newMode ||
          (record.newMode === '160000'
            ? actual.type !== 'commit' || actual.oid !== record.newOid
            : actual.type !== 'blob' || actual.bytes === undefined || postBytes === undefined || !actual.bytes.equals(postBytes));
        if (mismatch) fail('Patch does not match the selected target.');
      }

      const statusCode = record.status === 'R' ? 'R' : record.status === 'C' ? 'C' : oldAbsent ? 'A' : newAbsent ? 'D' : record.oldMode !== record.newMode ? 'T' : 'M';
      const kind: ChangedFileStatusKind = statusCode === 'A' ? 'added' : statusCode === 'D' ? 'deleted' : statusCode === 'R' ? 'renamed' : statusCode === 'C' ? 'copied' : statusCode === 'T' ? 'type-changed' : 'modified';
      const id = `file_${createHash('sha256').update(`${index}\0${identity}`, 'utf8').digest('base64url')}`;
      const additions = record.binary === undefined ? record.text?.filter((line) => line.startsWith('+')).length ?? 0 : null;
      const deletions = record.binary === undefined ? record.text?.filter((line) => line.startsWith('-')).length ?? 0 : null;
      files.push(Object.freeze({
        id,
        status: Object.freeze({ code: statusCode, kind, similarity: record.similarity }),
        oldMode: record.oldMode,
        newMode: record.newMode,
        oldBlobOid: record.oldOid,
        newBlobOid: record.newOid,
        ...(record.oldPath === undefined ? {} : { oldPath: record.oldPath.path }),
        ...(record.newPath === undefined ? {} : { newPath: record.newPath.path }),
        additions,
        deletions,
        availability: availability(record.oldMode, record.newMode, oldBytes, postBytes),
      }));
      contents.set(id, Object.freeze({
        preimage: oldBytes === undefined ? undefined : Buffer.from(oldBytes),
        postimage: postBytes === undefined ? undefined : Buffer.from(postBytes),
      }));
    }
    const scope = Object.freeze({
      kind: 'exact-patch' as const,
      digest: createHash('sha256').update(Buffer.from(options.patchContent, 'utf8')).digest('hex'),
      validationTarget: Object.freeze({ ...options.target }),
      submittedByteLength,
    });
    return Object.freeze({ repositoryRoot: repository.root, objectFormat, scope, changedFiles: Object.freeze(files), contents: new Map(contents) });
  } catch (error) {
    if (error instanceof ExactPatchGroundingError) throw error;
    throw new ExactPatchGroundingError();
  }
}
