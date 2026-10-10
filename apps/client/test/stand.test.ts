import { HERO_KINDS } from '@tdt/protocol';
import { describe, expect, it } from 'vitest';
import '../src/render/art/load';
import { heroArt, type HeroArt, type StandPose } from '../src/render/art/registry';
import { breath } from '../src/render/art/rigs';
import { fitStand, standBounds, standItems, standRoom, type StandItem } from '../src/render/art/stand';

const heroes = (): HeroArt[] => HERO_KINDS.map((kind) => heroArt(kind)!);

/** Where a placed part's centre is. */
const at = (item: StandItem): { x: number; y: number } => {
  if (item.kind !== 'part') throw new Error('not a part');
  return { x: item.m[4], y: item.m[5] };
};

const parts = (items: readonly StandItem[], frame: string) => items.filter((it) => it.kind === 'part' && it.frame === frame);

/** A hero with two frames and a standing pose of its own, to test the placing. */
function fake(stand: (to: StandPose, now: number) => void): HeroArt {
  const draw = () => {};
  return {
    id: 'fake',
    name: 'Fake',
    category: 'hero',
    kind: 'ranger',
    feet: 10,
    frames: { body: { w: 10, h: 20, draw }, arm: { w: 8, h: 2, draw } },
    rig: () => {
      throw new Error('no rig');
    },
    stand,
  };
}

describe('standing poses (the lobby hero stage)', () => {
  it('every hero stands on its own frames: a body, a head and two feet on the ground', () => {
    for (const art of heroes()) {
      const items = standItems(art, 0);
      for (const it of items) if (it.kind === 'part') expect(art.frames[it.frame], `${art.id}/${it.frame}`).toBeDefined();
      expect(parts(items, 'body'), art.id).toHaveLength(1);
      expect(parts(items, 'head'), art.id).toHaveLength(1);
      const feet = parts(items, 'foot');
      expect(feet, art.id).toHaveLength(2);
      for (const foot of feet) expect(at(foot).y, art.id).toBe(art.feet);
      // The head is above the body, and both are above the feet.
      expect(at(parts(items, 'head')[0]!).y, art.id).toBeLessThan(at(parts(items, 'body')[0]!).y);
      expect(at(parts(items, 'body')[0]!).y, art.id).toBeLessThan(art.feet);
    }
  });

  it('a standing hero breathes like its rig: the body rises and sinks by the breath, the feet stay put', () => {
    // A quarter of the breath's period after 0: as high as it goes.
    const peak = (Math.PI / 2) * 500;
    expect(breath(0)).toBe(0);
    expect(breath(peak)).toBeCloseTo(0.35);
    for (const art of heroes()) {
      const rest = standItems(art, 0);
      const up = standItems(art, peak);
      expect(up, art.id).toHaveLength(rest.length);
      const body = (items: StandItem[]) => at(parts(items, 'body')[0]!).y;
      expect(body(rest) - body(up), art.id).toBeCloseTo(0.35);
      expect(parts(up, 'foot').map((f) => at(f).y), art.id).toEqual(parts(rest, 'foot').map((f) => at(f).y));
    }
  });

  it('push moves and turns what follows, and pop ends it', () => {
    const art = fake((to) => {
      to.part('body', 1, 2);
      to.push(10, 0, Math.PI / 2);
      to.part('arm', 5, 0);
      to.line(0, 0, 4, 0, 0xffffff, 1);
      to.pop();
      to.part('arm', 5, 0, Math.PI);
    });
    const [body, arm, line, after] = standItems(art, 0);
    expect(at(body!)).toEqual({ x: 1, y: 2 });
    // Turned a quarter: 5 px along the arm is 5 px down from where it was pushed.
    expect(at(arm!).x).toBeCloseTo(10);
    expect(at(arm!).y).toBeCloseTo(5);
    expect(line).toMatchObject({ kind: 'line', x0: 10, y0: 0, color: 0xffffff, width: 1 });
    if (line?.kind !== 'line') throw new Error('not a line');
    expect(line.x1).toBeCloseTo(10);
    expect(line.y1).toBeCloseTo(4);
    expect(at(after!)).toEqual({ x: 5, y: 0 });
    // A part's box turns with it: the arm (8 × 2) pushed and turned a quarter is 2 wide and 8 tall.
    const b = standBounds([arm!]);
    expect(b.x1 - b.x0).toBeCloseTo(2);
    expect(b.y1 - b.y0).toBeCloseTo(8);
  });

  it('a pose that names a missing frame or leaves a push open is an error, not a blank stage', () => {
    expect(() => standItems(fake((to) => to.part('wing', 0, 0)), 0)).toThrow(/missing frame "wing"/);
    expect(() => standItems(fake((to) => to.push(0, 0, 0)), 0)).toThrow(/leaves a push open/);
    expect(() => standItems(fake((to) => to.pop()), 0)).toThrow(/pops more than it pushes/);
  });

  it('one scale fits every hero into the stage: feet on the ground line, under the headroom, inside the sides', () => {
    const arts = heroes();
    const room = standRoom(arts);
    expect(room.width).toBeGreaterThan(20);
    expect(room.above).toBeGreaterThan(20);
    // A phone's stage and a desktop's.
    for (const area of [
      { w: 358, h: 264, ground: 230, top: 62, side: 14 },
      { w: 500, h: 320, ground: 286, top: 62, side: 14 },
      { w: 328, h: 190, ground: 156, top: 62, side: 14 },
    ]) {
      const fits = arts.map((art) => fitStand(art, room, area));
      expect(new Set(fits.map((f) => f.scale)).size).toBe(1);
      for (const [i, art] of arts.entries()) {
        const fit = fits[i]!;
        expect(fit.scale, art.id).toBeGreaterThan(1);
        const b = standBounds(standItems(art, 0));
        // Feet on the ground line.
        expect(fit.y + art.feet * fit.scale, art.id).toBeCloseTo(area.ground);
        // Nothing above the headroom or past the sides; the figure's box is centred.
        expect(fit.y + b.y0 * fit.scale, art.id).toBeGreaterThanOrEqual(area.top - 1e-6);
        expect(fit.x + b.x0 * fit.scale, art.id).toBeGreaterThanOrEqual(area.side - 1e-6);
        expect(fit.x + b.x1 * fit.scale, art.id).toBeLessThanOrEqual(area.w - area.side + 1e-6);
        expect(fit.x + ((b.x0 + b.x1) / 2) * fit.scale, art.id).toBeCloseTo(area.w / 2);
      }
    }
    // No room at all: nothing is drawn (scale 0), never a negative scale.
    expect(fitStand(arts[0]!, room, { w: 20, h: 40, ground: 30, top: 62, side: 14 }).scale).toBe(0);
  });
});
