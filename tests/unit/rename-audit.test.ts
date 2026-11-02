import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditRenameExceptions } from '../../scripts/audit-rename-exceptions.mjs';

describe('audit-rename-exceptions', () => {
  it('finds zero disallowed "cumpa" hits across the live tree', () => {
    const hits = auditRenameExceptions();
    if (hits.length > 0) {
      const detail = hits.map((hit) => `  ${hit.file}:${hit.line}: ${hit.text.trim()}`).join('\n');
      throw new Error(`Disallowed "cumpa" reference(s) found outside the four documented exception categories:\n${detail}`);
    }
    expect(hits).toEqual([]);
  });

  const fixtureRoots: string[] = [];
  afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails on an injected disallowed "cumpa" reference in a temp fixture tree', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'rename-audit-fixture-'));
    fixtureRoots.push(fixtureRoot);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: fixtureRoot });
    writeFileSync(join(fixtureRoot, 'leftover.ts'), "export const stale = 'cumpa-not-renamed';\n", 'utf8');

    const hits = auditRenameExceptions({ root: fixtureRoot });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: 'leftover.ts', line: 1 });
    expect(hits[0]?.text).toContain('cumpa-not-renamed');
  });

  it('does not flag an injected hit that matches an allowed exception pattern', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'rename-audit-fixture-allowed-'));
    fixtureRoots.push(fixtureRoot);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: fixtureRoot });
    writeFileSync(join(fixtureRoot, 'leftover.ts'), "export const kind = 'cumpa.review-request';\n", 'utf8');

    expect(auditRenameExceptions({ root: fixtureRoot })).toEqual([]);
  });
});
