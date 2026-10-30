import { blobOid } from './exact-patch.js';
import { createGitRunner } from './runner.js';
import type { GitRunner } from './runner.js';

export interface ResolveWorktreeSideContentOptions {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly scope: 'cached' | 'worktree';
  readonly endpoint?: string;
  readonly objectFormat: 'sha1' | 'sha256';
  readonly signal?: AbortSignal;
}

export interface ResolveWorktreeSideContentDependencies {
  readonly runner?: GitRunner;
}

export interface ResolvedWorktreeSideContent {
  readonly bytes: Buffer;
  readonly blobOid: string;
}

const hunkHeaderPattern =
  /^@@ -(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? \+(0|[1-9][0-9]*)(?:,(0|[1-9][0-9]*))? @@(?: .*)?$/u;

function fail(path: string, reason: string): never {
  throw new Error(`resolveWorktreeSideContent: ${reason} for "${path}"`);
}

/**
 * Walks the single full-context hunk produced by `git diff -U1000000` for one
 * path and rebuilds the postimage (the side after the invoked comparison —
 * the worktree file itself for `scope: 'worktree'`) from its context (' ')
 * and added ('+') lines, exactly mirroring the line-prefix classification in
 * `exact-patch.ts`'s `applyText` (modeled on it, not calling it: this reads
 * git's own already-normalized hunk output directly, it does not replay a
 * submitted patch against a known preimage).
 *
 * `-U1000000` always collapses every edited region of a file into exactly
 * one hunk, so a second `@@` header is a malformed-input signal, not a
 * second hunk to merge.
 */
function reconstructPostimage(stdout: Buffer, path: string): Buffer {
  const text = stdout.toString('utf8');
  const lines = text.length === 0 ? [] : text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const output: string[] = [];
  let newCount = 0;
  let newConsumed = 0;
  let hunkFound = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = hunkHeaderPattern.exec(line);
    if (header !== null) {
      if (hunkFound) fail(path, 'a -U1000000 diff produced more than one hunk');
      hunkFound = true;
      newCount = Number(header[4] ?? 1);
      newConsumed = 0;
      continue;
    }
    if (!hunkFound) continue;
    const prefix = line[0];
    if (prefix !== ' ' && prefix !== '+' && prefix !== '-') {
      fail(path, `unrecognized diff hunk line "${line}"`);
    }
    const noNewline = lines[index + 1] === '\\ No newline at end of file';
    if (noNewline) index += 1;
    if (prefix === ' ' || prefix === '+') {
      if (newConsumed >= newCount) fail(path, 'hunk reported more postimage lines than its header declared');
      newConsumed += 1;
      output.push(`${line.slice(1)}${noNewline ? '' : '\n'}`);
    }
  }
  if (!hunkFound) {
    fail(path, 'git diff reported no change (resolveWorktreeSideContent must only be called for already-changed files)');
  }
  if (newConsumed !== newCount) fail(path, 'hunk postimage line count did not match its header');
  return Buffer.from(output.join(''), 'utf8');
}

/**
 * Reconstructs the full text of a diff side that crosses the worktree
 * boundary (Unstaged's worktree side, Working-tree's worktree side for
 * tracked files) by reading `git diff`'s own full-context patch output
 * rather than independently `fs.readFile`-ing the worktree file and
 * comparing it against a differently-normalized object-backed side. Git
 * already applies `core.autocrlf`/`.gitattributes` text normalization
 * consistently when it decides what changed and what the patch text looks
 * like; re-deriving that here would risk silently diverging from `git
 * diff`'s own notion of "changed".
 *
 * Precondition: callers must only invoke this for a path already reported
 * as changed by the corresponding `git diff --raw`/`--numstat` inventory
 * call (`createWorktreeChangedFileInventory`). Calling it for a path with no
 * actual diff is a contract violation, not a case this function recovers
 * from — it throws, mirroring how `exact-patch.ts`'s `applyText` assumes a
 * well-formed patch rather than defensively handling a no-op one.
 */
export async function resolveWorktreeSideContent(
  options: ResolveWorktreeSideContentOptions,
  dependencies: ResolveWorktreeSideContentDependencies = {},
): Promise<ResolvedWorktreeSideContent> {
  const runner = dependencies.runner ?? createGitRunner();
  const result = await runner.run(
    [
      'diff',
      ...(options.scope === 'cached' ? ['--cached'] : []),
      '-U1000000',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      ...(options.endpoint === undefined ? [] : [options.endpoint]),
      '--',
      options.path,
    ],
    { cwd: options.repositoryRoot, signal: options.signal },
  );

  const bytes = reconstructPostimage(result.stdout, options.path);
  return Object.freeze({ bytes, blobOid: blobOid(bytes, options.objectFormat) });
}
