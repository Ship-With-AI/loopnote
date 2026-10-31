import { Buffer } from 'node:buffer';

import { z } from 'zod';

export const MAX_AGENT_REQUEST_BYTES = 1_048_576;
export const MAX_GIT_ARGUMENT_BYTES = 4_096;
export const MAX_PATHSPEC_COUNT = 256;

const emptyPathspecs: string[] = [];

function isValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
}

function isBoundedGitArgument(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && isValidUnicode(value) && Buffer.byteLength(value, 'utf8') <= MAX_GIT_ARGUMENT_BYTES;
}

export const GitArgumentSchema = z.string().refine(isBoundedGitArgument, {
  message: 'Git arguments must be non-empty, valid Unicode without NUL, and at most 4096 UTF-8 bytes.',
});

const RevisionRangeSchema = z
  .strictObject({
    base: GitArgumentSchema,
    head: GitArgumentSchema,
    pathspecs: z
      .array(GitArgumentSchema)
      .max(MAX_PATHSPEC_COUNT)
      .default(emptyPathspecs)
      .transform((pathspecs) => Object.freeze(pathspecs)),
  })
  .readonly();

const ExactPatchContentSchema = z
  .string()
  .refine(
    (value) => value.length > 0 && !value.includes('\0') && isValidUnicode(value) && Buffer.byteLength(value, 'utf8') <= MAX_AGENT_REQUEST_BYTES,
    { message: 'Patch content must be valid Unicode without NUL and fit within the request byte limit.' },
  );

const ExactPatchTargetSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('repository') }),
    z.strictObject({ kind: z.literal('worktree') }),
  ])
  .readonly();

export const ExactPatchRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('patch'),
    patch: z
      .strictObject({
        content: ExactPatchContentSchema,
        target: ExactPatchTargetSchema,
      })
      .readonly(),
  })
  .readonly();

const RevisionRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('revisions'),
    revisions: RevisionRangeSchema,
  })
  .readonly();

const UncommittedSourceSchema = z.enum(['staged', 'unstaged', 'worktree']);

const UncommittedRequestScopeSchema = z
  .strictObject({
    source: UncommittedSourceSchema,
    base: GitArgumentSchema.optional(),
    pathspecs: z
      .array(GitArgumentSchema)
      .max(MAX_PATHSPEC_COUNT)
      .default(emptyPathspecs)
      .transform((pathspecs) => Object.freeze(pathspecs)),
  })
  .superRefine((scope, ctx) => {
    if (scope.source === 'unstaged' && scope.base !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['base'],
        message: '"base" cannot be combined with source "unstaged".',
      });
    }
  })
  .readonly();

const UncommittedRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('uncommitted'),
    uncommitted: UncommittedRequestScopeSchema,
  })
  .readonly();

const FilesRequestScopeSchema = z
  .strictObject({
    paths: z
      .array(GitArgumentSchema)
      .min(1)
      .max(MAX_PATHSPEC_COUNT)
      .transform((paths) => Object.freeze(paths)),
  })
  .readonly();

const FilesRequestSchema = z
  .strictObject({
    kind: z.literal('cumpa.review-request'),
    schemaVersion: z.literal(1),
    mode: z.literal('files'),
    files: FilesRequestScopeSchema,
  })
  .readonly();

export const AgentReviewRequestSchema = z
  .discriminatedUnion('mode', [
    RevisionRequestSchema,
    ExactPatchRequestSchema,
    UncommittedRequestSchema,
    FilesRequestSchema,
  ])
  .readonly();

export type AgentReviewRequest = z.infer<typeof AgentReviewRequestSchema>;
