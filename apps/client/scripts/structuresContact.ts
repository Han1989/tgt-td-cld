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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { decodePng, encodeIndexedPng } from './png';
import { quantize } from './quantize';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '..', '..', 'docs', 'art', 'structures-3d.png');

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
  const data = (await page.evaluate(`import('/src/structuresContact.ts').then((m) => m.drawContact())`)) as string;
  const full = decodePng(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
  const { indices, palette } = quantize(full, 256, 0.4);
  const png = encodeIndexedPng(full.width, full.height, indices, palette);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  await server.close();
}
