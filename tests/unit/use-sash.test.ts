import { shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';

import { clampAxisValue, useSash } from '../../src/web/composables/useSash.js';

describe('clampAxisValue', () => {
  it('a drag from 264 by +50 produces a clamped value of 314', () => {
    expect(clampAxisValue(264 + 50, 170, 520)).toBe(314);
  });

  it('a drag with a delta of +1000 clamps to 520 (max), never exceeding it', () => {
    expect(clampAxisValue(264 + 1000, 170, 520)).toBe(520);
  });

  it('a drag with a delta of -1000 clamps to 170 (min), never going below it', () => {
    expect(clampAxisValue(264 - 1000, 170, 520)).toBe(170);
  });
});

describe('useSash reset', () => {
  it('a double-click reset always returns exactly the default, regardless of the current dragged value', () => {
    const value = shallowRef(480);
    let committed: number | undefined;
    const sash = useSash({
      axis: 'vertical',
      min: 170,
      max: 520,
      default: 264,
      value,
      onCommit: (next) => {
        committed = next;
      },
    });

    sash.reset();

    expect(value.value).toBe(264);
    expect(committed).toBe(264);
  });
});
