// Today's boards in the lobby (docs/GAME_DESIGN.md "Endless" → The board, "Daily run"): the home card's ribbon of
// today's champions (lobby/ribbon.ts) opens this card in place of the home card, in the lobby's look, one phone screen
// (412 × 839 and 360 × 640: only a list scrolls, if anything does), on the tab of the part tapped (q17). Endless's tab:
// the day and the time left, the ten rows (rank, nickname, hero icon, wave, time), this browser's own row pinned under
// them when it is not in the ten. The Daily run's tab: today's five from GET /daily/today's `top` (your row marked),
// the line the Daily tile shows (how many ran it, when it closes) and "Play the Daily run to get on it". Back. The
// words are endless/board.ts's and daily/text.ts's.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { DAILY_BOARD_CALL, DAILY_BOARD_TITLE, dailyBoardLine, dailyBoardRowText, type DailyToday } from '../daily/text';
import { boardDayLine, pinnedRow, rowText, type EndlessRow, type EndlessToday } from '../endless/board';
import type { RibbonBoard } from '../endless/ribbon';
import { heroIcon, iconVar } from '../render/art/icons';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const isHero = (h: string): h is HeroKind => (HERO_KINDS as readonly string[]).includes(h);

/** The Endless tab's title. */
const ENDLESS_TITLE = 'Endless · today’s top 10';

/** One row: "#1", the hero's icon, the nickname, "Wave 54" or "94 Heart", "41:20". */
function line(t: { rank: string; name: string; score: string; time: string }, hero: string | null, mine: boolean): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.toggle('mine', mine);
  const rank = document.createElement('span');
  rank.className = 'r';
  rank.textContent = t.rank;
  const icon = document.createElement('i');
  icon.className = 'ico hero-ico';
  if (hero && isHero(hero)) icon.style.setProperty('--ico', iconVar(heroIcon(hero)));
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'n';
  name.textContent = t.name;
  const score = document.createElement('span');
  score.className = 'w';
  score.textContent = t.score;
  const time = document.createElement('span');
  time.className = 't';
  time.textContent = t.time;
  li.append(rank, icon, name, score, time);
  return li;
}

function row(r: Pick<EndlessRow, 'rank' | 'name' | 'wave' | 'ticks' | 'mine'> & { hero: string | null }): HTMLLIElement {
  const t = rowText(r);
  return line({ rank: t.rank, name: t.name, score: t.wave, time: t.time }, r.hero, r.mine);
}

export class BoardCard {
  readonly root = $('lobby-board');
  private readonly title = $('lobby-board-title');
  private readonly day = $('lobby-board-day');
  private readonly rows = $('lobby-board-rows');
  private readonly empty = $('lobby-board-empty');
  private readonly you = $('lobby-board-you');
  private readonly dailyRows = $('lobby-board-daily-rows');
  private readonly dailyEmpty = $('lobby-board-daily-empty');
  private readonly dailyLine = $('lobby-board-daily-line');
  private readonly tabs = { endless: $('lobby-board-tab-endless'), daily: $('lobby-board-tab-daily') };
  private readonly panes = { endless: $('lobby-board-endless'), daily: $('lobby-board-daily') };
  private tab: RibbonBoard = 'endless';
  private endless: EndlessToday | null = null;
  private daily: DailyToday | null = null;

  constructor(back: () => void) {
    $('lobby-board-back').addEventListener('click', back);
    $('lobby-board-daily-call').textContent = DAILY_BOARD_CALL;
    this.tabs.endless.addEventListener('click', () => this.show('endless'));
    this.tabs.daily.addEventListener('click', () => this.show('daily'));
  }

  /** Fills the card from today's boards (either may be missing), on `tab`. */
  render(endless: EndlessToday | null, daily: DailyToday | null, tab: RibbonBoard = this.tab, now = Date.now()): void {
    this.endless = endless;
    this.daily = daily;
    // A tab whose board did not answer is not offered.
    this.tabs.endless.classList.toggle('hidden', !endless);
    this.tabs.daily.classList.toggle('hidden', !daily);
    if (endless) {
      this.rows.replaceChildren(...endless.top.map((r) => row(r)));
      this.rows.classList.toggle('hidden', endless.top.length === 0);
      this.empty.classList.toggle('hidden', endless.top.length > 0);
      const pinned = pinnedRow(endless);
      this.you.classList.toggle('hidden', pinned === null);
      this.you.replaceChildren(...(pinned ? [row({ ...pinned, name: 'You', hero: null, mine: true })] : []));
    }
    if (daily) {
      const top = Array.isArray(daily.top) ? daily.top : [];
      this.dailyRows.replaceChildren(...top.map((r) => line(dailyBoardRowText(r), r.hero, r.mine === true)));
      this.dailyRows.classList.toggle('hidden', top.length === 0);
      this.dailyEmpty.classList.toggle('hidden', top.length > 0);
      this.dailyLine.textContent = dailyBoardLine(daily, now);
    }
    this.show(tab === 'daily' ? (daily ? 'daily' : 'endless') : endless ? 'endless' : 'daily', now);
  }

  /** The tab on screen: its title, its day line, its pane. */
  private show(tab: RibbonBoard, now = Date.now()): void {
    this.tab = tab;
    for (const key of ['endless', 'daily'] as const) {
      this.tabs[key].setAttribute('aria-selected', String(key === tab));
      this.tabs[key].classList.toggle('on', key === tab);
      this.panes[key].classList.toggle('hidden', key !== tab);
    }
    this.title.textContent = tab === 'daily' ? DAILY_BOARD_TITLE : ENDLESS_TITLE;
    const today = tab === 'daily' ? this.daily : this.endless;
    this.day.textContent = today ? boardDayLine(today, now) : '';
  }
}
