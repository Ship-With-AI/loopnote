import vue from '@vitejs/plugin-vue';
import { tokenRootPlugin as rootPlugin } from './scripts/token-root-plugin.mjs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue(), rootPlugin(import.meta.dirname)],
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/git/**/*.test.ts',
      'tests/api/**/*.test.ts',
      'tests/cli/**/*.test.ts',
      'tests/package/**/*.test.ts',
    ],
    // Operator-run acceptance drivers: real public installs, browser walkthroughs,
    // and an authenticated OMP profile. Invoked through their own npm scripts, never
    // in the default run or CI's repository gates.
    exclude: [
      'tests/package/agent-ready-export.test.ts',
      'tests/package/public-artifact-acceptance.test.ts',
      'tests/package/marketplace-profile-acceptance.test.ts',
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
