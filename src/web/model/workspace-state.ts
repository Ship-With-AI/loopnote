import type { DiffSide } from '../monaco/line-mapping.js';
import type { DurableAnchorV1Dto } from '../../contracts/draft.js';
import type { WorkspaceCommand } from './workspace-command.js';
export type { WorkspaceCommand } from './workspace-command.js';



export type WorkspaceCommentStatus = 'verified' | 'stale' | 'orphaned';
export type ComposerStatus = 'ready' | 'pending' | 'confirm-discard' | 'confirm-move';

export type RecordedAnchorDetails = DurableAnchorV1Dto;

export type ExactFileCapability =
  | Readonly<{ kind: 'available'; fileId: string }>
  | Readonly<{ kind: 'unavailable' }>;

export type WorkspaceComment = Readonly<{
  id: string;
  fileId: string | null;
  exactFile: ExactFileCapability;
  side: DiffSide;
  line: number;
  body: string;
  state: 'open' | 'resolved';
  createdAt: string;
  status: WorkspaceCommentStatus;
  recordedAnchor: RecordedAnchorDetails;
}>;

export type WorkspaceComposer = Readonly<{
  side: DiffSide;
  line: number;
  endLine?: number;
  text: string;
  status: ComposerStatus;
  requestId?: number;
  pendingMove?: Readonly<{ side: DiffSide; line: number; endLine?: number }>;
  validation?: string;
  error?: string;
}>;

export type WorkspaceFileState = Readonly<{
  scrollTop: number;
  focused?: Readonly<{ side: DiffSide; line: number }>;
  context: 'collapsed' | 'all-revealed';
  composer?: WorkspaceComposer;
}>;

export type WorkspaceState = Readonly<{
  activeFileId: string;
  readyFileId: string | null;
  files: Readonly<Record<string, WorkspaceFileState>>;
  comments: readonly WorkspaceComment[];
  pendingCommentId: string | null;
}>;


export type WorkspaceTransition = Readonly<{
  state: WorkspaceState;
  commands: readonly WorkspaceCommand[];
}>;

export type WorkspaceEvent =
  | Readonly<{ type: 'activate-focused-line'; side: DiffSide; line: number; endLine?: number }>
  | Readonly<{ type: 'activate-line'; side: DiffSide; line: number; endLine?: number }>
  | Readonly<{ type: 'add-comment'; fileId?: string }>
  | Readonly<{ type: 'add-duplicate'; fileId: string; requestId: number; comment: WorkspaceComment }>
  | Readonly<{ type: 'add-failed'; fileId: string; requestId: number; message: string }>
  | Readonly<{ type: 'add-succeeded'; fileId: string; requestId: number; comment: WorkspaceComment }>
  | Readonly<{ type: 'blur' }>
  | Readonly<{ type: 'cancel-composer' }>
  | Readonly<{ type: 'composer-text-changed'; text: string }>
  | Readonly<{ type: 'confirm-discard' }>
  | Readonly<{ type: 'confirm-move' }>
  | Readonly<{ type: 'diff-ready'; fileId: string }>
  | Readonly<{ type: 'escape' }>
  | Readonly<{ type: 'keep-writing' }>
  | Readonly<{ type: 'next-change' }>
  | Readonly<{ type: 'next-file' }>
  | Readonly<{ type: 'previous-change' }>
  | Readonly<{ type: 'previous-file' }>
  | Readonly<{ type: 'resize' }>
  | Readonly<{ type: 'show-comment'; commentId: string }>
  | Readonly<{ type: 'switch-file'; fileId: string }>
  | Readonly<{ type: 'view-changed'; scrollTop: number; side: DiffSide; line: number; context: 'collapsed' | 'all-revealed' }>;

export type RepositoryDraftPayload = Readonly<{
  comments: readonly WorkspaceComment[];
}>;

export interface WorkspaceController {
  dispatch(event: WorkspaceEvent): WorkspaceTransition;
  getState(): WorkspaceState;
  replaceComments(comments: readonly WorkspaceComment[]): WorkspaceTransition;
  replaceFiles(fileIds: readonly string[], previousFileIds?: ReadonlyMap<string, string>): WorkspaceTransition;
  toRepositoryDraft(): RepositoryDraftPayload;
}

const EMPTY_FILE_STATE: WorkspaceFileState = Object.freeze({
  scrollTop: 0,
  context: 'collapsed',
});

function fileState(state: WorkspaceState, fileId = state.activeFileId): WorkspaceFileState {
  return state.files[fileId] ?? EMPTY_FILE_STATE;
}

function replaceFileState(state: WorkspaceState, fileId: string, replacement: WorkspaceFileState): WorkspaceState {
  return {
    ...state,
    files: {
      ...state.files,
      [fileId]: replacement,
    },
  };
}

function transition(state: WorkspaceState, commands: readonly WorkspaceCommand[] = []): WorkspaceTransition {
  return { state, commands };
}

function canonicalComment(
  comments: readonly WorkspaceComment[],
  fileId: string,
  side: DiffSide,
  line: number,
): WorkspaceComment | undefined {
  return comments.find((comment) => comment.fileId === fileId
    && comment.side === side
    && comment.line === line
    && (comment.status === 'verified' || comment.status === 'stale'));
}

function restoreCommands(fileId: string, state: WorkspaceFileState): WorkspaceCommand[] {
  const commands: WorkspaceCommand[] = [{
    type: 'restore-view',
    fileId,
    scrollTop: state.scrollTop,
    context: state.context,
  }];
  commands.push({ type: 'rebuild-annotations', fileId });
  if (state.focused !== undefined) {
    commands.push({ type: 'reveal-line', fileId, ...state.focused, center: true });
    commands.push({ type: 'focus-editor-line', fileId, ...state.focused });
  }
  return commands;
}

function switchFile(state: WorkspaceState, fileId: string): WorkspaceTransition {
  if (!(fileId in state.files) || fileId === state.activeFileId) {
    return transition(state);
  }
  return transition({ ...state, activeFileId: fileId, readyFileId: null }, [{ type: 'load-file', fileId }]);
}

function activateLine(state: WorkspaceState, side: DiffSide, line: number, endLine?: number): WorkspaceTransition {
  const existing = canonicalComment(state.comments, state.activeFileId, side, line);
  if (existing !== undefined) {
    return transition(state, [{ type: 'focus-comment', commentId: existing.id }]);
  }

  const current = fileState(state);
  const composer = current.composer;
  if (composer?.status === 'pending') {
    return transition(state);
  }
  if (composer !== undefined && (composer.side !== side || composer.line !== line) && composer.text.trim().length > 0) {
    const next = replaceFileState(state, state.activeFileId, {
      ...current,
      composer: {
        ...composer,
        status: 'confirm-move',
        pendingMove: { side, line, endLine },
      },
    });
    return transition(next, [{ type: 'rebuild-annotations', fileId: state.activeFileId }]);
  }

  const next = replaceFileState(state, state.activeFileId, {
    ...current,
    focused: { side, line },
    composer: {
      side,
      line,
      endLine,
      text: composer?.side === side && composer.line === line ? composer.text : '',
      status: 'ready',
    },
  });
  return transition(next, [{ type: 'rebuild-annotations', fileId: state.activeFileId }]);
}

function cancelComposer(state: WorkspaceState): WorkspaceTransition {
  const current = fileState(state);
  const composer = current.composer;
  if (composer === undefined) {
    return transition(state);
  }
  if (composer.status === 'pending') {
    return transition(state);
  }
  if (composer.text.trim().length > 0) {
    return transition(replaceFileState(state, state.activeFileId, {
      ...current,
      composer: { ...composer, status: 'confirm-discard', pendingMove: undefined },
    }));
  }
  return transition(replaceFileState(state, state.activeFileId, { ...current, composer: undefined }), [{
    type: 'focus-gutter',
    fileId: state.activeFileId,
    side: composer.side,
    line: composer.line,
  }]);
}

function completePendingComment(
  state: WorkspaceState,
  fileId: string,
  requestId: number,
  comment: WorkspaceComment,
): WorkspaceTransition {
  const current = fileState(state, fileId);
  const composer = current.composer;
  if (composer === undefined || composer.status !== 'pending'
    || composer.requestId !== requestId
    || comment.fileId !== fileId
    || comment.side !== composer.side
    || comment.line !== composer.line) {
    return transition(state);
  }
  const next = replaceFileState({
    ...state,
    comments: state.comments.some((existing) => existing.id === comment.id) ? state.comments : [...state.comments, comment],
  }, fileId, { ...current, composer: undefined });
  return fileId === state.activeFileId
    ? transition(next, [{ type: 'focus-comment', commentId: comment.id }])
    : transition(next);
}

function showComment(state: WorkspaceState, commentId: string): WorkspaceTransition {
  const comment = state.comments.find((candidate) => candidate.id === commentId);
  if (comment === undefined || comment.status !== 'verified' || comment.fileId === null || comment.exactFile?.kind === 'unavailable') {
    return transition(state);
  }
  const fileId = comment.exactFile?.kind === 'available' ? comment.exactFile.fileId : comment.fileId;
  if (fileId !== state.activeFileId) {
    const switching = switchFile({ ...state, pendingCommentId: comment.id }, fileId);
    return switching;
  }
  const commands: WorkspaceCommand[] = [
    { type: 'reveal-comment-context', fileId, side: comment.side, line: comment.line },
    { type: 'rebuild-annotations', fileId },
    { type: 'reveal-line', fileId, side: comment.side, line: comment.line, endLine: comment.recordedAnchor.endLine, center: true },
    { type: 'focus-comment', commentId: comment.id },
    { type: 'announce', text: `Showing comment on ${comment.side} line ${comment.line}.` },
  ];
  return transition(state, commands);
}

function applyEvent(
  state: WorkspaceState,
  fileIds: readonly string[],
  event: WorkspaceEvent,
  nextRequestId: () => number,
): WorkspaceTransition {
  switch (event.type) {
    case 'activate-focused-line':
    case 'activate-line':
      return activateLine(state, event.side, event.line, event.endLine);
    case 'add-comment': {
      const fileId = event.fileId ?? state.activeFileId;
      const current = fileState(state, fileId);
      const composer = current.composer;
      if (composer === undefined || composer.status !== 'ready') {
        return transition(state);
      }
      if (composer.text.trim().length === 0) {
        return transition(replaceFileState(state, fileId, {
          ...current,
          composer: { ...composer, validation: 'Write a comment before adding it.' },
        }));
      }
      const pending = { ...composer, status: 'pending' as const, requestId: nextRequestId() };
      return transition(replaceFileState(state, fileId, { ...current, composer: pending }), [{
        type: 'persist-comment',
        fileId,
        requestId: pending.requestId,
        side: composer.side,
        line: composer.line,
        endLine: composer.endLine,
        body: composer.text,
      }]);
    }
    case 'add-duplicate': {
      const current = fileState(state, event.fileId);
      const composer = current.composer;
      if (composer === undefined || composer.status !== 'pending' || composer.requestId !== event.requestId) {
        return transition(state);
      }
      const { requestId: _requestId, ...readyComposer } = composer;
      const next = replaceFileState(state, event.fileId, {
        ...current,
        composer: { ...readyComposer, status: 'ready' },
      });
      return event.fileId === state.activeFileId
        ? transition(next, [{ type: 'focus-comment', commentId: event.comment.id }])
        : transition(next);
    }
    case 'add-failed': {
      const current = fileState(state, event.fileId);
      const composer = current.composer;
      if (composer === undefined || composer.status !== 'pending' || composer.requestId !== event.requestId) {
        return transition(state);
      }
      const { requestId: _requestId, ...readyComposer } = composer;
      return transition(replaceFileState(state, event.fileId, {
        ...current,
        composer: { ...readyComposer, status: 'ready', error: event.message },
      }));
    }
    case 'add-succeeded':
      return completePendingComment(state, event.fileId, event.requestId, event.comment);
    case 'blur':
      return transition(state);
    case 'cancel-composer':
      return cancelComposer(state);
    case 'composer-text-changed': {
      const current = fileState(state);
      const composer = current.composer;
      return composer === undefined || composer.status === 'pending'
        ? transition(state)
        : transition(replaceFileState(state, state.activeFileId, {
          ...current,
          composer: {
            ...composer,
            text: event.text,
            status: 'ready',
            pendingMove: undefined,
            validation: undefined,
            error: undefined,
          },
        }));
    }
    case 'confirm-discard': {
      const current = fileState(state);
      return current.composer?.status !== 'confirm-discard'
        ? transition(state)
        : transition(replaceFileState(state, state.activeFileId, { ...current, composer: undefined }));
    }
    case 'confirm-move': {
      const current = fileState(state);
      const composer = current.composer;
      const target = composer?.pendingMove;
      if (composer?.status !== 'confirm-move' || target === undefined) {
        return transition(state);
      }
      return transition(replaceFileState(state, state.activeFileId, {
        ...current,
        focused: target,
        composer: {
          side: target.side,
          line: target.line,
          endLine: target.endLine,
          text: '',
          status: 'ready',
        },
      }), [{ type: 'rebuild-annotations', fileId: state.activeFileId }]);
    }
    case 'diff-ready': {
      if (event.fileId !== state.activeFileId) {
        return transition(state);
      }
      const ready = { ...state, readyFileId: event.fileId };
      const pendingComment = ready.pendingCommentId === null
        ? undefined
        : ready.comments.find((comment) => comment.id === ready.pendingCommentId);
      if (pendingComment === undefined) {
        return transition(ready, restoreCommands(event.fileId, fileState(ready)));
      }
      return transition({ ...ready, pendingCommentId: null }, [
        { type: 'restore-view', fileId: event.fileId, scrollTop: fileState(ready).scrollTop, context: fileState(ready).context },
        { type: 'reveal-comment-context', fileId: event.fileId, side: pendingComment.side, line: pendingComment.line },
        { type: 'rebuild-annotations', fileId: event.fileId },
        { type: 'reveal-line', fileId: event.fileId, side: pendingComment.side, line: pendingComment.line, endLine: pendingComment.recordedAnchor.endLine, center: true },
        { type: 'focus-comment', commentId: pendingComment.id },
        { type: 'announce', text: `Showing comment on ${pendingComment.side} line ${pendingComment.line}.` },
      ]);
    }
    case 'escape': {
      const current = fileState(state);
      if (current.composer?.status === 'confirm-discard' || current.composer?.status === 'confirm-move') {
        return transition(replaceFileState(state, state.activeFileId, {
          ...current,
          composer: { ...current.composer, status: 'ready', pendingMove: undefined },
        }));
      }
      return cancelComposer(state);
    }
    case 'keep-writing': {
      const current = fileState(state);
      return current.composer === undefined || current.composer.status === 'pending'
        ? transition(state)
        : transition(replaceFileState(state, state.activeFileId, {
          ...current,
          composer: { ...current.composer, status: 'ready' },
        }));
    }
    case 'next-change':
      return transition(state, [{ type: 'go-to-change', direction: 'next' }]);
    case 'previous-change':
      return transition(state, [{ type: 'go-to-change', direction: 'previous' }]);
    case 'next-file': {
      const currentIndex = fileIds.indexOf(state.activeFileId);
      return currentIndex < 0 || currentIndex === fileIds.length - 1
        ? transition(state)
        : switchFile(state, fileIds[currentIndex + 1]!);
    }
    case 'previous-file': {
      const currentIndex = fileIds.indexOf(state.activeFileId);
      return currentIndex <= 0 ? transition(state) : switchFile(state, fileIds[currentIndex - 1]!);
    }
    case 'resize':
      return transition(state, [{ type: 'layout' }]);
    case 'show-comment':
      return showComment(state, event.commentId);
    case 'switch-file':
      return switchFile(state, event.fileId);
    case 'view-changed':
      return transition(replaceFileState(state, state.activeFileId, {
        ...fileState(state),
        scrollTop: event.scrollTop,
        focused: { side: event.side, line: event.line },
        context: event.context,
      }));
  }
}

export function createWorkspaceState(
  fileIds: readonly string[],
  comments: readonly WorkspaceComment[] = [],
): WorkspaceController {
  if (fileIds.length === 0) {
    throw new Error('Workspace state requires at least one opaque file ID.');
  }
  const initialFiles = Object.fromEntries(fileIds.map((fileId) => [fileId, EMPTY_FILE_STATE]));
  let currentFileIds = fileIds;
  let nextRequestId = 1;
  let state: WorkspaceState = {
    activeFileId: fileIds[0]!,
    readyFileId: null,
    files: initialFiles,
    comments: [...comments],
    pendingCommentId: null,
  };

  return {
    dispatch(event) {
      const next = applyEvent(state, currentFileIds, event, () => nextRequestId++);
      state = next.state;
      return next;
    },
    getState() {
      return state;
    },
    replaceComments(comments) {
      state = { ...state, comments: [...comments] };
      return transition(state, [{ type: 'rebuild-annotations', fileId: state.activeFileId }]);
    },
    replaceFiles(fileIds, previousFileIds) {
      const files: Record<string, WorkspaceFileState> = {};
      for (const fileId of fileIds) {
        files[fileId] = state.files[previousFileIds?.get(fileId) ?? fileId] ?? EMPTY_FILE_STATE;
      }
      currentFileIds = fileIds;
      state = {
        ...state,
        files,
        readyFileId: state.readyFileId !== null && state.readyFileId in files ? state.readyFileId : null,
      };
      return transition(state);
    },
    toRepositoryDraft() {
      return { comments: state.comments };
    },
  };
}
