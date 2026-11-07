# Roadmap: Loopnote

## Milestones

- **[v1.0 MVP](./milestones/v1.0-ROADMAP.md)** — Phases 01–04.1, 40 plans, shipped 2026-07-24.
- **[v1.1 GitHub Dark Diff](./milestones/v1.1-ROADMAP.md)** — Phases 05–08, 16 plans, 18/18 requirements, shipped 2026-07-29.
- **[v1.2 Fast Source Discovery](./milestones/v1.2-ROADMAP.md)** — Phases 09–11, 4 plans, 5/5 requirements, shipped 2026-07-30.
- **[v1.3 Agent Review Handoff](./milestones/v1.3-ROADMAP.md)** — Phases 12–15, 14 plans, 42 tasks, 17/17 requirements, shipped 2026-08-06.
- **[v1.4 Voluntary Support](./milestones/v1.4-ROADMAP.md)** — Phases 01–02, 22 plans, 30 tasks, 12/12 requirements, shipped 2026-09-04.
- **[v1.5 MIT Distribution](./milestones/v1.5-ROADMAP.md)** — Phases 03–07, 23 plans, 69 tasks, 18/19 requirements (ACC-04 blocked), shipped 2026-09-15.
- **[v1.6 Workspace Restyle](./milestones/v1.6-ROADMAP.md)** — Phases 08–12, 31 plans, 24/24 requirements, shipped 2026-09-14 (`tech_debt`: toolbar-roles gap accepted, closed in Phase 25).
- **[v2.0 Artifact Review](./milestones/v2.0-ROADMAP.md)** — Phases 13–18 (incl. 17.1), 70 plans, 196 tasks, 35/35 requirements, shipped 2026-11-04 (no milestone audit; 4 verification items deferred — see `STATE.md`).
- **[v2.1 Workbench Redesign](./milestones/v2.1-ROADMAP.md#milestone-v21-workbench-redesign)** — Phases 19–25.1, 53 plans, 45/45 requirements under approved design interpretations; completed locally 2026-11-07 with documented debt. [Requirements](./milestones/v2.1-REQUIREMENTS.md#requirements-archive-v21-workbench-redesign) · [Audit](./milestones/v2.1-MILESTONE-AUDIT.md) · [Phases](./milestones/v2.1-phases/).

**Current position:** No active milestone or selected next scope. v2.1 completion does not publish npm or create a Git tag; package remains 2.0.0.

**Historical Backlog:** Preserved verbatim below. Its `.vue` typechecking gap was closed in Phase 19; the v1.6 toolbar-roles gap was closed in Phase 25. Those items are not reopened by retaining their original wording.

## Backlog

Items accepted as debt at a milestone close, or deferred from a milestone's scope. Each is
scheduled by the next milestone that touches the same surface, not automatically.

### Carried forward from v1.5

Recorded in `./milestones/v1.5-ROADMAP.md` and `./milestones/v1.5-REQUIREMENTS.md`. The next
milestone can decide explicitly whether to adopt them:

- **ACC-04** — verified-support acceptance unreachable until Restore stops completing on a
  false RPC result (`supabase/functions/support-flow/index.ts`) and a permitted genuine
  live entitlement exists. Fix the defect first, then rerun only the verified-state portions
  on global, npx, marketplace paths.

- `SKILL.md` still installs `@1.5.0` and claims only 1.5.0 was independently release
  verified; correcting it needs a separate marketplace publication.

- **`.vue` files remain outside every typechecker.** `tsconfig.web.json` uses a `files` array
  of seven `.ts` entries, so `npm run typecheck:web` covers zero components and exits in under a
  second. **Corrected 2026-09-15:** `vue-tsc` cannot close this gap as installed —
  `vue-tsc@3.3.7` resolves `typescript/lib/tsc` at startup but `typescript@7.0.2` no longer
  exposes that subpath, so it dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` before reading any
  config. Closing this gap needs a TypeScript/vue-tsc pairing decision, not just an npm script.

### Deferred from v1.6 scope

Mockup affordances deliberately excluded from v1.6; full rationale in
`./milestones/v1.6-REQUIREMENTS.md`.

- **DEFER-01** — Per-file viewed tracking with viewed marks, an Unviewed filter, and
  "N of M viewed" progress. Requires a new persisted draft field.

- **DEFER-02** — Change-to-change (hunk) jump navigation with a position indicator.
- **DEFER-03** — A wrap-lines toggle for the diff surface.
- **DEFER-04** — Composited WCAG contrast re-verification of the re-derived palette, plus the
  rest of the v1.1 accessibility gate battery (forced colors, 320px, true 400% zoom).

### Reopened

- **File-metadata orphan** — `GET /api/files/:fileId` and `SessionClient.getFileMetadata()` have
  no caller again. Originally a v1.0 debt item; v1.6 recorded it resolved because the Details
  dialog became its first real consumer. Quick task `260915-jbv` removed that dialog, so the
  route and client method are dead code once more. Either retire both or give them an
  intentional consumer.
