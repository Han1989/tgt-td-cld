// `npm run camera-shots -w @tdt/client [-- --out DIR]`, after `npm run build:e2e -w @tdt/client`: V-08b build 1's
// pictures (docs/ART.md §16 "The camera") into docs/screenshots/camera/.
//
// A real solo Full match on the e2e build in headless Chromium, on the Ranger with the lab's gold: five towers round
// the map's middle (Cannon 2, Arrow 3, Frost 1, Arcane 3, Flak 2) built by the controls' own commands, the hero walked
// up to their row, the afternoon light (`?light=`), clear weather (`?weather=`), wave 10 reached with the e2e `skipTo`
// and held once its creeps are out on the roads. The same moment twice: on the tilted camera (B, 30°) and with
// `?pitch=0` (the camera before V-08b, e2e builds only). Build 1 draws today's art on the pitched ground (the plate
// squashed as one sprite, the towers' and the Heart's sheets as they are): every picture says so.
//   build-1-phone.webp, build-1-phone-pitch0.webp       412 × 839 at 2×
//   build-1-desktop.webp, build-1-desktop-pitch0.webp   1280 × 800
//   build-1-taps-phone.webp, build-1-taps-desktop.webp  the tap test, 30° beside 0°: every 4 px of the map coloured by
//                                                       what a tap there picks (the touch controls' own rule, through
//                                                       the camera's inverse), each target's box outlined, and each
//                                                       pad's ground square drawn through the camera over it
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

const README = `# The tilted camera, build 1 (V-08b)

Made by \`npm run camera-shots -w @tdt/client\` after \`npm run build:e2e -w @tdt/client\` (docs/ART.md §16 "The camera").
A solo Full match on the e2e build, wave 10 held in the afternoon with clear weather, five towers round the map's middle.

**Build 1 of 4 draws today's art on the tilted ground.** The plate is squashed by cos 30° as one sprite, and the towers,
the Heart, the portals and the units are today's sheets standing upright. It looks wrong, and that is this build's
expected result: build 2 renders the plate and the structures at the pitch (docs/art/camera-options.md).

- \`build-1-phone.webp\`, \`build-1-desktop.webp\`: the tilted camera (B, 30° from straight down), 412 × 839 at 2× and 1280 × 800.
- \`build-1-phone-pitch0.webp\`, \`build-1-desktop-pitch0.webp\`: the same moment with \`?pitch=0\` (e2e builds only): the camera before.
- \`build-1-taps-phone.webp\`, \`build-1-taps-desktop.webp\`: the tap test, 30° on the left, 0° on the right. Every 4 px of the
  map is coloured by what a tap there picks (the touch controls' own rule, through the camera's inverse): green a pad,
  gold a tower, red a creep, violet a tie (the picker). Each target's box is outlined, and each pad's ground square is
  drawn through the camera in white over it: on the tilted camera both are 3 tiles wide and 3 · cos 30° tall.
`;

mkdirSync(out, { recursive: true });

async function page(browser: Browser, desktop: boolean, pitch: number): Promise<Page> {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: DESKTOP, deviceScaleFactor: 1, serviceWorkers: 'block' }
      : { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' },
  );
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(`${url}?lab&weather=clear&light=afternoon&pitch=${pitch}`);
  await p.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
  await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
  await p.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
  await p.locator('#lobby-offline').click();
  await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length);
  await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
  const seen = await p.evaluate(() => (window as any).__tdt.view());
  if (seen.pitch !== pitch) throw new Error(`asked for ${pitch}°, the page draws ${seen.pitch}°`);
  await build(p);
  await reach(p);
  return p;
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

/** Two shots side by side (30° left, 0° right), a gap between. */
function beside(a: string, b: string, name: string): void {
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', a, '-i', b,
    '-filter_complex', '[0]pad=iw+16:ih:0:0:color=0x0a0c14[l];[l][1]hstack=inputs=2',
    '-c:v', 'libwebp', '-quality', '84', join(out, `${name}.webp`),
  ]);
}

const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the preview server has no URL');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const desktop of [false, true]) {
    const kind = desktop ? 'desktop' : 'phone';
    const taps: string[] = [];
    for (const pitch of [30, 0]) {
      const p = await page(browser, desktop, pitch);
      const name = pitch ? `build-1-${kind}` : `build-1-${kind}-pitch0`;
      await label(p, pitch ? 'Build 1 · 30° · today’s art, squashed' : '?pitch=0 · before V-08b');
      const png = await shoot(p, name);
      webp(png, name);
      rmSync(png);
      const check = await tapOverlay(p);
      console.log(`${name}: ${check.pads} pads, ${check.points} tap points, ${check.wrong} off their pad's ground`);
      if (check.wrong > 0) throw new Error(`${name}: ${check.wrong} taps inside a pad's box land off its ground square`);
      taps.push(await shoot(p, `${name}-taps`));
      await p.context().close();
    }
    beside(taps[0]!, taps[1]!, `build-1-taps-${kind}`);
    for (const t of taps) rmSync(t);
  }
  writeFileSync(join(out, 'README.md'), README);
} finally {
  await browser.close();
  await server.close();
}
