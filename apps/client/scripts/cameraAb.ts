// V-08b build 4: the five-second test (docs/art/camera-options.md, "The five-second test"). Dev only, one picture.
//
//   git worktree add ../tdt-zero b1ecad0 && (cd ../tdt-zero && npm ci && npm run build:e2e -w @tdt/client)
//   npm run build:e2e -w @tdt/client
//   npm run camera-ab -w @tdt/client -- --zero ../tdt-zero/apps/client/dist-e2e [--out FILE] [--frames DIR]
//
// Holds the same wave-10 moment as camera-options.md (scripts/heldMoment.ts) on a 412 × 839 phone at 2×, once on the
// game before the tilted camera (`--zero`: an e2e build of b1ecad0, the look session's commit, whose game is V-08a's at
// 0°) and once on this checkout's e2e build (30°), and lays the two frames side by side, unlabelled but for "1" and
// "2" over them, into docs/art/camera-ab.png (`--out`). Which is which is ORDER below and in camera-options.md; the
// picture itself never says. `--frames DIR` also keeps each frame alone (`zero.png`, `pitched.png`).
// `CHROMIUM_PATH` for a Chromium of another revision than Playwright's. Look at the picture before committing it.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { preview } from 'vite';
import { DEVICES, holdWave10, openHeld } from './heldMoment';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const path = (p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const zeroArg = arg('zero');
if (!zeroArg) throw new Error('usage: npm run camera-ab -w @tdt/client -- --zero <dist-e2e of b1ecad0> [--out FILE] [--frames DIR]');
const zero = path(zeroArg);
const pitched = join(root, 'dist-e2e');
const out = path(arg('out') ?? join(repo, 'docs', 'art', 'camera-ab.png'));
const framesDir = arg('frames');
for (const d of [zero, pitched]) if (!existsSync(join(d, 'index.html'))) throw new Error(`missing ${d}/index.html (npm run build:e2e -w @tdt/client)`);

/** Which frame is "1" and which "2". The tilted camera first, so "2 is the new one" is no hint (camera-options.md). */
export const ORDER = ['pitched', 'zero'] as const;

/** The held moment on the phone, from one e2e build. */
async function frame(browser: Browser, dist: string): Promise<Buffer> {
  const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  try {
    const p = await openHeld(browser, 'phone', url);
    await holdWave10(p);
    const png = await p.screenshot();
    const s = await p.evaluate(() => (window as any).__tdt.latest());
    console.log(`${dist}: wave ${s.wave}, ${s.creeps.length} creeps, ${s.towers.length} towers`);
    await p.context().close();
    return png;
  } finally {
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const shots = { zero: await frame(browser, zero), pitched: await frame(browser, pitched) };
  if (framesDir) {
    mkdirSync(path(framesDir), { recursive: true });
    for (const [k, v] of Object.entries(shots)) writeFileSync(join(path(framesDir), `${k}.png`), v);
  }
  // Side by side at the phone's own pixels (each 824 × 1678: a 412 × 839 phone at 2×), a number over each.
  const { width, height } = DEVICES.phone.viewport;
  const w = width * 2;
  const h = height * 2;
  const pad = 32;
  const head = 140;
  const page = await (await browser.newContext({ viewport: { width: pad * 3 + w * 2, height: pad * 2 + head + h }, deviceScaleFactor: 1 })).newPage();
  const cell = (n: number, png: Buffer) =>
    `<figure><figcaption>${n}</figcaption><img src="data:image/png;base64,${png.toString('base64')}" width="${w}" height="${h}"></figure>`;
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; background: #11161a; }
    main { display: flex; gap: ${pad}px; padding: ${pad}px; }
    figure { margin: 0; display: flex; flex-direction: column; }
    figcaption { height: ${head}px; line-height: ${head - 20}px; text-align: center; color: #ece4cf; font: 700 112px/1 system-ui, sans-serif; }
    img { display: block; border-radius: 28px; }
  </style></head><body><main>${ORDER.map((k, i) => cell(i + 1, shots[k])).join('')}</main></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`${out}: 1 = ${ORDER[0]}, 2 = ${ORDER[1]} (${(readFileSync(out).length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
