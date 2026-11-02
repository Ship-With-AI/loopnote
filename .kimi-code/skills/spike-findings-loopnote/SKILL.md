---
name: spike-findings-loopnote
description: Implementation blueprint from spike experiments. Requirements, proven patterns, and verified knowledge for building Loopnote. Auto-loaded during implementation work.
---

<context>
## Project: Loopnote

Loopnote needs a source picker that remains responsive in repositories with 10,000 local branches by exposing the current branch and registered worktrees before searchable branch discovery.

Spike sessions wrapped: 2026-07-30
</context>

<requirements>
## Requirements

- The ordered source picker must be usable within 400 ms from process start.
- Initial choices use Git state only: the current branch and registered worktrees.
- First branch-search results must appear within 500 ms with 10,000 local branches.
- Branch discovery must not invoke a serial Git subprocess per branch.
- No branch-recency persistence is introduced.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| CLI startup and source discovery | `references/cli-source-discovery.md` | Stage initial Git choices, filter branches on demand, and abbreviate matching OIDs in one batch. |

## Source Files

Original spike source files are preserved in `sources/` for complete reference.
</findings_index>

<metadata>
## Processed Spikes

- 001-large-repo-startup-baseline
- 002-staged-source-discovery
</metadata>
