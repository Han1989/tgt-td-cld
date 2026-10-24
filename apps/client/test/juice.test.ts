// V-07b's juice (docs/ART.md §6 "Juice"): the render clock's hit-stop and slow-down (snapshotBuffer.ts), which events
// hold it (render/fx/juice.ts), the kill coins' batching (hud/coins.ts) and the Heart's vignette (its alpha, its box and
// its picture).

import type { GameEvent } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import { CoinBatcher, COINS_PER_SECOND, coinSize, type CoinLaunch } from '../src/hud/coins';
import {
  dropOffset,
  HitStop,
  JUICE,
  killPopScale,
  leakPeak,
  punchScale,
  upgradeFlash,
  upgradeScale,
  VIGNETTE,
  vignetteAlpha,
  vignetteBox,
  vignetteClose,
  vignetteGradient,
  type JuiceContext,
} from '../src/render/fx/juice';
import { CATCH_UP_RATE, HOLD_BUDGET_MS, HOLD_WINDOW_MS, RenderClock } from '../src/snapshotBuffer';

/** Ticks `clock` every `step` ms from `from` to `to`, returning the clock's time at the end. */
function run(clock: RenderClock, from: number, to: number, step = 16): number {
  let t = clock.tick(from);
  for (let now = from + step; now <= to; now += step) t = clock.tick(now);
  return t;
}

describe('RenderClock', () => {
  it('follows real time with nothing held', () => {
    const c = new RenderClock();
    expect(c.tick(1000)).toBe(1000);
    expect(run(c, 1000, 2000)).toBe(1992);
    expect(c.lag).toBe(0);
  });

  it('stands still through a hold, then catches the lost time up a little faster than real time', () => {
    const c = new RenderClock();
    c.tick(0);
    c.tick(100);
    expect(c.hold(100, 70)).toBe(70);
    expect(c.holding(100)).toBe(true);
    expect(c.tick(130)).toBe(100);
    expect(c.tick(170)).toBe(100);
    expect(c.holding(170)).toBe(false);
    expect(c.lag).toBe(70);
    // Then it runs at CATCH_UP_RATE: 70 ms lost take 70 / 0.25 = 280 ms to make up.
    const t = c.tick(200);
    expect(t - 100).toBeCloseTo(30 * CATCH_UP_RATE);
    run(c, 200, 600, 10);
    expect(c.lag).toBe(0);
    expect(c.tick(616)).toBe(616);
  });

  it('holds part of a frame that a hold covers part of', () => {
    const c = new RenderClock();
    c.tick(0);
    c.hold(10, 20);
    // [0, 40): 20 ms held, 20 free (nothing to catch up at the start of the frame).
    expect(c.tick(40)).toBe(20);
  });

  it('runs slow after a hold (a boss death): 0.6× for 0.5 s, then catches up', () => {
    const c = new RenderClock();
    c.tick(0);
    c.hold(0, JUICE.bigHoldMs);
    c.slow(0, JUICE.bossSlowMs, JUICE.bossSlowRate);
    expect(c.tick(70)).toBe(0);
    // 70 → 570 at 0.6×.
    expect(run(c, 70, 570, 10)).toBeCloseTo(300);
    expect(c.lag).toBeCloseTo(270);
    run(c, 570, 2000, 10);
    expect(c.lag).toBe(0);
  });

  it('extends a running hold to the later end instead of adding to it', () => {
    const c = new RenderClock();
    c.tick(0);
    expect(c.hold(0, 70)).toBe(70);
    expect(c.hold(30, 70)).toBe(30);
    expect(c.hold(40, 25)).toBe(0);
    expect(run(c, 0, 100, 10)).toBe(0);
    // 100 ms held, then the catch-up.
    expect(c.tick(110)).toBe(10 * CATCH_UP_RATE);
  });

  it('never holds more than 150 ms in any second', () => {
    const c = new RenderClock();
    c.tick(0);
    expect(c.hold(0, 70)).toBe(70);
    expect(c.hold(100, 70)).toBe(70);
    // 140 used: 10 left.
    expect(c.hold(200, 70)).toBe(10);
    expect(c.hold(300, 25)).toBe(0);
    // The first hold leaves the window after 1070 ms.
    expect(c.hold(1050, 70)).toBe(50);
  });

  it('keeps the budget over any window of a long run of random requests', () => {
    // A seeded stream of requests (boss kills, crits, own kills), sampled every millisecond.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const c = new RenderClock();
    const held: boolean[] = [];
    c.tick(0);
    for (let now = 0; now < 20_000; now++) {
      if (rand() < 0.01) c.hold(now, [17, 25, 70][Math.floor(rand() * 3)]!);
      held.push(c.holding(now));
      if (now % 16 === 0) c.tick(now);
    }
    let inWindow = 0;
    let worst = 0;
    for (let i = 0; i < held.length; i++) {
      if (held[i]) inWindow++;
      if (i >= HOLD_WINDOW_MS && held[i - HOLD_WINDOW_MS]) inWindow--;
      worst = Math.max(worst, inWindow);
    }
    expect(worst).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(HOLD_BUDGET_MS);
  });

  it('starts again at real time after a reset', () => {
    const c = new RenderClock();
    c.tick(0);
    c.hold(0, 70);
    c.tick(50);
    c.reset();
    expect(c.tick(5000)).toBe(5000);
    expect(c.holding(5010)).toBe(false);
  });

  it('jumps to real time after a long gap (a hidden tab), never ahead of it', () => {
    const c = new RenderClock();
    c.tick(0);
    c.hold(0, 70);
    c.tick(70);
    expect(c.tick(10_000)).toBe(10_000);
  });
});

const ME = 'p1';
const MATE = 'p2';
const RANGER = { id: 7, kind: 'ranger' as const };

function ctx(now: number, solo = false): JuiceContext {
  return { me: ME, hero: RANGER, solo, now };
}

const kill = (by: string | null, kind: 'grunt' | 'ironhorn' = 'grunt', x = 5, y = 5): GameEvent => ({
  type: 'kill',
  creepId: 1,
  kind,
  x,
  y,
  by,
  bounty: 3,
});

describe('HitStop', () => {
  it('holds 70 ms and slows 0.5 s for a boss you kill, never for a teammate’s online', () => {
    const h = new HitStop();
    expect(h.feed([kill(ME, 'ironhorn')], ctx(0))).toEqual({ hold: 70, slow: { ms: 500, rate: 0.6 } });
    expect(h.feed([kill(MATE, 'ironhorn')], ctx(100))).toEqual({ hold: 0, slow: null });
    // Solo: every boss falls to you.
    expect(h.feed([kill(null, 'ironhorn')], ctx(200, true)).hold).toBe(70);
  });

  it('holds 70 ms on your ultimate’s first strike only', () => {
    const h = new HitStop();
    const cast: GameEvent = { type: 'cast', heroId: RANGER.id, slot: 'R', x: 1, y: 1 };
    const strike: GameEvent = { type: 'aoe', effect: 'arrowStorm', x: 3, y: 3, radius: 1 };
    // A strike before your cast (a teammate's) holds nothing.
    expect(h.feed([strike], ctx(0)).hold).toBe(0);
    expect(h.feed([cast], ctx(10)).hold).toBe(0);
    expect(h.feed([strike], ctx(760)).hold).toBe(JUICE.bigHoldMs);
    expect(h.feed([strike], ctx(1500)).hold).toBe(0);
    // A teammate's cast arms nothing.
    expect(h.feed([{ type: 'cast', heroId: 99, slot: 'R', x: 1, y: 1 }, strike], ctx(9000)).hold).toBe(0);
    // A combo your rain fused into counts.
    h.feed([cast], ctx(10_000));
    expect(h.feed([{ type: 'aoe', effect: 'meteorRain', x: 3, y: 3, radius: 1 }], ctx(10_400)).hold).toBe(JUICE.bigHoldMs);
  });

  it('holds 25 ms on a kill by your hero’s own attack, at most once a second', () => {
    const h = new HitStop();
    const attack: GameEvent = { type: 'heroAttack', heroId: RANGER.id, x: 5, y: 5 };
    expect(h.feed([attack, kill(ME)], ctx(0)).hold).toBe(JUICE.killHoldMs);
    expect(h.feed([attack, kill(ME)], ctx(500)).hold).toBe(0);
    expect(h.feed([attack, kill(ME)], ctx(1000)).hold).toBe(JUICE.killHoldMs);
    // A kill of yours far from where your hero struck (a tower's) holds nothing; nor a kill long after the attack.
    expect(h.feed([kill(ME, 'grunt', 12, 20)], ctx(2100)).hold).toBe(0);
    h.feed([attack], ctx(3000));
    expect(h.feed([kill(ME)], ctx(3000 + JUICE.attackWindowMs + 1)).hold).toBe(0);
    // A teammate's kill near your attack is theirs.
    expect(h.feed([attack, kill(MATE)], ctx(6000)).hold).toBe(0);
  });

  it('holds a frame on your crit', () => {
    const h = new HitStop();
    expect(h.feed([{ type: 'crit', x: 1, y: 1, damage: 60, by: ME }], ctx(0)).hold).toBe(JUICE.critHoldMs);
    expect(h.feed([{ type: 'crit', x: 1, y: 1, damage: 60, by: MATE }], ctx(100)).hold).toBe(0);
  });
});

describe('the kill coins', () => {
  it('flies five coins a second, then batches the rest into one bigger coin', () => {
    const b = new CoinBatcher();
    const out: CoinLaunch[] = [];
    // A burst of 12 kills in one frame (an ultimate).
    for (let i = 0; i < 12; i++) out.push(...b.kill(i, 0, 0));
    expect(out).toHaveLength(COINS_PER_SECOND);
    expect(out.every((c) => c.size === 1 && c.kills === 1)).toBe(true);
    expect(b.waiting).toBe(7);
    expect(b.update(500)).toEqual([]);
    // The first coin's slot comes back a second later: the seven fly as one, from the last kill's place.
    const [big] = b.update(1000);
    expect(big).toEqual({ x: 11, y: 0, kills: 7, size: coinSize(7) });
    expect(big!.size).toBeGreaterThan(1);
    expect(b.waiting).toBe(0);
  });

  it('never launches more than five coins in any second of a long stream', () => {
    const b = new CoinBatcher();
    const times: number[] = [];
    let kills = 0;
    for (let now = 0; now < 10_000; now += 16) {
      // About 20 kills a second.
      if (now % 48 === 0) {
        kills++;
        times.push(...b.kill(0, 0, now).map(() => now));
      }
      times.push(...b.update(now).map(() => now));
    }
    for (let i = 0; i < times.length; i++) {
      const inSecond = times.filter((t) => t >= times[i]! && t < times[i]! + 1000).length;
      expect(inSecond).toBeLessThanOrEqual(COINS_PER_SECOND);
    }
    expect(times.length).toBeGreaterThan(40);
    expect(times.length).toBeLessThan(kills);
  });

  it('sizes a batched coin by its kills, at most twice a coin', () => {
    expect(coinSize(1)).toBe(1);
    expect(coinSize(3)).toBe(1.5);
    expect(coinSize(40)).toBe(2);
  });
});

describe('the Heart’s vignette', () => {
  it('is gone with the Heart healthy and no leak', () => {
    expect(vignetteAlpha(1234, null, false, false)).toBe(0);
  });

  it('pulses on a leak, stronger for a boss’s, and fades out', () => {
    const pulse = { at: 1000, peak: leakPeak(1, false) };
    expect(vignetteAlpha(1000, pulse, false, false)).toBeCloseTo(VIGNETTE.peak);
    expect(vignetteAlpha(1000 + VIGNETTE.pulseMs / 2, pulse, false, false)).toBeCloseTo(VIGNETTE.peak / 4);
    expect(vignetteAlpha(1000 + VIGNETTE.pulseMs, pulse, false, false)).toBe(0);
    expect(leakPeak(20, false)).toBe(VIGNETTE.bossPeak);
    expect(leakPeak(1, true)).toBe(VIGNETTE.bossPeak);
    expect(VIGNETTE.bossPeak).toBeGreaterThan(VIGNETTE.peak);
  });

  it('breathes between 0.1 and 0.2 over 2 s under 30% HP, steady under reduced motion', () => {
    const at = (t: number) => vignetteAlpha(t, null, true, false);
    expect(at(0)).toBeCloseTo(0.1);
    expect(at(1000)).toBeCloseTo(0.2);
    expect(at(2000)).toBeCloseTo(0.1);
    for (let t = 0; t < 4000; t += 37) {
      expect(at(t)).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(at(t)).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(vignetteAlpha(t, null, true, true)).toBeCloseTo(0.15);
    }
    // A leak's pulse shows over the breath, which comes back after it.
    const pulse = { at: 0, peak: VIGNETTE.peak };
    expect(vignetteAlpha(50, pulse, true, false)).toBeGreaterThan(0.3);
    expect(vignetteAlpha(VIGNETTE.pulseMs + 1, pulse, true, false)).toBeLessThanOrEqual(0.2);
  });

  it('closes in over 0.8 s on a defeat, only fading under reduced motion', () => {
    expect(vignetteClose(0, 0.2, false)).toEqual({ size: 1, alpha: 0.2, done: false });
    const end = vignetteClose(VIGNETTE.closeMs, 0.2, false);
    expect(end.size).toBeCloseTo(VIGNETTE.closeTo);
    expect(end.alpha).toBeCloseTo(VIGNETTE.closeAlpha);
    expect(end.done).toBe(true);
    expect(vignetteClose(400, 0, true).size).toBe(1);
    expect(vignetteClose(400, 0, true).alpha).toBeGreaterThan(0);
  });

  it('covers the map’s columns: the whole screen on a phone, the middle of a wide window', () => {
    expect(vignetteBox(412, 839, 0, 412)).toEqual({ left: 0, top: 0, right: 412, bottom: 839 });
    expect(vignetteBox(1280, 720, 452.8, 827.2)).toEqual({ left: 452.8, top: 0, right: 827.2, bottom: 720 });
    // A map zoomed in past the screen's sides fills it; one off the screen (never, but not nothing) gives the screen.
    expect(vignetteBox(1280, 720, -300, 1600)).toEqual({ left: 0, top: 0, right: 1280, bottom: 720 });
    expect(vignetteBox(1280, 720, 1400, 1700)).toEqual({ left: 0, top: 0, right: 1280, bottom: 720 });
  });

  it('is clear in the middle and solid from its box’s edges out, in its tint, and still covers its box closed in', () => {
    expect(vignetteGradient(0xff2a40)).toBe(
      'radial-gradient(ellipse 25% 25% at 50% 50%, rgba(255, 42, 64, 0) 60%, rgba(255, 42, 64, 0.14) 76%, rgb(255, 42, 64) 100%)',
    );
    expect(vignetteGradient(0x5a0814)).toContain('rgb(90, 8, 20) 100%');
    // The picture is twice its box (style.css), so closed in to `closeTo` it must still reach the box's edges.
    expect(2 * VIGNETTE.closeTo).toBeGreaterThanOrEqual(1);
  });
});

describe('juice curves', () => {
  it('punches the camera 1.04 → 1 over 120 ms, a fuse 1.06 held two frames', () => {
    expect(punchScale(0, JUICE.castPunch)).toBeCloseTo(1.04);
    expect(punchScale(60, JUICE.castPunch)).toBeCloseTo(1.01);
    expect(punchScale(120, JUICE.castPunch)).toBe(1);
    expect(punchScale(20, JUICE.fusePunch, JUICE.fuseHoldMs)).toBe(1.06);
    expect(punchScale(JUICE.fuseHoldMs + 120, JUICE.fusePunch, JUICE.fuseHoldMs)).toBe(1);
  });

  it('drops a built tower from 12 px over 120 ms, and pops and flashes an upgrade', () => {
    expect(dropOffset(0)).toBe(-12);
    expect(dropOffset(60)).toBeCloseTo(-9);
    expect(dropOffset(120)).toBe(0);
    expect(upgradeScale(JUICE.upgradePopMs / 2)).toBeCloseTo(1.1);
    expect(upgradeScale(JUICE.upgradePopMs)).toBe(1);
    expect(upgradeFlash(0)).toBeCloseTo(JUICE.flashAlpha);
    expect(upgradeFlash(JUICE.flashMs)).toBe(0);
  });

  it('pops a dying creep 1.2× for two frames', () => {
    expect(killPopScale(0)).toBe(1.2);
    expect(killPopScale(20)).toBe(1.2);
    expect(killPopScale(40)).toBe(1);
  });
});
