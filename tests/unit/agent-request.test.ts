import { describe, expect, test } from 'vitest';

import {
  AgentReviewRequestSchema,
  GitArgumentSchema,
  MAX_PATHSPEC_COUNT,
} from '../../src/contracts/request.js';
import { AgentRequestError, readAgentReviewRequest } from '../../src/cli/request.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

async function* oneChunk(value: unknown): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(JSON.stringify(value));
}

describe('AgentReviewRequestSchema - uncommitted mode', () => {
  test('accepts source "worktree" with base and defaults pathspecs to a frozen empty array', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'worktree', base: 'main' },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'uncommitted') {
      expect(result.data.uncommitted.pathspecs).toEqual([]);
      expect(Object.isFrozen(result.data.uncommitted.pathspecs)).toBe(true);
    }
  });

  test('accepts source "staged" with explicit pathspecs', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'staged', pathspecs: ['src/a.ts'] },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'uncommitted') {
      expect(result.data.uncommitted.pathspecs).toEqual(['src/a.ts']);
    }
  });

  test('accepts source "unstaged" with explicit pathspecs and no base', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'unstaged', pathspecs: ['src/a.ts'] },
    });

    expect(result.success).toBe(true);
  });

  test('rejects source "unstaged" combined with base', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'unstaged', base: 'main' },
    });

    expect(result.success).toBe(false);
  });
});

describe('AgentReviewRequestSchema - files mode', () => {
  test('accepts one or more paths and freezes the array', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'files',
      files: { paths: ['src/a.ts', 'src/b.ts'] },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.mode === 'files') {
      expect(result.data.files.paths).toEqual(['src/a.ts', 'src/b.ts']);
      expect(Object.isFrozen(result.data.files.paths)).toBe(true);
    }
  });

  test('rejects an empty paths array', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'files',
      files: { paths: [] },
    });

    expect(result.success).toBe(false);
  });
});

describe('AgentReviewRequestSchema - existing modes unchanged', () => {
  test('mode "revisions" still parses with the pre-existing fixture shape', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    });

    expect(result.success).toBe(true);
  });

  test('mode "patch" still parses with the pre-existing fixture shape', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'patch',
      patch: { content: 'diff --git a b', target: { kind: 'repository' } },
    });

    expect(result.success).toBe(true);
  });
});

describe('GitArgumentSchema export', () => {
  test('is exported and bounds pathspec-shaped strings', () => {
    expect(GitArgumentSchema.safeParse('src/a.ts').success).toBe(true);
    expect(GitArgumentSchema.safeParse('').success).toBe(false);
  });

  test('MAX_PATHSPEC_COUNT is exported', () => {
    expect(typeof MAX_PATHSPEC_COUNT).toBe('number');
  });
});

describe('AgentReviewRequestSchema - kind literal', () => {
  test('accepts the new kind literal derived from RENAME_MAP.kindPrefix', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    });

    expect(result.success).toBe(true);
  });

  test('rejects the old literal kind "cumpa.review-request"', () => {
    const result = AgentReviewRequestSchema.safeParse({
      kind: 'cumpa.review-request',
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    });

    expect(result.success).toBe(false);
  });
});

describe('readAgentReviewRequest - new error kinds', () => {
  test('rejects an unrecognized mode with AgentRequestError kind "unknown-mode"', async () => {
    const input = oneChunk({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'bogus',
    });

    await expect(readAgentReviewRequest(input)).rejects.toMatchObject({
      kind: 'unknown-mode',
    });
    await expect(readAgentReviewRequest(oneChunk({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'bogus',
    }))).rejects.toBeInstanceOf(AgentRequestError);
  });

  test('rejects base combined with source "unstaged" with AgentRequestError kind "base-with-unstaged"', async () => {
    const input = oneChunk({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'unstaged', base: 'main' },
    });

    await expect(readAgentReviewRequest(input)).rejects.toMatchObject({
      kind: 'base-with-unstaged',
    });
  });

  test('a well-formed "uncommitted" request round-trips frozen', async () => {
    const input = oneChunk({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'uncommitted',
      uncommitted: { source: 'worktree', base: 'main' },
    });

    const request = await readAgentReviewRequest(input);

    expect(Object.isFrozen(request)).toBe(true);
    expect(request.mode).toBe('uncommitted');
    if (request.mode === 'uncommitted') {
      expect(Object.isFrozen(request.uncommitted)).toBe(true);
      expect(Object.isFrozen(request.uncommitted.pathspecs)).toBe(true);
    }
  });

  test('a well-formed "files" request round-trips frozen', async () => {
    const input = oneChunk({
      kind: `${RENAME_MAP.kindPrefix}.review-request`,
      schemaVersion: 1,
      mode: 'files',
      files: { paths: ['src/a.ts'] },
    });

    const request = await readAgentReviewRequest(input);

    expect(Object.isFrozen(request)).toBe(true);
    expect(request.mode).toBe('files');
    if (request.mode === 'files') {
      expect(Object.isFrozen(request.files)).toBe(true);
      expect(Object.isFrozen(request.files.paths)).toBe(true);
    }
  });
});

describe('readAgentReviewRequest - legacy kind rejection', () => {
  test('rejects the old literal kind "cumpa.review-request" with AgentRequestError kind "legacy-kind" naming the new kind', async () => {
    const input = oneChunk({
      kind: 'cumpa.review-request',
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    });

    await expect(readAgentReviewRequest(input)).rejects.toMatchObject({
      kind: 'legacy-kind',
    });
    await expect(readAgentReviewRequest(oneChunk({
      kind: 'cumpa.review-request',
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    }))).rejects.toThrow(RENAME_MAP.kindPrefix);
  });

  test('rejects an unrelated garbage kind with the pre-existing "invalid-request" fallback, not "legacy-kind"', async () => {
    const input = oneChunk({
      kind: 'bogus.kind',
      schemaVersion: 1,
      mode: 'revisions',
      revisions: { base: 'main', head: 'feature' },
    });

    await expect(readAgentReviewRequest(input)).rejects.toMatchObject({
      kind: 'invalid-request',
    });
  });
});
