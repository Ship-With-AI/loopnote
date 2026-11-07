# Milestones

## v2.1 Workbench Redesign (Completed locally: 2026-11-07)

**Delivered:** A VS Code-inspired browser workbench over the existing review/draft/export/agent authorities, including current-content Refresh with origin-owned draft safety. This is a source-milestone completion, not an npm release.

**Phases completed:** 8 phases (19–25, including inserted 25.1), 53/53 plans.
**Recorded tasks:** 91 across 39 summaries with totals; 14 summaries omit totals, so 91 is not exhaustive.
**Requirements:** 45/45 under approved design interpretations; original-wording qualifications remain explicit in the accepted audit.
**Audit:** `tech_debt`, no integration blocker; 25/25 named contracts and 11/11 bounded journey categories wired, not newly executed test counts.
**Timeline:** 2026-11-04 → 2026-11-06 implementation; local closeout approved 2026-11-07.
**Inclusive Git range:** `4ebde973d796db30b513deb1a64550c4ac5181f1^..a4c58a81ada18cbcef2b0a99fe60fc946efa2112` — 339 commits (including planning/review), 283 files changed, +39,562 / −1,984.
**Source footprint:** 128 tracked `src/**/*.ts` / `src/**/*.vue` files, 31,032 physical lines including unterminated final lines.

**Key accomplishments:**

- Whole-tree Vue typecheck and CI gate.
- Resizable five-region workbench.
- Dense, keyboard-accessible file explorer.
- Comparison identity, drift and status controls.
- Inline threads and Comments/Summary/Export panel.
- Accessibility/docs sweep and safe Refresh resynchronization.

**Verification:** Prior final-source gates passed web/test typechecks, semantic CSS, build, 987 aggregate Vitest tests (92 files), 161 browser tests and 16 configured-runtime checks. Fresh close-audit proof passed both test typechecks and 42 packaged-browser checks. Active artifact scan: zero. Configured-runtime proof is a development check, not registry publication acceptance.

**Retained debt:** Default 240px panel scrolling to Export/Finish; unreachable live `stale` anchor state; decorated tree-row density and start-line-only thread headers; display-only file badges; two unused production client wrappers; incomplete SUMMARY metadata; historical advisory/testing, real-TTY, multi-file drift, support/Restore and marketplace-publication items. Replies, viewed tracking and below-1050px layout remain deferred. Full qualifications and provenance live in the audit and STATE.md.

**Archive integrity:** 176 tracked phase artifacts moved with every SHA-256 preserved; unrelated untracked `.planning/phases/25.1-refresh-session-resync/.gitkeep` left byte-for-byte in place. Backlog retained verbatim; historical milestone entries retain their as-of-close statements.

**Closeout repairs:** Canonical closure inferred a spurious active Phase 1 and retained stale approval/continuity fields; reconciled explicitly. Relocated roadmap links were rebased, with explicit archive-title anchors where duplicate historical H1 headings confused Marksman. No source/test/CI phase-path consumers required migration.

**Publication:** Package remains `@shipwithai/loopnote@2.0.0`. `git.create_tag: false` respected; no tag, push, package-version bump or npm publication.

**Archives:** [Roadmap](milestones/v2.1-ROADMAP.md#milestone-v21-workbench-redesign) · [Requirements](milestones/v2.1-REQUIREMENTS.md#requirements-archive-v21-workbench-redesign) · [Accepted audit](milestones/v2.1-MILESTONE-AUDIT.md) · [Phases](milestones/v2.1-phases/)

---

## v2.0 Artifact Review (Shipped: 2026-11-04)

**Delivered:** Review grounded in any agent-produced artifact, not only committed ranges: single-pane added/deleted files, Staged/Unstaged/Working-tree review from frozen, explicitly refreshable snapshots, standalone file/glob review, rendered Markdown preview with block-anchored comments, and an agent stdin protocol carrying all of it — shipped as Loopnote 2.0.0 after the full Cumpa → Loopnote rename.

**Phases completed:** 7 phases (13–18, incl. inserted 17.1), 70 plans, 196 tasks (sum of `**Tasks:**` across the 70 SUMMARY files; the CLI's automated count read 148)
**Timeline:** 2026-09-12 → 2026-11-02
**Git range:** `8cd83a5` → `728a75b` — 482 commits, 554 files changed, +72,704 / -3,798
**Requirements:** 35/35 (MDV-01…04 marked Complete at close on `16-VERIFICATION.md` `status: passed`, 34/34 — the traceability table had not been updated after Phase 16 executed)

**Key accomplishments:**

- Entirely added/deleted/type-changed files render as one full-width commentable Monaco pane, marked as single-pane in the tree, header, and screen-reader label without relying on colour.
- Staged, Unstaged, and Working-tree changes review against HEAD or any base from a content-addressed snapshot frozen at launch: torn-file detection during capture, explicit Refresh (button, Alt+Shift+R, terminal `r`) that reclassifies every comment, and "Resume previous uncommitted review?" relaunch recovery.
- Standalone review: `loopnote <path|glob>…` opens named files full width without choosing Base/Head, with Git's own pathspec engine as the only traversal defence and schemaVersion-4 exports carrying byte-exact sha256 provenance.
- Rendered Markdown preview: Source/Rendered toggle in single-pane and side-by-side layouts, comments anchored to rendered blocks' source line ranges, synced side-by-side scroll, a path-safe image route — all proven inert against scripts, raw HTML, and dangerous links under the unmodified production CSP.
- Agent stdin protocol and marketplace skill extended with `uncommitted` and `files` modes, typed validation errors returned before any Git or browser work, and V5/V6 exports carrying a working-tree drift flag.
- Full Cumpa → Loopnote rename (package, CLI, protocol `kind`s, env vars, state dirs, docs) derived from one `RENAME_MAP`, guarded by a rename-audit test across 353 files, with a one-time migration of existing support state; copy repositioned from "code review" to agent artifact review.

### Known Deferred Items at Close

Known deferred items at close: 4 (see STATE.md Deferred Items). Milestone closed without a `/gsd:audit-milestone` pass, by operator choice.

- Phase 14 UAT (`14-UAT.md`, status `testing`, 1 pending scenario) and `14-VERIFICATION.md` `human_needed`: terminal `r` refresh in a real TTY must produce the same effect as the browser Refresh — no harness can supply a TTY to the spawned CLI.
- `17-VERIFICATION.md` `human_needed` (14/15): `workingTreeChangedAfterFinalSnapshot.paths` lacks a test with 2+ dirty files; code reading (`collectWorkingTreeDrift`, `continue` not early return) indicates correct behaviour.
- Quick task `260915-jbv` (remove Details/Review keyboard help): SUMMARY exists, status unknown to the audit.

### Retained Technical Debt

- DEBT-01 (toolbar containers without a queryable `role`) and the v1.5 carry-forward items remain in `ROADMAP.md` Backlog; the planned VS Code workbench redesign (sketches 001–004, `sketch-findings-loopnote` skill) gives toolbar groups `role="toolbar"`/`group`.

### Archives

- Roadmap: `.planning/milestones/v2.0-ROADMAP.md`
- Requirements: `.planning/milestones/v2.0-REQUIREMENTS.md`
- Phases: `.planning/milestones/v2.0-phases/`

---

## v1.6 Workspace Restyle (Shipped: 2026-09-14)

**Delivered:** One mockup-derived visual system across the workspace and Monaco — dense changed-file tree, quieter Base/Head diff surface, mockup-equivalent shell with Details and Review-notes dialogs — with review behaviour, exports, and support mechanics unchanged.

**Phases completed:** 5 phases, 25 plans, 76 tasks
**Timeline:** 2026-09-12 → 2026-09-14
**Git range:** `6279e15` → `de1362e` — 164 files changed, +27,770 / -2,270

**Key accomplishments:**

- Collapsed four independently-authored palettes into one canonical semantic token root, with the Monaco theme deriving byte-identical values from it at build time through a Vite virtual module.
- Turned an inherited, unwired drift audit into a real gate: `npm run verify:semantic-css` now rejects stray colour literals, orphan tokens, gradients, uppercase hex, and retired vocabulary, and proves it can reject via unconditional self-checks.
- Rebuilt the changed-file tree as dense rows with signed counts and directory descendant counts, plus a filter that prunes (never rebuilds) the tree so expansion identity and selection survive clearing.
- Fixed roving tabindex, which the shipped implementation had never satisfied despite a spec asserting it since 2026-07-20.
- Restyled the diff surface entirely through Monaco's own mechanisms — pinned options, source-correct side labels, responsive code density, and zero-height hunk boundaries that cannot desynchronise comment anchoring.
- Recomposed the shell around one extracted `ModalDialog` primitive with three dialogs, unified four disagreeing breakpoint systems onto 760/1050/1650, and kept every warning class in the shell behind a single live-region owner.
- Repaired `tests/e2e/agent-ready-export.spec.ts`, which no default runner executed for the entire milestone and which failed 6/6 once run.

### Final Evidence

- Requirements: 24/24
- Phase verifications: 08 6/6, 09 25/25, 10 29/29, 11 5/5, 12 4/4 — all `passed`
- Security audits: 08 25 threats, 09 23/23, 10 17/17, 11 41/41 — all closed
- UI audits: 09 24/24, 10 24/24, 11 24/24, 12 native-scale visual equivalence signed off
- Suites at close: 186 unit, 69 git, 142 api, 99 browser, 7 runtime-artifact
- Milestone audit: status `tech_debt`; archiveable with one accepted inherited item

### Defects found and fixed that predated the restyle

- A browser spec excluded from every default runner, silently rotting for a full milestone.
- An order-sensitive suite failure root-caused to the runtime packer inheriting `NODE_ENV=development` from a Vite server started by an earlier spec, packaging a development Vue runtime.
- A pack lock whose stale-owner recovery let two packers delete each other's lock and run concurrently.
- Roving tabindex never satisfied by the implementation.
- The v1.0 debt item "retire or intentionally consume the orphan `SessionClient.getFileMetadata()`" is now resolved: the Details dialog is its first real caller.
- Four immutable evidence records were read as live fixtures through `.planning/phases/`, whose working copies are removed at milestone close. The two v1.4 references were already dangling from an earlier cleanup; removing the v1.5 phase directories broke five unit tests. All four now point at `.planning/milestones/`, their permanent home.

### Retained Technical Debt

- DEBT-01 (audit D-01): `ReviewToolbar.vue` layout containers carry `aria-label` or nothing without a queryable `role`, so `getByRole('group', …)` cannot reach them. Pre-existing and byte-unchanged across v1.6. **Carried to `ROADMAP.md` Backlog at the 2026-09-15 close** (the earlier note said `.planning/REQUIREMENTS.md`, which the close removes), and **re-scoped from four containers to three** — quick task `260915-jbv` deleted the fourth with the review-toolbar actions group.
- Two release-only specs remain documented external prerequisites, not regressions: `tests/e2e/public-support-states.spec.ts` (published package plus live hosted origin; gate at `:327-329`) and `tests/e2e/marketplace-review.spec.ts:97-99`.

### Archives

- Roadmap: `.planning/milestones/v1.6-ROADMAP.md`
- Requirements: `.planning/milestones/v1.6-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.6-MILESTONE-AUDIT.md`
- Phase history: `.planning/milestones/v1.6-phases/`

### Post-close changes to the shipped surface (2026-09-15)

The archive alone no longer describes the running app. Four items landed on `restyle` after the
`de1362e` archive commit, all verified against the live workspace:

- `80c3b92` — the Files toggle emptied the sidebar permanently: Vue resolves a Teleport target
  once, so `v-if` on `#changed-files` stranded the single file tree in a detached element. Host
  now hidden with `v-show`; filter text and selection survive hide/show as a side benefit.

- `8b2a050` — the Review rail rendered transparent over Monaco. Bisected to `5599805`
  (Phase 11-05), which deleted its only `background` declaration while retiring drawer styles.

- Quick task `260915-gxg` — removed the active-file context bar; filename, status/counts and the
  Files toggle moved onto the navigation bar. Two bars became one 41px bar. Caught mid-task: the
  plan's `flex: 1 1 auto` slid navigation under the open Review rail (pointer-intercept at
  `anchored-workspace.spec.ts:1037`), and the merged bar rendered 61px because inherited label
  wrapping — both fixed and pinned by assertions.

- Quick task `260915-jbv` — removed the Details dialog, the Review comments rail, and Keyboard
  help outright at the owner's instruction, no relocation. Net −2,991 lines, six files deleted.
  Accepted losses: comment resolve/reopen/edit/delete, stale and orphaned anchor records, the
  cross-tab conflict notice, comparison identity, per-file metadata, in-app keyboard help.
  Reopened the v1.0 file-metadata orphan debt that v1.6 had recorded as resolved, because the
  Details dialog was `SessionClient.getFileMetadata()`'s only real caller.

Suite at the 2026-09-15 close: 92 passed, 2 external-prerequisite failures
(`CUMPA_MARKETPLACE_URL_MARKER`, `CUMPA_RUNTIME_CUSTODY_DIR`), 2 not run. `typecheck:web` and
`verify:semantic-css` clean. Note that `typecheck:web` covers seven `.ts` files and zero `.vue`
files, and `vue-tsc@3.3.7` cannot run against `typescript@7.0.2` — Vue templates are gated by
deterministic identifier greps and a runtime console collector, not by a typechecker.

### Branch reconciliation (2026-09-15)

v1.5 and v1.6 were closed on separate branches. `main` archived v1.5 on 2026-09-15 with
ACC-04 as its known gap and shipped 1.5.2; `restyle` closed v1.6 while still believing v1.5
was unarchived. When `restyle` merged into `main` (`07d8a50` — 77 commits in, 197 out, 14
conflicts), the planning tree was taken from `main` wholesale and this v1.6 close was
re-applied on top of that history. Both closes therefore stand: v1.5's archive and the 1.5.2
release are authoritative for distribution, v1.6's for the workspace surface. Any sentence
above implying v1.5 was never archived reflects the pre-merge branch state.

---

## v1.5 MIT Distribution (Shipped: 2026-09-15)

**Delivered:** Cumpa published on the public npm registry under standard MIT terms, installable globally, through `npx`, or via a public marketplace skill, with SLSA provenance bound to its source commit on every release.

**Phases completed:** 5 phases, 23 plans, 69 tasks
**Timeline:** 2026-09-07 → 2026-09-15
**Git range:** `a7f5639` → `67990e7` — 201 files changed, +34,120 / -1,401
**Published:** `@shipwithai/cumpa` 1.5.0 stable, then 1.5.1 and 1.5.2 patches

**Key accomplishments:**

- Relicensed to standard MIT with refreshed dual-licensor exact-text assent, then published the existing repository and its reviewed history safely, replacing the earlier proprietary source-available direction.
- Verified one complete compiled-runtime-only tarball byte-for-byte before any registry mutation.
- Published stable `1.5.0` through OIDC trusted publishing with no long-lived credentials, after a usable non-`latest` bootstrap whose temporary authorization was revoked.
- Published the thin MIT marketplace skill as a separate artifact that checks for, rather than bundles, the CLI.
- Proved the public artifact end to end on three independent installation paths — global install, empty-cache `npx --yes`, and an isolated agent profile using the marketplace skill — each completing a real browser review through Finish and export.

**Final evidence**

- Requirements: 18/19 (ACC-04 blocked; zero orphans, zero summary/verification mismatches)
- Phase verifications: 4/5 `passed`, Phase 07 deliberately `gaps_found`
- Cross-phase integration seams: 6/8 wired; 1 warning (Phase 4 → Phase 5 archive identity), 1 blocker (verified-support acceptance)
- End-to-end flows: 3/4 complete (global, npx, marketplace); verified-support partial
- Plans and summaries: 23/23
- Published-artifact verification: registry integrity matched locally hashed bytes on every release; `npm audit signatures --include-attestations` reported 0 invalid / 0 missing

**Known gaps**

- ACC-04: verified-support rows recorded `live-entitlement-unavailable` with `substituted: false` on all three paths. The paid entitlement exists only in Stripe test-mode data and D-07 forbade a new purchase; D-08 mandated recording the bounded truth rather than fabricating, substituting, or reusing evidence.

**Retained technical debt**

- Restore completes even when its RPC result is false (`supabase/functions/support-flow/index.ts`); this must become a non-completion response before ACC-04 can be genuinely retried.
- `SKILL.md` still installs `@1.5.0` and claims only 1.5.0 has independent release verification; its checker accepts `>=1.5.0 <2.0.0`, so 1.5.2 works, but the text needs a separate marketplace publication.
- `.vue` files remain outside `tsc`; `vue-tsc` would close the gap.
- Acceptance evidence is specific to `1.5.0`; the 1.5.1 and 1.5.2 patches carry publication, provenance, and fix-presence evidence but not the full acceptance matrix.

**Defects found and fixed during close-adjacent work**

- A composer draft-loss race (`PublicMonacoDiffAdapter.setFile` discarded an anchor activated during the first diff load) shipped in 1.5.1 and was found by the widened CI gate, fixed, and published in 1.5.2.
- A roving-tabindex a11y defect left the selected file row untabbable; fixed and published in 1.5.2.
- Two dangling `.planning/phases/02-…` references left by the v1.4 close were repointed at the v1.4 archive during this close; in `prelaunch-test` mode the missing file had been causing a hard `exit 1`.
- `.planning/milestones/v1.5-phases/` had been created empty by an earlier run; it was back-filled and proved byte-identical to the working phase directories.

**Archives**

- Roadmap: `.planning/milestones/v1.5-ROADMAP.md`
- Requirements: `.planning/milestones/v1.5-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.5-MILESTONE-AUDIT.md`
- Phase history: `.planning/milestones/v1.5-phases/`

---

## v1.4 Voluntary Support (Shipped: 2026-09-04)

**Delivered:** Optional one-time support and paid-account restoration through a canonical Supabase-hosted flow without gating or changing any review feature.

**Phases completed:** 2 phases, 22 plans, 30 tasks
**Timeline:** 2026-08-12 → 2026-09-04
**Git range:** `1541473` → `59b53e9` — 99 files changed, +14,648 / -87

**Key accomplishments:**

- Added an optional Stripe-hosted USD $49.99 support action while keeping unpaid and dismissed sessions fully usable.
- Built a private Supabase authority with service-role RPCs, GitHub OAuth, server-owned Checkout creation, and signature-verified idempotent webhook fulfillment.
- Added monotonic machine-wide verified-state persistence and privacy-safe restoration to unlimited installations through one-use installation-bound OAuth intents.
- Kept ordinary local builds support-free; only the approved release package embeds the exact canonical Supabase origin.
- Proved prelaunch acceptance, exact cleanup, same-project live promotion, legacy retirement, and final release lineage through immutable evidence.
- Removed the superseded Render, standalone PostgreSQL, Resend, Node fulfillment, email-recovery, and legacy route surfaces.

### Final Evidence

- Requirements: 12/12
- Phase 02 verification: 81/81 must-haves
- Cross-phase integrations: 8/8
- End-to-end flows: 8/8
- Plans and summaries: 22/22
- Milestone audit: no critical gaps; status `tech_debt`

### Retained Technical Debt

- **TD-1 (closed 2026-09-13 — 260913-dzc):** Removed the stale deleted `tests/e2e/support-recovery.spec.ts` workflow filter and verifier contract.
- Remove unused local `GET /api/support/status` and `SessionClient.getSupportStatus()` surfaces.

### Archives

- Roadmap: `.planning/milestones/v1.4-ROADMAP.md`
- Requirements: `.planning/milestones/v1.4-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.4-MILESTONE-AUDIT.md`
- Phase history: `.planning/milestones/v1.4-phases/`

---

## v1.3 Agent Review Handoff (Shipped: 2026-08-06)

**Delivered:** A coding agent can submit a grounded range or exact-patch review, await explicit browser completion, and receive one canonical JSON result.

**Phases completed:** 4 phases, 14 plans, 42 tasks

**Key accomplishments:**

- Added bounded, strict stdin request framing while preserving the TTY picker.
- Pinned Git ranges and native ordered pathspecs through sessions, drafts, and canonical V2 exports.
- Grounded exact already-applied patches against repository bytes and served immutable snapshots with V3 provenance.
- Added an authenticated, server-authoritative Finish lifecycle that validates anchors before one stdout delivery.
- Isolated mutable draft and export storage for every attached agent invocation.

### Final Evidence

- Requirements: 17/17
- Cross-phase integrations: 10/10
- End-to-end flows: 10/10
- Plans and summaries: 14/14
- Milestone audit: no critical gaps, unsatisfied requirements, integration blockers, or broken flows

### Retained Technical Debt

- Range draft-equivalence diagnostics and scoped Git-failure taxonomy.
- Non-blocking narrow-screen and lifecycle UI contract warnings.
- Patch-status polling rejection handling and missing Phase 13 security report.
- Single-command exact-patch Finish and server-level stale-anchor integration evidence.

### Archives

- Roadmap: `.planning/milestones/v1.3-ROADMAP.md`
- Requirements: `.planning/milestones/v1.3-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.3-MILESTONE-AUDIT.md`

---

## v1.2 Fast Source Discovery (Shipped: 2026-07-30)

**Phases completed:** 3 phases, 4 plans, 9 tasks

**Key accomplishments:**

- A frozen eager snapshot now exposes the attached current branch and truthful registered worktrees without complete local-branch enumeration; non-empty searches perform the uncached native-Git branch lookup.
- The terminal picker now opens from the eager current branch and registered worktrees, then installs abort-safe lazy branch results by exact ID across Base/Head selection and drift recovery.
- Non-empty picker terms now perform a literal, case-insensitive local-branch Git query, validate complete Git protocols, and publish only fresh exact-ID branch rows alongside truthful worktrees.
- A standalone compiled-production picker gate proves packed-10,000-ref readiness and branch-search budgets with exact rendered-row timing.

### Final Evidence

- Requirements: 5/5
- Cross-phase integrations: 12/12
- End-to-end flows: 5/5
- Plans and summaries: 4/4
- Production gate: 10,000 packed refs, 0 loose refs; readiness median 221.532417 ms ≤ 400 ms; search median 38.266167 ms ≤ 500 ms
- Final build and regression suites: 322 tests passed across unit, Git, API, and focused Phase 11 verification
- Phase 11 code review: clean

### Retained Technical Debt

- Keep uncommon worktree recovery states at focused real-Git/CLI integration seams unless production-path risk changes.
- Re-run the absolute picker budgets when the supported Node 24 runner or host characteristics change.

### Archives

- Roadmap: `.planning/milestones/v1.2-ROADMAP.md`
- Requirements: `.planning/milestones/v1.2-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.2-MILESTONE-AUDIT.md`
- Phase history: `.planning/milestones/v1.2-phases/`

---

## v1.1 GitHub Dark Diff (Shipped: 2026-07-29)

**Phases completed:** 4 phases, 16 plans, 29 tasks

**Key accomplishments:**

- A single GitHub-dark semantic stylesheet now renders the local review workflow with role-based surfaces, typography, controls, status states, constrained overlay elevation, and deterministic Chromium evidence.
- A complete, typed `cumpa-dark` Monaco theme now maps Phase 05 semantic roles into canvas, syntax, diff, selection, widget, and scrollbar colors with deterministic source/generated CSS parity enforcement.
- Pure Monaco line-change normalization now produces continuous Base/Head change bars and sparse non-interactive gutter-sign decorations without recomputing diffs or altering model text.
- The production Monaco adapter now selects the shared dark theme before construction and composes sparse signed diffs, selection contrast, anchors, focus, flat empty regions, and hidden hunks without changing review mechanics or editor geometry.
- A compact, framed Base/path/Head context header now keeps every shipped diff navigation and review control available while presenting safe renamed-file identity with local icon controls.
- Compact composer and accepted-comment cards now expose fixed anchor identity, separate lifecycle and verification badges, field-adjacent busy and error feedback, and real-Monaco Chromium regression evidence without changing Monaco ownership.
- The review rail now preserves the established review workflow while exposing durable command-derived selection, framed major hierarchy, grouped divider rows, and truthful per-comment lifecycle progress.
- Shared notices, pinned-source drift, file metadata, and Summary now pair visible labels and fixed local glyphs with structural edges while retaining their existing review, retry, focus, and persistence semantics.
- Read-only draft recovery now uses icon-label status boundaries, structured outcome notices, and a locally busy destructive confirmation while preserving fixed recovery authority and verified backup semantics.
- Export, receipt, drift, readiness, and optional ignore-consent surfaces now share the established icon-label-edge language while retaining explicit export and fixed filesystem capabilities.
- Accepted inline comments now resize the existing paired Monaco zone from rendered content height, with Chromium evidence that a long persisted card stays contained and does not overlap subsequent code.
- Revision conflicts now display a truthful error badge, while export-readiness and Gitignore notices consistently distinguish an in-progress ignore check from a concrete unavailable result.
- Recovered-draft and pinned-selector copy feedback now retain one authoritative polite announcement owner each, with real-browser assertions over their completed dynamic states.
- A fluid semantic review shell now contains one locally scrollable 640px side-by-side Monaco canvas, with browser evidence that narrow layouts retain Base-to-Head reachability and Monaco coordinate invariants.
- The packaged review workspace now measures composited live-control contrast, preserves keyboard focus geometry, and retains structural review meaning in Chromium forced colors without changing review behavior.
- One packaged browser matrix now proves responsive layout, true 400% browser zoom, non-color state cues, and keyboard continuity while the original packaged draft/export authorities retain behavioral ownership.
- A final clarity pass compacted the file sidebar, made Base/deletion and Head/addition semantics explicit, strengthened diff fills, preserved Monaco positioning under CSP, and added the shipped `DESIGN.md` and `PRODUCT.md` contracts.

### Final Evidence

- Requirements: 18/18
- Cross-phase integrations: 12/12
- End-to-end flows: 7/7
- Plans and summaries: 16/16
- Phase 08 UAT: 3/3 accepted
- Final designer checks: 0 blockers; visual-system analysis 0 warnings
- Final focused checks: build passed, Vitest 15/15, Playwright 1/1

### Retained Technical Debt

- Retire or intentionally consume the authenticated orphan file-metadata route and client method.
- Add explicit unsupported/unavailable rows to responsive fixture coverage if that path changes.
- Align 7px icon-button padding with the documented spacing scale when the control geometry is next revised.
- Remove unused `EmptyState.vue` when dead-code cleanup is prioritized.

### Archives

- Roadmap: `.planning/milestones/v1.1-ROADMAP.md`
- Requirements: `.planning/milestones/v1.1-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md`

---

## v1.0 MVP (Shipped: 2026-07-24)

**Scope:** 5 phases, 40 plans, 75 executed tasks, 51 requirements

**Timeline:** 2026-07-20 → 2026-07-24

**Git range:** `cdf6f82` → `bc1e26f` — 326 commits, 243 files changed, +48,023 / -148

**Current codebase:** 30,428 tracked TypeScript, Vue, and MJS lines

### Key Accomplishments

- Built byte-safe local branch/worktree discovery, explicit ordered selection, immutable merge-base-to-head comparison, and a token-protected loopback browser session.
- Delivered a real Monaco side-by-side review workspace with exact durable anchors, per-file state restoration, keyboard/responsive interaction, and explicit stale or orphaned records.
- Added repository-local canonical drafts with complete comment and summary lifecycle, serialized cumpa-and-swap mutation, conflict recovery, selector drift, and loss-safe corrupt/newer-draft handling.
- Published versioned canonical JSON and derived Markdown as an atomic export pair with content hashes, receipts, safe reveal, ignore management, source-control safety checks, and target-aware re-export.
- Closed the audited cross-file async settlement gap across acceptance, persistence failure, concurrent revision conflict, controller replacement, and repeated accessible announcements.

### Final Evidence

- Requirements: 51/51
- Cross-phase integrations: 22/22
- End-to-end flows: 8/8
- Plans and summaries: 40/40
- Final configured Playwright suite: 56/56
- Phase 04.1: verification 11/11, code review clean, security 11/11 closed, UI audit 24/24, TDD 0 violations

### Retained Technical Debt

- Retire or intentionally consume the authenticated orphan `GET /api/files/:fileId` route and `SessionClient.getFileMetadata()` method.
- Retain Phase 3 non-blocking UI polish findings until separately prioritized.
- Retain accepted Phase 4 same-UID managed-parent replacement and operating-system power-loss durability boundaries.

### Archives

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Milestone audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- Phase history: `.planning/milestones/v1.0-phases/`

---
