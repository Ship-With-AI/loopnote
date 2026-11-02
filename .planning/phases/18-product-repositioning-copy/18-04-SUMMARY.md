---
phase: 18-product-repositioning-copy
plan: 04
subsystem: ui
tags: [vue, zod, fastify, document-title, accessibility]

# Dependency graph
requires:
  - phase: 18-product-repositioning-copy (18-01)
    provides: 18-COPY-DRAFT.md's human-approved Approval record (locked D-09/D-10 strings, the uncommitted-empty-state source-label resolution)
provides:
  - "repoName: string field end-to-end (capabilities.ts → api.ts schema → App.vue) for the browser tab title's <repo> segment"
  - "D-08 'Files' noun applied to every sidebar/dialog/toggle/skip-link aria-label and visible string"
  - "D-10 locked empty-state copy (all session kinds) in App.vue's emptyFilesCopy"
  - "D-09 dynamic document.title wiring ('<Name> · <repo> · <session kind>') via a new documentTitle computed + immediate watch()"
  - "POS-02 dirty-badge screen-reader text without the 'staged, unstaged, and untracked bytes ignored' enumeration"
affects: [18-05 (Playwright spec updates for this plan's copy)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-kind-to-label dispatch mirrored locally (uncommittedSourceLabel in App.vue) instead of importing IdentityHeader.vue internals, matching the plan's read_first guidance"
    - "repoName computed server-side via path.basename(repositoryRoot) at the point each SessionResponseSchema.parse() call already has a trusted, resolved repository root in scope"

key-files:
  created: []
  modified:
    - src/contracts/api.ts
    - src/server/capabilities.ts
    - src/web/index.html
    - src/web/App.vue
    - src/web/components/FileTree.vue
    - src/web/components/ChangedFilesDialog.vue
    - src/web/components/ActiveFileToolbar.vue
    - src/web/components/IdentityHeader.vue
    - tests/api/exact-patch.test.ts
    - tests/api/session.test.ts
    - tests/api/uncommitted-session.test.ts

key-decisions:
  - "Uncommitted empty-state copy follows 18-COPY-DRAFT.md's Approval record item 10 (dated 2026-11-02), not the plan's own stale pre-approval prose: all three uncommitted sources render 'No changes in {Staged|Unstaged|Working tree}. Edit files, then Refresh.' using one dynamic source-label computed, not three distinct hand-written headings/messages."
  - "Removed the now-dead uncommittedBaseLabel constant (its only caller was the old worktree empty-state branch this plan rewrote) rather than leaving unused dead code."
  - "sessionKindTitleSegment and emptyFilesCopy's uncommitted branch share one uncommittedSourceLabel computed instead of duplicating the staged/unstaged/worktree switch twice in the same file."
  - "Standalone session's tab-title file count reads uncommittedSession.value?.changedFileCount directly (the uncommitted union member already carries it for sourceKind 'standalone') instead of introducing a separate standaloneSession computed, since App.vue had none."

patterns-established:
  - "New optional response fields are added to all SessionResponse union members plus every SessionResponseSchema.parse() call site in the same commit, so the Zod schema and the server construction sites never drift."

requirements-completed: [POS-02, POS-03]

# Metrics
duration: 45min
completed: 2026-11-02
status: complete
---

# Phase 18 Plan 04: Web copy (D-08/D-09/D-10) and repoName tab-title wiring Summary

**Added a server-resolved `repoName` field end-to-end so the browser tab title can read `<Name> · <repo> · <session kind>` live, renamed every "Changed files" string to "Files" across the sidebar family, rewrote App.vue's empty states to the locked D-10 copy (uncommitted branch per the Approval record's later source-label resolution), and replaced the dirty badge's screen-reader enumeration with the POS-02-locked sentence.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 (as planned)
- **Files modified:** 8 source files + 3 test files (test fixes required by Task 1's own schema change)

## Accomplishments
- `repoName: z.string().optional()` added to all three `SessionResponse` union members; `path.basename(repositoryRoot)` computed at all four `SessionResponseSchema.parse()` call sites in `capabilities.ts`.
- Every "Changed files" sidebar/dialog/toggle/skip-link string now reads "Files" (D-08); the decorative eyebrow `<span>Changed</span>` is removed.
- `App.vue`'s `emptyFilesCopy` matches the UI-SPEC-locked table for exact-patch (unchanged), range (both sub-cases gain a missing imperative action), and pinned-comparison ("PR-style" jargon dropped) branches, and the Approval-record-resolved uncommitted branch (dynamic `{Staged|Unstaged|Working tree}` label).
- `document.title` is now computed live via a `documentTitle` computed + `watch(..., { immediate: true })`, reading the new `session.repoName` field; `index.html`'s static `<title>` tag is deleted.
- `IdentityHeader.vue`'s dirty-badge screen-reader text matches the POS-02-locked wording; its visible text is unchanged.

## Task Commits

1. **Task 1: Add repoName to the session response schema and server construction** - `bfe924e` (feat)
2. **Task 2: Apply the D-08 "Files" sidebar family and the dirty-badge screen-reader text** - `51d8263` (feat)
3. **Task 3: Rewrite App.vue's empty states and loading heading, and wire the dynamic tab title** - `7c24098` (feat)
4. **Test fix: pin repoName in API response fixtures broken by Task 1** - `2c1f1e6` (test)

## Files Created/Modified
- `src/contracts/api.ts` - `repoName: z.string().optional()` on all three session-response schema members
- `src/server/capabilities.ts` - `basename` import; `repoName: basename(<root>)` at all four `SessionResponseSchema.parse()` sites
- `src/web/App.vue` - rewrote `emptyFilesCopy`; added `uncommittedSourceLabel`, `sessionKindTitleSegment`, `documentTitle` computeds; added the title-sync `watch()`; D-08 skip-link text
- `src/web/index.html` - removed static `<title>Loopnote</title>`
- `src/web/components/FileTree.vue` - D-08 "Files" aria-labels/SR text, removed decorative eyebrow span, filter-empty message word swap
- `src/web/components/ChangedFilesDialog.vue` - D-08 `title`/`close-aria-label`
- `src/web/components/ActiveFileToolbar.vue` - D-08 `filesToggleLabel` aria-labels (visible `filesToggleCopy` left untouched, already compliant)
- `src/web/components/IdentityHeader.vue` - POS-02 dirty-badge screen-reader text
- `tests/api/exact-patch.test.ts`, `tests/api/session.test.ts`, `tests/api/uncommitted-session.test.ts` - updated exact-shape assertions to include the new `repoName` field

## Decisions Made
- Followed the executor brief's explicit override: the uncommitted empty-state copy uses `18-COPY-DRAFT.md`'s Approval record item 10 (dynamic `No changes in {Working tree|Staged|Unstaged}.` / `Edit files, then Refresh.` for all three sources), not the plan's own literal `<action>` prose (which still had the pre-approval three distinct headings/messages with `Stage changes, then Refresh.` for staged). This is the only point where the plan's literal text and the locked copy disagree; every other string in the plan matched `18-UI-SPEC.md`/`18-COPY-DRAFT.md` verbatim.
- The loading-heading `<h1>` (`App.vue` loading shell) already used `${RENAME_MAP.displayName}: loading exact patch` / `...loading pinned comparison` before this plan ran (a Phase 17.1 carry-over, per the stale-plan notice in the brief) — left untouched since it was already compliant; Task 3's literal-'Cumpa' instruction was stale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: fix failures in own files] Updated three Vitest API tests broken by Task 1's own schema change**
- **Found during:** full `npm test` run after Tasks 1–3
- **Issue:** `tests/api/session.test.ts`, `tests/api/exact-patch.test.ts`, `tests/api/uncommitted-session.test.ts` each asserted an exact session-response shape (`toEqual`/`Object.keys(...).toEqual`) that didn't include the new `repoName` field Task 1 added to the wire.
- **Fix:** Added `repoName: 'never-on-the-wire'` (the fixture's actual `repositoryRoot` basename) to `session.test.ts`'s expected object, and added `'repoName'` to the two `Object.keys(...).toEqual([...])` arrays, in the actual received key order.
- **Files modified:** `tests/api/exact-patch.test.ts`, `tests/api/session.test.ts`, `tests/api/uncommitted-session.test.ts`
- **Verification:** `npm test` — 853/853 passing (was 849/853 before the fix, the 4th prior failure being `tests/git/candidates.test.ts`'s known 10s-timeout load flake, which also passed on the same rerun)
- **Committed in:** `2c1f1e6`

---

**Total deviations:** 1 auto-fixed category (3 test files), all required by Task 1's own correctness, not scope creep.
**Impact on plan:** None beyond the required test-fix commit; no plan behavior changed.

## Issues Encountered
None beyond the auto-fixed test breakage above.

## Unapproved — needs copy
None. Every string this plan applied traces to a verbatim `18-UI-SPEC.md` locked value or a `18-COPY-DRAFT.md` Approval record entry; no invented wording was required.

## Deferred to 18-05
Seven Playwright e2e/integration spec files assert the pre-18-04 copy this plan replaced ("Changed files" aria-labels/titles, "No PR-style changes in this pinned comparison", "Committed HEAD reviewed; staged, unstaged, untracked bytes ignored.", static tab-title expectations): `tests/e2e/anchored-review.spec.ts`, `tests/e2e/file-tree.spec.ts`, `tests/e2e/pinned-session.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/integration/draft-recovery-ui.spec.ts`, `tests/integration/support-dialog.spec.ts`. These are explicitly owned by `18-05-PLAN.md` (`depends_on: ["18-04"]`, same seven files in its `files_modified`), not touched here. They are not part of `npm test` (`vitest run`); they run under `test:browser`/`test:package` (`playwright test`), so this plan's `npm test` acceptance criterion is unaffected.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `repoName` now flows end-to-end; `document.title` renders live per session.
- 18-05 can proceed: it only needs to update the seven listed Playwright specs' locators/assertions to match this plan's applied copy — no further web-copy or schema work is needed first.

---
*Phase: 18-product-repositioning-copy*
*Completed: 2026-11-02*
