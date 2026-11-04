# Phase 13: Single-Pane File Rendering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 13-single-pane-file-rendering
**Areas discussed:** Pane mechanics, Which files qualify, Single-pane marker, Side identity & comments

---

## Pane mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Single Monaco editor | New createEditor path; clean full width; comment wiring must accept plain ICodeEditor | ✓ |
| Diff editor, inline mode | renderSideBySide:false; reuses wiring but keeps diff chrome | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| No tint, neutral | Reads like a normal file; meaning from header/marker | ✓ |
| Subtle tint + gutter sign | GitHub-like added/removed background and +/- | |
| Gutter sign only | +/- without tint | |

| Option | Description | Selected |
|--------|-------------|----------|
| That side's numbers only | One column matching anchor side | ✓ |
| Both columns, one blank | Unified-view style | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hide diff-only controls | Hide next/prev change, region expand | ✓ |
| Keep, disabled | Stable layout | |
| You decide | | |

---

## Which files qualify

| Option | Description | Selected |
|--------|-------------|----------|
| Only added + deleted | Exactly PANE-01/02 | |
| Also type-changed | Beyond requirement wording | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Head only, Base noted | Full-width Head; header notes Base kind | ✓ |
| Base/Head toggle | Switch between sides | |
| Only if one side is non-text | Text both sides stays side-by-side | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single pane + empty notice | 'Empty file (0 bytes)' notice | ✓ |
| Blank single pane | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as today | Non-reviewable placeholder, no marker | ✓ |
| Marker too, placeholder in pane | | |

---

## Single-pane marker

| Option | Description | Selected |
|--------|-------------|----------|
| Badge letter is enough + label | Extend hidden label only | ✓ |
| Add layout glyph | New icon column | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Text: 'Added · Head only' | | |
| StatusBadge + layout glyph | | |
| Both | StatusBadge + text | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| No, default stays unlabeled | | ✓ |
| Yes, 'Base ↔ Head' | | |

---

## Side identity & comments

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse side label strip | One full-width side label | ✓ |
| Header text only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same as side-by-side | | |
| Always show side chip | | |
| You decide | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| No export change | | ✓ |
| Add layout hint in Markdown only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, identical | Range selection parity with diff side | ✓ |
| You decide | | |

---

## Claude's Discretion

- Composer side display: existing `· Base/Head line N` retained unless side is implicit elsewhere.
- Adapter module placement and editor reuse/disposal across layout switches.

## Deferred Ideas

None.
