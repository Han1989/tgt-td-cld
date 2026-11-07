// The wait before a match (V-08b load-all, Han, 7 Nov 2026: no placeholder art on screen, ever; docs/ART.md §15
// "Loading"). Play solo, Learn to play, the Daily run and a rejoined room's running match wait here until every
// picture the match draws is decoded and on the GPU (rules.ts `matchSheets`, `artReady`). No cap. Under BAR_AFTER_MS
// nothing is shown at all (BAR_DECODING_MS when every byte is in and only decoding is left: a second visit); past it,
// a full-screen card: the hero's portrait, a bar that moves with the bytes and
// nothing else, one line ("Loading the towers… 3.1 of 7.9 MB"), a tip from his kit, and Back. A picture that failed
// after its retries turns the line into what failed, with Retry.
//
// `tdt:art-wait` marks the tap, `tdt:art-card` the card showing, `tdt:art-ready` the wait's end (the match starts; npm run first-load -- --match).
// Browser-test builds wait only with `?artwait` (their tests drive a match from its first snapshot; the wait has its
// own tests in e2e/mobile.spec.ts and e2e/lobby.spec.ts).

import type { GameMode, HeroKind, SkillSlot } from '@tdt/protocol';
import { TUNING, tuningForMode } from '@tdt/sim';
import { HERO_INFO } from '../heroInfo';
import { stageUrl } from '../lobby/stageBackdrop';
import { HERO_3D } from '../render/art3d/layout';
import { SHEET_BYTES } from './bytes';
import { retryArt, wantSheets } from './order';
import {
  artBytes,
  artFailed,
  artPercent,
  artReady,
  barDue,
  failedLine,
  matchSheets,
  portraitCrop,
  portraitCss,
  waitLine,
  type SheetId,
  type SheetProgress,
} from './rules';
import { sheetProgress } from './track';

/** Waits only outside browser-test builds, or with `?artwait`. */
export const ART_WAIT = import.meta.env.MODE !== 'e2e' || new URLSearchParams(location.search).has('artwait');

/** The portrait's size, CSS px (style.css `.art-wait-portrait`). */
const PORTRAIT_PX = 132;
/** A new tip this often, ms. */
const TIP_MS = 7000;
const SLOTS: readonly SkillSlot[] = ['Q', 'W', 'E', 'R'];

export interface WaitFor {
  mode: GameMode;
  /** The match's heroes (solo: the picked one; a room: all three). */
  heroes: readonly HeroKind[];
  /** Whose portrait and kit the card shows. */
  hero: HeroKind;
  /** Back (null: none, a running room's match has no way back but Leave). */
  back: (() => void) | null;
  /** Back's label. */
  backLabel?: string;
}

interface Waiting {
  ids: SheetId[];
  go: () => void;
  for: WaitFor;
  since: number;
  shown: boolean;
  tip: number;
  tipAt: number;
}

/** Where the match's pictures are, by id. */
function items(ids: readonly SheetId[]): SheetProgress[] {
  return ids.map(sheetProgress);
}

/** How much of `ids` is in, a whole percent (100 only once all are in); what a room's seat sends. */
export function percentOf(ids: readonly SheetId[]): number {
  if (!ART_WAIT) return 100;
  return artPercent(artBytes(ids, sheetProgress, SHEET_BYTES), artReady(items(ids)));
}

export class ArtGate {
  private waiting: Waiting | null = null;
  private raf = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private card: Card | null = null;
  /** The bar never goes back (a retry restarts a file's bytes). */
  private drawn = 0;

  /** A match is waiting (the card may not be up yet). */
  get active(): boolean {
    return this.waiting !== null;
  }

  /**
   * Starts the match (`go`) once every picture it draws is in: at once if they are, else after the wait. A wait already
   * under way is replaced.
   */
  wait(w: WaitFor, go: () => void): void {
    this.cancel();
    const ids = matchSheets(tuningForMode(TUNING, w.mode), w.heroes);
    performance.mark('tdt:art-wait');
    wantSheets(ids);
    if (!ART_WAIT || artReady(items(ids))) {
      performance.mark('tdt:art-ready', { detail: 0 });
      go();
      return;
    }
    const now = performance.now();
    this.waiting = { ids, go, for: w, since: now, shown: false, tip: Math.floor(Math.random() * 4), tipAt: now };
    this.drawn = 0;
    this.loop();
  }

  /** The wait is dropped (Back, a room left): no card, no start. */
  cancel(): void {
    this.stop();
    this.card?.hide();
  }

  private stop(): void {
    this.waiting = null;
    cancelAnimationFrame(this.raf);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** For the browser tests: the wait, the card, the bar and each picture. */
  state(): { waiting: boolean; shown: boolean; percent: number; line: string; failed: boolean; sheets: Partial<Record<SheetId, SheetProgress>> } {
    const w = this.waiting;
    const sheets: Partial<Record<SheetId, SheetProgress>> = {};
    for (const id of w?.ids ?? []) sheets[id] = sheetProgress(id);
    return {
      waiting: !!w,
      shown: !!w?.shown,
      percent: w ? percentOf(w.ids) : 100,
      line: this.card?.line.textContent ?? '',
      failed: w ? artFailed(items(w.ids)) : false,
      sheets,
    };
  }

  private loop(): void {
    // Each animation frame while the page is shown, and a slow timer as well, so a hidden page still starts the match
    // the moment its pictures are in (the frames stop in the background; the downloads do not).
    const tick = () => {
      this.frame(performance.now());
      if (this.waiting) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.timer = setInterval(() => this.frame(performance.now()), 250);
  }

  private frame(now: number): void {
    const w = this.waiting;
    if (!w) return;
    const list = items(w.ids);
    if (artReady(list)) {
      const go = w.go;
      const waited = now - w.since;
      this.stop();
      performance.mark('tdt:art-ready', { detail: waited });
      // The match first, then the card goes (the lobby under it is hidden by then: its stage does not start again).
      go();
      this.card?.hide();
      return;
    }
    const bytes = artBytes(w.ids, sheetProgress, SHEET_BYTES);
    if (!w.shown && barDue(now - w.since, bytes)) {
      w.shown = true;
      performance.mark('tdt:art-card');
      this.card ??= new Card(() => retryArt(this.waiting?.ids ?? []), () => this.back());
      this.card.show(w.for);
    }
    if (!w.shown || !this.card) return;
    if (now - w.tipAt >= TIP_MS) {
      w.tip++;
      w.tipAt = now;
    }
    this.drawn = Math.max(this.drawn, bytes.total > 0 ? bytes.done / bytes.total : 0);
    const failed = artFailed(list);
    this.card.draw({
      fraction: this.drawn,
      percent: artPercent(bytes, false),
      line: failed ? failedLine(w.ids, sheetProgress) : waitLine(w.ids, sheetProgress, SHEET_BYTES),
      failed,
      tip: tipOf(w.for.hero, w.tip),
    });
  }

  private back(): void {
    const back = this.waiting?.for.back;
    this.cancel();
    back?.();
  }
}

/** A tip from the hero's kit: "R · Arrow Storm: arrows fall on every lane…". */
function tipOf(hero: HeroKind, n: number): { key: string; text: string } {
  const slot = SLOTS[n % SLOTS.length]!;
  const s = HERO_INFO[hero].skills[slot];
  return { key: `${slot} · ${s.name}`, text: s.desc };
}

/** The card (built once, the first time a wait shows). */
class Card {
  private readonly root = document.createElement('div');
  private readonly portrait = document.createElement('div');
  private readonly name = document.createElement('p');
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('span');
  readonly line = document.createElement('p');
  private readonly tipKey = document.createElement('b');
  private readonly tipText = document.createElement('span');
  private readonly retry = document.createElement('button');
  private readonly backBtn = document.createElement('button');
  private drawnFraction = -1;

  constructor(onRetry: () => void, onBack: () => void) {
    this.root.id = 'art-wait';
    this.root.className = 'art-wait hidden';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Loading the match');
    const card = document.createElement('div');
    card.className = 'art-wait-card';
    this.portrait.className = 'art-wait-portrait';
    this.portrait.setAttribute('aria-hidden', 'true');
    this.name.className = 'art-wait-name';
    this.bar.className = 'art-wait-bar';
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-label', 'Loading the art');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.fill.className = 'fill';
    this.bar.append(this.fill);
    this.line.className = 'art-wait-line';
    this.line.setAttribute('aria-live', 'polite');
    const tip = document.createElement('p');
    tip.className = 'art-wait-tip';
    tip.append(this.tipKey, this.tipText);
    const actions = document.createElement('div');
    actions.className = 'art-wait-actions';
    this.retry.id = 'art-wait-retry';
    this.retry.type = 'button';
    this.retry.className = 'btn big hidden';
    this.retry.textContent = 'Retry';
    this.retry.addEventListener('click', onRetry);
    this.backBtn.id = 'art-wait-back';
    this.backBtn.type = 'button';
    this.backBtn.className = 'btn';
    this.backBtn.addEventListener('click', onBack);
    actions.append(this.retry, this.backBtn);
    card.append(this.portrait, this.name, this.bar, this.line, tip, actions);
    this.root.append(card);
    document.body.append(this.root);
  }

  show(w: WaitFor): void {
    // The card covers everything: the lobby's stage stops (and drops its video download) until it goes.
    window.dispatchEvent(new CustomEvent('tdt:art-card', { detail: true }));
    const stage = HERO_3D[w.hero]?.stage;
    if (stage) {
      const css = portraitCss(portraitCrop(stage), stage.w, stage.h, PORTRAIT_PX);
      this.portrait.style.backgroundImage = `url("${stageUrl(stage, 'poster')}")`;
      this.portrait.style.backgroundSize = css.size;
      this.portrait.style.backgroundPosition = css.position;
    }
    this.portrait.dataset.hero = w.hero;
    this.name.textContent = HERO_INFO[w.hero].name;
    this.backBtn.classList.toggle('hidden', !w.back);
    this.backBtn.textContent = w.backLabel ?? 'Back';
    this.drawnFraction = -1;
    this.root.classList.remove('hidden');
  }

  draw(d: { fraction: number; percent: number; line: string; failed: boolean; tip: { key: string; text: string } }): void {
    const f = Math.round(Math.min(1, Math.max(0, d.fraction)) * 400) / 400;
    if (f !== this.drawnFraction) {
      this.drawnFraction = f;
      this.fill.style.transform = `scaleX(${f})`;
    }
    this.bar.setAttribute('aria-valuenow', String(d.percent));
    this.bar.classList.toggle('failed', d.failed);
    if (this.line.textContent !== d.line) this.line.textContent = d.line;
    this.retry.classList.toggle('hidden', !d.failed);
    if (this.tipKey.textContent !== d.tip.key) {
      this.tipKey.textContent = d.tip.key;
      this.tipText.textContent = d.tip.text;
    }
  }

  hide(): void {
    if (this.root.classList.contains('hidden')) return;
    this.root.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('tdt:art-card', { detail: false }));
  }
}

/** The one wait (a page starts one match at a time). */
export const artGate = new ArtGate();
