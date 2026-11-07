---
phase: 23-inline-comment-threads
plan: 07
subsystem: ui
tags: [vue, monaco, overlay-widget, playwright, vitest]

# Dependency graph
requires:
  - phase: 23-inline-comment-threads (Plan 23-03)
    provides: diffThreadIds() keyed reconciliation helper (src/web/model/thread-zone-diff.ts)
  - phase: 23-inline-comment-threads (Plan 23-04)
    provides: CommentThread.vue presentational component with typed props/emits
  - phase: 23-inline-comment-threads (Plan 23-05)
    provides: diff-adapter.ts threadZones map, createThread/growThread/removeThread public methods, AdapterNavigation.nextThread/previousThread
provides:
  - "DiffWorkspace.vue renderThreads(): a diffThreadIds-driven loop mounting one CommentThread.vue per live comment id into the adapter's per-id overlay-widget DOM nodes, replacing the old single h() literal"
  - "DiffWorkspace.vue props (collapsedByCommentId/editingCommentId/commentBuffers) and emits (resolveComment/reopenComment/deleteComment/beginEditComment/updateCommentEditText/saveCommentEdit/cancelCommentEdit/toggleCommentCollapse) for Plan 23-08 to bind to App.vue's mutateReview()"
  - "navigate.nextThread/previousThread wired to real next-thread/previous-thread emits, satisfying Plan 23-05's AdapterNavigation type end-to-end"
affects: [23-08-app-vue-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renderThreads(): computes liveComments (fileId match, non-orphaned), diffs against a local Map<commentId, HTMLElement> cache via diffThreadIds(), calls adapter.removeThread/createThread only for ids that actually changed, then render(h(CommentThread, {...}), node) for every id in toCreate+toKeep — same shape as the existing composer-zone render(h(...), zone) pattern, generalized to N keyed nodes"
    - "Thread DOM-node cache lifecycle mirrors the existing single zoneRoot pattern: unmountThread()/clearRenderedThreads() call render(null, node) before the underlying Monaco zone is torn down, preventing orphaned Vue instances on adapter disposal or editorKind switches"

key-files:
  created: []
  modified:
    - src/web/components/DiffWorkspace.vue
    - src/web/components/CommentThread.vue
    - src/web/prototypes/MonacoStabilityPrototype.vue
    - tests/integration/monaco-anchor.spec.ts
    - tests/integration/anchored-workspace.spec.ts
    - tests/e2e/rendered-markdown-preview.spec.ts

key-decisions:
  - "Dropped the vestigial currentComment()-pinning check in the composer/comments watch: once a comment is accepted it now renders exclusively through its own independent thread, so keeping the old single-composer anchor/zone 'active' after acceptance only reserved duplicate, invisible space and (empirically, via real-browser debugging) pushed subsequent content far enough off-screen to break virtualized decoration/geometry checks. The anchor is now always cleared when the composer prop closes."
  - "Generalized monaco-anchor.spec.ts's expectPairedZonesAligned to pair N thread zones by geometric proximity (closest top + matching height) rather than by creation-order index, because Monaco orders a pane's view zones by their own afterLineNumber, not insertion order — index-based pairing produced false negatives once two threads' counterpart lines crossed over."
  - "MonacoStabilityPrototype.vue (Plan 23-07's harness for monaco-anchor.spec.ts's two new tests) has no draft-mutation backend, so the plan's literal 'seed via the existing draft-mutation request flow' instruction doesn't apply to this file; adapted by exposing window.__monacoStabilityThreads as a direct test-only bridge to the real adapter.createThread/growThread/removeThread surface instead."

requirements-completed: [THREAD-01, THREAD-02, THREAD-06, THREAD-08, THREAD-09]

# Metrics
duration: ~3h
completed: 2026-11-05
status: complete
---

# Phase 23 Plan 07: DiffWorkspace Keyed Thread-Mount Loop Summary

**`DiffWorkspace.vue` now mounts one independently-rendered `CommentThread.vue` per live comment id via a `diffThreadIds()`-driven reconciliation loop into Plan 23-05's per-id overlay-widget DOM nodes, replacing the old single-comment `h()` literal — across committed, exact-patch, uncommitted, standalone, and agent-attached sessions, in both two-pane and single-pane rendering.**

## Performance

- **Duration:** ~3h (including empirical real-browser debugging of two production regressions surfaced by the new architecture)
- **Tasks:** 3
- **Files modified:** 6 (2 production components + 1 test-prototype harness + 3 spec files)

## Accomplishments
- `renderThreads()`: a keyed diff-and-mount loop in `DiffWorkspace.vue` that computes `liveComments` (current file, non-orphaned), diffs them against a local `Map<commentId, HTMLElement>` cache via `diffThreadIds()`, and only calls `adapter.createThread`/`removeThread` for ids whose identity actually changed — `toKeep` ids are re-rendered in place via `render(h(CommentThread, {...}), node)` without any Monaco zone churn, proving THREAD-08 (reconciliation never tears down unaffected threads) both at the unit level (existing `diffThreadIds` coverage) and now via two new real-browser Playwright tests.
- Eight comment-mutation emits (`resolveComment`/`reopenComment`/`deleteComment`/`beginEditComment`/`updateCommentEditText`/`saveCommentEdit`/`cancelCommentEdit`/`toggleCommentCollapse`) and three new props (`collapsedByCommentId`/`editingCommentId`/`commentBuffers`) wired from `CommentThread.vue`'s emits through to `DiffWorkspace.vue`'s own public emit surface, ready for Plan 23-08's `App.vue`/`mutateReview()` binding.
- `navigate.nextThread`/`previousThread` now emit real `'next-thread'`/`'previous-thread'` events (replacing Plan 23-05's inert no-op stubs), satisfying the full `AdapterNavigation` type.
- Fixed a genuine architectural regression discovered via real-browser debugging (not source review): the old "keep the composer anchor active while a matching comment exists" check left an **empty, invisible, still-space-reserving** composer zone lingering after every comment acceptance once threads render independently — duplicating reserved layout height and, in one fixture, pushing subsequent source lines far enough off Monaco's rendered/virtualized buffer that both the 2-line anchor decoration and a geometry assertion broke. Fixed by always clearing the anchor once the composer closes.
- Added two new real-browser Playwright tests to `monaco-anchor.spec.ts`: multi-thread Base/Head zone-pair alignment at different, independently-grown heights (RESEARCH.md Pitfall 1), and DOM-node-identity + scroll-position stability across an unrelated thread's creation (RESEARCH.md Pitfall 3 / THREAD-08), using a tagged-DOM-node-survives-reconciliation proof rather than a content/visibility check.
- Updated every Playwright locator across `anchored-workspace.spec.ts` and `rendered-markdown-preview.spec.ts` that depended on the retired single-zone `.inline-accepted-comment` card to target the new `.comment-thread[data-comment-id]` / `.thread-header` markup.

## Task Commits

1. **Task 1 + Task 3: Keyed diff-and-mount render loop + next-thread/previous-thread wiring** - `51a8e05` (feat) — both tasks modify the same `DiffWorkspace.vue` script block (props/emits/navigate object/render functions are structurally interleaved), so they landed as one atomic commit, matching the project's established precedent (Plan 23-05's SUMMARY documents the same reasoning for its own interleaved Task 1/Task 2).
2. **Task 2: Fix broken locators and add multi-thread/reconciliation-stability regression coverage** - `b2509ff` (test)

**Plan metadata:** commit pending (this docs commit)

## Files Created/Modified
- `src/web/components/DiffWorkspace.vue` - `renderThreads()`/`unmountThread()`/`clearRenderedThreads()`/`resizeThreadZoneToContent()`, new props/emits, `navigate.nextThread/previousThread`, `focusComment()` retargeted to `.thread-header`, `currentComment()` removed (dead after the anchor-clearing fix), composer/comments watch always clears the anchor on close
- `src/web/components/CommentThread.vue` - added `tabindex="-1"` to `.thread-header` so `focusComment()`'s programmatic focus target is valid (cross-plan fix, Plan 23-04's component predates this call site)
- `src/web/prototypes/MonacoStabilityPrototype.vue` - exposes `window.__monacoStabilityThreads.{create,grow,remove}` test-only hooks driving the real adapter thread-zone surface, since this Plan-23-01 spike harness has no draft/comment backend
- `tests/integration/monaco-anchor.spec.ts` - new `expectAllThreadZonesAligned()` helper (geometry-pairing-based, N pairs) + two new tests (13, 14)
- `tests/integration/anchored-workspace.spec.ts` - locator retargeting across 3 tests + 1 describe block; `readMonacoGeometry`'s `zones` selector excludes new thread-spacer zones; `hoverMonacoLine` re-issues its mouse move to settle against in-flight thread-zone layout work
- `tests/e2e/rendered-markdown-preview.spec.ts` - source-mode accepted-comment locator retargeted; retired-decoration assertion replaced with updated commentary

## Decisions Made
See `key-decisions` in frontmatter (anchor-clearing fix, geometry-pairing-by-proximity, test-prototype thread hooks).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed vestigial `currentComment()` anchor-pinning that duplicated reserved layout space after comment acceptance**
- **Found during:** Task 2, debugging a real-browser decoration-count regression (`.monaco-anchor-line` count dropped from 2 to 1) in `rendered-markdown-preview.spec.ts`'s A-01 test
- **Issue:** The composer/comments watch's `else` branch only called `adapter.clearAnchor()` if `currentComment()` returned `undefined` — i.e. it deliberately kept the composer zone/decoration "active" once a matching comment existed, which was the old one-comment-at-a-time display mechanism. With threads now rendering every comment independently, this left an **empty but still fully-reserved** `~280px` composer zone lingering after every acceptance, duplicating the new thread's own reserved space. In one fixture (a long two-line markdown-paragraph comment) this pushed enough content off Monaco's rendered/virtualized line buffer that the pre-existing 2-line anchor decoration lost its second line's DOM node, and (empirically confirmed via debug instrumentation, not guessed) a separate "anchored gap closure" test's gutter-affordance button intermittently failed to appear within the 30s timeout because of the extra async zone-layout churn for two stale/resolved comments sharing an anchor line.
- **Fix:** The composer/comments watch now always calls `adapter.clearAnchor()` once `props.composer` becomes `undefined`, regardless of whether a comment exists at that anchor (accepted comments are shown via their own thread, not via the composer zone). `currentComment()` became dead code after this (its only other call site was already removed in Task 1) and was deleted.
- **Files modified:** `src/web/components/DiffWorkspace.vue`
- **Verification:** `npx playwright test tests/integration/anchored-workspace.spec.ts tests/e2e/rendered-markdown-preview.spec.ts` → all pass (re-verified full 36-test run across all four target specs)
- **Committed in:** `51a8e05`

**2. [Rule 1 - Bug] Hardened `hoverMonacoLine` test helper against an in-flight thread-zone-layout race**
- **Found during:** Task 2, the "anchored gap closure" test timing out (30s) waiting for a gutter "Add comment" button that empirically only failed to appear when two pre-seeded comments shared the same anchor line (doubling the async `createThread`/`growThread` work queued on file load)
- **Issue:** `hoverMonacoLine` issued a single `page.mouse.move()`; if it landed while in-flight thread-zone overlay-widget layout work was still settling, Monaco's hover-affordance computation could end up stuck on stale geometry with nothing to re-trigger it.
- **Fix:** `hoverMonacoLine` now polls, re-issuing the same mouse move until the gutter affordance appears, instead of moving once and relying on Playwright's generic auto-wait.
- **Files modified:** `tests/integration/anchored-workspace.spec.ts`
- **Verification:** `npx playwright test tests/integration/anchored-workspace.spec.ts` → 12/12 pass (previously timed out on this exact test)
- **Committed in:** `b2509ff`

**3. [Rule 3 - Blocking] Adapted "seed via the existing draft-mutation request flow" instruction for `monaco-anchor.spec.ts`'s new tests — no such flow exists in that harness**
- **Found during:** Task 2, writing the two new multi-thread/reconciliation tests
- **Issue:** `monaco-anchor.spec.ts` mounts `MonacoStabilityPrototype.vue` standalone (Plan 23-01's throwaway Monaco-adapter spike) with no server, no `/api/draft/mutations` route, and no `CommentThread.vue`/edit-mode UI — the plan's literal instruction to "seed two comments via the existing draft-mutation request flow already used elsewhere in this file" does not apply to this file (that flow exists in `anchored-workspace.spec.ts`, a different spec).
- **Fix:** Exposed `window.__monacoStabilityThreads.{create,grow,remove}` on the prototype component as direct test-only hooks onto the real `MonacoDiffAdapter.createThread/growThread/removeThread` surface (the same methods `DiffWorkspace.vue`'s `renderThreads()` calls in production), letting the new tests drive real Monaco zone/widget geometry without inventing a mock backend.
- **Files modified:** `src/web/prototypes/MonacoStabilityPrototype.vue`, `tests/integration/monaco-anchor.spec.ts`
- **Verification:** `npx playwright test tests/integration/monaco-anchor.spec.ts` → 14/14 pass including the two new tests
- **Committed in:** `b2509ff`

**4. [Rule 1 - Bug] Generalized `expectPairedZonesAligned` to pair N thread zones by geometry, not creation-order index**
- **Found during:** Task 2, writing the multi-thread alignment test — an index-based `nth(0)`/`nth(1)` pairing attempt produced a false "240px misaligned" failure
- **Issue:** Monaco orders a pane's `.monaco-anchor-zone--thread-spacer` elements by their own `afterLineNumber`, not by `addZone` call order; once two threads' counterpart-side lines crossed over, index-based pairing compared the wrong two zones against each other.
- **Fix:** New `expectAllThreadZonesAligned(page, expectedPairCount)` matches each head-pane zone to its base-pane counterpart by closest top position + matching height (a proper 1:1 geometric pairing) instead of assuming ordinal correspondence.
- **Files modified:** `tests/integration/monaco-anchor.spec.ts`
- **Verification:** real-browser debug script (`node` + `playwright-core` against the dev server) confirmed correct pairing once nearby, mutually-visible line numbers were used; both new tests pass
- **Committed in:** `b2509ff`

---

**Total deviations:** 4 auto-fixed (2 bug fixes surfaced by real-browser testing, 1 blocking harness-capability adaptation, 1 bug fix in new test-helper geometry logic)
**Impact on plan:** All four are direct, necessary consequences of migrating from a single-active-anchor display model to N independently-rendered threads, or of adapting a plan instruction to a test harness that structurally predates draft/comment backends. No scope creep — no production behavior was added beyond what THREAD-01/02/06/08/09 and the plan's own must_haves require; `CommentComposer.vue`'s unsaved-draft rendering path (lines the plan explicitly says "stays completely unchanged") was not touched.

## Issues Encountered
None beyond the deviations documented above — all were found and resolved via real-browser Playwright debugging (temporary `console.log`/`page.on('console')` instrumentation, a standalone Playwright+Vite debug script, and side-by-side baseline comparisons against the pre-plan code via `git show HEAD:<path>`), not source review, matching the plan's own "proven by a real-browser assertion, not source review" standard.

## User Setup Required
None - no external service configuration required.

## Gate Results

- `npx vue-tsc --noEmit --project tsconfig.web.json` (plan-level `<verification>`, same as `npm run typecheck:web`) — **0 errors**.
- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` (runs `build:web` first) — **pass** ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."). No new CSS introduced by this plan.
- `npx vitest run --no-file-parallelism tests/unit` (full unit suite, shared-context gate) — **459 tests passed, 45 test files passed, 0 failed** (no regressions).
- `npx playwright test tests/integration/monaco-anchor.spec.ts tests/integration/anchored-workspace.spec.ts tests/e2e/anchored-review.spec.ts tests/e2e/rendered-markdown-preview.spec.ts` (built runtime, `npm run build` run first) — **36/36 passed**:
  - `tests/integration/monaco-anchor.spec.ts` — 14/14 (12 pre-existing + 2 new: multi-thread alignment, reconciliation DOM-identity stability)
  - `tests/integration/anchored-workspace.spec.ts` — 12/12
  - `tests/e2e/anchored-review.spec.ts` — 5/5 (unmodified — this spec's composer-only locators were untouched by Plan 23-07, confirmed by a full passing run, not assumed)
  - `tests/e2e/rendered-markdown-preview.spec.ts` — 2/2
- `tests/e2e/agent-ready-export.spec.ts` — **not run, not modified**. Plan 23-07's changes are scoped to `DiffWorkspace.vue`'s comment-thread rendering and have no reason to touch default agent-ready-export behavior, per the shared context's explicit instruction.

## Next Phase Readiness
- Plan 23-08 (`App.vue` integration) can bind `DiffWorkspace.vue`'s eight new mutation emits directly to `mutateReview()`/`reviewState` dispatch, pass `collapsedByCommentId`/`editingCommentId`/`commentBuffers` from its own session-scoped collapse map and `reviewDraft.commentBuffers`, and bind `@next-thread`/`@previous-thread` to the real `jumpThread('next'|'previous')` handler built from `thread-order.ts`.
- No blockers for downstream plans.

**Human verification items (visual-only, not automatable from this plan's scope):** none identified — all behavioral claims in this plan's `must_haves` were verified via real-browser Playwright assertions (DOM structure, geometry, focus, DOM-node identity), not left as visual-only checks.

## Self-Check: PASSED
- `src/web/components/DiffWorkspace.vue` — FOUND
- `.planning/phases/23-inline-comment-threads/23-07-SUMMARY.md` — FOUND
- Commit `51a8e05` (feat: keyed diff-and-mount render loop + navigate wiring) — FOUND in git log
- Commit `b2509ff` (test: locator fixes + multi-thread/reconciliation coverage) — FOUND in git log

---
*Phase: 23-inline-comment-threads*
*Completed: 2026-11-05*
