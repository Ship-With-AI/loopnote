---
phase: 19-typecheck-foundation
reviewed: 2026-11-04T17:02:48Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .github/workflows/deploy-supabase-production.yml
  - scripts/verify-supabase-support.mjs
  - scripts/verify-typecheck-negative-gate.mjs
  - src/web/App.vue
  - src/web/components/DiffWorkspace.vue
  - src/web/components/DraftRecovery.vue
  - src/web/components/ReviewNotesDialog.vue
  - src/web/model/review-draft-state.ts
  - tests/e2e/support-payment.spec.ts
findings:
  critical: 0
  warning: 0
  info: 8
  total: 8
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-11-04T17:02:48Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Iteration-2 re-review of the same 9-file scope after three fix commits (`21a9288`, `19b2740`, `b48e2d6`). All three iteration-1 Warnings are confirmed closed, and the fixes introduced no Critical or Warning defect: the App.vue root chain is total again (`v-if` loading → `v-else-if` unavailable → `v-else` session shell) while still giving `vue-tsc` the `session !== undefined` narrowing through the negated `||` chain, and the negative-gate proof now fails loudly both when the mutated run exits `0` and when the reverted run exits non-zero, which closes the vacuous-pass hole.

No Critical and no Warning findings remain. Eight Info items stand: five carried over unfixed from iteration 1 (three-list CI command drift, untested job-scoped assertion, proof script invoking `npx vue-tsc` instead of the gate command, proof script never executed automatically, hand-copied `AttachedCompletionStatus` literals) and three surfaced by this pass (signal handlers that outlive the mutation window and can overlap the asynchronous `finally` restore, the empty `ErrorState` message in the branch the WR-01 fix newly covers, and DraftRecovery's now-partial notice chain that owns the `aria-labelledby` target).

## Prior Findings Re-Verified

- Iteration-1 WR-01 (`src/web/App.vue:1248,1258`) — **fixed.** `session === undefined` was folded into the `unavailable-shell` condition and the `session-shell` returned to a bare `v-else`, so every root state renders something. Narrowing survives: in the `v-else` branch TypeScript negates all three disjuncts, which yields `session !== undefined` for the accesses at lines 1264, 1347, 1399 and 1405. The net diff against the pre-phase base is now only the condition widening plus the `AttachedLifecycle` import.
- Iteration-1 WR-02 (`scripts/verify-typecheck-negative-gate.mjs:15-26,40-41,50-51`) — **fixed.** `runTypecheck()` returns `{ status, output }`; the mutated run fails when `status === 0`, the reverted run fails when `status !== 0`. The previously vacuous `revertedPathDisplayLines.length > 0` assertion can no longer pass when the typecheck never really ran (missing `npx`/`vue-tsc`, `ENOBUFS` truncation), because the status assertion fires first.
- Iteration-1 WR-03 (`scripts/verify-typecheck-negative-gate.mjs:31-36`) — **fixed for the reported failure mode.** `restoreOnSignal` is registered before the mutation window, rewrites `original` synchronously and re-raises through `process.kill(process.pid, signal)`; because `process.once` removes the listener before the re-raise, the signal meets Node's restored default disposition and the process terminates. One narrower residual concern is recorded as IN-05.

## Narrative Findings (AI reviewer)

No structural pre-pass was supplied for this iteration, so every item below comes from direct reading of the nine files in scope.

## Info

### IN-01: Keep the third workflow command list in lockstep

**File:** `scripts/verify-supabase-support.mjs:1741`
**Issue:** `'npm run typecheck:web'` was added to the substring `required` array (line 1736) and to the job-scoped `gateCommands` array (line 1750), but not to the whole-workflow `commands` array (line 1741) where every other gate command is listed. Coverage is not lost — `gateCommands` is built from a slice of the same `- run:` lines, so it is the strictly stronger assertion — but the three lists now read differently for one command and a future maintainer cannot tell whether the gap is deliberate.
**Fix:** insert `'npm run typecheck:web'` after `'npm run typecheck:tests'` in the line 1741 array so all three lists enumerate the same commands.

### IN-02: Cover the job-scoped assertion for the new gate command

**File:** `tests/e2e/support-payment.spec.ts:222`
**Issue:** the new mutation case replaces `npm run typecheck:web` with `npm run typecheck:tests:web`, which is caught by the substring `required` loop at `verify-supabase-support.mjs:1739` (the mutated text no longer contains `npm run typecheck:web`). The job-scoped `gateCommands` entry at `verify-supabase-support.mjs:1750` — the only assertion that pins the step *inside* `repository-gates` rather than anywhere in the file — is never the failing check, so deleting that entry would leave the suite green.
**Fix:** add a relocation case next to the rename case so the job-scoped check is the one that fires:

```ts
const relocated = testInfo.outputPath('web-typecheck-relocated.yml');
await writeFile(relocated, source
  .replace('      - run: npm run typecheck:web\n', '')
  .replace(
    '      - run: npm ci\n      - name: Guard canonical Supabase target',
    '      - run: npm ci\n      - run: npm run typecheck:web\n      - name: Guard canonical Supabase target',
  ));
await reject(['--verify-workflow', relocated], 'workflow is missing required npm run typecheck:web');
```

### IN-03: Prove the command CI actually runs

**File:** `scripts/verify-typecheck-negative-gate.mjs:17`
**Issue:** the proof hard-codes `npx vue-tsc --noEmit --project tsconfig.web.json` instead of the gate command `npm run typecheck:web` that `.github/workflows/deploy-supabase-production.yml:28` runs. They are identical today (`package.json:41`), so the proof is valid now, but any future flag or project change in the npm script silently stops being proven while this script keeps printing success.
**Fix:** invoke the gate through npm so the proof and the gate cannot diverge:

```js
    const stdout = execFileSync('npm', ['run', '--silent', 'typecheck:web'], {
```

### IN-04: The permanent proof never runs automatically

**File:** `scripts/verify-typecheck-negative-gate.mjs:8`
**Issue:** `verify:typecheck-negative-gate` appears only in `package.json:47`; no workflow step, vitest suite or Playwright spec invokes it (searching the repository outside `.planning/` for `negative-gate` returns only `package.json` and the script itself). Combined with fail-closed coupling to one exact template string (`originalBinding = ':display="file.oldPath.display"'`, matching `PathDisplay.vue:38`), the proof rots silently: the first time that binding changes, the script fails permanently and nothing reports it until someone runs it by hand.
**Fix:** add `- run: npm run verify:typecheck-negative-gate` to the `repository-gates` job and extend the three command lists in `verify-supabase-support.mjs` plus the mutation `cases` array in `support-payment.spec.ts`, per the established three-location contract.

### IN-05: Scope the signal restore to the mutation window

**File:** `scripts/verify-typecheck-negative-gate.mjs:31-36,46-48`
**Issue:** the SIGINT/SIGTERM handlers added by the WR-03 fix are never removed, so they stay live after the `finally` block has already restored the file: a signal during the reverted typecheck (line 50) or during `console.log` (line 57) triggers a blind `writeFileSync` of a snapshot captured at script start, overwriting anything written to `PathDisplay.vue` in the meantime. The registration also overlaps the asynchronous restore — `finally`'s `await writeFile` (line 47) yields the event loop, which is exactly when a signal queued during the blocking `execFileSync` is delivered, so the synchronous and asynchronous restores can interleave; if the pending `open(O_TRUNC)` lands after the handler's write and the process dies before the data write, the file is left empty instead of restored.
**Fix:** make the restore exclusive — synchronous in `finally`, with the handlers removed as soon as the mutation window closes:

```js
} finally {
  writeFileSync(targetPath, original, 'utf8');
  process.off('SIGINT', restoreOnSignal);
  process.off('SIGTERM', restoreOnSignal);
}
```

### IN-06: Give the newly covered branch a message

**File:** `src/web/App.vue:262-265`
**Issue:** the WR-01 fix routes `session === undefined` into the `unavailable-shell`, whose `:message="unavailableMessage"` (line 1254) resolves to `errorMessage` for every non-snapshot case. In exactly that new case `errorMessage` is `''`, so `ErrorState` renders an empty `<p role="alert">` beneath "Review unavailable" / "Pinned session unavailable". The state is not reachable today (`primarySurface !== 'loading'` requires `draftLoad` at line 1199 or `recoveredDraftOpen` at line 499, both written strictly after `session.value = loaded` at line 1181, and `session` is never reset), so this is purely about the fallback being legible if it ever is.
**Fix:** fall back to a session-missing sentence instead of the empty string:

```ts
const unavailableMessage = computed(() =>
  patchSnapshotUnavailable.value
    ? `The accepted patch snapshot is missing, corrupt, incomplete, or unreadable. Relaunch ${RENAME_MAP.displayName} with an exact patch that matches the current implementation.`
    : errorMessage.value !== ''
      ? errorMessage.value
      : `This review session is no longer available. Relaunch ${RENAME_MAP.displayName}.`,
);
```

### IN-07: Keep the non-attached sentinel out of the dialog prop

**File:** `src/web/components/ReviewNotesDialog.vue:40`
**Issue:** the consolidated `AttachedLifecycle` (`src/web/model/review-draft-state.ts:50`) adds `'ordinary'` — the sentinel meaning "not an attached session" — to the dialog's prop type, which the deleted local union deliberately excluded. The consuming chain has no branch for it: `attached` (line 71) becomes true, the badge at line 191 labels it `Waiting`, and the terminal `v-else` renders the "requesting agent is waiting" copy. App.vue only passes the prop when `isAttachedSession` is true, and `reloadAttachedStatus()` is awaited before `reviewDraft` exists, so `'ordinary'` cannot reach the dialog today; the consolidation simply dropped a compile-time guarantee. The union also still hand-copies the three literals `AttachedCompletionStatus['kind']` defines in `src/contracts/api.ts:336-342`, which `App.vue:507` (`attachedLifecycle.value = status.kind`) depends on.
**Fix:** derive the shared union, and narrow the prop:

```ts
export type AttachedLifecycle =
  | AttachedCompletionStatus['kind']
  | 'ordinary'
  | 'waitingDisconnected'
  | 'retryableFailure'
  | 'terminalFailure';
```

```ts
    readonly attachedLifecycle?: Exclude<AttachedLifecycle, 'ordinary'>;
```

### IN-08: Keep DraftRecovery's notice chain total

**File:** `src/web/components/DraftRecovery.vue:140`
**Issue:** converting the terminal `<template v-else>` to `v-else-if="load.kind === 'newerUnsupported'"` narrows `load` for `foundVersion`/`supportedVersion`, but it makes the chain partial. It is total over today's `ReadOnlyDraftLoad` (`malformed` and `schemaInvalid` through `isRecoverable`, plus `newerUnsupported`), yet those two branches own the only `id="draft-recovery-heading"` element, which `<main aria-labelledby="draft-recovery-heading">` (line 110) points at — a fourth read-only kind would silently produce a card with no heading and a dangling accessible name, and `vue-tsc` would not flag it. This is the same totality property the WR-01 fix just restored in App.vue.
**Fix:** keep the discriminant branch and add a generic terminal fallback that still supplies the heading:

```html
        <template v-else>
          <h1 id="draft-recovery-heading">Local review draft is read only</h1>
          <p>{{ RENAME_MAP.displayName }} cannot open this draft. The file has not been changed.</p>
        </template>
```

---

_Reviewed: 2026-11-04T17:02:48Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
