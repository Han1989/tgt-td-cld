// The share card (docs/GAME_DESIGN.md "Daily run", docs/ART.md §14): a 1200 × 630 picture in the game's own look, drawn
// with Canvas 2D on a detached canvas (nothing from Pixi, nothing new: every piece already exists). The hero's stage
// poster (public/stage/<hero>-poster.webp, cached once the lobby showed it) cropped with the hero in the right third
// and darkened on the left for the text, the moon kept bright; the HUD's gold trim (render/art3d/ui.webp, V-07a) as a
// thin frame; the wordmark as the lobby draws it; the lines from share/text.ts; the link at the foot. Colours are
// Runelight tokens only. `drawCard` only draws (a stub canvas tests its layout); `renderCard` loads the pictures,
// draws and encodes the PNG.

import type { HeroKind } from '@tdt/protocol';
import { stageUrl } from '../lobby/stageBackdrop';
import { HERO_3D, type StageLayout } from '../render/art3d/layout';
import uiSheetUrl from '../render/art3d/ui.webp?url';
import { RL } from '../render/art/tokens';
import {
  CARD,
  cardLines,
  fontOf,
  layoutLines,
  layoutLink,
  LAYOUT,
  MOON,
  onCard,
  posterCrop,
  TITLE_FONT,
  type Measure,
  type PlacedLine,
  type ShareFace,
  type Tone,
} from './text';

/** The parts of a 2D context the card uses (a stub implements them in the tests). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'font'
  | 'fillStyle'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'textAlign'
  | 'textBaseline'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'clearRect'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'drawImage'
  | 'createLinearGradient'
  | 'createRadialGradient'
>;

/** A piece of a picture: the image and the rectangle in it, px. */
export interface Piece {
  image: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the card is drawn from: the hero's poster and its stage layout (null if it did not load), the gold trim. */
export interface CardArt {
  poster: { image: CanvasImageSource; stage: Pick<StageLayout, 'w' | 'h' | 'feetX' | 'figure'> } | null;
  trim: Piece | null;
}

/** `rgba()` of a token. */
function rgba(hex: number, a = 1): string {
  return `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${a})`;
}

const TONES: Record<Tone, string> = {
  moon: rgba(RL.moon),
  muted: rgba(RL.moon, 0.66),
  gold: rgba(RL.gold),
  rune: rgba(RL.rune),
};
const GLOW: Partial<Record<Tone, string>> = { gold: rgba(RL.gold, 0.5), rune: rgba(RL.rune, 0.6) };

/** The night over the poster: dark under the text column, clear from the hero on; darker at the foot for the link. */
function darken(ctx: Ctx2D): void {
  const side = ctx.createLinearGradient(0, 0, CARD.w, 0);
  side.addColorStop(0, rgba(RL.night, 0.84));
  side.addColorStop(0.36, rgba(RL.night, 0.72));
  side.addColorStop(0.56, rgba(RL.night, 0.32));
  side.addColorStop(0.68, rgba(RL.night, 0));
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, CARD.w, CARD.h);
  const foot = ctx.createLinearGradient(0, CARD.h - 170, 0, CARD.h);
  foot.addColorStop(0, rgba(RL.night, 0));
  foot.addColorStop(1, rgba(RL.night, 0.5));
  ctx.fillStyle = foot;
  ctx.fillRect(0, CARD.h - 170, CARD.w, 170);
}

/** The gold trim along one edge, tiled from the sheet's strip (`vertical`: down from (x, y), else right). */
function trimEdge(ctx: Ctx2D, trim: Piece, x: number, y: number, len: number, vertical: boolean): void {
  const t = LAYOUT.frame.width;
  const tile = (trim.w * t) / trim.h;
  ctx.save();
  if (vertical) {
    ctx.translate(x + t, y);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(x, y);
  }
  for (let at = 0; at < len; at += tile) {
    const w = Math.min(tile, len - at);
    ctx.drawImage(trim.image, trim.x, trim.y, (trim.w * w) / tile, trim.h, at, 0, w, t);
  }
  ctx.restore();
}

/** The frame: the HUD's gold trim inset from the edge (two gold lines on ink if the sheet did not load). */
function frame(ctx: Ctx2D, trim: Piece | null): void {
  const { inset: i, width: t } = LAYOUT.frame;
  const w = CARD.w - 2 * i;
  const h = CARD.h - 2 * i;
  if (!trim) {
    ctx.fillStyle = rgba(RL.ink, 0.9);
    for (const [x, y, rw, rh] of [[i, i, w, t], [i, i + h - t, w, t], [i, i, t, h], [i + w - t, i, t, h]] as const) ctx.fillRect(x, y, rw, rh);
    ctx.fillStyle = rgba(RL.gold);
    const g = t / 4;
    for (const [x, y, rw, rh] of [[i, i + g, w, g * 2], [i, i + h - t + g, w, g * 2], [i + g, i, g * 2, h], [i + w - t + g, i, g * 2, h]] as const) {
      ctx.fillRect(x, y, rw, rh);
    }
    return;
  }
  // The sides first, so the top and bottom lie over their ends.
  trimEdge(ctx, trim, i, i, h, true);
  trimEdge(ctx, trim, i + w - t, i, h, true);
  trimEdge(ctx, trim, i, i, w, false);
  trimEdge(ctx, trim, i, i + h - t, w, false);
}

/** Text with the UI's ink drop shadow, and first its glow when it has one. */
function text(ctx: Ctx2D, s: string, x: number, y: number, size: number, tone: Tone, glow: boolean): void {
  ctx.fillStyle = TONES[tone];
  if (glow && GLOW[tone]) {
    ctx.shadowColor = GLOW[tone]!;
    ctx.shadowBlur = Math.round(size * 0.2);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(s, x, y);
  }
  ctx.shadowColor = rgba(RL.ink, 0.95);
  ctx.shadowBlur = Math.max(2, Math.round(size * 0.06));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(2, Math.round(size * 0.05));
  ctx.fillText(s, x, y);
}

function drawLine(ctx: Ctx2D, line: PlacedLine): void {
  for (const r of line.runs) {
    ctx.font = fontOf(r, r.drawn);
    text(ctx, r.text, r.x, line.y, r.drawn, r.tone, !!r.glow);
  }
}

/** "Tower Defense" over a glowing "Together", centred on each other as the lobby's title is, at the column's top left. */
function wordmark(ctx: Ctx2D, measure: Measure): void {
  const { column, wordmark: m } = LAYOUT;
  const small = `700 ${m.small}px ${TITLE_FONT}`;
  const large = `700 ${m.large}px ${TITLE_FONT}`;
  const a = measure('Tower Defense', small);
  const b = measure('Together', large);
  const axis = column.x + Math.max(a, b) / 2;
  const y1 = m.top + Math.round(m.small * 0.74);
  const y2 = y1 + Math.round(m.small * 0.24) + m.gap + Math.round(m.large * 0.74);
  ctx.font = small;
  text(ctx, 'Tower Defense', axis - a / 2, y1, m.small, 'moon', false);
  ctx.font = large;
  text(ctx, 'Together', axis - b / 2, y2, m.large, 'rune', true);
}

/** Draws the whole card for `face` onto `ctx` (CARD px). `origin` is the page's own, for the link. */
export function drawCard(ctx: Ctx2D, face: ShareFace, origin: string, art: CardArt): void {
  const measure: Measure = (s, font) => {
    ctx.font = font;
    return ctx.measureText(s).width;
  };
  ctx.save();
  ctx.clearRect(0, 0, CARD.w, CARD.h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  darken(ctx);
  if (art.poster) {
    const crop = posterCrop(art.poster.stage);
    // The moon stays bright: a soft hole in the night where it and its halo are, before the poster goes under.
    const moon = onCard(crop, MOON.x, MOON.y);
    const r = MOON.r * crop.scale;
    const hole = ctx.createRadialGradient(moon.x, moon.y, r * 1.1, moon.x, moon.y, r * 3.4);
    hole.addColorStop(0, rgba(RL.night, 1));
    hole.addColorStop(1, rgba(RL.night, 0));
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = hole;
    ctx.fillRect(0, 0, CARD.w, CARD.h);
    // Under the night: the poster, then (for any gap) the sky.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(art.poster.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, CARD.w, CARD.h);
  }
  ctx.globalCompositeOperation = 'destination-over';
  const sky = ctx.createLinearGradient(0, 0, 0, CARD.h);
  sky.addColorStop(0, rgba(RL.sky));
  sky.addColorStop(0.55, rgba(RL.skyLow));
  sky.addColorStop(1, rgba(RL.mossDark));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CARD.w, CARD.h);
  ctx.globalCompositeOperation = 'source-over';

  frame(ctx, art.trim);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  wordmark(ctx, measure);
  for (const line of layoutLines(cardLines(face), measure)) drawLine(ctx, line);
  drawLine(ctx, layoutLink(origin, measure));
  ctx.restore();
}

/** An image from a URL, decoded (null if it fails: the card is drawn without it). */
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** The hero's poster and the gold trim, loaded (from the cache, once the lobby and the match have shown them). */
export async function loadCardArt(hero: HeroKind): Promise<CardArt> {
  const stage = HERO_3D[hero]?.stage ?? null;
  const [poster, sheet, layout] = await Promise.all([
    stage ? loadImage(stageUrl(stage, 'poster')) : Promise.resolve(null),
    loadImage(uiSheetUrl),
    import('../render/art3d/ui.json').then((m) => m.default.match).catch(() => null),
  ]);
  const strip = layout?.pieces.trim;
  return {
    poster: poster && stage ? { image: poster, stage } : null,
    trim: sheet && strip ? { image: sheet, x: strip.x, y: strip.y, w: strip.w, h: strip.h } : null,
  };
}

/** The card as a PNG. */
export async function renderCard(face: ShareFace, origin: string, art?: CardArt): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  drawCard(ctx, face, origin, art ?? (await loadCardArt(face.hero)));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The card did not encode'))), 'image/png'));
}
