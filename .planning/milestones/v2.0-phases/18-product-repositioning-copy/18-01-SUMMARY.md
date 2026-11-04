---
phase: 18-product-repositioning-copy
plan: 01
subsystem: docs
tags: [markdown, positioning-copy, npm-metadata, readme, product-md, cli-copy, approval-checkpoint]

# Dependency graph
requires:
  - phase: 17.1-full-project-rename
    provides: "Final product identity (Loopnote, @shipwithai/loopnote, loopnote bin, .loopnote/) that this draft's copy is written against"
provides:
  - "18-COPY-DRAFT.md: single approved source of exact copy text (README, PRODUCT.md, package.json description/keywords, CLI strings, docs/usage.md outline, browser tab-title/empty-state copy) for Plans 18-02/18-03/18-04 to apply verbatim"
  - "Resolved '## Approval record' with every discretionary decision recorded as a verbatim string, not a loose preference"
affects: [18-02-PLAN, 18-03-PLAN, 18-04-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/18-product-repositioning-copy/18-01-SUMMARY.md
  modified:
    - .planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md

key-decisions:
  - "npm description: Variant A verbatim — 'Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files'."
  - "npm keywords: confirmed as drafted including 'markdown-review'; corrected the draft's inaccurate note — Phase 16's rendered Markdown preview shipped and passed verification, so the keyword is a true shipped-capability term, not merely 'not a false claim'."
  - "README 'Only 1.5.0 has independent release verification' sentence: replaced (not left unchanged) with the 2.x contract matching the bundled skill — 'The skill accepts stable Loopnote versions >=2.0.0 <3.0.0 and rejects prereleases.' — dropping the old clause entirely since the skill itself records no 2.x verification yet."
  - "README '## v1 file limits' heading renamed to '## File limits' (D-12 version-agnostic wording)."
  - "README '## Stop Loopnote' section stays in README, not moved to docs/usage.md."
  - "docs/usage.md will not duplicate README's Keyboard shortcuts or File limits sections."
  - "Uncommitted empty-state copy follows D-10's dynamic pattern 'No changes in {Working tree|Staged|Unstaged}. Edit files, then Refresh.' for all three uncommitted sources (staged/unstaged/worktree), not only worktree as originally drafted — each uses its own dynamic source label."
  - "Browser tab titles confirmed as drafted: 'Exact patch' segment for exact-patch sessions, '{N} files' segment for pinned comparisons, per D-09."
  - "No new name story (D-13) — none wanted."

requirements-completed: [POS-01, POS-02, POS-03]

# Metrics
duration: 25min
completed: 2026-11-02
status: complete
---

# Phase 18: Product Repositioning Copy Summary (Plan 01)

**Human-approved every discretionary copy decision for Phase 18 and recorded verbatim strings in 18-COPY-DRAFT.md's Approval record, unblocking Plans 18-02/18-03/18-04 to apply them to README/PRODUCT.md/package.json/CLI/web source.**

## Performance

- **Duration:** ~25 min (Task 2 continuation; Task 1 drafting was a prior commit)
- **Completed:** 2026-11-02
- **Tasks:** 1 (Task 2: checkpoint resolution — Task 1 was already committed as `2fc3ede`)
- **Files modified:** 1 (`18-COPY-DRAFT.md`)

## Accomplishments
- Filled 18-COPY-DRAFT.md's `## Approval record` with every decision from the human's 2026-11-02 checkpoint response as a verbatim string (not a loose preference), per the plan's own contract that apply plans read this section literally.
- Corrected a factual error the draft inherited from a stale `.planning/REQUIREMENTS.md` checkbox state: Phase 16 (rendered Markdown preview) has in fact shipped and passed verification (confirmed via Phase 16 commit history and SUMMARY frontmatter `status: complete`), so the `"markdown-review"` npm keyword is an accurate shipped-capability term. Fixed both the npm-keywords section's note and the top-of-file "Claims boundary" paragraph that made the same stale claim.
- Updated the README's skill version-acceptance sentence to the real 2.x contract (`>=2.0.0 <3.0.0`) by reading the bundled `.kimi-code/skills/loopnote/SKILL.md`, rather than leaving the stale 1.x range as originally proposed.
- Extended the D-10 uncommitted empty-state pattern from the originally-drafted "worktree only" row to all three uncommitted sources (staged/unstaged/worktree), each with its own dynamic source-name label, per the human's explicit correction.

## Task Commits

1. **Task 1: Write the copy draft** - `2fc3ede` (docs) — completed by a prior agent before this continuation.
2. **Task 2: Approve the copy draft** - `c0e9770` (docs) — human-approval checkpoint resolved; Approval record filled with verbatim decisions; draft body corrected for items 2 (npm keywords/Phase 16 status), 6 (skill version sentence), and 10 (uncommitted empty-state dynamic labels).

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `.planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md` - Approval record filled with verbatim human decisions; corrected Phase 16 shipped-status claims (top-of-file Claims boundary + npm-keywords note); updated README skill version-acceptance sentence to the 2.x contract; extended D-10 empty-state pattern to all three uncommitted sources.
- `.planning/phases/18-product-repositioning-copy/18-01-SUMMARY.md` - this file.

## Decisions Made
See `key-decisions` in frontmatter above — all ten items from the human's 2026-11-02 approval response, recorded verbatim in the draft's Approval record.

## Deviations from Plan

### Auto-fixed Issues

**1. [Ground-truth correction] Phase 16 shipped-status claim**
- **Found during:** Task 2 (applying item 2 of the human's approval — "markdown-review is accurate: Phase 16 rendered Markdown preview shipped and passed verification")
- **Issue:** The draft (Task 1) stated, in two places (top-of-file "Claims boundary" and the npm-keywords section's note), that "Phase 16 ... hasn't shipped" / "is still Pending per .planning/REQUIREMENTS.md" — sourced from REQUIREMENTS.md's unticked MDV-01..04 checkboxes, which are stale relative to actual repo history.
- **Fix:** Verified via `git log` (Phase 16 commits through `aaf588d`, 16-final-checks) and `16-01-SUMMARY.md`/`16-02-SUMMARY.md` frontmatter (`status: complete`) that Phase 16 is in fact shipped and verified. Corrected both draft passages to state Phase 16 has shipped and passed verification, while noting the `.planning/REQUIREMENTS.md` checkboxes are stale (out of this plan's scope to fix).
- **Files modified:** `18-COPY-DRAFT.md` (lines in "Claims boundary" preamble and "## npm keywords" section)
- **Verification:** Cross-checked `git log --oneline --all | grep 16-` and `16-01-SUMMARY.md`/`16-02-SUMMARY.md` `status: complete` frontmatter directly.
- **Committed in:** `c0e9770` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (ground-truth correction, required by the human's explicit instruction to fix the stale claim).
**Impact on plan:** Necessary correction so the approved draft doesn't carry forward a factual error into Plans 18-02/18-03/18-04. No scope creep — PRODUCT.md's "Supplied capabilities" bullet list (a separate, unrequested surface) was deliberately left untouched since the human's approval didn't ask for a new Markdown-toggle capability claim there.

## Issues Encountered
None beyond the above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `18-COPY-DRAFT.md` is fully approved; Plans 18-02 (README/PRODUCT.md/package.json), 18-03 (CLI copy + tests), and 18-04 (browser/web copy) can now start — their blocking dependency on this plan's checkpoint is resolved.
- No blockers identified for the sibling apply plans.

---
*Phase: 18-product-repositioning-copy*
*Completed: 2026-11-02*
