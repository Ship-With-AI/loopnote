# Phase 19: Typecheck Foundation - Research

**Researched:** 2026-11-04
**Domain:** TypeScript/vue-tsc toolchain repair + whole-codebase `.vue` typecheck gate (Loopnote v2.1, pre-restructuring foundation)
**Confidence:** HIGH (toolchain scheme verified against official Microsoft announcement + npm registry; error-count finding is a live measurement in an isolated, disposable git worktree against the real `src/web` source tree — not estimated)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Toolchain (decided at milestone definition, `.planning/REQUIREMENTS.md`)**
- `vue-tsc@3.3.14`; `typescript` devDependency aliased to `npm:@typescript/typescript6@6.0.2` (JS API consumed by vue-tsc); new `@typescript/native` devDependency aliased to `npm:typescript@7.0.2` (native `tsc` binary for `build:node`). See `.planning/research/STACK.md` and SUMMARY.md "Gaps to Address 1" — `typescript-native-bridge` was rejected.
- `build:node` and any other script needing the TS 7 native compiler must invoke the `@typescript/native` binary explicitly so they do not silently fall back to TS 6.

**Typecheck scope & gate**
- Fix every latent type error the new gate surfaces within this phase; `npm run typecheck:web` must exit 0 before Phase 20 starts. No baseline/allowlist of known errors.
- Include the DEV-only prototypes in `src/web/prototypes/*.vue` in the typecheck scope (they are still compiled in dev via `main.ts` `?prototype=phase6`).
- Add `npm run typecheck:web` to the `repository-gates` job in `.github/workflows/deploy-supabase-production.yml` (push to `main`), and move `typecheck:tests:web` to vue-tsc so test files importing `.vue` see real component types.
- Exclude `src/web/shims-vue.d.ts` (`*.vue` → `Component`/any) from vue-tsc scope so real component prop/emit types flow; keep it only where plain `tsc` still needs it.
- `tsconfig.web.json` moves from the seven-entry `files` allowlist to `include` globs covering `src/web/**/*.ts` and `src/web/**/*.vue`.

### Claude's Discretion
- Exact tsconfig layering (single vs. split app/test configs), vue-tsc invocation flags, and how type fixes are expressed (narrowing, prop typing, `defineProps` generics) as long as runtime behaviour is unchanged.
- How the "gate actually fails" proof is recorded (scripted negative check vs. documented manual run).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TYPE-01 | Developer runs one `typecheck:web` script that typechecks every `.vue` component and web `.ts` module (vue-tsc 3.3.14 with the TS 6/7 dual alias), and CI fails on a type error. | Dual-alias scheme verified installable and functional (§ Standard Stack, § Code Examples). Live measurement below gives the planner the exact 19-error/4-file backlog to size fix-work waves against, plus a confirmed negative-gate proof method and confirmation that moving `typecheck:tests:web` to vue-tsc adds zero *additional* errors. CI wiring point confirmed in `.github/workflows/deploy-supabase-production.yml`'s `repository-gates` job (§ Architecture Patterns). |
| TYPE-02 | Developer still builds the Node/CLI side with the fast native `tsc`, with unchanged output. | `node_modules/.bin/tsc` confirmed to resolve to the `@typescript/native` real 7.0.2 binary automatically after the alias change (no script edit needed); `build:node` output measured byte-identical (SHA-256, 50 files) between unmodified `main` and the aliased-toolchain worktree (§ Live Reproduction Finding, Part 3). |
</phase_requirements>

## Summary

The toolchain break is real and reproduces exactly as `STACK.md` already diagnosed: `vue-tsc@3.3.7` (currently pinned) calls `require.resolve('typescript/lib/tsc')` to patch itself into the TypeScript compiler, but `typescript@7.0.2` (the currently-pinned native Go port, already installed) no longer exports that subpath, so every invocation dies with `ERR_PACKAGE_PATH_NOT_EXPORTED` before a single file is checked. Microsoft's official fix is a dual npm-alias scheme (`typescript` → `npm:@typescript/typescript6@6.0.2` for the JS API vue-tsc needs; a new `@typescript/native` → `npm:typescript@7.0.2` for the real fast binary), paired with `vue-tsc@3.3.8+` (the project needs `3.3.14`), which specifically detects the `@typescript/typescript6` shim and redirects to the real TS6 compiler behind it.

I reproduced the fix in a disposable `git worktree` (not the tracked working tree) and ran `vue-tsc --noEmit -p tsconfig.web.json` with the CONTEXT.md-mandated `include` globs (`src/web/**/*.ts`, `src/web/**/*.vue`) and `shims-vue.d.ts` excluded. **Real finding: once a config gap (missing `vite/client` ambient types — not a CONTEXT.md decision, a discretionary tsconfig fix I verified is necessary) is closed, the gate surfaces 19 genuine latent type errors across 4 files** (`DiffWorkspace.vue` 11, `App.vue` 5, `DraftRecovery.vue` 2, `ReviewNotesDialog.vue` 1), not the 27 a naive first run shows. The 8-error gap between "raw" and "real" counts is entirely DOM-env/Vite-import-syntax typing noise (`?worker` imports, `.css` side-effect imports, `import.meta.env`), not component logic bugs — the planner should close this gap with one `tsconfig.web.json` edit before sizing fix-work waves, or the fix backlog will be measured ~40% too large.

I also separately confirmed TYPE-02: `node_modules/.bin/tsc` auto-resolves to the new `@typescript/native` real-7.0.2 binary without any script changes (npm bin-linking follows each package's own declared `bin` name, not the devDependency alias key), and `build:node`'s `dist/` output is byte-for-byte identical (50 files, SHA-256) between unmodified `main` and the fully-aliased toolchain.

**Primary recommendation:** Install the dual-alias toolchain exactly as `STACK.md` specifies, widen `tsconfig.web.json` to the `include`-glob form with `vite/client` added to `types`, and plan the fix-work wave(s) around the 19-error/4-file backlog measured below — not the raw 27-error first-run number.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TypeScript/vue-tsc compiler resolution (dual alias) | Build & Dev Tooling | — | Pure `devDependencies`/`package.json` concern; no runtime tier (browser/server) is affected — this doesn't fit the Browser/SSR/API/CDN/DB taxonomy because it never ships to a request path. |
| `typecheck:web` gate (vue-tsc over `src/web`) | Build & Dev Tooling | Browser/Client (the files it checks) | The *checker* is a dev-tooling process; the *files it checks* (`.vue`/`.ts` under `src/web`) are Browser/Client-tier source. Fixes to surfaced errors stay inside that tier — no server/API changes. |
| `build:node` native `tsc` compile | Build & Dev Tooling | API/Backend (the files it compiles) | Compiles `src/cli`, `src/contracts`, `src/git`, `src/server` → `dist/`; this phase only proves the compiler swap is output-inert, it does not touch those source files. |
| CI gate wiring (`repository-gates` job) | Build & Dev Tooling | — | GitHub Actions workflow edit only; no application tier. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vue-tsc` | `3.3.14` | `.vue`-aware CLI typecheck gate (`--noEmit`) | `3.3.8+` is the first version with the `@typescript/typescript6`-shim-detection fix ([vuejs/language-tools#6123](https://github.com/vuejs/language-tools/pull/6123)); `3.3.14` is npm's current `latest` dist-tag `[VERIFIED: npm registry, 2026-11-04]`. |
| `typescript` (devDependency, **aliased**) | `npm:@typescript/typescript6@6.0.2` | Provides the `typescript/lib/tsc` **module** subpath `vue-tsc` requires at `require.resolve()` time | TypeScript 7.0's native Go compiler ships no programmatic API; this is Microsoft's own officially-documented side-by-side compatibility package. `6.0.2`'s own `dependencies` field is `{"@typescript/old":"npm:typescript@^6"}` `[VERIFIED: npm view @typescript/typescript6@6.0.2 dependencies, 2026-11-04]` — confirms it is a thin alias wrapper around a real TS6 compiler, not a reimplementation. |
| `@typescript/native` (new devDependency, **aliased**) | `npm:typescript@7.0.2` | Provides the real native `tsc` **binary** for `build:node` | `7.0.2` is npm's current `latest` dist-tag for `typescript` `[VERIFIED: npm view typescript dist-tags, 2026-11-04]`. Node bin-linking resolves `node_modules/.bin/tsc` by the package's own declared `bin` field regardless of the devDependency key name — confirmed empirically (§ Live Reproduction Finding, Part 3). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dual npm-alias scheme | `typescript-native-bridge` or a hand-rolled wrapper package | Already rejected at milestone definition (SUMMARY.md "Gaps to Address 1") — not re-litigated here per CONTEXT.md. |
| `vue-tsc --noEmit -p tsconfig.web.json` CLI gate | `@vue/language-tools` Volar language-server only (editor diagnostics) | Gives IDE red-squiggles but no exit code for CI — this phase needs an enforceable gate, not editor hints (STACK.md already rejected this for the same reason). |

**Installation (verified working, see Live Reproduction Finding for exact commands):**
```bash
npm install -D vue-tsc@3.3.14
npm pkg set devDependencies.typescript="npm:@typescript/typescript6@6.0.2"
npm pkg set devDependencies."@typescript/native"="npm:typescript@7.0.2"
npm install
```

**Version verification (ecosystem command, run 2026-11-04):**
```bash
npm view vue-tsc@3.3.14 version        # → 3.3.14 (= npm's `latest` dist-tag)
npm view @typescript/typescript6@6.0.2 version dependencies
  # → version: 6.0.2; dependencies: { '@typescript/old': 'npm:typescript@^6' }
npm view typescript@7.0.2 version      # → 7.0.2 (= npm's `latest` dist-tag)
```

## Package Legitimacy Audit

| Package | Registry | Age (this version) | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|-------------------|--------------|---------|-------------|
| `vue-tsc@3.3.14` | npm | Published 2026-10-29 (~6 days before this research date) | 9,108,013 | `github.com/vuejs/language-tools` | `[SUS]` — "too-new" signal on *this version*, package itself is long-established | **Keep, flag** — planner must add a `checkpoint:human-verify` before the `npm install -D vue-tsc@3.3.14` task. The flag is a false-positive recency heuristic (huge download count, legit maintained repo, not deprecated, no postinstall script); risk is low but per protocol the SUS verdict is not silently overridden. |
| `@typescript/typescript6@6.0.2` | npm | Published 2026-07-06 | 12,818,210 | `github.com/microsoft/TypeScript` | `[OK]` | Approved |
| `typescript@7.0.2` | npm | Published 2026-07-08 | 406,788,409 | `github.com/microsoft/TypeScript` | `[OK]` | Approved |
| `@typescript/native` | — | N/A | N/A | N/A | N/A | **Not a real registry package.** It is a local `devDependency` *key name* chosen in `package.json` whose value is the npm alias `npm:typescript@7.0.2` — i.e. it resolves to the already-audited `typescript@7.0.2` entry above under a different local name. `npm view @typescript/native` returns `404 Not Found`, as expected for an alias key rather than a published package `[VERIFIED: npm view, 2026-11-04]`. |

All three packages' `scripts.postinstall` fields are empty `[VERIFIED: npm view <pkg> scripts, 2026-11-04]` — no suspicious install-time network/filesystem behavior.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `vue-tsc@3.3.14` — planner inserts `checkpoint:human-verify` before this install step; no safer alternative version exists (it is the only published version with the TS7-compatibility shim-detection fix *and* the version CONTEXT.md already locked).

## Architecture Patterns

### Recommended Project Structure (unchanged file locations — config-only change)
```
diff-review/
├── package.json              # devDependencies: typescript/@typescript/native/vue-tsc aliases
├── tsconfig.json              # unchanged — build:node (src/cli, contracts, git, server)
├── tsconfig.web.json          # files→include glob + vite/client types + shims-vue.d.ts exclude
├── tsconfig.web.test.json     # extends tsconfig.web.json; typecheck:tests:web script moves CLI from tsc→vue-tsc
└── .github/workflows/
    └── deploy-supabase-production.yml   # repository-gates job gains `npm run typecheck:web`
```

### Pattern 1: `files` allowlist → `include` glob migration
**What:** `tsconfig.web.json` currently hand-lists 7 `.ts` files (the ones `build:web`/Vite never touches but something still wanted type-checked). CONTEXT.md requires switching to `include` globs covering the whole `src/web` tree.
**When to use:** Exactly this phase's gate-widening change — no other tsconfig in the repo needs this pattern.
**Example (verified working in the probe):**
```jsonc
// tsconfig.web.json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node", "vite/client"]   // ← add vite/client (see Pitfall 1 below); CONTEXT.md did not lock this, it is a verified-necessary discretionary fix
  },
  "include": [
    "src/web/**/*.ts",
    "src/web/**/*.vue"
  ],
  "exclude": [
    "src/web/shims-vue.d.ts"
  ]
}
```
`[VERIFIED: live reproduction]` — this exact file produced the 19-error/4-file count reported below, run against the real `src/web` tree in an isolated git worktree.

### Pattern 2: `npm` alias devDependencies that don't collide at the bin layer
**What:** Aliasing `typescript` to a different real package (`@typescript/typescript6`) while *also* adding a second devDependency (`@typescript/native`) that points at the real `typescript` package under its own key.
**When to use:** Exactly Microsoft's documented TS6/TS7 side-by-side scheme; no other dependency in this repo needs it.
**Example — confirmed resolution chain `[VERIFIED: live reproduction]`:**
```bash
# After `npm install` with the aliases set:
node_modules/.bin/tsc -> ../@typescript/native/bin/tsc     # symlink target confirmed via `ls -la`
node_modules/.bin/tsc --version                             # → "Version 7.0.2"
node -e "console.log(require.resolve('typescript/lib/tsc'))"
# → .../node_modules/typescript/lib/tsc.js  (resolves cleanly; this is what failed before the alias)
```
This is why `build:node` (`tsc --project tsconfig.json`, which resolves `tsc` via `node_modules/.bin`) needs **zero script changes** — it already gets the native 7.0.2 binary. Only `vue-tsc`'s internal `require('typescript/lib/tsc')` needed the alias fix.

### Anti-Patterns to Avoid
- **Sizing the fix backlog off a `types: ["node"]`-only tsconfig run:** produces a 27-error count inflated by `?worker`/`.css`-side-effect-import/`import.meta.env` noise that evaporates the moment `vite/client` is added to `types` — see Pitfall 1 below. Measure with the config fixed, not the naive first pass.
- **Assuming `shims-vue.d.ts` exclusion changes the vue-tsc error count:** it does not (verified empirically, zero diff either way) — see Pitfall 2. The exclusion is still correct per CONTEXT.md (it matters for the plain-`tsc` paths that can't parse `.vue` directly), but don't budget time expecting it to move the gate's pass/fail count.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| `.vue`-aware CLI typecheck exit code | A custom script that shells out to `vue-language-server`/Volar and parses diagnostics | `vue-tsc --noEmit -p tsconfig.web.json` | It's the official CLI wrapper for exactly this; building a custom diagnostics parser duplicates `vue-tsc`'s own `3.3.8+` TS7-compatibility shim-detection logic, which is non-trivial (require-path patching) and already solved upstream. |
| TS6/TS7 side-by-side compiler access | A local shim package that `require()`s both compiler versions manually | The official `npm:@typescript/typescript6`/`npm:typescript` dual-alias scheme | Microsoft ships and maintains this specifically so third-party tools (incl. `vue-tsc`, `typescript-eslint`) don't each need their own bridge; CONTEXT.md already rejected a hand-rolled `typescript-native-bridge` for the same reason. |

**Key insight:** Every piece of this phase's "fix" is a `package.json`/`tsconfig.json`/CI-YAML edit using officially-published packages exactly as their maintainers document — there is no custom tooling surface to build or maintain here.

## Common Pitfalls

### Pitfall 1: Measuring the error backlog with a config gap still open inflates it by ~40%
**What goes wrong:** Running `vue-tsc --noEmit -p tsconfig.web.json` immediately after widening `include` to the whole `src/web` tree (without also adding `"vite/client"` to `compilerOptions.types`) reports 27 errors across 8 files. A naive reading sizes the phase's fix-work around that number.
**Why it happens:** `tsconfig.web.json`'s current `types` array is `["node"]` only. `tsconfig.web.test.json` already has `["node", "vite/client"]`, but the app-side config never needed it before because its old 7-file `files` allowlist happened to exclude every file that uses Vite-only import syntax (`?worker` suffix imports in `src/web/monaco/configure.ts`, bare `.css` side-effect imports in the two `src/web/prototypes/*.vue` files, `import.meta.env` in `main.ts`). Widening the glob exposes all three for the first time, and TypeScript genuinely cannot resolve `?worker`/`.css`-as-side-effect/`import.meta.env` without Vite's ambient client types.
**How to avoid:** Add `"vite/client"` to `tsconfig.web.json`'s `types` array in the same task that does the `files`→`include` migration (this is within "Claude's Discretion: Exact tsconfig layering" per CONTEXT.md — not a separate decision to defer). Verified result: this removes exactly 8 of the 27 errors (5× `TS2307` worker-import, 2× `TS2882` css-side-effect-import, 1× `TS2339` `ImportMeta.env`), leaving the real 19-error/4-file backlog documented below.
**Warning signs:** Errors referencing `monaco-editor/esm/.../?worker`, `'../styles.css'` side-effect imports, or `Property 'env' does not exist on type 'ImportMeta'` — all three are config-gap artifacts, not component bugs; don't write prop-typing fixes for them, fix the `types` array instead.

### Pitfall 2: Expecting `shims-vue.d.ts` exclusion to move the vue-tsc error count
**What goes wrong:** CONTEXT.md's rationale for excluding `src/web/shims-vue.d.ts` from vue-tsc's scope is "so real component prop/emit types flow" — reading that literally, one might expect the error count to *change* (likely increase, since the ambient `declare module '*.vue' { const component: Component }` typing is looser than real inference) depending on whether it's included or excluded.
**Why it happens:** It doesn't change, because vue-tsc's `@vue/language-core` plugin resolves concrete `.vue` files that are inside the TS program's module graph directly — via its own module-resolution hook, which takes precedence over any ambient wildcard `declare module '*.vue'` pattern. The wildcard shim is only consulted by TypeScript's resolver when no concrete file can be found for an import specifier; since every `.vue` file imported from `src/web/**/*.ts`/`*.vue` is already inside the `include` glob, the shim is never reached.
**How to avoid:** Follow the CONTEXT.md decision as written — it's still correct for the files/tools that *aren't* vue-tsc-aware (plain `tsc` paths, any future non-Vue-plugin tooling) — but don't budget verification time expecting a different pass/fail outcome from toggling it. `[VERIFIED: live reproduction — identical 19-error output with `shims-vue.d.ts` included vs. excluded; `diff` of the two runs is empty]`.
**Warning signs:** None observable from the gate itself — this is purely a planning-estimate risk, not a runtime symptom.

### Pitfall 3: `.vue` typechecking adoption blocked by a real, already-diagnosed toolchain incompatibility (project's own Critical Pitfall 8)
**What goes wrong:** Three prior quick-tasks (across v1.5/v2.0 milestones) already hit and explicitly declined to fix this exact `ERR_PACKAGE_PATH_NOT_EXPORTED` failure as "far outside [a] quick task's scope" `[CITED: .planning/research/PITFALLS.md Critical Pitfall 8]`.
**Why it happens:** TypeScript 7's Go-ported native compiler (2026-07-08 release) changed its package `exports` map in a way `vue-tsc < 3.3.8`'s Node-API integration assumed still existed; genuine upstream compatibility gap, not local misconfiguration.
**How to avoid:** This phase is that fix, sequenced first (before `App.vue` decomposition in later phases) exactly as `PITFALLS.md`'s "Pitfall-to-Phase Mapping" prescribes.
**Warning signs:** N/A — already fully diagnosed; verification is `npm run typecheck:web` exiting 0 after the fix, plus the negative-gate proof below.

## Live Reproduction Finding

> This section is this phase's primary deliverable: a real, measured error count from the actual `src/web` source tree, not an estimate. All numbers below are from command output captured in this session; raw logs are referenced inline.

### Method (disposable git worktree — real repo left untouched)

1. `git -C /Users/alessandro/projects/diff-review worktree add /tmp/loopnote-typecheck-probe HEAD` — independent working copy, detached at `cc890a6`.
2. `npm install` in the probe (full independent `node_modules`, confirmed via `node-gyp rebuild` running the project's native addon build — `[VERIFIED]`).
3. Edited **only the probe's** `package.json` devDependencies:
   ```json
   "typescript": "npm:@typescript/typescript6@6.0.2",
   "vue-tsc": "3.3.14",
   "@typescript/native": "npm:typescript@7.0.2"
   ```
   then `npm install` again (`added 7 packages, and changed 7 packages`).
4. Confirmed resolution: `node_modules/typescript/package.json` → `name: @typescript/typescript6, version: 6.0.2`; `node_modules/@typescript/native/package.json` → `name: typescript, version: 7.0.2`; `node_modules/vue-tsc/package.json` → `version: 3.3.14`.
5. Edited **only the probe's** `tsconfig.web.json` to the CONTEXT.md-mandated `include`-glob form (§ Architecture Patterns Pattern 1 above), with `"vite/client"` added to `types` (the Pitfall 1 fix) and `shims-vue.d.ts` excluded (the CONTEXT.md decision).
6. Ran `npx vue-tsc --noEmit -p tsconfig.web.json` in the probe.
7. Removed the probe entirely: `git worktree remove /tmp/loopnote-typecheck-probe --force`; confirmed `git -C /Users/alessandro/projects/diff-review status --porcelain` empty before and after.

### Part 1 — Baseline failure (reproduced verbatim in the real, unmodified repo)

```
$ cd /Users/alessandro/projects/diff-review && npx vue-tsc --noEmit -p tsconfig.web.json
node:internal/modules/cjs/loader:692
      throw e;
      ^

Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports" in /Users/alessandro/projects/diff-review/node_modules/typescript/package.json
    at exportsNotFound (node:internal/modules/esm/resolve:310:10)
    ...
    at Object.run (/Users/alessandro/projects/diff-review/node_modules/vue-tsc/index.js:40:32)
    at Object.<anonymous> (/Users/alessandro/projects/diff-review/node_modules/vue-tsc/bin/vue-tsc.js:2:24) {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
}

Node.js v24.15.0
```
`[VERIFIED: live reproduction, this session]` — matches `STACK.md`'s prior finding exactly; current pinned versions confirmed: `typescript@7.0.2` (plain, unaliased), `vue-tsc@3.3.7`, no `@typescript/native` entry.

### Part 2 — Post-fix error count (the planner's sizing number)

**Raw first-pass count (config gap still open, `types: ["node"]`):** 27 errors across 8 files, 8 distinct error codes — includes the Pitfall-1 noise.

**Real count after closing the `vite/client` config gap — this is the number to plan against:**

```
19 errors, 4 files
```

| File | Error count | Error codes present |
|------|-------------|----------------------|
| `src/web/components/DiffWorkspace.vue` | 11 | `TS2322`×2, `TS2345`×6, `TS18047`×1, `TS18048`×3, `TS18048`×1 (view-zone DOM ref: `HTMLElement \| null` vs. a signature expecting `HTMLElement \| undefined`/non-null, plus a possibly-`null`/`undefined` `zone`) |
| `src/web/App.vue` | 5 | `TS2322`×2 (`session.value` possibly-undefined union not assignable to a non-undefined prop type), `TS18048`×2 (`session.value` possibly `undefined`), `TS2719`×1 (two structurally-identical-but-nominally-different `AttachedLifecycle` type declarations — a duplicate-type-identity collision, not a value bug) |
| `src/web/components/DraftRecovery.vue` | 2 | `TS2339`×2 (`foundVersion`/`supportedVersion` accessed on a narrowed union member — `ReadOnlyDraftLoad`'s `"malformed"` variant — that doesn't carry those fields) |
| `src/web/components/ReviewNotesDialog.vue` | 1 | `TS2322`×1 (string literal `"success"` not assignable to the `UiIconName` union — a UI-icon-name typo/drift) |

By error code (final 19): `TS2345`×6, `TS18048`×5, `TS2322`×4, `TS2339`×2, `TS2719`×1, `TS18047`×1.

**One-line examples (verbatim, final run):**
```
src/web/components/DiffWorkspace.vue(172,9): error TS2345: Argument of type 'HTMLElement | null' is not assignable to parameter of type 'Element | ShadowRoot'.
src/web/App.vue(1443,8): error TS2719: Type 'AttachedLifecycle | undefined' is not assignable to type 'AttachedLifecycle | undefined'. Two different types with this name exist, but they are unrelated.
src/web/components/DraftRecovery.vue(142,43): error TS2339: Property 'foundVersion' does not exist on type 'ReadOnlyDraftLoad'.
src/web/components/ReviewNotesDialog.vue(205,19): error TS2322: Type '"success"' is not assignable to type 'UiIconName'.
```

**DEV-only prototypes (`src/web/prototypes/*.vue`):** included by the `src/web/**/*.vue` glob (CONTEXT.md decision) and produce **0 errors** in the final (`vite/client`-fixed) run — the 2 `TS2882` css-side-effect-import errors they produced in the raw first pass disappear once `vite/client` is in `types` (Pitfall 1).

**`shims-vue.d.ts` in vs. out of scope — confirmed no material difference:** Re-ran with the exclusion removed (`"exclude": []`, shim picked up by the `*.ts`/`*.d.ts` glob match) — identical 19-error output, `diff` between the two runs is empty. See Pitfall 2 for why.

**`typecheck:tests:web` moved to vue-tsc (CONTEXT.md decision) — confirmed zero additional fix burden:** Ran `npx vue-tsc --noEmit -p tsconfig.web.test.json` (extends `tsconfig.web.json`, adds `tests/**/*.ts`) in the same fixed-config probe — same 19 errors, same 4 files, 0 new test-specific errors. Moving this script to vue-tsc is "free" from a sizing perspective.

### Part 3 — TYPE-02 proof: native-build output unchanged

Method: SHA-256 hash listing of every `dist/*.js` file, compared between (a) a clean `rm -rf dist && npm run build:node` on unmodified `main` in the real repo, and (b) the same command in the fully-aliased probe worktree.

```
$ cd /Users/alessandro/projects/diff-review && rm -rf dist && npm run build:node   # unmodified main
$ find dist -type f -name "*.js" | sort | xargs shasum -a 256 > baseline-hashes.txt   # 50 files

$ cd /tmp/loopnote-typecheck-probe && npm run build:node                               # aliased toolchain
$ find dist -type f -name "*.js" | sort | xargs shasum -a 256 > probe-hashes.txt       # 50 files

$ diff baseline-hashes.txt probe-hashes.txt && echo "BYTE-IDENTICAL: all file hashes match"
BYTE-IDENTICAL: all file hashes match
```
`[VERIFIED: live reproduction]` — 50/50 file hashes match exactly. Also confirmed the mechanism: `node_modules/.bin/tsc` is a symlink to `../@typescript/native/bin/tsc` (not `../typescript/bin/tsc`) in the aliased probe, and `node_modules/.bin/tsc --version` reports `Version 7.0.2` — i.e. `build:node`'s unchanged `"tsc --project tsconfig.json"` script invocation already gets the real native compiler with zero script edits, because npm's bin-linking keys off each package's own declared `bin` field, not the devDependency alias name.

**Recommended proof step for the plan:** reuse this exact `shasum -a 256` listing-and-diff method as a scripted or documented verification task — it's cheap (runs in seconds), deterministic, and needs no new tooling.

### Part 4 — Negative-gate proof (CONTEXT.md "Specific Ideas": gate must demonstrably fail on a bad prop type)

Injected a deliberately wrong prop type into `src/web/components/PathDisplay.vue` (passed a numeric literal `42` where `PathText.vue`'s `defineProps<{ display: string }>()` expects a string), re-ran the gate, then reverted:

```
$ sed -i '' 's/:display="file.oldPath.display"/:display="42"/' src/web/components/PathDisplay.vue
$ npx vue-tsc --noEmit -p tsconfig.web.json | grep PathDisplay
src/web/components/PathDisplay.vue(38,67): error TS2322: Type 'number' is not assignable to type 'string'.

$ cp PathDisplay.vue.bak src/web/components/PathDisplay.vue   # revert
$ npx vue-tsc --noEmit -p tsconfig.web.json | grep -c PathDisplay
0
```
`[VERIFIED: live reproduction]` — confirms the gate actually fails (not just passes) on a real prop-type mismatch, and that the revert is clean (0 diff restored).

### Cleanup confirmation

```
$ git worktree remove /tmp/loopnote-typecheck-probe --force
$ git worktree list
/Users/alessandro/projects/diff-review    cc890a6 [main]
/Users/alessandro/.omp/wt/restyle-dc04bec cb972a6 [restyle]
$ rm -rf dist   # build:node artifact from Part 3's baseline run (dist/ is gitignored)
$ git -C /Users/alessandro/projects/diff-review status --porcelain
(empty)
```
Real repo's tracked working tree (`package.json`, `package-lock.json`, `tsconfig.web.json`, every `.vue`/`.ts` under `src/web`) was never modified — only the disposable worktree at `/tmp/loopnote-typecheck-probe` (now removed) and the gitignored `dist/` build artifact (now removed) were touched.

## Code Examples

### `npm run typecheck:web` script update
```jsonc
// package.json "scripts" — was: "tsc --noEmit --project tsconfig.web.json"
"typecheck:web": "vue-tsc --noEmit --project tsconfig.web.json",
// typecheck:tests:web moves the same way (CONTEXT.md decision):
"typecheck:tests:web": "vue-tsc --noEmit --project tsconfig.web.test.json",
// build:node and typecheck:tests:node stay on plain tsc — already resolve to the
// real @typescript/native 7.0.2 binary via node_modules/.bin after the alias change.
```

### CI wiring (`repository-gates` job, confirmed current structure)
```yaml
# .github/workflows/deploy-supabase-production.yml
jobs:
  repository-gates:
    steps:
      - run: npm run build
      - run: npm run typecheck:web      # ← new line this phase adds
      - run: npm run typecheck:tests
      - run: npx playwright install --with-deps chromium
      - run: npx vitest run --no-file-parallelism
      - run: npx playwright test
```
`[VERIFIED: current file read directly]` — `repository-gates` already gates `deploy-production` via `needs: repository-gates`; adding one line puts the new typecheck in the existing push-to-`main` blocking path with no new job needed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding `"vite/client"` to `tsconfig.web.json`'s `types` array is the correct/only fix for the 8-error config-gap (vs., e.g., excluding `monaco/configure.ts` and the two prototype `.vue` files from scope instead). | Common Pitfalls Pitfall 1, Live Reproduction Part 2 | Low — this is within "Claude's Discretion: exact tsconfig layering" per CONTEXT.md, verified empirically to fully resolve the 8 errors with no new ones introduced, and matches the pattern `tsconfig.web.test.json` already uses. If the planner prefers a different fix (e.g. excluding prototypes), the 19-error "real" count would need re-measuring, but the underlying 19 component-logic errors are unaffected either way. |

**All other claims in this research are `[VERIFIED]` via live command execution in this session** (toolchain resolution, error counts, byte-identical build output, negative-gate proof, npm registry metadata, package-legitimacy check) or `[CITED]` from the project's own prior research (`STACK.md`, `PITFALLS.md`) and the current repository source/config files read directly.

## Open Questions (RESOLVED)

1. **Should the `AttachedLifecycle` `TS2719` duplicate-type-identity error (`App.vue:1443`) be fixed by consolidating to a single exported type, or by a local type assertion?**
   - What we know: Two structurally-identical `AttachedLifecycle` declarations exist in different modules and TS treats them as nominally distinct at this one call site.
   - What's unclear: Which module should become the single source of truth without touching `src/domain/anchor.ts`-adjacent code outside this phase's intended surface (per `PITFALLS.md` Critical Pitfall 4's read-only guidance on anchor-identity code — verify `AttachedLifecycle` isn't anchor-related before consolidating; a quick grep shows it is not, it's in the attached/agent-lifecycle domain).
   - Recommendation: Planner assigns this as one discrete fix task; trivial in isolation (import the same type in both places) but worth its own verification step since `TS2719` errors are a common source of "looks fixed but isn't" (fixing by re-declaring rather than importing re-creates the duplicate).
   - **RESOLVED:** Accepted as written — Plan 19-03 Task 1 consolidates to a single exported type (not a local assertion), matching this recommendation verbatim.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm install`, `vue-tsc`, `tsc`, build scripts | ✓ | v24.15.0 | — |
| npm | dependency install/alias resolution | ✓ | 11.12.1 | — |
| `git worktree` | isolated probe methodology used in this research | ✓ | (repo is a git working tree; `git worktree add/remove` succeeded) | — |
| node-gyp / native toolchain | `npm install`'s `node-gyp rebuild` postinstall (native addon) | ✓ | Python 3.14.4 found; build succeeded in both the real repo and the probe | — |

No missing dependencies — the entire fix and measurement ran cleanly with the environment as-is.

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` (`security_asvs_level: 1`), but this phase makes no runtime, request-handling, or data-persistence changes — it only edits `package.json` devDependencies, `tsconfig.web.json`, and one CI YAML line, plus whatever source-level type-narrowing fixes the 19 errors require (null-checks, type consolidation, union narrowing — no new I/O, auth, or validation surfaces).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No auth surface touched. |
| V3 Session Management | No | No session surface touched. |
| V4 Access Control | No | No route/permission surface touched. |
| V5 Input Validation | No | No new input path; fixes are compile-time type narrowing of already-validated data (e.g. `session.value` null-checks), not new runtime validation logic. |
| V6 Cryptography | No | Not applicable to this phase. |

**Known Threat Patterns for this stack:** None newly introduced by this phase — the `package-legitimacy` audit above (new `vue-tsc@3.3.14` + two Microsoft-published alias packages, no postinstall scripts) is the only supply-chain-relevant surface, and it is `OK`/flagged-`SUS`-with-checkpoint as documented.

## Sources

### Primary (HIGH confidence)
- Live reproduction in this session: baseline `ERR_PACKAGE_PATH_NOT_EXPORTED` failure, dual-alias install + resolution chain, 19-error/4-file measurement, byte-identical `dist/` build proof, negative-gate proof — all commands and output captured above.
- `npm view vue-tsc@3.3.14`, `npm view @typescript/typescript6@6.0.2 dependencies`, `npm view typescript@7.0.2`, `npm view typescript dist-tags`, `npm view vue-tsc dist-tags` — registry metadata, 2026-11-04.
- `gsd-tools query package-legitimacy check` — verdicts for `vue-tsc`, `@typescript/typescript6`, `typescript`, 2026-11-04.
- `.planning/research/STACK.md` — original live reproduction of the `ERR_PACKAGE_PATH_NOT_EXPORTED` failure and the official [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) dual-alias scheme citation, treated as given per assignment.
- `.planning/research/PITFALLS.md` Critical Pitfall 8 and its Pitfall-to-Phase Mapping entry — adoption-risk framing for this phase, treated as given per assignment.
- `src/web/App.vue`, `src/web/components/DiffWorkspace.vue`, `src/web/components/DraftRecovery.vue`, `src/web/components/ReviewNotesDialog.vue`, `src/web/components/ui/PathText.vue`, `src/web/components/PathDisplay.vue`, `src/web/main.ts`, `src/web/monaco/configure.ts`, `tsconfig.web.json`, `tsconfig.web.test.json`, `tsconfig.json`, `package.json`, `.github/workflows/deploy-supabase-production.yml` — read directly in this session.

### Secondary (MEDIUM confidence)
None beyond the above — all claims in this document were either verified by live command execution this session or cited directly from the project's own prior-phase research documents.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — toolchain scheme verified against official Microsoft documentation (via STACK.md's existing citation) and confirmed by live install/resolution in this session.
- Architecture: HIGH — tsconfig pattern verified by live run against the real source tree producing the reported error counts.
- Pitfalls: HIGH — both pitfalls in this document (`vite/client` gap, `shims-vue.d.ts` no-op) are original findings from this session's live reproduction, not carried over from prior research.

**Research date:** 2026-11-04
**Valid until:** Scope is a one-time toolchain/config fix for a pinned set of npm versions and a fixed source tree snapshot — treat as valid through the end of this phase's execution; re-measure the error count if `src/web` changes materially before this phase's fix-work plans are executed.
