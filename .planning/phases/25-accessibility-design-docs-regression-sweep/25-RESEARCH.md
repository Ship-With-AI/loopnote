# Phase 25: Accessibility, Design Docs & Regression Sweep - Research

**Researched:** 2026-11-05
**Domain:** Playwright/ARIA accessibility proof (toolbar/group role reachability, live-region determinism, popover focus-management), flaky-test root-causing, and design-doc rewrite (no new libraries)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### DEBT-01 proof
- A dedicated e2e spec asserts every toolbar group — title bar, side-bar view header, editor title, panel tabs, status bar — is reachable via `getByRole('toolbar' | 'group', { name })` against the packaged runtime. When it passes, remove DEBT-01 from ROADMAP Backlog and from PROJECT.md accepted-debt notes.

#### Live-region audit
- Measure in real Chromium the announcements for: panel tab switch, thread resolve / reopen / delete (+ Undo), refresh result, export result, Finish result, drift transitions. Exactly one announcement per outcome; fix duplicates or missing announcements at their source.
- Every popover/menu (identity popover, view-options menu, any thread menus): keyboard-operable, Esc closes, focus returns to the trigger — covered by e2e assertions.

#### DESIGN.md
- Rewrite Direction, Composition, Geometry, Components, Responsive behavior (desktop 1050–1920px; narrow layouts recorded as accepted debt), and Motion to describe the shipped workbench; no mention of the identity header band or review rail. Colour section stays canonical-root based.

#### Full regression
- Green at phase end: `npx vitest run --no-file-parallelism` (all suites), `npm run typecheck:web`, `npm run typecheck:tests`, `npm run verify:semantic-css`, full `npx playwright test`, and the default (non-custody) `npm run test:runtime-artifact` run. Any flaky test gets a recorded reproduction and either a fix or an entry in STATE.md Deferred Items with evidence.
- A11Y-03 completion: confirm no Phase 19–24 locator was deferred (grep for skipped/fixme tests introduced in v2.1).

### the agent's Discretion
- How audits are scripted (Playwright accessibility snapshots, `aria-live` mutation counting), spec file names.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOK-02 | Contributors read a `DESIGN.md` whose Composition, Geometry, and Components sections describe the shipped workbench, with no review rail or identity header band. | `DESIGN.md` full-text audit below with exact line numbers (36, 40, 48) of the obsolete "review rail" references; confirmed independently against the live file, matching the prior dossier. |
| A11Y-01 | Assistive-technology users reach each toolbar control group by role and name (`getByRole('toolbar' \| 'group', { name })`), closing DEBT-01. | Architecture Pattern (a) below: per-region role recommendation (toolbar vs. group vs. tablist) grounded in actual shipped markup + the project's own precedent (`EditorTitle.vue`, `FileTree.vue`) and the Phase 20 IN-05 anti-pattern lesson. |
| A11Y-02 | Keyboard users can operate every popover and menu, close it with Esc, and get focus returned; each dynamic change is announced by exactly one live region. | Architecture Patterns (b) and (c) below: the project's own `data-announcement-version` delta-assertion precedent (`tests/integration/anchored-workspace.spec.ts:1067-1078`) and Esc/focus-return precedent (`tests/e2e/file-tree.spec.ts:700-702`, `tests/e2e/inline-comment-threads.spec.ts:393-401`). |
| A11Y-03 | Maintainers see the packaged-binary Playwright and integration suites pass against the workbench, with any locator a phase breaks updated within that same phase. | Common Pitfalls below: root-caused flakiness hypotheses for the three named specs, plus the `skipped/fixme` grep approach for the "no deferred locator" confirmation. |
</phase_requirements>

## Summary

This phase installs no new dependencies — Playwright `1.61.1` and Vitest `4.1.10` (both already in `package.json`) are the entire test stack, and every pattern this phase needs (`getByRole('toolbar'|'group')` reachability proof, `aria-live` version-delta counting, Esc/focus-return assertions, packaged-binary vs. dev-server test setup) already has a shipped precedent somewhere in `tests/`. The job is to *extend an established convention to two more components* (TitleBar, StatusBar), *add missing e2e proof* for behavior that already works in the source code (Identity Popover Esc/focus-return has zero e2e coverage today), *close a handful of genuine live-region gaps* (panel tab switch, filter/view-mode changes, markdown toggle, thread expand/collapse have no `announce()` call at all), and *root-cause or document* three previously-observed flaky specs.

The single most load-bearing finding is that this project's shipped `role="toolbar"` usage (`EditorTitle.vue:101`, `FileTree.vue:401`) deliberately does **not** implement the strict WAI-ARIA APG single-tab-stop/roving-tabindex toolbar widget — `tests/e2e/workbench-shell-smoke.spec.ts:555-569` proves each toolbar button is its own individual `Tab` stop. This is intentional, already shipped, and already tested; Phase 25 must match this precedent on TitleBar/StatusBar, not "fix" it toward strict APG compliance (that would be new-feature scope, explicitly out of phase per CONTEXT.md). The companion lesson is Phase 20's `20-REVIEW.md` IN-05 finding: `role="separator"` + `aria-valuenow/min/max` implied a focusable, keyboard-adjustable widget that was actually `tabindex="-1"` and unreachable — a role/behavior mismatch. The toolbar precedent avoids this trap because `role="toolbar"` here is used purely as a **named, discoverable landmark for a button cluster** (screen readers still announce "toolbar, Diff navigation" and each button individually), not as a claim of roving-tabindex keyboard semantics — so TitleBar/StatusBar additions must likewise avoid claiming behavior (e.g. `aria-activedescendant`, `tabindex="-1"` on inner buttons) they don't implement.

For the bottom panel, Phase 24's locked contract (`24-UI-SPEC.md:86`) ships `<div role="tablist" aria-label="Review panel">` with real roving tabindex (`tabindex="0"/"-1"`, Left/Right move-and-activate) — a genuine ARIA tabs widget, not a toolbar/group. CONTEXT.md's decision text lists "panel tabs" alongside the toolbar/group list, but the only role Phase 24 actually ships there is `tablist`/`tab`; **the planner should target `getByRole('tablist', { name: 'Review panel' })` for that region**, not force a `toolbar`/`group` role onto a widget that is correctly a tabs pattern — see Open Questions for the one-line rationale a plan task should carry.

**Primary recommendation:** Extend the existing `role="toolbar"` convention to `TitleBar.vue`'s `.titlebar__right` button cluster and `StatusBar.vue`'s `.statusbar__right` button cluster (mirroring `FileTree.vue`'s `.file-tree-pane__toolbar`), assert the bottom panel via `getByRole('tablist', { name: 'Review panel' })`, use the already-proven `data-announcement-version` delta pattern for live-region counting, use the already-proven Esc-hides/focus-returns two-assertion pattern for popover coverage, and document (not re-investigate) the `token-contract.test.ts` flake since two independent prior phases already root-caused and reproduced it identically.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Toolbar/group role + name exposure (DEBT-01) | Browser / Client (Vue SFC template) | — | Pure markup addition (`role`, `aria-label`) on existing `TitleBar.vue`/`StatusBar.vue` DOM; no server/API involvement. |
| Live-region announcement completeness | Browser / Client (`App.vue` single `announce()` owner) | — | `liveMessage`/`liveMessageVersion` refs and the `<p aria-live="polite">` owner already centralize this; new call sites are additive `announce()` calls at existing watchers/handlers in `App.vue`, never a second live region. |
| Popover/menu keyboard proof | Browser / Client (Playwright e2e against already-shipped component behavior) | — | Behavior (`containFocus`, `handleKeydown`, `handlePointerDown`) is already implemented in `IdentityPopover.vue`/`ViewOptionsMenu.vue`; this phase adds *test* coverage, not new client code. |
| Packaged-binary regression proof (A11Y-03) | Browser / Client (Playwright against `dist/bin/*.mjs`) | Build/Packaging (`scripts/pack-runtime.mjs`) | Tests spawn the actual packaged CLI via the custody-gated pack mechanism; the pack step itself is a build-tier concern (cross-process lock, `npm pack`), but the assertions run against the browser tier. |
| DESIGN.md rewrite (TOK-02) | Docs (no runtime tier) | — | Static Markdown describing shipped `src/web/styles.css` tokens and component geometry; no code change. |
| Flaky-spec root-cause (token-contract Vite timeout, pack-runtime contention) | Build/Test tooling (Vitest file-parallelism scheduler, cross-process pack lock) | Browser / Client (test assertions themselves are correct) | Both confirmed causes are *test-infrastructure resource contention*, not product-code or assertion defects — see Common Pitfalls. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | `1.61.1` [VERIFIED: package.json] | e2e browser automation, `getByRole` accessibility-tree queries, packaged-CLI spawning | Already the project's only e2e framework across 20+ spec files; no alternative under consideration |
| `vitest` | `4.1.10` [VERIFIED: package.json] | Unit tests (`token-contract.test.ts`), `--no-file-parallelism` full-suite gate | Already the project's only unit-test runner |

### Supporting
None new. No additional libraries, polyfills, or axe-core/pa11y-style automated-audit tooling are introduced — CONTEXT.md's "Claude's Discretion" section explicitly scopes scripting to "Playwright accessibility snapshots, `aria-live` mutation counting" using the existing stack, and every pattern needed (role assertions, live-region version-delta, Esc/focus-return) is already provable with plain `@playwright/test` APIs the codebase already uses.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `getByRole`/`toBeFocused`/`toHaveAttribute` assertions (project convention) | `@axe-core/playwright` automated a11y scanner | Would catch generic WCAG issues but cannot assert the phase's specific behavioral contracts (exactly-one-announcement, focus-return-to-*this* trigger); also a new dependency this phase explicitly doesn't need. Not recommended — out of scope per "no new features" boundary and the project has never used axe-core anywhere in `package.json`. |

**Installation:** None — no `npm install` step for this phase.

**Version verification:** `package.json` devDependencies confirmed directly: `@playwright/test@1.61.1`, `vitest@4.1.10` [VERIFIED: package.json, checked 2026-11-05]. `npx playwright --version` confirms the installed binary matches (`Version 1.61.1`) [VERIFIED: local install].

## Package Legitimacy Audit: N/A — no new dependencies this phase

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Real Chromium (Playwright)                                           │
│                                                                        │
│  getByRole('toolbar'|'group', {name}) ──┐                            │
│                                          ▼                            │
│                      ┌───────────────────────────────┐               │
│                      │  TitleBar / FileTree /         │  (A11Y-01)    │
│                      │  EditorTitle / StatusBar        │──closes──▶ DEBT-01
│                      │  (role="toolbar"/"group" DOM)   │               │
│                      └───────────────────────────────┘               │
│                                                                        │
│  getByRole('tablist', {name:'Review panel'}) ──▶ BottomPanel (Ph.24) │
│                                                                        │
│  user action (click/keydown) ──▶ Vue handler ──▶ App.vue announce() │
│         │                              │                              │
│         │                              ▼                              │
│         │                    liveMessage.value = msg                 │
│         │                    liveMessageVersion.value += 1           │
│         │                              │                              │
│         │                              ▼                              │
│         │               <p aria-live="polite"><span                 │
│         │                 data-announcement-version=N>{msg}</span></p>│
│         │                              │                              │
│         └── Playwright reads version BEFORE action,                  │
│             re-reads version AFTER ──▶ assert delta === 1 ───▶ A11Y-02│
│                                                                        │
│  Esc on popover ──▶ component's own handleKeydown/containFocus ──▶   │
│       emit('close') ──▶ popover locator toBeHidden() +                │
│       trigger-button locator toBeFocused() ───────────────────▶ A11Y-02│
│                                                                        │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ page.goto(loopbackUrl) — served by packaged CLI
        │
┌───────┴────────────────────────────────────────────────────────────┐
│ scripts/pack-runtime.mjs (build/test tier)                          │
│  acquireRuntimePackLock() — cross-process mutex keyed by             │
│  sha256(repoRoot), 300s acquire deadline, 50ms Atomics.wait poll     │
│  → npm-pack-equivalent build → dist/bin/loopnote.mjs spawned          │
│  (this global lock is the root cause of two of the three flaky specs)│
└───────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
No new directories. All work lands in existing locations:
```
src/web/components/workbench/
├── TitleBar.vue        # add role="toolbar" aria-label to .titlebar__right
├── StatusBar.vue       # add role="toolbar" aria-label to .statusbar__right
tests/e2e/
├── <new>.spec.ts        # DEBT-01 proof spec — asserts all 5 regions by role+name
tests/integration/ or tests/e2e/
├── <existing files>     # extended with live-region version-delta + Esc/focus-return assertions
DESIGN.md                # rewritten in place
.planning/STATE.md        # Deferred Items entries for any undocumented/unreproducible flake (NOT written by this researcher — execution-time only)
```

### Pattern (a): Per-region role selection for DEBT-01 closure

**What:** Five named regions need `getByRole` reachability. Each one's *correct* role is determined by whether it implements a WAI-ARIA widget's keyboard model (per the [Toolbar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) and [Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — [CITED: w3.org/WAI/ARIA/apg]) or is just a labeled container of independently-tabbable controls.

| Region | File:Line | Current state | Recommended role | Why |
|--------|-----------|----------------|-------------------|-----|
| Title bar | `TitleBar.vue:63-97` (`.titlebar__right`) | No role, only per-button `aria-label` | `role="toolbar"` on `.titlebar__right` | Matches `FileTree.vue:401`/`EditorTitle.vue:101` precedent exactly: a cluster of independently-tabbable icon buttons (refresh, toggle sidebar, toggle panel), same shape as `.file-tree-pane__toolbar`. No roving tabindex needs to be added — the precedent (confirmed by `workbench-shell-smoke.spec.ts:555-569`) doesn't have it either. |
| Side-bar view header | `FileTree.vue:401` (`.file-tree-pane__toolbar`) | Already `role="toolbar" aria-label="Changed files actions"` | No change — already PASS | Existing, already queryable. |
| Editor title | `EditorTitle.vue:101` (outer) + `:168,196,222` (sub-groups) | Already `role="toolbar" aria-label="Diff navigation"` with nested `role="group"` | No change — already PASS | Existing, already queryable. |
| Panel tabs / bottom panel | `BottomPanel.vue` header → Phase 24 ships `<div role="tablist" aria-label="Review panel">` (`24-UI-SPEC.md:86`) with `role="tab"` children (`:89`) | Currently `role="region" aria-label="Review"` on the outer `<section>` (no tablist yet — ships in Phase 24) | `getByRole('tablist', { name: 'Review panel' })` — **not** toolbar/group | This is a genuine ARIA tabs widget (real roving tabindex: `tabindex="0"/"-1"`, Left/Right move-and-activate, `24-UI-SPEC.md:92-94`) — using `toolbar`/`group` here would misrepresent an actual single-tab-stop widget as a plain button cluster, repeating the IN-05 mismatch in the opposite direction (claiming *less* structure than is actually implemented). See Open Questions. |
| Status bar | `StatusBar.vue:64-93` (`.statusbar__right`) | No role, only per-button `aria-label`/`aria-busy`/`aria-expanded` | `role="toolbar"` on `.statusbar__right` | Same shape as title bar: comments button, conditional export/finish button, conditional support-disclosure button — independently-tabbable cluster, not a single widget. |

**When to use `group` instead of `toolbar`:** per the APG, `group` is appropriate when the controls don't form a cohesive command strip (e.g. a form section). None of this phase's five regions need `group` at the outer level — all five are button/tab strips. `group` *is* already correctly used for `EditorTitle.vue`'s three labeled sub-clusters inside its outer toolbar (`Diff layout`, `Markdown view`, `Comment threads`) and that nesting pattern should not be touched.

**Anti-pattern to avoid (Phase 20 IN-05 lesson):** Do not add `aria-valuenow`/`tabindex="-1"`/`aria-activedescendant` or any other attribute that *implies* a keyboard-operable widget state unless the keyboard behavior is actually wired up in the same change. `20-REVIEW.md` IN-05 (`WorkbenchShell.vue:10-16,26-32`) is the exact precedent: `role="separator"` + value attributes implied a focusable, adjustable control that was unreachable (`tabindex="-1"`, no arrow-key handler) — "ARIA treats the separator carrying a value as a focusable widget; as written, assistive technology announces an adjustable range, but the control can neither be focused nor adjusted." Applying bare `role="toolbar"` with only `aria-label` (no roving-tabindex claims) sidesteps this entirely, matching what `EditorTitle.vue`/`FileTree.vue` already ship.

### Pattern (b): Deterministic "exactly one announcement per outcome" testing

**What:** `App.vue:493-496` owns a single live region:
```vue
<!-- src/web/App.vue:1762-1764 -->
<p class="visually-hidden" aria-live="polite">
  <span :key="liveMessageVersion" :data-announcement-version="liveMessageVersion">{{ liveMessage }}</span>
</p>
```
```typescript
// src/web/App.vue:493-496
function announce(message: string): void {
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}
```
Every `announce()` call increments `liveMessageVersion` by exactly 1, regardless of whether the new message text differs from the old one (this is why a `:key` exists on the `<span>` — React/Vue text-diffing alone can't be trusted to signal "an announcement fired" when the message repeats, so the version counter is the deterministic signal). A pre-existing precedent at `tests/integration/anchored-workspace.spec.ts:1050-1079` already proves this mechanism for "repeated identical settlement messages create distinct live-region updates":
```typescript
// Source: tests/integration/anchored-workspace.spec.ts:1066-1078 (existing project pattern)
await expect(liveRegion).toHaveText(announcement);
const firstVersion = await liveRegion.locator('span').getAttribute('data-announcement-version');
// ... trigger the second occurrence of the same outcome ...
await expect.poll(async () =>
  liveRegion.locator('span').getAttribute('data-announcement-version')).not.toBe(firstVersion);
await expect(liveRegion).toHaveText(announcement);
```

**Recommended strengthening for "exactly one" (not just "at least one"):** the existing precedent only proves the version *changed*, which rules out zero announcements but not duplicates. For CONTEXT.md's "exactly one announcement per outcome" requirement, capture the version **immediately before** triggering the outcome and assert the delta is precisely `+1`:
```typescript
const before = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
// ... trigger exactly one outcome (e.g. resolve a thread) ...
await expect(liveRegion).toHaveText(expectedMessage);
const after = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
expect(after).toBe(before + 1); // not before (missing) and not before+2 (duplicate)
```
This is a direct extension of the already-proven pattern — no new APIs, just a stricter numeric assertion instead of `.not.toBe(firstVersion)`.

**Outcomes requiring this check (per CONTEXT.md, cross-referenced against existing `App.vue` call sites and gaps found by the prior accessibility-audit dossier):**

| Outcome | Existing `announce()` call site | Status |
|---------|----------------------------------|--------|
| Thread resolve/reopen/delete (+Undo) | `App.vue:773-782` (resolve/reopen/delete), `App.vue:423` (`'Comment restored.'` on undo) | Exists — needs version-delta e2e proof, not new code. Note: the undo message at `App.vue:423` lacks the open/resolved count context the other three have (`App.vue:777-782`) — flagged as a minor inconsistency, not a missing announcement; fixing the wording is in-scope "fix duplicates or missing announcements at their source" territory if the planner chooses, but not required to pass A11Y-02's "exactly one" requirement. |
| Refresh result | `App.vue:480,485` (content/worktree-change watchers fire post-refresh) | Exists — needs version-delta proof |
| Export result | `App.vue:816-837` (checking/drift/success/recovery/failure) | Exists — needs version-delta proof |
| Finish result | within the same export-lifecycle block (`App.vue:816-837`) / `attached-completion` status text (`BottomPanel.vue:210`, `role="status" aria-live="polite"`, separate from the main live region) | Exists but **two different live-region owners** (`App.vue`'s single region vs. `BottomPanel.vue:210`'s own inline `aria-live="polite"`) — the planner should verify this doesn't produce a double-announcement for the same outcome; it is plausibly intentional (progress text vs. terminal result) but needs the exactly-one check per outcome, not per DOM node. |
| Drift transitions | `App.vue:474` (anchor drift, fires only on transition *to* unverified — no reset announcement on transition back per the dossier), `App.vue:480,485` (patch/worktree drift) | **Gap:** `474`'s condition (`hasUnverified && !hadUnverifiedAnchors`) has no mirrored "verified again" transition — confirm with planner whether CONTEXT.md's "drift transitions" implies both directions need an announcement (if so, this is a genuine missing-announcement fix, in scope per "fix duplicates or missing announcements at their source"). |
| Panel tab switch | **None found** — no `announce()` call exists for `BottomPanel`'s `selectTab`/`moveTab` handlers (`24-UI-SPEC.md:93-94`) | **Missing** — needs a new `announce()` call wired from `App.vue`'s `openPanel`/panel-state watcher, or from `BottomPanel.vue`'s `update:activeTab` emit handler in `App.vue`. This is new wiring to an *existing* owner (`announce()`), not a new live region. |

### Pattern (c): Esc-closes + focus-returns-to-trigger testing

**What:** The project already has two independent, working examples of the exact two-assertion shape this phase needs — `locator.toBeHidden()` + `trigger.toBeFocused()` immediately after `page.keyboard.press('Escape')`:

```typescript
// Source: tests/e2e/file-tree.spec.ts:700-702 (existing project pattern — View Options menu)
await page.keyboard.press('Escape');
await expect(menu).toBeHidden();
await expect(viewOptionsButton).toBeFocused();
```

```typescript
// Source: tests/e2e/inline-comment-threads.spec.ts:393-401 (existing project pattern — thread header)
async function assertEscReturnsFocusToEditor(commentId: string, side: 'base' | 'head', line: number): Promise<void> {
  const thread = threadLocator(page, commentId);
  await thread.locator('.thread-header').focus();
  await expect(thread.locator('.thread-header')).toBeFocused();
  await page.keyboard.press('Escape');
  const editorPane = page.locator(side === 'base' ? '.monaco-diff-editor .editor.original' : '.monaco-diff-editor .editor.modified');
  await expect(editorPane.locator('.native-edit-context')).toBeFocused();
}
```

**Gap:** Per the prior accessibility-audit dossier (cross-checked against `tests/e2e/*` directly — no `identity-popover` locator exists anywhere under `tests/`), **Identity Popover has zero e2e coverage for Esc/focus-return**, even though the behavior is already implemented and correct in `IdentityPopover.vue` (`containFocus()` emits `close` on Escape; `IdentityPill.vue`'s `closePopover()` restores focus to the pill button). This is a pure test-addition task — copy the `file-tree.spec.ts:700-702` shape against the identity pill trigger (`.identity-pill` button, confirmed clickable at `tests/e2e/complete-review-draft.spec.ts:776` and others) and the popover panel (`.identity-popover`, confirmed as a locator target at `complete-review-draft.spec.ts:779`).

**Don't build:** do not write a custom focus-trap/focus-return implementation — both `IdentityPopover.vue` (`containFocus`, lines ~226-246) and `ViewOptionsMenu.vue` (`handleKeydown`, lines ~64-79) already implement Tab-cycling containment and Esc-to-close correctly; this phase's job is proof via e2e assertions only, per CONTEXT.md's explicit framing ("covered by e2e assertions").

### Pattern (d): Flaky-spec root-cause investigation

See **Common Pitfalls** below for the full per-spec analysis — summarized here as the recommended investigation method: (1) grep the spec file for its own timeout override (`test.setTimeout`) and any cross-process resource it depends on (temp dirs, locks, spawned child processes); (2) grep `.planning/phases/*/REVIEW*.md`, `*-VERIFICATION.md`, `*-SUMMARY.md` for prior mentions of the same spec/test name — this project's own history already contains two independently-reproduced, fully root-caused incidents for one of the three named specs; (3) only write new reproduction steps if no prior phase already captured them.

### Anti-Patterns to Avoid
- **Claiming keyboard semantics you haven't implemented:** adding `role="toolbar"` (or any ARIA widget role) without matching keyboard behavior repeats the Phase 20 IN-05 defect. This phase's additions are safe because they follow the already-shipped, already-tested `role="toolbar"`-as-landmark convention exactly (no roving tabindex claimed).
- **Forcing `toolbar`/`group` onto the bottom panel's tablist:** CONTEXT.md's prose lists "panel tabs" alongside the toolbar/group targets, but Phase 24 ships a real `role="tablist"` widget there — querying it as `toolbar`/`group` would either fail (wrong role) or require stripping the correct `tablist` role Phase 24 just added, actively regressing A11Y-02's keyboard-tabs requirement for that same region.
- **Re-investigating an already-root-caused flake:** `tests/unit/token-contract.test.ts`'s Vite-dev-server-reload timeout has been independently reproduced and explained identically in two separate phases (`20-VERIFICATION.md:239`, `24-SUMMARY.md:84`) — re-running bisection on this is wasted effort; the correct action is documentation with the existing citations as evidence, per CONTEXT.md's "fix or document" branch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "Was exactly one live-region update fired?" | A MutationObserver-based custom live-region watcher, or axe-core-style automated scanning | The existing `data-announcement-version` integer attribute + before/after delta assertion (Pattern b) | The project already instrumented the live region for exactly this purpose (`App.vue:106,495,1763`); a MutationObserver would duplicate functionality the app already exposes declaratively and more precisely (text alone can't distinguish "same message announced twice" from "announced once"). |
| "Does Esc close this popover and restore focus?" | A generic reusable Playwright focus-trap test helper / abstraction | Inline two-assertion pattern per popover (Pattern c), matching existing per-spec style | The codebase has never introduced a shared a11y-testing helper module for this; every existing Esc/focus-return check is a plain inline `toBeHidden()`+`toBeFocused()` pair local to its spec. Introducing a new shared helper now would be a second convention for 2-4 call sites — not justified at this scale, and CONTEXT.md scopes this phase to "e2e assertions," not new test infrastructure. |
| "Which toolbar region is reachable by role?" | Automated axe-core/pa11y role-coverage scanning | Direct `getByRole('toolbar'\|'group'\|'tablist', { name })` locator assertions, one per named region | CONTEXT.md's locked decision already specifies the exact Playwright API; automated scanners would report generic WCAG findings, not prove the specific five-region reachability contract this phase must close DEBT-01 against. |

**Key insight:** every piece of testing infrastructure this phase needs (version-keyed live region, Esc/focus-return assertion shape, packaged-binary spawn helpers) was already built in prior phases for other purposes and is directly reusable without modification — the work here is applying existing mechanisms to new locations, not inventing new ones.

## Common Pitfalls

### Pitfall 1: `tests/unit/token-contract.test.ts` — Vite dev-server reload timeout (ALREADY ROOT-CAUSED, documentation-only)

**What goes wrong:** The test `'reloads the virtual token module after styles.css changes in a Vite dev server'` (`tests/unit/token-contract.test.ts:130`) occasionally exceeds Vitest's global `testTimeout: 10_000` (`vitest.config.ts:24`) when run under Vitest's **default file-parallelism** (multiple test files executing concurrently across worker processes).

**Why it happens:** The test spins up a real Vite dev server via `scripts/token-root-plugin.mjs`'s `configureServer` hook (chokidar file-watcher + HMR module-graph invalidation round-trip against `src/web/styles.css`). Under default file-parallelism, this watcher/HMR round-trip competes for CPU/IO with every other concurrently-running test file's own setup — pushing the round-trip past 10s. This has been **independently reproduced and documented identically twice already**:
- `.planning/phases/20-shell-frame/20-VERIFICATION.md:239`: *"Under default file-parallelism, `tests/unit/token-contract.test.ts`'s Vite-dev-server-reload test occasionally times out at the global 10s `testTimeout` from resource contention with other concurrently-spawned test files; it passes reliably both in isolation and under `--no-file-parallelism`, and touches none of the four fixed files — a pre-existing environmental flake, not a regression from this work."*
- `.planning/phases/24-bottom-panel-export/24-SUMMARY.md:84`: *"...timed out at 10000ms. This test is unrelated to this plan's files... Re-running the full suite immediately after passed 465/465 with no failures, and running the test in isolation also passed — confirmed as a pre-existing timing flake under load, not a regression introduced by this plan."*
- `.planning/phases/23-inline-comment-threads/23-VERIFICATION.md:85` independently ran the full `--no-file-parallelism` suite and observed **no** flake, consistent with the hypothesis.

**How to avoid:** No code fix needed — CONTEXT.md's own phase-end gate command (`npx vitest run --no-file-parallelism`) already runs the suite in the mode that doesn't trigger this flake. **Recommended action: document, don't re-fix.** Add (at execution time, not by this researcher) a `.planning/STATE.md` Deferred Items entry citing the two prior reproductions above as evidence, satisfying CONTEXT.md's "fix or document with evidence" requirement without spending budget re-bisecting an already-solved question.

**Warning signs:** If this specific test times out again during Phase 25's own `npx vitest run --no-file-parallelism` invocation (not just under default parallelism), that would be a **new, different** symptom from the documented one and would warrant fresh investigation — the existing evidence only covers the default-parallelism case.

### Pitfall 2: `tests/e2e/rendered-markdown-security.spec.ts` and `tests/e2e/anchored-review.spec.ts` — cross-process pack-runtime lock contention (HYPOTHESIS, needs reproduction evidence if observed)

**What goes wrong:** Both specs are **not** in `playwright.runtime-artifact.config.ts`'s `custodyGatedSpecs` exclusion list (confirmed directly: that list contains only `package-assets.spec.ts`, `agent-ready-export.spec.ts`, `public-support-states.spec.ts`, `marketplace-review.spec.ts`) — meaning both run as part of the **default** `npx playwright test` invocation CONTEXT.md requires, not a separately-scheduled custody run. Each calls `scripts/pack-runtime.mjs` in its own `test.beforeAll` to build its own packaged CLI (`rendered-markdown-security.spec.ts:146-149`, pattern repeated in `anchored-review.spec.ts`), under a `test.setTimeout(90_000)` override (`rendered-markdown-security.spec.ts:32`).

**Why it happens:** `scripts/pack-runtime.mjs:30,143-165` implements a **global, cross-process mutex** keyed by `sha256(repositoryRoot)` (not per-spec, not per-Playwright-run) — `acquireRuntimePackLock()` creates a lock directory via `mkdirSync({ mode: 0o700 })`, polls every 50ms via `Atomics.wait`, and only gives up after a 300s deadline, with stale-owner takeover logic keyed on OS process identity (`runtimePackLockOwnerIsAlive`). Within a single Playwright run, `workers: 1`/`fullyParallel: false` (`playwright.config.ts:8,11`) already serializes specs so there's no *self*-contention. The contention vector is **cross-process**: any other process on the same machine invoking `pack-runtime.mjs` against the *same repository checkout* concurrently (e.g. another agent session, a concurrently-running `npm run test:runtime-artifact`, or a developer running two test commands in separate terminals) will serialize on this exact lock. This project's actual working method — multiple GSD agent sessions executing phases concurrently in the same working tree (directly observable: this research session ran alongside `ExecPhase24` and its sub-agents in this exact repository) — is precisely the condition that would trigger this. If the lock-holder's own pack work plus the waiter's lock-wait time together exceed the 90s `test.setTimeout`, the test fails with a timeout that "moves" to whichever spec happened to be packing during the contention window — matching `22-REVIEW-FIX.md:64`'s exact observation: *"the 1 occasional failure was a different, unrelated test in the rendered-markdown-* subsystem each time, confirmed flaky by isolated re-run passing 100%, never the same test twice, and in files untouched by any commit in this loop."*

**How to avoid:** Two non-mutually-exclusive options for the planner, both satisfying CONTEXT.md's "fix or document" branch:
1. **Low-risk code fix:** raise `test.setTimeout` in both specs (e.g. `90_000` → `180_000`) to absorb plausible lock-wait without masking genuine regressions — cheap, safe, directly targets the identified mechanism.
2. **Documentation path (if reproduction isn't practical within the phase):** record a `.planning/STATE.md` Deferred Items entry citing `scripts/pack-runtime.mjs:30,143-165` (the shared lock mechanism) and `22-REVIEW-FIX.md:64` (the prior observed symptom) as evidence, with reproduction steps being "run this spec concurrently with another process also invoking `pack-runtime.mjs` against this same checkout."

**Warning signs:** A timeout failure in either spec that does **not** recur in isolated re-run is the signature of this cause; a failure that recurs in isolation (same assertion failing every time, not a timeout) is a different, genuine regression and should not be attributed to this hypothesis.

### Pitfall 3: Misreading CONTEXT.md's "panel tabs" as requiring `toolbar`/`group` role

**What goes wrong:** A literal reading of CONTEXT.md's decision text ("title bar, side-bar view header, editor title, panel tabs, status bar... via `getByRole('toolbar' | 'group', { name })`") could lead a task-writer to add `role="toolbar"` or `role="group"` to the bottom panel's tab row, which Phase 24 ships as a real `role="tablist"`/`role="tab"` ARIA tabs widget with genuine roving tabindex.

**Why it happens:** CONTEXT.md's prose groups all five regions under one `getByRole('toolbar'|'group')` clause for brevity, but Phase 24's locked contract (`24-UI-SPEC.md:86-95`) was written and reviewed independently and specifies `tablist`/`tab`, which is the objectively correct role for that widget's actual keyboard model.

**How to avoid:** Target `getByRole('tablist', { name: 'Review panel' })` (and, for individual tab reachability, `getByRole('tab', { name: 'Comments' | 'Summary' | 'Export' })`) for that region specifically, while using `toolbar`/`group` for the other four. See Open Questions for how to phrase this to the planner without re-litigating the locked decision.

**Warning signs:** A DEBT-01 proof spec that fails to find `getByRole('toolbar', { name: ... })` for the panel region is not a bug to "fix" by changing the panel's role — it's confirmation this pitfall applies.

## Code Examples

### Toolbar role addition (TitleBar.vue)
```vue
<!-- Pattern source: src/web/components/FileTree.vue:401 (existing project convention) -->
<!-- Apply to: src/web/components/workbench/TitleBar.vue:63 -->
<div class="titlebar__right" role="toolbar" aria-label="Title bar actions">
  <button ... aria-label="Refresh snapshot">...</button>
  <button ... aria-label="Toggle side bar (⌘B)">...</button>
  <button ... aria-label="Toggle panel (⌘J)">...</button>
</div>
```

### DEBT-01 proof spec skeleton
```typescript
// New spec, pattern source: tests/e2e/workbench-shell-smoke.spec.ts:1-37 (packaged-binary setup)
// and tests/e2e/file-tree.spec.ts (existing getByRole usage elsewhere in the suite)
test('every toolbar/group/tablist region is reachable by role and accessible name (packaged binary)', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: 'Title bar actions' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Changed files actions' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Diff navigation' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Diff layout' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Review panel' })).toBeVisible(); // bottom panel — see Pitfall 3
  await expect(page.getByRole('toolbar', { name: 'Status bar actions' })).toBeVisible();
});
```

### Live-region exactly-one-announcement assertion
```typescript
// Pattern source: tests/integration/anchored-workspace.spec.ts:1053,1067,1076-1078 (existing project convention)
// Strengthened to exact delta per CONTEXT.md's "exactly one" requirement — see Pattern (b)
const liveRegion = page.locator('.visually-hidden[aria-live="polite"]');
const before = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
await page.getByRole('button', { name: 'Resolve thread' }).click();
await expect(liveRegion).toHaveText(/^Comment resolved\./);
const after = Number(await liveRegion.locator('span').getAttribute('data-announcement-version'));
expect(after).toBe(before + 1);
```

### Esc-closes / focus-returns proof (Identity Popover — currently uncovered)
```typescript
// Pattern source: tests/e2e/file-tree.spec.ts:700-702 (existing project convention, applied to a new trigger)
const pill = page.locator('.identity-pill');
await pill.click();
const popover = page.locator('.identity-popover');
await expect(popover).toBeVisible();
await page.keyboard.press('Escape');
await expect(popover).toBeHidden();
await expect(pill).toBeFocused();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ReviewToolbar.vue` with `aria-label` but no `role` (pre-v2.1), zero `getByRole('group')` matches in `tests/` | `role="toolbar"`/`role="group"` landmark-only pattern on `EditorTitle.vue`/`FileTree.vue`, no roving tabindex | Phases 20-21 (v2.1 workbench rebuild) | DEBT-01's original scope (`ROADMAP.md:342-349`, re-scoped 2026-09-15) targeted the now-deleted `ReviewToolbar.vue`; Phase 25 closes it against the new workbench components instead, following the pattern the rebuild already established. |

**Deprecated/outdated:**
- `ReviewToolbar.vue`'s four `aria-label`-without-`role` containers: component no longer exists (deleted during the v2.1 workbench rebuild per the ROADMAP's Phase 12 re-scope note) — DEBT-01's closure target moved to the current five regions audited here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `tests/e2e/rendered-markdown-security.spec.ts`/`anchored-review.spec.ts` flakiness is caused by cross-process `pack-runtime.mjs` lock contention (no direct STATE.md/REVIEW entry confirms this specific failure mode for these two files — only `22-REVIEW-FIX.md:64`'s "rendered-markdown-* subsystem" general observation and the lock's existence are confirmed facts; the causal link is this researcher's inference from reading the lock implementation) | Common Pitfalls, Pitfall 2 | If the real cause is something else (e.g. a genuine race in the markdown-sanitization assertions), raising `test.setTimeout` would mask a real bug rather than fix an environmental flake. Planner should verify by checking whether a failure recurs in a true single-process isolated re-run before committing to the timeout-bump fix vs. documentation path. |
| A2 | The bottom panel region ("panel tabs" in CONTEXT.md) should be queried via `getByRole('tablist', ...)` rather than forcing `toolbar`/`group` | Pattern (a), Pitfall 3 | Low risk — this is a direct, literal reading of Phase 24's locked, reviewed UI-SPEC contract (`24-UI-SPEC.md:86`, `status: approved`), not a speculative interpretation. If Phase 24 ships differently than its UI-SPEC by the time Phase 25 executes, the planner must re-check the actual shipped markup rather than trust this table. |

## Open Questions

1. **Does the bottom-panel "panel tabs" DEBT-01 target require a `toolbar`/`group` role literally, or is `tablist` an acceptable substitution?**
   - What we know: CONTEXT.md's prose lists all five regions under one `getByRole('toolbar'|'group')` clause; Phase 24's locked, approved UI-SPEC ships `role="tablist"` for that exact region.
   - What's unclear: whether CONTEXT.md's author intended "panel tabs" to literally require toolbar/group semantics (which would mean either wrapping the tablist in an *additional* outer `role="group"` landmark, or targeting some other element in the panel header entirely — e.g. a hypothetical wrapper around tablist+close-button) or used "toolbar/group" as loose shorthand for "reachable by role and name" in general.
   - Recommendation: target `getByRole('tablist', { name: 'Review panel' })` directly (Pattern a) — this is the objectively correct ARIA role for Phase 24's shipped widget and satisfies the underlying intent ("reachable by role and name") without misrepresenting the widget's keyboard model. If the planner wants belt-and-suspenders coverage of the literal "toolbar|group" phrasing, add a secondary assertion that *no* incorrect `toolbar`/`group` role was mistakenly added to that region, rather than adding one.


2. **Does CONTEXT.md's "drift transitions" outcome require an announcement when the anchor-drift state resets (unverified → verified again), or only on the transition into unverified?**
   - What we know: `App.vue:472-478`'s `watch(hasUnverifiedAnchors, ...)` only calls `announce('Some saved comment anchors cannot be verified.')` on the `hasUnverified && !hadUnverifiedAnchors` branch (transition *into* unverified); there is no `else` branch, so the reverse transition (all previously-stale/orphaned comments become verified again, e.g. by deleting or re-anchoring them) fires zero announcements today. `25-UI-SPEC.md`'s Live-Region Announcement Contract explicitly places this exact gap "Out of scope for this contract" (no locked copy), deferring the determination to "the real-Chromium measurement `25-CONTEXT.md` calls for during execution."
   - What's unclear: whether CONTEXT.md's locked "drift transitions ... exactly one announcement per outcome" phrasing treats the reverse transition as a distinct outcome needing its own announcement, or whether only the forward (into-drift) transition counts as "the" drift-transition outcome.
   - Resolution (made by the 25-05 planning pass closing the plan-checker's A11Y-02 blocker): the reverse transition is a genuine missing announcement, in scope under CONTEXT.md's general "fix duplicates or missing announcements at their source" clause — a screen-reader user who was told their anchors can't be verified has no way to learn, short of re-reading the whole page, that the anchors are fine again. `25-05-PLAN.md` Task 3 adds an `else if (!hasUnverified && hadUnverifiedAnchors)` branch to the same watcher, announcing `'Saved comment anchors are verified again.'` (matching the house style of its sibling `'Working tree changed since snapshot.'`/`'Implemented content changed.'` watcher-driven announcements), and proves it with a real-Chromium version-delta assertion in `tests/integration/anchored-workspace.spec.ts`. The `patchDrifted`/`worktreeChanged` watchers (`App.vue:479-488`) are untouched — neither RESEARCH's audit nor `25-UI-SPEC.md` flagged a reverse-transition gap for those two, and inventing one without evidence would be unscoped.
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All test/build commands | ✓ | v24.15.0 [VERIFIED: local] | — |
| npm | `npm run` scripts | ✓ | 11.12.1 [VERIFIED: local] | — |
| Playwright (`@playwright/test` + Chromium binary) | e2e specs, DEBT-01 proof spec | ✓ | 1.61.1 [VERIFIED: local `npx playwright --version`] | — |
| Vitest | unit specs, `token-contract.test.ts` | ✓ | 4.1.10 [VERIFIED: package.json] | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Security Domain

`security_enforcement` is `true` in `.planning/config.json` (`security_asvs_level: 1`), but this phase makes no change to authentication, session management, access control, input-handling, or cryptography surfaces — it adds `role`/`aria-label` markup, e2e test assertions, and rewrites a static Markdown doc. No ASVS category applies beyond what Phases 19-24 already satisfied; no new threat surface is introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no | unchanged — this phase touches no auth code |
| V3 Session Management | no | unchanged |
| V4 Access Control | no | unchanged |
| V5 Input Validation | no | unchanged — no new user input surfaces |
| V6 Cryptography | no | unchanged |

## Sources

### Primary (HIGH confidence)
- `src/web/App.vue` (direct read: lines 492-504, 1754-1768) — `announce()` signature and live-region markup [VERIFIED: direct file read]
- `src/web/components/workbench/TitleBar.vue`, `StatusBar.vue`, `EditorTitle.vue`, `FileTree.vue` (direct reads) — current role/aria-label markup per region [VERIFIED: direct file read]
- `src/web/components/workbench/IdentityPopover.vue` (direct read: lines 226-293) — Esc/focus-trap implementation [VERIFIED: direct file read]
- `tests/e2e/file-tree.spec.ts`, `tests/e2e/inline-comment-threads.spec.ts`, `tests/e2e/workbench-shell-smoke.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/helpers/open-runtime-session.ts` (direct reads) — established Playwright patterns for role assertions, Esc/focus-return, live-region version-delta, and packaged-session bootstrapping [VERIFIED: direct file read]
- `scripts/pack-runtime.mjs` (direct read: lines 1-172) — cross-process lock implementation [VERIFIED: direct file read]
- `vitest.config.ts`, `playwright.config.ts`, `playwright.runtime-artifact.config.ts`, `scripts/token-root-plugin.mjs` (direct reads) — test-runner configuration and the Vite virtual-module plugin under test [VERIFIED: direct file read]
- `tests/unit/token-contract.test.ts` (direct read: test name confirmed at line 130) [VERIFIED: direct file read]
- `.planning/phases/20-shell-frame/20-REVIEW.md` (IN-05 finding), `20-VERIFICATION.md:239`, `.planning/phases/24-bottom-panel-export/24-SUMMARY.md:84`, `23-VERIFICATION.md:85`, `.planning/phases/22-identity-status-bar/22-REVIEW-FIX.md:64` — prior-phase flakiness/role precedent evidence [VERIFIED: direct file read]
- `.planning/phases/24-bottom-panel-export/24-UI-SPEC.md` (lines 81-99, status: approved) — locked bottom-panel tablist contract [VERIFIED: direct file read]
- `DESIGN.md` (full direct read) — confirmed "review rail" at lines 36/40/48 independently of the prior dossier [VERIFIED: direct file read]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (DEBT-01 entry, Phase 25 success criteria), `.planning/config.json` [VERIFIED: direct file read]

### Secondary (MEDIUM confidence)
- `https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/` — WAI-ARIA APG Toolbar Pattern [CITED: w3.org, confirmed live via search 2026-11-05]
- `https://www.w3.org/WAI/ARIA/apg/patterns/tabs/` — WAI-ARIA APG Tabs Pattern (automatic activation) [CITED: w3.org, confirmed live via search 2026-11-05]

### Tertiary (LOW confidence)
- None — no training-data-only claims were load-bearing for this research; all package/version and behavioral claims were verified directly against the repository.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; versions confirmed directly from `package.json` and local binary.
- Architecture: HIGH — every pattern recommendation cites an already-shipped, already-tested project precedent with file:line evidence, not a novel design.
- Pitfalls: HIGH for Pitfall 1 (token-contract) — independently reproduced twice in project history with near-identical documented root cause. MEDIUM for Pitfall 2 (pack-runtime contention) — the lock mechanism and its cross-process nature are directly verified facts; the causal link to these two specific specs' historical flakiness is this researcher's grounded inference (see Assumptions Log A1), not a directly-documented 1:1 match.

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (30 days — stable, internal-codebase-grounded research; re-verify if Phase 24 ships with a materially different bottom-panel markup than its current approved UI-SPEC)
</content>
