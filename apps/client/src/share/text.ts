// What the share card says and where it goes (docs/GAME_DESIGN.md "Daily run", "The share card"): the lines of a
// posted Daily run's card or an Endless run's, the text and link handed to the share sheet, the file's name, where the
// hero's stage poster is cropped, and how each line is shrunk until it fits its column. Pure, so it is unit tested as
// daily/text.ts is; share/card.ts draws it, share/share.ts hands it over.
//
// Nothing personal beyond what the public board already shows: the nickname the player posted under, the rank, the
// hero. Never a visitor id, the data key or anything from the age answer.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { TICK_RATE } from '@tdt/sim';
import type { EndlessRun } from '../endless/best';
import { HERO_INFO } from '../heroInfo';
import type { StageLayout } from '../render/art3d/layout';
import { dayLabel, topShare, type PostResult, type RunFace } from '../daily/text';

/** The card in px: Open Graph's 1200 × 630, the link card's size (docs/ART.md §14). */
export const CARD = { w: 1200, h: 630 } as const;

/** The channel a shared card's link counts under (analytics/channel.ts). */
export const SHARE_TAG = 'share';

/** The page's font stacks, as style.css has them (`--title-font`, and the body's): system fonts, nothing downloaded. */
export const TITLE_FONT = "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
export const BODY_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** A posted Daily run: the run that holds the player's place on today's board (their best today). */
export interface DailyFace {
  kind: 'daily';
  /** `YYYY-MM-DD`, the board's day. */
  day: string;
  rank: number;
  total: number;
  run: RunFace;
  /** The nickname as the board shows it. */
  name: string;
  hero: HeroKind;
}

/** An Endless run that fell. */
export interface EndlessFace {
  kind: 'endless';
  wave: number;
  /** Match time, seconds. */
  seconds: number;
  /** A better wave this browser holds for this hero (null: none, or this run is the best). */
  best: number | null;
  hero: HeroKind;
}

export type ShareFace = DailyFace | EndlessFace;

const isHero = (h: string): h is HeroKind => (HERO_KINDS as readonly string[]).includes(h);

/**
 * The card of a post's answer: the rank and the run behind it (the best today, which is what the board ranks), the
 * player's row's name (the board may have changed what was typed), the best run's hero (else `hero`, the one played).
 */
export function dailyFace(result: Pick<PostResult, 'day' | 'rank' | 'total' | 'best' | 'rows'>, name: string, hero: HeroKind): DailyFace {
  const b = result.best;
  return {
    kind: 'daily',
    day: result.day,
    rank: result.rank,
    total: result.total,
    run: { heart: b.heart, wave: b.wave, ticks: b.ticks },
    name: result.rows.find((r) => r.mine)?.name ?? name,
    hero: isHero(b.hero) ? b.hero : hero,
  };
}

/** The card of an Endless run that fell on `run.wave` after `seconds`. */
export function endlessFace(run: EndlessRun, seconds: number, hero: HeroKind): EndlessFace {
  const best = !run.isNew && run.best > run.wave ? run.best : null;
  return { kind: 'endless', wave: run.wave, seconds, best, hero };
}

/** 9999 → "9,999". */
export function groupDigits(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `2026-10-24` → "24 Oct 2026". */
export function fullDay(day: string): string {
  return `${dayLabel(day)} ${day.slice(0, 4)}`;
}

/** Match time: "9:41", or "1:02:07" past an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
  return `${Math.floor(s / 60)}:${two(s % 60)}`;
}

/** The link a shared card carries: this page's own origin (a preview deploy writes its own), tagged `?src=share`. */
export function shareUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/?src=${SHARE_TAG}`;
}

/** The link as the card prints it, without its scheme: "tgt-td-cld.vercel.app/?src=share". */
export function linkLabel(origin: string): string {
  return shareUrl(origin).replace(/^[a-z]+:\/\//i, '');
}

/** The words handed to the share sheet with the card and the link. */
export function shareText(face: ShareFace): string {
  if (face.kind === 'endless') return `I held out to wave ${groupDigits(face.wave)} in Endless. How far can you get?`;
  return `I finished #${groupDigits(face.rank)} of ${groupDigits(face.total)} in today's Daily run of Tower Defense Together. Beat me:`;
}

/** The PNG's name: `tdt-daily-2026-10-24-rank-14.png`, `tdt-endless-warden-wave-46.png`. */
export function cardFileName(face: ShareFace): string {
  if (face.kind === 'endless') return `tdt-endless-${face.hero}-wave-${face.wave}.png`;
  return `tdt-daily-${face.day}-rank-${face.rank}.png`;
}

// ---------------------------------------------------------------------------------------------------------------
// The lines
// ---------------------------------------------------------------------------------------------------------------

/** How a piece of text is drawn: its colour (share/card.ts maps tones to Runelight tokens), font and glow. */
export type Tone = 'moon' | 'muted' | 'gold' | 'rune';

export interface Run {
  text: string;
  /** Size before any shrinking, px. */
  size: number;
  font: 'title' | 'body';
  weight: 400 | 700;
  tone: Tone;
  /** A soft glow in its own colour (the rank, the wave). */
  glow?: boolean;
}

/** One line of the card: runs on one baseline, shrunk together. `gap` is the space over the line's capitals, px. */
export interface Line {
  id: 'eyebrow' | 'rank' | 'lead' | 'wave' | 'under' | 'run' | 'best' | 'who' | 'link';
  runs: Run[];
  gap: number;
}

const run = (text: string, size: number, tone: Tone, font: Run['font'] = 'body', weight: Run['weight'] = 700, glow = false): Run => ({
  text,
  size,
  font,
  weight,
  tone,
  ...(glow ? { glow } : {}),
});

/** "82 Heart · 9:41" for a win, "Fell on wave 12 · 7:03" for a run that fell. */
export function dailyRunLine(r: RunFace): string {
  const time = clock(r.ticks / TICK_RATE);
  return r.heart > 0 ? `${r.heart} Heart · ${time}` : `Fell on wave ${r.wave} · ${time}`;
}

/** The card's lines, top to bottom (the wordmark above them and the link under them are drawn on their own). */
export function cardLines(face: ShareFace): Line[] {
  const hero = HERO_INFO[face.hero].name;
  if (face.kind === 'endless') {
    const lines: Line[] = [
      { id: 'eyebrow', gap: 0, runs: [run('Endless', 32, 'gold', 'title')] },
      { id: 'lead', gap: 20, runs: [run('Fallen on wave', 52, 'moon', 'title')] },
      { id: 'wave', gap: 18, runs: [run(groupDigits(face.wave), 150, 'gold', 'title', 700, true)] },
      { id: 'run', gap: 26, runs: [run(`Held out ${clock(face.seconds)}`, 38, 'moon')] },
    ];
    if (face.best !== null) lines.push({ id: 'best', gap: 16, runs: [run(`Best: wave ${groupDigits(face.best)}`, 34, 'gold')] });
    lines.push({ id: 'who', gap: 18, runs: [run(hero, 34, 'muted')] });
    return lines;
  }
  const share = topShare(face.rank, face.total);
  const lines: Line[] = [
    { id: 'eyebrow', gap: 0, runs: [run(`Daily run · ${fullDay(face.day)}`, 32, 'gold', 'title')] },
    {
      id: 'rank',
      gap: 22,
      runs: [run(`#${groupDigits(face.rank)}`, 150, 'gold', 'title', 700, true), run(` of ${groupDigits(face.total)}`, 54, 'moon', 'title')],
    },
  ];
  if (share) lines.push({ id: 'under', gap: 16, runs: [run(share, 40, 'rune')] });
  lines.push({ id: 'run', gap: 24, runs: [run(dailyRunLine(face.run), 40, 'moon')] });
  lines.push({ id: 'who', gap: 18, runs: [run(face.name, 34, 'moon'), run(` · ${hero}`, 34, 'muted', 'body', 400)] });
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------------------------------------------

/**
 * Where things go on the card, px. The text column on the darkened left (the hero stands in the right third); the
 * wordmark at its top, the link at its foot; the frame (the HUD's gold trim) `frame.inset` in from the edge.
 */
export const LAYOUT = {
  frame: { inset: 16, width: 8 },
  /** The text column's left edge and its width (it ends before the hero's poster pose begins, about x 780). */
  column: { x: 72, w: 600 },
  /** The wordmark: "Tower Defense" over "Together", centred on each other as the lobby draws them. */
  wordmark: { top: 54, small: 30, large: 48, gap: 6 },
  /** The lines are centred between the wordmark's foot and the link's top. */
  block: { top: 160, bottom: 548 },
  link: { baseline: CARD.h - 48, size: 24, w: 600 },
} as const;

/** How wide a text is at a CSS font (`ctx.font`): `ctx.measureText(text).width` in the browser. */
export type Measure = (text: string, font: string) => number;

/** The CSS font of a run at `size`. */
export function fontOf(r: Pick<Run, 'font' | 'weight'>, size: number): string {
  return `${r.weight} ${size}px ${r.font === 'title' ? TITLE_FONT : BODY_FONT}`;
}

export interface PlacedRun extends Run {
  /** The size it is drawn at (≤ `size`), px. */
  drawn: number;
  x: number;
  width: number;
}

export interface PlacedLine {
  id: Line['id'];
  runs: PlacedRun[];
  /** Baseline, px. */
  y: number;
}

/** Capitals and digits reach about this far over the baseline, and descenders this far under it, per px of size. */
const ASCENT = 0.74;
const DESCENT = 0.24;

/**
 * The runs of one line at a common scale that fits `width` (their sizes shrunk together, whole px), at most `cap` of
 * their own sizes.
 */
export function fitRuns(runs: Run[], width: number, measure: Measure, cap = 1): PlacedRun[] {
  const at = (k: number) => {
    let x = 0;
    return runs.map((r) => {
      const drawn = Math.max(1, Math.floor(r.size * k));
      const w = measure(r.text, fontOf(r, drawn));
      const placed = { ...r, drawn, x, width: w };
      x += w;
      return placed;
    });
  };
  const total = (p: PlacedRun[]) => p.reduce((s, r) => s + r.width, 0);
  let placed = at(cap);
  const natural = total(placed);
  if (natural <= width) return placed;
  let k = (cap * width) / natural;
  placed = at(k);
  // Whole px and kerning make widths only roughly linear in the size: step down a px of the largest run until it fits.
  const largest = Math.max(...runs.map((r) => r.size));
  while (total(placed) > width && largest * k > 1) {
    k -= 1 / largest;
    placed = at(k);
  }
  return placed;
}

const drawnSize = (runs: PlacedRun[]) => Math.max(...runs.map((r) => r.drawn));

/**
 * Every line fitted to the column and stacked, the block centred between the wordmark and the link; a block taller
 * than that room (Endless with a best line) shrinks as a whole, its gaps too.
 */
export function layoutLines(lines: Line[], measure: Measure): PlacedLine[] {
  const { column, block } = LAYOUT;
  const room = block.bottom - block.top;
  const height = (fits: PlacedRun[][], k: number) =>
    fits.reduce((h, runs, i) => h + (i === 0 ? 0 : lines[i]!.gap * k) + (ASCENT + DESCENT) * drawnSize(runs), 0);
  let fits = lines.map((line) => fitRuns(line.runs, column.w, measure));
  let k = 1;
  const need = height(fits, 1);
  if (need > room) {
    k = room / need;
    fits = lines.map((line, i) => {
      const own = drawnSize(fits[i]!) / Math.max(...line.runs.map((r) => r.size));
      return fitRuns(line.runs, column.w, measure, own * k);
    });
  }
  let y = 0;
  let top = 0;
  let bottom = 0;
  const placed = lines.map((line, i) => {
    const runs = fits[i]!;
    const size = drawnSize(runs);
    y += (i === 0 ? 0 : line.gap * k) + ASCENT * size;
    if (i === 0) top = y - ASCENT * size;
    bottom = y + DESCENT * size;
    const at = y;
    y += DESCENT * size;
    return { id: line.id, runs: runs.map((r) => ({ ...r, x: column.x + r.x })), y: at };
  });
  const shift = block.top + (block.bottom - block.top - (bottom - top)) / 2 - top;
  return placed.map((l) => ({ ...l, y: Math.round(l.y + shift) }));
}

/** The link at the card's foot, shrunk to its width. */
export function layoutLink(origin: string, measure: Measure): PlacedLine {
  const { link, column } = LAYOUT;
  const runs = fitRuns([run(linkLabel(origin), link.size, 'muted', 'body', 400)], link.w, measure);
  return { id: 'link', runs: runs.map((r) => ({ ...r, x: column.x + r.x })), y: link.baseline };
}

// ---------------------------------------------------------------------------------------------------------------
// The poster
// ---------------------------------------------------------------------------------------------------------------

/**
 * The moon in the stage's clearing, video px (measured in `public/stage/clearing.webp`, the same in every hero's
 * poster: they share one clearing): its centre and radius. The crop keeps it whole.
 */
export const MOON = { x: 787, y: 155, r: 42 } as const;

/** The hero's feet stand here on the card, px: in its right third, so its poster pose (about 780–1110) clears the text. */
export const HERO_X = 930;

/** Room kept over the moon and under the figure's box, video px. */
const OVER_MOON = 32;
const UNDER_FIGURE = 10;

export interface Crop {
  /** The poster's rectangle drawn onto the whole card, video px. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Card px per video px. */
  scale: number;
}

/**
 * The part of a hero's stage poster the card shows: from just over the moon to just under the figure's box (every
 * frame of the loop fits it, so the poster frame does), as wide as the card's shape asks, the feet at `HERO_X`.
 */
export function posterCrop(stage: Pick<StageLayout, 'w' | 'h' | 'feetX' | 'figure'>): Crop {
  const top = Math.max(0, MOON.y - MOON.r - OVER_MOON);
  const sh = Math.min(stage.h - top, stage.figure.y1 + UNDER_FIGURE - top);
  const scale = CARD.h / sh;
  const sw = CARD.w / scale;
  const sx = Math.min(Math.max(0, stage.feetX - HERO_X / scale), stage.w - sw);
  return { sx, sy: top, sw, sh, scale };
}

/** Where a point of the poster lands on the card, px. */
export function onCard(crop: Crop, x: number, y: number): { x: number; y: number } {
  return { x: (x - crop.sx) * crop.scale, y: (y - crop.sy) * crop.scale };
}

// ---------------------------------------------------------------------------------------------------------------
// After the tap
// ---------------------------------------------------------------------------------------------------------------

/**
 * How a tap on Share ended: the share sheet took it, or was closed; the sheet refused a tap that came before the card
 * was ready (a share sheet wants the tap's own moment; the card is ready now); the card was downloaded and the link
 * copied, or the card only; the card could not be made.
 */
export type ShareOutcome = 'shared' | 'closed' | 'again' | 'saved' | 'saved-no-link' | 'failed';

/** The end card's toast after a tap (null: nothing to say, the share sheet spoke for itself). */
export function outcomeLine(outcome: ShareOutcome): string | null {
  switch (outcome) {
    case 'again':
      return 'Card ready: tap Share again';
    case 'saved':
      return 'Card saved, link copied';
    case 'saved-no-link':
      return 'Card saved';
    case 'failed':
      return 'Could not make the card';
    default:
      return null;
  }
}
