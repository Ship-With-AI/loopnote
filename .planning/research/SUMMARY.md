# Project Research Summary

**Project:** Cumpa
**Domain:** Local-first, agent-artifact Git review tool (Node 24/TypeScript/Fastify/Vue 3/Monaco), extending v1.6's committed-only review workspace to uncommitted and standalone artifacts
**Researched:** 2026-10-30
**Confidence:** HIGH

## Executive Summary

Cumpa v2.0 "Artifact Review" is a bounded extension of a shipped, mature review tool, not a new product. Experts building this kind of feature set — local Git review with durable, drift-detectable anchors — would extend the two patterns Cumpa already proved in v1.3 (`PatchSnapshot`'s freeze-then-observe model, synthetic content-addressed blob OIDs for non-committed bytes) rather than inventing new persistence, diffing, or sanitization machinery. All four research tracks converge on the same conclusion: **v2.0 needs zero new runtime npm dependencies** (one patch bump, `markdown-it` 14.3.0→15.0.3, for a quadratic-DoS CVE fix) and **zero new architectural subsystems** — every target feature is a third/fourth "provenance kind" alongside the existing `range` and `exact-patch` session types, reusing anchors, draft store, attached completion, and the Monaco adapter plumbing that are already provenance-agnostic.

The recommended approach is additive-only at every layer: new Zod discriminated-union branches (never widen `PinnedComparison`'s committed-only contract), new `create*SessionApp()`/`create*CapabilityRegistry()` factories parallel to the existing range/exact-patch pair, a new Monaco standalone (non-diff) editor mode reusing the diff editor's anchor/decoration model, and new export schema versions (V4 uncommitted, V5 standalone) that are strict supersets of V1, exactly like V2/V3 are today. The existing `markdown-it` config (`html: false`, restricted `validateLink`) already satisfies the Markdown-preview sanitization requirement without a new sanitizer dependency, because disallowing raw HTML passthrough entirely is one of the two accepted mitigations pitfalls research identifies.

The key risks are all identity/mutation-safety risks, not feature-complexity risks: reusing the commit-OID draft/anchor key scheme for uncommitted content would silently collapse different working-tree states onto the same draft (Pitfall 1); a naive enumerate-then-read snapshot races a filesystem agents are actively writing to (Pitfall 2); an "helpful" Refresh that re-anchors on a plausible match breaks the product's core drift-detectable promise (Pitfall 4); and a CLI path/glob argument handler that skips the `exact-patch.ts` worktree-entry's `lstat`-before-read discipline reopens a path-traversal class the codebase already solved once (Pitfall 5). Every one of these has a concrete, already-proven-in-repo mitigation pattern to extend, not invent.

## Key Findings

### Recommended Stack

No new runtime dependencies are required. `monaco-editor`'s already-bundled standalone-editor API (`monaco.editor.create()`) supplies single-pane rendering by sharing the diff editor's `ICodeEditor` surface, decorations, and view-zone API. Native Git CLI plumbing (`git diff --cached`/`git diff`/`git diff <merge-base>` plus `git ls-files --others --exclude-standard`) supplies all three uncommitted Head sources through the same `-z --raw`/`--numstat` record format already parsed by `src/git/raw-diff.ts`. The existing `PatchSnapshot` fs+SHA-256 frozen-snapshot pattern extends directly to working-tree/standalone-file freezing. Native Git pathspec resolution (already threaded end-to-end for agent range requests) replaces any JS glob library for standalone file/glob arguments — Git pathspec semantics must not diverge from a second shell-glob dialect.

**Core technologies (reused, extended):**
- `monaco-editor` 0.55.1 (stay pinned — do not bump to 0.57.0 this milestone): standalone editor mode for single-pane added/deleted/standalone files, same API family as the diff editor.
- Native Git CLI via `createGitRunner`/`spawn`: staged/unstaged/working-tree sources, untracked enumeration, merge-base semantics — zero new library.
- `markdown-it` 14.3.0 → **bump to 15.0.3** (only required version change): patches a High-severity (CVSS 7.5) quadratic-complexity DoS (GHSA-r7fv-28h4-cvq7) and reuses the already-shipped `html:false`/restricted-`validateLink` config for file-content preview, not just the Summary textarea.
- `zod` 4.4.3: extend the existing discriminated-union request/export schemas with new branches, not a new validation library.

### Expected Features

Everything already shipped (merge-base-to-head comparison, Monaco side-by-side, durable anchors, comment lifecycle, Markdown/JSON export, agent stdin V1) is baseline. v2.0 adds six new categories.

**Must have (table stakes):**
- Staged / Unstaged / Working-tree as three distinct, named Head choices, matching Git's own three-way model and VS Code's Changes/Staged-Changes split.
- Untracked files included in "Working tree," respecting `.gitignore` (plain `git diff` never shows them).
- Frozen working-tree snapshot at session start + explicit Refresh — the one correct behavior per the product's own anti-feature list; VS Code's live-reactive diffing is explicitly what Cumpa must NOT copy.
- Existing comments reclassified stale/orphaned on worktree drift, reusing `verifyDurableAnchor`.
- Added/deleted files render in one full-width pane (no empty Monaco side) — GitHub's split view still wastes a column here; Cumpa's status-driven auto-selection avoids it entirely.
- Standalone named files (changed or not) open single-pane and commentable via `cumpa <path|glob>` — no PR tool has an analogue; this is table stakes *for the repositioned product*, not an existing competitor pattern.
- Per-file rendered/source Markdown toggle, comments staying anchored to source lines while preview is showing (GitHub's own behavior precedent).

**Should have (competitive differentiators):**
- All three uncommitted states as explicit, independently selectable, durably-anchored, exportable Head choices — no compared tool (GitHub, GitLab, VS Code, lazygit) offers this combination.
- Agent-requestable review of uncommitted/standalone artifacts with the same strict stdin contract used for committed ranges.

**Defer (beyond v2.0):**
- Product repositioning copy pass should land last, after the underlying capability is proven, so copy never overclaims ahead of what ships.
- Rendered-level (word-diff-inside-HTML) Markdown diffing, binary/notebook preview, hunk-level staging actions from inside the diff — explicitly out of scope; staging actions in particular would reintroduce a Git-mutation surface the product has deliberately avoided everywhere else.

### Architecture Approach

v2.0 does not replace any existing subsystem. It adds a third and fourth provenance kind ("uncommitted," "standalone-files") alongside the existing `range` and `exact-patch` kinds, following the exact same shape: new contract schemas → new Git-adapter inventory module → new session-app factory/capability registry → new CLI/stdin entry points → new browser UI command variants → new export schema version. Every integration point in the existing codebase that is already provenance-agnostic (anchors, draft store, `AttachedCompletionCoordinator`, Monaco adapter plumbing) is reused unmodified; every integration point hardwired to "committed Git objects only" (`createPinnedComparison`, `ObjectReader`, `comparisonKey()`) gets a parallel sibling rather than a widened contract.

**Major components:**
1. **Uncommitted source inventory** (`src/git/worktree-inventory.ts`, new) — builds `ChangedFile[]`-shaped records for Staged/Unstaged/Working-tree via `git diff --cached`/`git diff`/`git ls-files --others --exclude-standard`, computing synthetic blob OIDs for non-indexed bytes using the existing `exact-patch.ts` `blobOid()` pattern.
2. **Worktree snapshot** (`src/server/worktree-snapshot.ts`, new) — mirrors `PatchSnapshot`, adding the one capability it never needed: an explicit `refresh()` mutator that re-reads live state and reports per-file deltas for comment reclassification.
3. **Standalone file resolver** (`src/git/standalone-files.ts`, new) — resolves CLI paths/globs to single-sided `ChangedFile`-shaped records, reusing `availability.ts` classification against worktree bytes read directly, with `realpath`+repo-root containment.
4. **Provenance-parallel session app factories** (`src/server/app.ts`, `capabilities.ts`) — `createUncommittedSessionApp`/`createStandaloneFilesSessionApp` alongside the existing `createSessionApp`/`createExactPatchSessionApp`.
5. **Monaco single-pane adapter mode** (`src/web/monaco/diff-adapter.ts` or sibling module) — a real `IStandaloneCodeEditor`, not a diff editor with one side forced empty, for added/deleted/standalone content.

Suggested build order (dependency-respecting): contracts → Git adapter → server/session wiring → CLI surface (interactive + standalone, parallel) → stdin agent protocol → browser UI (single-pane Monaco + Markdown preview, parallel) → product copy, landed last.

### Critical Pitfalls

1. **Commit-OID key reuse for uncommitted drafts/anchors** — wiring new sources through `comparisonKey(baseOid, headOid)` with a constant head sentinel collapses different working-tree states onto the same draft file and anchor identity. Avoid by giving each uncommitted source kind its own domain-tagged key built from base commit OID *plus* a content digest of the frozen snapshot, mirroring `PatchSnapshot`'s `PATCH_KEY_DOMAIN` pattern — not the committed-only `comparisonKey()`.
2. **Torn/raced working-tree snapshot** — enumerate-then-read is not atomic; an agent writing iteratively can produce a snapshot mixing two points in time. Avoid by capturing size+mtime/hash at listing time, re-verifying after each read, and classifying (not silently excluding or crashing on) files that changed mid-snapshot — extending `PatchSnapshot`'s existing single-file `sha256` verification to the new bulk path.
3. **Refresh silently relocating or fabricating anchors** — the tempting "helpfully re-anchor on a plausible match" move breaks drift-detectability. Avoid by calling the existing `verifyDurableAnchor(recorded, current)` against the refreshed snapshot for the *same recorded* anchor and reclassifying stale/orphaned on mismatch — never rebuilding the stored anchor.
4. **Standalone file review admitting path traversal/symlink escape** — the first feature where raw user/agent path strings choose files to display, outside the Git-object-graph safety net every prior feature relied on. Avoid by `realpath`/per-segment `lstat` + repo-root containment, mirroring `exact-patch.ts`'s already-proven worktree-entry walk.
5. **Rendered Markdown preview introducing an XSS gap the app doesn't otherwise have** — CSP is defense-in-depth, not a sanitization substitute (it doesn't block `javascript:` URI click-through). Avoid by keeping the existing `html:false` + restricted `validateLink` config (which already disallows raw HTML passthrough entirely) applied to file-content preview, rather than loosening the renderer or the CSP to accommodate richer Markdown.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Single-Pane Full-Width Rendering
**Rationale:** Lowest-risk, fully self-contained P1 feature with no new data flow or Git plumbing — pure Monaco adapter + anchor-side-convention work. Unblocks every later phase that needs a non-diff single-file surface (standalone review, uncommitted added/deleted files).
**Delivers:** A real `IStandaloneCodeEditor` mode for added/deleted files, replacing the current "diff editor with one empty side" idiom.
**Addresses:** Table-stakes feature "Added/deleted files render in one full-width pane."
**Avoids:** Pitfall 9 (single-pane anchor side-mapping) — anchor added-file comments `side:'head'`, deleted-file comments `side:'base'`, reusing existing `AnchorSide`, never inventing a third side value.

### Phase 2: Uncommitted Source Contracts & Git Adapter
**Rationale:** Per the architecture's "schema → git adapter → server → CLI → protocol → UI" dependency order, nothing downstream can be typed correctly without the new scope/key schemas existing first; the Git-adapter layer is pure functions testable in isolation before any server wiring depends on it.
**Delivers:** `UncommittedScopeSchema`, content-digest key derivation (`uncommittedReviewKey`), `worktree-inventory.ts` (staged/unstaged/working-tree+untracked via native Git, synthetic blob OIDs for non-indexed bytes).
**Uses:** Native Git CLI (`git diff --cached`/`git diff`/`git ls-files --others --exclude-standard`), `zod` discriminated unions.
**Implements:** Architecture's "provenance-parallel" pattern and "synthetic blob OIDs for non-object-backed bytes" pattern.
**Avoids:** Pitfall 1 (commit-OID key collision), Pitfall 3 (`.cumpa`/symlink/node_modules leakage into untracked walk), moderate pitfalls (CRLF/filter divergence, intent-to-add misclassification, rename-detection parser mismatch, mode-change loss).

### Phase 3: Frozen Snapshot & Explicit Refresh
**Rationale:** The snapshot-freeze mechanism is the shared dependency every uncommitted/standalone feature needs before UI work begins (Feature Dependencies graph in FEATURES.md); building it once here avoids two divergent "read live bytes" code paths later.
**Delivers:** `worktree-snapshot.ts` (mirrors `PatchSnapshot`, adds the new `refresh()` mutator), `/api/refresh` route gated on `capabilities.refresh !== undefined`, Refresh re-running `draft-reconciliation.ts` against updated `session.files`.
**Avoids:** Pitfall 2 (torn/raced snapshot — needs fault-injection tests mutating a file between enumeration and read) and Pitfall 4 (Refresh relocating anchors instead of reclassifying — needs a test asserting a comment stays at its original recorded line with stale/orphaned classification after content shifts).

### Phase 4: Interactive Uncommitted Source Review
**Rationale:** With contracts, Git adapter, and snapshot/refresh proven in isolation (Phases 2–3), this phase wires the full interactive path end to end — the natural "prove it with Fastify `inject()` tests" milestone the architecture research calls out.
**Delivers:** `createUncommittedSessionApp`/`createUncommittedCapabilityRegistry`, new `UncommittedCandidate` source type, three new picker entries (Staged/Unstaged/Working tree), full Staged/Unstaged/Working-tree review against HEAD or any chosen base, using Phase 1's single-pane mode for added/deleted uncommitted files.
**Addresses:** Table-stakes "three distinct Head choices" and "existing comments reclassified on drift," plus the differentiator "all three uncommitted states as explicit, independently selectable Head choices."
**Note:** Must update the existing "Dirty — committed HEAD only... Staged, unstaged, and untracked bytes are ignored" copy (`src/domain/source.ts:1-3`, `cli/confirm.ts:71`, `cli/picker.ts:120-121`) in this same phase — shipping the feature while leaving that copy unchanged actively contradicts it (UX Pitfall).

### Phase 5: Standalone File Review
**Rationale:** Depends on single-pane rendering (Phase 1) and the frozen-snapshot mechanism (Phase 3) per the Feature Dependencies graph, but is otherwise independent of uncommitted-source wiring (Phase 4) — can be sequenced in parallel with Phase 4 once Phases 1 and 3 land.
**Delivers:** `standalone-files.ts` resolver, `cumpa [paths...]` Commander argument bypassing the picker, `createStandaloneFilesSessionApp`, a new "standalone" `ChangedFileStatusKind` value.
**Addresses:** Table-stakes "standalone named files open single-pane and commentable," differentiator "standalone file review with the same durable-anchor/export contract as diff comments."
**Avoids:** Pitfall 5 (path traversal/symlink escape) — requires tests for `../` traversal, absolute out-of-repo paths, and symlink-to-outside-repo all rejected before any byte is read.

### Phase 6: Rendered Markdown Preview Toggle
**Rationale:** Enhances rather than blocks other work (Feature Dependencies graph) — buildable incrementally on top of single-pane/side-by-side (Phase 1) once those surfaces exist, reusing `renderMarkdownPreview` with zero new sanitization work. Sequenced after Phase 1 but does not require Phases 2–5.
**Delivers:** Markdown preview pane + toggle wired into `WorkspaceCommand`/`workspace-state.ts`, applied uniformly across standalone files, committed diffs, and uncommitted sources.
**Avoids:** Pitfall 6 (Markdown XSS) — keep the existing `html:false`+restricted-`validateLink` config; never loosen CSP to accommodate the renderer. Requires a test rendering `<script>`/`onerror`/`javascript:` content and asserting it is stripped.

### Phase 7: Agent Stdin Protocol & Export Schema Extension
**Rationale:** Both new stdin modes need server-side concepts (uncommitted scope, standalone path set) to validate against and resolve — this phase necessarily comes after Phases 4 and 5's session factories exist, per the architecture's explicit build-order note that "agent-attached launches reuse the same session apps as interactive launches."
**Delivers:** Two new `AgentReviewRequestSchema` discriminant branches (`'uncommitted'`, `'files'`) under the existing `schemaVersion: 1`, `launchUncommittedSession`/`launchStandaloneFilesSession` in `cli/run.ts`, `ReviewExportV4Schema` (uncommitted provenance) and `ReviewExportV5Schema` (standalone provenance), each a strict superset of V1 like V2/V3 are today.
**Addresses:** Table-stakes "agent stdin protocol accepts uncommitted/standalone review requests," differentiator "agent-requestable review with the same strict stdin contract."
**Avoids:** Pitfall 7 (export schema breaking V1–V3 consumers — must add a new version, never widen `RangeReviewScope`/`ExactPatchExportScope`) and Pitfall 8 (stdin mode dispatch gaps — must update the Zod union, `cli/run.ts`'s exhaustive switch, *and* `requestErrorMessages` together; grep all three).

### Phase 8: Product Repositioning Copy
**Rationale:** No code dependency on any other phase; explicitly sequenced last so copy reflects the shipped feature set rather than the plan (both FEATURES.md and ARCHITECTURE.md agree on this ordering).
**Delivers:** Updated "What This Is," README tagline, CLI `--help` text, and marketplace `SKILL.md`, repositioned from "code review" to "review any agent-produced artifact" without implying hosted/multi-reviewer capability (explicitly out of scope).

### Phase Ordering Rationale

- Contracts-first, then Git adapter, then server wiring, then CLI/UI, then protocol extension, then copy — matches the architecture research's explicit "nothing downstream can be typed correctly without layer 1" dependency chain.
- Single-pane rendering (Phase 1) is pulled to the front because it is a pure-Monaco-adapter change with no Git/snapshot dependency, yet is a hard prerequisite for both uncommitted-source added/deleted rendering (Phase 4) and standalone file review (Phase 5) per the Feature Dependencies graph.
- The frozen-snapshot mechanism (Phase 3) is built once and shared by both uncommitted sources (Phase 4) and standalone files (Phase 5), per FEATURES.md's explicit dependency note that building them separately "would require two divergent 'read live file bytes' code paths."
- Markdown preview (Phase 6) and the stdin/export extension (Phase 7) are each isolated to their own phase because they are the two places pitfalls research identifies security/compatibility blast-radius risk (XSS, breaking export consumers) that benefits from focused test coverage rather than being folded into a larger phase.

### Research Flags

Phases likely needing deeper research during planning (`$gsd-plan-phase --research-phase <N>`):
- **Phase 2 (Uncommitted Source Contracts & Git Adapter):** the content-digest key derivation scheme and synthetic-blob-OID-for-worktree-bytes approach are subtle and security/correctness-sensitive (Pitfall 1); CRLF/filter normalization divergence between index-side and raw-worktree reads needs concrete verification against `git diff`'s own output.
- **Phase 3 (Frozen Snapshot & Refresh):** the stat-then-read race-detection design and the Refresh "what changed" UX (file added/removed/modified summary) are not fully specified in PROJECT.md and need a concrete fault-injection test design before implementation.
- **Phase 5 (Standalone File Review):** path-traversal/symlink-escape hardening is a security-sensitive surface; the exact `realpath`/`lstat`-per-segment implementation should be verified against the existing `exact-patch.ts` precedent during planning, not re-derived from scratch.
- **Phase 7 (Agent Stdin & Export Extension):** the exact field shapes of `ReviewExportV4Schema`/`V5Schema` (what "uncommitted provenance" and "standalone provenance" metadata must contain) are not fully specified by any research file and need design work during phase planning.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Single-Pane Rendering):** well-documented Monaco standalone-editor API, existing anchor-side convention to reuse — no open design questions.
- **Phase 4 (Interactive Uncommitted Review):** once Phases 2–3 land, this is wiring work following the exact `createSessionApp`/`createExactPatchSessionApp` precedent already in the codebase.
- **Phase 6 (Markdown Preview Toggle):** the renderer, sanitization config, and anti-pattern to avoid (loosening CSP) are all already fully specified by existing shipped code.
- **Phase 8 (Product Copy):** no architectural uncertainty, purely a writing/consistency pass.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every recommendation grounded in direct repo inspection (file:line citations) plus npm registry/CHANGELOG/GHSA verification for the one version bump; no speculative library choices. |
| Features | HIGH | GitHub/GitLab/VS Code behavior verified against current official docs with inline citations; Cumpa baseline verified against repo source with file:line citations throughout. |
| Architecture | HIGH | All claims grounded in current repo source with file:line evidence; integration points and new/modified component lists are exhaustive and cross-referenced against existing precedent (`exact-patch.ts`/`patch-snapshot.ts`). |
| Pitfalls | HIGH for architectural/integration pitfalls (codebase-grounded); MEDIUM for general Git worktree edge-case enumeration (intent-to-add, rename-detection format differences) — cross-checked against Git documentation behavior but not live-tested against every OS/filesystem combination. |

**Overall confidence:** HIGH

### Gaps to Address

- **Refresh UX detail:** PITFALLS.md recommends surfacing a "what changed since the frozen snapshot" summary alongside the Refresh action, but PROJECT.md does not specify this UI surface — resolve the exact summary content/placement during Phase 3 planning.
- **Export V4/V5 field shapes:** ARCHITECTURE.md names the new schema versions and their general shape (uncommitted scope: `sourceKind`/`baseOid`/snapshot status; standalone scope: resolved paths only) but does not fully enumerate every field — finalize during Phase 7 planning against the established V1→V2→V3 superset pattern.
- **Comment-creation gating during Markdown preview:** FEATURES.md explicitly flags as unresolved whether comment *creation* should be blocked while the rendered preview is showing (GitHub's behavior) or whether existing anchors should simply keep resolving correctly under a visual overlay — needs an explicit roadmap/Phase 6 decision, not assumed from precedent.
- **Moderate Git edge cases (MEDIUM confidence):** intent-to-add (`git add -N`) files, rename/copy detection format differences between `git status --porcelain=v2` and the existing raw-diff parser, and mode-change (executable bit) preservation all need explicit test fixtures during Phase 2, since they are enumerated but not exhaustively verified against every OS/filesystem combination in research.

## Sources

### Primary (HIGH confidence)
- Cumpa repository source (ground truth for all architecture/stack/feature-baseline claims, extensive file:line citations): `src/web/monaco/diff-adapter.ts`, `src/web/monaco/configure.ts`, `src/web/monaco/line-mapping.ts`, `src/web/monaco/diff-semantics.ts`, `src/git/runner.ts`, `src/git/objects.ts`, `src/git/ignore-status.ts`, `src/git/raw-diff.ts`, `src/git/comparison.ts`, `src/git/exact-patch.ts`, `src/git/candidates.ts`, `src/git/availability.ts`, `src/git/inventory.ts`, `src/server/patch-snapshot.ts`, `src/server/security.ts`, `src/server/capabilities.ts`, `src/server/draft-loader.ts`, `src/server/app.ts`, `src/server/routes.ts`, `src/server/attached-completion.ts`, `src/server/gitignore-capability.ts`, `src/web/model/markdown-preview.ts`, `src/web/model/draft-reconciliation.ts`, `src/web/components/SummarySection.vue`, `src/contracts/request.ts`, `src/contracts/comparison.ts`, `src/contracts/draft.ts`, `src/domain/anchor.ts`, `src/domain/source.ts`, `src/domain/comparison-key.ts`, `src/domain/file-tree.ts`, `src/cli/run.ts`, `src/cli/picker.ts`, `src/cli/request.ts`, `src/export/review-export.ts`
- `.planning/PROJECT.md` (repo) — current milestone target features, Active requirements, Out of Scope list, Constraints, and prior Key Decisions.
- npm registry (`npm view <pkg> version|time|dependencies`): `markdown-it` 14.3.0→15.0.3, `monaco-editor` 0.55.1→0.57.0, `@inquirer/search` 4.2.1→4.3.6, `dompurify` 3.4.17, checked 2026-10-30.
- `markdown-it` CHANGELOG (GitHub, official): https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md
- GHSA-r7fv-28h4-cvq7 (GitHub Security Advisories, official): https://github.com/markdown-it/markdown-it/security/advisories/GHSA-r7fv-28h4-cvq7
- GitHub Docs, "Reviewing proposed changes in a pull request": https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request
- GitHub Docs, "Working with non-code files": https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files
- VS Code Docs, "Staging and committing changes": https://github.com/microsoft/vscode-docs/blob/bec06a3925f08cd83aff00129ce81d926ac88fde/docs/sourcecontrol/staging-commits.md
- GitLab Docs, "Changes in merge requests": https://docs.gitlab.com/user/project/merge_requests/changes
- GitLab Docs, "GitLab Flavored Markdown (GLFM)": https://docs.gitlab.com/user/markdown
- Git SCM Book, "Recording Changes to the Repository": https://git-scm.com/book/id/v2/Git-Basics-Recording-Changes-to-the-Repository
- Git SCM manual, `git-diff`: https://git-scm.com/docs/git-diff

### Secondary (MEDIUM confidence)
- lazygit documentation/README (comparator for local-tool conventions, no agent-request protocol exists in this class of tool): https://lazygit.dev/docs/guide / https://github.com/jesseduffield/lazygit
- General Git worktree edge-case behavior (intent-to-add, rename-detection format differences, mode-change preservation) — cross-checked against Git documentation behavior but not live-tested against every OS/filesystem combination.

### Tertiary (LOW confidence)
- None identified — all research tracks cite primary repo evidence or official documentation; no single-source/inference-only claims remain unflagged.

---
*Research completed: 2026-10-30*
*Ready for roadmap: yes*
