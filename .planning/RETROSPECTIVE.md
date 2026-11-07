# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-07-24
**Phases:** 5 | **Plans:** 40 | **Executed tasks:** 75

### What Was Built

- A Node.js CLI that discovers local branches and registered worktrees, freezes ordered native-Git merge-base comparisons, and launches a token-protected loopback browser session.
- A real Monaco side-by-side review workspace with exact durable line anchors, per-file state, complete comment and summary lifecycle, atomic repository-local drafts, conflict/recovery handling, and selector-drift reporting.
- Canonical JSON and derived Markdown export as a validated atomic pair with receipts, hashes, safe reveal, ignore management, relaunch/resume, and generated-package acceptance.
- A closure phase that eliminated cross-file async settlement corruption and made success, persistence failure, concurrent conflict, controller replacement, and repeated announcements origin-safe.

### What Worked

- Native Git remained the sole semantic authority. Fixed argument arrays, NUL-framed protocols, opaque IDs, and exact path bytes kept branch/worktree, rename, blob, and unusual-path behavior aligned with Git.
- RED-to-GREEN plan commits made state-machine and persistence contracts explicit before implementation. The final Phase 04.1 TDD review found zero sequence violations.
- Generated-package Playwright journeys exercised real Git repositories, the shipped CLI/server/browser assets, Monaco, persisted drafts, and export bytes instead of relying only on development seams.
- Independent code, security, UI, and goal verification found load-bearing issues that focused implementation tests initially missed: replaced-controller callbacks, mutable conflict revision metadata, hidden live-region styling, revision-conflict announcements, and repeated identical announcements.
- Canonical server-returned state and serialized cumpa-and-swap mutation prevented browser state from becoming persistence authority.

### What Was Inefficient

- The initial Phase 2 verification accepted an async callback path without a production A-to-B delayed-settlement journey. The milestone audit found WR-002 late and required closure Phase 04.1.
- Phase 3 requirements were behaviorally verified but seven checkboxes and traceability rows remained stale until milestone completion.
- The `test:browser` script is only valid with an explicit file filter because `--config=tests` otherwise collects Vitest files. The canonical full browser command is `npm run test:package`; this mismatch caused one invalid regression attempt.
- Full-suite load exposed a stale `.sr-only` test selector and a five-second callback assertion bound only after focused tests were green. The final configured suite passed 56/56 after correcting both.
- Automatic milestone accomplishment extraction emitted one bullet per summary; manual curation was required to produce a useful release-level record.

### Patterns Established

- Freeze refs once; pass full object identities through every downstream comparison, draft, anchor, drift, and export boundary.
- Browser requests use opaque capabilities; repository paths, refs, object IDs, and filesystem destinations remain server-owned.
- Persist first, then accept only the typed server-returned canonical draft. Conflicts retain local buffers and expose authoritative latest state.
- Immutable anchors are verified exactly; mismatch becomes stale or orphaned and is never silently relocated.
- Async UI commands capture controller, file, request, and originating revision identity before awaiting external work.
- Accessible live feedback must be visually hidden with an existing utility and must force a fresh DOM update for repeated identical messages.
- Release evidence belongs at the generated-package boundary and must independently reread durable output bytes.

### Key Lessons

1. Every asynchronous command whose destination can change while awaiting must carry immutable origin identity and have a production-path interleaving test.
2. A response arriving at the network boundary does not prove the application callback settled; wait for callback-produced state while the intervening UI state remains observable.
3. Milestone audits must cross-reference requirements, verification reports, summaries, integrations, and API consumers; any single ledger can be stale or incomplete.
4. Advisory code and UI review findings should be resolved before archival when they identify data-integrity or accessibility defects, even if the phase verifier already passed.
5. Keep one documented full-suite command per test family; wrapper commands that depend on positional filters are not safe regression defaults.

### Cost Observations

- Model mix: Not measured.
- Sessions: Not measured in planning artifacts.
- Notable: 326 milestone commits across 40 plans preserved atomic history, but generated documentation and repeated package-level browser gates added substantial workflow overhead.

---

## Milestone: v1.1 — GitHub Dark Diff

**Shipped:** 2026-07-29
**Phases:** 4 | **Plans:** 16 | **Executed tasks:** 29

### What Was Built

- One semantic GitHub-dark-inspired workspace spanning application surfaces, Monaco syntax and diff layers, controls, comments, notices, recovery, summary, and export.
- Persistent Base/deletion and Head/addition cues, stronger line and intraline fills, stable comment anchors, and CSP-compatible Monaco positioning.
- Responsive and accessible review continuity across desktop, narrow layouts, true 400% zoom, keyboard navigation, grayscale, and forced colors.
- A final compact sidebar and diff-clarity pass, plus root product and visual-system contracts.

### What Worked

- A single semantic CSS root and byte-parity Monaco theme tests prevented palette drift.
- Existing state, persistence, export, and Monaco authorities stayed unchanged; presentation derived from them instead of creating parallel models.
- Browser evidence used generated-package sessions and real Monaco geometry for layout, focus, contrast, and workflow continuity.
- Phase verification, UAT, security, UI review, and the milestone integration audit together closed stale evidence states before archival.

### What Was Inefficient

- Phase 06 and Phase 08 verification frontmatter remained stale after UAT accepted their human gates, requiring milestone-level interpretation.
- Nine Phase 07 plans fragmented one coherent surface adaptation and made automatic accomplishment extraction too verbose.
- The final designer pass found missing product/design contracts and ambiguous fixture/prototype strings only after phase completion.
- A standalone 320px file-tree width and production CSP interaction were discovered during final visual inspection rather than the original responsive plan.

### Patterns Established

- Keep one semantic CSS vocabulary and map Monaco colors directly to it.
- Preserve source order and behavioral ownership; use CSS placement and presentation-only derivation for responsive adaptation.
- Pair hue with explicit text, signs, line styles, borders, and focus geometry.
- Measure final browser composites and geometry rather than inferring accessibility from source tokens.
- Keep product facts and visual rules in explicit root contracts.

### Key Lessons

1. Human UAT completion must update or clearly supersede verifier frontmatter so close-time audits do not report resolved gates as open.
2. Visual review must exercise the packaged CSP path; development rendering can hide Monaco positioning failures.
3. Dense code-review surfaces benefit more from clearer semantic hierarchy and compact alignment than from wider panels or additional badges.
4. Product and design contracts should exist before automated taste checks become a release gate.

### Cost Observations

- Model mix: Not measured.
- Sessions: Not measured in planning artifacts.
- Notable: 136 commits after the v1.0 close changed 277 files (+23,900 / -2,600); focused generated-browser evidence caught the final layout and CSP defects.

---

## Milestone: v1.3 — Agent Review Handoff

**Shipped:** 2026-08-06
**Phases:** 4 | **Plans:** 14 | **Executed tasks:** 42

### What Was Built

- Strict agent stdin framing for either pinned native-Git ranges or repository-grounded exact patches, while preserving interactive CLI selection.
- Immutable range and patch provenance through browser review, repository-local drafts, and canonical V2/V3 exports.
- An authenticated, explicit Finish lifecycle that validates final state and anchors before delivering one canonical stdout document.
- Isolated mutable draft/export storage for concurrent or equivalent agent submissions.

### What Worked

- Native Git and repository objects remained the source of truth for range and patch grounding.
- The existing browser review workspace and its persistence/export authorities were reused instead of creating a parallel agent-review product.
- Focused API, Git, canonical-export, and packaged Chromium checks together covered request framing, explicit completion, and invocation isolation.

### What Was Inefficient

- The milestone accumulated advisory code, UI, and audit-evidence debt that required an explicit acceptance decision at close.
- Automatic accomplishment extraction was plan-granular; the release record required manual curation.

### Patterns Established

- Agent input is strict and bounded before browser launch; canonical stdout is emitted only after one server-authoritative completion transaction.
- Immutable submitted provenance and per-invocation mutable storage are separate concerns.

### Key Lessons

1. Exact-patch workflows need a single package-boundary Finish journey and stale-anchor server journey in addition to segmented contract proof.
2. Non-blocking review warnings still need an explicit milestone disposition rather than being left implicit.

### Cost Observations

- Model mix: Not measured.
- Sessions: Not measured in planning artifacts.
- Notable: 110 files changed (+14,765 / -553) from the first to final feature commit; 61 TypeScript, Vue, and CSS files changed (+7,437 / -476).

---

## Milestone: v1.4 — Voluntary Support

**Shipped:** 2026-09-04
**Phases:** 2 | **Plans:** 22 | **Executed tasks:** 30

### What Was Built

- Optional one-time USD $49.99 Stripe-hosted support that never gates review features.
- A Supabase private-schema and Edge Function authority for GitHub OAuth, Checkout creation, signature-verified webhook fulfillment, and installation restoration.
- Monotonic machine-wide prompt suppression, unlimited paid-account installation restoration, and a canonical configured release package that leaves ordinary local builds support-free.
- Immutable production evidence spanning prelaunch acceptance, exact cleanup, same-project live promotion, legacy retirement, release package approval, and final six-record lineage.

### What Worked

- Provider credentials and hosted dependencies remained outside the local application and published runtime.
- The final implementation reused the existing loopback capability boundary and browser dialog instead of creating a second review or licensing system.
- Live promotion evidence gated deletion of the superseded Render, PostgreSQL, Resend, and standalone Node service.

### What Was Inefficient

- Phase 01 built a standalone hosted backend that provider constraints later forced Phase 02 to replace and remove.
- Phase 01 lacked a standalone verification report; the milestone audit had to prove that Phase 02 superseded it and reverified all 12 requirements.
- One deleted Playwright suite name and one unused local status API survived the clean cutover as accepted debt.

### Patterns Established

- Optional hosted functionality is represented by capability absence, not disabled implementations or fallback origins.
- Browser and OAuth completion never establish payment; only signature-verified webhook settlement can promote verified state.
- Destructive provider cleanup follows immutable zero-state evidence and same-project promotion, not assumptions about deployment state.

### Key Lessons

1. Provider feasibility must be proven before building the first hosted implementation; replacement after integration is avoidable rework.
2. Superseded phases still need an explicit verification disposition so milestone audits do not infer release gaps from missing artifacts.
3. Release-lineage evidence should bind immutable run IDs, canonical origin, and package digest before obsolete authority paths are deleted.

### Cost Observations

- Model mix: Not measured.
- Sessions: Not measured in planning artifacts.
- Notable: 99 files changed (+14,648 / -87) across 23 calendar days from the first implementation commit to final evidence.

---

## Milestone: v2.0 — Artifact Review

**Shipped:** 2026-11-04
**Phases:** 7 (13–18, incl. inserted 17.1) | **Plans:** 70 | **Executed tasks:** 196

### What Was Built

- Single full-width commentable Monaco pane for entirely added/deleted/type-changed files.
- Staged/Unstaged/Working-tree review from a content-addressed snapshot frozen at launch, with torn-file detection, explicit Refresh that reclassifies every comment, and relaunch draft recovery.
- Standalone `loopnote <path|glob>…` review outside any diff, with schemaVersion-4 sha256 provenance.
- Rendered Markdown preview with block-anchored comments, synced scroll, and a path-safe image route, inert under the unmodified production CSP.
- Agent stdin `uncommitted`/`files` modes with typed pre-launch validation errors and V5/V6 exports carrying a working-tree drift flag.
- The full Cumpa → Loopnote rename from one `RENAME_MAP`, shipped as `@shipwithai/loopnote@2.0.0`, and copy repositioned to agent artifact review.

### What Worked

- Packaged-binary Playwright specs found real product bugs: Phase 16's acceptance tests exposed three, and 17.1's live runs found `Cumpa` prose still hardcoded in four production files no plan owned.
- Deriving every identity form from `RENAME_MAP` plus a full-tree rename-audit test made the 23-plan rename verifiable; the scan caught 12 leftovers that individual plans had marked "deferred to sibling".
- Additive schema evolution held: V1–V4 exports stayed byte-identical while V5/V6 were proven supersets, and the optional `endLine` kept single-line anchors golden-hash identical.
- Reusing Phase 14's frozen-snapshot engine for Phase 15 standalone review avoided a second capture path.

### What Was Inefficient

- The rename was not planned: inserting 17.1 cost 23 plans, a third of the milestone, and plans repeatedly deferred work "to sibling plan X" that no sibling owned.
- Bookkeeping drifted from disk: ROADMAP still listed Phase 16 as 0/6 Planned and Phase 14 as 15/16 after both executed, and REQUIREMENTS left MDV-01…04 Pending despite a passed verification.
- Two phases ended `human_needed` with no harness to close them (real TTY for terminal Refresh; multi-file drift paths), and the milestone closed without an audit.
- 101 `fix` commits across the range, plus three post-phase quick tasks repairing e2e regressions (`261031-au0`, `261031-q09`, `261103-gl9`).

### Patterns Established

- Uncommitted and standalone identity is a domain-separated hash of the first snapshot digest, never a sentinel "head".
- Git's pathspec engine is the only traversal and outside-repository defence for user-supplied paths.
- Published artifact identities stay immutable in historical fixtures even through a product rename.
- Rename completeness is enforced by a live-tree scan with an explicit exception list, not by per-plan claims.

### Key Lessons

1. A product rename is a milestone-sized cross-cutting change; schedule it as its own phase up front with a full-tree audit as plan 01, not as the last gate.
2. "Deferred to sibling plan" must name an owning plan that actually lists the item, or the deferral is a silent drop.
3. Update ROADMAP progress and REQUIREMENTS traceability in the same commit that records phase verification; otherwise milestone close inherits contradictory status.
4. Behaviour that needs a real TTY or other unharnessed environment needs either a harness or an explicit human-UAT step planned in the phase, not discovered at verification.

### Cost Observations

- Model mix: Not measured.
- Sessions: Not measured in planning artifacts.
- Notable: 482 commits, 554 files changed (+72,704 / -3,798) from 2026-09-12 to 2026-11-02; verification scores 17/17, 11/12, 5/5, 34/34, 14/15, 8/8, 3/3.

---

## Milestone: v2.1 — Workbench Redesign

**Completed locally:** 2026-11-07; implementation 2026-11-04 through 2026-11-06.
**Scope:** 8 phases (19–25.1), 53 plans, 45/45 requirements under approved design interpretations.
**Disposition:** Accepted `tech_debt`, no integration blocker; source milestone only, package remains 2.0.0.

### What We Built

A resizable five-region workbench, keyboard-accessible file explorer, comparison/drift controls, inline comment lifecycle, and Comments/Summary/Export panel over the existing review authorities. Whole-tree Vue typing, accessibility/documentation gates, and current-content Refresh completed the cutover without changing draft/export/agent schemas.

### What Worked

- Closing the Vue typecheck gap before decomposition exposed real narrowing and shared-type errors rather than carrying a baseline into the redesign.
- A measured Monaco overlay-widget spike established usable pointer/keyboard behaviour before building inline thread controls on it.
- Existing session, persistence and export authorities supported all five session kinds; a source/consumer audit found all 25 named contracts wired.
- Packaged Refresh scenarios asserted inventory, selected bytes, navigation targets, summary writes and comment/layout preservation, not just a successful response.
- Independent origin-owned composer settlement, explicit input locking and failed-load retry evidence closed actual data-loss/staleness paths.
- Evidence-backed metadata reconciliation resolved Phase 22's stale human-needed status and the legacy quick-task unknown status without inventing fresh measurements.

### What Was Inefficient

- SUMMARY metadata lagged delivered behaviour: only 43/45 IDs had canonical completion metadata, and 14 of 53 summaries omitted task totals. Closeout needed manual grounding for PANEL-04/PANEL-05 and a qualified task count.
- Initial Refresh work still trusted stable file IDs and net comparison deltas. A surviving path could retain old bytes, and retry after a failed session load could report an empty delta; final acceptance needed a dedicated gap-closure plan.
- An unconfigured 14-pass/2-fail runtime run was not valid configured-runtime evidence. The setup was corrected and all 16 configured checks passed; the rejected run is not current product debt.
- ROADMAP counts, quick-task status and verifier frontmatter diverged from existing proof. Repairing records at closeout cost avoidable cross-source reconstruction.
- Canonical milestone closure inferred an active Phase 1 from the version-bearing phase sentence and retained stale approval/continuity text. Explicit final STATE reconciliation was required.
- Moving the roadmap exposed relative historical links and duplicate-H1 link ambiguity. Rebased paths and explicit title anchors repaired the archive presentation; no live source/test/script/CI phase-path consumers required migration.

### Patterns Established

- Stable identity is not freshness: reload the surviving selected path after recapture, including a net-zero-delta retry.
- Every nonempty composer belongs to its immutable origin; settle it before capture and lock mutation until settlement/reconciliation completes.
- Persist layout preferences but keep workflow tab/expansion state session-scoped.
- One announcement owner per audited outcome; unrelated widget-status regions remain independent.
- Keep approved design substitutions explicit: real identity data, selector/source-drift acknowledgement rather than per-anchor acknowledgement, and nominal geometry versus measured decorated rows.
- Archive tracked phase artifacts with a file manifest and byte hashes; preserve unrelated untracked content. All 176 phase artifacts retained their SHA-256, and Backlog stayed byte-for-byte identical.

### Key Lessons

1. Inventory, bytes, selection and mutable buffers are separate Refresh authorities; prove every consumer after recapture, not only the session digest.
2. Test retry against the persisted baseline after partial success. An empty latest delta does not mean the client has reconciled.
3. Origin-owned writes and locked editors prevent draft loss more reliably than last-moment warnings.
4. Distinguish a development-check package, configured runtime custody, and an approved registry publication; none silently authorizes the next.
5. Record accepted visual proof in verifier metadata and traceability in the same phase-close commit.
6. After phase archival, MILESTONES/STATE and the archived plans are authoritative; active-directory counters can legitimately report 0/0.

### Cost Observations

- Model mix and session counts: Not measured.
- Recorded tasks: 91 across 39 summaries; 14 summaries omit totals, so 91 is not exhaustive.
- Inclusive implementation range `4ebde97^..a4c58a8`: 339 commits including planning/reviews, 283 changed files, +39,562 / −1,984; three calendar dates.
- Prior final-source proof: 987 aggregate Vitest tests across 92 files, 161 browser checks, 16 configured-runtime checks; fresh close-audit proof: both test typechecks and 42 packaged-browser checks.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 40 | Established TDD, threat registers, package-first browser acceptance, cross-phase integration audit, and closure-phase remediation |
| v1.1 | 4 | 16 | Established one semantic UI/Monaco contract, browser-composite accessibility evidence, and final product/design contracts |
| v1.2 | 3 | 4 | Established eager source discovery, bounded search, and a compiled 10,000-ref performance gate |
| v1.3 | 4 | 14 | Established strict agent handoff, immutable range/patch grounding, explicit Finish, and invocation isolation |
| v1.4 | 2 | 22 | Established optional capability absence, Supabase webhook authority, immutable live-promotion evidence, and provider-runtime retirement |
| v2.0 | 7 | 70 | Established frozen content-addressed snapshots for uncommitted/standalone review, additive export-schema supersets, and `RENAME_MAP`-derived identity with a live-tree rename audit |
| v2.1 | 8 | 53 | Established whole-tree Vue typing, measured Monaco thread controls, origin-owned Refresh settlement/locking, and byte-verified milestone archival |

### Cumulative Quality

| Milestone | Unit | Git | API | Playwright | Requirements | Integrations | Flows |
|-----------|------|-----|-----|------------|--------------|--------------|-------|
| v1.0 | 108 | 35 | 98 | 56 | 51/51 | 22/22 | 8/8 |
| v1.1 | Not recorded | Not recorded | Not recorded | Focused release gates passed | 18/18 | 12/12 | 7/7 |
| v1.2 | Focused release gates passed | 5/5 | 12/12 | 5/5 |
| v1.3 | Focused Git/API/CLI/package gates passed | 17/17 | 10/10 | 10/10 |
| v1.4 | Focused Vitest, Deno, and database gates passed | Not applicable | 10/10 local support API | Local and hosted support flows passed | 12/12 | 8/8 | 8/8 |
| v2.0 | `npm test` incl. rename audit | Fixture-verified worktree inventory | Snapshot/refresh/recovery routes | Packaged-binary e2e per phase (2 pre-existing selector-drift failures fixed by `261103-gl9`) | 35/35 | Not audited | Not audited |
| v2.1 | 987 aggregate Vitest tests / 92 files (includes Git/API) | Included in aggregate; no split recorded | Included in aggregate; no split recorded | 161 full browser; 16 configured runtime; 42 fresh audit subset | 45/45 under approved design interpretations | 25/25 named contracts wired | 11/11 bounded journey categories wired |

### Top Lessons (Verified Across Milestones)

1. Package-boundary browser evidence remains the strongest detector of integration, CSP, layout, and accessibility defects.
2. Cross-source milestone audits are necessary because phase frontmatter can lag accepted UAT evidence.
3. One canonical authority per state or visual role reduces both correctness risk and review complexity.

4. Attached agent workflows must prove both immutable provenance and per-invocation mutable-state isolation at the generated-package boundary.
5. Optional hosted functionality should disappear completely when unconfigured rather than expose dormant routes or arbitrary-origin seams.
6. A superseded phase needs explicit audit disposition even when a later phase removes its runtime and verifies every requirement.
7. Contradictory planning status (ROADMAP progress, REQUIREMENTS traceability, verification) accumulates silently within a milestone; reconcile it at each phase close, not at milestone close.
8. Stable IDs do not prove freshness; verify inventory and selected content after recapture, including partial-failure/net-zero-delta retry.
9. Mutable drafts must settle against immutable origin ownership before recapture; lock editing until the state transition finishes.
10. Package custody and publication authority are separate; corrected configured-runtime proof does not publish a registry release.
11. Milestone archives need usable references and complete byte manifests, not empty directories or stale active-phase counters.