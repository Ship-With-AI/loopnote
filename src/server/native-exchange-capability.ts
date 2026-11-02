import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RENAME_MAP } from '../domain/product-identity.js';

import type { ReExportCapability } from './export-store.js';

type DirectoryExchangeAddon = Readonly<{
  readonly exchangeDirectories: (
    root: string,
    stable: string,
    candidate: string,
  ) => Readonly<{ readonly kind: 'supported' | 'unsupported' | 'failed' }>;
  readonly probeDirectoryExchange: (root: string) => Readonly<{ readonly kind: 'supported' | 'unsupported' | 'failed' }>;
}>;

export type NativeExchangeCapabilityDependencies = Readonly<{
  readonly mkdtemp: (prefix: string) => Promise<string>;
  readonly rm: (path: string, options: Readonly<{ readonly recursive: boolean; readonly force: boolean }>) => Promise<void>;
  readonly loadAddon: () => DirectoryExchangeAddon;
}>;

const require = createRequire(import.meta.url);
const unsupportedCapability: ReExportCapability = Object.freeze({ kind: 'reExportUnsupported' });

export function createNativeExchangeCapabilityObserver(
  dependencies: NativeExchangeCapabilityDependencies,
): () => Promise<ReExportCapability> {
  return async () => {
    let probeRoot: string | undefined;
    let capability = unsupportedCapability;

    try {
      probeRoot = await dependencies.mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-native-exchange-probe-`));
      const addon = dependencies.loadAddon();
      if (addon.probeDirectoryExchange(probeRoot).kind === 'supported') {
        capability = Object.freeze({
          kind: 'observedNativeExchange',
          exchangeDirectories: addon.exchangeDirectories,
        });
      }
    } catch {
      capability = unsupportedCapability;
    }

    if (probeRoot !== undefined) {
      try {
        await dependencies.rm(probeRoot, { recursive: true, force: true });
      } catch {
        return unsupportedCapability;
      }
    }

    return capability;
  };
}

const observeNativeExchangeCapability = createNativeExchangeCapabilityObserver({
  mkdtemp,
  rm,
  loadAddon: () => require('../native/directory_exchange.node') as DirectoryExchangeAddon,
});
let observedCapability: Promise<ReExportCapability> | undefined;

export function getObservedNativeExchangeCapability(): Promise<ReExportCapability> {
  observedCapability ??= observeNativeExchangeCapability();
  return observedCapability;
}
