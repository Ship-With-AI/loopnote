---
phase: 24
plan: 02
status: complete
---

# 24-02 Summary: Comments-tab file/state grouping

## Commits

| Commit | Type | Description |
|--------|------|--------------|
| `d656c55` | test | RED tests for `comments-tab-groups.ts` (13 cases covering every bucket rule, tree-order rule, and both exclusion rules — fail with `Cannot find module` since the implementation did not yet exist) |
| `8690cfb` | feat | GREEN implementation of `projectCommentsTabFileGroups`/`CommentsTabFileGroup`/`CommentsTabRow`/`CommentsTabBucket` in `src/web/model/comments-tab-groups.ts` |

No `refactor(24-02)` commit: the implementation followed `comment-groups.ts`'s `Map`-based grouping idiom and `thread-order.ts`'s tree-order idiom directly on the GREEN pass; no post-GREEN restructuring was needed.

## What shipped

`src/web/model/comments-tab-groups.ts` exports a pure function (no Monaco/Vue import) that groups a `WorkspaceComment[]` file-outer (in `flatFileRows` tree-path order, via a `fileOrder` index `Map` built once) then state-inner (bucket rank `open(0) -> stale(1) -> resolved(2)`, "resolved wins" over `status === 'stale'`; each bucket ordered by `line` ascending, with `comment.id` lexicographic tie-break for determinism). Exclusions (both independent, applied before grouping): `status === 'orphaned'`, `fileId === null`, and `fileId` not present in `flatFileRows`. A file with zero matching comments produces no group entry — never an empty one.

`tests/unit/comments-tab-groups.test.ts` covers all 10 cases listed in the plan's `<behavior>` section plus one extra id-tie-break case (13 tests total), reusing the `fileRow`/`comment`/`sessionFile`/`exactPath` fixture idiom already established in `tests/unit/thread-order.test.ts`.

## Deviations from Plan

None. Shipped interfaces (`WorkspaceComment` in `workspace-state.ts`, `VisibleFileTreeLeaf` in `file-tree.ts`) matched the plan's assumptions exactly; no reconciliation was needed.

Per the plan's `<verification>` note: this plan changes no UI and no component consumes `comments-tab-groups.ts` until `CommentsTab.vue` (Plan 24-07), so the phase-wide packaged-binary Chromium check is deferred to that plan. Confirmed by grep: no `tests/e2e` or `tests/integration` spec references `comments-tab-groups` yet.

## Verification (real commands run)

- `npx vitest run --no-file-parallelism tests/unit/comments-tab-groups.test.ts` → **13 passed (13)**, RED confirmed first (`Cannot find module '.../comments-tab-groups.js'`) before the `feat` commit.
- `npm run typecheck:web` → **0 errors** (`vue-tsc --noEmit`, clean exit).
- `npm run verify:semantic-css` → `Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.` (no-op pass, no CSS touched).
- `npx vitest run --no-file-parallelism tests/unit` (full suite) → **46 files / 478 tests passed**, no regressions.
- Grep for Playwright specs referencing `comments-tab-groups`: **no matches** (expected; deferred to 24-07).
- `grep -n "import" src/web/model/comments-tab-groups.ts`: only `./file-tree.js` and `./workspace-state.js` — no `monaco-editor`/`vue` import, satisfying `<success_criteria>`.

## Self-Check: PASSED

- Truth 1 (file-outer tree-order then state-inner open->stale->resolved, resolved-wins, line-ascending, RED-then-GREEN for every rule): verified — 13 tests covered bucket assignment (3 cases), resolved-wins, line ordering, tree-path cross-file ordering, and id tie-break; all RED before implementation, all GREEN after.
- Truth 2 (orphaned/null-fileId/unmatched-fileId comments excluded entirely; zero-match files produce no empty group): verified — 4 dedicated tests, including the "file present with only excluded comments produces no group at all" case.
- Artifact `src/web/model/comments-tab-groups.ts` exports exactly `projectCommentsTabFileGroups`, `CommentsTabFileGroup`, `CommentsTabRow`, `CommentsTabBucket`: verified by direct read of the file.
- Key link to `file-tree.ts`'s `flatFileRows`/`VisibleFileTreeLeaf` via a `Map<fileId, index>` built once (no `indexOf` scans): verified by direct read — `const fileOrder = new Map(flatFileRows.map((row, index) => [row.fileId, index]));`.
