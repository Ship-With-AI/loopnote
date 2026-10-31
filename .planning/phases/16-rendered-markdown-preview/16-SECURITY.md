---
phase: 16
slug: rendered-markdown-preview
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-31
register_authored_at_plan_time: true
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Register origin: all 8 `*-PLAN.md` files (16-01 through 16-08) contain a parseable
> `<threat_model>` block authored at plan time →
> `register_authored_at_plan_time: true`. Per the `secure-phase` workflow this means the
> auditor's job is to **verify each declared mitigation exists in the implemented code** —
> not to scan blindly for new threats. Code-review warnings WR-01/WR-02/WR-03
> (`16-REVIEW.md`/`16-REVIEW-FIX.md`) are additionally checked against the register per
> the assignment: where a fix closes a residual gap in an already-registered threat's
> mitigation, it is noted against that threat ID; where a fix addresses a security-relevant
> gap the plan-time register never named, it is logged as a newly-surfaced threat
> (`T-16-19`, `T-16-20`) so the register stays complete going forward.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|----------------|
| Markdown source text → `renderMarkdownPreview` | Repository file content (committed, uncommitted, standalone) — attacker-controlled if a hostile file lands in the reviewed repo | Untrusted Markdown text → HTML string |
| `renderMarkdownPreview` output HTML → DOM (`RenderedMarkdownView.vue`) | Returned string is mounted via `innerHTML`; must be safe without a second sanitization pass | Hardened HTML string → live DOM |
| Browser → `GET /api/files/:fileId/image?path=&side=` | `path` is attacker-influenced (a crafted Markdown file can reference any string as an image `src`); `fileId`/`side` are opaque/enum-validated | Query params → file bytes |
| Route → filesystem (worktree sessions) | Must never read outside the repository root, never follow a symlink | Relative path → raw bytes |
| Route → git object store (committed/pinned sessions) | Must only resolve blobs `git ls-tree` reports on a pinned commit OID; no unsanitized shell interpolation | Commit OID + path → blob bytes |
| Image `src` rewriting → same-origin route URL | Must only ever point at `/api/files/.../image`, built from `encodeURIComponent`-escaped values | `fileId`/`path`/`side` → route URL string |
| Browser → `POST /api/draft/mutations` (`addComment`) | `line`/`endLine` are attacker-influenced client input, validated by Zod before reaching `buildDurableAnchor` | `{ line, endLine }` → durable anchor |
| Stored draft JSON → re-parsed on load | A pre-phase-16 draft with no `endLine` key must remain structurally valid forever | Persisted JSON → `DurableAnchorV1` |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-16-01 | Tampering / EoP | `renderMarkdownPreview` — raw `<script>`/`<img onerror>` HTML | mitigate | `html: false` | closed |
| T-16-02 | Tampering | `renderMarkdownPreview` — `javascript:`/`data:`/`vbscript:` image sources | mitigate | `validateImageHref` swapped into image inline-rule validation | closed |
| T-16-03 | Information Disclosure | `renderMarkdownPreview` — `http(s):` image sources | mitigate | `renderer.rules.image` override → inert placeholder text, no `src`/`href` | closed |
| T-16-04 | Tampering | Front-matter block rule false-positive mid-document | mitigate | rule gated on `state.line === 0` (actually `startLine !== 0` guard) | closed |
| T-16-05 | Tampering / Info Disclosure | `readWorktreeImageBytes` path traversal / symlink escape | mitigate | per-segment `lstat` walk, reject symlink at any segment, `normalize`/`..`/leading-`/` rejection upstream | closed |
| T-16-06 | Information Disclosure | Arbitrary-file-type disclosure via spoofed extension | mitigate | `IMAGE_CONTENT_TYPE_BY_EXTENSION` allow-list checked server-side before any read | closed |
| T-16-07 | Information Disclosure | `git ls-tree` resolving non-blob entry as image bytes | mitigate | `readCommittedImageBytes` requires parsed entry type `=== 'blob'` | closed |
| T-16-08 | Denial of Service | Oversized image exhausting server memory | mitigate | `MAX_IMAGE_BYTES` (10 MiB) enforced in both worktree `lstat`-size check and `ObjectReader.read({maxBytes})` | closed |
| T-16-09 | Spoofing/Tampering | `path`/`side` query params | mitigate | `FileImageQuerySchema` (`z.strictObject`, `side` enum, `path` non-empty) `safeParse` → 400 on failure | closed |
| T-16-10 | EoP (SSRF-adjacent) | Image route becoming a general file-read oracle | accept — mitigated by design | route is scoped to session's own `repositoryRoot`/pinned commit OIDs established at session-launch; adds no new cross-session reachability | closed |
| T-16-11 | Tampering | Re-parsing `renderMarkdownPreview` output with `DOMParser`/detached container | mitigate | only mutates `innerHTML` with the already-hardened string (16-01's output); no `eval`/raw concatenation | closed |
| T-16-12 | Information Disclosure | Image URL construction leaking unintended paths | mitigate | `encodeURIComponent` on `fileId` and `path` before interpolating into route URL | closed |
| T-16-13 | Tampering | Comment-trigger button anchoring to wrong line/range | mitigate | `line`/`endLine` emitted are always `block.start + 1`/`block.end`, deterministically derived from `data-source-start`/`data-source-end` | closed |
| T-16-14 | Information Disclosure | Hidden-but-mounted Monaco host reachable via Tab order | mitigate | `v-show` (`display:none`) removes host from Tab order/a11y tree; explicit `:aria-hidden="mode === 'rendered'"` | closed |
| T-16-15 | Repudiation | Security e2e test asserting against a mocked/relaxed CSP | mitigate | specs use `startGeneratedCli` — the real packaged-app boot path applying the unmodified `applySecurityHeaders`/CSP from `src/server/security.ts` | closed |
| T-16-16 | Tampering | `endLine` threaded through activate/persist-comment/reveal-line pipeline | mitigate | client only ever sources `endLine` from `block.end` or a server-verified `recordedAnchor.endLine`; server-side `.superRefine` is the authoritative enforcement regardless | closed |
| T-16-17 | Tampering | `endLine` below `line`, or non-integer/negative, in `addComment` request | mitigate | `AddCommentRequestSchema.superRefine` rejects `endLine < line` → 400; `buildDurableAnchor`'s `RangeError` is defense-in-depth caught as 409 | closed |
| T-16-18 | Repudiation | Legacy single-line anchor reinterpreted as zero-length range, corrupting `contextHash` | mitigate | `endLine` omitted from the frozen anchor object entirely when `undefined` (spread-conditional, never written as literal `undefined`) | closed |
| T-16-19 *(surfaced by WR-01)* | Spoofing / Tampering | Base-side image preview silently serving live worktree (head) bytes instead of the git-tracked base blob when the image is itself part of the diff | mitigate | all three non-pinned registries now check `findChangedImageEntry` before falling back to worktree read; serves the materialized/object-store preimage, or `undefined`→409 if the image didn't exist at base | closed |
| T-16-20 *(surfaced by WR-03)* | Denial of Service / Tampering | NUL/C0-control-character-containing decoded `src` reaching `fs` calls uncaught, producing a 500 instead of the route's documented 409 contract | mitigate | `resolveRelativeImagePath` rejects `/[\u0000-\u001f]/u`-matching decoded paths before any `fs` call | closed |
| T-16-SC | Tampering | npm/pip/cargo installs | accept | zero new npm dependency introduced across all 8 plans — `package.json` untouched by every phase-16 commit; `markdown-it@14.3.0` predates this phase | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Threat Flags (from SUMMARY.md)

Checked all 8 plan SUMMARY.md files' `## Threat Flags` sections: 16-04, 16-05, 16-06 contain
explicit `None` entries mapped back to their plan's own `<threat_model>` (T-16-14, no new
surface, no new surface respectively); 16-01/02/03/07/08 have no `## Threat Flags` section.
No unregistered attack surface flagged by any executor during implementation.

---

## Code-Review-Driven Findings (16-REVIEW.md / 16-REVIEW-FIX.md)

| Finding | Overlaps Register? | Resolution | Evidence |
|---------|--------------------|------------|----------|
| WR-01 — base-side image reads live worktree, not git-tracked base blob | **New** — no existing T-16-05..T-16-10 line item covers side-correctness of embedded images; registered retroactively as **T-16-19** | Fixed, commit `ba1827e` | `src/server/capabilities.ts:895-909` (uncommitted), `:1233-1247` (standalone), `:1480-1494` (exact-patch): each checks `findChangedImageEntry` for `side === 'base'` before falling back to `readWorktreeImageBytes`; serves `snapshot.readPreimageBytes`/`readObjectBackedImage(reader, oldBlobOid)` instead. Regression test: `tests/api/image-route.test.ts:561` (`exactPatchGroundedWithChangedImage` fixture, distinct preimage/postimage/live-disk bytes) |
| WR-02 — image `src` scheme validator is a bypassable blocklist (control-char smuggling) | **Strengthens T-16-02** (image scheme validation mitigation) | Fixed, commit `1cec47f` | `src/web/model/markdown-preview.ts:131-137`: `validateImageHref` now strips `/[\t\r\n]/gu` globally before the scheme check, not just `.trim()`-trimmed ends. Regression test: `tests/unit/markdown-preview.test.ts:107-132` (`describe('validateImageHref (WR-02)')`, literal `ja\tvascript:`/`da\nta:`/`da\rta:` payloads) |
| WR-03 — relative image path resolution doesn't guard against control characters (uncaught 500 instead of documented 409) | **New** — none of T-16-05..T-16-09's mitigation text mentions control characters/NUL bytes; registered retroactively as **T-16-20** | Fixed, commit `af0254d` | `src/server/image-content.ts:37-43` (`resolveRelativeImagePath`): rejects decoded paths matching `/[\u0000-\u001f]/u` alongside existing empty/`.`/`..`/leading-slash checks. Regression test: `tests/api/image-route.test.ts:99-105` (unit), `:554-558` (API-level, confirms `409` for `logo%00.png`) |

All three warnings are confirmed fixed in the current codebase (not merely documented as
planned) — verified by direct code read, not by trusting `16-REVIEW-FIX.md`'s narrative.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-16-01 | T-16-10 | Image route's filesystem/git-object reachability is bounded by the session's own `repositoryRoot`/pinned commit OIDs, established once at session launch and not influenced by request input beyond a relative path within that scope; there is no cross-session or cross-repository widening. Mitigated by design, not by an additional runtime check. | plan 16-02 author (plan-time) | 2026-10-31 |
| AR-16-02 | T-16-SC | Zero new npm/pip/cargo dependencies introduced by any of the 8 phase-16 plans; confirmed no phase-16 commit touches `package.json`, and `markdown-it@14.3.0` predates this phase. No new supply-chain surface to audit. | all 8 plan authors (plan-time) | 2026-10-31 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|----------------|--------|------|--------|
| 2026-10-31 | 20 (18 plan-time `T-16-01`..`T-16-18` + 1 recurring `T-16-SC` + 2 surfaced by code review `T-16-19`/`T-16-20`) | 20 | 0 | gsd-security-auditor (Exec16.GrimBadger) |

**Verification method:** direct code read against every cited file/line (not a trust-the-plan
rubber stamp). Every `mitigate` disposition was confirmed by locating the actual guard/check in
the current source tree; the `accept` dispositions were confirmed by locating the accepted-risk
rationale and confirming no contradicting code exists. WR-01/WR-02/WR-03 were independently
re-derived from `16-REVIEW.md`'s technical description and confirmed present in
`src/server/capabilities.ts`, `src/web/model/markdown-preview.ts`, and
`src/server/image-content.ts` respectively, each backed by a named regression test.

---

## Open Threats Summary

**threats_open: 0.** All 18 plan-time threats (`T-16-01`–`T-16-18`), the recurring supply-chain
accept (`T-16-SC`), and the two threats surfaced by code review (`T-16-19`, `T-16-20`, from
WR-01/WR-03) are CLOSED with direct code evidence. WR-02 strengthens the existing `T-16-02`
mitigation rather than closing a separate open threat. No threat required blocking phase
advancement.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-31
