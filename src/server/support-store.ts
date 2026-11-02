import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, win32 } from 'node:path';
import { z } from 'zod';

import { RENAME_MAP } from '../domain/product-identity.js';

export const SupportStateV1Schema = z
  .strictObject({
    version: z.literal(1),
    installationId: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    status: z.enum(['unverified', 'verified']),
    verifiedAt: z.string().datetime().optional(),
  })
  .superRefine((state, context) => {
    if ((state.status === 'verified') !== (state.verifiedAt !== undefined)) {
      context.addIssue({ code: 'custom', message: 'verifiedAt must exist iff verified.' });
    }
  })
  .readonly();

export type SupportStateV1 = z.infer<typeof SupportStateV1Schema>;
export type SupportStore = Readonly<{
  canonicalPath: string;
  state(): Promise<SupportStateV1>;
  markVerified(verifiedAt: string): Promise<SupportStateV1>;
}>;

export type SupportFileHandle = Readonly<{ writeFile(bytes: Uint8Array): Promise<void>; sync(): Promise<void>; close(): Promise<void> }>;
export type SupportFileSystem = Readonly<{
  readFile(path: string): Promise<Buffer>;
  mkdir(path: string, mode: number): Promise<void>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean; isFile(): boolean }>;
  stat(path: string): Promise<{ mode: number }>;
  open(path: string, flags: number, mode: number): Promise<SupportFileHandle>;
  chmod(path: string, mode: number): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  syncDirectory(path: string): Promise<void>;
}>;

const nodeFileSystem: SupportFileSystem = {
  readFile: async (path) => await fs.readFile(path),
  mkdir: async (path, mode) => { await fs.mkdir(path, { recursive: true, mode }); },
  lstat: async (path) => await fs.lstat(path),
  stat: async (path) => await fs.stat(path),
  open: async (path, flags, mode) => {
    const handle = await fs.open(path, flags, mode);
    return { writeFile: async (bytes) => await handle.writeFile(bytes), sync: async () => await handle.sync(), close: async () => await handle.close() };
  },
  chmod: async (path, mode) => await fs.chmod(path, mode),
  rename: async (from, to) => await fs.rename(from, to),
  unlink: async (path) => await fs.unlink(path),
  syncDirectory: async (path) => {
    const handle = await fs.open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  },
};


export function resolveSupportStatePath(options: Readonly<{ platform?: NodeJS.Platform; home?: string; env?: NodeJS.ProcessEnv }> = {}): string {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? process.env.HOME ?? '';
  const env = options.env ?? process.env;
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', RENAME_MAP.xdgStateDirTitleCase, 'support.json');
  if (platform === 'win32') return win32.join(env.LOCALAPPDATA ?? env.APPDATA ?? win32.join(home, 'AppData', 'Local'), RENAME_MAP.xdgStateDirTitleCase, 'support.json');
  return join(env.XDG_STATE_HOME ?? join(home, '.local', 'state'), RENAME_MAP.xdgStateDirLower, 'support.json');
}

/**
 * Resolves the pre-rename per-user `support.json` path. The literal old path segments are
 * intentionally hardcoded in this function's body only — the one documented D-06 exception to
 * the project-wide rename grep audit. `createSupportStore()` uses this path exactly once, as a
 * migration source: copying its bytes to the new `resolveSupportStatePath()` location on first
 * run, only when the new path is missing. It is never read again afterward and never treated as
 * an ongoing fallback.
 */
export function resolveLegacySupportStatePath(options: Readonly<{ platform?: NodeJS.Platform; home?: string; env?: NodeJS.ProcessEnv }> = {}): string {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? process.env.HOME ?? '';
  const env = options.env ?? process.env;
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Cumpa', 'support.json');
  if (platform === 'win32') return win32.join(env.LOCALAPPDATA ?? env.APPDATA ?? win32.join(home, 'AppData', 'Local'), 'Cumpa', 'support.json');
  return join(env.XDG_STATE_HOME ?? join(home, '.local', 'state'), 'cumpa', 'support.json');
}

export function createSupportStore(options: Readonly<{ path?: string; legacyPath?: string; fileSystem?: SupportFileSystem; randomBytes?: (size: number) => Buffer }> = {}): SupportStore {
  const canonicalPath = options.path ?? resolveSupportStatePath();
  const legacyPath = options.legacyPath ?? resolveLegacySupportStatePath();
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const random = options.randomBytes ?? randomBytes;
  const directory = dirname(canonicalPath);
  let state: SupportStateV1 | undefined;
  let legacyCopyAttempted = false;
  let pending = Promise.resolve();

  const load = async (): Promise<SupportStateV1 | undefined> => {
    try {
      const entry = await fileSystem.lstat(canonicalPath);
      if (entry.isSymbolicLink() || !entry.isFile()) return undefined;
      return SupportStateV1Schema.parse(JSON.parse((await fileSystem.readFile(canonicalPath)).toString('utf8')));
    } catch { return undefined; }
  };
  const exists = async (): Promise<boolean> => {
    try {
      await fileSystem.lstat(canonicalPath);
      return true;
    } catch (error) {
      return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT');
    }
  };

  const writeAtomic = async (bytes: Uint8Array, mode: number): Promise<void> => {
    const temporaryPath = join(directory, `.support.${randomUUID()}.tmp`);
    let handle: SupportFileHandle | undefined;
    let renamed = false;
    try {
      await fileSystem.mkdir(directory, 0o700);
      handle = await fileSystem.open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
      await fileSystem.chmod(temporaryPath, mode);
      await fileSystem.rename(temporaryPath, canonicalPath); renamed = true;
      await fileSystem.syncDirectory(directory).catch((error: unknown) => {
        if (!(typeof error === 'object' && error !== null && 'code' in error && (error.code === 'EINVAL' || error.code === 'ENOTSUP'))) throw error;
      });
    } finally {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      if (!renamed) await fileSystem.unlink(temporaryPath).catch(() => undefined);
    }
  };
  const persist = async (next: SupportStateV1): Promise<void> => {
    await writeAtomic(Buffer.from(`${JSON.stringify(SupportStateV1Schema.parse(next))}\n`), 0o600);
  };
  // D-06: one-time, atomic, mode-preserving copy of the legacy per-user support.json to the new
  // path — never a move (the legacy file is left untouched), never an ongoing fallback read.
  // Runs at most once per store instance (createSupportStore() is called once per process).
  const copyLegacyIfNeeded = async (): Promise<void> => {
    if (legacyCopyAttempted) return;
    legacyCopyAttempted = true;
    if (await exists()) return;
    try {
      const entry = await fileSystem.lstat(legacyPath);
      if (entry.isSymbolicLink() || !entry.isFile()) return;
      const bytes = await fileSystem.readFile(legacyPath);
      SupportStateV1Schema.parse(JSON.parse(bytes.toString('utf8')));
      const mode = (await fileSystem.stat(legacyPath)).mode & 0o777;
      await writeAtomic(bytes, mode);
    } catch {
      // Missing, unreadable, or schema-invalid legacy file: leave it untouched and fall through
      // to ordinary initialization — a tampered legacy file is never partially trusted.
    }
  };
  const initial = (): SupportStateV1 => SupportStateV1Schema.parse({ version: 1, installationId: random(32).toString('base64url'), status: 'unverified' });
  const serialized = async <T>(operation: () => Promise<T>): Promise<T> => {
    const run = pending.catch(() => undefined).then(operation); pending = run.then(() => undefined, () => undefined); return await run;
  };
  return {
    canonicalPath,
    async state() {
      return await serialized(async () => {
        await copyLegacyIfNeeded();
        state ??= await load();
        if (state === undefined) {
          const created = initial();
          if (!(await exists())) {
            try {
              await persist(created);
            } catch {
              return created;
            }
          }
          state = created;
        }
        return state;
      });
    },
    async markVerified(verifiedAt) {
      return await serialized(async () => {
        await copyLegacyIfNeeded();
        state ??= await load();
        if (state === undefined) {
          state = initial();
          await persist(state);
        }
        if (state.status === 'verified') return state;
        const next = SupportStateV1Schema.parse({ ...state, status: 'verified', verifiedAt });
        await persist(next);
        state = next;
        return state;
      });
    },
  };
}
