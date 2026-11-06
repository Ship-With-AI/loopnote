# Loopnote usage reference

See the [README](../README.md) for install and a quick start. This file is the full reference: every flag, standalone-file and Refresh semantic, draft and export location, and the complete agent-request protocol.

## Flags and arguments

| Flag or argument | Meaning |
| --- | --- |
| `--staged` | Review staged changes (HEAD→index) against a base. |
| `--unstaged` | Review unstaged changes (index→working tree). |
| `--worktree` | Review all working-tree changes (HEAD→working tree), including untracked files. |
| `--base <ref>` | Base ref or registered worktree to compare against (default: `HEAD`); rejected with `--unstaged`. |
| `[paths...]` | Files or globs to review directly, with no Base/Head selection. |

`--staged`, `--unstaged`, and `--worktree` are mutually exclusive — choose exactly one. Positional paths cannot be combined with `--staged`, `--unstaged`, `--worktree`, or `--base`.

```sh
loopnote --staged
loopnote --unstaged
loopnote --worktree
loopnote --staged --base release/2.0
loopnote src/example.ts docs/*.md
```

## Starting a review

This is the interactive terminal route. If you use the Loopnote skill, your agent performs this launch for you with pinned OIDs and hands you the review URL; skip to [Reviewing in the browser](#reviewing-in-the-browser).

Change to the Git worktree whose local branches or registered worktrees you want to loopnote, then run:

```sh
cd /path/to/repository-to-review
loopnote
```

Loopnote first asks you to choose the **base**, then the **head**, using searchable lists of local branches and registered worktrees. The base is the reference point; the selected head is the committed state under review.

The comparison is a diff from the selected base and head’s merge base to the selected head. If a selected worktree is dirty, Loopnote uses its committed HEAD only; uncommitted worktree bytes are not reviewed.

Before launch, the confirmation screen shows the full base, head, and merge base OIDs. Confirm only after checking them: the session is pinned to those commits and does not follow later ref movement.

Loopnote listens only on an ephemeral `127.0.0.1` loopback port. It prints the review URL before attempting to open your default browser. If no browser opens, use the printed URL directly.

## Reviewing in the browser

1. Select a file in the file tree.
2. Inspect the side-by-side Monaco diff: **BASE** is on the left and **HEAD** is on the right. Unchanged regions start collapsed; use Monaco’s context controls to reveal more context.
3. Move between files and changes using visible controls or shortcuts. On either side of the diff, add a line comment and save it.
4. Open **Review** to write and save the overall Markdown summary. Use its preview to inspect the rendered summary.
5. Inspect saved comments, edit them, resolve them when addressed, and reopen resolved feedback when needed.
6. Check the review-readiness information and any warning about unsaved text before exporting. Export uses the accepted saved revision, not unsaved text currently in a tab.

Saved comments and the saved summary are repository-local, versioned JSON state. Reopen the same ordered comparison to continue that saved review. Text left unsaved in a comment or summary editor remains only in the current browser tab; it is not durable and is excluded from export.

For Markdown files, the file toolbar offers **Source** and **Rendered** buttons: **Source** shows the raw text diff, **Rendered** shows a rendered Markdown preview. Line comments work in either mode.

## Standalone-file review

Positional `[paths...]` arguments review named files or globs directly, rather than as a two-sided base/head comparison. Each reviewed file renders full-width in a single pane; line comments and the overall summary work the same as for a two-sided comparison.

## Refresh and snapshot semantics

An uncommitted (`--staged`, `--unstaged`, `--worktree`) or standalone-file session reviews bytes frozen at the moment the session starts. Later edits to those files do not change what is displayed until you refresh. If a file changes while the snapshot is being captured, Loopnote tells you explicitly rather than showing a mixed or partial version.

Use **Refresh** in the browser (or the `Alt+Shift+R` shortcut) to capture a new snapshot of the same source and scope. After Refresh, Loopnote shows a summary of which files were added, removed, or modified since the previous snapshot, and reclassifies every existing comment as current, stale, or orphaned — with its recorded evidence intact and without moving it to a different line.

Refresh updates the file tree, file navigation, and summary links together. Selection follows the same path when it survives; if it disappears, selection moves to a neighbouring file. Paths absent from the new review appear as noninteractive **Removed** labels.

Existing comment edits, panel/sidebar state, filters, and surviving directory expansion stay intact. New comment composers, including those on other files, are saved against the old snapshot before recapture. Comment inputs are temporarily locked during Refresh so newly typed text cannot be discarded by the inventory change. If a save fails or remains pending, Refresh pauses without replacing the snapshot or discarding text; save or discard that comment before retrying. The session identifier stays stable while its snapshot chain grows.

## Draft location

Loopnote stores a draft at:

```text
.loopnote/drafts/<comparison-key>.json
```

`<comparison-key>` is a 64-hex SHA-256 hash derived from the ordered, pinned base and head commit OIDs. It is an application-generated draft identity, not a filename you choose or a literal base/head path.

## Exporting a review

Export creates this pair together from the accepted draft revision:

```text
.loopnote/exports/<baseOid>..<headOid>/review.json
.loopnote/exports/<baseOid>..<headOid>/review.md
```

`review.json` is the canonical export; `review.md` is derived from it. Export does not apply, stage, commit, or push changes.

After a successful export, the receipt offers **Reveal export directory**. The export area also shows `.gitignore` status and offers an optional flow to append the Loopnote ignore rule. Ignore status is not a prerequisite for reviewing or exporting.

## Agent request protocol

Run these commands from the repository being reviewed. Redirect `stdout` to the review JSON file your agent will consume; Loopnote sends the browser URL and diagnostics to `stderr`.

### Review a revision range

Provide full, pinned commit OIDs with the base before the head. This example limits the review to the ordered pathspecs shown:

```sh
node --input-type=module -e '
const request = {
  kind: "loopnote.review-request",
  schemaVersion: 1,
  mode: "revisions",
  revisions: {
    base: "0123456789abcdef0123456789abcdef01234567",
    head: "89abcdef0123456789abcdef0123456789abcdef",
    pathspecs: ["src", ":(exclude)src/generated"],
  },
};
process.stdout.write(JSON.stringify(request));
' | loopnote > agent-review.json
```

Replace those OIDs with real full object IDs from the repository. Explicit range mode requires the base to be an ancestor of the head, resolves both revisions to full object IDs, and freezes those resolved IDs for the session. It does not use the interactive picker’s merge-base selection or follow moving references.

### Review an exact patch

Use Node to read a named UTF-8 patch file and `JSON.stringify` its content. This avoids shell interpolation, hand-escaped patch text, `eval`, and source mutation that could alter quoting or newlines:

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";

const request = {
  kind: "loopnote.review-request",
  schemaVersion: 1,
  mode: "patch",
  patch: {
    content: readFileSync("review.patch", "utf8"),
    target: { kind: "repository" },
  },
};
process.stdout.write(JSON.stringify(request));
' | loopnote > agent-review.json
```

Choose `repository` to ground the patch against the current committed `HEAD` tree, or `worktree` to ground it against current on-disk entries. The patch’s preimages and modes must exactly match that target before Loopnote freezes the grounded bytes. Loopnote never applies, stages, commits, or pushes the patch.

### Finish and receive canonical JSON

When stdin is a TTY, `loopnote` runs the existing interactive picker. A pipe or redirected stdin selects this agent-request protocol instead: the browser opens and the process stays attached. The URL, fallback text, and safe diagnostics go to `stderr`; `stdout` stays empty while the review is open.

In the browser, save the feedback and choose **Finish**. Once Finish successfully settles the accepted saved revision, Loopnote writes exactly one canonical review JSON document to `stdout`, waits for the Finish response to settle, closes the local server, and exits `0`. Revision conflicts and failed Finish attempts leave canonical `stdout` empty. Validation, grounding, or delivery failures also leave it empty and exit `1`. Pressing `Ctrl+C` before delivery cancels without partial JSON and exits `130`.

Treat a zero exit plus parseable captured `stdout` as the agent handoff contract.

### Request reference

Both v1 requests are strict JSON objects with `kind` set to `loopnote.review-request` and `schemaVersion` set to `1`.

<!-- agent-request-example:revisions -->
```json
{
  "kind": "loopnote.review-request",
  "schemaVersion": 1,
  "mode": "revisions",
  "revisions": {
    "base": "0123456789abcdef0123456789abcdef01234567",
    "head": "89abcdef0123456789abcdef0123456789abcdef",
    "pathspecs": ["src", ":(exclude)src/generated"]
  }
}
```

`pathspecs` defaults to `[]` when omitted. Its order is preserved and passed to Git.

<!-- agent-request-example:patch -->
```json
{
  "kind": "loopnote.review-request",
  "schemaVersion": 1,
  "mode": "patch",
  "patch": {
    "content": "diff --git a/src/example.ts b/src/example.ts\nindex 1111111..2222222 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-before\n+after\n",
    "target": {
      "kind": "repository"
    }
  }
}
```

For patches, `target.kind` is exclusively `repository` or `worktree`; revision and patch fields cannot be mixed. Unknown fields are rejected. The complete request must be one non-empty valid UTF-8 JSON document of at most 1,048,576 bytes. Each revision and pathspec Git argument must be non-empty, NUL-free valid Unicode, and at most 4,096 UTF-8 bytes; there can be at most 256 pathspecs. Patch content must be non-empty, NUL-free valid Unicode and fit within the total request budget, so its usable size is less than 1 MiB after JSON overhead.

### Isolation and persistence

Every piped launch receives a fresh repository-local `agent-` scope followed by 32 lowercase hexadecimal characters. Its saved draft cannot resume or overwrite an ordinary comparison draft or another agent launch. Saved draft state is durable; unsaved browser text is not. A successful Finish makes the accepted result terminal and read-only, and the captured canonical `stdout` is the agent handoff.

For exact-patch reviews, the frozen source snapshot is private to the session. It is never replaced by later live repository or worktree bytes, and is disposed when the server closes.
