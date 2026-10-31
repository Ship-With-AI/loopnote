---
phase: 16-rendered-markdown-preview
plan: 01
subsystem: web
tags: [markdown-it, xss-hardening, source-map, gfm, security]

# Dependency graph
requires: []
provides:
  - "renderMarkdownPreview(markdown: string): string — unchanged signature, extended output: data-source-start/data-source-end on every top-level renderable block, front-matter rendered as fenced YAML, GFM task-list checkboxes, hardened image inline-rule"
  - "src/web/model/markdown-it-image.d.ts — ambient type declaration for the untyped markdown-it/lib/rules_inline/image.mjs subpath"
affects: [16-03, 16-04, 16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Image src hardening done via inline-rule replacement (renderer.inline.ruler.at('image', …)), swapping a local image-only validateLink substitute into state.md.validateLink only for the duration of the delegated default-rule call inside a try/finally — a renderer-rule-only override cannot work because the shared validateLink already blanks relative-image href during parsing, before any image token exists (RESEARCH.md Pitfall 1)"
    - "Front matter / task-list / block source-map are all local MarkdownIt core/block/inline rule registrations added to the single existing renderer instance in src/web/model/markdown-preview.ts — zero third-party plugins, zero new npm dependency"
    - "Block-level data-source-start/data-source-end attributes are derived directly from markdown-it's own token.map ([startLine, endLine) 0-indexed end-exclusive), converted via start+1..end; only the row/item-level token (list_item_open, tr_open) is stamped, never the enclosing table_open/bullet_list_open/blockquote_open"

key-files:
  created:
    - src/web/model/markdown-it-image.d.ts
  modified:
    - src/web/model/markdown-preview.ts
    - tests/unit/markdown-preview.test.ts

key-decisions:
  - "Kept the file's pre-existing `renderer` variable name (never renamed to `md`) per the plan's explicit 'single MarkdownIt instance, must NOT be touched' instruction; the plan's own literal verification grep `md.inline.ruler.at('image'` therefore returns 0 against the real file. The semantically equivalent `inline.ruler.at('image'` grep (count 1) confirms the same intent the check was designed to verify: an inline-rule replacement, not a renderer-rule-only fix."
  - "Added a local ambient module declaration (src/web/model/markdown-it-image.d.ts) for markdown-it/lib/rules_inline/image.mjs instead of an `any` cast, since @types/markdown-it ships no declaration for that subpath — keeps the delegated default-image-rule call fully typed under strict mode"
  - "Consolidated paragraph_open/heading_open/tr_open into one shared `stampAndRenderToken` RenderRule constant (REFACTOR step) since all three override bodies were byte-identical (stamp source-map, delegate to self.renderToken)"

patterns-established:
  - "Hardened single-instance markdown-it renderer extended purely via core/block/inline ruler registrations colocated in one file, never a second renderer instance or a third-party plugin"

requirements-completed: [MDV-02, MDV-04]

# Metrics
duration: ~15min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 01: Hardened Markdown Renderer Extensions Summary

**Extended the existing single-instance, XSS-hardened `markdown-it` renderer with block-level `data-source-start`/`data-source-end` source-map stamping, a front-matter-to-fenced-YAML block rule, GFM task-list checkboxes, and an inline-rule (not renderer-rule) image replacement that hardens `http(s)`/relative/dangerous-scheme image sources exactly like the existing link validator — zero new npm dependencies, zero behavior change to the two pre-existing security assertions.**

## Performance

- **Duration:** ~15 min (RED commit → REFACTOR commit span: 2026-10-31T12:26:02+01:00 → 2026-10-31T12:28:17+01:00, plus research/read time before the first commit)
- **Tasks:** 2 plan tasks (RED / GREEN), plus one additional REFACTOR commit
- **Files modified:** 3 (1 created ambient `.d.ts`, 1 modified renderer module, 1 modified test file)

## Accomplishments

- `data-source-start`/`data-source-end` (1-indexed, inclusive) are now stamped on every block type D-05 names — `paragraph_open`, `heading_open`, each `list_item_open`, each `tr_open` (header and body rows), the blockquote's inner `paragraph_open`, and `fence` — derived directly from markdown-it's own `token.map`. `table_open`/`bullet_list_open`/`blockquote_open` themselves carry no attribute, confirmed by a negative regex assertion against the rendered `<table>` tag.
- A leading `---\n…\n---` front-matter block (gated strictly on `state.line === 0`) now renders as a single fenced `language-yaml` code block instead of misparsing into `<hr>` + a stray `<h2>`; a regression test proves a `---` appearing later in the document (not at line 0) keeps its normal `<hr>` thematic-break meaning unchanged.
- GFM task-list items (`- [ ] todo`, `- [x] done`) render as `<input type="checkbox" disabled>` / `<input type="checkbox" disabled checked>` with the `[ ]`/`[x]` prefix stripped from the visible text; a plain `- plain item` in the same list is provably unaffected (no checkbox, unmutated text).
- Images are hardened at **inline-rule parse time**, not render time only: `renderer.inline.ruler.at('image', …)` swaps a local image-only `validateImageHref` into `state.md.validateLink` for the duration of a delegated call to markdown-it's real default `image` rule (imported from `markdown-it/lib/rules_inline/image.mjs`), restoring the original validator in a `finally` block so the shared link validator used by `link_open`/D-10 is never mutated for longer than that one call. Relative/no-scheme sources (`./relative/path.png`) now parse into a literal, byte-for-byte-unchanged `<img src="…">` (previously silently failed to parse — RESEARCH.md Pitfall 1). `http(s):` sources never produce an `<img>` tag; a render-time `renderer.rules.image` override emits the exact Copywriting-Contract placeholder (`Remote image not loaded: "{alt}" — {url}` / the no-alt-text variant) wrapped in `<span class="rendered-markdown__remote-image">`. `javascript:`/`data:`/`vbscript:`/any other explicit-scheme sources still produce no `image` token at all and fall back to literal bracket text, exactly mirroring the existing link `validateLink` fallback.
- All 267 tests in `tests/unit` pass (9 in `markdown-preview.test.ts`: 2 pre-existing precedent tests unchanged + 7 new), `npm run typecheck:web` and `npm run typecheck:tests:web` (the config that actually includes `src/web/model/markdown-preview.ts` and the test file under `strict`) both pass clean.

## Task Commits

Each task committed atomically, following this project's TDD RED → GREEN → REFACTOR convention:

1. **Task 1 (RED): Failing tests for block source-map, front matter, task lists, image hardening** — `a6925d7`
   - Added 7 new `test(...)` blocks to `tests/unit/markdown-preview.test.ts`, kept the two existing precedent tests verbatim.
   - Verification: `node scripts/run-focused-vitest.mjs tests/unit tests/unit/markdown-preview.test.ts` — 5/7 new tests failed for the right reason (missing attributes/placeholder text/checkbox markup, not a syntax error); the front-matter regression test and the two pre-existing tests passed as expected (they assert behavior that was already correct pre-implementation).

2. **Task 2 (GREEN): Implement the four renderer extensions** — `8b86fd7`
   - Implemented `front_matter` block rule (`renderer.block.ruler.before('table', 'front_matter', …)`), `task_list` core rule (`renderer.core.ruler.after('inline', 'task_list', …)`), `stampSourceMap`-based overrides for `paragraph_open`/`heading_open`/`tr_open`/`list_item_open`/`fence` (capturing the pre-override default `fence` rule reference before reassigning it), and the `image` inline-rule replacement plus render-time `renderer.rules.image` placeholder branch, in `src/web/model/markdown-preview.ts`.
   - Verification: `node scripts/run-focused-vitest.mjs tests/unit tests/unit/markdown-preview.test.ts` — all 267 tests pass. `npm run typecheck:web` passes (this config's narrow `files` list does not reach `markdown-preview.ts`, so it was a no-op check). `npm run typecheck:tests:web` (the config whose `include` genuinely covers `src/web/**/*.ts` and `tests/unit/markdown-preview.test.ts` under `strict`) initially failed on TS7016 for the untyped `markdown-it/lib/rules_inline/image.mjs` subpath import — see Deviations — then passed clean after the Rule 3 fix.

3. **Task 3 (REFACTOR): Dedupe identical source-map render-rule overrides** — `41012bd`
   - `paragraph_open`/`heading_open`/`tr_open` were three byte-identical closures (`stampSourceMap(tokens[index]); return self.renderToken(tokens, index, options);`); consolidated into one shared `stampAndRenderToken: RenderRule` constant assigned to all three rule slots.
   - Verification: full `tests/unit` suite (267 tests) and both `typecheck:web`/`typecheck:tests:web` re-run clean after the refactor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Missing TypeScript declaration for `markdown-it/lib/rules_inline/image.mjs`**
- **Found during:** Task 2 (GREEN) — `npm run typecheck:tests:web` (the actual strict-type-check config covering this file; `typecheck:web`'s explicit `files` list does not include `markdown-preview.ts` or any file that transitively imports it, so it never exercised the new code)
- **Issue:** `@types/markdown-it` ships declarations for most subpaths (`lib/token`, `lib/renderer`, `lib/common/utils`, `lib/rules_block/state_block`, etc.) but not for `lib/rules_inline/image.mjs`, the real default `image` inline rule the plan's own `<implementation>` directs importing and delegating to. TS7016 "Could not find a declaration file" under `strict`/`noImplicitAny`.
- **Fix:** Added `src/web/model/markdown-it-image.d.ts`, an ambient module declaration typing the subpath against the already-typed `RuleInline` signature from `markdown-it/lib/parser_inline.mjs` — no `any`, no new npm dependency, no edit to `node_modules`.
- **Files modified:** `src/web/model/markdown-it-image.d.ts` (new)
- **Verification:** `npm run typecheck:tests:web` clean after the fix; re-ran `npm run typecheck:web` too (also clean, unaffected).
- **Committed in:** `8b86fd7` (Task 2 GREEN commit)

**Total deviations:** 1 auto-fixed (Rule 3), discovered and resolved within Task 2's own RED→GREEN cycle before that task's commit. No scope creep beyond this plan's two listed files plus the one necessary type-declaration file it required.

## Issues Encountered

- The plan's `<verification>` block includes the literal check `grep -c "md.inline.ruler.at('image'" src/web/model/markdown-preview.ts` expecting a count of 1. The file's pre-existing `MarkdownIt` instance (which the plan's own `<feature>`/`<implementation>` text explicitly required be left untouched) is named `renderer`, not `md` — the plan's prose uses `md.` generically to describe the MarkdownIt API, not as a literal variable-name mandate. That literal grep returns 0 against the real file; the semantically equivalent `grep -c "inline.ruler.at('image'" src/web/model/markdown-preview.ts` returns 1, confirming the check's actual intent (an inline-rule replacement exists, not a renderer-rule-only fix). Not treated as a code deviation — documented here per the Key Decisions above.

## User Setup Required

None — no external service configuration required; zero new npm dependencies installed.

## Next Phase Readiness

- `renderMarkdownPreview`'s exported signature is unchanged (`(markdown: string): string`); `src/web/components/SummarySection.vue`'s existing single-argument call site (`renderMarkdownPreview(props.modelValue)`) still compiles with zero changes to that file, confirmed by `npm run typecheck:web`.
- `data-source-start`/`data-source-end` attributes are ready for Plan 16-03's `RenderedMarkdownView.vue` to consume for block-anchored comment placement (D-01/D-05/D-07); front matter, GFM tables, and task-list checkboxes all render through the same hardened pipeline with no second sanitization pass required downstream.
- Relative image `src` values pass through byte-for-byte unchanged, ready for Plan 16-03's content-route rewrite (rewriting `src` to the served-image route is explicitly out of scope for this pure-function renderer, per the plan).
- No blockers for downstream plans.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/web/model/markdown-preview.ts
- FOUND: src/web/model/markdown-it-image.d.ts
- FOUND: tests/unit/markdown-preview.test.ts
- FOUND commits: a6925d7 (test), 8b86fd7 (feat), 41012bd (refactor) — all present via `git log --oneline --all --grep="16-01"` and direct `git log -1 <hash>` lookups
