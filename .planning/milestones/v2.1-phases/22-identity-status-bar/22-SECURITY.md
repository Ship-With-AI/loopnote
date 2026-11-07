---
phase: 22
slug: identity-status-bar
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-05
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Git repository / worktree → `IdentityPill.vue` / `IdentityPopover.vue` | Ref names, branch labels, and worktree paths originate from the local Git repository and filesystem and can contain arbitrary bytes, including control characters, before this phase's components render them. | Display text (ref names, paths) |
| Browser (caller) → `truncateMiddle` | Caller-supplied `text` can originate from a Git ref name or worktree path, which can contain arbitrary Unicode including control characters; `max` is always a caller-supplied literal, never user input. | Display text, numeric literal |
| Reviewer (DOM) → `IdentityPopover.vue`'s outside-click/Escape listeners | A `document`-level `mousedown` listener is attached for the popover's lifetime. | DOM pointer events |
| `App.vue`'s already-authorized session/comment state → `StatusBar.vue` | No new trust boundary crossing: `statusbarIdentifier`/`staleCommentCount` are pure derivations over data already fetched and already rendered elsewhere (session digest/SHA, comment statuses). | Session digest/SHA, comment counts |
| None new (plan 22-04) | Playwright test assertions only — no new source code, data flow, or trust boundary. | — |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-22-01 | Denial of Service (crash-adjacent) | `truncateMiddle` | mitigate | `max < 1` and empty-string guards; never throws; no loop (single linear slice/join) — verified `src/domain/truncate-middle.ts:2-14` | closed |
| T-22-02 | Information Disclosure | `truncateMiddle` | accept | Truncates already-authorized display text only; no escaping/new exposure; `controlSafeDisplay` always applied by caller first — verified `IdentityPill.vue:155-158` | closed |
| T-22-03 | Denial of Service (resource leak) | `IdentityPopover.vue` outside-click `mousedown` listener | mitigate | Added in `onMounted`, removed in `onBeforeUnmount`, paired with `v-if="popoverOpen"` mount/unmount — verified `IdentityPopover.vue:216-224`, `IdentityPill.vue:259` | closed |
| T-22-04 | Tampering / Injection | Every interpolated ref/label/path string in `IdentityPill.vue`/`IdentityPopover.vue` | mitigate | Every string wrapped `controlSafeDisplay()` before `truncateMiddle()`; zero `v-html`; `{{ }}` interpolation only — verified `IdentityPill.vue:155-158,160-161,183,194`, `IdentityPopover.vue:65-124` | closed |
| T-22-05 | Information Disclosure | `IdentityPopover.vue` Patch digest / Snapshot rows | accept | Renders already-authorized `SessionResponse` content (content-addressed hashes), same value already sent to client elsewhere — verified `IdentityPopover.vue:65-124` | closed |
| T-22-06 | Repudiation (none applicable) | — | accept | No new audit-relevant action; `writeText`/Refresh match pre-existing precedent (`CopyButton.vue`, `DraftRecovery.vue`, `ExportReceipt.vue`, etc.) — verified `IdentityPopover.vue:184` | closed |
| T-22-07 | Tampering / Injection | `StatusBar.vue` `identifier` text interpolation | accept | Always a `controlSafeDisplay`-wrapped 7-char hex slice; auto-escaping `{{ }}`; no `v-html` — verified `App.vue:183-186`, `StatusBar.vue:60` | closed |
| T-22-08 | Denial of Service (UI lockout) | Emphasized status-bar item `:disabled="attachedLifecycle === 'finishing'"` | accept | Mirrors pre-existing `BottomPanel.vue:206-208` finishing-state disable; no new lockout surface — verified `StatusBar.vue:43,71` | closed |
| T-22-09 | Repudiation (none applicable) | — | accept | Test-only changes (Playwright locator fixes); no production code path — verified `22-04-SUMMARY.md` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-02 | `truncateMiddle` only truncates display text already present in the authorized session payload; introduces no new data exposure and performs no escaping itself (caller's job via `controlSafeDisplay`, applied before truncation in all call sites). | gsd-security-auditor (verified) | 2026-11-05 |
| AR-22-02 | T-22-05 | `IdentityPopover.vue`'s digest/snapshot rows render already-authorized session-payload content (content-addressed hashes) identical to values already sent to the client elsewhere. | gsd-security-auditor (verified) | 2026-11-05 |
| AR-22-03 | T-22-06 | No new audit-relevant action introduced; Refresh and Copy match identical pre-existing trust characteristics elsewhere in the app (`CopyButton.vue`, `DraftRecovery.vue`, `ExportReceipt.vue`, `ReceiptFileRow.vue`, `SelectorDriftNotice.vue`). | gsd-security-auditor (verified) | 2026-11-05 |
| AR-22-04 | T-22-07 | `statusbarIdentifier` is always a `controlSafeDisplay`-wrapped 7-char hex slice (never free-form ref/path text), rendered via Vue's auto-escaping interpolation. | gsd-security-auditor (verified) | 2026-11-05 |
| AR-22-05 | T-22-08 | Emphasized status-bar item's disabled/aria-busy binding mirrors the already-shipped `BottomPanel.vue` finishing-state disable behavior; cannot itself introduce a new lockout. | gsd-security-auditor (verified) | 2026-11-05 |
| AR-22-06 | T-22-09 | Plan 22-04 only edits Playwright test assertions in response to plan 22-02's markup changes; no new source code, data flow, or trust boundary. | gsd-security-auditor (verified) | 2026-11-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 9 | 9 | 0 | gsd-security-auditor (verified by PostExec22 orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
