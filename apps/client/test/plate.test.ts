// The map plate (docs/ART.md §16): Spire's ground rendered ahead of time in Blender as one picture. What the build
// measured in its own render must land on the map's tiles (each pad's square, each lane's middle line), the picture
// must be exactly twice the map in world px and within its budget, the pads it shows must be the ones every match has
// (padLayout) and its patches the ones only some have, the scenery must stand at the 2D ground's prop spots, and the
// service worker must precache it with the shell (a match needs it at once).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_MODES, MAX_PLAYERS } from '@tdt/protocol';
import { getMap, padLayout, TILE_PX, TUNING, tuningForMode } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import '../src/render/art/load';
import { propArts } from '../src/render/art/registry';
import { propSpots } from '../src/render/art/scatter';
import { isMediaPath, swSource } from '../src/platform/swSource';
import { padLook, patchOf, plateFits, plateUrl, SPIRE_PLATE as L } from '../src/render/plate/layout';
import card from '../src/render/plate/card.json';
import { CARD_MAP } from '../src/ogMap';

const CLIENT = join(__dirname, '..');
const MAP_DIR = join(CLIENT, 'public', 'map');
const map = getMap();
const K = L.res; // plate px per world px

/** A WebP's size from its header (lossy VP8, lossless VP8L, or extended VP8X). */
function webpSize(bytes: Buffer): { w: number; h: number } {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + bytes.readUIntLE(24, 3), h: 1 + bytes.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const b = bytes.readUInt32LE(21);
    return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ') return { w: bytes.readUInt16LE(26) & 0x3fff, h: bytes.readUInt16LE(28) & 0x3fff };
  throw new Error(`not a WebP chunk: ${kind}`);
}

/** The pads that exist in every match (every team size, every mode) and in any match. */
function padsByMatch(): { every: Set<number>; any: Set<number> } {
  const seen = new Map<number, number>();
  let n = 0;
  for (const mode of GAME_MODES) {
    for (let players = 1; players <= MAX_PLAYERS; players++) {
      n++;
      for (const p of padLayout(map, tuningForMode(TUNING, mode), Array.from({ length: players }, (_, i) => `p${i}`))) {
        seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
      }
    }
  }
  return { every: new Set([...seen].filter(([, c]) => c === n).map(([id]) => id)), any: new Set(seen.keys()) };
}

/** A mask of plate px (1 = inside one of the boxes x0, y0, x1, y1). */
function mask(boxes: number[][]): Uint8Array {
  const out = new Uint8Array(L.width * L.height);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = Math.round(y0!); y < Math.round(y1!); y++) out.fill(1, y * L.width + Math.round(x0!), y * L.width + Math.round(x1!));
  }
  return out;
}

function tileBox(id: number): number[] {
  const p = map.pads[id]!;
  const n = map.padSize * TILE_PX * K;
  return [p.tx * TILE_PX * K, p.ty * TILE_PX * K, p.tx * TILE_PX * K + n, p.ty * TILE_PX * K + n];
}

function distToLane(lane: number, x: number, y: number): number {
  const pts = map.lanes[lane]!.waypoints.map((p, i) => ({ x: p.x * TILE_PX * K, y: (i === 0 ? p.y - 1.5 : p.y) * TILE_PX * K }));
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy)));
    best = Math.min(best, Math.hypot(x - a.x - t * vx, y - a.y - t * vy));
  }
  return best;
}

describe('the map plate: the picture', () => {
  it('is exactly twice the map in world px, as its layout says, and fits a phone GPU in one texture', () => {
    const bytes = readFileSync(join(MAP_DIR, L.file.name));
    const { w, h } = webpSize(bytes);
    expect(K).toBe(2);
    expect([w, h]).toEqual([map.width * TILE_PX * 2, map.height * TILE_PX * 2]);
    expect([L.width, L.height]).toEqual([w, h]);
    expect(plateFits(L, map.width, map.height, TILE_PX)).toBe(true);
    // One texture under the 4096 px limit every phone GPU has.
    expect(Math.max(w, h)).toBeLessThanOrEqual(4096);
  });

  it('is the file the layout describes, under its 700 KB budget, and so are the patches (60 KB)', () => {
    for (const f of [L.file, ...(L.extra ? [L.extra.file] : [])]) {
      const bytes = readFileSync(join(MAP_DIR, f.name));
      expect(bytes.length, f.name).toBe(f.bytes);
      expect(createHash('sha256').update(bytes).digest('hex').slice(0, 12), f.name).toBe(f.hash);
      expect(plateUrl(f)).toBe(`/map/${f.name}?v=${f.hash}`);
    }
    expect(L.file.bytes).toBeLessThanOrEqual(700_000);
    if (L.extra) expect(L.extra.file.bytes).toBeLessThanOrEqual(60_000);
  });

  it('was rendered at 2× and averaged down, with 20 samples', () => {
    expect(L.render.ss).toBe(2);
    expect(L.render.samples).toBe(20);
  });

  it('the link card has its own plate, twice its map in world px', () => {
    const bytes = readFileSync(join(CLIENT, 'src', 'render', 'plate', card.file.name));
    const { w, h } = webpSize(bytes);
    expect([w, h]).toEqual([CARD_MAP.width * TILE_PX * 2, CARD_MAP.height * TILE_PX * 2]);
    expect([card.width, card.height]).toEqual([w, h]);
  });
});

describe('the map plate: pads', () => {
  const { every, any } = padsByMatch();

  it('shows exactly the pads every match has, each on its own tiles (±1.5 plate px)', () => {
    const onPlate = L.pads.filter((p) => p.show === 'plate');
    expect(new Set(onPlate.map((p) => p.id))).toEqual(every);
    for (const p of onPlate) {
      const want = tileBox(p.id);
      for (let i = 0; i < 4; i++) expect(Math.abs(p.box[i]! - want[i]!), `pad ${p.id} edge ${i}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('its pad mask, from the layout, is padLayout\'s pads (every team, every mode) to the pixel but their edges', () => {
    const drawn = mask(L.pads.filter((p) => p.show === 'plate').map((p) => p.box));
    const want = mask([...every].map(tileBox));
    let differ = 0;
    for (let i = 0; i < drawn.length; i++) if (drawn[i] !== want[i]) differ++;
    // Only the edge's anti-aliased pixel may differ: at most one pixel ring and a half round each pad.
    const perimeter = 4 * map.padSize * TILE_PX * K;
    expect(differ).toBeLessThanOrEqual(every.size * perimeter * 1.5);
    let inside = 0;
    for (let i = 0; i < want.length; i++) inside += want[i]!;
    expect(inside).toBe(every.size * (map.padSize * TILE_PX * K) ** 2);
  });

  it('has a patch for every pad only some matches have (the extra pads of bigger teams), on its tiles', () => {
    const patches = L.extra?.patches ?? [];
    expect(new Set(patches.map((p) => p.pad))).toEqual(new Set([...any].filter((id) => !every.has(id))));
    for (const p of patches) {
      const want = tileBox(p.pad);
      expect(p.box).not.toBeNull();
      for (let i = 0; i < 4; i++) expect(Math.abs(p.box![i]! - want[i]!), `patch ${p.pad} edge ${i}`).toBeLessThanOrEqual(1.5);
      // The patch covers its pad with room for its shadow and ink, and stays on the plate.
      expect(p.x).toBeLessThanOrEqual(want[0]!);
      expect(p.y).toBeLessThanOrEqual(want[1]!);
      expect(p.x + p.w).toBeGreaterThanOrEqual(want[2]!);
      expect(p.y + p.h).toBeGreaterThanOrEqual(want[3]!);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(L.width);
      expect(p.y + p.h).toBeLessThanOrEqual(L.height);
    }
    if (L.extra) {
      const atlas = webpSize(readFileSync(join(MAP_DIR, L.extra.file.name)));
      for (const p of patches) {
        expect(p.atlas[0]! + p.w).toBeLessThanOrEqual(atlas.w);
        expect(p.atlas[1]! + p.h).toBeLessThanOrEqual(atlas.h);
      }
    }
  });

  it('tells the renderer how to draw each pad of a match over it', () => {
    for (const id of every) expect(padLook(L, id)).toBe('plate');
    for (const id of any) if (!every.has(id)) expect(padLook(L, id)).toBe('patch');
    // A pad no render had (a tuning change after the render) falls back to the 2D slab.
    const never = map.pads.find((p) => !any.has(p.id));
    if (never) {
      expect(padLook(L, never.id)).toBe('slab');
      expect(patchOf(L, never.id)).toBeUndefined();
    }
  });
});

describe('the map plate: lanes and scenery', () => {
  it('each lane\'s road, measured in the render, runs down the map\'s lane line (within 1.5 world px)', () => {
    expect(L.lanes).toHaveLength(map.lanes.length);
    for (const [i, points] of L.lanes.entries()) {
      expect(points.length, `lane ${i}`).toBeGreaterThanOrEqual(15);
      const offsets = points.map(([x, y]) => distToLane(i, x!, y!));
      expect(Math.max(...offsets), `lane ${i}`).toBeLessThanOrEqual(1.5 * K);
      expect(offsets.reduce((a, b) => a + b, 0) / offsets.length, `lane ${i}`).toBeLessThanOrEqual(0.6 * K);
      // The points the build measured from are on the map's line itself.
      for (const p of points) expect(distToLane(i, p[2]!, p[3]!)).toBeLessThan(0.01);
    }
  });

  it('stands its rocks, mushrooms, runestones and trees at the 2D ground\'s prop spots', () => {
    const spots = propSpots(map, propArts());
    expect(L.spots).toHaveLength(spots.length);
    for (const [i, s] of spots.entries()) {
      const p = L.spots[i]!;
      expect([p.id, p.frame], `spot ${i}`).toEqual([s.id, s.frame]);
      expect(p.x).toBeCloseTo(s.x, 6);
      expect(p.y).toBeCloseTo(s.y, 6);
      expect(p.scale).toBeCloseTo(s.scale, 6);
    }
  });
});

describe('the map plate: loading', () => {
  it('is precached with the shell (a match needs it at once), the patches too', () => {
    const files = ['/index.html', `/map/${L.file.name}`, ...(L.extra ? [`/map/${L.extra.file.name}`] : [])];
    const sw = swSource('test', files);
    for (const f of files.slice(1)) {
      expect(isMediaPath(f)).toBe(false);
      expect(sw).toContain(JSON.stringify(f));
    }
  });
});
