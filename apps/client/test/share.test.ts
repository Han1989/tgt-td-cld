// The share card (src/share/: docs/GAME_DESIGN.md "Daily run"): what it says for a posted Daily run and for an Endless
// run that fell, the share sheet's text and link, the poster's crop, and its layout against a stub canvas whose text is
// measured wider than any real font, at the extremes (a rank of #1,000 of 9,999, a 16-character nickname of Ws,
// Endless past wave 100, a long preview origin): no text may leave its column or the card.

import { readFileSync } from 'node:fs';
import { HERO_KINDS, MAX_NAME_LENGTH } from '@tdt/protocol';
import { TICK_RATE } from '@tdt/sim';
import { describe, expect, it } from 'vitest';
import type { PostResult } from '../src/daily/text';
import { withRun } from '../src/endless/best';
import { HERO_3D } from '../src/render/art3d/layout';
import { drawCard, type CardArt, type Ctx2D } from '../src/share/card';
import {
  BODY_FONT,
  CARD,
  cardFileName,
  cardLines,
  clock,
  dailyFace,
  endlessFace,
  fullDay,
  groupDigits,
  HERO_X,
  LAYOUT,
  layoutLines,
  layoutLink,
  linkLabel,
  MOON,
  onCard,
  outcomeLine,
  posterCrop,
  shareText,
  shareUrl,
  TITLE_FONT,
  type DailyFace,
  type EndlessFace,
  type Line,
  type Measure,
  type ShareFace,
} from '../src/share/text';

const ORIGIN = 'https://tgt-td-cld.vercel.app';
/** A Vercel preview's origin: as long as they come. */
const PREVIEW = 'https://tgt-td-cld-git-claude-amazing-pascal-26zs82-han1989s-projects.vercel.app';
const ticks = (min: number, s: number) => (min * 60 + s) * TICK_RATE;

const daily = (extra: Partial<DailyFace> = {}): DailyFace => ({
  kind: 'daily',
  day: '2026-10-24',
  rank: 14,
  total: 212,
  run: { heart: 82, wave: 15, ticks: ticks(9, 41) },
  name: 'Wren',
  hero: 'warden',
  ...extra,
});
const endless = (extra: Partial<EndlessFace> = {}): EndlessFace => ({
  kind: 'endless',
  wave: 46,
  seconds: 38 * 60 + 12,
  best: null,
  hero: 'warden',
  ...extra,
});

const words = (lines: Line[]) => lines.map((l) => [l.id, l.runs.map((r) => r.text).join('')]);

describe('what the card says', () => {
  it('a posted Daily run: the day, the rank large, the share, Heart and time, the nickname and the hero', () => {
    expect(words(cardLines(daily()))).toEqual([
      ['eyebrow', 'Daily run · 24 Oct 2026'],
      ['rank', '#14 of 212'],
      ['under', 'top 7 %'],
      ['run', '82 Heart · 9:41'],
      ['who', 'Wren · Warden'],
    ]);
    // The rank is the big run; "of 212" rides its baseline, smaller.
    const [num, rest] = cardLines(daily())[1]!.runs;
    expect(num!.size).toBeGreaterThan(rest!.size * 2);
  });

  it('a run that fell says the wave, and a board under ten players gives no share', () => {
    const lost = daily({ run: { heart: 0, wave: 12, ticks: ticks(7, 3) }, rank: 3, total: 8, hero: 'arcanist' });
    expect(words(cardLines(lost))).toEqual([
      ['eyebrow', 'Daily run · 24 Oct 2026'],
      ['rank', '#3 of 8'],
      ['run', 'Fell on wave 12 · 7:03'],
      ['who', 'Wren · Arcanist'],
    ]);
  });

  it('groups thousands', () => {
    expect(words(cardLines(daily({ rank: 1000, total: 9999 })))[1]).toEqual(['rank', '#1,000 of 9,999']);
    expect(words(cardLines(daily({ rank: 1000, total: 9999 })))[2]).toEqual(['under', 'top 11 %']);
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(1234567)).toBe('1,234,567');
    expect(fullDay('2026-01-05')).toBe('5 Jan 2026');
  });

  it('an Endless run: the wave large, the time, the hero; the best only when this browser holds a better one', () => {
    expect(words(cardLines(endless()))).toEqual([
      ['eyebrow', 'Endless'],
      ['lead', 'Fallen on wave'],
      ['wave', '46'],
      ['run', 'Held out 38:12'],
      ['who', 'Warden'],
    ]);
    expect(words(cardLines(endless({ best: 51, hero: 'ranger' })))).toEqual([
      ['eyebrow', 'Endless'],
      ['lead', 'Fallen on wave'],
      ['wave', '46'],
      ['run', 'Held out 38:12'],
      ['best', 'Best: wave 51'],
      ['who', 'Ranger'],
    ]);
    expect(clock(3727)).toBe('1:02:07');
    expect(clock(59.9)).toBe('0:59');
  });

  it('the share sheet’s words and the link, from the page’s own origin', () => {
    expect(shareText(daily())).toBe("I finished #14 of 212 in today's Daily run of Tower Defense Together. Beat me:");
    expect(shareText(daily({ rank: 1000, total: 9999 }))).toBe("I finished #1,000 of 9,999 in today's Daily run of Tower Defense Together. Beat me:");
    expect(shareText(endless())).toBe('I held out to wave 46 in Endless. How far can you get?');
    expect(shareUrl(ORIGIN)).toBe('https://tgt-td-cld.vercel.app/?src=share');
    expect(shareUrl(`${ORIGIN}/`)).toBe('https://tgt-td-cld.vercel.app/?src=share');
    expect(shareUrl('http://localhost:4190')).toBe('http://localhost:4190/?src=share');
    expect(linkLabel(ORIGIN)).toBe('tgt-td-cld.vercel.app/?src=share');
    expect(cardFileName(daily())).toBe('tdt-daily-2026-10-24-rank-14.png');
    expect(cardFileName(endless())).toBe('tdt-endless-warden-wave-46.png');
  });

  it('after the tap: a line for a download, a refused moment or a failure; nothing when the share sheet took it', () => {
    expect(outcomeLine('saved')).toBe('Card saved, link copied');
    expect(outcomeLine('saved-no-link')).toBe('Card saved');
    expect(outcomeLine('again')).toBe('Card ready: tap Share again');
    expect(outcomeLine('failed')).toBe('Could not make the card');
    expect(outcomeLine('shared')).toBeNull();
    expect(outcomeLine('closed')).toBeNull();
  });
});

describe('the card’s faces', () => {
  const rows = [
    { rank: 13, name: 'Mira', heart: 43, wave: 15, ticks: 12_400, mine: false },
    { rank: 14, name: 'Player', heart: 40, wave: 15, ticks: 12_600, mine: true },
  ];
  const result: PostResult = {
    day: '2026-10-24',
    total: 212,
    rank: 14,
    best: { won: true, heart: 40, wave: 15, ticks: 12_600, hero: 'ranger' },
    run: { won: false, heart: 0, wave: 9, ticks: 6_000, hero: 'warden' },
    improved: false,
    personalBest: null,
    rows,
  };

  it('a Daily run shows the run that holds the rank (the best today), the name the board shows and that run’s hero', () => {
    expect(dailyFace(result, 'Wren', 'warden')).toEqual({
      kind: 'daily',
      day: '2026-10-24',
      rank: 14,
      total: 212,
      run: { heart: 40, wave: 15, ticks: 12_600 },
      name: 'Player',
      hero: 'ranger',
    });
    // No row of the player's (never in practice): the name posted; a hero the client does not know: the one played.
    const odd = dailyFace({ ...result, rows: rows.slice(0, 1), best: { ...result.best, hero: 'nope' } }, 'Wren', 'warden');
    expect([odd.name, odd.hero]).toEqual(['Wren', 'warden']);
  });

  it('carries nothing personal beyond the public board: no id, key or age', () => {
    expect(Object.keys(dailyFace(result, 'Wren', 'warden')).sort()).toEqual(['day', 'hero', 'kind', 'name', 'rank', 'run', 'total']);
    expect(Object.keys(endless()).sort()).toEqual(['best', 'hero', 'kind', 'seconds', 'wave']);
  });

  it('an Endless run names a better best only', () => {
    expect(endlessFace(withRun({ warden: 51 }, 'warden', 46).run, 100, 'warden').best).toBe(51);
    expect(endlessFace(withRun({ warden: 46 }, 'warden', 46).run, 100, 'warden').best).toBeNull();
    expect(endlessFace(withRun({ warden: 40 }, 'warden', 46).run, 100, 'warden').best).toBeNull();
    expect(endlessFace(withRun({}, 'warden', 46).run, 100, 'warden')).toEqual({ kind: 'endless', wave: 46, seconds: 100, best: null, hero: 'warden' });
  });
});

/**
 * Wider than any real font: every character at its widest plausible advance (digits, capitals and # at 0.8 em, a W
 * or an M at 1.05 em, lower case at 0.62 em, a space 0.32 em, punctuation 0.4 em), bold or not, serif or not.
 */
function wide(text: string, font: string): number {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? NaN);
  let em = 0;
  for (const ch of text) {
    if (/[WMwm@]/.test(ch)) em += 1.05;
    else if (/[A-Z0-9#%]/.test(ch)) em += 0.8;
    else if (/[a-z]/.test(ch)) em += 0.62;
    else if (ch === ' ') em += 0.32;
    else em += 0.4;
  }
  return em * size;
}

const COL = { x0: LAYOUT.column.x, x1: LAYOUT.column.x + LAYOUT.column.w };
const WS = 'W'.repeat(MAX_NAME_LENGTH);
const EXTREMES: ShareFace[] = [
  daily(),
  daily({ rank: 1000, total: 9999, name: WS, hero: 'arcanist' }),
  daily({ rank: 1, total: 9999, name: WS, run: { heart: 0, wave: 15, ticks: ticks(29, 59) } }),
  daily({ rank: 9999, total: 9999, name: 'i', hero: 'ranger', run: { heart: 100, wave: 15, ticks: ticks(10, 0) } }),
  daily({ rank: 3, total: 8 }),
  endless(),
  endless({ wave: 200, seconds: 4 * 3600 + 59 * 60 + 59, best: null, hero: 'arcanist' }),
  endless({ wave: 137, seconds: 2 * 3600, best: 199, hero: 'ranger' }),
];

describe('the layout, measured wider than any font', () => {
  it('fits every line of every extreme in the column, in order, between the wordmark and the link', () => {
    for (const face of EXTREMES) {
      const placed = layoutLines(cardLines(face), wide);
      let lastBottom = LAYOUT.block.top - 1;
      for (const line of placed) {
        const size = Math.max(...line.runs.map((r) => r.drawn));
        for (const r of line.runs) {
          expect(r.x).toBeGreaterThanOrEqual(COL.x0);
          expect(r.x + r.width).toBeLessThanOrEqual(COL.x1 + 0.01);
          expect(r.width).toBeCloseTo(wide(r.text, `${r.drawn}px`), 6);
        }
        // Capitals over the baseline, descenders under it: the lines never touch, and stay in the block.
        expect(line.y - 0.74 * size).toBeGreaterThan(lastBottom);
        lastBottom = line.y + 0.24 * size;
      }
      expect(lastBottom).toBeLessThanOrEqual(LAYOUT.block.bottom + 1);
      // The big number stays big, whatever the rank.
      const big = placed.find((l) => l.id === 'rank' || l.id === 'wave')!;
      expect(big.runs[0]!.drawn).toBeGreaterThanOrEqual(90);
    }
  });

  it('shrinks the runs of a line together, and only as far as it must', () => {
    // A serif's digits are about half an em: "#14 of 212" fits at its own sizes.
    const narrow: Measure = (t, font) => t.length * 0.5 * Number(/(\d+)px/.exec(font)![1]);
    const plain = layoutLines(cardLines(daily()), narrow).find((l) => l.id === 'rank')!;
    expect(plain.runs.map((r) => r.drawn)).toEqual([150, 54]);
    const long = layoutLines(cardLines(daily({ rank: 1000, total: 9999 })), wide).find((l) => l.id === 'rank')!;
    const [num, rest] = long.runs;
    expect(num!.drawn).toBeLessThan(150);
    expect(num!.drawn / rest!.drawn).toBeCloseTo(150 / 54, 0);
    // One px bigger would not fit.
    const width = (k: number) => long.runs.reduce((s, r) => s + wide(r.text, `${Math.floor(r.size * k)}px`), 0);
    expect(width((num!.drawn + 1) / 150)).toBeGreaterThan(LAYOUT.column.w);
  });

  it('shrinks a block taller than its room as a whole', () => {
    const narrow: Measure = (t, font) => t.length * 0.5 * Number(/(\d+)px/.exec(font)![1]);
    const tall = layoutLines(cardLines(endless({ best: 51 })), narrow);
    const short = layoutLines(cardLines(endless()), narrow);
    const size = (l: { runs: { drawn: number }[] }) => l.runs[0]!.drawn;
    expect(size(short.find((l) => l.id === 'wave')!)).toBe(150);
    expect(size(tall.find((l) => l.id === 'wave')!)).toBeLessThan(150);
    expect(size(tall.find((l) => l.id === 'wave')!)).toBeGreaterThan(120);
    const last = tall.at(-1)!;
    expect(tall[0]!.y - 0.74 * size(tall[0]!)).toBeGreaterThanOrEqual(LAYOUT.block.top - 1);
    expect(last.y + 0.24 * size(last)).toBeLessThanOrEqual(LAYOUT.block.bottom + 1);
  });

  it('fits the link at the foot, a long preview origin too', () => {
    for (const origin of [ORIGIN, PREVIEW]) {
      const link = layoutLink(origin, wide);
      const r = link.runs[0]!;
      expect(r.text).toBe(linkLabel(origin));
      expect(r.x + r.width).toBeLessThanOrEqual(LAYOUT.column.x + LAYOUT.link.w + 0.01);
      expect(link.y + 0.24 * r.drawn).toBeLessThan(CARD.h - LAYOUT.frame.inset - LAYOUT.frame.width);
    }
    expect(layoutLink(ORIGIN, wide).runs[0]!.drawn).toBe(LAYOUT.link.size);
  });
});

describe('the poster’s crop', () => {
  it('keeps the moon and the figure whole, the card’s shape, and the hero’s feet in the right third', () => {
    for (const hero of HERO_KINDS) {
      const stage = HERO_3D[hero]!.stage;
      const c = posterCrop(stage);
      expect(c.sw / c.sh).toBeCloseTo(CARD.w / CARD.h, 6);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.sw).toBeLessThanOrEqual(stage.w);
      expect(c.sy + c.sh).toBeLessThanOrEqual(stage.h);
      expect(c.sy).toBeLessThanOrEqual(MOON.y - MOON.r);
      expect(c.sy + c.sh).toBeGreaterThanOrEqual(stage.figure.y1);
      const feet = onCard(c, stage.feetX, stage.groundY);
      expect(feet.x).toBeCloseTo(HERO_X, 6);
      expect(feet.x).toBeGreaterThan((CARD.w * 2) / 3);
      // The moon lands right of the text column's wordmark, wholly on the card.
      const moon = onCard(c, MOON.x, MOON.y);
      expect(moon.y - MOON.r * c.scale).toBeGreaterThan(LAYOUT.frame.inset + LAYOUT.frame.width);
      expect(moon.x - MOON.r * c.scale).toBeGreaterThan(LAYOUT.column.x + 300);
      expect(moon.x + MOON.r * c.scale).toBeLessThan(CARD.w);
    }
  });
});

describe('the page’s fonts', () => {
  it('are style.css’s own stacks', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toContain(`--title-font: ${TITLE_FONT};`);
    const root = /:root \{[\s\S]*?\n\}/.exec(css)![0];
    expect(root).toContain(`font-family: ${BODY_FONT};`);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Drawn on a stub canvas
// ---------------------------------------------------------------------------------------------------------------

interface Call {
  op: string;
  args: unknown[];
  font: string;
  composite: string;
  transformed: boolean;
}

/** A 2D context that records what is drawn and measures text with `wide`. */
function stubCanvas(measure: Measure = wide): { ctx: Ctx2D; calls: Call[] } {
  const calls: Call[] = [];
  const gradient = () => ({ addColorStop: () => {} });
  let depth = 0;
  let turned = 0;
  const stack: number[] = [];
  const state = {
    font: '10px sans-serif',
    fillStyle: '#000' as unknown,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, font: state.font, composite: state.globalCompositeOperation, transformed: turned > 0 });
  };
  const ctx = {
    ...state,
    save: () => {
      depth++;
      stack.push(turned);
    },
    restore: () => {
      depth--;
      turned = stack.pop() ?? 0;
    },
    translate: () => {},
    rotate: () => {
      turned++;
    },
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    drawImage: record('drawImage'),
    measureText: (text: string) => ({ width: measure(text, state.font) }),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  };
  // Keep the recorded state live: the card sets `ctx.font` and the measure reads it.
  for (const key of Object.keys(state) as (keyof typeof state)[]) {
    Object.defineProperty(ctx, key, {
      get: () => state[key],
      set: (v) => {
        (state as Record<string, unknown>)[key] = v;
      },
    });
  }
  return { ctx: ctx as unknown as Ctx2D, calls };
}

const POSTER = { tag: 'poster' } as unknown as CanvasImageSource;
const SHEET = { tag: 'ui' } as unknown as CanvasImageSource;
const art = (hero: ShareFace['hero']): CardArt => ({
  poster: { image: POSTER, stage: HERO_3D[hero]!.stage },
  trim: { image: SHEET, x: 746, y: 50, w: 64, h: 8 },
});

describe('the card drawn', () => {
  it('keeps every text of every extreme inside the frame, the lines inside their column', () => {
    const inner = LAYOUT.frame.inset + LAYOUT.frame.width;
    for (const face of EXTREMES) {
      for (const origin of [ORIGIN, PREVIEW]) {
        const { ctx, calls } = stubCanvas();
        drawCard(ctx, face, origin, art(face.hero));
        const texts = calls.filter((c) => c.op === 'fillText');
        expect(texts.length).toBeGreaterThan(6);
        for (const t of texts) {
          const [s, x] = t.args as [string, number, number];
          const w = wide(s, t.font);
          expect(x).toBeGreaterThanOrEqual(COL.x0);
          expect(x + w).toBeLessThanOrEqual(COL.x1 + 0.01);
          expect(x + w).toBeLessThan(CARD.w - inner);
          const y = t.args[2] as number;
          expect(y).toBeGreaterThan(inner);
          expect(y).toBeLessThan(CARD.h - inner);
        }
        const said = texts.map((t) => t.args[0]);
        expect(said).toContain('Tower Defense');
        expect(said).toContain('Together');
        expect(said).toContain(linkLabel(origin));
      }
    }
  });

  it('draws the poster under the night with the moon’s hole, the trim round the edge, then the text', () => {
    const { ctx, calls } = stubCanvas();
    drawCard(ctx, daily(), ORIGIN, art('warden'));
    const ops = calls.map((c) => `${c.op}:${c.composite}`);
    const poster = calls.findIndex((c) => c.op === 'drawImage' && c.args[0] === POSTER);
    expect(calls[poster]!.composite).toBe('destination-over');
    expect(calls[poster]!.args.slice(1, 5)).toEqual(Object.values(posterCrop(HERO_3D.warden!.stage)).slice(0, 4));
    expect(calls[poster]!.args.slice(5)).toEqual([0, 0, CARD.w, CARD.h]);
    expect(ops.indexOf('fillRect:destination-out')).toBeGreaterThan(0);
    expect(ops.indexOf('fillRect:destination-out')).toBeLessThan(poster);
    const trims = calls.filter((c) => c.op === 'drawImage' && c.args[0] === SHEET);
    // Four edges of 8 px tiles 64 px long: the sides turned.
    expect(trims.length).toBe(2 * Math.ceil((CARD.w - 32) / 64) + 2 * Math.ceil((CARD.h - 32) / 64));
    expect(trims.filter((c) => c.transformed).length).toBe(2 * Math.ceil((CARD.h - 32) / 64));
    expect(trims.every((c) => c.composite === 'source-over')).toBe(true);
    const firstText = calls.findIndex((c) => c.op === 'fillText');
    expect(firstText).toBeGreaterThan(calls.lastIndexOf(trims.at(-1)!));
  });

  it('still draws a card with no poster or trim (offline): the sky, the gold lines, the words', () => {
    const { ctx, calls } = stubCanvas();
    drawCard(ctx, endless({ best: 51 }), ORIGIN, { poster: null, trim: null });
    expect(calls.some((c) => c.op === 'drawImage')).toBe(false);
    const said = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    for (const s of ['Endless', 'Fallen on wave', '46', 'Held out 38:12', 'Best: wave 51', 'Warden']) expect(said).toContain(s);
  });
});
