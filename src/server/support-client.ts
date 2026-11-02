import type { SupportAction } from '../contracts/api.js';
import { RENAME_MAP } from '../domain/product-identity.js';
import { z } from 'zod';

const responseLimit = 8192;
const timeoutMs = 5000;
const installationStatusSchema = z.strictObject({ status: z.enum(['unverified', 'verified']) });
const supportStartSchema = z.strictObject({ flowUrl: z.string().url() });

export type HostedSupportClient = Readonly<{
  start(action: SupportAction, installationId: string): Promise<Readonly<{ flowUrl: string }> | undefined>;
  status(installationId: string): Promise<'unverified' | 'verified' | undefined>;
  close(): void;
}>;

async function responseJson(response: Response): Promise<unknown | undefined> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || contentLength > responseLimit) return undefined;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > responseLimit) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

export function createHostedSupportClient(options: Readonly<{
  serviceUrl?: string;
  fetch?: typeof fetch;
}> = {}): HostedSupportClient {
  const configuredServiceUrl = options.serviceUrl ?? process.env[`${RENAME_MAP.envPrefix}SUPPORT_SERVICE_URL`];
  let service: URL | undefined;
  try {
    service = configuredServiceUrl === undefined ? undefined : new URL(configuredServiceUrl);
  } catch {
    service = undefined;
  }
  if (service?.protocol !== 'https:') service = undefined;

  const fetcher = options.fetch ?? globalThis.fetch;
  const lifetimeController = new AbortController();
  const fetchJson = async (path: string, init?: RequestInit): Promise<unknown | undefined> => {
    if (service === undefined) return undefined;
    const requestController = new AbortController();
    const timeout = setTimeout(() => requestController.abort(), timeoutMs);
    try {
      const signal = AbortSignal.any([lifetimeController.signal, requestController.signal]);
      return await responseJson(await fetcher(new URL(path, service).toString(), { ...init, signal }));
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  };
  const validFlowUrl = (flowUrl: string): boolean => {
    try {
      const flow = new URL(flowUrl);
      return flow.protocol === 'https:' && flow.origin === service?.origin;
    } catch {
      return false;
    }
  };

  return Object.freeze({
    async start(action, installationId) {
      const result = supportStartSchema.safeParse(await fetchJson('/functions/v1/support-api/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, installationId }),
      }));
      return result.success && validFlowUrl(result.data.flowUrl) ? result.data : undefined;
    },
    async status(installationId) {
      const result = installationStatusSchema.safeParse(
        await fetchJson(`/functions/v1/support-api/status?installationId=${encodeURIComponent(installationId)}`),
      );
      return result.success ? result.data.status : undefined;
    },
    close() {
      lifetimeController.abort();
    },
  });
}
