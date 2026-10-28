// The match's ground, shot and measured (V-07c: the map in Spring meadow; docs/ART.md §16, docs/art/ground-options.md).
// Dev only: what V-07c's sheet showed and measured on its drafts, on the committed plate and a real build.
//
//   npm run build:e2e -w @tdt/client && npm run ground-check -w @tdt/client -- [--label after] [--dist DIR]
//     [--plate FILE] [--teammate-rim 0.5] [--bright-alpha 0.32] [--out DIR] [--checks-only]
//
// One match on a 412 × 839 phone at 3×, Graphics → High (the e2e build in --dist, default dist-e2e: `?lab`, the
// Ranger, Full; the sheet's five towers round the middle, Arrow and Arcane at tier 3, Cannon and Flak at 2, Frost at 1,
// the Arrow on an inner pad so the 1.8× frame has it; the hero walked to the towers' row) held at wave 10 with the
// Ironhorn on its lane (`__tdt.pause`): the frame at the fit and pinched to 1.8× (V-07e), the same in Bright, a crop at
// the phone's own pixels round a tier-3 tower's pad (its light pool, the moss on the pads round it). A second match
// left undefended until wave 10's creeps have cracked the Heart (under 60%): the frame at the fit and at 1.8× by the
// Heart (its rose pool). Then in a page of Vite's dev server (src/groundCheck.ts) the readability checks measured on
// the plate (--plate, default public/map/spire.webp) and the three heroes, a Grunt and a Brute standing on its middle,
// a pad tinted yours and one a teammate's (that rim's alpha: --teammate-rim, default the game's; Bright's wash:
// --bright-alpha, default the game's). Writes `<out>/<n>-<frame>-<label>.jpg` (default docs/screenshots/ground, label
// `after`) and prints the checks as JSON (`--checks-only`: the checks and the figures alone, no match).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const path = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const label = arg('label', 'after');
const dist = path(arg('dist', join(root, 'dist-e2e')));
const plate = path(arg('plate', join(root, 'public', 'map', 'spire.webp')));
const out = path(arg('out', join(root, '..', '..', 'docs', 'screenshots', 'ground')));
const rimArg = process.argv.includes('--teammate-rim') ? Number(arg('teammate-rim', '')) : null;
const checksOnly = process.argv.includes('--checks-only');
const brightArg = process.argv.includes('--bright-alpha') ? Number(arg('bright-alpha', '')) : null;
for (const f of checksOnly ? [plate] : [join(dist, 'index.html'), plate]) if (!existsSync(f)) throw new Error(`missing ${f} (npm run build:e2e -w @tdt/client)`);

const VIEW = { width: 412, height: 839 };
const ZOOM = 1.8;
const JPEG = { type: 'jpeg', quality: 85 } as const;
mkdirSync(out, { recursive: true });
const save = (name: string, body: Buffer) => {
  const file = join(out, `${name}-${label}.jpg`);
  writeFileSync(file, body);
  console.log(`${file}: ${(body.length / 1024).toFixed(0)} KB`);
};
const shot = async (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) =>
  save(name, await page.screenshot({ ...JPEG, ...(clip ? { clip } : {}) }));

type Pt = { x: number; y: number };
const worldOnScreen = (page: Page, x: number, y: number) =>
  page.evaluate((p) => (window as any).__tdt.camera.worldToScreen(p.x * 32, p.y * 32), { x, y }) as Promise<Pt>;

/** Two fingers pinch at `at`, spreading `ratio` times apart (as e2e/helpers.ts `pinchOn`). */
async function pinch(page: Page, at: Pt, ratio: number, gap = 90): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, id: number, x: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ id, x, y: at.y }] } as never);
  const put = (d: number) => [at.x - d / 2, at.x + d / 2] as const;
  let [a, b] = put(gap);
  await touch('touchStart', 0, a);
  await touch('touchStart', 1, b);
  for (let i = 1; i <= 10; i++) {
    [a, b] = put(gap * (1 + ((ratio - 1) * i) / 10));
    await touch('touchMove', 0, a);
    await touch('touchMove', 1, b);
  }
  await touch('touchEnd', 0, a);
  await touch('touchEnd', 1, b);
  await cdp.detach();
}

/** Pinches to 1.8× (from the fit) and waits for the camera to settle. */
async function zoomIn(page: Page, at: Pt): Promise<void> {
  await pinch(page, at, ZOOM);
  await page.waitForFunction((z) => Math.abs((window as any).__tdt.zoom() - z) < 0.02, ZOOM, { timeout: 10_000 });
  await page.waitForTimeout(900);
}

/** Back to the fit (the ⤢ button). */
async function zoomOut(page: Page): Promise<void> {
  const z = (await page.evaluate(() => (window as any).__tdt.layout().zoomButton)) as Record<'left' | 'top' | 'right' | 'bottom', number>;
  await page.touchscreen.tap((z.left + z.right) / 2, (z.top + z.bottom) / 2);
  await page.waitForFunction(() => Math.abs((window as any).__tdt.zoom() - 1) < 0.01, undefined, { timeout: 10_000 });
  await page.waitForTimeout(500);
}

/** Your hero walks up with the floating stick (a drag just over the controls, held) until it is above row `y`. */
async function walkUp(page: Page, y: number): Promise<void> {
  const l = (await page.evaluate(() => (window as any).__tdt.layout())) as {
    map: { left: number; right: number };
    controls: { top: number };
  };
  const from = { x: (l.map.left + l.map.right) / 2, y: l.controls.top - 40 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, dy: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ id: 7, x: from.x, y: from.y - dy }] } as never);
  await touch('touchStart', 0);
  await touch('touchMove', 15);
  await touch('touchMove', 30);
  const heroY = () => page.evaluate(() => (window as any).__tdt.latest().heroes[0].y) as Promise<number>;
  for (let i = 0; i < 120 && (await heroY()) > y; i++) await page.waitForTimeout(100);
  await touch('touchEnd', 30);
  await cdp.detach();
}

async function gotIt(page: Page): Promise<void> {
  for (const b of await page.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
}

async function hinted(page: Page): Promise<boolean> {
  for (const text of [/stomp nearby/, /Gold is waiting/]) {
    for (const el of await page.getByText(text).all()) if (await el.isVisible().catch(() => false)) return true;
  }
  return false;
}

async function solo(browser: Browser, url: string): Promise<Page> {
  // No service worker: the build's own files, as served.
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  // Graphics → High: on headless Chromium's software GPU, Auto drops to Low within seconds, and Low hides the effects
  // that are not essential (the light pools among them).
  await ctx.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('tdt.settings') ?? '{}');
    localStorage.setItem('tdt.settings', JSON.stringify({ ...s, quality: 'high' }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}?lab`);
  await page.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Ranger' }).click();
  await page.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await page.locator('#lobby-offline').click();
  await page.waitForSelector('html[data-plate="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 120_000 });
  await page.waitForFunction(() => !!(window as any).__tdt?.latest());
  await page.waitForTimeout(500);
  return page;
}

/** The sheet's five towers on five pads round the map's middle (its row, then the pad under the second): Cannon 2,
 * Arrow 3, Frost 1, Arcane 3, Flak 2. Returns the pads in that order (the second, the Arrow at tier 3, on an inner
 * column). */
async function build(page: Page): Promise<{ id: number; x: number; y: number }[]> {
  await gotIt(page);
  const pads = (await page.evaluate(`(() => {
    const m = window.__tdt.map; const own = window.__tdt.latest().pads.map((p) => m.pads[p.id]);
    const rows = [...new Set(own.map((p) => p.y))].sort((a, b) => a - b);
    const cols = [...new Set(own.map((p) => p.x))].sort((a, b) => a - b);
    const full = rows.filter((y) => own.filter((p) => p.y === y).length === cols.length);
    const y = full[Math.floor((full.length - 1) / 2)];
    const row = own.filter((p) => p.y === y).sort((a, b) => a.x - b.x);
    const below = own.filter((p) => p.x === row[1].x && p.y > y).sort((a, b) => a.y - b.y)[0];
    return [row[0], row[1], row[2], row[3], below].map((p) => ({ id: p.id, x: p.x, y: p.y })); })()`)) as {
    id: number;
    x: number;
    y: number;
  }[];
  const plan: [string, number][] = [['cannon', 2], ['arrow', 3], ['frost', 1], ['arcane', 3], ['flak', 2]];
  const away = await page.evaluate(() => {
    const h = (window as any).__tdt.map.heart;
    return (window as any).__tdt.camera.worldToScreen((h.x + 3) * 32, (h.y - 2) * 32);
  });
  for (const [i, [kind, tier]] of plan.entries()) {
    const pad = pads[i]!;
    const tap = async () => {
      const p = await worldOnScreen(page, pad.x, pad.y);
      await page.touchscreen.tap(p.x, p.y);
    };
    const towerTier = () =>
      page.evaluate((id) => (window as any).__tdt.latest().towers.find((t: any) => t.padId === id)?.tier ?? 0, pad.id) as Promise<number>;
    const buildBtn = page.locator(`.radial-btn[data-tower="${kind}"]`);
    for (let w = 0; w < 4 && !(await buildBtn.isVisible()); w++) {
      await tap();
      await page.waitForTimeout(250);
    }
    await buildBtn.tap();
    for (let w = 0; w < 50 && (await towerTier()) < 1; w++) await page.waitForTimeout(100);
    for (let t = 2; t <= tier; t++) {
      if (!(await page.locator('.radial-btn[data-action="upgrade"]').isVisible())) await tap();
      await page.locator('.radial-btn[data-action="upgrade"]').tap();
      for (let w = 0; w < 50 && (await towerTier()) < t; w++) await page.waitForTimeout(100);
    }
    await gotIt(page);
    await page.touchscreen.tap(away.x, away.y);
    await page.waitForTimeout(250);
  }
  return pads;
}

/** The first match: wave 10 held, shot at the fit and at 1.8×, in Normal and Bright, and the crop round a tier-3 pad. */
async function wave10(browser: Browser, url: string): Promise<void> {
  const page = await solo(browser, url);
  const pads = await build(page);
  // The hero walked up the Mid road to the towers' row (the floating stick: a tap there would snap to a tower), so the
  // 1.8× frame shows the towers and the wave.
  await walkUp(page, pads[0]!.y + 1.5);
  await page.evaluate(() => (window as any).__tdt.skipTo(10));
  const ready = () =>
    page.evaluate(() => {
      const s = (window as any).__tdt.latest();
      const b = s.creeps.find((c: any) => c.kind === 'ironhorn');
      return !!b && s.creeps.length >= 20 && b.y > 6;
    });
  for (let i = 0; i < 80 && !(await ready()); i++) {
    await gotIt(page);
    await page.waitForTimeout(500);
  }
  for (let i = 0; i < 30 && (await hinted(page)); i++) await page.waitForTimeout(500);
  await gotIt(page);
  await page.evaluate(() => (window as any).__tdt.pause(true));
  await page.waitForTimeout(700);
  const mid = await worldOnScreen(page, pads[1]!.x, pads[1]!.y);
  for (const display of ['normal', 'bright'] as const) {
    if (display === 'bright') {
      await page.locator('#settings-btn').click();
      await page.locator('#settings-display').getByRole('button', { name: 'Bright' }).click();
      await page.locator('#settings-btn').click();
      await page.waitForTimeout(800);
    }
    const n = display === 'normal' ? 1 : 3;
    await shot(page, `${n}-wave10-fit${display === 'bright' ? '-bright' : ''}`);
    await zoomIn(page, mid);
    await shot(page, `${n + 1}-wave10-zoom-1.8${display === 'bright' ? '-bright' : ''}`);
    if (display === 'normal') {
      // The tier-3 Arrow tower's pad and the pads round it, at the phone's own pixels (3×).
      const c = await worldOnScreen(page, pads[1]!.x, pads[1]!.y);
      const half = await page.evaluate(() => 3.2 * 32 * (window as any).__tdt.camera.zoom);
      if (c.x < half * 0.5 || c.x > VIEW.width - half * 0.5 || c.y < 48 + half * 0.5 || c.y > VIEW.height - half * 0.5)
        throw new Error(`the tier-3 tower is off the 1.8× frame (${Math.round(c.x)}, ${Math.round(c.y)}): the hero did not reach it`);
      const clip = {
        x: Math.max(0, c.x - half),
        y: Math.max(48, c.y - half),
        width: Math.min(VIEW.width - Math.max(0, c.x - half), half * 2),
        height: Math.min(VIEW.height - Math.max(48, c.y - half), half * 2),
      };
      await shot(page, '7-pad-tier3-crop', clip);
    }
    await zoomOut(page);
  }
  await page.context().close();
}

/** The second match: undefended at wave 10 until the Heart is cracked (under 60%), shot at the fit and by the Heart. */
async function heartCracked(browser: Browser, url: string): Promise<void> {
  const page = await solo(browser, url);
  await gotIt(page);
  await page.evaluate(() => (window as any).__tdt.skipTo(10));
  const frac = () => page.evaluate(() => {
    const s = (window as any).__tdt.latest();
    return s.heartHp / s.heartMaxHp;
  }) as Promise<number>;
  for (let i = 0; i < 480 && (await frac()) > 0.55; i++) {
    await gotIt(page);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => (window as any).__tdt.pause(true));
  console.log(`the Heart at ${Math.round((await frac()) * 100)}%`);
  await page.waitForTimeout(700);
  await shot(page, '5-heart-cracked-fit');
  const h = await page.evaluate(() => (window as any).__tdt.map.heart);
  await zoomIn(page, await worldOnScreen(page, h.x, h.y - 2));
  await shot(page, '6-heart-cracked-zoom-1.8');
  await page.context().close();
}

async function frames(): Promise<void> {
  const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  const browser = await chromium.launch();
  try {
    await wave10(browser, url);
    await heartCracked(browser, url);
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

/** The checks and the figures' band, measured on `plate` in a page of Vite's dev server (src/groundCheck.ts). */
async function measure(): Promise<unknown> {
  const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the dev server has no URL');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
    await page.route('**/__ground/plate.webp', (route) => route.fulfill({ body: readFileSync(plate), contentType: 'image/webp' }));
    // A light page of the shell (no game boots): the module is imported into it.
    await page.goto(`${url}privacy.html`);
    const res = (await page.evaluate(
      `import('/src/groundCheck.ts').then((m) => m.groundCheck(${rimArg ?? 'undefined'}, ${brightArg ?? 'undefined'}))`,
    )) as { checks: unknown; band: string };
    save('8-figures-on-grass', Buffer.from(res.band.slice(res.band.indexOf(',') + 1), 'base64'));
    return res.checks;
  } finally {
    await browser.close();
    await server.close();
  }
}

const checks = await measure();
console.log(JSON.stringify({ label, plate, checks }, null, 1));
if (!checksOnly) await frames();
