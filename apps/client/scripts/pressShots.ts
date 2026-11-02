// The press stills and the store covers (Han, 2 Nov 2026: the game goes on itch.io, then Newgrounds and CrazyGames;
// docs/PRESS.md §2, docs/ART.md §14). Images only: nothing in the game changes.
//
//   npm run build:e2e -w @tdt/client && npm run press-shots -w @tdt/client [-- --only 1,3,covers] [--out DIR]
//     [--press DIR] [--work DIR]
//
// 1. The stills (docs/screenshots/press/): held moments of real matches on the e2e build in headless Chromium, on a
//    Pixel 7's whole screen (412 × 915 at DPR 2.625, touch) and on a 1280 × 800 desktop (DPR 2): Display Normal,
//    Graphics High (Auto drops to Low on the software GPU), the lesson skipped, the one-time lines already seen, every
//    3D sheet in and the HUD's rendered frames on (`data-ui="ready"`) before the first tap, and checked again at the
//    shot (`__tdt.art()`: the plate, the Heart, the portals, every tower, hero and creep from its 3D sheet; else the
//    shot fails). Each is written twice, WebP: `<n>-<what>.webp` at 1× (the CSS size) and `<n>-<what>@2x.webp` for
//    retina store pages (the canvas draws at 2× at most, `MAX_DPR`), each under 1 MB.
//      1 build-phase     Quick, solo, between waves 3 and 4: towers on the pads, the Ranger by the Mid road, a tier-2
//                        tower's ring open. `?lab` gold, spent on the towers, so the top bar shows what a player keeps.
//      2 boss-wave       Full wave 10 (`?lab&ult`, the gold spent, the Arcanist at level 7): the Ironhorn on the Mid
//                        road under its banner, the towers firing, the Arcanist fighting it, the Heart's rose pool. The
//                        banner is wave 10's own: the script starts wave 10 a second time once the first Ironhorn is
//                        down its road (the e2e `skipTo`), so the banner and the boss are in one frame.
//      3 meteor-rain     A room of two on a game server started here (apps/server; a bot teammate from
//                        apps/server/src/testing/botClient.ts, as the integration tests start one): the Ranger here, the
//                        Arcanist the bot, Quick. This process's copy of the tuning (the server's) gives each player the
//                        gold a Quick player has had by wave 3 and makes level 6 the first kill's XP, so both have R at
//                        level 6 within a minute; the waves are called early to wave 6. Both R at once: Meteor Rain on
//                        the three lanes and the combo ribbon, held as the strikes land.
//      4 rampart-slam    Full wave 8 (`?lab&ult`, the gold spent, the Warden at level 7): he taunts a pack on the Mid
//                        road and slams it: his guard ring and heal, the pack falling, "Rampart Slam: N".
//      5 victory         A won Quick match (waves played with their kills, then `__tdt.win()`), the stats counted up.
//      6 endless-board   Endless's "Today's top 10" card with ten made-up rows (`/endless/today` answered here, as
//                        e2e/lobby.spec.ts does), this browser's row pinned under them.
//      7 desktop-1280x800  The match at desktop size, Full wave 10, the Ironhorn down its road, the Warden fighting.
//    A frame is held: the simulation paused (solo), the page's CSS animations stopped and the canvas left on the frame it
//    drew last, so a flare or a banner is shot as it was. A frame with a lane surge's notice or a downed hero is played
//    again in another match (`Retry`).
//    Every frame was looked at before it was committed: a wrong moment (an empty lane, a toast over the action, the 2D
//    art) is a fail; shoot it again.
// 2. The covers (docs/press/), composed in headless Chromium from the game's own pictures: the heroes cut from their
//    stage posters (public/stage/<hero>-poster.webp against clearing.webp: the figure, and its shadow carried as shade),
//    a wide frame of the Spire's meadow in wave 10 (from shot 7's match, the HUD hidden, the camera at its closest), the
//    wordmark as the lobby draws it (style.css's `.logo.stage-logo`, read from the file). No text but the title.
//      heroes-banner.webp 2400 × 900, itch-cover-630x500.png, itch-cover-315x250.png, ng-thumb-2x1.png (1200 × 600),
//      ng-icon-1x1.png (512 × 512), cg-cover-16x9.png (1920 × 1080), cg-cover-1x1.png (1024 × 1024); then
//      press-sheet.png, every still and cover labelled, with each cover also at 160 px wide (a store's thumbnail).
//    The wordmark's font is the lobby's (`--title-font`: Palatino, else Book Antiqua, Georgia, serif): on a machine
//    with no Palatino the script maps it to TeX Gyre Pagella, Palatino's metric clone (Debian / Ubuntu:
//    `fonts-texgyre`), and says so when neither is there. Look at the result.
//
// `--only` takes the numbers and `covers` / `sheet` (the covers need shot 7's wide frame in --work, default
// apps/client/dist-press). Stills go to --out (default docs/screenshots/press), covers and the sheet to --press
// (default docs/press).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as netServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { TUNING } from '@tdt/sim';
import { build, preview, type PreviewServer } from 'vite';
import { decodePng, encodeIndexedPng } from './png';
import { quantize } from './quantize';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const path = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const out = path(arg('out', join(repo, 'docs', 'screenshots', 'press')));
const pressDir = path(arg('press', join(repo, 'docs', 'press')));
const work = path(arg('work', join(root, 'dist-press')));
const dist = join(root, 'dist-e2e');
const onlyArg = arg('only', '');
const only = new Set(onlyArg ? onlyArg.split(',') : ['1', '2', '3', '4', '5', '6', '7', 'covers', 'sheet']);

const PHONE = { width: 412, height: 915 };
const PHONE_DPR = 2.625;
const DESKTOP = { width: 1280, height: 800 };
const DESKTOP_DPR = 2;
/** Under this on disk, each still (both sizes). */
const MAX_BYTES = 1024 * 1024;
/** The settings a player who has played before has: the lesson skipped, the one-time lines seen, Display Normal. */
const SETTINGS = {
  quality: 'high',
  display: 'normal',
  tutorial: 'skipped',
  airLesson: 'seen',
  repairHint: 'seen',
  zoomHint: 'seen',
  endlessRoomLine: 'seen',
};
/** The stills, by number: file name and what is checked of the frame. */
const STILLS = {
  1: '1-build-phase',
  2: '2-boss-wave',
  3: '3-meteor-rain',
  4: '4-rampart-slam',
  5: '5-victory',
  6: '6-endless-board',
  7: '7-desktop-1280x800',
} as const;

mkdirSync(out, { recursive: true });
mkdirSync(pressDir, { recursive: true });
mkdirSync(work, { recursive: true });

/** A wrong moment that another match (another seed) may not have: the shot is taken again from the start. */
class Retry extends Error {}

type Pt = { x: number; y: number };
type Pad = { id: number; x: number; y: number };

// ---------------------------------------------------------------------------------------------------------------
// Pages and the shot
// ---------------------------------------------------------------------------------------------------------------

async function context(browser: Browser, desktop: boolean, extra: Record<string, string> = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: DESKTOP, deviceScaleFactor: DESKTOP_DPR, serviceWorkers: 'block' }
      : { viewport: PHONE, deviceScaleFactor: PHONE_DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block' },
  );
  // tsx names the functions it compiles (`__name`); the page has no such helper.
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript(
    ([settings, more]) => {
      const s = JSON.parse(localStorage.getItem('tdt.settings') ?? '{}');
      localStorage.setItem('tdt.settings', JSON.stringify({ ...s, ...settings }));
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    },
    [SETTINGS, extra] as const,
  );
  return ctx;
}

async function newPage(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  return page;
}

/** Every 3D sheet in and the HUD's frames on (the art chain's marks on `<html>`). */
async function artIn(page: Page): Promise<void> {
  await page.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', {
    timeout: 180_000,
  });
}

/** The frame shows the game's 3D art everywhere: the plate, the Heart, the portals, every tower, hero and creep. */
async function art3d(page: Page): Promise<void> {
  const a = (await page.evaluate(() => (window as any).__tdt.art())) as Record<string, unknown>;
  const bad: string[] = [];
  if (a.ground !== 'plate') bad.push(`ground ${a.ground}`);
  if (!a.heart3d) bad.push('the 2D Heart');
  if (a.portals3d !== 3) bad.push(`${a.portals3d} 3D portals`);
  if (a.tower3d !== a.towerRigs) bad.push(`${a.tower3d} of ${a.towerRigs} towers 3D`);
  if (a.hero3d !== a.heroRigs) bad.push(`${a.hero3d} of ${a.heroRigs} heroes 3D`);
  if (a.creep3d !== a.creepRigs) bad.push(`${a.creep3d} of ${a.creepRigs} creeps 3D`);
  if (a.display !== 'normal') bad.push(`Display ${a.display}`);
  if (bad.length) throw new Error(`fallback art in the frame: ${bad.join(', ')}`);
}

let encoder: Page | null = null;
/** A plain page that scales and encodes pictures (canvas, high-quality smoothing). */
async function encoderPage(browser: Browser): Promise<Page> {
  if (encoder) return encoder;
  const ctx = await browser.newContext();
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  encoder = await ctx.newPage();
  await encoder.setContent('<!doctype html><body></body>');
  await encoder.addScriptTag({
    content: `
      window.scaleTo = async (src, outs) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const res = [];
        for (const o of outs) {
          // Halve while more than twice too big, then the last step: each step's smoothing stays sharp.
          let cur = img, w = img.width, h = img.height;
          const sx = o.sx ?? 0, sy = o.sy ?? 0, sw = o.sw ?? w, sh = o.sh ?? h;
          let c0 = document.createElement('canvas');
          c0.width = sw; c0.height = sh;
          c0.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          cur = c0; w = sw; h = sh;
          while (w / 2 >= o.w && h / 2 >= o.h) {
            const c = document.createElement('canvas');
            c.width = Math.round(w / 2); c.height = Math.round(h / 2);
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(cur, 0, 0, c.width, c.height);
            cur = c; w = c.width; h = c.height;
          }
          const c = document.createElement('canvas');
          c.width = o.w; c.height = o.h;
          const g = c.getContext('2d');
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(cur, 0, 0, o.w, o.h);
          res.push(c.toDataURL(o.type, o.q));
        }
        return res;
      };`,
  });
  return encoder;
}

interface Out {
  w: number;
  h: number;
  type: 'image/webp' | 'image/png' | 'image/jpeg';
  q?: number;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
}
const dataUrl = (buf: Buffer, type = 'image/png') => `data:${type};base64,${buf.toString('base64')}`;
const fromDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function scale(browser: Browser, src: Buffer, outs: Out[]): Promise<Buffer[]> {
  const enc = await encoderPage(browser);
  const urls = (await enc.evaluate(([s, o]) => (window as any).scaleTo(s, o), [dataUrl(src), outs] as const)) as string[];
  return urls.map(fromDataUrl);
}

/** WebP at `w` × `h`, the best quality under MAX_BYTES. */
async function webpUnder(browser: Browser, src: Buffer, w: number, h: number): Promise<Buffer> {
  for (const q of [0.92, 0.88, 0.84, 0.8, 0.75, 0.7]) {
    const [buf] = await scale(browser, src, [{ w, h, type: 'image/webp', q }]);
    if (buf!.length < MAX_BYTES) return buf!;
  }
  throw new Error(`${w} × ${h} does not fit in ${MAX_BYTES} bytes`);
}

/** The shot: checked, then written at 1× and 2×; the capture itself is kept in --work for the sheet. */
async function shoot(page: Page, n: keyof typeof STILLS, opts: { art?: boolean } = {}): Promise<void> {
  if (opts.art !== false) await art3d(page);
  const png = await page.screenshot({ type: 'png' });
  const view = page.viewportSize()!;
  writeFileSync(join(work, `${STILLS[n]}.png`), png);
  const browser = page.context().browser()!;
  for (const [suffix, k] of [['', 1], ['@2x', 2]] as const) {
    const buf = await webpUnder(browser, png, view.width * k, view.height * k);
    const file = join(out, `${STILLS[n]}${suffix}.webp`);
    writeFileSync(file, buf);
    console.log(`${file}: ${view.width * k} × ${view.height * k}, ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Playing: the phone's touch, the desktop's mouse
// ---------------------------------------------------------------------------------------------------------------

const latest = (page: Page) => page.evaluate(() => (window as any).__tdt.latest()) as Promise<any>;
const worldOnScreen = (page: Page, x: number, y: number) =>
  page.evaluate((p) => (window as any).__tdt.camera.worldToScreen(p.x * 32, p.y * 32), { x, y }) as Promise<Pt>;

async function gotIt(page: Page): Promise<void> {
  for (const b of await page.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible().catch(() => false)) await b.click();
}

/** Solo from the home card: the hero and the mode, Play solo; then every sheet in. */
async function solo(page: Page, url: string, hero: string, mode: 'quick' | 'full', query = '?lab'): Promise<void> {
  await page.goto(`${url}${query}`);
  await page.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"]`).click();
  await page.locator(`#lobby-mode-home .mode-pick[data-mode="${mode}"]`).click();
  await page.locator('#lobby-offline').click();
  await page.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await artIn(page);
  await page.waitForTimeout(500);
}

/** This match's pads (owned by `me` or open), nearest first to each wanted spot. */
async function padsNear(page: Page, spots: Pt[]): Promise<Pad[]> {
  return (await page.evaluate((want) => {
    const t = (window as any).__tdt;
    const me = t.me();
    const mine = t.latest().pads.filter((p: any) => p.owner === null || p.owner === me).map((p: any) => t.map.pads[p.id]);
    const used = new Set<number>();
    return want.map((w: { x: number; y: number }) => {
      let best = null as any;
      for (const p of mine) {
        if (used.has(p.id)) continue;
        const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
        if (!best || d < best.d) best = { d, p };
      }
      used.add(best.p.id);
      return { id: best.p.id, x: best.p.x, y: best.p.y };
    });
  }, spots)) as Pad[];
}

const towerOn = (page: Page, padId: number) =>
  page.evaluate((id) => (window as any).__tdt.latest().towers.find((t: any) => t.padId === id) ?? null, padId) as Promise<any>;

/** A bare spot on the ground to tap a menu closed (beside the Heart). */
async function tapAway(page: Page): Promise<void> {
  const h = (await page.evaluate(() => (window as any).__tdt.map.heart)) as Pt;
  const p = await worldOnScreen(page, h.x + 4, h.y - 1);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(250);
}

type Plan = { at: Pt; kind: string; tier: number; branch?: string };

/** Phone: each tower from the radial menu on the pad nearest its spot, upgraded to its tier (and branch). */
async function buildPhone(page: Page, plan: Plan[]): Promise<Pad[]> {
  const pads = await padsNear(page, plan.map((p) => p.at));
  for (const [i, step] of plan.entries()) {
    const pad = pads[i]!;
    const tap = async () => {
      const p = await worldOnScreen(page, pad.x, pad.y);
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForTimeout(250);
    };
    const tier = async () => (await towerOn(page, pad.id))?.tier ?? 0;
    if ((await tier()) === 0) {
      const btn = page.locator(`.radial-btn[data-tower="${step.kind}"]`);
      for (let w = 0; w < 4 && !(await btn.isVisible()); w++) await tap();
      await btn.tap();
      for (let w = 0; w < 50 && (await tier()) < 1; w++) await page.waitForTimeout(100);
    }
    for (let t = (await tier()) + 1; t <= Math.min(step.tier, 3); t++) {
      const up = page.locator('.radial-btn[data-action="upgrade"]');
      for (let w = 0; w < 4 && !(await up.isVisible()); w++) await tap();
      await up.tap();
      for (let w = 0; w < 50 && (await tier()) < t; w++) await page.waitForTimeout(100);
    }
    if (step.branch) {
      const br = page.locator(`.radial-btn[data-action="branch"][data-branch="${step.branch}"]`);
      for (let w = 0; w < 4 && !(await br.isVisible()); w++) await tap();
      await br.tap();
      for (let w = 0; w < 50 && !(await towerOn(page, pad.id))?.branch; w++) await page.waitForTimeout(100);
    }
    const t = await towerOn(page, pad.id);
    if (process.env.PRESS_DEBUG) console.log('build', JSON.stringify(step), '→', pad.id, t ? `${t.kind} ${t.tier}${t.branch ? ' ' + t.branch : ''}` : 'none');
    if (!t || t.tier < Math.min(step.tier, 3)) throw new Error(`the ${step.kind} on pad ${pad.id} is ${t ? `tier ${t.tier}` : 'not built'}`);
    await gotIt(page);
    await tapAway(page);
  }
  return pads;
}

/** Spare pads low on the map's sides, for `spendDown`. */
const SPARE: Pt[] = [
  { x: 2.5, y: 25 },
  { x: 23.5, y: 25 },
  { x: 2.5, y: 29 },
  { x: 23.5, y: 29 },
  { x: 6, y: 32 },
  { x: 19, y: 32 },
  { x: 2.5, y: 33 },
  { x: 23.5, y: 33 },
];

/**
 * Phone: the gold spent as a player spends it (no "Gold is waiting" nudge, which speaks only of gold that buys
 * something): Arrows on the spare pads, then a tier on the towers under tier 3, until under an Arrow's price is left.
 */
async function spendDown(page: Page): Promise<void> {
  const cost = (kind: string, tier: number) => (TUNING.towers as any)[kind].tiers[tier - 1]?.cost as number | undefined;
  const me = await page.evaluate(() => (window as any).__tdt.me());
  const gold = async () => ((await latest(page)).players.find((p: any) => p.id === me)?.gold ?? 0) as number;
  const arrow = cost('arrow', 1)!;
  for (const at of SPARE) {
    if ((await gold()) < arrow) return;
    const [pad] = await padsNear(page, [at]);
    if (!pad || Math.hypot(pad.x - at.x, pad.y - at.y) > 1 || (await towerOn(page, pad.id))) continue;
    await buildPhone(page, [{ at, kind: 'arrow', tier: 1 }]);
  }
  for (let pass = 0; pass < 3; pass++) {
    const towers = ((await latest(page)).towers as any[]).filter((t) => t.owner === me && t.tier < 3);
    for (const t of towers) {
      const price = cost(t.kind, t.tier + 1);
      if (price === undefined || (await gold()) < price) continue;
      const pad = await page.evaluate((id) => (window as any).__tdt.map.pads[id], t.padId);
      await buildPhone(page, [{ at: { x: pad.x, y: pad.y }, kind: t.kind, tier: t.tier + 1 }]);
    }
    if ((await gold()) < arrow) return;
  }
}

/** Desktop: a left click on the pad and the tower's key (1–5), U for each tier, then Escape. */
async function buildDesktop(page: Page, plan: Plan[]): Promise<Pad[]> {
  const kinds = ['arrow', 'cannon', 'frost', 'arcane', 'flak'];
  const pads = await padsNear(page, plan.map((p) => p.at));
  for (const [i, step] of plan.entries()) {
    const pad = pads[i]!;
    const at = await worldOnScreen(page, pad.x, pad.y);
    const tier = async () => (await towerOn(page, pad.id))?.tier ?? 0;
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
    await page.keyboard.press(String(kinds.indexOf(step.kind) + 1));
    for (let w = 0; w < 50 && (await tier()) < 1; w++) await page.waitForTimeout(100);
    for (let t = 2; t <= step.tier; t++) {
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(150);
      await page.keyboard.press('u');
      for (let w = 0; w < 50 && (await tier()) < t; w++) await page.waitForTimeout(100);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  return pads;
}

const heroAt = (page: Page) =>
  page.evaluate(() => {
    const t = (window as any).__tdt;
    const h = t.latest().heroes.find((x: any) => x.owner === t.me());
    return { x: h.x, y: h.y };
  }) as Promise<Pt>;

/** Phone: the floating stick (a drag on the map, just over the controls) steers the hero to (x, y). */
async function walkTo(page: Page, x: number, y: number): Promise<void> {
  const l = (await page.evaluate(() => (window as any).__tdt.layout())) as { map: { left: number; right: number }; controls: { top: number } };
  const from = { x: (l.map.left + l.map.right) / 2, y: l.controls.top - 40 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, p: Pt) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ id: 7, x: p.x, y: p.y }] } as never);
  await touch('touchStart', from);
  let last = from;
  for (let i = 0; i < 200; i++) {
    const h = await heroAt(page);
    const dx = x - h.x;
    const dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) break;
    // Slower near the end (the stick's travel sets the speed), so it stops on the spot.
    const reach = d < 1.5 ? 22 : 42;
    last = { x: from.x + (dx / d) * reach, y: from.y + (dy / d) * reach };
    await touch('touchMove', last);
    await page.waitForTimeout(90);
  }
  await touch('touchEnd', last);
  await cdp.detach();
  await page.waitForTimeout(300);
}

/** Desktop: a right click on the spot. */
async function walkToDesktop(page: Page, x: number, y: number): Promise<void> {
  const p = await worldOnScreen(page, x, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  for (let i = 0; i < 100; i++) {
    const h = await heroAt(page);
    if (Math.hypot(h.x - x, h.y - y) < 0.8) break;
    await page.waitForTimeout(100);
  }
}

/** Waits until `fn` (a page expression) is true, putting cards away as a player would. */
async function until(page: Page, what: string, fn: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await page.evaluate(fn))) {
    if (process.env.PRESS_DEBUG && Math.random() < 0.05) {
      const s = await latest(page);
      console.log(`  …${what}: wave ${s.wave} heart ${s.heartHp} creeps ${s.creeps.length} next ${s.nextWaveIn} gold ${s.players[0]?.gold}`);
    }
    if (Date.now() > end) {
      // What the match looked like, for the next try.
      await page.screenshot({ path: join(work, 'timeout.png') });
      const s = await latest(page);
      const summary = { wave: s.wave, phase: s.phase, heart: s.heartHp, creeps: s.creeps.map((c: any) => `${c.kind}@${c.x.toFixed(1)},${c.y.toFixed(1)}`) };
      throw new Error(`timed out waiting for ${what}: ${JSON.stringify(summary)} (${join(work, 'timeout.png')})`);
    }
    await gotIt(page);
    await page.waitForTimeout(200);
  }
}

const skipTo = (page: Page, wave: number) => page.evaluate((w) => (window as any).__tdt.skipTo(w), wave);
const pause = (page: Page, on: boolean) => page.evaluate((v) => (window as any).__tdt.pause(v), on);

/**
 * The held moment: the simulation paused (solo), the HUD's CSS animations stopped where they are and the canvas left
 * on the frame it drew last (no more animation frames), so a flare, a banner or a popup is shot as it was at this
 * instant: a screenshot at 2.625× on a software GPU takes a second or two, longer than most effects last.
 */
async function hold(page: Page, sim = true): Promise<void> {
  await page.evaluate((s) => {
    const w = window as any;
    if (s) w.__tdt.pause(true);
    for (const a of document.getAnimations()) a.pause();
    w.__pressRaf ??= window.requestAnimationFrame;
    w.__pressFrames = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback) => (w.__pressFrames.push(cb), 0);
  }, sim);
  await page.waitForTimeout(150);
}

/** The canvas drawing again (the simulation stays paused): for a second frame of the same moment. */
async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (!w.__pressRaf) return;
    window.requestAnimationFrame = w.__pressRaf;
    // The frames asked for while held (Pixi's ticker among them) go out now.
    for (const cb of w.__pressFrames ?? []) window.requestAnimationFrame(cb);
    w.__pressFrames = [];
  });
}

/** Desktop: the skill points spent (the "+" over each skill, Shift + its key). */
async function learnDesktop(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const s = await latest(page);
    const me = await page.evaluate(() => (window as any).__tdt.me());
    const h = s.heroes.find((x: any) => x.owner === me);
    const slot = ['R', 'Q', 'W', 'E'].find((k) => h?.skills.find((x: any) => x.slot === k)?.learnable);
    if (!slot) return;
    await page.keyboard.press(`Shift+${slot}`);
    await page.waitForTimeout(250);
  }
}

/** Toasts and the gold nudge put away from the frame: none showing (waits up to `ms`). */
async function noToast(page: Page, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll('#toasts > *')].some((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05;
      }),
    );
    if (!shown) return;
    await page.waitForTimeout(250);
  }
}

/**
 * Holds the frame (as `hold`) `ms` after an element matching `selector` is put in the page, from inside the page so the
 * moment is not late by a round trip; `held` resolves once it is held. On a page this busy (a software GPU at 2.625×)
 * an element's CSS animation starts frames late and its clock runs behind, so at the hold the element's own animation
 * is brought to `settle` ms in (an entrance shown as it stands a moment later; the world is the held instant).
 */
async function armHold(
  page: Page,
  selector: string,
  ms: number,
  settle = 0,
  clock: 'wall' | 'animation' = 'wall',
): Promise<{ held: () => Promise<void> }> {
  await page.evaluate(
    ([sel, delay, to, byAnimation]) => {
      const w = window as any;
      w.__pressHeld = false;
      const freeze = () => {
        w.__tdt.pause?.(true);
        const el = document.querySelector(sel as string);
        for (const a of document.getAnimations()) a.pause();
        // The element's own animation set to `settle` ms in: what the page reads of it runs behind what the
        // compositor already shows, so a fade or an entrance is pinned where it stands in full.
        if ((to as number) > 0) for (const a of el?.getAnimations() ?? []) a.currentTime = to as number;
        w.__pressRaf ??= window.requestAnimationFrame;
        w.__pressFrames = [];
        window.requestAnimationFrame = (cb) => (w.__pressFrames.push(cb), 0);
        w.__pressHeld = true;
      };
      // By the element's own animation: `delay` ms into it (on this page it runs behind the wall clock).
      const due = () => {
        const el = document.querySelector(sel as string);
        const own = el?.getAnimations().filter((x) => (x as CSSAnimation).animationName !== undefined)[0];
        if (own && Number(own.currentTime ?? 0) >= (delay as number)) freeze();
        else setTimeout(due, 8);
      };
      const seen = new MutationObserver(() => {
        if (!document.querySelector(sel as string)) return;
        seen.disconnect();
        if (byAnimation) due();
        else setTimeout(freeze, delay as number);
      });
      seen.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    },
    [selector, ms, settle, clock === 'animation'] as const,
  );
  return {
    held: async () => {
      try {
        await page.waitForFunction(() => (window as any).__pressHeld === true, undefined, { timeout: 10_000 });
      } catch {
        await page.screenshot({ path: join(work, 'timeout.png') });
        const why = await page.evaluate(() => {
          const t = (window as any).__tdt;
          const h = t.latest().heroes.find((x: any) => x.owner === t.me());
          const r = h?.skills.find((k: any) => k.slot === 'R');
          return `alive ${h?.alive}, R rank ${r?.rank} cooldown ${r?.cooldown}, sent ${JSON.stringify(t.sent.slice(-3))}`;
        });
        throw new Retry(`${selector} never came (${why}; ${join(work, 'timeout.png')})`);
      }
      await page.waitForTimeout(150);
    },
  };
}

/** Your hero alive, and no lane surge announced (its chip over the Mid portal, its toast): else another match. */
async function clean(page: Page): Promise<void> {
  const s = await latest(page);
  const me = await page.evaluate(() => (window as any).__tdt.me());
  if (!s.heroes.find((h: any) => h.owner === me)?.alive) throw new Retry('your hero is down');
  if (s.nextSurge || s.surgeLane != null) throw new Retry('a lane surge is announced');
}

/** Taps a skill button (smart cast). */
const castSlot = (page: Page, slot: 'Q' | 'W' | 'E' | 'R') => cast(page, slot);
async function cast(page: Page, slot: 'Q' | 'W' | 'E' | 'R'): Promise<void> {
  const b = page.locator(`.tskill[data-slot="${slot}"] .tskill-btn`);
  const box = (await b.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** Spends the hero's skill points as a player does (R first when it can be learned), so no "+" shows. */
async function learnAll(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const plus = page.locator('.tskill:not(.hidden) .learn:not(.hidden)');
    const n = await plus.count();
    let tapped = false;
    for (const slot of ['R', 'Q', 'W', 'E']) {
      const b = page.locator(`.tskill[data-slot="${slot}"] .learn:not(.hidden)`);
      if (n > 0 && (await b.isVisible().catch(() => false))) {
        await b.tap();
        await page.waitForTimeout(250);
        tapped = true;
        break;
      }
    }
    if (!tapped) return;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The stills
// ---------------------------------------------------------------------------------------------------------------

/** Lane roads' x on Spire (the map's lanes: their waypoints' columns), for spots by a road. */
const ROAD = { west: 6, mid: 13, east: 20 };

/** A map of towers worth about the lab's 5,000 gold, so the top bar shows what a player has left (a few hundred). */
const BUILT: Plan[] = [
  { at: { x: 9, y: 21 }, kind: 'arrow', tier: 3 },
  { at: { x: 16, y: 21 }, kind: 'arrow', tier: 3 },
  { at: { x: 9, y: 17 }, kind: 'arcane', tier: 2 },
  { at: { x: 16, y: 17 }, kind: 'frost', tier: 2 },
  { at: { x: 9, y: 13 }, kind: 'cannon', tier: 2 },
  { at: { x: 16, y: 13 }, kind: 'arrow', tier: 2 },
  { at: { x: 9, y: 9 }, kind: 'flak', tier: 2 },
  { at: { x: 16, y: 9 }, kind: 'cannon', tier: 2 },
  { at: { x: 2.5, y: 9 }, kind: 'arrow', tier: 2 },
  { at: { x: 2.5, y: 13 }, kind: 'cannon', tier: 2 },
  { at: { x: 2.5, y: 17 }, kind: 'frost', tier: 1 },
  { at: { x: 2.5, y: 21 }, kind: 'arrow', tier: 2 },
  { at: { x: 23.5, y: 9 }, kind: 'arrow', tier: 2 },
  { at: { x: 23.5, y: 13 }, kind: 'arcane', tier: 2 },
  { at: { x: 23.5, y: 17 }, kind: 'flak', tier: 1 },
  { at: { x: 23.5, y: 21 }, kind: 'arrow', tier: 2 },
  { at: { x: 6, y: 28 }, kind: 'cannon', tier: 3 },
  { at: { x: 19, y: 28 }, kind: 'arcane', tier: 2 },
];

async function shot1(browser: Browser, url: string): Promise<void> {
  const ctx = await context(browser, false);
  const page = await newPage(ctx);
  await solo(page, url, 'ranger', 'quick');
  await buildPhone(page, BUILT);
  // The Ranger at the Mid road, just above where the roads meet.
  await walkTo(page, ROAD.mid - 1.4, 25);
  await skipTo(page, 3);
  // Wave 3 out and cleared, wave 4 still to come: the build phase between them.
  const between = `(() => { const s = window.__tdt.latest(); return s.wave === 3 && s.creeps.length === 0 && s.nextWaveIn > 8 * s.tickRate && s.nextWaveIn < 32 * s.tickRate; })()`;
  await until(page, 'the gap between waves 3 and 4', between, 120_000);
  await learnAll(page);
  await noToast(page, 4000);
  // A tower's ring open: a tier-2 Arrow by the Mid road (its Upgrade, Target and Sell).
  const [pad] = await padsNear(page, [{ x: 16, y: 13 }]);
  const p = await worldOnScreen(page, pad!.x, pad!.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForSelector('.radial[data-menu="tower"]:not(.hidden) .radial-btn');
  await page.waitForTimeout(500);
  await pause(page, true);
  await page.waitForTimeout(400);
  const s = await latest(page);
  if (s.wave !== 3 || s.creeps.length !== 0 || s.nextWaveIn <= 0) throw new Error(`not between waves 3 and 4: wave ${s.wave}`);
  await shoot(page, 1);
  await ctx.close();
}

/** A wave-10 map, about the lab's 5,000 gold too, laid out otherwise than shot 1's (flyers come from wave 6). */
const WAVE10: Plan[] = [
  { at: { x: 9, y: 21 }, kind: 'cannon', tier: 3 },
  { at: { x: 16, y: 21 }, kind: 'arrow', tier: 3 },
  { at: { x: 9, y: 17 }, kind: 'arrow', tier: 2 },
  { at: { x: 16, y: 17 }, kind: 'arcane', tier: 2 },
  { at: { x: 9, y: 13 }, kind: 'frost', tier: 2 },
  { at: { x: 16, y: 13 }, kind: 'flak', tier: 2 },
  { at: { x: 9, y: 9 }, kind: 'arrow', tier: 2 },
  { at: { x: 16, y: 9 }, kind: 'arrow', tier: 2 },
  { at: { x: 2.5, y: 9 }, kind: 'cannon', tier: 2 },
  { at: { x: 2.5, y: 13 }, kind: 'arrow', tier: 2 },
  { at: { x: 2.5, y: 17 }, kind: 'flak', tier: 1 },
  { at: { x: 2.5, y: 21 }, kind: 'arcane', tier: 2 },
  { at: { x: 23.5, y: 9 }, kind: 'cannon', tier: 2 },
  { at: { x: 23.5, y: 13 }, kind: 'arrow', tier: 2 },
  { at: { x: 23.5, y: 17 }, kind: 'frost', tier: 1 },
  { at: { x: 23.5, y: 21 }, kind: 'flak', tier: 1 },
  { at: { x: 6, y: 28 }, kind: 'arrow', tier: 3 },
  { at: { x: 19, y: 28 }, kind: 'cannon', tier: 2 },
];

/** The boss banner restarted for a new wave start: marks the old one, then waits for the new one's hold (its
 * animation 0.67–2.5 s in: `banner-boss` in style.css) and returns once it is 1 s in. */
async function bossBannerHeld(page: Page, start: () => Promise<void>): Promise<void> {
  await page.evaluate(() => {
    const t = document.querySelector('#banner .title') as HTMLElement | null;
    if (t) t.dataset.old = '1';
  });
  await start();
  await page.waitForSelector('#banner.boss .title:not([data-old])', { timeout: 10_000 });
  await page.waitForFunction(
    () => {
      const a = document.getElementById('banner')!.getAnimations()[0];
      return !!a && Number(a.currentTime) >= 1100;
    },
    undefined,
    { timeout: 10_000, polling: 'raf' },
  );
}

/** The Ironhorn out of its portal and on the Mid road. */
const IRONHORN_OUT = `(() => { const b = window.__tdt.latest().creeps.find((c) => c.kind === 'ironhorn'); return !!b && b.y > 4; })()`;

/** The Ironhorn is between the banner (rows 8–12 on a phone) and the lane roles under it (row 22 on): rows 13–19. */
const IRONHORN_UNDER_BANNER = `(() => { const b = window.__tdt.latest().creeps.find((c) => c.kind === 'ironhorn'); return !!b && b.y > 13.5; })()`;

async function shot2(browser: Browser, url: string): Promise<void> {
  const ctx = await context(browser, false);
  const page = await newPage(ctx);
  // Level 7 with R learned, as an Arcanist is by wave 10.
  await solo(page, url, 'arcanist', 'full', '?lab&ult');
  await buildPhone(page, WAVE10);
  await page.evaluate(() => (window as any).__tdt.setLevel(7));
  // The Arcanist by the Mid road among the towers, where the boss comes down.
  await walkTo(page, ROAD.mid - 1.6, 19.5);
  await skipTo(page, 9);
  await page.waitForTimeout(9000);
  await skipTo(page, 10);
  await until(page, 'the Ironhorn under the banner', IRONHORN_UNDER_BANNER, 90_000);
  // Wave 10 again: its banner, with the first Ironhorn already on the road; her Q into the pack.
  await learnAll(page);
  await bossBannerHeld(page, async () => {
    await skipTo(page, 10);
    await page.waitForTimeout(150);
    await cast(page, 'Q');
  });
  await hold(page);
  await clean(page);
  await shoot(page, 2);
  await ctx.close();
}

/** A port nobody listens on. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = netServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => done(port));
    });
  });
}

/**
 * Shot 3: a room of two on a game server started in this process (apps/server, as the integration tests start one),
 * the Ranger in this browser and the Arcanist a bot (apps/server/src/testing/botClient.ts). The client is an e2e build
 * of its own, pointed at that server (VITE_SERVER_URL is read at build time), in --work/online.
 */
async function shot3(browser: Browser): Promise<void> {
  const sport = await freePort();
  const pport = await freePort();
  const origin = `http://127.0.0.1:${pport}`;
  const outDir = join(work, 'online');
  process.env.VITE_SERVER_URL = `ws://127.0.0.1:${sport}`;
  try {
    await build({ root, mode: 'e2e', logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  } finally {
    delete process.env.VITE_SERVER_URL;
  }
  // This process's tuning (the server's): Quick starts with the gold a player has had by wave 3 or so, and the first
  // kill's XP is level 6, so both heroes have R within a minute. The rest of the match is the game's.
  const quick = TUNING.modes.quick as any;
  quick.economy = { ...quick.economy, startingGold: 1100 };
  quick.hero = { ...quick.hero, xpForLevel: [0, 1, 2, 3, 4, 5, ...quick.hero.xpForLevel.slice(6)] };
  const { createGameServer } = await import('../../server/src/server');
  const { defaultConfig } = await import('../../server/src/config');
  const { BotClient } = await import('../../server/src/testing/botClient');
  const game = createGameServer(defaultConfig({ allowedOriginsList: origin, analyticsDir: 'memory' }), () => {});
  await game.listen(sport);
  const { server, url } = await previewOf(outDir, pport);
  let bot: InstanceType<typeof BotClient> | null = null;
  // Play data off: no age question, nothing posted.
  const ctx = await context(browser, false, { 'tdt.analytics': 'off', 'tdt.name': 'Wren' });
  try {
    const page = await newPage(ctx);
    await page.goto(url);
    await page.waitForSelector('html[data-ready="online"]', { timeout: 60_000 });
    await page.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
    await page.locator('#lobby-name').fill('Wren');
    await page.locator('#lobby-create').click();
    await page.waitForFunction(() => /^[A-Z]{5}$/.test(document.getElementById('lobby-room-code')?.textContent?.trim() ?? ''));
    const code = (await page.locator('#lobby-room-code').textContent())!.trim();
    await page.locator('#lobby-mode-room .mode-pick[data-mode="quick"]').click();
    bot = new BotClient({ url: `ws://127.0.0.1:${sport}`, origin, name: 'Oro', hero: 'arcanist', index: 1 });
    await bot.join(code);
    bot.send({ t: 'ready', ready: true });
    if (await page.locator('#lobby-ready').isVisible()) {
      const ready = await page.locator('#lobby-ready').getAttribute('aria-pressed');
      if (ready !== 'true') await page.locator('#lobby-ready').click();
    }
    await page.locator('#lobby-start:not([disabled])').click({ timeout: 20_000 });
    await page.waitForFunction(() => (window as any).__tdt?.latest()?.heroes?.length === 2, undefined, { timeout: 30_000 });
    await artIn(page);
    // His zone (West and the west half of Mid in a room of two): the gold spent, round where the roads meet.
    await buildPhone(page, [
      { at: { x: 9, y: 21 }, kind: 'arrow', tier: 2 },
      { at: { x: 6, y: 28 }, kind: 'cannon', tier: 2 },
      { at: { x: 9, y: 17 }, kind: 'frost', tier: 1 },
      { at: { x: 2.5, y: 21 }, kind: 'arrow', tier: 1 },
      { at: { x: 2.5, y: 17 }, kind: 'flak', tier: 1 },
      { at: { x: 9, y: 13 }, kind: 'arcane', tier: 1 },
      { at: { x: 2.5, y: 13 }, kind: 'arrow', tier: 1 },
    ]);
    const SPOT = { x: ROAD.mid - 3.6, y: 31.5 };
    await walkTo(page, SPOT.x, SPOT.y);
    const mine = () =>
      page.evaluate(() => {
        const t = (window as any).__tdt;
        const s = t.latest();
        const r = (h: any) => h?.skills.find((k: any) => k.slot === 'R');
        const me = s.heroes.find((h: any) => h.owner === t.me());
        const mate = s.heroes.find((h: any) => h.owner !== t.me());
        return {
          wave: s.wave,
          creeps: s.creeps.length,
          gold: s.players.find((p: any) => p.id === t.me())?.gold ?? 0,
          ready: [me, mate].every((h) => h?.alive && r(h)?.rank > 0 && r(h)?.cooldown === 0),
          mateR: r(mate)?.cooldown ?? 0,
        };
      }) as Promise<{ wave: number; creeps: number; gold: number; ready: boolean; mateR: number }>;
    // The waves called early (the bot's button) until wave 6, then the rain on a full wave.
    let lastCall = 0;
    let placed = false;
    const end = Date.now() + 360_000;
    for (;;) {
      if (Date.now() > end) throw new Error(`no full wave with both ultimates ready: ${JSON.stringify(await mine())}`);
      await learnAll(page);
      const m = await mine();
      // On wave 6 the Ranger takes his spot beside the Heart, under where the fuse ribbon sits (rows 20–28 on a
      // phone) and clear of the Arcanist, who keeps to the Heart.
      if (m.wave >= 6 && !placed) {
        await walkTo(page, SPOT.x, SPOT.y);
        placed = true;
        continue;
      }
      if (placed && m.creeps >= 30 && m.ready) break;
      if (m.wave < 6 && m.creeps < 8 && Date.now() - lastCall > 8000) {
        bot.send({ t: 'cmd', cmd: { type: 'callEarly' } });
        lastCall = Date.now();
      }
      // Gold spent as it comes (an Arrow, else an upgrade), so the top bar shows what a player keeps.
      if (m.gold >= 300) await spendDown(page);
      await page.waitForTimeout(300);
    }
    // Both ultimates within a moment of each other: the bot stops deciding, the Ranger casts, the bot answers.
    bot.acting = false;
    // Back on his spot if he drifted or fell (a few steps from where he rises).
    const at = await heroAt(page);
    if (Math.hypot(at.x - SPOT.x, at.y - SPOT.y) > 1.2) await walkTo(page, SPOT.x, SPOT.y);
    console.log('  the Ranger at', JSON.stringify(await heroAt(page)));
    // The fuse held 1.1 s into the ribbon's own animation (`fuse-ribbon`, 2 s), when the combo's meteors are falling
    // on the three lanes (its first instant is a white burst); the ribbon pinned at 0.9 s, in full (14% to 70%).
    const { held } = await armHold(page, '#fuse-ribbon.on', 1100, 900, 'animation');
    await cast(page, 'R');
    bot.send({ t: 'cmd', cmd: { type: 'cast', slot: 'R' } });
    await held();
    await clean(page);
    await shoot(page, 3);
  } finally {
    bot?.close();
    await ctx.close();
    await closePreview(server);
    await game.close();
  }
}

async function shot4(browser: Browser, url: string): Promise<void> {
  const ctx = await context(browser, false);
  const page = await newPage(ctx);
  // Full wave 8, the Warden at level 6 with his slam (`?lab&ult`, `setLevel`).
  await solo(page, url, 'warden', 'full', '?lab&ult');
  // The towers of shot 2's map but none on the Mid pads up to row 13, where the pack meets him; the gold on the sides.
  await buildPhone(page, [
    ...WAVE10.filter((p) => !((p.at.x === 9 || p.at.x === 16) && p.at.y <= 13)),
    { at: { x: 2.5, y: 5 }, kind: 'arrow', tier: 3 },
    { at: { x: 23.5, y: 5 }, kind: 'cannon', tier: 2 },
  ]);
  await page.evaluate(() => (window as any).__tdt.setLevel(7));
  await walkTo(page, ROAD.mid, 11);
  await spendDown(page);
  await skipTo(page, 8);
  // The pack at his feet: Taunt pulls it in, then the slam.
  const near = (r: number) =>
    page.evaluate((rad) => {
      const t = (window as any).__tdt;
      const s = t.latest();
      const h = s.heroes.find((x: any) => x.owner === t.me());
      return s.creeps.filter((c: any) => Math.hypot(c.x - h.x, c.y - h.y) <= rad).length;
    }, r) as Promise<number>;
  const hp = () =>
    page.evaluate(() => {
      const t = (window as any).__tdt;
      const h = t.latest().heroes.find((x: any) => x.owner === t.me());
      return h.alive ? h.hp / h.maxHp : 0;
    }) as Promise<number>;
  const end = Date.now() + 60_000;
  let taunted = false;
  // A full pack, or a smaller one when he is under half his HP (a player slams then, before he falls).
  while ((await near(3.2)) < 9 && !((await hp()) < 0.5 && (await near(3.2)) >= 5)) {
    if (Date.now() > end) throw new Retry('no pack at the Warden');
    if ((await hp()) === 0) throw new Retry('the Warden fell before the slam');
    if (!taunted && (await near(4.5)) >= 6) {
      await cast(page, 'W');
      taunted = true;
    }
    await page.waitForTimeout(100);
  }
  await learnAll(page);
  // 180 ms after the slam: the pack falling round him, his guard ring and heal; the popup as it stands once it has
  // landed (`ult-pop` 2.2 s: full from 10%, settled at 18%).
  const { held } = await armHold(page, '.ult-pop[data-ult="rampartSlam"]', 180, 420);
  await cast(page, 'R');
  await held();
  await clean(page);
  await shoot(page, 4);
  await ctx.close();
}

async function shot5(browser: Browser, url: string): Promise<void> {
  const ctx = await context(browser, false);
  const page = await newPage(ctx);
  // A won Quick match: shot 1's map (the lab's gold spent), the Arcanist by the Heart with her Meteor, waves played
  // with their kills, then the e2e `win()`.
  await solo(page, url, 'arcanist', 'quick', '?lab&ult');
  await buildPhone(page, BUILT);
  await walkTo(page, ROAD.mid - 1.6, 26);
  let cast = false;
  for (const w of [3, 5, 7]) {
    await skipTo(page, w);
    const end = Date.now() + 16_000;
    while (Date.now() < end) {
      // Her Meteor on a full wave, once, so the end card lists its kills.
      if (!cast && (await latest(page)).creeps.length >= 14) {
        await castSlot(page, 'R');
        cast = true;
      }
      await page.waitForTimeout(500);
    }
  }
  await page.evaluate(() => (window as any).__tdt.setLevel(9));
  await learnAll(page);
  await spendDown(page);
  await until(page, 'the Arcanist standing', `(() => { const t = window.__tdt; return t.latest().heroes.find((h) => h.owner === t.me()).alive; })()`, 30_000);
  await page.evaluate(() => (window as any).__tdt.win());
  await page.waitForSelector('#end-screen:not(.hidden)', { timeout: 20_000 });
  // The emblem landed and the numbers counted up.
  await page.waitForTimeout(5000);
  await hold(page);
  await shoot(page, 5, { art: false });
  await ctx.close();
}

/** Endless's board as /endless/today answers it (apps/server/src/endless/http.ts): ten made-up runs, this browser 27th. */
function endlessToday(day: string) {
  const names = ['Kael', 'Mira the Bold', 'Wren', 'Aster', 'Oro', 'Tamsin', 'Ilse', 'Bram', 'Juno', 'Pellinore Ash'];
  const WAVES = [61, 58, 55, 54, 52, 49, 47, 46, 44, 43];
  return {
    day,
    closesAt: Date.now() + 5 * 3600_000 + 20 * 60_000,
    runs: 112,
    top: names.map((name, i) => ({
      rank: i + 1,
      name,
      wave: WAVES[i]!,
      // About 50 s a wave, as an Endless run takes.
      ticks: Math.round(WAVES[i]! * (52 - i * 0.6) * 20),
      hero: ['warden', 'ranger', 'arcanist', 'ranger', 'warden', 'arcanist', 'arcanist', 'warden', 'ranger', 'warden'][i],
      mine: false,
    })),
    you: { rank: 27, wave: 31, ticks: 31 * 49 * 20 },
  };
}

async function shot6(browser: Browser, url: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ctx = await context(browser, false, {
    'tdt.endlessBest': JSON.stringify({ ranger: 31 }),
    'tdt.endlessPosted': JSON.stringify([day]),
    'tdt.visitorKey': 'ab'.repeat(32),
  });
  const page = await newPage(ctx);
  await page.route('**/endless/today', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(endlessToday(day)) }),
  );
  await page.route('**/daily/today', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.goto(`${url}?lobby&daily`);
  await page.waitForSelector('html[data-ready="online"]', { timeout: 60_000 });
  await page.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await page.locator('#lobby-board-link').click();
  await page.waitForSelector('#lobby-board-rows li:nth-child(10)');
  await page.waitForSelector('#lobby-board-you li');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(800);
  await shoot(page, 6, { art: false });
  await ctx.close();
}

/** Shot 7's match, kept for the covers' wide frame of the meadow. */
async function shot7(browser: Browser, url: string): Promise<void> {
  const ctx = await context(browser, true);
  const page = await newPage(ctx);
  await solo(page, url, 'warden', 'full', '?lab&ult');
  await buildDesktop(page, WAVE10);
  await page.evaluate(() => (window as any).__tdt.setLevel(8));
  await walkToDesktop(page, ROAD.mid - 0.5, 18.5);
  await skipTo(page, 9);
  await page.waitForTimeout(8000);
  await skipTo(page, 10);
  await until(page, 'the Ironhorn out of its portal', IRONHORN_OUT, 90_000);
  await learnDesktop(page);
  // Wave 10 again, as in shot 2: its banner and a new stream of creeps out of the three portals, the first Ironhorn
  // coming down the Mid road to the Warden.
  await bossBannerHeld(page, () => skipTo(page, 10));
  await page.waitForTimeout(900);
  await hold(page);
  await clean(page);
  await shoot(page, 7);
  await release(page);
  await coverFrame(page);
  await ctx.close();
}

/**
 * The covers' background: the same held wave-10 frame, wide (1664 × 936, the map's width at the camera's closest),
 * with the HUD hidden and the camera on the roads' meeting and the Heart.
 */
async function coverFrame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1664, height: 936 });
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: '#hud, #hud * { visibility: hidden !important; } .vignette { display: none !important; }' });
  await page.evaluate(() => {
    const t = (window as any).__tdt;
    const c = t.camera;
    // Round the wave: the Ironhorn on the Mid road and the creeps out of the portals, the towers either side.
    const b = t.latest().creeps.find((x: any) => x.kind === 'ironhorn');
    c.zoomAt(4, c.viewW / 2, c.viewH / 2);
    c.centerOn(13 * 32, Math.max(8, Math.min(20, (b?.y ?? 10) + 1)) * 32);
  });
  await page.waitForTimeout(900);
  writeFileSync(join(work, 'cover-meadow.png'), await page.screenshot({ type: 'png' }));
  console.log(join(work, 'cover-meadow.png'));
}

// ---------------------------------------------------------------------------------------------------------------
// The banner, the covers and the sheet
// ---------------------------------------------------------------------------------------------------------------

/** One block of style.css by its selector line (`sel {` … `}`), renamed to `as`. */
function cssBlock(css: string, sel: string, as = sel): string {
  const at = css.indexOf(`\n${sel} {\n`);
  const from = at >= 0 ? at + 1 : css.startsWith(`${sel} {\n`) ? 0 : -1;
  if (from < 0) throw new Error(`style.css has no "${sel} {" block`);
  const end = css.indexOf('\n}', from);
  return `${as}${css.slice(from + sel.length, end + 2)}`;
}

/** The lobby's wordmark CSS (style.css: the stage's `.logo.stage-logo`), and Palatino's metric clone where it is missing. */
function wordmarkCss(): string {
  const css = readFileSync(join(root, 'src', 'style.css'), 'utf8');
  const blocks = [
    cssBlock(css, ':root'),
    cssBlock(css, '.logo'),
    cssBlock(css, '.logo span'),
    cssBlock(css, '.lobby-card .stage-logo', '.press-logo .stage-logo'),
    cssBlock(css, '.stage-logo span'),
  ];
  let alias = '';
  try {
    const match = execFileSync('fc-match', ['-f', '%{family}', 'Palatino:bold']).toString();
    if (/pagella/i.test(match)) {
      alias = ['400', '700']
        .map((wt) => `@font-face { font-family: 'Palatino'; font-weight: ${wt}; src: local('TeX Gyre Pagella${wt === '700' ? ' Bold' : ''}'), local('TeXGyrePagella-${wt === '700' ? 'Bold' : 'Regular'}'); }`)
        .join('\n');
      console.log('the wordmark: Palatino is TeX Gyre Pagella here');
    } else if (!/palatino/i.test(match)) {
      console.warn(`the wordmark: no Palatino and no TeX Gyre Pagella (fonts-texgyre), so ${match.split(',')[0]}: look at it`);
    }
  } catch {
    // No fontconfig (macOS, Windows): the system's own Palatino.
  }
  return `${alias}\n${blocks.join('\n')}\n.press-logo { position: absolute; transform-origin: 50% 0; white-space: nowrap; }
    .press-logo .stage-logo { margin: 0; padding: 0; }`;
}

/** Page-side drawing (plain script: tsx would name these functions). */
const COMPOSE_JS = String.raw`
window.press = (() => {
  const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // A hero cut from his poster against the empty clearing: the figure (a closed silhouette, edges softened) and the
  // shade his shadow and contact cast on the ground (a multiply layer: 1 where the ground is as in the clearing).
  const cut = (poster, clearing, box) => {
    const w = box.x1 - box.x0, h = box.y1 - box.y0, n = w * h;
    const grab = (img) => { const c = canvas(w, h); const g = c.getContext('2d'); g.drawImage(img, -box.x0, -box.y0); return g.getImageData(0, 0, w, h).data; };
    const P = grab(poster), C = grab(clearing);
    const d = new Float32Array(n), mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      d[i] = Math.max(Math.abs(P[k] - C[k]), Math.abs(P[k + 1] - C[k + 1]), Math.abs(P[k + 2] - C[k + 2]));
      mask[i] = d[i] > 30 ? 1 : 0;
    }
    const grow = (m, r, v) => {
      const o = m.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (m[y * w + x] !== v) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && dx * dx + dy * dy <= r * r) o[yy * w + xx] = v;
        }
      }
      return o;
    };
    // Closing: grown by 3 px, the outside flooded from the box's edge, then the outside grown back by 3 px.
    const fat = grow(mask, 3, 1);
    const out = new Uint8Array(n);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (out[i] || fat[i]) continue;
      out[i] = 1;
      const x = i % w, y = (i - x) / w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    const grown = grow(out, 3, 1);
    // Only the hero: the pieces inside of a real size (his body, a staff's head beyond its thin shaft), not the
    // posters' fireflies, specks of their own.
    const label = new Int32Array(n);
    const sizes = [0];
    let next = 0;
    for (let i = 0; i < n; i++) {
      if (grown[i] || label[i]) continue;
      next++;
      let size = 0;
      const todo = [i];
      label[i] = next;
      while (todo.length) {
        const j = todo.pop();
        size++;
        const x = j % w, y = (j - x) / w;
        for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
          if (k >= 0 && !grown[k] && !label[k]) { label[k] = next; todo.push(k); }
        }
      }
      sizes.push(size);
    }
    const keep = Math.max(1200, 0.01 * Math.max(...sizes));
    const outside = new Uint8Array(n);
    for (let i = 0; i < n; i++) outside[i] = label[i] && sizes[label[i]] >= keep ? 0 : 1;
    const fig = canvas(w, h), fg = fig.getContext('2d'), F = fg.createImageData(w, h);
    const sh = canvas(w, h), sg = sh.getContext('2d'), S = sg.createImageData(w, h);
    const lum = (A, k) => 0.2126 * A[k] + 0.7152 * A[k + 1] + 0.0722 * A[k + 2];
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      if (!outside[i]) { F.data[k] = P[k]; F.data[k + 1] = P[k + 1]; F.data[k + 2] = P[k + 2]; F.data[k + 3] = 255; }
      const s = outside[i] && d[i] > 8 ? Math.min(1, Math.max(0.25, lum(P, k) / Math.max(1, lum(C, k)))) : 1;
      S.data[k] = S.data[k + 1] = S.data[k + 2] = Math.round(s * 255);
      S.data[k + 3] = 255;
    }
    fg.putImageData(F, 0, 0);
    sg.putImageData(S, 0, 0);
    // Softened: the figure's edge by a pixel, the shade by a few (the posters' compression noise).
    const soft = (src, px) => { const c = canvas(w, h); const g = c.getContext('2d'); g.filter = 'blur(' + px + 'px)'; g.drawImage(src, 0, 0); return c; };
    const edge = soft(fig, 0.7);
    const sharp = canvas(w, h), kg = sharp.getContext('2d');
    kg.drawImage(edge, 0, 0);
    kg.globalCompositeOperation = 'source-atop';
    kg.drawImage(fig, 0, 0);
    // Under the figure the shade is white (the figure covers it), and it fades out at the box's edge.
    const shade = soft(sh, 3);
    const gx = shade.getContext('2d');
    gx.globalCompositeOperation = 'lighter';
    const fade = gx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(0.08, 'rgba(255,255,255,0)');
    fade.addColorStop(0.92, 'rgba(255,255,255,0)'); fade.addColorStop(1, 'rgba(255,255,255,1)');
    gx.fillStyle = fade; gx.fillRect(0, 0, w, h);
    return { figure: sharp, shade, box };
  };
  const heroes = {};
  let clearing = null, meadow = null;
  const setup = async (spec) => {
    clearing = await load(spec.clearing);
    meadow = spec.meadow ? await load(spec.meadow) : null;
    for (const [kind, h] of Object.entries(spec.heroes)) {
      const poster = await load(h.poster);
      heroes[kind] = { ...cut(poster, clearing, h.box), own: h.own, feetX: h.feetX, groundY: h.groundY };
    }
  };
  // The stage: a canvas the output's size times S, the wordmark over it.
  const stage = (w, h) => {
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    const root = document.createElement('div');
    root.id = 'stage';
    root.style.cssText = 'position:relative;overflow:hidden;width:' + w + 'px;height:' + h + 'px;background:#0b0f14';
    const c = canvas(w, h);
    c.style.cssText = 'position:absolute;left:0;top:0';
    root.appendChild(c);
    document.body.appendChild(root);
    return { root, g: c.getContext('2d') };
  };
  // The wordmark as the lobby draws it, centred on cx, its top at top, "Together" wide "wide" px.
  const logo = async (root, cx, top, wide) => {
    const box = document.createElement('div');
    box.className = 'press-logo';
    box.innerHTML = '<h1 class="logo stage-logo">Tower Defense <span>Together</span></h1>';
    root.appendChild(box);
    await document.fonts.ready;
    const span = box.querySelector('span');
    const k = wide / span.getBoundingClientRect().width;
    const w0 = box.getBoundingClientRect().width;
    box.style.left = (cx - w0 / 2) + 'px';
    box.style.top = top + 'px';
    box.style.transform = 'scale(' + k + ')';
    return box.getBoundingClientRect();
  };
  // A hero placed with his feet at (fx, fy), "scale" times his poster size: shade (multiply), then the figure.
  const hero = (g, kind, fx, fy, scale, outline) => {
    const h = heroes[kind];
    const x = fx - (h.feetX - h.box.x0) * scale, y = fy - (h.groundY - h.box.y0) * scale;
    const w = (h.box.x1 - h.box.x0) * scale, hh = (h.box.y1 - h.box.y0) * scale;
    g.save();
    g.imageSmoothingQuality = 'high';
    g.globalCompositeOperation = 'multiply';
    g.drawImage(h.shade, x, y, w, hh);
    g.globalCompositeOperation = 'source-over';
    if (outline) g.filter = 'drop-shadow(0 0 ' + outline + 'px rgba(16, 12, 22, 0.85))';
    g.drawImage(h.figure, x, y, w, hh);
    g.restore();
  };
  const banner = async (spec) => {
    const { root, g } = stage(spec.w, spec.h);
    g.drawImage(clearing, 0, 0, spec.w, spec.h);
    const k = spec.w / clearing.width;
    for (const p of spec.place) hero(g, p.kind, p.feetX * k, heroes[p.kind].groundY * k, k, 0);
    await logo(root, spec.w / 2, spec.logoTop * k, spec.logoWide * k);
  };
  const night = 'rgba(11, 15, 20, ';
  const cover = async (spec) => {
    const { root, g } = stage(spec.w, spec.h);
    const W = spec.w, H = spec.h;
    // The meadow in wave 10, cropped to the cover's shape round spec.center (a share of the frame).
    const mw = meadow.width, mh = meadow.height, a = W / H;
    let sw = mw, sh = mw / a;
    if (sh > mh) { sh = mh; sw = mh * a; }
    const sx = Math.min(mw - sw, Math.max(0, spec.center[0] * mw - sw / 2));
    const sy = Math.min(mh - sh, Math.max(0, spec.center[1] * mh - sh / 2));
    g.imageSmoothingQuality = 'high';
    g.drawImage(meadow, sx, sy, sw, sh, 0, 0, W, H);
    // The night over it: deep under the title, clear toward the hero; a little all over so the hero stands out.
    g.fillStyle = night + '0.18)'; g.fillRect(0, 0, W, H);
    const side = spec.square ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, night + '0.86)');
    side.addColorStop(spec.square ? 0.3 : 0.38, night + '0.62)');
    side.addColorStop(spec.square ? 0.55 : 0.62, night + '0.12)');
    side.addColorStop(1, night + '0)');
    g.fillStyle = side; g.fillRect(0, 0, W, H);
    const foot = g.createLinearGradient(0, H * 0.7, 0, H);
    foot.addColorStop(0, night + '0)'); foot.addColorStop(1, night + '0.55)');
    g.fillStyle = foot; g.fillRect(0, H * 0.7, W, H * 0.3);
    const h = heroes[spec.hero];
    const scale = (spec.heroTall * H) / (h.own.y1 - h.own.y0);
    hero(g, spec.hero, spec.heroX * W, H * (1 - spec.heroFoot), scale, Math.max(2, W / 260));
    await logo(root, spec.logo[0] * W, spec.logo[1] * H, spec.logo[2] * W);
  };
  // The contact sheet: the stills, the banner and the covers (each also at 160 px wide, a store's thumbnail), labelled.
  const sheet = async (spec) => {
    const W = spec.w, pad = 28;
    const items = [];
    for (const it of spec.items) items.push({ ...it, img: await load(it.src) });
    const c = canvas(W, spec.h), g = c.getContext('2d');
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, W, spec.h);
    g.textBaseline = 'top';
    const text = (s, x, y, size, colour, weight) => { g.font = (weight || 400) + ' ' + size + 'px Inter, system-ui, sans-serif'; g.fillStyle = colour; g.fillText(s, x, y); };
    text(spec.title, pad, pad, 40, '#e9eef6', 700);
    text(spec.sub, pad, pad + 54, 24, '#97a8a8');
    g.imageSmoothingQuality = 'high';
    for (const it of items) {
      g.drawImage(it.img, it.x, it.y, it.dw, it.dh);
      g.strokeStyle = 'rgba(207, 230, 255, 0.25)'; g.lineWidth = 2; g.strokeRect(it.x - 1, it.y - 1, it.dw + 2, it.dh + 2);
      if (it.thumb) {
        const tw = 160, th = Math.round((160 * it.img.height) / it.img.width);
        g.drawImage(it.img, it.x + it.dw + 20, it.y, tw, th);
        g.strokeRect(it.x + it.dw + 19, it.y - 1, tw + 2, th + 2);
        text('160 px', it.x + it.dw + 20, it.y + th + 6, 18, '#97a8a8');
      }
      let y = it.y + it.dh + 10;
      text(it.label, it.x, y, 24, '#ffd24a', 700);
      if (it.note) text(it.note, it.x, y + 32, 20, '#cfe6ff');
    }
    return c.toDataURL('image/png');
  };
  return { setup, banner, cover, sheet, load, canvas };
})();
`;

/** The covers (docs/press/): file, size, hero, where the title and the hero stand, and where each goes. */
const COVERS = [
  { file: 'itch-cover-630x500.png', w: 630, h: 500, hero: 'warden', where: 'itch.io: the cover image (Edit game → Cover image)' },
  { file: 'itch-cover-315x250.png', w: 315, h: 250, hero: 'warden', where: 'itch.io: the same cover at half size (itch\'s smallest), for embeds and collections' },
  { file: 'ng-thumb-2x1.png', w: 1200, h: 600, hero: 'ranger', where: 'Newgrounds: the 2:1 thumbnail' },
  { file: 'ng-icon-1x1.png', w: 512, h: 512, hero: 'warden', where: 'Newgrounds: the square icon' },
  { file: 'cg-cover-16x9.png', w: 1920, h: 1080, hero: 'arcanist', where: 'CrazyGames: the 16:9 cover' },
  { file: 'cg-cover-1x1.png', w: 1024, h: 1024, hero: 'ranger', where: 'CrazyGames: the 1:1 cover' },
] as const;

async function covers(browser: Browser): Promise<void> {
  const meadow = join(work, 'cover-meadow.png');
  if (!existsSync(meadow)) throw new Error(`no ${meadow}: run shot 7 first (--only 7)`);
  const ctx = await browser.newContext({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addStyleTag({ content: wordmarkCss() });
    await page.addScriptTag({ content: COMPOSE_JS });
    const stageDir = join(root, 'public', 'stage');
    const img = (file: string, type: string) => dataUrl(readFileSync(file), type);
    const heroes: Record<string, unknown> = {};
    for (const kind of ['ranger', 'warden', 'arcanist']) {
      const st = JSON.parse(readFileSync(join(root, 'src', 'render', 'art3d', `${kind}.json`), 'utf8')).stage;
      heroes[kind] = {
        poster: img(join(stageDir, `${kind}-poster.webp`), 'image/webp'),
        // The figure's box, wider to the right and lower for his shadow on the ground.
        box: { x0: st.figure.x0 - 40, y0: st.figure.y0 - 24, x1: Math.min(st.w, st.figure.x1 + 150), y1: Math.min(st.h, st.groundY + 90) },
        own: st.own,
        feetX: st.feetX,
        groundY: st.groundY,
      };
    }
    await page.evaluate((spec) => (window as any).press.setup(spec), {
      clearing: img(join(stageDir, 'clearing.webp'), 'image/webp'),
      meadow: img(meadow, 'image/png'),
      heroes,
    });
    const grab = async (w: number, h: number) => {
      await page.setViewportSize({ width: Math.max(w, 400), height: Math.max(h, 300) });
      await page.waitForTimeout(100);
      return page.locator('#stage').screenshot({ type: 'png' });
    };
    const browserOf = page.context().browser()!;
    if (only.has('covers')) {
      // The banner: the three heroes on their clearing, 600 px apart, the wordmark over them, at the posters' size.
      await page.evaluate((spec) => (window as any).press.banner(spec), {
        w: 2400,
        h: 900,
        place: [
          { kind: 'ranger', feetX: 610 },
          { kind: 'arcanist', feetX: 1790 },
          { kind: 'warden', feetX: 1200 },
        ],
        logoTop: 40,
        logoWide: 520,
      });
      const banner = await grab(2400, 900);
      const [webp] = await scale(browserOf, banner, [{ w: 2400, h: 900, type: 'image/webp', q: 0.9 }]);
      writeFileSync(join(pressDir, 'heroes-banner.webp'), webp!);
      writeFileSync(join(work, 'heroes-banner.png'), banner);
      console.log(`${join(pressDir, 'heroes-banner.webp')}: 2400 × 900, ${(webp!.length / 1024).toFixed(0)} KB`);
      // The covers, drawn at twice their size and scaled down.
      for (const c of COVERS) {
        const square = c.w === c.h;
        const S = c.w < 1000 ? 2 : 1;
        await page.evaluate((spec) => (window as any).press.cover(spec), {
          w: c.w * S,
          h: c.h * S,
          hero: c.hero,
          square,
          center: square ? [0.5, 0.5] : [0.5, 0.52],
          heroTall: square ? 0.6 : 0.82,
          heroX: square ? 0.7 : 0.75,
          heroFoot: 0.05,
          logo: square ? [0.5, 0.05, 0.62] : [0.33, c.w / c.h > 1.9 ? 0.2 : 0.16, 0.4],
        });
        const shot = await grab(c.w * S, c.h * S);
        const [full] = await scale(browserOf, shot, [{ w: c.w, h: c.h, type: 'image/png' }]);
        // 256 colours with a light dither, as the link card (scripts/ogImage.ts): a third the bytes, the same look.
        const img = decodePng(full!);
        const q = quantize(img, 256, 0.5);
        const png = encodeIndexedPng(img.width, img.height, q.indices, q.palette);
        writeFileSync(join(pressDir, c.file), png);
        console.log(`${join(pressDir, c.file)}: ${c.w} × ${c.h}, ${(png.length / 1024).toFixed(0)} KB (${(full!.length / 1024).toFixed(0)} KB before)`);
      }
    }
  } finally {
    await ctx.close();
  }
}

/** The contact sheet for Han's phone (docs/press/press-sheet.png): every still and cover, labelled. */
async function contactSheet(browser: Browser): Promise<void> {
  const W = 1760;
  const items: Record<string, unknown>[] = [];
  const webp = (f: string) => dataUrl(readFileSync(f), 'image/webp');
  const png = (f: string) => dataUrl(readFileSync(f), 'image/png');
  const need = (f: string) => {
    if (!existsSync(f)) throw new Error(`the sheet needs ${f}`);
    return f;
  };
  // Row 1: the six phone stills.
  let y = 120;
  const phoneW = 262;
  const phoneH = Math.round((phoneW * PHONE.height) / PHONE.width);
  ([1, 2, 3, 4, 5, 6] as const).forEach((n, i) => {
    items.push({
      src: webp(need(join(out, `${STILLS[n]}.webp`))),
      x: 28 + i * (phoneW + 24),
      y,
      dw: phoneW,
      dh: phoneH,
      label: `${STILLS[n]}`,
      note: '412 × 915 · @2x 824 × 1830',
    });
  });
  y += phoneH + 90;
  // Row 2: the desktop still and the banner.
  items.push({ src: webp(need(join(out, `${STILLS[7]}.webp`))), x: 28, y, dw: 760, dh: 475, label: STILLS[7], note: '1280 × 800 · @2x 2560 × 1600' });
  items.push({ src: webp(need(join(pressDir, 'heroes-banner.webp'))), x: 816, y, dw: 916, dh: Math.round((916 * 900) / 2400), label: 'heroes-banner.webp', note: '2400 × 900' });
  y += 475 + 90;
  // The covers, two columns, each with its 160 px copy.
  const cell = (file: string, x: number, at: number, dw: number, dh: number, where: string) => {
    items.push({ src: png(need(join(pressDir, file))), x, y: at, dw, dh, thumb: true, label: file, note: where });
    return at + Math.max(dh, 0) + 96;
  };
  const by = (f: string) => COVERS.find((c) => c.file === f)!;
  let a = y;
  let b = y;
  for (const [file, dw] of [['itch-cover-630x500.png', 630], ['ng-thumb-2x1.png', 630], ['cg-cover-16x9.png', 630]] as const) {
    const c = by(file);
    a = cell(file, 28, a, dw, Math.round((dw * c.h) / c.w), `${c.w} × ${c.h} · ${c.where}`);
  }
  for (const [file, dw] of [['itch-cover-315x250.png', 315], ['ng-icon-1x1.png', 315], ['cg-cover-1x1.png', 315]] as const) {
    const c = by(file);
    b = cell(file, 900, b, dw, Math.round((dw * c.h) / c.w), `${c.w} × ${c.h} · ${c.where}`);
  }
  const H = Math.max(a, b) + 20;
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  try {
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: COMPOSE_JS });
    const day = new Date().toISOString().slice(0, 10);
    const url = (await page.evaluate((spec) => (window as any).press.sheet(spec), {
      w: W,
      h: H,
      title: 'Tower Defense Together: press stills and store covers',
      sub: `${day} · stills from the e2e build (Pixel 7, 412 × 915 at 2.625×; desktop 1280 × 800 at 2×) · covers from the game's own art`,
      items,
    })) as string;
    const img = decodePng(fromDataUrl(url));
    const q = quantize(img, 256, 0.6);
    const file = join(pressDir, 'press-sheet.png');
    const buf = encodeIndexedPng(img.width, img.height, q.indices, q.palette);
    writeFileSync(file, buf);
    console.log(`${file}: ${img.width} × ${img.height}, ${(buf.length / 1024).toFixed(0)} KB`);
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------

async function previewOf(outDir: string, port = 0): Promise<{ server: PreviewServer; url: string }> {
  const server = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { port, host: '127.0.0.1', strictPort: port > 0 } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  return { server, url };
}

const closePreview = (s: PreviewServer) => new Promise<void>((done) => s.httpServer.close(() => done()));

// A Chromium of another revision than Playwright's own (a container's preinstalled one): CHROMIUM_PATH.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const solos = (['1', '2', '4', '5', '6', '7'] as const).filter((n) => only.has(n));
  if (solos.length) {
    if (!existsSync(join(dist, 'index.html'))) throw new Error('build the e2e client first: npm run build:e2e -w @tdt/client');
    const { server, url } = await previewOf(dist);
    try {
      const shots: Record<string, (b: Browser, u: string) => Promise<void>> = { 1: shot1, 2: shot2, 4: shot4, 5: shot5, 6: shot6, 7: shot7 };
      for (const n of solos) {
        for (let attempt = 1; ; attempt++) {
          console.log(`shot ${n}${attempt > 1 ? ` (again: ${attempt})` : ''}…`);
          try {
            await shots[n]!(browser, url);
            break;
          } catch (e) {
            if (!(e instanceof Retry) || attempt >= 4) throw e;
            console.log(`  ${e.message}: another match`);
            for (const c of browser.contexts()) if (c !== (encoder as Page | null)?.context()) await c.close();
          }
        }
      }
    } finally {
      await closePreview(server);
    }
  }
  if (only.has('covers')) await covers(browser);
  if (only.has('3')) {
    for (let attempt = 1; ; attempt++) {
      console.log(`shot 3${attempt > 1 ? ` (again: ${attempt})` : ''}…`);
      try {
        await shot3(browser);
        break;
      } catch (e) {
        if (!(e instanceof Retry) || attempt >= 3) throw e;
        console.log(`  ${e.message}: another room`);
      }
    }
  }
  if (only.has('sheet')) await contactSheet(browser);
} finally {
  await browser.close();
}

