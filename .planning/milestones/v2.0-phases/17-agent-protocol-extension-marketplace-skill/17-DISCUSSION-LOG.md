# Phase 17: Agent Protocol Extension & Marketplace Skill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 17-agent-protocol-extension-marketplace-skill
**Areas discussed:** Result & Refresh, Skill & release coupling
**Offered, not selected:** Request shape, Validation errors (Claude's discretion; user confirmed defaults)

---

## Result & Refresh

| Question | Options | Selected |
|---|---|---|
| Provenance after Refresh | Final snapshot + full chain / Final snapshot only | Final snapshot + full chain |
| Stale/orphaned in result | Include, classified / Exclude orphaned | Include, classified |
| Agent edits during review | No special handling / Warn in result | Warn in result |

## Skill & release coupling

| Question | Options | Selected |
|---|---|---|
| Prerequisite | Feature-gated dual support / Hard bump | Hard bump |
| Skill repo handling | Prepare + draft PR, land after release / Mirror copy in cumpa / Issue only | Prepare + draft PR |
| Version | 2.0.0 / 1.x minor | 1.x minor |
| Conflict resolution (hard bump >=2.0.0 vs 1.x minor) | 1.x minor + hard bump to that minor / 2.0.0 + >=2.0.0 / 1.x minor + feature-gated | 1.x minor + hard bump to that minor |

## Claude's Discretion

- Request shape (new modes in schemaVersion 1), export version layout, validation error codes.

## Deferred Ideas

- Release publication and PR merge; feature-gated dual prerequisite.
