// The share card for Han to look at (docs/GAME_DESIGN.md "Daily run", p6d-share): the three heroes, a Daily run won,
// one lost and one at the extremes (#1,000 of 9,999, a 16-character nickname), and Endless runs with and without a
// better best, drawn by the game's own code (src/share/card.ts) in headless Chromium and written to
// docs/screenshots/daily-share/ as JPEG (the game hands over a PNG; these are for a phone to open quickly).
//
//   npm run share-cards -w @tdt/client [-- --out DIR]
//
// Serves the client with Vite's dev server; the link on the cards is the production one. The text uses the machine's
// fonts (Palatino, else Book Antiqua, Georgia, then the system serif), as on a player's phone: look at the result.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import type { ShareFace } from '../src/share/text';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = process.argv.indexOf('--out');
const out = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]!) : join(root, '..', '..', 'docs', 'screenshots', 'daily-share');
const ORIGIN = 'https://tgt-td-cld.vercel.app';
const ticks = (min: number, s: number) => (min * 60 + s) * 20;

const CARDS: [string, ShareFace][] = [
  ['daily-ranger-win', { kind: 'daily', day: '2026-10-24', rank: 14, total: 212, run: { heart: 82, wave: 15, ticks: ticks(9, 41) }, name: 'Wren', hero: 'ranger' }],
  ['daily-warden-loss', { kind: 'daily', day: '2026-10-24', rank: 118, total: 212, run: { heart: 0, wave: 12, ticks: ticks(7, 3) }, name: 'Tamsin', hero: 'warden' }],
  ['daily-arcanist-win', { kind: 'daily', day: '2026-10-24', rank: 1, total: 1284, run: { heart: 100, wave: 15, ticks: ticks(10, 12) }, name: 'Oro', hero: 'arcanist' }],
  [
    'daily-extremes',
    { kind: 'daily', day: '2026-12-31', rank: 1000, total: 9999, run: { heart: 0, wave: 14, ticks: ticks(12, 58) }, name: 'WWWWWWWWWWWWWWWW', hero: 'warden' },
  ],
  ['endless-warden-best', { kind: 'endless', wave: 46, seconds: 38 * 60 + 12, best: 51, hero: 'warden' }],
  ['endless-arcanist', { kind: 'endless', wave: 77, seconds: 3600 + 8 * 60 + 40, best: null, hero: 'arcanist' }],
  ['endless-ranger', { kind: 'endless', wave: 31, seconds: 26 * 60 + 5, best: null, hero: 'ranger' }],
];

const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('the dev server has no URL');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // A light page of the shell (no game boots): the card's module is imported into it.
  await page.goto(`${url}privacy.html`);
  mkdirSync(out, { recursive: true });
  for (const [name, face] of CARDS) {
    // A string, so tsx leaves the page's code alone (it would wrap a function in a `__name` the page doesn't have).
    const data = (await page.evaluate(`import('/src/share/card.ts').then(async (m) => {
      const blob = await m.renderCard(${JSON.stringify(face)}, ${JSON.stringify(ORIGIN)});
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext('2d').drawImage(bitmap, 0, 0);
      return [bitmap.width, bitmap.height, blob.size, c.toDataURL('image/jpeg', 0.9)];
    })`)) as [number, number, number, string];
    const [w, h, pngBytes, jpeg] = data;
    if (w !== 1200 || h !== 630) throw new Error(`${name} is ${w} × ${h}`);
    const file = join(out, `${name}.jpg`);
    const bytes = Buffer.from(jpeg.slice(jpeg.indexOf(',') + 1), 'base64');
    writeFileSync(file, bytes);
    console.log(`${file}: ${w} × ${h} (the PNG ${(pngBytes / 1024).toFixed(0)} KB, this JPEG ${(bytes.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  await browser.close();
  await server.close();
}
