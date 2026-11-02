# Loopnote

Loopnote gives committed local Git comparisons a pull-request-style review workspace without publishing a branch or worktree. Choose local branches or registered worktrees, leave durable feedback, and export it for an agent or teammate to use.

Published as **`@shipwithai/loopnote`**; command **`loopnote`**.

Stable `1.5.0` is published on npm. Its registry bytes, provenance attestation, and global, `npx`, and marketplace installation paths were verified during release acceptance. Source and the sole support channel are the public [Ship-With-AI/loopnote](https://github.com/Ship-With-AI/loopnote) repository and its [Issues tracker](https://github.com/Ship-With-AI/loopnote/issues).

## Prerequisites

You need:

- Node.js 24 or later
- npm
- Git 2.43.0 or later
- A non-bare Git worktree containing at least one commit for the repository you want to review
- For the recommended skill route, one of the supported coding agents: Claude Code, Codex, Pi, or OMP

## Install

Loopnote is two independently installed, independently MIT-licensed pieces:

| Piece | What it is | Where it comes from |
| --- | --- | --- |
| `loopnote` CLI | The review application: Git grounding, diff, browser workspace, persistence, export | npm package `@shipwithai/loopnote` |
| Loopnote skill | The recommended entry point, driving the CLI from your coding agent | `ship-with-ai` collection in [Ship-With-AI/skills](https://github.com/Ship-With-AI/skills) |

**Installing the skill is the recommended way to get Loopnote into your workflow.** Your agent then resolves the ordered base and head, launches the CLI in its native agent protocol, supervises the session while you review, and reports the canonical result — no hand-built request JSON and no manual process supervision.

The skill does not install the application. It never installs, upgrades, `npx`-substitutes, or builds the CLI: it runs a compatibility check first and stops with the exact install command when no compatible CLI is present. Install the CLI once, then install the skill.

### 1. Install the CLI

```sh
npm install --global @shipwithai/loopnote
```

Confirm the command is on your `PATH`:

```sh
loopnote --version
```

The skill accepts stable versions in `>=1.5.0 <2.0.0` and rejects prereleases. Only `1.5.0` has independent release verification; acceptance of later stable 1.x versions is a compatibility policy, not a test claim.

### 2. Install the skill in your agent

**Claude Code** — native collection:

```text
/plugin marketplace add Ship-With-AI/skills
/plugin install ship-with-ai@ship-with-ai-skills
```

Invoke `/ship-with-ai:loopnote`. A selectively installed standalone copy in `.claude/skills/loopnote` is invoked as `/loopnote`.

**OMP** — native collection:

```sh
omp plugin marketplace add Ship-With-AI/skills
omp plugin install --scope project ship-with-ai@ship-with-ai-skills
```

Invoke `/skill:loopnote`.

**Codex** — selective placement into the project's `.agents/skills/loopnote`:

```sh
npx skills add Ship-With-AI/skills --skill loopnote -a codex
```

Invoke `$loopnote`, or select Loopnote from `/skills`.

**Pi** — selective placement into the project's `.pi/skills/loopnote`:

```sh
npx skills add Ship-With-AI/skills --skill loopnote -a pi
```

Invoke `/skill:loopnote` in a trusted project with skill commands enabled.

Of these four routes, only the OMP marketplace installation was exercised during release acceptance. The Claude Code, Codex, and Pi routes follow the collection's documented installation conventions and remain unexercised.

### 3. Ask your agent for a review

From the repository you want to review, ask for the comparison in plain language — for example, “review my feature branch against `main` with Loopnote”. The skill resolves full pinned commit OIDs, sends the merge base as the base, launches the CLI, gives you the loopback URL, and waits. Review in the browser as described below, then press **Finish**; the agent reads the canonical result and reports the summary and open comments without editing your code.

### Use the CLI without a skill

The CLI is fully usable on its own. Install it globally as above, or run it in the repository you want to review:

```sh
npx --yes @shipwithai/loopnote
```

Neither path requires a Loopnote source checkout or local build. Launching `loopnote` with an interactive terminal starts the picker described next; piping a request into it uses the agent protocol documented in [Review changes from a coding agent](#review-changes-from-a-coding-agent).

## Start a review

This is the interactive terminal route. If you use the Loopnote skill, your agent performs this launch for you with pinned OIDs and hands you the review URL; skip to [Review in the browser](#review-in-the-browser).

Change to the Git worktree whose local branches or registered worktrees you want to loopnote, then run:

```sh
cd /path/to/repository-to-review
loopnote
```

Loopnote first asks you to choose the **base**, then the **head**, using searchable lists of local branches and registered worktrees. The base is the reference point; the selected head is the committed state under review.

The comparison is a diff from the selected base and head’s merge base to the selected head. If a selected worktree is dirty, Loopnote uses its committed HEAD only; uncommitted worktree bytes are not reviewed.

Before launch, the confirmation screen shows the full base, head, and merge base OIDs. Confirm only after checking them: the session is pinned to those commits and does not follow later ref movement.

Loopnote listens only on an ephemeral `127.0.0.1` loopback port. It prints the review URL before attempting to open your default browser. If no browser opens, use the printed URL directly.

## Review in the browser

1. Select a changed file in the file tree.
2. Inspect the side-by-side Monaco diff: **BASE** is on the left and **HEAD** is on the right. Unchanged regions start collapsed; use Monaco’s context controls to reveal more context.
3. Move between files and changes using visible controls or shortcuts. On either side of the diff, add a line comment and save it.
4. Open **Review** to write and save the overall Markdown summary. Use its preview to inspect the rendered summary.
5. Inspect saved comments, edit them, resolve them when addressed, and reopen resolved feedback when needed.
6. Check the review-readiness information and any warning about unsaved text before exporting. Export uses the accepted saved revision, not unsaved text currently in a tab.

Saved comments and the saved summary are repository-local, versioned JSON state. Reopen the same ordered comparison to continue that saved review. Text left unsaved in a comment or summary editor remains only in the current browser tab; it is not durable and is excluded from export.

### Draft location

Loopnote stores a draft at:

```text
.loopnote/drafts/<comparison-key>.json
```

`<comparison-key>` is a 64-hex SHA-256 hash derived from the ordered, pinned base and head commit OIDs. It is an application-generated draft identity, not a filename you choose or a literal base/head path.

## Export an accepted review

Export creates this pair together from the accepted draft revision:

```text
.loopnote/exports/<baseOid>..<headOid>/review.json
.loopnote/exports/<baseOid>..<headOid>/review.md
```

`review.json` is the canonical export; `review.md` is derived from it. Export does not apply, stage, commit, or push changes.

After a successful export, the receipt offers **Reveal export directory**. The export area also shows `.gitignore` status and offers an optional flow to append the Loopnote ignore rule. Ignore status is not a prerequisite for reviewing or exporting.

## Stop Loopnote

Return to the terminal where you launched `loopnote` and press `Ctrl+C`. This stops the local loopback server.

## Keyboard shortcuts

Visible controls remain available for every action. These shortcuts are additional ways to work:

| Action | Shortcut |
| --- | --- |
| Previous file | Alt+Shift+[ |
| Next file | Alt+Shift+] |
| Previous change | Shift+F7 |
| Next change | F7 |
| Add or focus a comment on the current line | Option+Enter on macOS; Alt+Enter on Windows and Linux |
| Add the comment | Command+Enter on macOS; Ctrl+Enter on Windows and Linux |
| Discard or close the composer | Escape |
| Move through controls | Tab and Shift+Tab |
| Move in the changed-file tree; open a file | Arrow keys; Enter |
| Open Monaco accessibility help | Alt+F1 |

## Review changes from a coding agent

**The Loopnote skill is the recommended way to use this protocol**; it builds the request, supervises the process, and consumes the canonical result for you. See [Install](#install). Use the raw commands below when you are scripting the protocol yourself or building another integration.

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

## v1 file limits

Loopnote reviews regular UTF-8 text files only. Each inspected blob side must be at most 1,048,576 bytes (1 MiB).

Binary, non-UTF-8, oversized, symlink, submodule, and unsupported mode/type entries stay visible but are not reviewable. Missing-object cases (missing objects) are separately unavailable rather than unsupported file kinds. Loopnote does not separately detect arbitrary generated source files. Its own `.loopnote/` internal output is always excluded from the review inventory.

## License and independent notices

Loopnote is open source under the [MIT License](LICENSE). You may use, copy, modify, distribute, sublicense, and sell copies, including in commercial products, provided you retain the required copyright and permission notices. The software is provided without warranty.

Required independent grants and attributions remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The application and the separately distributed marketplace skill use MIT; third-party components retain their own licenses and notices.

## Voluntary support

Support is optional and feature-neutral: review and export do not require payment. Supporting Loopnote does not purchase extra review capabilities or a service, maintenance, update or support commitment.

## Problems and questions

Report problems and ask questions in [Loopnote Issues](https://github.com/Ship-With-AI/loopnote/issues), for both the CLI and the skill.
