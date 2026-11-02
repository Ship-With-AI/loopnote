import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

export type GeneratedExportMode = 'unsupported' | 'observed';

type ExportPair = Readonly<{ readonly json: Buffer; readonly markdown: Buffer }>;
type GeneratedExportResult = Readonly<{ readonly kind: 'exported' | 'reExportUnsupported' | 'publicationFailed' }>;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const exportStoreUrl = pathToFileURL(join(projectRoot, 'dist', 'server', 'export-store.js')).href;
const gitignoreCapabilityUrl = pathToFileURL(join(projectRoot, 'dist', 'server', 'gitignore-capability.js')).href;

function childProcess(command: string, arguments_: readonly string[]): Promise<void> {
  const { promise, reject, resolve: resolveChild } = Promise.withResolvers<void>();
  const process = spawn(command, arguments_, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  process.stderr.setEncoding('utf8');
  process.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  process.once('error', reject);
  process.once('exit', (code, signal) => {
    if (code === 0) {
      resolveChild();
      return;
    }
    reject(new Error(`Generated export child exited ${code ?? 'null'} (${signal ?? 'no signal'}): ${stderr}`));
  });
  return promise;
}

export async function runGeneratedExport(
  repositoryRoot: string,
  pair: ExportPair,
  mode: GeneratedExportMode,
): Promise<GeneratedExportResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-fault-runner-`));
  const inputPath = join(temporaryRoot, 'input.json');
  const outputPath = join(temporaryRoot, 'output.json');
  const runnerPath = join(temporaryRoot, 'publish.mjs');
  try {
    await writeFile(inputPath, JSON.stringify({
      repositoryRoot,
      baseOid: '1'.repeat(40),
      headOid: '2'.repeat(40),
      json: pair.json.toString('base64'),
      markdown: pair.markdown.toString('base64'),
      mode,
    }));
    await writeFile(runnerPath, `
      import { readFile, writeFile } from 'node:fs/promises';
      import { publishReviewExport } from ${JSON.stringify(exportStoreUrl)};
      import { createRequire } from 'node:module';
      const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const result = await publishReviewExport({
        repositoryRoot: input.repositoryRoot,
        identity: { kind: 'interactive', baseOid: input.baseOid, headOid: input.headOid },
        json: Buffer.from(input.json, 'base64'),
        markdown: Buffer.from(input.markdown, 'base64'),
        reExportCapability: input.mode === 'observed'
          ? (() => {
              const addon = createRequire(import.meta.url)(${JSON.stringify(join(projectRoot, 'dist', 'native', 'directory_exchange.node'))});
              return { kind: 'observedNativeExchange', exchangeDirectories: addon.exchangeDirectories };
            })()
          : { kind: 'reExportUnsupported' },
      });
      await writeFile(process.argv[3], JSON.stringify(result));
    `);
    await childProcess(process.execPath, [runnerPath, inputPath, outputPath]);
    return Object.freeze(JSON.parse(await readFile(outputPath, 'utf8')) as GeneratedExportResult);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runGeneratedRecovery(repositoryRoot: string): Promise<ExportPair | undefined> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-recovery-`));
  const inputPath = join(temporaryRoot, 'input.json');
  const outputPath = join(temporaryRoot, 'output.json');
  const runnerPath = join(temporaryRoot, 'recover.mjs');
  try {
    await writeFile(inputPath, JSON.stringify({ repositoryRoot, baseOid: '1'.repeat(40), headOid: '2'.repeat(40) }));
    await writeFile(runnerPath, `
      import { readFile, writeFile } from 'node:fs/promises';
      import { recoverReviewExport } from ${JSON.stringify(exportStoreUrl)};
      const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const pair = await recoverReviewExport(input.repositoryRoot, {
        kind: 'interactive', baseOid: input.baseOid, headOid: input.headOid,
      });
      await writeFile(process.argv[3], JSON.stringify(pair === undefined ? null : {
        json: pair.json.toString('base64'), markdown: pair.markdown.toString('base64'),
      }));
    `);
    await childProcess(process.execPath, [runnerPath, inputPath, outputPath]);
    const output = JSON.parse(await readFile(outputPath, 'utf8')) as Readonly<{ readonly json: string; readonly markdown: string }> | null;
    return output === null ? undefined : Object.freeze({ json: Buffer.from(output.json, 'base64'), markdown: Buffer.from(output.markdown, 'base64') });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function sampleGeneratedStablePair(
  stablePath: string,
  observations: number,
): Promise<readonly ExportPair[]> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-reader-`));
  const outputPath = join(temporaryRoot, 'observations.json');
  const runnerPath = join(temporaryRoot, 'reader.mjs');
  try {
    await writeFile(runnerPath, `
      import { readFile, readdir, writeFile } from 'node:fs/promises';
      const stable = process.argv[2];
      const samples = Number(process.argv[3]);
      const observations = [];
      for (let index = 0; index < samples; index += 1) {
        const names = await readdir(stable);
        if (names.length !== 2 || !names.includes('review.json') || !names.includes('review.md')) throw new Error('stable pair incomplete');
        observations.push({
          json: (await readFile(stable + '/review.json')).toString('base64'),
          markdown: (await readFile(stable + '/review.md')).toString('base64'),
        });
      }
      await writeFile(process.argv[4], JSON.stringify(observations));
    `);
    await childProcess(process.execPath, [runnerPath, stablePath, String(observations), outputPath]);
    const output = JSON.parse(await readFile(outputPath, 'utf8')) as readonly Readonly<{ readonly json: string; readonly markdown: string }>[];
    return Object.freeze(output.map((pair) => Object.freeze({ json: Buffer.from(pair.json, 'base64'), markdown: Buffer.from(pair.markdown, 'base64') })));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runGeneratedIgnoreAppend(repositoryRoot: string): Promise<Readonly<{ readonly kind: string }>> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `${RENAME_MAP.slug}-export-ignore-`));
  const inputPath = join(temporaryRoot, 'input.json');
  const outputPath = join(temporaryRoot, 'output.json');
  const runnerPath = join(temporaryRoot, 'ignore.mjs');
  try {
    await writeFile(inputPath, JSON.stringify({ repositoryRoot }));
    await writeFile(runnerPath, `
      import { readFile, writeFile } from 'node:fs/promises';
      import { appendLoopnoteIgnoreRule } from ${JSON.stringify(gitignoreCapabilityUrl)};
      const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const result = await appendLoopnoteIgnoreRule({ repositoryRoot: input.repositoryRoot });
      await writeFile(process.argv[3], JSON.stringify(result));
    `);
    await childProcess(process.execPath, [runnerPath, inputPath, outputPath]);
    return Object.freeze(JSON.parse(await readFile(outputPath, 'utf8')) as Readonly<{ readonly kind: string }>);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
