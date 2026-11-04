# Phase 19: Typecheck Foundation - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

One working typecheck gate for the whole browser workspace before any `.vue` restructuring in Phases 20–25. `npm run typecheck:web` runs vue-tsc over every `.vue` component and web `.ts` module (TYPE-01), CI on push to `main` fails on a web type error, and the Node/CLI build still uses the native TypeScript 7 `tsc` with unchanged output (TYPE-02). No UI behaviour changes.

</domain>

<decisions>
## Implementation Decisions

### Toolchain (decided at milestone definition, `.planning/REQUIREMENTS.md`)
- `vue-tsc@3.3.14`; `typescript` devDependency aliased to `npm:@typescript/typescript6@6.0.2` (JS API consumed by vue-tsc); new `@typescript/native` devDependency aliased to `npm:typescript@7.0.2` (native `tsc` binary for `build:node`). See `.planning/research/STACK.md` and SUMMARY.md "Gaps to Address 1" — `typescript-native-bridge` was rejected.
- `build:node` and any other script needing the TS 7 native compiler must invoke the `@typescript/native` binary explicitly so they do not silently fall back to TS 6.

### Typecheck scope & gate
- Fix every latent type error the new gate surfaces within this phase; `npm run typecheck:web` must exit 0 before Phase 20 starts. No baseline/allowlist of known errors.
- Include the DEV-only prototypes in `src/web/prototypes/*.vue` in the typecheck scope (they are still compiled in dev via `main.ts` `?prototype=phase6`).
- Add `npm run typecheck:web` to the `repository-gates` job in `.github/workflows/deploy-supabase-production.yml` (push to `main`), and move `typecheck:tests:web` to vue-tsc so test files importing `.vue` see real component types.
- Exclude `src/web/shims-vue.d.ts` (`*.vue` → `Component`/any) from vue-tsc scope so real component prop/emit types flow; keep it only where plain `tsc` still needs it.
- `tsconfig.web.json` moves from the seven-entry `files` allowlist to `include` globs covering `src/web/**/*.ts` and `src/web/**/*.vue`.

### Claude's Discretion
- Exact tsconfig layering (single vs. split app/test configs), vue-tsc invocation flags, and how type fixes are expressed (narrowing, prop typing, `defineProps` generics) as long as runtime behaviour is unchanged.
- How the "gate actually fails" proof is recorded (scripted negative check vs. documented manual run).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tsconfig.web.json` (strict, Bundler resolution, `verbatimModuleSyntax`, 7-file `files` allowlist) and `tsconfig.web.test.json` (extends web, includes `src/web/**/*.ts`, e2e/integration tests, selected unit tests, `shims-vue.d.ts`).
- `src/web/theme/virtual-tokens.d.ts` declares the Vite virtual tokens module; must stay in scope.

### Established Patterns
- Scripts: `typecheck:web` (`tsc --noEmit -p tsconfig.web.json`), `typecheck:tests` (node + web test configs), `build:node` (`tsc -p tsconfig.json`, emits `dist/`).
- CI (`deploy-supabase-production.yml` `repository-gates`): `npm ci` → `npm run build` → `npm run typecheck:tests` → vitest → playwright. `publish-npm.yml` builds and tests the release candidate.
- Quick tasks `260913-nx0` (test typecheck coverage) established the pattern of gating typecheck in CI.

### Integration Points
- `package.json` devDependencies/scripts, `package-lock.json`, `tsconfig*.json`, `.github/workflows/deploy-supabase-production.yml`, and every `.vue`/`.ts` under `src/web/` that needs a type fix.
- `scripts/` build scripts that may invoke `tsc` (check `scripts/build-bin.mjs`, `scripts/pack-runtime.mjs`) and `publish-npm.yml`.

</code_context>

<specifics>
## Specific Ideas

- Success criterion 2 requires proof that the gate fails on a deliberately bad prop type, not just that it passes.
- `build:node` output must be unchanged (compare `dist/` before/after, e.g. a file-hash listing).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
