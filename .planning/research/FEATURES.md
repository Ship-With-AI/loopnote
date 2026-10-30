# Feature Research

**Domain:** Local-first, agent-artifact code/document review tool (Cumpa v2.0 "Artifact Review")
**Researched:** 2026-10-30
**Confidence:** HIGH (GitHub/GitLab/VS Code behavior verified against current official docs; Cumpa baseline verified against repo source with file:line citations)

## Feature Landscape

This research covers only the six NEW v2.0 categories. Everything already shipped (merge-base-to-head comparison, Monaco side-by-side for modified files, durable anchors, comment lifecycle, Markdown/JSON export, agent stdin V1 for `revisions`/`patch` modes) is existing baseline per `.planning/PROJECT.md` and is cited only where v2.0 reuses or extends it.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Staged / Unstaged / Working-tree as three distinct, named Head choices | Matches Git's own three-way model (`git diff` = worktree↔index/"unstaged", `git diff --cached` = index↔HEAD/"staged", `git diff HEAD` = worktree↔HEAD) and VS Code's **Changes** vs **Staged Changes** split in the Source Control view[^vscode-staging]. Users who already think in these terms expect the same vocabulary. | MEDIUM | No current Cumpa path resolves anything but committed refs — `src/git/comparison.ts` builds `PinnedComparison` from `ComparisonSelection`/branch-or-worktree only; `src/contracts/comparison.ts:12-19` only models `branch`/`worktree` source kinds today. Needs new Git invocation paths per uncommitted source. |
| Untracked files included in "Working tree" respecting `.gitignore` | Plain `git diff`/`git diff HEAD` never shows untracked files — Git's own docs: "Untracked files are everything else ... not in your staging area"[^gitbook-untracked]. A working-tree review that silently omits new files would be misleading for agent-authored artifacts (often newly created, uncommitted files). | MEDIUM | Must enumerate via `git ls-files --others --exclude-standard`-equivalent and synthesize empty-blob→worktree diffs. Cumpa already has gitignore-aware infrastructure to build on: `src/git/ignore-status.ts` + `src/server/gitignore-capability.ts:1-13` (currently scoped to offering a `.cumpa/` ignore entry, not full untracked enumeration, but proves the native-Git ignore-check pattern is in place). |
| Base stays selectable (HEAD by default, or any branch/worktree) against any of the three uncommitted Heads | Mirrors the shipped "PR-style merge-base-to-head comparison" decision (`.planning/PROJECT.md:283`) — uncommitted sources are just a new Head kind, not a new comparison model. | LOW | Orthogonal re-use of the existing merge-base resolution path in `src/git/comparison.ts`; only the Head-side resolution changes. |
| Frozen working-tree snapshot at session start + explicit Refresh | Git objects are content-addressed and immutable by construction, which is why Cumpa's durable anchors work today (`src/domain/anchor.ts:115-151` hashes blob OID + line + context). A live/uncommitted source has no such immutability, so without a freeze the anchor model breaks silently. No PR tool needs this (GitHub/GitLab only ever diff committed refs); VS Code's diff editor instead re-renders live on every keystroke[^vscode-staging] — explicitly the behavior Cumpa must NOT copy, because it would relocate/invalidate comments without the drift-detectable guarantee the product promises (`.planning/PROJECT.md:9`). | MEDIUM | New snapshot-capture step at session start (hash worktree bytes per file) + a server-authoritative Refresh action that re-snapshots and reclassifies. |
| Existing comments reclassified stale/orphaned on worktree drift, exactly like today's committed-diff drift handling | `.planning/PROJECT.md:71` states this explicitly; the mechanism already exists for committed objects via `verifyDurableAnchor` (`src/domain/anchor.ts:153-178`), which compares a `recorded` vs `current` `DurableAnchorV1` and returns an `AnchorVerification` — this is a reuse, not a new concept. | LOW–MEDIUM | New call site: compare a Refresh-triggered re-snapshot against anchors; same stale/orphaned taxonomy, new trigger source. |
| Added/deleted files render in one full-width pane, no empty Monaco side | GitHub's diff view already avoids a pointless empty column: its unified view (the unified/split toggle via the gear icon[^github-diffview]) is inherently single-column, and even review tooling generally treats file-create/file-delete as "all content on one side." Cumpa's current Monaco diff editor always builds both `originalModel` and `modifiedModel` (`src/web/monaco/diff-adapter.ts:211-227`) even when one side is empty — for an added file `originalModel` is an empty string, for a deleted file `modifiedModel` is empty, producing the literal "no review (no empty side)" gap named in `.planning/PROJECT.md:58`. | MEDIUM | Needs a new non-diff Monaco standalone editor path for `status.kind === 'added' \| 'deleted'`, replacing `createDiffEditor` for those files only; side-by-side stays for `modified`/`renamed`/`copied`/`type-changed`. |
| Comment anchors remain correct in single-pane mode | `DurableAnchorV1` is already parameterized by `side: AnchorSide` (`'base' \| 'head'`, `src/domain/anchor.ts:6`); an added file only ever needs head-side anchors, a deleted file only base-side. The single-pane renderer must pick the one correct side rather than needing a new anchor concept. | LOW | Reuse, not new design — single-pane just narrows which `side` is addressable per file status. |
| Standalone named files (changed or not) open single-pane and commentable via `cumpa <path\|glob>` | No PR tool has an analogue — GitHub/GitLab only ever show files that are part of a diff. This is table stakes *for the repositioned product* ("review any agent-produced artifact," new Core Value at `.planning/PROJECT.md:9`), because an agent's draft plan/decision doc is frequently untracked or unrelated to any branch comparison. | MEDIUM | Reuses existing `SessionFile`/`FileTreeLeaf` model (`src/domain/file-tree.ts:9-14`) and the anchor structure (which is already keyed on arbitrary path + side + blob, `src/domain/anchor.ts:13-31`) — a standalone file is effectively a one-sided (`head`-only) leaf with no comparison counterpart. |
| Standalone files read live working-tree bytes, not a historical blob | Consistent with the working-tree-review requirement — an agent's new/edited file is almost always uncommitted. A standalone reviewer that only shows the last-committed blob would misrepresent exactly the artifacts v2.0 targets. | LOW–MEDIUM | New read path through the frozen-snapshot mechanism built for working-tree sources (shared dependency, see Feature Dependencies). |
| Non-text/binary standalone files identified but not rendered inline | Matches the unchanged, explicit Out-of-Scope line: "Cumpa reviews text; Markdown gains rendered preview in v2.0, other unsupported files identified but not rendered inline" (`.planning/PROJECT.md:244`). | LOW | Already-shipped "unsupported" status handling (`ChangedFileStatusKindSchema` includes `'unsupported'`, `src/contracts/comparison.ts:75-83`) extends directly to standalone files. |
| Per-file rendered/source Markdown toggle | Direct precedent: GitHub's Files-changed page has a "Display rich diff" / "Display source diff" icon pair specifically for prose documents[^github-nonfcode]; GitLab similarly separates rendered Markdown (GLFM preview) from diff source. Cumpa already ships a sanitized Markdown renderer (`markdown-it`, `html:false`, forced `target=_blank`/`rel=noopener` on links) at `src/web/model/markdown-preview.ts:1-19`, currently wired only into the review-summary textarea preview in `SummarySection.vue:4,42` — the infrastructure is proven, just not yet applied to source files. | LOW–MEDIUM | Call `renderMarkdownPreview` against file content inside the single-pane/side-by-side surface, gated by a per-file toggle; do not touch the summary preview path. |
| Comments stay anchored to source lines while preview is showing | GitHub explicitly keeps commenting tied to source: "Commit comments can only be added within source view, on a line-by-line basis"[^github-nonfcode] — rendered/"rich diff" view is read-only for commenting. Cumpa's anchors are keyed on raw text + line number (`AnchorContextLine`, `src/domain/anchor.ts:8-11`), which only exists meaningfully against source bytes, not rendered HTML. | MEDIUM | Preview should overlay/toggle visually while the underlying anchor target remains the source Monaco model; flag to roadmap whether comment *creation* is blocked while preview is active (GitHub's behavior) or whether existing anchors must simply keep resolving correctly under a visual preview layer — the milestone line ("comments stay anchored to source lines") does not disambiguate creation-while-previewing vs. persistence-of-existing-anchors. |
| Agent stdin protocol accepts requests for uncommitted-source and standalone-file review, returns the same canonical JSON shape | Direct extension of the already-shipped, strictly-validated `AgentReviewRequestSchema` discriminated union (`src/contracts/request.ts:85-87`, currently `mode: 'revisions' \| 'patch'`). Agents need the same machine contract Cumpa already offers for committed ranges/patches (Phase 12/13, `.planning/PROJECT.md:184-186`), now covering the two new review surfaces. | MEDIUM | New Zod modes reusing the existing bounded-byte, NUL-free, UTF-8 validation helpers already in `src/contracts/request.ts:14-32` (`GitArgumentSchema`, `isBoundedGitArgument`); must not relax existing `MAX_AGENT_REQUEST_BYTES`/`MAX_GIT_ARGUMENT_BYTES`/`MAX_PATHSPEC_COUNT` constraints for the new modes. |
| Product copy ("What This Is", README, CLI `--help`, marketplace skill) repositioned from "code review" to "review any agent-produced artifact" | Explicit Active requirement (`.planning/PROJECT.md:236`). No engineering complexity on its own, but must stay truthful to what actually ships (text/Markdown only — binary/notebook rendering remains Out of Scope) to avoid overclaiming. | LOW | Copy-only; depends on the underlying capability actually existing first (see Feature Dependencies). |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| All three uncommitted states (staged/unstaged/working-tree+untracked) as explicit, independently selectable Head choices in one picker | GitHub/GitLab never review uncommitted state at all. VS Code only distinguishes staged vs. unstaged (two buckets, no untracked-inclusive "working tree" option) and offers no durable, line-anchored, exportable review of either[^vscode-staging]. Cumpa uniquely applies its full anchored-comment + export rigor to pre-commit state. | MEDIUM | Builds on table-stakes Git resolution work above. |
| Agent-requestable review of uncommitted/standalone artifacts with the same strict stdin contract used for committed ranges | No comparable local review tool (lazygit, gitui, delta/difftastic-based workflows, PRless) exposes a schema-validated request/response protocol for agents at all[^lazygit]; GitHub/GitLab have no local/offline agent handoff. This extends Cumpa's own existing differentiator (established in Phase 12/13) rather than creating a new one. | MEDIUM | Depends on both working-tree sources and standalone-file review existing server-side first. |
| Full-width single-pane rendering that recovers the space GitHub's *split* view wastes on wholly added/deleted files | GitHub's split (side-by-side) diff mode still allocates two columns even for a 100%-added or 100%-deleted file, leaving one column empty; its unified mode avoids this but loses Cumpa's existing side-by-side comparison UX for modified files. Cumpa's status-driven auto-selection (single-pane only for added/deleted, side-by-side for modified/renamed) gets unified's space efficiency without sacrificing split's readability for true changes. | LOW–MEDIUM | Must preserve the shipped CSP-safe Monaco positioning constraint (`.planning/PROJECT.md` Key Decisions: "Verify release behavior... Monaco positioning under production CSP"). |
| Standalone, non-diff file review reusing the same durable-anchor/export contract as diff comments | VS Code's plain editor has no durable/exportable review-comment concept; GitHub's blame/file view supports comments but not as part of a structured, agent-consumable export. Cumpa's differentiator is giving "just open this file and comment on it" the exact same canonical-JSON/Markdown export guarantee as a diff review. | MEDIUM | Directly enables the "plans, decisions, docs, code" repositioning (feature 7). |
| Markdown preview available on standalone files and uncommitted diffs, not just committed PR diffs | GitHub's "rich diff" only applies inside a committed-ref diff. Cumpa's toggle works across every v2.0 surface (standalone, staged, unstaged, working-tree, committed), which is strictly broader. | LOW | Mostly a reuse decision (apply existing `renderMarkdownPreview` broadly) rather than new rendering work. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Live-updating working-tree diff (re-render on every file-system change, like VS Code's gutter decorations[^vscode-staging]) | Feels "real-time" and matches editor-integrated tools users already know. | Breaks the frozen-snapshot/durable-anchor contract that makes Cumpa's comments drift-detectable rather than silently relocated; the milestone explicitly rejects this by requiring freeze + explicit Refresh (`.planning/PROJECT.md:71`). | Freeze at session start; surface an explicit Refresh action that re-snapshots and reclassifies existing comments as stale/orphaned, exactly like today's committed-drift handling. |
| Hunk/line-level staging actions from inside the diff (stage, unstage, discard — what VS Code's diff-editor gutter and lazygit both offer[^vscode-staging][^lazygit]) | Natural "while I'm looking at it, let me also act on it" request. | Cumpa is a read-only review tool over Git state, never a mutator — an established, repeated decision ("native Git CLI... without modifying Git state"; exact-patch grounding explicitly "without invoking a mutating Git apply path", `.planning/PROJECT.md` Key Decisions). Adding staging actions would be new mutation surface the product has deliberately avoided everywhere else. | User stages/unstages via `git add`/their own tooling outside Cumpa; Cumpa only reviews whatever state results. |
| A general user-togglable unified-vs-split layout preference for every file (GitHub/GitLab both expose this as a global/per-session setting[^github-diffview][^gitlab-changes]) | Mirrors familiar PR-tool ergonomics. | Out of milestone scope; Cumpa's v1.6 restyle invested specifically in one canonical semantic-token diff surface (`.planning/PROJECT.md` v1.6 summary) — reopening pane layout as a user preference risks re-litigating that restyle. Status already deterministically implies the right layout (added/deleted → single-pane, modified → side-by-side). | Keep layout selection automatic from `ChangedFileStatusKind`, not user-configurable. |
| Letting standalone-file review silently fall back to the last-committed blob when a file is unsaved/untracked | Simpler to implement than a new live-read path. | Directly contradicts the repositioning promise — an agent's draft artifact is very often untracked; showing stale/absent committed content would make "review any agent-produced artifact" false in the most common case. | Read live working-tree bytes for standalone files, sharing the frozen-snapshot mechanism built for working-tree sources. |
| Full prose-diff rendering inside the Markdown preview (diffing the *rendered* HTML itself, word-level insert/delete highlighting — GitHub's actual "rich diff" behavior[^github-nonfcode]) | Looks more polished than a plain rendered view; GitHub already does it. | GitHub itself documents this as expensive and unreliable at scale: "Some pull requests involve... large, complex documents... GitHub can't always produce a rendered view of the changes"[^github-nonfcode]. The milestone only asks for a rendered **preview toggle**, not a rendered-level diff — building the harder feature is unrequested scope. | Render the current side's content as plain rendered HTML in preview mode; keep the actual line-level diff in source/single-pane view. |
| Allowing raw HTML embeds to render inside Markdown preview | Richer Markdown documents (readmes with embedded video, etc.) sometimes use raw HTML. | GitHub's own docs flag this as a correctness and consistency problem ("some embedded HTML can be shown... while some... cannot... should always be reviewed in both rendered and source views")[^github-nonfcode], and it's also a CSP/XSS concern inside Cumpa's loopback-only Fastify surface. | Keep the existing renderer's `html: false` configuration (`src/web/model/markdown-preview.ts:4`) unchanged for file preview; don't relax it. |
| Agent-requested review of a working tree that keeps mutating while the developer reviews it | Would let an agent keep writing while waiting, saving a round trip. | Breaks the same drift-detectable guarantee the frozen-snapshot requirement protects for interactive sessions; an agent-initiated session must get identical freeze semantics, not a looser mode. | Apply the same snapshot-freeze-plus-Refresh model to agent-launched sessions as to interactive ones — no special-cased "live" agent mode. |
| Repositioning copy that implies hosted/multi-reviewer/document-collaboration capability | "Review any artifact" sounds adjacent to Notion/Google-Docs-style commenting products. | Explicitly Out of Scope: "Hosting reviews remotely or supporting multiple simultaneous reviewers — product is a single-developer local tool" (`.planning/PROJECT.md:241`). Repositioning changes *what* can be reviewed (artifact type), not *who*/*where* reviews it. | Scope all copy changes to artifact-type breadth (plans/decisions/docs/code), never collaboration/hosting claims. |

## Feature Dependencies

```
[Working-tree sources: Staged/Unstaged/Working-tree+untracked Head choices]
    └──requires──> [Frozen snapshot at session start + explicit Refresh]
                       └──requires──> [Stale/orphaned anchor reclassification extended to worktree drift]

[Single-pane rendering for added/deleted files]
    └──requires──> [Existing ChangedFileStatusKind classification] (already shipped)

[Standalone file review (`cumpa <path|glob>`)]
    └──requires──> [Single-pane rendering] (milestone: standalone files render "single-pane... commentable")
    └──requires──> [Frozen snapshot mechanism] (standalone files must read live worktree bytes, not stale blobs)

[Rendered Markdown preview toggle]
    └──requires──> [Single-pane rendering] (added/deleted Markdown files need a preview surface too)
    └──requires──> [Existing renderMarkdownPreview infrastructure] (already shipped, reused not rebuilt)

[Agent stdin request: uncommitted + standalone modes]
    └──requires──> [Working-tree sources] (server/draft concept must exist before request schema can reference it)
    └──requires──> [Standalone file review] (same reason)

[Product repositioning copy]
    └──requires──> [All of the above actually functioning] (copy must not overclaim ahead of capability)

[Markdown preview toggle] ──enhances──> [Standalone file review]
[Markdown preview toggle] ──enhances──> [Working-tree sources]
[Frozen snapshot + Refresh] ──conflicts──> [Live-updating diff] (anti-feature, listed above)
```

### Dependency Notes

- **Working-tree sources require the frozen-snapshot mechanism:** uncommitted content has no content-addressed immutability the way committed blobs do, so without a freeze step the durable-anchor model (`src/domain/anchor.ts`) has nothing stable to hash against.
- **Standalone file review requires single-pane rendering:** the milestone wording itself ("named files... open... single-pane and commentable") makes single-pane a prerequisite UI surface, not a parallel concern.
- **Standalone file review requires the frozen-snapshot mechanism:** named files are read from the live working tree (an agent's draft artifact is usually uncommitted), so the same freeze/Refresh semantics built for working-tree sources apply here too — building them together avoids two divergent "read live file bytes" code paths.
- **Agent stdin extension depends on both working-tree sources and standalone file review landing first:** the new request modes need a server-side concept (uncommitted scope, standalone path set) to validate against and resolve; building the protocol before the underlying review surfaces exist would require re-opening the schema later.
- **Markdown preview enhances rather than blocks:** it can be built incrementally on top of single-pane/side-by-side once those render any given file, reusing `renderMarkdownPreview` without new sanitization work.
- **Frozen snapshot conflicts with live-updating diff:** these are mutually exclusive UX models; the milestone has already decided in favor of freeze+Refresh (`.planning/PROJECT.md:71`), so live-reactive diffing is explicitly out.

## MVP Definition

### Launch With (v2.0 core)

- [ ] Single-pane full-width rendering for added/deleted files (status-driven, no user toggle) — unblocks everything that needs a non-diff single-file surface.
- [ ] Staged / Unstaged / Working-tree(+untracked, gitignore-respecting) as three Head choices, compared against HEAD or any chosen branch/worktree base.
- [ ] Frozen working-tree snapshot at session start + explicit Refresh, with existing comments reclassified stale/orphaned on drift.
- [ ] Standalone file review via CLI paths/globs, rendering single-pane and commentable, reading live working-tree bytes.

These four are essential because they are mutually reinforcing (see Feature Dependencies) and together deliver the "review any agent-produced artifact, including before it's committed" core value shift.

### Add After Validation (within v2.0, once core review surfaces work)

- [ ] Rendered Markdown preview toggle, applied across standalone files and all diff/uncommitted surfaces — trigger: single-pane and working-tree sources are stable enough to host a preview layer without destabilizing anchor behavior.
- [ ] Agent stdin request extension for uncommitted and standalone-file review — trigger: the server-side concepts for both review surfaces exist and are stable enough to expose through the strict request schema.

### Future Consideration (beyond v2.0)

- [ ] Product repositioning copy pass (README, CLI help, marketplace skill) — defer the final wording pass until the underlying capability is proven, so copy never overclaims ahead of what ships.
- [ ] Any rendered-level (word-diff-inside-HTML) Markdown diffing, binary/notebook preview, or hunk-level staging actions — explicitly out of scope per the Anti-Features table above; revisit only if a future milestone changes those Out-of-Scope decisions.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Single-pane added/deleted rendering | HIGH | MEDIUM | P1 |
| Staged/Unstaged/Working-tree Head choices + merge-base-semantics base | HIGH | MEDIUM | P1 |
| Frozen snapshot + explicit Refresh + stale/orphaned reclassification | HIGH | MEDIUM | P1 |
| Standalone file review (CLI paths/globs) | HIGH | MEDIUM | P1 |
| Rendered Markdown preview toggle | MEDIUM | LOW–MEDIUM | P2 |
| Agent stdin extension (uncommitted + standalone modes) | MEDIUM | MEDIUM | P2 |
| Product repositioning copy | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for v2.0 — the core review-surface changes the milestone exists to deliver.
- P2: Should have, built on top of P1 once those surfaces are stable.
- P3: Nice to have / sequencing-last — copy must not outrun capability.

## Competitor Feature Analysis

| Feature | GitHub (PR "Files changed") | GitLab (MR "Changes") | VS Code (Source Control view) | Our Approach |
|---------|------------------------------|------------------------|----------------------------------|--------------|
| Added/deleted file layout | Unified view is single-column by default; split view still allocates an empty second column for wholly added/deleted files[^github-diffview] | Inline vs. side-by-side is a global user/session preference, same empty-column issue in side-by-side[^gitlab-changes] | Diff editor always side-by-side by default for any change, including new files (empty left pane)[^vscode-staging] | Status-driven: single full-width pane automatically for `added`/`deleted`, side-by-side for `modified`/`renamed`/`copied` — no user toggle, no empty pane ever |
| Markdown rendering | Per-file "Display rich diff"/"Display source diff" toggle; rich diff attempts word-level diff inside rendered HTML and can fail on large/complex docs[^github-nonfcode] | Renders GitLab Flavored Markdown (GLFM) previews separately from diff source[^gitlab-markdown] | Markdown preview pane (not diff-integrated); separate "Markdown preview in diff view" exists for the preview pane itself | Simple rendered/source toggle per file (no rendered-HTML diffing) reusing existing `renderMarkdownPreview`; comments stay anchored to source lines regardless of toggle state |
| Staged/unstaged/uncommitted review | Not supported — only committed refs are ever diffed | Not supported — only committed refs are ever diffed | Two buckets in Source Control view: **Changes** (unstaged) vs **Staged Changes**; diff editor compares against last commit; no untracked-inclusive "working tree vs. HEAD" mode, no durable/exportable comments[^vscode-staging] | Three explicit Head choices (Staged, Unstaged, Working tree incl. untracked+gitignore) against HEAD or any chosen base, with full durable-anchor/comment/export support — unmatched by any compared tool |
| Standalone (non-diff) file commenting | Not supported in diff review; only blame-view comments exist outside PR review flow | Not supported in diff review | No durable/exportable review-comment concept on a plain open file | `cumpa <path\|glob>` opens named files (changed or not) single-pane, commentable, with the same anchor/export contract as diff comments |

## Sources

- Cumpa repository source (ground truth for existing baseline, all file:line citations above): `src/contracts/request.ts`, `src/contracts/comparison.ts`, `src/domain/anchor.ts`, `src/domain/file-tree.ts`, `src/git/comparison.ts`, `src/git/ignore-status.ts`, `src/server/gitignore-capability.ts`, `src/web/monaco/diff-adapter.ts`, `src/web/model/markdown-preview.ts`, `src/web/components/SummarySection.vue`, `.planning/PROJECT.md`
- [^github-diffview]: GitHub Docs, "Reviewing proposed changes in a pull request" — unified/split view toggle via the Settings gear icon. https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request
- [^github-nonfcode]: GitHub Docs, "Working with non-code files" — rich diff / source diff toggle, "Disabling Markdown rendering," "comments... can only be added within source view," complex-document rendering limitations. https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files
- [^vscode-staging]: VS Code Docs, "Staging and committing changes" (microsoft/vscode-docs) — **Changes** vs **Staged Changes** sections, side-by-side vs inline diff editor, gutter stage/revert actions, live gutter decorations. https://github.com/microsoft/vscode-docs/blob/bec06a3925f08cd83aff00129ce81d926ac88fde/docs/sourcecontrol/staging-commits.md
- [^gitlab-changes]: GitLab Docs, "Changes in merge requests" — inline vs. side-by-side preference, "Show one file at a time," collapsed generated files. https://docs.gitlab.com/user/project/merge_requests/changes
- [^gitlab-markdown]: GitLab Docs, "GitLab Flavored Markdown (GLFM)." https://docs.gitlab.com/user/markdown
- [^lazygit]: lazygit documentation/README — terminal Git UI staging and diff model, used as a comparator for local-tool conventions (no agent-request protocol exists in this class of tool). https://lazygit.dev/docs/guide / https://github.com/jesseduffield/lazygit
- [^gitbook-untracked]: Git SCM Book, "Recording Changes to the Repository" — untracked-file definition and default `git diff` exclusion behavior. https://git-scm.com/book/id/v2/Git-Basics-Recording-Changes-to-the-Repository
- Git SCM manual, `git-diff` — working tree/index/tree comparison semantics underlying the Staged/Unstaged/Working-tree distinction. https://git-scm.com/docs/git-diff

---
*Feature research for: local-first agent-artifact review tool (Cumpa)*
*Researched: 2026-10-30*
