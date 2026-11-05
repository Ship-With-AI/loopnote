import { shallowRef, type ShallowRef } from 'vue';

export const PANEL_STATE_STORAGE_KEY = 'loopnote.workbench.v1';

const SIDEBAR_WIDTH_DEFAULT = 264;
const SIDEBAR_WIDTH_MIN = 170;
const SIDEBAR_WIDTH_MAX = 520;

const PANEL_HEIGHT_DEFAULT = 240;
const PANEL_HEIGHT_MIN = 120;
const PANEL_HEIGHT_MAX = 520;

const SIDEBAR_VISIBLE_DEFAULT = true;

const TREE_VIEW_MODE_DEFAULT = 'tree';
const TREE_LINE_COUNTS_DEFAULT = 'hover';
const TREE_COMMENT_BADGES_DEFAULT = true;

export type TreeViewMode = 'tree' | 'list';
export type TreeLineCountsMode = 'always' | 'hover' | 'never';

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * SHELL-02/SHELL-04: clamps a side-bar width to the sash's documented drag
 * bounds (170-520px) so a corrupt or out-of-range persisted value can never
 * reach the layout as an unusable width.
 */
export function clampSidebarWidth(value: number): number {
  return clamp(value, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
}

/**
 * SHELL-03/SHELL-04: clamps a bottom-panel height to the sash's documented
 * drag bounds (120-520px) so a corrupt or out-of-range persisted value can
 * never reach the layout as an unusable height.
 */
export function clampPanelHeight(value: number): number {
  return clamp(value, PANEL_HEIGHT_MIN, PANEL_HEIGHT_MAX);
}

export interface PersistedPanelState {
  readonly sidebarWidth: number;
  readonly sidebarVisible: boolean;
  readonly panelHeight: number;
  readonly treeViewMode: TreeViewMode;
  readonly treeLineCounts: TreeLineCountsMode;
  readonly treeCommentBadges: boolean;
}

function defaultPersistedPanelState(): PersistedPanelState {
  return {
    sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
    sidebarVisible: SIDEBAR_VISIBLE_DEFAULT,
    panelHeight: PANEL_HEIGHT_DEFAULT,
    treeViewMode: TREE_VIEW_MODE_DEFAULT,
    treeLineCounts: TREE_LINE_COUNTS_DEFAULT,
    treeCommentBadges: TREE_COMMENT_BADGES_DEFAULT,
  };
}

/**
 * SHELL-04/T-20-01: parses the `loopnote.workbench.v1` localStorage value
 * into a fully-defaulted, in-range `PersistedPanelState`. Never throws:
 * `JSON.parse` failures, wrong-shape payloads (non-object, array, null),
 * and per-field type mismatches each fall back to that field's own
 * documented default independently — one bad field never rejects the
 * whole object.
 */
export function parsePanelState(raw: string | null): PersistedPanelState {
  if (raw === null) {
    return defaultPersistedPanelState();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultPersistedPanelState();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaultPersistedPanelState();
  }

  const candidate = parsed as Record<string, unknown>;
  return {
    sidebarWidth: typeof candidate.sidebarWidth === 'number'
      ? clampSidebarWidth(candidate.sidebarWidth)
      : SIDEBAR_WIDTH_DEFAULT,
    sidebarVisible: typeof candidate.sidebarVisible === 'boolean'
      ? candidate.sidebarVisible
      : SIDEBAR_VISIBLE_DEFAULT,
    panelHeight: typeof candidate.panelHeight === 'number'
      ? clampPanelHeight(candidate.panelHeight)
      : PANEL_HEIGHT_DEFAULT,
    treeViewMode: candidate.treeViewMode === 'tree' || candidate.treeViewMode === 'list'
      ? candidate.treeViewMode
      : TREE_VIEW_MODE_DEFAULT,
    treeLineCounts: candidate.treeLineCounts === 'always' ||
      candidate.treeLineCounts === 'hover' ||
      candidate.treeLineCounts === 'never'
      ? candidate.treeLineCounts
      : TREE_LINE_COUNTS_DEFAULT,
    treeCommentBadges: typeof candidate.treeCommentBadges === 'boolean'
      ? candidate.treeCommentBadges
      : TREE_COMMENT_BADGES_DEFAULT,
  };
}

export interface PanelStateOptions {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

export interface PanelState {
  readonly sidebarWidth: ShallowRef<number>;
  readonly sidebarVisible: ShallowRef<boolean>;
  readonly panelHeight: ShallowRef<number>;
  readonly treeViewMode: ShallowRef<TreeViewMode>;
  readonly treeLineCounts: ShallowRef<TreeLineCountsMode>;
  readonly treeCommentBadges: ShallowRef<boolean>;
  persist(): void;
}

/**
 * SHELL-04: builds the reactive panel-state slice from whatever is
 * currently in `options.storage` (defaults to `window.localStorage`),
 * self-healing through `parsePanelState` at construction time so a corrupt
 * stored value never reaches a Vue reactive layout prop, and exposes
 * `persist()` to write the current — always valid — values back under
 * `PANEL_STATE_STORAGE_KEY`.
 */
export function createPanelState(options: PanelStateOptions = {}): PanelState {
  const storage = options.storage ?? window.localStorage;
  const initial = parsePanelState(storage.getItem(PANEL_STATE_STORAGE_KEY));

  const sidebarWidth = shallowRef(initial.sidebarWidth);
  const sidebarVisible = shallowRef(initial.sidebarVisible);
  const panelHeight = shallowRef(initial.panelHeight);
  const treeViewMode = shallowRef(initial.treeViewMode);
  const treeLineCounts = shallowRef(initial.treeLineCounts);
  const treeCommentBadges = shallowRef(initial.treeCommentBadges);

  return Object.freeze({
    sidebarWidth,
    sidebarVisible,
    panelHeight,
    treeViewMode,
    treeLineCounts,
    treeCommentBadges,
    persist() {
      const persisted: PersistedPanelState = {
        sidebarWidth: sidebarWidth.value,
        sidebarVisible: sidebarVisible.value,
        panelHeight: panelHeight.value,
        treeViewMode: treeViewMode.value,
        treeLineCounts: treeLineCounts.value,
        treeCommentBadges: treeCommentBadges.value,
      };
      storage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(persisted));
    },
  });
}
