// V-07c look (Han, 25 Oct 2026; docs/art/ground-options.md): the map in grass green, three looks for Han to pick from
// on his phone, next to today's ground. Dev only: nothing in the game changes.
//
//   npm run art:3d -- map spire --draft --ground a --out <dir>/a                            (and b, c: ~2 min each)
//   TDT_PLATE_BOX=448,704,1216,1216 npm run art:3d -- map spire --ground a --out <dir>/a    (the middle, full quality)
//   npm run build:e2e -w @tdt/client && npm run ground-options -w @tdt/client -- <dir>
//
// `<dir>/<look>/spire.webp` is each look's draft plate and `<dir>/<look>/spire-box.png` its middle (the mid lane and
// four pads, tiles 7–19 × 11–19) at full quality; today's ground is the shipped plate (public/map/spire.webp).
//
// One match on a 412 × 839 phone at 3× (the e2e build, `?lab`, the Ranger, Full: the five tower kinds built round the
// middle, Arrow and Arcane at tier 3, Cannon and Flak at 2, Frost at 1, then wave 10 until the Ironhorn is well onto
// its lane) is held (`__tdt.pause`) and shot on every ground: an init script records the map plate's WebGL upload, and
// each look's draft, with V-07c's light pools painted in (rose round the Heart, violet round each portal, teal under
// each tier-3 tower: a tint and a glow added on it), is uploaded over it in place, so the four frames are the same
// moment. Then Settings → Display → Bright and the four again: the game's own Bright wash is set to nothing (the
// bundle's `groundLift` alpha 0, by a route) and each ground is washed in the page instead (`screen`, as the wash
// sprite blends) at its look's alpha, so the lift a lighter ground needs can be shown. The sheet itself is drawn in a
// page of Vite's dev server (src/groundOptions.ts) with the game's own rigs: the frames, the middles at the phone's
// screen pixels, the three heroes, a Grunt and a Brute standing on each ground (a pad tinted yours and one a
// teammate's), the readability checks measured under each frame. Writes docs/art/ground-options.png (256 colours) and
// each look's frame alone at the phone's own pixels, docs/art/ground-<look>.png (a, b, c), to open on a phone.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { createServer, preview } from 'vite';
import { LIGHTING, RL } from '../src/render/art/tokens';
import { decodePng, encodeIndexedPng } from './png';
import { quantize } from './quantize';

const root = fileURLToPath(new URL('..', import.meta.url));
const art = join(root, '..', '..', 'docs', 'art');
const dir = process.argv[2];
if (!dir || dir.startsWith('-')) throw new Error('usage: npm run ground-options -w @tdt/client -- <dir of a/, b/, c/>');

/**
 * The looks as the sheet shows them: today's and the three options. `lift`: the Bright wash's alpha on that ground
 * (today's is the game's 32%); `pools`: the light pools' strength on it (none on today's: they are V-07c's).
 */
const option = (key: string, name: string, lift: number, pools: number) => ({
  key,
  name,
  plate: join(dir, key, 'spire.webp'),
  box: join(dir, key, 'spire-box.png') as string | null,
  lift,
  pools,
});
const LOOKS = [
  { key: 'now', name: 'Now', plate: join(root, 'public', 'map', 'spire.webp'), box: null, lift: 0.32, pools: 0 },
  option('a', 'A · Spring meadow', 0.12, 1.3),
  option('b', 'B · Moonlit meadow', 0.26, 1),
  option('c', 'C · Golden hour', 0.16, 1.15),
];
for (const l of LOOKS) for (const f of [l.plate, l.box]) if (f && !existsSync(f)) throw new Error(`missing ${f}`);
/** The middle crop (plate px): tiles 7–19 × 11–19, the mid lane and four pads (TDT_PLATE_BOX). */
const BOX = [448, 704, 1216, 1216] as const;
/** A light pool's two layers, of its alpha: the tint laid over the ground and the glow added on it. */
const POOL_TINT = 0.5;
const POOL_GLOW = 0.7;
/** The Bright wash's colour. */
const LIFT = `#${LIGHTING.bright.groundLift.color.toString(16).padStart(6, '0')}`;

/** Records the map plate's texture as Pixi uploads it, and lets the page upload another picture over it. */
const HOOK = `(() => {
  const hook = (proto) => {
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const orig = proto[name];
      proto[name] = function (...args) {
        const src = args[args.length - 1];
        if (src instanceof ImageBitmap && src.width === 1664 && src.height === 3200)
          window.__plateGl = { gl: this, tex: this.getParameter(this.TEXTURE_BINDING_2D) };
        return orig.apply(this, args);
      };
    }
  };
  if (window.WebGL2RenderingContext) hook(WebGL2RenderingContext.prototype);
  if (window.WebGLRenderingContext) hook(WebGLRenderingContext.prototype);
})()`;

/** The page side of a ground swap: the look's plate, its pools added, washed for Bright, uploaded over the plate. */
const swap = (url: string, pools: Pool[], lift: number) => `(async () => {
  const res = await fetch(${JSON.stringify(url)});
  if (!res.ok) throw new Error(${JSON.stringify(url)} + ': ' + res.status);
  const src = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  // Each pool twice: a tint (laid over: on green, added light alone turns rose gold and violet grey) and the glow
  // added on it.
  for (const [mode, share] of [['source-over', ${POOL_TINT}], ['lighter', ${POOL_GLOW}]]) {
    g.globalCompositeOperation = mode;
    for (const p of ${JSON.stringify(pools)}) {
      const r = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      for (const [at, k] of [[0, 1], [0.3, 0.72], [0.6, 0.3], [0.82, 0.08], [1, 0]])
        r.addColorStop(at, 'rgba(' + p.colour.join(',') + ',' + (p.alpha * share * k) + ')');
      g.fillStyle = r;
      g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  }
  if (${lift} > 0) {
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = ${lift};
    g.fillStyle = ${JSON.stringify(LIFT)};
    g.fillRect(0, 0, c.width, c.height);
  }
  const bmp = c.transferToImageBitmap();
  const { gl, tex } = window.__plateGl;
  const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
  gl.bindTexture(gl.TEXTURE_2D, prev);
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
})()`;

interface Pool {
  x: number;
  y: number;
  r: number;
  colour: [number, number, number];
  alpha: number;
}

const rgbOf = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const padOnScreen = (id: number) =>
  `(() => { const p = window.__tdt.map.pads[${id}]; return window.__tdt.camera.worldToScreen(p.x * 32, p.y * 32); })()`;

/** The match: built, wave 10, held; then each ground shot in Normal and in Bright. */
async function frames(): Promise<Record<string, Buffer>> {
  if (!existsSync(join(root, 'dist-e2e', 'index.html'))) throw new Error('build the e2e client first: npm run build:e2e -w @tdt/client');
  const server = await preview({ root, logLevel: 'warn', build: { outDir: 'dist-e2e' }, preview: { port: 0, host: '127.0.0.1' } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  const browser = await chromium.launch();
  try {
    // No service worker: its fetches would pass the routes below by.
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 839 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    await ctx.addInitScript(HOOK);
    // The game's own Bright wash at nothing: each ground is washed in the page at its look's alpha.
    await ctx.route('**/assets/*.js', async (route) => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/groundLift:\{color:(\d+),alpha:\.32\}/, 'groundLift:{color:$1,alpha:0}');
      await route.fulfill({ response: res, body });
    });
    for (const l of LOOKS) {
      await ctx.route(`**/__ground/${l.key}.webp`, (route) =>
        route.fulfill({ body: readFileSync(l.plate), contentType: 'image/webp' }),
      );
    }
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(`${url}?lab`);
    await page.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
    await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Ranger' }).click();
    await page.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
    await page.locator('#lobby-offline').click();
    const sheets = 'html[data-plate="ready"][data-structures][data-creep-sheets][data-hero-sheets]';
    await page.waitForSelector(sheets, { timeout: 120_000 });
    await page.waitForFunction(() => !!(window as unknown as { __tdt?: { latest(): unknown } }).__tdt?.latest());
    if (!(await page.evaluate('!!window.__plateGl'))) throw new Error('the map plate was not seen uploading');
    await build(page);
    await page.evaluate('window.__tdt.skipTo(10)');
    const ready = `(() => { const s = window.__tdt.latest(); const b = s.creeps.find((c) => c.kind === 'ironhorn');
      return !!b && s.creeps.length >= 20 && b.y > 6; })()`;
    for (let i = 0; i < 80 && !(await page.evaluate(ready)); i++) {
      await gotIt(page);
      await page.waitForTimeout(500);
    }
    // The boss wave's lane hints and the unspent-gold nudge cover the map for a few seconds: the shot waits them out.
    for (let i = 0; i < 30 && (await hinted(page)); i++) await page.waitForTimeout(500);
    // The Air chip up (Wisps on the map) and no surge flag over the portals, for a while at most.
    const chips = `(() => { const v = (el) => !!el && el.offsetParent !== null && !el.classList.contains('hidden');
      return v(document.getElementById('air-flag')) && ![...document.querySelectorAll('.surge-flag')].some(v); })()`;
    for (let i = 0; i < 40 && !(await page.evaluate(chips)); i++) await page.waitForTimeout(250);
    await gotIt(page);
    await page.evaluate('window.__tdt.pause(true)');
    await page.waitForTimeout(600);
    const pools = (await page.evaluate(`(() => {
      const m = window.__tdt.map; const t = window.__tdt.latest().towers;
      return { heart: m.heart, portals: m.lanes.map((l) => ({ x: l.waypoints[0].x, y: l.waypoints[0].y + 1 })),
        towers: t.filter((x) => x.tier === 3).map((x) => ({ x: m.pads[x.padId].x, y: m.pads[x.padId].y })) }; })()`)) as {
      heart: { x: number; y: number };
      portals: { x: number; y: number }[];
      towers: { x: number; y: number }[];
    };
    const res = 64; // plate px per tile
    const poolsFor = (k: number): Pool[] =>
      k === 0
        ? []
        : [
            { ...pools.heart, r: 3.4, colour: rgbOf(RL.heart), alpha: 0.36 * k },
            ...pools.portals.map((p) => ({ ...p, r: 2.6, colour: rgbOf(RL.portal), alpha: 0.38 * k })),
            ...pools.towers.map((p) => ({ ...p, r: 2.4, colour: rgbOf(RL.rune), alpha: 0.3 * k })),
          ].map((p) => ({ ...p, x: p.x * res, y: p.y * res, r: p.r * res, colour: p.colour as [number, number, number] }));
    const shots: Record<string, Buffer> = {};
    for (const display of ['normal', 'bright'] as const) {
      if (display === 'bright') {
        await page.locator('#settings-btn').click();
        await page.locator('#settings-display').getByRole('button', { name: 'Bright' }).click();
        await page.locator('#settings-btn').click();
        await page.waitForTimeout(800);
      }
      for (const l of LOOKS) {
        await page.evaluate(swap(`/__ground/${l.key}.webp`, poolsFor(l.pools), display === 'bright' ? l.lift : 0));
        await page.waitForTimeout(400);
        shots[`${l.key}-${display}`] = await page.screenshot();
        console.log(`shot ${l.key} ${display}`);
      }
    }
    return shots;
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
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

/** The five tower kinds on five pads round the map's middle (structuresContact.ts's): Arrow 3, Cannon 2, Frost 1,
 * Arcane 3, Flak 2. */
async function build(page: Page): Promise<void> {
  await gotIt(page);
  const pads = (await page.evaluate(`(() => {
    const m = window.__tdt.map; const own = window.__tdt.latest().pads.map((p) => m.pads[p.id]);
    const rows = [...new Set(own.map((p) => p.y))].sort((a, b) => a - b);
    const cols = [...new Set(own.map((p) => p.x))].sort((a, b) => a - b);
    const full = rows.filter((y) => own.filter((p) => p.y === y).length === cols.length);
    const y = full[Math.floor((full.length - 1) / 2)];
    const row = own.filter((p) => p.y === y).sort((a, b) => a.x - b.x);
    const below = own.filter((p) => p.x === row[1].x && p.y > y).sort((a, b) => a.y - b.y)[0];
    return [row[0], row[1], row[2], row[3], below].map((p) => p.id); })()`)) as number[];
  const plan: [string, number][] = [['arrow', 3], ['cannon', 2], ['frost', 1], ['arcane', 3], ['flak', 2]];
  const heart = (await page.evaluate(`(() => { const h = window.__tdt.map.heart;
    return window.__tdt.camera.worldToScreen((h.x + 3) * 32, (h.y - 2) * 32); })()`)) as { x: number; y: number };
  for (const [i, [kind, tier]] of plan.entries()) {
    const id = pads[i]!;
    const tap = async () => {
      const p = (await page.evaluate(padOnScreen(id))) as { x: number; y: number };
      await page.touchscreen.tap(p.x, p.y);
    };
    const towerTier = () =>
      page.evaluate(`window.__tdt.latest().towers.find((t) => t.padId === ${id})?.tier ?? 0`) as Promise<number>;
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
    await page.touchscreen.tap(heart.x, heart.y);
    await page.waitForTimeout(250);
  }
}

const shots = await frames();
const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the dev server has no URL');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  // The frames, plates and middles, served to the sheet's page by name.
  const files: Record<string, { body: Buffer; type: string }> = {};
  for (const [k, v] of Object.entries(shots)) files[`${k}.png`] = { body: v, type: 'image/png' };
  for (const l of LOOKS) {
    files[`${l.key}-plate.webp`] = { body: readFileSync(l.plate), type: 'image/webp' };
    if (l.box) files[`${l.key}-box.png`] = { body: readFileSync(l.box), type: 'image/png' };
  }
  await page.route('**/__ground/*', (route) => {
    const f = files[new URL(route.request().url()).pathname.split('/').pop()!];
    return f ? route.fulfill({ body: f.body, contentType: f.type }) : route.fulfill({ status: 404 });
  });
  // A light page of the shell (no game boots): the drawing module is imported into it.
  await page.goto(`${url}privacy.html`);
  const looks = LOOKS.map((l) => ({ key: l.key, name: l.name, box: !!l.box, lift: l.lift, pools: l.pools }));
  const out = (await page.evaluate(
    `import('/src/groundOptions.ts').then((m) => m.drawGroundOptions(${JSON.stringify(looks)}, ${JSON.stringify(BOX)}))`,
  )) as { sheet: string; checks: Record<string, string[]> };
  const small = (png: Buffer) => {
    const img = decodePng(png);
    const { indices, palette } = quantize(img, 256, 0.75);
    return encodeIndexedPng(img.width, img.height, indices, palette);
  };
  mkdirSync(art, { recursive: true });
  const sheet = small(Buffer.from(out.sheet.slice(out.sheet.indexOf(',') + 1), 'base64'));
  writeFileSync(join(art, 'ground-options.png'), sheet);
  console.log(`${join(art, 'ground-options.png')}: ${(sheet.length / 1024).toFixed(0)} KB`);
  for (const l of LOOKS) {
    if (l.key === 'now') continue;
    const one = small(shots[`${l.key}-normal`]!);
    writeFileSync(join(art, `ground-${l.key}.png`), one);
    console.log(`${join(art, `ground-${l.key}.png`)}: ${(one.length / 1024).toFixed(0)} KB`);
  }
  // The checks as text, for docs/art/ground-options.md.
  console.log(JSON.stringify(out.checks, null, 1));
} finally {
  await browser.close();
  await server.close();
}
