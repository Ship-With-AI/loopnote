---
phase: 18-product-repositioning-copy
plan: 02
subsystem: docs
tags: [markdown, positioning-copy, npm-metadata, readme, product-md, vitest, claims-check]

# Dependency graph
requires:
  - phase: 18-product-repositioning-copy
    provides: "18-01's approved `18-COPY-DRAFT.md` (## Approval record) — the sole source of exact copy text this plan applies verbatim"
provides:
  - "Rewritten README.md: agent-produced-artifact tagline, version-agnostic release wording, 2.x skill-acceptance sentence, five short walkthrough examples (committed range, uncommitted flags, standalone files, Markdown toggle, agent request), renamed '## File limits' heading, 'Files' keyboard-shortcut row wording"
  - "Rewritten PRODUCT.md '## Product' paragraph and '## Supplied capabilities' list reflecting Phases 13/14/15/17 shipped capabilities (single-pane rendering, uncommitted/standalone Refresh semantics, agent protocol extension)"
  - "New docs/usage.md: full flags/arguments reference, moved interactive-picker walkthrough, moved browser walkthrough (+ Markdown toggle note), new Standalone-file review and Refresh/snapshot-semantics sections, moved draft-location/export/agent-request-protocol reference"
  - "Updated package.json `description` (approved Variant A) and new `keywords` array"
  - "tests/unit/product-copy-claims.test.ts: D-06 automated claims check reading PRODUCT.md's '## Deliberate non-capabilities' paragraph as its only banned-phrase source"
affects: [18-03-PLAN, 18-04-PLAN, 18-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claims-check test reads PRODUCT.md's non-capabilities paragraph at test time via a local extractBannedPhrases() helper (no hardcoded duplicate phrase list), per D-06"

key-files:
  created:
    - tests/unit/product-copy-claims.test.ts
    - docs/usage.md
    - .planning/phases/18-product-repositioning-copy/18-02-SUMMARY.md
  modified:
    - README.md
    - PRODUCT.md
    - package.json

key-decisions:
  - "README's five D-11 short examples: the draft only supplied literal text for the tagline, release-verification paragraph, skill-version sentence, keyboard-shortcut row, and the agent-request example. The committed-range, --worktree/--staged/--unstaged, standalone-files, and Markdown-toggle short examples were not drafted with literal copy, so I wrote them myself per Task 2's explicit action text, grounded in the actual CLI flag descriptions (src/cli/run.ts) and the shipped Source/Rendered toggle (ActiveFileToolbar.vue) — not invented beyond those facts."
  - "docs/usage.md's new 'Standalone-file review' and 'Refresh and snapshot semantics' sections are original prose (not in the draft, which only outlined their topic), grounded in src/cli/run.ts's `[paths...]` description and REQUIREMENTS.md's SNAP-01..05."
  - "Applied the Approval record's corrections, not the earlier in-body draft text where they differ: npm description/keywords exact wording, the updated (not 'leave unchanged') 2.x skill-version sentence, '## File limits' heading rename, '## Stop Loopnote' staying in README, and docs/usage.md omitting Keyboard-shortcuts/File-limits duplication."
  - "'## Upgrading from Cumpa' left completely untouched (verified byte-identical via git diff) — it is the rename-audit anchor (scripts/audit-rename-exceptions.mjs Category 5) and out of this plan's scope."

patterns-established: []

requirements-completed: [POS-01]

# Metrics
duration: 48min
completed: 2026-11-02
status: complete
---

# Phase 18 Plan 02: Product Repositioning Copy — README/PRODUCT.md/package.json/docs/usage.md Summary

**Applied the approved D-05 copy draft to README.md, PRODUCT.md, and package.json, added a new docs/usage.md reference doc, and shipped the D-06 automated claims-check test (RED before the copy landed, GREEN after).**

## Performance

- **Duration:** 48 min
- **Started:** 2026-11-02T15:28:50.000Z
- **Completed:** 2026-11-02T15:43:18Z
- **Tasks:** 2
- **Files modified:** 5 (3 modified, 2 created, plus this SUMMARY)

## Accomplishments
- README.md now leads with "local review for any agent-produced artifact" and documents all four non-agent review shapes (committed range, uncommitted flags, standalone files, Markdown toggle) plus the agent-request protocol, each as one short example, with the full reference moved to the new docs/usage.md.
- PRODUCT.md's "## Product" paragraph and "## Supplied capabilities" list now name every capability actually shipped by Phases 13/14/15/17 (single-pane rendering for standalone/added/deleted files, uncommitted/standalone Refresh semantics, the agent stdin protocol) instead of the stale pre-Phase-13 baseline.
- tests/unit/product-copy-claims.test.ts automatically enforces that README/npm copy never reintroduces PRODUCT.md's Deliberate non-capabilities phrases, and that the "agent-produced artifact" claim is backed by PRODUCT.md — reading PRODUCT.md fresh every run, never a hardcoded duplicate list.
- package.json gained the approved `description` (Variant A) and a new `keywords` array.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write the failing claims-check test** - `96c2dfc` (test)
2. **Task 2 (GREEN): Apply approved copy + create docs/usage.md** - `c12258e` (feat)

**Plan metadata:** (this commit) `docs: complete 18-02`

## Files Created/Modified
- `tests/unit/product-copy-claims.test.ts` - D-06 claims-check test (3 assertions: banned-phrase absence, agent-produced-artifact backing, keywords presence)
- `README.md` - Repositioned tagline, version-agnostic release wording, 2.x skill-version sentence, five short walkthrough examples, renamed File limits heading, Files-tree shortcut wording
- `PRODUCT.md` - v2.0 Product paragraph and Supplied capabilities list
- `package.json` - `description` (Variant A) and new `keywords` array
- `docs/usage.md` - New full user-facing reference (flags/arguments, starting a review, reviewing in the browser, standalone-file review, Refresh/snapshot semantics, draft location, exporting a review, agent-request protocol)

## Decisions Made
See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wrote the four undrafted README short examples and two undrafted docs/usage.md sections myself**
- **Found during:** Task 2 (applying the approved copy)
- **Issue:** `18-COPY-DRAFT.md`'s "## README rewrite" section only supplied literal text for the tagline, release-verification paragraph, skill-version sentence, keyboard-shortcut row, and the one agent-request short example. It did not draft literal text for the other four D-11-mandated short examples (committed range, `--worktree`/`--staged`/`--unstaged`, standalone files, Markdown toggle) or for docs/usage.md's "Standalone-file review" and "Refresh and snapshot semantics" sections (the outline only named their topics). Task 2's own action text explicitly requires these five short examples and the docs sections to exist.
- **Fix:** Wrote this missing copy myself, grounded strictly in verified facts: `src/cli/run.ts`'s actual `.option()`/`.argument()` descriptions for the flags, `src/web/components/ActiveFileToolbar.vue`'s actual Source/Rendered button labels for the Markdown toggle, and `.planning/REQUIREMENTS.md`'s SNAP-01..05 for Refresh/snapshot semantics — introducing no claim beyond what those files already establish.
- **Files modified:** README.md, docs/usage.md
- **Verification:** `tests/unit/product-copy-claims.test.ts` passes; manual cross-check of flag names/descriptions against `src/cli/run.ts:1459-1463` and toggle labels against `src/web/components/ActiveFileToolbar.vue:110-118`.
- **Committed in:** c12258e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary to satisfy Task 2's own explicit "one example each" requirement and D-11; no scope creep — all new prose is grounded in already-shipped, already-read source facts, not invented capability claims.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- README/PRODUCT.md/package.json/docs/usage.md repositioning is complete and test-enforced (D-06).
- 18-03 (CLI copy: `run.ts`/`picker.ts`/`source.ts`) can proceed; README's short CLI examples (`--worktree`, `--staged`, `--unstaged`, `[paths...]`) already match the current flag descriptions those files define, so no README rework is anticipated from 18-03.
- 18-04/18-05 (web workspace copy, e2e sweep) are unaffected by this plan's file set.

## Self-Check: PASSED

- `tests/unit/product-copy-claims.test.ts` exists on disk and is committed (`96c2dfc`, `c12258e`).
- `docs/usage.md` exists on disk (188 lines; exceeds the plan's `min_lines: 40`).
- `git log --oneline --all --grep="18-02"` returns 2 commits (test, feat).
- All three `<task>`-level `<verify>`/`<done>` criteria re-run and pass (see Verification below).
- Plan-level `<verification>` commands re-run and pass (see Verification below).

## Verification

- `node node_modules/vitest/vitest.mjs run tests/unit/product-copy-claims.test.ts` — 3/3 passed.
- `grep -c 'agent-produced artifact' README.md PRODUCT.md` — README.md:1, PRODUCT.md:1 (each ≥1).
- `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json')).keywords.length)"` — `8` (>0).
- `git diff` on the `## Upgrading from Cumpa` section — no changes (byte-identical to pre-plan README.md).
- `node node_modules/vitest/vitest.mjs run tests/unit/rename-audit.test.ts` — 3/3 passed (0 disallowed `cumpa` hits).
- Full suite: `node node_modules/vitest/vitest.mjs run` — 81 test files, 853 tests, all passed.

---
*Phase: 18-product-repositioning-copy*
*Completed: 2026-11-02*
