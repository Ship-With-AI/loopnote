import { Buffer } from 'node:buffer';

import {
  AgentReviewRequestSchema,
  MAX_AGENT_REQUEST_BYTES,
  type AgentReviewRequest,
} from '../contracts/request.js';
import { RENAME_MAP } from '../domain/product-identity.js';

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export type AgentRequestErrorKind =
  | 'empty-request'
  | 'request-too-large'
  | 'invalid-utf8'
  | 'malformed-json'
  | 'unsupported-version'
  | 'invalid-request'
  | 'legacy-kind'
  | 'unknown-mode'
  | 'base-with-unstaged'
  | 'path-outside-repository'
  | 'pathspec-no-match'
  | 'pathspec-ignored';

const requestErrorMessages = {
  'empty-request': `Request input is empty. Pipe one ${RENAME_MAP.kindPrefix}.review-request JSON document.`,
  'request-too-large': 'Request input exceeds 1048576 bytes. Reduce the request and try again.',
  'invalid-utf8': 'Request input must be valid UTF-8 JSON.',
  'malformed-json': 'Request input must contain one JSON document.',
  'unsupported-version': 'Request schema version is unsupported. Use schemaVersion 1.',
  'invalid-request': `Request is invalid. Use kind "${RENAME_MAP.kindPrefix}.review-request", schemaVersion 1, and one supported source mode.`,
  'legacy-kind': `Request kind is outdated. Use kind "${RENAME_MAP.kindPrefix}.review-request" instead.`,
  'unknown-mode': 'Request mode is not supported. Use revisions, patch, uncommitted, or files.',
  'base-with-unstaged': '"base" cannot be combined with source "unstaged".',
  'path-outside-repository': 'Request references a path outside the repository.',
  'pathspec-no-match': 'Request pathspec does not match any file.',
  'pathspec-ignored': 'Request pathspec matches only ignored files.',
} as const satisfies Record<AgentRequestErrorKind, string>;

export class AgentRequestError extends Error {
  readonly kind: AgentRequestErrorKind;

  constructor(kind: AgentRequestErrorKind) {
    super(requestErrorMessages[kind]);
    this.name = 'AgentRequestError';
    this.kind = kind;
  }
}

// The literal old-kind string is an intentional, documented grep-audit exception
// (17.1-PATTERNS.md Pattern 1): it must match the exact pre-rename kind so requests
// still carrying it are recognized and rejected with a specific, named error.
function isLegacyKind(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'kind' in value &&
    value.kind === 'cumpa.review-request'
  );
}

function isUnsupportedVersion(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'schemaVersion' in value &&
    value.schemaVersion !== 1
  );
}

function isUnknownMode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'mode' in value &&
    typeof value.mode === 'string' &&
    !['revisions', 'patch', 'uncommitted', 'files'].includes(value.mode)
  );
}

function isBaseWithUnstaged(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('uncommitted' in value)) {
    return false;
  }
  const uncommitted = value.uncommitted;
  return (
    typeof uncommitted === 'object' &&
    uncommitted !== null &&
    !Array.isArray(uncommitted) &&
    'source' in uncommitted &&
    uncommitted.source === 'unstaged' &&
    'base' in uncommitted &&
    uncommitted.base !== undefined
  );
}

function freezeRequest(request: AgentReviewRequest): AgentReviewRequest {
  if (request.mode === 'revisions') {
    Object.freeze(request.revisions.pathspecs);
    Object.freeze(request.revisions);
  } else if (request.mode === 'patch') {
    Object.freeze(request.patch.target);
    Object.freeze(request.patch);
  } else if (request.mode === 'uncommitted') {
    Object.freeze(request.uncommitted.pathspecs);
    Object.freeze(request.uncommitted);
  } else {
    Object.freeze(request.files.paths);
    Object.freeze(request.files);
  }
  return Object.freeze(request);
}

export async function readAgentReviewRequest(
  input: AsyncIterable<Uint8Array>,
): Promise<AgentReviewRequest> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of input) {
    byteLength += chunk.byteLength;
    if (byteLength > MAX_AGENT_REQUEST_BYTES) {
      throw new AgentRequestError('request-too-large');
    }
    chunks.push(chunk);
  }

  if (byteLength === 0) {
    throw new AgentRequestError('empty-request');
  }

  let value: unknown;
  try {
    value = JSON.parse(strictUtf8.decode(Buffer.concat(chunks, byteLength)));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new AgentRequestError('invalid-utf8');
    }
    throw new AgentRequestError('malformed-json');
  }

  const parsed = AgentReviewRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new AgentRequestError(
      isLegacyKind(value)
        ? 'legacy-kind'
        : isUnsupportedVersion(value)
          ? 'unsupported-version'
          : isUnknownMode(value)
            ? 'unknown-mode'
            : isBaseWithUnstaged(value)
              ? 'base-with-unstaged'
              : 'invalid-request',
    );
  }

  return freezeRequest(parsed.data);
}
