import { describe, expect, it } from 'vitest';

import {
  emphasisLabel,
  openCommentSegment,
  staleCommentSegment,
} from '../../src/web/components/workbench/StatusBar.vue';

describe('openCommentSegment', () => {
  it('renders the bare count with no word when zero', () => {
    expect(openCommentSegment(0)).toBe('0');
  });

  it('renders "N open" for a non-zero count, never pluralized', () => {
    expect(openCommentSegment(2)).toBe('2 open');
    expect(openCommentSegment(1)).toBe('1 open');
  });
});

describe('staleCommentSegment', () => {
  it('is undefined when there are no stale comments', () => {
    expect(staleCommentSegment(0)).toBeUndefined();
  });

  it('renders "N stale" for a non-zero count, never pluralized', () => {
    expect(staleCommentSegment(1)).toBe('1 stale');
    expect(staleCommentSegment(3)).toBe('3 stale');
  });
});

describe('emphasisLabel', () => {
  it('reads "Export" when not attached', () => {
    expect(emphasisLabel(undefined)).toBe('Export');
  });

  it('reads "Finish review" while waiting', () => {
    expect(emphasisLabel('waiting')).toBe('Finish review');
  });

  it('reads "Finishing…" while finishing', () => {
    expect(emphasisLabel('finishing')).toBe('Finishing…');
  });

  it('reads "Finished" once completed', () => {
    expect(emphasisLabel('completed')).toBe('Finished');
  });
});
