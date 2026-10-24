// The towers', the Heart's and the portals' contact sheet, page side (dev only: scripts/structuresContact.ts imports it
// into a page of Vite's dev server; the game never imports it, so no build carries it): every tower kind at every tier
// and branch, the Heart in its three damage states and the portal, their 2D art (drawn by its own art file and the
// painter) next to their 3D frames from the shipped sheet, on the map plate's own ground (a pad, the clearing round
// the Heart, the top of a lane), at the size a 412 × 839 phone draws them on a 3× screen, then close up, then each
// kind's turret through its recoil. Returns the picture as a PNG data URL.
//
// V-06l (`drawWards`): the five towers from Meshy, theme A, next to the KayKit ones they replace (a sheet and layout
// read from git by the script), at phone size and close up, each tier 1 turret through its recoil, and a match frame.

import { TOWER_BRANCHES, TOWER_KINDS, type TowerBranch, type TowerKind } from '@tdt/protocol';
import { getMap } from '@tdt/sim';
import './render/art/load';
import { createPainter } from './render/art/paint';
import { heartArt, portalArt, towerArt } from './render/art/registry';
import { LIGHTING, RL } from './render/art/tokens';
import { PORTAL_OPENING } from './render/art3d/buildings';
import structuresDoc from './render/art3d/structures.json';
import {
  towerKeys,
  towerVariant,
  type StructureCell,
  type StructureMatchLayout,
  type StructuresLayout,
} from './render/art3d/structures';
import sheetUrl from './render/art3d/structures-match.png?url';
import plateLayout from './render/plate/spire.json';

/** The reference phone: Spire's 26 tiles across 412 CSS px, on a 3× screen; towers drawn 1.2× (docs/ART.md §6). */
const TILE_CSS = 412 / 26;
const DPR = 3;
const PHONE_TOWER = (TILE_CSS / 32) * 1.2 * DPR;
const PHONE_WORLD = (TILE_CSS / 32) * DPR;
const CLOSE = 2;
const WIDTH = 2000;
/** Every shown turret aims a little up and right of its rest (+x), as if it had turned towards a creep. */
const AIM = -0.45;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

type Ctx = CanvasRenderingContext2D;
const painter = createPainter(LIGHTING.normal);
const doc = structuresDoc as StructuresLayout;
const L = doc.match;

interface Assets {
  sheet: ImageBitmap;
  plate: ImageBitmap;
  /** The sheet's layout, when it is not the shipped one (V-06l: the KayKit sheet read from git). */
  layout?: StructureMatchLayout;
}

const load = async (url: string) => createImageBitmap(await (await fetch(url)).blob());

const variantsOf = (kind: TowerKind): [number, TowerBranch | null, string][] => [
  [1, null, 'tier 1'],
  [2, null, 'tier 2'],
  [3, null, 'tier 3'],
  ...TOWER_BRANCHES[kind].map((b): [number, TowerBranch, string] => [4, b, b]),
];

export async function drawContact(): Promise<string> {
  const a: Assets = { sheet: await load(sheetUrl), plate: await load(`/map/${plateLayout.file.name}`) };

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = 6400;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  const title = (text: string, size = 34) => {
    c.fillStyle = size > 30 ? '#e6dac0' : '#cfe6ff';
    c.font = `${size > 30 ? 'bold ' : ''}${size}px sans-serif`;
    c.fillText(text, 24, y + size + 10);
    y += size + 26;
  };
  const label = (text: string, x: number, yy: number) => {
    c.fillStyle = '#e6dac0';
    c.font = '20px sans-serif';
    c.fillText(text, x, yy);
  };

  title('V-05d: the towers, the Heart and the portals in 3D, next to their 2D art');
  c.fillStyle = '#9fb0c2';
  c.font = '20px sans-serif';
  c.fillText(
    `One sheet, ${L.w} × ${L.h}, ${L.res} px per world px · on the map plate's own ground · turrets turned ${(-AIM * 57.3).toFixed(0)}° towards a target`,
    24,
    y + 4,
  );
  y += 30;

  // 1. In a match, at phone size: per kind, each tier and branch, 2D then 3D.
  title('In a match: a 412 × 839 phone on a 3× screen (2D · 3D, each on its pad)', 26);
  const win = 104; // world px of plate round a pad
  for (const kind of TOWER_KINDS) {
    const cell = win * PHONE_TOWER;
    label(`${towerArt(kind)!.name}`, 24, y + 22);
    y += 32;
    let x = 24;
    for (const [tier, branch, name] of variantsOf(kind)) {
      label(name, x, y + 18);
      drawPad(c, a, x, y + 26, win, PHONE_TOWER);
      draw2dTower(c, kind, tier, branch, x + cell / 2, y + 26 + cell / 2, PHONE_TOWER);
      drawPad(c, a, x + cell + 6, y + 26, win, PHONE_TOWER);
      draw3dTower(c, a, kind, tier, branch, x + cell * 1.5 + 6, y + 26 + cell / 2, PHONE_TOWER, 0);
      x += cell * 2 + 30;
    }
    y += cell + 40;
  }

  // 2. The Heart and the portal at phone size.
  title('The Heart (whole · under 60% HP · under 30% HP) and a portal, 2D · 3D, at phone size', 26);
  {
    const hw = 150;
    const cell = hw * PHONE_WORLD;
    let x = 24;
    for (const stage of [0, 1, 2]) {
      drawGround(c, a, getMap().heart.x * 32, getMap().heart.y * 32 - 16, hw, hw, x, y, PHONE_WORLD);
      draw2dHeart(c, stage, x + cell / 2, y + cell / 2 + 16 * PHONE_WORLD, PHONE_WORLD);
      drawGround(c, a, getMap().heart.x * 32, getMap().heart.y * 32 - 16, hw, hw, x + cell + 6, y, PHONE_WORLD);
      draw3dHeart(c, a, stage, x + cell * 1.5 + 6, y + cell / 2 + 16 * PHONE_WORLD, PHONE_WORLD);
      x += cell * 2 + 30;
    }
    const p = getMap().lanes[1]!.waypoints[0]!;
    drawGround(c, a, p.x * 32, (p.y + 1) * 32 + 20, hw, hw, x, y, PHONE_WORLD);
    draw2dPortal(c, x + cell / 2, y + cell / 2 - 20 * PHONE_WORLD, PHONE_WORLD);
    drawGround(c, a, p.x * 32, (p.y + 1) * 32 + 20, hw, hw, x + cell + 6, y, PHONE_WORLD);
    draw3dPortal(c, a, x + cell * 1.5 + 6, y + cell / 2 - 20 * PHONE_WORLD, PHONE_WORLD);
    y += cell + 30;
  }

  // 3. Close up: 2 px per world px.
  title(`Close up: ${CLOSE} px per world px (the sheet has ${L.res}), 2D · 3D`, 26);
  {
    const cell = win * CLOSE;
    const all = TOWER_KINDS.flatMap((kind) => variantsOf(kind).map((v) => [kind, ...v] as const));
    for (let i = 0; i < all.length; i += 4) {
      let x = 24;
      for (const [kind, tier, branch, name] of all.slice(i, i + 4)) {
        label(`${kind} · ${name}`, x, y + 18);
        drawPad(c, a, x, y + 26, win, CLOSE);
        draw2dTower(c, kind, tier, branch, x + cell / 2, y + 26 + cell / 2, CLOSE);
        drawPad(c, a, x + cell + 4, y + 26, win, CLOSE);
        draw3dTower(c, a, kind, tier, branch, x + cell * 1.5 + 4, y + 26 + cell / 2, CLOSE, 0);
        x += cell * 2 + 34;
      }
      y += cell + 46;
    }
  }

  // 4. The recoil: each kind's tier 3 turret at rest and through its three recoil frames.
  title('A shot: each tier 3 turret at rest, then its three recoil frames (shown on a shot, back to rest in 140 ms)', 26);
  {
    const cell = win * CLOSE;
    for (let i = 0; i < TOWER_KINDS.length; i += 2) {
      let x = 24;
      for (const kind of TOWER_KINDS.slice(i, i + 2)) {
        label(kind, x, y + 18);
        for (const k of [0, 1, 2, 3] as const) {
          drawPad(c, a, x, y + 26, win, CLOSE * 0.5);
          draw3dTower(c, a, kind, 3, null, x + (cell * 0.5) / 2, y + 26 + (cell * 0.5) / 2, CLOSE * 0.5, k);
          x += cell * 0.5 + 8;
        }
        x += 60;
      }
      y += cell * 0.5 + 46;
    }
  }

  const out = document.createElement('canvas');
  out.width = WIDTH;
  out.height = Math.ceil(y + 10);
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}

/** The map plate's ground round a world point (cx, cy), w × h world px, drawn at (x, y) at k px per world px. */
function drawGround(c: Ctx, a: Assets, cx: number, cy: number, w: number, h: number, x: number, y: number, k: number): void {
  const r = plateLayout.res;
  c.imageSmoothingQuality = 'high';
  c.drawImage(a.plate, (cx - w / 2) * r, (cy - h / 2) * r, w * r, h * r, x, y, w * k, h * k);
}

/** A pad of the plate (the first base pad) with `win` world px round it. */
function drawPad(c: Ctx, a: Assets, x: number, y: number, win: number, k: number): void {
  const [x0, y0, x1, y1] = plateLayout.pads[0]!.box as [number, number, number, number];
  const r = plateLayout.res;
  drawGround(c, a, (x0 + x1) / 2 / r, (y0 + y1) / 2 / r, win, win, x, y, k);
}

function draw2dTower(c: Ctx, kind: TowerKind, tier: number, branch: TowerBranch | null, x: number, y: number, k: number): void {
  const art = towerArt(kind)!;
  const t = Math.min(3, tier);
  const pick = (part: 'base' | 'top') => (branch && art.frames[`${branch}.${part}`] ? `${branch}.${part}` : `${part}${t}`);
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  shadow(c);
  art.frames[pick('base')]!.draw(c, painter, RL);
  c.rotate(AIM);
  art.frames[pick('top')]!.draw(c, painter, RL);
  c.restore();
}

/** The towers' contact shadow (rigs.ts: the common shadow, 2 × 3.2 at (2, 4)), under both rigs. */
function shadow(c: Ctx): void {
  c.save();
  c.translate(2, 4);
  c.scale(2, 3.2);
  painter.shadow(c, 0, 0, 20, 9);
  c.restore();
}

function cellAt(c: Ctx, a: Assets, cell: StructureCell, x: number, y: number, k: number, rot = 0, add = false): void {
  const s = k / (cell.res ?? (a.layout ?? L).res);
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  if (add) c.globalCompositeOperation = 'lighter';
  c.imageSmoothingQuality = 'high';
  c.drawImage(a.sheet, cell.x, cell.y, cell.w, cell.h, -cell.ax, -cell.ay, cell.w, cell.h);
  c.restore();
}

function draw3dTower(c: Ctx, a: Assets, kind: TowerKind, tier: number, branch: TowerBranch | null, x: number, y: number, k: number, recoil: 0 | 1 | 2 | 3): void {
  const keys = towerKeys(kind, towerVariant(tier, branch));
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  shadow(c);
  c.restore();
  const cells = (a.layout ?? L).cells;
  cellAt(c, a, cells[keys.base]!, x, y, k);
  cellAt(c, a, cells[keys.turret[recoil]]!, x, y, k, AIM);
}

function draw2dHeart(c: Ctx, stage: number, x: number, y: number, k: number): void {
  const art = heartArt();
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.save();
  c.translate(0, art.baseY);
  art.frames.base!.draw(c, painter, RL);
  c.restore();
  c.translate(0, art.gemY);
  c.scale(art.gemScale, art.gemScale);
  art.frames.gem!.draw(c, painter, RL);
  if (stage >= 1) art.frames.cracks1!.draw(c, painter, RL);
  if (stage >= 2) art.frames.cracks2!.draw(c, painter, RL);
  c.restore();
}

function draw3dHeart(c: Ctx, a: Assets, stage: number, x: number, y: number, k: number): void {
  cellAt(c, a, L.cells[`heart/stage${stage}`]!, x, y, k);
  if (stage) cellAt(c, a, L.cells[`heart/rubble${stage}`]!, x, y, k);
  cellAt(c, a, L.cells['heart/glow']!, x, y, k, 0, true);
  if (stage === 2) cellAt(c, a, L.cells['heart/fire0']!, x, y, k, 0, true);
}

function draw2dPortal(c: Ctx, x: number, y: number, k: number): void {
  const art = portalArt();
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  art.frames.rim!.draw(c, painter, RL);
  art.frames.swirl!.draw(c, painter, RL);
  c.restore();
}

function draw3dPortal(c: Ctx, a: Assets, x: number, y: number, k: number): void {
  cellAt(c, a, L.cells['portal/body']!, x, y, k);
  cellAt(c, a, L.cells['portal/glow']!, x, y, k, 0, true);
  const o = L.portal.points.opening;
  c.save();
  c.translate(x + o.x * k, y + o.y * k);
  c.scale(k * PORTAL_OPENING, k * PORTAL_OPENING);
  c.globalCompositeOperation = 'lighter';
  portalArt().frames.swirl!.draw(c, painter, RL);
  c.restore();
}

/**
 * V-06l, the Spire's wards, batch 1: every tower kind at tiers 1–3 and both branches, the KayKit frames (`kaykit`: the
 * sheet as a data URL and its match layout, from git) next to the Meshy ones (the shipped sheet), at phone size and
 * close up on the map plate's pad, each kind's tier 1 turret through its recoil, then `match` (a 412 × 839 phone's
 * screenshot at 3×, wave 10 with the five kinds built) and a crop of it round the towers at the screen's own pixels.
 */
export async function drawWards(
  kaykit: { sheet: string; layout: StructureMatchLayout },
  match: { shot: string; box: { x0: number; y0: number; x1: number; y1: number } } | null,
): Promise<string> {
  const plate = await load(`/map/${plateLayout.file.name}`);
  const a: Assets = { sheet: await load(sheetUrl), plate };
  const b: Assets = { sheet: await load(kaykit.sheet), plate, layout: kaykit.layout };
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = 9000;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  const title = (text: string, size = 34) => {
    c.fillStyle = size > 30 ? '#e6dac0' : '#cfe6ff';
    c.font = `${size > 30 ? 'bold ' : ''}${size}px sans-serif`;
    c.fillText(text, 24, y + size + 10);
    y += size + 26;
  };
  const label = (text: string, x: number, yy: number, colour = '#e6dac0') => {
    c.fillStyle = colour;
    c.font = '20px sans-serif';
    c.fillText(text, x, yy);
  };
  title("V-06l, batch 1: the Spire's wards, theme A: the five towers from Meshy");
  c.fillStyle = '#9fb0c2';
  c.font = '20px sans-serif';
  c.fillText(
    `KayKit (V-05d) · Meshy, each on the map plate's pad · one sheet, ${L.w} × ${L.h}, ${L.res} px per world px · ` +
      `turrets turned ${(-AIM * 57.3).toFixed(0)}° towards a target`,
    24,
    y + 4,
  );
  y += 30;

  const win = 104;
  /** A tower variant on two pads side by side: KayKit's, then Meshy's. */
  const pair = (kind: TowerKind, tier: number, branch: TowerBranch | null, x: number, yy: number, k: number) => {
    const cell = win * k;
    drawPad(c, a, x, yy, win, k);
    draw3dTower(c, b, kind, tier, branch, x + cell / 2, yy + cell / 2, k, 0);
    drawPad(c, a, x + cell + 4, yy, win, k);
    draw3dTower(c, a, kind, tier, branch, x + cell * 1.5 + 4, yy + cell / 2, k, 0);
  };

  // 1. In a match, at phone size.
  title('In a match: a 412 × 839 phone on a 3× screen (KayKit · Meshy, each on its pad)', 26);
  for (const kind of TOWER_KINDS) {
    const cell = win * PHONE_TOWER;
    label(`${towerArt(kind)!.name}`, 24, y + 22);
    y += 32;
    let x = 24;
    for (const [tier, branch, name] of variantsOf(kind)) {
      label(name, x, y + 18);
      pair(kind, tier, branch, x, y + 26, PHONE_TOWER);
      x += cell * 2 + 30;
    }
    y += cell + 40;
  }

  // 2. Close up: 2 px per world px.
  title(`Close up: ${CLOSE} px per world px (the sheet has ${L.res}), KayKit · Meshy`, 26);
  {
    const cell = win * CLOSE;
    const all = TOWER_KINDS.flatMap((kind) => variantsOf(kind).map((v) => [kind, ...v] as const));
    for (let i = 0; i < all.length; i += 4) {
      let x = 24;
      for (const [kind, tier, branch, name] of all.slice(i, i + 4)) {
        label(`${kind} · ${name}`, x, y + 18);
        pair(kind, tier, branch, x, y + 26, CLOSE);
        x += cell * 2 + 34;
      }
      y += cell + 46;
    }
  }

  // 3. The recoil: each kind's tier 1 turret (Meshy) at rest and through its three recoil frames.
  title('A shot: each tier 1 turret (Meshy) at rest, then its three recoil frames (back to rest in 140 ms)', 26);
  {
    const cell = win * CLOSE * 0.75;
    for (let i = 0; i < TOWER_KINDS.length; i += 2) {
      let x = 24;
      for (const kind of TOWER_KINDS.slice(i, i + 2)) {
        label(kind, x, y + 18);
        for (const r of [0, 1, 2, 3] as const) {
          drawPad(c, a, x, y + 26, win, CLOSE * 0.75);
          draw3dTower(c, a, kind, 1, null, x + cell / 2, y + 26 + cell / 2, CLOSE * 0.75, r);
          x += cell + 8;
        }
        x += 60;
      }
      y += cell + 46;
    }
  }

  // 4. A match: wave 10 of Full on a 412 × 839 phone at 3×, the five kinds built; then the towers at the screen's px.
  if (match) {
    title("Wave 10 of Full on a 412 × 839 phone at 3× (Arrow tier 3, Cannon 2, Frost 1, Arcane 3, Flak 2), the towers at its pixels", 26);
    const shot = await load(match.shot);
    const k = 0.5;
    c.drawImage(shot, 24, y, shot.width * k, shot.height * k);
    const { x0, y0, x1, y1 } = match.box;
    const sx = Math.max(0, x0);
    const sy = Math.max(0, y0);
    const w = Math.min(shot.width, x1) - sx;
    const h = Math.min(shot.height, y1) - sy;
    const room = WIDTH - 24 - shot.width * k - 30 - 24;
    const fit = Math.min(1, room / w);
    const cx = 24 + shot.width * k + 30;
    c.drawImage(shot, sx, sy, w, h, cx, y, w * fit, h * fit);
    c.strokeStyle = '#e6dac0';
    c.lineWidth = 2;
    c.strokeRect(24 + sx * k, y + sy * k, w * k, h * k);
    const scale = fit < 1 ? `the towers at ${fit.toFixed(2)}× the screen's pixels` : "the towers at the screen's own pixels";
    label(scale, cx, y + h * fit + 26, '#9fb0c2');
    y += Math.max(shot.height * k, h * fit + 40) + 20;
  }

  const out = document.createElement('canvas');
  out.width = WIDTH;
  out.height = Math.ceil(y + 10);
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}
