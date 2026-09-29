import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // We set retries to 0 to demonstrate that self-healing recovers the test run within the single execution context
  workers: 2, // Enable multiple workers to demonstrate sqlite concurrent cache lock safety
  reporter: [
    ['html'],
    ['json', { outputFile: 'playwright-report.json' }],
    ['./src/core/reporter.ts'] // Our custom telemetry reporter
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000, // General action timeout (10 seconds)
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ]
});
