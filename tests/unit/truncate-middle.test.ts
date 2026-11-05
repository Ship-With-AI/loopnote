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

  test('does not split a combining diacritic mid-codepoint', () => {
    const base = 'e\u0301'; // e + combining acute accent, 2 UTF-16 code units, 1 grapheme-ish codepoint pair
    const text = `${'x'.repeat(20)}${base}${'y'.repeat(20)}`;
    const result = truncateMiddle(text, 20);

    expect(result).toHaveLength(20);
    expect([...result].every((char) => char.codePointAt(0) !== undefined)).toBe(true);
  });

  test('default max is 28 when omitted', () => {
    const text = 'a'.repeat(29);
    const result = truncateMiddle(text);
    expect(result).toHaveLength(28);
  });
});
