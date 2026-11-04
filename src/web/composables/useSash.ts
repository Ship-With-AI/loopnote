import { ref, type Ref, type ShallowRef } from 'vue';

/**
 * SHELL-02/SHELL-03/T-20-06: clamps a candidate axis value (sidebar width or
 * panel height, in px) to its documented drag bounds. Every write to a live
 * sash value passes through this function first so an adversarial or buggy
 * pointer-event sequence (huge delta, negative delta) can never produce a
 * zero/negative/unbounded layout dimension.
 */
export function clampAxisValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface UseSashOptions {
  /**
   * The sash's own visual orientation: `'vertical'` for a vertical bar that
   * resizes a horizontal dimension (width, e.g. the side-bar sash), and
   * `'horizontal'` for a horizontal bar that resizes a vertical dimension
   * (height, e.g. the panel sash) — matching UI-SPEC's `aria-orientation`.
   */
  readonly axis: 'horizontal' | 'vertical';
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly value: Ref<number> | ShallowRef<number>;
  readonly onCommit: (value: number) => void;
}

export interface UseSashResult {
  readonly handlers: { onPointerdown: (event: PointerEvent) => void };
  readonly isDragging: Ref<boolean>;
  reset(): void;
}

/**
 * Reusable single-axis pointer drag-resize composable. Used identically for
 * the vertical side-bar sash and the horizontal panel sash: pointerdown
 * captures the pointer, pointermove clamps a live px value via
 * `clampAxisValue`, pointerup commits the final value. A double-click
 * handler is exposed separately via `reset()`. Pure logic plus pointer-event
 * wiring only — zero DOM/template, zero import of any `.vue` file.
 */
export function useSash(options: UseSashOptions): UseSashResult {
  const isDragging = ref(false);

  let startCoordinate = 0;
  let startValue = 0;
  let activeTarget: HTMLElement | undefined;
  let activePointerId: number | undefined;

  function coordinateOf(event: PointerEvent): number {
    return options.axis === 'vertical' ? event.clientX : event.clientY;
  }

  function onPointermove(event: PointerEvent): void {
    const delta = coordinateOf(event) - startCoordinate;
    // The side bar sits left of its vertical sash, so a rightward drag grows it.
    // The bottom panel sits below its horizontal sash with a pinned bottom edge,
    // so a downward drag must shrink it.
    const signedDelta = options.axis === 'vertical' ? delta : -delta;
    options.value.value = clampAxisValue(startValue + signedDelta, options.min, options.max);
  }

  function onPointerup(event: PointerEvent): void {
    if (activeTarget !== undefined && activePointerId !== undefined) {
      activeTarget.releasePointerCapture(activePointerId);
      activeTarget.removeEventListener('pointermove', onPointermove);
      activeTarget.removeEventListener('pointerup', onPointerup);
    }
    activeTarget = undefined;
    activePointerId = undefined;
    isDragging.value = false;
    options.onCommit(options.value.value);
    void event;
  }

  function onPointerdown(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    startCoordinate = coordinateOf(event);
    startValue = options.value.value;
    target.setPointerCapture(event.pointerId);
    activeTarget = target;
    activePointerId = event.pointerId;
    isDragging.value = true;
    target.addEventListener('pointermove', onPointermove);
    target.addEventListener('pointerup', onPointerup);
  }

  function reset(): void {
    options.value.value = options.default;
    options.onCommit(options.default);
  }

  return {
    handlers: { onPointerdown },
    isDragging,
    reset,
  };
}
