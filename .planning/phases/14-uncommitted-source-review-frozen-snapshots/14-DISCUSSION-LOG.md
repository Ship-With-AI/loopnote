# Phase 14: Uncommitted Source Review & Frozen Snapshots - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 14-uncommitted-source-review-frozen-snapshots
**Areas discussed:** Picking the source, Unstaged vs Base semantics, Torn capture & change notice, Refresh & reclassification UX, Draft & snapshot lifecycle

---

## Picking the source

| Question | Options | Selected |
|---|---|---|
| Picker order | Head-first for uncommitted / Keep Base→Head, rows in Head / Mode prompt first | Head-first for uncommitted |
| CLI flags | --staged/--unstaged/--worktree [--base] / Picker only this phase | Flags |
| No changes | Disable row with reason / Allow, open empty session / Warn and exit | Allow, open empty session |
| Other worktrees | Current worktree only / Any registered worktree | Current worktree only |

## Unstaged vs Base semantics

| Question | Options | Selected |
|---|---|---|
| Unstaged + non-HEAD Base | Always index→worktree / Base swaps left side / Fixed Index row | Always index→worktree |
| Left side with Base X | merge-base(X, HEAD) / X's tip | merge-base(X, HEAD) |
| Untracked in Unstaged | Working tree only / Unstaged too | Working tree only |
| intent-to-add etc. | Follow git diff exactly / You decide | Follow git diff exactly |

## Torn capture & change notice

| Question | Options | Selected |
|---|---|---|
| File changes during capture | Retry then mark / Mark immediately / Fail launch | Retry then mark |
| Detection scope | Per file + file set / Per file only / You decide | Per file + file set |
| Index race | Index checksum before/after / No | Index checksum before/after |
| Notice placement | Row + header + banner / Row + header only | Row + header + banner |

## Refresh & reclassification UX

| Question | Options | Selected |
|---|---|---|
| Refresh location | Toolbar button / Toolbar + CLI key | Toolbar + CLI key |
| Nudge | Passive indicator / Manual only | Passive indicator |
| Summary | Panel + tree markers / Panel only / Toast + markers | Panel + tree markers |
| Comments | Reuse stale/orphaned UI / Add filter | Reuse stale/orphaned UI |
| Open composer | Block with confirm / Auto-save then refresh | Auto-save then refresh |

## Draft & snapshot lifecycle

| Question | Options | Selected |
|---|---|---|
| Draft after Refresh | One draft + snapshot chain / New draft per snapshot | One draft + snapshot chain |
| Relaunch, different content | Fresh if digest differs / Offer recovery of latest | Offer recovery of latest |
| Retention | Keep while referenced / Keep last N / You decide | Keep while referenced |
| Storage | Files under .cumpa/ / Git objects / You decide | Files under .cumpa/ |

**Notes:** WTREE-05 interpretation confirmed: recovery on relaunch creates a new draft (copied + reclassified comments); only in-session Refresh extends a draft's snapshot chain.

## Claude's Discretion

- Retry count/back-off, polling interval, browser Refresh shortcut, snapshot manifest reuse vs new version.

## Deferred Ideas

- Uncommitted sources for other registered worktrees.
