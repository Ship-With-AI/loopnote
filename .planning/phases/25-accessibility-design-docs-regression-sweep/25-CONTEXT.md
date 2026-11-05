# Phase 25: Accessibility, Design Docs & Regression Sweep - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the milestone: prove every toolbar group is reachable by role and name (closing DEBT-01), audit popovers/menus and live regions, run the full regression suites against the finished workbench, and rewrite `DESIGN.md` to describe the shipped workbench. Requirements: TOK-02, A11Y-01, A11Y-02, A11Y-03.

Not in this phase: new features, narrow/phone layout (accepted debt), visual redesign beyond defects found by the audits.

</domain>

<decisions>
## Implementation Decisions

### DEBT-01 proof
- A dedicated e2e spec asserts every toolbar group — title bar, side-bar view header, editor title, panel tabs, status bar — is reachable via `getByRole('toolbar' | 'group', { name })` against the packaged runtime. When it passes, remove DEBT-01 from ROADMAP Backlog and from PROJECT.md accepted-debt notes.

### Live-region audit
- Measure in real Chromium the announcements for: panel tab switch, thread resolve / reopen / delete (+ Undo), refresh result, export result, Finish result, drift transitions. Exactly one announcement per outcome; fix duplicates or missing announcements at their source.
- Every popover/menu (identity popover, view-options menu, any thread menus): keyboard-operable, Esc closes, focus returns to the trigger — covered by e2e assertions.

### DESIGN.md
- Rewrite Direction, Composition, Geometry, Components, Responsive behavior (desktop 1050–1920px; narrow layouts recorded as accepted debt), and Motion to describe the shipped workbench; no mention of the identity header band or review rail. Colour section stays canonical-root based.

### Full regression
- Green at phase end: `npx vitest run --no-file-parallelism` (all suites), `npm run typecheck:web`, `npm run typecheck:tests`, `npm run verify:semantic-css`, full `npx playwright test`, and the default (non-custody) `npm run test:runtime-artifact` run. Any flaky test gets a recorded reproduction and either a fix or an entry in STATE.md Deferred Items with evidence.
- A11Y-03 completion: confirm no Phase 19–24 locator was deferred (grep for skipped/fixme tests introduced in v2.1).

### Claude's Discretion
- How audits are scripted (Playwright accessibility snapshots, `aria-live` mutation counting), spec file names.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phases 20–24 workbench components; `announce()` single live-region owner in `App.vue`; existing a11y specs from v1.1/v1.6 (focus inventory, contrast, roving tabindex).
- `DESIGN.md` (50 lines), `.kimi-code/skills/sketch-findings-loopnote/` references and Phase 20–24 UI-SPECs as the description source.

### Established Patterns
- Package-boundary browser evidence; single live-region owner; same-phase locator updates.

### Integration Points
- `.planning/ROADMAP.md` Backlog (DEBT-01 entry), `.planning/PROJECT.md`, `DESIGN.md`, `tests/e2e/*`, `tests/integration/*`.

</code_context>

<specifics>
## Specific Ideas

- None.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
