# Phase 18: Product Repositioning Copy - Research

**Researched:** 2026-10-31
**Domain:** User-facing copy inventory (README, npm manifest, CLI, browser workspace) — no new libraries, no runtime architecture
**Confidence:** HIGH

## Summary

Phase 18 is copy-only: it rewrites every user-facing string that currently describes the product as "committed local Git comparisons" / code-diff review into language that covers any agent-produced artifact (code, plans, decisions, docs), per POS-01..03. It has zero external dependencies — no packages, no new components, no new DOM structure (confirmed by the already-approved `18-UI-SPEC.md`, which touches only `aria-label`/`title`/text-node values in six existing Vue files and `index.html`). It depends on Phase 17.1 (full project rename), which is **planned but not executed**: no product display name exists yet. All new-copy examples in this research and in any copy drafted from it **must** use the literal placeholder `<Name>`, resolved later via `deriveProductIdentity()` (`src/domain/product-identity.ts`, not yet created) — never a guessed or literal name.

Three further facts drive the plan this research feeds:
1. The dirty/uncommitted explanatory phrase POS-02 requires removed ("staged, unstaged, and untracked bytes are ignored") exists as **two non-identical hardcoded strings** in two files (`src/domain/source.ts` constant, `IdentityHeader.vue` inline template text) — both must change, and they are not currently kept in sync by any shared import.
2. The browser-tab loading heading (`App.vue:1208`) hardcodes the literal word `"Cumpa"` directly in a template expression, not sourced from any identity module — this is a second, independent "Cumpa" literal (on top of the `index.html` `<title>`) this phase (not 17.1) must resolve, since 17.1 only renames identifiers/package/CLI forms mechanically per its plan and D-13 explicitly defers "name story" prose to 18.
3. Roughly 30 Playwright assertions across `tests/e2e/` and `tests/integration/` pin the exact strings "Changed files" (sidebar aria-labels/heading/dialog title), "No PR-style changes in this pinned comparison", "Dirty bytes ignored" + its visually-hidden explanation, and "No changes match this review scope" — every one of these must be updated in the same commit as the copy change or the suite breaks immediately.

**Primary recommendation:** Treat this as a grounded find-and-replace problem, not a design problem. Plan 1 (per D-05) should walk the inventory below top-to-bottom, draft the replacement for each row into `18-COPY-DRAFT.md`, and end on the blocking human checkpoint; Plan 2 applies only approved rows and updates every e2e assertion string in the same wave so nothing ships red.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| README / npm `description`+`keywords` positioning copy | Docs / Distribution (npm registry page) | — | Static Markdown/manifest fields, rendered by GitHub/npm, no runtime |
| CLI `--help`, picker prompts, dirty-source labels | CLI (Commander + Inquirer-style search prompts) | — | `src/cli/run.ts` / `src/cli/picker.ts` own all terminal-rendered strings |
| Dirty/uncommitted explanatory text | CLI (source of truth) + Browser/Client (duplicate render) | — | `src/domain/source.ts` constants feed CLI picker rows; `IdentityHeader.vue` independently hardcodes an overlapping but non-identical sentence for the web dirty badge |
| Sidebar title, aria-labels, empty states, tab title | Browser / Client | — | Pure Vue template/computed string edits in `src/web/components/*.vue` and `src/web/App.vue`; no SSR, no API change except the already-flagged `<repo>` tab-title field gap |
| Claims-check test (D-06) | Node test runner (Vitest, existing `test:unit`/`test:api` harness) | Docs (PRODUCT.md as source of truth) | New automated check asserts README/npm copy excludes PRODUCT.md's non-capability phrases; belongs beside existing `tests/unit`/`tests/api` suites, not a new framework |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** **Agent artifacts first.** Lead with reviewing what a coding agent produced, locally: code, plans, decisions, docs. Code diffs are one artifact type among several. Matches POS-01 and the v2.0 bet.
- **D-02:** **npm `description`: Claude's discretion.** The copy draft (D-05) proposes 2–3 variants and the user picks one.
- **D-03:** **Add npm `keywords`:** e.g. `code-review`, `ai-agents`, `claude-code`, `codex`, `markdown-review`, `local-first` (final list in the copy draft).
- **D-04:** **Product-neutral voice** (third person/imperative, factual, like the current README). No founder first-person voice.
- **D-05:** **Draft first, then apply.** Plan 1 writes `.planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md` with every user-facing string to change (README sections, npm description variants + keywords, `--help`, picker prompts, dirty/uncommitted/standalone copy, workspace titles/labels/empty states, docs/usage.md outline). It ends with a **blocking human checkpoint** for approval. A second plan applies only the approved copy. Nothing ships before approval.
- **D-06:** **Claims check is automated:** add a test/check that README and npm copy contain none of PRODUCT.md's "Deliberate non-capabilities" claims (hosted, cloud sync, multi-user, approvals, …) and that the claimed capabilities exist in v2.0. Update PRODUCT.md's capability list to v2.0 in the same phase, so the check has an accurate source.
- **D-07:** **The umbrella noun is "Review"** for every session kind. Use "comparison" only where Base/Head literally exist (identity header for committed and uncommitted sessions).
- **D-08:** **The sidebar title is always "Files"** (replacing "Changed files" everywhere).
- **D-09:** **Browser tab title: `<Name> · <repo> · <session kind>`**, e.g. `<Name> · diff-review · Working tree vs HEAD`, `<Name> · diff-review · 3 files`.
- **D-10:** **Empty states are factual plus the next action**, e.g. `No changes in Working tree. Edit files, then Refresh.` No jokes.
- **D-11:** **Short README sections + `docs/usage.md`.** The README gets one example each: committed range, `--worktree`/`--staged`/`--unstaged`, standalone files, Markdown toggle, agent request. `docs/usage.md` holds the full reference (flags, edge cases, Refresh, snapshot semantics, exports).
- **D-12:** **Version-agnostic release wording:** replace pinned-version claims (README "Stable 1.5.0 is published…") with wording that doesn't rot. Keep "independently verified" claims only where they are true for a specific published version. The marketplace skill copy belongs to Phases 17/17.1.
- **D-13:** **Name story:** the old story was removed in 17.1. Any story for the new name is optional and drafted in `18-COPY-DRAFT.md` only if the new name has one. User sign-off required.

### Claude's Discretion

- npm description variants (D-02), the exact keyword list (D-03), and the docs/usage.md structure.
- Also update POS-02's "dirty-source" strings: `DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION` in `src/domain/source.ts` ("staged/unstaged ignored" wording must be gone).

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POS-01 | Visitors to the README and npm page read Cumpa described as local review for any agent-produced artifact (code, plans, decisions, docs), with no hosted or multi-reviewer claim. | README.md inventory rows (tagline, name section, `## Install`/install prose) + PRODUCT.md "Product"/"Deliberate non-capabilities" baseline below; D-06 claims-check target list |
| POS-02 | CLI users see `--help`, picker, and dirty-source copy that describe uncommitted and standalone review accurately; the "staged, unstaged, and untracked bytes are ignored" wording is gone. | Commander `.description()`/`.option()` rows, `BASE_PROMPT`/`HEAD_PROMPT`/`UNCOMMITTED_BASE_PROMPT` rows, `DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION` rows (both `source.ts` and the duplicate in `IdentityHeader.vue`) below |
| POS-03 | Reviewers see browser workspace titles, labels, and empty states that fit artifact review rather than only code diffs. | `18-UI-SPEC.md` (locked, approved design contract) rows + `index.html`/`App.vue` loading-heading/tab-title rows below, cross-referenced not re-derived |
</phase_requirements>

## Standard Stack

none — no new libraries. This phase edits existing Markdown, JSON manifest fields, and TypeScript/Vue string literals only. The D-06 claims-check test runs on the project's existing Vitest harness (`test:unit`/`test:api` scripts, `vitest@4.1.10` already a devDependency per `package.json`) — no new test framework.

**Installation:** not applicable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolving the product display name in new copy | A new name-derivation helper, or a hardcoded guess | `deriveProductIdentity()` output / `<Name>` placeholder (Phase 17.1, not yet executed) | 17.1-01-PLAN.md already defines the single source of truth for all 9 derived forms (display name, npm package, bin/CLI slug, state dirs, protocol kind prefix, env/CSS/TS prefixes); duplicating derivation here risks drift the 17.1 grep audit won't catch |
| Checking README/npm copy for banned non-capability phrases | A manual checklist in a PLAN.md or SUMMARY.md | An automated Vitest/Node check (D-06) reading `PRODUCT.md`'s "Deliberate non-capabilities" list as its source list | Manual review drifts silently on every future README edit; D-06 explicitly calls for an automated, re-runnable check |

**Key insight:** every string this phase touches already exists and is already grep-able; the work is enumerating and replacing, not building new mechanism.

## Common Pitfalls

### Pitfall 1: The dirty-explanation string is duplicated, not shared, and the two copies already disagree
**What goes wrong:** A plan edits `DIRTY_EXPLANATION` in `src/domain/source.ts` and assumes the web dirty badge updates with it.
**Why it happens:** `IdentityHeader.vue:160` hardcodes its own visually-hidden sentence — `"Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored."` — which is already textually different from `src/domain/source.ts:3`'s `"The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored."` There is no import between them.
**How to avoid:** Treat these as two separate inventory rows (see table below) and edit both files in the same plan/commit. Consider (planner's call, not locked by CONTEXT.md) whether `IdentityHeader.vue` should import `DIRTY_EXPLANATION` instead of re-hardcoding it, to prevent a third drift.
**Warning signs:** grep for `"staged, unstaged"` after the edit — any remaining hit is a missed call site.

### Pitfall 2: `App.vue`'s loading heading hardcodes the literal word "Cumpa", independent of `index.html`'s `<title>`
**What goes wrong:** A plan assumes fixing `index.html:7`'s `<title>Cumpa</title>` (owned by D-09's dynamic-title wiring) is the only "Cumpa" literal in the web shell.
**Why it happens:** `App.vue:1208` renders `{{ isExactPatchSession ? 'Cumpa: loading exact patch' : 'Cumpa: loading pinned comparison' }}` as a template string literal — not sourced from any shared constant, not touched by the D-09 tab-title computed value (which only sets `document.title`, not this `<h1>`).
**How to avoid:** Add this row explicitly to the copy draft; resolve via `<Name>` placeholder like every other new-copy row.
**Warning signs:** grep `src/web -e "'Cumpa"` (or the equivalent post-17.1 literal) after edits — any hit outside a still-valid `.cumpa/` directory-name reference is a miss.

### Pitfall 3: ~30 Playwright string assertions pin exact copy; updating source without updating tests breaks CI immediately
**What goes wrong:** Copy is applied in one plan/wave, and e2e/integration specs are left for "later."
**Why it happens:** Playwright's `getByRole(..., { name: 'Changed files', exact: true })` and `getByText('Dirty bytes ignored', { exact: true })` style assertions (see **Existing E2E String Assertions** below) match literal strings with no normalization; any copy change makes the locator resolve to zero elements and the test fails on the next run, not silently.
**How to avoid:** D-05's "apply" plan must update every assertion row in the **Existing E2E String Assertions** table in the same wave as the corresponding source edit — these are not optional follow-up work, they are part of "done" for POS-02/POS-03.
**Warning signs:** `npm run test:browser` / `npm run test:package` failing with "locator resolved to 0 elements" immediately after a copy-only commit.

### Pitfall 4: `docs/usage.md` does not exist yet — D-11 requires creating it, not editing it
**What goes wrong:** A plan searches for an existing `docs/usage.md` to amend and finds nothing, or conflates it with the two unrelated existing docs.
**Why it happens:** `find . -path '*/docs/*' -name '*.md'` currently returns only `docs/distribution-operations.md` (maintainer release/legal evidence policy) and `docs/support-service-operations.md` (hosted-support production-boundary notes) — both are internal maintainer-ops documents, outside this phase's user-facing scope, and neither is a usage reference.
**How to avoid:** Treat `docs/usage.md` as a new file to create per D-11; do not touch the two existing `docs/*.md` files (they describe release/support process, not product capabilities, and are not named in `18-CONTEXT.md`'s canonical_refs).

### Pitfall 5: The `<repo>` segment of the D-09 tab-title pattern has no data source yet
**What goes wrong:** A plan implements `document.title = '<Name> · <repo> · <session kind>'` assuming `<repo>` is already available somewhere in session state.
**Why it happens:** `18-UI-SPEC.md`'s own Open Questions section confirms: no `repoName`/equivalent field exists anywhere in `src/contracts/api.ts` or `src/web` today; it is a wiring gap, not a copy gap.
**How to avoid:** The planner must size a minimal server-side field (likely the resolved repo root's basename) added to the session response, plus the client-side `document.title` watcher — this is implementation work carried by the UI-SPEC's already-approved contract, not something this research re-derives.

## User-Facing String Inventory

| File:Symbol/Line | Current String | Scope | Governing Decision |
|---|---|---|---|
| `README.md:1` | `# Cumpà` | README | D-13 (name story optional, user sign-off) |
| `README.md:3` | `Cumpà gives committed local Git comparisons a pull-request-style review workspace without publishing a branch or worktree. Choose local branches or registered worktrees, leave durable feedback, and export it for an agent or teammate to use.` | README | D-01 (agent-artifacts-first lead) |
| `README.md:5` | `Published as **\`@shipwithai/cumpa\`**; command **\`cumpa\`**.` | README | D-13 / depends on Phase 17.1 derived npm/bin forms |
| `README.md:7` | `Stable \`1.5.0\` is published on npm. Its registry bytes, provenance attestation, and global, \`npx\`, and marketplace installation paths were verified during release acceptance. Source and the sole support channel are the public [Ship-With-AI/cumpa](https://github.com/Ship-With-AI/cumpa) repository and its [Issues tracker](https://github.com/Ship-With-AI/cumpa/issues).` | README | D-12 (version-agnostic wording; drop pinned `1.5.0` claim) |
| `README.md:9-15` | `## The name` section — Neapolitan `cumpà`/`compare` etymology story | README | D-13 (old story removed by 17.1 D-12; new story optional, drafted only if `<Name>` has one) |
| `README.md:106-108` | `## Start a review` / "This is the interactive terminal route. If you use the Cumpà skill, your agent performs this launch for you with pinned OIDs and hands you the review URL; skip to [Review in the browser](#review-in-the-browser)." | README | D-01 |
| `README.md:117-119` | "Cumpà first asks you to choose the **base**, then the **head**... The comparison is a diff from the selected base and head's merge base to the selected head. If a selected worktree is dirty, Cumpà uses its committed HEAD only; uncommitted worktree bytes are not reviewed." | README | POS-02 / D-11 (needs a `--worktree`/`--staged`/`--unstaged` example per D-11; "uncommitted worktree bytes are not reviewed" is stale now that uncommitted review ships) |
| `README.md:125-134` | `## Review in the browser` numbered steps 1–6 (file tree, Monaco diff, comments, Review summary, resolve, export) | README | D-01 / D-07 (step 1 says "file tree", compatible with D-08's "Files" sidebar) |
| `README.md:163-178` | `## Keyboard shortcuts` table, row `Move in the changed-file tree; open a file` | README | D-08 (sidebar noun is "Files", not "changed-file tree") |
| `README.md:180-186` | `## Review changes from a coding agent` intro prose | README | D-01 (agent-request protocol is itself evidence for the agent-artifacts-first positioning) |
| `README.md:282-286` | `## v1 file limits` — "Cumpà reviews regular UTF-8 text files only..." | README | D-12 (confirm "v1" framing is still accurate / version-agnostic per current major version) |
| `README.md:294-296` | `## Voluntary support` prose | README | out of phase scope (no POS-0x decision targets it); leave unless incidentally touched by name forms |
| `PRODUCT.md:5` | `Cumpa is a local-first code review application for committed changes between two local Git branch or registered-worktree heads. Its core value is precise review feedback without publishing the comparison to a remote host.` | docs (claims source) | D-01 / D-06 (must be updated to v2.0 capabilities so the claims-check test has an accurate source) |
| `PRODUCT.md:6` | `Cumpa is the product name used across the CLI, browser workspace, exports, and repository-local state.` | docs | depends on Phase 17.1 name |
| `PRODUCT.md:13-22` | `## Supplied capabilities` bullet list (see **PRODUCT.md Claims Baseline** below) | docs (D-06 claims-check source) | D-06 |
| `PRODUCT.md:24-26` | `## Deliberate non-capabilities` paragraph (see baseline below) | docs (D-06 claims-check source) | D-06 |
| `package.json:4` | `"description": "Local-first review of pinned Git comparisons"` | npm | D-01, D-02 (Claude's discretion — draft 2–3 variants) |
| `package.json` | no `"keywords"` field present | npm | D-03 (add `code-review`, `ai-agents`, `claude-code`, `codex`, `markdown-review`, `local-first`, final list at Claude's discretion) |
| `src/cli/run.ts:1455` | `.name('cumpa')` | CLI | depends on Phase 17.1 derived CLI slug, not a copy decision |
| `src/cli/run.ts:1456` | `.description('Local-first review of pinned Git comparisons')` | CLI (`--help` header) | D-01, mirrors `package.json:4` — keep in sync |
| `src/cli/run.ts:1458` | `.option('--staged', 'Review staged changes (HEAD→index) against a base')` | CLI (`--help`) | POS-02 — confirm wording already accurate; likely no change needed, verify in draft |
| `src/cli/run.ts:1459` | `.option('--unstaged', 'Review unstaged changes (index→working tree)')` | CLI (`--help`) | POS-02 |
| `src/cli/run.ts:1460` | `.option('--worktree', 'Review all working-tree changes (HEAD→working tree), including untracked files')` | CLI (`--help`) | POS-02 |
| `src/cli/run.ts:1461` | `.option('--base <ref>', 'Base ref or registered worktree to compare against (default: HEAD); rejected with --unstaged')` | CLI (`--help`) | POS-02 |
| `src/cli/run.ts:1462` | `.argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')` | CLI (`--help`) | POS-02 / D-01 (standalone-file review as an "artifact", not just diff) |
| `src/cli/picker.ts:14-15` | `const BASE_PROMPT = 'Choose base — changes will be cumpad from its merge base with head';` | CLI (picker) | POS-02 — "cumpad" is a verbed form of the old name; depends on Phase 17.1 for any name-verb form, or should be reworded to avoid verbing the name at all (flag for draft) |
| `src/cli/picker.ts:16-17` | `const HEAD_PROMPT = 'Choose head — this committed state will be reviewed';` | CLI (picker) | POS-02 |
| `src/cli/picker.ts:30-31` | `const UNCOMMITTED_BASE_PROMPT = 'Choose base — changes will be compared from its merge base with HEAD';` | CLI (picker) | POS-02 |
| `src/domain/source.ts:1` | `export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';` | CLI (picker row label) | POS-02, Claude's Discretion (listed explicitly in CONTEXT.md) |
| `src/domain/source.ts:2-3` | `export const DIRTY_EXPLANATION = "The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored.";` | CLI (picker row detail) | POS-02 — **must remove the "staged, unstaged, and untracked bytes are ignored" enumeration**, Claude's Discretion for replacement wording |
| `src/domain/source.ts:4` | `export const PENDING_ROW_LABEL = 'Checking worktree state…';` | CLI (picker row label) | not targeted by POS-02 wording ban; verify unchanged unless incidentally affected |
| `src/domain/source.ts:5-6` | `export const UNAVAILABLE_WORKTREE_REASON = 'Unavailable — this registered worktree cannot be resolved. Choose another entry or repair it with Git.';` | CLI (picker row detail) | not targeted by POS-02 wording ban; verify unchanged |
| `src/web/index.html:7` | `<title>Cumpa</title>` | web | D-09 — static tag replaced by a runtime `document.title` assignment (`<Name> · <repo> · <session kind>`); see UI-SPEC Pitfall note: no prior `document.title` pattern exists in `src` |
| `src/web/App.vue:199-200` | `heading: 'No files in this exact patch', message: 'This accepted patch contains no changed file entries. Relaunch with a non-empty already-applied patch.'` | web (empty state, exact-patch) | D-10 (factual + next-action pattern); not explicitly itemized in `18-UI-SPEC.md`'s empty-state table — confirm whether in scope during draft |
| `src/web/App.vue:204-208` | `heading: 'No changes match this review scope', message:` (two branches, pathspec-present / absent) | web (empty state, pinned range) | D-10, matches `18-UI-SPEC.md`'s "Pinned range, with/without scope" rows — add missing next-action sentence |
| `src/web/App.vue:211-217` | `heading: 'No changes', message:` (three branches: staged / unstaged / worktree, each naming `{base}`) | web (empty state, uncommitted) | D-10, matches `18-UI-SPEC.md`'s "Uncommitted, worktree" row; staged/unstaged branches also need the factual+next-action treatment, not only the worktree branch shown in the UI-SPEC's single worked example |
| `src/web/App.vue:219-222` | `heading: 'No PR-style changes in this pinned comparison', message: 'The selected head has no changes from the displayed merge base.'` | web (empty state, pinned comparison default) | D-10 / D-07 ("comparison" correct here — Base/Head literally exist); drops "PR-style" jargon per POS-03 |
| `src/web/App.vue:1208` | `` {{ isExactPatchSession ? 'Cumpa: loading exact patch' : 'Cumpa: loading pinned comparison' }} `` | web (loading heading `<h1 id="loading-heading">`) | D-09 scope gap — literal "Cumpa" hardcoded independent of `index.html`'s title; must resolve via `<Name>` (see Pitfall 2) |
| `src/web/App.vue:1225` | `<a ... class="skip-link" href="#changed-files-heading">Skip to changed files</a>` | web (skip link) | D-08 ("Files" sidebar noun) |
| `src/web/components/FileTree.vue:155` | `<nav class="file-tree-pane" aria-label="Changed files">` | web (sidebar nav landmark) | D-08 |
| `src/web/components/FileTree.vue:157-161` | `<h2 id="changed-files-heading" ...><span aria-hidden="true">Files</span><span class="visually-hidden">Changed files ({{ files.length }})</span>...<span class="file-tree-pane__eyebrow" aria-hidden="true">Changed</span></h2>` | web (sidebar heading, visible + SR text + decorative eyebrow) | D-08 — visible "Files" text already compliant; SR-only "Changed files (N)" and decorative "Changed" eyebrow `<span>` need updating/removal per `18-UI-SPEC.md` |
| `src/web/components/FileTree.vue:191-192` | `<ul ... role="tree" aria-label="Changed files" aria-labelledby="changed-files-heading" ...>` | web (file tree `aria-label`) | D-08 |
| `src/web/components/FileTree.vue:225-226` | `<h3 id="tree-empty-heading">No matching files</h3><p>Clear the filter to show all changed files.</p>` | web (filter-empty state) | D-08 (word swap "changed files" → "files"); heading already compliant per UI-SPEC |
| `src/web/components/ChangedFilesDialog.vue:30,32` | `title="Changed files"` ... `close-aria-label="Close changed files"` | web (mobile files dialog) | D-08 |
| `src/web/components/ActiveFileToolbar.vue:71` | `computed(() => props.filesDrawer ? 'Files' : props.filesCollapsed ? 'Show files' : 'Hide files')` | web (visible button labels) | D-08 — already compliant, no change needed |
| `src/web/components/ActiveFileToolbar.vue:72-74` | `computed(() => props.filesDrawer ? 'Open changed files' : props.filesCollapsed ? 'Show changed files sidebar' : 'Hide changed files sidebar')` | web (`aria-label`s paired with the above) | D-08 — must change to "Open files" / "Show files sidebar" / "Hide files sidebar" |
| `src/web/components/IdentityHeader.vue:158` | `<span>Dirty bytes ignored</span>` | web (dirty badge visible text) | POS-02 — **unchanged**, already compliant per `18-UI-SPEC.md` |
| `src/web/components/IdentityHeader.vue:159-161` | `<span class="visually-hidden">Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.</span>` | web (dirty badge SR-only text) | POS-02 — must remove the enumeration; this is a **separate, independently-hardcoded string** from `src/domain/source.ts:2-3` (see Pitfall 1) |
| `src/web/components/IdentityHeader.vue:152` | `{{ isExactPatch ? 'Frozen patch' : (isUncommitted \|\| isStandalone) ? 'Frozen snapshot' : 'Pinned comparison' }}` | web (pin-cue badge) | D-09 (grounded precedent cited for proposed "Exact patch" tab-title segment); not itself flagged for wording change |
| `src/web/components/IdentityHeader.vue:50-51` | `` controlSafeDisplay(`Standalone review · ${standaloneSession.value?.changedFileCount ?? 0} files`) `` | web (standalone identity label) | D-07 ("Review" umbrella noun); source for D-09's `<Name> · <repo> · 3 files` tab-title segment |
| `docs/usage.md` | does not exist | docs | D-11 — **new file to create**, full reference (flags, edge cases, Refresh, snapshot semantics, exports); see Pitfall 4 |
| `docs/distribution-operations.md`, `docs/support-service-operations.md` | existing maintainer-ops docs (release/legal evidence policy; hosted-support production boundary) | docs | out of phase scope — internal process docs, not product-capability copy, not named in `18-CONTEXT.md` canonical_refs |

## Existing E2E String Assertions

| File:Line | Literal Asserted String |
|---|---|
| `tests/e2e/anchored-review.spec.ts:351` | `page.getByRole('button', { name: 'Open changed files', exact: true })` |
| `tests/e2e/anchored-review.spec.ts:353` | `page.getByRole('dialog', { name: 'Changed files', exact: true })` |
| `tests/e2e/anchored-review.spec.ts:354` | `page.getByRole('button', { name: 'Close changed files' })` |
| `tests/e2e/file-tree.spec.ts:389-391` | `page.getByRole('navigation', { name: 'Changed files' })`; `page.getByRole('tree', { name: 'Changed files' })`; `page.getByRole('heading', { name: /^Changed files \(\d+\)$/ })` |
| `tests/e2e/file-tree.spec.ts:531-532` | `page.getByRole('navigation', { name: 'Changed files' })`; `page.getByRole('tree', { name: 'Changed files' })` |
| `tests/e2e/file-tree.spec.ts:594-597` | `page.getByRole('heading', { name: 'No matching files' })`; `navigation.getByText('Clear the filter to show all changed files.', { exact: true })` |
| `tests/e2e/file-tree.spec.ts:650-651` | `page.getByRole('navigation', { name: 'Changed files' })`; `page.getByRole('tree', { name: 'Changed files' })` |
| `tests/e2e/pinned-session.spec.ts:400` | `page.getByRole('tree', { name: 'Changed files' })` |
| `tests/e2e/pinned-session.spec.ts:489-490` | `page.getByRole('heading', { name: 'No changes match this review scope' })`; `page.getByText('The pinned commits contain no changed files.')` |
| `tests/e2e/pinned-session.spec.ts:785,788` | `page.getByRole('heading', { name: 'Changed files (3)' })`; `page.getByRole('tree', { name: 'Changed files' })` |
| `tests/e2e/pinned-session.spec.ts:819` | `page.getByText('Dirty bytes ignored', { exact: true })` |
| `tests/e2e/pinned-session.spec.ts:895,917,931` | `page.getByRole('navigation', { name: 'Changed files' })` (×3, error/stopped states) |
| `tests/e2e/pinned-session.spec.ts:968-976` | `page.getByText('Dirty bytes ignored', { exact: true })`; `.getByText('Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.', { exact: true })` |
| `tests/e2e/pinned-session.spec.ts:993,995` | `page.getByRole('heading', { level: 2, name: 'No PR-style changes in this pinned comparison' })`; `page.getByText('0 changed files', { exact: true })` (asserts absence) |
| `tests/e2e/responsive-session.spec.ts:505` | `page.getByRole('button', { name: width <= 760 ? 'Open changed files' : 'Hide changed files sidebar', exact: true })` |
| `tests/e2e/responsive-session.spec.ts:511,545` | `page.getByRole('dialog', { name: 'Changed files', exact: true })` (×2) |
| `tests/e2e/responsive-session.spec.ts:1000,1004` | `page.getByRole('button', { name: 'Open changed files', exact: true })`; `page.getByRole('dialog', { name: 'Changed files', exact: true })` |
| `tests/e2e/responsive-session.spec.ts:1061,1064` | `page.getByRole('button', { name: 'Open changed files', exact: true })`; `page.getByRole('dialog', { name: 'Changed files', exact: true })` |
| `tests/e2e/responsive-session.spec.ts:1085` | `page.getByRole('navigation', { name: 'Changed files', exact: true })` |
| `tests/e2e/responsive-session.spec.ts:1108-1109,1122-1123` | `page.getByRole('button', { name: 'Open changed files', exact: true })`; `page.getByRole('dialog', { name: 'Changed files', exact: true })` (×2, accessibility-emulation blocks) |
| `tests/e2e/responsive-session.spec.ts:1148,1164` | `page.getByRole('button', { name: 'Hide changed files sidebar', exact: true })`; `page.getByRole('button', { name: 'Show changed files sidebar', exact: true })` |
| `tests/e2e/responsive-session.spec.ts:1229,1252` | `page.getByRole('button', { name: 'Hide changed files sidebar', exact: true })` (×2, desktop breakpoints) |
| `tests/e2e/responsive-session.spec.ts:1323-1324,1359-1360` | `page.getByRole('button', { name: 'Open changed files', exact: true })`; `page.getByRole('dialog', { name: 'Changed files', exact: true })` |
| `tests/integration/anchored-workspace.spec.ts:576,918-919` | `page.getByRole('button', { name: 'Open changed files', exact: true })`; `page.getByRole('dialog', { name: 'Changed files', exact: true })` |
| `tests/integration/anchored-workspace.spec.ts:929` | `page.getByRole('button', { name: 'Hide changed files sidebar', exact: true })` |
| `tests/integration/draft-recovery-ui.spec.ts:295` | `page.getByRole('heading', { name: 'No PR-style changes in this pinned comparison' })` |
| `tests/integration/draft-recovery-ui.spec.ts:377` | `page.getByRole('heading', { name: 'No files in this exact patch' })` |
| `tests/integration/support-dialog.spec.ts:102,114,126,134` | `page.getByText('No PR-style changes in this pinned comparison')` (×4) |

Not yet matched by grep but implied by the inventory above and worth a planner-time re-check once copy is drafted: any assertion targeting `"No changes"` (uncommitted empty-state heading) or `"Cumpa: loading..."` — none were found in the current `tests/e2e`/`tests/integration` trees at research time, but the exact replacement strings chosen in `18-COPY-DRAFT.md` should be re-grepped against the full test tree before the apply plan closes, since Playwright locator strings are easy to miss by partial match.

## PRODUCT.md Claims Baseline

Verbatim from `/Users/alessandro/projects/diff-review/PRODUCT.md` as read at research time (pre-v2.0, the input D-06's claims-check test will assert against and that the planner must update):

### Supplied capabilities (`PRODUCT.md:13-22`)

```
## Supplied capabilities

- An interactive CLI selects an ordered base and head from local branches and registered worktrees.
- Installed Git is the authority for repository discovery, refs, merge bases, worktrees, renames, changed-file metadata, and blobs.
- A Fastify server binds to loopback only and opens a browser workspace.
- The Vue interface uses Monaco for side-by-side text diffs, syntax highlighting, line mapping, and inline review controls.
- Reviewers can leave line comments and an overall summary.
- Versioned JSON drafts live in the repository-local, gitignored `.cumpa/` directory.
- Exports provide Markdown and canonical JSON for a coding agent.
- Version 1 reviews text files; binary, generated, oversized, and unsupported files remain visible but non-reviewable.
```

### Deliberate non-capabilities (`PRODUCT.md:24-26`)

```
## Deliberate non-capabilities

No claim is made for remote hosting, cloud synchronization, multi-user collaboration, approvals, suggestions, replies, viewed state, authentication, pricing, customers, usage metrics, certifications, or binary review.
```

Note for the planner (D-06): the "Supplied capabilities" list above predates Phases 13–17 (single-pane rendering, uncommitted/standalone review, Markdown rendering, agent-protocol extension) and is stale against what has actually shipped — e.g. it says "Version 1 reviews text files" and omits uncommitted/standalone review, Markdown toggle/rendering, and the agent-request protocol detail entirely. D-06 requires updating this list to v2.0 capabilities in the same phase, before the claims-check test can assert against it meaningfully. The "Deliberate non-capabilities" list's terms (`remote hosting`, `cloud synchronization`, `multi-user collaboration`, `approvals`, `suggestions`, `replies`, `viewed state`, `authentication`, `pricing`, `customers`, `usage metrics`, `certifications`, `binary review`) are the literal phrase set the D-06 test should scan README/npm copy for.

## Common Pitfalls

(see above — merged into the main Pitfalls section per phase shape; no separate framework-specific pitfalls apply since no libraries are introduced.)

## Code Examples

### Current dirty-source constant pair (to be edited together, per Pitfall 1)
```typescript
// src/domain/source.ts:1-3
export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';
export const DIRTY_EXPLANATION =
  "The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored.";
```
```vue
<!-- src/web/components/IdentityHeader.vue:157-162 — independently hardcoded, not importing the above -->
<span>
  <span>Dirty bytes ignored</span>
  <span class="visually-hidden">
    Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.
  </span>
</span>
```

### Current hardcoded "Cumpa" loading heading (Pitfall 2)
```vue
<!-- src/web/App.vue:1206-1209 -->
<section class="state-card" aria-labelledby="loading-heading">
  <h1 id="loading-heading">{{ isExactPatchSession ? 'Cumpa: loading exact patch' : 'Cumpa: loading pinned comparison' }}</h1>
  <p role="status">{{ isExactPatchSession ? 'Opening frozen patch review…' : 'Opening local draft…' }}</p>
</section>
```

### `deriveProductIdentity()` contract this phase's `<Name>` placeholder resolves against
```
// .planning/phases/17.1-full-project-rename/17.1-01-PLAN.md (not yet executed)
// src/domain/product-identity.ts — exports deriveProductIdentity(name) and frozen RENAME_MAP,
// deriving: display name, npm package (@shipwithai/<slug>), CLI/bin command, repo-local state
// dir (.<slug>/), per-user XDG state dir (lowercase) + macOS/Windows Title-Case form, agent-
// protocol `kind` prefix, env var prefix, CSS/design-token prefix, TypeScript identifier prefix.
// Phase 18 copy MUST reference <Name> (the display-name form) literally, never a guessed string.
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "npm page" in POS-01 refers to `package.json`'s `description`/`keywords` fields (rendered by npm's registry UI) plus the README (which npm also renders on the package page) — there is no separate npm-specific copy file in this repo. | User-Facing String Inventory | Low — this is the only mechanism npm's package page uses; confirmed by `package.json` having no other metadata field capable of carrying prose. |
| A2 | `docs/distribution-operations.md` and `docs/support-service-operations.md` are out of this phase's scope (internal maintainer-ops documents, not product-capability copy). | Pitfall 4, Inventory last row | Low-medium — if the planner decides POS-01's "docs" scope should include these, they are easy to add; `18-CONTEXT.md`'s canonical_refs lists `docs/` generically without naming files, so this is an interpretation, not a verified fact. |
| A3 | `App.vue:199-200`'s "No files in this exact patch" empty state is in scope for D-10's factual+next-action treatment even though `18-UI-SPEC.md`'s empty-state table does not list it (the UI-SPEC only tabulates worktree/range/comparison/filter branches, omitting the exact-patch branch). | Inventory row for `App.vue:199-200` | Medium — if exact-patch is intentionally excluded from the UI-SPEC's scope, the planner should leave this string alone; flagged here only because `18-UI-SPEC.md`'s own Copywriting Contract scope note says it enumerates "concrete web-UI strings phase changes" without an explicit exclusion for this branch. |
| A4 | `tests/e2e/uncommitted-review.spec.ts` and `tests/e2e/standalone-review.spec.ts` contain no assertions on the literal "No changes" empty-state heading or sub-strings of its message (grep returned zero hits in both files for `'No changes'`); their only heading assertions target the Refresh-summary panel (`'Since previous snapshot: 1 modified'`, `'Modified'`, `'Resume previous uncommitted review?'`), which is out of this phase's scope. | Existing E2E String Assertions | Low — grep was exhaustive against the literal pattern; a differently-phrased or regex-based assertion could still exist and should be re-checked once the replacement "No changes in Working tree." string is finalized. |

## Open Questions

1. **`<repo>` segment data source for the D-09 tab-title pattern** (RESOLVED — see 18-04 Task 1)
   - What we know: `18-UI-SPEC.md`'s own Open Questions section confirms no `repoName` field exists in `src/contracts/api.ts` or anywhere in `src/web` today.
   - What's unclear: whether the planner adds a minimal server-side field (e.g., resolved repo root's basename) to the session response in this phase, or whether that wiring is deferred/descoped.
   - Recommendation: size it as a small, explicit task in the apply plan — UI-SPEC is already approved and expects this field to exist for the tab title to be fully implemented.

2. **Exact-patch / pinned-range session-kind tab-title phrasing** (RESOLVED — deferred to the human; see 18-01's "Browser tab title open questions" section)
   - What we know: `18-CONTEXT.md`'s own literal examples only cover uncommitted (`Working tree vs HEAD`) and standalone (`3 files`) cases.
   - What's unclear: whether `Exact patch` and `{N} files` (proposed in `18-UI-SPEC.md`, echoing the existing `'Frozen patch'`/`'…loading exact patch'` copy) are acceptable as-is or need separate user sign-off, since they are UI-SPEC's grounded recommendation, not a `18-CONTEXT.md`-locked decision.
   - Recommendation: carry these two phrasings into `18-COPY-DRAFT.md` explicitly flagged as "UI-SPEC proposed, not CONTEXT-locked" so the human checkpoint can confirm or adjust them.

3. **Does `IdentityHeader.vue`'s dirty-badge SR text get its own literal rewrite, or get refactored to import `DIRTY_EXPLANATION`?** (RESOLVED — see 18-04 Task 2, literal rewrite, no shared import)
   - What we know: the two strings are currently independent and already textually different (see Pitfall 1); `18-CONTEXT.md`'s Claude's-Discretion note treats them as "same offending phrase, two call sites" but they are not byte-identical today.
   - What's unclear: whether consolidating them (web imports the CLI constant, or both import a shared constant) is in scope for this copy-only phase, or whether that refactor belongs to a later phase since it touches code structure, not just string values.
   - Recommendation: default to editing both literal strings to the same new wording without introducing a shared import (keeps the phase copy-only, per the zero-new-architecture framing), but flag the duplication risk in `18-COPY-DRAFT.md` for the planner to decide explicitly.

## Environment Availability

not applicable — copy-only phase, no code dependencies.

## Security Domain

`security_enforcement` is `true` in `.planning/config.json` (`security_asvs_level: 1`, `security_block_on: "high"`), so this section is required, but every ASVS category below is a clean "no" — this phase edits string literals (Markdown prose, npm manifest fields, Commander help text, Vue template text nodes and `aria-label` attribute values) with no new input paths, no new trust boundaries, and no new data flow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface touched; phase has no login/session-credential code |
| V3 Session Management | no | No session-token/cookie code touched |
| V4 Access Control | no | No authorization logic touched |
| V5 Input Validation | no | No new user input accepted; all edits are static string literals (README/npm/CLI help text/Vue templates), not parsed/rendered from untrusted input |
| V6 Cryptography | no | No cryptographic code touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via empty-state / title text if any new string were interpolated from untrusted data | Tampering/Information Disclosure | not applicable here — every new string in this phase is a static literal or derived from already-trusted local session state (`session.files.length`, `standaloneSession.value?.changedFileCount`, repo basename); none interpolate user-supplied or network-supplied content. If the planner later wires the `<repo>` tab-title segment (Open Question 1) from an untrusted path, it must go through Vue's default template escaping (already the project's existing pattern, no new library needed) |

## Sources

### Primary (HIGH confidence)
- Direct file reads at the stated file:line citations throughout this document — `README.md`, `PRODUCT.md`, `package.json`, `DESIGN.md`, `src/cli/run.ts`, `src/cli/picker.ts`, `src/domain/source.ts`, `src/web/index.html`, `src/web/App.vue`, `src/web/components/FileTree.vue`, `src/web/components/ChangedFilesDialog.vue`, `src/web/components/ActiveFileToolbar.vue`, `src/web/components/IdentityHeader.vue`, `tests/e2e/*.spec.ts`, `tests/integration/*.spec.ts`, `.planning/phases/17.1-full-project-rename/17.1-01-PLAN.md`, `.planning/phases/18-product-repositioning-copy/18-CONTEXT.md`, `.planning/phases/18-product-repositioning-copy/18-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- none.

### Tertiary (LOW confidence)
- none.

## Metadata

**Confidence breakdown:**
- User-Facing String Inventory: HIGH — every row grounded in a direct file read with exact file:line citation, no paraphrase-only entries
- Existing E2E String Assertions: HIGH — grep-verified against the full `tests/e2e` and `tests/integration` trees for every string named in `18-UI-SPEC.md`'s locked copy rows
- PRODUCT.md Claims Baseline: HIGH — verbatim transcription, raw-mode read
- Open Questions / Assumptions: MEDIUM — carried forward from `18-UI-SPEC.md`'s own Open Questions where applicable, plus research-time grep gaps explicitly flagged as needing a final re-check once exact copy is drafted

**Research date:** 2026-10-31
**Valid until:** until Phase 17.1 executes (the moment a real product name exists, the `<Name>` placeholder resolves and this inventory's file:line anchors should be re-verified for drift) or until any of the cited files change — re-grep before planning if either happens
