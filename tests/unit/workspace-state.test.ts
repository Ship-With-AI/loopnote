import { describe, expect, it } from 'vitest';

import {
  createWorkspaceState,
  type WorkspaceComment,
} from '../../src/web/model/workspace-state.js';

function workspaceComment(
  comment: Pick<WorkspaceComment, 'id' | 'fileId' | 'side' | 'line' | 'body' | 'status'> & { endLine?: number },
): WorkspaceComment {
  const { endLine, ...base } = comment;
  const displayPath = base.fileId === null ? 'recorded/file.ts' : `src/${base.fileId}.ts`;
  return {
    ...base,
    exactFile: base.fileId === null
      ? { kind: 'unavailable' }
      : { kind: 'available', fileId: base.fileId },
    state: 'open',
    createdAt: '2026-07-24T00:00:00.000Z',
    recordedAnchor: {
      version: 'durable-anchor-v1',
      path: { bytesBase64url: 'c3JjL2ZpbGUudHM', display: displayPath },
      safeDisplayPath: displayPath,
      side: base.side,
      line: base.line,
      endLine,
      blobOid: '0'.repeat(40),
      selectedText: base.body,
      context: {
        before: [],
        target: { line: base.line, text: base.body },
        after: [],
      },
      contextHash: { algorithm: 'sha256-v1', value: '0'.repeat(64) },
      uniqueKey: '0'.repeat(64),
    },
  };
}

const comments: readonly WorkspaceComment[] = [
  workspaceComment({
    id: 'comment-base-3',
    fileId: 'file-a',
    side: 'base',
    line: 3,
    body: 'Existing base comment',
    status: 'verified',
  }),
  workspaceComment({
    id: 'comment-hidden',
    fileId: 'file-b',
    side: 'head',
    line: 8,
    body: 'Hidden comment',
    status: 'verified',
  }),
  workspaceComment({
    id: 'comment-stale',
    fileId: 'file-b',
    side: 'base',
    line: 2,
    body: 'Stale comment',
    status: 'stale',
  }),
];


describe('workspace session state', () => {
  it('restores an outgoing file only after immutable models report diff-ready and resizes in place', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b']);

    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'view-changed', scrollTop: 120, side: 'head', line: 7, context: 'all-revealed' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 7 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Keep this draft' });

    const switching = workspace.dispatch({ type: 'switch-file', fileId: 'file-b' });
    expect(switching.state.activeFileId).toBe('file-b');
    expect(switching.state.readyFileId).toBeNull();
    expect(switching.commands).toEqual([{ type: 'load-file', fileId: 'file-b' }]);

    workspace.dispatch({ type: 'diff-ready', fileId: 'file-b' });
    const returning = workspace.dispatch({ type: 'switch-file', fileId: 'file-a' });
    const restored = workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });

    expect(returning.commands).toEqual([{ type: 'load-file', fileId: 'file-a' }]);
    expect(restored.state.files['file-a']).toMatchObject({
      scrollTop: 120,
      focused: { side: 'head', line: 7 },
      context: 'all-revealed',
      composer: { side: 'head', line: 7, text: 'Keep this draft', status: 'ready' },
    });
    expect(restored.commands).toEqual([
      { type: 'restore-view', fileId: 'file-a', scrollTop: 120, context: 'all-revealed' },
      { type: 'rebuild-annotations', fileId: 'file-a' },
      { type: 'reveal-line', fileId: 'file-a', side: 'head', line: 7, center: true },
      { type: 'focus-editor-line', fileId: 'file-a', side: 'head', line: 7 },
    ]);

    const resize = workspace.dispatch({ type: 'resize' });
    expect(resize.commands).toEqual([{ type: 'layout' }]);
    expect(resize.state).toEqual(restored.state);
  });

  it('uses an exact side-line key: pointer and keyboard activation share it and existing comments win', () => {
    const workspace = createWorkspaceState(['file-a'], comments);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });

    const base = workspace.dispatch({ type: 'activate-line', side: 'base', line: 3 });
    const head = workspace.dispatch({ type: 'activate-line', side: 'head', line: 3 });

    expect(base.commands).toEqual([{ type: 'focus-comment', commentId: 'comment-base-3' }]);
    expect(head.state.files['file-a'].composer).toEqual({ side: 'head', line: 3, text: '', status: 'ready' });
    expect(head.commands).toEqual([{ type: 'rebuild-annotations', fileId: 'file-a' }]);

    const keyboard = workspace.dispatch({ type: 'activate-focused-line', side: 'head', line: 3 });
    expect(keyboard.state).toEqual(head.state);
    expect(keyboard.commands).toEqual([{ type: 'rebuild-annotations', fileId: 'file-a' }]);
  });

  it('focuses the existing thread for a stale-anchored comment instead of opening a composer', () => {
    const workspace = createWorkspaceState(['file-b'], comments);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-b' });

    const base = workspace.dispatch({ type: 'activate-line', side: 'base', line: 2 });

    expect(base.commands).toEqual([{ type: 'focus-comment', commentId: 'comment-stale' }]);
  });

  it('keeps one per-file composer, asks before destructive movement, and preserves text on blur', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 4 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Unaccepted text' });

    const movement = workspace.dispatch({ type: 'activate-line', side: 'base', line: 4 });
    expect(movement.state.files['file-a'].composer).toMatchObject({ text: 'Unaccepted text', status: 'confirm-move' });
    expect(movement.commands).toEqual([{ type: 'rebuild-annotations', fileId: 'file-a' }]);

    const keepWriting = workspace.dispatch({ type: 'keep-writing' });
    expect(keepWriting.state.files['file-a'].composer).toMatchObject({ side: 'head', line: 4, text: 'Unaccepted text', status: 'ready' });

    const blur = workspace.dispatch({ type: 'blur' });
    expect(blur.state).toEqual(keepWriting.state);
    expect(blur.commands).toEqual([]);
  });
  it('preserves a requested move target until explicit confirmation and never lets ordinary discard move it', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'base', line: 11 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Keep this draft unless I confirm the move' });

    const requestedMove = workspace.dispatch({ type: 'activate-line', side: 'head', line: 17 });
    expect(requestedMove.state.files['file-a'].composer).toMatchObject({
      side: 'base',
      line: 11,
      text: 'Keep this draft unless I confirm the move',
      status: 'confirm-move',
      pendingMove: { side: 'head', line: 17 },
    });

    const ordinaryDiscard = workspace.dispatch({ type: 'confirm-discard' });
    expect(ordinaryDiscard.state).toEqual(requestedMove.state);

    const escaped = workspace.dispatch({ type: 'escape' });
    expect(escaped.state.files['file-a'].composer).toMatchObject({
      side: 'base',
      line: 11,
      text: 'Keep this draft unless I confirm the move',
      status: 'ready',
    });

    workspace.dispatch({ type: 'activate-line', side: 'head', line: 17 });
    const moved = workspace.dispatch({ type: 'confirm-move' });
    expect(moved.state.files['file-a'].composer).toEqual({
      side: 'head',
      line: 17,
      text: '',
      status: 'ready',
    });
    expect(moved.state.files['file-a'].focused).toEqual({ side: 'head', line: 17 });
    expect(moved.commands).toEqual([{ type: 'rebuild-annotations', fileId: 'file-a' }]);
  });

  it('does not move or discard a composer while persistence is pending', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'base', line: 13 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Persisting draft' });
    const pending = workspace.dispatch({ type: 'add-comment' });

    expect(workspace.dispatch({ type: 'activate-line', side: 'head', line: 19 }).state).toEqual(pending.state);
    expect(workspace.dispatch({ type: 'cancel-composer' }).state).toEqual(pending.state);
    expect(workspace.dispatch({ type: 'confirm-move' }).state).toEqual(pending.state);
  });

  it('only discards non-empty text after explicit confirmation and escapes confirmation into writing', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'base', line: 5 });

    const emptyCancel = workspace.dispatch({ type: 'cancel-composer' });
    expect(emptyCancel.state.files['file-a'].composer).toBeUndefined();
    expect(emptyCancel.commands).toEqual([{ type: 'focus-gutter', fileId: 'file-a', side: 'base', line: 5 }]);

    workspace.dispatch({ type: 'activate-line', side: 'base', line: 5 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Do not discard yet' });
    const confirmation = workspace.dispatch({ type: 'cancel-composer' });
    expect(confirmation.state.files['file-a'].composer?.status).toBe('confirm-discard');

    const escaped = workspace.dispatch({ type: 'escape' });
    expect(escaped.state.files['file-a'].composer).toMatchObject({ text: 'Do not discard yet', status: 'ready' });
    const reopened = workspace.dispatch({ type: 'cancel-composer' });
    const discarded = workspace.dispatch({ type: 'confirm-discard' });
    expect(reopened.state.files['file-a'].composer?.status).toBe('confirm-discard');
    expect(discarded.state.files['file-a'].composer).toBeUndefined();
  });

  it('accepts only explicit non-whitespace add responses and keeps the exact anchor and text on recoverable outcomes', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 9 });

    const invalid = workspace.dispatch({ type: 'add-comment' });
    expect(invalid.state.files['file-a'].composer).toMatchObject({ status: 'ready', validation: 'Write a comment before adding it.' });

    workspace.dispatch({ type: 'composer-text-changed', text: 'Needs a guard' });
    const pending = workspace.dispatch({ type: 'add-comment' });
    const first = pending.commands[0];
    expect(pending.state.files['file-a'].composer).toMatchObject({ side: 'head', line: 9, text: 'Needs a guard', status: 'pending' });
    if (first?.type !== 'persist-comment') {
      throw new Error('Expected the first add-comment command.');
    }

    const failed = workspace.dispatch({
      type: 'add-failed',
      fileId: first.fileId,
      requestId: first.requestId,
      message: 'Comment wasn’t added. Your text is still here.',
    });
    expect(failed.state.files['file-a'].composer).toMatchObject({ side: 'head', line: 9, text: 'Needs a guard', status: 'ready' });

    const duplicatePending = workspace.dispatch({ type: 'add-comment' });
    const duplicateCommand = duplicatePending.commands[0];
    if (duplicateCommand?.type !== 'persist-comment') {
      throw new Error('Expected the duplicate add-comment command.');
    }
    const duplicate = workspace.dispatch({
      type: 'add-duplicate',
      fileId: duplicateCommand.fileId,
      requestId: duplicateCommand.requestId,
      comment: comments[0]!,
    });
    expect(duplicate.state.files['file-a'].composer).toMatchObject({ side: 'head', line: 9, text: 'Needs a guard', status: 'ready' });
    expect(duplicate.commands).toEqual([{ type: 'focus-comment', commentId: 'comment-base-3' }]);

    const acceptedPending = workspace.dispatch({ type: 'add-comment' });
    const acceptedCommand = acceptedPending.commands[0];
    if (acceptedCommand?.type !== 'persist-comment') {
      throw new Error('Expected the accepted add-comment command.');
    }
    const accepted = workspace.dispatch({
      type: 'add-succeeded',
      fileId: acceptedCommand.fileId,
      requestId: acceptedCommand.requestId,
      comment: workspaceComment({ id: 'comment-head-9', fileId: 'file-a', side: 'head', line: 9, body: 'Needs a guard', status: 'verified' }),
    });
    expect(accepted.state.files['file-a'].composer).toBeUndefined();
    expect(accepted.state.comments).toContainEqual(expect.objectContaining({ id: 'comment-head-9', side: 'head', line: 9 }));
    expect(accepted.commands).toEqual([{ type: 'focus-comment', commentId: 'comment-head-9' }]);
  });

  it('navigates deterministic file order and delegates change movement to the public adapter command', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });

    expect(workspace.dispatch({ type: 'previous-file' }).commands).toEqual([]);
    expect(workspace.dispatch({ type: 'next-change' }).commands).toEqual([{ type: 'go-to-change', direction: 'next' }]);
    expect(workspace.dispatch({ type: 'previous-change' }).commands).toEqual([{ type: 'go-to-change', direction: 'previous' }]);
    expect(workspace.dispatch({ type: 'next-file' }).commands).toEqual([{ type: 'load-file', fileId: 'file-b' }]);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-b' });
    expect(workspace.dispatch({ type: 'next-file' }).commands).toEqual([]);
    expect(workspace.dispatch({ type: 'previous-file' }).commands).toEqual([{ type: 'load-file', fileId: 'file-a' }]);
  });

  it('reveals verified hidden comments before centering, focusing, and announcing without relocating stale or orphaned records', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b'], comments);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });

    const switching = workspace.dispatch({ type: 'show-comment', commentId: 'comment-hidden' });
    expect(switching.commands).toEqual([{ type: 'load-file', fileId: 'file-b' }]);

    const revealed = workspace.dispatch({ type: 'diff-ready', fileId: 'file-b' });
    expect(revealed.commands).toEqual([
      { type: 'restore-view', fileId: 'file-b', scrollTop: 0, context: 'collapsed' },
      { type: 'reveal-comment-context', fileId: 'file-b', side: 'head', line: 8 },
      { type: 'rebuild-annotations', fileId: 'file-b' },
      { type: 'reveal-line', fileId: 'file-b', side: 'head', line: 8, center: true },
      { type: 'focus-comment', commentId: 'comment-hidden' },
      { type: 'announce', text: 'Showing comment on head line 8.' },
    ]);

    const stale = workspace.dispatch({ type: 'show-comment', commentId: 'comment-stale' });
    expect(stale.commands).toEqual([]);
    expect(stale.state.activeFileId).toBe('file-b');
  });

  it('never serializes browser-session view state into a repository draft payload', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'view-changed', scrollTop: 77, side: 'base', line: 2, context: 'all-revealed' });
    workspace.dispatch({ type: 'activate-line', side: 'base', line: 2 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Memory only' });

    expect(workspace.toRepositoryDraft()).toEqual({ comments: [] });
  });

  it('settles an accepted add on its origin file without focusing when another file is active', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 12 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Origin-owned success' });
    const pending = workspace.dispatch({ type: 'add-comment' });
    const command = pending.commands.find((candidate) => candidate.type === 'persist-comment');
    expect(command).toMatchObject({
      type: 'persist-comment',
      fileId: 'file-a',
      requestId: expect.any(Number),
    });
    if (command?.type !== 'persist-comment') {
      throw new Error('Expected an add-comment command.');
    }

    const switched = workspace.dispatch({ type: 'switch-file', fileId: 'file-b' });
    const fileBBeforeSettlement = switched.state.files['file-b'];
    const accepted = workspace.dispatch({
      type: 'add-succeeded',
      fileId: command.fileId,
      requestId: command.requestId,
      comment: workspaceComment({ id: 'comment-head-12', fileId: 'file-a', side: 'head', line: 12, body: 'Origin-owned success', status: 'verified' }),
    });

    expect(accepted.state.activeFileId).toBe('file-b');
    expect(accepted.state.files['file-b']).toEqual(fileBBeforeSettlement);
    expect(accepted.state.files['file-a'].composer).toBeUndefined();
    expect(accepted.state.comments).toContainEqual(expect.objectContaining({ id: 'comment-head-12' }));
    expect(accepted.commands).toEqual([]);
  });

  it('returns only an off-screen origin composer to retryable state after a recoverable failure', () => {
    const workspace = createWorkspaceState(['file-a', 'file-b']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'base', line: 14 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Origin-owned failure' });
    const pending = workspace.dispatch({ type: 'add-comment' });
    const command = pending.commands.find((candidate) => candidate.type === 'persist-comment');
    expect(command).toMatchObject({ type: 'persist-comment', fileId: 'file-a', requestId: expect.any(Number) });
    if (command?.type !== 'persist-comment') {
      throw new Error('Expected an add-comment command.');
    }

    const switched = workspace.dispatch({ type: 'switch-file', fileId: 'file-b' });
    const fileBBeforeSettlement = switched.state.files['file-b'];
    const failed = workspace.dispatch({
      type: 'add-failed',
      fileId: command.fileId,
      requestId: command.requestId,
      message: 'Comment wasn’t added. Your text is still here.',
    });

    expect(failed.state.activeFileId).toBe('file-b');
    expect(failed.state.files['file-b']).toEqual(fileBBeforeSettlement);
    expect(failed.state.files['file-a'].composer).toEqual({
      side: 'base',
      line: 14,
      text: 'Origin-owned failure',
      status: 'ready',
      error: 'Comment wasn’t added. Your text is still here.',
    });
    expect(failed.commands).toEqual([]);
  });

  it('ignores every stale settlement for a replacement request at the same anchor', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 16 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'First request' });
    const firstPending = workspace.dispatch({ type: 'add-comment' });
    const first = firstPending.commands.find((candidate) => candidate.type === 'persist-comment');
    expect(first).toMatchObject({ type: 'persist-comment', requestId: expect.any(Number) });
    if (first?.type !== 'persist-comment') {
      throw new Error('Expected the first add-comment command.');
    }

    workspace.dispatch({
      type: 'add-failed',
      fileId: first.fileId,
      requestId: first.requestId,
      message: 'Comment wasn’t added. Your text is still here.',
    });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Replacement request' });
    const secondPending = workspace.dispatch({ type: 'add-comment' });
    const second = secondPending.commands.find((candidate) => candidate.type === 'persist-comment');
    expect(second).toMatchObject({ type: 'persist-comment', requestId: expect.any(Number) });
    if (second?.type !== 'persist-comment') {
      throw new Error('Expected the replacement add-comment command.');
    }
    expect(second.requestId).not.toBe(first.requestId);

    const staleSuccess = workspace.dispatch({
      type: 'add-succeeded',
      fileId: first.fileId,
      requestId: first.requestId,
      comment: workspaceComment({ id: 'comment-stale-first', fileId: 'file-a', side: 'head', line: 16, body: 'First request', status: 'verified' }),
    });
    expect(staleSuccess.state).toEqual(secondPending.state);
    expect(staleSuccess.commands).toEqual([]);

    const staleDuplicate = workspace.dispatch({
      type: 'add-duplicate',
      fileId: first.fileId,
      requestId: first.requestId,
      comment: workspaceComment({ id: 'comment-duplicate-first', fileId: 'file-a', side: 'head', line: 16, body: 'First request', status: 'verified' }),
    });
    expect(staleDuplicate.state).toEqual(secondPending.state);
    expect(staleDuplicate.commands).toEqual([]);

    const staleFailure = workspace.dispatch({
      type: 'add-failed',
      fileId: first.fileId,
      requestId: first.requestId,
      message: 'Comment wasn’t added. Your text is still here.',
    });
    expect(staleFailure.state).toEqual(secondPending.state);
    expect(staleFailure.commands).toEqual([]);
  });

  it('focuses an accepted comment when its exact origin composer remains active', () => {
    const workspace = createWorkspaceState(['file-a']);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });
    workspace.dispatch({ type: 'activate-line', side: 'head', line: 20 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Active origin success' });
    const pending = workspace.dispatch({ type: 'add-comment' });
    const command = pending.commands.find((candidate) => candidate.type === 'persist-comment');
    if (command?.type !== 'persist-comment') {
      throw new Error('Expected an add-comment command.');
    }

    const accepted = workspace.dispatch({
      type: 'add-succeeded',
      fileId: command.fileId,
      requestId: command.requestId,
      comment: workspaceComment({ id: 'comment-head-20', fileId: 'file-a', side: 'head', line: 20, body: 'Active origin success', status: 'verified' }),
    });
    expect(accepted.commands).toEqual([{ type: 'focus-comment', commentId: 'comment-head-20' }]);
  });

  it('threads an optional endLine through activate-line, confirm-move, persist-comment, and a stored range comment into reveal-line', () => {
    const rangeComments: readonly WorkspaceComment[] = [
      workspaceComment({
        id: 'comment-range-5',
        fileId: 'file-a',
        side: 'head',
        line: 5,
        endLine: 9,
        body: 'Range comment',
        status: 'verified',
      }),
    ];
    const workspace = createWorkspaceState(['file-a'], rangeComments);
    workspace.dispatch({ type: 'diff-ready', fileId: 'file-a' });

    workspace.dispatch({ type: 'activate-line', side: 'head', line: 15, endLine: 18 });
    workspace.dispatch({ type: 'composer-text-changed', text: 'Draft about to move' });

    const moving = workspace.dispatch({ type: 'activate-line', side: 'head', line: 25, endLine: 30 });
    expect(moving.state.files['file-a'].composer).toMatchObject({
      status: 'confirm-move',
      pendingMove: { side: 'head', line: 25, endLine: 30 },
    });

    const moved = workspace.dispatch({ type: 'confirm-move' });
    expect(moved.state.files['file-a'].composer).toEqual({ side: 'head', line: 25, endLine: 30, text: '', status: 'ready' });

    workspace.dispatch({ type: 'composer-text-changed', text: 'Range feedback' });
    const pending = workspace.dispatch({ type: 'add-comment' });
    const command = pending.commands.find((candidate) => candidate.type === 'persist-comment');
    expect(command).toMatchObject({ type: 'persist-comment', side: 'head', line: 25, endLine: 30 });

    const revealed = workspace.dispatch({ type: 'show-comment', commentId: 'comment-range-5' });
    const reveal = revealed.commands.find((candidate) => candidate.type === 'reveal-line');
    expect(reveal).toEqual({ type: 'reveal-line', fileId: 'file-a', side: 'head', line: 5, endLine: 9, center: true });
  });
});
