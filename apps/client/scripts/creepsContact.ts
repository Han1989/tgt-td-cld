// The creeps' contact sheet for Han (docs/ART.md §15, V-05c): every creep kind's 3D stand and step next to its 2D
// sprite, at the size a 412 × 839 phone draws them in a match on a 3× screen, then close up at the 3D sheets' own
// pixels; written to docs/art/creeps-3d.png, to judge on GitHub from a phone.
//
//   npm run creeps-contact -w @tdt/client
//
// Serves the client with Vite's dev server and draws the sheet in headless Chromium with the game's own art code
// (src/creepsContact.ts: the 2D art files and painter, the shipped 3D sheets and layouts). Look at it before
// committing.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '..', '..', 'docs', 'art', 'creeps-3d.png');

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
  const data = (await page.evaluate(`import('/src/creepsContact.ts').then((m) => m.drawContact())`)) as string;
  const png = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  await server.close();
}
