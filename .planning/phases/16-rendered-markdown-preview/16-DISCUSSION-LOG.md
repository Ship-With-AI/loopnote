# Phase 16: Rendered Markdown Preview - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 16-rendered-markdown-preview
**Areas discussed:** Diff in rendered side-by-side, Commenting on blocks, Images & external content
**Offered, not selected:** Toggle & default view (Claude's discretion; user confirmed defaults)

---

## Diff in rendered side-by-side

| Question | Options | Selected |
|---|---|---|
| What renders | Both rendered + block markers / Both rendered, no markers / Head rendered only | Both rendered + block markers |
| Scroll sync | Block-aligned / Independent / You decide | You decide |
| Marker style | Left rule + text tag / Tint + text tag | Left rule + text tag |

## Commenting on blocks

| Question | Options | Selected |
|---|---|---|
| Trigger | Hover/focus '+' / Click-select then Comment | Hover/focus '+' |
| Granularity | Smallest mapped block / Top-level only | Smallest mapped block |
| Multi-block | No / Shift-click range | No |
| Thread display | Count badge + expand / Always inline | Always inline |
| Side in SBS | Side follows pane / Head only | Side follows pane |

## Images & external content

| Question | Options | Selected |
|---|---|---|
| Images | Relative repo only / None / Relative + remote | Relative repo only |
| Links | Same as summary renderer / Relative links jump in-session | Same as summary renderer |
| Extensions | GFM tables + task lists, rest code / + Mermaid / CommonMark only | GFM tables + task lists |
| Which files | .md/.markdown/.mdx / .md and .markdown only | .md and .markdown only |

## Claude's Discretion

- Toggle placement/default (source default, per-file session toggle), scroll sync, plugin choice.

## Deferred Ideas

- Mermaid, math, relative-link navigation, .mdx, multi-block selection, remote images.
