import { readdirSync, readFileSync } from 'node:fs';
import { HERO_KINDS, SKILL_SLOTS, TOWER_BRANCHES, TOWER_KINDS } from '@tdt/protocol';
import { getMap, Tile, tileAt } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import { heartStage } from '../src/render/art/damage';
import { atlasFrames, packFrames, PAGE_PX } from '../src/render/art/atlas';
import '../src/render/art/load';
import { heroIcon, ICONS, skillIcon, towerIcon } from '../src/render/art/icons';
import { allArt, checkArt, propArts, registerArt, towerArt, type ArtEntry } from '../src/render/art/registry';
import { propSpots } from '../src/render/art/scatter';
import { LIGHTING, liftColor, RL } from '../src/render/art/tokens';

const DIR = new URL('../src/render/art/entities/', import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

describe('art registry', () => {
  it('registers one entry per art file, with the file named after its id', () => {
    const ids = allArt()
      .filter((e) => e.category !== 'common')
      .map((e) => e.id);
    expect(ids.sort()).toEqual(FILES.map((f) => f.slice(0, -3)).sort());
  });

  it('every entry is complete', () => {
    for (const e of allArt()) expect(checkArt(e), e.id).toEqual([]);
  });

  it('refuses a duplicate id, a second art for a kind, or missing frames', () => {
    const grunt = allArt().find((e) => e.id === 'grunt')!;
    expect(() => registerArt(grunt)).toThrow(/twice/);
    expect(() => registerArt({ ...grunt, id: 'grunt2' } as ArtEntry)).toThrow(/Two creep arts/);
    expect(() => registerArt({ id: 'bad', name: 'Bad', category: 'tower', kind: 'frost', turret: true, frames: {} })).toThrow(/missing frame "base1"/);
  });

  it('tower frames are tiers 1–3 or a branch of that tower', () => {
    for (const e of allArt()) {
      if (e.category !== 'tower') continue;
      const allowed = new Set(['base1', 'base2', 'base3', 'top1', 'top2', 'top3']);
      for (const b of TOWER_BRANCHES[e.kind]) allowed.add(`${b}.base`).add(`${b}.top`);
      for (const name of Object.keys(e.frames)) expect(allowed.has(name), `${e.id}/${name}`).toBe(true);
    }
  });

  it('every tower kind has art for both of its branches, and a turret that turns (for aim and recoil)', () => {
    for (const kind of TOWER_KINDS) {
      const e = towerArt(kind);
      expect(e, kind).toBeDefined();
      expect(e!.turret, kind).toBe(true);
      for (const b of TOWER_BRANCHES[kind]) {
        expect(e!.frames[`${b}.base`], `${kind}/${b}.base`).toBeDefined();
        expect(e!.frames[`${b}.top`], `${kind}/${b}.top`).toBeDefined();
      }
    }
  });

  it('art bakes the same every time: no randomness or clocks in art files', () => {
    for (const f of FILES) {
      const src = readFileSync(new URL(f, DIR), 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.now/);
    }
  });
});

describe('art atlas', () => {
  it('packs every frame into pages without overlaps', () => {
    const frames = atlasFrames(allArt());
    const names = frames.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    const packed = packFrames(frames);
    const placed = frames.map((f) => ({ ...f, ...packed.get(f.name)! }));
    for (const a of placed) {
      expect(a.x + a.w).toBeLessThanOrEqual(PAGE_PX);
      expect(a.y + a.h).toBeLessThanOrEqual(PAGE_PX);
      for (const b of placed) {
        if (a === b || a.page !== b.page) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.name} / ${b.name}`).toBe(false);
      }
    }
  });

  it('opens a new page when one is full', () => {
    const big = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, w: 500, h: 500 }));
    const packed = packFrames(big);
    // Two 500 px frames per shelf, two shelves per 1024 px page.
    expect([...packed.values()].map((p) => p.page)).toEqual([0, 0, 0, 0, 1]);
    expect(() => packFrames([{ name: 'huge', w: 2000, h: 10 }])).toThrow(/larger than an atlas page/);
  });
});

describe('display', () => {
  it('Normal leaves the ground alone; Bright lifts dark colours more than light ones', () => {
    expect(liftColor(RL.moss, 'normal')).toBe(RL.moss);
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    const darkGain = lum(liftColor(RL.forest, 'bright')) - lum(RL.forest);
    const lightGain = lum(liftColor(RL.laneLight, 'bright')) - lum(RL.laneLight);
    expect(darkGain).toBeGreaterThan(lightGain);
    expect(LIGHTING.bright.shadowAlpha).toBeLessThan(LIGHTING.normal.shadowAlpha);
  });
});

describe('props', () => {
  const map = getMap();
  const spots = propSpots(map, propArts());
  const tile = (x: number, y: number) => tileAt(map, Math.floor(x), Math.floor(y));

  it('are registered as forest and clearing props, and placed the same every time', () => {
    const props = propArts();
    expect(props.some((p) => p.where === 'forest')).toBe(true);
    expect(props.some((p) => p.where === 'clearing')).toBe(true);
    expect(propSpots(map, props)).toEqual(spots);
    for (const s of spots) expect(propArts().find((p) => p.id === s.id)?.frames[s.frame], `${s.id}/${s.frame}`).toBeDefined();
  });

  it('trees cover the safe zone and stand on blocker tiles; clearing props stay on open ground off the lanes', () => {
    const byId = new Map(propArts().map((p) => [p.id, p]));
    const forest = spots.filter((s) => byId.get(s.id)!.where === 'forest');
    const clearing = spots.filter((s) => byId.get(s.id)!.where === 'clearing');
    expect(forest.filter((s) => s.y >= map.safeFromY).length).toBeGreaterThan(map.width * 4);
    for (const s of forest) {
      const x = Math.min(map.width - 1, Math.max(0, s.x));
      const y = Math.min(map.height - 1, Math.max(0, s.y));
      expect(tile(x, y), `tree at ${s.x}, ${s.y}`).toBe(Tile.Blocker);
    }
    expect(clearing.length).toBeGreaterThan(5);
    expect(clearing.length).toBeLessThan(40);
    for (const s of clearing) {
      expect(tile(s.x, s.y), `${s.id} at ${s.x}, ${s.y}`).toBe(Tile.Open);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(tile(s.x + dx, s.y + dy)).not.toBe(Tile.Lane);
    }
  });
});

describe('ui icons', () => {
  it('every tower, every hero and every hero skill has a code-drawn icon', () => {
    for (const t of TOWER_KINDS) expect(ICONS.has(towerIcon(t)), t).toBe(true);
    for (const h of HERO_KINDS) {
      expect(ICONS.has(heroIcon(h)), h).toBe(true);
      for (const s of SKILL_SLOTS) expect(ICONS.has(skillIcon(h, s)), `${h} ${s}`).toBe(true);
    }
    for (const id of ['coin', 'heart', 'heartCracked', 'wave', 'timer', 'gear', 'upgrade', 'sell', 'target']) expect(ICONS.has(id), id).toBe(true);
  });

  it('icons are drawn in code, deterministically, with palette tokens only', () => {
    const src = readFileSync(new URL('../src/render/art/icons.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}\b|\.(png|svg|jpe?g)['"]/);
  });
});

describe('heart damage states', () => {
  it('cracks under 60% HP and splits open under 30%', () => {
    expect([1, 0.6, 0.59, 0.3, 0.29, 0].map(heartStage)).toEqual([0, 0, 1, 1, 2, 2]);
    const heart = allArt().find((e) => e.category === 'heart')!;
    expect(Object.keys(heart.frames)).toEqual(expect.arrayContaining(['cracks1', 'cracks2']));
  });
});
