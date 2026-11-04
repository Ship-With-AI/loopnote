# Deferred Items

## Found during 13-03

`npm run typecheck:tests:web` fails with pre-existing errors unrelated to any file this plan touches (`src/web/App.vue`, `src/web/components/DiffWorkspace.vue`, `src/web/components/ReviewToolbar.vue`, `src/web/styles.css`):

- `tests/e2e/pinned-session.spec.ts`, `tests/e2e/responsive-session.spec.ts`, `tests/integration/anchored-workspace.spec.ts`, `tests/unit/draft-reconciliation.test.ts`, `tests/unit/file-tree.test.ts` — all fail with `Property 'oldMode' is missing` on inline `SessionFile`-shaped test fixtures. This stems from 13-02 adding the required `oldMode` field to `SessionFileSchema`; these fixture literals were never updated to include it.
- `tests/unit/monaco-diff-adapter.test.ts` — fails with `TS2352`/`TS2493` tuple/conversion errors around lines 273, 300, 303. This stems from 13-01's `addAction` mock typing.

Not fixed here: out of scope for 13-03 (none of the affected files are in this plan's `files_modified`), and 13-03's own `<verification>` block specifies `npm run typecheck:web` (passes), not `typecheck:tests:web`. Belongs to a follow-up on 13-01/13-02's test fixtures, or phase 13-04/cleanup.
