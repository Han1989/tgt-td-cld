// Endless's board on the end screen (docs/GAME_DESIGN.md "Endless", "The board"): under "Fallen on wave 46", before the
// stats. What it shows is endless/board.ts's `postPlan`: after the first finished solo Endless match the consent card
// ("Post my Endless runs to the daily board?" Yes, every time / Not now); from 13 to 15 "Post this run to today's
// board?" each time, one tap; a missing nickname once, in the card; once the player said yes, nothing to tap: the run
// posts by itself. The age question comes at the first yes if it was never answered; under 13 nothing is posted and
// no board is shown. A posted run's rank counts up as the Daily run's does ("#3 today · top wave 54", or "Not in
// today's top 10 · #27 of 112"); a failed post says so in one line. An online room's Endless match is never posted:
// "Solo runs post to the board", once in this browser. Posting does not read the Play data switch (docs/ANALYTICS.md
// "Endless board").

import { MAX_NAME_LENGTH, normalizeName, type MatchReport, type Replay } from '@tdt/protocol';
import { currentAgeBand } from '../analytics/age';
import { COUNT_MS } from '../daily/endCard';
import { storedName, storeName } from '../lobby/nickname';
import { askAge } from '../privacy/ageCheck';
import { sharedSettings, type SettingsStore } from '../settings';
import { postEndlessRun, type EndlessPostOutcome } from './api';
import {
  afterYes,
  bestStandsLine,
  cardCopy,
  CHILD_LINE,
  postErrorLine,
  postPlan,
  POSTING_LINE,
  rankLine,
  rankParts,
  ROOM_LINE,
  type EndlessPostResult,
  type PostPlan,
} from './board';

type MatchFile = { report: MatchReport; replay: Replay };
type Post = (name: string, file: MatchFile) => Promise<EndlessPostOutcome>;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What the HUD tells the card on every update. */
export interface EndlessEndState {
  /** The end card is up. */
  over: boolean;
  /** The match is Endless. */
  endless: boolean;
  /** The match ran on this device (not an online room). */
  solo: boolean;
  /** The host's report and replay, once in. */
  file: MatchFile | null;
}

export class EndlessEndCard {
  private readonly root = $('end-board');
  private readonly ask = $('end-board-ask');
  private readonly question = $('end-board-q');
  private readonly nameRow = $('end-board-name-row');
  private readonly name = $('end-board-name') as HTMLInputElement;
  private readonly yes = $('end-board-yes') as HTMLButtonElement;
  private readonly no = $('end-board-no') as HTMLButtonElement;
  private readonly msg = $('end-board-msg');
  private readonly rank = $('end-board-rank');
  private readonly place = $('end-board-place');
  private readonly placeLead = document.createElement('span');
  private readonly placeNum = document.createElement('b');
  private readonly placeRest = document.createElement('span');
  private readonly best = $('end-board-best');

  private plan: PostPlan | null = null;
  private file: MatchFile | null = null;
  /** idle: the card waits for a tap; posting: waiting for the server; done: posted, refused or nothing to do. */
  private state: 'idle' | 'posting' | 'done' = 'idle';
  private frame = 0;

  /**
   * `server`: the build has a game server (else nothing shows). `onRank` gets the rank of a run that posted (the share
   * card adds "#3 today").
   */
  constructor(
    private readonly server: () => boolean,
    private readonly onRank: (rank: number) => void = () => {},
    private readonly send: Post = postEndlessRun,
    private readonly settings: SettingsStore = sharedSettings(),
  ) {
    this.name.maxLength = MAX_NAME_LENGTH;
    this.placeLead.className = 'lead';
    this.placeNum.className = 'num';
    this.placeRest.className = 'rest';
    this.place.replaceChildren(this.placeLead, this.placeNum, this.placeRest);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.yes.addEventListener('click', () => void this.tapYes());
    this.no.addEventListener('click', () => this.tapNo());
    this.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.tapYes();
    });
  }

  /** Every HUD update. The plan is made once per finished match, when the end card is up (and, solo, the replay is in). */
  sync(now: EndlessEndState): void {
    if (!now.over || !now.endless) {
      if (this.plan !== null) this.reset();
      return;
    }
    if (this.plan !== null || (now.solo && !now.file)) return;
    this.file = now.file;
    const named = normalizeName(storedName()) !== null;
    this.plan = postPlan({
      server: this.server(),
      solo: now.solo,
      replay: now.file?.replay ?? null,
      endless: true,
      age: currentAgeBand(),
      setting: this.settings.get().endlessPost,
      named,
    });
    switch (this.plan) {
      case 'none':
        return;
      case 'room':
        if (this.settings.get().endlessRoomLine === 'seen') return;
        this.settings.set({ endlessRoomLine: 'seen' });
        this.show();
        this.ask.classList.add('hidden');
        this.msg.textContent = ROOM_LINE;
        return;
      case 'post':
        this.show();
        void this.post(normalizeName(storedName())!);
        return;
      default: {
        this.show();
        const copy = cardCopy(this.plan);
        this.question.textContent = copy.question;
        this.yes.textContent = copy.yes;
        this.yes.disabled = false;
        this.no.textContent = copy.no ?? '';
        this.no.classList.toggle('hidden', copy.no === null);
        this.name.value = storedName();
        this.nameRow.classList.toggle('hidden', named);
        this.ask.classList.remove('hidden');
      }
    }
  }

  private show(): void {
    this.state = 'idle';
    this.root.classList.remove('hidden');
    this.rank.classList.add('hidden');
    this.msg.textContent = '';
  }

  /** Yes, every time / Post this run / Post: the age if never asked, the nickname if none, then the post. */
  private async tapYes(): Promise<void> {
    if (this.state !== 'idle' || !this.file) return;
    const plan = this.plan;
    this.state = 'posting';
    const band = currentAgeBand() ?? (await askAge());
    if (this.plan !== plan) return;
    const yes = afterYes(band);
    if (yes === 'never') return this.end(CHILD_LINE);
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
    if (yes === 'always' && this.settings.get().endlessPost !== 'on') this.settings.set({ endlessPost: 'on' });
    await this.post(name);
  }

  /** Not now: no post, and no card again (⚙ Settings → Play data turns it on). */
  private tapNo(): void {
    if (this.state !== 'idle') return;
    this.settings.set({ endlessPost: 'off' });
    this.end('Not posted. ⚙ Settings → Play data can turn it on.');
  }

  private end(line: string): void {
    this.state = 'done';
    this.ask.classList.add('hidden');
    this.msg.textContent = line;
  }

  private async post(name: string): Promise<void> {
    const file = this.file;
    if (!file) return;
    this.state = 'posting';
    this.ask.classList.add('hidden');
    this.msg.textContent = POSTING_LINE;
    const outcome = await this.send(name, file);
    if (this.file !== file || this.state !== 'posting') return;
    if (!outcome.ok) return this.end(postErrorLine(outcome.code));
    this.end('');
    this.reveal(outcome.result);
  }

  /** The rank, counting up from the bottom of the board over about a second; the best that stands under it. */
  private reveal(result: EndlessPostResult): void {
    this.rank.classList.remove('hidden');
    const stands = bestStandsLine(result);
    this.best.textContent = stands ?? '';
    this.best.classList.toggle('hidden', stands === null);
    this.place.setAttribute('aria-label', rankLine(result));
    const rank = result.you?.rank ?? result.runs;
    this.onRank(rank);
    if (reducedMotion()) return this.showPlace(result, rank);
    const from = Math.max(rank, result.runs);
    const start = performance.now();
    const count = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      this.showPlace(result, Math.round(from - (from - rank) * eased));
      if (t < 1) this.frame = requestAnimationFrame(count);
    };
    this.showPlace(result, from);
    this.frame = requestAnimationFrame(count);
  }

  private showPlace(result: EndlessPostResult, shown: number): void {
    const { lead, num, rest } = rankParts(result, shown);
    this.placeLead.textContent = lead ? `${lead} ` : '';
    this.placeNum.textContent = num;
    this.placeRest.textContent = ` ${rest}`;
  }

  private reset(): void {
    cancelAnimationFrame(this.frame);
    this.plan = null;
    this.file = null;
    this.state = 'idle';
    this.root.classList.add('hidden');
    this.rank.classList.add('hidden');
    this.msg.textContent = '';
  }
}
