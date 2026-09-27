// Where props go (docs/ART.md §4): pure and deterministic (tested), so the ground bakes the same
// every time. Trees cover the blocker tiles: small ones leaning off the cliff border, a dense
// canopy over the safe zone (under the touch controls). A few clearing props (rocks,
// mushrooms, runestones) sit on open ground off the lanes and pads, away from the Heart and the hero spawn.

import { Tile, tileAt, type GameMap } from '@tdt/sim';
import { hash } from './paint';
import type { PropArt } from './registry';

export interface PropSpot {
  id: string;
  frame: string;
  /** Tile units. */
  x: number;
  y: number;
  /** Never mirrored or rotated: that would move the moonlit rim off the upper left. */
  scale: number;
}

/** Spacing of the safe-zone canopy (tiles); rows are offset by half, like a hex grid. */
const CANOPY_STEP = 1.15;
/** Share of the candidate open tiles that get a clearing prop. */
const CLEARING_CHANCE = 0.1;
/** Clearing props keep this far (tiles) from the Heart and the hero spawn. */
const KEEP_CLEAR = 3;

function pick(props: readonly PropArt[], h: number): PropArt | undefined {
  const total = props.reduce((s, p) => s + p.weight, 0);
  let at = h * total;
  for (const p of props) {
    at -= p.weight;
    if (at < 0) return p;
  }
  return props[props.length - 1];
}

function frameOf(p: PropArt, h: number): string {
  const names = Object.keys(p.frames);
  return names[Math.min(names.length - 1, Math.floor(h * names.length))]!;
}

const blocked = (map: GameMap, tx: number, ty: number) => tileAt(map, tx, ty) === Tile.Blocker;

/** Every prop on the map, in drawing order (top to bottom, so lower canopies overlap upper ones). */
export function propSpots(map: GameMap, props: readonly PropArt[]): PropSpot[] {
  const out: PropSpot[] = [];
  const forest = props.filter((p) => p.where === 'forest');
  const clearing = props.filter((p) => p.where === 'clearing');

  if (forest.length > 0) {
    // The cliff border: small trees centred near the outer edge, so they lean off the map and
    // never reach the lanes or pads next to it.
    for (let ty = 0; ty < map.safeFromY; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!blocked(map, tx, ty)) continue;
        const left = tx === 0;
        const right = tx === map.width - 1;
        const top = ty === 0;
        if (!left && !right && !top) continue;
        const h = hash(tx, ty, 17);
        const x = left ? 0.2 : right ? map.width - 0.2 : tx + 0.5;
        const y = top && !left && !right ? 0.15 : ty + 0.5;
        // Top-row trees between two lanes stay small.
        const narrow = top && (!blocked(map, tx - 1, ty) || !blocked(map, tx + 1, ty));
        const p = pick(forest, h)!;
        out.push({ id: p.id, frame: frameOf(p, hash(tx, ty, 23)), x, y, scale: (narrow ? 0.45 : 0.62) + 0.14 * hash(ty, tx, 5) });
      }
    }
    // The safe zone: a dense canopy over every blocker tile from safeFromY down.
    let row = 0;
    for (let y = map.safeFromY + 0.35; y < map.height + 0.5; y += CANOPY_STEP * 0.87, row++) {
      for (let x = (row % 2) * CANOPY_STEP * 0.5 - 0.2; x < map.width + 0.5; x += CANOPY_STEP) {
        const h = hash(Math.round(x * 10), Math.round(y * 10), 29);
        const jx = x + (hash(row, Math.round(x * 10), 3) - 0.5) * 0.5;
        const jy = y + (hash(Math.round(x * 10), row, 7) - 0.5) * 0.4;
        const p = pick(forest, h)!;
        out.push({ id: p.id, frame: frameOf(p, hash(row, Math.round(x * 10), 31)), x: jx, y: jy, scale: 0.8 + 0.3 * hash(row, 41, Math.round(x * 10)) });
      }
    }
  }

  if (clearing.length > 0) {
    const near = (tx: number, ty: number, p: { x: number; y: number }) => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < KEEP_CLEAR;
    for (let ty = 1; ty < map.safeFromY; ty++) {
      for (let tx = 1; tx < map.width - 1; tx++) {
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++) {
          for (let dx = -1; dx <= 1 && clear; dx++) {
            const t = tileAt(map, tx + dx, ty + dy);
            if (t === Tile.Lane || (dx === 0 && dy === 0 && t !== Tile.Open)) clear = false;
          }
        }
        if (!clear || near(tx, ty, map.heart) || near(tx, ty, map.heroSpawn)) continue;
        if (hash(tx, ty, 53) >= CLEARING_CHANCE) continue;
        const p = pick(clearing, hash(ty, tx, 59))!;
        out.push({
          id: p.id,
          frame: frameOf(p, hash(tx, 61, ty)),
          x: tx + 0.5 + (hash(tx, ty, 67) - 0.5) * 0.4,
          y: ty + 0.5 + (hash(ty, tx, 71) - 0.5) * 0.4,
          scale: 0.8 + 0.3 * hash(tx, ty, 73),
        });
      }
    }
  }
  return out.sort((a, b) => a.y - b.y);
}
