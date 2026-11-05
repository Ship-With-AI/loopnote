# Phase 22: Identity & Status Bar - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Phase 20's interim plain-text identity with the title-bar comparison pill and details popover, move all three drift signals into the pill, and finish the status bar (snapshot/pinned-head item, open/stale counts, the single emphasized Export / Finish review item, plain Support item). Requirements: IDENT-01..04, STAT-01..03.

Not in this phase: panel tabs Comments/Summary/Export (Phase 24 — status-bar items open the existing interim panel and, once Phase 24 lands, the right tab), inline threads (Phase 23), tree (Phase 21).

</domain>

<decisions>
## Implementation Decisions

### Design source
- `.kimi-code/skills/sketch-findings-loopnote/references/workbench-shell.md` § Comparison identity and sketch `002-comparison-identity` variant **A**; status bar per `001-shell-layout` S2. Loopnote colour roles only.

### Pill content
- Committed branch/worktree: `BASE main 4f2a91c → HEAD feat/x 9c03e7d`; worktree sources show the worktree's branch with a worktree glyph.
- Uncommitted: Staged `HEAD dde98eb → Staged`; Working tree `HEAD dde98eb → Working tree`; Unstaged `Index → Unstaged` (no base, per v2.0 WTREE-03).
- Agent range: `rev → rev` with a "pinned" lock glyph; exact patch: `main 4f2a91c → Exact patch`; standalone: `Standalone · N files` plus snapshot (decided at milestone definition).
- Long names: middle-truncate ref names; SHAs never truncated; full text in the pill's accessible name and in the popover. Pill stays one line within the 32px title bar.

### Drift & warnings
- All three drift kinds — selector drift (committed refs moved), patch drift (exact patch no longer matches implemented content), worktree changed (uncommitted source changed since capture) — become a pill warning state (warning border + dot) and an explanation row in the popover. Their warning-strip notices are removed. Keep exactly one live-region announcement per transition, as today.
- Committed and exact-patch sessions cannot refresh: popover explains what moved and offers Copy plus guidance text ("Relaunch to review the new commits" / exact-patch equivalent); no Refresh button. Uncommitted and standalone sessions get Refresh as the popover's primary action ("Refresh to capture current changes").
- Captured-files-changed notice, resume-uncommitted offer, stale-anchor notice, and refresh summary stay in the editor warning strip unchanged.
- Refresh entry points: title-bar icon, popover primary button, existing ⌥⇧R; progress = 2px indeterminate bar at the top of the editor area plus "· capturing…" in the pill; completion uses the existing refresh-summary path.
- Popover: anchored below the pill, ~440px, Esc closes and returns focus to the pill, Tab cycles within; Copy copies a plain-text identity block.

### Status bar
- Left: lock glyph + snapshot digest for snapshot sessions (uncommitted, standalone, exact patch); lock + pinned Head SHA for committed sessions.
- Comment counts: `💬 2 open · 1 stale` (stale in warning ink, singular/plural correct); zero → `💬 0`; click opens the review panel.
- Single emphasized item: "Export" for normal sessions; in agent-attached sessions "Finish review" while waiting, "Finishing…" (disabled, aria-busy) then "Finished". Hidden when export is unsupported (Phase 20 WR-05 behaviour).
- Support: plain "♡ Support" item shown only when support is enabled in the build (existing `supportEnabled` gate); never emphasized; never gates review.

### Claude's Discretion
- Component structure (`IdentityPill.vue`, `IdentityPopover.vue`, identity view-model computed from session + drift state), how existing `IdentityHeader` string logic is reused, and popover positioning implementation (no new runtime dependency).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 20 `components/workbench/TitleBar.vue` (interim identity text, refresh/toggles), `StatusBar.vue` (snapshot, open count, Export, Support; emits `openPanel`, `support`), `WorkbenchShell.vue`, `BottomPanel.vue`.
- `App.vue`: `selectorDriftStatus` + `createSelectorDriftState` (polling), `patchStatus`/`patchDrifted` (+ `announce('Implemented content changed.')`), `worktreeChanged` (30s poll), `performRefresh`, `refreshBusy`, `isUncommittedSession`, `isExactPatchSession`, `isRangeSession`, `isAttachedSession`, `attachedLifecycle`, `supportEnabled`.
- `SelectorDriftNotice.vue`, `InlineNotice.vue`, `components/ui/ModalDialog.vue` focus-return pattern.

### Established Patterns
- Single live-region owner per outcome; Esc + focus return for overlays; same-phase locator updates; typecheck and verify:semantic-css gates.

### Integration Points
- Specs asserting drift notices, identity text, refresh, Finish, Support: `selector-drift-ui.spec.ts`, `uncommitted-review.spec.ts`, `standalone-review.spec.ts`, `agent-ready-export*.spec.ts`, `support-*.spec.ts`, `pinned-session.spec.ts`, `workbench-shell-smoke.spec.ts`.

</code_context>

<specifics>
## Specific Ideas

- Reference: `.planning/sketches/002-comparison-identity/index.html` tab A with state tabs Branches / Staged / Exact patch / Head drifted / Refreshing; standalone variant not sketched (decided above).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
