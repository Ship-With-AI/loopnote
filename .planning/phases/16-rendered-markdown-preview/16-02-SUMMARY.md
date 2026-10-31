---
phase: 16-rendered-markdown-preview
plan: 02
subsystem: api
tags: [server, images, path-safety, git, security]

# Dependency graph
requires:
  - phase: 15-standalone-file-review
    provides: "per-segment lstat-before-descend symlink discipline precedent (D-04/FILE-04), applied here via a new string-path-based equivalent for images"
provides:
  - "resolveRelativeImagePath(markdownDisplayPath, rawSrc): repo-root-relative POSIX path resolution for a Markdown image src, rejecting traversal/absolute/empty/malformed-percent-encoded srcs"
  - "readWorktreeImageBytes(repositoryRoot, relativePath): per-segment lstat worktree-disk byte read, rejecting any symlink segment, bounded by MAX_IMAGE_BYTES"
  - "readCommittedImageBytes(repositoryRoot, commitOid, relativePath, runner, reader): git ls-tree + ObjectReader blob resolution, rejecting non-blob tree entries"
  - "IMAGE_CONTENT_TYPE_BY_EXTENSION allow-list (png/jpg/jpeg/gif/svg/webp)"
  - "CapabilityRegistry.readRelativeImage(fileId, side, relativeSrc), implemented in all four factory functions via a shared resolveImageBytes helper"
  - "GET /api/files/:fileId/image?path=&side= same-origin route (400 invalid query, 404 unknown file, 409 unavailable/unsafe, 200 + bytes otherwise)"
affects: [16-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "node:path/posix join+normalize for relative-path resolution, with an explicit pre-join reject of any src starting with '/' (join alone does not reset to absolute mid-argument, so this check cannot be folded into the post-join escape check)"
    - "GitRunner and ObjectReader are both explicit function parameters on readCommittedImageBytes, making it unit-testable with stub doubles even though the four capability-registry factories themselves call the real createGitRunner() per the codebase's existing per-call-runner precedent"
    - "Shared resolveImageBytes(markdownPath, relativeSrc, readBytes) helper in capabilities.ts factors the four factories' identical path-safety + content-type-allow-list gating from their differing byte-source (git-tree vs worktree-disk) and file-lookup technique (Map.get vs snapshot.files().find)"

key-files:
  created:
    - src/server/image-content.ts
    - tests/api/image-route.test.ts
  modified:
    - src/server/capabilities.ts
    - src/server/routes.ts

key-decisions:
  - "Committed-comparison sessions resolve referenced images via git ls-tree <pinned-commit-oid> -- <path> (git itself resolves nested paths without -r, confirmed empirically against this repository), never via worktree disk, since the pinned commit is the only trustworthy source for that side"
  - "Exact-patch/uncommitted/standalone sessions all resolve referenced images via worktree-disk read regardless of requested side, since an unchanged sibling image is by definition identical on disk for those three session kinds — no per-side git-tree lookup exists for them"
  - "Extension allow-list check happens before any read is attempted (short-circuited in the shared resolveImageBytes helper), so a non-allow-listed extension never triggers a git subprocess call or filesystem read"
  - "readWorktreeImageBytes catches both ENOENT and ENOTDIR (the precedent in exact-patch.ts's worktreeEntry only caught ENOENT) to avoid an uncaught exception when the relative path's intermediate segment is a regular file rather than a directory"

patterns-established:
  - "Same-origin repo-local binary content routes serve bytes via reply.type(contentType).send(bytes) with a closed CapabilityRegistry method gating every read, mirroring the existing readContent/verifyAnchor closed-capability shape"

requirements-completed: [MDV-04]

# Metrics
duration: 45min
completed: 2026-10-31
status: complete
---

# Phase 16 Plan 02: Same-Origin Repo-Local Image Content Route Summary

**A `GET /api/files/:fileId/image?path=&side=` route resolving a Markdown file's relative image reference to real bytes — via `git ls-tree` + `ObjectReader` for committed-comparison sessions, via a per-segment-`lstat` worktree-disk read for the other three session kinds — behind a path-safety + extension-allow-list gate that never reaches the filesystem or git object store for an unsafe or non-image path.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-31T12:38:00Z
- **Completed:** 2026-10-31T13:23:00Z
- **Tasks:** 2 (each RED → GREEN)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `resolveRelativeImagePath` joins a Markdown file's own display path against its raw `src` using `node:path/posix`, decoding percent-encoding first, and rejects traversal (`../outside`), absolute (`/etc/passwd`), empty, and malformed-percent-encoded inputs — 7 unit cases, all passing.
- `readWorktreeImageBytes` replicates `exact-patch.ts`'s `worktreeEntry` per-segment-`lstat` discipline (simplified: any symlink segment, intermediate or final, is rejected; `fs.realpath` is never called), bounded by `MAX_IMAGE_BYTES` (10 MiB) checked both before and after the read — verified against real symlink/oversized-file/missing-path fixtures.
- `readCommittedImageBytes` parses `git ls-tree <commitOid> -- <path>`'s single-line tab-delimited output the same way `exact-patch.ts`'s `repositoryTree` parses its `-z`-delimited output, rejects non-`blob` entries (tree/submodule), and bounds the subsequent `ObjectReader.read` call by `MAX_IMAGE_BYTES` — verified with a stub `GitRunner`/`ObjectReader` pair, and end-to-end against a real two-commit git fixture through the live `GET` route.
- `readRelativeImage` is implemented in all four `CapabilityRegistry` factories (`createCapabilityRegistry` via git-tree resolution; `createExactPatchCapabilityRegistry`/`createUncommittedCapabilityRegistry`/`createStandaloneCapabilityRegistry` via worktree-disk resolution) through one shared `resolveImageBytes` helper that gates path-safety and the extension allow-list before either byte source is touched.
- `GET /api/files/:fileId/image` is registered immediately after `/api/files/:fileId/content`, following its exact validate → lookup → gate → serve sequence: 400 for an invalid/missing/extra query param, 404 for an unknown `fileId`, 409 for any path-safety/extension/read failure, 200 with the resolved bytes and content-type otherwise.
- 29 tests total, all passing; `tsc --project tsconfig.json` clean; `img-src` directive count in `src/server/security.ts` unchanged (grep count still 1) — zero CSP widening, confirming the route is same-origin as required.

## Task Commits

Each task was committed atomically as a RED step and a GREEN step:

1. **Task 1 (RED): Failing image-content.ts path-safety and byte-read helper tests** - `aa21160` (test)
2. **Task 1 (GREEN): Implement resolveRelativeImagePath, readWorktreeImageBytes, readCommittedImageBytes, IMAGE_CONTENT_TYPE_BY_EXTENSION** - `6386c4f` (feat)
3. **Task 2 (RED): Failing GET /api/files/:fileId/image route tests** - `60d0f49` (test)
4. **Task 2 (GREEN): Wire readRelativeImage into all four capability registries and the Fastify route** - `653bdac` (feat)

_TDD tasks: test → feat per task, as expected; no separate refactor task was specified by this plan._

## Files Created/Modified
- `src/server/image-content.ts` - New module: `resolveRelativeImagePath`, `readWorktreeImageBytes`, `readCommittedImageBytes`, `IMAGE_CONTENT_TYPE_BY_EXTENSION`, `MAX_IMAGE_BYTES`
- `tests/api/image-route.test.ts` - New test file: 19 image-content unit cases (path-safety, worktree-disk read, committed-tree read, content-type allow-list) + 10 route-level cases (committed-comparison base/head serving and negative paths; exact-patch worktree-disk serving and symlink rejection)
- `src/server/capabilities.ts` - Added `type AnchorSide` to the existing anchor.js import; added `readRelativeImage` to the `CapabilityRegistry` type; added `imageContentTypeFor`/`resolveImageBytes` module-level helpers; implemented `readRelativeImage` in all four `create*CapabilityRegistry` factories
- `src/server/routes.ts` - Added `zod` import, a local `FileImageQuerySchema`, and the `GET /api/files/:fileId/image` route immediately after the existing `/content` route

## Decisions Made
- See `key-decisions` in frontmatter. No `AskUserQuestion`-equivalent decision points were encountered — the plan's `<behavior>`/`<implementation>` sections fully specified every branch, including the explicit `resolveRelativeImagePath('readme.md', '/etc/passwd') → undefined` test case that drove the pre-join absolute-path rejection design.

## Deviations from Plan

### Auto-fixed Issues
None. Both tasks' RED steps failed exactly as expected (missing module; 404s from the not-yet-registered route) and both GREEN steps passed on the first implementation attempt — no bugs, missing functionality, or blocking issues were discovered during execution.

**Total deviations:** 0.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `CapabilityRegistry.readRelativeImage` and `GET /api/files/:fileId/image` are available for Plan 16-03 (`RenderedMarkdownView.vue`) to call when rendering an inline `<img>` for a relative Markdown image reference.
- `read_first` flagged that Plan 16-07 (same wave) also edits `routes.ts`'s `addComment` branch and `capabilities.ts`'s four `verifyAnchor` closures for the unrelated A-01 range-anchor schema — distinct methods/branches from this plan's `GET /api/files/:fileId/image` route and `readRelativeImage` additions; no overlap was observed in the diffs produced here.
- No blockers.

---
*Phase: 16-rendered-markdown-preview*
*Completed: 2026-10-31*

## Self-Check: PASSED

- FOUND: src/server/image-content.ts
- FOUND: tests/api/image-route.test.ts
- FOUND: .planning/phases/16-rendered-markdown-preview/16-02-SUMMARY.md
- FOUND commits: aa21160 (test), 6386c4f (feat), 60d0f49 (test), 653bdac (feat) — all present via `git log --oneline --all --grep="16-02"`
