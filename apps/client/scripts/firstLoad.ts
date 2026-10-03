// First load on a throttled phone (docs/PRESS.md §5): how long until the online home card is usable,
// and when the boot splash first paints. Builds the production client with a placeholder game server
// (VITE_SERVER_URL=wss://example.invalid: the home card renders without connecting; only Create /
// Join open the WebSocket), serves it with `vite preview`, then loads `/` in headless Chromium as a
// Pixel 7 with a cold cache and no service worker, under Lighthouse's mobile throttling.
//
//   npm run first-load -w @tdt/client                       5 runs of a fresh build
//   npm run first-load -w @tdt/client -- --runs 9 --no-build
//   npm run first-load -w @tdt/client -- --url https://tgt-td-cld.vercel.app/
//
// "Usable" = `<html data-ready>` is set (main.ts's `tdt:ready` mark), the home card is shown and the
// Play solo button is on screen, enabled and the element a tap at its centre would hit.

import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { build, preview } from 'vite';

/**
 * Lighthouse's default mobile throttling ("Slow 4G", the same numbers as the Chrome DevTools preset):
 * 150 ms RTT and 1.6 Mbps down / 750 kbps up, which DevTools-style throttling applies as 562.5 ms of
 * request latency, 1474.56 kbps down and 675 kbps up; the CPU 4× slower than this machine.
 */
export const SLOW_4G = { latencyMs: 562.5, downKbps: 1474.56, upKbps: 675, cpu: 4 } as const;

interface Run {
  firstPaint: number;
  fcp: number;
  ready: number;
  usable: number;
  kb: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 5);
const profile = {
  latencyMs: Number(arg('latency') ?? SLOW_4G.latencyMs),
  downKbps: Number(arg('down') ?? SLOW_4G.downKbps),
  upKbps: Number(arg('up') ?? SLOW_4G.upKbps),
  cpu: Number(arg('cpu') ?? SLOW_4G.cpu),
};
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = 'dist-firstload';

let url = arg('url');
let server: Awaited<ReturnType<typeof preview>> | null = null;
if (!url) {
  if (!process.argv.includes('--no-build')) {
    process.env.VITE_SERVER_URL = 'wss://example.invalid';
    await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  }
  server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { port: 0, host: '127.0.0.1' } });
  url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
}

const browser = await chromium.launch();
const results: Run[] = [];
try {
  for (let i = 0; i < runs; i++) {
    // A fresh context per run: empty HTTP cache, no storage, and service workers blocked.
    const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
    // Measurement visits are not players: keep them out of the rollout dashboard (docs/ANALYTICS.md).
    await context.route('**/analytics/event', (route) => route.abort());
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latencyMs,
      downloadThroughput: (profile.downKbps * 1024) / 8,
      uploadThroughput: (profile.upKbps * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
    await page.waitForFunction(
      () => {
        const home = document.getElementById('lobby-home');
        const button = document.getElementById('lobby-offline') as HTMLButtonElement | null;
        return !!document.documentElement.dataset.ready && !!home && home.offsetParent !== null && !!button && !button.disabled;
      },
      undefined,
      { polling: 'raf', timeout: 120_000 },
    );
    // A build that leaves Play solo below the fold is never usable without a scroll: say so, don't hang.
    const at = await page
      .waitForFunction(
        () => {
          const button = document.getElementById('lobby-offline')!;
          const b = button.getBoundingClientRect();
          if (b.bottom > innerHeight || b.top < 0) return 0;
          return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === button ? performance.now() : 0;
        },
        undefined,
        { polling: 'raf', timeout: 15_000 },
      )
      .then((handle) => handle.jsonValue() as Promise<number>)
      .catch(() => NaN);
    if (Number.isNaN(at)) {
      const top = await page.evaluate(() => Math.round(document.getElementById('lobby-offline')!.getBoundingClientRect().top));
      console.log(`run ${i + 1}: Play solo is not on screen (its top is at ${top} px of ${devices['Pixel 7'].viewport.height})`);
    }
    // No named helpers in here: tsx would wrap them in a `__name` call the page doesn't have.
    const timing = await page.evaluate(() => {
      const [firstPaint, fcp, ready] = ['first-paint', 'first-contentful-paint', 'tdt:ready'].map(
        (name) => performance.getEntriesByName(name)[0]?.startTime ?? NaN,
      );
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const bytes = performance.getEntriesByType('resource').reduce((s, r) => s + (r as PerformanceResourceTiming).transferSize, nav?.transferSize ?? 0);
      return { firstPaint: firstPaint!, fcp: fcp!, ready: ready!, bytes };
    });
    results.push({ firstPaint: timing.firstPaint, fcp: timing.fcp, ready: timing.ready, usable: at, kb: timing.bytes / 1024 });
    console.log(
      `run ${i + 1}: first contentful paint ${ms(timing.fcp)}, ready ${ms(timing.ready)}, usable ${Number.isNaN(at) ? 'never' : ms(at)}, ${(timing.bytes / 1024).toFixed(0)} KB`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server?.close();
}

function ms(v: number): string {
  return `${(v / 1000).toFixed(2)} s`;
}

function stats(values: number[]): string {
  const s = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  const missing = values.length - s.length;
  if (s.length === 0) return `never (${missing} of ${values.length} runs)`;
  const mid = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  return `median ${ms(mid)}, range ${ms(s[0]!)}–${ms(s[s.length - 1]!)}` + (missing ? `; never in ${missing} of ${values.length} runs` : '');
}

console.log(
  `\n${url} · Pixel 7 · ${profile.latencyMs} ms latency, ${profile.downKbps} kbps down, ${profile.upKbps} kbps up, ` +
    `CPU ${profile.cpu}× slower · cold cache, no service worker · ${runs} runs`,
);
console.log(`first contentful paint:   ${stats(results.map((r) => r.fcp))}`);
console.log(`tdt:ready:                ${stats(results.map((r) => r.ready))}`);
console.log(`usable lobby:             ${stats(results.map((r) => r.usable))}`);
console.log(`transferred:              ${(results.reduce((s, r) => s + r.kb, 0) / results.length).toFixed(0)} KB per load`);
