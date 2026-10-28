// The map's readability check, page side (dev only: scripts/groundCheck.ts imports it into a page of Vite's dev
// server; the game never imports it, so no build carries it). What V-07c's sheet measured on the draft looks
// (docs/art/ground-options.md), measured on a plate as rendered: the grass, road and pad medians of the map's middle,
// the three heroes, a Grunt and a Brute drawn by the match's own rigs at phone size and their contrast on that ground,
// the HP bar's, and the pads' zone rims and washes as world.ts lays them. Also returns the middle at the phone's
// screen pixels (3×) with the figures standing on it, a pad tinted yours and one a teammate's. The plate is served by
// the script under /__ground/plate.webp.

import type { CreepKind, HeroKind } from '@tdt/protocol';
import { getMap, Tile } from '@tdt/sim';
import './render/art/load';
import { createPainter } from './render/art/paint';
import { padArt } from './render/art/registry';
import { LIGHTING, RL } from './render/art/tokens';
import { entityScales } from './render/entityScale';
import { COLORS, PAD_TINTS, PLAYER_COLORS } from './render/palette';

/** The reference phone: Spire's 26 tiles across 412 CSS px, on a 3× screen. */
const TILE_CSS = 412 / 26;
const DPR = 3;
/** Device px per tile on that screen, and per world px. */
const TILE = TILE_CSS * DPR;
const PER_WORLD = TILE / 32;
/** Plate px per tile. */
const PLATE_TILE = 64;
/** The middle (plate px): tiles 7–19 × 11–19, the mid lane and four pads (the sheet's TDT_PLATE_BOX). */
export const BOX = [448, 704, 1216, 1216] as const;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

type Box = readonly [number, number, number, number];
type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

// --- colour ------------------------------------------------------------------------------------------------------

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** CIELAB (D65) of a display colour 0..1. */
function lab([r, g, b]: Rgb): Rgb {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deltaE = (a: Rgb, b: Rgb) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

function hsv([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max > 0 ? d / max : 0, max];
}

const hexRgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, k) => v + (b[k]! - v) * t) as Rgb;
/** Bright's "screen" wash over a colour (world.ts's wash sprite). */
const lift = (c: Rgb, alpha: number): Rgb => {
  const w = hexRgb(LIGHTING.bright.groundLift.color);
  return c.map((v, k) => 1 - (1 - v) * (1 - w[k]! * alpha)) as Rgb;
};

/** The per-channel median of the chosen pixels (an RGBA byte array). */
function median(px: Uint8ClampedArray, pick: (i: number) => boolean): Rgb | null {
  const ch: number[][] = [[], [], []];
  for (let i = 0; i < px.length; i += 4) {
    if (!pick(i)) continue;
    for (let k = 0; k < 3; k++) ch[k]!.push(px[i + k]! / 255);
  }
  if (ch[0]!.length === 0) return null;
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]!) as Rgb;
}

const medianOf = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1] ?? 0;

// --- the ground's numbers ----------------------------------------------------------------------------------------

interface Ground {
  grass: Rgb;
  road: Rgb;
  pad: Rgb;
}

/** The middle's grass (open tiles a tile clear of the road, their inner part), road (its middle half) and pad tops
 * (their centres), from the crop `img` of plate px box `box`. */
function groundOf(img: ImageBitmap, box: Box): Ground {
  const map = getMap();
  const [x0, y0] = box;
  const c = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
  c.drawImage(img, 0, 0);
  const px = c.getImageData(0, 0, img.width, img.height).data;
  const tile = (tx: number, ty: number) =>
    tx < 0 || ty < 0 || tx >= map.width || ty >= map.height ? Tile.Blocker : map.tiles[ty * map.width + tx]!;
  const at = (i: number) => {
    const p = i / 4;
    const x = (p % img.width) + x0;
    const y = Math.floor(p / img.width) + y0;
    const [tx, ty] = [Math.floor(x / PLATE_TILE), Math.floor(y / PLATE_TILE)];
    return { tx, ty, fx: x / PLATE_TILE - tx, fy: y / PLATE_TILE - ty, x, y };
  };
  const grass = median(px, (i) => {
    const { tx, ty, fx, fy } = at(i);
    if (tile(tx, ty) !== Tile.Open || Math.abs(fx - 0.5) > 0.3 || Math.abs(fy - 0.5) > 0.3) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tile(tx + dx, ty + dy) === Tile.Lane) return false;
    return true;
  });
  const lanes = map.lanes.map((l) => l.waypoints);
  const road = median(px, (i) => {
    const { tx, ty, x, y } = at(i);
    if (tile(tx, ty) !== Tile.Lane) return false;
    return lanes.some((w) =>
      w.slice(1).some((b, k) => {
        const a = w[k]!;
        const [ax, ay, bx, by] = [a.x * PLATE_TILE, a.y * PLATE_TILE, b.x * PLATE_TILE, b.y * PLATE_TILE];
        const along = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
        const t = Math.max(0, Math.min(1, along));
        return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) < 0.45 * PLATE_TILE;
      }),
    );
  });
  const pad = median(px, (i) => {
    const { tx, ty, x, y } = at(i);
    if (tile(tx, ty) !== Tile.Pad) return false;
    const p = map.pads.find((q) => tx >= q.tx && tx < q.tx + map.padSize && ty >= q.ty && ty < q.ty + map.padSize);
    if (!p) return false;
    return Math.abs(x / PLATE_TILE - p.x) < 0.8 && Math.abs(y / PLATE_TILE - p.y) < 0.8;
  });
  if (!grass || !road || !pad) throw new Error('the crop has no grass, road or pad');
  return { grass, road, pad };
}

// --- the figures -------------------------------------------------------------------------------------------------

interface Figure {
  kind: HeroKind | CreepKind;
  hero: boolean;
  /** Where it stands (tiles, map coordinates). */
  x: number;
  y: number;
}

/** In the middle (tiles 7–19 × 11–19): the heroes on the grass between the pads, a Grunt and a Brute on the mid lane's
 * road, and on the grass beyond it. */
const FIGURES: Figure[] = [
  { kind: 'ranger', hero: true, x: 8.15, y: 15.75 },
  { kind: 'warden', hero: true, x: 10.4, y: 15.75 },
  { kind: 'grunt', hero: false, x: 13.0, y: 14.2 },
  { kind: 'brute', hero: false, x: 13.0, y: 17.7 },
  { kind: 'arcanist', hero: true, x: 14.85, y: 15.75 },
  { kind: 'grunt', hero: false, x: 16.4, y: 15.75 },
  { kind: 'brute', hero: false, x: 17.95, y: 15.75 },
];
/** The band of the middle the figures stand in (tiles). */
const BAND = { y0: 12.2, y1: 18.9 };

/** The figures drawn by the match's rigs at phone size (3× screen px) on a transparent canvas the size of the crop at
 * 3×, and each one's own pixels drawn alone. */
async function figures(box: Box): Promise<{ canvas: HTMLCanvasElement; alone: Uint8ClampedArray[] }> {
  const { Application, Container } = await import('pixi.js');
  const { ArtKit } = await import('./render/art/kit');
  const { creepRig3d, heroRig3d, loadCreepSheets, loadHeroSheets } = await import('./render/art3d');
  await loadHeroSheets();
  await loadCreepSheets();
  const kit = new ArtKit('normal');
  const scales = entityScales(TILE_CSS);
  const w = Math.round(((box[2] - box[0]) / PLATE_TILE) * TILE);
  const h = Math.round(((box[3] - box[1]) / PLATE_TILE) * TILE);
  const stage = new Container();
  const views: InstanceType<typeof Container>[] = [];
  for (const f of FIGURES) {
    const view = new Container();
    if (f.hero) {
      const rig = heroRig3d(f.kind as HeroKind, kit, false);
      if (!rig) throw new Error(`no 3D hero ${f.kind}`);
      view.addChild(rig.body);
      for (let t = 0; t < 4; t++) rig.update({ x: 0, y: 0, facing: 0, stunned: false }, 1000 + t * 16, 16);
      view.scale.set(scales.hero * PER_WORLD);
    } else {
      const rig = creepRig3d(f.kind as CreepKind, kit);
      if (!rig) throw new Error(`no 3D creep ${f.kind}`);
      if (rig.shadow) view.addChild(rig.shadow);
      view.addChild(rig.body, rig.flash);
      rig.reset(-1);
      rig.update(0, 3, true, 1000, 0);
      rig.update(0, 3, true, 1016, 0);
      view.scale.set(scales.creep * PER_WORLD);
    }
    view.position.set((f.x - box[0] / PLATE_TILE) * TILE, (f.y - box[1] / PLATE_TILE) * TILE);
    stage.addChild(view);
    views.push(view);
  }
  const app = new Application();
  await app.init({ width: w, height: h, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resolution: 1 });
  app.stage.addChild(stage);
  app.render();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(app.canvas, 0, 0);
  // Each figure alone (the others hidden), for its own pixels: neighbours overlap in the band.
  const bounds = views.map((v) => v.getBounds());
  const alone = views.map((v, i) => {
    const b = bounds[i]!;
    for (const o of views) o.visible = o === v;
    app.render();
    const one = document.createElement('canvas');
    one.width = Math.ceil(b.width);
    one.height = Math.ceil(b.height);
    const c = one.getContext('2d')!;
    c.drawImage(app.canvas, Math.floor(b.x), Math.floor(b.y), one.width, one.height, 0, 0, one.width, one.height);
    return c.getImageData(0, 0, one.width, one.height).data;
  });
  app.destroy();
  return { canvas, alone };
}

interface Colours {
  hood: number;
  metal: Rgb;
  bone: Rgb;
  brute: Rgb;
}

/** What the drawn figures show: the Ranger's green (its hue), the Warden's metal, the Grunt's bone, the Brute. */
function coloursOf(fig: { alone: Uint8ClampedArray[] }): Colours {
  const pixels = (i: number) => fig.alone[i]!;
  const opaque = (px: Uint8ClampedArray) => (i: number) => px[i + 3]! > 240;
  const rgbAt = (px: Uint8ClampedArray, i: number): Rgb => [px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255];
  const ranger = pixels(0);
  const hues: number[] = [];
  for (let i = 0; i < ranger.length; i += 4) {
    if (ranger[i + 3]! < 240) continue;
    const [h, s, v] = hsv(rgbAt(ranger, i));
    if (h > 60 && h < 200 && s > 0.25 && v > 0.15) hues.push(h);
  }
  const warden = pixels(1);
  const metal = median(warden, (i) => {
    if (!opaque(warden)(i)) return false;
    const [, s, v] = hsv(rgbAt(warden, i));
    return s < 0.2 && v > 0.45;
  });
  const grunt = pixels(2);
  const bone = median(grunt, (i) => {
    if (!opaque(grunt)(i)) return false;
    const [, s, v] = hsv(rgbAt(grunt, i));
    return s < 0.35 && v > 0.55;
  });
  const bruteFig = pixels(3);
  const brute = median(bruteFig, opaque(bruteFig));
  if (!metal || !bone || !brute || hues.length === 0) throw new Error('a figure drew nothing to measure');
  return { hood: medianOf(hues), metal, bone, brute };
}

/** The readability checks, as the sheet's table rows. */
export interface Checks {
  grass: string;
  grassHue: number;
  grassL: number;
  grassChroma: number;
  roadL: number;
  padL: number;
  /** Degrees between the Ranger's green and the grass's hue (at least 25). */
  rangerApart: number;
  wardenMetalDL: number;
  gruntDL: [number, number];
  bruteDL: [number, number];
  hpDE: number;
  padsDL: number;
  /** ΔE of the zone rim / wash on a pad: yours, a teammate's. */
  yours: [number, number];
  teammate: [number, number];
  /** The rim and wash alphas measured. */
  alphas: { yours: [number, number]; teammate: [number, number] };
  /** Bright: the grass under the wash (L, chroma) at the wash's alpha. */
  bright: { alpha: number; grassL: number; grassChroma: number };
}

function measure(g: Ground, f: Colours, teammateRim: number, brightAlpha: number): Checks {
  const L = (c: Rgb) => lab(c)[0];
  const chroma = (c: Rgb) => Math.hypot(lab(c)[1], lab(c)[2]);
  const [gh] = hsv(g.grass);
  const dl = (a: Rgb, b: Rgb) => Math.round(L(a) - L(b));
  const pad = g.pad;
  // The zone tints as world.ts lays them on a pad (PAD_TINTS).
  const zone = (hex: number, rim: number, wash: number): [number, number] => [
    Math.round(deltaE(pad, mixRgb(pad, hexRgb(hex), rim))),
    Math.round(deltaE(pad, mixRgb(pad, hexRgb(hex), wash))),
  ];
  const r = Math.round;
  const hp = hexRgb(COLORS.hpHigh);
  const lifted = lift(g.grass, brightAlpha);
  return {
    grass: toHex(g.grass),
    grassHue: r(gh),
    grassL: r(L(g.grass)),
    grassChroma: r(chroma(g.grass)),
    roadL: r(L(g.road)),
    padL: r(L(pad)),
    rangerApart: r(Math.abs(((f.hood - gh + 540) % 360) - 180)),
    wardenMetalDL: dl(f.metal, g.grass),
    gruntDL: [dl(f.bone, g.road), dl(f.bone, g.grass)],
    bruteDL: [dl(f.brute, g.road), dl(f.brute, g.grass)],
    hpDE: r(deltaE(hp, g.grass)),
    padsDL: dl(pad, g.grass),
    yours: zone(PLAYER_COLORS[0], PAD_TINTS.mine.rim, PAD_TINTS.mine.wash),
    teammate: zone(PLAYER_COLORS[1], teammateRim, PAD_TINTS.teammate.wash),
    alphas: { yours: [PAD_TINTS.mine.rim, PAD_TINTS.mine.wash], teammate: [teammateRim, PAD_TINTS.teammate.wash] },
    bright: { alpha: brightAlpha, grassL: r(L(lifted)), grassChroma: r(chroma(lifted)) },
  };
}

// --- drawing -----------------------------------------------------------------------------------------------------

const painter = createPainter(LIGHTING.normal);

/** A pad's zone tint (the pad art's white rim and wash, tinted, at the game's alphas) centred at (x, y) device px. */
function tint(c: Ctx, x: number, y: number, colour: number, rim: number, wash: number): void {
  const art = padArt();
  const size = Math.ceil(96 * PER_WORLD) + 8;
  for (const [frame, alpha] of [['wash', wash], ['rim', rim]] as const) {
    if (alpha <= 0) continue;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const o = off.getContext('2d')!;
    o.translate(size / 2, size / 2);
    o.scale(PER_WORLD, PER_WORLD);
    art.frames[frame]!.draw(o, painter, RL);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = css(colour);
    o.fillRect(0, 0, size, size);
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(off, x - size / 2, y - size / 2);
    c.restore();
  }
}

/**
 * Measures the plate at /__ground/plate.webp (its middle, `BOX`) with the figures, and draws the figures' band: the
 * middle at 3× with the heroes, a Grunt and a Brute standing on it, the upper left pad tinted yours and the upper right
 * one a teammate's (`teammateRim`: that rim's alpha; the game's by default). `brightAlpha`: Bright's wash (the game's by
 * default). Returns the checks and the band as a JPEG data URL.
 */
export async function groundCheck(
  teammateRim: number = PAD_TINTS.teammate.rim,
  brightAlpha: number = LIGHTING.bright.groundLift.alpha,
): Promise<{ checks: Checks; band: string }> {
  const res = await fetch('/__ground/plate.webp');
  if (!res.ok) throw new Error('no plate');
  const plate = await createImageBitmap(await res.blob());
  const box = BOX;
  const mc = new OffscreenCanvas(box[2] - box[0], box[3] - box[1]);
  mc.getContext('2d')!.drawImage(plate, -box[0], -box[1]);
  const middle = mc.transferToImageBitmap();
  const fig = await figures(box);
  const checks = measure(groundOf(middle, box), coloursOf(fig), teammateRim, brightAlpha);

  const midW = Math.round(((box[2] - box[0]) / PLATE_TILE) * TILE);
  const midH = Math.round(((box[3] - box[1]) / PLATE_TILE) * TILE);
  const bandTop = Math.round((BAND.y0 - box[1] / PLATE_TILE) * TILE);
  const bandH = Math.round((BAND.y1 - BAND.y0) * TILE);
  const band = document.createElement('canvas');
  band.width = midW;
  band.height = midH;
  const b = band.getContext('2d')!;
  b.imageSmoothingQuality = 'high';
  b.drawImage(middle, 0, 0, midW, midH);
  const map = getMap();
  const inside = (v: number, lo: number, hi: number) => v * PLATE_TILE > lo && v * PLATE_TILE < hi;
  for (const p of map.pads.filter((q) => !q.extra && inside(q.x, box[0], box[2]) && inside(q.y, box[1], box[3]))) {
    const px = (p.x - box[0] / PLATE_TILE) * TILE;
    const py = (p.y - box[1] / PLATE_TILE) * TILE;
    const top = p.y < 15;
    if (top && p.x < 13) tint(b, px, py, PLAYER_COLORS[0], PAD_TINTS.mine.rim, PAD_TINTS.mine.wash);
    else if (top) tint(b, px, py, PLAYER_COLORS[1], teammateRim, PAD_TINTS.teammate.wash);
    else tint(b, px, py, RL.moon, PAD_TINTS.open.rim, PAD_TINTS.open.wash);
  }
  b.drawImage(fig.canvas, 0, 0);
  const out = document.createElement('canvas');
  out.width = midW;
  out.height = bandH;
  out.getContext('2d')!.drawImage(band, 0, bandTop, midW, bandH, 0, 0, midW, bandH);
  return { checks, band: out.toDataURL('image/jpeg', 0.88) };
}
