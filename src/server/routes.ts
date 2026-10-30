import type { FastifyInstance } from 'fastify';

import {
  AppendCumpaIgnoreResultSchema,
  CumpaIgnoreStatusSchema,
  DraftLoadResponseSchema,
  DraftMutationRequestSchema,
  DraftMutationResultSchema,
  DraftRecoveryRequestSchema,
  DraftRecoveryResultSchema,
  DraftRevealResultSchema,
  ExportDirectoryRevealResultSchema,
  ExportReviewRequestSchema,
  ExportReviewResultSchema,
  PatchStatusResponseSchema,
  SelectorDriftResponseSchema,
  OpaqueFileIdSchema,
  AttachedCompletionStatusSchema,
  FinishReviewRequestSchema,
  FinishReviewResultSchema,
  SupportStartRequestSchema,
  SupportStartResultSchema,
  SupportStatusSchema,
  UncommittedDraftRecoveryResultSchema,
  type DraftMutationResult as ApiDraftMutationResult,
  type DraftRecoveryResult as ApiDraftRecoveryResult,
} from '../contracts/api.js';
import { DurableAnchorV1Schema } from '../contracts/draft.js';
import { buildDurableAnchor } from '../domain/anchor.js';
import type { CapabilityRegistry } from './capabilities.js';
import type { DraftLoadState } from './draft-loader.js';
import type { DraftMutationResult as StoreDraftMutationResult, DraftStoreMutation } from './draft-store.js';
import { REQUEST_UNAVAILABLE_ERROR } from './security.js';

const EMPTY_QUERY_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

const FILE_PARAMS_SCHEMA = {
  type: 'object',
  required: ['fileId'],
  properties: {
    fileId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

function unavailable(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, statusCode: number) {
  return reply.code(statusCode).send(REQUEST_UNAVAILABLE_ERROR);
}

function publicLoad(load: DraftLoadState, draft?: unknown): unknown {
  switch (load.kind) {
    case 'missing':
      return DraftLoadResponseSchema.parse({ kind: load.kind, path: load.path });
    case 'current':
      return DraftLoadResponseSchema.parse({ kind: load.kind, path: load.path, draft });
    case 'malformed':
      return DraftLoadResponseSchema.parse({
        kind: load.kind,
        path: load.path,
        fingerprint: load.fingerprint,
        detail: load.detail,
      });
    case 'schemaInvalid':
      return DraftLoadResponseSchema.parse({
        kind: load.kind,
        path: load.path,
        fingerprint: load.fingerprint,
        details: load.details,
      });
    case 'newerUnsupported':
      return DraftLoadResponseSchema.parse({
        kind: load.kind,
        path: load.path,
        foundVersion: load.foundVersion,
        supportedVersion: load.supportedVersion,
      });
  }
}

async function draftView(capabilities: CapabilityRegistry, load: Extract<DraftLoadState, { readonly kind: 'current' }>): Promise<unknown> {
  return {
    ...load.draft,
    comments: await Promise.all(
      load.draft.comments.map(async (comment) => ({
        ...comment,
        verification: await capabilities.verifyAnchor(comment.anchor),
      })),
    ),
  };
}

function publicMutationResult(result: StoreDraftMutationResult): ApiDraftMutationResult {
  if (result.kind === 'readOnly') {
    return DraftMutationResultSchema.parse({ kind: result.kind, load: publicLoad(result.load) });
  }
  return DraftMutationResultSchema.parse(result);
}

function mutationResponse(
  reply: { code(statusCode: number): { send(payload: unknown): unknown } },
  result: StoreDraftMutationResult,
  acceptedStatus: 200 | 201,
) {
  const response = publicMutationResult(result);
  switch (response.kind) {
    case 'accepted':
      return reply.code(acceptedStatus).send(response);
    case 'revisionConflict':
    case 'illegalTransition':
    case 'readOnly':
      return reply.code(409).send(response);
    case 'invalidTarget':
      return reply.code(404).send(response);
    case 'persistenceFailure':

      return reply.code(500).send(response);
  }
}

export function registerSessionRoutes(app: FastifyInstance, capabilities: CapabilityRegistry): void {
  app.get(
    '/api/session',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async () => await capabilities.session(),
  );

  if (capabilities.support !== undefined) {
    app.get<{ Querystring: Record<string, never> }>('/api/support/status', { schema: { querystring: EMPTY_QUERY_SCHEMA } }, async (request, reply) => {
      if (request.body !== undefined || request.headers['content-length'] !== undefined) return unavailable(reply, 400);
      return SupportStatusSchema.parse(await capabilities.support!.status());
    });
    app.post<{ Querystring: Record<string, never>; Body: unknown }>('/api/support/start', { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 1024 }, async (request, reply) => {
      if (request.headers['content-type']?.split(';', 1)[0] !== 'application/json') return unavailable(reply, 400);
      const body = SupportStartRequestSchema.safeParse(request.body);
      if (!body.success) return unavailable(reply, 400);
      return SupportStartResultSchema.parse(await capabilities.support!.start(body.data.action));
    });
    app.post<{ Querystring: Record<string, never>; Body: unknown }>('/api/support/refresh', { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 1 }, async (request, reply) => {
      if (request.body !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') || request.headers['content-type'] !== undefined) return unavailable(reply, 400);
      return SupportStatusSchema.parse(await capabilities.support!.refresh());
    });
  }

  if (capabilities.attachedCompletion !== undefined) {
    app.get<{ Querystring: Record<string, never> }>(
      '/api/review-completion',
      { schema: { querystring: EMPTY_QUERY_SCHEMA } },
      async (request, reply) => {
        if (
          Object.keys(request.query).length !== 0
          || request.body !== undefined
          || request.headers['content-length'] !== undefined
          || request.headers['content-type'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return AttachedCompletionStatusSchema.parse(capabilities.attachedCompletion!.status());
      },
    );

    app.post<{ Querystring: Record<string, never>; Body: unknown }>(
      '/api/review-completion/finish',
      { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 256 },
      async (request, reply) => {
        if (
          Object.keys(request.query).length !== 0
          || request.headers['content-type']?.split(';', 1)[0] !== 'application/json'
        ) {
          return unavailable(reply, 400);
        }
        const input = FinishReviewRequestSchema.safeParse(request.body);
        if (!input.success) return unavailable(reply, 400);
        const result = FinishReviewResultSchema.parse(await capabilities.attachedCompletion!.finish(input.data.expectedRevision));
        switch (result.kind) {
          case 'completed':
            reply.raw.once('finish', () => capabilities.attachedCompletion!.markResponseSettled());
            return reply.code(201).send(result);
          case 'alreadyCompleted':
            return reply.code(200).send(result);
          case 'revisionConflict':
          case 'staleAnchors':
          case 'scopeInvalid':
          case 'draftReadOnly':
            return reply.code(409).send(result);
          case 'persistenceFailure':
          case 'canonicalizationFailure':
          case 'deliveryFailed':
            return reply.code(500).send(result);
        }
      },
    );
  }

  if (capabilities.patchStatus !== undefined) {
    app.get<{ Querystring: Record<string, never> }>(
      '/api/patch-status',
      { schema: { querystring: EMPTY_QUERY_SCHEMA } },
      async (request, reply) => {
        if (
          Object.keys(request.query).length !== 0 ||
          request.body !== undefined ||
          request.headers['content-length'] !== undefined ||
          request.headers['content-type'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return PatchStatusResponseSchema.parse(await capabilities.patchStatus!());
      },
    );
  }

  const selectorDriftObserver = capabilities.selectorDriftObserver;
  if (selectorDriftObserver !== undefined) {
    app.get<{ Querystring: Record<string, never> }>(
      '/api/selector-drift',
      { schema: { querystring: EMPTY_QUERY_SCHEMA } },
      async (request, reply) => {
        if (
          Object.keys(request.query).length !== 0 ||
          request.body !== undefined ||
          request.headers['content-length'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return SelectorDriftResponseSchema.parse(
          await selectorDriftObserver.observe(),
        );
      },
    );
  }

  if (capabilities.refresh !== undefined) {
    app.post<{ Querystring: Record<string, never>; Body: unknown }>(
      '/api/refresh',
      { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 1 },
      async (request, reply) => {
        if (
          request.body !== undefined ||
          (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') ||
          request.headers['content-type'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return await capabilities.refresh!();
      },
    );
  }

  if (capabilities.worktreeChangeIndicator !== undefined) {
    app.get<{ Querystring: Record<string, never> }>(
      '/api/worktree-status',
      { schema: { querystring: EMPTY_QUERY_SCHEMA } },
      async (request, reply) => {
        if (
          Object.keys(request.query).length !== 0 ||
          request.body !== undefined ||
          request.headers['content-length'] !== undefined ||
          request.headers['content-type'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return await capabilities.worktreeChangeIndicator!();
      },
    );
  }

  if (capabilities.recoverUncommittedDraft !== undefined) {
    app.post<{ Querystring: Record<string, never>; Body: unknown }>(
      '/api/uncommitted/recover-draft',
      { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 1 },
      async (request, reply) => {
        if (
          request.body !== undefined ||
          (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') ||
          request.headers['content-type'] !== undefined
        ) {
          return unavailable(reply, 400);
        }
        return UncommittedDraftRecoveryResultSchema.parse(await capabilities.recoverUncommittedDraft!());
      },
    );
  }

  app.get<{ Params: { fileId: string } }>(
    '/api/files/:fileId',
    {
      schema: {
        params: FILE_PARAMS_SCHEMA,
        querystring: EMPTY_QUERY_SCHEMA,
      },
    },
    async (request, reply) => {
      const fileId = OpaqueFileIdSchema.safeParse(request.params.fileId);
      if (!fileId.success) {
        return unavailable(reply, 404);
      }

      const metadata = await capabilities.lookup(fileId.data);
      if (metadata === undefined) {
        return unavailable(reply, 404);
      }

      return metadata;
    },
  );

  app.get<{
    Params: { fileId: string };
    Querystring: Record<string, never>;
  }>(
    '/api/files/:fileId/content',
    async (request, reply) => {
      if (Object.keys(request.query).length !== 0) {
        return unavailable(reply, 400);
      }
      const fileId = OpaqueFileIdSchema.safeParse(request.params.fileId);
      if (!fileId.success) {
        return unavailable(reply, 404);
      }
      const metadata = await capabilities.lookup(fileId.data);
      if (metadata === undefined) {
        return unavailable(reply, 404);
      }
      if (metadata.availability.kind !== 'text') {
        return unavailable(reply, 409);
      }
      const content = await capabilities.readContent(fileId.data);
      if (content === undefined) {
        return unavailable(reply, 409);
      }
      return content;
    },
  );

  app.get<{ Querystring: Record<string, never> }>(
    '/api/draft',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      if (Object.keys(request.query).length !== 0) {
        return unavailable(reply, 400);
      }
      try {
        const load = await capabilities.draftStore.loadState();
        return publicLoad(load, load.kind === 'current' ? await draftView(capabilities, load) : undefined);
      } catch {
        return unavailable(reply, 500);
      }
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/draft/mutations',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      const requestMutation = DraftMutationRequestSchema.safeParse(request.body);
      if (!requestMutation.success) {
        return unavailable(reply, 400);
      }
      const initialLoad = await capabilities.draftStore.loadState();
      if (initialLoad.kind === 'malformed' || initialLoad.kind === 'schemaInvalid' || initialLoad.kind === 'newerUnsupported') {
        return mutationResponse(reply, { kind: 'readOnly', load: initialLoad }, requestMutation.data.type === 'addComment' ? 201 : 200);
      }

      const { expectedRevision } = requestMutation.data;
      let mutation: DraftStoreMutation;
      if (requestMutation.data.type === 'addComment') {
        const content = await capabilities.readContent(requestMutation.data.fileId);
        const selectedSide = content?.[requestMutation.data.side];
        if (selectedSide === undefined || selectedSide.exists === false) {
          return unavailable(reply, 409);
        }
        if (
          /(?:\r\n|\n)$/u.test(selectedSide.text) &&
          requestMutation.data.line === selectedSide.text.split(/\r\n|\n/u).length
        ) {
          return unavailable(reply, 409);
        }
        try {
          mutation = {
            type: 'addComment',
            body: requestMutation.data.body,
            anchor: DurableAnchorV1Schema.parse(
              buildDurableAnchor({
                path: selectedSide.path,
                safeDisplayPath: selectedSide.path.display,
                side: requestMutation.data.side,
                blobOid: selectedSide.blobOid,
                line: requestMutation.data.line,
                text: selectedSide.text,
              }),
            ),
          };
        } catch {
          return unavailable(reply, 409);
        }
        if (capabilities.onAnchorAdd !== undefined) {
          try {
            await capabilities.onAnchorAdd({ body: requestMutation.data.body, anchor: mutation.anchor });
          } catch {
            return unavailable(reply, 500);
          }
        }
        if (capabilities.onAnchorAdd !== undefined) {
          return reply.code(201).send({ kind: 'accepted' });
        }
      } else {
        const { expectedRevision: _expectedRevision, ...operation } = requestMutation.data;
        mutation = operation;
      }

      const result = await capabilities.draftStore.mutate({ expectedRevision, mutation });
      return mutationResponse(reply, result, requestMutation.data.type === 'addComment' ? 201 : 200);
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/export',
    { schema: { querystring: EMPTY_QUERY_SCHEMA }, bodyLimit: 256 },
    async (request, reply) => {
      if (capabilities.exportReview === undefined) return unavailable(reply, 404);
      if (
        Object.keys(request.query).length !== 0 ||
        request.headers['content-type']?.split(';', 1)[0] !== 'application/json'
      ) {
        return unavailable(reply, 400);
      }
      const input = ExportReviewRequestSchema.safeParse(request.body);
      if (!input.success) {
        return unavailable(reply, 400);
      }
      try {
        const response = ExportReviewResultSchema.parse(await capabilities.exportReview(input.data));
        switch (response.kind) {
          case 'exported':
            return reply.code(201).send(response);
          case 'publicationFailed':
          case 'recoveryRequired':
            return reply.code(500).send(response);
          case 'revisionConflict':
          case 'driftAcknowledgementRequired':
          case 'driftAcknowledgementStale':
          case 'draftReadOnly':
          case 'reExportUnsupported':
            return reply.code(409).send(response);
        }
      } catch {
        return unavailable(reply, 500);
      }
    },
  );

  app.get<{ Querystring: Record<string, never> }>(
    '/api/export/gitignore',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      if (
        Object.keys(request.query).length !== 0 ||
        request.body !== undefined ||
        request.headers['content-length'] !== undefined ||
        request.headers['content-type'] !== undefined
      ) {
        return unavailable(reply, 400);
      }
      return CumpaIgnoreStatusSchema.parse(
        await capabilities.inspectCumpaIgnore(),
      );
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/export/gitignore',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      if (
        Object.keys(request.query).length !== 0 ||
        request.body !== undefined ||
        request.headers['content-length'] !== undefined ||
        request.headers['content-type'] !== undefined
      ) {
        return unavailable(reply, 400);
      }
      return reply.code(200).send(
        AppendCumpaIgnoreResultSchema.parse(
          await capabilities.appendCumpaIgnoreRule(),
        ),
      );
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/export/reveal',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      if (capabilities.revealExportDirectory === undefined) return unavailable(reply, 404);
      if (
        Object.keys(request.query).length !== 0 ||
        request.body !== undefined ||
        request.headers['content-length'] !== undefined
      ) {
        return unavailable(reply, 400);
      }
      try {
        await capabilities.revealExportDirectory();
        return reply.code(200).send(ExportDirectoryRevealResultSchema.parse({ kind: 'revealed' }));
      } catch {
        return reply.code(500).send(ExportDirectoryRevealResultSchema.parse({ kind: 'revealFailed' }));
      }
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/draft/recovery',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      const input = DraftRecoveryRequestSchema.safeParse(request.body);
      if (!input.success) {
        return unavailable(reply, 400);
      }
      const result = await capabilities.draftStore.recover(input.data);
      let response: ApiDraftRecoveryResult;
      if (result.kind === 'recoveryUnavailable') {
        response = DraftRecoveryResultSchema.parse({ kind: result.kind, load: publicLoad(result.load) });
      } else {
        response = DraftRecoveryResultSchema.parse(result);
      }
      return reply.code(response.kind === 'recovered' ? 201 : response.kind === 'persistenceFailure' ? 500 : 409).send(response);
    },
  );

  app.post<{ Querystring: Record<string, never>; Body: unknown }>(
    '/api/draft/reveal',
    { schema: { querystring: EMPTY_QUERY_SCHEMA } },
    async (request, reply) => {
      if (Object.keys(request.query).length !== 0 || request.body !== undefined) {
        return unavailable(reply, 400);
      }
      try {
        await capabilities.revealDraftFile();
        return reply.code(200).send(DraftRevealResultSchema.parse({ kind: 'revealed' }));
      } catch {
        return reply.code(500).send(DraftRevealResultSchema.parse({ kind: 'revealFailed' }));
      }
    },
  );
}
