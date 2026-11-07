---
phase: quick
plan: 1
task_id: 261107-g4w
status: complete
completed: 2026-11-07T11:05:50+00:00
source_commit: 326c0b53891b5a6156a8ee8349865717fd97f3c7
release_version: 2.1.0
---

# Publish Loopnote 2.1.0 — Verified Release

## Outcome

`@shipwithai/loopnote@2.1.0` is published under npm `latest`. One trusted-publishing workflow run consumed the exact approved CI-built archive, without a local publication, candidate rebuild, workflow rerun or publication retry. Native release production and isolated public consumers were exercised on Darwin ARM64; no broader platform matrix or SLSA-level claim is made.

## Immutable identity

| Binding | Observed value |
|---|---|
| Source commit | `326c0b53891b5a6156a8ee8349865717fd97f3c7` |
| CI workflow | `.github/workflows/publish-npm.yml`, `refs/heads/main`, workflow_dispatch |
| Run / attempt | [42365448405](https://github.com/Ship-With-AI/loopnote/actions/runs/42365448405) / 1 |
| Artifact ID | `13570924844` |
| Artifact ZIP digest | `sha256:aaac888a9a88e28b8f1af8a007617fa10b9350011ffc6d33da10aa8ebd89f015` |
| Archive | `shipwithai-loopnote-2.1.0.tgz` |
| Archive byte length | 3574605 |
| Archive SHA-256 | `3b95b538d24372a5a8c9f17c0b0241ca485f89b6788e625f3e68a2db30909ce5` |
| Registry SHA-1 | `77ed24629b03a3708d1297b5ca22e019c2b13988` |
| Registry SHA-512 integrity | `sha512-IXAR7ZAsUfbB0Re5PrsKWGeToy0E6mssZpvv9qQJE0+WqMNaVUWn8Zhfyozw8LwpXNN9TzVlemdd/qHYLBxh5w==` |
| Sealed evidence SHA-256 | `880762fc0e3255e2b9126cfd1a4d3f08af69f2390c39264d3dd565bef12c0b8c` |

## Execution and evidence

1. Bumped only the three version fields in package.json/package-lock.json; committed `326c0b5` (`chore(release): 2.1.0 [skip ci]`). Work stayed on main, without a branch or worktree. The release boundary created no Supabase deployment run. Existing milestone tag `v2.1` was not replaced.
2. Passed 987 Vitest tests across 92 files, Node/Vue/test typechecks, and 21 Deno support tests. Configured local installed-package acceptance passed its three parent checks before CI dispatch.
3. Identified retained temporary transports from the successful 2.0.0 release. Repointed only the release source pin, reused the unchanged origin transport, and dispatched the candidate once. Its Darwin ARM64 build, scanner, installed acceptance and seal completed successfully.
4. Independently downloaded the exact artifact ZIP and verified GitHub's transport digest. Verified every runtime payload hash, packed identity, legal bytes, selected source/CI/run/attempt bindings, fix ancestry and a changed main workbench bundle versus registry 2.0.0. MIT SHA-256 remained `c947d781600d41cdeac710b2c81f5cd04ed88bad83dcc2277cffb30768490c7d`; notices matched the previously published 2.0.0 bytes (`aa408b6edfd54b7435e6ba0608844405369350313baf0f80b0170012f17fe1c3`). Read-only archive/evidence/approval/public-verification custody is retained outside the checkout; no private custody path or support origin is recorded here.
5. At 2026-11-07T10:54:03+00:00, the operator selected **Approve exact artifact and publish** after being shown the archive SHA-256, byte length, source, run, attempt and artifact ID. This expressly authorized API approval of that run's `npm-release` environment only. The pending deployment cleared; both candidate and publish jobs completed successfully.
6. The exact-version endpoint initially returned HTTP 404 during processing. Reconciled read-only, never republished. An ephemeral Python monitor failed because its trust store contained zero CA certificates; Node's verified TLS transport succeeded without disabling certificate verification or changing system trust.
7. The existing `verify-public` helper passed: registry bytes equal the approved archive; npm signatures/attestations and provenance bind the package subject to the selected repository/source/workflow/run/attempt; a clean isolated global install produced `loopnote --version` = `2.1.0`; literal `npx --yes @shipwithai/loopnote@2.1.0 --version` under separate clean state also returned `2.1.0`. Its scratch cleanup completed. A separate online metadata check confirmed `latest: 2.1.0`.
8. After both workflow jobs were terminal, deleted only `production/LOOPNOTE_RELEASE_SOURCE_SHA` and `production/LOOPNOTE_RELEASE_BUILD_ORIGIN`, checked their ownership, and confirmed both absent on the server. Unrelated production configuration remained untouched.

## Scope and tracking

Executed this mechanical version/release task inline using the existing pipeline. No application changes, dependency changes, permanent tests, marketplace publication, protection changes, new npm credentials or new release framework. Preserve the unrelated untracked phase .gitkeep and all historical deferred debt. ROADMAP.md is unchanged. Release receipt/project tracking follow the approved source commit and are separate from the published artifact; they are not automatically pushed.

## Verification receipt

Public-release verifier: `loopnote.npm-release-verification/v1`, status `passed`; provenance `passed`; consumer cleanup `true`. Completed 2026-11-07T11:05:50+00:00.
