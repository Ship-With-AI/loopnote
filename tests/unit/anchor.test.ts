import { describe, expect, test } from 'vitest';

import type { ExactPathDto } from '../../src/contracts/comparison.js';
import {
  buildDurableAnchor,
  verifyDurableAnchor,
} from '../../src/domain/anchor.js';

function path(value: string): ExactPathDto {
  return {
    bytesBase64url: Buffer.from(value, 'utf8').toString('base64url'),
    display: value.replaceAll('\n', '\\n').replaceAll('\r', '\\r'),
    utf8: value,
  };
}

describe('canonical side-specific anchors', () => {
  test('derives exact model-line text and bounded numbered context across line endings', () => {
    const anchor = buildDurableAnchor({
      path: path('src/\u03b4\nname.ts'),
      safeDisplayPath: 'src/\u03b4\\nname.ts',
      side: 'base',
      blobOid: 'a'.repeat(40),
      line: 4,
      text: 'first\r\n\r\nthird\r\nselected\r\nfifth\r\nsixth\r\nseventh',
    });

    expect(anchor.selectedText).toBe('selected');
    expect(anchor.context).toEqual({
      before: [
        { line: 1, text: 'first' },
        { line: 2, text: '' },
        { line: 3, text: 'third' },
      ],
      target: { line: 4, text: 'selected' },
      after: [
        { line: 5, text: 'fifth' },
        { line: 6, text: 'sixth' },
        { line: 7, text: 'seventh' },
      ],
    });
    expect(anchor.contextHash).toEqual({
      algorithm: 'sha256-v1',
      value: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('preserves first, last, only, blank, empty, and no-final-newline model lines', () => {
    const cases = [
      { text: 'first\nlast', line: 1, selected: 'first', before: 0, after: 1 },
      { text: 'first\nlast', line: 2, selected: 'last', before: 1, after: 0 },
      { text: 'only', line: 1, selected: 'only', before: 0, after: 0 },
      { text: '', line: 1, selected: '', before: 0, after: 0 },
      { text: 'one\n\nthree\nfour', line: 2, selected: '', before: 1, after: 2 },
    ] as const;

    for (const entry of cases) {
      const anchor = buildDurableAnchor({
        path: path('line-boundary.txt'),
        safeDisplayPath: 'line-boundary.txt',
        side: 'head',
        blobOid: 'b'.repeat(64),
        line: entry.line,
        text: entry.text,
      });
      expect(anchor.selectedText).toBe(entry.selected);
      expect(anchor.context.before).toHaveLength(entry.before);
      expect(anchor.context.after).toHaveLength(entry.after);
    }
  });

  test('uses framed lossless bytes, opaque oid lengths, and side in deterministic hashes and duplicate keys', () => {
    const common = {
      path: path('odd\u0000\u03c0\npath.ts'),
      safeDisplayPath: 'odd\\u{00}\u03c0\\npath.ts',
      blobOid: 'c'.repeat(64),
      line: 1,
      text: 'same',
    } as const;
    const base = buildDurableAnchor({ ...common, side: 'base' });
    const repeated = buildDurableAnchor({ ...common, side: 'base' });
    const head = buildDurableAnchor({ ...common, side: 'head' });
    const sha1 = buildDurableAnchor({ ...common, side: 'base', blobOid: 'd'.repeat(40) });

    expect(repeated).toEqual(base);
    expect(head.contextHash.value).not.toBe(base.contextHash.value);
    expect(head.uniqueKey).not.toBe(base.uniqueKey);
    expect(sha1.uniqueKey).not.toBe(base.uniqueKey);
  });

  test('classifies exact verification without changing the stored anchor or relocating it', () => {
    const recorded = buildDurableAnchor({
      path: path('old-name.ts'),
      safeDisplayPath: 'old-name.ts',
      side: 'base',
      blobOid: 'e'.repeat(40),
      line: 2,
      text: 'first\nneedle\nlast',
    });
    const frozenRecord = structuredClone(recorded);
    const exact = buildDurableAnchor({
      path: path('old-name.ts'),
      safeDisplayPath: 'old-name.ts',
      side: 'base',
      blobOid: 'e'.repeat(40),
      line: 2,
      text: 'first\nneedle\nlast',
    });
    const movedNeedle = buildDurableAnchor({
      path: path('old-name.ts'),
      safeDisplayPath: 'old-name.ts',
      side: 'base',
      blobOid: 'e'.repeat(40),
      line: 2,
      text: 'first\ninserted\nneedle\nlast',
    });

    expect(verifyDurableAnchor(recorded, exact)).toMatchObject({ state: 'verified' });
    expect(verifyDurableAnchor(recorded, movedNeedle)).toMatchObject({ state: 'stale' });
    expect(verifyDurableAnchor(recorded, undefined)).toMatchObject({ state: 'orphaned' });
    expect(recorded).toEqual(frozenRecord);
    expect(recorded.line).toBe(2);
  });
});

describe('range-aware durable anchors (A-01)', () => {
  test('golden regression: omitting endLine reproduces the exact pre-A-01 contextHash byte sequence', () => {
    const anchor = buildDurableAnchor({
      path: path('src/example.ts'),
      safeDisplayPath: 'src/example.ts',
      side: 'base',
      blobOid: 'a'.repeat(40),
      line: 4,
      text: 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight',
    });

    expect(anchor.endLine).toBeUndefined();
    expect(anchor.contextHash.value).toBe(
      '6b6737df1bd5c8bc1776da0c6cacd8dbb16aaf95a05f090b9cc1c4b7ba1994ef',
    );
  });

  test('a range anchor spans the full [line, endLine] block in selectedText and computes trailing context after endLine', () => {
    const anchor = buildDurableAnchor({
      path: path('src/example.ts'),
      safeDisplayPath: 'src/example.ts',
      side: 'base',
      blobOid: 'a'.repeat(40),
      line: 4,
      endLine: 6,
      text: 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight',
    });

    expect(anchor.endLine).toBe(6);
    expect(anchor.selectedText).toBe('four\nfive\nsix');
    expect(anchor.context.target).toEqual({ line: 4, text: 'four' });
    expect(anchor.context.before).toEqual([
      { line: 1, text: 'one' },
      { line: 2, text: 'two' },
      { line: 3, text: 'three' },
    ]);
    expect(anchor.context.after[0]).toEqual({ line: 7, text: 'seven' });
  });

  test('range anchors hash differently from a single-line anchor at the same line but share the same uniqueKey', () => {
    const common = {
      path: path('src/example.ts'),
      safeDisplayPath: 'src/example.ts',
      side: 'base',
      blobOid: 'a'.repeat(40),
      line: 4,
      text: 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight',
    } as const;
    const singleLine = buildDurableAnchor(common);
    const range = buildDurableAnchor({ ...common, endLine: 6 });

    expect(range.contextHash.value).not.toBe(singleLine.contextHash.value);
    expect(range.uniqueKey).toBe(singleLine.uniqueKey);
  });

  test('rejects endLine below line or beyond the frozen text, matching the existing line-bounds RangeError', () => {
    const input = {
      path: path('bounds.ts'),
      safeDisplayPath: 'bounds.ts',
      side: 'base',
      blobOid: 'h'.repeat(40),
      text: 'one\ntwo\nthree',
    } as const;

    expect(() => buildDurableAnchor({ ...input, line: 2, endLine: 1 })).toThrow(RangeError);
    expect(() => buildDurableAnchor({ ...input, line: 2, endLine: 10 })).toThrow(RangeError);
  });

  test('range anchor verification covers the whole stored range and flips to stale on interior drift or a grown/shrunk range', () => {
    const baseInput = {
      path: path('doc.md'),
      safeDisplayPath: 'doc.md',
      side: 'base',
      blobOid: 'f'.repeat(40),
    } as const;
    const recorded = buildDurableAnchor({
      ...baseInput,
      line: 2,
      endLine: 4,
      text: 'alpha\nbeta\ngamma\ndelta\nepsilon',
    });
    const unchanged = buildDurableAnchor({
      ...baseInput,
      line: 2,
      endLine: 4,
      text: 'alpha\nbeta\ngamma\ndelta\nepsilon',
    });
    const driftedInterior = buildDurableAnchor({
      ...baseInput,
      line: 2,
      endLine: 4,
      text: 'alpha\nbeta\nGAMMA-CHANGED\ndelta\nepsilon',
    });
    const grownRange = buildDurableAnchor({
      ...baseInput,
      line: 2,
      endLine: 5,
      text: 'alpha\nbeta\ngamma\ndelta\nepsilon\nzeta',
    });

    expect(verifyDurableAnchor(recorded, unchanged)).toMatchObject({
      state: 'verified',
      reason: 'exact-match',
    });
    expect(verifyDurableAnchor(recorded, driftedInterior)).toMatchObject({
      state: 'stale',
      reason: 'anchor-mismatch',
    });
    expect(verifyDurableAnchor(recorded, grownRange)).toMatchObject({
      state: 'stale',
      reason: 'anchor-mismatch',
    });
  });

  test('legacy single-line verification stays unchanged when both recorded and current omit endLine', () => {
    const recorded = buildDurableAnchor({
      path: path('legacy.ts'),
      safeDisplayPath: 'legacy.ts',
      side: 'head',
      blobOid: 'g'.repeat(40),
      line: 2,
      text: 'first\nneedle\nlast',
    });
    const current = buildDurableAnchor({
      path: path('legacy.ts'),
      safeDisplayPath: 'legacy.ts',
      side: 'head',
      blobOid: 'g'.repeat(40),
      line: 2,
      text: 'first\nneedle\nlast',
    });

    expect(recorded.endLine).toBeUndefined();
    expect(current.endLine).toBeUndefined();
    expect(verifyDurableAnchor(recorded, current)).toMatchObject({
      state: 'verified',
      reason: 'exact-match',
    });
  });
});
