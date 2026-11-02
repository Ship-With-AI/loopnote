import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// REN-01's final wave-3 gate: a re-globbing, grep-equivalent scanner that fails on any
// live-tree `cumpa` (case-insensitive) hit outside four documented allowed-exception
// categories. The live-tree file set is derived from `git ls-files` (tracked) plus
// `git ls-files --others --exclude-standard` (untracked-but-not-ignored) at run time, so
// it automatically tracks whatever `.gitignore` already excludes (node_modules/, dist/,
// the old `.cumpa/` and current `.loopnote/` repo-local state directories, test-results/,
// playwright-report/, build/, .bg-shell/, *.tgz) without hardcoding any of those names —
// the same exclusion this repo's own `pack-runtime.mjs`/`source-control-snapshot.ts`
// helpers already rely on for their own tracked/untracked file sets.

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Tracked, but internal GSD workflow/planning metadata, not the "live code, config,
// tests, scripts and docs" REN-04/ROADMAP.md's success criterion targets.
const PLANNING_DIRECTORY_PREFIX = '.planning/';

// The scanner's own two files necessarily embed literal `cumpa` substrings (pattern
// definitions, fixtures) to match against — they are not scan targets themselves.
const SELF_FILES = new Set(['scripts/audit-rename-exceptions.mjs', 'tests/unit/rename-audit.test.ts']);

const CUMPA_PATTERN = /cumpa/iu;

// Category 1 — old-kind rejection (D-04, 17.1-02's `isLegacyKind`): the literal
// `cumpa.review-request` / `cumpa.patch-request` kind string inside the new rejection
// error and its test assertions. Not file-scoped: the literal dotted kind-string shape
// is itself narrow and specific enough to classify wherever it legitimately recurs.
const OLD_KIND_LITERAL_PATTERN = /cumpa\.(?:review|patch)-request/u;

// Category 2 — D-06 migration source path (17.1-14's `resolveLegacySupportStatePath`):
// the literal old per-user XDG/platform support-state path inside `support-store.ts`'s
// one-time-copy source-path logic and its tests. Scoped to the two owning files, and
// only when the hit line also names the `support.json` leaf it is reading from.
const MIGRATION_PATH_FILES = new Set(['src/server/support-store.ts', 'tests/api/support-store.test.ts']);
const SUPPORT_JSON_PATTERN = /support\.json/iu;

// Category 3 — D-05 exclusion source prefix (17.1-10's dual-exclusion constants, plus
// the parallel reserved-segment checks in exact-patch.ts/standalone-resolution.ts and
// the .gitignore old-directory entry, 17.1-11): the literal `.cumpa`/`.cumpa/` byte
// prefix, the `cumpaPath`/`cumpaPathPrefix` constants, and the inventory test's
// near-miss fixture names (`.cumpaish.txt`, `cumpa.txt`) proving the prefix match is
// exact. Scoped to the ten owning source/test files named in RESEARCH.md's audit.
const EXCLUSION_PREFIX_FILES = new Set([
  '.gitignore',
  'scripts/pack-runtime.mjs',
  'scripts/verify-production-artifacts.mjs',
  'src/git/exact-patch.ts',
  'src/git/inventory.ts',
  'src/git/standalone-resolution.ts',
  'tests/git/exact-patch.test.ts',
  'tests/git/inventory.test.ts',
  'tests/git/standalone-resolution.test.ts',
  'tests/git/worktree-inventory.test.ts',
]);
const EXCLUSION_PREFIX_PATTERN = /\.cumpa\b|\.cumpa\/|cumpaPath|cumpaish|['"`]cumpa\.txt['"`]/u;

// Category 4 — historical, version-pinned package-identity references: the immutable
// already-published `@shipwithai/cumpa@1.5.0` identity (17.1-05/17.1-15's established
// exception) plus the frozen v1.5 milestone evidence key `skills/cumpa/SKILL.md` that
// `write-acceptance-evidence.mjs` reads verbatim from committed historical JSON.
const HISTORICAL_IDENTITY_FILES = new Set([
  'EVIDENCE.md',
  'scripts/write-acceptance-evidence.mjs',
  'tests/helpers/public-artifact-identity.ts',
  'tests/package/public-artifact-acceptance.test.ts',
  'tests/unit/acceptance-evidence.test.ts',
  'tests/unit/public-artifact-identity.test.ts',
]);
const HISTORICAL_IDENTITY_PATTERN = /@shipwithai\/cumpa(?:@\d+\.\d+\.\d+)?|skills\/cumpa\/SKILL\.md/u;

// Same category, extended: `public-runtime.ts`'s real-registry-install sites were
// deliberately reverted to the old `@shipwithai/cumpa@1.5.0`/`cumpa` bin identity
// (17.1-15) because the real npm registry has not yet published the renamed package —
// every reference in this one file (bin key, executable path, PATH-contamination probe)
// is that same still-live, immutable published-artifact fact.
const HISTORICAL_REAL_RUNTIME_FILE = 'tests/helpers/public-runtime.ts';

function gitListFiles(scanRoot, arguments_) {
  return execFileSync('git', arguments_, { cwd: scanRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\0')
    .filter((entry) => entry.length > 0);
}

function liveTreeFiles(scanRoot) {
  const tracked = gitListFiles(scanRoot, ['ls-files', '-z']);
  const untracked = gitListFiles(scanRoot, ['ls-files', '--others', '--exclude-standard', '-z']);
  const combined = new Set([...tracked, ...untracked]);
  return [...combined]
    .filter((file) => !file.startsWith(PLANNING_DIRECTORY_PREFIX))
    .filter((file) => !SELF_FILES.has(file))
    .sort();
}

function isBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8000);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function isAllowedException(file, line) {
  if (OLD_KIND_LITERAL_PATTERN.test(line)) return true;
  if (MIGRATION_PATH_FILES.has(file) && SUPPORT_JSON_PATTERN.test(line)) return true;
  if (EXCLUSION_PREFIX_FILES.has(file) && EXCLUSION_PREFIX_PATTERN.test(line)) return true;
  if (HISTORICAL_IDENTITY_FILES.has(file) && HISTORICAL_IDENTITY_PATTERN.test(line)) return true;
  if (file === HISTORICAL_REAL_RUNTIME_FILE) return true;
  return false;
}

/**
 * Re-globs the live tree (at `options.root`, default this repo's root) and returns
 * every `cumpa` (case-insensitive) hit that falls outside the four documented
 * allowed-exception categories, as `{ file, line, text }` for diagnosis.
 *
 * @param {{ root?: string }} [options]
 * @returns {ReadonlyArray<{ readonly file: string; readonly line: number; readonly text: string }>}
 */
export function auditRenameExceptions(options = {}) {
  const scanRoot = options.root ?? defaultRoot;
  const hits = [];
  for (const file of liveTreeFiles(scanRoot)) {
    let buffer;
    try {
      buffer = readFileSync(join(scanRoot, file));
    } catch {
      continue; // race: listed then removed/replaced between the glob and the read.
    }
    if (isBinary(buffer)) continue;
    const lines = buffer.toString('utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (!CUMPA_PATTERN.test(line)) continue;
      if (isAllowedException(file, line)) continue;
      hits.push({ file, line: index + 1, text: line });
    }
  }
  return hits;
}

export default auditRenameExceptions;
