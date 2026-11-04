---
phase: 15-standalone-file-review
plan: 05
subsystem: ui
tags: [vue, web, standalone-review, d-02, export]

# Dependency graph
requires:
  - phase: 15-02
    provides: "Widened uncommitted-kind schemas with sourceKind: 'standalone', standaloneGitState, standaloneReviewKey"
provides:
  - "IdentityHeader.vue standalone header branch (D-02 header copy, no Base/Head or Preimage/Postimage pair)"
  - "ActiveFileToolbar.vue and FileRow.vue D-02 three-way standalone git-state text labels"
  - "App.vue isStandaloneSession computed and corrected export-supported binding"
affects: [15-06, 16-rendered-markdown-preview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sourceKind-branched computed pairs (isStandalone/standaloneSession) mirroring the existing isUncommitted/uncommittedSession split"
    - "Precedence ordering between a new standalone-specific template branch and a pre-existing generic branch (standaloneStateLabel checked before layoutLabel)"

key-files:
  created: []
  modified:
    - src/web/components/IdentityHeader.vue
    - src/web/components/ActiveFileToolbar.vue
    - src/web/components/FileRow.vue
    - src/web/App.vue

key-decisions:
  - "dirtyEndpoints in IdentityHeader.vue now also short-circuits to [] for isStandalone (in addition to isExactPatch/isUncommitted) — undocumented in the plan's action text but required: redefining isUncommitted to exclude standalone meant the computed's else-branch would otherwise dereference pinnedSession.value!.base on undefined for every standalone session, crashing the header on render. Fixed under Rule 1 (auto-fix bug)."
  - "IdentityHeader.vue's new standalone endpoint span uses the label text 'STANDALONE' (uppercase, matching the existing BASE/HEAD/PREIMAGE/POSTIMAGE convention) — the plan specified the selector text exactly but left the endpoint-label text unspecified; chose the convention-consistent default per no-interactive-user instructions."
  - "ActiveFileToolbar.vue's standalone branch keeps the StatusBadge sibling element (same structure as the layoutLabel branch it supersedes), for markup/visual consistency; the plan only specified the status span content, not whether to drop the badge."

patterns-established:
  - "Standalone sourceKind reuses Phase 14's uncommitted response shape; UI layers distinguish it via a sourceKind check rather than a new top-level discriminant, consistent with Plan 15-02's design."

requirements-completed: [FILE-03]

# Metrics
duration: ~20min
completed: 2026-10-31
status: complete
---

# Phase 15 Plan 05: Standalone Web UI Wiring Summary

**Wired D-02's exact standalone-session header/git-state copy into IdentityHeader.vue, ActiveFileToolbar.vue, and FileRow.vue, and fixed the export-supported binding in App.vue so standalone sessions can export while staged/unstaged/worktree sessions remain restricted exactly as before.**

## Performance

- **Started:** 2026-10-31 (session start)
- **Completed:** 2026-10-31T08:01:50Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `IdentityHeader.vue` now renders `Standalone review · N files · snapshot <7-char digest>` with no Base/Head or Preimage/Postimage endpoint pair for standalone sessions, and `pin-cue` reads `Frozen snapshot` for them.
- `ActiveFileToolbar.vue` and `FileRow.vue` both render the exact three D-02 text markers (`Standalone · Modified (uncommitted)` / `Standalone · Untracked` / `Standalone · Unchanged`) driven by `standaloneGitState`, visible and independent of existing markers, with zero effect on files lacking that field.
- `App.vue` gained `isStandaloneSession` and the `export-supported` binding now evaluates `true` for standalone sessions while staying `false` for staged/unstaged/worktree — preserving the Phase 14 restriction and fixing the FILE-05-breaking bug the plan's objective called out.

## Task Commits

Each task was committed atomically:

1. **Task 1: IdentityHeader.vue standalone header branch** - `901ae97` (feat)
2. **Task 2: ActiveFileToolbar.vue and FileRow.vue standalone git-state label (D-02)** - `46ff21a` (feat)
3. **Task 3: App.vue isStandaloneSession and export-supported fix** - `e602b43` (feat)

_Note: plan `type="execute"` with `tdd="true"` tasks; verification was `npm run build:web` (TypeScript/template compile) per each task's `<verify>` — no separate RED/GREEN/REFACTOR test commits were specified or added, matching the plan's own verify block._

## Files Created/Modified
- `src/web/components/IdentityHeader.vue` - `uncommittedKey`/`isStandalone`/`standaloneSession` computeds, `standaloneLabel`/`standaloneShortDigest`, new `v-else-if="isStandalone"` template branch, updated `pin-cue` ternary, `dirtyEndpoints` guard extended to standalone
- `src/web/components/ActiveFileToolbar.vue` - `standaloneStateLabel` computed, template branch taking precedence over `layoutLabel`
- `src/web/components/FileRow.vue` - `standaloneStateLabel` computed, sibling `standalone-state-marker` span
- `src/web/App.vue` - `isStandaloneSession` computed, corrected `:export-supported` binding

## Decisions Made
- Took the plan's literal computed/template wiring as specified for all three tasks (file contents matched the plan's assumed baseline line numbers exactly — no CONTEXT.md deviation needed).
- See `key-decisions` in frontmatter for the three points left underspecified by the plan's action text (dirtyEndpoints guard, STANDALONE label text, StatusBadge retention) — each resolved toward the convention-consistent/correctness-preserving default, no user available to ask.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dirtyEndpoints crashes on render for standalone sessions**
- **Found during:** Task 1 (IdentityHeader.vue standalone header branch)
- **Issue:** The plan's action redefines `isUncommitted` to exclude standalone sessions (`uncommittedKey.value !== undefined && !isStandalone.value`). The pre-existing `dirtyEndpoints` computed branches on `isExactPatch.value || isUncommitted.value` and otherwise dereferences `pinnedSession.value!.base.worktree` — for a standalone session `pinnedSession.value` is `undefined` (no `'base'` key on the session), so this computed now runtime-crashes on every standalone-session render, since the template evaluates it unconditionally (no `v-if` guard).
- **Fix:** Extended the guard to `isExactPatch.value || isUncommitted.value || isStandalone.value`, so standalone sessions short-circuit to `[]` (no dirty-badge concept applies — standalone sessions aren't pinned Base/Head comparisons).
- **Files modified:** `src/web/components/IdentityHeader.vue`
- **Verification:** `npm run build:web` succeeds; the computed now statically excludes the dereference path for standalone (confirmed by reading the final file content).
- **Committed in:** `901ae97` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness — without it, opening a standalone session in the browser would throw on render. No scope creep; fix is a one-line guard extension co-located with the plan's own Task 1 edits.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Web UI layer now fully distinguishes standalone sessions from Phase 14's staged/unstaged/worktree sessions for header copy, per-file git-state labels, and export availability.
- Server-side export capability enforcement (404 guard referenced in the threat model as T-15-14's mitigation) is tracked separately in Plan 15-06 — not addressed here, as this plan is client-UI-only.
- No blockers for subsequent Phase 15 plans.

---
*Phase: 15-standalone-file-review*
*Completed: 2026-10-31*

## Self-Check: PASSED
