---
phase: 16-rendered-markdown-preview
fixed_at: 2026-10-31T14:15:16Z
review_path: .planning/phases/16-rendered-markdown-preview/16-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-10-31T14:15:16Z
**Source review:** .planning/phases/16-rendered-markdown-preview/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (0 critical, 3 warning, 0 info)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Base-side preview image reads the live worktree, not the git-tracked base blob

**Files modified:** `src/server/capabilities.ts`, `src/server/patch-snapshot.ts`
**Commit:** `ba1827e`
**Applied fix:** All three non-pinned `readRelativeImage` implementations
(`createExactPatchCapabilityRegistry`, `createUncommittedCapabilityRegistry`,
`createStandaloneCapabilityRegistry`) now check, before falling back to a
live worktree-disk read, whether the resolved relative path matches one of
the diff's own `changedFiles` entries (`oldPath.display`/`newPath.display`).
If it does and the image existed at base (`oldMode !== '000000'`), the base
blob is served instead of disk bytes:

- **exact-patch:** a new `PatchSnapshot.readPreimageBytes(fileId)` method
  reuses the existing digest-verified `readSide()` without the text-only
  `availability.kind` filter that the public `readContent()` applies
  (`materializePatchSnapshot` already writes preimage/postimage bytes to
  the materialized snapshot directory for every changed file, images
  included — only the public accessor restricted it to text).
- **uncommitted/standalone:** a dedicated `ObjectReader` (`options.objectReader
  ?? createObjectReader(scope.repositoryRoot)`, matching the pattern the
  pinned registry already uses) reads `oldBlobOid` directly, since
  `WorktreeSnapshot`'s capture step only ever captures bytes for
  text-availability files — its `readContent()` has nothing to return for
  an image.

**Adaptation from the review's literal fix snippet:** the review's suggested
code falls back to a worktree-disk read whenever `changedEntry.oldMode ===
'000000'` (image newly added, no base version exists). That would silently
serve the post-change image on the "before" pane again — the exact bug
being fixed — contradicting the review's own stated intent ("only fall back
... for images that are not part of the diff"). The applied fix instead
returns `undefined` (→ 409, the route's existing "no image available"
contract) in that case, so a reviewer sees "no base image" rather than a
silently-wrong one. Head-side reads and "unchanged sibling asset" base-side
reads are unchanged (still live-disk, which is correct for both).

**Regression test:** `tests/api/image-route.test.ts` — a new exact-patch
fixture (`exactPatchGroundedWithChangedImage`) makes the embedded image
itself a changed file with distinct preimage/postimage bytes and a third,
distinct live-worktree value. Confirmed (by checking out the pre-fix
source) that `side=base` previously returned the live-disk bytes and now
returns the materialized preimage; `side=head` is unaffected.

### WR-02: Image `src` scheme validator is a bypassable blocklist, inconsistent with the link allowlist

**Files modified:** `src/web/model/markdown-preview.ts`
**Commit:** `1cec47f`
**Applied fix:** `validateImageHref` now strips embedded `\t`/`\r`/`\n`
globally (not just leading/trailing via `.trim()`) before running the
scheme checks, applied exactly as 16-REVIEW.md's Fix section shows. The
function is now exported so it can be unit-tested directly.

**Adaptation note:** through the full `renderMarkdownPreview()` pipeline,
markdown-it's own `normalizeLink` (via `mdurl.encode`) percent-encodes raw
control characters *before* calling `validateImageHref` during image-rule
parsing (confirmed empirically: `![x](<ja\tvascript:alert(1)>)` arrives at
the validator as `ja%09vascript:...`, not a literal tab). This means the
specific end-to-end exploit chain the review describes (a literal
unescaped control character reaching the rendered `<img src>` attribute) is
not fully reachable through the public API today — an existing
defense-in-depth layer the review did not flag. The fix is applied exactly
as specified regardless, since `validateImageHref` is still a structurally
bypassable blocklist that should not rely on an incidental upstream
encoding step it does not control, and the function is reusable outside
this one call site.

**Regression test:** `tests/unit/markdown-preview.test.ts` — calls the
now-exported `validateImageHref` directly with the literal
control-character payloads from the review (`ja\tvascript:...`,
`da\nta:...`, `da\rta:...`). Confirmed these return `true` (allowed) against
the pre-fix function body and `false` (rejected) against the fix.

### WR-03: Relative image path resolution doesn't guard against control characters, so a malformed `src` throws instead of yielding the documented 409

**Files modified:** `src/server/image-content.ts`
**Commit:** `af0254d`
**Applied fix:** `resolveRelativeImagePath` now rejects decoded paths
containing C0 control characters (`\u0000`-`\u001f`) alongside the existing
empty/leading-`/` checks, applied exactly as 16-REVIEW.md's Fix section
shows.

**Regression test:** `tests/api/image-route.test.ts` and
`tests/unit/...` — unit-level `resolveRelativeImagePath('docs/readme.md',
'./assets/logo%00.png')` now returns `undefined` instead of
`'docs/assets/logo\u0000.png'`; an API-level test against the exact-patch
session (which uses `readWorktreeImageBytes`, the function whose catch
block only recognizes `ENOENT`/`ENOTDIR`) confirms the route now returns
**409** for a `%00`-containing path. Confirmed against the pre-fix source
that this same request previously returned an uncaught **500**.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-10-31T14:15:16Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
