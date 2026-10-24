// The creeps' contact sheet for Han (docs/ART.md §15, V-05c): every creep kind's 3D stand and step next to its 2D
// sprite, at the size a 412 × 839 phone draws them in a match on a 3× screen, then close up at the 3D sheets' own
// pixels; written to docs/art/creeps-3d.png, to judge on GitHub from a phone.
//
//   npm run creeps-contact -w @tdt/client
//
// Serves the client with Vite's dev server and draws the sheet in headless Chromium with the game's own art code
// (src/creepsContact.ts: the 2D art files and painter, the shipped 3D sheets and layouts). Look at it before
// committing.
//
//   npm run creeps-contact -w @tdt/client -- --ironhorn [rev]
//
// V-05c round 2: the Ironhorn as V-05c merged it (the BlueDemon, read from git at `rev`, V-05c's merge by default)
// next to today's (the Demon), to docs/art/ironhorn-2.png.
//
//   npm run build:e2e -w @tdt/client && npm run creeps-contact -w @tdt/client -- --host [rev]
//
// V-06i: the Spire's host, batch 1 (the Grunt, the Archer, the Runner and the Brute generated in Meshy) next to the pack
// creeps they replace (read from git at `rev`, the commit before V-06i by default): each kind's stand, step, blow and
// death at the sheets' own pixels, then a match on a 412 × 839 phone at 3× (the e2e build, `?lab`, wave 12 of Full:
// all four on the lanes beside the Ranger) and a crop of it at the screen's own pixels; to docs/art/enemy-creeps-1.png.
//
//   npm run build:e2e -w @tdt/client && npm run creeps-contact -w @tdt/client -- --host2 [rev]
//
// V-06j: batch 2 (the Wisp, the Hatchling and the three bosses) the same way (the pack's read from git at `rev`, the
// commit before V-06j by default), every frame a kind has, the bosses' abilities and the Shardback's Ether hide, then
// wave 10 of Full (the Ironhorn's) on the phone and a crop round the Ironhorn; to docs/art/enemy-creeps-2.png, the
// match frame alone to docs/art/enemy-wave10.png, and the family (the three heroes and all nine kinds at phone size,
// drawn by the match's rigs) to docs/art/enemy-family.png.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { decodePng, encodeIndexedPng } from './png';
import { quantize } from './quantize';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv.includes('--host2')
  ? 'host2'
  : process.argv.includes('--host')
    ? 'host'
    : process.argv.includes('--ironhorn')
      ? 'ironhorn'
      : 'all';
const at = process.argv.indexOf(`--${mode}`);
const rev =
  process.argv[at + 1]?.startsWith('-') === false
    ? process.argv[at + 1]!
    : { host: '43162e3', host2: 'd3e4730', ironhorn: '105608d', all: '' }[mode];
const art = join(root, '..', '..', 'docs', 'art');
const out = join(art, { all: 'creeps-3d.png', ironhorn: 'ironhorn-2.png', host: 'enemy-creeps-1.png', host2: 'enemy-creeps-2.png' }[mode]);
/** A creep's sheet (a data URL) and match layout as a commit shipped them. */
function fromGit(commit: string, kind: string, ext = 'webp'): { sheet: string; layout: unknown } {
  const show = (file: string) => execFileSync('git', ['show', `${commit}:apps/client/src/render/art3d/${file}`], { cwd: root, maxBuffer: 1 << 26 });
  return {
    sheet: `data:image/${ext};base64,${show(`${kind}-match.${ext}`).toString('base64')}`,
    layout: (JSON.parse(show(`${kind}.json`).toString('utf8')) as { match: unknown }).match,
  };
}

/** The e2e build in a phone: a solo match on Full, wave 12 at once, a screenshot once all four kinds are on the lanes
 * (V-06j: wave 10, once the Ironhorn is well onto its lane; also where it is on the screen, device px). */
async function matchFrame(wave = 12): Promise<{ shot: string; at: { x: number; y: number } | null }> {
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
    await page.locator('#lobby-heroes-home .hero-pick', { hasText: 'Ranger' }).click();
    await page.locator('#lobby-mode-home .mode-pick[data-mode="full"]').click();
    await page.locator('#lobby-offline').click();
    await page.waitForSelector('html[data-creep-sheets]', { timeout: 120_000 });
    await page.evaluate(`window.__tdt.skipTo(${wave})`);
    // Wave 12 brings Grunts, Runners, Archers, Brutes and Wisps; the Wisps' lesson card is put away as a player would.
    // Wave 10 the Ironhorn among Grunts, Archers, Brutes and Wisps: once it is four tiles down its lane.
    const kinds =
      wave === 10
        ? `(() => { const s = window.__tdt.latest(); const b = s.creeps.find((c) => c.kind === 'ironhorn');
            return !!b && s.creeps.length >= 20 && b.y > 4; })()`
        : `(() => { const s = window.__tdt.latest(); const k = new Set(s.creeps.map((c) => c.kind));
      return ['grunt', 'runner', 'archer', 'brute'].every((x) => k.has(x)) && s.creeps.length >= 40; })()`;
    for (let i = 0; i < 60 && !(await page.evaluate(kinds)); i++) {
      for (const b of await page.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(5000);
    for (const b of await page.getByRole('button', { name: 'Got it' }).all()) if (await b.isVisible()) await b.click();
    await page.waitForTimeout(300);
    const shot = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
    // Where the Ironhorn stands on the screen (the camera at rest: the map's rect and its tile size), in device px.
    const at = (await page.evaluate(`(() => { const s = window.__tdt.latest(); const b = s.creeps.find((c) => c.kind === 'ironhorn');
      const L = window.__tdt.layout(); if (!b || !L) return null;
      return { x: (L.map.left + b.x * L.tilePx) * 3, y: (L.map.top + b.y * L.tilePx) * 3 }; })()`)) as { x: number; y: number } | null;
    return { shot, at };
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

const match = mode === 'host' ? await matchFrame() : mode === 'host2' ? await matchFrame(10) : null;
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
  const call = {
    all: () => 'm.drawContact()',
    ironhorn: () => `m.drawIronhorn(${JSON.stringify(fromGit(rev, 'ironhorn', 'png'))})`,
    host: () =>
      `m.drawHost(${JSON.stringify(Object.fromEntries(['grunt', 'archer', 'runner', 'brute'].map((k) => [k, fromGit(rev, k)])))}, ${JSON.stringify(match?.shot)})`,
    host2: () =>
      `(window.__ironhorn = ${JSON.stringify(match?.at)} ?? undefined, m.drawHost2(${JSON.stringify(
        Object.fromEntries(['wisp', 'hatchling', 'ironhorn', 'matriarch', 'shardback'].map((k) => [k, fromGit(rev, k)])),
      )}, ${JSON.stringify(match?.shot)}))`,
  }[mode]();
  const data = (await page.evaluate(`import('/src/creepsContact.ts').then((m) => ${call})`)) as string;
  // V-06j's sheets are tall: written at 256 colours (as the link card, scripts/ogImage.ts), a quarter the bytes.
  const small = (url: string) => {
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (mode !== 'host2') return buf;
    const img = decodePng(buf);
    const q = quantize(img, 256, 0.75);
    return encodeIndexedPng(img.width, img.height, q.indices, q.palette);
  };
  const png = small(data);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
  if (mode === 'host2' && match) {
    const shot = small(match.shot);
    writeFileSync(join(art, 'enemy-wave10.png'), shot);
    console.log(`${join(art, 'enemy-wave10.png')}: ${(shot.length / 1024).toFixed(0)} KB`);
    const family = (await page.evaluate(`import('/src/creepsContact.ts').then((m) => m.drawFamily())`)) as string;
    const fam = small(family);
    writeFileSync(join(art, 'enemy-family.png'), fam);
    console.log(`${join(art, 'enemy-family.png')}: ${(fam.length / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
  await server.close();
}
