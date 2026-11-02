import { defineConfig, devices } from '@playwright/test';
import { RENAME_MAP } from './src/domain/product-identity.js';

export const custodyGatedSpecs: string[] = [
  '**/e2e/package-assets.spec.ts',
  '**/e2e/agent-ready-export.spec.ts',
  '**/e2e/public-support-states.spec.ts',
  '**/e2e/marketplace-review.spec.ts',
];

export default defineConfig({
  testDir: './tests',
  outputDir: `node_modules/.cache/${RENAME_MAP.slug}-runtime-playwright`,
  testMatch: custodyGatedSpecs,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 30_000,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        headless: true,
      },
    },
  ],
});
