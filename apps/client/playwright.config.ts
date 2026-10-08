// Browser tests (docs/MOBILE.md §8): mobile emulation in portrait iPhone and Pixel
// profiles, desktop mouse and keyboard, the PWA, and a render stress test.
// Run with `npm run test:e2e` (builds `dist-e2e` with `--mode e2e`, which adds a
// debug hook and a `?lab` option with extra solo gold). Chromium only: the iPhone
// profile emulates the iPhone's screen, touch and safe viewport in Chromium.
//
// The stress test measures CPU time per frame, so it runs alone: its `perf` project
// depends on the others, which makes Playwright start it only after every other test
// has finished (on a 4-core machine two browser workers would otherwise skew it). If
// another project fails, Playwright skips it: fix that failure first. CI runs each
// project (sharded) in its own job and the stress test in a job of its own with
// `--project=perf --no-deps` (.github/workflows/ci.yml).

import { defineConfig, devices } from '@playwright/test';

const PORT = 4190;
const CI = !!process.env.CI;
/**
 * On CI a browser test that fails gets one more try, so one slow software-GL runner can't block a pull request. A test
 * that passes on its second try is reported as flaky (the JSON report, and `.github/scripts/playwright-summary.mjs` in
 * the job summary), never as a plain pass. Locally, and for the stress test everywhere, a failure is a failure.
 */
const RETRIES = CI ? 1 : 0;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  // CI also writes a JSON report, which the workflow turns into the job summary (failed and flaky tests).
  reporter: CI ? [['list'], ['json', { outputFile: 'playwright-report/results.json' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'iphone',
      retries: RETRIES,
      testMatch: /(mobile|lobby|hook|ultimates|privacy)\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'pixel',
      retries: RETRIES,
      testMatch: /(mobile|platform|art|lobby|hook|ultimates|privacy|meteor|boot)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      retries: RETRIES,
      testMatch: /(desktop|lobby|hook|ultimates|privacy)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'perf',
      // A measurement: one slow run is a result, not a flake to retry.
      retries: 0,
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
      dependencies: ['iphone', 'pixel', 'desktop'],
    },
  ],
});
