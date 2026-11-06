---
phase: 24
slug: bottom-panel-export
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-06
---

# Phase 24 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| Browser (`ExportSection.vue`, via `App.vue`) → local Loopnote server (`127.0.0.1`-only) | `finishReview`/`exportReview` mutation requests (unchanged v2.0 contract; only the rendering of their states moved tabs) | `FinishReviewResult`/`ExportReviewResult` |
| Browser → OS clipboard | `navigator.clipboard.writeText` ("Copy agent prompt", "Copy all receipt details", etc.) | outbound-only; fixed template interpolating only server-returned `receipt.files[0].path` |
| Same-process Vue prop/emit wiring | `activeTab`, `attachedLifecycle`/`attachedReady`/`attachedFailure`, `openPanel(tab)`, `revealCommentFromPanel`, Cmd/Ctrl+S shortcut | in-memory only; no persistence, no external input |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-24-01-01 | Tampering (client-state integrity) | `panel-state.ts` `activeTab` | accept | Excluded from `PersistedPanelState`; session-only `ShallowRef`, resets to `'comments'` on load | closed |
| T-24-01-02 | Information Disclosure | `file-tree.ts` `fileTypeMarkFor` | accept | Pure lookup over extension string already visible in tree | closed |
| T-24-01-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-02-01 | Information Disclosure | `comments-tab-groups.ts` | accept | Pure function over already-rendered `WorkspaceComment[]`/tree data | closed |
| T-24-02-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-03-01 | Denial of Service (stray timer after teardown) | `SummarySection.vue` autosave `setTimeout` | mitigate | `onBeforeUnmount(() => clearTimeout(autosaveTimer))` | closed |
| T-24-03-02 | Tampering | Autosave `emit('save')` dispatch | accept | Reuses existing server-authoritative `saveSummary`/`mutateReview` path; no new request shape | closed |
| T-24-03-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-04-01 | Tampering | `finishReview`/export request payload shape | accept | `sessionClient.finishReview(...)`/`sessionClient.exportReview(...)` call sites remain in `App.vue`, unchanged contracts | closed |
| T-24-04-02 | Tampering (client-state integrity) | `attachedLifecycle`/`attachedReady`/`attachedFailure` props threaded one layer deeper | accept | Same-process Vue prop relocation; no new trust boundary | closed |
| T-24-04-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-05-01 | Information Disclosure / Tampering | "Copy agent prompt" clipboard write (`ExportReceipt.vue`) | accept | Fixed template literal interpolating only server-returned `receipt.files[0].path`; outbound-only `navigator.clipboard.writeText`, same try/catch idiom as two existing buttons | closed |
| T-24-05-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-06-01 | Tampering | `StatusBar.vue` `openPanel` emit signature (`[tab: 'comments' \| 'export']`) | accept | Argument is always one of two hardcoded template literals, never external input | closed |
| T-24-06-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-07-01 | Information Disclosure | `CommentsTab.vue` grouped list | accept | Renders only comments already visible/accessible elsewhere in the same session | closed |
| T-24-07-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-08-01 | Tampering (client-state integrity) | `BottomPanel.vue` `activeTab` prop / `update:activeTab` emit | accept | Pure prop driven by in-memory `panelState.activeTab`; never persisted | closed |
| T-24-08-02 | Spoofing (focus-jacking) | `focusActiveTab()` programmatic focus move | accept | Single call site, only inside `openPanel()`, itself only reachable via `@open-panel="openPanel"` from a user-initiated status-bar click; never on load or ⌘J toggle | closed |
| T-24-08-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-09-01 | Spoofing (focus-jacking) / DoS (focus trap) | `revealCommentFromPanel` cross-component focus move | accept | Focus moves only in direct response to a user click/Enter on an already-visible comment row; target already focusable by role | closed |
| T-24-09-02 | Tampering (client-state integrity) | `openPanel(tab)` / `panelState.activeTab` | accept | In-memory-only `shallowRef`, never persisted | closed |
| T-24-09-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-10-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-10-01 | Tampering | Playwright `openReview()` test-harness tab-click step | accept | Test-only; wrong selector only produces a visible test failure | closed |
| T-24-11-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new dependencies | closed |
| T-24-11-01 | Tampering | `agent-ready-export-safety.spec.ts` harness prop remapping | accept | Test-only; wrong prop mapping only causes a visible test failure | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Unregistered Flags (found by code review, not the original threat model; verified against current code)

| Flag | Category | Component | Found By | Resolution | Status |
|------|----------|-----------|----------|------------|--------|
| UF-24-01 | Tampering (modal-inert bypass) | `App.vue` Cmd/Ctrl+S summary-save shortcut (added by Plan 24-09, not covered by any `T-24-09-*` entry) | `24-REVIEW.md` iteration-1 finding WR-01 | `handleKeydown`'s `s` branch now guards `!shellModalOpen.value` (`App.vue:1131`: `if (!shellModalOpen.value && panelOpen.value && panelState.activeTab.value === 'summary') saveSummary();`), matching the pre-existing `b`/`j` guard pattern — commit `6884160` | closed, verified present in current code |
| UF-24-02 | Tampering/Injection (selector injection via unescaped id) | `App.vue` `revealCommentFromPanel`'s `querySelector` interpolation of `commentId` (not covered by `T-24-09-01`'s mitigation text) | `24-REVIEW.md` iteration-1 finding IN-01 | `commentId` passed through `CSS.escape()` before interpolation (`App.vue:1083`: `` document.querySelector(`[data-comment-id="${CSS.escape(commentId)}"] .thread-header`) ``) — commit `6884160` | closed, verified present in current code |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-24-01 | T-24-01-01, T-24-08-01, T-24-09-02 | `activeTab` is session-only, in-memory `ShallowRef`, deliberately excluded from `PersistedPanelState`/`localStorage`; cannot be tampered with across a session boundary | gsd-security-auditor | 2026-11-06 |
| AR-24-02 | T-24-01-02, T-24-02-01, T-24-07-01 | New read-only model/component surfaces (`fileTypeMarkFor`, `comments-tab-groups.ts`, `CommentsTab.vue`) render only data already visible to the reviewer elsewhere in the same session; no new data exposure | gsd-security-auditor | 2026-11-06 |
| AR-24-03 | T-24-03-02, T-24-04-01 | Autosave and the relocated export/attached-completion UI dispatch through the pre-existing, unchanged `saveSummary`/`finishReview`/`exportReview` server-authoritative mutation paths; no new request shape | gsd-security-auditor | 2026-11-06 |
| AR-24-04 | T-24-04-02, T-24-08-01 | `attachedLifecycle`/`attachedReady`/`attachedFailure`/`activeTab` prop relocations are same-process Vue wiring between project-owned components; no new trust boundary | gsd-security-auditor | 2026-11-06 |
| AR-24-05 | T-24-05-01 | "Copy agent prompt" clipboard write is a fixed, locked template interpolating only server-returned, already-visible `receipt.files[0].path`; outbound-only; no user-controlled input concatenated | gsd-security-auditor | 2026-11-06 |
| AR-24-06 | T-24-06-01 | `StatusBar.vue`'s `openPanel` emit argument is always one of two hardcoded literals (`'comments'`/`'export'`), never external input | gsd-security-auditor | 2026-11-06 |
| AR-24-07 | T-24-08-02, T-24-09-01 | Programmatic focus moves (`focusActiveTab()`, `revealCommentFromPanel`) fire only in direct response to a user-initiated click/Enter/arrow gesture on an already-visible, already-focusable element; never on load or via the ⌘J/title-bar toggle | gsd-security-auditor | 2026-11-06 |
| AR-24-08 | T-24-*-SC (all 11 supply-chain entries) | Zero new dependencies added across the phase — verified via `git diff 6f64e1d..HEAD -- package.json package-lock.json` (no output; byte-identical) | gsd-security-auditor | 2026-11-06 |
| AR-24-09 | T-24-10-01, T-24-11-01 | Playwright test-harness changes (tab-click helper steps, prop remapping); a wrong selector/mapping only produces a visible, deterministic test failure, never a production trust-boundary change | gsd-security-auditor | 2026-11-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 27 (+2 unregistered flags) | 27 (+2) | 0 | gsd-security-auditor |

**Post-review-fix verification note:** This audit specifically re-verified, against the current on-disk code (post commits `6884160` and `ce44d5a`, not just the original plans' prose) the clipboard mitigation (`T-24-05-01`, `ExportReceipt.vue:93-104`) and the autosave/⌘S mitigations (`T-24-03-01`/`T-24-03-02` in `SummarySection.vue:129-135`; the `App.vue` Cmd/Ctrl+S path at `App.vue:1129-1132`). All hold. The review-fix round also introduced and then closed two items not present in any `<threat_model>` block (`UF-24-01`: Cmd/Ctrl+S bypassing the "inert behind modal" invariant; `UF-24-02`: unescaped `commentId` in a `querySelector` attribute selector) — both are now mitigated in the current code and logged above as unregistered-flag findings, not blockers.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
