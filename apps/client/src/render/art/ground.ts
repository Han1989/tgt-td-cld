// The ground painter (docs/ART.md §4): moss, lanes and forest painted once into one canvas (2 px
// per world px) and shown as a single sprite. Switching Display repaints the same canvas.
//
// Lanes are smooth strokes along the lane waypoints (the tile grid is only for pathing): an ink
// edge, packed earth, a moon-worn centre and sparse low-contrast flagstones, so creeps stay the
// brightest thing on the lane. The moss has speckle, dark ferns and a few glowing motes. Props
// (entities/ with category `prop`) are drawn in with the painter at the spots `scatter.ts` picks:
// rocks, mushrooms and runestones on open ground, trees over the blocker tiles (the cliff border and
// the safe zone, which gets a deeper shade so the touch controls read well over it). A cool
// moonlight wash and an edge vignette finish it; Bright lifts everything with a "screen" wash.

import { Tile, TILE_PX, tileAt, type GameMap } from '@tdt/sim';
import { CanvasSource, Texture } from 'pixi.js';
import './load';
import { createPainter, css, hash, mix, radialFill, shade, type Ctx, type Painter } from './paint';
import { propArts, type PropArt } from './registry';
import { propSpots, type PropSpot } from './scatter';
import { LIGHTING, RL, type Display } from './tokens';

const S = TILE_PX;
/** Canvas pixels per world pixel (Spire: 26 × 50 tiles → 1664 × 3200 px). */
const RES = 2;
/** Lanes are two tiles wide on Spire (tiles within 1 tile of the lane line). */
const LANE_W = 2.15 * S;

export interface Ground {
  texture: Texture;
  repaint(display: Display): void;
}

export function createGround(map: GameMap, display: Display): Ground {
  const canvas = document.createElement('canvas');
  canvas.width = map.width * S * RES;
  canvas.height = map.height * S * RES;
  paintGround(canvas.getContext('2d')!, map, display);
  const source = new CanvasSource({ resource: canvas, resolution: RES });
  return {
    texture: new Texture({ source }),
    repaint(d) {
      paintGround(canvas.getContext('2d')!, map, d);
      source.update();
    },
  };
}

export function paintGround(c: Ctx, map: GameMap, display: Display): void {
  const light = LIGHTING[display];
  const W = map.width * S;
  const H = map.height * S;
  c.setTransform(RES, 0, 0, RES, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = css(RL.moss);
  c.fillRect(0, 0, W, H);
  moss(c, W, H);

  // Lanes. West and East end on the trunk above the Heart, which Mid already covers.
  const lanes = map.lanes.map((l) => l.waypoints.map((p, i) => ({ x: p.x * S, y: (i === 0 ? p.y - 1.5 : p.y) * S })));
  const stroke = (width: number, color: string) => {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = width;
    c.strokeStyle = color;
    for (const pts of lanes) {
      c.beginPath();
      c.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
      c.stroke();
    }
  };
  stroke(LANE_W + 6, css(RL.ink));
  stroke(LANE_W, css(RL.lane));
  stroke(LANE_W * 0.62, css(RL.laneLight, 0.1));
  scatterAlong(lanes, 0.95, (x, y, h1, h2, i, nx, ny) => {
    if (h2 > 0.6) return;
    const off = (hash(i, 5) - 0.5) * LANE_W * 0.55;
    const cx = x + nx * off;
    const cy = y + ny * off;
    const r = LANE_W * (0.2 + 0.06 * hash(i, 7));
    const n = 5 + Math.floor(hash(i, 3) * 2);
    const path = new Path2D();
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2 + h1 * 6;
      const rr = r * (0.75 + 0.3 * hash(i, q));
      if (q === 0) path.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
      else path.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    path.closePath();
    const tone = mix(RL.pebble, RL.laneLight, hash(i, 11) * 0.5);
    c.save();
    c.clip(path);
    c.fillStyle = css(shade(tone, 0.25), 0.55);
    c.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    c.translate(1, 1.2);
    c.fillStyle = css(tone, 0.45);
    c.fill(path);
    c.restore();
    c.lineWidth = 1;
    c.strokeStyle = css(RL.ink, 0.45);
    c.stroke(path);
  });

  const painter = createPainter(light);
  const props = propArts();
  const spots = propSpots(map, props);
  const byId = new Map(props.map((p) => [p.id, p]));
  drawProps(c, painter, byId, spots.filter((s) => byId.get(s.id)?.where === 'clearing'));

  // Moonlight: a cool wash near the top, darker towards the edges.
  const g = c.createRadialGradient(W / 2, H * 0.35, H * 0.1, W / 2, H * 0.35, H * 0.7);
  g.addColorStop(0, 'rgba(160,200,255,0.06)');
  g.addColorStop(1, css(RL.night, light.vignette));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  forest(c, map);
  drawProps(c, painter, byId, spots.filter((s) => byId.get(s.id)?.where === 'forest'));
  safeZoneShade(c, map);

  if (light.groundLift.alpha > 0) {
    // Bright: "screen" lifts the darks most, so shadows open up without washing out the lanes.
    c.globalCompositeOperation = 'screen';
    c.fillStyle = css(light.groundLift.color, light.groundLift.alpha);
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/** Forest floor on blocker tiles (the trees go on top). */
function forest(c: Ctx, map: GameMap): void {
  c.fillStyle = css(RL.forest);
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) if (tileAt(map, tx, ty) === Tile.Blocker) c.fillRect(tx * S, ty * S, S, S);
  }
}

/** Draws props with the painter, each at its spot (tile units) and scale. */
function drawProps(c: Ctx, p: Painter, byId: ReadonlyMap<string, PropArt>, spots: readonly PropSpot[]): void {
  for (const s of spots) {
    const def = byId.get(s.id)?.frames[s.frame];
    if (!def) continue;
    c.save();
    c.translate(s.x * S, s.y * S);
    c.scale(s.scale, s.scale);
    def.draw(c, p, RL);
    c.restore();
  }
}

/** The safe zone sinks into deep forest shade, so the touch controls over it stay readable. */
function safeZoneShade(c: Ctx, map: GameMap): void {
  const top = (map.safeFromY - 0.6) * S;
  const g = c.createLinearGradient(0, top, 0, top + 4 * S);
  g.addColorStop(0, css(RL.night, 0));
  g.addColorStop(1, css(RL.night, 0.62));
  c.fillStyle = g;
  c.fillRect(0, top, map.width * S, map.height * S - top);
}

/** Calls `f` every `step` tiles along every lane with two hashes, the index and the lane normal. */
function scatterAlong(
  lanes: { x: number; y: number }[][],
  step: number,
  f: (x: number, y: number, h1: number, h2: number, i: number, nx: number, ny: number) => void,
): void {
  let i = 0;
  for (const [li, pts] of lanes.entries()) {
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s]!;
      const b = pts[s + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      if (pts.length > 2 && s === pts.length - 2) continue;
      for (let d = 0; d < len; d += step * S) {
        const x = a.x + ((b.x - a.x) * d) / len;
        const y = a.y + ((b.y - a.y) * d) / len;
        f(x, y, hash(li, s, Math.round(d)), hash(Math.round(d), s, li + 9), i++, nx, ny);
      }
    }
  }
}

function scatter(W: number, H: number, n: number, draw: (x: number, y: number, h: number) => void): void {
  for (let i = 0; i < n; i++) draw(hash(i, 1) * W, hash(i, 2) * H, hash(i, 3));
}

/** Mossy blotches and speckle, dark ferns, and a few glowing motes (mushrooms / fireflies). */
function moss(c: Ctx, W: number, H: number): void {
  scatter(W, H, 80, (x, y, h) => {
    radialFill(c, x, y, 26 + h * 40, 18 + h * 24, [
      [0, h > 0.55 ? 'rgba(80,130,100,0.22)' : 'rgba(5,15,12,0.3)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
  });
  scatter(W, H, 2400, (x, y, h) => {
    c.fillStyle = css(h > 0.5 ? RL.mossLight : RL.mossDark, 0.8);
    c.fillRect(x, y, 1.2, 1.2);
  });
  c.lineCap = 'round';
  c.strokeStyle = css(RL.fern, 0.9);
  c.lineWidth = 1.2;
  scatter(W, H, 200, (x, y, h) => {
    c.beginPath();
    for (let j = -2; j <= 2; j++) {
      c.moveTo(x, y);
      c.quadraticCurveTo(x + j * 2, y - 3, x + j * 3.2, y - 5 - h * 2 + Math.abs(j));
    }
    c.stroke();
  });
  scatter(W, H, 70, (x, y, h) => {
    const col = h > 0.5 ? RL.rune : RL.ember;
    radialFill(c, x, y, 5, 5, [
      [0, css(col, 0.5)],
      [1, css(col, 0)],
    ]);
    c.fillStyle = css(col, 0.95);
    c.beginPath();
    c.arc(x, y, 0.9, 0, Math.PI * 2);
    c.fill();
  });
}
