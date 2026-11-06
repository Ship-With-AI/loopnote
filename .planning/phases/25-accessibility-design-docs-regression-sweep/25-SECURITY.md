---
phase: 25
slug: accessibility-design-docs-regression-sweep
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-06
---

# Phase 25 — Security

> Per-phase security contract: threat register, accepted risks, audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| `TitleBar.vue`/`StatusBar.vue` `role="toolbar"` markup (25-01) | Static ARIA role/label added to existing button-cluster wrappers; no new input, endpoint, or data flow | none — markup only |
| User-typed filter text → announced live-region text (25-02) | `FileTree.vue`'s local `query` ref (free-text user input) flows through the `filterResult` emit into `App.vue`'s `handleFilterResult` → `announce()` → `{{ liveMessage }}` | matched/total counts + echoed query string, Vue text-interpolation sink only |
| DESIGN.md prose / test timeout constants (25-03) | Static Markdown edits and a `test.setTimeout` constant change; no runtime code path | none |
| Phase-end regression-gate execution (25-04) | Runs existing `package.json` scripts only; no new code path | none |
| Server-confirmed revision number → announced live-region text (25-05) | `finishAttachedReview()`'s `announce()` interpolates `current.canonical.revision` (server-issued `number`, already rendered elsewhere in `ExportSection.vue`) | integer revision only, Vue text-interpolation sink |
| Gap-closure plans 25-06/07/08/09 | Test-config (`tsconfig.*.test.json`), test-fixture (`session.test.ts`, `runtime-package-contract.test.ts`), dev-tooling allow-list (`verify-prerequisites.mjs`), test-harness (`agent-ready-export.spec.ts`), and one scoped presentational prop (`PathText.vue` `nameFirst`) | none — no production trust-boundary change; spot-checked below |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-25-01 | Spoofing | `TitleBar.vue`/`StatusBar.vue` `role="toolbar"` markup | mitigate | `role="toolbar" aria-label="Title bar actions"`/`"Status bar actions"` applied only to `.titlebar__right`/`.statusbar__right` (`TitleBar.vue:63`, `StatusBar.vue:64`), the real button-cluster wrapper — matching the shape already proven safe at `FileTree.vue:410` and `EditorTitle.vue:101` (both verified `role="toolbar"` on their own button clusters, not the wrapping `<nav>`/`<div>`). `tests/e2e/toolbar-roles.spec.ts:175,187` assert `getByRole('toolbar', { name: … })` resolves to the real cluster. | closed |
| T-25-02 | Elevation of Privilege (landmark regression) | `TitleBar.vue`'s `<header>`, `StatusBar.vue`'s `<footer>` | mitigate | Landmark elements untouched: `TitleBar.vue:47`/`98` still wraps `<header class="titlebar">`, `StatusBar.vue:59`/`95` still wraps `<footer class="statusbar">`; `toolbar-roles.spec.ts:192-193` asserts `getByRole('banner')`/`getByRole('contentinfo')` still visible, and `anchored-review.spec.ts:136` / `workbench-shell-smoke.spec.ts:217,254,293,342` still exercise `getByRole('banner')` directly. | closed |
| T-25-SC(01) | Tampering (supply chain) | npm installs | accept | Zero new dependencies — confirmed via `git log --oneline -- package.json package-lock.json`: the most recent touch to either file predates Phase 25 (`47bff66`, Phase 19); no Phase-25 commit appears in that history. | closed |
| T-25-03(02) | Tampering/Injection | `handleFilterResult`'s filter-no-match message | mitigate | `App.vue:568-570`'s `handleFilterResult` builds the message, passed to `announce()` → `liveMessage` ref, rendered at `App.vue:1810` via `{{ liveMessage }}` text interpolation (no `v-html` anywhere in `App.vue` — confirmed by grep). Vue auto-escapes text interpolation, so the echoed `query` string cannot inject markup. | closed |
| T-25-04(02) | Denial of Service (debounce timer leak) | `FileTree.vue` `filterAnnounceTimer` | mitigate | Re-verified post-fix (commit `2c49a85`, `25-REVIEW.md` WR-01): `FileTree.vue:57-59`'s `watch(query, …)` clears `filterAnnounceTimer` before rescheduling, **and** `FileTree.vue:61-63` now has `onBeforeUnmount(() => { if (filterAnnounceTimer !== undefined) clearTimeout(filterAnnounceTimer); })` — the half of the mitigation the original code was missing is confirmed present in current code, not just claimed. | closed |
| T-25-05 | Information Disclosure | `handleFilterResult` announced counts | accept | Matched/total counts are already visible on-screen before the announcement fires: `FileTree.vue:466`'s `<span class="n" v-if="query !== ''">{{ model.flatFileRows.length }} of {{ files.length }}</span>` and `FileTree.vue:554`'s `tree-footer` (`footerText`, same counts). The live region only restates already-visible local state. | closed |
| T-25-SC(02) | Tampering (supply chain) | npm installs | accept | Zero new dependencies (same verification as T-25-SC(01)). | closed |
| T-25-03-01 | Tampering | `test.setTimeout` change in `rendered-markdown-security.spec.ts`/`anchored-review.spec.ts` | mitigate | Current code shows the timeout **unchanged** at `90_000` in both files (`rendered-markdown-security.spec.ts:32`, `anchored-review.spec.ts:33`) — `STATE.md:250` documents that `--repeat-each=5` (15/15, 25/25 passed) and a forced-contention reproduction both passed well under 90s, so no raise was evidence-justified. The mitigation's actual guarantee — no unguarded/unevidenced timeout change — holds. | closed |
| T-25-03-02 | Repudiation (silent flake suppression) | `STATE.md` Deferred Items | mitigate | `STATE.md:306-307` carries evidence-backed rows for both flakes (`token-contract.test.ts` Vite-reload timeout, citing two prior independent reproductions; `rendered-markdown-security.spec.ts`/`anchored-review.spec.ts` lock-contention hypothesis, citing `--repeat-each=5` + forced-contention reproduction). Neither flake is silently skipped. | closed |
| T-25-03-SC | Tampering (supply chain) | npm installs | accept | Zero new dependencies (same verification as T-25-SC(01)). | closed |
| T-25-04-01 | Repudiation (silent gate failure) | Phase-end regression gate | mitigate | `25-04-SUMMARY.md:89-97` records exact pass/fail counts for all 6 locked gate commands (vitest, typecheck:web, typecheck:tests, verify:semantic-css, playwright, test:runtime-artifact); every red result got a reproduced, evidence-backed `STATE.md` Deferred Items row (`25-04-SUMMARY.md:133-141`, 5 new rows, each citing disposable-worktree reproduction against pre-phase commit `7f6d248`) rather than a silent re-run-until-green. One genuine Phase-25 regression found during the gate (a stale `role="status"` assertion in `agent-ready-export-safety.spec.ts`) was fixed in-phase (commit `55bd57f`), not deferred. | closed |
| T-25-04-SC | Tampering (supply chain) | npm installs | accept | This plan runs only existing `package.json` scripts; zero new packages (same verification as T-25-SC(01)). | closed |
| T-25-06 | Tampering/Injection | `finishAttachedReview()`'s new `announce()` messages | accept | `App.vue:741` interpolates only `current.canonical.revision` — typed `number` throughout (`CanonicalReviewDraft.revision: number` at `App.vue:69`, `ReviewCanonicalDraft.revision: number` in `review-draft-state.ts:13`, same type on `ExportSection.vue`/`ExportProgress.vue`/`ExportReadinessSummary.vue`/`ExportTab.vue`/`BottomPanel.vue` props) — never free-text. The sink is the same `{{ liveMessage }}` text interpolation verified for T-25-03(02), which auto-escapes regardless of input type. | closed |
| T-25-07 | Information Disclosure | Removing `role="status"`/`aria-live` from `ExportSection.vue`'s two attached-completion elements | accept | Confirmed removed: `ExportSection.vue:133` (`<div class="inline-notice inline-notice--success">`) and `:146` (`<p class="attached-completion__progress">…`) carry neither `role` nor `aria-live` in current code (grep for both attributes in the file returns only an unrelated `role="status"` on a different, unaffected section at `:225`). The same information is now announced once via `App.vue`'s `announce()` (`App.vue:741,749` — "Validating accepted revision…"/"Review finished.") — nothing newly exposed or hidden. | closed |
| T-25-SC(05) | Tampering (supply chain) | npm installs | accept | Zero new dependencies (same verification as T-25-SC(01)). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Unregistered Flags (gap-closure plans 25-06/07/08/09 spot-check; SUMMARY.md `## Threat Flags` sections say "None")

| Flag | Component | Spot-Check | Result |
|------|-----------|------------|--------|
| SC-25-06 | `tsconfig.test.json`/`tsconfig.web.test.json` + `identity-pill.test.ts`/`monaco-diff-adapter.test.ts` (commit `db6dde9`) | `git show db6dde9 --stat` | Test-config-only, confirmed: no production file touched. |
| SC-25-07a | `scripts/verify-prerequisites.mjs` dependency allow-list (commit `03c170a`) | Diffed `approvedDependencies` Map against installed `package.json` versions (`node -e` dump of `dependencies`+`devDependencies`) | Every entry (added `@typescript/native`, changed `typescript` alias, bumped `vue-tsc` 3.3.7→3.3.14) matches the installed/pinned manifest exactly — reconciliation, not a widened allow-list. No new dependency admitted beyond what is already installed. |
| SC-25-07b | `tests/api/session.test.ts`, `tests/package/runtime-package-contract.test.ts` (commit `03c170a`) | `git show 03c170a --stat` | Test-fixture-only; no production file touched. |
| SC-25-08 | `tests/e2e/agent-ready-export.spec.ts` (commit `9975870`) | `git show 9975870 --stat` | Test-harness-only (tab-selection fix before interacting with tab-gated content); no production file touched. |
| SC-25-09 | `PathText.vue`'s `nameFirst` prop, wired through `PathDisplay.vue`/`FileRow.vue` (commit `e2a0534`) | Read `PathText.vue:9,23-24` — `nameFirst` only toggles which of two already-existing `<span>` blocks (built from the same `filenameSegments`/`directorySegments`, same `{{ segment.text }}` text interpolation) renders first in the DOM; no new interpolation sink. `FileRow.vue:110` drives it with `:name-first="mode === 'list'"`, a local presentational enum (`'tree' \| 'list'`), never user/external input. | No unregistered attack surface — pure DOM-order toggle over an already-auto-escaped sink, driven by an internal enum. |

No new attack surface found in any of the four gap-closure plans beyond what each `SUMMARY.md` claimed.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-25-01 | T-25-SC(01), T-25-SC(02), T-25-03-SC, T-25-04-SC, T-25-SC(05) | Zero new dependencies added across all of Phase 25 — verified via `git log --oneline -- package.json package-lock.json`, no Phase-25 commit touches either file (most recent touch predates Phase 25, at Phase 19 commit `47bff66`) | gsd-security-auditor | 2026-11-06 |
| AR-25-02 | T-25-05 | `handleFilterResult`'s announced matched/total counts and echoed query text are already visible on-screen (`FileTree.vue:466` inline badge, `:554` footer) before the live region restates them — no new information disclosed | gsd-security-auditor | 2026-11-06 |
| AR-25-03 | T-25-06 | `finishAttachedReview()`'s new `announce()` calls interpolate only a server-issued `number` (`current.canonical.revision`), never free-text user input; the sink is Vue's auto-escaping `{{ liveMessage }}` text interpolation regardless | gsd-security-auditor | 2026-11-06 |
| AR-25-04 | T-25-07 | Removing `role="status"`/`aria-live` from `ExportSection.vue`'s two attached-completion elements removes only AT live-region semantics; the identical information is now announced exactly once via `App.vue`'s single `announce()` owner — nothing newly exposed or hidden | gsd-security-auditor | 2026-11-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-11-06 | 15 (+5 gap-closure spot-checks) | 15 (+5) | 0 | gsd-security-auditor |

**Verification note:** Every `mitigate` threat was verified against current on-disk code (not plan prose), including the explicitly flagged T-25-04(02) post-review-fix re-check (`FileTree.vue:57-63`, both the reschedule-clear and the `onBeforeUnmount` cleanup half are present). All `accept` threats have a corresponding Accepted Risks Log entry. All five `Tampering (supply chain)` entries were verified identically via `git log` on `package.json`/`package-lock.json`, confirming no Phase-25 commit touches either file. The four gap-closure plans (25-06/07/08/09), whose SUMMARY.md files declare no threat flags, were independently spot-checked against their actual diffs (`git show <commit> --stat` for scope, direct reads for the one production change) rather than trusted at face value; no unregistered attack surface was found.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
