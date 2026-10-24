// The towers', the Heart's and the portals' contact sheet for Han (docs/ART.md §15, V-05d): every tower kind at every
// tier and branch, the Heart in its three damage states and the portal, their 3D frames next to their 2D art, on the
// map plate's own ground, at the size a 412 × 839 phone draws them on a 3× screen, close up, and each turret through
// its recoil; written to docs/art/structures-3d.png, to judge on GitHub from a phone.
//
//   npm run structures-contact -w @tdt/client
//
// Serves the client with Vite's dev server and draws the sheet in headless Chromium with the game's own art code
// (src/structuresContact.ts: the 2D art files and painter, the shipped 3D sheet and layout, the map plate), then
// quantizes it to 256 colours with a light dither (scripts/quantize.ts, as the link card: ~5.8 MB → ~1.3 MB, the map
// plate's moss is most of it). Look at it before committing.
//
//   npm run build:e2e -w @tdt/client && npm run structures-contact -w @tdt/client -- --wards [rev]
//
// V-06l, the Spire's wards, batch 1: the five towers from Meshy (theme A) next to the KayKit ones they replace (the
// sheet read from git at `rev`, the commit before V-06l by default), every kind at tiers 1–3 and both branches straight
// down, at phone size and close up, each tier 1 turret through its recoil, then a match on a 412 × 839 phone at 3×
// (the e2e build, `?lab`, wave 10 of Full, the five kinds built on the map, some upgraded) and a crop of it at the
// screen's own pixels; to docs/art/wards-towers-a.png, the match frame alone to docs/art/wards-wave10.png.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { decodePng, encodeIndexedPng } from './png';
import { quantize } from './quantize';

const root = fileURLToPath(new URL('..', import.meta.url));
const wards = process.argv.includes('--wards');
const at = process.argv.indexOf('--wards');
const rev = wards && process.argv[at + 1]?.startsWith('-') === false ? process.argv[at + 1]! : '47d0759';
const art = join(root, '..', '..', 'docs', 'art');
const out = join(art, wards ? 'wards-towers-a.png' : 'structures-3d.png');

/** The structures' sheet (a data URL) and match layout as a commit shipped them. */
function fromGit(commit: string): { sheet: string; layout: unknown } {
  const show = (file: string) => execFileSync('git', ['show', `${commit}:apps/client/src/render/art3d/${file}`], { cwd: root, maxBuffer: 1 << 26 });
  return {
    sheet: `data:image/png;base64,${show('structures-match.png').toString('base64')}`,
    layout: (JSON.parse(show('structures.json').toString('utf8')) as { match: unknown }).match,
  };
}

/** Where on the screen (CSS px) a pad's centre is drawn. */
const padOnScreen = (id: number) =>
  `(() => { const p = window.__tdt.map.pads[${id}]; return window.__tdt.camera.worldToScreen(p.x * 32, p.y * 32); })()`;

/**
 * The e2e build in a phone: a solo match on Full, the five tower kinds built on five pads round the middle of the map
 * (Arrow at tier 3, Cannon 2, Frost 1, Arcane 3, Flak 2), wave 10 at once, a screenshot once the Ironhorn is well onto
 * its lane; also the box round the five towers on the screen, device px.
 */
async function matchFrame(): Promise<{ shot: string; box: { x0: number; y0: number; x1: number; y1: number } }> {
  if (!existsSync(join(root, 'dist-e2e', 'index.html'))) throw new Error('build the e2e client first: npm run build:e2e -w @tdt/client');
  const server = await preview({ root, logLevel: 'warn', build: { outDir: 'dist-e2e' }, preview: { port: 0, host: '127.0.0.1' } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 839 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(`${url}?lab`);
    await page.waitForSelector('html[data-ready="solo"]', { timeout: 60_000 });
    await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Warden' }).click();
    await page.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
    await page.locator('#lobby-offline').click();
    await page.waitForSelector('html[data-structures]', { timeout: 120_000 });
    await page.waitForFunction(() => !!window.__tdt?.latest());
    const gotIt = async () => {
      for (const b of await page.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
    };
    await gotIt();
    // Five pads round the map's middle: the four of the middle row that has one in every column, and the one below its
    // second.
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
      // A tap on a pad while another tower's ring is open may only close that ring: tap until this pad's ring shows.
      const build = page.locator(`.radial-btn[data-tower="${kind}"]`);
      for (let w = 0; w < 4 && !(await build.isVisible()); w++) {
        await tap();
        await page.waitForTimeout(250);
      }
      await build.tap();
      for (let w = 0; w < 50 && (await towerTier()) < 1; w++) await page.waitForTimeout(100);
      for (let t = 2; t <= tier; t++) {
        if (!(await page.locator('.radial-btn[data-action="upgrade"]').isVisible())) await tap();
        await page.locator('.radial-btn[data-action="upgrade"]').tap();
        for (let w = 0; w < 50 && (await towerTier()) < t; w++) await page.waitForTimeout(100);
      }
      await gotIt();
      // Close the ring: a tap on the ground beside the Heart.
      await page.touchscreen.tap(heart.x, heart.y);
      await page.waitForTimeout(250);
    }
    await page.evaluate('window.__tdt.skipTo(10)');
    const ready = `(() => { const s = window.__tdt.latest(); const b = s.creeps.find((c) => c.kind === 'ironhorn');
      return !!b && s.creeps.length >= 20 && b.y > 6; })()`;
    for (let i = 0; i < 80 && !(await page.evaluate(ready)); i++) {
      await gotIt();
      await page.waitForTimeout(500);
    }
    await gotIt();
    await page.waitForTimeout(300);
    const shot = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
    const points = (await Promise.all(pads.map((id) => page.evaluate(padOnScreen(id))))) as { x: number; y: number }[];
    const xs = points.map((p) => p.x * 3);
    const ys = points.map((p) => p.y * 3);
    const m = 110;
    const box = { x0: Math.min(...xs) - m, y0: Math.min(...ys) - m, x1: Math.max(...xs) + m, y1: Math.max(...ys) + m };
    return { shot, box };
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

const match = wards ? await matchFrame() : null;
const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the dev server has no URL');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // A light page of the shell (no game boots): the drawing module is imported into it.
  await page.goto(`${url}privacy.html`);
  // A string, so tsx leaves the page's code alone (it would wrap a function in a `__name` the page doesn't have).
  const call = wards ? `m.drawWards(${JSON.stringify(fromGit(rev))}, ${JSON.stringify(match)})` : 'm.drawContact()';
  const data = (await page.evaluate(`import('/src/structuresContact.ts').then((m) => ${call})`)) as string;
  const small = (url: string, dither: number) => {
    const full = decodePng(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    const { indices, palette } = quantize(full, 256, dither);
    return encodeIndexedPng(full.width, full.height, indices, palette);
  };
  const png = small(data, wards ? 0.75 : 0.4);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
  if (match) {
    const shot = small(match.shot, 0.75);
    writeFileSync(join(art, 'wards-wave10.png'), shot);
    console.log(`${join(art, 'wards-wave10.png')}: ${(shot.length / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
  await server.close();
}
