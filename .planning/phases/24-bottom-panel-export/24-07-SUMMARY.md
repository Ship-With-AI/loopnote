---
phase: 24
plan: 07
type: auto
status: complete
---

# 24-07 Summary: Build CommentsTab.vue

## Commits

| Commit | Description |
|---|---|
| `25091e4` | `feat(24-07): build CommentsTab grouped list component` — adds `src/web/components/workbench/CommentsTab.vue` |
| (this file) | `docs(24-07): add plan summary` |

## What shipped

`src/web/components/workbench/CommentsTab.vue` — the grouped, click-to-reveal Comments-tab list described by PANEL-01. Props `comments: readonly WorkspaceComment[]; flatFileRows: readonly VisibleFileTreeLeaf[];`, emit `reveal: [commentId: string, fileId: string, side: WorkspaceComment['side'], line: number]`. Consumes `projectCommentsTabFileGroups()` (24-02) for live-file groups and `projectOrphanedCommentGroup()` (Phase 23, confirmed shipped — see Reconciliation below) for trailing orphaned groups. Local, session-only `collapsedByFileId` disclosure state (never lifted to `BottomPanel.vue`/`App.vue`), matching `SummarySection.vue:25`/`ExportSection.vue:44`'s own local `open` ref precedent. Not yet mounted anywhere — `BottomPanel.vue` still has its pre-24-08 shape (confirmed: it has no `activeTab`/tablist, no `CommentsTab` import).

## Reconciliation against the plan's flagged cross-phase dependency

The plan's `<objective>` flagged that `orphaned-comments.ts` and `ReviewStateBadge.vue`'s `size="compact"` prop were, at plan-writing time, Phase 23 interfaces described only in `23-03-PLAN.md`'s prose, not yet on disk. By execution time both had shipped exactly as described (confirmed by direct inspection, not re-derived from prose):

- `src/web/model/orphaned-comments.ts` exports `projectOrphanedCommentGroup(comments: readonly WorkspaceComment[]): readonly OrphanedCommentGroup[]` where `OrphanedCommentGroup = Readonly<{ path: RecordedAnchorDetails['path']; comments: readonly WorkspaceComment[] }>` — matches the plan's assumption exactly; called directly, unmodified, unwrapped.
- `src/web/components/ui/ReviewStateBadge.vue` has `kind: ReviewStateKind` (includes `'unavailable'`) and `size?: 'default' | 'compact'` (default `'default'`) — matches exactly; used as `<ReviewStateBadge kind="unavailable" label="Anchor missing" size="compact" />`.

No stubbing, no placeholder, no deviation from the plan's described shapes was required.

## Deviations

1. **File-group disclosure header given `tabindex="0"` and `@keydown.enter`** (not explicitly specified in the `<action>` text, which stated only `role="button"`/`:aria-expanded` for the header while explicitly stating `tabindex="0"`/`@keydown.enter` for rows). A `role="button"` element with no `tabindex` is not keyboard-focusable/operable, which would be an accessibility defect; added the same keyboard-activation treatment the plan already mandates for rows, for parity and baseline ARIA-button correctness. Auto-fixed (Rule 1 — minor, unambiguous, strictly additive correctness fix within the named file).
2. **New BEM classes (`comments-tab__*`) added via a component-local `<style scoped>` block**, not a separate stylesheet change. `files_modified` names only `CommentsTab.vue`; the project has an established, repeated precedent (`BottomPanel.vue`, `StatusBar.vue`, `TitleBar.vue`, `WorkbenchShell.vue`, `EditorTitle.vue`, `Breadcrumbs.vue`, `ChangedFilesDialog.vue` — 7 of 43 Vue components) for new component-specific classes to live in a scoped `<style>` block inside the component file rather than in the shared `src/web/styles.css`. Followed that precedent; every token referenced (`--text-primary`, `--text-muted`, `--font-size-chrome`, `--line-height-chrome`, `--font-size-metadata`, `--line-height-metadata`, `--font-weight-semibold`, `--font-mono`, `--status-warning-foreground`, `--space-1..4`) is an existing canonical token — no new custom property introduced, no raw color literal. Not a `files_modified` violation (styles live inside the one named file). Auto-fixed (Rule 2 — established, repeated in-repo convention).

No other deviations. No Phase 23 shape mismatch to reconcile (see above — both interfaces matched exactly).

## Verification

- `npm run typecheck:web` — **0 errors** (`vue-tsc --noEmit --project tsconfig.web.json` exit 0).
- `npm run verify:semantic-css` — **passed**: `Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.` (ran the full `build:web` first, per the script's own definition).
- `npx vitest run --no-file-parallelism tests/unit` — **478 passed (478)**, 46 test files, 0 failed, 0 regressions.
- **Playwright/Chromium live-session check: explicitly deferred**, per the plan's own `<verification>` block — `CommentsTab.vue` is not yet mounted anywhere (`BottomPanel.vue` confirmed still pre-24-08 shape, no tablist/`activeTab`/`CommentsTab` import). Deferred to Plan 24-08 (mounts the component into the new tab shell), 24-09 (wires `App.vue`'s `revealCommentFromPanel`), and 24-10. No live-session run was fabricated.

## Self-Check — re-verifying each `must_haves.truths` entry against the shipped code

1. **Empty state is verbatim and exclusive.** `CommentsTab.vue:63-65`: `<p v-if="comments.length === 0" class="comments-tab__empty">No comments yet. Hover a line number in the diff and click +.</p>` — exact copy match to the locked design-source string; the `v-else` on the sibling `<ul class="comments-tab__groups">` (line 67) means no grouped-list markup renders alongside it. **PASS.**

2. **Grouped list, tree order, bucket order, disclosure, format.** `CommentsTab.vue:23`: `fileGroups = computed(() => projectCommentsTabFileGroups(props.comments, props.flatFileRows))` — groups and their internal row order come entirely from the already-shipped, already-ordered `comments-tab-groups.ts` projection (file-outer in `flatFileRows`/tree order, open→stale→resolved, line-ascending within bucket); the component does zero re-sorting (no `.sort()` call anywhere in `CommentsTab.vue`). Header row (lines 69-80): twistie `{{ isCollapsed(...) ? '▸' : '▾' }}` (`aria-hidden="true"`, mirrors `DirectoryRow.vue:85-87`), file-type mark via `groupMark()` → `fileTypeMarkFor()` rendered with the identical `:style="{ color: \`var(${...tone})\` }"` shape as `FileRow.vue:109`/142, `<PathText :display="groupPath(group.leaf) ?? ''" />` for name+directory, bare `{{ group.rows.length }}` count. Disclosure state: `collapsedByFileId = ref(new Map<string, boolean>())` (line 30), default-expanded (`isCollapsed` returns `false` until explicitly set, line 33-35), never read from or written to any prop/App-level store — local to this file only. Row markup (lines 83-95): `role="button"`, `tabindex="0"`, icon from `BUCKET_ICON[row.bucket]` (line 42-46: `open→comment, stale→warning, resolved→check`), `row.comment.body` as primary text, `sideLineLabel(row)` (line 56-58: `${side==='base'?'B':'H'}${line}`, no space/prefix) right-aligned via `.comments-tab__row-location`. Bucket-keyed CSS (lines 196-220): `--resolved` → `color: var(--text-muted)` (whole row, inherited by icon/text/location since nothing overrides it further down), `--stale .comments-tab__row-location` → `var(--status-warning-foreground)`; `open` rows get the base rule's `color: var(--text-primary)` with no override. **PASS.**

3. **Orphaned trailing groups, Phase-23 export used directly, non-interactive, badge chip.** `CommentsTab.vue:24`: `orphanedGroups = computed(() => projectOrphanedCommentGroup(props.comments))` — called directly on `props.comments`, no re-derivation/re-filtering by this component. Rendered (lines 100-115) as additional `<li>` entries appended after the `v-for="group in fileGroups"` block inside the *same* `<ul>`, so they are structurally guaranteed to follow every live-file group. Header shows `group.path.display` via `<PathText>`; one `<li>` group per distinct path (keyed `group.path.bytesBase64url`, matching `projectOrphanedCommentGroup`'s own one-group-per-distinct-path contract). Rows (lines 108-113): plain `<li>` with **no** `role="button"`, **no** `@click`, **no** `tabindex` attribute present anywhere in that block; `warning` icon; `ReviewStateBadge kind="unavailable" label="Anchor missing" size="compact"` in place of a side/line span; `.comments-tab__row--orphaned` CSS sets `color: var(--text-muted)` for the whole row. **PASS.**

4. **Reveal emit signature and triggers.** `CommentsTab.vue:19-21`: `defineEmits<{ reveal: [commentId: string, fileId: string, side: WorkspaceComment['side'], line: number]; }>()` — exact signature, `side` type derived from `WorkspaceComment['side']` (no separate `DiffSide` import, per the plan's explicit instruction). Fired identically from `@click` (line 91) and `@keydown.enter` (line 92) on each live row, both calling `emit('reveal', row.comment.id, group.leaf.fileId, row.comment.side, row.comment.line)` — that row's own comment identity, not a stale/outer value. Orphaned rows have no emit call at all (confirmed above). The emit is a plain `defineEmits` call with no transformation applied downstream in this component, so it bubbles unchanged once a parent (`BottomPanel.vue`, Plan 24-08) forwards it. **PASS.**

**Self-Check: PASSED**
