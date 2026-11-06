<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RENAME_MAP } from '../domain/product-identity.js';

import type {
  AttachedCompletionStatus,
  DraftLoadResponse,
  DraftRecoveryResult,
  DraftRevealResult,
  FileContentResponse,
  FinishReviewResult,
  PatchStatusResponse,
  SessionFile,
  SessionResponse,
  SelectorDriftResponse,
} from '../contracts/api';
import {
  createSessionClient,
  DRAFT_UNAVAILABLE_MESSAGE,
  FILE_UNAVAILABLE_MESSAGE,
  SECURITY_FAILURE_MESSAGE,
  SessionClientError,
} from './api/client';
import type { DraftView, RefreshResult, SessionClient } from './api/client';
import DiffWorkspace from './components/DiffWorkspace.vue';
import DraftRecovery from './components/DraftRecovery.vue';
import ErrorState from './components/ErrorState.vue';
import ChangedFilesDialog from './components/ChangedFilesDialog.vue';
import SupportDialog from './components/SupportDialog.vue';
import InlineNotice from './components/InlineNotice.vue';
import SelectorDriftNotice from './components/SelectorDriftNotice.vue';
import StaleAnchorNotice from './components/StaleAnchorNotice.vue';
import RefreshSummaryPanel from './components/RefreshSummaryPanel.vue';
import WorkbenchShell from './components/workbench/WorkbenchShell.vue';
import TitleBar from './components/workbench/TitleBar.vue';
import EditorTitle from './components/workbench/EditorTitle.vue';
import Breadcrumbs from './components/workbench/Breadcrumbs.vue';
import BottomPanel from './components/workbench/BottomPanel.vue';
import StatusBar from './components/workbench/StatusBar.vue';
import type { WorkspaceCommand, WorkspaceEvent } from './model/workspace-state.js';
import { createWorkspaceState, type WorkspaceController } from './model/workspace-state.js';
import { reconcileDraftComments } from './model/draft-reconciliation.js';
import type { WorkspaceComment, WorkspaceState } from './model/workspace-state.js';
import {
  createReviewDraftState,
  reviewPrimarySurface,
  type AttachedLifecycle,
  type ReadOnlyDraftLoad,
  type ReviewDraftState,
  type ReviewDraftSnapshot,
  type ReviewPendingOperation,
} from './model/review-draft-state.js';
import {
  createSelectorDriftState,
  type SelectorDriftState,
} from './model/selector-drift-state.js';
import { singlePaneSideFor } from './model/single-pane-layout.js';
import { controlSafeDisplay } from '../domain/path-bytes.js';
import type { DraftMutationRequest } from '../contracts/api.js';
import { createPanelState, type PanelTab, type TreeLineCountsMode, type TreeViewMode } from './model/panel-state.js';
import UndoToast from './components/UndoToast.vue';
import PathText from './components/ui/PathText.vue';
import ReviewStateBadge from './components/ui/ReviewStateBadge.vue';
import { createFileTreeModel } from './model/file-tree.js';
import { projectOrphanedCommentGroup } from './model/orphaned-comments.js';
import { flattenThreadOrder, nextThread, previousThread } from './model/thread-order.js';
import { resolvePathToFileId } from './model/refresh-resolution.js';

type CanonicalReviewDraft = Readonly<{
  revision: number;
  summary: string;
  comments: readonly Readonly<{
    id: string;
    state: WorkspaceComment['state'];
    body: string;
    anchor: WorkspaceComment['recordedAnchor'];
    createdAt: string;
  }>[];
}>;

type ReviewFailure = Readonly<{
  operation: ReviewPendingOperation;
  commentId?: string;
}>;

type ShellDialog = 'changed-files' | 'support';

const session = shallowRef<SessionResponse>();
const sessionToken = ref('');
const errorMessage = ref('');
const selectedFile = shallowRef<SessionFile>();
const selectedContent = shallowRef<FileContentResponse>();
const diffLoading = ref(false);
const diffError = ref('');
const shellDialog = ref<ShellDialog | null>(null);
const isNarrow = ref(false);
const changedFilesOpen = computed(() => shellDialog.value === 'changed-files');
const changedFilesRestoreFocus = ref(true);
const focusActiveFileAfterDialog = ref(false);
const panelState = createPanelState();
const PANEL_TAB_LABELS: Record<PanelTab, string> = { comments: 'Comments', summary: 'Summary', export: 'Export' };
const panelOpen = ref(false);
const renderSideBySide = ref(true);
const fileModeByFileId = shallowRef<Map<string, 'source' | 'rendered'>>(new Map());
const activeFileMode = computed(() => fileModeByFileId.value.get(selectedContent.value?.fileId ?? '') ?? 'source');
const shellModalOpen = computed(() => shellDialog.value !== null);
const liveMessage = ref('');
const liveMessageVersion = ref(0);
const editorTitle = ref<InstanceType<typeof EditorTitle>>();
const titleBar = ref<InstanceType<typeof TitleBar>>();
const diffWorkspace = ref<InstanceType<typeof DiffWorkspace>>();
const statusBar = ref<InstanceType<typeof StatusBar>>();
const panelRef = ref<InstanceType<typeof BottomPanel>>();
const workspaceState = shallowRef<WorkspaceState>();
const draftRevision = ref(0);
const reviewDraft = shallowRef<ReviewDraftSnapshot>();
const patchStatus = shallowRef<PatchStatusResponse>();
const reviewFailure = shallowRef<ReviewFailure | null>(null);
const draftLoad = shallowRef<DraftLoadResponse>();
const recoveredDraft = shallowRef<Extract<DraftRecoveryResult, { readonly kind: 'recovered' }>>();
const recoveredDraftOpen = ref(false);
const selectorDriftStatus = shallowRef<SelectorDriftResponse>();
const attachedLifecycle = ref<AttachedLifecycle>('ordinary');
const attachedResult = shallowRef<FinishReviewResult>();
const attachedStatus = shallowRef<AttachedCompletionStatus>();
const supportStatus = ref<'loading' | 'unverified' | 'verified' | 'unavailable'>('loading');
const supportDialogOpen = computed(() => shellDialog.value === 'support');
const supportDialogMode = ref<'invitation' | 'waiting' | 'verified' | 'thankYou' | 'notConfirmed'>('invitation');
const supportBusy = ref(false);
const dismissedForSession = ref(false);
const worktreeChanged = ref(false);
const refreshBusy = ref(false);
const refreshSummary = shallowRef<RefreshResult>();
const dismissedCaptureBanner = ref(false);
const recoveryOfferDismissed = ref(false);
const recoveryBusy = ref(false);
const recentlyChangedPaths = ref<Set<string>>(new Set());
const supportDialog = ref<InstanceType<typeof SupportDialog>>();
const primarySurface = computed(() => recoveredDraftOpen.value
  ? 'workspace'
  : reviewPrimarySurface(draftLoad.value));
const recoveryLoad = computed<ReadOnlyDraftLoad | undefined>(() => {
  const load = draftLoad.value;
  return load?.kind === 'malformed' || load?.kind === 'schemaInvalid' || load?.kind === 'newerUnsupported'
    ? load
    : undefined;
});

let reviewState: ReviewDraftState | undefined;
let selectorDriftState: SelectorDriftState | undefined;
let patchStatusInterval: number | undefined;
let patchStatusRefreshing = false;
let worktreeIndicatorInterval: number | undefined;
let worktreeIndicatorRefreshing = false;

let sessionClient: SessionClient | undefined;
let workspace: WorkspaceController | undefined;
let requestVersion = 0;
let loadedContentMessageVersion = 0;
let viewportMedia: MediaQueryList | undefined;
let supportRefreshInFlight = false;
let supportBackgroundTimer: number | undefined;
let supportWaitingTimer: number | undefined;
let supportThankYouTimer: number | undefined;
let supportOpener: HTMLElement | undefined;
let supportPollAbort: AbortController | undefined;
let latestConflictDraft: CanonicalReviewDraft | undefined;

const pinnedSession = computed(() =>
  session.value !== undefined && 'base' in session.value ? session.value : undefined,
);
const exactPatchSession = computed(() =>
  session.value !== undefined && 'patch' in session.value ? session.value : undefined,
);
const isExactPatchSession = computed(() => exactPatchSession.value !== undefined);
const isUncommittedSession = computed(() => session.value !== undefined && 'uncommitted' in session.value);
const uncommittedSession = computed(() =>
  isUncommittedSession.value
    ? (session.value as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const isStandaloneSession = computed(() => uncommittedSession.value?.sourceKind === 'standalone');
const recoveryAvailable = computed(() => uncommittedSession.value?.recoveryAvailable === true);
const uncommittedSourceLabel = computed(() => {
  switch (uncommittedSession.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    default: return '';
  }
});
const statusbarIdentifier = computed(() => {
  if (isExactPatchSession.value) return controlSafeDisplay(exactPatchSession.value?.patch.digest.slice(0, 7) ?? '');
  if (isUncommittedSession.value) return controlSafeDisplay(uncommittedSession.value?.reviewKey.slice(0, 7) ?? '');
  return controlSafeDisplay(pinnedSession.value?.head.oid.slice(0, 7) ?? '');
});
const singlePaneSide = computed(() =>
  selectedFile.value === undefined
    ? undefined
    : singlePaneSideFor(selectedFile.value.status.kind, selectedFile.value.availability),
);
const singlePaneBaseOid = computed(() =>
  pinnedSession.value === undefined ? undefined : controlSafeDisplay(pinnedSession.value.base.oid.slice(0, 7)),
);
const singlePaneHeadOid = computed(() =>
  pinnedSession.value === undefined ? undefined : controlSafeDisplay(pinnedSession.value.head.oid.slice(0, 7)),
);
const supportEnabled = computed(() => session.value?.support?.enabled === true);

const patchSnapshotUnavailable = computed(() => patchStatus.value?.kind === 'snapshotUnavailable');
const patchDrifted = computed(() => patchStatus.value?.kind === 'drifted');
const flatFileRows = computed(() => createFileTreeModel(session.value?.files ?? []).flatFileRows);
const reviewableFiles = computed(() => flatFileRows.value
  .filter(({ file }) => file.availability.kind === 'text')
  .map(({ file }) => file));
const capturedFilesChanged = computed(() =>
  session.value?.files.filter(
    (file) => file.availability.kind === 'unsupported' && file.availability.reason === 'changed-during-capture',
  ).length ?? 0,
);
const selectedPath = computed(() => selectedFile.value?.newPath?.display ?? selectedFile.value?.oldPath?.display ?? 'Changed file');
const isRangeSession = computed(() => pinnedSession.value?.range?.kind === 'revisions');
const rangeHasPathspecs = computed(() => (pinnedSession.value?.range?.pathspecs.length ?? 0) > 0);
const emptyFilesCopy = computed(() => {
  if (isExactPatchSession.value) {
    return {
      heading: 'No files in this exact patch',
      message: 'This accepted patch contains no changed file entries. Relaunch with a non-empty already-applied patch.',
    };
  }
  if (isRangeSession.value) {
    return {
      heading: 'No changes match this review scope.',
      message: rangeHasPathspecs.value
        ? 'Relaunch with a different scope or range.'
        : 'Relaunch with a different range.',
    };
  }
  if (isStandaloneSession.value) {
    return {
      heading: 'No files in this standalone review.',
      message: 'Restore the files, then Refresh.',
    };
  }
  if (isUncommittedSession.value) {
    return {
      heading: `No changes in ${uncommittedSourceLabel.value}.`,
      message: 'Edit files, then Refresh.',
    };
  }
  return {
    heading: 'No changes in this comparison.',
    message: 'Relaunch with different Base/Head endpoints.',
  };
});

const sessionKindTitleSegment = computed(() => {
  if (isExactPatchSession.value) return 'Exact patch';
  if (isStandaloneSession.value) return `${uncommittedSession.value?.changedFileCount ?? 0} files`;
  if (isUncommittedSession.value) {
    // Staged/Working tree always carry the resolved base commit (the same oid the identity header
    // shows). Unstaged has no base: it compares the index with the working tree, never HEAD.
    const baseOid = uncommittedSession.value?.baseCommitOid;
    return baseOid === undefined
      ? uncommittedSourceLabel.value
      : `${uncommittedSourceLabel.value} vs ${controlSafeDisplay(baseOid.slice(0, 7))}`;
  }
  return `${session.value?.files.length ?? 0} files`;
});
const documentTitle = computed(() =>
  session.value === undefined
    ? RENAME_MAP.displayName
    : [RENAME_MAP.displayName, controlSafeDisplay(session.value.repoName ?? ''), sessionKindTitleSegment.value]
        .filter((segment) => segment !== '')
        .join(' · '),
);

const unavailableHeading = computed(() =>
  patchSnapshotUnavailable.value
    ? 'Frozen patch unavailable'
    : 'Exact patch review unavailable',
);
const unavailableMessage = computed(() =>
  patchSnapshotUnavailable.value
    ? `The accepted patch snapshot is missing, corrupt, incomplete, or unreadable. Relaunch ${RENAME_MAP.displayName} with an exact patch that matches the current implementation.`
    : errorMessage.value,
);
const selectedIndex = computed(() => reviewableFiles.value.findIndex((file) => file.fileId === selectedFile.value?.fileId));
const atFirstFile = computed(() => selectedIndex.value <= 0);
const atLastFile = computed(() => selectedIndex.value === -1 || selectedIndex.value === reviewableFiles.value.length - 1);
const activeWorkspaceFile = computed(() => workspaceState.value?.files[workspaceState.value.activeFileId]);
const activeComposer = computed(() => activeWorkspaceFile.value?.composer);
const unsavedInlineComposerFile = computed(() => {
  const file = reviewableFiles.value.find(
    (candidate) => (workspaceState.value?.files[candidate.fileId]?.composer?.text.trim().length ?? 0) > 0,
  );
  return file === undefined
    ? undefined
    : {
        fileId: file.fileId,
        display: file.newPath?.display ?? file.oldPath?.display ?? 'Changed file',
      };
});
const workspaceComments = computed(() => workspaceState.value?.comments ?? []);
const openCommentCount = computed(() => workspaceComments.value.filter((comment) => comment.state === 'open').length);
const openCommentCounts = computed<ReadonlyMap<string, number>>(() => {
  const counts = new Map<string, number>();
  for (const comment of workspaceComments.value) {
    if (comment.state !== 'open' || comment.fileId === null) continue;
    counts.set(comment.fileId, (counts.get(comment.fileId) ?? 0) + 1);
  }
  return counts;
});
const hasUnverifiedAnchors = computed(() =>
  workspaceComments.value.some((comment) => comment.status === 'stale' || comment.status === 'orphaned'),
);
const staleCommentCount = computed(() =>
  workspaceComments.value.filter((comment) => comment.status === 'stale' || comment.status === 'orphaned').length,
);


// --- Phase 23: inline comment threads ---
const collapsedByCommentId = ref(new Map<string, boolean>());
const editingCommentId = ref<string>();
const locallyHiddenCommentIds = ref(new Set<string>());
const pendingUndos = ref<readonly { commentId: string }[]>([]);
const pendingDeletes = new Map<string, { readonly timeoutId: ReturnType<typeof setTimeout> }>();

const liveWorkspaceComments = computed(() =>
  workspaceComments.value.filter((comment) => !locallyHiddenCommentIds.value.has(comment.id)),
);
const orphanedGroups = computed(() => projectOrphanedCommentGroup(liveWorkspaceComments.value));
const threadOrder = computed(() => flattenThreadOrder(liveWorkspaceComments.value, flatFileRows.value));
const hasThreadsAnywhere = computed(() => threadOrder.value.length > 0);
const currentFileLiveComments = computed(() =>
  liveWorkspaceComments.value.filter((comment) =>
    comment.fileId === selectedFile.value?.fileId && comment.status !== 'orphaned'),
);
const hasCommentsInCurrentFile = computed(() => currentFileLiveComments.value.length > 0);
const anyThreadExpanded = computed(() =>
  currentFileLiveComments.value.some((comment) =>
    !(collapsedByCommentId.value.get(comment.id) ?? (comment.state === 'resolved'))),
);

function currentCommentBody(commentId: string): string {
  return workspaceComments.value.find((comment) => comment.id === commentId)?.body ?? '';
}

function saveCommentEdit(commentId: string): void {
  mutateReview({
    type: 'editComment',
    expectedRevision: reviewDraft.value?.canonical.revision ?? 0,
    commentId,
    body: reviewDraft.value?.commentBuffers.get(commentId) ?? '',
  }, commentId);
  editingCommentId.value = undefined;
}

function cancelCommentEdit(commentId: string): void {
  reviewState?.setCommentBuffer(commentId, currentCommentBody(commentId));
  refreshReviewSnapshot();
  editingCommentId.value = undefined;
}

function toggleCommentCollapse(commentId: string): void {
  const comment = workspaceComments.value.find((candidate) => candidate.id === commentId);
  const current = collapsedByCommentId.value.get(commentId) ?? (comment?.state === 'resolved');
  const next = new Map(collapsedByCommentId.value);
  next.set(commentId, !current);
  collapsedByCommentId.value = next;
  announce(!current ? 'Thread collapsed.' : 'Thread expanded.');
}

function toggleThreadsCollapsed(): void {
  const collapseAll = anyThreadExpanded.value;
  const next = new Map(collapsedByCommentId.value);
  for (const comment of currentFileLiveComments.value) {
    next.set(comment.id, collapseAll);
  }
  collapsedByCommentId.value = next;
  announce(collapseAll ? 'All threads collapsed.' : 'All threads expanded.');
}

function jumpThread(direction: 'next' | 'previous'): void {
  const currentId = (document.activeElement?.closest('[data-comment-id]') as HTMLElement | null)?.dataset.commentId;
  const result = direction === 'next'
    ? nextThread(threadOrder.value, currentId)
    : previousThread(threadOrder.value, currentId);
  if (result === undefined) return;
  if (result.wrapped) {
    announce(direction === 'next' ? 'Wrapped to first thread' : 'Wrapped to last thread');
  }
  if (result.entry.fileId !== selectedFile.value?.fileId) {
    selectFile(result.entry.fileId);
  }
  void nextTick(() => {
    const next = new Map(collapsedByCommentId.value);
    next.set(result.entry.commentId, false);
    collapsedByCommentId.value = next;
    void nextTick(() => diffWorkspace.value?.revealComment(result.entry.side, result.entry.line));
  });
}

function beginPendingDelete(commentId: string): void {
  if (pendingDeletes.has(commentId)) return;
  const next = new Set(locallyHiddenCommentIds.value);
  next.add(commentId);
  locallyHiddenCommentIds.value = next;
  pendingUndos.value = [...pendingUndos.value, { commentId }];
  const timeoutId = setTimeout(() => commitPendingDelete(commentId), 5000);
  pendingDeletes.set(commentId, { timeoutId });
}

function commitPendingDelete(commentId: string): void {
  pendingDeletes.delete(commentId);
  pendingUndos.value = pendingUndos.value.filter((entry) => entry.commentId !== commentId);
  mutateReview({ type: 'deleteComment', expectedRevision: reviewDraft.value?.canonical.revision ?? 0, commentId });
}

function undoPendingDelete(commentId: string): void {
  const pending = pendingDeletes.get(commentId);
  if (pending !== undefined) {
    clearTimeout(pending.timeoutId);
    pendingDeletes.delete(commentId);
  }
  const next = new Set(locallyHiddenCommentIds.value);
  next.delete(commentId);
  locallyHiddenCommentIds.value = next;
  pendingUndos.value = pendingUndos.value.filter((entry) => entry.commentId !== commentId);
  announce(`Comment restored. ${openCommentCount.value} open, ${workspaceComments.value.length - openCommentCount.value} resolved.`);
}

function flushPendingDeletes(): void {
  for (const [commentId, pending] of [...pendingDeletes]) {
    clearTimeout(pending.timeoutId);
    commitPendingDelete(commentId);
  }
}

function flushPendingDeletesWhenHidden(): void {
  if (document.visibilityState === 'hidden') flushPendingDeletes();
}

watch(reviewFailure, (failure) => {
  if (failure?.operation === 'delete' && failure.commentId !== undefined && locallyHiddenCommentIds.value.has(failure.commentId)) {
    const next = new Set(locallyHiddenCommentIds.value);
    next.delete(failure.commentId);
    locallyHiddenCommentIds.value = next;
  }
});
const isAttachedSession = computed(() => session.value?.attached?.kind === 'agent-review');
const attachedMutationLocked = computed(() =>
  isAttachedSession.value && (attachedLifecycle.value === 'finishing' || attachedLifecycle.value === 'completed'),
);
const hasUnsavedReviewText = computed(() => {
  const current = reviewDraft.value;
  if (current === undefined) return false;
  return unsavedInlineComposerFile.value !== undefined
    || current.summaryBuffer !== current.canonical.summary
    || [...current.commentBuffers].some(([commentId, body]) =>
      current.canonical.comments.find((comment) => comment.id === commentId)?.body !== body,
    );
});
const attachedFinishReady = computed(() => {
  const current = reviewDraft.value;
  return isAttachedSession.value
    && current !== undefined
    && attachedLifecycle.value !== 'finishing'
    && attachedLifecycle.value !== 'completed'
    && attachedLifecycle.value !== 'terminalFailure'
    && current.pending === null
    && current.conflict === null
    && !hasUnsavedReviewText.value
    && recoveryLoad.value === undefined
    && !patchSnapshotUnavailable.value;
});

let hadUnverifiedAnchors = false;
watch(hasUnverifiedAnchors, (hasUnverified) => {
  if (hasUnverified && !hadUnverifiedAnchors) {
    announce('Some saved comment anchors cannot be verified.');
  } else if (!hasUnverified && hadUnverifiedAnchors) {
    announce('Saved comment anchors are verified again.');
  }
  hadUnverifiedAnchors = hasUnverified;
});
let hadPatchDrift = false;
watch(patchDrifted, (drifted) => {
  if (drifted && !hadPatchDrift) announce('Implemented content changed.');
  hadPatchDrift = drifted;
});
let hadWorktreeChanged = false;
watch(worktreeChanged, (changed) => {
  if (changed && !hadWorktreeChanged) announce('Working tree changed since snapshot.');
  hadWorktreeChanged = changed;
});
watch(documentTitle, (title) => {
  document.title = title;
}, { immediate: true });


function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}

function openShellDialog(dialog: ShellDialog): void {
  shellDialog.value = dialog;
}

function closeShellDialog(dialog: ShellDialog): void {
  if (shellDialog.value === dialog) shellDialog.value = null;
}

function toggleSidebar(): void {
  if (isNarrow.value) {
    openShellDialog('changed-files');
    return;
  }
  panelState.sidebarVisible.value = !panelState.sidebarVisible.value;
  panelState.persist();
  dispatchWorkspace({ type: 'resize' });
  diffWorkspace.value?.layout();
}

function togglePanel(): void {
  panelOpen.value = !panelOpen.value;
}

function closePanel(): void {
  panelOpen.value = false;
}

function openPanel(tab: PanelTab): void {
  panelState.setActiveTab(tab);
  panelOpen.value = true;
  void nextTick(() => nextTick(() => panelRef.value?.focusActiveTab()));
}

function selectPanelTab(tab: PanelTab): void {
  panelState.setActiveTab(tab);
  announce(`${PANEL_TAB_LABELS[tab]} tab selected.`);
}

function commitSidebarWidth(value: number): void {
  panelState.sidebarWidth.value = value;
  panelState.persist();
}

function commitPanelHeight(value: number): void {
  panelState.panelHeight.value = value;
  panelState.persist();
}

function toggleTreeViewMode(mode: TreeViewMode): void {
  panelState.treeViewMode.value = mode;
  panelState.persist();
  announce(mode === 'list' ? 'Viewing as list.' : 'Viewing as tree.');
}

function toggleTreeLineCounts(mode: TreeLineCountsMode): void {
  panelState.treeLineCounts.value = mode;
  panelState.persist();
}

function toggleTreeCommentBadges(enabled: boolean): void {
  panelState.treeCommentBadges.value = enabled;
  panelState.persist();
}

function handleFilterResult(matched: number, total: number, query: string): void {
  announce(matched === 0 ? `No changed files match "${query}".` : `${matched} of ${total} files match.`);
}

function setFileMode(fileId: string, mode: 'source' | 'rendered'): void {
  const next = new Map(fileModeByFileId.value);
  next.set(fileId, mode);
  fileModeByFileId.value = next;
  announce(mode === 'source' ? 'Showing Markdown source.' : 'Showing rendered Markdown.');
}

function closeChangedFiles(restoreFocus = true): void {
  if (!changedFilesOpen.value) return;
  changedFilesRestoreFocus.value = restoreFocus;
  closeShellDialog('changed-files');
  void nextTick(() => {
    diffWorkspace.value?.layout();
    changedFilesRestoreFocus.value = true;
  });
}


function activeFile(fileId: string): SessionFile | undefined {
  return session.value?.files.find((file) => file.fileId === fileId);
}

async function loadFile(file: SessionFile): Promise<void> {
  selectedFile.value = file;
  diffError.value = '';
  selectedContent.value = undefined;
  if (file.availability.kind !== 'text') {
    diffLoading.value = false;
    return;
  }

  const version = ++requestVersion;
  const messageVersion = liveMessageVersion.value;
  diffLoading.value = true;
  try {
    const content = await sessionClient?.getFileContent(file.fileId);
    if (content === undefined || version !== requestVersion || content.fileId !== file.fileId) {
      return;
    }
    loadedContentMessageVersion = messageVersion;
    selectedContent.value = content;
  } catch (error) {
    if (version === requestVersion) {
      diffError.value = error instanceof SessionClientError ? error.message : FILE_UNAVAILABLE_MESSAGE;
    }
  } finally {
    if (version === requestVersion) {
      diffLoading.value = false;
    }
  }
}


function reviewCanonical(draft: CanonicalReviewDraft) {
  return {
    revision: draft.revision,
    summary: draft.summary,
    comments: draft.comments.map((comment) => ({
      id: comment.id,
      state: comment.state,
      body: comment.body,
      side: comment.anchor.side,
      line: comment.anchor.line,
      createdAt: comment.createdAt,
      path: comment.anchor.path,
    })),
  };
}

function acceptedWorkspaceComments(
  draft: CanonicalReviewDraft,
  addedComment?: WorkspaceComment,
): readonly WorkspaceComment[] {
  const existing = new Map(workspace?.getState().comments.map((comment) => [comment.id, comment]));
  return draft.comments.flatMap((comment) => {
    const previous = existing.get(comment.id);
    if (previous !== undefined) {
      return [{ ...previous, state: comment.state, body: comment.body }];
    }
    return addedComment?.id === comment.id ? [addedComment] : [];
  });
}

function reconciledWorkspaceComments(draft: DraftView): readonly WorkspaceComment[] {
  return reconcileDraftComments(draft.comments, session.value?.files ?? []);
}

function refreshReviewSnapshot(): void {
  if (reviewState !== undefined) reviewDraft.value = reviewState.snapshot();
}

function acceptReviewDraft(
  draft: CanonicalReviewDraft,
  successfulBuffer?: 'summary' | string,
  addedComment?: WorkspaceComment,
): void {
  reviewState?.accept(reviewCanonical(draft), successfulBuffer);
  refreshReviewSnapshot();
  draftRevision.value = draft.revision;
  if (workspace !== undefined) {
    const transition = workspace.replaceComments(acceptedWorkspaceComments(draft, addedComment));
    workspaceState.value = transition.state;
    runCommands(transition.commands);
  }
}

function initializeReviewDraft(
  draft: CanonicalReviewDraft,
  comments: readonly WorkspaceComment[],
): void {
  draftRevision.value = draft.revision;
  reviewState = createReviewDraftState(reviewCanonical(draft));
  refreshReviewSnapshot();
  const reviewable = reviewableFiles.value;
  if (reviewable.length > 0) {
    workspace = createWorkspaceState(reviewable.map((file) => file.fileId), comments);
    workspaceState.value = workspace.getState();
    void loadFile(reviewable[0]!);
  }
}

async function revealDraftFile(): Promise<DraftRevealResult> {
  if (sessionClient === undefined) {
    throw new SessionClientError('draft', DRAFT_UNAVAILABLE_MESSAGE);
  }
  return sessionClient.revealDraftFile();
}

async function recoverDraft(expectedFingerprint: string): Promise<DraftRecoveryResult> {
  if (sessionClient === undefined) {
    throw new SessionClientError('draft', DRAFT_UNAVAILABLE_MESSAGE);
  }
  return sessionClient.recoverDraft(expectedFingerprint);
}

function acceptRecoveredDraft(result: Extract<DraftRecoveryResult, { readonly kind: 'recovered' }>): void {
  recoveredDraft.value = result;
  initializeReviewDraft(result.draft, []);
}

function openRecoveredDraft(): void {
  if (recoveredDraft.value === undefined) {
    return;
  }
  recoveredDraftOpen.value = true;
  announce(isExactPatchSession.value
    ? 'New local draft for this frozen exact patch.'
    : 'New local draft for this pinned comparison.');
}

function setAttachedStatus(status: AttachedCompletionStatus): void {
  attachedStatus.value = status;
  attachedLifecycle.value = status.kind;
}

async function reloadAttachedStatus(): Promise<void> {
  if (!isAttachedSession.value || sessionClient === undefined) return;
  setAttachedStatus(await sessionClient.getAttachedCompletionStatus());
}

function reloadPage(): void {
  window.location.reload();
}

function finishAttachedReview(): void {
  const current = reviewDraft.value;
  if (!attachedFinishReady.value || current === undefined || sessionClient === undefined) return;

  attachedLifecycle.value = 'finishing';
  announce(`Validating accepted revision ${current.canonical.revision} and its recorded anchors.`);
  attachedResult.value = undefined;
  void sessionClient.finishReview({ expectedRevision: current.canonical.revision }).then((result) => {
    attachedResult.value = result;
    switch (result.kind) {
      case 'completed':
      case 'alreadyCompleted':
        attachedLifecycle.value = 'completed';
        announce('Review finished.');
        return;
      case 'deliveryFailed':
        attachedLifecycle.value = 'terminalFailure';
        return;
      default:
        attachedLifecycle.value = 'retryableFailure';
    }
  }).catch(() => {
    attachedLifecycle.value = 'terminalFailure';
  });
}

function mutationOperation(request: DraftMutationRequest): ReviewPendingOperation {
  switch (request.type) {
    case 'setSummary': return 'summary';
    case 'editComment': return 'comment';
    case 'deleteComment': return 'delete';
    case 'resolveComment': return 'resolve';
    case 'reopenComment': return 'reopen';
    case 'addComment': return 'add';
  }
}

function mutationFailure(request: DraftMutationRequest): ReviewFailure {
  return {
    operation: mutationOperation(request),
    ...('commentId' in request ? { commentId: request.commentId } : {}),
  };
}

function mutateReview(request: DraftMutationRequest, successfulBuffer?: 'summary' | string): void {
  if (attachedMutationLocked.value || reviewState === undefined || sessionClient === undefined || !reviewState.start(mutationOperation(request))) return;
  reviewFailure.value = null;
  refreshReviewSnapshot();
  void sessionClient.mutate(request).then((result) => {
    if (result.kind === 'accepted') {
      reviewFailure.value = null;
      acceptReviewDraft(result.draft, successfulBuffer);
      if (isAttachedSession.value && attachedLifecycle.value === 'retryableFailure') {
        attachedResult.value = undefined;
        attachedLifecycle.value = 'waiting';
      }
      const open = result.draft.comments.filter((comment) => comment.state === 'open').length;
      const resolved = result.draft.comments.length - open;
      announce(
        request.type === 'setSummary'
          ? 'Summary saved locally.'
          : request.type === 'resolveComment'
            ? `Comment resolved. ${open} open, ${resolved} resolved.`
            : request.type === 'reopenComment'
              ? `Comment reopened. ${open} open, ${resolved} resolved.`
              : request.type === 'deleteComment'
                ? `Comment deleted. ${open} open, ${resolved} resolved.`
                : 'Comment saved locally.',
      );
      return;
    }
    if (result.kind === 'revisionConflict') {
      reviewFailure.value = null;
      latestConflictDraft = result.latest;
      reviewState?.conflict(reviewCanonical(result.latest), request.expectedRevision);
      refreshReviewSnapshot();
      return;
    }
    reviewFailure.value = mutationFailure(request);
    reviewState?.fail();
    refreshReviewSnapshot();
  }).catch(() => {
    reviewFailure.value = mutationFailure(request);
    reviewState?.fail();
    refreshReviewSnapshot();
  });
}

function saveSummary(): void {
  const current = reviewDraft.value;
  if (current === undefined || current.summaryBuffer === current.canonical.summary) return;
  mutateReview({ type: 'setSummary', expectedRevision: current.canonical.revision, markdown: current.summaryBuffer }, 'summary');
}


function exportReview(): void {
  const current = reviewDraft.value;
  if (attachedMutationLocked.value || current === undefined || reviewState === undefined || sessionClient === undefined) return;
  const token = current.export.phase === 'drift' ? current.export.driftAcknowledgementToken ?? undefined : undefined;
  if (!reviewState.startExport(token)) return;
  refreshReviewSnapshot();
  announce('Checking accepted revision for export.');
  void sessionClient.exportReview({
    expectedRevision: current.canonical.revision,
    ...(token === undefined ? {} : { driftAcknowledgementToken: token }),
  }).then((result) => {
    reviewState?.completeExport(result);
    refreshReviewSnapshot();
    if (result.kind === 'driftAcknowledgementRequired') {
      announce('Selected sources changed. Confirm export of the pinned review.');
    } else if (result.kind === 'driftAcknowledgementStale') {
      announce('Selected sources changed again. Review the latest identities.');
    } else if (result.kind === 'exported') {
      announce('Review export complete. Both files were published together.');
    } else if (result.kind === 'recoveryRequired') {
      announce('Export needs recovery. No success receipt is available.');
    } else if (result.kind === 'publicationFailed' || result.kind === 'reExportUnsupported') {
      announce('Export was not published. No new export pair is available.');
    }
  }).catch(() => {
    reviewState?.completeExport({ kind: 'publicationFailed' });
    refreshReviewSnapshot();
    announce('Export was not published. No new export pair is available.');
  });
}

function cancelExport(): void {
  reviewState?.cancelExport();
  refreshReviewSnapshot();
}

async function refreshIgnoreStatus(): Promise<void> {
  if (sessionClient === undefined) return;
  const status = await sessionClient.getLoopnoteIgnoreStatus();
  reviewState?.setIgnoreStatus(status);
  refreshReviewSnapshot();
}

async function appendLoopnoteIgnoreRule() {
  if (attachedMutationLocked.value || sessionClient === undefined) {
    throw new SessionClientError('draft', DRAFT_UNAVAILABLE_MESSAGE);
  }
  const result = await sessionClient.appendLoopnoteIgnoreRule();
  reviewState?.setIgnoreAppendResult(result);
  refreshReviewSnapshot();
  return result;
}

async function revealExportDirectory() {
  if (sessionClient === undefined) {
    throw new SessionClientError('draft', DRAFT_UNAVAILABLE_MESSAGE);
  }
  return sessionClient.revealExportDirectory();
}

function reviewUnsavedText(): void {
  document.querySelector<HTMLButtonElement>('.review-summary button')?.focus();
}

function reviewInlineComposer(fileId: string): void {
  selectFile(fileId);
}

async function reloadLatestReview(): Promise<void> {
  if (sessionClient === undefined) {
    return;
  }
  const exportConflict = reviewDraft.value?.export.conflict;
  const attachedConflict = attachedResult.value?.kind === 'revisionConflict';
  if (latestConflictDraft === undefined && exportConflict === null && !attachedConflict) {
    return;
  }

  try {
    const loaded = await sessionClient.getDraft();
    if (loaded.kind !== 'current') {
      return;
    }

    reviewState?.conflict(
      reviewCanonical(loaded.draft),
      reviewDraft.value?.conflict?.expectedRevision ?? exportConflict?.expectedRevision ?? loaded.draft.revision,
    );
    reviewState?.reloadLatest();
    draftRevision.value = loaded.draft.revision;
    if (workspace !== undefined) {
      const transition = workspace.replaceComments(reconciledWorkspaceComments(loaded.draft));
      workspaceState.value = transition.state;
      runCommands(transition.commands);
    }
    latestConflictDraft = undefined;
    if (isAttachedSession.value && attachedLifecycle.value === 'retryableFailure') {
      attachedResult.value = undefined;
      attachedLifecycle.value = 'waiting';
    }
  } catch {
    announce('Latest draft couldn’t be reloaded. Your unsaved text is still here.');
  } finally {
    refreshReviewSnapshot();
  }
}

function filePath(fileId: string): string {
  const file = session.value?.files.find((candidate) => candidate.fileId === fileId);
  return file?.newPath?.display ?? file?.oldPath?.display ?? 'Recorded file unavailable';
}


async function runCommands(commands: readonly WorkspaceCommand[]): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const command of commands) {
    switch (command.type) {
      case 'announce':
        announce(command.text);
        break;
      case 'focus-comment':
        void nextTick(() => diffWorkspace.value?.focusComment(command.commentId));
        break;
      case 'go-to-change':
        command.direction === 'next' ? diffWorkspace.value?.nextChange() : diffWorkspace.value?.previousChange();
        break;
      case 'layout':
        diffWorkspace.value?.layout();
        break;
      case 'persist-comment': {
        if (attachedMutationLocked.value) break;
        const originWorkspace = workspace;
        const commentLocation = `${filePath(command.fileId)} at ${command.side} line ${command.line}`;
        pending.push((sessionClient?.mutate({
          type: 'addComment',
          expectedRevision: draftRevision.value,
          fileId: command.fileId,
          side: command.side,
          line: command.line,
          endLine: command.endLine,
          body: command.body,
        }).then((result) => {
          if (workspace !== originWorkspace) {
            return;
          }
          if (result.kind === 'revisionConflict') {
            latestConflictDraft = result.latest;
            reviewState?.conflict(reviewCanonical(result.latest), result.expectedRevision);
            refreshReviewSnapshot();
            const message = 'Comment wasn’t added. Your text is still here. Reload the latest draft before trying again.';
            dispatchWorkspace({
              type: 'add-failed',
              fileId: command.fileId,
              requestId: command.requestId,
              message,
            });
            announce(`Comment on ${commentLocation} wasn’t added. Your text is still here. Reload the latest draft before trying again.`);
            return;
          }
          if (result.kind !== 'accepted') {
            throw new SessionClientError('draft', 'Comment wasn’t added. Your text is still here. Reload the latest draft before trying again.');
          }
          const comment = result.draft.comments.at(-1);
          if (comment === undefined) {
            throw new SessionClientError('draft', `Comment wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`);
          }
          const workspaceComment: WorkspaceComment = {
            id: comment.id,
            fileId: command.fileId,
            exactFile: { kind: 'available', fileId: command.fileId },
            side: comment.anchor.side,
            line: comment.anchor.line,
            body: comment.body,
            state: comment.state,
            createdAt: comment.createdAt,
            status: 'verified',
            recordedAnchor: comment.anchor,
          };
          acceptReviewDraft(result.draft, undefined, workspaceComment);
          dispatchWorkspace({
            type: 'add-succeeded',
            fileId: command.fileId,
            requestId: command.requestId,
            comment: workspaceComment,
          });
          announce(`Comment on ${commentLocation} was added and saved locally.`);
        }).catch(() => {
          if (workspace !== originWorkspace) {
            return;
          }
          const message = `Comment wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`;
          dispatchWorkspace({
            type: 'add-failed',
            fileId: command.fileId,
            requestId: command.requestId,
            message,
          });
          announce(`Comment on ${commentLocation} wasn’t added. Your text is still here. Check that ${RENAME_MAP.displayName} is running, then try again.`);
        })) ?? Promise.resolve());
        break;
      }
      case 'reveal-comment-context':
        diffWorkspace.value?.revealComment(command.side, command.line);
        break;
      case 'reveal-line':
        diffWorkspace.value?.revealComment(command.side, command.line, command.endLine);
        break;
      case 'load-file': {
        const file = activeFile(command.fileId);
        if (file !== undefined) void loadFile(file);
        break;
      }
      default:
        break;
    }
  }
  if (pending.length > 0) await Promise.all(pending);
}

async function dispatchWorkspace(event: WorkspaceEvent): Promise<void> {
  if (attachedMutationLocked.value && (
    event.type === 'activate-line'
    || event.type === 'add-comment'
    || event.type === 'cancel-composer'
    || event.type === 'confirm-discard'
    || event.type === 'confirm-move'
    || event.type === 'keep-writing'
    || event.type === 'composer-text-changed'
  )) return;
  if (workspace === undefined) return;
  const transition = workspace.dispatch(event);
  workspaceState.value = transition.state;
  await runCommands(transition.commands);
}

function selectFile(fileId: string): void {
  const file = activeFile(fileId);
  if (file === undefined) {
    return;
  }
  const openedPath = file.newPath?.display ?? file.oldPath?.display;
  if (openedPath !== undefined) {
    recentlyChangedPaths.value.delete(openedPath);
  }
  const focusHeading = changedFilesOpen.value;
  closeChangedFiles(!focusHeading);
  if (file.availability.kind !== 'text') {
    selectedFile.value = file;
    selectedContent.value = undefined;
    diffError.value = '';
    if (focusHeading) void nextTick(() => editorTitle.value?.focusHeading());
    return;
  }
  if (focusHeading) focusActiveFileAfterDialog.value = true;
  if (workspace?.getState().activeFileId === file.fileId) {
    void loadFile(file);
    return;
  }
  dispatchWorkspace({ type: 'switch-file', fileId: file.fileId });
}

function revealCommentFromPanel(commentId: string, fileId: string, side: WorkspaceComment['side'], line: number): void {
  if (fileId !== selectedFile.value?.fileId) selectFile(fileId);
  collapsedByCommentId.value = new Map([...collapsedByCommentId.value, [commentId, false]]);
  // Three nested ticks: file switch (selectFile, if cross-file) -> diff remount ->
  // thread expand, each needs its own tick before the comment header element exists.
  void nextTick(() => {
    diffWorkspace.value?.revealComment(side, line);
    void nextTick(() => {
      void nextTick(() => {
        (document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"] .thread-header`) as HTMLElement | null)?.focus();
      });
    });
  });
}

function previousFile(): void {
  dispatchWorkspace({ type: 'previous-file' });
}

function nextFile(): void {
  dispatchWorkspace({ type: 'next-file' });
}

function previousChange(): void {
  dispatchWorkspace({ type: 'previous-change' });
}

function nextChange(): void {
  dispatchWorkspace({ type: 'next-change' });
}

function handleDiffReady(fileId: string): void {
  dispatchWorkspace({ type: 'diff-ready', fileId });
  if (loadedContentMessageVersion === liveMessageVersion.value) announce(`Loaded ${selectedPath.value}.`);
  if (focusActiveFileAfterDialog.value) {
    focusActiveFileAfterDialog.value = false;
    void nextTick(() => editorTitle.value?.focusHeading());
  }
}

function retryDiff(): void {
  if (selectedFile.value !== undefined) {
    void loadFile(selectedFile.value);
  }
}

function handleKeydown(event: KeyboardEvent): void {
  const chromeKey = (event.metaKey || event.ctrlKey) ? event.key.toLowerCase() : '';
  if (chromeKey === 'b' || chromeKey === 'j') {
    event.preventDefault();
    // Shell chrome shortcuts must not mutate the inert shell behind a modal,
    // nor replace the open dialog through `openShellDialog`.
    if (!shellModalOpen.value) (chromeKey === 'b' ? toggleSidebar : togglePanel)();
    return;
  }
  if (chromeKey === 's') {
    event.preventDefault();
    if (!shellModalOpen.value && panelOpen.value && panelState.activeTab.value === 'summary') saveSummary();
    return;
  }
  const target = event.target;
  const editingThreadArticle = target instanceof HTMLTextAreaElement ? target.closest('.comment-thread') : null;
  if (editingThreadArticle !== null && editingCommentId.value !== undefined) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCommentEdit(editingCommentId.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCommentEdit(editingCommentId.value);
    }
    return;
  }
  if (target instanceof HTMLTextAreaElement && target.closest('.inline-comment-composer') !== null) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      dispatchWorkspace({ type: 'add-comment' });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      dispatchWorkspace({ type: 'escape' });
    }
    return;
  }
  // Phase 23 keyboard-entry decision (23-CONTEXT.md): Esc on a focused-but-not-editing
  // thread header (or its visible-on-focus action buttons) returns focus to the Monaco
  // editor at that thread's anchored side/line. The edit-textarea Escape case above
  // already returns before reaching here, so this only fires for the "focused header,
  // not editing" case.
  const focusedThreadArticle = target instanceof HTMLElement ? target.closest('.comment-thread') : null;
  if (focusedThreadArticle !== null && event.key === 'Escape') {
    const commentId = focusedThreadArticle.getAttribute('data-comment-id');
    const comment = commentId === null ? undefined : workspaceComments.value.find((candidate) => candidate.id === commentId);
    if (comment !== undefined && editingCommentId.value !== comment.id) {
      event.preventDefault();
      diffWorkspace.value?.focusEditorAtAnchor(comment.side, comment.line);
      return;
    }
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.altKey && event.key === 'ArrowUp') {
    event.preventDefault();
    previousFile();
  } else if (event.altKey && event.key === 'ArrowDown') {
    event.preventDefault();
    nextFile();
  } else if (event.key === 'F7') {
    event.preventDefault();
    event.shiftKey ? previousChange() : nextChange();
  } else if (event.altKey && event.key === 'F9') {
    event.preventDefault();
    event.shiftKey ? jumpThread('next') : jumpThread('previous');
  } else if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'r' && isUncommittedSession.value) {
    event.preventDefault();
    void performRefresh();
  }
}

function handleViewportChange(): void {
  const isNarrowViewport = viewportMedia?.matches ?? false;
  isNarrow.value = isNarrowViewport;
  if (!isNarrowViewport) {
    // The narrow-only "Open files" drawer trigger unmounts once the viewport widens past
    // 760px, so its ModalDialog can no longer restore focus to it (EditorTitle.vue). Move
    // focus to the consolidated title-bar toggle that replaces it instead.
    const wasChangedFilesOpen = changedFilesOpen.value;
    closeChangedFiles();
    if (wasChangedFilesOpen) {
      void nextTick(() => nextTick(() => titleBar.value?.focusSidebarToggle()));
    }
  }
  dispatchWorkspace({ type: 'resize' });
  diffWorkspace.value?.layout();
}

async function refreshPatchStatus(): Promise<void> {
  if (sessionClient === undefined || patchStatusRefreshing || patchStatus.value?.kind === 'snapshotUnavailable') {
    return;
  }
  patchStatusRefreshing = true;
  try {
    patchStatus.value = await sessionClient.getPatchStatus();
  } finally {
    patchStatusRefreshing = false;
  }
}

function refreshPatchStatusWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    void refreshPatchStatus();
  }
}
async function refreshSupportStatus(): Promise<void> {
  if (!supportEnabled.value || sessionClient === undefined || supportRefreshInFlight) return;
  supportRefreshInFlight = true;
  try {
    const result = await sessionClient.refreshSupportStatus();
    supportStatus.value = result.status;
    if (result.status === 'verified') {
      if (supportDialogOpen.value && supportDialogMode.value !== 'verified') {
        supportDialogMode.value = 'thankYou';
        announce(`Thank you for supporting ${RENAME_MAP.displayName}.`);
        if (supportThankYouTimer !== undefined) window.clearTimeout(supportThankYouTimer);
        supportThankYouTimer = window.setTimeout(closeSupportDialog, 1_500);
      }
      stopSupportWaiting();
    }
  } catch {
    supportStatus.value = 'unavailable';
  } finally {
    supportRefreshInFlight = false;
  }
}

function refreshSupportWhenVisible(): void {
  if (supportEnabled.value && document.visibilityState === 'visible') void refreshSupportStatus();
}

function stopSupportWaiting(): void {
  supportPollAbort?.abort();
  supportPollAbort = undefined;
  if (supportWaitingTimer !== undefined) {
    window.clearTimeout(supportWaitingTimer);
    supportWaitingTimer = undefined;
  }
}

function scheduleSupportPoll(delays = [2_000, 3_000, 5_000, 8_000, 10_000]): void {
  if (!supportEnabled.value) return;
  stopSupportWaiting();
  supportPollAbort = new AbortController();
  // Hosted support intents expire after ten minutes.
  const deadline = Date.now() + 600_000;
  let index = 0;
  const poll = (): void => {
    if (supportPollAbort?.signal.aborted || supportStatus.value === 'verified') return;
    void refreshSupportStatus().finally(() => {
      if (supportPollAbort?.signal.aborted || supportStatus.value === 'verified') return;
      if (Date.now() >= deadline) {
        stopSupportWaiting();
        if (supportDialogMode.value === 'waiting') {
          supportDialogMode.value = 'notConfirmed';
          announce("Support wasn't confirmed. You can try again.");
        }
        return;
      }
      supportWaitingTimer = window.setTimeout(poll, delays[index++] ?? 15_000);
    });
  };
  poll();
}
function startSupportStatus(): void {
  if (!supportEnabled.value) return;
  document.addEventListener('visibilitychange', refreshSupportWhenVisible);
  supportBackgroundTimer = window.setInterval(refreshSupportWhenVisible, 30_000);
}

function stopSupportStatus(): void {
  document.removeEventListener('visibilitychange', refreshSupportWhenVisible);
  stopSupportWaiting();
  if (supportBackgroundTimer !== undefined) window.clearInterval(supportBackgroundTimer);
  if (supportThankYouTimer !== undefined) window.clearTimeout(supportThankYouTimer);
}

function openSupportDialog(): void {
  if (!supportEnabled.value) return;
  supportOpener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  openShellDialog('support');
  supportDialogMode.value = supportStatus.value === 'verified' ? 'verified' : 'invitation';
}
function closeSupportDialog(): void {
  closeShellDialog('support');
  void nextTick(() => (supportOpener === undefined ? statusBar.value?.focusSupport() : supportOpener.focus()));
  stopSupportWaiting();
}

function dismissSupportDialog(): void {
  dismissedForSession.value = true;
  closeSupportDialog();
}

async function startSupportAction(action: 'support' | 'restore'): Promise<void> {
  if (!supportEnabled.value || sessionClient === undefined || supportBusy.value) return;
  const hostedTab = window.open('', '_blank');
  if (hostedTab !== null) hostedTab.opener = null;
  let handedOff = false;
  supportBusy.value = true;
  try {
    const result = await sessionClient.startSupportAction(action);
    if (result.kind === 'ready' && hostedTab !== null) {
      hostedTab.location.replace(result.flowUrl);
      handedOff = true;
      supportDialogMode.value = 'waiting';
      scheduleSupportPoll();
    }
  } finally {
    if (!handedOff) hostedTab?.close();
    supportBusy.value = false;
  }
}

function restoreSupport(): void {
  void startSupportAction('restore');
}

function startPatchStatus(): void {
  void refreshPatchStatus();
  document.addEventListener('visibilitychange', refreshPatchStatusWhenVisible);
  patchStatusInterval = window.setInterval(refreshPatchStatusWhenVisible, 30_000);
}

function stopPatchStatus(): void {
  document.removeEventListener('visibilitychange', refreshPatchStatusWhenVisible);
  if (patchStatusInterval !== undefined) {
    window.clearInterval(patchStatusInterval);
    patchStatusInterval = undefined;
  }
}

async function refreshWorktreeIndicator(): Promise<void> {
  if (sessionClient === undefined || worktreeIndicatorRefreshing) {
    return;
  }
  worktreeIndicatorRefreshing = true;
  try {
    worktreeChanged.value = (await sessionClient.getWorktreeStatus()).changed;
  } finally {
    worktreeIndicatorRefreshing = false;
  }
}

function refreshWorktreeIndicatorWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    void refreshWorktreeIndicator();
  }
}

function startWorktreeIndicator(): void {
  void refreshWorktreeIndicator();
  document.addEventListener('visibilitychange', refreshWorktreeIndicatorWhenVisible);
  worktreeIndicatorInterval = window.setInterval(refreshWorktreeIndicatorWhenVisible, 30_000);
}

function stopWorktreeIndicator(): void {
  document.removeEventListener('visibilitychange', refreshWorktreeIndicatorWhenVisible);
  if (worktreeIndicatorInterval !== undefined) {
    window.clearInterval(worktreeIndicatorInterval);
    worktreeIndicatorInterval = undefined;
  }
}

async function performRefresh(): Promise<void> {
  if (sessionClient === undefined || refreshBusy.value) {
    return;
  }
  if (unsavedInlineComposerFile.value !== undefined) {
    await dispatchWorkspace({ type: 'add-comment' });
  }
  refreshBusy.value = true;
  try {
    const delta = await sessionClient.refreshWorktreeSnapshot();
    if (delta.added.length + delta.removed.length + delta.modified.length > 0) {
      refreshSummary.value = delta;
    }
    recentlyChangedPaths.value = new Set([...delta.added, ...delta.removed, ...delta.modified]);
    const previousPath = selectedFile.value?.newPath?.display ?? selectedFile.value?.oldPath?.display;
    const previousIndex = flatFileRows.value.findIndex((row) => row.fileId === selectedFile.value?.fileId);
    const previousFileIdsByPath = new Map<string, string>();
    for (const file of reviewableFiles.value) {
      const path = file.newPath?.display ?? file.oldPath?.display;
      if (path !== undefined) previousFileIdsByPath.set(path, file.fileId);
    }
    const refreshedSession = await sessionClient.getSession();
    session.value = refreshedSession;
    const fileIds = reviewableFiles.value.map((file) => file.fileId);
    if (workspace === undefined && fileIds.length > 0) {
      workspace = createWorkspaceState(fileIds);
    }
    if (workspace !== undefined) {
      const previousFileIds = new Map<string, string>();
      for (const file of reviewableFiles.value) {
        const path = file.newPath?.display ?? file.oldPath?.display;
        const previousId = path === undefined ? undefined : previousFileIdsByPath.get(path);
        if (previousId !== undefined) previousFileIds.set(file.fileId, previousId);
      }
      workspaceState.value = workspace.replaceFiles(fileIds, previousFileIds).state;
    }
    if (selectedFile.value !== undefined) {
      const resolvedFileId = previousPath === undefined ? undefined : resolvePathToFileId(previousPath, refreshedSession.files);
      if (resolvedFileId !== undefined) {
        if (resolvedFileId !== selectedFile.value.fileId) {
          selectFile(resolvedFileId);
        }
      } else {
        const fallbackRows = flatFileRows.value;
        if (fallbackRows.length > 0) {
          const fallbackIndex = Math.min(Math.max(previousIndex, 0), fallbackRows.length - 1);
          const fallbackRow = fallbackRows[fallbackIndex];
          const nextPath = fallbackRow.file.newPath?.display ?? fallbackRow.file.oldPath?.display ?? 'Changed file';
          selectFile(fallbackRow.fileId);
          if (previousPath !== undefined) {
            announce(`${previousPath} is no longer in the review; showing ${nextPath}`);
          }
        } else {
          requestVersion += 1;
          selectedFile.value = undefined;
          selectedContent.value = undefined;
          diffLoading.value = false;
        }
      }
    } else if (reviewableFiles.value[0] !== undefined) {
      selectFile(reviewableFiles.value[0].fileId);
    }
    const loadedDraft = await sessionClient.getDraft();
    if (loadedDraft.kind === 'current' && workspace !== undefined) {
      const transition = workspace.replaceComments(reconciledWorkspaceComments(loadedDraft.draft));
      workspaceState.value = transition.state;
      runCommands(transition.commands);
    }
  } finally {
    refreshBusy.value = false;
  }
}

async function acceptUncommittedRecovery(): Promise<void> {
  if (sessionClient === undefined || recoveryBusy.value) {
    return;
  }
  recoveryBusy.value = true;
  try {
    await sessionClient.recoverUncommittedDraft();
    const loadedDraft = await sessionClient.getDraft();
    if (loadedDraft.kind === 'current' && workspace !== undefined) {
      const transition = workspace.replaceComments(reconciledWorkspaceComments(loadedDraft.draft));
      workspaceState.value = transition.state;
      runCommands(transition.commands);
    }
    recoveryOfferDismissed.value = true;
  } finally {
    recoveryBusy.value = false;
  }
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('pagehide', flushPendingDeletes);
  document.addEventListener('visibilitychange', flushPendingDeletesWhenHidden);
  viewportMedia = window.matchMedia('(max-width: 760px)');
  handleViewportChange();
  viewportMedia.addEventListener('change', handleViewportChange);
  try {
    sessionClient = createSessionClient();
    sessionToken.value = sessionClient.sessionToken;
    const loaded = await sessionClient.getSession();
    session.value = loaded;
    if (isAttachedSession.value) {
      try {
        await reloadAttachedStatus();
      } catch {
        attachedLifecycle.value = 'waitingDisconnected';
      }
    }
    if ('patch' in loaded) {
      startPatchStatus();
    } else {
      selectorDriftState = createSelectorDriftState(sessionClient, announce, { status: selectorDriftStatus });
      selectorDriftState.start();
    }
    if (isUncommittedSession.value) {
      startWorktreeIndicator();
    }
    const loadedDraft = await sessionClient.getDraft();
    draftLoad.value = loadedDraft;
    if (loadedDraft.kind === 'current' || loadedDraft.kind === 'missing') {
      const draft = loadedDraft.kind === 'current'
        ? loadedDraft.draft
        : { revision: 0, summary: '', comments: [] as const };
      initializeReviewDraft(
        draft,
        loadedDraft.kind === 'current' ? reconcileDraftComments(draft.comments, loaded.files) : [],
      );
    void refreshIgnoreStatus().catch(() => undefined);
      announce(isExactPatchSession.value
        ? draft.comments.length > 0
          ? 'Local draft resumed. Accepted comments for this frozen exact patch are ready.'
          : 'New local draft for this frozen exact patch.'
        : draft.comments.length > 0
          ? 'Local draft resumed. Accepted comments for this pinned comparison are ready.'
          : 'New local draft for this pinned comparison.');
      if (supportEnabled.value) {
        await refreshSupportStatus();
        startSupportStatus();
        if (supportStatus.value === 'unverified' && !dismissedForSession.value && primarySurface.value === 'workspace') {
          openShellDialog('support');
          supportDialogMode.value = 'invitation';
        }
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof SessionClientError ? error.message : SECURITY_FAILURE_MESSAGE;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('pagehide', flushPendingDeletes);
  document.removeEventListener('visibilitychange', flushPendingDeletesWhenHidden);
  viewportMedia?.removeEventListener('change', handleViewportChange);
  selectorDriftState?.stop();
  stopPatchStatus();
  stopWorktreeIndicator();
  stopSupportStatus();
});
</script>

<template>
  <main v-if="primarySurface === 'loading' && errorMessage === ''" class="loading-shell">
    <section class="state-card" aria-labelledby="loading-heading">
      <h1 id="loading-heading">{{ isExactPatchSession ? `${RENAME_MAP.displayName}: loading exact patch` : `${RENAME_MAP.displayName}: loading pinned comparison` }}</h1>
      <p role="status">{{ isExactPatchSession ? 'Opening frozen patch review…' : 'Opening local draft…' }}</p>
    </section>
  </main>

  <main v-else-if="errorMessage !== '' || patchSnapshotUnavailable || session === undefined" class="unavailable-shell">
    <h1 v-if="!isExactPatchSession">Review unavailable</h1>
    <ErrorState
      :alert="!patchSnapshotUnavailable"
      :focus-heading="patchSnapshotUnavailable"
      :heading="isExactPatchSession ? unavailableHeading : undefined"
      :message="unavailableMessage"
    />
  </main>

  <div v-else class="session-shell">
    <a v-if="panelState.sidebarVisible.value && !isNarrow" class="skip-link" href="#changed-files-heading">Skip to files</a>
    <a class="skip-link" :href="`#${RENAME_MAP.cssPrefix}heading`">Skip to diff</a>
    <WorkbenchShell
      :sidebar-visible="panelState.sidebarVisible.value"
      :sidebar-width="panelState.sidebarWidth.value"
      :panel-open="panelOpen"
      :panel-height="panelState.panelHeight.value"
      :is-narrow="isNarrow"
      :inert="shellModalOpen"
      @update:sidebar-width="commitSidebarWidth"
      @update:panel-height="commitPanelHeight"
    >
      <template #titlebar>
        <TitleBar
          ref="titleBar"
          :session="session"
          :attached-lifecycle="isAttachedSession ? (attachedLifecycle === 'finishing' || attachedLifecycle === 'completed' ? attachedLifecycle : 'waiting') : undefined"
          :refresh-busy="refreshBusy"
          :show-refresh="isUncommittedSession"
          :worktree-changed="worktreeChanged"
          :selector-drift-status="selectorDriftStatus"
          :patch-drifted="patchDrifted"
          :sidebar-visible="panelState.sidebarVisible.value"
          :panel-open="panelOpen"
          @refresh="performRefresh"
          @toggle-sidebar="toggleSidebar"
          @toggle-panel="togglePanel"
        />
      </template>
      <template #editor>
        <div v-if="refreshBusy" class="editor-refresh-progress"><div class="editor-refresh-progress__sweep" /></div>
        <DraftRecovery
          v-if="recoveryLoad !== undefined && primarySurface !== 'workspace'"
          :load="recoveryLoad"
          :reveal-draft-file="revealDraftFile"
          :recover-draft="recoverDraft"
          @recovered="acceptRecoveredDraft"
          @open-new-draft="openRecoveredDraft"
        />
        <template v-else>
          <EditorTitle
            ref="editorTitle"
            :files-drawer="isNarrow"
            :mode="activeFileMode"
            :selected-file="selectedFile"
            :selected-path="selectedPath"
            :at-first-file="atFirstFile"
            :at-last-file="atLastFile"
            :has-active-file="selectedFile?.availability.kind === 'text'"
            :single-pane="singlePaneSide !== undefined"
            :render-side-by-side="renderSideBySide"
            :has-threads-anywhere="hasThreadsAnywhere"
            :any-thread-expanded="anyThreadExpanded"
            :has-comments-in-current-file="hasCommentsInCurrentFile"
            @toggle-files="toggleSidebar"
            @toggle-mode="(mode) => selectedContent !== undefined && setFileMode(selectedContent.fileId, mode)"
            @previous-file="previousFile"
            @next-file="nextFile"
            @previous-change="previousChange"
            @next-change="nextChange"
            @toggle-layout="(value) => (renderSideBySide = value)"
            @previous-thread="() => jumpThread('previous')"
            @next-thread="() => jumpThread('next')"
            @toggle-threads-collapsed="toggleThreadsCollapsed"
          />
          <section
            v-if="hasUnverifiedAnchors || (capturedFilesChanged > 0 && !dismissedCaptureBanner) || refreshSummary !== undefined || (recoveryAvailable && !recoveryOfferDismissed)"
            class="shell-warning-stack"
          >
            <StaleAnchorNotice v-if="hasUnverifiedAnchors" />
            <InlineNotice
              v-if="capturedFilesChanged > 0 && !dismissedCaptureBanner"
              tone="warning"
              role="note"
              dismissible
              :dismiss-label='`Dismiss "${capturedFilesChanged} files changed during capture" notice`'
              @dismiss="dismissedCaptureBanner = true"
            >
              {{ capturedFilesChanged }} file{{ capturedFilesChanged === 1 ? '' : 's' }} changed during capture — Refresh to recapture
            </InlineNotice>
            <InlineNotice v-if="recoveryAvailable && !recoveryOfferDismissed" tone="information" role="note" dismissible dismiss-label='Dismiss "Resume previous uncommitted review?" notice' @dismiss="recoveryOfferDismissed = true"><h2>Resume previous uncommitted review?</h2><p>A previous draft exists for this source. Resuming copies its comments into this review, reclassified against the current snapshot. The previous draft is left untouched.</p><button type="button" class="ui-button ui-button--primary" :disabled="recoveryBusy" :aria-busy="recoveryBusy" @click="acceptUncommittedRecovery">{{ recoveryBusy ? 'Resuming…' : 'Resume' }}</button></InlineNotice>
            <RefreshSummaryPanel
              v-if="refreshSummary !== undefined"
              v-bind="refreshSummary"
              :session-files="session?.files ?? []"
              @dismiss="refreshSummary = undefined"
              @select-file="selectFile"
            />
          </section>
          <Breadcrumbs :path="selectedPath" />
          <section v-if="orphanedGroups.length > 0" class="conversation-card" aria-labelledby="orphaned-comments-heading">
            <header class="conversation-card__header">
              <div class="conversation-card__identity">
                <h2 id="orphaned-comments-heading">Orphaned comments</h2>
              </div>
            </header>
            <div v-for="group in orphanedGroups" :key="group.path.bytesBase64url" class="conversation-card__body">
              <h3 class="conversation-card__identity"><PathText :display="group.path.display" /></h3>
              <div v-for="comment in group.comments" :key="comment.id">
                <ReviewStateBadge kind="unavailable" label="Anchor missing" size="compact" />
                <p>{{ comment.body }}</p>
              </div>
            </div>
          </section>
          <section v-if="session.files.length === 0" class="empty-state">
            <h2>{{ emptyFilesCopy.heading }}</h2>
            <p>{{ emptyFilesCopy.message }}</p>
          </section>
          <section v-else-if="selectedFile?.availability.kind !== 'text'" class="empty-state">
            <h2>Diff unavailable for this file</h2>
            <p>{{ selectedFile?.availability.kind === 'unsupported' && selectedFile.availability.reason === 'changed-during-capture' ? `This file changed while ${RENAME_MAP.displayName} was capturing the snapshot and could not be read consistently. Refresh to recapture it.` : `${selectedFile?.availability.kind === 'unsupported' ? `unsupported: ${selectedFile.availability.reason}` : 'unavailable: missing-object'}. Select another changed file to continue reviewing.` }}</p>
          </section>
          <section v-else-if="diffLoading" class="diff-state">Loading diff…</section>
          <section v-else-if="diffError !== ''" class="empty-state" :role="isRangeSession || isExactPatchSession ? 'alert' : undefined">
            <template v-if="isExactPatchSession">
              <h2>Frozen patch file unavailable</h2>
              <p>{{ `${RENAME_MAP.displayName} could not read this file from the frozen patch snapshot. Try the same snapshot again; current repository or worktree bytes will not be substituted.` }}</p>
              <button type="button" class="ui-button" @click="retryDiff">Try frozen snapshot again</button>
            </template>
            <template v-else-if="isRangeSession">
              <h2>Pinned range unavailable</h2>
              <p>{{ `${RENAME_MAP.displayName} could not load the pinned commits or scoped file inventory. Relaunch the same request; this review will not substitute current refs.` }}</p>
              <button type="button" class="ui-button" @click="retryDiff">Try loading pinned diff again</button>
            </template>
            <template v-else>
              <h2>Diff couldn’t be loaded</h2>
              <p>{{ `The pinned file content is unavailable. Try again, or relaunch ${RENAME_MAP.displayName} if the session ended.` }}</p>
              <button type="button" class="ui-button" @click="retryDiff">Try loading diff again</button>
            </template>
          </section>
          <DiffWorkspace
            v-else-if="selectedContent !== undefined"
            ref="diffWorkspace"
            :comments="liveWorkspaceComments"
            :composer="activeComposer"
            :content="selectedContent"
            :mode="activeFileMode"
            :path="selectedPath"
            :session-token="sessionToken"
            :source-kind="isExactPatchSession ? 'exact-patch' : 'range'"
            :single-pane-side="singlePaneSide"
            :base-oid="singlePaneBaseOid"
            :head-oid="singlePaneHeadOid"
            :mutations-locked="attachedMutationLocked"
            :render-side-by-side="renderSideBySide"
            :collapsed-by-comment-id="collapsedByCommentId"
            :editing-comment-id="editingCommentId"
            :comment-buffers="reviewDraft?.commentBuffers"
            @activate="(side, line, endLine) => dispatchWorkspace({ type: 'activate-line', side, line, endLine })"
            @add="dispatchWorkspace({ type: 'add-comment' })"
            @cancel="dispatchWorkspace({ type: 'cancel-composer' })"
            @confirm-discard="dispatchWorkspace({ type: 'confirm-discard' })"
            @confirm-move="dispatchWorkspace({ type: 'confirm-move' })"
            @keep-writing="dispatchWorkspace({ type: 'keep-writing' })"
            @ready="handleDiffReady"
            @update-text="(text) => dispatchWorkspace({ type: 'composer-text-changed', text })"
            @next-change="nextChange"
            @previous-change="previousChange"
            @next-file="nextFile"
            @previous-file="previousFile"
            @next-thread="() => jumpThread('next')"
            @previous-thread="() => jumpThread('previous')"
            @resolve-comment="(commentId) => mutateReview({ type: 'resolveComment', expectedRevision: reviewDraft?.canonical.revision ?? 0, commentId })"
            @reopen-comment="(commentId) => mutateReview({ type: 'reopenComment', expectedRevision: reviewDraft?.canonical.revision ?? 0, commentId })"
            @delete-comment="(commentId) => beginPendingDelete(commentId)"
            @toggle-comment-collapse="toggleCommentCollapse"
            @begin-edit-comment="(commentId) => { editingCommentId = commentId; if (!reviewDraft?.commentBuffers.has(commentId)) { reviewState?.setCommentBuffer(commentId, currentCommentBody(commentId)); refreshReviewSnapshot(); } }"
            @update-comment-edit-text="(commentId, text) => { reviewState?.setCommentBuffer(commentId, text); refreshReviewSnapshot(); }"
            @save-comment-edit="saveCommentEdit"
            @cancel-comment-edit="cancelCommentEdit"
          />
        </template>
      </template>
      <template #panel>
        <BottomPanel
          v-if="reviewDraft !== undefined && session !== undefined"
          ref="panelRef"
          :active-tab="panelState.activeTab.value"
          :flat-file-rows="flatFileRows"
          :open="panelOpen"
          :comments="workspaceComments"
          :summary="reviewDraft.canonical.summary"
          :summary-buffer="reviewDraft.summaryBuffer"
          :revision="reviewDraft.canonical.revision"
          :pinned-endpoints="pinnedSession"
          :comment-buffers="reviewDraft.commentBuffers"
          :pending="reviewDraft.pending"
          :conflict="reviewDraft.conflict === null ? null : { expectedRevision: reviewDraft.conflict.expectedRevision, actualRevision: reviewDraft.conflict.latest.revision }"
          :failure="reviewFailure"
          :retained-summary="reviewDraft.retained.summary"
          :export-state="reviewDraft.export"
          :append-ignore-rule="appendLoopnoteIgnoreRule"
          :refresh-ignore-status="refreshIgnoreStatus"
          :reveal-export-directory="revealExportDirectory"
          :attached-lifecycle="isAttachedSession ? attachedLifecycle : undefined"
          :attached-ready="attachedFinishReady"
          :unsaved-inline-composer-file="unsavedInlineComposerFile"
          :attached-failure="attachedResult"
          :mutation-locked="attachedMutationLocked"
          :is-exact-patch="isExactPatchSession"
          :export-supported="!isUncommittedSession || isStandaloneSession"
          @close="closePanel"
          @update:active-tab="selectPanelTab"
          @reveal="revealCommentFromPanel"
          @cancel-summary="if (!attachedMutationLocked) { reviewState?.setSummaryBuffer(reviewDraft?.canonical.summary ?? ''); refreshReviewSnapshot(); }"
          @reload-latest="reloadLatestReview"
          @save-summary="saveSummary"
          @update:summary-buffer="(value) => { if (!attachedMutationLocked) { reviewState?.setSummaryBuffer(value); refreshReviewSnapshot(); } }"
          @cancel-export="cancelExport"
          @export="exportReview"
          @review-unsaved-text="reviewUnsavedText"
          @review-inline-composer="reviewInlineComposer"
          @finish-review="finishAttachedReview"
          @reload-attached="reloadPage"
        />
      </template>
      <template #statusbar>
        <StatusBar
          ref="statusBar"
          :session="session"
          :identifier="statusbarIdentifier"
          :stale-comment-count="staleCommentCount"
          :attached-lifecycle="isAttachedSession ? (attachedLifecycle === 'finishing' || attachedLifecycle === 'completed' ? attachedLifecycle : 'waiting') : undefined"
          :export-supported="!isUncommittedSession || isStandaloneSession"
          :open-comment-count="openCommentCount"
          :support-enabled="supportEnabled"
          :support-inert="supportDialogOpen"
          :support-open="supportDialogOpen"
          @open-panel="openPanel"
          @support="openSupportDialog"
        />
      </template>
    </WorkbenchShell>
    <ChangedFilesDialog
      :open="changedFilesOpen"
      :restore-focus="changedFilesRestoreFocus"
      :narrow="isNarrow"
      :files="session.files"
      :recently-changed-paths="recentlyChangedPaths"
      :open-comment-counts="openCommentCounts"
      :line-counts="panelState.treeLineCounts.value"
      :comment-badges-enabled="panelState.treeCommentBadges.value"
      :view-mode="panelState.treeViewMode.value"
      :initial-selected-file-id="selectedFile?.fileId"
      :empty-heading="emptyFilesCopy.heading"
      :empty-message="emptyFilesCopy.message"
      @close="closeChangedFiles"
      @select="selectFile"
      @activate="selectFile"
      @update:view-mode="toggleTreeViewMode"
      @update:line-counts="toggleTreeLineCounts"
      @update:comment-badges="toggleTreeCommentBadges"
      @filter-result="handleFilterResult"
    />
    <SupportDialog
      v-if="supportEnabled"
      ref="supportDialog"
      :open="supportDialogOpen"
      :mode="supportDialogMode"
      :busy="supportBusy"
      @support="() => { void startSupportAction('support'); }"
      @restore="restoreSupport"
      @dismiss="dismissSupportDialog"
      @close="closeSupportDialog"
    />
    <div v-if="pendingUndos.length > 0" class="undo-toast-stack">
      <UndoToast
        v-for="entry in pendingUndos"
        :key="entry.commentId"
        :comment-id="entry.commentId"
        message="Comment deleted"
        @undo="undoPendingDelete(entry.commentId)"
      />
    </div>
    <p class="visually-hidden" aria-live="polite">
      <span :key="liveMessageVersion" :data-announcement-version="liveMessageVersion">{{ liveMessage }}</span>
    </p>
  </div>
</template>

<style src="./styles.css"></style>
