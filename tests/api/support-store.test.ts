import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import { createSupportStore, resolveLegacySupportStatePath, resolveSupportStatePath } from '../../src/server/support-store.js';


describe('machine support state', () => {
  test.each([
    ['darwin', '/Users/alice', {}, `/Users/alice/Library/Application Support/${RENAME_MAP.xdgStateDirTitleCase}/support.json`],
    ['win32', 'C:\\Users\\alice', { LOCALAPPDATA: 'C:\\Local' }, `C:\\Local\\${RENAME_MAP.xdgStateDirTitleCase}\\support.json`],
    ['win32', 'C:\\Users\\alice', { APPDATA: 'C:\\Roaming' }, `C:\\Roaming\\${RENAME_MAP.xdgStateDirTitleCase}\\support.json`],
    ['linux', '/home/alice', { XDG_STATE_HOME: '/state' }, `/state/${RENAME_MAP.xdgStateDirLower}/support.json`],
    ['linux', '/home/alice', {}, `/home/alice/.local/state/${RENAME_MAP.xdgStateDirLower}/support.json`],
  ] as const)('resolves %s state independently of repository roots', (platform, home, env, expected) => {
    expect(resolveSupportStatePath({ platform, home, env })).toBe(expected);
  });

  test.each([
    ['darwin', '/Users/alice', {}, '/Users/alice/Library/Application Support/Cumpa/support.json'],
    ['win32', 'C:\\Users\\alice', { LOCALAPPDATA: 'C:\\Local' }, 'C:\\Local\\Cumpa\\support.json'],
    ['win32', 'C:\\Users\\alice', { APPDATA: 'C:\\Roaming' }, 'C:\\Roaming\\Cumpa\\support.json'],
    ['linux', '/home/alice', { XDG_STATE_HOME: '/state' }, '/state/cumpa/support.json'],
    ['linux', '/home/alice', {}, '/home/alice/.local/state/cumpa/support.json'],
  ] as const)('resolves %s legacy (pre-rename) state path as the documented D-06 migration source', (platform, home, env, expected) => {
    expect(resolveLegacySupportStatePath({ platform, home, env })).toBe(expected);
  });
});

describe('support.json one-time D-06 copy', () => {
  const roots: string[] = [];
  const legacyState = { version: 1, installationId: 'a'.repeat(43), status: 'unverified' } as const;

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })));
  });

  async function root(): Promise<string> {
    const value = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-support-store-`));
    roots.push(value);
    return value;
  }

  test('copies legacy support.json bytes to the new path when the new path is missing', async () => {
    const directory = await root();
    const legacyPath = join(directory, 'legacy', 'support.json');
    const newPath = join(directory, 'new', 'support.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    const bytes = `${JSON.stringify(legacyState)}\n`;
    await writeFile(legacyPath, bytes, { mode: 0o640 });

    const store = createSupportStore({ path: newPath, legacyPath });
    await store.state();

    expect(await readFile(newPath, 'utf8')).toBe(bytes);
  });

  test('does not overwrite an existing new-path file with legacy content', async () => {
    const directory = await root();
    const legacyPath = join(directory, 'legacy', 'support.json');
    const newPath = join(directory, 'new', 'support.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    await mkdir(dirname(newPath), { recursive: true });
    await writeFile(legacyPath, `${JSON.stringify(legacyState)}\n`, { mode: 0o640 });
    const existingBytes = `${JSON.stringify({ version: 1, installationId: 'b'.repeat(43), status: 'unverified' })}\n`;
    await writeFile(newPath, existingBytes, { mode: 0o600 });

    const store = createSupportStore({ path: newPath, legacyPath });
    await store.state();

    expect(await readFile(newPath, 'utf8')).toBe(existingBytes);
  });

  test('leaves the legacy file untouched after copying (a copy, never a move)', async () => {
    const directory = await root();
    const legacyPath = join(directory, 'legacy', 'support.json');
    const newPath = join(directory, 'new', 'support.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    const bytes = `${JSON.stringify(legacyState)}\n`;
    await writeFile(legacyPath, bytes, { mode: 0o640 });
    const before = await stat(legacyPath);

    const store = createSupportStore({ path: newPath, legacyPath });
    await store.state();

    const after = await stat(legacyPath);
    expect(await readFile(legacyPath, 'utf8')).toBe(bytes);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test('hardcodes the copied new-path file to mode 0o600 when the legacy file is 0o640', async () => {
    const directory = await root();
    const legacyPath = join(directory, 'legacy', 'support.json');
    const newPath = join(directory, 'new', 'support.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, `${JSON.stringify(legacyState)}\n`, { mode: 0o640 });
    await chmod(legacyPath, 0o640);

    const store = createSupportStore({ path: newPath, legacyPath });
    await store.state();

    const newMode = (await stat(newPath)).mode & 0o777;
    expect(newMode).toBe(0o600);
  });

  test('hardcodes the copied new-path file to mode 0o600 when the legacy file is 0o644', async () => {
    const directory = await root();
    const legacyPath = join(directory, 'legacy', 'support.json');
    const newPath = join(directory, 'new', 'support.json');
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, `${JSON.stringify(legacyState)}\n`, { mode: 0o644 });
    await chmod(legacyPath, 0o644);

    const store = createSupportStore({ path: newPath, legacyPath });
    await store.state();

    const newMode = (await stat(newPath)).mode & 0o777;
    expect(newMode).toBe(0o600);
  });
});
