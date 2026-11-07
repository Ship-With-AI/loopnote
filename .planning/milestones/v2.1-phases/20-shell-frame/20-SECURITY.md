---
phase: 20
slug: shell-frame
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-05
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser `localStorage` ↔ Vue reactive layout state | Untrusted persisted JSON string crosses into typed, in-memory panel dimensions/visibility | `panel-state.ts` `parsePanelState` → `PanelState` refs (T-20-01, T-20-02) |
| Monaco editor instance ↔ global action registry | Per-instance action registrations cross into Monaco's internal id-keyed registry, shared across base/head/single-pane editors | `diff-adapter.ts` `addAction` calls (T-20-03) |
| Session/path data model ↔ DOM text rendering | Already-validated session identity and file-path strings cross into rendered DOM text nodes | `TitleBar.vue`/`StatusBar.vue`/`Breadcrumbs.vue` interpolation (T-20-04, T-20-05) |
| Pointer input ↔ layout dimension state | Raw pointer coordinates cross into committed sidebar-width/panel-height values that drive CSS grid/flex layout | `useSash.ts` `clampAxisValue`, `WorkbenchShell.vue` sash handlers (T-20-06) |
| Vue reactive visibility prop ↔ Teleport-hosted DOM subtree | Sidebar-visible boolean toggling crosses into a `Teleport` target host without unmounting the teleported tree | `WorkbenchShell.vue` `#changed-files` host, `App.vue` `toggleSidebar()` (T-20-07, T-20-09) |
| Modal lifecycle ↔ always-mounted panel region | The review surface crosses from a focus-trapped modal contract to a non-modal, always-present region | `BottomPanel.vue`, `anchored-workspace.spec.ts` (T-20-08, T-20-13) |
| Global keydown listener ↔ local UI-visibility toggles | Keyboard chords cross from the document-level handler into local, non-privileged panel/sidebar toggles | `App.vue` `handleKeydown` ⌘B/⌘J branches (T-20-10) |
| Implementation changes ↔ regression test assertions | Structural/selector changes cross into the test suite's locators and run-command inclusion, where a drifted or deleted assertion can silently stop proving a behavior | `review-notes-dialog`/`selector-drift-ui`/`anchored-review` specs, `package.json` `test:runtime-artifact` (T-20-11, T-20-12 (20-08), T-20-12 (20-09), T-20-14, T-20-15) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-20-01 | Tampering | `panel-state.ts` `parsePanelState` | mitigate | `src/web/model/panel-state.ts:59-80` — try/catch around `JSON.parse`, object/array/null shape guard, per-field `typeof` checks each independently falling back to `defaultPersistedPanelState()` | closed |
| T-20-02 | Information Disclosure | `panel-state.ts` persisted schema | accept | `src/web/model/panel-state.ts:48-52` — `PersistedPanelState` interface has exactly `sidebarWidth: number`, `sidebarVisible: boolean`, `panelHeight: number`; no token/path/content fields | closed |
| T-20-03 | Denial of Service (local) | `diff-adapter.ts` `addAction` ids | mitigate | `src/web/monaco/diff-adapter.ts:188,194,200,206,...` — every `addAction` id built as `` `${RENAME_MAP.kindPrefix}.<action>-base/-head` `` | closed |
| T-20-04 | Information Disclosure | `TitleBar.vue`/`StatusBar.vue` session-kind text | accept | `src/web/components/workbench/TitleBar.vue` and `StatusBar.vue` — all session text rendered via `{{ }}` interpolation, zero `v-html` occurrences | closed |
| T-20-05 | Tampering | `Breadcrumbs.vue` path-segment rendering | accept | `src/web/components/workbench/Breadcrumbs.vue:13-19` — `{{ segment }}` interpolation only, no `v-html` | closed |
| T-20-06 | Denial of Service (local) | `useSash.ts` clamp math | mitigate | `src/web/composables/useSash.ts:9-11,55` — `clampAxisValue(value, min, max)`; `onPointermove` writes `options.value.value = clampAxisValue(startValue + delta, options.min, options.max)` | closed |
| T-20-07 | Elevation of Privilege (focus trapping) | `WorkbenchShell.vue` `#changed-files` Teleport host | mitigate | `src/web/components/workbench/WorkbenchShell.vue:5-7` — inline comment + `v-show="sidebarVisible"` (not `v-if`) on the `#changed-files` Teleport host | closed |
| T-20-08 | Repudiation (silent behavior loss) | `BottomPanel.vue` attached-lifecycle focus watchers | mitigate | `src/web/components/workbench/BottomPanel.vue:90-98` — two `watch()` calls over `[attachedLifecycle, attachedFailure]` and `reviewFailure`, with refs `failureAlert`/`completionAction`/`completionSuccess`/`completionFailure`; `20-06-SUMMARY.md` confirms carried over byte-for-byte from `ReviewNotesDialog.vue` | closed |
| T-20-09 | Elevation of Privilege (focus/Teleport stranding) | `WorkbenchShell`'s `#changed-files` host in `App.vue`'s render tree | mitigate | Same `v-show` host (`WorkbenchShell.vue:5-7`) + `src/web/App.vue:358-368` — `toggleSidebar()` wide-viewport branch only sets `panelState.sidebarVisible.value = !panelState.sidebarVisible.value` | closed |
| T-20-10 | Tampering (keyboard shortcut hijack) | `handleKeydown`'s ⌘B/⌘J branches | accept | `src/web/App.vue:940-949` — `handleKeydown` ⌘B/⌘J branches call only `toggleSidebar()`/`togglePanel()` after unconditional `event.preventDefault()` | closed |
| T-20-11 | Information Disclosure | Deleted `.shell-footer__local-status`/`.shell-footer__draft-status` test assertions | accept | Repo-wide grep for `shell-footer__local-status`/`shell-footer__draft-status` across `src/` and `tests/` → zero matches; deletion is complete on both sides | closed |
| T-20-12 (20-08) | Repudiation (silent capability loss) | The five-session-kind matrix itself | mitigate | `tests/e2e/workbench-shell-smoke.spec.ts` — 5 `test(...)` blocks (committed, staged/unstaged/working-tree, standalone, exact patch, agent-attached), each using shared `assertShellRegionsPresent`/`assertExportEmphasized` helpers | closed |
| T-20-12 (20-09) | Repudiation (false-positive test coverage) | `selector-drift-ui.spec.ts:505`'s blocking-error-state shell-absence check | mitigate | `tests/integration/selector-drift-ui.spec.ts:505` — `page.locator('.workbench-shell__body')`, not the deleted `.review-shell` | closed |
| T-20-13 | Tampering (silent behavior-contract drift) | `anchored-workspace.spec.ts`'s Review-notes-to-BottomPanel rewrite | accept | `tests/integration/anchored-workspace.spec.ts:939` — `page.getByRole('region', { name: 'Review', exact: true })` replacing the deleted modal-dialog locator, matching `BottomPanel.vue`'s actual non-modal contract | closed |
| T-20-14 | Repudiation (unexercised custody-gated coverage) | `npm run test:runtime-artifact`'s `agent-ready-export.spec.ts` | mitigate | `package.json` `scripts["test:runtime-artifact"]` = `"playwright test --config playwright.runtime-artifact.config.ts tests/e2e/agent-ready-export.spec.ts tests/e2e/package-assets.spec.ts"` | closed |
| T-20-15 | Repudiation (vacuous sidebar-hidden assertion) | `anchored-review.spec.ts:357` | mitigate | `tests/e2e/anchored-review.spec.ts:357` — `page.locator('.workbench-shell__sidebar')`, not the deleted `.changed-files-sidebar` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-20-01 | T-20-02 | `PersistedPanelState` interface (`panel-state.ts`) is limited to `sidebarWidth: number`, `sidebarVisible: boolean`, `panelHeight: number` — no session tokens, file paths, or review content are ever written to the `loopnote.workbench.v1` localStorage key | gsd-security-auditor | 2026-11-05 |
| AR-20-02 | T-20-04 | `TitleBar.vue` and `StatusBar.vue` render session-identity strings via `{{ }}` interpolation only; no `v-html` present in either file | gsd-security-auditor | 2026-11-05 |
| AR-20-03 | T-20-05 | `Breadcrumbs.vue` renders path segments via `{{ segment }}` interpolation only; no `v-html` present | gsd-security-auditor | 2026-11-05 |
| AR-20-04 | T-20-10 | `App.vue`'s ⌘B/⌘J handlers in `handleKeydown` reach only `toggleSidebar()`/`togglePanel()`, both local UI-visibility toggles with no privileged side effect; unconditional `preventDefault()` is an intentional UX decision | gsd-security-auditor | 2026-11-05 |
| AR-20-05 | T-20-11 | Repo-wide grep across `src/` and `tests/` finds zero remaining references to `.shell-footer__local-status`/`.shell-footer__draft-status`; the server-side guarantee (draft stays local, export is explicit) is unchanged by this client-only chrome removal | gsd-security-auditor | 2026-11-05 |
| AR-20-06 | T-20-13 | The modal-only assertions deleted in `anchored-workspace.spec.ts` (focus trap, Escape-close, backdrop-click-close) are deleted because the underlying modal behavior itself is deleted (SHELL-03, un-wrapped `ModalDialog` in 20-06) — a behavior change already decided and locked in `CONTEXT.md`, not an unreviewed test-only shortcut | gsd-security-auditor | 2026-11-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 16 | 16 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
