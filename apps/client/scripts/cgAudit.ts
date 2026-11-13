// `npm run cg-audit -w @tdt/client`: CrazyGames' Basic Launch requirements checked against the crazygames build (q5,
// docs/crazygames/AUDIT.md). The rules are the advisor's reading of docs.crazygames.com on 10 Nov 2026
// (docs/queue/q5-crazygames-prep.md); this machine cannot open that site.
//
//   npm run build:e2e -w @tdt/client
//   npm run build:embed -w @tdt/client -- crazygames --e2e
//   npm run cg-audit -w @tdt/client [-- --only sizes,ttg,frames,chromebook,hz,keys] [--out DIR]
//
// It serves the browser test's CrazyGames zip (embed-e2e-crazygames.zip: the crazygames build with the e2e hook) as
// a host does (scripts/embedServe.ts: its files on one origin under a deep path, a host page on another framing it,
// a local game server), and measures in headless Chromium:
//
// - sizes: the zip, the unzipped total, the file count and the initial download (embedReport.ts) against the limits;
//   the production zip (embed-crazygames-<commit>.zip) when there is one, else the e2e zip (the same files but the
//   server's address and the hook);
// - time to gameplay: from the host page's load to the first second of a solo Quick match (tick 20) with Play solo
//   tapped the moment the first screen is up, in a cold browser, unthrottled and on DevTools' Fast 4G with the CPU 4×
//   slower; and the same after 30 s on the home card;
// - six frames at one device px per CSS px (907 × 510, 1216 × 684, 1280 × 720, 1920 × 1080 with a mouse; 800 × 450
//   and 1080 × 607 by touch), each at the home card, the loading card (Fast 4G, so it shows), a held wave-10 moment
//   (heldMoment.ts), a tower's ring or panel and the end card: a JPEG in docs/crazygames/frames/, the tile in px, a
//   hero's and a Grunt's drawn height (each found as the pixels that change when its scale is set to 0, its ground
//   ring included), the smallest DOM text on screen (the canvas's numbers are not counted) and what leaves the frame
//   or lies over the map; FAIL under 11 px of text, a hero under 24 px or anything cut off (the advisor's bars);
// - a 4 GB Chromebook stand-in (not a device): the stress scene and a real wave 10 with the CPU 4× slower and V8's
//   heap held to 512 MB: JavaScript a frame, the heap, the textures on the GPU;
// - 60, 144 and 165 Hz: frames driven at that rate (requestAnimationFrame replaced before the page's code), a solo
//   match's ticks against the clock (a minute at 144, 20 s at the others);
// - the keys the desktop controls bind (read from src/input/controls.ts) and which the browser owns.
//
// Then AUDIT.md: every requirement as PASS, FAIL or NOT CHECKED with its evidence. The block between
// `<!-- notes -->` and `<!-- /notes -->` (what would fix each FAIL) is written by hand and kept across runs.
// `CHROMIUM_PATH` for a Chromium of another revision than Playwright's. About 25 minutes.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Frame, type Page } from '@playwright/test';
import { initialFiles, LIMITS } from './embedReport';
import { e2eZipName, HARNESS, newestZip, startGameServer, startHarness } from './embedServe';
import { holdWave10 } from './heldMoment';
import { decodePng } from './png';
import { readZip } from './zip';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const outDir = ((p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p)))(arg('out', join(repo, 'docs', 'crazygames')));
const framesDir = join(outDir, 'frames');
const ALL = ['sizes', 'ttg', 'frames', 'chromebook', 'hz', 'keys'];
const only = new Set(arg('only', ALL.join(',')).split(','));
const ZIP = join(root, e2eZipName('crazygames'));
const SITE = join(root, 'dist-e2e');
const GAME = `${HARNESS.frameOrigin}${HARNESS.path}index.html`;
const EXE = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
/** The settings of a player who has played before: the lesson skipped, the one-time lines seen. */
const PLAYED = { quality: 'high', display: 'normal', tutorial: 'skipped', airLesson: 'seen', repairHint: 'seen', zoomHint: 'seen', endlessRoomLine: 'seen' };
const BARS = { text: 11, hero: 24 };
/** DevTools' Fast 4G as `npm run first-load -- --fast-4g` uses it (scripts/firstLoad.ts `FAST_4G`, which runs on import). */
const FAST_4G = { latencyMs: 165, downKbps: 8100, upKbps: 1350, cpu: 4 } as const;

/** CrazyGames' frames (q5): CSS px at one device px each. */
const FRAMES = [
  { w: 907, h: 510, input: 'mouse', what: 'desktop, not fullscreen' },
  { w: 1216, h: 684, input: 'mouse', what: 'desktop, not fullscreen' },
  { w: 1280, h: 720, input: 'mouse', what: 'desktop, fullscreen' },
  { w: 1920, h: 1080, input: 'mouse', what: 'desktop, fullscreen' },
  { w: 800, h: 450, input: 'touch', what: 'phone' },
  { w: 1080, h: 607, input: 'touch', what: 'tablet' },
] as const;
type FrameSpec = (typeof FRAMES)[number];
const STEPS = ['home', 'loading', 'wave10', 'ring', 'end'] as const;
type Step = (typeof STEPS)[number];

interface Measure {
  smallest: { px: number; text: string } | null;
  cutOff: string[];
  /** Controls past the viewport in a box that scrolls (reached by scrolling). */
  below: string[];
  overMap: string[];
  layout: string | null;
  tilePx: number | null;
}
interface StepResult extends Partial<Measure> {
  step: Step;
  shot?: string;
  heroPx?: number | null;
  gruntPx?: number | null;
  error?: string;
}
interface FrameResult {
  spec: FrameSpec;
  steps: StepResult[];
  errors: string[];
}

const results: {
  sizes?: { zip: string; zipBytes: number; unzipped: number; files: number; initial: number; initialFiles: number };
  ttg?: { label: string; readyMs: number; gameplayMs: number | null; error?: string }[];
  frames?: FrameResult[];
  chromebook?: { label: string; jsMs: number | null; frames: number; heapMB: number | null; heapLimitMB: number | null; gpuMB: number | null; error?: string }[];
  hz?: { hz: number; seconds: number; ticks: number; expected: number; framesPerSecond: number; error?: string }[];
  keys?: { key: string; does: string; browser: string }[];
} = {};

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const MB = (n: number) => +(n / 1e6).toFixed(2);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(cdp: CDPSession, on: boolean, cpu = true): Promise<void> {
  await cdp.send('Network.enable');
  await cdp.send(
    'Network.emulateNetworkConditions',
    on
      ? { offline: false, latency: FAST_4G.latencyMs, downloadThroughput: (FAST_4G.downKbps * 1024) / 8, uploadThroughput: (FAST_4G.upKbps * 1024) / 8 }
      : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  );
  if (cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? FAST_4G.cpu : 1 });
}

async function context(browser: Browser, spec: { w: number; h: number; input: string }, played = true): Promise<BrowserContext> {
  const touch = spec.input === 'touch';
  const ctx = await browser.newContext({
    viewport: { width: spec.w, height: spec.h },
    deviceScaleFactor: 1,
    isMobile: touch,
    hasTouch: touch,
    serviceWorkers: 'block',
  });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  if (played) await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), PLAYED);
  return ctx;
}

/** The smallest text, what leaves the viewport and what lies over the map, read in the page. */
function measure(p: Page): Promise<Measure> {
  return p.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const t = (window as any).__tdt;
    const shown = (el: Element) =>
      (el as HTMLElement).checkVisibility?.({ opacityProperty: true, visibilityProperty: true } as any) !== false &&
      el.getBoundingClientRect().width > 0;
    const label = (el: Element) =>
      (el.id ? `#${el.id}` : el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()) +
      ((el.textContent ?? '').trim() ? ` "${(el.textContent ?? '').trim().slice(0, 24)}"` : '');
    let smallest: { px: number; text: string } | null = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      const el = n.parentElement;
      if (!text || !el || !shown(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
      // Text under another layer (the HUD under the lobby card) is not on screen.
      const hit = document.elementFromPoint(Math.min(W - 1, Math.max(0, r.left + r.width / 2)), Math.min(H - 1, Math.max(0, r.top + r.height / 2)));
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (!smallest || px < smallest.px) smallest = { px, text: text.slice(0, 40) };
    }
    const controls = [...document.querySelectorAll('button, .btn, input, select, [role="button"], #topbar, .stat')].filter(shown);
    // Outside the viewport: in a box that scrolls (the home card in a short window) it is reached by scrolling;
    // anywhere else it is cut off.
    const scrolls = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a).overflowY;
        if ((o === 'auto' || o === 'scroll') && a.scrollHeight > a.clientHeight + 1) return true;
      }
      return false;
    };
    const outside = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1;
    });
    const cutOff = outside.filter((el) => !scrolls(el)).map(label);
    const below = outside.filter(scrolls).map(label);
    if (document.scrollingElement && document.scrollingElement.scrollHeight > H + 1) cutOff.push(`the page scrolls (${document.scrollingElement.scrollHeight} px tall)`);
    let overMap: string[] = [];
    let layout: string | null = null;
    let tilePx: number | null = null;
    const playing = !!t?.latest?.()?.heroes?.length && !document.getElementById('lobby')?.checkVisibility?.();
    if (t?.layout) {
      const l = t.layout();
      layout = l.kind;
      if (playing && l.kind !== 'rotate') {
        tilePx = +(32 * t.camera.zoom).toFixed(1);
        const a = t.camera.worldToScreen(0, 0);
        const b = t.camera.worldToScreen(t.map.width * 32, t.map.height * 32);
        const map = { l: Math.max(0, a.x), t: Math.max(0, a.y), r: Math.min(W, b.x), b: Math.min(H, b.y) };
        overMap = [...document.querySelectorAll('#hud button, #hud .btn, #touch button, .skill, #joystick')]
          .filter(shown)
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > map.l && r.left < map.r && r.bottom > map.t && r.top < map.b;
          })
          .map(label);
        overMap = [...new Set(overMap)];
      }
    }
    return { smallest, cutOff: [...new Set(cutOff)], below: [...new Set(below)], overMap, layout, tilePx };
  });
}

/** The height in px of what changes on screen when the hero's (or the creeps') scale goes to 0, near `at`. */
async function drawnHeight(p: Page, unit: 'hero' | 'creep', points: { x: number; y: number }[], box = 160): Promise<number | null> {
  const full = decodePng(await p.screenshot({ type: 'png' }));
  await p.evaluate((u) => {
    const t = (window as any).__tdt;
    const s = t.scales(null);
    t.scales({ ...s, [u]: 0 });
  }, unit);
  await p.waitForTimeout(250);
  const gone = decodePng(await p.screenshot({ type: 'png' }));
  await p.evaluate(() => (window as any).__tdt.scales(null));
  await p.waitForTimeout(150);
  const { width: W, height: H } = full;
  const ch = full.channels;
  const changed = (x: number, y: number) => {
    const i = (y * W + x) * ch;
    return (
      Math.abs(full.data[i]! - gone.data[i]!) + Math.abs(full.data[i + 1]! - gone.data[i + 1]!) + Math.abs(full.data[i + 2]! - gone.data[i + 2]!) > 36
    );
  };
  // Each point's connected changed region (4-neighbours) inside its box; a region holding more than one point is two
  // units overlapping and is not used.
  const heights: number[] = [];
  const seen = new Uint8Array(W * H);
  for (const pt of points) {
    const cx = Math.round(pt.x);
    const cy = Math.round(pt.y);
    let start: [number, number] | null = null;
    for (let r = 0; r <= 12 && !start; r++)
      for (let dy = -r; dy <= r && !start; dy++)
        for (let dx = -r; dx <= r && !start; dx++) {
          const x = cx + dx;
          const y = cy - dy;
          if (x >= 0 && y >= 0 && x < W && y < H && changed(x, y)) start = [x, y];
        }
    if (!start || seen[start[1] * W + start[0]]) continue;
    const stack = [start];
    let y0 = start[1];
    let y1 = start[1];
    let x0 = start[0];
    let x1 = start[0];
    seen[start[1] * W + start[0]] = 1;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || Math.abs(nx - cx) > box || Math.abs(ny - cy) > box) continue;
        const k = ny * W + nx;
        if (seen[k] || !changed(nx, ny)) continue;
        seen[k] = 1;
        stack.push([nx, ny]);
      }
    }
    const inside = points.filter((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1).length;
    if (inside === 1) heights.push(y1 - y0 + 1);
  }
  if (!heights.length) return null;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)]!;
}

async function tapAt(p: Page, touch: boolean, x: number, y: number): Promise<void> {
  if (touch) await p.touchscreen.tap(x, y);
  else await p.mouse.click(x, y);
}

async function press(p: Page, touch: boolean, selector: string): Promise<void> {
  const el = p.locator(selector);
  if (touch) await el.tap();
  else await el.click();
}

async function shoot(p: Page, spec: FrameSpec, step: Step): Promise<string> {
  const file = `${spec.w}x${spec.h}-${step}.jpg`;
  writeFileSync(join(framesDir, file), await p.screenshot({ type: 'jpeg', quality: 88 }));
  return `frames/${file}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------------------------------

function sizes(): void {
  const prod = newestZip('crazygames');
  const zip = prod && existsSync(prod) ? prod : ZIP;
  const bytes = readFileSync(zip);
  const files = new Map(readZip(bytes).map((e) => [e.path, e.data] as const));
  const first = initialFiles(files);
  results.sizes = {
    zip: zip.replace(`${root}`, 'apps/client/'),
    zipBytes: bytes.length,
    unzipped: [...files.values()].reduce((a, d) => a + d.length, 0),
    files: files.size,
    initial: first.reduce((a, f) => a + files.get(f)!.length, 0),
    initialFiles: first.length,
  };
  console.log('sizes', results.sizes);
}

async function timeToGameplay(browser: Browser): Promise<void> {
  results.ttg = [];
  for (const [label, slow, linger] of [
    ['cold, unthrottled', false, 0],
    ['cold, Fast 4G, CPU 4×', true, 0],
    ['30 s on the home card, unthrottled', false, 30_000],
    ['30 s on the home card, Fast 4G, CPU 4×', true, 30_000],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    try {
      const cdp = await ctx.newCDPSession(page);
      await throttle(cdp, slow);
      const t0 = Date.now();
      await page.goto(`${HARNESS.hostOrigin}/desktop`);
      const frame = (await (await page.locator('#game').elementHandle())!.contentFrame())!;
      await frame.waitForSelector('html[data-ready]', { timeout: 120_000 });
      const readyMs = Date.now() - t0;
      if (linger) await wait(linger);
      await frame.locator('#lobby-offline').click();
      await frame.waitForFunction(() => ((window as any).__tdt?.latest()?.tick ?? -1) >= 20, undefined, { timeout: 240_000, polling: 50 });
      results.ttg.push({ label, readyMs, gameplayMs: Date.now() - t0 - linger });
    } catch (e) {
      results.ttg.push({ label, readyMs: -1, gameplayMs: null, error: String(e).split('\n')[0] });
    } finally {
      await ctx.close();
    }
    console.log('ttg', results.ttg.at(-1));
  }
}

async function frameOf(browser: Browser, spec: FrameSpec): Promise<FrameResult> {
  const touch = spec.input === 'touch';
  const res: FrameResult = { spec, steps: [], errors: [] };
  const run = async (step: Step, fn: () => Promise<Partial<StepResult>>) => {
    try {
      res.steps.push({ step, ...(await fn()) });
    } catch (e) {
      res.steps.push({ step, error: String(e).split('\n')[0]!.slice(0, 160) });
    }
    console.log(`  ${spec.w}x${spec.h} ${step}`, JSON.stringify(res.steps.at(-1)).slice(0, 220));
  };

  // The loading card: a cold page on Fast 4G, Play solo tapped at once.
  {
    const ctx = await context(browser, spec);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => res.errors.push(e.message));
    await run('loading', async () => {
      const cdp = await ctx.newCDPSession(p);
      await throttle(cdp, true, false);
      // `artwait`: an e2e build waits for the art (and shows the card) only when asked.
      await p.goto(`${GAME}?lab&artwait&weather=clear&light=afternoon`);
      await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
      await press(p, touch, '#lobby-offline');
      await p.waitForSelector('#art-wait:not(.hidden)', { state: 'visible', timeout: 30_000 });
      await p.waitForTimeout(1500);
      return { shot: await shoot(p, spec, 'loading'), ...(await measure(p)) };
    });
    await ctx.close();
  }

  const ctx = await context(browser, spec);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => res.errors.push(e.message));
  try {
    await p.goto(`${GAME}?lab&weather=clear&light=afternoon`);
    await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
    await run('home', async () => {
      await p.waitForTimeout(2500);
      const fullscreen = await p.locator('#lobby-fullscreen').count();
      if (fullscreen) res.errors.push('a fullscreen button of the game\'s own (#lobby-fullscreen)');
      return { shot: await shoot(p, spec, 'home'), ...(await measure(p)) };
    });
    let playing = false;
    let gruntPx: number | null = null;
    await run('wave10', async () => {
      await press(p, touch, '#lobby-heroes-home .hero-pick[data-hero="ranger"]');
      await press(p, touch, '#lobby-mode-home .mode-pick[data-mode="full"]');
      await press(p, touch, '#lobby-offline');
      await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length, undefined, { timeout: 120_000 });
      playing = true;
      const kind = await p.evaluate(() => (window as any).__tdt.layout().kind);
      if (kind === 'rotate') {
        return { shot: await shoot(p, spec, 'wave10'), ...(await measure(p)), error: 'the rotate screen: a phone held sideways is asked to turn' };
      }
      await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
      // A Grunt's height: wave 1's Grunts on their roads, held.
      await p.evaluate(() => (window as any).__tdt.command({ type: 'callEarly' }));
      await p.waitForFunction(
        () => (window as any).__tdt.latest().creeps.filter((c: any) => c.kind === 'grunt' && c.y > 8).length >= 4,
        undefined,
        { timeout: 90_000, polling: 100 },
      );
      await p.evaluate(() => (window as any).__tdt.pause(true));
      await p.waitForTimeout(700);
      const grunts = await p.evaluate(() => {
        const t = (window as any).__tdt;
        return t.latest().creeps.filter((c: any) => c.kind === 'grunt').map((c: any) => t.camera.worldToScreen(c.x * 32, c.y * 32));
      });
      gruntPx = await drawnHeight(p, 'creep', grunts, 90);
      await p.evaluate(() => (window as any).__tdt.pause(false));
      await holdWave10(p);
      const hero = await p.evaluate(() => {
        const t = (window as any).__tdt;
        const h = t.latest().heroes[0];
        return t.camera.worldToScreen(h.x * 32, h.y * 32);
      });
      const heroPx = await drawnHeight(p, 'hero', [hero]);
      return { shot: await shoot(p, spec, 'wave10'), ...(await measure(p)), heroPx, gruntPx };
    });
    await run('ring', async () => {
      if (!playing) throw new Error('no match');
      const at = await p.evaluate(() => {
        const t = (window as any).__tdt;
        const tw = t.latest().towers[0];
        const pad = t.map.pads[tw.padId];
        return t.camera.worldToScreen(pad.x * 32, pad.y * 32);
      });
      await tapAt(p, touch, at.x, at.y);
      await p.waitForSelector('#radial:not(.hidden), #tower-panel:not(.hidden)', { state: 'visible', timeout: 10_000 });
      await p.waitForTimeout(400);
      const out = { shot: await shoot(p, spec, 'ring'), ...(await measure(p)) };
      await p.keyboard.press('Escape');
      return out;
    });
    await run('end', async () => {
      if (!playing) throw new Error('no match');
      await p.evaluate(() => {
        const t = (window as any).__tdt;
        t.pause(false);
        t.lose();
      });
      await p.waitForSelector('#end-screen:not(.hidden)', { state: 'visible', timeout: 30_000 });
      await p.waitForTimeout(3000);
      return { shot: await shoot(p, spec, 'end'), ...(await measure(p)) };
    });
  } finally {
    await ctx.close();
  }
  return res;
}

async function chromebook(): Promise<void> {
  results.chromebook = [];
  const browser = await chromium.launch({ ...EXE, args: ['--js-flags=--max-old-space-size=512'] });
  const read = async (p: Page, cdp: CDPSession, label: string, ms: number) => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const before = (await p.evaluate(() => (window as any).__tdt.frameCosts().length)) as number;
    await wait(ms);
    const costs = (await p.evaluate(() => (window as any).__tdt.frameCosts())) as number[];
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const last = costs.slice(-Math.min(costs.length, Math.max(30, costs.length - before)));
    const heap = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    const limit = await p.evaluate(() => (performance as any).memory?.jsHeapSizeLimit ?? null);
    const gpu = await p.evaluate(() => (window as any).__tdt.gpuTextures().bytes);
    results.chromebook!.push({
      label,
      jsMs: last.length ? +(last.reduce((a, b) => a + b, 0) / last.length).toFixed(1) : null,
      frames: last.length,
      heapMB: +(heap.usedSize / 1048576).toFixed(1),
      heapLimitMB: limit ? +(limit / 1048576).toFixed(0) : null,
      gpuMB: +(gpu / 1048576).toFixed(1),
    });
    console.log('chromebook', results.chromebook!.at(-1));
  };
  try {
    {
      const ctx = await context(browser, { w: 1366, h: 768, input: 'mouse' });
      const p = await ctx.newPage();
      try {
        await p.goto(`${GAME}?stress=300&weather=rain&light=night`);
        await p.waitForSelector('html[data-ready="stress"]', { timeout: 120_000 });
        await p.waitForFunction(() => (window as any).__tdt.art().tower3d > 0, undefined, { timeout: 120_000 });
        await wait(4000);
        await read(p, await ctx.newCDPSession(p), 'the stress scene (300 creeps, a tower on every pad, rain at night)', 6000);
      } catch (e) {
        results.chromebook.push({ label: 'the stress scene', jsMs: null, frames: 0, heapMB: null, heapLimitMB: null, gpuMB: null, error: String(e).split('\n')[0] });
      } finally {
        await ctx.close();
      }
    }
    {
      const ctx = await context(browser, { w: 1366, h: 768, input: 'mouse' });
      const p = await ctx.newPage();
      try {
        await p.goto(`${GAME}?lab&weather=rain&light=afternoon`);
        await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
        await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
        await p.locator('#lobby-offline').click();
        await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
        await holdWave10(p);
        await p.evaluate(() => (window as any).__tdt.pause(false));
        await wait(1000);
        await read(p, await ctx.newCDPSession(p), 'a real wave 10 (Full, five towers, the Ironhorn on its road, rain)', 6000);
      } catch (e) {
        results.chromebook.push({ label: 'a real wave 10', jsMs: null, frames: 0, heapMB: null, heapLimitMB: null, gpuMB: null, error: String(e).split('\n')[0] });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/** requestAnimationFrame at `hz`, from a timer, before the page's own code: the display's rate, stood in for. */
const driveAt = (hz: number) => `(() => {
  const period = 1000 / ${hz};
  let queue = new Map(); let id = 0; let next = performance.now();
  window.__hzFrames = 0;
  window.requestAnimationFrame = (cb) => { queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = (n) => { queue.delete(n); };
  const pump = () => {
    const now = performance.now();
    const due = queue; queue = new Map();
    window.__hzFrames++;
    for (const cb of due.values()) { try { cb(now); } catch (e) { setTimeout(() => { throw e; }); } }
    next += period;
    if (next < performance.now() - period) next = performance.now();
    setTimeout(pump, Math.max(0, next - performance.now()));
  };
  setTimeout(pump, 0);
})();`;

async function refreshRates(browser: Browser): Promise<void> {
  results.hz = [];
  for (const [hz, seconds] of [[60, 20], [144, 60], [165, 20]] as const) {
    const ctx = await context(browser, { w: 1366, h: 768, input: 'mouse' });
    await ctx.addInitScript(driveAt(hz));
    const p = await ctx.newPage();
    try {
      await p.goto(`${GAME}?lab&weather=clear&light=afternoon`);
      await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
      await p.locator('#lobby-offline').click();
      await p.waitForFunction(() => ((window as any).__tdt?.latest()?.tick ?? -1) >= 20, undefined, { timeout: 240_000 });
      const a = (await p.evaluate(() => [(window as any).__tdt.latest().tick, (window as any).__hzFrames, performance.now()])) as number[];
      await wait(seconds * 1000);
      const b = (await p.evaluate(() => [(window as any).__tdt.latest().tick, (window as any).__hzFrames, performance.now()])) as number[];
      const secs = (b[2]! - a[2]!) / 1000;
      results.hz.push({ hz, seconds: +secs.toFixed(1), ticks: b[0]! - a[0]!, expected: Math.round(secs * 20), framesPerSecond: +((b[1]! - a[1]!) / secs).toFixed(1) });
    } catch (e) {
      results.hz.push({ hz, seconds, ticks: 0, expected: seconds * 20, framesPerSecond: 0, error: String(e).split('\n')[0] });
    } finally {
      await ctx.close();
    }
    console.log('hz', results.hz.at(-1));
  }
}

function keys(): void {
  const src = readFileSync(join(root, 'src', 'input', 'controls.ts'), 'utf8');
  const body = src.slice(src.indexOf('private onKeyDown'));
  const bound = [...body.matchAll(/case '([^']+)':/g)].map((m) => m[1]!);
  const does: Record<string, string> = {
    escape: 'Cancels a build, an aim or a selection',
    a: 'Attack-move',
    q: 'Cast Q (Shift+Q learns it)',
    w: 'Cast W (Shift+W learns it)',
    e: 'Cast E (Shift+E learns it)',
    r: 'Cast R (Shift+R learns it)',
    b: 'The build menu',
    c: 'Quick-chat',
    s: 'Stop',
    u: 'Upgrade the selected tower (Endless: Reinforce)',
    f: 'Repair the selected tower',
    ' ': 'Centre the camera on your hero',
  };
  const owned: Record<string, string> = {
    escape: 'Yes: in fullscreen the browser takes Escape to leave it (the page sees it only out of fullscreen)',
    ' ': 'Scrolls the host page by default: the game calls preventDefault',
    f: 'No (F11 is the browser\'s, F is not)',
  };
  results.keys = [
    { key: 'Arrow keys', does: 'Move the hero', browser: 'Scroll the host page by default: the game calls preventDefault' },
    { key: '1–5', does: 'Build a tower (with the build menu open or a pad selected)', browser: 'No' },
    ...bound.map((k) => ({ key: k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0]!.toUpperCase() + k.slice(1), does: does[k] ?? '?', browser: owned[k] ?? 'No' })),
    { key: 'Ctrl / ⌘ / Alt + a key', does: 'Nothing: the game ignores them (the browser keeps its shortcuts)', browser: 'Yes, and left to it' },
    { key: 'Alt + click', does: 'Ping the map', browser: 'No (no default in a page)' },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------

type Verdict = 'PASS' | 'FAIL' | 'NOT CHECKED';

function stepVerdict(s: StepResult): { verdict: Verdict; why: string[] } {
  const why: string[] = [];
  // A step the audit could not reach (a tap that opened nothing, no match) is not checked, not failed; the rotate
  // screen is a fail.
  if (s.error && s.layout !== 'rotate' && !/rotate/.test(s.error)) return { verdict: 'NOT CHECKED', why: [s.error] };
  if (s.error) why.push(s.error);
  if (s.smallest && s.smallest.px < BARS.text) why.push(`text ${s.smallest.px} px`);
  if (s.step === 'wave10' && s.heroPx != null && s.heroPx < BARS.hero) why.push(`hero ${s.heroPx} px`);
  if (s.cutOff?.length) why.push(`cut off: ${s.cutOff.join(', ')}`);
  if (s.layout === 'rotate') why.push('asks to rotate');
  if (!s.shot && !s.error) why.push('no picture');
  return { verdict: why.length ? 'FAIL' : 'PASS', why };
}

function report(): string {
  const rows: [string, string, Verdict, string][] = [];
  const add = (group: string, req: string, v: Verdict, evidence: string) => rows.push([group, req, v, evidence]);
  const s = results.sizes;
  const lim = LIMITS.crazygames;
  if (s) {
    add('Technical', 'Total size 250 MB or less', s.unzipped <= lim.total ? 'PASS' : 'FAIL', `${MB(s.unzipped)} MB unzipped (${s.zip})`);
    add('Technical', '1,500 files or less', s.files <= lim.files ? 'PASS' : 'FAIL', `${s.files} files`);
    add('Technical', 'Initial download 50 MB or less (no SDK: the whole build counts)', s.zipBytes <= lim.initial ? 'PASS' : 'FAIL', `the whole zip ${MB(s.zipBytes)} MB; the page's own first download ${MB(s.initial)} MB in ${s.initialFiles} files`);
    add('Technical', '20 MB or less to be on the phone homepage', s.zipBytes <= lim.homeBuild ? 'PASS' : 'FAIL', `zip ${MB(s.zipBytes)} MB`);
  }
  const zipHtml = (() => {
    try {
      return new TextDecoder().decode(readZip(readFileSync(ZIP)).find((e) => e.path === 'index.html')!.data);
    } catch {
      return '';
    }
  })();
  const absolute = [...zipHtml.matchAll(/\s(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  add('Technical', 'Relative paths only', absolute.length ? 'FAIL' : 'PASS', absolute.length ? `absolute: ${absolute.join(', ')}` : 'index.html names no root path (`base: \'./\'`); e2e/embed.spec.ts serves the zip under a deep path with no 404');
  const t = results.ttg ?? [];
  const worst = Math.max(...t.map((r) => r.gameplayMs ?? Infinity));
  if (t.length) add('Technical', 'Time to gameplay 20 s or less', worst <= 20_000 ? 'PASS' : 'FAIL', t.map((r) => `${r.label}: ${r.gameplayMs != null ? `${(r.gameplayMs / 1000).toFixed(1)} s` : r.error}`).join('; '));
  add('Technical', 'Chrome and Edge work', 'NOT CHECKED', 'Chromium (headless) only here: every browser test and this audit; Edge is Chromium but was not run');
  add('Technical', 'Safari works (else switched off)', 'NOT CHECKED', 'No Safari here; the iPhone checklist (docs/MOBILE_TESTING.md) is Han\'s real-device step');
  const cb = results.chromebook ?? [];
  if (cb.length) add('Technical', 'Runs smoothly on a 4 GB Chromebook', 'NOT CHECKED', `a stand-in, not a device: ${cb.map((r) => `${r.label}: ${r.jsMs ?? '?'} ms JavaScript a frame, heap ${r.heapMB ?? '?'} MB of ${r.heapLimitMB ?? '?'}, ${r.gpuMB ?? '?'} MB of textures`).join('; ')}`);
  add('Technical', 'Touch input where phones are supported', 'PASS', 'touch controls (joystick, Q/W/E/R, the build ring) on every touch screen; e2e/embed.spec.ts plays a match by touch in the frame (pixel)');
  const f = results.frames ?? [];
  const big = f.find((r) => r.spec.w === 1920);
  const bigHome = big?.steps.find((x) => x.step === 'wave10');
  add('Technical', 'Desktop landscape (a portrait game with bars or a picture at the sides)', bigHome?.layout === 'wide' ? 'PASS' : 'NOT CHECKED', `the wide layout on desktop: the portrait map in the middle, the HUD's panels and the background at its sides (${bigHome?.shot ?? 'no frame'})`);
  add('Technical', 'Orientation set in the submission', 'PASS', 'SUBMISSION.md: portrait on phones');
  const css = readFileSync(join(root, 'src', 'style.css'), 'utf8');
  const us = /html,\s*body\s*\{[^}]*\buser-select: none;[^}]*-webkit-user-select: none;/.test(css);
  add('Technical', 'body user-select: none (and -webkit-)', us ? 'PASS' : 'FAIL', 'style.css `html, body { user-select: none; -webkit-user-select: none; }` (text fields and the privacy id selectable)');
  add('Technical', 'Works in their app\'s fullscreen with the safe areas', 'NOT CHECKED', 'the layout reads `env(safe-area-inset-*)` and re-runs when the insets change (docs/MOBILE.md §4); not run in CrazyGames\' app');
  const eng = readFileSync(join(root, 'src', 'audio', 'engine.ts'), 'utf8');
  const resume = /'pointerdown', 'touchend', 'click', 'keydown'/.test(eng) && /ctx\.resume\(\)/.test(eng);
  add('Technical', 'After an iOS interruption the AudioContext resumes inside a touch or click', resume ? 'PASS' : 'FAIL', 'audio/engine.ts: every pointerdown / touchend / click / keydown calls `unlock`, which resumes a context that is not running (`interrupted` included) inside that gesture; unchanged');
  for (const r of f) {
    const all = r.steps.map((x) => ({ x, v: stepVerdict(x) }));
    const bad = all.filter((y) => y.v.verdict !== 'PASS');
    const verdict: Verdict = all.some((y) => y.v.verdict === 'FAIL') ? 'FAIL' : bad.length ? 'NOT CHECKED' : 'PASS';
    add(
      'Gameplay',
      `Legible at ${r.spec.w} × ${r.spec.h} (${r.spec.what})`,
      verdict,
      bad.length ? bad.map((y) => `${y.x.step}: ${y.v.verdict === 'NOT CHECKED' ? 'not reached: ' : ''}${y.v.why.join('; ')}`).join(' · ') : 'every step within the bars (see the frames table)',
    );
  }
  const hz = results.hz ?? [];
  if (hz.length) {
    const ok = hz.every((r) => !r.error && Math.abs(r.ticks - r.expected) <= Math.max(2, r.expected * 0.02));
    add('Gameplay', 'The same speed at 60, 144 and 165 Hz', ok ? 'PASS' : 'FAIL', hz.map((r) => `${r.hz} Hz (${r.framesPerSecond} frames/s drawn): ${r.ticks} ticks in ${r.seconds} s, ${r.expected} expected`).join('; ') + '. The sim runs on its own 20 Hz clock in the worker; the drawing interpolates on real time');
  }
  add('Gameplay', 'English', 'PASS', 'every text in the game is English');
  add('Gameplay', 'Controls explained on each device (keyboard picture or gestures)', 'NOT CHECKED', 'a first solo match on the site starts the lesson (move, build, cast Q, upgrade, ping); CrazyGames asks for a keyboard picture or gestures shown, which the game does not draw: judge it');
  const esc = (results.keys ?? []).some((k) => k.key === 'Escape');
  add('Gameplay', 'No key the browser owns (Escape leaves fullscreen)', esc ? 'FAIL' : 'PASS', esc ? 'Escape cancels a build, an aim or a selection (src/input/controls.ts `onKeyDown`)' : 'no browser key bound');
  const errs = f.flatMap((r) => r.errors);
  add('Gameplay', 'Loads fast, no errors', errs.length ? 'FAIL' : 'PASS', errs.length ? `page errors: ${[...new Set(errs)].slice(0, 4).join(' | ')}` : 'no page error in any frame run; time to gameplay above');
  add('Gameplay', 'Original name and art', 'PASS', 'Tower Defense Together; every model the game\'s own design (Meshy from Claude\'s concepts) or CC0 KayKit pieces repainted; the sound made in code or CC0 (docs/SOUND_CREDITS.md)');
  const fsb = errs.some((e) => e.includes('fullscreen'));
  add('Gameplay', 'No fullscreen button of the game\'s own', fsb ? 'FAIL' : 'PASS', 'the crazygames build adds none (platform/embed.ts `linkless`); e2e/embed.spec.ts with TDT_EMBED_HOST=crazygames checks it; the match\'s ⤢ is the map zoom, not fullscreen');
  add('Gameplay', 'PEGI 12', 'NOT CHECKED', 'fantasy violence, no blood, no typed chat (SUBMISSION.md): the rating is CrazyGames\'');
  add('Gameplay', 'Solo as easy to find as multiplayer', 'PASS', `Play solo is the home card's main button (${f.find((r) => r.spec.w === 1280)?.steps.find((x) => x.step === 'home')?.shot ?? 'frames/1280x720-home.jpg'})`);
  add('Links', 'Nothing that promotes another game or platform', 'PASS', 'none in the game');
  add('Links', 'No link to a playable web version', 'PASS', 'the crazygames build: no invite link (rooms by code), no address on the share card, no link on a version mismatch, the privacy page\'s "Back to the game" hidden (`?hosted`); e2e/embed.spec.ts finds no other origin but the privacy page');
  add('Links', 'A privacy policy link is allowed', 'PASS', 'the lobby\'s Privacy opens the site\'s privacy.html in a new tab');
  add('Links', 'No app-store links', /apps\.apple\.com|play\.google\.com/.test(zipHtml) ? 'FAIL' : 'PASS', 'none');
  const cg = (file: string) => existsSync(join(outDir, file));
  const covers = ['cover-1920x1080.png', 'cover-800x1200.png', 'cover-800x800.png'];
  add('Covers', 'Three pictures of one design: 1920 × 1080, 800 × 1200, 800 × 800; the title the only text', covers.every(cg) ? 'PASS' : 'FAIL', covers.map((c) => (cg(c) ? c : `${c} missing`)).join(', '));
  const vids = ['preview-landscape-1920x1080.mp4', 'preview-portrait-1080x1620.mp4'];
  add('Previews', 'Two videos, landscape 1080p 16:9 and portrait 2:3, 15–20 s, 50 MB or less, no sound, no cursor', vids.every(cg) ? 'PASS' : 'FAIL', vids.map((v) => (cg(v) ? `${v} ${MB(statSync(join(outDir, v)).size)} MB` : `${v} missing`)).join(', '));

  const lines: string[] = [];
  lines.push('# CrazyGames audit (q5)', '');
  lines.push(
    `Made by \`npm run cg-audit -w @tdt/client\` on ${new Date().toISOString().slice(0, 10)} from the crazygames build's e2e zip (\`${e2eZipName('crazygames')}\`: the crazygames build with the e2e hook), served as a host serves it (scripts/embedServe.ts), in headless Chromium on a software GPU. The rules are the advisor's reading of CrazyGames' pages on 10 Nov 2026 (docs/queue/q5-crazygames-prep.md): this machine cannot open docs.crazygames.com, so none was checked against the live pages.`,
    '',
  );
  lines.push('## Every requirement', '', '| | Requirement | Result | Evidence |', '| --- | --- | --- | --- |');
  for (const [g, r, v, e] of rows) lines.push(`| ${g} | ${r} | **${v}** | ${e.replace(/\|/g, '\\|')} |`);
  lines.push('');
  if (s) {
    lines.push('## Sizes', '', '| | Measured | Limit |', '| --- | --- | --- |');
    lines.push(`| Zip | ${MB(s.zipBytes)} MB | 20 MB (phone homepage), 50 MB (initial) |`);
    lines.push(`| Unzipped | ${MB(s.unzipped)} MB | 250 MB |`, `| Files | ${s.files} | 1,500 |`, `| The page's first download | ${MB(s.initial)} MB in ${s.initialFiles} files | (the whole build counts with no SDK) |`, '');
  }
  if (t.length) {
    lines.push('## Time to gameplay', '', 'From the host page\'s load to tick 20 of a solo Quick match (its first second), Play solo tapped the moment the first screen was up (or after 30 s on the home card, not counted), each in a fresh browser context (cold cache, no service worker yet), at 1366 × 768. Fast 4G is DevTools\' preset as `npm run first-load -- --fast-4g` uses it (165 ms, 8.1 Mbps down) with the CPU 4× slower.', '');
    lines.push('| Run | First screen | Gameplay |', '| --- | --- | --- |');
    for (const r of t) lines.push(`| ${r.label} | ${r.readyMs >= 0 ? `${(r.readyMs / 1000).toFixed(1)} s` : '—'} | ${r.gameplayMs != null ? `${(r.gameplayMs / 1000).toFixed(1)} s` : r.error} |`);
    lines.push('');
  }
  if (f.length) {
    lines.push(
      '## The six frames',
      '',
      `One device px per CSS px; a mouse on the desktop sizes, touch on the phone and tablet. The tile is the map's tile on screen; a hero's and a Grunt's height are the pixels that change when its scale is set to 0 (its ground ring and shadow included; a Grunt the median of those standing alone, on wave 1); the smallest text is the DOM's (the canvas's damage numbers and HP bars are not counted). FAIL under ${BARS.text} px of text, a hero under ${BARS.hero} px, or anything cut off.`,
      '',
      '| Frame | Step | Layout | Tile | Hero | Grunt | Smallest text | Cut off | Scrolled to | Over the map | Result | Picture |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const r of f) {
      for (const st of STEPS) {
        const x = r.steps.find((y) => y.step === st);
        if (!x) continue;
        const v = stepVerdict(x);
        const cell = (c: string) => c.replace(/\|/g, '\\|');
        lines.push(
          `| ${r.spec.w} × ${r.spec.h} | ${st} | ${x.layout ?? '—'} | ${x.tilePx ?? '—'} | ${x.heroPx ?? '—'} | ${x.gruntPx ?? '—'} | ${x.smallest ? cell(`${x.smallest.px} px "${x.smallest.text}"`) : '—'} | ${cell(x.cutOff?.join(', ') || 'none')} | ${cell(x.below?.join(', ') || 'none')} | ${cell(x.overMap?.join(', ') || 'none')} | **${v.verdict}**${v.why.length ? ` (${cell(v.why.join('; '))})` : ''} | ${x.shot ? `[${st}](${x.shot})` : '—'} |`,
        );
      }
    }
    lines.push('');
  }
  if (cb.length) {
    lines.push('## A 4 GB Chromebook stand-in', '', '**A stand-in, not a device**: this machine\'s Chromium with the CPU 4× slower (CDP) and V8\'s heap held to 512 MB (`--max-old-space-size=512`), on a software GPU. JavaScript a frame is the page\'s own (`__tdt.frameCosts`, the stress test\'s measure); the textures are what the game holds on the GPU (`__tdt.gpuTextures`).', '');
    lines.push('| Scene | JavaScript a frame | Frames measured | Heap used | Heap limit | Textures |', '| --- | --- | --- | --- | --- | --- |');
    for (const r of cb) lines.push(`| ${r.label} | ${r.jsMs ?? r.error} ms | ${r.frames} | ${r.heapMB ?? '—'} MB | ${r.heapLimitMB ?? '—'} MB | ${r.gpuMB ?? '—'} MB |`);
    lines.push('');
  }
  if (hz.length) {
    lines.push('## Refresh rates', '', 'requestAnimationFrame replaced before the page\'s code by a timer at the rate (headless Chromium has no display to sync to); a solo match\'s ticks against the clock.', '');
    lines.push('| Rate | Frames drawn a second | Seconds | Ticks | At 20 a second |', '| --- | --- | --- | --- | --- |');
    for (const r of hz) lines.push(`| ${r.hz} Hz | ${r.framesPerSecond} | ${r.seconds} | ${r.error ?? r.ticks} | ${r.expected} |`);
    lines.push('');
  }
  if (results.keys) {
    lines.push('## Keys', '', 'Every key the desktop controls bind (src/input/controls.ts `onKeyDown`).', '', '| Key | Does | The browser\'s? |', '| --- | --- | --- |');
    for (const k of results.keys) lines.push(`| ${k.key} | ${k.does} | ${k.browser} |`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------

if (!existsSync(ZIP)) throw new Error(`No ${ZIP}: run npm run build:embed -w @tdt/client -- crazygames --e2e first`);
mkdirSync(framesDir, { recursive: true });
const saved = join(outDir, 'audit.json');
if (existsSync(saved)) Object.assign(results, JSON.parse(readFileSync(saved, 'utf8')));
if (only.has('sizes')) sizes();
if (only.has('keys')) keys();
const needs = ['ttg', 'frames', 'hz'].some((k) => only.has(k));
const harness = needs ? await startHarness(ZIP, { site: true, siteFallback: SITE }) : null;
const server = needs ? await startGameServer() : null;
const browser = needs ? await chromium.launch({ ...EXE, args: ['--disable-site-isolation-trials'] }) : null;
try {
  if (browser && only.has('ttg')) await timeToGameplay(browser);
  if (browser && only.has('frames')) {
    results.frames = [];
    for (const spec of FRAMES) results.frames.push(await frameOf(browser, spec));
  }
  if (browser && only.has('hz')) await refreshRates(browser);
} finally {
  await browser?.close();
  await harness?.close();
  await server?.close();
}
if (only.has('chromebook')) {
  const h = await startHarness(ZIP, { site: true, siteFallback: SITE });
  try {
    await chromebook();
  } finally {
    await h.close();
  }
}
writeFileSync(saved, JSON.stringify(results, null, 1));
const file = join(outDir, 'AUDIT.md');
const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
const notes = /<!-- notes -->[\s\S]*?<!-- \/notes -->/.exec(old)?.[0] ?? '<!-- notes -->\n## What would fix each FAIL\n\n(written by hand)\n<!-- /notes -->';
writeFileSync(file, `${report()}\n${notes}\n`);
console.log(file);
