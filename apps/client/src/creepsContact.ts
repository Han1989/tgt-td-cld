// The creeps' contact sheet, page side (dev only: scripts/creepsContact.ts imports it into a page of Vite's dev
// server; the game never imports it, so no build carries it): every creep kind's 2D
// sprite, drawn by its own art file and the painter, next to its 3D stand and step from the shipped sheet, on the lane,
// at the size a 412 × 839 phone draws them in a match on a 3× screen (V-04's creep scale), and again close up at the
// 3D sheet's own pixels. Returns the picture as a PNG data URL. `drawIronhorn` (V-05c round 2) puts the Ironhorn as
// V-05c merged it (the BlueDemon) next to today's (the Demon); `drawHost` (V-06i) the four ground creeps from Meshy next
// to the pack creeps they replaced, and a match screenshot; `drawHost2` (V-06j) the Wisp, the Hatchling and the bosses
// the same way, and `drawFamily` the three heroes and all nine kinds at phone size, drawn by the match's own rigs.

import type { CreepKind } from '@tdt/protocol';
import { TUNING } from '@tdt/sim';
import './render/art/load';
import { createPainter } from './render/art/paint';
import { creepArt, heroArt } from './render/art/registry';
import { LIGHTING, RL } from './render/art/tokens';
import { CREEP_3D } from './render/art3d/creepData';
import type { CreepCell, CreepMatchLayout, CreepState } from './render/art3d/creeps';
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

/**
 * V-06i, the Spire's host, batch 1: the Grunt, the Archer, the Runner and the Brute generated in Meshy next to the pack
 * creeps they replace. Each kind's stand, step, blow and death close up at the sheets' own pixels (4 per world px), the
 * pack's row over Meshy's; then a match on a 412 × 839 phone at 3× (`match`, a screenshot) at 1:3 beside a crop of it at
 * the screen's own pixels. `before`: the pack sheets (data URLs) and layouts.
 */
export async function drawHost(before: Record<string, { sheet: string; layout: CreepMatchLayout }>, match: string): Promise<string> {
  const kinds: CreepKind[] = ['grunt', 'archer', 'runner', 'brute'];
  const bitmap = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
  const rows: { kind: CreepKind; label: string; L: CreepMatchLayout; sheet: ImageBitmap }[] = [];
  for (const k of kinds) {
    rows.push({ kind: k, label: 'pack (V-05c)', L: before[k]!.layout, sheet: await bitmap(before[k]!.sheet) });
    rows.push({ kind: k, label: 'Meshy (V-06i)', L: CREEP_3D[k].match, sheet: await bitmap(CREEP_SHEETS[k]) });
  }
  const picks = (L: CreepMatchLayout): [string, CreepCell][] => [
    ['stand', L.frames.idle[0]!],
    ['step', L.frames.walk[2]!],
    ['blow', L.frames.attack!.at(-1)!],
    ['death', L.frames.death.at(-1)!],
  ];
  // How far a frame reaches left and right of the feet, up and down (sheet px).
  const reach = (L: CreepMatchLayout, f: CreepCell) => ({
    left: L.box.ax - f.dx,
    right: f.dx + f.w - L.box.ax,
    up: L.box.ay - f.dy,
    down: f.dy + f.h - L.box.ay,
  });
  const LABEL = 190;
  const rowH = rows.map((r) => Math.max(...picks(r.L).map(([, f]) => reach(r.L, f).up)) + Math.max(...picks(r.L).map(([, f]) => reach(r.L, f).down)) + 44);
  const rowW = rows.map((r) => LABEL + picks(r.L).reduce((a, [, f]) => a + reach(r.L, f).left + reach(r.L, f).right + 20, 0));
  const shot = await bitmap(match);
  const width = Math.max(WIDTH, ...rowW.map((w) => w + 48));
  const MATCH_H = 839;
  const height = Math.ceil(70 + 56 + rowH.reduce((a, h) => a + h + 8, 0) + kinds.length * 10 + 56 + MATCH_H + 40);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, width, height);
  c.fillStyle = '#e6dac0';
  c.font = 'bold 32px sans-serif';
  c.fillText('V-06i: the Spire’s host, batch 1 (Meshy) next to the pack creeps', 24, 48);
  let y = 70;
  c.fillStyle = '#cfe6ff';
  c.font = '24px sans-serif';
  c.fillText('Close up at the sheets’ own pixels (4 per world px): stand · step · blow · death', 24, y + 36);
  y += 56;
  for (const [i, r] of rows.entries()) {
    const h = rowH[i]!;
    c.fillStyle = css(RL.lane);
    c.fillRect(24, y, width - 48, h);
    c.fillStyle = '#e6dac0';
    c.font = 'bold 22px sans-serif';
    c.fillText(creepArt(r.kind)!.name, 34, y + 30);
    c.font = '20px sans-serif';
    c.fillText(r.label, 34, y + 56);
    const ground = y + h - 22 - Math.max(...picks(r.L).map(([, f]) => reach(r.L, f).down));
    let x = 24 + LABEL;
    for (const [what, f] of picks(r.L)) {
      const re = reach(r.L, f);
      const feetX = x + re.left;
      draw3d(c, r.sheet, f, r.L.res, feetX - r.L.box.ax, ground - r.L.box.ay, r.L.res);
      c.fillStyle = 'rgba(230, 218, 192, 0.8)';
      c.font = '16px sans-serif';
      c.fillText(what, x, y + h - 6);
      x += re.left + re.right + 20;
    }
    y += h + (i % 2 ? 18 : 8);
  }
  c.fillStyle = '#cfe6ff';
  c.font = '24px sans-serif';
  c.fillText('In a match: 412 × 839 at 3×, wave 12 (Full), all four on the lanes, the Ranger at the fork; a crop at 3×', 24, y + 36);
  y += 56;
  // The whole screen at 1:3 (its CSS size), and a crop of it at the screen's own pixels round the mid lane.
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(shot, 24, y, 412, MATCH_H);
  const cropW = width - 48 - 412 - 24;
  const cx = Math.round(shot.width / 2 - cropW / 2);
  const cy = 450; // under the top bar and the Air chip
  c.drawImage(shot, cx, cy, cropW, MATCH_H, 24 + 412 + 24, y, cropW, MATCH_H);
  c.strokeStyle = '#cfe6ff';
  c.lineWidth = 2;
  c.strokeRect(24 + cx / 3, y + cy / 3, cropW / 3, MATCH_H / 3);
  return canvas.toDataURL('image/png');
}

/** The frames a row shows: the stand, two steps, the blow, the flinch, the fall and a boss's ability (all of them). */
function hostPicks(L: CreepMatchLayout, all: boolean): [string, CreepCell][] {
  const walk = L.frames.walk;
  const out: [string, CreepCell][] = [
    ['stand', L.frames.idle[0]!],
    ['step', walk[0]!],
    ['step', walk[Math.floor(walk.length / 2)]!],
  ];
  if (L.frames.attack) out.push(['blow', L.frames.attack[Math.min(L.frames.attack.length - 1, 1)]!]);
  if (all) out.push(['flinch', L.frames.hit[0]!]);
  out.push(['death', L.frames.death.at(-1)!]);
  const ability = L.frames.ability ?? [];
  if (all) ability.forEach((f, i) => out.push([`ability ${i + 1}`, f]));
  else if (ability.length) out.push(['ability', ability[1] ?? ability[0]!]);
  return out;
}

/**
 * V-06j, the Spire's host, batch 2: the Wisp, the Hatchling and the three bosses generated in Meshy next to the pack
 * creeps they replace. Each kind's frames at 4 px per world px (the bosses' 3 px sheets drawn at 4), the pack's row over
 * Meshy's: the stand, two steps, the blow, the flinch, the fall and a boss's ability frames (the Ironhorn's Stomp, the
 * Matriarch's Hatch, the Shardback's hide shift), and the Shardback again in its Ether hide (its `hide` cells lit as
 * the rig lights them: violet, added at 0.85). Then a match on a 412 × 839 phone at 3× (`match`, a screenshot: wave 10
 * of Full, the Ironhorn's) at 1:3 beside a crop of it at the screen's own pixels.
 */
export async function drawHost2(before: Record<string, { sheet: string; layout: CreepMatchLayout }>, match: string): Promise<string> {
  const kinds: CreepKind[] = ['wisp', 'hatchling', 'ironhorn', 'matriarch', 'shardback'];
  const bitmap = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
  type Row = { kind: CreepKind; label: string; L: CreepMatchLayout; sheet: ImageBitmap; ether?: boolean; all: boolean };
  const rows: Row[] = [];
  for (const k of kinds) {
    rows.push({ kind: k, label: 'pack (V-05c)', L: before[k]!.layout, sheet: await bitmap(before[k]!.sheet), all: false });
    const sheet = await bitmap(CREEP_SHEETS[k]);
    rows.push({ kind: k, label: 'Meshy (V-06j)', L: CREEP_3D[k].match, sheet, all: true });
    if (k === 'shardback') rows.push({ kind: k, label: 'Meshy, Ether hide', L: CREEP_3D[k].match, sheet, ether: true, all: true });
  }
  const S = 4; // drawn px per world px
  const reach = (L: CreepMatchLayout, f: CreepCell) => {
    const k = S / L.res;
    return { left: (L.box.ax - f.dx) * k, right: (f.dx + f.w - L.box.ax) * k, up: (L.box.ay - f.dy) * k, down: (f.dy + f.h - L.box.ay) * k };
  };
  const LABEL = 200;
  const MAX_W = 2400;
  // Each row's frames, wrapped into lines no wider than MAX_W.
  const lines = rows.map((r) => {
    const out: [string, CreepCell][][] = [[]];
    let w = LABEL;
    for (const p of hostPicks(r.L, r.all)) {
      const re = reach(r.L, p[1]);
      const fw = re.left + re.right + 20;
      if (w + fw > MAX_W && out.at(-1)!.length) {
        out.push([]);
        w = LABEL;
      }
      out.at(-1)!.push(p);
      w += fw;
    }
    return out;
  });
  const lineH = (r: Row, line: [string, CreepCell][]) =>
    Math.max(...line.map(([, f]) => reach(r.L, f).up)) + Math.max(...line.map(([, f]) => reach(r.L, f).down)) + 40;
  const lineW = (r: Row, line: [string, CreepCell][]) => LABEL + line.reduce((a, [, f]) => a + reach(r.L, f).left + reach(r.L, f).right + 20, 0);
  const width = Math.ceil(Math.max(WIDTH, ...rows.flatMap((r, i) => lines[i]!.map((l) => lineW(r, l) + 48))));
  const shot = await bitmap(match);
  const MATCH_H = 839;
  const rowsH = rows.reduce((a, r, i) => a + lines[i]!.reduce((b, l) => b + lineH(r, l) + 4, 0) + 10, 0);
  const height = Math.ceil(70 + 56 + rowsH + kinds.length * 12 + 56 + MATCH_H + 40);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, width, height);
  c.fillStyle = '#e6dac0';
  c.font = 'bold 32px sans-serif';
  c.fillText('V-06j: the Spire’s host, batch 2 (Meshy) next to the pack creeps', 24, 48);
  let y = 70;
  c.fillStyle = '#cfe6ff';
  c.font = '24px sans-serif';
  c.fillText('At 4 px per world px (the bosses’ 3 px sheets drawn at 4): stand · steps · blow · flinch · death · ability', 24, y + 36);
  y += 56;
  // The Ether hide as the rig shows it: the spines' coverage, tinted violet, added over the frame.
  const tinted = document.createElement('canvas');
  for (const [i, r] of rows.entries()) {
    for (const [j, line] of lines[i]!.entries()) {
      const h = lineH(r, line);
      c.fillStyle = css(RL.lane);
      c.fillRect(24, y, width - 48, h);
      if (j === 0) {
        c.fillStyle = '#e6dac0';
        c.font = 'bold 22px sans-serif';
        c.fillText(creepArt(r.kind)!.name, 34, y + 30);
        c.font = '20px sans-serif';
        c.fillText(r.label, 34, y + 56);
      }
      const ground = y + h - 20 - Math.max(...line.map(([, f]) => reach(r.L, f).down));
      let x = 24 + LABEL;
      for (const [what, f] of line) {
        const re = reach(r.L, f);
        const feetX = x + re.left;
        const k = S / r.L.res;
        c.imageSmoothingEnabled = k !== 1;
        c.imageSmoothingQuality = 'high';
        draw3d(c, r.sheet, f, r.L.res, feetX - r.L.box.ax * k, ground - r.L.box.ay * k, S);
        const stateOf = (Object.entries(r.L.frames) as [CreepState, CreepCell[]][]).find(([, list]) => list.includes(f));
        const hide = r.ether && stateOf ? r.L.hide?.[stateOf[0]]?.[stateOf[1].indexOf(f)] : undefined;
        if (hide && hide.w > 0) {
          tinted.width = hide.w;
          tinted.height = hide.h;
          const t = tinted.getContext('2d')!;
          t.clearRect(0, 0, hide.w, hide.h);
          t.drawImage(r.sheet, hide.x, hide.y, hide.w, hide.h, 0, 0, hide.w, hide.h);
          t.globalCompositeOperation = 'source-in';
          t.fillStyle = css(RL.hideEther);
          t.fillRect(0, 0, hide.w, hide.h);
          t.globalCompositeOperation = 'source-over';
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.85;
          c.drawImage(tinted, feetX - r.L.box.ax * k + hide.dx * k, ground - r.L.box.ay * k + hide.dy * k, hide.w * k, hide.h * k);
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        }
        c.fillStyle = 'rgba(230, 218, 192, 0.8)';
        c.font = '16px sans-serif';
        c.fillText(what, x, y + h - 4);
        x += re.left + re.right + 20;
      }
      y += h + 4;
    }
    y += r.kind !== rows[i + 1]?.kind ? 22 : 6;
  }
  c.fillStyle = '#cfe6ff';
  c.font = '24px sans-serif';
  c.fillText('In a match: 412 × 839 at 3×, wave 10 of Full (the Ironhorn’s), the Ranger at the fork; a crop at 3×', 24, y + 36);
  y += 56;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(shot, 24, y, 412, MATCH_H);
  const cropW = Math.min(shot.width, width - 48 - 412 - 24);
  const ih = await ironhornAt(shot);
  const cx = Math.round(Math.min(shot.width - cropW, Math.max(0, ih.x - cropW / 2)));
  const cy = Math.round(Math.min(shot.height - MATCH_H, Math.max(0, ih.y - MATCH_H / 2)));
  c.drawImage(shot, cx, cy, cropW, MATCH_H, 24 + 412 + 24, y, cropW, MATCH_H);
  c.strokeStyle = '#cfe6ff';
  c.lineWidth = 2;
  c.strokeRect(24 + cx / 3, y + cy / 3, cropW / 3, MATCH_H / 3);
  return canvas.toDataURL('image/png');
}

/** Where the crop is centred: the screenshot's `ironhorn` point if the script passed one (its URL hash), else the middle. */
async function ironhornAt(shot: ImageBitmap): Promise<{ x: number; y: number }> {
  const at = (window as unknown as { __ironhorn?: { x: number; y: number } }).__ironhorn;
  return at ?? { x: shot.width / 2, y: shot.height / 2 };
}

/**
 * V-06j, the final family: the three heroes and the nine kinds of the Spire's host standing on the lane at the size a
 * 412 × 839 phone draws them in a match, at the screen's own pixels (3×), each drawn by the match's own rig from its
 * sheet (Hero3DRig, Creep3DRig) at V-04's scales (the Wisp at its flyer's size), with no ring under the heroes. The
 * heroes face the host.
 */
export async function drawFamily(): Promise<string> {
  const { Application, Container } = await import('pixi.js');
  const { ArtKit } = await import('./render/art/kit');
  const { creepRig3d, heroRig3d, loadCreepSheets, loadHeroSheets } = await import('./render/art3d');
  const { HERO_KINDS, CREEP_KINDS } = await import('@tdt/protocol');
  await loadHeroSheets();
  await loadCreepSheets();
  const kit = new ArtKit('normal');
  const scales = entityScales(TILE_CSS);
  const perWorld = (TILE_CSS / 32) * DPR;
  const order: CreepKind[] = ['grunt', 'archer', 'runner', 'brute', 'wisp', 'hatchling', 'ironhorn', 'matriarch', 'shardback'];
  if (order.length !== CREEP_KINDS.length) throw new Error('a creep kind is missing from the family');
  const figures: { view: InstanceType<typeof Container>; name: string }[] = [];
  for (const kind of HERO_KINDS) {
    const rig = heroRig3d(kind, kit, false);
    if (!rig) throw new Error(`no 3D hero ${kind}`);
    const view = new Container();
    view.addChild(rig.body);
    for (let t = 0; t < 4; t++) rig.update({ x: 0, y: 0, facing: 0, stunned: false }, 1000 + t * 16, 16);
    view.scale.set(scales.hero * perWorld);
    figures.push({ view, name: heroArt(kind)?.name ?? kind });
  }
  for (const kind of order) {
    const rig = creepRig3d(kind, kit);
    if (!rig) throw new Error(`no 3D creep ${kind}`);
    const view = new Container();
    if (rig.shadow) view.addChild(rig.shadow);
    view.addChild(rig.body, rig.flash);
    rig.reset(-1);
    rig.update(0, 3, true, 1000, 0);
    rig.update(0, 3, true, 1016, 0);
    view.scale.set(scales.creep * perWorld * flyerDrawScale(TUNING.creeps[kind].flying));
    figures.push({ view, name: creepArt(kind)!.name });
  }
  const GAP = 36;
  const bounds = figures.map((f) => f.view.getBounds());
  const up = Math.max(...bounds.map((b) => -b.y));
  const down = Math.max(...bounds.map((b) => b.y + b.height));
  const width = Math.ceil(bounds.reduce((a, b) => a + b.width + GAP, GAP));
  const top = 70;
  const bandH = Math.ceil(up + down + 60);
  const height = top + bandH + 40;
  const stage = new Container();
  let x = GAP;
  const ground = top + 30 + up;
  const labels: [string, number][] = [];
  for (const [i, f] of figures.entries()) {
    const b = bounds[i]!;
    f.view.position.set(x - b.x, ground);
    stage.addChild(f.view);
    labels.push([f.name, x + b.width / 2]);
    x += b.width + GAP;
  }
  const app = new Application();
  await app.init({ width, height, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resolution: 1 });
  app.stage.addChild(stage);
  app.render();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = css(RL.ink);
  c.fillRect(0, 0, width, height);
  c.fillStyle = css(RL.lane);
  c.fillRect(0, top, width, bandH);
  c.drawImage(app.canvas, 0, 0);
  c.fillStyle = '#e6dac0';
  c.font = 'bold 30px sans-serif';
  c.fillText('V-06j: the family at phone size — the three heroes and the Spire’s host (412 × 839, 3× screen pixels)', 24, 46);
  c.font = '20px sans-serif';
  c.textAlign = 'center';
  for (const [name, cx] of labels) c.fillText(name, cx, height - 14);
  app.destroy();
  return canvas.toDataURL('image/png');
}
