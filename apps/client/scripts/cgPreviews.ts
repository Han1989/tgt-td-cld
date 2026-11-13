// `npm run cg-previews -w @tdt/client`: CrazyGames' two preview videos (q5, docs/crazygames/SUBMISSION.md), recorded
// in real time from a real solo Quick match on the e2e build:
//
//   docs/crazygames/preview-landscape-1920x1080.mp4   the desktop layout at 1920 × 1080, the camera zoomed on the action
//                                                     so the map fills the frame's width (no dark side bands)
//   docs/crazygames/preview-portrait-1080x1620.mp4    the phone layout (412 × 618 at 2.62×: 1080 × 1620)
//
// Each opens on its cover (docs/crazygames/cover-1920x1080.png, cover-800x1200.png: `npm run press-shots -- --only
// cg` first) for a second, then four moments at real speed, cut together: the build phase (towers going up), a wave
// on the towers, an ultimate (the Ranger's Arrow Storm, `?lab&ult`), and a boss (Quick's wave 5). Frames come from
// Chromium's screencast with their own timestamps, so a slow software GPU drops frames but never changes the speed;
// ffmpeg writes 30 fps H.264, no sound, no cursor (a screencast has none), 15–20 s, under 50 MB.
//
//   npm run build:e2e -w @tdt/client && npm run cg-previews -w @tdt/client [-- --only landscape,portrait] [--out DIR]
//
// `CHROMIUM_PATH` for a Chromium of another revision than Playwright's. About 5 minutes. Look at both before committing.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = join(root, '..', '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const outDir = ((p: string) => (isAbsolute(p) ? p : resolve(process.cwd(), p)))(arg('out', join(repo, 'docs', 'crazygames')));
const work = join(root, 'dist-previews');
const only = new Set(arg('only', 'landscape,portrait').split(','));
const dist = join(root, 'dist-e2e');
const SETTINGS = { quality: 'high', display: 'normal', tutorial: 'skipped', airLesson: 'seen', repairHint: 'seen', zoomHint: 'seen', endlessRoomLine: 'seen' };

const VIDEOS = {
  landscape: {
    file: 'preview-landscape-1920x1080.mp4',
    cover: 'cover-1920x1080.png',
    out: { w: 1920, h: 1080 },
    context: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  },
  portrait: {
    file: 'preview-portrait-1080x1620.mp4',
    cover: 'cover-800x1200.png',
    out: { w: 1080, h: 1620 },
    context: { viewport: { width: 412, height: 618 }, deviceScaleFactor: 1080 / 412, isMobile: true, hasTouch: true },
  },
} as const;
type Kind = keyof typeof VIDEOS;

interface Shot {
  file: string;
  t: number;
}

/** Records the page's screencast for `ms` while `during` runs; the frames with their timestamps (s). */
async function record(cdp: CDPSession, dir: string, ms: number, size: { w: number; h: number }, during?: () => Promise<void>): Promise<Shot[]> {
  const shots: Shot[] = [];
  let n = 0;
  const onFrame = async (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const file = join(dir, `f${String(Date.now())}-${String(n++).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    shots.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size.w, maxHeight: size.h, everyNthFrame: 1 });
  const t0 = Date.now();
  if (during) await during();
  const left = ms - (Date.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  return shots;
}

/** The camera on the landscape frame: the map's width filling the frame, centred on `window.__camAt` (world px). */
const CAMERA_JS = `(() => {
  const loop = () => {
    const t = window.__tdt;
    if (t && window.__camAt && t.camera) {
      const c = t.camera;
      const z = innerWidth / (t.map.width * 32);
      c.zoom = z;
      const want = window.__camAt;
      const cur = window.__camNow ?? want;
      const k = 0.08;
      window.__camNow = { x: cur.x + (want.x - cur.x) * k, y: cur.y + (want.y - cur.y) * k };
      c.x = t.map.width * 16;
      c.y = window.__camNow.y * t.view().cos;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;

async function camAt(p: Page, kind: Kind, x: number, y: number): Promise<void> {
  if (kind === 'landscape') await p.evaluate(([wx, wy]) => ((window as any).__camAt = { x: wx, y: wy }), [x * 32, y * 32]);
  else await p.evaluate(([tx, ty]) => (window as any).__tdt.command({ type: 'move', x: tx, y: ty }), [x, y]);
}

async function shoot(browser: Browser, url: string, kind: Kind): Promise<Shot[][]> {
  const v = VIDEOS[kind];
  const frames = join(work, kind);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const ctx = await browser.newContext({ ...v.context, serviceWorkers: 'block' });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  const t = (js: string) => p.evaluate(js);
  try {
    await p.goto(`${url}?lab&ult&weather=clear&light=afternoon`);
    await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
    await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
    await p.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
    await p.locator('#lobby-offline').click();
    await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length, undefined, { timeout: 240_000 });
    await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
    if (kind === 'landscape') await t(CAMERA_JS);
    // The pads: the middle lane's own, the rows just above the safe zone, nearest the Heart first.
    const pads = (await t(`(() => {
      const tt = window.__tdt; const m = tt.map;
      const own = tt.latest().pads.map((q) => ({ id: q.id, ...m.pads[q.id] }));
      const ys = [...new Set(own.map((q) => q.y))].sort((a, b) => b - a);
      const pick = own.filter((q) => q.y === ys[1] || q.y === ys[2]).sort((a, b) => a.x - b.x);
      return pick.map((q) => ({ id: q.id, x: q.x, y: q.y }));
    })()`)) as { id: number; x: number; y: number }[];
    const mid = { x: pads.reduce((a, q) => a + q.x, 0) / pads.length, y: pads.reduce((a, q) => a + q.y, 0) / pads.length };
    const cdp = await ctx.newCDPSession(p);
    await camAt(p, kind, mid.x, mid.y - 2);
    await p.waitForTimeout(2500);
    const cuts: Shot[][] = [];
    const kinds = ['arrow', 'cannon', 'frost', 'arcane', 'flak', 'arrow', 'cannon', 'frost'];
    // 1. The build phase: towers going up on the pads, one every half second.
    cuts.push(
      await record(cdp, frames, 4200, v.out, async () => {
        for (const [i, pad] of pads.slice(0, 7).entries()) {
          await p.evaluate(([id, k]) => (window as any).__tdt.command({ type: 'build', padId: id, tower: k }), [pad.id, kinds[i]!] as const);
          await p.waitForTimeout(520);
        }
      }),
    );
    // Upgrades off camera, then wave 3.
    for (let round = 0; round < 2; round++) {
      await t(`(() => { const tt = window.__tdt; for (const tw of tt.latest().towers) tt.command({ type: 'upgrade', towerId: tw.id }); })()`);
      await p.waitForTimeout(300);
    }
    await t('window.__tdt.skipTo(3)');
    await p.waitForFunction(
      (y) => (window as any).__tdt.latest().creeps.filter((c: any) => c.y > y - 9 && c.y < y + 1).length >= 6,
      mid.y,
      { timeout: 120_000, polling: 100 },
    );
    // 2. A wave on the towers.
    cuts.push(await record(cdp, frames, 4800));
    // 3. An ultimate: Arrow Storm on every lane, 0.4 s in.
    await t('window.__tdt.skipTo(4)');
    await p.waitForFunction(
      (y) => (window as any).__tdt.latest().creeps.filter((c: any) => c.y > y - 9 && c.y < y + 1).length >= 8,
      mid.y,
      { timeout: 120_000, polling: 100 },
    );
    cuts.push(
      await record(cdp, frames, 3400, v.out, async () => {
        await p.waitForTimeout(400);
        await t(`window.__tdt.command({ type: 'cast', slot: 'R' })`);
      }),
    );
    // 4. The boss: Quick's wave 5, followed down its road.
    await t('window.__tdt.skipTo(5)');
    await p.waitForFunction(
      (y) => (window as any).__tdt.latest().creeps.some((c: any) => c.boss !== false && /ironhorn|matriarch|shardback/.test(c.kind) && c.y > y - 12),
      mid.y,
      { timeout: 180_000, polling: 100 },
    );
    const boss = (await t(`(() => { const b = window.__tdt.latest().creeps.find((c) => /ironhorn|matriarch|shardback/.test(c.kind)); return { x: b.x, y: b.y }; })()`)) as { x: number; y: number };
    await camAt(p, kind, boss.x, boss.y + 2);
    await p.waitForTimeout(600);
    cuts.push(await record(cdp, frames, 5000));
    return cuts;
  } finally {
    await ctx.close();
  }
}

/** The cover for a second, then the cuts at their own pace, as 30 fps H.264 with no sound. */
function encode(kind: Kind, cuts: Shot[][]): void {
  const v = VIDEOS[kind];
  const list: string[] = [];
  const cover = join(outDir, v.cover);
  if (!existsSync(cover)) throw new Error(`no ${cover}: npm run press-shots -w @tdt/client -- --only cg first`);
  list.push(`file '${cover}'`, 'duration 1.0');
  for (const cut of cuts) {
    for (const [i, s] of cut.entries()) {
      const next = cut[i + 1];
      const d = next ? Math.max(0.001, next.t - s.t) : 1 / 30;
      list.push(`file '${s.file}'`, `duration ${d.toFixed(4)}`);
    }
  }
  list.push(`file '${cut0(cuts)}'`);
  const listFile = join(work, `${kind}.txt`);
  writeFileSync(listFile, list.join('\n'));
  const out = join(outDir, v.file);
  const { w, h } = v.out;
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', out,
    ],
    { stdio: 'inherit' },
  );
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, ${probe.replace(/\n/g, ' · ')}, ${cuts.map((c) => c.length).join(' + ')} frames`);
}

/** ffmpeg's concat demuxer drops the last entry's duration: the last frame again. */
function cut0(cuts: Shot[][]): string {
  return cuts.at(-1)!.at(-1)!.file;
}

if (!existsSync(join(dist, 'index.html'))) throw new Error('build the e2e client first: npm run build:e2e -w @tdt/client');
mkdirSync(work, { recursive: true });
const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  for (const kind of ['landscape', 'portrait'] as const) {
    if (!only.has(kind)) continue;
    console.log(`${kind}…`);
    encode(kind, await shoot(browser, url, kind));
  }
} finally {
  await browser.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
