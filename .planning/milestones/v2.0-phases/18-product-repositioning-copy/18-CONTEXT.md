# Phase 18: Product Repositioning Copy - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning (after Phase 17.1; all copy uses the **new name** chosen in Phase 17.1)

<domain>
## Phase Boundary

The README, npm page (package `description`/`keywords`), CLI copy (`--help`, picker, dirty-source text) and browser workspace text describe the product as **local review for any agent-produced artifact** (code, plans, decisions, docs), with no hosted or multi-reviewer overclaim. Every claim must reflect a capability shipped in Phases 13–17.1.

Requirements: POS-01, POS-02, POS-03 (`.planning/REQUIREMENTS.md`).

Depends on Phase 17.1 (rename): copy is written once, under the new name. Phase 17.1 already removed the old "cumpà = friend + compare" name story (17.1 D-12) and replaced name strings mechanically. This phase owns the wording.

</domain>

<decisions>
## Implementation Decisions

### Positioning line
- **D-01:** **Agent artifacts first.** Lead with reviewing what a coding agent produced, locally: code, plans, decisions, docs. Code diffs are one artifact type among several. Matches POS-01 and the v2.0 bet.
- **D-02:** **npm `description`: Claude's discretion.** The copy draft (D-05) proposes 2–3 variants and the user picks one.
- **D-03:** **Add npm `keywords`:** e.g. `code-review`, `ai-agents`, `claude-code`, `codex`, `markdown-review`, `local-first` (final list in the copy draft).

### Voice & sign-off
- **D-04:** **Product-neutral voice** (third person/imperative, factual, like the current README). No founder first-person voice.
- **D-05:** **Draft first, then apply.** Plan 1 writes `.planning/phases/18-product-repositioning-copy/18-COPY-DRAFT.md` with every user-facing string to change (README sections, npm description variants + keywords, `--help`, picker prompts, dirty/uncommitted/standalone copy, workspace titles/labels/empty states, docs/usage.md outline). It ends with a **blocking human checkpoint** for approval. A second plan applies only the approved copy. Nothing ships before approval.
- **D-06:** **Claims check is automated:** add a test/check that README and npm copy contain none of PRODUCT.md's "Deliberate non-capabilities" claims (hosted, cloud sync, multi-user, approvals, …) and that the claimed capabilities exist in v2.0. Update PRODUCT.md's capability list to v2.0 in the same phase, so the check has an accurate source.

### Workspace wording
- **D-07:** **The umbrella noun is "Review"** for every session kind. Use "comparison" only where Base/Head literally exist (identity header for committed and uncommitted sessions).
- **D-08:** **The sidebar title is always "Files"** (replacing "Changed files" everywhere).
- **D-09:** **Browser tab title: `<Name> · <repo> · <session kind>`**, e.g. `<Name> · diff-review · Working tree vs HEAD`, `<Name> · diff-review · 3 files`.
- **D-10:** **Empty states are factual plus the next action**, e.g. `No changes in Working tree. Edit files, then Refresh.` No jokes.

### Docs scope
- **D-11:** **Short README sections + `docs/usage.md`.** The README gets one example each: committed range, `--worktree`/`--staged`/`--unstaged`, standalone files, Markdown toggle, agent request. `docs/usage.md` holds the full reference (flags, edge cases, Refresh, snapshot semantics, exports).
- **D-12:** **Version-agnostic release wording:** replace pinned-version claims (README "Stable 1.5.0 is published…") with wording that doesn't rot. Keep "independently verified" claims only where they are true for a specific published version. The marketplace skill copy belongs to Phases 17/17.1.
- **D-13:** **Name story:** the old story was removed in 17.1. Any story for the new name is optional and drafted in `18-COPY-DRAFT.md` only if the new name has one. User sign-off required.

### Claude's Discretion
- npm description variants (D-02), the exact keyword list (D-03), and the docs/usage.md structure.
- Also update POS-02's "dirty-source" strings: `DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION` in `src/domain/source.ts` ("staged/unstaged ignored" wording must be gone).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md`: POS-01..03
- `.planning/ROADMAP.md` §"Phase 18"
- `.planning/phases/17.1-full-project-rename/17.1-CONTEXT.md`: the new name and derived forms (from its execution checkpoint), D-12 name story removal
- `.planning/phases/13..17*/*-CONTEXT.md` and their SUMMARY files: shipped capabilities to describe
- `README.md`, `PRODUCT.md` ("Deliberate non-capabilities", "Supplied capabilities"), `DESIGN.md`, `docs/`
- `package.json`: `description`, `keywords`
- `src/cli/run.ts` (Commander `.description`), `src/cli/picker.ts` (`BASE_PROMPT`/`HEAD_PROMPT`), `src/domain/source.ts` (`DIRTY_ROW_LABEL`/`DIRTY_EXPLANATION`)
- Web: `src/web/index.html` (title), `App.vue`, file tree/sidebar components, empty-state components

</canonical_refs>

<code_context>
## Existing Code Insights

- Copy is spread across CLI constants, Vue components and README/PRODUCT.md. A copy draft that maps each string to a file/symbol keeps the apply plan mechanical.
- Existing e2e tests assert some visible strings (e.g. responsive-session display assertions). Update those tests with the approved copy, not the other way round.

</code_context>

<specifics>
## Specific Ideas

- Empty state example: `No changes in Working tree. Edit files, then Refresh.`
- Title example: `<Name> · <repo> · Working tree vs HEAD`.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>

---

*Phase: 18-product-repositioning-copy*
*Context gathered: 2026-10-30*
