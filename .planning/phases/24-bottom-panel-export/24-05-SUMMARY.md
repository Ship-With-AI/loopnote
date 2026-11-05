---
phase: 24
plan: 05
type: auto
status: complete
---

# 24-05 Summary: ExportReceipt Copy agent prompt

## Commits

| Commit | Description |
|--------|-------------|
| `aeb20c8` | feat(24-05): add copyAgentPrompt() and Copy agent prompt button to ExportReceipt |

## What shipped

- `copyAgentPrompt()` in `src/web/components/ExportReceipt.vue` (lines 93–104), a third member of the `copyDetails()`/`copyAcknowledgedIdentities()` family: same `copyMessage.value = ''` → `try { navigator.clipboard.writeText(...) } catch` → `copyMessage.value = '<text>'` shape, reusing the file's single existing `copyMessage` ref and its single rendered `.export-receipt__message` element — no new message element, no new toast.
- Writes the exact CONTEXT-locked string, interpolating only `props.receipt.files[0].path` (the real, already-published `review.json` path): `` Apply the review in `${path}` (human-readable: `review.md`). Address every open comment; leave resolved ones as context. ``
- Success sets `copyMessage.value = 'Copied agent prompt.'`; failure sets `copyMessage.value = 'Could not copy. Select the value and copy it manually.'` — matching `copyDetails()`'s exact existing failure-string wording verbatim (the closest-match convention in this file; `copyAcknowledgedIdentities()` uses a different, longer failure string for its own, different copied payload).
- `<button type="button" class="ui-button" @click="copyAgentPrompt">Copy agent prompt</button>` added as the first child of the `v-if="!previous"` `.export-actions` row (lines 212–216), before the pre-existing "Copy all receipt details" and "Reveal export directory" buttons. Same `.ui-button` text-button treatment, no icon, no new CSS selector.

## Deviations from Plan

None. Implementation matches the plan's prescribed function body and button placement exactly (the plan's sample used a bare `receipt.files[0].path`; the actual file only exposes the receipt via `props.receipt`, consistent with how `receiptDetails`/`copyDetails()` already reference `props.receipt.files[0].path` elsewhere in this same file — not a deviation, just the file's existing prop-access convention).

## Verification

- `npm run typecheck:web` — **0 errors**.
- `npm run verify:semantic-css` — **passed** ("Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass."); no new CSS selector introduced (button reuses `.ui-button`/`.export-actions` unchanged).
- `npx vitest run --no-file-parallelism tests/unit` — **46 test files passed, 478 tests passed**, 0 failures.
- Playwright: grepped `tests/e2e` and `tests/integration` for `ExportReceipt`, `Copy agent prompt`, `export-receipt-ui`. No `tests/e2e` spec references `ExportReceipt` or the new button text. `tests/integration/export-receipt-ui.spec.ts` exercises `ExportReceipt.vue` live via a packaged-binary Chromium run, but per this plan's own `<verification>` block, the packaged-binary Chromium proof of this new button's clipboard behavior is **explicitly deferred to Plan 24-10** (the phase's final cross-cutting verification plan, which also owns this spec file's tab-click fix). Not run here, per plan instruction — not fabricated.

## Self-Check: PASSED

- Truth 1 ("Copy agent prompt" button is first in the current receipt's actions row, before "Copy all receipt details"/"Reveal export directory"; copies the exact locked string with the real `receipt.files[0].path` interpolated; reuses the existing try/catch → `copyMessage` pattern; no new message element/toast) — re-verified directly against the file: button order confirmed at lines 212–216, function body confirmed at lines 93–104, `copyMessage` ref/element unchanged (no new ref, no new template message block added).
- `typecheck:web`: 0 errors — confirmed.
