---
status: testing
phase: 14-uncommitted-source-review-frozen-snapshots
source: [14-VERIFICATION.md]
started: 2026-10-30T23:58:55.185Z
updated: 2026-10-30T23:58:55.185Z
---

## Current Test

number: 1
name: Terminal 'r'-keypress triggers the same refresh as the browser's Refresh button/Alt+Shift+R (D-13)
expected: |
  Attach `cumpa --staged` (or `--unstaged`/`--worktree`) to a real interactive terminal (not piped
  stdin). Externally edit a staged/worktree file after the session launches. Press `r` in the
  terminal. Expect: terminal prints a refresh confirmation and the browser tab's
  RefreshSummaryPanel/worktree-status reflects the new snapshot — identical observable effect to
  clicking the browser's Refresh button or pressing Alt+Shift+R.
awaiting: user response

## Tests

### 1. Terminal 'r'-keypress refresh (D-13)
expected: Terminal 'r' keypress produces the same observable refresh effect as clicking the browser's Refresh button or pressing Alt+Shift+R. `registerUncommittedRefreshKeypress` (src/cli/run.ts) is gated behind `process.stdin.isTTY === true`, which no automated harness in this repository (Playwright's spawned `child_process`, Vitest) can satisfy — the code path is logically identical to the already-proven Alt+Shift+R path once invoked, but has never been exercised by any test, automated or otherwise.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
