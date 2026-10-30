---
phase: 13
slug: single-pane-file-rendering
status: verified
threats_open: 0
asvs_level: 1
register_authored_at_plan_time: true
block_on: high
created: 2026-10-30
last_audited: 2026-10-30
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Enforcing ASVS Level 1 gate, `block_on: high`. Threat register authored at plan time across all five Phase 13 plans (13-01 through 13-05), each carrying a `<threat_model>` block. Implementation files were read-only during this audit — only `13-SECURITY.md` was created.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| already-fetched file text → Monaco model (13-01) | `ImmutableDiffFile.base.text`/`.head.text` is review content already fetched and rendered by the existing diff adapter; `PublicMonacoSinglePaneAdapter` renders the same already-trusted strings into a second Monaco model surface, not a new input source. | Already-fetched file text, rendered via `monaco.editor.createModel`/`setModel` (model-based, non-`innerHTML`). |
| server (`comparison.changedFiles`) → `/api/session` response (13-02) | `oldMode` crosses from server-internal `ChangedFile` data into the client-facing `SessionResponse`; already validated server-side by `GitModeSchema` before this plan, now exposed on a second, more widely-read response. | 6-digit git file-mode string (`/^[0-7]{6}$/`). |
| `selectedFile.status`/`.availability` (already-fetched, already-validated) → layout decision (13-03) | The single-pane routing decision is computed entirely from data the client already received and already renders today (status kind, availability, old mode). No new input surface. | Status kind, availability kind, old mode — client-local computation only. |
| `selectedFile.oldMode` (server-validated) → header text (13-04) | `wasModeKind` renders a closed-literal-switch label (or the raw validated mode string as fallback) into visible header text; input already validated server-side by `GitModeSchema` (13-02) before reaching the client. | Validated 6-digit git mode string, rendered via Vue template interpolation (HTML-escaped by default). |
| this spec itself (13-05) | Adds assertions, not product code. Its only "threat" is a weakened or skipped assertion masking a real single-pane regression — the same class of risk the project's existing Playwright suite already manages. | Test assertions only; no runtime data crossing. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-13-01-01 | Tampering | `PublicMonacoSinglePaneAdapter.setFile` | accept | Monaco renders text into its own canvas-based model, not `innerHTML` — same trust boundary as the existing diff editor. | closed |
| T-13-01-02 | Denial of service | `PublicMonacoSinglePaneAdapter.dispose` | mitigate | Disposing a half-constructed/already-disposed adapter must not throw/strand resources; mitigated by the same `disposed` boolean guard `PublicMonacoDiffAdapter.dispose` already uses. | closed |
| T-13-01-SC | Tampering | npm/pip/cargo installs | accept | No package-manager install in plan 01; `monaco-editor@0.55.1` already installed. | closed |
| T-13-02-01 | Tampering | `SessionFileSchema.oldMode` | accept | `oldMode` produced server-side from git, validated by `GitModeSchema` before reaching the schema; client only reads it via closed-literal-switch fallback (`wasModeKind`). | closed |
| T-13-02-02 | Information disclosure | `/api/session` response | accept | `oldMode` is a 6-digit git mode string, not a secret; response still excludes `repositoryRoot`, blob OIDs, session token. | closed |
| T-13-02-SC | Tampering | npm/pip/cargo installs | accept | No install; `GitModeSchema` already exported from `src/contracts/comparison.ts`. | closed |
| T-13-03-01 | Tampering | `DiffWorkspace.vue` single-pane branch | accept | Renders same already-fetched `FileContentResponse` text through same model-based (non-`innerHTML`) Monaco surface as side-by-side branch. | closed |
| T-13-03-02 | Denial of service | `DiffWorkspace.vue` adapter dispose-and-recreate watcher | mitigate | Switching files/layout modes disposes+reconstructs the Monaco adapter; mitigated by reusing the exact dispose() contract from 13-01 (idempotent, removes zones/listeners) and only reconstructing when `editorKind` genuinely changes, not on every content update. | closed |
| T-13-03-03 | Elevation of privilege | none | accept | No new privileged operation/mutation/network call; read-only layout routing. | closed |
| T-13-03-SC | Tampering | npm/pip/cargo installs | accept | No install. | closed |
| T-13-04-01 | Tampering | `ActiveFileToolbar.vue` layout label | accept | `wasModeKind` fallback renders `oldMode` itself, constrained to `/^[0-7]{6}$/` by `GitModeSchema` server-side; Vue template interpolation HTML-escaped by default. | closed |
| T-13-04-02 | Information disclosure | `StatusBadge.vue` reviewable gate | mitigate | A missing/incorrectly-`true` `reviewable` prop would mislabel a non-renderable file as single-pane; mitigated by Task 1 threading the real `leaf.file.availability.kind === 'text'` value from `FileRow.vue`, and `ActiveFileToolbar.vue`'s `singlePaneSideFor` independently re-deriving the same D-08 gate from `props.selectedFile.availability`. | closed |
| T-13-04-SC | Tampering | npm/pip/cargo installs | accept | No install. | closed |
| T-13-05-01 | Tampering | `tests/e2e/anchored-review.spec.ts` | mitigate | A trivially-passing test (overly broad locator, missing negative assertion) would hide a real single-pane defect; mitigated by asserting structural absence (`.monaco-diff-editor` count 0 for single-pane files, count 1 for modified-file regression guard) plus reusing existing accepted-outcome assertion patterns. | closed |
| T-13-05-SC | Tampering | npm/pip/cargo installs | accept | No install. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Verification Evidence

| Threat ID | Evidence |
|-----------|----------|
| T-13-01-01 | `src/web/monaco/diff-adapter.ts:683-696` — `setFile` calls `monaco.editor.createModel(sideFile.text, ...)` then `this.editor.setModel(this.model)`; no `innerHTML`/`v-html` anywhere in the file. |
| T-13-01-02 | `src/web/monaco/diff-adapter.ts:817-829` (`PublicMonacoSinglePaneAdapter.dispose`) uses `if (this.disposed) return; this.disposed = true;` — byte-identical guard pattern to `PublicMonacoDiffAdapter.dispose` at `diff-adapter.ts:363-377`. |
| T-13-01-SC | `git diff --stat 8ffd2e3^..26832b0 -- package.json package-lock.json` is empty across the full phase 13 commit range (`8ffd2e3`…`26832b0`). |
| T-13-02-01 | `src/contracts/comparison.ts:92` — `export const GitModeSchema = z.string().regex(/^[0-7]{6}$/);`. `src/contracts/api.ts:311-322` — `SessionFileSchema` is `z.strictObject({ ..., oldMode: GitModeSchema, ... })`. `src/web/model/single-pane-layout.ts:50-52` — `wasModeKind` is a closed-literal lookup (`wasModeLabels[oldMode] ?? oldMode`), no client-input branch. |
| T-13-02-02 | `src/contracts/api.ts:311-322` — `SessionFileSchema` is `strictObject` with only `fileId`, `status`, `oldMode`, `oldPath`, `newPath`, `additions`, `deletions`, `availability` — no `repositoryRoot`, blob OIDs, or session token field present (strict schema rejects extras). |
| T-13-02-SC | Same commit-range `package.json`/`package-lock.json` diff check as T-13-01-SC — empty. |
| T-13-03-01 | `src/web/components/DiffWorkspace.vue:215-231` (`loadContent`) calls `adapter.setFile(immutableFile())` where `immutableFile()` (lines 65-76) reads directly from `props.content` (the already-fetched `FileContentResponse`) for both the single-pane and diff branches; template at lines 359-386 contains no `v-html`/`innerHTML`. |
| T-13-03-02 | `src/web/components/DiffWorkspace.vue:92` — `editorKind = computed(() => props.singlePaneSide ?? 'diff')`; `:311-324` — `watch(editorKind, () => { unmountZone(); adapter?.dispose(); adapter = undefined; ... })` fires only on `editorKind` change. The separate `watch(() => props.content, ...)` at `:302-309` calls `loadContent()` only, never touches `adapter.dispose()`/reconstruction. |
| T-13-03-03 | `src/web/components/DiffWorkspace.vue` single-pane branch (lines 359-386, 92, 317-331) introduces no new `fetch`/mutation call; all `emit(...)` calls (`add`, `cancel`, `confirmDiscard`, `confirmMove`, `activate`, `keepWriting`, `updateText`) are pre-existing comment/composer events shared with the diff branch, unchanged by this plan. |
| T-13-03-SC | Same commit-range diff check — empty. |
| T-13-04-01 | `src/web/components/ActiveFileToolbar.vue:46` — `` `Type changed · Head only (was ${wasModeKind(props.selectedFile.oldMode)})` `` rendered via `{{ layoutLabel }}` at line 82 (standard Vue text interpolation, no `v-html`). `oldMode` is constrained server-side per T-13-02-01 evidence. |
| T-13-04-02 | `src/web/components/FileRow.vue:56` — `<StatusBadge :kind="leaf.file.status.kind" :reviewable="leaf.file.availability.kind === 'text'" />`. `src/web/components/ActiveFileToolbar.vue:28-39` — `singlePaneSide`/`layoutLabel` computed via `singlePaneSideFor(props.selectedFile.status.kind, props.selectedFile.availability)`; `src/web/model/single-pane-layout.ts:21-29` — `singlePaneSideFor` returns `undefined` when `availability.kind !== 'text'`, independently gating the `StatusBadge reviewable` render at `ActiveFileToolbar.vue:80-81` (only rendered inside `v-if="layoutLabel !== undefined"`). |
| T-13-04-SC | Same commit-range diff check — empty. |
| T-13-05-01 | `tests/e2e/anchored-review.spec.ts:381-382` and `:434-435` — `expect(page.locator('.monaco-diff-editor')).toHaveCount(0)` for single-pane (added/deleted) files. `:450-455` — after navigating to `src/changed.ts` (a regular modified file, the regression guard), `expect(page.locator('.monaco-diff-editor')).toHaveCount(1)`. |
| T-13-05-SC | Same commit-range diff check — empty. |

---

## Accepted Risks Log

No accepted risks beyond the plan-time `accept` dispositions already recorded in the Threat Register above (T-13-01-01, T-13-01-SC, T-13-02-01, T-13-02-02, T-13-02-SC, T-13-03-01, T-13-03-03, T-13-03-SC, T-13-04-01, T-13-04-SC, T-13-05-SC). No threat required conversion to an ad-hoc accepted risk during this audit.

---

## Transfer Log

No transferred risks. No plan-time threat disposition `transfer` in any of the five Phase 13 plans.

---

## Unregistered Flags

None. All five `13-0N-SUMMARY.md` files were checked for a `## Threat Flags` section (`grep -r "## Threat Flags" .planning/phases/13-single-pane-file-rendering/`); no matches found. No new attack surface was flagged during execution outside the plan-time register.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-30 | 15 | 15 | 0 | GSD Security Auditor (`PostVerify13.SecurePhase13`) |

### Audit protocol

- Loaded all five `13-0N-PLAN.md` `<threat_model>` blocks (plan-time register; `register_authored_at_plan_time: true`).
- Checked all five `13-0N-SUMMARY.md` files for `## Threat Flags` — none found.
- Verified every `accept`-disposition threat's cited rationale against the implementation file/line it names (spot-checked, not rubber-stamped).
- Verified every `mitigate`-disposition threat's cited mitigation pattern via targeted `grep`/`read` of the exact file.
- Verified no `package.json`/`package-lock.json` changes across the full Phase 13 commit range (`8ffd2e3^..26832b0`) for all five `*-SC` supply-chain rows.
- No implementation, test, or plan file was modified — only this SECURITY.md was created.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-30 — 15/15 declared Phase 13 threats closed.
