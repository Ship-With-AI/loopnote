---
phase: 16-rendered-markdown-preview
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - src/contracts/api.ts
  - src/contracts/draft.ts
  - src/domain/anchor.ts
  - src/server/capabilities.ts
  - src/server/image-content.ts
  - src/server/routes.ts
  - src/web/App.vue
  - src/web/components/ActiveFileToolbar.vue
  - src/web/components/DiffWorkspace.vue
  - src/web/components/RenderedMarkdownView.vue
  - src/web/model/markdown-it-image.d.ts
  - src/web/model/markdown-preview.ts
  - src/web/model/rendered-markdown-blocks.ts
  - src/web/model/workspace-command.ts
  - src/web/model/workspace-state.ts
  - src/web/monaco/diff-adapter.ts
  - src/web/styles.css
  - tests/api/anchor.test.ts
  - tests/api/image-route.test.ts
  - tests/e2e/rendered-markdown-preview.spec.ts
  - tests/e2e/rendered-markdown-security.spec.ts
  - tests/helpers/git-fixture.ts
  - tests/unit/anchor.test.ts
  - tests/unit/draft-reconciliation.test.ts
  - tests/unit/git-fixture-markdown-preview.test.ts
  - tests/unit/markdown-preview.test.ts
  - tests/unit/monaco-diff-adapter.test.ts
  - tests/unit/rendered-markdown-blocks.test.ts
  - tests/unit/workspace-state.test.ts
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** deep
**Files Reviewed:** 29
**Status:** issues_found

## Summary

Reviewed the full Phase 16 diff (hardened markdown renderer, same-origin image-serving route,
`RenderedMarkdownView.vue`, source↔rendered mode wiring, and range-anchor (`endLine`) threading
through `anchor.ts`/`workspace-state.ts`/`diff-adapter.ts`) with special attention to the
untrusted-Markdown XSS surface and the new `GET /api/files/:fileId/image` route.

The XSS hardening itself is sound: `html: false` blocks raw HTML, `validateLink` is a strict
allowlist (`https:`/`mailto:` only), the image inline-rule override correctly blanks disallowed
`src` values before a DOM-unsafe token can exist, remote `https://` images are replaced with inert
placeholder text (no auto-fetch/tracking-pixel surface), and `parsed.innerHTML = html.value` in
`RenderedMarkdownView.vue` is safe given markdown-it is used exclusively through its token
pipeline with attribute escaping — no raw string concatenation anywhere in the new renderer rules.
Path traversal on the new image route is correctly blocked by `resolveRelativeImagePath`
(`node:path/posix` `normalize`/`join`, rejects `..`, absolute paths, and trailing slashes), and the
worktree disk reader correctly rejects symlinks at every path segment.

Three issues remain, all correctness/robustness gaps rather than directly exploitable holes (the
existing `img-src 'self'` CSP — unchanged, out of scope — currently backstops one of them):

1. The three worktree-backed capability registries (exact-patch, uncommitted, standalone) always
   resolve the markdown's **base-side** embedded image from the *live* worktree disk, even though
   the base-side *text* content for the same file is proven to come from the git-tracked
   pre-image blob. When the embedded image is itself part of the diff being reviewed, the "before"
   preview silently shows the current (post-change) image instead of the true pre-change image.
2. The image-specific link validator (`validateImageHref`) is a bypassable blocklist (unlike the
   link validator's strict allowlist): embedded tab/newline characters can smuggle a `javascript:`
   or `data:` scheme past the regex, relying entirely on an out-of-scope file's CSP for mitigation.
3. `resolveRelativeImagePath`/`readWorktreeImageBytes` do not guard against NUL/control characters
   in a decoded `src`, so a crafted path throws instead of yielding the documented 409 response.

## Warnings

### WR-01: Base-side preview image reads the live worktree, not the git-tracked base blob

**File:** `src/server/capabilities.ts:875-877` (`createExactPatchCapabilityRegistry`), `src/server/capabilities.ts:1201-1203` (`createUncommittedCapabilityRegistry`), `src/server/capabilities.ts:1436-1438` (`createStandaloneCapabilityRegistry`)

**Issue:** All three non-pinned `readRelativeImage` implementations resolve images for *both*
`side === 'base'` and `side === 'head'` via `readWorktreeImageBytes(repositoryRoot, resolvedPath)`
— i.e. whatever bytes currently sit on disk, regardless of which side was requested:

```ts
async readRelativeImage(fileId, side, relativeSrc) {
  const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
  const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
  return resolveImageBytes(markdownPath, relativeSrc, (resolvedPath) =>
    readWorktreeImageBytes(scope.repositoryRoot, resolvedPath),
  );
},
```

This contradicts how the *text* content for the same `base` side is sourced one function up
(`readContent`, same file). `src/server/worktree-snapshot.ts:326-328` proves the base-side
(pre-image) bytes for text files are **always** read from the git object store —
`readObjectBackedSide(objectReader, file.oldBlobOid)` — never from the live worktree, for every
`sourceKind` (`staged`, `unstaged`, `worktree`, `standalone`). `src/server/patch-snapshot.ts`
(`PatchSnapshot.readSide`, lines 328-342) shows the exact-patch registry goes even further: both
sides are served from a digest-verified, materialized snapshot directory entirely decoupled from
the live repository.

The project's own research notes acknowledge the scope of this shortcut
(`.planning/phases/16-rendered-markdown-preview/16-RESEARCH.md`): *"Exact-patch/uncommitted/
standalone sessions all resolve referenced images via worktree-disk read regardless of requested
side, since **unchanged** sibling image is by definition identical on disk."* That assumption only
holds when the referenced image is *not* itself one of the diff's changed files. When a reviewed
diff replaces an image that a markdown file embeds (e.g. a PR that updates a screenshot or
architecture diagram referenced from `README.md`), the base-side rendered preview will silently
show the **current** (head) image on both panes instead of the true "before" image — the opposite
of what a diff-review tool exists to show, and with no indication to the user that the preview is
wrong. The fixture used by the new e2e/unit tests never exercises this case
(`tests/helpers/git-fixture.ts:163-166`: `docs/assets/logo.svg` is written once before the base
commit and never rewritten for head), so nothing currently catches the regression.

**Fix:** Before falling back to `readWorktreeImageBytes`, check whether `resolvedPath` matches one
of the diff's own `changedFiles` entries (by `bytesBase64url`). If it does and a base-side blob is
known (`file.oldBlobOid` for uncommitted/standalone via the existing `ObjectReader`, or the
materialized `PatchSnapshot` preimage content for exact-patch), serve that instead of live disk
bytes; only fall back to the worktree read for images that are *not* part of the diff (the
"unchanged sibling" case the current code already handles correctly):

```ts
async readRelativeImage(fileId, side, relativeSrc) {
  const file = (await snapshot.files()).find((candidate) => candidate.id === fileId);
  const markdownPath = file === undefined ? undefined : side === 'base' ? file.oldPath : file.newPath;
  return resolveImageBytes(markdownPath, relativeSrc, async (resolvedPath) => {
    const changedEntry = (await snapshot.files())
      .find((candidate) => candidate.oldPath?.bytesBase64url === resolvedPath
        || candidate.newPath?.bytesBase64url === resolvedPath);
    if (side === 'base' && changedEntry !== undefined && changedEntry.oldMode !== '000000') {
      return readObjectBackedSide(objectReader, changedEntry.oldBlobOid); // image is itself part of the diff
    }
    return readWorktreeImageBytes(scope.repositoryRoot, resolvedPath); // unchanged sibling asset
  });
},
```

### WR-02: Image `src` scheme validator is a bypassable blocklist, inconsistent with the link allowlist

**File:** `src/web/model/markdown-preview.ts:131-137`

**Issue:** `validateLink` (used for `[text](href)`) is a strict allowlist
(`/^(?:https?:|mailto:)/iu`), which cannot be fooled by control-character smuggling since the
allowed prefixes must appear verbatim. The image-only validator takes the opposite, weaker shape
— a denylist that allows anything it doesn't recognize as dangerous:

```ts
function validateImageHref(href: string): boolean {
  const trimmed = href.trim();
  if (/^https?:/iu.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  return true;
}
```

`.trim()` only strips leading/trailing whitespace. Per the WHATWG URL spec, browsers strip ASCII
tab/newline characters *anywhere* in a URL before parsing its scheme — a well-known filter-bypass
technique. A markdown image reference such as `` ![x](ja\tvascript:alert(1)) `` or
`` ![x](da\nta:image/svg+xml;base64,...) `` fails to match the `^[a-z][a-z0-9+.-]*:` scheme pattern
(the embedded control character breaks the match), so `validateImageHref` falls through to its
default `return true`, and the renderer (`renderer.renderer.rules.image`, same file, lines
149-165) emits the literal `<img src="ja\tvascript:alert(1)">` since it only special-cases
`https?:` sources. The browser then re-derives `javascript:alert(1)` / `data:image/svg+xml;...`
after stripping the control character — exactly the schemes this validator exists to block.

Today this is caught by the (unchanged, out-of-scope) `img-src 'self'` directive in
`src/server/security.ts`, which also rejects `data:`/`javascript:` sources outright — so there is
no currently-reachable XSS. But that CSP directive is not this validator's job to rely on, it is
not re-verified anywhere in this phase's diff, and `tests/e2e/rendered-markdown-security.spec.ts`
only exercises plain (non-smuggled) `javascript:`/`data:` strings and plain `<script>`/`onerror`
HTML — the control-character bypass is untested at every layer. Should `img-src` ever be relaxed
for a future feature (e.g. to allow `data:` thumbnails), this becomes directly exploitable.

**Fix:** Normalize the href the same way a URL parser would before testing it — strip
tab/CR/LF globally, not just at the ends — and prefer an allowlist shape symmetric with
`validateLink`:

```ts
function validateImageHref(href: string): boolean {
  const normalized = href.replace(/[\t\r\n]/gu, '').trim();
  if (/^https?:/iu.test(normalized)) return true;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized)) return false;
  if (normalized.startsWith('//')) return false;
  return true;
}
```

### WR-03: Relative image path resolution doesn't guard against control characters, so a malformed `src` throws instead of yielding the documented 409

**File:** `src/server/image-content.ts:30-51` (`resolveRelativeImagePath`), `src/server/image-content.ts:53-82` (`readWorktreeImageBytes`)

**Issue:** `resolveRelativeImagePath` decodes the raw `src` with `decodeURIComponent` and only
rejects empty, `.`/`..`, leading-`/`, or trailing-`/` results. `decodeURIComponent('%00')` decodes
to a literal NUL character without throwing, so a markdown image reference such as
`` ![x](logo%00.png) `` (or any other embedded control character `decodeURIComponent` accepts)
passes every check in `resolveRelativeImagePath` and reaches `readWorktreeImageBytes`
(`src/server/image-content.ts:53-82`), which calls `fs.promises.lstat`/`readFile` with a path
containing the NUL byte. Node's `fs` APIs synchronously throw `ERR_INVALID_ARG_VALUE` for
NUL-containing paths; `readWorktreeImageBytes`'s `catch` block only recognizes `ENOENT`/`ENOTDIR`
(`src/server/image-content.ts:76-80`) and rethrows anything else, which propagates out of
`capabilities.readRelativeImage` into the Fastify route handler
(`src/server/routes.ts:348-367`) uncaught, turning into a generic 500 instead of the 409 every
other failure mode on this route produces (per `.planning/phases/16-rendered-markdown-preview/
16-02-PLAN.md`: *"`capabilities.readRelativeImage` returns `undefined` → 409"*). Not a data
exposure (the request simply fails harder than intended), but it breaks the route's own documented
contract and is untested (`tests/api/image-route.test.ts` has no NUL/control-character case).

**Fix:** Reject decoded paths containing C0 control characters alongside the existing checks:

```ts
if (
  decoded.length === 0 ||
  decoded.startsWith('/') ||
  /[\u0000-\u001f]/u.test(decoded)
) {
  return undefined;
}
```

---

_Reviewed: 2026-10-31_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
