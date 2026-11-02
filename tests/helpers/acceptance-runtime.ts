import {
  PINNED_PUBLIC_ARTIFACT,
} from './public-artifact-identity.js';
import {
  createSharedSupportHome,
  installPublicGlobalRuntime,
  preparePublicNpxRuntime,
  type InstalledPublicRuntime,
} from './public-runtime.js';
import {
  installRuntimeArtifact,
  readRuntimeArtifact,
  type RuntimeArtifact,
  type RuntimeInstallProof,
} from './runtime-artifact.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

export type AcceptanceInstallSource = 'local-archive' | 'public-global' | 'public-npx';

export interface AcceptanceRuntime {
  readonly source: AcceptanceInstallSource;
  readonly root: string;
  readonly launch: Readonly<{ readonly command: string; readonly args: readonly string[] }>;
  readonly env: NodeJS.ProcessEnv;
  readonly expectedVersion: string;
  readonly packageRoot?: string;
  readonly artifact?: RuntimeArtifact;
  readonly installProof?: RuntimeInstallProof;
  readonly publicProof?: InstalledPublicRuntime['proof'];
  readonly blockedFetchesPath?: string;
  readonly supportHome?: string;
  cleanup(): void;
}

function installPublicRuntime(
  source: Exclude<AcceptanceInstallSource, 'local-archive'>,
  environment: NodeJS.ProcessEnv,
): AcceptanceRuntime {
  const supportHome = createSharedSupportHome(environment[`${RENAME_MAP.envPrefix}ACCEPTANCE_SUPPORT_HOME`]);
  try {
    const runtime = source === 'public-global'
      ? installPublicGlobalRuntime({ supportHome, installScripts: 'enabled' })
      : preparePublicNpxRuntime({ supportHome });
    if (runtime.proof.resolvedVersion !== PINNED_PUBLIC_ARTIFACT.version) {
      throw new Error('[acceptance-runtime] public runtime did not resolve the pinned version');
    }
    return Object.freeze({
      source,
      root: runtime.root,
      launch: runtime.launch,
      env: runtime.env,
      expectedVersion: runtime.proof.resolvedVersion,
      packageRoot: runtime.packageRoot,
      publicProof: runtime.proof,
      supportHome: supportHome.home,
      cleanup() {
        runtime.cleanup();
        supportHome.cleanup();
      },
    });
  } catch (error) {
    supportHome.cleanup();
    throw error;
  }
}

export function resolveAcceptanceRuntime(environment: NodeJS.ProcessEnv = process.env): AcceptanceRuntime {
  const source = environment[`${RENAME_MAP.envPrefix}PUBLIC_INSTALL_SOURCE`] ?? 'local-archive';
  if (source === 'local-archive') {
    const artifact = readRuntimeArtifact(environment);
    const runtime = installRuntimeArtifact(artifact);
    return Object.freeze({
      source,
      root: runtime.root,
      launch: runtime.launch,
      env: runtime.env,
      expectedVersion: artifact.package.version,
      packageRoot: runtime.packageRoot,
      artifact,
      installProof: runtime.proof,
      blockedFetchesPath: runtime.blockedFetchesPath,
      cleanup: runtime.cleanup,
    });
  }
  if (source === 'public-global' || source === 'public-npx') return installPublicRuntime(source, environment);
  throw new Error(`[acceptance-runtime] ${RENAME_MAP.envPrefix}PUBLIC_INSTALL_SOURCE must be local-archive, public-global, or public-npx; received ${JSON.stringify(source)}`);
}

export function publicSupportHomeOf(runtime: AcceptanceRuntime): string | undefined {
  return runtime.source === 'local-archive' ? undefined : runtime.supportHome;
}
