---
phase: 17-agent-protocol-extension-marketplace-skill
plan: 05
subsystem: marketplace-skill
tags: [skill, cumpa, version-gate, npm-pack]

# Dependency graph
requires:
  - phase: 17-agent-protocol-extension-marketplace-skill
    provides: "17-01's mode:'uncommitted'/mode:'files' request schema field names, 17-04's end-to-end dispatch proving those modes work against the installed CLI"
provides:
  - "ShipWithAI skills repo local branch `cumpa-uncommitted-files-request-modes` documenting the two new request modes and bumping the CLI version gate to >=2.0.0 <3.0.0"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Marketplace skill version-gate regex has no minor-floor sub-condition once the accepted major line's first release (2.0.0) is itself the floor"

key-files:
  created: []
  modified:
    - /Users/alessandro/projects/shipwithai-skills/skills/cumpa/SKILL.md
    - /Users/alessandro/projects/shipwithai-skills/skills/cumpa/scripts/check-cumpa.mjs

key-decisions:
  - "Branched off shipwithai-skills' local `main` (verified byte-identical to origin/main) rather than the pre-existing checked-out `skill/write-it-down` branch, since the plan requires branching off the current default branch and that branch carries unrelated local commits"
  - "Verified the version gate end-to-end by temporarily bumping diff-review's own package.json to 2.0.0, packing a development-check runtime artifact, installing it into an isolated npm global prefix, and running check-cumpa.mjs against it — then reverting package.json to zero residual diff. No npm registry was touched; the 2.0.0 tarball was never published."
  - "Negative control used a small local shell shim printing `2.0.0-dev` for `cumpa --version` rather than repacking a second tarball, per the plan's explicit guidance"

requirements-completed: [SKL-04]

# Metrics
duration: 35min
completed: 2026-10-31
status: complete
---

# Phase 17 Plan 5: Marketplace skill uncommitted/files modes + version-gate bump Summary

**ShipWithAI skills repo's `cumpa` skill now documents `mode:'uncommitted'`/`mode:'files'` JSON request examples and requires a stable Cumpa `>=2.0.0 <3.0.0`, committed to a local-only branch and verified end-to-end against a locally packed (never-published) `cumpa@2.0.0` tarball — GSD execution stops here per the plan's `autonomous: false` checkpoint.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-31 (after 17-04 completion)
- **Completed:** 2026-10-31
- **Tasks:** 2 of 3 fully automated (Task 1, Task 2); Task 3 is a `checkpoint:human-action` — its automatable portion (local commit) was executed, its genuinely human portion (opening the draft PR) is reported below per the checkpoint protocol, not performed.
- **Files modified:** 2 (in the separate `shipwithai-skills` repository)

## Accomplishments
- Added a new `## Native uncommitted and files modes` section to `SKILL.md`, mirroring the existing `## Native exact-patch mode` section's three-part shape (guidance sentence, fenced JSON examples, field-semantics note), using the exact field names from Plan 17-01's `AgentReviewRequestSchema` (`uncommitted.source`/`.base`/`.pathspecs`, `files.paths`).
- Bumped `## Requirements`'s stable-version prerequisite from `>=1.5.0 <2.0.0` to `>=2.0.0 <3.0.0` and the step-1 install guidance from `@shipwithai/cumpa@1.5.0` to `@shipwithai/cumpa@2.0.0`; replaced the sentence asserting independent verification of 1.5.0 with wording that makes no claim about any unreleased 2.x version.
- Made the `## Protocol invariants` "committed worktree `HEAD`" bullet mode-conditional: revisions/exact-patch requests review committed `HEAD`, while uncommitted/files requests explicitly review the current on-disk worktree.
- Bumped `check-cumpa.mjs`'s version-acceptance regex from the `1.x` pattern (with its `>= '5'` minor floor) to a floorless `2.x.y` pattern, and updated the stderr install-guidance string to `@shipwithai/cumpa@2.0.0`. The `spawnSync` probe mechanics (timeout, `shell: false`, `killSignal`, `maxBuffer`, swallow-and-fall-through `catch`) are unchanged.
- Verified the new gate end-to-end: temporarily set `diff-review`'s own `package.json` version to `2.0.0`, ran `npm run pack:runtime-artifact -- --purpose development-check ...`, installed the resulting tarball into an isolated `npm install --global --prefix` sandbox, and ran the edited `check-cumpa.mjs` against it — it printed `2.0.0` and exited `0`. A local shell shim printing `2.0.0-dev` for `cumpa --version` was rejected (exit `1`, updated guidance on stderr), proving the prerelease rejection still works. `diff-review`'s `package.json` was reverted to `1.6.1` with zero residual `git diff`.
- Created a local, unpushed branch `cumpa-uncommitted-files-request-modes` in `/Users/alessandro/projects/shipwithai-skills` off a verified-clean `main` and committed both files to it.

## Task Commits

This plan modifies a *separate* repository (`/Users/alessandro/projects/shipwithai-skills`), not `diff-review`, so there are no `diff-review` task commits — the single commit lives on the skills repo's local branch:

1. **Task 1 (SKILL.md + check-cumpa.mjs edits) + Task 3 (commit)** — `065045c` on branch `cumpa-uncommitted-files-request-modes` in `/Users/alessandro/projects/shipwithai-skills`: `feat(cumpa): add uncommitted/files request modes, bump CLI prerequisite to >=2.0.0 <3.0.0`
2. **Task 2 (tarball verification)** — no commit; this task's changes (temporary `diff-review/package.json` version bump) were reverted to zero residual diff as the task itself requires, and the packed tarball/evidence/install-prefix were throwaway temp-directory artifacts, deleted after verification.

**Plan metadata:** this `17-05-SUMMARY.md` + `STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md` updates, committed in `diff-review`.

**Diff stat (skills repo, `main` vs `cumpa-uncommitted-files-request-modes`):**
```
skills/cumpa/SKILL.md                | 22 ++++++++++++++++++----
skills/cumpa/scripts/check-cumpa.mjs |  6 +++---
2 files changed, 21 insertions(+), 7 deletions(-)
```

## Files Created/Modified
- `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/SKILL.md` — new uncommitted/files mode section, bumped version prerequisite and install guidance, mode-conditional protocol invariant
- `/Users/alessandro/projects/shipwithai-skills/skills/cumpa/scripts/check-cumpa.mjs` — version-gate regex bumped to floorless `2.x.y`, install guidance updated

## Decisions Made
See `key-decisions` in frontmatter.

## Deviations from Plan

None - plan executed exactly as written, including the editorial fix of removing a transient duplicate `if` line introduced by an intermediate edit step (caught immediately by a `node --check` syntax verification before proceeding, not a plan deviation — no behavior was ever shipped in the broken intermediate state).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## CHECKPOINT REACHED (Task 3, `checkpoint:human-action`, `gate="blocking"`)

**Type:** human-action
**Plan:** 17-05
**Progress:** 3/3 tasks complete through the automatable portion; the final human action is explicitly out of scope for GSD execution.

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create local skills-repo branch and write uncommitted/files skill update | `065045c` (committed as part of Task 3) | `skills/cumpa/SKILL.md`, `skills/cumpa/scripts/check-cumpa.mjs` |
| 2 | Build local 2.0.0 tarball, prove check-cumpa.mjs accepts it end-to-end | n/a (verification-only; `diff-review/package.json` reverted, zero residual diff) | — |
| 3 | Commit the skill update to the local branch | `065045c` | `skills/cumpa/SKILL.md`, `skills/cumpa/scripts/check-cumpa.mjs` |

### Current Task

**Task 3's remaining action (not performed):** Open a draft PR against `Ship-With-AI/skills` from branch `cumpa-uncommitted-files-request-modes`.
**Status:** awaiting human action
**Blocked by:** D-05 — PR opening is deliberately a human-only action with no CLI shortcut; this plan's `autonomous: false` frontmatter and the checkpoint's own instructions explicitly forbid any `git push` or remote mutation against `Ship-With-AI/skills`.

### Checkpoint Details

A local, unpushed branch `cumpa-uncommitted-files-request-modes` exists in `/Users/alessandro/projects/shipwithai-skills` with one commit (`065045c`) containing the uncommitted/files mode documentation and the `>=2.0.0 <3.0.0` version-gate bump, verified end-to-end against a locally packed (never-published) `cumpa@2.0.0` tarball. The branch has no remote-tracking ref (`git for-each-ref` shows an empty upstream) and `git status` reports a clean working tree with nothing to push.

### Awaiting

Per the plan's `<resume-signal>` verbatim: "This phase's automated work stops here (`autonomous: false`). Once the real Cumpa `2.0.0`-equivalent release publishes (outside GSD execution, per D-05), open the draft PR against `Ship-With-AI/skills` manually from this local branch. Do not resume automated execution of this plan to open the PR — that step is a genuine human-only action with no CLI shortcut."

## Next Phase Readiness
Phase 17's five plans are all complete (17-01 through 17-05). The skills-repo branch is staged and ready for a human to open a draft PR once a real Cumpa 2.0.0-equivalent release publishes. No blockers for Phase 17 verification/review/security gates.

---
*Phase: 17-agent-protocol-extension-marketplace-skill*
*Completed: 2026-10-31*

## Self-Check: PASSED
