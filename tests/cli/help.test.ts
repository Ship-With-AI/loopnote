import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

const executablePath = fileURLToPath(
  new URL('../../dist/bin/cumpa.mjs', import.meta.url),
);

describe(`${RENAME_MAP.binCommand} help`, () => {
  it('prints native Commander help without starting from a repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-help-`));
    try {
      const result = spawnSync(process.execPath, [executablePath, '--help'], {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`Usage: ${RENAME_MAP.binCommand} [options]`);
      expect(result.stdout).toContain(
        'Local-first review of pinned Git comparisons',
      );
      expect(result.stdout).toContain('-h, --help');
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
