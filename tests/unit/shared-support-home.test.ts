import { existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RENAME_MAP } from '../../src/domain/product-identity.js';

import { createSharedSupportHome } from '../helpers/public-runtime.js';

describe('shared support HOME', () => {
  it('reuses its stable external default without per-run cleanup', () => {
    const first = createSharedSupportHome();
    first.cleanup();
    const second = createSharedSupportHome();

    expect(second.home).toBe(first.home);
    expect(existsSync(first.home)).toBe(true);
  });

  it('uses an explicit external override', () => {
    const home = join(tmpdir(), `${RENAME_MAP.slug}-support-override-${crypto.randomUUID()}`);
    try {
      const supportHome = createSharedSupportHome(home);
      const env: NodeJS.ProcessEnv = {};
      supportHome.applyTo(env);
      expect(env.HOME).toBe(supportHome.home);
      expect(supportHome.home).toBe(realpathSync(home));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
