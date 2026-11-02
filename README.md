# Loopnote

Loopnote is local review for any agent-produced artifact — code, plans, decisions, docs — in a pull-request-style workspace, without publishing a branch, worktree, or patch. Review a pinned Git comparison, uncommitted work, or standalone files; leave durable feedback; export it for an agent or teammate to use.

Published as **`@shipwithai/loopnote`**; command **`loopnote`**.

Stable releases are published on npm. Each stable release's registry bytes, provenance attestation, and global, `npx`, and marketplace installation paths are verified during release acceptance before publishing. Source and the sole support channel are the public [Ship-With-AI/loopnote](https://github.com/Ship-With-AI/loopnote) repository and its [Issues tracker](https://github.com/Ship-With-AI/loopnote/issues).

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

The skill accepts stable Loopnote versions `>=2.0.0 <3.0.0` and rejects prereleases.

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

This is the interactive terminal route. If you use the Loopnote skill, your agent performs this launch for you with pinned OIDs and hands you the review URL.

### Review a committed range

Change to the Git worktree whose local branches or registered worktrees you want to loopnote, then run:

```sh
cd /path/to/repository-to-review
loopnote
```

Loopnote asks you to choose the **base**, then the **head**, from searchable lists of local branches and registered worktrees, and opens the browser workspace at a loopback URL. For the full walkthrough — merge-base selection, the dirty-worktree note, and the confirmation screen — see [docs/usage.md](docs/usage.md#starting-a-review).

### Review uncommitted changes

Review staged, unstaged, or the full working tree against `HEAD` directly, with no Base/Head selection:

```sh
loopnote --worktree
```

Use `--staged` or `--unstaged` instead to narrow the comparison, or `--base <ref>` to compare against a ref other than `HEAD`. Uncommitted reviews freeze a snapshot when the session starts; use **Refresh** in the browser to capture current bytes without losing saved comments. Full flag reference: [docs/usage.md](docs/usage.md#flags-and-arguments).

### Review standalone files

Review named files or globs directly, with no Base/Head selection:

```sh
loopnote src/example.ts docs/*.md
```

Each file renders full-width in a single pane rather than as a two-sided diff. Full reference: [docs/usage.md](docs/usage.md#standalone-file-review).

### Toggle Markdown rendering

For Markdown files, use the **Source** and **Rendered** buttons in the file toolbar to switch between the raw text diff and a rendered preview; line comments work in either mode.

## Review changes from a coding agent

**The Loopnote skill is the recommended way to use this protocol**; it builds the request, supervises the process, and consumes the canonical result for you. See [Install](#install).

To script the protocol directly, pipe a JSON request to `loopnote` and redirect `stdout` to a file:

```sh
node --input-type=module -e '
const request = {
  kind: "loopnote.review-request",
  schemaVersion: 1,
  mode: "revisions",
  revisions: {
    base: "0123456789abcdef0123456789abcdef01234567",
    head: "89abcdef0123456789abcdef0123456789abcdef",
  },
};
process.stdout.write(JSON.stringify(request));
' | loopnote > agent-review.json
```

For the exact-patch mode, the full flag reference, and the protocol's isolation/persistence guarantees, see [docs/usage.md](docs/usage.md#agent-request-protocol).

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
| Move in the file tree; open a file | Arrow keys; Enter |
| Open Monaco accessibility help | Alt+F1 |

## File limits

Loopnote reviews regular UTF-8 text files only. Each inspected blob side must be at most 1,048,576 bytes (1 MiB).

Binary, non-UTF-8, oversized, symlink, submodule, and unsupported mode/type entries stay visible but are not reviewable. Missing-object cases (missing objects) are separately unavailable rather than unsupported file kinds. Loopnote does not separately detect arbitrary generated source files. Its own `.loopnote/` internal output is always excluded from the review inventory.

## Upgrading from Cumpa

Loopnote is the renamed continuation of Cumpa. If a `.cumpa/` directory exists from a 1.x install, the drafts and exports stored there are not readable by 2.0.0 and are not migrated. `.cumpa/` is excluded from Loopnote's review file inventory and never appears as reviewable or comparable content. `.cumpa/` is no longer used and can be deleted. Voluntary support status carries over automatically on first run; no action is required.

## License and independent notices

Loopnote is open source under the [MIT License](LICENSE). You may use, copy, modify, distribute, sublicense, and sell copies, including in commercial products, provided you retain the required copyright and permission notices. The software is provided without warranty.

Required independent grants and attributions remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The application and the separately distributed marketplace skill use MIT; third-party components retain their own licenses and notices.

## Voluntary support

Support is optional and feature-neutral: review and export do not require payment. Supporting Loopnote does not purchase extra review capabilities or a service, maintenance, update or support commitment.

## Problems and questions

Report problems and ask questions in [Loopnote Issues](https://github.com/Ship-With-AI/loopnote/issues), for both the CLI and the skill.
