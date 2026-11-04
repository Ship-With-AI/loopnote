---
phase: 19
slug: typecheck-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| npm devDependency alias resolution (install-time) | `typescript` and `@typescript/native` resolve to different real packages than their declared names suggest (Microsoft's dual npm-alias TS6/TS7 scheme). Build/dev-tooling-only; nothing reaches a shipped runtime bundle or request path. | npm registry package bytes → `node_modules/`, dev-time only |
| CI pipeline (push-to-`main` trigger) → production deploy gate | Phase 19 widens what blocks `deploy-production` (via `needs: repository-gates`, now including `typecheck:web`). Touches no credentials, secrets, or deployment-target configuration. | CI job success/failure signal only |
| Compile-time type narrowing in `DiffWorkspace.vue` / `DraftRecovery.vue` / `App.vue` / `ReviewNotesDialog.vue` | No new trust boundary — all four fixes are compile-time-only type narrowing applied to already-shipped runtime logic; no I/O, auth, or data-validation surface touched. | n/a (dev-time compiler check only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-19-01-01 | Spoofing | npm alias resolution (`typescript`→`npm:@typescript/typescript6@6.0.2`, `@typescript/native`→`npm:typescript@7.0.2`) | mitigate | `package.json` pins both aliases exactly as declared (`"typescript": "npm:@typescript/typescript6@6.0.2"`, `"@typescript/native": "npm:typescript@7.0.2"`, lines 83/86); `19-01-SUMMARY.md` records `node_modules/.bin/tsc --version` → `Version 7.0.2` confirmed post-install. | closed |
| T-19-01-02 | Tampering | `build:node` output integrity across the compiler swap | mitigate | `19-01-SUMMARY.md` records the before/after `dist/` SHA-256 proof: 50/50 files identical between pre-swap (`typescript@7.0.2` plain, `vue-tsc@3.3.7`) and post-swap (dual-alias, `vue-tsc@3.3.14`) toolchains (deviation note documents the `git checkout <rev>` substitution for the plan's literal `git stash` mechanism, same hash-diff methodology, empty diff confirmed). | closed |
| T-19-01-SC | Tampering | npm install (`vue-tsc@3.3.14` flagged `[SUS]` in RESEARCH.md) | mitigate | `19-01-SUMMARY.md` key-decisions record the Task 1 `checkpoint:human-verify` gate was pre-approved by the user on 2026-11-04 in the orchestrating session before any install step; `package.json` pins `"vue-tsc": "3.3.14"` exactly (no caret range, line 89), confirming the approved version is what was actually installed. | closed |
| T-19-02-01 | Tampering | Type-narrowing fix behavioural drift in `DiffWorkspace.vue`/`DraftRecovery.vue` | accept | Verified sound: `DiffWorkspace.vue` reuses the identical strict-equality DOM-null-guard idiom verbatim at both flagged sites (`zone === undefined || zone === null || ...` line 149; `zone === null || zone === undefined` line 377); `DraftRecovery.vue`'s fix is a direct `v-else-if="load.kind === 'newerUnsupported'"` discriminant check (line 140), mirroring the file's existing per-variant style. Existing Playwright regression suites (`anchored-workspace.spec.ts`, `anchored-review.spec.ts`, `draft-recovery-ui.spec.ts`) cover these exact rendering paths per the plan's `<verify>` block, and `19-02-SUMMARY.md` confirms they stayed green. | closed |
| T-19-02-SC | Tampering | npm/pip/cargo installs | accept | Verified: `19-02-SUMMARY.md` key-files list only `src/web/components/DiffWorkspace.vue` and `src/web/components/DraftRecovery.vue` as modified — no `package.json`/`package-lock.json` change, confirming no package-manager install occurred in this sub-plan. | closed |
| T-19-03-01 | Tampering | `AttachedLifecycle` consolidation widening `ReviewNotesDialog.vue`'s accepted prop value set | accept | Verified: `App.vue` only forwards a defined `attachedLifecycle` value to `ReviewNotesDialog` when `isAttachedSession` is true (`:attached-lifecycle="isAttachedSession ? attachedLifecycle : undefined"`, line 1442); the component's template additionally has a catch-all `v-else` branch (line ~290) that renders a benign "requesting agent is waiting" notice for any unmatched lifecycle value (including `'ordinary'`), so even the brief reactive window before `reloadAttachedStatus()` resolves degrades to safe UI text, not a crash or data exposure. The plan's literal "structurally unreachable" framing is imprecise, but the actual consumer behaviour is safe. | closed |
| T-19-03-02 | Tampering | `session.value` narrowing fix behavioural drift | accept | Verified: `App.vue`'s session-shell fix (`v-else-if="session !== undefined"`, line 1258) reuses the file's own pre-existing `!== undefined`/`=== undefined` narrowing idiom (e.g. `pinnedSession`/`exactPatchSession` computeds, lines 157/160; `documentTitle` computed, line 250) verbatim. Plan's `<verify>` Playwright suites (`agent-ready-export-safety.spec.ts`, `complete-review-draft.spec.ts`, `review-notes-dialog.spec.ts`) cover the session-wiring paths; `19-03-SUMMARY.md` confirms 8/8 green. | closed |
| T-19-03-SC | Tampering | npm/pip/cargo installs | accept | Verified: `19-03-SUMMARY.md` key-files list only `src/web/model/review-draft-state.ts`, `src/web/App.vue`, `src/web/components/ReviewNotesDialog.vue` as modified — no `package.json`/`package-lock.json` change. | closed |
| T-19-04-01 | Tampering | `repository-gates` CI command-string contract pinned in 3 locations | mitigate | All 3 confirmed updated consistently: `.github/workflows/deploy-supabase-production.yml` line 28 (`- run: npm run typecheck:web`); `scripts/verify-supabase-support.mjs`'s `required` array (line 1736) and `gateCommands`-scoped array (line 1750) both include `'npm run typecheck:web'`; `tests/e2e/support-payment.spec.ts` line 222 adds the `['web typecheck', 'npm run typecheck:web', 'npm run typecheck:tests:web', 'workflow is missing required']` mutation-coverage row. | closed |
| T-19-04-02 | Repudiation | Silent future gate bypass / baseline re-introduction making the gate a no-op | mitigate | `scripts/verify-typecheck-negative-gate.mjs` exists and is committed (`47bff66` per `19-04-SUMMARY.md`); read in full — it mutates `PathDisplay.vue`'s `display` prop to `:display="42"`, asserts a `TS2322` error is reported for that file (gate genuinely fails), restores the original bytes in a `finally` block, then re-runs and asserts zero `PathDisplay.vue` error lines remain (gate genuinely clears). `package.json`'s `typecheck:web` script is the bare `"vue-tsc --noEmit --project tsconfig.web.json"` with no grep/filter/baseline/allowlist wrapping. | closed |
| T-19-04-SC | Tampering | npm/pip/cargo installs | accept | Verified: `19-04-SUMMARY.md` key-files list `.github/workflows/deploy-supabase-production.yml`, `scripts/verify-supabase-support.mjs`, `tests/e2e/support-payment.spec.ts`, `scripts/verify-typecheck-negative-gate.mjs` (created), and `package.json` (a new `verify:*` script entry added, not a dependency installed) — no package-manager install occurred. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| R-19-02-01 | T-19-02-01 | Type-narrowing fixes in `DiffWorkspace.vue`/`DraftRecovery.vue` reuse the file's own pre-existing strict-equality/discriminant idioms verbatim and are covered by existing Playwright regression suites (`anchored-workspace.spec.ts`, `anchored-review.spec.ts`, `draft-recovery-ui.spec.ts`), all confirmed green post-change. Compile-time-only change to already-correct runtime logic; no I/O/auth/validation surface touched. | gsd-security-auditor (verified) | 2026-11-04 |
| R-19-02-SC | T-19-02-SC | No package-manager install occurred in sub-plan 19-02 (source-only `.vue` edits; `19-02-SUMMARY.md` key-files confirm no `package.json`/lockfile change). | gsd-security-auditor (verified) | 2026-11-04 |
| R-19-03-01 | T-19-03-01 | The `AttachedLifecycle` consolidation's extra `'ordinary'` member reaching `ReviewNotesDialog.vue` is only reachable in a brief reactive window (before the attached-completion status loads), and the component's own fallback `v-else` branch renders safe, non-sensitive "waiting" UI text for any unmatched lifecycle value — no crash, no data exposure, no behavioural hazard. | gsd-security-auditor (verified) | 2026-11-04 |
| R-19-03-02 | T-19-03-02 | `App.vue`'s `session.value` narrowing fix reuses the file's own pre-existing `!== undefined` narrowing idiom verbatim (same pattern used by `pinnedSession`/`exactPatchSession`/`documentTitle` computeds); covered by 3 Playwright suites, all confirmed green. | gsd-security-auditor (verified) | 2026-11-04 |
| R-19-03-SC | T-19-03-SC | No package-manager install occurred in sub-plan 19-03 (source-only edits to `review-draft-state.ts`/`App.vue`/`ReviewNotesDialog.vue`; `19-03-SUMMARY.md` key-files confirm no `package.json`/lockfile change). | gsd-security-auditor (verified) | 2026-11-04 |
| R-19-04-SC | T-19-04-SC | No package-manager install occurred in sub-plan 19-04 (workflow/script/test edits plus one new committed script and one new `verify:*` npm script entry — no dependency added; `19-04-SUMMARY.md` key-files confirm). | gsd-security-auditor (verified) | 2026-11-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-11-04 | 11 | 11 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
