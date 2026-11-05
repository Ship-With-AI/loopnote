import { describe, expect, test } from 'vitest';

import { truncateMiddle } from '../../src/domain/truncate-middle.js';

describe('truncateMiddle', () => {
  test('returns a string unchanged when shorter than max', () => {
    expect(truncateMiddle('main', 28)).toBe('main');
  });

  test('returns a string unchanged when length is exactly max (no ellipsis added)', () => {
    const text = 'a'.repeat(20);
    expect(truncateMiddle(text, 20)).toBe(text);
  });

  test('truncates a string one character over max to exactly max length with prefix+ellipsis+suffix', () => {
    const text = 'a'.repeat(21);
    const result = truncateMiddle(text, 20);
    expect(result).toHaveLength(20);
    expect(result).toContain('…');
    expect(result.split('…')).toHaveLength(2);
  });

  test('middle-truncates a long ref name, keeping prefix and suffix distinguishable', () => {
    const result = truncateMiddle('feature/payments-processing-v2', 20);

    expect(result.length).toBeLessThanOrEqual(20);
    const ellipsisCount = [...result].filter((char) => char === '…').length;
    expect(ellipsisCount).toBe(1);

    const [prefix, suffix] = result.split('…');
    expect('feature/payments-processing-v2'.startsWith(prefix!)).toBe(true);
    expect('feature/payments-processing-v2'.endsWith(suffix!)).toBe(true);
  });

  test('distinguishes two long values sharing a common prefix', () => {
    const a = truncateMiddle('feature/payments-processing-v2', 20);
    const b = truncateMiddle('feature/payments-processing-v3', 20);
    expect(a).not.toBe(b);
  });

  test('max < 1 returns an empty string', () => {
    expect(truncateMiddle('anything', 0)).toBe('');
    expect(truncateMiddle('anything', -5)).toBe('');
  });

  test('max === 1 returns a single truncated character with no ellipsis', () => {
    const result = truncateMiddle('anything', 1);
    expect(result).toHaveLength(1);
    expect(result).not.toContain('…');
    expect(result).toBe('a');
  });

  test('does not split an astral-plane emoji mid-codepoint', () => {
    // headLen = 10 for max = 20. Placing the emoji at codepoint index 9 means its
    // UTF-16 start offset (9 units in) falls inside what a UTF-16-naive
    // `text.slice(0, headLen)` would take, so a regression away from the
    // `Array.from`-based codepoint slicing would corrupt it into a lone leading
    // surrogate. Under the actual (codepoint-safe) implementation the emoji
    // survives intact in the head segment instead.
    const text = `${'a'.repeat(9)}📁${'c'.repeat(15)}`;
    const result = truncateMiddle(text, 20);

    expect(Array.from(result)).toHaveLength(20);
    expect(result).toContain('📁');
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

  test('does not split an astral-plane emoji mid-codepoint at the tail boundary', () => {
    // The head-boundary case above (headLen = 10) is covered by the previous test. This
    // covers the complementary tail-boundary case (tailLen = 9 for max = 20): placing the
    // emoji as the first codepoint of the tail slice means its UTF-16 start offset falls
    // inside what a UTF-16-naive `text.slice(text.length - tailLen)` would take, corrupting
    // it into a lone trailing surrogate. (The combining-diacritic variant this replaced was
    // not discriminating: a lone base character plus its combining mark are each one UTF-16
    // code unit, so naive `text.slice()` and `Array.from`-based slicing produce byte-identical
    // output regardless of where the cut lands — there is no surrogate pair to split. Codepoint
    // safety does not claim to preserve grapheme-cluster/base+combining-mark adjacency.)
    const text = `${'a'.repeat(15)}📁${'c'.repeat(8)}`;
    const result = truncateMiddle(text, 20);

    expect(Array.from(result)).toHaveLength(20);
    expect(result).toContain('📁');
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

  test('default max is 28 when omitted', () => {
    const text = 'a'.repeat(29);
    const result = truncateMiddle(text);
    expect(result).toHaveLength(28);
  });
});
