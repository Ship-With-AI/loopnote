---
spike: 002
name: staged-source-discovery
type: comparison
validates: "Given the same repository, when eager discovery is compared with current-branch/worktree-first discovery, then both latency budgets hold without serial per-branch Git calls."
verdict: PARTIAL
related: [001]
tags: [cli, git, performance, search]
---

# Spike 002: Staged Source Discovery

## What This Validates

The CLI can expose the current branch and registered worktrees before branch enumeration, then perform filtered branch lookup and Git-authoritative abbreviation in a constant number of subprocesses.

## Research

No external dependency is needed. The prototype uses Node.js standard-library subprocesses and the installed Git CLI.

| Approach | Git work per search | Result with 10,000 refs |
|----------|---------------------|--------------------------|
| Production eager discovery | One serial `rev-parse --short` per distinct head | 96,109.6 ms before picker |
| `for-each-ref` with short-OID atom | One process | 871.6 ms with loose refs |
| `show-ref` plus batched `git log` abbreviations | Two processes | 847.9 ms with loose refs |
| Filtered `git branch` plus batched `git log` abbreviations | Two processes | 20.4 ms packed; 798.5 ms loose |

**Chosen approach:** staged initial discovery plus filtered `git branch` and one batched `git log --no-walk` abbreviation call. It preserves Git as the source of full and abbreviated object IDs without per-branch subprocesses.

## How to Run

```bash
npm run build:node
node .planning/spikes/002-staged-source-discovery/benchmark.mjs
```

Additional probes:

```bash
node .planning/spikes/002-staged-source-discovery/benchmark.mjs --loose-refs
node .planning/spikes/002-staged-source-discovery/benchmark.mjs --term=branch --runs=3
node .planning/spikes/002-staged-source-discovery/benchmark.mjs --worktrees=32
```

## What to Expect

The default creates 10,000 packed branch refs and four worktrees. The child process loads the production CLI module graph, resolves initial choices, waits for a simulated search term, and reports process-start-to-ready plus search round-trip latency.

## Investigation Trail

1. Initial discovery ran repository/worktree commands eagerly, while worktree status and abbreviation calls ran concurrently. Four worktrees produced five initial choices in ten Git processes.
2. Moving full branch discovery behind the first query reduced picker-ready latency but did not by itself meet the search budget: enumerating 10,000 loose refs took about 800 ms.
3. Removing `%(refname:short)` and `%(objectname:short)` did not remove that loose-ref cost.
4. A filtered `git branch --list --ignore-case` call preserves substring name search. Matching full OIDs are then abbreviated by one `git log --no-walk --stdin` call.
5. Packed refs made the same 10,000-branch query fast. A broad query returning 9,999 branches and a 32-worktree initial set were tested as edge cases.
6. `git pack-refs` fixture setup only. Loopnote must not mutate user's repository obtain results.

## Results

| Scenario | Median picker-ready | Median search | Processes | Budget |
|----------|---------------------|---------------|-----------|--------|
| 10,000 packed refs, 4 worktrees, 100 matches | 149.7 ms | 20.4 ms | 10 initial + 2 search | Pass |
| 10,000 packed refs, 4 worktrees, 9,999 matches | 165.9 ms | 63.8 ms | 10 initial + 2 search | Pass |
| 10,000 packed refs, 32 worktrees | 250.6 ms | 19.7 ms | 66 initial + 2 search | Pass |
| 10,000 loose refs, 4 worktrees, 100 matches | 132.4 ms | 798.5 ms | 10 initial + 2 search | Search fails |

**Verdict: PARTIAL.** Staged discovery decisively fixes time-to-picker and meets both budgets for Git-maintained repositories with packed refs, including broad searches and many worktrees. Git must read thousands of loose ref files before filtering, so the strict 500 ms search guarantee is not achievable for the tested loose-ref case without accepting a background/persistent index, relaxing the budget, or changing repository state. The product must not run `git pack-refs` automatically.
