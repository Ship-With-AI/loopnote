---
phase: 18-product-repositioning-copy
reviewed: 2026-11-02T00:00:00Z
depth: standard
diff_base: 6477b9b
files_reviewed: 27
files_reviewed_list:
  - PRODUCT.md
  - README.md
  - docs/usage.md
  - package.json
  - src/cli/run.ts
  - src/contracts/api.ts
  - src/domain/source.ts
  - src/server/capabilities.ts
  - src/web/App.vue
  - src/web/components/ActiveFileToolbar.vue
  - src/web/components/ChangedFilesDialog.vue
  - src/web/components/FileTree.vue
  - src/web/components/IdentityHeader.vue
  - src/web/index.html
  - tests/api/exact-patch.test.ts
  - tests/api/session.test.ts
  - tests/api/uncommitted-session.test.ts
  - tests/cli/help.test.ts
  - tests/cli/selection.test.ts
  - tests/e2e/anchored-review.spec.ts
  - tests/e2e/file-tree.spec.ts
  - tests/e2e/pinned-session.spec.ts
  - tests/e2e/responsive-session.spec.ts
  - tests/integration/anchored-workspace.spec.ts
  - tests/integration/draft-recovery-ui.spec.ts
  - tests/integration/support-dialog.spec.ts
  - tests/unit/product-copy-claims.test.ts
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Reviewed the full `6477b9b..HEAD` diff (27 non-planning files, +438/-230) against the five requested focus areas: Vue template behavior preservation, the new `repoName` session field, documentation/claims accuracy, the new claims test, and verbatim fidelity to `18-COPY-DRAFT.md`'s Approval record.

Positively verified as clean:

- **No behavior dropped in the Vue rewrite.** The complete `src/web` diff contains exactly one DOM deletion — the decorative eyebrow `<span>` in `src/web/components/FileTree.vue` (old `:161`) — plus string/label edits and removal of the now-unused `uncommittedBaseLabel` constant. No button, `@click`, `v-if`/`v-else-if`, `defineEmits` member, `aria-controls`, `initial-focus-selector`, or id/class hook was removed or renamed. The skip link's new text (`src/web/App.vue:1246`) still targets the live `#changed-files-heading` (`src/web/components/FileTree.vue:157`).
- **`repoName` cannot leak an absolute path or be spoofed.** It is `basename()` of the server's own already-resolved `repositoryRoot` at all four — and only four — `SessionResponseSchema.parse` sites (`src/server/capabilities.ts:428,757,1039,1396`); the agent-request schema (`src/cli/request.ts`) exposes no repository-root or cwd input, so no request can influence it. It is consumed only as a plain `document.title` string (`src/web/App.vue:313-315`), never through `v-html`.
- **Draft/export identity is unaffected.** `comparisonKey`/`uncommittedReviewKey`/`standaloneReviewKey` derive from OIDs and arguments, never from the session DTO (`src/server/capabilities.ts:1010,1367`), so the added field cannot orphan existing `.loopnote/drafts/*` state.
- **Schema/consumer consistency.** `repoName: z.string().optional()` is present on all three union members (`src/contracts/api.ts:392,423,442`), and the three key-shape API tests were updated in received key order (`tests/api/session.test.ts:141`, `tests/api/exact-patch.test.ts:197`, `tests/api/uncommitted-session.test.ts:111`).
- **Applied strings match the Approval record verbatim** wherever the record speaks: npm/CLI description (`package.json:4`, `src/cli/run.ts:1457` ≡ `18-COPY-DRAFT.md:467`), README skill range (`README.md:44` ≡ `18-COPY-DRAFT.md:96`, which also matches the bundled skill at `.kimi-code/skills/loopnote/SKILL.md:13`), `DIRTY_EXPLANATION` (`src/domain/source.ts:3` ≡ `18-UI-SPEC.md:150`), dirty-badge screen-reader text (`src/web/components/IdentityHeader.vue:161` ≡ `18-UI-SPEC.md:151`), keywords, the D-08 "Files" family, the `Exact patch` / `{N} files` title segments, and all range and pinned-comparison empty states. The uncommitted empty state correctly follows the Approval record's later resolution (`18-COPY-DRAFT.md:505-506`) rather than `18-04-PLAN.md:113`'s superseded literal text.
- **No banned non-capability phrase ships.** All 13 phrases extracted from `PRODUCT.md:28` occur zero times in `README.md` and `docs/usage.md`. Every `PRODUCT.md` capability bullet (`:14-23`) is backed by shipped code, and every flag in `docs/usage.md:9-15` matches `src/cli/run.ts:1459-1462` with the exclusivity/`--base` rules implemented at `src/cli/run.ts:455-497`. The `Alt+Shift+R` refresh shortcut claimed at `docs/usage.md:65` exists (`src/web/App.vue:922`), and the comment resolve/reopen flow claimed at `docs/usage.md:50` exists (`src/draft/mutate-draft.ts:92-107`).

Remaining concerns, all introduced by this patch: one user-visible empty-state string renders as `No changes in .` for standalone sessions; the new tab title bypasses the project's display sanitizer and hardcodes a base that is not always correct; the deleted static `<title>` exposes the token-bearing URL as the tab title until the bundle runs; two new `docs/usage.md` statements describe behavior the CLI does not have; and the new claims test misses three of the four claim forms D-06 itself names.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Give standalone sessions their own empty-state copy

**File:** `src/web/App.vue:219-224` (label source `src/web/App.vue:172-179`)
**Issue:** `uncommittedSourceLabel` returns `''` for `sourceKind === 'standalone'` (`default:` arm at `:177`), but the empty-state branch is keyed on `isUncommittedSession` (`:219`), which is true for standalone sessions (`'uncommitted' in session`, `:164`). A standalone session with zero files therefore renders the heading **`No changes in .`** — dangling space before the period. This is reachable: `src/server/worktree-snapshot.ts:272` passes `toleratesNoMatch: true` on the refresh path, so deleting the reviewed file(s) and pressing **Refresh** (or `Alt+Shift+R`) produces a 0-file standalone session, and `src/web/App.vue:1333-1335` plus the drawer props at `:1394-1395` render the broken string. Before this patch the same case produced a complete sentence (`The working tree matches Repository object. …`), so this is a regression. The Approval record (`18-COPY-DRAFT.md:505-506`) locks only `{Working tree|Staged|Unstaged}`; standalone was never covered, so its copy has to be chosen rather than derived from an empty label.
**Fix:**
```ts
  if (isStandaloneSession.value) {
    return {
      heading: 'No files in this standalone review.',
      message: 'Restore the files, then Refresh.',
    };
  }
  if (isUncommittedSession.value) {
    return {
      heading: `No changes in ${uncommittedSourceLabel.value}.`,
      message: 'Edit files, then Refresh.',
    };
  }
```

### WR-02: Pass `repoName` through `controlSafeDisplay` before writing the title

**File:** `src/web/App.vue:237-241`
**Issue:** `documentTitle` interpolates `session.value.repoName` raw. `repoName` is `basename()` of a filesystem path (`src/server/capabilities.ts:428`), and a POSIX directory name may contain any byte except `/` and NUL — including `\n`, `\r`, `\t`, and C0/C1 control characters. Every other externally-derived string the workspace displays is first escaped with `controlSafeDisplay` (`src/web/components/IdentityHeader.vue:48-68`, `src/web/App.vue:185-190`), whose sole purpose is neutralising exactly those code points (`src/domain/path-bytes.ts:22-44`). The new title is the one display path that skips it, so a repository directory containing control characters writes them verbatim into `document.title`.
**Fix:**
```ts
const documentTitle = computed(() =>
  session.value === undefined
    ? RENAME_MAP.displayName
    : [RENAME_MAP.displayName, controlSafeDisplay(session.value.repoName ?? ''), sessionKindTitleSegment.value]
        .filter((segment) => segment !== '')
        .join(' · '),
);
```

### WR-03: Restore a static `<title>` fallback in index.html

**File:** `src/web/index.html:3-7`
**Issue:** The static `<title>Loopnote</title>` was deleted and nothing replaces it at build time (no title in `vite.config.ts` or the build scripts), so the served document has **no** title element until the bundle mounts and the `immediate` watcher runs (`src/web/App.vue:313-315`). For a titleless document browsers substitute the document URL as the tab/window title — and the review URL carries the session token in its fragment (`#token=<43 chars>`; see `tests/integration/support-dialog.spec.ts:100`) until `src/web/api/client.ts:126` scrubs it with `replaceState`. The exposure window is exactly the pre-hydration window, and it becomes permanent if the bundle fails to load. The project otherwise treats that fragment as not-for-display (`tests/e2e/pinned-session.spec.ts` asserts the rendered body never contains the hash). A static fallback does not weaken D-09: the watcher overwrites it on mount.
**Fix:**
```html
    <meta name="color-scheme" content="dark" />
    <title>Loopnote</title>
  </head>
```
Note: `18-04-PLAN.md:116`'s automated check greps `grep -c '<title>' src/web/index.html` expecting `0`; that expectation must be updated alongside this fix.

### WR-04: Stop hardcoding "vs HEAD" in the uncommitted title segment

**File:** `src/web/App.vue:231-236`
**Issue:** `sessionKindTitleSegment` returns `` `${uncommittedSourceLabel.value} vs HEAD` `` for every staged/unstaged/worktree session, but the base of a staged or worktree session is not always `HEAD`: `--base <ref>` resolves an arbitrary commit as the comparison base (`src/cli/run.ts:689-699`; flag documented at `docs/usage.md:12`), and the interactive uncommitted flow passes a picked base as well (`src/cli/run.ts:1362-1363`). `loopnote --staged --base release/2.0` therefore titles the tab `Loopnote · repo · Staged vs HEAD` while the comparison is `release/2.0`→index. The header deliberately avoids that claim, rendering the resolved base as `Repository object · <short oid>` (`src/web/components/IdentityHeader.vue:57-60`), so the title also contradicts the UI beside it. D-09's locked example covers only the default case.
**Fix:**
```ts
  if (isUncommittedSession.value) {
    const baseOid = uncommittedSession.value?.baseCommitOid;
    return `${uncommittedSourceLabel.value} vs ${baseOid === undefined ? 'HEAD' : controlSafeDisplay(baseOid.slice(0, 7))}`;
  }
```
(Alternatively drop the endpoint entirely — `` `${uncommittedSourceLabel.value}` `` — rather than naming a base the DTO cannot confirm.)

### WR-05: Fix the `--base` example that the CLI silently ignores

**File:** `docs/usage.md:18`
**Issue:** The example block presents `loopnote --base release/2.0` as a complete invocation. With no `--staged`/`--unstaged`/`--worktree` and no positional paths, `validateUncommittedFlags` accepts the input (`src/cli/run.ts:455-473` rejects `--base` only when combined with `--unstaged`), `resolveUncommittedFlagSelection` returns `undefined` (`src/cli/run.ts:438-453`), and the action falls through to `runOrdinaryAction` — the interactive base/head picker — discarding `--base` with no warning (`src/cli/run.ts:1500-1503`). The documented command does not do what the surrounding table implies.
**Fix:**
```sh
loopnote --staged --base release/2.0
loopnote --worktree --base release/2.0
```

### WR-06: Correct the standalone-review description that claims uncommitted flags review named files

**File:** `docs/usage.md:59`
**Issue:** The sentence states that positional paths **or** `loopnote --staged`/`--unstaged`/`--worktree` "review named files or globs directly" and that "each reviewed file renders full-width in a single pane instead of as a side-by-side diff". Both halves are wrong for the three flags: they review uncommitted changes against a base commit rather than named paths (and `src/cli/run.ts:476-497` forbids combining them with paths at all, contradicting `docs/usage.md:15` two paragraphs earlier), and their modified files render side-by-side, because single-pane applies only to `added`/`deleted`/`type-changed` text files (`src/web/model/single-pane-layout.ts:7-28`). Single-pane is accurate for standalone only because every standalone entry is built as an untracked/added file (`src/git/standalone-resolution.ts:249-252`).
**Fix:**
```md
Positional `[paths...]` arguments review named files or globs directly, rather than as a two-sided base/head comparison. Each reviewed file renders full-width in a single pane; line comments and the overall summary work the same as for a two-sided comparison.
```

### WR-07: Catch the claim forms D-06 names, not just full comma-separated phrases

**File:** `tests/unit/product-copy-claims.test.ts:17-32,42-58`
**Issue:** `extractBannedPhrases` splits `PRODUCT.md:28` on commas, yielding whole phrases — `remote hosting`, `cloud synchronization`, `multi-user collaboration`, … — and the assertions test plain substring containment. D-06 (`18-CONTEXT.md:28`) names the claim forms to catch as "hosted, cloud sync, multi-user, approvals, …"; of those four, only `approvals` is actually caught. `hosted`, `hosted review`, `cloud sync`, `multi-user`, and `multi-reviewer` all pass the guard unchanged — the exact failure mode the check exists to prevent, and the one `18-VERIFICATION.md:23` records as the acceptance criterion ("no hosted/multi-reviewer claim"). The guard therefore yields false assurance for the likeliest paraphrases.
**Fix:**
```ts
const BANNED_CLAIM_STEMS = ['hosted', 'cloud sync', 'multi-user', 'multi-reviewer'] as const;
// …after the existing phrase loop:
for (const stem of BANNED_CLAIM_STEMS) {
  expect(lowerReadme.includes(stem), `README.md must not contain banned claim stem "${stem}"`).toBe(false);
  expect(lowerNpmCopy.includes(stem), `package.json copy must not contain banned claim stem "${stem}"`).toBe(false);
}
```
(Keep the PRODUCT.md-derived phrases as the primary source per D-06; the stems only close the substring gap.)

## Info

### IN-01: Delete the now-dead `.file-tree-pane__eyebrow` rules

**File:** `src/web/styles.css:1116-1127`
**Issue:** The only consumer of the class was the eyebrow `<span>` deleted from `FileTree.vue`. Both rules — the grouped `.file-tree-pane__count, .file-tree-pane__eyebrow` declaration and the standalone `margin-inline-start: auto` rule — are now unreachable CSS.
**Fix:** Drop `.file-tree-pane__eyebrow` from the grouped selector at `:1116-1117` and delete the standalone rule at `:1125-1127`.

### IN-02: Share one source-label helper between App.vue and IdentityHeader.vue

**File:** `src/web/App.vue:172-179`
**Issue:** The new `uncommittedSourceLabel` duplicates `src/web/components/IdentityHeader.vue:40-47` character for character, including the `default: return ''` arm that causes WR-01. Two copies of the same mapping will drift, and the standalone gap must otherwise be fixed twice.
**Fix:** Export a single `uncommittedSourceLabel(sourceKind)` helper (for example from `src/domain/source.ts`, which already owns source-row copy) and call it from both components.

### IN-03: Extend the claims check to docs/usage.md

**File:** `tests/unit/product-copy-claims.test.ts:6-8,42-58`
**Issue:** The guard reads `PRODUCT.md`, `README.md`, and `package.json` only. This phase added `docs/usage.md` (188 lines) and moved most capability prose into it — including the two inaccurate claims in WR-05 and WR-06 — so the file most likely to accumulate future claims is unguarded.
**Fix:** Add `docs/usage.md` to the scanned corpus alongside `readmeText`.

### IN-04: Avoid an empty title segment when `repoName` is absent

**File:** `src/web/App.vue:240`
**Issue:** `repoName` is schema-optional and `?? ''` preserves the separator, so a session without it renders `Loopnote ·  · 3 files` (double separator). `basename()` also returns `''` for a repository root of `/`.
**Fix:** Covered by WR-02's `filter((segment) => segment !== '')` join.

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
