// `npm run lobby-shots -w @tdt/client [-- --only home,states,board,room,faces,icons,measure,clips] [--before DIR]
// [--out DIR]` (q13, q17): after `npm run build:e2e -w @tdt/client`, the home card's pictures for Han
// (docs/screenshots/lobby/): the home card with Endless's ten and the Daily run's three on the ribbon at 412 × 839
// (2×), 360 × 640 and 1280 × 720; the short-day states at 412 × 839 (Endless's two rows and yesterday's with the
// Daily run's yesterday, the empty line); the board card's Daily tab at 412 × 839 and 360 × 640; the room card (a
// stand-in room on a stubbed socket, as e2e/lobby.spec.ts's `fakeRoom`); the hero buttons enlarged with the Ranger
// picked and with the Warden picked (`buttons-after.png`), and with `--before DIR` (an e2e build of the commit
// before, its `dist-e2e`) the same buttons there and all four side by side (`buttons-before-after.png`), and the
// Warden's face where else it shows, the room's seats and a ribbon row, before and after (`icons-before-after.png`);
// the faces measured (faceLevels.ts, `faces.json`, printed); and two clips recorded in real time at 412 × 839 (H.264,
// no sound, about 10 s): `ribbon.mp4` (the names of both boards running, then a tap opening the board on the Daily
// run's tab) and `faces.mp4` (the three buttons at rest, then each picked in turn). The boards are made up
// (endless/today and daily/today stubbed, as e2e/lobby.spec.ts does). Needs ffmpeg with libx264. About 3 minutes;
// `CHROMIUM_PATH` for another Chromium. Look at every picture and both clips before committing.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { faceTable, measureFaces, type FaceNumbers } from './faceLevels';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const out = resolve(flag('--out') ?? join(root, '..', '..', 'docs', 'screenshots', 'lobby'));
const only = new Set((flag('--only') ?? 'home,states,board,room,faces,icons,measure,clips').split(','));
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

const DAILY_NAMES = ['Sora', 'Hal the Third', 'Nyx', 'Corin', 'Lumi'];

/** A made-up /daily/today (q16's `top` and `yesterdayTop`): today's five (this browser's the 2nd when `mine`), or none. */
function daily(today: boolean, mine = false) {
  return {
    day: new Date().toISOString().slice(0, 10),
    seed: 1,
    closesAt: Date.now() + 3 * 3600_000 + 60_000,
    runs: today ? 212 : 0,
    champion: { name: 'Kael', heart: 82, ticks: 13_000 },
    top: today
      ? DAILY_NAMES.map((name, i) => ({ rank: i + 1, name, hero: HEROES[(i + 1) % 3], won: i < 3, heart: i < 3 ? 94 - i * 9 : 0, wave: i < 3 ? 15 : 13 - i, ticks: 13_000 + i * 400, ...(mine && i === 1 ? { mine: true } : {}) }))
      : [],
    yesterdayTop: [
      { rank: 1, name: 'Ember', hero: 'warden', won: true, heart: 97, wave: 15, ticks: 12_800 },
      { rank: 2, name: 'Quill', hero: 'arcanist', won: true, heart: 90, wave: 15, ticks: 13_100 },
      { rank: 3, name: 'Moss', hero: 'ranger', won: true, heart: 77, wave: 15, ticks: 13_900 },
    ],
  };
}

const DAILY = daily(true, true);

async function home(ctx: BrowserContext, today: unknown, path = '/?lobby&daily', base = BASE, ribbon = true, dailyToday: unknown = DAILY): Promise<Page> {
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('tdt.settings', JSON.stringify({ tutorial: 'skipped' })));
  await page.route('**/endless/today', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(today) }));
  await page.route('**/daily/today', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dailyToday) }));
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
    for (const [name, today, day] of [
      ['home-few-and-yesterday.png', board(2), daily(false)],
      ['home-empty.png', board(0), { ...daily(false), yesterdayTop: [] }],
    ] as const) {
      const ctx = await browser.newContext(phone);
      const page = await home(ctx, today, undefined, BASE, true, day);
      await shot(page, name);
      await ctx.close();
    }
  }
  if (only.has('board')) {
    // The board card on the Daily run's tab, opened by a tap on one of its rows.
    for (const s of sizes.slice(0, 2)) {
      const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale, isMobile: true, hasTouch: true });
      const page = await home(ctx, board(10, true));
      await page.locator('#lobby-ribbon .rib-row[data-board="daily"]').first().dispatchEvent('click');
      await page.waitForSelector('#lobby-board-daily:not(.hidden)');
      await page.waitForTimeout(500);
      await shot(page, `board-daily-${s.viewport.width}x${s.viewport.height}.png`);
      await ctx.close();
    }
  }
  if (only.has('room')) {
    const { ctx, page: host } = await room(browser, BASE);
    await shot(host, 'room-412x839.png');
    await ctx.close();
  }
  if (only.has('faces')) {
    // The buttons with the Ranger picked (the Warden not), then with the Warden picked, one under the other.
    const grab = async (base: string, ribbon: boolean) => {
      const ctx = await browser.newContext({ ...phone, deviceScaleFactor: 4, reducedMotion: 'reduce' });
      const page = await home(ctx, board(10), '/?lobby&daily', base, ribbon);
      const pngs: Buffer[] = [];
      for (const hero of ['ranger', 'warden']) {
        await page.locator(`#lobby-heroes-home .hero-pick[data-hero="${hero}"]`).click();
        await page.waitForTimeout(500);
        pngs.push(await page.locator('#lobby-heroes-home').screenshot());
      }
      await ctx.close();
      return pngs;
    };
    const after = await grab(BASE, true);
    writeFileSync(join(out, 'buttons-after.png'), await stack(browser, [['Ranger picked', after[0]!], ['Warden picked', after[1]!]]));
    console.log('  buttons-after.png');
    if (before) {
      const server = serve(before, BEFORE_PORT);
      try {
        await up(`http://localhost:${BEFORE_PORT}`);
        const was = await grab(`http://localhost:${BEFORE_PORT}`, true);
        writeFileSync(join(out, 'buttons-before.png'), await stack(browser, [['Ranger picked', was[0]!], ['Warden picked', was[1]!]]));
        const png = await stack(browser, [
          ['Before (main), Ranger picked', was[0]!],
          ['After (q17), Ranger picked', after[0]!],
          ['Before (main), Warden picked', was[1]!],
          ['After (q17), Warden picked', after[1]!],
        ]);
        writeFileSync(join(out, 'buttons-before-after.png'), png);
        console.log('  buttons-before.png, buttons-before-after.png');
      } finally {
        server.kill();
      }
    }
  }
}

/**
 * The faces' numbers (faceLevels.ts) on the home card at 412 × 839 and 4×, under reduced motion: this build, and with
 * `--before DIR` that build too, printed and written to faces.json.
 */
async function measure(browser: Browser): Promise<void> {
  const grab = async (base: string): Promise<FaceNumbers[]> => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 839 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await home(ctx, board(10), '/?lobby&daily', base, base === BASE);
    const rows = await measureFaces(page, 4);
    await ctx.close();
    return rows;
  };
  const result: Record<string, FaceNumbers[]> = {};
  if (before) {
    const server = serve(before, BEFORE_PORT);
    try {
      await up(`http://localhost:${BEFORE_PORT}`);
      result.before = await grab(`http://localhost:${BEFORE_PORT}`);
    } finally {
      server.kill();
    }
    console.log(`Before\n${faceTable(result.before)}`);
  }
  result.after = await grab(BASE);
  console.log(`After\n${faceTable(result.after)}`);
  writeFileSync(join(out, 'faces.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log('  faces.json');
}

/** The room card of three (the Warden in the second seat) on a stubbed socket (the e2e game server is ws://127.0.0.1:9). */
async function room(browser: Browser, base: string, scale = 2): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 839 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
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
  const page = await home(ctx, board(10), '/?lobby&daily', base);
  await page.locator('#lobby-name').fill('Han');
  await page.locator('#lobby-create').click();
  await page.waitForSelector('#lobby-room:not(.hidden)');
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** PNGs one under the other on the lobby's dark, each under its label. */
async function stack(browser: Browser, parts: [string, Buffer][]): Promise<Buffer> {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const png = await page.evaluate(
    async (items) => {
      // No named functions in the page (tsx would wrap them in a helper the page lacks).
      const imgs = await Promise.all(
        items.map(async ([, src]) => {
          const i = new Image();
          i.src = src;
          await i.decode();
          return i;
        }),
      );
      const label = 56;
      const c = document.createElement('canvas');
      c.width = Math.max(...imgs.map((i) => i.width)) + 40;
      c.height = imgs.reduce((h, i) => h + i.height + label + 16, 24);
      const g = c.getContext('2d')!;
      g.fillStyle = '#121a1c';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e9eef6';
      g.font = '600 34px system-ui, sans-serif';
      let y = 0;
      imgs.forEach((img, k) => {
        g.fillText(items[k]![0], 20, y + 44);
        g.drawImage(img, 20, y + label);
        y += img.height + label + 16;
      });
      return c.toDataURL('image/png');
    },
    parts.map(([l, b]) => [l, `data:image/png;base64,${b.toString('base64')}`] as [string, string]),
  );
  await ctx.close();
  return Buffer.from(png.split(',')[1]!, 'base64');
}

/**
 * The Warden's face where else it shows: the room's seats and the ribbon's first row (his), on `base`, at 4×.
 */
async function icons(browser: Browser, base: string): Promise<[Buffer, Buffer]> {
  const { ctx, page } = await room(browser, base, 4);
  const seats = await page.locator('#lobby-players').screenshot();
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 412, height: 839 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true });
  const p2 = await home(c2, board(10), '/?lobby&daily', base);
  // Held still at its start, so the row is whole.
  await p2.addStyleTag({ content: '.ribbon-track.moving { animation: none !important }' });
  const row = await p2.locator('#lobby-ribbon .rib-row').first().screenshot();
  await c2.close();
  return [seats, row];
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
    await page.locator('#lobby-ribbon .rib-row[data-board="daily"]').first().dispatchEvent('click');
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
      if (only.has('measure')) await measure(browser);
      if (only.has('icons') && before) {
        const server = serve(before, BEFORE_PORT);
        try {
          await up(`http://localhost:${BEFORE_PORT}`);
          const [seatsWas, rowWas] = await icons(browser, `http://localhost:${BEFORE_PORT}`);
          const [seats, row] = await icons(browser, BASE);
          writeFileSync(
            join(out, 'icons-before-after.png'),
            await stack(browser, [
              ['Seats, before (main)', seatsWas],
              ['Seats, after (q17)', seats],
              ['A ribbon row (the Warden), before', rowWas],
              ['A ribbon row (the Warden), after', row],
            ]),
          );
          console.log('  icons-before-after.png');
        } finally {
          server.kill();
        }
      }
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
