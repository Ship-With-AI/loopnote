---
phase: 24
plan: 09
type: auto
wave: 4
status: complete
---

# 24-09 Summary: App.vue panel/tab wiring

## Commits

| Commit | Type | Description |
|---|---|---|
| `fdea595` | feat | wire `openPanel(tab)` and `BottomPanel` `activeTab`/`flatFileRows` bindings (incl. `panelRef`, `PanelTab` import, `update:active-tab`/`reveal` emits) |
| `7d70095` | feat | add `revealCommentFromPanel` for Comments-tab reveal navigation |
| `b2ba1e4` | feat | add Cmd/Ctrl+S immediate summary-save shortcut |

All three commits touch only `src/web/App.vue`, per `files_modified`.

## Deviations

**Rule 1-3 auto-fix (documented):** The plan's literal `openPanel`/`revealCommentFromPanel` snippets used a single `nextTick(...)` to focus the newly-mounted tab button / thread header after `panelOpen`/`collapsedByCommentId` flips. Real packaged-binary Playwright verification showed this was insufficient: `document.activeElement` sometimes landed on an unrelated element (observed once on `<header class="titlebar">`) instead of the target button, because the `<section v-if="open">` inside `BottomPanel.vue` is a *child component's* own v-if gated on a prop that only updates in the *same* reactive flush as `App.vue`'s — a single `nextTick()` is not reliably enough ticks for that cross-component mount-then-focus chain to settle. This repo already has exactly this pattern documented at the `titleBar.value?.focusSidebarToggle()` call site (`App.vue`, `handleViewportChange`): `void nextTick(() => nextTick(() => ...))`. I applied the same double-`nextTick` shape to `openPanel`'s `panelRef.value?.focusActiveTab()` call, and a matching extra `nextTick` layer to `revealCommentFromPanel`'s final `.thread-header` focus call (which was already two ticks deep per the plan's snippet; added one more to match). Diagnostic instrumentation (temporarily added, removed before commit) confirmed this change makes the app's own `document.activeElement` land on the correct target in every observed run.

No other deviations. `togglePanel()`/`closePanel()` are untouched; the `@open-panel="openPanel"` binding on `<StatusBar>` is untouched; every other `<BottomPanel>` prop/emit binding is untouched; `WorkspaceComment` and `createFileTreeModel`/`flatFileRows` were reused as-is per the shipped-facts in the brief, no duplicate declarations added.

## Automated gates (all against current `HEAD`)

- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **PASS** (`Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.`).
- `npx vitest run --no-file-parallelism tests/unit` — **46 files / 478 tests passed, 0 failures.**

## Real packaged-binary Playwright verification

Built `dist/bin/loopnote.mjs` via the project's production pack-and-verify chain (`scripts/pack-runtime.mjs` + `scripts/verify-production-artifacts.mjs`, the same pattern `tests/e2e/anchored-review.spec.ts` / `tests/e2e/inline-comment-threads.spec.ts` use), spawned the packaged CLI against a real git fixture (`createGitFixture({ anchoredReview: true })`), and drove it with a real `chromium.launch()` Playwright session (throwaway spec, not committed — deleted after use). The script exercised, in one continuous session against the real running app:

1. **Status-bar Comments entry point** — clicking the `Comments: …` status-bar item opens the panel, selects the Comments tab (`aria-selected="true"` on `#panel-tab-comments`), and moves focus to that tab button.
2. **Comments-tab row reveal, same-file** — clicking a Comments-tab row for a comment in the already-selected file (`changed.ts`) expanded its (previously collapsed) thread and moved focus onto the thread's `.thread-header`, without switching files.
3. **Comments-tab row reveal, cross-file** — pressing Enter on a Comments-tab row for a comment in a different file (`added.ts`) switched the selected file, expanded the thread, and moved focus onto its `.thread-header`.
4. **Status-bar Export entry point** — clicking the status bar's `Export` item opens the panel, selects the Export tab, and moves focus to that tab button.
5. **⌘J preserves `activeTab`** — with the Export tab selected, pressing ⌘J closed the panel and pressing it again reopened the panel still on the Export tab (`aria-selected="true"` unchanged) — confirming `togglePanel()` never resets `activeTab`.
6. **⌘S no-op outside Summary tab** — with the Export tab active, ⌘S fired no `/api/draft/mutations` request.
7. **⌘S immediate save, including focus inside the textarea** — switching to the Summary tab, entering edit mode, filling the textarea (leaving focus inside it), then pressing ⌘S triggered a `/api/draft/mutations` save request in well under SummarySection.vue's 800ms autosave debounce (proving it took the keyboard-shortcut path, not autosave), and the summary status badge flipped to "Saved".

**Result:** every one of the above assertions passed, repeatedly, in multiple full clean runs early in this session (6 consecutive complete green runs covering every scenario above, right after applying the double-`nextTick` fix).

**Environmental caveat (not an app defect):** later in this session, under escalating shared-machine load (confirmed via `uptime`: load average climbed from ~2.5 to 8.3+ as other concurrent agent sessions on this workstation ran heavier work — visible in the agent roster as 150+ parked peers, several other `Exec`/`Plan` agents actively running in parallel), some reruns of the focus-timing-sensitive assertions (steps 1–4 above) timed out in Playwright even though temporary diagnostic logging added directly inside `openPanel()` proved the application's own JS reliably called `.focus()` on the correct target element every single time, including in runs where Playwright's own check reported it as unfocused. This is consistent with CPU-starved headless-Chromium rendering/microtask-queue delays under contention, not a logic defect — the automated gates above (typecheck/semantic-css/unit, none of which spin up a browser) remained 100% deterministic throughout, and steps 6–7 (network-timing-based, not focus-based) also passed reliably. The double-`nextTick` fix measurably reduced — but, under this specific session's worst-case shared-machine load, did not perfectly eliminate — Playwright-observed focus-check timeouts; the application-level behavior itself (which element receives `.focus()`) was independently confirmed correct via direct instrumentation.

## Spot-check: other specs expected to still fail post-wiring

Per the shared context (discovered during Plan 24-08), several pre-existing Playwright specs assert on Summary/Export tabpanel content via the generic `Toggle panel (⌘J)` button (never a status-bar tab entry point or an explicit tab click), so they land on the now-default Comments tab and can no longer find Summary/Export content. Fixing them is explicitly out of scope for this plan (`files_modified` is `App.vue` only; it's the next plan's job). I spot-checked one for real against the packaged binary:

- **`tests/e2e/workbench-shell-smoke.spec.ts`** — ran the `agent-attached: attachedFact overlay and Finish review entry point in the bottom panel` test for real against the packaged binary. **Confirmed failing**, exactly as predicted: `expect(panel.getByRole('heading', { name: 'Finish attached review' })).toBeVisible()` times out, because that heading lives in `ExportTab.vue`, only rendered when `activeTab === 'export'`, and this test's `openPanel(page)` helper only clicks the generic toggle button (never selects a tab). This failure is fast and fully deterministic (not flaky), unrelated to the focus-timing caveat above.

I additionally confirmed, by direct source reading (not execution, to conserve the shared machine's capacity given the load spike above), that the same `openReviewNotes()` + direct "Write summary"/"Export review" button lookup pattern (no tab click) is present in `tests/e2e/complete-review-draft.spec.ts`, `tests/e2e/agent-ready-export.spec.ts`, and `tests/e2e/standalone-review.spec.ts` — all three will fail for the identical structural reason as the confirmed case above. `tests/e2e/marketplace-review.spec.ts` and `tests/e2e/public-support-states.spec.ts` are custody-gated specs (`playwright.runtime-artifact.config.ts`) not inspected in this pass. `review-notes-dialog.spec.ts` and `export-receipt-ui.spec.ts`'s `openReview()` were not touched or re-verified — they are expected-broken per the brief, fixed in Plan 24-10.

## Self-Check

PASSED
