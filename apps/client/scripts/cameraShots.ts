// `npm run camera-shots -w @tdt/client [-- --build 2|3] [--only meteor,quake,rain,heart] [--out DIR]`, after `npm run build:e2e -w @tdt/client`: V-08b's
// pictures (docs/ART.md §16 "The camera") into docs/screenshots/camera/.
//
// `--build 3` (the default since build 3): the effects, the weather and the fallbacks on the pitched ground, each at
// 412 × 839 (2×) and 1280 × 800:
//   build-3-meteor-rain-{phone,desktop}.webp  the stress scene (`?stress=24&combo=meteorRain`): a Meteor Rain falling,
//                                             its warning rings and scorches lying on the ground, the meteors upright
//   build-3-quake-{phone,desktop}.webp        the same scene a moment after its Rampart Slam: the quake's cracks running
//                                             along Mid as the lane is drawn, its ring an ellipse
//   build-3-rain-night-{phone,desktop}.webp   a solo Full match at wave 10 in rain at night: splashes on the roads and on
//                                             the pads' raised tops, five towers round the map's middle
//   build-3-heart-cracked-{phone,desktop}.webp  a solo Full match left undefended at wave 10 until the Heart is under 60%
// `--build 2`: the plate and the structures at the pitch (a solo Full match, wave 10 held with five towers and clear
// weather, the light forced): the phone in each of the three lights, the desktop in the afternoon, the tap test of each
// (every 4 px of the map coloured by what a tap there picks, each target's box and each pad's ground square drawn; it
// stops if a tap inside a pad's box lands off its ground), and the three phone frames side by side in
// docs/art/camera-b-wave10.png. Build 1's pictures (`build-1-*`, with the camera before V-08b, `?pitch=0`) are kept as
// they were; that switch is gone, so they are not made again.
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
const out = path(arg('out', join(repo, 'docs', 'screenshots', 'camera')));
const BUILD = arg('build', '3');
/** Build 3's scenes to make (`--only meteor,quake,rain,heart`), all by default. */
const ONLY = new Set(arg('only', 'meteor,quake,rain,heart').split(','));
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
/** The towers round the map's middle (tiles, the pad nearest), and their tiers: the held moment of camera-options.md. */
const TOWERS: [number, number, string, number][] = [
  [9.5, 18, 'cannon', 2],
  [16.5, 18, 'arrow', 3],
  [2.5, 22, 'frost', 1],
  [9.5, 22, 'arcane', 3],
  [23.5, 22, 'flak', 2],
];

mkdirSync(out, { recursive: true });

async function context(browser: Browser, desktop: boolean) {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: DESKTOP, deviceScaleFactor: 1, serviceWorkers: 'block' }
      : { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' },
  );
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  return ctx;
}

/** A solo Full match on the Ranger, every sheet in, the light and the weather forced. */
async function solo(browser: Browser, desktop: boolean, light: string, weather: string): Promise<Page> {
  const p = await (await context(browser, desktop)).newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${url}?lab&weather=${weather}&light=${light}`);
  await p.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await p.locator('#lobby-offline').click();
  await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
  const seen = await p.evaluate(() => (window as any).__tdt.view());
  if (seen.pitch !== 30) throw new Error(`the page draws ${seen.pitch}°, not 30°`);
  return p;
}

async function page(browser: Browser, desktop: boolean, light = 'afternoon', weather = 'clear'): Promise<Page> {
  const p = await solo(browser, desktop, light, weather);
  await build(p);
  await reach(p);
  return p;
}

/** The stress scene with every fuse a Meteor Rain (stress.ts: a 240-tick cycle), its sheets in, held in a window of it. */
async function stress(browser: Browser, desktop: boolean, from: number, to: number, settle = 500): Promise<Page> {
  const p = await (await context(browser, desktop)).newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${url}?stress=24&combo=meteorRain&weather=clear`);
  // The scene's creeps reach the Heart all the time: its leak alerts (the lane's big word and the clutch ping) would
  // stand over the effects these pictures are for.
  await p.addStyleTag({ content: '#lane-clutch, .ping.clutch, .clutch-ring { display: none !important; }' });
  await p.waitForFunction(() => !!(window as any).__tdt?.latest(), undefined, { timeout: 60_000 });
  await p.waitForSelector('html[data-plate="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
  // The moment asked for in a cycle (the sheets are in: the selector above). The scene's clock is a timer on the main
  // thread, so on a software GPU it moves about a tick a drawn frame and the window is never skipped.
  await p.waitForFunction(
    ([from, to]) => {
      const t = (window as any).__tdt.latest()?.tick ?? 0;
      return t % 240 >= from && t % 240 <= to;
    },
    [from, to] as const,
    { timeout: 180_000, polling: 20 },
  );
  // Held there (stress.ts: no tick is made while paused), so the meteors and the quake's front stand still.
  await p.evaluate(() => (window as any).__tdt.pause(true));
  if (settle > 0) await p.waitForTimeout(settle);
  return p;
}

/** The Heart left undefended at wave 10 until it is under 55% (cracked), then held. */
async function cracked(p: Page): Promise<void> {
  await p.evaluate(() => (window as any).__tdt.skipTo(10));
  const frac = () => p.evaluate(() => {
    const s = (window as any).__tdt.latest();
    return s.heartHp / s.heartMaxHp;
  }) as Promise<number>;
  for (let i = 0; i < 600 && (await frac()) > 0.55; i++) await p.waitForTimeout(250);
  await p.evaluate(() => (window as any).__tdt.pause(true));
  console.log(`the Heart at ${Math.round((await frac()) * 100)}%`);
  await p.waitForTimeout(900);
}

/** The five towers, as the controls would build them, then the hero walked up to their row. */
async function build(p: Page): Promise<void> {
  for (const [x, y, kind, tier] of TOWERS) {
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
      [x, y] as const,
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
  await p.evaluate(() => (window as any).__tdt.command({ type: 'move', x: 13, y: 20 }));
}

/** Wave 10 running, its creeps (and its boss) out on the roads; then the simulation is paused. */
async function reach(p: Page): Promise<void> {
  await p.evaluate(() => (window as any).__tdt.skipTo(10));
  await p.waitForFunction(
    () => {
      const t = (window as any).__tdt;
      const s = t.latest();
      const out = s.creeps.filter((c: any) => c.y > 8).length;
      const boss = s.creeps.some((c: any) => t.tuning.creeps[c.kind].boss && c.y > 8);
      return s.wave === 10 && out >= 8 && boss && t.art().creep3d >= out;
    },
    undefined,
    { timeout: 90_000, polling: 100 },
  );
  await p.evaluate(() => (window as any).__tdt.pause(true));
  await p.waitForTimeout(700);
}

/** A label over the map's top left, under the top bar: what the picture is. */
async function label(p: Page, text: string): Promise<void> {
  await p.evaluate((text) => {
    const l = (window as any).__tdt.layout();
    const d = document.createElement('div');
    d.id = 'camera-label';
    d.textContent = text;
    Object.assign(d.style, {
      position: 'fixed',
      left: `${Math.round(l.map.left + 6)}px`,
      top: `${Math.round((l.kind === 'tall' ? l.topBarBottom : l.map.top) + 6)}px`,
      zIndex: '9999',
      padding: '3px 7px',
      font: '600 11px/1.3 system-ui, sans-serif',
      color: '#fff',
      background: 'rgba(10, 12, 20, 0.78)',
      borderRadius: '4px',
      pointerEvents: 'none',
      // Narrow, so it stays left of the chips centred under the top bar (the Air chip in a wave with flyers).
      maxWidth: '150px',
    });
    document.body.append(d);
  }, text);
}

/** The tap test (see the file's head), drawn over the page; returns how many sample points disagree with the ground. */
async function tapOverlay(p: Page): Promise<{ points: number; pads: number; wrong: number }> {
  return p.evaluate(() => {
    const t = (window as any).__tdt;
    const l = t.layout();
    const cam = t.camera;
    const map = t.map;
    const c = document.createElement('canvas');
    c.id = 'tap-overlay';
    const dpr = window.devicePixelRatio;
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: `${innerWidth}px`, height: `${innerHeight}px`, zIndex: '9998', pointerEvents: 'none' });
    document.body.append(c);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const colour: Record<string, string> = { pad: 'rgba(80, 220, 120, 0.55)', tower: 'rgba(255, 200, 60, 0.6)', creep: 'rgba(255, 80, 80, 0.6)' };
    const top = Math.max(l.map.top, l.kind === 'tall' ? l.topBarBottom : 0);
    const bottom = Math.min(l.map.bottom, l.controls && l.kind === 'tall' ? l.controls.top : innerHeight);
    let points = 0;
    let wrong = 0;
    for (let y = top + 2; y < bottom; y += 4) {
      for (let x = l.map.left + 2; x < l.map.right; x += 4) {
        const r = t.tapAt(x, y);
        if (r.type === 'none') continue;
        points++;
        const pick = r.type === 'pick' ? r.pick : null;
        g.fillStyle = pick ? colour[pick.kind]! : 'rgba(190, 120, 255, 0.65)';
        g.fillRect(x - 1, y - 1, 2, 2);
        // Inside a pad's drawn box, the tap must pick the pad whose ground square holds the ground under it.
        if (pick?.kind === 'pad' && pick.d === 0) {
          const w = cam.screenToWorld(x, y);
          const pad = map.pads[pick.id];
          const tx = w.x / 32;
          const ty = w.y / 32;
          const inside = tx >= pad.x - 1.5 - 1e-6 && tx <= pad.x + 1.5 + 1e-6 && ty >= pad.y - 1.5 - 1e-6 && ty <= pad.y + 1.5 + 1e-6;
          if (!inside) {
            wrong++;
            g.fillStyle = '#ff2050';
            g.fillRect(x - 2, y - 2, 4, 4);
          }
        }
      }
    }
    let pads = 0;
    for (const q of t.tapTargets()) {
      g.lineWidth = 1.5;
      g.strokeStyle = q.kind === 'pad' ? '#38d36b' : q.kind === 'tower' ? '#ffc83c' : '#ff5050';
      if (q.shape === 'circle') {
        g.beginPath();
        g.arc(q.at.x, q.at.y, q.half, 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      const hy = q.halfY ?? q.half;
      const rise = q.rise ?? 0;
      g.strokeRect(q.at.x - q.half, q.at.y - hy - rise, q.half * 2, hy * 2 + rise);
    }
    // Each pad's ground square, drawn through the camera: it lies on the boxes.
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    for (const q of t.latest().pads) {
      const pad = map.pads[q.id];
      const a = cam.worldToScreen((pad.x - 1.5) * 32, (pad.y - 1.5) * 32);
      const b = cam.worldToScreen((pad.x + 1.5) * 32, (pad.y + 1.5) * 32);
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      pads++;
    }
    return { points, pads, wrong };
  });
}

async function shoot(p: Page, name: string): Promise<string> {
  const png = join(out, `${name}.png`);
  await p.screenshot({ path: png });
  return png;
}

function webp(png: string, name: string): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '84', join(out, `${name}.webp`)]);
}

const README_3 = `# The tilted camera (V-08b)

Made by \`npm run camera-shots -w @tdt/client\` after \`npm run build:e2e -w @tdt/client\` (docs/ART.md §6, §15 "The tilted
camera", §16 "The camera"). One camera, 30° from straight down (B).

**Build 3 of 4: the effects, the weather and the fallbacks on the pitched ground** (\`--build 3\`, the default). Each at
412 × 839 (2×) and 1280 × 800:

- \`build-3-meteor-rain-phone.webp\`, \`-desktop\`: the stress scene (\`?stress=24&combo=meteorRain\`) with a Meteor Rain
  falling: the warning circles and the scorches lie on the ground (ellipses), the meteors fall straight down the screen
  onto them, the strike rings flat.
- \`build-3-quake-phone.webp\`, \`-desktop\`: the same scene a moment after its Rampart Slam: the quake's cracks running
  along Mid as the lane is drawn, its ring an ellipse. The stress scene's leak alerts (its creeps reach
  the Heart all the time) are hidden, so they do not stand over the quake.
- \`build-3-rain-night-phone.webp\`, \`-desktop\`: a solo Full match at wave 10, rain at night, five towers round the map's
  middle: the splashes on the roads and on the pads' raised tops.
- \`build-3-heart-cracked-phone.webp\`, \`-desktop\`: a solo Full match left undefended at wave 10 until the Heart is
  under 60%: the cracked keep, its crystal's light and its glow on the ground.

**Build 2** (\`--build 2\`): the plate and the structures at the pitch.

- \`build-2-phone-afternoon.webp\`, \`-dusk\`, \`-night\`: 412 × 839 at 2×, one held moment in each light.
- \`build-2-desktop.webp\`: 1280 × 800 in the afternoon.
- \`build-2-taps-phone.webp\`, \`build-2-taps-desktop.webp\`: the tap test: every 4 px of the map coloured by what a tap
  there picks, each target's box outlined (a tower's box reaches up over its roof), each pad's ground square drawn
  through the camera in white.

**Build 1**: \`build-1-*\`, kept for comparison: today's art squashed on the tilted ground, beside the camera before
V-08b (\`?pitch=0\`, a switch build 3 removed).
`;

const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the preview server has no URL');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  if (BUILD === '3') {
    for (const desktop of [false, true]) {
      const kind = desktop ? 'desktop' : 'phone';
      let p: Page;
      let png: string;
      // A Meteor Rain: the fuse at tick 80 of the cycle, its meteors falling from about 90 to 150.
      if (ONLY.has('meteor')) {
        p = await stress(browser, desktop, 112, 122);
        await label(p, 'Build 3 · 30° · Meteor Rain');
        png = await shoot(p, `build-3-meteor-rain-${kind}`);
        webp(png, `build-3-meteor-rain-${kind}`);
        rmSync(png);
        console.log(`meteor rain (${kind}): ${JSON.stringify(await p.evaluate(() => (window as any).__tdt.meteors()))}`);
        await p.context().close();
      }
      // The quake: sent at tick 200; its front is drawn on the render clock (1.4 s along Mid), its cracks last 1.6 s,
      // so it is shot at once (a software GPU draws about a frame a second).
      if (ONLY.has('quake')) {
        p = await stress(browser, desktop, 201, 214, 0);
        await label(p, 'Build 3 · 30° · the lane quake');
        png = await shoot(p, `build-3-quake-${kind}`);
        webp(png, `build-3-quake-${kind}`);
        rmSync(png);
        console.log(`quake (${kind}): ${JSON.stringify(await p.evaluate(() => (window as any).__tdt.quakes()))}`);
        await p.context().close();
      }
      // Rain at night, wave 10 held with the five towers.
      if (ONLY.has('rain')) {
        p = await page(browser, desktop, 'night', 'rain');
        await label(p, 'Build 3 · 30° · rain at night');
        png = await shoot(p, `build-3-rain-night-${kind}`);
        webp(png, `build-3-rain-night-${kind}`);
        rmSync(png);
        console.log(`rain at night (${kind}): ${JSON.stringify(await p.evaluate(() => (window as any).__tdt.atmosphere()))}`);
        await p.context().close();
      }
      // The Heart cracked.
      if (ONLY.has('heart')) {
        p = await solo(browser, desktop, 'afternoon', 'clear');
        await cracked(p);
        await label(p, 'Build 3 · 30° · the Heart cracked');
        png = await shoot(p, `build-3-heart-cracked-${kind}`);
        webp(png, `build-3-heart-cracked-${kind}`);
        rmSync(png);
        await p.context().close();
      }
    }
    writeFileSync(join(out, 'README.md'), README_3);
  } else {
    const phones: string[] = [];
    for (const [desktop, light] of [[false, 'afternoon'], [false, 'dusk'], [false, 'night'], [true, 'afternoon']] as const) {
      const p = await page(browser, desktop, light);
      const name = desktop ? 'build-2-desktop' : `build-2-phone-${light}`;
      const art = await p.evaluate(() => (window as any).__tdt.art());
      await label(p, `Build 2 · 30° · ${light}`);
      const png = await shoot(p, name);
      webp(png, name);
      if (!desktop) phones.push(png);
      else rmSync(png);
      console.log(`${name}: art ${JSON.stringify(art)}`);
      if (light === 'afternoon') {
        await p.evaluate(() => document.getElementById('camera-label')?.remove());
        const check = await tapOverlay(p);
        const taps = desktop ? 'build-2-taps-desktop' : 'build-2-taps-phone';
        console.log(`${taps}: ${check.pads} pads, ${check.points} tap points, ${check.wrong} off their pad's ground`);
        if (check.wrong > 0) throw new Error(`${taps}: ${check.wrong} taps inside a pad's box land off its ground square`);
        const tp = await shoot(p, taps);
        webp(tp, taps);
        rmSync(tp);
      }
      await p.context().close();
    }
    // The three lights side by side for the pull request (docs/art/camera-b-wave10.png).
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', phones[0]!, '-i', phones[1]!, '-i', phones[2]!,
      '-filter_complex', '[0]pad=iw+16:ih:0:0:color=0x0a0c14[a];[1]pad=iw+16:ih:0:0:color=0x0a0c14[b];[a][b][2]hstack=inputs=3,scale=iw/2:ih/2',
      join(repo, 'docs', 'art', 'camera-b-wave10.png'),
    ]);
    for (const f of phones) rmSync(f);
    writeFileSync(join(out, 'README.md'), README_3);
  }
} finally {
  await browser.close();
  await server.close();
}
