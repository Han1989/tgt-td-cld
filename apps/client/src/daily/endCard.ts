// The Daily run's part of the end screen (docs/GAME_DESIGN.md "Daily run"): "Post my run" above the stats, one tap.
// The age question comes first if it was never answered (privacy/ageCheck.ts): under 13 sees "Scores can be posted
// from 13" and no button. A missing nickname is asked for in the same card. On success the rank is revealed first,
// counting up over about a second, then the gap to the row above, the best in gold, the five rows around the player,
// and only then the usual stats. A failed post says so in one line; Save match report is untouched. Posting is an
// explicit act, so it does not read the Play data switch (docs/ANALYTICS.md "Daily run"). After the reveal, and only
// after a post that went through, **Share my run** hands over the share card (share/: the rank, the run, the nickname
// as the board shows it, the hero) with a link back; never by itself.

import { MAX_NAME_LENGTH, normalizeName, type HeroKind, type MatchReport, type Replay } from '@tdt/protocol';
import { currentAgeBand } from '../analytics/age';
import { storedName, storeName } from '../lobby/nickname';
import { askAge } from '../privacy/ageCheck';
import { CardShare } from '../share/share';
import { dailyFace, outcomeLine, type DailyFace } from '../share/text';
import { postRun, type PostOutcome } from './api';
import { bestLine, gapLine, postErrorLine, rankLine, rankParts, retryable, rowText, type PostResult } from './text';

/** The run being played: the day and its seed (from GET /daily/today). */
export interface DailyRunInfo {
  day: string;
  seed: number;
}

/** How long the rank counts up, and when each later line comes in after it (ms). */
export const COUNT_MS = 1000;
const STEPS_MS = { gap: 1050, best: 1300, rows: 1550, share: 1750, stats: 1900 };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Post = (name: string, file: { report: MatchReport; replay: Replay }) => Promise<PostOutcome>;

export class DailyEndCard {
  private readonly card = document.querySelector<HTMLElement>('#end-screen .end-card')!;
  private readonly root = $('end-daily');
  private readonly ask = $('end-daily-ask');
  private readonly nameRow = $('end-daily-name-row');
  private readonly name = $('end-daily-name') as HTMLInputElement;
  private readonly post = $('end-daily-post') as HTMLButtonElement;
  private readonly msg = $('end-daily-msg');
  private readonly rank = $('end-daily-rank');
  private readonly place = $('end-daily-place');
  private readonly placeNum = document.createElement('b');
  private readonly placeRest = document.createElement('span');
  private readonly gap = $('end-daily-gap');
  private readonly best = $('end-daily-best');
  private readonly rows = $('end-daily-rows');
  private readonly shareBtn = $('end-daily-share') as HTMLButtonElement;

  private run: DailyRunInfo | null = null;
  private file: { report: MatchReport; replay: Replay } | null = null;
  /** idle: the button; posting: waiting for the server; done: revealed, or refused for good. */
  private state: 'idle' | 'posting' | 'done' = 'idle';
  private shown = false;
  private timers: number[] = [];
  private frame = 0;
  /** The posted run's card, once the post went through. */
  private face: DailyFace | null = null;
  private readonly cards = new CardShare();

  /**
   * `toast` shows the share's outcome on the end card ("Card saved, link copied"); `posted` hears a post that went
   * through, with the hero that ran it (the record per hero keeps the best rank, record/).
   */
  constructor(
    private readonly send: Post = postRun,
    private readonly toast: (text: string) => void = () => {},
    private readonly posted: (result: PostResult, hero: HeroKind) => void = () => {},
  ) {
    this.name.maxLength = MAX_NAME_LENGTH;
    this.placeNum.className = 'num';
    this.placeRest.className = 'rest';
    this.place.replaceChildren(this.placeNum, ' ', this.placeRest);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.post.addEventListener('click', () => void this.tap());
    this.shareBtn.addEventListener('click', () => void this.shareCard());
    this.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.tap();
    });
  }

  /** The match being played is this Daily run (null: any other match). */
  setRun(run: DailyRunInfo | null): void {
    this.run = run;
    this.reset();
  }

  /** Every HUD update: the end screen is up (`over`) with the host's report, or a match is running. */
  sync(over: boolean, file: { report: MatchReport; replay: Replay } | null): void {
    const show = over && this.run !== null && file !== null;
    if (!show) {
      if (this.shown || this.state !== 'idle') this.reset();
      return;
    }
    this.file = file;
    if (this.shown) return;
    this.shown = true;
    this.root.classList.remove('hidden');
    this.idle();
  }

  /** The button (or the under-13 line), the nickname field when there is none yet. */
  private idle(): void {
    this.ask.classList.remove('hidden');
    this.rank.classList.add('hidden');
    this.msg.textContent = '';
    if (currentAgeBand() === 'child') return this.child();
    this.post.disabled = false;
    this.post.textContent = 'Post my run';
    const name = storedName();
    this.name.value = name;
    this.nameRow.classList.toggle('hidden', normalizeName(name) !== null);
  }

  private child(): void {
    this.state = 'done';
    this.ask.classList.add('hidden');
    this.msg.textContent = 'Scores can be posted from 13.';
  }

  private async tap(): Promise<void> {
    if (this.state !== 'idle' || !this.file) return;
    const file = this.file;
    this.state = 'posting';
    let band = currentAgeBand();
    if (band === null) band = await askAge();
    if (band === 'child') return this.child();
    const typed = this.nameRow.classList.contains('hidden') ? storedName() : this.name.value;
    const name = normalizeName(typed);
    if (!name) {
      this.state = 'idle';
      this.nameRow.classList.remove('hidden');
      this.msg.textContent = `Pick a nickname for the board (1–${MAX_NAME_LENGTH} characters).`;
      this.name.focus();
      return;
    }
    storeName(name);
    this.post.disabled = true;
    this.post.textContent = 'Posting…';
    this.msg.textContent = '';
    const outcome = await this.send(name, file);
    if (this.state !== 'posting' || this.file !== file) return;
    if (outcome.ok) {
      const played = file.replay.players[0]?.hero ?? 'ranger';
      this.face = dailyFace(outcome.result, name, played);
      this.posted(outcome.result, played);
      return this.reveal(outcome.result);
    }
    this.msg.textContent = postErrorLine(outcome.code);
    if (retryable(outcome.code)) {
      this.state = 'idle';
      this.post.disabled = false;
      this.post.textContent = 'Post my run';
    } else {
      this.state = 'done';
      this.ask.classList.add('hidden');
    }
  }

  /** The rank first, counting up from the bottom of the board, then the rest; the stats last. */
  private reveal(result: PostResult): void {
    this.state = 'done';
    this.ask.classList.add('hidden');
    this.rank.classList.remove('hidden');
    this.gap.textContent = gapLine(result);
    this.best.textContent = bestLine(result);
    this.best.classList.toggle('new', result.improved);
    this.rows.replaceChildren(
      ...result.rows.map((row) => {
        const li = document.createElement('li');
        li.classList.toggle('mine', row.mine);
        const t = rowText(row);
        for (const [cls, text] of [['r', t.rank], ['n', t.name], ['v', t.run]] as const) {
          const span = document.createElement('span');
          span.className = cls;
          span.textContent = text;
          li.append(span);
        }
        return li;
      }),
    );
    const parts = [this.gap, this.best, this.rows, this.shareBtn];
    if (reducedMotion()) {
      this.showPlace(result.rank, result.total);
      for (const el of parts) el.classList.add('in');
      this.prepareCard();
      return;
    }
    this.card.classList.add('daily-revealing');
    for (const el of parts) el.classList.remove('in');
    const from = Math.max(result.rank, result.total);
    const start = performance.now();
    const count = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      this.showPlace(result.rank, result.total, Math.round(from - (from - result.rank) * eased));
      if (t < 1) this.frame = requestAnimationFrame(count);
    };
    this.showPlace(result.rank, result.total, from);
    this.frame = requestAnimationFrame(count);
    this.later(STEPS_MS.gap, () => this.gap.classList.add('in'));
    this.later(STEPS_MS.best, () => this.best.classList.add('in'));
    this.later(STEPS_MS.rows, () => this.rows.classList.add('in'));
    this.later(STEPS_MS.share, () => {
      this.shareBtn.classList.add('in');
      this.prepareCard();
    });
    this.later(STEPS_MS.stats, () => {
      this.showPlace(result.rank, result.total);
      this.card.classList.remove('daily-revealing');
    });
  }

  /** "#14" big, "of 212 · top 7 %" beside it; the whole line for screen readers. */
  private showPlace(rank: number, total: number, shown = rank): void {
    const { num, rest } = rankParts(rank, total, shown);
    this.placeNum.textContent = num;
    this.placeRest.textContent = rest;
    this.place.setAttribute('aria-label', rankLine(rank, total));
  }

  /** The card is drawn as its button comes in, so a tap shares it at once. */
  private prepareCard(): void {
    if (this.face) this.cards.prepare(this.face);
  }

  private async shareCard(): Promise<void> {
    if (!this.face) return;
    const line = outcomeLine(await this.cards.share(this.face));
    if (line) this.toast(line);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    cancelAnimationFrame(this.frame);
    this.state = 'idle';
    this.shown = false;
    this.file = null;
    this.face = null;
    this.cards.forget();
    this.shareBtn.classList.remove('in');
    this.card.classList.remove('daily-revealing');
    this.root.classList.add('hidden');
    this.rank.classList.add('hidden');
    this.msg.textContent = '';
  }
}
