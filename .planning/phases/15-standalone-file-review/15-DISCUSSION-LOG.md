# Phase 15: Standalone File Review - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 15-standalone-file-review
**Areas discussed:** Changed files in standalone
**Areas offered but not selected:** Argument matching, Positional args vs other modes, Session identity & export (written as Claude's discretion; user confirmed defaults)

---

## Changed files in standalone

| Question | Options | Selected |
|---|---|---|
| File with uncommitted changes | Current content only / Content + diff toggle / Content + change gutter | Current content only |
| Git state label | Yes, text label / No | Yes, text label |
| Content source with staged+unstaged | Working-tree bytes / --staged flag | Working-tree bytes |

## Claude's Discretion

- Argument matching (directory recursion, explicitly-named ignored files error, caps, in-repo symlinks non-reviewable)
- Mode exclusivity with Phase 14 flags (error)
- Session identity + Refresh re-resolution of arguments
- Export provenance shape

## Deferred Ideas

- Diff toggle/change gutter for standalone; index-content standalone review; force-include ignored files.
