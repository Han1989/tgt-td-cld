// Endless's board in the lobby (docs/GAME_DESIGN.md "Endless", "The board"): the Mode row's "Today's top 10" link opens
// it in place of the home card, in the lobby's look, one phone screen (412 × 839 and 360 × 640: only the list scrolls,
// if anything does): the day and the time left, the ten rows (rank, nickname, hero icon, wave, time), this browser's
// own row pinned under them when it is not in the ten, and Back. The words are endless/board.ts's.

import { HERO_KINDS, type HeroKind } from '@tdt/protocol';
import { boardDayLine, pinnedRow, rowText, type EndlessRow, type EndlessToday } from '../endless/board';
import { heroIcon, iconVar } from '../render/art/icons';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const isHero = (h: string): h is HeroKind => (HERO_KINDS as readonly string[]).includes(h);

/** One row: "#1", the hero's icon, the nickname, "Wave 54", "41:20". */
function row(r: Pick<EndlessRow, 'rank' | 'name' | 'wave' | 'ticks' | 'mine'> & { hero: string | null }): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.toggle('mine', r.mine);
  const t = rowText(r);
  const rank = document.createElement('span');
  rank.className = 'r';
  rank.textContent = t.rank;
  const icon = document.createElement('i');
  icon.className = 'ico hero-ico';
  if (r.hero && isHero(r.hero)) icon.style.setProperty('--ico', iconVar(heroIcon(r.hero)));
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'n';
  name.textContent = t.name;
  const wave = document.createElement('span');
  wave.className = 'w';
  wave.textContent = t.wave;
  const time = document.createElement('span');
  time.className = 't';
  time.textContent = t.time;
  li.append(rank, icon, name, wave, time);
  return li;
}

export class BoardCard {
  readonly root = $('lobby-board');
  private readonly day = $('lobby-board-day');
  private readonly rows = $('lobby-board-rows');
  private readonly empty = $('lobby-board-empty');
  private readonly you = $('lobby-board-you');

  constructor(back: () => void) {
    $('lobby-board-back').addEventListener('click', back);
  }

  /** Fills the card from today's board. */
  render(today: EndlessToday, now = Date.now()): void {
    this.day.textContent = boardDayLine(today, now);
    this.rows.replaceChildren(...today.top.map((r) => row(r)));
    this.rows.classList.toggle('hidden', today.top.length === 0);
    this.empty.classList.toggle('hidden', today.top.length > 0);
    const pinned = pinnedRow(today);
    this.you.classList.toggle('hidden', pinned === null);
    this.you.replaceChildren(...(pinned ? [row({ ...pinned, name: 'You', hero: null, mine: true })] : []));
  }
}
