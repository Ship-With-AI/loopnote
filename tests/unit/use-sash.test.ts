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

describe('useSash drag direction', () => {
  function dragBy(axis: 'horizontal' | 'vertical', delta: number) {
    const value = shallowRef(300);
    const listeners = new Map<string, (event: PointerEvent) => void>();
    const target = {
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      addEventListener: (type: string, listener: (event: PointerEvent) => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const sash = useSash({ axis, min: 120, max: 520, default: 300, value, onCommit: () => {} });
    const at = (coordinate: number) => ({
      currentTarget: target,
      pointerId: 1,
      clientX: axis === 'vertical' ? coordinate : 0,
      clientY: axis === 'vertical' ? 0 : coordinate,
      preventDefault: () => {},
    }) as unknown as PointerEvent;
    sash.handlers.onPointerdown(at(400));
    listeners.get('pointermove')!(at(400 + delta));
    return { value, listeners, isDragging: sash.isDragging };
  }

  it('a rightward drag on the vertical side-bar sash grows the side bar', () => {
    expect(dragBy('vertical', 60).value.value).toBe(360);
  });

  it('a downward drag on the horizontal panel sash shrinks the panel', () => {
    expect(dragBy('horizontal', 60).value.value).toBe(240);
  });

  it('pointercancel detaches every listener and clears the dragging flag', () => {
    const { listeners, isDragging } = dragBy('horizontal', 60);
    listeners.get('pointercancel')!({} as unknown as PointerEvent);
    expect(listeners.size).toBe(0);
    expect(isDragging.value).toBe(false);
  });
});
