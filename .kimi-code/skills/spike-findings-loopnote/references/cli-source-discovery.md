# CLI Startup and Source Discovery

## Requirements

- Make the ordered source picker usable within 400 ms from process start.
- Populate initial choices only from Git's current branch and registered worktrees.
- Return the first branch-search results within 500 ms for 10,000 local branches.
- Never run a serial Git subprocess per branch.
- Do not add branch-recency persistence.

## How to Build It

1. Split source discovery into two stages:
   - Before the prompt: resolve the repository root, current branch, and `git worktree list --porcelain -z` records.
   - After the user enters a search term: query matching local branches.
2. Resolve worktree status and 12-character OID abbreviations concurrently. Keep unavailable, bare, or prunable worktrees visible but unavailable.
3. Escape Git branch glob metacharacters (`\\`, `*`, `?`, `[`, `]`) in the search term, then invoke one filtered command:

   ```js
   await git([
     'branch',
     '--list',
     '--ignore-case',
     `*${escapeBranchPattern(term)}*`,
     '--format=%(objectname) %(refname)',
   ], root);
   ```

4. Parse full OIDs and ref names, deduplicate matching OIDs, and ask Git to abbreviate all matches in one subprocess:

   ```js
   await git([
     'log',
     '--no-walk=unsorted',
     '--abbrev=12',
     '--format=%H%x00%h%x00',
     '--stdin',
   ], root, `${uniqueOids.join('\n')}\n`);
   ```

5. Treat missing abbreviations as an explicit error rather than returning inconsistent candidate metadata.
6. Preserve Git as the authority for worktrees, refs, full OIDs, abbreviated OIDs, and dirty state.
7. Verify with 10,000 distinct branch-head commits. Build those commits with one `git fast-import` process, keep fixture creation outside measured intervals, measure from a parent process, and report elapsed time plus Git subprocess counts.
8. Exercise at least these benchmark cases: 100 matches, a broad query returning nearly every branch, 32 worktrees, and 10,000 loose refs.

## What to Avoid

- Do not retain eager branch enumeration followed by one `rev-parse --short=12` call per distinct head. It took 96,109.6 ms and 10,020 Git processes at 10,000 branches.
- Do not merely move the existing eager algorithm behind the first keystroke; that moves the delay into search.
- Do not enumerate every ref with `for-each-ref` or `show-ref` before filtering when low search latency matters. Both remained around 850 ms with 10,000 loose refs.
- Do not run `git pack-refs` in a user's repository to make discovery faster. Packing is fixture setup only.
- Do not add a branch-recency cache or persistent index unless product requirements explicitly change.

## Constraints

- The staged design reached a 149.7 ms picker-ready median and 20.4 ms search median with 10,000 packed refs, four worktrees, and 100 matches.
- A broad 9,999-match query reached 63.8 ms search median; 32 worktrees reached 250.6 ms picker-ready median.
- The same filtered search took 798.5 ms with 10,000 loose refs. The strict 500 ms search requirement is therefore unproven for that repository state.
- Meeting 500 ms for pathological loose refs requires a background or persistent index, a relaxed budget, or repository mutation. The spikes rejected repository mutation and did not authorize persistence.
- Initial worktree metadata still scales with worktree count, but concurrent resolution kept the tested 32-worktree case within the picker budget.

## Origin

Synthesized from spikes: 001, 002
Source files available in: `sources/001-large-repo-startup-baseline/`, `sources/002-staged-source-discovery/`
