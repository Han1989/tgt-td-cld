// `npm run cg-previews -w @tdt/client`: CrazyGames' two preview videos (q5, q9; docs/crazygames/SUBMISSION.md),
// recorded in real time from a real solo Quick match on the e2e build, with the bot teammate beside the Ranger (q6):
//
//   docs/crazygames/preview-landscape-1920x1080.mp4   the desktop layout at 1920 × 1080, the camera zoomed on the action
//                                                     so the map fills the frame's width (no dark side bands)
//   docs/crazygames/preview-portrait-1080x1620.mp4    the phone layout (412 × 618 at 2.62×: 1080 × 1620)
//   docs/crazygames/previews-sheet.jpg                six frames a video (the cover, the build, the wave, the cast, the
//                                                     fuse, the boss), the landscape row over the portrait row
//
// Each opens on its cover (docs/crazygames/cover-1920x1080.png, cover-800x1200.png: `npm run press-shots -- --only
// cg` first) for a second, then four moments at real speed, cut together: the build phase (towers going up), a wave
// on the towers with the Ranger and his bot teammate (the Arcanist, `?ally`) both in the frame, a combo (the Ranger's
// Arrow Storm, `?lab&ult`, answered by the ally's Meteor 0.5 s later by its own rule: they fuse into Meteor Rain, and
// the cut runs until it has landed; confirmed by the snapshots' `combo` event, else played again on a new wave, at
// most three tries), and a boss (Quick's wave 5). Frames come from Chromium's screencast with their own timestamps,
// so a slow software GPU drops frames but never changes the speed; ffmpeg writes 30 fps H.264, no sound, no cursor
// (a screencast has none), 15–20 s, under 50 MB.
//
//   npm run build:e2e -w @tdt/client && npm run cg-previews -w @tdt/client [-- --only landscape,portrait] [--out DIR]
//
// `CHROMIUM_PATH` for a Chromium of another revision than Playwright's. About 10 minutes. Look at both before committing.

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
const SETTINGS = { quality: 'high', display: 'normal', tutorial: 'skipped', airLesson: 'seen', repairHint: 'seen', zoomHint: 'seen', endlessRoomLine: 'seen', allyHint: 'seen', wheelHint: 'seen' };

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

/** The heroes on the screen: the Ranger (yours) and the ally (the hero of the player with `bot: true`). */
interface Heroes {
  me: { x: number; y: number; alive: boolean; rReady: boolean; hp: number };
  ally: { x: number; y: number; alive: boolean; rReady: boolean } | null;
  /** Each hero's screen position inside the frame (40 px in from every edge, under the top bar). */
  meIn: boolean;
  allyIn: boolean;
  /** Creeps drawn inside the frame. */
  creepsIn: number;
  tick: number;
}

const HEROES_JS = `(() => {
  const tt = window.__tdt; const s = tt.latest(); const c = tt.camera;
  const inside = (x, y) => { const q = c.worldToScreen(x * 32, y * 32); return q.x > 40 && q.x < innerWidth - 40 && q.y > 84 && q.y < innerHeight - 40; };
  const meId = tt.me();
  const allyP = s.players.find((p) => p.bot);
  const view = (h) => h && { x: h.x, y: h.y, alive: h.alive, hp: h.alive ? h.hp / h.maxHp : 0, rReady: h.skills.some((k) => k.slot === 'R' && k.rank > 0 && k.cooldown === 0) };
  const mine = s.heroes.find((h) => h.owner === meId);
  const ally = allyP ? s.heroes.find((h) => h.id === allyP.heroId) : undefined;
  return {
    me: view(mine), ally: view(ally) ?? null,
    meIn: !!mine && inside(mine.x, mine.y), allyIn: !!ally && inside(ally.x, ally.y),
    creepsIn: s.creeps.filter((k) => inside(k.x, k.y)).length, tick: s.tick,
  };
})()`;

/**
 * Every \`combo\` event the local host sends, read from the worker's messages themselves (a page that draws one frame
 * in several ticks on a software GPU handles several messages in a row, so polling the latest snapshot misses some),
 * and the fuse ribbon's word and tick when it shows. An init script: it wraps \`Worker\` before the game makes one.
 */
const COMBO_INIT = `(() => {
  window.__combos = [];
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        if (typeof e.data !== 'string' || !e.data.includes('"type":"combo"')) return;
        try {
          const m = JSON.parse(e.data); const s = m.snap ?? m;
          for (const ev of s.events ?? []) if (ev.type === 'combo') window.__combos.push({ tick: s.tick, combo: ev.combo });
        } catch {}
      });
    }
  };
  setInterval(() => {
    const f = document.getElementById('fuse-ribbon');
    if (f && f.classList.contains('on') && !window.__fuseSeen) {
      window.__fuseSeen = window.__tdt?.latest()?.tick ?? 0;
      window.__fuseWord = document.getElementById('fuse-ribbon-word')?.textContent ?? '';
    }
  }, 10);
})()`;

export interface CutLog {
  /** Each cut's length in the video (s), after the cover's second. */
  cuts: number[];
  /** Seconds into the combo cut: the Ranger's cast and the fuse. */
  cast: number;
  fuse: number;
  comboTick: number;
  tries: number;
  framed: { wave: boolean; cast: boolean };
  /** The boss cut (q10): how many tries it took, and the Ranger's lowest HP (share of his max) in the kept one. */
  boss: { tries: number; lowestHp: number; inside: boolean };
}

/**
 * The boss cut's watch (q10), installed in the page as the cut starts: every frame, the Ranger's lowest HP (0 once he
 * fell), whether the HUD said "Your hero has fallen" or showed a respawn timer, and whether the boss stood whole inside
 * the frame (its feet under the top bar by its drawn height, above the bottom edge).
 */
const BOSS_WATCH_JS = `(() => {
  const w = { lowest: 1, fallen: false, respawn: false, outside: 0, frames: 0, bossAlive: true };
  window.__bossWatch = w;
  window.__bossWatchOn = true;
  const loop = () => {
    if (!window.__bossWatchOn) return;
    const tt = window.__tdt; const s = tt.latest(); const c = tt.camera;
    const me = s.heroes.find((h) => h.owner === tt.me());
    w.frames++;
    w.lowest = Math.min(w.lowest, me && me.alive ? me.hp / me.maxHp : 0);
    for (const el of document.querySelectorAll('.toast')) if (/has fallen/i.test(el.textContent ?? '')) w.fallen = true;
    for (const el of document.querySelectorAll('#respawn, .t-respawn')) {
      if (!el.classList.contains('hidden') && /Respawning in/.test(el.textContent ?? '') && el.getClientRects().length > 0) w.respawn = true;
    }
    const b = window.__bossId == null ? undefined : s.creeps.find((k) => k.id === window.__bossId);
    w.bossAlive = !!b;
    if (b) {
      const q = c.worldToScreen(b.x * 32, b.y * 32);
      // The drawn boss: about 3.4 tiles tall and 2.6 wide on the screen at this zoom (the match sheets' frames).
      const tall = 3.4 * 32 * c.zoom; const half = 1.3 * 32 * c.zoom;
      if (q.y - tall < 44 || q.y + 6 > innerHeight || q.x - half < 0 || q.x + half > innerWidth) w.outside++;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;

async function shoot(browser: Browser, url: string, kind: Kind): Promise<{ cuts: Shot[][]; log: CutLog }> {
  const v = VIDEOS[kind];
  const frames = join(work, kind);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const ctx = await browser.newContext({ ...v.context, serviceWorkers: 'block' });
  await ctx.addInitScript('globalThis.__name = (f) => f;');
  await ctx.addInitScript(COMBO_INIT);
  await ctx.addInitScript((s) => localStorage.setItem('tdt.settings', JSON.stringify(s)), SETTINGS);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  const t = (js: string) => p.evaluate(js);
  const heroes = () => t(HEROES_JS) as Promise<Heroes>;
  /** No teach line on screen (the Wisps line, the gold nudge: \`.toast.teach\`, 3.4 s each), at most 8 s. */
  const noHint = () =>
    p.waitForFunction(() => !document.querySelector('.toast.teach'), undefined, { timeout: 8000, polling: 100 }).catch(() => {});
  try {
    await p.goto(`${url}?lab&ult&ally&weather=clear&light=afternoon`);
    await p.waitForSelector('html[data-ready]', { timeout: 120_000 });
    await p.locator('#lobby-heroes-home .hero-pick[data-hero="ranger"]').click();
    await p.locator('#lobby-mode-home .mode-pick[data-mode="quick"]').click();
    await p.locator('#lobby-offline').click();
    await p.waitForFunction(() => !!(window as any).__tdt?.latest()?.heroes?.length, undefined, { timeout: 240_000 });
    await p.waitForSelector('html[data-plate="ready"][data-ui="ready"][data-structures][data-creep-sheets][data-hero-sheets]', { timeout: 240_000 });
    if (kind === 'landscape') await t(CAMERA_JS);
    if (!(await heroes()).ally) throw new Error('no bot teammate in the match (?ally)');
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
    // 1. The build phase: towers going up on the pads, one every 0.42 s.
    cuts.push(
      await record(cdp, frames, 3300, v.out, async () => {
        for (const [i, pad] of pads.slice(0, 7).entries()) {
          await p.evaluate(([id, k]) => (window as any).__tdt.command({ type: 'build', padId: id, tower: k }), [pad.id, kinds[i]!] as const);
          await p.waitForTimeout(420);
        }
      }),
    );
    // An Arrow (it hits air) on the free pad nearest each edge, so every lane the Wisps walk has one and the game's
    // on-the-wave air line stays quiet; then, off camera, an Arrow on a free pad every 12 s from the far end of the
    // map, so gold never sits long enough for the unspent-gold nudge (it waits 22 s without a spend).
    await t(`(() => {
      const tt = window.__tdt; const m = tt.map;
      const free = () => { const s = tt.latest(); const taken = new Set(s.towers.map((x) => x.padId)); return s.pads.filter((q) => !taken.has(q.id)).map((q) => ({ id: q.id, ...m.pads[q.id] })); };
      const f = free().sort((a, b) => a.x - b.x);
      for (const q of [f[0], f.at(-1)]) if (q) tt.command({ type: 'build', padId: q.id, tower: 'arrow' });
      setInterval(() => { const q = free().sort((a, b) => a.y - b.y)[0]; if (q) tt.command({ type: 'build', padId: q.id, tower: 'arrow' }); }, 12000);
    })()`);
    // Upgrades off camera, then wave 3.
    for (let round = 0; round < 2; round++) {
      await t(`(() => { const tt = window.__tdt; for (const tw of tt.latest().towers) tt.command({ type: 'upgrade', towerId: tw.id }); })()`);
      await p.waitForTimeout(300);
    }
    /**
     * Both heroes in the frame: the Ranger walks to the ally's side of the pads (never the ally: it goes where the
     * game sends it), the landscape camera between the two; the portrait camera follows the Ranger.
     */
    const frameBoth = async (minCreeps: number, timeout: number): Promise<Heroes> => {
      const until = Date.now() + timeout;
      let h = await heroes();
      let lastGoal = { x: -99, y: -99 };
      while (Date.now() < until) {
        h = await heroes();
        const ally = h.ally;
        if (ally && h.meIn && h.allyIn && h.creepsIn >= minCreeps && ally.alive && ally.rReady && h.me.rReady) return h;
        if (ally) {
          // A spot two tiles toward the pads from the ally, as near the middle lane as it can be.
          const goal = { x: ally.x + Math.sign(mid.x - ally.x) * Math.min(4, Math.abs(mid.x - ally.x)), y: ally.y + 1.5 };
          if (Math.hypot(goal.x - lastGoal.x, goal.y - lastGoal.y) > 1.5) {
            await p.evaluate(([x, y]) => (window as any).__tdt.command({ type: 'move', x, y }), [goal.x, goal.y]);
            lastGoal = goal;
          }
          if (kind === 'landscape') await camAt(p, kind, (h.me.x + ally.x) / 2, (h.me.y + ally.y) / 2 + 1);
        }
        await p.waitForTimeout(150);
      }
      return h;
    };
    await t('window.__tdt.skipTo(3)');
    await p.waitForFunction(
      (y) => (window as any).__tdt.latest().creeps.filter((c: any) => c.y > y - 9 && c.y < y + 1).length >= 6,
      mid.y,
      { timeout: 120_000, polling: 100 },
    );
    // 2. A wave on the towers, the Ranger beside his ally.
    const atWave = await frameBoth(4, 15_000);
    await noHint();
    const waveFramed = atWave.meIn && atWave.allyIn;
    cuts.push(await record(cdp, frames, 3600, v.out));
    // 3. The combo: the Ranger's Arrow Storm 0.4 s in, the ally's Meteor 0.5 s later by its own rule, Meteor Rain.
    let combo: { tick: number; combo: string } | undefined;
    let tries = 0;
    let castFramed = false;
    let castAt = 0;
    let castIn = 0.4;
    let comboCut: Shot[] = [];
    while (!combo && tries < 3) {
      tries++;
      await t('window.__tdt.skipTo(4)');
      await frameBoth(10, 90_000);
      // One banner at a time (q10): the cut starts once the wave's banner has gone, with the creeps still coming.
      await p.waitForFunction(() => document.getElementById('banner')?.classList.contains('hidden') ?? true, undefined, { timeout: 15_000, polling: 100 }).catch(() => {});
      const ready = await frameBoth(10, 30_000);
      await noHint();
      console.log(`  combo try ${tries}: Ranger ${ready.meIn ? 'in' : 'OUT'}, ally ${ready.allyIn ? 'in' : 'OUT'}, ${ready.creepsIn} creeps in the frame, R ready ${ready.me.rReady}/${ready.ally?.rReady}`);
      await t("window.__combos = []; window.__fuseSeen = 0; window.__fuseWord = '';");
      let castTick = 0;
      let castWall = 0;
      comboCut = await record(cdp, frames, 5500, v.out, async () => {
        await p.waitForTimeout(400);
        const at = await heroes();
        castFramed = at.meIn && at.allyIn;
        castTick = at.tick;
        castWall = Date.now() / 1000;
        await t(`window.__tdt.command({ type: 'cast', slot: 'R' })`);
      });
      const seen = (await t('({ combos: window.__combos, fuse: window.__fuseSeen, word: window.__fuseWord })')) as {
        combos: { tick: number; combo: string }[];
        fuse: number;
        word: string;
      };
      // The event; else the HUD's fuse ribbon naming Meteor Rain (the tick the page first saw it on).
      combo = seen.combos.find((c) => c.combo === 'meteorRain') ?? (/meteor rain/i.test(seen.word) ? { tick: seen.fuse, combo: 'meteorRain (fuse ribbon)' } : undefined);
      console.log(`  cast at tick ${castTick}; combos ${JSON.stringify(seen.combos)}; fuse ribbon "${seen.word}" at tick ${seen.fuse}`);
      // In the cut's own time: the screencast's first frame comes a moment after the recording starts.
      const first = comboCut[0]?.t ?? castWall;
      const lag = castWall - first;
      castIn = lag >= 0 && lag < 3 ? lag : 0.4;
      if (combo) castAt = castIn + (combo.tick - castTick) / 20;
    }
    if (!combo) throw new Error('no meteorRain combo in three tries');
    cuts.push(comboCut);
    // 4. The boss: Quick's wave 5, followed down its road, the Ranger alive from the cut's first frame to its last
    // (q10): he stands down-lane of the boss behind his towers and steps back as anything comes within reach, the
    // landscape camera between the two so the boss stays whole in the frame. A cut where he fell is played again (a
    // new wave 5), at most three tries.
    const SAFE = 7;
    let bossCut: Shot[] = [];
    let bossTries = 0;
    let bossLog = { tries: 0, lowestHp: 0, inside: false };
    for (;;) {
      bossTries++;
      // Back by his towers with at least 60% of his HP (he waits for a respawn, then regenerates out of reach).
      await p.evaluate(([x, y]) => (window as any).__tdt.command({ type: 'move', x, y }), [mid.x, mid.y + 1.5]);
      if (kind === 'landscape') await camAt(p, kind, mid.x, mid.y - 2);
      await p
        .waitForFunction(() => {
          const tt = (window as any).__tdt;
          const me = tt.latest().heroes.find((h: any) => h.owner === tt.me());
          return !!me && me.alive && me.hp / me.maxHp >= 0.6;
        }, undefined, { timeout: 60_000, polling: 200 })
        .catch(() => {});
      await t('window.__tdt.skipTo(5)');
      await p.waitForFunction(
        (y) => (window as any).__tdt.latest().creeps.some((c: any) => /ironhorn|matriarch|shardback/.test(c.kind) && c.y > y - 12),
        mid.y,
        { timeout: 180_000, polling: 100 },
      );
      // The boss on the lane nearest the middle pads.
      const boss = (await t(`(() => {
        const bs = window.__tdt.latest().creeps.filter((c) => /ironhorn|matriarch|shardback/.test(c.kind) && c.y > ${mid.y} - 12);
        bs.sort((a, b) => Math.abs(a.x - ${mid.x}) - Math.abs(b.x - ${mid.x}));
        window.__bossId = bs[0].id;
        return { id: bs[0].id, x: bs[0].x, y: bs[0].y };
      })()`)) as { id: number; x: number; y: number };
      /** One step of the cut: the Ranger away from every creep inside SAFE tiles (down-lane first), the camera on both. */
      const keepAway = async (): Promise<void> => {
        const step = (await t(`(() => {
          const tt = window.__tdt; const s = tt.latest(); const m = tt.map;
          const me = s.heroes.find((h) => h.owner === tt.me());
          const b = s.creeps.find((c) => c.id === window.__bossId);
          if (!me || !me.alive) return null;
          let ax = 0; let ay = 0; let near = false;
          for (const c of s.creeps) {
            const dx = me.x - c.x; const dy = me.y - c.y; const d = Math.hypot(dx, dy);
            if (d > ${SAFE} || d < 0.01) continue;
            near = true; const k = (${SAFE} - d) / d; ax += dx * k; ay += dy * k;
          }
          const goal = near ? { x: me.x + ax * 0.6, y: me.y + ay * 0.6 + 1.5 } : null;
          if (goal) { goal.x = Math.max(1.5, Math.min(m.width - 1.5, goal.x)); goal.y = Math.max(1.5, Math.min(m.height - 2, goal.y)); }
          return { goal, me: { x: me.x, y: me.y }, boss: b ? { x: b.x, y: b.y } : null };
        })()`)) as { goal: { x: number; y: number } | null; me: { x: number; y: number }; boss: { x: number; y: number } | null } | null;
        if (!step) return;
        if (step.goal) await p.evaluate(([x, y]) => (window as any).__tdt.command({ type: 'move', x, y }), [step.goal.x, step.goal.y]);
        if (kind === 'landscape' && step.boss) {
          // The boss in the upper half, the Ranger below it, both in the frame.
          await camAt(p, kind, step.boss.x, Math.min(step.boss.y + 3.2, (step.boss.y + step.me.y) / 2 + 0.6));
        }
      };
      // Down-lane of the boss, SAFE + 1 tiles toward the Heart, before the cut starts.
      await p.evaluate(([x, y]) => (window as any).__tdt.command({ type: 'move', x, y }), [boss.x + Math.sign(mid.x - boss.x) * 1.5, boss.y + SAFE + 1]);
      for (let i = 0; i < 6; i++) {
        await keepAway();
        await p.waitForTimeout(100);
      }
      await noHint();
      await t(BOSS_WATCH_JS);
      const BOSS_MS = 3800;
      const cut = await record(cdp, frames, BOSS_MS, v.out, async () => {
        const until = Date.now() + BOSS_MS - 150;
        while (Date.now() < until) {
          await keepAway();
          await p.waitForTimeout(120);
        }
      });
      const watch = (await t('(window.__bossWatchOn = false, window.__bossWatch)')) as {
        lowest: number;
        fallen: boolean;
        respawn: boolean;
        outside: number;
        frames: number;
        bossAlive: boolean;
      };
      const alive = watch.lowest > 0 && !watch.fallen && !watch.respawn;
      const inside = watch.outside === 0;
      console.log(
        `  boss try ${bossTries}: Ranger's lowest HP ${(watch.lowest * 100).toFixed(0)}%, fallen ${watch.fallen}, respawn timer ${watch.respawn}, ` +
          `boss outside the frame on ${watch.outside} of ${watch.frames} frames, boss alive at the end ${watch.bossAlive}`,
      );
      bossCut = cut;
      bossLog = { tries: bossTries, lowestHp: watch.lowest, inside };
      if ((alive && watch.bossAlive && (inside || kind === 'portrait')) || bossTries >= 3) {
        if (!alive) throw new Error('the Ranger fell in the boss cut three times');
        break;
      }
    }
    cuts.push(bossCut);
    const span = (c: Shot[]) => (c.length > 1 ? c.at(-1)!.t - c[0]!.t + 1 / 30 : 1 / 30);
    return {
      cuts,
      log: { cuts: cuts.map(span), cast: castIn, fuse: castAt, comboTick: combo.tick, tries, framed: { wave: waveFramed, cast: castFramed }, boss: bossLog },
    };
  } finally {
    await ctx.close();
  }
}

/** The cover for a second, then the cuts at their own pace, as 30 fps H.264 with no sound. */
function encode(kind: Kind, cuts: Shot[][]): string {
  const v = VIDEOS[kind];
  const list: string[] = [];
  const cover = join(outDir, v.cover);
  if (!existsSync(cover)) throw new Error(`no ${cover}: npm run press-shots -w @tdt/client -- --only cg first`);
  // The cover is its own input, a second at 30 fps, joined to the frames by the concat filter (as an entry of the
  // concat list its second was dropped).
  const coverJpg = join(work, `${kind}-cover.jpg`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', cover, '-vf', `scale=${v.out.w}:${v.out.h}:flags=lanczos`, '-q:v', '2', coverJpg]);
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
      '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-t', '1', '-i', coverJpg,
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-filter_complex',
      `[0:v]fps=30,format=yuv420p,setsar=1[c];` +
        `[1:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[g];` +
        `[c][g]concat=n=2:v=1:a=0[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', out,
    ],
    { stdio: 'inherit' },
  );
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB, ${probe.replace(/\n/g, ' · ')}, ${cuts.map((c) => c.length).join(' + ')} frames`);
  return out;
}

/** ffmpeg's concat demuxer drops the last entry's duration: the last frame again. */
function cut0(cuts: Shot[][]): string {
  return cuts.at(-1)!.at(-1)!.file;
}

/**
 * The contact sheet for Han's phone: six frames a video in order (the cover, the build, the wave, the cast, the fuse,
 * the boss), each frame's time under it, the landscape row over the portrait row, 2400 px wide.
 */
function sheet(made: Partial<Record<Kind, { file: string; log: CutLog }>>): void {
  const rows: string[] = [];
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  for (const kind of ['landscape', 'portrait'] as const) {
    const m = made[kind];
    if (!m) continue;
    const [build, wave, combo] = m.log.cuts as [number, number, number, number];
    const at = 1 + build + wave;
    const times = [0.5, 1 + build / 2, 1 + build + wave / 2, at + m.log.cast + 0.1, at + m.log.fuse + 1.8, at + combo + 2];
    const tiles = times.map((time, i) => {
      const f = join(work, `${kind}-sheet-${i}.png`);
      const w = 400;
      const label = `${time.toFixed(1)} s`;
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', time.toFixed(2), '-i', m.file, '-frames:v', '1', '-vf',
        `scale=${w}:-2:flags=lanczos,pad=iw:ih+36:0:0:color=0x15171c,drawtext=fontfile=${font}:text='${label}':x=(w-tw)/2:y=h-28:fontsize=20:fontcolor=white`,
        f,
      ]);
      return f;
    });
    const row = join(work, `${kind}-sheet.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...tiles.flatMap((f) => ['-i', f]), '-filter_complex', `hstack=inputs=${tiles.length}`, row]);
    rows.push(row);
  }
  if (rows.length === 0) return;
  const out = join(outDir, 'previews-sheet.jpg');
  const stack = rows.length > 1 ? ['-filter_complex', `vstack=inputs=${rows.length}`] : [];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...rows.flatMap((f) => ['-i', f]), ...stack, '-q:v', '4', out]);
  console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}

if (!existsSync(join(dist, 'index.html'))) throw new Error('build the e2e client first: npm run build:e2e -w @tdt/client');
mkdirSync(work, { recursive: true });
const server = await preview({ root, logLevel: 'warn', build: { outDir: dist }, preview: { port: 0, host: '127.0.0.1' } });
const made: Partial<Record<Kind, { file: string; log: CutLog }>> = {};
try {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('the preview server has no URL');
  for (const kind of ['landscape', 'portrait'] as const) {
    if (!only.has(kind)) continue;
    console.log(`${kind}…`);
    // A screencast hands frames in CSS px under an emulated scale factor (412 × 618 for the phone); a browser started
    // at the phone's scale hands them in device px (1080 × 1620), so the portrait video is not upscaled.
    const scale = VIDEOS[kind].context.deviceScaleFactor;
    const browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: [`--force-device-scale-factor=${scale}`],
    });
    try {
      const { cuts, log } = await shoot(browser, url, kind);
      made[kind] = { file: encode(kind, cuts), log };
      console.log(`  ${kind}: ${JSON.stringify(log)}`);
    } finally {
      await browser.close();
    }
  }
  sheet(made);
} finally {
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
