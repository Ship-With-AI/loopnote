---
phase: 25-accessibility-design-docs-regression-sweep
plan: 09
subsystem: ui
tags: [file-tree, path-text, a11y, gap-closure]

requires: []
provides:
  - "List mode renders file name first, then dimmed directory, per 21-UI-SPEC.md:197"
affects: [milestone-v2.1-closeout, A11Y-03]

tech-stack:
  added: []
  patterns:
    - "PathText.vue's `nameFirst` prop scopes DOM-order changes to one caller (FileRow.vue list mode) without touching the shared component's default behavior used by full-path breadcrumb consumers"

key-files:
  created: []
  modified:
    - src/web/components/ui/PathText.vue
    - src/web/components/PathDisplay.vue
    - src/web/components/FileRow.vue
    - tests/e2e/file-tree.spec.ts
---

# Phase 25 Gap 09: TREE-04 list-mode DOM order

**Summary:** Added a `nameFirst` prop to `PathText.vue` (default `false`, preserving the existing directory-then-filename order) and forwarded it through `PathDisplay.vue`; `FileRow.vue` now passes `:name-first="mode === 'list'"` alongside its existing `:basename="mode !== 'list'"`. List mode now renders the file name, then the dimmed directory segment, matching `21-UI-SPEC.md:197`. Updated `file-tree.spec.ts`'s list-mode test to assert the corrected order.

## Root Cause

`PathText.vue` rendered `.path-text__directory` before `.path-text__filename` unconditionally whenever `!basename`. `FileRow.vue`'s list mode is the only caller that sets `basename` to `false` for row-label display — every other `PathText`/`PathDisplay` consumer (`CommentComposer.vue`'s inline-comment-composer header, `App.vue`'s orphaned-comment heading, `AttachedCompletionWaiting.vue`'s unsaved-draft notices) also renders with `basename` falsy, but as a continuous full-path breadcrumb string (e.g. "src/changed.ts"), not an Explorer-row label — a first attempt at this fix that swapped `PathText.vue`'s default order broke those breadcrumb consumers (confirmed via `anchored-review.spec.ts`/`rendered-markdown-preview.spec.ts` regressions showing "added.tssrc/" instead of "src/added.ts"), which is why the final fix is scoped behind an opt-in prop rather than changing the shared default.

25-04 found the directory-first deviation from spec but, instead of fixing it, added a test (`file-tree.spec.ts:872`) asserting the wrong order and routed the question to Human Verification as a UX judgment call.

## Evidence

- `npx playwright test tests/e2e/file-tree.spec.ts -g "list mode keeps tree keyboard"` → 1/1 passed, with the corrected `segmentClasses` assertion (`['path-text__filename', 'path-text__directory']`).
- Full `npx playwright test` → 155/155 passed, confirming tree mode and every full-path breadcrumb consumer (CommentComposer, App.vue orphaned-comment heading, AttachedCompletionWaiting, rename/copy old+new pairs) render unchanged.

## Known Stubs

None.

## Threat Flags

None — presentational DOM-order change behind a scoped, opt-in prop; no data, auth, or schema changes.

---
*Phase: 25-accessibility-design-docs-regression-sweep*
