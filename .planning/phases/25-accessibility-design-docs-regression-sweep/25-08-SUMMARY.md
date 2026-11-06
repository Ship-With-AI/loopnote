---
phase: 25-accessibility-design-docs-regression-sweep
plan: 08
subsystem: testing
tags: [playwright, runtime-artifact, custody, gap-closure]

requires: []
provides:
  - "npm run test:runtime-artifact at 16/16 passed, reproducing Phase 23's custody setup"
affects: [milestone-v2.1-closeout, A11Y-03]

tech-stack:
  added: []
  patterns:
    - "BottomPanel.vue's Summary/Export tab content is v-if-gated on activeTab; any e2e helper reaching Write-summary/review-summary-preview/Export-review/Finish-attached-review must click the matching tab[name] first, inside region[name=Review]"

key-files:
  created: []
  modified:
    - tests/e2e/agent-ready-export.spec.ts
---

# Phase 25 Gap 08: test:runtime-artifact custody browser-interaction cluster

**Summary:** Gave `agent-ready-export.spec.ts`'s shared `openReviewNotes()` helper a `tab` parameter (default `'export'`) that clicks the matching tab inside the `region[name="Review"]` tablist after opening the bottom panel — matching the pattern `standalone-review.spec.ts` and `finish-review-live-region.spec.ts` already use. `saveSummary()` now opens with `'summary'`; the resume-after-relaunch flow explicitly opens `'summary'` to check the preview, then clicks the `Export` tab before exporting. Reproduced Phase 23's custody setup (`pack-runtime.mjs --purpose development-check` with a configured `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL`, then the 4 `LOOPNOTE_RUNTIME_*` env vars) to confirm 16/16.

## Root Cause

Phase 24 moved the Summary editor and Export/Finish controls into `BottomPanel.vue`'s tab system (`SummaryTab`/`ExportTab` are each `v-if`-gated on `activeTab`, default `'comments'`). `agent-ready-export.spec.ts` was never updated to select a tab before interacting with tab-gated content — the only spec file in the suite still missing this.

Reproducing the custody run also required discovering that `development-check` purpose's support-origin is optional, but the file's "installed configured support remains unavailable without outbound access" test needs support *configured* (so the button/dialog render) while the network call itself is blocked by Playwright's route handler — a configured `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL` (`https://<20-char-ref>.supabase.co`) at pack time was required, documented in `docs/support-service-operations.md`.

## Evidence

- First custody run (unfixed `openReviewNotes`, unconfigured support): 13 passed, 3 failed (602 header-text mismatch — actually the then-unfixed Gap-09 PathText regression, not a tab issue; 856 support button not found — unconfigured support origin; 1174 cascading accumulator failure from the other 2).
- After fixing `openReviewNotes` + Gap 09's PathText scoping + configuring the support origin: `npm run test:runtime-artifact` → **16 passed (50.2s)**.
- No production file was touched; Export bytes and Finish's canonical exported document are unaffected (confirmed via the full suite: 155/155 passed, including every export/finish-receipt-asserting spec).

## Known Stubs

None.

## Threat Flags

None — test-only change plus a disposable local custody artifact used for reproduction (not committed, not published).

---
*Phase: 25-accessibility-design-docs-regression-sweep*
