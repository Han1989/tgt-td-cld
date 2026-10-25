// V-07c look, page side (dev only: scripts/groundOptions.ts imports it into a page of Vite's dev server; the game never
// imports it, so no build carries it): the sheet for Han, today's ground and the three looks side by side as wave-10
// match frames on a 412 × 839 phone, each one's readability checks measured under it, the Bright frames, the middle of
// each ground at full quality at the phone's screen pixels (3×), and the three heroes, a Grunt and a Brute standing on
// each ground, drawn by the match's own rigs at phone size, with a pad tinted yours and one a teammate's. The files
// (frames, plates, middles) are served by the script under /__ground/. Returns the sheet as a PNG data URL and the
// checks as text lines per look.

import type { CreepKind, HeroKind } from '@tdt/protocol';
import { getMap, Tile } from '@tdt/sim';
import './render/art/load';
import { createPainter } from './render/art/paint';
import { padArt } from './render/art/registry';
import { LIGHTING, RL } from './render/art/tokens';
import { entityScales } from './render/entityScale';
import { COLORS, PLAYER_COLORS } from './render/palette';

/** The reference phone: Spire's 26 tiles across 412 CSS px, on a 3× screen. */
const TILE_CSS = 412 / 26;
const DPR = 3;
/** Device px per tile on that screen, and per world px. */
const TILE = TILE_CSS * DPR;
const PER_WORLD = TILE / 32;
/** Plate px per tile. */
const PLATE_TILE = 64;
const COL = 618;
const GAP = 24;
const WIDTH = COL * 4 + GAP * 5;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const TEXT = css(RL.bone);

interface Look {
  key: string;
  name: string;
  box: boolean;
  lift: number;
  pools: number;
}

type Box = readonly [number, number, number, number];
type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

const load = async (name: string) => {
  const res = await fetch(`/__ground/${name}`);
  if (!res.ok) throw new Error(`no ${name}`);
  return createImageBitmap(await res.blob());
};

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
 * (their centres), from the full-quality crop of plate px box `box`. */
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

/** In the middle crop (tiles 7–19 × 11–19): the heroes on the grass between the pads, a Grunt and a Brute on the mid
 * lane's road, and on the grass beyond it. */
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

/** The readability checks, short, for the lines under a frame. */
function checks(g: Ground, f: Colours, look: Look): string[] {
  const L = (c: Rgb) => lab(c)[0];
  const [gh] = hsv(g.grass);
  const apart = Math.abs(((f.hood - gh + 540) % 360) - 180);
  const ok = (pass: boolean) => (pass ? '✓' : '✗');
  const dl = (a: Rgb, b: Rgb) => Math.round(L(a) - L(b));
  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  const pad = g.pad;
  // The zone tints as world.ts lays them on a pad: yours rim 95%, wash 20%; a teammate's rim 50%, wash 8%.
  const zone = (hex: number, rim: number, wash: number) =>
    `${Math.round(deltaE(pad, mixRgb(pad, hexRgb(hex), rim)))} / ${Math.round(deltaE(pad, mixRgb(pad, hexRgb(hex), wash)))}`;
  const hp = hexRgb(COLORS.hpHigh);
  const r = Math.round;
  const grunt = [dl(f.bone, g.road), dl(f.bone, g.grass)] as const;
  const brute = [dl(f.brute, g.road), dl(f.brute, g.grass)] as const;
  const lift = r(look.lift * 100);
  const lines = [
    `Grass ${toHex(g.grass)} (${r(gh)}°, L ${r(L(g.grass))}) · road L ${r(L(g.road))} · pads L ${r(L(pad))}`,
    `Ranger's green ${Math.round(f.hood)}° vs grass ${Math.round(gh)}°: ${Math.round(apart)}° apart ${ok(apart >= 25)}`,
    `Warden's metal on grass ΔL ${sign(dl(f.metal, g.grass))} ${ok(Math.abs(dl(f.metal, g.grass)) >= 15)}`,
    `Grunt ΔL ${sign(grunt[0])} on road, ${sign(grunt[1])} on grass ${ok(Math.min(...grunt) >= 15)}`,
    `Brute ΔL ${sign(brute[0])} on road, ${sign(brute[1])} on grass ${ok(Math.max(...brute) <= -15)}`,
    `HP bar ΔE ${r(deltaE(hp, g.grass))} on grass ${ok(deltaE(hp, g.grass) >= 25)} · pads ΔL ${sign(dl(pad, g.grass))} ` +
      ok(dl(pad, g.grass) >= 5),
    `Zone tint ΔE rim / wash: yours ${zone(PLAYER_COLORS[0], 0.95, 0.2)}, ` +
      `a teammate's ${zone(PLAYER_COLORS[1], 0.5, 0.08)}`,
    look.key === 'now' ? `Bright: the game's wash, ${lift}%` : `Bright: wash at ${lift}% (the game's is 32%)`,
  ];
  return lines;
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

function label(c: Ctx, text: string, x: number, y: number, size: number, bold = false): void {
  c.fillStyle = TEXT;
  c.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  c.fillText(text, x, y);
}

/** The sheet. `box`: the middle crop in plate px (the full-quality renders' TDT_PLATE_BOX). */
export async function drawGroundOptions(
  looks: Look[],
  box: Box,
): Promise<{ sheet: string; checks: Record<string, string[]> }> {
  const frames = await Promise.all(
    looks.map(async (l) => ({ normal: await load(`${l.key}-normal.png`), bright: await load(`${l.key}-bright.png`) })),
  );
  const plates = await Promise.all(looks.map((l) => load(`${l.key}-plate.webp`)));
  // The middle of each ground at full quality: the render's crop, or today's plate (rendered at full quality) cut.
  const middles = await Promise.all(
    looks.map(async (l, i) => {
      if (l.box) return load(`${l.key}-box.png`);
      const c = new OffscreenCanvas(box[2] - box[0], box[3] - box[1]);
      c.getContext('2d')!.drawImage(plates[i]!, -box[0], -box[1]);
      return c.transferToImageBitmap();
    }),
  );
  const fig = await figures(box);
  const colours = coloursOf(fig);
  const out: Record<string, string[]> = {};
  for (const [i, l] of looks.entries()) out[l.key] = checks(groundOf(middles[i]!, box), colours, l);

  const frameW = COL;
  const frameH = Math.round((frames[0]!.normal.height * COL) / frames[0]!.normal.width);
  const midW = Math.round(((box[2] - box[0]) / PLATE_TILE) * TILE);
  const midH = Math.round(((box[3] - box[1]) / PLATE_TILE) * TILE);
  const bandTop = Math.round((BAND.y0 - box[1] / PLATE_TILE) * TILE);
  const bandH = Math.round((BAND.y1 - BAND.y0) * TILE);
  const LINE = 29;
  const checksH = LINE * 8 + 20;
  const head = 120;
  const rowLabel = 46;
  const height = head + rowLabel + frameH + checksH + rowLabel + frameH + 30 + rowLabel + midH + 30 + rowLabel + bandH + 30;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, WIDTH, height);
  c.imageSmoothingQuality = 'high';
  const title = 'V-07c look: the map in grass green — today’s ground and three looks for Han (nothing in the game changes)';
  label(c, title, GAP, 50, 34, true);
  const sub =
    'Wave 10 of Full on a 412 × 839 phone, one held moment shot on each ground (drafts; V-07c’s light pools mocked ' +
    'in: rose round the Heart, violet round the portals, teal under the tier-3 towers).';
  label(c, sub, GAP, 90, 21);
  const short = (l: Look) => (l.key === 'now' ? 'Now' : l.key.toUpperCase());
  const colX = (i: number) => GAP + i * (COL + GAP);
  let y = head;
  // The frames in Normal, and the checks under each.
  for (const [i, l] of looks.entries()) {
    label(c, l.name, colX(i), y + 32, 28, true);
    c.drawImage(frames[i]!.normal, colX(i), y + rowLabel, frameW, frameH);
    out[l.key]!.forEach((line, k) => label(c, line, colX(i), y + rowLabel + frameH + 32 + k * LINE, 20));
  }
  y += rowLabel + frameH + checksH;
  // The frames in Bright.
  for (const [i, l] of looks.entries()) {
    label(c, `${l.name} · Bright, wash ${Math.round(l.lift * 100)}%`, colX(i), y + 32, 24, true);
    c.drawImage(frames[i]!.bright, colX(i), y + rowLabel, frameW, frameH);
  }
  y += rowLabel + frameH + 30;
  // The middles at the phone's screen pixels.
  for (const [i, l] of looks.entries()) {
    label(c, `${short(l)}: the middle, full quality, at 3×`, colX(i), y + 32, 22, true);
    c.drawImage(middles[i]!, colX(i) + (COL - midW) / 2, y + rowLabel, midW, midH);
  }
  y += rowLabel + midH + 30;
  // The heroes, a Grunt and a Brute standing on each ground; a pad tinted yours, one a teammate's, the rest as solo.
  const map = getMap();
  for (const [i, l] of looks.entries()) {
    label(c, `${short(l)}: heroes, Grunt, Brute · pads yours / a teammate’s`, colX(i), y + 32, 20, true);
    const band = document.createElement('canvas');
    band.width = midW;
    band.height = midH;
    const b = band.getContext('2d')!;
    b.imageSmoothingQuality = 'high';
    b.drawImage(middles[i]!, 0, 0, midW, midH);
    const inside = (v: number, lo: number, hi: number) => v * PLATE_TILE > lo && v * PLATE_TILE < hi;
    const inBox = map.pads.filter((p) => !p.extra && inside(p.x, box[0], box[2]) && inside(p.y, box[1], box[3]));
    for (const p of inBox) {
      const px = (p.x - box[0] / PLATE_TILE) * TILE;
      const py = (p.y - box[1] / PLATE_TILE) * TILE;
      const top = p.y < 15;
      if (top && p.x < 13) tint(b, px, py, PLAYER_COLORS[0], 0.95, 0.2);
      else if (top) tint(b, px, py, PLAYER_COLORS[1], 0.5, 0.08);
      else tint(b, px, py, RL.moon, 0.35, 0);
    }
    b.drawImage(fig.canvas, 0, 0);
    c.drawImage(band, 0, bandTop, midW, bandH, colX(i) + (COL - midW) / 2, y + rowLabel, midW, bandH);
  }
  return { sheet: canvas.toDataURL('image/png'), checks: out };
}
