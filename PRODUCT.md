# Product facts

## Product

Loopnote is a local-first code review application for committed changes between two local Git branch or registered-worktree heads. Its core value is precise review feedback without publishing the comparison to a remote host.
Loopnote is the product name used across the CLI, browser workspace, exports, and repository-local state.

## Audience

- Developers reviewing local Git changes before sharing or merging them.
- Coding agents consuming exported, drift-detectable feedback.

## Supplied capabilities

- An interactive CLI selects an ordered base and head from local branches and registered worktrees.
- Installed Git is the authority for repository discovery, refs, merge bases, worktrees, renames, changed-file metadata, and blobs.
- A Fastify server binds to loopback only and opens a browser workspace.
- The Vue interface uses Monaco for side-by-side text diffs, syntax highlighting, line mapping, and inline review controls.
- Reviewers can leave line comments and an overall summary.
- Versioned JSON drafts live in the repository-local, gitignored `.loopnote/` directory.
- Exports provide Markdown and canonical JSON for a coding agent.
- Version 1 reviews text files; binary, generated, oversized, and unsupported files remain visible but non-reviewable.

## Deliberate non-capabilities

No claim is made for remote hosting, cloud synchronization, multi-user collaboration, approvals, suggestions, replies, viewed state, authentication, pricing, customers, usage metrics, certifications, or binary review.

## Content boundaries

- Commit IDs, paths, line numbers, change counts, comments, and statuses shown in the workspace come from the selected local comparison or its local draft.
- Prototype content and test fixtures are examples, not product metrics or customer evidence.
- Fixture Git identities use reserved `test.invalid` placeholder addresses and do not represent a contact channel.
- No signup, contact, purchase, or remote-delivery action is presented.

## Missing facts

Pricing, public availability, supported operating-system matrix, customer evidence, performance claims, release date, and remote integrations have not been supplied and must not appear as product claims.
