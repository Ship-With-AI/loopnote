---
phase: 21
slug: changed-files-tree
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-05
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser `localStorage` → `parsePanelState` | `loopnote.workbench.v1` is writable by any script on the same origin (including a corrupted/hand-edited value from a prior app version) and is parsed back into reactive UI state on every page load | Persisted panel/view-option state (JSON) |
| `WorkspaceComment`/`SessionFile` data (already in browser memory) → row DOM | Comment counts and git status text are rendered via plain Vue text interpolation (`{{ }}`), never `v-html` | Comment counts, status letters |
| Git file/folder path text (not fully trusted — a standalone session can review an arbitrary local repository, including a cloned third-party one with filenames the reviewer does not control) → filter `<mark>` highlighting | The matched substring is rendered as a real DOM `<mark>` element | File/folder path text, filter query substring |
| `panelState.treeViewMode`/`treeLineCounts`/`treeCommentBadges` (localStorage) → row CSS class/conditional rendering & write-back | Phase 21 both reads (validated in 21-01) and, for the first time, writes these fields from fixed UI controls (toggle button, menu items) | View-mode/line-count-mode strings, badge boolean |
| `document`-level `pointerdown` listener (`ViewOptionsMenu`'s outside-click dismiss) → menu open/close state | The listener only ever reads `event.target` to decide whether to close the menu; it never reads or trusts any payload from the event beyond DOM containment | DOM event target reference only |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-21-01 | Tampering | `parsePanelState` (`src/web/model/panel-state.ts`) | mitigate | All 6 fields (`sidebarWidth`, `sidebarVisible`, `panelHeight`, `treeViewMode`, `treeLineCounts`, `treeCommentBadges`) are each gated by an independent `typeof`/literal-equality check with its own default fallback (`panel-state.ts:92-116`); object-shape failures (non-object/null/array) return `defaultPersistedPanelState()` once at the top (line 88), never after per-field parsing begins — one corrupt field never rejects the others. Verified in code. | closed |
| T-21-02 | Information Disclosure | `statusPriorityByDirectoryId` / `flatFileRows` (`src/web/model/file-tree.ts`) | accept | Pure in-memory tree walks over `FileTreeNode[]` already built from `props.files`/`SessionFile[]` (`file-tree.ts:120-152`, `~340`); no new data source, network, or IPC surface introduced. Verified in code. | closed |
| T-21-03 | Tampering | `openCommentCounts` computed (`src/web/App.vue`) | accept | `computed` built purely from `workspaceComments.value` (`App.vue:299-306`), already-loaded reactive session state; no new trust boundary crossed. Verified in code. | closed |
| T-21-04 | Information Disclosure | Comment-badge numeral / status letter rendering | accept | Plain `{{ }}` interpolation only (`FileRow.vue:146`, `StatusBadge.vue`); no `v-html` anywhere in these files. Verified in code. | closed |
| T-21-05 | Tampering (reflected DOM XSS) | Filter `<mark>` highlighting (`FileTree.vue` / `src/web/components/ui/PathText.vue`) | mitigate | `highlightMatches` (`file-tree.ts:218-241`) returns a frozen `{text, matched}[]` built entirely with `.slice`, never string-concatenating markup; consumers render it via `v-for` + `<mark v-if="segment.matched">{{ segment.text }}</mark>` (`PathText.vue`, `DirectoryRow.vue:83`). Repo-wide grep for `v-html`/`innerHTML`/mark-tag string-replace in the phase-21 file set returned nothing (only pre-existing, out-of-scope `v-html` usages are in unrelated `RenderedMarkdownView.vue`/`SummarySection.vue`). Verified in code. | closed |
| T-21-06 | Tampering | `panelState.treeViewMode` write path (list⇄tree toggle button) | mitigate | `FileTree.vue:~418` emits only the two literals `'tree'`/`'list'`; `App.vue:401-404` `toggleTreeViewMode` writes that typed `TreeViewMode` value straight to `panelState.treeViewMode.value` then calls `persist()`. No free-form input path exists. Verified in code. | closed |
| T-21-07 | Elevation of Privilege / Clickjacking | New `role="toolbar"`/filter-row focus behaviour | accept | ASVS L1 out of scope for this same-origin, no-auth, localhost-only desktop review tool (Fastify bound to `127.0.0.1`, unchanged by this phase); plain in-page button group, no `fetch`/`XMLHttpRequest`/`window.open`/iframe introduced (grep clean); Esc/focus-return confirmed via `closeFilterReturnFocusToTree`/`focusTabbableTreeRow` in `FileTree.vue`. Verified in code. | closed |
| T-21-08 | Tampering | `panelState.treeLineCounts`/`treeCommentBadges` write path (`ViewOptionsMenu.vue` → `App.vue` handlers) | mitigate | `ViewOptionsMenu.vue:49-56` `activateLineCounts` emits only `LINE_COUNT_ITEMS[index].mode` (fixed 3-entry array literal); `activateCommentBadges` emits `!props.commentBadgesEnabled` (boolean negation). `App.vue:406-414` handlers write these typed values directly to persisted state then call `persist()`. No raw event/text data reaches persisted state. Verified in code. | closed |
| T-21-09 | Spoofing / Elevation of Privilege (clickjacking via the new popover) | `ViewOptionsMenu.vue`'s hand-rolled outside-click dismiss | accept | ASVS L1 out of scope for this same-origin, no-auth, localhost-only desktop review tool (unchanged architecture); `handlePointerDown` (`ViewOptionsMenu.vue:91-105`) checks `menuRoot.value?.contains(...)` plus an `[aria-haspopup="menu"]` opener-exclusion, confined to the menu's own listener; small anchored popover (no backdrop), not a full-viewport overlay. Verified in code. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks beyond the 5 plan-time "accept" dispositions already captured in the Threat Register above (T-21-02, T-21-03, T-21-04, T-21-07, T-21-09) — each carries its own rationale and code-verified evidence inline; no separate risk-acceptance process was invoked.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 9 | 9 | 0 | gsd-secure-phase (post-exec hook, register_authored_at_plan_time: true, verified against implementation files by security-reviewer subagent) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
