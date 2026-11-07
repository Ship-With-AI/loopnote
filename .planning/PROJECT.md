# Loopnote

## What This Is

Loopnote (renamed from Cumpa in v2.0) is a local-first review workspace for anything a coding agent produces: code, plans, decisions, and documentation. A CLI launched inside a Git repository opens a browser workspace where the developer reviews a change set between two local branches or registered worktrees, uncommitted work (staged, unstaged, or the whole working tree including untracked files) against HEAD or any chosen base, or a named set of files. Modified files render side by side; added, deleted, and standalone files render full width; Markdown can be read rendered. The developer leaves line comments and an overall summary, then exports Markdown plus canonical JSON a coding agent can apply. Agents can request the same review over stdin and receive the canonical result.

## Core Value

A developer can accurately review repository-grounded changes chosen by a developer or coding agent and return precise, drift-detectable feedback the agent can act on.

## Current State

**Shipped:** v2.0 Artifact Review on 2026-11-04 (closed without a milestone audit, by
operator choice). `@shipwithai/loopnote@2.0.0` is `latest` on npm; the `loopnote` command
replaces `cumpa`, and existing support state migrates once from the old Cumpa path.

v2.0 delivered 35/35 requirements across 7 phases (13–18 plus inserted 17.1), 70 plans:
single-pane added/deleted files; Staged/Unstaged/Working-tree review from a content-addressed
snapshot frozen at launch with explicit, comment-reclassifying Refresh and relaunch recovery;
standalone file/glob review; rendered Markdown preview with block-anchored comments under the
production CSP; agent stdin `uncommitted`/`files` modes with V5/V6 exports; the full
Cumpa → Loopnote rename from one `RENAME_MAP`; and copy repositioned to agent artifact review.

Known deferred at close (STATE.md Deferred Items): the terminal `r` refresh needs a real-TTY
human check (Phase 14), and multi-file `workingTreeChangedAfterFinalSnapshot.paths` lacks a
test (Phase 17).

**Completed locally:** v2.1 Workbench Redesign on 2026-11-07: 8 phases, 53 plans, 45/45 requirements covered under the approved design interpretations. The refreshed milestone audit is `tech_debt`, with no integration blockers; retained debt is explicit in the audit and STATE.md. This source-milestone close is not an npm release: the package remains `@shipwithai/loopnote@2.0.0`, tagging is disabled, and nothing is pushed or published by closeout.

<details>
<summary>State at v1.6 / v1.5 close (2026-09-15)</summary>


**Shipped:** v1.6 Workspace Restyle on 2026-09-14 (workspace surface) and v1.5 MIT
Distribution on 2026-09-15 (distribution). The two milestones were closed on separate
branches and reconciled when `restyle` merged into `main`; see `MILESTONES.md` for the
reconciliation note.

**v1.6 Workspace Restyle** — audit status `tech_debt`, archiveable with one accepted item,
now closed. The whole browser review workspace renders from one
canonical semantic token root, with the typed Monaco theme derived byte-identically from it at
build time. The changed-file tree is dense rows with signed counts and directory descendant
counts, plus a filter that prunes rather than rebuilds so expansion identity and selection
survive clearing. The diff surface is restyled entirely through Monaco's own mechanisms. The
shell is composed around one extracted `ModalDialog` primitive, four disagreeing breakpoint
systems are unified onto 760/1050/1650, and every warning class sits behind a single
live-region owner.

**Post-close changes to that surface (2026-09-15), before the merge:** `80c3b92` fixed the
Files toggle emptying the sidebar permanently (Vue resolves a Teleport target once, so `v-if`
on `#changed-files` stranded the file tree; now `v-show`). `8b2a050` fixed the Review rail
rendering transparent over Monaco, bisected to Phase 11-05's `5599805`. Quick task
`260915-gxg` removed the active-file context bar, moving the filename, its status and counts,
and the Files toggle onto the navigation bar — one 41px bar replaced two. Quick task
`260915-jbv` removed the **Details** dialog, the **Review** comments rail, and **Keyboard
help** outright at the owner's instruction, with no relocation: accepted losses are comment
resolve/reopen/edit/delete, the stale and orphaned anchor records, the cross-tab conflict
notice, comparison identity, per-file metadata, and in-app keyboard help. Comment *creation*,
export, summary, Finish attached review, draft persistence, Changed files, and Support are
intact.

**v1.5 MIT Distribution:**

Cumpa is published on the public npm registry as `@shipwithai/cumpa` under standard MIT
terms. Users install it globally, run it through `npx --yes`, or install the public
ShipWithAI marketplace skill that checks for the separately installed CLI. Every release is
published through OIDC trusted publishing from the approved public repository with no
long-lived credentials, and carries SLSA provenance bound to its source commit and CI run.
`latest` is `1.5.2`.

The full browser-review acceptance matrix — install, launch, ordered base/head selection,
review, comment, Finish, export — was proved end to end against the public `1.5.0` artifact
on all three installation paths. The 1.5.1 and 1.5.2 patches carry their own publication,
provenance, and fix-presence evidence but did not re-run that whole matrix.

One requirement is knowingly unmet: ACC-04's verified-support state remains unreachable
because the paid entitlement exists only in Stripe test-mode data, D-07 forbade a new
purchase, and Restore still completes on a false RPC result. Unpaid and dismissed support
states passed on every path, so no review or export behaviour is gated.

The repository gate runs the full Playwright suite (94 tests) on every push to `main`;
it found and forced fixes for a composer draft-loss race and a roving-tabindex defect
within hours of being widened.

</details>

## Latest Completed Milestone: v2.1 Workbench Redesign

**Goal:** Rebuild the browser review workspace as a VS Code-inspired workbench that gives the diff nearly all the space, keeping Loopnote's palette and every existing review, export, and support behaviour.

**Delivered:**
- Workbench shell: 32px title bar with a Base→Head identity pill and details/drift/refresh popover; resizable files-only side bar; icon-only editor-title actions with VS Code shortcuts and breadcrumbs; bottom panel (Comments / Summary / Export) closed while reading (⌘J); 22px status bar with snapshot, open/stale comments, Export, and voluntary support.
- VS Code Explorer-density changed-files tree: nominal 22px geometry tokens (decorated rows remain approximately 26px, documented debt), compact folders, right-aligned M/A/D, comment badges, `+/−` counts on hover or selection, path filter, view options, footer totals, and keyboard navigation.
- Inline Monaco view-zone comment threads with Open / Resolved / Anchor-moved presentation, resolve / reopen / edit / delete with independent Undo windows, expanded-by-default open threads, session-scoped collapse, and cross-file navigation. Replies remain deferred.
- Export readiness, the approved selector/source-drift acknowledgement gate, and receipts in the bottom panel. No per-comment anchor acknowledgement field was added.
- Workbench geometry tokens over unchanged Loopnote colour roles; `DESIGN.md` describes the shipped composition, components, and responsive scope.
- Toolbar groups reachable by role and name.
- `.vue` components brought under typechecking via a TypeScript/vue-tsc pairing decision.

**Design source:** sketches 001–004 (`.planning/sketches/`), skill `sketch-findings-loopnote`.

**Scope decisions (2026-11-04):** desktop only — layouts below 1050px may regress and are recorded as debt; drafts, the anchor model, V1–V6 exports, the agent stdin protocol, support flow, and all session kinds stay behaviourally unchanged.

**Next milestone:** Not scoped. Replies, per-file viewed tracking, and layouts below 1050px remain deferred; choose future scope with `/gsd:new-milestone`.

Candidates carried forward from v1.5 (still unscheduled):

- Make Restore propagate a false or failed RPC result into a non-completion response, then
  obtain a permitted genuine live entitlement and close ACC-04 by rerunning only the
  verified-state portions for the global, npx, and marketplace paths.
- Correct `SKILL.md`, which still installs `@1.5.0` and claims only 1.5.0 has independent
  release verification; this needs a separate marketplace publication.

<details>
<summary>v2.0 Artifact Review (shipped 2026-11-04)</summary>

**Name at the time:** Cumpa (renamed to Loopnote in inserted Phase 17.1).

**Goal:** Make Cumpa a local review workspace for any artifact a coding agent produces (code, plans, decisions, docs), including uncommitted work, while keeping feedback precise and drift-detectable.

**Target features:**
- Single-pane, full-width view for added and deleted files (no empty side).
- Uncommitted sources at launch: Staged (HEAD→index), Unstaged (index→worktree), and Working tree including untracked files (HEAD→worktree) as separate Head choices; compared against HEAD by default or any chosen branch/worktree base.
- Working-tree snapshot frozen at session start plus an explicit Refresh action; comments on changed content are classified stale/orphaned as today.
- Standalone file review: CLI paths/globs open the named files (changed or not) full width and commentable.
- Rendered Markdown preview toggle; comments stay anchored to source lines.
- Agent stdin request extended to uncommitted and standalone-file review, returning canonical JSON.
- Product repositioning from "code review" to "agent artifact review" across What This Is, README, CLI help, and the marketplace skill.

**Reversals:** v2.0 brings working-tree review into scope (previously Out of Scope) and supersedes the "committed Git objects only" decision for worktree sources; frozen session snapshots keep the drift-detectable guarantee.

**Delivered:** all seven target features plus the inserted full rename; see
`.planning/milestones/v2.0-ROADMAP.md`.

</details>
<details>
<summary>v1.5 MIT Distribution (shipped)</summary>

**Goal:** Let users install and run MIT-licensed Cumpa from public npm and install its public ShipWithAI skill, with the existing Cumpa source repository and reviewed history publicly available under the same standard MIT license.

**Decision authority:** 2026-09-08 quick task `260908-d25` supersedes the 2026-09-07 proprietary source-available direction. Standard MIT permits commercial use, modification, redistribution, sublicensing, and resale; third-party rights and notices remain unchanged. Phase 03 completed the named exact-text assent, rights/sensitive-history review and separately authorized source-publication gates. Runtime artifact and registry publication remain gated by the later phases.

**Target features:**
- Publish MIT-licensed `@shipwithai/cumpa@1.5.0` for global installation and exact-version `npx` execution.
- Package required compiled runtime and browser assets while excluding TypeScript source, source maps, tests, planning files, and Git history.
- Publish from the approved public repository through npm trusted publishing without a long-lived npm token; preserve eligible automatic provenance and make only verified release claims.
- Publish the existing thin Cumpa coding-agent skill publicly under the ShipWithAI marketplace with an independent MIT license.
- Declare the separately installed public CLI prerequisite and keep all review authority in the CLI.
- Verify clean global, npx, and marketplace-installed browser-review flows against released artifacts.
- Completed in Phase 03: publish the existing `Ship-With-AI/cumpa` repository and reviewed history after the approval gates, with its verified public Issues page and no separate homepage.

**Delivered:** all six target features. ACC-04's verified-support acceptance remained
blocked under D-07/D-08; see `.planning/milestones/v1.5-ROADMAP.md`.

</details>
<details>
<summary>v1.4 Voluntary Support (shipped)</summary>

**Goal:** Add voluntary payment and privacy-safe recovery without changing access to any review feature.

**Delivered features:**
- Added one optional Stripe-hosted USD $49.99 support payment.
- Kept payment feature-neutral: dismissing or declining support leaves every review capability available.
- Used private Supabase tables and service-role RPCs behind GitHub OAuth and three Edge Functions.
- Made raw-body signature-verified Stripe webhook fulfillment the only paid-status authority.
- Persisted monotonic verified status locally and restored it to unlimited installations through one-use installation-bound OAuth intents.
- Shipped support only in the canonical configured release package; ordinary local builds remain support-free.

</details>
<details>
<summary>v1.3 Agent Review Handoff (shipped)</summary>

**Goal:** Let a coding agent submit an exact, repository-grounded review request, wait while the developer reviews it in Cumpa, and receive canonical JSON feedback on completion.

**Delivered features:**
- Accepted a versioned review request on CLI stdin without changing the existing interactive launch flow.
- Grounded contiguous Git ranges with native pathspec filters and exact already-applied patches against repository-backed bytes.
- Reused the normal browser review workspace for human review.
- Finished attached sessions explicitly and emitted one canonical JSON response to the waiting coding agent.

</details>

<details>
<summary>v1.2 milestone intent</summary>

**Goal:** Make the ordered source picker interactive quickly and keep branch search scalable in repositories with 10,000 local branches.

**Delivered features:**
- Exposed the attached current branch and registered worktrees before complete local-branch enumeration.
- Added case-insensitive literal local-branch search on non-empty picker input.
- Batched branch metadata and abbreviation work through bounded native-Git protocols.
- Verified the compiled production path with exactly 10,000 packed local refs: readiness median 221.532417 ms and search median 38.266167 ms.
- Preserved correct identity, ordering, worktree state, cancellation, recovery, and failure behavior without mutating refs.

</details>
## Requirements

### Validated

- [x] User can launch the application from a Git repository through a CLI that opens a loopback-only browser session.
- [x] User can interactively select an ordered base and head from local branches and registered worktrees.
- [x] User can review merge-base-to-head changes in a GitHub-like side-by-side text diff with changed-file navigation and expandable context.
- [x] User can create, edit, delete, resolve, and reopen durable line comments. Quick task `260915-jbv` removed the old rail-based lifecycle on 2026-09-15; v2.1 restored it through inline threads, including keyboard editing and independent delete/Undo windows.
- [x] User can write an overall review summary while the review remains an editable repository-local draft.
- [x] User can export a completed review as readable Markdown and versioned JSON containing stable Git identities and context anchors for an applying agent.

Validated in Phase 01: Pinned Local Comparison.

Validated in Phase 02: Anchored Diff Review.

Validated in Phase 03: Complete Review Draft.

Validated in Phase 04: Agent-Ready Export.

Phase 04.1 closed the audited CMT-01 async cross-file settlement gap without changing the validated product scope.

Validated in Phase 05: Semantic Dark Foundation established the dark semantic palette, typography, interaction-state, surface, and responsive foundation; Monaco diff semantics and later review-surface adaptation remain active.
Validated in Phase 06: Monaco Diff Semantics coordinated editor, syntax, diff, gutter, selection, comment-anchor, and focus layers while preserving Monaco as diff authority.

Validated in Phase 07: GitHub-Familiar Review Surfaces adapted the file header, controls, inline conversations, review rail, recovery, notices, and export feedback without changing review mechanics.

Validated in Phase 08: Accessible Responsive Continuity completed the GitHub-dark workspace adaptation with composited WCAG contrast, durable focus and forced-color cues, localized side-by-side diff overflow, responsive reflow through true 400% zoom, and unchanged review/export behavior.

The final v1.1 clarity pass compacted the changed-files sidebar, made removed/added semantics explicit, strengthened diff fills, preserved Monaco positioning under the production CSP, and recorded the shipped product and visual contracts.

Validated in Phase 09: Immediate Source Picker exposed the attached current branch and truthful registered worktrees before complete local-branch enumeration.

Validated in Phase 10: On-Demand Branch Search added fresh case-insensitive literal local-head search through bounded native-Git protocols.

Validated in Phase 11: Production Performance Gate proved the compiled picker path within fixed readiness and search budgets against exactly 10,000 packed local refs.

Validated in Phase 12: Request Protocol & Range Grounding accepts one strict, bounded versioned stdin range request while preserving TTY launch; native Git pins range commits and ordered pathspec scope through the browser session, draft identity, and V2 export.

Validated in Phase 13: Exact Patch Grounding accepts a strict exact already-applied patch, proves repository-object preimages and target postimages, preserves a frozen snapshot with explicit drift, and emits canonical V3 patch export provenance without modifying Git state.

Validated in v1.4 Voluntary Support:

- [x] One optional one-time USD $49.99 Stripe-hosted support payment.
- [x] Payment changes no feature except support-dialog visibility.
- [x] Only signature-verified server webhook fulfillment proves payment.
- [x] The local app contains no Stripe or webhook secret and accepts only the configured canonical Supabase origin.
- [x] The configured production package shows the support dialog until verification.
- [x] The dialog describes optional support and links to fixed Stripe Checkout.
- [x] Unpaid users can dismiss the dialog and retain unrestricted application use.
- [x] Successful verification produces a thank-you state and automatic close.
- [x] Verified status suppresses future prompts installation-wide.
- [x] Additional installations restore paid status through GitHub OAuth.
- [x] Recovery uses a privacy-safe, one-use, installation-bound OAuth intent and returns no OAuth material locally.
- [x] One paid account can restore unlimited installations.

Validated in v1.5 Phase 03: Distribution Contract & Legal Boundary:

- [x] Standard MIT terms with the named licensors' recorded exact-text assent and retained independent third-party notices.
- [x] Public source and reviewed history in the existing `Ship-With-AI/cumpa` repository, after rights/sensitive-material review and exact scoped publication authorization.
- [x] Coherent prepared package metadata and verified public source/Issues links without claiming npm availability.
- [x] An evidence-backed provenance policy that assigns actual artifact, registry and attestation verification to the later release phases.

Validated in v1.5 Phase 04: Exact Runtime Tarball:

- [x] The installed candidate reports exactly `1.5.0` and retains Node.js 24+/Git prerequisite guidance.
- [x] The approved runtime/legal-only archive includes required compiled Node/browser assets and excludes development/source/map/local-state/Git/skill material under the declared bounded scanner controls.
- [x] The same exact bytes passed installed review/relaunch, support-unavailable dismissal and canonical V2/V3 Finish, then received attributable SHA-256/length approval in read-only outside-checkout custody.
- [x] Sealed accepted-local evidence and attributable approval established the initial exact-byte handoff without publication authority. The owner's subsequent Phase 5 CI-build decision supersedes only that publication designation; the Phase 4 artifact and records remain unchanged.

Validated in v1.5 Phases 05–07: Publication, Marketplace Skill, and Public Acceptance:

- [x] Users can install MIT-licensed `@shipwithai/cumpa` globally to obtain the `cumpa` command or run it through `npx @shipwithai/cumpa@<version>`.
- [x] Maintainers can publish approved releases from the public repository through npm trusted publishing without a long-lived token, retaining eligible automatic provenance and verifying attestation claims.
- [x] Coding-agent users can install the existing public MIT-licensed Cumpa skill through ShipWithAI and follow its declared CLI prerequisite.
- [x] Clean global, npx, and marketplace installation paths complete the existing browser-review workflow against released artifacts.

ACC-04 remains the one unmet v1.5 requirement: unpaid and dismissed support states preserve
unrestricted review and export on all three paths, but the verified-support state could not
be genuinely reached (`live-entitlement-unavailable`, `substituted: false`) under D-07/D-08.

Validated in v2.0 Phase 13: Single-Pane File Rendering:

- [x] Added and deleted files render as a single full-width pane.

Validated in v2.0 Phases 14–18 (Artifact Review):

- [x] User can choose Staged, Unstaged, or Working tree (with untracked files) as the Head source, against HEAD or any chosen branch/worktree base. — v2.0 (Phase 14)
- [x] Working-tree sessions review a frozen snapshot and offer an explicit Refresh that reclassifies existing comments. — v2.0 (Phase 14; terminal `r` refresh awaiting real-TTY human check)
- [x] User can review named files or globs outside any diff, full width and commentable. — v2.0 (Phase 15)
- [x] User can toggle a rendered Markdown preview without losing source-line comment anchoring. — v2.0 (Phase 16)
- [x] Coding agents can request uncommitted and standalone-file review over stdin and receive canonical JSON. — v2.0 (Phase 17)
- [x] The product, package, CLI, protocol kinds, and state directories are named Loopnote, with one-time migration of existing state. — v2.0 (Phase 17.1)
- [x] Product copy positions Loopnote as review for any agent-produced artifact. — v2.0 (Phase 18)

Validated in v2.1 Phase 19: Typecheck Foundation — `vue-tsc@3.3.14` paired with the `typescript`/`@typescript/native` dual-alias scheme typechecks the whole `src/web/` tree (`tsconfig.web.json` widened from a seven-file allowlist to a full-tree `include` glob); the 19-error/4-file backlog is fixed; `npm run typecheck:web` is wired into CI's `repository-gates` job and exits 0 with no baseline/allowlist; `build:node`'s native TypeScript 7 output is proven byte-identical across the swap.

- [x] `.vue` components are typechecked. — v2.1 (Phase 19)
- [x] Base→Head identity, drift, and Refresh live in a title-bar pill and popover. — v2.1; Refresh session/content/navigation and draft-safety gaps validated in Phase 25.1 (Refresh Session Resync).

Validated in v2.1 Workbench Redesign:

- ✓ VS Code-inspired, resizable five-region shell with persisted side-bar width/panel height and a panel closed at session start. — v2.1
- ✓ Explorer-density tree/list navigation, filter, view options, totals, status and comment badges; nominal 22px tokens with decorated-row density retained as documented debt. — v2.1
- ✓ Inline thread resolve/reopen/edit/delete, keyboard save/cancel, independent Undo, session-scoped expansion, and cross-file navigation. — v2.1
- ✓ Comments/Summary/Export tabs, debounced summary autosave, reveal/focus chain, receipts, and agent Finish behind existing readiness and approved drift gating, without draft/export/protocol schema changes. — v2.1
- ✓ Named toolbar/control regions, keyboard popovers, and one announcement owner per audited outcome. — v2.1
- ✓ Contributor/user documentation describes the workbench and safe Refresh semantics. — v2.1

### Active

No active milestone. Carried-forward candidates remain unscheduled until `/gsd:new-milestone` selects scope.

### Out of Scope

- Hosting reviews remotely or supporting multiple simultaneous reviewers — the product is a single-developer local tool.
- Posting reviews to GitHub, GitLab, or another forge — exported files remain the integration boundary.
- Applying requested changes from inside the application — a separate coding agent consumes the export.
- Image, notebook, binary diff rendering — Loopnote reviews text; Markdown has a rendered preview since v2.0 and Markdown images resolve through a path-safe route, while other unsupported files are identified but not rendered inline.
- Full GitHub review mechanics such as replies, suggestion patches, approvals, pending-review submission, and persisted per-file viewed tracking — v2.1 restores inline comment lifecycle, not a new review/draft schema.
- Publishing credentials, confidential operational material, or content without publication rights — public-source release requires review of tracked content and history; destructive remediation needs separate approval.
- Shipping TypeScript source, source maps, tests, planning files, or repository history in npm artifacts — consumers receive the compiled runtime-only distribution.

## Context

Loopnote has completed nine source milestones: the local browser-review-to-agent loop, a GitHub-dark accessible workspace, scalable source discovery, strict agent handoff, voluntary support, MIT distribution, canonical-token restyling, artifact review beyond committed ranges, and the v2.1 workbench redesign. v2.1 is closed locally; npm publication remains at the separately released v2.0 package.

Committed comparisons remain ordered and frozen to full commit IDs: the displayed change is the merge base of those commits compared with the selected head. Since v2.0, uncommitted (Staged/Unstaged/Working tree) and standalone sessions review a content-addressed snapshot captured at launch instead; dirty bytes enter the review only through that frozen snapshot, and Refresh appends a new snapshot and reclassifies every comment.

Current tracked source comprises 128 TypeScript/Vue files under `src/`, with 31,032 physical lines (including a final unterminated line). The Node/Fastify/Vue/Vite/Monaco stack and server-owned review/persistence/export authorities remain unchanged.

Exports are versioned and machine-validated (schema versions 1–6; V4 standalone, V5/V6 agent-driven uncommitted/standalone with a working-tree drift flag). Canonical JSON owns comparison identities, accepted summary and comments, timestamps, blob identities, and context anchors; Markdown is derived from that validated model. Publication is an atomic pair beneath `.loopnote/exports/`, with hashes and a bounded receipt.

Coding agents can submit strict range or exact-patch review requests and receive one validated canonical result after the developer finishes the normal browser review. Interactive TTY review remains unchanged.

v1.4 shipped 12/12 requirements across two phases, 22 plans, and 30 tasks. Its audit verified 8/8 cross-phase connections and 8/8 end-to-end flows. The active hosted implementation is a Supabase private schema plus three Edge Functions; GitHub OAuth binds support or restoration intent, while signature-verified Stripe webhook fulfillment alone establishes paid status.

Accepted v1.4 debt is bounded to a stale deleted-suite filename in the deployment verifier contract and one unused local support-status endpoint/client wrapper. Neither affects the verified release flow.

The old Details dialog, Review rail, and keyboard-help surface remain removed. v2.1 restores comment lifecycle through inline Monaco threads and moves Comments/Summary/Export into a bottom panel rather than recreating the rail.

Retained debt includes the default panel's below-fold Export/Finish action, the unreachable live `stale` anchor state, decorated tree-row density, advisory review/reporting cleanup, historical test-load observations, Phase 14 real-TTY Refresh, Phase 17 multi-file drift coverage, and inherited release/support work. See the v2.1 milestone audit and STATE.md; the whole-tree Vue typecheck gap is closed.
## Constraints

- **Runtime**: Node.js 24 LTS with TypeScript end to end — one language across CLI, server, shared contracts, and UI, using the current supported LTS baseline.
- **Git semantics**: Invoke the installed Git CLI as the source of truth — merge bases, refs, worktrees, renames, diff metadata, and blobs must match Git behavior.
- **CLI**: Commander with an Inquirer-based searchable selector — launch is interactive and ordered base/head selection is explicit.
- **Server**: Fastify bound only to `127.0.0.1` on an ephemeral port — the default browser opens automatically and no LAN service is exposed.
- **UI**: Vue 3 with Vite and Monaco Diff Editor — side-by-side diff rendering, line mapping, syntax highlighting, and inline review controls run in the browser.
- **Contracts**: Zod schemas shared by API, draft persistence, and export generation — incompatible or corrupt data fails explicitly.
- **Persistence**: Versioned JSON files in a gitignored repository-local `.loopnote/` directory (migrated from `.cumpa/` in v2.0) — no database or browser-only source of truth.
- **Content**: Text files only — binary, generated, oversized, or unsupported files remain visible as non-reviewable entries; Markdown additionally renders through the hardened single-instance `markdown-it` pipeline.
- **Snapshots**: Uncommitted and standalone sessions capture a content-addressed snapshot at launch and never substitute live repository or worktree bytes for it.
- **Testing**: Vitest for Git, diff, persistence, and export contracts; Playwright for the browser review flow.
- **Support**: Voluntary support never gates review features; hosted payment authority is optional, credential-free from the local app, and enabled only in the canonical configured release package.
- **Distribution**: Ship only the compiled runtime in MIT-licensed `@shipwithai/loopnote`, exposing `loopnote`; public source/history and immutable older Cumpa artifacts remain intact. Future releases require their own approved candidate and trusted-publishing/provenance workflow; milestone closeout alone grants no npm publication authority.
- **Licensing**: Loopnote source and compiled releases use standard MIT with copyright retained by Alessandro Magionami & Manuel Salvatore Martone. Third-party rights/notices and exact-text publication approval requirements remain unchanged; voluntary support stays feature-neutral.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use PR-style merge-base-to-head comparison | Match the mental model and visible change set of hosted pull-request reviews | Good — native-Git fixtures verify frozen merge-base-to-head semantics across branch/worktree orderings |
| Resolve branches and worktrees to committed Git objects | Produce stable, reproducible comparisons and exclude ambiguous dirty state | Good for committed comparisons; superseded for worktree sources in v2.0 by frozen content-addressed snapshots, which keep the drift-detectable guarantee |
| Use the installed Git CLI rather than a Git library | Preserve native Git behavior for merge bases, worktrees, renames, blobs, and diff metadata | Good — byte-safe native protocols cover discovery, inventory, availability, and object reads |
| Use TypeScript, Node.js, Fastify, Vue 3, Vite, and Monaco | Keep shared contracts in one language while supporting a capable browser diff workspace | Good — one packaged runtime serves strict shared contracts and the real browser workspace |
| Store drafts as repository-local versioned JSON | Keep reviews resumable, portable within the local repository, and independent of browser storage | Good — comparison-keyed atomic drafts survive relaunch and fail explicitly on corruption or newer schemas |
| Export canonical JSON plus generated Markdown | Give agents a strict contract and humans a readable review artifact | Good — canonical bytes and reparse-derived Markdown publish together with hashes and receipts |
| Keep v1 local and single-user | Focus effort on accurate comparison, commenting, persistence, and export rather than hosting or collaboration | Good — the loopback-only capability model delivered the full v1 workflow without remote infrastructure |
| Use opaque file IDs and fixed capability routes | Prevent browser paths, refs, and object IDs from becoming repository authority | Good — all API operations are authenticated and path-safe; one unused metadata operation remains cleanup debt |
| Accept only server-returned canonical draft state | Prevent client-synthesized persistence and silent concurrent overwrite | Good — atomic CAS, typed conflicts, and accepted-result ordering cover every review mutation |
| Keep durable anchors immutable and classify mismatch instead of relocating | Preserve drift-detectable feedback for applying agents | Good — stale and orphaned records retain exact recorded evidence and never move silently |
| Verify release behavior at the generated-package boundary | Test the same CLI, server, browser assets, Git objects, and export bytes users receive | Good — final configured Playwright suite passes 56/56 |
| Correlate asynchronous comment settlement to controller, file, request, and originating revision | Prevent late results from mutating the active or replacement composer | Good — Phase 04.1 closed the audit gap across success, failure, conflict, replacement, and repeated announcements |
| Use one stable typed Monaco theme mapped byte-for-byte to the canonical semantic CSS root | Prevent editor colors from drifting from the surrounding dark workspace or changing across applications | Good — focused parity, build, semantic CSS, and first-frame browser checks pass |
| Derive Base/Head cues only from public `ILineChange` ranges and fixed side classes | Preserve Monaco as diff authority while preventing repository text, phantom empty-side signs, or unbounded decorations from entering presentation | Good — bounded pure-transform tests and real Chromium signs/bars pass |
| Keep diff, selection, anchor, and focus semantics in independent replacement collections | Ensure overlapping review cues coexist without model mutation, listener growth, or composer interference | Good — lifecycle, restoration, overlap, and production geometry checks pass |
| Keep Phase 07 presentation derived from existing session, review, export, recovery, and selector state | Prevent a visual adaptation from creating a second behavior, persistence, or filesystem authority | Good — all five roadmap criteria and 42/42 plan must-haves passed goal verification |
| Resize accepted and composing inline cards through one post-render paired-zone helper | Keep Base/Head Monaco zones equal while long accepted content remains contained without changing adapter or anchor authority | Good — production Chromium proves long-card containment and following-code separation |
| Give each dynamic recovery and selector-copy outcome one authoritative live-region owner | Prevent duplicate assistive announcements while retaining visible feedback, actions, and focus behavior | Good — focused browser checks count exactly one owner after each real state transition |
| Keep responsive visual placement separate from semantic source order | Preserve file → Base → Head reading order while matching the desktop composition and narrow reflow | Good — exact-width and keyboard browser evidence passed without duplicate controls or state paths |
| Keep the 640px side-by-side comparison floor inside one localized viewport | Prevent page-wide overflow without reflowing Monaco or changing Base/Head geometry | Good — 320px and true 400% zoom evidence retained a 640px locally scrollable canvas with document fit |
| Measure composited rendered contrast and focus geometry against actual browser states | Token-only checks cannot prove translucent diff, selection, status, or clipping behavior | Good — completed UAT accepted the full contrast, focus-inventory, and true-zoom gates |
| Keep the review sidebar at 288px and compact rows within it | Preserve diff space while retaining readable file context | Superseded — v2.1 uses a 264px default resizable side bar and nominal 22px geometry tokens; decorated row density remains documented debt |
| Pair Base/Head identity with explicit removed/added text, signed gutters, and structural bars | Make diff meaning clear without relying on red and green | Good — stronger line/intraline fills and CSP-safe Monaco positioning passed focused browser and theme checks |
| Record shipped product facts and visual rules in root contracts | Prevent future copy and styling work from inventing a second product or design language | Good — final designer checks report no contract, display-scale, numeric-claim, or contact-detail blockers |

| Freeze eager source discovery before deferred branch search | Make the picker usable without enumerating every local branch while retaining a stable initial authority | Good — the attached branch and registered worktrees render immediately; fresh branch results arrive only for non-empty input |
| Share one prompt-lifetime exact-ID registry across Base and Head selection | Keep eager, lazy, and recovered candidates unambiguous across ordered selection | Good — abort-safe lazy results and descriptor recovery preserve exact source identity |
| Use bounded native-Git protocols for literal local-head search and metadata | Avoid a persistent index and one subprocess per branch while retaining Git semantics | Good — strict protocol validation and batched abbreviation pass real-Git coverage |
| Gate discovery performance through the compiled production binary | Prevent injected seams or spike-only measurements from claiming release budgets | Good — the packed-10,000-ref gate passes fixed 400 ms readiness and 500 ms search medians |
| Accept only one bounded strict V1 stdin range request | Keep agent launch deterministic while preserving the established interactive CLI path | Good — malformed, oversized, ambiguous, or unsupported requests fail before browser launch; TTY remains interactive |
| Pin range revisions and native pathspecs once | Prevent selector drift or browser-authored scope from changing agent review provenance | Good — session, draft identity, and V2 exports use the same immutable Git-authoritative scope |
| Ground exact patches from repository preimages and target bytes | Ensure an agent-submitted patch describes implemented repository content without invoking a mutating Git apply path | Good — immutable snapshot sessions preserve exact bytes and expose source drift explicitly |
| Keep exact-patch snapshots private and server-owned | Prevent live-source fallback or shared mutable state from changing reviewed content | Good — frozen V3 provenance, readable drift handling, and snapshot-loss failure stay explicit |
| Make attached Finish server-authoritative and one-shot | Only an accepted revision may trigger canonical delivery; browser lifecycle events must not imply success | Good — authenticated Finish validates scope and anchors before exactly one stdout result |
| Give every attached launch an isolated mutable storage scope | Equivalent agent requests must not share drafts or export receipts | Good — deterministic provenance remains shared only where intended while drafts, queues, and exports cannot collide |
| Keep voluntary support feature-neutral | Payment must never become a license or access gate | Good — dismissing the prompt preserves unrestricted review and only verified status changes prompt visibility |
| Use Supabase private schema, service-role RPCs, and Edge Functions for hosted support | Replace the blocked standalone Render/PostgreSQL/Resend service with one managed authority boundary | Good — the standalone runtime and email recovery path were removed after live promotion |
| Let only a signature-verified Stripe webhook establish payment | Browser redirects and OAuth completion cannot prove settlement | Good — exact product, amount, currency, mode, and replay invariants precede idempotent fulfillment |
| Restore support through one-use installation-bound GitHub OAuth intents | Avoid retaining or returning email, OAuth tokens, or profile material in the local app | Good — paid accounts restore unlimited installations while unpaid restoration remains non-enumerating |
| Embed one canonical Supabase origin only in configured release packages | Keep ordinary local builds free of hosted capability and prevent arbitrary support origins | Good — package scans and immutable release evidence bind the approved origin and package digest |
| Publish the existing repository and reviewed history under standard MIT | Make source and compiled releases available for commercial reuse, modification, redistribution, sublicensing, and resale while retaining third-party rights and notices | Good — Phase 03 published the exact reviewed source at ff72519969da8d2c0761c9533ccb27b809cd17bb after the rights/exposure/authorization gates and verified anonymous source/LICENSE/Issues access |
| Keep marketplace skill public under MIT | Preserve ShipWithAI's thin permissive installation and delegation layer while the separately installed Cumpa CLI remains the review authority | Pending — marketplace skill delegates all review authority to a compatible released CLI |
| Require both Alessandro Magionami and Manuel Salvatore Martone to approve the exact MIT text before publication | Keep publication of the mutually licensed work under both named licensors' authority without conditioning downstream MIT grants | Good — exact MIT assent is recorded as Alessandro's direct approval and his witnessed report of Manuel's own approval; independent verification of Manuel is not claimed |
| Preserve eligible automatic npm provenance from the public repository | Replace the superseded private-source prohibition with truthful, evidence-backed release claims | Policy validated in Phase 03 and public source established; actual registry publication and attestation evidence remain Phase 05 |
| Reuse existing GitHub production configuration in memory | Avoid a duplicate local configuration source while retaining canonical validation and fingerprint-only evidence | Good — the actual release candidate used the existing production variable; no local configuration file was created |
| Approve one immutable runtime archive rather than a reproducible recipe | Bind inspection, installation, human assent and publication to the same bytes | Good — Phase 04 verified and approved its read-only candidate; the later owner-selected CI cycle changes the publication designation, not that historical artifact or approval |
| Build and approve the stable publication candidate in its attested CI workflow run | Avoid representing the earlier local build as a later CI build while preserving exact inspected/installed/published bytes | Selected by owner during Phase 5 planning; requires a fresh actual-digest approval, same-run/attempt publication, and immutable retention of the Phase 4 artifact/history |
| Freeze uncommitted sources into a content-addressed snapshot at launch with explicit Refresh | Bring working-tree review into scope without losing drift-detectable, reproducible feedback | Good — torn-file detection, index-identity race guard, and Refresh reclassification shipped and e2e-tested (terminal `r` path awaits a real-TTY check) |
| Derive uncommitted and standalone draft identity from the first snapshot digest | A sentinel "head" value cannot distinguish two different uncommitted reviews | Good — `uncommittedReviewKey`/`standaloneReviewKey` are domain-separated sha256 framed hashes alongside `comparisonKey`/`rangeReviewKey` |
| Use Git's own pathspec engine as the only traversal defence for standalone paths | Reimplementing glob/symlink/outside-repository checks in JS risks diverging from Git | Good — all six pre-launch rejection classes proven against the packaged CLI |
| Anchor rendered-Markdown comments to the block's source line range via an optional `endLine` | Keep one anchor model for Source and Rendered views | Good — single-line anchors stay byte-identical (golden-hash pinned); block ranges highlight fully in Source view |
| Derive every product-identity form from one `RENAME_MAP` | A literal-by-literal rename silently misses forms | Good — rename-audit test finds zero disallowed `cumpa` hits across 353 tracked files; 12 leftovers caught only by that full-tree scan |
| Keep the published `@shipwithai/cumpa@1.5.0` identity immutable in historical fixtures | Released artifacts and their evidence cannot be retroactively renamed | Good — pinned public-artifact tests still validate the real 1.5.0 bytes |
| Close v2.0 without a milestone audit, acknowledging four open verification artifacts | Owner prioritised the workbench redesign | Historical close — Phase 14 real-TTY and Phase 17 multi-file coverage remain deferred; legacy quick-task status reconciled in v2.1 |
| Typecheck the whole Vue tree with the dual TypeScript alias pairing | Catch decomposition errors without abandoning the fast native Node build | ✓ Good — whole-tree Vue and Node/Vue test gates pass; no baseline suppression |
| Recompose existing authorities into five workbench regions, not a second review model | Preserve every session kind and canonical draft/export/agent contracts | ✓ Good — packaged shell journeys and cross-phase audit cover all five kinds |
| Register navigation overrides on paired and single-pane Monaco editors | Keep F7/file/thread shortcuts consistent inside and outside the editor | ✓ Good — shared actions and packaged keyboard regressions preserve editor focus semantics |
| Select Monaco overlay widgets through a real go/no-go spike | Avoid building thread controls on a pointer/keyboard-inert widget technique | ✓ Good — inline thread lifecycle, paired zones, focus return and independent Undo are verified |
| Persist layout dimensions/options, but keep active panel tab and thread expansion session-scoped | Retain machine preferences without reopening workflow state unexpectedly | ✓ Good — panel starts closed; tree/layout state survives Refresh |
| Use real identity data and the existing selector/source-drift acknowledgement | Avoid fictional capture times, refs, agent identities or a new per-anchor acknowledgement schema | ✓ Good under approved UI contracts — limitations remain explicit in the milestone audit |
| Give each audited outcome one live-announcement owner | Prevent duplicate AT feedback without banning independent widget-status regions | ✓ Good — exact outcome/version and keyboard contracts have packaged proof |
| Refresh every current-session consumer and always reload a surviving selected path | Stable file IDs and an empty retry delta cannot prove cached bytes fresh | ✓ Good — four refreshable kinds plus failed-session-load retry pass current-content assertions |
| Save every nonempty composer against its origin before recapture; lock mutation while settling | Prevent off-screen draft loss and typing into a stale snapshot | ✓ Good — failed saves pause recapture, retry persists the origin, and mounted input locks |
| Keep v2.1 desktop-only with draft/export/agent schemas unchanged | Deliver the workbench without silently adding replies, viewed tracking or narrow-layout scope | ✓ Good — those features remain explicitly deferred |
| Close v2.1 locally with documented debt and tagging disabled | Separate a verified source milestone from registry publication and optional Git tagging | ✓ Approved 2026-11-07 — audit tech_debt accepted; no push, tag or npm release |
## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? Move them to Out of Scope with a reason.
2. Requirements validated? Move them to Validated with a phase reference.
3. New requirements emerged? Add them to Active.
4. Decisions to log? Add them to Key Decisions.
5. Is “What This Is” still accurate? Update it if reality drifted.

**After each milestone:**
1. Review every section.
2. Confirm Core Value is still the right priority.
3. Audit Out of Scope and its reasons.
4. Update Context with the current product state and feedback.

---
*Last updated: 2026-11-07 — v2.1 Workbench Redesign completed locally with documented debt; no npm publication*
