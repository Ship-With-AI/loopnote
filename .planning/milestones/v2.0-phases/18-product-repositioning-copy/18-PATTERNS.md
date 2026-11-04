# Phase 18: Product Repositioning Copy - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 17 (+ ~12 e2e/integration spec files sharing one assertion-update pattern)
**Analogs found:** 17 / 17

This phase is copy-only: no new components, no new runtime architecture. "Patterns" here are
(a) the closest prior-phase artifact for each *new* planning/doc file, and (b) the literal
current string + surrounding code for every edited symbol, so the planner can diff old→new
without re-reading source.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `README.md` | docs (static prose) | file-I/O (static Markdown) | itself (prior sections, for voice/format continuity) | exact |
| `PRODUCT.md` | docs (claims source of truth) | file-I/O | itself; consumed by new claims-check test | exact |
| `package.json` | config (manifest) | file-I/O (static JSON) | itself (`description`); no existing `keywords` field | exact |
| `docs/usage.md` (new) | docs (user-facing reference) | file-I/O | `README.md` (voice/structure); `docs/distribution-operations.md` (directory placement only, NOT voice — it's maintainer-internal) | partial (voice from README, location from distribution-operations.md) |
| `.planning/phases/18-.../18-COPY-DRAFT.md` (new) | docs (planning artifact, blocking checkpoint) | file-I/O | no prior `*-COPY-DRAFT.md` exists in `.planning/phases/*`; D-05 in `18-CONTEXT.md` fully specifies required content/sections | no analog — follow D-05 spec directly |
| `src/cli/run.ts` (Commander `.description()`/`.option()`) | controller (CLI entry) | request-response (terminal) | itself; Commander chain is the established pattern, only string literals change | exact |
| `src/cli/picker.ts` (`BASE_PROMPT`/`HEAD_PROMPT`/`UNCOMMITTED_BASE_PROMPT`) | utility (module-level string constants) | request-response (terminal prompts) | `src/domain/source.ts` (sibling string-constant module, same export shape) | exact |
| `src/domain/source.ts` (`DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION`) | model/domain (constants, imported by CLI + consumed conceptually by web) | file-I/O (static export) | itself; `PENDING_ROW_LABEL`/`UNAVAILABLE_WORKTREE_REASON` in same file show the established "label + longer explanation string" shape | exact |
| `src/web/index.html` (`<title>`) | config (static HTML head) | request-response (initial load) | itself — static tag is **replaced** by a runtime `document.title` assignment per UI-SPEC D-09; no prior `document.title` call exists anywhere in `src` | no prior code pattern — new wiring, see Shared Patterns |
| `src/web/App.vue` (empty-state `computed`s, loading `<h1>`, skip-link, new tab-title `watchEffect`) | component (Vue 3 `<script setup>`, computed + template) | event-driven (reactive computed over session state) | itself; `emptyFilesCopy` computed is the established "branch on session kind → return `{heading, message}`" shape all empty-state edits reuse | exact |
| `src/web/components/FileTree.vue` (`aria-label`s, eyebrow `<span>` deletion, filter-empty copy) | component | event-driven (template string literals) | itself; also `App.vue:1225` skip-link for sibling "Changed files" phrasing | exact |
| `src/web/components/IdentityHeader.vue` (`sourceLabel`/`standaloneLabel` computeds, dirty-badge SR text) | component | event-driven (computed over `props.session`) | itself; `sourceLabel`/`standaloneLabel` computeds are the established pattern for session-kind→label branching, directly reusable for the D-09 tab-title segments | exact |
| `src/web/components/ChangedFilesDialog.vue` (`title`/`close-aria-label` props) | component | request-response (modal props) | itself; trivial prop-literal edit | exact |
| `src/web/components/ActiveFileToolbar.vue` (`filesToggleLabel` computed) | component | event-driven (computed) | itself; `filesToggleCopy` (same file, already-compliant sibling computed) is the exact shape to imitate for `filesToggleLabel` | exact |
| `tests/e2e/*.spec.ts` assertions (anchored-review, file-tree, pinned-session, responsive-session) | test (Playwright e2e) | request-response (locator assertions) | each spec's own existing `getByRole(..., { name: 'Changed files', exact: true })` style calls — literal string swap only, same locator shape | exact |
| `tests/integration/*.spec.ts` assertions (anchored-workspace, draft-recovery-ui, support-dialog) | test (Playwright integration) | request-response (locator assertions) | same pattern as e2e specs above | exact |
| New claims-check test (D-06) | test (Vitest, file-I/O content assertion) | file-I/O | `tests/unit/monaco-theme.test.ts` (`'rejects color literals outside the unpainted sentinel'`) — `readFileSync` + `resolve(import.meta.dirname, ...)` + regex/string assertion against banned literals; `tests/package/runtime-package-contract.test.ts` (`readManifest()` reading `package.json` as JSON) for the `package.json`/`description` half | exact |

## Pattern Assignments

### `README.md` (docs, file-I/O)

**Analog:** itself — no structural change, only prose per-section per the inventory in `18-RESEARCH.md` §User-Facing String Inventory.

**Current tagline + name/install framing** (lines 1-15):
```markdown
# Cumpà

Cumpà gives committed local Git comparisons a pull-request-style review workspace without publishing the branch or worktree. Choose from local branches or registered worktrees, leave durable feedback, and export for agent or teammate use.

Published as **`@shipwithai/cumpa`**; command is **`cumpa`**.

Stable `1.5.0` is published on npm. ...

## The name

`cumpà` is how Naples says *friend*, *mate*, *comrade*...
```
Every heading in the inventory (`## Keyboard shortcuts` row at "changed-file tree", `## Review changes from a coding agent` intro, `## v1 file limits`, `## Voluntary support`) keeps its current Markdown heading level and position; only the prose inside changes. Treat each inventory row as an independent in-place paragraph/sentence replacement, not a restructure.

---

### `PRODUCT.md` (docs, claims source of truth for D-06)

**Analog:** itself; full current content is the baseline the claims-check test reads.

**Current `## Supplied capabilities` / `## Deliberate non-capabilities`** (lines 13-26):
```markdown
## Supplied capabilities

- An interactive CLI selects an ordered base and head from local branches and registered worktrees.
- Installed Git is the authority for repository discovery, refs, merge bases, worktrees, renames, changed-file metadata, and blobs.
- A Fastify server binds to loopback only and opens a browser workspace.
- The Vue interface uses Monaco for side-by-side text diffs, syntax highlighting, line mapping, and inline review controls.
- Reviewers can leave line comments and an overall summary.
- Versioned JSON drafts live in the repository-local, gitignored `.cumpa/` directory.
- Exports provide Markdown and canonical JSON for a coding agent.
- Version 1 reviews text files; binary, generated, oversized, and unsupported files remain visible but non-reviewable.

## Deliberate non-capabilities

No claim is made for remote hosting, cloud synchronization, multi-user collaboration, approvals, suggestions, replies, viewed state, authentication, pricing, customers, usage metrics, certifications, or binary review.
```
D-06 requires this bullet list updated to v2.0 (adds uncommitted/standalone review, Markdown toggle/rendering, agent-request protocol — currently absent) **before** the claims-check test is written, since the test's banned-phrase list is sourced from the `## Deliberate non-capabilities` paragraph verbatim.

---

### `package.json` (config, file-I/O)

**Analog:** itself.

**Current state** (lines 1-5, no `keywords` key exists anywhere in the file):
```json
{
  "name": "@shipwithai/cumpa",
  "version": "1.6.1",
  "description": "Local-first review of pinned Git comparisons",
  "license": "MIT",
```
Apply: edit `description` in place (D-02, Claude's discretion among 2-3 drafted variants); insert a new `"keywords": [...]` array key (D-03) immediately after `description` — this is a pure addition, no existing `keywords` array to merge into.

---

### `docs/usage.md` (new file, docs)

**Analog:** `README.md` for voice (D-04 product-neutral, factual) and for which flags/examples already exist to extract into a fuller reference; `docs/distribution-operations.md` only for "a file at `docs/<name>.md` with a single `# <Title>` H1 and `##`-level sections" directory convention — **do not** copy its internal maintainer-ops imperative tone.

**Not an edit target — explicitly confirmed empty today:**
```
$ find docs -name '*.md'
docs/distribution-operations.md
docs/support-service-operations.md
```
Neither existing `docs/*.md` file is user-facing product documentation; `docs/usage.md` is a brand-new file per D-11, structure at Claude's discretion (flags reference, edge cases, Refresh, snapshot semantics, exports — content currently embedded in README's longer sections that D-11 moves out).

---

### `src/cli/run.ts` (controller, request-response)

**Analog:** itself — Commander `.description()`/`.option()` chain already established; only string arguments change.

**Current state** (lines 1454-1462):
```typescript
await new Command()
  .name('cumpa')
  .description('Local-first review of pinned Git comparisons')
  .version(await readPackageVersionFromManifest())
  .option('--staged', 'Review staged changes (HEAD→index) against a base')
  .option('--unstaged', 'Review unstaged changes (index→working tree)')
  .option('--worktree', 'Review all working-tree changes (HEAD→working tree), including untracked files')
  .option('--base <ref>', 'Base ref or registered worktree to compare against (default: HEAD); rejected with --unstaged')
  .argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')
```
RESEARCH.md flags `--staged`'s description as "confirm wording already accurate; likely no change needed, verify in draft" — treat as a possible no-op row in `18-COPY-DRAFT.md`, not a guaranteed edit.

---

### `src/cli/picker.ts` (utility, request-response)

**Analog:** `src/domain/source.ts`'s module-level `export const X = '...'` shape (sibling convention in the same CLI layer).

**Current state** (lines 14-31):
```typescript
const BASE_PROMPT =
  'Choose base — changes will be cumpad from its merge base with head';
const HEAD_PROMPT =
  'Choose head — this committed state will be reviewed';
const BACK_TO_BASE = 'cumpa:back-to-base';
...
const UNCOMMITTED_BASE_PROMPT =
  'Choose base — changes will be compared from its merge base with HEAD';
```
`BASE_PROMPT`'s "cumpad" is a verbed form of the old product name — RESEARCH.md flags this needs either a new-name verb form (depends on Phase 17.1's chosen name) or a reworded sentence that avoids verbing the name entirely; confirm in `18-COPY-DRAFT.md`, don't invent the verb form here. `BACK_TO_BASE` and the `UNCOMMITTED_ROW_IDS` map (lines 20-29) are internal sentinel/ID strings, not user-visible copy — leave unchanged.

---

### `src/domain/source.ts` (model, file-I/O)

**Analog:** itself — `PENDING_ROW_LABEL`/`UNAVAILABLE_WORKTREE_REASON` (same file) show the "short label + longer explanatory sentence" pair shape to preserve.

**Current state, full file content of the two target exports** (lines 1-6):
```typescript
export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';
export const DIRTY_EXPLANATION =
  "The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored.";
export const PENDING_ROW_LABEL = 'Checking worktree state…';
export const UNAVAILABLE_WORKTREE_REASON =
  'Unavailable — this registered worktree cannot be resolved. Choose another entry or repair it with Git.';
```
**Consumers** (must still compile/read correctly after the wording change, no signature change):
```typescript
// src/cli/confirm.ts:4-8, 70-71
import {
  DIRTY_EXPLANATION,
  DIRTY_ROW_LABEL,
} from '../domain/source.js';
...
  output(`${DIRTY_ROW_LABEL}\n${DIRTY_EXPLANATION}`);

// src/cli/picker.ts:3-11, 147-148
import {
  DIRTY_ROW_LABEL,
  PENDING_ROW_LABEL,
  UNAVAILABLE_WORKTREE_REASON,
  ...
} from '../domain/source.js';
...
  if (candidate.availability === 'dirty') {
    return DIRTY_ROW_LABEL;
  }
```
UI-SPEC's locked replacement text: `DIRTY_EXPLANATION` → `"This worktree has uncommitted changes. This comparison reviews the committed HEAD only — use --worktree, --staged, or --unstaged to review uncommitted changes directly."` (18-UI-SPEC.md §Dirty-source copy). `DIRTY_ROW_LABEL` is **unchanged** per UI-SPEC (no row in its replacement table).

---

### `src/web/index.html` (config → replaced by runtime wiring)

**Current state** (full file, lines 1-13):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Cumpa</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```
No prior pattern exists for a dynamic `document.title` in this codebase — `grep -r "document.title" src` returns zero hits. This is new wiring (not a copy-pattern match); see **Shared Patterns → Browser tab title**.

---

### `src/web/App.vue` (component, event-driven)

**Analog:** itself — `emptyFilesCopy` computed is the canonical "branch on session-kind discriminant → return `{heading, message}`" shape; reuse this exact branching style for any new copy, don't introduce a different dispatch mechanism.

**Empty-state computed, current full state** (lines 196-223):
```typescript
const emptyFilesCopy = computed(() => {
  if (isExactPatchSession.value) {
    return {
      heading: 'No files in this exact patch',
      message: 'This accepted patch contains no changed file entries. Relaunch with a non-empty already-applied patch.',
    };
  }
  if (isRangeSession.value) {
    return {
      heading: 'No changes match this review scope',
      message: rangeHasPathspecs.value
        ? 'The pinned commits contain no changed files selected by this scope.'
        : 'The pinned commits contain no changed files.',
    };
  }
  if (isUncommittedSession.value) {
    const message = uncommittedSession.value?.sourceKind === 'staged'
      ? 'There is nothing staged. Refresh after staging changes, or relaunch with a different source.'
      : uncommittedSession.value?.sourceKind === 'unstaged'
        ? 'The working tree matches the index. Refresh after editing files, or relaunch with a different source.'
        : `The working tree matches ${uncommittedBaseLabel}. Refresh after editing files, or relaunch with a different source.`;
    return { heading: 'No changes', message };
  }
  return {
    heading: 'No PR-style changes in this pinned comparison',
    message: 'The selected head has no changes from the displayed merge base.',
  };
});
```
UI-SPEC's locked replacements (D-10 fact + imperative-next-action, D-07 "comparison" only where Base/Head exist):
- Range-with-scope branch → heading `No changes match review scope.`, message `Relaunch different scope or range.`
- Range-no-scope branch → heading `No changes match this review scope.`, message `Relaunch different range.`
- Uncommitted worktree branch → `No changes in Working tree. Edit files, then Refresh.` (D-10's own literal example, reuse verbatim) — staged/unstaged branches need analogous fact+next-action treatment (not yet worked out in UI-SPEC's single example; planner derives from the same template).
- Default/else (pinned comparison) branch → heading `No changes in comparison.`, message `Relaunch different Base/Head endpoints.` (drops "PR-style" jargon).
- Exact-patch branch → **unchanged**, already compliant per UI-SPEC.

**Loading heading + skip-links, current state** (lines 1206-1226):
```vue
<main v-if="primarySurface === 'loading' && errorMessage === ''" class="loading-shell">
  <section class="state-card" aria-labelledby="loading-heading">
    <h1 id="loading-heading">{{ isExactPatchSession ? 'Cumpa: loading exact patch' : 'Cumpa: loading pinned comparison' }}</h1>
    <p role="status">{{ isExactPatchSession ? 'Opening frozen patch review…' : 'Opening local draft…' }}</p>
  </section>
</main>
...
<a v-if="!isNarrow && !filesCollapsed" class="skip-link" href="#changed-files-heading">Skip to changed files</a>
<a class="skip-link" href="#cumpa-heading">Skip to diff</a>
```
The literal word `"Cumpa"` here is independent of `index.html:7`'s `<title>` — both must change to the resolved `<Name>` per Phase 17.1's product-identity module, but this file's rewrite belongs to Phase 18 (18-RESEARCH.md Pitfall 2), not 17.1. Skip-link text `"Skip to changed files"` → `"Skip to files"` per D-08 (sidebar noun is always "Files").

---

### `src/web/components/FileTree.vue` (component, event-driven)

**Analog:** itself.

**Current state** (lines 155-193, 225-226 not yet re-read but cited in RESEARCH.md as the filter-empty block):
```vue
<nav class="file-tree-pane" aria-label="Changed files">
  <div class="file-tree-pane__top">
    <h2 id="changed-files-heading" tabindex="-1">
      <span aria-hidden="true">Files</span>
      <span class="visually-hidden">Changed files ({{ files.length }})</span>
      <span class="file-tree-pane__count" aria-hidden="true">{{ files.length }}</span>
      <span class="file-tree-pane__eyebrow" aria-hidden="true">Changed</span>
    </h2>
    ...
  </div>
  <div class="file-tree-pane__scroller">
    <ul
      ref="treeElement"
      class="file-tree"
      role="tree"
      aria-label="Changed files"
      aria-labelledby="changed-files-heading"
      @keydown="handleKeydown"
```
Per UI-SPEC: `<nav aria-label="Changed files">` → `aria-label="Files"`; `<ul role="tree" aria-label="Changed files">` → `aria-label="Files"`; the `<span class="visually-hidden">Changed files ({{ files.length }})</span>` SR text updates its leading word to "Files"; the decorative `<span class="file-tree-pane__eyebrow" aria-hidden="true">Changed</span>` is **deleted outright** (UI-SPEC §Design System: "deleting one decorative `<span>`" — zero new DOM, pure removal, no replacement text). Filter-empty state (lines 225-226, per RESEARCH.md): `<h3 id="tree-empty-heading">No matching files</h3><p>Clear filter to show all changed files.</p>` → heading unchanged (already compliant), paragraph "changed files" → "files" only.

---

### `src/web/components/IdentityHeader.vue` (component, event-driven)

**Analog:** itself — `sourceLabel`/`standaloneLabel` computeds (lines 39-51) are the reusable session-kind→label dispatch the planner should feed into the new D-09 tab-title logic rather than inventing a parallel switch.

**Session-kind label computeds, current state** (lines 39-55):
```typescript
const sourceLabel = computed(() => {
  switch (uncommittedSession.value?.sourceKind) {
    case 'staged': return 'Staged';
    case 'unstaged': return 'Unstaged';
    case 'worktree': return 'Working tree';
    default: return '';
  }
});
...
const standaloneLabel = computed(() =>
  controlSafeDisplay(`Standalone review · ${standaloneSession.value?.changedFileCount ?? 0} files`),
);
```
**Dirty badge, current state** (lines 152-162):
```vue
<span class="pin-cue">{{ isExactPatch ? 'Frozen patch' : (isUncommitted || isStandalone) ? 'Frozen snapshot' : 'Pinned comparison' }}</span>
<span
  v-for="endpoint in dirtyEndpoints"
  :key="endpoint.role"
  class="dirty-badge"
>
  <span>Dirty bytes ignored</span>
  <span class="visually-hidden">
    Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.
  </span>
</span>
```
Per UI-SPEC: visible `<span>Dirty bytes ignored</span>` is **unchanged** (already compliant). The `visually-hidden` sentence → `Committed HEAD reviewed; uncommitted changes aren't included.` This is the second, independently-hardcoded copy of the dirty-explanation sentence (distinct literal from `src/domain/source.ts`'s `DIRTY_EXPLANATION`, per RESEARCH.md Pitfall 1) — edit both in the same commit; UI-SPEC leaves the question of extracting a shared import as planner's discretion, not locked.

---

### `src/web/components/ChangedFilesDialog.vue` (component, request-response)

**Analog:** itself.

**Current state** (lines 24-33):
```vue
<ModalDialog
  :open="open"
  :keep-mounted="true"
  :restore-focus="restoreFocus"
  initial-focus-selector="#file-tree-filter"
  title="Changed files"
  close-label="Close"
  close-aria-label="Close changed files"
  @close="emit('close')"
>
```
`title="Changed files"` → `title="Files"`; `close-aria-label="Close changed files"` → `close-aria-label="Close files"`. `close-label="Close"` is unrelated and stays.

---

### `src/web/components/ActiveFileToolbar.vue` (component, event-driven)

**Analog:** itself — `filesToggleCopy` (same file, lines 71) is already-compliant and is the exact pattern `filesToggleLabel` must imitate (same ternary-chain shape, only the `aria-label`-destined strings differ).

**Current state** (lines 70-74):
```typescript
const filesHostVisible = computed(() => !props.filesDrawer && !props.filesCollapsed);
const filesToggleCopy = computed(() => props.filesDrawer ? 'Files' : props.filesCollapsed ? 'Show files' : 'Hide files');
const filesToggleLabel = computed(() => props.filesDrawer
  ? 'Open changed files'
  : props.filesCollapsed ? 'Show changed files sidebar' : 'Hide changed files sidebar');
```
`filesToggleCopy` (the three *visible* button labels) is unchanged — already compliant per UI-SPEC. Only `filesToggleLabel` (the paired `aria-label` strings) changes: `'Open changed files'` → `'Open files'`; `'Show changed files sidebar'` → `'Show files sidebar'`; `'Hide changed files sidebar'` → `'Hide files sidebar'`.

---

### `tests/e2e/*.spec.ts` and `tests/integration/*.spec.ts` assertions

**Analog:** each spec's own existing Playwright locator calls — literal string argument swap only, same `getByRole`/`getByText` call shape, same `{ exact: true }` usage where already present. No new locator strategy needed.

**Representative current-state excerpts** (from `18-RESEARCH.md` §Existing E2E String Assertions, grep-verified):
```typescript
// tests/e2e/anchored-review.spec.ts:351,353-354
page.getByRole('button', { name: 'Open changed files', exact: true })
page.getByRole('dialog', { name: 'Changed files', exact: true })
page.getByRole('button', { name: 'Close changed files' })

// tests/e2e/file-tree.spec.ts:389-391
page.getByRole('navigation', { name: 'Changed files' })
page.getByRole('tree', { name: 'Changed files' })
page.getByRole('heading', { name: /^Changed files \(\d+\)$/ })

// tests/e2e/file-tree.spec.ts:594-597
page.getByRole('heading', { name: 'No matching files' })
navigation.getByText('Clear filter to show all changed files.', { exact: true })

// tests/e2e/responsive-session.spec.ts:1148,1164
page.getByRole('button', { name: 'Hide changed files sidebar', exact: true })
page.getByRole('button', { name: 'Show changed files sidebar', exact: true })

// tests/integration/draft-recovery-ui.spec.ts:295
page.getByRole('heading', { name: 'No PR-style changes in pinned comparison' })

// tests/integration/support-dialog.spec.ts:102,114,126,134
page.getByText('No PR-style changes in pinned comparison')  // (×4 call sites)
```
Full enumerated list (≈30 call sites across `anchored-review.spec.ts`, `file-tree.spec.ts`, `pinned-session.spec.ts`, `responsive-session.spec.ts`, `anchored-workspace.spec.ts`, `draft-recovery-ui.spec.ts`, `support-dialog.spec.ts`) is in `18-RESEARCH.md` §Existing E2E String Assertions — the apply plan must update every row in the same wave as its source-string edit (RESEARCH.md Pitfall 3: Playwright locators resolve to zero elements on any mismatch, failing CI immediately, not silently).

---

### New claims-check test (D-06)

**Analog 1 (banned-literal-in-source-file pattern):** `tests/unit/monaco-theme.test.ts:142-151`
```typescript
it('rejects color literals outside the unpainted sentinel', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../src/web/monaco/theme.ts'),
    'utf8',
  );
  const colorLiterals = [...source.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\(/giu)]
    .map((match) => match[0]);

  expect(colorLiterals).toEqual(['#00000000']);
});
```
**Analog 2 (reading `package.json` as structured data):** `tests/package/runtime-package-contract.test.ts:1-24`
```typescript
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const packageManifestPath = join(projectRoot, 'package.json');

async function readManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(packageManifestPath, 'utf8')) as Record<string, unknown>;
}
```
**Apply:** combine both shapes — a new Vitest file (`tests/unit/` is the right tier: pure file-content assertion, no fixture repo, no server, matching `monaco-theme.test.ts`'s style exactly) that:
1. Reads `PRODUCT.md`'s `## Deliberate non-capabilities` paragraph (via `readFileSync` + `resolve(import.meta.dirname, '../../PRODUCT.md')`) and extracts/derives its banned-phrase list as the single source of truth (D-06: "reading `PRODUCT.md`'s 'Deliberate non-capabilities' list as its source list", not a hardcoded duplicate list in the test).
2. Reads `README.md` and `package.json`'s `description` (+ `keywords` once added) the same way.
3. Asserts none of the banned phrases (`remote hosting`, `cloud synchronization`, `multi-user collaboration`, `approvals`, `suggestions`, `replies`, `viewed state`, `authentication`, `pricing`, `customers`, `usage metrics`, `certifications`, `binary review`, per current `PRODUCT.md:26`) appear in README/npm copy.
4. Must run after `PRODUCT.md`'s capability list is updated to v2.0 (same phase, D-06) so the derived banned-list is accurate against shipped v2.0 capabilities, not the stale pre-13 baseline.

## Shared Patterns

### Dirty/uncommitted explanatory text — two independent call sites, same wording target
**Sources:** `src/domain/source.ts:2-3` (`DIRTY_EXPLANATION`) and `src/web/components/IdentityHeader.vue:159-161` (inline SR-only template text)
**Apply to:** both files, same commit/wave — they are textually different today (confirmed, not hypothetical) and have no shared import; UI-SPEC gives each its own target string rather than unifying them, so edit each literal independently unless the planner explicitly chooses to introduce a shared import (left as discretion, not locked by CONTEXT.md).

### "Changed files" → "Files" noun swap (D-08)
**Source pattern:** `ActiveFileToolbar.vue`'s already-compliant `filesToggleCopy` computed (visible labels already say "Files"/"Show files"/"Hide files") is the target shape every other "Changed files"-bearing string should converge to.
**Apply to:** `FileTree.vue` (`aria-label`s, heading SR text, filter-empty paragraph), `ChangedFilesDialog.vue` (`title`, `close-aria-label`), `ActiveFileToolbar.vue` (`filesToggleLabel`'s paired `aria-label`s), `App.vue` (skip-link text), plus every matching e2e/integration locator string listed above.

### Empty-state dispatch shape (D-10)
**Source:** `src/web/App.vue`'s `emptyFilesCopy` computed (lines 196-223) — branch on session-kind discriminant, return `{heading, message}` object consumed by the template.
**Apply to:** every empty-state row in `18-UI-SPEC.md`'s Copywriting Contract table; reuse the exact same computed/branching shape, do not introduce parallel dispatch logic (e.g. a second switch statement or a template-level `v-if` chain duplicating the discriminants already computed here).

### Browser tab title (D-09) — genuinely new wiring, no prior pattern
**Sources to compose from:** `IdentityHeader.vue`'s `sourceLabel`/`standaloneLabel` computeds (session-kind → label string, lines 39-51) feed the `<session kind>` segment; `src/web/index.html:7`'s static `<title>Cumpa</title>` is removed in favor of a new `watchEffect` (or equivalent reactive computed) in `App.vue` assigning `document.title`, per UI-SPEC's own note that no `document.title` call exists anywhere in `src` today (verified: zero grep hits). The `<repo>` segment has no existing data source (`UI-SPEC.md` Open Question 1: no `repoName` field in `src/contracts/api.ts`) — this is new, minimal-surface work (likely a server-resolved repo-root basename threaded through the session response), not a copy-pattern match.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md` | docs (planning artifact) | file-I/O | No prior `*-COPY-DRAFT.md` exists in any phase directory; `18-CONTEXT.md` D-05 fully specifies its required sections (every user-facing string, blocking human checkpoint) — follow that spec directly rather than an analog. |
| `src/web/index.html` → `App.vue` tab-title wiring (D-09) | component (new reactive wiring) | event-driven | Zero prior `document.title` usage anywhere in `src`; this is new code, not a rewording. Compose from the session-kind-label pattern already present in `IdentityHeader.vue` (see Shared Patterns) rather than a single analog file. |

## Metadata

**Analog search scope:** `src/cli/`, `src/domain/`, `src/web/App.vue`, `src/web/components/`, `src/web/index.html`, `tests/unit/`, `tests/package/`, `tests/e2e/`, `tests/integration/`, `docs/`, `.planning/phases/17.1-full-project-rename/` (prior mechanical-rename phase, consulted for PATTERNS.md structural precedent only).
**Files scanned:** README.md, PRODUCT.md, package.json, docs/distribution-operations.md, src/cli/run.ts, src/cli/picker.ts, src/domain/source.ts, src/web/index.html, src/web/App.vue, src/web/components/{FileTree,IdentityHeader,ChangedFilesDialog,ActiveFileToolbar}.vue, tests/unit/{monaco-theme,availability}.test.ts, tests/package/runtime-package-contract.test.ts, 17.1-PATTERNS.md.
**Pattern extraction date:** 2026-10-31
