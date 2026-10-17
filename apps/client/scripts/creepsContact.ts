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

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = process.argv.indexOf('--ironhorn');
const ironhorn = at >= 0;
const rev = process.argv[at + 1]?.startsWith('-') === false ? process.argv[at + 1]! : '105608d';
const out = join(root, '..', '..', 'docs', 'art', ironhorn ? 'ironhorn-2.png' : 'creeps-3d.png');
/** The BlueDemon Ironhorn as V-05c (PR #115) merged it, from git: its sheet as a data URL and its layout. */
function blueDemon(commit: string): { sheet: string; layout: unknown } {
  const show = (file: string) => execFileSync('git', ['show', `${commit}:apps/client/src/render/art3d/${file}`], { cwd: root, maxBuffer: 1 << 26 });
  return {
    sheet: `data:image/png;base64,${show('ironhorn-match.png').toString('base64')}`,
    layout: (JSON.parse(show('ironhorn.json').toString('utf8')) as { match: unknown }).match,
  };
}

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
  const data = (
    ironhorn
      ? await page.evaluate(
          `import('/src/creepsContact.ts').then((m) => m.drawIronhorn(${JSON.stringify(blueDemon(rev))}))`,
        )
      : await page.evaluate(`import('/src/creepsContact.ts').then((m) => m.drawContact())`)
  ) as string;
  const png = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`${out}: ${(png.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  await server.close();
}
