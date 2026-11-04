---
phase: 17-agent-protocol-extension-marketplace-skill
fixed_at: 2026-10-31T18:28:00Z
review_path: .planning/phases/17-agent-protocol-extension-marketplace-skill/17-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: partial
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-10-31T18:28:00Z
**Source review:** .planning/phases/17-agent-protocol-extension-marketplace-skill/17-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning, per `--fix --auto` default scope — Info findings excluded): 2
- Fixed: 2
- Skipped: 0

`status: partial` reflects that the review's 4 Info-level findings (IN-01 through IN-04) remain unfixed by design — `--fix --auto` without `--all` only fixes Critical/Warning severities. All Critical and Warning findings are fixed.

## Fixed Issues

### CR-01: Working-tree drift flag can violate its own schema invariant, breaking review completion

**Files modified:** `src/server/capabilities.ts`
**Commit:** `5a88942`
**Applied fix:** Applied option (a) from the review's fix guidance. Removed the repo-global `.git/index` mtime/size check (`indexChanged`) from `collectWorkingTreeDrift()`'s returned `changed` flag in both `createUncommittedCapabilityRegistry` and `createStandaloneCapabilityRegistry`. `changed` is now derived solely from `changedPaths.length > 0`. The per-reviewed-file `lstat` comparison loop (unchanged) already detects every on-disk mutation of files under review, so no real detection capability was lost — only the false-positive signal from unrelated Git index activity (e.g. an unrelated `git add`/`reset`/`commit` during the agent's review session) was removed. The schema-violating `{changed: true, paths: []}` shape is now structurally unreachable from this function, so `buildReviewExportV5`/`buildReviewExportV6`'s `WorkingTreeDriftFlagSchema.parse` can no longer throw on this path. Verified: `npx tsc --noEmit --project tsconfig.json` clean.

### WR-01: "round-trips frozen" tests gate their real assertions behind an unchecked mode branch

**Files modified:** `tests/unit/agent-request.test.ts`
**Commit:** `d2af3d6`
**Applied fix:** Added `expect(request.mode).toBe('uncommitted')` / `expect(request.mode).toBe('files')` immediately before each existing `if (request.mode === '...')` branch in the two new "round-trips frozen" tests, exactly as the review's fix suggestion specified. A future mode regression now fails the explicit assertion instead of silently skipping the per-mode freeze checks. Verified: `node node_modules/vitest/vitest.mjs run tests/unit/agent-request.test.ts` — 14/14 passed. `npm run typecheck:tests:node` clean.

## Skipped Issues

None — both in-scope findings were fixed.

## Not In Scope (Info-level, not auto-fixed)

Per `--fix --auto` default scope (`critical_warning`, not `all`), the following Info findings from 17-REVIEW.md were intentionally left unfixed. They are non-blocking maintainability nits, not correctness/security defects:

- **IN-01** — Redundant re-derivation of the `standalone` condition in `render-review-markdown.ts`.
- **IN-02** — Working-tree-drift Markdown rendering duplicated between V5/V6 branches in `render-review-markdown.ts`.
- **IN-03** — `collectWorkingTreeDrift` duplicated verbatim across both registries (and overlaps `worktreeChangeIndicator`) in `capabilities.ts`.
- **IN-04** — Fixed 500ms "no further output" wait duplicated across two new e2e tests in `agent-ready-export.spec.ts`.

---

_Fixed: 2026-10-31T18:28:00Z_
_Fixer: Exec17 (acting as gsd-code-fixer), main-checkout mode (no worktree isolation per `workflow.use_worktrees: false`)_
_Iteration: 1_
