---
spike: 001
name: large-repo-startup-baseline
type: standard
validates: "Given 10,000 local branches, when the current CLI reaches its picker, then fixed and scaled latency plus Git subprocess counts are measured separately."
verdict: VALIDATED
related: [002]
tags: [cli, git, performance]
---

# Spike 001: Large-Repository Startup Baseline

## What This Validates

A generated Git repository with distinct branch-head commits can expose fixed CLI startup cost separately from source-discovery work that scales with branch count.

## How to Run

```bash
npm run build:node
node .planning/spikes/001-large-repo-startup-baseline/benchmark.mjs
```

Optional controls: `--branches=N`, `--worktrees=N`, and `--runs=N`.

## What to Expect

The script creates a temporary repository using one `git fast-import` process, measures process start through entry into `runCli`'s picker dependency, prints JSON, and deletes the fixture.

## Investigation Trail

1. A 10,000-branch fixture was initially considered with one shared commit. That would hide the current abbreviation loop because its OID cache collapses identical heads.
2. The fixture instead creates 10,000 distinct commit objects and branch heads with `git fast-import`, keeping setup outside the measured interval.
3. Measurements used four total worktrees and three runs at 1, 1,000, and 10,000 branches.
4. `runCli` used the production `discoverSourceCandidates`; only the picker was injected to stop at the first interactive boundary. A counting wrapper recorded actual Git-runner calls.

## Results

| Branches | Worktrees | Median picker-ready | Git processes | 400 ms budget |
|----------|-----------|---------------------|---------------|---------------|
| 1 | 4 | 364.0 ms | 21 | Pass |
| 1,000 | 4 | 10,207.7 ms | 1,020 | Fail |
| 10,000 | 4 | 96,109.6 ms | 10,020 | Fail |

**Verdict: VALIDATED.** The benchmark isolates a fixed startup near the target and an approximately linear branch-head penalty. Every additional distinct branch head adds one serial `rev-parse --short=12` subprocess. The 10,000-branch case misses the picker budget by roughly 240×; loading branches lazily without removing per-head subprocesses would merely move that delay into search.
