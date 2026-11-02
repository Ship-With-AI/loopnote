import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import type { GroundedExactPatch, PinnedComparison, UncommittedScope } from '../contracts/comparison.js';
import {
  createCapabilityRegistry,
  createExactPatchCapabilityRegistry,
  createUncommittedCapabilityRegistry,
  createStandaloneCapabilityRegistry,
  createSupportCapability,
  type CapabilityRegistryOptions,
  type SupportCapability,
} from './capabilities.js';
import { createHostedSupportClient } from './support-client.js';
import { createSupportStore } from './support-store.js';
import {
  createDraftStore,
  type DraftFileSystem,
  type DraftStore,
} from './draft-store.js';
import { registerSessionRoutes } from './routes.js';
import { materializePatchSnapshot } from './patch-snapshot.js';
import { materializeWorktreeSnapshot } from './worktree-snapshot.js';
import {
  registerSessionSecurity,
  type SecurityDiagnostic,
  type SessionSecurityTarget,
} from './security.js';
import { RENAME_MAP } from '../domain/product-identity.js';

export interface CreateSessionAppOptions extends CapabilityRegistryOptions {
  readonly sessionToken: string;
  readonly webRoot?: string;
  readonly diagnostics?: (diagnostic: SecurityDiagnostic) => void;
  readonly support?: SupportCapability;
}

export interface CreateExactPatchSessionAppOptions extends CreateSessionAppOptions {
  readonly snapshotParent?: string;
  readonly observePatchTarget?: () => Promise<boolean>;
}

export interface CreateUncommittedSessionAppOptions extends CreateSessionAppOptions {
  readonly snapshotRoot?: string;
}

export interface CreateStandaloneSessionAppOptions extends CreateSessionAppOptions {
  readonly snapshotRoot?: string;
}

export interface SessionApp extends FastifyInstance {
  bindSessionSecurity(target: SessionSecurityTarget): void;
}

export function createConfiguredSupportCapability(
  environment: NodeJS.ProcessEnv = process.env,
): SupportCapability | undefined {
  const serviceUrl = environment[`${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL`];
  try {
    if (serviceUrl === undefined || new URL(serviceUrl).protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }

  return createSupportCapability(createSupportStore(), createHostedSupportClient({ serviceUrl }));
}


type TestRecoveryFailure = 'backup' | 'replacement';

function testRecoveryFailure(): TestRecoveryFailure | undefined {
  if (process.env.NODE_ENV !== 'test') {
    return undefined;
  }

  const configured = process.env[`${RENAME_MAP.envPrefix}TEST_RECOVERY_FAILURE`];
  return configured === 'backup' || configured === 'replacement' ? configured : undefined;
}

function createRecoveryFaultFileSystem(failure: TestRecoveryFailure): DraftFileSystem {
  return {
    readFile: async (path) => fs.readFile(path),
    mkdir: async (path) => {
      await fs.mkdir(path, { recursive: true });
    },
    open: async (path, flags, mode) => {
      if (
        (failure === 'backup' && path.endsWith('.bak')) ||
        (failure === 'replacement' && path.endsWith('.tmp'))
      ) {
        throw new Error('Test-only recovery persistence failure.');
      }

      const handle = await fs.open(path, flags, mode);
      return {
        writeFile: async (bytes) => handle.writeFile(bytes),
        sync: async () => handle.sync(),
        close: async () => handle.close(),
      };
    },
    rename: async (from, to) => fs.rename(from, to),
    unlink: async (path) => fs.unlink(path),
    syncDirectory: async (path) => {
      const handle = await fs.open(path, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
  };
}

function createAppDraftStore(
  comparison: PinnedComparison,
  options: CreateSessionAppOptions,
): DraftStore {
  if (options.draftStore !== undefined) {
    return options.draftStore;
  }

  const failure = testRecoveryFailure();
  return createDraftStore({
    repositoryRoot: comparison.repositoryRoot,
    comparison: comparison.range === undefined
      ? {
          baseCommitOid: comparison.base.oid,
          headCommitOid: comparison.head.oid,
          mergeBaseOid: comparison.mergeBaseOid,
        }
      : {
          baseCommitOid: comparison.base.oid,
          headCommitOid: comparison.head.oid,
          mergeBaseOid: comparison.mergeBaseOid,
          range: comparison.range,
        },
    ...(options.attachedCompletion === undefined ? {} : { storageScope: options.attachedCompletion.storageScope }),
    ...(failure === undefined ? {} : { fileSystem: createRecoveryFaultFileSystem(failure) }),
  });
}

export function createSessionApp(
  comparison: PinnedComparison,
  options: CreateSessionAppOptions,
): SessionApp {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  }) as unknown as SessionApp;
  const support = options.support ?? createConfiguredSupportCapability();
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, '../web');
  const draftStore = createAppDraftStore(comparison, options);
  const capabilities = createCapabilityRegistry(comparison, { ...options, draftStore, support });
  const security = registerSessionSecurity(app, options);

  app.decorate('bindSessionSecurity', security.bind);
  app.addHook('onClose', async () => support?.close());
  registerSessionRoutes(app, capabilities);
  void app.register(fastifyStatic, {
    root: webRoot,
    index: ['index.html'],
  });

  return app;
}

export async function createExactPatchSessionApp(
  grounded: GroundedExactPatch,
  options: CreateExactPatchSessionAppOptions,
): Promise<SessionApp> {
  const snapshot = await materializePatchSnapshot(grounded, {
    parent: options.snapshotParent,
    observeTarget: options.observePatchTarget,
  });
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  }) as unknown as SessionApp;
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, '../web');
  const support = options.support ?? createConfiguredSupportCapability();
  const capabilities = await createExactPatchCapabilityRegistry(grounded, snapshot, { ...options, support });
  const security = registerSessionSecurity(app, options);

  app.addHook('onClose', async () => support?.close());
  app.decorate('bindSessionSecurity', security.bind);
  app.addHook('onClose', async () => snapshot.dispose());
  registerSessionRoutes(app, capabilities);
  void app.register(fastifyStatic, {
    root: webRoot,
    index: ['index.html'],
  });
  return app;
}

export async function createUncommittedSessionApp(
  scope: UncommittedScope,
  options: CreateUncommittedSessionAppOptions,
): Promise<SessionApp> {
  const snapshot = await materializeWorktreeSnapshot(scope, {
    root: options.snapshotRoot ?? join(tmpdir(), `${RENAME_MAP.slug}-worktree-${randomUUID()}`),
  });
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  }) as unknown as SessionApp;
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, '../web');
  const support = options.support ?? createConfiguredSupportCapability();
  const capabilities = await createUncommittedCapabilityRegistry(scope, snapshot, { ...options, support });
  const security = registerSessionSecurity(app, options);

  app.addHook('onClose', async () => support?.close());
  app.decorate('bindSessionSecurity', security.bind);
  registerSessionRoutes(app, capabilities);
  void app.register(fastifyStatic, {
    root: webRoot,
    index: ['index.html'],
  });
  return app;
}

export async function createStandaloneSessionApp(
  scope: UncommittedScope,
  options: CreateStandaloneSessionAppOptions,
): Promise<SessionApp> {
  const snapshot = await materializeWorktreeSnapshot(scope, {
    root: options.snapshotRoot ?? join(tmpdir(), `${RENAME_MAP.slug}-worktree-${randomUUID()}`),
  });
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  }) as unknown as SessionApp;
  const webRoot = options.webRoot ?? resolve(import.meta.dirname, '../web');
  const support = options.support ?? createConfiguredSupportCapability();
  const capabilities = await createStandaloneCapabilityRegistry(scope, snapshot, { ...options, support });
  const security = registerSessionSecurity(app, options);

  app.addHook('onClose', async () => support?.close());
  app.decorate('bindSessionSecurity', security.bind);
  registerSessionRoutes(app, capabilities);
  void app.register(fastifyStatic, {
    root: webRoot,
    index: ['index.html'],
  });
  return app;
}
