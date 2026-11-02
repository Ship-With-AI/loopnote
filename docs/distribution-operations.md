# Loopnote distribution operations

This is the maintainer evidence policy for `@shipwithai/loopnote`, not a release receipt. The selected source repository is `Ship-With-AI/loopnote`; its Issues tracker is the sole selected problem/question channel. Loopnote uses the standard MIT open-source license.

## Phase 3 — legal and public-source gates

On 2026-09-08, the user replaced the proprietary licensing direction with MIT. The active contract is MIT distribution, including commercial reuse and resale, with the existing repository and reviewed history becoming public only after authorization. Quick task `260908-d25` supersedes the earlier licensing restrictions; do not restore them or the obsolete permanent-private-source premise.

Before repository or package publication, verify the exact MIT LICENSE SHA-256 against both named licensors' attributable entries in `.planning/phases/03-distribution-contract-legal-boundary/03-LICENSE-APPROVAL.md`, together with the bound rights review and notices. The prior proprietary approvals do not approve the MIT bytes. Renewed exact-text MIT assent is recorded: Alessandro's direct approval and his witnessed report of Manuel's own approval, not independently verified assent from Manuel. Missing, unsupported, stale or mismatched evidence blocks publication, not local preparation. Preserve the difference between actual human approval and an agent-authored claim. These are maintainer publication gates, not additional restrictions on MIT recipients. Independently licensed material and prior grants survive.

Plan 03-03 separately reviews the final source/history delta and actual GitHub exposure, including all applicable refs, Actions logs/artifacts, hosted surfaces and protections. Owner acceptance of an earlier reviewed location is not a blanket allowlist for new private data. Store only bounded, redacted evidence and exact artifact digests, not credentials, private identifying values or confidential operational content.

The operator's 2026-09-08 PUB-01 disposition accepts only the six reviewed non-secret CI identifier fingerprints recorded in `03-PUBLICATION-REVIEW.md`. Keep that exact-scope exception distinct from secrets, personal data, new values and the stricter runtime-package/evidence boundaries. Accepted historical logs need not be deleted or their variables migrated to secrets.

Obtain distinct private-preparation and final-publication authorizations bound to the exact reviewed state, repository identity and permitted actions. Use only approved repository-scoped, short-lived mutation authority. A source push may trigger existing workflows; approve those effects before pushing. Public conversion exposes Actions history and disables all push rulesets, so require an approved, supported protection disposition. No unapproved ref push, deletion, history rewrite, protection change or visibility conversion is permitted.

After the authorized conversion, verify repository identity, actual public state, exact main OID, LICENSE bytes and Issues access through genuinely credential-free requests. A configured URL, successful authenticated request or local source inspection does not prove anonymous usability. Keep later local approval/review/SUMMARY commits separate from the exact approved source target; do not automatically push them.

**No npm mutation occurs in Phase 3.** Name/version metadata and documentation are preparation, not registry, artifact or provenance evidence.

## Phase 4 — one reviewed immutable runtime artifact

The Phase 4 manifest is publishable and includes only `dist/`, `README.md`, `LICENSE`, and `THIRD_PARTY_NOTICES.md` alongside npm's mandatory package metadata. The marketplace skill is excluded. Metadata eligibility is not artifact acceptance or permission to publish.

Build and review one immutable tarball. Record its exact digest and contents; bind the approved license/notices and source inputs to that actual artifact. A prepack inventory, old build, source-tree notice file or planning assertion is not final package acceptance. Preserve the accepted tarball as immutable Phase 4 history; its future publication designation follows the new CI-candidate policy below.

Create bytes explicitly with `npm run pack:runtime-artifact -- --purpose development-check --custody-dir <new-absolute-directory> --evidence <new-absolute-json-path>`. The parent directories must exist. Each invocation performs one build and one scripts-disabled pack; it never overwrites evidence or deletes an emitted archive after failure. The ordinary `prepack` hook is developer convenience, not release authority.

Use `candidate` for final local acceptance and `deployment-check` for disposable deployment checks; both require clean tracked source/index and the canonical `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL` in the protected environment. `development-check` allows stable uncommitted changes and configured absence, but cannot become an approved release. Never pass the origin in argv. Evidence retains only its configured flag/fingerprint, basename, independent SHA-256/SHA-1/SHA-512 identities, source/build/legal/native facts, and inventories—not custody paths or origin cleartext.

Verify those same bytes with `npm run verify:production-artifacts -- --archive <absolute-tgz> --expected-sha256 <recorded-sha256> --evidence <absolute-json>`. No verification command rebuilds or repacks. The verifier uses native `tar` in protected temporary storage, compares post-extraction permissions under umask 077, and parses JavaScript with Vue's already-installed compiler parser to distinguish real imports/worker URLs from compiler strings. The scope is trusted local producer output with bounded disclosure scanning, not arbitrary hostile archives or exhaustive secret detection.

Run installed acceptance with `npm run accept:runtime-artifact`. Supply `LOOPNOTE_RUNTIME_CUSTODY_DIR`, `LOOPNOTE_RUNTIME_ARCHIVE_BASENAME`, `LOOPNOTE_RUNTIME_ARCHIVE_SHA256`, `LOOPNOTE_RUNTIME_EVIDENCE`, and a new absolute `LOOPNOTE_RUNTIME_ACCEPTANCE_REPORT` path, plus the protected `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL`. The parent verifies the archive, then launches the dedicated browser suites without origin overrides. Neither acceptance runner builds or packs.

Each suite installs the supplied tarball under a fresh npm prefix, HOME, cache and config with install scripts disabled. It verifies direct runtime versions and records a digest of the resolved dependency inventory; npm's explicitly optional, absent peers are not missing required dependencies. Runtime Node fetch and browser routing deny non-loopback support access while exercising the real unavailable/dismissal flow. The test-only Node preloader is outside the package. Windows generated command shims use `cmd.exe`; guarded launches use the installed JavaScript entrypoint.

Passing fixture tests are not approval. The final archive must use the already-approved real origin, pass its own unchanged-byte acceptance, become read-only in durable outside-checkout custody, and receive attributable approval repeating its actual SHA-256 and byte length. No synthetic-origin test archive can satisfy that gate.

## Phase 5 — New CI-built stable candidate

Phase 5 uses a fresh CI build, actual byte-bound inspection and approval, then unchanged-byte publication from the **same workflow run and attempt**. It never publishes a local rebuild or the historical Phase 4 archive as fallback.

The accepted Phase 4 archive remains unchanged and read-only: SHA-256 `e7766d43f7f804b138e694b298480cdec62ebfc16960f86d4c1e3c7959cf1dca`, 3513998 bytes. Its sealed evidence and attributable approval remain historical records. Supersede only its future publication designation, and only after actual approval of the new CI candidate. A deterministic new build may happen to have the same digest; the fresh build/source/run binding and new approval remain mandatory.

### Separate authority for each operation

Local implementation and successful checks do not authorize source publication, npm authentication, hosted configuration, CI dispatch/upload, artifact approval or stable publication. Each operating plan obtains attributable authority for its exact resource, source or actual artifact identity. Previous Phase 3/4 approvals, bootstrap approval and CI artifact approval are not stable publication authority.

Keep all source work on `main`. Complete bookkeeping before selecting clean reviewed source P, create/select P with the explicitly reviewed `[skip ci]` boundary, and review its actual commit metadata, parents, signature and reachable history. Prepare the configured bootstrap from P before writing later canonical review/evidence records. Later bookkeeping may advance local main: never reset or check out P to recover cleanliness, and push only literal authorized P rather than whatever HEAD subsequently becomes.

Every push to main normally triggers Supabase deployment. The separately authorized source push must use the reviewed one-off suppression and verify no collateral deployment occurred. If actual protection rules prevent that route, stop for an owner decision; do not disable or weaken the deployment workflow or unrelated protection.

### Distinct usable bootstrap and credential cleanup

Use a complete configured `@shipwithai/loopnote@1.5.0-bootstrap.0` release under tag `bootstrap`, never an empty reservation or `1.5.0` under another tag. Produce it through `--purpose bootstrap`, inspect it through the scanner's explicit `--profile bootstrap`, and run the existing argument-free acceptance command with `LOOPNOTE_RUNTIME_PROFILE=bootstrap`. Source package/lock stay at 1.5.0; only the new private packing tree projects the fixed prerelease. Never read, unpack or repack the historical stable tarball as an input.

Obtain new actual-digest/byte-length/limitations approval and separate bootstrap publication authority. Any required npm login belongs to one isolated, bounded, live guarded operation armed before authentication and kept active across human waits. Record safe ownership/recovery metadata privately; never persist credentials or live login URLs as planning evidence. Preserve pre-existing GitHub authentication.

The sole bootstrap mutation publishes the exact approved absolute archive with `--tag bootstrap --access public --ignore-scripts --fetch-retries=0 --registry https://registry.npmjs.org/`. A nonzero or ambiguous result triggers only read-only reconciliation, never a publish retry. Revoke the temporary npm authorization and remove its owned local files before stable work. Distinguish operator-confirmed revocation from independently observed server proof. Machine death, SIGKILL or provider loss leaves unresolved cleanup that must be recovered first; it is not proof of automatic revocation.

### Temporary configuration and CI admission

GitHub `production/SUPABASE_PROJECT_REF` remains authoritative. Derive the canonical origin only in process memory; do not create a local `.env`, print the raw value, or make another permanent configuration source. The approved origin SHA-256 remains `89485617b2d50d4778542ebedc3817a3e3fcddb6520a4a9c3a66e37c3a9c6cdf`; a change requires a separate configuration decision.

The input-free `.github/workflows/publish-npm.yml` uses noncanceling concurrency group `loopnote-npm-stable`. It serializes stable publishes of any version, a strictly stronger boundary than the former same-version group: a newer dispatch queues behind an in-flight stable run instead of racing the mutable `latest` dist-tag. Its candidate job's first executable step checks the authorized source variable against `GITHUB_SHA` before checkout, installation or origin use. Only producer/scanner/acceptance steps receive the masked origin. The Darwin ARM64 GitHub-hosted candidate job uses `production`, contents-read permission, Node 24, npm 11.19.1 and a 45-minute execution limit.

Configure the exact trusted-publisher relationship for `Ship-With-AI/loopnote`, `.github/workflows/publish-npm.yml` and protected `npm-release`; explicitly enable direct publishing rather than relying on npm's staging default. After separate actual stable publication authority, approve only the same run's protected `npm-release` job. It alone has `id-token: write`, uses Ubuntu 24.04 and has a 15-minute execution limit.

Dispatch/build/upload needs its own authority. If production review is required, approve only the exact candidate-build job, never a Supabase deployment or the publication environment under that authority. Monitor the candidate job independently; watching the entire run would wait on the deliberately blocked publisher.

Persist ownership intent and response metadata around setup effects. Partial setup with no possible job cleans immediately; active jobs retain the origin until terminal. During abort, removal of the owned source guard can fence later admissions. Monitor competing runs until transports are gone, do not cancel unrelated runs, and never approve publication during contention. Remove and verify only owned temporary resources; uncertain cleanup blocks further work.

### Same-run candidate approval and publication

The candidate sequence is pinned-source checkout, tool setup, `npm ci`, Chromium provisioning, one configured producer invocation, real scanner, full installed browser/support/V2/V3/native acceptance, evidence sealing, independent hashes/read-only files and one artifact upload. No extra build or pack occurs. Sealed evidence preserves the producer core and adds validated scanner, acceptance and CI observations; upload artifact ID/digest are recorded afterward, not injected into the already sealed bytes.

Download and inspect that exact artifact ID and actual payload. Local inspection uses observed GitHub metadata and hashes; never spoof CI identity variables to make a CI-only verifier approve a local inspection. Record the new candidate's actual SHA-256, byte length, evidence seal, source, workflow, run, attempt, transport identity and limitations separately from Phase 4. New human artifact approval does not release the protected publisher.

Record run creation, artifact expiry, a conservative approval bound at creation plus 30 days and workflow bound plus 35 days, reserving the 15-minute publication window. Expiry requires a newly authorized cycle, not a rerun or reused approval.

The publisher downloads the exact artifact ID, independently checks archive SHA-256/length against build outputs, and runs the standalone stdlib `verify-candidate` against the evidence seal and current source/run/attempt. It does not install project dependencies, use the protected origin, invoke the full scanner, build, pack or repack. Its one `npm publish` consumes the absolute unchanged archive with `--tag latest --access public --ignore-scripts --fetch-retries=0 --registry https://registry.npmjs.org/`, from fresh outside-checkout HOME/cache/config state. Strip static npm authentication/configuration while preserving real GitHub OIDC context. No long-lived npm credential or `npm whoami` capability test is used.

The publisher downloads the exact artifact ID, independently checks archive SHA-256/length against build outputs, and runs the standalone stdlib `verify-candidate` against the evidence seal and current source/run/attempt. It does not install project dependencies, use the protected origin, invoke the full scanner, build, pack or repack. Its one `npm publish` consumes the absolute unchanged archive with `--tag latest --access public --ignore-scripts --fetch-retries=0 --registry https://registry.npmjs.org/`, from fresh outside-checkout HOME/cache/config state. Strip static npm authentication/configuration while preserving real GitHub OIDC context. No long-lived npm credential or `npm whoami` capability test is used.

### Public proof and failure handling

Preserve eligible automatic provenance, but do not infer it from authentication, an exit code or a UI badge. Independently fetch exact public registry metadata and archive bytes and compare length, SHA-256, npm SHA-1 and SHA-512 with the approved CI candidate.

Use supported npm 11.19.1 to create a fresh private exact-version audit installation with both its actual installed node and matching lockfile. Only then run `npm audit signatures --json --include-attestations`. An empty or lock-only tree, missing target bundle or failed audit proves nothing. Inspect npm's actual cryptographically verified Loopnote SLSA bundle, allowing its separate verified registry publish attestation, and require exact subject, repository, source commit, workflow, ref, event, hosted runner, run and attempt agreement. Record bounded expected/observed/pass comparisons. Do not claim a SLSA level, exhaustive input capture or an unobserved native platform matrix.

Prove a separate clean global install exposes the generated `loopnote --version`, then run literal `npx --yes @shipwithai/loopnote@<the exact released version> --version` under another empty cache/prefix. Neither path may fall back to a local archive, checkout dist or shared cache. Write the successful public verification receipt only after scratch cleanup succeeds.

A timeout, failed/absent/mismatched attestation, version collision, byte mismatch, consumer failure or ambiguous publication result stops the success path. Reconcile read-only and retain the actual bounded outcome; do not retry publication, rebuild, rerun, unpublish or substitute the old artifact. Canonical evidence excludes credentials, raw origin/project reference, private custody locations and unbounded provider payloads.

## Phase 7 — public-artifact acceptance boundary

The durable, bounded outcome is `.planning/phases/07-clean-public-artifact-acceptance/07-ACCEPTANCE-EVIDENCE.json`. It covers the identity-pinned public package on the global, empty-cache `npx`, and isolated marketplace/OMP installation paths. The public paths run through `npm run accept:public-artifact`; the marketplace/OMP path runs through `npm run accept:marketplace-profile`; `npm run evidence:public-acceptance` merges their bounded reports without overwriting the durable record.

Support observations run in pre-Restore then post-Restore windows against one shared voluntary-support identity: pre-Restore records unverified and dismissed behavior before the single protected sign-in attempt, while post-Restore records verified behavior. The record is partially blocked because the verified row could not obtain a live entitlement; it is not substituted. All paths retained unrestricted review and export for their observed unverified and dismissed rows.

Execution requires public registry reachability, installed Chromium, a disposable Git fixture, a paid GitHub account plus human sign-in for a verified-support attempt, reachable hosted support, and for the marketplace path an available OMP executable, reachable public marketplace collection, and model access in the isolated OMP profile. Absence of any prerequisite is an honestly blocked row, never a substitute success.

This is local process isolation, not fresh-machine proof: one macOS host and one browser were exercised, without an OS/browser compatibility matrix. OMP is the only exercised agent runtime; Claude Code, Codex, and Pi remain unexercised and the Phase 6 four-agent waiver remains intact. The Phase 4/5 local-archive acceptance record is separate and unchanged; its full execution still requires operator-held custody inputs and the protected support-service configuration.

One operator-confirmed shared support HOME/install identity was used across all three paths because three distinct identities would require three protected sign-ins. This narrows only the support identity: npm cache, npm configuration, install prefix, browser profile state, checkout separation, and sanitized PATH remained isolated per path. The isolated OMP profile also used a temporary read-only operator provider-credential copy and was not independently authenticated.

The acceptance installs only the identity-pinned public package—never a source build, workspace link, or local tarball—and creates no permanent configuration. The support origin remains baked into the published launcher and is never re-supplied through arguments or a local environment file. These runs do not publish, push, or deploy; Phase 5 and Phase 6 publication authority has already been consumed.

## Unchanged product and licensing boundaries

This licensing change does not expand the maintainer release plan to include a source-inclusive tarball, application protocol change, AI/API/schema/UI work, new release framework or approval engine. Do not add activation, DRM, a license server or payment gating. Voluntary support remains feature-neutral and buys no service commitment.

The marketplace skill is a separately distributed MIT-licensed integration requiring a separately installed MIT-licensed CLI. Matching licenses do not merge their installation lifecycles or authorize bundling the skill in the runtime-only package.

## Supabase deployment artifacts during preparation

The existing deployment workflow keeps its repository gates, production deployment and configured package build/scan. It uploads only `supabase-deployment-evidence.json`, not the unaccepted runtime tarball. The existing workflow verifier rejects archive upload targets and additional upload steps.

The owner explicitly directs retaining the two reviewed legacy runtime archives, artifacts 9907668126 and 9928300866, despite their unremediated missing-notice finding. Their private backups remain retained; the earlier selective-removal authorization and deletion-token request are cancelled. This exact owner-accepted risk is not verified third-party permission or notice compliance and does not authorize retention-setting changes or any other remote mutation.
