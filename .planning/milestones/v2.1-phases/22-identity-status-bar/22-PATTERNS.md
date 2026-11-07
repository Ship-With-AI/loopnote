# Phase 22: Identity & Status Bar - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 13 (4 new source + 2 new test + 1 modified-via-new-branches + 4 modified components/files + 3 modified e2e specs grouped as 1 row)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/components/workbench/IdentityPill.vue` | component (presentational) | request-response (prop-in, click/event-out) | `src/web/components/workbench/TitleBar.vue` (current `.session-header__comparison` block, lines 100-148) | exact — same session-kind branching relocated into a new file |
| `src/web/components/workbench/IdentityPopover.vue` | component (presentational, non-modal disclosure) | request-response (prop-in, emit-out) | `src/web/components/ui/ModalDialog.vue` (focus-trap/Escape/restore-focus, lines 1-72) for behavior; `src/web/components/SelectorDriftNotice.vue` (lines 1-77) for drift-row/copy-button composition | role-match — modal minus backdrop/`aria-modal` |
| `src/domain/truncate-middle.ts` | utility | transform (pure fn) | `src/domain/path-bytes.ts` (`controlSafeDisplay`, lines 22-44) | role-match — same tier/style, different transform (truncation vs escaping) |
| `tests/unit/truncate-middle.test.ts` | test | transform (unit) | `tests/unit/product-identity.test.ts` (lines 1-41) | exact — same `describe`/`test`/`test.each` Vitest convention, same directory |
| `src/web/components/ui/UiIcon.vue` (new `v-else-if` branches: `compare`, `chevron`, `patch`, `worktree`, `copy`) | component (icon library, presentational) | transform (name-in, SVG markup out) | itself — existing `lock`/`refresh`/`open` branches (lines 1-60) | exact — adding sibling branches to the same discriminated template, not a new file |
| `src/web/components/workbench/TitleBar.vue` | component (presentational layout host) | request-response | itself (pre-change) | exact — modified in place, loses identity markup, gains `<IdentityPill>` child |
| `src/web/components/workbench/StatusBar.vue` | component (presentational) | request-response | itself (pre-change) | exact — modified in place, extends existing left-item/comment-count/emphasis-item logic |
| `src/web/App.vue` | controller/root component (owns reactive state) | event-driven (polling + user events) | itself (pre-change) | exact — modified in place; new view-model props threaded to existing children, warning-stack `v-if` narrowed, new watcher added |
| `src/web/styles.css` | config (global stylesheet) | — | itself, sections for `.attached-fact` (lines 1911-1919), `.session-header__selector` (styles.css:310-313), `.modal-dialog` (`--surface-raised` consumer), `--space-*` tokens (lines 154-157) | exact — new classes follow existing token/utility conventions verbatim |
| `tests/e2e/pinned-session.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts`, `tests/e2e/agent-ready-export.spec.ts` | test (e2e, Playwright) | request-response (locator assertions) | each file, itself (pre-change) | exact — locator scoping/text updates only, no new test files |

## Pattern Assignments

### `src/web/components/workbench/IdentityPill.vue` (component, request-response)

**Analog:** `src/web/components/workbench/TitleBar.vue` (current identity block, to be removed from there and relocated here)

**Imports pattern** (`TitleBar.vue` lines 1-7):
```typescript
import { computed, ref } from 'vue';

import type { SessionResponse } from '../../../contracts/api';
import { RENAME_MAP } from '../../../domain/product-identity';
import { controlSafeDisplay } from '../../../domain/path-bytes';
import UiIcon from '../ui/UiIcon.vue';
```
`IdentityPill.vue` additionally imports `truncateMiddle` from `../../../domain/truncate-middle`.

**Core discriminant pattern** (`TitleBar.vue` lines 26-41, port verbatim per RESEARCH.md Pattern 4 — "do not re-derive from scratch"):
```typescript
const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => 'base' in props.session ? props.session : undefined);
const uncommittedKey = computed(() =>
  'uncommitted' in props.session
    ? (props.session as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isUncommitted = computed(() => uncommittedKey.value !== undefined && !isStandalone.value);
const uncommittedSession = computed(() => (isUncommitted.value ? uncommittedKey.value : undefined));
const standaloneSession = computed(() => (isStandalone.value ? uncommittedKey.value : undefined));
const sourceLabel = computed(() => {
  switch (uncommittedSession.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    default: return '';
  }
});
```
UI-SPEC's `IdentityKind` discriminated union (`range`/`worktree`/`exact-patch`/`staged`/`unstaged`/`working-tree`/`standalone`/`branch`) is this same chain reshaped into one `computed<IdentityKind>` — same booleans, single return value instead of template `v-if`/`v-else-if` chain.

**Per-kind endpoint markup to port** (`TitleBar.vue` lines 100-148 — branch/worktree/uncommitted/exact-patch templates):
```html
<template v-if="isExactPatch">
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">PREIMAGE</span>
    <span class="session-header__selector" title="Repository object">Repository object</span>
  </span>
  <span aria-hidden="true">→</span>
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">POSTIMAGE</span>
    <span class="session-header__selector" title="Implemented content">Implemented content</span>
  </span>
</template>
<template v-else-if="isUncommitted">
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">BASE</span>
    <span v-if="uncommittedSession?.sourceKind === 'unstaged'" class="session-header__selector">Index</span>
    <span v-else class="session-header__selector" :title="baseCandidateLabel">{{ baseCandidateLabel }} · {{ baseCandidateOid }}</span>
  </span>
  <span aria-hidden="true">→</span>
  <span class="session-header__endpoint">
    <span class="session-header__endpoint-label">HEAD</span>
    <span class="session-header__selector" :title="sourceLabel">{{ sourceLabel }} · snapshot {{ shortDigest }}</span>
  </span>
</template>
```
Rename `.session-header__endpoint`/`.session-header__selector`/`.session-header__endpoint-label` classes to `.identity-pill__endpoint`/`.identity-pill__ref`/`.identity-pill__label` per UI-SPEC's Pill Content markup skeleton (line 128 of UI-SPEC), but the branching logic and literal copy (`PREIMAGE`/`POSTIMAGE`/`Repository object`/`Implemented content`/`Index`) carry over unchanged — confirmed by UI-SPEC's Data-grounding deviation section and the locator table's note that these 4 strings still pass in `workbench-shell-smoke.spec.ts:329-333`.

**Truncation + control-safety wrapping** (UI-SPEC Truncation Rule + Security V5, `TitleBar.vue` already wraps every label through `controlSafeDisplay`):
```typescript
// Every ref/label interpolated in the template must be both truncateMiddle()'d for
// display AND controlSafeDisplay()'d first, same order TitleBar.vue uses today for its
// baseLabel/headLabel/sourceLabel computeds — truncate the control-safe string, never the raw one.
```

**Truncation guard CSS** (`src/web/styles.css:1911-1919`, `.attached-fact`):
```css
.attached-fact {
  min-width: 0;
  overflow: hidden;
  padding: var(--space-1) var(--space-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
```
Every text-bearing node inside `IdentityPill.vue` (and any new flex-wrapper ancestor, e.g. `.identity-pill-host`, `.identity-pill__endpoint`) MUST carry this same four-property block plus `min-width: 0` on flex ancestors, per UI-SPEC's Truncation Rule section and RESEARCH.md Pitfall 2.

---

### `src/web/components/workbench/IdentityPopover.vue` (component, non-modal disclosure, request-response)

**Analog A (focus-trap/Escape/restore-focus):** `src/web/components/ui/ModalDialog.vue`

**Imports pattern** (`ModalDialog.vue` lines 1-2):
```typescript
import { nextTick, ref, useId, watch } from 'vue';
```

**Focus-trap constant + Escape/Tab handler** (`ModalDialog.vue` lines 26-33, 52-...; copy verbatim per UI-SPEC's "copy implementation into `IdentityPopover.vue` — do not import" directive):
```typescript
const focusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(', ');

function containFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close'); // ModalDialog calls dismiss(); IdentityPopover emits close directly
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
  if (controls.length === 0) return;
  const first = controls[0]!;
  const last = controls.at(-1)!;
  // ... wrap-around Tab/Shift+Tab logic, port the remainder of ModalDialog.vue:52-72 verbatim
}
```

**Opener-capture / restore-focus pattern** (`ModalDialog.vue` lines 24, 35-46 — `focusInitial`/`restoreFocus` pair):
```typescript
let opener: HTMLElement | undefined;

function focusInitial(): void {
  void nextTick(() => {
    const initial = props.initialFocusSelector === undefined
      ? undefined
      : panel.value?.querySelector<HTMLElement>(props.initialFocusSelector);
    (initial ?? closeButton.value)?.focus();
  });
}

function restoreFocus(): void {
  if (opener?.isConnected) opener.focus();
}
```
`IdentityPopover.vue` mirrors this via its own `watch(() => props.open, ...)` (per UI-SPEC's Focus Management section), with `opener = document.activeElement` captured by `IdentityPill.vue` (the owner of `popoverOpen`) on open, and `nextTick(() => panel.value?.querySelector(focusableSelector)?.focus())` for initial focus — no `initialFocusSelector` prop needed since Copy/drift-section buttons are naturally first in DOM/tab order.

**Deviations from `ModalDialog.vue` (per UI-SPEC, Claude's Discretion resolved):**
- No backdrop `<div>` / no `@click.self` dismiss handler — popover is non-modal.
- `role="dialog"` without `aria-modal="true"`.
- New: a `document`-level `mousedown` listener added on open / removed on close, calling `emit('close')` when the click target is outside both the popover panel and the pill trigger (ModalDialog doesn't need this because its backdrop already absorbs outside clicks).

**Analog B (drift-row composition inside popover body):** `src/web/components/SelectorDriftNotice.vue`

**Component usage, mounted verbatim per UI-SPEC** (own full file, lines 1-77):
```typescript
import { computed, ref } from 'vue';
import type { SelectorDriftResponse, SelectorDriftStatus } from '../../contracts/api.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import { controlSafeDisplay } from '../../domain/path-bytes.js';
import UiIcon from './ui/UiIcon.vue';
```
```html
<!-- Mounted unchanged inside IdentityPopover.vue's body, same props, no markup/copy edits -->
<SelectorDriftNotice :drift="selectorDriftStatus" />
```
Its own clipboard-copy pattern (`copyPinnedCommit`, lines 34-38) is the precedent for `IdentityPopover.vue`'s new `copyIdentity()` footer action:
```typescript
function copyPinnedCommit(status: Exclude<SelectorDriftStatus, { readonly kind: 'unchanged' }>): void {
  void navigator.clipboard.writeText(status.oldOid)
    .then(() => { copied.value = `Pinned ${status.role === 'base' ? 'Base' : 'Head'} commit copied.`; })
    .catch(() => { copied.value = 'Couldn't copy pinned commit.'; });
}
```

**Analog C (`InlineNotice` reuse for patch-drift/worktree-changed rows):** `src/web/components/InlineNotice.vue` (full file, lines 1-53)
```html
<InlineNotice tone="error">
  <h2>Implemented content changed</h2>
  <p>{{ `The repository or worktree no longer matches this exact patch. The frozen review remains readable, but ${RENAME_MAP.displayName} will not substitute current content. Relaunch with a patch that matches the current implementation.` }}</p>
</InlineNotice>
```
Source for this exact block to relocate: `src/web/App.vue:1361-1364`. `InlineNotice`'s `role="status"` default (component itself, prop default `role: 'note'` — note: patch-drift notice currently passes `tone="error"` with no explicit `role`, so it defaults to `role="note"`; `RefreshSummaryPanel.vue`'s own `InlineNotice` usage is the live-region-for-completion precedent per RESEARCH.md) is reused as-is, no new ARIA wiring needed.

---

### `src/domain/truncate-middle.ts` (utility, transform)

**Analog:** `src/domain/path-bytes.ts`

**Module style to mirror** (`path-bytes.ts` lines 22-44, `controlSafeDisplay`):
```typescript
export function controlSafeDisplay(value: string): string {
  let display = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (character === '\\') {
      display += '\\\\';
    } else if (character === '\t') {
      display += '\\t';
    } else if (character === '\n') {
      display += '\\n';
    } else if (character === '\r') {
      display += '\\r';
    } else if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      display += `\\u{${codePoint.toString(16).padStart(2, '0')}}`;
    } else {
      display += character;
    }
  }
  return display;
}
```
Convention confirmed: plain exported function (no class, no default export), no side effects, takes/returns `string`, codepoint-safe iteration (`for...of` over the string, not index/`.length` on UTF-16 code units). `truncate-middle.ts` follows the identical shape — `export function truncateMiddle(text: string, max = 28): string`, using `Array.from(text)` for codepoint-safety per RESEARCH.md Pattern 3's full worked implementation.

---

### `tests/unit/truncate-middle.test.ts` (test, transform)

**Analog:** `tests/unit/product-identity.test.ts` (full file, lines 1-41+)

**Import + describe/test convention** (lines 1-13):
```typescript
import { describe, expect, test } from 'vitest';

import { deriveProductIdentity, RENAME_MAP } from '../../src/domain/product-identity.js';

describe('deriveProductIdentity', () => {
  test('derives single-word name', () => {
    const identity = deriveProductIdentity('Acme');
    expect(identity).toEqual({ /* ... */ });
  });
```
RESEARCH.md's Code Examples section already provides the ported version using `describe`/`test`/`test.each`, importing `truncateMiddle` from `'../../src/domain/truncate-middle.js'` (note `.js` extension on the TS source import — matches `product-identity.test.ts`'s own `.js`-suffixed relative import of a `.ts` file, this repo's ESM-resolution convention).

---

### `src/web/components/ui/UiIcon.vue` (new icon branches: `compare`, `chevron`, `patch`, `worktree`, `copy`)

**Analog:** itself — existing discriminated-template branches (lines 1-60)

**Type union + branch pattern to extend** (lines 2-26, 43-60):
```typescript
export type UiIconName =
  | 'previous-file'
  | 'next-file'
  // ... existing entries
  | 'disabled';
```
```html
<template v-if="name === 'previous-file'">
  <path d="M10.5 2.5H5.25A1.75 1.75 0 0 0 3.5 4.25v7.5c0 .97.78 1.75 1.75 1.75h5.25c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75Z" />
  <path d="m7.5 5.5-2.5 2.5 2.5 2.5M5.25 8H11" />
</template>
<template v-else-if="name === 'next-file'">
  ...
</template>
```
New names (`'compare' | 'chevron' | 'patch' | 'worktree' | 'copy'`) are added to the `UiIconName` union, each as a new `<template v-else-if="name === '...'">` branch appended before the closing of the chain, reusing the shared `<svg>` wrapper's fixed attributes (`16×16` viewBox, `stroke-width="1.5"`, `fill="none"`, `aria-hidden="true"`, `stroke-linecap/linejoin="round"`) already declared once on the root `<svg>` (lines 30-42) — no new file, no per-icon wrapper. Exact path geometry for `compare`/`chevron` is given verbatim in UI-SPEC's Icon Inventory table (lines 388-389).

---

### `src/web/components/workbench/TitleBar.vue` (modified, component, request-response)

**Current structure being replaced** (lines 100-148, 149-178 — `.session-header__comparison`, `.header-facts`, refresh button):
```html
<div class="titlebar__center">
  <div class="session-header__comparison"> <!-- DELETE, becomes <IdentityPill> -->
    ...
  </div>
  <div class="header-facts"> <!-- DELETE, folded into popover -->
    <span class="pin-cue">{{ isExactPatch ? 'Frozen patch' : ... }}</span>
    <span v-for="endpoint in dirtyEndpoints" :key="endpoint.role" class="dirty-badge">
      <span>Dirty</span>
    </span>
  </div>
</div>
...
<button ... title="Refresh snapshot" @click="emit('refresh')"> <!-- converts to icon-only, moves inside IdentityPill -->
  <UiIcon name="refresh" />
  {{ refreshBusy ? 'Refreshing…' : 'Refresh' }}
</button>
```
**Target pattern:** `.titlebar__center` keeps its exact wrapper CSS (lines 217-226, `position:absolute;left:50%;...;min-width:0`) but its single child becomes `<IdentityPill :session="session" :refresh-busy="refreshBusy" ... @refresh="emit('refresh')" />`; `TitleBar.vue`'s own props/emits (`attachedLifecycle`, `inert`, `showRefresh`, `worktreeChanged`, `sidebarVisible`, `panelOpen`) and its unrelated right-group icon buttons (`sidebar`/`panel`, lines 179-199) and brand block (lines 102-105) are untouched — confirmed by UI-SPEC: "`TitleBar.vue`'s unrelated right-group icon buttons ... `.attached-fact` agent-status span **unchanged**."

---

### `src/web/components/workbench/StatusBar.vue` (modified, component, request-response)

**Current left-item + comment-count + Export structure** (lines 32-53):
```html
<footer class="statusbar">
  <div class="statusbar__left">
    <UiIcon name="lock" />
    <span>{{ snapshotLabel }}</span>
  </div>
  <div class="statusbar__right">
    <button type="button" class="statusbar__item" @click="emit('openPanel')">
      {{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}
    </button>
    <button v-if="exportSupported" type="button" class="statusbar__item statusbar__item--emphasis" @click="emit('openPanel')">
      Export
    </button>
```
**Changes required per UI-SPEC's Status Bar section:**
- `snapshot-label: string` prop replaced by `identifier: string` (bare 7-char digest/SHA, computed in `App.vue` per the Left-item table — `UiIcon name="lock"` stays, text content changes from descriptive label to bare identifier).
- Comment-count button text changes from `{{ openCommentCount }} open comment{{s}}` to the new `💬 {open} open · {stale} stale` format (new prop `staleCommentCount: number` needed) — same `v-if`-free conditional-string-building style as the existing pluralization ternary at line 44, extended per UI-SPEC's four-branch format table (lines 280-284).
- Emphasized item (lines 46-53) gains label/`disabled`/`aria-busy` bound to a new `attachedLifecycle` prop per the Emphasis-item matrix (UI-SPEC lines 290-297) — same `v-if="exportSupported"` gate, same `.statusbar__item--emphasis` class, same `@click="emit('openPanel')"`.
- Support item (lines 54-64) is explicitly unchanged — "`StatusBar.vue`'s current Support button already implements this" (RESEARCH.md STAT-03 row).

**Scoped style convention to extend** (lines 69-102):
```css
.statusbar {
  display: flex;
  min-width: 0;
  height: var(--statusbar-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  font-size: var(--font-size-chrome);
  line-height: var(--line-height-chrome);
}
.statusbar__left,
.statusbar__right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}
```
New `.statusbar__stale` (warning-ink span around the stale-count fragment) is added as a sibling rule using the same `--space-*`/`--status-warning-foreground` tokens, not a new scale.

---

### `src/web/App.vue` (modified, root component, event-driven)

**Existing reactive state — reused verbatim, no changes to the refs/computeds themselves** (lines 108-123, 166-174, 297-306):
```typescript
const patchStatus = shallowRef<PatchStatusResponse>();              // App.vue:108
const selectorDriftStatus = shallowRef<SelectorDriftResponse>();    // App.vue:113
const attachedLifecycle = ref<AttachedLifecycle>('ordinary');       // App.vue:114
const worktreeChanged = ref(false);                                 // App.vue:122
const refreshBusy = ref(false);                                     // App.vue:123

const isExactPatchSession = computed(() => exactPatchSession.value !== undefined);
const isUncommittedSession = computed(() => session.value !== undefined && 'uncommitted' in session.value);
const isStandaloneSession = computed(() => uncommittedSession.value?.sourceKind === 'standalone');

const workspaceComments = computed(() => workspaceState.value?.comments ?? []);           // App.vue:297
const openCommentCount = computed(() => workspaceComments.value.filter((c) => c.state === 'open').length); // App.vue:298
const hasUnverifiedAnchors = computed(() =>
  workspaceComments.value.some((comment) => comment.status === 'stale' || comment.status === 'orphaned'),
);                                                                                         // App.vue:299-301
```
New `staleCommentCount` computed is a one-line sibling of `openCommentCount`/`hasUnverifiedAnchors` (per RESEARCH.md STAT-01 row): `computed(() => workspaceComments.value.filter((comment) => comment.status === 'stale').length)`.

**Boolean-latch announcement idiom to replicate for the new `worktreeChanged` watcher** (`App.vue:337-341`, the `patchDrifted` precedent):
```typescript
let hadPatchDrift = false;
watch(patchDrifted, (drifted) => {
  if (drifted && !hadPatchDrift) announce('Implemented content changed.');
  hadPatchDrift = drifted;
});
```
New watcher (UI-SPEC's exact specified variable names):
```typescript
let hadWorktreeChanged = false;
watch(worktreeChanged, (changed) => {
  if (changed && !hadWorktreeChanged) announce('Working tree changed since snapshot.');
  hadWorktreeChanged = changed;
});
```

**Refresh trigger — existing, no logic changes** (`App.vue:1170-1193`, `performRefresh`; keybinding at `App.vue:971-973`):
```typescript
async function performRefresh(): Promise<void> {
  if (sessionClient === undefined || refreshBusy.value) return;
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
    // ... draft reload
  } finally {
    refreshBusy.value = false;
  }
}
```
```typescript
} else if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'r' && isUncommittedSession.value) {
  event.preventDefault();
  void performRefresh();
}
```
Both reused by reference — `IdentityPill.vue`'s title-bar icon and `IdentityPopover.vue`'s primary button both just `emit('refresh')` up to `TitleBar`'s existing `@refresh="performRefresh"` wiring (`App.vue:1323`); ⌥⇧R binding is untouched.

**Warning-stack `v-if` narrowing** (`App.vue:1357-1366`, exact current block):
```html
<section
  v-if="patchDrifted || hasUnverifiedAnchors || selectorDriftStatus?.base.kind !== 'unchanged' || selectorDriftStatus?.head.kind !== 'unchanged' || (capturedFilesChanged > 0 && !dismissedCaptureBanner) || refreshSummary !== undefined || (recoveryAvailable && !recoveryOfferDismissed)"
  class="shell-warning-stack"
>
  <InlineNotice v-if="patchDrifted" tone="error">            <!-- REMOVE, relocate into popover -->
    <h2>Implemented content changed</h2>
    <p>{{ `The repository or worktree no longer matches this exact patch. ...` }}</p>
  </InlineNotice>
  <SelectorDriftNotice :drift="selectorDriftStatus" />        <!-- REMOVE, relocate into popover -->
  <StaleAnchorNotice v-if="hasUnverifiedAnchors" />            <!-- STAYS -->
  <!-- capturedFilesChanged / recoveryAvailable InlineNotice blocks, RefreshSummaryPanel: STAY -->
</section>
```
The `v-if` on `<section class="shell-warning-stack">` drops the `patchDrifted` and `selectorDriftStatus?.base.kind !== 'unchanged' || selectorDriftStatus?.head.kind !== 'unchanged'` terms (those two notices no longer render there at all); the remaining four terms (`hasUnverifiedAnchors`, captured-files-changed, `refreshSummary`, recovery-offer) are untouched.

**Editor-column host for the new progress bar** (`src/web/components/workbench/WorkbenchShell.vue:23`):
```html
<div class="workbench-shell__editor"><slot name="editor" /></div>
```
`.editor-refresh-progress` (`v-if="refreshBusy"`) is a new absolutely-positioned child inside the `#editor` slot content in `App.vue`'s template (same slot that already hosts `EditorTitle`/warning-stack/`Breadcrumbs`, `App.vue:1328-1393`), not a change to `WorkbenchShell.vue` itself.

**TitleBar/StatusBar prop wiring to extend** (`App.vue:1314-1326`, `1481-1492`):
```html
<TitleBar
  ref="titleBar"
  :session="session"
  :attached-lifecycle="isAttachedSession ? (attachedLifecycle === 'finishing' || attachedLifecycle === 'completed' ? attachedLifecycle : 'waiting') : undefined"
  :refresh-busy="refreshBusy"
  :show-refresh="isUncommittedSession"
  :worktree-changed="worktreeChanged"
  :sidebar-visible="panelState.sidebarVisible.value"
  :panel-open="panelOpen"
  @refresh="performRefresh"
  @toggle-sidebar="toggleSidebar"
  @toggle-panel="togglePanel"
/>
...
<StatusBar
  ref="statusBar"
  :session="session"
  :snapshot-label="snapshotLabel"
  :export-supported="!isUncommittedSession || isStandaloneSession"
  :open-comment-count="openCommentCount"
  :support-enabled="supportEnabled"
  :support-inert="supportDialogOpen"
  :support-open="supportDialogOpen"
  @open-panel="openPanel"
  @support="openSupportDialog"
/>
```
`:attached-lifecycle` ternary on `TitleBar` (line 1317) is reused verbatim as the source for `StatusBar`'s new emphasis-item label prop (STAT-02, per RESEARCH.md citation of this exact line); `:snapshot-label="snapshotLabel"` is replaced by a new `:identifier="..."` computed per the Status Bar left-item table; a new `:stale-comment-count="staleCommentCount"` prop is added alongside `:open-comment-count`.

---

### `tests/e2e/pinned-session.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts`, `tests/e2e/agent-ready-export.spec.ts` (modified, e2e, Playwright locators)

**Analog:** each file, itself — existing Playwright locator/assertion idiom

**`pinned-session.spec.ts` current locator** (lines 356-360):
```typescript
await expect(page.locator('.titlebar').getByRole('heading', { level: 1 })).toHaveCount(0);
await expect(page.locator('.session-header__comparison')).toContainText(
  `BASEBase fixture · ${expectedBase.slice(0, 7)}→HEADHead fixture · ${expectedHead.slice(0, 7)}`,
);
await expect(page.getByText('Pinned comparison', { exact: true })).toBeVisible();
```
Per UI-SPEC's Locator table: `.session-header__comparison` → `.identity-pill` (whitespace/arrow layout changes with new markup, assert via `.identity-pill__ref`/`.identity-pill__sha` child locators instead of one flat `toContainText`); the bare `'Pinned comparison'` text assertion is removed (folded into popover guidance text, not visible in the title bar anymore).

**`agent-ready-export.spec.ts` current unscoped locator pattern** (lines 666, 669, repeated at 8 call sites):
```typescript
await expect(page.getByRole('button', { name: 'Finish review', exact: true })).toBeVisible();
...
await page.getByRole('button', { name: 'Finish review', exact: true }).click();
```
Per UI-SPEC's Locator table, each of the 8 call sites gets scoped to `page.locator('.statusbar').getByRole('button', { name: 'Finish review', exact: true })` since the status-bar's own emphasized item now shares the same accessible name as a (pre-existing, unrelated) panel-internal control — same `getByRole` idiom, just container-scoped to disambiguate.

**`workbench-shell-smoke.spec.ts` current locator** (around line 329, per RESEARCH.md citation):
```typescript
banner.getByText('PREIMAGE'/'POSTIMAGE'/'Repository object'/'Implemented content'/'Frozen patch', { exact: true })
```
First 4 assertions pass unchanged (literal strings reused verbatim in `IdentityPill.vue`); the 5th (`'Frozen patch'`) is removed with no replacement in the title bar (frozen/no-refresh semantics move into popover guidance text).

## Shared Patterns

### Focus-trap / Escape / Tab-cycle / opener-restore
**Source:** `src/web/components/ui/ModalDialog.vue` lines 1-72 (full file)
**Apply to:** `IdentityPopover.vue` only (copied, not imported — `IdentityPopover` is not built on `ModalDialog`'s template/backdrop)
```typescript
const focusableSelector = [
  'button:not(:disabled)', 'input:not(:disabled)', 'textarea:not(:disabled)',
  'select:not(:disabled)', 'a[href]', '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(', ');
function containFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key !== 'Tab') return;
  const controls = Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
  // wrap first/last per ModalDialog.vue's remaining lines 58-72
}
```

### Boolean-latch "announce once per transition"
**Source:** `src/web/App.vue:337-341` (`hadPatchDrift`)
**Apply to:** new `worktreeChanged` watcher in `App.vue`
```typescript
let had<X> = false;
watch(<signal>, (value) => {
  if (value && !had<X>) announce('<message>.');
  had<X> = value;
});
```
Already used 2× in `App.vue` (`hadUnverifiedAnchors` at line 330-336, `hadPatchDrift` at 337-341) — this is the file's established idiom, not a new abstraction; `IdentityPill`/`IdentityPopover` never call `announce()` directly, only `App.vue` does.

### Pluralization / count-string convention
**Source:** `src/web/components/workbench/StatusBar.vue:44` (current `comment{{s}}` ternary) and RESEARCH.md Pitfall 1
**Apply to:** `StatusBar.vue`'s new comment-count format
```html
{{ openCommentCount }} open comment{{ openCommentCount === 1 ? '' : 's' }}
```
The *new* `💬 {open} open · {stale} stale` format deliberately avoids this class of bug by using invariant adjectives ("open"/"stale") instead of a counted noun — no `s`-suffix ternary is needed in the new string, per UI-SPEC's explicit callout. Where any singular/plural noun strings remain elsewhere in the touched files (none introduced by this phase), this ternary is the house idiom to copy.

### Control-character-safe display of untrusted ref/path strings
**Source:** `src/domain/path-bytes.ts:22-44` (`controlSafeDisplay`), consumed today by `TitleBar.vue:45-69` and `SelectorDriftNotice.vue:6`
**Apply to:** every interpolated ref/label/path string in `IdentityPill.vue` and `IdentityPopover.vue`
```typescript
import { controlSafeDisplay } from '../../../domain/path-bytes';
// ...
<span class="identity-pill__ref">{{ truncateMiddle(controlSafeDisplay(base.label)) }}</span>
```
`controlSafeDisplay` must run before `truncateMiddle` on any string sourced from git ref names or filesystem paths (both can carry arbitrary/control bytes); SHAs are not run through `truncateMiddle` (never truncated) but may still pass through `controlSafeDisplay` defensively, consistent with `TitleBar.vue`'s current universal wrapping.

### 4-property text-truncation guard (`min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`)
**Source:** `src/web/styles.css:1911-1919` (`.attached-fact`), mirrored at `.session-header__selector` (`styles.css:310-313`)
**Apply to:** every text-bearing node and every new flex-wrapper ancestor inside `IdentityPill.vue` (`.identity-pill-host`, `.identity-pill__endpoint`, `.identity-pill__ref`, etc.)
```css
.identity-pill__ref {
  min-width: 0;
  overflow: hidden;
  padding: var(--space-1) var(--space-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

## No Analog Found

None. Per RESEARCH.md's own assessment, this phase is "overwhelmingly a relocation/composition exercise" — every new file has a direct precedent already in the codebase:
- `truncateMiddle` has no *behavioral* precedent (no prior middle-truncation helper exists) but has an exact *structural/stylistic* precedent (`path-bytes.ts`'s `controlSafeDisplay`) that fully specifies the convention to follow (plain exported function, no class, codepoint-safe iteration, `src/domain/` placement, paired Vitest unit test).
- `IdentityPopover.vue`'s non-modal focus-trap has no identical prior component, but is an explicit, UI-SPEC-directed subset extraction of `ModalDialog.vue` (minus backdrop/`aria-modal`), not new interaction design.

## Metadata

**Analog search scope:** `src/web/components/` (all `.vue` files), `src/web/components/workbench/`, `src/web/components/ui/`, `src/domain/`, `src/web/App.vue`, `src/web/styles.css`, `tests/unit/`, `tests/e2e/`
**Files scanned:** 14 source files read directly (`TitleBar.vue`, `StatusBar.vue`, `ModalDialog.vue`, `SelectorDriftNotice.vue`, `InlineNotice.vue`, `UiIcon.vue`, `WorkbenchShell.vue`, `path-bytes.ts`, `product-identity.ts`, `App.vue` targeted ranges, `styles.css` targeted ranges, `product-identity.test.ts`, `pinned-session.spec.ts`, `agent-ready-export.spec.ts`) plus full directory listings of `src/web/components/`, `src/web/components/workbench/`, `src/web/components/ui/`, and `tests/`
**Pattern extraction date:** 2026-11-05
