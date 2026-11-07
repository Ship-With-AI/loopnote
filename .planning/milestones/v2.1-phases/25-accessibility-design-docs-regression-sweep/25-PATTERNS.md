# Phase 25: Accessibility, Design Docs & Regression Sweep - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 9 (2 component edits, 1 new e2e spec, 2 flaky-spec edits, 1 unit-spec doc note, 1 build-script edit, 1 prose doc rewrite, 1 announce-wiring edit spread across `App.vue`)
**Analogs found:** 8 / 9 (DESIGN.md prose rewrite has no code analog — see "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/web/components/workbench/TitleBar.vue` | component (template attribute edit) | event-driven | `src/web/components/workbench/EditorTitle.vue:101` + `src/web/components/FileTree.vue:401` | exact (same `role="toolbar"` + `aria-label` convention, same button-cluster `<div>` shape) |
| `src/web/components/workbench/StatusBar.vue` | component (template attribute edit) | event-driven | `src/web/components/FileTree.vue:401` | exact (independently-tabbable button cluster, not a widget) |
| `src/web/App.vue` (`announce()` call-site additions: panel-tab-switch, thread-collapse, filter/view-mode change, markdown toggle, Undo-copy fix) | component (Vue root — event handler / watcher additions) | event-driven | `src/web/App.vue` itself — `announce()` definition (:493-496) and existing call sites (:384, :773-782, :911, :995, :1210) | exact (same file, same function, additive call sites only) |
| `tests/e2e/toolbar-roles.spec.ts` (new, Claude's Discretion naming) | test (e2e, packaged-binary) | request-response (HTTP via `page.goto`) | `tests/e2e/workbench-shell-smoke.spec.ts:1-43,125-150` (pack/spawn/`assertShellRegionsPresent` scaffold) + `tests/e2e/file-tree.spec.ts` (`getByRole` idioms) | exact for scaffold, role-match for assertions |
| Live-region exactly-once-per-outcome e2e/integration assertions (new or extended, in `tests/integration/anchored-workspace.spec.ts` or a new spec) | test (integration, version-delta assertion) | event-driven | `tests/integration/anchored-workspace.spec.ts:1050-1079` (`data-announcement-version` delta pattern) | exact |
| Popover/menu Esc + focus-return e2e assertions (new, covering `IdentityPopover.vue` + `ViewOptionsMenu.vue` + thread menus) | test (e2e, keyboard interaction) | event-driven | `tests/e2e/file-tree.spec.ts:700-702` (View Options menu) + `tests/e2e/inline-comment-threads.spec.ts:393-401` (thread-header Esc) | exact |
| `tests/e2e/rendered-markdown-security.spec.ts` (flake fix: `test.setTimeout`) | test (e2e, packaged-binary, modify existing) | event-driven | its own existing structure (`:32` `test.setTimeout(90_000)`, `:149` `pack-runtime.mjs` invocation) | exact (self-analog) |
| `tests/e2e/anchored-review.spec.ts` (flake fix: `test.setTimeout`) | test (e2e, packaged-binary, modify existing) | event-driven | its own existing structure (`:33` `test.setTimeout(90_000)`, `:207` `pack-runtime.mjs` invocation) | exact (self-analog) |
| `tests/unit/token-contract.test.ts` (documentation-only — no code change expected) | test (unit, Vite dev-server) | event-driven | its own existing structure (`:130-155`, already-root-caused flake) | exact (self-analog; action is a STATE.md note, not an edit to this file) |
| `DESIGN.md` | documentation (prose, not code) | — | none (static Markdown, not a code pattern) | no analog — see "No Analog Found" |

## Pattern Assignments

### `src/web/components/workbench/TitleBar.vue` (component, event-driven)

**Analog:** `src/web/components/FileTree.vue:401` (primary — identical flat button-cluster shape) and `src/web/components/workbench/EditorTitle.vue:101` (secondary — same convention on a sibling workbench-chrome component)

**Existing shipped convention** (`FileTree.vue:401`, PASS per `25-UI-SPEC.md` line 86):
```vue
<div class="file-tree-pane__toolbar" role="toolbar" aria-label="Changed files actions">
```

**Second precedent** (`EditorTitle.vue:101`, PASS per `25-UI-SPEC.md` line 87):
```vue
<div class="editor-title" role="toolbar" aria-label="Diff navigation">
```

**Current state to fix** (`TitleBar.vue:63-97`, no `role`/`aria-label` on the wrapper):
```vue
<div class="titlebar__right">
  <button v-if="showRefresh" ... aria-label="Refresh snapshot">...</button>
  <button ref="sidebarToggle" ... aria-label="Toggle side bar (⌘B)">...</button>
  <button ... aria-label="Toggle panel (⌘J)">...</button>
</div>
```

**Target shape** — add exactly two attributes to the existing wrapper `<div>` at `TitleBar.vue:63`, no other markup change, no new spacing/geometry (`25-UI-SPEC.md:302`):
```vue
<div class="titlebar__right" role="toolbar" aria-label="Title bar actions">
```

**Do not touch:** `.titlebar__center` (not a control cluster — holds `IdentityPill` + attached-fact text), the `<header class="titlebar">` element itself (carries the implicit `banner` landmark role — `25-UI-SPEC.md:18` flags overriding it as the exact defect this phase is fixing, in reverse).

---

### `src/web/components/workbench/StatusBar.vue` (component, event-driven)

**Analog:** `src/web/components/FileTree.vue:401` (same shape: independently-tabbable button cluster, not an ARIA widget)

**Current state to fix** (`StatusBar.vue:64-94`, no `role`/`aria-label` on the wrapper):
```vue
<div class="statusbar__right">
  <button type="button" class="statusbar__item" :aria-label="..." @click="emit('openPanel')">...</button>
  <button v-if="exportSupported" ... class="statusbar__item statusbar__item--emphasis">...</button>
  <button v-if="supportEnabled" ref="support" ... class="identity-disclosure">...</button>
</div>
```

**Target shape** — add exactly two attributes to the existing wrapper `<div>` at `StatusBar.vue:64`:
```vue
<div class="statusbar__right" role="toolbar" aria-label="Status bar actions">
```

**Do not touch:** `.statusbar__left` (identifier text only, no interactive controls — `25-UI-SPEC.md:111` confirms no role needed), the `<footer class="statusbar">` element itself (carries the implicit `contentinfo` landmark role — same anti-pattern as `TitleBar.vue`'s `<header>`, per `25-UI-SPEC.md:18,105`).

---

### `src/web/App.vue` — new `announce()` call sites (component, event-driven)

**Analog:** the file's own `announce()` definition and existing call-site conventions — this is additive wiring into an already-centralized function, not a new pattern.

**The single live-region owner** (`App.vue:493-496`):
```typescript
function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}
```

**Template sink** (`App.vue:1762-1764`) — the only `aria-live` region in the app; `key`-ed span forces a DOM mutation even on repeated identical text:
```vue
<p class="visually-hidden" aria-live="polite">
  <span :key="liveMessageVersion" :data-announcement-version="liveMessageVersion">{{ liveMessage }}</span>
</p>
```

**House-style call-site shape** (`App.vue:773-782`, the resolve/reopen/delete sibling group the Undo-fix must match):
```typescript
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
```

**Fix target — Undo announcement is the one outlier missing counts** (`App.vue:413-424`, `undoPendingDelete`):
```typescript
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
  announce('Comment restored.');   // ← fix: reuse openCommentCount (App.vue:299) to match the sibling shape above
}
```
`openCommentCount` is already a computed at `App.vue:299`: `workspaceComments.value.filter((comment) => comment.state === 'open').length`. Fix per `25-UI-SPEC.md:217`:
```typescript
announce(`Comment restored. ${openCommentCount.value} open, ${workspaceComments.value.length - openCommentCount.value} resolved.`);
```

**New call site 1 — thread collapse (single)**, wire into existing handler (`App.vue:360-366`, emit source: `CommentThread.vue`'s `toggleCollapse`, wired at `App.vue:1659` `@toggle-comment-collapse="toggleCommentCollapse"`):
```typescript
function toggleCommentCollapse(commentId: string): void {
  const comment = workspaceComments.value.find((candidate) => candidate.id === commentId);
  const current = collapsedByCommentId.value.get(commentId) ?? (comment?.state === 'resolved');
  const next = new Map(collapsedByCommentId.value);
  next.set(commentId, !current);
  collapsedByCommentId.value = next;
  // add: announce(!current ? 'Thread collapsed.' : 'Thread expanded.');
}
```

**New call site 2 — thread collapse (all)**, `App.vue:368-375`, emit source: `EditorTitle.vue`'s `toggleThreadsCollapsed`, wired at `App.vue:1558`:
```typescript
function toggleThreadsCollapsed(): void {
  const collapseAll = anyThreadExpanded.value;
  const next = new Map(collapsedByCommentId.value);
  for (const comment of currentFileLiveComments.value) {
    next.set(comment.id, collapseAll);
  }
  collapsedByCommentId.value = next;
  // add: announce(collapseAll ? 'All threads collapsed.' : 'All threads expanded.');
}
```

**New call site 3 — filter/view-mode change**, `App.vue:539-542` (`toggleTreeViewMode`), emit source: `FileTree.vue`'s `update:view-mode`:
```typescript
function toggleTreeViewMode(mode: TreeViewMode): void {
  panelState.treeViewMode.value = mode;
  panelState.persist();
  // add: announce(mode === 'tree' ? 'Viewing as tree.' : 'Viewing as list.'); — exact copy per 25-UI-SPEC.md Pattern (b) §3
}
```

**New call site 4 — markdown source/rendered toggle**, wired inline at `App.vue:1550`:
```vue
@toggle-mode="(mode) => selectedContent !== undefined && setFileMode(selectedContent.fileId, mode)"
```
target function (`App.vue:554-558`):
```typescript
function setFileMode(fileId: string, mode: 'source' | 'rendered'): void {
  const next = new Map(fileModeByFileId.value);
  next.set(fileId, mode);
  fileModeByFileId.value = next;
  // add: announce(mode === 'source' ? 'Showing Markdown source.' : 'Showing rendered Markdown.');
}
```

**New call site 5 — panel tab switch:** **no existing wiring exists in this file.** `App.vue`'s `<template #panel>` block (`:1667-1703`) passes `BottomPanel` props/emits but has **no** `@update:activeTab` listener today — `BottomPanel.vue` in the current checkout still renders a single `role="region" aria-label="Review"` panel with no `role="tablist"` (grep confirmed no `tablist`/`activeTab` match in `BottomPanel.vue` as of this read). The tab UI is Phase 24's concurrent, locked contract (`24-UI-SPEC.md:81-99,124-128`, `status: approved`) — not yet landed in this checkout. **Action for planner:** re-verify `BottomPanel.vue`'s actual shipped markup and emit name at execution time (Phase 24 should have merged by then); wire a new `@update:activeTab="(tab) => announce(...)"` handler following the same inline-arrow-to-named-handler shape as call site 4 above, reusing Phase 24's own tab-label strings verbatim (`'Comments'`, `'Summary'`, `'Export'`) per `25-UI-SPEC.md:173-178`: `` `${tabLabel} tab selected.` ``.

---

### `tests/e2e/toolbar-roles.spec.ts` (new, test / e2e / request-response)

**Analog 1 — packaged-binary pack/spawn scaffold:** `tests/e2e/workbench-shell-smoke.spec.ts:1-43` (imports, `mkdtempSync` pack-root, `test.setTimeout(90_000)`) and `:125-150` (`stopGeneratedCli`, `assertShellRegionsPresent` helper shape):
```typescript
// Imports (workbench-shell-smoke.spec.ts:1-25)
import { execFileSync, spawn } from 'node:child_process';
...
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createGitFixture, type GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-shell-smoke-pack-`));
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);
test.setTimeout(90_000);
```
```typescript
// Region-presence helper shape (workbench-shell-smoke.spec.ts:143-150) — extend
// this pattern with getByRole assertions instead of CSS-class locators.
async function assertShellRegionsPresent(page: Page): Promise<void> {
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  await expect(page.locator('.workbench-shell')).toBeVisible();
  await expect(page.locator('.workbench-shell__titlebar .titlebar')).toBeVisible();
  await expect(page.locator('.workbench-shell__sidebar')).toBeVisible();
  await expect(page.locator('.workbench-shell__editor')).toBeVisible();
  await expect(page.locator('.workbench-shell__statusbar .statusbar')).toBeVisible();
}
```

**Analog 2 — session bootstrap helper (reuse, don't reimplement):** `tests/helpers/open-runtime-session.ts:11-39` — full file, already handles the support-dialog startup race; call `openRuntimeSession(page, url)` rather than hand-rolling `page.goto` + support-dialog dismissal:
```typescript
export async function openRuntimeSession(
  page: Page,
  url: string,
  options: Readonly<{ readonly dismissUnverified?: boolean }> = {},
): Promise<RuntimeSessionSupportObservation> {
  ...
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.diff-workspace__editor')).toBeVisible();
  ...
}
```

**Analog 3 — `getByRole` idiom for named toolbar buttons (not the region itself, the proof style):** `tests/e2e/workbench-shell-smoke.spec.ts:546-555`:
```typescript
const navigation = page.getByRole('navigation', { name: 'Changed files' });
const filterButton = navigation.getByRole('button', { name: /Filter changed files/ });
const viewOptionsButton = navigation.getByRole('button', { name: 'View options' });
```

**Five-region assertion skeleton** (already drafted and locked in `25-UI-SPEC.md:117-123`, reproduced verbatim — do not re-derive the five region names):
```typescript
await expect(page.getByRole('toolbar', { name: 'Title bar actions' })).toBeVisible();
await expect(page.getByRole('toolbar', { name: 'Changed files actions' })).toBeVisible();
await expect(page.getByRole('toolbar', { name: 'Diff navigation' })).toBeVisible();
await expect(page.getByRole('tablist', { name: 'Review panel' })).toBeVisible();
await expect(page.getByRole('toolbar', { name: 'Status bar actions' })).toBeVisible();
```
**Pitfall guard (25-RESEARCH.md Pitfall 3):** the fourth line queries `tablist`, not `toolbar`/`group` — Phase 24's shipped `BottomPanel.vue` contract (`24-UI-SPEC.md:86`, approved) is a real ARIA tabs widget with roving tabindex; forcing `toolbar`/`group` onto it would misrepresent the implemented keyboard model (inverse of the Phase 20 IN-05 defect). If this line fails to resolve, the fix is re-verifying Phase 24's actual shipped markup — not changing the panel's role to satisfy a literal "toolbar|group" reading of CONTEXT.md's prose.

**Individual-Tab-stop confirmation (companion assertion, optional strengthening):** `workbench-shell-smoke.spec.ts:557-569` proves each toolbar button is its own `Tab` stop (no roving tabindex inside `role="toolbar"` regions) — this is the intentional, already-shipped, already-tested convention; do not add `tabindex="-1"`/roving-focus logic to `TitleBar.vue`/`StatusBar.vue` to "complete" the widget (Phase 20 IN-05 anti-pattern, `25-RESEARCH.md` line ~162).

---

### Live-region exactly-once-per-outcome assertions (test, event-driven)

**Analog:** `tests/integration/anchored-workspace.spec.ts:1050-1079`, test `'repeated identical settlement messages create distinct live-region updates'` — the project's only existing `data-announcement-version` delta-assertion precedent:
```typescript
const liveRegion = page.locator('.session-shell > .visually-hidden[aria-live="polite"]');
...
await expect(liveRegion).toHaveText(announcement);
const firstVersion = await liveRegion.locator('span').getAttribute('data-announcement-version');
// ... trigger second occurrence of the same outcome ...
await expect.poll(async () =>
  liveRegion.locator('span').getAttribute('data-announcement-version')).not.toBe(firstVersion);
await expect(liveRegion).toHaveText(announcement);
```
Note: the locator root differs by test harness — `.session-shell > .visually-hidden[aria-live="polite"]` in integration specs vs. `App.vue:1762`'s `<p class="visually-hidden" aria-live="polite">` wrapper directly in e2e specs against the full shell; confirm the correct root selector for whichever spec file receives the new assertions.

**Strengthen to "exactly one" (not just "changed"), per `25-UI-SPEC.md`/`25-RESEARCH.md` recommendation** — capture the version immediately before triggering, assert the delta is precisely `+1`:
```typescript
const before = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
// ... trigger exactly one outcome (e.g. resolve thread) ...
await expect(liveRegion).toHaveText(expectedMessage);
const after = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
expect(after).toBe(before + 1); // not before (missing), not before+2 (duplicate)
```
Apply this shape once per outcome under audit: panel tab switch, thread resolve/reopen/delete/Undo, refresh result, export result, Finish result, drift transitions (both directions — audit per `25-CONTEXT.md:22` and `25-UI-SPEC.md`'s Out-of-scope note that the back-to-verified transition is a real gap pending runtime confirmation).

---

### Popover/menu Esc-closes + focus-returns-to-trigger assertions (test, event-driven)

**Analog 1** — `tests/e2e/file-tree.spec.ts:700-702` (View Options menu, the two-assertion shape to replicate for `IdentityPopover.vue`):
```typescript
await page.keyboard.press('Escape');
await expect(menu).toBeHidden();
await expect(viewOptionsButton).toBeFocused();
```

**Analog 2** — `tests/e2e/inline-comment-threads.spec.ts:393-401` (thread-header Esc-returns-to-editor, a slightly different "return target" shape — focus returns to the diff editor pane, not a trigger button — useful if any thread menu returns focus to something other than its own trigger):
```typescript
async function assertEscReturnsFocusToEditor(commentId: string, side: 'base' | 'head', line: number): Promise<void> {
  const thread = threadLocator(page, commentId);
  await thread.locator('.thread-header').focus();
  await expect(thread.locator('.thread-header')).toBeFocused();
  await page.keyboard.press('Escape');
  const editorPane = page.locator(side === 'base' ? '.monaco-diff-editor .editor.original' : '.monaco-diff-editor .editor.modified');
  await expect(editorPane.locator('.native-edit-context')).toBeFocused();
}
```

**Target component behavior already implemented (test-only phase, per `25-UI-SPEC.md:131-141` "no code change")** — `IdentityPopover.vue:226-246` `containFocus` (Esc + Tab-cycle containment) and `:248-258` `handlePointerDown` (outside-click dismiss); `ViewOptionsMenu.vue` `handleKeydown` (~lines 64-79, same shape). The e2e spec proves behavior that already exists; do not write new Vue logic for these two components.

**No shared helper to introduce** (`25-RESEARCH.md` line ~254): every existing Esc/focus-return check in this codebase is a local inline `toBeHidden()` + `toBeFocused()` pair; do not add a new shared Playwright a11y-testing module for 2-4 call sites.

---

### `tests/e2e/rendered-markdown-security.spec.ts` / `tests/e2e/anchored-review.spec.ts` (flake fix, test, event-driven)

**Analog:** the files' own existing structure — identical `test.setTimeout(90_000)` declarations and identical `pack-runtime.mjs` invocation shape in both:
```typescript
// rendered-markdown-security.spec.ts:32, anchored-review.spec.ts:33 (identical)
test.setTimeout(90_000);
```
```typescript
// rendered-markdown-security.spec.ts:149, anchored-review.spec.ts:207 (identical shape)
runPrerequisite(process.execPath, [join(repositoryRoot, 'scripts/pack-runtime.mjs'), '--purpose', 'development-check', '--custody-dir', custody, '--evidence', evidence]);
```
**Root cause (already identified, `25-RESEARCH.md` Pitfall 2):** cross-process mutex in `scripts/pack-runtime.mjs`:
```javascript
// pack-runtime.mjs:30 — lock path keyed by repo root hash
const runtimePackLock = join(os.tmpdir(), `${renameMap.slug}-pack-runtime-${sha256(root).slice(0, 16)}.lock`);
```
```javascript
// pack-runtime.mjs:143-165 — acquireRuntimePackLock: 300s deadline, 50ms poll, stale-owner takeover
function acquireRuntimePackLock() {
  const deadline = Date.now() + 300_000;
  for (;;) {
    try {
      mkdirSync(runtimePackLock, { mode: 0o700 });
      ...
      return;
    } catch (error) {
      if (!(error && typeof error === 'object' && error.code === 'EEXIST')) throw error;
      const owner = runtimePackLockOwner();
      if (!runtimePackLockOwnerIsAlive(owner) && recoverDeadRuntimePackLock(owner)) continue;
      if (Date.now() >= deadline) fail('timed out waiting for runtime pack lock');
      Atomics.wait(lockWait, 0, 0, 50);
    }
  }
}
```
**Two non-exclusive fix options (`25-RESEARCH.md`):** (1) raise `test.setTimeout(90_000)` → `test.setTimeout(180_000)` in both files at the lines above — cheap, directly targets the identified lock-wait mechanism; (2) if raising the timeout doesn't eliminate recurrence, record a `.planning/STATE.md` Deferred Items entry citing `scripts/pack-runtime.mjs:30,143-165` and `.planning/phases/22-identity-status-bar/22-REVIEW-FIX.md:64` as evidence. Planner must verify by checking whether failure recurs in a true single-process isolated re-run before concluding which branch applies.

---

### `tests/unit/token-contract.test.ts` (documentation-only, no code change)

**Analog:** the file's own existing, already-root-caused flaky test, `:130-155` `'reloads the virtual token module after styles.css changes in a Vite dev server'`. **No fix needed in this file** — this flake is independently reproduced and documented twice already (`20-VERIFICATION.md:239`, `24-SUMMARY.md:84`), and `23-VERIFICATION.md:85` confirms it does not recur under `--no-file-parallelism` (the exact gate command `25-CONTEXT.md` specifies). **Action:** `.planning/STATE.md` Deferred Items entry citing those two prior reproductions as evidence — satisfies CONTEXT.md's "fix or document evidence" branch without re-bisecting. Only re-investigate if the test times out specifically under `--no-file-parallelism` during this phase's own regression run (a new, different symptom).

---

## Shared Patterns

### `role="toolbar"` + `aria-label` on button-cluster wrapper divs
**Source:** `src/web/components/FileTree.vue:401`, `src/web/components/workbench/EditorTitle.vue:101`
**Apply to:** `TitleBar.vue:63` (`.titlebar__right`), `StatusBar.vue:64` (`.statusbar__right`)
```vue
<div class="{existing-class}" role="toolbar" aria-label="{Region} actions">
```
Two attributes added to the existing wrapper element only — never the `<header>`/`<footer>` landmark itself, never `tabindex`/`aria-activedescendant`/other widget-state attributes without matching keyboard behavior (Phase 20 IN-05 anti-pattern).

### Single live-region owner (`announce()`)
**Source:** `src/web/App.vue:493-496` (definition), `:1762-1764` (template sink)
**Apply to:** every new live-region call site in this phase (thread collapse, filter/view-mode, markdown toggle, panel tab switch, Undo-copy fix)
```typescript
function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}
```
Never introduce a second `aria-live` region in a child component — all new announcements wire a child emit into this existing `App.vue` function.

### House-style announcement copy
**Source:** `App.vue:384,423,773-782,911,995,1210` (extracted across 20+ call sites per `25-UI-SPEC.md:162`)
**Apply to:** all five new/fixed call sites
- Short declarative sentence, stated-fact present/past tense, period-terminated, no exclamation marks.
- Counts appended as `` `{n} open, {n} resolved.` `` only where the outcome changes thread counts (resolve/reopen/delete/Undo) — not on tab-switch/collapse/view-mode/markdown-mode announcements, which carry no count state.

### `data-announcement-version` delta assertion
**Source:** `tests/integration/anchored-workspace.spec.ts:1050-1079`
**Apply to:** all live-region exactly-once-per-outcome assertions this phase adds
```typescript
const before = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
// trigger exactly one outcome
const after = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
expect(after).toBe(before + 1);
```

### Esc-closes / focus-returns-to-trigger, inline two-assertion shape
**Source:** `tests/e2e/file-tree.spec.ts:700-702`
**Apply to:** all popover/menu keyboard-proof assertions (`IdentityPopover.vue`, `ViewOptionsMenu.vue`, thread menus)
```typescript
await page.keyboard.press('Escape');
await expect(target).toBeHidden();
await expect(trigger).toBeFocused();
```
No shared test helper — every existing instance in the codebase is a local inline pair; do not add one now.

### Packaged-binary test scaffold (pack → extract → spawn → `page.goto`)
**Source:** `tests/e2e/workbench-shell-smoke.spec.ts:1-43,125-150`
**Apply to:** `tests/e2e/toolbar-roles.spec.ts` (new DEBT-01 spec)
```typescript
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-shell-smoke-pack-`));
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);
test.setTimeout(90_000);
```
Reuse `tests/helpers/open-runtime-session.ts`'s `openRuntimeSession(page, url)` for the actual navigation + support-dialog-dismiss step rather than re-implementing it.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `DESIGN.md` | documentation (prose) | — | Static Markdown rewrite describing the shipped workbench (Direction, Composition, Geometry, Components, Responsive behavior, Motion sections); the pattern-mapper's code-analog model (imports/auth/CRUD/error-handling extraction) does not apply to prose. Current file read in full (50 lines): obsolete "review rail" language sits at `DESIGN.md:36` (Geometry), `:40` (Composition), `:36` (Components §"review rail groups summary..."). Full current text of the four sections needing rewrite, for direct in-place editing reference: `## Geometry` (lines 24-29), `## Components` (lines 31-36), `## Composition` (lines 38-40), `## Responsive behavior` (lines 46-50). The `## Color` section (lines 7-13, "Source: `src/web/styles.css :root`...") is explicitly locked unchanged per `25-CONTEXT.md:26`. `25-UI-SPEC.md` (lines ~220-259) already contains drafted before/after prose for Composition and Responsive behavior sections that the planner can copy near-verbatim; Geometry/Components sections still need equivalent before/after drafting against the lines cited above. |
| `.planning/ROADMAP.md` (DEBT-01 Backlog entry removal), `.planning/PROJECT.md` (accepted-debt notes removal) | documentation (prose) | — | Execution-time edits gated on the new e2e spec passing; explicitly out of UI-SPEC's write scope (`25-UI-SPEC.md:125`) and out of this PATTERNS.md's code-analog scope — plain deletion of specific lines (`ROADMAP.md:349`, `PROJECT.md:38,331` per UI-SPEC citations), not a pattern-copy task. |

## Metadata

**Analog search scope:** `src/web/components/workbench/`, `src/web/components/` (FileTree.vue), `src/web/App.vue`, `tests/e2e/`, `tests/integration/`, `tests/helpers/`, `tests/unit/token-contract.test.ts`, `scripts/pack-runtime.mjs`, `DESIGN.md`.
**Files scanned:** 16 source/test files read directly (TitleBar.vue, StatusBar.vue, EditorTitle.vue, FileTree.vue, BottomPanel.vue, IdentityPopover.vue, App.vue, file-tree.spec.ts, workbench-shell-smoke.spec.ts, responsive-session.spec.ts, inline-comment-threads.spec.ts, anchored-workspace.spec.ts, open-runtime-session.ts, token-contract.test.ts, rendered-markdown-security.spec.ts, anchored-review.spec.ts, pack-runtime.mjs, DESIGN.md).
**Pattern extraction date:** 2026-11-05
**Note on BottomPanel.vue:** confirmed via direct grep that this checkout's `BottomPanel.vue` does **not yet** contain `role="tablist"` or an `activeTab`/`update:activeTab` emit — Phase 24's locked contract (`24-UI-SPEC.md:81-99,124-128`) has not landed in this working tree as of pattern-mapping time (concurrent `ExecPhase24` execution in progress). Planner and executor must re-verify `BottomPanel.vue`'s actual shipped markup before wiring the panel-tab-switch announcement and before finalizing the `tablist` assertion in the DEBT-01 spec.
