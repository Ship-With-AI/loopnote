---
phase: 14-uncommitted-source-review-frozen-snapshots
plan: 10
subsystem: ui
tags: [vue, identity-header, icon, refresh, uncommitted-review]

# Dependency graph
requires:
  - phase: 14-uncommitted-source-review-frozen-snapshots
    provides: "UncommittedSessionResponseSchema (14-08's `uncommitted: { kind, sourceKind, baseCommitOid?, reviewKey, changedFileCount }` SessionResponse union member)"
provides:
  - "IdentityHeader.vue's third `v-else-if=\"isUncommitted\"` comparison-strip branch (BASE shows 'Index' for Unstaged or merge-base candidate label + short OID for Staged/Working tree; HEAD shows source label + '· snapshot {short digest}')"
  - "IdentityHeader.vue's `Frozen snapshot` pin-cue value and dirty-badge suppression for uncommitted sessions"
  - "IdentityHeader.vue's `showRefresh`/`refreshBusy`/`worktreeChanged` props, `refresh` emit, Refresh button (accessible name 'Refresh snapshot'), and passive 'Working tree changed since snapshot' change-indicator span"
  - "UiIcon.vue's 13th glyph, `'refresh'`"
affects: [14-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IdentityHeader.vue's comparison-strip ternary extended from two-way (isExactPatch) to three-way (isExactPatch / isUncommitted / pinned) using the file's existing inline-template-ternary style for pin-cue and v-else-if chaining for the strip itself"
    - "Uncommitted session's displayed snapshot digest reuses `reviewKey`'s first 7 hex characters (no separate content-digest field exists on 14-08's `UncommittedSessionResponseSchema`), matching `baseOid`/`headOid`'s existing `oid.slice(0, 7)` convention"
    - "Uncommitted session's Base candidate has no human-readable label field on the wire contract (only `baseCommitOid`), so the BASE endpoint reuses the file's own 'Repository object' fallback text (the same literal string already used by the exact-patch PREIMAGE endpoint) alongside the short OID"

key-files:
  created: []
  modified:
    - src/web/components/IdentityHeader.vue
    - src/web/components/ui/UiIcon.vue

key-decisions:
  - "Displayed snapshot short-digest uses `uncommittedSession.reviewKey.slice(0, 7)` since 14-08's `UncommittedSessionResponseSchema` exposes no separate chain-tip content-digest field, only `reviewKey` (the draft-identity hash)"
  - "Uncommitted sessions' BASE candidate label (Staged/Working tree only) reuses the literal 'Repository object' fallback text already established by the exact-patch branch's PREIMAGE endpoint, since `baseCommitOid` carries no human-readable candidate name"

patterns-established: []

requirements-completed: [SNAP-03]

# Metrics
duration: 25min
completed: 2026-10-30
status: complete
---

# Phase 14 Plan 10: Identity Header Refresh & Uncommitted Comparison Strip Summary

**IdentityHeader.vue's comparison strip gains a third branch for uncommitted (Staged/Unstaged/Working tree) sessions, a `Frozen snapshot` pin-cue, dirty-badge suppression, and a Refresh button + passive change-indicator driven entirely by new props/emits; UiIcon.vue gains a 13th `refresh` glyph.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-30
- **Completed:** 2026-10-30
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `IdentityHeader.vue`'s comparison strip now has three template branches (`isExactPatch` / `isUncommitted` / pinned-default), with the uncommitted branch's BASE endpoint showing `Index` (Unstaged, no OID) or the merge-base candidate label + short OID (Staged/Working tree), and HEAD showing the source label (`Staged`/`Unstaged`/`Working tree`) plus `· snapshot {short digest}`.
- The `pin-cue` span reads `Frozen snapshot` for uncommitted sessions, a third value alongside the existing `Frozen patch`/`Pinned comparison`.
- `dirtyEndpoints` is suppressed for uncommitted sessions (same guard as exact-patch), so the `Dirty bytes ignored` badge never renders.
- A Refresh button (`showRefresh` prop, `refresh` emit, `refreshBusy` prop driving `Refreshing…`/`aria-busy`, accessible name `Refresh snapshot`, tooltip `Refresh snapshot · Alt+Shift+R`) and a non-interactive `worktreeChanged`-gated `Working tree changed since snapshot` `<span>` were added to `header-facts`, positioned after `attached-fact` and before the `support`/`Review notes` buttons.
- `UiIcon.vue` gained a `'refresh'` glyph (circular-arrow stroke path, same `viewBox="0 0 16 16"`/`stroke-width="1.5"` style as the other 12 glyphs).

## Task Commits

Each task committed atomically:

1. **Task 1: Three-way comparison strip, Frozen snapshot cue, dirty-badge suppression** - `409ed65` (feat)
2. **Task 2: Refresh button, passive change indicator, and the refresh glyph** - `a18fc54` (feat)

## Files Created/Modified

- `src/web/components/IdentityHeader.vue` - Added `isUncommitted`/`uncommittedSession`/`sourceLabel`/`shortDigest`/`baseCandidateLabel`/`baseCandidateOid` computeds; three-way comparison-strip template; `Frozen snapshot` pin-cue branch; `dirtyEndpoints` guard now excludes uncommitted sessions; `showRefresh`/`refreshBusy`/`worktreeChanged` props; `refresh` emit; change-indicator span; Refresh button.
- `src/web/components/ui/UiIcon.vue` - Added `'refresh'` to `UiIconName` union and a matching `v-else-if` template branch drawing a circular-arrow glyph.

## Decisions Made

- Used `reviewKey.slice(0, 7)` as the displayed snapshot digest because 14-08's `UncommittedSessionResponseSchema` exposes no separate content-digest field — confirmed by reading `src/contracts/api.ts`'s `UncommittedSessionResponseSchema` (`kind`, `sourceKind`, `baseCommitOid?`, `reviewKey`, `changedFileCount` — no other digest field present).
- Used the literal `Repository object` fallback text for the uncommitted BASE candidate label (Staged/Working tree), reusing the exact string the exact-patch branch's PREIMAGE endpoint already renders, since `baseCommitOid` carries no separate human-readable label on the wire contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `IdentityHeader.vue` exposes `showRefresh`/`refreshBusy`/`worktreeChanged` props and a `refresh` emit, ready for 14-12's `App.vue` wiring to the `POST /api/refresh`/`GET /api/worktree-status` endpoints 14-08 built.
- `UiIcon.vue`'s `'refresh'` glyph is available for any other consumer.
- No blockers for 14-11 or 14-12.

---
*Phase: 14-uncommitted-source-review-frozen-snapshots*
*Completed: 2026-10-30*

## Self-Check: PASSED

- `src/web/components/IdentityHeader.vue` — FOUND, contains `isUncommitted` (5 occurrences), `'Frozen snapshot'` (1), `v-else-if="isUncommitted"` (1), `refresh: [];` (1), `Working tree changed since snapshot` (1), `aria-label="Refresh snapshot"` (1)
- `src/web/components/ui/UiIcon.vue` — FOUND, contains `| 'refresh'` (1), `name === 'refresh'` (1)
- `git log --oneline --all --grep="14-10"` — 2 commits (`409ed65`, `a18fc54`)
- `npm run typecheck:web` — exits 0
- `git diff --stat -- src/web/components/ActiveFileToolbar.vue src/web/App.vue` — empty (untouched, as required)
