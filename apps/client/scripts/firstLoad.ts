// First load on a throttled phone (docs/PRESS.md §5): how long until the online home card is usable,
// and when the boot splash first paints. Builds the production client with a placeholder game server
// (VITE_SERVER_URL=wss://example.invalid: the home card renders without connecting; only Create /
// Join open the WebSocket), serves it with `vite preview`, then loads `/` in headless Chromium as a
// Pixel 7 with a cold cache and no service worker, under Lighthouse's mobile throttling.
//
//   npm run first-load -w @tdt/client                       5 runs of a fresh build
//   npm run first-load -w @tdt/client -- --runs 9 --no-build
//   npm run first-load -w @tdt/client -- --url https://tgt-td-cld.vercel.app/
//   npm run first-load -w @tdt/client -- --sheets            also wait for the 3D match sheets
//   npm run first-load -w @tdt/client -- --music             the first tap → the first music heard, instead
//   npm run first-load -w @tdt/client -- --music --tap-after 12000   that tap 12 s after the lobby is usable
//   npm run first-load -w @tdt/client -- --music --http-cache        the HTTP cache on (empty), as on a real first visit
//
// "Usable" = `<html data-ready>` is set (main.ts's `tdt:ready` mark), the home card is shown and the
// Play solo button is on screen, enabled and the element a tap at its centre would hit. After that, each run waits
// for the map plate (docs/ART.md §16, loaded a second after the first screen) and reports when it was ready, its
// bytes and how long its decode took (`tdt:decode:spire.webp`), then for the HUD's rendered frames, which come right
// after it (`tdt:ui`, docs/ART.md §12), on the same throttled phone. With `--sheets` it then
// waits for the 3D match sheets, which load after the plate, one after another (docs/ART.md §15: the towers', Heart's
// and portals', the creeps', then the heroes'), and reports when they were in (`tdt:structures`, `tdt:creep-sheets`,
// `tdt:hero-sheets`) and their bytes (all of them, and the creeps' alone); the first screen's numbers are taken
// before, so they don't move.
//
// With `--music` (docs/ART.md §13) each run taps the home card once it is usable, on a spot that is no button (the
// first tap, which starts the sound), and reports how long from that tap until the first audible sample (above
// −60 dBFS) leaves the music bus, and until a decoded music file starts (a buffer longer than 20 s: before the
// streamed start, the first sound; after it, the takeover). An init script finds the bus as the engine builds it
// (engine.ts `build`: its third gain, connected to the first, the master) and listens to it with an analyser, so
// the tap's own click on the effects bus doesn't count; the plate and the sheets are not waited for.

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
  /** The map plate: when it had decoded (since navigation), its decode, its bytes. */
  plate: number;
  plateDecode: number;
  plateKb: number;
  /** The HUD's rendered frames (V-07a): when they were in (since navigation), and the sheet's bytes. */
  ui: number;
  uiKb: number;
  structures: number;
  heroSheets: number;
  creepSheets: number;
  sheetsKb: number;
  creepKb: number;
  /** `--music`: from the first tap (ms) to the first music heard, and to a decoded file starting. */
  heard: number;
  loop: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 5);
const sheets = process.argv.includes('--sheets');
const music = process.argv.includes('--music');
/** `--music`: how long after the lobby is usable the first tap comes (ms). */
const tapAfter = Number(arg('tap-after') ?? 0);
/** Keep the (empty) HTTP cache on: a real first visit's later requests for a file it has are answered from it. */
const httpCache = process.argv.includes('--http-cache');
const profile = {
  latencyMs: Number(arg('latency') ?? SLOW_4G.latencyMs),
  downKbps: Number(arg('down') ?? SLOW_4G.downKbps),
  upKbps: Number(arg('up') ?? SLOW_4G.upKbps),
  cpu: Number(arg('cpu') ?? SLOW_4G.cpu),
};
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = 'dist-firstload';

/**
 * `--music`'s probe, run in the page before its scripts: the tap's time, the first audible sample on the music bus and
 * the first decoded music file's start (no named helpers: tsx would wrap them in a `__name` call the page doesn't have).
 */
const MUSIC_PROBE = `(() => {
  const m = { tap: NaN, heard: NaN, loop: NaN, bus: false };
  window.__music = m;
  addEventListener('pointerdown', () => { if (Number.isNaN(m.tap)) m.tap = performance.now(); }, { capture: true });
  const proto = (window.BaseAudioContext || window.AudioContext).prototype;
  const createGain = proto.createGain;
  const made = new WeakMap();
  proto.createGain = function () {
    const g = createGain.call(this);
    const list = made.get(this) || [];
    list.push(g);
    made.set(this, list);
    if (list.length === 3) {
      const connect = g.connect;
      g.connect = function (dest, ...rest) {
        if (dest === list[0]) m.bus = true;
        return connect.call(this, dest, ...rest);
      };
      const an = this.createAnalyser();
      an.fftSize = 2048;
      connect.call(g, an);
      const data = new Float32Array(an.fftSize);
      const poll = () => {
        an.getFloatTimeDomainData(data);
        let p = 0;
        for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
        if (p > 0.001) m.heard = performance.now();
        else setTimeout(poll, 5);
      };
      poll();
    }
    return g;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.buffer && this.buffer.duration > 20 && Number.isNaN(m.loop)) m.loop = performance.now();
    return start.apply(this, args);
  };
})();`;

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
    // A fresh context per run: empty HTTP cache (off unless `--http-cache`), no storage, and service workers blocked.
    const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    // Measurement visits are not players: keep them out of the rollout dashboard (docs/ANALYTICS.md). Blocked here, not
    // with a Playwright route, which would turn the HTTP cache off for the whole context (`--http-cache`).
    await cdp.send('Network.setBlockedURLs', { urls: ['*/analytics/event*'] });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: !httpCache });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latencyMs,
      downloadThroughput: (profile.downKbps * 1024) / 8,
      uploadThroughput: (profile.upKbps * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    if (music) await page.addInitScript(MUSIC_PROBE);
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
    if (music) {
      // The first tap, on the home card but on no button (a button's own click goes to the effects bus anyway).
      const spot = await page.evaluate(() => {
        const home = document.getElementById('lobby-home')!.getBoundingClientRect();
        for (let y = home.top + 8; y < home.bottom; y += 12) {
          for (const x of [home.left + 12, home.left + home.width / 2, home.right - 12]) {
            const el = document.elementFromPoint(x, y);
            if (el && !el.closest('button, a, input, select, label, video, canvas, [role="button"], [tabindex]')) return { x, y };
          }
        }
        return null;
      });
      if (!spot) throw new Error('no spot on the home card that is not a button');
      if (tapAfter > 0) await page.waitForTimeout(tapAfter);
      await page.touchscreen.tap(spot.x, spot.y);
      const got = await page
        .waitForFunction(
          () => {
            const m = (window as unknown as { __music: { tap: number; heard: number; loop: number; bus: boolean } }).__music;
            return Number.isFinite(m.heard) && Number.isFinite(m.loop) ? m : null;
          },
          undefined,
          { polling: 100, timeout: 180_000 },
        )
        .then((h) => h.jsonValue() as Promise<{ tap: number; heard: number; loop: number; bus: boolean }>)
        .catch(() => page.evaluate(() => (window as unknown as { __music: { tap: number; heard: number; loop: number; bus: boolean } }).__music));
      if (!got.bus) throw new Error('the music bus was not found (engine.ts `build` changed?)');
      const heard = got.heard - got.tap;
      const loop = got.loop - got.tap;
      results.push({
        firstPaint: timing.firstPaint,
        fcp: timing.fcp,
        ready: timing.ready,
        usable: at,
        kb: timing.bytes / 1024,
        plate: NaN,
        plateDecode: NaN,
        plateKb: NaN,
        structures: NaN,
        heroSheets: NaN,
        creepSheets: NaN,
        sheetsKb: NaN,
        creepKb: NaN,
        ui: NaN,
        uiKb: NaN,
        heard,
        loop,
      });
      console.log(`run ${i + 1}: usable ${ms(at)}, tapped ${ms(tapAfter)} later; first tap → music heard ${ms(heard)}, decoded file started ${ms(loop)}`);
      await context.close();
      continue;
    }
    // The map plate, after the lobby is usable (so waiting for it changes none of the numbers above).
    const plate = await page
      .waitForFunction(() => document.documentElement.dataset.plate === 'ready', undefined, { polling: 500, timeout: 120_000 })
      .then(() =>
        page.evaluate(() => {
          const res = performance.getEntriesByType('resource').find((r) => /\/map\/spire\.webp/.test(r.name)) as PerformanceResourceTiming | undefined;
          return {
            at: performance.getEntriesByName('tdt:plate')[0]?.startTime ?? NaN,
            decode: performance.getEntriesByName('tdt:decode:spire.webp')[0]?.duration ?? NaN,
            kb: (res?.encodedBodySize ?? NaN) / 1024,
          };
        }),
      )
      .catch(() => ({ at: NaN, decode: NaN, kb: NaN }));
    // The HUD's rendered frames come right after the plate (docs/ART.md §12).
    const frames = await page
      .waitForFunction(() => document.documentElement.dataset.ui === 'ready', undefined, { polling: 250, timeout: 120_000 })
      .then(() =>
        page.evaluate(() => {
          const res = performance.getEntriesByType('resource').find((r) => /\/ui-[^/]*\.webp/.test(r.name)) as PerformanceResourceTiming | undefined;
          return { at: performance.getEntriesByName('tdt:ui')[0]?.startTime ?? NaN, kb: (res?.encodedBodySize ?? NaN) / 1024 };
        }),
      )
      .catch(() => ({ at: NaN, kb: NaN }));
    let loaded = { structures: NaN, hero: NaN, creep: NaN, bytes: 0, creepBytes: 0 };
    if (sheets) {
      // The hero sheets are the last in.
      await page.waitForFunction(() => document.documentElement.dataset.heroSheets === 'ready', undefined, { timeout: 300_000 });
      loaded = await page.evaluate(() => {
        const [structures, hero, creep] = ['tdt:structures', 'tdt:hero-sheets', 'tdt:creep-sheets'].map(
          (name) => performance.getEntriesByName(name)[0]?.startTime ?? NaN,
        );
        // The creeps' are the nine kinds' (no named helper: see above).
        const sheet = performance.getEntriesByType('resource').filter((r) => /-match[^/]*\.(png|webp)/.test(r.name)) as PerformanceResourceTiming[];
        const creeps = sheet.filter((r) => /\/(grunt|runner|archer|brute|wisp|hatchling|ironhorn|matriarch|shardback)-match/.test(r.name));
        const bytes = sheet.reduce((s, r) => s + r.transferSize, 0);
        const creepBytes = creeps.reduce((s, r) => s + r.transferSize, 0);
        return { structures: structures!, hero: hero!, creep: creep!, bytes, creepBytes };
      });
    }
    results.push({
      firstPaint: timing.firstPaint,
      fcp: timing.fcp,
      ready: timing.ready,
      usable: at,
      kb: timing.bytes / 1024,
      plate: plate.at,
      plateDecode: plate.decode,
      plateKb: plate.kb,
      ui: frames.at,
      uiKb: frames.kb,
      structures: loaded.structures,
      heroSheets: loaded.hero,
      creepSheets: loaded.creep,
      sheetsKb: loaded.bytes / 1024,
      creepKb: loaded.creepBytes / 1024,
      heard: NaN,
      loop: NaN,
    });
    console.log(
      `run ${i + 1}: first contentful paint ${ms(timing.fcp)}, ready ${ms(timing.ready)}, usable ${Number.isNaN(at) ? 'never' : ms(at)}, ${(timing.bytes / 1024).toFixed(0)} KB; ` +
        `map plate ${(plate.kb).toFixed(0)} KB, ready ${ms(plate.at)}, decoded in ${plate.decode.toFixed(0)} ms; ` +
        `HUD frames ${frames.kb.toFixed(0)} KB, in at ${ms(frames.at)}` +
        (sheets
          ? `; structures in at ${ms(loaded.structures)}, creep sheets at ${ms(loaded.creep)}, hero sheets at ${ms(loaded.hero)} ` +
            `(${(loaded.bytes / 1024).toFixed(0)} KB, the creeps' ${(loaded.creepBytes / 1024).toFixed(0)} KB)`
          : ''),
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
    `CPU ${profile.cpu}× slower · ${httpCache ? 'empty HTTP cache' : 'cold cache'}, no service worker · ${runs} runs`,
);
if (music) {
  console.log(`usable lobby:             ${stats(results.map((r) => r.usable))}`);
  console.log(`first tap → music heard:  ${stats(results.map((r) => r.heard))}`);
  console.log(`first tap → decoded file: ${stats(results.map((r) => r.loop))}`);
} else {
  report();
}

function report(): void {
  console.log(`first contentful paint:   ${stats(results.map((r) => r.fcp))}`);
  console.log(`tdt:ready:                ${stats(results.map((r) => r.ready))}`);
  console.log(`usable lobby:             ${stats(results.map((r) => r.usable))}`);
  console.log(`transferred:              ${(results.reduce((s, r) => s + r.kb, 0) / results.length).toFixed(0)} KB per load`);
  console.log(`map plate ready:          ${stats(results.map((r) => r.plate))}`);
  console.log(`map plate decode:         ${stats(results.map((r) => r.plateDecode))} (${results[0]?.plateKb.toFixed(0)} KB)`);
  console.log(`HUD frames in:            ${stats(results.map((r) => r.ui))} (${results[0]?.uiKb.toFixed(0)} KB)`);
  if (sheets) {
    console.log(`structures sheet in:      ${stats(results.map((r) => r.structures))}`);
    console.log(`creep sheets in:          ${stats(results.map((r) => r.creepSheets))}`);
    console.log(`hero sheets in:           ${stats(results.map((r) => r.heroSheets))}`);
    console.log(`match sheets:             ${(results.reduce((s, r) => s + r.sheetsKb, 0) / results.length).toFixed(0)} KB per load`);
    console.log(`creep sheets:             ${(results.reduce((s, r) => s + r.creepKb, 0) / results.length).toFixed(0)} KB per load`);
  }
}
