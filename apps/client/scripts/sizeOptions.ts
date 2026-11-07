// V-08c look: the sizes of the towers, the Heart, the portals and the heroes (docs/art/size-options.md). Dev only,
// images only: nothing in the game changes.
//
//   npm run build:e2e -w @tdt/client
//   npm run size-options -w @tdt/client [-- --out DIR] [--frames DIR]
//
// Holds one real wave-13 moment of a solo Full match on the Warden (the e2e build, `?lab`, clear weather, the
// afternoon's light), the Warden (level 8) on the West lane's lower stretch above its bend with Runners and a Brute
// round him (wave 13 has no Grunts). Every pad would kill a wave long before it reached him there, so the towers are
// built once the pack is round him: every pad of the Spire's four columns, Arrow, Cannon, Frost, Arcane and Flak at
// tiers 1-3 (PLAN), in three ticks, and the simulation paused (`__tdt.pause`). The same frame is then drawn three
// times, at each column's sizes (OPTIONS):
//
// - the towers, the Heart and the portals scaled about their ground points: their roots (found in the Pixi stage
//   through Pixi's own devtools hook, `__PIXI_APP_INIT__`, by their ground points) get a factor on whatever scale the
//   renderer gives them each frame, so a tower is `factor` × today's drawn size (`towerScale` and its pad cap
//   included);
// - the hero through the e2e hook's `scales`, today's `entityScales` with HERO_BOOST in proportion to the column's
//   (Han's numbers are V-04's 1.4; the game has V-07e's 1.75, so ×1.25 is 1.75 × 1.25 / 1.4).
//
// The strip is composed from the match sheets (in a real frame the pack hides them): the Warden idle beside a Grunt and
// a Brute, at the phone's scales in each column, and once more at column 3 with the creeps a step smaller (CREEP_3).
//
// Writes docs/art/size-options.png (the sheet: three columns, 1, 2 and 3, each the 412 × 839 phone at 2× over the
// 1280 × 720 desktop at 1×, the measured numbers under it, then the strip), docs/art/size-options/<n>.png (each
// column's phone frame alone, 824 × 1678) and docs/art/size-options/measures.json (every number size-options.md
// quotes). `--frames DIR` keeps every raw frame. `CHROMIUM_PATH` for a Chromium of another revision than
// Playwright's. Look at the pictures before committing them.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { preview } from 'vite';
import { CREEP_BOOST, ENTITY_TILE_PX, FULL_BOOST_TILE_PX, HERO_BOOST, MAX_BASE_SCALE, MAX_TOWER_SCALE, PAD_HALF_PX } from '../src/render/entityScale';
import { TOWER_REACH, TOWER_TOP, towerVariant } from '../src/render/art3d/structures';
import { openHeld, type Device } from './heldMoment';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const path = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const dist = join(root, 'dist-e2e');
if (!existsSync(join(dist, 'index.html'))) throw new Error('missing dist-e2e (npm run build:e2e -w @tdt/client)');
const outDir = path(arg('out') ?? join(repo, 'docs', 'art'));
const framesDir = arg('frames') ? path(arg('frames')!) : null;
if (framesDir) mkdirSync(framesDir, { recursive: true });
const art3d = join(root, 'src', 'render', 'art3d');

/** Han's three columns (7 Nov 2026). `hero` is his phone hero number (V-04's scale; today is 1.4 there). */
export const OPTIONS = [
  { n: 1, tower: 1, heart: 1, portal: 1, hero: 1.4 },
  { n: 2, tower: 0.85, heart: 1.15, portal: 1.2, hero: 1.25 },
  { n: 3, tower: 0.75, heart: 1.3, portal: 1.35, hero: 1.1 },
] as const;
type Option = (typeof OPTIONS)[number];
/** Han's numbers are V-04's (hero 1.4, creep 1.2); the game's are V-07e's. Each column keeps his ratio to today. */
const HAN_HERO_TODAY = 1.4;
const HAN_CREEP_TODAY = 1.2;
/** The strip's extra cell: column 3 with the creeps at Han's "×1.1" too. */
const CREEP_3 = 1.1;
/** The Warden's row on the West lane, its lower stretch above the bend. */
const HOLD_ROW = 20;
const heroBoost = (o: Option) => (HERO_BOOST * o.hero) / HAN_HERO_TODAY;
const creepBoost = (han: number) => (CREEP_BOOST * han) / HAN_CREEP_TODAY;

/** entityScales (entityScale.ts) with other boosts: the same formula, so column 1 is the game's own. */
function scalesFor(tilePx: number, hero: number, creep: number): { hero: number; creep: number; tower: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const base = clamp(ENTITY_TILE_PX / Math.max(1, tilePx), 1, MAX_BASE_SCALE);
  const phone = clamp((ENTITY_TILE_PX - tilePx) / (ENTITY_TILE_PX - FULL_BOOST_TILE_PX), 0, 1);
  return { hero: base * (1 + (hero - 1) * phone), creep: base * (1 + (creep - 1) * phone), tower: Math.min(base, MAX_TOWER_SCALE) };
}

/** Every pad of the four columns, top to bottom, West to East (the Spire's solo pads: 8, 5, 5, 8). */
const PLAN: [string, number][][] = [
  [['arrow', 3], ['flak', 1], ['arrow', 1], ['cannon', 2], ['frost', 1], ['arrow', 2], ['flak', 1], ['arrow', 1]],
  [['cannon', 3], ['frost', 1], ['arrow', 1], ['frost', 2], ['arrow', 1]],
  [['arcane', 3], ['arrow', 1], ['flak', 2], ['frost', 1], ['cannon', 1]],
  [['frost', 3], ['arrow', 1], ['flak', 3], ['frost', 1], ['arrow', 1], ['flak', 1], ['arrow', 1], ['frost', 1]],
];

/** Pixi's devtools hook: every Application the page makes, so the script can reach the stage. */
const INIT = 'globalThis.__sizeApps = []; globalThis.__PIXI_APP_INIT__ = (app) => globalThis.__sizeApps.push(app);';

async function buildAll(p: Page): Promise<void> {
  const cols = (await p.evaluate(`(() => {
    const t = window.__tdt; const m = t.map;
    const own = t.latest().pads.map((q) => ({ id: q.id, x: m.pads[q.id].x, y: m.pads[q.id].y }));
    const xs = [...new Set(own.map((q) => q.x))].sort((a, b) => a - b);
    return xs.map((x) => own.filter((q) => q.x === x).sort((a, b) => a.y - b.y)); })()`)) as { id: number; x: number; y: number }[][];
  if (cols.length !== PLAN.length || cols.some((c, i) => c.length !== PLAN[i]!.length))
    throw new Error(`the pads are not the plan's: ${cols.map((c) => c.length).join(', ')}`);
  // Every tower in one tick, then each tier's upgrades in one tick: the lab's 5,000 gold covers the plan (4,960). The
  // pack is round the Warden already, so the towers land on it within a few ticks.
  const all = cols.flatMap((c, i) => c.map((pad, j) => ({ id: pad.id, kind: PLAN[i]![j]![0], tier: PLAN[i]![j]![1] })));
  await p.evaluate((list) => {
    for (const q of list) (window as any).__tdt.command({ type: 'build', padId: q.id, tower: q.kind });
  }, all);
  await p.waitForFunction((n) => (window as any).__tdt.latest().towers.length >= n, all.length, { polling: 'raf' });
  for (const tier of [2, 3]) {
    const ids = all.filter((q) => q.tier >= tier).map((q) => q.id);
    await p.evaluate((list) => {
      const t = (window as any).__tdt;
      for (const id of list) t.command({ type: 'upgrade', towerId: t.latest().towers.find((w: any) => w.padId === id).id });
    }, ids);
    await p.waitForFunction(
      ([list, n]) => list.every((id) => (window as any).__tdt.latest().towers.find((w: any) => w.padId === id)?.tier >= n),
      [ids, tier] as const,
      { polling: 'raf' },
    );
  }
}

/** The West lane's point at row `y` (tiles), from the map's own waypoints. */
async function westLane(p: Page, y: number): Promise<{ x: number; y: number }> {
  return (await p.evaluate((row) => {
    const w = (window as any).__tdt.map.lanes[0].waypoints as { x: number; y: number }[];
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1]!;
      const b = w[i]!;
      if ((row - a.y) * (row - b.y) <= 0 && a.y !== b.y) return { x: a.x + ((b.x - a.x) * (row - a.y)) / (b.y - a.y), y: row };
    }
    return { x: w[0]!.x, y: row };
  }, y)) as { x: number; y: number };
}

/** Walks the Warden to `at` and waits for him there. */
async function walk(p: Page, at: { x: number; y: number }): Promise<void> {
  await p.evaluate((q) => (window as any).__tdt.command({ type: 'move', x: q.x, y: q.y }), at);
  await p.waitForFunction(
    (q) => {
      const h = (window as any).__tdt.latest().heroes[0];
      return h.hp > 0 && Math.hypot(h.x - q.x, h.y - q.y) < 0.6;
    },
    at,
    { timeout: 60_000 },
  );
}

/**
 * Starts `wave` and pauses once the Warden has creeps round him: at least `count` ground creeps within `r` tiles, a
 * Brute among them, and a `need` among them too when one is named.
 */
async function holdPack(p: Page, wave: number, count: number, r: number, need: string | null, before?: () => Promise<void>): Promise<void> {
  // A pack forms most waves; when one does not (the towers took it first), the wave is started again.
  for (let attempt = 1; ; attempt++) {
    await p.evaluate((w) => (window as any).__tdt.skipTo(w), wave);
    try {
      await p.waitForFunction(
        ([w, n, rr, k]) => {
          const s = (window as any).__tdt.latest();
          const h = s.heroes[0];
          if (s.wave !== w || !h || h.hp <= 0) return false;
          const near = s.creeps.filter((c: any) => c.hp > 0 && c.kind !== 'wisp' && Math.hypot(c.x - h.x, c.y - h.y) < rr);
          return near.length >= n && near.some((c: any) => c.kind === 'brute') && (!k || near.some((c: any) => c.kind === k));
        },
        [wave, count, r, need] as const,
        { timeout: 45_000, polling: 50 },
      );
      break;
    } catch (e) {
      const s = await p.evaluate(() => {
        const t = (window as any).__tdt.latest();
        const h = t.heroes[0];
        return { wave: t.wave, hero: h && { x: +h.x.toFixed(1), y: +h.y.toFixed(1), hp: h.hp }, creeps: t.creeps.length };
      });
      console.error(`wave ${wave}, attempt ${attempt}: no pack round the Warden yet`, JSON.stringify(s));
      if (attempt >= 6) throw e;
      if (!s.hero || s.hero.hp <= 0) await p.waitForFunction(() => (window as any).__tdt.latest().heroes[0].hp > 0, undefined, { timeout: 60_000 });
    }
  }
  if (before) await before();
  await p.evaluate(() => (window as any).__tdt.pause(true));
  await p.waitForTimeout(700);
  for (const b of await p.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
}

interface Applied {
  towers: { id: number; kind: string; tier: number; branch: string | null; x: number; y: number; scale: number }[];
  found: { towers: number; heart: number; portals: number };
}

/**
 * Draws the held frame at `o`'s sizes: the towers', the Heart's and the portals' roots get their factor about their
 * ground points, the hero (and the creeps) their scales. Returns each tower's drawn scale.
 */
async function apply(p: Page, o: Option, tilePx: number, creepHan = HAN_CREEP_TODAY): Promise<Applied> {
  const sc = scalesFor(tilePx, heroBoost(o), creepBoost(creepHan));
  await p.evaluate((s) => (window as any).__tdt.scales(s), sc);
  const found = await p.evaluate(
    ([k]) => {
      const g = globalThis as any;
      const t = g.__tdt;
      const S = 32;
      const cos = t.view().cos;
      const m = t.map;
      const snap = t.latest();
      const app = g.__sizeApps.filter((a: any) => a.canvas?.isConnected).pop();
      if (!app) throw new Error('no Pixi app on the page');
      const targets: { what: 'tower' | 'heart' | 'portal'; x: number; y: number; tol: number }[] = [
        ...snap.towers.map((w: any) => ({ what: 'tower' as const, x: w.x * S, y: w.y * S * cos, tol: 0.5 })),
        { what: 'heart' as const, x: m.heart.x * S, y: m.heart.y * S * cos, tol: 6 },
        ...m.lanes.map((l: any) => ({ what: 'portal' as const, x: l.waypoints[0].x * S, y: (l.waypoints[0].y + 1) * S * cos, tol: 0.5 })),
      ];
      const size = (c: any): number => 1 + (c.children ?? []).reduce((a: number, ch: any) => a + size(ch), 0);
      const all: any[] = [];
      const walkTree = (c: any) => {
        all.push(c);
        for (const ch of c.children ?? []) walkTree(ch);
      };
      walkTree(app.stage);
      const counts = { towers: 0, heart: 0, portals: 0 };
      for (const tg of targets) {
        let best: any = null;
        for (const c of all) {
          if (!c.children?.length || !c.parent || c.parent.children.length < 10) continue;
          if (Math.abs(c.x - tg.x) > tg.tol || Math.abs(c.y - tg.y) > tg.tol) continue;
          if (!best || size(c) > size(best)) best = c;
        }
        if (!best) continue;
        counts[tg.what === 'tower' ? 'towers' : tg.what === 'heart' ? 'heart' : 'portals']++;
        const factor = tg.what === 'tower' ? k.tower : tg.what === 'heart' ? k.heart : k.portal;
        if (!best.__sizeSet) {
          const pt = best.scale;
          const orig = pt.set;
          best.__sizeSet = orig;
          best.__sizeK = 1;
          pt.set = function (x = 0, y = x) {
            return orig.call(this, x * best.__sizeK, y * best.__sizeK);
          };
          best.__sizeBase = pt.x;
        }
        best.__sizeK = factor;
        // The renderer sets a tower's scale every frame; the Heart's and the portals' roots stay at 1.
        if (tg.what !== 'tower') best.scale.set(best.__sizeBase);
        best.__sizeWhat = tg.what;
      }
      return counts;
    },
    [o] as const,
  );
  await p.waitForTimeout(450);
  const towers = (await p.evaluate(() => {
    const g = globalThis as any;
    const S = 32;
    const cos = g.__tdt.view().cos;
    const app = g.__sizeApps.filter((a: any) => a.canvas?.isConnected).pop();
    const roots: any[] = [];
    const walkTree = (c: any) => {
      if (c.__sizeWhat === 'tower') roots.push(c);
      for (const ch of c.children ?? []) walkTree(ch);
    };
    walkTree(app.stage);
    return g.__tdt.latest().towers.map((w: any) => {
      const r = roots.find((c) => Math.abs(c.x - w.x * S) < 0.5 && Math.abs(c.y - w.y * S * cos) < 0.5);
      return { id: w.id, kind: w.kind, tier: w.tier, branch: w.branch, x: w.x, y: w.y, scale: r ? r.scale.x : NaN };
    });
  })) as Applied['towers'];
  return { towers, found };
}

/** The camera, the layout and the HUD's edges, as the frame is drawn (CSS px). */
async function frameInfo(p: Page): Promise<{
  zoom: number;
  minZoom: number;
  cos: number;
  tilePx: number;
  dpr: number;
  barBottom: number;
  zoomButton: { top: number; bottom: number; left: number; right: number } | null;
  camera: { x: number; y: number; viewW: number; viewH: number };
  warden: { x: number; y: number };
}> {
  return (await p.evaluate(() => {
    const t = (window as any).__tdt;
    const bar = document.querySelector('#topbar')?.getBoundingClientRect();
    const zb = document.querySelector('#zoom-btn');
    const z = zb && zb.getBoundingClientRect().width > 0 ? zb.getBoundingClientRect() : undefined;
    const h = t.latest().heroes[0];
    return {
      zoom: t.camera.zoom,
      minZoom: t.camera.minZoom,
      cos: t.view().cos,
      tilePx: t.layout().tilePx,
      dpr: devicePixelRatio,
      barBottom: bar ? bar.bottom : 0,
      zoomButton: z ? { top: z.top, bottom: z.bottom, left: z.left, right: z.right } : null,
      camera: { x: t.camera.x, y: t.camera.y, viewW: t.camera.viewW, viewH: t.camera.viewH },
      warden: t.camera.worldToScreen(h.x * 32, h.y * 32),
    };
  })) as any;
}

/** The opaque silhouette (alpha 200 and up, as TOWER_REACH is measured) of a sheet cell: px from its anchor. */
interface Box {
  up: number;
  down: number;
  left: number;
  right: number;
}

/** Measures the Heart's, the portal's, the Warden's and the creeps' silhouettes on their sheets, in a page. */
async function measureSheets(browser: Browser): Promise<Record<string, Box & { res: number }>> {
  const structures = JSON.parse(readFileSync(join(art3d, 'structures.json'), 'utf8')).match;
  const warden = JSON.parse(readFileSync(join(art3d, 'warden.json'), 'utf8')).match;
  const cells: { key: string; file: string; x: number; y: number; w: number; h: number; ax: number; ay: number; res: number }[] = [];
  for (const key of ['heart/stage0', 'portal/body']) {
    const c = structures.cells[key];
    cells.push({ key, file: structures.pages[c.page].file, x: c.x, y: c.y, w: c.w, h: c.h, ax: c.ax, ay: c.ay, res: c.res ?? structures.res });
  }
  for (const v of ['1', '3']) {
    const c = structures.cells[`arrow/${v}/base`];
    cells.push({ key: `arrow/${v}/base`, file: structures.pages[c.page].file, x: c.x, y: c.y, w: c.w, h: c.h, ax: c.ax, ay: c.ay, res: c.res ?? structures.res });
  }
  const idle = warden.layers.body.kinds.idle;
  const f0 = warden.frames.body.idle[0];
  cells.push({ key: 'warden/idle', file: warden.file, x: f0.x, y: f0.y, w: idle.w, h: idle.h, ax: idle.ax, ay: idle.ay, res: warden.res });
  for (const kind of ['grunt', 'brute', 'runner']) cells.push({ key: `${kind}/idle`, ...creepFrame(kind) });
  const files = [...new Set(cells.map((c) => c.file))];
  const data: Record<string, string> = {};
  for (const f of files) {
    const type = f.endsWith('.png') ? 'image/png' : 'image/webp';
    data[f] = `data:${type};base64,${readFileSync(join(art3d, f)).toString('base64')}`;
  }
  const page = await plainPage(browser);
  const out = (await page.evaluate(
    async ([cs, d]) => {
      const imgs: Record<string, ImageBitmap> = {};
      for (const [f, url] of Object.entries(d)) imgs[f] = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none' });
      const res: Record<string, any> = {};
      for (const c of cs) {
        const cv = new OffscreenCanvas(c.w, c.h);
        const g = cv.getContext('2d')!;
        g.drawImage(imgs[c.file]!, -c.x, -c.y);
        const a = g.getImageData(0, 0, c.w, c.h).data;
        let x0 = c.w;
        let y0 = c.h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < c.h; y++)
          for (let x = 0; x < c.w; x++)
            if (a[(y * c.w + x) * 4 + 3]! >= 200) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        res[c.key] = { up: (c.ay - y0) / c.res, down: (y1 + 1 - c.ay) / c.res, left: (c.ax - x0) / c.res, right: (x1 + 1 - c.ax) / c.res, res: c.res };
      }
      return res;
    },
    [cells, data] as const,
  )) as Record<string, Box & { res: number }>;
  await page.context().close();
  return out;
}

/**
 * The strip: the Warden, a Grunt and a Brute idle, side by side on one baseline, each drawn from its match sheet at the
 * phone's 2× pixels and the scale the game draws it at in that column (`scales` × the camera's zoom), on the grass.
 */
async function composeStrip(browser: Browser, zoom: number, cells: { hero: number; creep: number }[]): Promise<Buffer[]> {
  const warden = JSON.parse(readFileSync(join(art3d, 'warden.json'), 'utf8')).match;
  const idle = warden.layers.body.kinds.idle;
  const f0 = warden.frames.body.idle[0];
  const figs: { key: string; file: string; x: number; y: number; w: number; h: number; res: number; unit: 'hero' | 'creep' }[] = [
    { key: 'grunt', ...creepFrame('grunt'), unit: 'creep' },
    { key: 'warden', file: warden.file, x: f0.x, y: f0.y, w: idle.w, h: idle.h, res: warden.res, unit: 'hero' },
    { key: 'brute', ...creepFrame('brute'), unit: 'creep' },
  ];
  const data: Record<string, string> = {};
  for (const f of new Set(figs.map((q) => q.file))) data[f] = `data:${f.endsWith('.png') ? 'image/png' : 'image/webp'};base64,${readFileSync(join(art3d, f)).toString('base64')}`;
  const page = await plainPage(browser);
  const urls = (await page.evaluate(
    async ([fs, d, cs, z]) => {
      const imgs: Record<string, ImageBitmap> = {};
      for (const [f, url] of Object.entries(d)) imgs[f] = await createImageBitmap(await (await fetch(url)).blob());
      // Each figure's opaque box in its cell (alpha 200 and up), so the feet stand on one line.
      const box = (q: (typeof fs)[number]) => {
        const cv = new OffscreenCanvas(q.w, q.h);
        const g = cv.getContext('2d')!;
        g.drawImage(imgs[q.file]!, -q.x, -q.y);
        const a = g.getImageData(0, 0, q.w, q.h).data;
        let x0 = q.w, x1 = 0, y0 = q.h, y1 = 0;
        for (let y = 0; y < q.h; y++)
          for (let x = 0; x < q.w; x++)
            if (a[(y * q.w + x) * 4 + 3]! >= 200) {
              x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
            }
        return { x0, x1, y0, y1 };
      };
      const boxes = fs.map(box);
      const out: string[] = [];
      for (const c of cs) {
        const W = 320;
        const H = 200;
        const base = 168;
        const cv = new OffscreenCanvas(W, H);
        const g = cv.getContext('2d')!;
        g.fillStyle = '#649440';
        g.fillRect(0, 0, W, H);
        g.imageSmoothingQuality = 'high';
        // Phone px at 2×: world px × the unit's scale × the camera's zoom × 2; a sheet px is 1 / res world px.
        const k = fs.map((q) => ((q.unit === 'hero' ? c.hero : c.creep) * z * 2) / q.res);
        const widths = fs.map((q, i) => (boxes[i]!.x1 - boxes[i]!.x0) * k[i]!);
        const gap = 10;
        let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (fs.length - 1)) / 2;
        fs.forEach((q, i) => {
          const b = boxes[i]!;
          const kk = k[i]!;
          g.fillStyle = 'rgba(20, 30, 10, 0.28)';
          g.beginPath();
          g.ellipse(x + widths[i]! / 2, base, widths[i]! * 0.42, widths[i]! * 0.12, 0, 0, Math.PI * 2);
          g.fill();
          g.drawImage(imgs[q.file]!, q.x + b.x0, q.y + b.y0, b.x1 - b.x0, b.y1 - b.y0, x, base - (b.y1 - b.y0) * kk, widths[i]!, (b.y1 - b.y0) * kk);
          x += widths[i]! + gap;
        });
        const blob = await cv.convertToBlob({ type: 'image/png' });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
        out.push(btoa(bin));
      }
      return out;
    },
    [figs, data, cells, zoom] as const,
  )) as string[];
  await page.context().close();
  return urls.map((u) => Buffer.from(u, 'base64'));
}

/** A creep kind's first idle frame on its sheet, with its anchor in the frame (the trimmed frame's offset taken off). */
function creepFrame(kind: string): { file: string; x: number; y: number; w: number; h: number; ax: number; ay: number; res: number } {
  const L = JSON.parse(readFileSync(join(art3d, `${kind}.json`), 'utf8')).match;
  const f = L.frames.idle[0];
  return { file: L.file, x: f.x, y: f.y, w: f.w, h: f.h, ax: L.box.ax - f.dx, ay: L.box.ay - f.dy, res: L.res };
}

/** A blank page for drawing in, with esbuild's `__name` helper defined (tsx adds calls to it in page functions). */
async function plainPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  const page = await ctx.newPage();
  await page.goto('about:blank');
  return page;
}

interface Shot {
  png: Buffer;
  info: Awaited<ReturnType<typeof frameInfo>>;
  applied: Applied;
}

async function heldDevice(browser: Browser, url: string, device: Device): Promise<{ shots: Shot[] }> {
  const viewport = device === 'desktop' ? { width: 1280, height: 720 } : undefined;
  const p = await openHeld(browser, device, url, { hero: 'warden', viewport, init: INIT });
  const tilePx = (await frameInfo(p)).tilePx;
  // A mid-match Warden (his size does not change with his level; his HP keeps him standing in the pack).
  await p.evaluate(() => (window as any).__tdt.setLevel(8));
  await walk(p, await westLane(p, HOLD_ROW));
  // Wave 13: once a pack is round the Warden, every pad is built in three ticks and the match paused.
  await holdPack(p, 13, 4, 2.8, null, () => buildAll(p));
  // The towers' drop onto their pads plays out (the render runs while the simulation is held). A lane surge's flag
  // ("East · Surge now", when the seed puts one on wave 13) is hidden: it hangs over the portals the sheet compares.
  await p.addStyleTag({ content: '.surge-flag { display: none !important; }' });
  await p.waitForTimeout(1200);
  const shots: Shot[] = [];
  for (const o of OPTIONS) {
    const applied = await apply(p, o, tilePx);
    const png = await p.screenshot();
    shots.push({ png, info: await frameInfo(p), applied });
    if (framesDir) writeFileSync(join(framesDir, `${device}-${o.n}.png`), png);
    console.log(`${device} ${o.n}: ${applied.found.towers} towers, heart ${applied.found.heart}, ${applied.found.portals} portals`);
  }
  await p.context().close();
  return { shots };
}

/** A tower variant's numbers at one drawn scale (world px at scale 1 → tiles and phone px). */
function towerRow(kind: string, variant: string, scale: number, zoom: number, cos: number) {
  const top = TOWER_TOP[kind as keyof typeof TOWER_TOP][variant]!;
  const structures = JSON.parse(readFileSync(join(art3d, 'structures.json'), 'utf8')).match;
  const side = structures.towers[`${kind}/${variant}`].side as number;
  const down = structures.towers[`${kind}/${variant}`].down as number;
  const rise = top * scale;
  // Past its own pad's back edge (towerRise), then over the 1-tile walk to the pad behind's front edge.
  const back = PAD_HALF_PX * cos;
  const gap = 32 * cos;
  const behind = Math.max(0, rise - back - gap);
  return {
    kind,
    variant,
    scale: +scale.toFixed(3),
    roofTiles: +(rise / 32).toFixed(2),
    roofPx: +(rise * zoom).toFixed(1),
    tallPx: +((top + down) * scale * zoom).toFixed(1),
    widthOfPad: +((2 * side * scale) / (2 * PAD_HALF_PX)).toFixed(2),
    widthPx: +(2 * side * scale * zoom).toFixed(1),
    overBehindPad: +(behind / 32 / cos).toFixed(2),
    overBehindShare: +(behind / (3 * 32 * cos)).toFixed(2),
  };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
try {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  const sheets = await measureSheets(browser);
  const phone = await heldDevice(browser, url, 'phone');
  const desktop = await heldDevice(browser, url, 'desktop');
  const stripCells = [...OPTIONS.map((o) => ({ o, creep: HAN_CREEP_TODAY })), { o: OPTIONS[2], creep: CREEP_3 }].map(({ o, creep }) =>
    scalesFor(phone.shots[0]!.info.tilePx, heroBoost(o), creepBoost(creep)),
  );
  const strip = await composeStrip(browser, phone.shots[0]!.info.zoom, stripCells);
  if (framesDir) strip.forEach((b, i) => writeFileSync(join(framesDir, `strip-${i + 1}.png`), b));

  // The numbers, per column, on the phone (CSS px at the fit; device px on a 2.625× Pixel 7 and a 3× phone).
  const measures = OPTIONS.map((o, i) => {
    const shot = phone.shots[i]!;
    const { zoom, cos, tilePx, barBottom, zoomButton } = shot.info;
    const sc = scalesFor(tilePx, heroBoost(o), creepBoost(HAN_CREEP_TODAY));
    const towerAt = (kind: string, variant: string) => {
      const reach = TOWER_REACH[kind as keyof typeof TOWER_REACH][variant]!;
      return Math.min(sc.tower, PAD_HALF_PX / reach) * o.tower;
    };
    const kinds = ['arrow', 'cannon', 'frost', 'arcane', 'flak'];
    const towers = kinds.flatMap((k) => ['1', '3'].map((v) => towerRow(k, v, towerAt(k, v), zoom, cos)));
    const heart = sheets['heart/stage0']!;
    const portal = sheets['portal/body']!;
    const warden = sheets['warden/idle']!;
    const heartPx = (heart.up + heart.down) * o.heart * zoom;
    const portalPx = (portal.up + portal.down) * o.portal * zoom;
    const wardenPx = (warden.up + warden.down) * sc.hero * zoom;
    const t1 = towers.filter((t) => t.variant === '1');
    const t3 = towers.filter((t) => t.variant === '3');
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    // A tower's drawn height on screen: its silhouette, from its base's lowest point to its roof.
    const towerTall = (rows: typeof towers) => mean(rows.map((t) => t.tallPx));
    // The top row: the tier-3 Arrow's roof (the tallest) on the first row of pads, against the bar and the ⤢ button.
    const top = shot.applied.towers.filter((t) => t.y === Math.min(...shot.applied.towers.map((q) => q.y)));
    const cam = shot.info.camera;
    const toScreenY = (vy: number) => (vy - cam.y) * zoom + cam.viewH / 2;
    const toScreenX = (vx: number) => (vx - cam.x) * zoom + cam.viewW / 2;
    const topRow = top.map((t) => {
      const v = towerVariant(t.tier, t.branch as never);
      const roof = toScreenY(t.y * 32 * cos - TOWER_TOP[t.kind as keyof typeof TOWER_TOP][v]! * t.scale);
      const x = toScreenX(t.x * 32);
      const half = TOWER_REACH[t.kind as keyof typeof TOWER_REACH][v]! * t.scale * zoom;
      // The ⤢ button (top right, under the bar): how far the roof reaches into it, if the two overlap across.
      const underButton = zoomButton && x + half > zoomButton.left && x - half < zoomButton.right ? +(zoomButton.bottom - roof).toFixed(1) : null;
      return { kind: t.kind, tier: t.tier, roofY: +roof.toFixed(1), clearsBar: +(roof - barBottom).toFixed(1), underButton, x: +x.toFixed(1) };
    });
    const portalTop = toScreenY(1.5 * 32 * cos - portal.up * o.portal);
    const crisp = (s: number) => ({
      fit: { pixel7: +(zoom * 2.625 * s).toFixed(2), x3: +(zoom * 3 * s).toFixed(2) },
      pinch: { pixel7: +(zoom * 1.8 * 2.625 * s).toFixed(2), x3: +(zoom * 1.8 * 3 * s).toFixed(2) },
    });
    return {
      n: o.n,
      asked: o,
      boosts: { hero: +heroBoost(o).toFixed(4), creep: CREEP_BOOST },
      scales: { hero: +sc.hero.toFixed(3), creep: +sc.creep.toFixed(3), towerLayout: +sc.tower.toFixed(3) },
      phone: { zoom: +zoom.toFixed(4), tilePx: +tilePx.toFixed(2), barBottom, zoomButton },
      towers,
      tier1: { roofTiles: +mean(t1.map((t) => t.roofTiles)).toFixed(2), roofPx: +mean(t1.map((t) => t.roofPx)).toFixed(1), widthOfPad: +mean(t1.map((t) => t.widthOfPad)).toFixed(2), tallPx: +towerTall(t1).toFixed(1) },
      tier3: { roofTiles: +mean(t3.map((t) => t.roofTiles)).toFixed(2), roofPx: +mean(t3.map((t) => t.roofPx)).toFixed(1), widthOfPad: +mean(t3.map((t) => t.widthOfPad)).toFixed(2), tallPx: +towerTall(t3).toFixed(1) },
      heart: { px: +heartPx.toFixed(1), tiles: +((heart.up + heart.down) * o.heart / 32).toFixed(2), widthPx: +((heart.left + heart.right) * o.heart * zoom).toFixed(1) },
      portal: { px: +portalPx.toFixed(1), tiles: +((portal.up + portal.down) * o.portal / 32).toFixed(2), widthPx: +((portal.left + portal.right) * o.portal * zoom).toFixed(1), topY: +portalTop.toFixed(1), clearsBar: +(portalTop - barBottom).toFixed(1) },
      warden: { px: +wardenPx.toFixed(1), tiles: +((warden.up + warden.down) * sc.hero / 32).toFixed(2) },
      creeps: Object.fromEntries(
        ['grunt', 'brute', 'runner'].map((k) => {
          const c = sheets[`${k}/idle`]!;
          return [k, { px: +((c.up + c.down) * sc.creep * zoom).toFixed(1), px3: +((c.up + c.down) * scalesFor(tilePx, heroBoost(o), creepBoost(CREEP_3)).creep * zoom).toFixed(1) }];
        }),
      ),
      topRow,
      crisp: { tier1Arrow: crisp(towerAt('arrow', '1')), tier3Cannon: crisp(towerAt('cannon', '3')), page: 2.75 },
    };
  });
  const base = measures[0]!;
  for (const m of measures) {
    const t = (m.tier1.tallPx + m.tier3.tallPx) / 2;
    (m as any).ratio = {
      tower: +(t / base.warden.px).toFixed(2),
      heart: +(m.heart.px / base.warden.px).toFixed(2),
      portal: +(m.portal.px / base.warden.px).toFixed(2),
      hero: +(m.warden.px / base.warden.px).toFixed(2),
      perHero: [t, m.heart.px, m.portal.px, m.warden.px].map((x) => +(x / m.warden.px).toFixed(2)),
    };
  }
  const desktopInfo = desktop.shots.map((s) => ({ zoom: +s.info.zoom.toFixed(4), tilePx: +s.info.tilePx.toFixed(2), found: s.applied.found }));
  mkdirSync(join(outDir, 'size-options'), { recursive: true });
  writeFileSync(join(outDir, 'size-options', 'measures.json'), JSON.stringify({ sheets, phone: measures, desktop: desktopInfo }, null, 2) + '\n');
  phone.shots.forEach((s, i) => writeFileSync(join(outDir, 'size-options', `${i + 1}.png`), s.png));

  // The sheet.
  const colW = 1280;
  const gap = 48;
  const b64 = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
  const table = (m: (typeof measures)[number]) => {
    const r = (m as any).ratio;
    const rows: [string, string][] = [
      ['Tower roof over its pad, tier 1 / tier 3', `${m.tier1.roofTiles} / ${m.tier3.roofTiles} tiles · ${m.tier1.roofPx} / ${m.tier3.roofPx} px`],
      ['Tower drawn tall (base to roof), tier 1 / 3', `${m.tier1.tallPx} / ${m.tier3.tallPx} px`],
      ['Tower width over pad width, tier 1 / 3', `${m.tier1.widthOfPad} / ${m.tier3.widthOfPad}`],
      ['Heart tall', `${m.heart.px} px`],
      ['Portal tall', `${m.portal.px} px`],
      ['Warden tall', `${m.warden.px} px`],
      ['Tower : Heart : portal : hero', r.perHero.join(' : ')],
      ['Tier-3 Arrow roof into the pad behind', `${m.towers.find((t) => t.kind === 'arrow' && t.variant === '3')!.overBehindPad} tiles`],
      ['Top row: highest roof under the 44 px bar', `${Math.min(...m.topRow.map((t) => t.clearsBar)).toFixed(1)} px`],
    ];
    return `<table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
  };
  const columns = OPTIONS.map(
    (o, i) => `<section><h1>${o.n}</h1><img class="phone" src="${b64(phone.shots[i]!.png)}" width="824" height="1678">
      <img class="desk" src="${b64(desktop.shots[i]!.png)}" width="1280" height="720">${table(measures[i]!)}</section>`,
  );
  const stripLabels = ['1', '2', '3', '3 · creeps a step smaller'];
  // Each cell is drawn at the phone's own 2× pixels and shown here 2.25× larger, so the figures read on the sheet.
  const stripHtml = strip.map((s, i) => `<figure><img src="${b64(s)}" width="720" height="450"><figcaption>${stripLabels[i]}</figcaption></figure>`);
  const page = await (await browser.newContext({ viewport: { width: colW * 3 + gap * 4, height: 1000 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; background: #11161a; color: #ece4cf; font: 500 26px/1.35 system-ui, sans-serif; }
    main { display: flex; gap: ${gap}px; padding: ${gap}px; }
    section { width: ${colW}px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
    h1 { margin: 0; font: 700 112px/1 system-ui, sans-serif; }
    img.phone { border-radius: 28px; }
    table { border-collapse: collapse; width: 100%; }
    td { padding: 6px 10px; border-top: 1px solid #2c3640; }
    td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .strip { display: flex; gap: ${gap}px; padding: 0 ${gap}px ${gap}px; justify-content: center; }
    figure { margin: 0; text-align: center; }
    figure img { display: block; border-radius: 16px; image-rendering: auto; }
    figcaption { margin-top: 10px; font-size: 40px; font-weight: 700; }
  </style></head><body><main>${columns.join('')}</main><div class="strip">${stripHtml.join('')}</div></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const out = join(outDir, 'size-options.png');
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  console.log(`${out} (${(readFileSync(out).length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(JSON.stringify(measures.map((m) => ({ n: m.n, tier1: m.tier1, tier3: m.tier3, heart: m.heart, portal: m.portal, warden: m.warden, ratio: (m as any).ratio, topRow: m.topRow })), null, 1));
} finally {
  await new Promise<void>((done) => server.httpServer.close(() => done()));
  await browser.close();
}
