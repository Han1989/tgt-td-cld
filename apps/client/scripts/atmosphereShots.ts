// `npm run atmosphere-shots -w @tdt/client [-- --out DIR] [--only phone,desktop,boss,clip]`, after
// `npm run build:e2e -w @tdt/client`: V-08a's pictures (docs/ART.md §6, §16) into docs/screenshots/atmosphere/.
//
// Real solo Full matches on the e2e build in headless Chromium, on the Ranger with the lab's gold, a few towers built
// (some at tier 2 and 3, so their lanterns show) by the controls' own commands; the weather forced with `?weather=`
// (rain, leaves, clear) and each wave reached with the e2e `skipTo`. Each frame is held: the simulation paused once the
// wave's creeps are out on the roads and its light has crossfaded in.
//   phone-<weather>-wave<N>.webp   412 × 839 (2×), waves 3 (afternoon), 15 (dusk), 25 (night), in each weather
//   phone-boss-night.webp          Full wave 20 (a boss wave: always at night), the boss down its road
//   desktop-<weather>-wave<N>.webp 1280 × 800, the same waves; desktop-boss-night.webp
//   dusk-to-night.mp4              10 s: Full wave 19 (dusk) into wave 21 (night) in the rain, recorded in real time with
//                                  the match running: the plates' 6 s crossfade, the rain, the fireflies coming out, the
//                                  lanterns, the Heart's windows (as fast as the machine's GPU draws it).
// Look at every picture before committing it.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const path = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const out = path(arg('out', join(repo, 'docs', 'screenshots', 'atmosphere')));
const only = new Set(arg('only', 'phone,desktop,boss,clip').split(','));
const dist = join(root, 'dist-e2e');

const PHONE = { width: 412, height: 839 };
const DESKTOP = { width: 1280, height: 800 };
const SETTINGS = {
  quality: 'high',
  display: 'normal',
  tutorial: 'skipped',
  airLesson: 'seen',
  repairHint: 'seen',
  zoomHint: 'seen',
  endlessRoomLine: 'seen',
};
const WAVES = [3, 15, 25] as const;
const WEATHERS = ['rain', 'leaves', 'clear'] as const;
const LIGHT_OF: Record<number, string> = { 3: 'afternoon', 15: 'dusk', 19: 'dusk', 20: 'night', 21: 'night', 25: 'night' };

const README = `# The atmosphere pass (V-08a)

Made by \`npm run atmosphere-shots -w @tdt/client\` after \`npm run build:e2e -w @tdt/client\` (docs/ART.md §6, §16).
Solo Full matches on the e2e build, the weather forced with \`?weather=\`, each wave reached with the e2e \`skipTo\`.

- \`phone-<weather>-wave<N>.webp\`: 412 × 839 at 2×; wave 3 in the afternoon, 15 at dusk, 25 at night; rain, leaves, clear.
- \`desktop-<weather>-wave<N>.webp\`: 1280 × 800, the same.
- \`phone-boss-night.webp\`, \`desktop-boss-night.webp\`: Full wave 20, a boss wave (always at night), in the rain.
- \`dusk-to-night.mp4\`: 10 s, wave 19 (dusk) into wave 21 (night) in the rain: the plates' 6 s crossfade.
`;

mkdirSync(out, { recursive: true });

async function page(browser: Browser, desktop: boolean, url: string, recordVideo?: { dir: string; size: { width: number; height: number } }): Promise<Page> {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: DESKTOP, deviceScaleFactor: 1, serviceWorkers: 'block' }
      : { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(recordVideo ? { recordVideo } : {}) },
  );
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(url);
  await p.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await p.locator('#lobby-offline').click();
  await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets][data-plate-lights]', {
    timeout: 240_000,
  });
  await build(p);
  return p;
}

/** A few towers on the pads by the lanes, some at tier 2 and 3 (their lanterns), as the controls would build them. */
async function build(p: Page): Promise<void> {
  const plan: [number, number, string, number][] = [
    [2.5, 6, 'arrow', 3],
    [9.5, 10, 'cannon', 2],
    [16.5, 10, 'frost', 2],
    [23.5, 14, 'arcane', 3],
    [2.5, 18, 'flak', 2],
    [9.5, 22, 'arrow', 3],
    [16.5, 22, 'cannon', 3],
    [23.5, 26, 'arrow', 1],
    [6, 30, 'frost', 1],
    [19, 30, 'arcane', 2],
  ];
  for (const [x, y, kind, tier] of plan) {
    const at: [number, number] = [x, y];
    const pad = await p.evaluate(
      ([x, y]) => {
        const t = (window as any).__tdt;
        const open = new Set(t.latest().pads.filter((q: any) => q.owner === null || q.owner === t.me()).map((q: any) => q.id));
        const taken = new Set(t.latest().towers.map((q: any) => q.padId));
        let best: any = null;
        for (const q of t.map.pads) {
          if (!open.has(q.id) || taken.has(q.id)) continue;
          const d = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (!best || d < best.d) best = { d, id: q.id };
        }
        return best?.id ?? null;
      },
      at,
    );
    if (pad === null) continue;
    await p.evaluate(([pad, kind]) => (window as any).__tdt.command({ type: 'build', padId: pad, tower: kind }), [pad, kind] as const);
    await p.waitForFunction((id) => (window as any).__tdt.latest().towers.some((q: any) => q.padId === id), pad);
    for (let t = 2; t <= tier; t++) {
      await p.evaluate((id) => {
        const tw = (window as any).__tdt.latest().towers.find((q: any) => q.padId === id);
        (window as any).__tdt.command({ type: 'upgrade', towerId: tw.id });
      }, pad);
      await p.waitForFunction(([id, t]) => (window as any).__tdt.latest().towers.find((q: any) => q.padId === id)?.tier >= t, [pad, t] as const);
    }
  }
}

/** Wave `wave` running, its creeps out on the roads, its light crossfaded in; then the simulation is paused. */
async function reach(p: Page, wave: number, boss = false): Promise<void> {
  await p.evaluate(() => (window as any).__tdt.pause(false));
  await p.evaluate((w) => (window as any).__tdt.skipTo(w), wave);
  await p.waitForFunction((w) => (window as any).__tdt.latest().wave === w, wave, { timeout: 30_000 });
  const light = LIGHT_OF[wave]!;
  // Still this wave (not the next one's banner), its light in, its creeps (and its boss) out on the roads.
  await p.waitForFunction(
    ([l, b, w]) => {
      const t = (window as any).__tdt;
      const a = t.atmosphere();
      const s = t.latest();
      const out = s.creeps.filter((c: any) => c.y > 6).length;
      const bossOut = !b || s.creeps.some((c: any) => t.tuning.creeps[c.kind].boss && c.y > 6);
      return s.wave === w && a.plates === 1 && a.light.to === l && a.light.t === 1 && out >= 6 && bossOut;
    },
    [light, boss, wave] as const,
    { timeout: 60_000, polling: 100 },
  );
  await p.evaluate(() => (window as any).__tdt.pause(true));
  await p.waitForTimeout(600);
}

async function shoot(p: Page, name: string): Promise<void> {
  const png = join(out, `${name}.png`);
  await p.screenshot({ path: png });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '84', join(out, `${name}.webp`)]);
  rmSync(png);
  const a = await p.evaluate(() => (window as any).__tdt.atmosphere());
  console.log(`${name}: ${a.light.to}, ${a.weather.weather}, ${a.weather.live} weather particles, ${a.lanterns} lanterns, ${a.heartWindows} windows`);
}

async function stills(browser: Browser, url: string, desktop: boolean): Promise<void> {
  const kind = desktop ? 'desktop' : 'phone';
  for (const weather of WEATHERS) {
    const p = await page(browser, desktop, `${url}?lab&weather=${weather}`);
    for (const wave of WAVES) {
      await reach(p, wave);
      await shoot(p, `${kind}-${weather}-wave${wave}`);
    }
    await p.context().close();
  }
}

async function bossShot(browser: Browser, url: string): Promise<void> {
  for (const desktop of [false, true]) {
    const p = await page(browser, desktop, `${url}?lab&weather=rain`);
    await reach(p, 20, true);
    await shoot(p, `${desktop ? 'desktop' : 'phone'}-boss-night`);
    await p.context().close();
  }
}

/**
 * Dusk into night over a wave: recorded in real time (Playwright's screen recording) from Full wave 19 at dusk as wave
 * 21 starts, the match running: the plates' 6 s crossfade, the rain, the fireflies coming out. The 10 s from the wave's
 * start are cut out of the recording and written as H.264.
 */
/** The recording runs a few seconds behind the page here: where in it the wave's start shows (s). */
const CLIP_LAG_S = 3.2;

async function clip(browser: Browser, url: string): Promise<void> {
  const dir = join(out, 'clip-video');
  rmSync(dir, { recursive: true, force: true });
  // The recording starts with the page (its context): the wave's moment is timed from there.
  const started = Date.now();
  const p = await page(browser, false, `${url}?lab&weather=rain`, { dir, size: PHONE });
  await reach(p, 19);
  await p.evaluate(() => (window as any).__tdt.pause(false));
  // Wave 21 is night: the crossfade starts with it.
  const at = (Date.now() - started) / 1000;
  await p.evaluate(() => (window as any).__tdt.skipTo(21));
  await p.waitForTimeout(11_000);
  const video = p.video();
  await p.context().close();
  const file = await video!.path();
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', String(at + CLIP_LAG_S), '-t', '10', '-i', file,
    '-vf', 'fps=25,scale=412:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', join(out, 'dusk-to-night.mp4'),
  ]);
  rmSync(dir, { recursive: true, force: true });
  console.log('dusk-to-night.mp4: 10 s from wave 21\'s start');
}

const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the preview server has no URL');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  if (only.has('phone')) await stills(browser, url, false);
  if (only.has('desktop')) await stills(browser, url, true);
  if (only.has('boss')) await bossShot(browser, url);
  if (only.has('clip')) await clip(browser, url);
  writeFileSync(join(out, 'README.md'), README);
} finally {
  await browser.close();
  await server.close();
}

