import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import renameMap from './rename-map.json' with { type: 'json' };

function releaseSupportOrigin(value) {
  if (value === undefined) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL must be a canonical Supabase origin`);
  }
  const ref = url.hostname.slice(0, -'.supabase.co'.length);
  if (
    value !== `https://${ref}.supabase.co`
    || url.protocol !== 'https:'
    || !/^[a-z0-9]{20}$/u.test(ref)
  ) throw new Error(`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL must be a canonical Supabase origin`);
  return value;
}

const supportOrigin = releaseSupportOrigin(process.env[`${renameMap.envPrefix}RELEASE_SUPPORT_SERVICE_URL`]);
const outputRoot = resolve(import.meta.dirname, '../dist');
const binDirectory = resolve(outputRoot, 'bin');
const executablePath = resolve(binDirectory, `${renameMap.binCommand}.mjs`);
const executable = `#!/usr/bin/env node
${supportOrigin ? `if (process.env.${renameMap.envPrefix}SUPPORT_SERVICE_URL === undefined) process.env.${renameMap.envPrefix}SUPPORT_SERVICE_URL = '${supportOrigin}';\n` : ''}const { run } = await import('../cli/run.js');

await run();
`;

await rm(outputRoot, { force: true, recursive: true });
await mkdir(binDirectory, { recursive: true });
await writeFile(executablePath, executable, 'utf8');
await chmod(executablePath, 0o755);
