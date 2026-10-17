// The creeps' contact sheet, page side (dev only: scripts/creepsContact.ts imports it into a page of Vite's dev
// server; the game never imports it, so no build carries it): every creep kind's 2D
// sprite, drawn by its own art file and the painter, next to its 3D stand and step from the shipped sheet, on the lane,
// at the size a 412 × 839 phone draws them in a match on a 3× screen (V-04's creep scale), and again close up at the
// 3D sheet's own pixels. Returns the picture as a PNG data URL. `drawIronhorn` (V-05c round 2) puts the Ironhorn as
// V-05c merged it (the BlueDemon) next to today's (the Demon).

import type { CreepKind } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import './render/art/load';
import { createPainter } from './render/art/paint';
import { creepArt } from './render/art/registry';
import { LIGHTING, RL } from './render/art/tokens';
import { CREEP_3D } from './render/art3d/creepData';
import type { CreepCell, CreepMatchLayout } from './render/art3d/creeps';
import { CREEP_SHEETS } from './render/art3d/creepSheet';
import { entityScales } from './render/entityScale';
import { flyerDrawScale } from './teach/cues';

/** The reference phone: Spire's 26 tiles across 412 CSS px, on a 3× screen. */
const TILE_CSS = 412 / 26;
const DPR = 3;
const WIDTH = 1236;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

interface Pair {
  kind: CreepKind;
  sheet: ImageBitmap;
}

export async function drawContact(): Promise<string> {
  const kinds = Object.keys(CREEP_3D) as CreepKind[];
  const pairs: Pair[] = [];
  for (const kind of kinds) {
    const res = await fetch(CREEP_SHEETS[kind]);
    pairs.push({ kind, sheet: await createImageBitmap(await res.blob()) });
  }
  const match = (kind: CreepKind) => (TILE_CSS / 32) * entityScales(TILE_CSS).creep * flyerDrawScale(TUNING.creeps[kind].flying) * DPR;

  // Two sections: match size, then close up (the 3D sheet's own pixels per world px: 4, the bosses 3).
  const sections: { title: string; rows: CreepKind[][]; scale: (k: CreepKind) => number }[] = [
    {
      title: 'In a match: a 412 × 839 phone, 3× screen (2D · 3D stand · 3D step)',
      rows: [['grunt', 'runner', 'archer'], ['brute', 'wisp', 'hatchling'], ['ironhorn'], ['matriarch'], ['shardback']],
      scale: match,
    },
    {
      title: 'Close up: the 3D sheets’ own pixels (4 per world px, bosses 3)',
      rows: [['grunt', 'runner'], ['archer', 'brute'], ['wisp', 'hatchling'], ['ironhorn'], ['matriarch'], ['shardback']],
      scale: (k) => CREEP_3D[k].match.res,
    },
  ];
  // The 3D frames shown (the stand and a step) and how far each reaches left and right of the feet, and up.
  const shown = (k: CreepKind) => {
    const L = CREEP_3D[k].match;
    return [L.frames.idle[0]!, L.frames.walk[2]!].map((f) => ({
      f,
      left: (L.box.ax - f.dx) / L.res,
      right: (f.dx + f.w - L.box.ax) / L.res,
      up: (L.box.ay - f.dy) / L.res,
    }));
  };
  const cell = (k: CreepKind, s: number) => {
    const art = creepArt(k)!;
    const body = art.frames.body!;
    const frames = shown(k);
    const w3 = frames.reduce((a, x) => a + (x.left + x.right) * s + 16, 0);
    const up = Math.max(body.h / 2 + art.feet, ...frames.map((x) => x.up)) * s;
    // At least as wide as its label.
    return { w: Math.max(300, body.w * s + w3 + 28), h: up + 70 };
  };
  let height = 70;
  for (const sec of sections) {
    height += 56;
    for (const row of sec.rows) height += Math.max(...row.map((k) => cell(k, sec.scale(k)).h)) + 12;
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.ceil(height);
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#e6dac0';
  c.font = 'bold 34px sans-serif';
  c.fillText('V-05c: the creeps and bosses in 3D, next to their 2D sprites', 24, 48);
  const painter = createPainter(LIGHTING.normal);

  let y = 70;
  for (const sec of sections) {
    c.fillStyle = '#cfe6ff';
    c.font = '26px sans-serif';
    c.fillText(sec.title, 24, y + 36);
    y += 56;
    for (const row of sec.rows) {
      const cells = row.map((k) => cell(k, sec.scale(k)));
      const rowH = Math.max(...cells.map((x) => x.h));
      const gap = (WIDTH - cells.reduce((a, x) => a + x.w, 0)) / (row.length + 1);
      let x = gap;
      for (const [i, k] of row.entries()) {
        const s = sec.scale(k);
        const box = cells[i]!;
        c.fillStyle = css(RL.lane);
        c.fillRect(x, y, box.w, rowH);
        c.fillStyle = '#e6dac0';
        c.font = '22px sans-serif';
        const r = TUNING.creeps[k].radius;
        c.fillText(`${creepArt(k)!.name} · radius ${r} tile${TUNING.creeps[k].boss ? ' · boss' : ''}`, x + 10, y + 28);
        // The creep's position: where both stand (the 2D frame is centred on it, the 3D frame's feet are its feet).
        const art = creepArt(k)!;
        const ground = y + rowH - 16;
        const cx2 = x + 14 + (art.frames.body!.w * s) / 2;
        draw2d(c, k, cx2, ground - art.feet * s, s, painter);
        const L = CREEP_3D[k].match;
        let x3 = x + 14 + art.frames.body!.w * s + 16;
        for (const { f, left, right } of shown(k)) {
          // The frame box's feet on the ground, the frame as far right of the last as it reaches left.
          const feetX = x3 + left * s;
          if (TUNING.creeps[k].flying) draw2dShadow(c, k, feetX, ground, s, painter);
          draw3d(c, pairs.find((p) => p.kind === k)!.sheet, f, L.res, feetX - (L.box.ax / L.res) * s, ground - (L.box.ay / L.res) * s, s);
          x3 += (left + right) * s + 16;
        }
        x += box.w + gap;
      }
      y += rowH + 12;
    }
  }
  return canvas.toDataURL('image/png');
}

/** The 2D sprite at (cx, cy) (its frame's centre), drawn by its art file at scale s. */
function draw2d(c: CanvasRenderingContext2D, k: CreepKind, cx: number, cy: number, s: number, painter: ReturnType<typeof createPainter>): void {
  const art = creepArt(k)!;
  if (art.frames.shadow) draw2dShadow(c, k, cx, cy + art.feet * s, s, painter);
  c.save();
  c.translate(cx, cy);
  c.scale(s, s);
  art.frames.body!.draw(c, painter, RL);
  c.restore();
}

/** A flyer's shadow on the ground at (cx, gy). */
function draw2dShadow(c: CanvasRenderingContext2D, k: CreepKind, cx: number, gy: number, s: number, painter: ReturnType<typeof createPainter>): void {
  const shadow = creepArt(k)?.frames.shadow;
  if (!shadow) return;
  c.save();
  c.translate(cx, gy);
  c.scale(s, s);
  shadow.draw(c, painter, RL);
  c.restore();
}

/** A 3D frame: its box's top-left at (x, y), drawn at s px per world px from the sheet's res. */
function draw3d(c: CanvasRenderingContext2D, sheet: ImageBitmap, f: CreepCell, res: number, x: number, y: number, s: number): void {
  const k = s / res;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(sheet, f.x, f.y, f.w, f.h, x + f.dx * k, y + f.dy * k, f.w * k, f.h * k);
}

/**
 * The Ironhorn before and after (V-05c round 2, Han's note of 17 Oct 2026: the BlueDemon has ears, not horns): the 2D
 * sprite, then each model's stand, step, blow and Stomp (up, then down) at match size on a 412 × 839 phone with a 3×
 * screen, then both stands at twice that, from the sheets. `before`: the BlueDemon's sheet (a data URL) and layout.
 */
export async function drawIronhorn(before: { sheet: string; layout: CreepMatchLayout }): Promise<string> {
  const k: CreepKind = 'ironhorn';
  const bitmap = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
  const models = [
    { name: 'BlueDemon (V-05c, as merged): ears, no horns', L: before.layout, sheet: await bitmap(before.sheet) },
    { name: 'Demon (round 2): horns and trident in iron, the trident’s head gold, no halo', L: CREEP_3D[k].match, sheet: await bitmap(CREEP_SHEETS[k]) },
  ];
  const picks = (L: CreepMatchLayout): [string, CreepCell][] => [
    ['stand', L.frames.idle[0]!],
    ['step', L.frames.walk[2]!],
    ['blow', L.frames.attack!.at(-1)!],
    ['Stomp: up', L.frames.ability![0]!],
    ['Stomp: down', L.frames.ability!.at(-1)!],
  ];
  const s = (TILE_CSS / 32) * entityScales(TILE_CSS).creep * DPR;
  // How far a frame reaches left and right of the feet, up and down (world px).
  const reach = (L: CreepMatchLayout, f: CreepCell) => ({
    left: (L.box.ax - f.dx) / L.res,
    right: (f.dx + f.w - L.box.ax) / L.res,
    up: (L.box.ay - f.dy) / L.res,
    down: (f.dy + f.h - L.box.ay) / L.res,
  });
  const rowW = (L: CreepMatchLayout, scale: number) => picks(L).reduce((a, [, f]) => a + (reach(L, f).left + reach(L, f).right) * scale + 24, 24);
  const rowUp = (L: CreepMatchLayout, scale: number) => Math.max(...picks(L).map(([, f]) => reach(L, f).up)) * scale;
  const art = creepArt(k)!;
  const big = 2 * s;
  const width = Math.ceil(Math.max(WIDTH, ...models.map((m) => rowW(m.L, s) + 24)));
  const standW = models.map((m) => {
    const r = reach(m.L, m.L.frames.idle[0]!);
    return (r.left + r.right) * big;
  });
  const bigUp = Math.max(...models.map((m) => reach(m.L, m.L.frames.idle[0]!).up)) * big;
  const bigDown = Math.max(...models.map((m) => reach(m.L, m.L.frames.idle[0]!).down)) * big;
  const rows = [art.frames.body!.h * s + 60, ...models.map((m) => rowUp(m.L, s) + 90)];
  const height = Math.ceil(70 + 56 + rows.reduce((a, h) => a + h + 12, 0) + 56 + 40 + bigUp + bigDown + 24);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, width, height);
  c.fillStyle = '#e6dac0';
  c.font = 'bold 34px sans-serif';
  c.fillText('V-05c round 2: the Ironhorn, BlueDemon → Demon', 24, 48);
  const painter = createPainter(LIGHTING.normal);
  const label = (text: string, x: number, y: number) => {
    c.fillStyle = '#e6dac0';
    c.font = '22px sans-serif';
    c.fillText(text, x, y);
  };
  let y = 70;
  c.fillStyle = '#cfe6ff';
  c.font = '26px sans-serif';
  c.fillText('In a match: a 412 × 839 phone, 3× screen', 24, y + 36);
  y += 56;
  // The 2D sprite (the fallback until the sheet loads), then each model's frames on the lane.
  c.fillStyle = css(RL.lane);
  c.fillRect(24, y, width - 48, rows[0]!);
  label('2D (the fallback until the sheet is in)', 34, y + 28);
  draw2d(c, k, 34 + (art.frames.body!.w * s) / 2, y + rows[0]! - 16 - art.feet * s, s, painter);
  y += rows[0]! + 12;
  for (const [i, m] of models.entries()) {
    const h = rows[i + 1]!;
    c.fillStyle = css(RL.lane);
    c.fillRect(24, y, width - 48, h);
    label(m.name, 34, y + 28);
    const ground = y + h - 40;
    let x = 34;
    for (const [what, f] of picks(m.L)) {
      const r = reach(m.L, f);
      const feetX = x + r.left * s;
      draw3d(c, m.sheet, f, m.L.res, feetX - (m.L.box.ax / m.L.res) * s, ground - (m.L.box.ay / m.L.res) * s, s);
      c.fillStyle = '#e6dac0';
      c.font = '18px sans-serif';
      c.fillText(what, feetX - 20, ground + 30);
      x += (r.left + r.right) * s + 24;
    }
    y += h + 12;
  }
  c.fillStyle = '#cfe6ff';
  c.font = '26px sans-serif';
  c.fillText('Standing, at twice match size (from the sheets)', 24, y + 36);
  y += 56;
  c.fillStyle = css(RL.lane);
  c.fillRect(24, y, width - 48, 40 + bigUp + bigDown + 12);
  const gap = (width - 48 - standW.reduce((a, w) => a + w, 0)) / 3;
  let x = 24 + gap;
  for (const [i, m] of models.entries()) {
    const f = m.L.frames.idle[0]!;
    const r = reach(m.L, f);
    const ground = y + 40 + bigUp;
    draw3d(c, m.sheet, f, m.L.res, x + r.left * big - (m.L.box.ax / m.L.res) * big, ground - (m.L.box.ay / m.L.res) * big, big);
    label(i === 0 ? 'BlueDemon' : 'Demon', x, y + 28);
    x += standW[i]! + gap;
  }
  return canvas.toDataURL('image/png');
}
