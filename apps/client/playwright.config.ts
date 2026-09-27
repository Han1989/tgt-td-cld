// Browser tests (docs/MOBILE.md §8): mobile emulation in portrait iPhone and Pixel
// profiles, desktop mouse and keyboard, the PWA, and a render stress test.
// Run with `npm run test:e2e` (builds `dist-e2e` with `--mode e2e`, which adds a
// debug hook and a `?lab` option with extra solo gold). Chromium only: the iPhone
// profile emulates the iPhone's screen, touch and safe viewport in Chromium.
//
// The stress test measures CPU time per frame, so it runs alone: its `perf` project
// depends on the others, which makes Playwright start it only after every other test
// has finished (on a 4-core machine two browser workers would otherwise skew it). If
// another project fails, Playwright skips it: fix that failure first.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4190;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
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
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'pixel',
      testMatch: /(mobile|platform|art)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      testMatch: /desktop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
      dependencies: ['iphone', 'pixel', 'desktop'],
    },
  ],
});
