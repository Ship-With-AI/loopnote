# Phase 18 — Copy Draft

**Status:** Draft, awaiting human approval (blocking checkpoint, 18-01 Task 2).
**Scope note:** Phase 17.1 (full project rename) is complete. The product's display name is **Loopnote**, npm package `@shipwithai/loopnote`, bin command `loopnote`, repo-state dir `.loopnote/`. This draft therefore uses the literal name **Loopnote** everywhere (not a `<Name>` placeholder — 18-01-PLAN.md predates 17.1's execution; this draft applies its intent to current reality per the executor brief).
**Voice (D-04):** product-neutral, third person/imperative, factual. No founder first-person, no jokes.
**Claims boundary:** every proposed string below describes only capabilities shipped by Phases 13, 14, 15, 17, and 17.1 (single-pane rendering, uncommitted/standalone review with frozen snapshots + Refresh, the agent stdin protocol, the marketplace skill, the Loopnote rename). Phase 16 (Markdown source/rendered toggle, MDV-01..04) has **shipped and passed verification** (human-confirmed 2026-11-02; `.planning/REQUIREMENTS.md`'s MDV-01..04 checkboxes are stale/unticked, but Phase 16's commits and SUMMARYs confirm completion) — no proposed string in this draft claims the rendered-toggle UI beyond the `"markdown-review"` npm keyword, which is an accurate, shipped-capability keyword per the corrected note in "## npm keywords" below. No proposed string contradicts PRODUCT.md's "Deliberate non-capabilities" (no hosted, cloud sync, multi-user, approvals, suggestions, replies, viewed state, authentication, pricing, customers, usage metrics, certifications, or binary review).

---

## Positioning

Loopnote is local review for any agent-produced artifact — code, plans, decisions, docs — run on your own machine, with no hosted service and no multi-reviewer workflow. A pinned Git code comparison is one artifact type among several Loopnote can review: it also reviews uncommitted work (staged, unstaged, or the full working tree), standalone files or globs chosen by path with no Base/Head selection at all, and an agent's own patch or revision range submitted directly over stdin. Every review happens in a local browser workspace backed by repository-local, versioned JSON state; nothing is published to a remote host.

This paragraph anchors the README tagline and the PRODUCT.md "## Product" paragraph below. Both contain the literal substring **"agent-produced artifact"** so Plan 18-02's automated claims-check test can verify the claim is made and is backed by PRODUCT.md.

---

## npm description variants

Exactly 3 candidate strings for `package.json`'s `description` field (D-02). Each is one sentence, each under ~100 characters, each consistent with the Positioning section above.

| # | Variant | Characters |
|---|---------|-----------|
| A | `Local-first review for agent-produced artifacts: code, plans, decisions, and docs.` | 84 |
| B | `Local review of any agent-produced artifact — code, uncommitted work, or standalone files.` | 92 |
| C | `Review what a coding agent produced, locally — pinned diffs, uncommitted work, or standalone files.` | 101 |

**Default if no response is given:** Variant A — shortest, leads with "local-first" (an established term from the current description), names all four artifact kinds from the Positioning paragraph, and stays furthest under the character budget. Not pre-selected as final; the human picks in the Task 2 checkpoint.

**Current value (for reference):** `"Local-first review of pinned Git comparisons"` (`package.json:4`) — this is the string being replaced; it only describes pinned comparisons, not uncommitted/standalone/agent-protocol review.

---

## npm keywords

Finalized array for a new `"keywords"` key in `package.json` (D-03; no `keywords` field exists today — pure addition, not a merge). Starting from CONTEXT.md's example set, with two additions (`git`, `diff-review`) reflecting the Positioning paragraph's "local, no hosted" claim and the package's actual mechanism:

```json
"keywords": [
  "code-review",
  "ai-agents",
  "claude-code",
  "codex",
  "markdown-review",
  "local-first",
  "git",
  "diff-review"
]
```

Note: `"markdown-review"` is an accurate keyword — Phase 16 (rendered Markdown preview toggle, MDV-01..04) has **shipped and passed verification**, not merely "not yet shipped but not a false claim" as earlier drafted. Loopnote renders Markdown files with block-anchored commenting (source/rendered toggle), so this keyword directly matches a shipped capability. Human-confirmed 2026-11-02: keep as drafted.

---

## README rewrite

For every `README.md` row touched by Phase 18, current text is quoted verbatim from the file as it stands today (post-17.1, product = Loopnote), followed by the proposed new text or an explicit "unchanged" note. Headings keep their current Markdown level and position; only prose changes. Per the executor brief, the `## Upgrading from Cumpa` section is **out of scope for this entire phase** — see its own row below.

### Title and tagline (`README.md:1-3`)

**Current:**
> `# Loopnote`
>
> `Loopnote gives committed local Git comparisons a pull-request-style review workspace without publishing a branch or worktree. Choose local branches or registered worktrees, leave durable feedback, and export it for an agent or teammate to use.`

**Proposed:**
> `# Loopnote`
>
> `Loopnote is local review for any agent-produced artifact — code, plans, decisions, docs — in a pull-request-style workspace, without publishing a branch, worktree, or patch. Review a pinned Git comparison, uncommitted work, or standalone files; leave durable feedback; export it for an agent or teammate to use.`

(Title unchanged. Tagline rewritten to lead with D-01's agent-artifacts-first positioning and contain the "agent-produced artifact" anchor substring; names the three review shapes — pinned comparison, uncommitted, standalone — that currently exist, matching D-11's planned README examples.)

### Install/command line (`README.md:5`)

**Current:**
> `Published as **`@shipwithai/loopnote`**; command **`loopnote`**.`

**Proposed:** unchanged — already compliant (no product-neutrality or claims issue; purely factual package/command identity).

### Release-verification paragraph (`README.md:7`)

**Current:**
> `Stable `1.5.0` is published on npm. Its registry bytes, provenance attestation, and global, `npx`, and marketplace installation paths were verified during release acceptance. Source and the sole support channel are the public [Ship-With-AI/loopnote](https://github.com/Ship-With-AI/loopnote) repository and its [Issues tracker](https://github.com/Ship-With-AI/loopnote/issues).`

**Proposed:**
> `Stable releases are published on npm. Each stable release's registry bytes, provenance attestation, and global, `npx`, and marketplace installation paths are verified during release acceptance before publishing. Source and the sole support channel are the public [Ship-With-AI/loopnote](https://github.com/Ship-With-AI/loopnote) repository and its [Issues tracker](https://github.com/Ship-With-AI/loopnote/issues).`

(D-12: drops the pinned `1.5.0` claim; version-agnostic wording that doesn't rot as new stable versions ship. Keeps the "verified during release acceptance" claim — true of the release process itself, not tied to one version number.)

### Skill version-acceptance range sentence (inside "1. Install the CLI")

**Current:**
> `The skill accepts stable versions in `>=1.5.0 <2.0.0` and rejects prereleases. Only `1.5.0` has independent release verification; acceptance of later stable 1.x versions is a compatibility policy, not a test claim.`

**Proposed (human-approved 2026-11-02 — updates to the 2.x contract; supersedes the "leave unchanged under D-12" option originally drafted):**
> `The skill accepts stable Loopnote versions `>=2.0.0 <3.0.0` and rejects prereleases.`

(Matches the bundled skill's actual acceptance range, `.kimi-code/skills/loopnote/SKILL.md:13`: "a stable Loopnote version `>=2.0.0 <3.0.0`; prereleases are not accepted." Drops the "Only `1.5.0` has independent release verification" / "later stable 1.x" clause entirely — not replaced with a 2.0.0-specific verification claim, since `SKILL.md:15` itself states "no 2.x release has independent verification recorded in this file yet.")

### Keyboard shortcuts table row (`README.md`, "## Keyboard shortcuts")

**Current:**
> `| Move in the changed-file tree; open a file | Arrow keys; Enter |`

**Proposed:**
> `| Move in the file tree; open a file | Arrow keys; Enter |`

(D-08: sidebar noun is always "Files" / "file tree", never "changed-file tree".)

### "## Review changes from a coding agent" intro (moves to docs/usage.md)

**Current heading and intro paragraph, reproduced verbatim for traceability:**
> `## Review changes from a coding agent`
>
> `**The Loopnote skill is the recommended way to use this protocol**; it builds the request, supervises the process, and consumes the canonical result for you. See [Install](#install). Use the raw commands below when you are scripting the protocol yourself or building another integration.`
>
> `Run these commands from the repository being reviewed. Redirect `stdout` to the review JSON file your agent will consume; Loopnote sends the browser URL and diagnostics to `stderr`.`

**Disposition:** per D-11, the README keeps **one short example** of the agent request (see "docs/usage.md outline" below for where the full protocol reference — "Review a revision range," "Review an exact patch," "Finish and receive canonical JSON," "Request reference," "Isolation and persistence" — moves). The short README example:

**Proposed (new short README section, replacing the long one):**
> `## Review changes from a coding agent`
>
> `**The Loopnote skill is the recommended way to use this protocol**; it builds the request, supervises the process, and consumes the canonical result for you. See [Install](#install).`
>
> `To script the protocol directly, pipe a JSON request to `loopnote` and redirect `stdout` to a file:`
>
> ```sh
> node --input-type=module -e '
> const request = {
>   kind: "loopnote.review-request",
>   schemaVersion: 1,
>   mode: "revisions",
>   revisions: {
>     base: "0123456789abcdef0123456789abcdef01234567",
>     head: "89abcdef0123456789abcdef0123456789abcdef",
>   },
> };
> process.stdout.write(JSON.stringify(request));
> ' | loopnote > agent-review.json
> ```
>
> `For the exact-patch mode, the full flag reference, and the protocol's isolation/persistence guarantees, see [docs/usage.md](docs/usage.md#agent-request-protocol).`

(The full current section's content — "Review a revision range," "Review an exact patch," "Finish and receive canonical JSON," "Request reference," "Isolation and persistence," including both current code samples and both current JSON schema examples — carries forward verbatim into the docs/usage.md outline below; nothing is dropped, only relocated.)

### "## Review in the browser" (moves to docs/usage.md, README keeps nothing per D-11's enumerated short-example list)

**Current, reproduced verbatim for traceability:**
> `## Review in the browser`
>
> `1. Select a changed file in the file tree.`
> `2. Inspect the side-by-side Monaco diff: **BASE** is on the left and **HEAD** is on the right. Unchanged regions start collapsed; use Monaco's context controls to reveal more context.`
> `3. Move between files and changes using visible controls or shortcuts. On either side of the diff, add a line comment and save it.`
> `4. Open **Review** to write and save the overall Markdown summary. Use its preview to inspect the rendered summary.`
> `5. Inspect saved comments, edit them, resolve them when addressed, and reopen resolved feedback when needed.`
> `6. Check the review-readiness information and any warning about unsaved text before exporting. Export uses the accepted saved revision, not unsaved text currently in a tab.`
>
> `Saved comments and the saved summary are repository-local, versioned JSON state. Reopen the same ordered comparison to continue that saved review. Text left unsaved in a comment or summary editor remains only in the current browser tab; it is not durable and is excluded from export.`

**Disposition:** moves to docs/usage.md in full (step 1's "changed file" becomes "file" in the moved copy, per D-08). README keeps no walkthrough — D-11 lists committed-range / uncommitted-flag / standalone-file / Markdown-toggle / agent-request as the five short examples the README retains; the browser walkthrough itself isn't one of the five, so it relocates entirely.

### "### Draft location" (moves to docs/usage.md)

**Current, reproduced verbatim:**
> `### Draft location`
>
> `Loopnote stores a draft at:`
>
> ```text
> .loopnote/drafts/<comparison-key>.json
> ```
>
> `<comparison-key>` is a 64-hex SHA-256 hash derived from the ordered, pinned base and head commit OIDs. It is an application-generated draft identity, not a filename you choose or a literal base/head path.`

**Disposition:** moves to docs/usage.md verbatim (no wording change needed; already product-neutral and accurate).

### "## Export an accepted review" (moves to docs/usage.md)

**Current, reproduced verbatim:**
> `## Export an accepted review`
>
> `Export creates this pair together from the accepted draft revision:`
>
> ```text
> .loopnote/exports/<baseOid>..<headOid>/review.json
> .loopnote/exports/<baseOid>..<headOid>/review.md
> ```
>
> `review.json` is the canonical export; `review.md` is derived from it. Export does not apply, stage, commit, or push changes.`
>
> `After a successful export, the receipt offers **Reveal export directory**. The export area also shows `.gitignore` status and offers an optional flow to append the Loopnote ignore rule. Ignore status is not a prerequisite for reviewing or exporting.`

**Disposition:** moves to docs/usage.md verbatim.

### "## Stop Loopnote" (moves to docs/usage.md)

**Current, reproduced verbatim:**
> `## Stop Loopnote`
>
> `Return to the terminal where you launched `loopnote` and press `Ctrl+C`. This stops the local loopback server.`

**Disposition:** moves to docs/usage.md verbatim. (Short enough that the human may instead prefer to keep it in the README as a one-liner — flagged as a judgment call, not a locked decision; default proposal follows D-11's "short README + full reference in docs/usage.md" split literally.)

### "## v1 file limits" (stays in README per D-11's scope; "v1" framing check)

**Current, reproduced verbatim:**
> `## v1 file limits`
>
> `Loopnote reviews regular UTF-8 text files only. Each inspected blob side must be at most 1,048,576 bytes (1 MiB).`
>
> `Binary, non-UTF-8, oversized, symlink, submodule, and unsupported mode/type entries stay visible but are not reviewable. Missing-object cases (missing objects) are separately unavailable rather than unsupported file kinds. Loopnote does not separately detect arbitrary generated source files. Its own `.loopnote/` internal output is always excluded from the review inventory.`

**Proposed:** heading changes from `## v1 file limits` to `## File limits` (D-12 version-agnostic wording — the package is now 2.0.0; "v1" refers to the review-request protocol's schema version, not the product release, so keeping "v1" here is a latent accuracy risk now that the product itself is past v1). Body text unchanged — it is already accurate and version-agnostic (the "UTF-8 text files only" / "1 MiB" limits are current facts, not pinned to a version number).

**Flagged — uncertain, needs human decision:** confirm the heading rename from "v1 file limits" to "File limits" is wanted; this is Claude's proposed read of D-12, not an explicit CONTEXT.md instruction naming this heading.

### "## Upgrading from Cumpa" — unchanged, rename-audit anchor

**Current (verbatim, NOT to be touched by any Phase 18 plan):**
> `## Upgrading from Cumpa`
>
> `Loopnote is the renamed continuation of Cumpa. If a `.cumpa/` directory exists from a 1.x install, the drafts and exports stored there are not readable by 2.0.0 and are not migrated. `.cumpa/` is excluded from Loopnote's review file inventory and never appears as reviewable or comparable content. `.cumpa/` is no longer used and can be deleted. Voluntary support status carries over automatically on first run; no action is required.`

**Disposition:** **unchanged, rename-audit anchor.** This heading and its first sentence are the exact byte-identical anchors `scripts/audit-rename-exceptions.mjs` (Category 5) checks for; `npm test` runs that audit and requires zero disallowed "cumpa"/"Cumpa" hits outside this section. No Phase 18 plan — this draft included — proposes any edit here. Explicitly out of scope per this plan's assignment.

### "## License and independent notices" (`README.md`)

**Current, reproduced verbatim:**
> `## License and independent notices`
>
> `Loopnote is open source under the [MIT License](LICENSE). You may use, copy, modify, distribute, sublicense, and sell copies, including in commercial products, provided you retain the required copyright and permission notices. The software is provided without warranty.`
>
> `Required independent grants and attributions remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The application and the separately distributed marketplace skill use MIT; third-party components retain their own licenses and notices.`

**Proposed:** unchanged — already compliant; no POS-0x decision targets this section and it contains no diff-only or hosted-overclaim language.

### "## Voluntary support" (`README.md`)

**Current, reproduced verbatim:**
> `## Voluntary support`
>
> `Support is optional and feature-neutral: review and export do not require payment. Supporting Loopnote does not purchase extra review capabilities or a service, maintenance, update or support commitment.`

**Proposed:** unchanged — out of phase scope (no POS-0x decision targets it; matches 18-RESEARCH.md's own note). Not touched unless the human flags it.

### "## Problems and questions" (`README.md`, final section)

**Current, reproduced verbatim:**
> `## Problems and questions`
>
> `Report problems and ask questions in [Loopnote Issues](https://github.com/Ship-With-AI/loopnote/issues), for both the CLI and the skill.`

**Proposed:** unchanged — already compliant.

### Name story (D-13)

**Disposition: no new name story drafted.** The old "cumpà = friend + compare" Neapolitan etymology story was removed in Phase 17.1 (its D-12). This draft proposes no replacement story for "Loopnote" — the name is reasonably self-explanatory (loop = agent iteration loop; note = review feedback) and D-13 makes a new story strictly optional. If the human wants one drafted, flag that explicitly in the Approval record and a short addition can be proposed before the checkpoint resolves; absent that request, the README's name section stays as today (title + tagline only, no etymology subsection).

---

## PRODUCT.md v2.0 update

### "## Product" paragraph

**Current, reproduced verbatim (`PRODUCT.md:5-6`):**
> `Loopnote is a local-first code review application for committed changes between two local Git branch or registered-worktree heads. Its core value is precise review feedback without publishing the comparison to a remote host.`
> `Loopnote is the product name used across the CLI, browser workspace, exports, and repository-local state.`

**Proposed:**
> `Loopnote is a local-first review application for any agent-produced artifact — code, plans, decisions, and docs — reviewed as a pinned Git comparison, uncommitted work, or a standalone file or glob. Its core value is precise review feedback without publishing the review to a remote host.`
> `Loopnote is the product name used across the CLI, browser workspace, exports, and repository-local state.`

(Contains the literal substring "agent-produced artifact," matching the Positioning section's anchor requirement for Plan 18-02's claims-check test. Second sentence unchanged — still accurate.)

### "## Supplied capabilities" bullet list

**Current, reproduced verbatim (`PRODUCT.md:13-22`):**
> `- An interactive CLI selects an ordered base and head from local branches and registered worktrees.`
> `- Installed Git is the authority for repository discovery, refs, merge bases, worktrees, renames, changed-file metadata, and blobs.`
> `- A Fastify server binds to loopback only and opens a browser workspace.`
> `- The Vue interface uses Monaco for side-by-side text diffs, syntax highlighting, line mapping, and inline review controls.`
> `- Reviewers can leave line comments and an overall summary.`
> `- Versioned JSON drafts live in the repository-local, gitignored `.loopnote/` directory.`
> `- Exports provide Markdown and canonical JSON for a coding agent.`
> `- Version 1 reviews text files; binary, generated, oversized, and unsupported files remain visible but non-reviewable.`

**Proposed (v2.0 — names every capability actually shipped by Phases 13, 14, 15, and 17; adds no Phase-16 Markdown-toggle claim):**
> `- An interactive CLI selects an ordered base and head from local branches and registered worktrees, or reviews uncommitted changes (staged, unstaged, or the full working tree) or standalone files and globs with no Base/Head selection.`
> `- Installed Git is the authority for repository discovery, refs, merge bases, worktrees, renames, changed-file metadata, and blobs.`
> `- A Fastify server binds to loopback only and opens a browser workspace.`
> `- The Vue interface renders side-by-side diffs for two-sided changes and a single full-width pane for added or deleted files, with syntax highlighting, line mapping, and inline review controls.`
> `- Uncommitted and standalone reviews freeze a snapshot at session start; an explicit Refresh re-reads the current worktree without losing saved comments.`
> `- Reviewers can leave line comments and an overall summary.`
> `- Versioned JSON drafts live in the repository-local, gitignored `.loopnote/` directory.`
> `- A coding agent can submit a revision range or an exact patch directly over stdin — through the marketplace skill or scripted directly — and receive a canonical, versioned JSON export without a browser round trip by the agent itself.`
> `- Exports provide Markdown and canonical JSON for a coding agent.`
> `- Loopnote reviews regular UTF-8 text files; binary, generated, oversized, and unsupported files remain visible but non-reviewable.`

(Dropped "Version 1" framing from the last bullet to match the README's "File limits" version-agnostic rewrite above. Does **not** claim a Markdown source/rendered toggle — Phase 16 is Pending per `.planning/REQUIREMENTS.md:120-123`; claiming it here would make it a false "claimed capability" for Plan 18-02's claims-check test to catch.)

### "## Deliberate non-capabilities" — unchanged

**Current, reproduced verbatim (`PRODUCT.md:24-26`):**
> `No claim is made for remote hosting, cloud synchronization, multi-user collaboration, approvals, suggestions, replies, viewed state, authentication, pricing, customers, usage metrics, certifications, or binary review.`

**Disposition: leave unchanged.** v2.0 (Phases 13–17.1) adds no hosted/cloud/multi-user/approval capability; every term in this banned-phrase list is still an accurate non-capability. Plan 18-02's executor should **not** touch this paragraph — it is the source list the claims-check test (D-06) reads, and no proposed string in this draft contains any of its terms.

---

## docs/usage.md outline

New file (D-11). No prior `docs/usage.md` exists — `docs/distribution-operations.md` and `docs/support-service-operations.md` are internal maintainer-ops documents, out of this phase's user-facing scope, and are not touched. `docs/usage.md` follows the README's voice (D-04), not the maintainer-ops imperative tone.

| Section | Content summary |
|---|---|
| `# Loopnote usage reference` (H1) | One-sentence pointer back to the README for install/quick-start; states this file is the full reference. |
| `## Flags and arguments` | Full table: `--staged`, `--unstaged`, `--worktree`, `--base <ref>`, `[paths...]` — reproduces the current `.option()`/`.argument()` description text from `src/cli/run.ts` (see "## CLI copy" below) plus worked examples for each. |
| `## Starting a review` | Moved content: the current README "## Start a review" interactive-picker walkthrough (base/head selection, merge-base diff, dirty-worktree note, confirmation screen, loopback URL). |
| `## Reviewing in the browser` | Moved verbatim from README's current "## Review in the browser" (the six-step list), with step 1's "changed file" → "file" per D-08. |
| `## Standalone-file review` | New content describing `[paths...]` semantics: review named files or globs directly, no Base/Head selection, full-width single-pane rendering (Phase 15). |
| `## Refresh and snapshot semantics` | New content describing SNAP-01..05: uncommitted/standalone sessions freeze a snapshot at launch; Refresh re-reads current worktree bytes without discarding saved comments; what changes and what doesn't across a Refresh. |
| `## Draft location` | Moved verbatim from README's current "### Draft location". |
| `## Exporting a review` | Moved verbatim from README's current "## Export an accepted review". |
| `## Agent request protocol` (anchor: `#agent-request-protocol`) | Moved verbatim: "Review a revision range," "Review an exact patch," "Finish and receive canonical JSON," "Request reference" (both JSON schema examples), "Isolation and persistence" — the full current content of README's "## Review changes from a coding agent" section beyond the one short example kept in the README. |
| `## Keyboard shortcuts` | Full current table moved here if the human prefers the README to drop it entirely; **default proposal is to keep the shortcuts table in the README** (it's short and high-value at the point of use) and not duplicate it here — flagged for confirmation at the checkpoint. |
| `## File limits` | Moved/expanded from README's "## File limits" (renamed from "## v1 file limits" per D-12 above) if the human wants the detail here instead of in the README; default proposal keeps this short section in the README since it's already short, and omits it from docs/usage.md to avoid duplication. |

---

## CLI copy

### `src/cli/run.ts:1457` — Commander `.description()`

**Current:**
> `.description('Local-first review of pinned Git comparisons')`

**Proposed:**
> `.description('Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files')`

(POS-02. This string is also asserted by `tests/cli/help.test.ts:28` — flagged explicitly per the plan's instruction so Plan 18-03 updates that test in the same commit as this source change.)

### `src/cli/run.ts:1459-1462` — four option/argument descriptions

**Current (reproduced verbatim):**
> `.option('--staged', 'Review staged changes (HEAD→index) against a base')`
> `.option('--unstaged', 'Review unstaged changes (index→working tree)')`
> `.option('--worktree', 'Review all working-tree changes (HEAD→working tree), including untracked files')`
> `.option('--base <ref>', 'Base ref or registered worktree to compare against (default: HEAD); rejected with --unstaged')`
> `.argument('[paths...]', 'Files or globs to review directly, with no Base/Head selection')`

**Proposed:** unchanged — already compliant. None of these five strings makes an overclaim or uses diff-only language the Positioning section requires changing; `[paths...]`'s description already frames standalone review as D-01 intends ("Files or globs to review directly, with no Base/Head selection").

### `src/cli/picker.ts:14-15` — `BASE_PROMPT`

**Current:**
> `const BASE_PROMPT = 'Choose base — changes will be compared from its merge base with head';`

**Proposed:** unchanged — already compliant. **Correction to 18-RESEARCH.md:** the research doc (written before Phase 17.1 executed) cites this as still containing the old-name verb form `'...changes will be cumpad from its merge base with head'`. That is stale — Phase 17.1 already reworded this exact string to `'...changes will be compared...'`. No "verbing" of the product name exists in the current file. No change needed or proposed.

### `src/cli/picker.ts:16-17` — `HEAD_PROMPT`

**Current:**
> `const HEAD_PROMPT = 'Choose head — this committed state will be reviewed';`

**Proposed:** unchanged — already compliant.

### `src/cli/picker.ts:30-31` — `UNCOMMITTED_BASE_PROMPT`

**Current:**
> `const UNCOMMITTED_BASE_PROMPT = 'Choose base — changes will be compared from its merge base with HEAD';`

**Proposed:** unchanged — already compliant.

### `src/domain/source.ts:1-3` — `DIRTY_ROW_LABEL` / `DIRTY_EXPLANATION`

**Current:**
> `export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';`
> `export const DIRTY_EXPLANATION = "The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored.";`

**Proposed:**
> `export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';` (unchanged)
> `export const DIRTY_EXPLANATION = "This worktree has uncommitted changes. This comparison reviews committed HEAD only — use --worktree, --staged, or --unstaged to review uncommitted changes directly.";`

(POS-02: removes the "staged, unstaged, and untracked bytes are ignored" enumeration and instead points the user at the flags that actually review uncommitted state — now that Phase 14 shipped those flags, the old wording's implied "uncommitted review isn't possible" framing is inaccurate. Consumed by `src/cli/confirm.ts` and `src/cli/picker.ts`; no signature change, so both consumers keep working unchanged.)

### `src/web/components/IdentityHeader.vue:159-161` — dirty-badge screen-reader text (duplicate of the above, hardcoded separately)

**Current:**
> `<span class="visually-hidden">Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.</span>`

**Proposed:**
> `<span class="visually-hidden">Committed HEAD reviewed; uncommitted changes aren't included.</span>`

(Matches `18-UI-SPEC.md`'s locked Dirty-source copy table; reproduced here for traceability and because it is the second, independently hardcoded call site for the same scoping fact that `DIRTY_EXPLANATION` covers — see 18-RESEARCH.md Pitfall 1. Both this row and the `source.ts` row above must change together.)

### `src/web/components/IdentityHeader.vue:158` — dirty-badge visible text

**Current:**
> `<span>Dirty bytes ignored</span>`

**Proposed:** unchanged — already compliant (no "staged, unstaged, untracked" enumeration in the visible text; only the screen-reader-only span above has the problem phrase).

---

## Browser tab title open questions

`18-UI-SPEC.md`'s "Browser tab title (D-09)" section proposes two session-kind phrasings that are UI-SPEC recommendations, not CONTEXT-locked decisions. Carrying both into this draft for explicit human confirm/adjust, per the plan's instruction:

1. **Exact-patch sessions:** proposed segment is the literal string `Exact patch` (echoing the existing `'Frozen patch'` pin-cue in `IdentityHeader.vue:152` and the existing loading-heading wording `'...loading exact patch'` in `App.vue:1209`). **Confirm or adjust?**
2. **Pinned-range/comparison sessions (not exact-patch, not uncommitted):** proposed segment is `{N} files`, i.e. `${session.files.length} files`, reusing the same `N files` phrasing standalone sessions already use (`IdentityHeader.vue`'s `standaloneLabel`). **Confirm or adjust?**

(Uncommitted sessions use `{sourceLabel} vs HEAD`, e.g. `Working tree vs HEAD` — this one *is* a literal example from `18-CONTEXT.md` D-09, not open; not re-litigated here. Standalone sessions reuse the existing `standaloneLabel`'s file-count pattern, e.g. `3 files` — also a literal CONTEXT.md example, not open.)

**Implementation note (not this plan's scope):** no `document.title` assignment and no `repoName`/equivalent field exist anywhere in `src/web` or `src/contracts/api.ts` today (confirmed by grep) — wiring the `<repo>` segment and the `document.title` watcher is sized as implementation work for the later apply plan (18-04 per 18-RESEARCH.md's Open Questions), not drafted here.

---

## Dirty-source copy (reference only)

Reproduced verbatim from `18-UI-SPEC.md`'s already-locked, already-approved Copywriting Contract, included here only so this single draft file is a complete copy-source reference for every apply plan. No redraft; UI-SPEC's wording is final.

| Element | Current | New | Source |
|---|---|---|---|
| `DIRTY_EXPLANATION` (`src/domain/source.ts`) | `"The worktree's committed HEAD will be reviewed. Staged, unstaged, and untracked bytes are ignored."` | `"This worktree has uncommitted changes. This comparison reviews committed HEAD only — use --worktree, --staged, or --unstaged to review uncommitted changes directly."` | `src/domain/source.ts:2-3`; consumed by `src/cli/confirm.ts`, surfaced via `picker.ts` |
| `IdentityHeader.vue` dirty-badge screen-reader text | `Committed HEAD reviewed; staged, unstaged, and untracked bytes ignored.` | `Committed HEAD reviewed; uncommitted changes aren't included.` | `IdentityHeader.vue:159-161` |
| `IdentityHeader.vue` dirty-badge visible text | `Dirty bytes ignored` | unchanged — already compliant | `IdentityHeader.vue:158` |

### Sidebar title / aria-labels (D-08, UI-SPEC-locked, reproduced for traceability)

| Element | Current | New | Source |
|---|---|---|---|
| Sidebar `<nav>` landmark | `aria-label="Changed files"` | `aria-label="Files"` | `FileTree.vue:155` |
| File-tree `<ul role="tree">` | `aria-label="Changed files"` | `aria-label="Files"` | `FileTree.vue:192` |
| File-tree heading SR text | `Changed files ({{ files.length }})` | `Files ({{ files.length }})` | `FileTree.vue:158` |
| File-tree decorative eyebrow | `<span class="file-tree-pane__eyebrow" aria-hidden="true">Changed</span>` | removed (deleted node, decorative text only) | `FileTree.vue:161` |
| Filter-empty heading | `No matching files` | unchanged — already compliant | `FileTree.vue:225` |
| Filter-empty message | `Clear the filter to show all changed files.` | `Clear the filter to show all files.` | `FileTree.vue:226` |
| "Changed files" dialog title | `title="Changed files"` | `title="Files"` | `ChangedFilesDialog.vue:30` |
| "Changed files" dialog close button | `close-aria-label="Close changed files"` | `close-aria-label="Close files"` | `ChangedFilesDialog.vue:32` |
| Files-drawer open label | `'Open changed files'` | `'Open files'` | `ActiveFileToolbar.vue:73` |
| Files-sidebar show label | `'Show changed files sidebar'` | `'Show files sidebar'` | `ActiveFileToolbar.vue:74` |
| Files-sidebar hide label | `'Hide changed files sidebar'` | `'Hide files sidebar'` | `ActiveFileToolbar.vue:74` |
| Skip-link visible text | `Skip to changed files` | `Skip to files` | `App.vue:1226` |

### Empty states (D-10, UI-SPEC-locked, reproduced for traceability — using verbatim current strings confirmed against `App.vue:197-224`, which differ slightly from 18-UI-SPEC.md's own paraphrase)

| Session kind | Current heading | Current message | New heading | New message | Source |
|---|---|---|---|---|---|
| Exact patch | `No files in this exact patch` | `This accepted patch contains no changed file entries. Relaunch with a non-empty already-applied patch.` | unchanged — already compliant (fact + imperative next action) | — | `App.vue:198-202` |
| Pinned range, with scope | `No changes match this review scope` (same heading for both range branches today) | `The pinned commits contain no changed files selected by this scope.` | `No changes match this review scope.` | `Relaunch with a different scope or range.` | `App.vue:204-210` |
| Pinned range, no scope | `No changes match this review scope` (same heading as above — code has one heading, two messages, not two headings as UI-SPEC's table implied) | `The pinned commits contain no changed files.` | `No changes match this review scope.` | `Relaunch with a different range.` | `App.vue:204-210` |
| Uncommitted, staged | `No changes` | `There is nothing staged. Refresh after staging changes, or relaunch with a different source.` | `No changes in Staged.` | `Edit files, then Refresh.` | `App.vue:212-219` |
| Uncommitted, unstaged | `No changes` | `The working tree matches the index. Refresh after editing files, or relaunch with a different source.` | `No changes in Unstaged.` | `Edit files, then Refresh.` | `App.vue:212-219` |
| Uncommitted, worktree | `No changes` | `` `The working tree matches ${uncommittedBaseLabel}. Refresh after editing files, or relaunch with a different source.` `` | `No changes in Working tree.` | `Edit files, then Refresh.` | `App.vue:212-219` — matches `18-CONTEXT.md`'s own literal example verbatim |
| Pinned comparison (default/else branch) | `No PR-style changes in this pinned comparison` | `The selected head has no changes from the displayed merge base.` | `No changes in comparison.` | `Relaunch with different Base/Head endpoints.` | `App.vue:220-223` — drops diff-specific "PR-style" jargon per POS-03; D-07 keeps "comparison" since Base/Head literally exist here |

**Resolved 2026-11-02 (human-approved):** the D-10 pattern `No changes in {Working tree|Staged|Unstaged}. Edit files, then Refresh.` applies to **all three** uncommitted sources, each using the session's actual dynamic source label — not hardcoded to "Working tree" and not limited to the worktree branch alone. The three rows above reflect this: Staged → "No changes in Staged.", Unstaged → "No changes in Unstaged.", Working tree → "No changes in Working tree." — each paired with "Edit files, then Refresh."

---

## Approval record

**Approved 2026-11-02.** These are the human's final decisions. Apply plans (18-02/18-03/18-04) read the verbatim strings below literally; they do not invent wording.

- [x] npm `description` variant picked: **Variant A**, verbatim:
  > `Local-first review for any agent-produced artifact: code, uncommitted work, or standalone files`

- [x] npm `keywords` list: confirmed as drafted, verbatim:
  ```json
  "keywords": [
    "code-review",
    "ai-agents",
    "claude-code",
    "codex",
    "markdown-review",
    "local-first",
    "git",
    "diff-review"
  ]
  ```
  `"markdown-review"` is accurate and not merely non-false: Phase 16's rendered Markdown preview toggle shipped and passed verification (see corrected note in "## npm keywords" above and the corrected "Claims boundary" at the top of this file).

- [x] `BASE_PROMPT` rewording: confirmed unchanged — already compliant, no "cumpad" verb form exists in current code.

- [x] Browser tab-title phrasing — exact-patch segment: confirmed, verbatim: `Exact patch`

- [x] Browser tab-title phrasing — pinned-range/comparison segment: confirmed, verbatim: `{N} files` (i.e. `${session.files.length} files`), per the D-09 format.

- [x] Name story (D-13): confirmed — none. No new name story drafted or wanted.

- [x] README skill version-acceptance sentence (inside "1. Install the CLI"): confirmed in-scope for this phase, **updated** (not left unchanged) to the 2.x contract, verbatim:
  > `The skill accepts stable Loopnote versions `>=2.0.0 <3.0.0` and rejects prereleases.`
  The "Only `1.5.0` has independent release verification" / "later stable 1.x" clause is removed entirely (not replaced with a 2.0.0-specific verification claim). See "## README rewrite" → "Skill version-acceptance range sentence" above.

- [x] README "## v1 file limits" → "## File limits" heading rename: confirmed.

- [x] README "## Stop Loopnote" section: stays in README (not moved to docs/usage.md).

- [x] docs/usage.md "## Keyboard shortcuts" duplication: omit — README owns Keyboard shortcuts, not duplicated in docs/usage.md.

- [x] docs/usage.md "## File limits" duplication: omit — README owns File limits, not duplicated in docs/usage.md.

- [x] Uncommitted empty-state message: confirmed the D-10 pattern, **extended to all three uncommitted sources** (staged, unstaged, worktree) — not only the worktree row as originally drafted. Each session's actual source name is used, not hardcoded to "Working tree." Verbatim pattern:
  > `No changes in {Working tree|Staged|Unstaged}. Edit files, then Refresh.`
  Concretely: Staged → `No changes in Staged.` / `Edit files, then Refresh.`; Unstaged → `No changes in Unstaged.` / `Edit files, then Refresh.`; Working tree → `No changes in Working tree.` / `Edit files, then Refresh.` See the updated empty-states table above.

- [x] Any other edits to this draft's wording: none.

---

*Phase: 18-product-repositioning-copy*
*Plan: 18-01*
*Drafted: 2026-11-02*
