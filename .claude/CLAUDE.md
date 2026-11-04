<!-- GSD:project-start source:PROJECT.md -->

## Project

**Loopnote**

Loopnote is a local-first code review application for developers who want a GitHub pull-request-style review experience without publishing branches or worktrees to a remote host. A CLI launched inside a Git repository opens a browser workspace where the developer selects two local branches or registered worktrees, reviews PR-style changes side by side, leaves line comments and an overall summary, and exports the result as Markdown plus canonical JSON that a coding agent can apply.

**Core Value:** A developer can accurately review committed changes between any two local branch or worktree heads and export precise, drift-detectable feedback an agent can act on.

### Constraints

- **Runtime**: Node.js 24 LTS with TypeScript end to end — one language across CLI, server, shared contracts, and UI, using the current supported LTS baseline.
- **Git semantics**: Invoke the installed Git CLI as the source of truth — merge bases, refs, worktrees, renames, diff metadata, and blobs must match Git behavior.
- **CLI**: Commander with an Inquirer-based searchable selector — launch is interactive and ordered base/head selection is explicit.
- **Server**: Fastify bound only to `127.0.0.1` on an ephemeral port — the default browser opens automatically and no LAN service is exposed.
- **UI**: Vue 3 with Vite and Monaco Diff Editor — side-by-side diff rendering, line mapping, syntax highlighting, and inline review controls run in the browser.
- **Contracts**: Zod schemas shared by API, draft persistence, and export generation — incompatible or corrupt data fails explicitly.
- **Persistence**: Versioned JSON files in a gitignored repository-local `.loopnote/` directory — no database or browser-only source of truth.
- **Content**: Text files only in v1 — binary, generated, oversized, or unsupported files remain visible as non-reviewable entries.
- **Testing**: Vitest for Git, diff, persistence, and export contracts; Playwright for the browser review flow.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommendation

| Area | Choice | Why |
|------|--------|-----|
| Runtime | Node.js 24 LTS, ESM, TypeScript | Node 24 is the current LTS as of 2026-07-11. It supports the CLI, local HTTP server, filesystem, child processes, and cross-platform browser launch without a second runtime. |
| Package manager | npm | Native `bin` packaging and the least surprising global or `npx` installation path for a single-package CLI. |
| CLI | Commander + `@inquirer/search` | Commander provides conventional command/help behavior; Inquirer provides an ordered, searchable base/head picker. |
| Git integration | `node:child_process.spawn` with argument arrays | Native Git remains the authority for refs, worktrees, merge bases, rename detection, attributes, and object reads. Avoid shell interpolation and a second Git semantics implementation. |
| Local API | Fastify 5 + `@fastify/static` | Small plugin-oriented server, schema hooks, `inject()` testing, static asset serving, explicit `127.0.0.1` binding, and ephemeral-port support. |
| Web UI | Vue 3 + Vite + TypeScript | User-selected UI stack; Vue Composition API fits review state and Vite builds the browser bundle shipped with the CLI. |
| Diff UI | Monaco Editor `createDiffEditor` | Provides side-by-side rendering, syntax highlighting, line changes, original/modified editor access, accessibility labels, hidden unchanged regions, view zones, decorations, and keyboard commands. |
| Validation | Zod | One runtime schema for HTTP payloads, repository-local drafts, and canonical review JSON. Derive TypeScript types from schemas rather than maintaining parallel interfaces. |
| Persistence | Versioned JSON with atomic replace | Repository-local drafts do not need a database. Write a temporary sibling file, fsync as appropriate, then rename to avoid partial drafts. |
| Tests | Vitest + Fastify `inject()` + Playwright | Vitest covers Git fixtures and deterministic serializers; Fastify injects API requests without ports; Playwright covers the actual picker-to-comment-to-export browser contract. |
| Build | `tsc` for Node/shared code + Vite for UI | Boring, transparent builds. Publish the server output and Vite assets in one npm package with a `bin` entry. |

## Git Boundary

- repository discovery and common directory
- local branch enumeration
- `git worktree list --porcelain -z` parsing
- ref/worktree `HEAD` resolution to full commit IDs
- dirty-state detection for worktree labels and warnings
- merge-base resolution
- changed-file metadata with NUL-delimited output and rename/copy status
- blob metadata and bytes by object ID

## Monaco Integration

- `IStandaloneDiffEditor.getOriginalEditor()` and `.getModifiedEditor()`
- `IDiffEditor.onDidUpdateDiff`
- `IDiffEditor.getLineChanges()`
- `ICodeEditor.changeViewZones()` and content-widget APIs
- `renderSideBySide`, `diffAlgorithm`, `maxFileSize`, and `hideUnchangedRegions`

## Version Guidance

- Require Node.js `>=24` for the first release rather than the earlier provisional `>=22` baseline; Node 24 is current LTS.
- Pin dependency ranges through the lockfile and publish tested minimums in `engines`.
- Do not add a Git JavaScript library unless the native adapter proves insufficient. Existing local-review tools using `simple-git` still ultimately depend on Git and add an abstraction that does not remove subprocess or semantic risk.

## Alternatives Considered

### `@pierre/diffs`

### `react-diff-view`

### Rust CLI/server

### SQLite

## Sources

- [Node.js releases](https://nodejs.org/en/about/previous-releases) — Node 24 is current LTS on the research date.
- [Fastify server reference](https://fastify.dev/docs/latest/Reference/Server/) — `listen()` supports explicit hosts and port `0`; the chosen port is available from the server address.
- [Monaco published type definitions](https://unpkg.com/monaco-editor@latest/monaco.d.ts) — current diff editor, line-change, hidden-region, decoration, and view-zone APIs.
- [Monaco Editor repository](https://github.com/microsoft/monaco-editor) — canonical implementation and examples.
- [diffmux](https://github.com/Nicomalacho/diffmux) — local agent-review precedent using `@pierre/diffs`, including documented annotation tradeoffs.
- [PRless](https://github.com/muhammadZihad/prless) — close TypeScript/Fastify/browser precedent and useful scope comparison.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

- **Spike findings for Loopnote** (implementation patterns, constraints, gotchas) → `Skill("spike-findings-loopnote")`
- **Sketch findings for Loopnote** (design decisions, CSS patterns, visual direction) → `Skill("sketch-findings-loopnote")`
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
