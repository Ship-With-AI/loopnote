import type {
  Availability,
  ChangedFile,
  UnsupportedAvailabilityReason,
} from '../contracts/comparison.js';
import type { ObjectReader } from './objects.js';

export type {
  Availability,
  UnsupportedAvailabilityReason,
} from '../contracts/comparison.js';

export const MAX_INLINE_TEXT_BYTES = 1_048_576;

const regularFileModes: Readonly<Record<string, true>> = Object.freeze({
  '100644': true,
  '100755': true,
});
const textAvailability: Availability = Object.freeze({ kind: 'text' });
const missingAvailability: Availability = Object.freeze({
  kind: 'unavailable',
  reason: 'missing-object',
});
const unsupportedAvailability: Readonly<
  Record<UnsupportedAvailabilityReason, Availability>
> = Object.freeze({
  binary: Object.freeze({ kind: 'unsupported', reason: 'binary' }),
  'mode-or-type': Object.freeze({
    kind: 'unsupported',
    reason: 'mode-or-type',
  }),
  'non-utf8': Object.freeze({ kind: 'unsupported', reason: 'non-utf8' }),
  oversized: Object.freeze({ kind: 'unsupported', reason: 'oversized' }),
  submodule: Object.freeze({ kind: 'unsupported', reason: 'submodule' }),
  symlink: Object.freeze({ kind: 'unsupported', reason: 'symlink' }),
  'changed-during-capture': Object.freeze({
    kind: 'unsupported',
    reason: 'changed-during-capture',
  }),
});
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

export type AvailabilityInput = Pick<
  ChangedFile,
  | 'additions'
  | 'deletions'
  | 'newBlobOid'
  | 'newMode'
  | 'oldBlobOid'
  | 'oldMode'
  | 'status'
>;

export async function classifyAvailability(
  file: AvailabilityInput,
  objectReader: ObjectReader,
  signal?: AbortSignal,
): Promise<Availability> {
  if (file.oldMode === '160000' || file.newMode === '160000') {
    return unsupportedAvailability.submodule;
  }
  if (file.oldMode === '120000' || file.newMode === '120000') {
    return unsupportedAvailability.symlink;
  }
  if (file.status.kind === 'unsupported') {
    return unsupportedAvailability['mode-or-type'];
  }

  const sides: Array<{ readonly mode: string; readonly oid: string }> = [];
  if (file.oldMode !== '000000') {
    if (regularFileModes[file.oldMode] !== true) {
      return unsupportedAvailability['mode-or-type'];
    }
    sides.push({ mode: file.oldMode, oid: file.oldBlobOid });
  }
  if (file.newMode !== '000000') {
    if (regularFileModes[file.newMode] !== true) {
      return unsupportedAvailability['mode-or-type'];
    }
    sides.push({ mode: file.newMode, oid: file.newBlobOid });
  }
  if (sides.length === 0) {
    return unsupportedAvailability['mode-or-type'];
  }

  const sizes: number[] = [];
  for (const side of sides) {
    const metadata = await objectReader.inspect(side.oid, signal);
    if (metadata.kind === 'missing' || metadata.objectType !== 'blob') {
      return missingAvailability;
    }
    sizes.push(metadata.size);
  }
  if (sizes.some((size) => size > MAX_INLINE_TEXT_BYTES)) {
    return unsupportedAvailability.oversized;
  }
  if (file.additions === null || file.deletions === null) {
    return unsupportedAvailability.binary;
  }

  const contents: Buffer[] = [];
  for (let index = 0; index < sides.length; index += 1) {
    const side = sides[index]!;
    const content = await objectReader.read(side.oid, {
      maxBytes: MAX_INLINE_TEXT_BYTES,
      signal,
    });
    if (
      content.kind === 'missing' ||
      content.bytes.byteLength !== sizes[index]
    ) {
      return missingAvailability;
    }
    contents.push(content.bytes);
  }
  if (contents.some((content) => content.includes(0))) {
    return unsupportedAvailability.binary;
  }

  try {
    for (const content of contents) {
      fatalUtf8Decoder.decode(content);
    }
  } catch {
    return unsupportedAvailability['non-utf8'];
  }
  return textAvailability;
}
