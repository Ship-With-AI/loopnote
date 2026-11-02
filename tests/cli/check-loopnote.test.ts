import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const checkerPath = fileURLToPath(
  new URL('../../.kimi-code/skills/loopnote/scripts/check-loopnote.mjs', import.meta.url),
);
const recovery =
  'npm install --global @shipwithai/loopnote@2.0.0\n' +
  'Requires Node.js 24+ and Git 2.43.0+.\n';

function runChecker(body?: string, mode = 0o755) {
  const cwd = mkdtempSync(join(tmpdir(), 'loopnote-preflight-'));
  const forbiddenPath = join(cwd, 'unexpected-command');
  const probePidPath = join(cwd, 'probe.pid');
  let result: SpawnSyncReturns<string> | undefined;

  try {
    symlinkSync(process.execPath, join(cwd, 'node'));
    for (const command of ['git', 'npm', 'npx']) {
      writeFileSync(
        join(cwd, command),
        '#!/usr/bin/env node\n' +
          `require('node:fs').writeFileSync(${JSON.stringify(forbiddenPath)}, 'invoked');\n`,
        { mode: 0o755 },
      );
    }
    if (body !== undefined) {
      writeFileSync(
        join(cwd, 'loopnote'),
        '#!/usr/bin/env node\n' +
          `require('node:fs').writeFileSync(${JSON.stringify(probePidPath)}, String(process.pid));\n` +
          "if (process.argv.length !== 3 || process.argv[2] !== '--version') process.exit(64);\n" +
          body,
        { mode },
      );
    }

    result = spawnSync(process.execPath, [checkerPath], {
      cwd,
      env: { PATH: cwd },
      encoding: 'utf8',
      timeout: 12_000,
      killSignal: 'SIGKILL',
    });
    expect(result.error).toBeUndefined();
    expect(existsSync(forbiddenPath)).toBe(false);
    return result;
  } finally {
    // A broken checker must not leave its deliberately hanging test probe alive.
    if (result?.error && existsSync(probePidPath)) {
      const pid = Number(readFileSync(probePidPath, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
        throw new Error('Invalid owned probe PID');
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
          throw error;
        }
      }
    }
    rmSync(cwd, { recursive: true, force: true });
  }
}

function expectRejected(result: SpawnSyncReturns<string>) {
  expect(result.status).toBeGreaterThan(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(recovery);
}

describe('installed Loopnote skill preflight', () => {
  it.each([
    ['minimum release', '2.0.0'],
    ['later minor release', '2.12.3'],
    ['stable build metadata', '2.0.0+build.001'],
    ['large numeric components', `2.${'9'.repeat(80)}.${'9'.repeat(80)}`],
  ])('accepts the %s without claiming verification', (_label, version) => {
    const result = runChecker(`process.stdout.write(${JSON.stringify(`${version}\n`)});`);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${version}\n`);
    expect(result.stderr).toBe('');
  });

  it.each([
    ['legacy minimum release', '1.5.0'],
    ['legacy later minor release', '1.12.3'],
    ['next major version', '3.0.0'],
    ['prerelease', '2.0.0-rc.1'],
    ['empty output', ''],
    ['incomplete core', '2.0'],
    ['leading-zero major', '02.0.0'],
    ['leading-zero minor', '2.05.0'],
    ['leading-zero patch', '2.0.00'],
    ['version prefix', 'v2.0.0'],
    ['version label', 'Loopnote 2.0.0'],
    ['multiple versions', '2.0.0\n2.1.0'],
    ['extra blank line', '2.0.0\n\n'],
    ['empty build metadata', '2.0.0+'],
    ['empty metadata segment', '2.0.0+build..1'],
  ])('rejects %s with recovery guidance only', (_label, output) => {
    expectRejected(runChecker(`process.stdout.write(${JSON.stringify(output)});`));
  });

  it('stops when Loopnote is absent without installing it', () => {
    expectRejected(runChecker());
  });

  it('stops when the version executable cannot be spawned', () => {
    expectRejected(runChecker("process.stdout.write('2.0.0\\n');", 0o644));
  });

  it('rejects a failed probe even when its stdout looks supported', () => {
    expectRejected(
      runChecker(
        "process.stdout.write('2.0.0\\n'); process.stderr.write('private fixture diagnostic'); process.exit(7);",
      ),
    );
  });

  it('rejects a signaled version probe', () => {
    expectRejected(runChecker("process.kill(process.pid, 'SIGTERM');"));
  });

  it('bounds diagnostic output even when the version is supported', () => {
    expectRejected(
      runChecker("process.stdout.write('2.0.0\\n'); process.stderr.write('x'.repeat(16_384));"),
    );
  });

  it('terminates a hanging probe and reports only recovery guidance', () => {
    expectRejected(
      runChecker("process.on('SIGTERM', () => {}); setInterval(() => {}, 60_000);"),
    );
  }, 15_000);
});
