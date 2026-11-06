// V-08b look, the tilted camera (docs/art/camera-options.md). Dev only, images only: nothing in the game changes.
//
//   npm run build:e2e -w @tdt/client
//   npm run art:3d -- pitch all --draft --out DIR
//   npm run camera-options -w @tdt/client -- DIR
//
// Holds one real wave-10 moment twice, on a 412 × 839 phone (2×) and a 1280 × 800 desktop (the e2e build, `?lab`, the
// Ranger, Full, clear weather, the afternoon's light), with ground-check's five towers round the map's middle
// (Cannon 2, Arrow 3, Frost 1, Arcane 3, Flak 2, built by the controls' own commands) and the hero walked up to their
// row; once wave 10's creeps are out with the Ironhorn on its road, the simulation is paused. For each device it
// writes into DIR/held/: `today-<device>.png` (the frame as the game draws it), `hud-<device>.png` (the same frame with
// the map's canvas hidden: the HUD and the touch controls alone, over transparency) and `held-<device>.json` (the
// snapshot, the one before it for the units' facing, the layout, the map and the camera's mapping). Then
// tools/blender/pitch_compose.py composes the pitched frames, the sheet and the measurements from them.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const dirArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!dirArg) throw new Error('usage: npm run camera-options -w @tdt/client -- DIR (the folder of `npm run art:3d -- pitch … --out DIR`)');
const dir = isAbsolute(dirArg) ? dirArg : resolve(process.cwd(), dirArg);
const held = join(dir, 'held');
const dist = join(root, 'dist-e2e');
if (!existsSync(join(dist, 'index.html'))) throw new Error('missing dist-e2e (npm run build:e2e -w @tdt/client)');
mkdirSync(held, { recursive: true });

const DEVICES = {
  phone: { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
} as const;
const SETTINGS = {
  quality: 'high',
  display: 'normal',
  tutorial: 'skipped',
  airLesson: 'seen',
  repairHint: 'seen',
  zoomHint: 'seen',
  endlessRoomLine: 'seen',
};
const PLAN: [string, number][] = [['cannon', 2], ['arrow', 3], ['frost', 1], ['arcane', 3], ['flak', 2]];

async function open(browser: Browser, device: keyof typeof DEVICES, url: string): Promise<Page> {
  const ctx = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${url}?lab&weather=clear&light=afternoon`);
  await p.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await p.locator('#lobby-offline').click();
  await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', {
    timeout: 240_000,
  });
  return p;
}

/** ground-check's five pads: the middle full row of pads, then the pad under its second. */
async function build(p: Page): Promise<{ id: number; x: number; y: number }[]> {
  const pads = (await p.evaluate(`(() => {
    const m = window.__tdt.map; const own = window.__tdt.latest().pads.map((q) => m.pads[q.id]);
    const rows = [...new Set(own.map((q) => q.y))].sort((a, b) => a - b);
    const cols = [...new Set(own.map((q) => q.x))].sort((a, b) => a - b);
    const full = rows.filter((y) => own.filter((q) => q.y === y).length === cols.length);
    const y = full[Math.floor((full.length - 1) / 2)];
    const row = own.filter((q) => q.y === y).sort((a, b) => a.x - b.x);
    const below = own.filter((q) => q.x === row[1].x && q.y > y).sort((a, b) => a.y - b.y)[0];
    return [row[0], row[1], row[2], row[3], below].map((q) => ({ id: q.id, x: q.x, y: q.y })); })()`)) as {
    id: number;
    x: number;
    y: number;
  }[];
  for (const [i, [kind, tier]] of PLAN.entries()) {
    const pad = pads[i]!;
    await p.evaluate(([id, k]) => (window as any).__tdt.command({ type: 'build', padId: id, tower: k }), [pad.id, kind] as const);
    await p.waitForFunction((id) => (window as any).__tdt.latest().towers.some((q: any) => q.padId === id), pad.id);
    for (let t = 2; t <= tier; t++) {
      await p.evaluate((id) => {
        const tw = (window as any).__tdt.latest().towers.find((q: any) => q.padId === id);
        (window as any).__tdt.command({ type: 'upgrade', towerId: tw.id });
      }, pad.id);
      await p.waitForFunction(([id, n]) => (window as any).__tdt.latest().towers.find((q: any) => q.padId === id)?.tier >= n, [pad.id, t] as const);
    }
  }
  return pads;
}

async function hold(p: Page, device: keyof typeof DEVICES): Promise<void> {
  const pads = await build(p);
  // The hero up the road to the towers' row, as ground-check walks him.
  await p.evaluate((y) => {
    const t = (window as any).__tdt;
    const h = t.latest().heroes[0];
    t.command({ type: 'move', x: h.x, y });
  }, pads[0]!.y + 1.5);
  await p.waitForFunction((y) => (window as any).__tdt.latest().heroes[0].y < y + 0.6, pads[0]!.y + 1.5, { timeout: 60_000 });
  await p.evaluate(() => (window as any).__tdt.skipTo(10));
  await p.waitForFunction(
    () => {
      const s = (window as any).__tdt.latest();
      const b = s.creeps.find((c: any) => c.kind === 'ironhorn');
      return s.wave === 10 && !!b && s.creeps.length >= 20 && b.y > 6;
    },
    undefined,
    { timeout: 120_000, polling: 100 },
  );
  const before = await p.evaluate(() => (window as any).__tdt.latest());
  await p.waitForTimeout(150);
  await p.evaluate(() => (window as any).__tdt.pause(true));
  await p.waitForTimeout(900);
  for (const b of await p.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(held, `today-${device}.png`) });
  const info = await p.evaluate(() => {
    const t = (window as any).__tdt;
    const m = t.map;
    const a = t.camera.worldToScreen(0, 0);
    const b = t.camera.worldToScreen(m.width * 32, m.height * 32);
    return {
      snapshot: t.latest(),
      me: t.me(),
      layout: t.layout(),
      origin: a,
      far: b,
      dpr: window.devicePixelRatio,
      view: { width: innerWidth, height: innerHeight },
      map: {
        width: m.width,
        height: m.height,
        safeFromY: m.safeFromY,
        heart: m.heart,
        heroSpawn: m.heroSpawn,
        padSize: m.padSize,
        pads: m.pads,
        lanes: m.lanes.map((l: any) => ({ waypoints: l.waypoints })),
      },
    };
  });
  writeFileSync(join(held, `held-${device}.json`), JSON.stringify({ ...info, before }, null, 1));
  // The HUD alone: the map's canvas hidden, the page's own background left out.
  await p.addStyleTag({
    content: 'canvas { visibility: hidden !important; } html, body, #game { background: transparent !important; }',
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(held, `hud-${device}.png`), omitBackground: true });
  console.log(`${device}: wave ${info.snapshot.wave}, ${info.snapshot.creeps.length} creeps, ${info.snapshot.towers.length} towers`);
}

const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the preview server has no URL');
// A Chromium of another revision than Playwright's own (a container's preinstalled one): CHROMIUM_PATH.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const device of ['phone', 'desktop'] as const) {
    const p = await open(browser, device, url);
    await hold(p, device);
    await p.context().close();
  }
} finally {
  await browser.close();
  await new Promise<void>((done) => server.httpServer.close(() => done()));
}
// The pitched frames, the sheet and the measurements.
const py = process.env.TDT_BLENDER_PYTHON ?? join(repo, '.venv-blender', 'bin', 'python');
execFileSync(existsSync(py) ? py : 'python3', [join(repo, 'tools', 'blender', 'pitch_compose.py'), dir], { stdio: 'inherit', cwd: repo });
