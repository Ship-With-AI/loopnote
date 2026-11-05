---
phase: 23
slug: inline-comment-threads
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-05
---

# Phase 23 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser (prototype harness, Plan 23-01) → none | Throwaway, dev-server-only spike route; deleted before any other plan ships | None (deleted, never shipped) |
| Comment body (reviewer-authored, local draft) → rendered DOM | `comment.body` and stale-anchor quoted text are reviewer-authored free text rendered into `CommentThread.vue` / `DiffWorkspace.vue` | Free-text comment bodies, quoted anchor snippets |
| Browser (`App.vue`) → local Loopnote server (`127.0.0.1`-only) | `mutateReview()`'s `resolveComment` / `reopenComment` / `deleteComment` / `editComment` requests | Comment id, revision, edited comment body |
| Pure client-side model functions (`thread-order.ts`, `thread-zone-diff.ts`, `orphaned-comments.ts`, `comment-groups.ts`) | Operate only on already-reconciled, already-rendered `WorkspaceComment[]` already visible to the reviewer this session | No new input; re-derivation of session-local view state only |
| Pure client-side Monaco glue (`diff-adapter.ts` keyed thread zones, `focusAnchor`) | No network input, no persistence; zone/focus state keyed by comment id | View-zone DOM nodes, editor focus/position |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-23-01-01 | Tampering | `ThreadWidgetSpikePrototype.vue` left mounted in a production route | mitigate | Resume action deletes `src/web/prototypes/ThreadWidgetSpikePrototype.vue`, `tests/e2e/thread-widget-spike.spec.ts`, `tests/performance/thread-input-lag.mjs` once the go/no-go decision is recorded | closed |
| T-23-01-SC | Tampering | npm/pip/cargo installs (Plan 23-01) | accept | Zero new dependencies | closed |
| T-23-02-01 | Information Disclosure | `thread-order.ts` | accept | Operates only on already-rendered `WorkspaceComment[]`/tree data already visible to the reviewer in this same session; no new data exposure | closed |
| T-23-02-SC | Tampering | npm/pip/cargo installs (Plan 23-02) | accept | Zero new dependencies | closed |
| T-23-03-01 | Tampering | `draft-reconciliation.ts` / `src/domain/anchor.ts` golden-hash integrity | mitigate | Plan 23-03 does not modify `draft-reconciliation.ts` or `src/domain/anchor.ts`; `files_modified` lists neither | closed |
| T-23-03-SC | Tampering | npm/pip/cargo installs (Plan 23-03) | accept | Zero new dependencies | closed |
| T-23-04-01 | Tampering / Elevation of Privilege | `CommentThread.vue` body rendering (stored-XSS surface) | mitigate | Comment body and stale-anchor quoted text render via plain Vue text interpolation only, no `v-html`/`innerHTML` | closed |
| T-23-04-SC | Tampering | npm/pip/cargo installs (Plan 23-04) | accept | Zero new dependencies | closed |
| T-23-05-01 | Denial of Service (local) | `threadZones` map growth in `diff-adapter.ts` | accept | No per-file thread cap is an explicit CONTEXT.md decision; zones are removed on `removeThread`, so the map tracks only currently-rendered threads | closed |
| T-23-05-SC | Tampering | npm/pip/cargo installs (Plan 23-05) | accept | Zero new dependencies | closed |
| T-23-06-SC | Tampering | npm/pip/cargo installs (Plan 23-06) | accept | Zero new dependencies | closed |
| T-23-07-01 | Tampering | Draft reconciliation consumer — `DiffWorkspace.vue`'s `renderThreads()` | mitigate | `diffThreadIds` (Plan 23-03) is the single source of truth for which ids change; `renderThreads()` only touches `diff.toRemove`/`diff.toCreate` ids, never a blanket remove-all/recreate-all | closed |
| T-23-07-SC | Tampering | npm/pip/cargo installs (Plan 23-07) | accept | Zero new dependencies | closed |
| T-23-08-01 | Tampering | `collapsedByCommentId`/`locallyHiddenCommentIds` becoming a second persistence authority | mitigate | Both are plain in-memory `ref`s in `App.vue`, never written to `localStorage` or a draft field, and never read by any `mutateReview()` request | closed |
| T-23-08-02 | Repudiation / Tampering | Delete-Undo flush firing twice or never | mitigate | `commitPendingDelete`'s `pendingDeletes.delete(commentId)` guard (checked via `pendingDeletes.has` before scheduling) makes the flush idempotent; exactly one `pagehide` and one `visibilitychange` listener are registered for the delete-flush concern, not one per pending delete | closed |
| T-23-08-03 | Tampering / Elevation of Privilege | `editComment` body passed to `mutateReview` | accept | `CommentBodySchema` (`src/contracts/draft.ts`) validates the body server-side on every `editComment`/`addComment` request via `src/contracts/api.ts`, unchanged this phase; client sends exactly `reviewDraft.commentBuffers.get(commentId)` | closed |
| T-23-08-SC | Tampering | npm/pip/cargo installs (Plan 23-08) | accept | Zero new dependencies | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-23-01 | T-23-01-SC, T-23-02-SC, T-23-03-SC, T-23-04-SC, T-23-05-SC, T-23-06-SC, T-23-07-SC, T-23-08-SC | Phase 23 adds zero new npm dependencies across all 8 plans; verified `package.json` untouched across the full Phase 23 commit range | gsd-security-auditor (Phase 23 audit) | 2026-11-05 |
| AR-23-02 | T-23-02-01 | `thread-order.ts` is a pure function over `WorkspaceComment[]` already rendered and visible to the reviewer in the current session; re-deriving navigation order discloses nothing new | gsd-security-auditor (Phase 23 audit) | 2026-11-05 |
| AR-23-03 | T-23-05-01 | CONTEXT.md locks "no per-file thread cap" as an explicit product decision; `threadZones` is bounded by live comment count because `removeThreadZone` (called from `removeThread`, wired into `renderThreads()`'s `diff.toRemove` loop) deletes the map entry on every removal — verified in `src/web/monaco/diff-adapter.ts` and `src/web/components/DiffWorkspace.vue:199-201` | gsd-security-auditor (Phase 23 audit) | 2026-11-05 |
| AR-23-04 | T-23-08-03 | `CommentBodySchema` server-side validation (`src/contracts/draft.ts`, wired through `src/contracts/api.ts`) is unchanged by this phase and still gates every `editComment`/`addComment` mutation; the client-side threat surface is unchanged from the pre-existing composer path | gsd-security-auditor (Phase 23 audit) | 2026-11-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 17 | 17 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05

---

## Post-Plan Fix Review: commit `b4aa70bf`

**Commit:** `b4aa70bf9f57fff689c6db4187239ff94f3f9651` — "return focus to the Monaco editor at the anchored line when Esc is pressed on a focused thread header"

**Files touched:** `src/web/App.vue`, `src/web/components/DiffWorkspace.vue`, `src/web/monaco/diff-adapter.ts`, `tests/e2e/inline-comment-threads.spec.ts`

**New surface introduced:** `MonacoDiffAdapter.focusAnchor(side, line)` (both side-by-side and single-pane adapters) and a new `Escape` branch in `App.vue`'s `handleKeydown` that reads `data-comment-id` off the closest `.comment-thread` DOM ancestor.

**Verification:**
- `data-comment-id` is set by `CommentThread.vue:61` from `comment.id` — a value originating from already-validated `WorkspaceComment[]` (server/draft-sourced, `CommentIdSchema`-typed), not attacker-controllable free text.
- The handler's read of `data-comment-id` is used only as a lookup key into `workspaceComments.value.find(...)` — never interpolated into a selector string, `innerHTML`, `eval`, or any other unsafe sink.
- The resolved `comment.side`/`comment.line` (typed `DiffSide`/`number` fields of the found, already-trusted comment object — not the raw DOM string) are passed to `focusAnchor`.
- `focusAnchor` in both adapter implementations (`diff-adapter.ts:394-401`, `:1050-1057`) guards with `isValidLine`/`side` checks before calling only Monaco's own `setPosition`/`revealLineInCenter`/`focus` APIs — no DOM string injection, no eval, no new persistence.

**Disposition:** Falls entirely within the already-declared T-23-04-01 (Tampering/EoP, comment body/DOM rendering — text interpolation only) and T-23-05-01/Plan 23-05's "pure client-side Monaco glue, no network input, no persistence" trust boundary. No new unregistered attack surface.

**Unregistered flags:** none.

