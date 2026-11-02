---
phase: 18-product-repositioning-copy
verified: 2026-11-02T16:22:07Z
status: passed
score: 3/3 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 18: Product Repositioning Copy Verification Report

**Phase Goal:** Loopnote's README, npm page, CLI copy, and browser workspace text describe local review for any agent-produced artifact (code, plans, decisions, docs), not just code diffs — with no hosted or multi-reviewer overclaim.
**Verified:** 2026-11-02T16:22:07Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Visitors to the README/npm page read Loopnote described as local review for any agent-produced artifact (code, plans, decisions, docs), with no hosted/multi-reviewer claim. | ✓ VERIFIED | `package.json` `description`: `"Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files"` — exact match to Approval-record Variant A. `README.md:3` tagline and `PRODUCT.md:5` "## Product" paragraph both contain the literal substring `agent-produced artifact` and list code/plans/decisions/docs — exact match to `18-COPY-DRAFT.md`'s approved "Proposed" text. `PRODUCT.md`'s "## Deliberate non-capabilities" paragraph (remote hosting, multi-user, approvals, …) is unchanged and automatically enforced against README/npm copy by `tests/unit/product-copy-claims.test.ts` (3/3 passing, re-run live — see Behavioral Spot-Checks). `npm keywords` array matches the Approval record's verbatim list (`code-review`, `ai-agents`, `claude-code`, `codex`, `markdown-review`, `local-first`, `git`, `diff-review`). |
| 2 | CLI users see `--help`, picker, and dirty-source copy that accurately describe uncommitted/standalone review; the old "staged, unstaged, and untracked bytes are ignored" wording is gone. | ✓ VERIFIED | `node dist/bin/loopnote.mjs --help` (rebuilt via `npm run build:runtime`, run live) prints `Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files` plus unchanged, already-compliant `--staged`/`--unstaged`/`--worktree`/`--base`/`[paths...]` descriptions — byte-identical to `18-COPY-DRAFT.md`'s approved CLI-copy section. `src/domain/source.ts` `DIRTY_EXPLANATION` now reads `"This worktree has uncommitted changes. This comparison reviews its committed HEAD only — use --worktree, --staged, or --unstaged to review the uncommitted changes directly."` — the banned "staged, unstaged, and untracked bytes are ignored" phrase is gone; `grep -rn "untracked bytes are ignored"` across the repo returns zero hits. `IdentityHeader.vue:161` screen-reader text updated to the same scoping fact (`"Committed HEAD reviewed; uncommitted changes aren't included."`). `BASE_PROMPT`/`HEAD_PROMPT`/`UNCOMMITTED_BASE_PROMPT` confirmed already compliant — no "cumpad" verb form exists (`grep -n "cumpad" src -r` → no hits). `tests/cli/help.test.ts` and `tests/cli/selection.test.ts` pin these exact strings (run live as part of `npm test` orchestrator evidence; `DIRTY_EXPLANATION` string directly grepped and confirmed in `tests/cli/selection.test.ts:655`). |
| 3 | Reviewers see browser workspace titles, labels, and empty states that fit artifact review rather than only code diffs. | ✓ VERIFIED | **Labels (D-08):** sidebar `<nav>`/`<ul role="tree">` `aria-label="Files"`, heading SR text `Files ({{ files.length }})`, decorative "Changed" eyebrow node deleted, filter-empty message `"Clear the filter to show all files."`, `ChangedFilesDialog.vue` `title="Files"`/`close-aria-label="Close files"`, `ActiveFileToolbar.vue` `'Open files'`/`'Show files sidebar'`/`'Hide files sidebar'`, `App.vue` skip-link `"Skip to files"` — all exact matches to `18-COPY-DRAFT.md`'s locked Sidebar table, and **behaviorally proven** (not just textually) by live Playwright locators `page.getByRole('navigation', { name: 'Files' })` / `getByRole('tree', { name: 'Files' })` / `getByRole('dialog', { name: 'Files' })` across `tests/e2e/file-tree.spec.ts`, `anchored-review.spec.ts`, `pinned-session.spec.ts`, `responsive-session.spec.ts` (these only pass if the rendered DOM actually carries the new labels). **Empty states (D-10):** `App.vue`'s `emptyFilesCopy` computed matches the locked table exactly — exact-patch unchanged, range branches gain the imperative next action, default/comparison branch drops "PR-style" jargon (`"No changes in this comparison." / "Relaunch with different Base/Head endpoints."`), and all three uncommitted sources render `` `No changes in ${uncommittedSourceLabel.value}.` `` / `"Edit files, then Refresh."` via a session-derived dynamic label (`staged→'Staged'`, `unstaged→'Unstaged'`, `worktree→'Working tree'`) — matches the Approval record's 2026-11-02 resolution verbatim. The comparison-branch string is live-Playwright-proven in `pinned-session.spec.ts:995`, `draft-recovery-ui.spec.ts:296`, `support-dialog.spec.ts:103/115/127/135`; the three uncommitted-source strings are simple, non-branching template renders of a one-line source-kind→label map, fully traceable from source and not exercised by a dedicated Playwright assertion (see Anti-Patterns note). **Tab title (D-09):** `src/contracts/api.ts` adds `repoName: z.string().optional()` to all three session response schemas; `src/server/capabilities.ts` populates it via `basename(...repositoryRoot)` at all 4 call sites; `App.vue`'s `sessionKindTitleSegment` computed returns `'Exact patch'` / `` `${changedFileCount} files` `` / `` `${uncommittedSourceLabel} vs HEAD` `` / `` `${files.length} files` `` per session kind (byte-identical to the Approval record's confirmed segments and D-09's literal CONTEXT examples); `documentTitle` composes `` `${RENAME_MAP.displayName} · ${repoName} · ${sessionKindTitleSegment}` ``; an `immediate: true` `watch(documentTitle, …)` sets `document.title` on load. `index.html`'s static `<title>Loopnote</title>` was deleted in the same commit, so the watcher is now the sole owner. Full data-flow traced end to end (schema → server → component → DOM); `repoName` itself is pinned in `tests/api/{exact-patch,session,uncommitted-session}.test.ts` response-key assertions. No Playwright `toHaveTitle`/`document.title` assertion exists for the composed string (see Anti-Patterns note) — this is a declarative, non-branching template binding, not a state-transition/cancellation/ordering invariant, so source-level wiring verification is sufficient per the verifier's behavior-dependence test. |

**Score:** 3/3 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `.planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md` | Single source of truth for every new copy string, ending in `## Approval record` | ✓ VERIFIED | 514 lines; contains full `## Approval record` section dated 2026-11-02 with every open question resolved (npm description variant, keywords, BASE_PROMPT, both tab-title segments, name story, skill version-acceptance range, uncommitted empty-state pattern). |
| `tests/unit/product-copy-claims.test.ts` | D-06 automated claims check: README/npm copy excludes PRODUCT.md's banned non-capability phrases, and the agent-artifact claim is backed by PRODUCT.md | ✓ VERIFIED | File reads `PRODUCT.md`'s "## Deliberate non-capabilities" paragraph dynamically (never a hardcoded duplicate list) and asserts README.md + package.json description/keywords exclude every banned phrase; asserts `agent-produced artifact` appears in both README and PRODUCT.md's "## Product" section; asserts npm keywords are non-empty. 3 tests, all passing (run live). |
| `tests/unit/rename-audit.test.ts` | Category-5 exception for `## Upgrading from Cumpa` section, zero disallowed "cumpa" hits elsewhere | ✓ VERIFIED | Real fixture-based tests (injects a disallowed hit in a temp git repo and asserts it's caught; injects an allowed exception pattern and asserts it's not flagged), plus a live-tree assertion. 3 tests, all passing (run live). |
| `docs/usage.md` | New file per D-11 outline — flags, starting a review, browser walkthrough, standalone-file review, refresh/snapshot semantics, draft location, export, agent request protocol | ✓ VERIFIED | 188 lines; all 9 outlined `##`/5 `###` sections present and populated (`## Flags and arguments`, `## Starting a review`, `## Reviewing in the browser`, `## Standalone-file review`, `## Refresh and snapshot semantics`, `## Draft location`, `## Exporting a review`, `## Agent request protocol` with its 5 subsections). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/contracts/api.ts` (`repoName` schema field) | `src/server/capabilities.ts` | `repoName: basename(...repositoryRoot)` at 4 response-construction sites | ✓ WIRED | Grep-confirmed at `capabilities.ts:428,757,1039,1396`. |
| `src/server/capabilities.ts` session response | `src/web/App.vue` `documentTitle`/`sessionKindTitleSegment` computeds | `session.value.repoName` read directly in the composed title string | ✓ WIRED | Code-read at `App.vue:231-240`. |
| `App.vue` `documentTitle` computed | `document.title` | `watch(documentTitle, (title) => { document.title = title }, { immediate: true })` | ✓ WIRED | `App.vue:313-315`; `index.html`'s static `<title>` tag removed in the same commit (`7c24098`), confirming the watcher is the sole writer. |
| `src/cli/picker.ts` | `src/domain/source.ts` | `import { DIRTY_ROW_LABEL, DIRTY_EXPLANATION }` — unchanged import, only the constant values changed | ✓ WIRED | Consumed unchanged per `18-COPY-DRAFT.md`'s key-link note; no signature change. |
| `tests/unit/product-copy-claims.test.ts` | `PRODUCT.md` | `readFileSync` + regex extraction of "## Deliberate non-capabilities" paragraph, split into the banned-phrase list | ✓ WIRED | Confirmed by reading the test source directly — never a hardcoded duplicate list, so it stays in sync with PRODUCT.md automatically. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| CLI `--help` prints the approved positioning + flag copy | `node dist/bin/loopnote.mjs --help` (after `npm run build:runtime`) | Printed `Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files` plus unchanged option descriptions, byte-identical to the approved draft | ✓ PASS |
| D-06 claims-check + rename-audit tests pass | `node node_modules/vitest/vitest.mjs run tests/unit/product-copy-claims.test.ts tests/unit/rename-audit.test.ts` | `Test Files 2 passed (2)`, `Tests 6 passed (6)` | ✓ PASS |
| npm package `description`/`keywords` match the Approval record | `node -e "console.log(require('./package.json').description, require('./package.json').keywords)"` | Exact match to Approval-record Variant A text and the 8-item keyword list | ✓ PASS |
| "Files" sidebar/dialog labels actually render (not just source edits) | Live Playwright locators `page.getByRole('navigation'/'tree'/'dialog', { name: 'Files' })` in `file-tree.spec.ts`, `anchored-review.spec.ts`, `pinned-session.spec.ts`, `responsive-session.spec.ts` (orchestrator-run, 111 passed) | Locators present and asserted; orchestrator Playwright run reported 111 passed, only pre-existing `selector-drift-ui.spec.ts:423/:441` failures (unrelated file, failing since 3196e96, predates this phase) | ✓ PASS |
| "No changes in this comparison." empty-state copy actually renders | Live Playwright assertions in `pinned-session.spec.ts:995`, `draft-recovery-ui.spec.ts:296`, `support-dialog.spec.ts:103/115/127/135` (orchestrator-run) | All passing per orchestrator evidence | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| POS-01 | 18-01, 18-02 | README/npm positioning describes any agent-produced artifact, no hosted/multi-reviewer claim | ✓ SATISFIED | `package.json` description, `README.md` tagline, `PRODUCT.md` "## Product" paragraph, D-06 claims-check test all confirmed above. |
| POS-02 | 18-01, 18-03, 18-04, 18-05 | `--help`/picker/dirty-source copy accurate; "staged, unstaged, untracked bytes ignored" wording gone | ✓ SATISFIED | CLI `--help` output exercised live; `DIRTY_EXPLANATION`/`IdentityHeader.vue` screen-reader text confirmed; zero repo-wide hits for the banned phrase. |
| POS-03 | 18-01, 18-04, 18-05 | Browser workspace titles/labels/empty states fit artifact review | ✓ SATISFIED | Sidebar/dialog "Files" labels Playwright-proven; empty states match the locked D-10 table; tab title wired end-to-end per D-09 (source-traced, see note above). |

**Note:** `.planning/REQUIREMENTS.md` still shows POS-01/02/03 as unticked `[ ]` / "Pending" in its status table. This is a planning-document bookkeeping lag — the same category of staleness the phase's own `18-COPY-DRAFT.md` flagged for Phase 16's MDV-01..04 checkboxes — not evidence of missing functionality; every requirement's underlying codebase claim is directly verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/web/App.vue` | 231-240 | `documentTitle`/`sessionKindTitleSegment` computeds have no Playwright `toHaveTitle`/`document.title` assertion | ℹ️ Info | Wiring is fully traced from schema → server → component → DOM watcher and is a simple non-branching template, so source evidence is sufficient; a future regression in this string would not be caught by the test suite, only by source review. |
| `src/web/App.vue` | 219-223 | Uncommitted-source-specific empty-state strings (`No changes in Staged./Unstaged./Working tree.`) are not individually Playwright-asserted (only the default/comparison branch is) | ℹ️ Info | Logic is a simple one-line source-kind→label map, matches `18-CONTEXT.md`'s own literal "Working tree" example verbatim; source-level confidence is high, but a future regression in Staged/Unstaged wording specifically would not be caught by the e2e suite. |
| `.planning/REQUIREMENTS.md` | 70-72, 134-136 | POS-01..03 checkboxes/status table still show `[ ]`/"Pending" | ℹ️ Info | Planning-doc tracking lag, not a functional gap (precedented by the same doc's stale MDV-01..04 rows). |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any of the 26 files changed by this phase.

### Human Verification Required

None. Every truth resolved via direct source inspection, live CLI execution, live unit-test execution, and existing live Playwright assertions (orchestrator-run). The two items noted above (tab-title and per-source empty-state strings lacking dedicated Playwright coverage) are simple, non-branching, fully source-traceable template renders — not state-transition or cancellation/ordering invariants — so they do not meet the behavior-dependent bar that would route them to human verification.

### Gaps Summary

None. All three ROADMAP success criteria (POS-01, POS-02, POS-03) are verified against the live codebase: `package.json`, `README.md`, `PRODUCT.md`, `docs/usage.md`, `src/cli/run.ts`, `src/domain/source.ts`, and the five Vue components all carry the exact strings recorded in `18-COPY-DRAFT.md`'s human-approved `## Approval record`. The D-06 automated claims-check test and the rename-audit test both pass live. The rebuilt CLI's `--help` output matches the approved copy byte-for-byte. Playwright already proves the "Files" rename and the default-branch empty-state copy render in a live browser.

---

_Verified: 2026-11-02T16:22:07Z_
_Verifier: the agent (gsd-verifier)_
