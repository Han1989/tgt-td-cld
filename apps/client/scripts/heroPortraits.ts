// `npm run hero-portraits -w @tdt/client [-- --out DIR]` (q13, docs/ART.md §12 "The heroes' faces"): each hero's
// head and shoulders, cut from his own stage poster (public/stage/<hero>-poster.webp) against the empty clearing
// (clearing.webp) by the store covers' cut (heroCut.ts), on a clear background, square, the face centred and his
// silhouette piece (the Ranger's leaf peak, the Warden's helm, the Oracle's hood) inside the picture, into
// src/render/art/portraits/<hero>.webp (lossy with exact alpha, under 12 KB each) and portraits.json: each picture's
// size and where its eyes are (the centre of each glowing eye, as fractions of the picture), measured on the cut, for
// the hero buttons' eye glow (lobby/heroPicker.ts). Headless Chromium (Playwright's); about 10 s. Look at the pictures
// before committing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { CUT_JS } from './heroCut';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
/** `--check`: also writes `<hero>-check.png` (the cut at 3×, the eyes marked) beside the pictures. */
const check = args.includes('--check');
const out = outAt >= 0 ? resolve(args[outAt + 1]!) : join(root, 'src', 'render', 'art', 'portraits');

/** The picture's side in px: sharp in a 44 px button's medallion on a 3× phone (about 40 CSS px, 120 device px). */
const SIDE = 160;
/** The most a picture may weigh. */
const MAX_BYTES = 12 * 1024;

/** The Warden's lift (q17, docs/ART.md §12): his iron a step lighter, so he stands off the button as the others do. */
const LIFT_WARDEN: Lift = { gamma: 0.72, gain: 1.02 };

/**
 * Each hero's square on his poster (2400 × 900 px, the stage's video frame): the head and the tops of the shoulders,
 * the face centred, his silhouette piece inside. `eyes`: where to look for the two glowing eyes (a box on the poster),
 * so the hood's beads and the staff's crystal are not taken for them.
 */
const HEROES = {
  ranger: { square: { x: 1080, y: 296, side: 300 }, eyes: { x0: 1240, y0: 440, x1: 1320, y1: 500 } },
  // q17: his slate iron read as a dark shape on the slate button, so his cut alone is lifted (his poster untouched).
  warden: { square: { x: 1092, y: 316, side: 300 }, eyes: { x0: 1215, y0: 430, x1: 1300, y1: 475 }, lift: LIFT_WARDEN },
  arcanist: { square: { x: 1110, y: 320, side: 300 }, eyes: { x0: 1225, y0: 430, x1: 1310, y1: 485 } },
} as const;

type Kind = keyof typeof HEROES;

/** A hero's levels: each colour channel as (c / 255)^gamma, times gain (q17). */
interface Lift {
  gamma: number;
  gain: number;
}

const PAGE_JS = String.raw`
window.portrait = async (spec) => {
  const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const poster = await load(spec.poster);
  const clearing = await load(spec.clearing);
  const { square: q, eyes: e, side } = spec;
  // Cut a box a little larger than the square, so the cut's flood from the box's edge goes round the figure.
  const pad = 24;
  const box = { x0: q.x - pad, y0: q.y - pad, x1: q.x + q.side + pad, y1: Math.min(900, q.y + q.side + pad) };
  const { figure } = window.heroCut(poster, clearing, box);
  if (spec.lift) {
    const fg = figure.getContext('2d');
    const img = fg.getImageData(0, 0, figure.width, figure.height);
    const d = img.data;
    const { gamma, gain } = spec.lift;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] === 0) continue;
      for (let c = 0; c < 3; c++) d[k + c] = Math.min(255, Math.round(255 * gain * Math.pow(d[k + c] / 255, gamma)));
    }
    fg.putImageData(img, 0, 0);
  }
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // The shoulders fade out at the picture's foot, so the bust ends softly inside a round medallion.
  g.drawImage(figure, q.x - box.x0, q.y - box.y0, q.side, q.side, 0, 0, side, side);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, side * 0.78, 0, side);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, side, side);
  // The eyes: the brightest pixels of the figure in the eyes' box (within 85% of the brightest), split in two at the
  // widest gap between them across.
  const ew = e.x1 - e.x0, eh = e.y1 - e.y0;
  const fg = figure.getContext('2d').getImageData(e.x0 - box.x0, e.y0 - box.y0, ew, eh).data;
  const lum = (k) => 0.2126 * fg[k] + 0.7152 * fg[k + 1] + 0.0722 * fg[k + 2];
  let top = 0;
  for (let k = 0; k < fg.length; k += 4) if (fg[k + 3] >= 200) top = Math.max(top, lum(k));
  const pts = [];
  for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) {
    const k = (y * ew + x) * 4;
    if (fg[k + 3] >= 200 && lum(k) >= top * 0.85) pts.push([x, y]);
  }
  if (pts.length < 6) throw new Error('no eyes found: ' + pts.length + ' glowing pixels');
  const xs = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  let mid = xs[0], gap = -1;
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; mid = (xs[i] + xs[i - 1]) / 2; }
  const eye = (side0) => {
    const ps = pts.filter((p) => (side0 ? p[0] < mid : p[0] >= mid));
    if (!ps.length) throw new Error('one eye only');
    const x = ps.reduce((s, p) => s + p[0], 0) / ps.length + e.x0 + 0.5;
    const y = ps.reduce((s, p) => s + p[1], 0) / ps.length + e.y0 + 0.5;
    return { x: +((x - q.x) / q.side).toFixed(3), y: +((y - q.y) / q.side).toFixed(3), px: ps.length };
  };
  const eyes = [eye(true), eye(false)];
  // The silhouette piece inside: no opaque pixel on the picture's top edge, nor on its sides in the top 40% (the
  // shoulders, and the Oracle's staff beside her, may run off the sides lower down: the medallion is round there).
  const a = g.getImageData(0, 0, side, side).data;
  let edge = 0;
  for (let i = 0; i < side; i++) if (a[i * 4 + 3] > 24) edge++;
  for (let y = 0; y < side * 0.4; y++) for (const x of [0, side - 1]) if (a[(y * side + x) * 4 + 3] > 24) edge++;
  const webp = (q) => c.toDataURL('image/webp', q);
  // A check picture: the cut at 3× on the clearing's dark, the eyes' box and the eyes marked.
  const k = document.createElement('canvas');
  k.width = k.height = side * 3;
  const kg = k.getContext('2d');
  kg.fillStyle = '#20302a';
  kg.fillRect(0, 0, side * 3, side * 3);
  kg.drawImage(c, 0, 0, side * 3, side * 3);
  kg.strokeStyle = '#ff00ff';
  const s3 = (side * 3) / q.side;
  kg.strokeRect((e.x0 - q.x) * s3, (e.y0 - q.y) * s3, ew * s3, eh * s3);
  for (const p of eyes) { kg.beginPath(); kg.arc(p.x * side * 3, p.y * side * 3, 6, 0, 7); kg.stroke(); }
  return { check: k.toDataURL('image/png'), eyes, edge, webp: [0.9, 0.85, 0.8, 0.75, 0.7].map((q) => ({ q, url: webp(q) })) };
};
`;

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const stage = join(root, 'public', 'stage');
  const data = (file: string) => `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const layout: Record<string, unknown> = {};
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addScriptTag({ content: CUT_JS });
    await page.addScriptTag({ content: PAGE_JS });
    for (const kind of Object.keys(HEROES) as Kind[]) {
      const h = HEROES[kind];
      const res = (await page.evaluate((spec) => (window as any).portrait(spec), {
        poster: data(join(stage, `${kind}-poster.webp`)),
        clearing: data(join(stage, 'clearing.webp')),
        square: h.square,
        eyes: h.eyes,
        lift: 'lift' in h ? h.lift : null,
        side: SIDE,
      })) as { check: string; eyes: { x: number; y: number; px: number }[]; edge: number; webp: { q: number; url: string }[] };
      if (check) writeFileSync(join(out, `${kind}-check.png`), Buffer.from(res.check.split(',')[1]!, 'base64'));
      if (res.edge > 0) throw new Error(`${kind}: the silhouette touches the picture's edge (${res.edge} px): widen its square`);
      // The best quality under the limit.
      const pick = res.webp.map((w) => ({ q: w.q, bytes: Buffer.from(w.url.split(',')[1]!, 'base64') })).find((w) => w.bytes.length <= MAX_BYTES);
      if (!pick) throw new Error(`${kind}: over ${MAX_BYTES} bytes at every quality`);
      writeFileSync(join(out, `${kind}.webp`), pick.bytes);
      layout[kind] = { file: `${kind}.webp`, side: SIDE, eyes: res.eyes.map(({ x, y }) => ({ x, y })) };
      console.log(`${kind}: ${pick.bytes.length} bytes at q${pick.q}, eyes ${res.eyes.map((e) => `${e.x},${e.y} (${e.px} px)`).join(' · ')}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, 'portraits.json'), `${JSON.stringify(layout, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
