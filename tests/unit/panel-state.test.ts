import { describe, expect, it } from 'vitest';

import {
  PANEL_STATE_STORAGE_KEY,
  clampPanelHeight,
  clampSidebarWidth,
  createPanelState,
  parsePanelState,
} from '../../src/web/model/panel-state.js';

function createFakeStorage(initial: Record<string, string> = {}): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when inside range', () => {
    expect(clampSidebarWidth(264)).toBe(264);
  });

  it('clamps a value below the minimum up to 170', () => {
    expect(clampSidebarWidth(50)).toBe(170);
  });

  it('clamps a value above the maximum down to 520', () => {
    expect(clampSidebarWidth(9999)).toBe(520);
  });
});

describe('clampPanelHeight', () => {
  it('clamps below the minimum to 120, above the maximum to 520, and leaves an in-range value unchanged', () => {
    expect(clampPanelHeight(50)).toBe(120);
    expect(clampPanelHeight(9999)).toBe(520);
    expect(clampPanelHeight(240)).toBe(240);
  });
});

describe('parsePanelState', () => {
  it('returns all defaults when no stored key exists', () => {
    expect(parsePanelState(null)).toEqual({
      sidebarWidth: 264,
      sidebarVisible: true,
      panelHeight: 240,
    });
  });

  it('returns all defaults without throwing when the stored value is not valid JSON', () => {
    expect(parsePanelState('not json')).toEqual({
      sidebarWidth: 264,
      sidebarVisible: true,
      panelHeight: 240,
    });
  });

  it('clamps an out-of-range stored sidebarWidth while passing valid fields through', () => {
    expect(
      parsePanelState('{"sidebarWidth":999,"sidebarVisible":true,"panelHeight":240}'),
    ).toEqual({
      sidebarWidth: 520,
      sidebarVisible: true,
      panelHeight: 240,
    });
  });

  it('falls back non-numeric/non-boolean fields to their own default independently, not the whole object', () => {
    expect(
      parsePanelState('{"sidebarWidth":"abc","sidebarVisible":"yes","panelHeight":240}'),
    ).toEqual({
      sidebarWidth: 264,
      sidebarVisible: true,
      panelHeight: 240,
    });
  });

  it('preserves an explicit false sidebarVisible instead of truthiness-coercing it to the default', () => {
    expect(parsePanelState('{"sidebarVisible":false}')).toEqual({
      sidebarWidth: 264,
      sidebarVisible: false,
      panelHeight: 240,
    });
  });

  it('returns all defaults when the parsed JSON is valid but the wrong shape (array)', () => {
    expect(parsePanelState('[]')).toEqual({
      sidebarWidth: 264,
      sidebarVisible: true,
      panelHeight: 240,
    });
  });
});

describe('createPanelState', () => {
  it('self-heals a corrupt stored value to all defaults immediately on creation, never throwing', () => {
    const storage = createFakeStorage({
      [PANEL_STATE_STORAGE_KEY]: 'not json',
    });
    const state = createPanelState({ storage });
    expect(state.sidebarWidth.value).toBe(264);
    expect(state.sidebarVisible.value).toBe(true);
    expect(state.panelHeight.value).toBe(240);
  });

  it('writes a corrected, in-range JSON value back to storage on persist()', () => {
    const storage = createFakeStorage({
      [PANEL_STATE_STORAGE_KEY]: 'not json',
    });
    const state = createPanelState({ storage });
    state.persist();
    expect(storage.data.get(PANEL_STATE_STORAGE_KEY)).toBe(
      JSON.stringify({ sidebarWidth: 264, sidebarVisible: true, panelHeight: 240 }),
    );
  });

  it('round-trips an already-valid stored value with nothing defaulted', () => {
    const storage = createFakeStorage({
      [PANEL_STATE_STORAGE_KEY]: JSON.stringify({
        sidebarWidth: 300,
        sidebarVisible: false,
        panelHeight: 200,
      }),
    });
    const state = createPanelState({ storage });
    expect(state.sidebarWidth.value).toBe(300);
    expect(state.sidebarVisible.value).toBe(false);
    expect(state.panelHeight.value).toBe(200);
  });
});
