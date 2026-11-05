import { describe, expect, it } from 'vitest';

import { threadChip } from '../../src/web/components/CommentThread.vue';

describe('threadChip', () => {
  it('shows Resolved when state is resolved, regardless of status', () => {
    expect(threadChip({ state: 'resolved', status: 'verified' })).toEqual({ kind: 'resolved', label: 'Resolved' });
    expect(threadChip({ state: 'resolved', status: 'stale' })).toEqual({ kind: 'resolved', label: 'Resolved' });
    expect(threadChip({ state: 'resolved', status: 'orphaned' })).toEqual({ kind: 'resolved', label: 'Resolved' });
  });

  it('shows Anchor moved when an open thread has a stale status', () => {
    expect(threadChip({ state: 'open', status: 'stale' })).toEqual({ kind: 'stale', label: 'Anchor moved' });
  });

  it('shows Open when an open thread has a verified status', () => {
    expect(threadChip({ state: 'open', status: 'verified' })).toEqual({ kind: 'open', label: 'Open' });
  });

  it('never returns a fourth chip kind for an orphaned status — orphaned comments are routed to the file-level group upstream, never passed into this helper\'s state/status contract as a distinct case', () => {
    expect(threadChip({ state: 'open', status: 'orphaned' })).toEqual({ kind: 'open', label: 'Open' });
  });
});
