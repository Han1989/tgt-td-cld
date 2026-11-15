// `npm run lobby-shots -w @tdt/client [-- --only home,states,room,faces,clips] [--before DIR] [--out DIR]` (q13):
// after `npm run build:e2e -w @tdt/client`, the home card's pictures for Han (docs/screenshots/lobby/): the home card
// with ten names on the ribbon at 412 × 839 (2×), 360 × 640 and 1280 × 720; the two-rows-and-yesterday and the empty
// states at 412 × 839; the room card (a stand-in room on a stubbed socket, as e2e/lobby.spec.ts's `fakeRoom`); the
// hero buttons enlarged (`buttons-after.png`), and with `--before DIR` (an e2e build of the commit before, its
// `dist-e2e`) the same buttons there and both side by side (`buttons-before-after.png`); and two clips recorded in real time at 412 × 839 (H.264,
// no sound, about 10 s): `ribbon.mp4` (the names running, then a tap opening the board) and `faces.mp4` (the three
// buttons at rest, then each picked in turn). The boards are made up (endless/today stubbed, as e2e/lobby.spec.ts
// does). Needs ffmpeg with libx264. About 2 minutes; `CHROMIUM_PATH` for another Chromium. Look at every picture and
// both clips before committing.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const out = resolve(flag('--out') ?? join(root, '..', '..', 'docs', 'screenshots', 'lobby'));
const only = new Set((flag('--only') ?? 'home,states,room,faces,clips').split(','));
const PORT = 4191;
const BASE = `http://localhost:${PORT}`;
const BEFORE_PORT = 4193;
const before = flag('--before') ? resolve(flag('--before')!) : null;

const NAMES = ['Kael', 'Mira the Bold', 'Wren', 'Aster', 'Oro', 'Tamsin', 'Ilse', 'Bram', 'Juno', 'Pellinore Ash'];
const HEROES = ['warden', 'ranger', 'arcanist'];

/** A made-up /endless/today: `n` rows today (this browser's the 4th when `mine`), and yesterday's top 3. */
function board(n: number, mine = false) {
  return {
    day: new Date().toISOString().slice(0, 10),
    closesAt: Date.now() + 3 * 3600_000,
    runs: n ? 112 : 0,
    top: NAMES.slice(0, n).map((name, i) => ({ rank: i + 1, name, wave: 54 - i * 2, ticks: 50_000 + i * 900, hero: HEROES[i % 3], mine: mine && i === 3 })),
    you: mine && n > 3 ? { rank: 4, wave: 48, ticks: 52_700 } : null,
    yesterday: n ? [
      { rank: 1, name: 'Night Owl', wave: 61, ticks: 60_000, hero: 'arcanist' },
      { rank: 2, name: 'Sable', wave: 57, ticks: 58_000, hero: 'warden' },
      { rank: 3, name: 'Fen', wave: 49, ticks: 51_000, hero: 'ranger' },
    ] : [],
  };
}

const DAILY = { day: '2026-11-15', seed: 1, closesAt: Date.now() + 3_600_000, runs: 212, champion: { name: 'Kael', heart: 82, ticks: 13_000 } };

async function home(ctx: BrowserContext, today: unknown, path = '/?lobby&daily', base = BASE, ribbon = true): Promise<Page> {
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped' })));
  await page.route('**/endless/today', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(today) }));
  await page.route('**/daily/today', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DAILY) }));
  await page.goto(`${base}${path}`);
  await page.waitForSelector('html[data-ready]');
  await page.waitForSelector('#lobby-daily:not(.hidden)');
  if (ribbon) {
    await page.waitForSelector('#lobby-ribbon:not(.hidden)');
    // The faces loaded.
    await page.waitForFunction(() => document.querySelectorAll('#lobby-heroes-home .face-img').length === 3);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(1500);
  return page;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(out, name), type: 'png' });
  console.log(`  ${name}`);
}

async function shots(browser: Browser): Promise<void> {
  const sizes = [
    { name: 'home-412x839.png', viewport: { width: 412, height: 839 }, scale: 2, mobile: true },
    { name: 'home-360x640.png', viewport: { width: 360, height: 640 }, scale: 2, mobile: true },
    { name: 'home-1280x720.png', viewport: { width: 1280, height: 720 }, scale: 1, mobile: false },
  ];
  if (only.has('home')) {
    for (const s of sizes) {
      const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale, isMobile: s.mobile, hasTouch: s.mobile });
      const page = await home(ctx, board(10, true));
      await shot(page, s.name);
      await ctx.close();
    }
  }
  const phone = { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  if (only.has('states')) {
    for (const [name, today] of [
      ['home-few-and-yesterday.png', board(2)],
      ['home-empty.png', board(0)],
    ] as const) {
      const ctx = await browser.newContext(phone);
      const page = await home(ctx, today);
      await shot(page, name);
      await ctx.close();
    }
  }
  if (only.has('room')) {
    // A room of three as its host sees it, on a stubbed socket (the e2e build's game server is ws://127.0.0.1:9).
    const ctx = await browser.newContext(phone);
    const seat = (id: string, name: string, hero: string, ready: boolean) => ({ id, name, hero, ready, connected: true, art: 100 });
    const players = [seat('p1', 'Han', 'ranger', false), seat('p2', 'Mya', 'warden', true), seat('p3', 'Kai', 'arcanist', true)];
    await ctx.routeWebSocket(/127\.0\.0\.1:9/, (ws) => {
      ws.onMessage((raw) => {
        const msg = JSON.parse(String(raw)) as { t: string };
        if (msg.t !== 'create') return;
        ws.send(JSON.stringify({ t: 'welcome', playerId: 'p1', room: { code: 'KQXYZ', token: 'shots' } }));
        ws.send(JSON.stringify({ t: 'lobby', lobby: { code: 'KQXYZ', phase: 'lobby', hostId: 'p1', mode: 'quick', players } }));
      });
    });
    const host = await home(ctx, board(10));
    await host.locator('#lobby-name').fill('Han');
    await host.locator('#lobby-create').click();
    await host.waitForSelector('#lobby-room:not(.hidden)');
    await host.waitForTimeout(800);
    await shot(host, 'room-412x839.png');
    await ctx.close();
  }
  if (only.has('faces')) {
    const grab = async (base: string, ribbon: boolean) => {
      const ctx = await browser.newContext({ ...phone, deviceScaleFactor: 4 });
      const page = await home(ctx, board(10), '/?lobby&daily', base, ribbon);
      const png = await page.locator('#lobby-heroes-home').screenshot();
      await ctx.close();
      return png;
    };
    const after = await grab(BASE, true);
    writeFileSync(join(out, 'buttons-after.png'), after);
    console.log('  buttons-after.png');
    if (before) {
      const server = serve(before, BEFORE_PORT);
      try {
        await up(`http://localhost:${BEFORE_PORT}`);
        const was = await grab(`http://localhost:${BEFORE_PORT}`, false);
        writeFileSync(join(out, 'buttons-before.png'), was);
        // Side by side, before on top, labelled.
        const ctx = await browser.newContext({ deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        const url = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
        const png = await page.evaluate(
          async ([a, b]) => {
            // No named functions in the page (tsx would wrap them in a helper the page lacks).
            const [x, y] = await Promise.all(
              [a, b].map(async (src) => {
                const i = new Image();
                i.src = src;
                await i.decode();
                return i;
              }),
            );
            const label = 64;
            const c = document.createElement('canvas');
            c.width = Math.max(x.width, y.width) + 40;
            c.height = x.height + y.height + label * 2 + 40;
            const g = c.getContext('2d')!;
            g.fillStyle = '#121a1c';
            g.fillRect(0, 0, c.width, c.height);
            g.fillStyle = '#e9eef6';
            g.font = '600 36px system-ui, sans-serif';
            g.fillText('Before (main)', 20, 46);
            g.drawImage(x, 20, label);
            g.fillText('After (q13)', 20, label + x.height + 20 + 46);
            g.drawImage(y, 20, label * 2 + x.height + 20);
            return c.toDataURL('image/png');
          },
          [url(was), url(after)],
        );
        writeFileSync(join(out, 'buttons-before-after.png'), Buffer.from(png.split(',')[1]!, 'base64'));
        console.log('  buttons-before.png, buttons-before-after.png');
        await ctx.close();
      } finally {
        server.kill();
      }
    }
  }
}

/** Records `act` in real time at 412 × 839 into `name` (H.264, no sound). */
async function clip(browser: Browser, name: string, today: unknown, act: (page: Page) => Promise<void>): Promise<void> {
  const dir = join(out, '.video');
  rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 839 },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir, size: { width: 412, height: 839 } },
  });
  const page = await home(ctx, today);
  const start = Date.now();
  await act(page);
  const seconds = (Date.now() - start) / 1000;
  await ctx.close();
  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('no video');
  // The page's load trimmed off: the clip is the act alone, recorded in real time.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${seconds.toFixed(2)}`, '-i', join(dir, webm), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', join(out, name)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ${name}`);
}

async function clips(browser: Browser): Promise<void> {
  await clip(browser, 'ribbon.mp4', board(10, true), async (page) => {
    await page.waitForTimeout(8000);
    await page.locator('#lobby-ribbon').tap();
    await page.waitForSelector('#lobby-board:not(.hidden)');
    await page.waitForTimeout(2500);
  });
  await clip(browser, 'faces.mp4', board(10), async (page) => {
    await page.waitForTimeout(4000);
    for (const hero of ['warden', 'arcanist', 'ranger']) {
      await page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"]`).tap();
      await page.waitForTimeout(2300);
    }
  });
}

/** `vite preview` of an e2e build on `port`. */
function serve(dist: string, port: number): ChildProcess {
  return spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
}

async function up(url: string): Promise<void> {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not start`);
}

async function main(): Promise<void> {
  if (!existsSync(join(root, 'dist-e2e', 'index.html'))) throw new Error('run npm run build:e2e -w @tdt/client first');
  mkdirSync(out, { recursive: true });
  const server = serve(join(root, 'dist-e2e'), PORT);
  try {
    await up(BASE);
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    try {
      await shots(browser);
      if (only.has('clips')) await clips(browser);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
  console.log(`wrote ${out}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
