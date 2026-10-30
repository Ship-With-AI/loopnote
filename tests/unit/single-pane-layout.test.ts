import { describe, expect, it } from 'vitest';

import {
  singlePaneSideFor,
  wasModeKind,
} from '../../src/web/model/single-pane-layout.js';

describe('singlePaneSideFor', () => {
  it('routes added files single-pane, anchored to head', () => {
    expect(singlePaneSideFor('added', { kind: 'text' })).toBe('head');
  });

  it('routes deleted files single-pane, anchored to base', () => {
    expect(singlePaneSideFor('deleted', { kind: 'text' })).toBe('base');
  });

  it('routes type-changed files single-pane, anchored to head', () => {
    expect(singlePaneSideFor('type-changed', { kind: 'text' })).toBe('head');
  });

  it('keeps modified files side-by-side', () => {
    expect(singlePaneSideFor('modified', { kind: 'text' })).toBeUndefined();
  });

  it('keeps renamed files side-by-side', () => {
    expect(singlePaneSideFor('renamed', { kind: 'text' })).toBeUndefined();
  });

  it('keeps copied files side-by-side', () => {
    expect(singlePaneSideFor('copied', { kind: 'text' })).toBeUndefined();
  });

  it('keeps unsupported-status files side-by-side', () => {
    expect(singlePaneSideFor('unsupported', { kind: 'text' })).toBeUndefined();
  });

  it('never routes single-pane when availability is unsupported, even for an otherwise-qualifying status', () => {
    expect(
      singlePaneSideFor('added', { kind: 'unsupported', reason: 'binary' }),
    ).toBeUndefined();
  });

  it('never routes single-pane when availability is unavailable', () => {
    expect(
      singlePaneSideFor('deleted', {
        kind: 'unavailable',
        reason: 'missing-object',
      }),
    ).toBeUndefined();
  });
});

describe('wasModeKind', () => {
  it('maps the symlink git mode to a human-readable label', () => {
    expect(wasModeKind('120000')).toBe('symlink');
  });

  it('maps the submodule git mode to a human-readable label', () => {
    expect(wasModeKind('160000')).toBe('submodule');
  });

  it('falls back to the raw old mode when it maps to neither special case', () => {
    expect(wasModeKind('100644')).toBe('100644');
  });
});
