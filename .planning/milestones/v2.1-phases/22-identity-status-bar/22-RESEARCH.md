# Phase 22: Identity & Status Bar - Research

**Researched:** 2026-11-05
**Domain:** Vue 3 SFC implementation of an in-repo title-bar "command-center" pill + CSS-anchored disclosure popover, plus a status-bar finish (counts, single emphasized item). No new library — entirely internal codebase patterns.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Design source**
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md` § Comparison identity and sketch `002-comparison-identity` variant **A**; status bar per `001-shell-layout` S2. Loopnote colour roles only.

**Pill content**
- Committed branch/worktree: `BASE main 4f2a91c → HEAD feat/x 9c03e7d`; worktree sources show the worktree's branch with a worktree glyph.
- Uncommitted: Staged `HEAD dde98eb → Staged`; Working tree `HEAD dde98eb → Working tree`; Unstaged `Index → Unstaged` (no base, per v2.0 WTREE-03).
- Agent range: `rev → rev` with a "pinned" lock glyph; exact patch: `main 4f2a91c → Exact patch`; standalone: `Standalone · N files` plus snapshot (decided at milestone definition).
- Long names: middle-truncate ref names; SHAs never truncated; full text in the pill's accessible name and in the popover. Pill stays one line within the 32px title bar.

**Drift & warnings**
- All three drift kinds — selector drift (committed refs moved), patch drift (exact patch no longer matches implemented content), worktree changed (uncommitted source changed since capture) — become a pill warning state (warning border + dot) and an explanation row in the popover. Their warning-strip notices are removed. Keep exactly one live-region announcement per transition, as today.
- Committed and exact-patch sessions cannot refresh: popover explains what moved and offers Copy plus guidance text ("Relaunch to review the new commits" / exact-patch equivalent); no Refresh button. Uncommitted and standalone sessions get Refresh as the popover's primary action ("Refresh to capture current changes").
- Captured-files-changed notice, resume-uncommitted offer, stale-anchor notice, and refresh summary stay in the editor warning strip unchanged.
- Refresh entry points: title-bar icon, popover primary button, existing ⌥⇧R; progress = 2px indeterminate bar at the top of the editor area plus "· capturing…" in the pill; completion uses the existing refresh-summary path.
- Popover: anchored below the pill, ~440px, Esc closes and returns focus to the pill, Tab cycles within; Copy copies a plain-text identity block.

**Status bar**
- Left: lock glyph + snapshot digest for snapshot sessions (uncommitted, standalone, exact patch); lock + pinned Head SHA for committed sessions.
- Comment counts: `💬 2 open · 1 stale` (stale in warning ink, singular/plural correct); zero → `💬 0`; click opens the review panel.
- Single emphasized item: "Export" for normal sessions; in agent-attached sessions "Finish review" while waiting, "Finishing…" (disabled, aria-busy) then "Finished". Hidden when export is unsupported (Phase 20 WR-05 behaviour).
- Support: plain "♡ Support" item shown only when support is enabled in the build (existing `supportEnabled` gate); never emphasized; never gates review.

### the agent's Discretion
- Component structure (`IdentityPill.vue`, `IdentityPopover.vue`, identity view-model computed from session + drift state), how existing `IdentityHeader` string logic is reused, and popover positioning implementation (no new runtime dependency).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDENT-01 | Pill centred in title bar: Base → Head with ref/SHA for committed, "Staged"/etc for uncommitted, "Exact patch", "Standalone · N files" | Identity View-Model derivation table (UI-SPEC, cited below) + `TitleBar.vue:26-69` existing discriminant computeds to port; `truncateMiddle` pattern for ref-name overflow |
| IDENT-02 | Click pill → details popover (Base/Head/merge base/snapshot+capture-time/worktree, Copy); Esc closes + returns focus | `ModalDialog.vue` focus-trap/Escape/restore-focus logic (lines cited) to copy without its backdrop/`aria-modal`; `src/contracts/api.ts` field audit (no capture-time field exists — documented deviation) |
| IDENT-03 | Warning pill state when Head/source moved; popover explains + Refresh primary; no banner steals diff height | `App.vue:1357-1366` current warning-stack `v-if`/contents to relocate into popover; `SelectorDriftNotice.vue`/`InlineNotice.vue` verbatim reuse |
| IDENT-04 | Refresh uncommitted/standalone from title bar + popover with visible progress; exact-patch states it cannot refresh | `App.vue:970-1193` `performRefresh`/`refreshBusy`/⌥⇧R binding already exists; only new progress-bar visual needed |
| STAT-01 | Snapshot ID + open-comment count (stale in warning ink) in status bar; click opens Comments tab | `App.vue:297-301` `workspaceComments`/`openCommentCount`/`hasUnverifiedAnchors` computeds — `staleCommentCount` is a one-line sibling of `hasUnverifiedAnchors` |
| STAT-02 | Exactly one emphasized item — Export or Finish review — opens Export tab | `App.vue:1317` existing `attachedLifecycle` normalization ternary, reused verbatim; `StatusBar.vue:46-53` current Export button to extend |
| STAT-03 | Voluntary-support dialog opens from plain non-emphasized item; never gates review | `StatusBar.vue:54-64` current Support button already implements this; `App.vue:1487-1491` wiring unchanged |
</phase_requirements>

## Summary

Phase 22 is a pure internal-codebase refactor/extension: two new Vue 3 SFCs (`IdentityPill.vue`, `IdentityPopover.vue`) replace `TitleBar.vue`'s inline `.session-header__comparison`/`.header-facts` markup, and `StatusBar.vue` gains a stale-comment segment and an agent-attached-aware emphasized-item label. Every piece of state the new components need — `selectorDriftStatus`, `patchDrifted`, `worktreeChanged`, `refreshBusy`, `isUncommittedSession`, `isExactPatchSession`, `isRangeSession`, `isAttachedSession`, `attachedLifecycle`, `supportEnabled`, `announce()` — already exists in `App.vue` and is already wired to `TitleBar`/`StatusBar` today (verbatim line citations below). No new HTTP endpoint, no new Zod schema, no new runtime dependency: the approved UI-SPEC explicitly scopes popover anchoring to "no new runtime dependency" and the project's own `CLAUDE.md` constraints give no justification to add one for a 440px disclosure panel.

The two genuinely new pieces of logic are (1) a pure `truncateMiddle(text, max)` string helper with no existing precedent in this codebase (closest sibling: `src/domain/path-bytes.ts`'s `controlSafeDisplay`, which is control-character escaping, not truncation) and (2) a non-modal focus-trap/outside-click popover built by copying (not importing) `ModalDialog.vue`'s `focusableSelector`/`containFocus`/focus-restore logic minus its backdrop and `aria-modal`. Both are small, self-contained, and follow patterns already established elsewhere in the repo (pure function in `src/domain/`, Vue `watch()`-based focus management in `ModalDialog.vue`).

**Primary recommendation:** Build `IdentityPill.vue` and `IdentityPopover.vue` as new files under `src/web/components/workbench/`, each deriving its own lightweight view-model `computed()` from the same four props (`session`, `selectorDriftStatus`/`driftKind` inputs, `refreshBusy`, `patchDrifted`) rather than introducing a shared composable (UI-SPEC's explicit call — ~15 lines of pure derivation duplicated across two files is cheaper than a new `composables/` module for this phase's scope); add `truncateMiddle` to `src/domain/` (not `src/web/domain/`, which does not exist — see Architecture Patterns) mirroring `path-bytes.ts`'s plain-function/no-class style, with a Vitest unit test file mirroring `tests/unit/product-identity.test.ts`'s pattern; wire both new components into `TitleBar.vue`'s existing `.titlebar__center` slot and extend `App.vue`'s existing `<TitleBar>`/`<StatusBar>` bindings (exact prop/line diffs below) rather than re-deriving any session-kind logic that already exists.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity-kind discrimination (branch/worktree/range/exact-patch/staged/unstaged/working-tree/standalone) | Browser / Client (Vue computed) | — | Pure derivation from an already-fetched `SessionResponse`; no new network call. Mirrors `TitleBar.vue:26-69`'s existing discriminant chain and `App.vue:160-173`'s session-kind computeds — this tier already owns the responsibility, Phase 22 only relocates/extends it into the new components. |
| Drift-kind unification (selector/patch/worktree → one pill state) | Browser / Client (Vue computed) | — | All three source signals (`selectorDriftStatus`, `patchDrifted`, `worktreeChanged`) are already client-side reactive state populated by existing polling (`App.vue:1126-1146,1156-1168`); Phase 22 adds a priority-ordered derivation over them, not a new data source. |
| Popover disclosure/focus-trap/outside-click | Browser / Client (Vue component + DOM listeners) | — | Purely presentational UI state (`popoverOpen` ref); no server round-trip. `ModalDialog.vue` already owns this exact responsibility for true modals — Phase 22 extracts the non-backdrop subset into the new popover. |
| Refresh trigger (title-bar icon / popover button / ⌥⇧R) | Browser / Client (emits `refresh`) → API / Backend (`sessionClient.refreshWorktreeSnapshot()`) | — | Trigger is client-side; the actual snapshot recapture is already an existing API call (`App.vue:1179`, `performRefresh`). Phase 22 adds no new entry point to the backend, only new UI surfaces that call the existing one. |
| Status-bar stale-comment count | Browser / Client (Vue computed) | — | Derived from already-fetched `workspaceComments` (`App.vue:297`); same tier, same data source as the existing `openCommentCount`/`hasUnverifiedAnchors` computeds it sits beside. |
| truncateMiddle / string formatting | Browser / Client (pure TS module in `src/domain/`) | — | `src/domain/` is the project's existing shared pure-function tier (also consumed server-side in principle, though this specific helper is UI-only); matches `path-bytes.ts`/`product-identity.ts` placement precedent. |

## Standard Stack

### Core
No new libraries. This phase extends existing Vue 3 SFCs using only already-installed dependencies.

| Library | Version (installed) | Purpose | Why Standard (for this repo) |
|---------|---------|---------|--------------|
| vue | 3.5.39 | SFC `<script setup>`, `computed`/`ref`/`watch`/`nextTick`/`useId` | Project-wide convention (`CLAUDE.md` constraint: "Vue 3 Composition API fits review state"); every sibling component (`ModalDialog.vue`, `TitleBar.vue`, `StatusBar.vue`) uses this exact API surface. |
| typescript | `@typescript/typescript6@6.0.2` (aliased) | Strict typing of the new `IdentityKind`/`DriftKind` discriminated unions | Matches existing `SessionResponse`/`SelectorDriftStatus` discriminated-union style already in `src/contracts/api.ts`. |
| vitest | 4.1.10 | Unit tests for `truncateMiddle` | Matches `tests/unit/product-identity.test.ts`'s existing plain pure-function test convention — no DOM, no component mount. |
| @playwright/test | 1.61.1 | e2e/integration locator updates for the identity pill, popover, and status-bar items | Matches existing `tests/e2e/*.spec.ts`/`tests/integration/*.spec.ts` convention. |
| vue-tsc | 3.3.14 | `npm run typecheck:web` gate | Pre-existing project gate, unchanged. |

### Supporting
None — no additional packages needed for popover positioning, focus trapping, or truncation; all are hand-rolled per the Standard Stack above and the Architecture Patterns section.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-CSS `position:absolute` popover anchoring | `@floating-ui/vue` / Popper.js | Would correctly handle viewport-edge collision at narrow widths automatically, but CONTEXT.md and UI-SPEC both lock "no new runtime dependency," and the pill is already horizontally centered via a fixed `position:absolute;left:50%` rule (`styles.css:217-226`, Phase 20), so anchoring the popover to its own `.identity-pill-host` wrapper (not the title bar) degrades correctly without JS measurement — UI-SPEC's own stated rationale for rejecting a library here. Not recommended; flagging only because it is the standard library answer to "anchored popover" in general. |
| Hand-copied `ModalDialog.vue` focus-trap logic | A shared `useFocusTrap()` composable extracted from `ModalDialog.vue` | Would reduce duplication, but UI-SPEC's Focus Management section explicitly directs "reuse ONLY `ModalDialog`'s Tab-cycling/Escape/focus-return logic... copy implementation into `IdentityPopover.vue` — not import, since `IdentityPopover` isn't built on top of `ModalDialog`'s template/backdrop." This is a locked architectural decision for this phase, not an open research question — extracting a shared composable is explicitly out of scope and would conflict with the approved contract. |

**Installation:** None — no `npm install` required for this phase.

**Version verification:** All versions above read directly from `package.json` (`vue@3.5.39`, `vite@8.1.4`, `vitest@4.1.10`, `@playwright/test@1.61.1`, `vue-tsc@3.3.14`) — already-installed, already-pinned dependencies; no registry lookup needed since nothing new is added.

## Package Legitimacy Audit

**No new packages are introduced by this phase.** CONTEXT.md and UI-SPEC.md both lock "no new runtime dependency" for the popover (CSS-only anchoring) and the truncation helper (hand-written pure function). The Package Legitimacy Gate protocol is therefore not triggered.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | No packages to audit — zero new dependencies this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ App.vue (owns all reactive state, unchanged data sources this phase) │
│                                                                       │
│  session (SessionResponse, fetched once per load)                    │
│  selectorDriftStatus (30s poll, createSelectorDriftState)            │
│  patchStatus → patchDrifted (30s poll, refreshPatchStatus)           │
│  worktreeChanged (30s poll, startWorktreeIndicator)                  │
│  refreshBusy, attachedLifecycle, workspaceComments                   │
└───────────────────────────┬───────────────────────────────────────────┘
                             │ props (unchanged shapes, new ones added)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TitleBar.vue (pure layout host — loses inline identity markup)       │
│   .titlebar__center                                                  │
│     └── IdentityPill.vue  (NEW)                                      │
│           │  internal computed: identity view-model (kind, driftKind,│
│           │  truncated labels, pillAccessibleName)                   │
│           │  @click → toggles local popoverOpen ref                  │
│           └── IdentityPopover.vue  (NEW, v-if="popoverOpen")         │
│                 │  own equivalent computed over same 4 props         │
│                 │  <SelectorDriftNotice>/<InlineNotice> reused       │
│                 │  verbatim for drift explanation rows               │
│                 │  emits: close, refresh                             │
│                 └── copies ModalDialog's focusableSelector/          │
│                     containFocus/focus-restore logic (no backdrop)   │
└─────────────────────────────────────────────────────────────────────┘
                             │ emit('refresh') bubbles to App.vue
                             ▼
                  App.vue's existing performRefresh() → sessionClient
                  .refreshWorktreeSnapshot() (UNCHANGED call, new callers)

┌─────────────────────────────────────────────────────────────────────┐
│ StatusBar.vue (extends existing props, no new data source)           │
│   statusbar__left: lock icon + identifier (digest7 | headOid7)       │
│   statusbar__right:                                                  │
│     comment-count button (open + NEW stale segment)                  │
│     emphasized item (Export | Finish review | Finishing… | Finished) │
│     Support item (UNCHANGED, gains ♡ glyph prefix)                   │
└─────────────────────────────────────────────────────────────────────┘
```

A reviewer can trace the primary IDENT-03/IDENT-04 use case end to end: `App.vue`'s existing 30s pollers mutate `selectorDriftStatus`/`patchDrifted`/`worktreeChanged` → these flow down as props into `IdentityPill.vue`'s view-model computed → the pill renders the unified warning dot/border → clicking it opens `IdentityPopover.vue`, which mounts the *same* `SelectorDriftNotice`/`InlineNotice` instances (relocated, not rewritten) and exposes Refresh/Copy/guidance → Refresh emits back up to `App.vue`'s unchanged `performRefresh()`.

### Recommended Project Structure
```
src/
├── domain/
│   └── truncate-middle.ts        # NEW — pure fn, mirrors path-bytes.ts style
├── web/
│   └── components/
│       └── workbench/
│           ├── TitleBar.vue      # MODIFIED — loses inline identity markup, gains <IdentityPill>
│           ├── StatusBar.vue     # MODIFIED — stale-count segment, emphasis-label logic
│           ├── IdentityPill.vue  # NEW
│           └── IdentityPopover.vue # NEW
tests/
├── unit/
│   └── truncate-middle.test.ts   # NEW — mirrors product-identity.test.ts
├── e2e/
│   ├── pinned-session.spec.ts        # MODIFIED locators (see Common Pitfalls)
│   ├── workbench-shell-smoke.spec.ts # MODIFIED locators + new per-kind assertions
│   ├── agent-ready-export.spec.ts    # MODIFIED locator scoping (8 call sites)
│   └── uncommitted-review.spec.ts, standalone-review.spec.ts  # likely unaffected markup-wise, verify
└── integration/
    ├── selector-drift-ui.spec.ts         # MODIFIED locator (popover-scoped)
    └── agent-ready-export-states.spec.ts # MODIFIED locator scoping (1 call site)
```

### Pattern 1: Pure-CSS self-anchored disclosure popover
**What:** Position the popover relative to its own wrapping `<div class="identity-pill-host">` (not the title bar), using `position:relative` on the host and `position:absolute;top:100%;left:50%;transform:translateX(-50%)` on the popover.
**When to use:** Any time an element that is itself centered via `position:absolute;left:50%` (as `.identity-pill` is, inherited from `.titlebar__center`, Phase 20) needs a disclosure panel anchored beneath it without JS `getBoundingClientRect()` measurement.
**Example:**
```css
/* Source: 22-UI-SPEC.md "Popover Anchoring" section, confirmed against existing
   .titlebar__center rule at src/web/styles.css:217-226 */
.identity-pill-host { position: relative; }
.identity-popover {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: var(--space-1);
  width: min(440px, calc(100vw - var(--space-4)));
}
```
Narrow-width note: `min(440px, calc(100vw - var(--space-4)))` bounds the popover's *width* to the viewport, but does not reposition it off-center — at very narrow widths (<472px, i.e. `440 + 2*16 + centering slop`) the popover can still clip at the viewport edge since it stays horizontally centered on the pill rather than clamping its own `left` offset. This is the same class of degradation the title bar's own `.titlebar__center { max-width: 56% }` already accepts at narrow widths (Phase 20); no additional edge-clamping logic is specified by CONTEXT/UI-SPEC and none should be invented — the existing `@media (max-width: 760px)` narrow-breakpoint styling already governs the whole title bar/status bar at that width (see `TitleBar.vue:239-246`, `StatusBar.vue:106-113`).

### Pattern 2: Copy (not extract) ModalDialog's focus-trap logic, minus backdrop/aria-modal
**What:** `IdentityPopover.vue` duplicates `ModalDialog.vue`'s `focusableSelector` constant and `containFocus(event)` keydown handler verbatim, and its own `watch(() => props.open, ...)` mirrors `ModalDialog.vue:74-81`'s `focusInitial()`/`restoreFocus()` pair — but with `role="dialog"` (no `aria-modal="true"`) and no backdrop `<div>`/`@click.self` handler, since the popover is a non-modal disclosure, not a true modal.
**When to use:** Any future non-modal disclosure popover in this codebase that needs Tab-cycling/Escape/focus-return but must leave the rest of the page interactive (the opposite of `ModalDialog.vue`'s blocking semantics).
**Example:**
```typescript
// Source: src/web/components/ui/ModalDialog.vue:26-72 (copy this logic verbatim into
// IdentityPopover.vue — do not import ModalDialog.vue itself, per UI-SPEC's explicit
// "not built on top of ModalDialog's template/backdrop" directive)
const focusableSelector = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"]):not(:disabled)',
].join(', ');

function containFocus(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = Array.from(panel.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
  if (controls.length === 0) return;
  const first = controls[0]!;
  const last = controls.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// NEW (not in ModalDialog, which relies on its backdrop's @click.self instead):
// outside-click close, since the popover has no backdrop element to click against.
function handleOutsideClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (panel.value?.contains(target) || triggerRef?.contains(target)) return;
  emit('close');
}
// Attach/detach via watch(() => props.open, ...) with document.addEventListener('mousedown', ...)
// on open and removeEventListener on close — mirrors ModalDialog's watch(open, ...) pattern at
// ModalDialog.vue:74-81, but adds this one extra listener ModalDialog doesn't need.
```

### Pattern 3: Middle-truncation pure function for ref names
**What:** `truncateMiddle(text: string, max = 28): string` — keeps a prefix and suffix, replaces the middle with an ellipsis, so two branches sharing a long common prefix (`feature/payments-v2` vs `feature/payments-v3`) remain visually distinguishable, unlike end-truncation which would render both as `feature/payments-v…`.
**When to use:** Any UI label where two concurrently-displayed values can share a long common prefix and disambiguating suffix matters (this phase's `BASE`/`HEAD` ref labels specifically — CONTEXT's explicit rationale for choosing "middle-truncate" over CSS end-ellipsis).
**Example:**
```typescript
// NEW file: src/domain/truncate-middle.ts — no existing precedent in this codebase;
// closest sibling is src/domain/path-bytes.ts's controlSafeDisplay (control-char escaping,
// not truncation) which establishes the plain-exported-function, no-class style to follow.
export function truncateMiddle(text: string, max = 28): string {
  if (max < 1) return '';
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max); // max === 1: no room for an ellipsis
  // Reserve 1 char for the ellipsis; split the remaining budget, favoring the prefix by
  // one char on odd budgets (matches common middle-truncation convention: more context
  // up front). Use Array.from for codepoint-safety so combining marks / astral characters
  // (e.g. emoji in a worktree path) are not split mid-codepoint.
  const chars = Array.from(text);
  if (chars.length <= max) return text; // length check above is UTF-16 code units; re-check in codepoints
  const budget = max - 1;
  const headLen = Math.ceil(budget / 2);
  const tailLen = Math.floor(budget / 2);
  return `${chars.slice(0, headLen).join('')}…${chars.slice(chars.length - tailLen).join('')}`;
}
```
Edge cases to cover in `tests/unit/truncate-middle.test.ts` (mirroring `product-identity.test.ts`'s `describe`/`test.each` style):
- `text.length <= max` → returned unchanged (no ellipsis added even if `text.length === max`).
- `max` at or near 0/1 (CONTEXT does not specify behavior here; recommend: `max < 1` → `''`, `max === 1` → single truncated character, no ellipsis, since an ellipsis alone would exceed budget).
- Multi-byte/combining-mark safety: a string containing an astral-plane emoji (e.g. a worktree path with `📁`) or combining diacritics must not be split mid-codepoint — `Array.from(text)` (not `.slice()` on the raw string) iterates by codepoint, matching the same codepoint-safety concern `path-bytes.ts:24` already handles with `for (const character of value)`.
- A string exactly `max + 1` long (smallest input that must truncate) produces a result of length `max` (ellipsis counted).
- The default `max = 28` param is a sensible default but the real call site should pass an explicit value if UI-SPEC's per-field widths differ; confirm against the final markup in `IdentityPill.vue` rather than assuming 28 applies uniformly to every `.identity-pill__ref` usage.

### Pattern 4: Discriminated-union view-model computed over `SessionResponse`
**What:** A single internal `computed()` returning a discriminated-`kind` object (`'branch' | 'worktree' | 'range' | 'exact-patch' | 'staged' | 'unstaged' | 'working-tree' | 'standalone'`), re-deriving the exact same conditions `TitleBar.vue:26-36` and `App.vue:160-173` already use — not inventing new session-shape branching.
**When to use:** Both `IdentityPill.vue` and `IdentityPopover.vue` need this same derivation (UI-SPEC explicitly rejects a shared composable for 4 props / ~15 lines, duplicate it).
**Example:**
```typescript
// Source: existing conditions at src/web/components/workbench/TitleBar.vue:26-36 and
// src/web/App.vue:160-174 — port verbatim, do not re-derive from scratch.
const isExactPatch = computed(() => 'patch' in props.session);
const pinnedSession = computed(() => ('base' in props.session ? props.session : undefined));
const isRange = computed(() => pinnedSession.value?.range?.kind === 'revisions');
const uncommittedKey = computed(() =>
  'uncommitted' in props.session
    ? (props.session as Extract<SessionResponse, { uncommitted: unknown }>).uncommitted
    : undefined,
);
const isStandalone = computed(() => uncommittedKey.value?.sourceKind === 'standalone');
const isWorktreeKind = computed(() =>
  pinnedSession.value !== undefined
  && !isRange.value
  && (pinnedSession.value.base.worktree !== undefined || pinnedSession.value.head.worktree !== undefined),
);
```

### Anti-Patterns to Avoid
- **Re-deriving session-kind logic from scratch instead of porting `TitleBar.vue`'s existing conditions:** The existing discriminant chain (`isExactPatch` → `isStandalone` → `isUncommitted` → else-committed) was already verified correct across all 5+ session kinds in Phase 20's VERIFICATION.md (truth #10, #24-25: 5/5 per-kind smoke tests). Writing new, differently-shaped conditions risks silently diverging from the server contract documented in `src/contracts/api.ts`.
- **Introducing a shared `composables/useIdentity.ts` for the view-model:** Explicitly rejected by UI-SPEC ("duplicating ~15 lines pure derivation across two files preferable new `composables/` file for phase's scope"). This is a locked architectural choice for this phase, not an open question.
- **Inventing fields not in `SessionResponseSchema`:** The approved UI-SPEC already audited `src/contracts/api.ts` and documented three deviations from the sketch's fictional data (no exact-patch base ref/SHA, no snapshot capture-time field, no "Produced by"/agent-name field) — see Common Pitfalls below. Do not re-introduce sketch-only fields during implementation.
- **Using `@floating-ui` or any positioning library:** Locked "no new runtime dependency" constraint; see Alternatives Considered.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap / Tab-cycling / Escape-to-close | A new generic a11y focus-trap utility | Copy `ModalDialog.vue:26-72`'s `focusableSelector`/`containFocus` logic verbatim (UI-SPEC's explicit directive) | Already implemented, already battle-tested across every existing modal (`SupportDialog.vue`, `ChangedFilesDialog`), and reusing the identical selector list avoids a second, possibly-inconsistent definition of "what counts as focusable" in the same codebase. |
| Drift-kind priority logic (which of 3 signals wins when multiple could theoretically be true) | New independent per-kind boolean flags | The single `driftKind` priority-ordered value UI-SPEC specifies (`patchDrifted ? 'patch' : selector-changed ? 'selector' : worktreeChanged ? 'worktree' : undefined`), restructuring the *exact* condition `App.vue:1358` already gates its warning-stack `v-if` on | UI-SPEC confirms server invariants make these mutually exclusive per live session (exact-patch sessions never get `selectorDriftStatus`; only `isUncommittedSession` gets `worktreeChanged`) — building new independent flags risks representing an impossible combined state. |
| Live-region announcement de-duplication | A new "announce once" utility/composable | The existing `let had<X> = false; watch(x, (val) => { if (val && !had<X>) announce(...); had<X> = val; });` latch pattern already used 2× in `App.vue` (`hadPatchDrift` at line 337-341) | Exact same boolean-latch idiom needed for the new worktree-changed announcement (UI-SPEC specifies this literally, including the variable name pattern); a new abstraction would be inconsistent with the two existing instances in the same file. |

**Key insight:** Nearly every piece of "logic" this phase needs already exists somewhere in `App.vue`/`TitleBar.vue`/`ModalDialog.vue`/`SelectorDriftNotice.vue` — the phase is overwhelmingly a *relocation and composition* exercise (move existing computeds/markup into two new components, reuse existing child components inside a new container), not new business logic. The only genuinely new code is `truncateMiddle` and the popover's non-modal focus/outside-click wiring.

## Common Pitfalls

### Pitfall 1: Pluralization bugs in count copy
**What goes wrong:** A count-driven string hardcodes a plural noun ("N open comments") without the `n === 1 ? '' : 's'` guard, producing "1 open comments."
**Why it happens:** Easy to miss when porting/adapting an existing string; happened once already in this exact file.
**How to avoid:** Phase 22's new comment-count format (`💬 {open} open · {stale} stale`) uses invariant adjectives ("open"/"stale"), not counted nouns — UI-SPEC explicitly calls this out as avoiding the bug class entirely ("No noun is pluralized... trivially avoids Phase 20's UI-REVIEW pluralization bug"). If any new string in this phase *does* need a plural noun, use the project's established idiom verbatim: `{{ n === 1 ? '' : 's' }}` (seen at `App.vue:1375` `capturedFilesChanged`, `RefreshSummaryPanel.vue:67,70`, and the `StatusBar.vue:44` post-fix version).
**Warning signs:** Any new template string containing a bare noun immediately after an interpolated count.
**Provenance:** [VERIFIED: codebase grep — `20-UI-REVIEW.md` "Top 3 Fix #3", confirmed fixed in `StatusBar.vue` git history per `20-VERIFICATION.md` §4]

### Pitfall 2: Missing overflow-guard CSS on new text-bearing nodes inside a flex ancestor without `min-width:0`
**What goes wrong:** A new pill/popover text span wraps or overflows its fixed-height row (32px title bar), colliding with the row below, because neither the span nor its flex ancestor chain has the 4-property truncation guard.
**Why it happens:** `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` alone does nothing without `min-width:0` on every flex ancestor up to the row — a flex item's default `min-width:auto` lets it grow past its container instead of shrinking/truncating.
**How to avoid:** Every text-bearing node inside `IdentityPill.vue` MUST carry the exact four-property block already established at `.attached-fact` (`src/web/styles.css:1911-1919`: `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;`) and already used by `.session-header__selector` (`styles.css:310-313`); `.titlebar__center` already has `min-width:0` (Phase 20, `styles.css:217-226`) and needs no change, but any *new* intermediate flex wrapper (e.g. `.identity-pill-host`, `.identity-pill__endpoint`) introduced by the new markup must also carry `min-width:0` or the guard breaks silently.
**Warning signs:** A long branch/worktree name visually wrapping to a second line, or the title bar growing taller than `var(--titlebar-height)` (32px) in a screenshot at any of the three standard review widths (1280/1600/1920).
**Provenance:** [VERIFIED: codebase grep — `20-UI-REVIEW.md` "Post-review fix #2", root cause and fix both read directly from `styles.css:1909-1919`; UI-SPEC's "Truncation Rule" section names this exact prior bug]

### Pitfall 3: Duplicate affordances for one action
**What goes wrong:** Two differently-labeled, simultaneously-visible controls bind the same underlying action/state, confusing keyboard/screen-reader users navigating by accessible name.
**Why it happens:** Happened once already in Phase 20 (title-bar sidebar-toggle icon vs. editor-title text button, both bound `panelState.sidebarVisible`).
**How to avoid for Phase 22 specifically:** The status bar's new emphasized item shares the literal accessible name **"Finish review"** with `BottomPanel.vue`'s existing `attached-completion__action` button while `attachedLifecycle === 'waiting'` — UI-SPEC explicitly documents this as an *intentional*, not accidental, duplication (two legitimate entry points to the same panel action, same pattern as Refresh having 3 legitimate entry points per IDENT-04), and flags the exact 8 e2e call sites (`agent-ready-export.spec.ts:666,669,725,732,788,891,932,985`) plus 1 integration call site (`agent-ready-export-states.spec.ts:36`) that MUST be scoped (`.locator('.statusbar')` vs the panel's `getByRole('region', { name: 'Finish attached review' })`) to disambiguate — not deduplicated. Do not "fix" this by hiding one of the two buttons; that would contradict STAT-02's explicit requirement that the status bar always show the single emphasized item.
**Warning signs:** A Playwright locator for `'Finish review'` throwing a strict-mode "resolved to 2 elements" error after this phase lands — that is expected and the fix is scoping the locator, not removing a button.
**Provenance:** [VERIFIED: codebase grep — `20-UI-REVIEW.md` Top-3-Fix #2 (prior incident, different buttons) + UI-SPEC's own Locator table row for this phase's intentional duplication, cross-checked against the literal line numbers in `tests/e2e/agent-ready-export.spec.ts`]

### Pitfall 4: `aria-live` announcement firing more than once per transition
**What goes wrong:** A `watch()` on a boolean/derived drift value calls `announce()` on every reactive update, not just the false→true transition, spamming the live region.
**Why it happens:** Forgetting the boolean-latch guard and calling `announce()` directly inside the watcher body whenever the watched value is truthy.
**How to avoid:** Follow the exact existing pattern at `App.vue:337-341` (`let hadPatchDrift = false; watch(patchDrifted, (drifted) => { if (drifted && !hadPatchDrift) announce(...); hadPatchDrift = drifted; });`) for the new worktree-changed announcement UI-SPEC specifies — a second instance of the identical idiom, not a new mechanism. No new announcement should be added for refresh start/stop (UI-SPEC: "No announcement added refresh start/stop... not requested, CONTEXT would add unrequested fourth announcement").
**Warning signs:** A live-region test asserting exactly one announcement per transition failing with multiple captured messages.
**Provenance:** [VERIFIED: codebase grep — `App.vue:337-341` read directly; UI-SPEC § "Drift explanation"/announcement table cites this exact pattern for the new signal]

### Pitfall 5: Reintroducing sketch-only fields that don't exist in the real schema
**What goes wrong:** Implementing the popover's "Snapshot (+ capture time)" or exact-patch "Produced by" rows literally as the design sketch shows them, because `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md`'s ASCII diagram includes them, when `src/contracts/api.ts` has no such fields.
**Why it happens:** The sketch (and its HTML prototype) uses fictional demo data; the UI-SPEC's "Data-grounding deviations" sections already resolved this, but an implementer re-reading only the sketch (not the approved UI-SPEC) could reintroduce it.
**How to avoid:** `ExactPatchSessionResponseSchema` (`src/contracts/api.ts:409-424`) has no base ref/SHA field at all and no timestamp anywhere in the schema (`reviewKey`/`digest` are content-addressed hashes, `src/contracts/api.ts:414-415`); `AttachedSessionMarkerSchema` (`src/contracts/api.ts:370-372`) is `{ kind: 'agent-review' }` only, no producer/agent-name field. UI-SPEC's approved substitutions: Snapshot row shows digest only (no time); exact-patch popover substitutes a "Validated against" row showing `validationTarget.kind` (`'repository'`/`'worktree'`) instead of "Produced by."
**Warning signs:** A popover row binding to a property that doesn't typecheck against `SessionResponse`/`ExactPatchSessionResponseSchema` — `npm run typecheck:web` will catch this at compile time if the Zod-inferred types are used correctly (do not widen with `any`/`as` to work around a missing field).
**Provenance:** [VERIFIED: codebase grep — `src/contracts/api.ts:369-424` read directly, field-by-field]

## Code Examples

### Existing App.vue computeds to reuse verbatim (exact current signatures)
```typescript
// Source: src/web/App.vue — already-wired reactive state, no changes needed to these
// themselves; only new TitleBar/StatusBar props need to be threaded through.
const patchStatus = shallowRef<PatchStatusResponse>();            // App.vue:108
const selectorDriftStatus = shallowRef<SelectorDriftResponse>();  // App.vue:113
const attachedLifecycle = ref<AttachedLifecycle>('ordinary');     // App.vue:114
const worktreeChanged = ref(false);                               // App.vue:122
const refreshBusy = ref(false);                                   // App.vue:123

const isExactPatchSession = computed(() => exactPatchSession.value !== undefined); // App.vue:166
const isUncommittedSession = computed(() => session.value !== undefined && 'uncommitted' in session.value); // App.vue:167
const isStandaloneSession = computed(() => uncommittedSession.value?.sourceKind === 'standalone'); // App.vue:173
const isRangeSession = computed(() => pinnedSession.value?.range?.kind === 'revisions');  // App.vue:215
const isAttachedSession = computed(() => session.value?.attached?.kind === 'agent-review'); // App.vue:303
const supportEnabled = computed(() => session.value?.support?.enabled === true);  // App.vue:204
const patchDrifted = computed(() => patchStatus.value?.kind === 'drifted');       // App.vue:207
const workspaceComments = computed(() => workspaceState.value?.comments ?? []);   // App.vue:297
const openCommentCount = computed(() => workspaceComments.value.filter((c) => c.state === 'open').length); // App.vue:298
const hasUnverifiedAnchors = computed(() =>
  workspaceComments.value.some((c) => c.status === 'stale' || c.status === 'orphaned'),
); // App.vue:299-301 — SAME condition STAT-01's new staleCommentCount must filter on

function announce(message: string): void {  // App.vue:347-350
  liveMessage.value = message;
  liveMessageVersion.value += 1;
}

async function performRefresh(): Promise<void> { /* App.vue:1170-1193, UNCHANGED */ }
```

### New staleCommentCount computed (one-line sibling, exact placement)
```typescript
// Add immediately after openCommentCount (App.vue:298) and hasUnverifiedAnchors (App.vue:299-301) —
// same filter condition as hasUnverifiedAnchors, just counted instead of booleaned.
const staleCommentCount = computed(() =>
  workspaceComments.value.filter((c) => c.status === 'stale' || c.status === 'orphaned').length,
);
```

### Current TitleBar/StatusBar wiring block to extend (App.vue:1313-1326, 1480-1492)
```html
<!-- Source: src/web/App.vue:1313-1326 — existing TitleBar wiring; add identity/drift props,
     remove worktree-changed (folded into IdentityPill's own driftKind derivation) -->
<TitleBar
  ref="titleBar"
  :session="session"
  :attached-lifecycle="isAttachedSession ? (attachedLifecycle === 'finishing' || attachedLifecycle === 'completed' ? attachedLifecycle : 'waiting') : undefined"
  :refresh-busy="refreshBusy"
  :show-refresh="isUncommittedSession"
  :worktree-changed="worktreeChanged"
  :sidebar-visible="panelState.sidebarVisible.value"
  :panel-open="panelOpen"
  @refresh="performRefresh"
  @toggle-sidebar="toggleSidebar"
  @toggle-panel="togglePanel"
/>

<!-- Source: src/web/App.vue:1481-1492 — existing StatusBar wiring; add stale-count prop,
     replace snapshot-label with new identifier derivation per UI-SPEC's Status Bar matrix -->
<StatusBar
  ref="statusBar"
  :session="session"
  :snapshot-label="snapshotLabel"
  :export-supported="!isUncommittedSession || isStandaloneSession"
  :open-comment-count="openCommentCount"
  :support-enabled="supportEnabled"
  :support-inert="supportDialogOpen"
  :support-open="supportDialogOpen"
  @open-panel="openPanel"
  @support="openSupportDialog"
/>
```

### Current warning-stack block to relocate from (App.vue:1357-1366)
```html
<!-- Source: src/web/App.vue:1357-1366 — the v-if gate and two notices that move INTO
     IdentityPopover.vue per IDENT-03; everything else in this section (StaleAnchorNotice,
     captured-files-changed InlineNotice, resume-uncommitted-offer InlineNotice,
     RefreshSummaryPanel) stays in the editor warning strip UNCHANGED per CONTEXT's keep-list. -->
<section
  v-if="patchDrifted || hasUnverifiedAnchors || selectorDriftStatus?.base.kind !== 'unchanged' || selectorDriftStatus?.head.kind !== 'unchanged' || (capturedFilesChanged > 0 && !dismissedCaptureBanner) || refreshSummary !== undefined || (recoveryAvailable && !recoveryOfferDismissed)"
  class="shell-warning-stack"
>
  <InlineNotice v-if="patchDrifted" tone="error">            <!-- REMOVE from here, relocate verbatim into popover -->
    <h2>Implemented content changed</h2>
    <p>{{ `The repository or worktree no longer matches this exact patch. The frozen review remains readable, but ${RENAME_MAP.displayName} will not substitute current content. Relaunch with a patch that matches the current implementation.` }}</p>
  </InlineNotice>
  <SelectorDriftNotice :drift="selectorDriftStatus" />         <!-- REMOVE from here, relocate verbatim into popover -->
  <StaleAnchorNotice v-if="hasUnverifiedAnchors" />            <!-- STAYS -->
  <!-- capturedFilesChanged / recoveryAvailable InlineNotice blocks, RefreshSummaryPanel: STAY, unchanged -->
</section>
```
Note: when relocating `InlineNotice v-if="patchDrifted"` and `SelectorDriftNotice`, the `v-if` guard on the surrounding `<section class="shell-warning-stack">` must be updated to drop `patchDrifted` and the `selectorDriftStatus` terms from its condition (those two notices no longer render there at all) while leaving the remaining terms (`hasUnverifiedAnchors`, `capturedFilesChanged`, `refreshSummary`, `recoveryAvailable`) untouched.

### Icon-button accessible-name convention already established (reuse for new popover-trigger pattern)
```html
<!-- Source: src/web/components/workbench/TitleBar.vue:166-178 — existing refresh icon button;
     the new title-bar refresh ENTRY POINT (IDENT-04's "title-bar icon") should follow this
     same dual title+aria-label convention, consistent with the sidebar/panel icon buttons in
     the same file, rather than introducing UiTooltip.vue (used only in EditorTitle.vue, a
     sibling-but-different component with a different toolbar convention). -->
<button
  type="button"
  class="identity-disclosure"
  :aria-busy="refreshBusy"
  :disabled="refreshBusy"
  :title="'Refresh snapshot · Alt+Shift+R'"
  aria-label="Refresh snapshot"
  @click="emit('refresh')"
>
```

### Vitest pure-function test convention to mirror
```typescript
// Source: tests/unit/product-identity.test.ts (full file read) — this is the ONLY existing
// precedent in this repo for testing a pure string-transform function in src/domain/.
// No Vue Test Utils / component-mount precedent exists anywhere in the repo for
// TitleBar.vue/StatusBar.vue — this codebase tests Vue components exclusively through
// Playwright e2e/integration specs, not unit-level component mounts. Do not introduce a
// new @vue/test-utils dependency for this phase; follow the existing split (pure logic →
// Vitest unit test; rendered behavior → Playwright e2e).
import { describe, expect, test } from 'vitest';
import { truncateMiddle } from '../../src/domain/truncate-middle.js';

describe('truncateMiddle', () => {
  test('returns the string unchanged when at or under the max length', () => {
    expect(truncateMiddle('main', 28)).toBe('main');
  });
  test.each([
    ['feature/payments-processing-v2', 20],
  ])('truncates %j to fit within %i characters including the ellipsis', (input, max) => {
    const result = truncateMiddle(input, max);
    expect(result.length).toBeLessThanOrEqual(max);
    expect(result).toContain('…');
  });
});
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `truncateMiddle`'s edge-case behavior at `max < 2` (no room for prefix+ellipsis+suffix) is left to implementer discretion since neither CONTEXT.md nor UI-SPEC.md specifies it — recommended fallback: `max < 1` → `''`, `max === 1` → single character, no ellipsis | Code Examples, Pattern 3 | Low — this only matters for pathologically small `max` values the real call sites (pill ref labels, likely `max≈24-28`) will never pass; a planner/implementer choosing a different fallback does not violate any locked decision. |

**All other claims in this research are `[VERIFIED: codebase grep]`** — every line-number citation above was read directly from the live repository state during this research session (not from training data or external sources), and every architectural/copy decision cited from CONTEXT.md/UI-SPEC.md was quoted from the actual approved files in `.planning/phases/22-identity-status-bar/`.

## Open Questions (RESOLVED)

None blocking. The approved UI-SPEC is unusually exhaustive (exact markup, exact copy, exact locator diffs) and leaves only two items genuinely at implementer discretion, both already resolved above with a recommendation:
1. **Exact `max` parameter value(s) passed to `truncateMiddle` per pill field** — UI-SPEC names the function and its purpose but the per-field character budget is implementation detail; recommend starting from the design sketch's visual proportions (pill stays one line in a 32px bar) and adjusting empirically against the three standard review widths (1280/1600/1920), matching Phase 20's own verification methodology (`20-VERIFICATION.md` truth #16, #27).
2. **Whether the title-bar refresh icon uses `UiTooltip.vue` or the plain `title`/`aria-label` pattern** — recommend the plain pattern (Code Examples, "Icon-button accessible-name convention") since it is `TitleBar.vue`'s own established in-file convention (sidebar/panel buttons) and `UiTooltip` has never been used in this file; either choice is a11y-equivalent and neither is locked by CONTEXT/UI-SPEC.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high` (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase adds no auth surface; session access control unchanged from Phase 20 (local-only Fastify server, `127.0.0.1` binding, per `CLAUDE.md` constraints). |
| V3 Session Management | No | No new session state; reuses existing `SessionResponse` already fetched once per page load. |
| V4 Access Control | No | No new API route, no new authorization check — the popover/pill render data already present in the already-authorized session payload. |
| V5 Input Validation | Yes (indirect) | Ref names, branch labels, and worktree paths rendered inside `IdentityPill.vue`/`IdentityPopover.vue` originate from Git ref names and filesystem paths, which can contain arbitrary bytes. The project's existing `controlSafeDisplay()` (`src/domain/path-bytes.ts:22-44`) is the standard control for this: it escapes control characters (`\t`, `\n`, `\r`, C0/C1 ranges) before display. `TitleBar.vue`'s current identity markup already wraps every label/oid through `controlSafeDisplay(...)` (`TitleBar.vue:45-69`) — the new `IdentityPill.vue`/`IdentityPopover.vue` MUST continue wrapping every interpolated ref/path/label string the same way, not bypass it by binding raw `session.base.label` etc. directly. |
| V6 Cryptography | No | No new cryptographic operation; `reviewKey`/`digest` display is read-only rendering of already-server-computed SHA-256 hex digests (`src/contracts/api.ts:414-415,434`), no client-side hashing introduced. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via unescaped ref-name/path interpolation in new template bindings | Tampering / Information Disclosure | Vue 3's default `{{ }}` interpolation auto-escapes HTML (no `v-html` anywhere in the existing `TitleBar.vue`/`StatusBar.vue`, and none should be introduced in `IdentityPill.vue`/`IdentityPopover.vue`); combined with `controlSafeDisplay()` for control-character safety (V5 above), this is the existing, sufficient, two-layer mitigation already proven across Phase 20's identical identity-rendering surface. No new sanitization library is needed or justified. |
| Clipboard-write abuse (new `copyIdentity()` footer action) | — (not a realistic threat here) | `navigator.clipboard.writeText()` is already used identically by `SelectorDriftNotice.vue:35` (`copyPinnedCommit`) for the same class of data (short OIDs/labels); the new popover's Copy button follows the exact same call pattern with a `.catch()` fallback message, not a new clipboard-access pattern. |

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every version cited read directly from the installed `package.json`.
- Architecture: HIGH — every pattern cited is an existing, already-shipped pattern in this exact codebase with file:line citations, not inferred from general Vue best practice.
- Pitfalls: HIGH — four of five pitfalls are documented regressions from Phase 20's own `UI-REVIEW.md`/`VERIFICATION.md` for this same component family; the fifth (sketch-schema mismatch) is directly verified against `src/contracts/api.ts`.

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (30 days — stable internal codebase research, no external library/API surface to go stale; re-verify only if `App.vue`/`TitleBar.vue`/`StatusBar.vue`/`src/contracts/api.ts` change materially before planning begins, e.g. if Phase 21's concurrent file-tree work touches shared files)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing versions read from `package.json`
- Architecture: HIGH — every pattern has a direct file:line citation in the live repo
- Pitfalls: HIGH — sourced from this project's own prior-phase UI-REVIEW/VERIFICATION reports for the identical component family, plus a direct schema diff

**Research date:** 2026-11-05
**Valid until:** 2026-12-05
</content>
